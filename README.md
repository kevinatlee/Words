# Words

> A self-hosted real-time letter-grid party game.

Words is designed for a shared screen and a room full of phones. A host creates
a temporary room, players join without accounts, and everyone will eventually
search the same letter grid before time runs out.

This repository is at **Stage 2: secure server-backed multiplayer lobby**. The
lobby works locally; gameplay and production deployment do not.

## What works today

- A host can create a temporary room at `/host`.
- Players can join by six-character room code at `/join`.
- The server assigns host authority and never accepts a client-provided host
  flag.
- Connected and disconnected players update in real time.
- A refreshed tab can reconnect the same player during a 60-second grace
  period.
- Rooms and reconnect sessions live only in server memory.
- Rooms accept one to eight total players, including the host.
- `GET /api/health` reports the service and Stage 2 version.
- Shared Zod schemas validate every inbound lobby payload.
- Room lifetime, capacity, cleanup, collision handling, and authorization have
  focused tests.
- The Stage 1 visual identity and local board-setting previews remain.

## What is not implemented

Stage 2 does not implement gameplay, board generation, touch tracing,
dictionaries, word validation, scoring, timers, round starts, host delegation,
QR codes, automatic host election, persistence, Docker, GitHub Actions image
publishing, Unraid installation, or Cloudflare Tunnel configuration.

`Start Round` remains disabled. Settings in the lobby are local interface
previews and are not server actions yet.

## Product principles

- No account, registration, email, profile, tutorial, unlock, advertisement, or
  purchase is required.
- Rooms and identities are temporary. Restarting the server removes them.
- The server owns room membership, host authority, settings, and expiration.
- The browser never supplies an authoritative host role.
- No database, Redis, authentication provider, or paid service is used.
- The visual identity and wording are original. No proprietary dictionary or
  third-party visual asset is bundled.

The intended public URL remains `https://words.atlee.io`. The server’s default
port remains `6532`.

## Prerequisites

Install:

- [Node.js 24 LTS](https://nodejs.org/)
- npm, included with a normal Node.js installation
- Git for branch and pull-request work

Check your installation:

```bash
node --version
npm --version
git --version
```

The Node version should begin with `v24`.

## Install and run locally

From the repository root:

```bash
npm install
npm run dev
```

One command starts both processes:

| Process     | Default address         | Purpose                            |
| ----------- | ----------------------- | ---------------------------------- |
| Vite client | `http://localhost:5173` | React development and live refresh |
| Node server | `http://localhost:6532` | Express health API and Socket.IO   |

Vite proxies `/api` and `/socket.io` to the Node server. A phone on the same
local network can open the Vite address printed by the terminal; no manual
Socket.IO URL is required.

Try the lobby:

1. Open `http://localhost:5173/host`.
2. Enter a temporary display name and create a room.
3. Open `http://localhost:5173/join` in another tab or device.
4. Enter the room code and a different display name.
5. Watch the host’s player list update.

Stop both processes with `Control+C`.

## Routes and API

- `/` — choose host or player
- `/host` — create a temporary room
- `/join` — join by room code
- `/room/:roomCode` — live lobby or reconnect flow
- `/play/demo` — retained static Stage 1 round preview
- `GET http://localhost:6532/api/health` — server health

## Useful commands

Run these from the repository root:

```bash
npm run dev           # Start Vite and the Node lobby server
npm run format        # Format source and documentation
npm run format:check  # Check formatting without changing files
npm run lint          # Check code quality
npm run typecheck     # Check strict TypeScript in every workspace
npm test              # Run shared, server, and client tests once
npm run build         # Build the client and verify the server build boundary
npm audit --audit-level=high
```

## Environment variables

Safe defaults work without a `.env` file. `.env.example` documents optional
overrides:

| Variable                   |                  Default | Purpose                                     |
| -------------------------- | -----------------------: | ------------------------------------------- |
| `PORT`                     |                   `6532` | Node server port                            |
| `PUBLIC_BASE_URL`          | `https://words.atlee.io` | Allowed future public origin                |
| `MAX_PLAYERS`              |                      `8` | Total players per room; cannot exceed eight |
| `MAX_ROOMS`                |                    `500` | In-memory room bound                        |
| `ROOM_TTL_MINUTES`         |                    `120` | Sliding inactive-room lifetime              |
| `RECONNECT_GRACE_SECONDS`  |                     `60` | Disconnected-player grace period            |
| `CLEANUP_INTERVAL_SECONDS` |                     `30` | In-memory cleanup frequency                 |

Do not commit a real `.env` file.

## Room codes, names, and reconnecting

Room codes are generated with cryptographic randomness from
`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. The six-character alphabet excludes
confusing `I`, `O`, `0`, and `1`. Generation is collision-checked against active
rooms. Entered codes are case-insensitive and ignore spaces and hyphens.

Display names are trimmed, collapsed to single spaces, limited to 2–24
characters, and reject control characters. Names must be unique within a room,
ignoring case. HTML-like text remains plain data and React renders it as text.

The server issues a random reconnect token after create, join, and reconnect.
The token is stored in local browser storage under a room-and-player-specific
key, while a per-tab pointer lives in session storage. Refreshing the tab can
restore the same player without creating a duplicate. A successful reconnect
rotates the token. Credentials expire after the disconnect grace period and are
never placed in URLs or server logs.

If the host does not reconnect during the grace period, the room closes. Stage
2 deliberately does not elect another host.

## Real-time contract

Clients request actions with acknowledgements:

- `room:create`
- `room:join`
- `room:reconnect`
- `room:leave`

The server broadcasts:

- `room:state`
- `room:error`
- `player:connected`
- `player:disconnected`

All payloads, state, acknowledgements, and error codes are defined centrally in
`packages/shared/src/lobby.ts`. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the complete Stage 2 flow.

## Repository structure

```text
.
├── apps/
│   ├── client/       # React lobby and retained static round preview
│   └── server/       # Express, Socket.IO, room store, and server tests
├── packages/
│   ├── shared/       # Product config, Zod schemas, event and state contracts
│   └── game-engine/  # Reserved for Stage 3
├── docs/             # Product, architecture, security, and deployment status
├── data/             # Reserved for a future licensed dictionary
├── tests/            # Reserved for future cross-package integration tests
└── unraid/           # Reserved for later deployment packaging
```

## Troubleshooting

### `node` or `npm` is not found

Install Node.js 24 LTS, reopen the terminal, and rerun the version checks.

### The client opens but lobby requests fail

Start from the repository root with `npm run dev`. Confirm both the client and
server processes are running and open the exact Vite URL printed in the
terminal.

### Port 6532 is already in use

Stop the other process or set a different `PORT`. If the port changes, also
update the Vite proxy target for that development session; automatic runtime
proxy discovery is not implemented.

### Reconnect fails after a long disconnect

Reconnect credentials are intentionally temporary. Return to `/join` after the
60-second grace period. If the disconnected player was the host, create a new
room.

## Next stage

The recommended Stage 3 is a framework-independent, thoroughly tested game
engine: generic 4 × 4, 5 × 5, and 6 × 6 board generation and path validation,
plus evaluation and licensing documentation for an English dictionary. It
should not yet add synchronized rounds, scoring, persistence, or production
deployment.

## License

Words source code is available under the [MIT License](LICENSE). Third-party
packages retain their own licenses. No dictionary or third-party visual asset
is bundled in Stage 2.
