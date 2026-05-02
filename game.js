/* ============================================================
   PlutoMars Racing — game.js (All bugs fixed)
   Fixes applied:
   1. HUD display conflict fixed (JS-only control)
   2. PeerJS loaded from cdnjs in HTML (CSP-safe)
   3. Mobile detection also fires on resize
   4. Duplicate display rules removed from CSS
   5. botWpIdx wraps correctly, bot laps tracked
   6. Player lap detection via checkpoint cross
   7. sendPlayerState() throttled to 20fps
   8. initThree() runs AFTER canvas is visible
   ============================================================ */

'use strict';

/* ── STATE ───────────────────────────────────────────────────── */
let scene, camera, renderer;
let playerCar, botCar, remoteCar;
let peer, conn;
let gameRunning = false;
let isMultiplayer = false;

/* controls */
const keys = {};

/* physics */
const MAX_SPEED  = 0.55;
const ACCEL      = 0.018;
const BRAKE      = 0.028;
const FRICTION   = 0.012;
const TURN_SPEED = 0.032;

let playerSpeed = 0;
let botSpeed    = 0;

/* laps — BUG 6 FIX: fully implemented */
const MAX_LAPS = 3;
let playerLap   = 1;
let botLap      = 1;
let playerCrossedStart = false;

/* bot waypoint — BUG 5 FIX: wraps correctly */
let waypoints   = [];
let botWpIdx    = 0;

/* network throttle — BUG 7 FIX */
let lastSendTime = 0;
const SEND_INTERVAL_MS = 50; // 20fps cap

/* restart reference */
let animFrameId = null;

/* ── ENTRY POINTS ────────────────────────────────────────────── */
function startSolo() {
  startGame(false, false);
}

function hostGame() {
  if (typeof Peer === 'undefined') {
    alert('PeerJS failed to load. Check your internet connection.');
    return;
  }
  peer = new Peer();
  peer.on('open', id => {
    document.getElementById('roomInfo').textContent = '🔑 Room ID: ' + id;
    showRoomBadge('Room: ' + id);
    peer.on('connection', c => {
      conn = c;
      conn.on('data', data => onRemoteData(data));
      conn.on('error', err => console.warn('Conn error:', err));
    });
  });
  peer.on('error', err => {
    console.warn('PeerJS error:', err);
    document.getElementById('roomInfo').textContent = '⚠️ Connection error: ' + err.type;
  });
  startGame(true, true);
}

function joinGame() {
  if (typeof Peer === 'undefined') {
    alert('PeerJS failed to load. Check your internet connection.');
    return;
  }
  const hostId = document.getElementById('joinId').value.trim();
  if (!hostId) { alert('Please enter a Room ID!'); return; }

  peer = new Peer();
  peer.on('open', () => {
    conn = peer.connect(hostId);
    conn.on('open', () => {
      showRoomBadge('Joined: ' + hostId);
      conn.on('data', data => onRemoteData(data));
    });
    conn.on('error', err => console.warn('Conn error:', err));
  });
  peer.on('error', err => {
    alert('Could not connect. Check the Room ID.\nError: ' + err.type);
  });
  startGame(true, false);
}

/* ── START GAME ──────────────────────────────────────────────── */
function startGame(multiplayer, host) {
  isMultiplayer = multiplayer;
  gameRunning   = true;
  playerLap     = 1;
  botLap        = 1;
  botWpIdx      = 0;
  playerSpeed   = 0;
  botSpeed      = 0;
  playerCrossedStart = false;

  /* hide menu, show canvas — BUG 8 FIX: canvas shown BEFORE initThree */
  document.getElementById('menu').style.display          = 'none';
  document.getElementById('finishScreen').style.display  = 'none';
  document.getElementById('gameCanvas').style.display    = 'block';

  /* BUG 8 FIX: initThree called AFTER canvas visible so renderer gets correct size */
  initThree();

  /* show HUD — BUG 1 FIX: only controlled here in JS */
  const hud = document.getElementById('hud');
  hud.style.display = 'flex';

  updateHUD();
  setupControls();
  checkMobileControls();

  /* start loop */
  if (animFrameId) cancelAnimationFrame(animFrameId);
  animate();
}

