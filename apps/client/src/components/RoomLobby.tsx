import { useMemo, useState } from 'react';

import {
  type ConnectionStatus,
  type GridSize,
  type RoomState,
  type RoundDurationSeconds,
} from '@words/shared';

import { createDemoBoard } from '../utils/demoBoard';
import { GameSettingsPrototype } from './GameSettingsPrototype';
import { LetterGrid } from './LetterGrid';
import { PlayerList } from './PlayerList';
import { PrototypeNotice } from './PrototypeNotice';
import { RoomCode } from './RoomCode';

type RoomLobbyProps = {
  room: RoomState;
  currentPlayerId: string;
  connectionStatus: ConnectionStatus;
  onLeave: () => Promise<void>;
};

export function RoomLobby({
  room,
  currentPlayerId,
  connectionStatus,
  onLeave,
}: RoomLobbyProps) {
  const [gridSize, setGridSize] = useState<GridSize>(room.settings.gridSize);
  const [duration, setDuration] = useState<RoundDurationSeconds>(
    room.settings.roundDurationSeconds,
  );
  const currentPlayer = room.players.find(
    (player) => player.id === currentPlayerId,
  );
  const host = room.players.find((player) => player.isHost);
  const letters = useMemo(() => createDemoBoard(gridSize), [gridSize]);

  return (
    <div className="host-page">
      <section className="host-intro">
        <div>
          <span className="eyebrow">Live temporary lobby</span>
          <h1>
            {currentPlayer?.isHost
              ? 'Your room is ready.'
              : 'You’re in the room.'}
          </h1>
          <p>
            {currentPlayer?.isHost
              ? 'Share the code and watch players arrive in real time.'
              : `Waiting with ${host?.displayName ?? 'the host'} for a future round.`}
          </p>
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
        The lobby is live. Settings remain local previews, and starting a round
        is intentionally not implemented in Stage 2.
      </PrototypeNotice>

      <div className="host-dashboard">
        <div className="host-dashboard__lobby">
          <section className="panel share-panel">
            <span className="eyebrow">Invite players</span>
            <h2>Share {room.code}</h2>
            <p>
              Players open the join page and enter this code. QR joining comes
              in a later stage.
            </p>
          </section>
          <PlayerList
            players={room.players}
            maxPlayers={room.maxPlayers}
            currentPlayerId={currentPlayerId}
          />
        </div>

        <div className="host-dashboard__game">
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
              <p>Room settings and round starts are not network actions yet.</p>
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
