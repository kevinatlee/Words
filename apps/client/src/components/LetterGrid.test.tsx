import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LetterGrid } from './LetterGrid';

const originalElementFromPointDescriptor = Object.getOwnPropertyDescriptor(
  document,
  'elementFromPoint',
);
const originalVisibilityStateDescriptor = Object.getOwnPropertyDescriptor(
  document,
  'visibilityState',
);

const letters = Array.from({ length: 16 }, (_, index) =>
  String.fromCharCode(65 + index),
);

function traceCallbacks() {
  let path: number[] = [];
  const onTraceStart = vi.fn((index: number) => {
    path = [index];
    return path;
  });
  const onTraceMove = vi.fn((index: number) => {
    const existingIndex = path.indexOf(index);
    if (existingIndex >= 0) {
      path = path.slice(0, existingIndex + 1);
    } else {
      path = [...path, index];
    }
    return path;
  });
  return { getPath: () => path, onTraceMove, onTraceStart };
}

function mockTraceGeometry() {
  const reads = new Map<number, number>();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function getBoundingClientRect(this: HTMLElement) {
      const index = Number.parseInt(this.dataset.tileIndex ?? '-1', 10);
      reads.set(index, (reads.get(index) ?? 0) + 1);
      const left = (index % 4) * 100;
      const top = Math.floor(index / 4) * 100;
      return {
        bottom: top + 100,
        height: 100,
        left,
        right: left + 100,
        toJSON: () => ({}),
        top,
        width: 100,
        x: left,
        y: top,
      } as DOMRect;
    },
  );
  return reads;
}

function mockAnimationFrames() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextId;
    nextId += 1;
    callbacks.set(id, callback);
    return id;
  });
  const cancel = vi
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation((id) => {
      callbacks.delete(id);
    });
  return {
    cancel,
    flush: () => {
      const pending = [...callbacks.values()];
      callbacks.clear();
      act(() => pending.forEach((callback) => callback(0)));
    },
    pending: () => callbacks.size,
  };
}

function renderTraceGrid(
  callbacks = traceCallbacks(),
  overrides: Partial<React.ComponentProps<typeof LetterGrid>> = {},
) {
  const onTraceEnd = vi.fn();
  const onTraceCancel = vi.fn();
  const view = render(
    <LetterGrid
      letters={letters}
      size={4}
      label="Trace grid"
      interactive
      entryMode="trace"
      onTraceStart={callbacks.onTraceStart}
      onTraceMove={callbacks.onTraceMove}
      onTraceEnd={onTraceEnd}
      onTraceCancel={onTraceCancel}
      {...overrides}
    />,
  );
  const grid = screen.getByRole('grid');
  const tiles = within(grid).getAllByRole('button');
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn().mockReturnValue(tiles[0]),
  });
  return { callbacks, grid, onTraceCancel, onTraceEnd, tiles, view };
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalElementFromPointDescriptor) {
    Object.defineProperty(
      document,
      'elementFromPoint',
      originalElementFromPointDescriptor,
    );
  } else {
    Reflect.deleteProperty(document, 'elementFromPoint');
  }
  if (originalVisibilityStateDescriptor) {
    Object.defineProperty(
      document,
      'visibilityState',
      originalVisibilityStateDescriptor,
    );
  } else {
    Reflect.deleteProperty(document, 'visibilityState');
  }
});

describe('LetterGrid accepted feedback', () => {
  it('marks only accepted indexes and lets accepted feedback override selection styling', () => {
    render(
      <LetterGrid
        letters={['A', 'B', 'C', 'D']}
        size={2}
        label="Test letter grid"
        selectedIndices={[0, 1]}
        acceptedIndices={[1, 2]}
        interactive
      />,
    );

    const tiles = within(screen.getByRole('grid')).getAllByRole('button');

    expect(tiles[0]).toHaveClass('letter-tile--selected');
    expect(tiles[0]).not.toHaveClass('letter-tile--accepted');
    expect(tiles[1]).toHaveClass(
      'letter-tile--selected',
      'letter-tile--accepted',
    );
    expect(tiles[2]).toHaveClass('letter-tile--accepted');
    expect(tiles[3]).not.toHaveClass('letter-tile--accepted');
  });

  it('keeps display-style grids free of accepted feedback unless explicitly given an accepted path', () => {
    const { container } = render(
      <LetterGrid
        letters={['A', 'B', 'C', 'D']}
        size={2}
        label="Display letter grid"
      />,
    );

    expect(container.querySelectorAll('.letter-tile--accepted')).toHaveLength(
      0,
    );
  });
});

