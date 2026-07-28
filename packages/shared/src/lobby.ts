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

export const displayStateSchema = z
  .object({
    connected: z.boolean(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const playerStateSchema = z
  .object({
    id: z.string().uuid(),
    displayName: displayNameSchema,
    connected: z.boolean(),
    joinedAt: z.string().datetime(),
    isController: z.boolean(),
  })
  .strict();

export const roomStateSchema = z
  .object({
    code: roomCodeSchema,
    phase: z.literal('LOBBY'),
    createdAt: z.string().datetime(),
    lastActivityAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    maxPlayers: z.number().int().min(1).max(productConfig.maxPlayers),
    display: displayStateSchema,
    controllerPlayerId: z.string().uuid().nullable(),
    players: z.array(playerStateSchema).max(productConfig.maxPlayers),
    settings: roomSettingsSchema,
  })
  .strict()
  .superRefine((room, context) => {
    const controllerPlayers = room.players.filter(
      (player) => player.isController,
    );

    if (room.players.length === 0) {
      if (room.controllerPlayerId !== null || controllerPlayers.length !== 0) {
        context.addIssue({
          code: 'custom',
          message: 'An empty room cannot have a controller player.',
          path: ['controllerPlayerId'],
        });
      }
      return;
    }

    if (
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
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'ROOM_EXPIRED',
  'RECONNECT_FAILED',
  'RATE_LIMITED',
  'SERVER_BUSY',
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

export type CreateDisplayInput = z.infer<typeof createDisplayInputSchema>;
export type JoinPlayerInput = z.infer<typeof joinPlayerInputSchema>;
export type ReconnectDisplayInput = z.infer<typeof reconnectDisplayInputSchema>;
export type ReconnectPlayerInput = z.infer<typeof reconnectPlayerInputSchema>;
export type LeaveSessionInput = z.infer<typeof leaveSessionInputSchema>;
export type RoomSettings = z.infer<typeof roomSettingsSchema>;
export type DisplayState = z.infer<typeof displayStateSchema>;
export type PlayerState = z.infer<typeof playerStateSchema>;
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
export type DisplayActionAcknowledgement = (
  response: DisplayActionResponse,
) => void;
export type PlayerActionAcknowledgement = (
  response: PlayerActionResponse,
) => void;
export type LeaveSessionAcknowledgement = (
  response: LeaveSessionResponse,
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
}

export interface ServerToClientEvents {
  'room:state': (room: RoomState) => void;
  'room:error': (error: RoomError) => void;
  'display:connected': (display: DisplayState) => void;
  'display:disconnected': (display: DisplayState) => void;
  'player:connected': (player: PlayerState) => void;
  'player:disconnected': (player: PlayerState) => void;
}
