# Playtest decisions

This document records the product decisions locked through Stage 4G playtesting
and the Stage 5A deployment boundary. Stage 4H is the current test candidate.

## General layout

- Preserve the existing visual aesthetic.
- Ordinary player phones and the shared display should fit important content in
  one viewport without page scrolling.
- The game-host phone may scroll because it includes settings and game-host
  delegation controls.

## Input

- The input modes are **Touch** and **Trace**.
- Fresh clients default to **Trace**. An explicit Tap choice remains a
  client-only persisted preference; clearing or losing that preference restores
  Trace.
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

## TV result presentation

- A TV-only dedicated result presentation lasts 30 seconds.
- During it, the board and QR code disappear; every competitor has an
  individual card or column, and every tied winner receives a crown.
- It will show integer points, accepted-word count, unique-word count, and up
  to five unique words where space permits. The cap reduces responsively and
  hidden words are represented as “+N more”.
- The TV result-card group is intrinsically sized and centred; individual cards
  use bounded readable widths rather than consuming the entire display.
- TV result cards use the established dark Words panel surface, muted labels,
  mint scores, and a restrained winner accent.
- The TV will not scroll. Phones show a concise round summary with only the
  player's final score and winning score. A positive winner name or all tied
  winner names appear beneath that score in authoritative result order; a
  zero-score round retains `No scoring winner`. Detailed results remain TV-only.
- During the 30-second `ROUND_ENDED` presentation, phones will not
  show game-host controls. After the authoritative return to `LOBBY`, Game
  Settings and game-host delegation reappear for the current controller only.
- After 30 seconds, the server will authoritatively return to `LOBBY`, using
  the existing `ROUND_ENDED` lifecycle rather than adding a fourth phase.

## Implemented phone information architecture

- Phone rooms lead with the puzzle. Their compact connection state sits in the
  main app header; there is no phone toolbar or Leave room control. Room codes,
  QR, player lists, display details, and phase labels stay on the shared
  display.
- New temporary rooms default to a 5 × 5 grid and a two-minute round; all
  existing supported sizes and durations remain available to the controller.
- Puzzle bubbles have no visible heading on phones but retain an accessible
  puzzle label. During active participation, the headingless Tap/Trace control
  is a separate bubble directly below the puzzle.
- Ordinary players see only the puzzle preview between rounds and never see
  settings, controller delegation, or a waiting message.
- The controller sees three distinct sibling bubbles in the lobby and after
  results: Puzzle (including Start Round or Start Next Round), accessible Game
  Settings controls, then accessible Game Host controls. Those administration
  bubbles are absent during active gameplay for every phone.
- Phone active timers use the concise `Timer` label. After a round, the Puzzle
  bubble is replaced by a concise `ROUND OVER` / `Look at the TV!` summary of
  the player's own final score, winning score, and authoritative winner names.
  It has no board, timer, word-entry controls, rankings, detailed word review,
  or opponent scores.
  The shared display retains its results presentation.
- Official 4 × 4, 5 × 5, and 6 × 6 grids use the same gap token for each
  presentation. The TV lobby demonstration board's perimeter spells `WORDS`,
  `ATLEE`, `WANNA`, and `SHARE` around its unchanged merged QR region.
- Pre-round phone demonstration boards are explicit presentation-only 4 × 4,
  5 × 5, and 6 × 6 layouts; the 5 × 5 fourth row is `NSEVR`. Official round
  boards remain server-generated. The embedded QR retains its data and
  perimeter words while its opaque `#f5f1e7` canvas retains the same quiet zone.
  Square SVG sizing and then an opaque SVG background reduced but did not
  eliminate physical Safari quiet-zone marks, so the nested QR surface and QR
  inset shadow were removed with the canvas replacement. Repeat validation on
  the test channel remains required.
- Phones do not show provisional scores or accepted-word counts. During an
  active round, the TV Players panel shows only authoritative accepted-word
  counts; detailed words remain private until final results.
- The production UI does not display a development-stage identifier.
- Phone connection status includes safe-area-aware right-side breathing room.
  The settings and host-control bubbles use non-visible accessible labels with
  an accessible seconds slider. Active word entry keeps a reserved feedback
  area between the selected word and Submit action to prevent layout movement.

## Current boundary

Stage 4H adds no phase or separate score stream. Its count progress travels in
the existing authoritative room snapshot.
