import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';

import {
  generateDefaultBoard,
  loadProductionDictionary,
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
  startRoundInputSchema,
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
  type RoomActionFailure,
  type RoomError,
  type RoomErrorCode,
  type ServerToClientEvents,
  type StartRoundInput,
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
import { SocketRateLimiter } from './rate-limiter.js';
import {
  RoomOperationError,
  RoomStore,
  type BoundSession,
} from './room-store.js';

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
};

export class WordsServerStartupError extends Error {
  readonly code = 'GAME_DATA_STARTUP_FAILED';

  constructor() {
    super(
      'Words server startup failed because production game data is unavailable.',
    );
    this.name = 'WordsServerStartupError';
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
  const now = dependencies.now ?? Date.now;
  const dictionaryLoader =
    dependencies.dictionaryLoader ?? loadProductionDictionary;
  const boardGenerator = dependencies.boardGenerator ?? generateDefaultBoard;
  const randomSource = dependencies.randomSource ?? createCryptoRandomSource();
  const lifecycleIntervalMs = dependencies.lifecycleIntervalMs ?? 250;
  if (lifecycleIntervalMs < 250 || lifecycleIntervalMs > 500) {
    throw new Error(
      'The lifecycle interval must be from 250 to 500 milliseconds.',
    );
  }
  const scheduleInterval = dependencies.setInterval ?? setInterval;
  const cancelInterval = dependencies.clearInterval ?? clearInterval;
  let acceptingRooms = false;
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
    roundBoardGenerator: (size) =>
      boardGenerator({
        size,
        random: randomSource,
      }),
    canCreateRooms: () => acceptingRooms,
  });
  const rateLimiter = new SocketRateLimiter(
    config.rateLimitWindowMs,
    config.rateLimitAttempts,
  );
  let gameDataRuntime: Extract<
    ProductionDictionaryLoadResult,
    { success: true }
  > | null = null;
  let lifecycleTimer: LifecycleTimer | null = null;
  let startupPromise: Promise<number> | null = null;
  let nextCleanupAt = now() + config.cleanupIntervalMs;

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
          });
          socket.to(result.room.code).emit('player:connected', result.player);
          io.to(result.room.code).emit('room:state', result.room);
        } catch (error) {
          acknowledgeFailure(acknowledge, toRoomError(error));
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
      const session = socket.data.session;

      if (!session) {
        return;
      }

      const result = roomStore.disconnect(session, socket.id);
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
      const room = roomStore.getRoomState(roomCode);
      if (room) {
        io.to(roomCode).emit('room:state', room);
      }
    }
  };

  const beginLifecycleSweep = (): void => {
    if (lifecycleTimer !== null) {
      return;
    }
    lifecycleTimer = scheduleInterval(runLifecycleSweep, lifecycleIntervalMs);
    lifecycleTimer.unref?.();
  };

  const listen = (port: number): Promise<number> =>
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
      httpServer.listen(port);
    });

  return {
    app,
    config,
    httpServer,
    io,
    roomStore,
    start: (port = config.port) => {
      startupPromise ??= (async () => {
        let loaded: ProductionDictionaryLoadResult;
        try {
          loaded = await dictionaryLoader();
        } catch {
          throw new WordsServerStartupError();
        }

        if (!loaded.success || loaded.wordCount !== 79_370) {
          throw new WordsServerStartupError();
        }

        gameDataRuntime = loaded;
        const listeningPort = await listen(port);
        acceptingRooms = true;
        beginLifecycleSweep();
        return listeningPort;
      })();
      return startupPromise;
    },
    stop: () =>
      new Promise((resolve) => {
        acceptingRooms = false;
        if (lifecycleTimer !== null) {
          cancelInterval(lifecycleTimer);
          lifecycleTimer = null;
        }
        io.close(() => {
          if (!httpServer.listening) {
            resolve();
            return;
          }

          httpServer.close(() => resolve());
        });
      }),
  };
}
