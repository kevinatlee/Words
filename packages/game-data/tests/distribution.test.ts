import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { generateBoard, type RandomSource } from '@words/game-engine';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DISTRIBUTION_METADATA,
  DEFAULT_TILE_DISTRIBUTION,
} from '../src/index.js';

function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return {
    next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4_294_967_296;
    },
  };
}

describe('generated production distribution', () => {
  it('contains unique positive safe-integer tokens with the QU policy', () => {
    const tokens = DEFAULT_TILE_DISTRIBUTION.map(({ token }) => token);

    expect(new Set(tokens).size).toBe(tokens.length);
    expect(
      DEFAULT_TILE_DISTRIBUTION.every(
        ({ weight }) => Number.isSafeInteger(weight) && weight > 0,
      ),
    ).toBe(true);
    expect(tokens).toContain('QU');
    expect(tokens).not.toContain('Q');
    expect(tokens).toContain('U');
  });

  it('matches totals, dictionary input, and the generated profile hash', async () => {
    const total = DEFAULT_TILE_DISTRIBUTION.reduce(
      (sum, { weight }) => sum + weight,
      0,
    );
    const dictionaryManifest = JSON.parse(
      await readFile(
        new URL('../data/dictionary/manifest.json', import.meta.url),
        'utf8',
      ),
    ) as { sha256: string };
    const profile = JSON.parse(
      await readFile(
        new URL('../data/distribution/profile.json', import.meta.url),
        'utf8',
      ),
    ) as Record<string, unknown>;
    const { profileSha256, ...profileCore } = profile;
    const actualProfileHash = createHash('sha256')
      .update(JSON.stringify(profileCore))
      .digest('hex');

    expect(total).toBe(DEFAULT_DISTRIBUTION_METADATA.totalWeight);
    expect(DEFAULT_DISTRIBUTION_METADATA.dictionarySha256).toBe(
      dictionaryManifest.sha256,
    );
    expect(profileSha256).toBe(actualProfileHash);
    expect(DEFAULT_DISTRIBUTION_METADATA.profileSha256).toBe(actualProfileHash);
  });

  it('is deeply immutable and records no manual adjustment', () => {
    expect(Object.isFrozen(DEFAULT_TILE_DISTRIBUTION)).toBe(true);
    expect(
      DEFAULT_TILE_DISTRIBUTION.every((entry) => Object.isFrozen(entry)),
    ).toBe(true);
    expect(DEFAULT_DISTRIBUTION_METADATA.adjustments).toEqual([]);
    expect(Object.isFrozen(DEFAULT_DISTRIBUTION_METADATA.adjustments)).toBe(
      true,
    );
  });

  it('converges toward expected rates under deterministic sampling', () => {
    const counts = Object.fromEntries(
      DEFAULT_TILE_DISTRIBUTION.map(({ token }) => [token, 0]),
    ) as Record<string, number>;
    const boardCount = 5_000;
    const size = 6;
    const random = seededRandom(0x4c11a9f3);
    for (let index = 0; index < boardCount; index += 1) {
      const result = generateBoard({
        size,
        distribution: DEFAULT_TILE_DISTRIBUTION,
        random,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        for (const token of result.board.tiles) {
          counts[token] = (counts[token] ?? 0) + 1;
        }
      }
    }

    const totalTiles = boardCount * size * size;
    for (const { token, weight } of DEFAULT_TILE_DISTRIBUTION) {
      const expected = weight / DEFAULT_DISTRIBUTION_METADATA.totalWeight;
      const observed = (counts[token] ?? 0) / totalTiles;
      expect(Math.abs(observed - expected)).toBeLessThan(0.002);
    }
  });

  it('records only dictionary-derived candidate methods', async () => {
    const report = await readFile(
      new URL('../data/distribution/candidates.json', import.meta.url),
      'utf8',
    );

    expect(report).toContain('raw-character-frequency');
    expect(report).toContain('per-word-presence');
    expect(report).toContain('per-word-capped-occurrence-2');
    expect(report.toLowerCase()).not.toContain('scrabble');
    expect(report.toLowerCase()).not.toContain('boggle');
  });
});
