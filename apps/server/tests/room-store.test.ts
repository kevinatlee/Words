import { describe, expect, it } from 'vitest';

import { RoomOperationError, RoomStore } from '../src/room-store.js';

function createUuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function createStore(
  options: {
    now?: () => number;
    codes?: string[];
    maxPlayers?: number;
    maxRooms?: number;
    roomTtlMs?: number;
    reconnectGraceMs?: number;
  } = {},
) {
  const codes = options.codes ?? ['ABC234'];
  let codeIndex = 0;
  let playerIndex = 0;
  let tokenIndex = 0;

  return new RoomStore({
    maxPlayers: options.maxPlayers ?? 8,
    maxRooms: options.maxRooms ?? 20,
    roomTtlMs: options.roomTtlMs ?? 120 * 60 * 1000,
    reconnectGraceMs: options.reconnectGraceMs ?? 60 * 1000,
    ...(options.now ? { now: options.now } : {}),
    roomCodeGenerator: () =>
      codes[Math.min(codeIndex++, codes.length - 1)] ?? 'XYZ789',
    playerIdGenerator: () => createUuid(++playerIndex),
    reconnectTokenGenerator: () =>
      `${String(++tokenIndex).padStart(3, '0')}${'t'.repeat(40)}`,
  });
}

function expectRoomError(
  callback: () => unknown,
  code: RoomOperationError['code'],
): void {
  try {
    callback();
    throw new Error('Expected a room operation error.');
  } catch (error) {
    expect(error).toBeInstanceOf(RoomOperationError);
    expect((error as RoomOperationError).code).toBe(code);
  }
}

