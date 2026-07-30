# Production game data

Stage 3.1 CI, Stage 4A production data, and Stage 4B authoritative rounds are
complete. Stage 4C private submissions are in review.
Stage 4A supplies reproducible server-only assets and pure defaults. Stage 4B
now loads and privately retains the verified dictionary before listening and
uses the documented board generator for authoritative rounds and authorized
private word validation. No dictionary data, accepted word, or personal score
is connected to public room state.

## Package boundary

`packages/game-data` is the private `@words/game-data` workspace. It depends
only on `@words/game-engine` at runtime and uses Node.js filesystem and crypto
APIs for the production loader. It has no browser, React, Express, Socket.IO,
submission, scoring, persistence, or deployment behavior.

The framework-independent engine remains unchanged. The client does not depend
on or import game data. Offline verification scans every transitively
browser-reachable workspace for game-data and dictionary references and rejects
symbolic links inside that boundary. The normal client build contains neither
the 757,056-byte word list nor its checksum.

## Pinned dictionary

| Field         | Value                                                              |
| ------------- | ------------------------------------------------------------------ |
| Project       | English Speller Database / SCOWL                                   |
| Repository    | `https://github.com/en-wl/wordlist`                                |
| Release       | `rel-2026.02.25`                                                   |
| Source commit | `7e99edab8e32f9f9ea2b15f249ca8d4d67237410`                         |
| Word count    | 79,370                                                             |
| Bytes         | 757,056                                                            |
| SHA-256       | `f5f3d22bd07b8f8d2dd8cf4f3caff211b6f3249a24da02c5aa2a21bf2210f352` |
| Gzip check    | `gzip -9 -n`, 212,238 bytes; compressed file is not committed      |
| Gzip SHA-256  | `1dccc79270a4c044e78f5b3c9f1cf6184feb40cab706e809ef6e70a2cac0fc39` |

The official published release is neither a draft nor a prerelease. Its tag is
a direct commit tag; both the tag object and its peeled commit resolve to the
pinned SHA above.

The exact upstream export is:

```bash
./scowl --db scowl.db word-list 60 A,C 1 \
  --deaccent \
  --wo-poses=abbr,s,pre,suf,wp,we,x \
  '--wo-pos-classes=person,surname,place,name,trademark,upper,name?,upper?,abbr?' \
  --categories=
```

The repository script then retains lowercase source entries matching
`^[a-z]+$` with lengths 3 through 64, converts ASCII letters to uppercase,
sorts bytewise, deduplicates, and writes LF lines with exactly one final
newline and no BOM. Safety checks require the exact count, byte length, hash,
and metadata-free gzip measurement before `words.txt` can be replaced.

`manifest.json` records the source identifiers, dialect codes, size and variant
levels, deaccenting, excluded metadata classes, length policy, normalization,
sorting, line endings, checksum, counts, and gzip measurement. It omits a
current-time `generatedAt`, so rebuilding does not embed a machine clock,
username, hostname, or temporary path.

## Licence and notice

The upstream notice permits using, copying, modifying, distributing, and
selling SCOWLv2 or word lists made from it when the copyright and permission
notice are preserved. The chosen output uses American and Canadian spellings
at size 60. It uses neither the Australian `D`/`AU` selection nor a size above
80, so the conditional Australian and UK Advanced Cryptics Dictionary branches
do not apply to this generated list.

The complete applicable notice, including source credits, is preserved with
one conventional final newline in
`packages/game-data/data/dictionary/ESDB-NOTICE.txt`. Repository-level context
is in `THIRD_PARTY_NOTICES.md`. The Words source remains MIT-licensed; the
dictionary data retains its own notice. No endorsement is claimed. Offline
verification pins the complete notice bytes at SHA-256
`2f4e959749bb16da6e62264e33f620b1738a06290a940039eb83968a446b6460`;
selected-fragment matching is not the root of trust.

## Reproduction and offline verification

`npm run data:dictionary:build` uses a temporary directory by default, fetches
only the pinned tag at depth one from the official repository, verifies the tag
and peeled commit, checks out the pinned SHA directly, rejects tracked,
untracked, or symlinked source checkouts, invokes the upstream `make scowl.db`
process and exact export arguments without a shell and under the C locale,
validates all output, verifies both `gzip -9 -n` size and SHA-256, and atomically
replaces the fixed data file.
Temporary directories are removed on success and failure. It never uses
`sudo`, a package installer, a default branch, or a user-controlled output
path.

The documented external prerequisites are Git, GNU Make, Python 3, SQLite 3,
and gzip. `--source-dir` accepts a clean checkout only when its `origin`, tag,
peeled commit, and current `HEAD` all match the pinned official source.

`npm run data:verify` requires no network. It checks:

- the exact manifest schema and every independently pinned field, including the
  dictionary and metadata-free gzip hashes;
