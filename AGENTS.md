# Instructions for future Codex work

Words is being built for a first-time developer. Prefer direct, readable code
and explain important choices in plain language.

## Before changing anything

1. Read `README.md`.
2. Read the relevant files under `docs/`.
3. Inspect the existing implementation before proposing or making changes.
4. Work on a focused branch and prepare reviewable changes; do not merge
   directly into `main`.
5. Update `docs/DEVELOPMENT_LOG.md` after meaningful work.

## Product and architecture guardrails

- Keep the server authoritative. Never trust client-provided scores, timers,
  controller authority, room ownership, dictionary results, word paths,
  settings, or round results.
- Define network payloads centrally in the shared package and validate future
  network payloads at runtime with Zod.
- Keep lobby payload schemas strict. Never accept a client-provided controller
  flag or ID, player ID, display session ID, reconnect expiry, or room code
  during display creation.
- Keep the shared display and game host separate. The display is never a
  player, never counts toward capacity, never receives player authority, and
  never selects, recovers, or approves a controller.
- Keep display and player reconnect credentials role-specific. Neither
  credential may be accepted as the other role.
- Keep room, player, socket-attempt, and expired-code collections bounded.
- Reconnect tokens must be random, server-issued, short-lived, rotated after a
  successful reconnect, absent from URLs and logs, and treated as secrets.
- Preserve the Stage 2 maximum of eight phone players per room, excluding the
  display.
- Controller state must be explicit: `none` with no connected player and no
  controller ID, or `assigned` with exactly one matching player ID.
- A disconnected controller retains authority during reconnect grace. When the
  controller explicitly leaves or expires, promote the connected remaining
  player with the earliest `joinedAt`, breaking ties by player ID. If none is
  connected, use `none`; the next player to join or reconnect becomes
  controller automatically.
- Normal controller transfer must come from the currently connected
  controller and name an existing connected player in the same room. It changes
  only controller authority, never display identity or player membership.
- Do not close a room solely because the display socket or controller player
  socket disconnects.
- Support 4 × 4, 5 × 5, and 6 × 6 grids generically. Never assume a grid has
  exactly 16 tiles.
- Keep engine paths as row-major tile indexes. Validate every index before tile
  access, reject reuse, and keep candidate validation linear in path length.
- Keep canonical board and word alphabets to ASCII A–Z for the current English
  policy. Preserve complete multi-character tile tokens such as `QU`; tile
  count is not necessarily word-character count.
- Require an injected random source for board generation. Never hide
  `Math.random()` inside engine code, accept non-finite or out-of-range random
  values, or use an unbounded quality-retry loop.
- Do not add a default letter distribution without a documented,
  non-proprietary, reproducible derivation.
- Pin every production dictionary export to an exact source version, command,
  checksum, and licence notice. Keep dictionary validity separate from future
  sensitive-word presentation policy.
- Preserve port `6532` as the default production port.
- Preserve `https://words.atlee.io` as the intended public URL.
- Keep the product name and other shared values centralized where practical.
- Do not add persistence unless a documented requirement justifies it.
- Do not add production dependencies unless they solve a documented
  requirement.
- Do not use proprietary assets or dictionaries. Record licenses and required
  attribution for every bundled dictionary and third-party asset.
- Do not name commercial products in public-facing documentation or metadata.
- Add a regression test for every game-engine bug fix.
- Update documentation whenever architecture or behavior changes.
- Never commit passwords, API tokens, Cloudflare credentials, private keys,
  personal addresses, or any other secrets.

## Required verification

Run these commands from the repository root before requesting review:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Do not suppress errors just to make verification pass.

## Code Review Rules

Review every change for:

- client-trusted state
- authorization mistakes
- display/player role confusion
- improper controller transfer
- unauthorized settings changes
- room-code enumeration
- injection through player names
- malformed Socket.IO payloads
- unbounded message sizes
- denial-of-service risks
- timer synchronization errors
- reconnect race conditions
- abandoned-room memory leaks
- fixed-size grid assumptions
- missing tests
- unnecessary complexity
- accidentally introduced persistence
- copied or improperly licensed assets
