import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { generateBoard, type RandomSource } from '@words/game-engine';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DISTRIBUTION_METADATA,
  DEFAULT_TILE_DISTRIBUTION,
} from '../src/index.js';

const EXPECTED_TOKEN_WEIGHTS = Object.freeze([
  ['A', 49_322],
  ['B', 13_232],
  ['C', 27_382],
  ['D', 25_850],
  ['E', 74_285],
  ['F', 9_511],
  ['G', 20_260],
  ['H', 15_153],
  ['I', 56_041],
  ['J', 1_230],
  ['K', 6_343],
  ['L', 35_167],
  ['M', 18_097],
  ['N', 46_103],
  ['O', 40_728],
  ['P', 19_476],
  ['QU', 1_229],
  ['R', 48_891],
  ['S', 57_352],
  ['T', 45_407],
  ['U', 22_662],
  ['V', 6_938],
  ['W', 6_160],
  ['X', 1_852],
  ['Y', 10_652],
  ['Z', 2_884],
] as const);

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

  it('independently derives every fixed capped-at-two token weight', async () => {
    const words = (
      await readFile(
        new URL('../data/dictionary/words.txt', import.meta.url),
        'ascii',
      )
    )
      .slice(0, -1)
      .split('\n');
    const counts = Object.fromEntries(
      [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((letter) => [letter, 0]),
    ) as Record<string, number>;

    for (const word of words) {
      const perWord = new Map<string, number>();
      for (const letter of word) {
        perWord.set(letter, (perWord.get(letter) ?? 0) + 1);
      }
      for (const [letter, count] of perWord) {
        counts[letter] = (counts[letter] ?? 0) + Math.min(2, count);
      }
    }

    const independentlyDerived = EXPECTED_TOKEN_WEIGHTS.map(([token]) => [
      token,
      counts[token === 'QU' ? 'Q' : token],
    ]);
    expect(independentlyDerived).toEqual(EXPECTED_TOKEN_WEIGHTS);
    expect(
      DEFAULT_TILE_DISTRIBUTION.map(({ token, weight }) => [token, weight]),
    ).toEqual(EXPECTED_TOKEN_WEIGHTS);
    expect(counts.U).toBe(22_662);
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
