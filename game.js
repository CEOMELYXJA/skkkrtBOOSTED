// Jeu « Capture de drapeaux » de SKKKRT3D
// – drapeaux à capturer (en roulant dedans) le long des pistes cyclables, dans l'ordre que tu veux
// – pièces dorées (+10, grosses pièces +50) qui dessinent le chemin d'un drapeau à l'autre
// – chrono à rebours (chaque drapeau rajoute du temps), points, pénalités de chute / cycliste, bilan final
import * as THREE from 'three';
import { STREETS, LANE_OFF, OVAL, SPAWN } from './world.js';
import { settings } from './settings.js';

const LEVELS = {
  easy: { name: 'Facile',    flags: 6, time: 160, bonus: 20, hop: [50, 160] },
  med:  { name: 'Moyen',     flags: 9, time: 165, bonus: 15, hop: [80, 200] },
  hard: { name: 'Difficile', flags: 12, time: 150, bonus: 10, hop: [100, 260] }
};
export const LEVEL_NAMES = Object.fromEntries(Object.entries(LEVELS).map(([k, v]) => [k, v.name]));

const PTS = { coin: 10, big: 50, ring: 25, flag: 100, perSecond: 5, fall: 30, cyclist: 20 };
const FLAG_COLORS = [0xff4d6d, 0x4da3ff, 0xffc14d, 0xb07cff, 0x3ecf7a, 0xff8a3d, 0x00e5ff, 0xff2fb0, 0xffffff];
const FLAG_R = 3.0, COIN_R = 1.35, BIG_R = 1.9;
const BKEY = 'skkkrt3d.best';

const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const loadBest = () => { try { return JSON.parse(localStorage.getItem(BKEY)) || {}; } catch { return {}; } };
const saveBest = b => { try { localStorage.setItem(BKEY, JSON.stringify(b)); } catch {} };
const ease = x => x * x * (3 - 2 * x);
const _o = new THREE.Object3D();

export function makeFlag(color) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 6, 20), new THREE.MeshStandardMaterial({ color: 0xdfe3ea, metalness: 0.6, roughness: 0.35 }));
  pole.position.y = 3; pole.castShadow = true; body.add(pole);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 30, 25), new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.9, roughness: 0.2, emissive: 0x8a5a00, emissiveIntensity: 0.5 }));
  ball.position.y = 6.1; body.add(ball);
  const geo = new THREE.PlaneGeometry(2.1, 1.25, 14, 4); geo.translate(1.05, 0, 0);
  const base = Float32Array.from(geo.attributes.position.array);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, side: THREE.DoubleSide, roughness: 0.8 }));
  cloth.position.set(0.07, 5.25, 0); body.add(cloth);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 70, 50, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 35; g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 3.0, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  ring.position.y = 0.1; g.add(ring);
  return { g, body, geo, base, beam, ring, color, ph: Math.random() * 6.28 };
}

