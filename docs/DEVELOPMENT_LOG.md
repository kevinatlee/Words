# Development log

## 2026-08-02 — Stage 4H TV feedback and celebration (draft)

- Removed deployment-specific origins, addresses, container names, registry
  examples, user-home paths, and topology details from current public docs.
  Added dependency-free `npm run privacy:check` coverage to normal Quality CI
  and manual test-image validation. No real credential or private key was found;
  removed current-tree values may remain in earlier public history because this
  work does not rewrite history.
- Replaced the source-code public-origin default with a localhost fallback
  derived from the configured server port while preserving explicit
  `PUBLIC_BASE_URL` deployment behavior.
- Added strict ordered `round.acceptedWordCounts` progress. Every immutable
  participant starts at zero; accepted submissions advance one count and room
  version, then broadcast one count-only snapshot. Rejections remain quiet and
  private words, paths, timestamps, provisional scores, and sequence data stay
  absent.
- Added active TV counts with stable right-aligned tabular columns, participant
  identity mapping, disconnected-participant fallback, and a late-joiner waiting
  indicator. Memoized phone grid props prevent count-only snapshots from
  rerendering the LetterGrid.
- Added one lazy display-only Web Audio context, eight deterministic triangle
  tones in immutable participant order, autoplay-safe one-time enablement, and
  replay protection for hydration, reconnect, hidden pages, missed jumps, round
  changes, and cleanup.
- Added a transition-only winner phrase, one-shot winner-card emphasis, and
  flow-safe podium levels from authoritative competition ranks. Ties share a
  level; all-zero rounds stay flat and silent.
- Automated verification covers authority, privacy, count rendering, render
  isolation, audio scheduling/cleanup, ties, repeated rounds, and 1–8 card
  layouts. Physical TV audio, count, podium, and privacy review remains pending
  on the test candidate.

## 2026-08-02 — Lobby QR canvas renderer replacement (draft)

- Replaced the TV lobby QR SVG with `qrcode.react`'s existing canvas renderer
  at a 640px integer source size, an opaque `#f5f1e7` background, black modules,
  error correction M, disabled boost, and the same four-module quiet zone.
- Physical testing established that square SVG sizing did not resolve the
  original artifact, and that an opaque SVG background reduced but did not
  eliminate lower/right quiet-zone marks. The QR now renders directly in its
  one paper-coloured tile; the nested QR surface and QR-only inset shadow are
  removed to eliminate their compositing layers.
- The join payload, central merged placement, `WORDS` / `ATLEE` / `WANNA` /
  `SHARE` perimeter, and all presentation boards remain unchanged. The current
  JSDOM environment mocks the QR canvas and does not expose its pixel buffer,
  so physical validation on `WordsTest` remains required.

## 2026-08-02 — Lobby demonstration board and QR boundary correction (draft)

- Corrected the presentation-only 5 × 5 demonstration board's fourth row to
  `NSEVR`, preserving its `WORDS` / `ATLEE` / `WANNA` / `SHARE` perimeter and
  the unchanged explicit 4 × 4 and 6 × 6 boards. Official round generation is
  unchanged.
- The earlier square-SVG sizing change did not resolve the physical Safari
  artifact. Inspection established that `qrcode.react` emitted a transparent
  background path over the whole fractional-size SVG viewport, leaving its
  bottom/right viewport edge subject to compositing. The QR now supplies the
  established opaque paper `#f5f1e7` background and crisp SVG rendering while
  retaining its quiet zone, payload, merged placement, and error boundary.
- The updated test image still requires repeat physical validation on
  `WordsTest`; no claim of physical artifact elimination is made from automated
  checks alone.

## 2026-08-01 — Explicit test-container release channel (draft)

- Added a separately dispatched, confirmation-protected test-image workflow
  that resolves one repository candidate ref, validates it completely, smokes
  that exact image, and publishes immutable `test-sha-<full-target-sha>` before
  mutable `test` without touching production `latest`.
- Added stale-run cancellation, remote-digest comparison, ephemeral GHCR login
  cleanup, and OCI revision metadata tied to the resolved checked-out target.
- Documented the isolated test container, LAN and later tunnel
  settings, updates, rollback tags, and the fact that active test rooms end on
  a test-container update.
- Preserved gameplay, authority, lifecycle, networking, TV and phone UI, Stage
  4G, and normal production publishing behavior.

## 2026-08-01 — Stage 5A container deployment boundary (draft)

- Added a clean production artifact that combines Vite client assets, a bundled
  direct Node 24 server entry, and the verified server-only dictionary without
  copying source, tests, TypeScript, or runtime development tooling.
- Added one-origin Express static serving with deliberate deep-link fallback,
  immutable hashed assets, non-permanent HTML caching, preserved Socket.IO, and
  graceful direct-process shutdown.
- Added a multi-stage non-root Docker image, direct and container smoke checks,
  and CI sequencing that smoke-tests pull requests read-only while publishing
  only an exact tested SHA image and `latest` after successful `main` checks.
- Added operator guidance for registry access, bridge configuration, reverse
  proxy or tunnel setup, update, exact-SHA rollback, and deployment limitations.
- Preserved Stage 4G, gameplay, scoring, lifecycle, authority, phone, display,
  real-time protocol, and visual behavior. Final private-host and real-device
  deployment review remains outside this draft.

## 2026-08-01 — Active TV puzzle spacing correction (draft)

- Removed the active display Puzzle panel's compressed top and bottom padding
  override so it inherits the ordinary panel inset while retaining the active
  LetterGrid width rule.
- Preserved the active board dimensions, three-column TV layout, timer, footer,
  lobby, phone presentation, and the merged phone-runtime optimizations.
- Added a stylesheet contract guard for the shared panel source, active board
  width, 720p height constraint, phone panel inset, and unchanged display
  presentation rules. The in-app browser was capped at 1280 × 720, so the
  1920 × 1080 result is documented as CSS-derived pending physical TV review.

## 2026-07-31 — Phone runtime optimization (draft)

- Isolated the visible countdown in a small leaf, replaced 250 ms polling with
  deadline-aligned timeouts, and added a separate one-shot phone input gate so
  the puzzle does no per-second countdown rendering while late submissions
  remain locally disabled and server-enforced.
- Paused visual scheduling while hidden and restored immediately from the
  authoritative time anchor without disconnecting Socket.IO.
