import { beforeEach, describe, expect, it } from 'vitest';

import { createLobbySessionStore } from './session-store';

describe('temporary lobby session storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('keeps reconnect credentials in localStorage with a per-tab pointer', () => {
    const store = createLobbySessionStore(
      window.localStorage,
      window.sessionStorage,
    );
    const session = {
      roomCode: 'ABC234',
      playerId: '00000000-0000-4000-8000-000000000001',
      reconnectToken: 'a'.repeat(43),
      displayName: 'Game Host',
    };

    store.save(session);

    expect(store.load('ABC234')).toEqual(session);
    expect(window.sessionStorage.length).toBe(1);
    expect(window.localStorage.length).toBe(1);
  });

  it('does not apply one room session to another room', () => {
    const store = createLobbySessionStore(
      window.localStorage,
      window.sessionStorage,
    );
    store.save({
      roomCode: 'ABC234',
      playerId: '00000000-0000-4000-8000-000000000001',
      reconnectToken: 'a'.repeat(43),
      displayName: 'Game Host',
    });

    expect(store.load('XYZ789')).toBeNull();
  });

  it('removes both the pointer and reconnect credential', () => {
    const store = createLobbySessionStore(
      window.localStorage,
      window.sessionStorage,
    );
    const session = {
      roomCode: 'ABC234',
      playerId: '00000000-0000-4000-8000-000000000001',
      reconnectToken: 'a'.repeat(43),
      displayName: 'Game Host',
    };
    store.save(session);

    store.clear(session);

    expect(store.load('ABC234')).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
    expect(window.localStorage.length).toBe(0);
  });
});
