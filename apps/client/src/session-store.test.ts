import { beforeEach, describe, expect, it } from 'vitest';

import {
  createLobbySessionStore,
  type StoredDisplaySession,
  type StoredPlayerSession,
} from './session-store';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('temporary role-specific lobby session storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('stores a display credential with a per-tab display pointer', () => {
    const store = createLobbySessionStore(
      window.localStorage,
      window.sessionStorage,
    );
    const session: StoredDisplaySession = {
      role: 'display',
      roomCode: 'ABC234',
      displaySessionId: '00000000-0000-4000-8000-000000000100',
      displayReconnectToken: 'a'.repeat(43),
    };

    store.save(session);

    expect(store.load('ABC234')).toEqual(session);
    expect(window.sessionStorage.length).toBe(1);
    expect(window.localStorage.length).toBe(1);
  });

  it('stores player credentials separately from display credentials', () => {
    const store = createLobbySessionStore(
      window.localStorage,
      window.sessionStorage,
    );
    const session: StoredPlayerSession = {
      role: 'player',
      roomCode: 'ABC234',
      playerId: '00000000-0000-4000-8000-000000000001',
      playerReconnectToken: 'b'.repeat(43),
      displayName: 'Silver Owl',
    };

    store.save(session);

    expect(store.load('ABC234')).toEqual(session);
    expect(window.localStorage.key(0)).toContain(
      'words:reconnect:player:ABC234',
    );
  });

  it('does not interpret display credentials as player credentials', () => {
    const store = createLobbySessionStore(
      window.localStorage,
      window.sessionStorage,
    );
    const playerId = '00000000-0000-4000-8000-000000000001';
    window.sessionStorage.setItem(
      'words:active-lobby-session',
      JSON.stringify({
        role: 'player',
        roomCode: 'ABC234',
        sessionId: playerId,
      }),
    );
    window.localStorage.setItem(
      `words:reconnect:player:ABC234:${playerId}`,
      JSON.stringify({
        displayReconnectToken: 'c'.repeat(43),
      }),
    );

    expect(store.load('ABC234')).toBeNull();
  });

  it('does not apply one room session to another room', () => {
    const store = createLobbySessionStore(
      window.localStorage,
      window.sessionStorage,
    );
    store.save({
      role: 'player',
      roomCode: 'ABC234',
      playerId: '00000000-0000-4000-8000-000000000001',
      playerReconnectToken: 'd'.repeat(43),
      displayName: 'Silver Owl',
    });

    expect(store.load('XYZ789')).toBeNull();
  });

  it('removes both the pointer and the role-specific credential', () => {
    const store = createLobbySessionStore(
      window.localStorage,
      window.sessionStorage,
    );
    const session: StoredDisplaySession = {
      role: 'display',
      roomCode: 'ABC234',
      displaySessionId: '00000000-0000-4000-8000-000000000100',
      displayReconnectToken: 'e'.repeat(43),
    };
    store.save(session);

    store.clear(session);

    expect(store.load('ABC234')).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
    expect(window.localStorage.length).toBe(0);
  });

  it('does not let a stale display tab erase a rotated display credential', () => {
    const staleTabStore = createLobbySessionStore(
      window.localStorage,
      window.sessionStorage,
    );
    const currentTabStore = createLobbySessionStore(
      window.localStorage,
      createMemoryStorage(),
    );
    const staleSession: StoredDisplaySession = {
      role: 'display',
      roomCode: 'ABC234',
      displaySessionId: '00000000-0000-4000-8000-000000000100',
      displayReconnectToken: 'f'.repeat(43),
    };
    const currentSession: StoredDisplaySession = {
      ...staleSession,
      displayReconnectToken: 'g'.repeat(43),
    };

    staleTabStore.save(staleSession);
    currentTabStore.save(currentSession);
    staleTabStore.clear(staleSession);

    expect(staleTabStore.load('ABC234')).toBeNull();
    expect(currentTabStore.load('ABC234')).toEqual(currentSession);
  });

  it('does not let a stale player tab erase a rotated player credential', () => {
    const staleTabStore = createLobbySessionStore(
      window.localStorage,
      window.sessionStorage,
    );
    const currentTabStore = createLobbySessionStore(
      window.localStorage,
      createMemoryStorage(),
    );
    const staleSession: StoredPlayerSession = {
      role: 'player',
      roomCode: 'ABC234',
      playerId: '00000000-0000-4000-8000-000000000001',
      playerReconnectToken: 'h'.repeat(43),
      displayName: 'Silver Owl',
    };
    const currentSession: StoredPlayerSession = {
      ...staleSession,
      playerReconnectToken: 'i'.repeat(43),
    };

    staleTabStore.save(staleSession);
    currentTabStore.save(currentSession);
    staleTabStore.clear(staleSession);

    expect(staleTabStore.load('ABC234')).toBeNull();
    expect(currentTabStore.load('ABC234')).toEqual(currentSession);
  });
});
