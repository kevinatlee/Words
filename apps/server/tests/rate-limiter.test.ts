import { describe, expect, it } from 'vitest';

import { SocketRateLimiter } from '../src/rate-limiter.js';

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
