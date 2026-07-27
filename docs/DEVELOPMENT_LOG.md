# Development log

Future meaningful work must add a new chronological entry. Record what changed,
why, what remains open, and the exact verification results.

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
