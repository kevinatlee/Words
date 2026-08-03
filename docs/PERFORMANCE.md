# Client performance and battery work

## Scope and measurement limits

A real-world two-player session was reported to use about 68 percentage points
of phone battery over 135 minutes of on-screen play at medium brightness. That
observation is useful as a warning that the active phone path needed attention,
but it was not a controlled device test. Screen power, radio conditions,
battery health, browser behavior, temperature, and background applications were
not controlled. The changes below reduce code-proven client work; they do not
establish a precise battery-percentage improvement.

This pass covers the active phone client only. It preserves the authoritative
server lifecycle, game rules, submissions, timing, reconnect behavior, visual
design, TV presentation, accessibility, and network contracts.

## Methodology

The baseline and optimized paths were compared with deterministic work counts,
not elapsed-time assertions:

- fake timers count countdown callbacks and visible React updates;
- React render sentinels and the Profiler count puzzle and snapshot commits;
- controlled `requestAnimationFrame` mocks count Trace processing passes;
- `getBoundingClientRect()` spies count tile geometry reads;
- listener and timer mocks verify cleanup across repeated lifecycles;
- client and server event handlers were inspected for active-play network
  traffic and duplicate subscriptions;
- production Vite output was measured directly, with gzip sizes reported by the
  build.

Automated inspection of the local rendered phone path was attempted at a
representative phone viewport, but the in-app browser's URL policy blocked the
detailed local-page pass. Deterministic DOM tests cover the affected rendering;
the real-phone session below remains the required visual and power check.

## Audited hot paths

### Countdown and React rendering

Previously, `useRoundCountdown` ran a 250 ms interval for every active round,
created a fresh countdown object, and set RoomLobby state on every tick. A
120-second round therefore caused about 480 updates to the broad RoomLobby tree,
including the phone puzzle and LetterGrid, even though the visible integer could
change at most once per second. The interval also kept recurring while the page
was hidden.

The visible countdown now lives in a small `RoundClock` leaf. It uses a
self-adjusting timeout aimed at the next `Math.ceil(remainingMs / 1000)` boundary
and recomputes from a monotonic server-time/deadline anchor. It schedules the
exact zero transition, clears at zero, and re-anchors whenever an authoritative
snapshot replaces the deadline.

A separate one-shot deadline gate disables phone input at the locally
calculated authoritative deadline. It does not update every second and does not
replace server enforcement. The broad RoomLobby tree commits once at that gate,
not for each visible second.

### Page visibility

When the document becomes hidden, the visual countdown timeout is cleared and
an active Trace gesture is cancelled, including its pending animation frame and
pointer capture. The Socket.IO connection remains open, room state remains
authoritative, and the one-shot deadline gate remains valid. On visibility
restoration, the timer immediately recomputes from its authoritative anchor; if
the browser suspended the deadline callback, the gate also disables input
immediately before scheduling anything further.

### Tap and Trace

Tap activation remains synchronous and unchanged. Trace now queues pointer and
browser-coalesced coordinates and performs at most one scheduled processing pass
per animation frame. Every queued segment is still resolved in order, and
pointer-up synchronously flushes pending coordinates plus the final coordinate,
so reducing scheduling does not skip crossed tiles.

Tile element references are retained by the grid and each tile rectangle is
read at most once during a gesture. The geometry cache is invalidated on resize,
reset, phase or board change, cancellation, visibility loss, and unmount.
Horizontal, vertical, diagonal, adjacency, backtracking, and complete fast-path
coverage remain regression-tested.

### Room snapshots and React state

Action acknowledgements and `room:state` broadcasts can contain the same
authoritative snapshot. App now uses an explicit field-by-field equality check
to skip only exact duplicates with the same version and server time. It does not
serialize the complete room in this hot path. Newer versions, server-time
corrections, same-version meaningful changes, controller or connection changes,
participants, settings, boards, highlights, expiry, and finalized results all
remain observable. Existing stale-version and finalized-result conflict guards
remain in force.

Private submission state is immutable at a given submission version. Repeated
or conflicting same-version payloads now preserve the existing state object
directly, removing the previous accepted-word-list serialization without
weakening the version conflict rule.

