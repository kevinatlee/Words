import {
  formatRoundDuration,
  productConfig,
  type RoomSettings,
} from '@words/shared';

type GameSettingsProps = {
  settings: RoomSettings;
  disabled: boolean;
  pending: boolean;
  canEdit: boolean;
  onChange: (settings: RoomSettings) => void;
};

export function GameSettings({
  settings,
  disabled,
  pending,
  canEdit,
  onChange,
}: GameSettingsProps) {
  return (
    <section className="panel settings-panel" aria-labelledby="settings-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Game settings</span>
          <h2 id="settings-title">Game Settings</h2>
        </div>
        <span className="status-label">
          {pending ? 'Saving…' : canEdit ? 'Game Host controls' : 'Read only'}
        </span>
      </div>

      <fieldset className="choice-group">
        <legend>Grid size</legend>
        <div className="segmented-control segmented-control--three">
          {productConfig.supportedGridSizes.map((size) => (
            <button
              type="button"
              aria-pressed={settings.gridSize === size}
              disabled={disabled}
              onClick={() => onChange({ ...settings, gridSize: size })}
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
              aria-pressed={settings.roundDurationSeconds === seconds}
              disabled={disabled}
              onClick={() =>
                onChange({ ...settings, roundDurationSeconds: seconds })
              }
              key={seconds}
            >
              {formatRoundDuration(seconds)}
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
