import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import {
  productConfig,
  roomCodeAlphabet,
  roomCodeSchema,
  type ControllerStatus,
  type DisplaySessionCredentials,
  type DisplayState,
  type PlayerSessionCredentials,
  type PlayerState,
  type RoomErrorCode,
  type RoomSettings,
  type RoomState,
} from '@words/shared';

type InternalDisplay = {
  id: string;
  connected: boolean;
  createdAt: number;
  reconnectToken: string | null;
  socketId: string | null;
  disconnectExpiresAt: number | null;
};

type InternalPlayer = {
  id: string;
  displayName: string;
  connected: boolean;
  joinedAt: number;
  reconnectToken: string | null;
  socketId: string | null;
  disconnectExpiresAt: number | null;
};

type InternalRoom = {
  code: string;
  phase: 'LOBBY';
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  display: InternalDisplay;
  controllerStatus: ControllerStatus;
  controllerPlayerId: string | null;
  players: Map<string, InternalPlayer>;
  settings: RoomSettings;
};

type DisplaySessionReference = {
  roomCode: string;
  displaySessionId: string;
};

type PlayerSessionReference = {
  roomCode: string;
  playerId: string;
};

export type BoundDisplaySession = {
  role: 'display';
  roomCode: string;
  displaySessionId: string;
};

export type BoundPlayerSession = {
  role: 'player';
  roomCode: string;
  playerId: string;
};

export type BoundSession = BoundDisplaySession | BoundPlayerSession;

export type DisplaySessionResult = {
  room: RoomState;
  session: DisplaySessionCredentials;
  display: DisplayState;
  replacedSocketId: string | null;
};

export type PlayerSessionResult = {
  room: RoomState;
  session: PlayerSessionCredentials;
  player: PlayerState;
  replacedSocketId: string | null;
};

export type RoomPresenceResult =
  | {
      role: 'display';
      room: RoomState;
      display: DisplayState;
    }
  | {
      role: 'player';
      room: RoomState;
      player: PlayerState;
    };

export type LeaveResult =
  | {
      role: 'display';
      roomCode: string;
      room: RoomState;
      display: DisplayState;
    }
  | {
      role: 'player';
      roomCode: string;
      room: RoomState;
      player: PlayerState;
    };

export type CleanupResult = {
  deletedRoomCodes: string[];
  updatedRoomCodes: string[];
};

export type ControllerActionResult = {
  room: RoomState;
};

export type RoomStoreOptions = {
  maxPlayers: number;
  maxRooms: number;
  roomTtlMs: number;
  reconnectGraceMs: number;
  now?: () => number;
  roomCodeGenerator?: () => string;
  displaySessionIdGenerator?: () => string;
  playerIdGenerator?: () => string;
  reconnectTokenGenerator?: () => string;
};

export class RoomOperationError extends Error {
  constructor(
    readonly code: RoomErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RoomOperationError';
  }
}

function defaultRoomCodeGenerator(): string {
  return Array.from(
    { length: productConfig.roomCodeLength },
    () => roomCodeAlphabet[randomInt(roomCodeAlphabet.length)],
  ).join('');
}

function defaultReconnectTokenGenerator(): string {
  return randomBytes(32).toString('base64url');
}

function comparePlayersByJoinOrder(
  left: InternalPlayer,
  right: InternalPlayer,
): number {
  const joinedAtDifference = left.joinedAt - right.joinedAt;
  return joinedAtDifference || left.id.localeCompare(right.id);
}

export class RoomStore {
  private readonly rooms = new Map<string, InternalRoom>();
  private readonly displaySessions = new Map<string, DisplaySessionReference>();
  private readonly playerSessions = new Map<string, PlayerSessionReference>();
  private readonly expiredRoomCodes = new Map<string, number>();
  private readonly now: () => number;
  private readonly roomCodeGenerator: () => string;
  private readonly displaySessionIdGenerator: () => string;
  private readonly playerIdGenerator: () => string;
  private readonly reconnectTokenGenerator: () => string;

  constructor(private readonly options: RoomStoreOptions) {
    this.now = options.now ?? Date.now;
    this.roomCodeGenerator =
      options.roomCodeGenerator ?? defaultRoomCodeGenerator;
    this.displaySessionIdGenerator =
      options.displaySessionIdGenerator ?? randomUUID;
    this.playerIdGenerator = options.playerIdGenerator ?? randomUUID;
    this.reconnectTokenGenerator =
      options.reconnectTokenGenerator ?? defaultReconnectTokenGenerator;
  }

