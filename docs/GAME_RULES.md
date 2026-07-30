# Game rules

This document separates current prototype behavior from planned rules and open
decisions.

## Implemented through Stage 4C review

- The controller can set authoritative 4 × 4, 5 × 5, and 6 × 6 layouts.
- The default preview is 4 × 4.
- The player prototype shows a static touch-sized 4 × 4 layout.
- Allowed duration labels and defaults are represented in shared configuration.
- Temporary room state includes the planned grid-size, duration, and
  traditional-scoring defaults.
- The isolated game engine validates 4 × 4, 5 × 5, and 6 × 6 immutable boards.
- Canonical paths use row-major tile indexes and enforce horizontal, vertical,
  or diagonal adjacency without tile reuse.
- Complete tile tokens are concatenated, so `QU` is one tile and two letters.
- Current participants can submit one adjacent path before the server deadline.
- Personal duplicates are rejected. Traditional provisional scoring awards
  1 point for 3–4 letters, 2 for 5, 3 for 6, 5 for 7, and 11 for 8 or more.
- Personal words and points remain private; shared-word cancellation and final
  results are not implemented yet.
- Submitted words normalize to uppercase ASCII, must exactly match the supplied
  path, and are checked through an injected dictionary.
- Board generation accepts caller-provided weights and randomness with a
  bounded quality-retry limit.
- The production list contains 79,370 verified American/Canadian ESDB words.
- The original default distribution derives each letter’s integer weight from
  per-word occurrences capped at two.
- `QU` carries the derived Q weight, standalone `Q` is absent from the default
  profile, and `U` remains independent.
- Simulated quality profiles set separate vowel and repeat bounds for 4 × 4,
  5 × 5, and 6 × 6 boards, with at most eight generation attempts.
- The server generates one official board and snapshots connected participants
  when the controller starts a round.
- The server owns start time, deadline, automatic ending, round number, and
  phase. Controller transfer remains available during active rounds and does
  not change the board or deadline.
- Mid-round joiners wait for the next round. Disconnect, leave, grace expiry,
  and reconnect do not rewrite the participant snapshot.

Stage 4B connects settings and board generation to rooms and renders an
approximate synchronized countdown. There is still no word-entry UI, network
submission, duplicate detection, scoring, ranking, winner, or results phase.

## Planned board and word rules

- Supported sizes: 4 × 4, 5 × 5, and 6 × 6
- Default size: 4 × 4
- A path may move horizontally, vertically, or diagonally to an adjacent tile.
- A tile may not be reused within one word.
- The default minimum word length is 3 letters.
- The server uses the Stage 4A original, documented weighted profile and Stage
  3 engine to generate the official grid. A later stage will use the engine to
  validate every submitted path.
- A word must appear in the bundled, openly licensed, pinned ESDB size-60
  American-plus-Canadian export described in `GAME_DATA.md`.
- The controller player chooses supported settings; the server validates the
  selection against an allowlist.

## Planned durations

| Stored value | Display label        |
| -----------: | -------------------- |
|   30 seconds | 30 seconds           |
|   60 seconds | 1 minute             |
|   90 seconds | 1 minute 30 seconds  |
|  120 seconds | 2 minutes            |
|  150 seconds | 2 minutes 30 seconds |
|  180 seconds | 3 minutes            |

The default is 180 seconds (3 minutes). The Stage 4B server validates a complete
controller settings object, rejects arbitrary durations, and owns the official
deadline.

## Planned default scoring

Traditional scoring is the initial default:

| Word length          |  Points |
| -------------------- | ------: |
| Fewer than 3 letters | Invalid |
| 3 letters            |       1 |
| 4 letters            |       1 |
| 5 letters            |       2 |
| 6 letters            |       3 |
| 7 letters            |       5 |
| 8 or more letters    |      11 |

Traditional scoring is implemented in pure server-used engine code, not UI
components. No alternative scoring mode is implemented.

## Planned duplicate behavior

By default, a word submitted by more than one player will score zero for every
player who submitted it. Future configuration may allow shared words to receive
normal or reduced points. Stage 4C deliberately performs no cross-player
duplicate calculation.

## Unresolved rules

- Does later play testing justify a reviewed versioned change to the dictionary,
  distribution, or quality profile?
- How should custom scoring be configured and bounded?
- What feedback should distinguish an invalid path, an unknown word, a
  duplicate personal submission, and a shared word?
- Should very large boards change the default round duration or minimum word
  length? Defaults currently remain the same.
