# Architecture

This document describes the intended system. Stage 1 only implements the React
client prototype and shared configuration.

## The pieces in plain language

**React browser client:** The screens people see. One layout can adapt to a
large host display or a phone. A browser shows local state, but it is not the
source of truth for a real game.

**Node.js server:** The single trusted application process. It will create and
expire rooms, choose boards, track deadlines and hosts, validate submissions,
and calculate results.

**Express:** A small Node.js web framework. It will eventually serve the built
React files and a health endpoint such as `/health`.

**Socket.IO:** The planned real-time connection between browsers and the
server. It will carry validated events for room and round changes without
requiring page refreshes.

**Shared TypeScript package:** Types, configuration, event payload definitions,
and Zod schemas used by both client and server. Central definitions reduce the
chance that two sides interpret a message differently.

**Game-engine package:** Framework-independent rules. It should not import
React or Socket.IO. Pure functions make adjacency, paths, dictionaries,
duplicates, and scoring easier to test.

## Intended request path

```text
Host or player browser
          |
          v
https://words.atlee.io
          |
          v
Cloudflare Tunnel
          |
          v
Unraid server:6532
          |
          v
One Words container
  +-- Express serves the React application
  +-- Socket.IO handles real-time events
  +-- room manager stores temporary state
  +-- game engine validates paths and scores
  +-- openly licensed dictionary validates words
```

The public URL and production port are centralized in
`packages/shared/src/config.ts`.

## Room state and server authority

Each room will exist as an in-memory server object containing its code,
participants, current host identity, validated settings, current phase, board,
server deadline, accepted submissions, and results. Multiple rooms can share
one Node.js process while remaining independent.

The server is authoritative because browsers are controlled by their users. A
modified browser can send invented messages. Therefore a client may request an
action, but the server must independently check:

- the payload shape and size
- whether the session belongs to the room
- whether that session has the required role
- whether the room is in the correct state
- whether a path is legal and forms the submitted word
- whether the word is in the approved dictionary
- what score and official time apply

The client never supplies an official score, deadline, host role, room
ownership, dictionary verdict, or round result.

## Host authority and secure transfer

Room membership and host authority must be separate server-controlled facts. A
host-transfer request will identify the target player, not claim a new host.
The server will verify that the sender is the current host and that the target
is connected to the same room. Only then will it update the host identity and
broadcast a complete state update.

Unexpected host disconnection and transfer during an active round remain
unresolved. A complex automatic election system is not planned early.

## Generic board dimensions

Board data should store a dimension and a flat or nested collection whose size
is checked against that dimension. Adjacency should calculate rows and columns
from the configured size. Code must not assume 4 columns or 16 tiles, because
4 × 4, 5 × 5, and 6 × 6 are all supported.

## Why no database or Redis yet

Rooms are intentionally temporary. Losing active rooms when the single server
restarts is acceptable for the first version, so a database would add
migrations, backups, credentials, and failure cases without meeting a current
requirement.

Redis helps multiple server processes share state and messages. The initial
deployment uses one Node.js process in one container, so normal in-memory
objects are simpler. If future scale or high availability requires several
processes, that decision can be revisited with evidence.

## Why one container

One container is easier for a first-time developer to build, update, monitor,
and configure on Unraid. It can contain the static browser build, Node.js
server, game engine, and licensed dictionary. There is initially no separate
database, Redis, or reverse proxy.

## Planned real-time events

Likely Socket.IO events include:

- `room:create`, `room:created`, `room:join`, `room:joined`, `room:state`
- `room:settings-update`, `room:host-transfer-request`,
  `room:host-transferred`, `room:return-to-lobby`
- `player:connected`, `player:disconnected`
- `game:start-request`, `game:countdown`, `game:started`, `game:ended`
- `word:submit`, `word:accepted`, `word:rejected`
- `results:ready`

Names are a planning aid, not a frozen protocol. Payloads must be centrally
defined, size-limited, runtime-validated with Zod, and authorized on the server.

## Planned delivery flow

A future GitHub Actions workflow will run formatting, linting, type checking,
tests, and builds. After production packaging exists, reviewed changes can
build one image and publish it to GitHub Container Registry. Unraid will run
that image with host port 6532 mapped to container port 6532. A Cloudflare
Tunnel will provide HTTPS at `https://words.atlee.io` and connect to the Unraid
origin.

None of this deployment flow is implemented in Stage 1.
