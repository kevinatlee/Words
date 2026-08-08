import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';

import {
  generateDefaultBoard,
  loadProductionDictionary,
  PRODUCTION_DICTIONARY_IDENTITY,
  selectMedianBoard,
  type ProductionDictionaryLoadResult,
} from '@words/game-data';
import {
  createDisplayInputSchema,
  joinPlayerInputSchema,
  leaveSessionInputSchema,
  productConfig,
  reconnectDisplayInputSchema,
  reconnectPlayerInputSchema,
  roomSettingsSchema,
  returnToLobbyInputSchema,
  startRoundInputSchema,
  submitWordInputSchema,
  transferControllerInputSchema,
  type ClientToServerEvents,
  type ControllerActionAcknowledgement,
  type CreateDisplayInput,
  type DisplayActionAcknowledgement,
  type JoinPlayerInput,
  type LeaveSessionAcknowledgement,
  type LeaveSessionInput,
  type PlayerActionAcknowledgement,
  type ReconnectDisplayInput,
  type ReconnectPlayerInput,
  type ReturnToLobbyInput,
  type RoomActionFailure,
  type RoomError,
  type RoomErrorCode,
  type ServerToClientEvents,
  type StartRoundInput,
  type SubmitWordAcknowledgement,
  type SubmitWordInput,
  type TransferControllerInput,
  type UpdateRoomSettingsInput,
} from '@words/shared';
import express from 'express';
import { Server as SocketServer, type Socket } from 'socket.io';

import { createServerConfig, type ServerConfig } from './config.js';
import {
  createCryptoRandomSource,
  type ServerRandomSource,
} from './crypto-random-source.js';
import {
  PlayerSubmissionRateLimiter,
  SocketRateLimiter,
} from './rate-limiter.js';
import {
  RoomOperationError,
  RoomStore,
  type BoundSession,
  type RoomPresenceResult,
} from './room-store.js';
import { createSafeClock } from './safe-clock.js';
import { configureProductionStaticFiles } from './production-static.js';

type SocketData = {
  session?: BoundSession;
};

type WordsSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type FailureAcknowledgement = (response: RoomActionFailure) => void;

export type WordsServer = ReturnType<typeof createWordsServer>;

type LifecycleTimer = ReturnType<typeof setInterval>;

export type WordsServerDependencies = {
  now?: () => number;
  roundIdGenerator?: () => string;
  dictionaryLoader?: () => Promise<ProductionDictionaryLoadResult>;
  boardGenerator?: typeof generateDefaultBoard;
  randomSource?: ServerRandomSource;
  lifecycleIntervalMs?: number;
  setInterval?: (callback: () => void, milliseconds: number) => LifecycleTimer;
  clearInterval?: (timer: LifecycleTimer) => void;
  listen?: (
    httpServer: ReturnType<typeof createHttpServer>,
    port: number,
  ) => Promise<number>;
  staticClientDirectory?: string;
};

type WordsServerStartupErrorCode =
  | 'GAME_DATA_STARTUP_FAILED'
  | 'SERVER_LISTEN_FAILED'
  | 'SERVER_LIFECYCLE_FAILED';

export class WordsServerStartupError extends Error {
  constructor(
    readonly code: WordsServerStartupErrorCode = 'GAME_DATA_STARTUP_FAILED',
  ) {
    super(
      code === 'GAME_DATA_STARTUP_FAILED'
        ? 'Words server startup failed because production game data is unavailable.'
        : code === 'SERVER_LISTEN_FAILED'
          ? 'Words server startup failed while opening its network port.'
          : 'Words server startup failed while scheduling room lifecycle work.',
    );
    this.name = 'WordsServerStartupError';
  }
}

export class WordsServerStoppedError extends Error {
  readonly code = 'SERVER_STOPPED';

  constructor() {
    super('Words server startup was cancelled because the server was stopped.');
    this.name = 'WordsServerStoppedError';
  }
}

