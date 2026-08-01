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

  return (
    <section
      className="phone-round-summary"
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
          <div>
            <dt>Winning Score</dt>
            <dd>{scoreLabel(topScore)}</dd>
          </div>
        </dl>
      ) : (
        <>
          <p>You joined after this round began.</p>
          <dl>
            <div>
              <dt>Winning Score</dt>
              <dd>{scoreLabel(topScore)}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}
