# Development log

Future meaningful work must add a new chronological entry. Record what changed,
why, what remains open, and the exact verification results.

## 2026-07-28 — Stage 3 focused final review corrections

### Findings corrected

- Made weighted selection total for every valid random value in `[0, 1)`, even
  when floating-point multiplication rounds the target to the final cumulative
  boundary.
- Rejected individually positive finite weights that do not advance the
  cumulative total at JavaScript number precision, because such a weight would
  create an unreachable tile interval.
- Documented and tested that an unexpected acceptance-predicate exception is a
  programmer error that propagates unchanged rather than becoming an ordinary
  rejected-board or exhaustion result.
- Expanded adjacency regression coverage to reject both directions of every
  numeric row-wrap boundary on 4 × 4, 5 × 5, and 6 × 6 boards.
- Kept the fixes inside the isolated game-engine package and its documentation.
  No lobby integration, production dictionary data, gameplay networking, QR
  rendering, or Stage 4 work was added.

### Provenance review

- Confirmed official tag `rel-2026.02.25` resolves to pinned commit
  `7e99edab8e32f9f9ea2b15f249ca8d4d67237410`.
- Reproduced the documented size-60 American/Canadian export at 79,370 words
  and 757,056 uncompressed bytes from that exact source.
- Confirmed the applicable ESDB/SCOWL generated-list notice and its separate
  Australian, greater-than-80, and database-result branches.
- Rechecked the original ENABLE 2K archive SHA-256 and public-domain
  declaration. Its word data still matched the pinned mirror byte-for-byte
  after only CRLF-to-LF normalization.
- Left one Low documentation note for Stage 4: record the exact metadata-free
  gzip command when adding the real export, because gzip header metadata changes
  the compressed byte count without changing the word data.

### Verification

- `npm install` — passed; dependencies were already up to date.
- `npm run format:check` — passed; all matched files use Prettier formatting.
- `npm run lint` — passed with no warnings or errors.
- `npm run typecheck` — passed for client, server, game-engine, and shared
  workspaces.
- `npm test` — passed; 249 tests across 14 files:
  - client: 35 tests across 3 files
  - server: 59 tests across 3 files
  - game engine: 135 tests across 5 files
  - shared: 20 tests across 3 files
- `npm run build` — passed; Vite transformed 158 modules, and server and
  game-engine strict TypeScript build boundaries passed.
- `npm audit --audit-level=high` — passed; 0 vulnerabilities.
- `npm run dev` — passed; Vite started on `http://localhost:5173` and the Words
  server started on `http://localhost:6532`, then both ports were released
  after shutdown.

## 2026-07-28 — Stage 3 game-engine foundation

### Work completed

- Turned `packages/game-engine` into the private, zero-runtime-dependency
  `@words/game-engine` TypeScript workspace package.
- Added immutable board validation for generic 4 × 4, 5 × 5, and 6 × 6 boards,
  with row-major coordinate helpers and one-to-four-letter uppercase ASCII tile
  tokens such as `QU`.
- Added injected-random weighted board generation. Distribution tokens
  normalize once, normalized duplicates and invalid/non-finite weights fail
  explicitly, every random value must be finite in `[0, 1)`, and optional
  quality rejection uses an iterative 1-to-1,000 attempt bound.
- Added linear path validation for horizontal, vertical, and diagonal
  adjacency, with candidate-safe errors for empty paths, bad indexes, bounds,
  reuse, row wrapping, jumps, and oversized paths.
- Added ASCII-only word normalization, configurable minimum length, exact
  path-word matching, and an injected synchronous dictionary interface.
- Added a Set-backed dictionary constructor that normalizes and deduplicates
  owned input without filesystem or network access.
- Kept the package disconnected from the client, lobby server, room store, and
  Socket.IO. No gameplay phase, submission, timer, score, duplicate handling,
  live board, QR implementation, deployment work, or persistence was added.

### Dictionary evaluation

- Evaluated official ESDB/SCOWL release `rel-2026.02.25` at full commit
  `7e99edab8e32f9f9ea2b15f249ca8d4d67237410`, including primary-source licence,
  dialect, size, variant, part-of-speech, inflection, category, deaccenting, and
  moderation metadata.
- Reproduced candidate size-60 and size-70 American-plus-Canadian exports in a
  temporary checkout. The proposed filters produced 79,370 words / 757,056
  bytes at size 60 and 126,014 words / 1,247,002 bytes at size 70.
- Downloaded the original archived ENABLE 2K ZIP, verified its public-domain
  declaration, and proved its 173,528-word `WORD.LST` matches the
  provenance-preserving mirror after CRLF normalization.
- Recommended the pinned ESDB size-60 export for Stage 4 because it has direct
  Canadian/American controls, a documented commonness threshold, reproducible
  exclusions, active maintenance, and compatible redistribution terms.
