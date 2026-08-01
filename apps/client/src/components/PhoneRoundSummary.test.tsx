import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RoundResults } from '@words/shared';

import { PhoneRoundSummary } from './PhoneRoundSummary';

const fox = '00000000-0000-4000-8000-000000000001';
const otter = '00000000-0000-4000-8000-000000000002';

function results(
  foxScore: number,
  otterScore: number,
  winnerPlayerIds: string[],
): RoundResults {
  return {
    players: [
      {
        playerId: fox,
        displayName: 'Bright Fox',
        rank: 1,
        baseScore: foxScore,
        uniqueBonusScore: 0,
        finalScore: foxScore,
        words: [],
      },
      {
        playerId: otter,
        displayName: 'Calm Otter',
        rank: 2,
        baseScore: otterScore,
        uniqueBonusScore: 0,
        finalScore: otterScore,
        words: [],
      },
    ],
    winnerPlayerIds,
  };
}

describe('PhoneRoundSummary', () => {
  it('shows the sole winner their final score and the winning score', () => {
    render(
      <PhoneRoundSummary
        currentPlayerId={fox}
        results={results(7, 4, [fox])}
      />,
    );

    expect(screen.getByText('ROUND OVER')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Look at the TV!' }),
    ).toBeVisible();
    expect(screen.getByText('Your Score')).toBeVisible();
    expect(screen.getAllByText('7 points')).toHaveLength(2);
    expect(screen.queryByText('Calm Otter')).toBeNull();
  });

  it('shows a participant who did not win their own final score and the top score', () => {
    render(
      <PhoneRoundSummary
        currentPlayerId={otter}
        results={results(7, 4, [fox])}
      />,
    );

    expect(screen.getByText('Your Score')).toBeVisible();
    expect(screen.getByText('4 points')).toBeVisible();
    expect(screen.getByText('Winning Score')).toBeVisible();
    expect(screen.getByText('7 points')).toBeVisible();
    expect(screen.queryByText('Bright Fox')).toBeNull();
  });

  it('uses the shared tied winning score rather than a winner list', () => {
    render(
      <PhoneRoundSummary
        currentPlayerId={otter}
        results={results(6, 6, [fox, otter])}
      />,
    );

    expect(screen.getAllByText('6 points')).toHaveLength(2);
    expect(screen.queryByText(/Bright Fox/)).toBeNull();
  });

  it('reports the authoritative no-winner state for an all-zero round', () => {
    render(
      <PhoneRoundSummary currentPlayerId={fox} results={results(0, 0, [])} />,
    );

    expect(screen.getByText('0 points')).toBeVisible();
    expect(screen.getByText('No scoring winner')).toBeVisible();
  });

  it('does not invent a personal score for a player who joined late', () => {
    render(
      <PhoneRoundSummary
        currentPlayerId="00000000-0000-4000-8000-000000000003"
        results={results(7, 4, [fox])}
      />,
    );

    expect(
      screen.getByText('You joined after this round began.'),
    ).toBeVisible();
    expect(screen.queryByText('Your Score')).toBeNull();
    expect(screen.getByText('7 points')).toBeVisible();
  });
});
