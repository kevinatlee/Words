import { describe, expect, it } from 'vitest';

import { createCryptoRandomSource } from '../src/crypto-random-source.js';

describe('createCryptoRandomSource', () => {
  it('maps the lowest 48-bit value to zero', () => {
    const random = createCryptoRandomSource(() => Buffer.alloc(6, 0));
    expect(random.next()).toBe(0);
  });

  it('maps the highest 48-bit value below one without modulo bias', () => {
    const random = createCryptoRandomSource(() => Buffer.alloc(6, 0xff));
    expect(random.next()).toBe((2 ** 48 - 1) / 2 ** 48);
    expect(random.next()).toBeLessThan(1);
  });

  it('interprets all six bytes as one unsigned integer', () => {
    const random = createCryptoRandomSource(() =>
      Buffer.from([0, 0, 0, 0, 0, 1]),
    );
    expect(random.next()).toBe(1 / 2 ** 48);
  });

  it('fails closed when an injected source returns the wrong byte count', () => {
    const random = createCryptoRandomSource(() => Buffer.alloc(5));
    expect(() => random.next()).toThrow(/exactly 6 bytes/i);
  });
});
