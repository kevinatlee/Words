import { AppShell } from './components/AppShell';
import { HostLobbyPrototype } from './components/HostLobbyPrototype';
import { NotFound } from './components/NotFound';
import { PlayerPrototype } from './components/PlayerPrototype';
import { RoleSelection } from './components/RoleSelection';

type AppProps = {
  routePath?: string;
};

export function App({ routePath }: AppProps) {
  const currentPath = routePath ?? window.location.pathname;

  let page;
  let pageClassName;

  switch (currentPath) {
    case '/':
      page = <RoleSelection />;
      pageClassName = 'app-shell--home';
      break;
    case '/host':
      page = <HostLobbyPrototype />;
      pageClassName = 'app-shell--host';
      break;
    case '/play/demo':
      page = <PlayerPrototype />;
      pageClassName = 'app-shell--player';
      break;
    default:
      page = <NotFound />;
      pageClassName = 'app-shell--not-found';
  }

  return (
    <AppShell currentPath={currentPath} pageClassName={pageClassName}>
      {page}
    </AppShell>
  );
}
