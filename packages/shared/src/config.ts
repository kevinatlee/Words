export const productConfig = {
  productName: 'Words',
  version: '0.2.5',
  description: 'A self-hosted real-time letter-grid party game.',
  publicUrl: 'https://words.atlee.io',
  productionPort: 6532,
  supportedGridSizes: [4, 5, 6],
  supportedRoundDurationsSeconds: [30, 60, 90, 120, 150, 180],
  defaultGridSize: 4,
  defaultRoundDurationSeconds: 180,
  defaultScoringMode: 'traditional',
  maxPlayers: 8,
  maximumAcceptedWordsPerPlayerPerRound: 256,
  roomCodeLength: 6,
  reconnectGraceSeconds: 60,
  roomTtlMinutes: 120,
} as const;

export type GridSize = (typeof productConfig.supportedGridSizes)[number];
export type RoundDurationSeconds =
  (typeof productConfig.supportedRoundDurationsSeconds)[number];
export type ScoringMode = typeof productConfig.defaultScoringMode;
