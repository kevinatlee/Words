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

## Current scope: Stage 2

Stage 2 provides a secure, server-backed lobby slice:

- a host enters a display name and creates a temporary room
- the server generates a six-character room code and assigns the host
- up to seven more people join by code and display name
- connected and temporarily disconnected participants update in real time
- a refreshed browser tab can restore its player during a 60-second grace
  period
- rooms expire after a sliding two-hour lifetime by default
- a host who explicitly leaves closes the room immediately
- a host who remains disconnected past the grace period closes the room
- an Express health endpoint reports server availability

The client routes are `/`, `/host`, `/join`, `/room/:roomCode`, and the retained
static preview at `/play/demo`. The Node server listens on port `6532` by
default. During development Vite listens on `5173` and proxies API and
Socket.IO traffic to the Node server.

## Stage 2 room model

A room contains:

- one server-assigned host
- one to eight total players, including the host
- a cryptographically random, collision-checked room code
- temporary reconnect credentials for each player
- connection status for each player
- a `LOBBY` phase
- default grid, duration, and scoring settings for display
- creation, last-activity, and expiration timestamps

Room state lives in one Node.js process. The server bounds the total active
rooms, validates all lobby payloads, and periodically removes expired rooms and
players. No browser can submit its own player ID, host role, room ownership, or
room state.

Stage 2 settings are read-only server state. The visible settings controls are
still local interface previews; updating settings is intentionally deferred.

## Room codes and names

Room codes contain six characters from
`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. This avoids visually confusing characters
and provides 32⁶ possible codes. Typed codes are case-insensitive and ignore
spaces and hyphens.

Display names are normalized to single spaces, limited to 2–24 characters, and
cannot contain Unicode control or formatting characters. Names must be unique
within a room without regard to case. They remain plain text; markup-like input
is not interpreted as HTML.

## Reconnection policy

The server returns a random reconnect token when a room is created or joined.
The browser keeps the credential in local storage and a per-tab session pointer
in session storage. Refreshing the same tab reconnects the existing player
instead of creating a duplicate.

Each successful reconnect rotates the credential. Tokens are scoped to one
player and room, do not appear in the URL, and become unusable after the
disconnect grace period. Stage 2 does not automatically elect a new host.

## Planned game experience

Later stages will let the host choose supported settings, start a countdown and
round, show a shared server-generated board and deadline, display results, and
start another round. Players will trace and submit words and receive
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
and 11 for 8 or more. These rules are documentation only in Stage 2.

## Non-goals for Stage 2

Stage 2 does not include board generation, touch tracing, dictionaries, word
validation, scoring, timers, synchronized rounds, host delegation, QR codes,
automatic host election, persistence, production container packaging, image
publishing, Unraid configuration, or Cloudflare Tunnel configuration.

The product also has no database, Redis, accounts, external authentication,
microservices, paid APIs, analytics, advertisements, payments, unlocks, or
progression.

## Originality and licenses

Words maintains its own visual identity, wording, colors, assets, and
interaction design. Public material must not reference commercial games. No
proprietary dictionary or visual asset is bundled. Every future dictionary and
third-party asset requires a compatible license and recorded attribution.

## Intended production environment

The eventual design remains one container running one Node.js process on an
Unraid server. That process will serve the built React client, Express routes,
Socket.IO, the game engine, and a licensed dictionary. GitHub Container
Registry will hold the image, and a Cloudflare Tunnel will route public HTTPS
traffic from `https://words.atlee.io` to port `6532`.

This production path is a target, not a claim about the Stage 2 build.

## Staged roadmap

1. **Stage 1 — complete:** repository foundation, documentation, static
   accessible views, tooling, and tests.
2. **Stage 2 — complete:** Express health endpoint, Socket.IO lobby,
   server-controlled temporary rooms and host authority, shared Zod contracts,
   reconnection, expiration, and authorization tests.
3. **Stage 3 — recommended:** framework-independent board and path engine for
   4 × 4, 5 × 5, and 6 × 6 grids, plus evaluation of an openly licensed English
   dictionary.
4. **Stage 4:** synchronized rounds, submissions, validation, scoring,
   duplicate handling, results, host delegation, and round-aware reconnection.
5. **Stage 5:** production hardening, one-container build, automated checks and
   image publishing, Unraid configuration, and Cloudflare Tunnel documentation.

Each stage should remain independently reviewable and must not imply that later
stages are ready.

## Minimum viable product

The eventual MVP must allow:

1. A host to create a room.
2. Players to join by QR code or room code.
3. The host to select grid size and duration.
4. The host to start a round.
5. All players to receive the same board and deadline.
6. Players to trace and submit words.
7. The server to validate words and calculate scores.
8. Results to appear on host and player screens.
9. The host to start another round.
10. The host to delegate host control to another connected player.

Stage 2 completes the room-code portion of items 1 and 2.

## Decisions deferred to later stages

- Host delegation policy, including which game phases allow it
- Round behavior when the host disconnects
- Dictionary choice, license, attribution, and play-quality evaluation
- Server-owned board-generation method and letter distribution
- Per-IP production throttling and room-code enumeration responses
- Custom scoring representation
