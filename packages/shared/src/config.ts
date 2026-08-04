export const productConfig = {
  productName: 'Words',
  version: '0.2.5',
  description: 'A self-hosted real-time letter-grid party game.',
  productionPort: 6532,
  supportedGridSizes: [4, 5, 6],
  supportedRoundDurationsSeconds: [30, 60, 90, 120, 150, 180],
  defaultGridSize: 5,
  defaultRoundDurationSeconds: 120,
  resultsDisplaySeconds: 20,
  defaultScoringMode: 'length-plus-unique',
  maxPlayers: 8,
  maximumSubmittedWordLength: 64,
  maximumAcceptedWordsPerPlayerPerRound: 256,
  roomCodeLength: 6,
  reconnectGraceSeconds: 300,
  roomTtlMinutes: 120,
} as const;

export type GridSize = (typeof productConfig.supportedGridSizes)[number];
export type RoundDurationSeconds =
  (typeof productConfig.supportedRoundDurationsSeconds)[number];
export type ScoringMode = typeof productConfig.defaultScoringMode;
