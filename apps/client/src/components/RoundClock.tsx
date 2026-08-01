import type { RoomState } from '@words/shared';

import { useVisibleRoundCountdown } from '../useRoundCountdown';

type RoundClockProps = {
  room: RoomState;
  presentation: 'display' | 'phone';
};

export function RoundClock({ room, presentation }: RoundClockProps) {
  const seconds = useVisibleRoundCountdown(room) ?? 0;

  if (!room.round) {
    return null;
  }

  if (presentation === 'display') {
    if (room.phase !== 'ROUND_ACTIVE') {
      return null;
    }
    return (
      <div
        className="display-highlights-timer"
        role="timer"
        aria-live="off"
        aria-label={`${seconds} seconds remaining`}
      >
        <span className="display-highlights-timer__label">Timer</span>
        <strong className="display-highlights-timer__value">{seconds}</strong>
      </div>
    );
  }

  return (
    <div
      className="round-clock round-clock--phone"
      role="timer"
      aria-live={room.phase === 'ROUND_ACTIVE' ? 'off' : 'polite'}
    >
      <small>
        {room.phase === 'ROUND_ACTIVE' ? 'Timer' : 'Round Complete'}
      </small>
      <strong>{seconds} seconds</strong>
    </div>
  );
}
