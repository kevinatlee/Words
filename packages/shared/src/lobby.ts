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
