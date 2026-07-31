import { Component, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';

type JoinQrCodeProps = {
  readonly joinUrl: string;
  readonly roomCode: string;
  readonly presentation: 'prominent' | 'compact';
  readonly context: 'lobby' | 'active-round' | 'ended-round';
};

type QrVisualBoundaryState = {
  readonly failed: boolean;
};

class QrVisualBoundary extends Component<
  { readonly children: ReactNode },
  QrVisualBoundaryState
> {
  state: QrVisualBoundaryState = { failed: false };

  static getDerivedStateFromError(): QrVisualBoundaryState {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <span className="join-qr__unavailable">
        QR unavailable. Use the link or room code.
      </span>
    ) : (
      this.props.children
    );
  }
}

const contextCopy = {
  lobby: {
    heading: 'Scan to join',
    instruction: 'Scan with your phone, or enter the room code.',
  },
  'active-round': {
    heading: 'Join the next round',
    instruction:
      'Scan with your phone to join now and wait for the next round.',
  },
  'ended-round': {
    heading: 'Join the next round',
    instruction: 'Scan with your phone before the next round starts.',
  },
} as const;

export function JoinQrCode({
  joinUrl,
  roomCode,
  presentation,
  context,
}: JoinQrCodeProps) {
  const copy = contextCopy[context];
  const headingId = `join-qr-${context}-title`;

  return (
    <section
      className={`join-qr join-qr--${presentation} join-qr--${context}`}
      aria-labelledby={headingId}
    >
      <div className="join-qr__visual" aria-hidden="true">
        <QrVisualBoundary key={joinUrl}>
          <QRCodeSVG
            value={joinUrl}
            size={320}
            level="M"
            boostLevel={false}
            marginSize={4}
            bgColor="#FFFFFF"
            fgColor="#000000"
            aria-hidden="true"
            focusable="false"
          />
        </QrVisualBoundary>
      </div>
      <div className="join-qr__copy">
        <span className="eyebrow">Phone players</span>
        <h2 id={headingId}>{copy.heading}</h2>
        <p>{copy.instruction}</p>
        <p className="join-qr__manual">
          Room code <strong>{roomCode}</strong> <span>— case-insensitive</span>
        </p>
        <a className="join-url join-qr__url" href={joinUrl}>
          {joinUrl}
        </a>
        <small>The QR and link open the ordinary player join form.</small>
      </div>
    </section>
  );
}
