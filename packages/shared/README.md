# Shared network contract

`@words/shared` is the single source for product configuration, strict Zod
payloads, Socket.IO event maps, acknowledgements, errors, room state, and the
Stage 4B round lifecycle.

The room phase is exactly `LOBBY`, `ROUND_ACTIVE`, or `ROUND_ENDED`. A serialized
room includes a server-owned state version and clock snapshot, authoritative
settings, and at most one current round. Round state contains an immutable
board and connected-player snapshot, server UUID and number, official
timestamps, and bounded generation attempts.

The only Stage 4B controller actions are:

- `controller:update-settings` with one complete strict `RoomSettings`;
- `controller:start-round` with a strict empty object.

The shared package defines shapes; the server still performs authorization and
owns every official value. There is no submission, path, word, score, or result
network schema in Stage 4B. See
[`../../docs/ROUND_LIFECYCLE.md`](../../docs/ROUND_LIFECYCLE.md).
