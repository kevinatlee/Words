import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import {
  scoreTraditionalWord,
  validateWordPath,
  type TraditionalScoringResult,
  type WordDictionary,
} from '@words/game-engine';
import {
  maximumAcceptedWordsPerPlayerPerRound,
  playerRoundSubmissionStateSchema,
  productConfig,
  maximumRoundGenerationAttempts,
  roomCodeAlphabet,
  roomCodeSchema,
  roomSettingsSchema,
  roundStateSchema,
  type ControllerStatus,
  type AcceptedWord,
  type DisplaySessionCredentials,
  type DisplayState,
  type GridSize,
  type PlayerSessionCredentials,
  type PlayerRoundSubmissionState,
  type PlayerState,
  type RoomPhase,
  type RoomErrorCode,
  type RoomSettings,
  type RoomState,
  type RoundState,
  type SubmissionError,
  type SubmitWordInput,
  type SubmitWordResponse,
} from '@words/shared';

import { createSafeClock } from './safe-clock.js';

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
  phase: RoomPhase;
  stateVersion: number;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  display: InternalDisplay;
  controllerStatus: ControllerStatus;
  controllerPlayerId: string | null;
  players: Map<string, InternalPlayer>;
  settings: RoomSettings;
  round: InternalRound | null;
  roundSubmissions: Map<string, InternalPlayerSubmissionState> | null;
};

type InternalPlayerSubmissionState = {
  readonly roundId: string;
  readonly playerId: string;
  readonly submissionVersion: number;
  readonly acceptedWords: readonly AcceptedWord[];
  readonly provisionalScore: number;
};

type InternalRound = {
  id: string;
  number: number;
  settings: RoomSettings;
  board: {
    size: GridSize;
    tiles: readonly string[];
  };
  participants: readonly {
    playerId: string;
    displayName: string;
  }[];
  startedAt: number;
  deadlineAt: number;
  endedAt: number | null;
  generationAttempts: number;
};

