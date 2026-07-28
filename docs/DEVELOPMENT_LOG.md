# Development log

Future meaningful work must add a new chronological entry. Record what changed,
why, what remains open, and the exact verification results.

## 2026-07-27 — Stage 2 final lifecycle review

### Medium review finding

A replaced display or player tab cleared its role-specific local-storage entry
without checking which token was stored there. During a refresh race, the
replacement tab could save its rotated token before the stale tab processed
`RECONNECT_FAILED`; the stale tab would then delete the new valid credential.

### Work completed

- Made stale-session cleanup remove a display or player credential only when
  the stored token still matches the stale session’s token.
- Added browser-storage regressions for both display and player refresh races.
- Added an integration regression proving replaced display and player sockets
  cannot mark the newest sockets offline when they later disconnect.
- Strengthened coverage for distinct role IDs, ordinary-player cleanup,
  controller-state validation after grace expiry, and both credential indexes
  on room expiration.
- Updated architecture and security documentation for the token-aware cleanup.

### Verification

- `npm run format:check` — passed; all matched files use Prettier formatting
- `npm run lint` — passed with no warnings or errors
- `npm run typecheck` — passed for client, server, and shared workspaces
- `npm test` — passed; 73 tests across 8 files:
  - client: 22 tests across 3 files
  - server: 37 tests across 3 files
  - shared: 14 tests across 2 files
- `npm run build` — passed; Vite transformed 158 modules and the server build
  boundary passed strict TypeScript
- `npm audit --audit-level=high` — passed; 0 vulnerabilities

## 2026-07-27 — Stage 2 display/controller architecture correction

### Critical review finding

The first PR #5 revision conflated the shared-screen room creator with a player
and game host. It inserted that browser into the player collection, counted it
toward the eight-player limit, and closed the room when that “host” disconnected
past grace or explicitly left.

That was a Critical product-model defect. The shared display and controller
player are separate roles, and neither socket alone owns room lifetime.

### Work completed

- Replaced the conflated room creator with an explicit display session.
- Changed display creation to a strict empty payload; the display has no player
  name and never enters the player map.
- Added distinct display and player Socket.IO events, credential types, server
  indexes, browser-storage keys, and socket-session bindings.
- Added `display` state and `controllerPlayerId` to the public room model.
- Made the first joining phone player the initial controller and kept later
  players ordinary.
- Preserved up to eight phone players in addition to the display.
- Removed room deletion tied to display or controller disconnect.
- Kept controller authority on the same player during disconnect; Stage 2 does
  not automatically elect or delegate.
- Updated the UI to use `/display`, show display presence separately, identify
  the controller as a player, and avoid showing the display as “you” in the
  player list.
- Updated the README, architecture, security, product, game-rule, deployment,
  contributor, server, screenshot, and PR documentation.

### Security and lifecycle decisions

- Display and player tokens are opaque random secrets and are never looked up
  in the other role’s map.
- A successful reconnect rotates only that role’s token.
- The room-state schema requires `controllerPlayerId = null` with no players
  and exactly one matching controller player when players exist.
- Client payloads cannot contain controller flags or IDs.
- A display disconnect marks the display offline without removing players.
- A controller disconnect marks that player offline without closing the room or
  transferring authority.
- After grace, an ordinary player is removed. An offline controller is retained
  if other players remain, but its expired credential is invalidated.
- A room closes on its bounded TTL, or when it has no players and its
  disconnected display credential has expired.

### Regression coverage added

- display creation creates no player
- display is excluded from eight-player capacity
- first player becomes controller by server-generated player ID
- later players do not become controller
- display and controller disconnect preserve the room
- reconnect restores the correct role without duplicate players
- display and player credentials cannot impersonate one another
- strict payloads reject self-assigned controller authority
- client storage and UI preserve role separation

### Verification

- `npm install` — passed; 409 packages audited and 0 vulnerabilities found
- `npm run dev` — passed; Vite served the client on `5173` and the Words server
  listened on `6532`
- `npm run format:check` — passed; all matched files use Prettier formatting
- `npm run lint` — passed with no warnings or errors
- `npm run typecheck` — passed for client, server, and shared workspaces
- `npm test` — passed; 70 tests across 8 files:
  - client: 20 tests across 3 files
  - server: 36 tests across 3 files
  - shared: 14 tests across 2 files
