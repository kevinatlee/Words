import { describe, expect, it } from 'vitest';

import { createDemoBoard } from './demoBoard';

describe('createDemoBoard', () => {
  it.each([4, 5, 6])('creates a complete %s × %s board', (size) => {
    expect(createDemoBoard(size)).toHaveLength(size * size);
  });

  it('rejects invalid dimensions', () => {
    expect(() => createDemoBoard(0)).toThrow(
      'Board size must be a positive integer.',
    );
    expect(() => createDemoBoard(4.5)).toThrow(
      'Board size must be a positive integer.',
    );
  });
});
