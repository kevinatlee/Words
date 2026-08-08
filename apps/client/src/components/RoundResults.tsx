import type { RoundResults as RoundResultsState } from '@words/shared';
import { getResultQuip } from '../utils/result-quip';

const fireworkPositions = [
  ['8%', '14%'],
  ['25%', '28%'],
  ['47%', '12%'],
  ['70%', '22%'],
  ['90%', '16%'],
  ['14%', '48%'],
  ['34%', '62%'],
  ['58%', '44%'],
  ['78%', '57%'],
  ['92%', '48%'],
  ['7%', '78%'],
  ['24%', '86%'],
  ['45%', '75%'],
  ['66%', '88%'],
  ['88%', '76%'],
  ['18%', '35%'],
  ['52%', '82%'],
  ['82%', '36%'],
] as const;

type RoundResultsProps = {
  results: RoundResultsState;
  currentPlayerId?: string | null;
  isDisplay?: boolean;
  roundNumber?: number;
};

function uniqueLimit(count: number): number {
  if (count <= 2) return 5;
  if (count <= 4) return 4;
  if (count <= 6) return 3;
  return 2;
}

export function RoundResults({ results, roundNumber = 1 }: RoundResultsProps) {
  const limit = uniqueLimit(results.players.length);
  const celebrate = (results.players[0]?.finalScore ?? 0) > 0;
  const quip = getResultQuip(results, roundNumber);
  return (
    <section className="display-results" aria-labelledby="round-results-title">
      <h1 id="round-results-title">Round Results</h1>
      <div className="display-results__fireworks" aria-hidden="true">
        {fireworkPositions.map(([x, y], index) => (
          <i
            className="display-results__firework"
            key={index}
            style={
              {
                '--firework-x': x,
                '--firework-y': y,
                '--firework': index,
              } as React.CSSProperties
            }
          >
            {Array.from({ length: 8 }, (_, spark) => (
              <b key={spark} />
            ))}
          </i>
        ))}
      </div>
      <p className="display-results__quip">{quip.text}</p>
      <ol
        className={`display-results__cards display-results__cards--${results.players.length}`}
        data-result-card-count={results.players.length}
      >
        {results.players.map((player) => {
          const uniqueWords = [...player.words]
            .filter((word) => !word.shared)
            .sort(
              (left, right) =>
                right.word.length - left.word.length ||
                left.word.localeCompare(right.word),
            );
          const winner = results.winnerPlayerIds.includes(player.playerId);
          const podiumLevel = celebrate ? Math.min(player.rank, 4) : 0;
          return (
            <li
              className={`result-player-card${winner ? ' result-player-card--winner result-player-card--celebrate' : ''}`}
              data-podium-level={podiumLevel}
              data-authoritative-rank={player.rank}
              key={player.playerId}
            >
              <h2>
                {winner && <span aria-label="Game Host winner">♛ </span>}
                {player.displayName}
              </h2>
              <strong className="result-player-card__points">
                {player.finalScore} points
              </strong>
              <dl className="result-player-card__stats">
                <div>
                  <dt>Words</dt>
                  <dd>{player.words.length}</dd>
                </div>
                <div>
                  <dt>Unique words</dt>
                  <dd>{uniqueWords.length}</dd>
                </div>
              </dl>
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
