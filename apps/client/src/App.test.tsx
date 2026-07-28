import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ConnectionStatus,
  ControllerActionResponse,
  DisplayActionResponse,
  LeaveSessionResponse,
  PlayerActionResponse,
  PlayerState,
  RoomError,
  RoomState,
} from '@words/shared';

import { App } from './App';
import type { LobbyClient } from './lobby-client';
import type { LobbySessionStore, StoredLobbySession } from './session-store';

const controllerPlayer: PlayerState = {
  id: '00000000-0000-4000-8000-000000000001',
  displayName: 'Silver Owl',
  connected: true,
  joinedAt: '2026-07-27T20:01:00.000Z',
  isController: true,
};

const ordinaryPlayer: PlayerState = {
  id: '00000000-0000-4000-8000-000000000002',
  displayName: '<Bright Fox>',
  connected: true,
  joinedAt: '2026-07-27T20:02:00.000Z',
  isController: false,
};

const thirdPlayer: PlayerState = {
  id: '00000000-0000-4000-8000-000000000003',
  displayName: 'Copper Lynx',
  connected: true,
  joinedAt: '2026-07-27T20:03:00.000Z',
  isController: false,
};

function createRoom(
  players: PlayerState[] = [],
  controllerStatus: RoomState['controllerStatus'] = players.length
    ? 'assigned'
    : 'none',
): RoomState {
  return {
    code: 'ABC234',
    phase: 'LOBBY',
    createdAt: '2026-07-27T20:00:00.000Z',
    lastActivityAt: '2026-07-27T20:02:00.000Z',
    expiresAt: '2026-07-27T22:02:00.000Z',
    maxPlayers: 8,
    display: {
      connected: true,
      createdAt: '2026-07-27T20:00:00.000Z',
    },
    controllerStatus,
    controllerPlayerId:
      controllerStatus === 'assigned'
        ? (players.find((player) => player.isController)?.id ?? null)
        : null,
    players,
    settings: {
      gridSize: 4,
      roundDurationSeconds: 180,
      scoringMode: 'traditional',
    },
  };
}

const displaySuccess: DisplayActionResponse = {
  ok: true,
  room: createRoom(),
  session: {
    displaySessionId: '00000000-0000-4000-8000-000000000100',
    displayReconnectToken: 'a'.repeat(43),
  },
};

const controllerSuccess: PlayerActionResponse = {
  ok: true,
  room: createRoom([controllerPlayer]),
  session: {
    playerId: controllerPlayer.id,
    playerReconnectToken: 'b'.repeat(43),
  },
};

const ordinarySuccess: PlayerActionResponse = {
  ok: true,
  room: createRoom([controllerPlayer, ordinaryPlayer]),
  session: {
    playerId: ordinaryPlayer.id,
    playerReconnectToken: 'c'.repeat(43),
  },
};

const transferredRoom = createRoom([
  { ...controllerPlayer, isController: false },
  { ...ordinaryPlayer, isController: true },
]);

const controllerWithPlayersSuccess: PlayerActionResponse = {
  ...controllerSuccess,
  room: createRoom([controllerPlayer, ordinaryPlayer]),
};

const awaitingAutomaticRoom = createRoom(
  [{ ...ordinaryPlayer, connected: false, isController: false }],
  'none',
);

