import { createHash } from 'node:crypto';

export const DISTRIBUTION_SCRIPT_VERSION = '1.0.0';
export const DISTRIBUTION_SAMPLE_BOARDS = 10_000;
export const VOWEL_TOKENS = Object.freeze(['A', 'E', 'I', 'O', 'U']);
export const RARE_TOKENS = Object.freeze(['J', 'QU', 'X', 'Z']);
export const TOKEN_ORDER = Object.freeze([
  'A',
  'B',
  'C',
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
  'N',
  'O',
  'P',
  'QU',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
]);

const CANDIDATE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'raw-character-frequency',
    description:
      'Every ASCII character in every accepted dictionary word contributes once.',
    cap: null,
    advantages: Object.freeze([
      'Directly represents the complete accepted dictionary corpus.',
      'Simple to reproduce and explain.',
      'Retains natural repeated-letter signals.',
    ]),
    disadvantages: Object.freeze([
      'Long words contribute more weight than short words.',
      'Repeated letters in one word contribute without a per-word limit.',
    ]),
  }),
  Object.freeze({
    id: 'per-word-presence',
    description:
      'Each letter contributes at most once for each accepted dictionary word.',
    cap: 1,
    advantages: Object.freeze([
      'Every word has equal maximum influence on one letter.',
      'Strongly limits repeated-letter amplification.',
    ]),
    disadvantages: Object.freeze([
      'Discards all within-word repetition information.',
      'Produces the lowest vowel share of the evaluated candidates.',
    ]),
  }),
  Object.freeze({
    id: 'per-word-capped-occurrence-2',
    description:
      'Each letter contributes at most twice for each accepted dictionary word.',
    cap: 2,
    advantages: Object.freeze([
      'Keeps useful repeated-letter evidence while bounding each word’s influence.',
      'Preserves a vowel share close to the raw corpus.',
      'Uses a single transparent integer cap with no blended or proprietary table.',
    ]),
    disadvantages: Object.freeze([
      'The cap is a project policy rather than a linguistic law.',
      'A third or later repeated occurrence in one word does not add weight.',
    ]),
  }),
]);

function round(value, places = 6) {
  const multiplier = 10 ** places;
  return Math.round(value * multiplier) / multiplier;
}

export function createAuditRandom(seed) {
  let state = seed >>> 0;
  if (state === 0) {
    state = 0x6d2b79f5;
  }
  return Object.freeze({
    next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4_294_967_296;
    },
  });
}

