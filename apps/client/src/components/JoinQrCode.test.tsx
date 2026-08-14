import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildJoinUrl } from '@words/shared';
const { qrCodeSvgMock, shouldThrow } = vi.hoisted(() => ({
  qrCodeSvgMock: vi.fn(),
  shouldThrow: { value: false },
}));
vi.mock('qrcode.react', () => ({
  QRCodeSVG: (props: Record<string, unknown>) => {
    if (shouldThrow.value) throw new Error('synthetic QR renderer failure');
    qrCodeSvgMock(props);
    return <svg data-testid="generated-qr" aria-hidden="true" />;
  },
}));
import { JoinQrCode } from './JoinQrCode';
const url = 'https://words.atlee.io/join/ABC234';
const renderQr = (
  context: 'lobby' | 'active-round' | 'ended-round' = 'lobby',
) =>
  render(
    <JoinQrCode
      joinUrl={url}
      roomCode="ABC234"
      presentation={context === 'active-round' ? 'compact' : 'prominent'}
      context={context}
    />,
  );
describe('display join QR code', () => {
  beforeEach(() => {
    qrCodeSvgMock.mockClear();
    shouldThrow.value = false;
  });
  it('uses prominent lobby presentation', () => {
    renderQr();
    expect(screen.getByRole('heading', { name: 'Scan to Join' })).toBeVisible();
    expect(screen.getByRole('region')).toHaveClass('join-qr--prominent');
  });
  it('uses compact active presentation', () => {
    renderQr('active-round');
    expect(screen.getByRole('heading', { name: 'Scan to Join' })).toBeVisible();
    expect(screen.queryByText('Join Next Round')).toBeNull();
    expect(screen.getByRole('region')).toHaveClass('join-qr--compact');
  });
  it('encodes the exact join URL', () => {
    renderQr();
    expect(qrCodeSvgMock).toHaveBeenCalledWith(
      expect.objectContaining({ value: url }),
    );
  });
  it('preserves a long self-hosted origin and ordinary join path exactly', () => {
    const longUrl = buildJoinUrl(
      'https://soomanywords.myveryowndomain.com',
      'ABC234',
    );
    render(
      <JoinQrCode
        joinUrl={longUrl}
        roomCode="ABC234"
        presentation="compact"
        context="active-round"
      />,
    );
    expect(qrCodeSvgMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        value: 'https://soomanywords.myveryowndomain.com/join/ABC234',
        size: 320,
        level: 'M',
        boostLevel: false,
        marginSize: 4,
        bgColor: '#FFFFFF',
        fgColor: '#000000',
        'aria-hidden': 'true',
      }),
    );
  });
  it('renders inline SVG', () => {
    renderQr();
    expect(screen.getByTestId('generated-qr')).toBeVisible();
  });
  it('hides the visual encoding from assistive technology', () => {
    renderQr();
    expect(screen.getByTestId('generated-qr')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
  it('does not show a room code', () => {
    renderQr();
    expect(screen.queryByText('ABC234')).toBeNull();
  });
  it('does not show the full join URL', () => {
    renderQr();
    expect(screen.queryByText(url)).toBeNull();
  });
  it('does not show former instructional copy', () => {
    renderQr();
    expect(
      screen.queryByText(
        /Phone players|case-insensitive|ordinary player join/i,
      ),
    ).toBeNull();
  });
  it('has no controls', () => {
    renderQr();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('renders deterministically', () => {
    const { container, rerender } = renderQr();
    const html = container.innerHTML;
    rerender(
      <JoinQrCode
        joinUrl={url}
        roomCode="ABC234"
        presentation="prominent"
        context="lobby"
      />,
    );
    expect(container.innerHTML).toBe(html);
  });
  it('updates the encoded room URL', () => {
    const { rerender } = renderQr();
    rerender(
      <JoinQrCode
        joinUrl="https://words.atlee.io/join/DEF567"
        roomCode="DEF567"
        presentation="prominent"
        context="lobby"
      />,
    );
    expect(qrCodeSvgMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 'https://words.atlee.io/join/DEF567' }),
    );
  });
  it('shows the concise failure fallback', () => {
    shouldThrow.value = true;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <JoinQrCode
        joinUrl={url}
        roomCode="ABC234"
        presentation="prominent"
        context="lobby"
      />,
      { onCaughtError: () => undefined },
    );
    expect(screen.getByText('QR unavailable')).toBeVisible();
    expect(screen.queryByTestId('generated-qr')).toBeNull();
    spy.mockRestore();
  });
});
