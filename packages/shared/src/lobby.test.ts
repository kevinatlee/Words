import { describe, expect, it } from 'vitest';

import {
  createDisplayInputSchema,
  displayNameSchema,
  joinPlayerInputSchema,
  normalizeDisplayName,
  normalizeRoomCode,
  reconnectDisplayInputSchema,
  reconnectPlayerInputSchema,
  roomSettingsSchema,
  roomCodeSchema,
  roomStateSchema,
  roundStateSchema,
  startRoundInputSchema,
  transferControllerInputSchema,
  updateRoomSettingsInputSchema,
} from './lobby';

const controllerPlayerId = '00000000-0000-4000-8000-000000000001';
const ordinaryPlayerId = '00000000-0000-4000-8000-000000000002';

function roomStateFixture() {
  return {
    code: 'ABC234',
    phase: 'LOBBY',
    stateVersion: 0,
    serverTime: '2026-07-27T20:00:00.000Z',
    createdAt: '2026-07-27T20:00:00.000Z',
    lastActivityAt: '2026-07-27T20:00:00.000Z',
    expiresAt: '2026-07-27T22:00:00.000Z',
    maxPlayers: 8,
    display: {
      connected: true,
      createdAt: '2026-07-27T20:00:00.000Z',
    },
    controllerStatus: 'assigned',
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
    round: null,
  } as const;
}

