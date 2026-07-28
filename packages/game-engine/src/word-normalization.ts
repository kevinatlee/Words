export const MAX_CANDIDATE_WORD_LENGTH = 64;

export type WordNormalizationErrorCode =
  'EMPTY_WORD' | 'INVALID_WORD_FORMAT' | 'WORD_TOO_LONG';

export type WordNormalizationResult =
  | {
      readonly valid: true;
      readonly word: string;
    }
  | {
      readonly valid: false;
      readonly code: WordNormalizationErrorCode;
    };

const ASCII_WORD = /^[A-Za-z]+$/u;

export function normalizeWord(candidate: unknown): WordNormalizationResult {
  if (typeof candidate !== 'string') {
    return { valid: false, code: 'INVALID_WORD_FORMAT' };
  }

  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    return { valid: false, code: 'EMPTY_WORD' };
  }

  if (!ASCII_WORD.test(trimmed)) {
    return { valid: false, code: 'INVALID_WORD_FORMAT' };
  }

  const word = trimmed.toUpperCase();
  if (word.length > MAX_CANDIDATE_WORD_LENGTH) {
    return { valid: false, code: 'WORD_TOO_LONG' };
  }

  return { valid: true, word };
}