- Coalesced Trace processing to one animation-frame callback while retaining
  every queued segment, cached tile geometry per gesture, and strengthened
  cancellation, resize, visibility, pointer-capture, and unmount cleanup.
- Skipped only exact duplicate authoritative ACK/broadcast snapshots with an
  explicit comparator; meaningful same-version corrections, later versions,
  reconnect state, and finalized results remain protected.
- Added deterministic work-count, render-isolation, visibility, lifecycle,
  Trace-accuracy, geometry-read, snapshot, and subscription regression tests.
  Full methodology, counts, bundle impact, limitations, and the single final
  phone validation procedure are recorded in `PERFORMANCE.md`.

## 2026-07-31 — Centered TV Highlights timer (draft)

- Changed the active display Room Highlights timer to a balanced three-column
  grid so its integer countdown stays geometrically centered while the Timer
  label remains at the left edge.
- Increased the timer-label hierarchy without changing countdown authority,
  active-board sizing, or phone timer presentation.

## 2026-07-31 — Scoring highlights and TV summary refinement (draft)

- Preserved the previous Last Round highlight through a zero-score
  finalization, while successful scoring rounds continue to replace it and the
  all-time Room Record rule remains unchanged.
- Refined the active display Highlights timer into a full-width, readable
  label/value row and standardized the finished-display heading as
  `Round Results`.

## 2026-07-31 — TV results recap and timer placement (draft)

- Split display result-card word statistics into compact semantic rows and
  order each unique-word preview longest first without changing results data.
- Moved the active display Timer into Room Highlights, leaving the Puzzle
  bubble to the official board.

## 2026-07-31 — TV round timer simplification (draft)

- Restored the active display board to the normal display-panel width and
  placed its compact, authoritative Timer above the board without a timer
  bubble.
- Preserved the shared LetterGrid, lobby QR board, and all phone timer markup.

## 2026-07-31 — Accepted-word tile feedback (draft)

- Added short, client-only accepted tile feedback after the server confirms a
  submitted word, without changing submission authority or payloads.
- Refined the TV footer link and removed the display Room Record round label.

## 2026-07-31 — TV tile sizing and footer simplification (draft)

- Shared the gameplay tile font-size token and gap expression with the lobby
  demonstration board so its perimeter letters match official boards.
- Simplified the green display join link to inherited body weight with an
  underline and accessible focus outline, removing filled hover treatment.

## 2026-07-31 — TV tile and join styling correction (draft)

- Removed the positional green tint so ordinary, official, and demonstration
  letter tiles share one unselected paper tone.
- Restored the display footer join URL as a compact green external link with
  safe wrapping and keyboard focus treatment.
- Matched the embedded QR backing to the letter-tile tone while retaining its
  dark modules, four-module quiet zone, rounded clipping, and fallback.

## 2026-07-31 — TV header and embedded QR physical refinement (draft)

- Split the shared-display header into four equally spaced regions for the
  Words logo, authoritative Game Host, settings summary, and connection state.
- Rounded and clipped the merged lobby QR tile to match ordinary letter tiles
  while preserving its white quiet zone and exact fallback text.
- Kept phone header structure, active boards, server behavior, and lifecycle
  state unchanged.

## 2026-07-31 — Phone information architecture refinement (draft)

- Reduced phone visual density while preserving the authoritative lobby and
  gameplay behavior: the connection status has safe-area-aware spacing, the
  footer is removed, and ordinary player lobbies contain only the puzzle.
- Simplified controller-only Game Settings and Game Host bubbles, added compact
  accessible duration labels, and limited Join Another Room to the currently
  connected controller according to the authoritative room assignment.
- Stacked active phone word submission content vertically and retained all
  existing submission, transfer, reconnect, and display behavior.
- Follow-up physical review removed all in-app room navigation, visible
  controller-panel chrome, and visible settings legends while retaining their
  accessible names; duration choices initially used a 3 × 2 grid.
- Final physical review replaced duration choices with an accessible native
  30–180-second slider, removed former host-header spacing, and reserved
  word-entry feedback space above Submit to prevent puzzle-height movement.
- The approved finishing pass centres the persistent Tap/Trace control in the
  symmetric phone header, keeps the compact `120s` slider readout, and gives
  the no-alternative-host fallback a balanced, dedicated presentation. It does
  not change display behavior, server contracts, scoring, or lifecycle state.

## 2026-07-31 — Integer letter-count scoring (draft)

- Replaced the former tiered and fractional scoring rule with integer
  `length-plus-unique` scoring: accepted words score their normalized length;
  unique three- or four-letter words receive +1 and longer unique words +2.
- Updated authoritative provisional and finalized scores, strict shared result
  contracts, rankings, reconnect-restored private state, and client result
  presentation without changing phases, events, or lifecycle behavior.
- Stage 4F is complete and merged. This scoring-only draft remains pending a
  small physical multiplayer scoring check; Stage 4G and Stage 5 have not
  started.

## 2026-07-31 — Stage 4F Touch and Trace entry (draft)

- Corrected first physical iPhone findings: Trace now resolves travelled pointer
  segments through centre-biased inset tile regions with directional hysteresis,
  and interactive tiles no longer reset their shared typography with a `font`
  shorthand.
- During `ROUND_ACTIVE`, every phone now omits Game Settings and game-host
  delegation controls. Between rounds, those controls remain available only to
  the connected controller; the display and ordinary players never receive
  them.
- Added a local, accessible Touch/Trace selector for active-round player word
  entry. It defaults to Touch and remembers only the browser preference.
- Replaced visible Undo and Clear controls with safe path backtracking: Touch
  and Trace both truncate an existing path when a selected tile is revisited.
- Added Pointer Events Trace input with capture, coordinate hit testing,
  lift-to-submit, cancellation cleanup, and the existing keyboard Submit
  fallback. No server event, room field, phase, or scoring behavior changed.
- Made active-round tile typography share the stronger tile scale used between
  rounds, including `QU` and selected/focused states.
- Recorded the locked post-playtest product decisions in
  `PLAYTEST_DECISIONS.md`; integer scoring, TV results, and information
  architecture work remain future scope.
- Stage 4E is now complete and merged. The historical Stage 4E draft entry
  below remains as an implementation record; its listed physical review checks
  were later completed and accepted by the product owner.

