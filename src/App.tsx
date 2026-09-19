import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import HomeScreen from "./components/HomeScreen";
import GameScreen from "./components/GameScreen";
import { DEFAULT_SETTINGS, type Settings } from "./game/config";
import { audio } from "./game/audio";
import type { Result } from "./game/engine";
import { applyMatch, EMPTY_PROFILE, loadProfile, saveProfile, type Medal, type Profile } from "./game/profile";

const STORAGE_KEY = "ltow-overdrive-settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [screen, setScreen] = useState<"home" | "game">("home");
  const [lastResult, setLastResult] = useState<Result | null>(null);
  const [muted, setMuted] = useState(false);
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [freshMedals, setFreshMedals] = useState<string[]>([]);
  // bumping this key guarantees a fresh arena instance for every duel
  const [duelKey, setDuelKey] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
  }, [settings]);

  useEffect(() => {
    audio.setMuted(muted);
  }, [muted]);

  // lock the layout to the real viewport on mobile browsers
  useEffect(() => {
    const setVh = () => {
      document.documentElement.style.setProperty("--app-h", `${window.innerHeight}px`);
    };
    setVh();
    window.addEventListener("resize", setVh);
    window.addEventListener("orientationchange", setVh);
    return () => {
      window.removeEventListener("resize", setVh);
      window.removeEventListener("orientationchange", setVh);
    };
  }, []);

  return (
    <div
      className="relative w-full overflow-hidden bg-[#02030a]"
      style={{ height: "var(--app-h, 100vh)" }}
    >
      {screen === "home" ? (
        <HomeScreen
          settings={settings}
          onChange={setSettings}
          lastResult={lastResult}
          profile={profile}
          freshMedals={freshMedals}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onResetProfile={() => {
            const blank: Profile = { ...EMPTY_PROFILE, beaten: {}, medals: [] };
            setProfile(blank);
            saveProfile(blank);
          }}
          onStart={() => {
            setDuelKey((k) => k + 1);
            setLastResult(null);
            setFreshMedals([]);
            setScreen("game");
          }}
        />
      ) : (
        <GameScreen
          key={duelKey}
          settings={settings}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onMatchEnd={(result, stats, medals: Medal[]) => {
            setProfile((prev) => {
              const next = applyMatch(prev, result, stats, settings.difficulty, medals);
              saveProfile(next);
              return next;
            });
            setFreshMedals(medals.filter((m) => !profile.medals.includes(m.id)).map((m) => m.id));
          }}
          onHome={(result) => {
            setLastResult(result);
            setScreen("home");
          }}
        />
      )}
      <Analytics />
    </div>
  );
}
