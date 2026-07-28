import { describe, expect, it } from 'vitest';

import {
  EngineConfigurationError,
  MAX_GENERATION_ATTEMPTS,
  generateBoard,
  type RandomSource,
  type WeightedTile,
} from '../src/index.js';

function constantRandom(value: number): RandomSource {
  return { next: () => value };
}

function sequenceRandom(values: readonly number[]): RandomSource {
  let index = 0;
  return {
    next(): number {
      const value = values[index];
      if (value === undefined) {
        throw new Error('Test random sequence exhausted.');
      }
      index += 1;
      return value;
    },
  };
}

function expectConfigurationError(
  callback: () => unknown,
  code: EngineConfigurationError['code'],
): void {
  try {
    callback();
    throw new Error('Expected an engine configuration error.');
  } catch (error) {
    expect(error).toBeInstanceOf(EngineConfigurationError);
    expect((error as EngineConfigurationError).code).toBe(code);
  }
}

const equalDistribution: readonly WeightedTile[] = [
  { token: 'A', weight: 1 },
  { token: 'B', weight: 1 },
];
const IMMEDIATELY_BELOW_ONE = 1 - Number.EPSILON / 2;

describe('weighted board generation', () => {
  it('rejects an unsupported generation size', () => {
    expectConfigurationError(
      () =>
        generateBoard({
          size: 3 as unknown as 4,
          distribution: equalDistribution,
          random: constantRandom(0),
        }),
      'INVALID_BOARD_SIZE',
    );
  });

  it.each([
    [4, 16],
    [5, 25],
    [6, 36],
  ] as const)('generates size %d with exactly %d tiles', (size, tileCount) => {
    const result = generateBoard({
      size,
      distribution: equalDistribution,
      random: constantRandom(0),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.board.size).toBe(size);
      expect(result.board.tiles).toHaveLength(tileCount);
    }
  });

  it('produces the same board for the same deterministic sequence', () => {
    const values = Array.from({ length: 16 }, (_, index) =>
      index % 2 === 0 ? 0.1 : 0.9,
    );
    const first = generateBoard({
      size: 4,
      distribution: equalDistribution,
      random: sequenceRandom(values),
    });
    const second = generateBoard({
      size: 4,
      distribution: equalDistribution,
      random: sequenceRandom(values),
    });

    expect(first).toEqual(second);
  });

  it('uses inclusive lower and exclusive upper weighted boundaries', () => {
    const distribution = [
      { token: 'A', weight: 1 },
      { token: 'B', weight: 3 },
    ];
    const values = [0, 0.249_999, 0.25, IMMEDIATELY_BELOW_ONE];
    const sequence = Array.from(
      { length: 16 },
      (_, index) => values[index % 4]!,
    );
    const result = generateBoard({
      size: 4,
      distribution,
      random: sequenceRandom(sequence),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.board.tiles.slice(0, 4)).toEqual(['A', 'A', 'B', 'B']);
    }
  });

  it.each([
    [Number.NaN, 'NaN'],
    [Number.POSITIVE_INFINITY, 'Infinity'],
    [-0.001, 'negative'],
    [1, 'one'],
    [1.001, 'greater than one'],
  ])('rejects a %s random output', (value) => {
    expectConfigurationError(
      () =>
        generateBoard({
          size: 4,
          distribution: equalDistribution,
          random: constantRandom(value),
        }),
      'INVALID_RANDOM_VALUE',
    );
  });

  it('requires an injected random source', () => {
    expectConfigurationError(
      () =>
        generateBoard({
          size: 4,
          distribution: equalDistribution,
          random: undefined as unknown as RandomSource,
        }),
      'INVALID_RANDOM_SOURCE',
    );
  });

  it('rejects an empty distribution', () => {
    expectConfigurationError(
      () =>
        generateBoard({
          size: 4,
          distribution: [],
          random: constantRandom(0),
        }),
      'EMPTY_DISTRIBUTION',
    );
  });

  it('normalizes configured tokens and rejects duplicates afterward', () => {
    expectConfigurationError(
      () =>
        generateBoard({
          size: 4,
          distribution: [
            { token: 'qu', weight: 1 },
            { token: ' QU ', weight: 1 },
          ],
          random: constantRandom(0),
        }),
      'DUPLICATE_TILE_TOKEN',
    );
  });

  it.each([
    [0, 'zero'],
    [-1, 'negative'],
    [Number.NaN, 'NaN'],
    [Number.POSITIVE_INFINITY, 'infinite'],
  ])('rejects a %s weight', (weight) => {
    expectConfigurationError(
      () =>
        generateBoard({
          size: 4,
          distribution: [{ token: 'A', weight }],
          random: constantRandom(0),
        }),
      'INVALID_WEIGHT',
    );
  });

  it('rejects a non-finite total weight', () => {
    expectConfigurationError(
      () =>
        generateBoard({
          size: 4,
          distribution: [
            { token: 'A', weight: Number.MAX_VALUE },
            { token: 'B', weight: Number.MAX_VALUE },
          ],
          random: constantRandom(0),
        }),
      'INVALID_TOTAL_WEIGHT',
    );
  });

  it('rejects a positive weight that cannot advance the cumulative total', () => {
    expectConfigurationError(
      () =>
        generateBoard({
          size: 4,
          distribution: [
            { token: 'A', weight: Number.MAX_VALUE },
            { token: 'B', weight: Number.MIN_VALUE },
          ],
          random: constantRandom(0),
        }),
      'INVALID_TOTAL_WEIGHT',
    );
  });

  it('maps the value immediately below one to the final interval after rounding', () => {
    const result = generateBoard({
      size: 4,
      distribution: [{ token: 'A', weight: Number.MIN_VALUE }],
      random: constantRandom(IMMEDIATELY_BELOW_ONE),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.board.tiles).toEqual(Array(16).fill('A'));
    }
  });

  it.each(['', 'A!', 'ABCDE', 'ß'])(
    'rejects invalid configured token %s',
    (token) => {
      expectConfigurationError(
        () =>
          generateBoard({
            size: 4,
            distribution: [{ token, weight: 1 }],
            random: constantRandom(0),
          }),
        'INVALID_TILE_TOKEN',
      );
    },
  );

  it('normalizes valid configured tokens exactly once', () => {
    const result = generateBoard({
      size: 4,
      distribution: [{ token: ' qu ', weight: 1 }],
      random: constantRandom(0),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.board.tiles).toEqual(Array(16).fill('QU'));
    }
  });

  it('does not mutate the distribution or its entries', () => {
    const distribution = [
      { token: 'A', weight: 2 },
      { token: 'B', weight: 1 },
    ];
    const snapshot = structuredClone(distribution);

    generateBoard({
      size: 4,
      distribution,
      random: constantRandom(0),
    });

    expect(distribution).toEqual(snapshot);
  });

  it('passes a frozen board to the acceptance predicate', () => {
    let boardWasFrozen = false;
    const result = generateBoard({
      size: 4,
      distribution: equalDistribution,
      random: constantRandom(0),
      acceptBoard(board) {
        boardWasFrozen = Object.isFrozen(board) && Object.isFrozen(board.tiles);
        return true;
      },
    });

    expect(result.success).toBe(true);
    expect(boardWasFrozen).toBe(true);
  });

  it('propagates an acceptance-predicate exception unchanged', () => {
    const predicateError = new Error('Acceptance predicate failed.');
    let caughtError: unknown;
    let calls = 0;

    try {
      generateBoard({
        size: 4,
        distribution: equalDistribution,
        random: constantRandom(0),
        maxAttempts: 3,
        acceptBoard() {
          calls += 1;
          throw predicateError;
        },
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBe(predicateError);
    expect(calls).toBe(1);
  });

  it('returns a structured failure after bounded rejection', () => {
    let calls = 0;
    const result = generateBoard({
      size: 4,
      distribution: equalDistribution,
      random: constantRandom(0),
      maxAttempts: 3,
      acceptBoard() {
        calls += 1;
        return false;
      },
    });

    expect(result).toEqual({
      success: false,
      code: 'NO_ACCEPTABLE_BOARD',
      attempts: 3,
    });
    expect(calls).toBe(3);
  });

  it('accepts a successful later attempt deterministically', () => {
    const values = [...Array(16).fill(0), ...Array(16).fill(0.999)] as number[];
    const result = generateBoard({
      size: 4,
      distribution: equalDistribution,
      random: sequenceRandom(values),
      maxAttempts: 2,
      acceptBoard: (board) => board.tiles.every((tile) => tile === 'B'),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.attempts).toBe(2);
      expect(result.board.tiles).toEqual(Array(16).fill('B'));
    }
  });

  it.each([0, -1, 1.5, MAX_GENERATION_ATTEMPTS + 1])(
    'rejects invalid maxAttempts value %s',
    (maxAttempts) => {
      expectConfigurationError(
        () =>
          generateBoard({
            size: 4,
            distribution: equalDistribution,
            random: constantRandom(0),
            maxAttempts,
          }),
        'INVALID_MAX_ATTEMPTS',
      );
    },
  );

  it('generates many deterministic boards without fixed-size assumptions', () => {
    for (const size of [4, 5, 6] as const) {
      for (let iteration = 0; iteration < 25; iteration += 1) {
        let state = iteration + size;
        const random: RandomSource = {
          next() {
            state = (state * 16_807) % 2_147_483_647;
            return (state - 1) / 2_147_483_646;
          },
        };
        const result = generateBoard({
          size,
          distribution: equalDistribution,
          random,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.board.tiles).toHaveLength(size * size);
          expect(
            result.board.tiles.every((tile) => tile === 'A' || tile === 'B'),
          ).toBe(true);
        }
      }
    }
  });
});
