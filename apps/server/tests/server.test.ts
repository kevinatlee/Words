import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  io as createClient,
  type Socket as ClientSocket,
} from 'socket.io-client';

import {
  PRODUCTION_DICTIONARY_IDENTITY,
  type ProductionDictionaryLoadResult,
} from '@words/game-data';
import type {
  ClientToServerEvents,
  ControllerActionResponse,
  CreateDisplayInput,
  DisplayActionResponse,
  JoinPlayerInput,
  LeaveSessionResponse,
  PlayerActionResponse,
  ReconnectDisplayInput,
  ReconnectPlayerInput,
  RoomError,
  RoomSettings,
  RoomState,
  ServerToClientEvents,
  SubmitWordInput,
  SubmitWordResponse,
  TransferControllerInput,
} from '@words/shared';

import {
  createWordsServer,
  type WordsServer,
  type WordsServerDependencies,
} from '../src/server.js';

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const socketEventTimeoutMs = 2_000;

const successfulDictionaryLoad: Extract<
  ProductionDictionaryLoadResult,
  { success: true }
> = {
  success: true,
  dictionary: {
    has: (word: string) => ['ABC', 'CAT', 'DOG', 'QUIZ'].includes(word),
  },
  words: Object.freeze(['ABC', 'CAT', 'DOG', 'QUIZ']),
  wordCount: 79_370,
  manifest: PRODUCTION_DICTIONARY_IDENTITY as never,
};

const testDependencies = {
  dictionaryLoader: async () => successfulDictionaryLoad,
  boardGenerator: ({ size }: { size: 4 | 5 | 6 }) => ({
    success: true as const,
    board: {
      size,
      tiles: Array.from({ length: size * size }, (_, index) =>
        String.fromCharCode(65 + (index % 26)),
      ),
    },
    attempts: 1,
  }),
};

function emitCreateDisplay(
  client: TestClient,
  payload: CreateDisplayInput = {},
): Promise<DisplayActionResponse> {
  return new Promise((resolve) =>
    client.emit('display:create', payload, resolve),
  );
}

function emitJoinPlayer(
  client: TestClient,
  payload: JoinPlayerInput,
): Promise<PlayerActionResponse> {
  return new Promise((resolve) => client.emit('player:join', payload, resolve));
}

function emitReconnectDisplay(
  client: TestClient,
  payload: ReconnectDisplayInput,
): Promise<DisplayActionResponse> {
  return new Promise((resolve) =>
    client.emit('display:reconnect', payload, resolve),
  );
}

function emitReconnectPlayer(
  client: TestClient,
  payload: ReconnectPlayerInput,
): Promise<PlayerActionResponse> {
  return new Promise((resolve) =>
    client.emit('player:reconnect', payload, resolve),
  );
}

function emitLeaveDisplay(client: TestClient): Promise<LeaveSessionResponse> {
  return new Promise((resolve) => client.emit('display:leave', {}, resolve));
}

function emitLeavePlayer(client: TestClient): Promise<LeaveSessionResponse> {
  return new Promise((resolve) => client.emit('player:leave', {}, resolve));
}

function emitTransferController(
  client: TestClient,
  payload: TransferControllerInput,
): Promise<ControllerActionResponse> {
  return new Promise((resolve) =>
    client.emit('controller:transfer', payload, resolve),
  );
}

function emitUpdateSettings(
  client: TestClient,
  payload: RoomSettings,
): Promise<ControllerActionResponse> {
  return new Promise((resolve) =>
    client.emit('controller:update-settings', payload, resolve),
  );
}

function emitStartRound(
  client: TestClient,
  payload: Record<string, never> = {},
): Promise<ControllerActionResponse> {
  return new Promise((resolve) =>
    client.emit('controller:start-round', payload, resolve),
  );
}

function emitSubmitWord(
  client: TestClient,
  payload: SubmitWordInput,
): Promise<SubmitWordResponse> {
  return new Promise((resolve) =>
    client.emit('player:submit-word', payload, resolve),
  );
}

function nextRoomState(
  client: TestClient,
  predicate: (room: RoomState) => boolean,
): Promise<RoomState> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      client.off('room:state', onRoomState);
      client.off('room:error', onRoomError);
      client.off('disconnect', onDisconnect);
      clearTimeout(timeout);
    };
    const onRoomState = (room: RoomState) => {
      let matches: boolean;
      try {
        matches = predicate(room);
      } catch (error) {
        cleanup();
        reject(error);
        return;
      }

      if (matches) {
        cleanup();
        resolve(room);
      }
    };
    const onRoomError = (error: RoomError) => {
      cleanup();
      reject(
        new Error(`Room-state wait received ${error.code}: ${error.message}`),
      );
    };
    const onDisconnect = () => {
      cleanup();
      reject(new Error('Socket disconnected while waiting for room state.'));
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for the expected room state.'));
    }, socketEventTimeoutMs);
    client.on('room:state', onRoomState);
    client.once('room:error', onRoomError);
    client.once('disconnect', onDisconnect);
  });
}

function nextRoomError(client: TestClient): Promise<RoomError> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      client.off('room:error', onRoomError);
      client.off('disconnect', onDisconnect);
      clearTimeout(timeout);
    };
    const onRoomError = (error: RoomError) => {
      cleanup();
      resolve(error);
    };
    const onDisconnect = () => {
      cleanup();
      reject(new Error('Socket disconnected while waiting for a room error.'));
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for the expected room error.'));
    }, socketEventTimeoutMs);
    client.once('room:error', onRoomError);
    client.once('disconnect', onDisconnect);
  });
}

