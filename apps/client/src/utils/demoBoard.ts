const demoLetters = 'WORDSTOGETHERPLAYFINDMIXLETTERPARTYQUICK';

export function createDemoBoard(size: number): string[] {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error('Board size must be a positive integer.');
  }

  return Array.from(
    { length: size * size },
    (_, index) => demoLetters[index % demoLetters.length] ?? 'A',
  );
}
