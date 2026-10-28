// v9.25 — « Nature » : gazon en brins, arbres à cartes de feuillage, sol herbeux, béton, ciel et brume.
// Tout est calculé sur place (aucun fichier à télécharger). Dépend du rendu Premium ; interrupteur : ⚙ → Résolution & performance → « Nature réaliste ».
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { settings } from './settings.js';
import { premium } from './gfx.js';

const FORCE = (() => { try { return new URLSearchParams(location.search).get('nature'); } catch { return null; } })();
export const natureOn = () => FORCE === 'off' ? false : premium() && settings.nature !== false;
const LV = q => ({ low: 0, med: 1, high: 2, ultra: 3 })[q] ?? 1;                      // niveau de qualité 0..3
const hash = n => { n = Math.sin(n) * 43758.5453; return n - Math.floor(n); };

/* ------------------------------------------------------------ outils de matériaux (on enchaîne les onBeforeCompile, sans écraser ceux d'avant : neige par plaques, etc.) */
function chain(mat, fn, key) {
  const prev = mat.onBeforeCompile, own = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey'), pk = own ? mat.customProgramCacheKey() : '';
  mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); fn(sh); };
  mat.customProgramCacheKey = () => pk + '|' + key;
  mat.needsUpdate = true;
}
const GLSL_NOISE = `
float nh21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nvn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(nh21(i), nh21(i + vec2(1.0, 0.0)), f.x), mix(nh21(i + vec2(0.0, 1.0)), nh21(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
const SNOW = c => `{ float m = nvn(vWg.xz * 0.03) * 0.55 + nvn(vWg.xz * 0.09) * 0.3 + nvn(vWg.xz * 0.35) * 0.15; float s = smoothstep(${(1 - c - 0.04).toFixed(3)}, ${(1 - c + 0.04).toFixed(3)}, m); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.99), s); }`;

// temps / vent partagés par tous les matériaux animés
const WIND = { uT: { value: 0 }, uWind: { value: 1 } };
let _t = 0;
export function natureTime(dt) { _t += dt; WIND.uT.value = _t; }

/* ------------------------------------------------------------ sol herbeux : plaques sèches / grasses, brins fins de près (herbe, parcs, bois) */
export function grassyGround(mat, th, far = false) {
  const dry = th.leafPal ? 0.95 : th.patchy ? 0.45 : 0.4;
  chain(mat, sh => {
    sh.vertexShader = 'varying vec3 vWg;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWg = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vWg;\n' + GLSL_NOISE + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { vec2 p = vWg.xz; float dist = distance(vWg, cameraPosition); float fd = 1.0 - smoothstep(18.0, ${far ? '60.0' : '85.0'}, dist);
        float big = nvn(p * 0.035) * 0.6 + nvn(p * 0.11) * 0.4, mid = nvn(p * 0.45), fine = nvn(p * 3.1), blade = nvn(vec2(p.x * 11.0, p.y * 2.4)) * 0.5 + nvn(vec2(p.x * 2.4, p.y * 11.0)) * 0.5;
        vec3 lush = vec3(0.84, 1.07, 0.80), dryc = vec3(1.22, 1.05, 0.60);
        vec3 tone = mix(lush, dryc, smoothstep(0.42, 0.78, big) * ${dry.toFixed(2)});
        float lum = 0.80 + 0.30 * mid + fd * (0.20 * (fine - 0.5) + 0.22 * (blade - 0.5));
        diffuseColor.rgb *= tone * lum; }`);
  }, 'gg' + (far ? 'f' : 'n') + dry);
}

