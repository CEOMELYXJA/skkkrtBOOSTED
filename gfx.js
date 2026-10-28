// Rendu Premium (v9.12) — tout ce qui améliore l'image SANS toucher au jeu.
// Interrupteur : ⚙ → Résolution & performance → « Rendu Premium », ou l'adresse /3d/?gfx=classic pour forcer l'ancien rendu.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { settings } from './settings.js';
import { wallMaps, roadMaps, groundMaps, gripMaps, treadMaps } from './gfx-math.js';

const FORCE = (() => { try { return new URLSearchParams(location.search).get('gfx'); } catch { return null; } })();
export const premium = () => FORCE === 'classic' ? false : FORCE === 'premium' ? true : settings.premium !== false;

/* ------------------------------------------------------------ textures de relief et de rugosité (mises en cache) */
const cache = new Map();
function tex(rgba, W, H, aniso) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H); img.data.set(rgba); g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso || 8;       // pas d'espace colorimétrique : ce sont des données, pas des couleurs
  return t;
}
function pair(key, make, aniso) {
  let p = cache.get(key);
  if (!p) { const m = make(); p = { normal: tex(m.rgbaN, m.W, m.H, aniso), rough: tex(m.rgbaR, m.W, m.H, aniso) }; cache.set(key, p); }
  return p;
}
const ANI = () => Math.min(16, +settings.aniso || 8);
export const wallPBR = tr => { const S = tr >= 2 ? 768 : 512; return pair('wall' + S, () => wallMaps(S), ANI()); };   // 768 px max : bon compromis finesse / temps de calcul sur téléphone
export const roadPBR = tr => { const k = Math.min(2, Math.max(1, tr || 1)); return pair('road' + k, () => roadMaps(256 * k, 512 * k), ANI()); };
export const groundPBR = () => pair('ground', () => groundMaps(512), ANI());
export const gripPBR = () => pair('grip', () => gripMaps(128), 4);
export const treadPBR = () => pair('tread', () => treadMaps(256, 64), 4);

/* ------------------------------------------------------------ ciel → lumière d'environnement
   Une « boîte de ciel » aux couleurs du thème est photographiée en cube puis floutée (PMREM) :
   les vitres, l'asphalte et la carrosserie reflètent le vrai ciel du monde, et l'ombre portée du sol colore le bas des objets. */
const ENV_I = { day: 0.55, sunset: 0.55, neon: 0.8, winter: 0.6 };
const ENV_GLOW = { neon: 0.8, sunset: 0.3 };
export const envIntensity = (id, th) => (th && th.envI != null) ? th.envI : (ENV_I[id] || 0.5);
let pm = null;
export function buildEnv(renderer, th, id) {
  if (!pm) pm = new THREE.PMREMGenerator(renderer);
  const sc = new THREE.Scene();
  const sp = new THREE.Vector3(...th.sun.pos).normalize();
  const bot = new THREE.Color(th.sky[2]).lerp(new THREE.Color(th.ground), 0.5).multiplyScalar(0.8);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: {
      top: { value: new THREE.Color(th.sky[0]) }, mid: { value: new THREE.Color(th.sky[1]) }, bot: { value: bot },
      sunDir: { value: sp }, sunCol: { value: new THREE.Color(th.sun.col) }, sunI: { value: 12 },
      glowCol: { value: new THREE.Color(th.fill ? th.fill.col : 0xffffff) }, glow: { value: th.glowEnv != null ? th.glowEnv : (ENV_GLOW[id] || 0) }
    },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunI; uniform vec3 glowCol; uniform float glow; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD); float h = d.y;
        vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.5)) : mix(mid, bot, smoothstep(0.0, 0.3, -h));
        float s = max(dot(d, sunDir), 0.0);
        c += sunCol * (pow(s, 600.0) * sunI + pow(s, 10.0) * 0.35);
        float az = atan(d.z, d.x);
        c += glowCol * glow * smoothstep(0.35, 0.0, abs(h)) * (0.55 + 0.45 * sin(az * 3.0 + 1.3) * sin(az * 5.0));
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  const geo = new THREE.SphereGeometry(50, 48, 32);
  sc.add(new THREE.Mesh(geo, mat));
  const t = pm.fromScene(sc, 0).texture;
  geo.dispose(); mat.dispose();
  return t;
}

