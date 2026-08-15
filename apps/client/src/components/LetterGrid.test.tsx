import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LetterGrid } from './LetterGrid';
import * as traceResolver from '../utils/trace-resolver';

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
  const tiles = Array.from(
    grid.querySelectorAll<HTMLElement>('[data-tile-index]'),
  );
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
  it.each([4, 5, 6])(
    'uses the shared official-grid structure at %i by %i',
    (size) => {
      render(
        <LetterGrid
          letters={Array.from({ length: size * size }, () => 'A')}
          size={size}
          label={`${size} by ${size} official letter grid`}
        />,
      );

      const grid = screen.getByRole('grid');
      expect(grid).toHaveClass('letter-grid');
      expect(grid).toHaveStyle({ '--grid-size': String(size) });
      expect(within(grid).getAllByRole('gridcell')).toHaveLength(size * size);
    },
  );

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
  const traceSampleIntervalMs = 1000 / 60;
  let monotonicTime = 0;

  const advanceTraceTime = (milliseconds: number) => {
    act(() => {
      monotonicTime += milliseconds;
      vi.advanceTimersByTime(milliseconds);
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    monotonicTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses non-native, keyboard-accessible tile targets only for interactive Trace mode', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <LetterGrid
        letters={letters.slice(0, 4)}
        size={2}
        label="Trace grid"
        interactive
        entryMode="trace"
        selectedIndices={[1]}
        onSelect={onSelect}
      />,
    );

    const traceTiles = screen.getAllByRole('button');
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(traceTiles).toHaveLength(4);
    expect(traceTiles[1]).toHaveAttribute('data-tile-index', '1');
    expect(traceTiles[1]).toHaveAccessibleName('B, selection number 1');
    expect(traceTiles[1]).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(traceTiles[0]!, { detail: 1 });
    fireEvent.keyDown(traceTiles[0]!, { key: 'Enter' });
    fireEvent.keyDown(traceTiles[1]!, { key: ' ' });
    expect(onSelect).toHaveBeenNthCalledWith(1, 0);
    expect(onSelect).toHaveBeenNthCalledWith(2, 1);
  });

  it('samples only the latest movement while preserving crossed tiles', () => {
    const reads = mockTraceGeometry();
    const { callbacks, grid, tiles } = renderTraceGrid();

    fireEvent.pointerDown(tiles[0]!, {
      clientX: 50,
      clientY: 50,
      pointerId: 1,
      pointerType: 'touch',
    });
    expect(callbacks.onTraceStart).toHaveBeenCalledWith(0);
    for (const clientX of [150, 250, 350]) {
      fireEvent.pointerMove(grid, {
        clientX,
        clientY: 50,
        pointerId: 1,
        pointerType: 'touch',
      });
    }

    expect(callbacks.getPath()).toEqual([0, 1]);
    expect(vi.getTimerCount()).toBe(1);
    advanceTraceTime(traceSampleIntervalMs);
    expect(callbacks.getPath()).toEqual([0, 1, 2, 3]);
    expect(callbacks.onTraceMove).toHaveBeenCalledTimes(3);
    expect([...reads.values()].every((count) => count === 1)).toBe(true);
  });

  it('preserves fast direction changes across multiple samples', () => {
    mockTraceGeometry();
    const callbacks = traceCallbacks();
    const { grid, tiles } = renderTraceGrid(callbacks);

    fireEvent.pointerDown(tiles[0]!, {
      clientX: 50,
      clientY: 50,
      pointerId: 10,
      pointerType: 'touch',
    });
    for (const point of [
      { clientX: 150, clientY: 50 },
      { clientX: 150, clientY: 150 },
      { clientX: 50, clientY: 150 },
    ]) {
      fireEvent.pointerMove(grid, {
        ...point,
        pointerId: 10,
        pointerType: 'touch',
      });
      advanceTraceTime(traceSampleIntervalMs);
    }

    expect(callbacks.getPath()).toEqual([0, 1, 5, 4]);
  });

  it('flushes pending movement before pointer-up submits the final complete path', () => {
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
      clientX: 150,
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
    expect(vi.getTimerCount()).toBe(1);
    fireEvent.pointerUp(grid, {
      clientX: 350,
      clientY: 50,
      pointerId: 2,
      pointerType: 'touch',
    });

    expect(onTraceEnd).toHaveReturnedWith([0, 1, 2, 3]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves diagonal, vertical, and backtracking paths through sampled segments', () => {
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
    advanceTraceTime(traceSampleIntervalMs);
    expect(callbacks.getPath()).toEqual([0, 5, 9]);
  });

  it('invalidates gesture geometry on resize and never rereads it otherwise', () => {
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
    advanceTraceTime(traceSampleIntervalMs);
    expect(
      [...reads.values()].reduce((total, count) => total + count, 0),
    ).toBeGreaterThan(readsBeforeResize);
  });

  it('cancels pending sample work on cancel, reset, hidden visibility, and unmount', () => {
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
      fireEvent.pointerMove(grid, {
        clientX: 151,
        clientY: 50,
        pointerId,
        pointerType: 'touch',
      });
      expect(vi.getTimerCount()).toBe(1);
    };

    beginPendingMove(5);
    fireEvent.pointerCancel(grid, { pointerId: 5, pointerType: 'touch' });
    expect(vi.getTimerCount()).toBe(0);

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
    expect(vi.getTimerCount()).toBe(0);

    const refreshedTiles = Array.from(
      screen
        .getByRole('grid')
        .querySelectorAll<HTMLElement>('[data-tile-index]'),
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
    fireEvent.pointerMove(screen.getByRole('grid'), {
      clientX: 151,
      clientY: 50,
      pointerId: 7,
      pointerType: 'touch',
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(vi.getTimerCount()).toBe(0);
    expect(onTraceCancel).toHaveBeenCalled();

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps Tap activation immediate without scheduling trace work', () => {
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
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps interactive Tap tiles as native buttons', () => {
    render(
      <LetterGrid
        letters={letters.slice(0, 4)}
        size={2}
        label="Tap grid"
        interactive
        entryMode="touch"
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getAllByRole('button')[0]?.tagName).toBe('BUTTON');
  });

  it('bounds 240 incoming moves over one second to the 60 Hz trace work budget', () => {
    const resolver = vi.spyOn(traceResolver, 'resolveTraceSegment');
    mockTraceGeometry();
    const { grid, tiles } = renderTraceGrid();

    fireEvent.pointerDown(tiles[0]!, {
      clientX: 50,
      clientY: 50,
      pointerId: 8,
      pointerType: 'touch',
    });
    for (let eventNumber = 0; eventNumber < 240; eventNumber += 1) {
      fireEvent.pointerMove(grid, {
        clientX: 150 + eventNumber / 240,
        clientY: 50,
        pointerId: 8,
        pointerType: 'touch',
      });
      advanceTraceTime(1000 / 240);
    }

    expect(resolver.mock.calls.length).toBeGreaterThanOrEqual(59);
    expect(resolver.mock.calls.length).toBeLessThanOrEqual(61);
    expect(resolver.mock.calls.length).toBeLessThan(240);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not replay browser coalesced coordinates', () => {
    const getCoalescedEvents = vi.fn(() => [
      { clientX: 150, clientY: 50 },
      { clientX: 250, clientY: 50 },
    ]);
    mockTraceGeometry();
    const { callbacks, grid, tiles } = renderTraceGrid();

    fireEvent.pointerDown(tiles[0]!, {
      clientX: 50,
      clientY: 50,
      pointerId: 9,
      pointerType: 'touch',
    });
    const move = new Event('pointermove', { bubbles: true, cancelable: true });
    Object.defineProperties(move, {
      clientX: { value: 350 },
      clientY: { value: 50 },
      getCoalescedEvents: { value: getCoalescedEvents },
      pointerId: { value: 9 },
      pointerType: { value: 'touch' },
    });
    fireEvent(grid, move);

    expect(getCoalescedEvents).not.toHaveBeenCalled();
    expect(callbacks.getPath()).toEqual([0, 1, 2, 3]);
  });
});
