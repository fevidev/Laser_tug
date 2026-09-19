export type DifficultyKey = "easy" | "medium" | "hard" | "impossible";
export type ArenaKey = "compact" | "standard" | "endless";
export type ThemeKey = "cyber" | "solar" | "toxic";

export type ModeKey = "solo" | "local";
export type SeriesKey = 1 | 3 | 5;

export interface Settings {
  /** solo = vs bot, local = two humans on one device */
  mode: ModeKey;
  /** best-of length for the match series */
  series: SeriesKey;
  difficulty: DifficultyKey;
  arena: ArenaKey;
  theme: ThemeKey;
  /** hazards & support nodes spawn along the lane */
  hazards: boolean;
  /** the chargeable OVERCHARGE burst ability */
  overcharge: boolean;
  /** full cinematic FX vs. performance mode */
  fx: "full" | "reduced";
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "solo",
  series: 1,
  difficulty: "medium",
  arena: "standard",
  theme: "cyber",
  hazards: true,
  overcharge: true,
  fx: "full",
};

/* ------------------------------------------------------------------ *
 * Difficulty profiles
 * ------------------------------------------------------------------ */
export interface DifficultyConfig {
  key: DifficultyKey;
  name: string;
  tag: string;
  blurb: string;
  accent: string;
  /** multiplier on the base push force */
  force: number;
  /** heat gained per second while firing */
  heatRate: number;
  /** heat lost per second while venting */
  coolRate: number;
  /** heat level where the bot stops firing (>=100 means it will overheat) */
  ceiling: number;
  /** heat level where the bot resumes firing */
  resume: number;
  /** decision latency in seconds */
  reaction: number;
  /** watches the player's heat gauge and saves capacity to punish lockouts */
  punish: boolean;
  /** freezes up for a beat after an overheat */
  panic: boolean;
  /** rapid perfect micro-bursts */
  microburst: boolean;
  /** the bot can bank and unleash OVERCHARGE bursts */
  overcharge: boolean;
  /** stars shown on the home screen */
  threat: number;
}

export const DIFFICULTIES: Record<DifficultyKey, DifficultyConfig> = {
  easy: {
    key: "easy",
    name: "EASY",
    tag: "Slow reactions",
    blurb: "Fires blindly until it cooks itself. Bait it and walk the core home.",
    accent: "#39ff96",
    force: 0.82,
    heatRate: 40,
    coolRate: 32,
    ceiling: 101,
    resume: 0,
    reaction: 0.45,
    punish: false,
    panic: true,
    microburst: false,
    overcharge: false,
    threat: 1,
  },
  medium: {
    key: "medium",
    name: "MEDIUM",
    tag: "Balanced duelist",
    blurb: "Vents at 80% heat like a textbook pilot. Predictable, but solid.",
    accent: "#ffd24a",
    force: 0.95,
    heatRate: 30,
    coolRate: 46,
    ceiling: 82,
    resume: 26,
    reaction: 0.26,
    punish: false,
    panic: false,
    microburst: false,
    overcharge: false,
    threat: 2,
  },
  hard: {
    key: "hard",
    name: "HARD",
    tag: "Aggressive pusher",
    blurb: "Reads your gauge. Banks heat and unloads the instant you lock up.",
    accent: "#ff8a1f",
    force: 1.0,
    heatRate: 31,
    coolRate: 47,
    ceiling: 74,
    resume: 22,
    reaction: 0.13,
    punish: true,
    panic: false,
    microburst: false,
    overcharge: true,
    threat: 3,
  },
  impossible: {
    key: "impossible",
    name: "IMPOSSIBLE",
    tag: "Flawless timing",
    blurb: "Frame-perfect micro-bursts. It never overheats. It punishes everything.",
    accent: "#ff2d6f",
    force: 1.06,
    heatRate: 28,
    coolRate: 62,
    ceiling: 68,
    resume: 42,
    reaction: 0.04,
    punish: true,
    panic: false,
    microburst: true,
    overcharge: true,
    threat: 4,
  },
};

/* ------------------------------------------------------------------ *
 * Arena sizes
 * ------------------------------------------------------------------ */
