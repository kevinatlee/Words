const players = [
  { name: 'Host', isHost: true, status: 'Ready' },
  { name: 'Player Two', isHost: false, status: 'Ready' },
  { name: 'Player Three', isHost: false, status: 'Joining' },
];

export function PlayerList() {
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
        <span className="count-badge">3 / 8</span>
      </div>
      <ul className="player-list">
        {players.map((player) => (
          <li className="player-list__item" key={player.name}>
            <span className="player-avatar" aria-hidden="true">
              {player.name.charAt(0)}
            </span>
            <span className="player-list__identity">
              <strong>{player.name}</strong>
              <small>
                {player.isHost ? 'Current host' : `Player · ${player.status}`}
              </small>
            </span>
            <span
              className={
                player.isHost
                  ? 'status-label status-label--host'
                  : 'status-label'
              }
            >
              {player.isHost ? 'Host' : player.status}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
