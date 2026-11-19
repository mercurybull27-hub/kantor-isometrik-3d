/* =========================================================
   Kantor Isometrik 3D — Three.js
   3 ruangan · 6 agen di meja · jam tugas · laporan · mendesak
   Semua data bersifat contoh (tanpa nominal uang).
   ========================================================= */

import * as THREE from './vendor/three.module.min.js';

window.__kantorStarted = true;

/* ------------------------- util ------------------------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const fmtTime = (s) => {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

const FLOOR_Y = 0.14;
const DESK_Z = -0.45;
const AGENT_Z = -1.05;
const CLOCK_Y = 1.9;

const COL = {
  typing: 0x1aa89a,
  report: 0xdfa02c,
  urgent: 0xe0493a,
  ink: 0x243044,
  muted: 0x64748b,
  wall: 0xf7f8fb,
  slab: 0xf1f5fa,
  wood: 0xe6cfae,
  woodDark: 0xcbae8a,
  metal: 0xb7c1d0,
  chair: 0x4a5668,
};

/* ------------------------- renderer ------------------------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());

/* ------------------------- camera ------------------------- */
const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 300);
const cam = {
  az: THREE.MathUtils.degToRad(34),
  el: THREE.MathUtils.degToRad(31),
  baseAz: THREE.MathUtils.degToRad(34),
  baseEl: THREE.MathUtils.degToRad(31),
  zoom: 1,
  drift: true,
  target: new THREE.Vector3(0.2, 1.12, -0.15),
};
const CAM_DIST = 62;
let viewAspect = window.innerWidth / window.innerHeight;

function applyCamera(t) {
  const az = cam.baseAz + (cam.drift ? Math.sin(t * 0.15) * 0.05 : 0);
  const el = cam.baseEl + (cam.drift ? Math.sin(t * 0.11 + 1.3) * 0.014 : 0);
  cam.az = az; cam.el = el;
  camera.position
    .set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
    .multiplyScalar(CAM_DIST)
    .add(cam.target);
  camera.lookAt(cam.target);
  const h = Math.max(12.2, 21.7 / viewAspect) / cam.zoom;
  const w = h * viewAspect;
  camera.left = -w / 2;
  camera.right = w / 2;
  camera.top = h / 2;
  camera.bottom = -h / 2;
  camera.updateProjectionMatrix();
}

function resize() {
  viewAspect = window.innerWidth / window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  applyCamera(performance.now() / 1000);
  if (typeof agents !== 'undefined') {
    for (const a of agents) { a._bw = 0; a._bh = 0; }
  }
}
window.addEventListener('resize', resize);

/* ------------------------- cahaya ------------------------- */
scene.add(new THREE.HemisphereLight(0xffffff, 0xc4d0e2, 1.25));
scene.add(new THREE.AmbientLight(0xffffff, 0.2));

const key = new THREE.DirectionalLight(0xfff6e8, 2.2);
key.position.set(11, 17, 13);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -16;
key.shadow.camera.right = 16;
key.shadow.camera.top = 14;
key.shadow.camera.bottom = -14;
key.shadow.camera.near = 1;
key.shadow.camera.far = 60;
key.shadow.bias = -0.0006;
key.shadow.normalBias = 0.02;
scene.add(key);

const fill = new THREE.DirectionalLight(0xd6e6ff, 0.5);
fill.position.set(-13, 9, -7);
scene.add(fill);

/* ------------------------- helper tekstur ------------------------- */
function makeTex(w, h, draw) {
  const scale = 2;
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = ANISO;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function makeSprite(texture, worldHeight, opts = {}) {
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: opts.depthTest !== false,
    toneMapped: false,
    opacity: opts.opacity ?? 1,
  });
  const sp = new THREE.Sprite(mat);
  const w = worldHeight * (texture.image.width / texture.image.height);
  sp.scale.set(w, worldHeight, 1);
  sp.renderOrder = opts.renderOrder ?? 20;
  return sp;
}

const softShadowTex = makeTex(256, 256, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 8, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(28,42,64,.62)');
  g.addColorStop(0.5, 'rgba(28,42,64,.3)');
  g.addColorStop(1, 'rgba(28,42,64,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

/* ------------------------- helper geometri ------------------------- */
function box(parent, mat, w, h, d, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (o.ry) m.rotation.y = o.ry;
  if (o.rx) m.rotation.x = o.rx;
  if (o.rz) m.rotation.z = o.rz;
  m.castShadow = o.cast !== false;
  m.receiveShadow = o.receive !== false;
  parent.add(m);
  return m;
}

function cyl(parent, mat, rt, rb, h, x = 0, y = 0, z = 0, seg = 20, o = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx;
  if (o.rz) m.rotation.z = o.rz;
  m.castShadow = o.cast !== false;
  m.receiveShadow = o.receive !== false;
  parent.add(m);
  return m;
}

function sphere(parent, mat, r, x = 0, y = 0, z = 0, seg = 16, o = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4)), mat);
  m.position.set(x, y, z);
  if (o.sx || o.sy || o.sz) m.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  m.castShadow = o.cast !== false;
  m.receiveShadow = o.receive !== false;
  parent.add(m);
  return m;
}

/* ------------------------- material umum ------------------------- */
const M = {
  wall: new THREE.MeshStandardMaterial({ color: COL.wall, roughness: 0.94, metalness: 0 }),
  wallCap: new THREE.MeshStandardMaterial({ color: 0xe9edf4, roughness: 0.9 }),
  slab: new THREE.MeshStandardMaterial({ color: COL.slab, roughness: 0.9 }),
  slabEdge: new THREE.MeshStandardMaterial({ color: 0xdde6f1, roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: COL.wood, roughness: 0.72 }),
  woodDark: new THREE.MeshStandardMaterial({ color: COL.woodDark, roughness: 0.75 }),
  metal: new THREE.MeshStandardMaterial({ color: COL.metal, roughness: 0.42, metalness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x39414f, roughness: 0.6 }),
  charcoal: new THREE.MeshStandardMaterial({ color: 0x2b3240, roughness: 0.55 }),
  paper: new THREE.MeshStandardMaterial({ color: 0xfbfcfe, roughness: 0.9 }),
  chair: new THREE.MeshStandardMaterial({ color: COL.chair, roughness: 0.7 }),
  chairSeat: new THREE.MeshStandardMaterial({ color: 0x5b6a80, roughness: 0.8 }),
  pot: new THREE.MeshStandardMaterial({ color: 0xd8c4b4, roughness: 0.85 }),
  soil: new THREE.MeshStandardMaterial({ color: 0x6b5a4a, roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x4f9b6a, roughness: 0.75 }),
  leaf2: new THREE.MeshStandardMaterial({ color: 0x3f8459, roughness: 0.78 }),
  mug: new THREE.MeshStandardMaterial({ color: 0xf3f5f9, roughness: 0.55 }),
};

/* =========================================================
   Panggung: alas, lantai, dinding
   ========================================================= */
function buildStage() {
  const stage = new THREE.Group();
  scene.add(stage);

  // alas diorama
  box(stage, M.slab, 21.0, 0.5, 6.7, 0, -0.25, -0.1, { cast: true });
  box(stage, M.slabEdge, 21.24, 0.09, 6.94, 0, -0.48, -0.1, { cast: false });

  // bayangan kontak lembut di bawah alas
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 17),
    new THREE.MeshBasicMaterial({ map: softShadowTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.55 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -0.53, -0.1);
  stage.add(shadow);

  // dinding belakang penuh
  box(stage, M.wall, 21.0, 3.0, 0.3, 0, 1.5, -3.05);
  box(stage, M.wallCap, 21.16, 0.075, 0.42, 0, 3.03, -3.05, { cast: false });

  // dinding kiri (sisi jauh dari kamera) penuh
  box(stage, M.wall, 0.3, 3.0, 6.6, -10.35, 1.5, -0.1);
  box(stage, M.wallCap, 0.42, 0.075, 6.72, -10.35, 3.03, -0.1, { cast: false });

  // sekat rendah supaya semua meja terlihat (potongan rumah boneka)
  for (const x of [-3.45, 3.45, 10.35]) {
    box(stage, M.wall, 0.3, 0.95, 6.6, x, 0.475, -0.1);
    box(stage, M.wallCap, 0.42, 0.065, 6.72, x, 0.985, -0.1, { cast: false });
  }
}

