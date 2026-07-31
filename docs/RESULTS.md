# Final round reconciliation and results

Stage 4C is merged. Stage 4D is in draft review and completes one temporary
round without adding persistence, match history, or a new network event.

## Three-phase lifecycle

Rooms still use exactly:

- `LOBBY`
- `ROUND_ACTIVE`
- `ROUND_ENDED`

There is no separate results phase. An active round has `endedAt: null` and
`results: null`. At the authoritative deadline, the server atomically creates
the complete result projection, sets `endedAt` to the exact `deadlineAt`, moves
the room to `ROUND_ENDED`, and increments `stateVersion` once. An ended round
must have non-null finalized results.

The existing `room:state` snapshot is the only publication path. There is no
results request, finalize action, polling endpoint, score event, or result-ready
event.

## Reconciliation rule

The pure game engine receives the immutable round participant IDs and each
participant's ordered canonical accepted records. A word is shared when at
least two distinct participant IDs accepted the same canonical word.

- Every accepted word retains its traditional base points.
- A shared word receives no uniqueness bonus and loses no points.
- A unique word receives exactly 25% of its base points as a bonus.
- `finalPoints = basePoints + uniqueBonusPoints`.
- One player's personal duplicate cannot count twice because Stage 4C already
  rejects it and reconciliation independently requires unique words.

The exact word outcomes are:

| Base points | Shared bonus | Shared final | Unique bonus | Unique final |
| ----------: | -----------: | -----------: | -----------: | -----------: |
|           1 |            0 |            1 |         0.25 |         1.25 |
|           2 |            0 |            2 |         0.50 |         2.50 |
|           3 |            0 |            3 |         0.75 |         3.75 |
|           5 |            0 |            5 |         1.25 |         6.25 |
|          11 |            0 |           11 |         2.75 |        13.75 |

Quarter-point values are exact binary fractions. Result calculation and schema
validation use exact equality and never round word values or player totals to
whole numbers. The strict runtime schemas also reject negative zero rather than
silently accepting a differently encoded zero.

The engine validates participant uniqueness, canonical words, stored
traditional point values, and the existing eight-participant and 256-word
bounds. It preserves participant and accepted-word input order and returns a
detached immutable result. It has no room, display-name, Socket.IO, clock,
dictionary, React, or persistence dependency.

Malformed arrays, sparse entries, throwing getters, and hostile proxies produce
a bounded engine error with no accepted word text or thrown caller message.

## Public result contract

Each public result word contains only:

- canonical uppercase `word`
- traditional `basePoints`
- `shared`
- `uniqueBonusPoints`
- `finalPoints`

Each player result contains:

- immutable round `playerId` and snapshotted `displayName`
- competition `rank`
- exact `baseScore`, `uniqueBonusScore`, and `finalScore`
- ordered public result words

The round result contains the deterministically ordered player results and
`winnerPlayerIds`.

The strict shared schemas reject missing or extra participants, changed names,
duplicate IDs or words, incorrect sharing, score totals, ordering, ranks,
winners, point values, phase/result combinations, and unknown fields.

## Ranking and winners

Players are ordered by final score descending, then original participant
snapshot order for equal scores. Rank is:

```text
1 + number of players with a strictly greater final score
```

This is competition ranking: `1, 1, 3` and `1, 2, 2, 4` are valid. Equal final
scores always share a rank.

When the highest final score is positive, every player tied at that score is a
winner in result order. An all-shared round can therefore produce a positive
tie. Only when no participant submitted a scoring word are all final scores
zero; then `winnerPlayerIds` is empty and the interface says “No scoring winner
this round.”

## Participant lifecycle

Identity comes from the round's immutable participant snapshot, not the current
player list or display name. Results therefore retain:

- connected and disconnected participants
- participants who explicitly left
- participants whose reconnect grace expired
- former controllers

A mid-round joiner is not a participant and does not appear. Reusing a departed
display name creates a different player identity and cannot replace the
snapshotted participant.

## Timed privacy transition

While `ROUND_ACTIVE`, accepted words, provisional scores, submission versions,
and shared status remain private. The display and other players cannot observe
submission activity.

Only after submissions close does the detached public result projection reveal
participant words, base values, shared/unique status, exact uniqueness bonuses,
final word values, base/bonus/final totals, ranks, and winners to that room.

