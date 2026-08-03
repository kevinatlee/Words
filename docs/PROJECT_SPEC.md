# Project specification

## Product

- **Name:** Words
- **Public description:** “A self-hosted real-time letter-grid party game.”
- **Intended URL:** `<public origin>`
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

Each round is the complete competitive unit. Words supports casual drop-in
play: a person can join without an account, play one round, see that round's
winner, continue into another independent round, or leave without penalty.
Starting another round replaces the previous result rather than extending a
match, series, or campaign.

## Product roles

Words has three related but separate concepts:

- The **display session** is the TV or shared-screen browser. It creates or
  presents a room and shows the QR code, lobby, board, timer, standings, and
  results. It is not a player.
- A **player session** belongs to one participating phone. Players count toward
  room capacity and will eventually submit words.
- The **controller** or **game host** is one player with lobby-control
  authority. This player participates normally. The first joining player
  becomes the initial controller.

Creating the room does not grant the display player membership or controller
authority. The display never selects or approves a controller. Changing the
controller must never change the display session.

## Current scope: Stage 4F and integer scoring complete, phone interface in draft

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

New temporary rooms begin with a 5 × 5 grid and a 120-second round. The
controller may still choose any supported 4 × 4, 5 × 5, or 6 × 6 grid and the
existing allowed durations before starting a round. Phone puzzle bubbles retain
an accessible label without a visible heading; active participants receive a
separate Tap/Trace control bubble and no phone provisional score or accepted
word count. The active TV shows authoritative accepted-word counts only; word
identities and provisional scores remain private. The production UI does not
show a development-stage badge.
Fresh clients default to Trace while an explicit local Tap choice remains
persisted. During `ROUND_ENDED`, phones replace the board and word-entry UI
with their own authoritative final score and the winning score; detailed
results remain on the display. Official grid sizes share their presentation gap
system, and the lobby QR board spells `WORDS` / `ATLEE` / `WANNA` / `SHARE`.
Pre-round demonstrations use fixed, size-keyed presentation boards only; the
5 × 5 fourth row is `NSEVR`, and they never replace server-generated official
boards. The merged lobby QR keeps its same payload and perimeter words on a
single opaque `#f5f1e7` canvas tile with the same quiet zone. Square SVG sizing
and an opaque SVG background reduced but did not eliminate physical Safari
quiet-zone marks, so the nested QR surface and inset shadow were removed with
the canvas replacement. Physical test-channel verification remains required.

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

Stage 4C adds private current-participant word/path validation and length-based
provisional scoring.

Stage 4D automatically reconciles every immutable participant at the deadline,
uses normalized word length as every accepted word's base points, adds +1 to
unique three- or four-letter words and +2 to longer unique words, and publishes one strict
result projection in `ROUND_ENDED`. It adds competition ranks, tied positive
winners, no-winner handling when nobody scored, display/player result
presentation, reconnect-safe results, and the controller-driven next round.
See `SUBMISSIONS.md` and `RESULTS.md`.

Stage 4E introduced the exact existing public join URL as a locally generated
display QR. The current presentation uses one canvas in the lobby demonstration
board and omits QR content during active and ended phases. It adds no server
field, endpoint, event, credential, gameplay state, score, or lifecycle
transition. See `QR_JOINING.md`.

## Current room model

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
- nullable finalized results inside the current round
- a server state version and serialization-time clock snapshot
- controller-configured grid and duration plus `length-plus-unique` scoring mode
- creation, last-activity, and expiration timestamps

Room state lives in one Node.js process. The server bounds active rooms,
players, socket attempts, session maps, and recent-code tombstones. No browser
can submit its own session ID, controller role, room ownership, or room state.

The display never appears in the player array or player count. It cannot use
player reconnect or controller events. Only the player role has the Stage 4C
submission event, and only a current participant can use it.

