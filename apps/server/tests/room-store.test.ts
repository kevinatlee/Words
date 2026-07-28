import { describe, expect, it } from 'vitest';

import { roomStateSchema } from '@words/shared';

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
  let displayIndex = 100;
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
    displaySessionIdGenerator: () => createUuid(++displayIndex),
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

describe('RoomStore display and player sessions', () => {
  it('creates a LOBBY room with one display session and no player', () => {
    const store = createStore();
    const result = store.createDisplay('socket-display');

    expect(result.room.code).toBe('ABC234');
    expect(result.room.phase).toBe('LOBBY');
    expect(result.room.display).toMatchObject({ connected: true });
    expect(result.room.players).toHaveLength(0);
    expect(result.room.controllerPlayerId).toBeNull();
    expect(result.session.displaySessionId).toMatch(
      /^00000000-0000-4000-8000-/,
    );
    expect(result.session.displayReconnectToken).toHaveLength(43);
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

    expect(store.createDisplay('socket-one').room.code).toBe('ABC234');
    expect(store.createDisplay('socket-two').room.code).toBe('DEF567');
  });

  it('bounds the total number of in-memory rooms', () => {
    const store = createStore({
      codes: ['ABC234', 'DEF567'],
      maxRooms: 1,
    });

    store.createDisplay('socket-one');
    expectRoomError(() => store.createDisplay('socket-two'), 'SERVER_BUSY');
    expect(store.roomCount).toBe(1);
  });

  it('makes the first joining player the controller by server-assigned ID', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    const first = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-first',
    );

    expect(first.room.players).toHaveLength(1);
    expect(first.room.controllerPlayerId).toBe(first.session.playerId);
    expect(first.player).toMatchObject({
      id: first.session.playerId,
      displayName: 'Silver Owl',
      connected: true,
      isController: true,
    });
    expect(first.session.playerReconnectToken).toHaveLength(43);
    expect(first.session).not.toHaveProperty('displaySessionId');
    expect(first.session.playerId).not.toBe(created.session.displaySessionId);
  });

  it('joins another player without changing controller authority', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    const first = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-first',
    );
    const second = store.joinPlayer(
      created.room.code,
      'Amber Kite',
      'socket-second',
    );

    expect(second.room.players).toHaveLength(2);
    expect(second.room.controllerPlayerId).toBe(first.session.playerId);
    expect(second.player.isController).toBe(false);
    expect(
      second.room.players.find((player) => player.id === first.session.playerId)
        ?.isController,
    ).toBe(true);
  });

  it('rejects missing rooms and normalized duplicate names', () => {
    const store = createStore();

    expectRoomError(
      () => store.joinPlayer('ZZZ999', 'Silver Owl', 'socket-player'),
      'ROOM_NOT_FOUND',
    );

    const created = store.createDisplay('socket-display');
    store.joinPlayer(created.room.code, 'Bright Fox', 'socket-first');
    expectRoomError(
      () => store.joinPlayer(created.room.code, 'bright fox', 'socket-second'),
      'INVALID_NAME',
    );
  });

  it('does not count the display toward the eight-player maximum', () => {
    const store = createStore({ maxPlayers: 8 });
    const created = store.createDisplay('socket-display');

    for (let index = 1; index <= 8; index += 1) {
      store.joinPlayer(created.room.code, `Player ${index}`, `socket-${index}`);
    }

    expect(store.getRoomState(created.room.code)?.players).toHaveLength(8);
    expectRoomError(
      () =>
        store.joinPlayer(created.room.code, 'Player 9', 'socket-over-capacity'),
      'ROOM_FULL',
    );
  });

  it('reconnects the display role and rotates only its credential', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    const joined = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-player',
    );

    store.disconnect(
      {
        role: 'display',
        roomCode: created.room.code,
        displaySessionId: created.session.displaySessionId,
      },
      'socket-display',
    );
    const reconnected = store.reconnectDisplay(
      created.room.code,
      created.session.displayReconnectToken,
      'socket-display-new',
    );

    expect(reconnected.session.displaySessionId).toBe(
      created.session.displaySessionId,
    );
    expect(reconnected.session.displayReconnectToken).not.toBe(
      created.session.displayReconnectToken,
    );
    expect(reconnected.room.display.connected).toBe(true);
    expect(reconnected.room.players[0]?.id).toBe(joined.session.playerId);
    expectRoomError(
      () =>
        store.reconnectDisplay(
          created.room.code,
          created.session.displayReconnectToken,
          'socket-replay',
        ),
      'RECONNECT_FAILED',
    );
  });

  it('reconnects the same player role without creating a duplicate', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    const joined = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-player',
    );

    store.disconnect(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: joined.session.playerId,
      },
      'socket-player',
    );
    const reconnected = store.reconnectPlayer(
      created.room.code,
      joined.session.playerReconnectToken,
      'socket-player-new',
    );

    expect(reconnected.session.playerId).toBe(joined.session.playerId);
    expect(reconnected.session.playerReconnectToken).not.toBe(
      joined.session.playerReconnectToken,
    );
    expect(reconnected.room.players).toHaveLength(1);
    expect(reconnected.player.connected).toBe(true);
    expect(reconnected.player.isController).toBe(true);
  });

  it('supersedes a stale connected socket when a valid credential is reused', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');

    const reconnected = store.reconnectDisplay(
      created.room.code,
      created.session.displayReconnectToken,
      'socket-display-refreshed',
    );

    expect(reconnected.replacedSocketId).toBe('socket-display');
    expect(reconnected.room.players).toHaveLength(0);
  });

  it('never accepts display credentials as player credentials or vice versa', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    const joined = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-player',
    );

    expectRoomError(
      () =>
        store.reconnectPlayer(
          created.room.code,
          created.session.displayReconnectToken,
          'socket-impostor',
        ),
      'RECONNECT_FAILED',
    );
    expectRoomError(
      () =>
        store.reconnectDisplay(
          created.room.code,
          joined.session.playerReconnectToken,
          'socket-impostor',
        ),
      'RECONNECT_FAILED',
    );
  });

  it('keeps the room and players when the display disconnects', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    const joined = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-player',
    );

    const result = store.disconnect(
      {
        role: 'display',
        roomCode: created.room.code,
        displaySessionId: created.session.displaySessionId,
      },
      'socket-display',
    );

    expect(result?.role).toBe('display');
    expect(store.roomCount).toBe(1);
    expect(store.getRoomState(created.room.code)).toMatchObject({
      display: { connected: false },
      controllerPlayerId: joined.session.playerId,
    });
    expect(store.getRoomState(created.room.code)?.players).toHaveLength(1);
  });

  it('keeps the room when the controller player disconnects', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    const controller = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-controller',
    );
    store.joinPlayer(created.room.code, 'Amber Kite', 'socket-player');

    const result = store.disconnect(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: controller.session.playerId,
      },
      'socket-controller',
    );

    expect(result?.role).toBe('player');
    expect(store.roomCount).toBe(1);
    expect(store.getRoomState(created.room.code)).toMatchObject({
      controllerPlayerId: controller.session.playerId,
    });
    expect(
      store
        .getRoomState(created.room.code)
        ?.players.find((player) => player.id === controller.session.playerId),
    ).toMatchObject({ connected: false, isController: true });
  });

  it('removes an ordinary disconnected player after the grace period', () => {
    let now = Date.parse('2026-07-27T20:00:00.000Z');
    const store = createStore({
      now: () => now,
      reconnectGraceMs: 60_000,
    });
    const created = store.createDisplay('socket-display');
    const controller = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-controller',
    );
    const ordinary = store.joinPlayer(
      created.room.code,
      'Amber Kite',
      'socket-player',
    );

    store.disconnect(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: ordinary.session.playerId,
      },
      'socket-player',
    );
    now += 59_999;
    store.cleanupExpired();
    expect(store.getRoomState(created.room.code)?.players).toHaveLength(2);

    now += 1;
    store.cleanupExpired();
    const room = store.getRoomState(created.room.code);
    expect(room?.players).toHaveLength(1);
    expect(room?.controllerPlayerId).toBe(controller.session.playerId);
    expect(room?.players[0]?.id).toBe(controller.session.playerId);
  });

  it('retains an offline controller record without electing another player', () => {
    let now = Date.parse('2026-07-27T20:00:00.000Z');
    const store = createStore({
      now: () => now,
      reconnectGraceMs: 60_000,
    });
    const created = store.createDisplay('socket-display');
    const controller = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-controller',
    );
    const ordinary = store.joinPlayer(
      created.room.code,
      'Amber Kite',
      'socket-player',
    );

    store.disconnect(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: controller.session.playerId,
      },
      'socket-controller',
    );
    now += 60_000;
    store.cleanupExpired();

    const room = store.getRoomState(created.room.code);
    expect(() => roomStateSchema.parse(room)).not.toThrow();
    expect(room?.controllerPlayerId).toBe(controller.session.playerId);
    expect(room?.players).toHaveLength(2);
    expect(
      room?.players.find((player) => player.id === ordinary.session.playerId)
        ?.isController,
    ).toBe(false);
    expectRoomError(
      () =>
        store.reconnectPlayer(
          created.room.code,
          controller.session.playerReconnectToken,
          'socket-controller-late',
        ),
      'RECONNECT_FAILED',
    );
  });

  it('keeps players after the disconnected display grace period', () => {
    let now = Date.parse('2026-07-27T20:00:00.000Z');
    const store = createStore({
      now: () => now,
      reconnectGraceMs: 60_000,
    });
    const created = store.createDisplay('socket-display');
    store.joinPlayer(created.room.code, 'Silver Owl', 'socket-controller');

    store.disconnect(
      {
        role: 'display',
        roomCode: created.room.code,
        displaySessionId: created.session.displaySessionId,
      },
      'socket-display',
    );
    now += 60_000;

    expect(store.cleanupExpired().deletedRoomCodes).toEqual([]);
    expect(store.getRoomState(created.room.code)?.players).toHaveLength(1);
    expect(store.getRoomState(created.room.code)?.display.connected).toBe(
      false,
    );
  });

  it('expires an abandoned room only after its display grace and no players', () => {
    let now = Date.parse('2026-07-27T20:00:00.000Z');
    const store = createStore({
      now: () => now,
      reconnectGraceMs: 60_000,
    });
    const created = store.createDisplay('socket-display');

    store.disconnect(
      {
        role: 'display',
        roomCode: created.room.code,
        displaySessionId: created.session.displaySessionId,
      },
      'socket-display',
    );
    expect(store.cleanupExpired().deletedRoomCodes).toEqual([]);

    now += 60_000;
    expect(store.cleanupExpired().deletedRoomCodes).toEqual(['ABC234']);
    expect(store.roomCount).toBe(0);
    expectRoomError(
      () => store.joinPlayer('ABC234', 'Silver Owl', 'socket-player'),
      'ROOM_EXPIRED',
    );
  });

  it('does not close a populated room when the display explicitly leaves', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    store.joinPlayer(created.room.code, 'Silver Owl', 'socket-controller');

    const result = store.leave(
      {
        role: 'display',
        roomCode: created.room.code,
        displaySessionId: created.session.displaySessionId,
      },
      'socket-display',
    );

    expect(result?.role).toBe('display');
    expect(store.roomCount).toBe(1);
    expect(store.getRoomState(created.room.code)?.players).toHaveLength(1);
  });

  it('does not close or transfer a populated room when its controller leaves', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    const controller = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-controller',
    );
    const ordinary = store.joinPlayer(
      created.room.code,
      'Amber Kite',
      'socket-player',
    );

    const result = store.leave(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: controller.session.playerId,
      },
      'socket-controller',
    );

    expect(result?.role).toBe('player');
    expect(store.roomCount).toBe(1);
    expect(result?.room.controllerPlayerId).toBe(controller.session.playerId);
    expect(
      result?.room.players.find(
        (player) => player.id === ordinary.session.playerId,
      )?.isController,
    ).toBe(false);
  });

  it('expires inactive rooms and clears both role credential indexes', () => {
    let now = Date.parse('2026-07-27T20:00:00.000Z');
    const store = createStore({
      now: () => now,
      roomTtlMs: 1_000,
    });
    const created = store.createDisplay('socket-display');
    store.joinPlayer(created.room.code, 'Silver Owl', 'socket-player');
    now += 1_000;

    expect(store.cleanupExpired().deletedRoomCodes).toEqual(['ABC234']);
    expect(store.roomCount).toBe(0);
    const credentialIndexes = store as unknown as {
      displaySessions: Map<string, unknown>;
      playerSessions: Map<string, unknown>;
    };
    expect(credentialIndexes.displaySessions.size).toBe(0);
    expect(credentialIndexes.playerSessions.size).toBe(0);
  });

  it('keeps HTML-like display names as plain player state data', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    const joined = store.joinPlayer(
      created.room.code,
      '<Bright Fox>',
      'socket-player',
    );

    expect(joined.player.displayName).toBe('<Bright Fox>');
  });
});
