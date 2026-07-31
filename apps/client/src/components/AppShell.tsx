import type { ReactNode } from 'react';

import { ProductTitle } from './ProductTitle';

type AppShellProps = {
  children: ReactNode;
  pageClassName?: string;
  phoneConnectionStatus?: 'connected' | 'connecting' | 'disconnected' | null;
};

export function AppShell({
  children,
  pageClassName = '',
  phoneConnectionStatus = null,
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
      </header>
      <main id="main-content">{children}</main>
    </div>
  );
}
