import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  buildJoinUrl,
  productConfig,
  type ConnectionStatus,
  type RoomError,
  type PlayerRoundSubmissionState,
  type RoomSettings,
  type RoomState,
  type SubmitWordInput,
  type SubmitWordResponse,
} from '@words/shared';

import { useRoundDeadlineReached } from '../useRoundCountdown';
import { createDemoBoard } from '../utils/demoBoard';
import {
  isExpectedSubmissionRejection,
  loadWordEntryMode,
  saveWordEntryMode,
  updateWordPath,
  type WordEntryMode,
} from '../utils/word-entry';
import { ControllerPanel } from './ControllerPanel';
import { GameSettings } from './GameSettings';
import { DisplayJoinBoard } from './DisplayJoinBoard';
import { LetterGrid } from './LetterGrid';
import { PhoneRoundSummary } from './PhoneRoundSummary';
import { PrototypeNotice } from './PrototypeNotice';
import { RoundClock } from './RoundClock';
import { RoundResults } from './RoundResults';

type RoomLobbyProps = {
  room: RoomState;
  sessionRole: 'display' | 'player';
  currentPlayerId: string | null;
  connectionStatus: ConnectionStatus;
  onTransferController: (targetPlayerId: string) => Promise<RoomError | null>;
  onUpdateSettings: (settings: RoomSettings) => Promise<RoomError | null>;
  onStartRound: () => Promise<RoomError | null>;
  submissionState: PlayerRoundSubmissionState | null;
  onSubmitWord: (input: SubmitWordInput) => Promise<SubmitWordResponse>;
};

function formatHighlightNames(
  people: readonly { readonly displayName: string }[],
): string {
  return people.map((person) => person.displayName).join(' & ');
}

