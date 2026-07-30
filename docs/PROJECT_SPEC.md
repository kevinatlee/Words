# Project specification

## Product

- **Name:** Words
- **Public description:** “A self-hosted real-time letter-grid party game.”
- **Intended URL:** `https://words.atlee.io`
- **Intended production port:** `6532/tcp`

Words is a party game for people gathered around one shared television or
computer. Players use their own phones to find words by connecting adjacent
letters on the same server-generated board.

## Product principles

The primary users are friends and families in the same room. The shortest path
—open, create, join, name, play—should be the easiest path. A visitor does not
need an account, email address, saved profile, tutorial, unlock, purchase, or
external service.

Rooms, identities, and future games are temporary. They do not survive a server
restart and do not need a database in the current architecture. The server is
authoritative for shared state; browser-provided claims are requests, never
trusted facts.

## Product roles

Words has three related but separate concepts:

- The **display session** is the TV or shared-screen browser. It creates or
  presents a room and will eventually show the QR code, lobby, board, timer,
  standings, and results. It is not a player.
- A **player session** belongs to one participating phone. Players count toward
  room capacity and will eventually submit words.
- The **controller** or **game host** is one player with lobby-control
  authority. This player participates normally. The first joining player
  becomes the initial controller.

Creating the room does not grant the display player membership or controller
authority. The display never selects or approves a controller. Changing the
controller must never change the display session.

## Current scope: Stage 4B complete, Stage 4C submissions in review

Stage 2.5 is complete. It extends the secure, server-backed lobby with explicit
game-host delegation and deterministic automatic succession:

- opening `/` reconnects that browser profile’s display or creates one
  temporary room without a display name or button press
- the server generates a six-character room code and display credential
- zero to eight phone players join by code and display name
- the first joining player becomes `controllerPlayerId`
- later players join without controller authority
- the connected controller can transfer authority to another connected player
- if the controller explicitly leaves or reconnect grace expires, the server
  promotes the earliest-joined connected player, breaking ties by player ID
- display and player connection state update in real time
- refreshed tabs can restore the correct role during a 60-second grace period
- display and player credentials cannot impersonate one another
- rooms expire after a sliding two-hour lifetime by default
- display or controller disconnect does not immediately close the room
- an Express health endpoint reports server availability

The client routes are `/`, `/join`, `/join/:roomCode`, `/room/:roomCode`, and
the retained static preview at `/play/demo`. `/display` and `/host` are
compatibility aliases for the automatic root display flow. The Node server
listens on port `6532` by default. During development Vite listens on `5173` and
proxies API and Socket.IO traffic to the Node server.

Stage 3 adds a separate framework-independent `@words/game-engine` package:

- immutable validated 4 × 4, 5 × 5, and 6 × 6 boards
- row-major tile-index paths and coordinate helpers
- uppercase ASCII tile tokens, including short multi-character tokens such as
  `QU`
- caller-supplied weighted distributions and injected deterministic randomness
- bounded board-quality rejection
- horizontal, vertical, and diagonal adjacency with no tile reuse
- ASCII word normalization and exact path-word matching
- an injected synchronous dictionary interface and Set-backed implementation
- a pinned, licence-reviewed Stage 4 dictionary recommendation

The package has no runtime dependencies and is not imported by the lobby,
server, or client. Stage 3 does not add gameplay events or live round state.

Stage 3.1 provides a read-only GitHub Actions workflow that independently repeats
the locked dependency install, formatting, lint, type checking, tests, build,
dependency audit, and repository-cleanliness check. It runs for pull requests
to `main`, pushes to `main`, and manual dispatch. Hosted CI supplements local
review and does not add application or deployment behavior.

Stage 4A adds a private server-oriented `@words/game-data` package with:

- a reproducibly generated 79,370-word ESDB/SCOWL size-60 American/Canadian
  dictionary pinned to one release and commit;
- its manifest, SHA-256, exact applicable notice, offline verification, and
  deterministic vocabulary audit;
- an original per-word capped-occurrence token distribution derived from that
  dictionary, with `QU` carrying Q’s weight and ordinary `U` retained;
- simulated vowel and repeat quality profiles for 4 × 4, 5 × 5, and 6 × 6
  boards;
