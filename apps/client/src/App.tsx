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
import { useDisplayAudio } from './hooks/useDisplayAudio';
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

type PlayerRecovery = {
  roomCode: string | null;
  displayName: string;
  kind: 'rejoin' | 'find-room';
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
const displayRoomRecoveryDelayMilliseconds = 3_000;

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

function arraysMatch<T>(
  left: readonly T[],
  right: readonly T[],
  itemMatches: (leftItem: T, rightItem: T) => boolean,
): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) =>
      right[index] === undefined ? false : itemMatches(item, right[index]),
    )
  );
}

function settingsMatch(
  left: RoomState['settings'],
  right: RoomState['settings'],
): boolean {
  return (
    left.gridSize === right.gridSize &&
    left.roundDurationSeconds === right.roundDurationSeconds &&
    left.scoringMode === right.scoringMode
  );
}

function resultWordsMatch(
  left: NonNullable<
    NonNullable<RoomState['round']>['results']
  >['players'][number]['words'][number],
  right: NonNullable<
    NonNullable<RoomState['round']>['results']
  >['players'][number]['words'][number],
): boolean {
  return (
    left.word === right.word &&
    left.basePoints === right.basePoints &&
    left.shared === right.shared &&
    left.uniqueBonusPoints === right.uniqueBonusPoints &&
    left.finalPoints === right.finalPoints
  );
}

function finalizedResultsMatch(left: RoomState, right: RoomState): boolean {
  const leftResults = left.round?.results ?? null;
  const rightResults = right.round?.results ?? null;
  if (leftResults === null || rightResults === null) {
    return leftResults === rightResults;
  }
  return (
    arraysMatch(
      leftResults.winnerPlayerIds,
      rightResults.winnerPlayerIds,
      (leftId, rightId) => leftId === rightId,
    ) &&
    arraysMatch(
      leftResults.players,
      rightResults.players,
      (leftPlayer, rightPlayer) =>
        leftPlayer.playerId === rightPlayer.playerId &&
        leftPlayer.displayName === rightPlayer.displayName &&
        leftPlayer.rank === rightPlayer.rank &&
        leftPlayer.baseScore === rightPlayer.baseScore &&
        leftPlayer.uniqueBonusScore === rightPlayer.uniqueBonusScore &&
        leftPlayer.finalScore === rightPlayer.finalScore &&
        arraysMatch(leftPlayer.words, rightPlayer.words, resultWordsMatch),
    )
  );
}

function roomSnapshotsMatch(left: RoomState, right: RoomState): boolean {
  const playersMatch = arraysMatch(
    left.players,
    right.players,
    (leftPlayer, rightPlayer) =>
      leftPlayer.id === rightPlayer.id &&
      leftPlayer.displayName === rightPlayer.displayName &&
      leftPlayer.connected === rightPlayer.connected &&
      leftPlayer.joinedAt === rightPlayer.joinedAt &&
      leftPlayer.isController === rightPlayer.isController,
  );
  const peopleMatch = (
    leftPeople: readonly { playerId: string; displayName: string }[],
    rightPeople: readonly { playerId: string; displayName: string }[],
  ) =>
    arraysMatch(
      leftPeople,
      rightPeople,
      (leftPerson, rightPerson) =>
        leftPerson.playerId === rightPerson.playerId &&
        leftPerson.displayName === rightPerson.displayName,
    );
  const lastRoundMatches =
    left.highlights.lastRound === null || right.highlights.lastRound === null
      ? left.highlights.lastRound === right.highlights.lastRound
      : left.highlights.lastRound.roundNumber ===
          right.highlights.lastRound.roundNumber &&
        left.highlights.lastRound.winningScore ===
          right.highlights.lastRound.winningScore &&
        peopleMatch(
          left.highlights.lastRound.winners,
          right.highlights.lastRound.winners,
        );
  const roomRecordMatches =
    left.highlights.roomRecord === null || right.highlights.roomRecord === null
      ? left.highlights.roomRecord === right.highlights.roomRecord
      : left.highlights.roomRecord.roundNumber ===
          right.highlights.roomRecord.roundNumber &&
        left.highlights.roomRecord.score ===
          right.highlights.roomRecord.score &&
        peopleMatch(
          left.highlights.roomRecord.holders,
          right.highlights.roomRecord.holders,
        );
  const roundsMatch = (() => {
    if (left.round === null || right.round === null) {
      return left.round === right.round;
    }
    return (
      left.round.id === right.round.id &&
      left.round.number === right.round.number &&
      settingsMatch(left.round.settings, right.round.settings) &&
      left.round.board.size === right.round.board.size &&
      arraysMatch(
        left.round.board.tiles,
        right.round.board.tiles,
        (leftTile, rightTile) => leftTile === rightTile,
      ) &&
      peopleMatch(left.round.participants, right.round.participants) &&
      arraysMatch(
        left.round.acceptedWordCounts,
        right.round.acceptedWordCounts,
        (leftEntry, rightEntry) =>
          leftEntry.playerId === rightEntry.playerId &&
          leftEntry.count === rightEntry.count,
      ) &&
      left.round.startedAt === right.round.startedAt &&
      left.round.deadlineAt === right.round.deadlineAt &&
      left.round.endedAt === right.round.endedAt &&
      left.round.generationAttempts === right.round.generationAttempts &&
      finalizedResultsMatch(left, right)
    );
  })();

  return (
    left.code === right.code &&
    left.phase === right.phase &&
    left.stateVersion === right.stateVersion &&
    left.serverTime === right.serverTime &&
    left.createdAt === right.createdAt &&
    left.lastActivityAt === right.lastActivityAt &&
    left.expiresAt === right.expiresAt &&
    left.maxPlayers === right.maxPlayers &&
    left.display.connected === right.display.connected &&
    left.display.createdAt === right.display.createdAt &&
    left.controllerStatus === right.controllerStatus &&
    left.controllerPlayerId === right.controllerPlayerId &&
    playersMatch &&
    settingsMatch(left.settings, right.settings) &&
    lastRoundMatches &&
    roomRecordMatches &&
    roundsMatch
  );
}

