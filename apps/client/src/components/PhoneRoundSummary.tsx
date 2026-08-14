import type { RoundResults } from '@words/shared';

type PhoneRoundSummaryProps = {
  readonly results: RoundResults | null;
  readonly currentPlayerId: string | null;
};

function winningScore(results: RoundResults): number | null {
  if (results.winnerPlayerIds.length === 0) {
    return null;
  }

  const winner = results.players.find((player) =>
    results.winnerPlayerIds.includes(player.playerId),
  );
  return winner?.finalScore ?? null;
}

function winnerNames(results: RoundResults): string | null {
  const names = results.players
    .filter((player) => results.winnerPlayerIds.includes(player.playerId))
    .map((player) => player.displayName);

  if (names.length === 0) {
    return null;
  }
  if (names.length === 1) {
    return names[0]!;
  }
  if (names.length === 2) {
    return names.join(' & ');
  }
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
}

function scoreLabel(score: number | null): string {
  return score === null
    ? 'No scoring winner'
    : `${score} ${score === 1 ? 'point' : 'points'}`;
}

export function PhoneRoundSummary({
  results,
  currentPlayerId,
}: PhoneRoundSummaryProps) {
  const playerResult = results?.players.find(
    (player) => player.playerId === currentPlayerId,
  );
  const topScore = results ? winningScore(results) : null;
  const winners = results ? winnerNames(results) : null;

  const winningScoreSummary = (
    <>
      <dt>Winning Score</dt>
      <dd>
        <span>{scoreLabel(topScore)}</span>
        {winners && (
          <span className="phone-round-summary__winner-names">{winners}</span>
        )}
      </dd>
    </>
  );

  return (
    <section
      className="panel phone-round-summary"
      aria-labelledby="round-summary-title"
    >
      <p className="eyebrow">ROUND OVER</p>
      <h2 id="round-summary-title">Look at the TV!</h2>
      {playerResult ? (
        <dl>
          <div>
            <dt>Your Score</dt>
            <dd>{scoreLabel(playerResult.finalScore)}</dd>
          </div>
          <div>{winningScoreSummary}</div>
        </dl>
      ) : (
        <>
          <p>You joined after this round began.</p>
          <dl>
            <div>{winningScoreSummary}</div>
          </dl>
        </>
      )}
    </section>
  );
}
