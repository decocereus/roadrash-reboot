export class RaceAudio {
  private context: AudioContext | null = null;
  private muted = false;
  private engineOscillator: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.engineGain !== null) this.engineGain.gain.value = muted ? 0 : 0.028;
  }

  isMuted(): boolean {
    return this.muted;
  }

  unlock(): void {
    if (this.context === null) this.context = new AudioContext();
    if (this.context.state === "suspended") void this.context.resume();
    if (this.engineOscillator !== null) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = 62;
    gain.gain.value = this.muted ? 0 : 0.028;
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    this.engineOscillator = oscillator;
    this.engineGain = gain;
  }

  engine(speed: number): void {
    if (this.engineOscillator === null) return;
    this.engineOscillator.frequency.value = 52 + speed * 1.65;
  }

  private chirp(frequency: number, duration: number, type: OscillatorType): void {
    if (this.context === null || this.muted) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(80, frequency * 0.42),
      now + duration,
    );
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  attack(): void {
    this.chirp(440, 0.11, "square");
  }
  impact(): void {
    this.chirp(110, 0.18, "sawtooth");
  }
  crash(): void {
    this.chirp(72, 0.38, "triangle");
  }
  finish(): void {
    this.chirp(660, 0.28, "sine");
  }
}
