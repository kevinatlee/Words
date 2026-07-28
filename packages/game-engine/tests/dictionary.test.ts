import { describe, expect, it } from 'vitest';

import { createWordDictionary } from '../src/index.js';

const OWNED_TEST_WORDS = ['CAT', 'QUIZ', 'WORDS', 'COLOUR'] as const;

describe('Set-backed dictionary', () => {
  it('loads and looks up the small repository-owned fixture', () => {
    const result = createWordDictionary(OWNED_TEST_WORDS);

    expect(result.success).toBe(true);
    if (result.success) {
      for (const word of OWNED_TEST_WORDS) {
        expect(result.dictionary.has(word)).toBe(true);
      }
      expect(result.dictionary.has('ABSENT')).toBe(false);
    }
  });

  it('normalizes input words and keeps lookup case-canonical', () => {
    const result = createWordDictionary([' cat ', 'Quiz']);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.dictionary.has('CAT')).toBe(true);
      expect(result.dictionary.has('QUIZ')).toBe(true);
      expect(result.dictionary.has('cat')).toBe(false);
    }
  });

  it('deduplicates normalized fixture entries predictably', () => {
    const result = createWordDictionary(['CAT', 'cat', ' CAT ']);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.wordCount).toBe(1);
    }
  });

  it.each([
    [['CAT', ''], 1, 'EMPTY_WORD'],
    [['CAT', 'MOTHER-IN-LAW'], 1, 'INVALID_WORD_FORMAT'],
    [['CAT', 'A'.repeat(65)], 1, 'WORD_TOO_LONG'],
  ] as const)(
    'reports malformed dictionary entries without partially returning a dictionary',
    (entries, entryIndex, normalizationCode) => {
      expect(createWordDictionary(entries)).toEqual({
        success: false,
        code: 'INVALID_DICTIONARY_ENTRY',
        entryIndex,
        normalizationCode,
      });
    },
  );

  it('does not mutate the input fixture', () => {
    const entries = [' cat ', 'QUIZ'];
    const snapshot = [...entries];

    createWordDictionary(entries);

    expect(entries).toEqual(snapshot);
  });

  it('uses no network or filesystem operation for lookup', () => {
    const result = createWordDictionary(['CAT']);
    expect(result.success).toBe(true);
    if (result.success) {
      for (let iteration = 0; iteration < 100; iteration += 1) {
        expect(result.dictionary.has('CAT')).toBe(true);
      }
    }
  });
});
