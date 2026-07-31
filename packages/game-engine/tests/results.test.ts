import { describe, expect, it } from 'vitest';

import {
  MAX_RECONCILIATION_WORDS_PER_PARTICIPANT,
  reconcileRoundWords,
  type ReconciliationParticipant,
} from '../src/index.js';

const participant = (
  playerId: string,
  acceptedWords: ReconciliationParticipant['acceptedWords'] = [],
): ReconciliationParticipant => ({ playerId, acceptedWords });

describe('round word reconciliation', () => {
  it('requires one to eight participants and safely contains malformed input', () => {
    expect(reconcileRoundWords([])).toMatchObject({
      success: false,
      code: 'NO_PARTICIPANTS',
    });
    expect(
      reconcileRoundWords(
        Array.from({ length: 9 }, (_, index) => participant(`player-${index}`)),
      ),
    ).toMatchObject({ success: false, code: 'TOO_MANY_PARTICIPANTS' });
    expect(
      reconcileRoundWords([
        participant('player-a', [{ word: 'CAT', points: 2 }]),
      ]),
    ).toMatchObject({
      success: false,
      code: 'INCORRECT_BASE_POINTS',
    });
  });

  it('uses normalized word length as the base value and fixed integer bonuses', () => {
    expect(
      reconcileRoundWords([
        participant('player-a', [
          { word: 'CAT', points: 3 },
          { word: 'TOOL', points: 4 },
          { word: 'STONE', points: 5 },
          { word: 'ELEPHANTS', points: 9 },
        ]),
      ]),
    ).toEqual({
      success: true,
      participants: [
        {
          playerId: 'player-a',
          baseScore: 21,
          uniqueBonusScore: 6,
          finalScore: 27,
          words: [
            {
              word: 'CAT',
              basePoints: 3,
              shared: false,
              uniqueBonusPoints: 1,
              finalPoints: 4,
            },
            {
              word: 'TOOL',
              basePoints: 4,
              shared: false,
              uniqueBonusPoints: 1,
              finalPoints: 5,
            },
            {
              word: 'STONE',
              basePoints: 5,
              shared: false,
              uniqueBonusPoints: 2,
              finalPoints: 7,
            },
            {
              word: 'ELEPHANTS',
              basePoints: 9,
              shared: false,
              uniqueBonusPoints: 2,
              finalPoints: 11,
            },
          ],
        },
      ],
    });
  });

  it('gives shared words no bonus and retains mixed integer totals', () => {
    const result = reconcileRoundWords([
      participant('player-a', [
        { word: 'TOOL', points: 4 },
        { word: 'STONE', points: 5 },
      ]),
      participant('player-b', [
        { word: 'TOOL', points: 4 },
        { word: 'EAGLES', points: 6 },
      ]),
    ]);
    expect(result).toMatchObject({
      success: true,
      participants: [
        {
          playerId: 'player-a',
          baseScore: 9,
          uniqueBonusScore: 2,
          finalScore: 11,
        },
        {
          playerId: 'player-b',
          baseScore: 10,
          uniqueBonusScore: 2,
          finalScore: 12,
        },
      ],
    });
    if (result.success) {
      expect(result.participants[0]?.words[0]).toMatchObject({
        shared: true,
        uniqueBonusPoints: 0,
        finalPoints: 4,
      });
    }
  });

  it('preserves duplicate, malformed, and bounded-word protections', () => {
    expect(
      reconcileRoundWords([
        participant('player-a', [
          { word: 'CAT', points: 3 },
          { word: 'CAT', points: 3 },
        ]),
      ]),
    ).toMatchObject({ success: false, code: 'DUPLICATE_WORD' });
    expect(
      reconcileRoundWords([
        participant('player-a', [{ word: 'cat', points: 3 }]),
      ]),
    ).toMatchObject({ success: false, code: 'INVALID_WORD' });
    const words = Array.from(
      { length: MAX_RECONCILIATION_WORDS_PER_PARTICIPANT + 1 },
      () => ({ word: 'CAT', points: 3 }),
    );
    expect(reconcileRoundWords([participant('player-a', words)])).toMatchObject(
      { success: false, code: 'TOO_MANY_WORDS' },
    );
  });

  it('returns detached frozen output', () => {
    const result = reconcileRoundWords([
      participant('player-a', [{ word: 'QUIZ', points: 4 }]),
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.participants[0]).toMatchObject({
        baseScore: 4,
        uniqueBonusScore: 1,
        finalScore: 5,
      });
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.participants)).toBe(true);
      expect(Object.isFrozen(result.participants[0]?.words)).toBe(true);
    }
  });

  it.each([
    ['CAT', 3, 1, 4],
    ['DOG', 3, 1, 4],
    ['TOOL', 4, 1, 5],
    ['QUIZ', 4, 1, 5],
    ['STONE', 5, 2, 7],
    ['BEERS', 5, 2, 7],
    ['EAGLES', 6, 2, 8],
    ['SEASONS', 7, 2, 9],
    ['EIGHTERS', 8, 2, 10],
    ['ELEPHANTS', 9, 2, 11],
    ['ABCDEFGHIJ', 10, 2, 12],
    ['A'.repeat(64), 64, 2, 66],
  ] as const)(
    'reconciles unique %s with integer base %i, bonus %i, and final %i',
    (word, basePoints, uniqueBonusPoints, finalPoints) => {
      const result = reconcileRoundWords([
        participant('player-a', [{ word, points: basePoints }]),
      ]);
      expect(result).toMatchObject({
        success: true,
        participants: [
          {
            baseScore: basePoints,
            uniqueBonusScore: uniqueBonusPoints,
            finalScore: finalPoints,
          },
        ],
      });
    },
  );
});
