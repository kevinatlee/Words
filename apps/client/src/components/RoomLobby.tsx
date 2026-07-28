import { useMemo, useState } from 'react';

import {
  type ConnectionStatus,
  type GridSize,
  type RoomError,
  type RoomState,
  type RoundDurationSeconds,
} from '@words/shared';

import { createDemoBoard } from '../utils/demoBoard';
import { ControllerPanel } from './ControllerPanel';
import { GameSettingsPrototype } from './GameSettingsPrototype';
import { LetterGrid } from './LetterGrid';
import { PlayerList } from './PlayerList';
import { PrototypeNotice } from './PrototypeNotice';
import { RoomCode } from './RoomCode';

type RoomLobbyProps = {
  room: RoomState;
  sessionRole: 'display' | 'player';
  currentPlayerId: string | null;
  connectionStatus: ConnectionStatus;
  onLeave: () => Promise<void>;
  onTransferController: (targetPlayerId: string) => Promise<RoomError | null>;
  onRecoverController: (targetPlayerId: string) => Promise<RoomError | null>;
};

export function RoomLobby({
  room,
  sessionRole,
  currentPlayerId,
  connectionStatus,
  onLeave,
  onTransferController,
  onRecoverController,
}: RoomLobbyProps) {
  const [gridSize, setGridSize] = useState<GridSize>(room.settings.gridSize);
  const [duration, setDuration] = useState<RoundDurationSeconds>(
    room.settings.roundDurationSeconds,
  );
  const currentPlayer = room.players.find(
    (player) => player.id === currentPlayerId,
  );
  const controller = room.players.find(
    (player) => player.id === room.controllerPlayerId,
  );
  const letters = useMemo(() => createDemoBoard(gridSize), [gridSize]);
  const isDisplay = sessionRole === 'display';

  const heading = isDisplay
    ? 'Shared display is ready.'
    : currentPlayer?.isController
      ? 'You’re the game host.'
      : 'You’re in the room.';
  const supportingText = isDisplay
    ? 'Share the code and keep this screen visible while phone players join.'
    : currentPlayer?.isController
      ? 'You play normally and will control lobby settings and round starts in a later stage.'
      : room.controllerStatus === 'recovery-required'
        ? 'Waiting for the Shared Display to assign a new Game Host.'
        : `Waiting with ${controller?.displayName ?? 'the Game Host'} for a future round.`;

  return (
    <div className="room-page">
      <section className="room-intro">
        <div>
          <span className="eyebrow">Live temporary lobby</span>
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
        <button
          className="text-button"
          type="button"
          onClick={() => void onLeave()}
        >
          Leave room
        </button>
      </div>

      <PrototypeNotice>
        The lobby and Game Host assignment are live. Gameplay and round starts
        remain intentionally unavailable in Stage 2.5.
      </PrototypeNotice>

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
              Players open the join page and enter {room.code}. QR joining comes
              in a later stage.
            </p>
          </section>
          <PlayerList
            players={room.players}
            maxPlayers={room.maxPlayers}
            currentPlayerId={currentPlayerId}
          />
          <ControllerPanel
            room={room}
            sessionRole={sessionRole}
            currentPlayerId={currentPlayerId}
            onTransfer={onTransferController}
            onRecover={onRecoverController}
          />
        </div>

        <div className="room-dashboard__preview">
          <GameSettingsPrototype
            gridSize={gridSize}
            duration={duration}
            onGridSizeChange={setGridSize}
            onDurationChange={setDuration}
          />
          <section className="panel board-panel" aria-labelledby="board-title">
            <div className="panel-heading board-panel__heading">
              <div>
                <span className="eyebrow">Future board preview</span>
                <h2 id="board-title">
                  {gridSize} × {gridSize} letter grid
                </h2>
              </div>
              <span className="status-label">Local preview</span>
            </div>
            <LetterGrid
              letters={letters}
              size={gridSize}
              label={`${gridSize} by ${gridSize} demonstration letter grid`}
            />
            <div className="round-action">
              <p>
                The controller will own settings and round starts in a future
                stage.
              </p>
              <button className="button button--primary" type="button" disabled>
                Start Round
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
