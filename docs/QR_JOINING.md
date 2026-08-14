# QR joining

Stages 4D and 4E are complete and merged. The display-only QR presentation does
not change the
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

The completed string is passed to the lobby `DisplayJoinBoard` and reused by
the active display-header QR. Neither presentation parses, normalizes, or
rebuilds it. The same authoritative string is the QR payload and the display
footer URL. No shortener, redirect, lookup service, alternate room identifier,
or server-side registration is involved.

The shared helper normalizes the public room code, replaces any stale path with
`/join/<ROOM_CODE>`, removes query parameters and fragments, and removes URL
userinfo. It preserves the browser's scheme, host, and optional port. Examples:

```text
<public origin>
<public origin>
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

- renders QR canvases directly from React;
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

The shared QR visual renders locally with:

- black `#000000` modules;
- a permanently white `#FFFFFF` background;
- error-correction level M with automatic level boosting disabled;
- an embedded four-module quiet zone;
- ordinary square modules with no interpolation or decorative treatment;
- no logo, image, overlay, gradient, transparency, animation, rotation,
  inversion, or decorative module styling.

The lobby canvas stays square through CSS and is hidden from the accessibility
tree. It remains embedded in one merged letter-tile-tone 3 × 3 center region
of a noninteractive 5 × 5 demonstration board; the five top tiles spell
`WORDS`. During an active round, the same policy is rendered as a 4rem square
inline SVG on white in the true center of the display header. Its surrounding
region is labelled for assistive technology while the visual encoding remains
hidden.
The exact URL appears in the display footer. No live region or automatic focus
movement is used.

A small React error boundary contains an unexpected QR-renderer exception. It
does not retry and renders the exact fallback `QR unavailable`. The footer URL,
gameplay, and reconnect behavior remain available outside that visual boundary.

## Phase presentation

- **Lobby:** the QR is merged into the centered demonstration board, with
  Players and Room Highlights side bubbles and the join URL footer.
- **Active round:** a small direct-join QR occupies the fixed center column of
  the five-region display header. The official board, Time Remaining, side
  bubbles, and footer remain unchanged.
- **Ended round:** the header QR, board, timer, and side bubbles are absent;
  only result cards and the footer remain.

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

A person successfully joining during a playable `ROUND_ACTIVE` enters the
current round immediately when its bounded participant roster has room. They
receive the existing board and only the remaining authoritative time. At or
after the deadline, during finalized results, or when the active roster is
already full, they wait for the next round.

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
- merged lobby presentation, centered active-header presentation, and ended
  absence;
- display-only role enforcement and route exclusions;
- accessible text and visual-tree hiding;
- deterministic rerendering and renderer-failure containment;
- current-origin behavior, normalization, stale path replacement, query,
  fragment, and userinfo removal;
- browser-origin and route-normalization fixtures;
- direct active-round joining with remaining-time-only gameplay.

Browser validation verifies the exact credential-free payload, lobby
placement, active-header placement, ended absence, manual room-code fallback,
reconnect behavior, and phone-route exclusion. Native-camera scan reliability
at the initial 4rem header size still depends on the physical display and
device; automated tests do not claim a physical scan.

## Known limitations and Stage 4H boundary

- QR visibility depends on physical display size, viewing distance, glare,
  focus, and the scanning device.
- The QR provides no in-app scanner, camera permission, native application,
  custom scheme, universal link, PWA installation, NFC, Bluetooth, sharing
  integration, or authentication.
- Rooms remain temporary and are lost on a server restart.
- There is no result history or cumulative score by deliberate product design.

Stage 4H leaves QR behavior unchanged. It remains display-only and does not add
cumulative scoring, persistence, or another game phase.
