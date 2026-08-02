import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createEmptyRoomHighlights, type RoomState } from '@words/shared';

import { AppShell } from './AppShell';

const hostId = '00000000-0000-4000-8000-000000000001';
const playerId = '00000000-0000-4000-8000-000000000002';

function createDisplayRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: 'ABC234',
    phase: 'LOBBY',
    stateVersion: 1,
    serverTime: '2026-07-31T00:00:00.000Z',
    createdAt: '2026-07-31T00:00:00.000Z',
    lastActivityAt: '2026-07-31T00:00:00.000Z',
    expiresAt: '2026-07-31T02:00:00.000Z',
    maxPlayers: 8,
    highlights: createEmptyRoomHighlights(),
    display: { connected: true, createdAt: '2026-07-31T00:00:00.000Z' },
    controllerStatus: 'assigned',
    controllerPlayerId: hostId,
    players: [
      {
        id: hostId,
        displayName: 'Bright Fox',
        connected: true,
        joinedAt: '2026-07-31T00:00:00.000Z',
        isController: true,
      },
      {
        id: playerId,
        displayName: 'Amber Kite',
        connected: true,
        joinedAt: '2026-07-31T00:01:00.000Z',
        isController: false,
      },
    ],
    settings: {
      gridSize: 5,
      roundDurationSeconds: 120,
      scoringMode: 'length-plus-unique',
    },
    round: null,
    ...overrides,
  };
}

describe('AppShell display header', () => {
  it('exposes four equal display header regions in display order', () => {
    const { container } = render(
      <AppShell
        displayRoom={createDisplayRoom()}
        displayConnectionStatus="connected"
      >
        <p>Room</p>
      </AppShell>,
    );

    const header = container.querySelector('.site-header--display');
    expect(header?.children).toHaveLength(4);
    expect(header?.children[0]).toHaveClass('display-header__logo');
    expect(header?.children[1]).toHaveClass('display-header__host');
    expect(header?.children[2]).toHaveClass('display-header__settings-region');
    expect(header?.children[3]).toHaveClass('display-header__connection');
    expect(
      Array.from(header?.children ?? []).map((region) =>
        region.getAttribute('data-display-header-region'),
      ),
    ).toEqual(['logo', 'host', 'settings', 'connection']);
    expect(screen.getByRole('link', { name: 'Words home' })).toBeVisible();
    expect(screen.getByLabelText('Game Host')).toBeVisible();
    expect(screen.getByText('Bright Fox')).toBeVisible();
    expect(screen.getByText('5×5 • 2 minutes')).toBeVisible();
    expect(screen.getByText('Connected')).toBeVisible();
    expect(screen.queryByText('Amber Kite')).toBeNull();
  });

  it('updates the host, truncation hook, and no-host fallback from room state', () => {
    const longName = 'The exceptionally long and still authoritative Game Host';
    const { rerender } = render(
      <AppShell
        displayRoom={createDisplayRoom()}
        displayConnectionStatus="connecting"
      >
        <p>Room</p>
      </AppShell>,
    );

    rerender(
      <AppShell
        displayRoom={createDisplayRoom({
          controllerPlayerId: playerId,
          players: [
            {
              id: hostId,
              displayName: 'Bright Fox',
              connected: true,
              joinedAt: '2026-07-31T00:00:00.000Z',
              isController: false,
            },
            {
              id: playerId,
              displayName: longName,
              connected: true,
              joinedAt: '2026-07-31T00:01:00.000Z',
              isController: true,
            },
          ],
        })}
        displayConnectionStatus="connecting"
      >
        <p>Room</p>
      </AppShell>,
    );
    expect(screen.getByText(longName)).toHaveAttribute('title', longName);
    expect(screen.getByText('Reconnecting…')).toBeVisible();

    rerender(
      <AppShell
        displayRoom={createDisplayRoom({
          controllerStatus: 'none',
          controllerPlayerId: null,
          players: [],
        })}
      >
        <p>Room</p>
      </AppShell>,
    );
    expect(screen.getByText('No Game Host')).toBeVisible();
  });

  it('leaves the phone header structure unchanged', () => {
    const { container } = render(
      <AppShell phoneConnectionStatus="connected">
        <p>Room</p>
      </AppShell>,
    );

    expect(container.querySelector('.site-header')).not.toHaveClass(
      'site-header--display',
    );
    expect(container.querySelector('#phone-entry-mode-slot')).toBeVisible();
    expect(screen.getByText('Connected')).toHaveClass(
      'connection-status--phone',
    );
    expect(screen.queryByText('No Game Host')).toBeNull();
  });

  it('anchors one accessible blocked-audio key below the display header in every phase', () => {
    const enable = vi.fn(async () => undefined);
    const audio = {
      status: 'blocked' as const,
      showControl: true,
      enable,
    };
    const { container, rerender } = render(
      <AppShell displayRoom={createDisplayRoom()} displayAudio={audio}>
        <p>Lobby</p>
      </AppShell>,
    );

    const layer = container.querySelector('.display-audio-control-layer');
    expect(layer).toHaveAttribute(
      'data-display-audio-position',
      'below-header-upper-right',
    );
    expect(layer?.previousElementSibling).toHaveClass('site-header--display');
    const key = screen.getByRole('button', { name: 'Enable sound' });
    expect(key).toHaveClass('display-audio-key');
    expect(key).toHaveAttribute('title', 'Enable sound');

    for (const phase of ['ROUND_ACTIVE', 'ROUND_ENDED'] as const) {
      rerender(
        <AppShell
          displayRoom={createDisplayRoom({ phase })}
          displayAudio={audio}
        >
          <p>{phase}</p>
        </AppShell>,
      );
      expect(
        screen.getByRole('button', { name: 'Enable sound' }),
      ).toBeVisible();
    }
  });

  it('keeps the zero-height audio anchor stable and hides its key when running or on phones', () => {
    const { container, rerender } = render(
      <AppShell
        displayRoom={createDisplayRoom()}
        displayAudio={{
          status: 'running',
          showControl: false,
          enable: async () => undefined,
        }}
      >
        <p>Room</p>
      </AppShell>,
    );
    expect(
      container.querySelector('.display-audio-control-layer'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Enable sound' })).toBeNull();

    rerender(
      <AppShell phoneConnectionStatus="connected">
        <p>Phone</p>
      </AppShell>,
    );
    expect(container.querySelector('.display-audio-control-layer')).toBeNull();
  });
});