## 2026-07-30 — Stage 4E QR joining (draft)

- Added one display-only `JoinQrCode` component that receives the completed
  public join URL, renders it locally as a conservative black-on-white SVG,
  and keeps the exact link and six-character room code available as accessible
  fallbacks.
- Used prominent lobby and ended-round presentations plus a compact
  active-round presentation. Phone players, join routes, the demo, and error
  views never render the shared-display QR.
- Reused and strengthened the shared `buildJoinUrl()` boundary so the visible
  link and QR payload are identical, retain the current origin and optional
  port, normalize the public code, replace stale paths, and remove URL
  userinfo, queries, and fragments.
- Added `qrcode.react` 4.2.0 as the client workspace's one QR dependency. The
  exact ISC notice is recorded in `THIRD_PARTY_NOTICES.md`; the published
  package has no runtime or optional dependency and performs no remote
  generation.
- Formalized round-local casual play as a product principle. Cumulative scores,
  match or session totals, result history, standings, profiles, progression,
  streaks, commitments, and leaving penalties are intentional non-goals rather
  than unfinished roadmap items.
- Corrected the roadmap to put continuous touch/pointer tracing in Stage 4F,
  focused casual-play release-candidate testing in Stage 4G, and production
  packaging and deployment in Stage 5.
- Added no server route, wire event, room field, fourth phase, scoring or result
  change, participant change, persistence, camera behavior, scanner, or
  continuous tracing.

### Verification

- `npm ci` — passed; 408 packages installed from the committed lockfile.
- `npm run data:verify` — passed for the exact 79,370-word dictionary and
  server-only source boundary.
- `npm run data:dictionary:audit` — passed with deterministic report SHA-256
  `454efff74f68e3b2e3989a567eb03b4949e04955f2c76a99e62ca608a296a7b8`.
- `npm run data:boards:audit` — passed with 10,000 accepted boards per grid
  size, zero generation failures, and deterministic report SHA-256
  `2b55a682eab2207020ae639e7b5b6b771758822f3a20f6fe91187fd4f0eda789`.
- `npm run format:check`, `npm run lint`, and `npm run typecheck` — passed.
- `npm test` — passed; 574 tests across 30 files:
  - client: 88 tests across 6 files
  - server: 189 tests across 6 files
  - game data: 49 tests across 6 files
  - game engine: 171 tests across 7 files
  - shared: 77 tests across 5 files
- `npm run build` — passed; Vite transformed 162 modules and all package builds
  completed. The final client JavaScript is 373.09 kB minified (112.74 kB
  gzip).
- `npm run data:verify -- --client-build` — passed; production game data
  remained absent from the browser bundle.
- `npm audit --audit-level=high` — passed with 0 vulnerabilities.
- LAN browser verification passed through a private LAN-reachable Vite origin:
  the payload contained only the current origin, join path, and public code;
  the prominent/compact/prominent phase presentations appeared; a mid-round
  player waited and was excluded from the completed result; the next round
  included that connected player; display reconnect and controller transfer
  did not change the URL; manual lowercase code entry normalized correctly;
  and an expired code remained a normal rejected player join.
- The shared display and five route/phone tabs reported no browser warnings or
  errors. Observed page assets were local to the LAN development origin, with
  the QR present as one inline SVG and no external image.
- The corrected 1280 × 720 display layout had no horizontal overflow, retained
  a square 281.59 CSS-pixel prominent QR, wrapped the URL safely, and kept
  results reachable. The compact active QR remained square at 153.59 CSS
  pixels and did not overlay the board or timer.
- At the time of this draft record, a physical native-iPhone Camera scan,
  compact-QR scan, true 1920 × 1080 and 3840 × 2160 display runs, and a genuine
  browser 200% zoom run remained outstanding. Subsequent product review
  accepted the documented display limitations before Stage 4E merged.
- `npm run dev` reached clean client and server readiness, then shut down
  without leaving listeners on ports `5173` or `6532`.

## 2026-07-30 — Stage 4D final round results (merged)

- Retained exactly `LOBBY`, `ROUND_ACTIVE`, and `ROUND_ENDED`; ended rounds now
  require one strictly validated public result inside the existing
  `room:state` snapshot. No result event or client finalization action was
  added.
- Added pure bounded engine reconciliation for canonical accepted words across
  distinct player IDs. Every accepted word retains its traditional base
  points, unique words add an exact 25% bonus, and detached output preserves
  participant and word order.
- Added strict public result-word, player-result, and round-result contracts
  with cross-field checks for immutable participant identity, totals,
  deterministic competition ranks, tied positive winners (including an
  all-shared tie), and no winner when nobody submitted a scoring word.
- Made deadline finalization one atomic idempotent room-store transition from
  the immutable participant snapshot and exact private-state map. Departed,
  disconnected, grace-expired, and former-controller participants remain;
  mid-round joiners and same-name replacement identities do not enter the
  result.
- Kept active words private, then published the minimal detached word/score
  projection only after submissions close. Accepted timestamps, paths, private
  sequences and versions, rate-limit state, credentials, and dictionary data
  stay private.
- Added accessible shared-display and phone results with authoritative ranking,
  single/tied/no-winner wording, textual shared/unique treatment, participant
  reviews, a quiet live announcement, and controller-only next-round behavior.
- Expanded engine, schema, room-store, Socket.IO, client race, privacy,
  lifecycle failure, and 2,048-word boundary coverage.
- Final focused review made hostile engine property access return a bounded
  error, rejected negative zero from every public score position, and isolated
  each cleanup broadcast so one impossible room cannot suppress another room's
  committed update.
- Hardened client snapshot ordering so a same-version message cannot replace
  final results; added coverage that unrelated updates retain one unchanged live
  announcement.
- Kept cumulative scoring, previous-round history, custom shared-word rules,
  continuous tracing, QR rendering, persistence, packaging, deployment, and
  all Stage 5 work out of scope.

### Verification

- `npm ci` — passed; 407 packages installed from the committed lockfile.
- `npm run data:verify` — passed for the exact 79,370-word dictionary and all
  pinned checksums, notices, distributions, and client-source boundaries.
- `npm run data:dictionary:audit` — passed with deterministic report SHA-256
  `454efff74f68e3b2e3989a567eb03b4949e04955f2c76a99e62ca608a296a7b8`.
