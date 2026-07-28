import {
  areAdjacent,
  validateBoard,
  type Board,
  type TileIndex,
  type TilePath,
} from './board.js';

export type PathErrorCode =
  | 'EMPTY_PATH'
  | 'INDEX_OUT_OF_BOUNDS'
  | 'INVALID_BOARD'
  | 'INVALID_INDEX'
  | 'NON_ADJACENT'
  | 'PATH_TOO_LONG'
  | 'TILE_REUSED';

export type PathValidationResult =
  | {
      readonly valid: true;
      readonly word: string;
      readonly path: TilePath;
    }
  | {
      readonly valid: false;
      readonly code: PathErrorCode;
      readonly pathPosition?: number;
      readonly tileIndex?: number;
    };

export function validatePath(
  boardCandidate: unknown,
  pathCandidate: unknown,
): PathValidationResult {
  const boardResult = validateBoard(boardCandidate);
  if (!boardResult.valid) {
    return { valid: false, code: 'INVALID_BOARD' };
  }

  if (!Array.isArray(pathCandidate) || pathCandidate.length === 0) {
    return { valid: false, code: 'EMPTY_PATH' };
  }

  const board = boardResult.board;
  if (pathCandidate.length > board.tiles.length) {
    return { valid: false, code: 'PATH_TOO_LONG' };
  }

  const path: TileIndex[] = [];
  for (
    let pathPosition = 0;
    pathPosition < pathCandidate.length;
    pathPosition += 1
  ) {
    const value = pathCandidate[pathPosition];
    if (!Number.isInteger(value)) {
      return {
        valid: false,
        code: 'INVALID_INDEX',
        pathPosition,
      };
    }

    const tileIndex = value as number;
    if (tileIndex < 0 || tileIndex >= board.tiles.length) {
      return {
        valid: false,
        code: 'INDEX_OUT_OF_BOUNDS',
        pathPosition,
        tileIndex,
      };
    }

    path.push(tileIndex);
  }

  const usedTiles = new Set<TileIndex>();
  let previousIndex: TileIndex | undefined;
  for (let pathPosition = 0; pathPosition < path.length; pathPosition += 1) {
    const tileIndex = path[pathPosition] as TileIndex;
    if (usedTiles.has(tileIndex)) {
      return {
        valid: false,
        code: 'TILE_REUSED',
        pathPosition,
        tileIndex,
      };
    }

    if (
      previousIndex !== undefined &&
      !areAdjacent(board.size, previousIndex, tileIndex)
    ) {
      return {
        valid: false,
        code: 'NON_ADJACENT',
        pathPosition,
        tileIndex,
      };
    }

    usedTiles.add(tileIndex);
    previousIndex = tileIndex;
  }

  const immutablePath = Object.freeze([...path]);
  return {
    valid: true,
    word: concatenatePath(board, immutablePath),
    path: immutablePath,
  };
}

export function readPath(
  boardCandidate: unknown,
  pathCandidate: unknown,
): PathValidationResult {
  return validatePath(boardCandidate, pathCandidate);
}

function concatenatePath(board: Board, path: TilePath): string {
  let word = '';
  for (const tileIndex of path) {
    word += board.tiles[tileIndex];
  }
  return word;
}
