// Every sound in Twig & Trill is made here, as it plays: wren chirps and
// trills, the wind, the weather, and a quiet music-box tune that changes
// key as the day goes on.

// What the game's logic asks to hear. The logic runs without sound too, so
// it only knows this.
export interface Sounds {
  pickup(count: number): void;
  deliver(streak: number): void;
  egg(): void;
  hit(): void;
  hailTick(): void;
  berry(): void;
  bug(): void;
  sing(): void;
  denied(): void;
  magpie(): void;
  steal(): void;
  gust(): void;
  thunder(): void;
  land(): void;
  over(): void;
  win(): void;
}

// Hertz of a note, by semitones from A4.
const note = (semitones: number) => 440 * Math.pow(2, semitones / 12);

// The tune's scale through the day, as semitones from A4: bright in the
// morning, warmer in the afternoon, minor from dusk.
const SCALES = [
  [3, 5, 7, 10, 12, 15, 17, 19],
  [3, 5, 7, 10, 12, 15, 17, 19],
  [-4, -2, 0, 3, 5, 8, 10, 12],
  [0, 3, 5, 7, 10, 12, 15, 17],
  [-2, 0, 3, 5, 7, 10, 12, 15]
];
const BEAT = 60 / 88 / 2;

interface Tune {
  timer: number;
  next: number;
  step: number;
  degree: number;
  stage: number;
}

export class Sound implements Sounds {
  private context: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private musicBus!: GainNode;
  private lastTick = 0;
  private muted = false;
  private tune: Tune | null = null;

  // Sound may start only once the player has done something.
  wake() {
    if (!this.context) this.build();
    void this.context!.resume();
  }

