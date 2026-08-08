import type { RoundResults } from '@words/shared';

const phrases = {
  'no-score': [
    'Technically, the letters won that round.',
    'A bold strategy: nobody scored.',
    'The dictionary remains undefeated.',
  ],
  tie: [
    '{winners} refuse to settle this like adults.',
    'Nobody blinked. {winners} share the crown.',
    '{winners} tied. Clearly we need another round.',
  ],
  solo: [
    '{winner} wins. The opposition has filed for non-attendance.',
    '{winner} defeats the board, which had no comment.',
  ],
  'nail-biter': [
    '{winner} wins by {margin}. Somebody check the replay.',
    '{winner} by a whisker. {runnerUp} was that close.',
  ],
  close: [
    '{winner} edges past {runnerUp} by {margin}.',
    '{winner} had just enough alphabet left in the tank.',
  ],
  clear: [
    '{winner} understood the assignment.',
    '{winner} came, saw, alphabetized.',
  ],
  landslide: [
    '{winner} chose violence, alphabetically.',
    '{winner} wins by {margin}. That escalated quickly.',
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
    text: phrase
      .replaceAll('{winner}', winners[0]?.displayName ?? '')
      .replaceAll('{winners}', formatNames(winners.map((p) => p.displayName)))
      .replaceAll('{runnerUp}', runner?.displayName ?? '')
      .replaceAll('{margin}', String(margin)),
  };
}
