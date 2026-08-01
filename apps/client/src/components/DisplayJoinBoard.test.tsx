import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { qrCodeSvgMock, shouldThrow } = vi.hoisted(() => ({
  qrCodeSvgMock: vi.fn(),
  shouldThrow: { value: false },
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: (props: Record<string, unknown>) => {
    if (shouldThrow.value) throw new Error('Synthetic QR renderer failure');
    qrCodeSvgMock(props);
    return <svg data-testid="generated-qr" aria-hidden="true" />;
  },
}));

import { DisplayJoinBoard } from './DisplayJoinBoard';

const joinUrl = 'https://words.atlee.io/join/ABC234';

describe('DisplayJoinBoard', () => {
  beforeEach(() => {
    qrCodeSvgMock.mockClear();
    shouldThrow.value = false;
  });

  it('renders the exact four-word perimeter around a noninteractive 5 by 5 demonstration', () => {
    const { container } = render(<DisplayJoinBoard joinUrl={joinUrl} />);
    const board = screen.getByLabelText('Room joining demonstration board');
    const tiles = Array.from(
      container.querySelectorAll('.display-join-board__tile'),
    );

    expect(board).toBeVisible();
    expect(tiles).toHaveLength(16);
    expect(tiles.every((tile) => tile.classList.contains('letter-tile'))).toBe(
      true,
    );
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      'W',
      'O',
      'R',
      'D',
      'S',
      'A',
      'H',
      'N',
      'A',
      'N',
      'R',
      'A',
      'T',
      'L',
      'E',
      'E',
    ]);
    expect(
      tiles
        .slice(0, 5)
        .map((tile) => tile.textContent)
        .join(''),
    ).toBe('WORDS');
    expect(
      tiles
        .slice(11)
        .map((tile) => tile.textContent)
        .join(''),
    ).toBe('ATLEE');
    expect(
      [tiles[0], tiles[5], tiles[7], tiles[9], tiles[11]]
        .map((tile) => tile?.textContent)
        .join(''),
    ).toBe('WANNA');
    expect(
      [tiles[4], tiles[6], tiles[8], tiles[10], tiles[15]]
        .map((tile) => tile?.textContent)
        .join(''),
    ).toBe('SHARE');
    expect(board.querySelectorAll('[role="gridcell"], button')).toHaveLength(0);
    expect(
      board.querySelectorAll('.display-join-board__qr .letter-tile'),
    ).toHaveLength(0);
  });

  it('embeds one merged QR region for the authoritative join URL', () => {
    const { container } = render(<DisplayJoinBoard joinUrl={joinUrl} />);

    const qrRegion = screen.getByLabelText('Room joining QR code');
    expect(qrRegion).toBeVisible();
    expect(qrRegion).toHaveClass('display-join-board__qr--rounded');
    expect(
      qrRegion.querySelector('.display-join-board__qr-surface'),
    ).not.toBeNull();
    expect(container.querySelectorAll('.display-join-board__qr')).toHaveLength(
      1,
    );
    expect(qrRegion).toHaveClass('display-join-board__qr');
    expect(screen.getByTestId('generated-qr')).toBeVisible();
    expect(qrCodeSvgMock).toHaveBeenCalledWith(
      expect.objectContaining({
        value: joinUrl,
        size: 320,
        bgColor: 'transparent',
        fgColor: '#000000',
        marginSize: 4,
      }),
    );
  });

  it('uses the exact QR unavailable fallback', () => {
    shouldThrow.value = true;
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    render(<DisplayJoinBoard joinUrl={joinUrl} />, {
      onCaughtError: () => undefined,
    });

    expect(screen.getByText('QR unavailable')).toBeVisible();
    expect(screen.queryByTestId('generated-qr')).toBeNull();
    error.mockRestore();
  });
});
