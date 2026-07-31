export {
  MAX_TILE_TOKEN_LENGTH,
  SUPPORTED_BOARD_SIZES,
  areAdjacent,
  coordinateToIndex,
  getAdjacentIndices,
  indexToCoordinate,
  isBoardSize,
  isCanonicalTileToken,
  normalizeConfiguredTileToken,
  validateBoard,
  type Board,
  type BoardErrorCode,
  type BoardSize,
  type BoardValidationResult,
  type Coordinate,
  type TileIndex,
  type TilePath,
  type TileToken,
} from './board.js';
export {
  createWordDictionary,
  type DictionaryBuildResult,
  type WordDictionary,
} from './dictionary.js';
export {
  EngineConfigurationError,
  type EngineConfigurationErrorCode,
} from './errors.js';
export {
  MAX_GENERATION_ATTEMPTS,
  generateBoard,
  type BoardGenerationResult,
  type GenerateBoardOptions,
  type RandomSource,
  type WeightedTile,
} from './generation.js';
export {
  readPath,
  validatePath,
  type PathErrorCode,
  type PathValidationResult,
} from './path.js';
export {
  scoreWordByLength,
  type WordPoints,
  type WordScoringResult,
} from './scoring.js';
export {
  MAX_RECONCILIATION_PARTICIPANTS,
  MAX_RECONCILIATION_WORDS_PER_PARTICIPANT,
  reconcileRoundWords,
  type ReconciledParticipant,
  type ReconciledWord,
  type FinalWordPoints,
  type ReconciliationAcceptedWord,
  type ReconciliationParticipant,
  type RoundReconciliationErrorCode,
  type RoundReconciliationResult,
  type UniqueBonusPoints,
} from './results.js';
export {
  DEFAULT_MINIMUM_WORD_LENGTH,
  validateWordPath,
  type ValidateWordPathOptions,
  type WordValidationErrorCode,
  type WordValidationResult,
} from './word.js';
export {
  MAX_CANDIDATE_WORD_LENGTH,
  normalizeWord,
  type WordNormalizationErrorCode,
  type WordNormalizationResult,
} from './word-normalization.js';
