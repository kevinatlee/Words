import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LobbyClient } from '../lobby-client';
import {
  enablePerformanceDiagnosticsForTests,
  incrementPerformanceCounter,
  resetPerformanceDiagnosticsForTests,
} from '../performance-diagnostics';
import { PerformanceDiagnostics } from './PerformanceDiagnostics';

let now: number;

beforeEach(() => {
  now = 1_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  enablePerformanceDiagnosticsForTests(now);
});

afterEach(() => {
  resetPerformanceDiagnosticsForTests();
  vi.restoreAllMocks();
});

describe('PerformanceDiagnostics', () => {
  it('stays static until explicitly refreshed and exposes no sensitive data', () => {
    const interval = vi.spyOn(window, 'setInterval');
    const animationFrame = vi.spyOn(window, 'requestAnimationFrame');
    const client = {
      getPerformanceDiagnostics: () => ({
        connected: true,
        transport: 'polling',
        connections: 1,
        reconnects: 0,
        connectionStatusTransitions: 1,
        transportUpgrades: 0,
        roomStatesReceived: 2,
        roomErrorsReceived: 0,
        enginePacketsReceived: 7,
        enginePacketsSent: 4,
      }),
    } as LobbyClient;
    incrementPerformanceCounter('appRenders');

    render(
      <PerformanceDiagnostics
        role="player"
        phase="LOBBY"
        isController
        connectionStatus="connected"
        client={client}
      />,
    );

    const snapshot = screen.getByLabelText('Diagnostic snapshot');
    expect(snapshot).toHaveTextContent('Elapsed: 0m 00s');
    expect(snapshot).toHaveTextContent('Transport: polling');
    expect(snapshot).toHaveTextContent('Controller: Yes');
    expect(snapshot).not.toHaveTextContent('ABC234');
    expect(snapshot).not.toHaveTextContent('token');

    now += 600_000;
    incrementPerformanceCounter('roomLobbyRenders');
    expect(snapshot).toHaveTextContent('Elapsed: 0m 00s');
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh Diagnostics' }),
    );
    expect(snapshot).toHaveTextContent('Elapsed: 10m 00s');
    expect(snapshot).toHaveTextContent('RoomLobby renders: 1');
    expect(interval).not.toHaveBeenCalled();
    expect(animationFrame).not.toHaveBeenCalled();
  });
});
