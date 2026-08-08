import { describe, expect, it } from 'vitest';
import {
  generateResultFireworks,
  RESULT_FIREWORK_COLORS,
} from './result-fireworks';

describe('generateResultFireworks', () => {
  it('creates a stable, varied, balanced result show for each round', () => {
    const first = generateResultFireworks(5);

    expect(first).toHaveLength(24);
    expect(generateResultFireworks(5)).toEqual(first);
    expect(generateResultFireworks(6)).not.toEqual(first);
    expect(first.every(({ x }) => x >= 5 && x <= 95)).toBe(true);
    expect(first.every(({ y }) => y >= 8 && y <= 92)).toBe(true);
    expect(
      new Set(first.map(({ x }) => (x < 35 ? 0 : x < 65 ? 1 : 2))).size,
    ).toBe(3);
    expect(
      new Set(first.map(({ y }) => (y < 36 ? 0 : y < 64 ? 1 : 2))).size,
    ).toBe(3);
  });

  it('keeps short burst clusters within the results window', () => {
    const delays = generateResultFireworks(8)
      .map(({ delay }) => delay)
      .sort((left, right) => left - right);
    const gaps = delays.slice(1).map((delay, index) => delay - delays[index]!);

    expect(delays[0]).toBeGreaterThanOrEqual(0.2);
    expect(delays.at(-1)).toBeLessThanOrEqual(13.5);
    expect(gaps.filter((gap) => gap <= 0.3)).toHaveLength(15);
    expect(new Set(gaps.map((gap) => gap.toFixed(2))).size).toBeGreaterThan(2);
  });

  it('uses only restrained scale values and approved palette colors', () => {
    const fireworks = generateResultFireworks(12);

    expect(fireworks.every(({ scale }) => scale >= 0.85 && scale <= 1.15)).toBe(
      true,
    );
    expect(
      fireworks.every(({ color }) => RESULT_FIREWORK_COLORS.includes(color)),
    ).toBe(true);
  });
});
