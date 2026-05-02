// ============================================================
// PlutoMars Racing — Three.js 3D Game with Bot & Multiplayer
// ============================================================

let scene, camera, renderer, playerCar, botCar, peer, conn;
let keys = {}, gameRunning = false, isMultiplayer = false, isHost = false;
let playerSpeed = 0, botSpeed = 0, lap = 1, maxLaps = 3;
let track = [], obstacles = [];

// ─── INIT THREE.JS ───────────────────────────────────────────
function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111122);
  scene.fog = new THREE.Fog(0x111122, 50, 200);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffd580, 1.2);
  sun.position.set(50, 100, 50);
  sun.castShadow = true;
  scene.add(sun);

  buildTrack();
  buildEnvironment();
  window.addEventListener('resize', onResize);
}

// ─── TRACK ───────────────────────────────────────────────────
function buildTrack() {
  // Flat ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshLambertMaterial({ color: 0x228822 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Oval track surface
  const trackShape = new THREE.Shape();
  trackShape.moveTo(-60, -30);
  trackShape.lineTo(60, -30);
  trackShape.absarc(60, 0, 30, -Math.PI/2, Math.PI/2, false);
  trackShape.lineTo(-60, 30);
  trackShape.absarc(-60, 0, 30, Math.PI/2, -Math.PI/2, false);

  const holePath = new THREE.Path();
  holePath.moveTo(-60, -15);
  holePath.lineTo(60, -15);
  holePath.absarc(60, 0, 15, -Math.PI/2, Math.PI/2, false);
  holePath.lineTo(-60, 15);
  holePath.absarc(-60, 0, 15, Math.PI/2, -Math.PI/2, false);
  trackShape.holes.push(holePath);

  const trackGeo = new THREE.ShapeGeometry(trackShape);
  const trackMat = new THREE.MeshLambertMaterial({ color: 0x333333, side: THREE.DoubleSide });
  const trackMesh = new THREE.Mesh(trackGeo, trackMat);
  trackMesh.rotation.x = -Math.PI / 2;
  trackMesh.position.y = 0.05;
  scene.add(trackMesh);

  // Dashed center line
  for (let i = 0; i < 20; i++) {
    const dash = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    const angle = (i / 20) * Math.PI * 2;
    dash.position.set(Math.cos(angle) * 70, 0.06, Math.sin(angle) * 22.5);
    dash.rotation.x = -Math.PI / 2;
    dash.rotation.z = angle + Math.PI / 2;
    scene.add(dash);
  }
}

function buildEnvironment() {
  // Trees around track
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 120 + Math.random() * 50;
    addTree(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  // Grandstands
  addGrandstand(0, -55);
  addGrandstand(0, 55);
}

function addTree(x, z) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 3),
    new THREE.MeshLambertMaterial({ color: 0x8B4513 })
  );
  trunk.position.set(x, 1.5, z);
  scene.add(trunk);

  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(3, 6, 8),
    new THREE.MeshLambertMaterial({ color: 0x228833 })
  );
  leaves.position.set(x, 6, z);
  scene.add(leaves);
}

function addGrandstand(x, z) {
  const stand = new THREE.Mesh(
    new THREE.BoxGeometry(40, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x555577 })
  );
  stand.position.set(x, 4, z);
  scene.add(stand);
}

// ─── CARS ────────────────────────────────────────────────────
function createCar(color) {
  const group = new THREE.Group();

  // Body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.7, 4),
    new THREE.MeshLambertMaterial({ color })
  );
  body.position.y = 0.4;
  group.add(body);

  // Roof
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.5, 2),
    new THREE.MeshLambertMaterial({ color })
  );
  roof.position.set(0, 1, -0.2);
  group.add(roof);

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheelPositions = [[-1.1, 0, 1.3], [1.1, 0, 1.3], [-1.1, 0, -1.3], [1.1, 0, -1.3]];
  wheelPositions.forEach(([wx, wy, wz]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, wy, wz);
    group.add(wheel);
  });

  // Headlights
  const lightGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xffffaa, emissive: 0xffffaa });
  [-0.6, 0.6].forEach(lx => {
    const light = new THREE.Mesh(lightGeo, lightMat);
    light.position.set(lx, 0.5, 2);
    group.add(light);
  });

  return group;
}

// ─── WAYPOINTS (oval) ────────────────────────────────────────
function getWaypoints() {
  const pts = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * 70, 0, Math.sin(a) * 22.5));
  }
  return pts;
}

let waypoints, botWpIdx = 0;

// ─── GAME START ───────────────────────────────────────────────
function startGame(multiplayer, host) {
  document.getElementById('menu').style.display = 'none';
  document.getElementById('gameCanvas').style.display = 'block';
  document.getElementById('hud').style.display = 'flex';
  gameRunning = true;
  isMultiplayer = multiplayer;
  isHost = host;

  initThree();
  waypoints = getWaypoints();

  // Player car
  playerCar = createCar(0xff4400);
  playerCar.position.set(70, 0, 0);
  scene.add(playerCar);

  // Bot car (shown in solo or if host in multiplayer)
  if (!multiplayer) {
    botCar = createCar(0x0044ff);
    botCar.position.set(70, 0, 5);
    scene.add(botCar);
  }

  setupControls();
  animate();
}

