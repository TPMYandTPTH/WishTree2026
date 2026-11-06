/* =========================================================
   TP Wish Tree 2026 - the 3D tree (three.js / WebGL).
   Loaded by index.html. If WebGL isn't available the page
   keeps the 2D tree from wishtree.js instead.
   No need to edit this file.
   ========================================================= */
import * as THREE from './vendor/three.module.min.js';

const C = window.WishCore;
const TAU = Math.PI * 2;

/* ---------- Tree shape (world units, the tree is about 8.6 tall) ---------- */
const TIERS = [
  { y0: 1.0, h: 3.2, r: 3.0, ridges: 13, seed: 0.3 },
  { y0: 2.5, h: 2.8, r: 2.35, ridges: 12, seed: 1.7 },
  { y0: 3.8, h: 2.5, r: 1.8, ridges: 11, seed: 2.9 },
  { y0: 5.0, h: 2.2, r: 1.3, ridges: 10, seed: 4.1 },
  { y0: 6.1, h: 1.9, r: 0.85, ridges: 9, seed: 5.3 }
];
const TOP_Y = 8.0;
const TAG = { w: 0.42, h: 0.56, d: 0.02, string: 0.12, tilt: 0.5 };
const TAG_Y = [1.75, 5.7];          // where employee tags can hang
const MAX_LEADERS = 6;
const BG = { cream: '#F6EEDC', red: '#AB2C37', gold: '#E3B45A' };
const FG = { cream: '#AB2C37', red: '#F6EEDC', gold: '#0E2A1F' };

function surfaceR(y) {
  let r = 0;
  for (const t of TIERS) {
    if (y >= t.y0 - 0.2 && y <= t.y0 + t.h) {
      const f = Math.min(1, Math.max(0, 1 - (y - t.y0) / t.h));
      r = Math.max(r, t.r * f);
    }
  }
  return r;
}

const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

export function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

/* ---------- Canvas textures ---------- */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function drawTag(color, charm, back) {
  const W = 192, H = 256;
  const cv = makeCanvas(W, H);
  const x = cv.getContext('2d');
  x.fillStyle = BG[color] || BG.cream;
  x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(255,255,255,0.20)');
  g.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.14)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.strokeStyle = color === 'cream' ? 'rgba(171,44,55,0.35)' : 'rgba(246,238,220,0.5)';
  x.lineWidth = 4;
  x.strokeRect(12, 12, W - 24, H - 24);
  // eyelet
  x.fillStyle = 'rgba(14,42,31,0.6)';
  x.beginPath(); x.arc(W / 2, 32, 9, 0, TAU); x.fill();
  x.strokeStyle = '#C9A36B';
  x.lineWidth = 4;
  x.beginPath(); x.arc(W / 2, 32, 12, 0, TAU); x.stroke();
  if (!back) {
    const p = new Path2D(C.ICON_D[charm] || C.ICON_D.snow);
    const s = 4.4;
    x.save();
    x.translate(W / 2 - 12 * s, H / 2 + 20 - 12 * s);
    x.scale(s, s);
    x.strokeStyle = FG[color] || FG.cream;
    x.lineWidth = 1.5;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.stroke(p);
    x.restore();
  } else {
    // the back looks like handwriting
    x.strokeStyle = color === 'cream' ? 'rgba(24,51,38,0.28)' : 'rgba(246,238,220,0.4)';
    x.lineWidth = 7;
    x.lineCap = 'round';
    [[100, 0.72], [132, 0.58], [164, 0.66], [196, 0.4]].forEach(([y, f]) => {
      x.beginPath(); x.moveTo(40, y); x.lineTo(40 + (W - 80) * f, y); x.stroke();
    });
  }
  return cv;
}

function drawLeader(initials) {
  const S = 256;
  const cv = makeCanvas(S, S);
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(S * 0.36, S * 0.32, S * 0.04, S / 2, S / 2, S * 0.52);
  g.addColorStop(0, '#FCE6A8');
  g.addColorStop(0.55, '#E3B45A');
  g.addColorStop(1, '#B4842F');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  x.strokeStyle = '#F7DA8E';
  x.lineWidth = 10;
  x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 18, 0, TAU); x.stroke();
  x.fillStyle = '#0E2A1F';
  x.font = '700 88px "TP Sans","Noto Sans",system-ui,sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(initials, S / 2, S / 2 + 2);
  // red star badge
  const bx = S * 0.7, by = S * 0.72;
  x.fillStyle = '#AB2C37';
  x.beginPath(); x.arc(bx, by, 30, 0, TAU); x.fill();
  const star = new Path2D(C.STAR_D);
  x.save();
  x.translate(bx - 12 * 1.7, by - 12 * 1.7);
  x.scale(1.7, 1.7);
  x.fillStyle = '#F6EEDC';
  x.fill(star);
  x.restore();
  return cv;
}

