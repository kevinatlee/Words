import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DisplayAudioEngine,
  participantToneFrequencies,
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
  state: AudioContextState = 'suspended';
  currentTime = 10;
  readonly destination = {} as AudioDestinationNode;
  readonly oscillators: FakeOscillator[] = [];
  readonly gains: FakeGain[] = [];
  readonly resume = vi.fn(async () => {
    this.state = 'running';
  });
  readonly close = vi.fn(async () => {
    this.state = 'closed';
  });

  constructor() {
    FakeAudioContext.instances.push(this);
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
  it('exports eight stable distinct participant pitches', () => {
    expect(participantToneFrequencies).toHaveLength(8);
    expect(new Set(participantToneFrequencies)).toHaveLength(8);
    expect(participantToneFrequencies).toEqual([
      261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25,
    ]);
  });

  it('creates one lazy context and schedules no work while idle', async () => {
    const engine = new DisplayAudioEngine();
    expect(FakeAudioContext.instances).toHaveLength(0);

    expect(await engine.enable()).toBe(true);
    expect(await engine.enable()).toBe(true);
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0]!.oscillators).toHaveLength(0);
  });

  it('fails safely when browser audio construction is unavailable', async () => {
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

    await expect(engine.enable()).resolves.toBe(false);
  });

  it('uses the participant pitch with one identical subtle envelope', async () => {
    const engine = new DisplayAudioEngine();
    await engine.enable();
    engine.playAccepted(3, 0.06);
    const context = FakeAudioContext.instances[0]!;
    const oscillator = context.oscillators[0]!;
    const gain = context.gains[0]!;

    expect(oscillator.type).toBe('triangle');
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(
      392,
      10.06,
    );
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 10.06);
    expect(gain.gain.exponentialRampToValueAtTime.mock.calls[0]?.[0]).toBe(
      0.035,
    );
    expect(
      gain.gain.exponentialRampToValueAtTime.mock.calls[0]?.[1],
    ).toBeCloseTo(10.075);
    expect(gain.gain.exponentialRampToValueAtTime.mock.calls[1]?.[0]).toBe(
      0.0001,
    );
    expect(
      gain.gain.exponentialRampToValueAtTime.mock.calls[1]?.[1],
    ).toBeCloseTo(10.17);
    expect(oscillator.stop.mock.calls[0]?.[0]).toBeCloseTo(10.18);
  });

  it('cancels accepted tones before the deterministic winner phrase', async () => {
    const engine = new DisplayAudioEngine();
    await engine.enable();
    engine.playAccepted(0, 0.2);
    const context = FakeAudioContext.instances[0]!;
    const accepted = context.oscillators[0]!;

    engine.playWinnerTune();

    expect(accepted.stop).toHaveBeenCalledTimes(2);
    expect(context.oscillators).toHaveLength(5);
    expect(
      context.oscillators
        .slice(1)
        .map((oscillator) =>
          oscillator.frequency.setValueAtTime.mock.calls[0]?.slice(0, 2),
        ),
    ).toEqual([
      [523.25, 10],
      [659.25, 10.2],
      [783.99, 10.4],
      [1046.5, 10.6],
    ]);
  });

  it('releases completed nodes and closes the context on cleanup', async () => {
    const engine = new DisplayAudioEngine();
    await engine.enable();
    engine.playAccepted(1);
    const context = FakeAudioContext.instances[0]!;
    context.oscillators[0]!.finish();
    expect(context.oscillators[0]!.disconnect).toHaveBeenCalledOnce();
    expect(context.gains[0]!.disconnect).toHaveBeenCalledOnce();

    await engine.dispose();
    expect(context.close).toHaveBeenCalledOnce();
  });
});
