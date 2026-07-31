import { describe, expect, it } from 'vitest';

import { scoreWordByLength } from '../src/index.js';

describe('word-length scoring', () => {
  it.each([
    ['CAT', 3],
    ['WORD', 4],
    ['FIVES', 5],
    ['SIXLET', 6],
    ['SEVENUP', 7],
    ['EIGHTERS', 8],
    ['A'.repeat(64), 64],
  ] as const)('scores %s as %s points', (word, points) => {
    expect(scoreWordByLength(word)).toEqual({
      valid: true,
      word,
      points,
    });
  });

  it('counts every canonical letter in a QU word', () => {
    expect(scoreWordByLength('QUIZ')).toEqual({
      valid: true,
      word: 'QUIZ',
      points: 4,
    });
  });

  it.each([
    [' cat ', 'CAT', 3],
    ['quiz', 'QUIZ', 4],
  ] as const)('normalizes %j before scoring', (candidate, word, points) => {
    expect(scoreWordByLength(candidate)).toEqual({
      valid: true,
      word,
      points,
    });
  });

  it('returns a safe structured failure for a two-letter word', () => {
    expect(scoreWordByLength('AT')).toEqual({
      valid: false,
      code: 'WORD_TOO_SHORT',
    });
  });

  it.each(['', '   ', "CAN'T", 'TWO WORDS', 'CAFÉ', 'A'.repeat(65), 42, null])(
    'returns a safe structured failure for malformed input %j',
    (candidate) => {
      expect(scoreWordByLength(candidate)).toEqual({
        valid: false,
        code: 'INVALID_WORD_FORMAT',
      });
    },
  );
});
