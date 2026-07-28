# Security requirements

Stage 2.5 has a real network boundary and controller-authority actions. Stage 3
adds an isolated, defensive game engine without exposing it to the network.
Stage 3.1 adds read-only hosted verification. This document separates
implemented controls from protections still required before public deployment
and gameplay.

## Implemented authority controls

- The server creates room codes, display IDs, player IDs, reconnect tokens,
  room state, and controller authority.
- Display creation accepts a strict empty object. It does not accept a room
  code, name, player ID, display ID, or controller claim.
- Player join accepts only room code and display name. It does not accept a
  controller flag or controller player ID.
- The first player receives controller authority from the server.
- Controller state is explicit: `none` has no controller ID or connected
  player, and `assigned` references exactly one existing player.
- Normal transfer accepts only `targetPlayerId`, requires the currently
  connected controller socket, and requires a different connected player in
  the same room.
- The display has no controller-assignment event. It cannot select, recover, or
  approve a game host.
- Controller succession is a server-owned lifecycle transition. It considers
  only connected remaining players and sorts by `joinedAt`, then player ID.
- Transfer and succession never change display identity.
- The display session is never inserted into the player collection and never
  counts toward the eight-player maximum.
- Each connected socket is bound to at most one server-created role session:
  `display` or `player`.
- Display and player reconnect tokens are stored in separate server indexes.
  Neither token can restore or impersonate the other role.
- Display or controller disconnect does not directly close the room.
- Public room state excludes socket IDs, token values, and private token
  indexes.

Future game state—board, deadline, settings, paths, word decisions, scores, and
results—must follow the same server-authority rule. In particular, a
display-bound socket must never submit a player word.

## Implemented input and output controls

- All lobby request payloads use shared strict Zod schemas at runtime.
- Unknown fields and malformed values are rejected.
- Socket.IO messages are capped at 16 KiB.
- Room codes use one canonical six-character format. Typed spaces and hyphens
  are removed, and letters are normalized to uppercase.
- Player display names normalize whitespace, allow 2–24 characters, and reject
  Unicode control and formatting characters.
- Duplicate player names are rejected within a room without regard to case.
- React renders names as text. Markup-like names are tested to remain plain
  content rather than executable HTML.
- Error responses use a fixed set of public codes and bounded messages.
- Express disables its identifying `X-Powered-By` response header.

Validation is not treated as authorization. The room store still decides
whether a validated action is allowed for the socket and current role.

## Implemented resource and abuse bounds

- Room codes use cryptographic randomness from a 32-character alphabet, giving
  32⁶ possible values.
- Code allocation checks active-room collisions and stops after a bounded
  number of attempts.
- A room accepts at most eight phone players; the one display is separate.
- The process accepts at most 500 rooms by default, with a bounded
  configuration range.
- Create, join, and reconnect attempts are limited to 20 per 10 seconds for one
  socket.
- Socket.IO payloads are capped at 16 KiB.
- Room lifetime defaults to a sliding two hours.
- Disconnect grace defaults to 60 seconds.
- Cleanup runs every 30 seconds by default and removes expired rooms, ordinary
  players, token mappings, socket references, and expired-code tombstones.
- A room with no connected controller candidate is still bounded by the
  eight-player cap and room lifetime.
- Environment-provided numeric limits are range-checked and fall back to safe
  defaults when invalid.

These controls reduce accidental exhaustion and simple abuse. They are not a
complete public anti-abuse system.

## Role-specific reconnect credentials

Reconnect tokens contain 32 cryptographically random bytes encoded with a
URL-safe alphabet. They are random secrets, not encoded claims.

The server issues different credential shapes:

- displays receive `displaySessionId` and `displayReconnectToken`;
- players receive `playerId` and `playerReconnectToken`.

Each token is indexed only in the matching role map and scoped to one room and
session ID. Tokens are not placed in URLs or logged by application code.

A successful reconnect invalidates the presented token and issues a new one. A
disconnect starts that role’s short grace period. Cleanup invalidates the
credential after the deadline.

If a valid credential is reused while its previous socket exists, the new
socket supersedes it. The old socket loses its room binding and receives a
structured error. This prevents two active sockets from silently sharing one
role during a refresh race. Stale-tab cleanup compares the failed token before
removing shared browser storage, so it cannot delete the replacement tab’s
newly rotated credential.

Browser storage is appropriate for this temporary, account-free Stage 2.5
session, but it is accessible to JavaScript on the same origin. A future
cross-site scripting flaw could expose it, so dependencies, text rendering, and
future HTML features still require review.

The automatic root display flow stores a separate profile-local pointer
containing only the display role, room code, and display session ID. It never
contains the reconnect token. Root startup validates the referenced
role-specific credential and reconnects it before creating a room. Invalid
display state clears only that display credential; it cannot consume a player
credential or affect another browser profile’s room.

## Disconnect and controller behavior

Disconnect is presence loss, not room ownership loss:

- the display going offline does not remove players;
- the controller going offline does not close the room;
- the disconnected controller retains authority during reconnect grace;
- a disconnected display or player may restore only its own role during grace;
- an ordinary player is removed after grace;
- if controller grace expires, its token and player record are removed;
- the server promotes the earliest-joined connected remaining player, breaking
  equal join-time ties by player ID;
- if none is connected, state becomes `none` and the next join or reconnect
  becomes controller;
- the old credential cannot reconnect after expiry, although the person can
  join again as an ordinary player;
- room TTL remains the final bound.

