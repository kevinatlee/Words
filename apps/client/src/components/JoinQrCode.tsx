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
      <span className="join-qr__unavailable">QR unavailable</span>
    ) : (
      this.props.children
    );
  }
}

const contextCopy = {
  lobby: {
    heading: 'Scan to Join',
    instruction: '',
  },
  'active-round': {
    heading: 'Join Next Round',
    instruction: '',
  },
  'ended-round': {
    heading: 'Join Next Round',
    instruction: '',
  },
} as const;

export function JoinQrCode({
  joinUrl,
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
        <h2 id={headingId}>{copy.heading}</h2>
        {copy.instruction && <p>{copy.instruction}</p>}
      </div>
    </section>
  );
}
