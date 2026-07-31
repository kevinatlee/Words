# QR joining

Stage 4D is complete and merged on the trusted
`c8bbc33f2b150c9c04c047b0bb2f64091cecb0b2` main baseline. Stage 4E is in
draft review. It adds a display-only QR presentation without changing the
server, room contract, gameplay lifecycle, scoring, or ordinary player join
flow.

## Round-local casual play

Each round stands alone. Words is designed for casual drop-in play rather than
a committed match or campaign. Players can join, play a round, see that
round's result, continue, or leave. Starting the next round replaces the
previous result; the application does not accumulate session scores or
preserve match history.

Cumulative scoring, session totals, match series, persistent standings,
profiles, progression, streaks, achievements, rematch voting, ready-up
commitments, and penalties for leaving are intentional product non-goals. They
are not ordinary deferred enhancements.

## QR architecture

`RoomLobby` constructs the join destination exactly once with:

```ts
buildJoinUrl(window.location.origin, room.code);
```

The completed string is passed to `JoinQrCode`. The QR component does not
parse, normalize, or rebuild it. The same string is both:

- the QR payload; and
- the visible, keyboard-focusable join link.

The shared helper normalizes the public room code, replaces any stale path with
`/join/<ROOM_CODE>`, removes query parameters and fragments, and removes URL
userinfo. It preserves the browser's scheme, host, and optional port. Examples:

```text
https://words.atlee.io/join/ABC234
http://192.168.1.42:5173/join/ABC234
```

The QR contains no display or player session ID, reconnect token, controller
ID, socket ID, room snapshot, board, result, state version, dictionary value,
analytics field, query parameter, fragment, or authentication value. It is a
visible convenience for joining a public temporary room, not authentication.

## Dependency decision

The client uses `qrcode.react` version `4.2.0` under the ISC licence. Its
installation adds one direct client package and zero transitive runtime
packages. It has no runtime or optional dependencies, and its existing React
peer dependency is compatible with React 19. It has no install script, native
binary, filesystem access, remote runtime request, telemetry, API key, dynamic
remote code, or `eval`. Its published licence notice is preserved verbatim in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

The package was selected because it:

- renders SVG directly from React;
- supports React 19 and TypeScript;
- exposes explicit error-correction, margin, foreground, and background
  options;
- has a small, stable dependency boundary; and
- performs deterministic local rendering for fixed inputs.

Alternatives reviewed:

- `react-qr-code` 2.2.0 is MIT-licensed and current, but adds
  `qrcode-generator` and `prop-types` runtime dependencies.
- `@rc-component/qrcode` 2.0.0 is MIT-licensed and current, but adds
  `@babel/runtime` and a broader component surface than Words needs.
- `qr-code-styling` 1.9.2 is MIT-licensed, substantially larger, adds a runtime
  dependency, and emphasizes decorative options that conflict with the
  conservative scan policy.

The pre-QR client build was 355.05 kB minified JavaScript (106.22 kB gzip).
The Stage 4E build is 373.09 kB (112.74 kB gzip), an approximate feature delta
of 18.04 kB minified and 6.52 kB gzip. CSS increased from 22.73 kB (5.26 kB
gzip) to 23.45 kB (5.41 kB gzip), an approximate delta of 0.72 kB minified and
0.15 kB gzip for the responsive QR layout.

## Rendering policy

`JoinQrCode` renders `QRCodeSVG` with:

- black `#000000` modules;
- a permanently white `#FFFFFF` background;
- error-correction level M with automatic level boosting disabled;
- an embedded four-module quiet zone;
- ordinary square modules and crisp SVG paths;
- no logo, image, overlay, gradient, transparency, animation, rotation,
  inversion, or decorative module styling.

The SVG has a scalable `viewBox`, stays square through CSS, cannot intercept
pointer input, and is hidden from the accessibility tree. The surrounding
semantic region provides the accessible heading, instructions, exact URL, and
room-code fallback. The URL wraps safely and retains a visible keyboard-focus
outline. No live region or automatic focus movement is used.

A small React error boundary contains an unexpected QR-renderer exception. It
does not retry. The room code, textual URL, gameplay, and reconnect behavior
remain available outside that visual boundary.

## Phase presentation

