import { useEffect, useState } from "react";
import {
  ARENAS,
  DIFFICULTIES,
  THEMES,
  type ArenaKey,
  type DifficultyKey,
  type Settings,
  type ThemeKey,
  hexToRgba,
} from "../game/config";
import { audio } from "../game/audio";
import type { Result } from "../game/engine";
import { MEDALS, rankFor, type Profile } from "../game/profile";

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onStart: () => void;
  lastResult: Result | null;
  profile: Profile;
  freshMedals: string[];
  onResetProfile: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

interface OptionProps {
  active: boolean;
  color: string;
  title: string;
  sub: string;
  onClick: () => void;
  wide?: boolean;
  badge?: string;
}

function OptionChip({ active, color, title, sub, onClick, wide, badge }: OptionProps) {
  return (
    <button
      type="button"
      onPointerDown={() => audio.uiHover()}
      onClick={onClick}
      className={`group relative flex ${wide ? "flex-1" : ""} min-w-0 flex-col items-start gap-0.5 overflow-hidden rounded-md border px-3 py-2 text-left transition-all duration-200 active:scale-[0.97]`}
      style={{
        borderColor: active ? color : "rgba(255,255,255,0.12)",
        background: active
          ? `linear-gradient(135deg, ${hexToRgba(color, 0.26)}, ${hexToRgba(color, 0.05)})`
          : "rgba(255,255,255,0.03)",
        boxShadow: active ? `0 0 22px ${hexToRgba(color, 0.42)}, inset 0 0 18px ${hexToRgba(color, 0.18)}` : "none",
      }}
    >
      <span
        className="font-display truncate text-[11px] font-bold tracking-widest sm:text-xs"
        style={{ color: active ? "#fff" : "rgba(226,240,255,0.66)", textShadow: active ? `0 0 12px ${color}` : "none" }}
      >
        {title}
      </span>
      <span className="truncate text-[10px] font-semibold tracking-wide" style={{ color: active ? hexToRgba(color, 0.95) : "rgba(180,205,230,0.45)" }}>
        {sub}
      </span>
      {active && <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />}
      {badge && (
        <span
          className="absolute right-1.5 top-1.5 text-[10px] font-black leading-none"
          style={{ color, textShadow: `0 0 10px ${color}` }}
          title="Defeated"
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-center">
      <div className="font-display text-sm font-black leading-none sm:text-base" style={{ color, textShadow: `0 0 14px ${hexToRgba(color, 0.6)}` }}>
        {value}
      </div>
      <div className="mt-1 text-[8px] font-bold tracking-[0.12em] text-slate-400/55">{label}</div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  on,
  color,
  onToggle,
  onText = "ON",
  offText = "OFF",
}: {
  label: string;
  hint: string;
  on: boolean;
  color: string;
  onToggle: () => void;
  onText?: string;
  offText?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-all active:scale-[0.97]"
      style={{
        borderColor: on ? hexToRgba(color, 0.6) : "rgba(255,255,255,0.12)",
        background: on ? hexToRgba(color, 0.12) : "rgba(255,255,255,0.03)",
        boxShadow: on ? `0 0 18px ${hexToRgba(color, 0.28)}` : "none",
      }}
    >
      <span className="min-w-0">
        <span className="font-display block truncate text-[10px] font-bold tracking-[0.14em]" style={{ color: on ? "#fff" : "rgba(226,240,255,0.6)" }}>
          {label}
        </span>
        <span className="block truncate text-[9px] font-semibold text-slate-400/55">{hint}</span>
      </span>
      <span
        className="font-display shrink-0 rounded px-2 py-0.5 text-[9px] font-black tracking-wider"
        style={{ background: on ? color : "rgba(255,255,255,0.1)", color: on ? "#04121a" : "rgba(255,255,255,0.4)" }}
      >
        {on ? onText : offText}
      </span>
    </button>
  );
}

function SectionLabel({ index, label, hint }: { index: string; label: string; hint: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <span className="font-display text-[10px] font-bold text-cyan-300/50">{index}</span>
      <span className="font-display text-[11px] font-bold tracking-[0.22em] text-slate-200/90 sm:text-xs">{label}</span>
      <span className="ml-auto truncate text-[10px] font-semibold tracking-wide text-slate-400/60">{hint}</span>
    </div>
  );
}

export default function HomeScreen({
  settings,
  onChange,
  onStart,
  lastResult,
  profile,
  freshMedals,
  onResetProfile,
  muted,
  onToggleMute,
}: Props) {
  const theme = THEMES[settings.theme];
  const diff = DIFFICULTIES[settings.difficulty];
  const arena = ARENAS[settings.arena];
  const [leaving, setLeaving] = useState(false);
  const [tab, setTab] = useState<"setup" | "record" | "briefing">("setup");
  const rank = rankFor(profile);
  const games = profile.wins + profile.losses;
  const winRate = games ? Math.round((profile.wins / games) * 100) : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Enter") {
        e.preventDefault();
        handleStart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = () => {
    audio.init();
    audio.uiClick();
    setLeaving(true);
    window.setTimeout(onStart, 380);
  };

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    audio.init();
    audio.uiClick();
    onChange({ ...settings, [key]: value });
  };

  return (
    <div
      className={`relative h-full w-full overflow-hidden transition-opacity duration-300 ${leaving ? "opacity-0" : "opacity-100"}`}
      style={{ background: `radial-gradient(ellipse at 50% 40%, ${theme.bg1} 0%, ${theme.bg0} 62%, #01020a 100%)` }}
    >
      {/* ambient layers */}
      <div className="bg-grid bg-grid-anim pointer-events-none absolute inset-0 opacity-50" />
      <div
        className="aurora-a pointer-events-none absolute -left-40 top-[-18%] h-[70vh] w-[70vh] rounded-full blur-[110px]"
        style={{ background: hexToRgba(theme.player, 0.3) }}
      />
      <div
        className="aurora-b pointer-events-none absolute -right-40 bottom-[-22%] h-[75vh] w-[75vh] rounded-full blur-[120px]"
        style={{ background: hexToRgba(theme.bot, 0.28) }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
        style={{ background: `linear-gradient(90deg, transparent, ${hexToRgba(theme.accent, 0.5)}, transparent)` }}
      />

      {/* top utility bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: theme.player, boxShadow: `0 0 10px ${theme.player}` }} />
          <span
            className="font-display rounded border px-2 py-1 text-[9px] font-bold tracking-[0.18em]"
            style={{ borderColor: hexToRgba(rank.color, 0.5), color: rank.color, background: hexToRgba(rank.color, 0.1) }}
          >
            {rank.name}
          </span>
          {games > 0 && (
            <span className="font-display hidden text-[9px] tracking-[0.2em] text-slate-400/45 sm:inline">
              {profile.wins}W · {profile.losses}L{profile.streak > 1 ? ` · 🔥${profile.streak}` : ""}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            audio.init();
            audio.uiClick();
            onToggleMute();
          }}
          className="font-display rounded border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] tracking-[0.18em] text-slate-200/80 backdrop-blur transition hover:border-white/40 hover:text-white"
        >
          {muted ? "🔇 AUDIO OFF" : "🔊 AUDIO ON"}
        </button>
      </div>

      {/* main panel */}
      <div className="menu-scroll relative z-10 flex h-full w-full justify-center overflow-y-auto px-4 py-12 sm:py-16">
        <div className="fade-up my-auto w-full max-w-3xl">
          {/* title */}
          <div className="mb-5 text-center sm:mb-7">
            <div className="font-display mb-2 text-[10px] font-bold tracking-[0.5em] text-slate-300/45 sm:text-[11px]">
              NEON DUEL PROTOCOL //{" "}
              <span style={{ color: theme.player, textShadow: `0 0 12px ${theme.player}` }}>v3.1 — 2-PLAYER UPDATE</span>
            </div>
            <h1 className="title-flicker font-display text-[7.4vw] font-black leading-[1.02] tracking-tight sm:text-5xl md:text-[3.6rem]">
              <span
                className="block"
                style={{
                  color: "#eafcff",
                  textShadow: `0 0 8px ${theme.player}, 0 0 28px ${hexToRgba(theme.player, 0.85)}, 0 0 70px ${hexToRgba(theme.player, 0.5)}`,
                }}
              >
                LASER TUG-OF-WAR
              </span>
              <span
                className="mt-1 block text-[9.4vw] sm:text-6xl md:text-[4.4rem]"
                style={{
                  color: "#fff",
                  textShadow: `0 0 10px ${theme.bot}, 0 0 34px ${hexToRgba(theme.bot, 0.9)}, 0 0 80px ${hexToRgba(theme.bot, 0.55)}`,
                }}
              >
                OVERDRIVE
              </span>
            </h1>
            <p className="mx-auto mt-3 max-w-md text-[13px] font-semibold tracking-[0.12em] text-slate-300/75 sm:text-base">
              {settings.mode === "local" ? "Outpush your friend. Balance your heat. " : "Overpower the bot. Balance your heat. "}
              <span style={{ color: theme.hazard, textShadow: `0 0 14px ${theme.hazard}` }}>Don&apos;t overheat.</span>
            </p>
            {lastResult && (
              <div
                className="font-display mt-3 inline-block rounded-full border px-4 py-1 text-[10px] tracking-[0.22em]"
                style={{
                  borderColor: lastResult === "win" ? "rgba(57,255,150,0.5)" : "rgba(255,60,80,0.5)",
                  color: lastResult === "win" ? "#39ff96" : "#ff5b70",
                  boxShadow: `0 0 20px ${lastResult === "win" ? "rgba(57,255,150,0.25)" : "rgba(255,60,80,0.25)"}`,
                }}
              >
                LAST DUEL: {lastResult === "win" ? "VICTORY" : "DEFEAT"} — TWEAK & RUN IT BACK
              </div>
            )}
          </div>

          {/* what's new ribbon */}
          <div
            className="relative mb-3 flex items-center gap-2 overflow-hidden rounded-md border py-1.5"
            style={{
              borderColor: hexToRgba(theme.player, 0.45),
              background: `linear-gradient(90deg, ${hexToRgba(theme.player, 0.16)}, ${hexToRgba(theme.bot, 0.14)})`,
              boxShadow: `0 0 24px ${hexToRgba(theme.player, 0.25)}`,
            }}
          >
            <span
              className="font-display z-10 shrink-0 rounded-r px-2.5 py-1 text-[9px] font-black tracking-[0.18em] text-black"
              style={{ background: theme.player, boxShadow: `0 0 16px ${theme.player}` }}
            >
              NEW
            </span>
            <div className="marquee-track">
              {[0, 1].map((dup) => (
                <div key={dup} className="flex shrink-0 items-center gap-6 pr-6">
                  {[
                    "👥 LOCAL DUEL — play a friend on one device",
                    "🏆 BEST-OF-3 / BEST-OF-5 series scoring",
                    "⚡ OVERCHARGE — bankable 2.5× unblockable blast",
                    "📈 PUSH STREAK multiplier up to ×1.28",
                    "❄ COOLANT NODES + ▲ AMPLIFIER GATES",
                    "🎬 CLUTCH SLOW-MO & live fight callouts",
                    "🏅 8 MEDALS + persistent pilot rank",
                    "⚙ MATCH MODIFIERS — hazards / overcharge / FX",
                  ].map((s) => (
                    <span key={s} className="whitespace-nowrap text-[10px] font-bold tracking-[0.1em] text-white/85 sm:text-[11px]">
                      {s}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* settings */}
          <div className="clip-notch relative border border-white/10 bg-[rgba(6,10,22,0.72)] p-4 backdrop-blur-xl sm:p-6">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div
                className="scan-sweep absolute inset-y-0 w-1/3 opacity-30"
                style={{ background: `linear-gradient(90deg, transparent, ${hexToRgba(theme.accent, 0.22)}, transparent)` }}
              />
            </div>

            {/* tab strip */}
            <div className="relative mb-4 flex gap-1 rounded-md border border-white/10 bg-black/40 p-1">
              {([
                ["setup", "⚙ SETUP"],
                ["record", "◆ RECORD"],
                ["briefing", "? BRIEFING"],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    audio.init();
                    audio.uiClick();
                    setTab(k);
                  }}
                  className="font-display relative flex-1 rounded px-2 py-1.5 text-[10px] font-bold tracking-[0.16em] transition-all sm:text-[11px]"
                  style={{
                    background: tab === k ? hexToRgba(theme.player, 0.18) : "transparent",
                    color: tab === k ? "#fff" : "rgba(190,215,240,0.5)",
                    boxShadow: tab === k ? `inset 0 0 0 1px ${hexToRgba(theme.player, 0.5)}` : "none",
                  }}
                >
                  {label}
                  {k !== "setup" && tab !== k && (
                    <span
                      className="new-dot absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
                      style={{ background: "#39ff96", boxShadow: "0 0 8px #39ff96" }}
                    />
                  )}
                </button>
              ))}
            </div>

            {tab === "record" && (
              <div className="fade-up relative space-y-3">
                {/* rank */}
                <div className="rounded-md border border-white/10 bg-black/30 p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-[10px] tracking-[0.24em] text-slate-400/60">PILOT RANK</span>
                    <span className="font-display text-[10px] tracking-[0.18em] text-slate-400/50">NEXT: {rank.next}</span>
                  </div>
                  <div
                    className="font-display mt-1 text-xl font-black tracking-widest sm:text-2xl"
                    style={{ color: rank.color, textShadow: `0 0 20px ${hexToRgba(rank.color, 0.7)}` }}
                  >
                    {rank.name}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${rank.progress * 100}%`, background: rank.color, boxShadow: `0 0 12px ${rank.color}` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  <Mini label="WINS" value={`${profile.wins}`} color="#39ff96" />
                  <Mini label="LOSSES" value={`${profile.losses}`} color="#ff5b70" />
                  <Mini label="WIN %" value={`${winRate}%`} color={theme.player} />
                  <Mini label="STREAK" value={`${profile.streak}`} color={theme.hazard} />
                  <Mini label="BEST RUN" value={`${profile.bestStreak}`} color={theme.accent} />
                  <Mini label="FASTEST" value={profile.fastestWin ? `${profile.fastestWin.toFixed(1)}s` : "—"} color={theme.bot} />
                </div>

                {/* conquests */}
                <div>
                  <div className="font-display mb-1.5 text-[10px] tracking-[0.24em] text-slate-400/60">BOTS DEFEATED</div>
                  <div className="grid grid-cols-4 gap-2">
                    {(Object.keys(DIFFICULTIES) as DifficultyKey[]).map((k) => {
                      const done = !!profile.beaten[k];
                      return (
                        <div
                          key={k}
                          className="rounded border px-2 py-1.5 text-center"
                          style={{
                            borderColor: done ? hexToRgba(DIFFICULTIES[k].accent, 0.6) : "rgba(255,255,255,0.1)",
                            background: done ? hexToRgba(DIFFICULTIES[k].accent, 0.12) : "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div className="text-xs leading-none" style={{ color: done ? DIFFICULTIES[k].accent : "rgba(255,255,255,0.2)" }}>
                            {done ? "✓" : "○"}
                          </div>
                          <div
                            className="font-display mt-1 text-[8px] font-bold tracking-[0.1em]"
                            style={{ color: done ? "#fff" : "rgba(190,215,240,0.35)" }}
                          >
                            {DIFFICULTIES[k].name}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* medal case */}
                <div>
                  <div className="font-display mb-1.5 flex items-baseline justify-between text-[10px] tracking-[0.24em] text-slate-400/60">
                    <span>MEDAL CASE</span>
                    <span>
                      {profile.medals.length}/{MEDALS.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                    {MEDALS.map((m) => {
                      const has = profile.medals.includes(m.id);
                      const isNew = freshMedals.includes(m.id);
                      return (
                        <div
                          key={m.id}
                          title={`${m.name} — ${m.desc}`}
                          className={`relative flex aspect-square items-center justify-center rounded border text-lg ${isNew ? "btn-pulse" : ""}`}
                          style={{
                            borderColor: has ? hexToRgba(m.color, 0.6) : "rgba(255,255,255,0.08)",
                            background: has ? hexToRgba(m.color, 0.12) : "rgba(255,255,255,0.02)",
                            color: has ? m.color : "rgba(255,255,255,0.14)",
                            textShadow: has ? `0 0 14px ${m.color}` : "none",
                          }}
                        >
                          {m.icon}
                          {isNew && (
                            <span className="absolute -right-1 -top-1 rounded-full bg-emerald-400 px-1 text-[7px] font-black text-black">
                              NEW
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    audio.uiClick();
                    onResetProfile();
                  }}
                  className="font-display w-full rounded border border-white/10 px-3 py-2 text-[9px] tracking-[0.2em] text-slate-400/50 transition hover:border-red-400/50 hover:text-red-300/80"
                >
                  RESET COMBAT RECORD
                </button>
              </div>
            )}

            {tab === "briefing" && (
              <div className="fade-up relative space-y-2.5 text-left">
                {[
                  { i: "👥", t: "LOCAL DUEL (2 PLAYERS)", d: "Pick LOCAL DUEL in Setup. On mobile, P1 holds the LEFT half of the screen and P2 the RIGHT — both thumbs work at once. On desktop P1 uses A/F/Space and P2 uses L/↓/;. Run a best-of-3 or 5 to settle it." },
                  { i: "🔫", t: "HOLD TO FIRE", d: "Space / F / click / touch anywhere. Your beam shoves the Power Core toward the bot's baseline." },
                  { i: "🌡", t: "HEAT IS THE GAME", d: "Firing builds heat. Hit 100% and you're locked out for 2.5 seconds — a free push for the bot. Release to vent fast." },
                  { i: "❄", t: "CLEAN VENT", d: "Release between 88–99% heat for a perfect vent: max pressure, zero downtime, bonus overcharge." },
                  { i: "⚡", t: "OVERCHARGE", d: "Pressure fills the ⚡ meter. At 100%, hit Shift / right-click / the ⚡ button for 1.35s of unblockable 2.5× blast." },
                  { i: "📈", t: "PUSH STREAK", d: "Uninterrupted effective fire ramps your force up to ×1.28. Getting blocked or overheating resets it." },
                  { i: "◇", t: "DEFLECTOR FIELDS", d: "Absorb any normal beam that crosses them. Overcharge punches straight through." },
                  { i: "◈", t: "GRAVITY ANOMALIES", d: "Pull or shove the core independently of either laser. Momentum can flip in an instant." },
                  { i: "▲", t: "SUPPORT NODES", d: "❄ Coolant nodes dump your heat when your beam passes through. ▲ Amplifier gates give 1.6× push." },
                ].map((r) => (
                  <div key={r.t} className="flex gap-3 rounded-md border border-white/8 bg-white/[0.03] p-2.5">
                    <div className="text-base leading-none">{r.i}</div>
                    <div className="min-w-0">
                      <div className="font-display text-[10px] font-bold tracking-[0.16em] text-white sm:text-[11px]">{r.t}</div>
                      <div className="mt-0.5 text-[11px] font-semibold leading-snug text-slate-300/60">{r.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className={`relative space-y-4 ${tab === "setup" ? "" : "hidden"}`}>
              {/* mode */}
              <div>
                <SectionLabel
                  index="00"
                  label="GAME MODE"
                  hint={settings.mode === "solo" ? "Duel the AI solo" : "Two players, one device"}
                />
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["solo", "SOLO VS BOT", "Beat the machine", theme.player],
                      ["local", "LOCAL DUEL", "👥 Play a friend", theme.bot],
                    ] as const
                  ).map(([k, title, sub, col]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => set("mode", k)}
                      className="relative overflow-hidden rounded-md border px-3 py-3 text-left transition-all active:scale-[0.97]"
                      style={{
                        borderColor: settings.mode === k ? col : "rgba(255,255,255,0.12)",
                        background:
                          settings.mode === k ? `linear-gradient(135deg, ${hexToRgba(col, 0.26)}, ${hexToRgba(col, 0.05)})` : "rgba(255,255,255,0.03)",
                        boxShadow: settings.mode === k ? `0 0 26px ${hexToRgba(col, 0.45)}` : "none",
                      }}
                    >
                      <div
                        className="font-display text-[12px] font-black tracking-[0.14em] sm:text-sm"
                        style={{ color: settings.mode === k ? "#fff" : "rgba(226,240,255,0.66)", textShadow: settings.mode === k ? `0 0 14px ${col}` : "none" }}
                      >
                        {title}
                      </div>
                      <div className="mt-0.5 text-[10px] font-semibold" style={{ color: settings.mode === k ? hexToRgba(col, 0.95) : "rgba(180,205,230,0.45)" }}>
                        {sub}
                      </div>
                      {k === "local" && (
                        <span
                          className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-[7px] font-black tracking-wider"
                          style={{ background: "#39ff96", color: "#02140a" }}
                        >
                          NEW
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* series length — local only */}
              {settings.mode === "local" && (
                <div className="fade-up">
                  <SectionLabel index="00b" label="SERIES LENGTH" hint="How many rounds to settle it" />
                  <div className="grid grid-cols-3 gap-2">
                    {([1, 3, 5] as const).map((n) => (
                      <OptionChip
                        key={n}
                        active={settings.series === n}
                        color={theme.hazard}
                        title={n === 1 ? "SINGLE" : `BEST OF ${n}`}
                        sub={n === 1 ? "One and done" : `First to ${Math.ceil(n / 2)}`}
                        onClick={() => set("series", n)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className={settings.mode === "local" ? "pointer-events-none opacity-35" : ""}>
                <SectionLabel
                  index="01"
                  label="BOT DIFFICULTY"
                  hint={settings.mode === "local" ? "Not used in local duels" : diff.blurb}
                />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(Object.keys(DIFFICULTIES) as DifficultyKey[]).map((k) => (
                    <OptionChip
                      key={k}
                      active={settings.difficulty === k}
                      color={DIFFICULTIES[k].accent}
                      title={DIFFICULTIES[k].name}
                      sub={"▰".repeat(DIFFICULTIES[k].threat) + "▱".repeat(4 - DIFFICULTIES[k].threat)}
                      badge={profile.beaten[k] ? "✓" : undefined}
                      onClick={() => set("difficulty", k)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <SectionLabel index="02" label="ARENA SIZE" hint={arena.blurb} />
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(ARENAS) as ArenaKey[]).map((k) => (
                    <OptionChip
                      key={k}
                      active={settings.arena === k}
                      color={theme.accent}
                      title={ARENAS[k].name}
                      sub={ARENAS[k].tag}
                      onClick={() => set("arena", k)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <SectionLabel index="03" label="MATCH MODIFIERS" hint="Tune the chaos & performance" />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Toggle
                    label="LANE HAZARDS"
                    hint="Shields, wells, nodes"
                    on={settings.hazards}
                    color={theme.hazard}
                    onToggle={() => set("hazards", !settings.hazards)}
                  />
                  <Toggle
                    label="OVERCHARGE"
                    hint="Bankable mega-blast"
                    on={settings.overcharge}
                    color={theme.player}
                    onToggle={() => set("overcharge", !settings.overcharge)}
                  />
                  <Toggle
                    label="CINEMATIC FX"
                    hint="Particles & fringe"
                    on={settings.fx === "full"}
                    color={theme.accent}
                    onToggle={() => set("fx", settings.fx === "full" ? "reduced" : "full")}
                    onText="FULL"
                    offText="LITE"
                  />
                </div>
              </div>

              <div>
                <SectionLabel index="04" label="ARENA THEME" hint={`${theme.name} — ${theme.tag}`} />
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(THEMES) as ThemeKey[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => set("theme", k)}
                      className="group relative overflow-hidden rounded-md border px-3 py-2 text-left transition-all duration-200 active:scale-[0.97]"
                      style={{
                        borderColor: settings.theme === k ? THEMES[k].player : "rgba(255,255,255,0.12)",
                        background:
                          settings.theme === k
                            ? `linear-gradient(135deg, ${hexToRgba(THEMES[k].player, 0.22)}, ${hexToRgba(THEMES[k].bot, 0.2)})`
                            : "rgba(255,255,255,0.03)",
                        boxShadow: settings.theme === k ? `0 0 22px ${hexToRgba(THEMES[k].player, 0.4)}` : "none",
                      }}
                    >
                      <div className="mb-1 flex gap-1">
                        {[THEMES[k].player, THEMES[k].bot, THEMES[k].accent].map((c) => (
                          <span key={c} className="h-2 w-5 rounded-sm" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
                        ))}
                      </div>
                      <div
                        className="font-display truncate text-[11px] font-bold tracking-widest"
                        style={{ color: settings.theme === k ? "#fff" : "rgba(226,240,255,0.66)" }}
                      >
                        {THEMES[k].name}
                      </div>
                      <div className="truncate text-[10px] font-semibold text-slate-400/60">{THEMES[k].tag}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* start */}
          <div className="mt-5 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={handleStart}
              className="btn-pulse font-display relative w-full max-w-md overflow-hidden rounded-lg border-2 px-8 py-4 text-lg font-black tracking-[0.25em] text-[#031a0e] transition-transform duration-150 active:scale-95 sm:text-xl"
              style={{
                borderColor: "#39ff96",
                background: "linear-gradient(180deg, #7dffbe 0%, #22e07f 55%, #12b863 100%)",
              }}
            >
              {settings.mode === "local" ? (settings.series > 1 ? `START BEST OF ${settings.series}` : "START LOCAL DUEL") : "START DUEL"}
              <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,0.55)_45%,transparent_62%)] opacity-80" />
            </button>
            {settings.mode === "local" ? (
              <div className="grid w-full max-w-md grid-cols-2 gap-2">
                {(
                  [
                    ["PLAYER 1", theme.player, "LEFT half of screen", "A / F / SPACE", "Q / E / L-SHIFT"],
                    ["PLAYER 2", theme.bot, "RIGHT half of screen", "L / ↓ / ;", "P / / / R-SHIFT"],
                  ] as const
                ).map(([who, col, touch, fire, oc]) => (
                  <div
                    key={who}
                    className="rounded-md border px-3 py-2 text-left"
                    style={{ borderColor: hexToRgba(col, 0.4), background: hexToRgba(col, 0.07) }}
                  >
                    <div className="font-display text-[10px] font-black tracking-[0.16em]" style={{ color: col }}>
                      {who}
                    </div>
                    <div className="mt-1 space-y-0.5 text-[9px] font-semibold leading-snug text-slate-300/65">
                      <div>📱 {touch}</div>
                      <div>🔫 {fire}</div>
                      {settings.overcharge && <div>⚡ {oc}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-[11px] font-semibold leading-relaxed tracking-[0.14em] text-slate-400/60">
                HOLD <span className="rounded border border-white/20 px-1.5 py-0.5 text-slate-200">SPACE</span> / CLICK / TOUCH TO FIRE — RELEASE
                TO COOL
                {settings.overcharge && (
                  <>
                    <br />
                    <span className="rounded border border-white/20 px-1.5 py-0.5 text-slate-200">SHIFT</span> / RIGHT-CLICK / ⚡ BUTTON TO
                    OVERCHARGE
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
