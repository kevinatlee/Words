import type {
  Board,
  BoardGenerationResult,
  BoardSize,
  RandomSource,
  WordDictionary,
} from '@words/game-engine';

import {
  createBoardPlayabilitySolver,
  type BoardPlayabilityMetrics,
  type BoardPlayabilitySolver,
} from './board-playability.js';
import { generateDefaultBoard } from './board-profile.js';

type CandidateGenerator = (options: {
  readonly size: BoardSize;
  readonly random: RandomSource;
}) => BoardGenerationResult;

export interface BoardSelectorOptions {
  readonly size: BoardSize;
  readonly random: RandomSource;
  readonly dictionary: WordDictionary;
  readonly dictionaryWords: readonly string[];
  readonly candidatePoolSize?: number;
  readonly generateCandidate?: CandidateGenerator;
  readonly solver?: BoardPlayabilitySolver;
}

export type BoardSelectionResult =
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

export interface RankedBoardCandidate {
  readonly board: Board;
  readonly generationAttempts: number;
  readonly index: number;
  readonly metrics: BoardPlayabilityMetrics;
}

interface BoardSelectorConfig {
  readonly defaultCandidatePoolSize: number;
  readonly maximumCandidatePoolSize: number;
  readonly compareCandidates: (
    left: RankedBoardCandidate,
    right: RankedBoardCandidate,
  ) => number;
}

export function selectBoardFromCandidates(
  options: BoardSelectorOptions,
  config: BoardSelectorConfig,
): BoardSelectionResult {
  const candidatePoolSize =
    options.candidatePoolSize ?? config.defaultCandidatePoolSize;
  if (
    !Number.isInteger(candidatePoolSize) ||
    candidatePoolSize < 1 ||
    candidatePoolSize > config.maximumCandidatePoolSize
  ) {
    throw new RangeError(
      `candidatePoolSize must be an integer from 1 to ${config.maximumCandidatePoolSize}.`,
    );
  }

  const generateCandidate = options.generateCandidate ?? generateDefaultBoard;
  const solver =
    options.solver ??
    createBoardPlayabilitySolver(options.dictionary, options.dictionaryWords);
  const candidates: RankedBoardCandidate[] = [];
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

  candidates.sort(config.compareCandidates);
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
