# Shared network contract

`@words/shared` is the single source for product configuration, strict Zod
payloads, Socket.IO event maps, acknowledgements, errors, room state, the Stage
4B round lifecycle, Stage 4C private submissions, and Stage 4D public result
contracts.

Stage 4E reuses the shared `buildJoinUrl()` helper for both the visible display
link and its local QR encoding. The helper normalizes the room code, replaces
the path, removes query parameters, fragments, and URL userinfo, and preserves
the current origin and optional development port. Stage 4E adds no shared
network event or room-state field.

The room phase is exactly `LOBBY`, `ROUND_ACTIVE`, or `ROUND_ENDED`. A serialized
room includes a server-owned state version and clock snapshot, authoritative
settings, and at most one current round. Round state contains an immutable
board and connected-player snapshot, server UUID and number, official
timestamps, bounded generation attempts, and nullable finalized results.
`results` is null while active and required when ended. Strict cross-field
validation checks participant identity, score order, competition ranks,
shared-word status, exact quarter-point totals, and every tied positive winner.
Every public word retains traditional `basePoints`; a unique word carries a
integer `uniqueBonusPoints` value (+1 or +2), while a shared word has zero bonus and keeps its
base as `finalPoints`. Player entries expose exact base, bonus, and final
totals. Runtime parsing rejects non-quarter values, non-finite values, negative
values, and negative zero.

The only Stage 4B controller actions are:

- `controller:update-settings` with one complete strict `RoomSettings`;
- `controller:start-round` with a strict empty object.

The shared package defines shapes; the server still performs authorization and
owns every official value. `player:submit-word` returns separately versioned
private state only through player acknowledgements. That private state never
enters `RoomState`; after the deadline, a detached minimal result projection
does. No result event was added: the existing `room:state` snapshot carries the
ended result. See [`../../docs/SUBMISSIONS.md`](../../docs/SUBMISSIONS.md) and
[`../../docs/RESULTS.md`](../../docs/RESULTS.md).
