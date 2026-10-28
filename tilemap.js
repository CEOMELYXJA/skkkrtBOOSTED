// Mini-carte : vraies tuiles OpenStreetMap, exactement le même principe que la carte 2D de l'onglet Jeu
// (projection Web Mercator, mêmes tuiles tile.openstreetmap.org, mêmes pointillés d'adresses effacés).
const R2 = Math.PI / 180;
const T = new Map();
const TILE_SOURCES = [
  { id: 'osm', label: 'OSM Standard', url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png` },
  { id: 'de', label: 'OSM Allemagne', url: (z, x, y) => `https://tile.openstreetmap.de/${z}/${x}/${y}.png` },
  { id: 'fr', label: 'OSM France', url: (z, x, y) => `https://a.tile.openstreetmap.fr/osmfr/${z}/${x}/${y}.png` }
];

// efface les pointillés gris d'adresses et numéros de maisons (même algorithme que la 2D)
function clean(img) {
  const w = img.naturalWidth, h = img.naturalHeight; if (w < 64 || h < 64) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, w, h), d = id.data, N = w * h, L = new Float32Array(N), m = new Uint8Array(N);
  for (let p = 0, o = 0; p < N; p++, o += 4) {
    const r = d[o], gg = d[o + 1], b = d[o + 2]; L[p] = (r + gg + b) / 3;
    if (Math.max(r, gg, b) - Math.min(r, gg, b) < 14 && L[p] >= 86 && L[p] <= 172) m[p] = 1;
  }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x; if (!m[p]) continue;
    if (L[p - 1] < 78 || L[p + 1] < 78 || L[p - w] < 78 || L[p + w] < 78 || L[p - w - 1] < 78 || L[p - w + 1] < 78 || L[p + w - 1] < 78 || L[p + w + 1] < 78) m[p] = 2;
  }
  const k = new Uint8Array(N); let n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x; if (m[p] !== 1) continue; n++;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) k[p + j * w + i] = 1;
  }
  if (!n) return null;
  const out = new Uint8ClampedArray(d);
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const p = y * w + x; if (!k[p]) continue; let r = 0, gg = 0, b = 0, q = 0;
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      const u = p + j * w + i; if (!k[u]) { const o = u * 4; r += d[o]; gg += d[o + 1]; b += d[o + 2]; q++; }
    }
    if (q) { const o = p * 4; out[o] = r / q; out[o + 1] = gg / q; out[o + 2] = b / q; }
  }
  id.data.set(out); g.putImageData(id, 0, 0); return c;
}

function tile(z, x, y, hideDots) {
  const k = z + '/' + x + '/' + y; let i = T.get(k);
  // Une panne temporaire ne doit pas condamner cette tuile pour toute la session.
  if (i && i.__failedAt && Date.now() - i.__failedAt > 15000) { T.delete(k); i = null; }
  if (!i) {
    i = new Image(); i.crossOrigin = 'anonymous';
    const attempts = TILE_SOURCES.flatMap((s, n) => [{ s, n, cors: true }, { s, n, cors: false }]);
    const load = a => {
      const v = attempts[a]; if (!v) { i.__failedAt = Date.now(); return; }
      i.__source = v.s;
      if (v.cors) i.crossOrigin = 'anonymous'; else { i.removeAttribute('crossorigin'); i.crossOrigin = null; }
      i.onload = () => {
        if (hideDots) { try { i.c = clean(i); } catch (e) {} }
        try {
          const credit = document.getElementById('osmCredit');
          if (credit) { const active = new Set([...T.values()].filter(t => t.complete && t.naturalWidth).map(t => t.__source && t.__source.label).filter(Boolean)); credit.textContent = '© OpenStreetMap contributors' + (active.size ? ' · ' + [...active].join(' · ') : ''); }
        } catch {}
      };
      i.onerror = () => load(a + 1);
      i.src = v.s.url(z, x, y);
    };
    load(0); T.set(k, i);
    if (T.size > 300) T.delete(T.keys().next().value);
  }
  return i;
}

// Web Mercator : (lat, lon) -> pixel monde au zoom z (identique à wp() de la 2D)
const wp = (la, lo, z) => { const n = 256 * 2 ** z, r = la * R2; return [(lo + 180) / 360 * n, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n]; };

/* g : contexte déjà centré sur le joueur et tourné (nord = haut quand yaw = 0)
   D : données de la carte réelle (D.back(x, z) -> [lat, lon]) · (px, pz) : position du joueur en mètres
   sc : pixels de la mini-carte par mètre · rad : rayon visible en pixels
   renvoie true si au moins une tuile a été dessinée */
export function drawOsm(g, D, px, pz, sc, rad, hideDots = true) {
  const [la, lo] = D.back(px, pz);
  const mpp0 = 156543.03392 * Math.cos(la * R2);             // mètres par pixel de tuile au zoom 0
  const z = Math.max(13, Math.min(19, Math.ceil(Math.log2(mpp0 * sc) - 0.15)));
  const s = sc * mpp0 / 2 ** z;                               // pixels de mini-carte par pixel de tuile
  const [cx, cy] = wp(la, lo, z), n = 2 ** z, A = rad / s;
  let drawn = 0;
  g.save(); g.scale(s, s); g.imageSmoothingEnabled = true;
  for (let x = Math.floor((cx - A) / 256); x <= Math.floor((cx + A) / 256); x++) {
    for (let y = Math.floor((cy - A) / 256); y <= Math.floor((cy + A) / 256); y++) {
      if (y < 0 || y >= n) continue;
      const i = tile(z, ((x % n) + n) % n, y, hideDots);
      if (i.complete && i.naturalWidth) { g.drawImage(i.c || i, x * 256 - cx, y * 256 - cy, 256.6, 256.6); drawn++; }
    }
  }
  g.restore();
  return drawn > 0;
}