export function createGame(scene, cb) {
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.07, 64); coinGeo.rotateX(Math.PI / 2);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.9, roughness: 0.25, emissive: 0xc88a00, emissiveIntensity: 0.55 });

  const $ = id => document.getElementById(id);
  const el = {
    hud: $('ghud'), time: $('gtime'), score: $('gscore'), flags: $('gflags'), coins: $('gcoins'),
    arrow: $('garrow'), target: $('gtarget'), dist: $('gdist'), pop: $('gpop'), banner: $('gbanner'), flash: $('flash'),
    res: $('results'), rTitle: $('rTitle'), rRows: $('rRows'), rAgain: $('rAgain'), rFree: $('rFree'), best: $('gBest')
  };
  el.rAgain.onclick = () => cb.again();
  el.rFree.onclick = () => cb.free();

  let coinMesh = null, ringMesh = null, coins = [], flags = [], time = 0;
  const ringGeo = new THREE.TorusGeometry(1.7, 0.1, 14, 40);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x4dd9ff, emissive: 0x00a8d0, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.35 });
  let S = { phase: 'idle' };
  const txt = (n, t) => { if (n && n.textContent !== t) n.textContent = t; };

  /* ---------------------------------------------------------- messages */
  let bannerTimer = 0;
  function say(text, ms = 1000, cls = '') {
    const b = el.banner; if (!b) return;
    b.textContent = text; b.className = cls; b.hidden = false;
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.hidden = true; }, ms);
  }
  function popup(text, cls = '') {
    const p = document.createElement('div'); p.className = 'pop ' + cls; p.textContent = text;
    el.pop.appendChild(p);
    while (el.pop.children.length > 5) el.pop.firstChild.remove();
    setTimeout(() => p.remove(), 1400);
    return p;
  }
  let coinPop = null, coinPopSum = 0, coinPopAt = 0;
  function coinPoints(v) {
    const now = performance.now();
    if (coinPop && coinPop.isConnected && now - coinPopAt < 700) { coinPopSum += v; coinPop.textContent = '+' + coinPopSum + ' 🪙'; }
    else { coinPopSum = v; coinPop = popup('+' + v + ' 🪙', 'coin'); }
    coinPopAt = now;
  }

  /* ---------------------------------------------------------- mise en place d'une partie */
  function clear() {
    for (const f of flags) {
      group.remove(f.g);
      f.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    if (coinMesh) { group.remove(coinMesh); coinMesh.dispose(); }
    if (ringMesh) { group.remove(ringMesh); ringMesh.dispose(); ringMesh = null; }
    flags = []; coins = []; coinMesh = null;
  }

  // carte réelle : drapeaux aux vraies intersections, pièces le long du vrai chemin entre les drapeaux
  function layoutReal(lv, W) {
    const sp = W.spawn, d0 = n => Math.hypot(n.x - sp.x, n.z - sp.z);
    let pool = W.inter.filter(n => d0(n) > 45 && d0(n) < 1000);
    if (pool.length < lv.flags) pool = W.inter.filter(n => d0(n) > 20);
    const used = new Set(), picks = [];
    let cur = { x: sp.x, z: sp.z };
    for (let k = 0; k < lv.flags; k++) {
      let c = pool.filter(n => !used.has(n.id) && (d => d >= lv.hop[0] && d <= lv.hop[1])(Math.abs(n.x - cur.x) + Math.abs(n.z - cur.z)));
      if (!c.length) c = pool.filter(n => !used.has(n.id));
      if (!c.length) break;
      const n = c[Math.floor(Math.random() * c.length)];
      used.add(n.id); picks.push(n); cur = n;
    }
    const fl = picks.map((n, i) => Object.assign(makeFlag(FLAG_COLORS[i % FLAG_COLORS.length]), { x: n.x, z: n.z, cap: false, t: 0, gone: false }));
    const cs = [], near = (x, z, r) => cs.some(c => Math.hypot(c.x - x, c.z - z) < r);
    let ci = 0;
    const addCoin = (x, z, yaw = 0) => {
      if (Math.hypot(x - sp.x, z - sp.z) < 8 || fl.some(f => Math.hypot(f.x - x, f.z - z) < 5) || near(x, z, 3)) return;
      const ring = (ci++ % 3) !== 0;                                // v9.21 : 2 anneaux pour 1 pièce
      cs.push({ x, z, big: false, ring, yaw, v: ring ? PTS.ring : PTS.coin, taken: false });
    };
    let p = { x: sp.x, z: sp.z };
    for (const f of fl) {
      const path = W.route(p.x, p.z, f.x, f.z) || [[p.x, p.z], [f.x, f.z]];
      for (let i = 1; i < path.length; i++) {
        const [x1, z1] = path[i - 1], [x2, z2] = path[i], len = Math.hypot(x2 - x1, z2 - z1);
        for (let s = 3; s < len; s += 15) addCoin(x1 + (x2 - x1) * s / len, z1 + (z2 - z1) * s / len, Math.atan2(x2 - x1, z2 - z1));
      }
      p = f;
    }
    for (let i = 0; i < Math.min(3, cs.length); i++) { const c = cs[Math.floor(Math.random() * cs.length)]; if (c.ring) continue; c.big = true; c.v = PTS.big; }
    return { fl, cs };
  }

  function layout(lv) {
    const RW = cb.world && cb.world();
    if (RW && RW.real) return layoutReal(lv, RW.api);   // l'API de la carte (spawn, intersections, itinéraire)
    const nodes = [];
    STREETS.forEach((a, i) => STREETS.forEach((b, j) => nodes.push({ key: i + '_' + j, x: a + LANE_OFF, z: b + LANE_OFF })));
    const used = new Set(), picks = [];
    let cur = { x: SPAWN.x, z: SPAWN.z };
    const far = n => Math.hypot(n.x - SPAWN.x, n.z - SPAWN.z) > 45;
    for (let k = 0; k < lv.flags; k++) {
      let c = nodes.filter(n => !used.has(n.key) && far(n) && (d => d >= lv.hop[0] && d <= lv.hop[1])(Math.abs(n.x - cur.x) + Math.abs(n.z - cur.z)));
      if (!c.length) c = nodes.filter(n => !used.has(n.key) && far(n));
      const n = c[Math.floor(Math.random() * c.length)];
      used.add(n.key); picks.push(n); cur = n;
    }
    const fl = picks.map((n, i) => Object.assign(makeFlag(FLAG_COLORS[i % FLAG_COLORS.length]), { x: n.x, z: n.z, cap: false, t: 0, gone: false }));

    // pièces : chemin sur les pistes (spawn → drapeau 1 → drapeau 2 …), puis quelques-unes dans le parc
    const cs = [];
    const near = (x, z, r) => cs.some(c => Math.hypot(c.x - x, c.z - z) < r);
    let ci = 0;
    const addCoin = (x, z, big = false, yaw = 0, canRing = false) => {
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 8) return;
      if (fl.some(f => Math.hypot(f.x - x, f.z - z) < 5)) return;
      if (near(x, z, 3)) return;
      const ring = canRing && !big && (ci++ % 3) !== 0;             // v9.21 : 2 anneaux pour 1 pièce sur les routes
      cs.push({ x, z, big, ring, yaw, v: big ? PTS.big : ring ? PTS.ring : PTS.coin, taken: false });
    };
    const seg = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1), yaw = Math.atan2(x2 - x1, z2 - z1);
      for (let s = 6; s < len; s += 15) addCoin(x1 + (x2 - x1) * s / len, z1 + (z2 - z1) * s / len, false, yaw, true);
    };
    let p = { x: SPAWN.x, z: SPAWN.z };
    fl.forEach((f, i) => {
      if (i === 0 || Math.random() < 0.5) { seg(p.x, p.z, p.x, f.z); seg(p.x, f.z, f.x, f.z); }   // d'abord en long…
      else { seg(p.x, p.z, f.x, p.z); seg(f.x, p.z, f.x, f.z); }                                  // …ou d'abord en large
      p = f;
    });
    const NO = 10;
    for (let i = 0; i < NO; i++) {
      const a = (i / NO) * Math.PI * 2;
      addCoin(Math.cos(a) * OVAL.rx, Math.sin(a) * OVAL.rz);
    }
    for (let i = 0; i < 3; i++) {                                                  // grosses pièces (+50) dans le parc
      const a = Math.random() * Math.PI * 2, x = Math.cos(a) * OVAL.rx * 0.98, z = Math.sin(a) * OVAL.rz * 0.98;
      let k = -1, best = 1e9;
      cs.forEach((c, j) => { const d = Math.hypot(c.x - x, c.z - z); if (!c.big && d < best) { best = d; k = j; } });
      if (k >= 0 && best < 8) { cs[k].big = true; cs[k].v = PTS.big; }
    }
    return { fl, cs };
  }

  function start() {
    clear();
    const lv = LEVELS[settings.difficulty] || LEVELS.med;
    const { fl, cs } = layout(lv);
    flags = fl; coins = cs;
    const ground = (x, z) => { const w = cb.world && cb.world(); return w && w.api && w.api.elev ? w.api.elev(x, z) : 0; };   // relief
    flags.forEach(f => { f.g.position.set(f.x, ground(f.x, f.z), f.z); group.add(f.g); });
    coins.forEach(c => { c.gy = ground(c.x, c.z); });
    coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, Math.max(1, coins.length));
    coinMesh.frustumCulled = false; coinMesh.castShadow = false;
    group.add(coinMesh);
    ringMesh = new THREE.InstancedMesh(ringGeo, ringMat, Math.max(1, coins.length)); ringMesh.frustumCulled = false; ringMesh.castShadow = false; group.add(ringMesh);
    S = { phase: 'ready', lv, id: settings.difficulty, ready: 3, lastNum: 0, score: 0, left: lv.time, elapsed: 0, coins: 0, rings: 0, captured: 0, falls: 0, hits: 0, lastTick: 99 };
    group.visible = true; el.hud.hidden = false; el.res.hidden = true; el.pop.innerHTML = '';
    say('Prépare-toi !', 900);
    hudText(true);
  }
  function stop() {
    clear(); S = { phase: 'idle' };
    group.visible = false; el.hud.hidden = true; el.res.hidden = true; el.banner.hidden = true; el.pop.innerHTML = '';
  }

  /* ---------------------------------------------------------- règles */
  const target = () => flags.find(f => !f.cap) || null;
  function targetVec(x, z) { const t = target(); return t ? [t.x - x, t.z - z] : null; }

  function penalty(n, label) {
    S.score -= Math.min(S.score, n);
    popup('−' + n + ' ' + label, 'bad');
  }
  function event(kind) {
    if (S.phase !== 'run') return;
    if (kind === 'wall') { S.falls++; penalty(PTS.fall, 'CHUTE'); }
    else if (kind === 'cyclist') { S.hits++; penalty(PTS.cyclist, 'CYCLISTE'); }
    else if (kind === 'ped') { S.hits++; penalty(PTS.cyclist, 'PIÉTON'); }
    else if (kind === 'car') { S.hits++; penalty(PTS.fall, 'VÉHICULE'); }
    else if (kind === 'cyclistfall') S.falls++;
  }

  function end(win) {
    S.phase = win ? 'win' : 'lose';
    const bonus = win ? Math.round(S.left) * PTS.perSecond : 0;
    S.score += bonus;
    const all = loadBest(), b = all[S.id] || { score: 0, time: 0 };
    const newBest = S.score > b.score;
    if (newBest) b.score = S.score;
    if (win && (!b.time || S.elapsed < b.time)) b.time = Math.round(S.elapsed);
    all[S.id] = b; saveBest(all);
    el.rTitle.textContent = win ? '🏆 Victoire !' : '⏱ Temps écoulé';
    const rows = [
      ['⭐ Points', S.score + (newBest ? ' · record !' : '')],
      ['🚩 Drapeaux', S.captured + ' / ' + flags.length],
      ['🪙 Pièces', S.coins + ' / ' + coins.filter(c => !c.ring).length],
      ['◎ Anneaux', S.rings + ' / ' + coins.filter(c => c.ring).length],
      ['💥 Chutes', S.falls],
      ['🚴 Cyclistes percutés', S.hits],
      ['⏱ Temps de jeu', fmt(S.elapsed)]
    ];
    if (win) rows.push(['⚡ Bonus temps restant', '+' + bonus]);
    rows.push(['🏅 Meilleur (' + S.lv.name + ')', b.score + ' pts' + (b.time ? ' · ' + fmt(b.time) : '')]);
    el.rRows.innerHTML = rows.map(r => '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
    el.res.hidden = false;
    if (cb.onEnd) cb.onEnd();
    cb.sfx(win ? 'win' : 'lose');
    say(win ? 'TOUS LES DRAPEAUX !' : 'TEMPS ÉCOULÉ', 1600, win ? 'good' : 'bad');
    hudText(true);
  }

  function capture(f) {
    f.cap = true; f.t = 0; S.captured++;
    S.score += PTS.flag; S.left += S.lv.bonus;
    popup('+' + PTS.flag + ' 🚩', 'flag'); popup('+' + S.lv.bonus + ' s ⏱', 'time');
    cb.sfx('flag');
    if (S.captured >= flags.length) end(true);
    else say('DRAPEAU ' + S.captured + ' / ' + flags.length, 900, 'good');
  }

  /* ---------------------------------------------------------- HUD */
  function hudText(force) {
    txt(el.time, '⏱ ' + fmt(S.left == null ? 0 : S.left));
    el.time.classList.toggle('warn', S.phase === 'run' && S.left <= 20);
    txt(el.score, '⭐ ' + (S.score | 0));
    txt(el.flags, '🚩 ' + (S.captured | 0) + '/' + flags.length);
    txt(el.coins, '🪙 ' + (S.coins | 0));
  }
  function hudTarget(px, pz, yaw) {
    const t = target();
    if (!t || (S.phase !== 'run' && S.phase !== 'ready')) { el.target.hidden = true; return; }
    el.target.hidden = false;
    const dx = t.x - px, dz = t.z - pz;
    // x écran = d · droite, haut écran = d · avant
    const xs = dx * Math.cos(yaw) - dz * Math.sin(yaw), up = -(dx * Math.sin(yaw) + dz * Math.cos(yaw));
    el.arrow.style.transform = 'rotate(' + Math.atan2(xs, up) + 'rad)';
    txt(el.dist, 'Drapeau ' + (flags.indexOf(t) + 1) + ' · ' + Math.round(Math.hypot(dx, dz)) + ' m');
  }

  /* ---------------------------------------------------------- boucle */
  function update(dt, px, pz, yaw, paused) {
    if (!group.visible) return;
    time += dt;

    // pièces : rotation + flottement (une seule matrice par pièce)
    if (coinMesh) {
      for (let k = 0; k < coins.length; k++) {
        const c = coins[k];
        _o.position.set(c.x, (c.gy || 0) + (c.big ? 1.25 : 1.0) + Math.sin(time * 2.6 + k) * 0.08, c.z);
        _o.rotation.set(0, time * 2.4 + k, 0);
        _o.scale.setScalar(c.taken || c.ring ? 0.0001 : c.big ? 1.7 : 1);
        _o.updateMatrix(); coinMesh.setMatrixAt(k, _o.matrix);
        if (ringMesh) {
          _o.position.set(c.x, (c.gy || 0) + 1.7, c.z); _o.rotation.set(0, c.yaw || 0, 0); _o.scale.setScalar(c.taken || !c.ring ? 0.0001 : 1 + Math.sin(time * 3 + k) * 0.04);
          _o.updateMatrix(); ringMesh.setMatrixAt(k, _o.matrix);
        }
      }
      coinMesh.instanceMatrix.needsUpdate = true; if (ringMesh) ringMesh.instanceMatrix.needsUpdate = true;
    }

    // drapeaux : ondulation, balise du prochain, animation de capture
    const tg = target();
    for (const f of flags) {
      if (f.gone) continue;
      if (f.cap) {
        f.t += dt;
        const k = Math.min(1, f.t / 0.8);
        f.body.position.y = ease(k) * 5; f.body.scale.setScalar(Math.max(0.001, 1 - ease(k)));
        f.ring.scale.setScalar(1 + f.t * 5); f.ring.material.opacity = 0.85 * Math.max(0, 1 - f.t / 0.7);
        f.beam.material.opacity = 0.16 * Math.max(0, 1 - f.t / 0.5);
        if (f.t > 0.85) { f.gone = true; f.g.visible = false; }
        continue;
      }
      const d2 = (f.x - px) ** 2 + (f.z - pz) ** 2;
      if (d2 < 150 * 150) {                                                  // on n'anime que les drapeaux proches
        const pa = f.geo.attributes.position, arr = pa.array;
        for (let i = 0; i < pa.count; i++) {
          const x = f.base[i * 3], k = x / 2.1;
          arr[i * 3 + 2] = Math.sin(x * 3.2 - time * 5 + f.ph) * 0.22 * k;
          arr[i * 3 + 1] = f.base[i * 3 + 1] + Math.sin(x * 2 - time * 3 + f.ph) * 0.05 * k;
        }
        pa.needsUpdate = true;
      }
      const isT = f === tg;
      f.beam.material.opacity = isT ? 0.34 : 0.12;
      f.ring.scale.setScalar(1 + (isT ? 0.1 : 0.04) * Math.sin(time * 4 + f.ph));
    }

    if (S.phase === 'ready' && !paused) {
      S.ready -= dt;
      const n = Math.ceil(S.ready);
      if (S.ready <= 0) { S.phase = 'run'; say('GO !', 900, 'good'); cb.sfx('go'); }
      else if (n !== S.lastNum) { S.lastNum = n; say(String(n), 900); cb.sfx('tick'); }
    } else if (S.phase === 'run' && !paused) {
      S.left -= dt; S.elapsed += dt;
      if (S.left < 10 && Math.ceil(S.left) !== S.lastTick) { S.lastTick = Math.ceil(S.left); if (S.left > 0) cb.sfx('tick'); }
      for (let k = 0; k < coins.length; k++) {
        const c = coins[k]; if (c.taken) continue;
        const dx = c.x - px, dz = c.z - pz, r = c.ring ? 2.4 : c.big ? BIG_R : COIN_R;
        if (dx * dx + dz * dz < r * r) {
          c.taken = true; S.score += c.v;
          if (c.ring) { S.rings++; popup('+' + c.v + ' ◎', 'coin'); cb.sfx('ring'); }
          else { S.coins++; coinPoints(c.v); cb.sfx(c.big ? 'big' : 'coin'); }
        }
      }
      for (const f of flags) {
        if (f.cap) continue;
        if ((f.x - px) ** 2 + (f.z - pz) ** 2 < FLAG_R * FLAG_R) { capture(f); if (S.phase !== 'run') break; }
      }
      if (S.phase === 'run' && S.left <= 0) { S.left = 0; end(false); }
    }
    hudText();
    hudTarget(px, pz, yaw);
  }

  /* ---------------------------------------------------------- mini-carte (contexte déjà tourné et centré sur le pilote) */
  function drawMap(g, px, pz, sc) {
    if (!group.visible) return;
    for (const c of coins) {
      if (c.taken) continue;
      const dx = c.x - px, dz = c.z - pz;
      if (dx * dx + dz * dz > 6400) continue;
      g.fillStyle = c.ring ? '#4dd9ff' : '#ffd24a';
      g.beginPath(); g.arc(dx * sc, dz * sc, c.big ? 3.4 : c.ring ? 2.6 : 2, 0, 7); g.fill();
    }
    const tg = target();
    for (const f of flags) {
      if (f.cap) continue;
      let dx = f.x - px, dz = f.z - pz;
      const d = Math.hypot(dx, dz), k = d > 66 ? 66 / d : 1;
      dx *= k; dz *= k;
      g.fillStyle = '#' + f.color.toString(16).padStart(6, '0');
      g.strokeStyle = '#fff'; g.lineWidth = 2;
      g.beginPath(); g.arc(dx * sc, dz * sc, f === tg ? 8 : 5.5, 0, 7); g.fill(); g.stroke();
    }
  }

  const bestLine = id => {
    const b = loadBest()[id || settings.difficulty];
    return b && b.score ? 'Meilleur : ' + b.score + ' pts' + (b.time ? ' · ' + fmt(b.time) : '') : 'Aucun record pour l’instant';
  };

  return {
    group, start, stop, update, event, drawMap, say, target, targetVec, bestLine,
    clearBest() { try { localStorage.removeItem(BKEY); } catch {} },
    get phase() { return S.phase; },
    get active() { return group.visible; },
    get score() { return S.score || 0; }
  };
}
