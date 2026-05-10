# 🏎️ POLY RUSH — Low Poly Racing Game

A fully browser-based, pseudo-3D low-poly racing game inspired by PolyTrack and TrackMania.
No build tools, no server required — just open `index.html` and race.

---

## 🎮 Features

| Feature | Details |
|---|---|
| Pseudo-3D road renderer | OutRun / Mode-7 style segment projection |
| Drift physics | Realistic lateral slip with smoke |
| Speed boost | Boost pads + manual SHIFT boost |
| Day/Night cycle | Smooth sky transition every ~30 seconds |
| Endless road | Procedurally generated curved track |
| AI traffic | 4 rival cars on the track |
| Coin collection | Pick up coins for score |
| Obstacle system | Cones, barriers, rocks |
| Car skin selector | 6 low-poly cars with custom colors |
| 3 camera modes | Normal · Cinematic · Hood cam |
| Neon HUD | Speedometer, boost bar, mini-map, lap timer |
| Sound effects | Web Audio API — synthesized, no files needed |
| Mobile controls | On-screen D-pad + boost button |
| Keyboard controls | W/A/S/D or Arrow keys + SHIFT + C + ESC |
| GitHub Pages ready | Zero dependencies, pure HTML/CSS/JS |

---

## ⌨️ Controls

| Key | Action |
|---|---|
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / Reverse |
| `A` / `←` | Steer Left |
| `D` / `→` | Steer Right |
| `SHIFT` | Manual Boost |
| `C` | Cycle Camera Mode |
| `ESC` / Pause btn | Pause / Resume |

**Mobile:** On-screen arrows and ⚡ boost button (shown automatically on small screens).

---

## 📁 Project Structure

```
PolyRush/
├── index.html          ← Main entry point & CUSTOMIZATION config
├── style.css           ← All styling, animations, neon UI
├── game.js             ← Full game engine (renderer, physics, audio, HUD)
│
└── assets/             ← (Optional — for future extensions)
    ├── fonts/          ← Drop custom .woff2 fonts here
    ├── images/         ← Logo, favicon, splash screen
    │   └── favicon.ico
    └── sounds/         ← Reserved (game uses Web Audio synthesis)
```

> **Note:** The game ships with zero external assets. All graphics are drawn by the Canvas 2D API; all sounds are synthesized by the Web Audio API. No internet connection is required after the Google Fonts are cached (or if offline, system fonts are used as fallback).

---

## 🚀 GitHub Pages Deployment

### Step 1 — Create a GitHub repository

```bash
git init
git add .
git commit -m "Initial commit — POLY RUSH"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/poly-rush.git
git push -u origin main
```

### Step 2 — Enable GitHub Pages

1. Go to your repository on GitHub.
2. Click **Settings** → **Pages** (left sidebar).
3. Under **Source**, select **Branch: main** and folder **/ (root)**.
4. Click **Save**.

### Step 3 — Access your game

After ~60 seconds your game will be live at:

```
https://YOUR_USERNAME.github.io/poly-rush/
```

### Step 4 — Update the game

```bash
git add .
git commit -m "My changes"
git push
```

Changes go live automatically within ~30 seconds.

---

## 🎨 Easy Customization

All user-facing settings live in one block near the top of **`index.html`** inside `<script>`:

