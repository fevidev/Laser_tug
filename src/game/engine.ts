import { audio } from "./audio";
import {
  ARENAS,
  DIFFICULTIES,
  THEMES,
  TUNING,
  hexToRgba,
  type ArenaConfig,
  type DifficultyConfig,
  type Settings,
  type ThemeConfig,
} from "./config";

export type Result = "win" | "lose";
export type Phase = "countdown" | "live" | "ending" | "done";

export interface MatchStats {
  elapsed: number;
  overheats: number;
  botOverheats: number;
  maxLead: number;
  minLead: number;
  blocked: number;
  cleanVents: number;
  overchargesUsed: number;
  botOvercharges: number;
  topStreak: number;
  p2CleanVents: number;
}

export interface EngineHooks {
  onCountdown: (label: string | null) => void;
  onEnd: (result: Result, stats: MatchStats) => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  drag: number;
  grav: number;
  glow: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  max: number;
  color: string;
  w: number;
}

type ObstacleKind = "shield" | "gravity" | "sink" | "amp";

interface Obstacle {
  kind: ObstacleKind;
  t: number;
  life: number;
  max: number;
  warm: number;
  polarity: number;
  seed: number;
  hit: number;
}

interface Callout {
  text: string;
  sub: string;
  color: string;
  life: number;
  max: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class LaserDuel {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hooks: EngineHooks;
  private theme: ThemeConfig;
  private arena: ArenaConfig;
  private diff: DifficultyConfig;

  private raf = 0;
  private lastTs = 0;
  private running = false;
  private ro: ResizeObserver | null = null;

  // viewport
  private W = 0;
  private H = 0;
  private dpr = 1;
  private laneL = 0;
  private laneR = 0;
  private laneY = 0;
  private coreSize = 60;
  private railH = 90;
  private small = false;

  // match state
  phase: Phase = "countdown";
  private result: Result | null = null;
  private countdown = 3.6;
  private lastCountLabel: string | null = null;
  private elapsed = 0;
  private endT = 0;
  private timeScale = 1;

  // entities
  private coreT = 0.5;
  private coreV = 0;
  private coreLean = 0;
  private corePulse = 0;
  private coreSpin = 0;

  // player
  inputFiring = false;
  /** player 2 (local duel mode) */
  inputFiring2 = false;
  private local = false;
  private pHeat = 0;
  private pLock = 0;
  private pFiring = false;
  private pBeam = 0;

  // bot
  private bHeat = 0;
  private bLock = 0;
  private bFiring = false;
  private bBeam = 0;
  private botWant = false;
  private botPanic = 0;
  private aiTimer = 0;

  // fx
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private obstacles: Obstacle[] = [];
  private spawnTimer = 3;
  private shake = 0;
  private flash = 0;
  private flashColor = "#ffffff";
  private gridScroll = 0;
  private chevron = 0;
  private alarmTimer = 0;
  private hitTimerP = 0;
  private hitTimerB = 0;
  private impactP: { x: number; p: number; c: string } | null = null;
  private impactB: { x: number; p: number; c: string } | null = null;
  private overdrive = 1;
  private overdriveAnnounced = false;
  private ocAnnounced = false;
  private hitstop = 0;
  private lastAudioHeat = -1;
  private lastAudioFiring = false;
  private banner = "";
  private bannerT = 0;
  private bannerColor = "#fff";
  private stars: { x: number; y: number; r: number; a: number; s: number }[] = [];

  // stats
  private stats: MatchStats = {
    elapsed: 0,
    overheats: 0,
    botOverheats: 0,
    maxLead: 0,
    minLead: 0,
    blocked: 0,
    cleanVents: 0,
    overchargesUsed: 0,
    botOvercharges: 0,
    topStreak: 0,
    p2CleanVents: 0,
  };
  private prevPFiring = false;
  private prevBFiring = false;

  /* ---- overcharge / streak / drama ---- */
  private ocEnabled = true;
  private hazardsEnabled = true;
  private reducedFx = false;
  pOver = 0;
  private bOver = 0;
  private pOcTime = 0;
  private bOcTime = 0;
  private pStreak = 0;
  private bStreak = 0;
  private clutch = 0;
  private clutchSide = 0;
  private callouts: Callout[] = [];
  private firstBlood = false;
  private prevLeadSign = 0;
  private aberration = 0;

  constructor(canvas: HTMLCanvasElement, settings: Settings, hooks: EngineHooks) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("canvas 2d unavailable");
    this.ctx = ctx;
    this.hooks = hooks;
    this.theme = THEMES[settings.theme];
    this.arena = ARENAS[settings.arena];
    this.diff = DIFFICULTIES[settings.difficulty];
    this.local = settings.mode === "local";
    this.ocEnabled = settings.overcharge;
    this.hazardsEnabled = settings.hazards;
    this.reducedFx = settings.fx === "reduced";
    this.spawnTimer = this.arena.spawn[0];
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement ?? canvas);
  }

  /* ------------------------------------------------------------ setup */
  private resize() {
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    if (w <= 0 || h <= 0) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = w;
    this.H = h;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.small = w < 720 || h < 520;
    const pad = clamp(w * this.arena.pad + 34, 40, 210);
    this.laneL = pad;
    this.laneR = w - pad;
    this.laneY = h * (this.small ? 0.56 : 0.55);
    this.coreSize = clamp(Math.min(w * 0.075, h * 0.15), 34, 98);
    this.railH = clamp(this.coreSize * 1.25, 46, 130);

    this.stars = [];
    const count = Math.floor((w * h) / 16000);
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * this.laneY * 0.95,
        r: Math.random() * 1.4 + 0.3,
        a: Math.random() * 0.6 + 0.15,
        s: Math.random() * 0.25 + 0.05,
      });
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTs = performance.now();
    audio.startBeam();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.ro = null;
    audio.stopBeam();
  }

  getElapsed() {
    return this.elapsed;
  }

  /** Live snapshot for the React HUD layer. */
  getHudState() {
    return {
      overcharge: this.pOver,
      ocReady: this.ocEnabled && this.pOver >= 100 && this.pOcTime <= 0 && this.phase === "live",
      ocActive: this.pOcTime > 0,
      ocEnabled: this.ocEnabled,
      locked: this.pLock > 0,
      streak: this.pStreak,
      phase: this.phase,
      local: this.local,
      overcharge2: this.bOver,
      ocReady2: this.ocEnabled && this.local && this.bOver >= 100 && this.bOcTime <= 0 && this.phase === "live",
      ocActive2: this.bOcTime > 0,
    };
  }

  /** Fire the banked OVERCHARGE burst. */
  triggerOvercharge() {
    if (!this.ocEnabled || this.phase !== "live") return false;
    if (this.pOver < 100 || this.pOcTime > 0 || this.pLock > 0) return false;
    this.pOver = 0;
    this.pOcTime = TUNING.ocDuration;
    this.pHeat = Math.max(0, this.pHeat - 30);
    this.stats.overchargesUsed++;
    this.say("OVERCHARGE!", "EMITTER UNCHAINED", this.theme.player);
    audio.overcharge();
    this.shake = 26;
    this.flash = 0.55;
    this.flashColor = this.theme.player;
    this.aberration = 1;
    this.hitstop = 0.22;
    this.rings.push({
      x: this.laneL,
      y: this.laneY,
      r: 8,
      maxR: this.W * 0.75,
      life: 0.9,
      max: 0.9,
      color: this.theme.player,
      w: 9,
    });
    for (let i = 0; i < 60; i++) {
      const a = (Math.random() - 0.5) * 1.6;
      const sp = 260 + Math.random() * 640;
      this.particles.push({
        x: this.laneL,
        y: this.laneY + (Math.random() - 0.5) * this.railH,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.5,
        life: 0.4 + Math.random() * 0.7,
        max: 1.1,
        size: 2 + Math.random() * 6,
        color: Math.random() < 0.45 ? "#ffffff" : this.theme.player,
        drag: 1.1,
        grav: 60,
        glow: 1,
      });
    }
    return true;
  }

  /** Player 2's banked burst (local duel only). */
  triggerOvercharge2() {
    if (!this.ocEnabled || !this.local || this.phase !== "live") return false;
    if (this.bOver < 100 || this.bOcTime > 0 || this.bLock > 0) return false;
    this.bOver = 0;
    this.bOcTime = TUNING.ocDuration;
    this.bHeat = Math.max(0, this.bHeat - 30);
    this.stats.botOvercharges++;
    this.say("P2 OVERCHARGE!", "EMITTER UNCHAINED", this.theme.bot);
    audio.overcharge();
    this.shake = 26;
    this.flash = 0.55;
    this.flashColor = this.theme.bot;
    this.aberration = 1;
    this.hitstop = 0.22;
    this.rings.push({ x: this.laneR, y: this.laneY, r: 8, maxR: this.W * 0.75, life: 0.9, max: 0.9, color: this.theme.bot, w: 9 });
    for (let i = 0; i < 60; i++) {
      const a = Math.PI + (Math.random() - 0.5) * 1.6;
      const sp = 260 + Math.random() * 640;
      this.particles.push({
        x: this.laneR,
        y: this.laneY + (Math.random() - 0.5) * this.railH,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.5,
        life: 0.4 + Math.random() * 0.7,
        max: 1.1,
        size: 2 + Math.random() * 6,
        color: Math.random() < 0.45 ? "#ffffff" : this.theme.bot,
        drag: 1.1,
        grav: 60,
        glow: 1,
      });
    }
    return true;
  }

  private say(text: string, sub: string, color: string) {
    this.callouts = this.callouts.filter((c) => c.text !== text);
    this.callouts.push({ text, sub, color, life: 1.5, max: 1.5 });
    if (this.callouts.length > 2) this.callouts.shift();
  }

  /* ------------------------------------------------------------ loop */
  private loop = (ts: number) => {
    if (!this.running) return;
    const raw = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.update(raw);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  private update(raw: number) {
    const dt = raw * this.timeScale;
    this.gridScroll = (this.gridScroll + raw * 0.12) % 1;
    this.chevron = (this.chevron + raw * 60) % 1000;
    this.coreSpin += dt * 0.6;

    if (this.phase === "countdown") {
      this.countdown -= raw;
      const label =
        this.countdown > 2.6 ? "3" : this.countdown > 1.7 ? "2" : this.countdown > 0.8 ? "1" : this.countdown > 0 ? "ENGAGE" : null;
      if (label !== this.lastCountLabel) {
        this.lastCountLabel = label;
        this.hooks.onCountdown(label);
        if (label) audio.countBlip(label === "ENGAGE");
        if (label === "ENGAGE") {
          this.flash = 0.5;
          this.flashColor = this.theme.accent;
          this.shake = 10;
        }
      }
      if (this.countdown <= 0) {
        this.phase = "live";
        this.hooks.onCountdown(null);
      }
    } else if (this.phase === "live") {
      this.elapsed += raw;
      this.simulate(dt, raw);
    } else if (this.phase === "ending") {
      this.endT += raw;
      // dramatic slow motion, then ease back out
      if (this.endT < 0.22) this.timeScale = lerp(1, 0.14, this.endT / 0.22);
      else if (this.endT < 1.15) this.timeScale = 0.14;
      else this.timeScale = lerp(0.14, 0.65, clamp((this.endT - 1.15) / 0.7, 0, 1));
      if (this.endT > 1.75 && this.result) {
        this.phase = "done";
        this.stats.elapsed = this.elapsed;
        this.hooks.onEnd(this.result, { ...this.stats });
      }
    }

    this.stepFx(raw, dt);

    // throttle audio param writes
    const h = Math.round(this.pHeat / 4);
    if (h !== this.lastAudioHeat || this.pFiring !== this.lastAudioFiring) {
      this.lastAudioHeat = h;
      this.lastAudioFiring = this.pFiring;
      audio.updateBeam(this.pFiring, this.pHeat / 100);
    }
  }

  /* ------------------------------------------------------------ sim */
  private simulate(dt: number, raw: number) {
    const T = TUNING;
    const d = this.diff;

    // ---- player heat / firing
    if (this.pLock > 0) {
      this.pLock -= dt;
      this.pHeat = Math.max(0, this.pHeat - (100 / T.overheatLock) * dt);
      this.pFiring = false;
      if (this.pLock <= 0) {
        this.pLock = 0;
        this.pHeat = 0;
      }
    } else {
      this.pFiring = this.inputFiring;
      if (this.pFiring) {
        this.pHeat += T.playerHeatRate * dt;
        if (this.pHeat >= 100) {
          this.pHeat = 100;
          this.pLock = T.overheatLock;
          this.pFiring = false;
          this.stats.overheats++;
          this.onOverheat(true);
        }
      } else {
        this.pHeat = Math.max(0, this.pHeat - T.playerCoolRate * dt);
      }
    }

    // ---- clean vent reward: released the trigger in the red zone without locking
    if (this.prevPFiring && !this.pFiring && this.pLock <= 0 && this.pHeat >= 88 && this.pOcTime <= 0) {
      this.stats.cleanVents++;
      if (this.ocEnabled) this.pOver = Math.min(100, this.pOver + TUNING.ocVentBonus);
      this.banner = `◎ CLEAN VENT ×${this.stats.cleanVents}${this.ocEnabled ? "  +⚡" : ""}`;
      this.bannerColor = this.theme.player;
      this.bannerT = 1.1;
      audio.shieldPing();
      this.rings.push({
        x: this.laneL,
        y: this.laneY,
        r: 6,
        maxR: this.coreSize * 2.4,
        life: 0.5,
        max: 0.5,
        color: this.theme.player,
        w: 3,
      });
    }
    this.prevPFiring = this.pFiring;

    // ---- opponent: human (local duel) or AI
    if (this.local) {
      this.botWant = this.inputFiring2;
    } else {
      this.aiTimer -= dt;
      if (this.botPanic > 0) this.botPanic -= dt;
      if (this.aiTimer <= 0) {
        this.aiTimer = d.reaction * (0.7 + Math.random() * 0.7) + 0.016;
        this.decide();
      }
    }
    // in a local duel both sides use identical player-grade thermals
    const oHeatRate = this.local ? T.playerHeatRate : d.heatRate;
    const oCoolRate = this.local ? T.playerCoolRate : d.coolRate;
    if (this.bLock > 0) {
      this.bLock -= dt;
      this.bHeat = Math.max(0, this.bHeat - (100 / T.overheatLock) * dt);
      this.bFiring = false;
      if (this.bLock <= 0) {
        this.bLock = 0;
        this.bHeat = 0;
        if (d.panic && !this.local) this.botPanic = 0.45 + Math.random() * 0.85;
      }
    } else {
      this.bFiring = this.botWant;
      if (this.bFiring) {
        this.bHeat += oHeatRate * dt;
        if (this.bHeat >= 100) {
          this.bHeat = 100;
          this.bLock = T.overheatLock;
          this.bFiring = false;
          this.botWant = false;
          this.stats.botOverheats++;
          this.onOverheat(false);
        }
      } else {
        this.bHeat = Math.max(0, this.bHeat - oCoolRate * dt);
      }
    }

    // ---- P2 clean vent (local duel)
    if (this.local && this.prevBFiring && !this.bFiring && this.bLock <= 0 && this.bHeat >= 88 && this.bOcTime <= 0) {
      this.stats.p2CleanVents++;
      if (this.ocEnabled) this.bOver = Math.min(100, this.bOver + TUNING.ocVentBonus);
      this.banner = `◎ P2 CLEAN VENT ×${this.stats.p2CleanVents}`;
      this.bannerColor = this.theme.bot;
      this.bannerT = 1.1;
      audio.shieldPing();
    }
    this.prevBFiring = this.bFiring;

    // ---- overcharge timers & meter
    if (this.pOcTime > 0) this.pOcTime = Math.max(0, this.pOcTime - dt);
    if (this.bOcTime > 0) this.bOcTime = Math.max(0, this.bOcTime - dt);
    const pOc = this.pOcTime > 0;
    const bOc = this.bOcTime > 0;
    if (pOc) {
      this.pFiring = true;
      this.pHeat = Math.max(0, this.pHeat - 24 * dt);
    }
    if (bOc) this.bFiring = true;

    // ---- beam blocking by shields (overcharge punches straight through)
    let blockPT = -1;
    let blockBT = -1;
    for (const o of this.obstacles) {
      if (o.kind !== "shield" || o.warm > 0) continue;
      if (o.t < this.coreT && o.t > 0.01) blockPT = Math.max(blockPT, o.t);
      if (o.t > this.coreT && o.t < 0.99) blockBT = blockBT < 0 ? o.t : Math.min(blockBT, o.t);
    }
    if (pOc) blockPT = -1;
    if (bOc) blockBT = -1;
    const pBlocked = blockPT >= 0 && this.pFiring;
    const bBlocked = blockBT >= 0 && this.bFiring;
    if (pBlocked || bBlocked) this.stats.blocked += dt;

    // ---- support nodes the beams pass through before the block point
    let pAmp = 1;
    let bAmp = 1;
    for (const o of this.obstacles) {
      if (o.warm > 0 || (o.kind !== "sink" && o.kind !== "amp")) continue;
      const reachedByP = this.pFiring && o.t < this.coreT && (blockPT < 0 || o.t > blockPT);
      const reachedByB = this.bFiring && o.t > this.coreT && (blockBT < 0 || o.t < blockBT);
      if (!reachedByP && !reachedByB) continue;
      o.hit = 1;
      if (o.kind === "sink") {
        if (reachedByP) this.pHeat = Math.max(0, this.pHeat - 46 * dt);
        if (reachedByB) this.bHeat = Math.max(0, this.bHeat - 46 * dt);
      } else {
        if (reachedByP) pAmp = 1.62;
        if (reachedByB) bAmp = 1.62;
      }
    }

    // ---- push streak: uninterrupted effective pressure ramps your force
    const pPushing = this.pFiring && !pBlocked;
    const bPushing = this.bFiring && !bBlocked;
    this.pStreak = pPushing ? Math.min(TUNING.streakMax, this.pStreak + dt) : Math.max(0, this.pStreak - dt * 2.6);
    this.bStreak = bPushing ? Math.min(TUNING.streakMax, this.bStreak + dt) : Math.max(0, this.bStreak - dt * 2.6);
    this.stats.topStreak = Math.max(this.stats.topStreak, this.pStreak);
    const pStreakMul = 1 + (this.pStreak / TUNING.streakMax) * TUNING.streakBonus;
    const bStreakMul = 1 + (this.bStreak / TUNING.streakMax) * TUNING.streakBonus;

    // ---- overcharge meter charges from real pressure
    if (this.ocEnabled) {
      if (pPushing && !pOc) this.pOver = Math.min(100, this.pOver + TUNING.ocGain * dt);
      if (!this.local && this.diff.overcharge && bPushing && !bOc) this.bOver = Math.min(100, this.bOver + TUNING.ocGain * 0.86 * dt);
      if (this.pOver >= 100 && !this.ocAnnounced) {
        this.ocAnnounced = true;
        this.say("OVERCHARGE READY", "SHIFT / RIGHT-CLICK / TAP ⚡", this.theme.player);
        audio.ready();
      }
      if (this.pOver < 100) this.ocAnnounced = false;

      if (this.local && bPushing && !bOc) this.bOver = Math.min(100, this.bOver + TUNING.ocGain * dt);
      // bot unleashes its own burst at the perfect moment
      if (!this.local && this.diff.overcharge && this.bOver >= 100 && !bOc && this.bLock <= 0) {
        const opportune = this.pLock > 0 || this.coreT > 0.72 || (this.pOcTime > 0 && this.coreT > 0.55);
        if (opportune) {
          this.bOver = 0;
          this.bOcTime = TUNING.ocDuration;
          this.bHeat = Math.max(0, this.bHeat - 30);
          this.stats.botOvercharges++;
          this.say("BOT OVERCHARGE", "BRACE FOR IMPACT", this.theme.bot);
          audio.overcharge();
          this.shake = 22;
          this.flash = 0.4;
          this.flashColor = this.theme.bot;
          this.aberration = 1;
        }
      }
    }

    // ---- overdrive escalation (stops eternal stalemates & builds drama)
    const od = 1 + clamp((this.elapsed - 30) / 52, 0, 1) * 0.85 * this.arena.length;
    if (!this.overdriveAnnounced && this.elapsed > 30) {
      this.overdriveAnnounced = true;
      this.banner = "⚡ OVERDRIVE ENGAGED — EMITTERS AT MAX";
      this.bannerColor = this.theme.hazard;
      this.bannerT = 2.2;
      this.flash = 0.3;
      this.flashColor = this.theme.hazard;
      this.shake = 14;
      audio.anomaly();
    }
    this.overdrive = od;

    // ---- forces
    let force = 0;
    if (pPushing) force += T.baseForce * od * pAmp * pStreakMul * (pOc ? T.ocForce : 1);
    if (bPushing) force -= T.baseForce * d.force * od * bAmp * bStreakMul * (bOc ? T.ocForce : 1);

    for (const o of this.obstacles) {
      if (o.kind !== "gravity" || o.warm > 0) continue;
      const dist = o.t - this.coreT;
      const fall = Math.exp(-(dist * dist) / 0.018);
      force += Math.sign(dist || 1) * o.polarity * 0.62 * fall * (o.life / o.max > 0.15 ? 1 : 0.4);
    }

    this.coreV += force * dt;
    this.coreV *= Math.pow(TUNING.damping, dt * 60);
    this.coreT += (this.coreV * dt) / this.arena.length;
    this.coreLean = lerp(this.coreLean, clamp(force * 0.34, -0.3, 0.3), 1 - Math.pow(0.001, dt));
    this.stats.maxLead = Math.max(this.stats.maxLead, this.coreT - 0.5);
    this.stats.minLead = Math.min(this.stats.minLead, this.coreT - 0.5);

    /* ---------- drama director ---------- */
    // first blood — first meaningful lead
    if (!this.firstBlood && Math.abs(this.coreT - 0.5) > 0.14) {
      this.firstBlood = true;
      const mine = this.coreT > 0.5;
      this.say(mine ? "FIRST BLOOD" : "BOT DRAWS FIRST", mine ? "CORE IS MOVING" : "PUSH BACK", mine ? this.theme.player : this.theme.bot);
    }
    // momentum shift — lead changes hands after being decisive
    const leadSign = this.coreT > 0.62 ? 1 : this.coreT < 0.38 ? -1 : 0;
    if (leadSign !== 0 && this.prevLeadSign !== 0 && leadSign !== this.prevLeadSign) {
      this.say("MOMENTUM SHIFT", leadSign > 0 ? "YOU TURNED IT AROUND" : "THE BOT IS SURGING", this.theme.hazard);
      this.shake = Math.max(this.shake, 9);
    }
    if (leadSign !== 0) this.prevLeadSign = leadSign;

    // clutch slow-motion near either baseline
    const edge = Math.max(0, (Math.abs(this.coreT - 0.5) - 0.37) / 0.13);
    const wasClutch = this.clutch > 0.05;
    this.clutch = clamp(edge, 0, 1);
    const side = this.coreT > 0.5 ? 1 : -1;
    if (this.clutch > 0.05 && (!wasClutch || side !== this.clutchSide)) {
      this.clutchSide = side;
      this.say(side > 0 ? "MATCH POINT" : "CRITICAL — HOLD THE LINE", side > 0 ? "ONE PUSH FROM VICTORY" : "THE CORE IS AT YOUR GATE", side > 0 ? "#39ff96" : "#ff2f45");
      audio.alarm(true);
    }
    if (this.hitstop > 0) this.hitstop = Math.max(0, this.hitstop - raw);
    if (this.phase === "live") {
      const target = this.hitstop > 0 ? 0.22 : 1 - this.clutch * 0.24;
      this.timeScale = lerp(this.timeScale, target, 1 - Math.pow(0.02, raw));
    }

    // ---- beam visual ramp + impact fx
    this.pBeam = lerp(this.pBeam, this.pFiring ? 1 : 0, 1 - Math.pow(0.0001, dt));
    this.bBeam = lerp(this.bBeam, this.bFiring ? 1 : 0, 1 - Math.pow(0.0001, dt));

    const cx = this.coreX();
    if (this.pFiring) {
      this.hitTimerP -= dt;
      if (this.hitTimerP <= 0) {
        this.hitTimerP = 0.045;
        const hx = pBlocked ? this.tToX(blockPT) : cx - this.coreSize * 0.5;
        this.sparks(hx, this.laneY, pBlocked ? this.theme.hazard : this.theme.player, pBlocked ? 5 : 4, 1);
        if (!pBlocked) this.shake = Math.min(this.shake + 0.55, 7);
        if (Math.random() < 0.25) audio.coreHit(0.6);
      }
    }
    if (this.bFiring) {
      this.hitTimerB -= dt;
      if (this.hitTimerB <= 0) {
        this.hitTimerB = 0.045;
        const hx = bBlocked ? this.tToX(blockBT) : cx + this.coreSize * 0.5;
        this.sparks(hx, this.laneY, bBlocked ? this.theme.hazard : this.theme.bot, bBlocked ? 5 : 4, -1);
        if (!bBlocked) this.shake = Math.min(this.shake + 0.55, 7);
      }
    }
    this.corePulse = Math.max(0, this.corePulse - dt * 3);
    if (this.pFiring || this.bFiring) this.corePulse = Math.min(1, this.corePulse + dt * 2.4);

    // ---- heat alarm
    const maxHeat = this.pHeat;
    if (this.pLock <= 0 && maxHeat >= TUNING.warnHeat) {
      this.alarmTimer -= dt;
      if (this.alarmTimer <= 0) {
        const fast = maxHeat > 94;
        this.alarmTimer = fast ? 0.14 : 0.26;
        audio.alarm(fast);
      }
    } else {
      this.alarmTimer = 0;
    }

    // ---- obstacles lifecycle
    this.spawnTimer -= dt;
    if (this.hazardsEnabled && this.spawnTimer <= 0 && this.obstacles.length < 3) {
      this.spawnObstacle();
      const [a, b] = this.arena.spawn;
      this.spawnTimer = a + Math.random() * (b - a);
    }
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      if (o.warm > 0) o.warm -= dt;
      else o.life -= dt;
      o.hit = Math.max(0, o.hit - dt * 3);
      if (o.kind === "shield") {
        if ((blockPT === o.t && this.pFiring) || (blockBT === o.t && this.bFiring)) o.hit = 1;
      }
      if (o.life <= 0) this.obstacles.splice(i, 1);
    }

    // ---- win / loss
    if (this.coreT >= 1) {
      this.coreT = 1;
      this.finish("win");
    } else if (this.coreT <= 0) {
      this.coreT = 0;
      this.finish("lose");
    }
  }

  private decide() {
    const d = this.diff;
    if (this.bLock > 0 || this.phase !== "live") {
      this.botWant = false;
      return;
    }
    if (d.panic && this.botPanic > 0) {
      this.botWant = Math.random() < 0.12;
      return;
    }

    const playerLocked = this.pLock > 0;
    const playerCooking = this.pFiring && this.pHeat > 82;
    let ceiling = d.ceiling;
    let resume = d.resume;

    if (d.punish) {
      if (playerLocked) {
        // free window — dump everything into the core
        ceiling = 99.2;
        resume = 0;
      } else if (playerCooking && this.bHeat > 34) {
        // bank capacity so the punish blast lands at full length
        ceiling = 0;
        resume = -1;
      } else if (!this.pFiring && this.pHeat < 12) {
        // player is turtling: mirror their cooling but stay slightly ahead
        ceiling = Math.min(d.ceiling + 8, 96);
      }
    }

    // losing badly? take a risk
    if (this.coreT > 0.78 && !playerLocked) ceiling = Math.min(ceiling + 14, 97);
    // winning comfortably? play it safe
    if (this.coreT < 0.2) ceiling = Math.max(ceiling - 8, 30);

    if (this.botWant) {
      if (this.bHeat >= ceiling) this.botWant = false;
    } else if (this.bHeat <= resume || (playerLocked && this.bHeat < ceiling)) {
      this.botWant = true;
    }

    if (d.microburst && this.botWant && this.bHeat > ceiling - 6 && Math.random() < 0.35) {
      this.botWant = false; // perfect feathering
    }
  }

  private onOverheat(isPlayer: boolean) {
    audio.vent();
    this.shake = 18;
    this.flash = 0.22;
    this.flashColor = "#ff5b3d";
    const x = isPlayer ? this.laneL - this.coreSize * 0.25 : this.laneR + this.coreSize * 0.25;
    this.banner = isPlayer ? "! OVERHEAT — VENTING !" : "BOT OVERHEATED";
    this.bannerColor = isPlayer ? "#ff5b3d" : this.theme.player;
    this.bannerT = 1.6;
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 170;
      this.particles.push({
        x: x + (Math.random() - 0.5) * this.coreSize * 0.6,
        y: this.laneY + (Math.random() - 0.5) * this.railH,
        vx: Math.cos(a) * sp * (isPlayer ? 0.7 : -0.7),
        vy: Math.sin(a) * sp - 40,
        life: 1.1 + Math.random() * 0.9,
        max: 2,
        size: 8 + Math.random() * 20,
        color: i % 4 === 0 ? "#ff7a4d" : "#cfe4ff",
        drag: 1.4,
        grav: -34,
        glow: 0.25,
      });
    }
    this.rings.push({
      x,
      y: this.laneY,
      r: 10,
      maxR: this.coreSize * 3.2,
      life: 0.7,
      max: 0.7,
      color: "#ff7a4d",
      w: 5,
    });
  }

  private spawnObstacle() {
    const roll = Math.random();
    const kind: ObstacleKind = roll < 0.36 ? "shield" : roll < 0.62 ? "gravity" : roll < 0.83 ? "sink" : "amp";
    let t: number;
    if (kind === "sink" || kind === "amp") {
      const side = Math.random() < 0.5 ? -1 : 1;
      t = clamp(this.coreT + side * (0.12 + Math.random() * 0.22), 0.12, 0.88);
      if (Math.abs(t - this.coreT) < 0.07) return;
      const o: Obstacle = { kind, t, life: 4.2 + Math.random() * 2.2, max: 6.4, warm: 0.7, polarity: 1, seed: Math.random() * 1000, hit: 0 };
      o.max = o.life;
      this.obstacles.push(o);
      const mine = t < this.coreT;
      this.banner = kind === "sink" ? "❄ COOLANT NODE — BEAM THROUGH IT" : "▲ AMPLIFIER GATE — 1.6× PUSH";
      this.bannerColor = kind === "sink" ? "#8affff" : this.theme.accent;
      this.bannerT = 1.5;
      audio.nodePing(kind === "amp");
      this.say(
        kind === "sink" ? "COOLANT NODE" : "AMPLIFIER GATE",
        mine ? "ON YOUR SIDE — USE IT" : "BOT SIDE — DENY IT",
        kind === "sink" ? "#8affff" : this.theme.accent,
      );
      this.rings.push({
        x: this.tToX(t),
        y: this.laneY,
        r: 4,
        maxR: this.railH * 1.8,
        life: 0.7,
        max: 0.7,
        color: kind === "sink" ? "#8affff" : this.theme.accent,
        w: 3,
      });
      return;
    }
    if (kind === "shield") {
      const side = Math.random() < 0.5 ? -1 : 1;
      t = this.coreT + side * (0.13 + Math.random() * 0.2);
      if (t < 0.1 || t > 0.9) t = this.coreT - side * (0.13 + Math.random() * 0.2);
      t = clamp(t, 0.1, 0.9);
      if (Math.abs(t - this.coreT) < 0.06) return;
    } else {
      t = clamp(this.coreT + (Math.random() * 2 - 1) * 0.28, 0.14, 0.86);
    }
    const o: Obstacle = {
      kind,
      t,
      life: kind === "shield" ? 2.6 + Math.random() * 1.8 : 3.0 + Math.random() * 2.0,
      max: 5,
      warm: 0.85,
      polarity: Math.random() < 0.55 ? 1 : -1,
      seed: Math.random() * 1000,
      hit: 0,
    };
    o.max = o.life;
    this.obstacles.push(o);
    this.banner = kind === "shield" ? "◇ DEFLECTOR FIELD ONLINE" : o.polarity > 0 ? "◈ GRAVITY WELL" : "◈ REPULSOR ANOMALY";
    this.bannerColor = kind === "shield" ? this.theme.hazard : this.theme.accent;
    this.bannerT = 1.4;
    if (kind === "shield") audio.shieldPing();
    else audio.anomaly();
    this.rings.push({
      x: this.tToX(t),
      y: this.laneY,
      r: 4,
      maxR: this.railH * 2.2,
      life: 0.8,
      max: 0.8,
      color: kind === "shield" ? this.theme.hazard : this.theme.accent,
      w: 3,
    });
  }

  private finish(result: Result) {
    if (this.phase !== "live") return;
    this.phase = "ending";
    this.result = result;
    this.endT = 0;
    this.pFiring = false;
    this.bFiring = false;
    this.inputFiring = false;
    audio.updateBeam(false, 0);
    audio.boom(result === "win");
    this.shake = 34;
    this.flash = 1;
    this.flashColor = result === "win" ? this.theme.player : "#ff2f45";
    this.banner = "";
    const x = result === "win" ? this.laneR : this.laneL;
    const color = result === "win" ? this.theme.player : this.theme.bot;

    if (result === "win") {
      for (let i = 0; i < 180; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 90 + Math.random() * 720;
        this.particles.push({
          x,
          y: this.laneY,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp * 0.75,
          life: 0.7 + Math.random() * 1.5,
          max: 2.2,
          size: 2 + Math.random() * 7,
          color: Math.random() < 0.34 ? "#ffffff" : Math.random() < 0.5 ? color : this.theme.accent,
          drag: 0.7,
          grav: 120,
          glow: 1,
        });
      }
      for (let i = 0; i < 3; i++) {
        this.rings.push({
          x,
          y: this.laneY,
          r: 8,
          maxR: Math.max(this.W, this.H) * (0.5 + i * 0.28),
          life: 1.1 + i * 0.25,
          max: 1.1 + i * 0.25,
          color: i % 2 ? "#ffffff" : color,
          w: 10 - i * 2.5,
        });
      }
    } else {
      // implosion: particles rush inward toward the collapsing anchor
      for (let i = 0; i < 150; i++) {
        const a = Math.random() * Math.PI * 2;
        const dist = 120 + Math.random() * 420;
        this.particles.push({
          x: x + Math.cos(a) * dist,
          y: this.laneY + Math.sin(a) * dist * 0.6,
          vx: -Math.cos(a) * dist * 1.5,
          vy: -Math.sin(a) * dist * 0.9,
          life: 0.55 + Math.random() * 0.45,
          max: 1,
          size: 2 + Math.random() * 6,
          color: Math.random() < 0.4 ? "#ffffff" : color,
          drag: 0.1,
          grav: 0,
          glow: 1,
        });
      }
      this.rings.push({ x, y: this.laneY, r: Math.max(this.W, this.H) * 0.5, maxR: 6, life: 0.6, max: 0.6, color, w: 12 });
    }
  }

  /* ------------------------------------------------------------ fx step */
  private stepFx(raw: number, dt: number) {
    if (this.phase !== "live") {
      const k = 1 - Math.pow(0.0001, raw);
      this.pBeam = lerp(this.pBeam, 0, k);
      this.bBeam = lerp(this.bBeam, 0, k);
    }
    this.shake *= Math.pow(0.0025, raw);
    if (this.shake < 0.05) this.shake = 0;
    this.flash = Math.max(0, this.flash - raw * 1.8);
    this.bannerT = Math.max(0, this.bannerT - raw);
    this.aberration = Math.max(0, this.aberration - raw * 2.2);
    for (let i = this.callouts.length - 1; i >= 0; i--) {
      this.callouts[i].life -= raw;
      if (this.callouts[i].life <= 0) this.callouts.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vx -= p.vx * p.drag * dt;
      p.vy -= p.vy * p.drag * dt;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    const cap = this.reducedFx ? 260 : 700;
    if (this.particles.length > cap) this.particles.splice(0, this.particles.length - cap);

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }

    for (const s of this.stars) {
      s.x -= s.s * raw * 24;
      if (s.x < -2) s.x = this.W + 2;
    }
  }

  private sparks(x: number, y: number, color: string, n: number, dir: number) {
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * 2.2;
      const sp = 90 + Math.random() * 320;
      this.particles.push({
        x,
        y: y + (Math.random() - 0.5) * this.coreSize * 0.5,
        vx: Math.cos(a) * sp * -dir,
        vy: Math.sin(a) * sp,
        life: 0.22 + Math.random() * 0.36,
        max: 0.6,
        size: 1.4 + Math.random() * 3.4,
        color: Math.random() < 0.3 ? "#ffffff" : color,
        drag: 2.2,
        grav: 210,
        glow: 1,
      });
    }
  }

  /* ------------------------------------------------------------ helpers */
  private tToX(t: number) {
    return this.laneL + t * (this.laneR - this.laneL);
  }
  private coreX() {
    return this.tToX(this.coreT);
  }

  /* ------------------------------------------------------------ render */
  private render() {
    const ctx = this.ctx;
    const { W, H } = this;
    ctx.save();
    if (this.shake > 0.1) {
      const s = this.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    this.drawBackground();
    this.drawLane();
    this.drawObstacles();
    ctx.globalCompositeOperation = "lighter";
    this.drawBeams();
    this.drawParticles();
    this.drawRings();
    ctx.globalCompositeOperation = "source-over";
    this.drawTowers();
    this.drawCore();
    ctx.globalCompositeOperation = "lighter";
    this.drawImpacts();
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();

    this.drawHud();

    // flash + vignette
    if (this.flash > 0.002) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = hexToRgba(this.flashColor.startsWith("#") ? this.flashColor : "#ffffff", this.flash * 0.8);
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    }
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // clutch edge glow — screams "this is the moment"
    if (this.clutch > 0.02) {
      const winning = this.coreT > 0.5;
      const c = winning ? "#39ff96" : "#ff2f45";
      const pulse = 0.45 + Math.sin(performance.now() / 120) * 0.3;
      const inten = this.clutch * pulse;
      const band = Math.min(W, H) * 0.24;
      ctx.globalCompositeOperation = "lighter";
      const sides: [number, number, number, number, number, number][] = [
        [0, 0, band, 0, 0, 0],
        [W, 0, W - band, 0, 0, 0],
      ];
      for (const [x0, , x1] of sides) {
        const g = ctx.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0, hexToRgba(c, 0.5 * inten));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(Math.min(x0, x1), 0, band, H);
      }
      const tg = ctx.createLinearGradient(0, 0, 0, band * 0.6);
      tg.addColorStop(0, hexToRgba(c, 0.32 * inten));
      tg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = tg;
      ctx.fillRect(0, 0, W, band * 0.6);
      const bg2 = ctx.createLinearGradient(0, H, 0, H - band * 0.6);
      bg2.addColorStop(0, hexToRgba(c, 0.32 * inten));
      bg2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bg2;
      ctx.fillRect(0, H - band * 0.6, W, band * 0.6);
      ctx.globalCompositeOperation = "source-over";
    }

    // cheap chromatic fringe on big hits
    if (this.aberration > 0.02 && !this.reducedFx) {
      const off = this.aberration * 7;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = this.aberration * 0.22;
      ctx.fillStyle = "#ff0040";
      ctx.fillRect(-off, 0, off + 2, H);
      ctx.fillStyle = "#00ffe0";
      ctx.fillRect(W - 2, 0, off + 2, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }

  private drawBackground() {
    const ctx = this.ctx;
    const { W, H, theme } = this;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, theme.bg0);
    g.addColorStop(0.52, theme.bg1);
    g.addColorStop(1, theme.bg0);
    ctx.fillStyle = g;
    ctx.fillRect(-60, -60, W + 120, H + 120);

    // horizon glow
    const hg = ctx.createRadialGradient(W / 2, this.laneY, 10, W / 2, this.laneY, Math.max(W, H) * 0.6);
    hg.addColorStop(0, hexToRgba(theme.accent, 0.2));
    hg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = hg;
    ctx.fillRect(-60, -60, W + 120, H + 120);

    // stars
    ctx.save();
    for (const s of this.stars) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = "#cfe6ff";
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.restore();

    // perspective floor grid
    const horizon = this.laneY + this.railH * 0.9;
    ctx.save();
    ctx.lineWidth = 1;
    const depth = H - horizon;
    for (let i = 0; i < 22; i++) {
      const p = (i + this.gridScroll) / 22;
      const y = horizon + Math.pow(p, 2.4) * depth * 1.05;
      if (y > H + 2) continue;
      ctx.strokeStyle = hexToRgba(theme.grid, 0.05 + p * 0.3);
      ctx.beginPath();
      ctx.moveTo(-60, y);
      ctx.lineTo(W + 60, y);
      ctx.stroke();
    }
    const vpX = W / 2;
    for (let i = -16; i <= 16; i++) {
      const xb = vpX + i * (W / 12);
      ctx.strokeStyle = hexToRgba(theme.grid, 0.16);
      ctx.beginPath();
      ctx.moveTo(vpX + i * 6, horizon);
      ctx.lineTo(xb, H);
      ctx.stroke();
    }
    // ceiling mirror
    for (let i = 0; i < 12; i++) {
      const p = (i + this.gridScroll) / 12;
      const y = this.laneY - this.railH - Math.pow(p, 2.2) * this.laneY * 1.1;
      if (y < -2) continue;
      ctx.strokeStyle = hexToRgba(theme.grid, 0.035 + (1 - p) * 0.06);
      ctx.beginPath();
      ctx.moveTo(-60, y);
      ctx.lineTo(W + 60, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawLane() {
    const ctx = this.ctx;
    const { laneL, laneR, laneY, railH, theme } = this;
    const top = laneY - railH;
    const bot = laneY + railH;

    // lane floor
    const lg = ctx.createLinearGradient(0, top, 0, bot);
    lg.addColorStop(0, hexToRgba(theme.accent, 0.03));
    lg.addColorStop(0.5, hexToRgba(theme.accent, 0.13));
    lg.addColorStop(1, hexToRgba(theme.accent, 0.03));
    ctx.fillStyle = lg;
    ctx.fillRect(laneL - 6, top, laneR - laneL + 12, railH * 2);

    // rails
    for (const y of [top, bot]) {
      ctx.strokeStyle = hexToRgba(theme.accent, 0.75);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(laneL - 10, y);
      ctx.lineTo(laneR + 10, y);
      ctx.stroke();
      ctx.strokeStyle = hexToRgba(theme.accent, 0.16);
      ctx.lineWidth = 9;
      ctx.stroke();
    }

    // centre line
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = hexToRgba("#ffffff", 0.22);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo((laneL + laneR) / 2, top + 4);
    ctx.lineTo((laneL + laneR) / 2, bot - 4);
    ctx.stroke();
    ctx.restore();

    // distance ticks
    const ticks = this.arena.ticks;
    ctx.font = `600 ${this.small ? 8 : 10}px Rajdhani, sans-serif`;
    ctx.textAlign = "center";
    for (let i = 1; i < ticks; i++) {
      const t = i / ticks;
      const x = this.tToX(t);
      const mid = Math.abs(t - 0.5) < 0.001;
      ctx.strokeStyle = hexToRgba("#ffffff", mid ? 0.3 : 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, bot - 10);
      ctx.lineTo(x, bot);
      ctx.stroke();
    }

    // momentum chevrons flowing toward the leader
    const dir = Math.sign(this.coreV) || 0;
    if (dir !== 0) {
      const speed = Math.min(1, Math.abs(this.coreV) * 12);
      ctx.save();
      ctx.globalAlpha = 0.1 + speed * 0.35;
      ctx.strokeStyle = dir > 0 ? theme.player : theme.bot;
      ctx.lineWidth = 2;
      const gap = 34;
      const off = (this.chevron * dir * (0.4 + speed)) % gap;
      for (let x = laneL; x < laneR; x += gap) {
        const px = x + off;
        if (px < laneL || px > laneR) continue;
        ctx.beginPath();
        ctx.moveTo(px - 6 * dir, laneY - railH * 0.62);
        ctx.lineTo(px + 6 * dir, laneY - railH * 0.5);
        ctx.moveTo(px - 6 * dir, laneY + railH * 0.5);
        ctx.lineTo(px + 6 * dir, laneY + railH * 0.62);
        ctx.stroke();
      }
      ctx.restore();
    }

    // baselines
    this.drawBaseline(laneL, theme.player, this.local ? "P1 LINE" : "PLAYER LINE");
    this.drawBaseline(laneR, theme.bot, this.local ? "P2 LINE" : "BOT LINE");
  }

  private drawBaseline(x: number, color: string, label: string) {
    const ctx = this.ctx;
    const top = this.laneY - this.railH - 8;
    const bot = this.laneY + this.railH + 8;
    ctx.save();
    ctx.strokeStyle = hexToRgba(color, 0.95);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bot);
    ctx.stroke();
    ctx.strokeStyle = hexToRgba(color, 0.2);
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = hexToRgba(color, 0.4);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, this.H);
    ctx.stroke();
    ctx.restore();

    if (!this.small) {
      ctx.save();
      ctx.translate(x, bot + 8);
      ctx.font = "700 9px Rajdhani, sans-serif";
      ctx.fillStyle = hexToRgba(color, 0.7);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }

  private drawTowers() {
    const ctx = this.ctx;
    const { laneY, theme } = this;
    const size = this.coreSize;
    const dying = this.phase === "ending" || this.phase === "done" ? clamp(this.endT / 0.55, 0, 1) : 0;
    const pDie = this.result === "lose" ? dying : 0;
    const bDie = this.result === "win" ? dying : 0;
    // player (left, faces right)
    this.drawTower(this.laneL, laneY, size, theme.player, 1, this.pBeam, this.pLock > 0, this.pHeat, pDie);
    this.drawTower(this.laneR, laneY, size, theme.bot, -1, this.bBeam, this.bLock > 0, this.bHeat, bDie);
    ctx.save();
    ctx.font = `800 ${this.small ? 9 : 11}px Orbitron, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = hexToRgba(theme.player, 0.8);
    ctx.fillText(this.local ? "P1" : "YOU", this.laneL - size * 0.5, laneY - this.railH - 24);
    ctx.fillStyle = hexToRgba(theme.bot, 0.8);
    ctx.fillText(this.local ? "P2" : "BOT", this.laneR + size * 0.5, laneY - this.railH - 24);
    ctx.restore();
  }

  private drawTower(
    x: number,
    y: number,
    size: number,
    color: string,
    dir: number,
    beam: number,
    locked: boolean,
    heat: number,
    collapse = 0,
  ) {
    const ctx = this.ctx;
    const w = size * 0.62;
    const h = size * 1.85;
    ctx.save();
    ctx.translate(x, y);
    if (collapse > 0) {
      ctx.globalAlpha = Math.max(0, 1 - collapse);
      ctx.rotate(collapse * 0.5 * dir);
      ctx.scale(1 - collapse * 0.85, 1 - collapse * 0.95);
    }
    ctx.scale(dir, 1);

    // body
    const bg = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    bg.addColorStop(0, "#2a3350");
    bg.addColorStop(0.5, "#151b2e");
    bg.addColorStop(1, "#0a0e1a");
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(-w * 0.55, -h / 2 + w * 0.28);
    ctx.lineTo(-w * 1.15, h / 2 - w * 0.2);
    ctx.lineTo(-w * 0.2, h / 2);
    ctx.lineTo(0, h / 2 - w * 0.1);
    ctx.closePath();
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = hexToRgba(color, locked ? 0.35 : 0.85);
    ctx.lineWidth = 2;
    ctx.stroke();

    // vent slats
    ctx.strokeStyle = hexToRgba(color, 0.22 + (heat / 100) * 0.6);
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const yy = -h * 0.22 + i * (h * 0.14);
      ctx.beginPath();
      ctx.moveTo(-w * 0.85, yy);
      ctx.lineTo(-w * 0.3, yy);
      ctx.stroke();
    }

    // barrel
    ctx.fillStyle = "#0f1524";
    ctx.fillRect(-w * 0.1, -size * 0.19, w * 0.75, size * 0.38);
    ctx.strokeStyle = hexToRgba(color, locked ? 0.3 : 0.9);
    ctx.lineWidth = 2;
    ctx.strokeRect(-w * 0.1, -size * 0.19, w * 0.75, size * 0.38);

    // muzzle glow
    const mx = w * 0.65;
    const intensity = locked ? 0 : 0.25 + beam * 0.75;
    const mg = ctx.createRadialGradient(mx, 0, 1, mx, 0, size * (0.35 + beam * 0.5));
    mg.addColorStop(0, hexToRgba(color, 0.95 * intensity));
    mg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = mg;
    ctx.fillRect(mx - size, -size, size * 2, size * 2);

    // heat ring
    ctx.beginPath();
    ctx.arc(-w * 0.45, 0, size * 0.3, -Math.PI / 2, -Math.PI / 2 + (heat / 100) * Math.PI * 2);
    ctx.strokeStyle = locked ? "#ff5b3d" : heat > 85 ? "#ff8a3d" : hexToRgba(color, 0.9);
    ctx.lineWidth = 3;
    ctx.stroke();

    if (locked) {
      const p = (Math.sin(performance.now() / 90) + 1) / 2;
      ctx.globalAlpha = 0.35 + p * 0.5;
      ctx.fillStyle = "#ff5b3d";
      ctx.beginPath();
      ctx.arc(-w * 0.45, 0, size * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawBeams() {
    const cx = this.coreX();
    const half = this.coreSize * 0.5;

    let blockP = -1;
    let blockB = -1;
    for (const o of this.obstacles) {
      if (o.kind !== "shield" || o.warm > 0) continue;
      if (o.t < this.coreT) blockP = Math.max(blockP, o.t);
      if (o.t > this.coreT) blockB = blockB < 0 ? o.t : Math.min(blockB, o.t);
    }

    this.impactP = null;
    this.impactB = null;
    const pOc = this.pOcTime > 0;
    const bOc = this.bOcTime > 0;
    if (pOc) blockP = -1;
    if (bOc) blockB = -1;

    if (this.pBeam > 0.01) {
      const x0 = this.laneL + this.coreSize * 0.38;
      const x1 = blockP >= 0 ? this.tToX(blockP) : cx - half;
      this.beam(x0, x1, this.theme.player, this.theme.playerSoft, this.pBeam, this.pHeat, pOc);
      this.impactP = { x: x1, p: this.pBeam * (pOc ? 1.9 : 1), c: this.theme.playerSoft };
    }
    if (this.bBeam > 0.01) {
      const x0 = this.laneR - this.coreSize * 0.38;
      const x1 = blockB >= 0 ? this.tToX(blockB) : cx + half;
      this.beam(x0, x1, this.theme.bot, this.theme.botSoft, this.bBeam, this.bHeat, bOc);
      this.impactB = { x: x1, p: this.bBeam * (bOc ? 1.9 : 1), c: this.theme.botSoft };
    }
  }

  /** contact bloom re-drawn above the core so hits read clearly */
  private drawImpacts() {
    const ctx = this.ctx;
    const t = performance.now() / 1000;
    for (const im of [this.impactP, this.impactB]) {
      if (!im) continue;
      const r = this.coreSize * (0.26 + im.p * 0.24) * (0.88 + Math.sin(t * 34) * 0.12);
      const g = ctx.createRadialGradient(im.x, this.laneY, 0, im.x, this.laneY, r);
      g.addColorStop(0, hexToRgba("#ffffff", 0.9 * im.p));
      g.addColorStop(0.4, hexToRgba(im.c, 0.5 * im.p));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(im.x, this.laneY, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private beam(x0: number, x1: number, color: string, soft: string, power: number, heat: number, oc = false) {
    const ctx = this.ctx;
    const y = this.laneY;
    if (Math.abs(x1 - x0) < 2) return;
    const t = performance.now() / 1000;
    const jitter = (1 + (heat / 100) * 1.6) * (oc ? 3.2 : 1);
    const baseW = this.coreSize * 0.16 * (0.55 + power * 0.65) * (oc ? 2.5 : 1);

    // overcharge: crackling helix around the main beam
    if (oc) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(soft, 0.75);
      ctx.lineWidth = 2;
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        for (let i = 0; i <= 26; i++) {
          const p = i / 26;
          const xx = x0 + (x1 - x0) * p;
          const yy = y + Math.sin(p * 20 + t * 22 + k * Math.PI) * this.coreSize * 0.42;
          if (i === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // outer bloom
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, hexToRgba(color, 0.0));
    grad.addColorStop(0.15, hexToRgba(color, 0.5 * power));
    grad.addColorStop(1, hexToRgba(soft, 0.85 * power));
    ctx.strokeStyle = grad;
    ctx.lineCap = "round";

    ctx.lineWidth = baseW * 3.6;
    ctx.globalAlpha = 0.16 * power;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();

    ctx.globalAlpha = 0.4 * power;
    ctx.lineWidth = baseW * 1.9;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();

    // wobbling energy core
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = baseW * (0.55 + Math.sin(t * 40) * 0.05);
    ctx.beginPath();
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const p = i / steps;
      const x = x0 + (x1 - x0) * p;
      const yy = y + Math.sin(t * 26 + p * 14) * jitter * (1 - Math.abs(p - 0.5) * 1.2);
      if (i === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();

    // travelling pulses
    for (let i = 0; i < 3; i++) {
      const p = ((t * 1.6 + i / 3) % 1);
      const x = x0 + (x1 - x0) * p;
      const r = baseW * (1.5 + Math.sin(p * Math.PI) * 1.2);
      const pg = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
      pg.addColorStop(0, hexToRgba(soft, 0.9 * power));
      pg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 2.4, r * 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // impact flare
    const fr = this.coreSize * (0.34 + power * 0.3) * (0.9 + Math.sin(t * 30) * 0.1);
    const fg = ctx.createRadialGradient(x1, y, 0, x1, y, fr);
    fg.addColorStop(0, hexToRgba("#ffffff", 0.95 * power));
    fg.addColorStop(0.35, hexToRgba(soft, 0.6 * power));
    fg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(x1, y, fr, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawCore() {
    const ctx = this.ctx;
    const x = this.coreX();
    const y = this.laneY;
    const s = this.coreSize;
    const t = performance.now() / 1000;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.coreLean * 0.18);

    // outer aura
    const auraC = this.coreV > 0.002 ? this.theme.player : this.coreV < -0.002 ? this.theme.bot : this.theme.core;
    const ag = ctx.createRadialGradient(0, 0, s * 0.3, 0, 0, s * (1.5 + this.corePulse * 0.6));
    ag.addColorStop(0, hexToRgba(auraC, 0.42));
    ag.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(0, 0, s * 2, 0, Math.PI * 2);
    ctx.fill();

    // stabiliser arms
    ctx.save();
    ctx.rotate(this.coreSpin);
    ctx.strokeStyle = hexToRgba(this.theme.core, 0.55);
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a0 = (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.82, a0, a0 + 1.0);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.rotate(-this.coreSpin * 1.4);
    ctx.strokeStyle = hexToRgba(this.theme.accent, 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.98, 0, Math.PI * 2);
    ctx.setLineDash([6, 10]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // metallic body
    const half = s * 0.5;
    const bodyG = ctx.createLinearGradient(-half, -half, half, half);
    bodyG.addColorStop(0, "#f2f7ff");
    bodyG.addColorStop(0.3, "#9fb2cc");
    bodyG.addColorStop(0.55, "#3d4a66");
    bodyG.addColorStop(0.8, "#7f90ad");
    bodyG.addColorStop(1, "#222b41");
    this.roundRect(-half, -half, s, s, s * 0.16);
    ctx.fillStyle = bodyG;
    ctx.fill();
    ctx.strokeStyle = hexToRgba(this.theme.core, 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();

    // top/bottom stabiliser blocks
    ctx.fillStyle = "#151c2e";
    ctx.fillRect(-half * 0.5, -half - s * 0.16, half, s * 0.16);
    ctx.fillRect(-half * 0.5, half, half, s * 0.16);
    ctx.strokeStyle = hexToRgba(this.theme.accent, 0.8);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-half * 0.5, -half - s * 0.16, half, s * 0.16);
    ctx.strokeRect(-half * 0.5, half, half, s * 0.16);

    // inner energy hexagon
    const pulse = 0.55 + Math.sin(t * 6) * 0.12 + this.corePulse * 0.3;
    ctx.save();
    ctx.rotate(t * 0.4);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = s * 0.3 * pulse * 1.4;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const ig = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.42);
    ig.addColorStop(0, "#ffffff");
    ig.addColorStop(0.6, hexToRgba(auraC, 0.85));
    ig.addColorStop(1, hexToRgba(auraC, 0.1));
    ctx.fillStyle = ig;
    ctx.fill();
    ctx.restore();

    // panel lines
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-half + 5, -half + 5);
    ctx.lineTo(-half + 5, half - 5);
    ctx.moveTo(half - 5, -half + 5);
    ctx.lineTo(half - 5, half - 5);
    ctx.stroke();

    ctx.restore();
  }

  private drawObstacles() {
    const ctx = this.ctx;
    const t = performance.now() / 1000;
    for (const o of this.obstacles) {
      const x = this.tToX(o.t);
      const warmP = o.warm > 0 ? 1 - o.warm / 0.85 : 1;
      const fade = Math.min(1, o.life / 0.5);
      const alpha = warmP * fade;
      if (o.kind === "sink" || o.kind === "amp") {
        const isSink = o.kind === "sink";
        const color = isSink ? "#8affff" : this.theme.accent;
        const r = this.railH * 0.6;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, this.laneY);
        // halo
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * (1.4 + o.hit * 0.5));
        g.addColorStop(0, hexToRgba(color, 0.35 + o.hit * 0.4));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        // frame
        ctx.rotate(isSink ? t * 0.8 + o.seed : 0);
        ctx.strokeStyle = hexToRgba(color, 0.95);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        const sides = isSink ? 6 : 3;
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
          const px = Math.cos(a) * r * 0.62;
          const py = Math.sin(a) * r * 0.62;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = hexToRgba(color, 0.14 + o.hit * 0.3);
        ctx.fill();
        // glyph
        ctx.rotate(isSink ? -(t * 0.8 + o.seed) : 0);
        ctx.font = `800 ${Math.round(r * 0.62)}px Orbitron, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(isSink ? "❄" : "▲", 0, isSink ? 1 : 2);
        // vertical guide rails so you can see the lane slot
        ctx.strokeStyle = hexToRgba(color, 0.3);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(0, -this.railH);
        ctx.lineTo(0, -r * 0.7);
        ctx.moveTo(0, r * 0.7);
        ctx.lineTo(0, this.railH);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      if (o.kind === "shield") {
        const h = this.railH * 1.15;
        const color = this.theme.hazard;
        ctx.save();
        ctx.globalAlpha = alpha;
        // field body
        const g = ctx.createLinearGradient(x - 14, 0, x + 14, 0);
        g.addColorStop(0, hexToRgba(color, 0));
        g.addColorStop(0.5, hexToRgba(color, 0.26 + o.hit * 0.4));
        g.addColorStop(1, hexToRgba(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - 16, this.laneY - h, 32, h * 2);
        // edges
        ctx.strokeStyle = hexToRgba(color, 0.9);
        ctx.lineWidth = 2 + o.hit * 2;
        ctx.beginPath();
        ctx.moveTo(x, this.laneY - h);
        ctx.lineTo(x, this.laneY + h);
        ctx.stroke();
        // scan pattern
        ctx.lineWidth = 1;
        ctx.strokeStyle = hexToRgba(color, 0.45);
        for (let i = -4; i <= 4; i++) {
          const yy = this.laneY + i * (h / 4.4) + ((t * 40) % (h / 4.4));
          if (Math.abs(yy - this.laneY) > h) continue;
          ctx.beginPath();
          ctx.moveTo(x - 11, yy);
          ctx.lineTo(x + 11, yy);
          ctx.stroke();
        }
        // caps
        ctx.fillStyle = hexToRgba(color, 0.95);
        ctx.fillRect(x - 7, this.laneY - h - 6, 14, 8);
        ctx.fillRect(x - 7, this.laneY + h - 2, 14, 8);
        if (o.warm > 0) {
          ctx.strokeStyle = hexToRgba(color, 0.7 * (1 - warmP));
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 26 * (1 - warmP) - 16, this.laneY - h - 20 * (1 - warmP), 32 + 52 * (1 - warmP), h * 2 + 40 * (1 - warmP));
        }
        ctx.restore();
      } else {
        const color = o.polarity > 0 ? this.theme.accent : this.theme.hazard;
        const r = this.railH * 0.92 * (0.85 + Math.sin(t * 3 + o.seed) * 0.08);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(x, this.laneY, r * 0.1, x, this.laneY, r);
        g.addColorStop(0, hexToRgba(color, o.polarity > 0 ? 0.55 : 0.1));
        g.addColorStop(0.65, hexToRgba(color, 0.2));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, this.laneY, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = hexToRgba(color, 0.85);
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const spin = t * (o.polarity > 0 ? 2.2 : -2.2) + (i * Math.PI) / 2 + o.seed;
          const rr = r * (0.3 + i * 0.18);
          ctx.beginPath();
          ctx.arc(x, this.laneY, rr, spin, spin + 1.6);
          ctx.stroke();
        }
        ctx.fillStyle = hexToRgba(color, 0.9);
        ctx.beginPath();
        ctx.arc(x, this.laneY, r * 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  private drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a * (0.35 + p.glow * 0.65);
      if (p.glow > 0.5) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * (2 - a));
        g.addColorStop(0, hexToRgba("#ffffff", 0.22 * a));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (2 - a), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawRings() {
    const ctx = this.ctx;
    for (const r of this.rings) {
      const p = 1 - r.life / r.max;
      const rad = lerp(r.r, r.maxR, 1 - Math.pow(1 - p, 2));
      ctx.globalAlpha = (1 - p) * 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.w * (1 - p) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(1, rad), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------ hud */
  private drawHud() {
    const ctx = this.ctx;
    const { W, theme } = this;
    const pad = this.small ? 12 : 24;
    const gw = Math.min(this.small ? 142 : 300, W * 0.4);
    const gh = this.small ? 14 : 20;
    const gy = this.small ? 58 : 62;

    this.gauge(pad, gy, gw, gh, this.pHeat, this.pLock, theme.player, this.local ? "P1 HEAT" : "YOUR HEAT", false);
    this.gauge(W - pad - gw, gy, gw, gh, this.bHeat, this.bLock, theme.bot, this.local ? "P2 HEAT" : "BOT HEAT", true);

    // lane progress bar (bottom)
    const bw = Math.min(W - pad * 2, 620);
    const bx = (W - bw) / 2;
    const by = this.H - (this.small ? 26 : 40);
    const bh = this.small ? 7 : 10;
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    this.roundRect(bx, by, bw, bh, bh / 2);
    ctx.fill();
    const mid = bx + bw / 2;
    const cxp = bx + clamp(this.coreT, 0, 1) * bw;
    ctx.fillStyle = this.coreT >= 0.5 ? hexToRgba(theme.player, 0.85) : hexToRgba(theme.bot, 0.85);
    this.roundRect(Math.min(mid, cxp), by, Math.abs(cxp - mid), bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(mid - 1, by - 3, 2, bh + 6);
    ctx.beginPath();
    ctx.arc(cxp, by + bh / 2, bh * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    if (!this.small) {
      ctx.font = "700 10px Rajdhani, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.textAlign = "left";
      ctx.fillText(this.local ? "P1 BASE" : "YOUR BASE", bx, by - 8);
      ctx.textAlign = "right";
      ctx.fillText(this.local ? "P2 BASE" : "BOT BASE", bx + bw, by - 8);
      ctx.textAlign = "center";
      const lead = Math.round((this.coreT - 0.5) * 200);
      const who = lead > 0 ? (this.local ? "P1" : "YOU") : this.local ? "P2" : "BOT";
      ctx.fillStyle = lead >= 0 ? hexToRgba(theme.player, 0.9) : hexToRgba(theme.bot, 0.9);
      ctx.fillText(lead === 0 ? "DEADLOCK" : `${lead > 0 ? "+" : ""}${lead}% ${who}`, mid, by - 8);
    }

    // overdrive indicator
    if (this.overdrive > 1.015) {
      const p = clamp((this.overdrive - 1) / (0.85 * this.arena.length), 0, 1);
      ctx.save();
      ctx.font = `800 ${this.small ? 9 : 11}px Orbitron, sans-serif`;
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.6 + Math.sin(performance.now() / 180) * 0.3;
      ctx.fillStyle = theme.hazard;
      ctx.fillText(`⚡ OVERDRIVE ×${this.overdrive.toFixed(2)}`, W / 2, by - (this.small ? 22 : 26));
      ctx.globalAlpha = 0.25 + p * 0.3;
      ctx.strokeStyle = theme.hazard;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx - 4, by - 4, bw + 8, bh + 8);
      ctx.restore();
    }

    // ---- P2 overcharge meter (local duel) — mirrored on the right
    if (this.ocEnabled && this.local) {
      const mw = Math.min(this.small ? 130 : 200, W * 0.3);
      const mx = W - pad - mw;
      const my = gy + gh + (this.small ? 20 : 26);
      const active2 = this.bOcTime > 0;
      const ready2 = this.bOver >= 100;
      ctx.save();
      ctx.font = `800 ${this.small ? 8 : 10}px Orbitron, sans-serif`;
      ctx.textAlign = "right";
      ctx.fillStyle = active2 ? "#ffffff" : ready2 ? theme.bot : "rgba(190,215,240,0.45)";
      ctx.fillText(active2 ? "⚡ P2 FIRING" : ready2 ? "⚡ P2 READY" : "P2 OVERCHARGE", mx + mw, my - 3);
      ctx.fillStyle = "rgba(6,10,20,0.7)";
      this.roundRect(mx, my, mw, this.small ? 7 : 9, 2);
      ctx.fill();
      const f2 = (mw - 4) * (active2 ? this.bOcTime / TUNING.ocDuration : clamp(this.bOver / 100, 0, 1));
      if (f2 > 1) {
        ctx.fillStyle = active2 ? "#ffffff" : hexToRgba(theme.bot, 0.95);
        this.roundRect(mx + mw - 2 - f2, my + 2, f2, (this.small ? 7 : 9) - 4, 1.5);
        ctx.fill();
      }
      ctx.strokeStyle = ready2 || active2 ? hexToRgba(theme.bot, 0.95) : "rgba(255,255,255,0.16)";
      ctx.lineWidth = ready2 ? 2 : 1;
      this.roundRect(mx, my, mw, this.small ? 7 : 9, 2);
      ctx.stroke();
      ctx.restore();
    }

    // ---- overcharge meter (centre, under the heat gauges)
    if (this.ocEnabled) {
      const ow = this.local ? Math.min(this.small ? 130 : 200, W * 0.3) : Math.min(this.small ? 210 : 300, W * 0.62);
      const ox = this.local ? pad : (W - ow) / 2;
      // on phones the top bar is crowded, so the meter drops below the heat gauges
      const oy = this.local ? gy + gh + (this.small ? 20 : 26) : this.small ? 100 : 26;
      const oh = this.small ? 9 : 12;
      const p = clamp(this.pOver / 100, 0, 1);
      const ready = this.pOver >= 100;
      const active = this.pOcTime > 0;
      ctx.save();
      ctx.font = `800 ${this.small ? 8 : 10}px Orbitron, sans-serif`;
      ctx.textAlign = this.local ? "left" : "center";
      ctx.fillStyle = active ? "#ffffff" : ready ? theme.player : "rgba(190,215,240,0.5)";
      const ocLabel = this.local
        ? active
          ? "⚡ P1 FIRING"
          : ready
            ? "⚡ P1 READY"
            : "P1 OVERCHARGE"
        : active
          ? `⚡ OVERCHARGE FIRING ${this.pOcTime.toFixed(1)}s`
          : ready
            ? "⚡ OVERCHARGE READY"
            : "OVERCHARGE";
      ctx.fillText(ocLabel, this.local ? ox : W / 2, oy - 4);
      // skewed frame
      ctx.fillStyle = "rgba(6,10,20,0.7)";
      this.roundRect(ox, oy, ow, oh, 2);
      ctx.fill();
      const fw = (ow - 4) * (active ? this.pOcTime / TUNING.ocDuration : p);
      if (fw > 1) {
        const g = ctx.createLinearGradient(ox, 0, ox + ow, 0);
        g.addColorStop(0, hexToRgba(theme.player, 0.9));
        g.addColorStop(0.6, hexToRgba("#ffffff", 0.95));
        g.addColorStop(1, hexToRgba(theme.accent, 0.9));
        ctx.fillStyle = active ? "#ffffff" : g;
        this.roundRect(ox + 2, oy + 2, fw, oh - 4, 1.5);
        ctx.fill();
      }
      ctx.strokeStyle = ready || active ? hexToRgba(theme.player, 0.95) : "rgba(255,255,255,0.18)";
      ctx.lineWidth = ready ? 2 : 1;
      this.roundRect(ox, oy, ow, oh, 2);
      ctx.stroke();
      // notches
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 10; i++) {
        const sx = ox + (ow / 10) * i;
        ctx.beginPath();
        ctx.moveTo(sx, oy + 1);
        ctx.lineTo(sx, oy + oh - 1);
        ctx.stroke();
      }
      if (ready && !active) {
        ctx.globalAlpha = 0.35 + Math.sin(performance.now() / 110) * 0.35;
        ctx.strokeStyle = theme.player;
        ctx.lineWidth = 3;
        this.roundRect(ox - 4, oy - 4, ow + 8, oh + 8, 4);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    // ---- push streak pips
    if (this.pStreak > 0.35) {
      const sp = this.pStreak / TUNING.streakMax;
      ctx.save();
      ctx.font = `800 ${this.small ? 9 : 11}px Orbitron, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillStyle = hexToRgba(sp > 0.85 ? "#ffd24a" : theme.player, 0.55 + sp * 0.45);
      ctx.fillText(`PUSH ×${(1 + sp * TUNING.streakBonus).toFixed(2)}`, pad, gy + (this.small ? 34 : 44));
      ctx.restore();
    }

    // ---- callouts
    let cy = this.laneY - this.railH - (this.small ? 76 : 104);
    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const c = this.callouts[i];
      const p = 1 - c.life / c.max;
      const a = c.life > c.max - 0.12 ? (c.max - c.life) / 0.12 : Math.min(1, c.life / 0.35);
      const scale = c.life > c.max - 0.12 ? 1.5 - ((c.max - c.life) / 0.12) * 0.5 : 1 + p * 0.05;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(W / 2, cy);
      ctx.scale(scale, scale);
      ctx.textAlign = "center";
      ctx.font = `900 ${this.small ? 17 : 26}px Orbitron, sans-serif`;
      ctx.shadowColor = c.color;
      ctx.shadowBlur = 24;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(c.text, 0, 0);
      ctx.shadowBlur = 8;
      ctx.font = `700 ${this.small ? 9 : 11}px Rajdhani, sans-serif`;
      ctx.fillStyle = c.color;
      ctx.fillText(c.sub, 0, this.small ? 13 : 18);
      ctx.restore();
      cy -= this.small ? 34 : 46;
    }

    // banner
    if (this.bannerT > 0 && this.banner) {
      const a = Math.min(1, this.bannerT / 0.4);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `800 ${this.small ? 13 : 18}px Orbitron, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = this.bannerColor;
      ctx.shadowColor = this.bannerColor;
      ctx.shadowBlur = 18;
      ctx.fillText(this.banner, W / 2, this.laneY - this.railH - (this.small ? 44 : 60));
      ctx.restore();
    }
  }

  private gauge(x: number, y: number, w: number, h: number, heat: number, lock: number, color: string, label: string, rtl: boolean) {
    const ctx = this.ctx;
    const t = performance.now() / 1000;
    const overheated = lock > 0;
    const p = clamp(heat / 100, 0, 1);

    // label
    ctx.font = `700 ${this.small ? 9 : 11}px Orbitron, sans-serif`;
    ctx.textAlign = rtl ? "right" : "left";
    ctx.fillStyle = overheated ? "#ff6b4a" : hexToRgba(color, 0.85);
    ctx.fillText(overheated ? "◤ OVERHEAT — VENTING" : label, rtl ? x + w : x, y - 8);

    // frame
    ctx.fillStyle = "rgba(6,10,20,0.72)";
    this.roundRect(x, y, w, h, 3);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(overheated ? "#ff6b4a" : color, 0.55);
    ctx.lineWidth = 1.5;
    this.roundRect(x, y, w, h, 3);
    ctx.stroke();

    // fill
    const fillW = (w - 4) * p;
    const fx = rtl ? x + w - 2 - fillW : x + 2;
    const g = ctx.createLinearGradient(fx, 0, fx + fillW, 0);
    const hot = p > 0.85;
    const c1 = rtl ? "#ff2f45" : color;
    const c2 = rtl ? color : "#ff2f45";
    g.addColorStop(0, hexToRgba(c1, 0.95));
    g.addColorStop(0.55, hexToRgba(p > 0.6 ? "#ffc23d" : c1, 0.95));
    g.addColorStop(1, hexToRgba(c2, 0.95));
    ctx.fillStyle = overheated ? hexToRgba("#ff6b4a", 0.35 + Math.sin(t * 22) * 0.2) : g;
    if (fillW > 1) {
      this.roundRect(fx, y + 2, fillW, h - 4, 2);
      ctx.fill();
    }

    // segment dividers
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    const segs = this.small ? 8 : 14;
    for (let i = 1; i < segs; i++) {
      const sx = x + (w / segs) * i;
      ctx.beginPath();
      ctx.moveTo(sx, y + 1);
      ctx.lineTo(sx, y + h - 1);
      ctx.stroke();
    }

    // danger zone marker
    const dx = rtl ? x + w - w * 0.85 : x + w * 0.85;
    ctx.strokeStyle = hexToRgba("#ff2f45", 0.85);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(dx, y - 2);
    ctx.lineTo(dx, y + h + 2);
    ctx.stroke();

    if (hot && !overheated) {
      ctx.globalAlpha = 0.45 + Math.sin(t * 26) * 0.4;
      ctx.strokeStyle = "#ff2f45";
      ctx.lineWidth = 3;
      this.roundRect(x - 4, y - 4, w + 8, h + 8, 6);
      ctx.stroke();
      ctx.font = `800 ${this.small ? 9 : 11}px Orbitron, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff8a3d";
      ctx.fillText("CRITICAL", x + w / 2, y + h + (this.small ? 12 : 15));
      ctx.globalAlpha = 1;
    }

    // numeric
    ctx.font = `700 ${this.small ? 9 : 11}px Rajdhani, sans-serif`;
    ctx.textAlign = rtl ? "right" : "left";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    const txt = overheated ? `LOCKED ${lock.toFixed(1)}s` : `${Math.round(heat)}%`;
    ctx.fillText(txt, rtl ? x + w : x, y + h + (this.small ? 12 : 15));
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}
