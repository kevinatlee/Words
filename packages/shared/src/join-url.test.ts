import { describe, expect, it } from 'vitest';

import { productConfig } from './config';
import { buildJoinUrl } from './join-url';

describe('player join URLs', () => {
  it.each([
    {
      label: 'current local development origin and port',
      baseUrl: 'http://localhost:5173',
      roomCode: 'abc-234',
      expected: 'http://localhost:5173/join/ABC234',
    },
    {
      label: 'LAN IPv4 origin and port',
      baseUrl: 'http://192.168.1.42:5173',
      roomCode: 'ABC234',
      expected: 'http://192.168.1.42:5173/join/ABC234',
    },
    {
      label: 'ordinary hostname origin',
      baseUrl: 'https://party.example',
      roomCode: 'abc234',
      expected: 'https://party.example/join/ABC234',
    },
    {
      label: 'base URL with an unrelated path',
      baseUrl: 'https://party.example/old/path',
      roomCode: 'ABC234',
      expected: 'https://party.example/join/ABC234',
    },
    {
      label: 'base URL with query parameters and a fragment',
      baseUrl: 'https://party.example/old?token=secret#private',
      roomCode: ' ABC-234 ',
      expected: 'https://party.example/join/ABC234',
    },
    {
      label: 'base URL with embedded URL credentials',
      baseUrl: 'https://user:password@party.example/old',
      roomCode: 'ABC234',
      expected: 'https://party.example/join/ABC234',
    },
  ])('uses the $label', ({ baseUrl, roomCode, expected }) => {
    const result = buildJoinUrl(baseUrl, roomCode);

    expect(result).toBe(expected);
    const url = new URL(result);
    expect(url.pathname).toBe('/join/ABC234');
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
    expect(url.username).toBe('');
    expect(url.password).toBe('');
  });

  it('uses the configured public origin in production', () => {
    expect(buildJoinUrl(productConfig.publicUrl, ' ABC 234 ')).toBe(
      'https://words.atlee.io/join/ABC234',
    );
  });

  it('rejects an invalid room code', () => {
    expect(() => buildJoinUrl('http://localhost:5173', 'invalid')).toThrow();
  });

  it('rejects an invalid base URL', () => {
    expect(() => buildJoinUrl('not an origin', 'ABC234')).toThrow();
  });
});
