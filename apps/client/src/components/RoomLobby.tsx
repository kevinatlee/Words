import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

import { useRoundCountdown } from '../useRoundCountdown';
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
import { JoinQrCode } from './JoinQrCode';
import { LetterGrid } from './LetterGrid';
import { PlayerList } from './PlayerList';
import { PrototypeNotice } from './PrototypeNotice';
import { RoomCode } from './RoomCode';
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
  const activeRoundIdRef = useRef(room.round?.id);
  const selectedPathRef = useRef<number[]>([]);
  const submissionPendingRef = useRef(false);
  const [entryMode, setEntryMode] = useState<WordEntryMode>(loadWordEntryMode);
  const currentPlayer = room.players.find(
    (player) => player.id === currentPlayerId,
  );
  const controller = room.players.find(
    (player) => player.id === room.controllerPlayerId,
  );
  const isDisplay = sessionRole === 'display';
  const isConnectedController =
    sessionRole === 'player' &&
    connectionStatus === 'connected' &&
    currentPlayer?.connected === true &&
    currentPlayer.id === room.controllerPlayerId;
  const roundIsActive = room.phase === 'ROUND_ACTIVE';
  const roundIsEnded = room.phase === 'ROUND_ENDED';
  const canChangeSettings = isConnectedController && !roundIsActive;
  const canStartRound = isConnectedController && !roundIsActive;
  const showControllerAdministration = isConnectedController && !roundIsActive;
  const joinUrl = buildJoinUrl(window.location.origin, room.code);
  const joinQrContext = roundIsActive
    ? 'active-round'
    : roundIsEnded
      ? 'ended-round'
      : 'lobby';
  const countdownMs = useRoundCountdown(room);
  const letters = useMemo(
    () =>
      room.round
        ? [...room.round.board.tiles]
        : createDemoBoard(room.settings.gridSize),
    [room.round, room.settings.gridSize],
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
    (countdownMs ?? 0) > 0;
  const candidateWord = selectedPath
    .map((tileIndex) => letters[tileIndex] ?? '')
    .join('');

  const clearSelectedPath = useCallback(() => {
    selectedPathRef.current = [];
    setSelectedPath([]);
  }, []);

  useEffect(() => {
    activeRoundIdRef.current = room.round?.id;
    submissionPendingRef.current = false;
    // The server changed the input scope, so its client-only pending state is obsolete.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubmissionPending(false);
    clearSelectedPath();
    setSubmissionMessage(null);
  }, [clearSelectedPath, room.phase, room.round?.id]);

  const selectTile = useCallback(
    (tileIndex: number) => {
      if (!canBuildWord || submissionPendingRef.current) {
        return selectedPathRef.current;
      }
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
      selectedPathRef.current = update.path;
      setSelectedPath(update.path);
      return update.path;
    },
    [boardSize, canBuildWord, letters],
  );

  const selectEntryMode = (mode: WordEntryMode) => {
    if (mode === entryMode) {
      return;
    }
    saveWordEntryMode(mode);
    setEntryMode(mode);
    clearSelectedPath();
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
      if (activeRoundIdRef.current !== roundId) {
        return;
      }
      if (response.ok) {
        clearSelectedPath();
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
      if (activeRoundIdRef.current === roundId) {
        setSubmissionMessage('Could not submit that word. Try again.');
      }
    } finally {
      if (activeRoundIdRef.current === roundId) {
        submissionPendingRef.current = false;
        setSubmissionPending(false);
      }
    }
  }, [canBuildWord, clearSelectedPath, letters, onSubmitWord, room.round?.id]);

  const cancelTrace = useCallback(() => {
    clearSelectedPath();
    setSubmissionMessage(null);
  }, [clearSelectedPath]);

  const submitTrace = useCallback(() => {
    void submitSelection();
  }, [submitSelection]);

  const heading = isDisplay
    ? roundIsActive
      ? `Round ${room.round?.number ?? ''} is live.`
      : roundIsEnded
        ? `Round ${room.round?.number ?? ''} results.`
        : 'Shared display is ready.'
    : currentPlayer?.isController
      ? 'You’re the game host.'
      : 'You’re in the room.';
  const supportingText = isDisplay
    ? roundIsActive
      ? 'The server owns this board and the official round deadline.'
      : roundIsEnded
        ? 'Final results are shared with everyone in this room.'
        : 'Share the code and keep this screen visible while phone players join.'
    : currentPlayer?.isController
      ? roundIsActive
        ? 'Play normally. Settings and another start unlock after the official deadline.'
        : 'Choose the next round settings, start it, and play normally.'
      : `Waiting with ${controller?.displayName ?? 'the next Game Host'}.`;

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

  return (
    <div className={`room-page${isDisplay ? '' : ' room-page--phone'}`}>
      {isDisplay && (
        <section className="room-intro">
          <div>
            <span className="eyebrow">Live temporary room</span>
            <h1>{heading}</h1>
            <p>{supportingText}</p>
          </div>
          <RoomCode code={room.code} />
        </section>
      )}

      {isDisplay && (
        <div className="lobby-toolbar">
          <span
            className={`connection-status connection-status--${connectionStatus}`}
          >
            {connectionStatus === 'connected'
              ? 'Connected'
              : connectionStatus === 'connecting'
                ? 'Reconnecting…'
                : 'Disconnected'}
          </span>
          <span className="status-label">
            {room.phase === 'LOBBY'
              ? 'Lobby'
              : room.phase === 'ROUND_ACTIVE'
                ? 'Round active'
                : 'Round ended'}
          </span>
        </div>
      )}

      {actionError && (
        <p className="form-error" role="alert">
          {actionError.message}
        </p>
      )}

      <div
        className={`room-dashboard${isDisplay ? '' : ' room-dashboard--phone'}`}
      >
        {isDisplay && (
          <div className="room-dashboard__lobby">
            <section className="panel share-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Display session</span>
                  <h2>Shared screen</h2>
                </div>
                <span
                  className={`status-label${room.display.connected ? ' status-label--display' : ''}`}
                >
                  {room.display.connected
                    ? 'Display connected'
                    : 'Display offline'}
                </span>
              </div>
              {isDisplay ? (
                <p>
                  This shared screen presents the room while phone players join
                  and play.
                </p>
              ) : (
                <p>
                  Players can open{' '}
                  <a className="join-url" href={joinUrl}>
                    {joinUrl}
                  </a>{' '}
                  to join this room.
                </p>
              )}
            </section>
            {isDisplay && (
              <JoinQrCode
                joinUrl={joinUrl}
                roomCode={room.code}
                presentation={roundIsActive ? 'compact' : 'prominent'}
                context={joinQrContext}
              />
            )}
            <PlayerList
              players={room.players}
              maxPlayers={room.maxPlayers}
              currentPlayerId={currentPlayerId}
            />
            {showControllerAdministration && (
              <ControllerPanel
                room={room}
                currentPlayerId={currentPlayerId}
                onTransfer={onTransferController}
              />
            )}
          </div>
        )}

        <div className="room-dashboard__preview">
          {isDisplay && showControllerAdministration && (
            <GameSettings
              settings={room.settings}
              disabled={!canChangeSettings || actionPending}
              pending={actionPending}
              canEdit={canChangeSettings}
              onChange={(settings) => void runSettingsUpdate(settings)}
            />
          )}
          <section
            className="panel board-panel"
            aria-labelledby={isDisplay ? 'board-title' : undefined}
            aria-label={isDisplay ? undefined : 'Puzzle'}
            data-round-id={room.round?.id}
            data-round-deadline-at={room.round?.deadlineAt}
          >
            {isDisplay && (
              <div className="panel-heading board-panel__heading">
                <div>
                  <span className="eyebrow">
                    {room.round
                      ? `Round ${room.round.number}`
                      : 'Layout preview'}
                  </span>
                  <h2 id="board-title">{`${boardSize} × ${boardSize} letter grid`}</h2>
                </div>
                <span
                  className={`status-label${room.round ? ' status-label--display' : ''}`}
                >
                  {room.round ? 'Official board' : 'Non-official preview'}
                </span>
              </div>
            )}
            {room.round && (
              <div
                className={`round-clock${isDisplay ? '' : ' round-clock--phone'}`}
                role="timer"
                aria-live={roundIsActive ? 'off' : 'polite'}
              >
                <small>
                  {room.phase === 'ROUND_ACTIVE'
                    ? isDisplay
                      ? 'Authoritative time remaining'
                      : 'Timer'
                    : 'Round complete'}
                </small>
                <strong>{Math.ceil((countdownMs ?? 0) / 1_000)} seconds</strong>
              </div>
            )}
            <LetterGrid
              letters={letters}
              size={boardSize}
              label={`${boardSize} by ${boardSize} ${room.round ? 'official' : 'demonstration'} letter grid`}
              selectedIndices={selectedPath}
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
                You joined after this round began. You can watch this board and
                will join the next round.
              </PrototypeNotice>
            )}
            {sessionRole === 'player' &&
              roundIsActive &&
              isRoundParticipant && (
                <section
                  className="word-entry"
                  aria-labelledby="word-entry-title"
                >
                  <div>
                    <span className="eyebrow">Your word</span>
                    <h3 id="word-entry-title">
                      {candidateWord || 'Select adjacent tiles'}
                    </h3>
                  </div>
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
                  {submissionMessage && (
                    <p className="word-entry__message" role="status">
                      {submissionMessage}
                    </p>
                  )}
                </section>
              )}
            {isDisplay && roundIsEnded && room.round?.results && (
              <RoundResults
                roundNumber={room.round.number}
                results={room.round.results}
                currentPlayerId={currentPlayerId}
                isDisplay={isDisplay}
              />
            )}
            {!isDisplay &&
              !roundIsActive &&
              !roundIsEnded &&
              !isConnectedController && (
                <p className="phone-round-message" role="status">
                  Waiting for the game host to start the round.
                </p>
              )}
            {(isDisplay || (isConnectedController && !roundIsActive)) && (
              <div className="round-action">
                {isDisplay && (
                  <p>
                    {roundIsActive
                      ? `${room.round?.participants.length ?? 0} players were present when this round started.`
                      : `Next round: ${room.settings.roundDurationSeconds} seconds with a server-owned board.`}
                  </p>
                )}
                {(isDisplay
                  ? !roundIsEnded || isConnectedController
                  : true) && (
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={!canStartRound || actionPending}
                    onClick={() => void runStartRound()}
                  >
                    {actionPending
                      ? 'Working…'
                      : room.phase === 'ROUND_ENDED'
                        ? 'Start Next Round'
                        : 'Start Round'}
                  </button>
                )}
              </div>
            )}
          </section>
          {!isDisplay && roundIsActive && isRoundParticipant && (
            <section
              className="panel word-entry-mode-panel"
              aria-label="Word entry mode"
            >
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
              </div>
            </section>
          )}
          {!isDisplay && showControllerAdministration && (
            <GameSettings
              settings={room.settings}
              disabled={!canChangeSettings || actionPending}
              pending={actionPending}
              canEdit={canChangeSettings}
              onChange={(settings) => void runSettingsUpdate(settings)}
            />
          )}
          {!isDisplay && showControllerAdministration && (
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