  createDisplay(socketId: string): DisplaySessionResult {
    if (this.rooms.size >= this.options.maxRooms) {
      throw new RoomOperationError(
        'SERVER_BUSY',
        'The server has reached its temporary room limit. Try again later.',
      );
    }

    const now = this.now();
    const code = this.createUniqueRoomCode();
    const display = this.createDisplaySession(socketId, now);
    const room: InternalRoom = {
      code,
      phase: 'LOBBY',
      createdAt: now,
      lastActivityAt: now,
      expiresAt: now + this.options.roomTtlMs,
      display,
      controllerStatus: 'none',
      controllerPlayerId: null,
      players: new Map(),
      settings: {
        gridSize: productConfig.defaultGridSize,
        roundDurationSeconds: productConfig.defaultRoundDurationSeconds,
        scoringMode: productConfig.defaultScoringMode,
      },
    };

    this.rooms.set(code, room);
    const displayReconnectToken = display.reconnectToken;
    if (!displayReconnectToken) {
      throw new RoomOperationError(
        'INTERNAL_ERROR',
        'The display session could not be created.',
      );
    }
    this.displaySessions.set(displayReconnectToken, {
      roomCode: code,
      displaySessionId: display.id,
    });

    return this.createDisplayResult(room, display);
  }

  joinPlayer(
    roomCode: string,
    displayName: string,
    socketId: string,
  ): PlayerSessionResult {
    const room = this.requireActiveRoom(roomCode);

    if (room.players.size >= this.options.maxPlayers) {
      throw new RoomOperationError(
        'ROOM_FULL',
        'That room already has the maximum number of players.',
      );
    }

    const duplicateName = [...room.players.values()].some(
      (player) =>
        player.displayName.localeCompare(displayName, undefined, {
          sensitivity: 'base',
        }) === 0,
    );

    if (duplicateName) {
      throw new RoomOperationError(
        'INVALID_NAME',
        'Choose a different display name for this room.',
      );
    }

    const now = this.now();
    const player = this.createPlayer(displayName, socketId, now);
    room.players.set(player.id, player);
    const playerReconnectToken = player.reconnectToken;
    if (!playerReconnectToken) {
      throw new RoomOperationError(
        'INTERNAL_ERROR',
        'The player session could not be created.',
      );
    }
    this.playerSessions.set(playerReconnectToken, {
      roomCode: room.code,
      playerId: player.id,
    });

    if (room.controllerPlayerId === null) {
      this.assignEarliestConnectedController(room);
    }

    this.touch(room, now);

    return this.createPlayerResult(room, player);
  }

  transferController(
    session: BoundPlayerSession,
    targetPlayerId: string,
    socketId: string,
  ): ControllerActionResult {
    const room = this.requireActiveRoom(session.roomCode);
    const requester = room.players.get(session.playerId);

    if (!requester || !requester.connected || requester.socketId !== socketId) {
      throw new RoomOperationError(
        'UNAUTHORIZED',
        'That player session is no longer authorized for this room.',
      );
    }

    if (
      room.controllerStatus !== 'assigned' ||
      room.controllerPlayerId !== requester.id
    ) {
      throw new RoomOperationError(
        'NOT_CONTROLLER',
        'Only the current game host can transfer control.',
      );
    }

    const target = room.players.get(targetPlayerId);
    if (!target) {
      throw new RoomOperationError(
        'TARGET_PLAYER_NOT_FOUND',
        'Choose a player who is currently in this room.',
      );
    }

    if (target.id === requester.id) {
      throw new RoomOperationError(
        'TARGET_ALREADY_CONTROLLER',
        'That player is already the game host.',
      );
    }

    if (!target.connected || !target.socketId) {
      throw new RoomOperationError(
        'TARGET_PLAYER_OFFLINE',
        'Choose a connected player to become the game host.',
      );
    }

    room.controllerPlayerId = target.id;
    room.controllerStatus = 'assigned';
    this.touch(room, this.now());

    return { room: this.toRoomState(room) };
  }

