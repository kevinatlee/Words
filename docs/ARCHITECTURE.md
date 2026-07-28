# Architecture

This document describes the implemented Stage 2 lobby and the boundaries that
later game stages must preserve.

## Runtime pieces

**React browser client (`apps/client`):** Provides display, player join,
live-lobby, and retained static preview screens. It renders server state but is
never the source of truth for membership or controller authority.

**Node.js server (`apps/server`):** Runs Express and Socket.IO in one process.
It owns active rooms, display sessions, players, `controllerPlayerId`,
role-specific reconnect credentials, expiration, capacity, and cleanup.

**Shared package (`packages/shared`):** Defines product configuration, strict
Zod schemas, state shapes, structured errors, acknowledgements, and typed
Socket.IO event maps. Both client and server import the same contract.

**Game-engine package (`packages/game-engine`):** Reserved for Stage 3. The
lobby does not generate boards, validate paths, use a dictionary, or score
words.

## Roles

```text
Room
├── one display session
│   └── TV/shared-screen presentation; not a player
└── zero to eight player sessions
    └── exactly one controllerPlayerId once any player exists
```

The controller is a participating phone player. The first player receives the
role from the server. Future delegation will change only
`controllerPlayerId`; it must not replace or modify the display session.

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

The Vite proxy means the browser connects to its current origin. The Stage 2
production build does not yet serve the React build from Express.

## Health endpoint

`GET /api/health` returns:

```json
{
  "status": "ok",
  "service": "Words",
  "version": "0.2.0"
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
display:create {}
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
is never inserted into the player map.

## Player join flow

```text
player:join { roomCode, displayName }
  -> per-socket request limit
  -> strict validation and code normalization
  -> capacity and duplicate-name checks
  -> create server player ID and credential
  -> if first player: controllerPlayerId = new player ID
  -> otherwise: preserve existing controllerPlayerId
  -> bind socket as role: player
  -> acknowledge room + player credential
  -> broadcast authoritative room state
```

No join payload can contain a controller claim. The room store, not player
order supplied by the browser, decides initial authority.

## In-memory room store

Rooms are keyed by normalized room code. Each internal room holds:

- phase (`LOBBY` only)
- creation, activity, and expiration timestamps
- one internal display session
- `controllerPlayerId`
- a bounded map of zero to eight players
- read-only default settings

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
storage. This lets tabs on one origin represent different players or the
display without overwriting the active identity for another tab.

On `/room/:code`, the client validates the stored credential shape and calls
only the matching reconnect event. A successful reconnect rotates and replaces
that role’s token.

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
  players with `controllerPlayerId = null`;
- a controller leave while other players remain keeps that controller offline,
  preserving authority without automatic transfer.

Periodic cleanup:

- deletes any room whose sliding lifetime expired;
- expires disconnected display credentials without removing present players;
- removes ordinary players whose reconnect grace expired;
- removes a sole disconnected controller after its grace period;
- retains an offline controller record when other players remain, while
  invalidating its expired credential;
- removes an abandoned room when it has no players and its disconnected display
  credential has expired;
- clears token mappings and bounded expired-code tombstones.

This Stage 2 model deliberately prefers an unavailable offline controller to an
unauthorized automatic election. Future delegation can assign a new
`controllerPlayerId` through a server-authorized controller action. Room TTL
still bounds every such room.

## Server-authority boundary

Browsers are controlled by users and can send invented events. Stage 2 trusts
only data it validates and maps to a server-bound role session.

Future stages must verify room membership, role, phase, controller player ID,
settings, path, word, deadline, and rate limits. The client must never supply an
official score, controller role, board, timer, dictionary verdict, or round
result. A display-bound socket must never submit a player word.

## Generic board dimensions

The retained board preview accepts a dimension and generates its cell count.
Future engine data must likewise store a dimension and validate the tile count
against it. Adjacency must derive rows and columns instead of assuming four
columns or 16 tiles. Supported dimensions remain 4 × 4, 5 × 5, and 6 × 6.

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

Container packaging, static serving, tunnel configuration, and image publishing
are not implemented in Stage 2.
