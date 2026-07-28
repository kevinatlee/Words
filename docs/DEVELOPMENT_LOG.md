# Development log

Future meaningful work must add a new chronological entry. Record what changed,
why, what remains open, and the exact verification results.

## 2026-07-27 — Stage 2 server-backed lobby

### Work completed

- Added an Express and Socket.IO server on the preserved default port `6532`.
- Added `GET /api/health` with the shared product name and Stage 2 version.
- Added strict shared Zod contracts for room creation, joining, reconnecting,
  leaving, room snapshots, acknowledgements, and public errors.
- Added a bounded in-memory room store with cryptographic codes, UUID player
  IDs, rotating reconnect credentials, capacity limits, expiry, and cleanup.
- Added per-socket request throttling and a 16 KiB Socket.IO payload limit.
- Replaced the static host route with functional host, join, and live-lobby
  flows while retaining the Stage 1 visual style and board preview.
- Added browser session storage that reconnects the same player after refresh
  without confusing separate tabs on the same origin.
- Added focused shared, server, integration, client, and storage tests.
- Updated product, architecture, security, deployment, game-rule, contributor,
  and setup documentation for the implemented Stage 2 boundary.

### Decisions made

- A room includes the host in its maximum of eight total players.
- The server assigns the first room member as host; no client role claim is
  accepted.
- Explicit host departure closes the room. A disconnected host has the same
  temporary grace period as other players, then cleanup closes the room.
- Stage 2 does not elect a replacement host or implement delegation.
- Room lifetime is a sliding two hours and reconnect grace is 60 seconds by
  default.
- Codes use six characters from an unambiguous 32-character alphabet.
- A successful reconnect rotates its credential.
- Vite proxies real-time and health traffic during development; production
  static serving and container packaging remain deferred.

### Security review

- Incoming lobby objects are strict and runtime-validated.
- Browser input cannot set host identity, membership, settings, or room state.
- Public room snapshots exclude socket IDs and reconnect credentials.
- HTML-like player names remain escaped text.
- Players, rooms, payload size, request frequency, cleanup, and credential
  lifetime are bounded.
- Production still needs trusted-boundary IP-aware throttling, exact proxy and
  origin validation, HTTPS, safe metrics, and deployment hardening.

### Verification

- `npm install` — passed; lockfile was current, 409 packages audited, and 0
  vulnerabilities found
- `npm run dev` — passed; Vite served the client on `5173` and the Words server
  listened on `6532`
- `npm run format:check` — passed; all matched files use Prettier formatting
- `npm run lint` — passed with no warnings or errors
- `npm run typecheck` — passed for client, server, and shared workspaces
- `npm test` — passed; 54 tests across 8 files:
  - client: 15 tests across 3 files
  - server: 28 tests across 3 files
  - shared: 11 tests across 2 files
- `npm run build` — passed; Vite transformed 158 modules and the server build
  boundary passed strict TypeScript
- `npm audit --audit-level=high` — passed; 0 vulnerabilities
- Manual three-tab lobby check — passed with one host and two player tabs
- Real-time join updates — passed; the host list moved from one to three
  participants without a reload
- Disconnect update — passed; closing one player tab marked that player
  offline
- Refresh reconnection — passed; another player refreshed into the same player
  ID without a duplicate entry
- Invalid-room handling — passed with a visible `ROOM_NOT_FOUND` error
- Capacity behavior — passed programmatically at eight total players
- Stage-boundary check — passed; Start Round remained disabled and no gameplay
  event or engine behavior was present
- Responsive check — passed at 390 × 844; document and viewport widths matched
  at 390 pixels with no horizontal overflow
- Browser console check — passed with no warnings or errors in host, player, or
  error-flow tabs
- Updated screenshots — captured under `docs/screenshots/`

During review, linting identified a synchronous route-restoration update inside
a React effect. The reconnect launch was deferred to the external storage
restoration callback, and the complete final check passed. Browser review also
verified actual element bounds at the phone breakpoint before screenshots were
selected for the pull request.

## 2026-07-26 — Stage 1 foundation and static prototype

### Work completed

- Created the npm-workspace repository foundation.
- Added shared product and planned game configuration.
- Built responsive static React routes for role selection, host preview, and
  player preview.
- Added locally interactive grid-size and duration demonstrations.
- Added strict TypeScript, ESLint, Prettier, Vitest, and React Testing Library.
- Added utility, configuration, route, interaction, and accessibility-oriented
  component tests.
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

### Unresolved questions

- Host-disconnect behavior and active-round delegation
- Reconnection grace period
- Open English dictionary selection
- Exact room-code and throttling policy
- Custom scoring representation

### Verification

- `npm install` — passed; 263 packages audited after toolchain updates
- `npm run format:check` — passed; all matched files use Prettier formatting
- `npm run lint` — passed with no warnings or errors
- `npm run typecheck` — passed for `@words/client` and `@words/shared`
- `npm test` — passed; 12 tests across 3 test files
- `npm run build` — passed; Vite built 46 modules
- `npm audit --audit-level=high` — passed; 0 vulnerabilities
- Browser route and layout checks — passed for `/`, `/host`, and `/play/demo`
- Responsive checks — passed at 1440 × 1000 desktop and 390 × 844 portrait;
  no horizontal overflow remained
- Prototype interaction check — passed; choosing 5 × 5 rendered 25 cells using
  5 CSS grid columns

The first test run exposed missing component cleanup between tests. Cleanup was
added to the shared test setup, and the complete final test run passed.