Only the connected controller can atomically update complete settings in the
lobby or after a round, and only that controller can start a round. The display
and ordinary players render those values read-only. Final results arrive only
through the existing `room:state`; no client can request or supply them.

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
origin. At deployment it therefore uses `<public origin>` plus the normalized
join path. The code is normalized before the link is built. The
display renders that exact string as a display-only QR canvas; neither representation
contains a reconnect credential or private room state.

Each successful reconnect rotates the credential. Tokens are scoped to one
role and room, do not appear in URLs or logs, and become unusable after the
disconnect grace period.

## Game experience boundary

Stage 4B lets the controller choose supported settings and start an
authoritative countdown and round. The display remains the shared presentation
surface. Stages 4C and 4D add player submissions, server-calculated validation,
and final scoring. Stage 4E adds only the supplemental display QR.

Current rules are:

- Board sizes: 4 × 4, 5 × 5, and 6 × 6; default 5 × 5
- Durations: 30, 60, 90, 120, 150, and 180 seconds; default 120 seconds
- Default scoring: length-plus-unique
- Default shared-word handling: every accepted word keeps its length-based
  points; unique 3–4 letter words receive +1, unique 5+ letter words receive
  +2, and shared words receive no bonus
- Default minimum word length: 3 letters
- Adjacency: horizontal, vertical, and diagonal; no tile reuse within a word

## Intentional product non-goals

Words does not accumulate multi-round scores or imply that players have joined
a longer match. Cumulative scoring, session totals, match scores, best-of
series, persistent standings, previous-round score history, streaks, lifetime
statistics, profiles, progression, achievements, rematch voting, ready-up
commitments, penalties for leaving, and requirements to remain are permanent
non-goals unless a future explicitly reviewed product-direction change
reverses this principle.

## Current technical non-goals

Stage 4H does not add QR scanning, camera permissions, native or installable
applications, persistence, accounts, telemetry, public hosting, phone sounds,
external audio files, cumulative scores, or a new game phase.

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

## Production environment

Stage 5A uses one container running one direct Node.js process on a container
host. It serves the built React client, Express routes, Socket.IO, game
engine, and licensed dictionary from port `6532`; the client and real-time
connection share one public origin. The final runtime artifact excludes source,
tests, TypeScript, development dependencies, and dictionary data from the
browser bundle. The container runs as non-root and starts only after the
dictionary verifies. A reverse proxy or tunnel may provide the public HTTPS
origin. See [`DEPLOYMENT.md`](DEPLOYMENT.md) for
reviewed operator steps; no public deployment is created by this repository.

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
8. **Stage 4C — complete:** player-only submissions, server-owned path and
   dictionary validation, private accepted-word recovery, and traditional
   provisional scoring.
9. **Stage 4D — complete:** automatic shared-word reconciliation, final
   per-player scores, deterministic competition ranking, tied/no-winner state,
   public ended-round results, and controller-driven next rounds.
10. **Stage 4E — complete and merged:** display-only local QR joining,
    accessible manual fallbacks, and formal round-local casual play.
11. **Stage 4F — complete and merged:** Tap and Trace word entry while preserving
    keyboard fallbacks and server authority.
12. **Stage 4G — complete:** structured real-party, narrow-phone, display, and
    result-presentation polish, including intentional static demonstration
    boards and personal phone result summaries.
13. **Stage 5A — complete:** one-container Node 24 build, static serving,
    health and graceful shutdown, and generic production/test image channels.
14. **Stage 4H — active candidate:** authoritative count-only TV progress,
    display-only participant tones and winner tune, and rank-based result-card
    positioning pending physical validation.

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
production inputs, Stage 4B completes items 4–6, Stage 4C completes submission
validation, Stage 4D completes items 8–10 for one temporary round, and Stage
4E completes the QR portion of item 2.

## Decisions deferred to later stages

- Whether later play testing justifies a versioned dictionary, distribution,
  or quality-profile revision
- Per-IP production throttling and room-code enumeration responses
- Custom scoring representation
