import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent,
} from 'react';

import type { WordEntryMode } from '../utils/word-entry';
import {
  resolveTraceSegment,
  type TracePoint,
  type TraceRect,
} from '../utils/trace-resolver';

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

export function LetterGrid({
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
  const tileElementsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const activePointerIdRef = useRef<number | null>(null);
  const previousTracePointRef = useRef<TracePoint | null>(null);
  const tracePathRef = useRef<number[]>([]);
  const traceRectCacheRef = useRef<Map<number, TraceRect>>(new Map());
  const pendingTracePointsRef = useRef<TracePoint[]>([]);
  const traceAnimationFrameRef = useRef<number | null>(null);
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

  const cancelTraceAnimationFrame = useCallback(() => {
    if (traceAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(traceAnimationFrameRef.current);
      traceAnimationFrameRef.current = null;
    }
  }, []);

  const cancelTrace = useCallback(() => {
    const pointerId = activePointerIdRef.current;
    cancelTraceAnimationFrame();
    pendingTracePointsRef.current = [];
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
  }, [cancelTraceAnimationFrame]);

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
    cancelTraceAnimationFrame();
    pendingTracePointsRef.current = [];
    traceRectCacheRef.current.clear();
    activePointerIdRef.current = event.pointerId;
    previousTracePointRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    tracePathRef.current = [...(onTraceStart?.(tileIndex) ?? [])];
  };

  const processTracePoint = (currentPoint: TracePoint) => {
    const previousPoint = previousTracePointRef.current;
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

  const flushPendingTracePoints = () => {
    const points = pendingTracePointsRef.current;
    pendingTracePointsRef.current = [];
    for (const point of points) {
      processTracePoint(point);
    }
  };

  const queueTracePoints = (event: PointerEvent<HTMLDivElement>) => {
    const coalescedEvents = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const appendPoint = (point: { clientX: number; clientY: number }) => {
      const previousPendingPoint = pendingTracePointsRef.current.at(-1);
      if (
        previousPendingPoint?.x === point.clientX &&
        previousPendingPoint.y === point.clientY
      ) {
        return;
      }
      pendingTracePointsRef.current.push({
        x: point.clientX,
        y: point.clientY,
      });
    };
    for (const point of coalescedEvents) {
      appendPoint(point);
    }
    // A browser normally includes the dispatched event in its coalesced list,
    // but appending it defensively guarantees that the newest coordinate is
    // always processed. Duplicate coordinates are discarded above.
    appendPoint(event);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }
    event.preventDefault();
    queueTracePoints(event);
    if (traceAnimationFrameRef.current === null) {
      traceAnimationFrameRef.current = window.requestAnimationFrame(() => {
        traceAnimationFrameRef.current = null;
        flushPendingTracePoints();
      });
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }
    event.preventDefault();
    cancelTraceAnimationFrame();
    flushPendingTracePoints();
    processTracePoint({ x: event.clientX, y: event.clientY });
    activePointerIdRef.current = null;
    previousTracePointRef.current = null;
    tracePathRef.current = [];
    traceRectCacheRef.current.clear();
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
