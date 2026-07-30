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
  type RoomError,
  type RoomErrorCode,
  type RoomSettings,
  type RoomState,
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
  const [reconnecting, setReconnecting] = useState(false);
  const [displayStarting, setDisplayStarting] = useState(false);
  const sessionRef = useRef<StoredLobbySession | null>(null);
  const reconnectNeededRef = useRef(false);
  const reconnectingRef = useRef(false);
  const displayStartupStartedRef = useRef(false);
  const attemptedRoomCodeRef = useRef<string | null>(null);

  const acceptRoomSnapshot = useCallback((nextRoom: RoomState) => {
    setRoom((currentRoom) => {
      if (
        currentRoom?.code === nextRoom.code &&
        nextRoom.stateVersion < currentRoom.stateVersion
      ) {
        return currentRoom;
      }
      return nextRoom;
    });
  }, []);

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
      setRoom(nextRoom);
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

  const reconnectSession = useCallback(
    async (storedSession: StoredLobbySession) => {
      if (reconnectingRef.current) {
        return;
      }

      reconnectingRef.current = true;
      setReconnecting(true);

      const response =
        storedSession.role === 'display'
          ? await client.reconnectDisplay({
              roomCode: storedSession.roomCode,
              displayReconnectToken: storedSession.displayReconnectToken,
            })
          : await client.reconnectPlayer({
              roomCode: storedSession.roomCode,
              playerReconnectToken: storedSession.playerReconnectToken,
            });

      reconnectingRef.current = false;
      setReconnecting(false);

      if (!response.ok) {
        sessionStore.clear(storedSession);
        sessionRef.current = null;
        setSession(null);
        setRoom(null);
        setRoomError(response.error);
        return;
      }

      if (
        storedSession.role === 'display' &&
        'displaySessionId' in response.session
      ) {
        rememberSession(response.room, {
          role: 'display',
          roomCode: response.room.code,
          ...response.session,
        });
        return;
      }

      if (storedSession.role === 'player' && 'playerId' in response.session) {
        rememberSession(response.room, {
          role: 'player',
          roomCode: response.room.code,
          ...response.session,
          displayName: storedSession.displayName,
        });
      }
    },
    [client, rememberSession, sessionStore],
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
        setRoom(null);
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
    setRoom(null);
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
    const response = await client.transferController({ targetPlayerId });

    if (!response.ok) {
      return response.error;
    }

    acceptRoomSnapshot(response.room);
    setRoomError(null);
    return null;
  };

  const updateSettings = async (
    settings: RoomSettings,
  ): Promise<RoomError | null> => {
    const response = await client.updateSettings(settings);

    if (!response.ok) {
      return response.error;
    }

    acceptRoomSnapshot(response.room);
    setRoomError(null);
    return null;
  };

  const startRound = async (): Promise<RoomError | null> => {
    const response = await client.startRound();

    if (!response.ok) {
      return response.error;
    }

    acceptRoomSnapshot(response.room);
    setRoomError(null);
    return null;
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
            room={room}
            sessionRole="display"
            currentPlayerId={null}
            connectionStatus={connectionStatus}
            onLeave={leaveSession}
            onTransferController={transferController}
            onUpdateSettings={updateSettings}
            onStartRound={startRound}
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
