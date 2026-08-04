import {
  type Board,
  type BoardGenerationResult,
  type BoardSize,
  type RandomSource,
  type WordDictionary,
} from '@words/game-engine';

import {
  createBoardPlayabilitySolver,
  type BoardPlayabilityMetrics,
  type BoardPlayabilitySolver,
} from './board-playability.js';
import { generateDefaultBoard } from './board-profile.js';

export const MEDIAN_BOARD_CANDIDATE_POOL_SIZE = 8;
export const MAXIMUM_MEDIAN_BOARD_CANDIDATE_POOL_SIZE = 12;

export interface MedianBoardTarget {
  readonly playableWordCount: number;
  readonly longPlayableWordCount: number;
}

export const MEDIAN_BOARD_TARGETS: Readonly<
  Record<BoardSize, MedianBoardTarget>
> = Object.freeze({
  4: Object.freeze({ playableWordCount: 72, longPlayableWordCount: 18 }),
  5: Object.freeze({ playableWordCount: 153, longPlayableWordCount: 51 }),
  6: Object.freeze({ playableWordCount: 262, longPlayableWordCount: 101 }),
});

type CandidateGenerator = (options: {
  readonly size: BoardSize;
  readonly random: RandomSource;
}) => BoardGenerationResult;

export interface SelectMedianBoardOptions {
  readonly size: BoardSize;
  readonly random: RandomSource;
  readonly dictionary: WordDictionary;
  readonly dictionaryWords: readonly string[];
  readonly candidatePoolSize?: number;
  readonly generateCandidate?: CandidateGenerator;
  readonly solver?: BoardPlayabilitySolver;
}

export type MedianBoardSelectionResult =
  | {
      readonly success: true;
      readonly board: Board;
      readonly attempts: number;
      readonly totalGenerationAttempts: number;
      readonly successfulCandidateCount: number;
      readonly selectedCandidateIndex: number;
      readonly selectedMetrics: BoardPlayabilityMetrics;
    }
  | {
      readonly success: false;
      readonly code: 'NO_ACCEPTABLE_BOARD';
      readonly attempts: number;
    };

interface RankedCandidate {
  readonly board: Board;
  readonly generationAttempts: number;
  readonly index: number;
  readonly metrics: BoardPlayabilityMetrics;
}

export function selectMedianBoard(
  options: SelectMedianBoardOptions,
): MedianBoardSelectionResult {
  const candidatePoolSize =
    options.candidatePoolSize ?? MEDIAN_BOARD_CANDIDATE_POOL_SIZE;
  if (
    !Number.isInteger(candidatePoolSize) ||
    candidatePoolSize < 1 ||
    candidatePoolSize > MAXIMUM_MEDIAN_BOARD_CANDIDATE_POOL_SIZE
  ) {
    throw new RangeError(
      `candidatePoolSize must be an integer from 1 to ${MAXIMUM_MEDIAN_BOARD_CANDIDATE_POOL_SIZE}.`,
    );
  }

  const generateCandidate = options.generateCandidate ?? generateDefaultBoard;
  const solver =
    options.solver ??
    createBoardPlayabilitySolver(options.dictionary, options.dictionaryWords);
  const candidates: RankedCandidate[] = [];
  let attempts = 0;

  for (let index = 0; index < candidatePoolSize; index += 1) {
    try {
      const generated = generateCandidate({
        size: options.size,
        random: options.random,
      });
      attempts += generated.attempts;
      if (!generated.success) {
        continue;
      }
      candidates.push({
        board: generated.board,
        generationAttempts: generated.attempts,
        index,
        metrics: solver.measure(generated.board),
      });
    } catch {
      // One bad candidate must not discard other accepted candidates.
    }
  }

  if (candidates.length === 0) {
    return Object.freeze({
      success: false,
      code: 'NO_ACCEPTABLE_BOARD',
      attempts,
    });
  }

  const target = MEDIAN_BOARD_TARGETS[options.size];
  candidates.sort((left, right) => compareCandidates(left, right, target));
  const selected = candidates[0]!;
  return Object.freeze({
    success: true,
    board: selected.board,
    attempts: selected.generationAttempts,
    totalGenerationAttempts: attempts,
    successfulCandidateCount: candidates.length,
    selectedCandidateIndex: selected.index,
    selectedMetrics: selected.metrics,
  });
}

function compareCandidates(
  left: RankedCandidate,
  right: RankedCandidate,
  target: MedianBoardTarget,
): number {
  return (
    normalizedDeviation(
      left.metrics.playableWordCount,
      target.playableWordCount,
    ) -
      normalizedDeviation(
        right.metrics.playableWordCount,
        target.playableWordCount,
      ) ||
    normalizedDeviation(
      left.metrics.longPlayableWordCount,
      target.longPlayableWordCount,
    ) -
      normalizedDeviation(
        right.metrics.longPlayableWordCount,
        target.longPlayableWordCount,
      ) ||
    right.metrics.cellCoverage - left.metrics.cellCoverage ||
    left.metrics.largestRepeatedTokenComponent -
      right.metrics.largestRepeatedTokenComponent ||
    left.index - right.index
  );
}

function normalizedDeviation(value: number, target: number): number {
  return Math.abs(value - target) / target;
}
