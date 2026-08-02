export const participantToneFrequencies = [
  261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25,
] as const;

export const displayAudioLevels = Object.freeze({
  acceptedPeak: 0.08,
  acceptedAccentPeak: 0.05,
  winnerPeak: 0.1,
  winnerChordPeak: 0.05,
});

export const acceptedChime = Object.freeze({
  intervalRatio: 1.5,
  accentDelaySeconds: 0.05,
  rootDurationSeconds: 0.13,
  accentDurationSeconds: 0.12,
});

export const winnerTuneNotes = Object.freeze([
  { frequency: 523.25, delaySeconds: 0, durationSeconds: 0.3, gain: 0.1 },
  { frequency: 659.25, delaySeconds: 0.16, durationSeconds: 0.3, gain: 0.1 },
  { frequency: 783.99, delaySeconds: 0.32, durationSeconds: 0.32, gain: 0.1 },
  { frequency: 1046.5, delaySeconds: 0.5, durationSeconds: 0.36, gain: 0.1 },
  { frequency: 1046.5, delaySeconds: 0.74, durationSeconds: 0.42, gain: 0.05 },
  { frequency: 1318.51, delaySeconds: 0.74, durationSeconds: 0.42, gain: 0.05 },
  { frequency: 1567.98, delaySeconds: 0.74, durationSeconds: 0.42, gain: 0.05 },
]);

export type DisplayAudioStatus =
  'checking' | 'blocked' | 'running' | 'unsupported' | 'suspended';

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

type StatusListener = (status: DisplayAudioStatus) => void;

export class DisplayAudioEngine {
  private context: AudioContext | null = null;
  private status: DisplayAudioStatus = 'checking';
  private hasRun = false;
  private enablePromise: Promise<DisplayAudioStatus> | null = null;
  private readonly listeners = new Set<StatusListener>();
  private readonly activeAcceptedNodes = new Set<OscillatorNode>();

  private readonly handleStateChange = (): void => {
    this.synchronizeStatus();
  };

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  getStatus(): DisplayAudioStatus {
    return this.status;
  }

  enable(): Promise<DisplayAudioStatus> {
    if (this.enablePromise) return this.enablePromise;
    const attempt = this.attemptEnable();
    this.enablePromise = attempt;
    void attempt.finally(() => {
      if (this.enablePromise === attempt) this.enablePromise = null;
    });
    return attempt;
  }

  private async attemptEnable(): Promise<DisplayAudioStatus> {
    const AudioContextConstructor =
      window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!AudioContextConstructor) {
      this.setStatus('unsupported');
      return this.status;
    }

    try {
      if (!this.context) {
        this.context = new AudioContextConstructor();
        this.context.addEventListener('statechange', this.handleStateChange);
        this.synchronizeStatus();
      }
      if (this.context.state !== 'running') await this.context.resume();
      this.synchronizeStatus();
    } catch {
      if (!this.context) this.setStatus('unsupported');
      else this.synchronizeStatus();
    }
    return this.status;
  }

  private synchronizeStatus(): void {
    const contextState = this.context?.state;
    if (contextState === 'running') {
      this.hasRun = true;
      this.setStatus('running');
    } else if (contextState === 'closed') {
      this.setStatus('unsupported');
    } else {
      this.setStatus(this.hasRun ? 'suspended' : 'blocked');
    }
  }

  private setStatus(status: DisplayAudioStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.listeners.forEach((listener) => listener(status));
  }

  playAccepted(participantIndex: number, delaySeconds = 0): void {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    const root = participantToneFrequencies[participantIndex];
    if (!root) return;
    const start = context.currentTime + delaySeconds;
    this.scheduleNote(
      root,
      start,
      acceptedChime.rootDurationSeconds,
      displayAudioLevels.acceptedPeak,
      'triangle',
      true,
    );
    this.scheduleNote(
      root * acceptedChime.intervalRatio,
      start + acceptedChime.accentDelaySeconds,
      acceptedChime.accentDurationSeconds,
      displayAudioLevels.acceptedAccentPeak,
      'sine',
      true,
    );
  }

  playWinnerTune(): void {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    this.stopAcceptedTones();
    const start = context.currentTime;
    winnerTuneNotes.forEach((note, index) => {
      this.scheduleNote(
        note.frequency,
        start + note.delaySeconds,
        note.durationSeconds,
        note.gain,
        index < 4 ? 'triangle' : 'sine',
        false,
      );
    });
  }

  cancelAcceptedTones(): void {
    this.stopAcceptedTones();
  }

  private scheduleNote(
    frequency: number,
    start: number,
    duration: number,
    volume: number,
    oscillatorType: OscillatorType,
    acceptedTone: boolean,
  ): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = oscillatorType;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    if (acceptedTone) this.activeAcceptedNodes.add(oscillator);
    oscillator.addEventListener(
      'ended',
      () => {
        this.activeAcceptedNodes.delete(oscillator);
        oscillator.disconnect();
        gain.disconnect();
      },
      { once: true },
    );
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }

  private stopAcceptedTones(): void {
    this.activeAcceptedNodes.forEach((oscillator) => {
      try {
        oscillator.stop();
      } catch {
        // A tone that already ended needs no further cleanup.
      }
    });
    this.activeAcceptedNodes.clear();
  }

  async dispose(): Promise<void> {
    this.stopAcceptedTones();
    const context = this.context;
    this.context = null;
    if (context) {
      context.removeEventListener('statechange', this.handleStateChange);
    }
    this.listeners.clear();
    if (context && context.state !== 'closed') {
      try {
        await context.close();
      } catch {
        // Audio cleanup must never interrupt display-session teardown.
      }
    }
  }
}
