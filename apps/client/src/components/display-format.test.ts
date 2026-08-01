import { describe, expect, it } from 'vitest';

import { formatDisplaySettings } from './display-format';

describe('formatDisplaySettings', () => {
  it.each([
    [4, 30, '4×4 • 30 seconds'],
    [5, 60, '5×5 • 1 minute'],
    [5, 90, '5×5 • 1½ minutes'],
    [5, 120, '5×5 • 2 minutes'],
    [5, 150, '5×5 • 2½ minutes'],
    [6, 180, '6×6 • 3 minutes'],
  ])('formats %sx%s seconds', (size, seconds, expected) => {
    expect(formatDisplaySettings(size, seconds)).toBe(expected);
  });
});
