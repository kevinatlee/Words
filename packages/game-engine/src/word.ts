import { validateBoard, type Board, type TilePath } from './board.js';
import type { WordDictionary } from './dictionary.js';
import { EngineConfigurationError } from './errors.js';
import {
  validatePath,
  type PathErrorCode,
  type PathValidationResult,
} from './path.js';
import {
  MAX_CANDIDATE_WORD_LENGTH,
  normalizeWord,
  type WordNormalizationErrorCode,
} from './word-normalization.js';

export const DEFAULT_MINIMUM_WORD_LENGTH = 3;

export interface ValidateWordPathOptions {
  readonly board: Board;
  readonly path: TilePath;
  readonly submittedWord: unknown;
  readonly dictionary: WordDictionary;
  readonly minimumLength?: number;
}

export type WordValidationErrorCode =
  | 'INVALID_BOARD'
  | 'INVALID_PATH'
  | 'INVALID_WORD_FORMAT'
  | 'PATH_WORD_MISMATCH'
  | 'WORD_NOT_IN_DICTIONARY'
  | 'WORD_TOO_SHORT';

export type WordValidationResult =
  | {
      readonly valid: true;
      readonly word: string;
      readonly path: TilePath;
    }
  | {
      readonly valid: false;
      readonly code: WordValidationErrorCode;
      readonly normalizationCode?: WordNormalizationErrorCode;
      readonly pathCode?: PathErrorCode;
      readonly pathPosition?: number;
      readonly tileIndex?: number;
    };

export function validateWordPath(
  options: ValidateWordPathOptions,
): WordValidationResult {
  const boardResult = validateBoard(options.board);
  if (!boardResult.valid) {
    return { valid: false, code: 'INVALID_BOARD' };
  }

  const normalized = normalizeWord(options.submittedWord);
  if (!normalized.valid) {
    return {
      valid: false,
      code: 'INVALID_WORD_FORMAT',
      normalizationCode: normalized.code,
    };
  }

  const minimumLength = options.minimumLength ?? DEFAULT_MINIMUM_WORD_LENGTH;
  validateMinimumLength(minimumLength);

  if (normalized.word.length < minimumLength) {
    return { valid: false, code: 'WORD_TOO_SHORT' };
  }

  const pathResult = validatePath(boardResult.board, options.path);
  if (!pathResult.valid) {
    return pathFailure(pathResult);
  }

  if (pathResult.word !== normalized.word) {
    return { valid: false, code: 'PATH_WORD_MISMATCH' };
  }

  if (!options.dictionary.has(normalized.word)) {
    return { valid: false, code: 'WORD_NOT_IN_DICTIONARY' };
  }

  return {
    valid: true,
    word: normalized.word,
    path: pathResult.path,
  };
}

function validateMinimumLength(minimumLength: number): void {
  if (
    !Number.isInteger(minimumLength) ||
    minimumLength <= 0 ||
    minimumLength > MAX_CANDIDATE_WORD_LENGTH
  ) {
    throw new EngineConfigurationError(
      'INVALID_MINIMUM_LENGTH',
      `minimumLength must be an integer from 1 to ${MAX_CANDIDATE_WORD_LENGTH}.`,
    );
  }
}

function pathFailure(
  pathResult: Extract<PathValidationResult, { valid: false }>,
): WordValidationResult {
  const result: {
    code: 'INVALID_PATH';
    pathCode: PathErrorCode;
    pathPosition?: number;
    tileIndex?: number;
    valid: false;
  } = {
    valid: false,
    code: 'INVALID_PATH',
    pathCode: pathResult.code,
  };

  if (pathResult.pathPosition !== undefined) {
    result.pathPosition = pathResult.pathPosition;
  }
  if (pathResult.tileIndex !== undefined) {
    result.tileIndex = pathResult.tileIndex;
  }

  return result;
}
