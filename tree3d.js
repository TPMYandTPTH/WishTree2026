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
// Three clean looks. Pick one with TREE_STYLE in config.js (or ?style= in the link to preview):
//   'tiers' = smooth layered branches, 'cone' = one smooth modern cone, 'light' = a tree made of light
const STYLES = ['tiers', 'cone', 'light'];
let STYLE = 'tiers';
const TIERS = [
  { y0: 1.0, h: 3.2, r: 3.0 },
  { y0: 2.5, h: 2.8, r: 2.35 },
  { y0: 3.8, h: 2.5, r: 1.8 },
  { y0: 5.0, h: 2.2, r: 1.3 },
  { y0: 6.1, h: 1.9, r: 0.85 }
];
const CONE = { y0: 1.0, top: 8.15, r: 2.85 };
const TAG = { w: 0.42, h: 0.56, d: 0.02, string: 0.12, tilt: 0.5 };
const TAG_Y = [1.75, 5.7];          // where employee tags can hang
const MAX_LEADERS = 6;
const BG = { cream: '#F6EEDC', red: '#AB2C37', gold: '#E3B45A' };
const FG = { cream: '#AB2C37', red: '#F6EEDC', gold: '#0E2A1F' };

function topY() { return STYLE === 'tiers' ? 8.0 : CONE.top; }

