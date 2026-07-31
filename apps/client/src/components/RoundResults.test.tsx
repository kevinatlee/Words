import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { RoundResults as RoundResultsState } from '@words/shared';

import { RoundResults } from './RoundResults';

const playerA = '00000000-0000-4000-8000-000000000001';
const playerB = '00000000-0000-4000-8000-000000000002';

const results: RoundResultsState = {
  players: [
    {
      playerId: playerA,
      displayName: 'Bright Fox',
      rank: 1,
      baseScore: 9,
      uniqueBonusScore: 2,
      finalScore: 11,
      words: [
        {
          word: 'STONE',
          basePoints: 5,
          shared: false,
          uniqueBonusPoints: 2,
          finalPoints: 7,
        },
        {
          word: 'TOOL',
          basePoints: 4,
          shared: true,
          uniqueBonusPoints: 0,
          finalPoints: 4,
        },
      ],
    },
    {
      playerId: playerB,
      displayName: 'Amber Kite',
      rank: 2,
      baseScore: 4,
      uniqueBonusScore: 0,
      finalScore: 4,
      words: [
        {
          word: 'TOOL',
          basePoints: 4,
          shared: true,
          uniqueBonusPoints: 0,
          finalPoints: 4,
        },
      ],
    },
  ],
  winnerPlayerIds: [playerA],
};

describe('RoundResults', () => {
  it('shows authoritative integer rank order and one winner', () => {
    render(
      <RoundResults
        roundNumber={1}
        results={results}
        currentPlayerId={playerB}
        isDisplay={false}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Bright Fox wins' }),
    ).toBeVisible();
    expect(
      within(screen.getByRole('table'))
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual(['1Bright Fox11 points', '2Amber Kite (You)4 points']);
  });

  it('shows integer unique bonuses and shared base points without decimals', () => {
    render(
      <RoundResults
        roundNumber={1}
        results={results}
        currentPlayerId={playerA}
        isDisplay={false}
      />,
    );
    expect(
      screen.getByText(
        'unique — 7 points (5 points base + 2 points uniqueness bonus)',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        'shared — 4 points (4 points base; no uniqueness bonus)',
      ),
    ).toHaveLength(2);
    expect(screen.queryByText(/\d+\.\d+ points/)).toBeNull();
  });

  it('shows all tied positive winners', () => {
    const tied: RoundResultsState = {
      players: results.players.map((player) => ({
        ...player,
        rank: 1,
        finalScore: 7,
        baseScore: 5,
        uniqueBonusScore: 2,
        words: [
          {
            word: player.playerId === playerA ? 'STONE' : 'BEERS',
            basePoints: 5,
            shared: false,
            uniqueBonusPoints: 2,
            finalPoints: 7,
          },
        ],
      })),
      winnerPlayerIds: [playerA, playerB],
    };
    render(
      <RoundResults
        roundNumber={2}
        results={tied}
        currentPlayerId={null}
        isDisplay
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Round ends in a tie' }),
    ).toBeVisible();
    expect(
      screen.getByText('Bright Fox, Amber Kite tie with 7 points each.'),
    ).toBeVisible();
  });

  it('keeps an all-shared positive round as a tie', () => {
    const tied: RoundResultsState = {
      players: results.players.map((player) => ({
        ...player,
        rank: 1,
        baseScore: 4,
        uniqueBonusScore: 0,
        finalScore: 4,
        words: [
          {
            word: 'TOOL',
            basePoints: 4,
            shared: true,
            uniqueBonusPoints: 0,
            finalPoints: 4,
          },
        ],
      })),
      winnerPlayerIds: [playerA, playerB],
    };
    render(
      <RoundResults
        roundNumber={3}
        results={tied}
        currentPlayerId={null}
        isDisplay
      />,
    );
    expect(
      screen.getByText('Bright Fox, Amber Kite tie with 4 points each.'),
    ).toBeVisible();
  });

  it('shows no winner when every final score is zero', () => {
    const none: RoundResultsState = {
      players: results.players.map((player, index) => ({
        ...player,
        rank: 1,
        baseScore: 0,
        uniqueBonusScore: 0,
        finalScore: 0,
        words: [],
        displayName: index === 0 ? 'Bright Fox' : 'Amber Kite',
      })),
      winnerPlayerIds: [],
    };
    render(
      <RoundResults
        roundNumber={4}
        results={none}
        currentPlayerId={null}
        isDisplay
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'No scoring winner this round' }),
    ).toBeVisible();
  });

  it.each([
    ['CAT', 3, 1, 4],
    ['ELEPHANTS', 9, 2, 11],
  ] as const)(
    'presents integer result values for %s',
    (word, base, bonus, final) => {
      const single: RoundResultsState = {
        players: [
          {
            playerId: playerA,
            displayName: 'Bright Fox',
            rank: 1,
            baseScore: base,
            uniqueBonusScore: bonus,
            finalScore: final,
            words: [
              {
                word,
                basePoints: base,
                shared: false,
                uniqueBonusPoints: bonus,
                finalPoints: final,
              },
            ],
          },
        ],
        winnerPlayerIds: [playerA],
      };
      render(
        <RoundResults
          roundNumber={5}
          results={single}
          currentPlayerId={playerA}
          isDisplay={false}
        />,
      );
      expect(screen.getAllByText(`${final} points`).length).toBeGreaterThan(0);
    },
  );
});
