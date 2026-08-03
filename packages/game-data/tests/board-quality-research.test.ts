import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BOARD_QUALITY_PROFILES,
  DEFAULT_TILE_DISTRIBUTION,
} from '../src/index.js';

import {
  analyzeBoard,
  createResearchDictionary,
  generateResearchBoards,
  percentile,
  selectSamples,
} from '../src/board-quality-research.js';

const words = ['CAT', 'CATS', 'DOG', 'QUIZ'];
const dictionary = createResearchDictionary(words);

function board(size: 4 | 5 | 6, tiles: readonly string[]) {
  return { size, tiles } as const;
}

describe('board quality research metrics', () => {
  it('generates identical boards for a fixed seed', () => {
    const productionConfiguration = JSON.stringify({
      distribution: DEFAULT_TILE_DISTRIBUTION,
      profiles: DEFAULT_BOARD_QUALITY_PROFILES,
    });
    const first = generateResearchBoards(4, 4, 'research-seed');
    const second = generateResearchBoards(4, 4, 'research-seed');
    expect(first).toEqual(second);
    expect(
      first.map(({ board: generated, attempts }) =>
        analyzeBoard(generated, dictionary, words, attempts),
      ),
    ).toEqual(
      second.map(({ board: generated, attempts }) =>
        analyzeBoard(generated, dictionary, words, attempts),
      ),
    );
    expect(
      JSON.stringify({
        distribution: DEFAULT_TILE_DISTRIBUTION,
        profiles: DEFAULT_BOARD_QUALITY_PROFILES,
      }),
    ).toBe(productionConfiguration);
  });

  it('handles vowel spread and odd-sized quadrants deterministically', () => {
    const result = analyzeBoard(
      board(5, [
        'A',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'E',
        'B',
        'B',
        'B',
        'I',
        'B',
        'B',
        'B',
        'O',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'U',
      ]),
      dictionary,
      words,
    );
    expect(result.vowelCount).toBe(5);
    expect(result.vowelRows).toBe(5);
    expect(result.vowelColumns).toBe(5);
    expect(result.vowelQuadrants).toBe(4);
    expect(result.maximumVowelsIn2x2).toBe(2);
    expect(result.maximumVowelsIn3x3).toBe(3);
    expect(result.largestVowelComponent).toBe(3);

    const centered = analyzeBoard(
      board(5, [
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'I',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
        'B',
      ]),
      dictionary,
      words,
    );
    expect(centered.vowelQuadrants).toBe(0);
    expect(centered.largestVowelComponent).toBe(1);
  });

  it('calculates connected repetition and window metrics', () => {
    const result = analyzeBoard(
      board(4, [
        'A',
        'A',
        'B',
        'C',
        'A',
        'A',
        'D',
        'E',
        'F',
        'G',
        'H',
        'I',
        'J',
        'K',
        'L',
        'M',
      ]),
      dictionary,
      words,
    );
    expect(result.maximumRepeatedTokenCount).toBe(4);
    expect(result.largestRepeatedTokenComponent).toBe(4);
    expect(result.repeatedTokenAdjacentEdges).toBe(6);
    expect(result.maximumRepeatedTokensIn2x2).toBe(4);
    expect(result.maximumRepeatedTokensIn3x3).toBe(4);
    expect(result.tokenCounts['A']).toBe(4);
  });

  it('solves known words, buckets lengths, and measures cell coverage', () => {
    const result = analyzeBoard(
      board(4, [
        'C',
        'A',
        'T',
        'S',
        'D',
        'O',
        'G',
        'X',
        'QU',
        'I',
        'Z',
        'B',
        'B',
        'B',
        'B',
        'B',
      ]),
      dictionary,
      words,
    );
    expect(result.playableWordCount).toBe(4);
    expect(result.wordCountsByLength['3']).toBe(2);
    expect(result.wordCountsByLength['4']).toBe(2);
    expect(result.longestWordLength).toBe(4);
    expect(result.longPlayableWordCount).toBe(0);
    expect(result.cellCoverage).toBe(0.625);
    expect(result.startingCellCount).toBe(3);
    expect(result.representativeLongestWords).toEqual(['CATS', 'QUIZ']);
  });

  it('keeps percentile and sample selection stable', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    const rows = generateResearchBoards(4, 12, 'sample-seed').map(
      ({ board: generated, attempts }) =>
        analyzeBoard(generated, dictionary, words, attempts),
    );
    expect(selectSamples(rows)).toHaveLength(12);
    expect(selectSamples(rows).map((row) => row.board)).toEqual(
      selectSamples(rows).map((row) => row.board),
    );
  });
});
