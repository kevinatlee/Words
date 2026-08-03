import { productConfig } from '@words/shared';

export type ServerConfig = {
  port: number;
  publicBaseUrl: string;
  maxPlayers: number;
  maxRooms: number;
  roomTtlMs: number;
  reconnectGraceMs: number;
  cleanupIntervalMs: number;
  rateLimitWindowMs: number;
  rateLimitAttempts: number;
};

function readInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    return fallback;
  }

  return parsed;
}

export function createServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const port = readInteger(
    environment.PORT,
    productConfig.productionPort,
    0,
    65_535,
  );
  const roomTtlMinutes = readInteger(
    environment.ROOM_TTL_MINUTES,
    productConfig.roomTtlMinutes,
    1,
    24 * 60,
  );
  const reconnectGraceSeconds = readInteger(
    environment.RECONNECT_GRACE_SECONDS,
    productConfig.reconnectGraceSeconds,
    5,
    10 * 60,
  );

  return {
    port,
    publicBaseUrl:
      environment.PUBLIC_BASE_URL ?? `http://localhost:${String(port)}`,
    maxPlayers: readInteger(
      environment.MAX_PLAYERS,
      productConfig.maxPlayers,
      1,
      productConfig.maxPlayers,
    ),
    maxRooms: readInteger(environment.MAX_ROOMS, 500, 1, 10_000),
    roomTtlMs: roomTtlMinutes * 60 * 1000,
    reconnectGraceMs: reconnectGraceSeconds * 1000,
    cleanupIntervalMs:
      readInteger(environment.CLEANUP_INTERVAL_SECONDS, 30, 1, 5 * 60) * 1000,
    rateLimitWindowMs: 10_000,
    rateLimitAttempts: 20,
  };
}
