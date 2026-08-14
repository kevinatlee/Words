import type { ReactNode } from 'react';

import {
  buildJoinUrl,
  type ConnectionStatus,
  type RoomState,
} from '@words/shared';

import { JoinQrVisual } from './JoinQrCode';
import { ProductTitle } from './ProductTitle';
import { formatDisplaySettings } from './display-format';

type AppShellProps = {
  children: ReactNode;
  pageClassName?: string;
  phoneConnectionStatus?: 'connected' | 'connecting' | 'disconnected' | null;
  displayRoom?: RoomState | null;
  displayConnectionStatus?: ConnectionStatus | null;
};

export function AppShell({
  children,
  pageClassName = '',
  phoneConnectionStatus = null,
  displayRoom = null,
  displayConnectionStatus = null,
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
              className="display-header__region display-header__qr"
              data-display-header-region="qr"
            >
              {displayRoom.phase === 'ROUND_ACTIVE' && (
                <section
                  className="display-header__join-qr"
                  aria-label={`Scan to join room ${displayRoom.code}`}
                >
                  <div
                    className="display-header__join-qr-visual"
                    aria-hidden="true"
                  >
                    <JoinQrVisual
                      joinUrl={buildJoinUrl(
                        window.location.origin,
                        displayRoom.code,
                      )}
                    />
                  </div>
                </section>
              )}
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
      <main id="main-content">{children}</main>
    </div>
  );
}
