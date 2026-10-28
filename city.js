// Ville imaginaire aléatoire : routes courbes, bâtiments placés au hasard, parcs, étangs, forêts.
// La ville est fabriquée comme une réponse « OpenStreetMap » fictive, puis lue par le même code que la carte réelle
// (donc : mêmes routes, mêmes collisions, mêmes drapeaux / pièces, même mini-carte).
import { parseOSM, RW } from './real-core.js';

const LAT0 = 46, LON0 = -71;                       // origine arbitraire (la ville est inventée)
const KZ = 111320, KX = 111320 * Math.cos(LAT0 * Math.PI / 180);

function rngOf(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ll = (x, z) => ({ lat: LAT0 - z / KZ, lon: LON0 + x / KX });

function segCross(a, b, c, d) {                     // les segments ab et cd se croisent-ils ?
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}

export function generateCityJSON(seed, half = 400, preset = 'city') {
  const R = rngOf(seed * 2654435761 + 12345);
  for (let i = 0; i < 6; i++) R();
  const rr = (a, b) => a + (b - a) * R();
  if (!['city', 'skate', 'mountain', 'f1', 'snow', 'sky'].includes(preset)) preset = 'city';

  /* ---------------------------------------------------------------- 1. nœuds de carrefour (grille déformée) */
  const span = preset === 'city' ? [88, 106] : preset === 'skate' ? [112, 130] : preset === 'f1' ? [126, 148] : [118, 140];
  const S = rr(span[0], span[1]), N = Math.floor((half - 60) / S), pts = new Map(), nodes = [];
  const jit = S * 0.22;
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    const x = i * S + rr(-jit, jit), z = j * S + rr(-jit, jit);
    if (Math.hypot(x, z) > half - 45) continue;                 // coins coupés : ville plutôt ronde
    const n = { id: nodes.length, i, j, x, z, deg: 0 }; nodes.push(n); pts.set(i + ',' + j, n);
  }
  let edges = [];
  for (const n of nodes) for (const [di, dj] of [[1, 0], [0, 1]]) {
    const m = pts.get((n.i + di) + ',' + (n.j + dj)); if (m) edges.push({ a: n, b: m });
  }
  // quelques routes en moins (rues sans issue, îlots plus grands) — en gardant tout relié
  for (let k = edges.length - 1; k > 0; k--) { const q = Math.floor(R() * (k + 1)); [edges[k], edges[q]] = [edges[q], edges[k]]; }
  const deg = new Map(); for (const e of edges) { deg.set(e.a.id, (deg.get(e.a.id) || 0) + 1); deg.set(e.b.id, (deg.get(e.b.id) || 0) + 1); }
  edges = edges.filter(e => {
    if (R() < 0.17 && deg.get(e.a.id) > 2 && deg.get(e.b.id) > 2) { deg.set(e.a.id, deg.get(e.a.id) - 1); deg.set(e.b.id, deg.get(e.b.id) - 1); return false; }
    return true;
  });
  // composante principale seulement
  {
    const adj = new Map(nodes.map(n => [n.id, []])); for (const e of edges) { adj.get(e.a.id).push(e.b.id); adj.get(e.b.id).push(e.a.id); }
    const seen = new Set(); let best = [];
    for (const n of nodes) {
      if (seen.has(n.id)) continue;
      const comp = [], st = [n.id]; seen.add(n.id);
      while (st.length) { const c = st.pop(); comp.push(c); for (const q of adj.get(c)) if (!seen.has(q)) { seen.add(q); st.push(q); } }
      if (comp.length > best.length) best = comp;
    }
    const keep = new Set(best); edges = edges.filter(e => keep.has(e.a.id) && keep.has(e.b.id));
  }

  if (preset !== 'city') edges = []; // seuls les rues de la ville gardent la grille urbaine

  /* ---------------------------------------------------------------- 2. routes courbes (échantillonnées tous les ~8 m) */
  const placed = [];                                              // arêtes déjà tracées (pour éviter les croisements)
  const cls = () => { const r = R(); if (preset === 'skate') return r < 0.78 ? 'cycleway' : 'residential'; if (preset === 'f1') return r < 0.72 ? 'tertiary' : 'secondary'; if (preset === 'mountain' || preset === 'snow') return r < 0.78 ? 'cycleway' : 'tertiary'; return r < 0.56 ? 'residential' : r < 0.84 ? 'tertiary' : 'cycleway'; };
  let nid = 1000;
  const nodeOf = new Map();                                       // carrefour -> id de nœud
  const nidFor = n => { if (!nodeOf.has(n.id)) nodeOf.set(n.id, nid++); return nodeOf.get(n.id); };
  const roads = [];
  for (const e of edges) {
    const A = [e.a.x, e.a.z], B = [e.b.x, e.b.z], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
    const s = R() < 0.35;                                         // courbe en S ou en arc
    const b1 = rr(-0.22, 0.22) * L * (s ? 0.6 : 1), b2 = s ? -b1 * rr(0.6, 1.1) : b1;
    const C1 = [A[0] + dx * 0.33 + nx * b1, A[1] + dz * 0.33 + nz * b1], C2 = [A[0] + dx * 0.66 + nx * b2, A[1] + dz * 0.66 + nz * b2];
    const K = Math.max(6, Math.ceil(L / 8)), P = [];
    for (let k = 0; k <= K; k++) {
      const t = k / K, u = 1 - t;
      P.push([u * u * u * A[0] + 3 * u * u * t * C1[0] + 3 * u * t * t * C2[0] + t * t * t * B[0], u * u * u * A[1] + 3 * u * u * t * C1[1] + 3 * u * t * t * C2[1] + t * t * t * B[1]]);
    }
    let bad = false;                                              // croise une route déjà tracée (hors voisines) ?
    for (const o of placed) {
      if (o.a === e.a || o.a === e.b || o.b === e.a || o.b === e.b) continue;
      for (let k = 0; k < P.length - 1 && !bad; k++) for (let q = 0; q < o.P.length - 1; q++) if (segCross(P[k], P[k + 1], o.P[q], o.P[q + 1])) { bad = true; break; }
      if (bad) break;
    }
    if (bad) continue;
    const c = cls();
    const riverOffsets = preset === 'city' ? P.map(([x, z]) => x - 18 * Math.sin(z / 105)) : [];
    const bridge = preset === 'city' && Math.min(...riverOffsets) < -11 && Math.max(...riverOffsets) > 11 && Math.max(...P.map(p => p[0])) - Math.min(...P.map(p => p[0])) > 24;
    const rec = { a: e.a, b: e.b, P, cls: c, bridge }; placed.push(rec);
    e.a.deg++; e.b.deg++;
  }
  // un carrefour ne doit pas n'avoir que des pistes cyclables : au moins une vraie route
  const hasCar = new Map();
  for (const r of placed) if (r.cls !== 'cycleway') { hasCar.set(r.a.id, 1); hasCar.set(r.b.id, 1); }
  for (const r of placed) if (r.cls === 'cycleway' && (!hasCar.has(r.a.id) || !hasCar.has(r.b.id))) { r.cls = 'residential'; hasCar.set(r.a.id, 1); hasCar.set(r.b.id, 1); }
  // 1 route plus large traverse la ville (axe principal) : on élargit les routes proches de l'axe z≈0
  for (const r of placed) if (r.cls === 'tertiary' && Math.abs((r.a.z + r.b.z) / 2) < S * 0.6) r.cls = 'secondary';

  const els = [];
  const samples = [];                                             // {x,z,hw} pour garder les bâtiments hors des routes
  const SK = 20, sgrid = new Map(), sKey = (x, z) => Math.floor(x / SK) + ',' + Math.floor(z / SK);
  const addSample = (x, z, hw) => { const k = sKey(x, z); let a = sgrid.get(k); if (!a) sgrid.set(k, a = []); a.push([x, z, hw]); samples.push([x, z, hw]); };
  let wid = 50000;
  for (const r of placed) {
    const ids = r.P.map((p, k) => k === 0 ? nidFor(r.a) : k === r.P.length - 1 ? nidFor(r.b) : nid++);
    const hw = RW[r.cls] / 2;
    r.P.forEach(p => addSample(p[0], p[1], hw));
    // échantillons intermédiaires plus serrés pour que les tests de distance soient fiables
    for (let k = 0; k < r.P.length - 1; k++) addSample((r.P[k][0] + r.P[k + 1][0]) / 2, (r.P[k][1] + r.P[k + 1][1]) / 2, hw);
    r.hw = hw; r.ids = ids;
    els.push({ type: 'way', id: wid++, nodes: ids, geometry: r.P.map(p => ll(p[0], p[1])), tags: Object.assign({ highway: r.cls }, r.bridge ? { bridge: 'yes', layer: '1' } : {}) });
  }
  const nearRoad = (x, z, pad) => {                               // distance au bord de route le plus proche < pad ?
    const cx = Math.floor(x / SK), cz = Math.floor(z / SK), need = Math.ceil((pad + 14) / SK);
    for (let a = -need; a <= need; a++) for (let b = -need; b <= need; b++) {
      const g = sgrid.get((cx + a) + ',' + (cz + b)); if (!g) continue;
      for (const s of g) if (Math.hypot(s[0] - x, s[1] - z) < s[2] + pad) return true;
    }
    return false;
  };

  /* ---------------------------------------------------------------- 3. parcs, étangs, forêts (zones libres) */
  const blobs = [];                                               // {x,z,r}
  const blobPoly = (cx, cz, r, rough) => {
    const ph = [R() * 6.28, R() * 6.28, R() * 6.28], g = [], n = 30;
    for (let k = 0; k <= n; k++) {
      const a = (k % n) / n * Math.PI * 2, rad = r * (1 + rough * (0.5 * Math.sin(3 * a + ph[0]) + 0.3 * Math.sin(5 * a + ph[1]) + 0.2 * Math.sin(2 * a + ph[2])));
      g.push(ll(cx + Math.cos(a) * rad, cz + Math.sin(a) * rad));
    }
    return g;
  };
  const free = (x, z, r) => !nearRoad(x, z, r * 1.18 + 3) && !blobs.some(b => Math.hypot(b.x - x, b.z - z) < b.r + r * 1.18 + 6) && Math.hypot(x, z) < half - 90;
  const makeBlob = (kind, r0, r1, tries = 1500) => {
    for (let t = 0; t < tries; t++) {
      const r = rr(r0, r1) * (1 - t / 3000), x = rr(-half + 100, half - 100), z = rr(-half + 100, half - 100);
      if (!free(x, z, r)) continue;
      blobs.push({ x, z, r: r * 1.2, kind });
      const tags = kind === 'water' ? { natural: 'water' } : kind === 'wood' ? { natural: 'wood' } : { leisure: 'park' };
      els.push({ type: 'way', id: wid++, geometry: blobPoly(x, z, r, 0.16), tags });
      return true;
    }
    return false;
  };
  const specialTrack = ['skate', 'f1', 'sky'].includes(preset);
  const nPark = specialTrack ? 0 : 3 + Math.floor(R() * 2), nPond = preset === 'snow' ? 0 : preset === 'mountain' ? 4 : 2 + Math.floor(R() * 2), nWood = preset === 'mountain' ? 8 : preset === 'snow' ? 10 : specialTrack ? 0 : 2 + Math.floor(R() * 2);
  for (let i = 0; i < nPark; i++) makeBlob('park', 24, 36);
  for (let i = 0; i < nPond; i++) makeBlob('water', 12, 22);
  for (let i = 0; i < nWood; i++) makeBlob('wood', 22, 34);

  /* ---------------------------------------------------------------- 4. bâtiments */
  const bs = [];                                                  // {x,z,r}
  const bgrid = new Map(), BK = 30;
  const bAdd = b => { bs.push(b); const k = Math.floor(b.x / BK) + ',' + Math.floor(b.z / BK); let a = bgrid.get(k); if (!a) bgrid.set(k, a = []); a.push(b); };
  const bFree = (x, z, r) => {
    const cx = Math.floor(x / BK), cz = Math.floor(z / BK);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const g = bgrid.get((cx + a) + ',' + (cz + b)); if (g) for (const o of g) if (Math.hypot(o.x - x, o.z - z) < (o.r + r) * 0.8) return false; }
    return true;
  };
  const inBlob = (x, z, r) => blobs.some(b => Math.hypot(b.x - x, b.z - z) < b.r + r) || ((preset === 'city' || preset === 'mountain') && Math.abs(x) < 16 + r);
  let bid = 900000;
  const tryBuilding = (cx, cz, w, d, ang) => {
    const r = Math.hypot(w, d) / 2;
    if (Math.hypot(cx, cz) > half - 55) return false;
    if (!bFree(cx, cz, r) || inBlob(cx, cz, r * 0.8)) return false;
    const co = Math.cos(ang), si = Math.sin(ang), loc = (u, v) => [cx + u * co - v * si, cz + u * si + v * co];
    const shapeR = R(), hw2 = w / 2, hd2 = d / 2;
    let ring;
    if (shapeR < 0.7) ring = [[-hw2, -hd2], [hw2, -hd2], [hw2, hd2], [-hw2, hd2]];
    else if (shapeR < 0.88) {                                     // bâtiment en L
      const cw = w * rr(0.35, 0.5), cd = d * rr(0.4, 0.55), sx = R() < 0.5 ? 1 : -1, sz = R() < 0.5 ? 1 : -1;
      const q = [[-hw2, -hd2], [hw2, -hd2], [hw2, hd2], [-hw2, hd2]];
      const ix = sx > 0 ? hw2 : -hw2, iz = sz > 0 ? hd2 : -hd2;
      ring = []; for (const c of q) {
        if (c[0] === ix && c[1] === iz) { ring.push([ix - sx * cw, iz], [ix - sx * cw, iz - sz * cd], [ix, iz - sz * cd]); } else ring.push(c);
      }
    } else { ring = []; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; ring.push([Math.cos(a) * hw2, Math.sin(a) * hd2]); } }   // tour ronde
    const P = ring.map(c => loc(c[0], c[1]));
    for (const p of P) if (nearRoad(p[0], p[1], 3.2)) return false;
    if (nearRoad(cx, cz, 3.2)) return false;
    // hauteur : plus haut vers le centre-ville
    const dc = Math.hypot(cx, cz) / half, rd = R();
    let h, bt;
    if (rd < 0.58 - dc * 0.15) { h = rr(5.2, 8); bt = 'house'; }
    else if (rd < 0.84) { h = rr(9, 16); bt = 'apartments'; }
    else if (rd < 0.95 - dc * 0.05) { h = rr(18, 32); bt = 'commercial'; }
    else { h = rr(34, 58 - dc * 20); bt = 'office'; }
    if (shapeR >= 0.88 && h < 12) h = rr(12, 22);
    bAdd({ x: cx, z: cz, r });
    const g = P.map(p => ll(p[0], p[1])); g.push(g[0]);
    els.push({ type: 'way', id: bid++, geometry: g, tags: { building: bt, height: h.toFixed(1) } });
    return true;
  };
  // (a) le long des routes, avec retrait, rotation et trous aléatoires
  for (const r of placed) {
    const P = r.P, cum = [0]; for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
    const total = cum[cum.length - 1];
    if (r.cls === 'cycleway' || ['skate', 'mountain', 'snow'].includes(preset)) continue;
    const at = s => {
      let k = 1; while (k < cum.length - 1 && cum[k] < s) k++;
      const t = (s - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1), x = P[k - 1][0] + (P[k][0] - P[k - 1][0]) * t, z = P[k - 1][1] + (P[k][1] - P[k - 1][1]) * t;
      const dx = P[k][0] - P[k - 1][0], dz = P[k][1] - P[k - 1][1], l = Math.hypot(dx, dz) || 1;
      return { x, z, tx: dx / l, tz: dz / l };
    };
    for (const side of [-1, 1]) {
      let s = rr(8, 24);
      while (s < total - 8) {
        const w = rr(8, 20), d = rr(8, 15), gap = rr(3.5, 12);
        const q = at(Math.min(total, s + w / 2)), off = r.hw + gap + d / 2;
        const cx = q.x + (-q.tz) * off * side, cz = q.z + q.tx * off * side;
        const ang = Math.atan2(q.tz, q.tx) + rr(-0.1, 0.1);
        tryBuilding(cx, cz, w, d, ang);
        s += w + (R() < 0.2 ? rr(14, 40) : rr(1.5, 9));
      }
    }
  }
  // (b) bâtiments dispersés à l'intérieur des îlots, orientés au hasard
  const scatter = preset === 'city' ? 1400 : 0;
  for (let t = 0; t < scatter; t++) {
    const w = rr(8, 17), d = rr(8, 14), cx = rr(-half + 50, half - 50), cz = rr(-half + 50, half - 50);
    tryBuilding(cx, cz, w, d, R() * Math.PI);
  }
  const addCourse = (coords, highway, extra = {}, closed = false) => {
    const pts = coords.slice();
    if (closed && pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) > 0.2) pts.push(pts[0]);
    const ids = pts.map((_, i) => closed && i === pts.length - 1 ? null : nid++);
    if (closed && ids.length) ids[ids.length - 1] = ids[0];
    els.push({ type: 'way', id: wid++, nodes: ids, geometry: pts.map(p => ll(p[0], p[1])), tags: Object.assign({ highway, name: extra.name || 'Parcours imaginaire' }, extra) });
  };
  const oval = (cx, cz, rx, rz, count, ripple = 0) => {
    const pts = [];
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2, r = 1 + ripple * Math.sin(a * 5 + 0.7);
      pts.push([cx + Math.cos(a) * rx * r, cz + Math.sin(a) * rz * r]);
    }
    return pts;
  };
  if (preset === 'city') {
    const a = [], b = [], count = 48;
    for (let i = 0; i <= count; i++) {
      const z = -half + 28 + i * (2 * half - 56) / count;
      const center = 18 * Math.sin(z / 105);
      a.push([center - 10, z]); b.push([center + 10, z]);
    }
    const river = a.concat(b.reverse()); river.push(river[0]);
    els.push({ type: 'way', id: wid++, geometry: river.map(p => ll(p[0], p[1])), tags: { natural: 'water', water: 'river', name: 'Rivière' } });
  }
  if (preset === 'city') {
    const bridge = [[-108, 0], [-72, 0], [-36, 0], [0, 0], [36, 0], [72, 0], [108, 0]];
    addCourse(bridge, 'secondary', { name: 'Pont de la rivière', bridge: 'yes', layer: '1' });
  }
  if (preset === 'skate') {
    const loop = [[-98, -58], [-58, -100], [56, -100], [100, -56], [100, 56], [56, 100], [-56, 100], [-100, 56], [-98, -58]];
    addCourse(loop, 'residential', { name: 'Tour du skatepark', surface: 'concrete' }, true);
    addCourse(oval(0, 0, 50, 31, 64, 0.04), 'residential', { name: 'Pump track', surface: 'concrete' }, true);
    addCourse(oval(0, 0, 20, 12, 48, 0.02), 'cycleway', { name: 'Mini-boucle', surface: 'concrete' }, true);
  }
  if (preset === 'mountain') {
    const trail = [[0, 0], [28, -44], [62, -82], [94, -116], [130, -128], [166, -95], [202, -46], [236, 6], [265, 55], [236, 96], [198, 130], [154, 156], [112, 142], [72, 106], [35, 65], [0, 22]];
    addCourse(trail, 'cycleway', { name: 'Sentier des crêtes', surface: 'gravel' });
  }
  if (preset === 'f1') {
    const track = [[0, -205], [92, -196], [170, -154], [240, -112], [256, -58], [235, -4], [180, 26], [112, 23], [76, 51], [118, 91], [192, 125], [220, 178], [178, 226], [104, 220], [45, 185], [10, 132], [-56, 154], [-122, 202], [-202, 184], [-252, 130], [-246, 72], [-214, 25], [-150, 4], [-88, -18], [-120, -62], [-204, -82], [-250, -132], [-205, -180], [-108, -214], [-26, -210]];
    addCourse(track, 'primary', { name: 'Circuit F1 — tour complet', surface: 'asphalt' }, true);
  }
  if (preset === 'snow') {
    const track = oval(-15, 0, 285, 225, 160, 0.03);
    addCourse(track, 'cycleway', { name: 'Piste de motoneige', surface: 'snow' }, true);
    const trail = [];
    for (let i = 0; i <= 64; i++) { const x = -half + 25 + i * (2 * half - 50) / 64; trail.push([x, 135 * Math.sin(x / 94) + 38 * Math.sin(x / 39)]); }
    addCourse(trail, 'cycleway', { name: 'Sentier enneigé', surface: 'snow' });
  }
  if (preset === 'sky') {
    const route = [[0, 0], [48, -16], [82, -72], [132, -102], [192, -84], [224, -28], [210, 38], [162, 78], [106, 50], [55, 83], [0, 52], [-40, 12], [-28, -44], [24, -84], [76, -72]];
    addCourse(route, 'residential', { name: 'Relais dans le ciel', surface: 'wood', bridge: 'yes', layer: '1' }, true);
  }
  return { elements: els, half, nBuildings: bs.length };
}

