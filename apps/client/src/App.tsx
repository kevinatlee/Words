import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  normalizeRoomCode,
  type ConnectionStatus,
  type PlayerRoundSubmissionState,
  type RoomError,
  type RoomErrorCode,
  type RoomSettings,
  type RoomState,
  type SubmitWordInput,
  type SubmitWordResponse,
} from '@words/shared';

import { AppShell } from './components/AppShell';
import { JoinRoomForm } from './components/JoinRoomForm';
import { LobbyError } from './components/LobbyError';
import { NotFound } from './components/NotFound';
import { PlayerPrototype } from './components/PlayerPrototype';
import { RoomLobby } from './components/RoomLobby';
import {
  lobbyClient as defaultLobbyClient,
  type LobbyClient,
} from './lobby-client';
import {
  lobbySessionStore as defaultSessionStore,
  type LobbySessionStore,
  type StoredLobbySession,
} from './session-store';

type AppProps = {
  routePath?: string;
  client?: LobbyClient;
  sessionStore?: LobbySessionStore;
};

function roomCodeFromPath(path: string): string | null {
  const match = /^\/room\/([^/]+)$/.exec(path);
  return match?.[1] ? normalizeRoomCode(match[1]) : null;
}

function joinRoomCodeFromPath(path: string): string | null {
  const match = /^\/join\/([^/]+)$/.exec(path);
  return match?.[1] ? normalizeRoomCode(match[1]) : null;
}

function canonicalPath(path: string): string {
  return path === '/display' || path === '/host' ? '/' : path;
}

const replaceableDisplayCredentialErrors = new Set<RoomErrorCode>([
  'RECONNECT_FAILED',
  'ROOM_EXPIRED',
  'ROOM_NOT_FOUND',
]);

function isSameSession(
  left: StoredLobbySession | null,
  right: StoredLobbySession | null,
): boolean {
  if (
    left === null ||
    right === null ||
    left.role !== right.role ||
    left.roomCode !== right.roomCode
  ) {
    return false;
  }

  return left.role === 'display' && right.role === 'display'
    ? left.displaySessionId === right.displaySessionId
    : left.role === 'player' &&
        right.role === 'player' &&
        left.playerId === right.playerId;
}

