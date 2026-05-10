/**
 * ═══════════════════════════════════════════════════════════════
 *  POLY RUSH  —  game.js
 *  Pseudo-3D low-poly racing game (Mode-7 / OutRun style renderer)
 *  Canvas 2D — no external dependencies
 * ═══════════════════════════════════════════════════════════════
 */

// ── Pull config from window (set in index.html) ──────────────────
const CFG = window.GAME_CONFIG;

// Apply CSS variables from config
const root = document.documentElement;
root.style.setProperty('--primary', CFG.COLOR_PRIMARY);
root.style.setProperty('--accent',  CFG.COLOR_ACCENT);

// Apply text branding
document.getElementById('game-title').textContent    = CFG.TITLE;
document.getElementById('game-subtitle').textContent = CFG.SUBTITLE;
document.getElementById('logo-emoji').textContent    = CFG.LOGO_EMOJI;
document.title = CFG.TITLE;

/* ════════════════════════════════════════════════════════
   CAR SKIN DEFINITIONS
════════════════════════════════════════════════════════ */
const CAR_SKINS = [
  { name: 'CYBER',  body: '#00f5ff', stripe: '#fff',    wheel: '#0a0a30' },
  { name: 'BLAZE',  body: '#ff4500', stripe: '#ffaa00', wheel: '#1a0500' },
  { name: 'VENOM',  body: '#39ff14', stripe: '#005500', wheel: '#001200' },
  { name: 'VIOLET', body: '#bf5fff', stripe: '#ff00ff', wheel: '#1a0030' },
  { name: 'GHOST',  body: '#e8e8e8', stripe: '#aaaaaa', wheel: '#222' },
  { name: 'GOLD',   body: '#ffd700', stripe: '#ff8c00', wheel: '#3a2a00' },
];

/* ════════════════════════════════════════════════════════
   AUDIO ENGINE  (Web Audio API — pure synthesis, no files)
════════════════════════════════════════════════════════ */
const Audio = (() => {
  let ctx = null;
  let engineOsc = null, engineGain = null;
  let boostOsc  = null, boostGain  = null;
  let running = false;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function beep(freq, dur, type = 'square', vol = 0.18) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  }

  function startEngine(speedNorm) {
    if (!ctx || running) return;
    running = true;
    engineOsc  = ctx.createOscillator();
    engineGain = ctx.createGain();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60 + speedNorm * 180;
    engineGain.gain.value = 0.08;
    engineOsc.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
  }

  function updateEngine(speedNorm, drifting) {
    if (!engineOsc) return;
    const target = drifting ? 300 : 60 + speedNorm * 180;
    engineOsc.frequency.setTargetAtTime(target, ctx.currentTime, 0.1);
  }

  function stopEngine() {
    if (!engineOsc) return;
    engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    engineOsc.stop(ctx.currentTime + 0.2);
    engineOsc = null; engineGain = null;
    running = false;
  }

  function playBoost()   { beep(880, 0.3, 'sine', 0.25); beep(1200, 0.2, 'sine', 0.2); }
  function playCoin()    { beep(1046, 0.08, 'sine', 0.2); beep(1318, 0.12, 'sine', 0.2); }
  function playCrash()   { beep(120, 0.4, 'sawtooth', 0.3); }
  function playLap()     { [523,659,784,1047].forEach((f,i) => setTimeout(()=>beep(f,.15,'sine',.22), i*120)); }
  function playCount(n)  { beep(n === 0 ? 880 : 440, 0.2, 'sine', 0.25); }
  function playFinish()  { [784,880,1047,1318].forEach((f,i)=>setTimeout(()=>beep(f,.2,'sine',.25),i*150)); }

  return { init, resume, startEngine, updateEngine, stopEngine,
           playBoost, playCoin, playCrash, playLap, playCount, playFinish };
})();

/* ════════════════════════════════════════════════════════
   INPUT MANAGER
════════════════════════════════════════════════════════ */
const Input = {
  keys: {},
  touch: { up: false, down: false, left: false, right: false, boost: false },
  init() {
    document.addEventListener('keydown', e => { this.keys[e.code] = true;  e.preventDefault && ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code) && e.preventDefault(); });
    document.addEventListener('keyup',   e => { this.keys[e.code] = false; });
    // Touch buttons
    const map = { 'touch-up':'up','touch-down':'down','touch-left':'left','touch-right':'right','touch-boost':'boost' };
    for (const [id, key] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener('touchstart', e => { this.touch[key] = true;  e.preventDefault(); }, { passive:false });
      el.addEventListener('touchend',   e => { this.touch[key] = false; e.preventDefault(); }, { passive:false });
    }
  },
  get up()    { return this.keys['KeyW']     || this.keys['ArrowUp']    || this.touch.up;    },
  get down()  { return this.keys['KeyS']     || this.keys['ArrowDown']  || this.touch.down;  },
  get left()  { return this.keys['KeyA']     || this.keys['ArrowLeft']  || this.touch.left;  },
  get right() { return this.keys['KeyD']     || this.keys['ArrowRight'] || this.touch.right; },
  get boost() { return this.keys['ShiftLeft']|| this.keys['ShiftRight'] || this.touch.boost; },
  get cam()   { return this.keys['KeyC']; },
};

/* ════════════════════════════════════════════════════════
   ROAD GENERATOR  (pseudo-3D segment projection)
════════════════════════════════════════════════════════ */
const COLORS = {
  roadDark:     '#14142a',
  roadLight:    '#1c1c35',
  laneMarkLight:'rgba(255,255,255,0.7)',
  laneMarkDark: 'rgba(255,255,255,0)',
  curbA:        '#ff003c',
  curbB:        '#ffffff',
  grassDayA:    '#2d5a1b', grassDayB:   '#234d14',
  grassNightA:  '#0d1f0a', grassNightB: '#081508',
  skyDayTop:    '#1a2a6c', skyDayBot:   '#87ceeb',
  skyNightTop:  '#000010', skyNightBot: '#0a0a2a',
};

