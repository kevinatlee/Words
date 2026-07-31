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
    <section className="panel controller-panel" aria-label="Game host controls">
      {canTransfer && (
        <div className="controller-actions">
          {eligiblePlayers.length > 0 ? (
            <>
              <div className="transfer-controls">
                <select
                  id="controller-target"
                  aria-label="Select New Game Host"
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