- a regular non-symlink dictionary and notice;
- bytes, SHA-256, line count, final newline, LF-only endings, BOM absence,
  ASCII uppercase format, length bounds, bytewise order, and uniqueness;
- the complete applicable notice SHA, required markers, and absence of
  irrelevant branches;
- byte-for-byte regenerated candidate, profile, and TypeScript distribution
  outputs from the committed dictionary;
- the profile input and profile hashes;
- absence of game-data dependencies, imports, aliases, relative paths, and
  re-exports throughout the client’s transitive workspace graph;
- absence of symbolic links that could hide source from the client-boundary
  traversal.

The package export is unavailable under the browser condition, and lint applies
the same restriction to client and shared TypeScript. After the Vite build, CI
runs verification again against the emitted bundle, including the dictionary
hash and representative sentinel words, and rejects symbolic links anywhere in
that output.

Failures identify a bounded category, affected file, and first field or line
where safe. The verifier never prints the dictionary.

## Vocabulary audit

`npm run data:dictionary:audit` is deterministic and does not modify the list.
It confirms representative American and Canadian spellings, ordinary plurals
and verb forms, comparative and superlative forms, a three-letter word, and a
long ordinary word. It also confirms exclusions for short, mixed-case,
proper-name-only, abbreviation, contraction, hyphen, space, punctuation,
digit, accent, affix-fragment, and non-word fixtures.

Observed spelling pairs are:

| Pair                    | Result                                         |
| ----------------------- | ---------------------------------------------- |
| `COLOR` / `COLOUR`      | both present                                   |
| `CENTER` / `CENTRE`     | both present                                   |
| `ORGANIZE` / `ORGANISE` | `ORGANIZE` present; `ORGANISE` absent upstream |

The audit does not hand-add the absent spelling. Its bounded risk report found:

- one Q-not-followed-by-U entry: `QWERTY`;
- six entries longer than 20 letters;
- 987 entries matching the documented repeated-letter-heavy review heuristic;
- nine short vowel-free, possible-acronym-like entries;
- four present ambiguity-watchlist entries with ordinary common-word senses;
- no sensitive-term count, because no reliable, compatible, version-pinned
  classifier is bundled.

These categories are review signals, not deletion rules. Dictionary validity
and future presentation moderation remain separate. There is no hidden manual
blacklist or family mode.

## Q and QU policy

The default production token set maps the derived `Q` weight to one `QU`
token. There is no standalone `Q` token, and ordinary `U` remains independent.
`QU` is not counted as a vowel for board-quality checks.

The master dictionary is not modified around this board policy. Linguistically
valid Q-without-U entries can remain valid dictionary members even though they
cannot be traced on the default token profile. A future explicitly different
board profile may make them formable.

## Distribution derivation

The committed candidate report evaluates 10,000 deterministic raw boards of
each size for each method. The xorshift32 generator used by audits is labelled
test/evaluation-only and is not suitable for authoritative production boards.

| Candidate                    | Total weight |  Vowels | Rare tokens |   `QU` |      Mean vowels 4/5/6 |
| ---------------------------- | -----------: | ------: | ----------: | -----: | ---------------------: |
| Raw character frequency      |      677,686 | 37.117% |      1.062% | 0.181% | 5.956 / 9.273 / 13.341 |
| Per-word presence            |      552,828 | 34.989% |      1.260% | 0.222% | 5.603 / 8.784 / 12.644 |
| Per-word occurrence capped 2 |      662,207 | 36.701% |      1.087% | 0.186% | 5.829 / 9.127 / 13.244 |

Raw frequency is maximally direct but lets long, repetitive words contribute
without a per-word bound. Presence treats every letter at most once per word,
but discards all repetition evidence and produced the lowest vowel share. The
selected cap-of-two method retains nearly all raw vowel balance and meaningful
repeat evidence while bounding each word’s influence with one transparent
integer rule.

No blend and no project-authored weight adjustment was used. The values below
are the exact generated integer counts:

| Token | Weight | Token | Weight | Token | Weight |
| ----: | -----: | ----: | -----: | ----: | -----: |
|     A | 49,322 |     J |  1,230 |     S | 57,352 |
|     B | 13,232 |     K |  6,343 |     T | 45,407 |
|     C | 27,382 |     L | 35,167 |     U | 22,662 |
|     D | 25,850 |     M | 18,097 |     V |  6,938 |
|     E | 74,285 |     N | 46,103 |     W |  6,160 |
|     F |  9,511 |     O | 40,728 |     X |  1,852 |
|     G | 20,260 |     P | 19,476 |     Y | 10,652 |
|     H | 15,153 |    QU |  1,229 |     Z |  2,884 |
|     I | 56,041 |     R | 48,891 |       |        |