- `npm run data:boards:audit` — passed with 10,000 accepted boards per grid
  size, zero generation failures, and deterministic report SHA-256
  `2b55a682eab2207020ae639e7b5b6b771758822f3a20f6fe91187fd4f0eda789`.
- `npm run format:check`, `npm run lint`, and `npm run typecheck` — passed.
- `npm test` — passed; 553 tests across 29 files:
  - client: 73 tests across 5 files
  - server: 189 tests across 6 files
  - game data: 49 tests across 6 files
  - game engine: 171 tests across 7 files
  - shared: 71 tests across 5 files
- `npm run build` — passed; Vite transformed 160 modules and every package
  build completed.
- `npm run data:verify -- --client-build` — passed; production game data was
  absent from the browser bundle.
- `npm audit --audit-level=high` — passed with 0 vulnerabilities.
- Manual multi-browser smoke — passed with one display and three phone
  sessions. During the active round, Alpha saw only `PAD`, `SPADE`, and a
  provisional base total of 3; Bravo saw only `PAD`, `BEANS`, and the same
  private base total; the display saw no word, score, or uniqueness data.
  Charlie joined mid-round and was correctly marked as waiting. Bravo then
  left without losing the immutable participant result.
- At the deadline, every role received the same authoritative result: shared
  `PAD` kept 1 point with no bonus; unique `SPADE` and `BEANS` each kept 2 base
  points and added an exact 0.5 bonus; Alpha and Bravo therefore tied as
  winners at 3.5. The departed Bravo remained, Charlie was excluded, and no
  private path, timestamp, sequence, or submission version appeared.
- Display and player refreshes restored the same room and role without losing
  private active progress. A post-result controller transfer to Charlie and
  next-round settings changes did not alter the completed result. Round 4 then
  started with Alpha and Charlie, an empty private score, no old result, no
  Bravo, and no cumulative history.
- Browser console review found no warnings or errors. Development shutdown was
  clean and released ports `5173` and `6532`.
- PR #12 was squash-merged as
  `c8bbc33f2b150c9c04c047b0bb2f64091cecb0b2`. Push-to-main CI run
  `30592953408` passed Quality and Dependency audit with all 553 tests and zero
  vulnerabilities.

## 2026-07-30 — Stage 4C final focused review

- Added a separate disconnect-cleared per-socket submission gate so malformed,
  unauthenticated, display, stale, and otherwise rejected events are bounded
  before strict parsing without consuming controller-action capacity.
- Captured one receipt time for deadline acceptance, stable limiting, and
  `acceptedAt`; added exact-boundary and dependency-failure publication tests.
- Required submit success acknowledgements to match the final committed
  private entry and added serialized public/private boundary coverage.
- Preserved native button semantics inside accessible grid cells, bounded the
  local candidate at 64 letters, and made unexpected client failures restore
  submission controls without losing the selected path.
- Expanded limiter validation, lifecycle isolation, immutable-copy, scoring,
  Socket.IO hostile-input, and UI regression coverage. Stage 4D behavior
  remains deferred.

## 2026-07-30 — Stage 4C player-private submissions

- Added the strict `player:submit-word` event and separately versioned private
  state. Public room state, display responses, and broadcasts contain no words
  or personal points.
- Reused `validateWordPath()` with the official board and private production
  dictionary, then applied pure traditional scoring. Paths are discarded.
- Added personal duplicate rejection, a 256-word bound, reconnect recovery,
  atomic schema validation, and a reconnect-stable 10-per-second limiter.
- Added participant-only accessible tile controls, Undo/Clear, private accepted
  words, provisional points, and focused privacy/deadline/race tests.
- Deferred cross-player shared-word policy, final results, rankings,
  persistence, and later Touch/Trace entry work to Stage 4D.

Future meaningful work must add a new chronological entry. Record what changed,
why, what remains open, and the exact verification results.

## 2026-07-30 — Stage 4B final lifecycle review

### Findings and corrections

- Added an explicit single-use server lifecycle so concurrent starts share one
  attempt, stop cancels pending dictionary/listener work, later starts reject
  with a bounded stopped error, and repeated stop remains harmless.
- Required startup to match the pinned production dictionary count, SHA-256,
  release, and source commit, while retaining the full Stage 4A verification in
  its existing loader.
- Validated injected lifecycle intervals and server clocks at runtime. Invalid
  or backward clock readings cannot create malformed or backward-moving room
  timestamps, and lifecycle sweep exceptions are contained for a later retry.
- Validated complete candidate rounds and UUIDs before mutation, rejected a
  duplicate successive round ID, and expanded atomic generator-failure tests.
- Scoped controller acknowledgements to the originating room, role, and session
  ID; equal-version snapshots now reject an older `serverTime`.
- Tightened ended-round state to require `endedAt === deadlineAt`, stopped the
  local countdown interval at zero, made unchanged settings idempotent, and
  removed a false version increment when only a private display credential
  expires.
- Ensured a request that reconciles a due round broadcasts that transition even
  when authorization later rejects the request, and kept connected-socket
  credential rotation from versioning otherwise unchanged public state.

### Scope boundary

- Added no submission, word/path payload, validation gameplay, duplicate-word
  handling, scoring, result, QR rendering, persistence, deployment, or
  repository-setting behavior. Stage 4C was not started.

### Verification

- `npm ci` — passed; 407 packages installed.
- `npm run data:verify` — passed; 79,370 words and all pinned checksums,
  notices, distributions, and the server-only source boundary matched.
- `npm run data:dictionary:audit` — passed; deterministic report SHA-256
  `454efff74f68e3b2e3989a567eb03b4949e04955f2c76a99e62ca608a296a7b8`.
- `npm run data:boards:audit` — passed; 10,000 accepted boards per grid size,
  zero generation failures, and deterministic report SHA-256
  `2b55a682eab2207020ae639e7b5b6b771758822f3a20f6fe91187fd4f0eda789`.
- `npm run format:check`, `npm run lint`, and `npm run typecheck` — passed.
- `npm test` — passed; 403 tests across 23 files:
  - client: 55 tests across 4 files
  - server: 129 tests across 5 files
  - game data: 49 tests across 6 files
  - game engine: 135 tests across 5 files
  - shared: 35 tests across 3 files
- `npm run build` — passed; Vite transformed 159 modules, all TypeScript
  boundaries passed, and the built data loader worked from an unrelated
  directory.
