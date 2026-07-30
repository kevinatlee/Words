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
  it('requires at least one bounded participant', () => {
    expect(reconcileRoundWords([])).toEqual({
      success: false,
      code: 'NO_PARTICIPANTS',
    });
    expect(
      reconcileRoundWords(
        Array.from({ length: 9 }, (_, index) => participant(`player-${index}`)),
      ),
    ).toEqual({
      success: false,
      code: 'TOO_MANY_PARTICIPANTS',
    });
  });

  it('preserves a participant with no words and no score', () => {
    expect(reconcileRoundWords([participant('player-a')])).toEqual({
      success: true,
      participants: [
        {
          playerId: 'player-a',
          baseScore: 0,
          uniqueBonusScore: 0,
          finalScore: 0,
          words: [],
        },
      ],
    });
  });

  it('awards exact quarter-point bonuses for every traditional base value', () => {
    expect(
      reconcileRoundWords([
        participant('player-a', [
          { word: 'TOOL', points: 1 },
          { word: 'STONE', points: 2 },
          { word: 'EAGLES', points: 3 },
          { word: 'SEASONS', points: 5 },
          { word: 'ELEPHANTS', points: 11 },
        ]),
      ]),
    ).toEqual({
      success: true,
      participants: [
        {
          playerId: 'player-a',
          baseScore: 22,
          uniqueBonusScore: 5.5,
          finalScore: 27.5,
          words: [
            {
              word: 'TOOL',
              basePoints: 1,
              shared: false,
              uniqueBonusPoints: 0.25,
              finalPoints: 1.25,
            },
            {
              word: 'STONE',
              basePoints: 2,
              shared: false,
              uniqueBonusPoints: 0.5,
              finalPoints: 2.5,
            },
            {
              word: 'EAGLES',
              basePoints: 3,
              shared: false,
              uniqueBonusPoints: 0.75,
              finalPoints: 3.75,
            },
            {
              word: 'SEASONS',
              basePoints: 5,
              shared: false,
              uniqueBonusPoints: 1.25,
              finalPoints: 6.25,
            },
            {
              word: 'ELEPHANTS',
              basePoints: 11,
              shared: false,
              uniqueBonusPoints: 2.75,
              finalPoints: 13.75,
            },
          ],
        },
      ],
    });
  });

  it('preserves participant and accepted-word order', () => {
    const result = reconcileRoundWords([
      participant('player-b', [{ word: 'EAGLES', points: 3 }]),
      participant('player-a', [
        { word: 'TOOL', points: 1 },
        { word: 'STONE', points: 2 },
      ]),
    ]);

    expect(
      result.success && result.participants.map((entry) => entry.playerId),
    ).toEqual(['player-b', 'player-a']);
    expect(
      result.success && result.participants[1]?.words.map((word) => word.word),
    ).toEqual(['TOOL', 'STONE']);
  });

  it('retains base points without a bonus for a word shared by two or three players', () => {
    const result = reconcileRoundWords([
      participant('player-a', [{ word: 'TOOL', points: 1 }]),
      participant('player-b', [
        { word: 'BEER', points: 1 },
        { word: 'TOOL', points: 1 },
      ]),
      participant('player-c', [{ word: 'TOOL', points: 1 }]),
    ]);

    expect(result).toMatchObject({
      success: true,
      participants: [
        {
          playerId: 'player-a',
          baseScore: 1,
          uniqueBonusScore: 0,
          finalScore: 1,
          words: [
            {
              word: 'TOOL',
              basePoints: 1,
              shared: true,
              uniqueBonusPoints: 0,
              finalPoints: 1,
            },
          ],
        },
        {
          playerId: 'player-b',
          baseScore: 2,
          uniqueBonusScore: 0.25,
          finalScore: 2.25,
          words: [
            {
              word: 'BEER',
              shared: false,
              uniqueBonusPoints: 0.25,
              finalPoints: 1.25,
            },
            {
              word: 'TOOL',
              shared: true,
              uniqueBonusPoints: 0,
              finalPoints: 1,
            },
          ],
        },
        {
          playerId: 'player-c',
          baseScore: 1,
          uniqueBonusScore: 0,
          finalScore: 1,
          words: [{ word: 'TOOL', shared: true, finalPoints: 1 }],
        },
      ],
    });
  });

  it('counts several shared words by distinct participant ID', () => {
    const result = reconcileRoundWords([
      participant('player-a', [
        { word: 'TOOL', points: 1 },
        { word: 'BEER', points: 1 },
      ]),
      participant('player-b', [{ word: 'TOOL', points: 1 }]),
      participant('player-c', [{ word: 'BEER', points: 1 }]),
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.participants[0]).toMatchObject({
        baseScore: 2,
        uniqueBonusScore: 0,
        finalScore: 2,
      });
      expect(
        result.participants.every((entry) =>
          entry.words.every((word) => word.shared),
        ),
      ).toBe(true);
    }
  });

  it.each([
    [[participant('player-a'), participant('player-a')], 'DUPLICATE_PLAYER_ID'],
    [
      [
        participant('player-a', [
          { word: 'TOOL', points: 1 },
          { word: 'TOOL', points: 1 },
        ]),
      ],
      'DUPLICATE_WORD',
    ],
    [[participant('player-a', [{ word: 'tool', points: 1 }])], 'INVALID_WORD'],
    [[participant('player-a', [{ word: 'CAFÉ', points: 1 }])], 'INVALID_WORD'],
    [
      [participant('player-a', [{ word: 'STONE', points: 1 }])],
      'INCORRECT_BASE_POINTS',
    ],
  ] as const)('rejects malformed stored input with %s', (input, code) => {
    expect(reconcileRoundWords(input)).toMatchObject({
      success: false,
      code,
    });
  });

  it('accepts the maximum bounded word input deterministically', () => {
    const acceptedWords = Array.from(
      { length: MAX_RECONCILIATION_WORDS_PER_PARTICIPANT },
      (_, index) => ({
        word: `${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}A`,
        points: 1 as const,
      }),
    );
    const input = Array.from({ length: 8 }, (_, index) =>
      participant(`player-${index}`, acceptedWords),
    );
    const first = reconcileRoundWords(input);
    const second = reconcileRoundWords(input);

    expect(first).toEqual(second);
    expect(first.success && first.participants).toHaveLength(8);
    expect(first.success && first.participants[0]?.words).toHaveLength(
      MAX_RECONCILIATION_WORDS_PER_PARTICIPANT,
    );
    expect(first.success && first.participants[0]).toMatchObject({
      baseScore: 256,
      uniqueBonusScore: 0,
      finalScore: 256,
    });
  });

  it('returns detached deeply frozen output', () => {
    const acceptedWords = [{ word: 'TOOL', points: 1 as const }];
    const input = [participant('player-a', acceptedWords)];
    const result = reconcileRoundWords(input);
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    acceptedWords[0] = { word: 'BEER', points: 1 };
    expect(result.participants[0]?.words[0]?.word).toBe('TOOL');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.participants)).toBe(true);
    expect(Object.isFrozen(result.participants[0]?.words)).toBe(true);
    expect(Object.isFrozen(result.participants[0]?.words[0])).toBe(true);
  });
});
