import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmptyRoomHighlights, type RoomState } from '@words/shared';

import {
  calculateRemainingRoundMs,
  calculateVisibleRoundSeconds,
  millisecondsUntilVisibleSecondChange,
  useRoundDeadlineReached,
  useVisibleRoundCountdown,
} from './useRoundCountdown';

function createRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: 'ABC234',
    phase: 'ROUND_ACTIVE',
    stateVersion: 2,
    serverTime: '2026-07-29T20:00:00.000Z',
    createdAt: '2026-07-29T19:00:00.000Z',
    lastActivityAt: '2026-07-29T20:00:00.000Z',
    expiresAt: '2026-07-29T22:00:00.000Z',
    maxPlayers: 8,
    highlights: createEmptyRoomHighlights(),
    display: {
      connected: true,
      createdAt: '2026-07-29T19:00:00.000Z',
    },
    controllerStatus: 'none',
    controllerPlayerId: null,
    players: [],
    settings: {
      gridSize: 4,
      roundDurationSeconds: 120,
      scoringMode: 'length-plus-unique',
    },
    round: {
      id: '00000000-0000-4000-8000-000000000100',
      number: 1,
      settings: {
        gridSize: 4,
        roundDurationSeconds: 120,
        scoringMode: 'length-plus-unique',
      },
      board: {
        size: 4,
        tiles: Array.from({ length: 16 }, () => 'A'),
      },
      participants: [],
      acceptedWordCounts: [],
      startedAt: '2026-07-29T20:00:00.000Z',
      deadlineAt: '2026-07-29T20:02:00.000Z',
      endedAt: null,
      results: null,
      generationAttempts: 1,
    },
    ...overrides,
  };
}

function endedRoom(active = createRoom()): RoomState {
  return {
    ...active,
    phase: 'ROUND_ENDED',
    stateVersion: active.stateVersion + 1,
    serverTime: active.round?.deadlineAt ?? active.serverTime,
    round: active.round
      ? {
          ...active.round,
          endedAt: active.round.deadlineAt,
          results: { players: [], winnerPlayerIds: [] },
        }
      : null,
  };
}

