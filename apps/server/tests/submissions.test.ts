import { describe, expect, it } from 'vitest';

import { createWordDictionary, type WordDictionary } from '@words/game-engine';

import { PlayerSubmissionRateLimiter } from '../src/rate-limiter.js';
import {
  RoomStore,
  type BoundPlayerSession,
  type RoomStoreOptions,
} from '../src/room-store.js';

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function dictionary(words: readonly string[]): WordDictionary {
  const result = createWordDictionary(words);
  if (!result.success) {
    throw new Error('Invalid test dictionary.');
  }
  return result.dictionary;
}

const tiles = [
  'C',
  'A',
  'T',
  'S',
  'D',
  'O',
  'G',
  'E',
  'QU',
  'I',
  'Z',
  'R',
  'L',
  'M',
  'N',
  'P',
];

function setup(options: Partial<RoomStoreOptions> = {}) {
  let now = Date.parse('2026-07-30T20:00:00.000Z');
  let playerIndex = 0;
  let tokenIndex = 0;
  let roundIndex = 0;
  const store = new RoomStore({
    maxPlayers: 8,
    maxRooms: 20,
    roomTtlMs: 120 * 60_000,
    reconnectGraceMs: 60_000,
    now: () => now,
    roomCodeGenerator: () => 'ABC234',
    displaySessionIdGenerator: () => uuid(100),
    playerIdGenerator: () => uuid(++playerIndex),
    roundIdGenerator: () => uuid(500 + ++roundIndex),
    reconnectTokenGenerator: () =>
      `${String(++tokenIndex).padStart(3, '0')}${'t'.repeat(40)}`,
    roundBoardGenerator: (size) => ({
      success: true,
      board: {
        size,
        tiles:
          size === 4
            ? tiles
            : Array.from({ length: size * size }, (_, index) =>
                String.fromCharCode(65 + (index % 26)),
              ),
      },
      attempts: 1,
    }),
    ...options,
  });
  const display = store.createDisplay('display-socket');
  const first = store.joinPlayer(
    display.room.code,
    'Silver Owl',
    'player-one-socket',
  );
  const second = store.joinPlayer(
    display.room.code,
    'Copper Fox',
    'player-two-socket',
  );
  const firstSession: BoundPlayerSession = {
    role: 'player',
    roomCode: display.room.code,
    playerId: first.session.playerId,
  };
  const secondSession: BoundPlayerSession = {
    role: 'player',
    roomCode: display.room.code,
    playerId: second.session.playerId,
  };
  const started = store.startRound(firstSession, 'player-one-socket');
  const roundId = started.room.round?.id;
  if (!roundId) {
    throw new Error('Round did not start.');
  }
  return {
    store,
    display,
    first,
    second,
    firstSession,
    secondSession,
    roundId,
    setNow(value: number) {
      now = value;
    },
  };
}