function shareStableRoundReferences(
  current: RoomState | null,
  next: RoomState,
): RoomState {
  if (
    !current?.round ||
    !next.round ||
    current.round.id !== next.round.id ||
    current.round.board.size !== next.round.board.size ||
    !arraysMatch(
      current.round.board.tiles,
      next.round.board.tiles,
      (leftTile, rightTile) => leftTile === rightTile,
    )
  ) {
    return next;
  }
  return {
    ...next,
    round: {
      ...next.round,
      board: {
        ...next.round.board,
        tiles: current.round.board.tiles,
      },
    },
  };
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
  const [playerRecovery, setPlayerRecovery] = useState<PlayerRecovery | null>(
    null,
  );
  useDisplayAudio(room, currentPath === '/' && session?.role === 'display');
  const sessionRef = useRef<StoredLobbySession | null>(null);
  const roomRef = useRef<RoomState | null>(null);
  const reconnectNeededRef = useRef(false);
  const reconnectingRef = useRef(false);
  const pendingReconnectRef = useRef<StoredLobbySession | null>(null);
  const displayStartupStartedRef = useRef(false);
  const displayRecoveryTimerRef = useRef<number | null>(null);
  const attemptedRoomCodeRef = useRef<string | null>(null);

  const cancelDisplayRecovery = useCallback(() => {
    if (displayRecoveryTimerRef.current !== null) {
      window.clearTimeout(displayRecoveryTimerRef.current);
      displayRecoveryTimerRef.current = null;
    }
  }, []);

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
      if (currentRoom?.code === nextRoom.code) {
        if (nextRoom.stateVersion < currentRoom.stateVersion) {
          return;
        }
        if (nextRoom.stateVersion === currentRoom.stateVersion) {
          const currentServerTime = Date.parse(currentRoom.serverTime);
          const nextServerTime = Date.parse(nextRoom.serverTime);
          if (
            nextServerTime < currentServerTime ||
            !finalizedResultsMatch(currentRoom, nextRoom)
          ) {
            return;
          }
          // Action acknowledgements can be followed by the exact same
          // authoritative broadcast. Compare every bounded room field so a
          // meaningful same-version correction is never discarded.
          if (
            nextServerTime === currentServerTime &&
            roomSnapshotsMatch(currentRoom, nextRoom)
          ) {
            return;
          }
        }
      }

      const renderRoom = shareStableRoundReferences(currentRoom, nextRoom);
      roomRef.current = renderRoom;
      setRoom(renderRoom);

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
      cancelDisplayRecovery();
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
    [cancelDisplayRecovery, currentPath, navigate, sessionStore],
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
        // A submission version identifies one immutable private response.
        // Preserve the current object for both exact duplicates and conflicting
        // same-version payloads, matching the existing conflict protection
        // without serializing the accepted-word list.
        if (nextState.submissionVersion === current.submissionVersion) {
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
            const shouldClearPlayerSession =
              requestedSession.role === 'player' &&
              (response.error.code === 'RECONNECT_FAILED' ||
                response.error.code === 'ROOM_NOT_FOUND' ||
                response.error.code === 'ROOM_EXPIRED');
            if (
              requestedSession.role === 'player' &&
              !shouldClearPlayerSession
            ) {
              setRoomError(response.error);
              return;
            }

            sessionStore.clear(requestedSession);
            sessionRef.current = null;
            setSession(null);
            roomRef.current = null;
            setRoom(null);
            setSubmissionState(null);
            if (requestedSession.role === 'player') {
              setPlayerRecovery({
                roomCode:
                  response.error.code === 'RECONNECT_FAILED'
                    ? requestedSession.roomCode
                    : null,
                displayName: requestedSession.displayName,
                kind:
                  response.error.code === 'RECONNECT_FAILED'
                    ? 'rejoin'
                    : 'find-room',
              });
            }
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
      const activeSession = sessionRef.current;
      const shouldRecoverMissingDisplayRoom =
        currentPath === '/' &&
        activeSession?.role === 'display' &&
        error.code === 'ROOM_NOT_FOUND';

      if (shouldRecoverMissingDisplayRoom) {
        sessionStore.clear(activeSession);
        sessionRef.current = null;
        setSession(null);
        roomRef.current = null;
        setRoom(null);
        setSubmissionState(null);
        setRoomError(null);
        setDisplayStarting(true);
        displayStartupStartedRef.current = true;
        reconnectNeededRef.current = false;
        pendingReconnectRef.current = null;

        cancelDisplayRecovery();
        displayRecoveryTimerRef.current = window.setTimeout(() => {
          displayRecoveryTimerRef.current = null;
          void startDisplay();
        }, displayRoomRecoveryDelayMilliseconds);
        return;
      }

      if (
        currentPath === '/' &&
        error.code === 'ROOM_NOT_FOUND' &&
        displayRecoveryTimerRef.current !== null
      ) {
        return;
      }

      setRoomError(error);

      const sessionWithError = sessionRef.current;
      const shouldClearPlayerSession =
        sessionWithError?.role === 'player' &&
        (error.code === 'RECONNECT_FAILED' ||
          error.code === 'ROOM_NOT_FOUND' ||
          error.code === 'ROOM_EXPIRED');

      if (
        error.code === 'ROOM_EXPIRED' ||
        error.code === 'RECONNECT_FAILED' ||
        shouldClearPlayerSession
      ) {
        sessionStore.clear(sessionWithError);
        sessionRef.current = null;
        setSession(null);
        roomRef.current = null;
        setRoom(null);
        setSubmissionState(null);
        if (sessionWithError?.role === 'player') {
          setPlayerRecovery({
            roomCode:
              error.code === 'RECONNECT_FAILED'
                ? sessionWithError.roomCode
                : null,
            displayName: sessionWithError.displayName,
            kind: error.code === 'RECONNECT_FAILED' ? 'rejoin' : 'find-room',
          });
        }
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
  }, [
    acceptRoomSnapshot,
    cancelDisplayRecovery,
    client,
    currentPath,
    reconnectSession,
    sessionStore,
    startDisplay,
  ]);

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
      cancelDisplayRecovery();
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
  }, [cancelDisplayRecovery, currentPath, startDisplay]);

  useEffect(() => cancelDisplayRecovery, [cancelDisplayRecovery]);

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
    setPlayerRecovery(null);
    setSubmissionState(response.submissionState);
    return null;
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

  const returnToLobby = async (): Promise<RoomError | null> => {
    const actionSession = sessionRef.current;
    const response = await client.returnToLobby();

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
            onTransferController={transferController}
            onUpdateSettings={updateSettings}
            onStartRound={startRound}
            onReturnToLobby={returnToLobby}
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
            key={`${room.code}:${session.role}:${session.role === 'player' ? session.playerId : 'display'}`}
            room={room}
            sessionRole={session.role}
            currentPlayerId={
              session.role === 'player' ? session.playerId : null
            }
            connectionStatus={connectionStatus}
            onTransferController={transferController}
            onUpdateSettings={updateSettings}
            onStartRound={startRound}
            onReturnToLobby={returnToLobby}
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
      const shouldOfferRejoin =
        playerRecovery?.kind === 'rejoin' &&
        playerRecovery.roomCode === routeRoomCode;
      const shouldFindCurrentRoom =
        playerRecovery?.kind === 'find-room' &&
        playerRecovery.displayName.length > 0;
      page = (
        <>
          {shouldOfferRejoin ? null : <LobbyError error={roomError} />}
          <JoinRoomForm
            key={
              shouldOfferRejoin
                ? `rejoin:${routeRoomCode}`
                : shouldFindCurrentRoom
                  ? 'find-current-room'
                  : `join:${routeRoomCode}`
            }
            initialRoomCode={shouldFindCurrentRoom ? undefined : routeRoomCode}
            initialDisplayName={playerRecovery?.displayName}
            recoveryMessage={
              shouldOfferRejoin
                ? 'Your previous connection expired. Rejoin this room when you are ready.'
                : shouldFindCurrentRoom
                  ? 'That room is no longer available. Scan the current TV QR code or enter its current room code.'
                  : undefined
            }
            submitLabel={shouldOfferRejoin ? 'Rejoin' : undefined}
            onJoin={joinPlayer}
          />
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
    <AppShell
      pageClassName={pageClassName}
      phoneConnectionStatus={
        room && session?.role === 'player' ? connectionStatus : null
      }
      displayRoom={room && session?.role === 'display' ? room : null}
      displayConnectionStatus={
        room && session?.role === 'display' ? connectionStatus : null
      }
    >
      {page}
    </AppShell>
  );
}
