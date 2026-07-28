# Words

> A self-hosted real-time letter-grid party game.

Words is designed for one shared display and a room full of phones. The TV or
shared-screen browser creates and presents a temporary room. Phone players join
without accounts, and the first player becomes the initial game host
(controller).

This repository is at **Stage 2.5: controller delegation and recovery**. The
secure lobby and its game-host authority controls work locally; gameplay and
production deployment do not.

## What works today

- A TV or shared screen can create a display session at `/display`.
- The display receives a server-generated room code and is never counted as a
  player.
- Zero to eight phone players can join by six-character room code at `/join`.
- The first player becomes the server-assigned controller; later players join
  without gaining controller authority.
- The connected game host can explicitly transfer authority to another
  connected player.
- If the game host misses reconnect grace, the display can explicitly assign a
  connected replacement without becoming a player or controller.
- Display and player presence update in real time.
- Display and player tabs use separate, temporary reconnect credentials.
- A display or controller disconnect does not immediately close the room.
- Rooms and credentials live only in bounded server memory.
- `GET /api/health` reports the service and Stage 2.5 version.
- Shared strict Zod schemas validate every inbound lobby payload.
- The Stage 1 visual identity and local board-setting previews remain.

## What is not implemented

Stage 2.5 does not implement gameplay, board generation, touch tracing,
dictionaries, word validation, scoring, timers, round starts, QR codes,
automatic controller election, persistence, container packaging, image
publishing, server installation, or tunnel configuration.

`Start Round` remains disabled. Settings in the lobby are local interface
previews and are not server actions yet.

## Roles and authority

- The **display session** is the TV or shared-screen browser. It creates and
  presents the room, but it is not a player and has no controller authority.
- A **player session** belongs to one phone participant and can eventually
  submit words during gameplay.
- The **controller** or **game host** is one player. The first player gets this
  role from the server. While connected, that player may delegate it to another
  connected player.
- Controller authority is stored as `controllerPlayerId`, which must reference
  a player ID while assigned. A client cannot self-assign it.
- The **recovery-required** state means players remain but no controller is
  assigned. Only the authenticated display can assign a connected player in
  this state.

The server owns room membership, roles, settings, and expiration. No database,
Redis instance, account provider, or paid service is used.

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

Vite proxies `/api` and `/socket.io` to the Node server.

Try the lobby:

1. Open `http://localhost:5173/display` on the shared-screen tab and create a
   room.
2. Open `http://localhost:5173/join` in a phone-sized tab or another device.
3. Enter the room code and a temporary display name. This first player becomes
   the controller.
4. Join from another phone tab and watch the shared display update.
5. On the controller phone, transfer Game Host authority to the second player.
6. Disconnect the new controller and confirm the room remains visible during
   reconnect grace. After grace expires, the display can assign a connected
   replacement.

Stop both processes with `Control+C`.

## Routes and API

- `/` — choose the shared display or phone-player flow
- `/display` — create a display session and temporary room
- `/host` — legacy alias for `/display`
- `/join` — join as a phone player by room code
- `/room/:roomCode` — live lobby or role-specific reconnect flow
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
| `MAX_PLAYERS`              |                      `8` | Phone players per room; display is excluded |
| `MAX_ROOMS`                |                    `500` | In-memory room bound                        |
| `ROOM_TTL_MINUTES`         |                    `120` | Sliding inactive-room lifetime              |
| `RECONNECT_GRACE_SECONDS`  |                     `60` | Role-specific reconnect grace period        |
| `CLEANUP_INTERVAL_SECONDS` |                     `30` | In-memory cleanup frequency                 |

Do not commit a real `.env` file.

## Room codes, names, and reconnecting

Room codes are generated with cryptographic randomness from
`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. The six-character alphabet excludes
confusing `I`, `O`, `0`, and `1`. Generation is collision-checked against active
rooms. Entered codes are case-insensitive and ignore spaces and hyphens.

Display names belong only to players. They are trimmed, collapsed to single
spaces, limited to 2–24 characters, and reject control characters. Names must
be unique within a room, ignoring case. HTML-like text remains plain data and
React renders it as text.

The server issues different credential shapes for display and player sessions.
Each successful reconnect rotates the applicable token. Credentials are stored
under role-specific local-storage keys, are absent from URLs and logs, and
cannot be used to reconnect as the other role.

A disconnect marks that display or player offline and starts a 60-second grace
period. It does not immediately close the room:

- an ordinary player is removed after their grace period;
- an expired display credential does not remove remaining players;
- the controller remains assigned while its reconnect grace is active;
- if controller grace expires while other players remain, the expired player
  and credential are removed and the room enters `recovery-required`;
- the display may then explicitly assign a connected replacement;
- no disconnect or cleanup path automatically chooses a controller;
- a room closes on its bounded lifetime, or when it has no players and its
  disconnected display credential has expired.

## Real-time contract

Display requests:

- `display:create`
- `display:reconnect`
- `display:leave`

Player requests:

- `player:join`
- `player:reconnect`
- `player:leave`

Controller requests:

- `controller:transfer` — current connected controller to connected player
- `controller:recover` — connected display to connected player, only while
  recovery is required

The server broadcasts:

- `room:state`
- `room:error`
- `display:connected`
- `display:disconnected`
- `player:connected`
- `player:disconnected`

All payloads, state, acknowledgements, and error codes are defined centrally in
`packages/shared/src/lobby.ts`. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the complete Stage 2.5 flow.

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

Start from the repository root with `npm run dev`. Confirm both processes are
running and open the exact Vite URL printed in the terminal.

### Port 6532 is already in use

Stop the other process or set a different `PORT`. If the port changes, also
update the Vite proxy target for that development session.

### Reconnect fails after a long disconnect

Reconnect credentials are intentionally temporary. A phone player can join
again as a new player if room capacity and controller state allow it. A display
whose credential expired cannot impersonate a player, and a player credential
cannot recreate the display.

## Next stage

The recommended Stage 3 is a framework-independent, thoroughly tested game
engine: generic 4 × 4, 5 × 5, and 6 × 6 board generation and path validation,
plus evaluation and licensing documentation for an English dictionary. It
should not yet add synchronized rounds, scoring, persistence, or production
deployment.

## License

Words source code is available under the [MIT License](LICENSE). Third-party
packages retain their own licenses. No dictionary or third-party visual asset
is bundled in Stage 2.5.
