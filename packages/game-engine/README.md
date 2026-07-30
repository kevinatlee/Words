# Game engine package

`@words/game-engine` is the framework-independent Stage 3 rules foundation. It
contains pure TypeScript for boards, weighted generation, paths, word
normalization, and injected dictionary lookup. It has no runtime dependencies
and does not import React, Express, Socket.IO, the DOM, Node runtime APIs, or
the room store.

The package is not connected to live rooms yet. Stage 4B must call it from
server-authorized round and submission handlers; browsers must never decide the
official board or dictionary result.

## Public model

```ts
type BoardSize = 4 | 5 | 6;
type TileIndex = number;
type TilePath = readonly TileIndex[];

interface Board {
  readonly size: BoardSize;
  readonly tiles: readonly string[];
}
```

Tiles are row-major. On a 4 × 4 board, indexes `0` through `3` are the first
row, and index `4` begins the second row. Canonical tile tokens contain one to
four uppercase ASCII letters. A token such as `QU` is one tile but contributes
two letters when a path is read.

Validated and generated boards snapshot caller-owned arrays and freeze the
public board and tiles. Successful path validation likewise returns a frozen
path copy.

## Public API

- Board: `validateBoard`, `isBoardSize`, `isCanonicalTileToken`,
  `coordinateToIndex`, `indexToCoordinate`, `getAdjacentIndices`, and
  `areAdjacent`
- Generation: `generateBoard`, `RandomSource`, `WeightedTile`,
  `MAX_GENERATION_ATTEMPTS`, and `EngineConfigurationError`
- Paths: `validatePath` and `readPath`
- Words: `normalizeWord`, `validateWordPath`,
  `DEFAULT_MINIMUM_WORD_LENGTH`, and `MAX_CANDIDATE_WORD_LENGTH`
- Dictionaries: `WordDictionary` and `createWordDictionary`

All exports come from `src/index.ts`.

## Validation policy

Candidate board, path, word, and dictionary-entry failures return discriminated
results. The codes are stable, bounded descriptions such as
`INDEX_OUT_OF_BOUNDS`, `TILE_REUSED`, `PATH_WORD_MISMATCH`, and
`WORD_NOT_IN_DICTIONARY`; they do not expose stack traces.

Programmer and configuration errors throw `EngineConfigurationError`. These
include an unsupported generation size, empty or invalid distribution,
non-finite weight, invalid random output, or retry limit outside `1..1000`.

Path validation is linear in path length. It validates board shape, path shape,
length, every index, tile reuse, and adjacency before reading tiles. Horizontal,
vertical, and diagonal steps are valid; the same cell, row wrapping, and jumps
are not.

Word validation follows this order:

1. validate the board;
2. trim and uppercase an ASCII-only candidate;
3. enforce the configured minimum letter count;
4. validate the supplied path;
5. require the path’s complete tokens to equal the normalized word;
6. query the injected dictionary.

Punctuation is rejected rather than deleted. Apostrophes, hyphens, spaces,
digits, control characters, formatting characters, accented characters, and
other Unicode input are not silently converted.

## Weighted generation

Generation requires a caller-provided random source:

```ts
const result = generateBoard({
  size: 4,
  distribution: [
    { token: 'A', weight: 2 },
    { token: 'QU', weight: 1 },
  ],
  random: {
    next: () => serverOwnedRandomValue,
  },
  maxAttempts: 8,
  acceptBoard: (board) => board.tiles.includes('A'),
});
```

Every random value must be finite and in `[0, 1)`. The engine never calls
`Math.random()` or supplies an invisible fallback. Distribution tokens are
normalized once, checked for normalized duplicates, and copied without
mutating the caller’s array. Every positive weight must also advance the
cumulative total at JavaScript number precision; a weight that would create an
unreachable interval is rejected as an invalid total.

An optional acceptance predicate can reject low-quality boards. Attempts use a
loop with an explicit maximum; exhaustion returns
`{ success: false, code: 'NO_ACCEPTABLE_BOARD', attempts }`.
Returning `false` consumes one attempt. If the predicate throws, that exception
is a programmer error and propagates unchanged rather than being converted to
an ordinary rejection or exhaustion result.

Stage 3 deliberately supplies no default letter distribution. Stage 4A keeps
the documented non-proprietary production derivation in the separate
server-oriented `@words/game-data` package, preserving this engine boundary.

## Dictionary boundary

`WordDictionary` has one synchronous method:

```ts
interface WordDictionary {
  has(normalizedWord: string): boolean;
}
```

`createWordDictionary` builds a private Set from a caller-provided list,
normalizes and deduplicates entries, and reports the first malformed entry. It
does no network or filesystem work. Tests use only a tiny word list written for
this repository; no production word data is bundled.

See
[`docs/DICTIONARY_EVALUATION.md`](../../docs/DICTIONARY_EVALUATION.md) for the
pinned Stage 4 dictionary recommendation and licence conditions, and
[`docs/GAME_ENGINE.md`](../../docs/GAME_ENGINE.md) for the complete boundary.

## Commands

From the repository root:

```bash
npm run typecheck --workspace @words/game-engine
npm run test --workspace @words/game-engine
npm run build --workspace @words/game-engine
```
