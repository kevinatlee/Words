import { productConfig, type RoomSettings } from '@words/shared';
import { useEffect, useRef, useState } from 'react';

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
  const [draftDuration, setDraftDuration] = useState(
    settings.roundDurationSeconds,
  );
  const dragging = useRef(false);
  const lastRequestedDuration = useRef(settings.roundDurationSeconds);
  useEffect(() => {
    if (!dragging.current) {
      lastRequestedDuration.current = settings.roundDurationSeconds;
      setDraftDuration(settings.roundDurationSeconds);
    }
  }, [settings.roundDurationSeconds]);
  const commitDuration = () => {
    dragging.current = false;
    if (
      draftDuration !== settings.roundDurationSeconds &&
      draftDuration !== lastRequestedDuration.current
    ) {
      lastRequestedDuration.current = draftDuration;
      onChange({ ...settings, roundDurationSeconds: draftDuration });
    }
  };
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
          <input
            id="round-duration"
            type="range"
            min="30"
            max="180"
            step="30"
            value={draftDuration}
            aria-label="Round Duration"
            aria-valuetext={`${draftDuration} seconds`}
            disabled={disabled}
            onPointerDown={() => {
              dragging.current = true;
            }}
            onPointerUp={commitDuration}
            onPointerCancel={commitDuration}
            onTouchEnd={commitDuration}
            onBlur={commitDuration}
            onInput={(event) =>
              setDraftDuration(
                Number(
                  event.currentTarget.value,
                ) as RoomSettings['roundDurationSeconds'],
              )
            }
            onChange={(event) => {
              setDraftDuration(
                Number(
                  event.currentTarget.value,
                ) as RoomSettings['roundDurationSeconds'],
              );
              if (
                !dragging.current &&
                Number(event.currentTarget.value) !==
                  settings.roundDurationSeconds &&
                Number(event.currentTarget.value) !==
                  lastRequestedDuration.current
              ) {
                lastRequestedDuration.current = Number(
                  event.currentTarget.value,
                ) as RoomSettings['roundDurationSeconds'];
                onChange({
                  ...settings,
                  roundDurationSeconds: Number(
                    event.currentTarget.value,
                  ) as RoomSettings['roundDurationSeconds'],
                });
              }
            }}
          />
          <output className="duration-slider__value" htmlFor="round-duration">
            {draftDuration}s
          </output>
        </div>
      </fieldset>
    </section>
  );
}
