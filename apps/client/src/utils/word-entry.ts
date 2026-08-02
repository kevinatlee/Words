import type { SubmissionErrorCode } from '@words/shared';

export type WordEntryMode = 'touch' | 'trace';

const wordEntryModeStorageKey = 'words:word-entry-mode';

export type WordPathUpdate = {
  readonly path: number[];
  readonly exceededMaximumLength: boolean;
};

function isAdjacent(left: number, right: number, size: number): boolean {
  const leftRow = Math.floor(left / size);
  const leftColumn = left % size;
  const rightRow = Math.floor(right / size);
  const rightColumn = right % size;

  return (
    Math.abs(leftRow - rightRow) <= 1 && Math.abs(leftColumn - rightColumn) <= 1
  );
}

export function updateWordPath(
  path: readonly number[],
  tileIndex: number,
  tiles: readonly string[],
  size: number,
  maximumLength: number,
): WordPathUpdate {
  if (
    !Number.isInteger(tileIndex) ||
    tileIndex < 0 ||
    tileIndex >= tiles.length
  ) {
    return { path: [...path], exceededMaximumLength: false };
  }

  const selectedIndex = path.indexOf(tileIndex);
  if (selectedIndex !== -1) {
    return {
      path:
        selectedIndex === path.length - 1
          ? path.slice(0, -1)
          : path.slice(0, selectedIndex + 1),
      exceededMaximumLength: false,
    };
  }

  const previous = path.at(-1);
  if (previous !== undefined && !isAdjacent(previous, tileIndex, size)) {
    return { path: [...path], exceededMaximumLength: false };
  }

  const nextLength = path.reduce(
    (total, index) => total + (tiles[index]?.length ?? 0),
    tiles[tileIndex]?.length ?? 0,
  );
  if (nextLength > maximumLength) {
    return { path: [...path], exceededMaximumLength: true };
  }

  return { path: [...path, tileIndex], exceededMaximumLength: false };
}

export function loadWordEntryMode(): WordEntryMode {
  try {
    return window.localStorage.getItem(wordEntryModeStorageKey) === 'touch'
      ? 'touch'
      : 'trace';
  } catch {
    return 'trace';
  }
}

export function saveWordEntryMode(mode: WordEntryMode): void {
  try {
    window.localStorage.setItem(wordEntryModeStorageKey, mode);
  } catch {
    // Storage is a convenience only; play remains available without it.
  }
}

export function isExpectedSubmissionRejection(
  code: SubmissionErrorCode,
): boolean {
  return code !== 'INTERNAL_ERROR';
}
