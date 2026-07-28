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
  host authority, room ownership, dictionary results, word paths, settings, or
  round results.
- Define network payloads centrally in the shared package and validate future
  network payloads at runtime with Zod.
- Keep lobby payload schemas strict. Never accept a client-provided host flag,
  player ID, reconnect expiry, or room code during room creation.
- Keep room, player, socket-attempt, and expired-code collections bounded.
- Reconnect tokens must be random, server-issued, short-lived, rotated after a
  successful reconnect, absent from URLs and logs, and treated as secrets.
- Preserve the Stage 2 maximum of eight total players per room.
- Do not add automatic host election. A disconnected host retains authority
  only during the documented reconnect grace period.
- Support 4 × 4, 5 × 5, and 6 × 6 grids generically. Never assume a grid has
  exactly 16 tiles.
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
- improper host transfer
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
