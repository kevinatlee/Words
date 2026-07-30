#!/usr/bin/env node

import { createHash } from 'node:crypto';

import { verifyDictionaryBundle } from './lib/dictionary-verification.mjs';

const REQUIRED_INCLUSIONS = Object.freeze({
  CanadianAndAmericanSpellings: Object.freeze([
    'COLOR',
    'COLOUR',
    'CENTER',
    'CENTRE',
    'THEATER',
    'THEATRE',
  ]),
  ordinaryInflections: Object.freeze([
    'CATS',
    'WALKED',
    'RUNNING',
    'FASTER',
    'FASTEST',
  ]),
  representativeLengths: Object.freeze(['CAT', 'CHARACTERISTICALLY']),
});

const REQUIRED_EXCLUSIONS = Object.freeze({
  belowMinimumLength: Object.freeze(['AT']),
  mixedCase: Object.freeze(['Kevin']),
  properNameOnly: Object.freeze(['KEVIN', 'MARY', 'LONDON', 'PARIS', 'CANADA']),
  abbreviations: Object.freeze(['NASA', 'FBI', 'HTTP', 'ASAP']),
  contractions: Object.freeze(["DON'T", 'DONT']),
  hyphenated: Object.freeze(['MOTHER-IN-LAW']),
  multiWord: Object.freeze(['ICE CREAM']),
  punctuationAndDigits: Object.freeze(['R2D2', 'WORD!', 'WORD.']),
  accented: Object.freeze(['CAFÉ']),
  affixFragments: Object.freeze(['UN', 'NESS', 'LY', 'ING']),
  nonWordClasses: Object.freeze(['XVI']),
});

const SPELLING_PAIRS = Object.freeze([
  Object.freeze(['COLOR', 'COLOUR']),
  Object.freeze(['CENTER', 'CENTRE']),
  Object.freeze(['ORGANIZE', 'ORGANISE']),
]);
const PROPER_NAME_AMBIGUITY_WATCHLIST = Object.freeze([
  'JOHN',
  'CHINA',
  'ROSE',
  'ROBIN',
]);
const REPORT_SAMPLE_LIMIT = 25;
const LONG_WORD_THRESHOLD = 20;

function flattenFixtures(fixtures) {
  return Object.values(fixtures).flat();
}

function evenlySpacedSample(words, count) {
  return Array.from({ length: count }, (_, index) => {
    const wordIndex = Math.floor((index * (words.length - 1)) / (count - 1));
    return Object.freeze({ index: wordIndex, word: words[wordIndex] });
  });
}

function repeatedLetterRisk(word) {
  const counts = {};
  for (const letter of word) {
    counts[letter] = (counts[letter] ?? 0) + 1;
  }
  const maximum = Math.max(...Object.values(counts));
  return maximum >= 4 && maximum / word.length >= 0.3;
}

function createRiskCategory(words, predicate) {
  const matches = words.filter(predicate);
  return Object.freeze({
    count: matches.length,
    sample: Object.freeze(matches.slice(0, REPORT_SAMPLE_LIMIT)),
  });
}

const verified = await verifyDictionaryBundle();
const wordSet = new Set(verified.words);

const missingInclusions = flattenFixtures(REQUIRED_INCLUSIONS).filter(
  (word) => !wordSet.has(word),
);
if (missingInclusions.length > 0) {
  throw new Error(
    `VOCABULARY_INCLUSION: required fixtures missing: ${missingInclusions.join(', ')}`,
  );
}
const unexpectedInclusions = flattenFixtures(REQUIRED_EXCLUSIONS).filter(
  (word) => wordSet.has(word),
);
if (unexpectedInclusions.length > 0) {
  throw new Error(
    `VOCABULARY_EXCLUSION: excluded fixtures present: ${unexpectedInclusions.join(', ')}`,
  );
}

const report = {
  schemaVersion: 1,
  dictionarySha256: verified.sha256,
  wordCount: verified.words.length,
  requiredInclusions: REQUIRED_INCLUSIONS,
  requiredExclusions: REQUIRED_EXCLUSIONS,
  spellingPairs: SPELLING_PAIRS.map(([first, second]) =>
    Object.freeze({
      first,
      firstIncluded: wordSet.has(first),
      second,
      secondIncluded: wordSet.has(second),
    }),
  ),
  policyObservation:
    'ORGANIZE is present and ORGANISE is absent in the exact pinned export. The audit records that upstream result without silently adding a spelling.',
  riskReview: {
    qNotFollowedByU: createRiskCategory(verified.words, (word) =>
      /Q(?!U)/u.test(word),
    ),
    unusuallyLong: {
      threshold: `more than ${LONG_WORD_THRESHOLD} letters`,
      ...createRiskCategory(
        verified.words,
        (word) => word.length > LONG_WORD_THRESHOLD,
      ),
    },
    repeatedLetterHeavy: {
      definition:
        'one letter occurs at least four times and at least 30% of the word',
      ...createRiskCategory(verified.words, repeatedLetterRisk),
    },
    possibleAcronymLike: {
      definition:
        'three through six letters with no A, E, I, O, U, or Y; this is a review heuristic, not a deletion rule',
      ...createRiskCategory(
        verified.words,
        (word) => word.length <= 6 && !/[AEIOUY]/u.test(word),
      ),
    },
    possibleProperNameLeakage: {
      definition:
        'repository-owned ambiguity watchlist; present entries also have ordinary common-word senses',
      entries: PROPER_NAME_AMBIGUITY_WATCHLIST.map((word) =>
        Object.freeze({ word, included: wordSet.has(word) }),
      ),
    },
    sensitiveOrOffensiveTerms: {
      status: 'not-measured',
      reason:
        'No reliable, compatible, version-pinned sensitive-term classifier is bundled. Dictionary validity and future presentation moderation remain separate.',
    },
  },
  deterministicSortedSample: evenlySpacedSample(verified.words, 20),
};
const serialized = JSON.stringify(report);
const reportSha256 = createHash('sha256').update(serialized).digest('hex');

console.log(JSON.stringify({ ...report, reportSha256 }, null, 2));