export interface ArenaConfig {
  key: ArenaKey;
  name: string;
  tag: string;
  blurb: string;
  /** larger = longer lane = slower normalised core travel */
  length: number;
  /** obstacle spawn interval range in seconds */
  spawn: [number, number];
  /** number of lane distance ticks */
  ticks: number;
  /** viewport padding factor */
  pad: number;
}

export const ARENAS: Record<ArenaKey, ArenaConfig> = {
  compact: {
    key: "compact",
    name: "COMPACT",
    tag: "Fast & chaotic",
    blurb: "Short lane. Every burst swings the match. Blink and it's over.",
    length: 0.72,
    spawn: [2.6, 4.4],
    ticks: 6,
    pad: 0.13,
  },
  standard: {
    key: "standard",
    name: "STANDARD",
    tag: "Balanced",
    blurb: "The regulation duel lane. Power, patience and heat in equal measure.",
    length: 1.0,
    spawn: [3.8, 6.2],
    ticks: 8,
    pad: 0.08,
  },
  endless: {
    key: "endless",
    name: "ENDLESS LANE",
    tag: "Long & strategic",
    blurb: "A marathon corridor. Grind out inches and win the heat war.",
    length: 1.75,
    spawn: [3.2, 5.0],
    ticks: 12,
    pad: 0.045,
  },
};

/* ------------------------------------------------------------------ *
 * Arena themes
 * ------------------------------------------------------------------ */
export interface ThemeConfig {
  key: ThemeKey;
  name: string;
  tag: string;
  bg0: string;
  bg1: string;
  grid: string;
  player: string;
  playerSoft: string;
  bot: string;
  botSoft: string;
  accent: string;
  core: string;
  hazard: string;
}

export const THEMES: Record<ThemeKey, ThemeConfig> = {
  cyber: {
    key: "cyber",
    name: "CYBER SYNTH",
    tag: "Neon pink / blue",
    bg0: "#04050f",
    bg1: "#0d1038",
    grid: "#2b3ea8",
    player: "#2ff6ff",
    playerSoft: "#8affff",
    bot: "#ff3df0",
    botSoft: "#ff9df6",
    accent: "#7b5cff",
    core: "#dbe9ff",
    hazard: "#ffe66d",
  },
  solar: {
    key: "solar",
    name: "SOLAR FLARE",
    tag: "Crimson / gold",
    bg0: "#100503",
    bg1: "#3a0f05",
    grid: "#9c3c10",
    player: "#ffd24a",
    playerSoft: "#ffeeae",
    bot: "#ff3322",
    botSoft: "#ff9a84",
    accent: "#ff8a1f",
    core: "#fff0d4",
    hazard: "#8ce9ff",
  },
  toxic: {
    key: "toxic",
    name: "TOXIC WASTE",
    tag: "Acid green / purple",
    bg0: "#030f09",
    bg1: "#07281a",
    grid: "#17864a",
    player: "#a4ff3c",
    playerSoft: "#dcffab",
    bot: "#b14cff",
    botSoft: "#dfaaff",
    accent: "#39ffb0",
    core: "#e6ffe9",
    hazard: "#ffe66d",
  },
};

/* ------------------------------------------------------------------ *
 * Shared tuning constants
 * ------------------------------------------------------------------ */
export const TUNING = {
  baseForce: 0.74, // normalised lane units / s^2
  damping: 0.9, // per 1/60s frame
  playerHeatRate: 30, // ~3.3s of sustained fire before lockout
  playerCoolRate: 62, // venting is rapid — rewards tactical trigger discipline
  overheatLock: 2.5,
  warnHeat: 85,
  /* ---- OVERCHARGE ---- */
  ocGain: 17, // meter % per second of effective pushing
  ocVentBonus: 9, // meter % awarded for a clean vent
  ocDuration: 1.35, // seconds of unstoppable blast
  ocForce: 2.55, // force multiplier during the blast
  /* ---- PUSH STREAK ---- */
  streakMax: 4.5, // seconds to reach the cap
  streakBonus: 0.28, // extra force at full streak
};

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace("#", ""), 16);
  const pb = parseInt(b.replace("#", ""), 16);
  const ar = (pa >> 16) & 255,
    ag = (pa >> 8) & 255,
    ab = pa & 255;
  const br = (pb >> 16) & 255,
    bg = (pb >> 8) & 255,
    bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}
