import { useMemo, useState } from 'react';
import {
  productConfig,
  type GridSize,
  type RoundDurationSeconds,
} from '@words/shared';

import { createDemoBoard } from '../utils/demoBoard';
import { GameSettingsPrototype } from './GameSettingsPrototype';
import { HostTransferPrototype } from './HostTransferPrototype';
import { LetterGrid } from './LetterGrid';
import { PlayerList } from './PlayerList';
import { PrototypeNotice } from './PrototypeNotice';
import { QrPlaceholder } from './QrPlaceholder';
import { RoomCode } from './RoomCode';

export function HostLobbyPrototype() {
  const [gridSize, setGridSize] = useState<GridSize>(
    productConfig.defaultGridSize,
  );
  const [duration, setDuration] = useState<RoundDurationSeconds>(
    productConfig.defaultRoundDurationSeconds,
  );
  const letters = useMemo(() => createDemoBoard(gridSize), [gridSize]);

  return (
    <div className="host-page">
      <section className="host-intro">
        <div>
          <span className="eyebrow">Shared-screen preview</span>
          <h1>Set the table for a round.</h1>
          <p>
            Invite the room, choose the pace, and let everyone see the same
            board.
          </p>
        </div>
        <RoomCode code="MINT 42" />
      </section>

      <PrototypeNotice>
        Multiplayer, QR joining, starting rounds, and host delegation are not
        connected yet. Settings below only change this browser preview.
      </PrototypeNotice>

      <div className="host-dashboard">
        <div className="host-dashboard__lobby">
          <QrPlaceholder />
          <PlayerList />
          <HostTransferPrototype />
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
                <span className="eyebrow">Board preview</span>
                <h2 id="board-title">
                  {gridSize} × {gridSize} letter grid
                </h2>
              </div>
              <span className="status-label">Mock letters</span>
            </div>
            <LetterGrid
              letters={letters}
              size={gridSize}
              label={`${gridSize} by ${gridSize} demonstration letter grid`}
            />
            <div className="round-action">
              <p>Waiting for a real-time server connection.</p>
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