These values remain private and absent from public results:

- `acceptedAt`
- private sequence and `submissionVersion`
- submitted paths
- rejected attempts
- socket IDs and rate-limit state
- reconnect credentials
- dictionary data and metadata

The owner's Stage 4C private state remains unchanged and reconnectable after
the round ends. Finalization does not rewrite accepted words or provisional
scores.

## Automatic, atomic, idempotent finalization

The server finalizes only from `round.participants` and the exact private
submission map. It verifies one valid state for every participant and no
nonparticipant state before reconciliation. It then calculates all words,
scores, ranks, and winners and validates the complete ended-round candidate
before mutating the room.

Finalization:

- changes phase, `endedAt`, results, and `stateVersion` as one transition
- never changes the board, round identity, settings snapshot, participant
  snapshot, start time, deadline, generation attempts, private states, room
  activity, or TTL
- is synchronous, bounded, deterministic, and idempotent
- publishes no partial state
- is a no-op after success

An impossible internal invariant produces a bounded internal failure on action
paths and remains retryable without partial mutation. Such an invariant is
normally deterministic, so a retry is useful only if an injected dependency or
later process repair makes the state valid. The 250-ms scheduler retry remains
bounded by eight participants and 256 words each, and the ordinary room TTL
still removes the room; no partial failure state or special deletion rule is
added. The affected room cannot advance while invalid, but per-room containment
keeps deadline and cleanup broadcasts flowing for other rooms. Accepted words
and private maps are never logged. A future operational diagnostic may safely
identify only the room code and bounded error category, never submitted words,
paths, credentials, or private state.

Room expiration retains its earlier precedence: a room deleted at its TTL does
not publish obsolete results.

## Results interface and next round

The display and phones use the authoritative result order. They show:

- a single-winner, tied-winner, or no-scoring-winner heading
- a semantic ranking table
- every participant, including departed participants and zero scores
- keyboard-accessible participant word reviews
- explicit shared/unique text, base points, uniqueness bonus, and clear final
  points
- a textual “You” marker only on the matching player phone

The client rejects lower state versions, older timestamps at the same version,
and same-version changes to the finalized result projection. This prevents a
conflicting rank or winner snapshot from replacing an accepted result while
preserving established same-version lobby refresh behavior.

The old official board can remain visible. Only the connected controller sees
`Start Next Round`. Settings may change for the next round without changing the
old round's settings snapshot or results.

Starting the next round uses the existing `controller:start-round` event. It
creates a new board and participant snapshot, sets `results` to null, replaces
the private submission map with empty states, and removes the old result from
the only retained round slot. A generation failure leaves the ended round and
results unchanged.

There is no cumulative score, prior-round history, saved result, leaderboard,
series, ready-up flow, rematch vote, or automatic next round.

## Manual verification focus

During an active round, verify that the display and other players still cannot
see a participant's accepted words, provisional base total, or eventual
shared/unique status. After the deadline, verify on every role that:

- a shared word shows its traditional base value, zero uniqueness bonus, and
  the same positive final value;
- a unique word shows its base value, exact 25% bonus, and exact quarter-point
  final value;
- player base, bonus, and final totals equal their word rows without rounding;
- rankings use `finalScore`, and an all-shared positive tie names every tied
  leader;
- an empty-scoring round has no winner;
- refresh restores the same public result without exposing `acceptedAt`, paths,
  or private submission versions;
- controller transfer and next-round settings leave the completed result
  unchanged, while starting the next round replaces it.

## Bounds and deferred work

The maximum public projection is eight participants with 256 words each: 2,048
result-word entries. Validation, reconciliation, serialization, and rendering
remain bounded for the existing single Node process.

Stage 4D adds no continuous drag tracing, QR image, custom shared-word mode,
alternative scoring, persistence, database, Redis, analytics, moderation,
container, deployment, or repository-setting work.

Stage 5 will address production hardening, a one-container production build,
serving the built client from Node, production image publishing, production
server configuration, health and graceful shutdown, Unraid-oriented
installation documentation, and reverse-proxy/tunnel documentation. QR image
rendering, persistence, continuous tracing, and additional UX polish still
require separately reviewed scope.
