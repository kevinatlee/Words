import { describe, expect, it } from 'vitest';

import { createDemoBoard } from './demoBoard';

const boards = {
  4: ['WORD', 'PLAY', 'FIND', 'FOUR'],
  5: ['WORDS', 'ASDNH', 'NFIXA', 'NSFVR', 'ATLEE'],
  6: ['WORDSL', 'PARTYE', 'FINDST', 'ATLEET', 'PLAYSE', 'SIXBYR'],
} as const;

function rows(board: readonly string[], size: number): string[] {
  return Array.from({ length: size }, (_, row) =>
    board.slice(row * size, (row + 1) * size).join(''),
  );
}

describe('createDemoBoard', () => {
  it.each([4, 5, 6] as const)(
    'returns the exact static %s by %s presentation board in row-major order',
    (size) => {
      const board = createDemoBoard(size);

      expect(board).toEqual(boards[size].flatMap((row) => [...row]));
      expect(rows(board, size)).toEqual(boards[size]);
      expect(board).toHaveLength(size * size);
    },
  );

  it('keeps the five-by-five lobby words visible in their expected directions', () => {
    const board = createDemoBoard(5);
    expect(rows(board, 5)[0]).toBe('WORDS');
    expect(rows(board, 5)[4]).toBe('ATLEE');
    expect([0, 5, 10, 15, 20].map((index) => board[index]).join('')).toBe(
      'WANNA',
    );
    expect([4, 9, 14, 19, 24].map((index) => board[index]).join('')).toBe(
      'SHARE',
    );
  });

  it('returns independent arrays rather than mutable shared board constants', () => {
    const first = createDemoBoard(4);
    const second = createDemoBoard(4);
    first[0] = 'X';

    expect(second[0]).toBe('W');
    expect(createDemoBoard(4)[0]).toBe('W');
  });

  it('rejects invalid and unsupported dimensions instead of cycling a text source', () => {
    expect(() => createDemoBoard(0)).toThrow(
      'Board size must be a positive integer.',
    );
    expect(() => createDemoBoard(4.5)).toThrow(
      'Board size must be a positive integer.',
    );
    expect(() => createDemoBoard(7)).toThrow(
      'Unsupported demonstration board size. Supported sizes are 4, 5, and 6.',
    );
  });
});
