import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  generateDefaultBoard,
  loadProductionDictionary,
  MEDIAN_BOARD_CANDIDATE_POOL_SIZE,
  MEDIAN_BOARD_TARGETS,
  selectMedianBoard,
} from '@words/game-data';
import { format as formatWithPrettier } from 'prettier';

import {
  createSeededRandom,
  percentile,
  RESEARCH_SIZES,
} from '../packages/game-data/src/board-quality-research.ts';

const AUDIT_SEED = 'median-board-selection-v1';
const DEFAULT_SELECTIONS_PER_SIZE = 5_000;
const REPORTED_PERCENTILES = [5, 10, 25, 50, 75, 90, 95] as const;

interface Options {
  readonly count: number;
  readonly poolSize: number;
  readonly output: string;
  readonly baseline: string;
}

interface SelectionRow {
  readonly playableWordCount: number;
  readonly longPlayableWordCount: number;
  readonly cellCoverage: number;
  readonly largestRepeatedTokenComponent: number;
  readonly winnerPosition: number;
  readonly successfulCandidateCount: number;
  readonly totalGenerationAttempts: number;
}

interface RuntimeRow {
  readonly totalMilliseconds: number;
  readonly generationMilliseconds: number;
}

function parseArgs(argv: readonly string[]): Options {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument?.startsWith('--')) continue;
    const [key, inlineValue] = argument.slice(2).split('=', 2);
    const value = inlineValue ?? argv[++index];
    if (key && value) values.set(key, value);
  }

  const count = Number(values.get('count') ?? DEFAULT_SELECTIONS_PER_SIZE);
  const poolSize = Number(
    values.get('pool') ?? MEDIAN_BOARD_CANDIDATE_POOL_SIZE,
  );
  if (!Number.isInteger(count) || count <= 0 || count > 50_000) {
    throw new Error('--count must be an integer from 1 to 50000.');
  }
  if (!Number.isInteger(poolSize) || (poolSize !== 8 && poolSize !== 12)) {
    throw new Error('--pool must be either 8 or 12.');
  }

  return {
    count,
    poolSize,
    output:
      values.get('output') ??
      'docs/board-quality-research/generated/median-selection-summary.json',
    baseline:
      values.get('baseline') ??
      'docs/board-quality-research/generated/summary.json',
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const [dictionaryResult, baselineText] = await Promise.all([
    loadProductionDictionary(),
    readFile(options.baseline, 'utf8'),
  ]);
  if (!dictionaryResult.success) {
    throw new Error(
      `Production dictionary failed to load: ${dictionaryResult.code}`,
    );
  }

  const baseline = JSON.parse(baselineText) as {
    readonly sizes: Readonly<
      Record<
        string,
        {
          readonly metrics: Readonly<
            Record<string, Readonly<Record<'p25' | 'p50' | 'p75', number>>>
          >;
        }
      >
    >;
  };
  const summaries: Record<string, unknown> = {};
  const runtimes: Record<string, unknown> = {};

  for (const size of RESEARCH_SIZES) {
    const random = createSeededRandom(`${AUDIT_SEED}:${size}`);
    const rows: SelectionRow[] = [];
    const runtimeRows: RuntimeRow[] = [];

    for (
      let selectionIndex = 0;
      selectionIndex < options.count;
      selectionIndex += 1
    ) {
      let generationMilliseconds = 0;
      const started = performance.now();
      const selected = selectMedianBoard({
        size,
        random,
        dictionary: dictionaryResult.dictionary,
        dictionaryWords: dictionaryResult.words,
        candidatePoolSize: options.poolSize,
        generateCandidate: (generationOptions) => {
          const generationStarted = performance.now();
          const result = generateDefaultBoard(generationOptions);
          generationMilliseconds += performance.now() - generationStarted;
          return result;
        },
      });
      const totalMilliseconds = performance.now() - started;
      if (!selected.success) {
        throw new Error(
          `Median selector produced no candidate for ${size}x${size} selection ${selectionIndex}.`,
        );
      }

      rows.push({
        ...selected.selectedMetrics,
        winnerPosition: selected.selectedCandidateIndex + 1,
        successfulCandidateCount: selected.successfulCandidateCount,
        totalGenerationAttempts: selected.totalGenerationAttempts,
      });
      runtimeRows.push({ totalMilliseconds, generationMilliseconds });
    }

    const baselineSize = baseline.sizes[String(size)];
    if (!baselineSize) {
      throw new Error(`Baseline summary is missing size ${size}.`);
    }
    const baselineTotal = baselineSize.metrics.playableWordCount!;
    const baselineLong = baselineSize.metrics.longPlayableWordCount!;
    const insideCount = rows.filter(
      (row) =>
        row.playableWordCount >= baselineTotal.p25 &&
        row.playableWordCount <= baselineTotal.p75,
    ).length;
    const insidePercentage = (insideCount / rows.length) * 100;
    const selectedTotal = summarizePercentiles(
      rows.map((row) => row.playableWordCount),
    );
    const selectedLong = summarizePercentiles(
      rows.map((row) => row.longPlayableWordCount),
    );
    const target = MEDIAN_BOARD_TARGETS[size];

    summaries[size] = {
      baseline: {
        playableWordCount: baselineTotal,
        longPlayableWordCount: baselineLong,
      },
      selected: {
        playableWordCount: selectedTotal,
        longPlayableWordCount: selectedLong,
        cellCoverage: summarizePercentiles(rows.map((row) => row.cellCoverage)),
        largestRepeatedTokenComponent: summarizePercentiles(
          rows.map((row) => row.largestRepeatedTokenComponent),
        ),
        winnerPosition: summarizePercentiles(
          rows.map((row) => row.winnerPosition),
        ),
      },
      insideOriginalInterquartileRangePercentage: insidePercentage,
      outsideOriginalInterquartileRangePercentage: 100 - insidePercentage,
      meanSuccessfulCandidates: mean(
        rows.map((row) => row.successfulCandidateCount),
      ),
      meanUnderlyingGenerationAttempts: mean(
        rows.map((row) => row.totalGenerationAttempts),
      ),
      distributionGoals: {
        medianWithinFivePercent:
          Math.abs(selectedTotal.p50 - target.playableWordCount) /
            target.playableWordCount <=
          0.05,
        p5AtLeastOriginalP25: selectedTotal.p5 >= baselineTotal.p25,
        p95AtMostOriginalP75: selectedTotal.p95 <= baselineTotal.p75,
        medianLongWordsInsideOriginalInterquartileRange:
          selectedLong.p50 >= baselineLong.p25 &&
          selectedLong.p50 <= baselineLong.p75,
        atLeastNinetyPercentInsideOriginalInterquartileRange:
          insidePercentage >= 90,
      },
    };

    const totalTimes = runtimeRows.map((row) => row.totalMilliseconds);
    const generationTimes = runtimeRows.map(
      (row) => row.generationMilliseconds,
    );
    const overheadTimes = runtimeRows.map(
      (row) => row.totalMilliseconds - row.generationMilliseconds,
    );
    runtimes[size] = {
      selectorMilliseconds: summarizeRuntime(totalTimes),
      generationMilliseconds: summarizeRuntime(generationTimes),
      solverAndRankingOverheadMilliseconds: summarizeRuntime(overheadTimes),
      p95Below25Milliseconds: percentile(totalTimes, 95) < 25,
    };
  }

  const output = {
    schemaVersion: 1,
    seed: AUDIT_SEED,
    selectionsPerSize: options.count,
    candidatePoolSize: options.poolSize,
    targets: MEDIAN_BOARD_TARGETS,
    ranking: [
      'smallest absolute normalized total-word deviation',
      'smallest absolute normalized length-5+-word deviation',
      'highest cell coverage',
      'smallest largest repeated-token component',
      'earliest candidate generation index',
    ],
    sizes: summaries,
  };

  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(
    options.output,
    await formatWithPrettier(JSON.stringify(output), { parser: 'json' }),
  );
  console.log(
    JSON.stringify(
      {
        seed: AUDIT_SEED,
        selectionsPerSize: options.count,
        candidatePoolSize: options.poolSize,
        runtime: runtimes,
        output: options.output,
      },
      null,
      2,
    ),
  );
}

function summarizePercentiles(values: readonly number[]) {
  return Object.fromEntries(
    REPORTED_PERCENTILES.map((percentage) => [
      `p${percentage}`,
      percentile(values, percentage),
    ]),
  ) as Record<`p${(typeof REPORTED_PERCENTILES)[number]}`, number>;
}

function summarizeRuntime(values: readonly number[]) {
  return {
    mean: mean(values),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    maximum: Math.max(...values),
  };
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

await main();
