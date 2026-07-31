export type TracePoint = Readonly<{ x: number; y: number }>;

export type TraceRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

const TRACE_ACTIVATION_INSET_RATIO = 0.22;
const TRACE_DIRECTION_MIN_ALIGNMENT = 0.8;

function centerOf(rect: TraceRect): TracePoint {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function adjacentIndexes(index: number, size: number): number[] {
  const row = Math.floor(index / size);
  const column = index % size;
  const neighbors: number[] = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) {
        continue;
      }
      const nextRow = row + rowOffset;
      const nextColumn = column + columnOffset;
      if (
        nextRow >= 0 &&
        nextRow < size &&
        nextColumn >= 0 &&
        nextColumn < size
      ) {
        neighbors.push(nextRow * size + nextColumn);
      }
    }
  }

  return neighbors;
}

function segmentEntry(
  from: TracePoint,
  to: TracePoint,
  rect: TraceRect,
): number | null {
  const insetX = Math.min(
    rect.width * TRACE_ACTIVATION_INSET_RATIO,
    rect.width / 2,
  );
  const insetY = Math.min(
    rect.height * TRACE_ACTIVATION_INSET_RATIO,
    rect.height / 2,
  );
  const bounds = {
    left: rect.left + insetX,
    right: rect.left + rect.width - insetX,
    top: rect.top + insetY,
    bottom: rect.top + rect.height - insetY,
  };
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  let start = 0;
  let end = 1;

  for (const [position, delta, minimum, maximum] of [
    [from.x, deltaX, bounds.left, bounds.right],
    [from.y, deltaY, bounds.top, bounds.bottom],
  ] as const) {
    if (delta === 0) {
      if (position < minimum || position > maximum) {
        return null;
      }
      continue;
    }
    const first = (minimum - position) / delta;
    const last = (maximum - position) / delta;
    start = Math.max(start, Math.min(first, last));
    end = Math.min(end, Math.max(first, last));
    if (start > end) {
      return null;
    }
  }

  return start;
}

function alignsWithCandidate(
  tail: TracePoint,
  activation: TracePoint,
  candidateCenter: TracePoint,
): boolean {
  const pointerX = activation.x - tail.x;
  const pointerY = activation.y - tail.y;
  const candidateX = candidateCenter.x - tail.x;
  const candidateY = candidateCenter.y - tail.y;
  const pointerLength = Math.hypot(pointerX, pointerY);
  const candidateLength = Math.hypot(candidateX, candidateY);

  return (
    pointerLength > 0 &&
    candidateLength > 0 &&
    (pointerX * candidateX + pointerY * candidateY) /
      (pointerLength * candidateLength) >=
      TRACE_DIRECTION_MIN_ALIGNMENT
  );
}

/**
 * Resolves a pointer segment through the inset centre of legal neighboring
 * tiles. The inset avoids committing a tile from a shared edge or corner, and
 * the directional threshold keeps a diagonal trajectory diagonal under small
 * hand jitter. Repeating along the segment preserves fast multi-tile traces.
 */
export function resolveTraceSegment(
  path: readonly number[],
  from: TracePoint,
  to: TracePoint,
  size: number,
  rectForIndex: (index: number) => TraceRect | null,
): number[] {
  const resolved = [...path];
  let progressFloor = 0;

  while (resolved.length > 0) {
    const tailIndex = resolved.at(-1);
    if (tailIndex === undefined) {
      break;
    }
    const tailRect = rectForIndex(tailIndex);
    if (!tailRect) {
      break;
    }
    const tailCenter = centerOf(tailRect);
    const candidates = adjacentIndexes(tailIndex, size);
    const matches = candidates.flatMap((index) => {
      const rect = rectForIndex(index);
      if (!rect) {
        return [];
      }
      const progress = segmentEntry(from, to, rect);
      if (progress === null || progress <= progressFloor) {
        return [];
      }
      const activation = {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      };
      return alignsWithCandidate(tailCenter, activation, centerOf(rect))
        ? [{ index, progress }]
        : [];
    });
    const next = matches.sort(
      (left, right) => left.progress - right.progress,
    )[0];
    if (!next) {
      break;
    }

    const existingIndex = resolved.indexOf(next.index);
    if (existingIndex === -1) {
      resolved.push(next.index);
    } else {
      resolved.splice(existingIndex + 1);
    }
    progressFloor = next.progress;
  }

  return resolved;
}