function syntheticHeight(preset, seed) {
  const phase = ((seed >>> 0) % 4096) / 4096 * Math.PI * 2;
  if (preset === 'mountain') return (x, z) => {
    // Des sommets hauts autour du parcours; le sentier lui-même garde des pentes roulables.
    const peaks = 245 * Math.exp(-(((x + 455) ** 2) / 44000 + ((z + 445) ** 2) / 52000))
      + 270 * Math.exp(-(((x - 455) ** 2) / 50000 + ((z - 445) ** 2) / 56000))
      + 200 * Math.exp(-(((x + 455) ** 2) / 50000 + ((z - 445) ** 2) / 48000))
      + 220 * Math.exp(-(((x - 455) ** 2) / 52000 + ((z + 445) ** 2) / 50000));
    const ridge = 5 * Math.sin(x / 170 + phase) + 4 * Math.cos(z / 160 - phase) + 3 * Math.sin((x + z) / 210);
    return ridge + peaks;
  };
  if (preset === 'snow') return (x, z) => {
    const broad = 3.5 * Math.sin(x / 112 + phase) + 3 * Math.cos(z / 96 - phase);
    const humps = 9 * Math.pow(Math.max(0, Math.sin((x + phase * 12) / 47) * Math.cos((z - phase * 9) / 53)), 4)
      + 7 * Math.pow(Math.max(0, Math.cos((x - phase * 8) / 75) * Math.sin((z + phase * 11) / 68)), 6);
    return broad + humps;
  };
  if (preset === 'f1' || preset === 'skate' || preset === 'sky') return (x, z) => 0.45 * Math.sin(x / 180 + phase) + 0.35 * Math.cos(z / 170 - phase);
  return (x, z) => 2.2 * Math.sin(x / 92 + phase) + 1.7 * Math.cos(z / 118 - phase) - 9 * Math.exp(-(x * x / 430 + z * z / 90000));
}

// ville prête à jouer : même structure que la carte réelle
export function makeCity(seed, tri, half = 400, preset = 'city') {
  const j = generateCityJSON(seed, half, preset);
  const D = parseOSM(j, LAT0, LON0, tri, half);
  D.synthetic = true; D.me = [0, 0]; D.heading = null; D.seed = seed; D.preset = preset;
  D.syntheticHeight = syntheticHeight(preset, seed);
  D.me = preset === 'f1' ? [0, -205] : preset === 'skate' ? [-98, -58] : preset === 'snow' ? [270, 0] : [0, 0];
  D.syntheticHmin = preset === 'mountain' ? -16 : preset === 'city' ? -20 : preset === 'snow' ? -14 : preset === 'skate' ? -3 : -4;
  return D;
}
