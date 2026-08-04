import {
  createWordDictionary,
  generateBoard,
  getAdjacentIndices,
  type Board,
  type BoardSize,
  type RandomSource,
  type TileToken,
  type WordDictionary,
} from '@words/game-engine';

import { DEFAULT_TILE_DISTRIBUTION, generateDefaultBoard } from './index.js';
import { createBoardPlayabilitySolver } from './board-playability.js';

export const RESEARCH_SEED = 'board-quality-v1';
export const RESEARCH_SIZES = Object.freeze([4, 5, 6] as const);
export const BOARDS_PER_SIZE = 5_000;
export const VOWEL_TOKENS = Object.freeze(['A', 'E', 'I', 'O', 'U']);

export type ResearchBoardSize = (typeof RESEARCH_SIZES)[number];

export interface ResearchBoardMetrics {
  readonly size: BoardSize;
  readonly board: readonly TileToken[];
  readonly attempts: number;
  readonly tokenCount: number;
  readonly tokenCounts: Readonly<Record<string, number>>;
  readonly vowelCount: number;
  readonly vowelRatio: number;
  readonly vowelRows: number;
  readonly vowelColumns: number;
  readonly vowelQuadrants: number;
  readonly maximumVowelsIn2x2: number;
  readonly maximumVowelsIn3x3: number;
  readonly largestVowelComponent: number;
  readonly maximumDistanceToVowel: number;
  readonly maximumRepeatedTokenCount: number;
  readonly largestRepeatedTokenComponent: number;
  readonly repeatedTokenAdjacentEdges: number;
  readonly maximumRepeatedTokensIn2x2: number;
  readonly maximumRepeatedTokensIn3x3: number;
  readonly playableWordCount: number;
  readonly longPlayableWordCount: number;
  readonly wordCountsByLength: Readonly<Record<string, number>>;
  readonly longestWordLength: number;
  readonly totalPossibleScore: number;
  readonly cellCoverage: number;
  readonly startingCellCount: number;
  readonly representativeLongestWords: readonly string[];
}

export interface SeededRandom extends RandomSource {
  readonly seed: string;
}

export function createSeededRandom(seed: string): SeededRandom {
  let state = hashSeed(seed);
  return {
    seed,
    next(): number {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 0x1_0000_0000;
    },
  };
}

export function createResearchDictionary(
  words: readonly string[],
): WordDictionary {
  const result = createWordDictionary(words);
  if (!result.success) {
    throw new Error(
      `Invalid production dictionary entry at ${result.entryIndex}.`,
    );
  }
  return result.dictionary;
}

export function analyzeBoard(
  board: Board,
  dictionary: WordDictionary,
  dictionaryWords: readonly string[],
  attempts = 1,
): ResearchBoardMetrics {
  const composition = measureComposition(board);
  const repetition = measureRepetition(board);
  const playability = createBoardPlayabilitySolver(
    dictionary,
    dictionaryWords,
  ).analyze(board);
  return Object.freeze({
    size: board.size,
    board: Object.freeze([...board.tiles]),
    attempts,
    tokenCount: board.tiles.length,
    ...composition,
    ...repetition,
    ...playability,
  });
}

export function generateResearchBoards(
  size: ResearchBoardSize,
  count: number,
  seed: string,
): readonly { readonly board: Board; readonly attempts: number }[] {
  const random = createSeededRandom(`${seed}:${size}`);
  const boards: { board: Board; attempts: number }[] = [];
  while (boards.length < count) {
    const result = generateDefaultBoard({ size, random });
    if (!result.success)
      throw new Error(`Board generation failed for ${size}.`);
    boards.push({ board: result.board, attempts: result.attempts });
  }
  return Object.freeze(boards);
}

export function percentile(
  values: readonly number[],
  percentage: number,
): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * (percentage / 100);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

export function summarizeMetric(
  rows: readonly ResearchBoardMetrics[],
  field: keyof ResearchBoardMetrics,
): Record<string, number> {
  const values = rows.map((row) => {
    const value = row[field];
    return typeof value === 'number' ? value : 0;
  });
  return summarizeValues(values);
}

export function summarizeValues(
  values: readonly number[],
): Record<string, number> {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean,
    standardDeviation: Math.sqrt(variance),
    p1: percentile(values, 1),
    p5: percentile(values, 5),
    p10: percentile(values, 10),
    p25: percentile(values, 25),
    p50: percentile(values, 50),
    p75: percentile(values, 75),
    p90: percentile(values, 90),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
  };
}

