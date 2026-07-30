import { describe, expect, it } from 'vitest';

import { scoreTraditionalWord } from '../src/index.js';

describe('traditional scoring', () => {
  it.each([
    ['CAT', 1],
    ['WORD', 1],
    ['FIVES', 2],
    ['SIXLET', 3],
    ['SEVENUP', 5],
    ['EIGHTERS', 11],
    ['A'.repeat(64), 11],
  ] as const)('scores %s as %s points', (word, points) => {
    expect(scoreTraditionalWord(word)).toEqual({
      valid: true,
      word,
      points,
    });
  });

  it('counts every canonical letter in a QU word', () => {
    expect(scoreTraditionalWord('QUIZ')).toEqual({
      valid: true,
      word: 'QUIZ',
      points: 1,
    });
  });

  it('returns a safe structured failure for a two-letter word', () => {
    expect(scoreTraditionalWord('AT')).toEqual({
      valid: false,
      code: 'WORD_TOO_SHORT',
    });
  });

  it.each(['', "CAN'T", 'TWO WORDS', 42, null])(
    'returns a safe structured failure for malformed input %j',
    (candidate) => {
      expect(scoreTraditionalWord(candidate)).toEqual({
        valid: false,
        code: 'INVALID_WORD_FORMAT',
      });
    },
  );
});
