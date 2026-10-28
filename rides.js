// Enregistre CHAQUE trajet en arrière-plan (seulement sur ton appareil) : des « cases » de ~20 m où tu es passé, avec le nombre de trajets différents.
// Sert à (1) trouver tes endroits favoris (≥ 3 trajets différents) pour y mettre une pièce en or et un drapeau,
//        (2) affiner la précision : côté de la route où tu roules d'habitude, et position fiable là où la carte n'a pas de route.
const KEY = 'skkkrt3d.rides.v1', STEP_LAT = 0.00018;
let data = null, dirty = false, saveT = 0, cur = null, seq = 0;
const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.cells) return d; } catch {} return { v: 1, rides: [], cells: {} }; };
const D = () => data || (data = load());
const lonStep = lat => STEP_LAT / Math.max(0.2, Math.cos(lat * Math.PI / 180));
const keyOf = (lat, lon) => Math.round(lat / STEP_LAT) + '_' + Math.round(lon / lonStep(lat));
const dist = (a, b, c, d) => { const kx = 111320 * Math.cos(a * Math.PI / 180); return Math.hypot((d - b) * kx, (c - a) * 111320); };

export const rides = {
  // à appeler souvent : locked = je roule pour vrai (GPS en mouvement)
  tick(now, locked, lat, lon, speed, acc) {
    const d = D();
    if (locked && !cur) cur = { id: Date.now() * 1000 + (seq++ % 1000), t0: now, km: 0, last: null, lastSeen: now };
    if (cur) {
      if (locked) {
        cur.lastSeen = now;
        if (acc == null || acc < 40) {
          const l = cur.last;
          if (!l || dist(l.lat, l.lon, lat, lon) >= 8) {
            if (l) cur.km += dist(l.lat, l.lon, lat, lon) / 1000;
            const k = keyOf(lat, lon);
            let c = d.cells[k]; if (!c) c = d.cells[k] = [0, 0, 0, 0, 0, 0, 0];     // [Σlat, Σlon, passages, trajets, dernier trajet, Σcap x, Σcap z]
            c[0] += lat; c[1] += lon; c[2]++;
            if (c[4] !== cur.id) { c[4] = cur.id; c[3]++; }
            if (l) { const kx = 111320 * Math.cos(lat * Math.PI / 180), hx = (lon - l.lon) * kx, hz = -(lat - l.lat) * 111320, hl = Math.hypot(hx, hz) || 1; c[5] += hx / hl; c[6] += hz / hl; }
            cur.last = { lat, lon }; dirty = true;
          }
        }
      } else if (now - cur.lastSeen > 120000) this.end(now);
    }
    saveT += 1; if (dirty && saveT > 600) { saveT = 0; this.save(); }
  },
  end(now) {
    if (!cur) return; const d = D();
    if (cur.km >= 0.2) { d.rides.push({ t: cur.id, km: Math.round(cur.km * 100) / 100, s: Math.round(((now || cur.lastSeen) - cur.t0) / 1000) }); if (d.rides.length > 300) d.rides.shift(); dirty = true; }
    cur = null; this.save();
  },
  save() {
    if (!dirty) return; dirty = false; const d = D(), ks = Object.keys(d.cells);
    if (ks.length > 6000) { ks.sort((a, b) => d.cells[a][3] - d.cells[b][3] || d.cells[a][2] - d.cells[b][2]); for (let i = 0; i < ks.length - 5000; i++) delete d.cells[ks[i]]; }
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {}
  },
  clear() { data = { v: 1, rides: [], cells: {} }; cur = null; dirty = false; try { localStorage.removeItem(KEY); } catch {} },
  stats() { const d = D(), n = Object.keys(d.cells).length; return { rides: d.rides.length + (cur ? 1 : 0), km: Math.round((d.rides.reduce((s, r) => s + r.km, 0) + (cur ? cur.km : 0)) * 10) / 10, cells: n, favs: this.favorites().length }; },
  // endroits favoris : cases visitées lors d'au moins 3 trajets différents, regroupées (≤ 120 m), les 25 plus fréquentés
  favorites() {
    const d = D(), cs = Object.values(d.cells).filter(c => c[3] >= 3).map(c => ({ lat: c[0] / c[2], lon: c[1] / c[2], r: c[3], n: c[2] })).sort((a, b) => b.r - a.r || b.n - a.n), out = [];
    for (const c of cs) { if (out.some(o => dist(o.lat, o.lon, c.lat, c.lon) < 120)) continue; out.push(c); if (out.length >= 25) break; }
    return out.map((o, i) => Object.assign(o, { id: i + '_' + Math.round(o.lat * 1e4) + '_' + Math.round(o.lon * 1e4) }));
  },
  // case apprise la plus proche : position moyenne, cap moyen, nombre de trajets
  near(lat, lon, maxM = 14) {
    const d = D(), ls = lonStep(lat), i0 = Math.round(lat / STEP_LAT), j0 = Math.round(lon / ls); let best = null, bd = maxM;
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
      const c = d.cells[i + '_' + j]; if (!c || c[3] < 2) continue;
      const clat = c[0] / c[2], clon = c[1] / c[2], dd = dist(lat, lon, clat, clon);
      if (dd < bd) { bd = dd; best = { lat: clat, lon: clon, rides: c[3], n: c[2], hx: c[5], hz: c[6], d: dd }; }
    }
    return best;
  }
};
if (typeof addEventListener === 'function') { addEventListener('pagehide', () => rides.end()); addEventListener('visibilitychange', () => { if (document.hidden) rides.save(); }); }
