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
    expect(store.loadDisplay()).toEqual(session);
    expect(window.sessionStorage.length).toBe(1);
    expect(window.localStorage.length).toBe(2);
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

  it('keeps two browser profiles attached to their own display rooms', () => {
    const firstProfileStore = createLobbySessionStore(
      createMemoryStorage(),
      createMemoryStorage(),
    );
    const secondProfileStore = createLobbySessionStore(
      createMemoryStorage(),
      createMemoryStorage(),
    );
    const firstDisplay: StoredDisplaySession = {
      role: 'display',
      roomCode: 'ABC234',
      displaySessionId: '00000000-0000-4000-8000-000000000100',
      displayReconnectToken: 'j'.repeat(43),
    };
    const secondDisplay: StoredDisplaySession = {
      role: 'display',
      roomCode: 'XYZ789',
      displaySessionId: '00000000-0000-4000-8000-000000000200',
      displayReconnectToken: 'k'.repeat(43),
    };

    firstProfileStore.save(firstDisplay);
    secondProfileStore.save(secondDisplay);

    expect(firstProfileStore.loadDisplay()).toEqual(firstDisplay);
    expect(secondProfileStore.loadDisplay()).toEqual(secondDisplay);
    expect(firstProfileStore.loadDisplay()).not.toEqual(
      secondProfileStore.loadDisplay(),
    );
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
    expect(store.loadDisplay()).toBeNull();
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

  it('recovers a player after tab closure without exposing its reconnect token', () => {
    const firstTab = createLobbySessionStore(
      window.localStorage,
      window.sessionStorage,
    );
    const session: StoredPlayerSession = {
      role: 'player',
      roomCode: 'ABC234',
      playerId: '00000000-0000-4000-8000-000000000001',
      playerReconnectToken: 'l'.repeat(43),
      displayName: 'Silver Owl',
    };
    firstTab.save(session);
    const reopenedTab = createLobbySessionStore(
      window.localStorage,
      createMemoryStorage(),
    );
    const pointer = window.localStorage.getItem(
      'words:active-player-session:ABC234',
    );

    expect(reopenedTab.loadPlayer('ABC234')).toEqual(session);
    expect(reopenedTab.loadPlayer('XYZ789')).toBeNull();
    expect(pointer).not.toContain('playerReconnectToken');
    expect(pointer).not.toContain(session.playerReconnectToken);
  });

  it('keeps the persistent player pointer through rotation and stale-tab clearing', () => {
    const staleTab = createLobbySessionStore(
      window.localStorage,
      window.sessionStorage,
    );
    const currentTab = createLobbySessionStore(
      window.localStorage,
      createMemoryStorage(),
    );
    const stale: StoredPlayerSession = {
      role: 'player',
      roomCode: 'ABC234',
      playerId: '00000000-0000-4000-8000-000000000001',
      playerReconnectToken: 'm'.repeat(43),
      displayName: 'Silver Owl',
    };
    const current = { ...stale, playerReconnectToken: 'n'.repeat(43) };
    staleTab.save(stale);
    currentTab.save(current);
    staleTab.clear(stale);

    expect(currentTab.loadPlayer('ABC234')).toEqual(current);
    currentTab.clear(current);
    expect(currentTab.loadPlayer('ABC234')).toBeNull();
    expect(
      window.localStorage.getItem('words:active-player-session:ABC234'),
    ).toBeNull();
  });

  it('cleans malformed player pointers without deleting unrelated credentials', () => {
    const store = createLobbySessionStore(
      window.localStorage,
      window.sessionStorage,
    );
    window.localStorage.setItem('words:active-player-session:ABC234', '{bad');
    window.localStorage.setItem('words:reconnect:player:XYZ789:other', '{}');
    expect(store.loadPlayer('ABC234')).toBeNull();
    expect(
      window.localStorage.getItem('words:active-player-session:ABC234'),
    ).toBeNull();
    expect(
      window.localStorage.getItem('words:reconnect:player:XYZ789:other'),
    ).toBe('{}');
  });
});