- a server-only verified loader and pure injected-random default-board wrapper.

Stage 4B connects that package to the server. Controlled startup verifies and
privately retains the production dictionary before listening. The connected
controller can set supported room settings and start an authoritative round.
The server owns the generated board, connected-participant snapshot, start,
deadline, phase, and automatic ending. Every session reconnects to the same
current round.

Stage 4C adds private current-participant word/path validation and traditional
provisional scoring. Cross-player duplicate handling, final results, rankings,
winners, persistence, and deployment remain later work. See `SUBMISSIONS.md`.

## Stage 4B room model

A room contains:

- exactly one display session
- zero to eight player sessions
- `controllerPlayerId: null` before the first join or when succession has no
  connected eligible player
- `controllerStatus: none` in those same no-controller states
- `controllerStatus: assigned` with exactly one controller player ID
- a cryptographically random, collision-checked room code
- separate temporary reconnect credentials for the display and each player
- connection status for the display and players
- an exact `LOBBY`, `ROUND_ACTIVE`, or `ROUND_ENDED` phase
- authoritative settings and at most one current round snapshot
- a server state version and serialization-time clock snapshot
- controller-configured grid and duration plus traditional scoring mode
- creation, last-activity, and expiration timestamps

Room state lives in one Node.js process. The server bounds active rooms,
players, socket attempts, session maps, and recent-code tombstones. No browser
can submit its own session ID, controller role, room ownership, or room state.

The display never appears in the player array or player count. It cannot use
player reconnect or controller events. Only the player role has the Stage 4C
submission event, and only a current participant can use it.

Only the connected controller can atomically update complete settings in the
lobby or after a round, and only that controller can start a round. The display
and ordinary players render those values read-only.

## Disconnect and room-lifetime policy

Transport disconnects mark the applicable role offline and begin the reconnect
grace period. Neither the display socket nor controller player socket is a
single room-lifetime switch.

- A display reconnect restores only the display role.
- A player reconnect restores only that player role.
- An ordinary player is removed when their reconnect grace expires.
- A disconnected controller remains assigned during reconnect grace.
- If controller grace expires, its player record and credential are removed. A
  connected replacement is selected by earliest `joinedAt`, then player ID.
- If no player is connected, controller state becomes `none`; the next player
  to join or reconnect becomes controller automatically.
- Normal transfer is an explicit action by the connected current controller
  naming another connected player.
- Transfer and automatic succession never change the display session.
- A disconnected display whose credential expires remains visible as offline
  while players are present.
- A room is removed when its sliding lifetime expires, or when it has no
  players and its disconnected display credential has expired.

Transfer, leave, reconnect, and cleanup are atomic server-owned transitions.
Simultaneous stale work cannot create two controllers or overwrite a newer
valid assignment.

## Room codes and names

Room codes contain six characters from
`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. This avoids visually confusing characters
and provides 32⁶ possible codes. Typed codes are case-insensitive and ignore
spaces and hyphens.

Display names belong to players only. They are normalized to single spaces,
limited to 2–24 characters, and cannot contain Unicode control or formatting
characters. Names must be unique within a room without regard to case. They
remain plain text; markup-like input is not interpreted as HTML.

## Reconnection policy

The server issues random, server-owned credentials in distinct shapes:

- `displaySessionId` and `displayReconnectToken`
- `playerId` and `playerReconnectToken`

The browser keeps the credential in a role-specific local-storage entry and a
per-tab session pointer in session storage. A token-free, profile-local display
pointer lets `/` discover its own stored display credential. Root startup always
tries that reconnect first; only a missing, expired, or invalid credential
causes exactly one replacement room to be created. Refreshing therefore
reconnects the existing role instead of duplicating rooms, players, or sockets.

The display shows an exact `/join/<CODE>` URL built from the current browser
origin, which naturally becomes `https://words.atlee.io/join/<CODE>` at the
intended public origin. The code is normalized before the link is built.

Each successful reconnect rotates the credential. Tokens are scoped to one
role and room, do not appear in URLs or logs, and become unusable after the
disconnect grace period.

## Game experience boundary

Stage 4B lets the controller choose supported settings and start an
authoritative countdown and round. The display remains the shared presentation
surface. Later stages will let players trace and submit words and receive
server-calculated validation and scoring.

