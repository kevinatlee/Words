import { type BoardSize } from '@words/game-engine';

import {
  selectBoardFromCandidates,
  type BoardSelectionResult,
  type BoardSelectorOptions,
  type RankedBoardCandidate,
} from './board-selector.js';

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

export type SelectMedianBoardOptions = BoardSelectorOptions;

export type MedianBoardSelectionResult = BoardSelectionResult;

export function selectMedianBoard(
  options: SelectMedianBoardOptions,
): MedianBoardSelectionResult {
  const target = MEDIAN_BOARD_TARGETS[options.size];
  return selectBoardFromCandidates(options, {
    defaultCandidatePoolSize: MEDIAN_BOARD_CANDIDATE_POOL_SIZE,
    maximumCandidatePoolSize: MAXIMUM_MEDIAN_BOARD_CANDIDATE_POOL_SIZE,
    compareCandidates: (left, right) => compareCandidates(left, right, target),
  });
}

function compareCandidates(
  left: RankedBoardCandidate,
  right: RankedBoardCandidate,
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
