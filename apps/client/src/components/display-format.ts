export function formatDisplaySettings(size: number, seconds: number): string {
  const durations: Record<number, string> = {
    30: '30 seconds',
    60: '1 minute',
    90: '1½ minutes',
    120: '2 minutes',
    150: '2½ minutes',
    180: '3 minutes',
  };

  return `${size}×${size} • ${durations[seconds] ?? `${seconds} seconds`}`;
}
