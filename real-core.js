// Carte réelle — logique pure (sans three.js) : lecture OpenStreetMap, index spatial, collisions, routes.
// Repère local : x = est (m), z = sud (m), origine = point (lat0, lon0). Le nord est donc vers -Z (comme le cap du jeu).
export const HALF = 1500;     // demi-côté de la zone chargée : 3 km × 3 km
export const CH = 250;        // taille d'un morceau (chunk) de carte, en mètres

const R = Math.PI / 180;

/* largeur (m) des types de voies dessinés */
export const RW = {
  motorway: 12, motorway_link: 7, trunk: 11, trunk_link: 7, primary: 10, primary_link: 7, secondary: 9, secondary_link: 6.5,
  tertiary: 8, tertiary_link: 6, residential: 7, unclassified: 6.5, living_street: 5.5, service: 4.2, road: 6.5, track: 3.2,
  cycleway: 2.6, footway: 1.7, path: 1.5, pedestrian: 3.5, bridleway: 1.8, corridor: 1.5
};
export const kindOf = c => c === 'cycleway' ? 'lane' : ['footway', 'path', 'pedestrian', 'bridleway', 'corridor'].includes(c) ? 'foot' : 'car';
// voies utilisées pour placer drapeaux et pièces (pas d'autoroute, pas de stationnement)
const GRAPHC = new Set(['residential', 'living_street', 'unclassified', 'tertiary', 'tertiary_link', 'secondary', 'secondary_link', 'cycleway']);

