import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  DEFAULT_BOARD_QUALITY_PROFILES,
  loadProductionDictionary,
} from '@words/game-data';
import { format as formatWithPrettier } from 'prettier';
import {
  analyzeBoard,
  BOARDS_PER_SIZE,
  generateResearchBoards,
  percentile,
  productionDistributionIdentity,
  RESEARCH_SEED,
  RESEARCH_SIZES,
  selectSamples,
  summarizeMetric,
  summarizeValues,
  correlation,
  type ResearchBoardMetrics,
} from '../packages/game-data/src/board-quality-research.ts';

const METRICS = [
  'vowelCount',
  'vowelRatio',
  'vowelRows',
  'vowelColumns',
  'vowelQuadrants',
  'maximumVowelsIn2x2',
  'maximumVowelsIn3x3',
  'largestVowelComponent',
  'maximumDistanceToVowel',
  'maximumRepeatedTokenCount',
  'largestRepeatedTokenComponent',
  'repeatedTokenAdjacentEdges',
  'maximumRepeatedTokensIn2x2',
  'maximumRepeatedTokensIn3x3',
  'playableWordCount',
  'longPlayableWordCount',
  'longestWordLength',
  'totalPossibleScore',
  'cellCoverage',
  'startingCellCount',
  'attempts',
] as const;

const WORD_LENGTH_BUCKETS = ['3', '4', '5', '6', '7', '8+'] as const;

interface Options {
  readonly count: number;
  readonly seed: string;
  readonly output: string;
}

interface RenderableSummary {
  readonly seed: string;
  readonly boardsPerSize: number;
  readonly totalBoards: number;
  readonly generator: {
    readonly distribution: readonly {
      readonly token: string;
      readonly weight: number;
    }[];
    readonly qualityProfiles: typeof DEFAULT_BOARD_QUALITY_PROFILES;
  };
  readonly sizes: Readonly<Record<string, ReturnType<typeof buildSizeSummary>>>;
}

type SampleBoard = ResearchBoardMetrics & {
  readonly sampleId: string;
  readonly category: string;
  readonly seed: string;
  readonly index: number;
};

function parseArgs(argv: readonly string[]): Options {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument?.startsWith('--')) continue;
    const [key, inlineValue] = argument.slice(2).split('=', 2);
    const value = inlineValue ?? argv[++index];
    if (key && value) values.set(key, value);
  }
  const count = Number(values.get('count') ?? BOARDS_PER_SIZE);
  if (!Number.isInteger(count) || count <= 0 || count > 50_000) {
    throw new Error('--count must be an integer from 1 to 50000.');
  }
  return {
    count,
    seed: values.get('seed') ?? RESEARCH_SEED,
    output: values.get('output') ?? 'docs/board-quality-research/generated',
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const started = performance.now();
  const dictionaryResult = await loadProductionDictionary();
  if (!dictionaryResult.success) {
    throw new Error(
      `Production dictionary failed to load: ${dictionaryResult.code}`,
    );
  }
  const words = (
    await readFile(
      new URL(
        '../packages/game-data/data/dictionary/words.txt',
        import.meta.url,
      ),
      'utf8',
    )
  )
    .trim()
    .split('\n');
  const dictionary = dictionaryResult.dictionary;
  const bySize: Record<string, ResearchBoardMetrics[]> = {};
  let analyzedBoards = 0;
  let totalAttempts = 0;
  let generationMilliseconds = 0;
  let solverMilliseconds = 0;
  for (const size of RESEARCH_SIZES) {
    const generationStarted = performance.now();
    const boards = generateResearchBoards(size, options.count, options.seed);
    generationMilliseconds += performance.now() - generationStarted;
    const solverStarted = performance.now();
    bySize[size] = boards.map(({ board, attempts }) => {
      analyzedBoards += 1;
      totalAttempts += attempts;
      return analyzeBoard(board, dictionary, words, attempts);
    });
    solverMilliseconds += performance.now() - solverStarted;
  }
  const elapsedMs = performance.now() - started;
  const runtime = {
    milliseconds: Math.round(elapsedMs),
    boardsPerSecond: analyzedBoards / (elapsedMs / 1000),
    candidateAttempts: totalAttempts,
    candidatesPerSecond: totalAttempts / (elapsedMs / 1000),
    generationMilliseconds: Math.round(generationMilliseconds),
    generationCandidatesPerSecond:
      totalAttempts / (generationMilliseconds / 1000),
    solverMilliseconds: Math.round(solverMilliseconds),
    solvedBoardsPerSecond: analyzedBoards / (solverMilliseconds / 1000),
  };
  const reportDirectory = dirname(options.output);
  await mkdir(options.output, { recursive: true });
  await mkdir(reportDirectory, { recursive: true });

  const summary = {
    schemaVersion: 1,
    seed: options.seed,
    boardsPerSize: options.count,
    totalBoards: analyzedBoards,
    dictionary: dictionaryResult.manifest,
    generator: {
      distributionName:
        'DEFAULT_TILE_DISTRIBUTION / cap-of-two dictionary-derived weights',
      distribution: productionDistributionIdentity(),
      qualityProfiles: DEFAULT_BOARD_QUALITY_PROFILES,
      rawHarness:
        'xorshift32 seeded by board-quality seed and board size; research only',
    },
    sizes: Object.fromEntries(
      RESEARCH_SIZES.map((size) => [
        size,
        buildSizeSummary(bySize[size] ?? []),
      ]),
    ),
  };
  const samples = Object.fromEntries(
    RESEARCH_SIZES.map((size) => [
      size,
      selectSamples(bySize[size] ?? []).map((row, index) => ({
        sampleId: `${size}x${size}-${categoryFor(index)}-${index + 1}`,
        category: categoryFor(index),
        seed: options.seed,
        index: (bySize[size] ?? []).indexOf(row),
        ...row,
      })),
    ]),
  );
  await writeFile(
    `${options.output}/summary.json`,
    await formatWithPrettier(JSON.stringify(summary), { parser: 'json' }),
  );
  await writeFile(
    `${options.output}/sample-boards.json`,
    await formatWithPrettier(JSON.stringify(samples), { parser: 'json' }),
  );
  await writeFile(
    `${reportDirectory}/REPORT.md`,
    await formatWithPrettier(renderReport(summary, runtime), {
      parser: 'markdown',
    }),
  );
  await writeFile(
    `${reportDirectory}/SAMPLE_BOARDS.md`,
    await formatWithPrettier(renderSamples(samples), { parser: 'markdown' }),
  );
  console.log(JSON.stringify({ ...runtime, output: options.output }, null, 2));
}

