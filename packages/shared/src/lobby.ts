import { z } from 'zod';

import { productConfig } from './config';

export const roomCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const controlCharacterPattern = /[\p{Cc}\p{Cf}]/u;
const roomCodePattern = new RegExp(
  `^[${roomCodeAlphabet}]{${productConfig.roomCodeLength}}$`,
);

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export const roomCodeSchema = z
  .string()
  .max(16)
  .transform(normalizeRoomCode)
  .pipe(
    z
      .string()
      .length(productConfig.roomCodeLength)
      .regex(roomCodePattern, 'Enter a valid room code.'),
  );

export const displayNameSchema = z
  .string()
  .max(64)
  .transform(normalizeDisplayName)
  .pipe(
    z
      .string()
      .min(2, 'Display names must contain at least 2 characters.')
      .max(24, 'Display names must contain at most 24 characters.')
      .refine(
        (value) => !controlCharacterPattern.test(value),
        'Display names cannot contain control characters.',
      ),
  );

const serializedDisplayNameSchema = z
  .string()
  .min(2)
  .max(24)
  .refine(
    (value) => !controlCharacterPattern.test(value),
    'Display names cannot contain control characters.',
  )
  .refine(
    (value) => value === normalizeDisplayName(value),
    'Serialized display names must already be normalized.',
  );

export const reconnectTokenSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const createDisplayInputSchema = z.object({}).strict();

export const joinPlayerInputSchema = z
  .object({
    roomCode: roomCodeSchema,
    displayName: displayNameSchema,
  })
  .strict();

export const reconnectDisplayInputSchema = z
  .object({
    roomCode: roomCodeSchema,
    displayReconnectToken: reconnectTokenSchema,
  })
  .strict();

export const reconnectPlayerInputSchema = z
  .object({
    roomCode: roomCodeSchema,
    playerReconnectToken: reconnectTokenSchema,
  })
  .strict();

export const leaveSessionInputSchema = z.object({}).strict();
export const startRoundInputSchema = z.object({}).strict();

export const playerIdSchema = z.string().max(36).uuid();
export const roundIdSchema = z.string().max(36).uuid();

export const submitWordInputSchema = z
  .object({
    roundId: roundIdSchema,
    word: z.string().max(productConfig.maximumSubmittedWordLength),
    path: z.array(z.number().int().min(0).max(35)).min(1).max(36).readonly(),
  })
  .strict()
  .readonly();

export const transferControllerInputSchema = z
  .object({
    targetPlayerId: playerIdSchema,
  })
  .strict();

export const roomSettingsSchema = z
  .object({
    gridSize: z.union([z.literal(4), z.literal(5), z.literal(6)]),
    roundDurationSeconds: z.union([
      z.literal(30),
      z.literal(60),
      z.literal(90),
      z.literal(120),
      z.literal(150),
      z.literal(180),
    ]),
    scoringMode: z.literal('traditional'),
  })
  .strict();

export const updateRoomSettingsInputSchema = roomSettingsSchema;

export const roomPhaseSchema = z.enum(['LOBBY', 'ROUND_ACTIVE', 'ROUND_ENDED']);

export const maximumRoundGenerationAttempts = 8;

export const roundParticipantSchema = z
  .object({
    playerId: playerIdSchema,
    displayName: serializedDisplayNameSchema,
  })
  .strict()
  .readonly();

export const roundBoardSchema = z
  .object({
    size: z.union([z.literal(4), z.literal(5), z.literal(6)]),
    tiles: z
      .array(z.string().regex(/^[A-Z]{1,4}$/))
      .max(36)
      .readonly(),
  })
  .strict()
  .superRefine((board, context) => {
    if (board.tiles.length !== board.size * board.size) {
      context.addIssue({
        code: 'custom',
        message: 'The board must contain exactly size squared tile tokens.',
        path: ['tiles'],
      });
    }
  })
  .readonly();

const roundSettingsSchema = roomSettingsSchema.readonly();

export const traditionalPointsSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(5),
  z.literal(11),
]);

