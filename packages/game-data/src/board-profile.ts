import {
  EngineConfigurationError,
  generateBoard,
  getAdjacentIndices,
  isBoardSize,
  type Board,
  type BoardGenerationResult,
  type BoardSize,
  type RandomSource,
} from '@words/game-engine';

import { DEFAULT_TILE_DISTRIBUTION } from './distribution.js';

export interface BoardQualityProfile {
  readonly minimumVowelTokens: number;
  readonly maximumVowelTokens: number;
  readonly maximumIdenticalTokens: number;
  readonly maximumIdenticalConnectedComponent: number;
  readonly maximumIdenticalStraightRun: number;
  readonly maximumVowelsInTwoByTwo: number;
  readonly maximumVowelsInThreeByThree: number;
  readonly maximumAttempts: number;
}

export const DEFAULT_BOARD_QUALITY_PROFILES: Readonly<
  Record<BoardSize, BoardQualityProfile>
> = Object.freeze({
  4: Object.freeze({
    minimumVowelTokens: 4,
    maximumVowelTokens: 9,
    maximumIdenticalTokens: 4,
    maximumIdenticalConnectedComponent: 2,
    maximumIdenticalStraightRun: 2,
    maximumVowelsInTwoByTwo: 3,
    maximumVowelsInThreeByThree: 6,
    maximumAttempts: 16,
  }),
  5: Object.freeze({
    minimumVowelTokens: 6,
    maximumVowelTokens: 14,
    maximumIdenticalTokens: 5,
    maximumIdenticalConnectedComponent: 2,
    maximumIdenticalStraightRun: 2,
    maximumVowelsInTwoByTwo: 3,
    maximumVowelsInThreeByThree: 6,
    maximumAttempts: 32,
  }),
  6: Object.freeze({
    minimumVowelTokens: 9,
    maximumVowelTokens: 20,
    maximumIdenticalTokens: 6,
    maximumIdenticalConnectedComponent: 2,
    maximumIdenticalStraightRun: 2,
    maximumVowelsInTwoByTwo: 3,
    maximumVowelsInThreeByThree: 6,
    maximumAttempts: 64,
  }),
});

const VOWEL_TOKENS = Object.freeze(['A', 'E', 'I', 'O', 'U']);

export interface BoardSpatialQuality {
  readonly largestIdenticalConnectedComponent: number;
  readonly identicalStraightRuns: number;
  readonly longestIdenticalStraightRun: number;
  readonly maximumVowelsInTwoByTwo: number;
  readonly maximumVowelsInThreeByThree: number;
}

function maximumVowelsInWindow(board: Board, windowSize: 2 | 3): number {
  let maximum = 0;
  for (let row = 0; row <= board.size - windowSize; row += 1) {
    for (let column = 0; column <= board.size - windowSize; column += 1) {
      let vowels = 0;
      for (let rowOffset = 0; rowOffset < windowSize; rowOffset += 1) {
        for (
          let columnOffset = 0;
          columnOffset < windowSize;
          columnOffset += 1
        ) {
          const token =
            board.tiles[(row + rowOffset) * board.size + column + columnOffset];
          if (token && VOWEL_TOKENS.includes(token)) vowels += 1;
        }
      }
      maximum = Math.max(maximum, vowels);
    }
  }
  return maximum;
}

export function measureBoardSpatialQuality(board: Board): BoardSpatialQuality {
  const visited = new Set<number>();
  let largestIdenticalConnectedComponent = 0;
  for (let start = 0; start < board.tiles.length; start += 1) {
    if (visited.has(start)) continue;
    const token = board.tiles[start];
    const pending = [start];
    visited.add(start);
    let componentSize = 0;
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) break;
      componentSize += 1;
      for (const neighbor of getAdjacentIndices(board.size, current)) {
        if (!visited.has(neighbor) && board.tiles[neighbor] === token) {
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
    largestIdenticalConnectedComponent = Math.max(
      largestIdenticalConnectedComponent,
      componentSize,
    );
  }

  let identicalStraightRuns = 0;
  let longestIdenticalStraightRun = 0;
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ] as const;
  for (let row = 0; row < board.size; row += 1) {
    for (let column = 0; column < board.size; column += 1) {
      const token = board.tiles[row * board.size + column];
      for (const [rowStep, columnStep] of directions) {
        const previousRow = row - rowStep;
        const previousColumn = column - columnStep;
        if (
          previousRow >= 0 &&
          previousRow < board.size &&
          previousColumn >= 0 &&
          previousColumn < board.size &&
          board.tiles[previousRow * board.size + previousColumn] === token
        ) {
          continue;
        }
        let runLength = 1;
        let nextRow = row + rowStep;
        let nextColumn = column + columnStep;
        while (
          nextRow >= 0 &&
          nextRow < board.size &&
          nextColumn >= 0 &&
          nextColumn < board.size &&
          board.tiles[nextRow * board.size + nextColumn] === token
        ) {
          runLength += 1;
          nextRow += rowStep;
          nextColumn += columnStep;
        }
        longestIdenticalStraightRun = Math.max(
          longestIdenticalStraightRun,
          runLength,
        );
        if (runLength >= 3) identicalStraightRuns += 1;
      }
    }
  }

  return Object.freeze({
    largestIdenticalConnectedComponent,
    identicalStraightRuns,
    longestIdenticalStraightRun,
    maximumVowelsInTwoByTwo: maximumVowelsInWindow(board, 2),
    maximumVowelsInThreeByThree: maximumVowelsInWindow(board, 3),
  });
}

export function isDefaultBoardAcceptable(board: Board): boolean {
  const profile = DEFAULT_BOARD_QUALITY_PROFILES[board.size];
  let vowelCount = 0;
  const tokenCounts = new Map<string, number>();

  for (const token of board.tiles) {
    if (VOWEL_TOKENS.includes(token)) {
      vowelCount += 1;
    }
    const tokenCount = (tokenCounts.get(token) ?? 0) + 1;
    if (tokenCount > profile.maximumIdenticalTokens) {
      return false;
    }
    tokenCounts.set(token, tokenCount);
  }

  if (
    vowelCount < profile.minimumVowelTokens ||
    vowelCount > profile.maximumVowelTokens
  ) {
    return false;
  }

  const spatial = measureBoardSpatialQuality(board);
  return (
    spatial.largestIdenticalConnectedComponent <=
      profile.maximumIdenticalConnectedComponent &&
    spatial.longestIdenticalStraightRun <=
      profile.maximumIdenticalStraightRun &&
    spatial.maximumVowelsInTwoByTwo <= profile.maximumVowelsInTwoByTwo &&
    spatial.maximumVowelsInThreeByThree <= profile.maximumVowelsInThreeByThree
  );
}

export interface GenerateDefaultBoardOptions {
  readonly size: BoardSize;
  readonly random: RandomSource;
}

export function generateDefaultBoard(
  options: GenerateDefaultBoardOptions,
): BoardGenerationResult {
  if (!isBoardSize(options.size)) {
    throw new EngineConfigurationError(
      'INVALID_BOARD_SIZE',
      'Board size must be 4, 5, or 6.',
    );
  }
  const profile = DEFAULT_BOARD_QUALITY_PROFILES[options.size];
  return generateBoard({
    size: options.size,
    distribution: DEFAULT_TILE_DISTRIBUTION,
    random: options.random,
    acceptBoard: isDefaultBoardAcceptable,
    maxAttempts: profile.maximumAttempts,
  });
}
