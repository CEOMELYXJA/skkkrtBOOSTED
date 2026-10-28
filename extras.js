// SKKKRT3D v9.21 — effets d'ambiance : confettis, rose des vents, oiseaux, orage (pluie, éclairs, tonnerre, visière), tornade (vent qui attire)
import * as THREE from 'three';

const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = id => document.getElementById(id);

export function createExtras({ scene, camera, settings, state, rig, getWorld, audio, getLook }) {
  const group = new THREE.Group(); scene.add(group);
  const X = { wind: { x: 0, z: 0, s: 0, yaw: 0 }, slip: false, shake: 0, tornado: null, rain: 0 };
  let T = 0, lastWeather = 'clear';

  /* ======================================================== CONFETTIS (style loterie) */
  const cv = $('confetti'), cx = cv && cv.getContext('2d');
  const parts = [], COLORS = ['#ff4d6d', '#ffc14d', '#4da3ff', '#3ecf7a', '#b07cff', '#ff8a3d', '#00e5ff', '#ff2fb0', '#ffe14d', '#ffffff'];
  let shower = 0, showerRate = 0;
  function fitCanvas() { if (cv && (cv.width !== innerWidth || cv.height !== innerHeight)) { cv.width = innerWidth; cv.height = innerHeight; } }
  function burst(n, x0, y0, spread, power) {
    for (let i = 0; i < n && parts.length < 700; i++) {
      const a = -Math.PI / 2 + rnd(-spread, spread), v = rnd(0.35, 1) * power;
      parts.push({ x: x0 + rnd(-8, 8), y: y0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rnd(0, TAU), vr: rnd(-9, 9), w: rnd(5, 11), h: rnd(3, 6), c: COLORS[(Math.random() * COLORS.length) | 0], life: rnd(2.2, 3.6), age: 0, wob: rnd(0, TAU), star: Math.random() < 0.18 });
    }
  }
  function celebrate(kind) {
    if (!settings.confetti || !cv) return;
    fitCanvas();
    const W = cv.width, H = cv.height, P = Math.min(W, H) * 1.05;
    if (kind === 'coin') { burst(10, W / 2, H * 0.62, 1.2, P * 0.45); }
    else if (kind === 'ring') { burst(34, W * 0.5, H * 0.66, 1.0, P * 0.8); }
    else if (kind === 'big') { burst(46, W * 0.15, H * 0.95, 0.5, P * 1.1); burst(46, W * 0.85, H * 0.95, 0.5, P * 1.1); }
    else if (kind === 'flag') { burst(70, W * 0.1, H * 0.98, 0.45, P * 1.25); burst(70, W * 0.9, H * 0.98, 0.45, P * 1.25); burst(50, W * 0.5, H * 0.7, 1.4, P * 0.9); shower = 1.1; showerRate = 90; }
    else if (kind === 'win') { for (let i = 0; i < 5; i++) setTimeout(() => { fitCanvas(); burst(90, W * rnd(0.1, 0.9), H * rnd(0.85, 1), 0.6, P * 1.3); }, i * 260); shower = 3.4; showerRate = 160; }
  }
  function confettiUpdate(dt) {
    if (!cx) return;
    if (!parts.length && shower <= 0) { if (cv._dirty) { cx.clearRect(0, 0, cv.width, cv.height); cv._dirty = false; } return; }
    fitCanvas();
    if (shower > 0) { shower -= dt; const n = Math.floor(showerRate * dt + Math.random()); for (let i = 0; i < n && parts.length < 700; i++) parts.push({ x: rnd(0, cv.width), y: -12, vx: rnd(-40, 40), vy: rnd(120, 260), r: rnd(0, TAU), vr: rnd(-8, 8), w: rnd(5, 10), h: rnd(3, 6), c: COLORS[(Math.random() * COLORS.length) | 0], life: rnd(3, 4.5), age: 0, wob: rnd(0, TAU), star: Math.random() < 0.15 }); }
    cx.clearRect(0, 0, cv.width, cv.height); cv._dirty = true;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.age += dt;
      if (p.age > p.life || p.y > cv.height + 20) { parts.splice(i, 1); continue; }
      p.vy += 520 * dt; p.vx *= 1 - 0.9 * dt; p.vy *= 1 - 0.55 * dt;
      p.x += (p.vx + Math.sin(p.age * 5 + p.wob) * 34) * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.globalAlpha = clamp((p.life - p.age) * 1.4, 0, 1); cx.fillStyle = p.c;
      const sq = Math.abs(Math.cos(p.age * 7 + p.wob));
      if (p.star) { cx.beginPath(); for (let k = 0; k < 5; k++) { const a = k * TAU / 5 - Math.PI / 2; cx.lineTo(Math.cos(a) * p.w * 0.7, Math.sin(a) * p.w * 0.7); cx.lineTo(Math.cos(a + TAU / 10) * p.w * 0.3, Math.sin(a + TAU / 10) * p.w * 0.3); } cx.fill(); }
      else cx.fillRect(-p.w / 2, -p.h * sq / 2, p.w, Math.max(1.2, p.h * sq));
      cx.restore();
    }
  }

  /* ======================================================== ROSE DES VENTS (suit le nord) */
  const rose = $('rose'), rg = rose && rose.getContext('2d');
  let roseT = 0;
  const DIRS = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SO', 225], ['O', 270], ['NO', 315]];
  function drawRose(yaw) {
    if (!rg) return;
    const S = rose.width, R = S / 2;
    rg.clearRect(0, 0, S, S);
    rg.save(); rg.translate(R, R);
    rg.fillStyle = 'rgba(0,0,0,.38)'; rg.beginPath(); rg.arc(0, 0, R - 2, 0, TAU); rg.fill();
    rg.strokeStyle = 'rgba(255,255,255,.55)'; rg.lineWidth = 1.2; rg.beginPath(); rg.arc(0, 0, R - 3, 0, TAU); rg.stroke();
    rg.rotate(yaw);                                                    // le nord reste le nord : la rose tourne à l'inverse du cap
    for (const [name, deg] of DIRS) {
      const a = deg * Math.PI / 180, main = name.length === 1, rr = R - (main ? 13 : 12);
      rg.save(); rg.rotate(a);
      rg.strokeStyle = name === 'N' ? 'rgba(255,90,90,.95)' : 'rgba(255,255,255,.6)'; rg.lineWidth = main ? 1.6 : 1;
      rg.beginPath(); rg.moveTo(0, -(R - 4)); rg.lineTo(0, -(R - (main ? 12 : 8))); rg.stroke();
      rg.translate(0, -rr); rg.rotate(-a - yaw);                       // lettres toujours lisibles (à l'endroit)
      rg.fillStyle = name === 'N' ? '#ff6b6b' : 'rgba(255,255,255,' + (main ? '.95' : '.7') + ')'; rg.font = (main ? '700 12px ' : '600 8.5px ') + 'Inter, system-ui, sans-serif'; rg.textAlign = 'center'; rg.textBaseline = 'middle';
      rg.fillText(name, 0, 0); rg.restore();
    }
    rg.fillStyle = 'rgba(255,90,90,.9)'; rg.beginPath(); rg.moveTo(0, -R * 0.42); rg.lineTo(4, 0); rg.lineTo(-4, 0); rg.closePath(); rg.fill();      // pointe du nord
    rg.fillStyle = 'rgba(255,255,255,.55)'; rg.beginPath(); rg.moveTo(0, R * 0.42); rg.lineTo(4, 0); rg.lineTo(-4, 0); rg.closePath(); rg.fill();
    rg.restore();
    rg.save(); rg.translate(R, 5); rg.fillStyle = 'rgba(255,255,255,.95)'; rg.beginPath(); rg.moveTo(0, 0); rg.lineTo(4, 7); rg.lineTo(-4, 7); rg.closePath(); rg.fill(); rg.restore();   // repère : devant toi (haut)
  }

  /* ======================================================== OISEAUX */
  const birds = [], bm = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.9, side: THREE.DoubleSide }), bw = new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.9, side: THREE.DoubleSide });
  const bodyGeo = new THREE.SphereGeometry(0.16, 10, 8); bodyGeo.scale(0.8, 0.7, 1.9);
  const wingGeo = new THREE.PlaneGeometry(0.62, 0.22, 1, 1); wingGeo.translate(0.31, 0, 0); wingGeo.rotateX(-Math.PI / 2);
  const headGeo = new THREE.SphereGeometry(0.075, 8, 6), tailGeo = new THREE.PlaneGeometry(0.12, 0.26).rotateX(-Math.PI / 2).translate(0, 0, 0.36);
  function makeBird() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(bodyGeo, bm)); const h = new THREE.Mesh(headGeo, bm); h.position.set(0, 0.02, -0.3); g.add(h); g.add(new THREE.Mesh(tailGeo, bw));
    const wl = new THREE.Group(), wr = new THREE.Group(); wl.add(new THREE.Mesh(wingGeo, bw)); const m2 = new THREE.Mesh(wingGeo, bw); m2.scale.x = -1; wr.add(m2); g.add(wl, wr);
    return { g, wl, wr, a: rnd(0, TAU), rad: rnd(14, 70), h: rnd(7, 26), w: rnd(0.18, 0.5) * (Math.random() < 0.5 ? -1 : 1), f: rnd(6, 11), ph: rnd(0, TAU), glide: 0, gt: rnd(1, 4), ox: rnd(-30, 30), oz: rnd(-30, 30) };
  }
  function ensureBirds(n) {
    while (birds.length < n) { const b = makeBird(); group.add(b.g); birds.push(b); }
    birds.forEach((b, i) => { b.g.visible = i < n; });
  }
  let chirpT = 3, bcx = 0, bcz = 0;
  function birdsUpdate(dt, active) {
    const q = settings.quality, n = !active ? 0 : q === 'low' ? 5 : q === 'med' ? 8 : q === 'high' ? 11 : 14;
    if (!n && !birds.length) return;
    ensureBirds(n);
    if (!n) return;
    const tx = rig.position.x + -Math.sin(state.yaw) * 20, tz = rig.position.z + -Math.cos(state.yaw) * 20;
    bcx += (tx - bcx) * Math.min(1, dt * 0.6); bcz += (tz - bcz) * Math.min(1, dt * 0.6);
    if (Math.hypot(bcx - tx, bcz - tz) > 150) { bcx = tx; bcz = tz; }
    for (let i = 0; i < n; i++) {
      const b = birds[i]; b.a += b.w * dt; b.gt -= dt; if (b.gt <= 0) { b.glide = b.glide ? 0 : (Math.random() < 0.4 ? 1 : 0); b.gt = rnd(0.8, 3.5); }
      const rad = b.rad + Math.sin(T * 0.3 + b.ph) * 8, x = bcx + b.ox + Math.cos(b.a) * rad, z = bcz + b.oz + Math.sin(b.a) * rad;
      const gy = rig.position.y + b.h + Math.sin(T * 0.8 + b.ph) * 1.6;
      b.g.position.set(x, gy, z);
      const hd = b.w > 0 ? b.a + Math.PI / 2 : b.a - Math.PI / 2;      // tangente au cercle (sens de vol)
      b.g.rotation.y = -hd - Math.PI / 2;                              // l'avant de l'oiseau est -Z
      b.g.rotation.z = -Math.sign(b.w) * 0.35;                          // inclinaison dans le virage
      const flap = b.glide ? 0.12 + Math.sin(T * 1.5 + b.ph) * 0.04 : Math.sin(T * b.f + b.ph) * 0.75;
      b.wl.rotation.z = flap; b.wr.rotation.z = -flap;
    }
    chirpT -= dt;
    if (chirpT <= 0) { chirpT = rnd(2.2, 7); if (audio.chirp) audio.chirp(); }
  }

  /* ======================================================== MÉTÉO : orage et tornade */
  const tint = $('wxTint'), bolt = $('bolt'), visor = $('visor'), vcv = $('vcv'), vg = vcv && vcv.getContext('2d');
  // pluie 3D
  const RN = 1500, rpos = new Float32Array(RN * 6), rvel = new Float32Array(RN);
  for (let i = 0; i < RN; i++) { const x = rnd(-24, 24), y = rnd(0, 28), z = rnd(-24, 24); rpos.set([x, y, z, x, y, z], i * 6); rvel[i] = rnd(24, 34); }
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3)); rainGeo.setDrawRange(0, RN * 2);
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xc4d6ea, transparent: true, opacity: 0.4, fog: false, depthWrite: false }));
  rain.frustumCulled = false; rain.visible = false; group.add(rain);
  // éclair 3D
  const boltGeo = new THREE.BufferGeometry(), bpos = new Float32Array(40 * 3); boltGeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
  const boltLine = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xeaf2ff, transparent: true, opacity: 1, fog: false, depthTest: false, blending: THREE.AdditiveBlending })); boltLine.frustumCulled = false; boltLine.visible = false; boltLine.renderOrder = 50; group.add(boltLine);
  let nextBolt = 6, boltT = 0, thunderQ = [];
  function strike() {
    const dist = rnd(120, 520), ang = state.yaw + rnd(-1.3, 1.3), fx = rig.position.x + -Math.sin(ang) * dist, fz = rig.position.z + -Math.cos(ang) * dist;
    let x = fx, z = fz, y = 190; const n = 22;
    for (let i = 0; i < n; i++) { bpos[i * 3] = x; bpos[i * 3 + 1] = y; bpos[i * 3 + 2] = z; x += rnd(-9, 9); z += rnd(-9, 9); y -= 190 / (n - 1); }
    boltGeo.setDrawRange(0, n); boltGeo.attributes.position.needsUpdate = true; boltLine.material.opacity = 1; boltLine.visible = true; boltT = 0.34;
    if (bolt) { bolt.style.transition = 'none'; bolt.style.opacity = String(dist < 220 ? 0.95 : 0.6); requestAnimationFrame(() => { bolt.style.transition = 'opacity .55s ease-out'; bolt.style.opacity = '0'; }); setTimeout(() => { if (bolt) { bolt.style.transition = 'none'; bolt.style.opacity = '0.5'; requestAnimationFrame(() => { bolt.style.transition = 'opacity .5s ease-out'; bolt.style.opacity = '0'; }); } }, 150); }
    thunderQ.push({ t: dist / 343 * 0.6 + 0.15, dist });
    if (dist < 230) X.shake = Math.max(X.shake, 0.5 + (230 - dist) / 230);
  }
  // visière + gouttes
  const drops = []; let visorOn = true;
  function fitVisor() { if (vcv && (vcv.width !== innerWidth || vcv.height !== innerHeight)) { vcv.width = innerWidth; vcv.height = innerHeight; } }
  function visorUpdate(dt, raining) {
    if (!vg) return;
    fitVisor(); vg.clearRect(0, 0, vcv.width, vcv.height);
    const W = vcv.width, H = vcv.height;
    if (visorOn) {                                                     // verre de la visière : léger voile + bords sombres
      const g = vg.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(180,205,235,0.04)'); g.addColorStop(1, 'rgba(10,20,40,0.38)'); vg.fillStyle = g; vg.fillRect(0, 0, W, H);
      vg.strokeStyle = 'rgba(255,255,255,.12)'; vg.lineWidth = 3; vg.beginPath(); vg.moveTo(0, H * 0.06); vg.quadraticCurveTo(W / 2, -H * 0.03, W, H * 0.06); vg.stroke();
    }
    const rate = raining * (visorOn ? 7 : 4) * (1 + clamp(state.speed / 8, 0, 1.5));
    const nn = Math.floor(rate * dt + Math.random());
    for (let i = 0; i < nn && drops.length < 110; i++) drops.push({ x: rnd(0, W), y: rnd(0, H * 0.9), r: visorOn ? rnd(2, 8) : rnd(1.5, 5), vy: 0, age: 0, life: visorOn ? rnd(6, 14) : rnd(0.5, 1.1) });
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; d.age += dt;
      if (d.age > d.life || d.y > H + 20) { drops.splice(i, 1); continue; }
      if (visorOn && d.r > 5.5) { d.vy = Math.min(d.vy + 60 * dt, 90 + d.r * 14); d.y += d.vy * dt; d.r -= dt * 0.35; }
      const al = visorOn ? 1 : clamp(1 - d.age / d.life, 0, 1) * 0.9;
      vg.save(); vg.globalAlpha = al; vg.translate(d.x, d.y);
      const gr = vg.createRadialGradient(-d.r * 0.3, -d.r * 0.3, 0, 0, 0, d.r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(0.5, 'rgba(190,215,245,.18)'); gr.addColorStop(1, 'rgba(120,160,210,.30)');
      vg.fillStyle = gr; vg.beginPath(); vg.ellipse(0, 0, d.r, d.r * (d.vy > 10 ? 1.5 : 1.1), 0, 0, TAU); vg.fill();
      if (visorOn && d.vy > 10) { vg.strokeStyle = 'rgba(190,215,245,.18)'; vg.lineWidth = d.r * 0.5; vg.beginPath(); vg.moveTo(0, 0); vg.lineTo(0, -d.vy * 0.25); vg.stroke(); }
      vg.restore();
    }
  }
  // tornade
  let torGroup = null, torSegs = [], torDebris = null, torCloud = null, torAng = 0, torR = 220;
  function streakTex() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
    g.fillStyle = '#6a7078'; g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '30,34,40' : '170,176,186') + ',' + rnd(0.08, 0.35) + ')'; g.fillRect(rnd(0, 256), 0, rnd(2, 10), 64); }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1); return t;
  }
  function cloudTex() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, 'rgba(40,44,52,.95)'); gr.addColorStop(0.6, 'rgba(70,76,86,.7)'); gr.addColorStop(1, 'rgba(90,96,108,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(20,24,30,' + rnd(0.05, 0.2) + ')'; g.beginPath(); g.arc(rnd(30, 226), rnd(30, 226), rnd(8, 30), 0, TAU); g.fill(); }
    return new THREE.CanvasTexture(c);
  }
  function buildTornado() {
    torGroup = new THREE.Group(); group.add(torGroup);
    const mat = new THREE.MeshBasicMaterial({ map: streakTex(), transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const SEG = 16, H = 9;
    for (let k = 0; k < SEG; k++) {
      const r0 = 3 + 0.0016 * (k * H) ** 2, r1 = 3 + 0.0016 * ((k + 1) * H) ** 2;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, H, 16, 1, true), mat); m.position.y = k * H + H / 2; torGroup.add(m); torSegs.push(m);
    }
    const ct = cloudTex();
    torCloud = new THREE.Mesh(new THREE.CircleGeometry(130, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, opacity: 0.95 }));
    torCloud.position.y = 150; torGroup.add(torCloud);
    const c2 = new THREE.Mesh(new THREE.CircleGeometry(80, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, opacity: 0.85 })); c2.position.y = 141; torGroup.add(c2); torCloud.userData.c2 = c2;
    const N = 160, pp = new Float32Array(N * 3); torDebris = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0x3a3228, size: 1.3, sizeAttenuation: true, fog: false })); torDebris.geometry.setAttribute('position', new THREE.BufferAttribute(pp, 3)); torDebris.frustumCulled = false; torDebris.userData = { ph: Array.from({ length: N }, () => ({ a: rnd(0, TAU), h: rnd(0, 60), s: rnd(1.5, 4) })) }; torGroup.add(torDebris);
  }
  function dropTornado() { if (torGroup) { group.remove(torGroup); torGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); } torGroup = null; torSegs = []; torDebris = null; torCloud = null; X.tornado = null; }
  function tornadoUpdate(dt) {
    if (!torGroup) { buildTornado(); const a = rnd(0, TAU); X.tornado = { x: rig.position.x + Math.cos(a) * 260, z: rig.position.z + Math.sin(a) * 260 }; torAng = a; torR = 230; }
    const tor = X.tornado;
    torAng += dt * 0.05; torR = 190 + Math.sin(T * 0.05) * 90 + Math.sin(T * 0.13) * 40;
    const dx = rig.position.x + Math.cos(torAng) * torR - tor.x, dz = rig.position.z + Math.sin(torAng) * torR - tor.z, dl = Math.hypot(dx, dz) || 1;
    tor.x += dx / dl * Math.min(dl, 7) * dt; tor.z += dz / dl * Math.min(dl, 7) * dt;
    const px = tor.x - rig.position.x, pz = tor.z - rig.position.z, d = Math.hypot(px, pz) || 1;
    const k = Math.pow(clamp((330 - d) / 270, 0, 1), 1.4), gust = 0.8 + 0.2 * Math.sin(T * 1.7) + 0.1 * Math.sin(T * 4.1);
    const s = 5.2 * k * gust;                                          // m/s : attraction (magnétisme du vent)
    X.wind.x = px / d * s - pz / d * s * 0.25; X.wind.z = pz / d * s + px / d * s * 0.25; X.wind.s = s;
    const hx = -Math.sin(state.yaw), hz = -Math.cos(state.yaw), cr = hx * (pz / d) - hz * (px / d);
    X.wind.yaw = clamp(cr, -1, 1) * 0.16 * k * gust;                   // le guidon est droit, mais le vent fait dériver le cap
    X.shake = Math.max(X.shake, k * 0.35);
    if (d < 28) { const a = rnd(0, TAU); tor.x = rig.position.x + Math.cos(a) * 300; tor.z = rig.position.z + Math.sin(a) * 300; X.shake = 1; if (audio.log) audio.log('Le vent te recrache : la tornade s’éloigne.'); }
    const w = getWorld(), gy = w && w.api ? w.api.elev(tor.x, tor.z) : rig.position.y;
    torGroup.position.set(tor.x, gy, tor.z);
    torSegs.forEach((m, i) => { m.rotation.y = T * (2.4 + i * 0.07); m.position.x = Math.sin(T * 0.9 + i * 0.45) * i * 0.7; m.position.z = Math.cos(T * 0.7 + i * 0.4) * i * 0.55; });
    torCloud.rotation.y = T * 0.12; torCloud.userData.c2.rotation.y = -T * 0.2;
    const arr = torDebris.geometry.attributes.position.array, ph = torDebris.userData.ph;
    for (let i = 0; i < ph.length; i++) { const p = ph[i]; p.a += dt * p.s; p.h += dt * 6; if (p.h > 90) p.h = 0; const r = 3 + 0.0016 * (p.h * 1) ** 2 + 2; arr[i * 3] = Math.cos(p.a) * r; arr[i * 3 + 1] = p.h; arr[i * 3 + 2] = Math.sin(p.a) * r; }
    torDebris.geometry.attributes.position.needsUpdate = true;
    return k;
  }

  /* ======================================================== boucle */
  let tintK = 0, fogK = 1;
  function update(dt, started, paused) {
    T += dt;
    const wx = settings.weather || 'clear';
    const storm = wx === 'storm' && started, tor = wx === 'tornado' && started;
    // oiseaux : pas la nuit, pas pendant l'orage
    const w = getWorld(), night = !!(w && w.night);
    birdsUpdate(paused ? 0 : dt, started && !!settings.birds && !night && wx === 'clear');
    // confettis et rose (rose : suit la direction du regard)
    confettiUpdate(dt);
    if (settings.showRose && started && rose) { roseT -= dt; if (roseT <= 0) { roseT = 0.04; drawRose(state.yaw + (getLook ? getLook() : 0)); } }
    // pluie
    const rainK = storm ? 1 : tor ? 0.35 : 0;
    X.rain += (rainK - X.rain) * Math.min(1, dt * 0.8);
    rain.visible = X.rain > 0.03;
    X.slip = storm;
    if (rain.visible) {
      rain.position.set(camera.position.x, camera.position.y - 10, camera.position.z);
      rain.material.opacity = 0.4 * X.rain; rainGeo.setDrawRange(0, Math.floor(RN * clamp(X.rain, 0, 1)) * 2);
      for (let i = 0; i < RN; i++) {
        const o = i * 6; let y = rpos[o + 1] - rvel[i] * dt;
        if (y < -4) { y = 26; rpos[o] = rnd(-24, 24); rpos[o + 2] = rnd(-24, 24); }
        const x = rpos[o];
        rpos[o + 1] = y; rpos[o + 4] = y + 0.9; rpos[o] = x; rpos[o + 3] = x - 0.12; rpos[o + 5] = rpos[o + 2] - 0.05;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
    // orage : éclairs et tonnerre
    if (storm && !paused) {
      nextBolt -= dt; if (nextBolt <= 0) { strike(); nextBolt = rnd(5, 15); }
    }
    if (boltLine.visible) { boltT -= dt; boltLine.material.opacity = clamp(boltT / 0.2, 0, 1) * (0.6 + 0.4 * Math.sin(boltT * 80)); if (boltT <= 0) boltLine.visible = false; }
    for (let i = thunderQ.length - 1; i >= 0; i--) { thunderQ[i].t -= dt; if (thunderQ[i].t <= 0) { if (audio.thunder) audio.thunder(thunderQ[i].dist); thunderQ.splice(i, 1); } }
    // tornade
    let tk = 0;
    if (tor && !paused) tk = tornadoUpdate(dt); else if (!tor && torGroup) { dropTornado(); X.wind.x = X.wind.z = X.wind.s = X.wind.yaw = 0; }
    else if (tor && torGroup) tk = Math.pow(clamp((330 - Math.hypot(X.tornado.x - rig.position.x, X.tornado.z - rig.position.z)) / 270, 0, 1), 1.4);
    if (!tor) { X.wind.x = X.wind.z = X.wind.s = X.wind.yaw = 0; }
    // voile gris-bleu + brouillard plus court
    const tt = storm ? 0.62 : tor ? 0.35 + tk * 0.3 : 0;
    tintK += (tt - tintK) * Math.min(1, dt * 0.7);
    if (tint) { tint.style.opacity = String(tintK.toFixed(3)); tint.style.background = tor ? 'rgb(168,176,150)' : 'rgb(150,164,190)'; }
    const fk = storm ? 0.42 : tor ? 0.62 - tk * 0.15 : 1;
    fogK += (fk - fogK) * Math.min(1, dt * 0.7);
    if (Math.abs(fogK - 1) > 0.004 && scene.fog && w) { const th = w.theme, vd = Math.max(0.4, +settings.viewDist || 1); scene.fog.near = th.fogNear * vd * fogK; scene.fog.far = th.fogFar * vd * fogK; }
    // secousses (éclair proche, vent fort) — décroissent vite
    X.shake = Math.max(0, X.shake - dt * 1.4);
    // visière
    const showV = storm || (tor && X.rain > 0.05);
    if (visor) visor.hidden = !(started && showV);
    const bv = $('bVisor'); if (bv) { bv.hidden = !(started && (storm || tor)); bv.classList.toggle('on', visorOn); }
    if (started && showV && !paused) visorUpdate(dt, X.rain);
    else if (visor && !visor.hidden && paused) { /* figé */ }
    lastWeather = wx;
  }
  function setVisor(v) { visorOn = !!v; drops.length = 0; }
  function toggleVisor() { setVisor(!visorOn); return visorOn; }
  function resetWeather() { thunderQ.length = 0; nextBolt = rnd(3, 8); drops.length = 0; }
  return { update, celebrate, toggleVisor, setVisor, resetWeather, state: X, get visorOn() { return visorOn; }, group };
}