export const uniqueBonusPointsSchema = z.union([
  z.literal(0),
  z.literal(0.25),
  z.literal(0.5),
  z.literal(0.75),
  z.literal(1.25),
  z.literal(2.75),
]);

export const finalWordPointsSchema = z.union([
  z.literal(1),
  z.literal(1.25),
  z.literal(2),
  z.literal(2.5),
  z.literal(3),
  z.literal(3.75),
  z.literal(5),
  z.literal(6.25),
  z.literal(11),
  z.literal(13.75),
]);

const maximumBaseScore =
  productConfig.maximumAcceptedWordsPerPlayerPerRound * 11;
const maximumUniqueBonusScore =
  productConfig.maximumAcceptedWordsPerPlayerPerRound * 2.75;
const maximumFinalScore = maximumBaseScore + maximumUniqueBonusScore;
const quarterPointScoreSchema = (maximum: number) =>
  z.number().finite().nonnegative().multipleOf(0.25).max(maximum);

export const roundResultWordSchema = z
  .object({
    word: z
      .string()
      .min(3)
      .max(productConfig.maximumSubmittedWordLength)
      .regex(/^[A-Z]+$/),
    basePoints: traditionalPointsSchema,
    shared: z.boolean(),
    uniqueBonusPoints: uniqueBonusPointsSchema,
    finalPoints: finalWordPointsSchema,
  })
  .strict()
  .superRefine((word, context) => {
    const expectedBasePoints =
      word.word.length <= 4
        ? 1
        : word.word.length === 5
          ? 2
          : word.word.length === 6
            ? 3
            : word.word.length === 7
              ? 5
              : 11;
    if (word.basePoints !== expectedBasePoints) {
      context.addIssue({
        code: 'custom',
        message: 'Base points must match traditional scoring for the word.',
        path: ['basePoints'],
      });
    }
    const expectedBonus = word.shared ? 0 : word.basePoints * 0.25;
    const expectedFinal = word.basePoints + expectedBonus;
    if (word.uniqueBonusPoints !== expectedBonus) {
      context.addIssue({
        code: 'custom',
        message:
          'The uniqueness bonus must be zero for shared words and 25% for unique words.',
        path: ['uniqueBonusPoints'],
      });
    }
    if (word.finalPoints !== expectedFinal) {
      context.addIssue({
        code: 'custom',
        message:
          'Final word points must equal base points plus the uniqueness bonus.',
        path: ['finalPoints'],
      });
    }
  })
  .readonly();

export const roundPlayerResultSchema = z
  .object({
    playerId: playerIdSchema,
    displayName: serializedDisplayNameSchema,
    rank: z.number().int().positive().safe(),
    baseScore: quarterPointScoreSchema(maximumBaseScore),
    uniqueBonusScore: quarterPointScoreSchema(maximumUniqueBonusScore),
    finalScore: quarterPointScoreSchema(maximumFinalScore),
    words: z
      .array(roundResultWordSchema)
      .max(productConfig.maximumAcceptedWordsPerPlayerPerRound)
      .readonly(),
  })
  .strict()
  .superRefine((player, context) => {
    const words = new Set<string>();
    let baseScore = 0;
    let uniqueBonusScore = 0;
    let finalScore = 0;
    player.words.forEach((word, index) => {
      if (words.has(word.word)) {
        context.addIssue({
          code: 'custom',
          message: 'A player result cannot contain duplicate words.',
          path: ['words', index, 'word'],
        });
      }
      words.add(word.word);
      baseScore += word.basePoints;
      uniqueBonusScore += word.uniqueBonusPoints;
      finalScore += word.finalPoints;
    });
    if (player.baseScore !== baseScore) {
      context.addIssue({
        code: 'custom',
        message: 'The base score must equal the base word-point total.',
        path: ['baseScore'],
      });
    }
    if (player.uniqueBonusScore !== uniqueBonusScore) {
      context.addIssue({
        code: 'custom',
        message: 'The uniqueness bonus score must equal the word-bonus total.',
        path: ['uniqueBonusScore'],
      });
    }
    if (player.finalScore !== finalScore) {
      context.addIssue({
        code: 'custom',
        message: 'The final score must equal the final word-point total.',
        path: ['finalScore'],
      });
    }
    if (player.finalScore !== player.baseScore + player.uniqueBonusScore) {
      context.addIssue({
        code: 'custom',
        message: 'The final score must equal base score plus bonus score.',
        path: ['finalScore'],
      });
    }
  })
  .readonly();