The total is 662,207. Generated metadata includes the input dictionary SHA,
method, script version, QU and vowel policies, ordered weights, empty
adjustments, and profile SHA
`de7fb14c60d1778fbbe0b9f80cd710a673f486923b581ced46fd61596b5956af`.
Running `npm run data:distribution:derive` twice produces byte-identical files.
The generator leaves already-identical outputs untouched, which preserves their
timestamps and avoids conflict copies on synchronized filesystems. The
fixed-weight regression independently recounts the dictionary instead of using
the generation helper, so coordinated generator and artifact drift fails.

This is a word-type distribution, not a real-world usage-frequency corpus.
Uncommon accepted words therefore influence the profile alongside common
words. The cap-of-two policy is an explicit, reproducible Stage 4A starting
point; later play testing may justify a reviewed and versioned replacement.

## Board-quality profiles and audit

The policy checks only vowel-token bounds and the maximum occurrence of one
token. It performs no dictionary solve, recursion, filesystem access, or
network request.

|  Size | Vowels | Maximum one token | Maximum attempts |
| ----: | -----: | ----------------: | ---------------: |
| 4 × 4 |    4–9 |                 4 |                8 |
| 5 × 5 |   6–14 |                 5 |                8 |
| 6 × 6 |   9–20 |                 6 |                8 |

The deterministic board audit generated at least 10,000 raw and 10,000
accepted boards for every size and reproduced its report byte-for-byte:

|  Size | Raw / accepted mean vowels | Raw / accepted mean max repeat | Rejected candidates | Mean attempts | Failures |
| ----: | -------------------------: | -----------------------------: | ------------------: | ------------: | -------: |
| 4 × 4 |              5.858 / 6.060 |                  3.185 / 3.029 |             19.231% |        1.2381 |        0 |
| 5 × 5 |              9.204 / 9.224 |                  4.346 / 4.061 |             17.648% |        1.2143 |        0 |
| 6 × 6 |            13.260 / 13.183 |                  5.676 / 5.181 |             25.278% |        1.3383 |        0 |

Raw boards with at least one `QU` were 2.84%, 4.55%, and 6.02% by size;
accepted boards were 2.80%, 4.66%, and 6.55%. Observed raw per-token rates
remain close to generated expectations. Across 30,000 accepted calls, none
exhausted the eight-attempt bound.

Treating measured candidate rejection as independent between attempts gives
approximate eight-attempt exhaustion probabilities of 0.000187% for 4 × 4
(about 1 in 534,528), 0.0000941% for 5 × 5 (about 1 in 1,062,749), and
0.001667% for 6 × 6 (about 1 in 59,981). Stage 4B must handle the structured
failure and should revisit the bound with production telemetry rather than
adding an unbounded retry.

## Server-only APIs

`loadProductionDictionary()` resolves its manifest and words with
`import.meta.url`, verifies the pinned identity, byte count, SHA, structure,
and word count, then calls the engine’s `createWordDictionary`. It returns
either an immutable dictionary interface and frozen manifest or a structured
failure. It does not use `process.cwd()`, the network, a mutable global cache,
or an exposed Set. Runtime loading rejects symlinks and non-regular files, and
the production path matches every strict manifest field against source-code
constants rather than trusting the generated manifest alone.

The package build emits a server-targeted JavaScript bundle and smoke-loads it
from an unrelated working directory. The bundle retains the correct
module-relative relationship to the committed data files.

`generateDefaultBoard({ size, random })` accepts only a supported size and the
caller’s `RandomSource`, supplies the immutable selected distribution and
quality predicate to the engine, and returns the engine’s structured result.
It does not generate at import time or call `Math.random()`.

## Security and resource limits

Source repository, tag, commit, output location, expected measurements, audit
sample sizes, board attempts, word lengths, word count, and file sizes are
bounded. External commands receive argument arrays rather than shell-expanded
user input. Generated replacements use same-directory temporary files, reject
symbolic-link targets, validate before rename, and clean temporary directories.
Runtime loading has no external request, dynamic code execution, credential,
secret, log of word contents, or client bundle path.

The complete list occupies under one megabyte on disk. Loading temporarily
holds the file, parsed entries, and the engine Set; the loader retains only the
Set-backed interface afterward. Stage 4B calls it once during controlled server
startup rather than repeatedly per room or request.

## Stage 4B integration and Stage 4C boundary

Stage 4B:

1. load and retain the verified dictionary once during controlled server
   startup;
2. provide an appropriate cryptographic server-owned `RandomSource`;
3. generate and retain the authoritative board and deadline in room state;
4. defines strict shared Zod settings and round-state payloads;
5. authorize settings and round starts against the connected controller player;
6. keeps the display passive and exposes no display submission action;
7. adds round-aware reconnect behavior and regression tests.

Stage 4C adds server-authoritative current-participant validation against the
privately retained dictionary plus private provisional scoring. Shared-word
cancellation, final results, continuous tracing, QR, deployment, container,
persistence, and moderation remain later work.
