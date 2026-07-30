import { io, type Socket } from 'socket.io-client';

import {
  controllerActionResponseSchema,
  displayActionResponseSchema,
  leaveSessionResponseSchema,
  playerActionResponseSchema,
  roomErrorSchema,
  roomStateSchema,
  submitWordResponseSchema,
  type ClientToServerEvents,
  type ConnectionStatus,
  type ControllerActionResponse,
  type CreateDisplayInput,
  type DisplayActionResponse,
  type JoinPlayerInput,
  type LeaveSessionResponse,
  type PlayerActionResponse,
  type ReconnectDisplayInput,
  type ReconnectPlayerInput,
  type RoomError,
  type RoomState,
  type SubmitWordInput,
  type SubmitWordResponse,
  type ServerToClientEvents,
  type TransferControllerInput,
  type UpdateRoomSettingsInput,
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
  updateSettings: (
    input: UpdateRoomSettingsInput,
  ) => Promise<ControllerActionResponse>;
  startRound: () => Promise<ControllerActionResponse>;
  submitWord: (input: SubmitWordInput) => Promise<SubmitWordResponse>;
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

const submissionConnectionFailure: SubmitWordResponse = {
  ok: false,
  error: {
    code: 'INTERNAL_ERROR',
    message: connectionError.message,
  },
  state: null,
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
          const parsed = displayActionResponseSchema.safeParse(response);
          resolve(
            error || !parsed.success ? displayConnectionFailure : parsed.data,
          );
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
          const parsed = displayActionResponseSchema.safeParse(response);
          resolve(
            error || !parsed.success ? displayConnectionFailure : parsed.data,
          );
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
          const parsed = leaveSessionResponseSchema.safeParse(response);
          resolve(
            error || !parsed.success ? leaveConnectionFailure : parsed.data,
          );
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
          const parsed = playerActionResponseSchema.safeParse(response);
          resolve(
            error || !parsed.success ? playerConnectionFailure : parsed.data,
          );
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
          const parsed = playerActionResponseSchema.safeParse(response);
          resolve(
            error || !parsed.success ? playerConnectionFailure : parsed.data,
          );
        });
    });
  }

  async leavePlayer(): Promise<LeaveSessionResponse> {
    if (!this.socket.connected) {
      return leaveConnectionFailure;
    }

    return new Promise((resolve) => {
      this.socket.timeout(5_000).emit('player:leave', {}, (error, response) => {
        const parsed = leaveSessionResponseSchema.safeParse(response);
        resolve(
          error || !parsed.success ? leaveConnectionFailure : parsed.data,
        );
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
          const parsed = controllerActionResponseSchema.safeParse(response);
          resolve(
            error || !parsed.success
              ? controllerConnectionFailure
              : parsed.data,
          );
        });
    });
  }

  async updateSettings(
    input: UpdateRoomSettingsInput,
  ): Promise<ControllerActionResponse> {
    if (!this.socket.connected) {
      return controllerConnectionFailure;
    }

    return new Promise((resolve) => {
      this.socket
        .timeout(5_000)
        .emit('controller:update-settings', input, (error, response) => {
          const parsed = controllerActionResponseSchema.safeParse(response);
          resolve(
            error || !parsed.success
              ? controllerConnectionFailure
              : parsed.data,
          );
        });
    });
  }

  async startRound(): Promise<ControllerActionResponse> {
    if (!this.socket.connected) {
      return controllerConnectionFailure;
    }

    return new Promise((resolve) => {
      this.socket
        .timeout(5_000)
        .emit('controller:start-round', {}, (error, response) => {
          const parsed = controllerActionResponseSchema.safeParse(response);
          resolve(
            error || !parsed.success
              ? controllerConnectionFailure
              : parsed.data,
          );
        });
    });
  }

  async submitWord(input: SubmitWordInput): Promise<SubmitWordResponse> {
    if (!this.socket.connected) {
      return submissionConnectionFailure;
    }

    return new Promise((resolve) => {
      this.socket
        .timeout(5_000)
        .emit('player:submit-word', input, (error, response) => {
          const parsed = submitWordResponseSchema.safeParse(response);
          resolve(
            error || !parsed.success
              ? submissionConnectionFailure
              : parsed.data,
          );
        });
    });
  }

  onRoomState(listener: (room: RoomState) => void): () => void {
    const validatedListener = (room: RoomState) => {
      const parsed = roomStateSchema.safeParse(room);
      if (parsed.success) {
        listener(parsed.data);
      }
    };
    this.socket.on('room:state', validatedListener);
    return () => this.socket.off('room:state', validatedListener);
  }

  onRoomError(listener: (error: RoomError) => void): () => void {
    const validatedListener = (error: RoomError) => {
      const parsed = roomErrorSchema.safeParse(error);
      if (parsed.success) {
        listener(parsed.data);
      }
    };
    this.socket.on('room:error', validatedListener);
    return () => this.socket.off('room:error', validatedListener);
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
