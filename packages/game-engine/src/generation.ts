import {
  freezeBoard,
  isBoardSize,
  normalizeConfiguredTileToken,
  type Board,
  type BoardSize,
  type TileToken,
} from './board.js';
import { EngineConfigurationError } from './errors.js';

export const MAX_GENERATION_ATTEMPTS = 1_000;

export interface RandomSource {
  next(): number;
}

export interface WeightedTile {
  readonly token: TileToken;
  readonly weight: number;
}

export interface GenerateBoardOptions {
  readonly size: BoardSize;
  readonly distribution: readonly WeightedTile[];
  readonly random: RandomSource;
  readonly acceptBoard?: (board: Board) => boolean;
  readonly maxAttempts?: number;
}

export type BoardGenerationResult =
  | {
      readonly success: true;
      readonly board: Board;
      readonly attempts: number;
    }
  | {
      readonly success: false;
      readonly code: 'NO_ACCEPTABLE_BOARD';
      readonly attempts: number;
    };

interface PreparedWeightedTile {
  readonly token: TileToken;
  readonly upperBoundary: number;
}

export function generateBoard(
  options: GenerateBoardOptions,
): BoardGenerationResult {
  if (!isBoardSize(options.size)) {
    throw new EngineConfigurationError(
      'INVALID_BOARD_SIZE',
      'Board size must be 4, 5, or 6.',
    );
  }

  if (
    typeof options.random !== 'object' ||
    options.random === null ||
    typeof options.random.next !== 'function'
  ) {
    throw new EngineConfigurationError(
      'INVALID_RANDOM_SOURCE',
      'A random source with a next() method is required.',
    );
  }

  if (
    options.acceptBoard !== undefined &&
    typeof options.acceptBoard !== 'function'
  ) {
    throw new EngineConfigurationError(
      'INVALID_ACCEPTANCE_PREDICATE',
      'The board acceptance predicate must be a function.',
    );
  }

  const maxAttempts = options.maxAttempts ?? 1;
  if (
    !Number.isInteger(maxAttempts) ||
    maxAttempts <= 0 ||
    maxAttempts > MAX_GENERATION_ATTEMPTS
  ) {
    throw new EngineConfigurationError(
      'INVALID_MAX_ATTEMPTS',
      `maxAttempts must be an integer from 1 to ${MAX_GENERATION_ATTEMPTS}.`,
    );
  }

  const preparedDistribution = prepareDistribution(options.distribution);
  const totalWeight =
    preparedDistribution[preparedDistribution.length - 1]?.upperBoundary ?? 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const tiles: TileToken[] = [];
    for (let index = 0; index < options.size * options.size; index += 1) {
      const randomValue = options.random.next();
      validateRandomValue(randomValue);
      tiles.push(
        selectWeightedTile(preparedDistribution, totalWeight, randomValue),
      );
    }

    const board = freezeBoard(options.size, tiles);
    if (options.acceptBoard === undefined || options.acceptBoard(board)) {
      return { success: true, board, attempts: attempt };
    }
  }

  return {
    success: false,
    code: 'NO_ACCEPTABLE_BOARD',
    attempts: maxAttempts,
  };
}

function prepareDistribution(
  distribution: readonly WeightedTile[],
): readonly PreparedWeightedTile[] {
  if (!Array.isArray(distribution) || distribution.length === 0) {
    throw new EngineConfigurationError(
      'EMPTY_DISTRIBUTION',
      'The tile distribution must contain at least one entry.',
    );
  }

  const seenTokens = new Set<TileToken>();
  const prepared: PreparedWeightedTile[] = [];
  let totalWeight = 0;

  for (const entry of distribution) {
    if (typeof entry !== 'object' || entry === null) {
      throw new EngineConfigurationError(
        'INVALID_TILE_TOKEN',
        'Every distribution entry must contain a valid tile token.',
      );
    }

    const token = normalizeConfiguredTileToken(entry.token);
    if (token === null) {
      throw new EngineConfigurationError(
        'INVALID_TILE_TOKEN',
        'Distribution tile tokens must contain one to four ASCII letters.',
      );
    }

    if (seenTokens.has(token)) {
      throw new EngineConfigurationError(
        'DUPLICATE_TILE_TOKEN',
        `Distribution tile token ${token} appears more than once.`,
      );
    }

    if (!Number.isFinite(entry.weight) || entry.weight <= 0) {
      throw new EngineConfigurationError(
        'INVALID_WEIGHT',
        'Distribution weights must be finite numbers greater than zero.',
      );
    }

    const previousTotalWeight = totalWeight;
    totalWeight += entry.weight;
    if (!Number.isFinite(totalWeight) || totalWeight <= previousTotalWeight) {
      throw new EngineConfigurationError(
        'INVALID_TOTAL_WEIGHT',
        'Every distribution weight must increase the finite cumulative total.',
      );
    }

    seenTokens.add(token);
    prepared.push(Object.freeze({ token, upperBoundary: totalWeight }));
  }

  return Object.freeze(prepared);
}

function validateRandomValue(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new EngineConfigurationError(
      'INVALID_RANDOM_VALUE',
      'Random values must be finite numbers from 0 (inclusive) to 1 (exclusive).',
    );
  }
}

function selectWeightedTile(
  distribution: readonly PreparedWeightedTile[],
  totalWeight: number,
  randomValue: number,
): TileToken {
  const target = randomValue * totalWeight;
  for (let index = 0; index < distribution.length - 1; index += 1) {
    const entry = distribution[index];
    if (entry === undefined) {
      break;
    }
    if (target < entry.upperBoundary) {
      return entry.token;
    }
  }

  const finalEntry = distribution.at(-1);
  if (finalEntry !== undefined) {
    return finalEntry.token;
  }

  throw new EngineConfigurationError(
    'INVALID_TOTAL_WEIGHT',
    'The weighted distribution could not select a tile.',
  );
}
