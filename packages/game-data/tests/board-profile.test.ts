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
  const tiles = Array.from({ length: size * size }, (_, index) =>
    index < vowelCount
      ? VOWELS[index % VOWELS.length]!
      : CONSONANTS[(index - vowelCount) % CONSONANTS.length]!,
  );
  return makeBoard(size, tiles);
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