/* ------------------------- dekorasi ruangan ------------------------- */
function makePlant(x, z, s = 1) {
  const g = new THREE.Group();
  g.position.set(x, FLOOR_Y, z);
  g.scale.setScalar(s);
  scene.add(g);

  cyl(g, M.pot, 0.17, 0.13, 0.3, 0, 0.15, 0, 18);
  cyl(g, M.soil, 0.155, 0.155, 0.02, 0, 0.3, 0, 18);
  cyl(g, M.leaf2, 0.02, 0.02, 0.35, 0, 0.47, 0, 6);

  const leaves = [
    [0.13, 0.62, 0.02, 1.0, 0.55, 0.75, M.leaf],
    [-0.12, 0.58, 0.05, 0.95, 0.5, 0.7, M.leaf2],
    [0.02, 0.68, -0.1, 0.8, 0.6, 0.85, M.leaf],
    [0.05, 0.55, 0.13, 0.9, 0.45, 0.7, M.leaf2],
    [-0.04, 0.75, 0.02, 0.7, 0.65, 0.8, M.leaf],
  ];
  for (const [lx, ly, lz, sx, sy, sz, mat] of leaves) {
    sphere(g, mat, 0.15, lx, ly, lz, 12, { sx, sy, sz });
  }
}

function makeWhiteboard(x) {
  const tex = makeTex(560, 300, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e3eaf4';
    ctx.lineWidth = 2;
    for (let y = 46; y < h; y += 34) {
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#233043';
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText('PAPAN TUGAS', 26, 32);
    ctx.fillStyle = '#1aa89a';
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText('Riset & Data', 190, 31);

    const rows = [
      ['Rekap data kuartal', 0.72],
      ['Input formulir baru', 0.46],
      ['Periksa catatan rapat', 0.61],
    ];
    rows.forEach(([label, p], i) => {
      const y = 78 + i * 46;
      ctx.fillStyle = '#41608a';
      ctx.font = `500 16px ${FONT}`;
      ctx.fillText(label, 30, y);
      ctx.fillStyle = '#e8eef7';
      rr(ctx, 260, y - 14, 190, 9, 5);
      ctx.fill();
      ctx.fillStyle = i === 1 ? '#e0a02c' : '#1aa89a';
      rr(ctx, 260, y - 14, Math.max(16, 190 * p), 9, 5);
      ctx.fill();
      ctx.fillStyle = i === 1 ? '#e0a02c' : '#1aa89a';
      ctx.beginPath();
      ctx.arc(496, y - 9, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    // catatan tempel
    const notes = [
      [30, 222, '#fdf0cf', '#b17b12'],
      [96, 226, '#dff3ee', '#157d72'],
      [162, 222, '#fbe2dd', '#b73b2e'],
    ];
    for (const [nx, ny, bg, fg] of notes) {
      ctx.save();
      ctx.translate(nx, ny);
      ctx.rotate((nx % 3 - 1) * 0.03);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 56, 48);
      ctx.fillStyle = fg;
      ctx.fillRect(8, 12, 38, 3);
      ctx.fillRect(8, 21, 30, 3);
      ctx.fillRect(8, 30, 34, 3);
      ctx.restore();
    }
  });

  const g = new THREE.Group();
  g.position.set(x, 1.56, -2.885);
  scene.add(g);
  box(g, new THREE.MeshStandardMaterial({ color: 0xe4eaf4, roughness: 0.8 }), 1.98, 1.1, 0.04, 0, 0, -0.03);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.86, 1.0),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })
  );
  board.position.z = 0.002;
  g.add(board);
}

function makeShelf(x) {
  const g = new THREE.Group();
  g.position.set(x, 0, -2.885);
  scene.add(g);
  const folderMats = [
    new THREE.MeshStandardMaterial({ color: 0x5b74c9, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xe0a02c, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x1aa89a, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xcf7d6b, roughness: 0.8 }),
  ];
  for (let s = 0; s < 2; s++) {
    const y = 1.5 + s * 0.5;
    box(g, M.woodDark, 1.7, 0.055, 0.22, 0, y, 0.11);
    for (let i = 0; i < 4; i++) {
      box(g, folderMats[i], 0.13, 0.32, 0.17, -0.6 + i * 0.19, y + 0.19, 0.11, { ry: (i % 2 ? 1 : -1) * 0.03 });
    }
    // tanaman kecil
    cyl(g, M.pot, 0.06, 0.05, 0.09, 0.62, y + 0.07, 0.11, 12);
    sphere(g, M.leaf, 0.075, 0.62, y + 0.17, 0.11, 10, { sy: 1.1 });
  }
}

function makeWallClock(x) {
  const g = new THREE.Group();
  g.position.set(x, 1.92, -2.86);
  scene.add(g);

  const faceTex = makeTex(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#dbe4ef';
    ctx.lineWidth = 6;
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r0 = i % 3 === 0 ? 78 : 88;
      ctx.strokeStyle = i % 3 === 0 ? '#4a5b72' : '#b6c3d4';
      ctx.lineWidth = i % 3 === 0 ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.sin(a) * r0, h / 2 - Math.cos(a) * r0);
      ctx.lineTo(w / 2 + Math.sin(a) * 98, h / 2 - Math.cos(a) * 98);
      ctx.stroke();
    }
  });

  cyl(g, new THREE.MeshStandardMaterial({ color: 0xe8eef7, roughness: 0.7 }), 0.34, 0.34, 0.06, 0, 0, 0, 40, { rx: Math.PI / 2 });
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.315, 40),
    new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.8 })
  );
  face.position.z = 0.032;
  g.add(face);

  const hour = box(g, M.charcoal, 0.024, 0.17, 0.012, 0, 0.075, 0.04);
  hour.geometry.translate(0, 0.085, 0);
  hour.position.y = 0;
  const min = box(g, M.charcoal, 0.016, 0.25, 0.012, 0, 0.11, 0.05);
  min.geometry.translate(0, 0.125, 0);
  min.position.y = 0;
  const sec = box(g, new THREE.MeshStandardMaterial({ color: 0xe0493a, roughness: 0.6 }), 0.008, 0.27, 0.01, 0, 0.12, 0.058);
  sec.geometry.translate(0, 0.135, 0);
  sec.position.y = 0;

  tickClocks.push({ hour, min, sec });
}

function makePrinter(x, z) {
  const g = new THREE.Group();
  g.position.set(x, FLOOR_Y, z);
  scene.add(g);
  const body = new THREE.MeshStandardMaterial({ color: 0xeef2f8, roughness: 0.65 });
  box(g, body, 0.62, 0.3, 0.44, 0, 0.4, 0);
  box(g, M.charcoal, 0.5, 0.05, 0.3, 0, 0.57, 0.02);
  box(g, M.paper, 0.34, 0.02, 0.22, 0, 0.6, 0.07, { rx: -0.08 });
  box(g, M.charcoal, 0.44, 0.14, 0.02, 0, 0.32, 0.225);
  const led = new THREE.Mesh(
    new THREE.CircleGeometry(0.012, 12),
    new THREE.MeshBasicMaterial({ color: 0x6fd7c8, toneMapped: false })
  );
  led.position.set(0.24, 0.44, 0.223);
  g.add(led);
  // meja kecil
  box(g, M.wood, 0.9, 0.05, 0.6, 0, 0.26, 0);
  for (const sx of [-0.36, 0.36]) for (const sz of [-0.22, 0.22]) {
    box(g, M.metal, 0.04, 0.26, 0.04, sx, 0.13, sz);
  }
}

