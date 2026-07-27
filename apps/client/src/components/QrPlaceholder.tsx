const qrCells = Array.from({ length: 49 }, (_, index) =>
  [
    0, 1, 2, 6, 7, 9, 13, 14, 15, 16, 20, 24, 27, 28, 30, 32, 34, 36, 38, 40,
    42, 43, 44, 48,
  ].includes(index),
);

export function QrPlaceholder() {
  return (
    <div
      className="qr-placeholder"
      role="img"
      aria-label="QR code placeholder. No join link is connected."
    >
      <div className="qr-placeholder__pattern" aria-hidden="true">
        {qrCells.map((filled, index) => (
          <span
            className={filled ? 'qr-placeholder__cell--filled' : ''}
            key={index}
          />
        ))}
      </div>
      <strong>QR placeholder</strong>
      <small>Join link comes later</small>
    </div>
  );
}
