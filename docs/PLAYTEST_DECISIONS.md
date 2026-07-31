# Playtest decisions

This document records the product decisions locked through Stage 4F playtesting
and the phone-interface cleanup. It distinguishes that focused work from later
product changes.

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

## Implemented integer scoring

Integer scoring is implemented by the current draft work. Base score is one
point per letter, with `QU` counting as two letters. A unique three- or
four-letter word receives one bonus point; a unique word of five or more letters
receives two bonus points. Provisional scores, finalized scores, ranks, winners,
schemas, and visible values use integers only: no hidden fractional score or
display-only rounding.

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
- During this planned 20-second `ROUND_ENDED` presentation, phones will not
  show game-host controls. After the authoritative return to `LOBBY`, Game
  Settings and game-host delegation reappear for the current controller only.
- After 20 seconds, the server will authoritatively return to `LOBBY`, using
  the existing `ROUND_ENDED` lifecycle rather than adding a fourth phase.

## Implemented phone information architecture

- Phone rooms lead with the puzzle and retain only compact connection state and
  Leave room beside it; room codes, QR, player lists, display details, and
  phase labels stay on the shared display.
- Ordinary players see a concise waiting message between rounds and never see
  settings or controller delegation.
- The controller sees the puzzle before Game Settings, Start Round, and
  controller delegation in the lobby and after results. Those administration
  controls are absent during active gameplay for every phone.
- Phones show a concise TV-results message after a round instead of rankings,
  scores, winner copy, or detailed word review. The shared display retains its
  existing results presentation.

## Current boundary

The phone cleanup does not implement the TV results lifecycle, a display
redesign, a new phase, or a new network event.
