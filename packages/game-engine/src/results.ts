import { scoreTraditionalWord, type TraditionalPoints } from './scoring.js';

export const MAX_RECONCILIATION_PARTICIPANTS = 8;
export const MAX_RECONCILIATION_WORDS_PER_PARTICIPANT = 256;

export type ReconciliationAcceptedWord = {
  readonly word: string;
  readonly points: TraditionalPoints;
};

export type UniqueBonusPoints = 0 | 0.25 | 0.5 | 0.75 | 1.25 | 2.75;

export type FinalWordPoints =
  1 | 1.25 | 2 | 2.5 | 3 | 3.75 | 5 | 6.25 | 11 | 13.75;

export type ReconciliationParticipant = {
  readonly playerId: string;
  readonly acceptedWords: readonly ReconciliationAcceptedWord[];
};

export type ReconciledWord = {
  readonly word: string;
  readonly basePoints: TraditionalPoints;
  readonly shared: boolean;
  readonly uniqueBonusPoints: UniqueBonusPoints;
  readonly finalPoints: FinalWordPoints;
};

export type ReconciledParticipant = {
  readonly playerId: string;
  readonly baseScore: number;
  readonly uniqueBonusScore: number;
  readonly finalScore: number;
  readonly words: readonly ReconciledWord[];
};

export type RoundReconciliationErrorCode =
  | 'NO_PARTICIPANTS'
  | 'TOO_MANY_PARTICIPANTS'
  | 'INVALID_PLAYER_ID'
  | 'DUPLICATE_PLAYER_ID'
  | 'TOO_MANY_WORDS'
  | 'INVALID_WORD'
  | 'DUPLICATE_WORD'
  | 'INCORRECT_BASE_POINTS';

export type RoundReconciliationResult =
  | {
      readonly success: true;
      readonly participants: readonly ReconciledParticipant[];
    }
  | {
      readonly success: false;
      readonly code: RoundReconciliationErrorCode;
      readonly participantIndex?: number;
      readonly wordIndex?: number;
    };

function failure(
  code: RoundReconciliationErrorCode,
  participantIndex?: number,
  wordIndex?: number,
): RoundReconciliationResult {
  return Object.freeze({
    success: false,
    code,
    ...(participantIndex === undefined ? {} : { participantIndex }),
    ...(wordIndex === undefined ? {} : { wordIndex }),
  });
}

function uniqueBonusFor(
  points: TraditionalPoints,
): Exclude<UniqueBonusPoints, 0> {
  switch (points) {
    case 1:
      return 0.25;
    case 2:
      return 0.5;
    case 3:
      return 0.75;
    case 5:
      return 1.25;
    case 11:
      return 2.75;
  }
}

function finalPointsFor(
  points: TraditionalPoints,
  shared: boolean,
): FinalWordPoints {
  if (shared) {
    return points;
  }
  switch (points) {
    case 1:
      return 1.25;
    case 2:
      return 2.5;
    case 3:
      return 3.75;
    case 5:
      return 6.25;
    case 11:
      return 13.75;
  }
}

export function reconcileRoundWords(
  participants: readonly ReconciliationParticipant[],
): RoundReconciliationResult {
  if (!Array.isArray(participants) || participants.length === 0) {
    return failure('NO_PARTICIPANTS');
  }
  if (participants.length > MAX_RECONCILIATION_PARTICIPANTS) {
    return failure('TOO_MANY_PARTICIPANTS');
  }

  const participantIds = new Set<string>();
  const wordPlayerCounts = new Map<string, number>();

  for (
    let participantIndex = 0;
    participantIndex < participants.length;
    participantIndex += 1
  ) {
    const participant = participants[participantIndex];
    if (
      !participant ||
      typeof participant.playerId !== 'string' ||
      participant.playerId.length === 0
    ) {
      return failure('INVALID_PLAYER_ID', participantIndex);
    }
    if (participantIds.has(participant.playerId)) {
      return failure('DUPLICATE_PLAYER_ID', participantIndex);
    }
    participantIds.add(participant.playerId);

    if (
      !Array.isArray(participant.acceptedWords) ||
      participant.acceptedWords.length >
        MAX_RECONCILIATION_WORDS_PER_PARTICIPANT
    ) {
      return failure('TOO_MANY_WORDS', participantIndex);
    }

    const participantWords = new Set<string>();
    for (
      let wordIndex = 0;
      wordIndex < participant.acceptedWords.length;
      wordIndex += 1
    ) {
      const acceptedWord = participant.acceptedWords[wordIndex];
      const scored = scoreTraditionalWord(acceptedWord?.word);
      if (!acceptedWord || !scored.valid || scored.word !== acceptedWord.word) {
        return failure('INVALID_WORD', participantIndex, wordIndex);
      }
      if (participantWords.has(acceptedWord.word)) {
        return failure('DUPLICATE_WORD', participantIndex, wordIndex);
      }
      if (acceptedWord.points !== scored.points) {
        return failure('INCORRECT_BASE_POINTS', participantIndex, wordIndex);
      }
      participantWords.add(acceptedWord.word);
      wordPlayerCounts.set(
        acceptedWord.word,
        (wordPlayerCounts.get(acceptedWord.word) ?? 0) + 1,
      );
    }
  }

  const reconciledParticipants = participants.map((participant) => {
    let baseScore = 0;
    let uniqueBonusScore = 0;
    let finalScore = 0;
    const words = participant.acceptedWords.map(
      (acceptedWord: ReconciliationAcceptedWord) => {
        const shared = (wordPlayerCounts.get(acceptedWord.word) ?? 0) >= 2;
        const uniqueBonusPoints = shared
          ? 0
          : uniqueBonusFor(acceptedWord.points);
        const finalPoints = finalPointsFor(acceptedWord.points, shared);
        baseScore += acceptedWord.points;
        uniqueBonusScore += uniqueBonusPoints;
        finalScore += finalPoints;
        return Object.freeze({
          word: acceptedWord.word,
          basePoints: acceptedWord.points,
          shared,
          uniqueBonusPoints,
          finalPoints,
        });
      },
    );

    return Object.freeze({
      playerId: participant.playerId,
      baseScore,
      uniqueBonusScore,
      finalScore,
      words: Object.freeze(words),
    });
  });

  return Object.freeze({
    success: true,
    participants: Object.freeze(reconciledParticipants),
  });
}
