import { describe, expect, it } from 'vitest';

import {
  EngineConfigurationError,
  MAX_CANDIDATE_WORD_LENGTH,
  createWordDictionary,
  normalizeWord,
  validateWordPath,
  type WordDictionary,
} from '../src/index.js';
import { createBoardFixture } from './fixtures.js';

function dictionary(entries: readonly string[]): WordDictionary {
  const result = createWordDictionary(entries);
  if (!result.success) {
    throw new Error('Invalid test dictionary.');
  }
  return result.dictionary;
}

const board = createBoardFixture(4, {
  0: 'C',
  1: 'A',
  2: 'T',
  4: 'D',
  5: 'O',
  6: 'G',
});
const testDictionary = dictionary(['CAT', 'DOG', 'QUIZ']);

describe('word normalization', () => {
  it.each([
    ['cat', 'CAT'],
    ['CaT', 'CAT'],
    ['  quiz  ', 'QUIZ'],
  ])('normalizes %j to %s', (candidate, expected) => {
    expect(normalizeWord(candidate)).toEqual({
      valid: true,
      word: expected,
    });
  });

  it.each(['', ' ', '\n\t'])('rejects empty input %j', (candidate) => {
    expect(normalizeWord(candidate)).toEqual({
      valid: false,
      code: 'EMPTY_WORD',
    });
  });

  it.each([
    ['CAT!', 'punctuation'],
    ["CAN'T", 'apostrophe'],
    ['MOTHER-IN-LAW', 'hyphen'],
    ['TWO WORDS', 'internal space'],
    ['WORD2', 'digit'],
    ['CA\u0000T', 'control character'],
    ['CA\u200bT', 'formatting character'],
    ['CAFÉ', 'accented character'],
    ['STRAßE', 'Unicode case-expanding character'],
  ])('rejects %j containing %s', (candidate) => {
    expect(normalizeWord(candidate)).toEqual({
      valid: false,
      code: 'INVALID_WORD_FORMAT',
    });
  });

  it('rejects an overlong candidate before applying dictionary policy', () => {
    expect(normalizeWord('A'.repeat(MAX_CANDIDATE_WORD_LENGTH + 1))).toEqual({
      valid: false,
      code: 'WORD_TOO_LONG',
    });
  });

  it('rejects non-string candidate data', () => {
    expect(normalizeWord(123)).toEqual({
      valid: false,
      code: 'INVALID_WORD_FORMAT',
    });
  });
});

describe('word and path validation', () => {
  it('accepts an exact normalized path word found in the dictionary', () => {
    expect(
      validateWordPath({
        board,
        path: [0, 1, 2],
        submittedWord: ' cat ',
        dictionary: testDictionary,
      }),
    ).toEqual({
      valid: true,
      word: 'CAT',
      path: [0, 1, 2],
    });
  });

  it('enforces the configurable minimum normalized letter length', () => {
    expect(
      validateWordPath({
        board,
        path: [0, 1, 2],
        submittedWord: 'CAT',
        dictionary: testDictionary,
        minimumLength: 4,
      }),
    ).toEqual({
      valid: false,
      code: 'WORD_TOO_SHORT',
    });
  });

  it('rejects a path-word mismatch before dictionary lookup', () => {
    let dictionaryWasCalled = false;
    expect(
      validateWordPath({
        board,
        path: [0, 1, 2],
        submittedWord: 'DOG',
        dictionary: {
          has() {
            dictionaryWasCalled = true;
            return true;
          },
        },
      }),
    ).toEqual({
      valid: false,
      code: 'PATH_WORD_MISMATCH',
    });
    expect(dictionaryWasCalled).toBe(false);
  });

  it('rejects a word absent from the injected dictionary', () => {
    expect(
      validateWordPath({
        board,
        path: [0, 1, 2],
        submittedWord: 'CAT',
        dictionary: dictionary(['DOG']),
      }),
    ).toEqual({
      valid: false,
      code: 'WORD_NOT_IN_DICTIONARY',
    });
  });

  it('reports path failure details as candidate-safe structured data', () => {
    expect(
      validateWordPath({
        board,
        path: [0, 2],
        submittedWord: 'CAT',
        dictionary: testDictionary,
      }),
    ).toEqual({
      valid: false,
      code: 'INVALID_PATH',
      pathCode: 'NON_ADJACENT',
      pathPosition: 1,
      tileIndex: 2,
    });
  });

  it('reports malformed board data before all other candidate data', () => {
    expect(
      validateWordPath({
        board: { size: 4, tiles: [] } as unknown as typeof board,
        path: [],
        submittedWord: '',
        dictionary: testDictionary,
        minimumLength: 0,
      }),
    ).toEqual({
      valid: false,
      code: 'INVALID_BOARD',
    });
  });

  it('reports malformed submitted words before path validation', () => {
    expect(
      validateWordPath({
        board,
        path: [],
        submittedWord: "CAN'T",
        dictionary: testDictionary,
      }),
    ).toEqual({
      valid: false,
      code: 'INVALID_WORD_FORMAT',
      normalizationCode: 'INVALID_WORD_FORMAT',
    });
  });

  it('supports QU while distinguishing tiles from normalized letter count', () => {
    const quBoard = createBoardFixture(4, { 0: 'QU', 1: 'I', 2: 'Z' });

    expect(
      validateWordPath({
        board: quBoard,
        path: [0, 1, 2],
        submittedWord: 'quiz',
        dictionary: testDictionary,
        minimumLength: 4,
      }),
    ).toEqual({
      valid: true,
      word: 'QUIZ',
      path: [0, 1, 2],
    });
  });

  it.each([0, -1, 1.5, MAX_CANDIDATE_WORD_LENGTH + 1])(
    'rejects programmer-configured minimum length %s',
    (minimumLength) => {
      expect(() =>
        validateWordPath({
          board,
          path: [0, 1, 2],
          submittedWord: 'CAT',
          dictionary: testDictionary,
          minimumLength,
        }),
      ).toThrowError(EngineConfigurationError);
    },
  );
});