  reconnectDisplay(
    roomCode: string,
    displayReconnectToken: string,
    socketId: string,
  ): DisplaySessionResult {
    const room = this.requireActiveRoom(roomCode);
    const session = this.displaySessions.get(displayReconnectToken);

    if (
      !session ||
      session.roomCode !== room.code ||
      session.displaySessionId !== room.display.id
    ) {
      throw new RoomOperationError(
        'RECONNECT_FAILED',
        'That display reconnect credential is no longer valid.',
      );
    }

    const now = this.now();
    const display = room.display;

    if (
      display.reconnectToken !== displayReconnectToken ||
      (display.disconnectExpiresAt !== null &&
        display.disconnectExpiresAt < now)
    ) {
      this.displaySessions.delete(displayReconnectToken);
      throw new RoomOperationError(
        'RECONNECT_FAILED',
        'That display reconnect credential has expired.',
      );
    }

    const replacedSocketId = display.socketId;
    this.displaySessions.delete(displayReconnectToken);
    display.reconnectToken = this.createReconnectToken(displayReconnectToken);
    display.socketId = socketId;
    display.connected = true;
    display.disconnectExpiresAt = null;
    this.displaySessions.set(display.reconnectToken, {
      roomCode: room.code,
      displaySessionId: display.id,
    });
    this.touch(room, now);

    return this.createDisplayResult(room, display, replacedSocketId);
  }

  reconnectPlayer(
    roomCode: string,
    playerReconnectToken: string,
    socketId: string,
  ): PlayerSessionResult {
    const room = this.requireActiveRoom(roomCode);
    const session = this.playerSessions.get(playerReconnectToken);

    if (!session || session.roomCode !== room.code) {
      throw new RoomOperationError(
        'RECONNECT_FAILED',
        'That player reconnect credential is no longer valid.',
      );
    }

    const player = room.players.get(session.playerId);
    const now = this.now();

    if (
      !player ||
      player.reconnectToken !== playerReconnectToken ||
      (player.disconnectExpiresAt !== null && player.disconnectExpiresAt < now)
    ) {
      this.playerSessions.delete(playerReconnectToken);
      throw new RoomOperationError(
        'RECONNECT_FAILED',
        'That player reconnect credential has expired.',
      );
    }

    const replacedSocketId = player.socketId;
    this.playerSessions.delete(playerReconnectToken);
    player.reconnectToken = this.createReconnectToken(playerReconnectToken);
    player.socketId = socketId;
    player.connected = true;
    player.disconnectExpiresAt = null;
    this.playerSessions.set(player.reconnectToken, {
      roomCode: room.code,
      playerId: player.id,
    });
    if (room.controllerPlayerId === null) {
      this.assignEarliestConnectedController(room);
    }
    this.touch(room, now);

    return this.createPlayerResult(room, player, replacedSocketId);
  }

  disconnect(
    session: BoundSession,
    socketId: string,
  ): RoomPresenceResult | null {
    const room = this.rooms.get(session.roomCode);

    if (!room) {
      return null;
    }

    const now = this.now();

    if (session.role === 'display') {
      const display = room.display;
      if (
        display.id !== session.displaySessionId ||
        display.socketId !== socketId
      ) {
        return null;
      }

      display.connected = false;
      display.socketId = null;
      display.disconnectExpiresAt = now + this.options.reconnectGraceMs;
      this.touch(room, now);

      return {
        role: 'display',
        room: this.toRoomState(room),
        display: this.toDisplayState(display),
      };
    }

    const player = room.players.get(session.playerId);
    if (!player || player.socketId !== socketId) {
      return null;
    }

    player.connected = false;
    player.socketId = null;
    player.disconnectExpiresAt = now + this.options.reconnectGraceMs;
    this.touch(room, now);

    return {
      role: 'player',
      room: this.toRoomState(room),
      player: this.toPlayerState(room, player),
    };
  }

  leave(session: BoundSession, socketId: string): LeaveResult | null {
    const room = this.rooms.get(session.roomCode);

    if (!room) {
      return null;
    }

    if (session.role === 'display') {
      const display = room.display;
      if (
        display.id !== session.displaySessionId ||
        display.socketId !== socketId
      ) {
        return null;
      }

      if (display.reconnectToken) {
        this.displaySessions.delete(display.reconnectToken);
      }
      display.connected = false;
      display.socketId = null;
      display.reconnectToken = null;
      display.disconnectExpiresAt = null;
      this.touch(room, this.now());

      return {
        role: 'display',
        roomCode: room.code,
        room: this.toRoomState(room),
        display: this.toDisplayState(display),
      };
    }

    const player = room.players.get(session.playerId);
    if (!player || player.socketId !== socketId) {
      return null;
    }

    const now = this.now();
    const playerState = {
      ...this.toPlayerState(room, player),
      connected: false,
    };

    this.invalidatePlayerCredential(player);
    room.players.delete(player.id);

    if (player.id === room.controllerPlayerId) {
      this.assignEarliestConnectedController(room);
    }

    this.touch(room, now);

    return {
      role: 'player',
      roomCode: room.code,
      room: this.toRoomState(room),
      player: playerState,
    };
  }