/* ------------------------------------------------------------ béton (trottoirs, bordures, tabliers) : grain fin, taches, fissures légères */
export function concreteGrain(mat) {
  chain(mat, sh => {
    sh.vertexShader = 'varying vec3 vWg;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWg = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vWg;\n' + GLSL_NOISE + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { vec2 p = vWg.xz; float fd = 1.0 - smoothstep(14.0, 70.0, distance(vWg, cameraPosition));
        float sp = nh21(floor(p * 46.0)), st = nvn(p * 0.6) * 0.6 + nvn(p * 2.3) * 0.4;
        float cr = 1.0 - smoothstep(0.0, 0.02, abs(nvn(p * 1.7) - 0.5));
        diffuseColor.rgb *= 0.90 + 0.20 * st + fd * (0.10 * (sp - 0.5)) - 0.10 * cr * fd; }`);
  }, 'conc');
}

/* ------------------------------------------------------------ feuillage : cartes de feuilles (texture générée par le code) */
const texCache = new Map();
export function leafTexture(spruce, lv) {
  const S = lv >= 2 ? 512 : 256, key = (spruce ? 's' : 'b') + S;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), k = S / 256;
  g.scale(k, k);
  g.fillStyle = 'rgb(165,165,165)'; g.fillRect(0, 0, 12, 12);                           // coin plein : sert de « cœur » opaque du feuillage
  let seed = spruce ? 11 : 5; const r = () => hash(seed++);
  if (!spruce) {
    const L = [];
    for (let i = 0; i < 120; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * 108; L.push({ x: 128 + Math.cos(a) * d, y: 128 + Math.sin(a) * d, rot: r() * 6.283, len: 22 + r() * 14, wid: 8 + r() * 6 }); }
    L.sort((p, q) => p.y - q.y);                                                         // le haut d'abord (fond), le bas devant : relief de lumière
    for (const l of L) {
      const top = 1 - l.y / 256, gv = Math.round(Math.min(255, 150 + 90 * top + (r() - 0.5) * 50));
      g.save(); g.translate(l.x, l.y); g.rotate(l.rot);
      g.fillStyle = `rgb(${gv},${Math.min(255, gv + 4)},${Math.round(gv * 0.92)})`;
      g.beginPath(); g.moveTo(0, -l.len / 2); g.quadraticCurveTo(l.wid, -l.len * 0.12, 0, l.len / 2); g.quadraticCurveTo(-l.wid, -l.len * 0.12, 0, -l.len / 2); g.fill();
      g.strokeStyle = `rgba(70,70,70,0.55)`; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -l.len / 2); g.lineTo(0, l.len / 2); g.stroke();
      g.restore();
    }
  } else {
    g.lineCap = 'round';
    g.strokeStyle = 'rgb(95,95,95)'; g.lineWidth = 5; g.beginPath(); g.moveTo(128, 252); g.lineTo(128, 8); g.stroke();
    for (let i = 0; i < 150; i++) {
      const t = i / 150, y = 250 - t * 236, len = 82 * (1 - 0.72 * t) + 6;
      for (const s of [-1, 1]) for (let j = 0; j < 3; j++) {
        const ang = (s * (58 - 30 * t) + (r() - 0.5) * 22) * Math.PI / 180, l = len * (0.7 + r() * 0.5), gv = Math.round(130 + 120 * (1 - t * 0.4) * (0.55 + 0.45 * r()));
        g.strokeStyle = `rgb(${gv},${gv},${Math.round(gv * 0.93)})`; g.lineWidth = 3.4 - 1.4 * t;
        g.beginPath(); g.moveTo(128, y); g.lineTo(128 + Math.sin(ang) * l, y - Math.cos(ang) * l * 0.55); g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  texCache.set(key, t); return t;
}

function card(P, N, U, C, K, ctr, R, Up, hw, hh, nrm, base, ao0, ao1, rnd) {
  const cs = [[-1, -1, 0.06, 0.06], [1, -1, 0.94, 0.06], [1, 1, 0.94, 0.94], [-1, 1, 0.06, 0.94]];
  const v = cs.map(([a, b, u, w]) => ({
    p: [ctr[0] + R[0] * hw * a + Up[0] * hh * b, ctr[1] + R[1] * hw * a + Up[1] * hh * b, ctr[2] + R[2] * hw * a + Up[2] * hh * b], u, w, ao: ao0 + (ao1 - ao0) * (b * 0.5 + 0.5)
  }));
  for (const i of [0, 1, 2, 0, 2, 3]) {
    const q = v[i]; P.push(...q.p); N.push(...nrm); U.push(q.u, q.w);
    C.push(base[0] * q.ao, base[1] * q.ao, base[2] * q.ao); K.push(1, ...ctr);
  }
}
const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// un cœur plein (lobes / cônes sombres) pour qu'on ne voie jamais à travers le feuillage ; uv = coin plein de la texture
function core(geo, y0, y1, bright) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, n = p.count, uv = new Float32Array(n * 2), col = new Float32Array(n * 3), kk = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = 0.02; uv[i * 2 + 1] = 0.98;
    const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0))), k = (0.42 + 0.34 * t) * bright;
    col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k;
    kk[i * 4] = 0; kk[i * 4 + 1] = p.getX(i); kk[i * 4 + 2] = p.getY(i); kk[i * 4 + 3] = p.getZ(i);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', p.clone()); out.setAttribute('normal', g.attributes.normal.clone());
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aK', new THREE.BufferAttribute(new Float32Array(Array.from({ length: n }, (_, i) => kk[i * 4])), 1));
  out.setAttribute('aC', new THREE.BufferAttribute(new Float32Array(Array.from({ length: n * 3 }, (_, i) => kk[Math.floor(i / 3) * 4 + 1 + (i % 3)])), 3));
  return out;
}

export function treeFoliage(spruce, lv) {
  const parts = [], rnd = (i, s) => hash(i * 12.9898 + s * 78.233 + (spruce ? 3 : 1));
  const P = [], N = [], U = [], C = [], K = [];
  if (!spruce) {
    const lobes = [[0, 3.6, 0, 1.65], [0.95, 3.1, 0.35, 1.15], [-0.85, 3.0, -0.55, 1.2]], per = [8, 5, 5].map(v => Math.round(v * [0.6, 0.85, 1.1, 1.4][lv]));
    lobes.forEach(([cx, cy, cz, rad], li) => {
      const M = per[li];
      for (let i = 0; i < M; i++) {
        const yy = 0.85 - 1.45 * ((i + 0.5) / M), ph = i * 2.39996 + li * 1.3, rr = Math.sqrt(Math.max(0, 1 - yy * yy));
        const dir = [rr * Math.cos(ph), yy, rr * Math.sin(ph)], ctr = [cx + dir[0] * rad * 0.8, cy + dir[1] * rad * 0.8, cz + dir[2] * rad * 0.8];
        const n0 = norm3([dir[0], dir[1] + 0.25, dir[2]]), up = Math.abs(dir[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
        let R = norm3(cross3(up, dir)), Uv = norm3(cross3(dir, R)); const ro = rnd(i + li * 9, 1) * 6.283, cr = Math.cos(ro), sr = Math.sin(ro);
        const R2 = [R[0] * cr + Uv[0] * sr, R[1] * cr + Uv[1] * sr, R[2] * cr + Uv[2] * sr], U2 = [-R[0] * sr + Uv[0] * cr, -R[1] * sr + Uv[1] * cr, -R[2] * sr + Uv[2] * cr];
        const sz = rad * (1.05 + rnd(i + li * 7, 2) * 0.35), t = Math.min(1, Math.max(0, (ctr[1] - 1.8) / 3.9)), tone = 0.62 + 0.62 * Math.pow(t, 0.8);
        card(P, N, U, C, K, ctr, R2, U2, sz, sz, n0, [0.96 + rnd(i, 3) * 0.1, 1, 0.84 + rnd(i, 4) * 0.2].map(v => v * tone), 0.8, 1.05);
      }
    });
    parts.push(core(new THREE.IcosahedronGeometry(1, 1).scale(1.28, 1.05, 1.28).translate(0, 3.55, 0), 1.8, 5.6, 1), core(new THREE.IcosahedronGeometry(1, 1).scale(0.9, 0.8, 0.9).translate(0.95, 3.1, 0.35), 1.8, 5.6, 1), core(new THREE.IcosahedronGeometry(1, 1).scale(0.9, 0.8, 0.9).translate(-0.85, 3.0, -0.55), 1.8, 5.6, 1));
  } else {
    const tiers = [[1.55, 3.0, 2.2], [1.2, 4.35, 2.1], [0.85, 5.65, 1.9]], cnt = [5, 7, 9, 11][lv];
    tiers.forEach(([rad, y, h], ti) => {
      const M = Math.max(5, Math.round(cnt * (0.6 + 0.4 * rad / 1.55)));
      for (let i = 0; i < M; i++) {
        const a = (i + rnd(i + ti * 5, 5) * 0.6) / M * 6.283 + ti * 0.7, D = [Math.cos(a), 0, Math.sin(a)], tilt = 0.5 + rnd(i + ti, 6) * 0.25;
        const F = norm3([D[0] * Math.cos(tilt), -Math.sin(tilt), D[2] * Math.cos(tilt)]), R = norm3(cross3([0, 1, 0], D)), len = rad * (1.05 + rnd(i + ti * 3, 7) * 0.25), wid = rad * 0.62;
        const base = [D[0] * 0.12, y + 0.1 - ti * 0.05, D[2] * 0.12], ctr = [base[0] + F[0] * len / 2, base[1] + F[1] * len / 2, base[2] + F[2] * len / 2];
        const n0 = norm3([D[0] * 0.5, 1, D[2] * 0.5]), t = Math.min(1, Math.max(0, (ctr[1] - 1.9) / 4.7)), tone = 0.66 + 0.55 * t;
        card(P, N, U, C, K, ctr, R, F, wid, len / 2, n0, [0.95 + rnd(i, 8) * 0.08, 1, 0.9 + rnd(i, 9) * 0.1].map(v => v * tone), 0.7, 1.05);
      }
      parts.push(core(new THREE.ConeGeometry(rad * 0.78, h * 0.85, 12, 1).translate(0, y + h * 0.05, 0), 1.9, 6.6, 1));
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aK', new THREE.Float32BufferAttribute(K.filter((_, i) => i % 4 === 0), 1));
  g.setAttribute('aC', new THREE.Float32BufferAttribute(K.filter((_, i) => i % 4 !== 0), 3));
  const all = mergeGeometries([g, ...parts], false);
  parts.forEach(p => p.dispose()); g.dispose();
  if (!all) throw new Error('fusion du feuillage impossible');
  return all;
}

// matériau du feuillage : texture de feuilles + vent + « simplification » douce avec la distance (les cartes rétrécissent, le cœur grossit)
export function foliageMaterial(mat, spruce, quality) {
  const lv = Math.max(0, LV(quality) - 1), lod = [[30, 60], [40, 80], [52, 105], [66, 135]][lv];
  mat.map = leafTexture(spruce, lv); mat.alphaTest = 0.42; mat.side = THREE.DoubleSide; mat.vertexColors = true; mat.flatShading = false; mat.roughness = 0.86; mat.color.set(0xffffff);
  const U = { uLod: { value: new THREE.Vector2(lod[0], lod[1]) } };
  chain(mat, sh => {
    Object.assign(sh.uniforms, WIND, U);
    sh.vertexShader = 'attribute float aK; attribute vec3 aC; uniform float uT; uniform vec2 uLod;\n' + sh.vertexShader
      .replace('#include <color_vertex>', `#include <color_vertex>
        vec3 ipw = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz; float lodF = smoothstep(uLod.x, uLod.y, distance(ipw, cameraPosition));
        vColor.rgb *= 1.0 + 0.85 * lodF * (1.0 - aK);`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
        transformed = mix(transformed, aC + (position - aC) * (1.0 - lodF), aK);
        transformed.xz *= 1.0 + 0.30 * lodF * (1.0 - aK); transformed.y = 3.5 + (transformed.y - 3.5) * (1.0 + 0.22 * lodF * (1.0 - aK));
        { float hh = max(transformed.y - 1.8, 0.0); vec3 ip = instanceMatrix[3].xyz;
          transformed.x += sin(uT * 1.5 + ip.x * 0.7 + ip.z * 0.5 + transformed.y * 1.3) * 0.05 * hh * ${spruce ? '0.5' : '1.0'};
          transformed.z += sin(uT * 1.2 + ip.z * 0.6 + 1.7 + transformed.y) * 0.04 * hh * ${spruce ? '0.5' : '1.0'};
          transformed.xz += aK * sin(uT * 3.1 + aC.x * 5.0 + aC.y * 3.0 + ip.x) * 0.035 * (1.0 - lodF); }`);
  }, 'fol' + (spruce ? 's' : 'b') + lv);
}

