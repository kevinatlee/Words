import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  enablePerformanceDiagnosticsForTests,
  incrementPerformanceCounter,
  initializePerformanceDiagnostics,
  performanceDiagnosticsEnabled,
  readPerformanceCounters,
  resetPerformanceDiagnosticsForTests,
} from './performance-diagnostics';

beforeEach(() => {
  resetPerformanceDiagnosticsForTests();
  vi.restoreAllMocks();
});

describe('performance diagnostic counters', () => {
  it('activates only for the initial perf=1 query and survives later navigation', () => {
    expect(initializePerformanceDiagnostics('?perf=1')).toBe(true);
    expect(initializePerformanceDiagnostics('')).toBe(true);
    expect(performanceDiagnosticsEnabled()).toBe(true);
  });

  it('is a no-op when diagnostics are disabled', () => {
    initializePerformanceDiagnostics('');
    incrementPerformanceCounter('appRenders');
    expect(readPerformanceCounters().appRenders).toBe(0);
  });

  it('increments without scheduling refresh work', () => {
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const timeout = vi.spyOn(window, 'setTimeout');
    const interval = vi.spyOn(window, 'setInterval');
    const animationFrame = vi.spyOn(window, 'requestAnimationFrame');
    enablePerformanceDiagnosticsForTests(now);

    incrementPerformanceCounter('appRenders');
    incrementPerformanceCounter('roomLobbyRenders');
    incrementPerformanceCounter('letterGridRenders');
    now += 600_000;

    expect(readPerformanceCounters()).toMatchObject({
      elapsedMilliseconds: 600_000,
      appRenders: 1,
      roomLobbyRenders: 1,
      letterGridRenders: 1,
    });
    expect(timeout).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(animationFrame).not.toHaveBeenCalled();
  });
});
