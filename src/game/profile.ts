import type { DifficultyKey } from "./config";
import type { MatchStats, Result } from "./engine";

/* ------------------------------------------------------------------ *
 * Medals — awarded on the post-game overlay
 * ------------------------------------------------------------------ */
export interface Medal {
  id: string;
  icon: string;
  name: string;
  desc: string;
  color: string;
  test: (s: MatchStats, r: Result, diff: DifficultyKey) => boolean;
}

export const MEDALS: Medal[] = [
  {
    id: "flawless",
    icon: "❖",
    name: "FLAWLESS CORE",
    desc: "Won without a single overheat",
    color: "#39ff96",
    test: (s, r) => r === "win" && s.overheats === 0,
  },
  {
    id: "blitz",
    icon: "⟫",
    name: "BLITZ PROTOCOL",
    desc: "Won in under 25 seconds",
    color: "#2ff6ff",
    test: (s, r) => r === "win" && s.elapsed < 25,
  },
  {
    id: "comeback",
    icon: "⟲",
    name: "COMEBACK KING",
    desc: "Won after being pushed to the brink",
    color: "#ffd24a",
    test: (s, r) => r === "win" && s.minLead < -0.3,
  },
  {
    id: "icecold",
    icon: "❄",
    name: "ICE COLD",
    desc: "3+ clean vents in the red zone",
    color: "#8affff",
    test: (s) => s.cleanVents >= 3,
  },
  {
    id: "meltdown",
    icon: "☢",
    name: "MELTDOWN ENGINEER",
    desc: "Forced 3+ bot overheats",
    color: "#ff8a1f",
    test: (s) => s.botOverheats >= 3,
  },
  {
    id: "overkill",
    icon: "⚡",
    name: "OVERKILL",
    desc: "Landed 2+ overcharge bursts",
    color: "#ff3df0",
    test: (s) => s.overchargesUsed >= 2,
  },
  {
    id: "giantslayer",
    icon: "★",
    name: "GIANT SLAYER",
    desc: "Beat the Impossible bot",
    color: "#ff2d6f",
    test: (_s, r, d) => r === "win" && d === "impossible",
  },
  {
    id: "marathon",
    icon: "∞",
    name: "WAR OF ATTRITION",
    desc: "Survived a 90 second duel",
    color: "#b14cff",
    test: (s) => s.elapsed >= 90,
  },
];

export function awardMedals(stats: MatchStats, result: Result, diff: DifficultyKey): Medal[] {
  return MEDALS.filter((m) => m.test(stats, result, diff));
}

/* ------------------------------------------------------------------ *
 * Persistent combat record
 * ------------------------------------------------------------------ */
export interface Profile {
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  fastestWin: number | null;
  totalOverheats: number;
  totalCleanVents: number;
  beaten: Partial<Record<DifficultyKey, boolean>>;
  medals: string[];
}

export const EMPTY_PROFILE: Profile = {
  wins: 0,
  losses: 0,
  streak: 0,
  bestStreak: 0,
  fastestWin: null,
  totalOverheats: 0,
  totalCleanVents: 0,
  beaten: {},
  medals: [],
};

const KEY = "ltow-overdrive-profile";

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY_PROFILE };
    return { ...EMPTY_PROFILE, ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

export function applyMatch(p: Profile, result: Result, stats: MatchStats, diff: DifficultyKey, medals: Medal[]): Profile {
  const next: Profile = {
    ...p,
    beaten: { ...p.beaten },
    medals: [...new Set([...p.medals, ...medals.map((m) => m.id)])],
    totalOverheats: p.totalOverheats + stats.overheats,
    totalCleanVents: p.totalCleanVents + stats.cleanVents,
  };
  if (result === "win") {
    next.wins = p.wins + 1;
    next.streak = p.streak + 1;
    next.bestStreak = Math.max(p.bestStreak, next.streak);
    next.fastestWin = p.fastestWin === null ? stats.elapsed : Math.min(p.fastestWin, stats.elapsed);
    next.beaten[diff] = true;
  } else {
    next.losses = p.losses + 1;
    next.streak = 0;
  }
  return next;
}

/** Pilot rank derived from lifetime performance. */
export function rankFor(p: Profile): { name: string; color: string; next: string; progress: number } {
  const score = p.wins * 10 + p.bestStreak * 6 + p.medals.length * 8 + (p.beaten.impossible ? 45 : 0) + (p.beaten.hard ? 20 : 0);
  const tiers = [
    { at: 0, name: "SCRAP ROOKIE", color: "#8fa3c0" },
    { at: 25, name: "ARC TECHNICIAN", color: "#2ff6ff" },
    { at: 60, name: "BEAM DUELIST", color: "#39ff96" },
    { at: 110, name: "HEAT MASTER", color: "#ffd24a" },
    { at: 175, name: "OVERDRIVE ACE", color: "#ff8a1f" },
    { at: 260, name: "NEON LEGEND", color: "#ff2d6f" },
  ];
  let idx = 0;
  for (let i = 0; i < tiers.length; i++) if (score >= tiers[i].at) idx = i;
  const cur = tiers[idx];
  const nxt = tiers[Math.min(idx + 1, tiers.length - 1)];
  const span = Math.max(1, nxt.at - cur.at);
  return {
    name: cur.name,
    color: cur.color,
    next: idx === tiers.length - 1 ? "MAX RANK" : nxt.name,
    progress: idx === tiers.length - 1 ? 1 : Math.min(1, (score - cur.at) / span),
  };
}