  cleanupExpired(): CleanupResult {
    const now = this.now();
    const deletedRoomCodes: string[] = [];
    const updatedRoomCodes = new Set<string>();

    this.pruneExpiredCodeTombstones(now);

    for (const room of [...this.rooms.values()]) {
      if (room.expiresAt <= now) {
        deletedRoomCodes.push(room.code);
        this.deleteRoom(room, now, true);
        continue;
      }

      const display = room.display;
      if (
        !display.connected &&
        display.disconnectExpiresAt !== null &&
        display.disconnectExpiresAt <= now
      ) {
        if (display.reconnectToken) {
          this.displaySessions.delete(display.reconnectToken);
        }
        display.reconnectToken = null;
        display.disconnectExpiresAt = null;
        updatedRoomCodes.add(room.code);
      }

      const expiredPlayers = [...room.players.values()].filter(
        (player) =>
          !player.connected &&
          player.disconnectExpiresAt !== null &&
          player.disconnectExpiresAt <= now,
      );

      let removedController = false;

      for (const player of expiredPlayers) {
        this.invalidatePlayerCredential(player);
        room.players.delete(player.id);

        if (player.id === room.controllerPlayerId) {
          removedController = true;
        }
        updatedRoomCodes.add(room.code);
      }

      if (removedController) {
        this.assignEarliestConnectedController(room);
      }

      if (
        room.players.size === 0 &&
        !display.connected &&
        display.reconnectToken === null
      ) {
        deletedRoomCodes.push(room.code);
        updatedRoomCodes.delete(room.code);
        this.deleteRoom(room, now, true);
      }
    }

    return {
      deletedRoomCodes,
      updatedRoomCodes: [...updatedRoomCodes],
    };
  }

  getRoomState(roomCode: string): RoomState | null {
    const room = this.rooms.get(roomCode);
    return room ? this.toRoomState(room) : null;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  private createUniqueRoomCode(): string {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const parsedCode = roomCodeSchema.safeParse(this.roomCodeGenerator());

      if (parsedCode.success && !this.rooms.has(parsedCode.data)) {
        return parsedCode.data;
      }
    }

    throw new RoomOperationError(
      'SERVER_BUSY',
      'A room code could not be allocated. Try again.',
    );
  }

  private createReconnectToken(previousToken?: string): string {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const token = this.reconnectTokenGenerator();
      if (
        token !== previousToken &&
        !this.displaySessions.has(token) &&
        !this.playerSessions.has(token)
      ) {
        return token;
      }
    }

