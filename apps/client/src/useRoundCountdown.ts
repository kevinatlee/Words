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

export function useRoundCountdown(room: RoomState): number | null {
  const round = room.round;
  const snapshotKey = round ? `${round.id}:${room.serverTime}` : null;
  const [countdown, setCountdown] = useState<{
    snapshotKey: string;
    remainingMs: number;
  } | null>(null);

  useEffect(() => {
    if (!round || room.phase !== 'ROUND_ACTIVE') {
      return;
    }

    const anchor = performance.now();
    const update = () => {
      setCountdown({
        snapshotKey: `${round.id}:${room.serverTime}`,
        remainingMs: calculateRemainingRoundMs(
          room.serverTime,
          round.deadlineAt,
          performance.now() - anchor,
        ),
      });
    };

    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [room.phase, room.serverTime, round]);

  if (!round) {
    return null;
  }
  if (room.phase === 'ROUND_ENDED') {
    return 0;
  }
  if (countdown?.snapshotKey !== snapshotKey) {
    return calculateRemainingRoundMs(room.serverTime, round.deadlineAt, 0);
  }
  return countdown.remainingMs;
}