export const roundResultsSchema = z
  .object({
    players: z
      .array(roundPlayerResultSchema)
      .min(1)
      .max(productConfig.maxPlayers)
      .readonly(),
    winnerPlayerIds: z
      .array(playerIdSchema)
      .max(productConfig.maxPlayers)
      .readonly(),
  })
  .strict()
  .superRefine((results, context) => {
    const playerIds = new Set<string>();
    const wordPlayerCounts = new Map<string, number>();

    results.players.forEach((player, playerIndex) => {
      if (playerIds.has(player.playerId)) {
        context.addIssue({
          code: 'custom',
          message: 'Result players must have unique player IDs.',
          path: ['players', playerIndex, 'playerId'],
        });
      }
      playerIds.add(player.playerId);
      if (
        playerIndex > 0 &&
        player.finalScore > (results.players[playerIndex - 1]?.finalScore ?? 0)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Result players must be ordered by final score.',
          path: ['players', playerIndex, 'finalScore'],
        });
      }
      for (const word of player.words) {
        wordPlayerCounts.set(
          word.word,
          (wordPlayerCounts.get(word.word) ?? 0) + 1,
        );
      }
    });

    results.players.forEach((player, playerIndex) => {
      const expectedRank =
        1 +
        results.players.filter((other) => other.finalScore > player.finalScore)
          .length;
      if (player.rank !== expectedRank) {
        context.addIssue({
          code: 'custom',
          message: 'Result players must use competition ranking.',
          path: ['players', playerIndex, 'rank'],
        });
      }
      player.words.forEach((word, wordIndex) => {
        const expectedShared = (wordPlayerCounts.get(word.word) ?? 0) >= 2;
        if (word.shared !== expectedShared) {
          context.addIssue({
            code: 'custom',
            message: 'Word sharing must reflect distinct result participants.',
            path: ['players', playerIndex, 'words', wordIndex, 'shared'],
          });
        }
      });
    });

    const highestScore = results.players[0]?.finalScore ?? 0;
    const expectedWinners =
      highestScore === 0
        ? []
        : results.players
            .filter((player) => player.finalScore === highestScore)
            .map((player) => player.playerId);
    if (
      results.winnerPlayerIds.length !== expectedWinners.length ||
      results.winnerPlayerIds.some(
        (playerId, index) => playerId !== expectedWinners[index],
      )
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Winner IDs must contain every tied positive top scorer in result order.',
        path: ['winnerPlayerIds'],
      });
    }
  })
  .readonly();

