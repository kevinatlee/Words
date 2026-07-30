import { describe, expect, it } from 'vitest';

import {
  PlayerSubmissionRateLimiter,
  SocketRateLimiter,
} from '../src/rate-limiter.js';

describe('SocketRateLimiter', () => {
  it('bounds lobby attempts per socket and releases them after the window', () => {
    let now = 1_000;
    const limiter = new SocketRateLimiter(10_000, 2, () => now);

    expect(limiter.allow('socket-one')).toBe(true);
    expect(limiter.allow('socket-one')).toBe(true);
    expect(limiter.allow('socket-one')).toBe(false);
    expect(limiter.allow('socket-two')).toBe(true);

    now += 10_001;
    expect(limiter.allow('socket-one')).toBe(true);
  });

  it('clears disconnected socket state', () => {
    const limiter = new SocketRateLimiter(10_000, 1);

    expect(limiter.allow('socket-one')).toBe(true);
    expect(limiter.allow('socket-one')).toBe(false);
    limiter.clear('socket-one');
    expect(limiter.allow('socket-one')).toBe(true);
  });
});

describe('PlayerSubmissionRateLimiter', () => {
  it('uses stable room and player identity rather than socket identity', () => {
    const limiter = new PlayerSubmissionRateLimiter(1_000, 2, 8, () => 1_000);

    expect(limiter.allow('ABC234', 'player-one')).toBe(true);
    expect(limiter.allow('ABC234', 'player-one')).toBe(true);
    expect(limiter.allow('ABC234', 'player-one')).toBe(false);
    expect(limiter.allow('ABC234', 'player-two')).toBe(true);
    expect(limiter.allow('DEF567', 'player-one')).toBe(true);
  });

  it('bounds keys and prunes stale windows without timers', () => {
    let now = 1_000;
    const limiter = new PlayerSubmissionRateLimiter(1_000, 10, 1, () => now);

    expect(limiter.allow('ABC234', 'player-one')).toBe(true);
    expect(limiter.allow('ABC234', 'player-two')).toBe(false);
    now = 2_001;
    expect(limiter.allow('ABC234', 'player-two')).toBe(true);
  });
});
