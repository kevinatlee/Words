import { describe, expect, it } from 'vitest';

import { readPath, validatePath } from '../src/index.js';
import { createBoardFixture } from './fixtures.js';

describe('path validation', () => {
  const board = createBoardFixture();

  it('accepts a valid horizontal, vertical, and diagonal path', () => {
    expect(validatePath(board, [0, 1, 5, 10])).toEqual({
      valid: true,
      word: 'ABFK',
      path: [0, 1, 5, 10],
    });
  });

  it('rejects an empty path', () => {
    expect(validatePath(board, [])).toEqual({
      valid: false,
      code: 'EMPTY_PATH',
    });
  });

  it('rejects a non-array path', () => {
    expect(validatePath(board, '0,1')).toEqual({
      valid: false,
      code: 'EMPTY_PATH',
    });
  });

  it('rejects a negative index before reading a tile', () => {
    expect(validatePath(board, [0, -1])).toEqual({
      valid: false,
      code: 'INDEX_OUT_OF_BOUNDS',
      pathPosition: 1,
      tileIndex: -1,
    });
  });

  it('rejects an out-of-range index before reading a tile', () => {
    expect(validatePath(board, [16])).toEqual({
      valid: false,
      code: 'INDEX_OUT_OF_BOUNDS',
      pathPosition: 0,
      tileIndex: 16,
    });
  });

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY, '1'])(
    'rejects non-integer index %s',
    (tileIndex) => {
      expect(validatePath(board, [tileIndex])).toEqual({
        valid: false,
        code: 'INVALID_INDEX',
        pathPosition: 0,
      });
    },
  );

  it('rejects repeated tile use anywhere in a path', () => {
    expect(validatePath(board, [0, 1, 5, 0])).toEqual({
      valid: false,
      code: 'TILE_REUSED',
      pathPosition: 3,
      tileIndex: 0,
    });
  });

  it('rejects a non-adjacent step', () => {
    expect(validatePath(board, [0, 2])).toEqual({
      valid: false,
      code: 'NON_ADJACENT',
      pathPosition: 1,
      tileIndex: 2,
    });
  });

  it('rejects numeric row wrapping as non-adjacent', () => {
    expect(validatePath(board, [3, 4])).toMatchObject({
      valid: false,
      code: 'NON_ADJACENT',
    });
  });

  it('rejects a path longer than the tile count before scanning entries', () => {
    expect(validatePath(board, Array(17).fill(0))).toEqual({
      valid: false,
      code: 'PATH_TOO_LONG',
    });
  });

  it('reads the expected word from a valid path', () => {
    expect(readPath(board, [0, 4, 9])).toEqual({
      valid: true,
      word: 'AEJ',
      path: [0, 4, 9],
    });
  });

  it('concatenates complete multi-character tokens', () => {
    const quBoard = createBoardFixture(4, { 0: 'QU', 1: 'I', 2: 'Z' });

    expect(readPath(quBoard, [0, 1, 2])).toMatchObject({
      valid: true,
      word: 'QUIZ',
    });
  });

  it('does not mutate a caller-owned board or path', () => {
    const tiles = Array.from(board.tiles);
    const mutableBoard = { size: 4, tiles };
    const path = [0, 1, 2];

    const result = validatePath(mutableBoard, path);

    expect(result.valid).toBe(true);
    expect(mutableBoard).toEqual({ size: 4, tiles });
    expect(path).toEqual([0, 1, 2]);
    if (result.valid) {
      expect(result.path).not.toBe(path);
      expect(Object.isFrozen(result.path)).toBe(true);
    }
  });

  it('reports an invalid board without exposing board details', () => {
    expect(validatePath({ size: 4, tiles: [] }, [0])).toEqual({
      valid: false,
      code: 'INVALID_BOARD',
    });
  });

  it.each([4, 5, 6] as const)(
    'accepts a snake path across every tile of a %d × %d board',
    (size) => {
      const largerBoard = createBoardFixture(size);
      const path: number[] = [];
      for (let row = 0; row < size; row += 1) {
        for (let column = 0; column < size; column += 1) {
          const orderedColumn = row % 2 === 0 ? column : size - 1 - column;
          path.push(row * size + orderedColumn);
        }
      }

      expect(validatePath(largerBoard, path).valid).toBe(true);
    },
  );
});