export const roundStateSchema = z
  .object({
    id: z.string().uuid(),
    number: z.number().int().positive().safe(),
    settings: roundSettingsSchema,
    board: roundBoardSchema,
    participants: z
      .array(roundParticipantSchema)
      .min(1)
      .max(productConfig.maxPlayers)
      .readonly(),
    startedAt: z.string().datetime(),
    deadlineAt: z.string().datetime(),
    endedAt: z.string().datetime().nullable(),
    results: roundResultsSchema.nullable(),
    generationAttempts: z
      .number()
      .int()
      .positive()
      .max(maximumRoundGenerationAttempts),
  })
  .strict()
  .superRefine((round, context) => {
    const startedAt = Date.parse(round.startedAt);
    const deadlineAt = Date.parse(round.deadlineAt);
    const expectedDeadline =
      startedAt + round.settings.roundDurationSeconds * 1_000;

    if (deadlineAt !== expectedDeadline) {
      context.addIssue({
        code: 'custom',
        message: 'The round deadline must match its settings snapshot.',
        path: ['deadlineAt'],
      });
    }

    if (round.board.size !== round.settings.gridSize) {
      context.addIssue({
        code: 'custom',
        message: 'The board size must match the round settings snapshot.',
        path: ['board', 'size'],
      });
    }

    if (round.endedAt !== null && Date.parse(round.endedAt) !== deadlineAt) {
      context.addIssue({
        code: 'custom',
        message: 'An ended round timestamp must equal its deadline.',
        path: ['endedAt'],
      });
    }

    if (round.endedAt === null && round.results !== null) {
      context.addIssue({
        code: 'custom',
        message: 'An active round cannot contain finalized results.',
        path: ['results'],
      });
    }
    if (round.endedAt !== null && round.results === null) {
      context.addIssue({
        code: 'custom',
        message: 'An ended round must contain finalized results.',
        path: ['results'],
      });
    }

    const participantIds = new Set(
      round.participants.map((participant) => participant.playerId),
    );
    if (participantIds.size !== round.participants.length) {
      context.addIssue({
        code: 'custom',
        message: 'Round participants must have unique player IDs.',
        path: ['participants'],
      });
    }

    if (round.results !== null) {
      const participantIndex = new Map(
        round.participants.map((participant, index) => [
          participant.playerId,
          index,
        ]),
      );
      if (round.results.players.length !== round.participants.length) {
        context.addIssue({
          code: 'custom',
          message:
            'Final results must contain every round participant exactly once.',
          path: ['results', 'players'],
        });
      }
      round.results.players.forEach((player, index) => {
        const participant = round.participants.find(
          (candidate) => candidate.playerId === player.playerId,
        );
        if (!participant || participant.displayName !== player.displayName) {
          context.addIssue({
            code: 'custom',
            message:
              'Result identity must match the immutable participant snapshot.',
            path: ['results', 'players', index],
          });
        }
      });
      const expectedOrder = [...round.results.players].sort((left, right) => {
        const scoreDifference = right.finalScore - left.finalScore;
        return (
          scoreDifference ||
          (participantIndex.get(left.playerId) ?? Number.MAX_SAFE_INTEGER) -
            (participantIndex.get(right.playerId) ?? Number.MAX_SAFE_INTEGER)
        );
      });
      if (
        expectedOrder.some(
          (player, index) =>
            player.playerId !== round.results?.players[index]?.playerId,
        )
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Tied result players must retain participant-snapshot order.',
          path: ['results', 'players'],
        });
      }
    }
  })
  .readonly();

export const displayStateSchema = z
  .object({
    connected: z.boolean(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const playerStateSchema = z
  .object({
    id: playerIdSchema,
    displayName: serializedDisplayNameSchema,
    connected: z.boolean(),
    joinedAt: z.string().datetime(),
    isController: z.boolean(),
  })
  .strict();

export const controllerStatusSchema = z.enum(['none', 'assigned']);

export const roomStateSchema = z
  .object({
    code: roomCodeSchema,
    phase: roomPhaseSchema,
    stateVersion: z.number().int().nonnegative().safe(),
    serverTime: z.string().datetime(),
    createdAt: z.string().datetime(),
    lastActivityAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    maxPlayers: z.number().int().min(1).max(productConfig.maxPlayers),
    display: displayStateSchema,
    controllerStatus: controllerStatusSchema,
    controllerPlayerId: playerIdSchema.nullable(),
    players: z.array(playerStateSchema).max(productConfig.maxPlayers),
    settings: roomSettingsSchema,
    round: roundStateSchema.nullable(),
  })
  .strict()
  .superRefine((room, context) => {
    const controllerPlayers = room.players.filter(
      (player) => player.isController,
    );

    if (room.controllerStatus === 'none') {
      if (
        room.controllerPlayerId !== null ||
        controllerPlayers.length !== 0 ||
        room.players.some((player) => player.connected)
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Controller status none requires no assigned or connected player.',
          path: ['controllerStatus'],
        });
      }
    } else if (
      room.controllerPlayerId === null ||
      controllerPlayers.length !== 1 ||
      controllerPlayers[0]?.id !== room.controllerPlayerId
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'A room with players must reference exactly one controller player.',
        path: ['controllerPlayerId'],
      });
    }

    if (room.phase === 'LOBBY' && room.round !== null) {
      context.addIssue({
        code: 'custom',
        message: 'A lobby cannot expose a round snapshot.',
        path: ['round'],
      });
    }

    if (
      room.phase === 'ROUND_ACTIVE' &&
      (room.round === null || room.round.endedAt !== null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'An active round must have an unended round snapshot.',
        path: ['round'],
      });
    }

    if (
      room.phase === 'ROUND_ENDED' &&
      (room.round === null || room.round.endedAt === null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'An ended round must have an ended round snapshot.',
        path: ['round'],
      });
    }
  });

