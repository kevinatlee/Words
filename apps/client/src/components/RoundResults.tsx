import type { RoundResults as RoundResultsState } from '@words/shared';

type RoundResultsProps = {
  roundNumber: number;
  results: RoundResultsState;
  currentPlayerId: string | null;
  isDisplay: boolean;
};

function pointsLabel(points: number): string {
  return `${points} ${points === 1 ? 'point' : 'points'}`;
}

export function RoundResults({
  roundNumber,
  results,
  currentPlayerId,
  isDisplay,
}: RoundResultsProps) {
  const winnerPlayers = results.winnerPlayerIds
    .map((playerId) =>
      results.players.find((player) => player.playerId === playerId),
    )
    .filter((player) => player !== undefined);
  const heading =
    winnerPlayers.length === 0
      ? 'No scoring winner this round'
      : winnerPlayers.length === 1
        ? `${winnerPlayers[0]?.displayName ?? 'Player'} wins`
        : 'Round ends in a tie';
  const winnerSummary =
    winnerPlayers.length === 0
      ? 'No participant submitted a scoring word.'
      : winnerPlayers.length === 1
        ? `${winnerPlayers[0]?.displayName ?? 'The winner'} finishes with ${pointsLabel(winnerPlayers[0]?.finalScore ?? 0)}.`
        : `${winnerPlayers.map((player) => player.displayName).join(', ')} tie with ${pointsLabel(winnerPlayers[0]?.finalScore ?? 0)} each.`;
  const announcement = `Round ${roundNumber} results. ${heading}. ${winnerSummary}`;

  return (
    <section className="round-results" aria-labelledby="round-results-title">
      <div className="round-results__hero">
        <span className="eyebrow">Final round results</span>
        <h2 id="round-results-title">{heading}</h2>
        <p>{winnerSummary}</p>
        <p
          className="visually-hidden"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {announcement}
        </p>
      </div>

      <div className="round-results__ranking">
        <h3>Rankings</h3>
        <div className="result-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Player</th>
                <th scope="col">Final score</th>
              </tr>
            </thead>
            <tbody>
              {results.players.map((player) => {
                const isCurrentPlayer =
                  !isDisplay && player.playerId === currentPlayerId;
                return (
                  <tr
                    className={
                      isCurrentPlayer ? 'round-results__current-player' : ''
                    }
                    key={player.playerId}
                  >
                    <td>{player.rank}</td>
                    <th scope="row">
                      {player.displayName}
                      {isCurrentPlayer && (
                        <span className="round-results__you"> (You)</span>
                      )}
                    </th>
                    <td>{pointsLabel(player.finalScore)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="round-results__reviews">
        <h3>Participant word review</h3>
        {results.players.map((player) => {
          const isCurrentPlayer =
            !isDisplay && player.playerId === currentPlayerId;
          return (
            <details className="result-review" key={player.playerId}>
              <summary>
                <span>
                  {player.displayName}
                  {isCurrentPlayer ? ' (You)' : ''}
                </span>
                <strong>{pointsLabel(player.finalScore)}</strong>
              </summary>
              <div className="result-review__body">
                <p>
                  Base total: {pointsLabel(player.baseScore)}. Uniqueness bonus:{' '}
                  {pointsLabel(player.uniqueBonusScore)}. Final total:{' '}
                  {pointsLabel(player.finalScore)}.
                </p>
                {player.words.length === 0 ? (
                  <p>No accepted words</p>
                ) : (
                  <ol>
                    {player.words.map((word) => (
                      <li key={word.word}>
                        <strong>{word.word}</strong>
                        <span>
                          {word.shared
                            ? `shared — ${pointsLabel(word.finalPoints)} (${pointsLabel(word.basePoints)} base; no uniqueness bonus)`
                            : `unique — ${pointsLabel(word.finalPoints)} (${pointsLabel(word.basePoints)} base + ${pointsLabel(word.uniqueBonusPoints)} uniqueness bonus)`}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
