import { useRef, useState } from 'react';

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
import { ControllerPanel } from './ControllerPanel';
import { GameSettings } from './GameSettings';
import { LetterGrid } from './LetterGrid';
import { PlayerList } from './PlayerList';
import { PrototypeNotice } from './PrototypeNotice';
import { RoomCode } from './RoomCode';

const placeholderCells = Array.from(
  { length: 49 },
  (_, index) =>
    index % 3 === 0 ||
    index % 7 === 0 ||
    (index > 8 && index < 20 && index % 2 === 0),
);

type RoomLobbyProps = {
  room: RoomState;
  sessionRole: 'display' | 'player';
  currentPlayerId: string | null;
  connectionStatus: ConnectionStatus;
  onLeave: () => Promise<void>;
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
  onLeave,
  onTransferController,
  onUpdateSettings,
  onStartRound,
  submissionState,
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
  const canChangeSettings = isConnectedController && !roundIsActive;
  const canStartRound = isConnectedController && !roundIsActive;
  const joinUrl = buildJoinUrl(window.location.origin, room.code);
  const countdownMs = useRoundCountdown(room);
  const letters = room.round
    ? [...room.round.board.tiles]
    : createDemoBoard(room.settings.gridSize);
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

  const selectTile = (tileIndex: number) => {
    if (!canBuildWord || submissionPending) {
      return;
    }
    setSubmissionMessage(null);
    if (
      candidateWord.length + (letters[tileIndex]?.length ?? 0) >
      productConfig.maximumSubmittedWordLength
    ) {
      setSubmissionMessage(
        `Words can contain at most ${productConfig.maximumSubmittedWordLength} letters.`,
      );
      return;
    }
    setSelectedPath((current) => {
      if (current.includes(tileIndex)) {
        return current;
      }
      const previous = current.at(-1);
      if (previous !== undefined) {
        const previousRow = Math.floor(previous / boardSize);
        const previousColumn = previous % boardSize;
        const nextRow = Math.floor(tileIndex / boardSize);
        const nextColumn = tileIndex % boardSize;
        if (
          Math.abs(previousRow - nextRow) > 1 ||
          Math.abs(previousColumn - nextColumn) > 1
        ) {
          return current;
        }
      }
      return [...current, tileIndex];
    });
  };

  const submitSelection = async () => {
    const roundId = room.round?.id;
    if (
      !canBuildWord ||
      submissionPending ||
      !roundId ||
      selectedPath.length === 0
    ) {
      return;
    }
    setSubmissionPending(true);
    setSubmissionMessage(null);
    try {
      const response = await onSubmitWord({
        roundId,
        word: candidateWord,
        path: [...selectedPath],
      });
      if (activeRoundIdRef.current !== roundId) {
        return;
      }
      if (response.ok) {
        setSelectedPath([]);
        setSubmissionMessage(
          `${response.acceptedWord.word} accepted for ${response.acceptedWord.points} ${response.acceptedWord.points === 1 ? 'point' : 'points'}.`,
        );
      } else {
        setSubmissionMessage(response.error.message);
      }
    } catch {
      if (activeRoundIdRef.current === roundId) {
        setSubmissionMessage(
          'That word could not be checked. Your selection is still here.',
        );
      }
    } finally {
      if (activeRoundIdRef.current === roundId) {
        setSubmissionPending(false);
      }
    }
  };

  const heading = isDisplay
    ? roundIsActive
      ? `Round ${room.round?.number ?? ''} is live.`
      : 'Shared display is ready.'
    : currentPlayer?.isController
      ? 'You’re the game host.'
      : 'You’re in the room.';
  const supportingText = isDisplay
    ? roundIsActive
      ? 'The server owns this board and the official round deadline.'
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
    <div className="room-page">
      <section className="room-intro">
        <div>
          <span className="eyebrow">Live temporary room</span>
          <h1>{heading}</h1>
          <p>{supportingText}</p>
        </div>
        <RoomCode code={room.code} />
      </section>

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
        {!isDisplay && (
          <button
            className="text-button"
            type="button"
            onClick={() => void onLeave()}
          >
            Leave room
          </button>
        )}
      </div>

      {roundIsActive && !isDisplay && !isRoundParticipant && (
        <PrototypeNotice
          title="Waiting this round."
          ariaLabel="Round participation status"
        >
          You joined after this round began. You can watch this board and will
          join the next round.
        </PrototypeNotice>
      )}
      {actionError && (
        <p className="form-error" role="alert">
          {actionError.message}
        </p>
      )}

      <div className="room-dashboard">
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
            <p>
              Players can open{' '}
              <a className="join-url" href={joinUrl}>
                {joinUrl}
              </a>{' '}
              to join this room.
            </p>
          </section>
          {isDisplay && (
            <section
              className="qr-placeholder"
              aria-label="QR code placeholder"
            >
              <span className="qr-placeholder__pattern" aria-hidden="true">
                {placeholderCells.map((filled, index) => (
                  <span
                    className={
                      filled ? 'qr-placeholder__cell--filled' : undefined
                    }
                    key={index}
                  />
                ))}
              </span>
              <strong>Scan-to-join area</strong>
              <small>
                The exact join link is ready. A scannable QR image remains
                outside this stage.
              </small>
            </section>
          )}
          <PlayerList
            players={room.players}
            maxPlayers={room.maxPlayers}
            currentPlayerId={currentPlayerId}
          />
          <ControllerPanel
            room={room}
            currentPlayerId={currentPlayerId}
            onTransfer={onTransferController}
          />
        </div>

        <div className="room-dashboard__preview">
          <GameSettings
            settings={room.settings}
            disabled={!canChangeSettings || actionPending}
            pending={actionPending}
            canEdit={canChangeSettings}
            onChange={(settings) => void runSettingsUpdate(settings)}
          />
          <section
            className="panel board-panel"
            aria-labelledby="board-title"
            data-round-id={room.round?.id}
            data-round-deadline-at={room.round?.deadlineAt}
          >
            <div className="panel-heading board-panel__heading">
              <div>
                <span className="eyebrow">
                  {room.round ? `Round ${room.round.number}` : 'Layout preview'}
                </span>
                <h2 id="board-title">
                  {boardSize} × {boardSize} letter grid
                </h2>
              </div>
              <span
                className={`status-label${room.round ? ' status-label--display' : ''}`}
              >
                {room.round ? 'Official board' : 'Non-official preview'}
              </span>
            </div>
            {room.round && (
              <div
                className="round-clock"
                role="timer"
                aria-live={roundIsActive ? 'off' : 'polite'}
              >
                <small>
                  {room.phase === 'ROUND_ACTIVE'
                    ? 'Authoritative time remaining'
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
            />
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
                      className="button button--secondary"
                      type="button"
                      disabled={
                        !canBuildWord ||
                        submissionPending ||
                        selectedPath.length === 0
                      }
                      onClick={() =>
                        setSelectedPath((current) => current.slice(0, -1))
                      }
                    >
                      Undo
                    </button>
                    <button
                      className="button button--secondary"
                      type="button"
                      disabled={
                        !canBuildWord ||
                        submissionPending ||
                        selectedPath.length === 0
                      }
                      onClick={() => setSelectedPath([])}
                    >
                      Clear
                    </button>
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
                      {submissionPending ? 'Checking…' : 'Submit Word'}
                    </button>
                  </div>
                  {submissionMessage && (
                    <p className="word-entry__message" role="status">
                      {submissionMessage}
                    </p>
                  )}
                </section>
              )}
            {sessionRole === 'player' && submissionState && (
              <section
                className="personal-score"
                aria-labelledby="personal-score-title"
              >
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">Private round progress</span>
                    <h3 id="personal-score-title">Your accepted words</h3>
                  </div>
                  <strong>
                    Provisional points: {submissionState.provisionalScore}
                  </strong>
                </div>
                {submissionState.acceptedWords.length === 0 ? (
                  <p>No accepted words yet.</p>
                ) : (
                  <ol className="accepted-word-list">
                    {submissionState.acceptedWords.map((acceptedWord) => (
                      <li key={acceptedWord.sequence}>
                        <span>{acceptedWord.word}</span>
                        <strong>+{acceptedWord.points}</strong>
                      </li>
                    ))}
                  </ol>
                )}
                <small>
                  Shared-word reconciliation is not implemented yet.
                </small>
              </section>
            )}
            <div className="round-action">
              <p>
                {roundIsActive
                  ? `${room.round?.participants.length ?? 0} players were present when this round started.`
                  : `Next round: ${room.settings.roundDurationSeconds} seconds with a server-owned board.`}
              </p>
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
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
