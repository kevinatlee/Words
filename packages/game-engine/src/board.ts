export const SUPPORTED_BOARD_SIZES = Object.freeze([4, 5, 6] as const);
export const MAX_TILE_TOKEN_LENGTH = 4;

export type BoardSize = (typeof SUPPORTED_BOARD_SIZES)[number];
export type TileIndex = number;
export type TileToken = string;
export type TilePath = readonly TileIndex[];

export interface Board {
  readonly size: BoardSize;
  readonly tiles: readonly TileToken[];
}

export interface Coordinate {
  readonly row: number;
  readonly column: number;
}

export type BoardErrorCode =
  | 'INVALID_BOARD'
  | 'INVALID_SIZE'
  | 'INVALID_TILE_COUNT'
  | 'INVALID_TILE_TOKEN';

export type BoardValidationResult =
  | {
      readonly valid: true;
      readonly board: Board;
    }
  | {
      readonly valid: false;
      readonly code: BoardErrorCode;
      readonly tileIndex?: number;
    };

const EMPTY_NEIGHBORS = Object.freeze([]) as readonly TileIndex[];
const ASCII_TILE_TOKEN = /^[A-Za-z]+$/u;
const CANONICAL_TILE_TOKEN = /^[A-Z]+$/u;

export function isBoardSize(value: unknown): value is BoardSize {
  return value === 4 || value === 5 || value === 6;
}

export function normalizeConfiguredTileToken(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!ASCII_TILE_TOKEN.test(trimmed)) {
    return null;
  }

  const normalized = trimmed.toUpperCase();
  return isCanonicalTileToken(normalized) ? normalized : null;
}

export function isCanonicalTileToken(value: unknown): value is TileToken {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_TILE_TOKEN_LENGTH &&
    CANONICAL_TILE_TOKEN.test(value)
  );
}

export function validateBoard(candidate: unknown): BoardValidationResult {
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    return { valid: false, code: 'INVALID_BOARD' };
  }

  const record = candidate as Record<string, unknown>;
  const size = record.size;
  if (!isBoardSize(size)) {
    return { valid: false, code: 'INVALID_SIZE' };
  }

  const tiles = record.tiles;
  if (!Array.isArray(tiles)) {
    return { valid: false, code: 'INVALID_BOARD' };
  }

  if (tiles.length !== size * size) {
    return { valid: false, code: 'INVALID_TILE_COUNT' };
  }

  for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
    if (!isCanonicalTileToken(tiles[tileIndex])) {
      return { valid: false, code: 'INVALID_TILE_TOKEN', tileIndex };
    }
  }

  return {
    valid: true,
    board: freezeBoard(size, tiles as TileToken[]),
  };
}

export function coordinateToIndex(
  size: unknown,
  row: unknown,
  column: unknown,
): TileIndex | null {
  if (
    !isBoardSize(size) ||
    !Number.isInteger(row) ||
    !Number.isInteger(column) ||
    (row as number) < 0 ||
    (column as number) < 0 ||
    (row as number) >= size ||
    (column as number) >= size
  ) {
    return null;
  }

  return (row as number) * size + (column as number);
}

export function indexToCoordinate(
  size: unknown,
  tileIndex: unknown,
): Coordinate | null {
  if (
    !isBoardSize(size) ||
    !Number.isInteger(tileIndex) ||
    (tileIndex as number) < 0 ||
    (tileIndex as number) >= size * size
  ) {
    return null;
  }

  return Object.freeze({
    row: Math.floor((tileIndex as number) / size),
    column: (tileIndex as number) % size,
  });
}

export function getAdjacentIndices(
  size: unknown,
  tileIndex: unknown,
): readonly TileIndex[] {
  const coordinate = indexToCoordinate(size, tileIndex);
  if (coordinate === null || !isBoardSize(size)) {
    return EMPTY_NEIGHBORS;
  }

  const adjacent: TileIndex[] = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) {
        continue;
      }

      const adjacentIndex = coordinateToIndex(
        size,
        coordinate.row + rowOffset,
        coordinate.column + columnOffset,
      );
      if (adjacentIndex !== null) {
        adjacent.push(adjacentIndex);
      }
    }
  }

  return Object.freeze(adjacent);
}

export function areAdjacent(
  size: unknown,
  firstIndex: unknown,
  secondIndex: unknown,
): boolean {
  const first = indexToCoordinate(size, firstIndex);
  const second = indexToCoordinate(size, secondIndex);
  if (first === null || second === null) {
    return false;
  }

  const rowDifference = Math.abs(first.row - second.row);
  const columnDifference = Math.abs(first.column - second.column);

  return (
    (rowDifference !== 0 || columnDifference !== 0) &&
    rowDifference <= 1 &&
    columnDifference <= 1
  );
}

export function freezeBoard(
  size: BoardSize,
  tiles: readonly TileToken[],
): Board {
  return Object.freeze({
    size,
    tiles: Object.freeze([...tiles]),
  });
}