function roundStateFixture() {
  return {
    id: '00000000-0000-4000-8000-000000000100',
    number: 1,
    settings: {
      gridSize: 4,
      roundDurationSeconds: 30,
      scoringMode: 'traditional',
    },
    board: {
      size: 4,
      tiles: [
        'A',
        'B',
        'C',
        'D',
        'E',
        'F',
        'G',
        'H',
        'I',
        'J',
        'K',
        'L',
        'M',
        'N',
        'O',
        'QU',
      ],
    },
    participants: [
      {
        playerId: controllerPlayerId,
        displayName: 'Bright Fox',
      },
    ],
    startedAt: '2026-07-27T20:00:00.000Z',
    deadlineAt: '2026-07-27T20:00:30.000Z',
    endedAt: null,
    generationAttempts: 1,
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

  it('accepts only a target player ID for controller transfer', () => {
    const input = { targetPlayerId: ordinaryPlayerId };

    expect(transferControllerInputSchema.parse(input)).toEqual(input);
    expect(
      transferControllerInputSchema.safeParse({
        ...input,
        requesterPlayerId: controllerPlayerId,
      }).success,
    ).toBe(false);
    expect(
      transferControllerInputSchema.safeParse({
        targetPlayerId: 'a'.repeat(1_000),
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
      controllerStatus: 'none',
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

  it('represents no controller only when no player is connected', () => {
    const fixture = roomStateFixture();
    const noControllerState = roomStateSchema.parse({
      ...fixture,
      controllerStatus: 'none',
      controllerPlayerId: null,
      players: fixture.players.map((player) => ({
        ...player,
        connected: false,
        isController: false,
      })),
    });

    expect(noControllerState.controllerStatus).toBe('none');
    expect(noControllerState.controllerPlayerId).toBeNull();
    expect(
      noControllerState.players.every((player) => !player.isController),
    ).toBe(true);
  });

  it('rejects controller status and player-ID mismatches', () => {
    const fixture = roomStateFixture();

    expect(
      roomStateSchema.safeParse({
        ...fixture,
        controllerStatus: 'assigned',
        controllerPlayerId: null,
        players: fixture.players.map((player) => ({
          ...player,
          isController: false,
        })),
      }).success,
    ).toBe(false);
    expect(
      roomStateSchema.safeParse({
        ...fixture,
        controllerStatus: 'none',
        controllerPlayerId: null,
      }).success,
    ).toBe(false);
    expect(
      roomStateSchema.safeParse({
        ...fixture,
        controllerPlayerId: '00000000-0000-4000-8000-000000000100',
      }).success,
    ).toBe(false);
  });

  it('keeps lobby state bounded and free of round data', () => {
    const state = roomStateSchema.parse(roomStateFixture());

    expect(state.phase).toBe('LOBBY');
    expect(state.settings.gridSize).toBe(4);
    expect(state.round).toBeNull();
    expect(state).not.toHaveProperty('board');
    expect(state).not.toHaveProperty('scores');
  });

  it('accepts exactly the three authoritative room phases', () => {
    for (const phase of ['LOBBY', 'ROUND_ACTIVE', 'ROUND_ENDED']) {
      const round =
        phase === 'LOBBY'
          ? null
          : {
              ...roundStateFixture(),
              endedAt:
                phase === 'ROUND_ENDED' ? '2026-07-27T20:00:30.000Z' : null,
            };
      expect(
        roomStateSchema.safeParse({
          ...roomStateFixture(),
          phase,
          round,
        }).success,
      ).toBe(true);
    }

    expect(
      roomStateSchema.safeParse({
        ...roomStateFixture(),
        phase: 'RESULTS',
      }).success,
    ).toBe(false);
  });

  it('requires a matching phase and round snapshot', () => {
    expect(
      roomStateSchema.safeParse({
        ...roomStateFixture(),
        phase: 'ROUND_ACTIVE',
        round: null,
      }).success,
    ).toBe(false);
    expect(
      roomStateSchema.safeParse({
        ...roomStateFixture(),
        phase: 'LOBBY',
        round: roundStateFixture(),
      }).success,
    ).toBe(false);
    expect(
      roomStateSchema.safeParse({
        ...roomStateFixture(),
        phase: 'ROUND_ENDED',
        round: roundStateFixture(),
      }).success,
    ).toBe(false);
  });

  it('validates board dimensions and complete tile tokens', () => {
    expect(roundStateSchema.parse(roundStateFixture()).board.tiles[15]).toBe(
      'QU',
    );
    expect(
      roundStateSchema.safeParse({
        ...roundStateFixture(),
        board: { size: 5, tiles: roundStateFixture().board.tiles },
      }).success,
    ).toBe(false);
    expect(
      roundStateSchema.safeParse({
        ...roundStateFixture(),
        board: {
          ...roundStateFixture().board,
          tiles: [...roundStateFixture().board.tiles.slice(0, 15), 'Qu'],
        },
      }).success,
    ).toBe(false);
  });

  it.each([4, 5, 6] as const)('accepts an exact %s by %s board', (size) => {
    const round = {
      ...roundStateFixture(),
      settings: { ...roundStateFixture().settings, gridSize: size },
      board: {
        size,
        tiles: Array.from({ length: size * size }, () => 'A'),
      },
    };
    expect(roundStateSchema.safeParse(round).success).toBe(true);
  });

  it('requires the board size to match the settings snapshot', () => {
    expect(
      roundStateSchema.safeParse({
        ...roundStateFixture(),
        settings: { ...roundStateFixture().settings, gridSize: 5 },
      }).success,
    ).toBe(false);
  });

  it('requires the exact authoritative deadline delta', () => {
    expect(
      roundStateSchema.safeParse({
        ...roundStateFixture(),
        deadlineAt: '2026-07-27T20:00:29.999Z',
      }).success,
    ).toBe(false);
  });

  it('requires an ended round timestamp to equal its deadline exactly', () => {
    for (const endedAt of [
      '2026-07-27T20:00:29.999Z',
      '2026-07-27T20:00:30.001Z',
    ]) {
      expect(
        roundStateSchema.safeParse({
          ...roundStateFixture(),
          endedAt,
        }).success,
      ).toBe(false);
    }
    expect(
      roundStateSchema.safeParse({
        ...roundStateFixture(),
        endedAt: roundStateFixture().deadlineAt,
      }).success,
    ).toBe(true);
  });

  it('requires unique bounded participant IDs', () => {
    expect(
      roundStateSchema.safeParse({
        ...roundStateFixture(),
        participants: [
          ...roundStateFixture().participants,
          ...roundStateFixture().participants,
        ],
      }).success,
    ).toBe(false);
    expect(
      roundStateSchema.safeParse({
        ...roundStateFixture(),
        participants: Array.from({ length: 9 }, (_, index) => ({
          playerId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          displayName: `Player ${index + 1}`,
        })),
      }).success,
    ).toBe(false);
  });

  it('bounds board generation attempts to the production profile', () => {
    expect(
      roundStateSchema.safeParse({
        ...roundStateFixture(),
        generationAttempts: 9,
      }).success,
    ).toBe(false);
    expect(
      roundStateSchema.safeParse({
        ...roundStateFixture(),
        generationAttempts: 0,
      }).success,
    ).toBe(false);
    expect(
      roundStateSchema.safeParse({
        ...roundStateFixture(),
        number: 0,
      }).success,
    ).toBe(false);
  });

  it('requires a valid authoritative server-time snapshot', () => {
    expect(
      roomStateSchema.safeParse({
        ...roomStateFixture(),
        serverTime: 'not-a-time',
      }).success,
    ).toBe(false);
  });

  it('requires complete strict settings update payloads', () => {
    const settings = roomStateFixture().settings;
    expect(updateRoomSettingsInputSchema.parse(settings)).toEqual(settings);
    expect(
      updateRoomSettingsInputSchema.safeParse({
        gridSize: 5,
        roundDurationSeconds: 60,
      }).success,
    ).toBe(false);
    expect(
      roomSettingsSchema.safeParse({
        ...settings,
        controllerPlayerId,
      }).success,
    ).toBe(false);
  });

  it('accepts only an empty round-start payload', () => {
    expect(startRoundInputSchema.parse({})).toEqual({});
    expect(startRoundInputSchema.safeParse({ gridSize: 6 }).success).toBe(
      false,
    );
  });

  it('rejects unknown room and round fields', () => {
    expect(
      roomStateSchema.safeParse({
        ...roomStateFixture(),
        score: 100,
      }).success,
    ).toBe(false);
    expect(
      roundStateSchema.safeParse({
        ...roundStateFixture(),
        words: [],
      }).success,
    ).toBe(false);
  });
});