- `npm run data:verify -- --client-build` — passed; production game data was
  absent from the client build.
- `npm audit --audit-level=high` — passed; 0 vulnerabilities.
- Manual multi-browser smoke — passed with one display and three players:
  settings, start, refresh, mid-round join, controller transfer, deadline
  expiry, and the next round all preserved the authoritative round state.
- Development process check — passed; client hot-module replacement retained
  the live room, the intentionally non-watched server stayed stable, shutdown
  was clean, and ports `5173` and `6532` were released.

## 2026-07-29 — Stage 4B authoritative settings and round lifecycle

### Implementation

- Added strict shared `LOBBY`, `ROUND_ACTIVE`, and `ROUND_ENDED` state plus
  authoritative settings, current-round, participant, board, clock-snapshot,
  and state-version contracts.
- Added controller-only complete settings updates and empty-payload round
  starts with existing socket rate limits, strict runtime validation, bounded
  public errors, stale-socket checks, acknowledgements, and broadcasts.
- Connected the server to the Stage 4A loader and default board generator.
  Startup now verifies and privately retains the 79,370-word dictionary before
  listening or permitting room creation.
- Added a server-owned cryptographic 48-bit random source, deterministic
  injectable dependencies, atomic board-generation failure behavior, immutable
  round snapshots, and one unreferenced 250 ms lifecycle sweep.
- Snapshotted only connected players at round start. Mid-round joins,
  disconnects, reconnects, leaves, grace expiry, and controller transfers do
  not rewrite participants or move the deadline.
- Replaced local settings previews with authoritative controller controls,
  rendered the exact official board to every role, added a server-snapshot plus
  monotonic countdown, protected against stale acknowledgements, and added
  waiting/ended/next-round interface states.
- Kept the combined development command stable by running the in-memory server
  without a dependency watcher. Live verification found that dependency-file
  activity could otherwise restart the server and discard temporary rooms;
  client hot reload remains available.
- Kept the display passive and preserved all role-specific credential,
  controller succession, bounded-memory, and room-lifetime behavior.

### Scope boundary

- Added no submission event or schema, word-entry or touch interface,
  dictionary socket lookup, score, duplicate handling, result table, ranking,
  winner, QR image, persistence, database, container, deployment, or repository
  setting.
- Stage 4C remains the earliest point for player-only word/path submissions and
  server dictionary validation.

### Verification

- `npm ci` — passed; installed 407 packages from the committed lockfile.
- `npm run data:verify` — passed for the exact 79,370-word dictionary, complete
  notice, derived distribution, and server-only client-source boundary.
- `npm run data:dictionary:audit` — passed with report SHA-256
  `454efff74f68e3b2e3989a567eb03b4949e04955f2c76a99e62ca608a296a7b8`.
- `npm run data:boards:audit` — passed all 60,000 deterministic board samples
  with zero bounded generation failures and report SHA-256
  `2b55a682eab2207020ae639e7b5b6b771758822f3a20f6fe91187fd4f0eda789`.
- `npm run format:check`, `npm run lint`, and `npm run typecheck` — passed.
- `npm test` — passed; 365 tests across 23 files:
  - client: 49 tests across 4 files
  - server: 97 tests across 5 files
  - game data: 49 tests across 6 files
  - game engine: 135 tests across 5 files
  - shared: 35 tests across 3 files
- `npm run build` — passed; the client built 159 modules and the built
  game-data JavaScript loader verified from an unrelated working directory.
- `npm run data:verify -- --client-build` — passed; production game data
  remained absent from the browser bundle.
- `npm audit --audit-level=high` — passed with 0 vulnerabilities.
- `npm run dev` — passed after the watcher correction. One display and three
  separate phone sessions verified synchronized 5 × 5, 4 × 4, and 6 × 6
  official boards; exact shared round IDs and deadlines; read-only
  non-controller/display settings; refresh reconnection; mid-round waiting and
  next-round inclusion; active-round controller transfer without changing the
  board or deadline; exact round-number progression; automatic ended-state
  broadcasts; and zero-second ended boards. Shutdown released ports 5173 and 6532.
- Hosted CI results will be recorded after the draft pull request runs on the
  final pushed commit.

## 2026-07-28 — Stage 4A final review hardening

### Findings and corrections

- Found no Critical issue in the Stage 4A data, generation, or stage boundary.
- Corrected one High integrity gap by pinning and verifying the complete
  applicable ESDB notice bytes rather than relying on selected fragments.
- Added the deterministic gzip SHA-256 to the manifest and root-of-trust
  constants, and made reproduction validate both compressed size and hash.
- Hardened dictionary reproduction against dirty or symlinked source checkouts
  and fixed its subprocess locale to `C`.
- Made the runtime loader reject symlinks and non-regular files, require an
  exact manifest schema, and compare every production manifest field against
  independent constants.
- Added a real server-targeted JavaScript package build and smoke-loaded its
  dictionary from an unrelated working directory.
- Expanded the browser boundary from the client package alone to every
  transitively reachable workspace, added import lint restrictions, rejected
  symbolic links in source and built output, and added post-build CI
  verification.
- Replaced circular distribution assertions with independent fixed expected
  weights and a separate dictionary recount.
- Preserved structured engine errors for invalid runtime board sizes and random
  values.
- Changed repeat distribution derivation to leave byte-identical outputs
  untouched, preventing synchronized filesystems from creating conflict copies.

### Independent reproduction and statistical review

- Resolved official tag `rel-2026.02.25` and its peeled commit independently to
  `7e99edab8e32f9f9ea2b15f249ca8d4d67237410`.
- Rebuilt from that exact tag in an isolated checkout and reproduced 79,370
  words, 757,056 bytes, dictionary SHA-256
  `f5f3d22bd07b8f8d2dd8cf4f3caff211b6f3249a24da02c5aa2a21bf2210f352`,
  212,238 deterministic gzip bytes, and gzip SHA-256
  `1dccc79270a4c044e78f5b3c9f1cf6184feb40cab706e809ef6e70a2cac0fc39`.
- Independently recounted all 26 capped-at-two letter weights. The total remains
  662,207, Q maps only to `QU`, and ordinary `U` remains 22,662.
- Repeated distribution derivation produced the same candidate, profile, and
  generated TypeScript hashes with no tracked change or conflict copy.
