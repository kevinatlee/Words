import type { ReactNode } from 'react';

import { ProductTitle } from './ProductTitle';

type AppShellProps = {
  children: ReactNode;
  currentPath: string;
  pageClassName?: string;
};

export function AppShell({
  children,
  currentPath,
  pageClassName = '',
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
          {currentPath !== '/' && (
            <a className="text-link" href="/join">
              Join another room
            </a>
          )}
          <span className="stage-badge">Stage 4E QR joining</span>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="site-footer">
        <span>Temporary real-time lobbies</span>
        <span aria-hidden="true">•</span>
        <span>No account. No progress grind. Just a temporary room.</span>
      </footer>
    </div>
  );
}
