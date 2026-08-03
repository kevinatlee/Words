#!/usr/bin/env node

import { createHash } from 'node:crypto';

import { generateBoard } from '@words/game-engine';

import {
  DEFAULT_BOARD_QUALITY_PROFILES,
  DEFAULT_TILE_DISTRIBUTION,
  generateDefaultBoard,
} from '../src/index.ts';
import { createAuditRandom } from './lib/distribution-model.mjs';

const BOARD_SAMPLE_SIZE = 10_000;
const MAX_ACCEPTED_SAMPLE_INVOCATIONS = 12_000;
const VOWEL_TOKENS = Object.freeze(['A', 'E', 'I', 'O', 'U']);
const BASE_SEED = 0xb04d4a11;

function round(value, places = 6) {
  const multiplier = 10 ** places;
  return Math.round(value * multiplier) / multiplier;
}

function createMetrics(size) {
  return {
    boards: 0,
    tiles: 0,
    vowelCounts: Array(size * size + 1).fill(0),
    maximumRepeatCounts: Array(size * size + 1).fill(0),
    tokenCounts: Object.fromEntries(
      DEFAULT_TILE_DISTRIBUTION.map(({ token }) => [token, 0]),
    ),
    boardsWithQu: 0,
  };
}

function recordBoard(metrics, board) {
  const counts = {};
  let vowels = 0;
  let hasQu = false;
  for (const token of board.tiles) {
    metrics.tokenCounts[token] += 1;
    counts[token] = (counts[token] ?? 0) + 1;
    if (VOWEL_TOKENS.includes(token)) {
      vowels += 1;
    }
    if (token === 'QU') {
      hasQu = true;
    }
  }
  const maximumRepeat = Math.max(...Object.values(counts));
  metrics.boards += 1;
  metrics.tiles += board.tiles.length;
  metrics.vowelCounts[vowels] += 1;
  metrics.maximumRepeatCounts[maximumRepeat] += 1;
  if (hasQu) {
    metrics.boardsWithQu += 1;
  }
}

function compactHistogram(histogram) {
  return histogram
    .map((count, value) => ({ value, count }))
    .filter(({ count }) => count > 0);
}

function finishMetrics(metrics) {
  const totalWeight = DEFAULT_TILE_DISTRIBUTION.reduce(
    (total, entry) => total + entry.weight,
    0,
  );
  const meanVowels =
    metrics.vowelCounts.reduce(
      (total, count, value) => total + count * value,
      0,
    ) / metrics.boards;
  const meanMaximumRepeat =
    metrics.maximumRepeatCounts.reduce(
      (total, count, value) => total + count * value,
      0,
    ) / metrics.boards;

  return {
    boards: metrics.boards,
    meanVowelTokens: round(meanVowels),
    vowelCountDistribution: compactHistogram(metrics.vowelCounts),
    meanMaximumRepeatedToken: round(meanMaximumRepeat),
    maximumRepeatDistribution: compactHistogram(metrics.maximumRepeatCounts),
    boardsWithQuPercent: round((metrics.boardsWithQu / metrics.boards) * 100),
    tokenRates: DEFAULT_TILE_DISTRIBUTION.map(({ token, weight }) => {
      const expectedPercent = (weight / totalWeight) * 100;
      const observedPercent =
        (metrics.tokenCounts[token] / metrics.tiles) * 100;
      return {
        token,
        expectedPercent: round(expectedPercent),
        observedPercent: round(observedPercent),
        differencePercentagePoints: round(observedPercent - expectedPercent),
      };
    }),
  };
}

function auditSize(size, seed) {
  const rawRandom = createAuditRandom(seed ^ 0x2c1b3c6d);
  const acceptedRandom = createAuditRandom(seed ^ 0x8f5a20b9);
  const rawMetrics = createMetrics(size);
  const acceptedMetrics = createMetrics(size);

  for (let index = 0; index < BOARD_SAMPLE_SIZE; index += 1) {
    const generated = generateBoard({
      size,
      distribution: DEFAULT_TILE_DISTRIBUTION,
      random: rawRandom,
    });
    if (!generated.success) {
      throw new Error('Raw board generation unexpectedly failed.');
    }
    recordBoard(rawMetrics, generated.board);
  }

  const attempts = Array(
    DEFAULT_BOARD_QUALITY_PROFILES[size].maximumAttempts + 1,
  ).fill(0);
  let invocations = 0;
  let failures = 0;
  let candidateAttempts = 0;
  while (
    acceptedMetrics.boards < BOARD_SAMPLE_SIZE &&
    invocations < MAX_ACCEPTED_SAMPLE_INVOCATIONS
  ) {
    invocations += 1;
    const generated = generateDefaultBoard({ size, random: acceptedRandom });
    candidateAttempts += generated.attempts;
    if (!generated.success) {
      failures += 1;
      continue;
    }
    attempts[generated.attempts] += 1;
    recordBoard(acceptedMetrics, generated.board);
  }
  if (acceptedMetrics.boards !== BOARD_SAMPLE_SIZE) {
    throw new Error(
      `Accepted size-${size} audit did not reach ${BOARD_SAMPLE_SIZE} boards within its bound.`,
    );
  }

  const successfulInvocations = invocations - failures;
  const rejectedCandidates = candidateAttempts - successfulInvocations;
  return {
    size,
    qualityProfile: DEFAULT_BOARD_QUALITY_PROFILES[size],
    raw: finishMetrics(rawMetrics),
    accepted: finishMetrics(acceptedMetrics),
    acceptedGeneration: {
      invocations,
      successfulBoards: successfulInvocations,
      failures,
      failurePercent: round((failures / invocations) * 100),
      candidateAttempts,
      rejectedCandidates,
      rejectionPercent: round((rejectedCandidates / candidateAttempts) * 100),
      meanAttempts: round(candidateAttempts / invocations),
      successfulAttemptDistribution: compactHistogram(attempts),
    },
  };
}

function createReport() {
  return {
    schemaVersion: 1,
    sampleBoardsPerSize: BOARD_SAMPLE_SIZE,
    randomSource:
      'Seeded xorshift32 for deterministic audit/test evaluation only; not suitable for production board generation.',
    baseSeed: `0x${BASE_SEED.toString(16)}`,
    sizes: [4, 5, 6].map((size) => auditSize(size, (BASE_SEED ^ size) >>> 0)),
  };
}

const firstReport = createReport();
const secondReport = createReport();
const firstSerialized = JSON.stringify(firstReport);
if (firstSerialized !== JSON.stringify(secondReport)) {
  throw new Error('Board audit was not deterministic for the fixed seed.');
}
const reportSha256 = createHash('sha256').update(firstSerialized).digest('hex');

console.log(
  JSON.stringify(
    { ...firstReport, deterministicReportSha256: reportSha256 },
    null,
    2,
  ),
);
