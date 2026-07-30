import { describe, expect, it } from 'vitest';

import {
  roundPlayerResultSchema,
  roundResultsSchema,
  roundResultWordSchema,
  roundStateSchema,
} from './lobby';

const playerA = '00000000-0000-4000-8000-000000000001';
const playerB = '00000000-0000-4000-8000-000000000002';
const playerC = '00000000-0000-4000-8000-000000000003';

const uniqueTool = {
  word: 'TOOL',
  basePoints: 1,
  shared: false,
  uniqueBonusPoints: 0.25,
  finalPoints: 1.25,
} as const;

const sharedTool = {
  word: 'TOOL',
  basePoints: 1,
  shared: true,
  uniqueBonusPoints: 0,
  finalPoints: 1,
} as const;

function playerResult(
  playerId = playerA,
  displayName = 'Bright Fox',
  words: readonly {
    readonly word: string;
    readonly basePoints: 1;
    readonly shared: boolean;
    readonly uniqueBonusPoints: 0 | 0.25;
    readonly finalPoints: 1 | 1.25;
  }[] = [uniqueTool],
) {
  const baseScore = words.reduce((total, word) => total + word.basePoints, 0);
  const uniqueBonusScore = words.reduce(
    (total, word) => total + word.uniqueBonusPoints,
    0,
  );
  return {
    playerId,
    displayName,
    rank: 1,
    baseScore,
    uniqueBonusScore,
    finalScore: baseScore + uniqueBonusScore,
    words,
  };
}

function roundFixture() {
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
      tiles: Array.from({ length: 16 }, () => 'A'),
    },
    participants: [
      { playerId: playerA, displayName: 'Bright Fox' },
      { playerId: playerB, displayName: 'Amber Kite' },
    ],
    startedAt: '2026-07-30T20:00:00.000Z',
    deadlineAt: '2026-07-30T20:00:30.000Z',
    endedAt: '2026-07-30T20:00:30.000Z',
    results: {
      players: [
        playerResult(playerA, 'Bright Fox', []),
        playerResult(playerB, 'Amber Kite', []),
      ],
      winnerPlayerIds: [],
    },
    generationAttempts: 1,
  } as const;
}

