import {
  formatRoundDuration,
  productConfig,
  type GridSize,
  type RoundDurationSeconds,
} from '@words/shared';

type GameSettingsPrototypeProps = {
  gridSize: GridSize;
  duration: RoundDurationSeconds;
  onGridSizeChange: (size: GridSize) => void;
  onDurationChange: (duration: RoundDurationSeconds) => void;
};

export function GameSettingsPrototype({
  gridSize,
  duration,
  onGridSizeChange,
  onDurationChange,
}: GameSettingsPrototypeProps) {
  return (
    <section className="panel settings-panel" aria-labelledby="settings-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Local preview controls</span>
          <h2 id="settings-title">Round setup</h2>
        </div>
        <span className="status-label">Not connected</span>
      </div>

      <fieldset className="choice-group">
        <legend>Grid size</legend>
        <div className="segmented-control segmented-control--three">
          {productConfig.supportedGridSizes.map((size) => (
            <button
              type="button"
              aria-pressed={gridSize === size}
              onClick={() => onGridSizeChange(size)}
              key={size}
            >
              {size} × {size}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="choice-group">
        <legend>Round duration</legend>
        <div className="duration-grid">
          {productConfig.supportedRoundDurationsSeconds.map((seconds) => (
            <button
              type="button"
              aria-pressed={duration === seconds}
              onClick={() => onDurationChange(seconds)}
              key={seconds}
            >
              {formatRoundDuration(seconds)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="setting-summary">
        <span>
          <small>Scoring mode</small>
          <strong>Traditional</strong>
        </span>
        <span>
          <small>Shared words</small>
          <strong>Score zero</strong>
        </span>
      </div>
    </section>
  );
}