- **Lobby:** a prominent 220–320 CSS-pixel QR card headed “Scan to join.”
- **Active round:** a compact 128–176 CSS-pixel card headed “Join the next
  round.” The normal grid layout keeps the board and timer primary; the QR is
  never an overlay.
- **Ended round:** the prominent “Join the next round” card returns while the
  completed result remains the primary gameplay content.

The QR appears only for the display role. Controller phones, ordinary phones,
mid-round joining phones, `/join`, `/join/:roomCode`, `/play/demo`, errors, and
reconnect-failure views never render it. The six-character room code and manual
`/join` route remain practical alternatives when a camera or scanner is
unavailable.

## Join and lifecycle behavior

Scanning opens the existing `/join/<NORMALIZED_ROOM_CODE>` form. The code is
prefilled, but the person must still enter a valid display name and submit the
ordinary join action. Capacity, validation, rate limiting, expiration, and
first-player controller assignment remain server-owned.

A person joining during `ROUND_ACTIVE` enters the room as a normal phone player
and waits. They cannot submit in the current round, do not enter its immutable
participant snapshot or result, and become eligible only when the controller
starts the next round while they remain connected. Starting that next round
replaces the old board, private submissions, and result instead of creating
history.

Display reconnect rebuilds the same public URL from the restored room code and
current browser origin. Player reconnect and controller transfer do not grant
the display role or change the QR destination.

## Server and security boundary

Stage 4E adds no server route, REST endpoint, Socket.IO event, payload field,
room-state field, phase, timer, rate limit, state-version transition, TTL
behavior, scoring rule, result field, persistence, or external QR service.
Generation is synchronous and client-only. No untrusted HTML or
`dangerouslySetInnerHTML` is used.

The QR is intentionally visible to people near the shared display. Anyone who
can see it can attempt the same public join that the visible room code already
allows. It grants no existing session and cannot reconnect or impersonate a
display or player.

## Verification

Automated coverage verifies:

- the exact payload and renderer options;
- lobby, active-round, and ended-round presentations;
- display-only role enforcement and route exclusions;
- accessible text and visual-tree hiding;
- deterministic rerendering and renderer-failure containment;
- current-origin behavior, normalization, stale path replacement, query,
  fragment, and userinfo removal;
- production, local, LAN IPv4, and hostname fixtures;
- unchanged active-round waiting and next-round behavior.

Manual verification uses a LAN-reachable Vite origin rather than `localhost`,
because `localhost` on a phone refers to that phone. The final draft review
record must distinguish automated barcode decoding from a real native-camera
scan; it must not claim a production deployment.

The implemented browser run used a private LAN-reachable Vite origin. It
verified the exact credential-free payload, all three phase presentations,
ordinary first-player controller assignment, a second player, a mid-round
third player who waited and remained outside the completed result, that
player's inclusion in the next round, manual lowercase room-code entry,
expired-room rejection, display reconnect, controller transfer, and
phone-route QR exclusion. The 1280 × 720 shared display had no horizontal
overflow; its prominent QR was square at 281.59 CSS pixels and its compact QR
was square at 153.59 CSS pixels. Browser consoles were clean, and the page
asset inventory showed the QR as a local inline SVG with no external image or
QR service request.

A physical native-iPhone Camera scan, a physical scan of the compact
active-round presentation, true 1920 × 1080 and 3840 × 2160 display runs, and
a genuine browser 200% zoom run were not available in the implementation
environment. They remain explicit draft-review checks and are not reported as
passed. No production deployment was tested.

## Known limitations and Stage 4F boundary

- QR visibility depends on physical display size, viewing distance, glare,
  focus, and the scanning device.
- The QR provides no in-app scanner, camera permission, native application,
  custom scheme, universal link, PWA installation, NFC, Bluetooth, sharing
  integration, or authentication.
- Rooms remain temporary and are lost on a server restart.
- There is no result history or cumulative score by deliberate product design.

Stage 4F should add natural continuous touch and pointer tracing over the
existing board while preserving tap/click and keyboard fallbacks, server-owned
path validation, explicit submission behavior unless separately reviewed, and
all current privacy and authority boundaries. It must not expand QR behavior,
add cumulative scoring, or begin release packaging.