function createFakeClient(overrides: Partial<LobbyClient> = {}): LobbyClient {
  return {
    getConnectionStatus: () => 'connected' as ConnectionStatus,
    createDisplay: vi.fn(
      async (): Promise<DisplayActionResponse> => displaySuccess,
    ),
    reconnectDisplay: vi.fn(
      async (): Promise<DisplayActionResponse> => displaySuccess,
    ),
    leaveDisplay: vi.fn(async (): Promise<LeaveSessionResponse> => ({
      ok: true,
    })),
    joinPlayer: vi.fn(
      async (): Promise<PlayerActionResponse> => ordinarySuccess,
    ),
    reconnectPlayer: vi.fn(
      async (): Promise<PlayerActionResponse> => ordinarySuccess,
    ),
    leavePlayer: vi.fn(async (): Promise<LeaveSessionResponse> => ({
      ok: true,
    })),
    transferController: vi.fn(async (): Promise<ControllerActionResponse> => ({
      ok: true,
      room: transferredRoom,
    })),
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

describe('Stage 2.5 display and player lobby routes', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('links the root page to separate display and player flows', () => {
    render(
      <App
        routePath="/"
        client={createFakeClient()}
        sessionStore={createFakeSessionStore()}
      />,
    );

    expect(
      screen.getByRole('link', { name: /Open Shared Display/i }),
    ).toHaveAttribute('href', '/display');
    expect(screen.getByRole('link', { name: /Join a Game/i })).toHaveAttribute(
      'href',
      '/join',
    );
  });

  it('creates a display session without creating or counting a player', async () => {
    const user = userEvent.setup();
    const client = createFakeClient();

    render(
      <App
        routePath="/display"
        client={client}
        sessionStore={createFakeSessionStore()}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Create Room Display' }),
    );

    expect(client.createDisplay).toHaveBeenCalledWith({});
    expect(
      await screen.findByRole('heading', {
        name: 'Shared display is ready.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('0 / 8')).toBeInTheDocument();
    expect(
      screen.getByText(/Waiting for the first player/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\(you\)/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Assign Game Host' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Round' })).toBeDisabled();
  });

  it('shows the first joining phone player as the game host', async () => {
    const user = userEvent.setup();
    const client = createFakeClient({
      joinPlayer: vi.fn(
        async (): Promise<PlayerActionResponse> => controllerSuccess,
      ),
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
      'abc234',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Display name' }),
      'Silver Owl',
    );
    await user.click(screen.getByRole('button', { name: 'Join Room' }));

    expect(client.joinPlayer).toHaveBeenCalledWith({
      roomCode: 'abc234',
      displayName: 'Silver Owl',
    });
    expect(
      await screen.findByRole('heading', {
        name: 'You’re the game host.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Silver Owl (you)')).toBeInTheDocument();
    expect(screen.getAllByText('Game Host').length).toBeGreaterThan(0);
  });

  it('shows later phone players without granting controller authority', async () => {
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
      'ABC234',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Display name' }),
      '<Bright Fox>',
    );
    await user.click(screen.getByRole('button', { name: 'Join Room' }));

    expect(
      await screen.findByRole('heading', { name: 'You’re in the room.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('<Bright Fox> (you)')).toBeInTheDocument();
    expect(screen.getByText('Silver Owl')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Make Game Host' }),
    ).not.toBeInTheDocument();
  });

  it('lets the current game host transfer control to a connected player', async () => {
    const user = userEvent.setup();
    const client = createFakeClient({
      reconnectPlayer: vi.fn(
        async (): Promise<PlayerActionResponse> => controllerWithPlayersSuccess,
      ),
    });

    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore({
          role: 'player',
          roomCode: 'ABC234',
          playerId: controllerPlayer.id,
          playerReconnectToken: 'j'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'You’re the game host.',
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Make Game Host' }));

    expect(client.transferController).toHaveBeenCalledWith({
      targetPlayerId: ordinaryPlayer.id,
    });
    expect(
      await screen.findByText('Game Host control moved to <Bright Fox>.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'You’re in the room.' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Make Game Host' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Round' })).toBeDisabled();
  });

  it('shows transfer errors without changing controller controls', async () => {
    const user = userEvent.setup();
    const error: RoomError = {
      code: 'TARGET_PLAYER_OFFLINE',
      message: 'Choose a connected player to become the game host.',
    };
    const client = createFakeClient({
      reconnectPlayer: vi.fn(
        async (): Promise<PlayerActionResponse> => controllerWithPlayersSuccess,
      ),
      transferController: vi.fn(
        async (): Promise<ControllerActionResponse> => ({
          ok: false,
          error,
        }),
      ),
    });

    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore({
          role: 'player',
          roomCode: 'ABC234',
          playerId: controllerPlayer.id,
          playerReconnectToken: 'k'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Make Game Host' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(error.message);
    expect(screen.getByRole('alert')).toHaveTextContent(error.code);
    expect(
      screen.getByRole('button', { name: 'Make Game Host' }),
    ).toBeInTheDocument();
  });

  it('keeps the display passive while an offline controller is in grace', async () => {
    const room = createRoom([
      { ...controllerPlayer, connected: false },
      ordinaryPlayer,
    ]);
    const client = createFakeClient({
      reconnectDisplay: vi.fn(async (): Promise<DisplayActionResponse> => ({
        ...displaySuccess,
        room,
      })),
    });

    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore({
          role: 'display',
          roomCode: 'ABC234',
          displaySessionId: displaySuccess.session.displaySessionId,
          displayReconnectToken: 'l'.repeat(43),
        })}
      />,
    );

    expect(await screen.findAllByText('Game Host offline')).toHaveLength(2);
    expect(
      screen.getByText(/If grace expires, the server will select/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Make Game Host' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Assign Game Host' }),
    ).not.toBeInTheDocument();
  });

  it('shows automatic succession waiting without display controls', async () => {
    const client = createFakeClient({
      reconnectDisplay: vi.fn(async (): Promise<DisplayActionResponse> => ({
        ...displaySuccess,
        room: awaitingAutomaticRoom,
      })),
    });

    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore({
          role: 'display',
          roomCode: 'ABC234',
          displaySessionId: displaySuccess.session.displaySessionId,
          displayReconnectToken: 'm'.repeat(43),
        })}
      />,
    );

    expect(
      await screen.findByText('Selecting automatically'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/next player to join or reconnect/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Assign Game Host' }),
    ).not.toBeInTheDocument();
  });

  it('gives a newly auto-promoted player controller controls immediately', async () => {
    let reportRoomState: ((room: RoomState) => void) | undefined;
    const waitingRoom = createRoom([
      { ...controllerPlayer, connected: false },
      ordinaryPlayer,
      thirdPlayer,
    ]);
    const promotedRoom = createRoom([
      { ...ordinaryPlayer, isController: true },
      thirdPlayer,
    ]);
    const client = createFakeClient({
      reconnectPlayer: vi.fn(async (): Promise<PlayerActionResponse> => ({
        ...ordinarySuccess,
        room: waitingRoom,
      })),
      onRoomState: (listener) => {
        reportRoomState = listener;
        return () => undefined;
      },
    });

    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore({
          role: 'player',
          roomCode: 'ABC234',
          playerId: ordinaryPlayer.id,
          playerReconnectToken: 'n'.repeat(43),
          displayName: ordinaryPlayer.displayName,
        })}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: 'You’re in the room.' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Make Game Host' }),
    ).not.toBeInTheDocument();

    act(() => {
      reportRoomState?.(promotedRoom);
    });

    expect(
      await screen.findByRole('heading', {
        name: 'You’re the game host.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Make Game Host' }),
    ).toBeInTheDocument();
  });

  it('shows understandable structured errors', async () => {
    const user = userEvent.setup();
    const error: RoomError = {
      code: 'ROOM_NOT_FOUND',
      message: 'No active room uses that code.',
    };
    const client = createFakeClient({
      joinPlayer: vi.fn(async (): Promise<PlayerActionResponse> => ({
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

  it('uses a stored display credential to reconnect the display role', async () => {
    const stored: StoredLobbySession = {
      role: 'display',
      roomCode: 'ABC234',
      displaySessionId: displaySuccess.session.displaySessionId,
      displayReconnectToken: 'd'.repeat(43),
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
      expect(client.reconnectDisplay).toHaveBeenCalledWith({
        roomCode: 'ABC234',
        displayReconnectToken: stored.displayReconnectToken,
      });
    });
    expect(
      await screen.findByRole('heading', {
        name: 'Shared display is ready.',
      }),
    ).toBeInTheDocument();
    expect(client.reconnectPlayer).not.toHaveBeenCalled();
  });

  it('uses a stored player credential to reconnect the player role', async () => {
    const stored: StoredLobbySession = {
      role: 'player',
      roomCode: 'ABC234',
      playerId: ordinaryPlayer.id,
      playerReconnectToken: 'e'.repeat(43),
      displayName: ordinaryPlayer.displayName,
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
      expect(client.reconnectPlayer).toHaveBeenCalledWith({
        roomCode: 'ABC234',
        playerReconnectToken: stored.playerReconnectToken,
      });
    });
    expect(
      await screen.findByRole('heading', { name: 'You’re in the room.' }),
    ).toBeInTheDocument();
    expect(client.reconnectDisplay).not.toHaveBeenCalled();
  });

  it('renders live player updates on the shared display', async () => {
    let reportRoomState: ((room: RoomState) => void) | undefined;
    const client = createFakeClient({
      onRoomState: (listener) => {
        reportRoomState = listener;
        return () => undefined;
      },
    });

    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore({
          role: 'display',
          roomCode: 'ABC234',
          displaySessionId: displaySuccess.session.displaySessionId,
          displayReconnectToken: 'f'.repeat(43),
        })}
      />,
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Shared display is ready.',
      }),
    ).toBeInTheDocument();

    act(() => {
      reportRoomState?.(createRoom([controllerPlayer, ordinaryPlayer]));
    });

    expect(await screen.findByText('Silver Owl')).toBeInTheDocument();
    expect(screen.getByText('<Bright Fox>')).toBeInTheDocument();
    expect(screen.getByText('2 / 8')).toBeInTheDocument();
  });

  it('shows display and controller disconnect state without closing the lobby', async () => {
    const offlineController = {
      ...controllerPlayer,
      connected: false,
    };
    const room = createRoom([offlineController, ordinaryPlayer]);
    room.display.connected = false;
    const client = createFakeClient({
      reconnectPlayer: vi.fn(async (): Promise<PlayerActionResponse> => ({
        ...ordinarySuccess,
        room,
      })),
    });

    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore({
          role: 'player',
          roomCode: 'ABC234',
          playerId: ordinaryPlayer.id,
          playerReconnectToken: 'g'.repeat(43),
          displayName: ordinaryPlayer.displayName,
        })}
      />,
    );

    expect(await screen.findByText('Display offline')).toBeInTheDocument();
    expect(screen.getAllByText('Game Host offline')).toHaveLength(2);
    expect(
      screen.getByRole('heading', { name: 'You’re in the room.' }),
    ).toBeInTheDocument();
  });

  it('clears stale browser credentials when a session resumes elsewhere', async () => {
    const stored: StoredLobbySession = {
      role: 'display',
      roomCode: 'ABC234',
      displaySessionId: displaySuccess.session.displaySessionId,
      displayReconnectToken: 'h'.repeat(43),
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
      await screen.findByRole('heading', {
        name: 'Shared display is ready.',
      }),
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
      expect.objectContaining({ role: 'display' }),
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