- `npm run build` — passed; Vite transformed 158 modules and the server build
  boundary passed strict TypeScript
- `npm audit --audit-level=high` — passed; 0 vulnerabilities
- Manual multi-tab check — passed with one display and two phone players
- Initial-controller check — passed; the first player became controller and the
  second stayed an ordinary player
- Display-count check — passed; two phone players rendered as `2 / 8`, and the
  display never appeared in the player list
- Role reconnect checks — passed; refreshing the display restored the display
  role and refreshing a player restored the same player without a duplicate
- Controller-disconnect check — passed; the controller became offline while the
  room and second player remained
- Display-disconnect check — passed; the second player remained in the room and
  saw the display as offline
- Invalid-room handling — passed with visible `ROOM_NOT_FOUND`
- Capacity behavior — passed programmatically with eight phone players plus the
  separate display
- Stage-boundary check — passed; `Start Round` remained disabled and no gameplay
  event or engine behavior was added
- Browser console check — passed with no warnings or errors in display, player,
  or error-flow tabs
- Corrected screenshots — captured under `docs/screenshots/`

## 2026-07-27 — Stage 2 server-backed lobby

### Work completed

- Added an Express and Socket.IO server on the preserved default port `6532`.
- Added `GET /api/health` with the shared product name and Stage 2 version.
- Added strict shared Zod contracts for display creation, player joining,
  role-specific reconnecting and leaving, room snapshots, acknowledgements, and
  public errors.
- Added a bounded in-memory room store with cryptographic codes, UUID session
  IDs, rotating reconnect credentials, capacity limits, expiry, and cleanup.
- Added per-socket request throttling and a 16 KiB Socket.IO payload limit.
- Added functional display, join, and live-lobby flows while retaining the
  Stage 1 visual style and board preview.
- Added browser session storage that reconnects the same role after refresh
  without confusing separate tabs on the same origin.
- Added focused shared, server, integration, client, and storage tests.

### Current Stage 2 decisions

- A room has one display and up to eight phone players.
- The first joining player becomes the initial game host/controller.
- The server never accepts a client controller claim.
- Stage 2 does not elect or delegate controller authority.
- Room lifetime is a sliding two hours and reconnect grace is 60 seconds by
  default.
- Codes use six characters from an unambiguous 32-character alphabet.
- Vite proxies real-time and health traffic during development; production
  static serving and container packaging remain deferred.

## 2026-07-26 — Stage 1 foundation and static prototype

### Work completed

- Created the npm-workspace repository foundation.
- Added shared product and planned game configuration.
- Built responsive static React routes for role selection, shared-screen
  preview, and player preview.
- Added locally interactive grid-size and duration demonstrations.
- Added strict TypeScript, ESLint, Prettier, Vitest, and React Testing Library.
- Added utility, configuration, route, interaction, and
  accessibility-oriented component tests.
- Added product, architecture, game rules, deployment, and security docs.
- Preserved the MIT license and documented future package roles.

### Files changed

- Root project configuration, contributor instructions, license, and README
- `apps/client/` React prototype and tests
- `apps/server/README.md`
- `packages/shared/` configuration, utilities, and tests
- `packages/game-engine/README.md`
- `docs/` foundation
- Future-role READMEs under `data/`, `tests/`, `unraid/`, and
  `.github/workflows/`

### Decisions made

- Stage 1 is a frontend-only Vite application; production port 6532 remains
  reserved for the future combined Node.js server.
- Routing uses three simple pathname views without a routing dependency.
- Only local interface-preview state is interactive.
- Board rendering accepts a dimension instead of assuming 16 tiles.
- No production-looking container or publishing files were added before those
  systems exist.
- No third-party visual assets or dictionary are bundled.

### Verification

- `npm install` — passed; 263 packages audited after toolchain updates
- `npm run format:check` — passed
- `npm run lint` — passed
- `npm run typecheck` — passed for `@words/client` and `@words/shared`
- `npm test` — passed; 12 tests across 3 test files
- `npm run build` — passed; Vite built 46 modules
- `npm audit --audit-level=high` — passed; 0 vulnerabilities
- Browser route and layout checks passed for `/`, the shared-screen preview,
  and `/play/demo`.
- Responsive checks passed at desktop and phone sizes without horizontal
  overflow.
