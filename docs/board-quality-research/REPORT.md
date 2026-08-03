# Board quality research

Seed: `board-quality-v1`. Samples: 15,000 boards (5,000 each for 4 × 4, 5 × 5, and 6 × 6).

This is a deterministic, developer-only analysis of boards accepted by the current production generator. It changes no production rule and publishes no gameplay artifact.

## Source-of-truth definitions

- Generator: `generateDefaultBoard`, using the cap-of-two `DEFAULT_TILE_DISTRIBUTION`, size profiles, and eight-attempt bound.
- Vowels: complete tokens `A`, `E`, `I`, `O`, `U`; `QU` is deliberately not a vowel.
- Spatial convention: on odd grids, the neutral center row and column belong to no quadrant, so they do not arbitrarily favor one side or overstate spread.
- Repeat clustering: component and window maxima are measured across every token; adjacent-edge counts include every equal-token neighboring pair once.
- Adjacency: horizontal, vertical, and diagonal neighbors from `getAdjacentIndices`; no tile reuse.
- Words: production dictionary normalized to uppercase ASCII; minimum length 3; `QU` is one board token but contributes two letters.
- Score: normalized word length plus the existing +1 bonus for 3–4 letter unique words and +2 for longer unique words.

### Production distribution

| Token | Weight | Token | Weight | Token | Weight |
| ----- | -----: | ----- | -----: | ----- | -----: |
| A     |  49322 | B     |  13232 | C     |  27382 |
| D     |  25850 | E     |  74285 | F     |   9511 |
| G     |  20260 | H     |  15153 | I     |  56041 |
| J     |   1230 | K     |   6343 | L     |  35167 |
| M     |  18097 | N     |  46103 | O     |  40728 |
| P     |  19476 | QU    |   1229 | R     |  48891 |
| S     |  57352 | T     |  45407 | U     |  22662 |
| V     |   6938 | W     |   6160 | X     |   1852 |
| Y     |  10652 | Z     |   2884 |       |        |

### Current acceptance profiles

| Size  | Minimum vowels | Maximum vowels | Maximum identical tokens | Maximum attempts |
| ----- | -------------: | -------------: | -----------------------: | ---------------: |
| 4 × 4 |              4 |              9 |                        4 |                8 |
| 5 × 5 |              6 |             14 |                        5 |                8 |
| 6 × 6 |              9 |             20 |                        6 |                8 |

## Runtime

- Analysis time: 14,755 ms (1016.6 boards/s; 1281.5 candidate boards/s).
- Accepted boards required 18,909 generated candidates in this run.
- Generation alone took 128 ms (147864.8 candidate boards/s). Solving accepted boards took 14,599 ms (1027.4 solved boards/s).
- The solver uses a research-only prefix trie and production eight-direction adjacency; it stores only aggregate metrics and curated samples.

## Key findings

- Median playable-word counts were 72, 153, and 262 for 4 × 4, 5 × 5, and 6 × 6; the corresponding P5 counts were 31, 77, and 148.
- Vowel count had only weak correlation with playable-word count (0.038 to 0.073 across sizes). Vowel spread was somewhat more informative (0.097 to 0.196).
- Larger repeated-token components correlated negatively with playable-word count in every size (-0.193, -0.141, and -0.172). Cell coverage had a consistently stronger positive relationship (0.353, 0.290, and 0.265).
- The exploratory hybrid policy rejected 16.640%, 21.000%, and 12.720% while raising P5 playable-word counts by 13, 25, and 39. Its estimated generation-cost multipliers were 1.200×, 1.266×, and 1.146× before solver cost.
- These are associations within generated boards, not evidence that any metric causes players to perceive a board as fair or fun.

## 4 × 4

| Metric                    |    Mean |    P5 | P50 | P95 |
| ------------------------- | ------: | ----: | --: | --: |
| vowelCount                |   6.065 |     4 |   6 |   9 |
| vowelQuadrants            |   3.486 |     2 |   4 |   4 |
| largestVowelComponent     |   4.846 |     2 |   5 |   8 |
| maximumRepeatedTokenCount |   3.026 |     2 |   3 |   4 |
| playableWordCount         |  77.617 |    31 |  72 | 144 |
| longPlayableWordCount     |  22.701 |     3 |  18 |  58 |
| longestWordLength         |   6.816 |     5 |   7 |   8 |
| totalPossibleScore        | 418.029 |   150 | 380 | 828 |
| cellCoverage              |   0.967 | 0.875 |   1 |   1 |

### Playable words by length

| Length |   Mean |  P5 | P50 | P95 |
| ------ | -----: | --: | --: | --: |
| 3      | 25.895 |  13 |  25 |  41 |
| 4      | 29.020 |  10 |  27 |  54 |
| 5      | 14.776 |   2 |  13 |  35 |
| 6      |  5.866 |   0 |   4 |  17 |
| 7      |  1.672 |   0 |   1 |   6 |
| 8+     |  0.387 |   0 |   0 |   2 |

### Correlations

