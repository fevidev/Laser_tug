import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ARENAS, DIFFICULTIES, THEMES, hexToRgba, type Settings } from "../game/config";
import { LaserDuel, type MatchStats, type Result } from "../game/engine";
import { audio } from "../game/audio";
import { awardMedals, type Medal } from "../game/profile";

interface Props {
  settings: Settings;
  onHome: (result: Result | null) => void;
  onMatchEnd: (result: Result, stats: MatchStats, medals: Medal[]) => void;
  muted: boolean;
  onToggleMute: () => void;
}

const NEEDED = (series: number) => Math.ceil(series / 2);

export default function GameScreen({ settings, onHome, onMatchEnd, muted, onToggleMute }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<LaserDuel | null>(null);
  const timerRef = useRef<HTMLSpanElement | null>(null);
  const [runId, setRunId] = useState(0);
  const [count, setCount] = useState<string | null>("3");
  const [result, setResult] = useState<Result | null>(null);
  const [stats, setStats] = useState<MatchStats | null>(null);
  const [hintGone, setHintGone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [ocReady, setOcReady] = useState(false);
  const [ocActive, setOcActive] = useState(false);
  const [ocReady2, setOcReady2] = useState(false);
  const [ocActive2, setOcActive2] = useState(false);
  const [copied, setCopied] = useState(false);
  const [score, setScore] = useState<{ p1: number; p2: number }>({ p1: 0, p2: 0 });
  const local = settings.mode === "local";
  const need = NEEDED(settings.series);

  const theme = THEMES[settings.theme];
  const diff = DIFFICULTIES[settings.difficulty];
  const arena = ARENAS[settings.arena];

  /* ---------------------------------------------------- engine boot */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setCount("3");
    setResult(null);
    setStats(null);
    setHintGone(false);
    const engine = new LaserDuel(canvas, settings, {
      onCountdown: (label) => setCount(label),
      onEnd: (r, s) => {
        setResult(r);
        setStats(s);
        setScore((prev) => (r === "win" ? { ...prev, p1: prev.p1 + 1 } : { ...prev, p2: prev.p2 + 1 }));
        // only solo duels feed the pilot profile
        if (settings.mode === "solo") onMatchEnd(r, s, awardMedals(s, r, settings.difficulty));
      },
    });
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [settings, runId]);

  /* ---------------------------------------------------- input */
  const press = useCallback((on: boolean, p2 = false) => {
    const e = engineRef.current;
    if (!e) return;
    if (p2) e.inputFiring2 = on;
    else e.inputFiring = on;
    if (on) setHintGone(true);
  }, []);

  const fireOvercharge = useCallback(() => {
    const e = engineRef.current;
    if (e?.triggerOvercharge()) setOcReady(false);
  }, []);

  const fireOvercharge2 = useCallback(() => {
    const e = engineRef.current;
    if (e?.triggerOvercharge2()) setOcReady2(false);
  }, []);

  /** which half of the screen a pointer landed on (local duel) */
  const sideOf = useCallback((clientX: number) => (clientX < window.innerWidth / 2 ? 1 : 2), []);

  /** Hard exit — abandons the match/series and returns to the main menu. */
  const exitToMenu = useCallback(() => {
    audio.uiClick();
    press(false);
    press(false, true);
    setScore({ p1: 0, p2: 0 });
    setLeaving(true);
    window.setTimeout(() => onHome(null), 350);
  }, [press, onHome]);

  useEffect(() => {
    const isUi = (t: EventTarget | null) => t instanceof Element && !!t.closest("[data-ui]");

    // track which pointer belongs to which player so two thumbs work at once
    const owners = new Map<number, 1 | 2>();

    const onDown = (e: PointerEvent) => {
      if (isUi(e.target)) return;
      e.preventDefault();
      audio.init();
      // right mouse button unleashes the overcharge
      if (e.button === 2) {
        if (local && sideOf(e.clientX) === 2) fireOvercharge2();
        else fireOvercharge();
        return;
      }
      if (local) {
        const who = sideOf(e.clientX);
        owners.set(e.pointerId, who);
        press(true, who === 2);
      } else {
        press(true);
      }
    };
    const onUp = (e?: PointerEvent) => {
      if (local && e) {
        const who = owners.get(e.pointerId);
        owners.delete(e.pointerId);
        if (who) press(false, who === 2);
        else {
          press(false);
          press(false, true);
        }
        return;
      }
      press(false);
    };

    // P1 = Space / F / A · P2 = L / ' / ArrowDown
    const P1_FIRE = ["Space", "KeyF", "KeyA"];
    const P2_FIRE = ["KeyL", "ArrowDown", "Quote", "Semicolon"];
    const P1_OC = ["ShiftLeft", "KeyE", "KeyQ"];
    const P2_OC = ["ShiftRight", "KeyP", "Slash", "ArrowRight"];

    const onKeyDown = (e: KeyboardEvent) => {
      // Esc always bails out to the main menu
      if (e.code === "Escape") {
        e.preventDefault();
        exitToMenu();
        return;
      }
      if (P1_OC.includes(e.code)) {
        e.preventDefault();
        if (!e.repeat) {
          audio.init();
          fireOvercharge();
        }
        return;
      }
      if (local && P2_OC.includes(e.code)) {
        e.preventDefault();
        if (!e.repeat) {
          audio.init();
          fireOvercharge2();
        }
        return;
      }
      if (P1_FIRE.includes(e.code) || (!local && e.code === "ArrowUp")) {
        e.preventDefault();
        if (e.repeat) return;
        audio.init();
        press(true);
        return;
      }
      if (local && P2_FIRE.includes(e.code)) {
        e.preventDefault();
        if (e.repeat) return;
        audio.init();
        press(true, true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (P1_FIRE.includes(e.code) || (!local && e.code === "ArrowUp")) press(false);
      if (local && P2_FIRE.includes(e.code)) press(false, true);
    };
    const onBlur = () => {
      owners.clear();
      press(false);
      press(false, true);
    };
    const onCtx = (e: MouseEvent) => e.preventDefault();

    window.addEventListener("pointerdown", onDown, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("contextmenu", onCtx);
    document.addEventListener("visibilitychange", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("visibilitychange", onBlur);
    };
  }, [press, local, sideOf, fireOvercharge, fireOvercharge2, exitToMenu]);

  /* ---------------------------------------------------- clock */
  useEffect(() => {
    const id = window.setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      if (timerRef.current) {
        const s = e.getElapsed();
        timerRef.current.textContent = `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
      }
      const hud = e.getHudState();
      setOcReady((v) => (v === hud.ocReady ? v : hud.ocReady));
      setOcActive((v) => (v === hud.ocActive ? v : hud.ocActive));
      setOcReady2((v) => (v === hud.ocReady2 ? v : hud.ocReady2));
      setOcActive2((v) => (v === hud.ocActive2 ? v : hud.ocActive2));
    }, 80);
    return () => window.clearInterval(id);
  }, []);

  const medals = useMemo(
    () => (result && stats ? awardMedals(stats, result, settings.difficulty) : []),
    [result, stats, settings.difficulty],
  );

  const shareText = useMemo(() => {
    if (!result || !stats) return "";
    const m = medals.map((x) => `${x.icon} ${x.name}`).join(" · ");
    return [
      `LASER TUG-OF-WAR: OVERDRIVE`,
      `${result === "win" ? "VICTORY — BOT CRUSHED" : "DEFEAT — OVERHEATED & OUTSMARTED"}`,
      local ? `Local duel | Lane: ${arena.name} | Theme: ${theme.name}` : `Bot: ${diff.name} | Lane: ${arena.name} | Theme: ${theme.name}`,
      `Time ${stats.elapsed.toFixed(1)}s · Clean vents ${stats.cleanVents} · Overheats ${stats.overheats} · Bot melts ${stats.botOverheats} · Overcharges ${stats.overchargesUsed}`,
      m ? `Medals: ${m}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [result, stats, medals, diff.name, arena.name, theme.name]);

  const copyCard = async () => {
    audio.uiClick();
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const goHome = () => {
    audio.uiClick();
    setLeaving(true);
    window.setTimeout(() => onHome(result), 350);
  };
  const rematch = () => {
    audio.uiClick();
    press(false);
    press(false, true);
    // a fresh series resets the scoreboard
    if (local && (score.p1 >= need || score.p2 >= need || settings.series === 1)) setScore({ p1: 0, p2: 0 });
    setRunId((v) => v + 1);
  };



  const won = result === "win";
  const nextScore = { p1: score.p1, p2: score.p2 };
  const seriesOver = settings.series === 1 || nextScore.p1 >= need || nextScore.p2 >= need;
  const seriesWinnerP1 = nextScore.p1 > nextScore.p2;

  // headline text adapts to mode + series state
  const headline = local
    ? seriesOver && settings.series > 1
      ? seriesWinnerP1
        ? "PLAYER 1 TAKES THE SERIES"
        : "PLAYER 2 TAKES THE SERIES"
      : won
        ? "PLAYER 1 WINS"
        : "PLAYER 2 WINS"
    : won
      ? "VICTORY"
      : "DEFEAT";
  const subline = local
    ? won
      ? "LEFT EMITTER DOMINATES"
      : "RIGHT EMITTER DOMINATES"
    : won
      ? "BOT CRUSHED"
      : "OVERHEATED & OUTSMARTED";
  // in a local duel green/red framing is unfair — colour by who won
  const accentWin = local ? (won ? theme.player : theme.bot) : won ? "#39ff96" : "#ff2f45";

  return (
    <div
      className={`arena-root screen-in scanlines relative h-full w-full overflow-hidden transition-opacity duration-300 ${leaving ? "opacity-0" : "opacity-100"}`}
      style={{ background: theme.bg0, cursor: result ? "default" : "crosshair" }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />

      {/* ---------------------------------------------- top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 px-3 py-2 sm:px-5 sm:py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {local ? (
            <Chip color={theme.accent} label={settings.series > 1 ? `P1 ${score.p1} — ${score.p2} P2` : "LOCAL DUEL"} />
          ) : (
            <Chip color={diff.accent} label={diff.name} />
          )}
          <Chip color={theme.accent} label={arena.name} />
          <span className="hidden sm:inline-block">
            <Chip color={theme.bot} label={theme.name} />
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="font-display rounded border border-white/12 bg-black/45 px-2.5 py-1 text-[11px] tracking-[0.16em] text-slate-200/85 backdrop-blur"
            style={{ minWidth: 62, textAlign: "center" }}
          >
            <span ref={timerRef}>0:00.0</span>
          </div>
          <button
            data-ui
            type="button"
            onClick={() => {
              audio.uiClick();
              onToggleMute();
            }}
            className="pointer-events-auto font-display rounded border border-white/12 bg-black/45 px-2.5 py-1 text-[11px] tracking-[0.16em] text-slate-200/85 backdrop-blur transition hover:border-white/40 hover:text-white"
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button
            data-ui
            type="button"
            onClick={exitToMenu}
            title="Exit to main menu (Esc)"
            className="pointer-events-auto font-display rounded border border-white/12 bg-black/45 px-2.5 py-1 text-[11px] tracking-[0.16em] text-slate-200/85 backdrop-blur transition hover:border-red-400/60 hover:text-red-300"
          >
            ✕ EXIT
          </button>
        </div>
      </div>

      {/* ---------------------------------------------- split-screen touch guide */}
      {local && !result && (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-px -translate-x-1/2"
            style={{ background: `linear-gradient(to bottom, transparent, ${hexToRgba(theme.accent, 0.45)}, transparent)` }}
          />
          {(
            [
              ["left", "P1 ZONE", theme.player],
              ["right", "P2 ZONE", theme.bot],
            ] as const
          ).map(([side, label, col]) => (
            <div
              key={side}
              className={`pointer-events-none absolute bottom-2 z-10 ${side === "left" ? "left-3" : "right-3"} transition-opacity duration-700 ${
                hintGone ? "opacity-0" : "opacity-100"
              }`}
            >
              <span
                className="font-display rounded border px-2 py-1 text-[9px] font-bold tracking-[0.18em]"
                style={{ borderColor: hexToRgba(col, 0.5), color: col, background: "rgba(0,0,0,0.5)" }}
              >
                {label}
              </span>
            </div>
          ))}
        </>
      )}

      {/* ---------------------------------------------- P2 overcharge trigger */}
      {settings.overcharge && local && !result && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[16%] z-20 flex justify-end pr-4 sm:bottom-[14%] sm:pr-10">
          <button
            data-ui
            type="button"
            disabled={!ocReady2}
            onPointerDown={(e) => {
              e.stopPropagation();
              audio.init();
              fireOvercharge2();
            }}
            className={`pointer-events-auto font-display relative flex items-center gap-1.5 rounded-full border-2 px-4 py-2.5 text-xs font-black tracking-[0.18em] transition-all duration-200 sm:px-6 sm:py-3 sm:text-sm ${
              ocReady2 ? "scale-100 opacity-100 active:scale-90" : "scale-90 opacity-30"
            }`}
            style={{
              borderColor: ocActive2 ? "#ffffff" : ocReady2 ? theme.bot : "rgba(255,255,255,0.18)",
              color: ocReady2 ? "#120416" : "rgba(220,238,255,0.6)",
              background: ocActive2 ? "#ffffff" : ocReady2 ? `linear-gradient(180deg,#ffffff,${theme.bot})` : "rgba(8,14,26,0.6)",
              boxShadow: ocReady2 ? `0 0 30px ${hexToRgba(theme.bot, 0.85)}` : "none",
            }}
          >
            <span className="text-base leading-none">⚡</span>
            {ocActive2 ? "FIRING" : ocReady2 ? "P2 BURST" : "P2…"}
          </button>
        </div>
      )}

      {/* ---------------------------------------------- overcharge trigger */}
      {settings.overcharge && !result && (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-[16%] z-20 flex sm:bottom-[14%] ${
            local ? "justify-start pl-4 sm:pl-10" : "justify-center"
          }`}
        >
          <button
            data-ui
            type="button"
            disabled={!ocReady}
            onPointerDown={(e) => {
              e.stopPropagation();
              audio.init();
              fireOvercharge();
            }}
            className={`pointer-events-auto font-display relative flex items-center gap-2 rounded-full border-2 px-6 py-3 text-sm font-black tracking-[0.2em] transition-all duration-200 sm:px-8 sm:py-3.5 sm:text-base ${
              ocReady ? "scale-100 opacity-100 active:scale-90" : "scale-90 opacity-35"
            }`}
            style={{
              borderColor: ocActive ? "#ffffff" : ocReady ? theme.player : "rgba(255,255,255,0.18)",
              color: ocReady ? "#04121a" : "rgba(220,238,255,0.6)",
              background: ocActive
                ? "#ffffff"
                : ocReady
                  ? `linear-gradient(180deg, #ffffff, ${theme.player})`
                  : "rgba(8,14,26,0.6)",
              boxShadow: ocReady ? `0 0 34px ${hexToRgba(theme.player, 0.85)}, 0 0 80px ${hexToRgba(theme.player, 0.4)}` : "none",
              animation: ocReady && !ocActive ? "pulseGlow 1.1s ease-in-out infinite" : undefined,
            }}
          >
            <span className="text-lg leading-none">⚡</span>
            {ocActive ? "FIRING" : ocReady ? (local ? "P1 BURST" : "OVERCHARGE") : local ? "P1…" : "CHARGING…"}
          </button>
        </div>
      )}

      {/* ---------------------------------------------- fire hint */}
      {!result && !count && (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-[28%] z-10 flex justify-center transition-all duration-500 ${
            hintGone ? "translate-y-3 opacity-0" : "opacity-100"
          }`}
        >
          <div
            className="font-display animate-pulse rounded-full border px-5 py-2 text-[11px] font-bold tracking-[0.25em] backdrop-blur-sm sm:text-sm"
            style={{ borderColor: hexToRgba(theme.player, 0.55), color: "#fff", background: hexToRgba(theme.player, 0.12) }}
          >
            {local ? "LEFT SIDE = P1   ·   RIGHT SIDE = P2" : "HOLD ANYWHERE TO FIRE"}
          </div>
        </div>
      )}

      {/* ---------------------------------------------- countdown */}
      {count && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
          <div
            key={count}
            className={`${count === "ENGAGE" ? "engage-pop" : "count-pop"} font-display relative select-none font-black`}
            style={{
              fontSize: count === "ENGAGE" ? "clamp(2.6rem,13vw,9rem)" : "clamp(5rem,26vw,18rem)",
              color: "#fff",
              textShadow:
                count === "ENGAGE"
                  ? `0 0 18px ${theme.player}, 0 0 60px ${theme.player}, 0 0 130px ${theme.bot}`
                  : `0 0 20px ${theme.player}, 0 0 70px ${hexToRgba(theme.player, 0.8)}, 0 0 140px ${hexToRgba(theme.bot, 0.6)}`,
              letterSpacing: count === "ENGAGE" ? "0.12em" : "0",
            }}
          >
            {count}
          </div>
          {count !== "ENGAGE" && (
            <div className="absolute bottom-[20%] flex flex-col items-center gap-2">
              <div className="font-display text-[11px] tracking-[0.4em] text-slate-200/60 sm:text-sm">CHARGING EMITTERS…</div>
              {local && (
                <div className="flex items-center gap-3">
                  <span className="font-display text-[10px] font-bold tracking-[0.2em]" style={{ color: theme.player }}>
                    ◀ P1 LEFT
                  </span>
                  <span className="font-display text-[10px] text-slate-500">|</span>
                  <span className="font-display text-[10px] font-bold tracking-[0.2em]" style={{ color: theme.bot }}>
                    P2 RIGHT ▶
                  </span>
                </div>
              )}
              {local && settings.series > 1 && (
                <div className="font-display text-[10px] tracking-[0.24em] text-slate-300/70">
                  ROUND {score.p1 + score.p2 + 1} · P1 {score.p1} — {score.p2} P2
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------- result overlay */}
      {result && stats && (
        <div data-ui className="menu-scroll absolute inset-0 z-40 flex justify-center overflow-y-auto p-4">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[6px]" style={{ animation: "screenFadeIn .4s ease both" }} />
          <div
            className="slide-down clip-notch relative my-auto w-full max-w-xl border bg-[rgba(5,9,20,0.88)] p-5 text-center shadow-2xl sm:p-8"
            style={{
              borderColor: hexToRgba(accentWin, 0.45),
              boxShadow: `0 0 90px ${hexToRgba(accentWin, 0.28)}`,
            }}
          >
            {/* corner close */}
            <button
              data-ui
              type="button"
              onClick={exitToMenu}
              aria-label="Exit to main menu"
              title="Exit to main menu (Esc)"
              className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50 text-base text-slate-300 transition hover:border-red-400/70 hover:bg-red-500/15 hover:text-red-300 active:scale-90 sm:right-3 sm:top-3"
            >
              ✕
            </button>
            <div className="font-display mb-1 text-[10px] tracking-[0.42em] text-slate-300/45">
              {local && settings.series > 1
                ? seriesOver
                  ? "SERIES COMPLETE"
                  : `ROUND ${nextScore.p1 + nextScore.p2} OF BEST-OF-${settings.series}`
                : "MATCH TERMINATED"}
            </div>
            <h2
              className="font-display text-[7vw] font-black leading-none sm:text-5xl"
              style={{
                color: accentWin,
                textShadow: `0 0 14px ${accentWin}, 0 0 44px ${hexToRgba(accentWin, 0.75)}, 0 0 110px ${hexToRgba(accentWin, 0.45)}`,
              }}
            >
              {headline}
            </h2>
            <div className="font-display mt-2 text-[11px] font-bold tracking-[0.24em] sm:text-sm" style={{ color: accentWin }}>
              {subline}
            </div>

            {/* series scoreboard */}
            {local && settings.series > 1 && (
              <div className="mt-4 flex items-center justify-center gap-3">
                {([
                  ["P1", nextScore.p1, theme.player],
                  ["P2", nextScore.p2, theme.bot],
                ] as const).map(([who, val, col], i) => (
                  <div key={who} className="flex items-center gap-3">
                    {i === 1 && <span className="font-display text-xs text-slate-500">VS</span>}
                    <div
                      className="rounded-lg border px-4 py-2 text-center"
                      style={{ borderColor: hexToRgba(col, 0.5), background: hexToRgba(col, 0.1) }}
                    >
                      <div className="font-display text-2xl font-black leading-none" style={{ color: col, textShadow: `0 0 18px ${col}` }}>
                        {val}
                      </div>
                      <div className="font-display mt-1 text-[8px] tracking-[0.2em] text-slate-400/60">{who}</div>
                    </div>
                  </div>
                ))}
                <div className="font-display ml-1 text-[9px] leading-tight tracking-[0.15em] text-slate-400/50">
                  FIRST TO
                  <br />
                  <span className="text-sm text-white">{need}</span>
                </div>
              </div>
            )}

            <div className="my-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Stat label="TIME" value={`${stats.elapsed.toFixed(1)}s`} color={theme.accent} />
              {local ? (
                <>
                  <Stat label="P1 VENTS" value={`${stats.cleanVents}`} color={theme.player} />
                  <Stat label="P2 VENTS" value={`${stats.p2CleanVents}`} color={theme.bot} />
                  <Stat label="P1 MELTS" value={`${stats.overheats}`} color="#ff8a3d" />
                  <Stat label="P2 MELTS" value={`${stats.botOverheats}`} color="#ff8a3d" />
                  <Stat label="⚡ P1/P2" value={`${stats.overchargesUsed}/${stats.botOvercharges}`} color={theme.hazard} />
                </>
              ) : (
                <>
                  <Stat label="CLEAN VENTS" value={`${stats.cleanVents}`} color="#39ff96" />
                  <Stat label="OVERHEATS" value={`${stats.overheats}`} color={stats.overheats > 0 ? "#ff8a3d" : "#39ff96"} />
                  <Stat label="BOT MELTS" value={`${stats.botOverheats}`} color={theme.player} />
                  <Stat label="⚡ BURSTS" value={`${stats.overchargesUsed}`} color={theme.bot} />
                  <Stat label="PEAK PUSH" value={`${Math.max(0, Math.round(stats.maxLead * 200))}%`} color={theme.hazard} />
                </>
              )}
            </div>

            {/* medals */}
            {medals.length > 0 && (
              <div className="mb-4">
                <div className="font-display mb-2 text-[9px] tracking-[0.3em] text-slate-400/55">MEDALS EARNED</div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {medals.map((m, i) => (
                    <div
                      key={m.id}
                      className="fade-up flex items-center gap-1.5 rounded-full border px-3 py-1.5"
                      style={{
                        animationDelay: `${0.25 + i * 0.09}s`,
                        borderColor: hexToRgba(m.color, 0.55),
                        background: hexToRgba(m.color, 0.1),
                        boxShadow: `0 0 20px ${hexToRgba(m.color, 0.3)}`,
                      }}
                      title={m.desc}
                    >
                      <span className="text-sm leading-none" style={{ color: m.color, textShadow: `0 0 12px ${m.color}` }}>
                        {m.icon}
                      </span>
                      <span className="font-display text-[9px] font-bold tracking-[0.12em] text-white sm:text-[10px]">{m.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="mx-auto mb-4 max-w-sm text-[12px] font-semibold leading-relaxed tracking-wide text-slate-300/65">
              {local
                ? seriesOver && settings.series > 1
                  ? `${seriesWinnerP1 ? "Player 1" : "Player 2"} takes it ${Math.max(nextScore.p1, nextScore.p2)}–${Math.min(nextScore.p1, nextScore.p2)}. Swap sides and settle it again.`
                  : `${won ? "Player 2" : "Player 1"} — shorter bursts and cleaner vents. The lockout is what loses lanes.`
                : won
                  ? `You out-cycled ${diff.name} on the ${arena.name} lane. Crank the difficulty and see how deep the overdrive goes.`
                  : stats.overheats > 1
                    ? `You melted down ${stats.overheats} times — every lockout gave ${diff.name} 2.5 free seconds. Feather the trigger.`
                    : `${diff.name} read your heat gauge and punished it. Bank an overcharge and break the deadlock next time.`}
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                data-ui
                type="button"
                onClick={local && !seriesOver ? rematch : rematch}
                className="font-display group relative flex-1 overflow-hidden rounded-lg border-2 px-6 py-3.5 text-sm font-black tracking-[0.2em] text-[#03140c] transition-transform active:scale-95 sm:text-base"
                style={{ borderColor: "#39ff96", background: "linear-gradient(180deg,#7dffbe,#22e07f 55%,#12b863)", boxShadow: "0 0 34px rgba(57,255,150,0.5)" }}
              >
                {local && !seriesOver ? `NEXT ROUND (${nextScore.p1}–${nextScore.p2})` : "PLAY AGAIN"}
                <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_28%,rgba(255,255,255,0.5)_46%,transparent_64%)]" />
              </button>
              <button
                data-ui
                type="button"
                onClick={goHome}
                className="font-display flex-1 rounded-lg border px-6 py-3.5 text-sm font-black tracking-[0.2em] transition-all active:scale-95 sm:text-base"
                style={{
                  borderColor: hexToRgba(theme.player, 0.6),
                  color: "#fff",
                  background: hexToRgba(theme.player, 0.12),
                  boxShadow: `inset 0 0 22px ${hexToRgba(theme.player, 0.22)}`,
                }}
              >
                ⚙ CHANGE SETTINGS
              </button>
            </div>

            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <button
                data-ui
                type="button"
                onClick={copyCard}
                className="font-display flex-1 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2.5 text-[10px] font-bold tracking-[0.2em] text-slate-300/75 transition hover:border-white/40 hover:text-white active:scale-95"
              >
                {copied ? "✓ COPIED TO CLIPBOARD" : "⧉ COPY RESULT CARD"}
              </button>
              <button
                data-ui
                type="button"
                onClick={exitToMenu}
                className="font-display flex-1 rounded-lg border px-4 py-2.5 text-[10px] font-bold tracking-[0.2em] transition-all active:scale-95"
                style={{
                  borderColor: "rgba(255,80,100,0.45)",
                  color: "#ff8d9e",
                  background: "rgba(255,60,80,0.08)",
                }}
              >
                ✕ EXIT TO MAIN MENU
              </button>
            </div>

            <div className="font-display mt-3 text-[10px] tracking-[0.2em] text-slate-400/45">
              PRESS <span className="rounded border border-white/20 px-1 py-0.5 text-slate-200">ESC</span> TO EXIT · SETTINGS ARE PRESERVED
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="font-display rounded border px-2 py-1 text-[9px] font-bold tracking-[0.16em] backdrop-blur sm:text-[10px]"
      style={{ borderColor: hexToRgba(color, 0.45), color, background: "rgba(0,0,0,0.42)" }}
    >
      {label}
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-2.5">
      <div className="font-display text-lg font-black leading-none sm:text-xl" style={{ color, textShadow: `0 0 16px ${hexToRgba(color, 0.7)}` }}>
        {value}
      </div>
      <div className="mt-1 text-[9px] font-bold tracking-[0.15em] text-slate-400/60">{label}</div>
    </div>
  );
}