- Repeated the deterministic 60,000-board audit. Its report SHA-256 remains
  `2b55a682eab2207020ae639e7b5b6b771758822f3a20f6fe91187fd4f0eda789`,
  with zero bounded failures in 30,000 accepted-board calls.

### Verification

- `npm ci` — passed; installed 407 packages from the committed lockfile.
- `npm run data:verify` — passed, including exact notice integrity and the
  transitive client-source boundary.
- `npm run data:dictionary:audit` — passed with report SHA-256
  `454efff74f68e3b2e3989a567eb03b4949e04955f2c76a99e62ca608a296a7b8`.
- `npm run data:boards:audit` — passed with the unchanged deterministic report.
- `npm run format:check` — passed.
- `npm run lint` — passed with no warnings or errors.
- `npm run typecheck` — passed for all five workspaces.
- `npm test` — passed; 298 tests across 20 files:
  - client: 35 tests across 3 files
  - server: 59 tests across 3 files
  - game data: 49 tests across 6 files
  - game engine: 135 tests across 5 files
  - shared: 20 tests across 3 files
- `npm run build` — passed; the client built 158 modules and the built
  game-data JavaScript loader loaded all 79,370 words from an unrelated working
  directory.
- `npm run data:verify -- --client-build` — passed; no production game-data
  package identifier, dictionary checksum, representative word sentinel, or
  symbolic link appeared in the client output.
- `npm audit --audit-level=high` — passed; 0 vulnerabilities.
- `npm run dev` — passed; the client and server started, answered local page and
  health requests, and stopped with no remaining listeners.

### Remaining boundary

The dictionary is a word-type corpus rather than a real-world usage-frequency
corpus, and the current quality policy has an eight-attempt bound. Stage 4B must
handle the structured no-board result and add only the separately reviewed,
server-authoritative integration described below. No live gameplay, QR,
deployment, persistence, moderation, or repository-setting behavior was added.

## 2026-07-28 — Stage 4A production game data

### Work completed

- Added the private server-oriented `@words/game-data` workspace without
  connecting it to the client, server startup, lobby, room store, or Socket.IO.
- Independently verified official ESDB/SCOWL release `rel-2026.02.25` and direct
  tag/peeled commit
  `7e99edab8e32f9f9ea2b15f249ca8d4d67237410`.
- Added a pinned-tag-only, depth-one reproduction script with fixed output,
  shell-free subprocess arguments, temporary-directory cleanup, safety
  measurements, mismatch diagnostics, symlink checks, and atomic replacement.
- Reproduced the exact size-60 American/Canadian export: 79,370 uppercase ASCII
  words, 757,056 bytes, SHA-256
  `f5f3d22bd07b8f8d2dd8cf4f3caff211b6f3249a24da02c5aa2a21bf2210f352`.
- Reproduced metadata-free `gzip -9 -n` output at 212,238 bytes and SHA-256
  `1dccc79270a4c044e78f5b3c9f1cf6184feb40cab706e809ef6e70a2cac0fc39`.
- Preserved the complete applicable ESDB copyright, permission, and source
  credit notice beside the data and added repository-level third-party notice
  context.
- Added strict offline verification for the manifest, data bytes and structure,
  notice scope, regenerated distribution artifacts, and client-exclusion
  boundary. Added it as a distinct existing `CI / Quality` step without
  changing workflow or job names.
- Added a deterministic vocabulary audit. Required inclusion and exclusion
  fixtures passed. The risk report found one Q-without-U entry (`QWERTY`), six
  entries above 20 letters, 987 repeated-letter-heavy heuristic matches, nine
  possible acronym-like entries, and four ambiguous common-word watchlist
  entries. Sensitive-term counting remains unimplemented because no reliable,
  compatible, pinned classifier is bundled.
- Evaluated raw character, per-word presence, and per-word cap-of-two frequency
  candidates from the committed dictionary. Selected per-word cap-of-two for
  its 36.701% vowel share, bounded per-word influence, retained repeat evidence,
  and transparent integer rule.
- Mapped Q’s derived weight to `QU`, omitted standalone `Q`, retained ordinary
  `U`, and made no manual weight adjustment. The generated profile has total
  weight 662,207 and SHA-256
  `de7fb14c60d1778fbbe0b9f80cd710a673f486923b581ced46fd61596b5956af`.
- Added simulated quality profiles: vowel range 4–9/max repeat 4 for 4 × 4,
  6–14/5 for 5 × 5, and 9–20/6 for 6 × 6, each with at most eight attempts.
- Added `loadProductionDictionary()` and
  `generateDefaultBoard({ size, random })`. The loader uses stable module
  paths, verifies before constructing the engine dictionary, exposes no Set or
  mutable cache, and returns structured failures. Generation remains pure and
  requires injected randomness.
- Added 34 package tests across four files for integrity, loader failures,
  working-directory independence, immutability, distribution metadata and
  convergence, size-specific quality boundaries, deterministic generation,
  bounded exhaustion, and QU generation.
- Added complete game-data documentation and updated architecture, rules,
  engine, security, CI, product, licence, and roadmap documentation.

### Distribution and board audits

- Candidate simulation — 10,000 raw boards per candidate and size.
- Selected profile board audit — 10,000 raw plus 10,000 accepted boards for
  each of 4 × 4, 5 × 5, and 6 × 6.
- Rejected candidate rates — 19.231%, 17.648%, and 25.278% by ascending size.
- Mean attempts — 1.2381, 1.2143, and 1.3383.
- Bounded generation failures — 0 across 30,000 accepted-board calls.
- Deterministic board-audit report SHA-256 —
  `2b55a682eab2207020ae639e7b5b6b771758822f3a20f6fe91187fd4f0eda789`.
- Distribution derivation repeated with byte-identical candidate JSON, profile
  JSON, and generated TypeScript output.

### Verification

- `npm ci` — passed; installed 407 packages from the committed lockfile.
- `npm run data:dictionary:build` — passed from a fresh temporary checkout of
  only the pinned official tag; exact count, bytes, SHA, and gzip measurement
  reproduced, and the temporary checkout was removed.
- `npm run data:verify` — passed offline; dictionary, notice, distribution, and
  client-exclusion boundaries verified.
- `npm run data:dictionary:audit` — passed; deterministic fixture and risk
  report SHA-256
  `454efff74f68e3b2e3989a567eb03b4949e04955f2c76a99e62ca608a296a7b8`.
