import {
  normalizeWord,
  type WordNormalizationErrorCode,
} from './word-normalization.js';

export interface WordDictionary {
  has(normalizedWord: string): boolean;
}

export type DictionaryBuildResult =
  | {
      readonly success: true;
      readonly dictionary: WordDictionary;
      readonly wordCount: number;
    }
  | {
      readonly success: false;
      readonly code: 'INVALID_DICTIONARY_ENTRY';
      readonly entryIndex: number;
      readonly normalizationCode: WordNormalizationErrorCode;
    };

export function createWordDictionary(
  entries: readonly string[],
): DictionaryBuildResult {
  const words = new Set<string>();

  for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    const normalized = normalizeWord(entries[entryIndex]);
    if (!normalized.valid) {
      return {
        success: false,
        code: 'INVALID_DICTIONARY_ENTRY',
        entryIndex,
        normalizationCode: normalized.code,
      };
    }
    words.add(normalized.word);
  }

  const dictionary: WordDictionary = Object.freeze({
    has(normalizedWord: string): boolean {
      return words.has(normalizedWord);
    },
  });

  return {
    success: true,
    dictionary,
    wordCount: words.size,
  };
}
