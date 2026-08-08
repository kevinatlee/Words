export const RESULT_FIREWORK_COLORS = [
  'var(--mint)',
  'var(--coral)',
  'var(--sun)',
  'var(--blue)',
  'var(--paper)',
] as const;

export type ResultFirework = {
  color: (typeof RESULT_FIREWORK_COLORS)[number];
  delay: number;
  scale: number;
  x: number;
  y: number;
};

const BURST_COUNT = 24;
const CLUSTER_COUNT = 9;
const HORIZONTAL_REGIONS = [
  [5, 35],
  [35, 65],
  [65, 95],
] as const;
const VERTICAL_REGIONS = [
  [8, 36],
  [36, 64],
  [64, 92],
] as const;

function createRandom(roundNumber: number): () => number {
  let state = (Math.floor(roundNumber) >>> 0) ^ 0x9e3779b9;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledRegions(random: () => number): number[] {
  const regions = Array.from({ length: 9 }, (_, index) => index);

  for (let index = regions.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [regions[index], regions[swapIndex]] = [
      regions[swapIndex]!,
      regions[index]!,
    ];
  }

  return regions;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function generateResultFireworks(roundNumber: number): ResultFirework[] {
  const random = createRandom(roundNumber);
  const regions = shuffledRegions(random);
  const clusterSizes = Array.from({ length: CLUSTER_COUNT }, () => 2);

  for (const cluster of shuffledRegions(random).slice(0, BURST_COUNT - 18)) {
    clusterSizes[cluster] = 3;
  }

  return clusterSizes.flatMap((clusterSize, clusterIndex) => {
    const baseDelay =
      clusterIndex === 0
        ? 0.2 + random() * 0.15
        : 0.25 + clusterIndex * 1.6 + (random() - 0.5) * 0.3;

    return Array.from({ length: clusterSize }, (_, burstIndex) => {
      const region = regions[(clusterIndex * 3 + burstIndex) % regions.length]!;
      const [minX, maxX] = HORIZONTAL_REGIONS[region % 3]!;
      const [minY, maxY] = VERTICAL_REGIONS[Math.floor(region / 3)]!;

      return {
        color:
          RESULT_FIREWORK_COLORS[
            Math.floor(random() * RESULT_FIREWORK_COLORS.length)
          ]!,
        delay: rounded(baseDelay + random() * 0.28),
        scale: rounded(0.85 + random() * 0.3),
        x: rounded(minX + random() * (maxX - minX)),
        y: rounded(minY + random() * (maxY - minY)),
      };
    });
  });
}