/* ------------------------------------------------------------ ombres stables
   La carte d'ombres suit le joueur : sans « aimantation » aux pixels de la carte, les bords des ombres grouillent quand on roule. */
const _L = new THREE.Vector3(), _R = new THREE.Vector3(), _U = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0), _P = new THREE.Vector3();
export function snapShadowTarget(out, px, py, pz, sunOff, extent, mapSize) {
  const ts = (2 * extent) / Math.max(256, mapSize);
  _L.copy(sunOff).normalize(); _R.crossVectors(_UP, _L).normalize(); _U.crossVectors(_L, _R).normalize();
  _P.set(px, py, pz);
  const a = Math.round(_P.dot(_R) / ts) * ts, b = Math.round(_P.dot(_U) / ts) * ts, c = _P.dot(_L);
  out.set(0, 0, 0).addScaledVector(_R, a).addScaledVector(_U, b).addScaledVector(_L, c);
  return out;
}

/* ------------------------------------------------------------ arbres : couronne irrégulière en plusieurs lobes, ombrée du bas (sombre) vers le haut (clair) */
function lobe(cx, cy, cz, r, detail, seed, y0, y1) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, n = g.attributes.normal, N = p.count, col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, y, z) || 1, nx = x / l, ny = y / l, nz = z / l;
    const bump = Math.sin(nx * 5.1 + ny * 3.7 + seed) * Math.sin(nz * 4.3 + nx * 2.9 - seed) + 0.5 * Math.sin(ny * 9.0 + nz * 7.0 + seed * 2);
    const rr = r * (1 + 0.11 * bump);
    p.setXYZ(i, cx + nx * rr, cy + ny * rr, cz + nz * rr);
    const sx = nx, sy = ny + 0.25, sz = nz, sl = Math.hypot(sx, sy, sz); n.setXYZ(i, sx / sl, sy / sl, sz / sl);
    const t = Math.min(1, Math.max(0, (cy + ny * rr - y0) / (y1 - y0))), k = 0.5 + 0.62 * Math.pow(t, 0.85) + 0.04 * bump;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function tier(r, h, cy, sides, seed, y0, y1) {
  const g = new THREE.ConeGeometry(r, h, sides, 3), p = g.attributes.position, N = p.count, col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), low = 0.5 - y / h;               // 0 en haut … 1 en bas
    const f = 1 + 0.1 * Math.sin(a * 7 + seed) * low;                                                      // bas de la ramure festonné
    p.setXYZ(i, x * f, y + cy, z * f);
    const t = Math.min(1, Math.max(0, (y + cy - y0) / (y1 - y0))), k = 0.55 + 0.55 * t;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
export function treeCanopy(spruce) {
  if (spruce) return mergeGeometries([tier(1.55, 2.2, 3.0, 18, 0, 1.9, 6.6), tier(1.2, 2.1, 4.35, 18, 2, 1.9, 6.6), tier(0.85, 1.9, 5.65, 16, 4, 1.9, 6.6)]);
  return mergeGeometries([lobe(0, 3.6, 0, 1.65, 2, 0, 1.8, 5.6), lobe(0.95, 3.1, 0.35, 1.15, 1, 1.7, 1.8, 5.6), lobe(-0.85, 3.0, -0.55, 1.2, 1, 3.4, 1.8, 5.6)]);
}

/* ------------------------------------------------------------ printemps : neige par plaques (fond par endroits, soleil ailleurs)
   Un petit bruit calculé dans le matériau (aucune texture) mélange la couleur du sol avec de la neige, selon la position dans le monde. */
export function patchySnow(mat, cover = 0.45) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vWp;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
      'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }\n' +
      sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n { float m = vn(vWp.xz * 0.03) * 0.55 + vn(vWp.xz * 0.09) * 0.3 + vn(vWp.xz * 0.35) * 0.15; float s = smoothstep(' + (1 - cover - 0.04).toFixed(3) + ', ' + (1 - cover + 0.04).toFixed(3) + ', m); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.99), s); }');
  };
  mat.customProgramCacheKey = () => 'patchy' + cover;
  mat.needsUpdate = true;
}