function buildSizeSummary(rows: readonly ResearchBoardMetrics[]) {
  const metrics = Object.fromEntries(
    METRICS.map((metric) => [metric, summarizeMetric(rows, metric)]),
  );
  const p10Words = percentile(
    rows.map((row) => row.playableWordCount),
    10,
  );
  const p10LongWords = percentile(
    rows.map((row) => longWordCount(row)),
    10,
  );
  const policies = [
    policyResult(
      rows,
      'spatial-vowel-hard-limits',
      'vowel rows and columns >= ceil(size / 2); quadrants >= 3; maximum nearest-vowel distance <= 2; maximum vowels in any 2x2 <= 3',
      false,
      (row) =>
        row.vowelRows >= Math.ceil(row.size / 2) &&
        row.vowelColumns >= Math.ceil(row.size / 2) &&
        row.vowelQuadrants >= 3 &&
        row.maximumDistanceToVowel <= 2 &&
        row.maximumVowelsIn2x2 <= 3,
    ),
    policyResult(
      rows,
      'soft-quality-score',
      'weighted quality score >= 0.80 (vowel spread 25%, low vowel clustering 15%, low repeat clustering 15%, size-normalized playable words 25%, cell coverage 20%)',
      true,
      (row) => qualityScore(row) >= 0.8,
    ),
    policyResult(
      rows,
      'hybrid-composition-playability',
      `spatial spread plus current repeat cap; playable words >= sample P10 (${format(p10Words)}); words length 5+ >= sample P10 (${format(p10LongWords)})`,
      true,
      (row) =>
        row.vowelRows >= Math.ceil(row.size / 2) &&
        row.vowelColumns >= Math.ceil(row.size / 2) &&
        row.vowelQuadrants >= 3 &&
        row.maximumRepeatedTokenCount <=
          DEFAULT_BOARD_QUALITY_PROFILES[row.size].maximumIdenticalTokens &&
        row.playableWordCount >= p10Words &&
        longWordCount(row) >= p10LongWords,
    ),
  ];
  return {
    boardCount: rows.length,
    metrics,
    wordLengthBuckets: Object.fromEntries(
      WORD_LENGTH_BUCKETS.map((bucket) => [
        bucket,
        summarizeValues(rows.map((row) => row.wordCountsByLength[bucket] ?? 0)),
      ]),
    ),
    distributions: {
      vowelCount: histogram(rows.map((row) => row.vowelCount)),
      largestVowelComponent: histogram(
        rows.map((row) => row.largestVowelComponent),
      ),
      maximumRepeatedTokenCount: histogram(
        rows.map((row) => row.maximumRepeatedTokenCount),
      ),
      longestWordLength: histogram(rows.map((row) => row.longestWordLength)),
      playableWordCount: histogram(rows.map((row) => row.playableWordCount)),
      longPlayableWordCount: histogram(
        rows.map((row) => row.longPlayableWordCount),
      ),
      totalPossibleScore: histogram(rows.map((row) => row.totalPossibleScore)),
      cellCoverage: histogram(rows.map((row) => row.cellCoverage)),
      attempts: histogram(rows.map((row) => row.attempts)),
    },
    correlations: {
      vowelCountVsWords: correlation(rows, 'vowelCount', 'playableWordCount'),
      vowelSpreadVsWords: correlation(
        rows,
        'vowelQuadrants',
        'playableWordCount',
      ),
      vowelClusteringVsLongWords: correlation(
        rows,
        'largestVowelComponent',
        'longPlayableWordCount',
      ),
      repeatedClusteringVsWords: correlation(
        rows,
        'largestRepeatedTokenComponent',
        'playableWordCount',
      ),
      coverageVsWords: correlation(rows, 'cellCoverage', 'playableWordCount'),
    },
    policies,
  };
}

