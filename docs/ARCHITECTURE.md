# Architecture

This document describes the implemented Stage 2 lobby and the boundaries that
later game stages must preserve.

## Runtime pieces

**React browser client (`apps/client`):** Provides host, join, live-lobby, and
retained static preview screens. It renders server state but is never the source
of truth for room membership or host authority.

**Node.js server (`apps/server`):** Runs Express and Socket.IO in one process.
It owns active rooms, players, host identity, reconnect credentials, expiration,
capacity, and cleanup.

**Shared package (`packages/shared`):** Defines product configuration, strict
Zod schemas, state shapes, structured errors, acknowledgements, and typed
Socket.IO event maps. Both client and server import the same contract.

**Game-engine package (`packages/game-engine`):** Reserved for Stage 3. The
lobby does not generate boards, validate paths, use a dictionary, or score
words.

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

The Vite proxy means the browser connects to its current origin. It does not
need a hard-coded development Socket.IO address.

The Stage 2 production build does not yet serve the React build from Express.
One-container serving and deployment remain Stage 5 work.

## Health endpoint

`GET /api/health` returns a small public JSON response:

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

Client requests use Socket.IO acknowledgements so one request receives one
structured result:

| Event            | Client fields                | Purpose                               |
| ---------------- | ---------------------------- | ------------------------------------- |
| `room:create`    | `displayName`                | Allocate a room and server-owned host |
| `room:join`      | `roomCode`, `displayName`    | Add a player if the room permits it   |
| `room:reconnect` | `roomCode`, `reconnectToken` | Restore one disconnected player       |
| `room:leave`     | no fields                    | Explicitly leave the current room     |

The server emits:

| Event                 | Purpose                                             |
| --------------------- | --------------------------------------------------- |
| `room:state`          | Replace the client’s room snapshot                  |
| `room:error`          | Report an asynchronous room closure or expiry       |
| `player:connected`    | Announce presence before the state snapshot         |
| `player:disconnected` | Announce loss of presence before the state snapshot |

All incoming request objects are strict Zod schemas: unknown fields, invalid
codes, invalid names, and malformed reconnect tokens are rejected. Successful
create, join, and reconnect acknowledgements contain a full room snapshot plus
the player ID and reconnect token. Failures contain a bounded public error code
and message.

## Create and join flow

```text
client request
  -> per-socket request limit
  -> strict shared-schema validation
  -> RoomStore operation
  -> bind socket to server-created player identity
  -> join Socket.IO room
  -> acknowledge state + temporary credentials
  -> broadcast authoritative room state
```

The host is always the player created by `RoomStore.createRoom`. There is no
host flag, role field, player ID, or room-state object in the create or join
input. A socket must leave its current room before it can create, join, or
reconnect to another one.

## In-memory room store

Rooms are keyed by normalized room code. Each internal room holds:

- phase (`LOBBY` only)
- creation, activity, and expiration timestamps
- the host player ID
- a bounded map of players
- read-only default settings

Internal players hold a server-generated UUID, normalized display name,
connection status, join time, current socket ID, reconnect-token reference, and
disconnect deadline. Public state omits socket IDs, reconnect credentials, and
internal indexes.

The store also maps reconnect tokens to one room and player. Room codes,
player IDs, and tokens use Node’s cryptographic random APIs. Active-code
collisions are retried with a fixed upper bound.

## Reconnection flow

1. After create or join, the browser stores credentials under a
   room-and-player key in local storage.
2. The current tab stores only a pointer to that key in session storage.
3. A transport disconnect marks the server player disconnected and starts the
   grace period.
4. A refreshed `/room/:code` route reads the pointer and sends the room code
   and reconnect token.
5. The server checks token scope, room lifetime, player lifetime, and socket
   membership.
6. A successful reconnect marks the same player connected and rotates the
   token.
7. The browser replaces its stored credential and room snapshot.

Rotation prevents a successfully used token from being replayed. The
per-tab pointer lets different tabs maintain different players even though they
share one origin’s local storage.

If a valid credential is presented while its previous socket still exists—for
example, during a fast page refresh—the new socket replaces the old one. The
server clears the old socket’s room binding and tells that tab that the
temporary session resumed elsewhere.

Socket.IO transport reconnection follows the same application-level token flow;
transport recovery by itself does not confer room membership.

## Disconnect, leave, and cleanup

A transport disconnect preserves the player for the configured grace period,
60 seconds by default. Other clients immediately see the player as
disconnected.

An explicit non-host leave removes that player immediately. An explicit host
leave closes the room and tells remaining members why. If the host’s grace
period expires, cleanup closes the room rather than silently transferring
authority. Closing a room also removes every connected socket’s stale server
binding so those browsers can create or join another room without reconnecting
their transport.

Room expiration is a sliding deadline updated by valid activity. Its default is
two hours. A periodic cleanup:

- deletes expired rooms
- deletes a room whose disconnected host exceeded the grace period
- removes disconnected non-host players whose grace period ended
- clears reconnect-token references
- broadcasts updated state or a room-expired error

Room count, player count, cleanup work, reconnect sessions, and remembered
recently expired codes are bounded to avoid unbounded process memory.

## Server-authority boundary

Browsers are controlled by users and can send invented events. Stage 2
therefore trusts only data that it independently validates and maps to a
server-bound socket session.

Future stages must keep the same boundary. A client may request an action, but
the server must verify room membership, role, phase, settings, path, word,
deadline, and rate limits. The client must never supply an official score,
host role, board, timer, dictionary verdict, or round result.

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
initial deployment is one Node.js process, so in-memory state is simpler and
more honest. This decision can be revisited if measured needs change.

## Intended production request path

```text
browser
  -> https://words.atlee.io
  -> Cloudflare Tunnel
  -> Unraid host :6532
  -> one future Words container
       |-- Express serves the built React client
       |-- Socket.IO handles real-time events
       |-- RoomStore holds temporary state
       |-- game engine validates boards and paths
       `-- openly licensed dictionary validates words
```

Container packaging, static serving, tunnel configuration, and image publishing
are not implemented in Stage 2.
