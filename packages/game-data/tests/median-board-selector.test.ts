import { describe, expect, it, vi } from 'vitest';

import {
  createBoardPlayabilitySolver,
  MEDIAN_BOARD_CANDIDATE_POOL_SIZE,
  MEDIAN_BOARD_TARGETS,
  selectMedianBoard,
  type BoardPlayabilityMetrics,
  type BoardPlayabilitySolver,
} from '../src/index.js';
import {
  createResearchDictionary,
  createSeededRandom,
} from '../src/board-quality-research.js';

import type { Board, BoardSize } from '@words/game-engine';

const dictionaryWords = ['CAT', 'CATS', 'DOG', 'QUIZ'];
const dictionary = createResearchDictionary(dictionaryWords);

function candidateBoard(size: BoardSize, index: number): Board {
  const marker = String.fromCharCode(65 + index);
  return {
    size,
    tiles: Object.freeze(Array.from({ length: size * size }, () => marker)),
  } as Board;
}

function metrics(
  playableWordCount: number,
  longPlayableWordCount: number,
  cellCoverage = 0.5,
  largestRepeatedTokenComponent = 1,
): BoardPlayabilityMetrics {
  return {
    playableWordCount,
    longPlayableWordCount,
    cellCoverage,
    largestRepeatedTokenComponent,
  };
}

function selectFromMetrics(
  candidates: readonly BoardPlayabilityMetrics[],
  size: BoardSize = 4,
) {
  const boards = candidates.map((_, index) => candidateBoard(size, index));
  const byBoard = new Map(
    boards.map((board, index) => [board, candidates[index]!] as const),
  );
  const solver: BoardPlayabilitySolver = {
    measure: (board) => byBoard.get(board)!,
    analyze: vi.fn() as never,
  };
  let generated = 0;
  const result = selectMedianBoard({
    size,
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

describe('median board selector', () => {
  it('uses the reviewed targets and bounded default pool', () => {
    expect(MEDIAN_BOARD_CANDIDATE_POOL_SIZE).toBe(8);
    expect(MEDIAN_BOARD_TARGETS).toEqual({
      4: { playableWordCount: 72, longPlayableWordCount: 18 },
      5: { playableWordCount: 153, longPlayableWordCount: 51 },
      6: { playableWordCount: 262, longPlayableWordCount: 101 },
    });
  });

  it('makes total-word distance dominate every later criterion', () => {
    const result = selectFromMetrics([
      metrics(71, 0, 0, 16),
      metrics(74, 18, 1, 1),
    ]);
    expect(result.selectedCandidateIndex).toBe(0);
  });

  it('uses long-word distance only after total-word distance ties', () => {
    const result = selectFromMetrics([
      metrics(71, 10, 1, 1),
      metrics(73, 18, 0, 16),
    ]);
    expect(result.selectedCandidateIndex).toBe(1);
  });

  it('uses coverage, repeated clustering, then generation order as stable ties', () => {
    expect(
      selectFromMetrics([metrics(71, 18, 0.5, 1), metrics(73, 18, 0.75, 16)])
        .selectedCandidateIndex,
    ).toBe(1);
    expect(
      selectFromMetrics([metrics(71, 18, 0.75, 4), metrics(73, 18, 0.75, 2)])
        .selectedCandidateIndex,
    ).toBe(1);
    expect(
      selectFromMetrics([metrics(71, 18, 0.75, 2), metrics(73, 18, 0.75, 2)])
        .selectedCandidateIndex,
    ).toBe(0);
  });

  it('selects an exact median candidate', () => {
    expect(
      selectFromMetrics([metrics(70, 18), metrics(72, 18), metrics(74, 18)])
        .selectedCandidateIndex,
    ).toBe(1);
  });

  it('prefers a slightly below-median board over an extreme strong board', () => {
    expect(
      selectFromMetrics([metrics(69, 15), metrics(140, 50)])
        .selectedCandidateIndex,
    ).toBe(0);
  });

  it('prefers a slightly above-median board over a weak board when closer', () => {
    expect(
      selectFromMetrics([metrics(20, 2), metrics(76, 20)])
        .selectedCandidateIndex,
    ).toBe(1);
  });

  it('returns the closest candidate from the complete bounded pool', () => {
    const candidates = [40, 60, 68, 80, 95, 110, 130, 160].map((count) =>
      metrics(count, 18),
    );
    const result = selectFromMetrics(candidates);
    expect(result.successfulCandidateCount).toBe(8);
    expect(result.selectedCandidateIndex).toBe(2);
    expect(result.attempts).toBe(3);
    expect(result.totalGenerationAttempts).toBe(36);
  });

  it('is deterministic for a fixed seed and uses the same random source', () => {
    const run = () => {
      const random = createSeededRandom('median-selector-test');
      const seenRandomSources = new Set<object>();
      const result = selectMedianBoard({
        size: 4,
        random,
        dictionary,
        dictionaryWords,
        generateCandidate: (options) => {
          seenRandomSources.add(options.random);
          const board = candidateBoard(
            4,
            Math.floor(options.random.next() * 8),
          );
          return { success: true, board, attempts: 1 };
        },
      });
      return { result, randomSourceCount: seenRandomSources.size };
    };
    expect(run()).toEqual(run());
    expect(run().randomSourceCount).toBe(1);
  });

  it('continues after individual generation failures and counts attempts', () => {
    const accepted = candidateBoard(4, 2);
    let call = 0;
    const result = selectMedianBoard({
      size: 4,
      random: { next: () => 0.5 },
      dictionary,
      dictionaryWords,
      candidatePoolSize: 3,
      generateCandidate: () => {
        call += 1;
        if (call === 1) throw new Error('candidate failed');
        if (call === 2) {
          return {
            success: false,
            code: 'NO_ACCEPTABLE_BOARD',
            attempts: 8,
          };
        }
        return { success: true, board: accepted, attempts: 2 };
      },
    });
    expect(result).toMatchObject({
      success: true,
      board: accepted,
      attempts: 2,
      totalGenerationAttempts: 10,
      successfulCandidateCount: 1,
      selectedCandidateIndex: 2,
    });
  });

  it('returns the existing explicit failure when every candidate fails', () => {
    const result = selectMedianBoard({
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

  it('caches the trie-backed solver for each dictionary object', () => {
    const first = createBoardPlayabilitySolver(dictionary, dictionaryWords);
    expect(createBoardPlayabilitySolver(dictionary, dictionaryWords)).toBe(
      first,
    );
    const secondDictionary = createResearchDictionary(dictionaryWords);
    expect(
      createBoardPlayabilitySolver(secondDictionary, dictionaryWords),
    ).not.toBe(first);
  });
});
