import { normalizeWord } from './word-normalization.js';

export type TraditionalPoints = 1 | 2 | 3 | 5 | 11;

export type TraditionalScoringResult =
  | {
      readonly valid: true;
      readonly word: string;
      readonly points: TraditionalPoints;
    }
  | {
      readonly valid: false;
      readonly code: 'INVALID_WORD_FORMAT' | 'WORD_TOO_SHORT';
    };

export function scoreTraditionalWord(
  candidate: unknown,
): TraditionalScoringResult {
  const normalized = normalizeWord(candidate);
  if (!normalized.valid) {
    return { valid: false, code: 'INVALID_WORD_FORMAT' };
  }

  const length = normalized.word.length;
  if (length < 3) {
    return { valid: false, code: 'WORD_TOO_SHORT' };
  }

  const points =
    length <= 4
      ? 1
      : length === 5
        ? 2
        : length === 6
          ? 3
          : length === 7
            ? 5
            : 11;

  return {
    valid: true,
    word: normalized.word,
    points,
  };
}
