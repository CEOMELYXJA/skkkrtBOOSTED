import * as THREE from 'three';
import { buildReal } from './real.js';
import { createTraffic } from './traffic.js';
import { settings, shadowsOn } from './settings.js';
import { premium, groundPBR, snapShadowTarget, patchySnow } from './gfx.js';
import { brickTone, BRICK, roadDetail } from './gfx-math.js';
import { natureOn, natureSky, grassyGround } from './nature.js';

export const SIZE = 420, BLOCK = 52, ROAD = 9.2, LANE = 2.4, PARK = 54;
export const STREETS = [];
for (let a = -SIZE / 2 + BLOCK; a <= SIZE / 2 - BLOCK + 0.1; a += BLOCK) STREETS.push(a);
export const LANE_OFF = ROAD * 0.28;
export const OVAL = { rx: 46, rz: 38 };
export const SPAWN = { x: STREETS[3] + LANE_OFF, z: -140, yaw: Math.PI };   // yaw π : on avance vers +Z

/* ---------------------------------------------------------------- thèmes */
export const THEMES = {
  day: {
    name: 'Ville ensoleillée', exposure: 1.0,
    sky: [0x2f86d6, 0xbcdcf2, 0xa8c8a0], fog: 0xbcdcf2, fogNear: 90, fogFar: 430,
    hemi: [0xdbeeff, 0x9aa88a, 1.15], sun: { col: 0xfff4e0, int: 2.5, pos: [-70, 110, 50] }, fill: { col: 0xaec8ff, int: 0.35, pos: [60, 30, -50] },
    ground: 0x7dbb62, lawn: 0x93cf74, road: 0x4b4f58, walk: 0xcfc9bd, curb: 0xf0ece2, lane: 0x39c47a, laneEm: 0,
    bld: [0xe9e1d3, 0xd5dde8, 0xf0d9c2, 0xc9d8cf, 0xe3c7c0, 0xcfd3ea], roof: 0x555a63, roofUnit: 0x8a9099,
    glass: ['#5f89b2', '#86b0d6'], lit: ['#ffe9a8'], litP: 0.12, winEm: 0,
    shop: [0xd94f4f, 0x2f8f7a, 0xe0a030], shopEm: 0,
    leaf: 0x4caf50, trunk: 0x6b4b34, spruce: false, water: 0x4fb3e8, hill: 0x7aa86a,
    lamp: 0x2a2d33, lampHead: 0xfff1c0, lampEm: 0.25, bench: 0x7a5a3a,
    clouds: { col: 0xffffff, op: 0.92 }, stars: false, snow: false, trim: null,
    cyc: [0xff4d6d, 0x4da3ff, 0xffc14d, 0xb07cff, 0x3ecf7a, 0xff8a3d]
  },
  sunset: {
    name: 'Coucher de soleil', exposure: 1.05,
    sky: [0x2b2a6e, 0xf4a37a, 0xe08a60], fog: 0xf4a37a, fogNear: 70, fogFar: 380,
    hemi: [0xffc9a0, 0x6a4a5a, 1.0], sun: { col: 0xffa860, int: 2.6, pos: [-120, 36, 70] }, fill: { col: 0x8a7ad0, int: 0.5, pos: [60, 30, -50] },
    ground: 0x7d9a55, lawn: 0x8fae62, road: 0x4a4048, walk: 0xc0a898, curb: 0xe8d6c4, lane: 0x2fbf8a, laneEm: 0,
    bld: [0xd9a38c, 0xb8857a, 0xe3c0a0, 0x9a7a8c, 0xcf9a7a, 0xa88aa0], roof: 0x3d3540, roofUnit: 0x6c5a68,
    glass: ['#7a5a78', '#b07a8a'], lit: ['#ffd27a', '#ffb45a'], litP: 0.5, winEm: 0.45,
    shop: [0xd94f6a, 0xe0903a, 0x8f5fd0], shopEm: 0.25,
    leaf: 0x5f8f3f, trunk: 0x5a3f2e, spruce: false, water: 0xf2a37a, hill: 0x6a5a78,
    lamp: 0x2a2630, lampHead: 0xffd8a0, lampEm: 0.9, bench: 0x6a4a3a,
    clouds: { col: 0xffc8b0, op: 0.9 }, stars: false, snow: false, trim: null,
    cyc: [0xff4d6d, 0xffc14d, 0xb07cff, 0x4da3ff, 0xff8a3d, 0x3ecf7a]
  },
  neon: {
    name: 'Nuit néon', exposure: 1.3,
    sky: [0x05061a, 0x1d1046, 0x120a2e], fog: 0x1d1046, fogNear: 50, fogFar: 300,
    hemi: [0x8a9cff, 0x3a2a60, 1.2], sun: { col: 0xa8bcff, int: 1.4, pos: [40, 70, -50] }, fill: { col: 0xff4fd8, int: 0.5, pos: [-60, 20, 40] },
    ground: 0x1d3a4a, lawn: 0x1a5a56, road: 0x2a2d44, walk: 0x424a7a, curb: 0x8a90ff, lane: 0x00b8a0, laneEm: 0.9,
    bld: [0x2a2f5e, 0x3a2a63, 0x1f3a63, 0x4a2a5a, 0x23466a, 0x38306e], roof: 0x15162c, roofUnit: 0x3a3f66,
    glass: ['#1c2a5a', '#2a3a7a'], lit: ['#ff4fd8', '#00e5ff', '#ffe14d', '#7a5cff'], litP: 0.7, winEm: 1.3,
    shop: [0xff2fb0, 0x00e5ff, 0xffd400], shopEm: 1.6,
    leaf: 0x1f9f8a, trunk: 0x2a2038, spruce: false, water: 0x2a7aff, hill: 0x2a1a5a,
    lamp: 0x15162c, lampHead: 0x7ad7ff, lampEm: 2.5, bench: 0x3a3f66,
    clouds: null, stars: true, snow: false, trim: [0xff2fb0, 0x00e5ff],
    cyc: [0xff2fb0, 0x00e5ff, 0xffd400, 0x7a5cff, 0x3dff9a, 0xff6a3d]
  },
  winter: {
    name: 'Hiver québécois', exposure: 1.0,
    sky: [0x86a9d6, 0xe6eef8, 0xdfe8f2], fog: 0xe6eef8, fogNear: 50, fogFar: 300,
    hemi: [0xe8f2ff, 0xb8c4d6, 1.25], sun: { col: 0xffffff, int: 1.9, pos: [-60, 70, 40] }, fill: { col: 0xaec8ff, int: 0.4, pos: [60, 30, -50] },
    ground: 0xf1f6fb, lawn: 0xffffff, road: 0x5b616b, walk: 0xe3eaf2, curb: 0xcdd8e4, lane: 0x5fb8a0, laneEm: 0,
    bld: [0xb5785a, 0x8f9bb0, 0xc9b49a, 0x7e8fa6, 0xa86a50, 0xb9c2cf], roof: 0xf4f8fc, roofUnit: 0xc9d4e0,
    glass: ['#5a7a9a', '#8aaac8'], lit: ['#ffe2a0'], litP: 0.45, winEm: 0.35,
    shop: [0xc0392b, 0x2f6f8f, 0xd49a2a], shopEm: 0.15,
    leaf: 0x2f6b4a, trunk: 0x4a3426, spruce: true, water: 0xbfe3f2, hill: 0xf4f8fc,
    lamp: 0x2a2d33, lampHead: 0xfff1c0, lampEm: 0.8, bench: 0x6a5a4a,
    clouds: { col: 0xeef2f8, op: 0.85 }, stars: false, snow: true, trim: null,
    cyc: [0xff4d6d, 0x4da3ff, 0xffc14d, 0xb07cff, 0x3ecf7a, 0xff8a3d]
  }
};

/* ---------------------------------------------------------------- thèmes composés : SAISON × MOMENT × LUMIÈRE
   saison  : summer | winter | spring (neige par plaques) | autumn (feuilles rouges / jaunes / orangées qui tombent)
   moment  : day | dusk | night        lumière : normal (discrète) | neon (intérieurs, vitrines et lampadaires flamboyants) */