export function RoomLobby({
  room,
  sessionRole,
  currentPlayerId,
  connectionStatus,
  onTransferController,
  onUpdateSettings,
  onStartRound,
  onSubmitWord,
}: RoomLobbyProps) {
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<RoomError | null>(null);
  const [selectedPath, setSelectedPath] = useState<number[]>([]);
  const [submissionPending, setSubmissionPending] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(
    null,
  );
  const [acceptedPath, setAcceptedPath] = useState<number[]>([]);
  const activeRoundIdRef = useRef(room.round?.id);
  const selectedPathRef = useRef<number[]>([]);
  const submissionPendingRef = useRef(false);
  const acceptedFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isMountedRef = useRef(true);
  const [entryMode, setEntryMode] = useState<WordEntryMode>(loadWordEntryMode);
  const currentPlayer = room.players.find(
    (player) => player.id === currentPlayerId,
  );
  const isDisplay = sessionRole === 'display';
  const isConnectedController =
    sessionRole === 'player' &&
    connectionStatus === 'connected' &&
    currentPlayer?.connected === true &&
    currentPlayer.id === room.controllerPlayerId;
  const roundIsActive = room.phase === 'ROUND_ACTIVE';
  const roundIsEnded = room.phase === 'ROUND_ENDED';
  const canChangeSettings = isConnectedController && room.phase === 'LOBBY';
  const canStartRound = isConnectedController && room.phase === 'LOBBY';
  const showControllerAdministration =
    isConnectedController && room.phase === 'LOBBY';
  const joinUrl = buildJoinUrl(window.location.origin, room.code);
  const deadlineReached = useRoundDeadlineReached(
    room,
    sessionRole === 'player',
  );
  const roundTiles = room.round?.board.tiles;
  const letters = useMemo(
    () =>
      roundTiles ? [...roundTiles] : createDemoBoard(room.settings.gridSize),
    [roundTiles, room.settings.gridSize],
  );
  const boardSize = room.round?.board.size ?? room.settings.gridSize;
  const isRoundParticipant =
    currentPlayerId !== null &&
    room.round?.participants.some(
      (participant) => participant.playerId === currentPlayerId,
    );
  const canBuildWord =
    sessionRole === 'player' &&
    roundIsActive &&
    isRoundParticipant &&
    connectionStatus === 'connected' &&
    currentPlayer?.connected === true &&
    !deadlineReached;
  const candidateWord = selectedPath
    .map((tileIndex) => letters[tileIndex] ?? '')
    .join('');

  const clearSelectedPath = useCallback(() => {
    selectedPathRef.current = [];
    setSelectedPath((current) => (current.length === 0 ? current : []));
  }, []);

  const clearAcceptedFeedback = useCallback(() => {
    if (acceptedFeedbackTimerRef.current !== null) {
      clearTimeout(acceptedFeedbackTimerRef.current);
      acceptedFeedbackTimerRef.current = null;
    }
    if (isMountedRef.current) {
      setAcceptedPath((current) => (current.length === 0 ? current : []));
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearAcceptedFeedback();
    };
  }, [clearAcceptedFeedback]);

  useEffect(() => {
    activeRoundIdRef.current = room.round?.id;
    submissionPendingRef.current = false;
    // The server changed the input scope, so its client-only pending state is obsolete.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubmissionPending(false);
    clearSelectedPath();
    clearAcceptedFeedback();
    setSubmissionMessage(null);
  }, [clearAcceptedFeedback, clearSelectedPath, room.phase, room.round?.id]);

  const selectTile = useCallback(
    (tileIndex: number) => {
      if (!canBuildWord || submissionPendingRef.current) {
        return selectedPathRef.current;
      }
      clearAcceptedFeedback();
      setSubmissionMessage(null);
      const update = updateWordPath(
        selectedPathRef.current,
        tileIndex,
        letters,
        boardSize,
        productConfig.maximumSubmittedWordLength,
      );
      if (update.exceededMaximumLength) {
        setSubmissionMessage(
          `Words can contain at most ${productConfig.maximumSubmittedWordLength} letters.`,
        );
        return selectedPathRef.current;
      }
      if (
        update.path.length === selectedPathRef.current.length &&
        update.path.every(
          (index, order) => index === selectedPathRef.current[order],
        )
      ) {
        return selectedPathRef.current;
      }
      selectedPathRef.current = update.path;
      setSelectedPath(update.path);
      return update.path;
    },
    [boardSize, canBuildWord, clearAcceptedFeedback, letters],
  );

  const selectEntryMode = (mode: WordEntryMode) => {
    if (mode === entryMode) {
      return;
    }
    saveWordEntryMode(mode);
    setEntryMode(mode);
    clearSelectedPath();
    clearAcceptedFeedback();
    setSubmissionMessage(null);
  };

  const submitSelection = useCallback(async () => {
    const roundId = room.round?.id;
    const path = selectedPathRef.current;
    const word = path.map((tileIndex) => letters[tileIndex] ?? '').join('');
    if (
      !canBuildWord ||
      submissionPendingRef.current ||
      !roundId ||
      path.length === 0
    ) {
      return;
    }
    submissionPendingRef.current = true;
    setSubmissionPending(true);
    setSubmissionMessage(null);
    try {
      const response = await onSubmitWord({
        roundId,
        word,
        path: [...path],
      });
      if (!isMountedRef.current || activeRoundIdRef.current !== roundId) {
        return;
      }
      if (response.ok) {
        clearSelectedPath();
        clearAcceptedFeedback();
        setAcceptedPath([...path]);
        acceptedFeedbackTimerRef.current = setTimeout(
          clearAcceptedFeedback,
          500,
        );
        setSubmissionMessage(
          `${response.acceptedWord.word} accepted for ${response.acceptedWord.points} ${response.acceptedWord.points === 1 ? 'point' : 'points'}.`,
        );
      } else if (isExpectedSubmissionRejection(response.error.code)) {
        clearSelectedPath();
        setSubmissionMessage(response.error.message);
      } else {
        setSubmissionMessage('Could not submit that word. Try again.');
      }
    } catch {
      if (isMountedRef.current && activeRoundIdRef.current === roundId) {
        setSubmissionMessage('Could not submit that word. Try again.');
      }
    } finally {
      if (isMountedRef.current && activeRoundIdRef.current === roundId) {
        submissionPendingRef.current = false;
        setSubmissionPending(false);
      }
    }
  }, [
    canBuildWord,
    clearAcceptedFeedback,
    clearSelectedPath,
    letters,
    onSubmitWord,
    room.round?.id,
  ]);

  const cancelTrace = useCallback(() => {
    clearSelectedPath();
    setSubmissionMessage(null);
  }, [clearSelectedPath]);

  const submitTrace = useCallback(() => {
    void submitSelection();
  }, [submitSelection]);

  const runSettingsUpdate = async (settings: RoomSettings) => {
    if (!canChangeSettings || actionPending) {
      return;
    }
    setActionPending(true);
    setActionError(null);
    const error = await onUpdateSettings(settings);
    setActionError(error);
    setActionPending(false);
  };

  const runStartRound = async () => {
    if (!canStartRound || actionPending) {
      return;
    }
    setActionPending(true);
    setActionError(null);
    const error = await onStartRound();
    setActionError(error);
    setActionPending(false);
  };

  if (isDisplay) {
    const currentPlayerIds = new Set(room.players.map((player) => player.id));
    const visiblePlayers = [
      ...room.players,
      ...(roundIsActive
        ? (room.round?.participants ?? [])
            .filter(
              (participant) => !currentPlayerIds.has(participant.playerId),
            )
            .map((participant) => ({
              id: participant.playerId,
              displayName: participant.displayName,
              connected: false,
              joinedAt: room.round?.startedAt ?? room.createdAt,
              isController: false,
            }))
        : []),
    ];
    const controller = visiblePlayers.find(
      (player) => player.id === room.controllerPlayerId,
    );
    const orderedPlayers = [
      ...(controller ? [controller] : []),
      ...visiblePlayers.filter(
        (player) => player.id !== controller?.id && player.connected,
      ),
      ...visiblePlayers.filter(
        (player) => player.id !== controller?.id && !player.connected,
      ),
    ];
    const lastRound = room.highlights.lastRound;
    const roomRecord = room.highlights.roomRecord;
    const acceptedCounts = new Map(
      room.round?.acceptedWordCounts.map((entry) => [
        entry.playerId,
        entry.count,
      ]) ?? [],
    );

    return (
      <div className="room-page display-room-page">
        {roundIsEnded && room.round?.results ? (
          <RoundResults results={room.round.results} />
        ) : (
          <div className="display-room-layout">
            <aside
              className="panel display-side-panel"
              aria-labelledby="display-players-title"
            >
              <h2 id="display-players-title">Players</h2>
              {orderedPlayers.length === 0 ? (
                <p>No players connected</p>
              ) : (
                <ol className="display-player-list">
                  {orderedPlayers.map((player) => (
                    <li
                      className={
                        !player.connected
                          ? 'display-player-list__item--offline'
                          : ''
                      }
                      key={player.id}
                    >
                      <span className="display-player-list__primary">
                        <span
                          className="display-player-list__name"
                          title={player.displayName}
                        >
                          {player.id === controller?.id && (
                            <span aria-label="Game Host">♛ </span>
                          )}
                          {player.displayName}
                        </span>
                        {roundIsActive && (
                          <span
                            className="display-player-list__count"
                            aria-label={
                              acceptedCounts.has(player.id)
                                ? `${acceptedCounts.get(player.id)} accepted ${acceptedCounts.get(player.id) === 1 ? 'word' : 'words'}`
                                : 'Waiting for next round'
                            }
                          >
                            {acceptedCounts.get(player.id) ?? '—'}
                          </span>
                        )}
                      </span>
                      <small>
                        {player.connected
                          ? 'Connected'
                          : 'Recently disconnected'}
                      </small>
                    </li>
                  ))}
                </ol>
              )}
            </aside>
            <section
              className={`panel display-puzzle-panel${roundIsActive ? ' display-puzzle-panel--active' : ''}`}
              aria-label="Puzzle"
            >
              {roundIsActive && room.round ? (
                <LetterGrid
                  letters={[...room.round.board.tiles]}
                  size={room.round.board.size}
                  label={`${room.round.board.size} by ${room.round.board.size} official letter grid`}
                  selectedIndices={[]}
                  interactive={false}
                  disabled
                  onSelect={() => undefined}
                  entryMode="touch"
                  traceResetKey={room.round.id}
                />
              ) : (
                <DisplayJoinBoard joinUrl={joinUrl} />
              )}
            </section>
            <aside
              className="panel display-side-panel"
              aria-labelledby="display-highlights-title"
            >
              {roundIsActive && (
                <RoundClock room={room} presentation="display" />
              )}
              <h2 id="display-highlights-title">Room Highlights</h2>
              <section>
                <h3>Last Round</h3>
                {lastRound === null ? (
                  <p>No scoring rounds yet</p>
                ) : lastRound.winners.length === 0 ? (
                  <p>No scoring winner</p>
                ) : (
                  <p>
                    <strong>{formatHighlightNames(lastRound.winners)}</strong>
                    <br />
                    {lastRound.winningScore} points
                  </p>
                )}
              </section>
              <section>
                <h3>Room Record</h3>
                {roomRecord === null ? (
                  <p>No room record yet</p>
                ) : (
                  <p>
                    <strong>{formatHighlightNames(roomRecord.holders)}</strong>
                    <br />
                    {roomRecord.score} points
                  </p>
                )}
              </section>
            </aside>
          </div>
        )}
        <footer className="display-room-footer">
          <a
            className="display-room-footer__link"
            href={joinUrl}
            target="_blank"
            rel="noreferrer"
          >
            {joinUrl}
          </a>
        </footer>
      </div>
    );
  }

  return (
    <div className={`room-page${isDisplay ? '' : ' room-page--phone'}`}>
      {actionError && (
        <p className="form-error" role="alert">
          {actionError.message}
        </p>
      )}
      {!isDisplay &&
        sessionRole === 'player' &&
        connectionStatus === 'connected' &&
        currentPlayer?.connected === true &&
        document.getElementById('phone-entry-mode-slot') &&
        createPortal(
          <div
            className="word-entry__mode"
            role="group"
            aria-label="Word entry mode"
          >
            <button
              className="button button--secondary"
              type="button"
              aria-pressed={entryMode === 'touch'}
              onClick={() => selectEntryMode('touch')}
            >
              Tap
            </button>
            <button
              className="button button--secondary"
              type="button"
              aria-pressed={entryMode === 'trace'}
              onClick={() => selectEntryMode('trace')}
            >
              Trace
            </button>
          </div>,
          document.getElementById('phone-entry-mode-slot')!,
        )}

      <div
        className={`room-dashboard${isDisplay ? '' : ' room-dashboard--phone'}`}
      >
        <div className="room-dashboard__preview">
          <section
            className="panel board-panel"
            aria-labelledby={isDisplay ? 'board-title' : undefined}
            aria-label={
              isDisplay ? undefined : roundIsEnded ? 'Round summary' : 'Puzzle'
            }
            data-round-id={room.round?.id}
            data-round-deadline-at={room.round?.deadlineAt}
          >
            {roundIsEnded ? (
              <PhoneRoundSummary
                results={room.round?.results ?? null}
                currentPlayerId={currentPlayerId}
              />
            ) : (
              <>
                {room.round && <RoundClock room={room} presentation="phone" />}
                <LetterGrid
                  letters={letters}
                  size={boardSize}
                  label={`${boardSize} by ${boardSize} ${room.round ? 'official' : 'demonstration'} letter grid`}
                  selectedIndices={selectedPath}
                  acceptedIndices={
                    sessionRole === 'player' &&
                    roundIsActive &&
                    isRoundParticipant
                      ? acceptedPath
                      : []
                  }
                  interactive={
                    sessionRole === 'player' &&
                    roundIsActive &&
                    Boolean(isRoundParticipant)
                  }
                  disabled={!canBuildWord || submissionPending}
                  onSelect={selectTile}
                  entryMode={entryMode}
                  traceResetKey={`${room.round?.id ?? 'no-round'}:${room.phase}:${entryMode}`}
                  onTraceStart={selectTile}
                  onTraceMove={selectTile}
                  onTraceEnd={submitTrace}
                  onTraceCancel={cancelTrace}
                />
                {roundIsActive && !isDisplay && !isRoundParticipant && (
                  <PrototypeNotice
                    title="Waiting this round."
                    ariaLabel="Round participation status"
                  >
                    You joined after this round began. You can watch this board
                    and will join the next round.
                  </PrototypeNotice>
                )}
                {sessionRole === 'player' &&
                  roundIsActive &&
                  isRoundParticipant && (
                    <section
                      className="word-entry"
                      aria-labelledby="word-entry-title"
                    >
                      <div className="word-entry__content">
                        <span className="eyebrow">Your Word</span>
                        <h3 id="word-entry-title">
                          {candidateWord || 'Select adjacent tiles'}
                        </h3>
                      </div>
                      <p
                        className="word-entry__message"
                        role="status"
                        aria-live={submissionMessage ? 'polite' : 'off'}
                      >
                        {submissionMessage}
                      </p>
                      <div className="word-entry__actions">
                        <button
                          className="button button--primary"
                          type="button"
                          disabled={
                            !canBuildWord ||
                            submissionPending ||
                            selectedPath.length === 0
                          }
                          onClick={() => void submitSelection()}
                        >
                          {submissionPending ? 'Checking…' : 'Submit'}
                        </button>
                      </div>
                    </section>
                  )}
              </>
            )}
          </section>
          {isConnectedController && room.phase === 'LOBBY' && (
            <div className="round-action">
              {
                <button
                  className="button button--primary"
                  type="button"
                  disabled={!canStartRound || actionPending}
                  onClick={() => void runStartRound()}
                >
                  {actionPending ? 'Working…' : 'Start Round'}
                </button>
              }
            </div>
          )}
          {showControllerAdministration && (
            <GameSettings
              settings={room.settings}
              disabled={!canChangeSettings || actionPending}
              pending={actionPending}
              onChange={(settings) => void runSettingsUpdate(settings)}
            />
          )}
          {showControllerAdministration && (
            <ControllerPanel
              room={room}
              currentPlayerId={currentPlayerId}
              onTransfer={onTransferController}
            />
          )}
        </div>
      </div>
    </div>
  );
}