function policyResult(
  rows: readonly ResearchBoardMetrics[],
  name: string,
  rules: string,
  requiresWordSolver: boolean,
  accepts: (row: ResearchBoardMetrics) => boolean,
) {
  const accepted = rows.filter(accepts);
  const rate = accepted.length / rows.length;
  const baselineMedianWords = percentile(
    rows.map((row) => row.playableWordCount),
    50,
  );
  const baselineP5Words = percentile(
    rows.map((row) => row.playableWordCount),
    5,
  );
  const acceptedMedianWords = percentile(
    accepted.map((row) => row.playableWordCount),
    50,
  );
  const acceptedP5Words = percentile(
    accepted.map((row) => row.playableWordCount),
    5,
  );
  const baselineMedianLongWords = percentile(rows.map(longWordCount), 50);
  const baselineP5LongWords = percentile(rows.map(longWordCount), 5);
  const acceptedMedianLongWords = percentile(accepted.map(longWordCount), 50);
  const acceptedP5LongWords = percentile(accepted.map(longWordCount), 5);
  const baselineMedianCoverage = percentile(
    rows.map((row) => row.cellCoverage),
    50,
  );
  const acceptedMedianCoverage = percentile(
    accepted.map((row) => row.cellCoverage),
    50,
  );
  const baselineP5Coverage = percentile(
    rows.map((row) => row.cellCoverage),
    5,
  );
  const acceptedP5Coverage = percentile(
    accepted.map((row) => row.cellCoverage),
    5,
  );
  return {
    name,
    rules,
    requiresWordSolver,
    acceptanceRate: rate,
    rejectionRate: 1 - rate,
    estimatedGenerationCostMultiplier: rate === 0 ? null : 1 / rate,
    baselineMedianWords,
    acceptedMedianWords,
    medianWordsChange: acceptedMedianWords - baselineMedianWords,
    baselineP5Words,
    acceptedP5Words,
    p5WordsChange: acceptedP5Words - baselineP5Words,
    baselineMedianLongWords,
    acceptedMedianLongWords,
    medianLongWordsChange: acceptedMedianLongWords - baselineMedianLongWords,
    baselineP5LongWords,
    acceptedP5LongWords,
    p5LongWordsChange: acceptedP5LongWords - baselineP5LongWords,
    baselineMedianCoverage,
    acceptedMedianCoverage,
    medianCoverageChange: acceptedMedianCoverage - baselineMedianCoverage,
    baselineP5Coverage,
    acceptedP5Coverage,
    p5CoverageChange: acceptedP5Coverage - baselineP5Coverage,
    examplesAccepted: accepted.slice(0, 3).map((row) => row.board),
    examplesRejected: rows
      .filter((row) => !accepts(row))
      .slice(0, 3)
      .map((row) => row.board),
  };
}