function makeSegment(index, curve = 0, hill = 0) {
  return {
    index,
    curve,
    hill,
    color: index % 2 === 0 ? 'even' : 'odd',
    // Objects on this segment
    obstacles: [],
    coins: [],
    boostPad: false,
    aiCar: null,
  };
}

function generateTrack(length) {
  const segments = [];
  for (let i = 0; i < length; i++) {
    const t = i / length;
    const curve = Math.sin(t * Math.PI * 6) * 2.2
                + Math.sin(t * Math.PI * 13) * 0.8;
    const hill  = Math.sin(t * Math.PI * 4) * 0.6;
    segments.push(makeSegment(i, curve, hill));
  }
  // Populate objects
  for (let i = 20; i < length; i++) {
    const seg = segments[i];
    // Boost pad every ~50 segments
    if (i % 48 === 0) seg.boostPad = true;
    // Coins (groups of 3)
    if (i % 7 === 3) {
      for (let c = 0; c < 3; c++) seg.coins.push({ offset: (c - 1) * 0.22, collected: false });
    }
    // Obstacles
    if (Math.random() < CFG.OBSTACLE_FREQ && !seg.boostPad) {
      seg.obstacles.push({ offset: (Math.random() - 0.5) * 0.7, hit: false, type: Math.floor(Math.random()*3) });
    }
  }
  return segments;
}

/* ════════════════════════════════════════════════════════
   AI CARS
════════════════════════════════════════════════════════ */
function makeAICar(segIndex, skin) {
  return {
    segIndex,
    offset: (Math.random() - 0.5) * 0.5,
    speed: CFG.MAX_SPEED * (0.55 + Math.random() * 0.35),
    skin: skin || CAR_SKINS[Math.floor(Math.random() * CAR_SKINS.length)],
    z: 0,
  };
}

/* ════════════════════════════════════════════════════════
   MAIN GAME CLASS
════════════════════════════════════════════════════════ */
class Game {
  constructor() {
    this.canvas  = document.getElementById('game-canvas');
    this.ctx     = this.canvas.getContext('2d');
    this.speedoC = document.getElementById('speedo-canvas');
    this.speedoX = this.speedoC.getContext('2d');
    this.minimapC= document.getElementById('minimap-canvas');
    this.minimapX= this.minimapC.getContext('2d');

    this.running  = false;
    this.paused   = false;
    this.finished = false;
    this.raf      = null;

    this.selectedSkin = 0;
    this.bestLap = Infinity;
    this.cameraMode = 0; // 0=normal 1=cinematic 2=hood

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width  = this.W;
    this.canvas.height = this.H;
  }

  /* ── State init ── */
  init() {
    const lap     = CFG.LAP_SEGMENTS;
    this.totalLaps = 3;
    this.track    = generateTrack(lap);

    // Player
    this.player = {
      pos:       0,        // position along track (float segment index)
      offset:    0,        // lateral offset -1..1
      speed:     0,
      accel:     0,
      steer:     0,
      driftAngle:0,
      boostTimer:0,
      lap:       1,
      lapStart:  performance.now(),
      lapTimes:  [],
      coins:     0,
      score:     0,
      combo: 0,
      comboTimer: 0,
      bestCombo: 0,
      nitro: 100,
      nearMisses: 0,
      crashes: 0,
      medal: 'NONE',
    };

    // Reset all coin/obstacle state
    for (const seg of this.track) {
      for (const c of seg.coins) c.collected = false;
      for (const o of seg.obstacles) o.hit = false;
    }

    // AI cars
    this.aiCars = [];
    for (let i = 0; i < CFG.AI_CARS; i++) {
      const start = Math.floor(Math.random() * 30) + 5;
      this.aiCars.push(makeAICar(start));
    }

    this.totalTime  = 0;
    this.dayNight   = 0;    // 0=day, transitions to 1=night
    this.dayTimer   = 0;
    this.frameCount = 0;
    this.drifting   = false;
    this.boostFlash = false;

    this.cameraX    = 0;
    this.cameraShake= 0;
    this.cameraDepth= 0.84;
    this.weather = ['clear', 'rain', 'fog'][Math.floor(Math.random() * 3)];

    this.countdown     = 3;
    this.countdownTimer= 0;
    this.started       = false;
  }

