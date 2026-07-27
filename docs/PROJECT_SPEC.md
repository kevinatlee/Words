# Project specification

## Product

- **Name:** Words
- **Public description:** “A self-hosted real-time letter-grid party game.”
- **Intended URL:** `https://words.atlee.io`
- **Intended production port:** `6532/tcp`

Words is a party game for people gathered around one shared television or
computer. Players use their own phones to find words by connecting adjacent
letters on the same server-generated board.

## Target users and quick-join philosophy

The primary users are friends and families in the same room. The experience
must make the shortest path—open, create, scan, name, join, start—the easiest
path. A visitor must not need an account, sign-in, email address, saved profile,
tutorial, unlock, progression system, or purchase.

Rooms, games, and results are temporary. They do not need to survive the active
server process or the end of the room.

## Planned host experience

The host will:

- create a temporary room and receive a short code
- show a QR link and connected player names
- choose board size, duration, and supported scoring settings
- start a countdown and round
- show the shared board, server-controlled deadline, standings, and results
- start another round or return to the lobby
- delegate host control to a connected player

The server will own host authority. A browser request cannot declare itself
host. On a valid transfer request, the server will verify the current host,
change the role, and broadcast the new room state.

## Planned player experience

A player will join from a phone by room code or QR link, enter a nickname
without an account, see the same grid and deadline, trace and submit words,
receive accepted or rejected feedback, see a personal score and results,
briefly reconnect after connection loss, and receive host controls immediately
after a valid delegation.

## Planned settings and rules

- Board sizes: 4 × 4, 5 × 5, and 6 × 6; default 4 × 4
- Durations: 30, 60, 90, 120, 150, and 180 seconds; default 180 seconds
- Default scoring: Traditional
- Default duplicate handling: a shared word scores zero for every player who
  submitted it
- Default minimum word length: 3 letters
- Adjacency: horizontal, vertical, and diagonal; no tile reuse within a word

Traditional scoring gives 1 point for 3–4 letters, 2 for 5, 3 for 6, 5 for 7,
and 11 for 8 or more. Words shorter than 3 letters are invalid. Alternative
scoring and duplicate modes are future configuration, not Stage 1 behavior.

## Room and authority requirements

The first version should support one active host, one to eight players, and
multiple independent rooms. Room state is temporary and held in server memory.
The grid, allowed settings, timer, validation, scores, results, and host role
are server-authoritative. Temporary reconnection tokens may restore a player
after a brief loss.

Planned room flow:

```text
LOBBY
  ↓
COUNTDOWN
  ↓
PLAYING
  ↓
SCORING
  ↓
RESULTS
  ├── next round
  └── return to lobby
```

Host delegation is required in LOBBY and RESULTS.

## Current scope: Stage 1

Implemented now:

- repository and documentation foundation
- centralized configuration
- responsive static React views at `/`, `/host`, and `/play/demo`
- local preview controls
- strict TypeScript and code-quality tooling
- Stage 1 tests and frontend build

The screens are prototypes. There is no functional multiplayer server.

## Non-goals for Stage 1

No rooms, Socket.IO connectivity, QR generation, synchronization, host
delegation logic, game engine, dictionary, word validation, scoring, Docker
deployment, container publishing, Unraid listing, or Cloudflare configuration
is included.

The initial product also has no database, Redis, accounts, external auth,
microservices, paid APIs, analytics, advertisements, payments, unlocks, or
progression.

## Originality and licenses

Words must maintain its own visual identity, wording, colors, assets, and
interaction design. Public material must not reference commercial games. It
must not use proprietary dictionaries or assets. Every future bundled
dictionary and third-party asset requires a compatible license recorded with
any required attribution.

## Intended production environment

GitHub will store source and run future checks and container builds. GitHub
Container Registry will hold one container image. One Unraid application
container will expose port 6532, and a Cloudflare Tunnel will route public HTTPS
traffic from `https://words.atlee.io` to it. No separate database, Redis
instance, or reverse-proxy container is initially planned.

## Staged roadmap

1. **Stage 1 — complete:** foundation, docs, static accessible views, tooling,
   and tests.
2. **Stage 2 — recommended:** Express health endpoint, Socket.IO lobby,
   server-controlled temporary rooms and host authority, shared Zod payloads,
   expiration, and authorization tests.
3. **Stage 3:** framework-independent board/path engine and an evaluated,
   openly licensed English dictionary.
4. **Stage 4:** synchronized rounds, submissions, validation, scoring,
   duplicate handling, results, and reconnection.
5. **Stage 5:** production hardening, one-container build, automated checks and
   image publishing, Unraid configuration, and Cloudflare Tunnel documentation.

Each stage should remain reviewable and must not assume later stages are ready.

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

## Unresolved decisions

- What should happen when the host disconnects unexpectedly?
- Should delegation be allowed during COUNTDOWN, PLAYING, or SCORING?
- How long is the reconnection grace period?
- Which openly licensed English dictionary best fits play quality and
  attribution requirements?
- What exact limits and anti-enumeration behavior should room codes use?
- How should custom scoring be represented without making the first version
  hard to understand?
