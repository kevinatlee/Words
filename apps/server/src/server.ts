import { createServer as createHttpServer } from 'node:http';

import {
  createRoomInputSchema,
  joinRoomInputSchema,
  leaveRoomInputSchema,
  productConfig,
  reconnectRoomInputSchema,
  type ClientToServerEvents,
  type CreateRoomInput,
  type JoinRoomInput,
  type LeaveRoomAcknowledgement,
  type LeaveRoomInput,
  type ReconnectRoomInput,
  type RoomActionAcknowledgement,
  type RoomError,
  type RoomErrorCode,
  type ServerToClientEvents,
} from '@words/shared';
import express from 'express';
import { Server as SocketServer, type Socket } from 'socket.io';

import { createServerConfig, type ServerConfig } from './config.js';
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

export type WordsServer = ReturnType<typeof createWordsServer>;

const publicErrorMessages: Record<RoomErrorCode, string> = {
  INVALID_PAYLOAD: 'Check the information you entered and try again.',
  INVALID_NAME: 'Choose a valid display name and try again.',
  ROOM_NOT_FOUND: 'No active room uses that code.',
  ROOM_FULL: 'That room already has the maximum number of players.',
  ROOM_EXPIRED: 'That temporary room has expired.',
  RECONNECT_FAILED: 'That temporary reconnect session is no longer valid.',
  RATE_LIMITED: 'Too many requests were sent. Wait a moment and try again.',
  SERVER_BUSY: 'The server is busy. Try again shortly.',
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
  acknowledge: RoomActionAcknowledgement,
  error: RoomError,
): void {
  acknowledge({ ok: false, error });
}

