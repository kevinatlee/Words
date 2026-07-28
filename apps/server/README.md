# Words server

Stage 2.5 uses one trusted Node.js process for the health API and temporary
Socket.IO lobbies. Each room has a separate shared-display session, zero to
eight phone players, and explicit `none` or `assigned` controller state. Display
and player reconnect credentials exist only in memory and disappear when the
process restarts.

The current connected controller can use `controller:transfer` to name another
connected player. If the controller explicitly leaves or reconnect grace
expires, the server promotes the earliest-joined connected remaining player,
breaking equal join-time ties by player ID. The display stays passive and has no
controller-assignment event. The room store performs all role, socket, target,
and lifecycle authorization.

Run both the server and Vite client from the repository root with `npm run dev`.
The server listens on `http://localhost:6532` by default.

Gameplay, persistence, production packaging, and deployment are not included.
