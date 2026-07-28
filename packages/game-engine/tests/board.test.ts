import { describe, expect, it } from 'vitest';

import {
  areAdjacent,
  coordinateToIndex,
  getAdjacentIndices,
  indexToCoordinate,
  validateBoard,
  type BoardSize,
} from '../src/index.js';
import { createBoardFixture } from './fixtures.js';

describe('board validation', () => {
  it.each([
    [4, 16],
    [5, 25],
    [6, 36],
  ] as const)(
    'accepts a valid size %d board with %d tiles',
    (size, tileCount) => {
      const board = createBoardFixture(size);

      expect(board.size).toBe(size);
      expect(board.tiles).toHaveLength(tileCount);
    },
  );

  it.each([0, 3, 7, 16, '4'])('rejects unsupported size %s', (size) => {
    expect(validateBoard({ size, tiles: [] })).toEqual({
      valid: false,
      code: 'INVALID_SIZE',
    });
  });

  it('rejects a missing board structure', () => {
    expect(validateBoard(null)).toEqual({
      valid: false,
      code: 'INVALID_BOARD',
    });
    expect(validateBoard({ size: 4 })).toEqual({
      valid: false,
      code: 'INVALID_BOARD',
    });
  });

  it.each([[[]], [[...Array(15).fill('A')]], [[...Array(17).fill('A')]]])(
    'rejects a wrong tile count',
    (tiles) => {
      expect(validateBoard({ size: 4, tiles })).toEqual({
        valid: false,
        code: 'INVALID_TILE_COUNT',
      });
    },
  );

  it.each(['', 'a', 'A!', 'ABCDE', 'ß', 3])(
    'rejects invalid tile token %s',
    (token) => {
      const tiles: unknown[] = Array(16).fill('A');
      tiles[7] = token;

      expect(validateBoard({ size: 4, tiles })).toEqual({
        valid: false,
        code: 'INVALID_TILE_TOKEN',
        tileIndex: 7,
      });
    },
  );

  it('supports a short multi-character QU token', () => {
    const board = createBoardFixture(4, { 0: 'QU' });

    expect(board.tiles[0]).toBe('QU');
  });

  it('snapshots and freezes mutable caller input', () => {
    const tiles = Array(16).fill('A');
    const candidate = { size: 4, tiles };
    const result = validateBoard(candidate);
    expect(result.valid).toBe(true);
    if (!result.valid) {
      return;
    }

    tiles[0] = 'Z';
    expect(result.board.tiles[0]).toBe('A');
    expect(Object.isFrozen(result.board)).toBe(true);
    expect(Object.isFrozen(result.board.tiles)).toBe(true);
    expect(candidate.tiles).toBe(tiles);
  });
});

describe('coordinate helpers', () => {
  it.each([4, 5, 6] as const)(
    'round-trips every row-major index on a size %d board',
    (size) => {
      for (let index = 0; index < size * size; index += 1) {
        const coordinate = indexToCoordinate(size, index);
        expect(coordinate).not.toBeNull();
        expect(
          coordinateToIndex(size, coordinate?.row, coordinate?.column),
        ).toBe(index);
      }
    },
  );

  it('rejects invalid coordinates and indexes', () => {
    expect(coordinateToIndex(4, -1, 0)).toBeNull();
    expect(coordinateToIndex(4, 0, 4)).toBeNull();
    expect(coordinateToIndex(4, 0.5, 1)).toBeNull();
    expect(indexToCoordinate(4, -1)).toBeNull();
    expect(indexToCoordinate(4, 16)).toBeNull();
    expect(indexToCoordinate(4, 1.5)).toBeNull();
  });

  it('keeps row-major ordering explicit', () => {
    expect(coordinateToIndex(4, 0, 3)).toBe(3);
    expect(coordinateToIndex(4, 1, 0)).toBe(4);
    expect(indexToCoordinate(4, 11)).toEqual({ row: 2, column: 3 });
  });
});

describe('adjacency helpers', () => {
  it('gives a corner exactly three neighbours', () => {
    expect(getAdjacentIndices(4, 0)).toEqual([1, 4, 5]);
  });

  it('gives a non-corner edge exactly five neighbours', () => {
    expect(getAdjacentIndices(4, 1)).toEqual([0, 2, 4, 5, 6]);
  });

  it('gives an interior cell exactly eight neighbours', () => {
    expect(getAdjacentIndices(4, 5)).toEqual([0, 1, 2, 4, 6, 8, 9, 10]);
  });

  it.each([
    ['horizontal', 5, 4],
    ['vertical', 5, 9],
    ['up-left diagonal', 5, 0],
    ['up-right diagonal', 5, 2],
    ['down-left diagonal', 5, 8],
    ['down-right diagonal', 5, 10],
  ] as const)('accepts a %s move from %d to %d', (_description, from, to) => {
    expect(areAdjacent(4, from, to)).toBe(true);
  });

  it('rejects the same cell', () => {
    expect(areAdjacent(4, 5, 5)).toBe(false);
  });

  it('rejects a two-cell jump', () => {
    expect(areAdjacent(4, 0, 2)).toBe(false);
    expect(areAdjacent(4, 0, 8)).toBe(false);
  });

  it('rejects row wrapping despite adjacent numeric indexes', () => {
    expect(areAdjacent(4, 3, 4)).toBe(false);
    expect(getAdjacentIndices(4, 3)).not.toContain(4);
  });

  it.each([4, 5, 6] as const)(
    'returns only reciprocal in-bounds neighbours for size %d',
    (size: BoardSize) => {
      for (let index = 0; index < size * size; index += 1) {
        for (const neighbour of getAdjacentIndices(size, index)) {
          expect(neighbour).toBeGreaterThanOrEqual(0);
          expect(neighbour).toBeLessThan(size * size);
          expect(getAdjacentIndices(size, neighbour)).toContain(index);
        }
      }
    },
  );
});