Controller absence is explicit rather than inferred. The display stays passive
through disconnect, expiry, and succession; it cannot make itself or anyone
else controller.

## Controller race handling

The room store authorizes and mutates each action synchronously against its
current socket binding:

- after one transfer succeeds, a second request from the former controller is
  rejected;
- a controller reconnect processed at the grace deadline before cleanup
  preserves authority;
- if cleanup wins, it invalidates the expired token before choosing a
  successor;
- duplicate cleanup work and competing leave/transfer operations resolve to
  exactly one controller;
- stale cleanup cannot overwrite a newer manual controller assignment;
- if the selected successor disconnects, that player receives the same grace
  behavior before the next deterministic succession;
- a replaced stale socket cannot disconnect the newer valid socket.

Tests cover these boundaries with competing requests, refreshed sockets,
offline targets, deterministic ties, repeat cleanup, and old-token reconnect
attempts.

## Origin and transport policy

Socket.IO currently allows the two standard local Vite origins and the
configured public base URL. The Vite server proxies `/api` and `/socket.io` in
development.

Public deployment must provide HTTPS at `https://words.atlee.io`, verify
WebSocket forwarding, and narrow the production origin policy to actual
deployment needs. Reconnect tokens are application credentials and must never
be sent over unencrypted public HTTP.

## Known Stage 2.5 limits

- Throttling is per socket, not per IP, subnet, device, or room code.
- A client can reconnect to obtain a new socket and a fresh request window.
- Room-not-found and recently expired responses are distinguishable, which may
  help code enumeration.
- There is no reverse-proxy request limit, network firewall policy, or
  production monitoring in this repository.
- Temporary credentials have no account identity, revocation interface, or
  durable audit record.
- The in-memory process is a single availability boundary; restarting it closes
  every room.

Before public deployment, add layered IP-aware limits at a trusted boundary,
review enumeration behavior, verify proxy IP handling, add safe operational
metrics, and test the exact origin and TLS configuration.

## Implemented Stage 3 engine controls

- Canonical boards support only sizes 4, 5, and 6 and exactly `size × size`
  tiles.
- Canonical tile tokens contain one to four uppercase ASCII letters.
- Successful board and path validation returns frozen snapshots rather than
  caller-owned arrays.
- Candidate words contain at most 64 ASCII letters after outer trimming and
  case normalization. Punctuation, internal whitespace, control and formatting
  characters, accents, and Unicode case expansions are rejected rather than
  silently removed.
- Paths must be non-empty, no longer than the board, and contain only unique
  in-range integer indexes. All entries are checked before tile access.
- Row/column adjacency prevents numeric row wrapping and accepts only one-cell
  horizontal, vertical, or diagonal moves.
- Path validation is linear and uses a Set for tile reuse. It has no recursion
  based on candidate data.
- The supplied path must reconstruct exactly the normalized submitted word
  before dictionary membership is queried.
- Dictionary lookup is injected, synchronous, filesystem-free, network-free,
  and Set-backed. Malformed input entries are reported.
- Weighted generation requires a validated injected random source. Non-finite
  or out-of-range values, non-finite weights, duplicate normalized tokens, and
  non-finite totals are rejected.
- Board-quality retry uses an iterative explicit limit from 1 through 1,000 and
  returns a structured exhaustion result.
- No production dictionary data, proprietary distribution, gameplay event, or
  dynamic code execution is included.

These controls protect pure engine calls. They do not authorize a socket,
verify room phase, enforce a deadline, or rate-limit network submissions.

## GitHub Actions security boundary

The Stage 3.1 CI workflow has explicit workflow-level `contents: read`
permission and no secrets. Checkout credentials are not persisted. The
workflow cannot push commits, change pull requests, publish packages, create
releases, deploy software, upload source to an external service, or alter
repository settings.

Only `actions/checkout` and `actions/setup-node` are used. Both official actions
are pinned to full release commit SHAs rather than mutable branches or tags.
There is no third-party action, downloaded shell script, `curl`-to-shell
installer, dynamic code download, or write-capable token.

Pull requests use the ordinary `pull_request` event, never
`pull_request_target`. Repository scripts from the proposed revision execute
with read-only repository permission and without secrets or Git credentials.
Concurrency cancels superseded work for the same pull request or ref without
mixing unrelated runs.

Hosted verification supplements local review. Branch protection and repository
Actions settings remain a separate settings task after the real check names
have completed successfully.

## Future gameplay requirements

When gameplay is added, the server must:

- permit only allowlisted grid sizes, durations, and scoring modes
- authorize settings and round starts against `controllerPlayerId`
- reject word submissions from display-bound sockets
- generate and retain the official board
- call the Stage 3 path and word engine only with the server-retained board
- reproduce, notice, checksum, audit, and load the approved pinned dictionary
- enforce the server deadline and phase
- rate-limit submissions per player and room
- calculate scores and duplicate handling from accepted server data
- add a regression test for each engine or authorization bug

No gameplay event may trust a client-provided score, time, controller role,
board, dictionary result, settings object, or round result.

## Secrets and operations

- Never commit passwords, API tokens, tunnel credentials, private keys,
  registry tokens, personal server addresses, or real `.env` files.
- Supply future secrets through the deployment environment.
- Do not log reconnect tokens or future word/session credentials.
- Keep dependencies updated through reviewable changes.
- Run the future container as a non-root user with only required port and
  filesystem access.
- Record the license and attribution for every dictionary and bundled asset.
