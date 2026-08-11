import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import type { WordEntryMode } from '../utils/word-entry';
import {
  resolveTraceSegment,
  type TracePoint,
  type TraceRect,
} from '../utils/trace-resolver';

const TRACE_SAMPLE_INTERVAL_MS = 33;

type LetterGridProps = {
  letters: string[];
  size: number;
  label: string;
  selectedIndices?: readonly number[];
  acceptedIndices?: readonly number[];
  compact?: boolean;
  interactive?: boolean;
  disabled?: boolean;
  onSelect?: (index: number) => void;
  entryMode?: WordEntryMode;
  traceResetKey?: string;
  onTraceStart?: (index: number) => readonly number[] | void;
  onTraceMove?: (index: number) => readonly number[] | void;
  onTraceEnd?: () => void;
  onTraceCancel?: () => void;
};

export const LetterGrid = memo(function LetterGrid({
  letters,
  size,
  label,
  selectedIndices = [],
  acceptedIndices = [],
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
  const tileElementsRef = useRef<Array<HTMLElement | null>>([]);
  const activePointerIdRef = useRef<number | null>(null);
  const previousTracePointRef = useRef<TracePoint | null>(null);
  const tracePathRef = useRef<number[]>([]);
  const traceRectCacheRef = useRef<Map<number, TraceRect>>(new Map());
  const latestTracePointRef = useRef<TracePoint | null>(null);
  const traceSampleTimeoutRef = useRef<number | null>(null);
  const lastTraceSampleAtRef = useRef<number | null>(null);
  const onTraceMoveRef = useRef(onTraceMove);
  const onTraceCancelRef = useRef(onTraceCancel);
  const selectedOrder = new Map(
    selectedIndices.map((tileIndex, order) => [tileIndex, order + 1]),
  );
  const acceptedTileIndexes = new Set(acceptedIndices);
  const traceEnabled = interactive && !disabled && entryMode === 'trace';

  useEffect(() => {
    onTraceMoveRef.current = onTraceMove;
    onTraceCancelRef.current = onTraceCancel;
  }, [onTraceCancel, onTraceMove]);

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

  const cancelTraceSample = useCallback(() => {
    if (traceSampleTimeoutRef.current !== null) {
      window.clearTimeout(traceSampleTimeoutRef.current);
      traceSampleTimeoutRef.current = null;
    }
  }, []);

  const cancelTrace = useCallback(() => {
    const pointerId = activePointerIdRef.current;
    cancelTraceSample();
    latestTracePointRef.current = null;
    lastTraceSampleAtRef.current = null;
    activePointerIdRef.current = null;
    previousTracePointRef.current = null;
    tracePathRef.current = [];
    traceRectCacheRef.current.clear();
    if (pointerId !== null && gridRef.current?.hasPointerCapture?.(pointerId)) {
      gridRef.current.releasePointerCapture(pointerId);
    }
    if (pointerId !== null) {
      onTraceCancelRef.current?.();
    }
  }, [cancelTraceSample]);

  useEffect(() => {
    cancelTrace();
  }, [cancelTrace, traceResetKey]);

  useEffect(() => {
    if (!traceEnabled) {
      cancelTrace();
      return;
    }
    const invalidateTraceGeometry = () => {
      traceRectCacheRef.current.clear();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        cancelTrace();
      }
    };
    window.addEventListener('resize', invalidateTraceGeometry);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelTrace();
      window.removeEventListener('resize', invalidateTraceGeometry);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cancelTrace, traceEnabled]);

  const traceRectForIndex = (index: number): TraceRect | null => {
    const cached = traceRectCacheRef.current.get(index);
    if (cached) {
      return cached;
    }
    const tile = tileElementsRef.current[index];
    if (!tile) {
      return null;
    }
    const rect = tile.getBoundingClientRect();
    const traceRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    traceRectCacheRef.current.set(index, traceRect);
    return traceRect;
  };

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
    cancelTraceSample();
    latestTracePointRef.current = null;
    lastTraceSampleAtRef.current = null;
    traceRectCacheRef.current.clear();
    activePointerIdRef.current = event.pointerId;
    previousTracePointRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    tracePathRef.current = [...(onTraceStart?.(tileIndex) ?? [])];
  };

  const processTracePoint = (currentPoint: TracePoint) => {
    const previousPoint = previousTracePointRef.current;
    if (
      previousPoint?.x === currentPoint.x &&
      previousPoint.y === currentPoint.y
    ) {
      return;
    }
    previousTracePointRef.current = currentPoint;
    if (!previousPoint || tracePathRef.current.length === 0) {
      return;
    }
    const resolvedPath = resolveTraceSegment(
      tracePathRef.current,
      previousPoint,
      currentPoint,
      size,
      traceRectForIndex,
    );
    if (
      resolvedPath.length === tracePathRef.current.length &&
      resolvedPath.every(
        (index, order) => index === tracePathRef.current[order],
      )
    ) {
      return;
    }
    const previousPath = tracePathRef.current;
    const sharedPrefixLength = previousPath.findIndex(
      (index, order) => index !== resolvedPath[order],
    );
    const firstChangedIndex =
      sharedPrefixLength === -1
        ? Math.min(previousPath.length, resolvedPath.length)
        : sharedPrefixLength;
    const nextIndexes =
      firstChangedIndex === previousPath.length
        ? resolvedPath.slice(firstChangedIndex)
        : [
            resolvedPath[firstChangedIndex - 1],
            ...resolvedPath.slice(firstChangedIndex),
          ];
    for (const index of nextIndexes) {
      if (index === undefined) {
        continue;
      }
      tracePathRef.current = [
        ...(onTraceMoveRef.current?.(index) ?? resolvedPath),
      ];
    }
  };

  const flushLatestTracePoint = () => {
    const point = latestTracePointRef.current;
    latestTracePointRef.current = null;
    if (!point) {
      return;
    }
    lastTraceSampleAtRef.current = performance.now();
    processTracePoint(point);
  };

  const scheduleTraceSample = () => {
    if (traceSampleTimeoutRef.current !== null) {
      return;
    }
    const lastSampleAt = lastTraceSampleAtRef.current;
    const remaining =
      lastSampleAt === null
        ? 0
        : Math.max(
            0,
            TRACE_SAMPLE_INTERVAL_MS - (performance.now() - lastSampleAt),
          );
    if (remaining === 0) {
      flushLatestTracePoint();
      return;
    }
    traceSampleTimeoutRef.current = window.setTimeout(() => {
      traceSampleTimeoutRef.current = null;
      flushLatestTracePoint();
    }, remaining);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }
    event.preventDefault();
    latestTracePointRef.current = { x: event.clientX, y: event.clientY };
    scheduleTraceSample();
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }
    event.preventDefault();
    cancelTraceSample();
    flushLatestTracePoint();
    processTracePoint({ x: event.clientX, y: event.clientY });
    activePointerIdRef.current = null;
    previousTracePointRef.current = null;
    tracePathRef.current = [];
    traceRectCacheRef.current.clear();
    lastTraceSampleAtRef.current = null;
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
        const isAccepted = acceptedTileIndexes.has(index);

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
        const className = `letter-tile${order ? ' letter-tile--selected' : ''}${isAccepted ? ' letter-tile--accepted' : ''}`;
        const ariaLabel = order
          ? `${letter}, selection number ${order}`
          : interactive
            ? `${letter}, tile ${index + 1}`
            : letter;

        const selectWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key !== 'Enter' && event.key !== ' ') {
            return;
          }
          event.preventDefault();
          onSelect?.(index);
        };

        if (traceEnabled) {
          return (
            <div
              className="letter-grid__cell"
              role="gridcell"
              key={`${letter}-${index}`}
            >
              <div
                className={`${className} letter-tile--trace-target`}
                role="button"
                tabIndex={0}
                aria-label={ariaLabel}
                aria-pressed={order !== undefined}
                data-tile-index={index}
                ref={(tile) => {
                  tileElementsRef.current[index] = tile;
                }}
                onKeyDown={selectWithKeyboard}
                onClick={(event) => {
                  if (event.detail === 0) {
                    onSelect?.(index);
                  }
                }}
              >
                {content}
              </div>
            </div>
          );
        }

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
              ref={(tile) => {
                tileElementsRef.current[index] = tile;
              }}
              onClick={() => {
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
});
