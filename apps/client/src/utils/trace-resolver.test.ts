import { describe, expect, it } from 'vitest';

import { resolveTraceSegment } from './trace-resolver';

function rectForIndex(index: number, size: number) {
  return {
    left: (index % size) * 100,
    top: Math.floor(index / size) * 100,
    width: 100,
    height: 100,
  };
}

function center(index: number, size: number) {
  const rect = rectForIndex(index, size);
  return { x: rect.left + 50, y: rect.top + 50 };
}

function resolve(path: number[], from: number, to: number, size: number) {
  return resolveTraceSegment(
    path,
    center(from, size),
    center(to, size),
    size,
    (index) => rectForIndex(index, size),
  );
}

describe('Trace geometry resolver', () => {
  it.each([4, 5, 6])(
    'chooses a clean diagonal without an orthogonal intermediate on %ix%i',
    (size) => {
      expect(resolve([0], 0, size + 1, size)).toEqual([0, size + 1]);
    },
  );

  it.each([
    ['horizontal', { x: 170, y: 150 }],
    ['vertical', { x: 150, y: 170 }],
  ])('keeps a diagonal under modest %s jitter', (_, target) => {
    expect(
      resolveTraceSegment([0], center(0, 4), target, 4, (index) =>
        rectForIndex(index, 4),
      ),
    ).toEqual([0, 5]);
  });

  it('keeps deliberate horizontal and vertical movement responsive', () => {
    expect(resolve([0], 0, 1, 4)).toEqual([0, 1]);
    expect(resolve([0], 0, 4, 4)).toEqual([0, 4]);
  });

  it('processes a fast segment and retains legal backtracking', () => {
    expect(resolve([0], 0, 10, 4)).toEqual([0, 5, 10]);
    expect(resolve([0, 1, 2], 2, 1, 4)).toEqual([0, 1]);
  });
});
