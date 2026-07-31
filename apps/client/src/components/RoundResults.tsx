import type { RoundResults as RoundResultsState } from '@words/shared';

type RoundResultsProps = {
  roundNumber: number;
  results: RoundResultsState;
  currentPlayerId?: string | null;
  isDisplay?: boolean;
};

function uniqueLimit(count: number): number {
  if (count <= 2) return 5;
  if (count <= 4) return 4;
  if (count <= 6) return 3;
  return 2;
}

export function RoundResults({ roundNumber, results }: RoundResultsProps) {
  const limit = uniqueLimit(results.players.length);
  return (
    <section className="display-results" aria-labelledby="round-results-title">
      <h1 id="round-results-title">Round {roundNumber} Results</h1>
      <ol
        className={`display-results__cards display-results__cards--${results.players.length}`}
      >
        {results.players.map((player) => {
          const uniqueWords = player.words.filter((word) => !word.shared);
          const winner = results.winnerPlayerIds.includes(player.playerId);
          return (
            <li className="result-player-card" key={player.playerId}>
              <h2>
                {winner && <span aria-label="Game Host winner">♛ </span>}
                {player.displayName}
              </h2>
              <strong className="result-player-card__points">
                {player.finalScore} points
              </strong>
              <p>
                Accepted: {player.words.length} · Unique: {uniqueWords.length}
              </p>
              {uniqueWords.length > 0 && (
                <ul aria-label={`${player.displayName} unique words`}>
                  {uniqueWords.slice(0, limit).map((word) => (
                    <li key={word.word}>{word.word}</li>
                  ))}
                  {uniqueWords.length > limit && (
                    <li>+{uniqueWords.length - limit} more</li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
