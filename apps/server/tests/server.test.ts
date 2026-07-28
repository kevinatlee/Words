import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  io as createClient,
  type Socket as ClientSocket,
} from 'socket.io-client';

import type {
  ClientToServerEvents,
  CreateRoomInput,
  JoinRoomInput,
  LeaveRoomResponse,
  ReconnectRoomInput,
  RoomActionResponse,
  RoomError,
  RoomState,
  ServerToClientEvents,
} from '@words/shared';

import { createWordsServer, type WordsServer } from '../src/server.js';

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

function emitCreate(
  client: TestClient,
  payload: CreateRoomInput,
): Promise<RoomActionResponse> {
  return new Promise((resolve) => client.emit('room:create', payload, resolve));
}

function emitJoin(
  client: TestClient,
  payload: JoinRoomInput,
): Promise<RoomActionResponse> {
  return new Promise((resolve) => client.emit('room:join', payload, resolve));
}

function emitReconnect(
  client: TestClient,
  payload: ReconnectRoomInput,
): Promise<RoomActionResponse> {
  return new Promise((resolve) =>
    client.emit('room:reconnect', payload, resolve),
  );
}

function emitLeave(client: TestClient): Promise<LeaveRoomResponse> {
  return new Promise((resolve) => client.emit('room:leave', {}, resolve));
}

