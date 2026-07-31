import { render, screen } from '@testing-library/react';
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
  it('uses the Round N Results heading and server card order', () => {
    render(<RoundResults roundNumber={2} results={result()} />);
    expect(
      screen.getByRole('heading', { name: 'Round 2 Results' }),
    ).toBeVisible();
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((x) => x.textContent),
    ).toEqual(expect.arrayContaining(['♛ Bright Fox', 'Amber Kite']));
  });
  it('shows integer points and accepted/unique counts', () => {
    render(<RoundResults roundNumber={1} results={result()} />);
    expect(screen.getByText('7 points')).toBeVisible();
    expect(screen.getAllByText('Accepted: 2 · Unique: 1')).toHaveLength(2);
  });
  it('lists unique words but not shared words', () => {
    render(<RoundResults roundNumber={1} results={result()} />);
    expect(screen.getAllByText('UNIQUE')).toHaveLength(2);
    expect(screen.queryByText('SHARED')).toBeNull();
  });
  it('crowns every tied winner accessibly', () => {
    const x: R = { ...result(), winnerPlayerIds: [a, b] };
    render(<RoundResults roundNumber={1} results={x} />);
    expect(screen.getAllByLabelText('Game Host winner')).toHaveLength(2);
  });
  it('does not crown an all-zero result', () => {
    const x: R = { ...result(), winnerPlayerIds: [] };
    render(<RoundResults roundNumber={1} results={x} />);
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
    render(<RoundResults roundNumber={1} results={x} />);
    expect(screen.getAllByText('+2 more')).toHaveLength(count);
  });
  it('has no table, disclosure, or interactive controls', () => {
    render(<RoundResults roundNumber={1} results={result()} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Participant word review')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