/* ------------------------------------------------------------ gazon : touffes de brins autour du joueur, recyclées case par case */
const GR_CFG = [null,
  { blades: 3, cell: 2.8, per: 9, G: 10, R: 12 },
  { blades: 3, cell: 2.7, per: 13, G: 12, R: 14 },
  { blades: 4, cell: 2.6, per: 18, G: 14, R: 17 }];
function tuftGeometry(nb) {
  const P = [], N = [], C = [], I = [];
  for (let b = 0; b < nb; b++) {
    const a = b / nb * 6.283 + hash(b + 3) * 0.8, ca = Math.cos(a), sa = Math.sin(a), ox = ca * 0.12 * (0.5 + hash(b + 9)), oz = sa * 0.12 * (0.5 + hash(b + 17));
    const lean = 0.10 + hash(b + 5) * 0.2, hw = 0.024 + hash(b + 11) * 0.012, hm = 0.85 + hash(b + 23) * 0.3, rows = [[0, 1], [0.5, 0.78], [0.85, 0.42], [1, 0]], base = P.length / 3;
    for (let r = 0; r < rows.length; r++) {
      const [y, w] = rows[r], bx = ox + ca * lean * y * y, bz = oz + sa * lean * y * y, px = -sa * hw * w, pz = ca * hw * w, yy = y * hm, k = 0.34 + 0.72 * y;
      if (r < rows.length - 1) { P.push(bx - px, yy, bz - pz, bx + px, yy, bz + pz); C.push(k, k * 1.02, k * 0.9, k, k * 1.02, k * 0.9); N.push(0, 1, 0, 0, 1, 0); }
      else { P.push(bx, yy, bz); C.push(1.1, 1.1, 0.95); N.push(0, 1, 0); }
    }
    I.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 5, base + 2, base + 5, base + 4, base + 4, base + 5, base + 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I); return g;
}

