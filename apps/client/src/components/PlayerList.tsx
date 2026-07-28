import type { PlayerState } from '@words/shared';

type PlayerListProps = {
  players: PlayerState[];
  maxPlayers: number;
  currentPlayerId: string | null;
};

export function PlayerList({
  players,
  maxPlayers,
  currentPlayerId,
}: PlayerListProps) {
  return (
    <section
      className="panel player-list-panel"
      aria-labelledby="players-title"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Phone players</span>
          <h2 id="players-title">Players</h2>
        </div>
        <span className="count-badge">
          {players.length} / {maxPlayers}
        </span>
      </div>
      {players.length === 0 ? (
        <p className="empty-player-list">
          Waiting for the first player. They will become the game host.
        </p>
      ) : (
        <ul className="player-list">
          {players.map((player) => (
            <li
              className={`player-list__item${player.connected ? '' : ' player-list__item--offline'}${player.isController ? ' player-list__item--controller' : ''}`}
              key={player.id}
            >
              <span className="player-avatar" aria-hidden="true">
                {player.displayName.charAt(0)}
              </span>
              <span className="player-list__identity">
                <strong>
                  {player.displayName}
                  {player.id === currentPlayerId ? ' (you)' : ''}
                </strong>
                <small>
                  {player.isController ? 'Game host' : 'Lobby player'}
                </small>
              </span>
              <span
                className={
                  player.isController
                    ? 'status-label status-label--controller'
                    : 'status-label'
                }
              >
                {player.isController
                  ? player.connected
                    ? 'Game Host'
                    : 'Game Host offline'
                  : player.connected
                    ? 'Connected'
                    : 'Offline'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
