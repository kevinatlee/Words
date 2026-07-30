# Words server

Words uses one trusted Node.js process for the health API, temporary Socket.IO
rooms, and Stage 4B authoritative rounds. Each room has a separate
shared-display session, zero to eight phone players, and explicit `none` or
`assigned` controller state. Display and player reconnect credentials exist
only in memory and disappear when the process restarts.

The current connected controller can use `controller:transfer` to name another
connected player. If the controller explicitly leaves or reconnect grace
expires, the server promotes the earliest-joined connected remaining player,
breaking equal join-time ties by player ID. The display stays passive and has no
controller-assignment event. The room store performs all role, socket, target,
and lifecycle authorization.

During `start()`, the server verifies and privately retains the Stage 4A
79,370-word production dictionary before it listens or accepts room creation.
The connected controller can atomically update complete supported settings and
start a round. The server uses Node cryptographic randomness to generate the
official board, snapshots connected participants, owns the exact deadline, and
ends the round through one bounded lifecycle sweep. Reconnect and controller
transfer do not change the current board or deadline.

Run both the server and Vite client from the repository root with `npm run dev`.
The server listens on `http://localhost:6532` by default.

Word submission, scoring, results, persistence, production packaging, and
deployment are not included. The full contract is documented in
[`../../docs/ROUND_LIFECYCLE.md`](../../docs/ROUND_LIFECYCLE.md).
