import { StrictMode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ConnectionStatus,
  ControllerActionResponse,
  DisplayActionResponse,
  LeaveSessionResponse,
  PlayerActionResponse,
  PlayerActionSuccess,
  PlayerState,
  RoomError,
  RoomState,
  SubmitWordResponse,
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

const otherRoomController: PlayerState = {
  id: '00000000-0000-4000-8000-000000000010',
  displayName: 'Violet Heron',
  connected: true,
  joinedAt: '2026-07-27T20:04:00.000Z',
  isController: true,
};

function deferred<T>() {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function createRoom(
  players: PlayerState[] = [],
  controllerStatus: RoomState['controllerStatus'] = players.length
    ? 'assigned'
    : 'none',
): RoomState {
  return {
    code: 'ABC234',
    phase: 'LOBBY',
    stateVersion: 1,
    serverTime: '2026-07-27T20:02:00.000Z',
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
    round: null,
  };
}

function createRoundRoom(
  players: PlayerState[] = [controllerPlayer, ordinaryPlayer],
  participants: PlayerState[] = players,
): RoomState {
  return {
    ...createRoom(players),
    phase: 'ROUND_ACTIVE',
    stateVersion: 3,
    serverTime: '2026-07-27T20:03:00.000Z',
    settings: {
      gridSize: 4,
      roundDurationSeconds: 30,
      scoringMode: 'traditional',
    },
    round: {
      id: '00000000-0000-4000-8000-000000000200',
      number: 1,
      settings: {
        gridSize: 4,
        roundDurationSeconds: 30,
        scoringMode: 'traditional',
      },
      board: {
        size: 4,
        tiles: [
          'QU',
          'A',
          'B',
          'C',
          'D',
          'E',
          'F',
          'G',
          'H',
          'I',
          'J',
          'K',
          'L',
          'M',
          'N',
          'O',
        ],
      },
      participants: participants.map((player) => ({
        playerId: player.id,
        displayName: player.displayName,
      })),
      startedAt: '2026-07-27T20:03:00.000Z',
      deadlineAt: '2026-07-27T20:03:30.000Z',
      endedAt: null,
      results: null,
      generationAttempts: 1,
    },
  };
}

function createEndedRoom(
  activeRoom: RoomState = createRoundRoom(),
  stateVersion = activeRoom.stateVersion + 1,
): RoomState {
  if (!activeRoom.round) {
    throw new Error('Ended-room fixture requires a round.');
  }
  return {
    ...activeRoom,
    phase: 'ROUND_ENDED',
    stateVersion,
    serverTime: activeRoom.round.deadlineAt,
    round: {
      ...activeRoom.round,
      endedAt: activeRoom.round.deadlineAt,
      results: {
        players: activeRoom.round.participants.map((participant, index) => ({
          ...participant,
          rank: index === 0 ? 1 : 2,
          baseScore: index === 0 ? 1 : 0,
          uniqueBonusScore: index === 0 ? 0.25 : 0,
          finalScore: index === 0 ? 1.25 : 0,
          words:
            index === 0
              ? [
                  {
                    word: 'CAT',
                    basePoints: 1,
                    shared: false,
                    uniqueBonusPoints: 0.25,
                    finalPoints: 1.25,
                  },
                ]
              : [],
        })),
        winnerPlayerIds: [activeRoom.round.participants[0]?.playerId].filter(
          (playerId): playerId is string => playerId !== undefined,
        ),
      },
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

const controllerSuccess: PlayerActionSuccess = {
  ok: true,
  room: createRoom([controllerPlayer]),
  session: {
    playerId: controllerPlayer.id,
    playerReconnectToken: 'b'.repeat(43),
  },
  submissionState: null,
};

const ordinarySuccess: PlayerActionSuccess = {
  ok: true,
  room: createRoom([controllerPlayer, ordinaryPlayer]),
  session: {
    playerId: ordinaryPlayer.id,
    playerReconnectToken: 'c'.repeat(43),
  },
  submissionState: null,
};

const transferredRoom = createRoom([
  { ...controllerPlayer, isController: false },
  { ...ordinaryPlayer, isController: true },
]);

const controllerWithPlayersSuccess: PlayerActionSuccess = {
  ...controllerSuccess,
  room: createRoom([controllerPlayer, ordinaryPlayer]),
};

const awaitingAutomaticRoom = createRoom(
  [{ ...ordinaryPlayer, connected: false, isController: false }],
  'none',
);

const otherRoomSuccess: PlayerActionSuccess = {
  ok: true,
  room: {
    ...createRoom([otherRoomController]),
    code: 'DEF567',
  },
  session: {
    playerId: otherRoomController.id,
    playerReconnectToken: 'z'.repeat(43),
  },
  submissionState: null,
};

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
    updateSettings: vi.fn(async (): Promise<ControllerActionResponse> => ({
      ok: true,
      room: createRoom([controllerPlayer]),
    })),
    startRound: vi.fn(async (): Promise<ControllerActionResponse> => ({
      ok: true,
      room: createRoom([controllerPlayer]),
    })),
    submitWord: vi.fn(async (): Promise<SubmitWordResponse> => ({
      ok: false,
      error: {
        code: 'WORD_NOT_IN_DICTIONARY',
        message: 'That word is not in this game dictionary.',
      },
      state: null,
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
    loadDisplay: vi.fn(() => (stored?.role === 'display' ? stored : null)),
    clear: vi.fn(),
  };
}

function createStatefulSessionStore(
  initialSession: StoredLobbySession | null = null,
): LobbySessionStore {
  let storedSession = initialSession;

  return {
    save: (session) => {
      storedSession = session;
    },
    load: (roomCode) =>
      storedSession?.roomCode === roomCode ? storedSession : null,
    loadDisplay: () =>
      storedSession?.role === 'display' ? storedSession : null,
    clear: (session) => {
      if (!session || session === storedSession) {
        storedSession = null;
      }
    },
  };
}

describe('Stage 4B display and player room routes', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('automatically creates one passive display room at the root', async () => {
    const client = createFakeClient();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(
      <App
        routePath="/"
        client={client}
        sessionStore={createFakeSessionStore()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Preparing your room…' }),
    ).toBeInTheDocument();
    expect(client.createDisplay).toHaveBeenCalledWith({});
    expect(
      await screen.findByRole('heading', {
        name: 'Shared display is ready.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create Room Display' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Open Shared Display/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave room' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start Round' })).toBeDisabled();
    expect(
      screen.getByRole('link', {
        name: 'http://localhost:3000/join/ABC234',
      }),
    ).toHaveAttribute('href', 'http://localhost:3000/join/ABC234');
    const qrRegion = screen.getByRole('region', { name: 'Scan to join' });
    expect(qrRegion).toHaveClass('join-qr--prominent');
    const qrSvg = qrRegion.querySelector('svg');
    expect(qrSvg).toHaveAttribute('aria-hidden', 'true');
    expect(qrSvg).toHaveAttribute('focusable', 'false');
    expect(qrSvg).toHaveAttribute('viewBox');
    expect(qrSvg?.querySelector('image')).toBeNull();
    expect(qrSvg?.querySelector('path[fill="#FFFFFF"]')).not.toBeNull();
    expect(qrSvg?.querySelector('path[fill="#000000"]')).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(
      screen
        .getAllByRole('button', { name: /×|minute|seconds/i })
        .every((button) => button.hasAttribute('disabled')),
    ).toBe(true);
  });

  it('does not create duplicate rooms when StrictMode repeats effects', async () => {
    const client = createFakeClient();

    render(
      <StrictMode>
        <App
          routePath="/"
          client={client}
          sessionStore={createFakeSessionStore()}
        />
      </StrictMode>,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Shared display is ready.',
      }),
    ).toBeInTheDocument();
    expect(client.createDisplay).toHaveBeenCalledTimes(1);
  });

  it('keeps two root display profiles attached to distinct rooms after refresh', async () => {
    const firstStore = createStatefulSessionStore();
    const secondStore = createStatefulSessionStore();
    const secondSuccess: DisplayActionResponse = {
      ok: true,
      room: { ...createRoom(), code: 'XYZ789' },
      session: {
        displaySessionId: '00000000-0000-4000-8000-000000000200',
        displayReconnectToken: 'z'.repeat(43),
      },
    };
    const firstClient = createFakeClient();
    const secondClient = createFakeClient({
      createDisplay: vi.fn(async () => secondSuccess),
      reconnectDisplay: vi.fn(async () => secondSuccess),
    });

    const firstView = render(
      <App routePath="/" client={firstClient} sessionStore={firstStore} />,
    );
    expect(
      await screen.findByLabelText('Room code ABC234'),
    ).toBeInTheDocument();
    firstView.unmount();

    const secondView = render(
      <App routePath="/" client={secondClient} sessionStore={secondStore} />,
    );
    expect(
      await screen.findByLabelText('Room code XYZ789'),
    ).toBeInTheDocument();
    secondView.unmount();

    const refreshedFirst = render(
      <App routePath="/" client={firstClient} sessionStore={firstStore} />,
    );
    expect(
      await screen.findByLabelText('Room code ABC234'),
    ).toBeInTheDocument();
    expect(firstClient.reconnectDisplay).toHaveBeenCalledWith({
      roomCode: 'ABC234',
      displayReconnectToken: displaySuccess.session.displayReconnectToken,
    });
    expect(firstClient.createDisplay).toHaveBeenCalledTimes(1);
    refreshedFirst.unmount();

    render(
      <App routePath="/" client={secondClient} sessionStore={secondStore} />,
    );
    expect(
      await screen.findByLabelText('Room code XYZ789'),
    ).toBeInTheDocument();
    expect(secondClient.reconnectDisplay).toHaveBeenCalledWith({
      roomCode: 'XYZ789',
      displayReconnectToken: secondSuccess.session.displayReconnectToken,
    });
    expect(secondClient.createDisplay).toHaveBeenCalledTimes(1);
  });

  it('creates a display session without creating or counting a player', async () => {
    const client = createFakeClient();

    render(
      <App
        routePath="/"
        client={client}
        sessionStore={createFakeSessionStore()}
      />,
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
    expect(screen.queryByText('Scoring mode')).not.toBeInTheDocument();
    expect(screen.queryByText(/traditional scoring/i)).not.toBeInTheDocument();
  });

  it.each(['/display', '/host'])(
    'keeps %s as a compatibility alias for the automatic root display',
    async (routePath) => {
      const client = createFakeClient();

      render(
        <App
          routePath={routePath}
          client={client}
          sessionStore={createFakeSessionStore()}
        />,
      );

      expect(
        await screen.findByRole('heading', {
          name: 'Shared display is ready.',
        }),
      ).toBeInTheDocument();
      expect(client.createDisplay).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByRole('button', { name: 'Create Room Display' }),
      ).not.toBeInTheDocument();
    },
  );

  it('prefills and locks a direct player join route', async () => {
    const user = userEvent.setup();
    const client = createFakeClient({
      joinPlayer: vi.fn(
        async (): Promise<PlayerActionResponse> => controllerSuccess,
      ),
    });

    render(
      <App
        routePath="/join/abc-234"
        client={client}
        sessionStore={createFakeSessionStore()}
      />,
    );

    const roomCodeInput = screen.getByRole('textbox', { name: 'Room code' });
    expect(roomCodeInput).toHaveValue('ABC234');
    expect(roomCodeInput).toHaveAttribute('readonly');
    expect(
      screen.queryByRole('region', {
        name: /scan to join|join the next round/i,
      }),
    ).toBeNull();

    await user.type(
      screen.getByRole('textbox', { name: 'Display name' }),
      'Silver Owl',
    );
    await user.click(screen.getByRole('button', { name: 'Join Room' }));

    expect(client.joinPlayer).toHaveBeenCalledWith({
      roomCode: 'ABC234',
      displayName: 'Silver Owl',
    });
    expect(client.createDisplay).not.toHaveBeenCalled();
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
      roomCode: 'ABC234',
      displayName: 'Silver Owl',
    });
    expect(
      await screen.findByRole('heading', {
        name: 'You’re the game host.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Silver Owl (you)')).toBeInTheDocument();
    expect(screen.getAllByText('Game Host').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('region', {
        name: /scan to join|join the next round/i,
      }),
    ).toBeNull();
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
    expect(
      screen.queryByRole('region', {
        name: /scan to join|join the next round/i,
      }),
    ).toBeNull();
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
        routePath="/"
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

  it('keeps the display QR unchanged when controller authority moves', async () => {
    let reportRoomState: ((room: RoomState) => void) | undefined;
    const initialRoom = createRoom([controllerPlayer, ordinaryPlayer]);
    const client = createFakeClient({
      createDisplay: vi.fn(async (): Promise<DisplayActionResponse> => ({
        ...displaySuccess,
        room: initialRoom,
      })),
      onRoomState: (listener) => {
        reportRoomState = listener;
        return () => undefined;
      },
    });

    render(
      <App
        routePath="/"
        client={client}
        sessionStore={createFakeSessionStore()}
      />,
    );

    const qrRegion = await screen.findByRole('region', {
      name: 'Scan to join',
    });
    const initialSvg = qrRegion.querySelector('svg')?.outerHTML;
    const initialLink = screen.getByRole('link', {
      name: 'http://localhost:3000/join/ABC234',
    });

    act(() => {
      reportRoomState?.({
        ...transferredRoom,
        stateVersion: 2,
        serverTime: '2026-07-27T20:02:01.000Z',
      });
    });

    expect(await screen.findByText('<Bright Fox>')).toBeInTheDocument();
    expect(initialLink).toHaveAttribute(
      'href',
      'http://localhost:3000/join/ABC234',
    );
    expect(
      screen.getByRole('region', { name: 'Scan to join' }).querySelector('svg')
        ?.outerHTML,
    ).toBe(initialSvg);
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
        routePath="/"
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
        routePath="/"
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
    expect(
      screen.getByRole('region', { name: 'Scan to join' }),
    ).toBeInTheDocument();
    expect(client.reconnectPlayer).not.toHaveBeenCalled();
    expect(client.createDisplay).not.toHaveBeenCalled();
  });

  it('clears an invalid root display credential and creates one replacement room', async () => {
    const stored: StoredLobbySession = {
      role: 'display',
      roomCode: 'OLD234',
      displaySessionId: displaySuccess.session.displaySessionId,
      displayReconnectToken: 'q'.repeat(43),
    };
    const store = createFakeSessionStore(stored);
    const client = createFakeClient({
      reconnectDisplay: vi.fn(async (): Promise<DisplayActionResponse> => ({
        ok: false,
        error: {
          code: 'RECONNECT_FAILED',
          message: 'The display credential is no longer valid.',
        },
      })),
    });

    render(<App routePath="/" client={client} sessionStore={store} />);

    expect(
      await screen.findByRole('heading', {
        name: 'Shared display is ready.',
      }),
    ).toBeInTheDocument();
    expect(client.reconnectDisplay).toHaveBeenCalledTimes(1);
    expect(store.clear).toHaveBeenCalledWith(stored);
    expect(client.createDisplay).toHaveBeenCalledTimes(1);
  });

  it('shows a retry only for a genuine display startup failure', async () => {
    const user = userEvent.setup();
    const failure: DisplayActionResponse = {
      ok: false,
      error: {
        code: 'SERVER_BUSY',
        message: 'The lobby server is at capacity.',
      },
    };
    const createDisplay = vi
      .fn<() => Promise<DisplayActionResponse>>()
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(displaySuccess);
    const client = createFakeClient({ createDisplay });

    render(
      <App
        routePath="/"
        client={client}
        sessionStore={createFakeSessionStore()}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The lobby server is at capacity.',
    );
    expect(createDisplay).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: 'Retry display connection' }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Shared display is ready.',
      }),
    ).toBeInTheDocument();
    expect(createDisplay).toHaveBeenCalledTimes(2);
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
    expect(
      screen.queryByRole('region', {
        name: /scan to join|join the next round/i,
      }),
    ).toBeNull();
    expect(client.reconnectDisplay).not.toHaveBeenCalled();
  });

  it('releases a stale reconnect before restoring the newer route session', async () => {
    const firstReconnect = deferred<PlayerActionResponse>();
    const firstStored: StoredLobbySession = {
      role: 'player',
      roomCode: 'ABC234',
      playerId: controllerPlayer.id,
      playerReconnectToken: 's'.repeat(43),
      displayName: controllerPlayer.displayName,
    };
    const secondStored: StoredLobbySession = {
      role: 'player',
      roomCode: 'DEF567',
      playerId: otherRoomController.id,
      playerReconnectToken: 't'.repeat(43),
      displayName: otherRoomController.displayName,
    };
    const sessionStore: LobbySessionStore = {
      save: vi.fn(),
      load: vi.fn((roomCode) =>
        roomCode === firstStored.roomCode ? firstStored : secondStored,
      ),
      loadDisplay: vi.fn(() => null),
      clear: vi.fn(),
    };
    const reconnectPlayer = vi
      .fn<() => Promise<PlayerActionResponse>>()
      .mockImplementationOnce(() => firstReconnect.promise)
      .mockResolvedValueOnce(otherRoomSuccess);
    const client = createFakeClient({ reconnectPlayer });
    window.history.replaceState({}, '', '/room/ABC234');

    render(<App client={client} sessionStore={sessionStore} />);
    await waitFor(() => expect(reconnectPlayer).toHaveBeenCalledTimes(1));

    act(() => {
      window.history.pushState({}, '', '/room/DEF567');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() =>
      expect(sessionStore.load).toHaveBeenCalledWith('DEF567'),
    );
    await act(async () => {
      firstReconnect.resolve(controllerWithPlayersSuccess);
      await Promise.resolve();
    });

    await waitFor(() => expect(reconnectPlayer).toHaveBeenCalledTimes(2));
    expect(client.leavePlayer).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('DEF567')).toBeInTheDocument();
    expect(screen.getByText('Violet Heron (you)')).toBeInTheDocument();
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
        routePath="/"
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

  it('clears stale browser credentials without automatically replacing a live display elsewhere', async () => {
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

    render(<App routePath="/" client={client} sessionStore={store} />);
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
      await screen.findByRole('heading', {
        name: 'We couldn’t prepare the room.',
      }),
    ).toBeInTheDocument();
    expect(store.clear).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'display' }),
    );
    expect(client.createDisplay).not.toHaveBeenCalled();
  });

  it('lets the connected controller save a complete authoritative settings object', async () => {
    const updatedRoom = {
      ...createRoom([controllerPlayer, ordinaryPlayer]),
      stateVersion: 2,
      settings: {
        gridSize: 5 as const,
        roundDurationSeconds: 180 as const,
        scoringMode: 'traditional' as const,
      },
    };
    const client = createFakeClient({
      reconnectPlayer: vi.fn(
        async (): Promise<PlayerActionResponse> => controllerWithPlayersSuccess,
      ),
      updateSettings: vi.fn(async (): Promise<ControllerActionResponse> => ({
        ok: true,
        room: updatedRoom,
      })),
    });

    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore({
          role: 'player',
          roomCode: 'ABC234',
          playerId: controllerPlayer.id,
          playerReconnectToken: 'i'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );

    const fiveByFive = await screen.findByRole('button', { name: '5 × 5' });
    expect(fiveByFive).toBeEnabled();
    await userEvent.click(fiveByFive);

    expect(client.updateSettings).toHaveBeenCalledWith({
      gridSize: 5,
      roundDurationSeconds: 180,
      scoringMode: 'traditional',
    });
    await waitFor(() =>
      expect(fiveByFive).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('retains authoritative values after a failed settings acknowledgement', async () => {
    const client = createFakeClient({
      reconnectPlayer: vi.fn(
        async (): Promise<PlayerActionResponse> => controllerWithPlayersSuccess,
      ),
      updateSettings: vi.fn(async (): Promise<ControllerActionResponse> => ({
        ok: false,
        error: {
          code: 'ROUND_IN_PROGRESS',
          message: 'A round is already in progress.',
        },
      })),
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

    await userEvent.click(await screen.findByRole('button', { name: '5 × 5' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A round is already in progress.',
    );
    expect(screen.getByRole('button', { name: '4 × 4' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('does not let a stale acknowledgement replace a newer broadcast', async () => {
    let reportRoomState: ((room: RoomState) => void) | undefined;
    let resolveUpdate:
      ((response: ControllerActionResponse) => void) | undefined;
    const staleRoom = {
      ...createRoom([controllerPlayer, ordinaryPlayer]),
      stateVersion: 2,
      settings: {
        gridSize: 5 as const,
        roundDurationSeconds: 180 as const,
        scoringMode: 'traditional' as const,
      },
    };
    const newerRoom = {
      ...createRoom([controllerPlayer, ordinaryPlayer]),
      stateVersion: 3,
      settings: {
        gridSize: 6 as const,
        roundDurationSeconds: 180 as const,
        scoringMode: 'traditional' as const,
      },
    };
    const client = createFakeClient({
      reconnectPlayer: vi.fn(
        async (): Promise<PlayerActionResponse> => controllerWithPlayersSuccess,
      ),
      updateSettings: vi.fn(
        () =>
          new Promise<ControllerActionResponse>((resolve) => {
            resolveUpdate = resolve;
          }),
      ),
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
          playerId: controllerPlayer.id,
          playerReconnectToken: 'k'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: '5 × 5' }));
    act(() => reportRoomState?.(newerRoom));
    await act(async () => {
      resolveUpdate?.({ ok: true, room: staleRoom });
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: '6 × 6' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it.each([
    {
      label: 'controller transfer',
      buttonName: 'Make Game Host',
      method: 'transferController',
      oldRoom: transferredRoom,
    },
    {
      label: 'settings update',
      buttonName: '5 × 5',
      method: 'updateSettings',
      oldRoom: {
        ...createRoom([controllerPlayer, ordinaryPlayer]),
        stateVersion: 2,
        settings: {
          gridSize: 5 as const,
          roundDurationSeconds: 180 as const,
          scoringMode: 'traditional' as const,
        },
      },
    },
    {
      label: 'round start',
      buttonName: 'Start Round',
      method: 'startRound',
      oldRoom: createRoundRoom(),
    },
  ] as const)(
    'ignores a delayed $label acknowledgement after joining another room',
    async ({ buttonName, method, oldRoom }) => {
      const user = userEvent.setup();
      const pendingAction = deferred<ControllerActionResponse>();
      const action = vi.fn(() => pendingAction.promise);
      const client = createFakeClient({
        reconnectPlayer: vi.fn(
          async (): Promise<PlayerActionResponse> =>
            controllerWithPlayersSuccess,
        ),
        joinPlayer: vi.fn(
          async (): Promise<PlayerActionResponse> => otherRoomSuccess,
        ),
        [method]: action,
      } as Partial<LobbyClient>);

      render(
        <App
          routePath="/room/ABC234"
          client={client}
          sessionStore={createStatefulSessionStore({
            role: 'player',
            roomCode: 'ABC234',
            playerId: controllerPlayer.id,
            playerReconnectToken: 'q'.repeat(43),
            displayName: controllerPlayer.displayName,
          })}
        />,
      );

      await user.click(await screen.findByRole('button', { name: buttonName }));
      await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      await user.click(screen.getByRole('button', { name: 'Leave room' }));
      await user.type(
        await screen.findByRole('textbox', { name: 'Room code' }),
        'DEF567',
      );
      await user.type(
        screen.getByRole('textbox', { name: 'Display name' }),
        otherRoomController.displayName,
      );
      await user.click(screen.getByRole('button', { name: 'Join Room' }));
      expect(await screen.findByText('DEF567')).toBeInTheDocument();
      expect(screen.getByText('Violet Heron (you)')).toBeInTheDocument();

      await act(async () => {
        pendingAction.resolve({ ok: true, room: oldRoom });
        await Promise.resolve();
      });

      expect(screen.getByText('DEF567')).toBeInTheDocument();
      expect(screen.getByText('Violet Heron (you)')).toBeInTheDocument();
    },
  );

  it('rejects an equal-version snapshot with an older server timestamp', async () => {
    let reportRoomState: ((room: RoomState) => void) | undefined;
    const newerRoom: RoomState = {
      ...createRoom([controllerPlayer, ordinaryPlayer]),
      stateVersion: 2,
      serverTime: '2026-07-27T20:02:05.000Z',
      settings: {
        gridSize: 6,
        roundDurationSeconds: 180,
        scoringMode: 'traditional',
      },
    };
    const olderRoom: RoomState = {
      ...newerRoom,
      serverTime: '2026-07-27T20:02:04.000Z',
      settings: {
        ...newerRoom.settings,
        gridSize: 5,
      },
    };
    const client = createFakeClient({
      reconnectPlayer: vi.fn(
        async (): Promise<PlayerActionResponse> => controllerWithPlayersSuccess,
      ),
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
          playerId: controllerPlayer.id,
          playerReconnectToken: 'r'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );
    await screen.findByRole('button', { name: '4 × 4' });

    act(() => reportRoomState?.(newerRoom));
    act(() => reportRoomState?.(olderRoom));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '6 × 6' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
  });

  it('rejects conflicting results at the same state version', async () => {
    let reportRoomState: ((room: RoomState) => void) | undefined;
    const endedRoom = createEndedRoom();
    const client = createFakeClient({
      reconnectPlayer: vi.fn(async (): Promise<PlayerActionResponse> => ({
        ...controllerSuccess,
        room: endedRoom,
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
          playerId: controllerPlayer.id,
          playerReconnectToken: 'r'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );
    expect(
      await screen.findByRole('heading', { name: 'Silver Owl wins' }),
    ).toBeVisible();

    act(() =>
      reportRoomState?.({
        ...endedRoom,
        serverTime: '2026-07-27T20:04:00.000Z',
        round: endedRoom.round
          ? {
              ...endedRoom.round,
              results: endedRoom.round.results
                ? {
                    ...endedRoom.round.results,
                    winnerPlayerIds: [],
                  }
                : null,
            }
          : null,
      }),
    );

    expect(
      screen.getByRole('heading', { name: 'Silver Owl wins' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', {
        name: 'No scoring winner this round',
      }),
    ).toBeNull();
  });

  it('does not let an old active snapshot replace finalized results', async () => {
    let reportRoomState: ((room: RoomState) => void) | undefined;
    const activeRoom = createRoundRoom();
    const client = createFakeClient({
      reconnectPlayer: vi.fn(async (): Promise<PlayerActionResponse> => ({
        ...controllerSuccess,
        room: activeRoom,
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
          playerId: controllerPlayer.id,
          playerReconnectToken: 'r'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );
    await screen.findByText('Round active');
    act(() => reportRoomState?.(createEndedRoom(activeRoom)));
    expect(
      await screen.findByRole('heading', { name: 'Silver Owl wins' }),
    ).toBeVisible();

    act(() =>
      reportRoomState?.({
        ...activeRoom,
        serverTime: '2026-07-27T20:04:00.000Z',
      }),
    );
    expect(
      screen.getByRole('heading', { name: 'Silver Owl wins' }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Submit Word' })).toBeNull();
  });

  it('does not let old results replace a newer active round', async () => {
    let reportRoomState: ((room: RoomState) => void) | undefined;
    const firstRound = createRoundRoom();
    const endedRoom = createEndedRoom(firstRound);
    const secondRound: RoomState = {
      ...createRoundRoom(),
      stateVersion: endedRoom.stateVersion + 1,
      serverTime: '2026-07-27T20:04:00.000Z',
      round: {
        ...createRoundRoom().round!,
        id: '00000000-0000-4000-8000-000000000201',
        number: 2,
        startedAt: '2026-07-27T20:04:00.000Z',
        deadlineAt: '2026-07-27T20:04:30.000Z',
      },
    };
    const client = createFakeClient({
      reconnectPlayer: vi.fn(async (): Promise<PlayerActionResponse> => ({
        ...controllerSuccess,
        room: endedRoom,
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
          playerId: controllerPlayer.id,
          playerReconnectToken: 's'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );
    expect(
      await screen.findByRole('heading', { name: 'Silver Owl wins' }),
    ).toBeVisible();
    act(() => reportRoomState?.(secondRound));
    expect(await screen.findByText('Round active')).toBeVisible();
    expect(screen.queryByText('Final round results')).toBeNull();

    act(() => reportRoomState?.(endedRoom));
    expect(screen.getByText('Round active')).toBeVisible();
    expect(screen.queryByText('Final round results')).toBeNull();
  });

  it('starts an authoritative round and renders the exact server board', async () => {
    const activeRoom = createRoundRoom();
    const client = createFakeClient({
      reconnectPlayer: vi.fn(
        async (): Promise<PlayerActionResponse> => controllerWithPlayersSuccess,
      ),
      startRound: vi.fn(async (): Promise<ControllerActionResponse> => ({
        ok: true,
        room: activeRoom,
      })),
    });

    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore({
          role: 'player',
          roomCode: 'ABC234',
          playerId: controllerPlayer.id,
          playerReconnectToken: 'l'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Start Round' }),
    );

    expect(client.startRound).toHaveBeenCalledWith();
    expect(await screen.findByText('Official board')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'QU, tile 1' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('30 seconds')).toHaveLength(2);
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'off');
    expect(screen.queryByRole('textbox', { name: /word/i })).toBeNull();
  });

  it('lets a current participant build and privately submit an adjacent tile path', async () => {
    const activeRoom = createRoundRoom();
    const privateState = {
      roundId: activeRoom.round?.id ?? '',
      playerId: controllerPlayer.id,
      submissionVersion: 0,
      acceptedWords: [],
      provisionalScore: 0,
    };
    const submitWord = vi.fn(async (): Promise<SubmitWordResponse> => ({
      ok: true,
      acceptedWord: {
        sequence: 1,
        word: 'QUAB',
        points: 1,
        acceptedAt: '2026-07-27T20:03:01.000Z',
      },
      state: {
        ...privateState,
        submissionVersion: 1,
        acceptedWords: [
          {
            sequence: 1,
            word: 'QUAB',
            points: 1,
            acceptedAt: '2026-07-27T20:03:01.000Z',
          },
        ],
        provisionalScore: 1,
      },
    }));
    const client = createFakeClient({
      reconnectPlayer: vi.fn(async (): Promise<PlayerActionResponse> => ({
        ok: true,
        room: activeRoom,
        session: controllerSuccess.session,
        submissionState: privateState,
      })),
      submitWord,
    });
    const user = userEvent.setup();

    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore({
          role: 'player',
          roomCode: 'ABC234',
          playerId: controllerPlayer.id,
          playerReconnectToken: 'b'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'QU, tile 1' }));
    await user.click(screen.getByRole('button', { name: 'A, tile 2' }));
    await user.click(screen.getByRole('button', { name: 'B, tile 3' }));
    expect(screen.getByRole('heading', { name: 'QUAB' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit Word' }));

    expect(submitWord).toHaveBeenCalledWith({
      roundId: activeRoom.round?.id,
      word: 'QUAB',
      path: [0, 1, 2],
    });
    expect(await screen.findByText('QUAB accepted for 1 point.')).toBeVisible();
    expect(screen.getByText('Provisional points: 1')).toBeVisible();
    expect(
      screen.getByText('Final scoring appears when the round ends.'),
    ).toBeVisible();
  });

  it('restores submission controls and retains the path after an unexpected client rejection', async () => {
    const activeRoom = createRoundRoom();
    const client = createFakeClient({
      reconnectPlayer: vi.fn(async (): Promise<PlayerActionResponse> => ({
        ok: true,
        room: activeRoom,
        session: controllerSuccess.session,
        submissionState: {
          roundId: activeRoom.round?.id ?? '',
          playerId: controllerPlayer.id,
          submissionVersion: 0,
          acceptedWords: [],
          provisionalScore: 0,
        },
      })),
      submitWord: vi.fn(async () => {
        throw new Error('Injected client failure.');
      }),
    });
    const user = userEvent.setup();
    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore({
          role: 'player',
          roomCode: 'ABC234',
          playerId: controllerPlayer.id,
          playerReconnectToken: 'b'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'QU, tile 1' }));
    await user.click(screen.getByRole('button', { name: 'A, tile 2' }));
    await user.click(screen.getByRole('button', { name: 'B, tile 3' }));
    await user.click(screen.getByRole('button', { name: 'Submit Word' }));

    expect(
      await screen.findByText(
        'That word could not be checked. Your selection is still here.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'QUAB' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit Word' })).toBeEnabled();
  });

  it('does not let an older room snapshot reset newer private submission state', async () => {
    let reportRoomState: ((room: RoomState) => void) | undefined;
    const activeRoom = createRoundRoom();
    const acceptedWord = {
      sequence: 1,
      word: 'QUAB',
      points: 1 as const,
      acceptedAt: '2026-07-27T20:03:01.000Z',
    };
    const staleRoom: RoomState = {
      ...activeRoom,
      stateVersion: 2,
      serverTime: '2026-07-27T20:02:59.000Z',
      round: activeRoom.round
        ? {
            ...activeRoom.round,
            id: '00000000-0000-4000-8000-000000000199',
          }
        : null,
    };
    const client = createFakeClient({
      reconnectPlayer: vi.fn(async (): Promise<PlayerActionResponse> => ({
        ok: true,
        room: activeRoom,
        session: controllerSuccess.session,
        submissionState: {
          roundId: activeRoom.round?.id ?? '',
          playerId: controllerPlayer.id,
          submissionVersion: 1,
          acceptedWords: [acceptedWord],
          provisionalScore: 1,
        },
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
          playerId: controllerPlayer.id,
          playerReconnectToken: 'b'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );

    expect(await screen.findByText('Provisional points: 1')).toBeVisible();
    expect(screen.getByText('QUAB')).toBeVisible();

    act(() => reportRoomState?.(staleRoom));

    expect(screen.getByText('Provisional points: 1')).toBeVisible();
    expect(screen.getByText('QUAB')).toBeVisible();
  });

  it('prevents client-side non-adjacent selection and supports Undo and Clear', async () => {
    const activeRoom = createRoundRoom();
    const client = createFakeClient({
      reconnectPlayer: vi.fn(async (): Promise<PlayerActionResponse> => ({
        ok: true,
        room: activeRoom,
        session: controllerSuccess.session,
        submissionState: {
          roundId: activeRoom.round?.id ?? '',
          playerId: controllerPlayer.id,
          submissionVersion: 0,
          acceptedWords: [],
          provisionalScore: 0,
        },
      })),
    });
    const user = userEvent.setup();
    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore({
          role: 'player',
          roomCode: 'ABC234',
          playerId: controllerPlayer.id,
          playerReconnectToken: 'b'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'QU, tile 1' }));
    await user.click(screen.getByRole('button', { name: 'F, tile 7' }));
    expect(screen.getByRole('heading', { name: 'QU' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
      screen.getByRole('heading', { name: 'Select adjacent tiles' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'A, tile 2' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(
      screen.getByRole('heading', { name: 'Select adjacent tiles' }),
    ).toBeVisible();
  });

  it('preserves native button semantics and keyboard activation inside grid cells', async () => {
    const activeRoom = createRoundRoom();
    const client = createFakeClient({
      reconnectPlayer: vi.fn(async (): Promise<PlayerActionResponse> => ({
        ok: true,
        room: activeRoom,
        session: controllerSuccess.session,
        submissionState: {
          roundId: activeRoom.round?.id ?? '',
          playerId: controllerPlayer.id,
          submissionVersion: 0,
          acceptedWords: [],
          provisionalScore: 0,
        },
      })),
    });
    const user = userEvent.setup();
    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore({
          role: 'player',
          roomCode: 'ABC234',
          playerId: controllerPlayer.id,
          playerReconnectToken: 'b'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );

    const firstTile = await screen.findByRole('button', {
      name: 'QU, tile 1',
    });
    firstTile.focus();
    await user.keyboard('{Enter}');
    expect(firstTile).toHaveAttribute('aria-pressed', 'true');

    const secondTile = screen.getByRole('button', { name: 'A, tile 2' });
    secondTile.focus();
    await user.keyboard(' ');
    expect(secondTile).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'QUA' })).toBeVisible();
  });

  it('prevents a selected candidate from exceeding the 64-letter wire bound', async () => {
    const baseRoom = createRoundRoom();
    const longTokenRoom: RoomState = {
      ...baseRoom,
      settings: {
        ...baseRoom.settings,
        gridSize: 6,
      },
      round: baseRoom.round
        ? {
            ...baseRoom.round,
            settings: {
              ...baseRoom.round.settings,
              gridSize: 6,
            },
            board: {
              size: 6,
              tiles: Array.from({ length: 36 }, () => 'AAAA'),
            },
          }
        : null,
    };
    const client = createFakeClient({
      reconnectPlayer: vi.fn(async (): Promise<PlayerActionResponse> => ({
        ok: true,
        room: longTokenRoom,
        session: controllerSuccess.session,
        submissionState: {
          roundId: longTokenRoom.round?.id ?? '',
          playerId: controllerPlayer.id,
          submissionVersion: 0,
          acceptedWords: [],
          provisionalScore: 0,
        },
      })),
    });
    const user = userEvent.setup();
    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore({
          role: 'player',
          roomCode: 'ABC234',
          playerId: controllerPlayer.id,
          playerReconnectToken: 'b'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );

    const path = [0, 1, 2, 3, 4, 5, 11, 10, 9, 8, 7, 6, 12, 13, 14, 15];
    for (const tileIndex of path) {
      await user.click(
        await screen.findByRole('button', {
          name: `AAAA, tile ${tileIndex + 1}`,
        }),
      );
    }
    const grid = screen.getByRole('grid', {
      name: '6 by 6 official letter grid',
    });
    expect(within(grid).getAllByRole('button', { pressed: true })).toHaveLength(
      16,
    );

    await user.click(screen.getByRole('button', { name: 'AAAA, tile 17' }));
    expect(
      screen.getByText('Words can contain at most 64 letters.'),
    ).toBeVisible();
    expect(within(grid).getAllByRole('button', { pressed: true })).toHaveLength(
      16,
    );
    expect(screen.getByRole('heading', { name: 'A'.repeat(64) })).toBeVisible();
  });

  it('keeps the display and a mid-round joiner passive', async () => {
    const activeRoom = createRoundRoom(
      [controllerPlayer, ordinaryPlayer, thirdPlayer],
      [controllerPlayer, ordinaryPlayer],
    );
    const client = createFakeClient({
      reconnectPlayer: vi.fn(async (): Promise<PlayerActionResponse> => ({
        ok: true,
        room: activeRoom,
        session: {
          playerId: thirdPlayer.id,
          playerReconnectToken: 'd'.repeat(43),
        },
        submissionState: null,
      })),
    });
    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore({
          role: 'player',
          roomCode: 'ABC234',
          playerId: thirdPlayer.id,
          playerReconnectToken: 'd'.repeat(43),
          displayName: thirdPlayer.displayName,
        })}
      />,
    );
    expect(await screen.findByText('Waiting this round.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Submit Word' })).toBeNull();
    expect(screen.queryByText(/Provisional points:/)).toBeNull();
    expect(
      screen.queryByRole('region', { name: 'Join the next round' }),
    ).toBeNull();
  });

  it('shows a compact next-round QR only on the active shared display', async () => {
    const activeRoom = createRoundRoom();

    render(
      <App
        routePath="/"
        client={createFakeClient({
          createDisplay: vi.fn(async (): Promise<DisplayActionResponse> => ({
            ...displaySuccess,
            room: activeRoom,
          })),
        })}
        sessionStore={createFakeSessionStore()}
      />,
    );

    const qrRegion = await screen.findByRole('region', {
      name: 'Join the next round',
    });
    expect(qrRegion).toHaveClass('join-qr--compact');
    expect(qrRegion).toHaveClass('join-qr--active-round');
    expect(
      screen.getByText(/join now and wait for the next round/i),
    ).toBeVisible();
    expect(screen.getByRole('timer')).toBeVisible();
    expect(
      screen.getByRole('grid', { name: '4 by 4 official letter grid' }),
    ).toBeVisible();
  });

  it('keeps the ended board visible and offers the controller the next round', async () => {
    const activeRoom = createRoundRoom();
    const endedRoom: RoomState = {
      ...activeRoom,
      phase: 'ROUND_ENDED',
      stateVersion: 4,
      serverTime: activeRoom.round?.deadlineAt ?? activeRoom.serverTime,
      round: activeRoom.round
        ? {
            ...activeRoom.round,
            endedAt: activeRoom.round.deadlineAt,
            results: {
              players: activeRoom.round.participants.map((participant) => ({
                ...participant,
                rank: 1,
                baseScore: 0,
                uniqueBonusScore: 0,
                finalScore: 0,
                words: [],
              })),
              winnerPlayerIds: [],
            },
          }
        : null,
    };
    const client = createFakeClient({
      reconnectPlayer: vi.fn(async (): Promise<PlayerActionResponse> => ({
        ...controllerSuccess,
        room: endedRoom,
      })),
    });

    render(
      <App
        routePath="/room/ABC234"
        client={client}
        sessionStore={createFakeSessionStore({
          role: 'player',
          roomCode: 'ABC234',
          playerId: controllerPlayer.id,
          playerReconnectToken: 'n'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );

    expect(await screen.findByText('Official board')).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: 'QU' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start Next Round' }),
    ).toBeEnabled();
    expect(screen.getByText('Round complete')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows ended results without a next-round control to the display or an ordinary player', async () => {
    const endedRoom = createEndedRoom(createRoundRoom());
    const displayView = render(
      <App
        routePath="/"
        client={createFakeClient({
          createDisplay: vi.fn(async (): Promise<DisplayActionResponse> => ({
            ...displaySuccess,
            room: endedRoom,
          })),
        })}
        sessionStore={createFakeSessionStore()}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: 'Silver Owl wins' }),
    ).toBeVisible();
    const endedQr = screen.getByRole('region', {
      name: 'Join the next round',
    });
    expect(endedQr).toHaveClass('join-qr--prominent');
    expect(endedQr).toHaveClass('join-qr--ended-round');
    expect(
      screen.queryByRole('button', { name: 'Start Next Round' }),
    ).toBeNull();
    displayView.unmount();

    render(
      <App
        routePath="/room/ABC234"
        client={createFakeClient({
          reconnectPlayer: vi.fn(async (): Promise<PlayerActionResponse> => ({
            ok: true,
            room: endedRoom,
            session: {
              playerId: ordinaryPlayer.id,
              playerReconnectToken: 'p'.repeat(43),
            },
            submissionState: null,
          })),
        })}
        sessionStore={createFakeSessionStore({
          role: 'player',
          roomCode: 'ABC234',
          playerId: ordinaryPlayer.id,
          playerReconnectToken: 'p'.repeat(43),
          displayName: ordinaryPlayer.displayName,
        })}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: 'Silver Owl wins' }),
    ).toBeVisible();
    expect(screen.getByText('<Bright Fox> (You)')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Start Next Round' }),
    ).toBeNull();
    expect(
      screen.queryByRole('region', { name: 'Join the next round' }),
    ).toBeNull();
  });

  it('disables controller actions while disconnected', async () => {
    const client = createFakeClient({
      getConnectionStatus: () => 'disconnected',
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
          playerReconnectToken: 'o'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );

    expect(
      await screen.findByRole('button', { name: 'Start Round' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: '5 × 5' })).toBeDisabled();
  });

  it('prevents duplicate controller actions while one is pending', async () => {
    let resolveStart:
      ((response: ControllerActionResponse) => void) | undefined;
    const client = createFakeClient({
      reconnectPlayer: vi.fn(
        async (): Promise<PlayerActionResponse> => controllerWithPlayersSuccess,
      ),
      startRound: vi.fn(
        () =>
          new Promise<ControllerActionResponse>((resolve) => {
            resolveStart = resolve;
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
          playerReconnectToken: 'p'.repeat(43),
          displayName: controllerPlayer.displayName,
        })}
      />,
    );

    const start = await screen.findByRole('button', { name: 'Start Round' });
    await userEvent.click(start);
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Working…' }));
    expect(client.startRound).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveStart?.({ ok: true, room: createRoundRoom() });
      await Promise.resolve();
    });
  });

  it('shows a mid-round joiner as waiting for the next round', async () => {
    const activeRoom = createRoundRoom(
      [controllerPlayer, ordinaryPlayer],
      [controllerPlayer],
    );
    const client = createFakeClient({
      reconnectPlayer: vi.fn(async (): Promise<PlayerActionResponse> => ({
        ...ordinarySuccess,
        room: activeRoom,
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
          playerReconnectToken: 'm'.repeat(43),
          displayName: ordinaryPlayer.displayName,
        })}
      />,
    );

    expect(
      await screen.findByText(/joined after this round began/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Round' })).toBeDisabled();
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
    expect(
      screen.queryByRole('region', {
        name: /scan to join|join the next round/i,
      }),
    ).toBeNull();
  });

  it('does not render the display QR on the retained demo route', () => {
    render(
      <App
        routePath="/play/demo"
        client={createFakeClient()}
        sessionStore={createFakeSessionStore()}
      />,
    );

    expect(
      screen.queryByRole('region', {
        name: /scan to join|join the next round/i,
      }),
    ).toBeNull();
  });
});
