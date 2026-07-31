import { describe, expect, it } from 'vitest';

import {
  roundPlayerResultSchema,
  roundResultsSchema,
  roundResultWordSchema,
  roomSettingsSchema,
} from './lobby';

const playerA = '00000000-0000-4000-8000-000000000001';
const playerB = '00000000-0000-4000-8000-000000000002';

const uniqueWord = {
  word: 'STONE',
  basePoints: 5,
  shared: false,
  uniqueBonusPoints: 2,
  finalPoints: 7,
} as const;
const sharedWord = {
  word: 'TOOL',
  basePoints: 4,
  shared: true,
  uniqueBonusPoints: 0,
  finalPoints: 4,
} as const;
type ResultWordFixture = {
  readonly word: string;
  readonly basePoints: number;
  readonly shared: boolean;
  readonly uniqueBonusPoints: 0 | 1 | 2;
  readonly finalPoints: number;
};

const player = (
  id = playerA,
  words: readonly ResultWordFixture[] = [uniqueWord],
) => ({
  playerId: id,
  displayName: id === playerA ? 'Bright Fox' : 'Amber Kite',
  rank: 1,
  baseScore: words.reduce((sum, word) => sum + word.basePoints, 0),
  uniqueBonusScore: words.reduce(
    (sum, word) => sum + word.uniqueBonusPoints,
    0,
  ),
  finalScore: words.reduce((sum, word) => sum + word.finalPoints, 0),
  words,
});

describe('public round result contracts', () => {
  it.each([
    [
      {
        word: 'CAT',
        basePoints: 3,
        shared: false,
        uniqueBonusPoints: 1,
        finalPoints: 4,
      },
    ],
    [
      {
        word: 'TOOL',
        basePoints: 4,
        shared: false,
        uniqueBonusPoints: 1,
        finalPoints: 5,
      },
    ],
    [uniqueWord],
    [
      {
        word: 'ELEPHANTS',
        basePoints: 9,
        shared: false,
        uniqueBonusPoints: 2,
        finalPoints: 11,
      },
    ],
    [sharedWord],
  ])('accepts exact integer word values', (word) => {
    expect(roundResultWordSchema.safeParse(word).success).toBe(true);
  });

  it.each([
    [{ ...uniqueWord, basePoints: 4 }],
    [{ ...uniqueWord, uniqueBonusPoints: 1 }],
    [{ ...uniqueWord, finalPoints: 6 }],
    [{ ...sharedWord, uniqueBonusPoints: 1 }],
    [{ ...sharedWord, finalPoints: 5 }],
    [{ ...uniqueWord, basePoints: 5.5 }],
    [{ ...uniqueWord, uniqueBonusPoints: 1.5 }],
    [{ ...uniqueWord, finalPoints: 7.5 }],
  ])('rejects wrong or decimal word values', (word) => {
    expect(roundResultWordSchema.safeParse(word).success).toBe(false);
  });

  it('rejects decimal, negative-zero, and incorrect player totals', () => {
    const valid = player();
    expect(roundPlayerResultSchema.safeParse(valid).success).toBe(true);
    for (const invalid of [
      { ...valid, baseScore: 5.5 },
      { ...valid, uniqueBonusScore: 1.5 },
      { ...valid, finalScore: 7.5 },
      { ...valid, finalScore: 6 },
      { ...valid, baseScore: JSON.parse('-0') },
    ]) {
      expect(roundPlayerResultSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('derives score maxima from permitted length and word count', () => {
    const words = Array.from({ length: 256 }, (_, index) => ({
      word: `${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}${'A'.repeat(62)}`,
      basePoints: 64,
      shared: false,
      uniqueBonusPoints: 2,
      finalPoints: 66,
    }));
    expect(
      roundPlayerResultSchema.safeParse({
        ...player(),
        baseScore: 16_384,
        uniqueBonusScore: 512,
        finalScore: 16_896,
        words,
      }).success,
    ).toBe(true);
  });

  it('retains authoritative ranks and tied positive winners', () => {
    const results = {
      players: [
        player(playerA),
        player(playerB, [
          {
            word: 'BEERS',
            basePoints: 5,
            shared: false,
            uniqueBonusPoints: 2,
            finalPoints: 7,
          },
        ]),
      ],
      winnerPlayerIds: [playerA, playerB],
    };
    expect(roundResultsSchema.safeParse(results).success).toBe(true);
    expect(
      roundResultsSchema.safeParse({ ...results, winnerPlayerIds: [playerA] })
        .success,
    ).toBe(false);
  });

  it('accepts only the current scoring mode', () => {
    expect(
      roomSettingsSchema.safeParse({
        gridSize: 4,
        roundDurationSeconds: 30,
        scoringMode: 'length-plus-unique',
      }).success,
    ).toBe(true);
    expect(
      roomSettingsSchema.safeParse({
        gridSize: 4,
        roundDurationSeconds: 30,
        scoringMode: 'traditional',
      }).success,
    ).toBe(false);
  });

  it.each([
    [
      {
        word: 'CAT',
        basePoints: 3,
        shared: true,
        uniqueBonusPoints: 0,
        finalPoints: 3,
      },
    ],
    [
      {
        word: 'TOOL',
        basePoints: 4,
        shared: true,
        uniqueBonusPoints: 0,
        finalPoints: 4,
      },
    ],
    [
      {
        word: 'EAGLES',
        basePoints: 6,
        shared: true,
        uniqueBonusPoints: 0,
        finalPoints: 6,
      },
    ],
  ])('accepts shared integer results without a bonus', (word) => {
    expect(roundResultWordSchema.safeParse(word).success).toBe(true);
  });
});
