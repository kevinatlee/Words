import type { RoundResults } from '@words/shared';

const phrases = {
  'no-score': [
    'Technically, the letters won that round.',
    'A bold strategy: nobody scored.',
    'The dictionary remains undefeated.',
    'Zero points. Maximum suspense.',
    "Let's all agree that was the warm-up.",
  ],
  tie: [
    'Nobody blinked. We have a tie.',
    'Clearly we need another round.',
    'The scoreboard refuses to pick a winner.',
    'Split decision. Rematch energy detected.',
    'Apparently first place is a shared resource.',
  ],
  solo: [
    '{winner} wins. The opposition has filed for non-attendance.',
    '{winner} defeats the board, which had no comment.',
    '{winner} takes the round uncontested.',
    'A commanding performance by {winner}. Very commanding. Very solo.',
    '{winner} has secured unanimous first place.',
  ],
  'nail-biter': [
    '{winner} escapes with the win. Barely.',
    '{winner} survives a round that had no business being that close.',
    '{winner} takes it. Nobody unclench yet.',
    '{winner} sneaks across the finish line first.',
    '{winner} wins. Dramatic for absolutely no reason.',
  ],
  close: [
    '{winner} had the edge when it counted.',
    '{winner} had just enough alphabet left in the tank.',
    '{winner} made just enough room at the top.',
    '{winner} found one more gear — and a few more words.',
    '{winner} takes it. Competitive nonsense at its finest.',
  ],
  clear: [
    '{winner} understood the assignment.',
    '{winner} came, saw, alphabetized.',
    '{winner} found the words. Everyone else found character development.',
    "{winner} quietly built a lead and made it everybody's problem.",
    '{winner} was apparently studying the dictionary between rounds.',
  ],
  landslide: [
    '{winner} chose violence, alphabetically.',
    '{winner} apparently misunderstood the meaning of friendly competition.',
    '{winner} has been asked to leave some points for the rest of us.',
    '{winner} turned the scoreboard into a spelling demonstration.',
    "{winner} didn't just win the round. {winner} claimed it.",
  ],
} as const;
export type ResultQuipCategory = keyof typeof phrases;
export function formatNames(names: readonly string[]) {
  return names.length < 2
    ? (names[0] ?? '')
    : names.length === 2
      ? names.join(' & ')
      : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
}
export function getResultQuip(results: RoundResults, roundNumber: number) {
  const top = results.players[0]?.finalScore ?? 0;
  const winners = results.players.filter((p) =>
    results.winnerPlayerIds.includes(p.playerId),
  );
  const runner = results.players.find((p) => p.finalScore < top);
  const margin = top - (runner?.finalScore ?? top);
  const category: ResultQuipCategory =
    top === 0
      ? 'no-score'
      : winners.length > 1
        ? 'tie'
        : !runner
          ? 'solo'
          : margin <= 2 || margin / top <= 0.1
            ? 'nail-biter'
            : margin / top <= 0.25
              ? 'close'
              : margin / top <= 0.5
                ? 'clear'
                : 'landslide';
  const phrase =
    phrases[category][(roundNumber - 1) % phrases[category].length] ??
    phrases[category][0] ??
    '';
  return {
    category,
    text: phrase.replaceAll('{winner}', winners[0]?.displayName ?? ''),
  };
}