const hs = (id, k) => { const s = Math.sin(id * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
export const hash01 = hs;

function buildingHeight(t, id) {
  let h = parseFloat(t.height);
  if (isFinite(h) && h > 0) return Math.min(h, 200);
  const l = parseFloat(t['building:levels']);
  if (isFinite(l) && l > 0) return Math.min(l * 3.1 + 1, 200);
  const b = t.building;
  if (['house', 'detached', 'semidetached_house', 'bungalow', 'residential', 'terrace', 'cabin', 'static_caravan'].includes(b)) return 5.2 + hs(id, 1) * 2.2;
  if (['garage', 'garages', 'shed', 'carport', 'roof', 'greenhouse', 'hut', 'kiosk', 'service'].includes(b)) return 2.6 + hs(id, 2) * 0.8;
  if (['apartments', 'dormitory', 'hotel', 'office', 'commercial', 'retail', 'hospital', 'school', 'university', 'church', 'cathedral', 'civic', 'public'].includes(b)) return 9 + hs(id, 3) * 7;
  if (['industrial', 'warehouse', 'barn', 'farm_auxiliary', 'manufacture', 'supermarket'].includes(b)) return 7 + hs(id, 4) * 3;
  return 5.5 + hs(id, 5) * 4;
}

const bbox = p => {
  let a = 1e12, b = -1e12, c = 1e12, d = -1e12;
  for (let i = 0; i < p.length; i += 2) { if (p[i] < a) a = p[i]; if (p[i] > b) b = p[i]; if (p[i + 1] < c) c = p[i + 1]; if (p[i + 1] > d) d = p[i + 1]; }
  return [a, b, c, d];
};
const areaOf = p => { let s = 0; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) s += p[j] * p[i + 1] - p[i] * p[j + 1]; return s / 2; };

// assemble des morceaux de contour (relations multipolygones) en anneaux fermés
function stitch(segs) {
  const key = (x, z) => Math.round(x * 50) + '_' + Math.round(z * 50);
  const rest = segs.filter(s => s.length >= 4).map(s => s.slice()), rings = [];
  while (rest.length) {
    let cur = rest.pop();
    let guard = 0;
    while (guard++ < 5000) {
      const n = cur.length, sk = key(cur[0], cur[1]), ek = key(cur[n - 2], cur[n - 1]);
      if (sk === ek && n >= 8) { rings.push(cur); cur = null; break; }
      let found = -1, rev = false, front = false;
      for (let i = 0; i < rest.length; i++) {
        const s = rest[i], m = s.length;
        if (key(s[0], s[1]) === ek) { found = i; break; }
        if (key(s[m - 2], s[m - 1]) === ek) { found = i; rev = true; break; }
        if (key(s[m - 2], s[m - 1]) === sk) { found = i; front = true; break; }
        if (key(s[0], s[1]) === sk) { found = i; front = true; rev = true; break; }
      }
      if (found < 0) break;
      let s = rest.splice(found, 1)[0];
      if (rev) { const r = []; for (let i = s.length - 2; i >= 0; i -= 2) r.push(s[i], s[i + 1]); s = r; }
      cur = front ? s.concat(cur.slice(2)) : cur.concat(s.slice(2));
    }
  }
  return rings;
}

/* json = réponse Overpass (out geom) · tri(anneau, trous) -> triangles à plat [x,z,x,z,x,z,…] */
export function parseOSM(json, lat0, lon0, tri, half = HALF) {
  const kx = 111320 * Math.cos(lat0 * R), kz = 111320;
  const D = {
    lat0, lon0, half,
    loc: (la, lo) => [(lo - lon0) * kx, -(la - lat0) * kz],
    back: (x, z) => [lat0 - z / kz, lon0 + x / kx],
    cells: new Map(), signals: [], signs: [], roads: [], buildings: [], water: [], green: [], woods: [], parking: [], nodes: new Map(), ek: new Map(), inter: [], nodeArr: null, stats: {}
  };
  const cell = (cx, cz) => {
    const k = cx + ',' + cz; let c = D.cells.get(k);
    if (!c) { c = { cx, cz, b: [], bc: [], rs: [], wt: [], gr: [], wd: [], wp: [], pk: [], pp: [] }; D.cells.set(k, c); }
    return c;
  };
  const cellAt = (x, z) => cell(Math.floor(x / CH), Math.floor(z / CH));
  const flat = g => { const p = []; for (const q of g) { if (!q) continue; const l = D.loc(q.lat, q.lon); p.push(l[0], l[1]); } return p; };
  const closed = p => p.length >= 8 && Math.abs(p[0] - p[p.length - 2]) < 0.02 && Math.abs(p[1] - p[p.length - 1]) < 0.02;
  const polyInto = (ring, holes, target, list) => {
    const bb = bbox(ring);
    const rec = { p: ring, holes: holes || [], minx: bb[0], maxx: bb[1], minz: bb[2], maxz: bb[3], wl: null };
    list.push(rec);
    if (target === 'pk') {
      const ca = Math.floor(bb[0] / CH), cb = Math.floor(bb[1] / CH), cc = Math.floor(bb[2] / CH), cd = Math.floor(bb[3] / CH);
      if ((cb - ca + 1) * (cd - cc + 1) <= 100) for (let i = ca; i <= cb; i++) for (let j = cc; j <= cd; j++) cell(i, j).pp.push(rec);
    }
    if (target === 'wt') {                                           // index : chaque case touchée connaît ce plan d'eau (niveau d'eau, test « dans l'eau »)
      const ca = Math.floor(bb[0] / CH), cb = Math.floor(bb[1] / CH), cc = Math.floor(bb[2] / CH), cd = Math.floor(bb[3] / CH);
      if ((cb - ca + 1) * (cd - cc + 1) <= 900) for (let i = ca; i <= cb; i++) for (let j = cc; j <= cd; j++) cell(i, j).wp.push(rec);
    }
    let t; try { t = tri(ring, holes || []); } catch (e) { return; }
    for (let i = 0; i + 5 < t.length; i += 6) {
      const cx = (t[i] + t[i + 2] + t[i + 4]) / 3, cz = (t[i + 1] + t[i + 3] + t[i + 5]) / 3;
      const arr = cellAt(cx, cz)[target];
      for (let k = 0; k < 6; k++) arr.push(t[i + k]);
    }
  };

  const seenB = new Set();
  const addB = (p, id, t) => {                                       // v9.28 : un bâtiment (way ou contour d'une relation)
    if (p.length < 6) return;
    if (areaOf(p) < 0) { const r = []; for (let i = p.length - 2; i >= 0; i -= 2) r.push(p[i], p[i + 1]); p = r; }   // sens fixe
    const sig = Math.round(p[0] * 10) + '_' + Math.round(p[1] * 10) + '_' + Math.round(Math.abs(areaOf(p)));
    if (seenB.has(sig)) return; seenB.add(sig);                       // évite les doublons (way + relation)
    const bb = bbox(p), rec = { id, p, minx: bb[0], maxx: bb[1], minz: bb[2], maxz: bb[3], h: buildingHeight(t, id), bt: t.building, rs: t['roof:shape'], rh: parseFloat(t['roof:height']) };
    D.buildings.push(rec); cellAt((bb[0] + bb[1]) / 2, (bb[2] + bb[3]) / 2).b.push(rec);
    const ca = Math.floor(bb[0] / CH), cb = Math.floor(bb[1] / CH), cc = Math.floor(bb[2] / CH), cd = Math.floor(bb[3] / CH);   // collision : toutes les cases touchées (grands bâtiments)
    if ((cb - ca + 1) * (cd - cc + 1) <= 64) for (let i = ca; i <= cb; i++) for (let j = cc; j <= cd; j++) cell(i, j).bc.push(rec);
  };
  const parkOK = t => t.amenity === 'parking' && t.parking !== 'underground' && t.parking !== 'multi-storey' && t.location !== 'underground' && !t.building;

  for (const e of json.elements || []) {
    const t = e.tags || {};
    if (e.type === 'way' && e.geometry && e.geometry.length >= 2) {
      let p = flat(e.geometry);
      if (t.building) {
        if (!closed(p)) continue;
        p = p.slice(0, -2);
        addB(p, e.id, t);
      } else if (t.highway) {
        const w = RW[t.highway]; if (!w || t.area === 'yes' || (t.tunnel && t.tunnel !== 'no')) continue;
        const isBr = !!(t.bridge && t.bridge !== 'no'), P0 = p, n0c = P0.length / 2;
        if (isBr) {                                                    // v9.21 : pont = un point tous les ~5 m (tablier fidèle au relief, parapets et collisions précis) ; le graphe garde les points d'origine
          const q = [P0[0], P0[1]];
          for (let i = 1; i < n0c; i++) {
            const ax = P0[i * 2 - 2], az = P0[i * 2 - 1], bx = P0[i * 2], bz = P0[i * 2 + 1], k = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 5));
            for (let j = 1; j <= k; j++) q.push(ax + (bx - ax) * j / k, az + (bz - az) * j / k);
          }
          p = q;
        }
        const n = p.length / 2, nl = new Float32Array(n * 2), ns = new Float32Array(n), cl = new Float32Array(n);
        const dir = i => { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); let dx = p[b * 2] - p[a * 2], dz = p[b * 2 + 1] - p[a * 2 + 1]; const l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
        for (let i = 0; i < n; i++) {
          const a = i > 0 ? [p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]] : null, b = i < n - 1 ? [p[i * 2 + 2] - p[i * 2], p[i * 2 + 3] - p[i * 2 + 1]] : null;
          const la = a ? Math.hypot(a[0], a[1]) || 1 : 1, lb = b ? Math.hypot(b[0], b[1]) || 1 : 1;
          const pa = a ? [-a[1] / la, a[0] / la] : null, pb = b ? [-b[1] / lb, b[0] / lb] : null;
          let nx, nz;
          if (pa && pb) { nx = pa[0] + pb[0]; nz = pa[1] + pb[1]; const l = Math.hypot(nx, nz); if (l < 0.2) { nx = pa[0]; nz = pa[1]; } else { nx /= l; nz /= l; } }
          else { const d = dir(i); nx = -d[1]; nz = d[0]; }
          const ref = pa || pb, dot = Math.max(0.55, nx * ref[0] + nz * ref[1]);
          nl[i * 2] = nx; nl[i * 2 + 1] = nz; ns[i] = 1 / dot;
          if (i) cl[i] = cl[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
        }
        const ri = D.roads.length, kind = kindOf(t.highway);
        D.roads.push({ id: e.id, cls: t.highway, kind, w, p, nl, ns, cl, br: isBr, n0: e.nodes && e.nodes.length === n0c ? e.nodes[0] : null, n1: e.nodes && e.nodes.length === n0c ? e.nodes[n0c - 1] : null, deck: null });
        for (let i = 0; i < n - 1; i++) cellAt((p[i * 2] + p[i * 2 + 2]) / 2, (p[i * 2 + 1] + p[i * 2 + 3]) / 2).rs.push(ri, i);
        if (GRAPHC.has(t.highway) && e.nodes && e.nodes.length === n0c) {
          let prev = null;
          for (let i = 0; i < n0c; i++) {
            const id = e.nodes[i]; let nd = D.nodes.get(id);
            if (!nd) { nd = { id, x: P0[i * 2], z: P0[i * 2 + 1], a: [] }; D.nodes.set(id, nd); }
            if (prev && prev !== nd) {
              if (!nd.a.includes(prev.id)) nd.a.push(prev.id); if (!prev.a.includes(nd.id)) prev.a.push(nd.id);
              const inf = { w, kind, cls: t.highway, br: isBr }; D.ek.set(prev.id + '|' + nd.id, inf); D.ek.set(nd.id + '|' + prev.id, inf);
            }
            prev = nd;
          }
        }
      } else if (t.waterway === 'river' || t.waterway === 'canal') {
        const W = Math.max(4, Math.min(120, parseFloat(t.width) || (t.waterway === 'river' ? 28 : 10))) / 2, n = p.length / 2, Lp = [], Rp = [];
        for (let i = 0; i < n; i++) {
          const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); let dx = p[b * 2] - p[a * 2], dz = p[b * 2 + 1] - p[a * 2 + 1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          Lp.push(p[i * 2] - dz * W, p[i * 2 + 1] + dx * W); Rp.push(p[i * 2] + dz * W, p[i * 2 + 1] - dx * W);
        }
        const ring = Lp.slice(); for (let i = Rp.length - 2; i >= 0; i -= 2) ring.push(Rp[i], Rp[i + 1]);
        if (ring.length >= 8) polyInto(ring, [], 'wt', D.water);
      } else if (t.natural === 'water' || t.waterway === 'riverbank') {
        if (closed(p)) polyInto(p.slice(0, -2), [], 'wt', D.water);
      } else if (parkOK(t)) {
        if (closed(p)) polyInto(p.slice(0, -2), [], 'pk', D.parking);
      } else if (t.natural === 'wood' || t.landuse === 'forest' || t.natural === 'scrub') {
        if (closed(p)) polyInto(p.slice(0, -2), [], 'wd', D.woods);
      } else if (t.landuse || t.leisure) {
        if (closed(p)) polyInto(p.slice(0, -2), [], 'gr', D.green);
      }
    } else if (e.type === 'node' && e.lat != null) {
      const l = D.loc(e.lat, e.lon);
      if (t.highway === 'traffic_signals') D.signals.push({ x: l[0], z: l[1] });
      else {
        const tag = String(t.traffic_sign || '').toLowerCase();
        const type = t.highway === 'stop' || /(^|[;| ])stop([;| ]|$)/.test(tag) ? 'stop'
          : t.highway === 'give_way' || /(^|[;| ])give_way([;| ]|$)/.test(tag) ? 'give_way' : null;
        if (type) D.signs.push({ x: l[0], z: l[1], type });
      }
    } else if (e.type === 'relation' && e.members && (t.building || parkOK(t))) {
      const outs = [], ins = [];
      for (const m of e.members) if (m.type === 'way' && m.geometry && m.geometry.length >= 2) (m.role === 'inner' ? ins : outs).push(flat(m.geometry));
      const O = stitch(outs).map(r => r.slice(0, -2)), I = stitch(ins).map(r => r.slice(0, -2));
      O.forEach((o, k) => {
        if (t.building) { addB(o, e.id * 8 + k + 5e9, t); return; }
        const bb = bbox(o), holes = I.filter(h => h[0] >= bb[0] && h[0] <= bb[1] && h[1] >= bb[2] && h[1] <= bb[3]);
        polyInto(o, holes, 'pk', D.parking);
      });
    } else if (e.type === 'relation' && e.members && (t.natural === 'water' || t.waterway === 'riverbank')) {
      const outs = [], ins = [];
      for (const m of e.members) if (m.type === 'way' && m.geometry && m.geometry.length >= 2) (m.role === 'inner' ? ins : outs).push(flat(m.geometry));
      const O = stitch(outs).map(r => r.slice(0, -2)), I = stitch(ins).map(r => r.slice(0, -2));
      for (const o of O) {
        const bb = bbox(o), holes = I.filter(h => h[0] >= bb[0] && h[0] <= bb[1] && h[1] >= bb[2] && h[1] <= bb[3]);
        polyInto(o, holes, 'wt', D.water);
      }
    }
  }
  D.inter = [...D.nodes.values()].filter(n => n.a.length >= 3);
  D.stats = { parking: D.parking.length, buildings: D.buildings.length, roads: D.roads.length, water: D.water.length, signs: D.signs.length, signals: D.signals.length, nodes: D.nodes.size, inter: D.inter.length };
  return D;
}