function qualityScore(row: ResearchBoardMetrics): number {
  const vowelSpread = Math.min(
    row.vowelRows / row.size,
    row.vowelColumns / row.size,
    row.vowelQuadrants / 4,
  );
  const lowClump = 1 - Math.min(row.largestVowelComponent / row.tokenCount, 1);
  const lowRepeat =
    1 - Math.min(row.largestRepeatedTokenComponent / row.tokenCount, 1);
  const playability = Math.min(row.playableWordCount / (2 * row.size ** 3), 1);
  const coverage = row.cellCoverage;
  return (
    0.25 * vowelSpread +
    0.15 * lowClump +
    0.15 * lowRepeat +
    0.25 * playability +
    0.2 * coverage
  );
}

function longWordCount(row: ResearchBoardMetrics): number {
  return row.longPlayableWordCount;
}

function histogram(
  values: readonly number[],
): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  [...values]
    .sort((a, b) => a - b)
    .forEach((value) => {
      const key = String(value);
      result[key] = (result[key] ?? 0) + 1;
    });
  return result;
}

function categoryFor(index: number): string {
  return index < 3
    ? 'poor-vowels'
    : index < 6
      ? 'weak-words'
      : index < 9
        ? 'median'
        : 'strong';
}

function renderReport(
  summary: RenderableSummary,
  runtime: {
    milliseconds: number;
    boardsPerSecond: number;
    candidateAttempts: number;
    candidatesPerSecond: number;
    generationMilliseconds: number;
    generationCandidatesPerSecond: number;
    solverMilliseconds: number;
    solvedBoardsPerSecond: number;
  },
): string {
  const lines = [
    '# Board quality research',
    '',
    `Seed: \`${summary.seed}\`. Samples: ${summary.totalBoards.toLocaleString()} boards (${summary.boardsPerSize.toLocaleString()} each for 4 × 4, 5 × 5, and 6 × 6).`,
    '',
    'This is a deterministic, developer-only analysis of boards accepted by the current production generator. It changes no production rule and publishes no gameplay artifact.',
    '',
    '## Source-of-truth definitions',
    '',
    '- Generator: `generateDefaultBoard`, using the cap-of-two `DEFAULT_TILE_DISTRIBUTION`, size profiles, and eight-attempt bound.',
    '- Vowels: complete tokens `A`, `E`, `I`, `O`, `U`; `QU` is deliberately not a vowel.',
    '- Spatial convention: on odd grids, the neutral center row and column belong to no quadrant, so they do not arbitrarily favor one side or overstate spread.',
    '- Repeat clustering: component and window maxima are measured across every token; adjacent-edge counts include every equal-token neighboring pair once.',
    '- Adjacency: horizontal, vertical, and diagonal neighbors from `getAdjacentIndices`; no tile reuse.',
    '- Words: production dictionary normalized to uppercase ASCII; minimum length 3; `QU` is one board token but contributes two letters.',
    '- Score: normalized word length plus the existing +1 bonus for 3–4 letter unique words and +2 for longer unique words.',
    '',
    '### Production distribution',
    '',
    '| Token | Weight | Token | Weight | Token | Weight |',
    '| --- | ---: | --- | ---: | --- | ---: |',
  ];
  const distribution = summary.generator.distribution as {
    token: string;
    weight: number;
  }[];
  for (let index = 0; index < distribution.length; index += 3) {
    const cells = distribution
      .slice(index, index + 3)
      .flatMap((entry) => [entry.token, String(entry.weight)]);
    while (cells.length < 6) cells.push('');
    lines.push(`| ${cells.join(' | ')} |`);
  }
  lines.push(
    '',
    '### Current acceptance profiles',
    '',
    '| Size | Minimum vowels | Maximum vowels | Maximum identical tokens | Maximum attempts |',
    '| --- | ---: | ---: | ---: | ---: |',
  );
  for (const size of ['4', '5', '6']) {
    const profile = summary.generator.qualityProfiles[size];
    lines.push(
      `| ${size} × ${size} | ${profile.minimumVowelTokens} | ${profile.maximumVowelTokens} | ${profile.maximumIdenticalTokens} | ${profile.maximumAttempts} |`,
    );
  }
  lines.push(
    '',
    '## Runtime',
    '',
    `- Analysis time: ${runtime.milliseconds.toLocaleString()} ms (${runtime.boardsPerSecond.toFixed(1)} boards/s; ${runtime.candidatesPerSecond.toFixed(1)} candidate boards/s).`,
    `- Accepted boards required ${runtime.candidateAttempts.toLocaleString()} generated candidates in this run.`,
    `- Generation alone took ${runtime.generationMilliseconds.toLocaleString()} ms (${runtime.generationCandidatesPerSecond.toFixed(1)} candidate boards/s). Solving accepted boards took ${runtime.solverMilliseconds.toLocaleString()} ms (${runtime.solvedBoardsPerSecond.toFixed(1)} solved boards/s).`,
    '- The solver uses a research-only prefix trie and production eight-direction adjacency; it stores only aggregate metrics and curated samples.',
    '',
    '## Key findings',
    '',
    `- Median playable-word counts were ${format(summary.sizes['4'].metrics.playableWordCount.p50)}, ${format(summary.sizes['5'].metrics.playableWordCount.p50)}, and ${format(summary.sizes['6'].metrics.playableWordCount.p50)} for 4 × 4, 5 × 5, and 6 × 6; the corresponding P5 counts were ${format(summary.sizes['4'].metrics.playableWordCount.p5)}, ${format(summary.sizes['5'].metrics.playableWordCount.p5)}, and ${format(summary.sizes['6'].metrics.playableWordCount.p5)}.`,
    `- Vowel count had only weak correlation with playable-word count (${formatRange(['4', '5', '6'].map((size) => summary.sizes[size].correlations.vowelCountVsWords))} across sizes). Vowel spread was somewhat more informative (${formatRange(['4', '5', '6'].map((size) => summary.sizes[size].correlations.vowelSpreadVsWords))}).`,
    `- Larger repeated-token components correlated negatively with playable-word count in every size (${format(summary.sizes['4'].correlations.repeatedClusteringVsWords)}, ${format(summary.sizes['5'].correlations.repeatedClusteringVsWords)}, and ${format(summary.sizes['6'].correlations.repeatedClusteringVsWords)}). Cell coverage had a consistently stronger positive relationship (${format(summary.sizes['4'].correlations.coverageVsWords)}, ${format(summary.sizes['5'].correlations.coverageVsWords)}, and ${format(summary.sizes['6'].correlations.coverageVsWords)}).`,
    `- The exploratory hybrid policy rejected ${format(summary.sizes['4'].policies[2].rejectionRate * 100)}%, ${format(summary.sizes['5'].policies[2].rejectionRate * 100)}%, and ${format(summary.sizes['6'].policies[2].rejectionRate * 100)}% while raising P5 playable-word counts by ${format(summary.sizes['4'].policies[2].p5WordsChange)}, ${format(summary.sizes['5'].policies[2].p5WordsChange)}, and ${format(summary.sizes['6'].policies[2].p5WordsChange)}. Its estimated generation-cost multipliers were ${format(summary.sizes['4'].policies[2].estimatedGenerationCostMultiplier ?? 0)}×, ${format(summary.sizes['5'].policies[2].estimatedGenerationCostMultiplier ?? 0)}×, and ${format(summary.sizes['6'].policies[2].estimatedGenerationCostMultiplier ?? 0)}× before solver cost.`,
    '- These are associations within generated boards, not evidence that any metric causes players to perceive a board as fair or fun.',
    '',
  );
  for (const size of ['4', '5', '6']) {
    const data = summary.sizes[size];
    lines.push(
      `## ${size} × ${size}`,
      '',
      '| Metric | Mean | P5 | P50 | P95 |',
      '| --- | ---: | ---: | ---: | ---: |',
    );
    for (const metric of [
      'vowelCount',
      'vowelQuadrants',
      'largestVowelComponent',
      'maximumRepeatedTokenCount',
      'playableWordCount',
      'longPlayableWordCount',
      'longestWordLength',
      'totalPossibleScore',
      'cellCoverage',
    ]) {
      const stats = data.metrics[metric];
      lines.push(
        `| ${metric} | ${format(stats.mean)} | ${format(stats.p5)} | ${format(stats.p50)} | ${format(stats.p95)} |`,
      );
    }
    lines.push(
      '',
      '### Playable words by length',
      '',
      '| Length | Mean | P5 | P50 | P95 |',
      '| --- | ---: | ---: | ---: | ---: |',
    );
    for (const bucket of WORD_LENGTH_BUCKETS) {
      const stats = data.wordLengthBuckets[bucket];
      lines.push(
        `| ${bucket} | ${format(stats.mean)} | ${format(stats.p5)} | ${format(stats.p50)} | ${format(stats.p95)} |`,
      );
    }
    lines.push(
      '',
      '### Correlations',
      '',
      ...Object.entries(data.correlations).map(
        ([name, value]) =>
          `- ${name}: **${format(value as number)}** (correlation, not causation).`,
      ),
      '',
      '### Offline policy experiments',
      '',
    );
    lines.push(
      '| Policy | Acceptance | Rejection | Cost multiplier | Solver | Median words (Δ) | P5 words (Δ) |',
      '| --- | ---: | ---: | ---: | :---: | ---: | ---: |',
    );
    for (const policy of data.policies)
      lines.push(
        `| ${policy.name} | ${format(policy.acceptanceRate * 100)}% | ${format(policy.rejectionRate * 100)}% | ${policy.estimatedGenerationCostMultiplier === null ? '—' : format(policy.estimatedGenerationCostMultiplier)}× | ${policy.requiresWordSolver ? 'yes' : 'no'} | ${format(policy.acceptedMedianWords)} (${signed(policy.medianWordsChange)}) | ${format(policy.acceptedP5Words)} (${signed(policy.p5WordsChange)}) |`,
      );
    lines.push('', 'Exact exploratory rules and secondary effects:');
    for (const policy of data.policies)
      lines.push(
        `- **${policy.name}:** ${policy.rules}. Median words length 5+ changed by ${signed(policy.medianLongWordsChange)}; P5 words length 5+ changed by ${signed(policy.p5LongWordsChange)}; median cell coverage changed by ${signed(policy.medianCoverageChange * 100)} percentage points; P5 coverage changed by ${signed(policy.p5CoverageChange * 100)} points.`,
      );
    lines.push(
      '',
      `The cost multiplier is the inverse observed acceptance rate, conditional on boards already accepted by production. Policies marked "yes" would additionally solve every candidate at roughly ${format(runtime.solverMilliseconds / summary.totalBoards)} ms per board on this host, so their true generation cost would exceed this lower-bound estimate. These thresholds are exploratory, not proven quality rules.`,
      '',
      '',
    );
  }
  lines.push(
    '## Interpretation and limitations',
    '',
    '- Low vowel count and vowel clustering are separate signals: a board can meet the composition minimum while concentrating vowels in one region.',
    '- Dictionary word count is useful for comparison but is not a complete measure of human enjoyment; obscure dictionary entries can inflate it.',
    '- Correlations describe this generated sample and do not establish causation. A quality gate based on word solving may add meaningful generation cost.',
    '- Recommended next experiment: run a small, physically reviewed A/B study comparing the current generator with the hybrid policy, measuring perceived fairness, replay desire, and time-to-first-word before considering any production rule change.',
    '',
  );
  return lines.join('\n');
}