export function correlation(
  rows: readonly ResearchBoardMetrics[],
  first: keyof ResearchBoardMetrics,
  second: keyof ResearchBoardMetrics,
): number {
  const pairs: [number, number][] = [];
  rows.forEach((row) => {
    const a = row[first];
    const b = row[second];
    if (typeof a === 'number' && typeof b === 'number') pairs.push([a, b]);
  });
  const meanA = pairs.reduce((sum, [value]) => sum + value, 0) / pairs.length;
  const meanB = pairs.reduce((sum, [, value]) => sum + value, 0) / pairs.length;
  const numerator = pairs.reduce(
    (sum, [a, b]) => sum + (a - meanA) * (b - meanB),
    0,
  );
  const denominatorA = Math.sqrt(
    pairs.reduce((sum, [a]) => sum + (a - meanA) ** 2, 0),
  );
  const denominatorB = Math.sqrt(
    pairs.reduce((sum, [, b]) => sum + (b - meanB) ** 2, 0),
  );
  return denominatorA === 0 || denominatorB === 0
    ? 0
    : numerator / (denominatorA * denominatorB);
}

export function selectSamples(rows: readonly ResearchBoardMetrics[]) {
  const poorVowels = [...rows].sort(
    (a, b) =>
      a.vowelQuadrants - b.vowelQuadrants ||
      b.largestVowelComponent - a.largestVowelComponent ||
      b.maximumDistanceToVowel - a.maximumDistanceToVowel,
  );
  const weakWords = [...rows].sort(
    (a, b) =>
      a.playableWordCount - b.playableWordCount ||
      a.cellCoverage - b.cellCoverage,
  );
  const median = [...rows].sort(
    (a, b) =>
      Math.abs(
        a.playableWordCount -
          percentile(
            rows.map((r) => r.playableWordCount),
            50,
          ),
      ) -
      Math.abs(
        b.playableWordCount -
          percentile(
            rows.map((r) => r.playableWordCount),
            50,
          ),
      ),
  );
  const strong = [...rows].sort(
    (a, b) =>
      b.playableWordCount - a.playableWordCount ||
      b.cellCoverage - a.cellCoverage,
  );
  const selected: ResearchBoardMetrics[] = [];
  const add = (candidate: ResearchBoardMetrics | undefined) => {
    if (candidate && !selected.includes(candidate)) selected.push(candidate);
  };
  poorVowels.slice(0, 3).forEach(add);
  weakWords.forEach((row) => selected.length < 6 && add(row));
  median.forEach((row) => selected.length < 9 && add(row));
  strong.forEach((row) => selected.length < 12 && add(row));
  return Object.freeze(selected.slice(0, 12));
}

function measureComposition(board: Board) {
  const tokenCounts: Record<string, number> = {};
  board.tiles.forEach((token) => {
    tokenCounts[token] = (tokenCounts[token] ?? 0) + 1;
  });
  const vowels = board.tiles.map((token) => VOWEL_TOKENS.includes(token));
  const rows = new Set<number>();
  const columns = new Set<number>();
  const quadrants = new Set<number>();
  vowels.forEach((isVowel, index) => {
    if (!isVowel) return;
    const row = Math.floor(index / board.size);
    const column = index % board.size;
    rows.add(row);
    columns.add(column);
    const center = (board.size - 1) / 2;
    const verticalHalves = [
      ...(row < center ? [0] : []),
      ...(row > center ? [1] : []),
    ];
    const horizontalHalves = [
      ...(column < center ? [0] : []),
      ...(column > center ? [1] : []),
    ];
    verticalHalves.forEach((vertical) =>
      horizontalHalves.forEach((horizontal) =>
        quadrants.add(vertical * 2 + horizontal),
      ),
    );
  });
  return {
    tokenCounts: Object.freeze(tokenCounts),
    vowelCount: vowels.filter(Boolean).length,
    vowelRatio: vowels.filter(Boolean).length / vowels.length,
    vowelRows: rows.size,
    vowelColumns: columns.size,
    vowelQuadrants: quadrants.size,
    maximumVowelsIn2x2: maximumWindow(board, 2, (token) =>
      VOWEL_TOKENS.includes(token),
    ),
    maximumVowelsIn3x3: maximumWindow(board, 3, (token) =>
      VOWEL_TOKENS.includes(token),
    ),
    largestVowelComponent: largestComponent(board, (token) =>
      VOWEL_TOKENS.includes(token),
    ),
    maximumDistanceToVowel: maximumDistanceTo(board, (token) =>
      VOWEL_TOKENS.includes(token),
    ),
  };
}