describe('public round result contracts', () => {
  it('accepts exact unique-bonus and shared-base word values', () => {
    expect(roundResultWordSchema.parse(uniqueTool)).toEqual(uniqueTool);
    expect(roundResultWordSchema.parse(sharedTool)).toEqual(sharedTool);
  });

  it.each([
    {
      label: 'shared bonus',
      word: { ...sharedTool, uniqueBonusPoints: 0.25 },
    },
    {
      label: 'shared final value below base',
      word: { ...sharedTool, finalPoints: 1.25 },
    },
    {
      label: 'missing unique bonus',
      word: { ...uniqueTool, uniqueBonusPoints: 0 },
    },
    {
      label: 'unique final value without bonus',
      word: { ...uniqueTool, finalPoints: 1 },
    },
    {
      label: 'incorrect traditional base',
      word: { ...uniqueTool, basePoints: 2 },
    },
    {
      label: 'noncanonical word',
      word: { ...uniqueTool, word: 'tool' },
    },
    {
      label: 'unknown private field',
      word: { ...uniqueTool, acceptedAt: 'private' },
    },
  ])('rejects $label', ({ word }) => {
    expect(roundResultWordSchema.safeParse(word).success).toBe(false);
  });

  it('accepts every exact quarter-point word outcome', () => {
    for (const [word, basePoints, uniqueBonusPoints, finalPoints] of [
      ['TOOL', 1, 0.25, 1.25],
      ['STONE', 2, 0.5, 2.5],
      ['EAGLES', 3, 0.75, 3.75],
      ['SEASONS', 5, 1.25, 6.25],
      ['ELEPHANTS', 11, 2.75, 13.75],
    ] as const) {
      const uniqueWord = {
        word,
        basePoints,
        shared: false,
        uniqueBonusPoints,
        finalPoints,
      };
      expect(roundResultWordSchema.safeParse(uniqueWord).success).toBe(true);
      expect(
        roundResultWordSchema.safeParse(JSON.parse(JSON.stringify(uniqueWord)))
          .success,
      ).toBe(true);
      expect(
        roundResultWordSchema.safeParse({
          word,
          basePoints,
          shared: true,
          uniqueBonusPoints: 0,
          finalPoints: basePoints,
        }).success,
      ).toBe(true);
    }
  });

  it('requires exact base, bonus, and final player totals', () => {
    expect(roundPlayerResultSchema.parse(playerResult())).toEqual(
      playerResult(),
    );
    for (const player of [
      { ...playerResult(), baseScore: 2 },
      { ...playerResult(), uniqueBonusScore: 0 },
      { ...playerResult(), finalScore: 1 },
      {
        ...playerResult(),
        words: [uniqueTool, uniqueTool],
        baseScore: 2,
        uniqueBonusScore: 0.5,
        finalScore: 2.5,
      },
      { ...playerResult(), finalScore: Number.NaN },
      { ...playerResult(), uniqueBonusScore: 0.1 },
    ]) {
      expect(roundPlayerResultSchema.safeParse(player).success).toBe(false);
    }
  });

  it('rejects negative zero in every public result score position', () => {
    const negativeZero = JSON.parse('-0') as number;
    expect(Object.is(negativeZero, -0)).toBe(true);
    expect(
      roundResultWordSchema.safeParse({
        ...sharedTool,
        uniqueBonusPoints: negativeZero,
      }).success,
    ).toBe(false);

    const empty = playerResult(playerA, 'Bright Fox', []);
    for (const field of [
      'baseScore',
      'uniqueBonusScore',
      'finalScore',
    ] as const) {
      expect(
        roundPlayerResultSchema.safeParse({
          ...empty,
          [field]: negativeZero,
        }).success,
      ).toBe(false);
    }
  });

  it('accepts 256 result words and rejects 257', () => {
    const maximumWords = Array.from({ length: 256 }, (_, index) => ({
      word: `${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}A`,
      basePoints: 1 as const,
      shared: false,
      uniqueBonusPoints: 0.25 as const,
      finalPoints: 1.25 as const,
    }));
    expect(
      roundPlayerResultSchema.safeParse({
        ...playerResult(),
        baseScore: 256,
        uniqueBonusScore: 64,
        finalScore: 320,
        words: maximumWords,
      }).success,
    ).toBe(true);
    expect(
      roundPlayerResultSchema.safeParse({
        ...playerResult(),
        baseScore: 2_816,
        uniqueBonusScore: 704,
        finalScore: 3_520,
        words: maximumWords.map((word) => ({
          ...word,
          word: `${word.word}AAAAA`,
          basePoints: 11,
          uniqueBonusPoints: 2.75,
          finalPoints: 13.75,
        })),
      }).success,
    ).toBe(true);
    expect(
      roundPlayerResultSchema.safeParse({
        ...playerResult(),
        baseScore: 257,
        uniqueBonusScore: 64.25,
        finalScore: 321.25,
        words: [...maximumWords, { ...uniqueTool, word: 'ZZZ' }],
      }).success,
    ).toBe(false);
  });

  it('accepts competition ranks and every positive tied winner', () => {
    const results = {
      players: [
        { ...playerResult(playerA, 'Bright Fox'), rank: 1 },
        {
          ...playerResult(playerB, 'Amber Kite', [
            { ...uniqueTool, word: 'BEER' },
          ]),
          rank: 1,
        },
        { ...playerResult(playerC, 'Calm Lynx', []), rank: 3 },
      ],
      winnerPlayerIds: [playerA, playerB],
    };
    expect(roundResultsSchema.parse(results)).toEqual(results);

    expect(
      roundResultsSchema.safeParse({
        ...results,
        players: results.players.map((player, index) =>
          index === 2 ? { ...player, rank: 2 } : player,
        ),
      }).success,
    ).toBe(false);
    expect(
      roundResultsSchema.safeParse({
        ...results,
        winnerPlayerIds: [playerA],
      }).success,
    ).toBe(false);
    expect(
      roundResultsSchema.safeParse({
        ...results,
        winnerPlayerIds: [playerB, playerA],
      }).success,
    ).toBe(false);
  });

  it('requires no winner only when every participant has no score', () => {
    const results = roundFixture().results;
    expect(roundResultsSchema.safeParse(results).success).toBe(true);
    expect(
      roundResultsSchema.safeParse({
        ...results,
        winnerPlayerIds: [playerA],
      }).success,
    ).toBe(false);
  });

  it('makes an all-shared positive round a tied-win result', () => {
    const results = {
      players: [
        playerResult(playerA, 'Bright Fox', [sharedTool]),
        playerResult(playerB, 'Amber Kite', [sharedTool]),
      ],
      winnerPlayerIds: [playerA, playerB],
    };
    expect(roundResultsSchema.safeParse(results).success).toBe(true);
    expect(
      roundResultsSchema.safeParse({
        ...results,
        winnerPlayerIds: [],
      }).success,
    ).toBe(false);
  });

  it('independently validates shared status across result players', () => {
    const results = {
      players: [
        playerResult(playerA, 'Bright Fox', [sharedTool]),
        playerResult(playerB, 'Amber Kite', [sharedTool]),
      ],
      winnerPlayerIds: [playerA, playerB],
    };
    expect(roundResultsSchema.safeParse(results).success).toBe(true);
    expect(
      roundResultsSchema.safeParse({
        ...results,
        players: [
          playerResult(playerA, 'Bright Fox', [uniqueTool]),
          playerResult(playerB, 'Amber Kite', [sharedTool]),
        ],
      }).success,
    ).toBe(false);
  });

  it('requires exact participant identity, ordering, and membership', () => {
    const round = roundFixture();
    expect(roundStateSchema.safeParse(round).success).toBe(true);

    for (const results of [
      { ...round.results, players: round.results.players.slice(0, 1) },
      {
        ...round.results,
        players: [
          ...round.results.players,
          playerResult(playerC, 'Calm Lynx', []),
        ],
      },
      {
        ...round.results,
        players: [
          { ...round.results.players[0], displayName: 'Changed Name' },
          round.results.players[1],
        ],
      },
      {
        ...round.results,
        players: [...round.results.players].reverse(),
      },
    ]) {
      expect(roundStateSchema.safeParse({ ...round, results }).success).toBe(
        false,
      );
    }
  });

  it('validates the maximum 2,048-entry public result deterministically', () => {
    const wordFor = (index: number) =>
      [2, 1, 0]
        .map((power) =>
          String.fromCharCode(65 + (Math.floor(index / 26 ** power) % 26)),
        )
        .join('');
    const players = Array.from({ length: 8 }, (_, playerIndex) => ({
      playerId: `00000000-0000-4000-8000-${String(playerIndex + 1).padStart(12, '0')}`,
      displayName: `Player ${playerIndex + 1}`,
      rank: 1,
      baseScore: 256,
      uniqueBonusScore: 64,
      finalScore: 320,
      words: Array.from({ length: 256 }, (_, wordIndex) => ({
        word: wordFor(playerIndex * 256 + wordIndex),
        basePoints: 1 as const,
        shared: false,
        uniqueBonusPoints: 0.25 as const,
        finalPoints: 1.25 as const,
      })),
    }));
    const maximum = {
      players,
      winnerPlayerIds: players.map((player) => player.playerId),
    };

    const first = roundResultsSchema.parse(maximum);
    const second = roundResultsSchema.parse(maximum);
    expect(first).toEqual(second);
    expect(first.players).toHaveLength(8);
    expect(
      first.players.reduce((total, player) => total + player.words.length, 0),
    ).toBe(2_048);
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain('acceptedAt');
    expect(serialized).not.toContain('path');
  });

  it('requires active results to be null and ended results to be finalized', () => {
    const ended = roundFixture();
    expect(roundStateSchema.safeParse(ended).success).toBe(true);
    expect(
      roundStateSchema.safeParse({ ...ended, results: null }).success,
    ).toBe(false);
    expect(
      roundStateSchema.safeParse({
        ...ended,
        endedAt: null,
        results: ended.results,
      }).success,
    ).toBe(false);
    expect(
      roundStateSchema.safeParse({
        ...ended,
        endedAt: null,
        results: null,
      }).success,
    ).toBe(true);
  });

  it('keeps private submission fields out of every public result level', () => {
    const round = roundFixture();
    expect(
      roundResultWordSchema.safeParse({
        ...uniqueTool,
        acceptedAt: '2026-07-30T20:00:01.000Z',
      }).success,
    ).toBe(false);
    expect(
      roundPlayerResultSchema.safeParse({
        ...round.results.players[0],
        submissionVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      roundResultsSchema.safeParse({
        ...round.results,
        path: [0, 1, 2],
      }).success,
    ).toBe(false);
  });
});
