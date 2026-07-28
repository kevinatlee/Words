import { describe, expect, it } from 'vitest';

import { productConfig } from './config';
import { buildJoinUrl } from './join-url';

describe('player join URLs', () => {
  it('uses the current local browser origin during development', () => {
    expect(buildJoinUrl('http://localhost:5173', 'abc-234')).toBe(
      'http://localhost:5173/join/ABC234',
    );
  });

  it('uses the configured public origin in production', () => {
    expect(buildJoinUrl(productConfig.publicUrl, ' ABC 234 ')).toBe(
      'https://words.atlee.io/join/ABC234',
    );
  });

  it('rejects an invalid room code', () => {
    expect(() => buildJoinUrl('http://localhost:5173', 'invalid')).toThrow();
  });
});
