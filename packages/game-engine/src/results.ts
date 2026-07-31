import { scoreWordByLength, type WordPoints } from './scoring.js';

export const MAX_RECONCILIATION_PARTICIPANTS = 8;
export const MAX_RECONCILIATION_WORDS_PER_PARTICIPANT = 256;

export type ReconciliationAcceptedWord = {
  readonly word: string;
  readonly points: WordPoints;
};

export type UniqueBonusPoints = 0 | 1 | 2;

export type FinalWordPoints = number;

export type ReconciliationParticipant = {
  readonly playerId: string;
  readonly acceptedWords: readonly ReconciliationAcceptedWord[];
};

export type ReconciledWord = {
  readonly word: string;
  readonly basePoints: WordPoints;
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
  | 'INVALID_INPUT'
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

function uniqueBonusFor(points: WordPoints): Exclude<UniqueBonusPoints, 0> {
  return points <= 4 ? 1 : 2;
}

function finalPointsFor(points: WordPoints, shared: boolean): FinalWordPoints {
  return points + (shared ? 0 : uniqueBonusFor(points));
}

function reconcileRoundWordsChecked(
  participants: readonly ReconciliationParticipant[],
): RoundReconciliationResult {
  if (!Array.isArray(participants)) {
    return failure('NO_PARTICIPANTS');
  }
  const participantCount = participants.length;
  if (!Number.isInteger(participantCount) || participantCount === 0) {
    return failure('NO_PARTICIPANTS');
  }
  if (participantCount > MAX_RECONCILIATION_PARTICIPANTS) {
    return failure('TOO_MANY_PARTICIPANTS');
  }

  const participantIds = new Set<string>();
  const wordPlayerCounts = new Map<string, number>();
  const validatedParticipants: ReconciliationParticipant[] = [];

  for (
    let participantIndex = 0;
    participantIndex < participantCount;
    participantIndex += 1
  ) {
    const participant = participants[participantIndex];
    const playerId = participant?.playerId;
    if (!participant || typeof playerId !== 'string' || playerId.length === 0) {
      return failure('INVALID_PLAYER_ID', participantIndex);
    }
    if (participantIds.has(playerId)) {
      return failure('DUPLICATE_PLAYER_ID', participantIndex);
    }
    participantIds.add(playerId);

    const acceptedWords = participant.acceptedWords;
    if (!Array.isArray(acceptedWords)) {
      return failure('TOO_MANY_WORDS', participantIndex);
    }
    const wordCount = acceptedWords.length;
    if (
      !Number.isInteger(wordCount) ||
      wordCount > MAX_RECONCILIATION_WORDS_PER_PARTICIPANT
    ) {
      return failure('TOO_MANY_WORDS', participantIndex);
    }

    const participantWords = new Set<string>();
    const validatedWords: ReconciliationAcceptedWord[] = [];
    for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
      const acceptedWord = acceptedWords[wordIndex];
      const word = acceptedWord?.word;
      const points = acceptedWord?.points;
      const scored = scoreWordByLength(word);
      if (!acceptedWord || !scored.valid || scored.word !== word) {
        return failure('INVALID_WORD', participantIndex, wordIndex);
      }
      if (participantWords.has(word)) {
        return failure('DUPLICATE_WORD', participantIndex, wordIndex);
      }
      if (points !== scored.points) {
        return failure('INCORRECT_BASE_POINTS', participantIndex, wordIndex);
      }
      participantWords.add(word);
      wordPlayerCounts.set(word, (wordPlayerCounts.get(word) ?? 0) + 1);
      validatedWords.push(Object.freeze({ word, points }));
    }
    validatedParticipants.push(
      Object.freeze({
        playerId,
        acceptedWords: Object.freeze(validatedWords),
      }),
    );
  }

  const reconciledParticipants = validatedParticipants.map((participant) => {
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

export function reconcileRoundWords(
  participants: readonly ReconciliationParticipant[],
): RoundReconciliationResult {
  try {
    return reconcileRoundWordsChecked(participants);
  } catch {
    return failure('INVALID_INPUT');
  }
}
