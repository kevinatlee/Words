import { io, type Socket } from 'socket.io-client';

import type {
  ClientToServerEvents,
  ConnectionStatus,
  CreateRoomInput,
  JoinRoomInput,
  LeaveRoomResponse,
  ReconnectRoomInput,
  RoomActionResponse,
  RoomError,
  RoomState,
  ServerToClientEvents,
} from '@words/shared';

export type LobbyClient = {
  getConnectionStatus: () => ConnectionStatus;
  createRoom: (input: CreateRoomInput) => Promise<RoomActionResponse>;
  joinRoom: (input: JoinRoomInput) => Promise<RoomActionResponse>;
  reconnectRoom: (input: ReconnectRoomInput) => Promise<RoomActionResponse>;
  leaveRoom: () => Promise<LeaveRoomResponse>;
  onRoomState: (listener: (room: RoomState) => void) => () => void;
  onRoomError: (listener: (error: RoomError) => void) => () => void;
  onConnectionStatus: (
    listener: (status: ConnectionStatus) => void,
  ) => () => void;
};

const connectionError: RoomError = {
  code: 'INTERNAL_ERROR',
  message: 'The lobby server could not be reached. Try again.',
};

const connectionFailure: RoomActionResponse = {
  ok: false,
  error: connectionError,
};

export class SocketLobbyClient implements LobbyClient {
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  private connectionPromise: Promise<void> | null = null;

  constructor() {
    this.socket = io({
      autoConnect: false,
      timeout: 5_000,
    });
  }

  getConnectionStatus(): ConnectionStatus {
    if (this.socket.connected) {
      return 'connected';
    }

    return this.socket.active ? 'connecting' : 'disconnected';
  }

  async createRoom(input: CreateRoomInput): Promise<RoomActionResponse> {
    if (!(await this.ensureConnected())) {
      return connectionFailure;
    }

    return new Promise((resolve) => {
      this.socket
        .timeout(5_000)
        .emit('room:create', input, (error, response) => {
          resolve(error ? connectionFailure : response);
        });
    });
  }

  async joinRoom(input: JoinRoomInput): Promise<RoomActionResponse> {
    if (!(await this.ensureConnected())) {
      return connectionFailure;
    }

    return new Promise((resolve) => {
      this.socket.timeout(5_000).emit('room:join', input, (error, response) => {
        resolve(error ? connectionFailure : response);
      });
    });
  }

  async reconnectRoom(input: ReconnectRoomInput): Promise<RoomActionResponse> {
    if (!(await this.ensureConnected())) {
      return connectionFailure;
    }

    return new Promise((resolve) => {
      this.socket
        .timeout(5_000)
        .emit('room:reconnect', input, (error, response) => {
          resolve(error ? connectionFailure : response);
        });
    });
  }

  async leaveRoom(): Promise<LeaveRoomResponse> {
    if (!this.socket.connected) {
      return {
        ok: false,
        error: connectionError,
      };
    }

    return new Promise((resolve) => {
      this.socket.timeout(5_000).emit('room:leave', {}, (error, response) => {
        resolve(
          error
            ? {
                ok: false,
                error: connectionError,
              }
            : response,
        );
      });
    });
  }

  onRoomState(listener: (room: RoomState) => void): () => void {
    this.socket.on('room:state', listener);
    return () => this.socket.off('room:state', listener);
  }

  onRoomError(listener: (error: RoomError) => void): () => void {
    this.socket.on('room:error', listener);
    return () => this.socket.off('room:error', listener);
  }

  onConnectionStatus(listener: (status: ConnectionStatus) => void): () => void {
    const onConnect = () => listener('connected');
    const onDisconnect = () => listener('disconnected');
    const onConnectError = () => listener('disconnected');

    this.socket.on('connect', onConnect);
    this.socket.on('disconnect', onDisconnect);
    this.socket.on('connect_error', onConnectError);

    return () => {
      this.socket.off('connect', onConnect);
      this.socket.off('disconnect', onDisconnect);
      this.socket.off('connect_error', onConnectError);
    };
  }

  private ensureConnected(): Promise<boolean> {
    if (this.socket.connected) {
      return Promise.resolve(true);
    }

    if (!this.connectionPromise) {
      this.connectionPromise = new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          cleanUp();
          resolve();
        };
        const onError = () => {
          cleanUp();
          reject(new Error('Socket connection failed.'));
        };
        const cleanUp = () => {
          this.socket.off('connect', onConnect);
          this.socket.off('connect_error', onError);
        };

        this.socket.once('connect', onConnect);
        this.socket.once('connect_error', onError);
        this.socket.connect();
      }).finally(() => {
        this.connectionPromise = null;
      });
    }

    const connectionPromise = this.connectionPromise;

    return connectionPromise.then(
      () => true,
      () => false,
    );
  }
}

export const lobbyClient = new SocketLobbyClient();
