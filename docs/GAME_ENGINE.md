# Game engine

Stage 3 adds a tested rules foundation without starting live gameplay.
`@words/game-engine` is a zero-runtime-dependency TypeScript workspace package.
It does not know about rooms, sockets, players, displays, controllers, timers,
scores, browsers, or persistence.

## Boundary

The engine accepts plain values and returns plain immutable values or
discriminated results. It can be imported by a server, client-side tests, or
another JavaScript runtime. Its core functions use no DOM or Node-specific
runtime API.

Stage 4A adds a separate server-oriented `@words/game-data` caller with a
verified dictionary, derived default weights, and a bounded quality predicate.
Stage 4B connects the server—not the browser—to default board generation and
retains each official board and deadline. The client imports neither package.
Stage 4C calls path validation and dictionary lookup from the authoritative
server and adds pure word-length scoring. Stage 4D adds pure bounded
cross-participant reconciliation while the server retains ranking and room
lifecycle ownership.

## Canonical board and path

```ts
type BoardSize = 4 | 5 | 6;

interface Board {
  readonly size: BoardSize;
  readonly tiles: readonly string[];
}

type TilePath = readonly number[];
```

Boards contain exactly `size × size` tiles. Indexes are row-major:

```text
0  1  2  3
4  5  6  7
8  9 10 11
12 13 14 15
```

Tile tokens contain one to four uppercase ASCII letters. This represents
ordinary `A` through `Z` tiles and keeps room for `QU` without pretending that
tile count always equals word-letter count.

`validateBoard` rejects unsupported sizes, incorrect counts, lowercase or
punctuated canonical tokens, empty tokens, and oversized tokens. A successful
validation snapshots and freezes the board, so later caller mutation cannot
change engine state.

## Coordinates and adjacency

`coordinateToIndex` and `indexToCoordinate` explicitly convert between
row/column coordinates and canonical indexes. `getAdjacentIndices` derives
neighbours from the board size rather than assuming four columns.

Two indexes are adjacent when their rows differ by at most one and their
columns differ by at most one, excluding the same cell. Horizontal, vertical,
and all four diagonal directions are accepted. Numeric neighbours across a row
boundary, such as `3` and `4` on a 4 × 4 board, are not spatial neighbours.

## Path validation

`validatePath` and `readPath` return a structured result. Validation:

1. validates and snapshots the board;
2. requires a non-empty array no longer than the tile count;
3. verifies that every entry is an in-range integer before tile access;
4. uses a Set to reject tile reuse anywhere in the path;
5. checks each consecutive pair for spatial adjacency;
6. concatenates complete tile tokens.

The two scans are linear in path length. No recursion or player-controlled
nested work is used. A successful result contains the path’s word and a frozen
path copy. A candidate failure contains a bounded code and, where useful, the
path position and tile index.

## Randomness and generation

`generateBoard` requires an injected `RandomSource` whose `next()` method
returns a finite number in `[0, 1)`. There is no `Math.random()` default. This
keeps tests deterministic and gives Stage 4 an explicit boundary for
server-owned cryptographic randomness.

Callers supply weighted token entries. Tokens are ASCII-normalized once and
must be unique after normalization. Every weight and their total must be
finite and greater than zero. Each positive weight must advance the cumulative
total at JavaScript number precision, so no token can have an unreachable
interval. Selection uses cumulative weighted boundaries and generates exactly
16, 25, or 36 tiles.

An optional `acceptBoard` predicate supports a small quality gate. Generation
uses an iterative, caller-bounded retry count from 1 through 1,000. If every
candidate is rejected, it returns `NO_ACCEPTABLE_BOARD`; it cannot retry
forever. A predicate exception is a programmer error and propagates unchanged;
the engine does not silently treat it as a rejected board.

The engine itself does not define a production distribution or permanent
quality policy. Stage 4A keeps those independently reviewable in
`@words/game-data`: dictionary-derived cap-of-two occurrence weights, a `QU`
token mapped from the Q weight, and simulated vowel/repetition profiles with an
eight-attempt bound.

## Words and dictionary

`normalizeWord` trims outer whitespace, requires only ASCII letters, converts
case to uppercase, and limits words to 64 letters. It rejects punctuation,
apostrophes, hyphens, internal spaces, digits, control or formatting
characters, accented characters, and Unicode case-expansion characters rather
than silently deleting or transliterating them.

`validateWordPath` requires the normalized submitted word to meet the
configurable minimum (three by default), exactly match the supplied path’s
tokens, and exist in an injected synchronous `WordDictionary`. Word length is
normalized character count, not tile count: three tiles `QU`, `I`, `Z` form the
four-letter word `QUIZ`.

The Set-backed dictionary constructor normalizes and deduplicates an input list
without exposing the Set. Malformed entries return their input position and a
normalization code. Core lookup performs no filesystem or network work.

## Resource limits

- board sizes are limited to 4, 5, and 6;
- tile tokens are limited to four ASCII letters;
- paths cannot exceed the board’s tile count;
- submitted words are limited to 64 letters;
- generation attempts are limited to 1,000;
- weights, totals, and random outputs must be finite;
- path validation is linear and Set lookup is effectively constant-time;
- caller-owned arrays are never mutated.

## Final word reconciliation

`reconcileRoundWords()` accepts one to eight unique participant IDs with at
most 256 ordered canonical accepted records each. It verifies every stored
point value through `scoreWordByLength()`, rejects duplicate participant IDs
and duplicate words within one participant, and counts a word once per distinct
participant ID.

A word accepted by at least two participants is shared. Every accepted word
retains its length-based base points; a unique three- or four-letter word adds
one point, a unique longer word adds two, and a shared word adds no bonus. The
result preserves participant and word order, contains integer base,
uniqueness-bonus, and final totals, and is deeply detached and frozen. The
engine does not receive display names,
accepted timestamps, paths, room state, clocks, Socket.IO, Zod, controller
authority, or winner presentation policy.

Malformed arrays, sparse entries, throwing getters, and hostile proxies return
bounded error objects without caller-provided messages or accepted word text.

These package limits complement, but do not replace, Stage 4B network payload
size limits, controller authorization, phase checks, and deadline enforcement.

## Stage 4C integration

Stage 4B loads the verified dictionary once during controlled server startup,
injects a cryptographic server-owned random source into
`generateDefaultBoard`, and makes the server own settings, boards, participant
snapshots, phase, and deadline. It adds no path or word payload.

Stage 4C adds a strict player-only submission event and calls the existing
path and dictionary validation APIs. It must enforce current-round
participation and deadline on the server, keep the display passive, and avoid
making the engine depend on rooms or sockets.

`scoreWordByLength()` safely rejects malformed or shorter-than-three-letter
input. Valid canonical words score their exact length. It counts letters rather
than tiles, so `QU` contributes two.
Stage 4D calls pure reconciliation only after the server deadline. The server
maps the engine output to snapshotted names, deterministic ranks, winners, and
the strict public result state.
