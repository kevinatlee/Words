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
authority. Changing the controller must never change the display session.

## Current scope: Stage 2.5

Stage 2.5 extends the secure, server-backed lobby with explicit game-host
delegation and recovery:

- a display creates a temporary room without a display name
- the server generates a six-character room code and display credential
- zero to eight phone players join by code and display name
- the first joining player becomes `controllerPlayerId`
- later players join without controller authority
- the connected controller can transfer authority to another connected player
- if controller reconnect grace expires, the authenticated display can assign
  a connected replacement
- display and player connection state update in real time
- refreshed tabs can restore the correct role during a 60-second grace period
- display and player credentials cannot impersonate one another
- rooms expire after a sliding two-hour lifetime by default
- display or controller disconnect does not immediately close the room
- an Express health endpoint reports server availability

The client routes are `/`, `/display`, `/join`, `/room/:roomCode`, and the
retained static preview at `/play/demo`. `/host` remains only as a legacy alias
for `/display`. The Node server listens on port `6532` by default. During
development Vite listens on `5173` and proxies API and Socket.IO traffic to the
Node server.

## Stage 2.5 room model

A room contains:

- exactly one display session
- zero to eight player sessions
- `controllerPlayerId: null` while there are no players
- `controllerStatus: none` with zero players
- `controllerStatus: assigned` with exactly one controller player ID
- `controllerStatus: recovery-required` with remaining players and no
  controller player ID
- a cryptographically random, collision-checked room code
- separate temporary reconnect credentials for the display and each player
- connection status for the display and players
- a `LOBBY` phase
- default grid, duration, and scoring settings for display
- creation, last-activity, and expiration timestamps

Room state lives in one Node.js process. The server bounds active rooms,
players, socket attempts, session maps, and recent-code tombstones. No browser
can submit its own session ID, controller role, room ownership, or room state.

The display never appears in the player array or player count. It cannot use
player reconnect events. Future gameplay must not accept word submissions from
a display-bound socket.

Stage 2.5 settings are read-only server state. The visible settings controls are
local previews; updating settings is intentionally deferred.

## Disconnect and room-lifetime policy

Transport disconnects mark the applicable role offline and begin the reconnect
grace period. Neither the display socket nor controller player socket is a
single room-lifetime switch.

- A display reconnect restores only the display role.
- A player reconnect restores only that player role.
- An ordinary player is removed when their reconnect grace expires.
- A disconnected controller remains assigned during reconnect grace.
- If controller grace expires, its player record and credential are removed. A
  room with remaining players enters `recovery-required`.
- Recovery is an explicit display action naming a connected player. It is
  unavailable while a controller is connected or still within reconnect grace.
- Normal transfer is an explicit action by the connected current controller
  naming another connected player.
- Neither path changes the display session, player membership, or reconnect
  credentials.
- A disconnected display whose credential expires remains visible as offline
  while players are present.
- A room is removed when its sliding lifetime expires, or when it has no
  players and its disconnected display credential has expired.

The server never automatically elects a controller. Transfer and recovery are
atomic server-authorized actions, and simultaneous stale requests cannot create
two controllers.

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
per-tab session pointer in session storage. Refreshing reconnects the existing
role instead of creating another player or changing roles.

Each successful reconnect rotates the credential. Tokens are scoped to one
role and room, do not appear in URLs or logs, and become unusable after the
disconnect grace period.

## Planned game experience

Later stages will let the controller choose supported settings and start a
countdown and round. The display will remain the shared presentation surface.
Players will trace and submit words and receive server-calculated validation
and scoring.

Planned rules remain:

- Board sizes: 4 × 4, 5 × 5, and 6 × 6; default 4 × 4
- Durations: 30, 60, 90, 120, 150, and 180 seconds; default 180 seconds
- Default scoring: Traditional
- Default duplicate handling: a shared word scores zero for everyone who
  submitted it
- Default minimum word length: 3 letters
- Adjacency: horizontal, vertical, and diagonal; no tile reuse within a word

Traditional scoring gives 1 point for 3–4 letters, 2 for 5, 3 for 6, 5 for 7,
and 11 for 8 or more. These rules are documentation only in Stage 2.5.

## Non-goals for Stage 2.5

Stage 2.5 does not include board generation, touch tracing, dictionaries, word
validation, scoring, timers, synchronized rounds, QR codes, automatic
controller election, persistence, production container packaging, image
publishing, server installation, or tunnel configuration.

The product also has no database, Redis, accounts, external authentication,
microservices, paid APIs, analytics, advertisements, payments, unlocks, or
progression.

## Originality and licenses

Words maintains its own visual identity, wording, colors, assets, and
interaction design. Public material must not reference commercial games. No
proprietary dictionary or visual asset is bundled. Every future dictionary and
third-party asset requires a compatible license and recorded attribution.

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
3. **Stage 2.5 — in review:** explicit controller delegation, reconnect-grace
   recovery by the display, role-specific controls, and race coverage.
4. **Stage 3 — recommended:** framework-independent board and path engine for
   4 × 4, 5 × 5, and 6 × 6 grids, plus evaluation of an openly licensed English
   dictionary.
5. **Stage 4:** synchronized rounds, submissions, validation, scoring,
   duplicate handling, results, and round-aware reconnection.
6. **Stage 5:** production hardening, one-container build, automated checks and
   image publishing, server configuration, and tunnel documentation.

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

## Decisions deferred to later stages

- Whether controller transfer should be allowed during future non-lobby phases
- Dictionary choice, license, attribution, and play-quality evaluation
- Server-owned board-generation method and letter distribution
- Per-IP production throttling and room-code enumeration responses
- Custom scoring representation
