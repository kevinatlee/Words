import { useState } from 'react';

import {
  buildJoinUrl,
  type ConnectionStatus,
  type RoomError,
  type RoomSettings,
  type RoomState,
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
}: RoomLobbyProps) {
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<RoomError | null>(null);
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
            />
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
