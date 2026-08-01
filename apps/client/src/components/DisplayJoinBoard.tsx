import { Component, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';

type DisplayJoinBoardProps = { readonly joinUrl: string };

class QrBoundary extends Component<
  { readonly children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <span>QR unavailable</span>
    ) : (
      this.props.children
    );
  }
}

const perimeter = [
  'W',
  'O',
  'R',
  'D',
  'S',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
];

export function DisplayJoinBoard({ joinUrl }: DisplayJoinBoardProps) {
  return (
    <section
      className="display-join-board"
      aria-label="Room joining demonstration board"
    >
      {perimeter.map((letter, index) => (
        <span
          className={`letter-tile display-join-board__tile display-join-board__tile--${index + 1}`}
          key={`${letter}-${index}`}
        >
          {letter}
        </span>
      ))}
      <div
        className="display-join-board__qr display-join-board__qr--rounded"
        aria-label="Room joining QR code"
      >
        <div className="display-join-board__qr-surface">
          <QrBoundary key={joinUrl}>
            <QRCodeSVG
              value={joinUrl}
              size={320}
              level="M"
              boostLevel={false}
              marginSize={4}
              bgColor="transparent"
              fgColor="#000000"
              aria-hidden="true"
              focusable="false"
            />
          </QrBoundary>
        </div>
      </div>
    </section>
  );
}
