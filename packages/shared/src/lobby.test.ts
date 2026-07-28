import { describe, expect, it } from 'vitest';

import {
  createDisplayInputSchema,
  displayNameSchema,
  joinPlayerInputSchema,
  normalizeDisplayName,
  normalizeRoomCode,
  reconnectDisplayInputSchema,
  reconnectPlayerInputSchema,
  roomCodeSchema,
  roomStateSchema,
} from './lobby';

const controllerPlayerId = '00000000-0000-4000-8000-000000000001';

function roomStateFixture() {
  return {
    code: 'ABC234',
    phase: 'LOBBY',
    createdAt: '2026-07-27T20:00:00.000Z',
    lastActivityAt: '2026-07-27T20:00:00.000Z',
    expiresAt: '2026-07-27T22:00:00.000Z',
    maxPlayers: 8,
    display: {
      connected: true,
      createdAt: '2026-07-27T20:00:00.000Z',
    },
    controllerPlayerId,
    players: [
      {
        id: controllerPlayerId,
        displayName: 'Bright Fox',
        connected: true,
        joinedAt: '2026-07-27T20:00:01.000Z',
        isController: true,
      },
    ],
    settings: {
      gridSize: 4,
      roundDurationSeconds: 180,
      scoringMode: 'traditional',
    },
  } as const;
}

describe('lobby contracts', () => {
  it('normalizes human-entered room codes consistently', () => {
    expect(normalizeRoomCode(' ab-c 234 ')).toBe('ABC234');
    expect(roomCodeSchema.parse(' ab-c 234 ')).toBe('ABC234');
  });

  it('rejects malformed or visually confusing room codes', () => {
    expect(roomCodeSchema.safeParse('ABC12').success).toBe(false);
    expect(roomCodeSchema.safeParse('ABC1O0').success).toBe(false);
    expect(roomCodeSchema.safeParse('ABC$34').success).toBe(false);
  });

  it('trims and collapses display-name whitespace', () => {
    expect(normalizeDisplayName('  Bright   Fox  ')).toBe('Bright Fox');
    expect(displayNameSchema.parse('  Bright   Fox  ')).toBe('Bright Fox');
  });

  it('accepts HTML-like names as plain string data', () => {
    expect(displayNameSchema.parse('<Bright Fox>')).toBe('<Bright Fox>');
  });

  it('rejects short, long, and control-character names', () => {
    expect(displayNameSchema.safeParse('A').success).toBe(false);
    expect(displayNameSchema.safeParse('A'.repeat(25)).success).toBe(false);
    expect(displayNameSchema.safeParse('Bright\u0000Fox').success).toBe(false);
  });

  it('allows room creation only for an empty display payload', () => {
    expect(createDisplayInputSchema.parse({})).toEqual({});
    expect(
      createDisplayInputSchema.safeParse({
        displayName: 'Not a player',
      }).success,
    ).toBe(false);
  });

  it('rejects client attempts to self-assign controller authority', () => {
    expect(
      joinPlayerInputSchema.safeParse({
        roomCode: 'ABC234',
        displayName: 'Bright Fox',
        controllerPlayerId,
      }).success,
    ).toBe(false);
    expect(
      joinPlayerInputSchema.safeParse({
        roomCode: 'ABC234',
        displayName: 'Bright Fox',
        isController: true,
      }).success,
    ).toBe(false);
  });

  it('keeps display and player reconnect payloads distinct', () => {
    const token = 'a'.repeat(43);

    expect(
      reconnectDisplayInputSchema.parse({
        roomCode: 'abc234',
        displayReconnectToken: token,
      }),
    ).toEqual({
      roomCode: 'ABC234',
      displayReconnectToken: token,
    });
    expect(
      reconnectPlayerInputSchema.parse({
        roomCode: 'abc234',
        playerReconnectToken: token,
      }),
    ).toEqual({
      roomCode: 'ABC234',
      playerReconnectToken: token,
    });
    expect(
      reconnectPlayerInputSchema.safeParse({
        roomCode: 'ABC234',
        displayReconnectToken: token,
      }).success,
    ).toBe(false);
  });

  it('accepts an empty room with a display session and no controller', () => {
    const state = roomStateSchema.parse({
      ...roomStateFixture(),
      controllerPlayerId: null,
      players: [],
    });

    expect(state.display.connected).toBe(true);
    expect(state.players).toHaveLength(0);
    expect(state.controllerPlayerId).toBeNull();
  });

  it('requires controller authority to reference exactly one player ID', () => {
    const state = roomStateSchema.parse(roomStateFixture());
    expect(state.controllerPlayerId).toBe(controllerPlayerId);
    expect(state.players[0]?.isController).toBe(true);

    expect(
      roomStateSchema.safeParse({
        ...roomStateFixture(),
        controllerPlayerId: '00000000-0000-4000-8000-000000000002',
      }).success,
    ).toBe(false);
    expect(
      roomStateSchema.safeParse({
        ...roomStateFixture(),
        players: [
          {
            ...roomStateFixture().players[0],
            isController: false,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('keeps Stage 2 state bounded and free of game-engine data', () => {
    const state = roomStateSchema.parse(roomStateFixture());

    expect(state.phase).toBe('LOBBY');
    expect(state.settings.gridSize).toBe(4);
    expect(state).not.toHaveProperty('board');
    expect(state).not.toHaveProperty('scores');
  });
});