describe('Words Stage 4B server', () => {
  let server: WordsServer;
  let port: number;
  let clients: TestClient[];

  beforeEach(async () => {
    clients = [];
    server = createWordsServer(
      {
        port: 0,
        cleanupIntervalMs: 60_000,
      },
      testDependencies,
    );
    port = await server.start(0);
  });

  afterEach(async () => {
    for (const client of clients) {
      client.disconnect();
    }
    await server.stop();
  });

  const connectClient = async (): Promise<TestClient> => {
    const client: TestClient = createClient(`http://127.0.0.1:${port}`, {
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
    });
    clients.push(client);

    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });

    return client;
  };

  it('serves the health endpoint without framework disclosure', async () => {
    const response = await request(server.app).get('/api/health').expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      service: 'Words',
      version: '0.2.5',
      gameDataReady: true,
    });
    expect(response.headers).not.toHaveProperty('x-powered-by');
  });

  it('creates a display session, not a player session', async () => {
    const display = await connectClient();
    const response = await emitCreateDisplay(display);

    expect(response.ok).toBe(true);
    if (!response.ok) {
      return;
    }

    expect(response.room.display.connected).toBe(true);
    expect(response.room.players).toHaveLength(0);
    expect(response.room.controllerStatus).toBe('none');
    expect(response.room.controllerPlayerId).toBeNull();
    expect(response.session.displaySessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.session.displayReconnectToken).toHaveLength(43);
    expect(response.session).not.toHaveProperty('playerId');
  });

  it('keeps two display browser profiles and their players isolated through reconnects', async () => {
    const firstDisplay = await connectClient();
    const firstCreated = await emitCreateDisplay(firstDisplay);
    const secondDisplay = await connectClient();
    const secondCreated = await emitCreateDisplay(secondDisplay);
    if (!firstCreated.ok || !secondCreated.ok) {
      throw new Error('Display creation failed in test setup.');
    }

    expect(firstCreated.room.code).not.toBe(secondCreated.room.code);
    expect(firstCreated.session.displaySessionId).not.toBe(
      secondCreated.session.displaySessionId,
    );
    expect(firstCreated.session.displayReconnectToken).not.toBe(
      secondCreated.session.displayReconnectToken,
    );

    const firstPlayer = await connectClient();
    const joinedFirstRoom = await emitJoinPlayer(firstPlayer, {
      roomCode: firstCreated.room.code,
      displayName: 'Silver Owl',
    });
    expect(joinedFirstRoom).toMatchObject({ ok: true });
    expect(
      server.roomStore.getRoomState(firstCreated.room.code)?.players,
    ).toHaveLength(1);
    expect(
      server.roomStore.getRoomState(secondCreated.room.code)?.players,
    ).toHaveLength(0);

    firstDisplay.disconnect();
    expect(
      server.roomStore.getRoomState(secondCreated.room.code),
    ).toMatchObject({
      display: { connected: true },
      players: [],
    });

    const refreshedFirstDisplay = await connectClient();
    const firstReconnected = await emitReconnectDisplay(refreshedFirstDisplay, {
      roomCode: firstCreated.room.code,
      displayReconnectToken: firstCreated.session.displayReconnectToken,
    });
    expect(firstReconnected).toMatchObject({
      ok: true,
      room: {
        code: firstCreated.room.code,
        players: [expect.objectContaining({ displayName: 'Silver Owl' })],
      },
      session: {
        displaySessionId: firstCreated.session.displaySessionId,
      },
    });
    expect(
      server.roomStore.getRoomState(secondCreated.room.code),
    ).toMatchObject({
      display: { connected: true },
      players: [],
    });

    secondDisplay.disconnect();
    expect(server.roomStore.getRoomState(firstCreated.room.code)).toMatchObject(
      {
        display: { connected: true },
        players: [expect.objectContaining({ displayName: 'Silver Owl' })],
      },
    );

    const refreshedSecondDisplay = await connectClient();
    const secondReconnected = await emitReconnectDisplay(
      refreshedSecondDisplay,
      {
        roomCode: secondCreated.room.code,
        displayReconnectToken: secondCreated.session.displayReconnectToken,
      },
    );
    expect(secondReconnected).toMatchObject({
      ok: true,
      room: {
        code: secondCreated.room.code,
        players: [],
      },
      session: {
        displaySessionId: secondCreated.session.displaySessionId,
      },
    });
    expect(
      server.roomStore.getRoomState(firstCreated.room.code)?.players,
    ).toHaveLength(1);
  });

  it('rejects client attempts to self-assign controller authority', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }

    const player = await connectClient();
    const response = await emitJoinPlayer(player, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
      controllerPlayerId: '00000000-0000-4000-8000-000000000001',
    } as never);

    expect(response).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
  });

  it('assigns the first player as controller and keeps later players ordinary', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }

    const firstPlayer = await connectClient();
    const firstJoined = await emitJoinPlayer(firstPlayer, {
      roomCode: created.room.code.toLowerCase(),
      displayName: 'Silver Owl',
    });
    if (!firstJoined.ok) {
      throw new Error('First player join failed in test setup.');
    }

    expect(firstJoined.room.controllerPlayerId).toBe(
      firstJoined.session.playerId,
    );
    expect(firstJoined.room.controllerStatus).toBe('assigned');
    expect(firstJoined.room.players[0]).toMatchObject({
      id: firstJoined.session.playerId,
      isController: true,
    });

    const stateWithSecondPlayer = nextRoomState(
      display,
      (room) => room.players.length === 2,
    );
    const secondPlayer = await connectClient();
    const secondJoined = await emitJoinPlayer(secondPlayer, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });

    expect(secondJoined.ok).toBe(true);
    if (secondJoined.ok) {
      expect(secondJoined.room.controllerPlayerId).toBe(
        firstJoined.session.playerId,
      );
      expect(
        secondJoined.room.players.find(
          (player) => player.id === secondJoined.session.playerId,
        )?.isController,
      ).toBe(false);
    }
    expect((await stateWithSecondPlayer).players).toHaveLength(2);
  });

  it('broadcasts an atomic controller transfer to every room session', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    const controllerJoined = await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    if (!controllerJoined.ok) {
      throw new Error('Controller join failed in test setup.');
    }
    const target = await connectClient();
    const targetJoined = await emitJoinPlayer(target, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });
    if (!targetJoined.ok) {
      throw new Error('Target join failed in test setup.');
    }

    const displayUpdate = nextRoomState(
      display,
      (room) => room.controllerPlayerId === targetJoined.session.playerId,
    );
    const targetUpdate = nextRoomState(
      target,
      (room) => room.controllerPlayerId === targetJoined.session.playerId,
    );
    const response = await emitTransferController(controller, {
      targetPlayerId: targetJoined.session.playerId,
    });

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.room.controllerStatus).toBe('assigned');
      expect(response.room.controllerPlayerId).toBe(
        targetJoined.session.playerId,
      );
      expect(
        response.room.players.find(
          (player) => player.id === controllerJoined.session.playerId,
        )?.isController,
      ).toBe(false);
    }
    expect((await displayUpdate).controllerPlayerId).toBe(
      targetJoined.session.playerId,
    );
    expect(
      (await targetUpdate).players.find(
        (player) => player.id === targetJoined.session.playerId,
      )?.isController,
    ).toBe(true);
  });

  it('rejects unauthorized controller events and malformed targets', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    const ordinary = await connectClient();
    const ordinaryJoined = await emitJoinPlayer(ordinary, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });
    if (!ordinaryJoined.ok) {
      throw new Error('Ordinary player join failed in test setup.');
    }
    const unbound = await connectClient();

    expect(
      await emitTransferController(display, {
        targetPlayerId: ordinaryJoined.session.playerId,
      }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_CONTROLLER' } });
    expect(
      await emitTransferController(ordinary, {
        targetPlayerId: ordinaryJoined.session.playerId,
      }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_CONTROLLER' } });
    expect(
      await emitTransferController(unbound, {
        targetPlayerId: ordinaryJoined.session.playerId,
      }),
    ).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(
      await emitTransferController(controller, {
        targetPlayerId: 'x'.repeat(1_000),
      } as never),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
  });

  it('rejects missing and disconnected transfer targets', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    const target = await connectClient();
    const targetJoined = await emitJoinPlayer(target, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });
    if (!targetJoined.ok) {
      throw new Error('Target join failed in test setup.');
    }

    expect(
      await emitTransferController(controller, {
        targetPlayerId: '00000000-0000-4000-8000-000000000999',
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'TARGET_PLAYER_NOT_FOUND' },
    });

    const targetOffline = nextRoomState(display, (room) =>
      room.players.some(
        (player) =>
          player.id === targetJoined.session.playerId && !player.connected,
      ),
    );
    target.disconnect();
    await targetOffline;
    expect(
      await emitTransferController(controller, {
        targetPlayerId: targetJoined.session.playerId,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'TARGET_PLAYER_OFFLINE' },
    });
  });

  it('allows only one winner when stale transfer requests race', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    const second = await connectClient();
    const secondJoined = await emitJoinPlayer(second, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });
    const third = await connectClient();
    const thirdJoined = await emitJoinPlayer(third, {
      roomCode: created.room.code,
      displayName: 'Copper Lynx',
    });
    if (!secondJoined.ok || !thirdJoined.ok) {
      throw new Error('Player join failed in test setup.');
    }

    const responses = await Promise.all([
      emitTransferController(controller, {
        targetPlayerId: secondJoined.session.playerId,
      }),
      emitTransferController(controller, {
        targetPlayerId: thirdJoined.session.playerId,
      }),
    ]);

    expect(responses.filter((response) => response.ok)).toHaveLength(1);
    expect(
      responses.filter(
        (response) => !response.ok && response.error.code === 'NOT_CONTROLLER',
      ),
    ).toHaveLength(1);
    expect(
      server.roomStore
        .getRoomState(created.room.code)
        ?.players.filter((player) => player.isController),
    ).toHaveLength(1);
  });

  it('automatically promotes the earliest connected player when the controller leaves', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    const controllerJoined = await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    const second = await connectClient();
    const secondJoined = await emitJoinPlayer(second, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });
    const third = await connectClient();
    const thirdJoined = await emitJoinPlayer(third, {
      roomCode: created.room.code,
      displayName: 'Copper Lynx',
    });
    if (!controllerJoined.ok || !secondJoined.ok || !thirdJoined.ok) {
      throw new Error('Player join failed in test setup.');
    }

    const eligiblePlayers = thirdJoined.room.players
      .filter((player) => player.id !== controllerJoined.session.playerId)
      .sort(
        (left, right) =>
          Date.parse(left.joinedAt) - Date.parse(right.joinedAt) ||
          left.id.localeCompare(right.id),
      );
    const expectedSuccessor = eligiblePlayers[0];
    const unrelatedPlayer = eligiblePlayers[1];
    if (!expectedSuccessor || !unrelatedPlayer) {
      throw new Error('Successor setup failed in test.');
    }

    const roomStateListenersBefore = display.listeners('room:state').length;
    const successionUpdate = nextRoomState(
      display,
      (room) =>
        room.controllerStatus === 'assigned' &&
        !room.players.some(
          (player) => player.id === controllerJoined.session.playerId,
        ),
    );
    expect(display.listeners('room:state')).toHaveLength(
      roomStateListenersBefore + 1,
    );

    const leaveResponse = emitLeavePlayer(controller);
    const [response, updatedRoom] = await Promise.all([
      leaveResponse,
      successionUpdate,
    ]);

    expect(response).toEqual({ ok: true });
    expect(display.listeners('room:state')).toHaveLength(
      roomStateListenersBefore,
    );
    expect(updatedRoom.controllerStatus).toBe('assigned');
    expect(updatedRoom.controllerPlayerId).toBe(expectedSuccessor.id);
    expect(updatedRoom.players.filter((player) => player.isController)).toEqual(
      [expect.objectContaining({ id: expectedSuccessor.id })],
    );
    expect(
      updatedRoom.players.some(
        (player) => player.id === controllerJoined.session.playerId,
      ),
    ).toBe(false);
    expect(
      updatedRoom.players.find((player) => player.id === expectedSuccessor.id),
    ).toMatchObject({ connected: true, isController: true });
    expect(
      updatedRoom.players.find((player) => player.id === unrelatedPlayer.id),
    ).toMatchObject({ connected: true, isController: false });
    const storedRoom = server.roomStore.getRoomState(created.room.code);
    expect(storedRoom).toEqual({
      ...updatedRoom,
      serverTime: expect.any(String),
    });
    expect(Date.parse(storedRoom?.serverTime ?? '')).toBeGreaterThanOrEqual(
      Date.parse(updatedRoom.serverTime),
    );
    expect(server.roomStore.roomCount).toBe(1);
  });

  it('broadcasts controller succession once after disconnect grace expires', async () => {
    await server.stop();
    server = createWordsServer(
      {
        port: 0,
        reconnectGraceMs: 30,
        cleanupIntervalMs: 10,
      },
      testDependencies,
    );
    port = await server.start(0);

    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    const second = await connectClient();
    const secondJoined = await emitJoinPlayer(second, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });
    if (!secondJoined.ok) {
      throw new Error('Player join failed in test setup.');
    }

    const observedTransitions: RoomState[] = [];
    const observeSuccession = (room: RoomState) => {
      if (room.controllerPlayerId === secondJoined.session.playerId) {
        observedTransitions.push(room);
      }
    };
    second.on('room:state', observeSuccession);
    const successionUpdate = nextRoomState(
      display,
      (room) => room.controllerPlayerId === secondJoined.session.playerId,
    );
    controller.disconnect();
    const updatedRoom = await successionUpdate;
    await new Promise((resolve) => setTimeout(resolve, 30));
    second.off('room:state', observeSuccession);

    expect(updatedRoom.controllerPlayerId).toBe(secondJoined.session.playerId);
    expect(observedTransitions).toHaveLength(1);
  });

  it('returns structured errors for missing rooms and malformed payloads', async () => {
    const missingRoomClient = await connectClient();
    const missing = await emitJoinPlayer(missingRoomClient, {
      roomCode: 'ZZZ999',
      displayName: 'Silver Owl',
    });
    expect(missing).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND' },
    });

    const malformedClient = await connectClient();
    const malformed = await emitJoinPlayer(malformedClient, {
      roomCode: 'bad',
      displayName: '',
    } as never);
    expect(malformed).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
  });

  it('allows eight players in addition to the display session', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }

    for (let index = 1; index <= 8; index += 1) {
      const player = await connectClient();
      const response = await emitJoinPlayer(player, {
        roomCode: created.room.code,
        displayName: `Player ${index}`,
      });
      expect(response.ok).toBe(true);
    }

    expect(
      server.roomStore.getRoomState(created.room.code)?.players,
    ).toHaveLength(8);

    const extraPlayer = await connectClient();
    const rejected = await emitJoinPlayer(extraPlayer, {
      roomCode: created.room.code,
      displayName: 'Player 9',
    });
    expect(rejected).toMatchObject({
      ok: false,
      error: { code: 'ROOM_FULL' },
    });
  });

  it('does not close the room when the display disconnects', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    const controllerJoined = await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    if (!controllerJoined.ok) {
      throw new Error('Controller join failed in test setup.');
    }

    const displayOffline = nextRoomState(
      controller,
      (room) => !room.display.connected,
    );
    display.disconnect();
    expect((await displayOffline).players).toHaveLength(1);
    expect(server.roomStore.roomCount).toBe(1);

    const laterPlayer = await connectClient();
    expect(
      await emitJoinPlayer(laterPlayer, {
        roomCode: created.room.code,
        displayName: 'Amber Kite',
      }),
    ).toMatchObject({ ok: true });
  });

  it('does not close the room when the controller player disconnects', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    const controllerJoined = await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    if (!controllerJoined.ok) {
      throw new Error('Controller join failed in test setup.');
    }
    const ordinary = await connectClient();
    const ordinaryJoined = await emitJoinPlayer(ordinary, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });
    if (!ordinaryJoined.ok) {
      throw new Error('Ordinary player join failed in test setup.');
    }

    const controllerOffline = nextRoomState(display, (room) => {
      const player = room.players.find(
        (entry) => entry.id === controllerJoined.session.playerId,
      );
      return player !== undefined && !player.connected;
    });
    controller.disconnect();
    const room = await controllerOffline;

    expect(room.controllerPlayerId).toBe(ordinaryJoined.session.playerId);
    expect(room.controllerStatus).toBe('assigned');
    expect(room.players).toHaveLength(2);
    expect(server.roomStore.roomCount).toBe(1);
  });

  it('reconnects the correct display and player roles without duplication', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const player = await connectClient();
    const joined = await emitJoinPlayer(player, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    if (!joined.ok) {
      throw new Error('Player join failed in test setup.');
    }

    display.disconnect();
    player.disconnect();

    const returningDisplay = await connectClient();
    const displayReconnected = await emitReconnectDisplay(returningDisplay, {
      roomCode: created.room.code,
      displayReconnectToken: created.session.displayReconnectToken,
    });
    expect(displayReconnected.ok).toBe(true);
    if (displayReconnected.ok) {
      expect(displayReconnected.session.displaySessionId).toBe(
        created.session.displaySessionId,
      );
      expect(displayReconnected.room.display.connected).toBe(true);
    }

    const returningPlayer = await connectClient();
    const playerReconnected = await emitReconnectPlayer(returningPlayer, {
      roomCode: created.room.code,
      playerReconnectToken: joined.session.playerReconnectToken,
    });
    expect(playerReconnected.ok).toBe(true);
    if (playerReconnected.ok) {
      expect(playerReconnected.session.playerId).toBe(joined.session.playerId);
      expect(playerReconnected.room.players).toHaveLength(1);
      expect(playerReconnected.room.players[0]?.isController).toBe(true);
    }
  });

  it('prevents reconnect credentials from impersonating the other role', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const player = await connectClient();
    const joined = await emitJoinPlayer(player, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    if (!joined.ok) {
      throw new Error('Player join failed in test setup.');
    }

    const playerImpostor = await connectClient();
    expect(
      await emitReconnectPlayer(playerImpostor, {
        roomCode: created.room.code,
        playerReconnectToken: created.session.displayReconnectToken,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'RECONNECT_FAILED' },
    });

    const displayImpostor = await connectClient();
    expect(
      await emitReconnectDisplay(displayImpostor, {
        roomCode: created.room.code,
        displayReconnectToken: joined.session.playerReconnectToken,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'RECONNECT_FAILED' },
    });
  });

  it('keeps the newest role sockets authoritative during refresh races', async () => {
    const staleDisplay = await connectClient();
    const created = await emitCreateDisplay(staleDisplay);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const stalePlayer = await connectClient();
    const joined = await emitJoinPlayer(stalePlayer, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    if (!joined.ok) {
      throw new Error('Player join failed in test setup.');
    }

    const staleDisplayError = nextRoomError(staleDisplay);
    const currentDisplay = await connectClient();
    const displayReconnected = await emitReconnectDisplay(currentDisplay, {
      roomCode: created.room.code,
      displayReconnectToken: created.session.displayReconnectToken,
    });
    expect(displayReconnected.ok).toBe(true);
    expect(await staleDisplayError).toMatchObject({
      code: 'RECONNECT_FAILED',
    });
    staleDisplay.disconnect();
    expect(
      server.roomStore.getRoomState(created.room.code)?.display.connected,
    ).toBe(true);

    const stalePlayerError = nextRoomError(stalePlayer);
    const currentPlayer = await connectClient();
    const playerReconnected = await emitReconnectPlayer(currentPlayer, {
      roomCode: created.room.code,
      playerReconnectToken: joined.session.playerReconnectToken,
    });
    expect(playerReconnected.ok).toBe(true);
    expect(await stalePlayerError).toMatchObject({
      code: 'RECONNECT_FAILED',
    });
    const target = await connectClient();
    const targetJoined = await emitJoinPlayer(target, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });
    if (!targetJoined.ok) {
      throw new Error('Target join failed in test setup.');
    }
    expect(
      await emitTransferController(currentPlayer, {
        targetPlayerId: targetJoined.session.playerId,
      }),
    ).toMatchObject({ ok: true });

    stalePlayer.disconnect();
    const room = server.roomStore.getRoomState(created.room.code);
    expect(room?.display.connected).toBe(true);
    expect(room?.players).toHaveLength(2);
    expect(
      room?.players.find(
        (player) => player.id === targetJoined.session.playerId,
      ),
    ).toMatchObject({
      connected: true,
      isController: true,
    });
  });

  it('leaves display and controller sessions without closing the room', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    const ordinary = await connectClient();
    await emitJoinPlayer(ordinary, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });

    expect(await emitLeaveDisplay(display)).toEqual({ ok: true });
    expect(server.roomStore.roomCount).toBe(1);
    expect(await emitLeavePlayer(controller)).toEqual({ ok: true });
    expect(server.roomStore.roomCount).toBe(1);
    expect(server.roomStore.getRoomState(created.room.code)).toMatchObject({
      controllerStatus: 'assigned',
      players: [
        expect.objectContaining({
          connected: true,
          isController: true,
        }),
      ],
    });
  });

  it('returns a structured rate-limit error after repeated attempts', async () => {
    await server.stop();
    server = createWordsServer(
      {
        port: 0,
        cleanupIntervalMs: 60_000,
        rateLimitAttempts: 2,
      },
      testDependencies,
    );
    port = await server.start(0);

    const client = await connectClient();
    const input = {
      roomCode: 'ZZZ999',
      displayName: 'Silver Owl',
    } as const;

    expect(await emitJoinPlayer(client, input)).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND' },
    });
    expect(await emitJoinPlayer(client, input)).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND' },
    });
    expect(await emitJoinPlayer(client, input)).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
  });

  it('keeps HTML-like display names as plain player network data', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const player = await connectClient();
    const response = await emitJoinPlayer(player, {
      roomCode: created.room.code,
      displayName: '<Bright Fox>',
    });

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.room.players[0]?.displayName).toBe('<Bright Fox>');
    }
  });

  it('broadcasts an authoritative settings update to the room', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    const joined = await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    if (!joined.ok) {
      throw new Error('Controller join failed in test setup.');
    }
    const settings = {
      gridSize: 6 as const,
      roundDurationSeconds: 60 as const,
      scoringMode: 'length-plus-unique' as const,
    };
    const displayed = nextRoomState(
      display,
      (room) => room.settings.gridSize === 6,
    );
    const response = await emitUpdateSettings(controller, settings);

    expect(response).toMatchObject({ ok: true, room: { settings } });
    expect((await displayed).settings).toEqual(settings);
  });

  it('rejects settings updates from the display and an ordinary player', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    const ordinary = await connectClient();
    await emitJoinPlayer(ordinary, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });
    const settings = {
      gridSize: 5 as const,
      roundDurationSeconds: 90 as const,
      scoringMode: 'length-plus-unique' as const,
    };

    expect(await emitUpdateSettings(display, settings)).toMatchObject({
      ok: false,
      error: { code: 'NOT_CONTROLLER' },
    });
    expect(await emitUpdateSettings(ordinary, settings)).toMatchObject({
      ok: false,
      error: { code: 'NOT_CONTROLLER' },
    });
  });

  it('rejects partial, extra, and client-authority settings payloads', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });

    for (const payload of [
      { gridSize: 5 },
      {
        gridSize: 5,
        roundDurationSeconds: 60,
        scoringMode: 'length-plus-unique',
        controllerPlayerId: created.session.displaySessionId,
      },
    ]) {
      const response = await new Promise<ControllerActionResponse>((resolve) =>
        controller.emit(
          'controller:update-settings',
          payload as never,
          resolve,
        ),
      );
      expect(response).toMatchObject({
        ok: false,
        error: { code: 'INVALID_PAYLOAD' },
      });
    }
  });

  it('starts one authoritative round and broadcasts the same board', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    const ordinary = await connectClient();
    const ordinaryJoined = await emitJoinPlayer(ordinary, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });
    if (!ordinaryJoined.ok) {
      throw new Error('Ordinary player join failed in test setup.');
    }
    const displayState = nextRoomState(
      display,
      (room) => room.phase === 'ROUND_ACTIVE',
    );
    const ordinaryState = nextRoomState(
      ordinary,
      (room) => room.phase === 'ROUND_ACTIVE',
    );

    const response = await emitStartRound(controller);
    expect(response.ok).toBe(true);
    if (!response.ok) {
      return;
    }
    const [onDisplay, onOrdinary] = await Promise.all([
      displayState,
      ordinaryState,
    ]);
    expect(onDisplay.round).toEqual(response.room.round);
    expect(onOrdinary.round).toEqual(response.room.round);
    expect(response.room.round?.participants).toHaveLength(2);
    expect(response.room.round?.board.tiles).toHaveLength(25);
  });

  it('rejects round starts from non-controllers and unexpected payloads', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    const ordinary = await connectClient();
    await emitJoinPlayer(ordinary, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });

    expect(await emitStartRound(display)).toMatchObject({
      ok: false,
      error: { code: 'NOT_CONTROLLER' },
    });
    expect(await emitStartRound(ordinary)).toMatchObject({
      ok: false,
      error: { code: 'NOT_CONTROLLER' },
    });
    const malformed = await new Promise<ControllerActionResponse>((resolve) =>
      controller.emit(
        'controller:start-round',
        { duration: 30 } as never,
        resolve,
      ),
    );
    expect(malformed).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
  });

  it('rejects active-round settings changes and duplicate starts', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    expect((await emitStartRound(controller)).ok).toBe(true);

    expect(await emitStartRound(controller)).toMatchObject({
      ok: false,
      error: { code: 'ROUND_IN_PROGRESS' },
    });
    expect(
      await emitUpdateSettings(controller, {
        gridSize: 5,
        roundDurationSeconds: 60,
        scoringMode: 'length-plus-unique',
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'ROUND_IN_PROGRESS' },
    });
  });

  it('broadcasts automatic round ending once and clears its single scheduler', async () => {
    await server.stop();
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    let lifecycleSweep: (() => void) | undefined;
    const fakeTimer = {
      unref: vi.fn(),
    } as unknown as ReturnType<typeof setInterval>;
    const clearLifecycleTimer = vi.fn();
    const lifecycleDependencies: WordsServerDependencies = {
      ...testDependencies,
      now: () => now,
      setInterval: (callback) => {
        lifecycleSweep = callback;
        return fakeTimer;
      },
      clearInterval: clearLifecycleTimer,
    };
    server = createWordsServer(
      {
        port: 0,
        cleanupIntervalMs: 60_000,
      },
      lifecycleDependencies,
    );
    port = await server.start(0);

    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    await emitUpdateSettings(controller, {
      gridSize: 4,
      roundDurationSeconds: 30,
      scoringMode: 'length-plus-unique',
    });
    const started = await emitStartRound(controller);
    if (!started.ok || !started.room.round) {
      throw new Error('Round start failed in test setup.');
    }
    const endedState = nextRoomState(
      display,
      (room) => room.phase === 'ROUND_ENDED',
    );
    now += 30_000;
    lifecycleSweep?.();

    const ended = await endedState;
    expect(ended.round?.endedAt).toBe(started.room.round.deadlineAt);
    expect(server.roomStore.advanceDueRounds()).toEqual([]);
    lifecycleSweep?.();
    await server.stop();
    expect(clearLifecycleTimer).toHaveBeenCalledTimes(1);
    expect(clearLifecycleTimer).toHaveBeenCalledWith(fakeTimer);
  });

  it('does not let one corrupt cleanup room suppress another room update', async () => {
    await server.stop();
    let now = Date.parse('2026-07-30T20:00:00.000Z');
    let lifecycleSweep: (() => void) | undefined;
    server = createWordsServer(
      {
        port: 0,
        reconnectGraceMs: 1_000,
        cleanupIntervalMs: 1_000,
      },
      {
        ...testDependencies,
        now: () => now,
        setInterval: (callback) => {
          lifecycleSweep = callback;
          return { unref: vi.fn() } as unknown as ReturnType<
            typeof setInterval
          >;
        },
        clearInterval: vi.fn(),
      },
    );
    port = await server.start(0);

    const corruptDisplay = await connectClient();
    const corruptRoom = await emitCreateDisplay(corruptDisplay);
    if (!corruptRoom.ok) throw new Error('Corrupt-room display setup failed.');
    const corruptController = await connectClient();
    const corruptControllerJoin = await emitJoinPlayer(corruptController, {
      roomCode: corruptRoom.room.code,
      displayName: 'Silver Owl',
    });
    const expiringPlayer = await connectClient();
    const expiringPlayerJoin = await emitJoinPlayer(expiringPlayer, {
      roomCode: corruptRoom.room.code,
      displayName: 'Amber Kite',
    });
    const corruptRound = await emitStartRound(corruptController);
    if (
      !corruptControllerJoin.ok ||
      !expiringPlayerJoin.ok ||
      !corruptRound.ok ||
      !corruptRound.room.round
    ) {
      throw new Error('Corrupt-room round setup failed.');
    }

    const validDisplay = await connectClient();
    const validRoom = await emitCreateDisplay(validDisplay);
    if (!validRoom.ok) throw new Error('Valid-room display setup failed.');
    const expiringController = await connectClient();
    const expiringControllerJoin = await emitJoinPlayer(expiringController, {
      roomCode: validRoom.room.code,
      displayName: 'Copper Fox',
    });
    const successor = await connectClient();
    const successorJoin = await emitJoinPlayer(successor, {
      roomCode: validRoom.room.code,
      displayName: 'Violet Heron',
    });
    if (!expiringControllerJoin.ok || !successorJoin.ok) {
      throw new Error('Valid-room player setup failed.');
    }

    const corruptDisconnect = nextRoomState(
      corruptDisplay,
      (room) =>
        room.players.find(
          (player) => player.id === expiringPlayerJoin.session.playerId,
        )?.connected === false,
    );
    expiringPlayer.disconnect();
    await corruptDisconnect;
    const validDisconnect = nextRoomState(
      validDisplay,
      (room) =>
        room.players.find(
          (player) => player.id === expiringControllerJoin.session.playerId,
        )?.connected === false,
    );
    expiringController.disconnect();
    await validDisconnect;

    const internal = server.roomStore as unknown as {
      rooms: Map<string, { roundSubmissions: Map<string, unknown> | null }>;
    };
    internal.rooms
      .get(corruptRoom.room.code)
      ?.roundSubmissions?.delete(corruptControllerJoin.session.playerId);

    const promotedState = nextRoomState(
      validDisplay,
      (room) => room.controllerPlayerId === successorJoin.session.playerId,
    );
    now = Date.parse(corruptRound.room.round.deadlineAt);
    lifecycleSweep?.();

    await expect(promotedState).resolves.toMatchObject({
      controllerPlayerId: successorJoin.session.playerId,
      players: [
        expect.objectContaining({
          id: successorJoin.session.playerId,
          isController: true,
        }),
      ],
    });
  });

  it('publishes identical public results through only room:state', async () => {
    await server.stop();
    let now = Date.parse('2026-07-30T20:00:00.000Z');
    let lifecycleSweep: (() => void) | undefined;
    server = createWordsServer(
      { port: 0, cleanupIntervalMs: 60_000 },
      {
        ...testDependencies,
        now: () => now,
        setInterval: (callback) => {
          lifecycleSweep = callback;
          return { unref: vi.fn() } as unknown as ReturnType<
            typeof setInterval
          >;
        },
        clearInterval: vi.fn(),
      },
    );
    port = await server.start(0);

    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) throw new Error('Display creation failed.');
    const first = await connectClient();
    const firstJoin = await emitJoinPlayer(first, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    const second = await connectClient();
    const secondJoin = await emitJoinPlayer(second, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });
    const started = await emitStartRound(first);
    if (!started.ok || !started.room.round || !firstJoin.ok || !secondJoin.ok) {
      throw new Error('Round setup failed.');
    }
    for (const player of [first, second]) {
      expect(
        await emitSubmitWord(player, {
          roundId: started.room.round.id,
          word: 'ABC',
          path: [0, 1, 2],
        }),
      ).toMatchObject({ ok: true });
    }

    const observedEvents = new Set<string>();
    for (const client of [display, first, second]) {
      client.onAny((event) => observedEvents.add(event));
    }
    const displayEnded = nextRoomState(
      display,
      (room) => room.phase === 'ROUND_ENDED',
    );
    const firstEnded = nextRoomState(
      first,
      (room) => room.phase === 'ROUND_ENDED',
    );
    const secondEnded = nextRoomState(
      second,
      (room) => room.phase === 'ROUND_ENDED',
    );
    now = Date.parse(started.room.round.deadlineAt);
    lifecycleSweep?.();

    const [displayResult, firstResult, secondResult] = await Promise.all([
      displayEnded,
      firstEnded,
      secondEnded,
    ]);
    const participantPlayerIds = started.room.round.participants.map(
      (participant) => participant.playerId,
    );
    expect(firstResult.round?.results).toEqual(displayResult.round?.results);
    expect(secondResult.round?.results).toEqual(displayResult.round?.results);
    expect(displayResult.round?.results).toMatchObject({
      winnerPlayerIds: participantPlayerIds,
      players: participantPlayerIds.map((playerId) => ({
        playerId,
        rank: 1,
        baseScore: 3,
        uniqueBonusScore: 0,
        finalScore: 3,
        words: [{ word: 'ABC', shared: true, finalPoints: 3 }],
      })),
    });
    expect(observedEvents).toEqual(new Set(['room:state']));

    first.disconnect();
    const reconnected = await connectClient();
    const recovered = await emitReconnectPlayer(reconnected, {
      roomCode: created.room.code,
      playerReconnectToken: firstJoin.session.playerReconnectToken,
    });
    expect(recovered).toMatchObject({
      ok: true,
      room: {
        phase: 'ROUND_ENDED',
        round: { results: displayResult.round?.results },
      },
      submissionState: {
        playerId: firstJoin.session.playerId,
        acceptedWords: [{ word: 'ABC' }],
      },
    });
  });

  it('keeps one authoritative results window before resetting to the lobby', async () => {
    await server.stop();
    let now = Date.parse('2026-07-30T20:00:00.000Z');
    let lifecycleSweep: (() => void) | undefined;
    server = createWordsServer(
      { port: 0, cleanupIntervalMs: 60_000 },
      {
        ...testDependencies,
        now: () => now,
        setInterval: (callback) => {
          lifecycleSweep = callback;
          return { unref: vi.fn() } as unknown as ReturnType<
            typeof setInterval
          >;
        },
        clearInterval: vi.fn(),
      },
    );
    port = await server.start(0);
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) throw new Error('Display creation failed.');
    const controller = await connectClient();
    const controllerJoin = await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    const successor = await connectClient();
    const successorJoin = await emitJoinPlayer(successor, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });
    const started = await emitStartRound(controller);
    if (
      !started.ok ||
      !started.room.round ||
      !controllerJoin.ok ||
      !successorJoin.ok
    ) {
      throw new Error('Round setup failed.');
    }

    expect(
      await emitSubmitWord(controller, {
        roundId: started.room.round.id,
        word: 'ABC',
        path: [0, 1, 2],
      }),
    ).toMatchObject({ ok: true });

    const observedPhases: string[] = [];
    const lifecycleEvents = new Set<string>();
    display.on('room:state', (room) => {
      observedPhases.push(room.phase);
    });
    display.onAny((event) => lifecycleEvents.add(event));
    const endedState = nextRoomState(
      display,
      (room) => room.phase === 'ROUND_ENDED',
    );
    now = Date.parse(started.room.round.deadlineAt);
    lifecycleSweep?.();
    const ended = await endedState;

    expect(ended.round?.results).toMatchObject({
      players: expect.arrayContaining([
        expect.objectContaining({
          playerId: controllerJoin.session.playerId,
          finalScore: 4,
        }),
      ]),
    });
    expect(lifecycleEvents).toEqual(new Set(['room:state']));
    expect(
      await emitUpdateSettings(controller, {
        gridSize: 6,
        roundDurationSeconds: 60,
        scoringMode: 'length-plus-unique',
      }),
    ).toMatchObject({ ok: false, error: { code: 'ROUND_IN_PROGRESS' } });
    expect(await emitStartRound(controller)).toMatchObject({
      ok: false,
      error: { code: 'ROUND_IN_PROGRESS' },
    });

    const transferBroadcast = nextRoomState(
      display,
      (room) =>
        room.phase === 'ROUND_ENDED' &&
        room.controllerPlayerId === successorJoin.session.playerId,
    );
    expect(
      await emitTransferController(controller, {
        targetPlayerId: successorJoin.session.playerId,
      }),
    ).toMatchObject({
      ok: true,
      room: {
        phase: 'ROUND_ENDED',
        controllerPlayerId: successorJoin.session.playerId,
      },
    });

    await transferBroadcast;
    const broadcastCountAfterTransfer = observedPhases.length;
    lifecycleSweep?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(observedPhases).toHaveLength(broadcastCountAfterTransfer);

    const controllerDisconnected = nextRoomState(
      display,
      (room) =>
        room.players.find(
          (player) => player.id === controllerJoin.session.playerId,
        )?.connected === false,
    );
    controller.disconnect();
    await controllerDisconnected;
    const reconnected = await connectClient();
    const recovered = await emitReconnectPlayer(reconnected, {
      roomCode: created.room.code,
      playerReconnectToken: controllerJoin.session.playerReconnectToken,
    });
    expect(recovered).toMatchObject({
      ok: true,
      room: {
        phase: 'ROUND_ENDED',
        round: { results: ended.round?.results },
        highlights: ended.highlights,
      },
      submissionState: {
        playerId: controllerJoin.session.playerId,
        acceptedWords: [{ word: 'ABC' }],
      },
    });
    if (!recovered.ok) throw new Error('Ended-round reconnect failed.');

    await new Promise<void>((resolve) => setImmediate(resolve));
    const broadcastCountBeforeReset = observedPhases.length;
    const lobbyState = nextRoomState(
      display,
      (room) => room.phase === 'LOBBY' && room.round === null,
    );
    now += 19_999;
    lifecycleSweep?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(observedPhases).toHaveLength(broadcastCountBeforeReset);

    now += 1;
    lifecycleSweep?.();
    const lobby = await lobbyState;
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(lobby.highlights).toEqual(ended.highlights);
    expect(observedPhases.slice(broadcastCountBeforeReset)).toEqual(['LOBBY']);
    expect(observedPhases).toContain('ROUND_ENDED');
    lifecycleSweep?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(observedPhases).toHaveLength(broadcastCountBeforeReset + 1);

    const reconnectedDisconnected = nextRoomState(
      display,
      (room) =>
        room.players.find(
          (player) => player.id === controllerJoin.session.playerId,
        )?.connected === false,
    );
    reconnected.disconnect();
    await reconnectedDisconnected;
    const afterReset = await connectClient();
    expect(
      await emitReconnectPlayer(afterReset, {
        roomCode: created.room.code,
        playerReconnectToken: recovered.session.playerReconnectToken,
      }),
    ).toMatchObject({
      ok: true,
      room: { phase: 'LOBBY', round: null, highlights: ended.highlights },
      submissionState: null,
    });

    expect(
      await emitUpdateSettings(successor, {
        gridSize: 6,
        roundDurationSeconds: 60,
        scoringMode: 'length-plus-unique',
      }),
    ).toMatchObject({ ok: true, room: { phase: 'LOBBY' } });
    expect(await emitStartRound(successor)).toMatchObject({
      ok: true,
      room: {
        phase: 'ROUND_ACTIVE',
        round: { number: 2, results: null },
      },
    });
  });

  it('lets room expiry suppress an otherwise due result snapshot', async () => {
    await server.stop();
    let now = Date.parse('2026-07-30T20:00:00.000Z');
    let lifecycleSweep: (() => void) | undefined;
    server = createWordsServer(
      {
        port: 0,
        roomTtlMs: 30_000,
        cleanupIntervalMs: 1_000,
      },
      {
        ...testDependencies,
        now: () => now,
        setInterval: (callback) => {
          lifecycleSweep = callback;
          return { unref: vi.fn() } as unknown as ReturnType<
            typeof setInterval
          >;
        },
        clearInterval: vi.fn(),
      },
    );
    port = await server.start(0);
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) throw new Error('Display creation failed.');
    const controller = await connectClient();
    await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    await emitUpdateSettings(controller, {
      gridSize: 4,
      roundDurationSeconds: 30,
      scoringMode: 'length-plus-unique',
    });
    const started = await emitStartRound(controller);
    if (!started.ok || !started.room.round) {
      throw new Error('Round setup failed.');
    }

    const roomStates: RoomState[] = [];
    display.on('room:state', (room) => roomStates.push(room));
    const expired = nextRoomError(display);
    now = Date.parse(started.room.round.deadlineAt);
    lifecycleSweep?.();

    await expect(expired).resolves.toMatchObject({ code: 'ROOM_EXPIRED' });
    expect(roomStates).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: 'ROUND_ENDED' }),
      ]),
    );
  });

  it('broadcasts a deadline transition even when the triggering action is rejected', async () => {
    await server.stop();
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    let lifecycleSweep: (() => void) | undefined;
    server = createWordsServer(
      {
        port: 0,
        cleanupIntervalMs: 60_000,
      },
      {
        ...testDependencies,
        now: () => now,
        setInterval: (callback) => {
          lifecycleSweep = callback;
          return { unref: vi.fn() } as unknown as ReturnType<
            typeof setInterval
          >;
        },
        clearInterval: vi.fn(),
      },
    );
    port = await server.start(0);

    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    const ordinary = await connectClient();
    await emitJoinPlayer(ordinary, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });
    const started = await emitStartRound(controller);
    if (!started.ok || !started.room.round) {
      throw new Error('Round start failed in test setup.');
    }

    const endedBroadcasts: RoomState[] = [];
    display.on('room:state', (room) => {
      if (room.phase === 'ROUND_ENDED') {
        endedBroadcasts.push(room);
      }
    });
    const endedState = nextRoomState(
      display,
      (room) => room.phase === 'ROUND_ENDED',
    );
    now = Date.parse(started.room.round.deadlineAt);

    expect(await emitStartRound(ordinary)).toMatchObject({
      ok: false,
      error: { code: 'NOT_CONTROLLER' },
    });
    const ended = await endedState;
    expect(ended.round?.endedAt).toBe(started.room.round.deadlineAt);
    expect(endedBroadcasts).toHaveLength(1);

    lifecycleSweep?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(endedBroadcasts).toHaveLength(1);
  });

  it('returns a bounded board-generation error without a partial start', async () => {
    await server.stop();
    server = createWordsServer(
      {
        port: 0,
        cleanupIntervalMs: 60_000,
      },
      {
        ...testDependencies,
        boardGenerator: () => ({
          success: false,
          code: 'NO_ACCEPTABLE_BOARD',
          attempts: 8,
        }),
      },
    );
    port = await server.start(0);
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) {
      throw new Error('Display creation failed in test setup.');
    }
    const controller = await connectClient();
    await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });

    expect(await emitStartRound(controller)).toEqual({
      ok: false,
      error: {
        code: 'BOARD_GENERATION_FAILED',
        message:
          'A playable board could not be generated. Try starting the round again.',
      },
    });
    expect(server.roomStore.getRoomState(created.room.code)).toMatchObject({
      phase: 'LOBBY',
      round: null,
    });
  });

  it('uses the median selector with eight production-valid candidates', async () => {
    await server.stop();
    const randomSource = { next: vi.fn(() => 0.5) };
    const boardGenerator = vi.fn(({ size, random }) => {
      expect(random).toBe(randomSource);
      return {
        success: true as const,
        board: {
          size,
          tiles: Array.from({ length: size * size }, (_, index) =>
            String.fromCharCode(65 + (index % 26)),
          ),
        },
        attempts: 1,
      };
    });
    server = createWordsServer(
      { port: 0, cleanupIntervalMs: 60_000 },
      { ...testDependencies, boardGenerator, randomSource },
    );
    port = await server.start(0);
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) throw new Error('Display creation failed.');
    const controller = await connectClient();
    await emitJoinPlayer(controller, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });

    const started = await emitStartRound(controller);
    expect(started).toMatchObject({
      ok: true,
      room: { round: { generationAttempts: 1 } },
    });
    expect(boardGenerator).toHaveBeenCalledTimes(8);
  });

  it('broadcasts one count-only progress snapshot while keeping accepted words private', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) throw new Error('Display creation failed.');
    const first = await connectClient();
    const firstJoin = await emitJoinPlayer(first, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    const second = await connectClient();
    const secondJoin = await emitJoinPlayer(second, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });
    const activeBroadcast = nextRoomState(
      display,
      (room) => room.phase === 'ROUND_ACTIVE',
    );
    const started = await emitStartRound(first);
    if (!started.ok || !started.room.round || !firstJoin.ok || !secondJoin.ok) {
      throw new Error('Round setup failed.');
    }
    await activeBroadcast;
    const publicVersion = started.room.stateVersion;
    const publicBroadcasts: RoomState[] = [];
    display.on('room:state', (room) => publicBroadcasts.push(room));

    const response = await emitSubmitWord(first, {
      roundId: started.room.round.id,
      word: 'ABC',
      path: [0, 1, 2],
    });
    expect(response).toMatchObject({
      ok: true,
      acceptedWord: { word: 'ABC', points: 3 },
      state: {
        playerId: firstJoin.session.playerId,
        submissionVersion: 1,
        provisionalScore: 3,
      },
    });
    expect(response).not.toHaveProperty('room');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(publicBroadcasts).toHaveLength(1);
    expect(publicBroadcasts[0]).toMatchObject({
      stateVersion: publicVersion + 1,
      round: {
        acceptedWordCounts: expect.arrayContaining([
          { playerId: firstJoin.session.playerId, count: 1 },
          { playerId: secondJoin.session.playerId, count: 0 },
        ]),
      },
    });
    expect(JSON.stringify(publicBroadcasts[0])).not.toContain('"word":"ABC"');
    expect(JSON.stringify(publicBroadcasts[0])).not.toContain('acceptedAt');
    expect(server.roomStore.getRoomState(created.room.code)?.stateVersion).toBe(
      publicVersion + 1,
    );

    expect(
      await emitSubmitWord(first, {
        roundId: started.room.round.id,
        word: 'ABC',
        path: [0, 1, 2],
      }),
    ).toMatchObject({ ok: false, error: { code: 'ALREADY_SUBMITTED' } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(publicBroadcasts).toHaveLength(1);

    second.disconnect();
    const reconnectedSecond = await connectClient();
    const recovered = await emitReconnectPlayer(reconnectedSecond, {
      roomCode: created.room.code,
      playerReconnectToken: secondJoin.session.playerReconnectToken,
    });
    expect(recovered).toMatchObject({
      ok: true,
      submissionState: {
        playerId: secondJoin.session.playerId,
        submissionVersion: 0,
        acceptedWords: [],
      },
    });
  });

  it('rejects display submissions and never returns player-private state', async () => {
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) throw new Error('Display creation failed.');
    const response = await emitSubmitWord(display, {
      roundId: '00000000-0000-4000-8000-000000000500',
      word: 'ABC',
      path: [0, 1, 2],
    });
    expect(response).toEqual({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'That player session cannot submit words.',
      },
      state: null,
    });
  });

  it('bounds malformed and unauthenticated submission events per socket', async () => {
    const unbound = await connectClient();
    const malformed = {
      roundId: 'not-a-round',
      word: 'A'.repeat(1_000),
      path: Array.from({ length: 100 }, (_, index) => index),
      unexpected: true,
    } as never;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(await emitSubmitWord(unbound, malformed)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_PAYLOAD' },
        state: null,
      });
    }
    expect(await emitSubmitWord(unbound, malformed)).toEqual({
      ok: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many words were sent. Wait a moment and try again.',
      },
      state: null,
    });
  });

  it('safely ignores a submission event without an acknowledgement callback', async () => {
    const unbound = await connectClient();
    unbound.emit(
      'player:submit-word',
      {
        roundId: '00000000-0000-4000-8000-000000000500',
        word: 'ABC',
        path: [0, 1, 2],
      },
      undefined as never,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(
      await emitSubmitWord(unbound, {
        roundId: '00000000-0000-4000-8000-000000000500',
        word: 'ABC',
        path: [0, 1, 2],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
      state: null,
    });
    await request(server.app).get('/api/health').expect(200);
  });

  it('broadcasts an exact-deadline transition before rejecting malformed input', async () => {
    await server.stop();
    let now = Date.parse('2026-07-30T20:00:00.000Z');
    server = createWordsServer(
      { port: 0, cleanupIntervalMs: 60_000 },
      { ...testDependencies, now: () => now },
    );
    port = await server.start(0);
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) throw new Error('Display creation failed.');
    const player = await connectClient();
    await emitJoinPlayer(player, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    const started = await emitStartRound(player);
    if (!started.ok || !started.room.round) {
      throw new Error('Round start failed.');
    }
    const ended = nextRoomState(
      display,
      (room) => room.phase === 'ROUND_ENDED',
    );
    now = Date.parse(started.room.round.deadlineAt);
    const response = await new Promise<SubmitWordResponse>((resolve) => {
      player.emit(
        'player:submit-word',
        { roundId: 'bad', word: 'ABC', path: [0, 1, 2] } as never,
        resolve,
      );
    });
    expect((await ended).round?.endedAt).toBe(started.room.round.deadlineAt);
    expect(response).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
      state: null,
    });
  });

  it('broadcasts exact-deadline results before a socket-rate-limit rejection', async () => {
    await server.stop();
    let now = Date.parse('2026-07-30T20:00:00.000Z');
    server = createWordsServer(
      { port: 0, cleanupIntervalMs: 60_000 },
      { ...testDependencies, now: () => now },
    );
    port = await server.start(0);
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) throw new Error('Display creation failed.');
    const player = await connectClient();
    await emitJoinPlayer(player, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    const started = await emitStartRound(player);
    if (!started.ok || !started.room.round) {
      throw new Error('Round start failed.');
    }
    now = Date.parse(started.room.round.deadlineAt) - 1;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(
        await emitSubmitWord(player, {
          roundId: 'invalid',
          word: 'ABC',
          path: [0, 1, 2],
        } as never),
      ).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    }

    const ended = nextRoomState(
      display,
      (room) => room.phase === 'ROUND_ENDED',
    );
    now += 1;
    expect(
      await emitSubmitWord(player, {
        roundId: started.room.round.id,
        word: 'ABC',
        path: [0, 1, 2],
      }),
    ).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    expect(await ended).toMatchObject({
      phase: 'ROUND_ENDED',
      round: {
        endedAt: started.room.round.deadlineAt,
        results: {
          players: [
            {
              displayName: 'Silver Owl',
              words: [],
              finalScore: 0,
            },
          ],
        },
      },
    });
  });

  it('publishes the deadline before a throwing dictionary could run', async () => {
    await server.stop();
    let now = Date.parse('2026-07-30T20:00:00.000Z');
    const dictionaryHas = vi.fn(() => {
      throw new Error('Injected dictionary failure.');
    });
    server = createWordsServer(
      { port: 0, cleanupIntervalMs: 60_000 },
      {
        ...testDependencies,
        now: () => now,
        dictionaryLoader: async () => ({
          ...successfulDictionaryLoad,
          dictionary: { has: dictionaryHas },
          words: Object.freeze([]),
        }),
      },
    );
    port = await server.start(0);
    const display = await connectClient();
    const created = await emitCreateDisplay(display);
    if (!created.ok) throw new Error('Display creation failed.');
    const player = await connectClient();
    await emitJoinPlayer(player, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    const started = await emitStartRound(player);
    if (!started.ok || !started.room.round) {
      throw new Error('Round start failed.');
    }

    const ended = nextRoomState(
      display,
      (room) => room.phase === 'ROUND_ENDED',
    );
    now = Date.parse(started.room.round.deadlineAt);
    const response = await emitSubmitWord(player, {
      roundId: started.room.round.id,
      word: 'ABC',
      path: [0, 1, 2],
    });

    expect(await ended).toMatchObject({
      phase: 'ROUND_ENDED',
      stateVersion: started.room.stateVersion + 1,
      round: { endedAt: started.room.round.deadlineAt },
    });
    expect(response).toMatchObject({
      ok: false,
      error: { code: 'ROUND_NOT_ACTIVE' },
    });
    expect(dictionaryHas).not.toHaveBeenCalled();
  });
});