export const displaySessionCredentialsSchema = z
  .object({
    displaySessionId: z.string().uuid(),
    displayReconnectToken: reconnectTokenSchema,
  })
  .strict();

export const playerSessionCredentialsSchema = z
  .object({
    playerId: z.string().uuid(),
    playerReconnectToken: reconnectTokenSchema,
  })
  .strict();

export const maximumAcceptedWordsPerPlayerPerRound =
  productConfig.maximumAcceptedWordsPerPlayerPerRound;

export const acceptedWordSchema = z
  .object({
    sequence: z.number().int().positive().safe(),
    word: z
      .string()
      .min(3)
      .max(64)
      .regex(/^[A-Z]+$/),
    points: traditionalPointsSchema,
    acceptedAt: z.string().datetime(),
  })
  .strict()
  .readonly();

export const playerRoundSubmissionStateSchema = z
  .object({
    roundId: roundIdSchema,
    playerId: playerIdSchema,
    submissionVersion: z
      .number()
      .int()
      .nonnegative()
      .safe()
      .max(maximumAcceptedWordsPerPlayerPerRound),
    acceptedWords: z
      .array(acceptedWordSchema)
      .max(maximumAcceptedWordsPerPlayerPerRound)
      .readonly(),
    provisionalScore: z
      .number()
      .int()
      .nonnegative()
      .safe()
      .max(maximumAcceptedWordsPerPlayerPerRound * 11),
  })
  .strict()
  .superRefine((state, context) => {
    if (state.submissionVersion !== state.acceptedWords.length) {
      context.addIssue({
        code: 'custom',
        message: 'Submission version must equal accepted-word count.',
        path: ['submissionVersion'],
      });
    }

    const words = new Set<string>();
    let score = 0;
    state.acceptedWords.forEach((acceptedWord, index) => {
      if (acceptedWord.sequence !== index + 1) {
        context.addIssue({
          code: 'custom',
          message: 'Accepted-word sequences must be contiguous.',
          path: ['acceptedWords', index, 'sequence'],
        });
      }
      if (words.has(acceptedWord.word)) {
        context.addIssue({
          code: 'custom',
          message: 'Accepted words must be unique for one player.',
          path: ['acceptedWords', index, 'word'],
        });
      }
      words.add(acceptedWord.word);
      score += acceptedWord.points;
    });

    if (state.provisionalScore !== score) {
      context.addIssue({
        code: 'custom',
        message: 'Provisional score must equal the accepted-word total.',
        path: ['provisionalScore'],
      });
    }
  })
  .readonly();

export const submissionErrorCodeSchema = z.enum([
  'INVALID_PAYLOAD',
  'UNAUTHORIZED',
  'ROUND_NOT_ACTIVE',
  'ROUND_MISMATCH',
  'NOT_ROUND_PARTICIPANT',
  'INVALID_PATH',
  'INVALID_WORD_FORMAT',
  'WORD_TOO_SHORT',
  'PATH_WORD_MISMATCH',
  'WORD_NOT_IN_DICTIONARY',
  'ALREADY_SUBMITTED',
  'SUBMISSION_LIMIT_REACHED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]);

export const submissionErrorSchema = z
  .object({
    code: submissionErrorCodeSchema,
    message: z.string().min(1).max(180),
  })
  .strict()
  .readonly();

const submitWordSuccessSchema = z
  .object({
    ok: z.literal(true),
    acceptedWord: acceptedWordSchema,
    state: playerRoundSubmissionStateSchema,
  })
  .strict()
  .superRefine((response, context) => {
    const finalWord = response.state.acceptedWords.at(-1);
    if (
      !finalWord ||
      finalWord.sequence !== response.acceptedWord.sequence ||
      finalWord.word !== response.acceptedWord.word ||
      finalWord.points !== response.acceptedWord.points ||
      finalWord.acceptedAt !== response.acceptedWord.acceptedAt ||
      response.acceptedWord.sequence !== response.state.submissionVersion
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'The accepted word must be the final committed submission-state entry.',
        path: ['acceptedWord'],
      });
    }
  })
  .readonly();

