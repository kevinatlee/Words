import {
  validateBoard,
  type Board,
  type BoardSize,
  type TileToken,
} from '../src/index.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function createBoardFixture(
  size: BoardSize = 4,
  replacements: Readonly<Record<number, TileToken>> = {},
): Board {
  const tiles = Array.from(
    { length: size * size },
    (_, index) => replacements[index] ?? ALPHABET[index % ALPHABET.length],
  );
  const result = validateBoard({ size, tiles });
  if (!result.valid) {
    throw new Error(`Invalid test fixture: ${result.code}`);
  }
  return result.board;
}