describe('Words Stage 2 server', () => {
  let server: WordsServer;
  let port: number;
  let clients: TestClient[];

  beforeEach(async () => {
    server = createWordsServer({
      port: 0,
      cleanupIntervalMs: 60_000,
    });
    port = await server.start(0);
    clients = [];
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

  it('creates a room and assigns host authority on the server', async () => {
    const host = await connectClient();
    const response = await emitCreate(host, { displayName: 'Game Host' });

    expect(response.ok).toBe(true);
    if (!response.ok) {
      return;
    }

    expect(response.room.players).toHaveLength(1);
    expect(response.room.players[0]).toMatchObject({
      displayName: 'Game Host',
      isHost: true,
    });
    expect(response.session.reconnectToken).toHaveLength(43);
  });

  it('rejects a client attempt to self-assign host authority', async () => {
    const client = await connectClient();
    const response = await emitCreate(client, {
      displayName: 'Silver Owl',
      isHost: true,
    } as never);

    expect(response).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
  });

  it('joins a valid normalized room and broadcasts player state', async () => {
    const host = await connectClient();
    const created = await emitCreate(host, { displayName: 'Game Host' });
    if (!created.ok) {
      throw new Error('Room creation failed in test setup.');
    }

    const stateWithPlayer = new Promise<RoomState>((resolve) => {
      const listener = (room: RoomState) => {
        if (room.players.length === 2) {
          host.off('room:state', listener);
          resolve(room);
        }
      };
      host.on('room:state', listener);
    });
    const player = await connectClient();
    const joined = await emitJoin(player, {
      roomCode: created.room.code.toLowerCase(),
      displayName: 'Silver Owl',
    });

    expect(joined.ok).toBe(true);
    if (joined.ok) {
      expect(joined.room.players.find((entry) => entry.isHost)?.id).toBe(
        created.session.playerId,
      );
      expect(joined.room.players).toHaveLength(2);
    }
    expect((await stateWithPlayer).players).toHaveLength(2);
  });

  it('returns structured errors for missing rooms and malformed payloads', async () => {
    const missingRoomClient = await connectClient();
    const missing = await emitJoin(missingRoomClient, {
      roomCode: 'ZZZ999',
      displayName: 'Silver Owl',
    });
    expect(missing).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND' },
    });

    const malformedClient = await connectClient();
    const malformed = await emitJoin(malformedClient, {
      roomCode: 'bad',
      displayName: '',
    } as never);
    expect(malformed).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
  });

  it('enforces a total capacity of eight players', async () => {
    const host = await connectClient();
    const created = await emitCreate(host, { displayName: 'Game Host' });
    if (!created.ok) {
      throw new Error('Room creation failed in test setup.');
    }

    for (let index = 1; index <= 7; index += 1) {
      const player = await connectClient();
      const response = await emitJoin(player, {
        roomCode: created.room.code,
        displayName: `Player ${index}`,
      });
      expect(response.ok).toBe(true);
    }

    const extraPlayer = await connectClient();
    const rejected = await emitJoin(extraPlayer, {
      roomCode: created.room.code,
      displayName: 'Player 8',
    });
    expect(rejected).toMatchObject({
      ok: false,
      error: { code: 'ROOM_FULL' },
    });
  });

  it('marks disconnected players and reconnects without duplication', async () => {
    const host = await connectClient();
    const created = await emitCreate(host, { displayName: 'Game Host' });
    if (!created.ok) {
      throw new Error('Room creation failed in test setup.');
    }

    const player = await connectClient();
    const joined = await emitJoin(player, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    if (!joined.ok) {
      throw new Error('Room join failed in test setup.');
    }

    const disconnectedState = new Promise<RoomState>((resolve) => {
      const listener = (room: RoomState) => {
        const disconnected = room.players.find(
          (entry) => entry.id === joined.session.playerId,
        );
        if (disconnected && !disconnected.connected) {
          host.off('room:state', listener);
          resolve(room);
        }
      };
      host.on('room:state', listener);
    });
    player.disconnect();
    expect(
      (await disconnectedState).players.find(
        (entry) => entry.id === joined.session.playerId,
      )?.connected,
    ).toBe(false);

    const returningPlayer = await connectClient();
    const reconnected = await emitReconnect(returningPlayer, {
      roomCode: created.room.code,
      reconnectToken: joined.session.reconnectToken,
    });

    expect(reconnected.ok).toBe(true);
    if (reconnected.ok) {
      expect(reconnected.session.playerId).toBe(joined.session.playerId);
      expect(reconnected.session.reconnectToken).not.toBe(
        joined.session.reconnectToken,
      );
      expect(reconnected.room.players).toHaveLength(2);
    }
  });

  it('rejects invalid reconnect tokens safely', async () => {
    const host = await connectClient();
    const created = await emitCreate(host, { displayName: 'Game Host' });
    if (!created.ok) {
      throw new Error('Room creation failed in test setup.');
    }

    const returningPlayer = await connectClient();
    const response = await emitReconnect(returningPlayer, {
      roomCode: created.room.code,
      reconnectToken: 'x'.repeat(43),
    });

    expect(response).toMatchObject({
      ok: false,
      error: { code: 'RECONNECT_FAILED' },
    });
  });

  it('releases remaining sockets when the host closes the room', async () => {
    const host = await connectClient();
    const created = await emitCreate(host, { displayName: 'Game Host' });
    if (!created.ok) {
      throw new Error('Room creation failed in test setup.');
    }

    const player = await connectClient();
    const joined = await emitJoin(player, {
      roomCode: created.room.code,
      displayName: 'Silver Owl',
    });
    if (!joined.ok) {
      throw new Error('Room join failed in test setup.');
    }

    const roomClosed = new Promise<RoomError>((resolve) => {
      player.once('room:error', resolve);
    });
    expect(await emitLeave(host)).toEqual({ ok: true });
    expect(await roomClosed).toMatchObject({ code: 'ROOM_EXPIRED' });

    const newRoom = await emitCreate(player, { displayName: 'Silver Owl' });
    expect(newRoom.ok).toBe(true);
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

    expect(await emitJoin(client, input)).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND' },
    });
    expect(await emitJoin(client, input)).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND' },
    });
    expect(await emitJoin(client, input)).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
  });

  it('keeps HTML-like display names as plain network data', async () => {
    const host = await connectClient();
    const response = await emitCreate(host, {
      displayName: '<Game Host>',
    });

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.room.players[0]?.displayName).toBe('<Game Host>');
    }
  });
});