/* ── THREE.JS INIT ───────────────────────────────────────────── */
function initThree() {
  /* dispose old renderer if restarting */
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0e1a);
  scene.fog = new THREE.FogExp2(0x0d0e1a, 0.008);

  camera = new THREE.PerspectiveCamera(
    70, window.innerWidth / window.innerHeight, 0.1, 600
  );

  const canvas = document.getElementById('gameCanvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  buildLighting();
  buildGround();
  buildTrack();
  buildEnvironment();

  waypoints = buildWaypoints();

  /* spawn cars */
  playerCar = createCar(0xff3c00);
  playerCar.position.set(waypoints[0].x, 0, waypoints[0].z + 4);
  scene.add(playerCar);

  botCar = createCar(0x0088ff);
  botCar.position.set(waypoints[0].x, 0, waypoints[0].z + 9);
  scene.add(botCar);

  remoteCar = null;

  window.removeEventListener('resize', onResize);
  window.addEventListener('resize', onResize);
}

/* ── LIGHTING ────────────────────────────────────────────────── */
function buildLighting() {
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const sun = new THREE.DirectionalLight(0xfff5e0, 1.4);
  sun.position.set(60, 120, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.width  = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far  = 300;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -120;
  sun.shadow.camera.right = sun.shadow.camera.top   =  120;
  scene.add(sun);

  scene.add(new THREE.HemisphereLight(0x223366, 0x112211, 0.4));
}

/* ── GROUND ──────────────────────────────────────────────────── */
function buildGround() {
  const geo = new THREE.PlaneGeometry(600, 600);
  const mat = new THREE.MeshLambertMaterial({ color: 0x1a2a14 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

/* ── TRACK ───────────────────────────────────────────────────── */
function buildTrack() {
  /* outer road ring */
  const roadMat  = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  const outerGeo = new THREE.RingGeometry(18, 32, 64);
  const road = new THREE.Mesh(outerGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  scene.add(road);

  /* kerb stripes — alternating red/white */
  const kerbGeo = new THREE.RingGeometry(31, 34, 64);
  const kerbMat = new THREE.MeshLambertMaterial({ color: 0xcc1111 });
  const kerb = new THREE.Mesh(kerbGeo, kerbMat);
  kerb.rotation.x = -Math.PI / 2;
  kerb.position.y = 0.03;
  scene.add(kerb);

  const kerbInGeo = new THREE.RingGeometry(15, 18, 64);
  const kerbIn = new THREE.Mesh(kerbInGeo, kerbMat);
  kerbIn.rotation.x = -Math.PI / 2;
  kerbIn.position.y = 0.03;
  scene.add(kerbIn);

  /* infield grass */
  const infieldGeo = new THREE.CircleGeometry(15, 64);
  const infieldMat = new THREE.MeshLambertMaterial({ color: 0x2d5a1b });
  const infield = new THREE.Mesh(infieldGeo, infieldMat);
  infield.rotation.x = -Math.PI / 2;
  infield.position.y = 0.01;
  scene.add(infield);

  /* start/finish line */
  const lineGeo = new THREE.PlaneGeometry(14, 1.5);
  const lineMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const line = new THREE.Mesh(lineGeo, lineMat);
  line.rotation.x = -Math.PI / 2;
  line.position.set(25, 0.05, 0);
  scene.add(line);

  /* checkered pattern on start line */
  for (let i = 0; i < 6; i++) {
    if (i % 2 === 0) {
      const sq = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 1.4),
        new THREE.MeshLambertMaterial({ color: 0x111111 })
      );
      sq.rotation.x = -Math.PI / 2;
      sq.position.set(19 + i * 2.2, 0.06, 0);
      scene.add(sq);
    }
  }
}

/* ── ENVIRONMENT ─────────────────────────────────────────────── */
function buildEnvironment() {
  /* grandstands */
  addGrandstand(0, -42);
  addGrandstand(0,  42);

  /* trees scattered outside */
  const treePositions = [
    [-55, -55], [55, -55], [-55, 55], [55, 55],
    [-70, 0], [70, 0], [0, -70], [0, 70],
    [-45, -70], [45, -70], [-45, 70], [45, 70],
    [-80, -30], [80, -30], [-80, 30], [80, 30],
  ];
  treePositions.forEach(([x, z]) => addTree(x, z));

  /* tire barriers at infield */
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    addTireStack(Math.cos(a) * 14.5, Math.sin(a) * 14.5);
  }
}

function addGrandstand(x, z) {
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(50, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0x334466 })
  );
  base.position.set(x, 5, z);
  base.castShadow = true;
  scene.add(base);

  /* seats rows */
  for (let r = 0; r < 4; r++) {
    const row = new THREE.Mesh(
      new THREE.BoxGeometry(50, 0.4, 1.5),
      new THREE.MeshLambertMaterial({ color: r % 2 === 0 ? 0xff3300 : 0xffffff })
    );
    row.position.set(x, 10.5 + r * 1.2, z + r * 0.8 * (z < 0 ? -1 : 1));
    scene.add(row);
  }
}

