import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ConnectionStatus,
  LeaveRoomResponse,
  PlayerState,
  RoomActionResponse,
  RoomError,
  RoomState,
} from '@words/shared';

import { App } from './App';
import type { LobbyClient } from './lobby-client';
import type { LobbySessionStore, StoredLobbySession } from './session-store';

const hostPlayer: PlayerState = {
  id: '00000000-0000-4000-8000-000000000001',
  displayName: 'Game Host',
  connected: true,
  joinedAt: '2026-07-27T20:00:00.000Z',
  isHost: true,
};

const guestPlayer: PlayerState = {
  id: '00000000-0000-4000-8000-000000000002',
  displayName: '<Bright Fox>',
  connected: true,
  joinedAt: '2026-07-27T20:01:00.000Z',
  isHost: false,
};

function createRoom(players: PlayerState[] = [hostPlayer]): RoomState {
  return {
    code: 'ABC234',
    phase: 'LOBBY',
    createdAt: '2026-07-27T20:00:00.000Z',
    lastActivityAt: '2026-07-27T20:01:00.000Z',
    expiresAt: '2026-07-27T22:01:00.000Z',
    maxPlayers: 8,
    players,
    settings: {
      gridSize: 4,
      roundDurationSeconds: 180,
      scoringMode: 'traditional',
    },
  };
}

const hostSuccess: RoomActionResponse = {
  ok: true,
  room: createRoom(),
  session: {
    playerId: hostPlayer.id,
    reconnectToken: 'a'.repeat(43),
  },
};

function createFakeClient(overrides: Partial<LobbyClient> = {}): LobbyClient {
  return {
    getConnectionStatus: () => 'connected' as ConnectionStatus,
    createRoom: vi.fn(async (): Promise<RoomActionResponse> => hostSuccess),
    joinRoom: vi.fn(async (): Promise<RoomActionResponse> => ({
      ok: true,
      room: createRoom([hostPlayer, guestPlayer]),
      session: {
        playerId: guestPlayer.id,
        reconnectToken: 'b'.repeat(43),
      },
    })),
    reconnectRoom: vi.fn(async (): Promise<RoomActionResponse> => hostSuccess),
    leaveRoom: vi.fn(async (): Promise<LeaveRoomResponse> => ({ ok: true })),
    onRoomState: () => () => undefined,
    onRoomError: () => () => undefined,
    onConnectionStatus: () => () => undefined,
    ...overrides,
  };
}

function createFakeSessionStore(
  stored: StoredLobbySession | null = null,
): LobbySessionStore {
  return {
    save: vi.fn(),
    load: vi.fn(() => stored),
    clear: vi.fn(),
  };
}

