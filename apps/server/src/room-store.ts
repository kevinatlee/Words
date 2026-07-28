import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import {
  productConfig,
  roomCodeAlphabet,
  roomCodeSchema,
  type PlayerState,
  type RoomErrorCode,
  type RoomSettings,
  type RoomState,
  type SessionCredentials,
} from '@words/shared';

type InternalPlayer = {
  id: string;
  displayName: string;
  connected: boolean;
  joinedAt: number;
  reconnectToken: string;
  socketId: string | null;
  disconnectExpiresAt: number | null;
};

type InternalRoom = {
  code: string;
  phase: 'LOBBY';
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  hostPlayerId: string;
  players: Map<string, InternalPlayer>;
  settings: RoomSettings;
};

type SessionReference = {
  roomCode: string;
  playerId: string;
};

export type BoundSession = {
  roomCode: string;
  playerId: string;
};

export type RoomSessionResult = {
  room: RoomState;
  session: SessionCredentials;
  player: PlayerState;
  replacedSocketId: string | null;
};

export type RoomPresenceResult = {
  room: RoomState;
  player: PlayerState;
};

export type LeaveResult = {
  roomCode: string;
  deletedRoom: boolean;
  room: RoomState | null;
  player: PlayerState;
};

export type CleanupResult = {
  deletedRoomCodes: string[];
  updatedRoomCodes: string[];
};