function measureRepetition(board: Board) {
  const counts = new Map<string, number>();
  board.tiles.forEach((token) =>
    counts.set(token, (counts.get(token) ?? 0) + 1),
  );
  const tokens = [...counts.keys()];
  let adjacentEdges = 0;
  board.tiles.forEach((token, index) => {
    adjacentEdges += getAdjacentIndices(board.size, index).filter(
      (neighbor) => neighbor > index && board.tiles[neighbor] === token,
    ).length;
  });
  return {
    maximumRepeatedTokenCount: Math.max(0, ...counts.values()),
    largestRepeatedTokenComponent: Math.max(
      0,
      ...tokens.map((repeatedToken) =>
        largestComponent(board, (token) => token === repeatedToken),
      ),
    ),
    repeatedTokenAdjacentEdges: adjacentEdges,
    maximumRepeatedTokensIn2x2: Math.max(
      0,
      ...tokens.map((repeatedToken) =>
        maximumWindow(board, 2, (token) => token === repeatedToken),
      ),
    ),
    maximumRepeatedTokensIn3x3: Math.max(
      0,
      ...tokens.map((repeatedToken) =>
        maximumWindow(board, 3, (token) => token === repeatedToken),
      ),
    ),
  };
}

function maximumWindow(
  board: Board,
  windowSize: number,
  predicate: (token: string) => boolean,
): number {
  let maximum = 0;
  for (let row = 0; row <= board.size - windowSize; row += 1) {
    for (let column = 0; column <= board.size - windowSize; column += 1) {
      let count = 0;
      for (let rowOffset = 0; rowOffset < windowSize; rowOffset += 1) {
        for (
          let columnOffset = 0;
          columnOffset < windowSize;
          columnOffset += 1
        ) {
          if (
            predicate(
              board.tiles[
                (row + rowOffset) * board.size + column + columnOffset
              ]!,
            )
          )
            count += 1;
        }
      }
      maximum = Math.max(maximum, count);
    }
  }
  return maximum;
}

function largestComponent(
  board: Board,
  predicate: (token: string) => boolean,
): number {
  const seen = new Set<number>();
  let maximum = 0;
  board.tiles.forEach((token, start) => {
    if (!predicate(token) || seen.has(start)) return;
    const queue = [start];
    seen.add(start);
    let size = 0;
    while (queue.length) {
      const index = queue.shift()!;
      size += 1;
      getAdjacentIndices(board.size, index).forEach((neighbor) => {
        if (!seen.has(neighbor) && predicate(board.tiles[neighbor]!)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      });
    }
    maximum = Math.max(maximum, size);
  });
  return maximum;
}

function maximumDistanceTo(
  board: Board,
  predicate: (token: string) => boolean,
): number {
  const sources = board.tiles.flatMap((token, index) =>
    predicate(token) ? [index] : [],
  );
  if (sources.length === 0) return board.tiles.length;
  return Math.max(
    ...board.tiles.map((_, index) => {
      const coordinate = {
        row: Math.floor(index / board.size),
        column: index % board.size,
      };
      return Math.min(
        ...sources.map((source) => {
          const sourceCoordinate = {
            row: Math.floor(source / board.size),
            column: source % board.size,
          };
          return Math.max(
            Math.abs(coordinate.row - sourceCoordinate.row),
            Math.abs(coordinate.column - sourceCoordinate.column),
          );
        }),
      );
    }),
  );
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const character of seed)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash || 0x9e3779b9) >>> 0;
}

export function productionDistributionIdentity() {
  return DEFAULT_TILE_DISTRIBUTION.map(({ token, weight }) => ({
    token,
    weight,
  }));
}

export function generateRawBoard(
  size: ResearchBoardSize,
  random: RandomSource,
): Board {
  const result = generateBoard({
    size,
    distribution: DEFAULT_TILE_DISTRIBUTION,
    random,
  });
  if (!result.success) throw new Error('Raw research board generation failed.');
  return result.board;
}
