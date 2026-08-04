# Median board selection experiment

This is an experimental test candidate, not a production decision. Physical review found both the median and strong research samples excellent, but preferred median boards for normal play because they retain meaningful searching. The strong samples remain in the original research for a possible future fast, high-density, or alternate mode.

## Selector

For each round, the server asks the unchanged `generateDefaultBoard` function for eight independently accepted candidates using the same random source. It solves each successful candidate with the production dictionary, eight-direction adjacency, no tile reuse, complete `QU` token handling, and the existing minimum word length. The production dictionary trie is cached for the lifetime of its dictionary object.

Candidates are ranked by this exact ordered tuple:

1. smallest absolute normalized deviation from the total playable-word target;
2. smallest absolute normalized deviation from the words-length-5+ target;
3. highest cell coverage;
4. smallest largest repeated-token component;
5. earliest generation index.

The first criterion always dominates the rest. A candidate does not need to hit a target or percentile band. Individual production-generation failures are skipped, and the existing explicit board-generation failure is returned only when the pool produces no candidate.

| Size  | Total-word target | Length-5+ target |
| ----- | ----------------: | ---------------: |
| 4 × 4 |                72 |               18 |
| 5 × 5 |               153 |               51 |
| 6 × 6 |               262 |              101 |

No strong-tail target, mode selector, URL option, environment toggle, or client-visible indicator is part of this experiment.

## Deterministic audit

The audit ran the actual selector for 5,000 selections per size with seed `median-board-selection-v1`. Two complete runs produced byte-identical [machine-readable results](generated/median-selection-summary.json) with SHA-256 `80d909cd656fe63d79d5a500b95d3ddee821f7978cd3d95c365f44df29b5b1d8`.

### Playable-word distributions

| Size  | Measure   | Corpus |  P5 | P10 | P25 | P50 | P75 |   P90 |    P95 |
| ----- | --------- | ------ | --: | --: | --: | --: | --: | ----: | -----: |
| 4 × 4 | Total     | Before |  31 |  38 |  52 |  72 |  98 |   124 |    144 |
| 4 × 4 | Total     | After  |  61 |  64 |  68 |  72 |  75 |    79 |     82 |
| 4 × 4 | Length 5+ | Before |   3 |   5 |  10 |  18 |  30 |    46 |     58 |
| 4 × 4 | Length 5+ | After  |   8 |  10 |  14 |  18 |  22 |    27 |     30 |
| 5 × 5 | Total     | Before |  77 |  91 | 118 | 153 | 194 |   239 |    267 |
| 5 × 5 | Total     | After  | 133 | 139 | 147 | 153 | 159 |   166 |    171 |
| 5 × 5 | Length 5+ | Before |  15 |  20 |  33 |  51 |  77 | 106.1 |    126 |
| 5 × 5 | Length 5+ | After  |  32 |  36 |  43 |  51 |  59 |    68 |     73 |
| 6 × 6 | Total     | Before | 148 | 170 | 210 | 262 | 326 | 387.1 | 428.05 |
| 6 × 6 | Total     | After  | 234 | 242 | 253 | 262 | 270 |   281 |    288 |
| 6 × 6 | Length 5+ | Before |  38 |  48 |  70 | 101 | 142 | 186.1 |    215 |
| 6 × 6 | Length 5+ | After  |  71 |  77 |  88 | 100 | 113 |   125 | 132.05 |

| Size  | Inside original total-word P25–P75 | Outside | Mean successful candidates | Mean underlying generator attempts |
| ----- | ---------------------------------: | ------: | -------------------------: | ---------------------------------: |
| 4 × 4 |                             99.56% |   0.44% |                          8 |                              9.803 |
| 5 × 5 |                             99.48% |   0.52% |                          8 |                              9.728 |
| 6 × 6 |                             99.50% |   0.50% |                          8 |                             10.755 |

All distribution goals passed with the initial pool of eight: each selected median is at its target, selected P5 is no lower than the original P25, selected P95 is no higher than the original P75, each length-5+ median remains inside its original interquartile band, and more than 99% of selections are inside the original total-word interquartile band.

### Secondary ranking metrics

| Size  | Metric                    |    P5 |   P10 |   P25 | P50 | P75 | P90 | P95 |
| ----- | ------------------------- | ----: | ----: | ----: | --: | --: | --: | --: |
| 4 × 4 | Cell coverage             | 0.875 | 0.938 | 0.938 |   1 |   1 |   1 |   1 |
| 4 × 4 | Repeated-token component  |     1 |     2 |     2 |   2 |   3 |   3 |   3 |
| 4 × 4 | Candidate winner position |     1 |     1 |  2.75 |   5 |   7 |   8 |   8 |
| 5 × 5 | Cell coverage             |  0.92 |  0.92 |  0.96 |   1 |   1 |   1 |   1 |
| 5 × 5 | Repeated-token component  |     2 |     2 |     2 |   3 |   3 |   4 |   4 |
| 5 × 5 | Candidate winner position |     1 |     1 |     2 |   4 |   6 |   8 |   8 |
| 6 × 6 | Cell coverage             | 0.917 | 0.944 | 0.972 |   1 |   1 |   1 |   1 |
| 6 × 6 | Repeated-token component  |     2 |     2 |     2 |   3 |   3 |   4 |   4 |
| 6 × 6 | Candidate winner position |     1 |     1 |     3 |   5 |   7 |   8 |   8 |

## Runtime cost

The first full local audit measured the complete eight-candidate selector, including production generation, solving, and ranking:

| Size  |    Mean |     P50 |      P95 |  Maximum | Mean pooled generation | Mean solve/rank overhead |
| ----- | ------: | ------: | -------: | -------: | ---------------------: | -----------------------: |
| 4 × 4 | 2.30 ms | 2.27 ms |  2.76 ms | 56.18 ms |               0.048 ms |                  2.25 ms |
| 5 × 5 | 4.99 ms | 4.97 ms |  5.92 ms |  7.59 ms |               0.060 ms |                  4.93 ms |
| 6 × 6 | 8.90 ms | 8.84 ms | 10.41 ms | 61.47 ms |               0.082 ms |                  8.82 ms |

Every local P95 is below the 25 ms goal. The isolated maximum outliers are consistent with one-time trie construction or runtime pauses and do not affect the P95. Compared with one existing production generation, the experiment intentionally generates eight accepted candidates and adds approximately 2.25–8.82 ms of mean solve-and-rank work, depending on board size.

## Boundaries and limitations

- `generateDefaultBoard`, its tile distribution, vowel and identical-token limits, and its internal eight-attempt bound are unchanged.
- Live selection computes only unique playable totals, length-5+ totals, cell coverage, and repeated-token clustering. Research-only representative words, correlations, percentiles, and Markdown generation are not in the round path.
- The server owns the selector and dictionary; the game-data package remains unavailable under its browser export, and client source/build verification rejects dictionary or research leakage.
- Dictionary word supply is a useful consistency signal, not a complete measure of fun, familiarity, or human search difficulty.
- Runtime measurements are host- and load-dependent. Physical testing should still check perceived round-start latency on the target server.
- This remains an experimental `:test` candidate. Production promotion requires separate physical approval.
