export type EngineConfigurationErrorCode =
  | 'DUPLICATE_TILE_TOKEN'
  | 'EMPTY_DISTRIBUTION'
  | 'INVALID_ACCEPTANCE_PREDICATE'
  | 'INVALID_BOARD_SIZE'
  | 'INVALID_MAX_ATTEMPTS'
  | 'INVALID_MINIMUM_LENGTH'
  | 'INVALID_RANDOM_SOURCE'
  | 'INVALID_RANDOM_VALUE'
  | 'INVALID_TILE_TOKEN'
  | 'INVALID_TOTAL_WEIGHT'
  | 'INVALID_WEIGHT';

export class EngineConfigurationError extends Error {
  readonly code: EngineConfigurationErrorCode;

  constructor(code: EngineConfigurationErrorCode, message: string) {
    super(message);
    this.name = 'EngineConfigurationError';
    this.code = code;
  }
}
