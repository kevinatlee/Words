import type { PlayerState } from '@words/shared';

type PlayerListProps = {
  players: PlayerState[];
  maxPlayers: number;
  currentPlayerId: string;
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
          <span className="eyebrow">Lobby</span>
          <h2 id="players-title">Players</h2>
        </div>
        <span className="count-badge">
          {players.length} / {maxPlayers}
        </span>
      </div>
      <ul className="player-list">
        {players.map((player) => (
          <li
            className={`player-list__item${player.connected ? '' : ' player-list__item--offline'}`}
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
              <small>{player.isHost ? 'Current host' : 'Lobby player'}</small>
            </span>
            <span
              className={
                player.isHost
                  ? 'status-label status-label--host'
                  : 'status-label'
              }
            >
              {player.isHost
                ? player.connected
                  ? 'Host'
                  : 'Host offline'
                : player.connected
                  ? 'Connected'
                  : 'Offline'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