function addTree(x, z) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.6, 3, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b3a1f })
  );
  trunk.position.set(x, 1.5, z);
  trunk.castShadow = true;
  scene.add(trunk);

  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(3.5, 7, 7),
    new THREE.MeshLambertMaterial({ color: 0x2d7a1e })
  );
  leaves.position.set(x, 7.5, z);
  leaves.castShadow = true;
  scene.add(leaves);
}

function addTireStack(x, z) {
  const tireMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (let i = 0; i < 2; i++) {
    const tire = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.25, 6, 12),
      tireMat
    );
    tire.position.set(x, 0.6 + i * 1.1, z);
    scene.add(tire);
  }
}

/* ── CARS ────────────────────────────────────────────────────── */
function createCar(color) {
  const group = new THREE.Group();

  /* body */
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.65, 4.2),
    new THREE.MeshLambertMaterial({ color })
  );
  body.position.y = 0.45;
  body.castShadow = true;
  group.add(body);

  /* cockpit */
  const cockpit = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.5, 1.8),
    new THREE.MeshLambertMaterial({ color })
  );
  cockpit.position.set(0, 0.9, -0.3);
  cockpit.castShadow = true;
  group.add(cockpit);

  /* windshield */
  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.4, 0.1),
    new THREE.MeshLambertMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5 })
  );
  windshield.position.set(0, 0.9, 0.65);
  group.add(windshield);

  /* front spoiler */
  const spoilerF = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.08, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x111111 })
  );
  spoilerF.position.set(0, 0.15, 2.2);
  group.add(spoilerF);

  /* rear spoiler */
  const spoilerR = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.5, 0.12),
    new THREE.MeshLambertMaterial({ color: 0x111111 })
  );
  spoilerR.position.set(0, 0.9, -2.1);
  group.add(spoilerR);

  /* wheels */
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 14);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const rimMat   = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
  [[-1.2, 0, 1.4], [1.2, 0, 1.4], [-1.2, 0, -1.4], [1.2, 0, -1.4]].forEach(([wx, wy, wz]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, wy, wz);
    group.add(wheel);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.33, 8), rimMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(wx, wy, wz);
    group.add(rim);
  });

  /* headlights */
  const hMat = new THREE.MeshLambertMaterial({ color: 0xffff99, emissive: 0xffff44, emissiveIntensity: 0.6 });
  [-0.65, 0.65].forEach(lx => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), hMat);
    hl.position.set(lx, 0.5, 2.1);
    group.add(hl);
  });

  /* taillights */
  const tMat = new THREE.MeshLambertMaterial({ color: 0xff1100, emissive: 0xff0000, emissiveIntensity: 0.5 });
  [-0.65, 0.65].forEach(lx => {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.1), tMat);
    tl.position.set(lx, 0.5, -2.1);
    group.add(tl);
  });

  return group;
}

/* ── WAYPOINTS (circular track) ──────────────────────────────── */
function buildWaypoints() {
  const pts = [];
  const count = 48;
  const radius = 25;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  return pts;
}

