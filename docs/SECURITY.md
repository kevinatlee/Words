# Security requirements

Stage 2 introduces a real network boundary. This document separates implemented
lobby controls from protections still required before public deployment and
gameplay.

## Implemented authority controls

- The server creates player IDs, room codes, reconnect tokens, room state, and
  host authority.
- Create and join inputs contain no client-selected role, host flag, player ID,
  room ownership, settings, or room state.
- Each connected socket is bound to at most one server-created room session.
- A socket cannot create, join, or reconnect again until it leaves its current
  room.
- The host role is derived from the room’s private `hostPlayerId`.
- Host departure closes the room; Stage 2 never elects or accepts another host.
- Public room state excludes socket IDs, token values, and internal token
  indexes.

Future game state—board, deadline, settings, paths, word decisions, scores, and
results—must follow the same server-authority rule.

## Implemented input and output controls

- All lobby request payloads use shared strict Zod schemas at runtime.
- Unknown fields and malformed values are rejected.
- Socket.IO messages are capped at 16 KiB.
- Room codes use one canonical six-character format. Typed spaces and hyphens
  are removed, and letters are normalized to uppercase.
- Display names normalize whitespace, allow 2–24 characters, and reject Unicode
  control and formatting characters.
- Duplicate display names are rejected within a room without regard to case.
- React renders names as text. Markup-like names are tested to remain plain
  content rather than executable HTML.
- Error responses use a fixed set of public codes and bounded messages.
- Express disables its identifying `X-Powered-By` response header.

Validation is not treated as authorization. The room store still decides
whether a validated action is allowed for the socket and current room.

## Implemented resource and abuse bounds

- Room codes use cryptographic randomness from a 32-character alphabet, giving
  32⁶ possible values.
- Code allocation checks active-room collisions and stops after a bounded
  number of attempts.
- A room accepts at most eight total players, including the host.
- The process accepts at most 500 rooms by default, with a bounded
  configuration range.
- Create, join, and reconnect attempts are limited to 20 per 10 seconds for one
  socket.
- Room lifetime defaults to a sliding two hours.
- Disconnect grace defaults to 60 seconds.
- Cleanup runs every 30 seconds by default and removes rooms, players, token
  mappings, socket references, and expired-code tombstones.
- Environment-provided numeric limits are range-checked and fall back to safe
  defaults when invalid.

These controls reduce accidental exhaustion and simple abuse. They are not a
complete public anti-abuse system.

## Reconnect credential handling

Reconnect tokens contain 32 cryptographically random bytes encoded for URLs.
They are scoped to one room and player and are stored only in the server’s
private index and browser storage. Tokens are not placed in URLs or logged by
application code.

A successful reconnect invalidates the presented token and issues a new one.
A disconnect starts the player’s short grace period; cleanup invalidates the
credential after it ends. If the disconnected player is the host, the room is
deleted when that grace period expires.

If a valid credential is reused while the previous socket still exists, the
new socket supersedes it. The old socket loses its room binding and receives a
structured error. This avoids two active sockets silently sharing one player
authority during a refresh race.

Browser storage is appropriate for this temporary, account-free Stage 2
session, but it is accessible to JavaScript on the same origin. A future
cross-site scripting flaw could expose it, so dependencies, content rendering,
and any future HTML features still require review.

## Origin and transport policy

Socket.IO currently allows the two standard local Vite origins and the
configured public base URL. The Vite server proxies `/api` and `/socket.io` in
development.

Public deployment must provide HTTPS at `https://words.atlee.io`, verify
WebSocket forwarding, and narrow the production origin policy to actual
deployment needs. Reconnect tokens are application credentials and must never
be sent over unencrypted public HTTP.

## Known Stage 2 limits

- Throttling is per socket, not per IP, subnet, device, or room code.
- A client can reconnect to obtain a new socket and a fresh request window.
- Room-not-found and recently expired responses are distinguishable, which may
  help code enumeration.
- There is no reverse-proxy request limit, network firewall policy, or
  production monitoring in this repository.
- Temporary credentials have no account identity, revocation interface, or
  durable audit record.
- The in-memory process is a single availability boundary; restarting it closes
  every room.

Before public deployment, add layered IP-aware limits at a trusted boundary,
review enumeration behavior, verify proxy IP handling, add safe operational
metrics, and test the exact origin and TLS configuration.

## Future gameplay requirements

When gameplay is added, the server must:

- permit only allowlisted grid sizes, durations, and scoring modes
- generate and retain the official board
- validate path bounds, adjacency, tile reuse, and maximum path length
- reconstruct the submitted word from the server board
- evaluate an approved licensed dictionary
- enforce the server deadline and phase
- rate-limit submissions per player and room
- calculate scores and duplicate handling from accepted server data
- authorize settings, round-start, return-to-lobby, and host-transfer actions
- add a regression test for each engine or authorization bug

No gameplay event may trust a client-provided score, time, host role, board,
dictionary result, settings object, or round result.

## Secrets and operations

- Never commit passwords, API tokens, Cloudflare credentials, tunnel tokens,
  private keys, registry tokens, personal server addresses, or real `.env`
  files.
- Supply future secrets through the deployment environment.
- Do not log reconnect tokens or future word/session credentials.
- Keep dependencies updated through reviewable changes.
- Run the future container as a non-root user with only required port and
  filesystem access.
- Record the license and attribution for every dictionary and bundled asset.
