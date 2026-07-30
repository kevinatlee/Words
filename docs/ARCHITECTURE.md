# Architecture

This document describes the completed lobby, Stage 3 engine, Stage 3.1 CI,
completed Stage 4A production game data, and the Stage 4B authoritative round
lifecycle now in review.

## Runtime pieces

**React browser client (`apps/client`):** Provides display, player join,
live-lobby, and retained static preview screens. It renders server state but is
never the source of truth for membership or controller authority.

**Node.js server (`apps/server`):** Runs Express and Socket.IO in one process.
It owns active rooms, display sessions, players, `controllerPlayerId`,
`controllerStatus`, role-specific reconnect credentials, settings, round
boards, participant snapshots, deadlines, phases, authorization, expiration,
capacity, and cleanup.

**Shared package (`packages/shared`):** Defines product configuration, strict
Zod schemas, state shapes, structured errors, acknowledgements, and typed
Socket.IO event maps. Both client and server import the same contract.

**Game-engine package (`packages/game-engine`):** Pure TypeScript for immutable
board validation, injected-random weighted generation, bounded rejection,
row-major paths, adjacency, word normalization, exact path-word matching, and
an injected dictionary. It has no runtime dependencies and does not import the
lobby, browser, Socket.IO, or Node runtime APIs.

**Game-data package (`packages/game-data`):** Private server-oriented TypeScript
and committed data for the verified production dictionary, immutable
dictionary-derived default distribution, simple size-specific board-quality
profiles, a filesystem loader, and deterministic offline audits. It depends on
the engine but not on the browser, React, Express, Socket.IO, or room store.

The Stage 4B server imports game data and uses its bounded default board
generator. The client still imports neither game data nor the engine.
Dictionary contents remain private to the server. No word submission, score,
or result state exists.

## Roles

```text
Room
├── one display session
│   └── TV/shared-screen presentation; not a player
└── zero to eight player sessions
    └── zero or one controller player, described by controllerStatus
```

The controller is a participating phone player. The first player receives the
role from the server. An authorized transfer or automatic succession changes
only controller authority; it does not replace or modify the display session.
The display is passive and has no event for selecting, recovering, or approving
a controller.

The valid controller states are:

- `none`: `controllerPlayerId = null`, no player is marked as controller, and no
  remaining player is connected
- `assigned`: exactly one player matches `controllerPlayerId`

The display is excluded from player capacity and cannot use player
credentials. Future word-submission handlers must reject display-bound sockets.

## Local request path

`npm run dev` starts both development processes:

```text
Browser
  |
  v
Vite client on :5173
  |-- React routes and assets
  |-- /api/* ---------+
  `-- /socket.io/* ---+--> Node server on :6532
                            |-- GET /api/health
                            `-- Socket.IO lobby events
                                  |
                                  v
                            in-memory RoomStore
```

The Vite proxy means the browser connects to its current origin. The current
production build does not yet serve the React build from Express.

## Health endpoint

`GET /api/health` returns:

```json
{
  "status": "ok",
  "service": "Words",
  "version": "0.2.5",
  "gameDataReady": true
}
```

The endpoint proves that the Node process can answer HTTP requests. It does not
inspect an external database because there is none.

## Shared real-time contract

Client requests use acknowledgements so one request receives one structured
result.

Display events:

| Event               | Client fields                       | Purpose                       |
| ------------------- | ----------------------------------- | ----------------------------- |
| `display:create`    | none                                | Create the room display       |
| `display:reconnect` | `roomCode`, `displayReconnectToken` | Restore the display role      |
| `display:leave`     | none                                | Leave the display socket room |

Player events:

| Event              | Client fields                      | Purpose                      |
| ------------------ | ---------------------------------- | ---------------------------- |
| `player:join`      | `roomCode`, `displayName`          | Create a player session      |
| `player:reconnect` | `roomCode`, `playerReconnectToken` | Restore one player role      |
| `player:leave`     | none                               | Leave the player socket room |

Controller events:

| Event                        | Client fields           | Authorized caller and purpose                     |
| ---------------------------- | ----------------------- | ------------------------------------------------- |
| `controller:transfer`        | `targetPlayerId`        | Current controller assigns a connected player     |
| `controller:update-settings` | complete `RoomSettings` | Current controller configures the next round      |
| `controller:start-round`     | none                    | Current controller starts one authoritative round |

The server emits:

| Event                  | Purpose                                           |
| ---------------------- | ------------------------------------------------- |
| `room:state`           | Replace the client’s authoritative room snapshot  |
| `room:error`           | Report asynchronous expiry or session replacement |
| `display:connected`    | Announce restored display presence                |
| `display:disconnected` | Announce lost display presence                    |
| `player:connected`     | Announce joined or restored player presence       |
| `player:disconnected`  | Announce lost player presence                     |

All incoming request objects use strict Zod schemas. Unknown fields—including
client-provided controller fields—are rejected. Display acknowledgements return
`displaySessionId` and `displayReconnectToken`; player acknowledgements return
`playerId` and `playerReconnectToken`. Public room snapshots never include
either token.

## Display creation flow

```text
browser opens /
  -> load profile-local active display pointer
  -> if credential exists: display:reconnect
     -> success rotates credential and restores the same room
     -> invalid/expired/missing room clears only that stale credential
  -> if no usable credential: display:create {}
     -> per-socket request limit
     -> strict empty-object validation
     -> allocate server room code
     -> create display session and credential
     -> controllerPlayerId = null
     -> players = []
     -> bind socket as role: display
     -> acknowledge room + display credential
```

Room creation accepts no name, room code, player ID, or role field. The display
is never inserted into the player map. One guarded startup attempt prevents
React development checks or rerenders from creating duplicate rooms. Genuine
server or transport failures show an explicit retry instead of looping.

## Player join flow

```text
player:join { roomCode, displayName }
  -> per-socket request limit
  -> strict validation and code normalization
  -> capacity and duplicate-name checks
  -> create server player ID and credential
  -> if no controller: assign the earliest-joined connected player
  -> otherwise: preserve existing controllerPlayerId
  -> bind socket as role: player
  -> acknowledge room + player credential
  -> broadcast authoritative room state
```

No join payload can contain a controller claim. The room store, not player
order supplied by the browser, decides initial authority.

## Controller transfer flow

```text
controller:transfer { targetPlayerId }
  -> strict validation and per-socket request limit
  -> require a player-bound socket for the current controller
  -> require a different, connected target in the same room
  -> atomically replace controllerPlayerId
  -> preserve controllerStatus = assigned
  -> acknowledge and broadcast authoritative room state
```

An ordinary player, the display, a stale former controller, an unbound socket,
and a disconnected or cross-room target are rejected with structured errors.
The payload cannot include a requester ID, controller claim, role, or room
state.

## Authoritative settings and round flow

Settings updates are strict complete replacements accepted only from the bound,
connected controller in `LOBBY` or `ROUND_ENDED`. A round start accepts an
empty object, snapshots settings and connected players, generates a bounded
server-only board, creates the official deadline, increments the round number,
and broadcasts one state.

Room phases are exactly `LOBBY`, `ROUND_ACTIVE`, and `ROUND_ENDED`. One 250 ms
server interval reconciles due rounds and broadcasts only changes. Reconnect,
disconnect, leave, controller transfer, and mid-round join preserve the board,
participant snapshot, and deadline. See
[`ROUND_LIFECYCLE.md`](ROUND_LIFECYCLE.md) for the full invariants and Stage 4C
boundary.

## Automatic controller succession

```text
controller explicitly leaves, or cleanup expires controller grace
  -> remove the former controller and invalidate its credential
  -> collect connected remaining players
  -> sort by joinedAt ascending, then player ID ascending
  -> assign the first eligible player
  -> or set controllerStatus = none when none is connected
  -> broadcast one authoritative room state for the completed transition
```

If controller state is `none`, the next player to join or reconnect is selected
automatically. A reconnect processed exactly at its grace deadline is valid if
cleanup has not already removed the player. If cleanup wins, the expired token
is invalid and cannot reclaim authority. The person may join again as a new
ordinary player. The display does not participate in any of these transitions.

## In-memory room store

Rooms are keyed by normalized room code. Each internal room holds:

- phase (`LOBBY`, `ROUND_ACTIVE`, or `ROUND_ENDED`)
- a monotonically increasing state version
- creation, activity, and expiration timestamps
- one internal display session
- `controllerPlayerId`
- `controllerStatus`
- a bounded map of zero to eight players
- authoritative next-round settings
- at most one current immutable round snapshot

The internal display holds a server UUID, connection status, creation time,
current socket ID, reconnect-token reference, and disconnect deadline.

Internal players hold a different server UUID, normalized display name,
connection status, join time, current socket ID, reconnect-token reference, and
disconnect deadline.

The store maintains separate display-token and player-token maps. A display
token is never looked up as a player token, and a player token is never looked
up as a display token. Token generation collision-checks both maps.

Room codes, IDs, and tokens use Node’s cryptographic random APIs. Active-code
and token collisions are retried with fixed upper bounds.

## Browser session storage

Display and player credentials have distinct browser-storage entries:

```text
words:reconnect:display:<roomCode>:<displaySessionId>
words:reconnect:player:<roomCode>:<playerId>
```

The current tab stores a role, room code, and session-ID pointer in session
storage. The browser profile also stores
`words:active-display-session`, a token-free pointer to the display credential
that belongs to that profile. This lets `/` find and reconnect its display while
separate browser profiles continue to own separate display rooms.

On `/`, the client validates the display pointer and calls only
`display:reconnect`. On `/room/:code`, it validates the per-tab player pointer
and calls only `player:reconnect`. A successful reconnect rotates and replaces
that role’s token.

The display’s join link is built centrally as `/join/<normalizedCode>` using
the current browser origin. `/join/:roomCode` locks the prefilled code while
`/join` remains the manual-entry fallback. `/display` and `/host` canonicalize
to `/`.

If a valid token is presented while the previous socket still exists—for
example, during a fast refresh—the new socket replaces the old socket binding.
The old tab receives `RECONNECT_FAILED`. When that tab clears its stale browser
state, it removes the shared local-storage credential only if the stored token
still matches the token that failed. It cannot erase a newer rotated token
saved by the replacement tab.

## Disconnect, leave, and cleanup

A transport disconnect marks the applicable display or player offline and
starts the configured grace period. It does not directly delete the room.

An explicit leave also does not make either the display socket or controller
socket a room-lifetime switch:

- a display leave marks the display offline;
- an ordinary player leave removes that player;
- a sole controller leave removes that player and returns the room to zero
  players with `controllerStatus = none`;
- a controller leave while other players remain promotes the earliest-joined
  connected player, with player ID as the tie-breaker;
- if no remaining player is connected, controller state becomes `none` until a
  player joins or reconnects.

Periodic cleanup:

- deletes any room whose sliding lifetime expired;
- expires disconnected display credentials without removing present players;
- removes ordinary players whose reconnect grace expired;
- removes a disconnected controller and invalidates its credential after grace;
- promotes the earliest-joined connected remaining player after controller
  expiry, or uses `none` if no player is connected;
- removes an abandoned room when it has no players and its disconnected display
  credential has expired;
- clears token mappings and bounded expired-code tombstones.

The store performs transfer, succession, disconnect, reconnect, and cleanup
mutations synchronously. Each action rechecks the current server binding and
room state, so two requests from a formerly authorized socket cannot both win.
A stale replaced socket cannot disconnect the newest valid socket. Room TTL
still bounds every room, including one with no connected controller candidate.

## Server-authority boundary

Browsers are controlled by users and can send invented events. The server
trusts only strict shared payloads mapped to a current server-bound role and
socket. It owns settings, board generation, participants, round number,
timestamps, phase, and deadline. The client never supplies an official score,
controller role, board, seed, timer, dictionary verdict, or round result. A
display-bound socket has no submission action.

## Generic board dimensions

The retained board preview accepts a dimension and generates its cell count.
The Stage 3 engine now stores the dimension in every board and validates exactly
`size × size` immutable tiles. Supported dimensions are 4 × 4, 5 × 5, and
6 × 6.

Canonical paths are arrays of row-major indexes. Adjacency derives row and
column differences from `size`, accepts horizontal, vertical, and diagonal
steps, and rejects tile reuse, row wrapping, and jumps. Tile tokens contain one
to four uppercase ASCII letters, so a `QU` tile contributes two letters without
changing path indexing.

## Game-engine data flow

```text
caller-owned configuration
  -> validate size, normalized weighted tokens, weights, RNG, retry bound
  -> generate and freeze candidate board
  -> optional bounded acceptance predicate
  -> immutable Board or NO_ACCEPTABLE_BOARD

candidate submission
  -> validate and snapshot Board
  -> normalize ASCII submitted word
  -> enforce minimum normalized letter length
  -> validate traced row-major path
  -> reconstruct complete tile-token word
  -> require exact word/path equality
  -> query injected WordDictionary
  -> structured success or candidate-safe failure
```

Player-controlled validation returns discriminated results. Programmer mistakes
in generation configuration throw a documented `EngineConfigurationError`.
Path validation is linear in path length and dictionary membership is an
effectively constant-time Set lookup.

Every random board requires an injected source whose values are finite and in
`[0, 1)`. The engine never falls back to `Math.random()`. Acceptance retries are
iterative and explicitly limited to at most 1,000.

The engine defines neither a default letter distribution nor a production
dictionary. Stage 4A keeps those external concerns in `@words/game-data`.

## Server-only production game data

The production loader resolves its package files with `import.meta.url`,
rejects symlinks and non-regular files, validates every strict manifest field,
byte count, SHA-256, canonical lines, and word count, and then calls the
engine’s Set-backed dictionary constructor. It returns a structured failure and
has no network access or global mutable cache. Its emitted JavaScript is
smoke-loaded from an unrelated working directory. Stage 4B calls it once during
controlled server startup and retains the result privately.

The selected default distribution counts each letter at most twice per
accepted dictionary word. Q’s derived weight becomes the `QU` token;
standalone `Q` is absent and ordinary `U` remains. There are no manual weight
adjustments. The profile supports all engine sizes generically.

The quality predicate checks only vowel-token range and maximum occurrence of
one token. `QU` is not a vowel. Profiles for sizes 4, 5, and 6 use simulated
thresholds and eight attempts, preserving the engine’s bounded structured
failure. `generateDefaultBoard({ size, random })` still requires caller-owned
randomness and never generates during module import.

Reproduction may use the network only in the explicit dictionary-build
command. Normal data verification, vocabulary audit, distribution derivation,
board audit, application builds, and runtime lookup use committed local data.
See [`GAME_DATA.md`](GAME_DATA.md).

## Hosted verification boundary

Stage 3.1 provides one GitHub Actions workflow with two read-only jobs. `Quality`
performs a locked `npm ci` install, formatting, lint, type checking, tests,
builds, and a final repository-cleanliness check. `Dependency audit` applies the
high-severity npm advisory threshold independently.

Stage 4A adds a separate `npm run data:verify` Quality step. It verifies the
committed dictionary, notice, manifest, generated distribution files, and
transitive client-source boundary without fetching or rebuilding ESDB.
Symbolic links are rejected inside both client verification boundaries. After
the client build, a second invocation verifies the emitted bundle excludes the
dictionary hash, package identifier, and representative sentinels.

The workflow runs for pull requests targeting `main`, pushes to `main`, and
manual dispatches. It uses Node.js 24, official actions pinned to immutable
commits, no secrets, no persisted checkout credentials, and workflow-level
`contents: read` permission. It does not change runtime architecture or publish,
deploy, release, approve, or write repository state. See [`CI.md`](CI.md).

## Why no database or Redis

Rooms are intentionally temporary. Losing active rooms when the server process
restarts is acceptable. A database would introduce migrations, backups,
credentials, and failure cases without satisfying a current requirement.

Redis is useful when several processes must share room state. The intended
initial deployment is one Node.js process, so in-memory state is simpler. This
decision can be revisited if measured needs change.

## Intended production request path

The eventual production topology is one public HTTPS origin forwarding to one
Words process on port `6532`. That process will serve the built client, health
API, Socket.IO, game engine, and an openly licensed dictionary.

Container packaging, static serving, tunnel configuration, deployment
automation, and image publishing are not implemented through Stage 4A.
