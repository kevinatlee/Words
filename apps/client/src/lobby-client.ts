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

import { performanceDiagnosticsEnabled } from './performance-diagnostics';

export type SocketPerformanceDiagnostics = {
  connected: boolean;
  transport: string;
  connections: number;
  reconnects: number;
  connectionStatusTransitions: number;
  transportUpgrades: number;
  roomStatesReceived: number;
  roomErrorsReceived: number;
  enginePacketsReceived: number;
  enginePacketsSent: number;
};

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
  returnToLobby: () => Promise<ControllerActionResponse>;
  submitWord: (input: SubmitWordInput) => Promise<SubmitWordResponse>;
  onRoomState: (listener: (room: RoomState) => void) => () => void;
  onRoomError: (listener: (error: RoomError) => void) => () => void;
  onConnectionStatus: (
    listener: (status: ConnectionStatus) => void,
  ) => () => void;
  enablePerformanceDiagnostics?: () => () => void;
  getPerformanceDiagnostics?: () => SocketPerformanceDiagnostics;
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
  private performanceCleanup: (() => void) | null = null;
  private enginePerformanceCleanup: (() => void) | null = null;
  private lastDiagnosticConnectionStatus: ConnectionStatus = 'disconnected';
  private lastDiagnosticTransport = 'unknown';
  private performanceDiagnostics: Omit<
    SocketPerformanceDiagnostics,
    'connected' | 'transport'
  > = {
    connections: 0,
    reconnects: 0,
    connectionStatusTransitions: 0,
    transportUpgrades: 0,
    roomStatesReceived: 0,
    roomErrorsReceived: 0,
    enginePacketsReceived: 0,
    enginePacketsSent: 0,
  };

  constructor(
    socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null,
  ) {
    this.socket =
      socket ??
      io({
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

  async returnToLobby(): Promise<ControllerActionResponse> {
    if (!this.socket.connected) {
      return controllerConnectionFailure;
    }

    return new Promise((resolve) => {
      this.socket
        .timeout(5_000)
        .emit('controller:return-to-lobby', {}, (error, response) => {
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

  enablePerformanceDiagnostics(): () => void {
    if (!performanceDiagnosticsEnabled() || this.performanceCleanup) {
      return () => undefined;
    }

    this.lastDiagnosticConnectionStatus = this.getConnectionStatus();
    this.lastDiagnosticTransport = this.currentTransport();
    if (this.socket.connected) {
      this.performanceDiagnostics.connections = 1;
    }

    const recordConnectionStatus = (status: ConnectionStatus) => {
      if (status !== this.lastDiagnosticConnectionStatus) {
        this.performanceDiagnostics.connectionStatusTransitions += 1;
        this.lastDiagnosticConnectionStatus = status;
      }
    };
    const onConnect = () => {
      this.performanceDiagnostics.connections += 1;
      this.lastDiagnosticTransport = this.currentTransport();
      recordConnectionStatus('connected');
    };
    const onDisconnect = () => recordConnectionStatus('disconnected');
    const onConnectError = () => recordConnectionStatus('disconnected');
    const onReconnect = () => {
      this.performanceDiagnostics.reconnects += 1;
    };
    const onRoomState = () => {
      this.performanceDiagnostics.roomStatesReceived += 1;
    };
    const onRoomError = () => {
      this.performanceDiagnostics.roomErrorsReceived += 1;
    };
    const onManagerOpen = () => this.attachEnginePerformanceDiagnostics();

    this.socket.on('connect', onConnect);
    this.socket.on('disconnect', onDisconnect);
    this.socket.on('connect_error', onConnectError);
    this.socket.on('room:state', onRoomState);
    this.socket.on('room:error', onRoomError);
    this.socket.io.on('open', onManagerOpen);
    this.socket.io.on('reconnect', onReconnect);
    this.attachEnginePerformanceDiagnostics();

    const cleanup = () => {
      if (this.performanceCleanup !== cleanup) {
        return;
      }
      this.socket.off('connect', onConnect);
      this.socket.off('disconnect', onDisconnect);
      this.socket.off('connect_error', onConnectError);
      this.socket.off('room:state', onRoomState);
      this.socket.off('room:error', onRoomError);
      this.socket.io.off('open', onManagerOpen);
      this.socket.io.off('reconnect', onReconnect);
      this.enginePerformanceCleanup?.();
      this.enginePerformanceCleanup = null;
      this.performanceCleanup = null;
    };
    this.performanceCleanup = cleanup;
    return cleanup;
  }

  getPerformanceDiagnostics(): SocketPerformanceDiagnostics {
    const transport = this.currentTransport();
    if (transport !== 'unknown') {
      this.lastDiagnosticTransport = transport;
    }
    return {
      connected: this.socket.connected,
      transport: this.lastDiagnosticTransport,
      ...this.performanceDiagnostics,
    };
  }

  private currentTransport(): string {
    return this.socket.io.engine?.transport?.name ?? 'unknown';
  }

  private attachEnginePerformanceDiagnostics(): void {
    const engine = this.socket.io.engine;
    if (!engine) {
      return;
    }
    this.enginePerformanceCleanup?.();
    const onPacket = () => {
      this.performanceDiagnostics.enginePacketsReceived += 1;
    };
    const onPacketCreate = () => {
      this.performanceDiagnostics.enginePacketsSent += 1;
    };
    const onUpgrade = (transport: { name: string }) => {
      this.performanceDiagnostics.transportUpgrades += 1;
      this.lastDiagnosticTransport = transport.name;
    };
    engine.on('packet', onPacket);
    engine.on('packetCreate', onPacketCreate);
    engine.on('upgrade', onUpgrade);
    this.lastDiagnosticTransport = engine.transport?.name ?? 'unknown';
    this.enginePerformanceCleanup = () => {
      engine.off('packet', onPacket);
      engine.off('packetCreate', onPacketCreate);
      engine.off('upgrade', onUpgrade);
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