// opts : { group, th, quality, shadows, E(x,z), okCell(x,z,r), ok(x,z) }
export function createGrass(opts) {
  const { group, th, quality, shadows, E, okCell, ok } = opts;
  const choice = String(settings.grass || 'auto'), lv = choice === '0' || choice === 'off' ? 0 : choice === 'auto' ? Math.max(0, LV(quality) - 1) : ({ med: 1, high: 2, ultra: 3 })[choice] ?? LV(quality);
  const cfg = GR_CFG[lv]; if (!cfg || th.snow) return null;
  const { blades, cell: CS, per: K, G, R } = cfg, SLOTS = G * G, COUNT = SLOTS * K;
  const geo = tuftGeometry(blades), U = { uGC: { value: new THREE.Vector2() }, uGR: { value: R } };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, side: THREE.DoubleSide, vertexColors: true });
  chain(mat, sh => {
    Object.assign(sh.uniforms, WIND, U);
    sh.vertexShader = 'uniform float uT; uniform vec2 uGC; uniform float uGR; varying vec3 vWg;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec3 iw = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz; float fade = 1.0 - smoothstep(uGR * 0.55, uGR, distance(iw.xz, uGC));
        float ph = iw.x * 0.55 + iw.z * 0.43, bend = clamp(position.y, 0.0, 1.5); bend *= bend;
        float gust = sin(uT * 1.7 + ph) * 0.6 + sin(uT * 3.3 + ph * 1.9) * 0.25 + sin(uT * 0.6 + iw.x * 0.05) * 0.5;
        transformed.x += bend * gust * 0.26; transformed.z += bend * sin(uT * 1.3 + ph * 1.3) * 0.09;
        transformed.y *= fade; transformed.xz *= mix(0.25, 1.0, fade);
        vWg = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; }`);
    sh.fragmentShader = 'varying vec3 vWg;\n' + GLSL_NOISE + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (th.patchy ? SNOW(th.patchy) : ''))
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);');
  }, 'grass' + blades + (th.patchy ? 's' : ''));
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;   // pas d'ombres sur le gazon : gros gain de fluidité
  const mA = mesh.instanceMatrix.array, ic = new Float32Array(COUNT * 3); mesh.instanceColor = new THREE.InstancedBufferAttribute(ic, 3);
  mA.fill(0); for (let i = 0; i < COUNT; i++) mA[i * 16 + 15] = 1;
  const base = new THREE.Color(th.leafPal ? th.ground : th.lawn).lerp(new THREE.Color(th.ground), 0.35), dryC = new THREE.Color(th.leafPal ? 0xc9a24a : 0xbfae55), PAL = [];
  for (let i = 0; i < 16; i++) { const c = base.clone().lerp(dryC, th.leafPal ? i / 16 * 0.55 : i / 16 * 0.3); c.offsetHSL((hash(i) - 0.5) * 0.03, 0.05, (hash(i + 7) - 0.5) * 0.08); PAL.push(c); }
  group.add(mesh);

  const cix = new Int32Array(SLOTS).fill(-1e9), ciz = new Int32Array(SLOTS).fill(-1e9), qix = new Int32Array(SLOTS), qiz = new Int32Array(SLOTS), pending = new Uint8Array(SLOTS);
  const mod = (n, m) => ((n % m) + m) % m;
  let todo = [], scanT = 99, lastUp = 0, dirty = false, lastIx = 1e9, lastIz = 1e9, filled = false;
  const vn = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), h = (a, b) => hash(a * 127.1 + b * 311.7); return h(i, j) + (h(i + 1, j) - h(i, j)) * u + (h(i, j + 1) - h(i, j)) * v + (h(i, j) - h(i + 1, j) - h(i, j + 1) + h(i + 1, j + 1)) * u * v; };

  function fillCell(slot, ix, iz) {
    const x0 = ix * CS, z0 = iz * CS, full = okCell(x0 + CS / 2, z0 + CS / 2, CS * 0.75), o0 = slot * K;
    for (let k = 0; k < K; k++) {
      const o = (o0 + k) * 16, s = ix * 73.13 + iz * 191.7 + k * 13.37, x = x0 + hash(s + 1) * CS, z = z0 + hash(s + 2) * CS;
      if (!full && !ok(x, z)) { mA.fill(0, o, o + 16); mA[o + 15] = 1; continue; }
      const pat = vn(x * 0.07, z * 0.07), h = (0.26 + hash(s + 3) * 0.3) * (0.7 + 0.8 * pat), w = 0.8 + hash(s + 4) * 0.6, a = hash(s + 5) * 6.283, c = Math.cos(a), si = Math.sin(a);
      mA[o] = c * w; mA[o + 1] = 0; mA[o + 2] = -si * w; mA[o + 3] = 0; mA[o + 4] = 0; mA[o + 5] = h; mA[o + 6] = 0; mA[o + 7] = 0;
      mA[o + 8] = si * w; mA[o + 9] = 0; mA[o + 10] = c * w; mA[o + 11] = 0; mA[o + 12] = x; mA[o + 13] = E(x, z) - 0.02; mA[o + 14] = z; mA[o + 15] = 1;
      const col = PAL[Math.min(15, Math.floor(Math.min(0.999, pat * 0.75 + hash(s + 6) * 0.35) * 16))], j = 0.9 + hash(s + 7) * 0.25;
      ic[(o0 + k) * 3] = col.r * j; ic[(o0 + k) * 3 + 1] = col.g * j; ic[(o0 + k) * 3 + 2] = col.b * j;
    }
    cix[slot] = ix; ciz[slot] = iz; pending[slot] = 0; dirty = true;
  }

  function update(dt, px, pz) {
    U.uGC.value.set(px, pz);
    const ix = Math.floor(px / CS), iz = Math.floor(pz / CS);
    scanT += dt;
    if ((ix !== lastIx || iz !== lastIz) && scanT > 0.05 || scanT > 1.5) {            // on recense les cases à (re)calculer quand on change de case
      scanT = 0; lastIx = ix; lastIz = iz; todo = [];
      for (let a = -G / 2; a < G / 2; a++) for (let b = -G / 2; b < G / 2; b++) {
        const cx = ix + a, cz = iz + b, slot = mod(cx, G) * G + mod(cz, G);
        if (cix[slot] === cx && ciz[slot] === cz) { pending[slot] = 0; continue; }
        qix[slot] = cx; qiz[slot] = cz; pending[slot] = 1; todo.push([a * a + b * b, slot]);
      }
      todo.sort((p, q) => q[0] - p[0]);                                                // les plus proches en dernier (on dépile par la fin)
    }
    const t0 = performance.now(), budget = filled ? 2.5 : 8;
    while (todo.length && performance.now() - t0 < budget) {
      const [, slot] = todo.pop(); if (!pending[slot]) continue;
      fillCell(slot, qix[slot], qiz[slot]);
    }
    if (!todo.length) filled = true;
    lastUp += dt;
    if (dirty && (lastUp > 0.12 || !todo.length)) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; dirty = false; lastUp = 0; }
  }
  function dispose() { group.remove(mesh); geo.dispose(); mat.dispose(); mesh.dispose(); }
  return { update, dispose, mesh };
}

/* ------------------------------------------------------------ ciel : brume d'horizon qui rejoint le brouillard, halo du soleil, voile de nuages fins */
export function natureSky(th) {
  const sp = new THREE.Vector3(...th.sun.pos).normalize(), night = !!th.night;
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(th.sky[0]) }, mid: { value: new THREE.Color(th.sky[1]) }, bot: { value: new THREE.Color(th.sky[2]) }, haze: { value: new THREE.Color(th.fog) },
      sunDir: { value: sp }, sunCol: { value: new THREE.Color(th.sun.col) }, cloud: { value: th.clouds ? Math.min(1, th.clouds.op) : 0 }, cloudCol: { value: new THREE.Color(th.clouds ? th.clouds.col : 0xffffff) }, night: { value: night ? 1 : 0 }, t: WIND.uT
    },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 haze; uniform vec3 sunDir; uniform vec3 sunCol; uniform float cloud; uniform vec3 cloudCol; uniform float night; uniform float t; varying vec3 vD;
      ${GLSL_NOISE}
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * nvn(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vD); float h = d.y;
        vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.5)) : mix(mid, bot, pow(-h, 0.6));
        float hz = 1.0 - smoothstep(0.0, 0.32, abs(h));                       // brume : l'horizon rejoint exactement la couleur du brouillard
        c = mix(c, haze, hz * 0.85);
        if (h < 0.0) c = mix(c, haze, smoothstep(0.0, 0.25, -h));
        float s = max(dot(d, sunDir), 0.0);
        c += sunCol * (pow(s, 900.0) * 3.0 + pow(s, 60.0) * 0.35 + pow(s, 8.0) * 0.16 * (1.0 - night));
        if (cloud > 0.01 && h > 0.02) {
          vec2 q = d.xz / (h + 0.22) * 1.15 + vec2(t * 0.012, t * 0.006);
          float n = fbm(q * 1.4) * 0.7 + fbm(q * 4.0 + 3.0) * 0.3, m = smoothstep(0.50, 0.78, n) * smoothstep(0.02, 0.22, h) * cloud * 0.8;
          float lit = 0.75 + 0.35 * pow(max(dot(normalize(vec3(d.xz, 0.0)), normalize(vec3(sunDir.xz, 0.0))), 0.0), 2.0);
          c = mix(c, cloudCol * lit * mix(vec3(1.0), sunCol, 0.25), m);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
      }`
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(600, 64, 48), mat);
  m.frustumCulled = false; m.renderOrder = -10; return m;
}
