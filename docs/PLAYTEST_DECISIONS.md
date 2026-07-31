# Playtest decisions

This document records the product decisions locked after Stage 4E playtesting.
It distinguishes the current Stage 4F scope from later work so that a small
interaction improvement does not quietly broaden the product.

## General layout

- Preserve the existing visual aesthetic.
- Ordinary player phones and the shared display should fit important content in
  one viewport without page scrolling.
- The game-host phone may scroll because it includes settings and game-host
  delegation controls.

## Input

- The input modes are **Touch** and **Trace**.
- Undo and Clear controls are removed.
- Submit clears a candidate after acceptance or an expected rejection.
- An unexpected transport or client failure retains the selected path for a
  retry.
- Touch backtracking truncates the selected path.
- Trace submits when the pointer is lifted.

## Future integer scoring

This is a locked future policy, not a Stage 4F implementation. Base score will
be one point per letter, with `QU` counting as two letters. A unique three- or
four-letter word will receive one bonus point; a unique word of five or more
letters will receive two bonus points. Provisional scores, finalized scores,
ranks, winners, schemas, and visible values will use integers only: no hidden
fractional score or display-only rounding.

| Word      | Shared | Unique |
| --------- | -----: | -----: |
| 3 letters |      3 |      4 |
| 4 letters |      4 |      5 |
| 5 letters |      5 |      7 |
| 8 letters |      8 |     10 |

## Future TV result presentation

This is planned, not implemented by Stage 4F:

- A TV-only dedicated result presentation will last 20 seconds.
- During it, the board and QR code disappear; every competitor has an
  individual card or column, and every tied winner receives a crown.
- It will show integer points, accepted-word count, unique-word count, and up
  to five unique words where space permits. The cap reduces responsively and
  hidden words are represented as “+N more”.
- The TV will not scroll. Phones remain on a simple puzzle/lobby-style waiting
  view, with detailed results focused on the TV.
- After 20 seconds, the server will authoritatively return to `LOBBY`, using
  the existing `ROUND_ENDED` lifecycle rather than adding a fourth phase.

## Planned information architecture

This cleanup is agreed future work and is not implemented by Stage 4F:

- The game-host phone will remove temporary-room detail from its primary view,
  lead with the puzzle, and group controls in the order: puzzle, settings,
  controls, then game-host authority.
- Ordinary players will remove nonessential room sections, lead with the
  puzzle, and keep the active task in focus.
- The shared display will keep a compact header with the title at left and
  player count plus game-host crown at right. Its QR and puzzle presentation
  will remain concise, with selected settings visible without becoming a
  separate control surface.

## Stage 4F boundary

Stage 4F implements only the input decisions above. It does not implement the
integer scoring migration, TV result lifecycle, phone or display information
architecture cleanup, a new phase, or a new network event.