describe('RoomStore', () => {
  it('creates a LOBBY room and assigns the creator as host', () => {
    const store = createStore();
    const result = store.createRoom('Game Host', 'socket-host');

    expect(result.room.code).toBe('ABC234');
    expect(result.room.phase).toBe('LOBBY');
    expect(result.room.players).toHaveLength(1);
    expect(result.room.players[0]).toMatchObject({
      id: result.session.playerId,
      displayName: 'Game Host',
      connected: true,
      isHost: true,
    });
    expect(result.room.settings).toEqual({
      gridSize: 4,
      roundDurationSeconds: 180,
      scoringMode: 'traditional',
    });
    expect(result.room).not.toHaveProperty('board');
    expect(result.room).not.toHaveProperty('scores');
  });

  it('collision-checks generated room codes', () => {
    const store = createStore({
      codes: ['ABC234', 'ABC234', 'DEF567'],
    });

    expect(store.createRoom('Game Host', 'socket-one').room.code).toBe(
      'ABC234',
    );
    expect(store.createRoom('Room Guide', 'socket-two').room.code).toBe(
      'DEF567',
    );
  });

  it('bounds the total number of in-memory rooms', () => {
    const store = createStore({
      codes: ['ABC234', 'DEF567'],
      maxRooms: 1,
    });

    store.createRoom('Game Host', 'socket-one');
    expectRoomError(
      () => store.createRoom('Room Guide', 'socket-two'),
      'SERVER_BUSY',
    );
    expect(store.roomCount).toBe(1);
  });

  it('joins a valid room without changing host authority', () => {
    const store = createStore();
    const created = store.createRoom('Game Host', 'socket-host');
    const joined = store.joinRoom(
      created.room.code,
      'Silver Owl',
      'socket-player',
    );

    expect(joined.room.players).toHaveLength(2);
    expect(joined.player.isHost).toBe(false);
    expect(
      joined.room.players.find(
        (player) => player.id === created.session.playerId,
      )?.isHost,
    ).toBe(true);
  });

  it('rejects missing rooms and normalized duplicate names', () => {
    const store = createStore();

    expectRoomError(
      () => store.joinRoom('ZZZ999', 'Silver Owl', 'socket-player'),
      'ROOM_NOT_FOUND',
    );

    const created = store.createRoom('Bright Fox', 'socket-host');
    expectRoomError(
      () => store.joinRoom(created.room.code, 'bright fox', 'socket-player'),
      'INVALID_NAME',
    );
  });

  it('enforces the configured eight-player room capacity', () => {
    const store = createStore({ maxPlayers: 8 });
    const created = store.createRoom('Game Host', 'socket-host');

    for (let index = 1; index <= 7; index += 1) {
      store.joinRoom(created.room.code, `Player ${index}`, `socket-${index}`);
    }

    expect(store.getRoomState(created.room.code)?.players).toHaveLength(8);
    expectRoomError(
      () =>
        store.joinRoom(created.room.code, 'Player 8', 'socket-over-capacity'),
      'ROOM_FULL',
    );
  });

  it('reconnects the same player, rotates the token, and avoids duplicates', () => {
    const store = createStore();
    const created = store.createRoom('Game Host', 'socket-host');
    const joined = store.joinRoom(
      created.room.code,
      'Silver Owl',
      'socket-player',
    );

    store.disconnect(
      {
        roomCode: created.room.code,
        playerId: joined.session.playerId,
      },
      'socket-player',
    );
    const reconnected = store.reconnectRoom(
      created.room.code,
      joined.session.reconnectToken,
      'socket-player-new',
    );

    expect(reconnected.session.playerId).toBe(joined.session.playerId);
    expect(reconnected.session.reconnectToken).not.toBe(
      joined.session.reconnectToken,
    );
    expect(reconnected.room.players).toHaveLength(2);
    expect(reconnected.player.connected).toBe(true);
    expect(reconnected.replacedSocketId).toBeNull();
    expectRoomError(
      () =>
        store.reconnectRoom(
          created.room.code,
          joined.session.reconnectToken,
          'socket-replay',
        ),
      'RECONNECT_FAILED',
    );
  });

  it('supersedes a stale connected socket when its valid token is reused', () => {
    const store = createStore();
    const created = store.createRoom('Game Host', 'socket-host');

    const reconnected = store.reconnectRoom(
      created.room.code,
      created.session.reconnectToken,
      'socket-host-refreshed',
    );

    expect(reconnected.replacedSocketId).toBe('socket-host');
    expect(reconnected.session.playerId).toBe(created.session.playerId);
    expect(reconnected.room.players).toHaveLength(1);
  });

  it('rejects invalid reconnect credentials', () => {
    const store = createStore();
    const created = store.createRoom('Game Host', 'socket-host');

    expectRoomError(
      () =>
        store.reconnectRoom(
          created.room.code,
          `${'x'.repeat(43)}`,
          'socket-player',
        ),
      'RECONNECT_FAILED',
    );
  });

  it('removes a disconnected player after the grace period', () => {
    let now = Date.parse('2026-07-27T20:00:00.000Z');
    const store = createStore({
      now: () => now,
      reconnectGraceMs: 60_000,
    });
    const created = store.createRoom('Game Host', 'socket-host');
    const joined = store.joinRoom(
      created.room.code,
      'Silver Owl',
      'socket-player',
    );

    store.disconnect(
      {
        roomCode: created.room.code,
        playerId: joined.session.playerId,
      },
      'socket-player',
    );
    now += 59_999;
    store.cleanupExpired();
    expect(store.getRoomState(created.room.code)?.players).toHaveLength(2);

    now += 1;
    store.cleanupExpired();
    expect(store.getRoomState(created.room.code)?.players).toHaveLength(1);
  });

  it('expires an abandoned room when the host grace period ends', () => {
    let now = Date.parse('2026-07-27T20:00:00.000Z');
    const store = createStore({
      now: () => now,
      reconnectGraceMs: 60_000,
    });
    const created = store.createRoom('Game Host', 'socket-host');

    store.disconnect(
      {
        roomCode: created.room.code,
        playerId: created.session.playerId,
      },
      'socket-host',
    );
    now += 60_000;

    expect(store.cleanupExpired().deletedRoomCodes).toEqual(['ABC234']);
    expect(store.roomCount).toBe(0);
    expectRoomError(
      () => store.joinRoom('ABC234', 'Silver Owl', 'socket-player'),
      'ROOM_EXPIRED',
    );
  });

  it('deletes a room immediately when the host explicitly leaves', () => {
    const store = createStore();
    const created = store.createRoom('Game Host', 'socket-host');
    store.joinRoom(created.room.code, 'Silver Owl', 'socket-player');

    const result = store.leave(
      {
        roomCode: created.room.code,
        playerId: created.session.playerId,
      },
      'socket-host',
    );

    expect(result).toMatchObject({
      roomCode: created.room.code,
      deletedRoom: true,
      room: null,
    });
    expect(store.roomCount).toBe(0);
  });

  it('removes a non-host player immediately when they leave', () => {
    const store = createStore();
    const created = store.createRoom('Game Host', 'socket-host');
    const joined = store.joinRoom(
      created.room.code,
      'Silver Owl',
      'socket-player',
    );

    const result = store.leave(
      {
        roomCode: created.room.code,
        playerId: joined.session.playerId,
      },
      'socket-player',
    );

    expect(result?.deletedRoom).toBe(false);
    expect(result?.player.connected).toBe(false);
    expect(result?.room?.players).toHaveLength(1);
    expect(store.roomCount).toBe(1);
  });

  it('expires inactive rooms after the configured TTL', () => {
    let now = Date.parse('2026-07-27T20:00:00.000Z');
    const store = createStore({
      now: () => now,
      roomTtlMs: 1_000,
    });
    store.createRoom('Game Host', 'socket-host');
    now += 1_000;

    expect(store.cleanupExpired().deletedRoomCodes).toEqual(['ABC234']);
    expect(store.roomCount).toBe(0);
  });

  it('keeps HTML-like display names as plain state data', () => {
    const store = createStore();
    const created = store.createRoom('<Game Host>', 'socket-host');

    expect(created.player.displayName).toBe('<Game Host>');
  });
});
