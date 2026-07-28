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
  type RoomState,
} from '@words/shared';

import { AppShell } from './components/AppShell';
import { HostRoomForm } from './components/HostRoomForm';
import { JoinRoomForm } from './components/JoinRoomForm';
import { LobbyError } from './components/LobbyError';
import { NotFound } from './components/NotFound';
import { PlayerPrototype } from './components/PlayerPrototype';
import { RoleSelection } from './components/RoleSelection';
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

export function App({
  routePath,
  client = defaultLobbyClient,
  sessionStore = defaultSessionStore,
}: AppProps) {
  const [currentPath, setCurrentPath] = useState(
    routePath ?? window.location.pathname,
  );
  const [room, setRoom] = useState<RoomState | null>(null);
  const [session, setSession] = useState<StoredLobbySession | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    client.getConnectionStatus(),
  );
  const [roomError, setRoomError] = useState<RoomError | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const sessionRef = useRef<StoredLobbySession | null>(null);
  const reconnectNeededRef = useRef(false);
  const reconnectingRef = useRef(false);
  const attemptedRoomCodeRef = useRef<string | null>(null);

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
    (
      nextRoom: RoomState,
      credentials: {
        playerId: string;
        reconnectToken: string;
      },
      displayName: string,
    ) => {
      const nextSession: StoredLobbySession = {
        roomCode: nextRoom.code,
        playerId: credentials.playerId,
        reconnectToken: credentials.reconnectToken,
        displayName,
      };
      sessionStore.save(nextSession);
      sessionRef.current = nextSession;
      setSession(nextSession);
      setRoom(nextRoom);
      setRoomError(null);
      attemptedRoomCodeRef.current = nextRoom.code;
      navigate(`/room/${nextRoom.code}`);
    },
    [navigate, sessionStore],
  );

  const reconnectSession = useCallback(
    async (storedSession: StoredLobbySession) => {
      if (reconnectingRef.current) {
        return;
      }

      reconnectingRef.current = true;
      setReconnecting(true);
      const response = await client.reconnectRoom({
        roomCode: storedSession.roomCode,
        reconnectToken: storedSession.reconnectToken,
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

      rememberSession(
        response.room,
        response.session,
        storedSession.displayName,
      );
    },
    [client, rememberSession, sessionStore],
  );

  useEffect(() => {
    const stopRoomState = client.onRoomState((nextRoom) => {
      if (sessionRef.current?.roomCode === nextRoom.code) {
        setRoom(nextRoom);
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
    const onPopState = () => setCurrentPath(window.location.pathname);

    window.addEventListener('popstate', onPopState);

    return () => {
      stopRoomState();
      stopRoomError();
      stopConnectionStatus();
      window.removeEventListener('popstate', onPopState);
    };
  }, [client, reconnectSession, sessionStore]);

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

  const createRoom = async (displayName: string): Promise<RoomError | null> => {
    const response = await client.createRoom({ displayName });

    if (!response.ok) {
      return response.error;
    }

    rememberSession(response.room, response.session, displayName.trim());
    return null;
  };

  const joinRoom = async (
    roomCode: string,
    displayName: string,
  ): Promise<RoomError | null> => {
    const response = await client.joinRoom({ roomCode, displayName });

    if (!response.ok) {
      return response.error;
    }

    rememberSession(response.room, response.session, displayName.trim());
    return null;
  };

  const leaveRoom = async (): Promise<void> => {
    const response = await client.leaveRoom();

    if (!response.ok) {
      setRoomError(response.error);
      return;
    }

    sessionStore.clear(sessionRef.current);
    sessionRef.current = null;
    setSession(null);
    setRoom(null);
    setRoomError(null);
    attemptedRoomCodeRef.current = null;
    navigate('/');
  };

  let page: ReactNode;
  let pageClassName: string;
  const routeRoomCode = roomCodeFromPath(currentPath);

  if (currentPath === '/') {
    page = <RoleSelection />;
    pageClassName = 'app-shell--home';
  } else if (currentPath === '/host') {
    page = <HostRoomForm onCreate={createRoom} />;
    pageClassName = 'app-shell--host';
  } else if (currentPath === '/join') {
    page = <JoinRoomForm onJoin={joinRoom} />;
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
            currentPlayerId={session.playerId}
            connectionStatus={connectionStatus}
            onLeave={leaveRoom}
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
          <JoinRoomForm initialRoomCode={routeRoomCode} onJoin={joinRoom} />
        </>
      );
    }
    pageClassName = 'app-shell--host';
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