export type RoundBoardGenerationResult =
  | {
      readonly success: true;
      readonly board: {
        readonly size: GridSize;
        readonly tiles: readonly string[];
      };
      readonly attempts: number;
    }
  | {
      readonly success: false;
      readonly code: 'NO_ACCEPTABLE_BOARD';
      readonly attempts: number;
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
  submissionState: PlayerRoundSubmissionState | null;
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

export type SubmitWordResult = {
  response: SubmitWordResponse;
  reconciledRoom: RoomState | null;
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
  roundIdGenerator?: () => string;
  reconnectTokenGenerator?: () => string;
  roundBoardGenerator?: (size: GridSize) => RoundBoardGenerationResult;
  scoreWord?: (word: unknown) => TraditionalScoringResult;
  canCreateRooms?: () => boolean;
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

function isValidRoundBoardGenerationResult(
  generated: unknown,
  expectedSize: GridSize,
): generated is Extract<RoundBoardGenerationResult, { success: true }> {
  if (
    typeof generated !== 'object' ||
    generated === null ||
    Array.isArray(generated)
  ) {
    return false;
  }

  const result = generated as Record<string, unknown>;
  const board = result.board;
  if (
    result.success !== true ||
    !Number.isInteger(result.attempts) ||
    (result.attempts as number) < 1 ||
    (result.attempts as number) > maximumRoundGenerationAttempts ||
    typeof board !== 'object' ||
    board === null ||
    Array.isArray(board)
  ) {
    return false;
  }

  const boardResult = board as Record<string, unknown>;
  return (
    boardResult.size === expectedSize &&
    Array.isArray(boardResult.tiles) &&
    boardResult.tiles.length === expectedSize * expectedSize &&
    boardResult.tiles.every(
      (tile) => typeof tile === 'string' && /^[A-Z]{1,4}$/.test(tile),
    )
  );
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
  private readonly roundIdGenerator: () => string;
  private readonly reconnectTokenGenerator: () => string;
  private readonly roundBoardGenerator:
    ((size: GridSize) => RoundBoardGenerationResult) | undefined;
  private readonly scoreWord: (word: unknown) => TraditionalScoringResult;

  constructor(private readonly options: RoomStoreOptions) {
    this.now = createSafeClock(options.now ?? Date.now, () => {
      return new RoomOperationError(
        'INTERNAL_ERROR',
        'The server clock is unavailable.',
      );
    });
    this.roomCodeGenerator =
      options.roomCodeGenerator ?? defaultRoomCodeGenerator;
    this.displaySessionIdGenerator =
      options.displaySessionIdGenerator ?? randomUUID;
    this.playerIdGenerator = options.playerIdGenerator ?? randomUUID;
    this.roundIdGenerator = options.roundIdGenerator ?? randomUUID;
    this.reconnectTokenGenerator =
      options.reconnectTokenGenerator ?? defaultReconnectTokenGenerator;
    this.roundBoardGenerator = options.roundBoardGenerator;
    this.scoreWord = options.scoreWord ?? scoreTraditionalWord;
  }

  createDisplay(socketId: string): DisplaySessionResult {
    if (this.options.canCreateRooms && !this.options.canCreateRooms()) {
      throw new RoomOperationError(
        'SERVER_BUSY',
        'The server is not ready to create rooms yet.',
      );
    }

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
      stateVersion: 0,
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
      round: null,
      roundSubmissions: null,
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
    const requester = this.requireConnectedController(room, session, socketId);

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

  updateSettings(
    session: BoundPlayerSession,
    settings: RoomSettings,
    socketId: string,
  ): ControllerActionResult {
    const room = this.requireActiveRoom(session.roomCode);
    this.requireConnectedController(room, session, socketId);

    if (room.phase === 'ROUND_ACTIVE') {
      throw new RoomOperationError(
        'ROUND_IN_PROGRESS',
        'Room settings cannot change during an active round.',
      );
    }

    const parsedSettings = roomSettingsSchema.safeParse(settings);
    if (!parsedSettings.success) {
      throw new RoomOperationError(
        'INVALID_PAYLOAD',
        'Choose supported room settings and try again.',
      );
    }

    if (
      room.settings.gridSize === parsedSettings.data.gridSize &&
      room.settings.roundDurationSeconds ===
        parsedSettings.data.roundDurationSeconds &&
      room.settings.scoringMode === parsedSettings.data.scoringMode
    ) {
      return { room: this.toRoomState(room) };
    }

    room.settings = Object.freeze({ ...parsedSettings.data });
    this.touch(room, this.now());

    return { room: this.toRoomState(room) };
  }

  startRound(
    session: BoundPlayerSession,
    socketId: string,
  ): ControllerActionResult {
    const room = this.requireActiveRoom(session.roomCode);
    this.requireConnectedController(room, session, socketId);

    if (room.phase === 'ROUND_ACTIVE') {
      throw new RoomOperationError(
        'ROUND_IN_PROGRESS',
        'A round is already in progress.',
      );
    }

    let generated: unknown;
    try {
      generated = this.roundBoardGenerator?.(room.settings.gridSize);
    } catch {
      throw new RoomOperationError(
        'BOARD_GENERATION_FAILED',
        'A playable board could not be generated. Try starting the round again.',
      );
    }
    if (!isValidRoundBoardGenerationResult(generated, room.settings.gridSize)) {
      throw new RoomOperationError(
        'BOARD_GENERATION_FAILED',
        'A playable board could not be generated. Try starting the round again.',
      );
    }

    const now = this.now();
    const settings = Object.freeze({ ...room.settings });
    const participants = Object.freeze(
      [...room.players.values()]
        .filter((player) => player.connected)
        .sort(comparePlayersByJoinOrder)
        .map((player) =>
          Object.freeze({
            playerId: player.id,
            displayName: player.displayName,
          }),
        ),
    );
    const board = Object.freeze({
      size: generated.board.size,
      tiles: Object.freeze([...generated.board.tiles]),
    });
    let round: InternalRound;
    try {
      round = Object.freeze({
        id: this.roundIdGenerator(),
        number: (room.round?.number ?? 0) + 1,
        settings,
        board,
        participants,
        startedAt: now,
        deadlineAt: now + settings.roundDurationSeconds * 1_000,
        endedAt: null,
        generationAttempts: generated.attempts,
      });

      if (
        round.id === room.round?.id ||
        !roundStateSchema.safeParse(this.toRoundState(round)).success
      ) {
        throw new Error('Invalid authoritative round identity or state.');
      }
    } catch {
      throw new RoomOperationError(
        'INTERNAL_ERROR',
        'The authoritative round could not be created.',
      );
    }

    room.round = round;
    room.roundSubmissions = new Map(
      participants.map((participant) => [
        participant.playerId,
        Object.freeze({
          roundId: round.id,
          playerId: participant.playerId,
          submissionVersion: 0,
          acceptedWords: Object.freeze([]),
          provisionalScore: 0,
        }),
      ]),
    );
    room.phase = 'ROUND_ACTIVE';
    this.touch(room, now);

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
    const wasConnected = display.connected;
    this.displaySessions.delete(displayReconnectToken);
    display.reconnectToken = this.createReconnectToken(displayReconnectToken);
    display.socketId = socketId;
    display.connected = true;
    display.disconnectExpiresAt = null;
    this.displaySessions.set(display.reconnectToken, {
      roomCode: room.code,
      displaySessionId: display.id,
    });
    if (wasConnected) {
      this.refreshActivity(room, now);
    } else {
      this.touch(room, now);
    }

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
    const wasConnected = player.connected;
    const previousControllerPlayerId = room.controllerPlayerId;
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
    if (
      wasConnected &&
      previousControllerPlayerId === room.controllerPlayerId
    ) {
      this.refreshActivity(room, now);
    } else {
      this.touch(room, now);
    }

    return this.createPlayerResult(room, player, replacedSocketId);
  }

  submitWord(
    session: BoundPlayerSession,
    socketId: string,
    input: SubmitWordInput,
    dictionary: WordDictionary,
    allowAttempt: () => boolean,
  ): SubmitWordResult {
    const room = this.rooms.get(session.roomCode);
    if (!room) {
      return this.submissionFailure('UNAUTHORIZED', null, null);
    }

    const now = this.now();
    if (room.expiresAt <= now) {
      this.deleteRoom(room, now, true);
      return this.submissionFailure('UNAUTHORIZED', null, null);
    }

    const reconciled = this.reconcileRound(room, now);
    const reconciledRoom = reconciled ? this.toRoomState(room) : null;
    const player = room.players.get(session.playerId);
    if (
      !player ||
      !player.connected ||
      player.socketId !== socketId ||
      player.id !== session.playerId
    ) {
      return this.submissionFailure('UNAUTHORIZED', null, reconciledRoom);
    }

    const currentState = this.getPlayerSubmissionState(room, player.id);
    if (room.phase !== 'ROUND_ACTIVE' || room.round === null) {
      return this.submissionFailure(
        'ROUND_NOT_ACTIVE',
        currentState,
        reconciledRoom,
      );
    }
    if (input.roundId !== room.round.id) {
      return this.submissionFailure(
        'ROUND_MISMATCH',
        currentState,
        reconciledRoom,
      );
    }

    const internalState = room.roundSubmissions?.get(player.id);
    if (!internalState) {
      return this.submissionFailure(
        'NOT_ROUND_PARTICIPANT',
        null,
        reconciledRoom,
      );
    }
    if (!allowAttempt()) {
      return this.submissionFailure(
        'RATE_LIMITED',
        this.copySubmissionState(internalState),
        reconciledRoom,
      );
    }

    let validated;
    try {
      validated = validateWordPath({
        board: room.round.board,
        path: input.path,
        submittedWord: input.word,
        dictionary,
        minimumLength: 3,
      });
    } catch {
      return this.submissionFailure(
        'INTERNAL_ERROR',
        this.copySubmissionState(internalState),
        reconciledRoom,
      );
    }
    if (!validated.valid) {
      const code =
        validated.code === 'INVALID_BOARD' ? 'INTERNAL_ERROR' : validated.code;
      return this.submissionFailure(
        code,
        this.copySubmissionState(internalState),
        reconciledRoom,
      );
    }
    if (
      internalState.acceptedWords.some(
        (acceptedWord) => acceptedWord.word === validated.word,
      )
    ) {
      return this.submissionFailure(
        'ALREADY_SUBMITTED',
        this.copySubmissionState(internalState),
        reconciledRoom,
      );
    }
    if (
      internalState.acceptedWords.length >=
      maximumAcceptedWordsPerPlayerPerRound
    ) {
      return this.submissionFailure(
        'SUBMISSION_LIMIT_REACHED',
        this.copySubmissionState(internalState),
        reconciledRoom,
      );
    }

    let scored: TraditionalScoringResult;
    try {
      scored = this.scoreWord(validated.word);
    } catch {
      return this.submissionFailure(
        'INTERNAL_ERROR',
        this.copySubmissionState(internalState),
        reconciledRoom,
      );
    }
    if (!scored.valid || scored.word !== validated.word) {
      return this.submissionFailure(
        'INTERNAL_ERROR',
        this.copySubmissionState(internalState),
        reconciledRoom,
      );
    }

    const acceptedWord: AcceptedWord = Object.freeze({
      sequence: internalState.acceptedWords.length + 1,
      word: validated.word,
      points: scored.points,
      acceptedAt: new Date(now).toISOString(),
    });
    const nextCandidate = {
      roundId: room.round.id,
      playerId: player.id,
      submissionVersion: internalState.submissionVersion + 1,
      acceptedWords: [...internalState.acceptedWords, acceptedWord],
      provisionalScore: internalState.provisionalScore + scored.points,
    };
    const parsed = playerRoundSubmissionStateSchema.safeParse(nextCandidate);
    if (!parsed.success) {
      return this.submissionFailure(
        'INTERNAL_ERROR',
        this.copySubmissionState(internalState),
        reconciledRoom,
      );
    }

    const committed: InternalPlayerSubmissionState = Object.freeze({
      ...parsed.data,
      acceptedWords: Object.freeze([...parsed.data.acceptedWords]),
    });
    room.roundSubmissions?.set(player.id, committed);
    return {
      reconciledRoom,
      response: {
        ok: true,
        acceptedWord: { ...acceptedWord },
        state: this.copySubmissionState(committed),
      },
    };
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
    this.reconcileRound(room, now);

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

    this.reconcileRound(room, this.now());

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
      if (this.reconcileRound(room, now)) {
        updatedRoomCodes.add(room.code);
      }

      if (room.expiresAt <= now) {
        deletedRoomCodes.push(room.code);
        updatedRoomCodes.delete(room.code);
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
      if (expiredPlayers.length > 0) {
        room.stateVersion += 1;
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
    if (room) {
      this.reconcileRound(room, this.now());
    }
    return room ? this.toRoomState(room) : null;
  }

  advanceDueRounds(): string[] {
    const now = this.now();
    const updatedRoomCodes: string[] = [];

    for (const room of this.rooms.values()) {
      if (this.reconcileRound(room, now)) {
        updatedRoomCodes.push(room.code);
      }
    }

    return updatedRoomCodes;
  }

  reconcileDueRound(roomCode: string): RoomState | null {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return null;
    }

    const now = this.now();
    if (room.expiresAt <= now || !this.reconcileRound(room, now)) {
      return null;
    }

    return this.toRoomState(room);
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

    this.reconcileRound(room, now);
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
      submissionState: this.getPlayerSubmissionState(room, player.id),
      session: {
        playerId: player.id,
        playerReconnectToken: player.reconnectToken,
      },
    };
  }

  private toRoomState(room: InternalRoom): RoomState {
    const now = this.now();
    return {
      code: room.code,
      phase: room.phase,
      stateVersion: room.stateVersion,
      serverTime: new Date(now).toISOString(),
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
      settings: { ...room.settings },
      round: room.round ? this.toRoundState(room.round) : null,
    };
  }

  private getPlayerSubmissionState(
    room: InternalRoom,
    playerId: string,
  ): PlayerRoundSubmissionState | null {
    const state = room.roundSubmissions?.get(playerId);
    return state ? this.copySubmissionState(state) : null;
  }

  private copySubmissionState(
    state: InternalPlayerSubmissionState,
  ): PlayerRoundSubmissionState {
    return {
      roundId: state.roundId,
      playerId: state.playerId,
      submissionVersion: state.submissionVersion,
      acceptedWords: state.acceptedWords.map((word) => ({ ...word })),
      provisionalScore: state.provisionalScore,
    };
  }

  private submissionFailure(
    code: SubmissionError['code'],
    state: PlayerRoundSubmissionState | null,
    reconciledRoom: RoomState | null,
  ): SubmitWordResult {
    const messages: Record<SubmissionError['code'], string> = {
      INVALID_PAYLOAD: 'Check that word and try again.',
      UNAUTHORIZED: 'That player session cannot submit words.',
      ROUND_NOT_ACTIVE: 'Words can only be submitted during an active round.',
      ROUND_MISMATCH: 'That word belongs to a different round.',
      NOT_ROUND_PARTICIPANT: 'You can play when the next round starts.',
      INVALID_PATH: 'Choose a connected path without reusing a tile.',
      INVALID_WORD_FORMAT: 'Choose letters from the official board.',
      WORD_TOO_SHORT: 'Words must contain at least three letters.',
      PATH_WORD_MISMATCH: 'The selected tiles did not match that word.',
      WORD_NOT_IN_DICTIONARY: 'That word is not in this game dictionary.',
      ALREADY_SUBMITTED: 'You already submitted that word this round.',
      SUBMISSION_LIMIT_REACHED: 'This round has reached its word limit.',
      RATE_LIMITED: 'Too many words were sent. Wait a moment and try again.',
      INTERNAL_ERROR: 'That word could not be checked.',
    };
    return {
      reconciledRoom,
      response: {
        ok: false,
        error: { code, message: messages[code] },
        state,
      },
    };
  }

  private toRoundState(round: InternalRound): RoundState {
    return {
      id: round.id,
      number: round.number,
      settings: { ...round.settings },
      board: {
        size: round.board.size,
        tiles: [...round.board.tiles],
      },
      participants: round.participants.map((participant) => ({
        ...participant,
      })),
      startedAt: new Date(round.startedAt).toISOString(),
      deadlineAt: new Date(round.deadlineAt).toISOString(),
      endedAt:
        round.endedAt === null ? null : new Date(round.endedAt).toISOString(),
      generationAttempts: round.generationAttempts,
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
    this.refreshActivity(room, now);
    room.stateVersion += 1;
  }

  private refreshActivity(room: InternalRoom, now: number): void {
    room.lastActivityAt = now;
    room.expiresAt = now + this.options.roomTtlMs;
  }

  private reconcileRound(room: InternalRoom, now: number): boolean {
    const round = room.round;
    if (
      room.phase !== 'ROUND_ACTIVE' ||
      round === null ||
      now < round.deadlineAt
    ) {
      return false;
    }

    room.phase = 'ROUND_ENDED';
    room.round = Object.freeze({
      ...round,
      endedAt: round.deadlineAt,
    });
    room.stateVersion += 1;
    return true;
  }

  private requireConnectedController(
    room: InternalRoom,
    session: BoundPlayerSession,
    socketId: string,
  ): InternalPlayer {
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
        'Only the current game host can do that.',
      );
    }

    return requester;
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