describe('RoomStore private submissions', () => {
  it('starts participants with empty private state and keeps RoomState private', () => {
    const game = setup();

    expect(game.first.submissionState).toBeNull();
    const reconnected = game.store.reconnectPlayer(
      game.display.room.code,
      game.first.session.playerReconnectToken,
      'player-one-new',
    );
    expect(reconnected.submissionState).toEqual({
      roundId: game.roundId,
      playerId: game.first.session.playerId,
      submissionVersion: 0,
      acceptedWords: [],
      provisionalScore: 0,
    });
    expect(reconnected.room).not.toHaveProperty('acceptedWords');
    expect(reconnected.room).not.toHaveProperty('provisionalScore');
    expect(reconnected.room.round).not.toHaveProperty('submissions');
  });

  it('accepts, scores, sequences, and privately returns a valid word', () => {
    const game = setup();
    const before = game.store.getRoomState(game.display.room.code);
    const result = game.store.submitWord(
      game.firstSession,
      'player-one-socket',
      { roundId: game.roundId, word: 'cat', path: [0, 1, 2] },
      dictionary(['CAT']),
      () => true,
    );

    expect(result.response).toMatchObject({
      ok: true,
      acceptedWord: { sequence: 1, word: 'CAT', points: 1 },
      state: { submissionVersion: 1, provisionalScore: 1 },
    });
    expect(game.store.getRoomState(game.display.room.code)).toEqual(before);
  });

  it('returns copies that cannot mutate committed private state', () => {
    const game = setup();
    const result = game.store.submitWord(
      game.firstSession,
      'player-one-socket',
      { roundId: game.roundId, word: 'CAT', path: [0, 1, 2] },
      dictionary(['CAT']),
      () => true,
    );
    if (!result.response.ok) throw new Error('Submission setup failed.');

    Reflect.set(result.response.acceptedWord, 'word', 'DOG');
    Reflect.set(result.response.state.acceptedWords[0] ?? {}, 'word', 'DOG');
    const reconnected = game.store.reconnectPlayer(
      game.display.room.code,
      game.first.session.playerReconnectToken,
      'player-one-new',
    );
    expect(reconnected.submissionState?.acceptedWords).toMatchObject([
      { word: 'CAT' },
    ]);
  });

  it('rejects a personal duplicate without changing private state', () => {
    const game = setup();
    const submit = () =>
      game.store.submitWord(
        game.firstSession,
        'player-one-socket',
        { roundId: game.roundId, word: 'CAT', path: [0, 1, 2] },
        dictionary(['CAT']),
        () => true,
      );

    expect(submit().response.ok).toBe(true);
    const duplicate = submit().response;
    expect(duplicate).toMatchObject({
      ok: false,
      error: { code: 'ALREADY_SUBMITTED' },
      state: { submissionVersion: 1, provisionalScore: 1 },
    });
  });

  it('allows two participants to submit the same word independently', () => {
    const game = setup();
    for (const [session, socket] of [
      [game.firstSession, 'player-one-socket'],
      [game.secondSession, 'player-two-socket'],
    ] as const) {
      expect(
        game.store.submitWord(
          session,
          socket,
          { roundId: game.roundId, word: 'CAT', path: [0, 1, 2] },
          dictionary(['CAT']),
          () => true,
        ).response,
      ).toMatchObject({
        ok: true,
        state: { submissionVersion: 1, provisionalScore: 1 },
      });
    }
  });

  it.each([
    ['ROUND_MISMATCH', { roundId: uuid(999), word: 'CAT', path: [0, 1, 2] }],
    ['INVALID_PATH', { word: 'CAT', path: [0, 2] }],
    ['WORD_TOO_SHORT', { word: 'CA', path: [0, 1] }],
    ['PATH_WORD_MISMATCH', { word: 'DOG', path: [0, 1, 2] }],
    ['WORD_NOT_IN_DICTIONARY', { word: 'CAT', path: [0, 1, 2] }],
  ] as const)('returns %s without mutation', (code, partial) => {
    const game = setup();
    const result = game.store.submitWord(
      game.firstSession,
      'player-one-socket',
      { roundId: game.roundId, ...partial },
      dictionary(code === 'WORD_NOT_IN_DICTIONARY' ? ['DOG'] : ['CAT', 'DOG']),
      () => true,
    );
    expect(result.response).toMatchObject({
      ok: false,
      error: { code },
      state: { submissionVersion: 0 },
    });
  });

  it('rejects a mid-round joiner as a nonparticipant', () => {
    const game = setup();
    const late = game.store.joinPlayer(
      game.display.room.code,
      'Late Lynx',
      'late-socket',
    );
    expect(late.submissionState).toBeNull();
    const result = game.store.submitWord(
      {
        role: 'player',
        roomCode: game.display.room.code,
        playerId: late.session.playerId,
      },
      'late-socket',
      { roundId: game.roundId, word: 'CAT', path: [0, 1, 2] },
      dictionary(['CAT']),
      () => true,
    );
    expect(result.response).toMatchObject({
      ok: false,
      error: { code: 'NOT_ROUND_PARTICIPANT' },
      state: null,
    });
  });

  it('restores only the reconnecting player private state and rejects the stale socket', () => {
    const game = setup();
    game.store.submitWord(
      game.firstSession,
      'player-one-socket',
      { roundId: game.roundId, word: 'CAT', path: [0, 1, 2] },
      dictionary(['CAT']),
      () => true,
    );
    const reconnected = game.store.reconnectPlayer(
      game.display.room.code,
      game.first.session.playerReconnectToken,
      'player-one-new',
    );
    expect(reconnected.submissionState).toMatchObject({
      playerId: game.first.session.playerId,
      acceptedWords: [{ word: 'CAT' }],
    });
    expect(
      game.store.submitWord(
        game.firstSession,
        'player-one-socket',
        { roundId: game.roundId, word: 'DOG', path: [4, 5, 6] },
        dictionary(['DOG']),
        () => true,
      ).response,
    ).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
      state: null,
    });
  });

  it('keeps explicitly left and grace-expired private state inaccessible', () => {
    const explicit = setup();
    explicit.store.submitWord(
      explicit.firstSession,
      'player-one-socket',
      { roundId: explicit.roundId, word: 'CAT', path: [0, 1, 2] },
      dictionary(['CAT']),
      () => true,
    );
    expect(
      explicit.store.leave(explicit.firstSession, 'player-one-socket'),
    ).not.toBeNull();
    const replacement = explicit.store.joinPlayer(
      explicit.display.room.code,
      'Silver Owl',
      'replacement-socket',
    );
    expect(replacement.session.playerId).not.toBe(
      explicit.first.session.playerId,
    );
    expect(replacement.submissionState).toBeNull();
    expect(() =>
      explicit.store.reconnectPlayer(
        explicit.display.room.code,
        explicit.first.session.playerReconnectToken,
        'stale-reconnect',
      ),
    ).toThrow();

    const expired = setup();
    expired.store.submitWord(
      expired.firstSession,
      'player-one-socket',
      { roundId: expired.roundId, word: 'CAT', path: [0, 1, 2] },
      dictionary(['CAT']),
      () => true,
    );
    expired.store.disconnect(expired.firstSession, 'player-one-socket');
    expired.setNow(Date.parse('2026-07-30T20:01:00.001Z'));
    expired.store.cleanupExpired();
    const afterGrace = expired.store.joinPlayer(
      expired.display.room.code,
      'Silver Owl',
      'after-grace-socket',
    );
    expect(afterGrace.session.playerId).not.toBe(
      expired.first.session.playerId,
    );
    expect(afterGrace.submissionState).toBeNull();
  });

  it('reconciles and reports the ended room at the exact deadline', () => {
    const game = setup();
    const deadline = Date.parse(
      game.store.getRoomState(game.display.room.code)?.round?.deadlineAt ?? '',
    );
    game.setNow(deadline);
    const result = game.store.submitWord(
      game.firstSession,
      'player-one-socket',
      { roundId: game.roundId, word: 'CAT', path: [0, 1, 2] },
      dictionary(['CAT']),
      () => {
        throw new Error('The limiter must not run after reconciliation.');
      },
      deadline,
    );
    expect(result.reconciledRoom).toMatchObject({
      phase: 'ROUND_ENDED',
      round: { endedAt: new Date(deadline).toISOString() },
    });
    expect(result.response).toMatchObject({
      ok: false,
      error: { code: 'ROUND_NOT_ACTIVE' },
    });
  });

  it('uses one receipt time for deadline acceptance and acceptedAt', () => {
    const game = setup();
    const round = game.store.getRoomState(game.display.room.code)?.round;
    if (!round) throw new Error('Round setup failed.');
    const startedAt = Date.parse(round.startedAt);
    const deadline = Date.parse(round.deadlineAt);

    const atStart = game.store.submitWord(
      game.firstSession,
      'player-one-socket',
      { roundId: game.roundId, word: 'CAT', path: [0, 1, 2] },
      dictionary(['CAT']),
      () => true,
      startedAt,
    );
    const repeatedMillisecond = game.store.submitWord(
      game.firstSession,
      'player-one-socket',
      { roundId: game.roundId, word: 'DOG', path: [4, 5, 6] },
      dictionary(['DOG']),
      () => true,
      startedAt,
    );
    const beforeDeadline = game.store.submitWord(
      game.firstSession,
      'player-one-socket',
      { roundId: game.roundId, word: 'QUIZ', path: [8, 9, 10] },
      dictionary(['QUIZ']),
      () => true,
      deadline - 1,
    );

    expect(atStart.response).toMatchObject({
      ok: true,
      acceptedWord: { sequence: 1, acceptedAt: round.startedAt },
    });
    expect(repeatedMillisecond.response).toMatchObject({
      ok: true,
      acceptedWord: { sequence: 2, acceptedAt: round.startedAt },
    });
    expect(beforeDeadline.response).toMatchObject({
      ok: true,
      acceptedWord: {
        sequence: 3,
        acceptedAt: new Date(deadline - 1).toISOString(),
      },
    });
  });

  it('applies the dedicated limit before dictionary lookup and across reconnects', () => {
    let now = 1_000;
    const limiter = new PlayerSubmissionRateLimiter(1_000, 1, 10, () => now);
    const game = setup();
    let dictionaryCalls = 0;
    const countedDictionary: WordDictionary = {
      has() {
        dictionaryCalls += 1;
        return true;
      },
    };
    expect(
      game.store.submitWord(
        game.firstSession,
        'player-one-socket',
        { roundId: game.roundId, word: 'CAT', path: [0, 1, 2] },
        countedDictionary,
        () =>
          limiter.allow(game.firstSession.roomCode, game.firstSession.playerId),
      ).response.ok,
    ).toBe(true);
    const reconnected = game.store.reconnectPlayer(
      game.display.room.code,
      game.first.session.playerReconnectToken,
      'player-one-new',
    );
    expect(
      game.store.submitWord(
        game.firstSession,
        'player-one-new',
        { roundId: game.roundId, word: 'DOG', path: [4, 5, 6] },
        countedDictionary,
        () =>
          limiter.allow(game.firstSession.roomCode, game.firstSession.playerId),
      ).response,
    ).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    expect(reconnected.submissionState?.submissionVersion).toBe(1);
    expect(dictionaryCalls).toBe(1);
    now = 2_001;
    expect(
      limiter.allow(game.firstSession.roomCode, game.firstSession.playerId),
    ).toBe(true);
  });

  it('leaves state unchanged when scoring produces invalid authoritative data', () => {
    const game = setup({
      scoreWord: () => ({ valid: true, word: 'CAT', points: 4 }) as never,
    });
    expect(
      game.store.submitWord(
        game.firstSession,
        'player-one-socket',
        { roundId: game.roundId, word: 'CAT', path: [0, 1, 2] },
        dictionary(['CAT']),
        () => true,
      ).response,
    ).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
      state: { submissionVersion: 0, provisionalScore: 0 },
    });
  });

  it('discards previous private state when the next round starts', () => {
    const game = setup();
    game.store.submitWord(
      game.firstSession,
      'player-one-socket',
      { roundId: game.roundId, word: 'CAT', path: [0, 1, 2] },
      dictionary(['CAT']),
      () => true,
    );
    const deadline = Date.parse(
      game.store.getRoomState(game.display.room.code)?.round?.deadlineAt ?? '',
    );
    game.setNow(deadline);
    game.store.reconcileDueRound(game.display.room.code);
    const next = game.store.startRound(game.firstSession, 'player-one-socket');
    const reconnected = game.store.reconnectPlayer(
      game.display.room.code,
      game.first.session.playerReconnectToken,
      'player-one-new',
    );
    expect(reconnected.submissionState).toMatchObject({
      roundId: next.room.round?.id,
      submissionVersion: 0,
      acceptedWords: [],
      provisionalScore: 0,
    });
  });
});