```html
<script>
  window.GAME_CONFIG = {

    // ── Branding ──────────────────────────────────────
    TITLE:          "POLY RUSH",   // ← change game title
    SUBTITLE:       "LOW POLY RACING",
    LOGO_EMOJI:     "🏎️",         // ← swap for any emoji or image URL

    // ── Colors (CSS hex) ─────────────────────────────
    COLOR_PRIMARY:  "#00f5ff",    // neon cyan  — HUD, glow
    COLOR_ACCENT:   "#ff006e",    // neon pink  — boost, accent
    COLOR_ROAD:     "#1a1a2e",    // road base
    COLOR_SKY_DAY:  "#87ceeb",
    COLOR_SKY_NIGHT:"#0a0a1a",
    COLOR_GRASS_DAY:"#2d5a1b",
    COLOR_GRASS_NIGHT:"#0d1f0a",

    // ── Car physics ───────────────────────────────────
    MAX_SPEED:       18,          // higher = faster top speed
    ACCELERATION:    0.35,        // higher = snappier acceleration
    BRAKING:         0.55,        // higher = shorter stopping distance
    DRIFT_FACTOR:    0.88,        // 0.75 = lots of drift  |  0.98 = grippy
    BOOST_MULTIPLIER:1.8,         // ×speed during boost
    BOOST_DURATION:  120,         // frames (~2 seconds at 60fps)

    // ── World ─────────────────────────────────────────
    ROAD_WIDTH:      320,         // wider = easier to stay on road
    SEGMENT_LENGTH:  200,         // visual depth per road segment
    VISIBLE_SEGMENTS:150,         // draw distance (lower = better perf)
    COIN_VALUE:      10,          // score per coin
    OBSTACLE_FREQ:   0.08,        // 0.0 = no obstacles  |  0.2 = many
    AI_CARS:         4,           // number of rival cars

    // ── Lap ───────────────────────────────────────────
    LAP_SEGMENTS:    300,         // lower = shorter lap
  };
</script>
```

### Common tweaks

| Goal | Change |
|---|---|
| Make it faster | `MAX_SPEED: 28`, `ACCELERATION: 0.5` |
| Make it driftier | `DRIFT_FACTOR: 0.78` |
| Easier track | `OBSTACLE_FREQ: 0.03`, `ROAD_WIDTH: 380` |
| Longer lap | `LAP_SEGMENTS: 500` |
| Different color theme | `COLOR_PRIMARY: "#ff00aa"`, `COLOR_ACCENT: "#ffee00"` |
| More rivals | `AI_CARS: 8` |

### Adding a custom logo image

Replace the emoji logo with an `<img>` tag in `index.html`:

```html
<!-- Find this line in index.html: -->
<span class="logo-emoji" id="logo-emoji">🏎️</span>

<!-- Replace with: -->
<img src="assets/images/logo.png" alt="Logo" style="height:70px;filter:drop-shadow(0 0 12px #00f5ff)">
```

### Adding a favicon

Drop `favicon.ico` into `assets/images/` and add to `<head>`:

```html
<link rel="icon" href="assets/images/favicon.ico" type="image/x-icon">
```

### Changing fonts

The game uses **Orbitron** (headings) and **Share Tech Mono** (HUD numbers) from Google Fonts. To change, edit `style.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=YOUR_FONT:wght@400;700;900&display=swap');

:root {
  --font-main: 'YOUR_FONT', sans-serif;
}
```

---

## 🛠 Adding New Car Skins

In `game.js`, find the `CAR_SKINS` array and add an entry:

```js
const CAR_SKINS = [
  // ... existing skins ...
  { name: 'LAVA',  body: '#ff2200', stripe: '#ff8800', wheel: '#200000' },
];
```

Each skin has:
- `name` — label shown in the selector
- `body` — main car body color (hex)
- `stripe` — roof / stripe color
- `wheel` — wheel / tire color

---

## 📱 Mobile Support

- Touch controls appear automatically on screen widths ≤ 600px.
- Portrait and landscape both work; the canvas fills the viewport.
- To force touch controls on desktop (for testing): comment out the CSS rule `@media (min-width: 601px) { #touch-controls { display: none !important; } }` in `style.css`.

---

## ⚙️ Performance Tips

| Issue | Fix |
|---|---|
| Low FPS on mobile | Lower `VISIBLE_SEGMENTS` to 80–100 |
| Stuttering | Lower `AI_CARS` to 2 |
| Too easy | Raise `OBSTACLE_FREQ` to 0.15 |

---

## 🧪 Browser Compatibility

| Browser | Support |
|---|---|
| Chrome 90+ | ✅ Full |
| Firefox 88+ | ✅ Full |
| Safari 14+ | ✅ Full |
| Edge 90+ | ✅ Full |
| Mobile Chrome/Safari | ✅ Full |
| IE 11 | ❌ No (uses ES6 classes, Canvas API) |

---

## 📄 License

MIT — free to use, modify, and deploy.

---

*Built with pure HTML5 Canvas · Web Audio API · Vanilla JS — no frameworks, no build step.*
