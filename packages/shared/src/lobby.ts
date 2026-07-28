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

export const createRoomInputSchema = z
  .object({
    displayName: displayNameSchema,
  })
  .strict();

export const joinRoomInputSchema = z
  .object({
    roomCode: roomCodeSchema,
    displayName: displayNameSchema,
  })
  .strict();

export const reconnectRoomInputSchema = z
  .object({
    roomCode: roomCodeSchema,
    reconnectToken: reconnectTokenSchema,
  })
  .strict();

export const leaveRoomInputSchema = z.object({}).strict();

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

export const playerStateSchema = z
  .object({
    id: z.string().uuid(),
    displayName: displayNameSchema,
    connected: z.boolean(),
    joinedAt: z.string().datetime(),
    isHost: z.boolean(),
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
    players: z.array(playerStateSchema).max(productConfig.maxPlayers),
    settings: roomSettingsSchema,
  })
  .strict();

export const sessionCredentialsSchema = z
  .object({
    playerId: z.string().uuid(),
    reconnectToken: reconnectTokenSchema,
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

const roomActionSuccessSchema = z
  .object({
    ok: z.literal(true),
    room: roomStateSchema,
    session: sessionCredentialsSchema,
  })
  .strict();

const roomActionFailureSchema = z
  .object({
    ok: z.literal(false),
    error: roomErrorSchema,
  })
  .strict();

export const roomActionResponseSchema = z.discriminatedUnion('ok', [
  roomActionSuccessSchema,
  roomActionFailureSchema,
]);

export const leaveRoomResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  roomActionFailureSchema,
]);

export type CreateRoomInput = z.infer<typeof createRoomInputSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomInputSchema>;
export type ReconnectRoomInput = z.infer<typeof reconnectRoomInputSchema>;
export type LeaveRoomInput = z.infer<typeof leaveRoomInputSchema>;
export type RoomSettings = z.infer<typeof roomSettingsSchema>;
export type PlayerState = z.infer<typeof playerStateSchema>;
export type RoomState = z.infer<typeof roomStateSchema>;
export type SessionCredentials = z.infer<typeof sessionCredentialsSchema>;
export type RoomErrorCode = z.infer<typeof roomErrorCodeSchema>;
export type RoomError = z.infer<typeof roomErrorSchema>;
export type RoomActionSuccess = z.infer<typeof roomActionSuccessSchema>;
export type RoomActionResponse = z.infer<typeof roomActionResponseSchema>;
export type LeaveRoomResponse = z.infer<typeof leaveRoomResponseSchema>;
export type RoomActionAcknowledgement = (response: RoomActionResponse) => void;
export type LeaveRoomAcknowledgement = (response: LeaveRoomResponse) => void;
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface ClientToServerEvents {
  'room:create': (
    payload: CreateRoomInput,
    acknowledge: RoomActionAcknowledgement,
  ) => void;
  'room:join': (
    payload: JoinRoomInput,
    acknowledge: RoomActionAcknowledgement,
  ) => void;
  'room:reconnect': (
    payload: ReconnectRoomInput,
    acknowledge: RoomActionAcknowledgement,
  ) => void;
  'room:leave': (
    payload: LeaveRoomInput,
    acknowledge: LeaveRoomAcknowledgement,
  ) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomState) => void;
  'room:error': (error: RoomError) => void;
  'player:connected': (player: PlayerState) => void;
  'player:disconnected': (player: PlayerState) => void;
}
