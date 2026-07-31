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

  it('renders a noninteractive 5 by 5 demonstration with WORDS on top', () => {
    const { container } = render(<DisplayJoinBoard joinUrl={joinUrl} />);
    const board = screen.getByLabelText('Room joining demonstration board');
    const tiles = Array.from(
      container.querySelectorAll('.display-join-board__tile'),
    );

    expect(board).toBeVisible();
    expect(tiles).toHaveLength(16);
    expect(tiles.slice(0, 5).map((tile) => tile.textContent)).toEqual([
      'W',
      'O',
      'R',
      'D',
      'S',
    ]);
    expect(board.querySelectorAll('[role="gridcell"], button')).toHaveLength(0);
    expect(
      board.querySelectorAll('.display-join-board__qr .letter-tile'),
    ).toHaveLength(0);
  });

  it('embeds one merged QR region for the authoritative join URL', () => {
    const { container } = render(<DisplayJoinBoard joinUrl={joinUrl} />);

    expect(screen.getByLabelText('Room joining QR code')).toBeVisible();
    expect(container.querySelectorAll('.display-join-board__qr')).toHaveLength(
      1,
    );
    expect(screen.getByTestId('generated-qr')).toBeVisible();
    expect(qrCodeSvgMock).toHaveBeenCalledWith(
      expect.objectContaining({ value: joinUrl, size: 320 }),
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
