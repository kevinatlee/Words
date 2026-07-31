import type { ReactNode } from 'react';

import { ProductTitle } from './ProductTitle';

type AppShellProps = {
  children: ReactNode;
  currentPath: string;
  pageClassName?: string;
  phoneConnectionStatus?: 'connected' | 'connecting' | 'disconnected' | null;
  showJoinAnotherRoom?: boolean;
};

export function AppShell({
  children,
  currentPath,
  pageClassName = '',
  phoneConnectionStatus = null,
  showJoinAnotherRoom = currentPath !== '/',
}: AppShellProps) {
  return (
    <div className={`app-shell ${pageClassName}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <a className="site-header__home" href="/" aria-label="Words home">
          <ProductTitle compact />
        </a>
        <div className="site-header__actions">
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
          {showJoinAnotherRoom && (
            <a className="text-link" href="/join">
              Join Another Room
            </a>
          )}
        </div>
      </header>
      <main id="main-content">{children}</main>
    </div>
  );
}