/* ---------------------------------------------------------------- requêtes spatiales */
export function inPoly(p, x, z) {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function nearEdge(p, x, z, m) {
  const m2 = m * m;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const ax = p[j], az = p[j + 1], bx = p[i], bz = p[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const u = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0, qx = ax + dx * u - x, qz = az + dz * u - z;
    if (qx * qx + qz * qz < m2) return true;
  }
  return false;
}
// un bâtiment (ou ses murs, à `m` mètres près) à ce point ?
export function hitBuilding(D, x, z, m = 0.5) {
  const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const c = D.cells.get((cx + a) + ',' + (cz + b)); if (!c) continue;
    for (const r of (c.bc || c.b)) {
      if (x < r.minx - m || x > r.maxx + m || z < r.minz - m || z > r.maxz + m) continue;
      if (inPoly(r.p, x, z) || nearEdge(r.p, x, z, m)) return true;
    }
  }
  return false;
}
function segNear(D, x, z, cx, cz, rad, kinds, out) {
  for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) {
    const c = D.cells.get((cx + a) + ',' + (cz + b)); if (!c) continue;
    for (let k = 0; k < c.rs.length; k += 2) {
      const r = D.roads[c.rs[k]]; if (!kinds.includes(r.kind)) continue;
      const i = c.rs[k + 1], ax = r.p[i * 2], az = r.p[i * 2 + 1], bx = r.p[i * 2 + 2], bz = r.p[i * 2 + 3], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      const u = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0, qx = ax + dx * u, qz = az + dz * u, d = Math.hypot(qx - x, qz - z);
      out(r, d, qx, qz, dx, dz, i, u);
    }
  }
}
// sur une route ou une piste ?
export function onRoad(D, x, z) {
  let on = false;
  segNear(D, x, z, Math.floor(x / CH), Math.floor(z / CH), 1, ['car', 'lane', 'foot'], (r, d) => { if (d < r.w / 2 + 0.6) on = true; });
  return on;
}
// point de route le plus proche (pour remettre le joueur sur la route) + direction de la route
export function nearestRoad(D, x, z, kinds = ['car', 'lane']) {
  const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
  for (const rad of [1, 2, 4]) {
    let best = null;
    segNear(D, x, z, cx, cz, rad, kinds, (r, d, qx, qz, dx, dz) => {
      if (!best || d < best.d) { const l = Math.hypot(dx, dz) || 1; best = { x: qx, z: qz, dx: dx / l, dz: dz / l, d }; }
    });
    if (best) return best;
  }
  return null;
}

