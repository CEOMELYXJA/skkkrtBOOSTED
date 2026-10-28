// Relief : altitudes réelles autour de ta position (tuiles « Terrarium » du jeu de données public AWS Terrain Tiles).
// Même idée que les tuiles de la carte 2D : des images décodées en hauteurs, ici en mètres au-dessus de ta position de départ.
const R2 = Math.PI / 180;
const SRC = [
  (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
  (z, x, y) => `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${z}/${x}/${y}.png`,
  (z, x, y) => `https://elevation-tiles-prod-eu.s3.eu-central-1.amazonaws.com/terrarium/${z}/${x}/${y}.png`
];
const wp = (la, lo, z) => { const n = 256 * 2 ** z, r = la * R2; return [(lo + 180) / 360 * n, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n]; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Les altitudes ne changent pas : chaque tuile décodée (256×256, Float32 = exactement les mêmes valeurs qu'avant) est gardée dans le cache du navigateur.
// Au lancement suivant (ou si ta zone chevauche une zone déjà visitée), ces tuiles sont lues sur place : aucune requête réseau, aucun décodage d'image.
const RC = 'skkkrt3d-relief-v1', RKEEP = 220;
async function rGet(z, x, y) {
  try { const c = await caches.open(RC), r = await c.match('/__relief__/' + z + '/' + x + '/' + y); if (!r) return null; const b = await r.arrayBuffer(); return b.byteLength === 262144 ? new Float32Array(b) : null; } catch { return null; }
}
async function rPut(z, x, y, f) {
  try { const c = await caches.open(RC); await c.put('/__relief__/' + z + '/' + x + '/' + y, new Response(f.buffer.slice(0))); } catch {}
}
async function rTrim() { try { const c = await caches.open(RC), ks = await c.keys(); for (let i = 0; i < ks.length - RKEEP; i++) await c.delete(ks[i]); } catch {} }

function loadImg(u, ms = 15000) {
  return new Promise((res, rej) => {
    const i = new Image(); i.crossOrigin = 'anonymous';
    const t = setTimeout(() => { i.src = ''; rej(new Error('délai dépassé')); }, ms);
    i.onload = () => { clearTimeout(t); res(i); };
    i.onerror = () => { clearTimeout(t); rej(new Error('tuile indisponible')); };
    i.src = u;
  });
}

/* D = données de la carte réelle (D.lat0, D.lon0, D.me) · half = demi-côté en mètres
   renvoie { fn(x, z) -> mètres (0 à ta position), min, max, zoom } ou lance une erreur */
export async function loadElevation(D, half, status = () => {}) {
  const lat0 = D.lat0, lon0 = D.lon0, kx = 111320 * Math.cos(lat0 * R2), kz = 111320;
  const m = half + 300;
  let Z = half > 2000 ? 14 : 15, tx0, tx1, ty0, ty1, NX, NY;           // zoom 15 ≈ 3 m par pixel (avant : 14 ≈ 6 m) ; on redescend d'un cran si la zone demande trop de tuiles
  for (;;) {
    const [xa, ya] = wp(lat0 + m / kz, lon0 - m / kx, Z), [xb, yb] = wp(lat0 - m / kz, lon0 + m / kx, Z);
    tx0 = Math.floor(xa / 256); tx1 = Math.floor(xb / 256); ty0 = Math.floor(ya / 256); ty1 = Math.floor(yb / 256);
    NX = tx1 - tx0 + 1; NY = ty1 - ty0 + 1;
    if (NX * NY <= 49 || Z <= 12) break; Z--;
  }
  const W = NX * 256, HH = NY * 256;
  if (NX * NY > 49) throw new Error('zone trop grande');
  const grid = new Float32Array(W * HH).fill(NaN);
  const g = [0, 1, 2, 3, 4, 5].map(() => { const c = document.createElement('canvas'); c.width = c.height = 256; return c.getContext('2d', { willReadFrequently: true }); });
  const jobs = []; for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push([tx, ty]);
  let next = 0, done = 0, failed = 0, fromCache = 0, lastErr = '';
  const worker = async wi => {
    const g0 = g[wi];
    for (;;) {
      const k = next++; if (k >= jobs.length) return;
      const [tx, ty] = jobs[k]; let h = await rGet(Z, tx, ty), img = null;
      if (h) fromCache++;
      else {
        for (let a = 0; a < 4 && !img; a++) {
          try { img = await loadImg(SRC[a % SRC.length](Z, tx, ty)); } catch (e) { lastErr = e.message; await sleep(500 * (a + 1)); }
        }
        if (img) {
          g0.clearRect(0, 0, 256, 256); g0.drawImage(img, 0, 0, 256, 256);
          let d; try { d = g0.getImageData(0, 0, 256, 256).data; } catch (e) { d = null; lastErr = 'lecture bloquée (CORS)'; }
          if (d) { h = new Float32Array(65536); for (let q = 0; q < 65536; q++) h[q] = d[q * 4] * 256 + d[q * 4 + 1] + d[q * 4 + 2] / 256 - 32768; rPut(Z, tx, ty, h); }
        }
      }
      if (h) { const bx = (tx - tx0) * 256, by = (ty - ty0) * 256; for (let j = 0; j < 256; j++) grid.set(h.subarray(j * 256, j * 256 + 256), (by + j) * W + bx); } else failed++;
      done++; status('Relief du terrain : ' + done + ' / ' + jobs.length + ' morceaux' + (fromCache ? ' (' + fromCache + ' en mémoire)' : '') + (failed ? ' · ' + failed + ' échec(s)' : '') + '…');
    }
  };
  status('Relief du terrain : 0 / ' + jobs.length + ' morceaux…');
  await Promise.all((globalThis.__gentle && globalThis.__gentle() ? [0, 1] : [0, 1, 2, 3, 4, 5]).map(i => worker(i)));
  rTrim();
  let sum = 0, cnt = 0; for (let i = 0; i < grid.length; i += 7) if (grid[i] === grid[i]) { sum += grid[i]; cnt++; }
  if (!cnt || failed > jobs.length * 0.34) throw new Error('altitudes indisponibles (' + (lastErr || 'échec') + ')');
  const mean = sum / cnt; for (let i = 0; i < grid.length; i++) if (grid[i] !== grid[i]) grid[i] = mean;     // morceau manquant : altitude moyenne

  // lissage léger (flou 3×3 séparable) : enlève les marches de la source ; 2 passes à 3 m par pixel pour garder la même douceur qu'à 6 m
  const tmp = new Float32Array(grid.length);
  for (let pass = 0; pass < (Z >= 15 ? 2 : 1); pass++) {
    for (let j = 0; j < HH; j++) for (let i = 0; i < W; i++) {
      const p = j * W + i; tmp[p] = (grid[i > 0 ? p - 1 : p] + grid[p] + grid[i < W - 1 ? p + 1 : p]) / 3;
    }
    for (let j = 0; j < HH; j++) for (let i = 0; i < W; i++) {
      const p = j * W + i; grid[p] = (tmp[j > 0 ? p - W : p] + tmp[p] + tmp[j < HH - 1 ? p + W : p]) / 3;
    }
  }

  // repère local (x = est, z = sud) -> pixel de la grille
  const n = 256 * 2 ** Z, [cx, cy] = wp(lat0, lon0, Z);
  const ax = n / 360 / kx, ay = n / (2 * Math.PI) / Math.cos(lat0 * R2) * R2 / kz, ox = cx - tx0 * 256, oy = cy - ty0 * 256;
  const raw = (x, z) => {
    let u = ox + x * ax, v = oy + z * ay;
    u = u < 0 ? 0 : u > W - 1.001 ? W - 1.001 : u; v = v < 0 ? 0 : v > HH - 1.001 ? HH - 1.001 : v;
    const i = u | 0, j = v | 0, fu = u - i, fv = v - j, p = j * W + i;
    return grid[p] * (1 - fu) * (1 - fv) + grid[p + 1] * fu * (1 - fv) + grid[p + W] * (1 - fu) * fv + grid[p + W + 1] * fu * fv;
  };
  const me = D.me || [0, 0], e0 = raw(me[0], me[1]);
  let mn = 1e9, mx = -1e9;
  for (let x = -half; x <= half; x += 40) for (let z = -half; z <= half; z += 40) { const e = raw(x, z) - e0; if (e < mn) mn = e; if (e > mx) mx = e; }
  return { fn: (x, z) => raw(x, z) - e0, min: mn, max: mx, zoom: Z, failed };
}