    throw new RoomOperationError(
      'SERVER_BUSY',
      'A temporary reconnect credential could not be allocated.',
    );
  }

  private createDisplaySession(socketId: string, now: number): InternalDisplay {
    return {
      id: this.displaySessionIdGenerator(),
      connected: true,
      createdAt: now,
      reconnectToken: this.createReconnectToken(),
      socketId,
      disconnectExpiresAt: null,
    };
  }

  private createPlayer(
    displayName: string,
    socketId: string,
    now: number,
  ): InternalPlayer {
    return {
      id: this.playerIdGenerator(),
      displayName,
      connected: true,
      joinedAt: now,
      reconnectToken: this.createReconnectToken(),
      socketId,
      disconnectExpiresAt: null,
    };
  }

  private requireActiveRoom(roomCode: string): InternalRoom {
    const now = this.now();
    this.pruneExpiredCodeTombstones(now);
    const room = this.rooms.get(roomCode);

    if (!room) {
      if ((this.expiredRoomCodes.get(roomCode) ?? 0) > now) {
        throw new RoomOperationError(
          'ROOM_EXPIRED',
          'That temporary room has expired.',
        );
      }

      throw new RoomOperationError(
        'ROOM_NOT_FOUND',
        'No active room uses that code.',
      );
    }

    if (room.expiresAt <= now) {
      this.deleteRoom(room, now, true);
      throw new RoomOperationError(
        'ROOM_EXPIRED',
        'That temporary room has expired.',
      );
    }

    return room;
  }

  private createDisplayResult(
    room: InternalRoom,
    display: InternalDisplay,
    replacedSocketId: string | null = null,
  ): DisplaySessionResult {
    if (!display.reconnectToken) {
      throw new RoomOperationError(
        'RECONNECT_FAILED',
        'That display reconnect credential is no longer valid.',
      );
    }

    return {
      room: this.toRoomState(room),
      display: this.toDisplayState(display),
      replacedSocketId,
      session: {
        displaySessionId: display.id,
        displayReconnectToken: display.reconnectToken,
      },
    };
  }

  private createPlayerResult(
    room: InternalRoom,
    player: InternalPlayer,
    replacedSocketId: string | null = null,
  ): PlayerSessionResult {
    if (!player.reconnectToken) {
      throw new RoomOperationError(
        'RECONNECT_FAILED',
        'That player reconnect credential is no longer valid.',
      );
    }

    return {
      room: this.toRoomState(room),
      player: this.toPlayerState(room, player),
      replacedSocketId,
      session: {
        playerId: player.id,
        playerReconnectToken: player.reconnectToken,
      },
    };
  }

  private toRoomState(room: InternalRoom): RoomState {
    return {
      code: room.code,
      phase: room.phase,
      createdAt: new Date(room.createdAt).toISOString(),
      lastActivityAt: new Date(room.lastActivityAt).toISOString(),
      expiresAt: new Date(room.expiresAt).toISOString(),
      maxPlayers: this.options.maxPlayers,
      display: this.toDisplayState(room.display),
      controllerStatus: room.controllerStatus,
      controllerPlayerId: room.controllerPlayerId,
      players: [...room.players.values()]
        .sort(comparePlayersByJoinOrder)
        .map((player) => this.toPlayerState(room, player)),
      settings: room.settings,
    };
  }

  private toDisplayState(display: InternalDisplay): DisplayState {
    return {
      connected: display.connected,
      createdAt: new Date(display.createdAt).toISOString(),
    };
  }

  private toPlayerState(
    room: InternalRoom,
    player: InternalPlayer,
  ): PlayerState {
    return {
      id: player.id,
      displayName: player.displayName,
      connected: player.connected,
      joinedAt: new Date(player.joinedAt).toISOString(),
      isController: player.id === room.controllerPlayerId,
    };
  }

  private touch(room: InternalRoom, now: number): void {
    room.lastActivityAt = now;
    room.expiresAt = now + this.options.roomTtlMs;
  }

  private assignEarliestConnectedController(room: InternalRoom): void {
    const nextController = [...room.players.values()]
      .filter((player) => player.connected && player.socketId !== null)
      .sort(comparePlayersByJoinOrder)[0];

    room.controllerPlayerId = nextController?.id ?? null;
    room.controllerStatus = nextController ? 'assigned' : 'none';
  }

  private invalidatePlayerCredential(player: InternalPlayer): void {
    if (player.reconnectToken) {
      this.playerSessions.delete(player.reconnectToken);
    }
    player.connected = false;
    player.socketId = null;
    player.reconnectToken = null;
    player.disconnectExpiresAt = null;
  }

  private deleteRoom(
    room: InternalRoom,
    now: number,
    rememberExpiration: boolean,
  ): void {
    if (room.display.reconnectToken) {
      this.displaySessions.delete(room.display.reconnectToken);
    }
    for (const player of room.players.values()) {
      if (player.reconnectToken) {
        this.playerSessions.delete(player.reconnectToken);
      }
    }

    this.rooms.delete(room.code);

    if (rememberExpiration) {
      if (
        !this.expiredRoomCodes.has(room.code) &&
        this.expiredRoomCodes.size >= this.options.maxRooms
      ) {
        const oldestCode = this.expiredRoomCodes.keys().next().value;
        if (oldestCode) {
          this.expiredRoomCodes.delete(oldestCode);
        }
      }

      this.expiredRoomCodes.set(room.code, now + this.options.reconnectGraceMs);
    }
  }

  private pruneExpiredCodeTombstones(now: number): void {
    for (const [code, expiresAt] of this.expiredRoomCodes) {
      if (expiresAt <= now) {
        this.expiredRoomCodes.delete(code);
      }
    }
  }
}