/* ---------------------------------------------------------------- itinéraire (Dijkstra sur le réseau routier) */
function nearestNode(D, x, z) {
  if (!D.nodeArr) D.nodeArr = [...D.nodes.values()];
  let b = null, bd = 1e18;
  for (const n of D.nodeArr) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; b = n; } }
  return b;
}
export function route(D, x1, z1, x2, z2) {
  const A = nearestNode(D, x1, z1), B = nearestNode(D, x2, z2);
  if (!A || !B) return null;
  const dist = new Map([[A.id, 0]]), prev = new Map(), heap = [[0, A.id]], done = new Set();
  const push = it => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let i = 0;
      for (;;) { let l = i * 2 + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
    }
    return top;
  };
  while (heap.length) {
    const [d, id] = pop(); if (done.has(id)) continue; done.add(id);
    if (id === B.id) break;
    const n = D.nodes.get(id);
    for (const q of n.a) {
      const m = D.nodes.get(q); if (!m || done.has(q)) continue;
      const nd = d + Math.hypot(m.x - n.x, m.z - n.z);
      if (nd < (dist.get(q) ?? 1e18)) { dist.set(q, nd); prev.set(q, id); push([nd, q]); }
    }
  }
  if (!done.has(B.id)) return null;
  const path = []; let c = B.id;
  while (c != null) { const n = D.nodes.get(c); path.push([n.x, n.z]); c = prev.get(c); }
  return path.reverse();
}