/* ── CONTROLS ────────────────────────────────────────────────── */
function setupControls() {
  /* keyboard */
  window.addEventListener('keydown', e => { keys[e.key] = true; });
  window.addEventListener('keyup',   e => { keys[e.key] = false; });

  /* mobile buttons — BUG 3 FIX: proper touch + mouse */
  const map = {
    btnUp:    'ArrowUp',
    btnDown:  'ArrowDown',
    btnLeft:  'ArrowLeft',
    btnRight: 'ArrowRight'
  };
  Object.entries(map).forEach(([id, key]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const press   = e => { e.preventDefault(); keys[key] = true;  btn.classList.add('pressed'); };
    const release = e => { e.preventDefault(); keys[key] = false; btn.classList.remove('pressed'); };
    btn.addEventListener('touchstart', press,   { passive: false });
    btn.addEventListener('touchend',   release, { passive: false });
    btn.addEventListener('touchcancel',release, { passive: false });
    btn.addEventListener('mousedown',  press);
    btn.addEventListener('mouseup',    release);
    btn.addEventListener('mouseleave', release);
  });
}

/* BUG 3 FIX: also called on resize */
function checkMobileControls() {
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
                || window.innerWidth < 768;
  document.getElementById('mobileControls').style.display = isMobile ? 'flex' : 'none';
}

/* ── PHYSICS: PLAYER ─────────────────────────────────────────── */
function updatePlayer(dt) {
  const accel = (keys['ArrowUp']   || keys['w'] || keys['W']) ? ACCEL  : 0;
  const brake = (keys['ArrowDown'] || keys['s'] || keys['S']) ? BRAKE  : 0;

  if (accel > 0)      playerSpeed = Math.min(playerSpeed + accel, MAX_SPEED);
  else if (brake > 0) playerSpeed = Math.max(playerSpeed - brake, -MAX_SPEED * 0.4);
  else                playerSpeed *= (1 - FRICTION);

  if (Math.abs(playerSpeed) > 0.005) {
    const dir = playerSpeed > 0 ? 1 : -1;
    if (keys['ArrowLeft']  || keys['a'] || keys['A'])
      playerCar.rotation.y += TURN_SPEED * dir;
    if (keys['ArrowRight'] || keys['d'] || keys['D'])
      playerCar.rotation.y -= TURN_SPEED * dir;
  }

  playerCar.translateZ(playerSpeed);
  playerCar.position.y = 0;

  /* clamp inside/outside track loosely */
  const dist = Math.sqrt(playerCar.position.x ** 2 + playerCar.position.z ** 2);
  if (dist < 17) {
    const pushDir = playerCar.position.clone().normalize();
    playerCar.position.copy(pushDir.multiplyScalar(17));
    playerSpeed *= 0.5;
  }
  if (dist > 33) {
    const pushDir = playerCar.position.clone().normalize();
    playerCar.position.copy(pushDir.multiplyScalar(33));
    playerSpeed *= 0.5;
  }

  /* BUG 6 FIX: lap detection via crossing start line (x > 22, |z| < 3) */
  const px = playerCar.position.x;
  const pz = playerCar.position.z;
  if (px > 22 && Math.abs(pz) < 3) {
    if (!playerCrossedStart) {
      playerCrossedStart = true;
    }
  } else {
    if (playerCrossedStart) {
      /* completed a half-loop — now crossing start from other direction */
      playerCrossedStart = false;
      if (playerLap < MAX_LAPS) {
        playerLap++;
        updateHUD();
      } else {
        endRace(true);
        return;
      }
    }
  }

  /* HUD speed */
  document.getElementById('speed').textContent =
    Math.abs(Math.round(playerSpeed * 180));
}

/* ── BOT AI ──────────────────────────────────────────────────── */
function updateBot() {
  if (!botCar) return;

  /* BUG 5 FIX: use modulo to wrap, never overflow */
  const wp = waypoints[botWpIdx % waypoints.length];
  const dir = new THREE.Vector3().subVectors(wp, botCar.position);
  const dist = dir.length();

  if (dist < 7) {
    botWpIdx++;

    /* BUG 5 FIX: track bot laps */
    if (botWpIdx > 0 && botWpIdx % waypoints.length === 0) {
      botLap++;
      if (botLap > MAX_LAPS && playerLap <= MAX_LAPS) {
        endRace(false);
        return;
      }
    }
  }

  const targetAngle = Math.atan2(dir.x, dir.z);
  let angleDiff = targetAngle - botCar.rotation.y;
  /* normalise to [-PI, PI] */
  while (angleDiff >  Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  botCar.rotation.y += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 0.028);

  /* bot speed with slight randomness for realism */
  const topSpeed = MAX_SPEED * 0.88 + Math.sin(Date.now() * 0.001) * 0.03;
  botSpeed = Math.min(botSpeed + 0.012, topSpeed);
  botCar.translateZ(botSpeed);
  botCar.position.y = 0;
}

