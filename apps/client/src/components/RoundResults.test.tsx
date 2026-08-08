import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RoundResults as R } from '@words/shared';
import { RoundResults } from './RoundResults';
const a = '00000000-0000-4000-8000-000000000001',
  b = '00000000-0000-4000-8000-000000000002';
const word = (word: string, shared = false) => ({
  word,
  basePoints: 5,
  shared,
  uniqueBonusPoints: (shared ? 0 : 2) as 0 | 2,
  finalPoints: shared ? 5 : 7,
});
const result = (count = 2): R => ({
  players: Array.from({ length: count }, (_, i) => ({
    playerId:
      i === 0
        ? a
        : `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    displayName: i ? 'Amber Kite' : 'Bright Fox',
    rank: i + 1,
    baseScore: 7,
    uniqueBonusScore: 0,
    finalScore: 7 - i,
    words: [word('UNIQUE'), word('SHARED', true)],
  })),
  winnerPlayerIds: [a],
});
describe('RoundResults', () => {
  it('uses the Round Results heading and server card order', () => {
    render(<RoundResults results={result()} />);
    expect(
      screen.getByRole('heading', { name: 'Round Results' }),
    ).toBeVisible();
    expect(screen.queryByText(/Round \d+ Results/)).toBeNull();
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((x) => x.textContent),
    ).toEqual(expect.arrayContaining(['♛ Bright Fox', 'Amber Kite']));
    expect(document.querySelector('.display-results__cards')).toHaveAttribute(
      'data-result-card-count',
      '2',
    );
    expect(
      document.querySelectorAll('.result-player-card--winner'),
    ).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: /Bright Fox/ }).closest('li'),
    ).toHaveClass('result-player-card--winner');
    expect(
      screen.getByRole('heading', { name: 'Amber Kite' }).closest('li'),
    ).not.toHaveClass('result-player-card--winner');
  });

  it.each([1, 2, 3, 4, 6, 8])(
    'keeps %i result cards in an explicit intrinsic-width layout variant',
    (count) => {
      render(<RoundResults results={result(count)} />);

      expect(document.querySelector('.display-results__cards')).toHaveClass(
        `display-results__cards--${count}`,
      );
      expect(document.querySelectorAll('.result-player-card')).toHaveLength(
        count,
      );
    },
  );
  it('uses authoritative competition ranks for flow-safe podium levels', () => {
    const base = result(4);
    const ranked: R = {
      ...base,
      players: base.players.map((player, index) => ({
        ...player,
        rank: index + 1,
      })),
    };
    render(<RoundResults results={ranked} />);

    const cards = document.querySelectorAll('.result-player-card');
    expect(
      [...cards].map((card) => card.getAttribute('data-authoritative-rank')),
    ).toEqual(['1', '2', '3', '4']);
    expect(
      [...cards].map((card) => card.getAttribute('data-podium-level')),
    ).toEqual(['1', '2', '3', '4']);
  });

  it.each([
    [
      [1, 1, 3],
      ['1', '1', '3'],
    ],
    [
      [1, 2, 2, 4],
      ['1', '2', '2', '4'],
    ],
  ])(
    'keeps tied authoritative ranks on the same podium level',
    (ranks, levels) => {
      const base = result(ranks.length);
      const tied: R = {
        ...base,
        players: base.players.map((player, index) => ({
          ...player,
          rank: ranks[index]!,
        })),
      };
      render(<RoundResults results={tied} />);
      expect(
        [...document.querySelectorAll('.result-player-card')].map((card) =>
          card.getAttribute('data-podium-level'),
        ),
      ).toEqual(levels);
    },
  );

  it('keeps all-zero rounds flat and free of celebration styling', () => {
    const base = result(4);
    const zero: R = {
      ...base,
      winnerPlayerIds: [],
      players: base.players.map((player) => ({
        ...player,
        rank: 1,
        baseScore: 0,
        uniqueBonusScore: 0,
        finalScore: 0,
        words: [],
      })),
    };
    render(<RoundResults results={zero} />);

    const cards = [...document.querySelectorAll('.result-player-card')];
    expect(cards.map((card) => card.getAttribute('data-podium-level'))).toEqual(
      ['0', '0', '0', '0'],
    );
    expect(document.querySelector('.result-player-card--celebrate')).toBeNull();
  });

  it('replaces podium and winner styling when a later round is rendered', () => {
    const first = result(2);
    const view = render(<RoundResults results={first} />);
    const second: R = {
      ...first,
      players: [
        { ...first.players[0]!, rank: 2, finalScore: 4 },
        { ...first.players[1]!, rank: 1, finalScore: 8 },
      ],
      winnerPlayerIds: [first.players[1]!.playerId],
    };
    view.rerender(<RoundResults results={second} />);

    const cards = [...document.querySelectorAll('.result-player-card')];
    expect(cards[0]).toHaveAttribute('data-podium-level', '2');
    expect(cards[0]).not.toHaveClass('result-player-card--celebrate');
    expect(cards[1]).toHaveAttribute('data-podium-level', '1');
    expect(cards[1]).toHaveClass('result-player-card--celebrate');
  });
  it('shows integer points and separate Words and Unique words rows', () => {
    render(<RoundResults results={result()} />);
    expect(screen.getByText('7 points')).toBeVisible();
    expect(screen.getAllByText('Words')).toHaveLength(2);
    expect(screen.getAllByText('Unique words')).toHaveLength(2);
    expect(screen.queryByText(/Accepted:/)).toBeNull();
    const stats = screen.getAllByText('Words')[0]?.closest('dl');
    expect(stats).toHaveClass('result-player-card__stats');
    expect(stats?.querySelectorAll(':scope > div')).toHaveLength(2);
    expect(within(stats!).getByText('2')).toBeVisible();
    expect(within(stats!).getByText('1')).toBeVisible();
  });
  it('lists unique words but not shared words', () => {
    render(<RoundResults results={result()} />);
    expect(screen.getAllByText('UNIQUE')).toHaveLength(2);
    expect(screen.queryByText('SHARED')).toBeNull();
  });
  it('crowns every tied winner accessibly', () => {
    const x: R = { ...result(), winnerPlayerIds: [a, b] };
    render(<RoundResults results={x} />);
    expect(screen.getAllByLabelText('Game Host winner')).toHaveLength(2);
  });
  it('does not crown an all-zero result', () => {
    const x: R = { ...result(), winnerPlayerIds: [] };
    render(<RoundResults results={x} />);
    expect(screen.queryByLabelText('Game Host winner')).toBeNull();
    expect(document.querySelector('.result-player-card')).not.toHaveClass(
      'result-player-card--winner',
    );
  });
  it.each([
    [2, 5],
    [4, 4],
    [6, 3],
    [8, 2],
  ])('limits unique words for %i players to %i', (count, limit) => {
    const base = result(count);
    const x: R = {
      ...base,
      players: base.players.map((p) => ({
        ...p,
        words: Array.from({ length: limit + 2 }, (_, i) => word(`WORD${i}`)),
      })),
    };
    render(<RoundResults results={x} />);
    expect(screen.getAllByText('+2 more')).toHaveLength(count);
  });
  it('sorts copied unique previews longest first, then alphabetically, before limiting', () => {
    const base = result(1);
    const x: R = {
      ...base,
      players: [
        {
          ...base.players[0]!,
          words: [
            word('DOG'),
            word('APPLE'),
            word('ELEPHANT'),
            word('BAKER'),
            word('PLANETS'),
            word('CAT'),
            word('SHARED', true),
          ],
        },
      ],
    };

    render(<RoundResults results={x} />);

    const preview = screen.getByRole('list', {
      name: 'Bright Fox unique words',
    });
    expect(
      within(preview)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['ELEPHANT', 'PLANETS', 'APPLE', 'BAKER', 'CAT', '+1 more']);
    expect(within(preview).queryByText('DOG')).toBeNull();
    expect(within(preview).queryByText('SHARED')).toBeNull();
  });
  it('has no table, disclosure, or interactive controls', () => {
    render(<RoundResults results={result()} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Participant word review')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders 24 inaccessible, round-stable firework bursts', () => {
    const view = render(<RoundResults results={result()} roundNumber={5} />);
    const firstShow = [
      ...document.querySelectorAll('.display-results__firework'),
    ].map((firework) => firework.getAttribute('style'));

    expect(firstShow).toHaveLength(24);
    expect(
      document.querySelector('.display-results__fireworks'),
    ).toHaveAttribute('aria-hidden', 'true');

    view.rerender(<RoundResults results={result()} roundNumber={5} />);
    expect(
      [...document.querySelectorAll('.display-results__firework')].map(
        (firework) => firework.getAttribute('style'),
      ),
    ).toEqual(firstShow);
  });

  it('keeps long player names and unique words inside the card contract', () => {
    const longName = 'A very long player name that must wrap safely on a card';
    const longWord = 'EXTRAORDINARILYLONGUNIQUEWORD';
    const base = result(1);
    render(
      <RoundResults
        results={{
          ...base,
          players: [
            {
              ...base.players[0]!,
              displayName: longName,
              words: [word(longWord)],
            },
          ],
        }}
      />,
    );

    const card = screen
      .getByRole('heading', { name: /A very long/ })
      .closest('li');
    expect(card).toHaveClass('result-player-card');
    expect(within(card!).getByText(longWord)).toBeVisible();
  });
});