function makeCoffee(x, z) {
  const g = new THREE.Group();
  g.position.set(x, FLOOR_Y, z);
  scene.add(g);
  box(g, M.wood, 0.72, 0.75, 0.46, 0, 0.375, 0);
  box(g, M.woodDark, 0.78, 0.04, 0.5, 0, 0.77, 0);
  box(g, M.charcoal, 0.34, 0.36, 0.26, 0, 0.98, 0);
  box(g, M.metal, 0.3, 0.05, 0.2, 0, 0.83, 0.04);
  cyl(g, M.mug, 0.055, 0.045, 0.09, 0.02, 0.865, 0.08, 14);
  const btn = new THREE.Mesh(
    new THREE.CircleGeometry(0.018, 12),
    new THREE.MeshBasicMaterial({ color: 0xe0a02c, toneMapped: false })
  );
  btn.position.set(0.09, 1.02, 0.131);
  g.add(btn);
}

const tickClocks = [];

/* =========================================================
   Ruangan
   ========================================================= */
const ROOMS = [
  { code: 'RUANG 01', name: 'Riset & Data', x: -6.9, accent: 0x1f8a7e, floor: 0xe2f1ec, rug: 0xd3e8e0 },
  { code: 'RUANG 02', name: 'Operasi Harian', x: 0, accent: 0x4c66b8, floor: 0xe4ebfa, rug: 0xd8e2f4 },
  { code: 'RUANG 03', name: 'Dukungan Pelanggan', x: 6.9, accent: 0x9a5aae, floor: 0xefe4f7, rug: 0xe4d5ef },
];

