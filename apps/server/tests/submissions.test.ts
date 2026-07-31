import { describe, expect, it } from 'vitest';

import {
  createWordDictionary,
  reconcileRoundWords,
  type WordDictionary,
} from '@words/game-engine';

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
  store.updateSettings(
    firstSession,
    {
      gridSize: 4,
      roundDurationSeconds: 180,
      scoringMode: 'length-plus-unique',
    },
    'player-one-socket',
  );
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
      acceptedWord: { sequence: 1, word: 'CAT', points: 3 },
      state: { submissionVersion: 1, provisionalScore: 3 },
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
      state: { submissionVersion: 1, provisionalScore: 3 },
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
        state: { submissionVersion: 1, provisionalScore: 3 },
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
    expect(next.room.round?.results).toBeNull();
  });

  it('finalizes unique and shared words into one authoritative public result', () => {
    const game = setup();
    const gameDictionary = dictionary(['CAT', 'CATS', 'DOG']);
    for (const [session, socket, word, path] of [
      [game.firstSession, 'player-one-socket', 'DOG', [4, 5, 6]],
      [game.firstSession, 'player-one-socket', 'CATS', [0, 1, 2, 3]],
      [game.secondSession, 'player-two-socket', 'CATS', [0, 1, 2, 3]],
    ] as const) {
      expect(
        game.store.submitWord(
          session,
          socket,
          { roundId: game.roundId, word, path },
          gameDictionary,
          () => true,
        ).response.ok,
      ).toBe(true);
    }
    const active = game.store.getRoomState(game.display.room.code);
    expect(active?.round?.results).toBeNull();
    expect(JSON.stringify(active)).not.toContain('CATS');

    const deadline = Date.parse(active?.round?.deadlineAt ?? '');
    game.setNow(deadline);
    const ended = game.store.reconcileDueRound(game.display.room.code);

    expect(ended).toMatchObject({
      phase: 'ROUND_ENDED',
      stateVersion: (active?.stateVersion ?? 0) + 1,
      lastActivityAt: active?.lastActivityAt,
      expiresAt: active?.expiresAt,
      round: {
        endedAt: active?.round?.deadlineAt,
        results: {
          winnerPlayerIds: [game.first.session.playerId],
          players: [
            {
              playerId: game.first.session.playerId,
              displayName: 'Silver Owl',
              rank: 1,
              baseScore: 7,
              uniqueBonusScore: 1,
              finalScore: 8,
              words: [
                {
                  word: 'DOG',
                  basePoints: 3,
                  shared: false,
                  uniqueBonusPoints: 1,
                  finalPoints: 4,
                },
                {
                  word: 'CATS',
                  basePoints: 4,
                  shared: true,
                  uniqueBonusPoints: 0,
                  finalPoints: 4,
                },
              ],
            },
            {
              playerId: game.second.session.playerId,
              displayName: 'Copper Fox',
              rank: 2,
              baseScore: 4,
              uniqueBonusScore: 0,
              finalScore: 4,
              words: [
                {
                  word: 'CATS',
                  basePoints: 4,
                  shared: true,
                  uniqueBonusPoints: 0,
                  finalPoints: 4,
                },
              ],
            },
          ],
        },
      },
    });
    const serialized = JSON.stringify(ended);
    for (const privateField of [
      'acceptedAt',
      'submissionVersion',
      'path',
      'ReconnectToken',
      'socketId',
    ]) {
      expect(serialized).not.toContain(privateField);
    }
  });

  it('uses the immutable participant snapshot after leave and excludes a mid-round joiner', () => {
    const game = setup();
    const gameDictionary = dictionary(['CAT', 'DOG']);
    game.store.submitWord(
      game.firstSession,
      'player-one-socket',
      { roundId: game.roundId, word: 'CAT', path: [0, 1, 2] },
      gameDictionary,
      () => true,
    );
    game.store.submitWord(
      game.secondSession,
      'player-two-socket',
      { roundId: game.roundId, word: 'DOG', path: [4, 5, 6] },
      gameDictionary,
      () => true,
    );
    const late = game.store.joinPlayer(
      game.display.room.code,
      'Late Lynx',
      'late-socket',
    );
    game.store.leave(game.secondSession, 'player-two-socket');
    const active = game.store.getRoomState(game.display.room.code);
    const deadline = Date.parse(active?.round?.deadlineAt ?? '');
    game.setNow(deadline);

    const results = game.store.reconcileDueRound(game.display.room.code)?.round
      ?.results;
    expect(results?.players.map((player) => player.playerId)).toEqual([
      game.first.session.playerId,
      game.second.session.playerId,
    ]);
    expect(results?.players.map((player) => player.displayName)).toEqual([
      'Silver Owl',
      'Copper Fox',
    ]);
    expect(
      results?.players.some(
        (player) => player.playerId === late.session.playerId,
      ),
    ).toBe(false);
  });

  it('keeps a former controller identity when a departed name is reused', () => {
    const game = setup();
    game.store.submitWord(
      game.firstSession,
      'player-one-socket',
      { roundId: game.roundId, word: 'CAT', path: [0, 1, 2] },
      dictionary(['CAT']),
      () => true,
    );
    game.store.transferController(
      game.firstSession,
      game.second.session.playerId,
      'player-one-socket',
    );
    game.store.leave(game.firstSession, 'player-one-socket');
    const replacement = game.store.joinPlayer(
      game.display.room.code,
      'Silver Owl',
      'replacement-socket',
    );
    const active = game.store.getRoomState(game.display.room.code);
    game.setNow(Date.parse(active?.round?.deadlineAt ?? ''));

    const results = game.store.reconcileDueRound(game.display.room.code)?.round
      ?.results;
    expect(results?.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: game.first.session.playerId,
          displayName: 'Silver Owl',
          words: [expect.objectContaining({ word: 'CAT' })],
        }),
      ]),
    );
    expect(
      results?.players.some(
        (player) => player.playerId === replacement.session.playerId,
      ),
    ).toBe(false);
  });

  it('retains a disconnected and grace-expired participant in final results', () => {
    const game = setup({ reconnectGraceMs: 1_000 });
    game.store.submitWord(
      game.secondSession,
      'player-two-socket',
      { roundId: game.roundId, word: 'DOG', path: [4, 5, 6] },
      dictionary(['DOG']),
      () => true,
    );
    game.store.disconnect(game.secondSession, 'player-two-socket');
    const active = game.store.getRoomState(game.display.room.code);
    game.setNow(Date.parse(active?.round?.startedAt ?? '') + 1_001);
    game.store.cleanupExpired();
    expect(
      game.store
        .getRoomState(game.display.room.code)
        ?.players.some((player) => player.id === game.second.session.playerId),
    ).toBe(false);

    game.setNow(Date.parse(active?.round?.deadlineAt ?? ''));
    const results = game.store.reconcileDueRound(game.display.room.code)?.round
      ?.results;
    expect(results?.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: game.second.session.playerId,
          displayName: 'Copper Fox',
          finalScore: 4,
        }),
      ]),
    );
  });

  it('keeps base points and tied winners when every word is shared', () => {
    const game = setup();
    for (const [session, socket] of [
      [game.firstSession, 'player-one-socket'],
      [game.secondSession, 'player-two-socket'],
    ] as const) {
      game.store.submitWord(
        session,
        socket,
        { roundId: game.roundId, word: 'CAT', path: [0, 1, 2] },
        dictionary(['CAT']),
        () => true,
      );
    }
    const active = game.store.getRoomState(game.display.room.code);
    game.setNow(Date.parse(active?.round?.deadlineAt ?? ''));
    const results = game.store.reconcileDueRound(game.display.room.code)?.round
      ?.results;

    expect(results?.winnerPlayerIds).toEqual([
      game.first.session.playerId,
      game.second.session.playerId,
    ]);
    expect(results?.players.map((player) => player.rank)).toEqual([1, 1]);
    expect(results?.players.map((player) => player.baseScore)).toEqual([3, 3]);
    expect(results?.players.map((player) => player.uniqueBonusScore)).toEqual([
      0, 0,
    ]);
    expect(results?.players.map((player) => player.finalScore)).toEqual([3, 3]);
  });

  it('finalizes idempotently without rewriting private state or room lifetime', () => {
    const game = setup();
    game.store.submitWord(
      game.firstSession,
      'player-one-socket',
      { roundId: game.roundId, word: 'CAT', path: [0, 1, 2] },
      dictionary(['CAT']),
      () => true,
    );
    const active = game.store.getRoomState(game.display.room.code);
    game.setNow(Date.parse(active?.round?.deadlineAt ?? ''));
    const first = game.store.reconcileDueRound(game.display.room.code);
    const second = game.store.reconcileDueRound(game.display.room.code);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(game.store.getRoomState(game.display.room.code)).toMatchObject({
      stateVersion: (active?.stateVersion ?? 0) + 1,
      lastActivityAt: active?.lastActivityAt,
      expiresAt: active?.expiresAt,
      round: { results: first?.round?.results },
    });
    const reconnected = game.store.reconnectPlayer(
      game.display.room.code,
      game.first.session.playerReconnectToken,
      'player-one-new',
    );
    expect(reconnected.submissionState).toMatchObject({
      submissionVersion: 1,
      provisionalScore: 3,
      acceptedWords: [{ word: 'CAT', points: 3 }],
    });

    const callerResult = first?.round?.results;
    Reflect.set(callerResult?.players[0]?.words[0] ?? {}, 'word', 'DOG');
    expect(
      game.store.getRoomState(game.display.room.code)?.round?.results
        ?.players[0]?.words[0]?.word,
    ).toBe('CAT');
  });

  it('preserves ended results through settings, transfer, and board failure', () => {
    let generationCall = 0;
    const game = setup({
      roundBoardGenerator: (size) => {
        generationCall += 1;
        return generationCall === 1
          ? {
              success: true,
              board: { size, tiles },
              attempts: 1,
            }
          : {
              success: false,
              code: 'NO_ACCEPTABLE_BOARD',
              attempts: 8,
            };
      },
    });
    game.store.submitWord(
      game.firstSession,
      'player-one-socket',
      { roundId: game.roundId, word: 'CAT', path: [0, 1, 2] },
      dictionary(['CAT']),
      () => true,
    );
    const active = game.store.getRoomState(game.display.room.code);
    game.setNow(Date.parse(active?.round?.deadlineAt ?? ''));
    const ended = game.store.reconcileDueRound(game.display.room.code);
    if (!ended?.round?.results) throw new Error('Result setup failed.');
    const results = ended.round.results;

    const updated = game.store.updateSettings(
      game.firstSession,
      {
        gridSize: 5,
        roundDurationSeconds: 60,
        scoringMode: 'length-plus-unique',
      },
      'player-one-socket',
    ).room;
    expect(updated.round?.settings.gridSize).toBe(4);
    expect(updated.round?.results).toEqual(results);
    const transferred = game.store.transferController(
      game.firstSession,
      game.second.session.playerId,
      'player-one-socket',
    ).room;
    expect(transferred.round?.results).toEqual(results);
    const beforeFailure = game.store.getRoomState(game.display.room.code);
    expect(() =>
      game.store.startRound(game.secondSession, 'player-two-socket'),
    ).toThrowError('A playable board could not be generated.');
    expect(game.store.getRoomState(game.display.room.code)).toEqual(
      beforeFailure,
    );

    const recovered = game.store.reconnectPlayer(
      game.display.room.code,
      game.first.session.playerReconnectToken,
      'player-one-new',
    );
    expect(recovered.submissionState).toMatchObject({
      roundId: game.roundId,
      submissionVersion: 1,
      acceptedWords: [{ word: 'CAT' }],
    });
  });

  it('contains an impossible reconciliation failure without partial mutation', () => {
    let allowFinalization = false;
    const game = setup({
      reconcileWords: (participants) =>
        allowFinalization
          ? reconcileRoundWords(participants)
          : { success: false, code: 'INVALID_WORD' },
    });
    game.store.submitWord(
      game.firstSession,
      'player-one-socket',
      { roundId: game.roundId, word: 'CAT', path: [0, 1, 2] },
      dictionary(['CAT']),
      () => true,
    );
    const active = game.store.getRoomState(game.display.room.code);
    game.setNow(Date.parse(active?.round?.deadlineAt ?? ''));

    expect(() =>
      game.store.reconcileDueRound(game.display.room.code),
    ).toThrowError('The authoritative round could not be finalized.');
    allowFinalization = true;
    const ended = game.store.reconcileDueRound(game.display.room.code);
    expect(ended).toMatchObject({
      stateVersion: (active?.stateVersion ?? 0) + 1,
      lastActivityAt: active?.lastActivityAt,
      expiresAt: active?.expiresAt,
      round: {
        results: {
          players: [
            {
              playerId: game.first.session.playerId,
              words: [{ word: 'CAT' }],
            },
            {
              playerId: game.second.session.playerId,
              words: [],
            },
          ],
        },
      },
    });
  });

  it.each(['missing', 'extra', 'malformed'] as const)(
    'requires an exact valid private participant map: %s',
    (failure) => {
      const game = setup();
      const internal = game.store as unknown as {
        rooms: Map<
          string,
          {
            roundSubmissions: Map<string, unknown>;
          }
        >;
      };
      const room = internal.rooms.get(game.display.room.code);
      if (!room) throw new Error('Internal test room was not found.');

      if (failure === 'missing') {
        room.roundSubmissions.delete(game.second.session.playerId);
      } else if (failure === 'extra') {
        room.roundSubmissions.set(uuid(999), {
          roundId: game.roundId,
          playerId: uuid(999),
          submissionVersion: 0,
          acceptedWords: [],
          provisionalScore: 0,
        });
      } else {
        room.roundSubmissions.set(game.first.session.playerId, {
          roundId: game.roundId,
          playerId: game.first.session.playerId,
          submissionVersion: 1,
          acceptedWords: [],
          provisionalScore: 11,
        });
      }

      const active = game.store.getRoomState(game.display.room.code);
      const deadline = Date.parse(
        active?.round?.deadlineAt ?? '2026-07-30T20:00:30.000Z',
      );
      game.setNow(deadline);
      const before = {
        phase: 'ROUND_ACTIVE',
        stateVersion: active?.stateVersion,
      };

      expect(() =>
        game.store.reconcileDueRound(game.display.room.code),
      ).toThrowError('The authoritative round could not be finalized.');
      expect(
        (game.store as unknown as { rooms: Map<string, unknown> }).rooms.get(
          game.display.room.code,
        ),
      ).toMatchObject(before);
    },
  );

  it('contains one invalid room without blocking another due room', () => {
    let now = Date.parse('2026-07-30T20:00:00.000Z');
    let codeIndex = 0;
    let playerIndex = 0;
    let roundIndex = 0;
    const store = new RoomStore({
      maxPlayers: 8,
      maxRooms: 20,
      roomTtlMs: 120 * 60_000,
      reconnectGraceMs: 60_000,
      now: () => now,
      roomCodeGenerator: () => ['ABC234', 'DEF567'][codeIndex++] ?? 'GHJ678',
      displaySessionIdGenerator: () => uuid(100 + codeIndex),
      playerIdGenerator: () => uuid(++playerIndex),
      roundIdGenerator: () => uuid(500 + ++roundIndex),
      reconnectTokenGenerator: () =>
        `${String(playerIndex + roundIndex).padStart(3, '0')}${'t'.repeat(40)}`,
      roundBoardGenerator: (size) => ({
        success: true,
        board: {
          size,
          tiles: Array.from({ length: size * size }, () => 'A'),
        },
        attempts: 1,
      }),
    });
    const firstDisplay = store.createDisplay('display-one');
    const firstPlayer = store.joinPlayer(
      firstDisplay.room.code,
      'Silver Owl',
      'player-one',
    );
    store.startRound(
      {
        role: 'player',
        roomCode: firstDisplay.room.code,
        playerId: firstPlayer.session.playerId,
      },
      'player-one',
    );
    const secondDisplay = store.createDisplay('display-two');
    const secondPlayer = store.joinPlayer(
      secondDisplay.room.code,
      'Copper Fox',
      'player-two',
    );
    store.startRound(
      {
        role: 'player',
        roomCode: secondDisplay.room.code,
        playerId: secondPlayer.session.playerId,
      },
      'player-two',
    );
    const internal = store as unknown as {
      rooms: Map<string, { roundSubmissions: Map<string, unknown> }>;
    };
    internal.rooms
      .get(firstDisplay.room.code)
      ?.roundSubmissions.delete(firstPlayer.session.playerId);
    now = Date.parse(
      store.getRoomState(secondDisplay.room.code)?.round?.deadlineAt ?? '',
    );

    expect(store.advanceDueRounds()).toEqual([secondDisplay.room.code]);
    expect(internal.rooms.get(firstDisplay.room.code)).toMatchObject({
      phase: 'ROUND_ACTIVE',
    });
    expect(store.getRoomState(secondDisplay.room.code)).toMatchObject({
      phase: 'ROUND_ENDED',
      round: {
        results: { players: [{ playerId: secondPlayer.session.playerId }] },
      },
    });
  });
});
