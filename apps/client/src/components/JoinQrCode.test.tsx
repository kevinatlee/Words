import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { qrCodeSvgMock } = vi.hoisted(() => ({
  qrCodeSvgMock: vi.fn(),
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: (props: Record<string, unknown>) => {
    qrCodeSvgMock(props);
    return (
      <svg
        data-testid="generated-qr"
        aria-hidden={props['aria-hidden'] as 'true'}
        focusable={props.focusable as 'false'}
      />
    );
  },
}));

import { JoinQrCode } from './JoinQrCode';

const joinUrl = 'https://words.atlee.io/join/ABC234';

describe('display join QR code', () => {
  beforeEach(() => {
    qrCodeSvgMock.mockClear();
    qrCodeSvgMock.mockImplementation(() => undefined);
  });

  it.each([
    {
      context: 'lobby' as const,
      presentation: 'prominent' as const,
      heading: 'Scan to join',
      instruction: 'Scan with your phone, or enter the room code.',
    },
    {
      context: 'active-round' as const,
      presentation: 'compact' as const,
      heading: 'Join the next round',
      instruction:
        'Scan with your phone to join now and wait for the next round.',
    },
    {
      context: 'ended-round' as const,
      presentation: 'prominent' as const,
      heading: 'Join the next round',
      instruction: 'Scan with your phone before the next round starts.',
    },
  ])(
    'renders the $presentation $context presentation',
    ({ context, presentation, heading, instruction }) => {
      const { container } = render(
        <JoinQrCode
          joinUrl={joinUrl}
          roomCode="ABC234"
          presentation={presentation}
          context={context}
        />,
      );

      const region = screen.getByRole('region', { name: heading });
      expect(region).toHaveClass(`join-qr--${presentation}`);
      expect(region).toHaveClass(`join-qr--${context}`);
      expect(screen.getByText(instruction)).toBeVisible();
      expect(container.querySelector('[aria-live]')).toBeNull();
    },
  );

  it('passes the exact URL and conservative scan options to the SVG renderer', () => {
    render(
      <JoinQrCode
        joinUrl={joinUrl}
        roomCode="ABC234"
        presentation="prominent"
        context="lobby"
      />,
    );

    expect(qrCodeSvgMock).toHaveBeenCalledWith(
      expect.objectContaining({
        value: joinUrl,
        size: 320,
        level: 'M',
        boostLevel: false,
        marginSize: 4,
        bgColor: '#FFFFFF',
        fgColor: '#000000',
        'aria-hidden': 'true',
        focusable: 'false',
      }),
    );
    expect(qrCodeSvgMock.mock.calls[0]?.[0]).not.toHaveProperty(
      'imageSettings',
    );
  });

  it('keeps the exact URL and room code available as accessible text', () => {
    render(
      <JoinQrCode
        joinUrl={joinUrl}
        roomCode="ABC234"
        presentation="prominent"
        context="lobby"
      />,
    );

    const link = screen.getByRole('link', { name: joinUrl });
    expect(link).toHaveAttribute('href', joinUrl);
    expect(link).toHaveClass('join-qr__url');
    expect(link.tabIndex).toBe(0);
    expect(screen.getByText('ABC234')).toBeVisible();
    expect(screen.getByText(/case-insensitive/i)).toBeVisible();
  });

  it('keeps a long current-origin URL in the wrapping text-link boundary', () => {
    const longJoinUrl =
      'https://living-room-display-on-a-very-long-local-hostname.example:5173/join/ABC234';

    render(
      <JoinQrCode
        joinUrl={longJoinUrl}
        roomCode="ABC234"
        presentation="prominent"
        context="lobby"
      />,
    );

    expect(screen.getByRole('link', { name: longJoinUrl })).toHaveAttribute(
      'href',
      longJoinUrl,
    );
    expect(qrCodeSvgMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: longJoinUrl }),
    );
  });

  it('hides the visual encoding from the accessibility tree', () => {
    render(
      <JoinQrCode
        joinUrl={joinUrl}
        roomCode="ABC234"
        presentation="prominent"
        context="lobby"
      />,
    );

    expect(screen.getByTestId('generated-qr')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByTestId('generated-qr')).toHaveAttribute(
      'focusable',
      'false',
    );
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('contains no controller action, timer, or form control', () => {
    render(
      <JoinQrCode
        joinUrl={joinUrl}
        roomCode="ABC234"
        presentation="compact"
        context="active-round"
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('renders deterministically for the same properties', () => {
    const { container, rerender } = render(
      <JoinQrCode
        joinUrl={joinUrl}
        roomCode="ABC234"
        presentation="prominent"
        context="lobby"
      />,
    );
    const firstMarkup = container.innerHTML;

    rerender(
      <JoinQrCode
        joinUrl={joinUrl}
        roomCode="ABC234"
        presentation="prominent"
        context="lobby"
      />,
    );

    expect(container.innerHTML).toBe(firstMarkup);
    expect(qrCodeSvgMock).toHaveBeenCalledTimes(2);
  });

  it('updates both the URL and room-code fallback when the room changes', () => {
    const { rerender } = render(
      <JoinQrCode
        joinUrl={joinUrl}
        roomCode="ABC234"
        presentation="prominent"
        context="lobby"
      />,
    );
    const nextUrl = 'https://words.atlee.io/join/DEF567';

    rerender(
      <JoinQrCode
        joinUrl={nextUrl}
        roomCode="DEF567"
        presentation="prominent"
        context="lobby"
      />,
    );

    expect(screen.getByRole('link', { name: nextUrl })).toHaveAttribute(
      'href',
      nextUrl,
    );
    expect(screen.getByText('DEF567')).toBeVisible();
    expect(qrCodeSvgMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: nextUrl }),
    );
  });

  it('does not perform network work or schedule cleanup on mount or unmount', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const { unmount } = render(
      <JoinQrCode
        joinUrl={joinUrl}
        roomCode="ABC234"
        presentation="compact"
        context="active-round"
      />,
    );

    unmount();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(timeoutSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    timeoutSpy.mockRestore();
  });

  it('keeps the manual join information available if SVG rendering fails', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    qrCodeSvgMock.mockImplementation(() => {
      throw new Error('synthetic QR renderer failure');
    });

    render(
      <JoinQrCode
        joinUrl={joinUrl}
        roomCode="ABC234"
        presentation="prominent"
        context="lobby"
      />,
      {
        onCaughtError: () => undefined,
        onRecoverableError: () => undefined,
      },
    );

    expect(screen.getByRole('link', { name: joinUrl })).toHaveAttribute(
      'href',
      joinUrl,
    );
    expect(screen.getByText('ABC234')).toBeVisible();
    expect(screen.getByText(/QR unavailable/i)).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
