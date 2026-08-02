import type { ReactNode } from 'react';

import { ProductTitle } from './ProductTitle';
import type { ConnectionStatus, RoomState } from '@words/shared';
import type { DisplayAudioController } from '../hooks/useDisplayAudio';
import { formatDisplaySettings } from './display-format';

type AppShellProps = {
  children: ReactNode;
  pageClassName?: string;
  phoneConnectionStatus?: 'connected' | 'connecting' | 'disconnected' | null;
  displayRoom?: RoomState | null;
  displayConnectionStatus?: ConnectionStatus | null;
  displayAudio?: DisplayAudioController | null;
};

export function AppShell({
  children,
  pageClassName = '',
  phoneConnectionStatus = null,
  displayRoom = null,
  displayConnectionStatus = null,
  displayAudio = null,
}: AppShellProps) {
  const displayController = displayRoom?.players.find(
    (player) => player.id === displayRoom.controllerPlayerId,
  );
  const displaySettings = displayRoom?.round?.settings ?? displayRoom?.settings;
  return (
    <div className={`app-shell ${pageClassName}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header
        className={`site-header${displayRoom ? ' site-header--display' : ''}`}
      >
        {displayRoom ? (
          <>
            <div
              className="display-header__region display-header__logo"
              data-display-header-region="logo"
            >
              <a className="site-header__home" href="/" aria-label="Words home">
                <ProductTitle compact />
              </a>
            </div>
            <div
              className="display-header__region display-header__host"
              data-display-header-region="host"
            >
              <span
                className="display-header__host-name"
                title={displayController?.displayName}
              >
                {displayController ? (
                  <>
                    <span aria-label="Game Host">♛ </span>
                    {displayController.displayName}
                  </>
                ) : (
                  'No Game Host'
                )}
              </span>
            </div>
            <div
              className="display-header__region display-header__settings-region"
              data-display-header-region="settings"
            >
              <span className="display-header__settings">
                {displaySettings &&
                  formatDisplaySettings(
                    displaySettings.gridSize,
                    displaySettings.roundDurationSeconds,
                  )}
              </span>
            </div>
            <div
              className="display-header__region display-header__connection"
              data-display-header-region="connection"
            >
              <span
                className={`connection-status connection-status--display connection-status--${displayConnectionStatus ?? 'disconnected'}`}
              >
                {displayConnectionStatus === 'connected'
                  ? 'Connected'
                  : displayConnectionStatus === 'connecting'
                    ? 'Reconnecting…'
                    : 'Disconnected'}
              </span>
            </div>
          </>
        ) : (
          <>
            <a className="site-header__home" href="/" aria-label="Words home">
              <ProductTitle compact />
            </a>
            <div className="site-header__actions">
              <div id="phone-entry-mode-slot" />
              {phoneConnectionStatus && (
                <span
                  className={`connection-status connection-status--phone connection-status--${phoneConnectionStatus}`}
                >
                  {phoneConnectionStatus === 'connected'
                    ? 'Connected'
                    : phoneConnectionStatus === 'connecting'
                      ? 'Reconnecting…'
                      : 'Disconnected'}
                </span>
              )}
            </div>
          </>
        )}
      </header>
      {displayRoom && (
        <div
          className="display-audio-control-layer"
          data-display-audio-position="below-header-upper-right"
        >
          {displayAudio?.showControl && (
            <button
              className="display-audio-key"
              type="button"
              aria-label="Enable sound"
              title="Enable sound"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                void displayAudio.enable();
              }}
            >
              <svg
                className="display-audio-key__speaker"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2-3.74v7.48A4.5 4.5 0 0 0 16.5 12Z" />
              </svg>
              <span aria-hidden="true">+</span>
            </button>
          )}
        </div>
      )}
      <main id="main-content">{children}</main>
    </div>
  );
}