const submitWordFailureSchema = z
  .object({
    ok: z.literal(false),
    error: submissionErrorSchema,
    state: playerRoundSubmissionStateSchema.nullable(),
  })
  .strict()
  .readonly();

export const submitWordResponseSchema = z.discriminatedUnion('ok', [
  submitWordSuccessSchema,
  submitWordFailureSchema,
]);

export const roomErrorCodeSchema = z.enum([
  'INVALID_PAYLOAD',
  'INVALID_NAME',
  'UNAUTHORIZED',
  'NOT_CONTROLLER',
  'TARGET_PLAYER_NOT_FOUND',
  'TARGET_PLAYER_OFFLINE',
  'TARGET_ALREADY_CONTROLLER',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'ROOM_EXPIRED',
  'RECONNECT_FAILED',
  'RATE_LIMITED',
  'SERVER_BUSY',
  'ROUND_IN_PROGRESS',
  'BOARD_GENERATION_FAILED',
  'INTERNAL_ERROR',
]);

export const roomErrorSchema = z
  .object({
    code: roomErrorCodeSchema,
    message: z.string().min(1).max(180),
  })
  .strict();

export const roomActionFailureSchema = z
  .object({
    ok: z.literal(false),
    error: roomErrorSchema,
  })
  .strict();

const controllerActionSuccessSchema = z
  .object({
    ok: z.literal(true),
    room: roomStateSchema,
  })
  .strict();

const displayActionSuccessSchema = z
  .object({
    ok: z.literal(true),
    room: roomStateSchema,
    session: displaySessionCredentialsSchema,
  })
  .strict();

const playerActionSuccessSchema = z
  .object({
    ok: z.literal(true),
    room: roomStateSchema,
    session: playerSessionCredentialsSchema,
    submissionState: playerRoundSubmissionStateSchema.nullable(),
  })
  .strict();

export const displayActionResponseSchema = z.discriminatedUnion('ok', [
  displayActionSuccessSchema,
  roomActionFailureSchema,
]);

export const playerActionResponseSchema = z.discriminatedUnion('ok', [
  playerActionSuccessSchema,
  roomActionFailureSchema,
]);

export const leaveSessionResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  roomActionFailureSchema,
]);

export const controllerActionResponseSchema = z.discriminatedUnion('ok', [
  controllerActionSuccessSchema,
  roomActionFailureSchema,
]);

export type CreateDisplayInput = z.infer<typeof createDisplayInputSchema>;
export type JoinPlayerInput = z.infer<typeof joinPlayerInputSchema>;
export type ReconnectDisplayInput = z.infer<typeof reconnectDisplayInputSchema>;
export type ReconnectPlayerInput = z.infer<typeof reconnectPlayerInputSchema>;
export type LeaveSessionInput = z.infer<typeof leaveSessionInputSchema>;
export type StartRoundInput = z.infer<typeof startRoundInputSchema>;
export type SubmitWordInput = z.infer<typeof submitWordInputSchema>;
export type TransferControllerInput = z.infer<
  typeof transferControllerInputSchema
>;
export type UpdateRoomSettingsInput = z.infer<
  typeof updateRoomSettingsInputSchema