describe('Stage 2 lobby routes', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('links the root page to functional host and join flows', () => {
    render(
      <App
        routePath="/"
        client={createFakeClient()}
        sessionStore={createFakeSessionStore()}
      />,
    );

    expect(screen.getByRole('link', { name: /Host a Game/i })).toHaveAttribute(
      'href',
      '/host',
    );
    expect(screen.getByRole('link', { name: /Join a Game/i })).toHaveAttribute(
      'href',
      '/join',
    );
  });

  it('lets a host create a room and shows server-assigned authority', async () => {
    const user = userEvent.setup();
    const client = createFakeClient();

    render(
      <App
        routePath="/host"
        client={client}
        sessionStore={createFakeSessionStore()}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Display name' }),
      'Game Host',
    );
    await user.click(screen.getByRole('button', { name: 'Create Room' }));

    expect(client.createRoom).toHaveBeenCalledWith({
      displayName: 'Game Host',
    });
    expect(
      await screen.findByRole('heading', { name: 'Your room is ready.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Game Host (you)')).toBeInTheDocument();
    expect(screen.getByText('Host')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Round' })).toBeDisabled();
  });

  it('submits a player join form and renders connected players as text', async () => {
    const user = userEvent.setup();
    const client = createFakeClient();
    const { container } = render(
      <App
        routePath="/join"
        client={client}
        sessionStore={createFakeSessionStore()}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Room code' }),
      'abc234',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Display name' }),
      '<Bright Fox>',
    );
    await user.click(screen.getByRole('button', { name: 'Join Room' }));

    expect(client.joinRoom).toHaveBeenCalledWith({
      roomCode: 'abc234',
      displayName: '<Bright Fox>',
    });
    expect(await screen.findByText('<Bright Fox> (you)')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('Game Host')).toBeInTheDocument();
  });

  it('shows understandable structured errors', async () => {
    const user = userEvent.setup();
    const error: RoomError = {
      code: 'ROOM_NOT_FOUND',
      message: 'No active room uses that code.',
    };
    const client = createFakeClient({
      joinRoom: vi.fn(async (): Promise<RoomActionResponse> => ({
        ok: false,
        error,
      })),
    });

    render(
      <App
        routePath="/join"
        client={client}
        sessionStore={createFakeSessionStore()}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Room code' }),
      'ZZZ999',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Display name' }),
      'Silver Owl',
    );
    await user.click(screen.getByRole('button', { name: 'Join Room' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No active room uses that code.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('ROOM_NOT_FOUND');
  });

  it('uses a stored temporary credential to reconnect without another player', async () => {
    const stored: StoredLobbySession = {
      roomCode: 'ABC234',
      playerId: hostPlayer.id,
      reconnectToken: 'c'.repeat(43),
      displayName: 'Game Host',
    };
    const client = createFakeClient();

    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore(stored)}
      />,
    );

    await waitFor(() => {
      expect(client.reconnectRoom).toHaveBeenCalledWith({
        roomCode: 'ABC234',
        reconnectToken: stored.reconnectToken,
      });
    });
    expect(
      await screen.findByRole('heading', { name: 'Your room is ready.' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('renders real-time player state and host indicators', () => {
    const client = createFakeClient();
    const store = createFakeSessionStore({
      roomCode: 'ABC234',
      playerId: guestPlayer.id,
      reconnectToken: 'd'.repeat(43),
      displayName: guestPlayer.displayName,
    });
    client.reconnectRoom = vi.fn(async (): Promise<RoomActionResponse> => ({
      ok: true,
      room: createRoom([hostPlayer, { ...guestPlayer, connected: false }]),
      session: {
        playerId: guestPlayer.id,
        reconnectToken: 'e'.repeat(43),
      },
    }));

    render(
      <App routePath="/room/ABC234" client={client} sessionStore={store} />,
    );

    return waitFor(() => {
      expect(screen.getByText('Host')).toBeInTheDocument();
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });
  });

  it('clears stale browser credentials when a session resumes elsewhere', async () => {
    const stored: StoredLobbySession = {
      roomCode: 'ABC234',
      playerId: hostPlayer.id,
      reconnectToken: 'f'.repeat(43),
      displayName: hostPlayer.displayName,
    };
    const store = createFakeSessionStore(stored);
    let reportRoomError: ((error: RoomError) => void) | undefined;
    const client = createFakeClient({
      onRoomError: (listener) => {
        reportRoomError = listener;
        return () => undefined;
      },
    });

    render(
      <App routePath="/room/ABC234" client={client} sessionStore={store} />,
    );
    expect(
      await screen.findByRole('heading', { name: 'Your room is ready.' }),
    ).toBeInTheDocument();

    act(() => {
      reportRoomError?.({
        code: 'RECONNECT_FAILED',
        message: 'This temporary session resumed elsewhere.',
      });
    });

    expect(
      await screen.findByRole('heading', { name: 'Join the room.' }),
    ).toBeInTheDocument();
    expect(store.clear).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: hostPlayer.id }),
    );
  });

  it('renders a useful not-found page', () => {
    render(
      <App
        routePath="/missing"
        client={createFakeClient()}
        sessionStore={createFakeSessionStore()}
      />,
    );

    expect(
      screen.getByRole('heading', {
        name: 'That word isn’t on this board.',
      }),
    ).toBeInTheDocument();
  });
});
