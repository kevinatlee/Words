import { productConfig, type RoomSettings } from '@words/shared';

type GameSettingsProps = {
  settings: RoomSettings;
  disabled: boolean;
  pending: boolean;
  onChange: (settings: RoomSettings) => void;
};

const durationLabels = {
  30: { visible: '30s', accessible: '30 seconds' },
  60: { visible: '1m', accessible: '1 minute' },
  90: { visible: '1.5m', accessible: '1.5 minutes' },
  120: { visible: '2m', accessible: '2 minutes' },
  150: { visible: '2.5m', accessible: '2.5 minutes' },
  180: { visible: '3m', accessible: '3 minutes' },
} as const;

export function GameSettings({
  settings,
  disabled,
  pending,
  onChange,
}: GameSettingsProps) {
  return (
    <section
      className="panel settings-panel"
      aria-label="Game settings"
      aria-busy={pending || undefined}
    >
      <fieldset className="choice-group">
        <legend>Grid Size</legend>
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
        <legend>Round Duration</legend>
        <div className="duration-grid">
          {productConfig.supportedRoundDurationsSeconds.map((seconds) => (
            <button
              type="button"
              aria-label={durationLabels[seconds].accessible}
              aria-pressed={settings.roundDurationSeconds === seconds}
              disabled={disabled}
              onClick={() =>
                onChange({ ...settings, roundDurationSeconds: seconds })
              }
              key={seconds}
            >
              {durationLabels[seconds].visible}
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