- `npm run data:boards:audit` — passed; deterministic 60,000-board primary
  sample plus repeat-run reproducibility check.
- `npm run format:check` — passed; all matched files use Prettier formatting.
- `npm run lint` — passed with no warnings or errors.
- `npm run typecheck` — passed for client, server, game-data, game-engine, and
  shared workspaces.
- `npm test` — passed; 283 tests across 18 files:
  - client: 35 tests across 3 files
  - server: 59 tests across 3 files
  - game data: 34 tests across 4 files
  - game engine: 135 tests across 5 files
  - shared: 20 tests across 3 files
- `npm run build` — passed; Vite transformed 158 modules, and server,
  game-data, and game-engine strict TypeScript build boundaries passed.
- `npm audit --audit-level=high` — passed; 0 vulnerabilities.
- Manual loader invocation — passed with 79,370 words, American and Canadian
  spelling checks, representative exclusions, and no network request.
- Manual deterministic generation — passed for all three sizes and an explicit
  acceptable board containing `QU`.
- Client build exclusion — passed; no game-data import, dictionary checksum, or
  dictionary sentinel appeared in the built client.
- `npm run dev` — passed; Vite and the Words server started, a shared display
  created a room, one phone player joined and became Game Host, the display
  updated to `1 / 8`, `Start Round` remained disabled, both browser contexts
  had no warnings or errors, and both processes stopped cleanly.

### Remaining boundary

Stage 4B must perform the reviewed server integration: one controlled startup
load, an appropriate cryptographic production random source, strict gameplay
payloads, server-owned phase/board/deadline/submission/scoring/results state,
and round-aware reconnection. Stage 4A added no live gameplay, QR rendering,
deployment, container, persistence, moderation, or repository-setting change.

## 2026-07-28 — Stage 3.1 controller-succession test reliability

### Finding and correction

- Investigated the local timeout in
  `automatically promotes the earliest connected player when the controller leaves`.
- Classified the cause as a nondeterministic test fixture, not an application
  race, listener-order race, cleanup leak, or machine delay.
- Confirmed the test installed its display `room:state` listener before
  `player:leave`, and the server acknowledged the leave before broadcasting the
  authoritative final room state.
- Found that rapid player joins can share one millisecond-resolution
  `joinedAt`. The RoomStore correctly breaks those documented ties by player ID,
  but the integration test always waited for the second player. When the third
  player had the lower ID, the test ignored the valid final state and waited
  until Vitest's five-second test timeout.
- Updated only the server integration test and its wait helpers. The test now
  derives the expected successor using `joinedAt` and player ID, prepares the
  final-state wait before triggering leave, awaits the acknowledgement and
  prepared state together, and checks that the former controller is removed,
  exactly one expected controller remains, and the unrelated player stays
  ordinary.
- Removed the test's arbitrary post-event sleep. Room-state and room-error waits
  now remove their listeners and timers on success, structured error,
  disconnect, predicate failure, or their bounded diagnostic timeout. The
  succession test verifies that its display listener count returns to baseline.
- Changed no application source or server behavior. No timeout increase, retry,
  skipped assertion, forced exit, suite serialization, gameplay, deployment, or
  Stage 4 work was added.

### Reproduction and stress verification

- Unchanged focused test — passed 20/20 normal runs.
- Unchanged focused test under full server-suite discovery, fork-pool, and
  file-parallel defaults — passed 20/20 runs.
- Unchanged complete server suite — passed 10/10 runs.
- Corrected focused test — passed 50/50 consecutive runs.
- Corrected complete server suite — passed 10/10 consecutive runs, with 59
  tests across 3 files each time.
- Corrected full repository suite — passed 3/3 consecutive runs, with 249 tests
  across 14 files each time.
- No repetition emitted an open-handle or cleanup warning.

### Full verification

- `npm ci` — passed; installed 406 packages from the committed lockfile.
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

## 2026-07-28 — Stage 3.1 GitHub Actions CI

### Work completed

- Added `.github/workflows/ci.yml` with stable `CI / Quality` and
  `CI / Dependency audit` checks.
- Configured pull requests targeting `main`, pushes to `main`, and manual
  dispatch as the only triggers.
- Added a locked `npm ci` install, separate formatting, lint, type-check, test,
  and build steps, plus a final repository-cleanliness check.
- Added an independent high-severity npm dependency audit that does not ignore
  failures.
- Added `docs/CI.md` with trigger, reproducibility, permissions, concurrency,
  failure-investigation, known-limit, and future branch-protection guidance.
- Updated project, architecture, security, workflow, and root documentation to
  record Stage 3 as complete and Stage 3.1 CI as in review.
- Changed no application, server, shared-contract, or engine source. No
  gameplay, dictionary data, letter distribution, QR rendering, deployment,
  release, package publishing, or Stage 4 work was added.

### Security and reproducibility decisions

- Set workflow permissions explicitly to `contents: read`.
- Used the ordinary `pull_request` event, never `pull_request_target`.
- Disabled persisted checkout credentials and supplied no secrets.
- Resolved official `actions/checkout` v6.0.2 to
  `de0fac2e4500dabe0009e67214ff5f5447ce83dd`.
- Resolved official `actions/setup-node` v6.4.0 to
  `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e`.
- Pinned both official actions to those immutable full commit SHAs.
- Used Node.js 24 and npm caching keyed by the committed `package-lock.json`.
- Added concurrency cancellation for superseded work on the same pull request
  or ref.
- Left branch protection, repository rulesets, Actions permissions, merge
  settings, and administrator bypass settings unchanged. The two real check
  names should be required only in a separate settings review after they have
  completed successfully.

### Local verification

- Local tools — Node.js `v24.18.0`, npm `11.16.0`.
- Official action tag resolution — passed; both repositories are active,
  public, owned by the `actions` organization, and both specified tags resolve
  directly to the pinned commits.
- `npm ci` — passed; installed 406 packages from the committed lockfile.
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
- `npm run dev` — passed; Vite started on `<public origin>` and the Words
  server started on `<public origin>`, then both ports were released
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
- `npm run dev` — passed; Vite started on `<public origin>` and the Words
  server started on `<public origin>`, then both processes stopped
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
  produces `<public origin><CODE>` at the configured public origin.
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
  `localhost` and `<server address>` browser origins
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

