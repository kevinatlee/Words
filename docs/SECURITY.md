# Security requirements

Stage 2.5 established the network and controller boundary. Stage 3 adds an
isolated defensive engine, Stage 3.1 adds read-only hosted verification, and
Stage 4A adds verified server-only production data, Stage 4B adds authoritative
rounds, and Stage 4C adds player-private submissions now in review. This
document separates implemented controls from protections still required before
public deployment.

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

Stage 4C keeps paths, word decisions, and provisional points server-owned. Only
the newest connected socket for a current participant can submit; displays,
mid-round joiners, removed players, and stale replaced sockets are rejected.

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
- Settings and start payloads are strict complete/empty objects. Clients cannot
  provide a board, seed, participant, timestamp, deadline, or round number.
- Successful action acknowledgements are schema-validated by the client, and a
  state version prevents a stale acknowledgement from replacing a newer
  broadcast.

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
- Board generation uses one cryptographic 48-bit sample per random value and
  the Stage 4A eight-attempt quality bound.
- One unreferenced 250 ms lifecycle interval scans bounded rooms. There is no
  unmanaged timer per room or client.

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

Browser storage is appropriate for the current temporary, account-free
sessions, but it is accessible to JavaScript on the same origin. A future
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

## Stage 4B round authority

- Controlled startup loads the verified 79,370-word dictionary exactly once
  before listening or allowing room creation.
- The dictionary and provenance remain private server runtime state. Room
  snapshots, health output, logs, and client bundles contain no entries.
- Only the bound connected controller socket may update settings or start.
- Board generation and result validation finish before room mutation.
  Exhaustion leaves phase, prior round, settings, activity, and TTL unchanged.
- Round reconciliation is idempotent and records the official deadline as
  `endedAt`; it does not extend TTL.
- Disconnect, reconnect, leave, grace expiry, mid-round join, and controller
  transfer do not move the deadline or rewrite the participant snapshot.
- Returned boards and participants are copies, so caller mutation cannot alter
  internal room state.
- The client countdown uses the server snapshot plus `performance.now()` only
  for display. It cannot change the authoritative phase.

There is no production `Math.random()`, client seed, audit PRNG, per-room timer,
manual end action, dictionary socket lookup, submission, scoring, or result
payload in Stage 4B.

## Stage 4C submission privacy

- Public room and round state contains no words, counts, or personal points.
- Reconnect returns only the bound player's current private state.
- Strict requests accept no identity, board, time, score, points, or verdict.
- The server uses `validateWordPath()` with its board and private dictionary,
  discards paths, stores no rejection history, and never logs submitted words.
- Personal duplicates, the 256-word cap, scoring, and the complete strict next
  state are checked before one atomic commit.
- A 20-per-1,000-ms per-socket submission limiter runs before parsing, bounds
  malformed and unauthenticated events, and clears on disconnect.
- The stricter 10-per-1,000-ms limiter is keyed by room/player, survives
  refresh, and remains separate from controller-action capacity.
- Exact-deadline processing publishes the ended transition even for malformed,
  rejected, or rate-limited submissions.

## Known current limits

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
- The room/player submission limiter is not an IP-aware public edge limit.

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

## Implemented Stage 4A game-data controls

- The production dictionary source repository, release tag, direct and peeled
  commit, export arguments, counts, bytes, SHA-256, and metadata-free gzip size
  and SHA-256 are pinned.
- The complete applicable ESDB permission notice is committed beside the data
  and verified by an independently pinned full-file SHA-256.
  Conditional licence branches not selected by the size-60 American/Canadian
  export are not represented as though they applied.
- Reproduction fetches only the pinned tag at depth one from the fixed official
  URL, checks out the pinned commit directly, invokes subprocesses without a
  shell, accepts no output path, and rejects a source checkout whose remote,
  tag, peeled commit, `HEAD`, tracked state, untracked state, or source-path
  file type differs.
- Generated dictionary output is length- and count-bounded, written in a
  same-directory temporary location, verified completely, gzip-measured, and
  atomically renamed. Symbolic-link output targets are rejected and temporary
  directories are removed on success and failure.
- Normal verification is offline. It checks regular file types, exact manifest
  fields, checksum, bytes, final newline, LF-only endings, BOM absence, ASCII
  format, per-line length, strict sort order, uniqueness, notice scope, and
  byte-identical regenerated distribution data.
- The runtime loader accepts only local file URLs, resolves production files
  relative to its module rather than the process working directory, bounds
  error detail, rejects symlinks and non-regular files, validates the exact
  schema and every pinned manifest field, verifies one read before constructing
  the dictionary, exposes no Set, and has no mutable global cache. The built
  JavaScript loader is smoke-tested from an unrelated working directory.
- Candidate derivation and board audits use fixed sample counts and a clearly
  non-production seeded generator. Production generation still requires an
  injected random source and can make at most eight attempts.
- The dictionary-derived profile has positive safe-integer weights, includes
  `QU` instead of standalone `Q`, contains no proprietary table, and records
  zero manual adjustments.
- Browser-conditioned package resolution is disabled. The client’s transitive
  workspace graph is checked for game-data dependencies, imports, aliases,
  relative paths, and re-exports; symbolic links are rejected throughout the
  scanned source and build boundaries; lint enforces the same source boundary;
  and post-build CI scans the emitted bundle for the dictionary hash and
  sentinel words. Neither application loads game data in Stage 4A.
- Scripts perform no dynamic code download, runtime external request, secret
  access, full-dictionary logging, persistence, or gameplay mutation.

The word list is under one megabyte. Loader memory is suitable for a controlled
one-time startup load, but Stage 4B must not reload it per request, submission,
player, or room.

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

## Gameplay authority requirements

Stage 4C implements the submission-related parts of this boundary; later
gameplay stages must continue to:

- permit only allowlisted grid sizes, durations, and scoring modes
- authorize settings and round starts against `controllerPlayerId`
- reject word submissions from display-bound sockets
- generate and retain the official board
- call the Stage 3 path and word engine only with the server-retained board
- load and retain the Stage 4A verified dictionary once during controlled
  startup
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
