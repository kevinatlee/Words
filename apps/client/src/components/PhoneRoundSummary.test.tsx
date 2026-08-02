import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RoundResults } from '@words/shared';

import { PhoneRoundSummary } from './PhoneRoundSummary';

const fox = '00000000-0000-4000-8000-000000000001';
const otter = '00000000-0000-4000-8000-000000000002';
const owl = '00000000-0000-4000-8000-000000000003';

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
    expect(screen.getByText('Bright Fox')).toHaveClass(
      'phone-round-summary__winner-names',
    );
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
    expect(screen.getByText('Bright Fox')).toHaveClass(
      'phone-round-summary__winner-names',
    );
  });

  it('lists tied winners in authoritative result order for a participating winner', () => {
    render(
      <PhoneRoundSummary
        currentPlayerId={otter}
        results={results(6, 6, [fox, otter])}
      />,
    );

    expect(screen.getAllByText('6 points')).toHaveLength(2);
    expect(screen.getByText('Bright Fox & Calm Otter')).toHaveClass(
      'phone-round-summary__winner-names',
    );
  });

  it('uses comma-and-ampersand punctuation for three authoritative tied winners', () => {
    const base = results(8, 8, [fox, otter, owl]);
    render(
      <PhoneRoundSummary
        currentPlayerId={fox}
        results={{
          ...base,
          players: [
            ...base.players,
            {
              playerId: owl,
              displayName: 'Night Owl',
              rank: 1,
              baseScore: 8,
              uniqueBonusScore: 0,
              finalScore: 8,
              words: [],
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Bright Fox, Calm Otter & Night Owl')).toHaveClass(
      'phone-round-summary__winner-names',
    );
  });

  it('reports the authoritative no-winner state for an all-zero round', () => {
    render(
      <PhoneRoundSummary currentPlayerId={fox} results={results(0, 0, [])} />,
    );

    expect(screen.getByText('0 points')).toBeVisible();
    expect(screen.getByText('No scoring winner')).toBeVisible();
    expect(
      screen.queryByText('Bright Fox', {
        selector: '.phone-round-summary__winner-names',
      }),
    ).toBeNull();
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
    expect(screen.getByText('Bright Fox')).toHaveClass(
      'phone-round-summary__winner-names',
    );
  });

  it('uses winner IDs rather than a confusing higher non-winner score', () => {
    render(
      <PhoneRoundSummary
        currentPlayerId={otter}
        results={results(4, 99, [fox])}
      />,
    );

    expect(screen.getByText('4 points')).toBeVisible();
    expect(screen.getByText('Bright Fox')).toHaveClass(
      'phone-round-summary__winner-names',
    );
    expect(screen.queryByText('Calm Otter', { exact: true })).toBeNull();
  });

  it('uses the winner-name wrapping class for long authoritative display names', () => {
    const base = results(7, 4, [fox]);
    const longName = 'The exceptionally long reigning game host display name';
    render(
      <PhoneRoundSummary
        currentPlayerId={otter}
        results={{
          ...base,
          players: base.players.map((player) =>
            player.playerId === fox
              ? { ...player, displayName: longName }
              : player,
          ),
        }}
      />,
    );

    expect(screen.getByText(longName)).toHaveClass(
      'phone-round-summary__winner-names',
    );
  });
});
