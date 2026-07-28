export class SocketRateLimiter {
  private readonly attemptsBySocket = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly maximumAttempts: number,
    private readonly now: () => number = Date.now,
  ) {}

  allow(socketId: string): boolean {
    const cutoff = this.now() - this.windowMs;
    const attempts = (this.attemptsBySocket.get(socketId) ?? []).filter(
      (attemptedAt) => attemptedAt > cutoff,
    );

    if (attempts.length >= this.maximumAttempts) {
      this.attemptsBySocket.set(socketId, attempts);
      return false;
    }

    attempts.push(this.now());
    this.attemptsBySocket.set(socketId, attempts);
    return true;
  }

  clear(socketId: string): void {
    this.attemptsBySocket.delete(socketId);
  }
}
