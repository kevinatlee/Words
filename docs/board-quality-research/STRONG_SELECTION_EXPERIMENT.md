# Strong board selection experiment

This physical-test candidate keeps the production generator, dictionary, board
acceptance profiles, `QU` policy, and generation-attempt bounds unchanged. For
each round it solves 32 accepted production-valid candidates, then selects by:

1. highest playable-word count;
2. highest cell coverage;
3. earliest candidate generation index.

Long-word count and vowel spread are measured but are not ranking criteria.
Production's existing median selector and targets remain available unchanged.

## Deterministic audit

`npm run research:strong-selection` ran 500 selections per board size with seed
`strong-board-selection-v1`, covering 48,000 requested candidates. A second run
produced a byte-identical
`generated/strong-selection-summary.json`. Runtime values are intentionally not
stored in that deterministic artifact because they vary by machine.

| Size | Playable words P5 / P50 / P95 | Long words P5 / P50 / P95 | Cell coverage P5 / P50 / P95 | Mean successful candidates | Mean generation attempts |
| ---: | ----------------------------: | ------------------------: | ---------------------------: | -------------------------: | -----------------------: |
|  4×4 |         125.95 / 164 / 226.05 |          38 / 67 / 107.05 |               0.9375 / 1 / 1 |                         32 |                   39.316 |
|  5×5 |               250 / 307 / 398 |          98 / 147 / 220.1 |                 0.92 / 1 / 1 |                         32 |                   38.832 |
|  6×6 |         404.95 / 479 / 603.05 |     179.95 / 244 / 357.05 |   0.9444444444444444 / 1 / 1 |                     31.998 |                   43.086 |

One representative local run measured these complete selector runtimes:

| Size | Mean ms | P50 ms | P95 ms |
| ---: | ------: | -----: | -----: |
|  4×4 |   9.537 |  9.402 | 10.562 |
|  5×5 |  20.046 | 19.994 | 22.020 |
|  6×6 |  36.022 | 35.722 | 38.966 |

## Original-corpus comparison

The retained original corpus contains 5,000 independently generated boards per
size. The strong selector's median is above that corpus's P95 for every size:

| Size | Original P5 / P50 / P95 | Selected P5 / P50 / P95 | Selected P50 minus original P95 |
| ---: | ----------------------: | ----------------------: | ------------------------------: |
|  4×4 |           31 / 72 / 144 |   125.95 / 164 / 226.05 |                             +20 |
|  5×5 |          77 / 153 / 267 |         250 / 307 / 398 |                             +40 |
|  6×6 |      148 / 262 / 428.05 |   404.95 / 479 / 603.05 |                          +50.95 |

Selected P5 remains slightly below the original P95, by 18.05, 17, and 23.10
words respectively. The complete selected distributions nevertheless occupy
the intended upper tail rather than clustering around the median targets. This
audit establishes selection behavior, not whether denser boards are more fun;
that remains the purpose of physical testing.
