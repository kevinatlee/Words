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
    playerIds?: string[];
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
    playerIdGenerator: () => {
      const playerId =
        options.playerIds?.[playerIndex] ?? createUuid(playerIndex + 1);
      playerIndex += 1;
      return playerId;
    },
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
    expect(result.room.controllerStatus).toBe('none');
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
    expect(first.room.controllerStatus).toBe('assigned');
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

  it('lets the current controller transfer authority to a connected player', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    const controller = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-controller',
    );
    const target = store.joinPlayer(
      created.room.code,
      'Amber Kite',
      'socket-target',
    );

    const transferred = store.transferController(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: controller.session.playerId,
      },
      target.session.playerId,
      'socket-controller',
    );

    expect(transferred.room.controllerStatus).toBe('assigned');
    expect(transferred.room.controllerPlayerId).toBe(target.session.playerId);
    expect(
      transferred.room.players.find(
        (player) => player.id === controller.session.playerId,
      )?.isController,
    ).toBe(false);
    expect(
      transferred.room.players.find(
        (player) => player.id === target.session.playerId,
      )?.isController,
    ).toBe(true);
  });

  it('rejects unauthorized, missing, offline, and same-player transfer targets', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    const controller = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-controller',
    );
    const target = store.joinPlayer(
      created.room.code,
      'Amber Kite',
      'socket-target',
    );

    expectRoomError(
      () =>
        store.transferController(
          {
            role: 'player',
            roomCode: created.room.code,
            playerId: target.session.playerId,
          },
          controller.session.playerId,
          'socket-target',
        ),
      'NOT_CONTROLLER',
    );
    expectRoomError(
      () =>
        store.transferController(
          {
            role: 'player',
            roomCode: created.room.code,
            playerId: controller.session.playerId,
          },
          controller.session.playerId,
          'socket-controller',
        ),
      'TARGET_ALREADY_CONTROLLER',
    );
    expectRoomError(
      () =>
        store.transferController(
          {
            role: 'player',
            roomCode: created.room.code,
            playerId: controller.session.playerId,
          },
          createUuid(999),
          'socket-controller',
        ),
      'TARGET_PLAYER_NOT_FOUND',
    );

    store.disconnect(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: target.session.playerId,
      },
      'socket-target',
    );
    expectRoomError(
      () =>
        store.transferController(
          {
            role: 'player',
            roomCode: created.room.code,
            playerId: controller.session.playerId,
          },
          target.session.playerId,
          'socket-controller',
        ),
      'TARGET_PLAYER_OFFLINE',
    );

    const reconnectedTarget = store.reconnectPlayer(
      created.room.code,
      target.session.playerReconnectToken,
      'socket-target-returned',
    );
    const transferred = store.transferController(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: controller.session.playerId,
      },
      reconnectedTarget.session.playerId,
      'socket-controller',
    );
    expect(transferred.room.controllerPlayerId).toBe(
      reconnectedTarget.session.playerId,
    );
  });

  it('makes simultaneous stale transfer requests resolve to one controller', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    const controller = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-controller',
    );
    const second = store.joinPlayer(
      created.room.code,
      'Amber Kite',
      'socket-second',
    );
    const third = store.joinPlayer(
      created.room.code,
      'Copper Lynx',
      'socket-third',
    );
    const controllerSession = {
      role: 'player' as const,
      roomCode: created.room.code,
      playerId: controller.session.playerId,
    };

    store.transferController(
      controllerSession,
      second.session.playerId,
      'socket-controller',
    );
    expectRoomError(
      () =>
        store.transferController(
          controllerSession,
          third.session.playerId,
          'socket-controller',
        ),
      'NOT_CONTROLLER',
    );

    const room = store.getRoomState(created.room.code);
    expect(room?.controllerPlayerId).toBe(second.session.playerId);
    expect(room?.players.filter((player) => player.isController)).toHaveLength(
      1,
    );
  });

  it('keeps transferred authority through old and new controller reconnects', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    const oldController = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-old',
    );
    const newController = store.joinPlayer(
      created.room.code,
      'Amber Kite',
      'socket-new',
    );

    store.transferController(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: oldController.session.playerId,
      },
      newController.session.playerId,
      'socket-old',
    );
    store.disconnect(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: oldController.session.playerId,
      },
      'socket-old',
    );
    store.disconnect(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: newController.session.playerId,
      },
      'socket-new',
    );

    const oldReconnected = store.reconnectPlayer(
      created.room.code,
      oldController.session.playerReconnectToken,
      'socket-old-returned',
    );
    const newReconnected = store.reconnectPlayer(
      created.room.code,
      newController.session.playerReconnectToken,
      'socket-new-returned',
    );

    expect(oldReconnected.player.isController).toBe(false);
    expect(newReconnected.player.isController).toBe(true);
    expect(newReconnected.room.controllerPlayerId).toBe(
      newController.session.playerId,
    );
  });

  it('rejects cross-room controller targets', () => {
    const store = createStore({ codes: ['ABC234', 'DEF567'] });
    const firstRoom = store.createDisplay('socket-display-one');
    const controller = store.joinPlayer(
      firstRoom.room.code,
      'Silver Owl',
      'socket-controller',
    );
    const secondRoom = store.createDisplay('socket-display-two');
    const otherRoomPlayer = store.joinPlayer(
      secondRoom.room.code,
      'Amber Kite',
      'socket-other-room',
    );

    expectRoomError(
      () =>
        store.transferController(
          {
            role: 'player',
            roomCode: firstRoom.room.code,
            playerId: controller.session.playerId,
          },
          otherRoomPlayer.session.playerId,
          'socket-controller',
        ),
      'TARGET_PLAYER_NOT_FOUND',
    );
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
      controllerStatus: 'assigned',
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
    expect(room?.controllerStatus).toBe('assigned');
    expect(room?.controllerPlayerId).toBe(controller.session.playerId);
    expect(room?.players[0]?.id).toBe(controller.session.playerId);
  });

  it('promotes the earliest-joined connected player after controller grace', () => {
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
    now += 1;
    const earliestSuccessor = store.joinPlayer(
      created.room.code,
      'Amber Kite',
      'socket-second',
    );
    now += 1;
    const laterSuccessor = store.joinPlayer(
      created.room.code,
      'Copper Lynx',
      'socket-third',
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
    expect(room?.controllerStatus).toBe('assigned');
    expect(room?.controllerPlayerId).toBe(earliestSuccessor.session.playerId);
    expect(room?.players).toHaveLength(2);
    expect(
      room?.players.find(
        (player) => player.id === earliestSuccessor.session.playerId,
      ),
    ).toMatchObject({
      connected: true,
      isController: true,
    });
    expect(
      room?.players.find(
        (player) => player.id === laterSuccessor.session.playerId,
      )?.isController,
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

    const rejoined = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-controller-rejoined',
    );
    expect(rejoined.player.isController).toBe(false);
  });

  it('breaks equal join-time succession ties by player ID', () => {
    const now = Date.parse('2026-07-27T20:00:00.000Z');
    const store = createStore({
      now: () => now,
      playerIds: [createUuid(50), createUuid(90), createUuid(10)],
    });
    const created = store.createDisplay('socket-display');
    const controller = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-controller',
    );
    store.joinPlayer(created.room.code, 'Amber Kite', 'socket-second');
    const lowerIdPlayer = store.joinPlayer(
      created.room.code,
      'Copper Lynx',
      'socket-third',
    );

    const result = store.leave(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: controller.session.playerId,
      },
      'socket-controller',
    );

    expect(result?.room.controllerPlayerId).toBe(
      lowerIdPlayer.session.playerId,
    );
  });

  it('lets a controller reconnect at the deadline before cleanup runs', () => {
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
    store.joinPlayer(created.room.code, 'Amber Kite', 'socket-target');
    store.disconnect(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: controller.session.playerId,
      },
      'socket-controller',
    );

    now += 60_000;
    const reconnected = store.reconnectPlayer(
      created.room.code,
      controller.session.playerReconnectToken,
      'socket-controller-returned',
    );
    expect(reconnected.player.isController).toBe(true);
    expect(reconnected.room.controllerStatus).toBe('assigned');
    expect(store.cleanupExpired().updatedRoomCodes).toEqual([]);
    expect(store.getRoomState(created.room.code)?.controllerPlayerId).toBe(
      controller.session.playerId,
    );
  });

  it('promotes exactly once when cleanup wins the reconnect race', () => {
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
    const target = store.joinPlayer(
      created.room.code,
      'Amber Kite',
      'socket-target',
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
    expect(store.cleanupExpired().updatedRoomCodes).toEqual([
      created.room.code,
    ]);
    expect(store.cleanupExpired().updatedRoomCodes).toEqual([]);

    const room = store.getRoomState(created.room.code);
    expect(room?.controllerPlayerId).toBe(target.session.playerId);
    expect(room?.players.filter((player) => player.isController)).toEqual([
      expect.objectContaining({
        id: target.session.playerId,
        isController: true,
      }),
    ]);
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

  it('continues deterministic succession if the selected successor disconnects', () => {
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
    now += 1;
    const second = store.joinPlayer(
      created.room.code,
      'Amber Kite',
      'socket-second',
    );
    now += 1;
    const third = store.joinPlayer(
      created.room.code,
      'Copper Lynx',
      'socket-third',
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
    expect(store.getRoomState(created.room.code)?.controllerPlayerId).toBe(
      second.session.playerId,
    );

    store.disconnect(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: second.session.playerId,
      },
      'socket-second',
    );
    now += 60_000;
    store.cleanupExpired();

    const room = store.getRoomState(created.room.code);
    expect(room?.controllerPlayerId).toBe(third.session.playerId);
    expect(room?.players.filter((player) => player.isController)).toEqual([
      expect.objectContaining({
        id: third.session.playerId,
        connected: true,
      }),
    ]);
  });

  it('skips a disconnected earlier player during explicit-leave succession', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    const controller = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-controller',
    );
    const earlier = store.joinPlayer(
      created.room.code,
      'Amber Kite',
      'socket-earlier',
    );
    const later = store.joinPlayer(
      created.room.code,
      'Copper Lynx',
      'socket-later',
    );
    store.disconnect(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: earlier.session.playerId,
      },
      'socket-earlier',
    );
    const result = store.leave(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: controller.session.playerId,
      },
      'socket-controller',
    );

    expect(result?.room.controllerPlayerId).toBe(later.session.playerId);
    expect(
      result?.room.players.find(
        (player) => player.id === earlier.session.playerId,
      ),
    ).toMatchObject({ connected: false, isController: false });

    store.disconnect(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: later.session.playerId,
      },
      'socket-later',
    );
    expect(store.getRoomState(created.room.code)?.controllerPlayerId).toBe(
      later.session.playerId,
    );
  });

  it('uses no controller until the next player joins when nobody is connected', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    const controller = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-controller',
    );
    const offlinePlayer = store.joinPlayer(
      created.room.code,
      'Amber Kite',
      'socket-offline',
    );
    store.disconnect(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: offlinePlayer.session.playerId,
      },
      'socket-offline',
    );
    const left = store.leave(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: controller.session.playerId,
      },
      'socket-controller',
    );

    expect(left?.room.controllerStatus).toBe('none');
    expect(left?.room.controllerPlayerId).toBeNull();
    expect(() => roomStateSchema.parse(left?.room)).not.toThrow();

    const joined = store.joinPlayer(
      created.room.code,
      'Copper Lynx',
      'socket-new',
    );
    expect(joined.player.isController).toBe(true);
    expect(joined.room.controllerPlayerId).toBe(joined.session.playerId);
  });

  it('lets an earlier player reconnect before succession is computed', () => {
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
    const earlier = store.joinPlayer(
      created.room.code,
      'Amber Kite',
      'socket-earlier',
    );
    const later = store.joinPlayer(
      created.room.code,
      'Copper Lynx',
      'socket-later',
    );
    store.disconnect(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: earlier.session.playerId,
      },
      'socket-earlier',
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
    store.reconnectPlayer(
      created.room.code,
      earlier.session.playerReconnectToken,
      'socket-earlier-returned',
    );
    store.cleanupExpired();

    expect(store.getRoomState(created.room.code)?.controllerPlayerId).toBe(
      earlier.session.playerId,
    );
    expect(
      store
        .getRoomState(created.room.code)
        ?.players.find((player) => player.id === later.session.playerId)
        ?.isController,
    ).toBe(false);
  });

  it('does not let stale lifecycle work overwrite a newer controller', () => {
    let now = Date.parse('2026-07-27T20:00:00.000Z');
    const store = createStore({
      now: () => now,
      reconnectGraceMs: 60_000,
    });
    const created = store.createDisplay('socket-display');
    const oldController = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-old',
    );
    const newController = store.joinPlayer(
      created.room.code,
      'Amber Kite',
      'socket-new',
    );
    store.transferController(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: oldController.session.playerId,
      },
      newController.session.playerId,
      'socket-old',
    );
    store.disconnect(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: oldController.session.playerId,
      },
      'socket-old',
    );

    now += 60_000;
    store.cleanupExpired();

    expect(store.getRoomState(created.room.code)?.controllerPlayerId).toBe(
      newController.session.playerId,
    );
  });

  it('serializes manual transfer and controller leave to one final controller', () => {
    const transferFirstStore = createStore();
    const transferFirstRoom = transferFirstStore.createDisplay(
      'display-transfer-first',
    );
    const transferFirstController = transferFirstStore.joinPlayer(
      transferFirstRoom.room.code,
      'Silver Owl',
      'controller-transfer-first',
    );
    const transferFirstTarget = transferFirstStore.joinPlayer(
      transferFirstRoom.room.code,
      'Amber Kite',
      'target-transfer-first',
    );
    transferFirstStore.transferController(
      {
        role: 'player',
        roomCode: transferFirstRoom.room.code,
        playerId: transferFirstController.session.playerId,
      },
      transferFirstTarget.session.playerId,
      'controller-transfer-first',
    );
    transferFirstStore.leave(
      {
        role: 'player',
        roomCode: transferFirstRoom.room.code,
        playerId: transferFirstController.session.playerId,
      },
      'controller-transfer-first',
    );
    expect(
      transferFirstStore.getRoomState(transferFirstRoom.room.code)
        ?.controllerPlayerId,
    ).toBe(transferFirstTarget.session.playerId);

    const leaveFirstStore = createStore();
    const leaveFirstRoom = leaveFirstStore.createDisplay('display-leave-first');
    const leaveFirstController = leaveFirstStore.joinPlayer(
      leaveFirstRoom.room.code,
      'Silver Owl',
      'controller-leave-first',
    );
    const leaveFirstTarget = leaveFirstStore.joinPlayer(
      leaveFirstRoom.room.code,
      'Amber Kite',
      'target-leave-first',
    );
    leaveFirstStore.leave(
      {
        role: 'player',
        roomCode: leaveFirstRoom.room.code,
        playerId: leaveFirstController.session.playerId,
      },
      'controller-leave-first',
    );
    expectRoomError(
      () =>
        leaveFirstStore.transferController(
          {
            role: 'player',
            roomCode: leaveFirstRoom.room.code,
            playerId: leaveFirstController.session.playerId,
          },
          leaveFirstTarget.session.playerId,
          'controller-leave-first',
        ),
      'UNAUTHORIZED',
    );
    expect(
      leaveFirstStore.getRoomState(leaveFirstRoom.room.code)
        ?.controllerPlayerId,
    ).toBe(leaveFirstTarget.session.playerId);
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

  it('promotes a connected player when the controller explicitly leaves', () => {
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
    expect(result?.room.controllerStatus).toBe('assigned');
    expect(result?.room.controllerPlayerId).toBe(ordinary.session.playerId);
    expect(result?.room.players).toEqual([
      expect.objectContaining({
        id: ordinary.session.playerId,
        isController: true,
      }),
    ]);
  });

  it('returns to no-controller state when the last player leaves', () => {
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

    store.leave(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: controller.session.playerId,
      },
      'socket-controller',
    );
    const result = store.leave(
      {
        role: 'player',
        roomCode: created.room.code,
        playerId: ordinary.session.playerId,
      },
      'socket-player',
    );

    expect(result?.room.controllerStatus).toBe('none');
    expect(result?.room.controllerPlayerId).toBeNull();
    expect(result?.room.players).toEqual([]);
    expect(store.roomCount).toBe(1);
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
