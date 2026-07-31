# Words

> A self-hosted real-time letter-grid party game.

Words is designed for one shared display and a room full of phones. The TV or
shared-screen browser creates and presents a temporary room. Phone players join
without accounts, and the first player becomes the initial game host
(controller).

**Stage 4C is complete. Stage 4D final round results are in draft review.** The
secure lobby, isolated game engine, read-only hosted CI, reproducible
server-only game data, authoritative rounds, and private submissions are
complete. Stage 4D reconciles accepted participant words automatically at the
deadline without adding another phase or network event.

## What works today

- Opening `/` on a TV or shared screen automatically reconnects its existing
  display session or creates one temporary room.
- The display receives a server-generated room code and is never counted as a
  player.
- Zero to eight phone players can join through the room-specific
  `/join/:roomCode` link or enter a six-character code manually at `/join`.
- The first player becomes the server-assigned controller; later players join
  without gaining controller authority.
- The connected game host can explicitly transfer authority to another
  connected player.
- If the game host explicitly leaves or misses reconnect grace, the server
  automatically promotes the earliest-joined connected player, breaking equal
  join-time ties by player ID.
- Display and player presence update in real time.
- The connected controller can atomically choose a supported grid size and
  round duration, then start a server-owned round.
- Every session receives the same immutable board, participant snapshot,
  deadline, and `LOBBY`, `ROUND_ACTIVE`, or `ROUND_ENDED` phase.
- The server loads and verifies the 79,370-word production dictionary before
  listening, then uses cryptographic randomness for bounded board generation.
- A single 250 ms server lifecycle sweep ends due rounds at their exact
  deadline. Disconnects, reconnects, and controller transfers do not pause or
  extend it.
- Browser countdowns use `serverTime` plus a monotonic elapsed clock; only the
  server changes the phase.
- Current participants can tap/click adjacent unused tiles and privately submit
  the derived word and path before the server deadline.
- The server validates against the official board and private dictionary,
  rejects personal duplicates, and calculates traditional provisional points.
- Accepted words recover only for that player and never enter `RoomState` or a
  display broadcast while the round is active.
- At the deadline, the server marks words shared across distinct participants,
  retains traditional base points for every accepted word, adds an exact 25%
  bonus to each unique word, and publishes one immutable result snapshot in the
  existing `ROUND_ENDED` state.
- Final results show deterministic competition ranks, every tied positive
  winner, or no winner when no participant submitted a scoring word.
- Displays and phones receive the same public participant word review only
  after submissions close; accepted timestamps, paths, and private versions
  remain private.
- Display and player tabs use separate, temporary reconnect credentials.
- A display or controller disconnect does not immediately close the room.
- Rooms and credentials live only in bounded server memory.
- `GET /api/health` reports the service version and whether controlled game-data
  startup completed.
- Shared strict Zod schemas validate every inbound lobby payload.
- The Stage 1 visual identity now presents authoritative settings and boards.
- `@words/game-engine` validates immutable 4 × 4, 5 × 5, and 6 × 6 boards
  using row-major tile-index paths.
- The engine performs deterministic injected-random weighted generation,
  bounded board rejection, eight-direction adjacency, tile-reuse checks, `QU`
  token reading, ASCII word normalization, exact word/path matching, and
  injected Set-backed dictionary lookup.
- `@words/game-data` contains the pinned 79,370-word ESDB/SCOWL production
  dictionary, its applicable notice and manifest, an original
  dictionary-derived token distribution, and bounded board-quality profiles.
- The default Q-bearing tile is `QU`; standalone `Q` is absent from the default
  distribution while Q-without-U words remain in the master dictionary.
- The server-only loader verifies the dictionary checksum before constructing
  the engine’s immutable lookup interface. Stage 4C queries it only on the
  server; no entries reach room state or the browser.
- Stage 3.1 provides read-only GitHub-hosted checks for pull requests to `main`,
  pushes to `main`, and manual runs. Hosted CI supplements local review rather
  than replacing it.

## What is not implemented

There is no cumulative score, match series, previous-round history, saved
result, custom shared-word rule, continuous drag tracing, or separate results
phase. Scannable QR codes, persistence, deployment workflow, container
packaging, image publishing, server installation, and tunnel configuration
also remain unimplemented.

## Roles and authority

- The **display session** is the TV or shared-screen browser. It creates and
  presents the room, but it is not a player, has no controller authority, and
  never selects or approves a game host.
- A **player session** belongs to one phone participant and can eventually
  submit words during gameplay.
- The **controller** or **game host** is one player. The first player gets this
  role from the server. While connected, that player may delegate it to another
  connected player.
- Controller authority is stored as `controllerPlayerId`, which must reference
  a player ID while assigned. A client cannot self-assign it.
- `controllerStatus` is `none` only when no player is connected. The next join
  or reconnect becomes game host automatically.

The server owns room membership, roles, settings, boards, participant
snapshots, deadlines, phases, and expiration. No database, Redis instance,
account provider, or paid service is used.

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
Client source changes continue to refresh through Vite. The in-memory Node
server intentionally does not watch its source or workspace dependencies,
because an automatic restart would discard active rooms. After a server source
change, stop `npm run dev` and start it again; an unexpected server crash still
ends the combined command visibly.