let visibility: DocumentVisibilityState;
let originalVisibilityDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'visibilityState',
  );
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(() => {
  if (originalVisibilityDescriptor) {
    Object.defineProperty(
      document,
      'visibilityState',
      originalVisibilityDescriptor,
    );
  } else {
    Reflect.deleteProperty(document, 'visibilityState');
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('authoritative round countdown calculations', () => {
  it('uses server time plus monotonic elapsed time and clamps at zero', () => {
    vi.setSystemTime('2040-01-01T00:00:00.000Z');
    expect(
      calculateRemainingRoundMs(
        '2026-07-29T20:00:00.000Z',
        '2026-07-29T20:00:30.000Z',
        5_000,
      ),
    ).toBe(25_000);
    expect(
      calculateRemainingRoundMs(
        '2026-07-29T20:00:00.000Z',
        '2026-07-29T20:00:30.000Z',
        40_000,
      ),
    ).toBe(0);
  });

  it('keeps whole-second display semantics and schedules the next true boundary', () => {
    expect(calculateVisibleRoundSeconds(120_000)).toBe(120);
    expect(calculateVisibleRoundSeconds(119_001)).toBe(120);
    expect(calculateVisibleRoundSeconds(119_000)).toBe(119);
    expect(millisecondsUntilVisibleSecondChange(120_000)).toBe(1_000);
    expect(millisecondsUntilVisibleSecondChange(119_425)).toBe(425);
    expect(millisecondsUntilVisibleSecondChange(0.2)).toBe(1);
    expect(millisecondsUntilVisibleSecondChange(0)).toBe(0);
  });
});

describe('visible round countdown scheduling', () => {
  it('updates only at visible-second transitions across 120 → 119, 100 → 99, 10 → 9, and 1 → 0', () => {
    let monotonicTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const { result } = renderHook(() => useVisibleRoundCountdown(createRoom()));
    expect(result.current).toBe(120);

    const advanceSeconds = (seconds: number) => {
      for (let index = 0; index < seconds; index += 1) {
        act(() => {
          monotonicTime += 1_000;
          vi.advanceTimersByTime(1_000);
        });
      }
    };

    advanceSeconds(1);
    expect(result.current).toBe(119);
    advanceSeconds(20);
    expect(result.current).toBe(99);
    advanceSeconds(90);
    expect(result.current).toBe(9);
    advanceSeconds(8);
    expect(result.current).toBe(1);
    advanceSeconds(1);
    expect(result.current).toBe(0);
    expect(setTimeoutSpy).toHaveBeenCalledTimes(120);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('re-anchors from a newer authoritative snapshot without browser wall-clock time', () => {
    let monotonicTime = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
    const { result, rerender } = renderHook(
      ({ room }) => useVisibleRoundCountdown(room),
      { initialProps: { room: createRoom() } },
    );
    act(() => {
      monotonicTime += 10_000;
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current).toBe(110);

    rerender({
      room: createRoom({
        stateVersion: 3,
        serverTime: '2026-07-29T20:00:12.000Z',
      }),
    });
    expect(result.current).toBe(108);
  });

  it('does no recurring visual work while hidden and recomputes immediately on return', () => {
    visibility = 'hidden';
    let monotonicTime = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const { result } = renderHook(() => useVisibleRoundCountdown(createRoom()));
    expect(result.current).toBe(120);
    expect(setTimeoutSpy).not.toHaveBeenCalled();

    monotonicTime += 21_000;
    visibility = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current).toBe(99);
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it('cannot let an old round timeout update a replacement round', () => {
    let monotonicTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
    const first = createRoom();
    const second: RoomState = {
      ...createRoom({ stateVersion: 3 }),
      round: first.round
        ? {
            ...first.round,
            id: '00000000-0000-4000-8000-000000000200',
          }
        : null,
    };
    const { result, rerender } = renderHook(
      ({ room }) => useVisibleRoundCountdown(room),
      { initialProps: { room: first } },
    );
    rerender({ room: second });
    act(() => {
      monotonicTime += 1_000;
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(119);
  });

  it('shows zero for server-ended state and cleans up timeout and visibility work', () => {
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const active = createRoom();
    const { result, rerender, unmount } = renderHook(
      ({ room }) => useVisibleRoundCountdown(room),
      { initialProps: { room: active } },
    );
    rerender({ room: endedRoom(active) });
    expect(result.current).toBe(0);
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('deadline-safe phone input gate', () => {
  it('changes once at the local authoritative deadline', () => {
    let monotonicTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
    const { result } = renderHook(() => useRoundDeadlineReached(createRoom()));
    expect(result.current).toBe(false);
    act(() => {
      monotonicTime += 120_000;
      vi.advanceTimersByTime(120_000);
    });
    expect(result.current).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('enforces the deadline while hidden and on visibility restoration after suspended timers', () => {
    visibility = 'hidden';
    let monotonicTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
    const first = renderHook(() => useRoundDeadlineReached(createRoom()));
    act(() => {
      monotonicTime += 120_000;
      vi.advanceTimersByTime(120_000);
    });
    expect(first.result.current).toBe(true);
    first.unmount();

    monotonicTime = 0;
    const second = renderHook(() => useRoundDeadlineReached(createRoom()));
    monotonicTime += 120_000;
    visibility = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(second.result.current).toBe(true);
  });

  it('accepts an authoritative end before the gate and resets safely for a new round', () => {
    const monotonicTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
    const active = createRoom();
    const replacement: RoomState = {
      ...createRoom({ stateVersion: 4 }),
      round: active.round
        ? {
            ...active.round,
            id: '00000000-0000-4000-8000-000000000300',
          }
        : null,
    };
    const { result, rerender } = renderHook(
      ({ room }) => useRoundDeadlineReached(room),
      { initialProps: { room: active } },
    );
    rerender({ room: endedRoom(active) });
    expect(result.current).toBe(true);
    rerender({ room: replacement });
    expect(result.current).toBe(false);
  });

  it('cleans up its one-shot timeout and visibility listener on unmount', () => {
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const { unmount } = renderHook(() => useRoundDeadlineReached(createRoom()));
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not accumulate timers or visibility listeners across repeated round cycles', () => {
    const addListener = vi.spyOn(document, 'addEventListener');
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const lobby = createRoom({ phase: 'LOBBY', round: null });
    const first = createRoom();
    const second: RoomState = {
      ...createRoom({ stateVersion: 5 }),
      round: first.round
        ? {
            ...first.round,
            id: '00000000-0000-4000-8000-000000000500',
            number: 2,
          }
        : null,
    };
    const { rerender, unmount } = renderHook(
      ({ room }) => ({
        deadline: useRoundDeadlineReached(room),
        seconds: useVisibleRoundCountdown(room),
      }),
      { initialProps: { room: first } },
    );
    expect(vi.getTimerCount()).toBe(2);
    rerender({ room: endedRoom(first) });
    expect(vi.getTimerCount()).toBe(0);
    rerender({ room: lobby });
    expect(vi.getTimerCount()).toBe(0);
    rerender({ room: second });
    expect(vi.getTimerCount()).toBe(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);

    const visibilityAdds = addListener.mock.calls.filter(
      ([eventName]) => eventName === 'visibilitychange',
    ).length;
    const visibilityRemovals = removeListener.mock.calls.filter(
      ([eventName]) => eventName === 'visibilitychange',
    ).length;
    expect(visibilityAdds).toBe(visibilityRemovals);
  });
});
