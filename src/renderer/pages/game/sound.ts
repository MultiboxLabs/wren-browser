// Every sound is synthesized: a wren's song is fast, high chirps.
export class Sound {
  private context: AudioContext | null = null;
  muted = false;

  // Audio may start only after the player has done something.
  wake() {
    this.context ??= new AudioContext();
    void this.context.resume();
  }

  private tone(from: number, to: number, start: number, duration: number, type: OscillatorType = "sine", volume = 0.12) {
    const context = this.context;
    if (!context || this.muted) return;
    const time = context.currentTime + start;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, time);
    oscillator.frequency.exponentialRampToValueAtTime(to, time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  twig() {
    this.tone(2600, 3400, 0, 0.07);
  }

  berry() {
    this.tone(2200, 3000, 0, 0.06);
    this.tone(3000, 3900, 0.08, 0.08);
  }

  hit() {
    this.tone(240, 70, 0, 0.25, "triangle", 0.3);
  }

  // A rising and falling trill, for an egg.
  trill() {
    for (let i = 0; i < 12; i++) {
      const pitch = 2900 + Math.sin(i * 0.8) * 700;
      this.tone(pitch, pitch * 1.15, i * 0.05, 0.04, "sine", 0.08);
    }
  }

  over() {
    this.tone(1200, 500, 0, 0.3);
    this.tone(900, 300, 0.32, 0.5);
  }
}