  /* ── Main loop ── */
  start() {
    this.running = true;
    this.paused  = false;
    this.finished= false;
    Audio.init();
    Audio.resume();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.lastTime = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min((now - this.lastTime) / 16.667, 3);
      this.lastTime = now;
      if (!this.paused && !this.finished) {
        this.update(dt);
        this.draw();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    Audio.stopEngine();
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
  }

  /* ── UPDATE ── */
  update(dt) {
    this.frameCount++;
    this.dayTimer += dt;
    // Day/night cycle: every 1800 frames (~30s at 60fps)
    this.dayNight = 0.5 - 0.5 * Math.cos(this.dayTimer / 1800 * Math.PI);

    // Countdown
    if (!this.started) {
      this.countdownTimer += dt;
      if (this.countdownTimer >= 60) {
        this.countdownTimer = 0;
        this.countdown--;
        Audio.playCount(this.countdown);
        if (this.countdown < 0) {
          this.started = true;
          Audio.startEngine(0);
          Audio.playCount(0);
        }
      }
      return;
    }

    // ── Player physics ──
    const p = this.player;
    const skin = CAR_SKINS[this.selectedSkin];

    const boosting = p.boostTimer > 0;
    if (boosting) p.boostTimer -= dt;
    if (p.boostTimer < 0) p.boostTimer = 0;

    const maxSpd = CFG.MAX_SPEED * (boosting ? CFG.BOOST_MULTIPLIER : 1);

    if (Input.boost && p.boostTimer <= 0 && p.speed > 1) {
      p.boostTimer = CFG.BOOST_DURATION;
      Audio.playBoost();
      this.showBoostFlash();
    }

    if (Input.up) {
      p.speed += CFG.ACCELERATION * dt;
    } else if (Input.down) {
      p.speed -= CFG.BRAKING * dt;
    } else {
      p.speed *= Math.pow(0.96, dt);
    }
    p.speed = Math.max(-CFG.MAX_SPEED * 0.4, Math.min(maxSpd, p.speed));

    // Steering
    const steerStr = 0.04 * dt;
    if (Input.left)  p.steer = Math.max(-1, p.steer - steerStr * 2.5);
    else if (Input.right) p.steer = Math.min(1, p.steer + steerStr * 2.5);
    else p.steer *= Math.pow(0.85, dt);

    // Drift
    const speedNorm = Math.abs(p.speed) / CFG.MAX_SPEED;
    const isDrifting = speedNorm > 0.4 && Math.abs(p.steer) > 0.5;
    this.drifting = isDrifting;
    const drift = isDrifting ? CFG.DRIFT_FACTOR : 0.975;
    p.driftAngle = p.driftAngle * Math.pow(drift, dt) + p.steer * 0.08 * dt;

    // Lateral movement
    const seg = this.track[Math.floor(p.pos) % this.track.length];
    p.offset += p.steer * speedNorm * 0.022 * dt - seg.curve * speedNorm * 0.004 * dt;
    p.offset = Math.max(-1.2, Math.min(1.2, p.offset));

    // Off-road friction
    if (Math.abs(p.offset) > 0.9) p.speed *= Math.pow(0.92, dt);

    // Advance position
    p.pos += p.speed * 0.01 * dt;
    const tLen = this.track.length;
    while (p.pos >= tLen) { p.pos -= tLen; this.completeLap(); }
    while (p.pos < 0)     { p.pos += tLen; }

    // ── Update audio
    Audio.updateEngine(speedNorm, isDrifting);

    
    if (isDrifting && speedNorm > 0.45) {
      p.combo += 0.04 * dt;
      p.comboTimer = 90;
      p.score += Math.floor(p.combo * CFG.DRIFT_SCORE_MULTIPLIER);
      p.nitro = Math.min(CFG.MAX_NITRO, p.nitro + 0.08 * dt);

      if (p.combo > p.bestCombo) {
        p.bestCombo = p.combo;
      }
    } else {
      p.comboTimer -= dt;
      if (p.comboTimer <= 0) p.combo = 0;
    }


    // ── Collisions ──
    const segIdx = Math.floor(p.pos);
    const curSeg = this.track[segIdx % tLen];

    // Coins
    for (const coin of curSeg.coins) {
      if (!coin.collected && Math.abs(p.offset - coin.offset) < 0.18) {
        coin.collected = true;
        p.coins++;
        p.score += CFG.COIN_VALUE;
        Audio.playCoin();
        this.showCoinPop();
        document.getElementById('coin-display').textContent = p.coins;
      }
    }
    // Boost pad
    if (curSeg.boostPad && p.boostTimer <= 0) {
      p.boostTimer = CFG.BOOST_DURATION * 0.5;
      Audio.playBoost();
      this.showBoostFlash();
    }
    // Obstacles
    for (const obs of curSeg.obstacles) {
      if (!obs.hit && Math.abs(p.offset - obs.offset) < 0.22) {
        obs.hit = true;
        p.speed *= 0.4;
        this.cameraShake = 12;
        Audio.playCrash();
        if (navigator.vibrate) navigator.vibrate(120);
        p.crashes++;
      }
    }

    // ── AI cars ──
    for (const ai of this.aiCars) {
      ai.segIndex = (ai.segIndex + ai.speed * 0.01 * dt) % tLen;
    }

    // ── Camera ──
    if (this.cameraShake > 0) this.cameraShake -= dt;
    this.cameraX += (p.steer * 60 - this.cameraX) * 0.08 * dt;

    // ── Timers ──
    if (this.started && !this.finished) this.totalTime += dt / 60;

    // ── HUD ──
    this.updateHUD(speedNorm, boosting);
  }

  completeLap() {
    const p = this.player;
    const lapTime = (performance.now() - p.lapStart) / 1000;
    p.lapTimes.push(lapTime);
    if (lapTime < this.bestLap) this.bestLap = lapTime;
    Audio.playLap();
    showCountdownFlash('LAP ' + p.lap);
    p.lapStart = performance.now();
    if (p.lap >= this.totalLaps) {
      this.finishRace();
      return;
    }
    p.lap++;
    document.getElementById('lap-display').textContent = p.lap + '/' + this.totalLaps;
  }

  finishRace() {
    this.finished = true;
    Audio.playFinish();
    Audio.stopEngine();
    // Save best lap
    if (this.bestLap < Infinity) {
      localStorage.setItem('polyRushBestLap', this.bestLap.toFixed(2));
    }
    document.getElementById('finish-best-lap').textContent = formatTime(this.bestLap);
    document.getElementById('finish-total').textContent    = formatTime(this.totalTime);
    document.getElementById('finish-coins').textContent    = this.player.coins;
    document.getElementById('finish-score').textContent    = this.player.score + ' pts';

    if (this.player.crashes === 0 && this.totalTime < 120) {
      this.player.medal = 'NEON MASTER';
    } else if (this.totalTime < 150) {
      this.player.medal = 'GOLD';
    } else if (this.totalTime < 180) {
      this.player.medal = 'SILVER';
    } else {
      this.player.medal = 'BRONZE';
    }

    document.getElementById('finish-medal').textContent = this.player.medal;
    document.getElementById('finish-combo').textContent = Math.floor(this.player.bestCombo);
    document.getElementById('finish-screen').classList.remove('hidden');
  }

  updateHUD(speedNorm, boosting) {
    const p = this.player;
    const elapsed = this.totalTime;

    document.getElementById('timer-display').textContent = formatTime(elapsed);
    document.getElementById('speed-value').textContent   = Math.floor(Math.abs(p.speed) * 22);
    const comboEl = document.getElementById('combo-display');
    if (comboEl) comboEl.textContent = 'x' + Math.floor(p.combo);

    // Boost bar
    const fill = document.getElementById('boost-bar-fill');
    const pct  = Math.max(0, p.boostTimer / CFG.BOOST_DURATION);
    fill.style.height = (pct * 100) + '%';

    // Speedometer needle
    this.drawSpeedometer(speedNorm, boosting);
  }

  drawSpeedometer(norm, boosting) {
    const c = this.speedoX;
    const W = 130, H = 130, cx = 65, cy = 70, r = 52;
    c.clearRect(0, 0, W, H);

    const primary = CFG.COLOR_PRIMARY;
    const accent  = CFG.COLOR_ACCENT;
    const col     = boosting ? accent : primary;

    // Arc track
    c.beginPath();
    c.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.25, false);
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.lineWidth = 8;
    c.stroke();

    // Filled arc
    c.beginPath();
    c.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + norm * Math.PI * 1.5, false);
    c.strokeStyle = col;
    c.lineWidth = 8;
    c.shadowColor = col; c.shadowBlur = 14;
    c.stroke();
    c.shadowBlur = 0;