describe('LetterGrid Trace runtime', () => {
  it('coalesces pointer moves into one animation-frame pass without losing crossed tiles', () => {
    const frames = mockAnimationFrames();
    const reads = mockTraceGeometry();
    const { callbacks, grid, tiles } = renderTraceGrid();

    fireEvent.pointerDown(tiles[0]!, {
      clientX: 50,
      clientY: 50,
      pointerId: 1,
      pointerType: 'touch',
    });
    for (const clientX of [150, 250, 350]) {
      fireEvent.pointerMove(grid, {
        clientX,
        clientY: 50,
        pointerId: 1,
        pointerType: 'touch',
      });
    }

    expect(frames.pending()).toBe(1);
    expect(callbacks.onTraceMove).not.toHaveBeenCalled();
    frames.flush();
    expect(callbacks.getPath()).toEqual([0, 1, 2, 3]);
    expect(callbacks.onTraceMove).toHaveBeenCalledTimes(3);
    expect([...reads.values()].every((count) => count === 1)).toBe(true);
  });

  it('flushes pending movement before pointer-up submits the final complete path', () => {
    const frames = mockAnimationFrames();
    mockTraceGeometry();
    const callbacks = traceCallbacks();
    const onTraceEnd = vi.fn(() => callbacks.getPath());
    const { grid, tiles } = renderTraceGrid(callbacks, { onTraceEnd });

    fireEvent.pointerDown(tiles[0]!, {
      clientX: 50,
      clientY: 50,
      pointerId: 2,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(grid, {
      clientX: 250,
      clientY: 50,
      pointerId: 2,
      pointerType: 'touch',
    });
    expect(frames.pending()).toBe(1);
    fireEvent.pointerUp(grid, {
      clientX: 350,
      clientY: 50,
      pointerId: 2,
      pointerType: 'touch',
    });

    expect(onTraceEnd).toHaveReturnedWith([0, 1, 2, 3]);
    expect(frames.pending()).toBe(0);
  });

  it('preserves diagonal, vertical, and backtracking paths through queued segments', () => {
    const frames = mockAnimationFrames();
    mockTraceGeometry();
    const callbacks = traceCallbacks();
    const { grid, tiles } = renderTraceGrid(callbacks);

    fireEvent.pointerDown(tiles[0]!, {
      clientX: 50,
      clientY: 50,
      pointerId: 3,
      pointerType: 'touch',
    });
    for (const point of [
      { clientX: 150, clientY: 150 },
      { clientX: 150, clientY: 250 },
      { clientX: 150, clientY: 350 },
      { clientX: 150, clientY: 250 },
    ]) {
      fireEvent.pointerMove(grid, {
        ...point,
        pointerId: 3,
        pointerType: 'touch',
      });
    }
    frames.flush();
    expect(callbacks.getPath()).toEqual([0, 5, 9]);
  });

  it('invalidates gesture geometry on resize and never rereads it otherwise', () => {
    const frames = mockAnimationFrames();
    const reads = mockTraceGeometry();
    const { grid, tiles } = renderTraceGrid();
    fireEvent.pointerDown(tiles[0]!, {
      clientX: 50,
      clientY: 50,
      pointerId: 4,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(grid, {
      clientX: 150,
      clientY: 50,
      pointerId: 4,
      pointerType: 'touch',
    });
    frames.flush();
    expect([...reads.values()].every((count) => count === 1)).toBe(true);
    const readsBeforeResize = [...reads.values()].reduce(
      (total, count) => total + count,
      0,
    );

    fireEvent(window, new Event('resize'));
    fireEvent.pointerMove(grid, {
      clientX: 250,
      clientY: 50,
      pointerId: 4,
      pointerType: 'touch',
    });
    frames.flush();
    expect(
      [...reads.values()].reduce((total, count) => total + count, 0),
    ).toBeGreaterThan(readsBeforeResize);
  });

  it('cancels pending frame work on cancel, reset, hidden visibility, and unmount', () => {
    const frames = mockAnimationFrames();
    mockTraceGeometry();
    const { grid, onTraceCancel, tiles, view } = renderTraceGrid();
    const beginPendingMove = (pointerId: number) => {
      fireEvent.pointerDown(tiles[0]!, {
        clientX: 50,
        clientY: 50,
        pointerId,
        pointerType: 'touch',
      });
      fireEvent.pointerMove(grid, {
        clientX: 150,
        clientY: 50,
        pointerId,
        pointerType: 'touch',
      });
      expect(frames.pending()).toBe(1);
    };

    beginPendingMove(5);
    fireEvent.pointerCancel(grid, { pointerId: 5, pointerType: 'touch' });
    expect(frames.pending()).toBe(0);

    beginPendingMove(6);
    view.rerender(
      <LetterGrid
        letters={letters}
        size={4}
        label="Trace grid"
        interactive
        entryMode="trace"
        traceResetKey="new-round"
      />,
    );
    expect(frames.pending()).toBe(0);

    const refreshedTiles = within(screen.getByRole('grid')).getAllByRole(
      'button',
    );
    fireEvent.pointerDown(refreshedTiles[0]!, {
      clientX: 50,
      clientY: 50,
      pointerId: 7,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(screen.getByRole('grid'), {
      clientX: 150,
      clientY: 50,
      pointerId: 7,
      pointerType: 'touch',
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(frames.pending()).toBe(0);
    expect(onTraceCancel).toHaveBeenCalled();

    view.unmount();
    expect(frames.pending()).toBe(0);
    expect(frames.cancel).toHaveBeenCalled();
  });

  it('keeps Tap activation immediate without scheduling animation-frame work', () => {
    const frames = mockAnimationFrames();
    const onSelect = vi.fn();
    render(
      <LetterGrid
        letters={letters.slice(0, 4)}
        size={2}
        label="Tap grid"
        interactive
        entryMode="touch"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getAllByRole('button')[0]!);
    expect(onSelect).toHaveBeenCalledWith(0);
    expect(frames.pending()).toBe(0);
  });
});
