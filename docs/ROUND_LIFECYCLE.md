# Authoritative round lifecycle

Stage 4A production game data is complete. Stage 4B is in review and connects
that verified data to temporary rooms. This stage ends at authoritative room
settings, official boards, participant snapshots, deadlines, and automatic
round ending. Stage 4B has no word submission, path networking, dictionary
socket lookup, duplicate resolution, scoring, rankings, winners, or results.

## Roles and settings ownership

The display remains a passive shared screen. It is not a player, cannot change
settings, cannot start a round, and never becomes controller. The game host is
one connected phone player identified by `controllerPlayerId`.

`controller:update-settings` carries one complete strict `RoomSettings` object:

- `gridSize`: 4, 5, or 6
- `roundDurationSeconds`: 30, 60, 90, 120, 150, or 180
- `scoringMode`: `traditional`

Only the currently connected controller socket may update settings. The server
rejects partial objects, unknown fields, unsupported values, display sessions,
ordinary players, stale sockets, and updates during an active round. An update
is allowed in `LOBBY` and `ROUND_ENDED` and replaces all three fields
atomically.

`controller:start-round` accepts only a strict empty object. The server, never
the client, chooses the round ID, number, board, random input, generation
attempt count, participants, start time, and deadline.

## Exact phase model

Rooms use exactly three phases:

| Phase          | Round state | Allowed controller lifecycle actions         |
| -------------- | ----------- | -------------------------------------------- |
| `LOBBY`        | `null`      | update settings, start first round, transfer |
| `ROUND_ACTIVE` | active      | transfer only                                |
| `ROUND_ENDED`  | ended       | update settings, start next round, transfer  |

There is no results phase and no pause, resume, cancel, extend, manual-end, or
client-end action.

An active round has `endedAt: null`. At or after its deadline, the server
reconciles it once to `ROUND_ENDED` and sets `endedAt` to the official
`deadlineAt`, not the later scheduler time. Ending a round does not update room
activity or extend room TTL.

## Serialized room and round state

Every `RoomState` includes a server-owned `stateVersion` and ISO `serverTime`.
Clients use the monotonically increasing version to ignore stale
acknowledgements. `serverTime` records serialization time without touching
activity or TTL.

The current `round` is either `null` or one strict snapshot:

- server UUID and positive safe round number;
- copied room settings;
- board size and canonical row-major tile array;
- connected participant IDs and names in deterministic join order;
- ISO start, deadline, and optional end timestamps;
- bounded positive generation-attempt count.

Board size must match the settings snapshot and tile count must equal size
squared. Tokens are uppercase ASCII engine tokens; `QU` remains one tile.
Deadline is exactly start plus the snapshotted configured duration. Unknown
keys are rejected at every new schema level.

The room retains only its current round. Starting a later round replaces the
ended snapshot and increments the round number exactly once, so round history
cannot grow without bound. Returned arrays and objects are copies; caller
mutation cannot alter internal state.

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
- Controller transfer remains allowed while active and changes only authority.

## Controlled production startup

`@words/server` has a runtime dependency on `@words/game-data`. Each server
instance calls `loadProductionDictionary()` exactly once from `start()`, before
the HTTP listener begins accepting connections. Startup requires a successful
79,370-word result. Failure produces one stable public startup error, prevents
listening and room creation, and leaves the partial HTTP/Socket.IO resources
safe to stop.

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
`stop()` clears the one interval.

Before state reads, joins, reconnects, disconnects, leaves, controller
transfers, settings updates, starts, and cleanup decisions, the room store
reconciles an active round whose deadline has arrived. This prevents a stale
`ROUND_ACTIVE` snapshot from authorizing a forbidden action.

The client calculates approximate remaining time from:

1. the difference between `deadlineAt` and the snapshot’s `serverTime`; and
2. elapsed `performance.now()` time since receiving that snapshot.

It clamps the display to zero, resets its anchor after reconnect or a newer
snapshot, and cleans up its browser interval. It never uses browser wall time
as authority and never locally invents `ROUND_ENDED`; the server phase remains
final.

## Stage 4C boundary

Stage 4C may introduce a strict player-only submission event, bounded
row-major paths, and server-side dictionary/path validation for current round
participants before the deadline. It must not expose the dictionary, trust a
client verdict, allow the display to submit, or move deadline and phase
authority into the browser.

Stage 4B intentionally contains no submission schema or event, word-entry UI,
score field, result table, rankings, winner selection, persistence, or
deployment changes.