export type RoomStoreOptions = {
  maxPlayers: number;
  maxRooms: number;
  roomTtlMs: number;
  reconnectGraceMs: number;
  now?: () => number;
  roomCodeGenerator?: () => string;
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

export class RoomStore {
  private readonly rooms = new Map<string, InternalRoom>();
  private readonly sessions = new Map<string, SessionReference>();
  private readonly expiredRoomCodes = new Map<string, number>();
  private readonly now: () => number;
  private readonly roomCodeGenerator: () => string;
  private readonly playerIdGenerator: () => string;
  private readonly reconnectTokenGenerator: () => string;

  constructor(private readonly options: RoomStoreOptions) {
    this.now = options.now ?? Date.now;
    this.roomCodeGenerator =
      options.roomCodeGenerator ?? defaultRoomCodeGenerator;
    this.playerIdGenerator = options.playerIdGenerator ?? randomUUID;
    this.reconnectTokenGenerator =
      options.reconnectTokenGenerator ?? defaultReconnectTokenGenerator;
  }

  createRoom(displayName: string, socketId: string): RoomSessionResult {
    if (this.rooms.size >= this.options.maxRooms) {
      throw new RoomOperationError(
        'SERVER_BUSY',
        'The server has reached its temporary room limit. Try again later.',
      );
    }

    const now = this.now();
    const code = this.createUniqueRoomCode();
    const player = this.createPlayer(displayName, socketId, now);
    const room: InternalRoom = {
      code,
      phase: 'LOBBY',
      createdAt: now,
      lastActivityAt: now,
      expiresAt: now + this.options.roomTtlMs,
      hostPlayerId: player.id,
      players: new Map([[player.id, player]]),
      settings: {
        gridSize: productConfig.defaultGridSize,
        roundDurationSeconds: productConfig.defaultRoundDurationSeconds,
        scoringMode: productConfig.defaultScoringMode,
      },
    };

    this.rooms.set(code, room);
    this.sessions.set(player.reconnectToken, {
      roomCode: code,
      playerId: player.id,
    });

    return this.createSessionResult(room, player);
  }

  joinRoom(
    roomCode: string,
    displayName: string,
    socketId: string,
  ): RoomSessionResult {
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
    this.sessions.set(player.reconnectToken, {
      roomCode: room.code,
      playerId: player.id,
    });
    this.touch(room, now);

    return this.createSessionResult(room, player);
  }

  reconnectRoom(
    roomCode: string,
    reconnectToken: string,
    socketId: string,
  ): RoomSessionResult {
    const room = this.requireActiveRoom(roomCode);
    const session = this.sessions.get(reconnectToken);

    if (!session || session.roomCode !== room.code) {
      throw new RoomOperationError(
        'RECONNECT_FAILED',
        'That temporary reconnect session is no longer valid.',
      );
    }

    const player = room.players.get(session.playerId);
    const now = this.now();

    if (
      !player ||
      (player.disconnectExpiresAt !== null && player.disconnectExpiresAt <= now)
    ) {
      this.sessions.delete(reconnectToken);
      throw new RoomOperationError(
        'RECONNECT_FAILED',
        'That temporary reconnect session has expired.',
      );
    }

    const replacedSocketId = player.socketId;
    this.sessions.delete(reconnectToken);
    player.reconnectToken = this.reconnectTokenGenerator();
    player.socketId = socketId;
    player.connected = true;
    player.disconnectExpiresAt = null;
    this.sessions.set(player.reconnectToken, {
      roomCode: room.code,
      playerId: player.id,
    });
    this.touch(room, now);

    return this.createSessionResult(room, player, replacedSocketId);
  }

  disconnect(
    session: BoundSession,
    socketId: string,
  ): RoomPresenceResult | null {
    const room = this.rooms.get(session.roomCode);
    const player = room?.players.get(session.playerId);

    if (!room || !player || player.socketId !== socketId) {
      return null;
    }

    const now = this.now();
    player.connected = false;
    player.socketId = null;
    player.disconnectExpiresAt = now + this.options.reconnectGraceMs;
    this.touch(room, now);

    return {
      room: this.toRoomState(room),
      player: this.toPlayerState(room, player),
    };
  }

  leave(session: BoundSession, socketId: string): LeaveResult | null {
    const room = this.rooms.get(session.roomCode);
    const player = room?.players.get(session.playerId);

    if (!room || !player || player.socketId !== socketId) {
      return null;
    }

    const playerState = {
      ...this.toPlayerState(room, player),
      connected: false,
    };
    const isHost = player.id === room.hostPlayerId;

    if (isHost) {
      this.deleteRoom(room, this.now(), true);
      return {
        roomCode: room.code,
        deletedRoom: true,
        room: null,
        player: playerState,
      };
    }

    this.sessions.delete(player.reconnectToken);
    room.players.delete(player.id);
    this.touch(room, this.now());

    return {
      roomCode: room.code,
      deletedRoom: false,
      room: this.toRoomState(room),
      player: playerState,
    };
  }

  cleanupExpired(): CleanupResult {
    const now = this.now();
    const deletedRoomCodes: string[] = [];
    const updatedRoomCodes: string[] = [];

    this.pruneExpiredCodeTombstones(now);

    for (const room of [...this.rooms.values()]) {
      if (room.expiresAt <= now) {
        deletedRoomCodes.push(room.code);
        this.deleteRoom(room, now, true);
        continue;
      }

      const expiredPlayers = [...room.players.values()].filter(
        (player) =>
          !player.connected &&
          player.disconnectExpiresAt !== null &&
          player.disconnectExpiresAt <= now,
      );

      if (expiredPlayers.some((player) => player.id === room.hostPlayerId)) {
        deletedRoomCodes.push(room.code);
        this.deleteRoom(room, now, true);
        continue;
      }

      if (expiredPlayers.length > 0) {
        for (const player of expiredPlayers) {
          this.sessions.delete(player.reconnectToken);
          room.players.delete(player.id);
        }
        this.touch(room, now);
        updatedRoomCodes.push(room.code);
      }

      if (room.players.size === 0) {
        deletedRoomCodes.push(room.code);
        this.deleteRoom(room, now, true);
      }
    }

    return { deletedRoomCodes, updatedRoomCodes };
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
      reconnectToken: this.reconnectTokenGenerator(),
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

  private createSessionResult(
    room: InternalRoom,
    player: InternalPlayer,
    replacedSocketId: string | null = null,
  ): RoomSessionResult {
    return {
      room: this.toRoomState(room),
      player: this.toPlayerState(room, player),
      replacedSocketId,
      session: {
        playerId: player.id,
        reconnectToken: player.reconnectToken,
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
      players: [...room.players.values()]
        .sort((left, right) => left.joinedAt - right.joinedAt)
        .map((player) => this.toPlayerState(room, player)),
      settings: room.settings,
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
      isHost: player.id === room.hostPlayerId,
    };
  }

  private touch(room: InternalRoom, now: number): void {
    room.lastActivityAt = now;
    room.expiresAt = now + this.options.roomTtlMs;
  }

  private deleteRoom(
    room: InternalRoom,
    now: number,
    rememberExpiration: boolean,
  ): void {
    for (const player of room.players.values()) {
      this.sessions.delete(player.reconnectToken);
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
