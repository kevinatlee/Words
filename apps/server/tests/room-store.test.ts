import { describe, expect, it } from 'vitest';

import { productConfig, roomStateSchema } from '@words/shared';

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
    reconcileWords?: RoomStoreOptions['reconcileWords'];
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
    ...(options.reconcileWords
      ? { reconcileWords: options.reconcileWords }
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
  it.each([
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['a negative value', -1],
    ['a timestamp too close to the Date range limit', 8_640_000_000_000_000],
  ])(
    'fails closed before creating state when the clock returns %s',
    (_label, invalidNow) => {
      const store = createStore({ now: () => invalidNow });

      expectRoomError(
        () => store.createDisplay('socket-display'),
        'INTERNAL_ERROR',
      );
      expect(store.roomCount).toBe(0);
    },
  );

  it('keeps the last safe time when an injected clock becomes invalid or moves backward', () => {
    const initialNow = Date.parse('2026-07-27T20:00:00.000Z');
    let now = initialNow;
    const store = createStore({ now: () => now });
    const created = store.createDisplay('socket-display');

    now = Number.NaN;
    expect(store.getRoomState(created.room.code)?.serverTime).toBe(
      '2026-07-27T20:00:00.000Z',
    );
    now = initialNow - 1_000;
    const joined = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-player',
    );
    expect(joined.room.serverTime).toBe('2026-07-27T20:00:00.000Z');
    expect(joined.player.joinedAt).toBe('2026-07-27T20:00:00.000Z');
  });

  it('creates a LOBBY room with one display session and no player', () => {
    const store = createStore();
    const result = store.createDisplay('socket-display');

    expect(result.room.code).toBe('ABC234');
    expect(result.room.phase).toBe('LOBBY');
    expect(result.room.display).toMatchObject({ connected: true });
    expect(result.room.players).toHaveLength(0);
    expect(result.room.controllerStatus).toBe('none');
    expect(result.room.controllerPlayerId).toBeNull();
    expect(result.room.highlights).toEqual({
      lastRound: null,
      roomRecord: null,
    });
    expect(result.session.displaySessionId).toMatch(
      /^00000000-0000-4000-8000-/,
    );
    expect(result.session.displayReconnectToken).toHaveLength(43);
    expect(result.room.settings).toEqual({
      gridSize: 5,
      roundDurationSeconds: 120,
      scoringMode: 'length-plus-unique',
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
    expect(reconnected.room.highlights).toEqual({
      lastRound: null,
      roomRecord: null,
    });
    expect(reconnected.room.highlights).not.toBe(created.room.highlights);
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
    expect(reconnected.room.stateVersion).toBe(created.room.stateVersion);
  });

  it('rotates connected role credentials without versioning private socket state', () => {
    const store = createStore();
    const created = store.createDisplay('socket-display');
    const joined = store.joinPlayer(
      created.room.code,
      'Silver Owl',
      'socket-player',
    );

    const displayReconnected = store.reconnectDisplay(
      created.room.code,
      created.session.displayReconnectToken,
      'socket-display-new',
    );
    const playerReconnected = store.reconnectPlayer(
      created.room.code,
      joined.session.playerReconnectToken,
      'socket-player-new',
    );

    expect(displayReconnected.room.stateVersion).toBe(joined.room.stateVersion);
    expect(playerReconnected.room.stateVersion).toBe(joined.room.stateVersion);
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
    const beforeCredentialExpiry = store.getRoomState(created.room.code);
    now += 60_000;

    const cleanup = store.cleanupExpired();
    const afterCredentialExpiry = store.getRoomState(created.room.code);
    expect(cleanup.deletedRoomCodes).toEqual([]);
    expect(cleanup.updatedRoomCodes).toEqual([]);
    expect(afterCredentialExpiry?.players).toHaveLength(1);
    expect(afterCredentialExpiry?.display.connected).toBe(false);
    expect(afterCredentialExpiry?.stateVersion).toBe(
      beforeCredentialExpiry?.stateVersion,
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
      reconcileWords?: RoomStoreOptions['reconcileWords'];
    } = {},
  ) {
    const store = createStore({
      ...(options.now ? { now: options.now } : {}),
      roundBoardGenerator:
        options.generator ?? ((size) => createSuccessfulBoard(size)),
      roundIds: [createUuid(701), createUuid(702)],
      ...(options.reconcileWords
        ? { reconcileWords: options.reconcileWords }
        : {}),
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

  function reconcileWithFinalScores(
    scores: readonly number[],
  ): NonNullable<RoomStoreOptions['reconcileWords']> {
    return (participants) => ({
      success: true,
      participants: participants.map((participant, index) => {
        const score = scores[index] ?? 0;
        const words =
          score === 0
            ? []
            : score === 4
              ? [
                  {
                    word: index === 0 ? 'CAT' : 'DOG',
                    basePoints: 3 as const,
                    shared: false,
                    uniqueBonusPoints: 1 as const,
                    finalPoints: 4,
                  },
                ]
              : score === 8
                ? [
                    {
                      word: index === 0 ? 'CAT' : 'DOG',
                      basePoints: 3 as const,
                      shared: false,
                      uniqueBonusPoints: 1 as const,
                      finalPoints: 4,
                    },
                    {
                      word: index === 0 ? 'HEN' : 'OWL',
                      basePoints: 3 as const,
                      shared: false,
                      uniqueBonusPoints: 1 as const,
                      finalPoints: 4,
                    },
                  ]
                : (() => {
                    throw new Error(`Unsupported test score: ${score}`);
                  })();

        return {
          playerId: participant.playerId,
          baseScore: words.reduce((total, word) => total + word.basePoints, 0),
          uniqueBonusScore: words.reduce(
            (total, word) => total + word.uniqueBonusPoints,
            0,
          ),
          finalScore: score,
          words,
        };
      }),
    });
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
      scoringMode: 'length-plus-unique' as const,
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

  it('treats an unchanged settings update as an idempotent no-op', () => {
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    const { store, display, controllerSession } = createRoundRoom({
      now: () => now,
    });
    const before = store.getRoomState(display.room.code);
    now += 1_000;

    const response = store.updateSettings(
      controllerSession,
      {
        gridSize: 5,
        roundDurationSeconds: 120,
        scoringMode: 'length-plus-unique',
      },
      'socket-controller',
    ).room;

    expect(response.stateVersion).toBe(before?.stateVersion);
    expect(response.lastActivityAt).toBe(before?.lastActivityAt);
    expect(response.expiresAt).toBe(before?.expiresAt);
    expect(response.serverTime).toBe('2026-07-29T20:00:01.000Z');
  });

  it('creates a server-owned active round from the current settings', () => {
    const now = Date.parse('2026-07-29T20:00:00.000Z');
    const { store, controllerSession } = createRoundRoom({ now: () => now });
    store.updateSettings(
      controllerSession,
      {
        gridSize: 5,
        roundDurationSeconds: 90,
        scoringMode: 'length-plus-unique',
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
        scoringMode: 'length-plus-unique',
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
            scoringMode: 'length-plus-unique',
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

  it.each([
    [
      'a thrown error',
      () => {
        throw new Error('private generator detail');
      },
    ],
    [
      'the wrong board size',
      () =>
        ({
          success: true,
          board: {
            size: 4,
            tiles: Array.from({ length: 16 }, () => 'A'),
          },
          attempts: 1,
        }) as never,
    ],
    [
      'a malformed token',
      (size: 4 | 5 | 6) =>
        ({
          success: true,
          board: {
            size,
            tiles: [
              'lowercase',
              ...Array.from({ length: size * size - 1 }, () => 'A'),
            ],
          },
          attempts: 1,
        }) as never,
    ],
    [
      'zero attempts',
      (size: 4 | 5 | 6) =>
        ({
          ...createSuccessfulBoard(size),
          attempts: 0,
        }) as never,
    ],
    [
      'nine attempts',
      (size: 4 | 5 | 6) =>
        ({
          ...createSuccessfulBoard(size),
          attempts: 9,
        }) as never,
    ],
    [
      'NaN attempts',
      (size: 4 | 5 | 6) =>
        ({
          ...createSuccessfulBoard(size),
          attempts: Number.NaN,
        }) as never,
    ],
  ])('rejects generator output with %s atomically', (_label, generator) => {
    const { store, display, controllerSession } = createRoundRoom({
      generator,
    });
    const before = store.getRoomState(display.room.code);

    expectRoomError(
      () => store.startRound(controllerSession, 'socket-controller'),
      'BOARD_GENERATION_FAILED',
    );
    expect(store.getRoomState(display.room.code)).toMatchObject({
      phase: before?.phase,
      stateVersion: before?.stateVersion,
      settings: before?.settings,
      lastActivityAt: before?.lastActivityAt,
      expiresAt: before?.expiresAt,
      controllerPlayerId: before?.controllerPlayerId,
      players: before?.players,
      round: before?.round,
    });
  });

  it('copies mutable generator output before publishing a round', () => {
    const tiles = Array.from({ length: 25 }, () => 'A');
    const { store, display, controllerSession } = createRoundRoom({
      generator: (size) => ({
        success: true,
        board: { size, tiles },
        attempts: 1,
      }),
    });

    store.startRound(controllerSession, 'socket-controller');
    tiles[0] = 'ZZ';

    expect(store.getRoomState(display.room.code)?.round?.board.tiles[0]).toBe(
      'A',
    );
  });

  it('rejects a malformed round ID without mutating authoritative room state', () => {
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    const storeWithMalformedId = createStore({
      now: () => now,
      roundIds: ['not-a-round-uuid'],
      roundBoardGenerator: (size) => createSuccessfulBoard(size),
    });
    const malformedDisplay =
      storeWithMalformedId.createDisplay('socket-display');
    const malformedController = storeWithMalformedId.joinPlayer(
      malformedDisplay.room.code,
      'Silver Owl',
      'socket-controller',
    );
    const malformedSession = {
      role: 'player' as const,
      roomCode: malformedDisplay.room.code,
      playerId: malformedController.session.playerId,
    };
    const before = storeWithMalformedId.getRoomState(
      malformedDisplay.room.code,
    );
    now += 1_000;

    expectRoomError(
      () =>
        storeWithMalformedId.startRound(malformedSession, 'socket-controller'),
      'INTERNAL_ERROR',
    );
    expect(
      storeWithMalformedId.getRoomState(malformedDisplay.room.code),
    ).toMatchObject({
      phase: before?.phase,
      stateVersion: before?.stateVersion,
      lastActivityAt: before?.lastActivityAt,
      expiresAt: before?.expiresAt,
      settings: before?.settings,
      round: null,
    });
  });

  it('rejects a start while an ended round remains visible', () => {
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    const duplicateId = createUuid(711);
    const store = createStore({
      now: () => now,
      roundIds: [duplicateId, duplicateId],
      roundBoardGenerator: (size) => createSuccessfulBoard(size),
    });
    const display = store.createDisplay('socket-display');
    const controller = store.joinPlayer(
      display.room.code,
      'Silver Owl',
      'socket-controller',
    );
    const session = {
      role: 'player' as const,
      roomCode: display.room.code,
      playerId: controller.session.playerId,
    };
    const started = store.startRound(session, 'socket-controller').room;
    now = Date.parse(started.round?.deadlineAt ?? '');
    const ended = store.getRoomState(display.room.code);

    expectRoomError(
      () => store.startRound(session, 'socket-controller'),
      'ROUND_IN_PROGRESS',
    );
    expect(store.getRoomState(display.room.code)).toMatchObject({
      phase: 'ROUND_ENDED',
      stateVersion: ended?.stateVersion,
      lastActivityAt: ended?.lastActivityAt,
      expiresAt: ended?.expiresAt,
      round: ended?.round,
    });
  });

  it('bounds a thrown round ID generator error without mutating the room', () => {
    let tokenIndex = 0;
    const store = new RoomStore({
      maxPlayers: 8,
      maxRooms: 20,
      roomTtlMs: 120 * 60 * 1_000,
      reconnectGraceMs: 60_000,
      roomCodeGenerator: () => 'ABC234',
      displaySessionIdGenerator: () => createUuid(100),
      playerIdGenerator: () => createUuid(1),
      reconnectTokenGenerator: () =>
        `${String(++tokenIndex).padStart(3, '0')}${'t'.repeat(40)}`,
      roundIdGenerator: () => {
        throw new Error('private UUID generator detail');
      },
      roundBoardGenerator: (size) => createSuccessfulBoard(size),
    });
    const display = store.createDisplay('socket-display');
    const controller = store.joinPlayer(
      display.room.code,
      'Silver Owl',
      'socket-controller',
    );
    const before = store.getRoomState(display.room.code);

    expectRoomError(
      () =>
        store.startRound(
          {
            role: 'player',
            roomCode: display.room.code,
            playerId: controller.session.playerId,
          },
          'socket-controller',
        ),
      'INTERNAL_ERROR',
    );
    expect(store.getRoomState(display.room.code)).toMatchObject({
      phase: before?.phase,
      stateVersion: before?.stateVersion,
      lastActivityAt: before?.lastActivityAt,
      expiresAt: before?.expiresAt,
      round: null,
    });
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
        scoringMode: 'length-plus-unique',
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
        scoringMode: 'length-plus-unique',
      },
      'socket-controller',
    );
    store.startRound(controllerSession, 'socket-controller');
    now += 30_000;

    expect(store.advanceDueRounds()).toEqual(['ABC234']);
    expect(store.advanceDueRounds()).toEqual([]);
  });

  it('advances multiple due rooms once in the same bounded sweep', () => {
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    const store = createStore({
      now: () => now,
      codes: ['ABC234', 'DEF567'],
      roundIds: [createUuid(721), createUuid(722)],
      roundBoardGenerator: (size) => createSuccessfulBoard(size),
    });
    const firstDisplay = store.createDisplay('socket-display-one');
    const firstController = store.joinPlayer(
      firstDisplay.room.code,
      'Silver Owl',
      'socket-controller-one',
    );
    const secondDisplay = store.createDisplay('socket-display-two');
    const secondController = store.joinPlayer(
      secondDisplay.room.code,
      'Amber Kite',
      'socket-controller-two',
    );
    const firstSession = {
      role: 'player' as const,
      roomCode: firstDisplay.room.code,
      playerId: firstController.session.playerId,
    };
    const secondSession = {
      role: 'player' as const,
      roomCode: secondDisplay.room.code,
      playerId: secondController.session.playerId,
    };
    for (const [session, socketId] of [
      [firstSession, 'socket-controller-one'],
      [secondSession, 'socket-controller-two'],
    ] as const) {
      store.updateSettings(
        session,
        {
          gridSize: 4,
          roundDurationSeconds: 30,
          scoringMode: 'length-plus-unique',
        },
        socketId,
      );
      store.startRound(session, socketId);
    }

    now += 30_000;
    expect(store.advanceDueRounds()).toEqual(['ABC234', 'DEF567']);
    expect(store.advanceDueRounds()).toEqual([]);
  });

  it('lets room expiration win when TTL and round deadline share a sweep', () => {
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    const store = createStore({
      now: () => now,
      roomTtlMs: 30_000,
      roundIds: [createUuid(731)],
      roundBoardGenerator: (size) => createSuccessfulBoard(size),
    });
    const display = store.createDisplay('socket-display');
    const controller = store.joinPlayer(
      display.room.code,
      'Silver Owl',
      'socket-controller',
    );
    const session = {
      role: 'player' as const,
      roomCode: display.room.code,
      playerId: controller.session.playerId,
    };
    store.updateSettings(
      session,
      {
        gridSize: 4,
        roundDurationSeconds: 30,
        scoringMode: 'length-plus-unique',
      },
      'socket-controller',
    );
    store.startRound(session, 'socket-controller');

    now += 30_000;
    expect(store.cleanupExpired()).toEqual({
      deletedRoomCodes: ['ABC234'],
      updatedRoomCodes: [],
    });
    expect(store.getRoomState(display.room.code)).toBeNull();
  });

  it('keeps finalized results until the authoritative window expires', () => {
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    const { store, controllerSession } = createRoundRoom({ now: () => now });
    store.updateSettings(
      controllerSession,
      {
        gridSize: 4,
        roundDurationSeconds: 30,
        scoringMode: 'length-plus-unique',
      },
      'socket-controller',
    );
    store.startRound(controllerSession, 'socket-controller');
    now += 30_000;

    expectRoomError(
      () =>
        store.updateSettings(
          controllerSession,
          {
            gridSize: 6,
            roundDurationSeconds: 60,
            scoringMode: 'length-plus-unique',
          },
          'socket-controller',
        ),
      'ROUND_IN_PROGRESS',
    );
    const ended = store.getRoomState('ABC234');
    expect(ended?.phase).toBe('ROUND_ENDED');
    const version = ended?.stateVersion;
    now += productConfig.resultsDisplaySeconds * 1_000 - 1;
    expect(store.advanceDueRounds()).toEqual([]);
    expect(store.getRoomState('ABC234')?.round).not.toBeNull();
    now += 1;
    expect(store.advanceDueRounds()).toEqual(['ABC234']);
    const lobby = store.getRoomState('ABC234');
    expect(lobby?.phase).toBe('LOBBY');
    expect(lobby?.round).toBeNull();
    expect(lobby?.stateVersion).toBe((version ?? 0) + 1);
    expect(store.advanceDueRounds()).toEqual([]);
  });

  it('starts Round 2 after temporary Round 1 results are discarded', () => {
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    const { store, controllerSession } = createRoundRoom({ now: () => now });
    store.updateSettings(
      controllerSession,
      {
        gridSize: 4,
        roundDurationSeconds: 30,
        scoringMode: 'length-plus-unique',
      },
      'socket-controller',
    );
    store.startRound(controllerSession, 'socket-controller');
    now += 30_000;
    store.advanceDueRounds();
    now += productConfig.resultsDisplaySeconds * 1_000;
    store.advanceDueRounds();

    const next = store.startRound(controllerSession, 'socket-controller').room;
    expect(next.phase).toBe('ROUND_ACTIVE');
    expect(next.round?.number).toBe(2);
    expect(next.round?.id).toBe(createUuid(702));
  });

  it('keeps both highlights null after a first-ever non-scoring round', () => {
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    const { store, display, controllerSession } = createRoundRoom({
      now: () => now,
      reconcileWords: (participants) =>
        reconcileWithFinalScores([0])(participants),
    });

    store.startRound(controllerSession, 'socket-controller');
    now += 120_000;
    expect(store.advanceDueRounds()).toEqual([display.room.code]);

    const ended = store.getRoomState(display.room.code);
    expect(ended?.phase).toBe('ROUND_ENDED');
    expect(ended?.round?.results?.winnerPlayerIds).toEqual([]);
    expect(ended?.highlights).toEqual({ lastRound: null, roomRecord: null });
  });

  it('derives, preserves, and replaces authoritative highlights across rounds', () => {
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    const scorePlans = [
      [4, 0],
      [0, 0],
      [4, 4],
      [8, 8],
      [4, 0],
    ] as const;
    let finalizationIndex = 0;
    const { store, display, controllerSession } = createRoundRoom({
      now: () => now,
      reconcileWords: (participants) =>
        reconcileWithFinalScores(scorePlans[finalizationIndex++] ?? [])(
          participants,
        ),
    });
    const ordinary = store.joinPlayer(
      display.room.code,
      'Amber Kite',
      'socket-ordinary',
    );
    const finishRound = () => {
      const started = store.startRound(
        controllerSession,
        'socket-controller',
      ).room;
      const activity = started.lastActivityAt;
      const expiry = started.expiresAt;
      now += 120_000;
      expect(store.advanceDueRounds()).toEqual([display.room.code]);
      const ended = store.getRoomState(display.room.code);
      expect(ended?.lastActivityAt).toBe(activity);
      expect(ended?.expiresAt).toBe(expiry);
      expect(roomStateSchema.safeParse(ended).success).toBe(true);
      return ended;
    };
    const resetRound = () => {
      now += productConfig.resultsDisplaySeconds * 1_000;
      expect(store.advanceDueRounds()).toEqual([display.room.code]);
      return store.getRoomState(display.room.code);
    };

    const first = finishRound();
    expect(first?.highlights).toEqual({
      lastRound: {
        roundNumber: 1,
        winners: [
          { playerId: controllerSession.playerId, displayName: 'Silver Owl' },
        ],
        winningScore: 4,
      },
      roomRecord: {
        roundNumber: 1,
        holders: [
          { playerId: controllerSession.playerId, displayName: 'Silver Owl' },
        ],
        score: 4,
      },
    });

    const firstWinner = first?.highlights.lastRound?.winners[0];
    if (!firstWinner) {
      throw new Error('Expected a first-round winner.');
    }
    Reflect.set(firstWinner, 'displayName', 'Mutated');
    const freshFirst = store.getRoomState(display.room.code);
    expect(freshFirst?.highlights.lastRound?.winners[0]?.displayName).toBe(
      'Silver Owl',
    );
    const firstHighlights = freshFirst?.highlights;

    const lobbyAfterFirst = resetRound();
    expect(lobbyAfterFirst?.phase).toBe('LOBBY');
    expect(lobbyAfterFirst?.round).toBeNull();
    expect(lobbyAfterFirst?.highlights.roomRecord).toEqual({
      roundNumber: 1,
      holders: [
        { playerId: controllerSession.playerId, displayName: 'Silver Owl' },
      ],
      score: 4,
    });
    expect(lobbyAfterFirst?.highlights.lastRound).toEqual(
      firstHighlights?.lastRound,
    );

    const second = finishRound();
    expect(second?.round?.number).toBe(2);
    expect(second?.highlights).toEqual(firstHighlights);

    resetRound();
    const third = finishRound();
    expect(third?.highlights.lastRound).toEqual({
      roundNumber: 3,
      winners: [
        { playerId: controllerSession.playerId, displayName: 'Silver Owl' },
        { playerId: ordinary.session.playerId, displayName: 'Amber Kite' },
      ],
      winningScore: 4,
    });
    expect(third?.highlights.roomRecord).toEqual(firstHighlights?.roomRecord);

    resetRound();
    const fourth = finishRound();
    expect(fourth?.highlights.roomRecord).toEqual({
      roundNumber: 4,
      holders: [
        { playerId: controllerSession.playerId, displayName: 'Silver Owl' },
        { playerId: ordinary.session.playerId, displayName: 'Amber Kite' },
      ],
      score: 8,
    });
    const recordHolders = fourth?.highlights.roomRecord?.holders;
    if (!recordHolders) {
      throw new Error('Expected record holders.');
    }
    Reflect.apply(Array.prototype.push, recordHolders, [
      { playerId: createUuid(999), displayName: 'Mutated' },
    ]);
    const freshFourth = store.getRoomState(display.room.code);
    expect(freshFourth?.highlights.roomRecord?.holders).toHaveLength(2);
    expect(freshFourth?.highlights.roomRecord?.holders[0]?.displayName).toBe(
      'Silver Owl',
    );
    resetRound();
    const fifth = finishRound();
    expect(fifth?.round?.number).toBe(5);
    expect(fifth?.highlights.lastRound).toEqual({
      roundNumber: 5,
      winners: [
        { playerId: controllerSession.playerId, displayName: 'Silver Owl' },
      ],
      winningScore: 4,
    });
    expect(fifth?.highlights.roomRecord).toEqual(
      freshFourth?.highlights.roomRecord,
    );
    const version = fifth?.stateVersion;
    expect(store.advanceDueRounds()).toEqual([]);
    expect(store.getRoomState(display.room.code)?.stateVersion).toBe(version);
  });

  it('leaves the room unchanged when finalization validation fails', () => {
    let now = Date.parse('2026-07-29T20:00:00.000Z');
    let returnValidResults = false;
    const { store, display, controllerSession } = createRoundRoom({
      now: () => now,
      reconcileWords: (participants) =>
        returnValidResults
          ? reconcileWithFinalScores([4])(participants)
          : {
              success: true,
              participants: participants.map((participant) => ({
                playerId: participant.playerId,
                baseScore: 4,
                uniqueBonusScore: 0,
                finalScore: 4,
                words: [],
              })),
            },
    });
    const started = store.startRound(
      controllerSession,
      'socket-controller',
    ).room;
    now += 120_000;

    expectRoomError(
      () => store.reconcileDueRound(display.room.code, now),
      'INTERNAL_ERROR',
    );
    returnValidResults = true;
    const ended = store.reconcileDueRound(display.room.code, now);

    expect(ended?.phase).toBe('ROUND_ENDED');
    expect(ended?.stateVersion).toBe(started.stateVersion + 1);
    expect(ended?.highlights).toEqual({
      lastRound: {
        roundNumber: 1,
        winners: [
          { playerId: controllerSession.playerId, displayName: 'Silver Owl' },
        ],
        winningScore: 4,
      },
      roomRecord: {
        roundNumber: 1,
        holders: [
          { playerId: controllerSession.playerId, displayName: 'Silver Owl' },
        ],
        score: 4,
      },
    });
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
          scoringMode: 'length-plus-unique',
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