## 2026-07-31 — Phone room-interface cleanup (draft)

### Work completed

- Made the phone room view puzzle-first, with compact connection state and a
  Leave room action instead of duplicate display-room administration.
- Kept room codes, QR joining, player lists, phase labels, and detailed results
  on the shared display.
- Kept controller settings, start controls, and delegation between rounds only;
  active gameplay hides them for every phone.
- Replaced phone detailed results with a concise direction to the TV and moved
  the late-join waiting notice after the puzzle.
- Updated focused App and RoomLobby coverage for player and display behavior.
- Applied the first physical phone-review corrections: distinct controller
  puzzle/settings/authority bubbles, in-header phone connection state, no
  phone Leave room action, concise active timer wording, and no redundant
  ended-round TV message.
- Applied the final phone-layout refinement: new rooms default to 5 × 5 for
  two minutes, phone puzzle bubbles have no visible heading, active Tap/Trace
  is a sibling bubble, private progress is not shown on phones, timer labels
  are prominent, and the production stage badge is absent.

### Boundaries retained

- No TV redesign, results timeout, lifecycle transition, server contract,
  scoring, persistence, or later-stage work was added.

## 2026-08-01 — Stage 4G round polish (draft)

- Restored Trace as the fresh-client word-entry default while preserving an
  explicit, client-only Tap preference and the existing path reset on mode
  change.
- Replaced the ended-phone puzzle contents with an authoritative personal round
  summary: the player's final score and winning score only, with a clear
  late-joiner and no-scoring-winner state. Detailed result cards remain TV-only.
- Replaced full-width result-card tracks with a centred, bounded intrinsic grid
  so one-player results remain geometrically centred and multi-player columns
  no longer expand to fill the display.
- Centralized the official LetterGrid gap token across 4 × 4, 5 × 5, and 6 × 6
  boards without changing board geometry, hit testing, or the lobby QR grid.
- Replaced the lobby QR-board placeholder perimeter with the exact `WORDS` /
  `ATLEE` / `WANNA` / `SHARE` mapping around the unchanged merged QR region.
- No server authority, phases, scoring, Socket.IO contract, deployment, or
  production release channel changed. Local visual server startup could not
  claim port 6532 in this environment; final physical review is reserved for
  the deployed test container.

## 2026-08-01 — Stage 4G result presentation refinement (draft)

- Extended the phone `ROUND_ENDED` summary with authoritative winner names
  directly below the winning score. Ties retain result order and use readable
  ampersand punctuation; no-winner rounds still show `No scoring winner` only.
- Restyled the display result cards with the established dark Words surface,
  paper and muted text, mint score emphasis, inset word lists, and a restrained
  winner border/crown accent. The compact centred intrinsic layout is unchanged.
- No result projection, scoring, lifecycle, authority, Socket.IO, deployment,
  or production channel behavior changed.

## 2026-08-02 — Stage 4G lobby demonstration refinement (draft)

- Replaced the generic pre-round character stream with explicit static 4 × 4,
  5 × 5, and 6 × 6 presentation boards. They are client-only demonstrations
  and never participate in server-generated official rounds.
- Matched the embedded lobby QR SVG height to its width within an explicitly
  square, clipped surface. This removes fractional auto-height divergence that
  could expose a thin bottom/right seam while retaining the QR payload, quiet
  zone, and `WORDS` / `ATLEE` / `WANNA` / `SHARE` perimeter.
- No scoring, authority, phases, result behavior, Socket.IO, deployment, or
  production channel behavior changed.

## 2026-08-02 — Stage 4H persistent phone entry mode (draft)

- Kept the connected-player Tap/Trace selector visible in the lobby, active
  round, and ended-round views while keeping it out of display and
  disconnected-session views.
- Preserved the existing local preference and mode-change path clearing, and
  kept tile input and submission restricted to active play.
- Stabilized the player room component key across round transitions so the
  selected mode does not reset between rounds.
- No server, networking, scoring, lifecycle, display behavior, or production
  release channel changed.

## 2026-08-02 — Stage 4H display audio lifetime (draft)

- Moved the display-only audio owner above the round-keyed display room so one
  context survives lobby, active, results, and later-round transitions.
- Removed the visible display sound prompt after successful physical testing;
  display audio still retries invisibly on ordinary pointer and keyboard input.
- Kept the existing synthesized pitches, envelopes, winner phrase, and sound
  transition rules unchanged.

## 2026-08-03 — Stage 4H display audio character (draft)

- Replaced the accepted-word beep with a short triangle-wave root and perfect
  fifth chime using the unchanged eight-player root-frequency mapping.
- Replaced the winner tune with an ascending root, major-third, perfect-fifth,
  and octave phrase followed by a brief resolving major chord.
- Kept display-session ownership, automatic startup, invisible resume retry,
  round persistence, phone isolation, and display-session disposal unchanged.

## 2026-08-03 — Board quality research tooling (draft)

- Added a deterministic developer-only CLI that generates accepted boards
  through the production distribution and quality profiles, then analyzes
  5,000 boards each at 4 × 4, 5 × 5, and 6 × 6 with the production dictionary,
  adjacency, and scoring definitions.
- Recorded composition, spatial vowel spread, repeated-token clustering,
  playable-word supply, score potential, cell coverage, correlations, three
  offline acceptance-policy comparisons, and 36 stable review boards.
- Verified independent runs with seed `board-quality-v1` produce byte-identical
  summary and sample JSON artifacts.
- Changed no production board rule, runtime path, networking behavior, or
  deployment channel; the policy thresholds remain research hypotheses for a
  future physical A/B study.

## 2026-08-03 — Median-playability board selection (draft)

- Added an experimental server-only selector that ranks a bounded pool of eight
  boards from the unchanged production generator against the human-approved
  median playable-word targets.
- Extracted a minimal trie-backed playability solver shared with the retained
  research tooling; the trie is cached per production dictionary object and
  remains excluded from browser builds.
- Audited 5,000 selections per size twice with seed
  `median-board-selection-v1`. Both outputs were byte-identical, all
  distribution goals passed, and local selector P95 remained below 25 ms.
- Kept tile distribution, existing board acceptance profiles, dictionary,
  scoring, network schemas, client behavior, and deployment workflows
  unchanged. This branch is for physical testing before any production choice.
