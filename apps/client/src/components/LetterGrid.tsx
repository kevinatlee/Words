import {
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent,
} from 'react';

import type { WordEntryMode } from '../utils/word-entry';

type LetterGridProps = {
  letters: string[];
  size: number;
  label: string;
  selectedIndices?: number[];
  compact?: boolean;
  interactive?: boolean;
  disabled?: boolean;
  onSelect?: (index: number) => void;
  entryMode?: WordEntryMode;
  traceResetKey?: string;
  onTraceStart?: (index: number) => void;
  onTraceMove?: (index: number) => void;
  onTraceEnd?: () => void;
  onTraceCancel?: () => void;
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
  entryMode = 'touch',
  traceResetKey = '',
  onTraceStart,
  onTraceMove,
  onTraceEnd,
  onTraceCancel,
}: LetterGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const lastTraceTileIndexRef = useRef<number | null>(null);
  const selectedOrder = new Map(
    selectedIndices.map((tileIndex, order) => [tileIndex, order + 1]),
  );
  const traceEnabled = interactive && !disabled && entryMode === 'trace';

  const indexFromElement = (element: Element | null): number | null => {
    const tile = element?.closest<HTMLButtonElement>('[data-tile-index]');
    const value = tile?.dataset.tileIndex;
    return value === undefined ? null : Number.parseInt(value, 10);
  };

  const indexFromPointer = (
    event: PointerEvent<HTMLDivElement>,
  ): number | null => {
    const pointedElement = document.elementFromPoint?.(
      event.clientX,
      event.clientY,
    );
    return (
      indexFromElement(pointedElement) ??
      indexFromElement(event.target as Element | null)
    );
  };

  const cancelTrace = () => {
    const pointerId = activePointerIdRef.current;
    if (pointerId === null) {
      return;
    }
    activePointerIdRef.current = null;
    lastTraceTileIndexRef.current = null;
    if (gridRef.current?.hasPointerCapture?.(pointerId)) {
      gridRef.current.releasePointerCapture(pointerId);
    }
    onTraceCancel?.();
  };

  useEffect(() => {
    cancelTrace();
    // traceResetKey changes only when the parent invalidates input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceResetKey]);

  useEffect(
    () => () => {
      cancelTrace();
    },
    // The cleanup intentionally reads the callback from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (
      !traceEnabled ||
      (event.pointerType === 'mouse' && event.button !== 0)
    ) {
      return;
    }
    const tileIndex = indexFromPointer(event);
    if (tileIndex === null) {
      return;
    }
    event.preventDefault();
    activePointerIdRef.current = event.pointerId;
    lastTraceTileIndexRef.current = tileIndex;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onTraceStart?.(tileIndex);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const tileIndex = indexFromPointer(event);
    if (tileIndex !== null && tileIndex !== lastTraceTileIndexRef.current) {
      lastTraceTileIndexRef.current = tileIndex;
      onTraceMove?.(tileIndex);
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const tileIndex = indexFromPointer(event);
    if (tileIndex !== null && tileIndex !== lastTraceTileIndexRef.current) {
      lastTraceTileIndexRef.current = tileIndex;
      onTraceMove?.(tileIndex);
    }
    activePointerIdRef.current = null;
    lastTraceTileIndexRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onTraceEnd?.();
  };

  return (
    <div
      className={`letter-grid${compact ? ' letter-grid--compact' : ''}${traceEnabled ? ' letter-grid--trace' : ''}`}
      style={{ '--grid-size': size } as CSSProperties}
      role="grid"
      aria-label={label}
      ref={gridRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={cancelTrace}
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
              data-tile-index={index}
              onClick={(event) => {
                if (entryMode === 'trace' && event.detail !== 0) {
                  return;
                }
                onSelect?.(index);
              }}
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
