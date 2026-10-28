// Circulation : piétons, voitures et cyclistes qui suivent le réseau routier (carte réelle ou ville imaginaire).
// Ils vivent autour du joueur (rayon ~200 m) et sont recyclés quand il s'éloigne. On tombe si on les percute.
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const SHIRTS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22, 0xecf0f1, 0x1abc9c, 0xff6fa5, 0x34495e];
const PANTS = [0x2c3e50, 0x34495e, 0x1f2933, 0x5d6d7e, 0x7b5e3b, 0x273746];
const SKINS = [0xf2c9a0, 0xd9a577, 0xa86f45, 0x6f4a2f, 0xf7d6b8];
const CARS = [0xc0392b, 0x2980b9, 0xecf0f1, 0x2c3e50, 0x7f8c8d, 0xf39c12, 0x27ae60, 0x1b1b1f, 0xbdc3c7, 0x8e44ad];

export function createTraffic(group, D, th, quality, makeCyclist, night, deckY) {
  const E = D.H || (() => 0);                                     // relief : altitude du sol
  const NP = quality === 'low' ? 8 : quality === 'med' ? 14 : 22;
  const NC = quality === 'low' ? 5 : quality === 'med' ? 8 : 12;
  const NY = quality === 'low' ? 3 : quality === 'med' ? 5 : 8;
  const NE = quality === 'low' ? 3 : 4;                            // véhicules d'urgence (mode urgence / criminel)
  const RING_MIN = 70, RING_MAX = 200, FAR = 240;

  /* ------------------------------------------------------------ graphe + index spatial */
  const nodes = D.nodes, BK = 100, bucket = new Map();
  for (const n of nodes.values()) { if (!n.a.length) continue; const k = Math.floor(n.x / BK) + ',' + Math.floor(n.z / BK); let a = bucket.get(k); if (!a) bucket.set(k, a = []); a.push(n); }
  const edge = (a, b) => D.ek.get(a + '|' + b);
  const okFor = (type, a, b) => {
    const e = edge(a, b); if (!e) return false;
    if (type === 'car') return e.kind === 'car' && e.w >= 6;
    return true;
  };
  const nodesAround = (px, pz, rmin, rmax) => {
    const out = [], c = Math.ceil(rmax / BK);
    const cx = Math.floor(px / BK), cz = Math.floor(pz / BK);
    for (let a = -c; a <= c; a++) for (let b = -c; b <= c; b++) {
      const g = bucket.get((cx + a) + ',' + (cz + b)); if (!g) continue;
      for (const n of g) { const d = Math.hypot(n.x - px, n.z - pz); if (d >= rmin && d <= rmax) out.push(n); }
    }
    return out;
  };

  /* ------------------------------------------------------------ modèles */
  const matCache = new Map();
  const mat = (c, o = {}) => { const k = c + '|' + JSON.stringify(o); let m = matCache.get(k); if (!m) { m = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.8 }, o)); matCache.set(k, m); } return m; };
  const geos = {
    torso: new THREE.CylinderGeometry(0.2, 0.22, 0.62, 25).translate(0, 1.08, 0),
    head: new THREE.SphereGeometry(0.15, 35, 25).translate(0, 1.55, 0),
    leg: new THREE.BoxGeometry(0.15, 0.78, 0.17).translate(0, -0.39, 0),
    arm: new THREE.BoxGeometry(0.11, 0.55, 0.12).translate(0, -0.27, 0),
    body: new THREE.BoxGeometry(1.8, 0.62, 4.3).translate(0, 0.62, 0),
    cab: new THREE.BoxGeometry(1.58, 0.55, 2.2).translate(0, 1.2, -0.25),
    wheel: new THREE.CylinderGeometry(0.34, 0.34, 0.24, 35).rotateZ(Math.PI / 2),
    lamp: new THREE.BoxGeometry(0.4, 0.14, 0.06)
  };
  const dispose = [...Object.values(geos)];
  function makePed() {
    const g = new THREE.Group(), shirt = pick(SHIRTS), pants = pick(PANTS), skin = pick(SKINS);
    const torso = new THREE.Mesh(geos.torso, mat(shirt)), head = new THREE.Mesh(geos.head, mat(skin));
    torso.castShadow = head.castShadow = true;
    const mkLimb = (geo, m, x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); const l = new THREE.Mesh(geo, m); l.castShadow = true; p.add(l); g.add(p); return p; };
    const lL = mkLimb(geos.leg, mat(pants), -0.09, 0.78), lR = mkLimb(geos.leg, mat(pants), 0.09, 0.78);
    const aL = mkLimb(geos.arm, mat(shirt), -0.29, 1.34), aR = mkLimb(geos.arm, mat(shirt), 0.29, 1.34);
    g.add(torso, head); g.userData.limbs = [lL, lR, aL, aR];
    g.scale.setScalar(rnd(0.92, 1.08));
    return g;
  }
  function makeCar() {
    const g = new THREE.Group(), col = pick(CARS);
    const body = new THREE.Mesh(geos.body, mat(col, { roughness: 0.45, metalness: 0.3 })), cab = new THREE.Mesh(geos.cab, mat(0x20262d, { roughness: 0.2, metalness: 0.5 }));
    body.castShadow = cab.castShadow = true; g.add(body, cab);
    for (const [x, z] of [[-0.9, 1.35], [0.9, 1.35], [-0.9, -1.35], [0.9, -1.35]]) { const w = new THREE.Mesh(geos.wheel, mat(0x111111)); w.position.set(x, 0.34, z); g.add(w); }
    const hl = mat(0xfff4c2, { emissive: 0xfff4c2, emissiveIntensity: night ? 2.2 : 0.5 }), tl = mat(0xaa0000, { emissive: 0xff1a1a, emissiveIntensity: night ? 1.6 : 0.4 });
    for (const x of [-0.55, 0.55]) { const a = new THREE.Mesh(geos.lamp, hl); a.position.set(x, 0.72, 2.16); const b = new THREE.Mesh(geos.lamp, tl); b.position.set(x, 0.72, -2.16); g.add(a, b); }
    return g;
  }

  /* ---- véhicules d'urgence : police, ambulance, pompiers (gyrophares qui clignotent) */
  const EMG = ['police', 'ambulance', 'fire', 'police', 'ambulance'];
  const lightMats = [];
  function makeEmg(i) {
    const kind = EMG[i % EMG.length], g = new THREE.Group();
    const col = kind === 'police' ? 0xf4f6f8 : kind === 'ambulance' ? 0xffffff : 0xd62020;
    const len = kind === 'fire' ? 6.4 : 4.6, hgt = kind === 'fire' ? 1.1 : kind === 'ambulance' ? 1.0 : 0.62;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, hgt, len).translate(0, 0.35 + hgt / 2, 0), mat(col, { roughness: 0.4, metalness: 0.25 }));
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, kind === 'fire' ? 1.8 : 2.1).translate(0, 0.35 + hgt + 0.25, kind === 'fire' ? len / 2 - 1.4 : -0.2), mat(0x1c232b, { roughness: 0.2, metalness: 0.5 }));
    body.castShadow = cab.castShadow = true; g.add(body, cab);
    if (kind === 'police') { const st = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.22, 4.0).translate(0, 0.55, 0), mat(0x1c2a4a)); g.add(st); }
    if (kind === 'ambulance') { const st = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.2, 4.0).translate(0, 0.75, 0), mat(0xd62020)); g.add(st); }
    if (kind === 'fire') { const lad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, len - 1.6).translate(0, 0.35 + hgt + 0.2, -0.6), mat(0xd0d3d8, { metalness: 0.6 })); g.add(lad); }
    for (const [x, z] of [[-0.95, len / 2 - 0.9], [0.95, len / 2 - 0.9], [-0.95, -len / 2 + 0.9], [0.95, -len / 2 + 0.9]]) { const w = new THREE.Mesh(geos.wheel, mat(0x111111)); w.position.set(x, 0.34, z); g.add(w); }
    const top = 0.35 + hgt + 0.55, zz = kind === 'fire' ? len / 2 - 1.4 : -0.1;
    const red = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 2 }), blue = new THREE.MeshStandardMaterial({ color: 0x2060ff, emissive: 0x1040ff, emissiveIntensity: 0.1 });
    lightMats.push([red, blue]);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.3), red), b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.3), blue);
    a.position.set(-0.45, top, zz); b.position.set(0.45, top, zz); g.add(a, b);
    g.userData.emg = kind; g.userData.lm = [red, blue];
    return g;
  }

  /* ------------------------------------------------------------ agents */
  const agents = [];
  const rig = new THREE.Group(); group.add(rig);
  const base = { ped: { v: [1.1, 1.6], r: 0.45 }, car: { v: [6.5, 10.5], r: 2.2 }, cyc: { v: [3.2, 5.2], r: 0.6 } };

  function lateral(a, e) {                                          // décalage à droite du sens de marche
    if (a.type === 'car') return Math.min(e.w / 4, 2.2);
    if (a.type === 'cyc') return e.kind === 'lane' ? 0 : Math.max(0.6, e.w / 2 - 1.0);
    return e.kind === 'car' ? e.w / 2 + 1.2 : e.w / 2 + 0.8;
  }
  function nextNode(a) {                                            // choisit la route suivante (tout droit de préférence)
    const n = nodes.get(a.to); if (!n) return false;
    const opts = n.a.filter(q => q !== a.from && okFor(a.type, a.to, q));
    const fx = n.x - a.fx, fz = n.z - a.fz, fl = Math.hypot(fx, fz) || 1;
    let list = opts.length ? opts : n.a.filter(q => okFor(a.type, a.to, q));
    if (!list.length) return false;
    if (a.emg && special === 'chase' && list.length > 1 && Math.random() < 0.85) {          // poursuite : on prend la route qui rapproche le plus du joueur
      let best = list[0], bd = 1e12;
      for (const q of list) { const m = nodes.get(q), d = (m.x - P.x) ** 2 + (m.z - P.z) ** 2; if (d < bd) { bd = d; best = q; } }
      a.from = a.to; a.to = best; a.fx = n.x; a.fz = n.z; a.t = 0; return true;
    }
    const wts = list.map(q => {
      const m = nodes.get(q), dx = m.x - n.x, dz = m.z - n.z, l = Math.hypot(dx, dz) || 1, cs = (fx * dx + fz * dz) / (fl * l);
      let w = 0.25 + Math.max(0, cs) * 1.5 + (cs < -0.9 ? -0.2 : 0);
      if (a.type === 'cyc' && edge(a.to, q).kind === 'lane') w *= 2.5;
      return Math.max(0.05, w);
    });
    let t = Math.random() * wts.reduce((s, v) => s + v, 0), k = 0;
    while (k < wts.length - 1 && (t -= wts[k]) > 0) k++;
    a.from = a.to; a.to = list[k]; a.fx = n.x; a.fz = n.z; a.t = 0;
    return true;
  }
  function place(a, px, pz, rmin, rmax) {                           // pose l'agent sur un nœud dans l'anneau autour du joueur
    for (let tries = 0; tries < 6; tries++) {
      const c = nodesAround(px, pz, rmin, rmax); if (!c.length) { rmax += 80; rmin = Math.max(0, rmin - 40); continue; }
      const n = pick(c), opts = n.a.filter(q => okFor(a.type, n.id, q));
      if (!opts.length) continue;
      a.from = n.id; a.to = pick(opts); a.fx = n.x; a.fz = n.z;
      const m = nodes.get(a.to), len = Math.hypot(m.x - n.x, m.z - n.z) || 1;
      a.t = Math.random() * 0.8; a.len = len;
      a.x = n.x + (m.x - n.x) * a.t; a.z = n.z + (m.z - n.z) * a.t; a.first = true; a.down = 0; a.stop = 0; a.ok = true;
      return true;
    }
    a.ok = false; a.g.visible = false; return false;
  }
  function spawn(type, count, make, emg = false) {
    for (let i = 0; i < count; i++) {
      const g = make(i); g.visible = false; rig.add(g);
      const a = { type, g, emg, rank: i, cnt: count, x: 0, z: 0, yaw: 0, down: 0, side: 1, stop: 0, v: emg ? rnd(9, 12) : rnd(base[type].v[0], base[type].v[1]), v0: 0, ph: Math.random() * 6, r: base[type].r, from: 0, to: 0, t: 0, fx: 0, fz: 0, len: 1, ok: false, first: true };
      a.v0 = a.v; agents.push(a);
    }
  }
  spawn('ped', NP, makePed); spawn('car', NC, makeCar); spawn('cyc', NY, () => makeCyclist(pick(th.cyc))); spawn('car', NE, makeEmg, true);
  let inited = false, visible = true;

  let dens = 1, special = 'off', sigMode = 'off', P = { x: 0, z: 0 }, tt = 0, caught = null;
  const DOWN = { ped: 3.6, cyc: 3.2, car: 2.6 };
  function update(dt, px, pz, pyaw, pspeed) {
    if (!inited) { inited = true; for (const a of agents) { place(a, px, pz, 15, RING_MAX); } }
    const fwx = -Math.sin(pyaw), fwz = -Math.cos(pyaw);
    P.x = px; P.z = pz; tt += dt; sigUpdate(px, pz, dt); signUpdate(px, pz, dt);
    let nearE = null;
    for (const a of agents) {
      if (a.emg ? (special === 'off' || a.rank >= (special === 'chase' ? NE : Math.min(NE, 3))) : a.rank >= Math.ceil(a.cnt * dens)) { a.ok = false; a.g.visible = false; continue; }
      if (!a.ok) { if (Math.random() < dt * 0.5) place(a, px, pz, RING_MIN, RING_MAX); continue; }
      a.g.visible = visible;
      if (!visible) continue;
      const fallen = a.down > 0; if (fallen) a.down = Math.max(0, a.down - dt);
      if (a.stop > 0) a.stop -= dt;
      const A = nodes.get(a.from), B = nodes.get(a.to);
      if (!A || !B) { place(a, px, pz, RING_MIN, RING_MAX); continue; }
      const dx = B.x - A.x, dz = B.z - A.z; a.len = Math.hypot(dx, dz) || 1;
      let sp = a.v;
      if (fallen || a.stop > 0) sp = 0;
      else if (a.type === 'car') {
        if (sigMode !== 'off' && !a.emg) {                              // feux de circulation : on s'arrête au rouge (et au jaune si on a le temps)
          const S = sigAt.get(a.to);
          if (S) {
            const rem = (1 - a.t) * a.len, ax = Math.abs(dx) > Math.abs(dz) ? 1 : 0, st = lightState(S, ax);
            if (rem > 1.4 && rem < 14 && (st === 'r' || (st === 'y' && rem > 7))) sp = Math.min(sp, a.v * Math.max(0, Math.min(1, (rem - 3.2) / 8)));
          }
        }                                    // freine devant un obstacle (joueur ou autre voiture)
        const ux = dx / a.len, uz = dz / a.len;
        let gap = 99;
        const rx = px - a.x, rz = pz - a.z, ahead = rx * ux + rz * uz, side = Math.abs(rx * -uz + rz * ux);
        if (ahead > 0 && side < 2.4) gap = Math.min(gap, ahead);
        for (const o of agents) {
          if (o === a || !o.ok || (o.type !== 'car' && o.type !== 'cyc' && o.type !== 'ped')) continue;
          const ox = o.x - a.x, oz = o.z - a.z, ah = ox * ux + oz * uz, sd = Math.abs(ox * -uz + oz * ux);
          if (ah > 0 && ah < gap && sd < (o.type === 'car' ? 2.0 : 1.6) && Math.hypot(ox, oz) < 14) gap = ah;
        }
        if (gap < 14) sp = Math.min(sp, a.v * Math.max(0, (gap - 5) / 9));
      }
      if (a.type === 'ped' && !fallen) a.ph += dt * sp * 5.2;
      a.t += sp * dt / a.len;
      if (a.t >= 1) {
        const ok = nextNode(a);
        if (!ok) { const t = a.from; a.from = a.to; a.to = t; a.fx = nodes.get(a.from).x; a.fz = nodes.get(a.from).z; a.t = 0; }
        a.v = a.v0 * rnd(0.85, 1.1);
      }
      const A2 = nodes.get(a.from), B2 = nodes.get(a.to);
      if (A2 && B2) {
        const ex = B2.x - A2.x, ez = B2.z - A2.z, el = Math.hypot(ex, ez) || 1, ux = ex / el, uz = ez / el, e = edge(a.from, a.to) || { w: 6, kind: 'car' };
        a.br = !!e.br;
        const off = (e.br ? Math.min(lateral(a, e), Math.max(0, e.w / 2 - 0.5)) : lateral(a, e)), tx = A2.x + ex * a.t + (-uz) * off, tz = A2.z + ez * a.t + ux * off;
        if (a.first) { a.x = tx; a.z = tz; a.yaw = Math.atan2(ux, uz); a.first = false; }
        else {
          const k = Math.min(1, dt * (a.type === 'car' ? 5 : 7));
          a.x += (tx - a.x) * k; a.z += (tz - a.z) * k;
          if (!fallen) { let d = Math.atan2(ux, uz) - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); a.yaw += d * Math.min(1, dt * 6); }
        }
      }
      // recyclage : trop loin du joueur → réapparaît dans l'anneau
      if (Math.hypot(a.x - px, a.z - pz) > FAR && a.down <= 0) { place(a, px, pz, RING_MIN + 40, RING_MAX); }
      if (a.emg) {
        const d = Math.hypot(a.x - px, a.z - pz); if (!nearE || d < nearE.d) nearE = { d, a, dx: a.x - px, dz: a.z - pz, kind: a.g.userData.emg };
        const ph = Math.floor(tt * 6) % 2, lm = a.g.userData.lm; lm[0].emissiveIntensity = ph ? 2.4 : 0.1; lm[1].emissiveIntensity = ph ? 0.1 : 2.4;
        if (special === 'chase' && d < 3.4 && a.stop <= 0 && !fallen && !caught) { caught = a; a.stop = 4; }
      }
      // hauteur : sur un pont, on marche / roule sur le tablier (avant : au niveau du sol de la vallée = invisible sous le pont)
      { let ty = E(a.x, a.z); if (a.br && deckY) { const d = deckY(a.x, a.z); if (d != null) ty = d; else if (a.y != null) ty = a.y; }
        a.y = a.y == null || a.first || (a.br && Math.abs(ty - a.y) > 1.1) ? ty : a.y + (ty - a.y) * Math.min(1, dt * 10); }
      // pose du modèle
      let p = 0;
      if (fallen) { const e = DOWN[a.type] - a.down, sm = x => x * x * (3 - 2 * x); p = e < 0.25 ? sm(e / 0.25) : a.down > 0.7 ? 1 : sm(Math.max(0, a.down / 0.7)); }
      a.g.rotation.y = a.yaw;
      if (a.type === 'ped') {
        const L = a.g.userData.limbs, s = Math.sin(a.ph) * 0.7 * (sp > 0.1 ? 1 : 0);
        L[0].rotation.x = s; L[1].rotation.x = -s; L[2].rotation.x = -s * 0.8; L[3].rotation.x = s * 0.8;
        a.g.rotation.z = a.side * p * 1.5; a.g.position.set(a.x, a.y + 0.05 + p * 0.1, a.z);
      } else if (a.type === 'cyc') { a.g.rotation.z = a.side * p * 1.45; a.g.position.set(a.x, a.y + 0.05 + p * 0.12, a.z); }
      else a.g.position.set(a.x, a.y + 0.05, a.z);
    }
    near = nearE;
  }
  let near = null;

  /* ------------------------------------------------------------ collisions avec le joueur */
  function hit(x, z, r = 0.55, y = null) {
    if (!visible) return null;
    for (const a of agents) {
      if (!a.ok || a.down > 0 || !a.g.visible) continue;
      if (y != null && a.y != null && Math.abs(a.y - y) > 2.2) continue;     // un piéton sous le pont n'est pas sur le pont
      const dx = x - a.x, dz = z - a.z;
      if (a.type === 'car') {
        const c = Math.cos(a.yaw), s = Math.sin(a.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c;   // repère de la voiture
        if (Math.abs(lx) < 0.9 + r && Math.abs(lz) < 2.15 + r) return a;
      } else if (dx * dx + dz * dz < (a.r + r) * (a.r + r)) return a;
    }
    return null;
  }
  function knock(a, dx, dz) {
    if (a.type === 'car') { a.stop = 2.6; return; }
    a.down = DOWN[a.type]; a.side = -Math.sign(Math.cos(a.yaw) * dx - Math.sin(a.yaw) * dz) || 1;
  }

  /* ------------------------------------------------------------ mini-carte (contexte déjà centré et tourné) */
  function mini(g, px, pz, sc) {
    if (!visible) return;
    g.lineWidth = 1.2; g.strokeStyle = '#111';
    for (const a of agents) {
      if (!a.ok) continue;
      const dx = a.x - px, dz = a.z - pz; if (dx * dx + dz * dz > 5600) continue;
      const X = dx * sc, Y = dz * sc;
      if (a.type === 'car') { g.save(); g.translate(X, Y); g.rotate(-a.yaw); g.fillStyle = a.emg ? '#4da3ff' : '#ff5a5a'; g.fillRect(-2.2, -4, 4.4, 8); g.strokeRect(-2.2, -4, 4.4, 8); g.restore(); }
      else { g.fillStyle = a.down > 0 ? '#888' : a.type === 'cyc' ? '#fff' : '#ffd84d'; g.beginPath(); g.arc(X, Y, a.type === 'cyc' ? 3.2 : 2.4, 0, 7); g.fill(); g.stroke(); }
    }
  }

  /* ------------------------------------------------------------ feux de circulation (v9.21)
     mode 'arcade' : tous les carrefours d'au moins 3 branches dont une vraie rue · mode 'real' : seulement les feux marqués dans OpenStreetMap (highway=traffic_signals) */
  const sigAt = new Map(), sigList = [], CYC = 30;
  let sigBuilt = '', sigPool = [], sigT = 0;
  const hash = id => { let h = 2166136261; for (const c of String(id)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };
  function lightState(S, axis) {                                    // 'g' vert · 'y' jaune · 'r' rouge, selon l'axe (0 = nord-sud, 1 = est-ouest)
    const t = (tt + S.off) % CYC, a = axis === 0 ? t : (t + CYC / 2) % CYC;
    return a < 12.5 ? 'g' : a < 14.5 ? 'y' : 'r';
  }
  function buildSignals() {
    const key = sigMode + ':' + nodes.size; if (key === sigBuilt) return; sigBuilt = key;
    sigAt.clear(); sigList.length = 0;
    if (sigMode === 'arcade') {
      for (const n of nodes.values()) {
        if (n.a.length < 3) continue; let big = 0;
        for (const q of n.a) { const e = edge(n.id, q); if (e && e.kind === 'car' && e.w >= 6) big++; }
        if (big >= 2) { const S = { id: n.id, x: n.x, z: n.z, off: hash(n.id) * CYC }; sigAt.set(n.id, S); sigList.push(S); }
      }
    } else if (sigMode === 'real' && D.signals) {
      for (const s of D.signals) {
        let best = null, bd = 18 * 18;
        const cx = Math.floor(s.x / BK), cz = Math.floor(s.z / BK);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const g = bucket.get((cx + i) + ',' + (cz + j)); if (g) for (const n of g) { const d = (n.x - s.x) ** 2 + (n.z - s.z) ** 2; if (d < bd) { bd = d; best = n; } } }
        if (best && !sigAt.has(best.id)) { const S = { id: best.id, x: best.x, z: best.z, off: hash(best.id) * CYC }; sigAt.set(best.id, S); sigList.push(S); }
      }
    }
  }
  function makeHead(parent, mats, ax, sgn) {
    const h = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.3), mat(0x15181c)); h.add(box);
    for (let k = 0; k < 3; k++) { const c = [0xff2020, 0xffb020, 0x20e060][k]; const m = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0.05 }); mats.push(m); const s = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), m); s.position.set(0, 0.3 - k * 0.3, 0.16); h.add(s); }
    h.rotation.y = ax === 0 ? (sgn > 0 ? 0 : Math.PI) : (sgn > 0 ? Math.PI / 2 : -Math.PI / 2);
    parent.add(h); return h;
  }
  function poolEntry() {
    const g = new THREE.Group(), ms = [[], [], [], []];
    for (const [i, [ox, oz, ax, sgn]] of [[5.6, 5.6, 0, 1], [5.6, 5.6, 1, -1], [-5.6, -5.6, 0, -1], [-5.6, -5.6, 1, 1]].entries()) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5, 10), mat(0x2a2d33)); pole.position.set(ox, 2.5, oz); g.add(pole);
      const h = makeHead(g, ms[i], ax, sgn); h.position.set(ox, 4.6, oz);
    }
    g.visible = false; rig.add(g); return { g, ms, S: null };
  }
  function sigUpdate(px, pz, dt) {
    if (sigMode === 'off') { if (sigPool.length) for (const p of sigPool) p.g.visible = false; return; }
    buildSignals();
    sigT -= dt;
    if (sigT <= 0) {
      sigT = 0.6;
      const near = sigList.filter(S => (S.x - px) ** 2 + (S.z - pz) ** 2 < 140 * 140).sort((a, b) => ((a.x - px) ** 2 + (a.z - pz) ** 2) - ((b.x - px) ** 2 + (b.z - pz) ** 2)).slice(0, 14);
      while (sigPool.length < near.length) sigPool.push(poolEntry());
      sigPool.forEach((p, i) => { const S = near[i]; p.S = S || null; p.g.visible = !!S; if (S) p.g.position.set(S.x, E(S.x, S.z), S.z); });
    }
    for (const p of sigPool) {
      if (!p.S) continue;
      for (let i = 0; i < 4; i++) {
        const ax = i === 0 || i === 2 ? 0 : 1, st = lightState(p.S, ax), m = p.ms[i];
        m[0].emissiveIntensity = st === 'r' ? 2.4 : 0.05; m[1].emissiveIntensity = st === 'y' ? 2.4 : 0.05; m[2].emissiveIntensity = st === 'g' ? 2.4 : 0.05;
      }
    }
  }

  /* Panneaux réellement présents dans OpenStreetMap : leur position vient des nœuds OSM,
     leur forme est fabriquée ici pour rester un objet de la scène (jamais une image de fond). */
  function signTexture(type) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'); g.clearRect(0, 0, 256, 256); g.lineJoin = 'round';
    if (type === 'stop') {
      const pts = []; for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; pts.push([128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112]); }
      const path = () => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };
      path(); g.fillStyle = '#fff'; g.fill();
      const inner = pts.map(([x, y]) => [128 + (x - 128) * 0.88, 128 + (y - 128) * 0.88]);
      g.beginPath(); inner.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fillStyle = '#c92b32'; g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 48px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 128, 130);
    } else {
      const tri = (inset, fill) => { g.beginPath(); g.moveTo(128, 232 - inset); g.lineTo(24 + inset, 34 + inset); g.lineTo(232 - inset, 34 + inset); g.closePath(); g.fillStyle = fill; g.fill(); };
      tri(0, '#d32f36'); tri(18, '#fff');
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
  }
  const signMats = {
    stop: new THREE.MeshStandardMaterial({ map: signTexture('stop'), transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, roughness: 0.6 }),
    give_way: new THREE.MeshStandardMaterial({ map: signTexture('give_way'), transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, roughness: 0.6 })
  };
  const signPlane = new THREE.PlaneGeometry(0.9, 0.9), signPost = new THREE.CylinderGeometry(0.035, 0.045, 2.8, 8).translate(0, 1.4, 0), signPostMat = mat(0x777b80, { metalness: 0.55, roughness: 0.65 });
  function placeSign(s) {
    let best = null, bd = 24 * 24;
    const candidates = [], cx = Math.floor(s.x / 250), cz = Math.floor(s.z / 250);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const c = D.cells.get((cx + a) + ',' + (cz + b)); if (c) for (let k = 0; k < c.rs.length; k += 2) candidates.push([D.roads[c.rs[k]], c.rs[k + 1]]);
    }
    for (const [r, i] of candidates) {
      const ax = r.p[i * 2], az = r.p[i * 2 + 1], dx = r.p[i * 2 + 2] - ax, dz = r.p[i * 2 + 3] - az, l2 = dx * dx + dz * dz;
      const u = l2 ? Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.z - az) * dz) / l2)) : 0, x = ax + dx * u, z = az + dz * u, d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bd) { bd = d; const l = Math.sqrt(l2) || 1; best = { x, z, dx: dx / l, dz: dz / l, w: r.w }; }
    }
    if (!best) return { ...s, yaw: 0 };
    const side = hash(`${Math.round(s.x)}:${Math.round(s.z)}`) < 0.5 ? -1 : 1;
    return { ...s, x: best.x - best.dz * (best.w / 2 + 1.05) * side, z: best.z + best.dx * (best.w / 2 + 1.05) * side, yaw: Math.atan2(-best.dx, -best.dz) };
  }
  const signList = (D.signs || []).map(placeSign), signPool = []; let signT = 0;
  function signEntry() {
    const g = new THREE.Group(), post = new THREE.Mesh(signPost, signPostMat), face = new THREE.Mesh(signPlane, signMats.stop);
    face.position.set(0, 2.22, 0.045); g.add(post, face); rig.add(g); return { g, face, type: '' };
  }
  function signUpdate(px, pz, dt) {
    signT -= dt; if (signT > 0) return; signT = 0.8;
    const near = signList.filter(s => (s.x - px) ** 2 + (s.z - pz) ** 2 < 145 * 145)
      .sort((a, b) => (a.x - px) ** 2 + (a.z - pz) ** 2 - ((b.x - px) ** 2 + (b.z - pz) ** 2)).slice(0, 18);
    while (signPool.length < near.length) signPool.push(signEntry());
    signPool.forEach((p, i) => {
      const s = near[i]; p.g.visible = !!s;
      if (!s) return;
      if (p.type !== s.type) { p.face.material = signMats[s.type] || signMats.stop; p.type = s.type; }
      p.g.position.set(s.x, E(s.x, s.z), s.z); p.g.rotation.y = s.yaw;
    });
  }

  function dispose_() { agents.length = 0; matCache.clear(); }   // le monde libère les géométries et matériaux (parcours du groupe)
  // distance libre (m) entre un point et le véhicule / piéton le plus proche (bords compris) : sert à replacer le joueur loin de ce qui l'a fait tomber
  function gap(x, z) {
    let m = 1e9;
    for (const a of agents) { if (!a.ok || !a.g.visible) continue; const d = Math.hypot(x - a.x, z - a.z) - (a.type === 'car' ? 2.4 : a.r); if (d < m) m = d; }
    return m;
  }
  return { agents, update, hit, knock, mini, gap,
    setDensity: f => { dens = Math.max(0, Math.min(1, f)); },
    setSpecial: m => { special = m; },
    setSignals: m => { sigMode = m; if (m === 'off') for (const p of sigPool) p.g.visible = false; },
    siren: () => near, takeCaught: () => { const c = caught; caught = null; return c; },
    setVisible: v => { visible = v; for (const a of agents) a.g.visible = v && a.ok; }, dispose: dispose_ };
}