- Committed no external word data. Stage 4 must reproduce the exact command,
  preserve the full applicable notice, record the output checksum, and perform
  a play-vocabulary audit before bundling it.

### Coverage

- Board tests cover all supported sizes, malformed structures and tokens,
  immutability, `QU`, coordinate round trips, neighbour counts, every movement
  direction, row wrapping, jumps, and reciprocal in-bounds adjacency.
- Generation tests cover every size, deterministic sequences, exact weighted
  boundaries, all invalid random classes, invalid weights and totals,
  normalized duplicates, mutation safety, frozen acceptance inputs, bounded
  exhaustion, later-attempt success, invalid attempt limits, and deterministic
  multi-board loops.
- Path tests cover legal reads, every candidate index failure, reuse,
  non-adjacency, path bounds, `QU`, snapshots, invalid boards, and full-board
  snake paths on all sizes.
- Word and dictionary tests cover trimming/case, ASCII policy, punctuation,
  spaces, apostrophes, hyphens, accents, control/formatting and Unicode
  case-expansion characters, length bounds, validation order, exact match,
  minimum length, membership, malformed dictionary entries, deduplication, and
  caller input protection.

### Verification

- `npm install` — passed; workspace lock entry added, no engine runtime
  dependency.
- `npm run format:check` — passed; all matched files use Prettier formatting.
- `npm run lint` — passed with no warnings or errors.
- `npm run typecheck` — passed for client, server, game-engine, and shared
  workspaces.
- `npm test` — passed; 244 tests across 14 files:
  - client: 35 tests across 3 files
  - server: 59 tests across 3 files
  - game engine: 130 tests across 5 files
  - shared: 20 tests across 3 files
- `npm run build` — passed; Vite transformed 158 modules, and server and
  game-engine strict TypeScript build boundaries passed.
- `npm audit --audit-level=high` — passed; 0 vulnerabilities.
- `npm run dev` — passed; Vite started on `http://localhost:5173` and the Words
  server started on `http://localhost:6532`, then both processes stopped
  cleanly.
- Manual engine invocation — passed; printed deterministic 4 × 4, 5 × 5, and
  6 × 6 boards, accepted `CAT` and `QUIZ`, and rejected tile reuse,
  non-adjacent movement, and a path-word mismatch with the expected structured
  codes.

### Remaining Stage 4 boundary

Reproduce and audit the recommended dictionary, choose a documented
non-proprietary letter distribution and board-quality policy, define strict
shared gameplay payloads, and integrate server-owned boards, deadlines,
submissions, scoring, duplicate handling, results, and round-aware reconnect
behavior. The display must remain passive and unable to submit words.

## 2026-07-28 — Stage 2.5 automatic display entry and room isolation

### Critical product-flow finding

The Stage 2.5 client still treated `/` as a role-selection page and required a
person at the shared screen to open `/display` and press a creation button. That
contradicted the passive-display model and made the normal TV flow depend on
unnecessary display interaction.

### Work completed

- Made `/` the canonical display route. It reconnects the browser profile’s
  valid display credential first and otherwise creates exactly one temporary
  room automatically.
- Added a token-free profile-local display pointer. Stale or expired display
  state clears only the matching role credential before one replacement room is
  created; genuine server failures show a manual retry.
- Guarded root startup against Strict Mode effect repetition and stale-socket
  replacement loops.
- Changed `/display` and `/host` into compatibility aliases for `/`.
- Added `/join/:roomCode` with a normalized, locked room code while retaining
  `/join` as the manual-code fallback.
- Added a shared join-URL helper that uses the current origin locally and
  produces `https://words.atlee.io/join/<CODE>` at the configured public origin.
- Kept the display passive by removing creation, role-selection, leave, and
  local settings interactions. `Start Round` remains disabled.
- Added the exact join URL and a clearly labeled placeholder for a future
  scannable QR image without introducing a production dependency.
- Updated the README, product specification, architecture, security notes, and
  pull-request description.

### Isolation and regression coverage

- root automatic creation and reconnect-first behavior
- invalid credential fallback and genuine-failure retry
- Strict Mode duplicate-effect protection
- `/display` and `/host` compatibility aliases
- room-specific and manual player join routes
- normalized local and production join URLs
- passive display controls and deferred QR area
- profile-local display storage and refresh recovery
- two server-backed display rooms with distinct codes, session IDs, and tokens
- player membership isolation across rooms
- independent display disconnect and reconnect behavior
- existing controller transfer and automatic succession coverage

### Verification

