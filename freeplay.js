// Balade libre de SKKKRT3D : pièces dorées, anneaux et drapeaux répartis régulièrement (et assez loin les uns des autres) sur ton chemin,
// plus une pièce en or et un drapeau à chacun de tes endroits favoris (lieux où tu es déjà passé au moins 3 fois).
// Les points s'accumulent : total de la balade + total à vie (gardé dans le navigateur).
import * as THREE from 'three';
import { makeFlag } from './game.js';

const KEY = 'skkkrt3d.free.v1', RR = 260, PTS = { coin: 10, big: 50, ring: 25, flag: 100, fav: 150 };
const FLAG_COLORS = [0xff4d6d, 0x4da3ff, 0xffc14d, 0xb07cff, 0x3ecf7a, 0xff8a3d, 0x00e5ff, 0xff2fb0];
const _o = new THREE.Object3D();
const load = () => { try { return Object.assign({ pts: 0, coins: 0, rings: 0, flags: 0, favs: 0, sessions: 0 }, JSON.parse(localStorage.getItem(KEY))); } catch { return { pts: 0, coins: 0, rings: 0, flags: 0, favs: 0, sessions: 0 }; } };

export function createFree(scene, cb) {
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const $ = id => document.getElementById(id);
  const el = { hud: $('fhud'), pts: $('fpts'), ses: $('fses'), pop: $('fpop') };
  const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.07, 48); coinGeo.rotateX(Math.PI / 2);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.9, roughness: 0.25, emissive: 0xc88a00, emissiveIntensity: 0.55 });
  const ringGeo = new THREE.TorusGeometry(1.7, 0.1, 14, 40);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x4dd9ff, emissive: 0x00a8d0, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.35 });
  const CMAX = 260, RMAX = 90, FMAX = 6;
  const coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, CMAX), ringMesh = new THREE.InstancedMesh(ringGeo, ringMat, RMAX);
  for (const m of [coinMesh, ringMesh]) { m.frustumCulled = false; m.castShadow = false; m.count = 0; group.add(m); }
  const flagPool = [];
  const T = load(); let S, taken, cl = [], rl = [], fl = [], refreshT = 0, lastX = 1e9, lastZ = 1e9, active = false, time = 0, hudT = 0, saveT = 0, dirty = false;
  const fresh = () => { S = { pts: 0, coins: 0, rings: 0, flags: 0, favs: 0 }; taken = new Set(); };
  fresh();

  function popup(text, cls = '') {
    if (!el.pop) return;
    const p = document.createElement('div'); p.className = 'pop ' + cls; p.textContent = text; el.pop.appendChild(p);
    while (el.pop.children.length > 4) el.pop.firstChild.remove();
    setTimeout(() => p.remove(), 1300);
  }
  const txt = (n, t) => { if (n && n.textContent !== t) n.textContent = t; };
  function hud() {
    txt(el.pts, '⭐ ' + S.pts);
    txt(el.ses, '🪙 ' + S.coins + ' · ◎ ' + S.rings + ' · 🚩 ' + S.flags + (S.favs ? ' · ⭐ ' + S.favs + ' favoris' : '') + ' · total ' + (T.pts + S.pts));
  }
  function save(force) { if (!dirty && !force) return; dirty = false; try { localStorage.setItem(KEY, JSON.stringify(T)); } catch {} }
  function gain(kind, v, fav) {
    S.pts += v; T.pts += v; dirty = true;
    if (kind === 'coin' || kind === 'bigcoin') { S.coins++; T.coins++; } else if (kind === 'ring') { S.rings++; T.rings++; } else { S.flags++; T.flags++; }
    if (fav) { S.favs++; T.favs++; }
    popup('+' + v + (kind === 'ring' ? ' ◎' : kind === 'flag' ? ' 🚩' : ' 🪙') + (fav ? ' ⭐ favori' : ''), kind === 'flag' ? 'flag' : 'coin');
    cb.sfx(kind === 'coin' ? 'coin' : kind === 'flag' ? 'flag' : kind === 'ring' ? 'ring' : 'big');
  }

  function refresh(px, pz, py) {
    const W = cb.world && cb.world();
    cl = []; rl = []; fl = [];
    if (!W || !W.api || !W.api.rewards) return;
    const api = W.api, items = [];
    for (const r of api.rewards(px, pz, RR)) if (!taken.has(r.key)) items.push(Object.assign(r, { y: api.surf(r.x, r.z, py) }));
    for (const f of (cb.favs ? cb.favs() : [])) {                                  // endroits favoris : pièce en or + drapeau
      if (Math.hypot(f.x - px, f.z - pz) > RR) continue;
      if (!taken.has('fc' + f.id)) items.push({ key: 'fc' + f.id, kind: 'bigcoin', fav: true, x: f.x, z: f.z, y: api.surf(f.x, f.z, py) });
      if (!taken.has('ff' + f.id)) items.push({ key: 'ff' + f.id, kind: 'flag', fav: true, x: f.x + 3, z: f.z, y: api.surf(f.x + 3, f.z, py) });
    }
    items.sort((a, b) => (a.x - px) ** 2 + (a.z - pz) ** 2 - ((b.x - px) ** 2 + (b.z - pz) ** 2));
    for (const it of items) {
      if (it.kind === 'ring') { if (rl.length < RMAX) rl.push(it); }
      else if (it.kind === 'flag') { if (fl.length < FMAX) fl.push(it); }
      else if (cl.length < CMAX) cl.push(it);
    }
    lastX = px; lastZ = pz;
  }

  function start() { fresh(); T.sessions++; dirty = true; active = true; group.visible = true; if (el.hud) el.hud.hidden = false; if (el.pop) el.pop.innerHTML = ''; refreshT = 0; lastX = 1e9; hud(); }
  function stop() { active = false; group.visible = false; if (el.hud) el.hud.hidden = true; for (const f of flagPool) f.g.visible = false; cl = []; rl = []; fl = []; coinMesh.count = 0; ringMesh.count = 0; save(true); }
  function reset() { refreshT = 0; lastX = 1e9; cl = []; rl = []; fl = []; }

  function update(dt, px, pz, yaw, py, paused) {
    if (!active) return;
    time += dt; refreshT -= dt; saveT += dt;
    if (refreshT <= 0 || (px - lastX) ** 2 + (pz - lastZ) ** 2 > 40 * 40) { refreshT = 1.2; refresh(px, pz, py); }
    // pièces + anneaux : une matrice par objet
    for (let k = 0; k < cl.length; k++) {
      const c = cl[k], big = c.kind === 'bigcoin';
      _o.position.set(c.x, c.y + (big ? 1.25 : 1.0) + Math.sin(time * 2.6 + k) * 0.08, c.z); _o.rotation.set(0, time * 2.4 + k, 0); _o.scale.setScalar(big ? 1.7 : 1);
      _o.updateMatrix(); coinMesh.setMatrixAt(k, _o.matrix);
    }
    coinMesh.count = cl.length; coinMesh.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < rl.length; k++) {
      const r = rl[k];
      _o.position.set(r.x, r.y + 1.7, r.z); _o.rotation.set(0, r.yaw, 0); _o.scale.setScalar(1 + Math.sin(time * 3 + k) * 0.04);
      _o.updateMatrix(); ringMesh.setMatrixAt(k, _o.matrix);
    }
    ringMesh.count = rl.length; ringMesh.instanceMatrix.needsUpdate = true;
    // drapeaux : on réutilise quelques drapeaux (6 au plus), posés sur les plus proches
    for (let k = 0; k < FMAX; k++) {
      if (!flagPool[k]) { flagPool[k] = makeFlag(FLAG_COLORS[k % FLAG_COLORS.length]); group.add(flagPool[k].g); }
      const F = flagPool[k], it = fl[k];
      if (!it) { F.g.visible = false; continue; }
      F.g.visible = true; F.g.position.set(it.x, it.y, it.z);
      if ((it.x - px) ** 2 + (it.z - pz) ** 2 < 120 * 120) {
        const pa = F.geo.attributes.position, arr = pa.array;
        for (let i = 0; i < pa.count; i++) { const x = F.base[i * 3], q = x / 2.1; arr[i * 3 + 2] = Math.sin(x * 3.2 - time * 5 + F.ph) * 0.22 * q; arr[i * 3 + 1] = F.base[i * 3 + 1] + Math.sin(x * 2 - time * 3 + F.ph) * 0.05 * q; }
        pa.needsUpdate = true;
      }
      F.beam.material.opacity = it.fav ? 0.3 : 0.14;
    }
    // ramassage
    if (!paused) {
      let hit = false;
      for (let k = 0; k < cl.length; k++) {
        const c = cl[k], big = c.kind === 'bigcoin', r = big ? 2.1 : 1.6;
        if ((c.x - px) ** 2 + (c.z - pz) ** 2 < r * r) { taken.add(c.key); cl[k] = null; hit = true; gain(c.kind, big ? PTS.big : PTS.coin, c.fav); }
      }
      for (let k = 0; k < rl.length; k++) { const r = rl[k]; if ((r.x - px) ** 2 + (r.z - pz) ** 2 < 2.5 * 2.5) { taken.add(r.key); rl[k] = null; hit = true; gain('ring', PTS.ring, false); } }
      for (let k = 0; k < fl.length; k++) { const f = fl[k]; if ((f.x - px) ** 2 + (f.z - pz) ** 2 < 3.2 * 3.2) { taken.add(f.key); fl[k] = null; hit = true; gain('flag', f.fav ? PTS.fav : PTS.flag, f.fav); } }
      if (hit) { cl = cl.filter(Boolean); rl = rl.filter(Boolean); fl = fl.filter(Boolean); }
    }
    hudT -= dt; if (hudT <= 0) { hudT = 0.25; hud(); }
    if (saveT > 6) { saveT = 0; save(); }
  }

  function drawMap(g, px, pz, sc) {                                             // mini-carte (contexte déjà tourné et centré)
    if (!active) return;
    g.fillStyle = '#ffd24a';
    for (const c of cl) { const dx = c.x - px, dz = c.z - pz; if (dx * dx + dz * dz > 6400) continue; g.beginPath(); g.arc(dx * sc, dz * sc, c.kind === 'bigcoin' ? 3.4 : 2, 0, 7); g.fill(); }
    g.strokeStyle = '#4dd9ff'; g.lineWidth = 2;
    for (const r of rl) { const dx = r.x - px, dz = r.z - pz; if (dx * dx + dz * dz > 6400) continue; g.beginPath(); g.arc(dx * sc, dz * sc, 3.6, 0, 7); g.stroke(); }
    g.fillStyle = '#ff4d6d'; g.strokeStyle = '#fff';
    for (const f of fl) { let dx = f.x - px, dz = f.z - pz; const d = Math.hypot(dx, dz), k = d > 66 ? 66 / d : 1; dx *= k; dz *= k; g.beginPath(); g.arc(dx * sc, dz * sc, 5, 0, 7); g.fill(); g.stroke(); }
  }
  return { group, start, stop, reset, update, drawMap, totals: () => T, session: () => S, clearTotals() { T.pts = T.coins = T.rings = T.flags = T.favs = 0; dirty = true; save(true); hud(); }, get active() { return active; } };
}
