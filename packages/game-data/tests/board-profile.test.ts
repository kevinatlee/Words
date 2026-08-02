import {
  validateBoard,
  type Board,
  type BoardSize,
  type RandomSource,
} from '@words/game-engine';
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_BOARD_QUALITY_PROFILES,
  DEFAULT_DISTRIBUTION_METADATA,
  DEFAULT_TILE_DISTRIBUTION,
  generateDefaultBoard,
  isDefaultBoardAcceptable,
  measureBoardSpatialQuality,
} from '../src/index.js';

const VOWELS = ['A', 'E', 'I', 'O', 'U'] as const;
const CONSONANTS = [
  'B',
  'C',
  'D',
  'F',
  'G',
  'H',
  'J',
  'K',
  'L',
  'M',
  'N',
  'P',
  'R',
  'S',
  'T',
  'V',
  'W',
  'X',
  'Y',
  'Z',
] as const;

function makeBoard(size: BoardSize, tiles: readonly string[]): Board {
  const result = validateBoard({ size, tiles });
  if (!result.valid) {
    throw new Error(`Invalid test board: ${result.code}.`);
  }
  return result.board;
}

function boardWithVowels(size: BoardSize, vowelCount: number): Board {
  const preferredVowelIndices = Array.from(
    { length: size * size },
    (_, index) => index,
  ).filter((index) => {
    const row = Math.floor(index / size);
    const column = index % size;
    return (row + column) % 2 === 0;
  });
  const extraVowels = [1, size * size - 2].filter(
    (index) => !preferredVowelIndices.includes(index),
  );
  const remainingIndices = Array.from(
    { length: size * size },
    (_, index) => index,
  ).filter(
    (index) =>
      !preferredVowelIndices.includes(index) && !extraVowels.includes(index),
  );
  const vowelIndices = new Set(
    [...preferredVowelIndices, ...extraVowels, ...remainingIndices].slice(
      0,
      vowelCount,
    ),
  );
  const tiles = Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size);
    const column = index % size;
    return vowelIndices.has(index)
      ? VOWELS[(row * 2 + column) % VOWELS.length]!
      : CONSONANTS[(row * 3 + column) % CONSONANTS.length]!;
  });
  return makeBoard(size, tiles);
}

function acceptableFourByFour(): Board {
  return makeBoard(4, [
    'B',
    'C',
    'D',
    'A',
    'F',
    'G',
    'E',
    'H',
    'J',
    'I',
    'K',
    'L',
    'O',
    'M',
    'N',
    'U',
  ]);
}

function replaceTiles(
  board: Board,
  replacements: Readonly<Record<number, string>>,
): Board {
  return makeBoard(
    board.size,
    board.tiles.map((token, index) => replacements[index] ?? token),
  );
}

function boardWithRepeatedToken(size: BoardSize): Board {
  const profile = DEFAULT_BOARD_QUALITY_PROFILES[size];
  const tiles = Array.from({ length: size * size }, (_, index) => {
    if (index < profile.minimumVowelTokens) {
      return VOWELS[index % VOWELS.length]!;
    }
    if (
      index <
      profile.minimumVowelTokens + profile.maximumIdenticalTokens + 1
    ) {
      return 'B';
    }
    return CONSONANTS[index % CONSONANTS.length]!;
  });
  return makeBoard(size, tiles);
}

function sequenceRandomForTokens(tokens: readonly string[]): RandomSource {
  const total = DEFAULT_DISTRIBUTION_METADATA.totalWeight;
  const values = tokens.map((desiredToken) => {
    let lowerBoundary = 0;
    for (const { token, weight } of DEFAULT_TILE_DISTRIBUTION) {
      if (token === desiredToken) {
        return (lowerBoundary + weight / 2) / total;
      }
      lowerBoundary += weight;
    }
    throw new Error(`Unknown test token ${desiredToken}.`);
  });
  let index = 0;
  return {
    next() {
      const value = values[index];
      if (value === undefined) {
        throw new Error('Test random sequence exhausted.');
      }
      index += 1;
      return value;
    },
  };
}

function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return {
    next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4_294_967_296;
    },
  };
}

describe.each([4, 5, 6] as const)('size-%d default quality profile', (size) => {
  const profile = DEFAULT_BOARD_QUALITY_PROFILES[size];

  it('accepts both vowel-count boundaries', () => {
    expect(
      isDefaultBoardAcceptable(
        boardWithVowels(size, profile.minimumVowelTokens),
      ),
    ).toBe(true);
    expect(
      isDefaultBoardAcceptable(
        boardWithVowels(size, profile.maximumVowelTokens),
      ),
    ).toBe(true);
  });

  it('rejects too few or too many vowel tokens', () => {
    expect(
      isDefaultBoardAcceptable(
        boardWithVowels(size, profile.minimumVowelTokens - 1),
      ),
    ).toBe(false);
    expect(
      isDefaultBoardAcceptable(
        boardWithVowels(size, profile.maximumVowelTokens + 1),
      ),
    ).toBe(false);
  });

  it('rejects an excessive repeated token without mutating the board', () => {
    const board = boardWithRepeatedToken(size);
    const snapshot = structuredClone(board);

    expect(isDefaultBoardAcceptable(board)).toBe(false);
    expect(board).toEqual(snapshot);
    expect(Object.isFrozen(board)).toBe(true);
    expect(Object.isFrozen(board.tiles)).toBe(true);
  });

  it('counts QU as a consonant token', () => {
    const realVowels = profile.minimumVowelTokens - 1;
    const tiles = Array.from({ length: size * size }, (_, index) => {
      if (index < realVowels) {
        return VOWELS[index % VOWELS.length]!;
      }
      if (index === realVowels) {
        return 'QU';
      }
      return CONSONANTS[index % CONSONANTS.length]!;
    });

    expect(isDefaultBoardAcceptable(makeBoard(size, tiles))).toBe(false);
  });
});

