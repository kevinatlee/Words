import { describe, expect, it } from 'vitest';

import {
  createRoomInputSchema,
  displayNameSchema,
  joinRoomInputSchema,
  normalizeDisplayName,
  normalizeRoomCode,
  reconnectRoomInputSchema,
  roomCodeSchema,
  roomStateSchema,
} from './lobby';

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

  it('rejects client attempts to add host authority', () => {
    expect(
      createRoomInputSchema.safeParse({
        displayName: 'Bright Fox',
        isHost: true,
      }).success,
    ).toBe(false);
  });

  it('validates join and reconnect payload sizes', () => {
    expect(
      joinRoomInputSchema.parse({
        roomCode: 'abc234',
        displayName: 'Silver Owl',
      }),
    ).toEqual({
      roomCode: 'ABC234',
      displayName: 'Silver Owl',
    });
    expect(
      reconnectRoomInputSchema.safeParse({
        roomCode: 'ABC234',
        reconnectToken: 'short',
      }).success,
    ).toBe(false);
  });

  it('accepts only bounded Stage 2 lobby state', () => {
    const state = roomStateSchema.parse({
      code: 'ABC234',
      phase: 'LOBBY',
      createdAt: '2026-07-27T20:00:00.000Z',
      lastActivityAt: '2026-07-27T20:00:00.000Z',
      expiresAt: '2026-07-27T22:00:00.000Z',
      maxPlayers: 8,
      players: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          displayName: 'Bright Fox',
          connected: true,
          joinedAt: '2026-07-27T20:00:00.000Z',
          isHost: true,
        },
      ],
      settings: {
        gridSize: 4,
        roundDurationSeconds: 180,
        scoringMode: 'traditional',
      },
    });

    expect(state.phase).toBe('LOBBY');
    expect(state.settings.gridSize).toBe(4);
    expect(state).not.toHaveProperty('board');
    expect(state).not.toHaveProperty('scores');
  });
});
