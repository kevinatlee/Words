# Authoritative round lifecycle

Stage 4A production game data, Stage 4B rounds, and Stage 4C private
submissions are complete. Stage 4D final results are complete and merged. Stage
4E display QR joining keeps the same authoritative settings, boards,
participant snapshots, deadlines, and three phases.

## Roles and settings ownership

The display remains a passive shared screen. It is not a player, cannot change
settings, cannot start a round, and never becomes controller. The game host is
one connected phone player identified by `controllerPlayerId`.

`controller:update-settings` carries one complete strict `RoomSettings` object:

- `gridSize`: 4, 5, or 6
- `roundDurationSeconds`: 30, 60, 90, 120, 150, or 180
- `scoringMode`: `length-plus-unique`

Only the currently connected controller socket may update settings. The server
rejects partial objects, unknown fields, unsupported values, display sessions,
ordinary players, stale sockets, and updates outside `LOBBY`. An update
replaces all three fields atomically.

`controller:start-round` accepts only a strict empty object. The server, never
the client, chooses the round ID, number, board, random input, generation
attempt count, participants, start time, and deadline.

## Exact phase model

Rooms use exactly three phases:

| Phase          | Round state | Allowed controller lifecycle actions         |
| -------------- | ----------- | -------------------------------------------- |
| `LOBBY`        | `null`      | update settings, start first round, transfer |
| `ROUND_ACTIVE` | active      | transfer only                                |
| `ROUND_ENDED`  | ended       | transfer, return to lobby                    |

There is no separate results phase and no pause, resume, cancel, extend,
manual-end, client-end, or finalize action.

An active round has `endedAt: null` and `results: null`. At or after its
deadline, the server reconciles it once to `ROUND_ENDED`, sets `endedAt` to the
official `deadlineAt`, and attaches one non-null finalized result projection.
Ending a round does not update room activity or extend room TTL. The server then
keeps that result for a single authoritative 15-second window. The connected
controller may also return to the lobby early. The same 250 ms
lifecycle sweep changes it to `LOBBY`, clears the public round and private
submission map, and increments the version once without changing activity,
TTL, settings, players, controller, or display. The next round number is held
internally, so clearing the temporary snapshot never restarts numbering.

## Serialized room and round state

Every `RoomState` includes a server-owned `stateVersion` and ISO `serverTime`.
Clients reject a lower version. At an equal version, they reject an older
`serverTime`; action acknowledgements must also match the current room, role,
and session ID. `serverTime` records serialization time without touching
activity or TTL.

The current `round` is either `null` or one strict snapshot:

- server UUID and positive safe round number;
- copied room settings;
- board size and canonical row-major tile array;
- connected participant IDs and names in deterministic join order;
- ISO start, deadline, and optional end timestamps;
- nullable strict final results;
- bounded positive generation-attempt count.

Board size must match the settings snapshot and tile count must equal size
squared. Tokens are uppercase ASCII engine tokens; `QU` remains one tile.
Deadline is exactly start plus the snapshotted configured duration. Unknown
keys are rejected at every new schema level.

Final results contain every immutable participant exactly once, ordered by
final score descending and participant snapshot order for ties. Each entry
contains canonical accepted words, traditional base values, shared/unique
state, integer unique bonuses, final values, exact base/bonus/final totals,
and competition rank. Positive tied leaders all appear in `winnerPlayerIds`;
when nobody submitted a scoring word the all-zero round has no winner. An
all-shared positive round can have tied winners. Accepted timestamps, paths,
private versions, sockets, and credentials remain absent.

The room retains only its current round. After the authoritative 15-second
window, the lifecycle sweep clears the ended snapshot and private submissions;
the next lobby start creates the next numbered round. Only bounded highlights
remain, so round history and cumulative scoring cannot grow without bound.
Returned arrays and objects are copies; caller mutation cannot alter internal
state.

## Participant and reconnect semantics

Participants are the connected players at the instant a round starts. At least
the connected controller is included. IDs and display names are copied and
ordered by `joinedAt`, then player ID.

- A disconnected player is excluded if already offline at start.
- A player joining during the round appears in room presence but not in that
  round’s participant snapshot and sees a wait-for-next-round message.
- Disconnect, explicit leave, grace expiry, reconnect, and controller transfer
  never rewrite the current participant snapshot.
- Display and player reconnects restore the same board, round ID, phase, and
  official deadline.
- Reconnect does not pause or extend a round.
- Controller transfer remains allowed while active or ended and changes only
  authority.

## Controlled production startup

`@words/server` has a runtime dependency on `@words/game-data`. Each server
instance calls `loadProductionDictionary()` exactly once from `start()`, before
the HTTP listener begins accepting connections. Startup requires the pinned
79,370-word count, exact SHA-256, release, and source commit. Failure produces a
bounded startup error, prevents listening and room creation, and leaves the
partial HTTP/Socket.IO resources safe to stop.