describe('default board generation', () => {
  it.each([4, 5, 6] as const)(
    'generates a deterministic acceptable size-%d board',
    (size) => {
      const first = generateDefaultBoard({
        size,
        random: seededRandom(0x7812aa09),
      });
      const second = generateDefaultBoard({
        size,
        random: seededRandom(0x7812aa09),
      });

      expect(first).toEqual(second);
      expect(first.success).toBe(true);
      if (first.success) {
        expect(first.board.tiles).toHaveLength(size * size);
        expect(isDefaultBoardAcceptable(first.board)).toBe(true);
      }
    },
  );

  it('preserves bounded structured exhaustion', () => {
    const result = generateDefaultBoard({
      size: 4,
      random: { next: () => 0 },
    });

    expect(result).toEqual({
      success: false,
      code: 'NO_ACCEPTABLE_BOARD',
      attempts: DEFAULT_BOARD_QUALITY_PROFILES[4].maximumAttempts,
    });
  });

  it('preserves the engine configuration error for an unsupported size', () => {
    expect(() =>
      generateDefaultBoard({
        size: 7 as BoardSize,
        random: seededRandom(0x72a191e4),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'INVALID_BOARD_SIZE',
      }),
    );
  });

  it('preserves invalid random-value failures from the engine', () => {
    expect(() =>
      generateDefaultBoard({
        size: 4,
        random: { next: () => Number.NaN },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'INVALID_RANDOM_VALUE',
      }),
    );
  });

  it('can generate a QU tile on an otherwise acceptable board', () => {
    const tokens = [
      'QU',
      'A',
      'E',
      'I',
      'O',
      'B',
      'C',
      'D',
      'F',
      'G',
      'H',
      'J',
      'K',
      'L',
      'M',
      'N',
    ];
    const result = generateDefaultBoard({
      size: 4,
      random: sequenceRandomForTokens(tokens),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.board.tiles).toEqual(tokens);
    }
  });

  it('never falls back to Math.random', () => {
    const fallback = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used.');
    });
    try {
      expect(
        generateDefaultBoard({
          size: 4,
          random: seededRandom(0xa44219c3),
        }).success,
      ).toBe(true);
      expect(fallback).not.toHaveBeenCalled();
    } finally {
      fallback.mockRestore();
    }
  });
});

describe('default spatial board quality', () => {
  it('rejects connected groups of four and five identical exact tokens', () => {
    const base = acceptableFourByFour();
    for (const indices of [
      [0, 1, 4, 5],
      [0, 1, 2, 4, 5],
    ]) {
      const board = replaceTiles(
        base,
        Object.fromEntries(indices.map((index) => [index, 'B'])),
      );
      expect(
        measureBoardSpatialQuality(board).largestIdenticalConnectedComponent,
      ).toBe(indices.length);
      expect(isDefaultBoardAcceptable(board)).toBe(false);
    }
  });

  it.each([
    ['horizontal', [0, 1, 2]],
    ['vertical', [0, 4, 8]],
    ['diagonal', [0, 5, 10]],
  ] as const)('rejects an identical %s straight run', (_label, indices) => {
    const board = replaceTiles(
      acceptableFourByFour(),
      Object.fromEntries(indices.map((index) => [index, 'B'])),
    );
    const spatial = measureBoardSpatialQuality(board);

    expect(spatial.longestIdenticalStraightRun).toBe(3);
    expect(spatial.identicalStraightRuns).toBeGreaterThan(0);
    expect(isDefaultBoardAcceptable(board)).toBe(false);
  });

  it('rejects an all-vowel 2 by 2 window without treating QU as a vowel', () => {
    const board = replaceTiles(acceptableFourByFour(), {
      0: 'A',
      1: 'E',
      4: 'I',
      5: 'O',
      15: 'QU',
    });
    expect(measureBoardSpatialQuality(board).maximumVowelsInTwoByTwo).toBe(4);
    expect(isDefaultBoardAcceptable(board)).toBe(false);
  });

  it('rejects a 3 by 3 window with seven vowels', () => {
    const base = replaceTiles(acceptableFourByFour(), {
      3: 'B',
      6: 'C',
      9: 'D',
      12: 'O',
    });
    const board = replaceTiles(base, {
      0: 'A',
      1: 'E',
      2: 'I',
      4: 'O',
      5: 'U',
      6: 'A',
      8: 'E',
    });
    expect(measureBoardSpatialQuality(board).maximumVowelsInThreeByThree).toBe(
      7,
    );
    expect(isDefaultBoardAcceptable(board)).toBe(false);
  });

  it('accepts separated repeated letters and a distributed vowel pattern', () => {
    const board = replaceTiles(acceptableFourByFour(), {
      0: 'B',
      2: 'B',
      8: 'B',
    });
    expect(measureBoardSpatialQuality(board)).toEqual({
      largestIdenticalConnectedComponent: 1,
      identicalStraightRuns: 0,
      longestIdenticalStraightRun: 1,
      maximumVowelsInTwoByTwo: 2,
      maximumVowelsInThreeByThree: 3,
    });
    expect(isDefaultBoardAcceptable(board)).toBe(true);
  });
});
