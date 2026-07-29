# `@words/game-data`

Private, server-oriented production data for Words.

The package contains:

- the committed, licensed production word list and provenance manifest;
- a filesystem loader that verifies the list before passing it to
  `@words/game-engine`;
- an original, dictionary-derived immutable tile-token distribution;
- simple simulated quality profiles for 4 × 4, 5 × 5, and 6 × 6 boards;
- a pure default-board wrapper that still requires an injected random source;
- offline reproduction, verification, audit, and derivation scripts.

It contains no browser, React, Express, Socket.IO, room-store, persistence, or
network runtime code. Stage 4A does not import this package from either
application. The future server integration belongs to Stage 4B.

## Public API

```ts
const loaded = await loadProductionDictionary();

const generated = generateDefaultBoard({
  size: 4,
  random: serverOwnedRandomSource,
});
```

`loadProductionDictionary()` resolves data relative to the package rather than
the process working directory. It returns a structured failure instead of
hiding manifest, file, checksum, format, or engine-construction errors. It does
not cache a mutable global dictionary.

`generateDefaultBoard()` delegates to the pure engine, uses the committed
distribution and size-specific quality profile, tries at most eight candidates,
and preserves the engine’s structured `NO_ACCEPTABLE_BOARD` result. It never
uses `Math.random()`.

## Repository commands

Run from the repository root:

```bash
npm run data:verify
npm run data:dictionary:audit
npm run data:boards:audit
npm run data:distribution:derive
npm run data:dictionary:build
```

Normal verification and audits are offline. Dictionary reproduction requires
Git, GNU Make, Python 3, SQLite 3, and gzip. It fetches only the pinned official
tag into an automatically cleaned temporary directory. A clean already
verified checkout may be supplied explicitly:

```bash
npm run data:dictionary:build -- --source-dir /path/to/pinned/wordlist
```

The fixed output location is not configurable. Generated output is checked
before an atomic replacement, and symbolic-link targets are rejected.

See [`docs/GAME_DATA.md`](../../docs/GAME_DATA.md) for the full source,
licence, filtering, derivation, simulation, audit, and Stage 4B boundary.
