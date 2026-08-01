import { useEffect, useState } from 'react';

import type { RoomState } from '@words/shared';

export function calculateRemainingRoundMs(
  serverTime: string,
  deadlineAt: string,
  elapsedMonotonicMs: number,
): number {
  const remainingAtSnapshot = Math.max(
    0,
    Date.parse(deadlineAt) - Date.parse(serverTime),
  );
  return Math.max(0, remainingAtSnapshot - Math.max(0, elapsedMonotonicMs));
}

export function calculateVisibleRoundSeconds(remainingMs: number): number {
  return Math.ceil(Math.max(0, remainingMs) / 1_000);
}

export function millisecondsUntilVisibleSecondChange(
  remainingMs: number,
): number {
  if (remainingMs <= 0) {
    return 0;
  }
  const partialSecond = remainingMs % 1_000;
  return partialSecond === 0 ? 1_000 : Math.max(1, partialSecond);
}

function pageIsVisible(): boolean {
  return document.visibilityState !== 'hidden';
}

type VisibleCountdownState = {
  snapshotKey: string;
  seconds: number;
};

/**
 * Owns only the visible whole-second countdown. It schedules directly against
 * the monotonic snapshot anchor and pauses visual work while the page is
 * hidden. Keep this hook in the smallest timer leaf so its updates cannot
 * rerender the puzzle tree.
 */
export function useVisibleRoundCountdown(room: RoomState): number | null {
  const round = room.round;
  const roundId = round?.id ?? null;
  const roundDeadlineAt = round?.deadlineAt ?? null;
  const snapshotKey = roundId ? `${roundId}:${room.serverTime}` : null;
  const [countdown, setCountdown] = useState<VisibleCountdownState | null>(
    null,
  );

  useEffect(() => {
    if (!roundId || !roundDeadlineAt || room.phase !== 'ROUND_ACTIVE') {
      return;
    }

    const currentSnapshotKey = `${roundId}:${room.serverTime}`;
    const anchor = performance.now();
    let timeout: number | null = null;

    const clearScheduledUpdate = () => {
      if (timeout !== null) {
        window.clearTimeout(timeout);
        timeout = null;
      }
    };
    const remainingNow = () =>
      calculateRemainingRoundMs(
        room.serverTime,
        roundDeadlineAt,
        performance.now() - anchor,
      );
    const publish = (remainingMs: number) => {
      const seconds = calculateVisibleRoundSeconds(remainingMs);
      setCountdown((current) =>
        current?.snapshotKey === currentSnapshotKey &&
        current.seconds === seconds
          ? current
          : { snapshotKey: currentSnapshotKey, seconds },
      );
    };
    const scheduleNext = (remainingMs: number) => {
      clearScheduledUpdate();
      if (!pageIsVisible() || remainingMs <= 0) {
        return;
      }
      timeout = window.setTimeout(() => {
        timeout = null;
        const nextRemainingMs = remainingNow();
        publish(nextRemainingMs);
        scheduleNext(nextRemainingMs);
      }, millisecondsUntilVisibleSecondChange(remainingMs));
    };
    const handleVisibilityChange = () => {
      clearScheduledUpdate();
      if (!pageIsVisible()) {
        return;
      }
      const nextRemainingMs = remainingNow();
      publish(nextRemainingMs);
      scheduleNext(nextRemainingMs);
    };

    scheduleNext(remainingNow());
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearScheduledUpdate();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [room.phase, room.serverTime, roundDeadlineAt, roundId]);

  if (!round) {
    return null;
  }
  if (room.phase === 'ROUND_ENDED') {
    return 0;
  }
  if (countdown?.snapshotKey !== snapshotKey) {
    return calculateVisibleRoundSeconds(
      calculateRemainingRoundMs(room.serverTime, round.deadlineAt, 0),
    );
  }
  return countdown.seconds;
}

type DeadlineState = {
  roundId: string;
  reached: boolean;
};

/**
 * A single deadline gate for phone input. This is independent from the visual
 * countdown, remains scheduled while hidden, and rechecks immediately when the
 * page becomes visible in case the browser suspended hidden-page timers.
 */
export function useRoundDeadlineReached(
  room: RoomState,
  enabled = true,
): boolean {
  const round = room.round;
  const roundId = round?.id ?? null;
  const roundDeadlineAt = round?.deadlineAt ?? null;
  const [deadline, setDeadline] = useState<DeadlineState | null>(null);

  useEffect(() => {
    if (
      !enabled ||
      !roundId ||
      !roundDeadlineAt ||
      room.phase !== 'ROUND_ACTIVE'
    ) {
      return;
    }

    const anchor = performance.now();
    let timeout: number | null = null;
    const clearDeadline = () => {
      if (timeout !== null) {
        window.clearTimeout(timeout);
        timeout = null;
      }
    };
    const remainingNow = () =>
      calculateRemainingRoundMs(
        room.serverTime,
        roundDeadlineAt,
        performance.now() - anchor,
      );
    const checkDeadline = () => {
      clearDeadline();
      const remainingMs = remainingNow();
      if (remainingMs <= 0) {
        setDeadline((current) =>
          current?.roundId === roundId && current.reached
            ? current
            : { roundId, reached: true },
        );
        return;
      }
      timeout = window.setTimeout(checkDeadline, remainingMs);
    };
    const handleVisibilityChange = () => {
      if (pageIsVisible()) {
        checkDeadline();
      }
    };

    checkDeadline();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearDeadline();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, room.phase, room.serverTime, roundDeadlineAt, roundId]);

  if (!enabled) {
    return false;
  }
  if (!round || room.phase !== 'ROUND_ACTIVE') {
    return room.phase === 'ROUND_ENDED';
  }
  if (deadline?.roundId !== round.id) {
    return (
      calculateRemainingRoundMs(room.serverTime, round.deadlineAt, 0) === 0
    );
  }
  return deadline.reached;
}