>;
export type RoomSettings = z.infer<typeof roomSettingsSchema>;
export type RoomPhase = z.infer<typeof roomPhaseSchema>;
export type RoundParticipant = z.infer<typeof roundParticipantSchema>;
export type RoundBoard = z.infer<typeof roundBoardSchema>;
export type UniqueBonusPoints = z.infer<typeof uniqueBonusPointsSchema>;
export type FinalWordPoints = z.infer<typeof finalWordPointsSchema>;
export type RoundResultWord = z.infer<typeof roundResultWordSchema>;
export type RoundPlayerResult = z.infer<typeof roundPlayerResultSchema>;
export type RoundResults = z.infer<typeof roundResultsSchema>;
export type RoundState = z.infer<typeof roundStateSchema>;
export type DisplayState = z.infer<typeof displayStateSchema>;
export type PlayerState = z.infer<typeof playerStateSchema>;
export type ControllerStatus = z.infer<typeof controllerStatusSchema>;
export type RoomState = z.infer<typeof roomStateSchema>;
export type DisplaySessionCredentials = z.infer<
  typeof displaySessionCredentialsSchema
>;
export type PlayerSessionCredentials = z.infer<
  typeof playerSessionCredentialsSchema
>;
export type AcceptedWord = z.infer<typeof acceptedWordSchema>;
export type PlayerRoundSubmissionState = z.infer<
  typeof playerRoundSubmissionStateSchema
>;
export type SubmissionErrorCode = z.infer<typeof submissionErrorCodeSchema>;
export type SubmissionError = z.infer<typeof submissionErrorSchema>;
export type SubmitWordResponse = z.infer<typeof submitWordResponseSchema>;
export type RoomErrorCode = z.infer<typeof roomErrorCodeSchema>;
export type RoomError = z.infer<typeof roomErrorSchema>;
export type RoomActionFailure = z.infer<typeof roomActionFailureSchema>;
export type DisplayActionSuccess = z.infer<typeof displayActionSuccessSchema>;
export type DisplayActionResponse = z.infer<typeof displayActionResponseSchema>;
export type PlayerActionSuccess = z.infer<typeof playerActionSuccessSchema>;
export type PlayerActionResponse = z.infer<typeof playerActionResponseSchema>;
export type LeaveSessionResponse = z.infer<typeof leaveSessionResponseSchema>;
export type ControllerActionResponse = z.infer<
  typeof controllerActionResponseSchema
>;
export type DisplayActionAcknowledgement = (
  response: DisplayActionResponse,
) => void;
export type PlayerActionAcknowledgement = (
  response: PlayerActionResponse,
) => void;
export type LeaveSessionAcknowledgement = (
  response: LeaveSessionResponse,
) => void;
export type ControllerActionAcknowledgement = (
  response: ControllerActionResponse,
) => void;
export type SubmitWordAcknowledgement = (response: SubmitWordResponse) => void;
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface ClientToServerEvents {
  'display:create': (
    payload: CreateDisplayInput,
    acknowledge: DisplayActionAcknowledgement,
  ) => void;
  'display:reconnect': (
    payload: ReconnectDisplayInput,
    acknowledge: DisplayActionAcknowledgement,
  ) => void;
  'display:leave': (
    payload: LeaveSessionInput,
    acknowledge: LeaveSessionAcknowledgement,
  ) => void;
  'player:join': (
    payload: JoinPlayerInput,
    acknowledge: PlayerActionAcknowledgement,
  ) => void;
  'player:reconnect': (
    payload: ReconnectPlayerInput,
    acknowledge: PlayerActionAcknowledgement,
  ) => void;
  'player:leave': (
    payload: LeaveSessionInput,
    acknowledge: LeaveSessionAcknowledgement,
  ) => void;
  'player:submit-word': (
    payload: SubmitWordInput,
    acknowledge: SubmitWordAcknowledgement,
  ) => void;
  'controller:transfer': (
    payload: TransferControllerInput,
    acknowledge: ControllerActionAcknowledgement,
  ) => void;
  'controller:update-settings': (
    payload: UpdateRoomSettingsInput,
    acknowledge: ControllerActionAcknowledgement,
  ) => void;
  'controller:start-round': (
    payload: StartRoundInput,
    acknowledge: ControllerActionAcknowledgement,
  ) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomState) => void;
  'room:error': (error: RoomError) => void;
  'display:connected': (display: DisplayState) => void;
  'display:disconnected': (display: DisplayState) => void;
  'player:connected': (player: PlayerState) => void;
  'player:disconnected': (player: PlayerState) => void;
}