const publicErrorMessages: Record<RoomErrorCode, string> = {
  INVALID_PAYLOAD: 'Check the information you entered and try again.',
  INVALID_NAME: 'Choose a valid display name and try again.',
  UNAUTHORIZED: 'That session is not authorized for this action.',
  NOT_CONTROLLER: 'Only the current game host can do that.',
  TARGET_PLAYER_NOT_FOUND: 'Choose a player who is in this room.',
  TARGET_PLAYER_OFFLINE: 'Choose a connected player.',
  TARGET_ALREADY_CONTROLLER: 'That player is already the game host.',
  ROOM_NOT_FOUND: 'No active room uses that code.',
  ROOM_FULL: 'That room already has the maximum number of players.',
  ROOM_EXPIRED: 'That temporary room has expired.',
  RECONNECT_FAILED: 'That temporary reconnect session is no longer valid.',
  RATE_LIMITED: 'Too many requests were sent. Wait a moment and try again.',
  SERVER_BUSY: 'The server is busy. Try again shortly.',
  ROUND_IN_PROGRESS: 'A round is already in progress.',
  BOARD_GENERATION_FAILED:
    'A playable board could not be generated. Try again.',
  INTERNAL_ERROR: 'The request could not be completed.',
};

function toRoomError(error: unknown): RoomError {
  if (error instanceof RoomOperationError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: publicErrorMessages.INTERNAL_ERROR,
  };
}

function acknowledgeFailure(
  acknowledge: FailureAcknowledgement,
  error: RoomError,
): void {
  acknowledge({ ok: false, error });
}