const NIGHT = { exposure: 1.2, sky: [0x040716, 0x0c1638, 0x0a1230], fog: 0x0c1638, fogNear: 45, fogFar: 280, hemi: [0x6272b8, 0x1a2140, 0.9], sun: { col: 0xaebfff, int: 1.0, pos: [40, 70, -50] }, fill: { col: 0x4a5ad0, int: 0.35, pos: [-60, 20, 40] }, clouds: null };
const LIGHT = {
  normal: { day: { litP: 0.12, winEm: 0, shopEm: 0, lampEm: 0.25, laneEm: 0 }, dusk: { litP: 0.4, winEm: 0.45, shopEm: 0.25, lampEm: 0.9, laneEm: 0.05 }, night: { litP: 0.5, winEm: 0.8, shopEm: 0.5, lampEm: 1.3, laneEm: 0.12 } },
  neon: { day: { litP: 0.7, winEm: 1.0, shopEm: 1.6, lampEm: 2.5, laneEm: 0.9 }, dusk: { litP: 0.85, winEm: 2.0, shopEm: 2.6, lampEm: 3.6, laneEm: 1.4 }, night: { litP: 0.92, winEm: 2.8, shopEm: 3.2, lampEm: 4.6, laneEm: 1.8 } }
};
const clone = o => JSON.parse(JSON.stringify(o));
export function composeTheme(season = 'summer', tod = 'day', glow = 'normal') {
  const key = 'c:' + season + ':' + tod + ':' + glow;
  if (THEMES[key]) return key;
  const T = clone(season === 'winter' ? THEMES.winter : THEMES.day);
  T.name = season + ' ' + tod + ' ' + glow;
  if (season === 'spring') Object.assign(T, { ground: 0x84a85f, lawn: 0x98bf6f, leaf: 0x7cc24f, water: 0x5cb8e6, hill: 0x84a85f, walk: 0xd6d3cc, road: 0x575c66, clouds: { col: 0xffffff, op: 0.8 }, patchy: 0.45, snow: false, spruce: false });
  if (season === 'autumn') Object.assign(T, { ground: 0x9c9a55, lawn: 0xa9a35c, leaf: 0xd9741e, leafPal: [0xd9531e, 0xe8a317, 0xc0392b, 0xf0c030, 0xb5651d, 0xcf6a1a], trunk: 0x5a4030, water: 0x4a8fb8, hill: 0x8a7a4a, sky: [0x3a78c0, 0xd6dde6, 0xb8c0a0], fog: 0xd6dde6, sun: { col: 0xffe3b8, int: 2.4, pos: [-70, 90, 50] }, leaves: true });
  // moment de la journée : ciel, brouillard, lumières
  if (tod !== 'day') {
    const L = tod === 'dusk' ? THEMES.sunset : (glow === 'neon' ? THEMES.neon : NIGHT);
    for (const k of ['exposure', 'sky', 'fog', 'fogNear', 'fogFar', 'hemi', 'sun', 'fill']) T[k] = clone(L[k]);
    T.clouds = L.clouds ? clone(L.clouds) : null; if (season === 'winter' && tod === 'night') T.clouds = null;
    T.stars = tod === 'night';
    if (season === 'winter') T.fog = tod === 'dusk' ? 0xe8b8a8 : T.fog;
  }
  // lumière : discrète ou néon
  const P = LIGHT[glow][tod];
  Object.assign(T, P);
  if (glow === 'neon') {
    T.lit = ['#ff4fd8', '#00e5ff', '#ffe14d', '#7a5cff', '#3dff9a']; T.shop = [0xff2fb0, 0x00e5ff, 0xffd400]; T.lampHead = 0x7ad7ff; T.trim = [0xff2fb0, 0x00e5ff];
    T.fill = { col: 0xff4fd8, int: tod === 'day' ? 0.35 : 0.6, pos: [-60, 20, 40] };
    if (tod !== 'day') T.bld = clone(THEMES.neon.bld);
  } else { T.lit = tod === 'day' ? ['#ffe9a8'] : ['#ffe9a8', '#ffd27a']; T.lampHead = tod === 'dusk' ? 0xffd8a0 : 0xfff1c0; }
  T.night = tod !== 'day';
  T.envI = { day: 0.55, dusk: 0.55, night: 0.7 }[tod]; T.glowEnv = glow === 'neon' ? (tod === 'day' ? 0.25 : 0.8) : (tod === 'dusk' ? 0.3 : 0);
  THEMES[key] = T; return key;
}

/* ---------------------------------------------------------------- outils */
const hex = n => '#' + n.toString(16).padStart(6, '0');
const rng = n => { n = Math.sin(n * 127.1) * 43758.5453; return n - Math.floor(n); };
const _o = new THREE.Object3D();
const _snap = new THREE.Vector3();
const ANI = () => +settings.aniso || 16;   // anisotropie demandée (three la limite à ce que le téléphone supporte)
const TRES = () => Math.min(8, +settings.texRes || 1);   // netteté des textures

/* bruit de valeur lisse (pour le relief) */
const hash2 = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, y, P = 0) => {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const w = P ? (n => ((n % P) + P) % P) : (n => n);
  const a = hash2(w(i), w(j)), b = hash2(w(i + 1), w(j)), c = hash2(w(i), w(j + 1)), d = hash2(w(i + 1), w(j + 1));
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x, y, oct = 5, P = 0) => {
  let s = 0, a = 0.5, f = 1, tot = 0;
  for (let o = 0; o < oct; o++) { s += a * vnoise(x * f, y * f, P ? P * f : 0); tot += a; f *= 2; a *= 0.5; }
  return s / tot;
};
// texture de détail (herbe / neige) sans couture : multiplie la couleur du sol pour casser l'aplat
function detailTex(S) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), P = 8;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm(x / S * P, y / S * P, 4, P);
    const grain = (hash2(x * 1.37 + 5, y * 2.11 + 9) - 0.5) * 0.05;
    const k = Math.min(1, 0.88 + 0.22 * n + grain);
    const v = Math.round(255 * k), o = (y * S + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANI();
  return t;
}
// petit disque doux (étoiles, flocons) : points ronds au lieu de carrés
function dotTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Batch {
  constructor(geo, mat) { this.geo = geo; this.mat = mat; this.m = []; this.c = []; }
  add(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, col = null) {
    _o.position.set(x, y, z); _o.rotation.set(0, ry, 0); _o.scale.set(sx, sy, sz); _o.updateMatrix();
    this.m.push(_o.matrix.clone()); this.c.push(col);
  }
  build(parent, { cast = false, receive = false } = {}) {
    if (!this.m.length) return null;
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.m.length);
    const tmp = new THREE.Color();
    this.m.forEach((mt, i) => {
      im.setMatrixAt(i, mt);
      if (this.c[i] != null) im.setColorAt(i, tmp.set(this.c[i]));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = cast; im.receiveShadow = receive;
    parent.add(im);
    return im;
  }
}

function layer(mat, factor) { mat.polygonOffset = true; mat.polygonOffsetFactor = factor; mat.polygonOffsetUnits = factor; return mat; }

function laneTex(th) {
  const TR = TRES(), c = document.createElement('canvas'); c.width = 128 * TR; c.height = 512 * TR;
  const g = c.getContext('2d'); g.scale(4 * TR, 4 * TR);
  g.fillStyle = hex(th.lane); g.fillRect(0, 0, 32, 128);
  g.fillStyle = '#f4f7fb';
  g.fillRect(0, 0, 2, 128); g.fillRect(30, 0, 2, 128);
  g.fillRect(14, 8, 4, 54);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANI();
  return t;
}
function bikeIconTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.scale(2, 2);
  g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.arc(38, 88, 18, 0, 7); g.stroke();
  g.beginPath(); g.arc(96, 88, 18, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(38, 88); g.lineTo(62, 52); g.lineTo(92, 52); g.lineTo(96, 88); g.moveTo(62, 52); g.lineTo(54, 34); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANI();
  return t;
}
function wallTex(wall, th, variant, emissive, tr = 1) {
  const c = document.createElement('canvas'); c.width = c.height = 512 * tr;
  const g = c.getContext('2d'); g.scale(4 * tr, 4 * tr);
  g.fillStyle = emissive ? '#000' : hex(wall); g.fillRect(0, 0, 128, 128);
  if (!emissive) { g.fillStyle = 'rgba(0,0,0,.06)'; for (let i = 0; i < 4; i++) g.fillRect(0, i * 32 + 29, 128, 3); }
  if (!emissive && natureOn()) {                                         // v9.25 : briques (joints clairs, briques de ton légèrement différent), alignées sur le relief
    for (let r = 0; r < 40; r++) { const off = (r % 2) * BRICK.W / 2; for (let q = 0; q <= BRICK.COLS; q++) {
      g.fillStyle = 'rgba(40,20,10,' + (0.03 + 0.13 * brickTone(q % BRICK.COLS, r)).toFixed(3) + ')'; g.fillRect(q * BRICK.W - off + 0.3, r * BRICK.H + 0.25, BRICK.W - 0.6, BRICK.H - 0.5); } }
  }
  for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) {
    const k = rng(variant * 97 + r * 13 + q * 7 + 3);
    const lit = k < th.litP;
    const x = q * 32 + 7, y = r * 32 + 6;
    if (emissive) {
      if (lit) { g.fillStyle = th.lit[Math.floor(rng(variant * 31 + r * 5 + q) * th.lit.length) % th.lit.length]; g.fillRect(x, y, 18, 20); }
    } else {
      if (lit) g.fillStyle = th.lit[Math.floor(rng(variant * 31 + r * 5 + q) * th.lit.length) % th.lit.length];
      else { const gr = g.createLinearGradient(0, y, 0, y + 20); gr.addColorStop(0, th.glass[1]); gr.addColorStop(1, th.glass[0]); g.fillStyle = gr; }
      g.fillRect(x, y, 18, 20);
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, 17, 19);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 1, y + 1, 5, 18);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANI();
  return t;
}
// asphalte : grain + traces de roues ; variantes : 'plain' (sans ligne) · 'dash' (ligne jaune pointillée) · 'double' (double ligne jaune + bords blancs)
// u (largeur) va de 0 à 1 ; v (longueur) : une répétition = 10 m
function roadTex(th, kind, tr = 1) {
  const k = Math.min(2, tr), Wd = 256 * k, Hh = 512 * k, c = document.createElement('canvas'); c.width = Wd; c.height = Hh;
  const g = c.getContext('2d'), img = g.createImageData(Wd, Hh), base = new THREE.Color(th.road), P = 8;
  const NATR = natureOn(), br = base.r, bg = base.g, bb = base.b, toS = v => Math.round(255 * Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2));
  for (let y = 0; y < Hh; y++) for (let x = 0; x < Wd; x++) {
    const u = x / Wd, n = fbm(x / Wd * P, y / Hh * P, 3, P), grain = (hash2(x * 1.7 + 3, y * 2.3 + 7) - 0.5) * 0.16;
    const wheel = 0.14 * (Math.exp(-(((u - 0.3) / 0.07) ** 2)) + Math.exp(-(((u - 0.7) / 0.07) ** 2)));
    let s = 0.86 + 0.3 * n + grain - wheel; const o = (y * Wd + x) * 4;
    if (NATR) { const rd = roadDetail(x / Wd, y / Hh); s += 0.07 * rd.patch - 0.22 * rd.crack + (hash2(x * 3.1 + 1, y * 1.7 + 4) > 0.985 ? 0.16 : 0) - 0.10 * Math.max(0, fbm(x / Wd * 5, y / Hh * 10, 3, 5) - 0.66) * Math.exp(-(((u - 0.5) / 0.12) ** 2)) * 6; }
    img.data[o] = toS(br * s); img.data[o + 1] = toS(bg * s); img.data[o + 2] = toS(bb * s); img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const ln = (col, x0, w, y0 = 0, hh = Hh) => { g.fillStyle = col; g.fillRect(Math.round(x0), y0, Math.max(1, Math.round(w)), hh); };
  if (kind === 'dash') ln('#e9b82b', Wd / 2 - 2.5 * k, 5 * k, Hh * 0.05, Hh * 0.45);
  if (kind === 'double') {
    ln('#e9b82b', Wd / 2 - 7 * k, 4.5 * k); ln('#e9b82b', Wd / 2 + 2.5 * k, 4.5 * k);
    ln('#e8eaee', Wd * 0.045, 4.5 * k); ln('#e8eaee', Wd * 0.955 - 4.5 * k, 4.5 * k);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANI();
  return t;
}
function bannerTex(th) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const g = c.getContext('2d'); g.scale(2, 2);
  const gr = g.createLinearGradient(0, 0, 512, 0); gr.addColorStop(0, '#10131c'); gr.addColorStop(1, '#1b2030');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#ff9f1c'; g.lineWidth = 6; g.strokeRect(5, 5, 502, 118);
  g.fillStyle = '#ff9f1c'; g.font = 'bold 70px Orbitron, Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('SKKKRT3D', 256, 56);
  g.fillStyle = '#e6ecf5'; g.font = '600 22px Inter, Arial, sans-serif';
  g.fillText('Scooter · piste cyclable →', 256, 104);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANI();
  return t;
}


