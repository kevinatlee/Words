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
});