    // Needle
    const angle = Math.PI * 0.75 + norm * Math.PI * 1.5;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(angle) * (r - 10), cy + Math.sin(angle) * (r - 10));
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.shadowColor = '#fff'; c.shadowBlur = 8;
    c.stroke();
    c.shadowBlur = 0;

    // Center dot
    c.beginPath();
    c.arc(cx, cy, 5, 0, Math.PI * 2);
    c.fillStyle = col;
    c.shadowColor = col; c.shadowBlur = 10;
    c.fill();
    c.shadowBlur = 0;
  }

  /* ════════════════════════════════════════════════════════
     DRAW  — Pseudo-3D road renderer
  ════════════════════════════════════════════════════════ */
  draw() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    const p = this.player;
    const camShake = this.cameraShake > 0 ? (Math.random() - 0.5) * this.cameraShake : 0;

    ctx.clearRect(0, 0, W, H);

    // ── Sky ──────────────────────────────────────────────
    const night = this.dayNight;
    const skyTop = lerpColor(COLORS.skyDayTop, COLORS.skyNightTop, night);
    const skyBot = lerpColor(COLORS.skyDayBot, COLORS.skyNightBot, night);
    const skGrad = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    skGrad.addColorStop(0, skyTop);
    skGrad.addColorStop(1, skyBot);
    ctx.fillStyle = skGrad;
    ctx.fillRect(0, 0, W, H * 0.55);

    // Stars (night)
    if (night > 0.3) {
      ctx.fillStyle = `rgba(255,255,255,${(night - 0.3) * 0.9})`;
      for (let s = 0; s < 80; s++) {
        const sx = ((s * 173 + 50) % W);
        const sy = ((s * 97  + 20) % (H * 0.5));
        ctx.fillRect(sx, sy, 1, 1);
      }
    }

    // Sun / Moon
    if (night < 0.5) {
      const sunR = 28;
      const sg = ctx.createRadialGradient(W*0.8, H*0.18, 0, W*0.8, H*0.18, sunR*2);
      sg.addColorStop(0, `rgba(255,230,150,${1 - night*2})`);
      sg.addColorStop(1, 'transparent');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(W*0.8, H*0.18, sunR*2, 0, Math.PI*2);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(220,220,255,${(night-0.5)*2})`;
      ctx.beginPath();
      ctx.arc(W*0.15, H*0.12, 18, 0, Math.PI*2);
      ctx.fill();
    }

    // ── Mountains / hills background ─────────────────────
    this.drawMountains(ctx, W, H, night);

    // ── Road segments (back to front) ────────────────────
    const horizon  = H * 0.52;
    const depth    = this.cameraDepth;
    const camPos   = p.pos;
    const segCount = CFG.VISIBLE_SEGMENTS;
    const tLen     = this.track.length;

    // Project into screen coords
    let projX = W / 2 + this.cameraX + camShake;
    let projY = horizon;
    let projW = 0;
    let curve = 0;
    let hill  = 0;

    const projected = [];
    for (let n = 0; n < segCount; n++) {
      const segIdx = (Math.floor(camPos) + n) % tLen;
      const seg    = this.track[segIdx];

      const t     = 1 / (n + depth * 60);
      const scale = t * W * depth;

      const screenX = projX - p.offset * scale * CFG.ROAD_WIDTH / 100;
      const screenY = projY;
      const roadW   = scale * CFG.ROAD_WIDTH;

      projected.push({ seg, segIdx, screenX, screenY, roadW, t, n });

      curve += seg.curve;
      hill  += seg.hill;
      projX += curve * 1.4 * t;
      projY -= hill * 0.5 * t * scale;
    }

    // Draw back-to-front
    for (let i = projected.length - 1; i >= 0; i--) {
      const curr = projected[i];
      const prev = projected[i + 1] || curr;
      this.drawSegment(ctx, W, H, curr, prev, night, p);
    }

    // ── Player car ───────────────────────────────────────
    this.drawPlayerCar(ctx, W, H, p, CAR_SKINS[this.selectedSkin]);

    // ── Camera mode effects ───────────────────────────────
    this.drawCameraEffects(ctx, W, H);

    
    if (this.weather === 'rain') {
      ctx.strokeStyle = 'rgba(180,220,255,0.25)';

      for (let i = 0; i < 120; i++) {
        const rx = Math.random() * W;
        const ry = Math.random() * H;

        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 6, ry + 14);
        ctx.stroke();
      }
    }

    if (this.weather === 'fog') {
      ctx.fillStyle = 'rgba(220,220,255,0.08)';
      ctx.fillRect(0, 0, W, H);
    }


    // ── Mini-map ──────────────────────────────────────────
    this.drawMinimap(p);

    // ── Countdown ────────────────────────────────────────
    if (!this.started) this.drawCountdown(ctx, W, H);
  }

  drawSegment(ctx, W, H, curr, prev, night, p) {
    const even    = curr.seg.color === 'even';
    const seg     = curr.seg;
    const horizon = H * 0.52;

    const x1 = prev.screenX, y1 = prev.screenY, w1 = prev.roadW;
    const x2 = curr.screenX, y2 = curr.screenY, w2 = curr.roadW;

    if (y1 <= horizon || y2 <= horizon) return;

    const gA = even ? (night > 0.5 ? COLORS.grassNightA : COLORS.grassDayA)
                    : (night > 0.5 ? COLORS.grassNightB : COLORS.grassDayB);

    // Grass
    ctx.fillStyle = gA;
    ctx.beginPath();
    ctx.moveTo(0, y1); ctx.lineTo(W, y1);
    ctx.lineTo(W, y2); ctx.lineTo(0, y2);
    ctx.closePath(); ctx.fill();

    // Road base
    ctx.fillStyle = even ? COLORS.roadDark : COLORS.roadLight;
    ctx.beginPath();
    ctx.moveTo(x1 - w1/2, y1); ctx.lineTo(x1 + w1/2, y1);
    ctx.lineTo(x2 + w2/2, y2); ctx.lineTo(x2 - w2/2, y2);
    ctx.closePath(); ctx.fill();

    // Curb
    const curbW = w1 * 0.06;
    ctx.fillStyle = even ? COLORS.curbA : COLORS.curbB;
    // Left curb
    ctx.beginPath();
    ctx.moveTo(x1 - w1/2 - curbW, y1); ctx.lineTo(x1 - w1/2, y1);
    ctx.lineTo(x2 - w2/2, y2);         ctx.lineTo(x2 - w2/2 - curbW*w2/w1, y2);
    ctx.closePath(); ctx.fill();
    // Right curb
    ctx.beginPath();
    ctx.moveTo(x1 + w1/2, y1);          ctx.lineTo(x1 + w1/2 + curbW, y1);
    ctx.lineTo(x2 + w2/2 + curbW*w2/w1, y2); ctx.lineTo(x2 + w2/2, y2);
    ctx.closePath(); ctx.fill();

    // Lane marking (dashed center)
    if (even) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(1, w1 * 0.02);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Boost pad
    if (seg.boostPad) {
      const bGrad = ctx.createLinearGradient(x1 - w1/2, 0, x1 + w1/2, 0);
      bGrad.addColorStop(0, 'transparent');
      bGrad.addColorStop(0.3, CFG.COLOR_PRIMARY + 'aa');
      bGrad.addColorStop(0.7, CFG.COLOR_PRIMARY + 'aa');
      bGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.moveTo(x1 - w1/2, y1); ctx.lineTo(x1 + w1/2, y1);
      ctx.lineTo(x2 + w2/2, y2); ctx.lineTo(x2 - w2/2, y2);
      ctx.closePath(); ctx.fill();
      // Arrows
      ctx.fillStyle = CFG.COLOR_PRIMARY;
      ctx.font = `${Math.max(8, w1 * 0.12)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('▲', x1, y1 - 2);
    }

    // Coins
    for (const coin of seg.coins) {
      if (coin.collected) continue;
      const cx = curr.screenX + coin.offset * curr.roadW * 0.42;
      const cy = curr.screenY - curr.roadW * 0.1;
      const cr = Math.max(3, curr.roadW * 0.07);
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Obstacles
    for (const obs of seg.obstacles) {
      if (obs.hit) continue;
      const ox = curr.screenX + obs.offset * curr.roadW * 0.42;
      const oy = curr.screenY;
      const oh = Math.max(8, curr.roadW * 0.22);
      this.drawObstacle(ctx, ox, oy, oh, obs.type, night);
    }

    // AI cars
    for (const ai of this.aiCars) {
      const aiSeg = Math.floor(ai.segIndex) % this.track.length;
      if (aiSeg === curr.segIdx) {
        const ax = curr.screenX + ai.offset * curr.roadW * 0.38;
        const ay = curr.screenY;
        const aw = Math.max(14, curr.roadW * 0.28);
        this.drawMiniCar(ctx, ax, ay, aw, ai.skin);
      }
    }
  }

  drawObstacle(ctx, x, y, h, type, night) {
    ctx.shadowColor = 'rgba(255,80,0,0.7)';
    ctx.shadowBlur  = 8;
    switch (type) {
      case 0: // Cone
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.moveTo(x, y - h); ctx.lineTo(x - h*0.4, y); ctx.lineTo(x + h*0.4, y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - h*0.4, y - h*0.35, h*0.8, h*0.1);
        break;
      case 1: // Barrier
        ctx.fillStyle = '#cc2200';
        ctx.fillRect(x - h*0.7, y - h*0.6, h*1.4, h*0.6);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - h*0.7, y - h*0.35, h*1.4, h*0.1);
        break;
      case 2: // Rock
        ctx.fillStyle = '#556677';
        ctx.beginPath();
        ctx.moveTo(x, y - h);
        ctx.lineTo(x + h*0.55, y - h*0.3);
        ctx.lineTo(x + h*0.35, y);
        ctx.lineTo(x - h*0.35, y);
        ctx.lineTo(x - h*0.55, y - h*0.3);
        ctx.closePath(); ctx.fill();
        break;
    }
    ctx.shadowBlur = 0;
  }

  drawMiniCar(ctx, x, y, w, skin) {
    const h = w * 1.8;
    ctx.save();
    ctx.translate(x, y - h * 0.5);
    // Body
    ctx.fillStyle = skin.body;
    ctx.fillRect(-w/2, -h/2, w, h);
    // Stripe
    ctx.fillStyle = skin.stripe;
    ctx.fillRect(-w/2, -h * 0.08, w, h * 0.16);
    // Wheels
    ctx.fillStyle = skin.wheel;
    ctx.fillRect(-w/2 - w*0.18, -h*0.35, w*0.18, h*0.25);
    ctx.fillRect( w/2,          -h*0.35, w*0.18, h*0.25);
    ctx.fillRect(-w/2 - w*0.18,  h*0.1,  w*0.18, h*0.25);
    ctx.fillRect( w/2,           h*0.1,  w*0.18, h*0.25);
    ctx.restore();
  }

  drawPlayerCar(ctx, W, H, p, skin) {
    const cw   = W * 0.10;
    const ch   = cw * 1.9;
    const cx   = W / 2 + this.cameraX * 0.3;
    let   cy   = H * 0.72;

    // Camera mode adjustments
    if (this.cameraMode === 2) cy = H * 0.85; // hood cam — car very low

    const drift = p.driftAngle;
    const speed = Math.abs(p.speed);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(drift * 0.35);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, ch * 0.46, cw * 0.8, ch * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wheels (back)
    ctx.fillStyle = skin.wheel;
    const ww = cw * 0.22, wh = ch * 0.22;
    ctx.fillRect(-cw/2 - ww, ch * 0.08,  ww, wh);
    ctx.fillRect( cw/2,      ch * 0.08,  ww, wh);

    // Body
    ctx.fillStyle = skin.body;
    ctx.beginPath();
    ctx.moveTo(-cw*0.4, -ch*0.45);
    ctx.lineTo(-cw*0.5,  ch*0.45);
    ctx.lineTo( cw*0.5,  ch*0.45);
    ctx.lineTo( cw*0.4, -ch*0.45);
    ctx.closePath(); ctx.fill();

    // Roof
    ctx.fillStyle = skin.stripe;
    ctx.beginPath();
    ctx.moveTo(-cw*0.28, -ch*0.42);
    ctx.lineTo(-cw*0.32, -ch*0.08);
    ctx.lineTo( cw*0.32, -ch*0.08);
    ctx.lineTo( cw*0.28, -ch*0.42);
    ctx.closePath(); ctx.fill();

    // Stripe
    ctx.fillStyle = skin.stripe;
    ctx.fillRect(-cw*0.5, -ch*0.06, cw, ch*0.12);

    // Windshield
    ctx.fillStyle = 'rgba(150,240,255,0.55)';
    ctx.fillRect(-cw*0.27, -ch*0.41, cw*0.54, ch*0.3);

    // Front wheels (steered)
    ctx.save();
    ctx.rotate(p.steer * 0.25);
    ctx.fillStyle = skin.wheel;
    ctx.fillRect(-cw/2 - ww, -ch*0.42, ww, wh);
    ctx.fillRect( cw/2,      -ch*0.42, ww, wh);
    ctx.restore();

    // Headlights
    ctx.fillStyle = this.dayNight > 0.4 ? '#ffffaa' : '#ffffff33';
    ctx.shadowColor = this.dayNight > 0.4 ? '#ffffaa' : 'transparent';
    ctx.shadowBlur  = this.dayNight > 0.4 ? 18 : 0;
    ctx.fillRect(-cw*0.42, -ch*0.47, cw*0.16, ch*0.06);
    ctx.fillRect( cw*0.26, -ch*0.47, cw*0.16, ch*0.06);
    ctx.shadowBlur = 0;

    // Tail lights
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(-cw*0.42, ch*0.42, cw*0.16, ch*0.05);
    ctx.fillRect( cw*0.26, ch*0.42, cw*0.16, ch*0.05);

    // Exhaust spark on boost
    if (p.boostTimer > 0) {
      ctx.fillStyle = CFG.COLOR_PRIMARY;
      ctx.shadowColor = CFG.COLOR_PRIMARY; ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(-cw*0.1, ch*0.46);
      const spk = (Math.random() * ch * 0.3 + ch * 0.1) * (p.boostTimer / CFG.BOOST_DURATION);
      ctx.lineTo(-cw*0.05, ch*0.46 + spk);
      ctx.lineTo( cw*0.05, ch*0.46 + spk);
      ctx.lineTo( cw*0.1,  ch*0.46);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Drift smoke
    if (this.drifting && speed > 2) {
      for (let i = 0; i < 3; i++) {
        const sx = (Math.random() - 0.5) * cw;
        const sy = ch * 0.44 + Math.random() * 10;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.random() * 8 + 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,200,220,${0.15 + Math.random() * 0.15})`;
        ctx.fill();
      }
    }

    ctx.restore();
  }

  drawMountains(ctx, W, H, night) {
    const horizon = H * 0.52;
    const col1 = night > 0.5 ? '#0c1020' : '#1e2d4d';
    const col2 = night > 0.5 ? '#0a0c18' : '#162238';

    ctx.fillStyle = col1;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let mx = 0; mx <= W; mx += W / 8) {
      ctx.lineTo(mx, horizon - (Math.sin(mx * 0.01 + 1) * 0.5 + 0.5) * H * 0.18);
    }
    ctx.lineTo(W, horizon); ctx.closePath(); ctx.fill();

    ctx.fillStyle = col2;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let mx = 0; mx <= W; mx += W / 6) {
      ctx.lineTo(mx, horizon - (Math.sin(mx * 0.013 + 3) * 0.5 + 0.5) * H * 0.10);
    }
    ctx.lineTo(W, horizon); ctx.closePath(); ctx.fill();
  }

  drawCameraEffects(ctx, W, H) {
    // Vignette
    const vig = ctx.createRadialGradient(W/2, H/2, H*0.25, W/2, H/2, H*0.75);
    vig.addColorStop(0, 'transparent');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Hood cam: crosshair reticle
    if (this.cameraMode === 2) {
      ctx.strokeStyle = CFG.COLOR_PRIMARY + '55';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(W/2 - 30, H * 0.65); ctx.lineTo(W/2 + 30, H * 0.65); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W/2, H * 0.65 - 12); ctx.lineTo(W/2, H * 0.65 + 12); ctx.stroke();
    }

    // Cinematic bars
    if (this.cameraMode === 1) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H * 0.07);
      ctx.fillRect(0, H * 0.93, W, H * 0.07);
    }

    // Speed blur lines when boosting
    if (this.player && this.player.boostTimer > 20) {
      const alpha = Math.min(0.35, (this.player.boostTimer / CFG.BOOST_DURATION) * 0.35);
      ctx.strokeStyle = `rgba(0,245,255,${alpha})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const bx = Math.random() * W;
        const by = Math.random() * H * 0.6 + H * 0.3;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + (Math.random()-0.5)*80, by); ctx.stroke();
      }
    }
  }

  drawCountdown(ctx, W, H) {
    const label = this.countdown > 0 ? String(this.countdown) : 'GO!';
    ctx.fillStyle = `rgba(0,0,0,0.55)`;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = CFG.COLOR_PRIMARY;
    ctx.font = `bold ${Math.min(W,H) * 0.22}px 'Orbitron', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = CFG.COLOR_PRIMARY; ctx.shadowBlur = 40;
    ctx.fillText(label, W/2, H/2);
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';
  }

  drawMinimap(p) {
    const mc = this.minimapX;
    const R  = 60;
    mc.clearRect(0, 0, 120, 120);

    // Background
    mc.fillStyle = 'rgba(0,0,0,0.7)';
    mc.beginPath(); mc.arc(60, 60, R, 0, Math.PI*2); mc.fill();

    // Track dots
    const tLen = this.track.length;
    mc.strokeStyle = 'rgba(255,255,255,0.15)';
    mc.lineWidth = 2;
    mc.beginPath();
    for (let i = 0; i < tLen; i++) {
      const angle = (i / tLen) * Math.PI * 2 - Math.PI / 2;
      const mx = 60 + Math.cos(angle) * (R - 10);
      const my = 60 + Math.sin(angle) * (R - 10);
      i === 0 ? mc.moveTo(mx, my) : mc.lineTo(mx, my);
    }
    mc.closePath(); mc.stroke();

    // Player dot
    const pa = (p.pos / tLen) * Math.PI * 2 - Math.PI / 2;
    const px = 60 + Math.cos(pa) * (R - 10);
    const py = 60 + Math.sin(pa) * (R - 10);
    mc.beginPath(); mc.arc(px, py, 5, 0, Math.PI*2);
    mc.fillStyle = CFG.COLOR_PRIMARY;
    mc.shadowColor = CFG.COLOR_PRIMARY; mc.shadowBlur = 10;
    mc.fill(); mc.shadowBlur = 0;

    // AI dots
    for (const ai of this.aiCars) {
      const aa = (ai.segIndex / tLen) * Math.PI * 2 - Math.PI / 2;
      const ax = 60 + Math.cos(aa) * (R - 10);
      const ay = 60 + Math.sin(aa) * (R - 10);
      mc.beginPath(); mc.arc(ax, ay, 3, 0, Math.PI*2);
      mc.fillStyle = CFG.COLOR_ACCENT;
      mc.fill();
    }

    // Clip circle border glow
    mc.strokeStyle = CFG.COLOR_PRIMARY + '55';
    mc.lineWidth = 2;
    mc.beginPath(); mc.arc(60, 60, R, 0, Math.PI*2); mc.stroke();
  }

  /* ── Visual effects ── */
  showBoostFlash() {
    const el = document.createElement('div');
    el.className = 'boost-flash';
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  showCoinPop() {
    const el = document.createElement('div');
    el.className = 'coin-pop';
    el.textContent = '+' + CFG.COIN_VALUE;
    el.style.left = (30 + Math.random() * (window.innerWidth - 60)) + 'px';
    el.style.top  = (window.innerHeight * 0.5 + Math.random() * 60) + 'px';
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

/* ════════════════════════════════════════════════════════
   SKIN SELECTOR (menu UI)
════════════════════════════════════════════════════════ */
function buildSkinGrid(game) {
  const grid = document.getElementById('skin-grid');
  grid.innerHTML = '';
  CAR_SKINS.forEach((skin, i) => {
    const card = document.createElement('div');
    card.className = 'skin-card' + (i === game.selectedSkin ? ' active' : '');
    const cv = document.createElement('canvas');
    cv.className = 'skin-canvas';
    cv.width = 58; cv.height = 40;
    drawSkinPreview(cv.getContext('2d'), skin, 58, 40);
    const name = document.createElement('div');
    name.className = 'skin-name';
    name.textContent = skin.name;
    card.appendChild(cv); card.appendChild(name);
    card.addEventListener('click', () => {
      game.selectedSkin = i;
      document.querySelectorAll('.skin-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
    });
    grid.appendChild(card);
  });
}

function drawSkinPreview(ctx, skin, W, H) {
  const cx = W/2, cy = H/2;
  const cw = W*0.42, ch = H*0.82;
  ctx.fillStyle = skin.body;
  ctx.beginPath();
  ctx.moveTo(cx - cw*0.4, cy - ch*0.45);
  ctx.lineTo(cx - cw*0.5, cy + ch*0.45);
  ctx.lineTo(cx + cw*0.5, cy + ch*0.45);
  ctx.lineTo(cx + cw*0.4, cy - ch*0.45);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = skin.stripe;
  ctx.fillRect(cx - cw*0.5, cy - ch*0.06, cw, ch*0.12);
  ctx.fillStyle = skin.wheel;
  const ww=cw*0.18, wh=ch*0.22;
  ctx.fillRect(cx-cw/2-ww, cy-ch*0.38, ww, wh);
  ctx.fillRect(cx+cw/2,    cy-ch*0.38, ww, wh);
  ctx.fillRect(cx-cw/2-ww, cy+ch*0.12, ww, wh);
  ctx.fillRect(cx+cw/2,    cy+ch*0.12, ww, wh);
}

/* ════════════════════════════════════════════════════════
   UTILITIES
════════════════════════════════════════════════════════ */
function formatTime(sec) {
  if (!isFinite(sec)) return '--:--.--';
  const m  = Math.floor(sec / 60);
  const s  = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(2,'0')}`;
}

