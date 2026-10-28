// Carte réelle : GPS + OpenStreetMap -> ville 3D autour de toi (3 km × 3 km), construite par morceaux au fur et à mesure.
import * as THREE from 'three';
import { HALF, CH, parseOSM, hitBuilding, onRoad, nearestRoad, route, hash01, bridgeY, waterRec, inWater, matchRoad, clearOfRoads, rewardsNear, inParking } from './real-core.js';
import { settings, shadowsOn } from './settings.js';
import { premium, wallPBR, roadPBR, treeCanopy, patchySnow } from './gfx.js';
import { natureOn, treeFoliage, foliageMaterial, grassyGround, concreteGrain, createGrass, natureTime } from './nature.js';

/* ---------------------------------------------------------------- GPS */
const geoOwn = () => (navigator.geolocation ? navigator.geolocation : null);
const geoParent = () => { try { return parent !== window && parent.navigator.geolocation ? parent.navigator.geolocation : null; } catch { return null; } };

// Lit le GPS en continu pendant quelques secondes et garde le MEILLEUR point (plus petite marge d'erreur) :
// la première position donnée par un téléphone est souvent vieille ou grossière (antenne / wifi).
export function getPos(timeout = 14000, onFix = () => {}) {
  const fmt = p => ({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, heading: p.coords.heading, speed: p.coords.speed });
  return new Promise((resolve, reject) => {
    const gs = [geoOwn(), geoParent()].filter((g, i, a) => g && a.indexOf(g) === i);
    if (!gs.length) return reject(new Error('GPS indisponible'));
    let best = null, done = false, errs = 0, lastErr = '';
    const ws = [], t0 = Date.now();
    const finish = () => {
      if (done) return; done = true; clearTimeout(tm); clearInterval(iv);
      ws.forEach(([g, id]) => { try { g.clearWatch(id); } catch {} });
      best ? resolve(best) : reject(new Error('GPS : ' + (lastErr || 'aucune position reçue (délai dépassé)')));
    };
    const tm = setTimeout(finish, timeout);
    const iv = setInterval(() => { if (best && Date.now() - t0 > 5000 && best.acc <= 80) finish(); }, 500);
    for (const g of gs) {
      try {
        const id = g.watchPosition(p => { const f = fmt(p); if (!best || f.acc <= best.acc) best = f; onFix(best); if (best.acc <= 20) finish(); },
          e => { lastErr = e.message; if (++errs >= gs.length) finish(); }, { enableHighAccuracy: true, maximumAge: 0, timeout });
        ws.push([g, id]);
      } catch (e) { lastErr = e.message; errs++; }
    }
    if (errs >= gs.length) finish();
  });
}
export function watchGps(cb) {
  const g = geoOwn() || geoParent(); if (!g) return () => {};
  const id = g.watchPosition(p => cb({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, heading: p.coords.heading, speed: p.coords.speed, ts: p.timestamp, t: Date.now() }), () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  return () => g.clearWatch(id);
}

/* ---------------------------------------------------------------- téléchargement OpenStreetMap (Overpass) */
// La zone est découpée en tuiles d'environ 445 m, téléchargées du centre vers l'extérieur.
// Le morceau sous le joueur passe en premier ; les autres arrivent ensuite en arrière-plan.
// Les morceaux réussis restent dans IndexedDB entre les sessions (CacheStorage sert de secours).
// Pool mondial de secours. Kumi est désormais Private.coffee : on ne compte pas ces deux noms comme deux opérateurs.
// Les miroirs allemands partagent aussi le même opérateur et la même limite de concurrence.
const OVP = [
  { id: 'coffee', op: 'coffee', name: 'Private.coffee', url: 'https://overpass.private.coffee/api/interpreter' },
  { id: 'mail', op: 'mail', name: 'VK Maps', url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter' },
  { id: 'de', op: 'de', name: 'Overpass.de', url: 'https://overpass-api.de/api/interpreter' },
  { id: 'de-lz4', op: 'de', name: 'Overpass.de LZ4', url: 'https://lz4.overpass-api.de/api/interpreter' },
  { id: 'de-z', op: 'de', name: 'Overpass.de Z', url: 'https://z.overpass-api.de/api/interpreter' },
  { id: 'fr', op: 'fr', name: 'Overpass France', url: 'https://overpass.openstreetmap.fr/api/interpreter' },
  { id: 'tw', op: 'tw', name: 'NCHC Taiwan', url: 'https://overpass.nchc.org.tw/api/interpreter' }
];
const GR = Object.fromEntries(OVP.map(s => [s.id, { busy: 0, bad: 0, avg: s.id === 'fr' || s.id === 'tw' ? 9000 : s.id.startsWith('de-') ? 4300 : 4000, tries: 0, err: '' }]));
const OPBUSY = Object.create(null);
let OVREQS = 0;
const MAX_OVREQS = 6;                         // paramètres de la v15 : au plus 6 demandes Overpass à la fois
const TILE_CACHE = 'skkkrt3d-tiles-v9', LEGACY_TILE_CACHE = 'skkkrt3d-tiles-v8', OLDER_TILE_CACHE = 'skkkrt3d-tiles-v7', DB_NAME = 'skkkrt3d-map-cache', DB_STORE = 'tiles', CACHE_SCHEMA = 'osm4', DLAT = 0.0040;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const hasWays = els => Array.isArray(els) && els.some(x => x.type === 'way');      // une tuile « vide » n'est jamais gardée en mémoire (un serveur peut répondre vide par erreur)
let tileDbPromise = null, persistAsked = false;
function openTileDb() {
  if (tileDbPromise) return tileDbPromise;
  tileDbPromise = new Promise(resolve => {
    if (!window.indexedDB) return resolve(null);
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch { return resolve(null); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        const s = db.createObjectStore(DB_STORE, { keyPath: 'key' });
        s.createIndex('usedAt', 'usedAt', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result; db.onversionchange = () => db.close();
      if (!persistAsked) {
        persistAsked = true;
        try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch {}
      }
      resolve(db);
    };
    req.onerror = req.onblocked = () => resolve(null);
  });
  return tileDbPromise;
}
async function dbTileGet(key) {
  const db = await openTileDb(); if (!db) return null;
  return new Promise(resolve => {
    let value = null, tx;
    try {
      tx = db.transaction(DB_STORE, 'readonly'); const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => {
        const row = req.result;
        if (row && Array.isArray(row.els) && (hasWays(row.els) || row.empty)) value = row;
      };
      tx.oncomplete = () => {
        if (value && Date.now() - (value.usedAt || 0) > 3600000) { value.usedAt = Date.now(); dbTilePut(value).catch(() => {}); }
        resolve(value);
      };
      tx.onerror = tx.onabort = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function dbTilePut(row) {
  const db = await openTileDb(); if (!db) throw new Error('IndexedDB indisponible');
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).put(row); tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error || new Error('écriture impossible')); }
    catch (e) { reject(e); }
  });
}
async function pruneTileDb(count = 80) {
  const db = await openTileDb(); if (!db) return;
  await new Promise(resolve => {
    let tx;
    try {
      tx = db.transaction(DB_STORE, 'readwrite'); const req = tx.objectStore(DB_STORE).index('usedAt').openCursor(); let removed = 0;
      req.onsuccess = () => { const c = req.result; if (!c || removed >= count) return; c.delete(); removed++; c.continue(); };
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}
async function cacheTileGet(cacheName, key) {
  try {
    const c = await caches.open(cacheName), r = await c.match('/__tile__/' + key); if (!r) return null;
    const o = await r.json(); return o && (hasWays(o.els) || o.empty) ? o : null;
  } catch { return null; }
}
async function tileGet(key) {
  const row = await dbTileGet(key); if (row) return row.els;
  const current = await cacheTileGet(TILE_CACHE, key);
  if (current) return current.els;
  const legacyKey = key.slice(CACHE_SCHEMA.length + 1), oldKey = 'osm3:' + legacyKey;
  const oldDb = await dbTileGet(oldKey), old = oldDb || await cacheTileGet(LEGACY_TILE_CACHE, oldKey) || await cacheTileGet(OLDER_TILE_CACHE, legacyKey);
  if (!old) return null;
  const els = old.els; els.__stale = true; return els;                          // ancien cache : départ immédiat, mise à jour OSM en arrière-plan
}
async function tilePut(key, els, empty) {
  const now = Date.now(), row = { key, t: now, usedAt: now, els, empty: !!empty };
  try { await dbTilePut(row); return; }
  catch (e) {
    if (/quota|storage/i.test(String(e && (e.name + ' ' + e.message)))) {
      await pruneTileDb();
      try { await dbTilePut(row); return; } catch {}
    }
  }
  try { const c = await caches.open(TILE_CACHE); await c.put('/__tile__/' + key, new Response(JSON.stringify(row))); } catch {}
}
try { caches.delete('skkkrt3d-real'); caches.delete('skkkrt3d-tiles-v3'); caches.delete('skkkrt3d-tiles-v4'); caches.delete('skkkrt3d-tiles-v5'); caches.delete('skkkrt3d-tiles-v6'); } catch {}                                      // ancienne carte unique

function tileGrid(lat, lon, half) {
  const kLat = 111320, c = Math.round(Math.cos(lat * Math.PI / 180) * 50) / 50, kLon = 111320 * c;
  const dLon = +(DLAT * kLat / kLon).toFixed(5);
  const j0 = Math.floor((lat - half / kLat) / DLAT), j1 = Math.floor((lat + half / kLat) / DLAT);
  const i0 = Math.floor((lon - half / (111320 * Math.cos(lat * Math.PI / 180))) / dLon), i1 = Math.floor((lon + half / (111320 * Math.cos(lat * Math.PI / 180))) / dLon);
  const tiles = [], k = Math.PI / 180;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const s = j * DLAT, n = (j + 1) * DLAT, w = i * dLon, e = (i + 1) * dLon;
    const cy = (s + n) / 2, cx = (w + e) / 2, d = Math.hypot((cx - lon) * k * Math.cos(lat * k), (cy - lat) * k) * 6371000;
    const here = lat >= s && lat < n && lon >= w && lon < e;
    tiles.push({ key: CACHE_SCHEMA + ':' + dLon + '_' + i + '_' + j, s, n, w, e, d, here });
  }
  return tiles.sort((a, b) => Number(b.here) - Number(a.here) || a.d - b.d);
}
function tileQuery(t) {
  const mLat = 0.00015, mLon = 0.0002;
  const bb = [t.s - mLat, t.w - mLon, t.n + mLat, t.e + mLon].map(v => v.toFixed(6)).join(',');
  return `[out:json][timeout:30][bbox:${bb}];(way["highway"];node["highway"~"^(traffic_signals|stop|give_way)$"];node["traffic_sign"~"stop|give_way"];way["building"];relation["building"]["type"="multipolygon"];way["amenity"="parking"];relation["amenity"="parking"]["type"="multipolygon"];way["natural"~"^(water|wood|scrub)$"];way["waterway"="riverbank"];way["waterway"="river"];way["waterway"="canal"];` +
    `way["landuse"~"^(forest|grass|meadow|recreation_ground|cemetery|village_green|orchard|allotments)$"];way["leisure"~"^(park|garden|pitch|playground|golf_course|nature_reserve|common)$"];` +
    `relation["natural"="water"]["type"="multipolygon"];relation["waterway"="riverbank"];);out geom qt;`;
}
const nice = e => e.name === 'AbortError' ? 'demande annulée' : /^HTTP 429/.test(e.message) ? 'limite temporaire (429)' : /^HTTP 5/.test(e.message) ? 'serveur en panne (' + e.message.slice(5) + ')' : e.message === 'Load failed' || e.message === 'Failed to fetch' ? 'connexion refusée' : e.message;
const errSummary = () => OVP.filter(s => GR[s.id].err).map(s => s.name + ' : ' + GR[s.id].err).slice(0, 3).join(' · ');
function ovOrder(tag, skip) {
  const list = OVP.filter(s => !(skip && skip.has(s.op)));
  const now = Date.now(), ready = list.filter(s => GR[s.id].bad <= now), pool = ready.length ? ready : list;
  if (!pool.length) return [];
  const first = pool[((Number(tag) || 0) % pool.length)];
  return [first, ...pool.filter(s => s.id !== first.id).sort((a, b) => GR[a.id].avg - GR[b.id].avg), ...list.filter(s => !pool.includes(s)).sort((a, b) => GR[a.id].avg - GR[b.id].avg)];
}
// Paramètres réseau de la v15 : premier serveur immédiatement, puis relais parallèle après 4,5 à 9 s.
// Le premier résultat valide gagne; les autres demandes sont annulées. Les alias d'un même opérateur ne partent jamais ensemble.
function ovq(q, o = {}) {
  return new Promise((resolve, reject) => {
    const order = ovOrder(o.tag, o.skip), attempted = new Set(), active = new Map(), activeOps = new Set(), errors = [];
    let done = false, hedgeTimer = 0, hardTimer = 0;
    const errorText = () => errors.slice(0, 2).join(' · ') || errSummary() || 'délai dépassé (45 s)';
    const finish = (ok, value) => {
      if (done) return;
      done = true; clearTimeout(hedgeTimer); clearTimeout(hardTimer);
      for (const a of [...active.values()]) { try { a.ctl && a.ctl.abort(); } catch {} a.release(); }
      ok ? resolve(value) : reject(value);
    };
    const schedule = ms => { clearTimeout(hedgeTimer); hedgeTimer = setTimeout(() => { hedgeTimer = 0; launch(); }, ms); };
    const launch = () => {
      if (done) return;
      const now = Date.now(), candidates = order.filter(s => !attempted.has(s.id) && !activeOps.has(s.op) && (OPBUSY[s.op] || 0) < 1);
      if (!candidates.length) {
        if (!active.size && attempted.size >= order.length) finish(false, new Error(errorText()));
        else if (attempted.size < order.length) schedule(1200);
        return;
      }
      if (OVREQS >= MAX_OVREQS) { schedule(1200); return; }
      const ready = candidates.filter(s => GR[s.id].bad <= now), s = (ready.length ? ready : candidates)[0], g = GR[s.id];
      attempted.add(s.id); activeOps.add(s.op); g.tries++; g.busy++; OPBUSY[s.op] = (OPBUSY[s.op] || 0) + 1; OVREQS++;
      const t0 = Date.now(), ctl = window.AbortController ? new AbortController() : null;
      const a = { ctl, ended: false, release: () => {
        if (a.ended) return; a.ended = true; active.delete(s.id); activeOps.delete(s.op);
        g.busy = Math.max(0, g.busy - 1); OPBUSY[s.op] = Math.max(0, (OPBUSY[s.op] || 1) - 1); OVREQS = Math.max(0, OVREQS - 1);
      } };
      active.set(s.id, a);
      Promise.resolve().then(() => fetch(s.url, { method: 'POST', body: new URLSearchParams({ data: q }), signal: ctl ? ctl.signal : undefined, headers: { 'Accept': 'application/json' } }))
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(j => {
          if (!j || !Array.isArray(j.elements)) throw new Error('réponse invalide');
          if (j.remark && /error|timed out|out of memory/i.test(j.remark)) throw new Error('serveur surchargé');
          const ts = j.osm3s && Date.parse(j.osm3s.timestamp_osm_base); if (ts && Date.now() - ts > 60 * 86400e3) throw new Error('données trop anciennes');
          if (done) { a.release(); return; }
          g.avg = g.avg * 0.7 + (Date.now() - t0) * 0.3; g.bad = 0; g.err = ''; j.__op = s.op; j.__server = s.id;
          a.release(); finish(true, j);
        })
        .catch(e => {
          a.release(); if (done) return;
          const msg = String(e.message || ''); errors.push(s.name + ' : ' + nice(e)); g.err = nice(e); g.avg = Math.min(30000, g.avg * 1.25);
          const pause = /^HTTP 429/.test(msg) ? 30000 : /HTTP 400|HTTP 404|HTTP 405|réponse invalide/.test(msg) ? 3600000 : e.name === 'AbortError' ? 10000 : /^HTTP 5/.test(msg) ? 5000 : 9000;
          g.bad = Date.now() + pause;
          if (!active.size && attempted.size >= order.length) finish(false, new Error(errorText())); else launch();
        });
      if (attempted.size < order.length) schedule(Math.min(9000, Math.max(4500, g.avg * 1.5)));
    };
    if (!order.length) { reject(new Error('aucun autre opérateur disponible')); return; }
    hardTimer = setTimeout(() => finish(false, new Error(errorText())), o.total || 45000);
    launch();
  });
}

// Une réponse sans aucun « way » est suspecte (serveur incomplet, vide par erreur) : un autre exploitant la vérifie ; le fautif est mis de côté 10 min.
async function ovqSure(q, o = {}) {
  const r1 = await ovq(q, o);
  if (hasWays(r1.elements)) return r1;
  try {
    const r2 = await ovq(q, { ...o, skip: new Set([r1.__op]), total: 18000 });
    if (hasWays(r2.elements)) { const g = GR[r1.__server]; if (g) { g.bad = Date.now() + 600000; g.err = 'réponse vide (ignoré)'; } return r2; }
    const b = r1.elements.length >= r2.elements.length ? r1 : r2; b.__verified = true; return b;      // vide confirmé par deux exploitants
  } catch { return r1; }
}

const tri = (ring, holes) => {
  const v2 = a => { const o = []; for (let i = 0; i < a.length; i += 2) o.push(new THREE.Vector2(a[i], a[i + 1])); return o; };
  const c = v2(ring), hs = holes.map(v2), F = THREE.ShapeUtils.triangulateShape(c, hs), V = c.concat(...hs), out = [];
  for (const f of F) for (const k of f) out.push(V[k].x, V[k].y);
  return out;
};
export { tri };

// renvoie les données de la carte autour de (lat, lon). opts.half = demi-côté en mètres · opts.force = ignorer la mémoire
// opts.progressive : départ dès que le premier morceau est prêt, puis enrichissement jusqu'à toute la zone.
//   Les étapes suivantes arrivent par opts.onUpdate(D) pendant que tu joues.
export async function loadMap(lat, lon, status = () => {}, opts = {}) {
  const half = opts.half || HALF, tiles = tileGrid(lat, lon, half), els = new Map(), NEAR = 1300, prog = !!opts.progressive;
  const nearN = tiles.filter(t => t.d <= NEAR).length, T0 = Date.now(), failed = [], nearReady = new Set();
  const queue = tiles.slice(), refreshQueue = []; let retries = 0, next = 0, doneN = 0, nearDone = 0, fromCache = 0, lastErr = '', level = 0, finished = false, forceStart = false;
  const viaServers = new Set();
  const merge = e => { for (const x of e) els.set(x.type + x.id, x); };
  const nearFailed = () => failed.some(t => t.d <= NEAR);
  let waitForData = false;
  const rep = () => status((waitForData && !level && !hasWays([...els.values()]) ? 'Les serveurs tardent; attente des premiers morceaux · ' : '') + (level ? 'Carte en arrière-plan : ' + doneN + ' / ' + tiles.length + ' morceaux' : 'Carte : proches ' + nearDone + ' / ' + nearN + ' morceaux') + (fromCache ? ' (' + fromCache + ' en mémoire)' : '') + (viaServers.size ? ' · ' + viaServers.size + ' serveurs' : '') + (failed.length ? ' · ' + failed.length + ' échec(s)' : '') + (!level && (errSummary() || lastErr) ? ' · ' + (errSummary() || lastErr).slice(0, 110) : '') + '…');
  const build = async (stage) => {
    if (!hasWays([...els.values()]) && !forceStart) throw new Error(errSummary() || lastErr || 'aucune route ni bâtiment reçu');
    await sleep(10);
    const D = parseOSM({ elements: [...els.values()] }, lat, lon, tri, half);
    D.missing = stage === 3 ? failed.length : 0; D.tileCount = tiles.length; D.readyTiles = doneN; D.fromCache = fromCache; D.lastErr = lastErr; D.dlSec = Math.round((Date.now() - T0) / 100) / 10; D.stage = stage;
    return D;
  };
  return new Promise((resolve, reject) => {
    let emitted = false, chain = Promise.resolve();
    const emit = stage => {                                           // une étape à la fois, jamais en arrière
      chain = chain.then(async () => {
        if (stage <= level || finished) return;
        let D; try { D = await build(stage); } catch (e) { if (!emitted && stage === 3) reject(e); return; }
        level = stage; if (stage === 3) finished = true;
        if (!emitted) { emitted = true; resolve(D); } else if (opts.onUpdate) opts.onUpdate(D);
        rep();
      });
    };
    const worker = async () => {
      for (;;) {
        const i = next++; if (i >= queue.length) return;
        if (gentle() && i > 0) await sleep(350);                        // Bluetooth actif : une pause entre les morceaux, pour ne pas étouffer la liaison avec la trottinette
        const t = queue[i], again = !!t._r, refresh = !!t._refresh; t._r = 0; t._refresh = false;
        let loaded = false;
        try {
          let e = opts.force || refresh ? null : await tileGet(t.key);
          if (e) {
            fromCache++; merge(e);
            loaded = hasWays(e);
            if (e.__stale) refreshQueue.push({ ...t, _r: 1, _refresh: true });
          } else {
            const res = await ovqSure(tileQuery(t), { tag: i, total: 45000 }); e = res.elements; if (res.__server) viaServers.add(res.__server);
            if (hasWays(e)) await tilePut(t.key, e); else if (res.__verified) await tilePut(t.key, e, true);
            merge(e);
            loaded = hasWays(e);
          }
          if (loaded && t.d <= NEAR) nearReady.add(t.key);
          if (again) { const k = failed.indexOf(t); if (k >= 0) failed.splice(k, 1); if (prog && nearDone === nearN && !nearFailed()) emit(2); }
        } catch (x) { if (refresh) t._refresh = true; if (!failed.includes(t)) failed.push(t); lastErr = x.message; }
        if (!again) { doneN++; if (i < nearN) nearDone++; if (prog && nearDone === nearN && !nearFailed()) emit(2); }
        if (prog && !emitted && nearReady.size >= Math.min(4, nearN)) emit(1); // attendre plusieurs secteurs proches avec des données pour éviter un départ presque vide
        rep();
      }
    };
    let running = 0;
    const spawn = () => { running++; worker().then(async () => {
      running--; if (running !== 0) return;
      if (failed.length && retries < 2 && Date.now() - T0 < 300000) {           // initial + 2 nouvelles tentatives, comme la v15
        retries++; await sleep(1200 * retries);
        for (const t of failed) { t._r = 1; queue.push(t); }
        for (let k = 0; k < Math.min(4, failed.length); k++) spawn();
        return;
      }
      if (refreshQueue.length) {
        const refreshCount = refreshQueue.length; queue.push(...refreshQueue.splice(0));
        for (let k = 0; k < Math.min(4, refreshCount); k++) spawn();
        return;
      }
      clearInterval(boost); emit(3);
    }); };
    const gentle = () => { try { return !!(globalThis.__gentle && globalThis.__gentle()); } catch { return false; } };
    const boost = setInterval(() => { if (running < (gentle() ? 2 : 6) && next < queue.length && doneN >= 4) spawn(); }, 1500);
    rep();
    setTimeout(() => {
      if (!emitted && prog) {
        if (hasWays([...els.values()])) { forceStart = true; emit(1); } // départ avec des routes/bâtiments déjà reçus, jamais avec le terrain nu
        else { waitForData = true; rep(); }
      }
    }, 12000);
    for (let i = 0; i < (gentle() ? 2 : 4); i++) spawn();                                // v15 : 4 morceaux au départ
  });
}

/* ---------------------------------------------------------------- construction 3D par morceaux */
const TW = 12, TH = 13.2;                       // taille de la texture de façade (m), comme les bâtiments de la ville
const NOLAMP = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'service', 'track', 'road']);
const SIDEW = new Set(['residential', 'tertiary', 'secondary', 'primary', 'unclassified', 'living_street']);
const HOUSE = new Set(['house', 'detached', 'semidetached_house', 'bungalow', 'residential', 'terrace', 'cabin']);
const rnd = s => { s = Math.sin(s * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export function buildReal(group, th, quality, D, H) {
  const hi = quality === 'high' || quality === 'ultra', lo = quality === 'low', shadows = shadowsOn(quality);
  const baseRAD = lo ? 2 : hi ? 4 : 3, RADf = () => (+settings.bldRad) || baseRAD;   // rayon (en morceaux) construit autour du joueur
  const TR = Math.min(4, +settings.texRes || 1);
  const NAT = natureOn();                                          // v9.25 : gazon, feuillage en cartes, textures naturelles, ciel
  const col = h => new THREE.Color(h);
  // relief : D.H(x, z) = altitude en mètres par rapport à ta position (absent = terrain plat, comme avant)
  const EL = D.H || null, E = EL || (() => 0), GS = H.GS || 7000;
  const nAt = (x, z) => {                                         // normale du terrain (dérivée de la hauteur)
    if (!EL) return [0, 1, 0];
    const e = 1.5, dx = (EL(x + e, z) - EL(x - e, z)) / (2 * e), dz = (EL(x, z + e) - EL(x, z - e)) / (2 * e), l = Math.hypot(dx, 1, dz);
    return [-dx / l, 1 / l, -dz / l];
  };

  /* PONTS : le tablier ne suit plus le sol (qui descend dans la vallée / la rivière) : il relie les deux rives en ligne droite, d'une extrémité à l'autre du pont. */
  function prepBridges() {
    if (!EL || D._bridged === EL) return; D._bridged = EL;
    const bw = D.roads.filter(r => r.br), byNode = new Map(), seen = new Set();
    for (const r of bw) for (const id of [r.n0, r.n1]) if (id != null) { let a = byNode.get(id); if (!a) byNode.set(id, a = []); a.push(r); }
    const deckLift = D.preset === 'sky' ? 54 : 0;
    const endE = (r, first) => { const n = r.p.length / 2, i = first ? 0 : n - 1; return E(r.p[i * 2], r.p[i * 2 + 1]) + deckLift; };
    const setDeck = (r, s0, rev, L, hA, hB) => {
      const n = r.p.length / 2, tot = r.cl[n - 1], dk = new Float32Array(n);
      for (let i = 0; i < n; i++) { const sd = s0 + (rev ? tot - r.cl[i] : r.cl[i]), line = hA + (hB - hA) * (L > 0 ? sd / L : 0); dk[i] = Math.max(line, E(r.p[i * 2], r.p[i * 2 + 1]) + deckLift); }
      r.deck = L >= 12 ? dk : null;
    };
    for (const r0 of bw) {
      if (seen.has(r0)) continue;
      const comp = [], st = [r0]; seen.add(r0);
      while (st.length) { const r = st.pop(); comp.push(r); for (const id of [r.n0, r.n1]) if (id != null) for (const q of byNode.get(id) || []) if (!seen.has(q)) { seen.add(q); st.push(q); } }
      const own = r => { const L = r.cl[r.cl.length - 1]; setDeck(r, 0, false, L, endE(r, true), endE(r, false)); };
      if (comp.length === 1 || comp.some(r => r.n0 == null || r.n1 == null)) { comp.forEach(own); continue; }
      const deg = new Map(); for (const r of comp) for (const id of [r.n0, r.n1]) deg.set(id, (deg.get(id) || 0) + 1);
      const ends = [...deg].filter(([, d]) => d === 1).map(([id]) => id);
      if (ends.length !== 2 || [...deg.values()].some(d => d > 2)) { comp.forEach(own); continue; }       // pont en fourche : chaque tronçon relie ses propres extrémités
      const order = []; let node = ends[0], used = new Set(), L = 0;
      for (;;) {
        const w = (byNode.get(node) || []).find(r => comp.includes(r) && !used.has(r)); if (!w) break;
        used.add(w); const rev = w.n1 === node; order.push([w, L, rev]); L += w.cl[w.cl.length - 1]; node = rev ? w.n0 : w.n1;
      }
      if (order.length !== comp.length) { comp.forEach(own); continue; }
      const f = order[0], l = order[order.length - 1], hA = endE(f[0], !f[2]), hB = endE(l[0], l[2]);
      for (const [w, s0, rev] of order) setDeck(w, s0, rev, L, hA, hB);
    }
  }
  prepBridges();

  /* PONT UNIQUE : un pont n'est jamais fait de rangées séparées. Quand la carte donne plusieurs voies parallèles sur un même pont (piste cyclable au centre,
     trottoirs de chaque côté…), on comble l'espace entre elles par un seul tablier continu et on ne garde de parapet qu'à l'extérieur. */
  function bridgeFills() {
    if (!EL || D._fills === EL) return; D._fills = EL;
    if (D.preset === 'sky') return; // le parcours aérien reçoit ses propres cordes et planches
    const bs = []; D.roads.forEach((r, ix) => { r.ix = ix; if (r.br && r.deck) bs.push(r); });
    D.bfill = []; D.bnb = new Map();
    if (bs.length < 2) return;
    const seen = new Set(), clampU = v => Math.max(0, Math.min(1, v));
    const near = (B, j, x, z) => { const cx = B.p[j * 2], cz = B.p[j * 2 + 1], dx = B.p[j * 2 + 2] - cx, dz = B.p[j * 2 + 3] - cz, l2 = dx * dx + dz * dz || 1, u = clampU(((x - cx) * dx + (z - cz) * dz) / l2); return [cx + dx * u, cz + dz * u, u]; };
    for (const A of bs) {
      for (let i = 0; i < A.p.length / 2 - 1; i++) {
        const ax = A.p[i * 2], az = A.p[i * 2 + 1], bx = A.p[i * 2 + 2], bz = A.p[i * 2 + 3];
        let tx = bx - ax, tz = bz - az; const tl = Math.hypot(tx, tz); if (tl < 0.5) continue; tx /= tl; tz /= tl;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, hwA = A.w / 2, nx = A.nl[i * 2], nz = A.nl[i * 2 + 1], dA = (A.deck[i] + A.deck[i + 1]) / 2, best = [null, null];
        for (const B of bs) {
          if (B === A) continue;
          for (let j = 0; j < B.p.length / 2 - 1; j++) {
            const cx = B.p[j * 2], cz = B.p[j * 2 + 1], ex = B.p[j * 2 + 2], ez = B.p[j * 2 + 3];
            if (Math.min(cx, ex) > mx + 32 || Math.max(cx, ex) < mx - 32 || Math.min(cz, ez) > mz + 32 || Math.max(cz, ez) < mz - 32) continue;
            let ux = ex - cx, uz = ez - cz; const ul = Math.hypot(ux, uz); if (ul < 0.5) continue; ux /= ul; uz /= ul;
            if (Math.abs(ux * tx + uz * tz) < 0.9) continue;                          // pas parallèle
            if (Math.abs((B.deck[j] + B.deck[j + 1]) / 2 - dA) > 2.5) continue;       // pas à la même hauteur (autre pont par-dessus)
            const [qx, qz] = near(B, j, mx, mz), d = Math.hypot(qx - mx, qz - mz), gap = d - hwA - B.w / 2;
            if (gap > 22) continue;
            const al = (qx - ax) * tx + (qz - az) * tz; if (al < -3 || al > tl + 3) continue;
            const side = (qx - mx) * nx + (qz - mz) * nz > 0 ? 0 : 1;
            if (!best[side] || gap < best[side].gap) best[side] = { B, j, gap };
          }
        }
        D.bnb.set(A.ix + ':' + i, [!!best[0], !!best[1]]);
        for (const bsd of best) {
          if (!bsd || bsd.gap < 0.12) continue;
          const { B, j } = bsd, key = Math.min(A.ix, B.ix) + ':' + Math.max(A.ix, B.ix) + ':' + (A.ix < B.ix ? i + ',' + j : j + ',' + i);
          if (seen.has(key)) continue; seen.add(key);
          const xs = [], zs = [], ys = [];
          for (const k of [i, i + 1]) {                                               // bord de A, bord de B en face (mêmes bouts)
            const px = A.p[k * 2], pz = A.p[k * 2 + 1], [qx, qz, u] = near(B, j, px, pz), l = Math.hypot(qx - px, qz - pz) || 1, vx = (qx - px) / l, vz = (qz - pz) / l;
            xs.push(px + vx * hwA, qx - vx * B.w / 2); zs.push(pz + vz * hwA, qz - vz * B.w / 2); ys.push(A.deck[k], B.deck[j] + (B.deck[j + 1] - B.deck[j]) * u);
          }
          // ordre : [bord A début, bord B début, bord A fin, bord B fin] -> P0,P1 = début ; P2,P3 = fin
          D.bfill.push({ x: xs, z: zs, y: ys, cx: (xs[0] + xs[3]) / 2, cz: (zs[0] + zs[3]) / 2 });
        }
      }
    }
  }
  bridgeFills();

  /* EAU : un plan d'eau est PLAT (niveau = bas des altitudes dans son contour) ; le sol est creusé dessous, donc une rivière a une vraie profondeur. */
  const wlOf = rec => {
    if (rec.wl != null && rec.wlE === EL) return rec.wl;
    const NX = 18, v = [];
    for (let a = 0; a < NX; a++) for (let b = 0; b < NX; b++) {
      const x = rec.minx + (a + 0.5) / NX * (rec.maxx - rec.minx), z = rec.minz + (b + 0.5) / NX * (rec.maxz - rec.minz);
      if (waterRec(D, x, z) === rec) v.push(E(x, z));
    }
    if (!v.length) v.push(E((rec.minx + rec.maxx) / 2, (rec.minz + rec.maxz) / 2));
    v.sort((p, q) => p - q); rec.wl = v[Math.floor(v.length * 0.2)]; rec.wlE = EL;
    return rec.wl;
  };
  const wlAt = (x, z) => { if (!EL) return null; const r = waterRec(D, x, z); return r ? wlOf(r) : null; };

  const wallMat = new THREE.MeshStandardMaterial({ map: H.wallTex(0xffffff, th, 1, false, TR), vertexColors: true, roughness: 0.78, side: THREE.DoubleSide });
  if (th.winEm > 0) { wallMat.emissive = new THREE.Color(0xffffff); wallMat.emissiveMap = H.wallTex(0xffffff, th, 1, true, TR); wallMat.emissiveIntensity = th.winEm; }
  const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const lay = (m, f, u = f) => { m.polygonOffset = true; m.polygonOffsetFactor = f; m.polygonOffsetUnits = u; return m; };
const marks = !!settings.roadMarks, mkRoad = kind => lay(new THREE.MeshStandardMaterial({ map: H.roadTex(th, kind, TR), roughness: 0.92, side: THREE.DoubleSide }), -4, -8);
  const roadPlain = mkRoad('plain'), roadMats = { plain: roadPlain, dash: marks ? mkRoad('dash') : roadPlain, dbl: marks ? mkRoad('double') : roadPlain };
  const walkMat = lay(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), -3, -6);
  const crossMat = lay(new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.9, side: THREE.DoubleSide }), -5, -10);
  const footMat = lay(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), -5, -10);
  const laneTexMap = D.synthetic && ['snow', 'skate', 'mountain', 'sky'].includes(D.preset) ? H.roadTex(th, 'plain', TR) : H.laneTex(th);
  const laneMat = lay(new THREE.MeshStandardMaterial({ map: laneTexMap, roughness: 0.85, side: THREE.DoubleSide }), -6, -12);
  const parkMat = lay(new THREE.MeshStandardMaterial({ color: th.lawn, roughness: 1, side: THREE.DoubleSide }), -1);
  if (th.patchy) patchySnow(parkMat, th.patchy);
  const pkMat = lay(new THREE.MeshStandardMaterial({ color: col(th.road).multiplyScalar(1.1), roughness: 0.95, side: THREE.DoubleSide }), -2);   // v9.28 : stationnements (asphalte)
  if (th.patchy) patchySnow(pkMat, th.patchy * 0.6);
  const woodMat = lay(new THREE.MeshStandardMaterial({ color: col(th.leaf).multiplyScalar(0.7), roughness: 1, side: THREE.DoubleSide }), -1);
  if (th.patchy) patchySnow(woodMat, th.patchy * 0.8);
  if (NAT) { grassyGround(parkMat, th); grassyGround(woodMat, th); concreteGrain(walkMat); concreteGrain(footMat); }
  const waterMat = lay(new THREE.MeshStandardMaterial({ color: th.water, roughness: 0.25, metalness: 0.15, side: THREE.DoubleSide }), -2);
  const LAWNK = { value: 2 };                                          // le gazon et les bois s'estompent 2× plus loin que le reste (réglable)
  for (const m of [parkMat, woodMat]) {
    const prev = m.onBeforeCompile, key = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
    m.onBeforeCompile = (sh, rd) => {
      if (prev) prev(sh, rd);
      sh.uniforms.lawnK = LAWNK;
      sh.fragmentShader = 'uniform float lawnK;\n' + sh.fragmentShader.replace('#include <fog_fragment>',
        '#ifdef USE_FOG\n float fogF = smoothstep( fogNear * lawnK, fogFar * lawnK, vFogDepth );\n gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogF );\n#endif');
    };
    m.customProgramCacheKey = () => key() + '|lawnfog';
  }
  const concMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  if (NAT) concreteGrain(concMat);
  const mats = [wallMat, roofMat, concMat, ...new Set(Object.values(roadMats)), walkMat, crossMat, footMat, laneMat, parkMat, pkMat, woodMat, waterMat];
  const PREM = premium();
  if (PREM) try {                                                       // Rendu Premium : relief + rugosité (vitres en verre lisse, façades en crépi, asphalte à gravillons)
    const wp = wallPBR(TR); wallMat.normalMap = wp.normal; wallMat.roughnessMap = wp.rough; wallMat.roughness = 1; wallMat.normalScale.set(0.9, 0.9);
    const rp = roadPBR(TR);
    for (const m of new Set(Object.values(roadMats))) { m.normalMap = rp.normal; m.roughnessMap = rp.rough; m.roughness = 1; m.normalScale.set(0.8, 0.8); }
  } catch (e) { console.warn('Matières Premium indisponibles :', e); }

  // arbres (partagés par tous les morceaux)
  const trunkGeo = new THREE.CylinderGeometry(0.17, 0.27, 2.4, 8); trunkGeo.translate(0, 1.2, 0);
  let leafGeo = th.spruce ? new THREE.ConeGeometry(1.5, 4.2, 14, 2) : new THREE.IcosahedronGeometry(1.7, 2);
  leafGeo.translate(0, th.spruce ? 4.0 : 3.6, 0);
  let leafShaded = false;
  if (PREM) try { const g = treeCanopy(!!th.spruce); leafGeo.dispose(); leafGeo = g; leafShaded = true; } catch (e) { console.warn('Arbres Premium indisponibles :', e); }
  const trunkMat = new THREE.MeshStandardMaterial({ color: th.trunk, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: leafShaded ? false : th.spruce, vertexColors: leafShaded });
  if (NAT) try {                                                         // v9.25 : feuillage en cartes de feuilles (texture générée), vent, simplification avec la distance
    const lvN = Math.max(0, ({ low: 0, med: 1, high: 2, ultra: 3 }[quality] ?? 1) - 1), g2 = treeFoliage(!!th.spruce, lvN);
    leafGeo.dispose(); leafGeo = g2; foliageMaterial(leafMat, !!th.spruce, quality);
  } catch (e) { console.warn('Feuillage Nature indisponible :', e); }
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 5.4, 10); poleGeo.translate(0, 2.7, 0);
  const bulbGeo = new THREE.SphereGeometry(0.24, 12, 8); bulbGeo.translate(0, 5.45, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: th.lamp || 0x2a2d33, roughness: 0.5, metalness: 0.4 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: th.lampHead || 0xfff1c0, emissiveIntensity: th.lampEm || 0.3 });
  const shared = [trunkGeo, leafGeo, trunkMat, leafMat, poleGeo, bulbGeo, poleMat, bulbMat];

  const roadCol = col(th.road), walkCol = col(th.walk), _c = new THREE.Color(), _o = new THREE.Object3D();
  const bld = (th.bld || [0xcfc8bd]).map(col), roofC = col(th.roof);

  const mk = (geo, mat, cast, recv) => { const m = new THREE.Mesh(geo, mat); m.castShadow = !!cast && shadows; m.receiveShadow = !!recv && shadows; return m; };
  const geoOf = (pos, nrm, cl, uv, idx) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (nrm) g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    if (cl) g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (idx) g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    g.computeBoundingSphere(); return g;
  };
  const soup = (t, y) => {                                        // triangles à plat ; sur un relief, découpés (≤ 16 m) et posés sur le terrain
    const pos = [], nrm = [];
    const put = (x, z) => { pos.push(x, E(x, z) + y, z); const n = nAt(x, z); nrm.push(n[0], n[1], n[2]); };
    const tri = (ax, az, bx, bz, cx, cz, d) => {
      const l1 = Math.hypot(bx - ax, bz - az), l2 = Math.hypot(cx - bx, cz - bz), l3 = Math.hypot(ax - cx, az - cz), L = Math.max(l1, l2, l3);
      if (!EL || L < 5 || d > 11) { put(ax, az); put(bx, bz); put(cx, cz); return; }
      if (L === l1) { const mx = (ax + bx) / 2, mz = (az + bz) / 2; tri(ax, az, mx, mz, cx, cz, d + 1); tri(mx, mz, bx, bz, cx, cz, d + 1); }
      else if (L === l2) { const mx = (bx + cx) / 2, mz = (bz + cz) / 2; tri(ax, az, bx, bz, mx, mz, d + 1); tri(ax, az, mx, mz, cx, cz, d + 1); }
      else { const mx = (cx + ax) / 2, mz = (cz + az) / 2; tri(ax, az, bx, bz, mx, mz, d + 1); tri(mx, mz, bx, bz, cx, cz, d + 1); }
    };
    for (let i = 0; i + 5 < t.length; i += 6) tri(t[i], t[i + 1], t[i + 2], t[i + 3], t[i + 4], t[i + 5], 0);
    return geoOf(pos, nrm);
  };

  const soupWater = t => {                                        // eau : triangles PLATS au niveau du plan d'eau
    const pos = [], nrm = [];
    for (let i = 0; i + 5 < t.length; i += 6) {
      const cx = (t[i] + t[i + 2] + t[i + 4]) / 3, cz = (t[i + 1] + t[i + 3] + t[i + 5]) / 3, lv = wlAt(cx, cz), y = lv != null ? lv : E(cx, cz) + 0.02;
      for (let k = 0; k < 3; k++) { pos.push(t[i + k * 2], y, t[i + k * 2 + 1]); nrm.push(0, 1, 0); }
    }
    return geoOf(pos, nrm);
  };

  /* ---- un morceau de 250 m × 250 m */
  function buildChunk(c, farOnly) {
    const g = new THREE.Group(), own = [], inst = [];
    const add = (geo, mat, cast, recv) => { own.push(geo); const m = mk(geo, mat, cast, recv); g.add(m); return m; };
    if (farOnly) {                                                 // morceau lointain : seulement gazon, bois et eau (léger)
      if (c.gr.length) add(soup(c.gr, EL ? -0.1 : 0.016), parkMat, false, false);
      if (c.wd.length) add(soup(c.wd, EL ? -0.12 : 0.012), woodMat, false, false);
      if (c.wt.length) add(EL ? soupWater(c.wt) : soup(c.wt, 0.024), waterMat, false, false);
      return { g, own, inst, trees: null, ts: null };
    }

    if (c.b.length) {                                              // bâtiments : murs + toits fusionnés
      const wp = [], wn = [], wc = [], wu = [], wi = [], rp = [], rn = [], rc = [], ri = [];
      const roofKind = (b, p) => {                                 // 'gable' (2 pans) · 'hip' (4 pans) · null (toit plat)
        if (!settings.roofs || p.length !== 8) return null;
        const rs = b.rs;
        if (rs === 'gabled') return 'gable'; if (rs === 'hipped' || rs === 'pyramidal') return 'hip';
        if (rs) return null;
        const l01 = Math.hypot(p[2] - p[0], p[3] - p[1]), l12 = Math.hypot(p[4] - p[2], p[5] - p[3]), area = l01 * l12;
        const houselike = HOUSE.has(b.bt) || (b.bt === 'yes' && b.h <= 8.5);
        if (!houselike || b.h > 12 || area < 30 || area > 450) return null;
        return hash01(b.id, 11) < 0.3 ? 'hip' : 'gable';
      };
      const ROOFS = th.snow ? [0xe9eef5, 0xdfe7f0, 0xf3f6fa] : [0x5a5f68, 0x6e4b3c, 0x3a3f46, 0x7a3f35, 0x4b5b4c, 0x4a4d55];
      const _d = new THREE.Color();
      function pitchedRoof(b, p, top, y0, wr, wg, wb, uo, kind) {
        const l01 = Math.hypot(p[2] - p[0], p[3] - p[1]), l12 = Math.hypot(p[4] - p[2], p[5] - p[3]), short = Math.min(l01, l12);
        const o = l01 <= l12 ? [0, 1, 2, 3] : [1, 2, 3, 0], Q = o.map(k => [p[k * 2], p[k * 2 + 1]]);
        const rise = b.rh > 0 ? Math.min(b.rh, 8) : Math.min(3.6, Math.max(1.2, short * 0.32));
        let A = [(Q[0][0] + Q[1][0]) / 2, (Q[0][1] + Q[1][1]) / 2], B = [(Q[2][0] + Q[3][0]) / 2, (Q[2][1] + Q[3][1]) / 2];
        if (kind === 'hip') {
          const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz) || 1, s = Math.max(0, Math.min(short * 0.5, L * 0.5 - 0.01));
          A = [A[0] + dx / L * s, A[1] + dz / L * s]; B = [B[0] - dx / L * s, B[1] - dz / L * s];
        }
        const ye = top + 0.05, yr = top + rise;
        let cx = 0, cz = 0; for (let k = 0; k < 4; k++) { cx += Q[k][0] / 4; cz += Q[k][1] / 4; }
        const cy = top + rise * 0.3;
        _d.set(th.patchy && hash01(b.id, 16) < 0.4 ? 0xe9eef5 : ROOFS[Math.floor(hash01(b.id, 14) * ROOFS.length) % ROOFS.length]);   // printemps : 4 toits sur 10 encore sous la neige
        const sv = 0.9 + hash01(b.id, 15) * 0.2, cr = _d.r * sv, cg = _d.g * sv, cb = _d.b * sv;
        const orient = (vs, ref) => {                              // normale orientée vers l'extérieur ; renvoie [sommets, nx, ny, nz]
          const a = vs[0], b2 = vs[1], c2 = vs[2];
          let nx = (b2[1] - a[1]) * (c2[2] - a[2]) - (b2[2] - a[2]) * (c2[1] - a[1]), ny = (b2[2] - a[2]) * (c2[0] - a[0]) - (b2[0] - a[0]) * (c2[2] - a[2]), nz = (b2[0] - a[0]) * (c2[1] - a[1]) - (b2[1] - a[1]) * (c2[0] - a[0]);
          const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
          let mx = 0, my = 0, mz = 0; for (const v of vs) { mx += v[0] / vs.length; my += v[1] / vs.length; mz += v[2] / vs.length; }
          if ((mx - ref[0]) * nx + (my - ref[1]) * ny + (mz - ref[2]) * nz < 0) return [vs.slice().reverse(), -nx, -ny, -nz];
          return [vs, nx, ny, nz];
        };
        const ref = [cx, cy, cz];
        const roofFace = (vs, r, g2, b2) => {
          const [V, nx, ny, nz] = orient(vs, ref), base = rp.length / 3;
          for (const v of V) { rp.push(v[0], v[1], v[2]); rn.push(nx, ny, nz); rc.push(r, g2, b2); }
          for (let k = 1; k + 1 < V.length; k++) ri.push(base, base + k, base + k + 1);
        };
        const gable = (v0, v1, v2) => {                            // pignon : triangle de mur
          const [V, nx, ny, nz] = orient([v0, v1, v2], ref), base = wp.length / 3, tx = V[1][0] - V[0][0], tz = V[1][2] - V[0][2], tl = Math.hypot(tx, tz) || 1;
          for (const v of V) { wp.push(v[0], v[1], v[2]); wn.push(nx, ny, nz); wc.push(wr, wg, wb); wu.push(uo + ((v[0] - V[0][0]) * tx + (v[2] - V[0][2]) * tz) / tl / TW, (v[1] - y0) / TH); }
          wi.push(base, base + 1, base + 2);
        };
        const P3 = (q, y) => [q[0], y, q[1]], Ar = [A[0], yr, A[1]], Br = [B[0], yr, B[1]];
        roofFace([P3(Q[1], ye), P3(Q[2], ye), Br, Ar], cr, cg, cb);          // pan 1
        roofFace([P3(Q[3], ye), P3(Q[0], ye), Ar, Br], cr * 0.92, cg * 0.92, cb * 0.92);   // pan 2
        if (kind === 'gable') { gable(P3(Q[0], top), P3(Q[1], top), Ar); gable(P3(Q[2], top), P3(Q[3], top), Br); }
        else { roofFace([P3(Q[0], ye), P3(Q[1], ye), Ar], cr * 0.96, cg * 0.96, cb * 0.96); roofFace([P3(Q[2], ye), P3(Q[3], ye), Br], cr * 0.96, cg * 0.96, cb * 0.96); }
        if (short > 4 && hash01(b.id, 12) < 0.5) {                 // cheminée en brique
          const t = 0.3, hx = A[0] + (B[0] - A[0]) * t, hz = A[1] + (B[1] - A[1]) * t, s = 0.32, y1 = yr - 0.5, y2 = yr + 0.9, br = 0.5, bg = 0.22, bb = 0.16;
          const c4 = [[hx - s, hz - s], [hx + s, hz - s], [hx + s, hz + s], [hx - s, hz + s]], top4 = c4.map(c => [c[0], y2, c[1]]), bot4 = c4.map(c => [c[0], y1, c[1]]);
          const cref = [hx, (y1 + y2) / 2, hz];
          for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4, [V, nx, ny, nz] = orient([bot4[k], bot4[k2], top4[k2], top4[k]], cref), base = rp.length / 3; for (const v of V) { rp.push(v[0], v[1], v[2]); rn.push(nx, ny, nz); rc.push(br, bg, bb); } ri.push(base, base + 1, base + 2, base, base + 2, base + 3); }
          const [V, nx, ny, nz] = orient(top4, cref), base = rp.length / 3; for (const v of V) { rp.push(v[0], v[1], v[2]); rn.push(nx, ny, nz); rc.push(br * 0.6, bg * 0.6, bb * 0.6); } ri.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
      for (const b of c.b) {
        const p = b.p, n = p.length / 2, h = b.h, wcol = _c.copy(bld[Math.floor(hash01(b.id, 7) * bld.length) % bld.length]).offsetHSL(0, 0, (hash01(b.id, 8) - 0.5) * 0.06);
        const wr = wcol.r, wg = wcol.g, wb = wcol.b, uo = hash01(b.id, 13) * 4; let cum = 0;
        const by = new Array(n).fill(0); let yMin = 0, yMax = 0;      // altitude du sol à chaque coin
        if (EL) { yMin = 1e9; yMax = -1e9; for (let k = 0; k < n; k++) { const y = EL(p[k * 2], p[k * 2 + 1]); by[k] = y; if (y < yMin) yMin = y; if (y > yMax) yMax = y; } }
        const sink = EL ? 0.5 : 0, y0 = yMin - sink, top = yMax + h;
        for (let k = 0; k < n; k++) {
          const a = k * 2, e = ((k + 1) % n) * 2, x1 = p[a], z1 = p[a + 1], x2 = p[e], z2 = p[e + 1], dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz) || 1;
          const nx = dz / len, nz = -dx / len, u0 = uo + cum / TW, u1 = uo + (cum + len) / TW; cum += len;
          // le mur suit le terrain : découpé en tronçons (≥ 3 m) tant que le sol s'écarte de plus de 10 cm de la ligne droite
          const pts = [0], yy = [by[k]];
          if (EL && len > 3) {
            const yat = f => EL(x1 + dx * f, z1 + dz * f);
            const rec = (f0, y0f, f1, y1f, d) => {
              if (d < 3 && len * (f1 - f0) > 3) { const fm = (f0 + f1) / 2, ym = yat(fm); if (Math.abs(ym - (y0f + y1f) / 2) > 0.1) { rec(f0, y0f, fm, ym, d + 1); rec(fm, ym, f1, y1f, d + 1); return; } }
              pts.push(f1); yy.push(y1f);
            };
            rec(0, by[k], 1, by[(k + 1) % n], 0);
          } else { pts.push(1); yy.push(by[(k + 1) % n]); }
          for (let s = 0; s + 1 < pts.length; s++) {
            const fa = pts[s], fb = pts[s + 1], xa = x1 + dx * fa, za = z1 + dz * fa, xb = x1 + dx * fb, zb = z1 + dz * fb, ya = yy[s] - sink, yb = yy[s + 1] - sink, vv = wp.length / 3;
            const ua = u0 + (u1 - u0) * fa, ub = u0 + (u1 - u0) * fb;
            wp.push(xa, ya, za, xb, yb, zb, xb, top, zb, xa, top, za);
            for (let q = 0; q < 4; q++) { const sh = q < 2 ? 0.8 : 1; wn.push(nx, 0, nz); wc.push(wr * sh, wg * sh, wb * sh); }
            wu.push(ua, (ya - y0) / TH, ub, (yb - y0) / TH, ub, (top - y0) / TH, ua, (top - y0) / TH);
            wi.push(vv, vv + 2, vv + 1, vv, vv + 3, vv + 2);
          }
        }
        const kind = roofKind(b, p);
        if (kind) pitchedRoof(b, p, top, y0, wr, wg, wb, uo, kind);
        else {
          const ring = []; for (let i = 0; i < n; i++) ring.push(new THREE.Vector2(p[i * 2], p[i * 2 + 1]));
          let F = []; try { F = THREE.ShapeUtils.triangulateShape(ring, []); } catch {}
          const base = rp.length / 3, rr = roofC.r * (0.9 + hash01(b.id, 9) * 0.2), rg = roofC.g * (0.9 + hash01(b.id, 9) * 0.2), rb = roofC.b * (0.9 + hash01(b.id, 9) * 0.2);
          for (let i = 0; i < n; i++) { rp.push(p[i * 2], top + 0.08, p[i * 2 + 1]); rn.push(0, 1, 0); rc.push(rr, rg, rb); }
          for (const f of F) ri.push(base + f[0], base + f[1], base + f[2]);
        }
      }
      add(geoOf(wp, wn, wc, wu, wi), wallMat, true, true);
      if (ri.length) add(geoOf(rp, rn, rc, null, ri), roofMat, true, false);
    }

    if (c.rs.length) {                                              // routes (asphalte + marquage), trottoirs, pistes cyclables, sentiers
      const mkG = () => ({ pos: [], idx: [], cl: [], uv: [], nm: [] });
      const G = { plain: mkG(), dash: mkG(), dbl: mkG(), foot: mkG(), lane: mkG(), walk: mkG(), deck: mkG() };
      const Y = EL ? { car: 0.06, foot: 0.075, lane: 0.09, walk: 0.04 } : { car: 0.035, foot: 0.05, lane: 0.065, walk: 0.028 };      // relief : écarts plus grands (le gazon est 10 cm SOUS le sol de la route)
      const curbCol = col(th.curb || th.walk);
      // ruban d'un segment, entre les décalages o1 (gauche) et o2 (droite) de l'axe de la route
      const strip = (g, r, i, y, o1, o2, mode, color) => {
        const i2 = i + 1, ax = r.p[i * 2], az = r.p[i * 2 + 1], bx = r.p[i2 * 2], bz = r.p[i2 * 2 + 1], dk = EL && r.deck;
        const M = EL ? Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 3)) : 1;         // sur un relief : un morceau tous les ~3 m
        const edge = f => {
          let nx = r.nl[i * 2] + (r.nl[i2 * 2] - r.nl[i * 2]) * f, nz = r.nl[i * 2 + 1] + (r.nl[i2 * 2 + 1] - r.nl[i * 2 + 1]) * f;
          const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
          const sc = r.ns[i] + (r.ns[i2] - r.ns[i]) * f, cx = ax + (bx - ax) * f, cz = az + (bz - az) * f;
          return [cx + nx * o1 * sc, cz + nz * o1 * sc, cx + nx * o2 * sc, cz + nz * o2 * sc];
        };
        const hd = f => dk ? dk[i] + (dk[i2] - dk[i]) * f : null;
        let e0 = edge(0);
        for (let m = 0; m < M; m++) {
          const f1 = (m + 1) / M, e1 = edge(f1), v = g.pos.length / 3, d0 = hd(m / M), d1 = hd(f1);
          g.pos.push(e0[0], (d0 != null ? d0 : E(e0[0], e0[1])) + y, e0[1], e0[2], (d0 != null ? d0 : E(e0[2], e0[3])) + y, e0[3], e1[0], (d1 != null ? d1 : E(e1[0], e1[1])) + y, e1[1], e1[2], (d1 != null ? d1 : E(e1[2], e1[3])) + y, e1[3]);
          if (EL) for (const [qx, qz] of [[e0[0], e0[1]], [e0[2], e0[3]], [e1[0], e1[1]], [e1[2], e1[3]]]) { const nn = dk ? [0, 1, 0] : nAt(qx, qz); g.nm.push(nn[0], nn[1], nn[2]); }
          g.idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
          const s0 = r.cl[i] + (r.cl[i2] - r.cl[i]) * (m / M), s1 = r.cl[i] + (r.cl[i2] - r.cl[i]) * f1;
          if (mode === 'lane') g.uv.push(0, s0 / 8, 1, s0 / 8, 0, s1 / 8, 1, s1 / 8);
          else if (mode === 'road') g.uv.push(0, s0 / 10, 1, s0 / 10, 0, s1 / 10, 1, s1 / 10);
          else for (let z = 0; z < 4; z++) g.cl.push(color.r, color.g, color.b);
          e0 = e1;
        }
      };
      // pont : flancs en béton + parapets, dessous du tablier, et piliers tous les ~40 m
      const CONC = [0.6, 0.6, 0.58], CONC2 = [0.42, 0.42, 0.42];
      const quad = (g, P, nrm, c) => { const v = g.pos.length / 3; for (const q of P) { g.pos.push(q[0], q[1], q[2]); g.nm.push(nrm[0], nrm[1], nrm[2]); g.cl.push(c[0], c[1], c[2]); } g.idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); };
      const bridgeParts = (r, i, hw) => {
        const i2 = i + 1, ed = k => { const nx = r.nl[k * 2], nz = r.nl[k * 2 + 1], sc = r.ns[k], cx = r.p[k * 2], cz = r.p[k * 2 + 1]; return [cx + nx * hw * sc, cz + nz * hw * sc, cx - nx * hw * sc, cz - nz * hw * sc, nx, nz, r.deck[k]]; };
        const a = ed(i), b = ed(i2), top = 1.0, bot = 0.85;
        const nbf = (D.bnb && D.bnb.get(r.ix + ':' + i)) || [false, false];
        for (const side of [0, 1]) {
          if (nbf[side]) continue;                                    // côté qui touche une autre voie du même pont : pas de parapet au milieu du tablier
          const ox = side ? 2 : 0, ax = a[ox], az = a[ox + 1], bx = b[ox], bz = b[ox + 1], sg = side ? -1 : 1, nx = a[4] * sg, nz = a[5] * sg;
          quad(G.deck, [[ax, a[6] - bot, az], [ax, a[6] + top, az], [bx, b[6] - bot, bz], [bx, b[6] + top, bz]], [nx, 0, nz], CONC);
        }
        quad(G.deck, [[a[0], a[6] - bot, a[1]], [a[2], a[6] - bot, a[3]], [b[0], b[6] - bot, b[1]], [b[2], b[6] - bot, b[3]]], [0, -1, 0], CONC2);
        const a0 = Math.floor(r.cl[i] / 40), a1 = Math.floor(r.cl[i2] / 40);
        if (a0 !== a1) {                                              // pilier au point de passage
          const f = (a1 * 40 - r.cl[i]) / Math.max(0.001, r.cl[i2] - r.cl[i]), px = r.p[i * 2] + (r.p[i2 * 2] - r.p[i * 2]) * f, pz = r.p[i * 2 + 1] + (r.p[i2 * 2 + 1] - r.p[i * 2 + 1]) * f;
          const dy = r.deck[i] + (r.deck[i2] - r.deck[i]) * f, wv = wlAt(px, pz), gy = Math.min(E(px, pz), wv != null ? wv : 1e9) - 2.5;
          if (dy - gy > 3.5) {
            let tx = r.p[i2 * 2] - r.p[i * 2], tz = r.p[i2 * 2 + 1] - r.p[i * 2 + 1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
            const hl = 0.9, hh = Math.min(hw * 0.8, 3.2), y1 = dy - bot, y0 = gy, nx = -tz, nz = tx;
            const C = (sx, sz) => [px + tx * hl * sx + nx * hh * sz, 0, pz + tz * hl * sx + nz * hh * sz];
            const cs = [C(-1, -1), C(1, -1), C(1, 1), C(-1, 1)];
            for (let k = 0; k < 4; k++) {
              const p0 = cs[k], p1 = cs[(k + 1) % 4], ex = p1[0] - p0[0], ez = p1[2] - p0[2], el = Math.hypot(ex, ez) || 1;
              quad(G.deck, [[p0[0], y0, p0[2]], [p0[0], y1, p0[2]], [p1[0], y0, p1[2]], [p1[0], y1, p1[2]]], [ez / el, 0, -ex / el], CONC);
            }
          }
        }
      };
      for (let k = 0; k < c.rs.length; k += 2) {
        const r = D.roads[c.rs[k]], i = c.rs[k + 1], hw = r.w / 2;
        if (EL && r.br && r.deck && D.preset !== 'sky') bridgeParts(r, i, hw);
        if (r.kind === 'car') {
          const L = r.cl[r.cl.length - 1], mid = (r.cl[i] + r.cl[i + 1]) / 2;
          // les lignes s'arrêtent à 7 m des bouts de la route (carrefours) pour ne pas se croiser
          const lined = marks && r.w >= 6 && mid > 7 && mid < L - 7;
          strip(lined ? (r.w >= 9 ? G.dbl : r.w >= 6.4 ? G.dash : G.plain) : G.plain, r, i, Y.car, hw, -hw, 'road');
          if (settings.sidewalks && SIDEW.has(r.cls) && !(EL && r.br && r.deck)) {                  // trottoir (sous l'asphalte : jamais par-dessus une rue qui croise) + bordure
            strip(G.walk, r, i, Y.walk, hw + 1.9, hw + 0.25, 'color', walkCol); strip(G.walk, r, i, Y.walk, -hw - 0.25, -hw - 1.9, 'color', walkCol);
            strip(G.walk, r, i, Y.walk + 0.004, hw + 0.25, hw, 'color', curbCol); strip(G.walk, r, i, Y.walk + 0.004, -hw, -hw - 0.25, 'color', curbCol);
          }
        } else if (r.kind === 'foot') strip(G.foot, r, i, Y.foot, hw, -hw, 'color', walkCol);
        else strip(G.lane, r, i, Y.lane, hw, -hw, 'lane');
      }
      const up = (n, nm) => { if (EL && nm && nm.length === n * 3) return nm; const a = []; for (let i = 0; i < n; i++) a.push(0, 1, 0); return a; };
      const mesh = (g, mat, withCol, withUv) => { if (g.pos.length) add(geoOf(g.pos, up(g.pos.length / 3, g.nm), withCol ? g.cl : null, withUv ? g.uv : null, g.idx), mat, false, true); };
      mesh(G.plain, roadMats.plain, false, true); mesh(G.dash, roadMats.dash, false, true); mesh(G.dbl, roadMats.dbl, false, true);
      if (EL && D.bfill) for (const q of D.bfill) {                  // tablier continu entre les voies d'un même pont
        if (Math.floor(q.cx / CH) !== c.cx || Math.floor(q.cz / CH) !== c.cz) continue;
        const P = k => [q.x[k], q.y[k] + 0.05, q.z[k]];
        quad(G.deck, [P(0), P(1), P(2), P(3)], [0, 1, 0], [0.52, 0.52, 0.54]);
        quad(G.deck, [[q.x[0], q.y[0] - 0.85, q.z[0]], [q.x[1], q.y[1] - 0.85, q.z[1]], [q.x[2], q.y[2] - 0.85, q.z[2]], [q.x[3], q.y[3] - 0.85, q.z[3]]], [0, -1, 0], [0.42, 0.42, 0.42]);
      }
      mesh(G.walk, walkMat, true, false); mesh(G.foot, footMat, true, false); mesh(G.lane, laneMat, false, true); mesh(G.deck, concMat, true, false);
    }

    if (marks && D.inter && D.inter.length) {                       // passages piétons aux carrefours
      if (!D._ic) { D._ic = new Map(); for (const nd of D.inter) { const kk = Math.floor(nd.x / CH) + ',' + Math.floor(nd.z / CH); let a = D._ic.get(kk); if (!a) D._ic.set(kk, a = []); a.push(nd); } }
      const nodes = D._ic.get(c.cx + ',' + c.cz);
      if (nodes) {
        const pos = [], idx = [], nm = [], yC = EL ? 0.068 : 0.042;
        for (const nd of nodes) for (const qid of nd.a) {
          const q = D.nodes.get(qid), inf = D.ek.get(nd.id + '|' + qid);
          if (!q || !inf || inf.kind !== 'car' || inf.w < 5.5 || inf.cls === 'service' || inf.cls === 'track') continue;
          const dx = q.x - nd.x, dz = q.z - nd.z, len = Math.hypot(dx, dz); if (len < 16) continue;
          const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
          let ow = 0; for (const o of nd.a) { if (o === qid) continue; const oi = D.ek.get(nd.id + '|' + o); if (oi && oi.kind === 'car' && oi.w > ow) ow = oi.w; }
          const d0 = (ow || inf.w) / 2 + 1.4, w = inf.w;
          for (let t = -w / 2 + 0.8; t <= w / 2 - 0.5; t += 1.0) {       // bandes de zèbre : 0,5 m de large, 2,6 m de long
            const cx = nd.x + ux * (d0 + 1.3) + nx * t, cz = nd.z + uz * (d0 + 1.3) + nz * t, v = pos.length / 3;
            for (const [sx, sy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
              const x = cx + ux * 1.3 * sx + nx * 0.25 * sy, z = cz + uz * 1.3 * sx + nz * 0.25 * sy, n3 = nAt(x, z);
              pos.push(x, E(x, z) + yC, z); nm.push(n3[0], n3[1], n3[2]);
            }
            idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
          }
        }
        if (pos.length) add(geoOf(pos, nm, null, null, idx), crossMat, false, true);
      }
    }

    if (EL && H.groundMat) {                                       // sol : maillage de 5 m qui suit le relief, enfoncé de 30 cm : il ne perce plus l'asphalte
      const GSTEP = lo ? 10 : 5, N = CH / GSTEP, pos = [], nrm = [], uv = [], idx = [], x0 = c.cx * CH, z0 = c.cz * CH;
      const WN = N + 3, WG = new Array(WN * WN);                    // niveau d'eau de chaque sommet (et d'une rangée autour), calculé une seule fois
      for (let b = -1; b <= N + 1; b++) for (let a = -1; a <= N + 1; a++) WG[(b + 1) * WN + a + 1] = wlAt(x0 + a * GSTEP, z0 + b * GSTEP);
      const wg = (a, b) => WG[(b + 1) * WN + a + 1];
      for (let b = 0; b <= N; b++) for (let a = 0; a <= N; a++) {
        const x = x0 + a * GSTEP, z = z0 + b * GSTEP, nn = nAt(x, z);
        let y = EL(x, z) - 0.3; const wl = wg(a, b);
        if (wl != null) y = wl - 2.5;                                                    // dans l'eau : le fond est 2,5 m sous la surface
        else for (const w2 of [wg(a + 1, b), wg(a - 1, b), wg(a, b + 1), wg(a, b - 1)]) if (w2 != null) y = Math.max(y, w2 - 0.2);   // rive : jamais d'eau qui flotte au-dessus du sol
        pos.push(x, y, z); nrm.push(nn[0], nn[1], nn[2]); uv.push(x / GS + 0.5, z / GS + 0.5);
      }
      for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) { const p0 = b * (N + 1) + a, p1 = p0 + 1, p2 = p0 + N + 1, p3 = p2 + 1; idx.push(p0, p2, p1, p1, p2, p3); }
      add(geoOf(pos, nrm, null, uv, idx), H.groundMat, false, true);
    }
    if (c.gr.length) add(soup(c.gr, EL ? -0.1 : 0.016), parkMat, false, true);
    if (c.pk.length) add(soup(c.pk, EL ? -0.03 : 0.026), pkMat, false, true);
    if (c.wd.length) add(soup(c.wd, EL ? -0.12 : 0.012), woodMat, false, true);
    if (c.wt.length) add(EL ? soupWater(c.wt) : soup(c.wt, 0.024), waterMat, false, true);

    /* arbres : dans les forêts / parcs, et le long des rues résidentielles */
    const T = [], seed = c.cx * 73856 + c.cz * 19349;
    const scatter = (arr, per, cap) => {
      for (let i = 0; i + 5 < arr.length && T.length < cap; i += 6) {
        const ax = arr[i], az = arr[i + 1], bx = arr[i + 2], bz = arr[i + 3], cx = arr[i + 4], cz = arr[i + 5];
        const area = Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
        let n = Math.min(40, Math.floor(area / per)) + (rnd(seed + i) < (area / per) % 1 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          let u = rnd(seed + i * 3 + k * 7.1), v = rnd(seed + i * 5 + k * 3.3); if (u + v > 1) { u = 1 - u; v = 1 - v; }
          const x = ax + (bx - ax) * u + (cx - ax) * v, z = az + (bz - az) * u + (cz - az) * v;
          if (!hitBuilding(D, x, z, 1.5) && !inParking(D, x, z) && clearOfRoads(D, x, z, 0.9, !!settings.sidewalks)) T.push(x, z);
        }
      }
    };
    const TD = +settings.treeDensity; if (TD > 0) { scatter(c.wd, 90 / TD, 900 * Math.max(1, TD)); scatter(c.gr, 700 / TD, 1200 * Math.max(1, TD)); }
    for (let k = 0; k < c.rs.length && T.length < 1600 * Math.max(1, TD) && TD > 0; k += 2) {
      const r = D.roads[c.rs[k]]; if (r.br || (r.cls !== 'residential' && r.cls !== 'tertiary' && r.cls !== 'living_street')) continue;
      const i = c.rs[k + 1], x1 = r.p[i * 2], z1 = r.p[i * 2 + 1], x2 = r.p[i * 2 + 2], z2 = r.p[i * 2 + 3], len = Math.hypot(x2 - x1, z2 - z1), cnt = Math.floor(len / 24);
      for (let s = 0; s < cnt; s++) {
        if (rnd(seed + k * 11 + s * 5.7) > 0.55 * TD) continue;
        const f = (s + 0.5) / cnt, side = (s + k) % 2 ? 1 : -1, off = r.w / 2 + 3.0, x = x1 + (x2 - x1) * f + r.nl[i * 2] * off * side, z = z1 + (z2 - z1) * f + r.nl[i * 2 + 1] * off * side;
        if (!hitBuilding(D, x, z, 2.2) && !inParking(D, x, z) && clearOfRoads(D, x, z, 0.9, !!settings.sidewalks)) T.push(x, z);
      }
    }
    const TS = [];
    if (T.length) {
      const n = T.length / 2, tr = new THREE.InstancedMesh(trunkGeo, trunkMat, n), lf = new THREE.InstancedMesh(leafGeo, leafMat, n);
      tr.castShadow = lf.castShadow = shadows;
      for (let i = 0; i < n; i++) {
        const s = 0.8 + rnd(seed + i * 1.7) * 0.7; TS.push(s);
        _o.position.set(T[i * 2], E(T[i * 2], T[i * 2 + 1]), T[i * 2 + 1]); _o.rotation.set(0, rnd(seed + i) * 6.28, 0); _o.scale.set(s, s * (0.9 + rnd(seed + i * 2.3) * 0.3), s); _o.updateMatrix();
        tr.setMatrixAt(i, _o.matrix); lf.setMatrixAt(i, _o.matrix);
        _c.set(th.leafPal ? th.leafPal[Math.floor(rnd(seed + i * 6.1) * th.leafPal.length) % th.leafPal.length] : th.leaf).offsetHSL((rnd(seed + i * 9) - 0.5) * 0.04, 0, (rnd(seed + i * 4) - 0.5) * 0.1); lf.setColorAt(i, _c);
      }
      g.add(tr, lf); inst.push(tr, lf);
    }
    if (D.synthetic || settings.streetLamps) {                      // lampadaires le long des routes
      const LP = [];
      for (let k = 0; k < c.rs.length; k += 2) {
        const r = D.roads[c.rs[k]]; if (r.kind !== 'car' || r.br || (!D.synthetic && NOLAMP.has(r.cls))) continue;
        const i = c.rs[k + 1], a0 = Math.floor(r.cl[i] / 34), a1 = Math.floor(r.cl[i + 1] / 34);
        if (a0 === a1) continue;
        const side = a1 % 2 ? 1 : -1, off = r.w / 2 + (settings.sidewalks && SIDEW.has(r.cls) ? 2.55 : 1.4);      // juste après le trottoir (qui va jusqu'à 1,9 m du bord), pas dessus
        const lx = r.p[i * 2] + r.nl[i * 2] * off * side, lz = r.p[i * 2 + 1] + r.nl[i * 2 + 1] * off * side;
        if (clearOfRoads(D, lx, lz, 0.35, !!settings.sidewalks)) LP.push(lx, lz);
      }
      if (LP.length) {
        const n = LP.length / 2, pm = new THREE.InstancedMesh(poleGeo, poleMat, n), bm = new THREE.InstancedMesh(bulbGeo, bulbMat, n);
        pm.castShadow = shadows;
        for (let i = 0; i < n; i++) { _o.position.set(LP[i * 2], E(LP[i * 2], LP[i * 2 + 1]), LP[i * 2 + 1]); _o.rotation.set(0, 0, 0); _o.scale.set(1, 1, 1); _o.updateMatrix(); pm.setMatrixAt(i, _o.matrix); bm.setMatrixAt(i, _o.matrix); }
        g.add(pm, bm); inst.push(pm, bm);
      }
    }
    return { g, own, inst, trees: T, ts: TS };
  }

  if (EL && H.groundMat) {                                         // sol lointain : maillage grossier de toute la zone, sous les morceaux détaillés
    const step = D.half > 2000 ? 60 : 40, ext = D.half + 400, N = Math.ceil(ext * 2 / step), pos = [], nrm = [], uv = [], idx = [];
    for (let b = 0; b <= N; b++) for (let a = 0; a <= N; a++) {
      const x = -ext + a * step, z = -ext + b * step, nn = nAt(x, z);
      pos.push(x, EL(x, z) - 2, z); nrm.push(nn[0], nn[1], nn[2]); uv.push(x / GS + 0.5, z / GS + 0.5);
    }
    for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) { const p0 = b * (N + 1) + a, p1 = p0 + 1, p2 = p0 + N + 1, p3 = p2 + 1; idx.push(p0, p2, p1, p1, p2, p3); }
    const farGeo = geoOf(pos, nrm, null, uv, idx), farMat = H.groundMat.clone();
    farMat.polygonOffset = true; farMat.polygonOffsetFactor = 4; farMat.polygonOffsetUnits = 4;
    if (NAT) grassyGround(farMat, th, true);
    const far = new THREE.Mesh(farGeo, farMat); far.frustumCulled = false; group.add(far); shared.push(farGeo, farMat);
  }

  /* ---- gazon en brins autour du joueur (v9.25) */
  let grass = null;
  if (NAT && quality !== 'low') try {
    const sw = !!settings.sidewalks;
    grass = createGrass({ group, th, quality, shadows, E,
      okCell: (x, z, r) => clearOfRoads(D, x, z, r + 0.5, sw) && !hitBuilding(D, x, z, r + 0.5) && !inWater(D, x, z) && !inParking(D, x, z),
      ok: (x, z) => clearOfRoads(D, x, z, 0.45, sw) && !hitBuilding(D, x, z, 0.6) && !inWater(D, x, z) && !inParking(D, x, z) });
  } catch (e) { console.warn('Gazon Nature indisponible :', e); }

  /* ---- gestion des morceaux autour du joueur */
  const live = new Map(); let acc = 0, lastKey = '';
  const need = (px, pz, rad) => {
    const cx = Math.floor(px / CH), cz = Math.floor(pz / CH), L = [];
    const lim = Math.ceil(D.half / CH);
    for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) {
      const k = (cx + a) + ',' + (cz + b);
      if (D.cells.has(k) || (EL && Math.abs(cx + a) <= lim && Math.abs(cz + b) <= lim)) L.push([k, a * a + b * b]);
    }
    return L.sort((p, q) => p[1] - q[1]).map(p => p[0]);
  };
  const drop = k => { const o = live.get(k); group.remove(o.g); o.own.forEach(g => g.dispose()); o.inst.forEach(m => m.dispose()); live.delete(k); };
  const make = (k, far) => {
    let cell = D.cells.get(k); if (far && !cell) return;
    if (!cell) { const [a, b] = k.split(',').map(Number); cell = { cx: a, cz: b, b: [], rs: [], wt: [], gr: [], wd: [] }; }
    let o; try { o = buildChunk(cell, far); } catch (err) { console.warn('Morceau ' + k + ' ignoré :', err); o = { g: new THREE.Group(), own: [], inst: [], trees: null, ts: null }; }
    group.add(o.g); live.set(far ? 'F' + k : k, o);
  };
  function warm(px, pz, rad = 2) { for (const k of need(px, pz, rad)) if (!live.has(k)) make(k); }
  function tick(dt, px, pz) {
    if (NAT) { natureTime(dt); if (grass) grass.update(dt, px, pz); }
    acc += dt; if (acc < 0.25) return; acc = 0;
    const RAD = RADf(), want = need(px, pz, RAD);
    LAWNK.value = Math.max(1, +settings.lawnDist || 2);
    let built = false;
    for (const k of want) if (!live.has(k)) { make(k); built = true; break; }      // un morceau par passage : pas de saccade
    const FAR = LAWNK.value > 1 ? Math.max(RAD, Math.min(RAD * 2, 5)) : RAD;       // anneau lointain : gazon / bois / eau seulement
    if (!built && FAR > RAD) { const near = new Set(want); for (const k of need(px, pz, FAR)) if (!near.has(k) && !live.has('F' + k)) { const c = D.cells.get(k); if (c && (c.gr.length || c.wd.length || c.wt.length)) { make(k, true); break; } } }
    const cx = Math.floor(px / CH), cz = Math.floor(pz / CH);
    for (const k of [...live.keys()]) { const far = k[0] === 'F', [a, b] = (far ? k.slice(1) : k).split(',').map(Number), lim = far ? FAR + 2 : RAD + 2; if (Math.abs(a - cx) > lim || Math.abs(b - cz) > lim) drop(k); }
  }

  // un tronc d'arbre à moins de r mètres ? (seuls les morceaux construits autour du joueur comptent)
  function treeAt(x, z, r = 0.45) {
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const o = live.get((cx + a) + ',' + (cz + b)); if (!o || !o.trees) continue;
      const T = o.trees, S = o.ts;
      for (let i = 0; i < S.length; i++) {
        const dx = T[i * 2] - x; if (dx > 2 || dx < -2) continue;
        const dz = T[i * 2 + 1] - z, rr = 0.3 * S[i] + r;
        if (dx * dx + dz * dz < rr * rr) return true;
      }
    }
    return false;
  }
  const hitKind = (x, z) => {
    if (D.preset === 'skate') { const ax = Math.abs(x), az = Math.abs(z); if ((ax > 140.8 && ax < 143.2 && az < 143) || (az > 140.8 && az < 143.2 && ax < 143)) return 'building'; }
    return hitBuilding(D, x, z, 0.5) ? 'building' : treeAt(x, z) ? 'tree' : null;
  };

  /* ---- point de départ : la route la plus proche de ta position (jamais dans un bâtiment) */
  const me = D.me || [0, 0];
  let sp = { x: me[0], z: me[1], yaw: 0 };
  const nr = nearestRoad(D, me[0], me[1]);
  const hasHead = D.heading != null && !isNaN(D.heading);
  const gpsError = Math.max(0, +(D.fix && D.fix.acc) || 0), snapLimit = Math.max(25, Math.min(120, gpsError * 1.1));
  const inBuilding = hitBuilding(D, me[0], me[1], 1.5), snapToRoad = !!(nr && (nr.d <= snapLimit || inBuilding && nr.d < 250));
  if (snapToRoad) sp = { x: nr.x, z: nr.z, yaw: 0, snapped: true, snapDistance: nr.d };
  if (nr && (nr.d < 40 || snapToRoad)) {
    let fx = nr.dx, fz = nr.dz;
    if (hasHead) { const hx = Math.sin(D.heading * Math.PI / 180), hz = -Math.cos(D.heading * Math.PI / 180); if (fx * hx + fz * hz < 0) { fx = -fx; fz = -fz; } }
    sp.yaw = Math.atan2(-fx, -fz);
  }
  if (hasHead && !snapToRoad) sp.yaw = -D.heading * Math.PI / 180; // le cap GPS prime quand le point n'a pas été recalé sur une route
  warm(sp.x, sp.z, lo ? 1 : 2);

  /* ---- mini-carte : dessin vectoriel autour du joueur (contexte déjà tourné et centré) */
  const hexs = n => '#' + new THREE.Color(n).getHexString();
  function mini(g, px, pz, sc) {
    const cx = Math.floor(px / CH), cz = Math.floor(pz / CH), X = x => (x - px) * sc, Z = z => (z - pz) * sc, R2 = 150 * 150;
    g.fillStyle = hexs(th.ground); g.fillRect(-400, -400, 800, 800);
    const poly = (list, fill) => {
      g.fillStyle = fill;
      for (const o of list) {
        if (o.maxx < px - 150 || o.minx > px + 150 || o.maxz < pz - 150 || o.minz > pz + 150) continue;
        g.beginPath(); for (let i = 0; i < o.p.length; i += 2) i ? g.lineTo(X(o.p[i]), Z(o.p[i + 1])) : g.moveTo(X(o.p[i]), Z(o.p[i + 1])); g.closePath(); g.fill();
      }
    };
    poly(D.woods, hexs(th.leaf)); poly(D.green, hexs(th.lawn)); poly(D.parking, hexs(th.road)); poly(D.water, hexs(th.water));
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const kind of ['foot', 'car', 'lane']) {
      g.strokeStyle = kind === 'lane' ? '#46e08a' : kind === 'car' ? hexs(th.road) : hexs(th.walk);
      g.beginPath();
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const c = D.cells.get((cx + a) + ',' + (cz + b)); if (!c) continue;
        for (let k = 0; k < c.rs.length; k += 2) {
          const r = D.roads[c.rs[k]]; if (r.kind !== kind) continue; const i = c.rs[k + 1];
          const ax = r.p[i * 2], az = r.p[i * 2 + 1]; if ((ax - px) ** 2 + (az - pz) ** 2 > R2) continue;
          g.moveTo(X(ax), Z(az)); g.lineTo(X(r.p[i * 2 + 2]), Z(r.p[i * 2 + 3]));
        }
      }
      g.lineWidth = Math.max(1.4, (kind === 'car' ? 6 : kind === 'lane' ? 2.4 : 1.4) * sc); g.stroke();
    }
    g.fillStyle = 'rgba(30,36,52,.85)';
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const c = D.cells.get((cx + a) + ',' + (cz + b)); if (!c) continue;
      for (const o of c.b) {
        if (o.maxx < px - 150 || o.minx > px + 150 || o.maxz < pz - 150 || o.minz > pz + 150) continue;
        g.beginPath(); for (let i = 0; i < o.p.length; i += 2) i ? g.lineTo(X(o.p[i]), Z(o.p[i + 1])) : g.moveTo(X(o.p[i]), Z(o.p[i + 1])); g.closePath(); g.fill();
      }
    }
  }

  return {
    spawn: sp, tick, warm, mini,
    hit: (x, z) => !!hitKind(x, z), hitKind,
    onLane: (x, z) => onRoad(D, x, z),
    nearestRoad: (x, z) => nearestRoad(D, x, z),
    inter: D.inter, route: (a, b, c, d) => route(D, a, b, c, d),
    local: (lat, lon) => D.loc(lat, lon),
    elev: (x, z) => E(x, z), hasRelief: !!EL,
    surf: (x, z, cy) => { const g = E(x, z); if (!EL) return g; const b = bridgeY(D, x, z, cy); return b != null && Math.abs(b - cy) < Math.abs(g - cy) ? b : g; },     // surface sous les roues : tablier d'un pont ou sol
    rewards: (x, z, R) => rewardsNear(D, x, z, R),
    inWater: (x, z) => inWater(D, x, z), onBridge: (x, z) => bridgeY(D, x, z) != null,
    deckY: (x, z) => bridgeY(D, x, z),
    // v9.21 : garde-corps infranchissables. Depuis le tablier, on ne peut rejoindre que (1) un autre point du tablier ou (2) le sol À LA MÊME HAUTEUR (sortie normale du pont) ; jamais le vide ni l'eau.
    bridgeLeave: (ox, oz, oy, x, z) => {
      const b0 = bridgeY(D, ox, oz, oy); if (b0 == null || Math.abs(b0 - oy) > 1.4) return null;
      const b1 = bridgeY(D, x, z, oy); if (b1 != null && Math.abs(b1 - oy) < 1.6) return null;
      if (Math.abs(E(x, z) - oy) < 0.9 && !inWater(D, x, z)) return null;
      return 'rail';
    },
    matchRoad: (x, z, hx, hz, prev, maxd) => matchRoad(D, x, z, hx, hz, prev, maxd),
    dispose() { if (grass) grass.dispose(); for (const k of [...live.keys()]) drop(k); mats.concat(shared).forEach(m => { if (m.map) m.map.dispose(); if (m.dispose) m.dispose(); }); }
  };
}
