import { describe, expect, it } from 'vitest';

import { productConfig } from './config';
import { formatRoundDuration } from './duration';

describe('product configuration', () => {
  it('keeps public identity and production values centralized', () => {
    expect(productConfig).toMatchObject({
      productName: 'Words',
      version: '0.2.0',
      publicUrl: 'https://words.atlee.io',
      productionPort: 6532,
      defaultGridSize: 4,
      defaultRoundDurationSeconds: 180,
      defaultScoringMode: 'traditional',
      maxPlayers: 8,
      reconnectGraceSeconds: 60,
      roomTtlMinutes: 120,
    });
  });

  it('supports every planned grid size and no fixed sixteen-tile assumption', () => {
    expect(productConfig.supportedGridSizes).toEqual([4, 5, 6]);
    expect(productConfig.supportedGridSizes.map((size) => size * size)).toEqual(
      [16, 25, 36],
    );
  });

  it('provides a readable label for every allowed duration', () => {
    expect(
      productConfig.supportedRoundDurationsSeconds.map(formatRoundDuration),
    ).toEqual([
      '30 seconds',
      '1 minute',
      '1 minute 30 seconds',
      '2 minutes',
      '2 minutes 30 seconds',
      '3 minutes',
    ]);
  });
});
