import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  loadProductionDictionary,
  selectStrongBoard,
  STRONG_BOARD_CANDIDATE_POOL_SIZE,
} from '@words/game-data';
import { format as formatWithPrettier } from 'prettier';

import {
  createSeededRandom,
  percentile,
  RESEARCH_SIZES,
} from '../packages/game-data/src/board-quality-research.ts';

const AUDIT_SEED = 'strong-board-selection-v1';
const DEFAULT_SELECTIONS_PER_SIZE = 500;
const REPORTED_PERCENTILES = [5, 50, 95] as const;

interface Options {
  readonly count: number;
  readonly output: string;
  readonly baseline: string;
}

interface SelectionRow {
  readonly playableWordCount: number;
  readonly longPlayableWordCount: number;
  readonly cellCoverage: number;
  readonly successfulCandidateCount: number;
  readonly totalGenerationAttempts: number;
}

interface BaselineMetric {
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly p5: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
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
  if (!Number.isInteger(count) || count <= 0 || count > 5_000) {
    throw new Error('--count must be an integer from 1 to 5000.');
  }

  return {
    count,
    output:
      values.get('output') ??
      'docs/board-quality-research/generated/strong-selection-summary.json',
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
          readonly metrics: {
            readonly playableWordCount: BaselineMetric;
            readonly longPlayableWordCount: BaselineMetric;
            readonly cellCoverage: BaselineMetric;
          };
        }
      >
    >;
  };
  const summaries: Record<string, unknown> = {};
  const runtimes: Record<string, unknown> = {};

  for (const size of RESEARCH_SIZES) {
    const random = createSeededRandom(`${AUDIT_SEED}:${size}`);
    const rows: SelectionRow[] = [];
    const runtimeMilliseconds: number[] = [];

    for (
      let selectionIndex = 0;
      selectionIndex < options.count;
      selectionIndex += 1
    ) {
      const started = performance.now();
      const selected = selectStrongBoard({
        size,
        random,
        dictionary: dictionaryResult.dictionary,
        dictionaryWords: dictionaryResult.words,
      });
      runtimeMilliseconds.push(performance.now() - started);
      if (!selected.success) {
        throw new Error(
          `Strong selector produced no candidate for ${size}x${size} selection ${selectionIndex}.`,
        );
      }

      rows.push({
        playableWordCount: selected.selectedMetrics.playableWordCount,
        longPlayableWordCount: selected.selectedMetrics.longPlayableWordCount,
        cellCoverage: selected.selectedMetrics.cellCoverage,
        successfulCandidateCount: selected.successfulCandidateCount,
        totalGenerationAttempts: selected.totalGenerationAttempts,
      });
    }

    const baselineSize = baseline.sizes[String(size)];
    if (!baselineSize) {
      throw new Error(`Baseline summary is missing size ${size}.`);
    }
    const selectedPlayableWords = summarizePercentiles(
      rows.map((row) => row.playableWordCount),
    );

    summaries[size] = {
      originalFiveThousandBoardCorpus: {
        playableWordCount: pickBaselinePercentiles(
          baselineSize.metrics.playableWordCount,
        ),
        longPlayableWordCount: pickBaselinePercentiles(
          baselineSize.metrics.longPlayableWordCount,
        ),
        cellCoverage: pickBaselinePercentiles(
          baselineSize.metrics.cellCoverage,
        ),
      },
      selected: {
        playableWordCount: selectedPlayableWords,
        longPlayableWordCount: summarizePercentiles(
          rows.map((row) => row.longPlayableWordCount),
        ),
        cellCoverage: summarizePercentiles(rows.map((row) => row.cellCoverage)),
      },
      upperTailComparison: {
        selectedP5MinusOriginalP95:
          selectedPlayableWords.p5 - baselineSize.metrics.playableWordCount.p95,
        selectedP50MinusOriginalP95:
          selectedPlayableWords.p50 -
          baselineSize.metrics.playableWordCount.p95,
        selectedP5AtOrAboveOriginalP95:
          selectedPlayableWords.p5 >=
          baselineSize.metrics.playableWordCount.p95,
      },
      meanSuccessfulCandidateCount: mean(
        rows.map((row) => row.successfulCandidateCount),
      ),
      meanUnderlyingGenerationAttempts: mean(
        rows.map((row) => row.totalGenerationAttempts),
      ),
    };
    runtimes[size] = summarizeRuntime(runtimeMilliseconds);
  }

  const output = {
    schemaVersion: 1,
    seed: AUDIT_SEED,
    selectionsPerSize: options.count,
    candidatePoolSize: STRONG_BOARD_CANDIDATE_POOL_SIZE,
    ranking: [
      'highest playable-word count',
      'highest cell coverage',
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
        candidatePoolSize: STRONG_BOARD_CANDIDATE_POOL_SIZE,
        runtimeMilliseconds: runtimes,
        output: options.output,
      },
      null,
      2,
    ),
  );
}

function pickBaselinePercentiles(metric: BaselineMetric) {
  return {
    min: metric.min,
    p5: metric.p5,
    p50: metric.p50,
    p95: metric.p95,
    p99: metric.p99,
    max: metric.max,
  };
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
  };
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

await main();
