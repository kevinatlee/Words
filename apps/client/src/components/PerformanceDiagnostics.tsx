import { useState } from 'react';

import type { ConnectionStatus, RoomState } from '@words/shared';

import type {
  LobbyClient,
  SocketPerformanceDiagnostics,
} from '../lobby-client';
import {
  readPerformanceCounters,
  type PerformanceCounterSnapshot,
} from '../performance-diagnostics';

type PerformanceDiagnosticsProps = {
  role: 'display' | 'player';
  phase: RoomState['phase'];
  isController: boolean;
  connectionStatus: ConnectionStatus;
  client: LobbyClient;
};

type DiagnosticSnapshot = {
  capturedAt: string;
  role: 'display' | 'player';
  phase: RoomState['phase'];
  isController: boolean;
  visibility: DocumentVisibilityState;
  connectionStatus: ConnectionStatus;
  counters: PerformanceCounterSnapshot;
  socket: SocketPerformanceDiagnostics;
};

const emptySocketDiagnostics = (): SocketPerformanceDiagnostics => ({
  connected: false,
  transport: 'unknown',
  connections: 0,
  reconnects: 0,
  connectionStatusTransitions: 0,
  transportUpgrades: 0,
  roomStatesReceived: 0,
  roomErrorsReceived: 0,
  enginePacketsReceived: 0,
  enginePacketsSent: 0,
});

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function formatSnapshot(snapshot: DiagnosticSnapshot): string {
  const { counters, socket } = snapshot;
  return [
    'Performance Diagnostics',
    `Captured: ${snapshot.capturedAt}`,
    `Elapsed: ${formatElapsed(counters.elapsedMilliseconds)}`,
    `Role: ${snapshot.role === 'player' ? 'Player' : 'Display'}`,
    `Phase: ${snapshot.phase}`,
    `Controller: ${snapshot.isController ? 'Yes' : 'No'}`,
    `Visibility: ${snapshot.visibility}`,
    `Connection: ${snapshot.connectionStatus}`,
    `Socket connected: ${socket.connected ? 'Yes' : 'No'}`,
    `Transport: ${socket.transport}`,
    `Connections: ${socket.connections}`,
    `Reconnects: ${socket.reconnects}`,
    `Connection-status transitions: ${socket.connectionStatusTransitions}`,
    `Transport upgrades: ${socket.transportUpgrades}`,
    `Room states received: ${socket.roomStatesReceived}`,
    `Room errors received: ${socket.roomErrorsReceived}`,
    `Room states accepted: ${counters.roomSnapshotsAccepted}`,
    `Duplicates ignored: ${counters.roomSnapshotDuplicatesIgnored}`,
    `Stale/conflicting snapshots rejected: ${counters.roomSnapshotsRejected}`,
    `App renders: ${counters.appRenders}`,
    `RoomLobby renders: ${counters.roomLobbyRenders}`,
    `LetterGrid renders: ${counters.letterGridRenders}`,
    `Engine packets received: ${socket.enginePacketsReceived}`,
    `Engine packets sent: ${socket.enginePacketsSent}`,
  ].join('\n');
}

export function PerformanceDiagnostics({
  role,
  phase,
  isController,
  connectionStatus,
  client,
}: PerformanceDiagnosticsProps) {
  const capture = (): DiagnosticSnapshot => ({
    capturedAt: new Date().toISOString(),
    role,
    phase,
    isController,
    visibility: document.visibilityState,
    connectionStatus,
    counters: readPerformanceCounters(),
    socket: client.getPerformanceDiagnostics?.() ?? emptySocketDiagnostics(),
  });
  const [snapshot, setSnapshot] = useState(capture);
  const [copyStatus, setCopyStatus] = useState('');

  const refresh = () => {
    setSnapshot(capture());
    setCopyStatus('');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatSnapshot(snapshot));
      setCopyStatus('Copied.');
    } catch {
      setCopyStatus('Copy failed. Select the diagnostic text instead.');
    }
  };

  return (
    <section
      className="panel performance-diagnostics"
      aria-labelledby="performance-diagnostics-title"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Opt-in measurement</span>
          <h2 id="performance-diagnostics-title">Performance Diagnostics</h2>
        </div>
        <div className="performance-diagnostics__actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={refresh}
          >
            Refresh Diagnostics
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => void copy()}
          >
            Copy Diagnostics
          </button>
        </div>
      </div>
      <pre aria-label="Diagnostic snapshot">{formatSnapshot(snapshot)}</pre>
      <p className="performance-diagnostics__status" role="status">
        {copyStatus}
      </p>
    </section>
  );
}