function startSolo() { startGame(false, false); }

// ─── PEER.JS MULTIPLAYER ──────────────────────────────────────
function hostGame() {
  peer = new Peer();
  peer.on('open', id => {
    document.getElementById('roomInfo').textContent = `🔑 Room ID: ${id}  (Share this!)`;
    peer.on('connection', c => {
      conn = c;
      conn.on('data', d => onRemoteData(d));
    });
  });
  startGame(true, true);
}

function joinGame() {
  const hostId = document.getElementById('joinId').value.trim();
  if (!hostId) return alert('Enter a Room ID!');
  peer = new Peer();
  peer.on('open', () => {
    conn = peer.connect(hostId);
    conn.on('open', () => conn.on('data', d => onRemoteData(d)));
  });
  startGame(true, false);
}

let remoteCar;
function onRemoteData(data) {
  if (!remoteCar) {
    remoteCar = createCar(0x00ff88);
    scene.add(remoteCar);
  }
  remoteCar.position.set(data.x, data.y, data.z);
  remoteCar.rotation.y = data.ry;
}

function sendPlayerState() {
  if (conn && conn.open) {
    conn.send({
      x: playerCar.position.x,
      y: playerCar.position.y,
      z: playerCar.position.z,
      ry: playerCar.rotation.y
    });
  }
}

// ─── CONTROLS ────────────────────────────────────────────────
function setupControls() {
  window.addEventListener('keydown', e => keys[e.key] = true);
  window.addEventListener('keyup', e => keys[e.key] = false);

  // Mobile buttons
  const map = {btnUp:'ArrowUp', btnDown:'ArrowDown', btnLeft:'ArrowLeft', btnRight:'ArrowRight'};
  Object.entries(map).forEach(([id, key]) => {
    const btn = document.getElementById(id);
    btn.addEventListener('touchstart', e => { e.preventDefault(); keys[key] = true; }, {passive:false});
    btn.addEventListener('touchend', e => { e.preventDefault(); keys[key] = false; }, {passive:false});
    btn.addEventListener('mousedown', () => keys[key] = true);
    btn.addEventListener('mouseup', () => keys[key] = false);
  });

  // Check if mobile
  if (/Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768) {
    document.getElementById('mobileControls').style.display = 'flex';
  }
}

// ─── PHYSICS ─────────────────────────────────────────────────
const MAX_SPEED = 0.6, ACCEL = 0.02, BRAKE = 0.03, FRICTION = 0.01, TURN = 0.03;

function updatePlayer() {
  if (keys['ArrowUp'] || keys['w']) playerSpeed = Math.min(playerSpeed + ACCEL, MAX_SPEED);
  else if (keys['ArrowDown'] || keys['s']) playerSpeed = Math.max(playerSpeed - BRAKE, -MAX_SPEED/2);
  else playerSpeed *= (1 - FRICTION);

  if (Math.abs(playerSpeed) > 0.01) {
    const dir = playerSpeed > 0 ? 1 : -1;
    if (keys['ArrowLeft'] || keys['a']) playerCar.rotation.y += TURN * dir;
    if (keys['ArrowRight'] || keys['d']) playerCar.rotation.y -= TURN * dir;
  }

  playerCar.translateZ(playerSpeed);
  playerCar.position.y = 0;

  document.getElementById('speed').textContent = `Speed: ${Math.abs(Math.round(playerSpeed * 100))} km/h`;
}

// ─── BOT AI ──────────────────────────────────────────────────
function updateBot() {
  if (!botCar) return;

  const target = waypoints[botWpIdx % waypoints.length];
  const dir = new THREE.Vector3().subVectors(target, botCar.position);
  const dist = dir.length();

  if (dist < 8) botWpIdx++;

  const angle = Math.atan2(dir.x, dir.z);
  const angleDiff = angle - botCar.rotation.y;
  botCar.rotation.y += Math.sign(Math.sin(angleDiff)) * 0.025;

  botSpeed = Math.min(botSpeed + 0.015, MAX_SPEED * 0.85);
  botCar.translateZ(botSpeed);
  botCar.position.y = 0;
}

// ─── CAMERA ──────────────────────────────────────────────────
function updateCamera() {
  const offset = new THREE.Vector3(0, 4, -10);
  offset.applyEuler(playerCar.rotation);
  camera.position.copy(playerCar.position).add(offset);
  camera.lookAt(playerCar.position);
}

// ─── ANIMATE ─────────────────────────────────────────────────
function animate() {
  if (!gameRunning) return;
  requestAnimationFrame(animate);
  updatePlayer();
  updateBot();
  updateCamera();
  sendPlayerState();
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