  private build() {
    const context = new AudioContext();
    this.context = context;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    this.master = context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(compressor).connect(context.destination);

    this.noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

    // The wind never stops; only its loudness and pitch follow the weather.
    const wind = context.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    this.windFilter = context.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.Q.value = 0.7;
    this.windGain = context.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();

    // The tune rings on through a soft echo.
    this.musicBus = context.createGain();
    this.musicBus.gain.value = 0.5;
    const echo = context.createDelay(1);
    echo.delayTime.value = BEAT * 3;
    const feedback = context.createGain();
    feedback.gain.value = 0.32;
    const tone = context.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2400;
    this.musicBus.connect(this.master);
    this.musicBus.connect(echo);
    echo.connect(tone).connect(feedback).connect(echo);
    tone.connect(this.master);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.context.currentTime, 0.05);
  }

  // How hard the wind blows now, in the world's units: louder and higher in a gust.
  setWind(wind: number) {
    if (!this.context) return;
    const strength = Math.min(1, Math.abs(wind) / 220);
    const now = this.context.currentTime;
    this.windGain.gain.setTargetAtTime(0.015 + strength * 0.16, now, 0.25);
    this.windFilter.frequency.setTargetAtTime(280 + strength * 900, now, 0.25);
  }

  // The tune plays while a game is on, in `stage`'s key.
  music(on: boolean, stage = 0) {
    if (!this.context) return;
    if (!on) {
      if (this.tune) clearInterval(this.tune.timer);
      this.tune = null;
      return;
    }
    if (this.tune) {
      this.tune.stage = stage;
      return;
    }
    const tune: Tune = { timer: 0, next: this.context.currentTime + 0.1, step: 0, degree: 3, stage };
    tune.timer = window.setInterval(() => this.schedule(tune), 100);
    this.tune = tune;
  }

  // Plays the tune's next notes a little ahead, so a slow frame never skips one.
  private schedule(tune: Tune) {
    const context = this.context!;
    const scale = SCALES[Math.min(tune.stage, SCALES.length - 1)];
    while (tune.next < context.currentTime + 0.4) {
      const time = Math.max(0, tune.next - context.currentTime);
      if (tune.step % 8 === 0) this.bell(note(scale[0] - 24), time, 1.6, 0.05);
      if (tune.step % 8 === 4) this.bell(note(scale[2] - 24), time, 1.2, 0.035);
      if (Math.random() < (tune.step % 2 ? 0.35 : 0.7)) {
        const leap = [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)];
        tune.degree = Math.max(0, Math.min(scale.length - 1, tune.degree + leap));
        this.bell(note(scale[tune.degree]), time, 0.9, 0.045);
      }
      tune.step++;
      tune.next += BEAT;
    }
  }

  // A music-box note: a sine with a faint overtone, struck and left to ring.
  private bell(frequency: number, start: number, length: number, volume: number) {
    this.tone(frequency, frequency, start, length, "sine", volume, this.musicBus, 0.005);
    this.tone(frequency * 2, frequency * 2, start, length * 0.5, "triangle", volume * 0.25, this.musicBus, 0.005);
  }

  private tone(
    from: number,
    to: number,
    start: number,
    length: number,
    type: OscillatorType = "sine",
    volume = 0.1,
    out?: AudioNode,
    attack = 0.008
  ) {
    const context = this.context;
    if (!context) return;
    const time = context.currentTime + start;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, time);
    if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, time + length);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    oscillator.connect(gain).connect(out ?? this.master);
    oscillator.start(time);
    oscillator.stop(time + length + 0.05);
  }

  // A wren's note: a quick sweep, high and bright.
  private chirp(from: number, to: number, start: number, length: number, volume = 0.07) {
    this.tone(from, to, start, length, "sine", volume, undefined, 0.006);
  }

  private hiss(start: number, length: number, volume: number, filter: BiquadFilterType, from: number, to = from) {
    const context = this.context;
    if (!context) return;
    const time = context.currentTime + start;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const shape = context.createBiquadFilter();
    shape.type = filter;
    shape.frequency.setValueAtTime(from, time);
    if (to !== from) shape.frequency.exponentialRampToValueAtTime(to, time + length);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + Math.min(0.08, length / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    source.connect(shape).connect(gain).connect(this.master);
    source.start(time, Math.random());
    source.stop(time + length + 0.05);
  }

  pickup(count: number) {
    const pitch = 2300 + count * 380;
    this.chirp(pitch, pitch * 1.25, 0, 0.06);
  }

  // Three rising notes, starting higher the longer the streak.
  deliver(streak: number) {
    const scale = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
    const from = Math.min(streak - 1, scale.length - 3);
    for (let i = 0; i < 3; i++) this.bell(note(scale[from + i] + 12), i * 0.07, 0.6, 0.09);
    this.chirp(3200, 3900, 0.2, 0.05, 0.05);
  }

  egg() {
    [0, 4, 7, 12, 16].forEach((step, i) => this.bell(note(step + 3), i * 0.09, 1.2, 0.08));
    for (let i = 0; i < 14; i++) {
      const pitch = 3000 + Math.sin(i * 0.9) * 600;
      this.chirp(pitch, pitch * 1.1, 0.5 + i * 0.045, 0.04, 0.05);
    }
  }

  hit() {
    this.tone(200, 60, 0, 0.3, "triangle", 0.35);
    this.hiss(0, 0.25, 0.25, "lowpass", 1400, 300);
    this.chirp(2400, 1600, 0.05, 0.12, 0.06);
  }

  // Hail on leaves and grass: a tick, never more than one at a time.
  hailTick() {
    const now = this.context?.currentTime ?? 0;
    if (now - this.lastTick < 0.05) return;
    this.lastTick = now;
    this.hiss(0, 0.03, 0.05, "highpass", 3500);
  }

  berry() {
    this.tone(600, 900, 0, 0.08, "sine", 0.12);
    this.tone(900, 1350, 0.08, 0.1, "sine", 0.1);
  }

  bug() {
    [24, 28, 31].forEach((step, i) => this.bell(note(step), i * 0.05, 0.4, 0.06));
  }

  // The wren's song: phrases of fast trills, rising and falling, as a real
  // one sings from a hedge.
  sing() {
    let time = 0;
    const phrases: [number, number, number][] = [
      [3600, 4200, 9],
      [2800, 3400, 12],
      [4200, 3000, 10],
      [3300, 4600, 8]
    ];
    for (const [from, to, notes] of phrases) {
      for (let i = 0; i < notes; i++) {
        const pitch = from + ((to - from) * i) / notes;
        this.chirp(pitch, pitch * 1.12, time, 0.035, 0.08);
        time += 0.042;
      }
      time += 0.06;
    }
    this.bell(note(15), 0, 1.6, 0.06);
  }

  denied() {
    this.tone(320, 240, 0, 0.12, "triangle", 0.08);
  }

  // A magpie's rattle: "chack-chack".
  magpie() {
    for (let i = 0; i < 2; i++) {
      this.tone(760, 520, i * 0.12, 0.07, "square", 0.04);
      this.hiss(i * 0.12, 0.07, 0.12, "bandpass", 1800);
    }
  }

  steal() {
    this.magpie();
    this.tone(900, 300, 0.25, 0.3, "triangle", 0.08);
  }

  gust() {
    this.hiss(0, 1.4, 0.18, "bandpass", 300, 1100);
  }

  thunder() {
    this.hiss(0.25, 2.8, 0.45, "lowpass", 220, 70);
    this.tone(70, 40, 0.25, 1.6, "sine", 0.25);
  }

  land() {
    this.tone(260, 160, 0, 0.05, "sine", 0.04);
  }

  over() {
    [7, 3, 0, -5].forEach((step, i) => this.bell(note(step), i * 0.22, 1.1, 0.09));
  }

  win() {
    [0, 4, 7, 12, 7, 12, 16, 19].forEach((step, i) => this.bell(note(step + 3), i * 0.13, 1.4, 0.08));
    this.sing();
  }
}