Each server instance is explicitly single-use. Concurrent starts share one load
and listener attempt; stopping cancels pending startup, clears the one
scheduler, and prevents a late loader or listener completion from reviving the
instance. Later start attempts reject with a stable bounded stopped error.

The immutable dictionary and safe provenance remain in a private server
runtime object for Stage 4C. Dictionary entries are never logged, placed in
health output, added to room state, or included in the client build.

## Board generation and randomness

The production server owns a `node:crypto` random source. Each value is built
from one uniformly sampled unsigned 48-bit integer and divided by `2^48`,
producing a finite value in `[0, 1)` without modulo reduction. No client seed,
browser randomness, hidden `Math.random()`, or audit PRNG is used in production.

The server passes that source to `generateDefaultBoard({ size, random })`.
Stage 4A profiles support 4 × 4, 5 × 5, and 6 × 6 boards and stop after eight
quality attempts. The room does not mutate until generation succeeds and the
result passes size, tile-count, token, and attempt validation. Exhaustion or
malformed output returns `BOARD_GENERATION_FAILED` and leaves phase, previous
round, settings, activity, and TTL unchanged.

## Deadline scheduler and countdown

One unreferenced 250 ms lifecycle interval belongs to each started server
instance. It scans bounded in-memory rooms, reconciles due rounds
idempotently, broadcasts only actual transitions, and also triggers the slower
bounded room cleanup cadence. There is no interval per room or per client.
`stop()` clears the one interval. A failed sweep is contained so the next
bounded interval can retry instead of raising an unhandled timer exception.
When a room deadline and room TTL arrive in the same cleanup sweep, expiration
takes precedence and no ended snapshot is broadcast for the deleted room.
If a valid request reaches a due room before the scheduler, the server
reconciles and broadcasts the ended state before processing the request. The
transition is therefore not lost when the request is later rejected.

Before state reads, joins, reconnects, disconnects, leaves, controller
transfers, settings updates, starts, and cleanup decisions, the room store
reconciles an active round whose deadline has arrived. This prevents a stale
`ROUND_ACTIVE` snapshot from authorizing a forbidden action.

Reconciliation reads only the immutable participant snapshot and the exact
private map created for those participants. It calculates and validates the
complete result candidate before mutating phase, `endedAt`, results, or version.
Repeated reconciliation is a no-op. If `controller:start-round` arrives after
the deadline, the ended Round 1 snapshot is published before Round 2 starts.

The client calculates approximate remaining time from:

1. the difference between `deadlineAt` and the snapshot’s `serverTime`; and
2. elapsed `performance.now()` time since receiving that snapshot.

It clamps the display to zero, resets its anchor after reconnect or a newer
snapshot, and stops its browser interval once it reaches zero. It never uses
browser wall time as authority and never locally invents `ROUND_ENDED`; the
server phase remains final.

This display-only estimate cannot subtract one-way network transit time without
a clock-offset protocol. It may therefore show up to the snapshot's one-way
delivery delay plus at most one 250 ms rendering step more than the server's
remaining time. A stalled connection can make that delay larger, but the value
still reaches zero locally and the next authoritative snapshot restores the
server phase. Stage 4B does not add a more complex clock-synchronization
protocol.

## State-version transitions

Room creation begins at version zero. Each serialized membership, presence,
controller, settings, active-round, or ended-round change increments the
version once. Player grace expiry combines removal and any controller
succession into one logical increment. Automatic ending increments once but
does not touch activity or TTL.

Serialization, `serverTime` refresh, rejected actions, failed generation,
repeated deadline reconciliation, unchanged settings, and unchanged cleanup do
not increment the version. Expiring a disconnected display's private reconnect
credential also does not increment or broadcast because its public
`display.connected` state was already false. Rotating a credential while
replacing an already-connected socket likewise refreshes activity without
versioning private socket state. Room deletion has no successor snapshot.

## Stage 4C and Stage 4D integration

Stage 4C introduces a strict player-only submission event, bounded
row-major paths, and server-side dictionary/path validation for current round
participants before the deadline. It must not expose the dictionary, trust a
client verdict, allow the display to submit, or move deadline and phase
authority into the browser. At the exact deadline, submission processing first
reports the one public ended transition and then rejects the word.

Private successes do not increment public state version or extend activity,
TTL, board, participant, or deadline state. See
[`SUBMISSIONS.md`](SUBMISSIONS.md).

Stage 4D makes that exact ended transition publish the detached public result.
Private submission state stays unchanged and owner-reconnectable until the next
round replaces both the public current-round slot and private map. See
[`RESULTS.md`](RESULTS.md).
