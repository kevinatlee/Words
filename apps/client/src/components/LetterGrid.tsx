import type { CSSProperties } from 'react';

type LetterGridProps = {
  letters: string[];
  size: number;
  label: string;
  selectedIndices?: number[];
  compact?: boolean;
};

export function LetterGrid({
  letters,
  size,
  label,
  selectedIndices = [],
  compact = false,
}: LetterGridProps) {
  const selectedOrder = new Map(
    selectedIndices.map((tileIndex, order) => [tileIndex, order + 1]),
  );

  return (
    <div
      className={`letter-grid${compact ? ' letter-grid--compact' : ''}`}
      style={{ '--grid-size': size } as CSSProperties}
      role="grid"
      aria-label={label}
    >
      {letters.map((letter, index) => {
        const order = selectedOrder.get(index);

        return (
          <div
            className={`letter-tile${order ? ' letter-tile--selected' : ''}`}
            role="gridcell"
            aria-label={order ? `${letter}, selection number ${order}` : letter}
            key={`${letter}-${index}`}
          >
            <span>{letter}</span>
            {order && (
              <small className="letter-tile__order" aria-hidden="true">
                {order}
              </small>
            )}
          </div>
        );
      })}
    </div>
  );
}
