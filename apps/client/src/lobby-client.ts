import { io, type Socket } from 'socket.io-client';

import type {
  ClientToServerEvents,
  ConnectionStatus,
  ControllerActionResponse,
  CreateDisplayInput,
  DisplayActionResponse,
  JoinPlayerInput,
  LeaveSessionResponse,
  PlayerActionResponse,
  ReconnectDisplayInput,
  ReconnectPlayerInput,
  RecoverControllerInput,
  RoomError,
  RoomState,
  ServerToClientEvents,
  TransferControllerInput,
} from '@words/shared';

export type LobbyClient = {
  getConnectionStatus: () => ConnectionStatus;
  createDisplay: (input: CreateDisplayInput) => Promise<DisplayActionResponse>;
  reconnectDisplay: (
    input: ReconnectDisplayInput,
  ) => Promise<DisplayActionResponse>;
  leaveDisplay: () => Promise<LeaveSessionResponse>;
  joinPlayer: (input: JoinPlayerInput) => Promise<PlayerActionResponse>;
  reconnectPlayer: (
    input: ReconnectPlayerInput,
  ) => Promise<PlayerActionResponse>;
  leavePlayer: () => Promise<LeaveSessionResponse>;
  transferController: (
    input: TransferControllerInput,
  ) => Promise<ControllerActionResponse>;
  recoverController: (
    input: RecoverControllerInput,
  ) => Promise<ControllerActionResponse>;
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

const displayConnectionFailure: DisplayActionResponse = {
  ok: false,
  error: connectionError,
};

const playerConnectionFailure: PlayerActionResponse = {
  ok: false,
  error: connectionError,
};

const leaveConnectionFailure: LeaveSessionResponse = {
  ok: false,
  error: connectionError,
};

const controllerConnectionFailure: ControllerActionResponse = {
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

  async createDisplay(
    input: CreateDisplayInput,
  ): Promise<DisplayActionResponse> {
    if (!(await this.ensureConnected())) {
      return displayConnectionFailure;
    }

    return new Promise((resolve) => {
      this.socket
        .timeout(5_000)
        .emit('display:create', input, (error, response) => {
          resolve(error ? displayConnectionFailure : response);
        });
    });
  }

  async reconnectDisplay(
    input: ReconnectDisplayInput,
  ): Promise<DisplayActionResponse> {
    if (!(await this.ensureConnected())) {
      return displayConnectionFailure;
    }

    return new Promise((resolve) => {
      this.socket
        .timeout(5_000)
        .emit('display:reconnect', input, (error, response) => {
          resolve(error ? displayConnectionFailure : response);
        });
    });
  }

  async leaveDisplay(): Promise<LeaveSessionResponse> {
    if (!this.socket.connected) {
      return leaveConnectionFailure;
    }

    return new Promise((resolve) => {
      this.socket
        .timeout(5_000)
        .emit('display:leave', {}, (error, response) => {
          resolve(error ? leaveConnectionFailure : response);
        });
    });
  }

  async joinPlayer(input: JoinPlayerInput): Promise<PlayerActionResponse> {
    if (!(await this.ensureConnected())) {
      return playerConnectionFailure;
    }

    return new Promise((resolve) => {
      this.socket
        .timeout(5_000)
        .emit('player:join', input, (error, response) => {
          resolve(error ? playerConnectionFailure : response);
        });
    });
  }

  async reconnectPlayer(
    input: ReconnectPlayerInput,
  ): Promise<PlayerActionResponse> {
    if (!(await this.ensureConnected())) {
      return playerConnectionFailure;
    }

    return new Promise((resolve) => {
      this.socket
        .timeout(5_000)
        .emit('player:reconnect', input, (error, response) => {
          resolve(error ? playerConnectionFailure : response);
        });
    });
  }

  async leavePlayer(): Promise<LeaveSessionResponse> {
    if (!this.socket.connected) {
      return leaveConnectionFailure;
    }

    return new Promise((resolve) => {
      this.socket.timeout(5_000).emit('player:leave', {}, (error, response) => {
        resolve(error ? leaveConnectionFailure : response);
      });
    });
  }

  async transferController(
    input: TransferControllerInput,
  ): Promise<ControllerActionResponse> {
    if (!this.socket.connected) {
      return controllerConnectionFailure;
    }

    return new Promise((resolve) => {
      this.socket
        .timeout(5_000)
        .emit('controller:transfer', input, (error, response) => {
          resolve(error ? controllerConnectionFailure : response);
        });
    });
  }

  async recoverController(
    input: RecoverControllerInput,
  ): Promise<ControllerActionResponse> {
    if (!this.socket.connected) {
      return controllerConnectionFailure;
    }

    return new Promise((resolve) => {
      this.socket
        .timeout(5_000)
        .emit('controller:recover', input, (error, response) => {
          resolve(error ? controllerConnectionFailure : response);
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
