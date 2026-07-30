import { describe, expect, it } from 'vitest';

import { roomStateSchema } from '@words/shared';

import {
  RoomOperationError,
  RoomStore,
  type RoomStoreOptions,
} from '../src/room-store.js';

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
    roundIds?: string[];
    roundBoardGenerator?: RoomStoreOptions['roundBoardGenerator'];
  } = {},
) {
  const codes = options.codes ?? ['ABC234'];
  let codeIndex = 0;
  let displayIndex = 100;
  let playerIndex = 0;
  let tokenIndex = 0;
  let roundIndex = 0;

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
    roundIdGenerator: () =>
      options.roundIds?.[roundIndex++] ?? createUuid(500 + roundIndex),
    ...(options.roundBoardGenerator
      ? { roundBoardGenerator: options.roundBoardGenerator }
      : {}),
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

function createSuccessfulBoard(size: 4 | 5 | 6) {
  return {
    success: true as const,
    board: {
      size,
      tiles: Array.from({ length: size * size }, (_, index) =>
        index === 0 ? 'QU' : String.fromCharCode(65 + (index % 26)),
      ),
    },
    attempts: 2,
  };
}

describe('RoomStore authoritative settings and rounds', () => {
  function createRoundRoom(
    options: {
      now?: () => number;
      generator?: RoomStoreOptions['roundBoardGenerator'];
    } = {},
  ) {
    const store = createStore({
      ...(options.now ? { now: options.now } : {}),
      roundBoardGenerator:
        options.generator ?? ((size) => createSuccessfulBoard(size)),
      roundIds: [createUuid(701), createUuid(702)],
    });
    const display = store.createDisplay('socket-display');
    const controller = store.joinPlayer(
      display.room.code,
      'Silver Owl',
      'socket-controller',
    );
    const controllerSession = {
      role: 'player' as const,
      roomCode: display.room.code,
      playerId: controller.session.playerId,
    };
    return { store, display, controller, controllerSession };
  }

  it('lets only the connected controller update complete room settings', () => {
    const { store, display, controllerSession } = createRoundRoom();
    const ordinary = store.joinPlayer(
      display.room.code,
      'Amber Kite',
      'socket-ordinary',
    );
    const settings = {
      gridSize: 6 as const,
      roundDurationSeconds: 60 as const,
      scoringMode: 'traditional' as const,
    };

    expect(
      store.updateSettings(controllerSession, settings, 'socket-controller')
        .room.settings,
    ).toEqual(settings);
    expectRoomError(
      () =>
        store.updateSettings(
          {
            role: 'player',
            roomCode: display.room.code,
            playerId: ordinary.session.playerId,
          },
          { ...settings, gridSize: 4 },
          'socket-ordinary',
        ),
      'NOT_CONTROLLER',
    );
  });

  it('rejects unsupported settings without changing activity or values', () => {
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    const { store, display, controllerSession } = createRoundRoom({
      now: () => now,
    });
    const before = store.getRoomState(display.room.code);
    now += 1_000;

    expectRoomError(
      () =>
        store.updateSettings(
          controllerSession,
          {
            gridSize: 7,
            roundDurationSeconds: 45,
            scoringMode: 'invented',
          } as never,
          'socket-controller',
        ),
      'INVALID_PAYLOAD',
    );
    const after = store.getRoomState(display.room.code);
    expect(after?.settings).toEqual(before?.settings);
    expect(after?.lastActivityAt).toBe(before?.lastActivityAt);
    expect(after?.expiresAt).toBe(before?.expiresAt);
    expect(after?.stateVersion).toBe(before?.stateVersion);
  });

  it('creates a server-owned active round from the current settings', () => {
    const now = Date.parse('2026-07-29T20:00:00.000Z');
    const { store, controllerSession } = createRoundRoom({ now: () => now });
    store.updateSettings(
      controllerSession,
      {
        gridSize: 5,
        roundDurationSeconds: 90,
        scoringMode: 'traditional',
      },
      'socket-controller',
    );

    const state = store.startRound(controllerSession, 'socket-controller').room;

    expect(state.phase).toBe('ROUND_ACTIVE');
    expect(state.serverTime).toBe('2026-07-29T20:00:00.000Z');
    expect(state.round).toMatchObject({
      id: createUuid(701),
      number: 1,
      settings: {
        gridSize: 5,
        roundDurationSeconds: 90,
        scoringMode: 'traditional',
      },
      board: { size: 5 },
      startedAt: '2026-07-29T20:00:00.000Z',
      deadlineAt: '2026-07-29T20:01:30.000Z',
      endedAt: null,
      generationAttempts: 2,
    });
    expect(state.round?.board.tiles).toHaveLength(25);
    expect(roomStateSchema.parse(state)).toEqual(state);
  });

  it('snapshots only players connected at round start', () => {
    const { store, display, controllerSession } = createRoundRoom();
    const offline = store.joinPlayer(
      display.room.code,
      'Amber Kite',
      'socket-offline',
    );
    store.disconnect(
      {
        role: 'player',
        roomCode: display.room.code,
        playerId: offline.session.playerId,
      },
      'socket-offline',
    );
    const state = store.startRound(controllerSession, 'socket-controller').room;

    expect(state.round?.participants).toEqual([
      {
        playerId: controllerSession.playerId,
        displayName: 'Silver Owl',
      },
    ]);
  });

  it('does not add a mid-round joiner to the participant snapshot', () => {
    const { store, display, controllerSession } = createRoundRoom();
    const started = store.startRound(
      controllerSession,
      'socket-controller',
    ).room;
    const joined = store.joinPlayer(
      display.room.code,
      'Amber Kite',
      'socket-late',
    );

    expect(joined.room.phase).toBe('ROUND_ACTIVE');
    expect(joined.room.round?.participants).toEqual(
      started.round?.participants,
    );
    expect(joined.room.players).toHaveLength(2);
  });

  it('keeps a participant snapshot after disconnect, leave, and reconnect', () => {
    const { store, display, controller, controllerSession } = createRoundRoom();
    const started = store.startRound(
      controllerSession,
      'socket-controller',
    ).room;
    store.disconnect(controllerSession, 'socket-controller');
    store.reconnectPlayer(
      display.room.code,
      controller.session.playerReconnectToken,
      'socket-controller-new',
    );
    const afterReconnect = store.getRoomState(display.room.code);

    expect(afterReconnect?.round?.participants).toEqual(
      started.round?.participants,
    );
  });

  it('rejects settings changes and another start while active', () => {
    const { store, controllerSession } = createRoundRoom();
    store.startRound(controllerSession, 'socket-controller');

    expectRoomError(
      () =>
        store.updateSettings(
          controllerSession,
          {
            gridSize: 6,
            roundDurationSeconds: 30,
            scoringMode: 'traditional',
          },
          'socket-controller',
        ),
      'ROUND_IN_PROGRESS',
    );
    expectRoomError(
      () => store.startRound(controllerSession, 'socket-controller'),
      'ROUND_IN_PROGRESS',
    );
  });

  it('leaves the room unchanged when board generation fails', () => {
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    const { store, display, controllerSession } = createRoundRoom({
      now: () => now,
      generator: () => ({
        success: false,
        code: 'NO_ACCEPTABLE_BOARD',
        attempts: 8,
      }),
    });
    const before = store.getRoomState(display.room.code);
    now += 1_000;

    expectRoomError(
      () => store.startRound(controllerSession, 'socket-controller'),
      'BOARD_GENERATION_FAILED',
    );
    const after = store.getRoomState(display.room.code);
    expect(after).toMatchObject({
      phase: before?.phase,
      lastActivityAt: before?.lastActivityAt,
      expiresAt: before?.expiresAt,
      settings: before?.settings,
      round: null,
    });
  });

  it('rejects malformed generator output without mutating the room', () => {
    const { store, display, controllerSession } = createRoundRoom({
      generator: (size) => ({
        success: true,
        board: { size, tiles: ['A'] },
        attempts: 1,
      }),
    });

    expectRoomError(
      () => store.startRound(controllerSession, 'socket-controller'),
      'BOARD_GENERATION_FAILED',
    );
    expect(store.getRoomState(display.room.code)?.phase).toBe('LOBBY');
  });

  it('rejects a start by an ordinary player or stale controller socket', () => {
    const { store, display, controllerSession } = createRoundRoom();
    const ordinary = store.joinPlayer(
      display.room.code,
      'Amber Kite',
      'socket-ordinary',
    );

    expectRoomError(
      () =>
        store.startRound(
          {
            role: 'player',
            roomCode: display.room.code,
            playerId: ordinary.session.playerId,
          },
          'socket-ordinary',
        ),
      'NOT_CONTROLLER',
    );
    expectRoomError(
      () => store.startRound(controllerSession, 'socket-stale'),
      'UNAUTHORIZED',
    );
  });

  it('ends exactly at the deadline without touching room activity', () => {
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    const { store, display, controllerSession } = createRoundRoom({
      now: () => now,
    });
    store.updateSettings(
      controllerSession,
      {
        gridSize: 4,
        roundDurationSeconds: 30,
        scoringMode: 'traditional',
      },
      'socket-controller',
    );
    const started = store.startRound(
      controllerSession,
      'socket-controller',
    ).room;
    now += 29_999;
    expect(store.getRoomState(display.room.code)?.phase).toBe('ROUND_ACTIVE');
    now += 1;

    const ended = store.getRoomState(display.room.code);
    expect(ended?.phase).toBe('ROUND_ENDED');
    expect(ended?.round?.endedAt).toBe(started.round?.deadlineAt);
    expect(ended?.lastActivityAt).toBe(started.lastActivityAt);
    expect(ended?.expiresAt).toBe(started.expiresAt);
  });

  it('broadcast sweep reports a transition once', () => {
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    const { store, controllerSession } = createRoundRoom({ now: () => now });
    store.updateSettings(
      controllerSession,
      {
        gridSize: 4,
        roundDurationSeconds: 30,
        scoringMode: 'traditional',
      },
      'socket-controller',
    );
    store.startRound(controllerSession, 'socket-controller');
    now += 30_000;

    expect(store.advanceDueRounds()).toEqual(['ABC234']);
    expect(store.advanceDueRounds()).toEqual([]);
  });

  it('reconciles an expired round before a controller action', () => {
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    const { store, controllerSession } = createRoundRoom({ now: () => now });
    store.updateSettings(
      controllerSession,
      {
        gridSize: 4,
        roundDurationSeconds: 30,
        scoringMode: 'traditional',
      },
      'socket-controller',
    );
    store.startRound(controllerSession, 'socket-controller');
    now += 30_000;

    const updated = store.updateSettings(
      controllerSession,
      {
        gridSize: 6,
        roundDurationSeconds: 60,
        scoringMode: 'traditional',
      },
      'socket-controller',
    ).room;
    expect(updated.phase).toBe('ROUND_ENDED');
    expect(updated.settings.gridSize).toBe(6);
    expect(updated.round?.settings.gridSize).toBe(4);
  });

  it('starts the next numbered round after the prior round ends', () => {
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    const { store, controllerSession } = createRoundRoom({ now: () => now });
    store.updateSettings(
      controllerSession,
      {
        gridSize: 4,
        roundDurationSeconds: 30,
        scoringMode: 'traditional',
      },
      'socket-controller',
    );
    store.startRound(controllerSession, 'socket-controller');
    now += 30_000;

    const next = store.startRound(controllerSession, 'socket-controller').room;
    expect(next.phase).toBe('ROUND_ACTIVE');
    expect(next.round?.number).toBe(2);
    expect(next.round?.id).toBe(createUuid(702));
  });

  it('transfers controller during a round without changing round state', () => {
    const { store, display, controllerSession } = createRoundRoom();
    const second = store.joinPlayer(
      display.room.code,
      'Amber Kite',
      'socket-second',
    );
    const started = store.startRound(
      controllerSession,
      'socket-controller',
    ).room;

    const transferred = store.transferController(
      controllerSession,
      second.session.playerId,
      'socket-controller',
    ).room;
    expect(transferred.controllerPlayerId).toBe(second.session.playerId);
    expect(transferred.round).toEqual(started.round);
    expect(transferred.phase).toBe('ROUND_ACTIVE');
  });

  it('promotes a successor during a round without rewriting participants', () => {
    const { store, display, controllerSession } = createRoundRoom();
    const second = store.joinPlayer(
      display.room.code,
      'Amber Kite',
      'socket-second',
    );
    const started = store.startRound(
      controllerSession,
      'socket-controller',
    ).room;

    const left = store.leave(controllerSession, 'socket-controller');
    expect(left?.room.controllerPlayerId).toBe(second.session.playerId);
    expect(left?.room.round).toEqual(started.round);
  });

  it('protects internal board and participant snapshots from caller mutation', () => {
    const { store, display, controllerSession } = createRoundRoom();
    const started = store.startRound(
      controllerSession,
      'socket-controller',
    ).room;
    if (!started.round) {
      throw new Error('Round start failed in test setup.');
    }

    (started.round.board.tiles as string[])[0] = 'ZZ';
    (
      started.round.participants as {
        playerId: string;
        displayName: string;
      }[]
    )[0] = {
      playerId: createUuid(999),
      displayName: 'Mutated',
    };
    const fresh = store.getRoomState(display.room.code);
    expect(fresh?.round?.board.tiles[0]).toBe('QU');
    expect(fresh?.round?.participants[0]).toEqual({
      playerId: controllerSession.playerId,
      displayName: 'Silver Owl',
    });
  });

  it.each([4, 5, 6] as const)(
    'supports an authoritative %s by %s board',
    (size) => {
      const { store, controllerSession } = createRoundRoom();
      store.updateSettings(
        controllerSession,
        {
          gridSize: size,
          roundDurationSeconds: 30,
          scoringMode: 'traditional',
        },
        'socket-controller',
      );
      const round = store.startRound(controllerSession, 'socket-controller')
        .room.round;
      expect(round?.board.size).toBe(size);
      expect(round?.board.tiles).toHaveLength(size * size);
    },
  );
});
