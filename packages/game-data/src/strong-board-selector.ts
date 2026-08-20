import {
  selectBoardFromCandidates,
  type BoardSelectionResult,
  type BoardSelectorOptions,
  type RankedBoardCandidate,
} from './board-selector.js';

export const STRONG_BOARD_CANDIDATE_POOL_SIZE = 32;
export const MAXIMUM_STRONG_BOARD_CANDIDATE_POOL_SIZE = 32;

export type SelectStrongBoardOptions = BoardSelectorOptions;

export type StrongBoardSelectionResult = BoardSelectionResult;

export function selectStrongBoard(
  options: SelectStrongBoardOptions,
): StrongBoardSelectionResult {
  return selectBoardFromCandidates(options, {
    defaultCandidatePoolSize: STRONG_BOARD_CANDIDATE_POOL_SIZE,
    maximumCandidatePoolSize: MAXIMUM_STRONG_BOARD_CANDIDATE_POOL_SIZE,
    compareCandidates: compareStrongCandidates,
  });
}

function compareStrongCandidates(
  left: RankedBoardCandidate,
  right: RankedBoardCandidate,
): number {
  return (
    right.metrics.playableWordCount - left.metrics.playableWordCount ||
    right.metrics.cellCoverage - left.metrics.cellCoverage ||
    left.index - right.index
  );
}