- `npm run format:check` — passed; all matched files use Prettier formatting
- `npm run lint` — passed with no warnings or errors
- `npm run typecheck` — passed for client, server, and shared workspaces
- `npm test` — passed; 114 tests across 9 files:
  - client: 35 tests across 3 files
  - server: 59 tests across 3 files
  - shared: 20 tests across 3 files
- `npm run build` — passed; Vite transformed 158 modules and the server build
  boundary passed strict TypeScript
- `npm audit --audit-level=high` — passed; 0 vulnerabilities
- Manual two-context isolation check — passed using storage-isolated
  `localhost` and `127.0.0.1` browser origins
- Automatic root entry — passed; each context created a room without a
  role-selection or creation control, using distinct codes `73Y62C` and
  `MWDULJ`
- Player isolation — passed; `Silver Owl` appeared only in `73Y62C`, while
  `MWDULJ` remained at zero players
- Refresh isolation — passed; both displays returned to their original room
  code and retained their own player state
- Independent lifecycle — passed; closing and reopening the first display
  restored `73Y62C` without changing the connected `MWDULJ` display
- Succession regression — passed; after a second player joined `73Y62C`, the
  controller explicitly left and `Amber Kite` became Game Host automatically
- Browser console check — passed with no warnings or errors in either display
  or player context

## 2026-07-27 — Stage 2.5 passive-display succession correction

### Critical review finding

The initial Stage 2.5 revision required the shared display to recover Game Host
authority after controller grace expired. That conflated the passive
presentation session with player authority and made controller continuity
depend on someone operating the TV. The revision was not ready to merge.

### Work completed

- Removed the `controller:recover` contract, server handler, client method,
  display controls, errors, and `recovery-required` room state.
- Kept voluntary `controller:transfer` available only to the current connected
  controller and a connected target player in the same room.
- Added deterministic server-owned succession when the controller explicitly
  leaves or expires after grace: connected players sort by `joinedAt`, then
  player ID.
- Used `controllerStatus: none` only when no controller is assigned and no
  player is connected. The next player to join or reconnect becomes controller
  automatically.
- Kept the display passive through controller disconnect, expiry, transfer, and
  succession. Display disconnect and credential expiry do not alter player
  authority.
- Updated shared contracts, the room store, Socket.IO integration, client
  status text, contributor rules, product documentation, architecture, and
  security guidance.

### Security and race decisions

- Reconnect at the exact grace deadline succeeds if processed before cleanup.
  If cleanup wins, it invalidates the expired credential before succession.
- Cleanup computes succession once after removing all expired players, so two
  callbacks cannot create multiple transitions.
- A stale former-controller cleanup cannot overwrite a newer voluntary
  transfer.
- A selected successor that disconnects retains authority during its own grace;
  expiry then applies the same deterministic rule again.
- Display and player credentials remain separate and cannot impersonate the
  other role. Stale socket replacement cannot disconnect the newest valid
  socket.

### Regression coverage

- passive display creation and display exclusion from player capacity
- strict transfer-only network contracts and rejected controller claims
- earliest-join selection with player-ID tie-breaking and disconnected-player
  exclusion
- explicit leave, grace expiry, selected-successor disconnect, and no-connected
  fallback
- reconnect-at-deadline and cleanup-first race ordering
- competing transfer/leave operations, repeat cleanup, and stale cleanup
- role credential misuse, refreshed-socket races, room expiration, and
  disconnect cleanup
- one authoritative succession broadcast per completed explicit-leave and
  grace-expiry transition
- passive display and role-specific player controls in the client

### Verification

- `npm install` — passed; dependencies were already current, 409 packages were
  audited, and 0 vulnerabilities were found
- `npm run dev` — passed; Vite served the client on `5173` and the Words server
  listened on `6532`
- `npm run format:check` — passed; all matched files use Prettier formatting
- `npm run lint` — passed with no warnings or errors
- `npm run typecheck` — passed for client, server, and shared workspaces
- `npm test` — passed; 102 tests across 8 files:
  - client: 27 tests across 3 files
  - server: 58 tests across 3 files
  - shared: 17 tests across 2 files
- `npm run build` — passed; Vite transformed 159 modules and the server build
  boundary passed strict TypeScript
- `npm audit --audit-level=high` — passed; 0 vulnerabilities
- Manual four-tab check — passed with one display and three phone players
- Initial authority — passed; the first player became Game Host and only that
  player had transfer controls
- Reconnect grace — passed; the display showed the Game Host offline with no
  authority control, and a reconnect within grace preserved the Game Host
- Automatic grace succession — passed; after a second disconnect and grace
  expiry, the earliest-joined connected player became Game Host without display
  action
- Explicit-leave succession — passed; when that player left, the third player
  became Game Host automatically
- Display disconnect — passed; the final player stayed Game Host while the
  display showed offline
- Browser console check — passed with no warnings or errors in any of the four
  verification tabs

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
