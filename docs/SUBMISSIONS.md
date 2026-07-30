# Player-private submissions

Stage 4C adds one player-only Socket.IO action, `player:submit-word`, for
current-round participants. The server remains authoritative for the socket
identity, participant snapshot, official board, deadline, path and word
validation, production dictionary lookup, duplicate decision, and provisional
points.

## Privacy boundary

`RoomState` and `RoundState` remain public room snapshots. They never contain
submitted or accepted words, submission counts, personal scores, or
cross-player duplicate information. A display and other players therefore
cannot observe one player's submission activity.

Each participant instead has one bounded `PlayerRoundSubmissionState` held
privately beside the current round. It contains only canonical accepted words,
traditional points, acceptance time, deterministic sequence, and the exact
provisional total. Paths are discarded after validation. Rejected attempts are
not retained. Starting the next round replaces every private submission map;
there is no previous-round history or persistence.

Player join and reconnect acknowledgements include `submissionState`, which is
`null` before a round and for a mid-round joiner. A reconnecting participant
receives only their own state. Display acknowledgements have no such field.

## Wire and authorization contract

The strict request contains only a round UUID, a word of at most 64 wire
characters, and 1–36 row-major integer indexes from 0 through 35. It accepts no
player ID, room code, board, timestamp, deadline, score, points, dictionary
result, validity flag, or unknown field. The phone derives the word from the
selected official tile tokens, but the server still requires an exact
path/word match.

The server captures one receipt time, applies a separate 20-per-1,000-ms
socket submission limit before payload parsing, checks the current
player-bound newest socket, reconciles the deadline, requires the active
matching round and immutable participant membership, and then applies the
10-per-1,000-ms stable room/player limiter before `validateWordPath()`.
Personal duplicates, the 256-word bound, traditional points, and the complete
next private state are validated before one atomic private commit.

At `now >= deadlineAt`, the room first transitions to `ROUND_ENDED` with
`endedAt === deadlineAt`, publishes that transition exactly once, and rejects
the submission. A rejected, malformed, or rate-limited request cannot hide the
transition.

Success returns the accepted word and complete private state only to the
requesting socket. Authorized failures may return the unchanged private state
to recover from a lost earlier acknowledgement. Unbound, display-bound, stale,
removed, or unrelated requests return `state: null`. There is no room-wide
word event.

## Bounds and phone behavior

All submission events, including malformed and unbound events, are limited to
20 per 1,000 ms per socket. Authenticated participant attempts also consume a
10-per-1,000-ms allowance keyed by room code and player ID, so reconnecting
does not reset that stricter window. Neither allowance consumes controller
action capacity. Socket entries are cleared on disconnect; stable keys are
bounded by room/player limits and stale windows are pruned during later
attempts without a timer. Each participant retains at most 256 unique accepted
words for only the current round.

Only a connected current participant receives interactive board buttons during
an active round. Taps/clicks add an adjacent unused tile, preserve complete
tokens such as `QU`, and show selection order. Undo removes the latest tile;
Clear removes the path. Success clears the selection, while rejection retains
it consistently for revision or retry. Native buttons remain inside accessible
grid cells for keyboard activation, and selection stops with local feedback
before the derived candidate exceeds the 64-letter wire bound.

The phone shows only **Your accepted words** and **Provisional points**, plus
“Shared-word reconciliation is not implemented yet.” Provisional totals are
not final scores. Continuous drag tracing, cross-player duplicate
cancellation, final results, rankings, and winners remain Stage 4D.
