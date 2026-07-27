import type { RoundDurationSeconds } from './config';

const durationLabels: Record<RoundDurationSeconds, string> = {
  30: '30 seconds',
  60: '1 minute',
  90: '1 minute 30 seconds',
  120: '2 minutes',
  150: '2 minutes 30 seconds',
  180: '3 minutes',
};

export function formatRoundDuration(duration: RoundDurationSeconds): string {
  return durationLabels[duration];
}
