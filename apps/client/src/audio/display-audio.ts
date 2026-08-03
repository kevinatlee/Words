export const participantToneFrequencies = [
  261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25,
] as const;

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

export class DisplayAudioEngine {
  private context: AudioContext | null = null;
  private readonly activeAcceptedNodes = new Set<OscillatorNode>();

  async enable(): Promise<boolean> {
    const AudioContextConstructor =
      window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!AudioContextConstructor) return false;
    try {
      this.context ??= new AudioContextConstructor();
      await this.context.resume();
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  playAccepted(participantIndex: number, delaySeconds = 0): void {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    const frequency = participantToneFrequencies[participantIndex];
    if (!frequency) return;
    this.scheduleNote(
      frequency,
      context.currentTime + delaySeconds,
      0.11,
      0.035,
      true,
    );
  }

  playWinnerTune(): void {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    this.stopAcceptedTones();
    const start = context.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      this.scheduleNote(frequency, start + index * 0.2, 0.32, 0.045, false);
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
    acceptedTone: boolean,
  ): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
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
    if (context && context.state !== 'closed') {
      try {
        await context.close();
      } catch {
        // Audio cleanup must never interrupt room teardown.
      }
    }
  }
}