function countLetters(words, cap) {
  const counts = Object.fromEntries(
    [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((letter) => [letter, 0]),
  );

  for (const word of words) {
    if (cap === null) {
      for (const letter of word) {
        counts[letter] += 1;
      }
      continue;
    }

    const wordCounts = {};
    for (const letter of word) {
      wordCounts[letter] = (wordCounts[letter] ?? 0) + 1;
    }
    for (const [letter, count] of Object.entries(wordCounts)) {
      counts[letter] += Math.min(cap, count);
    }
  }

  return counts;
}

function toTokenWeights(letterCounts) {
  return TOKEN_ORDER.map((token) =>
    Object.freeze({
      token,
      weight: token === 'QU' ? letterCounts.Q : letterCounts[token],
    }),
  );
}

function selectToken(tokenWeights, totalWeight, randomValue) {
  let target = randomValue * totalWeight;
  for (const entry of tokenWeights) {
    if (target < entry.weight) {
      return entry.token;
    }
    target -= entry.weight;
  }
  return tokenWeights.at(-1).token;
}

function simulateRawBoards(tokenWeights, totalWeight, size, seed) {
  const random = createAuditRandom(seed);
  const observed = Object.fromEntries(TOKEN_ORDER.map((token) => [token, 0]));
  let totalVowels = 0;
  let totalMaximumRepeat = 0;
  let boardsWithRepeat = 0;
  let boardsWithTriple = 0;

  for (
    let boardIndex = 0;
    boardIndex < DISTRIBUTION_SAMPLE_BOARDS;
    boardIndex += 1
  ) {
    const counts = {};
    let vowelCount = 0;
    for (let index = 0; index < size * size; index += 1) {
      const token = selectToken(tokenWeights, totalWeight, random.next());
      observed[token] += 1;
      counts[token] = (counts[token] ?? 0) + 1;
      if (VOWEL_TOKENS.includes(token)) {
        vowelCount += 1;
      }
    }
    const maximumRepeat = Math.max(...Object.values(counts));
    totalVowels += vowelCount;
    totalMaximumRepeat += maximumRepeat;
    if (maximumRepeat >= 2) {
      boardsWithRepeat += 1;
    }
    if (maximumRepeat >= 3) {
      boardsWithTriple += 1;
    }
  }

  const totalTiles = DISTRIBUTION_SAMPLE_BOARDS * size * size;
  return Object.freeze({
    size,
    boardCount: DISTRIBUTION_SAMPLE_BOARDS,
    meanVowelTokens: round(totalVowels / DISTRIBUTION_SAMPLE_BOARDS),
    meanMaximumRepeatedToken: round(
      totalMaximumRepeat / DISTRIBUTION_SAMPLE_BOARDS,
    ),
    boardsWithRepeatedTokenPercent: round(
      (boardsWithRepeat / DISTRIBUTION_SAMPLE_BOARDS) * 100,
    ),
    boardsWithTripleTokenPercent: round(
      (boardsWithTriple / DISTRIBUTION_SAMPLE_BOARDS) * 100,
    ),
    observedTokenPercentages: TOKEN_ORDER.map((token) =>
      Object.freeze({
        token,
        percent: round((observed[token] / totalTiles) * 100),
      }),
    ),
  });
}

function buildCandidate(words, definition, candidateIndex) {
  const letterCounts = countLetters(words, definition.cap);
  const tokenWeights = toTokenWeights(letterCounts);
  const totalWeight = tokenWeights.reduce(
    (total, entry) => total + entry.weight,
    0,
  );
  const vowelWeight = tokenWeights
    .filter((entry) => VOWEL_TOKENS.includes(entry.token))
    .reduce((total, entry) => total + entry.weight, 0);
  const rareWeight = tokenWeights
    .filter((entry) => RARE_TOKENS.includes(entry.token))
    .reduce((total, entry) => total + entry.weight, 0);
  const quWeight = tokenWeights.find((entry) => entry.token === 'QU').weight;

  return Object.freeze({
    id: definition.id,
    description: definition.description,
    perWordLetterCap: definition.cap,
    tokenWeights,
    totalWeight,
    normalizedPercentages: tokenWeights.map((entry) =>
      Object.freeze({
        token: entry.token,
        percent: round((entry.weight / totalWeight) * 100),
      }),
    ),
    vowelTokenPercent: round((vowelWeight / totalWeight) * 100),
    rareTokenPercent: round((rareWeight / totalWeight) * 100),
    expectedQuTokenPercent: round((quWeight / totalWeight) * 100),
    repeatBehaviour:
      definition.cap === null
        ? 'All repeated occurrences contribute.'
        : definition.cap === 1
          ? 'Repeated occurrences within one word do not add weight.'
          : 'Up to two occurrences of one letter per word contribute.',
    rawBoardSimulations: [4, 5, 6].map((size) =>
      simulateRawBoards(
        tokenWeights,
        totalWeight,
        size,
        (0x57a6e4d1 ^ (candidateIndex << 12) ^ size) >>> 0,
      ),
    ),
    advantages: definition.advantages,
    disadvantages: definition.disadvantages,
  });
}

function profileHash(profileCore) {
  return createHash('sha256').update(JSON.stringify(profileCore)).digest('hex');
}

export function deriveDistributionArtifacts(words, dictionarySha256) {
  const candidates = CANDIDATE_DEFINITIONS.map((definition, index) =>
    buildCandidate(words, definition, index),
  );
  const selected = candidates.find(
    (candidate) => candidate.id === 'per-word-capped-occurrence-2',
  );
  if (selected === undefined) {
    throw new Error('Selected distribution candidate is missing.');
  }

  const profileCore = {
    schemaVersion: 1,
    dictionarySha256,
    generationScriptVersion: DISTRIBUTION_SCRIPT_VERSION,
    derivationMethod: selected.id,
    derivationDescription: selected.description,
    quPolicy:
      'Map the derived Q weight to QU; omit standalone Q; retain U unchanged.',
    vowelTokens: [...VOWEL_TOKENS],
    tokenWeights: selected.tokenWeights.map((entry) => ({ ...entry })),
    totalWeight: selected.totalWeight,
    adjustments: [],
  };
  const profile = {
    ...profileCore,
    profileSha256: profileHash(profileCore),
  };
  const candidateReport = {
    schemaVersion: 1,
    dictionarySha256,
    generationScriptVersion: DISTRIBUTION_SCRIPT_VERSION,
    sampleBoardsPerSize: DISTRIBUTION_SAMPLE_BOARDS,
    auditRandomSource:
      'Seeded xorshift32 for deterministic audit/test evaluation only; not for production board generation.',
    vowelTokens: [...VOWEL_TOKENS],
    rareTokens: [...RARE_TOKENS],
    candidates,
    selection: {
      candidateId: selected.id,
      rationale:
        'The cap-of-two profile preserves nearly all raw-corpus vowel balance and meaningful repeated-letter evidence while bounding the influence of long repeated-letter words. It requires no blend and no adjustments.',
    },
  };

  return Object.freeze({
    candidates: candidateReport,
    profile,
    generatedTypeScript: renderGeneratedDistribution(profile),
  });
}

export function renderJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function renderGeneratedDistribution(profile) {
  const weights = profile.tokenWeights
    .map(
      ({ token, weight }) =>
        `    Object.freeze({ token: '${token}', weight: ${weight} }),`,
    )
    .join('\n');
  const vowels = profile.vowelTokens.map((token) => `'${token}'`).join(', ');

  return `/* This file is generated by scripts/derive-distribution.mjs. */
export const GENERATED_DISTRIBUTION_DATA = Object.freeze({
  schemaVersion: ${profile.schemaVersion},
  dictionarySha256: '${profile.dictionarySha256}',
  generationScriptVersion: '${profile.generationScriptVersion}',
  derivationMethod: '${profile.derivationMethod}',
  derivationDescription:
    '${profile.derivationDescription}',
  quPolicy:
    '${profile.quPolicy}',
  vowelTokens: Object.freeze([${vowels}]),
  tokenWeights: Object.freeze([
${weights}
  ]),
  totalWeight: ${profile.totalWeight},
  adjustments: Object.freeze([]),
  profileSha256: '${profile.profileSha256}',
});
`;
}