function drawGlow() {
  const S = 128;
  const cv = makeCanvas(S, S);
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.16, 'rgba(255,244,214,0.9)');
  g.addColorStop(0.42, 'rgba(255,205,120,0.3)');
  g.addColorStop(1, 'rgba(255,180,80,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return cv;
}

function drawSoftDisc(inner, outer) {
  const S = 128;
  const cv = makeCanvas(S, S);
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return cv;
}

/* ---------- Geometry helpers ---------- */
function makeTierGeometry(t) {
  const g = new THREE.ConeGeometry(t.r, t.h, 80, 8, true);
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const dark = new THREE.Color('#123D2A');
  const mid = new THREE.Color('#25694A');
  const light = new THREE.Color('#4A9A6C');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const f = (y + t.h / 2) / t.h; // 0 at the rim, 1 at the tip
    const rr = Math.hypot(x, z);
    const th = Math.atan2(z, x);
    const ridge = Math.sin(th * t.ridges + t.seed);
    const fine = Math.sin(th * t.ridges * 3 + t.seed * 2.1);
    if (rr > 1e-5) {
      const k = 1 + (0.13 * ridge + 0.035 * fine) * (1 - f * 0.7);
      let ny = y;
      if (f < 0.02) ny -= 0.2 * (0.5 + 0.5 * ridge); // droopy branch tips around the rim
      pos.setXYZ(i, (x / rr) * rr * k, ny, (z / rr) * rr * k);
    }
    const shade = Math.min(1, Math.max(0, 0.3 + 0.32 * (0.5 + 0.5 * ridge) + 0.38 * f));
    if (shade < 0.5) tmp.copy(dark).lerp(mid, shade / 0.5);
    else tmp.copy(mid).lerp(light, (shade - 0.5) / 0.5);
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

function makeStarGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.2 : 0.46;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 2 });
  g.center();
  return g;
}

/* =========================================================
   createTree3D(container, { onSelect(kind, id) })
   ========================================================= */