export function createWordsServer(overrides: Partial<ServerConfig> = {}): {
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
  });
  const rateLimiter = new SocketRateLimiter(
    config.rateLimitWindowMs,
    config.rateLimitAttempts,
  );

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

  app.disable('x-powered-by');
  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: productConfig.productName,
      version: productConfig.version,
    });
  });

  io.on('connection', (socket: WordsSocket) => {
    const checkRateLimit = (
      acknowledge: RoomActionAcknowledgement,
    ): boolean => {
      if (rateLimiter.allow(socket.id)) {
        return true;
      }

      acknowledgeFailure(acknowledge, {
        code: 'RATE_LIMITED',
        message: publicErrorMessages.RATE_LIMITED,
      });
      return false;
    };

    socket.on(
      'room:create',
      (payload: CreateRoomInput, acknowledge: RoomActionAcknowledgement) => {
        if (socket.data.session) {
          acknowledgeFailure(acknowledge, {
            code: 'INVALID_PAYLOAD',
            message: 'Leave the current room before creating another one.',
          });
          return;
        }

        if (!checkRateLimit(acknowledge)) {
          return;
        }

        const parsed = createRoomInputSchema.safeParse(payload);
        if (!parsed.success) {
          acknowledgeFailure(acknowledge, {
            code: 'INVALID_PAYLOAD',
            message: publicErrorMessages.INVALID_PAYLOAD,
          });
          return;
        }

        try {
          const result = roomStore.createRoom(
            parsed.data.displayName,
            socket.id,
          );
          socket.data.session = {
            roomCode: result.room.code,
            playerId: result.session.playerId,
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
      'room:join',
      (payload: JoinRoomInput, acknowledge: RoomActionAcknowledgement) => {
        if (socket.data.session) {
          acknowledgeFailure(acknowledge, {
            code: 'INVALID_PAYLOAD',
            message: 'Leave the current room before joining another one.',
          });
          return;
        }

        if (!checkRateLimit(acknowledge)) {
          return;
        }

        const parsed = joinRoomInputSchema.safeParse(payload);
        if (!parsed.success) {
          acknowledgeFailure(acknowledge, {
            code: 'INVALID_PAYLOAD',
            message: publicErrorMessages.INVALID_PAYLOAD,
          });
          return;
        }

        try {
          const result = roomStore.joinRoom(
            parsed.data.roomCode,
            parsed.data.displayName,
            socket.id,
          );
          socket.data.session = {
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
      'room:reconnect',
      (payload: ReconnectRoomInput, acknowledge: RoomActionAcknowledgement) => {
        if (socket.data.session) {
          acknowledgeFailure(acknowledge, {
            code: 'INVALID_PAYLOAD',
            message: 'This connection already belongs to a room.',
          });
          return;
        }

        if (!checkRateLimit(acknowledge)) {
          return;
        }

        const parsed = reconnectRoomInputSchema.safeParse(payload);
        if (!parsed.success) {
          acknowledgeFailure(acknowledge, {
            code: 'INVALID_PAYLOAD',
            message: publicErrorMessages.INVALID_PAYLOAD,
          });
          return;
        }

        try {
          const result = roomStore.reconnectRoom(
            parsed.data.roomCode,
            parsed.data.reconnectToken,
            socket.id,
          );

          if (
            result.replacedSocketId &&
            result.replacedSocketId !== socket.id
          ) {
            const replacedSocket = io.sockets.sockets.get(
              result.replacedSocketId,
            );
            if (replacedSocket) {
              replacedSocket.emit('room:error', {
                code: 'RECONNECT_FAILED',
                message:
                  'This temporary session was resumed in another browser tab.',
              });
              delete replacedSocket.data.session;
              void replacedSocket.leave(result.room.code);
            }
          }

          socket.data.session = {
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
      'room:leave',
      (payload: LeaveRoomInput, acknowledge: LeaveRoomAcknowledgement) => {
        const parsed = leaveRoomInputSchema.safeParse(payload);
        const session = socket.data.session;

        if (!parsed.success || !session) {
          acknowledge({
            ok: false,
            error: {
              code: 'INVALID_PAYLOAD',
              message: publicErrorMessages.INVALID_PAYLOAD,
            },
          });
          return;
        }

        const result = roomStore.leave(session, socket.id);
        delete socket.data.session;
        void socket.leave(session.roomCode);

        if (!result) {
          acknowledge({
            ok: false,
            error: {
              code: 'RECONNECT_FAILED',
              message: publicErrorMessages.RECONNECT_FAILED,
            },
          });
          return;
        }

        acknowledge({ ok: true });

        if (result.deletedRoom) {
          closeConnectedRoom(result.roomCode, {
            code: 'ROOM_EXPIRED',
            message: 'The host left, so this temporary room has closed.',
          });
        } else if (result.room) {
          socket.to(result.roomCode).emit('player:disconnected', result.player);
          io.to(result.roomCode).emit('room:state', result.room);
        }
      },
    );

    socket.on('disconnect', () => {
      rateLimiter.clear(socket.id);
      const session = socket.data.session;

      if (!session) {
        return;
      }

      const result = roomStore.disconnect(session, socket.id);
      if (result) {
        socket.to(session.roomCode).emit('player:disconnected', result.player);
        io.to(session.roomCode).emit('room:state', result.room);
      }
    });
  });

  const cleanupTimer = setInterval(() => {
    const cleanup = roomStore.cleanupExpired();

    for (const roomCode of cleanup.updatedRoomCodes) {
      const room = roomStore.getRoomState(roomCode);
      if (room) {
        io.to(roomCode).emit('room:state', room);
      }
    }

    for (const roomCode of cleanup.deletedRoomCodes) {
      closeConnectedRoom(roomCode, {
        code: 'ROOM_EXPIRED',
        message: 'This temporary room has expired.',
      });
    }
  }, config.cleanupIntervalMs);
  cleanupTimer.unref();

  return {
    app,
    config,
    httpServer,
    io,
    roomStore,
    start: (port = config.port) =>
      new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, () => {
          httpServer.off('error', reject);
          const address = httpServer.address();
          resolve(typeof address === 'object' && address ? address.port : port);
        });
      }),
    stop: () =>
      new Promise((resolve) => {
        clearInterval(cleanupTimer);
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
