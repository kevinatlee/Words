function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
}

export class SocketRateLimiter {
  private readonly attemptsBySocket = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly maximumAttempts: number,
    private readonly now: () => number = Date.now,
  ) {
    requirePositiveInteger(windowMs, 'Rate-limit window');
    requirePositiveInteger(maximumAttempts, 'Maximum attempts');
  }

  allow(socketId: string, attemptedAt = this.now()): boolean {
    const now = attemptedAt;
    const cutoff = now - this.windowMs;
    const attempts = (this.attemptsBySocket.get(socketId) ?? []).filter(
      (attemptedAt) => attemptedAt > cutoff,
    );

    if (attempts.length >= this.maximumAttempts) {
      this.attemptsBySocket.set(socketId, attempts);
      return false;
    }

    attempts.push(now);
    this.attemptsBySocket.set(socketId, attempts);
    return true;
  }

  clear(socketId: string): void {
    this.attemptsBySocket.delete(socketId);
  }
}

type SubmissionWindow = {
  attempts: number[];
  lastAttemptAt: number;
};

export class PlayerSubmissionRateLimiter {
  private readonly attemptsByPlayer = new Map<string, SubmissionWindow>();

  constructor(
    private readonly windowMs = 1_000,
    private readonly maximumAttempts = 10,
    private readonly maximumKeys = 4_000,
    private readonly now: () => number = Date.now,
  ) {
    requirePositiveInteger(windowMs, 'Submission rate-limit window');
    requirePositiveInteger(maximumAttempts, 'Maximum submission attempts');
    requirePositiveInteger(maximumKeys, 'Maximum submission keys');
  }

  allow(roomCode: string, playerId: string, attemptedAt = this.now()): boolean {
    const now = attemptedAt;
    const cutoff = now - this.windowMs;
    this.prune(cutoff);
    const key = `${roomCode}:${playerId}`;
    const existing = this.attemptsByPlayer.get(key);

    if (!existing && this.attemptsByPlayer.size >= this.maximumKeys) {
      return false;
    }

    const attempts = (existing?.attempts ?? []).filter(
      (attemptedAt) => attemptedAt > cutoff,
    );
    if (attempts.length >= this.maximumAttempts) {
      this.attemptsByPlayer.set(key, {
        attempts,
        lastAttemptAt: existing?.lastAttemptAt ?? now,
      });
      return false;
    }

    attempts.push(now);
    this.attemptsByPlayer.set(key, { attempts, lastAttemptAt: now });
    return true;
  }

  private prune(cutoff: number): void {
    for (const [key, window] of this.attemptsByPlayer) {
      if (window.lastAttemptAt <= cutoff) {
        this.attemptsByPlayer.delete(key);
      }
    }
  }
}
