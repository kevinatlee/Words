import { productConfig, type RoomSettings } from '@words/shared';

type GameSettingsProps = {
  settings: RoomSettings;
  disabled: boolean;
  pending: boolean;
  onChange: (settings: RoomSettings) => void;
};

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
        <legend className="visually-hidden">Grid Size</legend>
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
        <legend className="visually-hidden">Round Duration</legend>
        <div className="duration-slider">
          <output className="duration-slider__value" htmlFor="round-duration">
            {settings.roundDurationSeconds} seconds
          </output>
          <input
            id="round-duration"
            type="range"
            min="30"
            max="180"
            step="30"
            value={settings.roundDurationSeconds}
            aria-label="Round Duration"
            aria-valuetext={`${settings.roundDurationSeconds} seconds`}
            disabled={disabled}
            onChange={(event) => {
              const seconds = Number(event.currentTarget.value);
              if (
                seconds !== settings.roundDurationSeconds &&
                productConfig.supportedRoundDurationsSeconds.includes(
                  seconds as (typeof productConfig.supportedRoundDurationsSeconds)[number],
                )
              ) {
                onChange({
                  ...settings,
                  roundDurationSeconds:
                    seconds as RoomSettings['roundDurationSeconds'],
                });
              }
            }}
          />
          <div className="duration-slider__ticks" aria-hidden="true">
            {productConfig.supportedRoundDurationsSeconds.map((seconds) => (
              <span key={seconds}>{seconds}</span>
            ))}
          </div>
          <span className="duration-slider__unit" aria-hidden="true">
            seconds
          </span>
        </div>
      </fieldset>
    </section>
  );
}
