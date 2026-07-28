import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  io as createClient,
  type Socket as ClientSocket,
} from 'socket.io-client';

import type {
  ClientToServerEvents,
  CreateDisplayInput,
  DisplayActionResponse,
  JoinPlayerInput,
  LeaveSessionResponse,
  PlayerActionResponse,
  ReconnectDisplayInput,
  ReconnectPlayerInput,
  RoomError,
  RoomState,
  ServerToClientEvents,
} from '@words/shared';

import { createWordsServer, type WordsServer } from '../src/server.js';

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

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

function nextRoomState(
  client: TestClient,
  predicate: (room: RoomState) => boolean,
): Promise<RoomState> {
  return new Promise((resolve) => {
    const listener = (room: RoomState) => {
      if (predicate(room)) {
        client.off('room:state', listener);
        resolve(room);
      }
    };
    client.on('room:state', listener);
  });
}

function nextRoomError(client: TestClient): Promise<RoomError> {
  return new Promise((resolve) => client.once('room:error', resolve));
}

describe('Words Stage 2 server', () => {
  let server: WordsServer;
  let port: number;
  let clients: TestClient[];

  beforeEach(async () => {
    clients = [];
    server = createWordsServer({
      port: 0,
      cleanupIntervalMs: 60_000,
    });
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
      version: '0.2.0',
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
    expect(response.room.controllerPlayerId).toBeNull();
    expect(response.session.displaySessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.session.displayReconnectToken).toHaveLength(43);
    expect(response.session).not.toHaveProperty('playerId');
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
    await emitJoinPlayer(ordinary, {
      roomCode: created.room.code,
      displayName: 'Amber Kite',
    });

    const controllerOffline = nextRoomState(display, (room) => {
      const player = room.players.find(
        (entry) => entry.id === controllerJoined.session.playerId,
      );
      return player !== undefined && !player.connected;
    });
    controller.disconnect();
    const room = await controllerOffline;

    expect(room.controllerPlayerId).toBe(controllerJoined.session.playerId);
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
    stalePlayer.disconnect();

    const room = server.roomStore.getRoomState(created.room.code);
    expect(room?.display.connected).toBe(true);
    expect(room?.players).toHaveLength(1);
    expect(room?.players[0]).toMatchObject({
      id: joined.session.playerId,
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
    expect(
      server.roomStore.getRoomState(created.room.code)?.players,
    ).toHaveLength(2);
  });

  it('returns a structured rate-limit error after repeated attempts', async () => {
    await server.stop();
    server = createWordsServer({
      port: 0,
      cleanupIntervalMs: 60_000,
      rateLimitAttempts: 2,
    });
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
});
