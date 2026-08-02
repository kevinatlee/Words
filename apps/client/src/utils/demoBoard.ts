const demonstrationBoards = {
  4: 'WORDPLAYFINDFOUR',
  5: 'WORDSASDNHNFIXANSFVRATLEE',
  6: 'WORDSLPARTYEFINDSTATLEETPLAYSESIXBYR',
} as const;

export function createDemoBoard(size: number): string[] {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error('Board size must be a positive integer.');
  }

  const board = demonstrationBoards[size as keyof typeof demonstrationBoards];
  if (!board) {
    throw new Error(
      'Unsupported demonstration board size. Supported sizes are 4, 5, and 6.',
    );
  }

  return [...board];
}
