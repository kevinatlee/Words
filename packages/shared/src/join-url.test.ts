import { describe, expect, it } from 'vitest';

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
      baseUrl: 'http://192.0.2.42:5173',
      roomCode: 'ABC234',
      expected: 'http://192.0.2.42:5173/join/ABC234',
    },
    {
      label: 'ordinary hostname origin',
      baseUrl: 'https://party.example.invalid',
      roomCode: 'abc234',
      expected: 'https://party.example.invalid/join/ABC234',
    },
    {
      label: 'base URL with an unrelated path',
      baseUrl: 'https://party.example.invalid/old/path',
      roomCode: 'ABC234',
      expected: 'https://party.example.invalid/join/ABC234',
    },
    {
      label: 'base URL with query parameters and a fragment',
      baseUrl: 'https://party.example.invalid/old?token=secret#private',
      roomCode: ' ABC-234 ',
      expected: 'https://party.example.invalid/join/ABC234',
    },
    {
      label: 'base URL with embedded URL credentials',
      baseUrl: 'https://user:password@party.example.invalid/old',
      roomCode: 'ABC234',
      expected: 'https://party.example.invalid/join/ABC234',
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
    expect(buildJoinUrl('https://public.example.invalid', ' ABC 234 ')).toBe(
      'https://public.example.invalid/join/ABC234',
    );
  });

  it('rejects an invalid room code', () => {
    expect(() => buildJoinUrl('http://localhost:5173', 'invalid')).toThrow();
  });

  it('rejects an invalid base URL', () => {
    expect(() => buildJoinUrl('not an origin', 'ABC234')).toThrow();
  });
});