Try the lobby:

1. Open `http://localhost:5173/` on the shared-screen browser. The room appears
   automatically without a role-selection or creation step.
2. Open the displayed `/join/:roomCode` link in a phone-sized tab or another
   device. `/join` remains available for manually entering a code.
3. Enter a temporary display name. This first player becomes the controller.
4. Join from another phone tab and watch the shared display update.
5. On the controller phone, choose a supported grid and duration, then start a
   round. Confirm every session shows the same official board and deadline.
6. Submit words from both phones. Confirm each phone sees only its own words
   while the round is active.
7. At the deadline, confirm every role receives the same shared/unique word
   review, base points, exact 25% unique bonuses, final scores, ranks, and
   winner state.
8. After results appear, transfer Game Host authority to the second player;
   the display and completed result remain unchanged.
9. Disconnect the new controller and confirm the room remains visible during
   reconnect grace. After grace expires, confirm the server automatically
   promotes the earliest-joined connected player without display action.
10. As an isolation check, open `/` in a second browser profile. Confirm it gets a
    different code, remains empty when players join the first room, and refreshes
    back into only its own room.

Stop both processes with `Control+C`.

## Routes and API

- `/` — automatically reconnect or create the passive shared display
- `/display` — compatibility alias for `/`
- `/host` — legacy compatibility alias for `/`
- `/join` — join as a phone player by room code
- `/join/:roomCode` — room-specific phone join form with the code prefilled
- `/room/:roomCode` — live player lobby or player reconnect flow
- `/play/demo` — retained static Stage 1 round preview
- `GET http://localhost:6532/api/health` — server health

## Useful commands

Run these from the repository root:

```bash
npm run dev           # Start Vite and the Node lobby server
npm run data:verify   # Verify committed game data without network access
npm run data:dictionary:audit
npm run data:boards:audit
npm run format        # Format source and documentation
npm run format:check  # Check formatting without changing files
npm run lint          # Check code quality
npm run typecheck     # Check strict TypeScript in every workspace
npm test              # Run shared, engine, server, and client tests once
npm run build         # Build the client and verify the server build boundary
npm audit --audit-level=high
```

GitHub runs the same locked-install and verification boundary through
[`CI`](docs/CI.md). Run the local commands before review even when hosted checks
are green.

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
cannot be used to reconnect as the other role. Each browser profile also keeps a
token-free pointer to its active display credential so `/` can reconnect that
display before creating a replacement. Separate browser profiles therefore
create and retain separate rooms.

A disconnect marks that display or player offline and starts a 60-second grace
period. It does not immediately close the room:

- an ordinary player is removed after their grace period;
- an expired display credential does not remove remaining players;
- the controller remains assigned while its reconnect grace is active;
- if controller grace expires while other players remain, the expired player
  and credential are removed and the server promotes the earliest-joined
  connected player, with player ID as the stable tie-breaker;
- if nobody is connected, controller state becomes `none`; the next player to
  join or reconnect becomes controller automatically;
- the display stays passive and cannot select, recover, or approve a controller;
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
- `player:submit-word` — current-round participants submit one bounded
  row-major path and its derived word; the acknowledgement returns only that
  player's private submission state

Controller requests:

- `controller:transfer` — current connected controller to connected player
- `controller:update-settings` — complete strict settings, in lobby or after a
  round
- `controller:start-round` — strict empty payload, in lobby or after a round

The server broadcasts:

- `room:state`
- `room:error`
- `display:connected`
- `display:disconnected`
- `player:connected`
- `player:disconnected`

All lobby payloads, state, acknowledgements, and error codes are defined
centrally in `packages/shared/src/lobby.ts`. See
[`docs/ROUND_LIFECYCLE.md`](docs/ROUND_LIFECYCLE.md) for the Stage 4B contract,
[`docs/SUBMISSIONS.md`](docs/SUBMISSIONS.md) for the Stage 4C private
submission contract, [`docs/RESULTS.md`](docs/RESULTS.md) for Stage 4D
deadline reconciliation and public results,
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the complete system flow,
and [`docs/GAME_DATA.md`](docs/GAME_DATA.md) for Stage 4A provenance and
derivation.

## Repository structure

```text
.
├── apps/
│   ├── client/       # React lobby and retained static round preview
│   └── server/       # Express, Socket.IO, room store, and server tests
├── packages/
│   ├── shared/       # Product config, Zod schemas, event and state contracts
│   ├── game-engine/  # Pure board, generation, path, word, and dictionary rules
│   └── game-data/    # Server-only licensed dictionary and generated defaults
├── docs/             # Product, architecture, security, and deployment status
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

Stage 5 will address production hardening, a one-container build, serving the
built client from Node, production image publishing and configuration, health
and graceful shutdown, Unraid-oriented installation guidance, and
reverse-proxy/tunnel documentation. QR rendering, persistence, continuous
tracing, and additional UX polish remain separately reviewed scope.

## License

Words source code is available under the [MIT License](LICENSE). Third-party
packages retain their own licenses. The generated production dictionary has a
separate preserved permission notice in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and beside the data.
Provenance, filtering, checksum, licence scope, and audits are recorded in
[`docs/GAME_DATA.md`](docs/GAME_DATA.md).
