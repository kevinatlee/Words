import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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

function createActiveDisplayRoom(): RoomState {
  const room = createDisplayRoom();
  return {
    ...room,
    phase: 'ROUND_ACTIVE',
    round: {
      id: '00000000-0000-4000-8000-000000000100',
      number: 1,
      settings: room.settings,
      board: { size: 5, tiles: Array.from({ length: 25 }, () => 'A') },
      participants: [{ playerId: hostId, displayName: 'Bright Fox' }],
      acceptedWordCounts: [{ playerId: hostId, count: 0 }],
      startedAt: '2026-07-31T00:00:00.000Z',
      deadlineAt: '2026-07-31T00:02:00.000Z',
      endedAt: null,
      results: null,
      generationAttempts: 1,
    },
  };
}

describe('AppShell display header', () => {
  it('keeps an empty center slot in the five-region lobby display header', () => {
    const { container } = render(
      <AppShell
        displayRoom={createDisplayRoom()}
        displayConnectionStatus="connected"
      >
        <p>Room</p>
      </AppShell>,
    );

    const header = container.querySelector('.site-header--display');
    expect(header?.children).toHaveLength(5);
    expect(header?.children[0]).toHaveClass('display-header__logo');
    expect(header?.children[1]).toHaveClass('display-header__host');
    expect(header?.children[2]).toHaveClass('display-header__qr');
    expect(header?.children[3]).toHaveClass('display-header__settings-region');
    expect(header?.children[4]).toHaveClass('display-header__connection');
    expect(
      Array.from(header?.children ?? []).map((region) =>
        region.getAttribute('data-display-header-region'),
      ),
    ).toEqual(['logo', 'host', 'qr', 'settings', 'connection']);
    expect(screen.queryByLabelText('Scan to join room ABC234')).toBeNull();
    expect(screen.getByRole('link', { name: 'Words home' })).toBeVisible();
    expect(screen.getByLabelText('Game Host')).toBeVisible();
    expect(screen.getByText('Bright Fox')).toBeVisible();
    expect(screen.getByText('5×5 • 2 minutes')).toBeVisible();
    expect(screen.getByText('Connected')).toBeVisible();
    expect(screen.queryByText('Amber Kite')).toBeNull();
  });

  it('renders the direct join QR as the center child only for an active display', () => {
    const { container, rerender } = render(
      <AppShell
        displayRoom={createActiveDisplayRoom()}
        displayConnectionStatus="disconnected"
      >
        <p>Room</p>
      </AppShell>,
    );

    const header = container.querySelector('.site-header--display');
    expect(header?.children[2]).toHaveAttribute(
      'data-display-header-region',
      'qr',
    );
    expect(screen.getByLabelText('Scan to join room ABC234')).toBeVisible();
    expect(screen.getByText('5×5 • 2 minutes')).toBeVisible();
    expect(screen.getByText('Disconnected')).toBeVisible();

    rerender(
      <AppShell
        displayRoom={createDisplayRoom({ phase: 'ROUND_ENDED' })}
        displayConnectionStatus="connected"
      >
        <p>Results</p>
      </AppShell>,
    );
    expect(screen.queryByLabelText('Scan to join room ABC234')).toBeNull();
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
    expect(container.querySelector('.display-header__qr')).toBeNull();
  });
});
