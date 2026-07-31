import { normalizeWord } from './word-normalization.js';

export type WordPoints = number;

export type WordScoringResult =
  | {
      readonly valid: true;
      readonly word: string;
      readonly points: WordPoints;
    }
  | {
      readonly valid: false;
      readonly code: 'INVALID_WORD_FORMAT' | 'WORD_TOO_SHORT';
    };

export function scoreWordByLength(candidate: unknown): WordScoringResult {
  const normalized = normalizeWord(candidate);
  if (!normalized.valid) {
    return { valid: false, code: 'INVALID_WORD_FORMAT' };
  }

  const length = normalized.word.length;
  if (length < 3) {
    return { valid: false, code: 'WORD_TOO_SHORT' };
  }

  return {
    valid: true,
    word: normalized.word,
    points: length,
  };
}
