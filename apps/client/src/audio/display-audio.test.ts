import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acceptedChime,
  displayAudioLevels,
  DisplayAudioEngine,
  participantToneFrequencies,
  winnerTuneNotes,
} from './display-audio';

class FakeAudioParam {
  readonly setValueAtTime = vi.fn();
  readonly exponentialRampToValueAtTime = vi.fn();
}

class FakeOscillator {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam();
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly start = vi.fn();
  readonly stop = vi.fn();
  private ended: (() => void) | null = null;

  addEventListener(
    _type: string,
    listener: EventListenerOrEventListenerObject,
  ) {
    this.ended = () => {
      if (typeof listener === 'function') listener(new Event('ended'));
      else listener.handleEvent(new Event('ended'));
    };
  }

  finish() {
    this.ended?.();
  }
}

class FakeGain {
  readonly gain = new FakeAudioParam();
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static resumeBehavior: 'run' | 'block' | 'reject' = 'run';
  state: AudioContextState = 'suspended';
  currentTime = 10;
  readonly destination = {} as AudioDestinationNode;
  readonly oscillators: FakeOscillator[] = [];
  readonly gains: FakeGain[] = [];
  private readonly stateListeners =
    new Set<EventListenerOrEventListenerObject>();
  readonly resume = vi.fn(async () => {
    if (FakeAudioContext.resumeBehavior === 'reject') {
      throw new Error('Blocked by browser policy.');
    }
    if (FakeAudioContext.resumeBehavior === 'run') this.setState('running');
  });
  readonly close = vi.fn(async () => {
    this.setState('closed');
  });
  readonly addEventListener = vi.fn(
    (_type: string, listener: EventListenerOrEventListenerObject) => {
      this.stateListeners.add(listener);
    },
  );
  readonly removeEventListener = vi.fn(
    (_type: string, listener: EventListenerOrEventListenerObject) => {
      this.stateListeners.delete(listener);
    },
  );

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  setState(state: AudioContextState) {
    this.state = state;
    this.stateListeners.forEach((listener) => {
      const event = new Event('statechange');
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    });
  }

  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator as unknown as OscillatorNode;
  }

  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }
}

let originalAudioContext: PropertyDescriptor | undefined;

beforeEach(() => {
  FakeAudioContext.instances = [];
  FakeAudioContext.resumeBehavior = 'run';
  originalAudioContext = Object.getOwnPropertyDescriptor(
    window,
    'AudioContext',
  );
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: FakeAudioContext,
  });
});

afterEach(() => {
  if (originalAudioContext) {
    Object.defineProperty(window, 'AudioContext', originalAudioContext);
  } else {
    Reflect.deleteProperty(window, 'AudioContext');
  }
  vi.restoreAllMocks();
});

describe('DisplayAudioEngine', () => {
  it('exports eight stable roots and centralized physical-test levels', () => {
    expect(participantToneFrequencies).toEqual([
      261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25,
    ]);
    expect(new Set(participantToneFrequencies)).toHaveLength(8);
    expect(displayAudioLevels).toEqual({
      acceptedPeak: 0.08,
      acceptedAccentPeak: 0.05,
      winnerPeak: 0.1,
      winnerChordPeak: 0.05,
    });
  });

  it('creates and resumes exactly one context across repeated enable attempts', async () => {
    const engine = new DisplayAudioEngine();
    expect(FakeAudioContext.instances).toHaveLength(0);

    await expect(engine.enable()).resolves.toBe('running');
    await expect(engine.enable()).resolves.toBe('running');
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0]!.resume).toHaveBeenCalledOnce();
  });

  it('reports blocked, remains retryable, and follows later state suspension', async () => {
    FakeAudioContext.resumeBehavior = 'block';
    const engine = new DisplayAudioEngine();
    const statuses: string[] = [];
    engine.subscribe((status) => statuses.push(status));

    await expect(engine.enable()).resolves.toBe('blocked');
    FakeAudioContext.resumeBehavior = 'run';
    await expect(engine.enable()).resolves.toBe('running');
    FakeAudioContext.instances[0]!.setState('suspended');

    expect(statuses).toEqual(['checking', 'blocked', 'running', 'suspended']);
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('fails safely when Web Audio construction is unavailable', async () => {
    class UnavailableAudioContext {
      constructor() {
        throw new Error('Audio is unavailable.');
      }
    }
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: UnavailableAudioContext,
    });
    const engine = new DisplayAudioEngine();

    await expect(engine.enable()).resolves.toBe('unsupported');
  });

  it('schedules a brighter two-part fifth chime with safe envelopes', async () => {
    const engine = new DisplayAudioEngine();
    await engine.enable();
    engine.playAccepted(3, 0.09);
    const context = FakeAudioContext.instances[0]!;

    expect(context.oscillators).toHaveLength(2);
    expect(context.oscillators.map((oscillator) => oscillator.type)).toEqual([
      'triangle',
      'sine',
    ]);
    expect(
      context.oscillators.map(
        (oscillator) => oscillator.frequency.setValueAtTime.mock.calls[0],
      ),
    ).toEqual([
      [392, 10.09],
      [392 * acceptedChime.intervalRatio, 10.14],
    ]);
    expect(
      context.gains.map(
        (gain) => gain.gain.exponentialRampToValueAtTime.mock.calls[0]?.[0],
      ),
    ).toEqual([
      displayAudioLevels.acceptedPeak,
      displayAudioLevels.acceptedAccentPeak,
    ]);
    expect(context.oscillators[1]!.stop.mock.calls[0]?.[0]).toBeCloseTo(10.27);
  });

  it('cancels accepted chimes before a resolved rising winner phrase', async () => {
    const engine = new DisplayAudioEngine();
    await engine.enable();
    engine.playAccepted(0, 0.2);
    const context = FakeAudioContext.instances[0]!;
    const accepted = [...context.oscillators];

    engine.playWinnerTune();

    accepted.forEach((oscillator) =>
      expect(oscillator.stop).toHaveBeenCalledTimes(2),
    );
    expect(context.oscillators).toHaveLength(2 + winnerTuneNotes.length);
    expect(
      context.oscillators
        .slice(2)
        .map((oscillator) => oscillator.frequency.setValueAtTime.mock.calls[0]),
    ).toEqual(
      winnerTuneNotes.map((note) => [note.frequency, 10 + note.delaySeconds]),
    );
    expect(Math.max(...winnerTuneNotes.map((note) => note.gain))).toBe(
      displayAudioLevels.winnerPeak,
    );
    expect(winnerTuneNotes.slice(-3).map((note) => note.delaySeconds)).toEqual([
      0.74, 0.74, 0.74,
    ]);
  });

  it('releases completed nodes, state listeners, and the context once', async () => {
    const engine = new DisplayAudioEngine();
    await engine.enable();
    engine.playAccepted(1);
    const context = FakeAudioContext.instances[0]!;
    context.oscillators.forEach((oscillator) => oscillator.finish());
    expect(
      context.oscillators.every(
        (oscillator) => oscillator.disconnect.mock.calls.length === 1,
      ),
    ).toBe(true);
    expect(
      context.gains.every((gain) => gain.disconnect.mock.calls.length === 1),
    ).toBe(true);

    await engine.dispose();
    await engine.dispose();
    expect(context.removeEventListener).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });
});