function presetRoadTex(preset, tr = 1) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  if (preset === 'snow') {
    const gr = g.createLinearGradient(0, 0, 256, 512); gr.addColorStop(0, '#f4f8fa'); gr.addColorStop(0.55, '#dfe9ef'); gr.addColorStop(1, '#edf3f6');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 1800; i++) { const x = Math.random() * 256, y = Math.random() * 512, r = 0.3 + Math.random() * 1.6; g.fillStyle = Math.random() > 0.48 ? 'rgba(255,255,255,.35)' : 'rgba(112,142,164,.09)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,.24)'; g.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const y = i * 44 + Math.random() * 18; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(70, y - 8, 160, y + 8, 256, y - 2); g.stroke(); }
  } else if (preset === 'mountain') {
    g.fillStyle = '#756b5b'; g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 3600; i++) { const n = Math.floor(72 + Math.random() * 118); g.fillStyle = 'rgba(' + n + ',' + (n - 4) + ',' + (n - 12) + ',' + (0.08 + Math.random() * 0.28) + ')'; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 512, 0.6 + Math.random() * 2.5, 0.4 + Math.random() * 1.8, Math.random(), 0, Math.PI * 2); g.fill(); }
  } else if (preset === 'sky') {
    for (let y = 0; y < 512; y += 32) {
      const v = 82 + Math.floor(Math.random() * 36);
      g.fillStyle = 'rgb(' + (v + 54) + ',' + (v + 28) + ',' + (v + 5) + ')'; g.fillRect(0, y, 256, 32);
      g.fillStyle = 'rgba(48,25,12,.56)'; g.fillRect(0, y + 29, 256, 3);
      g.strokeStyle = 'rgba(255,220,166,.18)'; g.lineWidth = 1;
      for (let k = 0; k < 7; k++) { const x = Math.random() * 256; g.beginPath(); g.moveTo(x, y + 3); g.bezierCurveTo(x + 12, y + 9, x - 8, y + 20, x + 5, y + 28); g.stroke(); }
      for (const x of [16, 240]) { g.fillStyle = 'rgba(32,24,18,.75)'; g.beginPath(); g.arc(x, y + 15, 2.3, 0, Math.PI * 2); g.fill(); }
    }
  } else {
    g.fillStyle = '#858a8d'; g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 4200; i++) {
      const v = Math.floor(100 + Math.random() * 100); g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 2) + ',' + (0.06 + Math.random() * 0.2) + ')';
      g.fillRect(Math.random() * 256, Math.random() * 512, 0.5 + Math.random() * 2, 0.5 + Math.random() * 2);
    }
    g.strokeStyle = 'rgba(44,49,53,.28)'; g.lineWidth = 2;
    for (const y of [128, 384]) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANI();
  return t;
}
function graffitiTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#41474a'; g.fillRect(0, 0, 512, 128);
  g.filter = 'blur(1.5px)';
  const colors = ['#29aab3', '#e26650', '#d6b64d', '#8666a8', '#e8e3d2'];
  for (let i = 0; i < 30; i++) { g.strokeStyle = colors[i % colors.length]; g.globalAlpha = 0.35 + Math.random() * 0.38; g.lineWidth = 3 + Math.random() * 12; g.beginPath(); g.moveTo(Math.random() * 512, Math.random() * 128); g.bezierCurveTo(Math.random() * 512, Math.random() * 128, Math.random() * 512, Math.random() * 128, Math.random() * 512, Math.random() * 128); g.stroke(); }
  g.globalAlpha = 1; g.filter = 'none';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANI(); return t;
}
function addPresetDetails(group, preset, api, half) {
  const mat = (color, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide });
  const addBox = (x, y, z, sx, sy, sz, material, angle = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material); m.position.set(x, y, z); m.rotation.y = angle; m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
  };
  const groundY = (x, z) => api ? api.elev(x, z) : 0;
  const deckY = (x, z) => { const y = api && api.deckY(x, z); return y == null ? groundY(x, z) : y; };
  if (preset === 'skate') {
    const texture = presetRoadTex('skate'); texture.repeat.set(22, 22);
    const concrete = new THREE.MeshStandardMaterial({ color: 0xffffff, map: texture, roughness: 0.98, side: THREE.DoubleSide });
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(286, 286), concrete); slab.rotation.x = -Math.PI / 2; slab.position.set(0, groundY(0, 0) + 0.012, 0); slab.receiveShadow = true; group.add(slab);
    const curb = mat(0x9ca2a3, 0.98), rail = mat(0x7c8990, 0.32, 0.72), dark = mat(0x3b4144, 0.9), rampMat = mat(0x747c80, 0.86);
    for (const a of [-142, 142]) { addBox(0, 0.42, a, 284, 0.84, 0.7, curb); addBox(a, 0.42, 0, 0.7, 0.84, 284, curb); }
    const ramp = (x, z, width, length, height, angle = 0) => {
      const v = [-width/2,0,-length/2, width/2,0,-length/2, -width/2,height,length/2, width/2,height,length/2, -width/2,0,length/2, width/2,0,length/2];
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.setIndex([0,1,3,0,3,2,0,2,4,1,5,3,2,3,5,2,5,4,0,4,5,0,5,1]); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, rampMat); m.position.set(x, groundY(x, z) + 0.05, z); m.rotation.y = angle; m.castShadow = true; m.receiveShadow = true; group.add(m);
      addBox(x, groundY(x, z) + height + 0.09, z + Math.cos(angle) * length / 2, width, 0.12, 0.18, rail, angle);
    };
    ramp(-35, -32, 20, 18, 4.2, 0.18); ramp(38, 20, 18, 15, 3.4, Math.PI * 0.55); ramp(-14, 52, 22, 20, 5.5, Math.PI * 0.48); ramp(66, -47, 14, 14, 2.8, -0.38);
    const grind = (x, z, len, angle, h = 0.75) => {
      const y = groundY(x, z);
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = angle; group.add(g);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, len, 10), rail); bar.rotation.z = Math.PI / 2; bar.position.y = h; g.add(bar);
      for (const sx of [-len * 0.38, len * 0.38]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, h, 8), rail); leg.position.set(sx, h / 2, 0); g.add(leg); }
    };
    grind(4, -24, 24, 0.2); grind(-59, 12, 22, 1.02); grind(41, 59, 20, -0.45);
    for (let i = 0; i < 5; i++) addBox(-73 + i * 3.3, groundY(-60, 45) + 0.18 + i * 0.16, 45, 3.2, 0.32, 6, dark);
    const wall = addBox(0, 2.5, -140.4, 94, 5, 0.5, dark);
    const muralMat = new THREE.MeshStandardMaterial({ map: graffitiTexture(), roughness: 1, side: THREE.DoubleSide });
    const mural = new THREE.Mesh(new THREE.PlaneGeometry(86, 3.2), muralMat); mural.position.set(0, 2.5, -140.12); group.add(mural);
    wall.castShadow = true;

    // Usines désaffectées au-delà des bordures : les rampes et le tracé du skatepark restent intacts.
    const concreteWall = mat(0x62696b, 0.98), roofRust = mat(0x584d46, 0.94), rust = mat(0x754b36, 0.92), glass = mat(0x202b30, 0.5, 0.18), soot = mat(0x343b3e, 0.96);
    const warehouse = (x, z, w, d, h) => {
      const y = groundY(x, z);
      addBox(x, y + h / 2, z, w, h, d, concreteWall);
      addBox(x, y + h + 0.35, z, w + 1.2, 0.7, d + 1.2, roofRust);
      for (let k = 0; k < 6; k++) {
        const rx = x - w * 0.42 + k * w * 0.168;
        addBox(rx, y + h + 1.05 + (k % 2) * 0.45, z, Math.max(2, w * 0.12), 1.1, d * 0.94, k % 3 ? roofRust : rust);
      }
      const columns = Math.max(2, Math.floor(w / 10));
      for (const side of [-1, 1]) for (let k = 0; k < columns; k++) {
        const wx = x - w * 0.42 + k * w * 0.84 / Math.max(1, columns - 1);
        const wy = y + h * (k % 3 === 0 ? 0.66 : 0.48);
        addBox(wx, wy, z + side * (d / 2 + 0.08), 2.1, 1.35, 0.12, glass);
        if (k % 2 === 0) addBox(wx + 1.15, wy - 2.5, z + side * (d / 2 + 0.12), 0.45, 3.0, 0.14, rust);
      }
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.8, 7 + h * 0.12, 10), soot);
      chimney.position.set(x + w * 0.34, y + h + 4 + h * 0.06, z - d * 0.2); chimney.castShadow = true; group.add(chimney);
      addBox(x - w * 0.22, y + h * 0.28, z + d / 2 + 0.1, w * 0.22, 0.45, 0.14, rust);
    };
    warehouse(0, -166, 104, 22, 19);
    warehouse(-38, 166, 82, 22, 16);
    warehouse(166, 12, 22, 78, 23);
    warehouse(-166, -14, 22, 70, 18);
  }
  if (preset === 'f1') {
    const start = [0, -205], next = [92, -196], dx = next[0] - start[0], dz = next[1] - start[1], len = Math.hypot(dx, dz) || 1;
    const tx = dx / len, tz = dz / len, nx = -tz, nz = tx, y = groundY(start[0], start[1]) + 0.11;
    const black = mat(0x15191d, 0.8), white = mat(0xf3f2ed, 0.8);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) {
      const x = start[0] + nx * (i - 3.5) + tx * (j - 0.5), z = start[1] + nz * (i - 3.5) + tz * (j - 0.5);
      addBox(x, y, z, 0.98, 0.06, 0.98, (i + j) % 2 ? white : black);
    }
    const stand = mat(0x39434b, 0.8), seats = mat(0x69737a, 0.62, 0.16);
    for (const side of [-1, 1]) {
      const z0 = side < 0 ? -255 : 255;
      for (let row = 0; row < 4; row++) addBox(0, 1.6 + row * 1.05, z0 + side * row * 3.4, 350 - row * 12, 1, 13, row % 2 ? seats : stand);
    }
    const crowdGeo = new THREE.SphereGeometry(0.34, 7, 6), crowdColors = [0xf0d5aa,0x3d7594,0xb94643,0xe0b843,0xd8dfe4,0x625a86,0x439276];
    const crowdMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, 480), dummy = new THREE.Object3D(); let n = 0;
    for (const side of [-1, 1]) for (let row = 0; row < 4; row++) for (let i = 0; i < 60; i++) {
      dummy.position.set(-165 + i * 5.55, 3.8 + row * 1.05, (side < 0 ? -238 : 238) + side * row * 3.4); dummy.scale.setScalar(0.82 + Math.random() * 0.48); dummy.updateMatrix();
      crowd.setMatrixAt(n, dummy.matrix); crowd.setColorAt(n, new THREE.Color(crowdColors[Math.floor(Math.random() * crowdColors.length)])); n++;
    }
    crowd.count = n; crowd.instanceMatrix.needsUpdate = true; crowd.instanceColor.needsUpdate = true; group.add(crowd);
    const nx2 = -tz, nz2 = tx, support = mat(0x48565f, 0.38, 0.55), lights = mat(0xdde8f1, 0.3, 0.5);
    for (const side of [-1, 1]) { const x = start[0] + nx2 * side * 8.5, z = start[1] + nz2 * side * 8.5; addBox(x, y + 2.5, z, 0.45, 5, 0.45, support); }
    addBox(start[0], y + 5, start[1], 18, 0.55, 0.75, support, Math.atan2(-nz2, nx2));
    for (let i = 0; i < 8; i++) addBox(start[0] - 3.5 + i, y + 4.72, start[1], 0.5, 0.2, 0.24, lights);
  }
  if (preset === 'sky') {
    const path = [[0,0],[48,-16],[82,-72],[132,-102],[192,-84],[224,-28],[210,38],[162,78],[106,50],[55,83],[0,52],[-40,12],[-28,-44],[24,-84],[76,-72],[0,0]];
    const poleMat = mat(0x694126, 0.92), ropeMat = mat(0x4b3426, 0.96), barrelMat = mat(0xc76025, 0.84), bandMat = mat(0x282d31, 0.48, 0.45);
    const rails = [[], []];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len, steps = Math.max(1, Math.ceil(len / 18));
      for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
        const side = sideIndex === 0 ? -1 : 1;
        for (let k = 0; k <= steps; k++) {
          if (i && k === 0) continue;
          const t = k / steps, cx = a[0] + dx * t, cz = a[1] + dz * t, x = cx + nx * side * 3.6, z = cz + nz * side * 3.6, deck = deckY(cx, cz);
          addBox(x, deck + 0.78, z, 0.16, 1.55, 0.16, poleMat);
          rails[sideIndex].push([x, deck + 1.35, z]);
        }
      }
    }
    const rope = (a, b) => {
      const A = new THREE.Vector3(a[0], a[1], a[2]), B = new THREE.Vector3(b[0], b[1], b[2]), curve = new THREE.QuadraticBezierCurve3(A, A.clone().lerp(B, 0.5).add(new THREE.Vector3(0, -0.28, 0)), B);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.045, 5, false), ropeMat); group.add(m);
    };
    for (const side of rails) { for (let i = 0; i < side.length - 1; i++) rope(side[i], side[i + 1]); if (side.length > 2) rope(side[side.length - 1], side[0]); }
    for (const [x, z] of [[58,-42],[204,10],[-8,43],[152,65]]) {
      const y = deckY(x,z) + 0.12, barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.52, 1.05, 12), barrelMat); barrel.position.set(x,y + 0.53,z); barrel.castShadow = true; group.add(barrel);
      for (const yy of [0.27,0.76]) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.49,0.055,8,18), bandMat); band.rotation.x = Math.PI / 2; band.position.set(x,y + yy,z); group.add(band); }
    }
    for (const [x,z] of [[-145,-28],[247,86],[-92,116],[104,-139]]) {
      const support = groundY(x,z), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.68,Math.max(1,54-support),8), poleMat); pole.position.set(x,support + Math.max(1,54-support)/2,z); pole.castShadow = true; group.add(pole);
    }
  }
}
function skyMesh(th) {
  const sp = new THREE.Vector3(...th.sun.pos).normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(th.sky[0]) }, mid: { value: new THREE.Color(th.sky[1]) }, bot: { value: new THREE.Color(th.sky[2]) },
      sunDir: { value: sp }, sunCol: { value: new THREE.Color(th.sun.col) }
    },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.5)) : mix(mid, bot, pow(-h, 0.6));
        float s = max(dot(d, sunDir), 0.0);
        c += sunCol * (pow(s, 900.0) * 3.0 + pow(s, 14.0) * 0.28);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
      }`
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(600, 64, 64), mat);
  m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

function makeCyclist(color) {                       // v9.26 : cycliste habillé tout en noir (la couleur de l'ancien maillot n'est plus utilisée), bras beige moins jaune
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.6 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.75 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xdcb9a4, roughness: 0.7 });        // beige moins jaune (plus neutre / rosé)
  const wg = new THREE.CylinderGeometry(0.34, 0.34, 0.06, 64); wg.rotateZ(Math.PI / 2);
  for (const z of [-0.55, 0.55]) { const w = new THREE.Mesh(wg, dark); w.position.set(0, 0.34, z); g.add(w); }
  const fr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.1), dark); fr.position.set(0, 0.55, 0); g.add(fr);
  const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), dark); st.position.set(0, 0.7, -0.5); g.add(st);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.45, 20, 40), shirt); torso.position.set(0, 1.18, 0.05); torso.rotation.x = 0.5; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 50, 35), skin); head.position.set(0, 1.58, -0.15); g.add(head);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.15, 50, 35, 0, Math.PI * 2, 0, Math.PI * 0.6), shirt); helm.position.set(0, 1.6, -0.15); g.add(helm);
  const limb = (a, b, r, m) => {                    // un membre : capsule entre deux points
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.02, L - 2 * r), 8, 14), m);
    mesh.position.copy(A).add(B).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); mesh.castShadow = true; g.add(mesh);
  };
  for (const sx of [-1, 1]) {
    limb([sx * 0.2, 1.36, -0.02], [sx * 0.2, 1.1, -0.28], 0.05, shirt);     // haut du bras (manche noire)
    limb([sx * 0.2, 1.1, -0.28], [sx * 0.14, 0.92, -0.5], 0.04, skin);      // avant-bras nu jusqu'au guidon
    limb([sx * 0.1, 0.98, 0.1], [sx * 0.12, 0.7, -0.12], 0.07, shirt);      // cuisse (noire)
    limb([sx * 0.12, 0.7, -0.12], [sx * 0.12, 0.42, 0.02], 0.055, shirt);   // mollet (noir)
  }
  return g;
}

/* ------------------------------------------------------ pistes (pour HUD) */
export function onLane(x, z) {
  const half = SIZE / 2;
  if (Math.abs(x) > half || Math.abs(z) > half) return false;
  for (const a of STREETS) {
    if (Math.abs(x - (a + LANE_OFF)) < LANE / 2 + 0.4) return true;
    if (Math.abs(z - (a + LANE_OFF)) < LANE / 2 + 0.4) return true;
  }
  const r = Math.hypot(x / OVAL.rx, z / OVAL.rz);
  if (Math.abs(r - 1) < 0.1) return true;
  if (Math.abs(x) < PARK && Math.abs(z) < PARK) {
    if (Math.abs(x - z) / Math.SQRT2 < 1.4 || Math.abs(x + z) / Math.SQRT2 < 1.4) return true;
  }
  return false;
}

/* ================================================================ monde */
export function createWorld(scene, id, quality = 'med', real = null) {
  const th = THEMES[id] || THEMES.day;
  const scenicMountains = !!(real && real.synthetic && real.preset === 'mountain');
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shadows = shadowsOn(quality);

  scene.background = new THREE.Color(th.fog);
  scene.fog = new THREE.Fog(th.fog, th.fogNear, scenicMountains ? Math.max(th.fogFar, 950) : th.fogFar);

  /* ---- matériaux */
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const GS = real ? 7000 : 1400;
  const gTex = detailTex((quality === 'low' ? 256 : 512) * Math.min(4, TRES())); gTex.repeat.set(GS / 14, GS / 14);
  const lTex = gTex.clone(); lTex.needsUpdate = true; lTex.repeat.set(PARK * 2 / 14, PARK * 2 / 14);
  const groundMat = std({ color: th.ground, roughness: 1, map: gTex });
  if (th.patchy) patchySnow(groundMat, th.patchy);                 // printemps : neige par plaques
  if (natureOn() && !th.snow) grassyGround(groundMat, th);          // v9.25 : plaques sèches / grasses, brins fins de près
  if (premium()) try {                                                  // relief fin et rugosité variable du sol (herbe / neige)
    const gp = groundPBR(); gp.normal.repeat.copy(gTex.repeat); gp.rough.repeat.copy(gTex.repeat);
    groundMat.normalMap = gp.normal; groundMat.roughnessMap = gp.rough; groundMat.normalScale.set(0.7, 0.7);
  } catch (e) { console.warn('Sol Premium indisponible :', e); }
  const lawnMat = layer(std({ color: th.lawn, roughness: 1, map: lTex }), -1);
  const roadMat = layer(std({ color: th.road, roughness: 0.92 }), -2);
  const walkMat = std({ color: th.walk, roughness: 1 });
  const curbMat = std({ color: th.curb, roughness: 0.7 });
  const lt = laneTex(th);
  const laneMat = layer(std({ map: lt, roughness: 0.85, emissive: th.laneEm ? 0xffffff : 0x000000, emissiveMap: th.laneEm ? lt : null, emissiveIntensity: th.laneEm }), -3);
  const iconTex = bikeIconTex();
  const iconMat = layer(new THREE.MeshBasicMaterial({ map: iconTex, transparent: true, depthWrite: false, fog: true }), -5);
  const crossMat = layer(std({ color: 0xf4f7fb, roughness: 0.9, emissive: th.laneEm ? 0x888899 : 0x000000, emissiveIntensity: th.laneEm ? 0.5 : 0 }), -4);

  /* ---- sol
     (grand plan pour que l'horizon n'ait pas de bord visible) */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GS, GS), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  if (real && real.H) ground.position.y = (real.Hmin != null ? real.Hmin : 0) - 4;     // relief : le grand plan passe sous tout le terrain
  group.add(ground);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(PARK * 2, PARK * 2), lawnMat);
  lawn.rotation.x = -Math.PI / 2; lawn.position.y = 0.01; lawn.receiveShadow = true;
  if (!real) group.add(lawn);

  if (!real) {
    /* ---- rues, trottoirs, bordures, passages piétons, pistes */
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const roads = new Batch(unit, roadMat), walks = new Batch(unit, walkMat), curbs = new Batch(unit, curbMat), zebra = new Batch(unit, crossMat);
    const L = SIZE / 2, H = ROAD / 2;
    const cuts = [-L, ...STREETS.flatMap(s => [s - H, s + H]), L];
    for (const a of STREETS) {
      roads.add(a, 0.02, 0, ROAD, 0.04, SIZE);
      roads.add(0, 0.02, a, SIZE, 0.04, ROAD);
      for (let i = 0; i < cuts.length; i += 2) {                 // segments entre intersections
        const s0 = cuts[i], s1 = cuts[i + 1], len = s1 - s0, mid = (s0 + s1) / 2;
        if (len < 0.5) continue;
        for (const sd of [-1, 1]) {
          const off = sd * (H + 1.1);
          walks.add(a + off, 0.06, mid, 2.2, 0.12, len);
          walks.add(mid, 0.06, a + off, len, 0.12, 2.2);
          curbs.add(a + sd * (H + 0.06), 0.065, mid, 0.14, 0.13, len);
          curbs.add(mid, 0.065, a + sd * (H + 0.06), len, 0.13, 0.14);
        }
      }
      // passages piétons autour de chaque intersection
      for (const b of STREETS) for (const sd of [-1, 1]) {
        const d = H + 1.6;
        for (let k = -3; k <= 3; k++) {
          zebra.add(a + k * 1.2, 0.045, b + sd * d, 0.55, 0.02, 2.2);   // traverse la rue verticale
          zebra.add(a + sd * d, 0.045, b + k * 1.2, 2.2, 0.02, 0.55);   // traverse la rue horizontale
        }
      }
    }
    roads.build(group, { receive: true }); walks.build(group, { receive: true }); curbs.build(group, { receive: true }); zebra.build(group, { receive: true });

    // pistes cyclables (bandes + oval + diagonales du parc)
    const strip = (cx, cz, len, rot) => {
      const g = new THREE.PlaneGeometry(LANE, len);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / 8);
      g.rotateX(-Math.PI / 2); g.rotateY(rot); g.translate(cx, 0.05, cz);
      const m = new THREE.Mesh(g, laneMat); m.receiveShadow = true; group.add(m);
    };
    const icons = new Batch(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), iconMat);
    for (const a of STREETS) {
      strip(a + LANE_OFF, 0, SIZE, 0);
      strip(0, a + LANE_OFF, SIZE, Math.PI / 2);
      for (let s = -L + 14; s < L; s += 30) {
        icons.add(a + LANE_OFF, 0.075, s, 1, 1, 1, 0);
        icons.add(s + 15, 0.075, a + LANE_OFF, 1, 1, 1, Math.PI / 2);
      }
    }
    const dl = PARK * 2 * Math.SQRT2;
    strip(0, 0, dl, Math.PI / 4); strip(0, 0, dl, -Math.PI / 4);
    for (let s = -PARK * 1.2; s < PARK * 1.2; s += 22) {
      icons.add(s / Math.SQRT2, 0.075, s / Math.SQRT2, 1, 1, 1, Math.PI / 4);
      icons.add(s / Math.SQRT2, 0.075, -s / Math.SQRT2, 1, 1, 1, -Math.PI / 4);
    }
    icons.build(group);

    // ruban de l'oval
    {
      const N = 120, pos = [], uvs = [], idx = []; let acc = 0, prev = null;
      for (let i = 0; i <= N; i++) {
        const t = i / N * Math.PI * 2;
        const x = Math.cos(t) * OVAL.rx, z = Math.sin(t) * OVAL.rz;
        const tx = -Math.sin(t) * OVAL.rx, tz = Math.cos(t) * OVAL.rz, tl = Math.hypot(tx, tz);
        const nx = -tz / tl, nz = tx / tl;
        if (prev) acc += Math.hypot(x - prev[0], z - prev[1]);
        prev = [x, z];
        pos.push(x + nx * LANE / 2, 0.052, z + nz * LANE / 2, x - nx * LANE / 2, 0.052, z - nz * LANE / 2);
        uvs.push(0, acc / 8, 1, acc / 8);
        if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, laneMat); m.receiveShadow = true;
      // les normales peuvent pointer vers le bas selon le sens : on force le double-face
      laneMat.side = THREE.DoubleSide;
      group.add(m);
    }

    /* ---- étang */
    {
      const shore = new THREE.Mesh(new THREE.CircleGeometry(1, 96), layer(std({ color: th.curb, roughness: 1 }), -2));
      shore.rotation.x = -Math.PI / 2; shore.scale.set(9.2, 6.2, 1); shore.position.set(22, 0.02, 22); group.add(shore);
      const water = new THREE.Mesh(new THREE.CircleGeometry(1, 96), layer(std({ color: th.water, roughness: 0.12, metalness: 0.35 }), -3));
      water.rotation.x = -Math.PI / 2; water.scale.set(8, 5, 1); water.position.set(22, 0.03, 22); group.add(water);
    }

    /* ---- bâtiments */
    const matCache = new Map();
    const bMat = (ci, v) => {
      const key = ci + '_' + v;
      if (!matCache.has(key)) {
        matCache.set(key, std({
          map: wallTex(th.bld[ci], th, v, false), roughness: 0.78,
          emissive: th.winEm ? 0xffffff : 0x000000, emissiveMap: th.winEm ? wallTex(th.bld[ci], th, v, true) : null, emissiveIntensity: th.winEm
        }));
      }
      return matCache.get(key);
    };
    const TW = 12, TH = 13.2;
    const bGeo = (w, h, d) => {
      const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
      for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
        const k = f * 4 + i; let u = uv.getX(k), v = uv.getY(k);
        if (f < 2) { u *= d / TW; v *= h / TH; } else if (f >= 4) { u *= w / TW; v *= h / TH; } else { u = 0.02; v = 0.02; }
        uv.setXY(k, u, v);
      }
      return g;
    };
    const roofB = new Batch(unit, std({ color: th.roof, roughness: 0.9 }));
    const unitB = new Batch(unit, std({ color: th.roofUnit, roughness: 0.8 }));
    const shopB = th.shop.map(c => new Batch(unit, std({ color: c, roughness: 0.6, emissive: c, emissiveIntensity: th.shopEm })));
    const trimB = th.trim ? th.trim.map(c => new Batch(unit, std({ color: 0x000000, emissive: c, emissiveIntensity: 2.4 }))) : null;
    let k = 1;
    for (const gx of STREETS) for (const gz of STREETS) {
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const lx = gx + sx * BLOCK * 0.31, lz = gz + sz * BLOCK * 0.31;
        if (Math.abs(lx) < PARK + 4 && Math.abs(lz) < PARK + 4) continue;
        k++;
        const w = 8 + rng(k) * 5.4, d = 8 + rng(k + 3) * 5.4, h = 8 + Math.pow(rng(k + 7), 1.7) * 36;
        const ci = k % th.bld.length, v = Math.floor(rng(k + 5) * 3);
        const m = new THREE.Mesh(bGeo(w, h, d), bMat(ci, v));
        m.position.set(lx, h / 2, lz); m.castShadow = shadows; m.receiveShadow = true;
        group.add(m);
        colliders.push({ x: lx, z: lz, hx: w / 2 + 0.5, hz: d / 2 + 0.5 });
        roofB.add(lx, h + 0.2, lz, w + 0.5, 0.4, d + 0.5);
        if (rng(k + 9) > 0.45) unitB.add(lx + (rng(k + 2) - 0.5) * w * 0.4, h + 0.4 + 0.6, lz + (rng(k + 4) - 0.5) * d * 0.4, 1.8, 1.2, 1.8);
        shopB[Math.floor(rng(k + 12) * shopB.length)].add(lx, 1.6, lz, w + 0.14, 3.2, d + 0.14);
        if (trimB) trimB[k % 2].add(lx, h + 0.46, lz, w + 0.7, 0.14, d + 0.7);
      }
    }
    roofB.build(group, { cast: shadows }); unitB.build(group, { cast: shadows });
    shopB.forEach(b => b.build(group)); if (trimB) trimB.forEach(b => b.build(group));

    /* ---- arbres */
    const trunkB = new Batch(new THREE.CylinderGeometry(0.17, 0.27, 2.4, 30), std({ color: th.trunk, roughness: 1 }));
    const leafGeo = th.spruce ? new THREE.ConeGeometry(1.5, 3.4, 20, 2) : new THREE.IcosahedronGeometry(1.7, 3);
    const leafB = new Batch(leafGeo, std({ color: 0xffffff, roughness: 0.9, flatShading: th.spruce }));
    const leafB2 = th.spruce ? new Batch(new THREE.ConeGeometry(1.05, 2.6, 20, 2), leafB.mat) : null;
    const tcol = new THREE.Color();
    const addTree = (x, z, i) => {
      const s = 0.85 + rng(i + 1) * 0.6;
      tcol.set(th.leaf).offsetHSL((rng(i + 3) - 0.5) * 0.04, 0, (rng(i + 5) - 0.5) * 0.1);
      const c = tcol.getHex();
      trunkB.add(x, 1.2 * s, z, s, s, s);
      if (th.spruce) {
        const sn = new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.35).getHex();
        leafB.add(x, 3.6 * s, z, s, s, s, 0, sn);
        leafB2.add(x, 5.4 * s, z, s, s, s, 0, sn);
      } else leafB.add(x, 3.9 * s, z, s * 1.05, s * 0.95, s * 1.05, rng(i) * 6, c);
    };
    let ti = 0;
    for (const a of STREETS) for (let s = -L + 10; s < L; s += 18) {
      if (STREETS.some(b => Math.abs(s - b) < 11)) continue;
      addTree(a + H + 1.1, s + (a % 7), ti++);
      addTree(a - H - 1.1, s + 9, ti++);
    }
    for (let i = 0; i < 200; i++) {                                    // arbres du parc
      const x = (rng(i + 40) - 0.5) * PARK * 1.9, z = (rng(i + 90) - 0.5) * PARK * 1.9;
      if (STREETS.some(b => Math.abs(x - b) < 7 || Math.abs(z - b) < 7)) continue;
      const r = Math.hypot(x / OVAL.rx, z / OVAL.rz);
      if (Math.abs(r - 1) < 0.16) continue;
      if (Math.abs(x - z) < 3 || Math.abs(x + z) < 3) continue;
      if (Math.hypot((x - 22) / 10, (z - 22) / 7) < 1) continue;
      addTree(x, z, ti++);
    }
    trunkB.build(group, { cast: shadows }); leafB.build(group, { cast: shadows }); if (leafB2) leafB2.build(group, { cast: shadows });

    /* ---- lampadaires, bancs */
    const poleB = new Batch(new THREE.CylinderGeometry(0.07, 0.1, 5.4, 35), std({ color: th.lamp, roughness: 0.5, metalness: 0.4 }));
    const bulbB = new Batch(new THREE.SphereGeometry(0.24, 50, 35), std({ color: 0x222222, emissive: th.lampHead, emissiveIntensity: th.lampEm }));
    for (const a of STREETS) for (let s = -L + 20; s < L; s += 30) {
      if (STREETS.some(b => Math.abs(s - b) < 9)) continue;
      const x = a + (Math.round(s / 30) % 2 ? 1 : -1) * (H + 1.9);
      poleB.add(x, 2.7, s); bulbB.add(x, 5.45, s);
    }
    poleB.build(group, { cast: shadows }); bulbB.build(group);
    const benchSeat = new Batch(unit, std({ color: th.bench, roughness: 0.8 })), benchBack = new Batch(unit, benchSeat.mat);
    for (let i = 0; i < 12; i++) {
      const t = i / 12 * Math.PI * 2 + 0.26, bx = Math.cos(t) * (OVAL.rx - 4), bz = Math.sin(t) * (OVAL.rz - 4);
      if (STREETS.some(b => Math.abs(bx - b) < 7 || Math.abs(bz - b) < 7)) continue;
      if (Math.hypot((bx - 22) / 12, (bz - 22) / 9) < 1) continue;
      const ry = -t - Math.PI / 2;
      benchSeat.add(bx, 0.45, bz, 1.7, 0.1, 0.5, ry);
      benchBack.add(bx + Math.cos(t) * 0.22, 0.85, bz + Math.sin(t) * 0.22, 1.7, 0.4, 0.08, ry);
    }
    benchSeat.build(group, { cast: shadows }); benchBack.build(group, { cast: shadows });

    /* ---- arche de départ */
    {
      const px = SPAWN.x, pz = SPAWN.z + 12, ar = std({ color: th.lamp, roughness: 0.5, metalness: 0.5 });
      for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7, 0.35), ar); p.position.set(px + sx * 6.2, 3.5, pz); p.castShadow = shadows; group.add(p); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(13, 0.4, 0.4), ar); beam.position.set(px, 7, pz); group.add(beam);
      const bn = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: bannerTex(th) }));
      bn.position.set(px, 5.4, pz); bn.rotation.y = Math.PI; group.add(bn);
    }

  }

  /* ---- collines à l'horizon (ville fixe d'origine ou ville imaginaire aléatoire) */
  if (!real || real.synthetic) {
  /* ---- collines à l'horizon : relief continu (maillage fin, ombrage lisse, couleur par altitude) */
  {
    const vistaPreset = real && real.synthetic ? real.preset : null;
    const R0 = real && real.synthetic ? real.half * (vistaPreset === 'mountain' ? 1.02 : vistaPreset === 'skate' ? 1.16 : 1.3) : 290, R1 = R0 + (vistaPreset === 'mountain' ? 720 : 500);
    const NA = quality === 'low' ? 180 : quality === 'med' ? 320 : quality === 'high' ? 480 : 800;     // segments autour
    const NR = quality === 'low' ? 36 : quality === 'med' ? 64 : quality === 'high' ? 96 : 160;        // segments en profondeur
    const pos = [], col = [], idx = [];
    const base = new THREE.Color(th.hill), c = new THREE.Color();
    const hFn = (x, z, r) => {
      const ramp = Math.min(1, Math.max(0, (r - R0) / 110)); const sm = ramp * ramp * (3 - 2 * ramp);
      const big = fbm(x * 0.0055 + 3.1, z * 0.0055 - 1.7, 5);
      const ridge = 1 - Math.abs(fbm(x * 0.011 - 8.3, z * 0.011 + 4.2, 4) * 2 - 1);   // crêtes
      if (vistaPreset === 'mountain') return sm * (34 + 230 * Math.pow(big, 1.35) + 105 * ridge * ridge);
      if (vistaPreset === 'skate') return sm * (2 + 3 * big * big + 1.5 * ridge * ridge);
      return sm * (18 + 105 * Math.pow(big, 1.5) + 34 * ridge * ridge);
    };
    for (let ir = 0; ir <= NR; ir++) {
      const t = ir / NR, r = R0 + (R1 - R0) * Math.pow(t, 1.45);
      for (let ia = 0; ia <= NA; ia++) {
        const a = ia / NA * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
        const h = hFn(x, z, r);
        pos.push(x, h - 1.2, z);
        const n = fbm(x * 0.03 + 11, z * 0.03 + 5, 4) - 0.5;          // texture de couleur fine
        c.copy(base).offsetHSL(0, 0, n * 0.12 + (h / 150 - 0.35) * 0.1);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let ir = 0; ir < NR; ir++) for (let ia = 0; ia < NA; ia++) {
      const p0 = ir * (NA + 1) + ia, p1 = p0 + 1, p2 = p0 + NA + 1, p3 = p2 + 1;
      idx.push(p0, p1, p2, p1, p3, p2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, std({ color: 0xffffff, vertexColors: true, roughness: 1 }));
    m.frustumCulled = false; group.add(m);
  }
  }

  /* ---- carte réelle (OpenStreetMap) : bâtiments, routes, eau, arbres construits par morceaux */
  let realApi = null;
  const customRoadTex = real && real.synthetic && ['snow', 'skate', 'mountain', 'sky'].includes(real.preset) ? (theme, kind, tr) => presetRoadTex(real.preset, tr) : roadTex;
  if (real) realApi = buildReal(group, th, quality, real, { wallTex, laneTex, roadTex: customRoadTex, layer, groundMat, GS });
  if (real && real.synthetic) addPresetDetails(group, real.preset, realApi, real.half);
  const tr = realApi && !(real && real.synthetic && real.preset !== 'city') ? createTraffic(group, real, th, quality, makeCyclist, th.night != null ? th.night : (id === 'neon' || id === 'sunset'), realApi.deckY) : null;   // piétons, voitures, cyclistes

  /* ---- ciel, nuages, étoiles, neige */
  const sky = natureOn() ? natureSky(th) : skyMesh(th); group.add(sky);
  const clouds = [];
  if (th.clouds && quality !== 'low') {
    const cg = new THREE.SphereGeometry(1, 64, 45);
    const cm = new THREE.MeshBasicMaterial({ color: th.clouds.col, transparent: true, opacity: th.clouds.op, fog: false, depthWrite: false });
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(rng(i) * 3);
      for (let j = 0; j < n; j++) {
        const s = new THREE.Mesh(cg, cm);
        s.position.set((j - n / 2) * 11 + rng(i + j) * 4, rng(i * 3 + j) * 4, rng(i + j * 5) * 8);
        s.scale.set(14 + rng(i + j + 1) * 8, 6 + rng(j + 2) * 3, 10 + rng(i + 2) * 4);
        c.add(s);
      }
      const a = rng(i + 70) * Math.PI * 2, r = 120 + rng(i + 31) * 280;
      c.position.set(Math.cos(a) * r, 85 + rng(i + 13) * 50, Math.sin(a) * r);
      c.renderOrder = -5; group.add(c); clouds.push(c);
    }
  }
  let stars = null;
  if (th.stars) {
    const p = []; for (let i = 0; i < 900; i++) {
      const a = rng(i) * Math.PI * 2, e = Math.acos(1 - rng(i + 500) * 0.95), r = 520;
      p.push(Math.sin(e) * Math.cos(a) * r, Math.cos(e) * r, Math.sin(e) * Math.sin(a) * r);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 3, map: dotTex(), alphaTest: 0.02, sizeAttenuation: false, color: 0xffffff, fog: false, transparent: true, opacity: 0.9, depthWrite: false }));
    stars.frustumCulled = false; group.add(stars);
  }
  let snow = null, snowP = null, snowV = null;
  const SN = th.snow ? ({ low: 650, med: 1300, high: 2500, ultra: 3800 })[quality] : 0;
  if (SN) {
    snowP = new Float32Array(SN * 3); snowV = new Float32Array(SN * 2);
    for (let i = 0; i < SN; i++) {
      snowP[i * 3] = (Math.random() - 0.5) * 60; snowP[i * 3 + 1] = Math.random() * 38; snowP[i * 3 + 2] = (Math.random() - 0.5) * 60;
      snowV[i * 2] = 1.2 + Math.random() * 1.6; snowV[i * 2 + 1] = Math.random() * 6.28;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(snowP, 3));
    snow = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.36, map: dotTex(), alphaTest: 0.02, transparent: true, opacity: 0.94, depthWrite: false }));
    snow.frustumCulled = false; group.add(snow);
  }

  let leaf = null, leafP = null, leafV = null;
  const LN = th.leaves ? ({ low: 0, med: 240, high: 480, ultra: 800 })[quality] : 0;
  if (LN) {                                                          // automne : feuilles rouges, jaunes et orangées qui tombent en tournoyant
    leafP = new Float32Array(LN * 3); leafV = new Float32Array(LN * 2); const lc = new Float32Array(LN * 3), cc = new THREE.Color();
    for (let i = 0; i < LN; i++) {
      leafP[i * 3] = (Math.random() - 0.5) * 60; leafP[i * 3 + 1] = Math.random() * 22; leafP[i * 3 + 2] = (Math.random() - 0.5) * 60;
      leafV[i * 2] = 0.7 + Math.random() * 0.9; leafV[i * 2 + 1] = Math.random() * 6.28;
      cc.set(th.leafPal[i % th.leafPal.length]); lc[i * 3] = cc.r; lc[i * 3 + 1] = cc.g; lc[i * 3 + 2] = cc.b;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(leafP, 3)); g.setAttribute('color', new THREE.BufferAttribute(lc, 3));
    leaf = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.34, map: dotTex(), vertexColors: true, alphaTest: 0.02, transparent: true, opacity: 0.95, depthWrite: false }));
    leaf.frustumCulled = false; group.add(leaf);
  }

  /* ---- lumières */
  const hemi = new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2] * (premium() ? 0.7 : 1)); group.add(hemi);   // Premium : une part de l'éclairage ambiant vient maintenant du ciel (lumière d'environnement)
  const sun = new THREE.DirectionalLight(th.sun.col, th.sun.int);
  const sunOff = new THREE.Vector3(...th.sun.pos).normalize().multiplyScalar(150);
  sun.castShadow = shadows;
  if (shadows) {
    const sz = +settings.shadowQ || (quality === 'ultra' ? 4096 : quality === 'high' ? 4096 : 2048), sd = +settings.shadowDist || 48;
    sun.shadow.mapSize.set(sz, sz);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -sd; sc.right = sc.top = sd; sc.near = 20; sc.far = 330;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
  }
  group.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(th.fill.col, th.fill.int); fill.position.set(...th.fill.pos); group.add(fill);

  /* ---- cyclistes (percutables) : 6 sur l'ovale du parc + 6 qui font le tour d'un îlot sur les pistes */
  const cyclists = [];
  if (!real) th.cyc.forEach((c, i) => {
    const g = makeCyclist(c); group.add(g);
    cyclists.push({ kind: 'oval', g, t: i / th.cyc.length, sp: 0.013 + i * 0.0016, lat: (i % 2 ? 0.5 : -0.5), x: 0, z: 0, yaw: 0, down: 0, side: 1, first: true });
  });
  if (!real) [[1, 1, 1], [4, 1, -1], [2, 3, 1], [4, 4, -1], [1, 4, 1], [5, 2, -1]].forEach(([ci, cj, dir], i) => {
    const g = makeCyclist(th.cyc[(i + 2) % th.cyc.length]); group.add(g);
    const x0 = STREETS[ci] + LANE_OFF, x1 = STREETS[ci + 1] + LANE_OFF, z0 = STREETS[cj] + LANE_OFF, z1 = STREETS[cj + 1] + LANE_OFF;
    const W = x1 - x0, Hh = z1 - z0, P = 2 * (W + Hh);
    cyclists.push({ kind: 'loop', g, x0, x1, z0, z1, W, Hh, P, dir, s: rng(i + 60) * P, v: 3.4 + (i % 3) * 0.6, x: 0, z: 0, yaw: 0, down: 0, side: 1, first: true });
  });
  let traffic = true;

  // position sur le tour d'un îlot (sens horaire), abscisse curviligne s
  const loopAt = (c, s) => {
    const { x0, x1, z0, z1, W, Hh } = c;
    if (s < W) return [x0 + s, z0, 1, 0];
    if (s < W + Hh) return [x1, z0 + (s - W), 0, 1];
    if (s < 2 * W + Hh) return [x1 - (s - W - Hh), z1, -1, 0];
    return [x0, z1 - (s - 2 * W - Hh), 0, -1];
  };
  const DOWN_TIME = 3.2;

  function tick(dt, px, pz, cam) {
    sky.position.copy(cam.position);
    if (stars) stars.position.copy(cam.position);
    const gy = realApi && realApi.hasRelief ? realApi.elev(px, pz) : 0;                    // altitude du joueur (relief)
    if (shadows && premium()) {                                                       // ombres aimantées aux pixels de la carte : plus de grouillement quand on roule
      snapShadowTarget(_snap, px, gy, pz, sunOff, +settings.shadowDist || 48, sun.shadow.mapSize.x);
      sun.position.copy(_snap).add(sunOff); sun.target.position.copy(_snap); sun.target.updateMatrixWorld();
    } else {
      sun.position.set(px + sunOff.x, sunOff.y + gy, pz + sunOff.z);
      sun.target.position.set(px, gy, pz); sun.target.updateMatrixWorld();
    }
    if (shadows) { const sd = +settings.shadowDist || 48, sc = sun.shadow.camera; if (sc.right !== sd) { sc.left = sc.bottom = -sd; sc.right = sc.top = sd; sc.updateProjectionMatrix(); } }
    if (snow) snow.position.y = cam && cam.position ? cam.position.y - 14 : gy;
    if (leaf) leaf.position.y = gy;
    for (const c of clouds) { if (c.userData.y0 == null) c.userData.y0 = c.position.y; c.position.y = c.userData.y0 + gy; }
    if (realApi) {                                              // carte réelle : les nuages suivent le joueur
      realApi.tick(dt, px, pz);
      if (tr) tr.update(dt, px, pz);
      for (const c of clouds) {
        c.position.x += dt * 1.6;
        if (c.position.x - px > 420) c.position.x -= 840; else if (c.position.x - px < -420) c.position.x += 840;
        if (c.position.z - pz > 420) c.position.z -= 840; else if (c.position.z - pz < -420) c.position.z += 840;
      }
    } else for (const c of clouds) { c.position.x += dt * 1.6; if (c.position.x > 420) c.position.x = -420; }
    if (snow) {
      for (let i = 0; i < SN; i++) {
        let x = snowP[i * 3], y = snowP[i * 3 + 1], z = snowP[i * 3 + 2];
        y -= snowV[i * 2] * dt; snowV[i * 2 + 1] += dt;
        x += Math.sin(snowV[i * 2 + 1] * 1.3) * dt * 0.6; z += Math.cos(snowV[i * 2 + 1]) * dt * 0.4;
        if (y < -8) y = 34 + Math.random() * 12;
        let dx = x - px, dz = z - pz;
        if (dx > 30) x -= 60; else if (dx < -30) x += 60;
        if (dz > 30) z -= 60; else if (dz < -30) z += 60;
        snowP[i * 3] = x; snowP[i * 3 + 1] = y; snowP[i * 3 + 2] = z;
      }
      snow.geometry.attributes.position.needsUpdate = true;
    }
    if (leaf) {
      for (let i = 0; i < LN; i++) {
        let x = leafP[i * 3], y = leafP[i * 3 + 1], z = leafP[i * 3 + 2];
        y -= leafV[i * 2] * dt; leafV[i * 2 + 1] += dt;
        x += Math.sin(leafV[i * 2 + 1] * 1.7) * dt * 1.5; z += Math.cos(leafV[i * 2 + 1] * 1.1) * dt * 1.1;
        if (y < 0) y += 22;
        let dx = x - px, dz = z - pz;
        if (dx > 30) x -= 60; else if (dx < -30) x += 60;
        if (dz > 30) z -= 60; else if (dz < -30) z += 60;
        leafP[i * 3] = x; leafP[i * 3 + 1] = y; leafP[i * 3 + 2] = z;
      }
      leaf.geometry.attributes.position.needsUpdate = true;
    }
    for (const c of cyclists) {
      c.g.visible = traffic;
      if (!traffic) continue;
      const fallen = c.down > 0;
      if (fallen) c.down = Math.max(0, c.down - dt);
      let dx, dz;
      if (c.kind === 'oval') {
        if (!fallen) c.t = (c.t + c.sp * dt) % 1;
        const a = c.t * Math.PI * 2;
        const tx = -Math.sin(a) * OVAL.rx, tz = Math.cos(a) * OVAL.rz, tl = Math.hypot(tx, tz);
        c.x = Math.cos(a) * OVAL.rx + (-tz / tl) * c.lat; c.z = Math.sin(a) * OVAL.rz + (tx / tl) * c.lat;
        dx = tx / tl; dz = tz / tl;
      } else {
        if (!fallen) c.s = (c.s + c.v * dt) % c.P;
        const u = c.dir > 0 ? c.s : (c.P - c.s) % c.P;
        const r = loopAt(c, u);
        c.x = r[0]; c.z = r[1]; dx = r[2] * c.dir; dz = r[3] * c.dir;
      }
      const ty = Math.atan2(dx, dz);
      if (c.first) { c.yaw = ty; c.first = false; }
      else { let d = ty - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * Math.min(1, dt * 8); }
      c.g.rotation.y = c.yaw;
      // chute : se couche sur le côté, reste au sol un moment, puis se relève
      let p = 0;
      if (fallen) {
        const e = DOWN_TIME - c.down, sm = x => x * x * (3 - 2 * x);
        p = e < 0.25 ? sm(e / 0.25) : c.down > 0.7 ? 1 : sm(Math.max(0, c.down / 0.7));
      }
      c.g.rotation.z = c.side * p * 1.45;
      c.g.position.set(c.x, 0.05 + p * 0.12, c.z);
    }
  }

  // un cycliste (debout) touché par le point (x, z) dans un rayon r ?
  function hitCyclist(x, z, r) {
    if (!traffic) return null;
    for (const c of cyclists) if (c.down <= 0 && Math.hypot(c.x - x, c.z - z) < r) return c;
    return null;
  }
  // fait tomber le cycliste, à l'opposé de la direction (dx, dz) d'où vient le choc
  function knock(c, dx, dz) {
    c.down = DOWN_TIME;
    c.side = -Math.sign(Math.cos(c.yaw) * dx - Math.sin(c.yaw) * dz) || 1;
  }

  // piéton, voiture ou cycliste (debout) touché par le point (x, z) ?  -> { type: 'ped'|'car'|'cyc', ref }
  function hitMobile(x, z, y = null) {
    const cy = hitCyclist(x, z, 1.05); if (cy) return { type: 'cyc', ref: cy, old: true };
    const a = tr && tr.hit(x, z, 0.55, y); return a ? { type: a.type, ref: a } : null;
  }
  function mobileGap(x, z) {                                       // distance libre autour d'un point (circulation + cyclistes de la ville imaginaire)
    let m = tr ? tr.gap(x, z) : 1e9;
    for (const c of cyclists) { if (c.down > 0) continue; const d = Math.hypot(x - c.x, z - c.z) - 1.0; if (d < m) m = d; }
    return m;
  }
  function knockMobile(m, dx, dz) { if (m.old) knock(m.ref, dx, dz); else tr.knock(m.ref, dx, dz); }

  function dispose() {
    tr && tr.dispose();
    realApi && realApi.dispose();
    scene.remove(group);
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        ['map', 'emissiveMap'].forEach(k => m[k] && m[k].dispose());
        m.dispose();
      });
      if (o.isInstancedMesh) o.dispose();
    });
    scene.fog = null;
  }

  return {
    id, theme: th, group, colliders, size: real ? real.half * 2 : SIZE, spawn: realApi ? realApi.spawn : SPAWN, tick, dispose, cyclists, hitCyclist, knock,
    real: !!realApi, api: realApi, preset: real && real.synthetic ? real.preset : null,
    setTraffic: v => { traffic = v; tr && tr.setVisible(v); },
    hitMobile, knockMobile, mobileGap, traffic: tr,
    night: th.night != null ? th.night : (id === 'neon' || id === 'sunset')
  };
}