Planned rules remain:

- Board sizes: 4 × 4, 5 × 5, and 6 × 6; default 4 × 4
- Durations: 30, 60, 90, 120, 150, and 180 seconds; default 180 seconds
- Default scoring: Traditional
- Default duplicate handling: a shared word scores zero for everyone who
  submitted it
- Default minimum word length: 3 letters
- Adjacency: horizontal, vertical, and diagonal; no tile reuse within a word

Traditional scoring gives 1 point for 3–4 letters, 2 for 5, 3 for 6, 5 for 7,
and 11 for 8 or more. These scoring rules remain documentation-only through
Stage 4B.

## Non-goals through Stage 4A

Stages through 4A do not include touch tracing, a live board, gameplay network
events, room game state, scoring, duplicate handling, timers, synchronized
rounds, scannable QR images, arbitrary or random controller election,
persistence, deployment automation, production container packaging, image
publishing, server installation, or tunnel configuration.

The product also has no database, Redis, accounts, external authentication,
microservices, paid APIs, analytics, advertisements, payments, unlocks, or
progression.

## Originality and licenses

Words maintains its own visual identity, wording, colors, assets, and
interaction design. Public material must not reference commercial games. No
proprietary dictionary or visual asset is bundled. The Stage 4A dictionary is
a pinned, filtered ESDB derivative with its complete applicable notice. Every
future data revision and third-party asset requires a compatible licence and
recorded attribution.

## Intended production environment

The eventual design remains one container running one Node.js process on a
personal server. That process will serve the built React client, Express
routes, Socket.IO, game engine, and a licensed dictionary. Container and tunnel
details are future deployment work, not a claim about Stage 2.

## Staged roadmap

1. **Stage 1 — complete:** repository foundation, documentation, static
   accessible views, tooling, and tests.
2. **Stage 2 — complete:** Express health endpoint, Socket.IO lobby, separate
   display/player sessions, server-controlled controller authority, shared Zod
   contracts, reconnection, expiration, and authorization tests.
3. **Stage 2.5 — complete:** explicit controller delegation, deterministic
   reconnect-grace succession, role-specific controls, and race coverage.
4. **Stage 3 — complete:** framework-independent board generation, path and
   word validation for 4 × 4, 5 × 5, and 6 × 6 grids, plus a pinned,
   licence-reviewed dictionary recommendation.
5. **Stage 3.1 — complete:** read-only GitHub-hosted locked-install, quality,
   test, build, audit, and repository-cleanliness checks.
6. **Stage 4A — complete:** pinned production dictionary, licence and
   provenance, offline verification, vocabulary audit, original token
   distribution, board-quality profiles, loader, and default-board wrapper.
7. **Stage 4B — complete:** controlled dictionary startup, cryptographic board
   generation, controller-owned settings, authoritative boards, participant
   snapshots, deadlines, automatic ending, and round-aware reconnection.
8. **Stage 4C — in review:** player-only submissions, server-owned path and
   dictionary validation, private accepted-word recovery, and traditional
   provisional scoring. Cross-player duplicate handling and final results
   remain Stage 4D.
9. **Stage 5:** production hardening, one-container build, image publishing,
   server configuration, and tunnel documentation.

Each stage should remain independently reviewable and must not imply that later
stages are ready.

## Minimum viable product

The eventual MVP must allow:

1. A display to create and present a room.
2. Players to join by QR code or room code.
3. The first player to become the game host/controller.
4. The controller to select grid size and duration.
5. The controller to start a round.
6. The display and all players to receive the same board and deadline.
7. Players, but never the display, to trace and submit words.
8. The server to validate words and calculate scores.
9. Results to appear on the display and player screens.
10. The controller to start another round or delegate control to another
    player.

Stage 2.5 completes the room-code and authority portions of items 1–3 and 10.
Stage 3 supplies the isolated engine foundation, Stage 4A supplies verified
production inputs, and Stage 4B completes items 4–6 without beginning
submissions or scoring.

## Decisions deferred to later stages

- Whether later play testing justifies a versioned dictionary, distribution,
  or quality-profile revision
- Per-IP production throttling and room-code enumeration responses
- Custom scoring representation
