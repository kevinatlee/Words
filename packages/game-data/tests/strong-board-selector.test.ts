import { describe, expect, it, vi } from 'vitest';

import {
  STRONG_BOARD_CANDIDATE_POOL_SIZE,
  selectStrongBoard,
  type BoardPlayabilityMetrics,
  type BoardPlayabilitySolver,
} from '../src/index.js';
import { createResearchDictionary } from '../src/board-quality-research.js';

import type { Board, BoardSize } from '@words/game-engine';

const dictionaryWords = ['CAT', 'CATS', 'DOG', 'QUIZ'];
const dictionary = createResearchDictionary(dictionaryWords);

function candidateBoard(size: BoardSize, index: number): Board {
  const marker = String.fromCharCode(65 + (index % 26));
  return {
    size,
    tiles: Object.freeze(Array.from({ length: size * size }, () => marker)),
  } as Board;
}

function metrics(
  playableWordCount: number,
  longPlayableWordCount: number,
  cellCoverage = 0.5,
): BoardPlayabilityMetrics {
  return {
    playableWordCount,
    longPlayableWordCount,
    cellCoverage,
    largestRepeatedTokenComponent: 1,
  };
}

function selectFromMetrics(candidates: readonly BoardPlayabilityMetrics[]) {
  const boards = candidates.map((_, index) => candidateBoard(4, index));
  const byBoard = new Map(
    boards.map((board, index) => [board, candidates[index]!] as const),
  );
  const solver: BoardPlayabilitySolver = {
    measure: (board) => byBoard.get(board)!,
    analyze: vi.fn() as never,
  };
  let generated = 0;
  const result = selectStrongBoard({
    size: 4,
    random: { next: () => 0.5 },
    dictionary,
    dictionaryWords,
    candidatePoolSize: candidates.length,
    generateCandidate: () => ({
      success: true,
      board: boards[generated]!,
      attempts: generated++ + 1,
    }),
    solver,
  });
  if (!result.success) {
    throw new Error('Expected a selected candidate.');
  }
  return result;
}

describe('strong board selector', () => {
  it('uses a bounded default pool of exactly 32 candidates', () => {
    const board = candidateBoard(4, 0);
    const generateCandidate = vi.fn(() => ({
      success: true as const,
      board,
      attempts: 1,
    }));
    const solver: BoardPlayabilitySolver = {
      measure: () => metrics(10, 2, 1),
      analyze: vi.fn() as never,
    };

    const result = selectStrongBoard({
      size: 4,
      random: { next: () => 0.5 },
      dictionary,
      dictionaryWords,
      generateCandidate,
      solver,
    });

    expect(STRONG_BOARD_CANDIDATE_POOL_SIZE).toBe(32);
    expect(generateCandidate).toHaveBeenCalledTimes(32);
    expect(result).toMatchObject({
      success: true,
      successfulCandidateCount: 32,
      totalGenerationAttempts: 32,
      selectedCandidateIndex: 0,
    });
  });

  it('selects the candidate with the highest playable-word count', () => {
    expect(
      selectFromMetrics([metrics(100, 20), metrics(140, 25), metrics(120, 30)])
        .selectedCandidateIndex,
    ).toBe(1);
  });

  it('uses higher cell coverage for an exact playable-word tie', () => {
    expect(
      selectFromMetrics([metrics(140, 25, 0.9), metrics(140, 20, 1)])
        .selectedCandidateIndex,
    ).toBe(1);
  });

  it('uses the earliest candidate for an exact remaining tie', () => {
    expect(
      selectFromMetrics([metrics(140, 20, 1), metrics(140, 30, 1)])
        .selectedCandidateIndex,
    ).toBe(0);
  });

  it('never lets long-word count outweigh total playable words', () => {
    expect(
      selectFromMetrics([metrics(139, 100, 1), metrics(140, 1, 0.5)])
        .selectedCandidateIndex,
    ).toBe(1);
  });

  it('skips failed candidates while preserving attempt metadata', () => {
    const accepted = candidateBoard(4, 1);
    let call = 0;
    const result = selectStrongBoard({
      size: 4,
      random: { next: () => 0.5 },
      dictionary,
      dictionaryWords,
      candidatePoolSize: 2,
      generateCandidate: () => {
        call += 1;
        return call === 1
          ? {
              success: false,
              code: 'NO_ACCEPTABLE_BOARD',
              attempts: 8,
            }
          : { success: true, board: accepted, attempts: 2 };
      },
    });

    expect(result).toMatchObject({
      success: true,
      board: accepted,
      attempts: 2,
      totalGenerationAttempts: 10,
      successfulCandidateCount: 1,
      selectedCandidateIndex: 1,
    });
  });

  it('isolates candidate exceptions from the remaining pool', () => {
    const accepted = candidateBoard(4, 1);
    let call = 0;
    const result = selectStrongBoard({
      size: 4,
      random: { next: () => 0.5 },
      dictionary,
      dictionaryWords,
      candidatePoolSize: 2,
      generateCandidate: () => {
        call += 1;
        if (call === 1) throw new Error('candidate failed');
        return { success: true, board: accepted, attempts: 2 };
      },
    });

    expect(result).toMatchObject({
      success: true,
      board: accepted,
      totalGenerationAttempts: 2,
      successfulCandidateCount: 1,
      selectedCandidateIndex: 1,
    });
  });

  it('returns NO_ACCEPTABLE_BOARD when no candidate succeeds', () => {
    const result = selectStrongBoard({
      size: 4,
      random: { next: () => 0.5 },
      dictionary,
      dictionaryWords,
      candidatePoolSize: 3,
      generateCandidate: () => ({
        success: false,
        code: 'NO_ACCEPTABLE_BOARD',
        attempts: 8,
      }),
    });

    expect(result).toEqual({
      success: false,
      code: 'NO_ACCEPTABLE_BOARD',
      attempts: 24,
    });
  });
});
