/**
 * Procedural Web Audio engine — no external assets.
 * Everything is synthesised: laser hum, sizzle, overheat alarm,
 * venting hiss and the big bass-drop finale.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  // sustained laser voices
  private humOsc: OscillatorNode | null = null;
  private humSub: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private sizzleSrc: AudioBufferSourceNode | null = null;
  private sizzleGain: GainNode | null = null;
  private sizzleFilter: BiquadFilterNode | null = null;

  private started = false;
  private wantBeam = false;
  muted = false;

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.85;
    master.connect(ctx.destination);
    this.master = master;

    // pink-ish noise buffer
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099;
      b1 = 0.963 * b1 + w * 0.2965;
      b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.28;
    }
    this.noiseBuf = buf;
    if (this.wantBeam) this.startBeam();
  }

  private now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.now());
      this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.now(), 0.05);
    }
  }

  /* -------------------------------------------------- sustained beam */
  startBeam() {
    this.wantBeam = true;
    const ctx = this.ctx;
    if (!ctx || !this.master || this.started) return;
    this.started = true;

    const humGain = ctx.createGain();
    humGain.gain.value = 0;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 900;
    humGain.connect(humFilter).connect(this.master);

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 58;
    const sub = ctx.createOscillator();
    sub.type = "square";
    sub.frequency.value = 29;
    const subG = ctx.createGain();
    subG.gain.value = 0.4;
    osc.connect(humGain);
    sub.connect(subG).connect(humGain);
    osc.start();
    sub.start();
    this.humOsc = osc;
    this.humSub = sub;
    this.humGain = humGain;

    if (this.noiseBuf) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = 2600;
      filt.Q.value = 1.1;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(filt).connect(g).connect(this.master);
      src.start();
      this.sizzleSrc = src;
      this.sizzleGain = g;
      this.sizzleFilter = filt;
    }
  }

  /** Called each frame while the arena is live. */
  updateBeam(firing: boolean, heat01: number) {
    if (!this.ctx) return;
    const t = this.now();
    if (this.humGain) {
      this.humGain.gain.setTargetAtTime(firing ? 0.16 : 0.0, t, 0.05);
    }
    if (this.humOsc) {
      this.humOsc.frequency.setTargetAtTime(52 + heat01 * 42, t, 0.12);
    }
    if (this.sizzleGain) {
      this.sizzleGain.gain.setTargetAtTime(firing ? 0.05 + heat01 * 0.09 : 0, t, 0.05);
    }
    if (this.sizzleFilter) {
      this.sizzleFilter.frequency.setTargetAtTime(1800 + heat01 * 4200, t, 0.1);
    }
  }

  stopBeam() {
    this.wantBeam = false;
    if (!this.ctx) return;
    this.updateBeam(false, 0);
    try {
      this.humOsc?.stop(this.now() + 0.3);
      this.humSub?.stop(this.now() + 0.3);
      this.sizzleSrc?.stop(this.now() + 0.3);
    } catch {
      /* already stopped */
    }
    this.humOsc = null;
    this.humSub = null;
    this.sizzleSrc = null;
    this.started = false;
  }

  /* -------------------------------------------------- one-shots */
  private blip(freq: number, dur: number, type: OscillatorType, gain: number, sweepTo?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = this.now();
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (sweepTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, gain: number, from: number, to: number, type: BiquadFilterType = "lowpass") {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t = this.now();
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  uiClick() {
    this.blip(760, 0.09, "square", 0.08, 1400);
  }
  uiHover() {
    this.blip(1100, 0.04, "sine", 0.03);
  }
  countBlip(final = false) {
    if (final) {
      this.blip(180, 0.5, "sawtooth", 0.2, 900);
      this.noiseBurst(0.45, 0.18, 400, 6000, "bandpass");
    } else {
      this.blip(520, 0.18, "square", 0.11, 320);
    }
  }
  alarm(fast: boolean) {
    this.blip(fast ? 1500 : 1180, 0.07, "square", 0.075);
  }
  vent() {
    this.noiseBurst(1.1, 0.34, 7000, 240);
    this.blip(300, 0.35, "sawtooth", 0.1, 60);
  }
  coreHit(intensity: number) {
    this.blip(90 + Math.random() * 40, 0.09, "triangle", 0.05 * intensity, 40);
  }
  /** meter filled — bright ascending chime */
  ready() {
    [0, 0.07, 0.14].forEach((d, i) => window.setTimeout(() => this.blip(660 * Math.pow(1.26, i), 0.22, "triangle", 0.1), d * 1000));
  }
  /** the big unchained blast */
  overcharge() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = this.now();
    // rising riser
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.42);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + 0.42);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.8);
    // sub thump
    this.blip(150, 0.8, "sine", 0.4, 40);
    this.noiseBurst(0.7, 0.24, 300, 9000, "bandpass");
  }
  /** support node absorbed */
  nodePing(up: boolean) {
    this.blip(up ? 900 : 500, 0.18, "sine", 0.07, up ? 1500 : 300);
  }
  callout() {
    this.blip(320, 0.14, "square", 0.05, 560);
  }
  shieldPing() {
    this.blip(1320, 0.22, "sine", 0.06, 620);
  }
  anomaly() {
    this.blip(140, 0.6, "sine", 0.09, 700);
  }
  boom(win: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = this.now();
    // bass drop
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(win ? 220 : 160, t);
    o.frequency.exponentialRampToValueAtTime(26, t + 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    const dist = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 2.6);
    }
    dist.curve = curve;
    o.connect(dist).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 2);
    // debris
    this.noiseBurst(1.6, 0.4, 9000, 120);
    if (win) {
      [0, 0.09, 0.18].forEach((d, i) =>
        window.setTimeout(() => this.blip(440 * Math.pow(1.26, i), 0.5, "triangle", 0.12, 220), d * 1000),
      );
    } else {
      this.blip(140, 1.2, "sawtooth", 0.14, 34);
    }
  }

  dispose() {
    this.stopBeam();
    try {
      void this.ctx?.close();
    } catch {
      /* noop */
    }
    this.ctx = null;
    this.master = null;
  }
}

export const audio = new AudioEngine();