### Networking

Normal active play remains event-driven. Pointer movement and provisional paths
never leave the phone. A player emits a submission only on Trace lift or the
existing Tap Submit action. The server sends no countdown ticks; clients derive
the display from authoritative snapshot time and deadline fields. Socket
listeners remain one stable subscription set and are removed on teardown.
Stage 4H adds one existing `room:state` snapshot after each successful accepted
submission so the TV receives authoritative count-only progress. Rejections,
pointer movement, and provisional paths remain silent; there is no polling or
separate score stream.

### Stage 4H display feedback boundary

Count-only snapshots preserve the official board-tile array when its contents
are unchanged. The phone `LetterGrid` has a narrow memoized boundary with stable
board and callback props, so an accepted-count update causes zero phone grid
renders while selection, board, phase, deadline, and feedback changes remain
immediate.

Audio is display-only and event-driven. One AudioContext is created lazily after
a display interaction, remains idle between notes, and is never created for a
phone session. Accepted tones are scheduled only for newly observed count
increases; hidden snapshots establish a new baseline without a backlog. Round
changes, results, visibility loss, and unmount cancel or release pending nodes,
listeners, and the context.

### Paint, layout, and memory

The phone CSS has no continuous visual animation in the active path. Existing
shadows are static, button effects are short interaction transitions, and Trace
already uses the correct `touch-action` behavior. No defensible continuous
paint hotspot justified changing the approved visual design, so CSS and TV
presentation were left unchanged.

Timeouts, animation frames, visibility and resize listeners, pointer capture,
feedback timers, socket subscriptions, Trace queues, geometry caches, and stale
submission responses were reviewed. Deterministic repeated-lifecycle tests
verify that new countdown timers and visibility listeners return to zero.

## Deterministic before and after counts

| Active-phone work                                           |                                 Before |                                             After |
| ----------------------------------------------------------- | -------------------------------------: | ------------------------------------------------: |
| Countdown callbacks/state assignments in a 120-second round |                              about 480 |                    120 visible-second transitions |
| Visible updates per displayed second                        |                                      4 |                                         at most 1 |
| Recurring visual countdown work while hidden                |                     4 callbacks/second |                                                 0 |
| LetterGrid commits caused only by countdown seconds         |                        about 480/round |                                                 0 |
| Broad RoomLobby commits caused only by countdown seconds    |                        about 480/round |              0, plus one deadline-gate transition |
| Trace processing callbacks for several moves in one frame   |                           one per move | 1 animation-frame callback, all segments retained |
| Geometry reads for the same tile in one gesture             |                   potentially repeated |             at most 1 until explicit invalidation |
| React commits for an exact duplicate ACK/broadcast snapshot |                 2 assignments possible |                  second snapshot causes 0 commits |
| Active-play network messages                                | event-driven submissions/state changes |                                         unchanged |

## Bundle comparison

No production dependency was added. The production client JavaScript changed
from 375,644 bytes (113,894 bytes gzip) to 380,458 bytes (115,260 bytes gzip):
an increase of 4,814 bytes raw and 1,366 bytes gzip. Client CSS remained 30,213
bytes (6,577 bytes gzip). The added code is the deadline-aware scheduling,
explicit authoritative snapshot comparison, and Trace lifecycle handling.

## Remaining limitations

- Deterministic browser work counts are strong regression guards but do not
  translate directly into battery percentage.
- Mobile browsers may suspend timers and animation frames differently under
  memory or operating-system pressure; restoration paths are covered, but a
  real device remains the final check.
- The socket deliberately remains connected while hidden to preserve room and
  reconnect reliability.
- Radio quality, screen brightness, display technology, device temperature,
  and battery health can dominate a short battery comparison.

## Final practical phone validation

Run one normal 30–60 minute two-player session under conditions similar to the
reported baseline. Keep the same device and roughly the same brightness when
practical. Record starting and ending battery percentages, and note any unusual
heat, lag, missed Trace tiles, disconnects, or timer errors. This one integrated
session is the only long real-phone validation requested for the optimization
pass.