export function createTree3D(container, opts = {}) {
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const canvasEl = renderer.domElement;
  canvasEl.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab;outline:none;-webkit-tap-highlight-color:transparent';
  canvasEl.setAttribute('role', 'img');
  canvasEl.setAttribute('aria-label', '3D wish tree. Drag sideways to turn it and tap a tag to read the wish. You can also use Previous and Next.');
  container.appendChild(canvasEl);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const toTex = (cv) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 620 / 760, 0.1, 100);
  camera.position.set(0, 4.7, 17.2);
  camera.lookAt(0, 4.15, 0);

  /* lights */
  scene.add(new THREE.HemisphereLight(0xfff3dc, 0x0b231a, 1.25));
  const key = new THREE.DirectionalLight(0xfff1d8, 2.1);
  key.position.set(-6, 10, 10);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd27a, 1.1);
  rim.position.set(7, 6, -6);
  scene.add(rim);
  const warmA = new THREE.PointLight(0xffc46b, 9, 10, 2);
  warmA.position.set(1.6, 3.2, 4.2);
  scene.add(warmA);
  const warmB = new THREE.PointLight(0xffd98a, 6, 9, 2);
  warmB.position.set(-2.1, 5.6, 3.4);
  scene.add(warmB);

  /* everything that turns */
  const world = new THREE.Group();
  scene.add(world);

  const glowTex = toTex(drawGlow());
  const shadowTex = toTex(drawSoftDisc('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'));
  const snowTex = toTex(drawSoftDisc('rgba(255,255,255,1)', 'rgba(255,255,255,0)'));

  // ground shadow and tree skirt
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(3.8, 48), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  world.add(shadow);
  const skirt = new THREE.Mesh(new THREE.RingGeometry(0.4, 2.3, 48), new THREE.MeshStandardMaterial({ color: 0x8e2430, roughness: 0.9, side: THREE.DoubleSide }));
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = 0.02;
  world.add(skirt);

  // trunk and inner fill (so you never see through the branches)
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.4, 16), new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.95 }));
  trunk.position.y = 0.7;
  world.add(trunk);
  const fill = new THREE.Mesh(new THREE.ConeGeometry(2.35, 7.0, 28), new THREE.MeshStandardMaterial({ color: 0x0f3324, roughness: 1 }));
  fill.position.y = 1.0 + 3.5;
  world.add(fill);

  // foliage tiers
  const foliageMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  const foliage = [];
  for (const t of TIERS) {
    const m = new THREE.Mesh(makeTierGeometry(t), foliageMat);
    m.position.y = t.y0 + t.h / 2;
    world.add(m);
    foliage.push(m);
  }
  foliage.push(fill);

  // star on top: it stays facing you while the tree turns, with a gentle sway
  const starGroup = new THREE.Group();
  starGroup.position.y = TOP_Y + 0.38;
  scene.add(starGroup);
  const star = new THREE.Mesh(makeStarGeometry(), new THREE.MeshStandardMaterial({ color: 0xf2c766, emissive: 0xf2b640, emissiveIntensity: 0.9, metalness: 0.55, roughness: 0.3 }));
  starGroup.add(star);
  const starGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd98a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const starGlow = new THREE.Sprite(starGlowMat);
  starGlow.scale.set(2.6, 2.6, 1);
  starGroup.add(starGlow);

  // garland: a gold rope spiralling up the tree
  const garlandPts = [];
  for (let i = 0; i <= 220; i++) {
    const s = i / 220;
    const y = 1.25 + s * (6.6 - 1.25);
    const th = s * 4.6 * TAU;
    const R = surfaceR(y) * 1.02 + 0.03;
    garlandPts.push(new THREE.Vector3(Math.cos(th) * R, y - 0.08 * Math.sin(s * 40), Math.sin(th) * R));
  }
  const garlandCurve = new THREE.CatmullRomCurve3(garlandPts);
  const garland = new THREE.Mesh(new THREE.TubeGeometry(garlandCurve, 600, 0.024, 6, false), new THREE.MeshStandardMaterial({ color: 0xe3b45a, metalness: 0.8, roughness: 0.3, emissive: 0x3a2808 }));
  world.add(garland);

  /* fairy lights: along the garland and scattered over the branches */
  const bulbs = [];
  const bulbGeo = new THREE.SphereGeometry(0.045, 10, 8);
  const bulbColors = [0xfff1c9, 0xffe0a0, 0xffc857, 0xfff1c9, 0xffb38a];
  const bulbMats = bulbColors.map((c) => new THREE.MeshBasicMaterial({ color: c }));
  function addLight(p, ci, chase) {
    const mat = new THREE.SpriteMaterial({ map: glowTex, color: bulbColors[ci], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(p);
    world.add(sp);
    const bulb = new THREE.Mesh(bulbGeo, bulbMats[ci]);
    bulb.position.copy(p);
    world.add(bulb);
    const h = C.hash('light:' + bulbs.length);
    bulbs.push({ sp, mat, chase, phase: (h % 628) / 100, speed: 1.3 + (h % 23) / 10 });
  }
  for (let i = 0; i < 64; i++) {
    const s = (i + 0.5) / 64;
    const p = garlandCurve.getPointAt(s);
    const R = Math.hypot(p.x, p.z) + 0.05;
    const a = Math.atan2(p.z, p.x);
    addLight(new THREE.Vector3(Math.cos(a) * R, p.y, Math.sin(a) * R), i % bulbColors.length, s * 14);
  }
  const lr = C.random(2026);
  for (let i = 0; i < 46; i++) {
    const y = 1.3 + lr() * 6.4;
    const th = lr() * TAU;
    const R = surfaceR(y) + 0.08;
    addLight(new THREE.Vector3(Math.cos(th) * R, y, Math.sin(th) * R), Math.floor(lr() * bulbColors.length), lr() * 14);
  }

  /* baubles */
  const baubleGeo = new THREE.SphereGeometry(1, 22, 16);
  const capGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10);
  const baubleMats = [
    new THREE.MeshStandardMaterial({ color: 0xab2c37, metalness: 0.55, roughness: 0.22 }),
    new THREE.MeshStandardMaterial({ color: 0xe3b45a, metalness: 0.85, roughness: 0.2 }),
    new THREE.MeshStandardMaterial({ color: 0xede3cf, metalness: 0.6, roughness: 0.25 })
  ];
  const capMat = new THREE.MeshStandardMaterial({ color: 0xc9a36b, metalness: 0.8, roughness: 0.35 });
  const obstacles = [];
  const br = C.random(77);
  for (let i = 0; i < 26; i++) {
    const y = 1.35 + br() * 4.9;
    const th = br() * TAU;
    const R = surfaceR(y) + 0.1;
    const size = 0.12 + br() * 0.06;
    const m = new THREE.Mesh(baubleGeo, baubleMats[i % 3]);
    m.scale.setScalar(size);
    m.position.set(Math.cos(th) * R, y, Math.sin(th) * R);
    world.add(m);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(m.position.x, y + size + 0.015, m.position.z);
    world.add(cap);
    obstacles.push({ x: m.position.x, y: y + 0.25, z: m.position.z, r: 0.2 });
  }

  /* gifts under the tree */
  function gift(x, z, w, h, d, color, ribbon, rotY) {
    const g = new THREE.Group();
    const boxMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const ribMat = new THREE.MeshStandardMaterial({ color: ribbon, roughness: 0.4, metalness: 0.3 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat);
    box.position.y = h / 2;
    g.add(box);
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, h + 0.01, d * 0.18), ribMat);
    r1.position.y = h / 2;
    g.add(r1);
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.18, h + 0.012, d + 0.01), ribMat);
    r2.position.y = h / 2;
    g.add(r2);
    const bowGeo = new THREE.TorusGeometry(0.09, 0.025, 8, 18);
    const b1 = new THREE.Mesh(bowGeo, ribMat);
    b1.position.set(-0.07, h + 0.05, 0);
    b1.rotation.set(0, Math.PI / 2, Math.PI / 4);
    g.add(b1);
    const b2 = b1.clone();
    b2.position.x = 0.07;
    b2.rotation.z = -Math.PI / 4;
    g.add(b2);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    world.add(g);
  }
  gift(1.55, 1.35, 0.7, 0.55, 0.6, 0xab2c37, 0xe3b45a, 0.4);
  gift(-1.7, 1.1, 0.6, 0.7, 0.6, 0xe3b45a, 0xab2c37, -0.3);
  gift(0.25, 2.05, 0.5, 0.42, 0.5, 0xf6eedc, 0xab2c37, 0.9);
  gift(-0.9, -1.6, 0.65, 0.5, 0.55, 0x1e573d, 0xe3b45a, 0.2);
  gift(2.0, -0.6, 0.5, 0.62, 0.5, 0xf6eedc, 0x1e573d, -0.6);

  /* snow drifting in front of the tree */
  const SNOW = reduce ? 0 : 160;
  const snowPos = new Float32Array(SNOW * 3);
  const snowSpeed = new Float32Array(SNOW);
  const sr = C.random(5);
  for (let i = 0; i < SNOW; i++) {
    snowPos[i * 3] = (sr() - 0.5) * 11;
    snowPos[i * 3 + 1] = sr() * 10.5 - 0.5;
    snowPos[i * 3 + 2] = (sr() - 0.5) * 9;
    snowSpeed[i] = 0.25 + sr() * 0.45;
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ size: 0.075, map: snowTex, transparent: true, opacity: 0.75, depthWrite: false }));
  scene.add(snow);

  /* ---------- Tags and leaders ---------- */
  const tagGeo = new THREE.BoxGeometry(TAG.w, TAG.h, TAG.d);
  const stringGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 4);
  const stringMat = new THREE.MeshBasicMaterial({ color: 0xd9c59a });
  const goldStringMat = new THREE.MeshBasicMaterial({ color: 0xf2c766 });
  const selGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd27a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 });
  const matCache = new Map();
  function tagMaterials(color, charm) {
    const k = color + '|' + charm;
    if (!matCache.has(k)) {
      const front = new THREE.MeshStandardMaterial({ map: toTex(drawTag(color, charm, false)), roughness: 0.62 });
      const back = new THREE.MeshStandardMaterial({ map: toTex(drawTag(color, charm, true)), roughness: 0.62 });
      const edge = new THREE.MeshStandardMaterial({ color: BG[color] || BG.cream, roughness: 0.7 });
      matCache.set(k, [edge, edge, edge, edge, front, back]);
    }
    return matCache.get(k);
  }

  const tagsLayer = new THREE.Group();
  world.add(tagsLayer);
  const leadersLayer = new THREE.Group();
  world.add(leadersLayer);
  const tags = new Map();
  const leaders = new Map();
  let leaderSig = '';
  let oldSeq = 0;
  let selectedKey = null;
  let onSelect = opts.onSelect || null;

  function spaced(a, b) {
    const dx = a.x - b.x, dz = a.z - b.z, dy = (a.y - b.y) * 0.8;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) > a.r + b.r;
  }

  // Random but repeatable spot for each wish, all around the tree, never overlapping
  function placeTags(list) {
    const placed = obstacles.slice();
    const out = new Map();
    for (const w of list) {
      const rnd = C.random(C.hash('3d:' + w.id));
      for (let k = 0; k < 140; k++) {
        const y = TAG_Y[0] + rnd() * (TAG_Y[1] - TAG_Y[0]);
        const R = surfaceR(y);
        if (rnd() > (R + 0.5) / 3.5) continue; // more tags on the wider, lower branches
        const th = rnd() * TAU;
        const p = { x: Math.cos(th) * (R + 0.22), y, z: Math.sin(th) * (R + 0.22), th, r: 0.34 };
        if (placed.every((q) => spaced(p, q))) {
          placed.push(p);
          out.set(String(w.id), p);
          break;
        }
      }
    }
    return out;
  }

  function addString(parent, length, mat) {
    const s = new THREE.Mesh(stringGeo, mat);
    s.scale.y = length;
    s.position.y = -length / 2;
    parent.add(s);
  }

  function makeTag(w, spot) {
    const id = String(w.id);
    const pivot = new THREE.Group();
    const swing = new THREE.Group();
    pivot.add(swing);
    addString(swing, TAG.string, stringMat);
    const card = new THREE.Group();
    card.position.y = -TAG.string - TAG.h / 2;
    swing.add(card);
    const mesh = new THREE.Mesh(tagGeo, tagMaterials(w.tag_color, w.charm));
    mesh.userData = { kind: 'wish', id };
    card.add(mesh);
    const glow = new THREE.Sprite(selGlowMat);
    glow.scale.set(1.15, 1.35, 1);
    glow.position.z = -0.06;
    glow.visible = false;
    card.add(glow);
    tagsLayer.add(pivot);
    const h = C.hash(id);
    const o = {
      id, kind: 'wish', pivot, swing, card, mesh, glow, color: w.tag_color, charm: w.charm,
      th: 0, ang: 0, vel: (h % 2 ? 1 : -1) * 3, scale: 0, target: 1, removing: false,
      phase: (h % 628) / 100, freq: 0.8 + (h % 50) / 55, amp: 0.05 + (h % 7) / 100
    };
    positionTag(o, spot);
    return o;
  }

  function positionTag(o, spot) {
    o.th = spot.th;
    o.pivot.position.set(spot.x, spot.y, spot.z);
    o.pivot.rotation.set(-TAG.tilt, Math.PI / 2 - spot.th, 0, 'YXZ');
  }

  const discGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.06, 48);
  const ringGeo = new THREE.TorusGeometry(0.3, 0.028, 12, 48);
  const leaderGold = new THREE.MeshStandardMaterial({ color: 0xe3b45a, metalness: 0.75, roughness: 0.28 });
  const leaderCapMat = new THREE.MeshStandardMaterial({ color: 0xab2c37, metalness: 0.4, roughness: 0.35 });
  const leaderCapGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.07, 14);

  function leaderSpots(n) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const th = Math.PI / 2 + (k * TAU) / n;
      const y = n > 3 ? (k % 2 ? 6.25 : 6.95) : 6.7;
      out.push({ th, y, R: surfaceR(y) });
    }
    return out;
  }

  function makeLeader(L, spot) {
    const id = String(L.id);
    const pivot = new THREE.Group();
    const R = spot.R + 0.16;
    pivot.position.set(Math.cos(spot.th) * R, spot.y + 0.42, Math.sin(spot.th) * R);
    pivot.rotation.set(-0.12, Math.PI / 2 - spot.th, 0, 'YXZ');
    const swing = new THREE.Group();
    pivot.add(swing);
    addString(swing, 0.14, goldStringMat);
    const cap = new THREE.Mesh(leaderCapGeo, leaderCapMat);
    cap.position.y = -0.17;
    swing.add(cap);
    const card = new THREE.Group();
    card.position.y = -0.2 - 0.3;
    swing.add(card);
    const initials = C.initials(L.display_name);
    const faceMat = new THREE.MeshStandardMaterial({ map: toTex(drawLeader(initials)), metalness: 0.25, roughness: 0.4 });
    const turn = new THREE.Group();
    turn.rotation.z = Math.PI / 2;
    const disc = new THREE.Mesh(discGeo, [leaderGold, faceMat, leaderGold]);
    disc.rotation.x = Math.PI / 2;
    disc.userData = { kind: 'leader', id };
    turn.add(disc);
    card.add(turn);
    const ring = new THREE.Mesh(ringGeo, leaderGold);
    card.add(ring);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xf2c766, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.45 }));
    halo.scale.set(1.15, 1.15, 1);
    halo.position.z = -0.08;
    card.add(halo);
    const glow = new THREE.Sprite(selGlowMat);
    glow.scale.set(1.5, 1.5, 1);
    glow.position.z = -0.1;
    glow.visible = false;
    card.add(glow);
    leadersLayer.add(pivot);
    const h = C.hash(id);
    return {
      id, kind: 'leader', pivot, swing, card, mesh: disc, glow, halo, faceMat, initials, th: spot.th,
      ang: 0, vel: 2, scale: 0, target: 1, removing: false,
      phase: (h % 628) / 100, freq: 0.6 + (h % 30) / 60, amp: 0.035
    };
  }

  function disposeLeader(o) {
    leadersLayer.remove(o.pivot);
    if (o.faceMat) { o.faceMat.map.dispose(); o.faceMat.dispose(); }
  }

  function setSelected(sel) {
    selectedKey = sel && sel.id != null ? sel.kind + ':' + String(sel.id) : null;
    tags.forEach((o) => { o.glow.visible = selectedKey === 'wish:' + o.id; });
    leaders.forEach((o) => { o.glow.visible = selectedKey === 'leader:' + o.id; });
  }

  function setData(d) {
    // leaders in the crown
    const ls = (d.leaders || []).slice(0, MAX_LEADERS);
    const sig = ls.map((l) => l.id + ':' + C.initials(l.display_name)).join('|');
    if (sig !== leaderSig) {
      leaderSig = sig;
      leaders.forEach((o) => { o.removing = true; o.target = 0; });
      const spots = leaderSpots(ls.length);
      const old = Array.from(leaders.values());
      leaders.clear();
      old.forEach((o) => leaders.set('old:' + (oldSeq++), o));
      ls.forEach((L, i) => { leaders.set(String(L.id), makeLeader(L, spots[i])); });
    }

    // employee tags
    const list = d.wishes || [];
    const spots = placeTags(list);
    const keep = new Set();
    for (const w of list) {
      const id = String(w.id);
      const sp = spots.get(id);
      if (!sp) continue;
      keep.add(id);
      let o = tags.get(id);
      if (o && (o.color !== w.tag_color || o.charm !== w.charm)) {
        tagsLayer.remove(o.pivot);
        tags.delete(id);
        o = null;
      }
      if (!o) {
        o = makeTag(w, sp);
        tags.set(id, o);
      } else {
        if (o.removing) { o.removing = false; o.target = 1; }
        positionTag(o, sp);
      }
    }
    tags.forEach((o, id) => { if (!keep.has(id)) { o.removing = true; o.target = 0; } });
    setSelected(d.selected);
    return keep.size;
  }

  /* ---------- Turning the tree ---------- */
  let rot = 0;
  let rotVel = 0;
  let prevRot = 0;
  let spinVel = 0;
  let lastInteract = -1e9;
  let anim = null;
  let t = 0;
  const clock = new THREE.Clock();
  const markInteract = () => { lastInteract = t; };

  function nearestAngle(target, from, minAhead) {
    let a = target;
    if (minAhead == null) {
      a += TAU * Math.round((from - a) / TAU);
    } else {
      while (a < from + minAhead) a += TAU;
      while (a > from + minAhead + TAU) a -= TAU;
    }
    return a;
  }

  function itemFor(kind, id) {
    const map = kind === 'leader' ? leaders : tags;
    const o = map.get(String(id));
    return o && !o.removing ? o : null;
  }

  function focus(sel) {
    if (!sel) return;
    const o = itemFor(sel.kind, sel.id);
    if (!o) return;
    const to = nearestAngle(o.th - Math.PI / 2, rot);
    if (anim && anim.type === 'spin') return;
    if (reduce) { rot = to; return; }
    anim = { type: 'focus', from: rot, to, start: t, dur: Math.min(1.4, 0.55 + Math.abs(to - rot) * 0.28), ease: easeInOut };
    rotVel = 0;
    markInteract();
  }

  // Full turn of the tree; midpoint() swaps in the new site's tags while it's spinning
  function spin(midpoint) {
    return new Promise((resolve) => {
      if (reduce) { midpoint(); resolve(); return; }
      if (anim && anim.resolve) anim.resolve();
      anim = { type: 'spin', from: rot, to: rot + TAU, start: t, dur: 1.5, ease: easeInOut, mid: midpoint, midDone: false, resolve };
      rotVel = 0;
      markInteract();
    });
  }

  function stepAnim() {
    if (!anim) return;
    const p = Math.min(1, (t - anim.start) / anim.dur);
    rot = anim.from + (anim.to - anim.from) * anim.ease(p);
    if (anim.type === 'spin' && !anim.midDone && p >= 0.45) {
      anim.midDone = true;
      try { anim.mid(); } catch (e) { console.error(e); }
      // finish the turn facing the selected tag
      const sel = selectedKey ? selectedKey.split(':') : null;
      const o = sel ? itemFor(sel[0], sel.slice(1).join(':')) : null;
      if (o) {
        const to = nearestAngle(o.th - Math.PI / 2, rot, Math.PI * 0.9);
        const resolve = anim.resolve;
        const speed = Math.max(1, Math.abs(spinVel));
        anim = { type: 'spin-out', from: rot, to, start: t, dur: Math.min(2.2, Math.max(0.9, (3 * (to - rot)) / speed)), ease: easeOut, resolve };
        return;
      }
    }
    if (p >= 1) {
      const r = anim.resolve;
      anim = null;
      if (r) r();
    }
  }

  /* ---------- Pointer: drag to turn, tap to pick ---------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    const r = canvasEl.getBoundingClientRect();
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const targets = foliage.slice();
    tags.forEach((o) => { if (!o.removing) targets.push(o.mesh); });
    leaders.forEach((o) => { if (!o.removing) targets.push(o.mesh); });
    const hits = ray.intersectObjects(targets, false);
    if (!hits.length) return null;
    const u = hits[0].object.userData;
    return u && u.kind ? u : null;
  }

  function poke(kind, id, strength) {
    const o = itemFor(kind, id);
    if (o) o.vel += (Math.random() < 0.5 ? -1 : 1) * (strength || 5);
  }

  let down = null;
  let dragging = false;
  let lastMoveT = 0;
  let hoverKey = null;
  canvasEl.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, lastX: e.clientX };
    dragging = false;
    lastMoveT = performance.now();
    try { canvasEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    markInteract();
  });
  canvasEl.addEventListener('pointermove', (e) => {
    if (down) {
      if (!dragging && Math.abs(e.clientX - down.x) > 6) {
        dragging = true;
        if (anim && anim.type === 'focus') anim = null;
        canvasEl.style.cursor = 'grabbing';
      }
      if (dragging && !(anim && anim.type !== 'focus')) {
        const now = performance.now();
        const dx = e.clientX - down.lastX;
        const delta = (dx / Math.max(240, canvasEl.clientWidth)) * 4.2;
        rot += delta;
        rotVel = delta / Math.max(0.016, (now - lastMoveT) / 1000);
        lastMoveT = now;
        down.lastX = e.clientX;
        markInteract();
      }
      return;
    }
    if (e.pointerType === 'mouse') {
      const hit = pick(e.clientX, e.clientY);
      const k = hit ? hit.kind + ':' + hit.id : null;
      if (k !== hoverKey) {
        hoverKey = k;
        canvasEl.style.cursor = k ? 'pointer' : 'grab';
        if (hit) { poke(hit.kind, hit.id, 4.5); markInteract(); }
      }
    }
  });
  const endPointer = (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (!dragging && moved < 8 && e.type === 'pointerup') {
      const hit = pick(e.clientX, e.clientY);
      if (hit) {
        poke(hit.kind, hit.id, 7);
        if (typeof onSelect === 'function') onSelect(hit.kind, hit.id);
      }
    }
    if (performance.now() - lastMoveT > 120) rotVel = 0;
    down = null;
    dragging = false;
    canvasEl.style.cursor = hoverKey ? 'pointer' : 'grab';
    markInteract();
  };
  canvasEl.addEventListener('pointerup', endPointer);
  canvasEl.addEventListener('pointercancel', endPointer);
  canvasEl.addEventListener('pointerleave', () => { if (!down) { hoverKey = null; canvasEl.style.cursor = 'grab'; } });

  /* ---------- Sizing and visibility ---------- */
  function resize() {
    const w = container.clientWidth || 300;
    const h = container.clientHeight || Math.round((w * 760) / 620);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  let onScreen = true;
  const io = new IntersectionObserver((entries) => { onScreen = entries[0].isIntersecting; });
  io.observe(container);

  /* ---------- Animation loop ---------- */
  let raf = 0;
  function animateItem(o, dt, fling, isSel) {
    const wind = reduce ? 0 : o.amp * Math.sin(t * o.freq + o.phase) + 0.025 * Math.sin(t * o.freq * 2.3 + o.phase * 1.7);
    o.vel += (-16 * (o.ang - wind) - 1.9 * o.vel) * dt;
    o.ang += o.vel * dt;
    o.swing.rotation.z = o.ang;
    o.swing.rotation.x = -fling + (reduce ? 0 : 0.04 * Math.sin(t * o.freq * 0.7 + o.phase));
    const goal = o.target * (isSel ? 1.28 : 1);
    o.scale += (goal - o.scale) * Math.min(1, dt * (o.removing ? 9 : 6));
    o.card.scale.setScalar(Math.max(0.0001, o.scale));
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!onScreen || document.hidden) return;
    t += dt;

    // turning
    if (anim) {
      stepAnim();
    } else if (!down) {
      rot += rotVel * dt;
      rotVel *= Math.exp(-3.2 * dt);
      if (!reduce && t - lastInteract > 6) {
        const ramp = Math.min(1, (t - lastInteract - 6) / 2);
        rot += 0.16 * ramp * dt;
      }
    }
    spinVel = (rot - prevRot) / Math.max(dt, 1e-3);
    prevRot = rot;
    world.rotation.y = rot;
    const fling = Math.min(0.85, Math.abs(spinVel) * 0.13);

    // tags and leaders swing
    tags.forEach((o, id) => {
      animateItem(o, dt, fling, selectedKey === 'wish:' + id);
      if (o.removing && o.scale < 0.02) { tagsLayer.remove(o.pivot); tags.delete(id); }
    });
    leaders.forEach((o, key) => {
      animateItem(o, dt, fling * 0.6, selectedKey === 'leader:' + o.id && !o.removing);
      if (o.halo) o.halo.material.opacity = 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(t * 1.6 + o.phase));
      if (o.removing && o.scale < 0.02) { disposeLeader(o); leaders.delete(key); }
    });

    // lights glow high and low, with a wave running up the garland
    for (let i = 0; i < bulbs.length; i++) {
      const b = bulbs[i];
      const f1 = 0.5 + 0.5 * Math.sin(t * b.speed + b.phase);
      const f2 = 0.5 + 0.5 * Math.sin(t * 2.4 - b.chase);
      const k = reduce ? 0.7 : Math.pow(0.55 * f1 + 0.45 * f2, 1.6);
      b.mat.opacity = 0.1 + 0.9 * k;
      const s = 0.2 + 0.85 * k;
      b.sp.scale.set(s, s, 1);
    }
    const pulse = reduce ? 0.6 : 0.5 + 0.5 * Math.sin(t * 1.3);
    warmA.intensity = 7 + 4 * pulse;
    warmB.intensity = 5 + 3 * (1 - pulse);
    starGlow.scale.setScalar(2.3 + 0.7 * pulse);
    starGlowMat.opacity = 0.65 + 0.35 * pulse;
    if (!reduce) star.rotation.y = 0.35 * Math.sin(t * 0.8);

    // snow
    if (SNOW) {
      const arr = snowGeo.attributes.position.array;
      for (let i = 0; i < SNOW; i++) {
        arr[i * 3 + 1] -= snowSpeed[i] * dt;
        arr[i * 3] += Math.sin(t * 0.6 + i) * 0.003;
        if (arr[i * 3 + 1] < -0.5) arr[i * 3 + 1] = 10;
      }
      snowGeo.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
  }
  frame();

  // Redraw the leaders' initials once the web fonts have loaded
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      leaders.forEach((o) => {
        if (o.removing || !o.faceMat) return;
        const old = o.faceMat.map;
        o.faceMat.map = toTex(drawLeader(o.initials));
        o.faceMat.needsUpdate = true;
        if (old) old.dispose();
      });
    });
  }

  return {
    is3D: true,
    setData,
    focus,
    spin,
    poke,
    setOnSelect(fn) { onSelect = fn; },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      renderer.dispose();
      if (canvasEl.parentNode) canvasEl.parentNode.removeChild(canvasEl);
    }
  };
}
