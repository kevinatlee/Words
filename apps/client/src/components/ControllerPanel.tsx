import { useState } from 'react';

import type { RoomError, RoomState } from '@words/shared';

import { LobbyError } from './LobbyError';

type ControllerPanelProps = {
  room: RoomState;
  currentPlayerId: string | null;
  onTransfer: (targetPlayerId: string) => Promise<RoomError | null>;
};

export function ControllerPanel({
  room,
  currentPlayerId,
  onTransfer,
}: ControllerPanelProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [actionError, setActionError] = useState<RoomError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const controller = room.players.find(
    (player) => player.id === room.controllerPlayerId,
  );
  const currentPlayer = room.players.find(
    (player) => player.id === currentPlayerId,
  );
  const canTransfer =
    room.controllerStatus === 'assigned' &&
    currentPlayer?.id === room.controllerPlayerId;
  const eligiblePlayers = room.players.filter(
    (player) => player.connected && player.id !== room.controllerPlayerId,
  );
  const targetPlayerId = eligiblePlayers.some(
    (player) => player.id === selectedPlayerId,
  )
    ? selectedPlayerId
    : (eligiblePlayers[0]?.id ?? '');
  const targetPlayer = eligiblePlayers.find(
    (player) => player.id === targetPlayerId,
  );

  const statusLabel =
    room.controllerStatus === 'none'
      ? room.players.length === 0
        ? 'Awaiting first player'
        : 'Selecting automatically'
      : controller?.connected
        ? 'Game Host online'
        : 'Game Host offline';

  const statusMessage =
    room.controllerStatus === 'none'
      ? room.players.length === 0
        ? 'The first phone player to join will become the Game Host.'
        : 'No connected player is available. The next player to join or reconnect will become Game Host automatically.'
      : controller?.connected
        ? `${controller.displayName} is the current Game Host.`
        : 'Waiting for the Game Host to reconnect. If grace expires, the server will select the earliest-joined connected player automatically.';

  const submit = async () => {
    if (!targetPlayer) {
      return;
    }

    setSubmitting(true);
    setActionError(null);
    setSuccessMessage(null);
    const error = await onTransfer(targetPlayer.id);
    setSubmitting(false);

    if (error) {
      setActionError(error);
      return;
    }

    setSuccessMessage(
      `Game Host control moved to ${targetPlayer.displayName}.`,
    );
  };

  return (
    <section className="panel controller-panel" aria-labelledby="host-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Player authority</span>
          <h2 id="host-title">Game Host</h2>
        </div>
        <span
          className={`status-label${room.controllerStatus === 'assigned' && controller?.connected ? ' status-label--controller' : ''}`}
        >
          {statusLabel}
        </span>
      </div>

      <p className="controller-panel__status">{statusMessage}</p>

      {canTransfer && (
        <div className="controller-actions">
          {eligiblePlayers.length > 0 ? (
            <>
              <label htmlFor="controller-target">
                Choose a connected phone player
              </label>
              <div className="transfer-controls">
                <select
                  id="controller-target"
                  value={targetPlayerId}
                  onChange={(event) =>
                    setSelectedPlayerId(event.currentTarget.value)
                  }
                >
                  {eligiblePlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.displayName}
                    </option>
                  ))}
                </select>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={submitting}
                  onClick={() => void submit()}
                >
                  {submitting ? 'Updating…' : 'Make Game Host'}
                </button>
              </div>
            </>
          ) : (
            <p className="field-note">
              A connected phone player is required before control can move.
            </p>
          )}
        </div>
      )}

      <LobbyError error={actionError} />
      {successMessage && (
        <p className="controller-success" role="status">
          {successMessage}
        </p>
      )}
    </section>
  );
}