function showCountdownFlash(text) {
  const el = document.createElement('div');
  el.className = 'countdown-flash';
  el.textContent = text;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 0xff, ag = (pa >> 8) & 0xff, ab = pa & 0xff;
  const br = (pb >> 16) & 0xff, bg = (pb >> 8) & 0xff, bb = pb & 0xff;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return `#${((1<<24)|(rr<<16)|(rg<<8)|rb).toString(16).slice(1)}`;
}

function isMobile() { return window.innerWidth <= 600 || 'ontouchstart' in window; }

/* ════════════════════════════════════════════════════════
   BOOT / SCREEN MANAGER
════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  Input.init();
  buildSkinGrid(game);

  // Restore best lap
  const saved = localStorage.getItem('polyRushBestLap');
  if (saved) document.getElementById('best-time-display').textContent = formatTime(parseFloat(saved));

  // Mobile controls
  if (isMobile()) {
    document.getElementById('touch-controls').classList.remove('hidden');
  }

  // ── Screen helpers ──
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.classList.add('hidden');
    });
    const el = document.getElementById(id);
    el.classList.remove('hidden');
    el.classList.add('active');
  }

  function startGame() {
    showScreen('game-screen');
    document.getElementById('race-overlay').classList.add('hidden');
    document.getElementById('finish-screen').classList.add('hidden');
    document.getElementById('lap-display').textContent  = '1/' + 3;
    document.getElementById('coin-display').textContent = '0';
    document.getElementById('timer-display').textContent= '00:00.00';
    game.init();
    game.start();
    if (isMobile()) document.getElementById('touch-controls').classList.remove('hidden');
  }

  function goMenu() {
    game.stop();
    showScreen('menu-screen');
    document.getElementById('touch-controls').classList.add('hidden');
    const saved2 = localStorage.getItem('polyRushBestLap');
    if (saved2) document.getElementById('best-time-display').textContent = formatTime(parseFloat(saved2));
    buildSkinGrid(game);
  }

  // ── Menu events ──
  document.getElementById('btn-play').addEventListener('click', () => { Audio.init(); Audio.resume(); startGame(); });
  document.getElementById('btn-howto').addEventListener('click', () => document.getElementById('howto-modal').classList.remove('hidden'));
  document.getElementById('btn-close-howto').addEventListener('click', () => document.getElementById('howto-modal').classList.add('hidden'));

  // ── In-game events ──
  document.getElementById('btn-pause').addEventListener('click', () => {
    if (game.finished) return;
    game.paused = !game.paused;
    const ov = document.getElementById('race-overlay');
    const rm = document.getElementById('race-message');
    if (game.paused) {
      rm.textContent = 'PAUSED';
      ov.classList.remove('hidden');
      Audio.stopEngine();
    } else {
      ov.classList.add('hidden');
      Audio.startEngine(0);
    }
  });

  document.getElementById('btn-resume').addEventListener('click', () => {
    game.paused = false;
    document.getElementById('race-overlay').classList.add('hidden');
    Audio.startEngine(0);
  });

  document.getElementById('btn-menu-from-game').addEventListener('click', goMenu);
  document.getElementById('btn-restart').addEventListener('click',  startGame);
  document.getElementById('btn-back-menu').addEventListener('click', goMenu);

  // Camera toggle
  document.addEventListener('keydown', e => {
    if (e.code === 'KeyC' && game.running) {
      game.cameraMode = (game.cameraMode + 1) % 3;
    }
    if (e.code === 'Escape' && game.running && !game.finished) {
      game.paused = !game.paused;
      const ov = document.getElementById('race-overlay');
      const rm = document.getElementById('race-message');
      if (game.paused) { rm.textContent='PAUSED'; ov.classList.remove('hidden'); Audio.stopEngine(); }
      else             { ov.classList.add('hidden'); Audio.startEngine(0); }
    }
  });

  // Prevent pull-to-refresh on mobile
  document.body.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
});