function submissionStatesMatch(
  left: PlayerRoundSubmissionState,
  right: PlayerRoundSubmissionState,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function finalizedResultsMatch(left: RoomState, right: RoomState): boolean {
  return (
    JSON.stringify(left.round?.results ?? null) ===
    JSON.stringify(right.round?.results ?? null)
  );
}

export function App({
  routePath,
  client = defaultLobbyClient,
  sessionStore = defaultSessionStore,
}: AppProps) {
  const [currentPath, setCurrentPath] = useState(
    canonicalPath(routePath ?? window.location.pathname),
  );
  const [room, setRoom] = useState<RoomState | null>(null);
  const [session, setSession] = useState<StoredLobbySession | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    client.getConnectionStatus(),
  );
  const [roomError, setRoomError] = useState<RoomError | null>(null);
  const [submissionState, setSubmissionState] =
    useState<PlayerRoundSubmissionState | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [displayStarting, setDisplayStarting] = useState(false);
  const sessionRef = useRef<StoredLobbySession | null>(null);
  const roomRef = useRef<RoomState | null>(null);
  const reconnectNeededRef = useRef(false);
  const reconnectingRef = useRef(false);
  const pendingReconnectRef = useRef<StoredLobbySession | null>(null);
  const displayStartupStartedRef = useRef(false);
  const attemptedRoomCodeRef = useRef<string | null>(null);

  const acceptRoomSnapshot = useCallback(
    (nextRoom: RoomState, expectedSession?: StoredLobbySession) => {
      const currentSession = sessionRef.current;
      if (
        currentSession?.roomCode !== nextRoom.code ||
        (expectedSession !== undefined &&
          !isSameSession(currentSession, expectedSession))
      ) {
        return;
      }

      const currentRoom = roomRef.current;
      if (
        currentRoom?.code === nextRoom.code &&
        (nextRoom.stateVersion < currentRoom.stateVersion ||
          (nextRoom.stateVersion === currentRoom.stateVersion &&
            (Date.parse(nextRoom.serverTime) <
              Date.parse(currentRoom.serverTime) ||
              !finalizedResultsMatch(currentRoom, nextRoom))))
      ) {
        return;
      }

      roomRef.current = nextRoom;
      setRoom(nextRoom);

      if (currentSession.role === 'player' && nextRoom.round) {
        const currentRound = nextRoom.round;
        const isParticipant = currentRound.participants.some(
          (participant) => participant.playerId === currentSession.playerId,
        );
        setSubmissionState((current) =>
          isParticipant
            ? current?.roundId === currentRound.id &&
              current?.playerId === currentSession.playerId
              ? current
              : {
                  roundId: currentRound.id,
                  playerId: currentSession.playerId,
                  submissionVersion: 0,
                  acceptedWords: [],
                  provisionalScore: 0,
                }
            : null,
        );
      } else {
        setSubmissionState(null);
      }
    },
    [],
  );

  const navigate = useCallback(
    (path: string) => {
      if (routePath === undefined) {
        window.history.pushState({}, '', path);
      }
      setCurrentPath(path);
    },
    [routePath],
  );

  const rememberSession = useCallback(
    (nextRoom: RoomState, nextSession: StoredLobbySession) => {
      sessionStore.save(nextSession);
      sessionRef.current = nextSession;
      setSession(nextSession);
      roomRef.current = nextRoom;
      setRoom(nextRoom);
      if (nextSession.role === 'player' && nextRoom.round) {
        const isParticipant = nextRoom.round.participants.some(
          (participant) => participant.playerId === nextSession.playerId,
        );
        setSubmissionState(
          isParticipant
            ? {
                roundId: nextRoom.round.id,
                playerId: nextSession.playerId,
                submissionVersion: 0,
                acceptedWords: [],
                provisionalScore: 0,
              }
            : null,
        );
      } else {
        setSubmissionState(null);
      }
      setRoomError(null);
      attemptedRoomCodeRef.current = nextRoom.code;
      if (nextSession.role === 'player') {
        navigate(`/room/${nextRoom.code}`);
      } else if (currentPath !== '/') {
        navigate('/');
      }
    },
    [currentPath, navigate, sessionStore],
  );

  const acceptSubmissionState = useCallback(
    (
      nextState: PlayerRoundSubmissionState,
      expectedSession: StoredLobbySession,
      expectedRoundId: string,
    ) => {
      const currentSession = sessionRef.current;
      const currentRoom = roomRef.current;
      if (
        currentSession?.role !== 'player' ||
        expectedSession.role !== 'player' ||
        !isSameSession(currentSession, expectedSession) ||
        currentRoom?.code !== currentSession.roomCode ||
        currentRoom.round?.id !== expectedRoundId ||
        nextState.roundId !== expectedRoundId ||
        nextState.playerId !== currentSession.playerId
      ) {
        return;
      }

      setSubmissionState((current) => {
        if (
          current?.roundId !== nextState.roundId ||
          current.playerId !== nextState.playerId
        ) {
          return nextState;
        }
        if (nextState.submissionVersion < current.submissionVersion) {
          return current;
        }
        if (
          nextState.submissionVersion === current.submissionVersion &&
          !submissionStatesMatch(current, nextState)
        ) {
          return current;
        }
        return nextState;
      });
    },
    [],
  );

  const reconnectSession = useCallback(
    async (storedSession: StoredLobbySession): Promise<void> => {
      if (reconnectingRef.current) {
        pendingReconnectRef.current = storedSession;
        return;
      }

      reconnectingRef.current = true;
      setReconnecting(true);
      let requestedSession: StoredLobbySession | null = storedSession;

      try {
        while (requestedSession) {
          pendingReconnectRef.current = null;
          const response =
            requestedSession.role === 'display'
              ? await client.reconnectDisplay({
                  roomCode: requestedSession.roomCode,
                  displayReconnectToken: requestedSession.displayReconnectToken,
                })
              : await client.reconnectPlayer({
                  roomCode: requestedSession.roomCode,
                  playerReconnectToken: requestedSession.playerReconnectToken,
                });

          if (!isSameSession(sessionRef.current, requestedSession)) {
            if (response.ok) {
              const leaveResponse =
                requestedSession.role === 'display'
                  ? await client.leaveDisplay()
                  : await client.leavePlayer();
              if (!leaveResponse.ok) {
                setRoomError(leaveResponse.error);
                return;
              }
            }

            requestedSession =
              pendingReconnectRef.current ?? sessionRef.current;
            continue;
          }

          if (!response.ok) {
            sessionStore.clear(requestedSession);
            sessionRef.current = null;
            setSession(null);
            roomRef.current = null;
            setRoom(null);
            setSubmissionState(null);
            setRoomError(response.error);
            return;
          }

          if (
            requestedSession.role === 'display' &&
            'displaySessionId' in response.session
          ) {
            rememberSession(response.room, {
              role: 'display',
              roomCode: response.room.code,
              ...response.session,
            });
            setSubmissionState(null);
            return;
          }

          if (
            requestedSession.role === 'player' &&
            'playerId' in response.session
          ) {
            const nextSession: StoredLobbySession = {
              role: 'player',
              roomCode: response.room.code,
              ...response.session,
              displayName: requestedSession.displayName,
            };
            rememberSession(response.room, nextSession);
            if (
              'submissionState' in response &&
              response.submissionState &&
              response.room.round
            ) {
              acceptSubmissionState(
                response.submissionState,
                nextSession,
                response.room.round.id,
              );
            } else {
              setSubmissionState(null);
            }
            return;
          }
        }
      } finally {
        pendingReconnectRef.current = null;
        reconnectingRef.current = false;
        setReconnecting(false);
      }
    },
    [acceptSubmissionState, client, rememberSession, sessionStore],
  );

  const startDisplay = useCallback(async () => {
    if (reconnectingRef.current) {
      return;
    }

    reconnectingRef.current = true;
    setDisplayStarting(true);
    setRoomError(null);

    const storedDisplay = sessionStore.loadDisplay();
    if (storedDisplay) {
      const reconnected = await client.reconnectDisplay({
        roomCode: storedDisplay.roomCode,
        displayReconnectToken: storedDisplay.displayReconnectToken,
      });

      if (reconnected.ok) {
        reconnectingRef.current = false;
        setDisplayStarting(false);
        rememberSession(reconnected.room, {
          role: 'display',
          roomCode: reconnected.room.code,
          ...reconnected.session,
        });
        setSubmissionState(null);
        return;
      }

      if (!replaceableDisplayCredentialErrors.has(reconnected.error.code)) {
        reconnectingRef.current = false;
        setDisplayStarting(false);
        setRoomError(reconnected.error);
        return;
      }

      sessionStore.clear(storedDisplay);
    }

    const created = await client.createDisplay({});
    reconnectingRef.current = false;
    setDisplayStarting(false);

    if (!created.ok) {
      setRoomError(created.error);
      return;
    }

    rememberSession(created.room, {
      role: 'display',
      roomCode: created.room.code,
      ...created.session,
    });
    setSubmissionState(null);
  }, [client, rememberSession, sessionStore]);

  useEffect(() => {
    const stopRoomState = client.onRoomState((nextRoom) => {
      if (sessionRef.current?.roomCode === nextRoom.code) {
        acceptRoomSnapshot(nextRoom);
      }
    });
    const stopRoomError = client.onRoomError((error) => {
      setRoomError(error);

      if (error.code === 'ROOM_EXPIRED' || error.code === 'RECONNECT_FAILED') {
        sessionStore.clear(sessionRef.current);
        sessionRef.current = null;
        setSession(null);
        roomRef.current = null;
        setRoom(null);
        setSubmissionState(null);
      }
    });
    const stopConnectionStatus = client.onConnectionStatus((status) => {
      setConnectionStatus(status);

      if (status === 'disconnected' && sessionRef.current) {
        reconnectNeededRef.current = true;
      }

      if (
        status === 'connected' &&
        reconnectNeededRef.current &&
        sessionRef.current
      ) {
        reconnectNeededRef.current = false;
        void reconnectSession(sessionRef.current);
      }
    });
    const onPopState = () => {
      const nextPath = canonicalPath(window.location.pathname);
      if (nextPath !== window.location.pathname) {
        window.history.replaceState({}, '', nextPath);
      }
      setCurrentPath(nextPath);
    };

    window.addEventListener('popstate', onPopState);

    return () => {
      stopRoomState();
      stopRoomError();
      stopConnectionStatus();
      window.removeEventListener('popstate', onPopState);
    };
  }, [acceptRoomSnapshot, client, reconnectSession, sessionStore]);

  useEffect(() => {
    if (
      routePath === undefined &&
      currentPath === '/' &&
      window.location.pathname !== '/'
    ) {
      window.history.replaceState({}, '', '/');
    }
  }, [currentPath, routePath]);

  useEffect(() => {
    if (currentPath !== '/') {
      displayStartupStartedRef.current = false;
      return;
    }

    if (
      sessionRef.current?.role === 'display' ||
      displayStartupStartedRef.current
    ) {
      return;
    }

    displayStartupStartedRef.current = true;
    void startDisplay();
  }, [currentPath, startDisplay]);

  useEffect(() => {
    const roomCode = roomCodeFromPath(currentPath);

    if (
      !roomCode ||
      room?.code === roomCode ||
      attemptedRoomCodeRef.current === roomCode
    ) {
      return;
    }

    const storedSession = sessionStore.load(roomCode);

    if (!storedSession) {
      attemptedRoomCodeRef.current = roomCode;
      return;
    }

    const reconnectTimer = window.setTimeout(() => {
      attemptedRoomCodeRef.current = roomCode;
      sessionRef.current = storedSession;
      void reconnectSession(storedSession);
    }, 0);

    return () => window.clearTimeout(reconnectTimer);
  }, [currentPath, reconnectSession, room?.code, sessionStore]);

  const joinPlayer = async (
    roomCode: string,
    displayName: string,
  ): Promise<RoomError | null> => {
    const response = await client.joinPlayer({
      roomCode: normalizeRoomCode(roomCode),
      displayName,
    });

    if (!response.ok) {
      return response.error;
    }

    const playerName =
      response.room.players.find(
        (player) => player.id === response.session.playerId,
      )?.displayName ?? displayName.trim();

    rememberSession(response.room, {
      role: 'player',
      roomCode: response.room.code,
      ...response.session,
      displayName: playerName,
    });
    setSubmissionState(response.submissionState);
    return null;
  };

  const leaveSession = async (): Promise<void> => {
    const currentSession = sessionRef.current;
    if (!currentSession) {
      return;
    }

    const response =
      currentSession.role === 'display'
        ? await client.leaveDisplay()
        : await client.leavePlayer();

    if (!response.ok) {
      setRoomError(response.error);
      return;
    }

    sessionStore.clear(currentSession);
    sessionRef.current = null;
    setSession(null);
    roomRef.current = null;
    setRoom(null);
    setSubmissionState(null);
    setRoomError(null);
    attemptedRoomCodeRef.current = null;
    navigate(currentSession.role === 'display' ? '/' : '/join');
  };

  const retryDisplay = () => {
    displayStartupStartedRef.current = true;
    void startDisplay();
  };

  const transferController = async (
    targetPlayerId: string,
  ): Promise<RoomError | null> => {
    const actionSession = sessionRef.current;
    const response = await client.transferController({ targetPlayerId });

    if (!isSameSession(sessionRef.current, actionSession)) {
      return null;
    }
    if (!response.ok) {
      return response.error;
    }

    acceptRoomSnapshot(response.room, actionSession ?? undefined);
    setRoomError(null);
    return null;
  };

  const updateSettings = async (
    settings: RoomSettings,
  ): Promise<RoomError | null> => {
    const actionSession = sessionRef.current;
    const response = await client.updateSettings(settings);

    if (!isSameSession(sessionRef.current, actionSession)) {
      return null;
    }
    if (!response.ok) {
      return response.error;
    }

    acceptRoomSnapshot(response.room, actionSession ?? undefined);
    setRoomError(null);
    return null;
  };

  const startRound = async (): Promise<RoomError | null> => {
    const actionSession = sessionRef.current;
    const response = await client.startRound();

    if (!isSameSession(sessionRef.current, actionSession)) {
      return null;
    }
    if (!response.ok) {
      return response.error;
    }

    acceptRoomSnapshot(response.room, actionSession ?? undefined);
    setRoomError(null);
    return null;
  };

  const submitWord = async (
    input: SubmitWordInput,
  ): Promise<SubmitWordResponse> => {
    const actionSession = sessionRef.current;
    if (actionSession?.role !== 'player') {
      return {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'That player session cannot submit words.',
        },
        state: null,
      };
    }

    const response = await client.submitWord(input);
    if (
      !isSameSession(sessionRef.current, actionSession) ||
      roomRef.current?.round?.id !== input.roundId
    ) {
      return {
        ok: false,
        error: {
          code: 'ROUND_MISMATCH',
          message: 'That word belongs to a different round.',
        },
        state: null,
      };
    }

    if (response.state) {
      acceptSubmissionState(response.state, actionSession, input.roundId);
    }
    return response;
  };

  let page: ReactNode;
  let pageClassName: string;
  const routeRoomCode = roomCodeFromPath(currentPath);
  const routeJoinRoomCode = joinRoomCodeFromPath(currentPath);

  if (currentPath === '/') {
    if (room && session?.role === 'display') {
      page = (
        <>
          <LobbyError error={roomError} />
          <RoomLobby
            key={`${room.code}:${room.round?.id ?? 'lobby'}:display`}
            room={room}
            sessionRole="display"
            currentPlayerId={null}
            connectionStatus={connectionStatus}
            onLeave={leaveSession}
            onTransferController={transferController}
            onUpdateSettings={updateSettings}
            onStartRound={startRound}
            submissionState={null}
            onSubmitWord={submitWord}
          />
        </>
      );
    } else if (displayStarting || !roomError) {
      page = (
        <section className="loading-lobby" aria-live="polite">
          <span className="eyebrow">Shared display</span>
          <h1>Preparing your room…</h1>
          <p>
            Reconnecting this display when possible, or creating one temporary
            room.
          </p>
        </section>
      );
    } else {
      page = (
        <section className="loading-lobby" aria-live="polite">
          <span className="eyebrow">Shared display</span>
          <h1>We couldn’t prepare the room.</h1>
          <LobbyError error={roomError} />
          <button
            className="button button--primary"
            type="button"
            onClick={retryDisplay}
          >
            Retry display connection
          </button>
        </section>
      );
    }
    pageClassName = 'app-shell--display';
  } else if (currentPath === '/join') {
    page = <JoinRoomForm onJoin={joinPlayer} />;
    pageClassName = 'app-shell--player';
  } else if (routeJoinRoomCode) {
    page = (
      <JoinRoomForm
        initialRoomCode={routeJoinRoomCode}
        roomCodeLocked
        onJoin={joinPlayer}
      />
    );
    pageClassName = 'app-shell--player';
  } else if (currentPath === '/play/demo') {
    page = <PlayerPrototype />;
    pageClassName = 'app-shell--player';
  } else if (routeRoomCode) {
    if (room && session && room.code === routeRoomCode) {
      page = (
        <>
          <LobbyError error={roomError} />
          <RoomLobby
            key={`${room.code}:${room.round?.id ?? 'lobby'}:${session.role}:${session.role === 'player' ? session.playerId : 'display'}`}
            room={room}
            sessionRole={session.role}
            currentPlayerId={
              session.role === 'player' ? session.playerId : null
            }
            connectionStatus={connectionStatus}
            onLeave={leaveSession}
            onTransferController={transferController}
            onUpdateSettings={updateSettings}
            onStartRound={startRound}
            submissionState={submissionState}
            onSubmitWord={submitWord}
          />
        </>
      );
    } else if (reconnecting) {
      page = (
        <section className="loading-lobby" aria-live="polite">
          <span className="eyebrow">Temporary session</span>
          <h1>Reconnecting to {routeRoomCode}…</h1>
          <p>Checking this tab’s server-issued reconnect credential.</p>
        </section>
      );
    } else {
      page = (
        <>
          <LobbyError error={roomError} />
          <JoinRoomForm initialRoomCode={routeRoomCode} onJoin={joinPlayer} />
        </>
      );
    }
    pageClassName =
      session?.role === 'display' ? 'app-shell--display' : 'app-shell--player';
  } else {
    page = <NotFound />;
    pageClassName = 'app-shell--not-found';
  }

  return (
    <AppShell currentPath={currentPath} pageClassName={pageClassName}>
      {page}
    </AppShell>
  );
}