export function createWordsServer(
  overrides: Partial<ServerConfig> = {},
  dependencies: WordsServerDependencies = {},
): {
  app: express.Express;
  config: ServerConfig;
  httpServer: ReturnType<typeof createHttpServer>;
  io: SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >;
  roomStore: RoomStore;
  start: (port?: number) => Promise<number>;
  stop: () => Promise<void>;
} {
  const config = { ...createServerConfig(), ...overrides };
  const now = createSafeClock(dependencies.now ?? Date.now, () => {
    return new RoomOperationError(
      'INTERNAL_ERROR',
      'The server clock is unavailable.',
    );
  });
  const dictionaryLoader =
    dependencies.dictionaryLoader ?? loadProductionDictionary;
  const boardGenerator = dependencies.boardGenerator ?? generateDefaultBoard;
  const randomSource = dependencies.randomSource ?? createCryptoRandomSource();
  const lifecycleIntervalMs = dependencies.lifecycleIntervalMs ?? 250;
  if (
    !Number.isInteger(lifecycleIntervalMs) ||
    !Number.isFinite(lifecycleIntervalMs) ||
    lifecycleIntervalMs < 250 ||
    lifecycleIntervalMs > 500
  ) {
    throw new Error(
      'The lifecycle interval must be from 250 to 500 milliseconds.',
    );
  }
  const scheduleInterval = dependencies.setInterval ?? setInterval;
  const cancelInterval = dependencies.clearInterval ?? clearInterval;
  let acceptingRooms = false;
  let gameDataRuntime: Extract<
    ProductionDictionaryLoadResult,
    { success: true }
  > | null = null;
  const app = express();
  const httpServer = createHttpServer(app);
  const io = new SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    maxHttpBufferSize: 16 * 1024,
    cors: {
      origin: [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        config.publicBaseUrl,
      ],
    },
  });
  const roomStore = new RoomStore({
    maxPlayers: config.maxPlayers,
    maxRooms: config.maxRooms,
    roomTtlMs: config.roomTtlMs,
    reconnectGraceMs: config.reconnectGraceMs,
    now,
    roundIdGenerator: dependencies.roundIdGenerator ?? randomUUID,
    roundBoardGenerator: (size) => {
      if (gameDataRuntime === null) {
        return {
          success: false,
          code: 'NO_ACCEPTABLE_BOARD',
          attempts: 0,
        };
      }
      return selectMedianBoard({
        size,
        random: randomSource,
        dictionary: gameDataRuntime.dictionary,
        dictionaryWords: gameDataRuntime.words,
        generateCandidate: boardGenerator,
      });
    },
    canCreateRooms: () => acceptingRooms,
  });
  const rateLimiter = new SocketRateLimiter(
    config.rateLimitWindowMs,
    config.rateLimitAttempts,
  );
  const submissionRateLimiter = new PlayerSubmissionRateLimiter(
    1_000,
    10,
    config.maxRooms * config.maxPlayers,
    now,
  );
  const submissionSocketRateLimiter = new SocketRateLimiter(1_000, 20, now);
  let lifecycleTimer: LifecycleTimer | null = null;
  let startupPromise: Promise<number> | null = null;
  let stopPromise: Promise<void> | null = null;
  let lifecycleState:
    'created' | 'starting' | 'listening' | 'failed' | 'stopping' | 'stopped' =
    'created';
  let nextCleanupAt = now() + config.cleanupIntervalMs;

  const broadcastDueRound = (roomCode: string, receivedAt?: number): void => {
    const room = roomStore.reconcileDueRound(roomCode, receivedAt);
    if (room) {
      io.to(roomCode).emit('room:state', room);
    }
  };

  const closeConnectedRoom = (roomCode: string, error: RoomError): void => {
    const socketIds = io.sockets.adapter.rooms.get(roomCode);

    for (const socketId of socketIds ?? []) {
      const roomSocket = io.sockets.sockets.get(socketId);
      if (!roomSocket) {
        continue;
      }

      roomSocket.emit('room:error', error);
      if (roomSocket.data.session?.roomCode === roomCode) {
        delete roomSocket.data.session;
      }
      void roomSocket.leave(roomCode);
    }
  };

  const releaseReplacedSocket = (
    replacedSocketId: string | null,
    roomCode: string,
  ): void => {
    if (!replacedSocketId) {
      return;
    }

    const replacedSocket = io.sockets.sockets.get(replacedSocketId);
    if (!replacedSocket) {
      return;
    }

    replacedSocket.emit('room:error', {
      code: 'RECONNECT_FAILED',
      message: 'This temporary session was resumed in another browser tab.',
    });
    delete replacedSocket.data.session;
    void replacedSocket.leave(roomCode);
  };

  app.disable('x-powered-by');
  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: productConfig.productName,
      version: productConfig.version,
      gameDataReady: gameDataRuntime !== null,
    });
  });
  if (dependencies.staticClientDirectory) {
    app.use('/api', (_request, response) => {
      response.status(404).json({ error: 'Not found' });
    });
    configureProductionStaticFiles(app, dependencies.staticClientDirectory);
  }

  io.on('connection', (socket: WordsSocket) => {
    const checkRateLimit = (acknowledge: FailureAcknowledgement): boolean => {
      if (rateLimiter.allow(socket.id)) {
        return true;
      }

      acknowledgeFailure(acknowledge, {
        code: 'RATE_LIMITED',
        message: publicErrorMessages.RATE_LIMITED,
      });
      return false;
    };

    const rejectBoundSocket = (
      acknowledge: FailureAcknowledgement,
    ): boolean => {
      if (!socket.data.session) {
        return false;
      }

      acknowledgeFailure(acknowledge, {
        code: 'INVALID_PAYLOAD',
        message: 'Leave the current room before opening another session.',
      });
      return true;
    };

    socket.on(
      'display:create',
      (
        payload: CreateDisplayInput,
        acknowledge: DisplayActionAcknowledgement,
      ) => {
        if (rejectBoundSocket(acknowledge) || !checkRateLimit(acknowledge)) {
          return;
        }

        const parsed = createDisplayInputSchema.safeParse(payload);
        if (!parsed.success) {
          acknowledgeFailure(acknowledge, {
            code: 'INVALID_PAYLOAD',
            message: publicErrorMessages.INVALID_PAYLOAD,
          });
          return;
        }

        try {
          const result = roomStore.createDisplay(socket.id);
          socket.data.session = {
            role: 'display',
            roomCode: result.room.code,
            displaySessionId: result.session.displaySessionId,
          };
          void socket.join(result.room.code);
          acknowledge({
            ok: true,
            room: result.room,
            session: result.session,
          });
          io.to(result.room.code).emit('room:state', result.room);
        } catch (error) {
          acknowledgeFailure(acknowledge, toRoomError(error));
        }
      },
    );

    socket.on(
      'display:reconnect',
      (
        payload: ReconnectDisplayInput,
        acknowledge: DisplayActionAcknowledgement,
      ) => {
        if (rejectBoundSocket(acknowledge) || !checkRateLimit(acknowledge)) {
          return;
        }

        const parsed = reconnectDisplayInputSchema.safeParse(payload);
        if (!parsed.success) {
          acknowledgeFailure(acknowledge, {
            code: 'INVALID_PAYLOAD',
            message: publicErrorMessages.INVALID_PAYLOAD,
          });
          return;
        }

        try {
          broadcastDueRound(parsed.data.roomCode);
          const result = roomStore.reconnectDisplay(
            parsed.data.roomCode,
            parsed.data.displayReconnectToken,
            socket.id,
          );
          releaseReplacedSocket(result.replacedSocketId, result.room.code);
          socket.data.session = {
            role: 'display',
            roomCode: result.room.code,
            displaySessionId: result.session.displaySessionId,
          };
          void socket.join(result.room.code);
          acknowledge({
            ok: true,
            room: result.room,
            session: result.session,
          });
          socket.to(result.room.code).emit('display:connected', result.display);
          io.to(result.room.code).emit('room:state', result.room);
        } catch (error) {
          acknowledgeFailure(acknowledge, toRoomError(error));
        }
      },
    );

    socket.on(
      'player:join',
      (payload: JoinPlayerInput, acknowledge: PlayerActionAcknowledgement) => {
        if (rejectBoundSocket(acknowledge) || !checkRateLimit(acknowledge)) {
          return;
        }

        const parsed = joinPlayerInputSchema.safeParse(payload);
        if (!parsed.success) {
          acknowledgeFailure(acknowledge, {
            code: 'INVALID_PAYLOAD',
            message: publicErrorMessages.INVALID_PAYLOAD,
          });
          return;
        }

        try {
          broadcastDueRound(parsed.data.roomCode);
          const result = roomStore.joinPlayer(
            parsed.data.roomCode,
            parsed.data.displayName,
            socket.id,
          );
          socket.data.session = {
            role: 'player',
            roomCode: result.room.code,
            playerId: result.session.playerId,
          };
          void socket.join(result.room.code);
          acknowledge({
            ok: true,
            room: result.room,
            session: result.session,
            submissionState: result.submissionState,
          });
          socket.to(result.room.code).emit('player:connected', result.player);
          io.to(result.room.code).emit('room:state', result.room);
        } catch (error) {
          acknowledgeFailure(acknowledge, toRoomError(error));
        }
      },
    );

    socket.on(
      'player:reconnect',
      (
        payload: ReconnectPlayerInput,
        acknowledge: PlayerActionAcknowledgement,
      ) => {
        if (rejectBoundSocket(acknowledge) || !checkRateLimit(acknowledge)) {
          return;
        }

        const parsed = reconnectPlayerInputSchema.safeParse(payload);
        if (!parsed.success) {
          acknowledgeFailure(acknowledge, {
            code: 'INVALID_PAYLOAD',
            message: publicErrorMessages.INVALID_PAYLOAD,
          });
          return;
        }

        try {
          broadcastDueRound(parsed.data.roomCode);
          const result = roomStore.reconnectPlayer(
            parsed.data.roomCode,
            parsed.data.playerReconnectToken,
            socket.id,
          );
          releaseReplacedSocket(result.replacedSocketId, result.room.code);
          socket.data.session = {
            role: 'player',
            roomCode: result.room.code,
            playerId: result.session.playerId,
          };
          void socket.join(result.room.code);
          acknowledge({
            ok: true,
            room: result.room,
            session: result.session,
            submissionState: result.submissionState,
          });
          socket.to(result.room.code).emit('player:connected', result.player);
          io.to(result.room.code).emit('room:state', result.room);
        } catch (error) {
          acknowledgeFailure(acknowledge, toRoomError(error));
        }
      },
    );

    socket.on(
      'player:submit-word',
      (payload: SubmitWordInput, acknowledge?: SubmitWordAcknowledgement) => {
        const sendAcknowledgement = (
          response: Parameters<SubmitWordAcknowledgement>[0],
        ): void => {
          if (typeof acknowledge !== 'function') {
            return;
          }
          try {
            acknowledge(response);
          } catch {
            // A hostile or disconnected client acknowledgement must not escape.
          }
        };
        let receivedAt: number;
        try {
          receivedAt = now();
          if (!submissionSocketRateLimiter.allow(socket.id, receivedAt)) {
            const session = socket.data.session;
            if (session) {
              try {
                broadcastDueRound(session.roomCode, receivedAt);
              } catch {
                sendAcknowledgement({
                  ok: false,
                  error: {
                    code: 'INTERNAL_ERROR',
                    message: 'That word could not be checked.',
                  },
                  state: null,
                });
                return;
              }
            }
            sendAcknowledgement({
              ok: false,
              error: {
                code: 'RATE_LIMITED',
                message:
                  'Too many words were sent. Wait a moment and try again.',
              },
              state: null,
            });
            return;
          }
        } catch {
          sendAcknowledgement({
            ok: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: 'That word could not be checked.',
            },
            state: null,
          });
          return;
        }

        if (typeof acknowledge !== 'function') {
          return;
        }

        const session = socket.data.session;
        if (session) {
          try {
            broadcastDueRound(session.roomCode, receivedAt);
          } catch {
            sendAcknowledgement({
              ok: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: 'That word could not be checked.',
              },
              state: null,
            });
            return;
          }
        }

        const parsed = submitWordInputSchema.safeParse(payload);
        if (!parsed.success) {
          sendAcknowledgement({
            ok: false,
            error: {
              code: 'INVALID_PAYLOAD',
              message: 'Check that word and try again.',
            },
            state: null,
          });
          return;
        }
        if (!session || session.role !== 'player' || !gameDataRuntime) {
          sendAcknowledgement({
            ok: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'That player session cannot submit words.',
            },
            state: null,
          });
          return;
        }

        try {
          const result = roomStore.submitWord(
            session,
            socket.id,
            parsed.data,
            gameDataRuntime.dictionary,
            () =>
              submissionRateLimiter.allow(
                session.roomCode,
                session.playerId,
                receivedAt,
              ),
            receivedAt,
          );
          if (result.roomUpdate) {
            io.to(session.roomCode).emit('room:state', result.roomUpdate);
          }
          sendAcknowledgement(result.response);
        } catch {
          sendAcknowledgement({
            ok: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: 'That word could not be checked.',
            },
            state: null,
          });
        }
      },
    );

    socket.on(
      'controller:transfer',
      (
        payload: TransferControllerInput,
        acknowledge: ControllerActionAcknowledgement,
      ) => {
        if (!checkRateLimit(acknowledge)) {
          return;
        }

        const parsed = transferControllerInputSchema.safeParse(payload);
        if (!parsed.success) {
          acknowledgeFailure(acknowledge, {
            code: 'INVALID_PAYLOAD',
            message: publicErrorMessages.INVALID_PAYLOAD,
          });
          return;
        }

        const session = socket.data.session;
        if (!session) {
          acknowledgeFailure(acknowledge, {
            code: 'UNAUTHORIZED',
            message: publicErrorMessages.UNAUTHORIZED,
          });
          return;
        }
        try {
          broadcastDueRound(session.roomCode);
        } catch (error) {
          acknowledgeFailure(acknowledge, toRoomError(error));
          return;
        }
        if (session.role !== 'player') {
          acknowledgeFailure(acknowledge, {
            code: 'NOT_CONTROLLER',
            message: publicErrorMessages.NOT_CONTROLLER,
          });
          return;
        }

        try {
          const result = roomStore.transferController(
            session,
            parsed.data.targetPlayerId,
            socket.id,
          );
          acknowledge({ ok: true, room: result.room });
          io.to(session.roomCode).emit('room:state', result.room);
        } catch (error) {
          acknowledgeFailure(acknowledge, toRoomError(error));
        }
      },
    );

    socket.on(
      'controller:update-settings',
      (
        payload: UpdateRoomSettingsInput,
        acknowledge: ControllerActionAcknowledgement,
      ) => {
        if (!checkRateLimit(acknowledge)) {
          return;
        }

        const parsed = roomSettingsSchema.safeParse(payload);
        if (!parsed.success) {
          acknowledgeFailure(acknowledge, {
            code: 'INVALID_PAYLOAD',
            message: publicErrorMessages.INVALID_PAYLOAD,
          });
          return;
        }

        const session = socket.data.session;
        if (!session) {
          acknowledgeFailure(acknowledge, {
            code: 'UNAUTHORIZED',
            message: publicErrorMessages.UNAUTHORIZED,
          });
          return;
        }
        try {
          broadcastDueRound(session.roomCode);
        } catch (error) {
          acknowledgeFailure(acknowledge, toRoomError(error));
          return;
        }
        if (session.role !== 'player') {
          acknowledgeFailure(acknowledge, {
            code: 'NOT_CONTROLLER',
            message: publicErrorMessages.NOT_CONTROLLER,
          });
          return;
        }

        try {
          const result = roomStore.updateSettings(
            session,
            parsed.data,
            socket.id,
          );
          acknowledge({ ok: true, room: result.room });
          io.to(session.roomCode).emit('room:state', result.room);
        } catch (error) {
          acknowledgeFailure(acknowledge, toRoomError(error));
        }
      },
    );

    socket.on(
      'controller:start-round',
      (
        payload: StartRoundInput,
        acknowledge: ControllerActionAcknowledgement,
      ) => {
        if (!checkRateLimit(acknowledge)) {
          return;
        }

        const parsed = startRoundInputSchema.safeParse(payload);
        if (!parsed.success) {
          acknowledgeFailure(acknowledge, {
            code: 'INVALID_PAYLOAD',
            message: publicErrorMessages.INVALID_PAYLOAD,
          });
          return;
        }

        const session = socket.data.session;
        if (!session) {
          acknowledgeFailure(acknowledge, {
            code: 'UNAUTHORIZED',
            message: publicErrorMessages.UNAUTHORIZED,
          });
          return;
        }
        try {
          broadcastDueRound(session.roomCode);
        } catch (error) {
          acknowledgeFailure(acknowledge, toRoomError(error));
          return;
        }
        if (session.role !== 'player') {
          acknowledgeFailure(acknowledge, {
            code: 'NOT_CONTROLLER',
            message: publicErrorMessages.NOT_CONTROLLER,
          });
          return;
        }

        try {
          const result = roomStore.startRound(session, socket.id);
          acknowledge({ ok: true, room: result.room });
          io.to(session.roomCode).emit('room:state', result.room);
        } catch (error) {
          acknowledgeFailure(acknowledge, toRoomError(error));
        }
      },
    );

    socket.on(
      'controller:return-to-lobby',
      (
        payload: ReturnToLobbyInput,
        acknowledge: ControllerActionAcknowledgement,
      ) => {
        if (!checkRateLimit(acknowledge)) {
          return;
        }

        const parsed = returnToLobbyInputSchema.safeParse(payload);
        if (!parsed.success) {
          acknowledgeFailure(acknowledge, {
            code: 'INVALID_PAYLOAD',
            message: publicErrorMessages.INVALID_PAYLOAD,
          });
          return;
        }

        const session = socket.data.session;
        if (!session) {
          acknowledgeFailure(acknowledge, {
            code: 'UNAUTHORIZED',
            message: publicErrorMessages.UNAUTHORIZED,
          });
          return;
        }
        try {
          broadcastDueRound(session.roomCode);
        } catch (error) {
          acknowledgeFailure(acknowledge, toRoomError(error));
          return;
        }
        if (session.role !== 'player') {
          acknowledgeFailure(acknowledge, {
            code: 'NOT_CONTROLLER',
            message: publicErrorMessages.NOT_CONTROLLER,
          });
          return;
        }

        try {
          const result = roomStore.returnToLobby(session, socket.id);
          acknowledge({ ok: true, room: result.room });
          io.to(session.roomCode).emit('room:state', result.room);
        } catch (error) {
          acknowledgeFailure(acknowledge, toRoomError(error));
        }
      },
    );

    socket.on(
      'display:leave',
      (
        payload: LeaveSessionInput,
        acknowledge: LeaveSessionAcknowledgement,
      ) => {
        const parsed = leaveSessionInputSchema.safeParse(payload);
        const session = socket.data.session;

        if (!parsed.success || !session || session.role !== 'display') {
          acknowledgeFailure(acknowledge, {
            code: 'INVALID_PAYLOAD',
            message: publicErrorMessages.INVALID_PAYLOAD,
          });
          return;
        }

        try {
          broadcastDueRound(session.roomCode);
        } catch (error) {
          acknowledgeFailure(acknowledge, toRoomError(error));
          return;
        }
        const result = roomStore.leave(session, socket.id);
        if (!result || result.role !== 'display') {
          acknowledgeFailure(acknowledge, {
            code: 'RECONNECT_FAILED',
            message: publicErrorMessages.RECONNECT_FAILED,
          });
          return;
        }

        delete socket.data.session;
        void socket.leave(session.roomCode);
        acknowledge({ ok: true });
        socket.to(result.roomCode).emit('display:disconnected', result.display);
        io.to(result.roomCode).emit('room:state', result.room);
      },
    );

    socket.on(
      'player:leave',
      (
        payload: LeaveSessionInput,
        acknowledge: LeaveSessionAcknowledgement,
      ) => {
        const parsed = leaveSessionInputSchema.safeParse(payload);
        const session = socket.data.session;

        if (!parsed.success || !session || session.role !== 'player') {
          acknowledgeFailure(acknowledge, {
            code: 'INVALID_PAYLOAD',
            message: publicErrorMessages.INVALID_PAYLOAD,
          });
          return;
        }

        try {
          broadcastDueRound(session.roomCode);
        } catch (error) {
          acknowledgeFailure(acknowledge, toRoomError(error));
          return;
        }
        const result = roomStore.leave(session, socket.id);
        if (!result || result.role !== 'player') {
          acknowledgeFailure(acknowledge, {
            code: 'RECONNECT_FAILED',
            message: publicErrorMessages.RECONNECT_FAILED,
          });
          return;
        }

        delete socket.data.session;
        void socket.leave(session.roomCode);
        acknowledge({ ok: true });
        socket.to(result.roomCode).emit('player:disconnected', result.player);
        io.to(result.roomCode).emit('room:state', result.room);
      },
    );

    socket.on('disconnect', () => {
      rateLimiter.clear(socket.id);
      submissionSocketRateLimiter.clear(socket.id);
      const session = socket.data.session;

      if (!session) {
        return;
      }

      let result: RoomPresenceResult | null;
      try {
        broadcastDueRound(session.roomCode);
        result = roomStore.disconnect(session, socket.id);
      } catch {
        return;
      }
      if (!result) {
        return;
      }

      if (result.role === 'display') {
        socket
          .to(session.roomCode)
          .emit('display:disconnected', result.display);
      } else {
        socket.to(session.roomCode).emit('player:disconnected', result.player);
      }
      io.to(session.roomCode).emit('room:state', result.room);
    });
  });

  const runLifecycleSweep = (): void => {
    const updatedRoomCodes = new Set(roomStore.advanceDueRounds());
    const currentTime = now();

    if (currentTime >= nextCleanupAt) {
      const cleanup = roomStore.cleanupExpired();
      for (const roomCode of cleanup.updatedRoomCodes) {
        updatedRoomCodes.add(roomCode);
      }
      for (const roomCode of cleanup.deletedRoomCodes) {
        updatedRoomCodes.delete(roomCode);
        closeConnectedRoom(roomCode, {
          code: 'ROOM_EXPIRED',
          message: 'This temporary room has expired.',
        });
      }
      nextCleanupAt = currentTime + config.cleanupIntervalMs;
    }

    for (const roomCode of updatedRoomCodes) {
      try {
        const room = roomStore.getRoomState(roomCode);
        if (room) {
          io.to(roomCode).emit('room:state', room);
        }
      } catch {
        // One impossible room state must not suppress cleanup or deadline
        // broadcasts already committed for other rooms in this sweep.
      }
    }
  };

  const beginLifecycleSweep = (): void => {
    if (lifecycleTimer !== null) {
      return;
    }
    lifecycleTimer = scheduleInterval(() => {
      try {
        runLifecycleSweep();
      } catch {
        // A later bounded sweep retries; timer callbacks must not crash the process.
      }
    }, lifecycleIntervalMs);
    lifecycleTimer.unref?.();
  };

  const listenHttpServer = (port: number): Promise<number> =>
    new Promise((resolve, reject) => {
      const onError = (error: Error) => {
        httpServer.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        httpServer.off('error', onError);
        const address = httpServer.address();
        resolve(typeof address === 'object' && address ? address.port : port);
      };
      httpServer.once('error', onError);
      httpServer.once('listening', onListening);
      httpServer.listen({ host: '0.0.0.0', port });
    });
  const listen = dependencies.listen ?? ((_, port) => listenHttpServer(port));

  const closeHttpServerIfListening = (): Promise<void> =>
    new Promise((resolve) => {
      if (!httpServer.listening) {
        resolve();
        return;
      }
      httpServer.close(() => resolve());
    });

  const stop = (): Promise<void> => {
    if (stopPromise !== null) {
      return stopPromise;
    }

    lifecycleState = 'stopping';
    acceptingRooms = false;
    if (lifecycleTimer !== null) {
      cancelInterval(lifecycleTimer);
      lifecycleTimer = null;
    }

    stopPromise = new Promise((resolve) => {
      io.close(() => {
        void closeHttpServerIfListening().then(() => {
          lifecycleState = 'stopped';
          resolve();
        });
      });
    });
    return stopPromise;
  };

  const isExpectedProductionDictionary = (
    loaded: unknown,
  ): loaded is Extract<ProductionDictionaryLoadResult, { success: true }> => {
    if (
      typeof loaded !== 'object' ||
      loaded === null ||
      Array.isArray(loaded)
    ) {
      return false;
    }

    const result = loaded as Record<string, unknown>;
    if (
      result.success !== true ||
      result.wordCount !== 79_370 ||
      !Array.isArray(result.words)
    ) {
      return false;
    }

    const manifest = result.manifest;
    if (
      typeof manifest !== 'object' ||
      manifest === null ||
      Array.isArray(manifest)
    ) {
      return false;
    }

    const fields = manifest as Record<string, unknown>;
    return (
      fields.wordCount === PRODUCTION_DICTIONARY_IDENTITY.wordCount &&
      fields.sha256 === PRODUCTION_DICTIONARY_IDENTITY.sha256 &&
      fields.sourceRelease === PRODUCTION_DICTIONARY_IDENTITY.sourceRelease &&
      fields.sourceCommit === PRODUCTION_DICTIONARY_IDENTITY.sourceCommit
    );
  };
  const isStoppingOrStopped = (): boolean =>
    lifecycleState === 'stopping' || lifecycleState === 'stopped';

  return {
    app,
    config,
    httpServer,
    io,
    roomStore,
    start: (port = config.port) => {
      if (isStoppingOrStopped()) {
        return Promise.reject(new WordsServerStoppedError());
      }
      if (startupPromise !== null) {
        return startupPromise;
      }

      lifecycleState = 'starting';
      startupPromise ??= (async () => {
        let loaded: unknown;
        try {
          loaded = await dictionaryLoader();
        } catch {
          if (isStoppingOrStopped()) {
            throw new WordsServerStoppedError();
          }
          lifecycleState = 'failed';
          throw new WordsServerStartupError();
        }

        if (lifecycleState !== 'starting') {
          throw new WordsServerStoppedError();
        }

        if (!isExpectedProductionDictionary(loaded)) {
          lifecycleState = 'failed';
          throw new WordsServerStartupError();
        }

        gameDataRuntime = loaded;
        let listeningPort: number;
        try {
          listeningPort = await listen(httpServer, port);
        } catch {
          if (isStoppingOrStopped()) {
            if (stopPromise !== null) {
              await stopPromise;
            }
            await closeHttpServerIfListening();
            throw new WordsServerStoppedError();
          }
          lifecycleState = 'failed';
          throw new WordsServerStartupError('SERVER_LISTEN_FAILED');
        }

        if (lifecycleState !== 'starting') {
          if (stopPromise !== null) {
            await stopPromise;
          }
          await closeHttpServerIfListening();
          throw new WordsServerStoppedError();
        }

        acceptingRooms = true;
        lifecycleState = 'listening';
        try {
          beginLifecycleSweep();
        } catch {
          acceptingRooms = false;
          lifecycleState = 'failed';
          const error = new WordsServerStartupError('SERVER_LIFECYCLE_FAILED');
          await stop();
          throw error;
        }
        return listeningPort;
      })();
      return startupPromise;
    },
    stop,
  };
}
