import {
  getAdjacentIndices,
  scoreWordByLength,
  type Board,
  type WordDictionary,
} from '@words/game-engine';

const MINIMUM_WORD_LENGTH = 3;

interface TrieNode {
  readonly children: Map<string, TrieNode>;
  terminal: boolean;
}

interface SolvedBoard {
  readonly words: ReadonlySet<string>;
  readonly usedCells: ReadonlySet<number>;
  readonly startingCells: ReadonlySet<number>;
}

export interface BoardPlayabilityMetrics {
  readonly playableWordCount: number;
  readonly longPlayableWordCount: number;
  readonly cellCoverage: number;
  readonly largestRepeatedTokenComponent: number;
}

export interface DetailedBoardPlayability {
  readonly playableWordCount: number;
  readonly longPlayableWordCount: number;
  readonly wordCountsByLength: Readonly<Record<string, number>>;
  readonly longestWordLength: number;
  readonly totalPossibleScore: number;
  readonly cellCoverage: number;
  readonly startingCellCount: number;
  readonly representativeLongestWords: readonly string[];
}

export interface BoardPlayabilitySolver {
  measure(board: Board): BoardPlayabilityMetrics;
  analyze(board: Board): DetailedBoardPlayability;
}

const solverCache = new WeakMap<WordDictionary, BoardPlayabilitySolver>();

export function createBoardPlayabilitySolver(
  dictionary: WordDictionary,
  dictionaryWords: readonly string[],
): BoardPlayabilitySolver {
  const cached = solverCache.get(dictionary);
  if (cached) {
    return cached;
  }

  const trie = createTrie(dictionaryWords);
  const solver = Object.freeze({
    measure(board: Board): BoardPlayabilityMetrics {
      const solved = solveBoard(board, dictionary, trie);
      let longPlayableWordCount = 0;
      for (const word of solved.words) {
        if (word.length >= 5) {
          longPlayableWordCount += 1;
        }
      }
      return Object.freeze({
        playableWordCount: solved.words.size,
        longPlayableWordCount,
        cellCoverage: solved.usedCells.size / board.tiles.length,
        largestRepeatedTokenComponent:
          measureLargestRepeatedTokenComponent(board),
      });
    },
    analyze(board: Board): DetailedBoardPlayability {
      const solved = solveBoard(board, dictionary, trie);
      const wordCountsByLength: Record<string, number> = {};
      let longPlayableWordCount = 0;
      let longestWordLength = 0;
      let totalPossibleScore = 0;

      for (const word of solved.words) {
        const bucket = word.length >= 8 ? '8+' : String(word.length);
        wordCountsByLength[bucket] = (wordCountsByLength[bucket] ?? 0) + 1;
        if (word.length >= 5) {
          longPlayableWordCount += 1;
        }
        longestWordLength = Math.max(longestWordLength, word.length);
        const scored = scoreWordByLength(word);
        if (scored.valid) {
          const bonus = word.length === 3 || word.length === 4 ? 1 : 2;
          totalPossibleScore += scored.points + bonus;
        }
      }

      const representativeLongestWords = [...solved.words]
        .filter((word) => word.length === longestWordLength)
        .sort()
        .slice(0, 5);

      return Object.freeze({
        playableWordCount: solved.words.size,
        longPlayableWordCount,
        wordCountsByLength: Object.freeze(wordCountsByLength),
        longestWordLength,
        totalPossibleScore,
        cellCoverage: solved.usedCells.size / board.tiles.length,
        startingCellCount: solved.startingCells.size,
        representativeLongestWords: Object.freeze(representativeLongestWords),
      });
    },
  });

  solverCache.set(dictionary, solver);
  return solver;
}

export function measureLargestRepeatedTokenComponent(board: Board): number {
  const tokens = new Set(board.tiles);
  let largest = 0;

  for (const repeatedToken of tokens) {
    const seen = new Set<number>();
    for (let start = 0; start < board.tiles.length; start += 1) {
      if (seen.has(start) || board.tiles[start] !== repeatedToken) {
        continue;
      }
      const queue = [start];
      seen.add(start);
      let componentSize = 0;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor]!;
        componentSize += 1;
        for (const neighbor of getAdjacentIndices(board.size, index)) {
          if (!seen.has(neighbor) && board.tiles[neighbor] === repeatedToken) {
            seen.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      largest = Math.max(largest, componentSize);
    }
  }

  return largest;
}

function solveBoard(
  board: Board,
  dictionary: WordDictionary,
  root: TrieNode,
): SolvedBoard {
  const words = new Set<string>();
  const usedCells = new Set<number>();
  const startingCells = new Set<number>();
  const path: number[] = [];

  const visit = (
    index: number,
    node: TrieNode,
    mask: bigint,
    word: string,
  ): void => {
    const token = board.tiles[index]!;
    const next = node.children.get(token);
    if (!next) {
      return;
    }

    path.push(index);
    const nextWord = word + token;
    if (
      next.terminal &&
      nextWord.length >= MINIMUM_WORD_LENGTH &&
      dictionary.has(nextWord)
    ) {
      words.add(nextWord);
      for (const cell of path) {
        usedCells.add(cell);
      }
      startingCells.add(path[0]!);
    }

    const nextMask = mask | (1n << BigInt(index));
    for (const neighbor of getAdjacentIndices(board.size, index)) {
      if ((nextMask & (1n << BigInt(neighbor))) === 0n) {
        visit(neighbor, next, nextMask, nextWord);
      }
    }
    path.pop();
  };

  for (let index = 0; index < board.tiles.length; index += 1) {
    visit(index, root, 0n, '');
  }

  return { words, usedCells, startingCells };
}

function createTrie(words: readonly string[]): TrieNode {
  const root: TrieNode = { children: new Map(), terminal: false };
  for (const word of words) {
    let node = root;
    for (const token of tokenizeWord(word)) {
      let child = node.children.get(token);
      if (!child) {
        child = { children: new Map(), terminal: false };
        node.children.set(token, child);
      }
      node = child;
    }
    node.terminal = true;
  }
  return root;
}

function tokenizeWord(word: string): readonly string[] {
  const tokens: string[] = [];
  for (let index = 0; index < word.length; index += 1) {
    const token = word.slice(index, index + 2) === 'QU' ? 'QU' : word[index]!;
    tokens.push(token);
    if (token === 'QU') {
      index += 1;
    }
  }
  return tokens;
}
