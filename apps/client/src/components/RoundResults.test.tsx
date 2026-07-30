import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { RoundResults as RoundResultsState } from '@words/shared';

import { RoundResults } from './RoundResults';

const playerA = '00000000-0000-4000-8000-000000000001';
const playerB = '00000000-0000-4000-8000-000000000002';
const playerC = '00000000-0000-4000-8000-000000000003';

const results: RoundResultsState = {
  players: [
    {
      playerId: playerA,
      displayName: 'Bright Fox',
      rank: 1,
      baseScore: 3,
      uniqueBonusScore: 0.5,
      finalScore: 3.5,
      words: [
        {
          word: 'STONE',
          basePoints: 2,
          shared: false,
          uniqueBonusPoints: 0.5,
          finalPoints: 2.5,
        },
        {
          word: 'TOOL',
          basePoints: 1,
          shared: true,
          uniqueBonusPoints: 0,
          finalPoints: 1,
        },
      ],
    },
    {
      playerId: playerB,
      displayName: 'Amber Kite',
      rank: 2,
      baseScore: 1,
      uniqueBonusScore: 0,
      finalScore: 1,
      words: [
        {
          word: 'TOOL',
          basePoints: 1,
          shared: true,
          uniqueBonusPoints: 0,
          finalPoints: 1,
        },
      ],
    },
    {
      playerId: playerC,
      displayName: 'Calm Lynx',
      rank: 3,
      baseScore: 0,
      uniqueBonusScore: 0,
      finalScore: 0,
      words: [],
    },
  ],
  winnerPlayerIds: [playerA],
};

describe('RoundResults', () => {
  it('shows authoritative rank order and one winner', () => {
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
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      '1Bright Fox3.5 points',
      '2Amber Kite (You)1 point',
      '3Calm Lynx0 points',
    ]);
    expect(screen.getByText('Amber Kite (You)')).toBeVisible();
  });

  it('shows unique bonuses and shared base points as text', () => {
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
        'unique — 2.5 points (2 points base + 0.5 points uniqueness bonus)',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        'shared — 1 point (1 point base; no uniqueness bonus)',
      ),
    ).toHaveLength(2);
    expect(screen.getByText('No accepted words')).toBeInTheDocument();
    expect(screen.queryByText(/acceptedAt/i)).toBeNull();
    expect(screen.queryByText(/submissionVersion/i)).toBeNull();
    expect(screen.queryByText(/path/i)).toBeNull();
  });

  it('shows every tied winner without choosing one', () => {
    const tiedResults: RoundResultsState = {
      players: [
        {
          playerId: playerA,
          displayName: 'Bright Fox',
          rank: 1,
          baseScore: 2,
          uniqueBonusScore: 0.5,
          finalScore: 2.5,
          words: [
            {
              word: 'STONE',
              basePoints: 2,
              shared: false,
              uniqueBonusPoints: 0.5,
              finalPoints: 2.5,
            },
          ],
        },
        {
          playerId: playerB,
          displayName: 'Amber Kite',
          rank: 1,
          baseScore: 2,
          uniqueBonusScore: 0.5,
          finalScore: 2.5,
          words: [
            {
              word: 'BEERS',
              basePoints: 2,
              shared: false,
              uniqueBonusPoints: 0.5,
              finalPoints: 2.5,
            },
          ],
        },
      ],
      winnerPlayerIds: [playerA, playerB],
    };
    render(
      <RoundResults
        roundNumber={2}
        results={tiedResults}
        currentPlayerId={null}
        isDisplay
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Round ends in a tie' }),
    ).toBeVisible();
    expect(
      screen.getByText('Bright Fox, Amber Kite tie with 2.5 points each.'),
    ).toBeVisible();
    expect(screen.queryByText(/\(You\)/)).toBeNull();
  });

  it('treats an all-shared positive round as a tied win', () => {
    const sharedTie: RoundResultsState = {
      players: [playerA, playerB].map((playerId, index) => ({
        playerId,
        displayName: index === 0 ? 'Bright Fox' : 'Amber Kite',
        rank: 1,
        baseScore: 1,
        uniqueBonusScore: 0,
        finalScore: 1,
        words: [
          {
            word: 'TOOL',
            basePoints: 1,
            shared: true,
            uniqueBonusPoints: 0,
            finalPoints: 1,
          },
        ],
      })),
      winnerPlayerIds: [playerA, playerB],
    };
    render(
      <RoundResults
        roundNumber={4}
        results={sharedTie}
        currentPlayerId={null}
        isDisplay
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Round ends in a tie' }),
    ).toBeVisible();
    expect(
      screen.getByText('Bright Fox, Amber Kite tie with 1 point each.'),
    ).toBeVisible();
    expect(
      screen.getAllByText(
        'shared — 1 point (1 point base; no uniqueness bonus)',
      ),
    ).toHaveLength(2);
  });

  it('does not call participants without accepted words winners', () => {
    const zeroResults: RoundResultsState = {
      players: results.players.map((player) => ({
        ...player,
        rank: 1,
        baseScore: 0,
        uniqueBonusScore: 0,
        finalScore: 0,
        words: [],
      })),
      winnerPlayerIds: [],
    };
    render(
      <RoundResults
        roundNumber={3}
        results={zeroResults}
        currentPlayerId={playerA}
        isDisplay={false}
      />,
    );

    expect(
      screen.getByRole('heading', {
        name: 'No scoring winner this round',
      }),
    ).toBeVisible();
    expect(screen.queryByText(/wins/i)).toBeNull();
  });

  it('renders the complete bounded 2,048-word result', () => {
    const wordFor = (index: number) =>
      [2, 1, 0]
        .map((power) =>
          String.fromCharCode(65 + (Math.floor(index / 26 ** power) % 26)),
        )
        .join('');
    const maximumResults: RoundResultsState = {
      players: Array.from({ length: 8 }, (_, playerIndex) => ({
        playerId: `00000000-0000-4000-8000-${String(playerIndex + 1).padStart(12, '0')}`,
        displayName: `Player ${playerIndex + 1}`,
        rank: 1,
        baseScore: 256,
        uniqueBonusScore: 64,
        finalScore: 320,
        words: Array.from({ length: 256 }, (_, wordIndex) => ({
          word: wordFor(playerIndex * 256 + wordIndex),
          basePoints: 1,
          shared: false,
          uniqueBonusPoints: 0.25,
          finalPoints: 1.25,
        })),
      })),
      winnerPlayerIds: Array.from(
        { length: 8 },
        (_, playerIndex) =>
          `00000000-0000-4000-8000-${String(playerIndex + 1).padStart(12, '0')}`,
      ),
    };
    const { container } = render(
      <RoundResults
        roundNumber={9}
        results={maximumResults}
        currentPlayerId={playerA}
        isDisplay={false}
      />,
    );

    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
      9,
    );
    expect(container.querySelectorAll('.result-review')).toHaveLength(8);
    expect(container.querySelectorAll('.result-review li')).toHaveLength(2_048);
  });
});
