# Game rules

This document separates current prototype behavior from planned rules and open
decisions.

## Implemented through Stage 2

- The shared lobby can locally preview 4 × 4, 5 × 5, and 6 × 6 layouts.
- The default preview is 4 × 4.
- The player prototype shows a static touch-sized 4 × 4 layout.
- Allowed duration labels and defaults are represented in shared configuration.
- Temporary room state includes the planned grid-size, duration, and
  traditional-scoring defaults.

The Stage 2 settings controls remain local previews. There is no functional
game engine, board generation, timer, dictionary, submission, validation,
duplicate detection, or scoring.

## Planned board and word rules

- Supported sizes: 4 × 4, 5 × 5, and 6 × 6
- Default size: 4 × 4
- A path may move horizontally, vertically, or diagonally to an adjacent tile.
- A tile may not be reused within one word.
- The default minimum word length is 3 letters.
- The server will generate an original weighted letter grid and validate every
  path.
- A word must appear in a bundled, openly licensed English dictionary.
- Dictionary license and attribution will be recorded before data is bundled.
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

The default is 180 seconds (3 minutes). The Stage 2 server includes that default
in read-only lobby state. The future round server will reject arbitrary
client-provided durations and own the official deadline.

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

Scoring belongs in configurable game-engine logic, not UI components.
Alternative future modes may award one point per valid word, one point per
letter, or use a custom table.

## Planned duplicate behavior

By default, a word submitted by more than one player will score zero for every
player who submitted it. Future configuration may allow shared words to receive
normal or reduced points. Stage 2.5 does not score duplicates.

## Unresolved rules

- Which openly licensed English dictionary provides the right balance of
  familiar and unusual words?
- Should controller delegation be allowed during an active round?
- How should custom scoring be configured and bounded?
- What feedback should distinguish an invalid path, an unknown word, a
  duplicate personal submission, and a shared word?
- Should very large boards change the default round duration or minimum word
  length? Defaults currently remain the same.
