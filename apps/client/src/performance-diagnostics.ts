export type PerformanceCounterName =
  | 'appRenders'
  | 'roomLobbyRenders'
  | 'letterGridRenders'
  | 'roomSnapshotsAccepted'
  | 'roomSnapshotDuplicatesIgnored'
  | 'roomSnapshotsRejected';

export type PerformanceCounterSnapshot = Record<
  PerformanceCounterName,
  number
> & {
  elapsedMilliseconds: number;
};

const emptyCounters = (): Record<PerformanceCounterName, number> => ({
  appRenders: 0,
  roomLobbyRenders: 0,
  letterGridRenders: 0,
  roomSnapshotsAccepted: 0,
  roomSnapshotDuplicatesIgnored: 0,
  roomSnapshotsRejected: 0,
});

let initialized = false;
let enabled = false;
let startedAt = 0;
let counters = emptyCounters();

function monotonicNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

export function initializePerformanceDiagnostics(
  search = window.location.search,
): boolean {
  if (!initialized) {
    initialized = true;
    enabled = new URLSearchParams(search).get('perf') === '1';
    startedAt = monotonicNow();
  }
  return enabled;
}

export function performanceDiagnosticsEnabled(): boolean {
  return enabled;
}

export function incrementPerformanceCounter(
  counter: PerformanceCounterName,
): void {
  if (enabled) {
    counters[counter] += 1;
  }
}

export function readPerformanceCounters(): PerformanceCounterSnapshot {
  return {
    ...counters,
    elapsedMilliseconds: enabled ? Math.max(0, monotonicNow() - startedAt) : 0,
  };
}

export function resetPerformanceDiagnosticsForTests(): void {
  initialized = false;
  enabled = false;
  startedAt = 0;
  counters = emptyCounters();
}

export function enablePerformanceDiagnosticsForTests(
  startTime = monotonicNow(),
): void {
  initialized = true;
  enabled = true;
  startedAt = startTime;
  counters = emptyCounters();
}
