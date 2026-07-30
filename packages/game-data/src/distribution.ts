import type { WeightedTile } from '@words/game-engine';

import { GENERATED_DISTRIBUTION_DATA } from './generated/distribution-data.js';

export const DEFAULT_TILE_DISTRIBUTION: readonly WeightedTile[] =
  GENERATED_DISTRIBUTION_DATA.tokenWeights;

export const DEFAULT_DISTRIBUTION_METADATA = GENERATED_DISTRIBUTION_DATA;