function renderSamples(
  samples: Readonly<Record<string, readonly SampleBoard[]>>,
): string {
  const lines = [
    '# Curated board review set',
    '',
    'Exactly 12 deterministic samples per board size. IDs and source indexes are stable for the same seed and source revision.',
    '',
  ];
  for (const size of ['4', '5', '6']) {
    lines.push(`## ${size} × ${size}`, '');
    for (const sample of samples[size] ?? []) {
      lines.push(
        `### ${sample.sampleId} — ${sample.category}`,
        '',
        `Seed: \`${sample.seed}\`; source index: ${sample.index}`,
        '',
        '```text',
      );
      for (let row = 0; row < Number(size); row += 1)
        lines.push(
          sample.board
            .slice(row * Number(size), (row + 1) * Number(size))
            .join(' '),
        );
      lines.push(
        '```',
        '',
        `- Vowels: ${sample.vowelCount}; rows ${sample.vowelRows}; columns ${sample.vowelColumns}; quadrants ${sample.vowelQuadrants}; largest vowel cluster ${sample.largestVowelComponent}.`,
        `- Largest repeated-token cluster: ${sample.largestRepeatedTokenComponent}; repeated-token edges: ${sample.repeatedTokenAdjacentEdges}.`,
        `- Playable words: ${sample.playableWordCount}; words length 5+: ${sample.longPlayableWordCount}; longest: ${sample.longestWordLength}; cell coverage: ${(sample.cellCoverage * 100).toFixed(1)}%.`,
        `- Representative longest words: ${sample.representativeLongestWords.join(', ') || 'none'}.`,
        '',
      );
    }
  }
  return lines.join('\n');
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${format(value)}`;
}

function formatRange(values: readonly number[]): string {
  return `${format(Math.min(...values))} to ${format(Math.max(...values))}`;
}

void main();
