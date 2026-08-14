# Final round reconciliation and results

Stage 4D is complete and merged. It completes one temporary round without
adding persistence, match history, or a new network event. Stage 4E display QR
joining does not change this contract.

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

- Every accepted word receives its normalized word length as base points.
- A shared word receives no uniqueness bonus and loses no points.
- A unique three- or four-letter word receives +1; a unique word of five or
  more letters receives +2.
- `finalPoints = basePoints + uniqueBonusPoints`.
- One player's personal duplicate cannot count twice because Stage 4C already
  rejects it and reconciliation independently requires unique words.

The exact word outcomes are:

| Word length | Shared final | Unique final |
| ----------: | -----------: | -----------: |
|           3 |            3 |            4 |
|           4 |            4 |            5 |
|           5 |            5 |            7 |
|           6 |            6 |            8 |
|           8 |            8 |           10 |

Result calculation and schema validation use exact safe integers. The strict
runtime schemas reject decimal values and negative zero.

The engine validates participant uniqueness, canonical words, stored
length-based point values, and the existing eight-participant and 256-word
bounds. It preserves participant and accepted-word input order and returns a
detached immutable result. It has no room, display-name, Socket.IO, clock,
dictionary, React, or persistence dependency.

Malformed arrays, sparse entries, throwing getters, and hostile proxies produce
a bounded engine error with no accepted word text or thrown caller message.

## Public result contract

Each public result word contains only:

- canonical uppercase `word`
- length-based `basePoints`
- `shared`
- `uniqueBonusPoints`
- `finalPoints`

Each player result contains:

- immutable round `playerId` and snapshotted `displayName`
- competition `rank`
- integer `baseScore`, `uniqueBonusScore`, and `finalScore`
- ordered public result words

The round result contains the deterministically ordered player results and
`winnerPlayerIds`.

The finished display presents this projection under the stable `Round Results`
heading; round numbering remains result data rather than visible heading copy.
It also adds a deterministic contextual result line and display-only finite
firework and winner-card celebration treatment without altering result data.

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

After a scoring round, Last Round records that round's winners and winning
score. A zero-score round preserves the existing Last Round highlight; if none
exists yet, it remains empty. The Room Record continues to change only when a
positive final score exceeds its current record.

## Participant lifecycle

Identity comes from the round's append-only participant roster, not the current
player list or display name. Results therefore retain:

- connected and disconnected participants
- participants who explicitly left
- participants whose reconnect grace expired
- former controllers

A player enrolled before the authoritative active-round deadline appears exactly once, including a late joiner with no accepted words. Reusing a departed display name creates a different player identity and cannot replace an already enrolled participant.

## Timed privacy transition

While `ROUND_ACTIVE`, accepted word identities, provisional scores, submission
versions, and shared status remain private. The common room snapshot exposes
only each enrolled participant's accepted-word count for TV progress and
display-only tone selection.

Only after submissions close does the detached public result projection reveal
participant words, base values, shared/unique status, integer uniqueness bonuses,
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
- never changes the board, round identity, settings snapshot, participant roster, start time, deadline, generation attempts, private states, room
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

## Timed results interface and return to lobby

`ROUND_ENDED` is a 20-second server-authoritative results window, not a fourth
phase. The display replaces its header with redesigned result cards for every
authoritative participant, including departed players, plus the join URL footer.
Compact dark cards show final integer points, separate Words and Unique words counts, and a
bounded unique-word list; their bounded intrinsic columns form a centred group
rather than stretching across the display. Positive-scoring rounds use
authoritative competition ranks for restrained vertical podium levels; ties
share a level, while all-zero rounds remain flat and do not celebrate. There is
no board, QR, timer, side
bubble, control, table, or word review. Phones keep the authoritative finished
board as a frozen, observational grid above a concise `ROUND OVER` / `Look at
the TV!` summary showing only their own final score and the winning score (or
`No scoring winner`). Below a positive winning score, it shows the authoritative
winner name or tied winner names in result order; they receive no administration
or detailed opponent results. Result
cards use the established dark Words panel treatment while retaining their
centred intrinsic layout.

The client rejects lower state versions, older timestamps at the same version,
and same-version changes to the finalized result projection. This prevents a
conflicting rank or winner snapshot from replacing an accepted result while
preserving established same-version lobby refresh behavior.

The connected game host can also return the room to the lobby early. After the
results window, the lifecycle sweep automatically returns the room to
`LOBBY`, permanently discarding the round result and private submissions while
retaining only bounded last-round and room-record highlights. Settings and start
requests are rejected during the window and return only once the lobby snapshot
arrives. No cumulative history or persistence is retained.

There is no cumulative score, prior-round history, saved result, leaderboard,
series, ready-up flow, rematch vote, or automatic next round. This is a
deliberate round-local casual-play product principle, not an unfinished match
feature. Players may continue or leave without commitment or penalty.

## Manual verification focus

During an active round, verify that the display and other players still cannot
see a participant's accepted words, provisional base total, or eventual
shared/unique status. After the deadline, verify on every role that:

- a shared word shows its length-based base value, zero uniqueness bonus, and
  the same positive final value;
- a unique word shows its base value, +1 or +2 bonus, and integer final value;
- player base, bonus, and final totals equal their word rows;
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

Stage 4E adds the display-only QR presentation without modifying results,
scoring, phases, publication, state versions, TTL, participants, or next-round
replacement.

Stages 4F, 4G, and 5A are complete. Stage 4H is the active test candidate for
count-only TV progress, display-only sounds, and winner presentation without
adding match state or cumulative scoring.