function makeRoomSign(room) {
  const tex = makeTex(512, 140, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    rr(ctx, 2, 2, w - 4, h - 4, 16);
    ctx.fill();
    ctx.strokeStyle = '#e6edf7';
    ctx.lineWidth = 3;
    rr(ctx, 2, 2, w - 4, h - 4, 16);
    ctx.stroke();

    ctx.fillStyle = hex(room.accent);
    rr(ctx, 14, 18, 8, h - 36, 4);
    ctx.fill();

    ctx.fillStyle = hex(room.accent);
    ctx.font = `750 46px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(room.code.replace('RUANG ', ''), 36, h / 2 + 2);

    let size = 44;
    ctx.font = `750 ${size}px ${FONT}`;
    const maxW = w - 150;
    while (ctx.measureText(room.name).width > maxW && size > 22) {
      size -= 2;
      ctx.font = `750 ${size}px ${FONT}`;
    }
    ctx.fillStyle = '#22303f';
    ctx.fillText(room.name, 118, h / 2 + 2);
  });

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.7, 0.74),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })
  );
  sign.position.set(room.x, 2.52, -2.883);
  scene.add(sign);
}

function buildRooms() {
  for (const room of ROOMS) {
    // lantai
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(6.6, 0.14, 5.8),
      new THREE.MeshStandardMaterial({ color: room.floor, roughness: 0.92 })
    );
    floor.position.set(room.x, 0.07, 0);
    floor.receiveShadow = true;
    scene.add(floor);

    // permadani
    const rug = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 0.025, 3.55),
      new THREE.MeshStandardMaterial({ color: room.rug, roughness: 0.98 })
    );
    rug.position.set(room.x, 0.153, -0.42);
    rug.receiveShadow = true;
    scene.add(rug);

    // garis aksen lantai di tepi depan
    box(scene, new THREE.MeshStandardMaterial({ color: room.accent, roughness: 0.7 }), 6.6, 0.035, 0.06, room.x, 0.155, 2.87, { cast: false });

    // skirting dinding belakang
    box(scene, new THREE.MeshStandardMaterial({ color: room.accent, roughness: 0.7 }), 6.6, 0.16, 0.05, room.x, 0.22, -2.876, { cast: false });

    // papan nama ruangan di dinding belakang
    makeRoomSign(room);

    // dekorasi dinding & lantai
    if (room.code === 'RUANG 01') {
      makeWhiteboard(room.x);
      makePlant(room.x - 2.8, 2.35, 1.05);
    } else if (room.code === 'RUANG 02') {
      makeShelf(room.x - 1.95);
      makePrinter(room.x + 2.62, 2.32);
      makePlant(room.x - 2.8, 2.35, 0.9);
    } else {
      makeWallClock(room.x + 2.25);
      makeCoffee(room.x + 2.6, 2.25);
      makePlant(room.x - 2.8, 2.35, 1.0);
    }
  }
}

/* =========================================================
   Bahan visual status
   ========================================================= */
const bangTex = makeTex(256, 256, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(224,73,58,.14)';
  ctx.beginPath();
  ctx.arc(128, 128, 122, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.shadowColor = 'rgba(180,40,28,.35)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#e0493a';
  ctx.beginPath();
  ctx.arc(128, 124, 92, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,.45)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(128, 124, 78, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 118px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', 128, 132);
});

const glowTex = makeTex(256, 256, (ctx, w, h) => {
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,86,66,.85)');
  g.addColorStop(0.45, 'rgba(224,73,58,.32)');
  g.addColorStop(1, 'rgba(224,73,58,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

const keyTex = makeTex(160, 64, (ctx, w, h) => {
  ctx.fillStyle = '#2c3444';
  ctx.fillRect(0, 0, w, h);
  const cols = 10, rows = 4;
  const gx = 4, gy = 4;
  const kw = (w - gx * (cols + 1)) / cols;
  const kh = (h - gy * (rows + 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = r === 3 ? '#3a4457' : '#4a5468';
      ctx.beginPath();
      const x = gx + c * (kw + gx);
      const y = gy + r * (kh + gy);
      const ww = r === 3 && c > 1 && c < 8 ? kw * 2 + gx : kw;
      if (r === 3 && c > 1 && c < 8) continue;
      ctx.roundRect ? ctx.roundRect(x, y, ww, kh, 2) : ctx.rect(x, y, ww, kh);
      ctx.fill();
    }
  }
});

/* =========================================================
   Jam tugas
   ========================================================= */
const clockFaceTex = makeTex(256, 256, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(128, 128, 124, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1aa89a';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#9fb0c6';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r0 = i % 3 === 0 ? 88 : 100;
    ctx.lineWidth = i % 3 === 0 ? 6 : 3;
    ctx.beginPath();
    ctx.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0);
    ctx.lineTo(128 + Math.sin(a) * 110, 128 - Math.cos(a) * 110);
    ctx.stroke();
  }
  ctx.fillStyle = '#1aa89a';
  ctx.beginPath();
  ctx.arc(128, 128, 8, 0, Math.PI * 2);
  ctx.fill();
});

function makeTaskClock() {
  const g = new THREE.Group();
  const faceMat = new THREE.MeshStandardMaterial({ map: clockFaceTex, roughness: 0.65, transparent: true });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0xeef3fa, roughness: 0.6 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 36), [sideMat, faceMat, sideMat]);
  disc.rotation.x = Math.PI / 2;
  disc.castShadow = true;
  g.add(disc);

  const mkHand = (wdt, len, color, z, thick = 0.012) => {
    const pivot = new THREE.Object3D();
    g.add(pivot);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(wdt, len, thick), new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
    mesh.position.set(0, len / 2 - 0.01, z);
    mesh.castShadow = false;
    pivot.add(mesh);
    return pivot;
  };

  const hour = mkHand(0.024, 0.09, 0x2f3a4c, 0.031);
  const min = mkHand(0.016, 0.14, 0x2f3a4c, 0.036);
  const sec = mkHand(0.008, 0.155, 0xe0493a, 0.041, 0.008);
  return { group: g, hour, min, sec };
}

/* =========================================================
   Agen + meja
   ========================================================= */
const AGENT_DATA = [
  { name: 'Rani', shirt: 0x2c7f77, skin: 0xf0c9a8, hair: 0x2b2522, task: 'Rekap data kuartal' },
  { name: 'Bima', shirt: 0x46608f, skin: 0xe0b48c, hair: 0x3a2f28, task: 'Input formulir baru' },
  { name: 'Sinta', shirt: 0x8a5a4b, skin: 0xf5d3b3, hair: 0x5a3a2a, task: 'Jadwal pengiriman' },
  { name: 'Adi', shirt: 0x4c6b74, skin: 0xc98f68, hair: 0x1f1c1a, task: 'Periksa berkas' },
  { name: 'Nadia', shirt: 0x6d4f8f, skin: 0xe8bd9a, hair: 0x4a3b32, task: 'Balas tiket masuk' },
  { name: 'Yoga', shirt: 0x3f7a58, skin: 0xa9714a, hair: 0x241f1c, task: 'Tindak lanjut panggilan' },
];

const STATE_LABEL = { typing: 'Mengetik', report: 'Menunggu keputusan', urgent: 'Mendesak' };
const STATE_DOT = { typing: 'typing', report: 'report', urgent: 'urgent' };
const bubbleLayer = document.getElementById('bubbles');

class Agent {
  constructor(cfg, index) {
    this.cfg = cfg;
    this.index = index;
    this.state = 'typing';
    this.stateT = 0;
    this.taskSeconds = 0;
    this.nextAt = 6 + Math.random() * 8;
    this.hovered = false;
    this.clockFade = 1;
    this.bubbleFade = 0;
    this.bangFade = 0;
    this.glow = 0;
    this.hoverK = 0;
    this.thinking = false;
    this.nextThinkAt = 0;
    this.brainNote = '';
    this.brainSource = '';
    this._anchor = new THREE.Vector3();

    this.build();

    this.bubbleEl = document.createElement('div');
    this.bubbleEl.className = 'bubble';
    this.bubbleEl.innerHTML =
      `<div class="bn">${cfg.name} · ${cfg.roomCode}</div><div class="bt">Menunggu keputusan</div>`;
    bubbleLayer.appendChild(this.bubbleEl);
  }

  /* ------------------------- bangun aset ------------------------- */
  build() {
    const { x } = this.cfg;

    const skin = new THREE.MeshStandardMaterial({ color: this.cfg.skin, roughness: 0.68 });
    const shirt = new THREE.MeshStandardMaterial({ color: this.cfg.shirt, roughness: 0.78 });
    const hair = new THREE.MeshStandardMaterial({ color: this.cfg.hair, roughness: 0.82 });
    this.deskMat = M.wood.clone();
    this.stripMat = new THREE.MeshStandardMaterial({ color: COL.typing, emissive: COL.typing, emissiveIntensity: 0.5, roughness: 0.45 });
    this.ledMat = new THREE.MeshStandardMaterial({ color: 0x22303f, emissive: COL.typing, emissiveIntensity: 1.1, roughness: 0.4 });
    this.screenMat = new THREE.MeshStandardMaterial({ color: 0x223047, emissive: COL.typing, emissiveIntensity: 0.5, roughness: 0.35 });
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0xf2e8d6, emissive: COL.typing, emissiveIntensity: 0.35, roughness: 0.6 });

    /* ---------- meja ---------- */
    const desk = new THREE.Group();
    desk.position.set(x, 0, DESK_Z);
    scene.add(desk);
    this.desk = desk;

    box(desk, this.deskMat, 1.8, 0.07, 0.9, 0, 0.72, 0);
    box(desk, M.woodDark, 1.66, 0.05, 0.78, 0, 0.675, 0);
    for (const sx of [-0.79, 0.79]) for (const sz of [-0.36, 0.36]) {
      box(desk, M.metal, 0.05, 0.7, 0.05, sx, 0.35, sz);
    }
    // laci
    box(desk, this.deskMat, 0.58, 0.42, 0.72, -0.52, 0.4, 0.03);
    box(desk, M.woodDark, 0.5, 0.03, 0.03, -0.52, 0.5, 0.4);
    // strip status di tepi meja (menghadap kamera)
    this.strip = box(desk, this.stripMat, 1.8, 0.032, 0.032, 0, 0.695, 0.454, { cast: false });

    /* ---------- monitor ---------- */
    const mon = new THREE.Group();
    mon.position.set(-0.42, 0, 0.1);
    desk.add(mon);
    box(mon, M.charcoal, 0.22, 0.02, 0.15, 0, 0.745, 0);
    box(mon, M.charcoal, 0.05, 0.17, 0.05, 0, 0.83, -0.01);
    const panel = new THREE.Group();
    panel.position.set(0, 1.01, 0);
    panel.rotation.y = Math.PI;
    mon.add(panel);
    box(panel, M.charcoal, 0.6, 0.36, 0.032, 0, 0, 0);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.3), this.screenMat);
    screen.position.z = 0.018;
    panel.add(screen);
    // LED status di punggung monitor (menghadap kamera)
    box(panel, this.ledMat, 0.13, 0.032, 0.016, 0, 0.146, -0.022, { cast: false });
    box(panel, this.ledMat, 0.44, 0.012, 0.012, 0, -0.158, -0.022, { cast: false });

    /* ---------- keyboard, mouse, properti ---------- */
    box(desk, M.charcoal, 0.54, 0.022, 0.18, 0, 0.762, -0.3);
    const keys = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.155),
      new THREE.MeshStandardMaterial({ map: keyTex, roughness: 0.7 })
    );
    keys.rotation.x = -Math.PI / 2;
    keys.position.set(0, 0.775, -0.3);
    desk.add(keys);
    box(desk, M.charcoal, 0.055, 0.02, 0.085, 0.4, 0.762, -0.3, { cast: false });

    cyl(desk, M.mug, 0.045, 0.04, 0.09, 0.5, 0.8, -0.28, 16);
    box(desk, M.paper, 0.18, 0.012, 0.24, -0.5, 0.762, -0.2, { ry: 0.28, cast: false });
    box(desk, M.paper, 0.18, 0.012, 0.24, -0.5, 0.775, -0.2, { ry: 0.16, cast: false });
    cyl(desk, new THREE.MeshStandardMaterial({ color: 0x8a94a6, roughness: 0.6 }), 0.032, 0.032, 0.1, 0.6, 0.81, 0.24, 12);

    // lampu meja
    const lamp = new THREE.Group();
    lamp.position.set(0.63, 0, 0.12);
    desk.add(lamp);
    cyl(lamp, M.charcoal, 0.075, 0.085, 0.018, 0, 0.764, 0, 18);
    cyl(lamp, M.charcoal, 0.014, 0.014, 0.28, 0, 0.9, 0, 8);
    box(lamp, M.charcoal, 0.02, 0.02, 0.16, 0, 1.03, 0.07);
    this.lampShade = cyl(lamp, this.lampMat, 0.06, 0.115, 0.1, 0, 1.0, 0.15, 20, { rx: 0.42 });

    // bayangan kontak meja
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 2.0),
    new THREE.MeshBasicMaterial({ map: softShadowTex, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(x, 0.172, -0.62);
  scene.add(contact);

  /* ---------- kursi ---------- */
    const chair = new THREE.Group();
    chair.position.set(x, 0, -1.2);
    scene.add(chair);
    cyl(chair, M.metal, 0.21, 0.23, 0.035, 0, 0.05, 0, 24);
    cyl(chair, M.metal, 0.032, 0.032, 0.32, 0, 0.21, 0, 12);
    box(chair, M.chairSeat, 0.46, 0.07, 0.44, 0, 0.43, 0);
    box(chair, M.chair, 0.46, 0.42, 0.06, 0, 0.65, -0.2, { rx: -0.09 });
    this.chair = chair;

    /* ---------- agen ---------- */
    const root = new THREE.Group();
    root.position.set(x, 0, AGENT_Z);
    scene.add(root);
    this.root = root;

    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.165, 0.25, 8, 16), shirt);
    this.torso.position.y = 0.79;
    this.torso.scale.set(1.05, 1, 0.82);
    this.torso.castShadow = true;
    root.add(this.torso);

    // kerah
    cyl(root, M.paper, 0.055, 0.07, 0.03, 0, 1.045, 0.02, 12);

    const headGroup = new THREE.Group();
    headGroup.position.y = 1.17;
    root.add(headGroup);
    this.headGroup = headGroup;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 24, 18), skin);
    head.scale.set(0.95, 1.02, 0.98);
    head.castShadow = true;
    headGroup.add(head);

    const hairMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.168, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.56),
      hair
    );
    hairMesh.position.y = 0.012;
    hairMesh.scale.set(0.98, 1, 1.02);
    hairMesh.castShadow = true;
    headGroup.add(hairMesh);

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x232b36, roughness: 0.4 });
    for (const ex of [-0.056, 0.056]) {
      sphere(headGroup, eyeMat, 0.018, ex, 0.014, 0.148, 10, { cast: false });
    }

    // lengan
    const makeArm = (side) => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.185, 0.99, 0.02);
      root.add(arm);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.26, 6, 12), shirt);
      sleeve.position.y = -0.18;
      sleeve.castShadow = true;
      arm.add(sleeve);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.054, 14, 12), skin);
      hand.position.y = -0.36;
      hand.castShadow = true;
      arm.add(hand);
      return arm;
    };
    this.armL = makeArm(-1);
    this.armR = makeArm(1);
    this.armL.rotation.x = 1.18;
    this.armR.rotation.x = 1.18;

    /* ---------- jam tugas ---------- */
    const clock = makeTaskClock();
    clock.group.position.set(x + 0.46, CLOCK_Y, 0.4);
    scene.add(clock.group);
    this.clock = clock.group;
    this.handHour = clock.hour;
    this.handMin = clock.min;
    this.handSec = clock.sec;

    /* ---------- gelembung & tanda seru ---------- */
    this.bangW = 0.6;
    this.bangH = 0.6;
    this.bang = makeSprite(bangTex, this.bangH);
    this.bang.material.opacity = 0;
    this.bang.position.set(x, 1.98, -1.0);
    this.bang.visible = false;
    scene.add(this.bang);

    /* ---------- papan nama meja ---------- */
    const plaqueTex = makeTex(300, 300, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#dfe7f2';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = hex(this.cfg.shirt);
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `750 150px ${FONT}`;
      ctx.fillText(this.cfg.name[0], w / 2, h / 2 + 6);
    });
    this.initial = makeSprite(plaqueTex, 0.15);
    this.initial.position.set(x, 0.596, 0.03);
    scene.add(this.initial);

    /* ---------- sorotan hover ---------- */
    this.hoverRing = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.44, 48),
      new THREE.MeshBasicMaterial({ color: this.cfg.shirt, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
    );
    this.hoverRing.rotation.x = -Math.PI / 2;
    this.hoverRing.position.set(x, 0.176, -1.12);
    scene.add(this.hoverRing);

    /* ---------- pendar lantai saat mendesak ---------- */
    this.glowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 2.4),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
    );
    this.glowPlane.rotation.x = -Math.PI / 2;
    this.glowPlane.position.set(x, 0.18, -0.66);
    this.glowPlane.visible = false;
    scene.add(this.glowPlane);

    /* ---------- kotak sentuh ---------- */
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(2.05, 2.7, 2.9), hitMat);
    this.hitbox.position.set(x, 1.1, -0.82);
    this.hitbox.userData.agent = this;
    scene.add(this.hitbox);
    hitboxes.push(this.hitbox);
  }

  /* ------------------------- status ------------------------- */
  setState(s) {
    if (this.state === s) return;
    const prev = this.state;
    this.state = s;
    this.stateT = 0;
    if (s === 'typing' && prev !== 'typing') this.taskSeconds = 0;
    if (s !== 'typing') this.nextAt = 999;
    else this.nextAt = 7 + Math.random() * 6;
  }

  cycle() {
    const order = ['typing', 'report', 'urgent'];
    const next = order[(order.indexOf(this.state) + 1) % order.length];
    this.setState(next);
    this.stateT = 0;
  }

  /* ------------------------- animasi ------------------------- */
  update(dt, t) {
    const s = this.state;
    this.stateT += dt;
    if (s === 'typing') this.taskSeconds += dt;

    this.clockFade = damp(this.clockFade, s === 'typing' ? 1 : 0, 9, dt);
    this.bubbleFade = damp(this.bubbleFade, s === 'report' ? 1 : 0, 22, dt);
    this.bangFade = damp(this.bangFade, s === 'urgent' ? 1 : 0, 8, dt);
    this.glow = damp(this.glow, s === 'urgent' ? 1 : 0, 5.5, dt);
    this.hoverK = damp(this.hoverK, this.hovered ? 1 : 0, 11, dt);

    const blink = 0.5 + 0.5 * Math.sin(t * 7.4);

    /* agen */
    const typingK = s === 'typing' ? 1 : 0;
    this.armBase = damp(this.armBase ?? 1.18, typingK ? 1.18 : 0.62, 7, dt);
    const wobble = Math.sin(t * 10.5 + this.index * 1.7) * 0.085 * typingK;
    this.armL.rotation.x = this.armBase + wobble;
    this.armR.rotation.x = this.armBase - wobble;

    this.headGroup.position.y = 1.17 + Math.sin(t * 2.1 + this.index) * 0.006 + typingK * Math.sin(t * 10.5) * 0.004;
    if (s === 'urgent') this.headGroup.rotation.z = Math.sin(t * 19) * 0.028;
    else if (s === 'report') this.headGroup.rotation.z = 0.055;
    else this.headGroup.rotation.z = Math.sin(t * 0.8 + this.index) * 0.012;

    this.torso.position.y = 0.79 + Math.sin(t * 1.9 + this.index) * 0.005;
    this.torso.rotation.y = s === 'report' ? -0.07 : 0;

    /* warna status */
    const col = s === 'typing' ? COL.typing : s === 'report' ? COL.report : COL.urgent;
    this.stripMat.color.setHex(col);
    this.stripMat.emissive.setHex(col);
    this.stripMat.emissiveIntensity = 0.35 + (s === 'urgent' ? 0.6 + 1.9 * blink : s === 'report' ? 0.55 : 0.15);

    this.ledMat.emissive.setHex(col);
    this.ledMat.emissiveIntensity = 0.6 + (s === 'urgent' ? 1.9 * blink : s === 'report' ? 0.5 : 0.25);

    this.screenMat.emissive.setHex(col);
    this.screenMat.emissiveIntensity = 0.25 + typingK * (0.18 + 0.12 * Math.sin(t * 3.1 + this.index));

    this.lampMat.emissive.setHex(col);
    this.lampMat.emissiveIntensity = 0.25 + (s === 'urgent' ? 1.2 + 1.6 * blink : s === 'report' ? 0.45 : 0.05);

    /* meja berkedip saat mendesak */
    this.deskMat.emissive.setHex(COL.urgent);
    this.deskMat.emissiveIntensity = this.glow * (0.1 + 0.62 * blink);

    /* pendar lantai */
    this.glowPlane.visible = this.glow > 0.015;
    this.glowPlane.material.opacity = this.glow * (0.28 + 0.4 * blink);

    /* sorotan hover */
    this.hoverRing.material.opacity = this.hoverK * (0.35 + 0.25 * Math.sin(t * 4));

    /* jam tugas */
    const cf = this.clockFade;
    this.clock.visible = cf > 0.02;
    if (this.clock.visible) {
      const pop = 0.62 + 0.38 * clamp(easeOutBack(clamp(cf, 0, 1)), 0, 1.2);
      this.clock.scale.setScalar(pop);
      this.clock.position.y = CLOCK_Y + Math.sin(t * 1.8 + this.index) * 0.022;
      this.clock.quaternion.copy(camera.quaternion);
      const sec = this.taskSeconds;
      this.handSec.rotation.z = -sec * (Math.PI * 2 / 30);
      this.handMin.rotation.z = -sec * (Math.PI * 2 / 900);
      this.handHour.rotation.z = -sec * (Math.PI * 2 / 10800);
    }

    /* gelembung (HTML) — posisi akhir diatur layoutBubbles() */
    const bf = this.bubbleFade;
    this.bubbleShown = bf > 0.01;
    if (this.bubbleShown) {
      this._anchor.set(this.cfg.x, 1.76, -1.0).project(camera);
      this._bsx = (this._anchor.x * 0.5 + 0.5) * window.innerWidth;
      this._bsy = (-this._anchor.y * 0.5 + 0.5) * window.innerHeight - 8 + Math.sin(t * 1.7 + this.index) * 3 * bf;
      this._bk = 0.72 + 0.28 * clamp(easeOutBack(clamp(bf, 0, 1)), 0, 1.12);
      this._bop = clamp(bf * 1.55, 0, 1);
    } else {
      this.bubbleEl.style.display = 'none';
      this._bw = 0;
      this._bh = 0;
    }

    /* tanda seru */
    const gf = this.bangFade;
    this.bang.visible = gf > 0.02;
    if (this.bang.visible) {
      const pulse = 1 + 0.075 * Math.sin(t * 7.4);
      const k = clamp(easeOutBack(clamp(gf, 0, 1)), 0, 1.15) * pulse;
      this.bang.scale.set(this.bangW * k, this.bangH * k, 1);
      this.bang.material.opacity = clamp(gf * 1.8, 0, 1);
      this.bang.position.y = 1.98 + Math.sin(t * 2.6 + this.index) * 0.02;
    }
  }
}

const agents = [];
const hitboxes = [];

function layoutBubbles() {
  const items = [];
  for (const a of agents) {
    if (!a.bubbleShown) continue;
    const el = a.bubbleEl;
    if (el.style.display !== 'block') el.style.display = 'block';
    if (!a._bw || !a._bh) {
      a._bw = el.offsetWidth || 150;
      a._bh = el.offsetHeight || 48;
    }
    items.push({ a, x: a._bsx, y: a._bsy, w: a._bw, h: a._bh });
  }
  if (!items.length) return;

  // pisahkan gelembung yang saling menutup
  items.sort((p, q) => p.x - q.x);
  for (let iter = 0; iter < 6; iter++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i], B = items[j];
        const ox = (A.w + B.w) / 2 + 8 - Math.abs(A.x - B.x);
        const oy = (A.h + B.h) / 2 + 2 - Math.abs(A.y - B.y);
        if (ox > 0 && oy > 0) {
          const dir = A.x <= B.x ? -1 : 1;
          A.x += (dir * ox) / 2;
          B.x -= (dir * ox) / 2;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  for (const it of items) {
    const halfW = it.w / 2;
    const x = clamp(it.x, halfW + 8, window.innerWidth - halfW - 8);
    const el = it.a.bubbleEl;
    el.style.left = `${x.toFixed(1)}px`;
    el.style.top = `${it.y.toFixed(1)}px`;
    el.style.transform = `translate(-50%, -100%) scale(${it.a._bk.toFixed(3)})`;
    el.style.opacity = String(it.a._bop);
    // ekor tetap menunjuk ke agen walau gelembung digeser
    const dx = clamp(it.a._bsx - x, -halfW + 18, halfW - 18);
    el.style.setProperty('--tail-x', `${dx.toFixed(1)}px`);
  }
}

function buildAgents() {
  ROOMS.forEach((room) => {
    [-1.5, 1.5].forEach((dx) => {
      const data = AGENT_DATA[agents.length];
      const idx = agents.length;
      const a = new Agent({ ...data, x: room.x + dx, room: room.name, roomCode: room.code }, idx);
      agents.push(a);
    });
  });
}

/* =========================================================
   Sutradara: mode data contoh + mode langsung
   ========================================================= */
const SCRIPT = [
  { t: 0, a: '*', s: 'typing', cap: 'Semua agen mulai mengetik — jam tugas berjalan di tiap meja.' },
  { t: 3.5, a: 1, s: 'report', cap: 'Rani mengirim laporan — gelembung “Menunggu keputusan” muncul.' },
  { t: 6.0, a: 5, s: 'report', cap: 'Nadia menyusul dari Ruang 3 dengan laporan baru.' },
  { t: 8.0, a: 1, s: 'urgent', cap: 'Laporan Rani naik jadi mendesak — meja berkedip, tanda seru muncul.' },
  { t: 10.5, a: 4, s: 'report', cap: 'Adi menyerahkan laporan operasional untuk ditinjau.' },
  { t: 13.5, a: 5, s: 'urgent', cap: 'Laporan Nadia mendesak — meja Ruang 3 ikut berkedip.' },
  { t: 16.0, a: 2, s: 'report', cap: 'Bima menandai laporannya menunggu keputusan.' },
  { t: 19.0, a: 4, s: 'urgent', cap: 'Meja Adi berkedip — perlu keputusan cepat.' },
  { t: 22.0, a: 3, s: 'report', cap: 'Sinta mengirim laporan hasil pemeriksaan berkas.' },
  { t: 25.0, a: 6, s: 'report', cap: 'Yoga meneruskan hasil tindak lanjut panggilan.' },
  { t: 28.0, a: 2, s: 'urgent', cap: 'Laporan Bima ikut mendesak — meja berkedip.' },
  { t: 31.0, a: 3, s: 'typing', cap: 'Sinta kembali mengetik — alur contoh akan diulang.' },
];
const LOOP_LEN = 34;

let sampleMode = true;
let loopT = 0;
let beatIdx = 0;

/* ------------------------- otak AI ------------------------- */
const BRAIN_COLORS = { deepseek: '#4d6bfe', gemini: '#4285f4', openai: '#0f9f7a' };
const aiState = { mode: false, supported: false, readyCount: 0, config: null };
const brainInfo = (a) => aiState.config?.agents?.[a.index] || null;

const captionEl = document.getElementById('caption');
const capKick = document.getElementById('cap-kick');
const capText = document.getElementById('cap-text');

function setCaption(kick, text) {
  capKick.textContent = kick;
  capText.textContent = text;
  capText.classList.remove('in');
  void capText.offsetWidth;
  capText.classList.add('in');
  captionEl.style.opacity = '1';
}

function resetSample() {
  loopT = 0;
  beatIdx = 0;
  agents.forEach((a) => {
    a.setState('typing');
    a.taskSeconds = Math.random() * 20;
    a.clockFade = 1;
    a.bubbleFade = 0;
    a.bangFade = 0;
    a.glow = 0;
  });
  setCaption('Alur contoh', SCRIPT[0].cap);
  beatIdx = 1;
}

function randomizeLive() {
  agents.forEach((a) => {
    a.setState('typing');
    a.nextAt = 2 + Math.random() * 6;
  });
  setCaption('Mode langsung', 'Status berubah otomatis. Klik agen untuk mengubah manual.');
}

function updateDirector(dt) {
  if (aiState.mode) return;
  if (!sampleMode) {
    for (const a of agents) {
      a.nextAt -= dt;
      if (a.nextAt > 0) continue;
      const reports = agents.filter((x) => x.state === 'report').length;
      if (a.state === 'typing') {
        if (reports < 2 && Math.random() < 0.7) {
          a.setState('report');
          a.nextAt = 3.5 + Math.random() * 3;
        } else if (Math.random() < 0.45) {
          a.setState('urgent');
          a.nextAt = 4 + Math.random() * 3;
        } else {
          a.setState('typing');
          a.nextAt = 6 + Math.random() * 6;
        }
      } else if (a.state === 'report') {
        if (a.stateT > 2.2 && Math.random() < 0.55) {
          a.setState('urgent');
          a.nextAt = 4 + Math.random() * 3;
        } else {
          a.setState('typing');
          a.nextAt = 7 + Math.random() * 7;
        }
      } else {
        a.setState('typing');
        a.nextAt = 8 + Math.random() * 8;
      }
    }
    return;
  }

  loopT += dt;
  while (beatIdx < SCRIPT.length && loopT >= SCRIPT[beatIdx].t) {
    const beat = SCRIPT[beatIdx++];
    if (beat.a === '*') agents.forEach((a) => a.setState(beat.s));
    else agents[beat.a - 1].setState(beat.s);
    setCaption('Alur contoh', beat.cap);
  }
  if (loopT >= LOOP_LEN) {
    resetSample();
    setCaption('Alur contoh', 'Alur diulang — semua agen kembali mengetik.');
  }
}

/* =========================================================
   Kontrol kamera + interaksi
   ========================================================= */
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2(-10, -10);
const pointerClient = { x: 0, y: 0 };
let pointerInside = false;
let hovered = null;
let dragState = null;

const tip = document.getElementById('tip');

function pickAgent() {
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(hitboxes, false);
  return hits.length ? hits[0].object.userData.agent : null;
}

function setHovered(a) {
  if (hovered === a) return;
  if (hovered) hovered.hovered = false;
  hovered = a;
  if (hovered) hovered.hovered = true;
  canvas.classList.toggle('pointing', !!hovered);
  if (!hovered) {
    tip.classList.remove('on');
    tipSig = '';
  }
}

let tipSig = '';

function updateTip() {
  if (!hovered) return;
  const a = hovered;
  const state = a.state;
  const info = brainInfo(a);
  const brainLine =
    aiState.mode && info
      ? `<div class="brain"><span class="bd" style="background:${BRAIN_COLORS[info.provider] || '#94a3b8'}"></span>${escapeHtml(info.label)} · ${escapeHtml(info.model)}${a.thinking ? ' · berpikir…' : ''}${info.ready ? '' : ' · simulasi'}</div>`
      : '';
  const noteLine =
    aiState.mode && a.brainNote ? `<div class="note">${escapeHtml(a.brainNote)}</div>` : '';
  const sig = [
    a.index, state, Math.floor(a.taskSeconds), a.thinking ? 1 : 0,
    aiState.mode ? 1 : 0, a.brainNote, a.brainSource,
  ].join('|');
  if (sig !== tipSig) {
    tipSig = sig;
    tip.innerHTML = `
      <div class="nm">${escapeHtml(a.cfg.name)} <span class="rm">${a.cfg.roomCode} · ${escapeHtml(a.cfg.room)}</span></div>
      <div class="tk">${escapeHtml(a.cfg.task)}</div>
      <div class="st">
        <span class="dot ${STATE_DOT[state]}"></span>
        ${STATE_LABEL[state]}
        <span class="time">${fmtTime(a.taskSeconds)}</span>
      </div>
      ${brainLine}
      ${noteLine}
      <div class="act">Klik untuk ubah status</div>`;
    tip._w = tip.offsetWidth || 220;
  }
  const pad = 12;
  const w = tip._w || 220;
  const x = clamp(pointerClient.x, w / 2 + pad, window.innerWidth - w / 2 - pad);
  const y = clamp(pointerClient.y, 120, window.innerHeight - 12);
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
  tip.classList.add('on');
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  dragState = { x: e.clientX, y: e.clientY, az: cam.baseAz, el: cam.baseEl, moved: 0 };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('grabbing');
});

canvas.addEventListener('pointermove', (e) => {
  pointerClient.x = e.clientX;
  pointerClient.y = e.clientY;
  pointerInside = true;
  pointerNDC.set(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
  if (!dragState) return;
  const dx = e.clientX - dragState.x;
  const dy = e.clientY - dragState.y;
  dragState.moved = Math.max(dragState.moved, Math.hypot(dx, dy));
  if (dragState.moved > 3) {
    cam.baseAz = clamp(dragState.az - dx * 0.0052, -1.15, 1.15);
    cam.baseEl = clamp(dragState.el + dy * 0.004, 0.17, 1.0);
  }
});

canvas.addEventListener('pointerup', (e) => {
  const wasDrag = dragState && dragState.moved > 4;
  dragState = null;
  canvas.classList.remove('grabbing');
  if (!wasDrag) {
    pointerNDC.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    const a = pickAgent();
    if (a) {
      a.cycle();
      setHovered(a);
      updateTip();
    }
  }
});

canvas.addEventListener('pointerleave', () => {
  pointerInside = false;
  setHovered(null);
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0014), 0.7, 2.6);
}, { passive: false });

canvas.addEventListener('dblclick', () => {
  cam.baseAz = THREE.MathUtils.degToRad(34);
  cam.baseEl = THREE.MathUtils.degToRad(31);
  cam.zoom = 1;
});

/* ------------------------- tombol & keyboard ------------------------- */
const btnAI = document.getElementById('btn-ai');
const aiBtnLabel = document.getElementById('ai-btn-label');
const aiStatusEl = document.getElementById('ai-status');
const brainsEl = document.getElementById('brains');
const btnSample = document.getElementById('btn-sample');
const btnReplay = document.getElementById('btn-replay');
const btnCam = document.getElementById('btn-cam');
const btnRecord = document.getElementById('btn-record');

function syncBubbleLabel(a) {
  const bn = a.bubbleEl?.querySelector('.bn');
  if (!bn) return;
  const info = brainInfo(a);
  const tag = aiState.mode && info ? ` · ${info.label}` : '';
  bn.textContent = `${a.cfg.name} · ${a.cfg.roomCode}${tag}`;
}

function syncAllBubbleLabels() {
  agents.forEach(syncBubbleLabel);
}

function renderBrains(cfg) {
  const entries = Object.entries(cfg.providers || {});
  brainsEl.innerHTML = entries
    .map(([id, p]) => `
      <li>
        <span class="bd" style="background:${BRAIN_COLORS[id] || '#94a3b8'}"></span>
        <b>${escapeHtml(p.label)}</b>
        <span class="m">${escapeHtml(p.model)}</span>
        <span class="st ${p.ready ? 'ok' : 'off'}">${p.ready ? 'siap' : 'tanpa kunci'}</span>
      </li>`)
    .join('');
}

function disableAIUI() {
  aiState.mode = false;
  btnAI.classList.remove('on');
  btnAI.setAttribute('aria-pressed', 'false');
  syncAllBubbleLabels();
  tipSig = '';
}

function setAIMode(on) {
  if (on && !aiState.supported) return;
  aiState.mode = on;
  btnAI.classList.toggle('on', on);
  btnAI.setAttribute('aria-pressed', String(on));
  if (on) {
    sampleMode = false;
    btnSample.classList.remove('on');
    btnSample.setAttribute('aria-pressed', 'false');
    const now = performance.now() / 1000;
    agents.forEach((a, i) => {
      a.thinking = false;
      a.brainNote = '';
      a.brainSource = '';
      a.nextThinkAt = now + 0.8 + i * 0.9;
    });
    setCaption(
      aiState.readyCount ? 'Otak AI' : 'Otak AI · simulasi',
      aiState.readyCount
        ? 'Enam agen meminta keputusan ke model masing-masing…'
        : 'Kunci model belum diisi — otak AI berjalan dalam mode simulasi.'
    );
    aiStatusEl.textContent = aiState.readyCount
      ? 'Aktif — tiap agen berpikir tiap beberapa detik.'
      : 'Simulasi aktif: isi kunci di .env untuk memakai model asli.';
  } else {
    agents.forEach((a) => { a.thinking = false; });
    randomizeLive();
    aiStatusEl.textContent = aiState.readyCount
      ? 'Nonaktif — memakai mode langsung.'
      : 'Nonaktif — kunci model belum diisi.';
  }
  syncAllBubbleLabels();
  tipSig = '';
}

function localFallback(a) {
  const r = Math.random();
  if (a.state === 'urgent') return { state: 'typing', note: 'Lanjut mengetik setelah eskalasi diteruskan.' };
  if (a.state === 'report') {
    return r < 0.5
      ? { state: 'urgent', note: 'Belum ada keputusan, laporan naik jadi mendesak.' }
      : { state: 'typing', note: 'Menunggu keputusan sambil melanjutkan tugas lain.' };
  }
  if (agents.filter((x) => x.state === 'report').length >= 2) {
    return { state: 'typing', note: 'Antrean keputusan penuh, fokus mengetik dulu.' };
  }
  return r < 0.6
    ? { state: 'typing', note: 'Lanjut mengerjakan tugas rutin.' }
    : r < 0.9
      ? { state: 'report', note: 'Laporan selesai, menunggu keputusan.' }
      : { state: 'urgent', note: 'Butuh keputusan segera.' };
}

async function thinkWithAI(a) {
  if (!aiState.mode) return;
  a.thinking = true;
  if (hovered === a) tipSig = '';
  const reports = agents.filter((x) => x.state === 'report').length;
  const urgent = agents.filter((x) => x.state === 'urgent').length;

  try {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent: a.index,
        current: a.state,
        elapsed: a.taskSeconds,
        reports,
        urgent,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    if (!aiState.mode) return;
    a.brainNote = d.note || '';
    a.brainSource = d.source || 'model';
    if (d.state) a.setState(d.state);
    syncBubbleLabel(a);

    const label = d.providerLabel || brainInfo(a)?.label || 'AI';
    const stateText = (STATE_LABEL[d.state] || d.state).toLowerCase();
    if (d.source === 'model') {
      setCaption('Otak AI', `${a.cfg.name} · ${label}: ${stateText} — “${a.brainNote}”`);
    } else if (d.source === 'simulasi') {
      setCaption(
        'Otak AI · simulasi',
        `${a.cfg.name} · ${label}: ${stateText} — “${a.brainNote}”`
      );
    } else {
      setCaption('Otak AI · cadangan', `${label} tidak merespons — ${a.cfg.name} memakai keputusan cadangan.`);
    }
  } catch {
    if (!aiState.mode) return;
    const f = localFallback(a);
    a.setState(f.state);
    a.brainNote = f.note;
    a.brainSource = 'offline';
    setCaption('Otak AI', 'Server otak AI tidak merespons — simulasi lokal dipakai.');
  } finally {
    a.thinking = false;
    a.nextThinkAt = performance.now() / 1000 + 7 + Math.random() * 5;
    if (hovered === a) tipSig = '';
  }
}

function updateAI() {
  if (!aiState.mode) return;
  const now = performance.now() / 1000;
  for (const a of agents) {
    if (a.thinking || now < a.nextThinkAt) continue;
    a.nextThinkAt = now + 120;
    thinkWithAI(a);
  }
}

async function initAI() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cfg = await res.json();
    if (!cfg || !Array.isArray(cfg.agents)) throw new Error('Konfigurasi tidak valid');
    aiState.config = cfg;
    aiState.supported = true;
    aiState.readyCount = cfg.readyCount || 0;
    renderBrains(cfg);
    btnAI.disabled = false;
    aiBtnLabel.textContent = 'Otak AI';
    btnAI.title = aiState.readyCount
      ? 'Otak AI aktif — DeepSeek, Gemini, GPT'
      : 'Mode simulasi — isi kunci model di .env';
    setAIMode(true);
  } catch {
    aiState.supported = false;
    btnAI.disabled = true;
    btnAI.classList.remove('on');
    btnAI.setAttribute('aria-pressed', 'false');
    aiBtnLabel.textContent = 'Otak AI';
    aiStatusEl.textContent = 'Server AI tidak aktif. Jalankan start.bat / node server.mjs.';
    brainsEl.innerHTML = '<li><span class="bd" style="background:#94a3b8"></span> Tidak terhubung</li>';
  }
}

function setSampleMode(on) {
  if (on && aiState.mode) disableAIUI();
  sampleMode = on;
  btnSample.classList.toggle('on', on);
  btnSample.setAttribute('aria-pressed', String(on));
  if (on) resetSample();
  else randomizeLive();
}

btnAI.addEventListener('click', () => {
  if (!aiState.supported) return;
  setAIMode(!aiState.mode);
});

btnSample.addEventListener('click', () => setSampleMode(!sampleMode));

btnReplay.addEventListener('click', () => {
  if (!sampleMode) setSampleMode(true);
  else resetSample();
  setCaption('Alur contoh', SCRIPT[0].cap);
});

btnCam.addEventListener('click', () => {
  cam.drift = !cam.drift;
  btnCam.classList.toggle('on', cam.drift);
  btnCam.setAttribute('aria-pressed', String(cam.drift));
});

btnRecord.addEventListener('click', () => {
  document.body.classList.toggle('recording');
  btnRecord.classList.toggle('on', document.body.classList.contains('recording'));
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.body.classList.remove('recording');
    btnRecord.classList.remove('on');
    return;
  }
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  if (k >= '1' && k <= '6') {
    const a = agents[Number(k) - 1];
    if (a) {
      a.cycle();
      setHovered(a);
      updateTip();
    }
  } else if (k === 'a') {
    if (aiState.supported) setAIMode(!aiState.mode);
  } else if (k === 's') {
    setSampleMode(!sampleMode);
  } else if (k === 'r') {
    if (!sampleMode) setSampleMode(true);
    else resetSample();
  } else if (k === 'c') {
    btnCam.click();
  } else if (k === 'h') {
    document.body.classList.toggle('recording');
    btnRecord.classList.toggle('on', document.body.classList.contains('recording'));
  }
});

/* =========================================================
   Loop
   ========================================================= */
const clock = new THREE.Clock();
let elapsed = 0;
let booted = false;

function tick() {
  requestAnimationFrame(tick);
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.1);
  elapsed += dt;

  applyCamera(elapsed);
  updateDirector(Math.min(raw, 0.5));
  updateAI();
  for (const a of agents) a.update(dt, elapsed);
  layoutBubbles();

  // jarum jam dinding mengikuti waktu nyata
  const now = new Date();
  for (const c of tickClocks) {
    c.sec.rotation.z = -((now.getSeconds() + now.getMilliseconds() / 1000) / 60) * Math.PI * 2;
    c.min.rotation.z = -((now.getMinutes() + now.getSeconds() / 60) / 60) * Math.PI * 2;
    c.hour.rotation.z = -(((now.getHours() % 12) + now.getMinutes() / 60) / 12) * Math.PI * 2;
  }

  // hover
  if (pointerInside && !dragState) setHovered(pickAgent());
  else if (!pointerInside) setHovered(null);
  if (hovered) updateTip();
  renderer.render(scene, camera);

  if (!booted) {
    booted = true;
    const boot = document.getElementById('boot');
    boot.classList.add('hide');
    setTimeout(() => boot.remove(), 600);
  }
}

/* ------------------------- mulai ------------------------- */
buildStage();
buildRooms();
buildAgents();
resetSample();
resize();
applyCamera(0);
tick();

// akses ringan untuk pengujian/otomasi demo
window.kantor = { agents, camera, cam, setSampleMode, resetSample, aiState, setAIMode };

initAI();

// buka dari file:// tetap memberi pesan yang jelas
window.addEventListener('error', (e) => {
  console.error(e);
});
