import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RoomState } from '@words/shared';

import {
  calculateRemainingRoundMs,
  useRoundCountdown,
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
    display: {
      connected: true,
      createdAt: '2026-07-29T19:00:00.000Z',
    },
    controllerStatus: 'none',
    controllerPlayerId: null,
    players: [],
    settings: {
      gridSize: 4,
      roundDurationSeconds: 30,
      scoringMode: 'traditional',
    },
    round: {
      id: '00000000-0000-4000-8000-000000000100',
      number: 1,
      settings: {
        gridSize: 4,
        roundDurationSeconds: 30,
        scoringMode: 'traditional',
      },
      board: {
        size: 4,
        tiles: Array.from({ length: 16 }, () => 'A'),
      },
      participants: [],
      startedAt: '2026-07-29T20:00:00.000Z',
      deadlineAt: '2026-07-29T20:00:30.000Z',
      endedAt: null,
      generationAttempts: 1,
    },
    ...overrides,
  };
}

describe('authoritative round countdown', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('derives remaining time from serverTime rather than the browser clock', () => {
    vi.setSystemTime('2040-01-01T00:00:00.000Z');
    expect(
      calculateRemainingRoundMs(
        '2026-07-29T20:00:00.000Z',
        '2026-07-29T20:00:30.000Z',
        5_000,
      ),
    ).toBe(25_000);
  });

  it('never returns negative remaining time', () => {
    expect(
      calculateRemainingRoundMs(
        '2026-07-29T20:00:00.000Z',
        '2026-07-29T20:00:30.000Z',
        40_000,
      ),
    ).toBe(0);
  });

  it('uses monotonic elapsed time between server snapshots', () => {
    vi.useFakeTimers();
    let monotonicTime = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
    const { result } = renderHook(() => useRoundCountdown(createRoom()));
    expect(result.current).toBe(30_000);

    act(() => {
      monotonicTime += 5_000;
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe(25_000);
  });

  it('re-anchors from a reconnect snapshot without using wall-clock skew', () => {
    vi.useFakeTimers();
    let monotonicTime = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
    const { result, rerender } = renderHook(
      ({ room }) => useRoundCountdown(room),
      { initialProps: { room: createRoom() } },
    );
    act(() => {
      monotonicTime += 10_000;
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe(20_000);

    rerender({
      room: createRoom({
        stateVersion: 3,
        serverTime: '2026-07-29T20:00:12.000Z',
      }),
    });
    expect(result.current).toBe(18_000);
  });

  it('shows zero for server-ended state without inventing a phase change', () => {
    const active = createRoom();
    const ended = createRoom({
      phase: 'ROUND_ENDED',
      round: active.round
        ? {
            ...active.round,
            endedAt: active.round.deadlineAt,
          }
        : null,
    });
    const { result } = renderHook(() => useRoundCountdown(ended));
    expect(result.current).toBe(0);
    expect(ended.phase).toBe('ROUND_ENDED');
  });

  it('cleans up its browser interval when the view unmounts', () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const { unmount } = renderHook(() => useRoundCountdown(createRoom()));
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it('stops its browser interval after the local countdown reaches zero', () => {
    vi.useFakeTimers();
    let monotonicTime = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const room = createRoom();
    const { result } = renderHook(() => useRoundCountdown(room));

    act(() => {
      monotonicTime += 30_000;
      vi.advanceTimersByTime(250);
    });

    expect(result.current).toBe(0);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    act(() => {
      monotonicTime += 10_000;
      vi.advanceTimersByTime(10_000);
    });
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