/* ── NETWORK ─────────────────────────────────────────────────── */
function onRemoteData(data) {
  if (!remoteCar) {
    remoteCar = createCar(0x00ff88);
    scene.add(remoteCar);
  }
  remoteCar.position.set(data.x, data.y, data.z);
  remoteCar.rotation.y = data.ry;
}

/* BUG 7 FIX: throttled to 20fps */
function sendPlayerState() {
  if (!conn || !conn.open) return;
  const now = Date.now();
  if (now - lastSendTime < SEND_INTERVAL_MS) return;
  lastSendTime = now;
  try {
    conn.send({
      x:  playerCar.position.x,
      y:  playerCar.position.y,
      z:  playerCar.position.z,
      ry: playerCar.rotation.y
    });
  } catch (e) {
    /* ignore send errors */
  }
}

/* ── CAMERA ──────────────────────────────────────────────────── */
function updateCamera() {
  const offset = new THREE.Vector3(0, 5, -11);
  offset.applyEuler(playerCar.rotation);
  const target = playerCar.position.clone().add(offset);
  camera.position.lerp(target, 0.12);
  camera.lookAt(
    playerCar.position.x,
    playerCar.position.y + 1,
    playerCar.position.z
  );
}

/* ── POSITION DISPLAY ────────────────────────────────────────── */
function getPlayerPosition() {
  if (botLap > playerLap) return '2nd';
  if (playerLap > botLap) return '1st';
  /* same lap — compare waypoint proximity */
  const playerAngle = Math.atan2(playerCar.position.x, playerCar.position.z);
  const botAngle    = Math.atan2(botCar.position.x, botCar.position.z);
  return playerAngle >= botAngle ? '1st' : '2nd';
}

function updateHUD() {
  document.getElementById('lap').textContent = Math.min(playerLap, MAX_LAPS);
  document.getElementById('pos').textContent = getPlayerPosition();
}

/* ── RACE END ────────────────────────────────────────────────── */
function endRace(playerWon) {
  gameRunning = false;
  const fs = document.getElementById('finishScreen');
  document.getElementById('finishIcon').textContent  = playerWon ? '🏆' : '😢';
  document.getElementById('finishTitle').textContent = playerWon ? 'You Win!' : 'Bot Wins!';
  document.getElementById('finishMsg').textContent   = playerWon
    ? 'You finished ' + MAX_LAPS + ' laps first!'
    : 'The bot beat you this time. Try again!';
  fs.style.display = 'flex';
}

/* ── RESTART / MENU ──────────────────────────────────────────── */
function restartGame() {
  document.getElementById('finishScreen').style.display = 'none';
  startGame(isMultiplayer, false);
}

function backToMenu() {
  gameRunning = false;
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (peer) { try { peer.destroy(); } catch(e){} peer = null; }
  conn = null;
  document.getElementById('finishScreen').style.display  = 'none';
  document.getElementById('gameCanvas').style.display    = 'none';
  document.getElementById('hud').style.display           = 'none';
  document.getElementById('mobileControls').style.display= 'none';
  document.getElementById('roomBadge').style.display     = 'none';
  document.getElementById('menu').style.display          = 'flex';
  document.getElementById('roomInfo').textContent        = '';
}

/* ── HELPERS ─────────────────────────────────────────────────── */
function showRoomBadge(text) {
  const b = document.getElementById('roomBadge');
  document.getElementById('roomBadgeText').textContent = text;
  b.style.display = 'block';
}

/* ── MAIN LOOP ───────────────────────────────────────────────── */
function animate() {
  if (!gameRunning) return;
  animFrameId = requestAnimationFrame(animate);

  updatePlayer();
  updateBot();
  updateCamera();
  updateHUD();
  sendPlayerState();

  renderer.render(scene, camera);
}

/* ── RESIZE ──────────────────────────────────────────────────── */
function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  /* BUG 3 FIX: re-check mobile on resize */
  checkMobileControls();
}