- vowelCountVsWords: **0.038** (correlation, not causation).
- vowelSpreadVsWords: **0.196** (correlation, not causation).
- vowelClusteringVsLongWords: **-0.030** (correlation, not causation).
- repeatedClusteringVsWords: **-0.193** (correlation, not causation).
- coverageVsWords: **0.353** (correlation, not causation).

### Offline policy experiments

| Policy                         | Acceptance | Rejection | Cost multiplier | Solver | Median words (Δ) | P5 words (Δ) |
| ------------------------------ | ---------: | --------: | --------------: | :----: | ---------------: | -----------: |
| spatial-vowel-hard-limits      |    82.820% |   17.180% |          1.207× |   no   |          75 (+3) |      34 (+3) |
| soft-quality-score             |    35.060% |   64.940% |          2.852× |  yes   |        107 (+35) |     70 (+39) |
| hybrid-composition-playability |    83.360% |   16.640% |          1.200× |  yes   |          78 (+6) |     44 (+13) |

Exact exploratory rules and secondary effects:

- **spatial-vowel-hard-limits:** vowel rows and columns >= ceil(size / 2); quadrants >= 3; maximum nearest-vowel distance <= 2; maximum vowels in any 2x2 <= 3. Median words length 5+ changed by +2; P5 words length 5+ changed by +1; median cell coverage changed by +0 percentage points; P5 coverage changed by +0 points.
- **soft-quality-score:** weighted quality score >= 0.80 (vowel spread 25%, low vowel clustering 15%, low repeat clustering 15%, size-normalized playable words 25%, cell coverage 20%). Median words length 5+ changed by +17; P5 words length 5+ changed by +11; median cell coverage changed by +0 percentage points; P5 coverage changed by +6.250 points.
- **hybrid-composition-playability:** spatial spread plus current repeat cap; playable words >= sample P10 (38); words length 5+ >= sample P10 (5). Median words length 5+ changed by +3; P5 words length 5+ changed by +4; median cell coverage changed by +0 percentage points; P5 coverage changed by +0 points.

The cost multiplier is the inverse observed acceptance rate, conditional on boards already accepted by production. Policies marked "yes" would additionally solve every candidate at roughly 0.973 ms per board on this host, so their true generation cost would exceed this lower-bound estimate. These thresholds are exploratory, not proven quality rules.

## 5 × 5

| Metric                    |    Mean |      P5 | P50 |  P95 |
| ------------------------- | ------: | ------: | --: | ---: |
| vowelCount                |   9.245 |       6 |   9 |   13 |
| vowelQuadrants            |   3.397 |       2 |   4 |    4 |
| largestVowelComponent     |   6.864 |       3 |   7 |   12 |
| maximumRepeatedTokenCount |   4.063 |       3 |   4 |    5 |
| playableWordCount         | 160.023 |      77 | 153 |  267 |
| longPlayableWordCount     |  58.307 |      15 |  51 |  126 |
| longestWordLength         |   7.868 |       6 |   8 |   10 |
| totalPossibleScore        | 907.329 | 395.950 | 846 | 1615 |
| cellCoverage              |   0.971 |   0.880 |   1 |    1 |

### Playable words by length

| Length |   Mean |  P5 | P50 | P95 |
| ------ | -----: | --: | --: | --: |
| 3      | 44.912 |  28 |  44 |  65 |
| 4      | 56.804 |  28 |  55 |  92 |
| 5      | 33.627 |  10 |  31 |  66 |
| 6      | 16.490 |   3 |  14 |  40 |
| 7      |  6.070 |   0 |   4 |  18 |
| 8+     |  2.120 |   0 |   1 |   8 |

### Correlations

- vowelCountVsWords: **0.073** (correlation, not causation).
- vowelSpreadVsWords: **0.097** (correlation, not causation).
- vowelClusteringVsLongWords: **0.002** (correlation, not causation).
- repeatedClusteringVsWords: **-0.141** (correlation, not causation).
- coverageVsWords: **0.290** (correlation, not causation).

### Offline policy experiments

| Policy                         | Acceptance | Rejection | Cost multiplier | Solver | Median words (Δ) | P5 words (Δ) |
| ------------------------------ | ---------: | --------: | --------------: | :----: | ---------------: | -----------: |
| spatial-vowel-hard-limits      |    69.100% |   30.900% |          1.447× |   no   |         160 (+7) |      83 (+6) |
| soft-quality-score             |    46.200% |   53.800% |          2.165× |  yes   |        195 (+42) |    133 (+56) |
| hybrid-composition-playability |        79% |   21.000% |          1.266× |  yes   |        163 (+10) |    102 (+25) |

Exact exploratory rules and secondary effects:

- **spatial-vowel-hard-limits:** vowel rows and columns >= ceil(size / 2); quadrants >= 3; maximum nearest-vowel distance <= 2; maximum vowels in any 2x2 <= 3. Median words length 5+ changed by +3; P5 words length 5+ changed by +1; median cell coverage changed by +0 percentage points; P5 coverage changed by +4.000 points.
- **soft-quality-score:** weighted quality score >= 0.80 (vowel spread 25%, low vowel clustering 15%, low repeat clustering 15%, size-normalized playable words 25%, cell coverage 20%). Median words length 5+ changed by +25; P5 words length 5+ changed by +20; median cell coverage changed by +0 percentage points; P5 coverage changed by +8.000 points.
- **hybrid-composition-playability:** spatial spread plus current repeat cap; playable words >= sample P10 (91); words length 5+ >= sample P10 (20). Median words length 5+ changed by +6; P5 words length 5+ changed by +10; median cell coverage changed by +0 percentage points; P5 coverage changed by +4.000 points.

The cost multiplier is the inverse observed acceptance rate, conditional on boards already accepted by production. Policies marked "yes" would additionally solve every candidate at roughly 0.973 ms per board on this host, so their true generation cost would exceed this lower-bound estimate. These thresholds are exploratory, not proven quality rules.

## 6 × 6

| Metric                    |     Mean |      P5 |  P50 |      P95 |
| ------------------------- | -------: | ------: | ---: | -------: |
| vowelCount                |   13.161 |       9 |   13 |       17 |
| vowelQuadrants            |    3.945 |       3 |    4 |        4 |
| largestVowelComponent     |    9.013 |       4 |    8 |       16 |
| maximumRepeatedTokenCount |    5.185 |       4 |    5 |        6 |
| playableWordCount         |  272.377 |     148 |  262 |  428.050 |
| longPlayableWordCount     |  110.820 |      38 |  101 |      215 |
| longestWordLength         |    8.624 |       7 |    9 |       10 |
| totalPossibleScore        | 1592.725 | 789.950 | 1509 | 2647.050 |
| cellCoverage              |    0.975 |   0.917 |    1 |        1 |

### Playable words by length

| Length |   Mean |  P5 | P50 | P95 |
| ------ | -----: | --: | --: | --: |
| 3      | 68.592 |  46 |  68 |  93 |
| 4      | 92.964 |  52 |  92 | 139 |
| 5      | 59.475 |  24 |  56 | 106 |
| 6      | 32.205 |   8 |  29 |  67 |
| 7      | 13.543 |   2 |  11 |  33 |
| 8+     |  5.597 |   0 |   4 |  17 |

### Correlations

- vowelCountVsWords: **0.059** (correlation, not causation).
- vowelSpreadVsWords: **0.134** (correlation, not causation).
- vowelClusteringVsLongWords: **-0.021** (correlation, not causation).
- repeatedClusteringVsWords: **-0.172** (correlation, not causation).
- coverageVsWords: **0.265** (correlation, not causation).

### Offline policy experiments

| Policy                         | Acceptance | Rejection | Cost multiplier | Solver | Median words (Δ) | P5 words (Δ) |
| ------------------------------ | ---------: | --------: | --------------: | :----: | ---------------: | -----------: |
| spatial-vowel-hard-limits      |    66.080% |   33.920% |          1.513× |   no   |        276 (+14) |     157 (+9) |
| soft-quality-score             |    65.340% |   34.660% |          1.530× |  yes   |        302 (+40) |    211 (+63) |
| hybrid-composition-playability |    87.280% |   12.720% |          1.146× |  yes   |        278 (+16) |    187 (+39) |

Exact exploratory rules and secondary effects:

- **spatial-vowel-hard-limits:** vowel rows and columns >= ceil(size / 2); quadrants >= 3; maximum nearest-vowel distance <= 2; maximum vowels in any 2x2 <= 3. Median words length 5+ changed by +7; P5 words length 5+ changed by +4.150; median cell coverage changed by +0 percentage points; P5 coverage changed by +0 points.
- **soft-quality-score:** weighted quality score >= 0.80 (vowel spread 25%, low vowel clustering 15%, low repeat clustering 15%, size-normalized playable words 25%, cell coverage 20%). Median words length 5+ changed by +24; P5 words length 5+ changed by +26; median cell coverage changed by +0 percentage points; P5 coverage changed by +2.778 points.
- **hybrid-composition-playability:** spatial spread plus current repeat cap; playable words >= sample P10 (170); words length 5+ >= sample P10 (48). Median words length 5+ changed by +9; P5 words length 5+ changed by +20; median cell coverage changed by +0 percentage points; P5 coverage changed by +0 points.

The cost multiplier is the inverse observed acceptance rate, conditional on boards already accepted by production. Policies marked "yes" would additionally solve every candidate at roughly 0.973 ms per board on this host, so their true generation cost would exceed this lower-bound estimate. These thresholds are exploratory, not proven quality rules.

## Interpretation and limitations

- Low vowel count and vowel clustering are separate signals: a board can meet the composition minimum while concentrating vowels in one region.
- Dictionary word count is useful for comparison but is not a complete measure of human enjoyment; obscure dictionary entries can inflate it.
- Correlations describe this generated sample and do not establish causation. A quality gate based on word solving may add meaningful generation cost.
- Recommended next experiment: run a small, physically reviewed A/B study comparing the current generator with the hybrid policy, measuring perceived fairness, replay desire, and time-to-first-word before considering any production rule change.
