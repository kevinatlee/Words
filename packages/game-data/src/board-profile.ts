import {
  generateBoard,
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
  readonly maximumAttempts: number;
}

export const DEFAULT_BOARD_QUALITY_PROFILES: Readonly<
  Record<BoardSize, BoardQualityProfile>
> = Object.freeze({
  4: Object.freeze({
    minimumVowelTokens: 4,
    maximumVowelTokens: 9,
    maximumIdenticalTokens: 4,
    maximumAttempts: 8,
  }),
  5: Object.freeze({
    minimumVowelTokens: 6,
    maximumVowelTokens: 14,
    maximumIdenticalTokens: 5,
    maximumAttempts: 8,
  }),
  6: Object.freeze({
    minimumVowelTokens: 9,
    maximumVowelTokens: 20,
    maximumIdenticalTokens: 6,
    maximumAttempts: 8,
  }),
});

const VOWEL_TOKENS = Object.freeze(['A', 'E', 'I', 'O', 'U']);

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

  return (
    vowelCount >= profile.minimumVowelTokens &&
    vowelCount <= profile.maximumVowelTokens
  );
}

export interface GenerateDefaultBoardOptions {
  readonly size: BoardSize;
  readonly random: RandomSource;
}

export function generateDefaultBoard(
  options: GenerateDefaultBoardOptions,
): BoardGenerationResult {
  const profile = DEFAULT_BOARD_QUALITY_PROFILES[options.size];
  return generateBoard({
    size: options.size,
    distribution: DEFAULT_TILE_DISTRIBUTION,
    random: options.random,
    acceptBoard: isDefaultBoardAcceptable,
    maxAttempts: profile.maximumAttempts,
  });
}