/* ---------------------------------------------------------------- ponts, eau, aimant à la route */
// hauteur du tablier d'un pont à (x, z) — null si pas de pont ici. cy = altitude actuelle du joueur : si une route passe SOUS un pont, on garde celle qui est la plus proche.
export function bridgeY(D, x, z, cy = null) {
  let best = null, bd = 1e9;
  segNear(D, x, z, Math.floor(x / CH), Math.floor(z / CH), 1, ['car', 'lane', 'foot'], (r, d, qx, qz, dx, dz, i, u) => {
    if (!r.br || !r.deck || d > r.w / 2 + 0.8) return;
    const y = r.deck[i] + (r.deck[i + 1] - r.deck[i]) * u + 0.06, k = cy == null ? 0 : Math.abs(y - cy);
    if (k < bd) { bd = k; best = y; }
  });
  if (D.bfill) for (const q of D.bfill) {                                 // tablier continu entre les voies d'un même pont
    const x0 = Math.min(...q.x), x1 = Math.max(...q.x), z0 = Math.min(...q.z), z1 = Math.max(...q.z);
    if (x < x0 || x > x1 || z < z0 || z > z1) continue;
    for (const T of [[0, 1, 2], [1, 3, 2]]) {
      const [a, b, c] = T, d = (q.z[b] - q.z[c]) * (q.x[a] - q.x[c]) + (q.x[c] - q.x[b]) * (q.z[a] - q.z[c]); if (Math.abs(d) < 1e-9) continue;
      const l1 = ((q.z[b] - q.z[c]) * (x - q.x[c]) + (q.x[c] - q.x[b]) * (z - q.z[c])) / d, l2 = ((q.z[c] - q.z[a]) * (x - q.x[c]) + (q.x[a] - q.x[c]) * (z - q.z[c])) / d, l3 = 1 - l1 - l2;
      if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
      const y = l1 * q.y[a] + l2 * q.y[b] + l3 * q.y[c] + 0.05, k = cy == null ? 0 : Math.abs(y - cy);
      if (k < bd) { bd = k; best = y; }
    }
  }
  return best;
}
// le plan d'eau qui contient (x, z), ou null (trous des îles exclus)
export function waterRec(D, x, z) {
  const c = D.cells.get(Math.floor(x / CH) + ',' + Math.floor(z / CH)); if (!c || !c.wp.length) return null;
  for (const r of c.wp) {
    if (x < r.minx || x > r.maxx || z < r.minz || z > r.maxz || !inPoly(r.p, x, z)) continue;
    let hole = false; for (const h of r.holes) if (inPoly(h, x, z)) { hole = true; break; }
    if (!hole) return r;
  }
  return null;
}
// sur un stationnement ?
export function inParking(D, x, z) {
  const c = D.cells.get(Math.floor(x / CH) + ',' + Math.floor(z / CH)); if (!c || !c.pp.length) return false;
  for (const r of c.pp) {
    if (x < r.minx || x > r.maxx || z < r.minz || z > r.maxz || !inPoly(r.p, x, z)) continue;
    let hole = false; for (const h of r.holes) if (inPoly(h, x, z)) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}
// dans l'eau (et pas sur un pont) ?
export function inWater(D, x, z) { return !!waterRec(D, x, z) && bridgeY(D, x, z) == null; }

// aimant à la route : la route (voiture / piste cyclable / sentier) qui colle le mieux à une position GPS et à un cap (hx, hz = vecteur du cap, ou null).
// renvoie { x, z, dx, dz (sens de marche), d, r, br } ou null
export function matchRoad(D, x, z, hx, hz, prev = null, maxd = 24) {
  let best = null, bc = 1e9;
  segNear(D, x, z, Math.floor(x / CH), Math.floor(z / CH), 1, ['car', 'lane', 'foot'], (r, d, qx, qz, dx, dz) => {
    const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
    let dot = hx == null ? 1 : ux * hx + uz * hz; const a = Math.abs(dot);
    if (hx != null && a < 0.55) return;                                       // route en travers du cap : pas la bonne
    const off = Math.max(0, d - r.w / 2);
    const cost = off + (1 - a) * 22 + (r === prev ? -8 : 0) + (r.kind === 'foot' ? 5 : 0);
    if (off <= maxd && cost < bc) { bc = cost; best = { x: qx, z: qz, dx: dot < 0 ? -ux : ux, dz: dot < 0 ? -uz : uz, d, r, br: !!r.br }; }
  });
  return best;
}

// Un arbre / lampadaire peut-il se trouver ici ? Non s'il est sur (ou contre) une route, une piste cyclable, un sentier ou le trottoir d'une rue.
// walks = les rues ont des trottoirs (jusqu'à 1,9 m du bord de la chaussée) ; pad = marge supplémentaire (rayon du tronc).
const WALKED = new Set(['residential', 'tertiary', 'secondary', 'primary', 'unclassified', 'living_street']);
export function clearOfRoads(D, x, z, pad = 0.6, walks = true) {
  let ok = true;
  segNear(D, x, z, Math.floor(x / CH), Math.floor(z / CH), 1, ['car', 'lane', 'foot'], (r, d) => {
    if (!ok) return;
    const reach = r.w / 2 + (r.kind === 'car' && walks && WALKED.has(r.cls) ? 1.9 : 0) + pad;
    if (d < reach) ok = false;
  });
  return ok;
}

// Récompenses du mode libre : positions FIXES et régulières le long des routes et pistes cyclables (toujours aux mêmes endroits pour une même carte).
// pièce tous les 60 m, anneau tous les 180 m, drapeau tous les 360 m (n = numéro du palier le long de la route).
const NOREW = new Set(['motorway', 'trunk', 'motorway_link', 'trunk_link', 'service', 'track']);
export function rewardsNear(D, x, z, R, step = 60) {
  const out = [], seen = new Set(), R2 = R * R;
  for (let cx = Math.floor((x - R) / CH); cx <= Math.floor((x + R) / CH); cx++) for (let cz = Math.floor((z - R) / CH); cz <= Math.floor((z + R) / CH); cz++) {
    const c = D.cells.get(cx + ',' + cz); if (!c) continue;
    for (let k = 0; k < c.rs.length; k += 2) {
      const r = D.roads[c.rs[k]], i = c.rs[k + 1];
      if ((r.kind !== 'car' && r.kind !== 'lane') || NOREW.has(r.cls)) continue;
      const s0 = r.cl[i], s1 = r.cl[i + 1]; if (s1 <= s0) continue;
      for (let n = Math.max(1, Math.ceil(s0 / step)); n * step < s1; n++) {
        const key = r.id + ':' + n; if (seen.has(key)) continue;
        const f = (n * step - s0) / (s1 - s0), px = r.p[i * 2] + (r.p[i * 2 + 2] - r.p[i * 2]) * f, pz = r.p[i * 2 + 1] + (r.p[i * 2 + 3] - r.p[i * 2 + 1]) * f;
        if ((px - x) ** 2 + (pz - z) ** 2 > R2) continue;
        seen.add(key);
        out.push({ key, kind: ['flag', 'ring', 'ring', 'flag', 'ring', 'coin'][n % 6], x: px, z: pz, yaw: Math.atan2(r.p[i * 2 + 2] - r.p[i * 2], r.p[i * 2 + 3] - r.p[i * 2 + 1]) });
      }
    }
  }
  return out;
}
