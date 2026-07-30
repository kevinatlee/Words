import type { CSSProperties } from 'react';

type LetterGridProps = {
  letters: string[];
  size: number;
  label: string;
  selectedIndices?: number[];
  compact?: boolean;
  interactive?: boolean;
  disabled?: boolean;
  onSelect?: (index: number) => void;
};

export function LetterGrid({
  letters,
  size,
  label,
  selectedIndices = [],
  compact = false,
  interactive = false,
  disabled = false,
  onSelect,
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

        const content = (
          <>
            <span>{letter}</span>
            {order && (
              <small className="letter-tile__order" aria-hidden="true">
                {order}
              </small>
            )}
          </>
        );
        const className = `letter-tile${order ? ' letter-tile--selected' : ''}`;
        const ariaLabel = order
          ? `${letter}, selection number ${order}`
          : interactive
            ? `${letter}, tile ${index + 1}`
            : letter;

        return interactive ? (
          <div
            className="letter-grid__cell"
            role="gridcell"
            key={`${letter}-${index}`}
          >
            <button
              className={`${className} letter-tile--button`}
              type="button"
              aria-label={ariaLabel}
              aria-pressed={order !== undefined}
              disabled={disabled}
              onClick={() => onSelect?.(index)}
            >
              {content}
            </button>
          </div>
        ) : (
          <div
            className={className}
            role="gridcell"
            aria-label={ariaLabel}
            key={`${letter}-${index}`}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
