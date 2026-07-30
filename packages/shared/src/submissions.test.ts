import { describe, expect, it } from 'vitest';

import {
  acceptedWordSchema,
  displayActionResponseSchema,
  maximumAcceptedWordsPerPlayerPerRound,
  playerActionResponseSchema,
  playerRoundSubmissionStateSchema,
  roomStateSchema,
  submissionErrorSchema,
  submitWordInputSchema,
  submitWordResponseSchema,
} from './lobby';

const roundId = '00000000-0000-4000-8000-000000000100';
const playerId = '00000000-0000-4000-8000-000000000001';

function accepted(sequence = 1, word = 'CAT', points = 1) {
  return {
    sequence,
    word,
    points,
    acceptedAt: '2026-07-30T20:00:01.000Z',
  };
}

function state(words = [accepted()]) {
  return {
    roundId,
    playerId,
    submissionVersion: words.length,
    acceptedWords: words,
    provisionalScore: words.reduce((sum, word) => sum + word.points, 0),
  };
}

describe('private submission contracts', () => {
  it('accepts only the strict bounded row-major submission payload', () => {
    const input = { roundId, word: 'CAT', path: [0, 1, 2] };
    expect(submitWordInputSchema.parse(input)).toEqual(input);
    for (const invalid of [
      { ...input, score: 1 },
      { ...input, playerId },
      { ...input, path: [] },
      { ...input, path: [36] },
      { ...input, path: [1.5] },
      { ...input, word: 'A'.repeat(65) },
    ]) {
      expect(submitWordInputSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('accepts canonical bounded accepted words', () => {
    expect(acceptedWordSchema.parse(accepted())).toEqual(accepted());
  });

  it.each([
    { ...accepted(), extra: true },
    { ...accepted(), sequence: 0 },
    { ...accepted(), word: 'cat' },
    { ...accepted(), word: 'AT' },
    { ...accepted(), points: 4 },
    { ...accepted(), acceptedAt: 'yesterday' },
  ])('rejects malformed accepted-word data %#', (candidate) => {
    expect(acceptedWordSchema.safeParse(candidate).success).toBe(false);
  });

  it('requires contiguous sequences and matching submission version', () => {
    expect(
      playerRoundSubmissionStateSchema.safeParse({
        ...state(),
        submissionVersion: 2,
      }).success,
    ).toBe(false);
    expect(
      playerRoundSubmissionStateSchema.safeParse({
        ...state([accepted(2)]),
      }).success,
    ).toBe(false);
  });

  it('requires unique words and an exact provisional sum', () => {
    const duplicate = [accepted(1), accepted(2)];
    expect(
      playerRoundSubmissionStateSchema.safeParse(state(duplicate)).success,
    ).toBe(false);
    expect(
      playerRoundSubmissionStateSchema.safeParse({
        ...state(),
        provisionalScore: 11,
      }).success,
    ).toBe(false);
  });

  it('accepts exactly 256 immutable accepted words', () => {
    const words = Array.from(
      { length: maximumAcceptedWordsPerPlayerPerRound },
      (_, index) =>
        accepted(
          index + 1,
          `${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}A`,
          1,
        ),
    );
    expect(
      playerRoundSubmissionStateSchema.safeParse(state(words)).success,
    ).toBe(true);
    expect(
      playerRoundSubmissionStateSchema.safeParse({
        ...state(words),
        submissionVersion: words.length + 1,
        acceptedWords: [...words, accepted(words.length + 1, 'ZZZ')],
      }).success,
    ).toBe(false);
  });

  it('validates strict success and failure acknowledgements', () => {
    expect(
      submitWordResponseSchema.safeParse({
        ok: true,
        acceptedWord: accepted(),
        state: state(),
      }).success,
    ).toBe(true);
    expect(
      submitWordResponseSchema.safeParse({
        ok: false,
        error: { code: 'ALREADY_SUBMITTED', message: 'Already submitted.' },
        state: state(),
      }).success,
    ).toBe(true);
  });

  it('keeps the dedicated error model bounded and strict', () => {
    expect(
      submissionErrorSchema.safeParse({
        code: 'WORD_NOT_IN_DICTIONARY',
        message: 'Not in this game dictionary.',
      }).success,
    ).toBe(true);
    expect(
      submissionErrorSchema.safeParse({
        code: 'ROOM_NOT_FOUND',
        message: 'No.',
      }).success,
    ).toBe(false);
  });

  it('requires private state on player success but forbids it on display success', () => {
    const room = {
      code: 'ABC234',
      phase: 'LOBBY',
      stateVersion: 0,
      serverTime: '2026-07-30T20:00:00.000Z',
      createdAt: '2026-07-30T20:00:00.000Z',
      lastActivityAt: '2026-07-30T20:00:00.000Z',
      expiresAt: '2026-07-30T22:00:00.000Z',
      maxPlayers: 8,
      display: {
        connected: true,
        createdAt: '2026-07-30T20:00:00.000Z',
      },
      controllerStatus: 'none',
      controllerPlayerId: null,
      players: [],
      settings: {
        gridSize: 4,
        roundDurationSeconds: 180,
        scoringMode: 'traditional',
      },
      round: null,
    };
    expect(roomStateSchema.safeParse(room).success).toBe(true);
    expect(
      playerActionResponseSchema.safeParse({
        ok: true,
        room,
        session: {
          playerId,
          playerReconnectToken: 'a'.repeat(43),
        },
      }).success,
    ).toBe(false);
    expect(
      displayActionResponseSchema.safeParse({
        ok: true,
        room,
        session: {
          displaySessionId: roundId,
          displayReconnectToken: 'a'.repeat(43),
        },
        submissionState: null,
      }).success,
    ).toBe(false);
  });
});
