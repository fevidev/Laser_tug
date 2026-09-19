# Laser Tug-of-War: Overdrive

A neon cyberpunk laser duel built with **React + Vite + Tailwind CSS**. Push the Power Core past your
opponent's baseline while managing heat, banking overcharge bursts, and surviving lane hazards.

Play **solo vs. an AI bot** (4 difficulty tiers) or **local 2-player** on a single device.

---

## Deploy to Vercel

**No environment variables are required. No database. No backend.**

### Option A — GitHub import (recommended)

1. Push this folder to a new GitHub repository.
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. Go to [vercel.com/new](https://vercel.com/new) and click **Import** next to your repository.
3. Vercel auto-detects the framework as **Vite**. The settings below are already committed in
   `vercel.json`, so leave everything on the defaults:

   | Setting          | Value           |
   | ---------------- | --------------- |
   | Framework Preset | Vite            |
   | Build Command    | `npm run build` |
   | Output Directory | `dist`          |
   | Install Command  | `npm install`   |

4. Click **Deploy**. The first build takes roughly 30–45 seconds.

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel --prod
```

Accept the detected defaults when prompted.

---

## Environment variables

**None.** The app is fully client-side. All persistent data (settings, win/loss record, pilot rank,
medals) is stored in the browser via `localStorage` and is scoped per-device. Every storage call is
wrapped in `try/catch`, so the game still runs normally if storage is blocked (private browsing,
embedded webviews, etc.).

---

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build    # production build -> dist/
npm run preview  # serve the production build locally
```

Requires **Node.js 18 or newer**.

---

## Build output

`vite-plugin-singlefile` inlines all JavaScript and CSS into a single file, so the production build
is one self-contained artifact:

```
dist/index.html   (~327 kB, ~98 kB gzipped)
```

There is no `assets/` directory and no code splitting, which means the build also works when opened
directly from the filesystem or hosted on any static host (Netlify, Cloudflare Pages, GitHub Pages,
itch.io, S3).

> The only external network request is the Google Fonts stylesheet for *Orbitron* and *Rajdhani*.
> The CSS falls back to `system-ui` if it is unavailable, so the game stays fully playable offline.

---

## Controls

### Solo

| Action     | Input                                          |
| ---------- | ---------------------------------------------- |
| Fire       | Hold `Space` / `F` / `A`, click, or touch      |
| Overcharge | `Shift` / `E` / `Q`, right-click, or ⚡ button |
| Exit       | `Esc`                                          |

### Local 2-player

|            | Player 1 (left)        | Player 2 (right)       |
| ---------- | ---------------------- | ---------------------- |
| Touch      | Hold **left** half     | Hold **right** half    |
| Fire       | `A` / `F` / `Space`    | `L` / `↓` / `;`        |
| Overcharge | `Q` / `E` / `L-Shift`  | `P` / `/` / `R-Shift`  |

Touch input tracks pointer IDs individually, so both players can hold and fire simultaneously on one
phone or tablet.

---

## Project structure

```
index.html            # HTML shell + fonts + social meta
vercel.json           # Vercel build settings
vite.config.ts        # Vite + React + Tailwind + singlefile plugin
tsconfig.json         # TypeScript config (strict)
src/
  main.tsx            # React entry point
  App.tsx             # Screen routing + settings/profile persistence
  index.css           # Tailwind import + keyframes and effects
  components/
    HomeScreen.tsx    # Setup / Record / Briefing tabs
    GameScreen.tsx    # Arena HUD, input handling, result overlay
  game/
    engine.ts         # Physics, AI, particles, canvas renderer
    config.ts         # Difficulty / arena / theme / tuning tables
    audio.ts          # Procedural Web Audio engine (no audio assets)
    profile.ts        # Medals, pilot rank, localStorage profile
```

## Tech stack

- React 19
- Vite 7
- Tailwind CSS 4
- TypeScript 5 (strict mode)
- HTML5 Canvas 2D for rendering
- Web Audio API for fully synthesized sound (no audio files)

## License

MIT