function surfaceR(y) {
  if (STYLE !== 'tiers') {
    if (y < CONE.y0 - 0.1 || y > CONE.top) return 0;
    return CONE.r * Math.min(1, (CONE.top - y) / (CONE.top - CONE.y0));
  }
  let r = 0;
  for (const t of TIERS) {
    if (y >= t.y0 - 0.12 && y <= t.y0 + t.h) {
      const s = Math.min(1, Math.max(0, 1 - (y - t.y0) / t.h));
      r = Math.max(r, t.r * Math.pow(s, 1.12));
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

// The little card that rises out of the hidden gift
function drawGiftCard() {
  const W = 256, H = 320;
  const cv = makeCanvas(W, H);
  const x = cv.getContext('2d');
  x.fillStyle = '#F6EEDC';
  x.fillRect(0, 0, W, H);
  x.strokeStyle = '#E3B45A';
  x.lineWidth = 10;
  x.strokeRect(14, 14, W - 28, H - 28);
  x.fillStyle = 'rgba(14,42,31,0.55)';
  x.beginPath(); x.arc(W / 2, 40, 9, 0, TAU); x.fill();
  x.save();
  x.translate(W / 2, 128);
  x.fillStyle = '#E3B45A';
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 22 : 52;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  x.closePath(); x.fill();
  x.restore();
  x.fillStyle = '#AB2C37';
  x.font = '700 30px "TP Sans","Noto Sans",system-ui,sans-serif';
  x.textAlign = 'center';
  x.fillText('A wish', W / 2, 232);
  x.fillText('for you', W / 2, 268);
  return cv;
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

function drawLeader(initials, photo) {
  const S = 256;
  const cv = makeCanvas(S, S);
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(S * 0.36, S * 0.32, S * 0.04, S / 2, S / 2, S * 0.52);
  g.addColorStop(0, '#FCE6A8');
  g.addColorStop(0.55, '#E3B45A');
  g.addColorStop(1, '#B4842F');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  if (photo) {
    // the leader's photo, cropped to a circle inside the gold rim
    const r = S / 2 - 16;
    const iw = photo.naturalWidth || photo.width, ih = photo.naturalHeight || photo.height;
    const k = Math.max((2 * r) / iw, (2 * r) / ih);
    x.save();
    x.beginPath(); x.arc(S / 2, S / 2, r, 0, TAU); x.clip();
    x.drawImage(photo, S / 2 - (iw * k) / 2, S / 2 - (ih * k) / 2, iw * k, ih * k);
    x.restore();
  }
  x.strokeStyle = '#F7DA8E';
  x.lineWidth = 10;
  x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 18, 0, TAU); x.stroke();
  if (!photo) {
    x.fillStyle = '#0E2A1F';
    x.font = '700 88px "TP Sans","Noto Sans",system-ui,sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(initials, S / 2, S / 2 + 2);
  }
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
// A smooth tier: a gently flared cone with a soft rounded rim, shaded darker at the bottom
function makeSmoothTier(r, h, flare) {
  const pts = [];
  pts.push(new THREE.Vector2(r * 0.5, -0.05));
  pts.push(new THREE.Vector2(r * 0.84, -0.12));
  pts.push(new THREE.Vector2(r * 0.96, -0.1));
  pts.push(new THREE.Vector2(r * 1.0, -0.035));
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const s = 1 - i / N;                       // 1 at the rim, 0 at the tip
    pts.push(new THREE.Vector2(Math.max(0.0005, r * Math.pow(s, flare)), h * (1 - s)));
  }
  const g = new THREE.LatheGeometry(pts, 96);
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const under = new THREE.Color('#0D3324');
  const low = new THREE.Color('#1A5539');
  const high = new THREE.Color('#2C7650');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < -0.02) tmp.copy(under);
    else tmp.copy(low).lerp(high, Math.min(1, Math.pow(y / h, 0.8)));
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
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
  let want = opts.style || '';
  try { want = new URLSearchParams(window.location.search).get('style') || want; } catch (e) { /* ignore */ }
  want = want || (C.cfg && C.cfg.TREE_STYLE) || 'tiers';
  STYLE = STYLES.indexOf(want) === -1 ? 'tiers' : want;
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

  // ground shadow, a simple planter and the trunk
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  world.add(shadow);
  const planter = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.62, 48), new THREE.MeshStandardMaterial({ color: 0xefe5cf, roughness: 0.55 }));
  planter.position.y = 0.31;
  world.add(planter);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 10, 64), new THREE.MeshStandardMaterial({ color: 0xe3b45a, metalness: 0.8, roughness: 0.3 }));
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.6;
  world.add(band);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.7, 16), new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.95 }));
  trunk.position.y = 0.95;
  world.add(trunk);

  // the tree itself
  const foliage = [];
  const foliageMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.02, side: THREE.DoubleSide });
  if (STYLE === 'tiers') {
    const fill = new THREE.Mesh(new THREE.ConeGeometry(2.2, 6.9, 32), new THREE.MeshStandardMaterial({ color: 0x0d3324, roughness: 1 }));
    fill.position.y = 1.05 + 3.45;
    world.add(fill);
    foliage.push(fill);
    TIERS.forEach((t) => {
      const m = new THREE.Mesh(makeSmoothTier(t.r, t.h, 1.12), foliageMat);
      m.position.y = t.y0;
      world.add(m);
      foliage.push(m);
    });
  } else if (STYLE === 'cone') {
    const m = new THREE.Mesh(makeSmoothTier(CONE.r, CONE.top - CONE.y0, 1.0), foliageMat);
    m.position.y = CONE.y0;
    world.add(m);
    foliage.push(m);
  } else {
    // a tree made of light: a dark core with strands of tiny lights spiralling round it
    const core = new THREE.Mesh(new THREE.ConeGeometry(CONE.r * 0.8, (CONE.top - CONE.y0) * 0.97, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x0c2c1f, roughness: 1, side: THREE.DoubleSide }));
    core.position.y = CONE.y0 + ((CONE.top - CONE.y0) * 0.97) / 2;
    world.add(core);
    foliage.push(core);
    const STRANDS = 9, PER = 150;
    const pts = new Float32Array(STRANDS * PER * 3);
    const cols = new Float32Array(STRANDS * PER * 3);
    const warm = [new THREE.Color('#FFF1C9'), new THREE.Color('#FFD98A'), new THREE.Color('#F2C766'), new THREE.Color('#7FD8A8')];
    const pr = C.random(9);
    let n = 0;
    for (let k = 0; k < STRANDS; k++) {
      for (let i = 0; i < PER; i++) {
        const sAlong = (i + pr() * 0.6) / PER;
        const y = CONE.y0 + 0.05 + sAlong * (CONE.top - CONE.y0 - 0.2);
        const th = sAlong * TAU * 1.6 + (k * TAU) / STRANDS;
        const R = surfaceR(y) * (0.9 + pr() * 0.12);
        pts[n * 3] = Math.cos(th) * R; pts[n * 3 + 1] = y; pts[n * 3 + 2] = Math.sin(th) * R;
        const c = warm[k % 3 === 2 && pr() < 0.25 ? 3 : Math.floor(pr() * 3)];
        cols[n * 3] = c.r; cols[n * 3 + 1] = c.g; cols[n * 3 + 2] = c.b;
        n++;
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    lg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    world.add(new THREE.Points(lg, new THREE.PointsMaterial({ size: 0.17, map: glowTex, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
  }

  // star on top: it stays facing you while the tree turns, with a gentle sway
  const starGroup = new THREE.Group();
  starGroup.position.y = topY() + 0.38;
  scene.add(starGroup);
  const star = new THREE.Mesh(makeStarGeometry(), new THREE.MeshStandardMaterial({ color: 0xf2c766, emissive: 0xf2b640, emissiveIntensity: 0.9, metalness: 0.55, roughness: 0.3 }));
  starGroup.add(star);
  const starGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd98a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const starGlow = new THREE.Sprite(starGlowMat);
  starGlow.scale.set(2.6, 2.6, 1);
  starGroup.add(starGlow);

  // the path the string of lights follows as it spirals up the tree
  const garlandPts = [];
  for (let i = 0; i <= 220; i++) {
    const s = i / 220;
    const y = 1.25 + s * (6.6 - 1.25);
    const th = s * 4.6 * TAU;
    const R = surfaceR(y) * 1.02 + 0.03;
    garlandPts.push(new THREE.Vector3(Math.cos(th) * R, y - 0.06 * Math.sin(s * 40), Math.sin(th) * R));
  }
  const garlandCurve = new THREE.CatmullRomCurve3(garlandPts);
  if (STYLE !== 'light') {
    // a fine gold wire for the lights
    world.add(new THREE.Mesh(new THREE.TubeGeometry(garlandCurve, 600, 0.008, 4, false), new THREE.MeshBasicMaterial({ color: 0xc9a36b })));
  }

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

  // spots tags must keep clear of (none for now: the tags are the decorations)
  const obstacles = [];

  /* gifts under the tree: they stay still while the tree turns */
  const ground = new THREE.Group();
  scene.add(ground);
  const giftMeshes = [];
  function ribbonBox(g, w, h, d, y0, boxMat, ribMat, tag) {
    const parts = [
      new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat),
      new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, h + 0.01, d * 0.18), ribMat),
      new THREE.Mesh(new THREE.BoxGeometry(w * 0.18, h + 0.012, d + 0.01), ribMat)
    ];
    parts.forEach((m) => { m.position.y = y0 + h / 2; m.userData = tag || {}; g.add(m); giftMeshes.push(m); });
  }
  function bow(g, y, ribMat, tag, size) {
    const k = size || 1;
    const bowGeo = new THREE.TorusGeometry(0.09 * k, 0.025 * k, 8, 18);
    const b1 = new THREE.Mesh(bowGeo, ribMat);
    b1.position.set(-0.07 * k, y + 0.05 * k, 0);
    b1.rotation.set(0, Math.PI / 2, Math.PI / 4);
    const b2 = b1.clone();
    b2.position.x = 0.07 * k;
    b2.rotation.z = -Math.PI / 4;
    [b1, b2].forEach((m) => { m.userData = tag || {}; g.add(m); giftMeshes.push(m); });
  }
  function gift(x, z, w, h, d, color, ribbon, rotY) {
    const g = new THREE.Group();
    const boxMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const ribMat = new THREE.MeshStandardMaterial({ color: ribbon, roughness: 0.4, metalness: 0.3 });
    ribbonBox(g, w, h, d, 0, boxMat, ribMat);
    bow(g, h, ribMat);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    ground.add(g);
  }
  gift(-1.55, 0.95, 0.6, 0.7, 0.6, 0xe3b45a, 0xab2c37, -0.3);
  gift(0.05, 1.8, 0.5, 0.42, 0.5, 0xf6eedc, 0xab2c37, 0.9);
  gift(-0.95, -1.45, 0.65, 0.5, 0.55, 0x1e573d, 0xe3b45a, 0.2);
  gift(1.75, -0.65, 0.5, 0.62, 0.5, 0xf6eedc, 0x1e573d, -0.6);
  gift(-1.95, -0.2, 0.45, 0.38, 0.45, 0xab2c37, 0xf6eedc, 0.7);

  // The hidden wish: the big red gift at the front opens when someone taps it
  const secret = (() => {
    if (!opts.secret) return null;
    const tag = { kind: 'secret', id: 'gift' };
    const W = 0.94, H = 0.7, D = 0.82, LID = 0.15;
    const g = new THREE.Group();
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xab2c37, roughness: 0.55 });
    const ribMat = new THREE.MeshStandardMaterial({ color: 0xe3b45a, roughness: 0.35, metalness: 0.45 });
    ribbonBox(g, W, H - LID, D, 0, boxMat, ribMat, tag);
    // warm light inside, seen when the lid opens
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.92, D * 0.92), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0 }));
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = H - LID + 0.002;
    g.add(inner);
    // the lid hinges at the back edge
    const lid = new THREE.Group();
    lid.position.set(0, H - LID, -D / 2 - 0.02);
    const lidInner = new THREE.Group();
    lidInner.position.set(0, 0, D / 2 + 0.02);
    lid.add(lidInner);
    ribbonBox(lidInner, W + 0.05, LID, D + 0.05, 0, boxMat, ribMat, tag);
    bow(lidInner, LID, ribMat, tag, 1.35);
    g.add(lid);
    // the card that rises out
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.8), new THREE.MeshStandardMaterial({ map: toTex(drawGiftCard()), roughness: 0.7, side: THREE.DoubleSide, emissive: 0x3a2a10, emissiveIntensity: 0.6 }));
    card.userData = tag;
    card.visible = false;
    g.add(card);
    giftMeshes.push(card);
    // glow and a rare little sparkle at the lid's edge (the only hint)
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd98a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    const glow = new THREE.Sprite(glowMat);
    glow.position.y = H + 0.2;
    glow.scale.set(2.4, 2.4, 1);
    g.add(glow);
    const sparkMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1c9, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    const spark = new THREE.Sprite(sparkMat);
    spark.position.set(W * 0.38, H - LID + 0.02, D * 0.42);
    spark.scale.set(0.34, 0.34, 1);
    g.add(spark);
    const light = new THREE.PointLight(0xffd98a, 0, 2.6, 2);
    light.position.set(0, H + 0.15, 0);
    g.add(light);
    g.position.set(1.5, 0, 1.62);
    g.rotation.y = 0.32;
    ground.add(g);
    return { g, lid, card, inner, glowMat, sparkMat, light, H, LID, open: 0, target: 0, wig: 0, wigVel: 0 };
  })();
  function nudgeGift(strength) {
    if (secret) secret.wigVel += (Math.random() < 0.5 ? -1 : 1) * strength;
  }


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
  // seconds of no interaction before the tree starts turning on its own
  const idleDelay = Number(opts.idleDelay) > 0 ? Number(opts.idleDelay) : 6;

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
    const photoUrl = C.safePhoto && C.safePhoto(L.photo_url);
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
    const o = {
      id, kind: 'leader', pivot, swing, card, mesh: disc, glow, halo, faceMat, initials, photo: null, th: spot.th,
      ang: 0, vel: 2, scale: 0, target: 1, removing: false,
      phase: (h % 628) / 100, freq: 0.6 + (h % 30) / 60, amp: 0.035
    };
    if (photoUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (o.removing) return;
        o.photo = img;
        const old = faceMat.map;
        faceMat.map = toTex(drawLeader(initials, img));
        faceMat.needsUpdate = true;
        if (old) old.dispose();
      };
      img.src = photoUrl;
    }
    return o;
  }

  function disposeLeader(o) {
    leadersLayer.remove(o.pivot);
    if (o.faceMat) { o.faceMat.map.dispose(); o.faceMat.dispose(); }
  }

  function setSelected(sel) {
    selectedKey = sel && sel.id != null ? sel.kind + ':' + String(sel.id) : null;
    if (secret) secret.target = selectedKey === 'secret:gift' ? 1 : 0;
    tags.forEach((o) => { o.glow.visible = selectedKey === 'wish:' + o.id; });
    leaders.forEach((o) => { o.glow.visible = selectedKey === 'leader:' + o.id; });
  }

  function setData(d) {
    // leaders in the crown
    const ls = (d.leaders || []).slice(0, MAX_LEADERS);
    const sig = ls.map((l) => l.id + ':' + C.initials(l.display_name) + ':' + (l.photo_url || '').length + (l.photo_url || '').slice(-24)).join('|');
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
    if (sel.kind === 'secret') { if (secret) secret.target = 1; return; }   // the gifts don't turn
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
    giftMeshes.forEach((m) => { if (m.visible) targets.push(m); });
    const hits = ray.intersectObjects(targets, false);
    if (!hits.length) return null;
    const u = hits[0].object.userData;
    return u && u.kind ? u : null;
  }

  function poke(kind, id, strength) {
    if (kind === 'secret') { nudgeGift((strength || 5) * 0.6); return; }
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
        if (hit.kind === 'secret' && secret) secret.target = 1;
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
      if (!reduce && t - lastInteract > idleDelay) {
        const ramp = Math.min(1, (t - lastInteract - idleDelay) / 2);
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

    // the hidden gift: wobbles when touched, opens to show its card, sparkles now and then
    if (secret) {
      const sg = secret;
      sg.open += (sg.target - sg.open) * Math.min(1, dt * (sg.target ? 3.2 : 5));
      sg.wigVel += (-55 * sg.wig - 5 * sg.wigVel) * dt;
      sg.wig += sg.wigVel * dt;
      const o = sg.open;
      const ease = 1 - Math.pow(1 - o, 3);
      sg.g.rotation.z = sg.wig * 0.06;
      sg.lid.rotation.x = -1.95 * ease - Math.abs(sg.wig) * 0.12;
      sg.card.visible = o > 0.03;
      // the card rises up and a little forward, tilted towards you
      sg.card.position.set(0, sg.H - sg.LID - 0.42 + 1.25 * ease, 0.34 * ease);
      sg.card.rotation.set(-0.2 * ease, reduce ? 0 : 0.16 * Math.sin(t * 1.1) * ease - 0.32 * ease, 0);
      sg.inner.material.opacity = 0.85 * o;
      sg.glowMat.opacity = 0.75 * o * (reduce ? 1 : 0.85 + 0.15 * Math.sin(t * 2.2));
      sg.light.intensity = 5 * o;
      const hintT = t % 9;
      sg.sparkMat.opacity = !reduce && o < 0.05 && hintT < 0.9 ? 0.9 * Math.sin((Math.PI * hintT) / 0.9) : 0;
    }

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
        o.faceMat.map = toTex(drawLeader(o.initials, o.photo));
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
