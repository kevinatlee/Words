# Security requirements

Stage 1 contains no functional multiplayer server. Its screens use mock data
and disabled server actions, so none of the controls establish real authority.
The requirements below apply when networking is added.

## Authority and room access

- The server owns room membership, settings, phase, board, deadline, paths,
  dictionary results, scores, results, and host authority.
- A client request may never supply an authoritative score, time, role, room
  ownership, path verdict, setting, or result.
- Host authority should use a separate unpredictable session credential, not
  knowledge of the visible room code.
- For host delegation, the server must authenticate the sender as the current
  host, verify the target belongs to the same room, update state atomically, and
  notify every connected client.
- Settings changes and round starts must be authorized and valid for the room’s
  current state.

## Inputs and payloads

- Define payloads centrally and validate every incoming Socket.IO payload with
  Zod at runtime.
- Reject unknown fields where practical, malformed values, and messages over
  documented size limits.
- Normalize and sanitize nicknames for safe text display. Set a short character
  limit and reject control characters. React escaping is helpful but is not a
  substitute for input rules.
- Validate room codes using one canonical format.
- Reconstruct words from server-owned boards and validated paths rather than
  trusting submitted word text.
- Permit only allowlisted grid sizes, durations, and modes.

## Abuse and denial of service

- Use cryptographically random room codes with enough combinations.
- Rate-limit create and join attempts to reduce room-code guessing and resource
  exhaustion.
- Throttle word submissions per session and bound the path length.
- Bound players per room, rooms per process, nickname length, and event size.
- Expire abandoned lobbies and completed rooms, and clean up timers and socket
  references to prevent memory leaks.
- Avoid responses that make room-code enumeration unnecessarily easy.
- Validate allowed browser origins in production while supporting the intended
  public URL.

## Reconnection

Temporary reconnection tokens should be random, scoped to one room and player,
expire quickly, and be replaceable after use. Reconnection and disconnection
updates must avoid races that duplicate participants or accidentally transfer
authority. Tokens must not be logged or placed in public URLs.

## Secrets and operations

- Never commit passwords, API tokens, Cloudflare credentials, tunnel tokens,
  private keys, registry tokens, personal server addresses, or `.env` files.
- Supply future secrets through the deployment environment.
- Keep dependencies updated through reviewable changes.
- Run the future container as a non-root user with only the required port and
  filesystem access.
- Record the license and attribution for every dictionary and bundled asset.

## Decisions still required

- Exact room-code alphabet, length, and join throttles
- Host-disconnect policy
- Reconnection-token lifetime and rotation
- Production origin allowlist during local and tunnel access
- Per-IP and per-session rate limits
- Audit logging that is useful without retaining personal data
