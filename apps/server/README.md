# Words server

Words uses one trusted Node.js process for the health API, temporary Socket.IO
rooms, authoritative rounds, Stage 4C private submissions, and Stage 4D final
results. Each room has a separate shared-display session, zero to eight phone
players, and explicit `none` or `assigned` controller state. Display and player
reconnect credentials exist only in memory and disappear when the process
restarts.

The current connected controller can use `controller:transfer` to name another
connected player. If the controller explicitly leaves or reconnect grace
expires, the server promotes the earliest-joined connected remaining player,
breaking equal join-time ties by player ID. The display stays passive and has no
controller-assignment event. The room store performs all role, socket, target,
and lifecycle authorization.

During `start()`, the server verifies and privately retains the Stage 4A
79,370-word production dictionary, exact checksum, and pinned source identity
before it listens or accepts room creation. A server instance is single-use:
stopping cancels pending startup, and a stopped instance cannot later begin
listening when an earlier load finishes.
The connected controller can atomically update complete supported settings and
start a round. The server uses Node cryptographic randomness to generate the
official board, snapshots connected participants, owns the exact deadline, and
ends the round through one bounded lifecycle sweep. Reconnect and controller
transfer do not change the current board or deadline.

During an active round, accepted submissions advance one count-only public
progress entry and one room version. Word identities and provisional scores
remain in the submitting player's private acknowledgement and server state.

Run both the server and Vite client from the repository root with `npm run dev`.
The server listens on port `6532` by default.
Client hot reload remains enabled. The server deliberately does not restart
automatically because doing so would discard its temporary rooms; stop and
restart `npm run dev` after changing server source. Server crashes remain
visible and terminate the combined command.

Current participants may submit one bounded path through the official board,
private production dictionary, and traditional scorer. Personal accepted word
identities and provisional points are reconnect-safe and never broadcast while
active; only authoritative accepted counts are public. At
the exact deadline, the room store atomically reconciles the immutable
participant snapshot, retains every accepted word's base points, awards an
fixed +1 or +2 bonus only to unique words, ranks final scores, and publishes the
detached result only through `room:state`. No accepted timestamp, path, private
version, credential, or dictionary data enters the result. Repeated
finalization is a no-op and the controller may start the next round from
`ROUND_ENDED`.

Persistence, packaging, and deployment are not included. See
[`../../docs/SUBMISSIONS.md`](../../docs/SUBMISSIONS.md) and
[`../../docs/RESULTS.md`](../../docs/RESULTS.md).
