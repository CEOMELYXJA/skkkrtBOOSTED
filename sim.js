import * as THREE from 'three';
import { createWorld, onLane, SPAWN, STREETS, OVAL, SIZE, PARK, THEMES, LANE_OFF, composeTheme } from './world.js';
import { makeScooter } from './scooter.js';
import { settings, set, save, onChange, FONTS, shadowsOn } from './settings.js';
import { getPos, loadMap, watchGps, tri } from './real.js';
import { createExtras } from './extras.js';
import { makeCity } from './city.js';
import { gyro } from './sensors.js';
import { createTelemetry } from './telemetry.js';
import { worldPicker, segment, buildPanel } from './ui.js';
import { createGame } from './game.js';
import { createFree } from './freeplay.js';
import { rides } from './rides.js';
import { drawOsm } from './tilemap.js';
import { loadElevation } from './terrain.js';
import { premium, buildEnv, envIntensity } from './gfx.js';

import { createSessionLog } from './sessionlog.js';
const $ = s => document.querySelector(s);
const SL = createSessionLog(settings);                                // journal des parties (en arrière-plan)
const clamp = THREE.MathUtils.clamp;

/* ------------------------------------------------------------ rendu */
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.3, 800);
camera.rotation.order = 'YXZ';

let fxResize = null;
function applyQuality() {
  const dpr = devicePixelRatio || 1, q = settings.quality, rs = 0;                  // résolution toujours automatique (l'option « pixels par pixel d'écran » a été retirée : elle ralentissait le jeu)
  let r = rs > 0 ? rs : q === 'low' ? 1 : q === 'med' ? Math.min(dpr, 2) : q === 'high' ? Math.min(dpr, 3) : (premium() && dpr >= 2 ? Math.min(dpr, 3) : dpr * 1.5);   // Ultra = suréchantillonnage 1,5x ; Premium sur écran dense : résolution native (le budget va aux matières et à la lumière)
  r = Math.min(r, 4, Math.sqrt(16e6 / Math.max(1, innerWidth * innerHeight)));                                         // plafond ≈ 16 millions de pixels
  renderer.setPixelRatio(r);
  renderer.shadowMap.enabled = shadowsOn(settings.quality);
  renderer.setSize(innerWidth, innerHeight, false);
  if (fxResize) fxResize();
}
applyQuality();

/* ------------------------------------------------------------ rendu cinéma (post-traitement) */
let fx = null;
let classicEnv = null, premiumEnv = null, envPremium = false;
// Rendu Premium : la lumière d'environnement vient du ciel du monde (et non d'une pièce de studio)
function applyEnv() {
  if (!world) return;
  try {
    if (!premium()) {
      if (premiumEnv) { premiumEnv.dispose(); premiumEnv = null; }
      envPremium = false; scene.environment = classicEnv; scene.environmentIntensity = 0.35; return;
    }
    const id = Object.keys(THEMES).find(k => THEMES[k] === world.theme) || 'day';
    const t = buildEnv(renderer, world.theme, id);
    if (premiumEnv) premiumEnv.dispose();
    premiumEnv = t; envPremium = true; scene.environment = t; scene.environmentIntensity = envIntensity(id, world.theme);
  } catch (e) { console.warn('Ciel Premium indisponible :', e); envPremium = false; scene.environment = classicEnv; }
}
(async () => {
  try {
    const A = 'three/addons/';
    const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { UnrealBloomPass }, { ShaderPass }, { OutputPass }, { RoomEnvironment }] = await Promise.all([
      import(A + 'postprocessing/EffectComposer.js'), import(A + 'postprocessing/RenderPass.js'), import(A + 'postprocessing/GTAOPass.js'),
      import(A + 'postprocessing/UnrealBloomPass.js'), import(A + 'postprocessing/ShaderPass.js'), import(A + 'postprocessing/OutputPass.js'),
      import(A + 'environments/RoomEnvironment.js')]);
    const pm = new THREE.PMREMGenerator(renderer);
    classicEnv = pm.fromScene(new RoomEnvironment(), 0.04).texture;      // ancien rendu : reflets d'une pièce de studio
    if (!envPremium) { scene.environment = classicEnv; scene.environmentIntensity = 0.35; }
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    const rp = new RenderPass(scene, camera);
    const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    ao.output = GTAOPass.OUTPUT.Default; ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 2, scale: 1.2, samples: 12 });
    const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.6, 0.88);
    const grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); c.rgb = mix(vec3(l), c.rgb, 1.14); c.rgb = (c.rgb - 0.18) * 1.06 + 0.18; float v = smoothstep(1.05, 0.35, distance(vUv, vec2(0.5))); c.rgb *= mix(0.72, 1.0, v); gl_FragColor = c; }'
    });
    composer.addPass(rp); composer.addPass(ao); composer.addPass(bloom); composer.addPass(grade); composer.addPass(new OutputPass());
    fxResize = () => { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); };
    fxResize();
    fx = { composer, ao, bloom, grade, slow: 0, n: 0, t: 0 };
  } catch (e) { console.warn('Rendu cinéma indisponible :', e); }
})();
function renderFrame(dt) {
  const on = fx && settings.fx && settings.quality !== 'low';
  if (!on) { renderer.render(scene, camera); return; }
  fx.ao.enabled = !!settings.ssao;
  fx.composer.render();
  // si la machine souffre trop longtemps, on coupe l'ombrage ambiant (le plus gourmand) puis les effets
  fx.t += dt; fx.n++;
  if (fx.n >= 150) {
    if (fx.t / fx.n > 0.045) { if (settings.ssao) { set('ssao', false); log('Ombrage ambiant coupé (trop lent) — réactivable dans ⚙'); } else { set('fx', false); log('Effets cinéma coupés (trop lent) — réactivables dans ⚙'); } }
    fx.t = 0; fx.n = 0;
  }
}

/* ------------------------------------------------------------ état */
const state = { speed: 0, yaw: SPAWN.yaw, steer: 0, kb: false, head: false, started: false, dist: 0, camYaw: SPAWN.yaw, bump: 0, lastKmh: 0, brake: false, hitCd: 0, slope: 0 };
const fall = { on: false, t: 0, side: 1, moved: false };          // chute (bâtiment ou cycliste)
const air = { active: false, vy: 0, requested: false, cooldown: 0 };
let iceFallCooldown = 0;
const FALL_DOWN = 0.32, FALL_UP = 2.0, FALL_DUR = 2.7;            // tombe · reste au sol · se relève
const ease = x => x * x * (3 - 2 * x);
const keys = Object.create(null), kk = Object.create(null);
// v9.22 : les FLÈCHES *et* W A S D (touches physiques, donc aussi Z Q S D en AZERTY) conduisent (accélérer, freiner, tourner) ; la SOURIS oriente la vue
const kUp = () => keys.ArrowUp || keys.KeyW, kDown = () => keys.ArrowDown || keys.KeyS, kLeft = () => keys.ArrowLeft || keys.KeyA, kRight = () => keys.ArrowRight || keys.KeyD;
const look = { yaw: 0, pitch: 0, idle: 9 };
const slide = { x: 0, z: 0 };                                       // glissement sur route mouillée (orage)
let snowSlide = 0, snowSlideCooldown = 0;                         // dérapages brefs et espacés sur la neige
/* joystick tactile : haut = accélérer (selon l'inclinaison), bas = freiner, gauche/droite = diriger */
const joy = { x: 0, y: 0, id: null };
{
  const base = $('#joy'), knob = $('#joyknob'), JR = 34;
  const upd = e => {
    const r = base.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const l = Math.hypot(dx, dy); if (l > JR) { dx *= JR / l; dy *= JR / l; }
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    joy.x = Math.abs(dx / JR) < 0.1 ? 0 : dx / JR; joy.y = Math.abs(dy / JR) < 0.1 ? 0 : -dy / JR;
  };
  const end = e => {
    if (e.pointerId !== joy.id) return;
    joy.id = null; joy.x = joy.y = 0; knob.style.transform = '';
  };
  base.addEventListener('pointerdown', e => { joy.id = e.pointerId; try { base.setPointerCapture(e.pointerId); } catch {} e.preventDefault(); upd(e); });
  base.addEventListener('pointermove', e => { if (e.pointerId === joy.id) { e.preventDefault(); upd(e); } });
  base.addEventListener('pointerup', end); base.addEventListener('pointercancel', end); base.addEventListener('lostpointercapture', end);
}
/* souris (ordinateur) : un clic capture le pointeur, puis chaque mouvement tourne la tête / la caméra. Échap relâche (et met en pause). */
const mouse = { idle: 9, locked: false };
{
  const MS = 0.0022;                                                // radians par pixel
  const canLock = () => state.started && !paused && panel.hidden && matchMedia('(pointer:fine)').matches;
  addEventListener('mousemove', e => {
    if (!mouse.locked || !state.started || paused) return;
    mouse.idle = 0;
    look.yaw = wrapA(look.yaw - e.movementX * MS);
    look.pitch = clamp(look.pitch - e.movementY * MS, -1.15, 1.15);
  });
  canvas.addEventListener('click', () => { if (canLock() && !mouse.locked) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch {} } });
  document.addEventListener('pointerlockchange', () => {
    const was = mouse.locked; mouse.locked = document.pointerLockElement === canvas;
    if (was && !mouse.locked && state.started && !paused && panel.hidden && $('#results').hidden) setPause(true);   // une fin de partie libère la souris sans recouvrir les boutons de résultat
  });
}
addEventListener('keydown', e => {
  const panelOpen = !panel.hidden;
  if (!panelOpen) {
    keys[e.code] = true; if (e.key) kk[e.key.length === 1 ? e.key.toLowerCase() : e.key] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  }
  if (e.repeat === false || e.repeat === undefined) {
    if (e.code === 'KeyJ' && state.started && !paused && !panelOpen && jumpAllowed()) air.requested = true;
    if (e.code === 'Escape' || e.code === 'KeyP') { if (!panel.hidden) closePanel(); else if (state.started) setPause(!paused); }
    if (!panelOpen && e.code === 'KeyM' && state.started) set('showMap', !settings.showMap);
    if (!panelOpen && e.code === 'KeyV' && state.started) extras.toggleVisor();
  }
  if (!panelOpen) {
    if (e.code === 'KeyL') toggleHead();
    if (e.code === 'KeyR') goHome();
    if (e.code === 'KeyG') playGame();
    if (e.code === 'KeyC') calibrate();
  }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.key) kk[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; for (const k in kk) kk[k] = false; });

const rig = new THREE.Group();
rig.rotation.order = 'YXZ';                                        // cap d'abord, puis inclinaison dans la pente
rig.position.set(SPAWN.x, 0, SPAWN.z);
scene.add(rig);
const scooter = makeScooter();
scooter.setRider({ hair: settings.riderHair, glasses: settings.riderGlasses, skin: settings.riderSkin, vest: settings.riderVest });
rig.add(scooter.root);
scene.add(rig);

let world = null;
const jumpAllowed = () => !!(world && (world.preset === 'skate' || world.preset === 'snow'));
/* carte réelle : données OpenStreetMap autour de ta position (gardées tant que tu ne recharges pas) */
let realData = null, stopGps = null, gps = null, buildId = 0;
const setVeil = t => { const v = $('#veil span'); if (v) v.textContent = t; };
let forceDl = false, fixInfo = null, emptyRetry = 0;
let reliefState = { p: null, e: null };
async function ensureReal() {
  setVeil('Recherche de ta position GPS…');
  const p = centerOverride || await getPos(14000, f => setVeil('Recherche de ta position GPS… précision ±' + Math.round(f.acc) + ' m'));
  fixInfo = p;
  const half = +settings.mapRadius || 1500, st = { map: '', relief: '' }, t0 = Date.now();
  let shown = true;
  const show = () => { if (shown) setVeil([st.map, st.relief].filter(Boolean).join('  ·  ') + '   (' + Math.round((Date.now() - t0) / 1000) + ' s)'); };
  const tick = setInterval(show, 1000);
  // le relief ne dépend que de ta position : on le télécharge EN MÊME TEMPS que la carte
  const reliefP = +settings.relief > 0 ? loadElevation({ lat0: p.lat, lon0: p.lon, me: [0, 0], half }, half, t => { st.relief = t; show(); }).then(e => ({ e }), err => ({ err })) : null;
  reliefState = { p: reliefP, e: null };
  if (reliefP) reliefP.then(r => { if (r.e) { reliefState.e = r.e; if (realData && !realData.elev) { realData.elev = r.e; realData.elevErr = ''; pendingFull = realData; log('✓ Relief arrivé : il s’installe dès que tu t’arrêtes.'); } } });
  let earlyFull = null;
  const adopt = (full, msg) => {                                      // étape suivante de la carte : prête à remplacer l'actuelle
    if (!realData) { if (!earlyFull || full.stage > earlyFull.stage) earlyFull = full; return; }
    full.me = realData.me; full.heading = realData.heading; full.fix = realData.fix; full.elev = realData.elev; full.elevErr = realData.elevErr; full.reliefP = realData.reliefP;
    pendingFull = full; log(msg(full));
  };
  let D;
  try {
    D = await loadMap(p.lat, p.lon, t => { st.map = t; show(); }, {
      half, force: forceDl, progressive: true,
      onUpdate: full => (SL.note('map', 'étape ' + full.stage + ' : ' + full.stats.buildings + ' bât., ' + full.stats.roads + ' routes, ' + full.dlSec + ' s, manquants ' + (full.missing || 0)), adopt(full, f => f.stage === 3 ? '✓ Carte complète téléchargée en ' + f.dlSec + ' s (' + f.stats.buildings + ' bâtiments, ' + f.stats.roads + ' routes' + (f.missing ? ', ' + f.missing + ' morceaux manquants' : '') + ') : elle s’installe dès que tu t’arrêtes.' : 'Carte élargie (' + f.stats.buildings + ' bâtiments) : elle s’installe dès que tu t’arrêtes.'))
    });
  } finally { clearInterval(tick); shown = false; }
  forceDl = false;
  D.me = D.loc(p.lat, p.lon); D.heading = p.heading; D.fix = p;
  D.reliefP = reliefP;
  if (earlyFull) { earlyFull.me = D.me; earlyFull.heading = D.heading; earlyFull.fix = D.fix; earlyFull.elev = D.elev; earlyFull.elevErr = D.elevErr; earlyFull.reliefP = D.reliefP; D = earlyFull; }
  realData = D;
  if (D.stage < 3) log('Départ rapide en ' + D.dlSec + ' s : la carte s’agrandit toute seule pendant que tu joues.');
}
let pendingFull = null, pendingT = 0;
function swapFull(now) {                                           // remplace la carte actuelle par une plus grande / avec relief, sans bouger le joueur
  if (!pendingFull || !realData || settings.world !== 'real') { pendingFull = null; return; }
  if (!pendingT) pendingT = now;
  if (!((state.speed < 0.8 && now - pendingT > 1500) || now - pendingT > 75000)) return;
  const full = pendingFull; pendingFull = null; pendingT = 0;
  const keep = { x: rig.position.x, z: rig.position.z, yaw: state.yaw, cam: state.camYaw };
  realData = full;
  rebuildWorld(() => { rig.position.x = keep.x; rig.position.z = keep.z; state.yaw = keep.yaw; state.camYaw = keep.cam; state.speed = 0; });
}
// ville imaginaire : générée à partir d'un numéro (settings.seed) ; la même ville revient tant qu'on n'en demande pas une autre
let cityCache = null;
function cityFor(seed, preset) {
  const key = String(seed) + ':' + preset;
  const half = preset === 'skate' ? 180 : preset === 'f1' ? 360 : preset === 'mountain' ? 380 : 400;
  if (!cityCache || cityCache.key !== key) cityCache = { key, D: makeCity(seed, tri, half, preset) };
  return cityCache.D;
}
async function ensureRelief(D) {                                  // altitudes réelles (une fois par carte)
  if (D.elev !== undefined || !(+settings.relief > 0)) return;
  D.elev = reliefState.e || null; D.elevErr = '';
  if (D.elev) return;
  try {
    setVeil('Relief du terrain…');
    if (D.reliefP) {
      const r = await Promise.race([D.reliefP, new Promise(res => setTimeout(() => res('late'), 5000))]);
      if (r === 'late') log('Le relief tarde : on démarre à plat, il s’ajoutera tout seul.');          // on ne bloque pas le jeu pour ça
      else if (r.err) throw r.err; else D.elev = r.e;
    } else D.elev = await loadElevation(D, D.half, setVeil);
  } catch (e) { D.elevErr = e.message; }
}
function startGps() {
  stopGps && stopGps(); stopGps = null; gps = null;
  if (!realData) return;
  track.length = 0; kf.ok = false;
  stopGps = watchGps(p => {
    const l = realData.loc(p.lat, p.lon), t = Date.now();
    gps = { x: l[0], z: l[1], speed: p.speed, heading: p.heading, acc: p.acc, t };
    gpsFeed(p, l, p.ts && p.ts > t - 8000 && p.ts <= t + 1000 ? p.ts : t - 250);
    if (p.acc == null || p.acc < 60) {                                 // trace du trajet : sert à calculer le vrai cap (direction réelle du déplacement)
      const q = track[track.length - 1];
      if (!q || Math.hypot(l[0] - q.x, l[1] - q.z) >= 2.5) { track.push({ x: l[0], z: l[1], t }); if (track.length > 14) track.shift(); }
    }
  });
}
function placeAtSpawn() {
  const sp = world.spawn;
  const deck = world.api && world.api.deckY(sp.x, sp.z);
  const floor = deck != null ? deck : world.api ? world.api.elev(sp.x, sp.z) : 0;
  rig.position.set(sp.x, floor || 0, sp.z); state.yaw = state.camYaw = sp.yaw; state.speed = 0;
  air.active = false; air.vy = 0; air.requested = false;
}
function rebuildWorld(done) {
  const veil = $('#veil'); veil.hidden = false; setVeil('Chargement du monde…');
  const id = ++buildId;
  setTimeout(async () => {
    let real = null, theme = settings.world, synth = false;
    if (settings.world === 'real') {
      try {
        if (!realData) await ensureReal();
        if (id !== buildId) return;
        real = realData; theme = composeTheme(settings.season, settings.tod, settings.glow);
        await ensureRelief(real);
        if (id !== buildId) return;
      } catch (e) {
        log('Carte réelle indisponible : ' + e.message);
        setVeil('⚠ Carte réelle impossible : ' + e.message + ' — retour à la ville imaginaire (tu peux réessayer avec « Recharger la carte à ma position »).');
        setTimeout(() => { veil.hidden = true; set('world', 'day'); }, 9000); return;
      }
    } else {
      setVeil('Création de la ville…');
      await new Promise(r => setTimeout(r, 30));
      real = cityFor(settings.seed, settings.preset); synth = true; theme = composeTheme(settings.season, settings.tod, settings.glow);
    }
    if (id !== buildId) return;
    if (synth) { real.H = real.syntheticHeight || null; real.Hmin = real.syntheticHmin || 0; }
    else { if (!real.elev && reliefState.e) real.elev = reliefState.e; const k = +settings.relief || 0; real.H = real.elev && k > 0 ? (x, z) => real.elev.fn(x, z) * k : null; real.Hmin = real.elev ? real.elev.min * k : 0; }
    if (world) world.dispose();
    world = createWorld(scene, theme, settings.quality, real);
    world.setTraffic(settings.traffic); applyTraffic();
    applyLook();
    applyEnv();
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
    miniD = synth ? null : real;
    buildMap();
    placeAtSpawn();
    SL.map({ synth, blds: real.stats.buildings, roads: real.stats.roads, sec: real.dlSec, tiles: real.tileCount, cache: real.fromCache, missing: real.missing, err: real.lastErr || null, stage: real.stage, elev: real.elev ? 1 : 0, elevErr: real.elevErr || null });
    if (synth) { stopGps && stopGps(); stopGps = null; gps = null; log('Ville imaginaire n° ' + (settings.seed % 100000) + ' : ' + real.stats.buildings + ' bâtiments, ' + real.stats.roads + ' routes.'); }
    else {
      startGps();
      log('Carte réelle : ' + real.stats.buildings + ' bâtiments, ' + real.stats.roads + ' routes' + (real.stage < 3 ? ' (départ rapide : ' + (real.readyTiles || 0) + ' / ' + real.tileCount + ' secteurs chargés; le reste arrive en arrière-plan)' : (real.dlSec != null ? ' (téléchargée en ' + real.dlSec + ' s' + (real.fromCache ? ', ' + real.fromCache + ' morceaux en mémoire' : '') + ')' : '')) + '.');
      if (world.spawn && world.spawn.snapped) log('GPS imprécis : départ placé sur la route la plus proche (' + Math.round(world.spawn.snapDistance) + ' m du point GPS).');
      if (real.H) log('Relief : de ' + Math.round(real.elev.min * +settings.relief) + ' m à +' + Math.round(real.elev.max * +settings.relief) + ' m par rapport à ton départ.');
      else if (+settings.relief > 0 && real.elevErr) log('⚠ Relief indisponible (' + real.elevErr + ') : terrain plat. « Recharger » réessaie.');
      if (fixInfo) log('Position : ' + fixInfo.lat.toFixed(5) + ', ' + fixInfo.lon.toFixed(5) + ' (±' + Math.round(fixInfo.acc) + ' m)');
      if (real.missing) log('⚠ Carte partielle : ' + real.missing + ' / ' + real.tileCount + ' morceaux manquants. « Recharger » complète le reste.');
      else if (fixInfo && fixInfo.acc > 100) log('⚠ GPS peu précis (±' + Math.round(fixInfo.acc) + ' m) : sors à l’extérieur puis « Recharger ».');
    }
    free.reset();
    applyToggles();
    veil.hidden = true; edgeCool = performance.now() + 90000;
    if (!synth && (real.stage == null || real.stage === 3) && real.stats.roads + real.stats.buildings < 3 && emptyRetry < 2) {   // carte vide alors qu'on est en ville : on la redemande une fois, en ignorant la mémoire
      emptyRetry++; log('⚠ Aucune route ni bâtiment reçus : nouveau téléchargement automatique…'); setTimeout(() => recenter(true), 600);
    }       // 90 s de paix après tout chargement
    if (done) done();
  }, 40);
}
function recenter(force) { realData = null; pendingFull = null; pendingT = 0; forceDl = !!force; if (settings.world === 'real') rebuildWorld(); else set('world', 'real'); }
/* v9.21 : près des limites de la carte téléchargée (≈ 250 m du bord) ou quand la route disparaît : petite pause, la carte est re-téléchargée centrée sur l'endroit où on est */
let centerOverride = null, reloading = false, edgeT = 0, edgeCool = 0, noRoadT = 0;
function edgeCheck(now) {
  // v9.22 : plus de rechargement « route disparue » (il bouclait quand la carte n'avait pas de route proche) ; seulement tout près du bord, jamais pendant les 90 s qui suivent un chargement, au plus une fois aux 3 minutes
  if (!settings.autoMapRefresh || !state.started || settings.world !== 'real' || !realData || !world || !world.real || world.real.synthetic || reloading || paused || fall.on || now < edgeCool || now - edgeT < 500) return;
  edgeT = now;
  const lim = world.size / 2 - 30, e = lim - Math.max(Math.abs(rig.position.x), Math.abs(rig.position.z));
  if (e > 100) return;
  reloading = true;
  const ll = realData.back(rig.position.x, rig.position.z), keep = { yaw: state.yaw, cam: state.camYaw };
  log('Tu approches des limites de la carte : mise à jour…');
  centerOverride = { lat: ll[0], lon: ll[1], acc: 5, heading: null, ts: Date.now() };
  realData = null; pendingFull = null; pendingT = 0; paused = true;
  rebuildWorld(() => { state.yaw = keep.yaw; state.camYaw = keep.cam; centerOverride = null; reloading = false; paused = false; edgeCool = performance.now() + 180000; look.yaw = look.pitch = 0; });
}
function newCity() {
  settings.seed = Math.floor(Math.random() * 2147483647); save();
  if (settings.world === 'real') set('world', 'day'); else rebuildWorld();
}

/* ------------------------------------------------------------ journal */
const logLines = [];
function log(m) { SL.note('log', m); logLines.push(m); if (logLines.length > 5) logLines.shift(); $('#log').textContent = logLines.join('\n'); }
const setStatus = t => { $('#st').textContent = t; };

/* ------------------------------------------------------------ télémétrie */
window.__gentle = () => { try { return !!(T && T.connected && T.connected()); } catch { return false; } };   // Bluetooth actif : les téléchargements de carte se font plus doucement
const T = createTelemetry({
  log, setStatus,
  onLink: ok => {
    $('#cn').textContent = ok ? '🔗 Déconnecter' : '🔗 Connecter le scooter';
    $('#mble').textContent = ok ? 'BLE connecté' : 'BLE';
    $('#mble').className = 'chip' + (ok ? ' ok' : '');
  }
});
const EMBED = T.embedded || new URLSearchParams(location.search).has('embed');
if (EMBED) {
  $('#cn').hidden = true; $('#bExit').hidden = false;
  $('#steps').innerHTML = '<li>Connecte ta trottinette dans l’onglet <b>Tableau</b> de l’app (la connexion est partagée).</li><li>Autorise le gyro puis <b>Calibrer guidon</b> guidon droit.</li><li>La poignée donne la vitesse, le guidon tourne le monde.</li>';
  $('#bExit').onclick = () => parent.postMessage({ skkkrt3d: 'exit' }, '*');
}

/* état de la connexion : mis à jour en direct (en mode intégré, c'est l'onglet Tableau qui tient le Bluetooth) */
let linkOk = null;
function syncLink() {
  const ok = !!T.connected();
  if (ok === linkOk) return; linkOk = ok;
  setStatus(ok ? 'Scooter connecté ✓' : 'Déconnecté');
  $('#mble').textContent = ok ? 'BLE connecté' : 'BLE'; $('#mble').className = 'chip' + (ok ? ' ok' : '');
  const li = EMBED && $('#steps li');
  if (li) li.innerHTML = ok ? '✅ <b>Trottinette connectée</b> via l’onglet Tableau : la poignée pilote le jeu.' : 'Connecte ta trottinette dans l’onglet <b>Tableau</b> de l’app (la connexion est partagée).';
}
setInterval(syncLink, 400); syncLink();

/* ------------------------------------------------------------ gyro */
async function enableGyro() {
  try {
    await gyro.enable();
    $('#gy').classList.add('on'); $('#gy').textContent = '🧭 Gyro ON';
    $('#mgyro').textContent = 'Gyro prêt'; $('#mgyro').className = 'chip ok';
    log('Gyro autorisé — guidon droit puis « Calibrer ».');
  } catch (e) {
    log('Gyro : ' + e.message);
    $('#mgyro').textContent = 'Gyro refusé'; $('#mgyro').className = 'chip warn';
  }
}
function calibrate() {
  if (!gyro.on) { log('Autorise d’abord le gyro.'); return; }
  if (!gyro.calibrate()) { log('Pas encore d’orientation reçue — bouge un peu le téléphone.'); return; }
  $('#cal').classList.add('on');
  $('#mgyro').textContent = 'Guidon calibré'; $('#mgyro').className = 'chip ok';
  log('Guidon calibré (' + gyro.zero.toFixed(0) + '°)');
}
function goHome() {
  const sp = world ? world.spawn : SPAWN;
  placeAtSpawn(); log('Retour au départ.');
}
async function toggleHead() {
  if (T.connected()) { await T.command('head'); return; }
  state.head = !state.head; $('#hl').classList.toggle('on', state.head);
}
$('#gy').onclick = enableGyro; $('#cal').onclick = calibrate; $('#cn').onclick = () => T.connect(); $('#hl').onclick = toggleHead;
$('#mu').onclick = () => { set('music', !settings.music); audio.start(); };
const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
function hudExtras(now) {                                              // bouton musique + boussole « je roule pour vrai »
  const mu = $('#mu'), t = '🎵 Musique : ' + (settings.music ? 'ON' : 'off'); if (mu.textContent !== t) { mu.textContent = t; mu.classList.toggle('on', !!settings.music); }
  if (now - ride.cmpT < 300) return; ride.cmpT = now;
  const c = $('#cmp'); if (!ride.locked) { if (!c.hidden) c.hidden = true; return; }
  const brg = a => ((a % 360) + 360) % 360, mine = brg(-state.yaw * 180 / Math.PI), gc = gpsCourse();
  let txt = '🧭 ' + CARD[Math.round(mine / 45) % 8] + ' ' + Math.round(mine) + '°';
  if (gc) { const g = brg(Math.atan2(gc[0], -gc[1]) * 180 / Math.PI); txt += ' · GPS ' + Math.round(g) + '°'; }
  txt += ' · ±' + Math.round(Math.sqrt(Math.max(1, kf.p00))) + ' m · vitesse ×' + ride.scale.toFixed(2) + (ride.scaleOk ? ' ✓' : ' …');
  if (c.hidden) c.hidden = false; c.textContent = txt;
}

/* ------------------------------------------------------------ son */
const MSCALES = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10], dor: [0, 2, 3, 5, 7, 9, 10], mix: [0, 2, 4, 5, 7, 9, 10], lyd: [0, 2, 4, 6, 7, 9, 11], pent: [0, 2, 4, 7, 9] };
// 9 chansons : bpm · root (note MIDI) · gamme · progression (degrés) · lead / basse (ondes) · motif (décalages de degrés, null = silence) · batterie (0 = 4 temps, 1 = demi-tempo, 2 = lo-fi, 3 = aucune, 4 = shuffle)
const MUSIC = [
  { bpm: 108, root: 60, scale: 'maj',  prog: [0, 4, 5, 3], lead: 'triangle', lv: 0.2,  bw: 'sine',     bass: [1, 0, 0, 1, 0, 0, 1, 0], motif: [0, 2, 4, null, 2, 4, 7, 4],        pad: 1, drum: 2 },   // plage
  { bpm: 128, root: 57, scale: 'min',  prog: [0, 5, 3, 6], lead: 'sawtooth', lv: 0.11, bw: 'sawtooth', bass: [0, 1, 0, 1, 0, 1, 0, 1], motif: [0, 2, 4, 7, 4, 2, 0, 2],          pad: 0, drum: 0 },   // néon
  { bpm: 92,  root: 62, scale: 'dor',  prog: [0, 3, 0, 4], lead: 'sine',     lv: 0.24, bw: 'triangle', bass: [1, 0, 0, 0, 1, 0, 0, 0], motif: [0, null, 2, null, 4, null, 2, null], pad: 1, drum: 3 }, // forêt
  { bpm: 160, root: 64, scale: 'min',  prog: [0, 5, 6, 4], lead: 'square',   lv: 0.11, bw: 'square',   bass: [1, 0, 1, 0, 1, 0, 1, 0], motif: [4, 2, 0, 2, 4, 7, 4, 2],          pad: 0, drum: 0 },   // course
  { bpm: 120, root: 65, scale: 'lyd',  prog: [0, 1, 0, 4], lead: 'triangle', lv: 0.22, bw: 'sine',     bass: [1, 0, 1, 0, 1, 0, 1, 1], motif: [0, 4, 2, 4, 7, 4, 2, null],       pad: 1, drum: 1 },   // soleil levant
  { bpm: 100, root: 58, scale: 'mix',  prog: [0, 3, 4, 3], lead: 'square',   lv: 0.08, bw: 'triangle', bass: [1, 0, 0, 1, 0, 1, 0, 0], motif: [0, null, 2, 4, null, 7, 4, null], pad: 1, drum: 4 },   // jazzy
  { bpm: 84,  root: 55, scale: 'pent', prog: [0, 2, 3, 1], lead: 'sine',     lv: 0.24, bw: 'sine',     bass: [1, 0, 0, 0, 0, 0, 1, 0], motif: [0, 2, 4, 2, 0, null, 2, null],    pad: 1, drum: 2 },   // chill
  { bpm: 140, root: 62, scale: 'min',  prog: [0, 2, 3, 4], lead: 'sawtooth', lv: 0.1,  bw: 'square',   bass: [1, 1, 0, 1, 1, 0, 1, 0], motif: [0, 4, 7, 4, 0, 4, 7, 9],          pad: 0, drum: 0, hi: 1 }, // héros
  { bpm: 118, root: 60, scale: 'maj',  prog: [5, 3, 0, 4], lead: 'square',   lv: 0.1,  bw: 'sawtooth', bass: [1, 0, 1, 1, 1, 0, 1, 1], motif: [7, null, 4, 7, null, 4, 2, null], pad: 0, drum: 0 }    // disco
];
const audio = {
  ctx: null,
  start() {
    try {
      if (!this.ctx) {
        const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C();
        this.o1 = this.ctx.createOscillator(); this.o2 = this.ctx.createOscillator();
        this.o1.type = 'sawtooth'; this.o2.type = 'triangle';
        this.f = this.ctx.createBiquadFilter(); this.f.type = 'lowpass'; this.f.frequency.value = 400;
        this.g = this.ctx.createGain(); this.g.gain.value = 0;
        this.o1.connect(this.f); this.o2.connect(this.f); this.f.connect(this.g); this.g.connect(this.ctx.destination);
        this.o1.start(); this.o2.start();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {}
  },
  update(v) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, on = settings.sound && state.started;
    this.g.gain.setTargetAtTime(on ? Math.min(0.09, 0.004 + v * 0.011) * settings.volume * 2 : 0, t, 0.12);       // moteur : « sound » + « volume »
    this.o1.frequency.setTargetAtTime(48 + v * 11, t, 0.1); this.o2.frequency.setTargetAtTime(96 + v * 22, t, 0.1);
    this.f.frequency.setTargetAtTime(260 + v * 70, t, 0.15);
  },
  bell(f, t0 = 0, vol = 0.1, dur = 0.9) {                           // cloche métallique (partiels non harmoniques)
    [[1, 1, 1], [2.76, 0.5, 0.55], [5.4, 0.25, 0.35], [8.93, 0.12, 0.25]].forEach(([m, a, d]) => this.tone(f * m, f * m, dur * d, 'sine', vol * a, t0));
  },
  shower(n, dur, vol = 0.04) {                                       // pluie de pièces : petits « tings » aigus au hasard
    for (let i = 0; i < n; i++) { const f = 1500 + Math.random() * 2800; this.tone(f, f * (0.97 + Math.random() * 0.06), 0.05 + Math.random() * 0.06, Math.random() < 0.5 ? 'square' : 'triangle', vol, Math.random() * dur); }
  },
  brass(f, t0, dur, vol) {                                           // cuivre : 3 dents de scie légèrement désaccordées + filtre qui s'ouvre
    const c = this.ctx, t = c.currentTime + t0, g = c.createGain(), fl = c.createBiquadFilter(), v = vol * settings.sfxVolume * 2;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(f * 1.5, t); fl.frequency.linearRampToValueAtTime(f * 6, t + 0.07); fl.frequency.exponentialRampToValueAtTime(f * 2.5, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.025); g.gain.setValueAtTime(v, t + dur * 0.65); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const d of [-7, 0, 7]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(fl); o.start(t); o.stop(t + dur + 0.05); }
    fl.connect(g); g.connect(c.destination);
  },
  chirp() {                                                          // oiseau : 2 à 4 petites notes qui glissent
    if (!this.ctx || !settings.sfx || !state.started || document.hidden) return;
    try { let t = 0; const n = 2 + Math.floor(Math.random() * 3), f0 = 2400 + Math.random() * 2000;
      for (let i = 0; i < n; i++) { const up = Math.random() < 0.5, d = 0.05 + Math.random() * 0.05; this.tone(f0 * (up ? 0.85 : 1.1), f0 * (up ? 1.2 : 0.8), d, 'sine', 0.035, t); t += d + 0.04 + Math.random() * 0.05; } } catch {}
  },
  thunder(dist) {
    if (!this.ctx || !settings.sfx) return;
    try {
      const c = this.ctx, sr = c.sampleRate, dur = 2.8 + Math.random() * 1.8, n = Math.floor(sr * dur), b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
      let l = 0; for (let i = 0; i < n; i++) { l = l * 0.985 + (Math.random() * 2 - 1) * 0.12; d[i] = l * Math.pow(1 - i / n, 1.5) * (1 + 0.5 * Math.sin(i / sr * 6)); }
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), v = Math.max(0.25, Math.min(1, 1.15 - dist / 650)) * settings.sfxVolume * 2;
      s.buffer = b; f.type = 'lowpass'; f.frequency.value = 200; g.gain.value = 7 * v; s.connect(f); f.connect(g); g.connect(c.destination); s.start();
      if (dist < 300) this.noise(0.3, 0.45 * v);                     // craquement quand c'est proche
    } catch {}
  },
  /* ambiance : pluie (bruit blanc filtré) et vent (bruit brun filtré), en continu */
  bed(k) {
    const c = this.ctx, n = c.sampleRate * 3, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); let l = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; l = k === 'wind' ? l * 0.98 + w * 0.1 : w; d[i] = k === 'wind' ? l * 3 : w; }
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; s.loop = true;
    f.type = 'bandpass'; f.frequency.value = k === 'wind' ? 420 : 4200; f.Q.value = k === 'wind' ? 0.7 : 0.5; g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(); return g;
  },
  weatherSync(rain, wind) {
    if (!this.ctx) return;
    if (!this.rainG) { this.rainG = this.bed('rain'); this.windG = this.bed('wind'); }
    const t = this.ctx.currentTime, on = settings.sfx && state.started && !document.hidden ? settings.sfxVolume * 2 : 0;
    this.rainG.gain.setTargetAtTime(rain * 0.16 * on, t, 0.3); this.windG.gain.setTargetAtTime(Math.min(1, wind / 5) * 0.5 * on, t, 0.4);
  },
  sirenSync(info, yaw) {                                             // sirène du véhicule d'urgence le plus proche (police : yelp · ambulance : deux tons · pompiers : plainte)
    if (!this.ctx) return;
    if (!this.sv) {
      const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), p = c.createStereoPanner ? c.createStereoPanner() : null;
      o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 2600; g.gain.value = 0; o.connect(f); f.connect(g); if (p) { g.connect(p); p.connect(c.destination); } else g.connect(c.destination); o.start();
      this.sv = { o, g, p };
    }
    const t = this.ctx.currentTime, V = this.sv;
    if (!info || !settings.sfx || !state.started || document.hidden) { V.g.gain.setTargetAtTime(0, t, 0.15); return; }
    const k = info.kind, ph = performance.now() / 1000;
    const f = k === 'police' ? 820 + 480 * (0.5 + 0.5 * Math.sin(ph * 14)) : k === 'ambulance' ? (Math.floor(ph * 1.9) % 2 ? 740 : 980) : 520 + 640 * (0.5 + 0.5 * Math.sin(ph * 1.6));
    V.o.frequency.setTargetAtTime(f, t, 0.02);
    const v = Math.pow(Math.max(0, 1 - info.d / 200), 1.6) * 0.07 * settings.sfxVolume * 2;
    V.g.gain.setTargetAtTime(v, t, 0.1);
    if (V.p) { const l = Math.hypot(info.dx, info.dz) || 1; V.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, (info.dx * Math.cos(yaw) - info.dz * Math.sin(yaw)) / l)), t, 0.1); }
  },
  tone(f0, f1, dur, type = 'sine', vol = 0.2, delay = 0) {
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * settings.sfxVolume * 2, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol) {
    const sr = this.ctx.sampleRate, n = Math.floor(sr * dur), buf = this.ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); s.buffer = buf; g.gain.value = vol * settings.sfxVolume * 2;
    s.connect(g); g.connect(this.ctx.destination); s.start();
  },
  sfx(k) {
    if (!this.ctx || !settings.sfx) return;                         // sons du jeu : « sfx » + « sfxVolume » (indépendants du moteur)
    try {
      switch (k) {
        case 'coin': this.bell(1568, 0, 0.09, 0.4); this.bell(2093, 0.06, 0.09, 0.55); this.shower(3, 0.15, 0.03); break;                          // « ka-ching »
        case 'ring': this.tone(420, 1900, 0.22, 'sawtooth', 0.05); this.bell(1319, 0.14, 0.1, 0.7); this.bell(1760, 0.2, 0.09, 0.8); this.bell(2349, 0.26, 0.08, 0.9); this.shower(9, 0.5, 0.035); break;
        case 'big': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, f, 0.09, 'square', 0.07, i * 0.055)); this.bell(1568, 0.34, 0.12, 1); this.bell(2093, 0.4, 0.1, 1.1); this.shower(18, 0.9, 0.04); break;     // jackpot
        case 'flag': {                                                                   // fanfare de machine à sous
          const n = [[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.14], [1047, 0.36, 0.7]];
          n.forEach(([f, t, d]) => this.brass(f, t, d, 0.1)); [523, 659, 784].forEach(f => this.brass(f, 0.36, 0.7, 0.045));
          this.bell(2093, 0.4, 0.1, 1.2); this.bell(2637, 0.5, 0.08, 1.2); this.noise(0.55, 0.1); this.shower(26, 1.1, 0.04); break;
        }
        case 'tick': this.tone(660, 660, 0.08, 'sine', 0.12); break;
        case 'go': this.tone(880, 1320, 0.35, 'triangle', 0.18); break;
        case 'win': {                                                                    // gros lot !
          [[523, 0, 0.16], [659, 0.15, 0.16], [784, 0.3, 0.16], [1047, 0.45, 0.2], [784, 0.66, 0.12], [1047, 0.8, 0.12], [1319, 0.94, 0.18], [1568, 1.14, 0.9]].forEach(([f, t, d]) => this.brass(f, t, d, 0.11));
          [523, 784, 1047].forEach(f => this.brass(f, 1.14, 0.9, 0.05));
          for (let i = 0; i < 6; i++) this.bell(1568 + i * 220, 1.2 + i * 0.08, 0.09, 1.3);
          [0, 0.45, 1.15].forEach(t => this.noise(0.5, 0.11)); this.shower(60, 2.6, 0.04); break;
        }
        case 'lose': [440, 392, 330, 262].forEach((f, i) => this.tone(f, f, 0.3, 'sawtooth', 0.09, i * 0.16)); break;
        case 'bonk': this.tone(260, 80, 0.22, 'triangle', 0.25); break;
        case 'crash': this.tone(130, 38, 0.45, 'sawtooth', 0.22); this.noise(0.35, 0.22); break;
      }
    } catch {}
  },
  /* ---- musique d'arcade « course aux pièces » : boucle de 8 mesures (C – Am – F – G), 100 % synthétisée, aucun fichier */
  mt: null, ms: 0, mnext: 0, mvol: -1,
  musicSync() {
    if (!this.ctx) return;
    const want = !!settings.music && state.started && !document.hidden, vol = want ? settings.musicVolume : 0;
    if (!this.mg) { this.mg = this.ctx.createGain(); this.mg.gain.value = 0; this.mg.connect(this.ctx.destination); }
    if (vol !== this.mvol) { this.mvol = vol; this.mg.gain.setTargetAtTime(vol * 0.3, this.ctx.currentTime, 0.2); }
    if (want && !this.mt) { this.ms = 0; this.mnext = this.ctx.currentTime + 0.12; this.mt = setInterval(() => this.musicTick(), 80); }
    if (!want && this.mt) { clearInterval(this.mt); this.mt = null; }
  },
  /* v9.21 : 10 petites chansons de 15 secondes, enchaînées (n° 1 = l'originale « course aux pièces » ; les 9 autres changent de tempo, de tonalité, de gamme et de rythme) */
  tr: 0,
  musicTick() {
    const tr = this.tr | 0, TK = tr ? MUSIC[tr - 1] : null, step = 60 / (TK ? TK.bpm : 152) / 2, total = Math.round(15 / step);
    while (this.mnext < this.ctx.currentTime + 0.35) {
      this.musicStep(tr, this.ms, this.mnext, step); this.mnext += step; this.ms++;
      if (this.ms >= total) { this.ms = 0; this.tr = (tr + 1) % 10; break; }                    // chanson suivante au prochain tick (nouveau tempo)
    }
  },
  musicStep(tr, s, t, step) {
    if (tr === 0) return this.musicStep0(s % 64, t);
    const TK = MUSIC[tr - 1], m = n => 440 * Math.pow(2, (n - 69) / 12), sc = MSCALES[TK.scale], bar = (s >> 3) % 4, st = s & 7;
    const deg = d => TK.root + sc[((d % sc.length) + sc.length) % sc.length] + 12 * Math.floor(d / sc.length), ch = TK.prog[bar];
    if (TK.bass[st]) this.mnote(m(deg(ch) - 12), t, step * 1.7, TK.bw, 0.3);
    const mo = TK.motif[st]; if (mo != null) this.mnote(m(deg(ch + mo) + (TK.hi ? 12 : 0)), t, step * 0.95, TK.lead, TK.lv);
    if (st === 0 && TK.pad) [0, 2, 4].forEach(k => this.mnote(m(deg(ch + k)), t, step * 7.5, 'triangle', 0.05));
    const D = TK.drum, kick = () => { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14); o.connect(g); g.connect(this.mg); o.start(t); o.stop(t + 0.16); };
    if (D === 0) { if (st % 2 === 0) kick(); if (st === 4) this.mnoise(t, 0.09, 0.22, 1500); if (st & 1) this.mnoise(t, 0.035, 0.08, 7000); }      // quatre temps au sol
    else if (D === 1) { if (st === 0) kick(); if (st === 4) this.mnoise(t, 0.1, 0.2, 1400); if (st % 2 === 0) this.mnoise(t, 0.03, 0.06, 7500); }       // demi-tempo
    else if (D === 2) { if (st === 0 || st === 3) kick(); if (st === 4) this.mnoise(t, 0.12, 0.17, 1200); if (st & 1) this.mnoise(t, 0.04, 0.05, 6500); }  // lo-fi
    else if (D === 4) { if (st === 0 || st === 5) kick(); if (st === 2 || st === 6) this.mnoise(t, 0.08, 0.16, 1600); if (st & 1) this.mnoise(t, 0.05, 0.07, 8000); }   // shuffle
  },
  mnote(f, t, d, type, vol) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(this.mg); o.start(t); o.stop(t + d + 0.03);
  },
  mnoise(t, d, vol, hp) {
    if (!this.nbuf) { const n = Math.floor(this.ctx.sampleRate * 0.25), b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), c = b.getChannelData(0); for (let i = 0; i < n; i++) c[i] = Math.random() * 2 - 1; this.nbuf = b; }
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.nbuf; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); g.connect(this.mg); s.start(t); s.stop(t + d + 0.02);
  },
  musicStep0(s, t) {
    const m = n => 440 * Math.pow(2, (n - 69) / 12), bar = s >> 3, st = s & 7, ch = bar & 3;
    const LA = [[76, 79, 84, 79, 76, 79, 84, 0], [76, 81, 84, 81, 76, 81, 84, 0], [77, 81, 84, 81, 77, 81, 84, 81], [74, 79, 83, 79, 74, 79, 83, 86]];
    const LB = [[84, 83, 84, 88, 84, 79, 76, 79], [81, 84, 88, 84, 81, 76, 81, 84], [84, 81, 77, 81, 84, 89, 84, 81], [83, 86, 91, 86, 83, 79, 83, 88]];
    const root = [48, 45, 41, 43][ch], n = (bar < 4 ? LA : LB)[ch][st];
    if (n) this.mnote(m(n), t, 0.17, 'square', 0.16);
    if (n && bar >= 4) this.mnote(m(n - 12), t, 0.17, 'square', 0.05);          // 2e moitié : on double à l'octave grave
    if (st % 2 === 0) this.mnote(m(st === 4 ? root + 7 : root), t, 0.2, 'triangle', 0.3);                       // basse
    if (st === 0 || st === 4) { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14); o.connect(g); g.connect(this.mg); o.start(t); o.stop(t + 0.16); }   // grosse caisse
    if (st === 2 || st === 6) this.mnoise(t, 0.09, 0.22, 1500);                  // caisse claire
    if (st & 1) this.mnoise(t, 0.035, 0.08, 7000);                               // charleston
    if (bar === 7 && st === 7) this.mnote(m(95), t, 0.3, 'square', 0.1);          // petit « ding » de pièce avant de reboucler
  },
  thump() {
    if (!this.ctx || !settings.sfx) return;
    try {
      const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
      g.gain.setValueAtTime(0.25 * settings.sfxVolume * 2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + 0.22);
    } catch {}
  }
};

/* ------------------------------------------------------------ jeu (drapeaux, pièces) & chutes */
let extras = null;
function playSfx(k) { audio.sfx(k); if (extras) extras.celebrate(k); }   // son + confettis
const game = createGame(scene, { sfx: playSfx, again: () => newGame(), free: () => set('gameMode', 'free'), world: () => world, onEnd: () => { try { document.exitPointerLock(); } catch {} } });

// balade libre : pièces, anneaux et drapeaux réguliers sur ton chemin + favoris appris de tes trajets
let _favC = null, _favT = 0;
function favWorld() {
  if (!realData || settings.world !== 'real' || !settings.rideLog) return [];
  const now = performance.now(); if (_favC && now - _favT < 15000) return _favC;
  _favT = now; _favC = rides.favorites().map(f => { const l = realData.loc(f.lat, f.lon); return { id: f.id, x: l[0], z: l[1] }; }); return _favC;
}
const free = createFree(scene, { sfx: playSfx, world: () => world, favs: favWorld });
extras = createExtras({ scene, camera, settings, state, rig, getWorld: () => world, audio, getLook: () => look.yaw });
audio.log = m => log(m);
const X = extras.state;
// bouton « Nouvelle partie » / « Lancer le jeu » (en balade libre, repasse en mode drapeaux)
/* ---- mode criminel : 5 étoiles ; chaque contact avec la police en enlève une ; à zéro, tu es arrêté */
const wanted = { stars: 5, MAX: 5 };
function drawStars() {
  const el = $('#wanted'); if (!el) return;
  const on = specialMode() === 'chase' && state.started;
  el.hidden = !on; if (!on) return;
  let h = ''; for (let i = 0; i < wanted.MAX; i++) h += '<i class="' + (i < wanted.stars ? 'on' : 'off') + '">★</i>';
  el.innerHTML = h;
}
function resetStars() { wanted.stars = wanted.MAX; drawStars(); }
function policeHit(c) {                                             // retourne true si c'était la dernière étoile
  if (specialMode() !== 'chase' || !c || c.g.userData.emg !== 'police') return false;
  wanted.stars = Math.max(0, wanted.stars - 1); drawStars();
  const el = $('#wanted'); if (el) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
  if (wanted.stars > 0) { log('⭐ Touché par la police : −1 étoile (il t’en reste ' + wanted.stars + ' sur ' + wanted.MAX + ').'); return false; }
  log('🚔 Plus aucune étoile : la police t’a arrêté ! Nouvelle poursuite avec 5 étoiles.'); game.say('ARRÊTÉ !', 1600, 'bad'); return true;
}
function playGame() { if (settings.gameMode === 'free') set('gameMode', 'ctf'); else newGame(); }
function newGame() {
  resetStars();
  goHome(); fall.on = false; fall.moved = false; scooter.setFall(0, 1);
  if (settings.gameMode === 'ctf') game.start(); else game.stop();
  if (settings.gameMode === 'free') free.start(); else free.stop();
}
function flash() {
  const f = $('#flash'); if (!f) return;
  f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
}
function startFall(why, speed) {
  if (fall.on) return;
  air.active = false; air.vy = 0; air.requested = false;
  SL.note('fall', why, Math.round(speed * 10) / 10);
  fall.on = true; fall.t = 0; fall.moved = false; fall.side = Math.random() < 0.5 ? -1 : 1;
  state.speed = 0; state.bump = 1; state.hitCd = Math.max(state.hitCd, 1);
  audio.sfx('crash'); flash();
  game.event(why === 'wall' || why === 'tree' ? 'wall' : 'cyclistfall');
  game.say('CHUTE !', 1100, 'bad');
  log({ wall: 'Chute : collision avec un bâtiment.', tree: 'Chute : tu as percuté un arbre.', ped: 'Chute : tu as percuté un piéton.', car: 'Chute : tu as percuté un véhicule.', ice: 'Plaque glacée : tu as perdu l’adhérence et tu es tombée.' }[why] || 'Chute : tu as percuté un cycliste.');
}
// après la chute : on est remis sur la piste cyclable la plus proche, dans le sens de la piste
const SAFE_GAP = 12;                                                // distance libre minimale (m) autour de l'endroit où on est remis debout
// cherche, en avançant le long de la route, un endroit assez loin de tout véhicule / piéton (sinon on retomberait dessus à répétition)
function safeAhead(x, z, fx, fz, snap) {
  let best = null, bg = -1;
  for (const d of [0, 10, 18, 28, 40, 55, 75, 100]) {
    let qx = x + fx * d, qz = z + fz * d; if (snap) { const r = snap(qx, qz); if (r) { qx = r.x; qz = r.z; } }
    const g = world.mobileGap ? world.mobileGap(qx, qz) : 99;
    if (g >= SAFE_GAP) return { x: qx, z: qz };
    if (g > bg) { bg = g; best = { x: qx, z: qz }; }
  }
  return best || { x, z };
}
function respawnOnLane() {
  const x = rig.position.x, z = rig.position.z;
  state.hitCd = Math.max(state.hitCd, 3);                         // quelques secondes d'immunité après être remis debout
  if (world.real) {                                               // carte réelle ou parcours synthétique : route la plus proche
    const r = world.api.nearestRoad(x, z);
    if (r) {
      const ref = game.targetVec(x, z) || [-Math.sin(state.yaw), -Math.cos(state.yaw)];
      const s = r.dx * ref[0] + r.dz * ref[1] < 0 ? -1 : 1;
      const q = world.preset === 'sky' ? { x: r.x, z: r.z } : safeAhead(r.x, r.z, r.dx * s, r.dz * s, (qx, qz) => world.api.nearestRoad(qx, qz));
      const deck = world.api.deckY(q.x, q.z), floor = deck != null ? deck : world.api.elev(q.x, q.z);
      rig.position.set(q.x, floor || 0, q.z);
      state.yaw = state.camYaw = Math.atan2(-r.dx * s, -r.dz * s); state.speed = 0; state.slope = 0; state.bump = 0;
      log(world.preset === 'sky' ? 'Réapparition sur la planche près de la chute.' : 'Remis sur la route, à l’écart du véhicule.');
    }
    return;
  }
  let bestV = true, bestC = 0, bd = 1e9;
  for (const a of STREETS) {
    const c = a + LANE_OFF;
    let d = Math.abs(x - c); if (d < bd) { bd = d; bestV = true; bestC = c; }
    d = Math.abs(z - c); if (d < bd) { bd = d; bestV = false; bestC = c; }
  }
  const dirs = bestV ? [[Math.PI, 0, 1], [0, 0, -1]] : [[-Math.PI / 2, 1, 0], [Math.PI / 2, -1, 0]];   // [yaw, avant x, avant z]
  const ref = game.targetVec(x, z) || [-Math.sin(state.yaw), -Math.cos(state.yaw)];
  const pick = dirs[dirs[1][1] * ref[0] + dirs[1][2] * ref[1] > dirs[0][1] * ref[0] + dirs[0][2] * ref[1] ? 1 : 0];
  let sx = x, sz = z; if (bestV) sx = bestC; else sz = bestC;
  const q = safeAhead(sx, sz, pick[1], pick[2], null);
  rig.position.x = bestV ? bestC : q.x; rig.position.z = bestV ? q.z : bestC;
  state.yaw = state.camYaw = pick[0]; state.speed = 0;
  log('Remis sur la piste cyclable, à l’écart du véhicule.');
}

/* ------------------------------------------------------------ mini-carte */
const mm = $('#mm'), mg = mm.getContext('2d');
let mapCv = null, miniD = null;      // miniD : données de la vraie carte (null pour la ville imaginaire)
function buildMap() {
  if (world && world.real) { mapCv = null; return; }
  const th = world.theme || THEMES.day, S = 1024, k = S / SIZE;
  mapCv = document.createElement('canvas'); mapCv.width = mapCv.height = S;
  const g = mapCv.getContext('2d'), hx = n => '#' + n.toString(16).padStart(6, '0');
  g.fillStyle = hx(th.ground); g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2); g.scale(k, k);
  g.fillStyle = hx(th.lawn); g.fillRect(-PARK, -PARK, PARK * 2, PARK * 2);
  g.fillStyle = hx(th.road);
  for (const a of STREETS) { g.fillRect(a - 4.6, -SIZE / 2, 9.2, SIZE); g.fillRect(-SIZE / 2, a - 4.6, SIZE, 9.2); }
  g.strokeStyle = '#46e08a'; g.lineWidth = 2.2;
  for (const a of STREETS) {
    g.beginPath(); g.moveTo(a + 2.576, -SIZE / 2); g.lineTo(a + 2.576, SIZE / 2); g.stroke();
    g.beginPath(); g.moveTo(-SIZE / 2, a + 2.576); g.lineTo(SIZE / 2, a + 2.576); g.stroke();
  }
  g.beginPath(); g.ellipse(0, 0, OVAL.rx, OVAL.rz, 0, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(-PARK, -PARK); g.lineTo(PARK, PARK); g.moveTo(-PARK, PARK); g.lineTo(PARK, -PARK); g.stroke();
  g.fillStyle = 'rgba(30,36,52,.85)';
  for (const b of world.colliders) g.fillRect(b.x - b.hx, b.z - b.hz, b.hx * 2, b.hz * 2);
  g.fillStyle = hx(th.water); g.beginPath(); g.ellipse(22, 22, 8, 5, 0, 0, 7); g.fill();
}
function drawMap() {
  const s = mm.width, R = s / 2, sc = R / (+settings.mapRange || 75);
  mg.clearRect(0, 0, s, s);
  mg.save();
  mg.beginPath(); mg.arc(R, R, R - 2, 0, 7); mg.clip();
  mg.fillStyle = '#0d1624'; mg.fillRect(0, 0, s, s);
  if (world.real) {
    mg.translate(R, R); mg.rotate(state.yaw);
    world.api.mini(mg, rig.position.x, rig.position.z, sc);               // dessin vectoriel (secours tant que les tuiles arrivent)
    if (settings.miniOsm && miniD) { try { drawOsm(mg, miniD, rig.position.x, rig.position.z, sc, R); } catch (e) {} }
    if (world.traffic && settings.traffic) world.traffic.mini(mg, rig.position.x, rig.position.z, sc);
    game.drawMap(mg, rig.position.x, rig.position.z, sc); free.drawMap(mg, rig.position.x, rig.position.z, sc);
  } else if (mapCv) {
    mg.translate(R, R); mg.rotate(state.yaw);
    mg.drawImage(mapCv, (-SIZE / 2 - rig.position.x) * sc, (-SIZE / 2 - rig.position.z) * sc, SIZE * sc, SIZE * sc);
    if (settings.traffic) {                                   // cyclistes : points blancs (gris s'ils sont à terre)
      mg.strokeStyle = '#222'; mg.lineWidth = 1.5;
      for (const c of world.cyclists) {
        const dx = c.x - rig.position.x, dz = c.z - rig.position.z;
        if (dx * dx + dz * dz > 5600) continue;
        mg.fillStyle = c.down > 0 ? '#888' : '#fff';
        mg.beginPath(); mg.arc(dx * sc, dz * sc, 3.2, 0, 7); mg.fill(); mg.stroke();
      }
    }
    game.drawMap(mg, rig.position.x, rig.position.z, sc); free.drawMap(mg, rig.position.x, rig.position.z, sc);
  }
  mg.restore();
  mg.save(); mg.translate(R, R);
  mg.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ac') || '#ff9f1c';
  mg.strokeStyle = '#000'; mg.lineWidth = 2;
  mg.beginPath(); mg.moveTo(0, -12); mg.lineTo(8, 10); mg.lineTo(0, 5); mg.lineTo(-8, 10); mg.closePath(); mg.stroke(); mg.fill();
  mg.restore();
}

/* ------------------------------------------------------------ apparence / réglages */
function applyTheme() {
  const f = FONTS.find(x => x.id === settings.font) || FONTS[0];
  const r = document.documentElement.style;
  r.setProperty('--ff', f.css); r.setProperty('--ac', settings.accent);
  document.body.classList.toggle('rtl-font-retro', settings.font === 'retro');
  scooter.setAccent(settings.accent);
}
function applyLook() {                                              // luminosité + distance de vue (brouillard)
  if (!world) return;
  renderer.toneMappingExposure = world.theme.exposure * (+settings.exposure || 1);
  const k = Math.max(0.4, +settings.viewDist || 1), th = world.theme;
  if (scene.fog) { scene.fog.near = th.fogNear * k; scene.fog.far = th.fogFar * k; }
  camera.far = Math.max(800, th.fogFar * k * Math.max(1, +settings.lawnDist || 1) + 200); camera.updateProjectionMatrix();
}
/* ---- opacité de la vue 3D : la caméra arrière du téléphone passe derrière (comme la carte de la 2D) pour une réalité augmentée à ton goût */
let camStream = null;
async function applyOpacity() {
  const op = Math.max(0.15, Math.min(1, (+settings.viewOpacity || 100) / 100)), v = $('#camv');
  canvas.style.opacity = String(op);
  if (op < 0.999 && !camStream && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try { camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); v.srcObject = camStream; v.style.display = 'block'; v.play().catch(() => {}); }
    catch (e) { log('Caméra de fond : ' + e.message); canvas.style.opacity = '1'; }
  } else if (op >= 0.999 && camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; v.srcObject = null; v.style.display = 'none'; }
}
function specialMode() { const s = settings.special; return s === 'auto' ? (settings.difficulty === 'hard' ? 'emergency' : 'off') : s === 'chase' ? 'chase' : s === 'emergency' ? 'emergency' : 'off'; }
function applyTraffic() {
  const tr = world && world.traffic; if (!tr) return;
  tr.setDensity({ few: 0.3, some: 0.6, busy: 1 }[settings.trafficLevel] ?? 0.3);
  tr.setSignals(settings.trafficLights || 'off');
  tr.setSpecial(specialMode()); drawStars();
}
function applyToggles() {
  { const m = +settings.mapSize; mm.style.width = mm.style.height = m ? m + 'px' : ''; $('#fps').hidden = !settings.fps; }
  $('#rose').hidden = !settings.showRose; $('#mm').hidden = !settings.showMap; $('#gaugebox').hidden = !settings.showGauge; $('#log').hidden = !settings.showLog;
  $('#osmCredit').hidden = settings.world !== 'real';
  $('#gDiffRow').hidden = settings.gameMode === 'free';
  $('#gRealRow').hidden = settings.world !== 'real';
  $('#gImagRow').hidden = settings.world === 'real';
  $('#gBest').textContent = game.bestLine();
  $('#ng').textContent = settings.gameMode === 'free' ? '🚩 Lancer le jeu' : '🚩 Nouvelle partie';
}
function applyView() { scooter.setView(settings.view === 'fp' && state.started); }

onChange(k => {
  const all = k === '*';
  if (all || k === 'quality') applyQuality();
  if (k === 'world' && reloading) { reloading = false; paused = false; centerOverride = null; }      // rechargement interrompu (carte impossible)
  if (k === 'world' && settings.world === 'real') realData = null;      // on entre dans le monde réel : on relit ta position GPS
  if (all || k === 'world' || k === 'quality' || ['season', 'tod', 'glow'].includes(k) || (k === 'preset' && settings.world !== 'real')) rebuildWorld();
  if (k === 'relief' && settings.world === 'real') rebuildWorld();
  if (k === 'mapRadius') { realData = null; if (settings.world === 'real') rebuildWorld(); }
  if (all || k === 'fov') { camera.fov = settings.fov; camera.updateProjectionMatrix(); }
  if (all || k === 'font' || k === 'accent') applyTheme();
  if (all || k === 'view') applyView();
  if (all || k === 'traffic') world && world.setTraffic(settings.traffic);
  if (all || ['trafficLevel', 'trafficLights', 'special', 'difficulty'].includes(k)) { applyTraffic(); if (k === 'special') resetStars(); if (k === 'special' && specialMode() === 'chase') log('Mode criminel : la police, les ambulances et les pompiers te poursuivent. Fuis !'); }
  if (all || ['riderHair', 'riderGlasses', 'riderSkin', 'riderVest'].includes(k)) scooter.setRider({ hair: settings.riderHair, glasses: settings.riderGlasses, skin: settings.riderSkin, vest: settings.riderVest });
  if (all || k === 'cupHolder') scooter.setCup(settings.cupHolder);
  if (k === 'weather') { extras.resetWeather(); log(settings.weather === 'storm' ? 'Orage : route glissante, visière (🥽) pour la pluie.' : settings.weather === 'tornado' ? 'Tornade : le vent attire la trottinette même guidon droit.' : 'Beau temps.'); }
  if (all || k === 'viewOpacity') applyOpacity();
  if (all || ['showMap', 'showGauge', 'showLog', 'gameMode', 'difficulty', 'world', 'mapSize', 'fps'].includes(k)) applyToggles();
  if (all || k === 'resScale') applyQuality();
  if (k === 'premium') { applyQuality(); rebuildWorld(); log(premium() ? 'Rendu Premium activé (recharge la page pour la trottinette).' : 'Rendu classique (recharge la page pour la trottinette).'); }
  if (all || k === 'exposure' || k === 'viewDist' || k === 'lawnDist') applyLook();
  if (all || ['shadowQ', 'texRes', 'aniso'].includes(k)) rebuildWorld();
  if (k === 'nature' || k === 'grass') { rebuildWorld(); log(settings.nature === false ? 'Nature réaliste désactivée (rendu Premium seul).' : 'Nature réaliste : gazon, feuillage, textures et ciel mis à jour.'); }
  if (['roadMarks', 'sidewalks', 'roofs', 'streetLamps', 'treeDensity'].includes(k) && settings.world === 'real') rebuildWorld();
  if ((all || k === 'gameMode' || k === 'difficulty') && state.started) {
    if (settings.gameMode === 'free') { game.stop(); free.start(); } else newGame();
  }
});

/* ------------------------------------------------------------ panneau + écran d'accueil */
const panel = $('#panel');
function copyText(t) {
  try { const a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;left:0;top:0;opacity:0'; document.body.appendChild(a); a.select(); const ok = document.execCommand('copy'); a.remove(); if (ok) return Promise.resolve(true); } catch {}
  return navigator.clipboard ? navigator.clipboard.writeText(t).then(() => true, () => false) : Promise.resolve(false);
}
buildPanel(panel, { sessionReport: () => { const t = SL.report(); copyText(t).then(ok => log(ok ? '📋 Rapport copié (' + SL.count() + ' partie(s), ' + Math.round(t.length / 1024) + ' Ko) : colle-le dans la conversation.' : 'Copie impossible ici : ouvre le jeu seul (sans l’app) et réessaie.')); },
  sessionClear: () => { SL.clear(); log('Journal des parties effacé.'); },
  rideStats: () => { const st = rides.stats(), t = free.totals(); log('Trajets : ' + st.rides + ' · ' + st.km + ' km · ' + st.favs + ' endroits favoris · points à vie : ' + t.pts + ' (' + t.coins + ' pièces, ' + t.rings + ' anneaux, ' + t.flags + ' drapeaux)'); }, clearRides: () => { rides.clear(); _favC = null; log('Historique des trajets effacé.'); }, clearFree: () => { free.clearTotals(); log('Points de la balade libre remis à zéro.'); }, close: () => closePanel(), calibrate, home: goHome, recenter, newCity, clearBest: () => { game.clearBest(); $('#gBest').textContent = game.bestLine(); log('Records effacés.'); } });
worldPicker($('#gWorlds')); segment($('#gPreset'), 'preset', [['city', '🏙 Ville + pont'], ['skate', '🛹 Skatepark'], ['mountain', '⛰ Sentier montagne'], ['f1', '🏎 Circuit F1'], ['snow', '❄️ Motoneige'], ['sky', '☁️ Relais dans le ciel']]); { const el = $('#gRealTheme'); for (const [k, o] of [['season', [['summer', '☀️ Été'], ['winter', '❄️ Hiver'], ['spring', '🌱 Printemps'], ['autumn', '🍂 Automne']]], ['tod', [['day', '🌞 Jour'], ['dusk', '🌇 Soir'], ['night', '🌙 Nuit']]], ['glow', [['normal', 'Lumière discrète'], ['neon', '🌈 Néon']]]]) { const d = document.createElement('div'); el.append(d); segment(d, k, o); } } segment($('#gView'), 'view', [['fp', '1re personne'], ['tp', '2e personne']]);
segment($('#gMode'), 'gameMode', [['ctf', '🚩 Capture de drapeaux'], ['free', 'Balade libre']]);
segment($('#gRadius'), 'mapRadius', [['800', '800 m (rapide)'], ['1500', '1,5 km (élargi)']]);
segment($('#gDiff'), 'difficulty', [['easy', 'Facile'], ['med', 'Moyen'], ['hard', 'Difficile']]);
$('#gNewCity').onclick = newCity; $('#gRecenter').onclick = () => recenter(false);
/* ---- v9.20 : menu / pause (☰, Échap ou P), retour à l'écran d'accueil */
const pauseEl = $('#pause');
function setPause(on) {
  if (on && !state.started) return;
  paused = !!on; pauseEl.hidden = !paused || !panel.hidden; last = performance.now();
  if (paused) { try { document.exitPointerLock(); } catch {} }
  else if (state.started && panel.hidden && matchMedia('(pointer:fine)').matches) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch {} }   // reprise : la souris reprend la vue
}
function openPanel() {
  panel.hidden = false; pauseEl.hidden = true;
  for (const k in keys) keys[k] = false; for (const k in kk) kk[k] = false;
  try { document.exitPointerLock(); } catch {}
  requestAnimationFrame(() => panel.querySelector('.ptabs button')?.focus());
}
function closePanel() { panel.hidden = true; pauseEl.hidden = !paused; }
function goMenu() {                                                   // retour à l'écran d'accueil : monde, vue, jeu, réglages
  paused = false; pauseEl.hidden = true; panel.hidden = true; look.yaw = look.pitch = 0; try { document.exitPointerLock(); } catch {}
  state.started = false; state.speed = 0; game.stop(); free.stop();
  $('#hud').hidden = true; $('#gate').hidden = false; applyView(); applyToggles();
}
$('#bSet').onclick = () => { if (panel.hidden) openPanel(); else closePanel(); };
$('#bMenu').onclick = () => setPause(!paused);
$('#bVisor').onclick = () => { extras.toggleVisor(); };
$('#gSet').onclick = openPanel;
$('#pResume').onclick = () => setPause(false);
$('#pSet').onclick = openPanel;
$('#pHome').onclick = goMenu;
$('#pNew').onclick = () => { setPause(false); playGame(); };
$('#pExit').hidden = !EMBED; $('#pExit').onclick = () => parent.postMessage({ skkkrt3d: 'exit' }, '*');
$('#go').onclick = () => {
  paused = false; pauseEl.hidden = true;
  $('#gate').hidden = true; $('#hud').hidden = false; state.started = true; applyView(); audio.start(); resetStars();
  if (/iPhone|iPad|Android/i.test(navigator.userAgent)) enableGyro();
  newGame();
};
$('#ng').onclick = playGame;
$('#jumpBtn').addEventListener('pointerdown', e => { e.preventDefault(); if (state.started && !paused && jumpAllowed()) air.requested = true; });
addEventListener('message', () => {});

/* ------------------------------------------------------------ simulation */
/* ---- quand tu roules POUR VRAI (GPS en mouvement) : le cap vient de ta vraie trajectoire + de la route, pas du guidon ni de la boussole.
   Le guidon reste utilisé sur le stand (GPS immobile). La position est recalée sur la route (aimant), avec compensation du retard GPS. */
const track = [];
const ride = { locked: false, lockT: -1e9, lockStart: 0, snap: null, road: null, sv: 0, hardT: 0, waterLog: 0, scale: 1, scaleT: 0, scaleOk: false, saveT: 0, cmpT: 0 };
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
/* Filtre de Kalman (position + vitesse) alimenté par chaque fix GPS ET par la vitesse/cap Doppler de l'appareil (précis à ~1 km/h et quelques degrés) :
   donne une position lissée, une vitesse et un cap stables, et permet de ramener la position GPS à « maintenant » (le fix a toujours un peu de retard). */
const kf = { ok: false, t: 0, x: 0, z: 0, vx: 0, vz: 0, p00: 1e4, p01: 0, p11: 25 };
function gpsFeed(p, l, ts) {
  const r = Math.max(3, p.acc || 10) ** 2;
  if (!kf.ok || ts - kf.t > 15000 || Math.hypot(l[0] - kf.x - kf.vx * (ts - kf.t) / 1000, l[1] - kf.z - kf.vz * (ts - kf.t) / 1000) > 120) {
    kf.x = l[0]; kf.z = l[1]; kf.vx = kf.vz = 0; kf.p00 = r; kf.p01 = 0; kf.p11 = 25; kf.t = ts; kf.ok = true;
  } else {
    const d = Math.max(0.05, Math.min(5, (ts - kf.t) / 1000)); kf.t = ts;
    kf.x += kf.vx * d; kf.z += kf.vz * d;
    const q = 9;                                                    // accélération typique ±3 m/s²
    const n00 = kf.p00 + d * (2 * kf.p01 + d * kf.p11) + q * d ** 4 / 4, n01 = kf.p01 + d * kf.p11 + q * d ** 3 / 2, n11 = kf.p11 + q * d * d;
    const S = n00 + r, K0 = n00 / S, K1 = n01 / S, yx = l[0] - kf.x, yz = l[1] - kf.z;
    kf.x += K0 * yx; kf.z += K0 * yz; kf.vx += K1 * yx; kf.vz += K1 * yz;
    kf.p00 = (1 - K0) * n00; kf.p01 = (1 - K0) * n01; kf.p11 = n11 - K1 * n01;
  }
  if (p.speed != null && !isNaN(p.speed)) {                         // mesure de vitesse Doppler
    let mx = null, mz = null, rv = 0.64;
    if (p.speed > 2 && p.heading != null && !isNaN(p.heading)) { const h = p.heading * Math.PI / 180; mx = p.speed * Math.sin(h); mz = -p.speed * Math.cos(h); }
    else if (p.speed < 0.6) { mx = 0; mz = 0; rv = 0.25; }          // à l'arrêt
    if (mx != null) { const K = kf.p11 / (kf.p11 + rv); kf.vx += K * (mx - kf.vx); kf.vz += K * (mz - kf.vz); kf.p11 *= 1 - K; kf.p01 *= 1 - K; }
  }
}
function gpsSpeed() {
  if (kf.ok && Date.now() - kf.t < 6000) return Math.hypot(kf.vx, kf.vz);
  if (!gps) return 0;
  if (gps.speed != null && !isNaN(gps.speed)) return Math.max(0, gps.speed);
  const n = track.length; if (n < 2) return 0;
  const a = track[n - 1], b = track[n - 2], dt = (a.t - b.t) / 1000; return dt > 0.2 && dt < 8 ? Math.hypot(a.x - b.x, a.z - b.z) / dt : 0;
}
function gpsCourse() {                                                 // vecteur unitaire de la VRAIE direction du déplacement, ou null
  if (kf.ok && Date.now() - kf.t < 6000) { const v = Math.hypot(kf.vx, kf.vz); return v > 1.3 ? [kf.vx / v, kf.vz / v] : null; }
  const n = track[track.length - 1]; if (!n || Date.now() - n.t > 6000) return null;
  const P = track.filter(q => n.t - q.t <= 9000), f = P[0];
  if (P.length < 3 || Math.hypot(n.x - f.x, n.z - f.z) < 14) return null;
  let mx = 0, mz = 0; for (const q of P) { mx += q.x; mz += q.z; } mx /= P.length; mz /= P.length;
  let sxx = 0, szz = 0, sxz = 0; for (const q of P) { const dx = q.x - mx, dz = q.z - mz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const an = 0.5 * Math.atan2(2 * sxz, sxx - szz); let ux = Math.cos(an), uz = Math.sin(an);
  if (ux * (n.x - f.x) + uz * (n.z - f.z) < 0) { ux = -ux; uz = -uz; }
  return [ux, uz];
}
function gpsPred() {                                                   // position GPS lissée, ramenée à « maintenant »
  if (!kf.ok) return [gps.x, gps.z];
  const age = Math.max(0, Math.min(3, (Date.now() - kf.t) / 1000)) + 0.05;
  return [kf.x + kf.vx * age, kf.z + kf.vz * age];
}
function rideScale(dt, rawMs) {                                        // apprend le rapport vitesse GPS / vitesse de la roue (rayon de roue, pression…) → vitesse perçue exacte
  const gs = gpsSpeed();
  if (rawMs > 3 && gs > 2.5 && kf.ok && Date.now() - kf.t < 3000) {
    ride.scale += (Math.max(0.6, Math.min(1.6, gs / rawMs)) - ride.scale) * Math.min(1, dt / 15);
    ride.scaleT += dt; if (ride.scaleT > 12) ride.scaleOk = true;
  }
}
function rideUpdate(now) {                                             // verrou « je roule pour vrai » : s'allume > 1,6 m/s, s'éteint 2,5 s après l'arrêt
  const fresh = world.real && settings.world === 'real' && settings.gpsSync && gps && Date.now() - gps.t < 5000 && (gps.acc == null || gps.acc < 60);
  if (fresh && gpsSpeed() > 1.6) ride.lockT = now;
  const was = ride.locked;
  ride.locked = !!fresh && state.started && now - ride.lockT < 2500;
  if (ride.locked && !was) { ride.lockStart = now; if (!ride.scaleOk) ride.scale = settings.speedScale; }
  if (!ride.locked) { ride.snap = null; ride.road = null; ride.sv = 0; }
}
function rideYaw(dt) {                                                 // renvoie true si le cap a été piloté par le GPS / la route
  const course = gpsCourse(), hx = course ? course[0] : null, hz = course ? course[1] : null;
  ride.snap = null;
  let target = null;
  if (settings.roadSnap) {
    const pp = gpsPred();
    const m = world.api.matchRoad(pp[0], pp[1], hx, hz, ride.road, Math.max(14, Math.min(40, 10 + (gps.acc || 10) * 1.2)));
    if (m) {
      ride.road = m.r; ride.snap = m;
      if (hx == null || m.dx * hx + m.dz * hz > 0.6) target = Math.atan2(-m.dx, -m.dz);    // la route va dans le sens de ta trajectoire (±53°)
    } else ride.road = null;
  }
  if (target == null && hx != null) target = Math.atan2(-hx, -hz);
  if (target == null) { ride.sv = 0; return false; }
  let d = wrapA(target - state.yaw); const maxr = performance.now() - ride.lockStart < 1500 ? 6 : 2.4;      // au tout début on s'aligne vite, ensuite rotation douce
  d = clamp(d * Math.min(1, dt * (ride.snap ? 2.5 : 1.5)), -maxr * dt, maxr * dt);
  state.yaw += d;
  ride.sv += (clamp(-d / Math.max(dt, 0.001) / 0.9, -1, 1) - ride.sv) * Math.min(1, dt * 6);
  return true;
}
function rideSafe(ox, oz) {                                            // le recalage GPS ne doit jamais te pousser dans l'eau ni par-dessus le garde-corps d'un pont
  const wa = world.api, x = rig.position.x, z = rig.position.z;
  const bad = (!wa.inWater(ox, oz) && wa.inWater(x, z)) || !!(wa.bridgeLeave && wa.bridgeLeave(ox, oz, rig.position.y, x, z)) || !!(wa.bridgeCeiling && wa.bridgeCeiling(x, z, wa.elev(x, z), rig.position.y, 1.7));
  if (bad) { rig.position.x = ox; rig.position.z = oz; }
}
function rideMove(dt, now) {
  const ox = rig.position.x, oz = rig.position.z; rideMove2(dt, now); rideSafe(ox, oz);
}
function rideMove2(dt, now) {                                           // recale la position : forte en travers de la route (reste dessus), faible en avant (la vitesse de la roue est plus fiable que le GPS)
  const course = gpsCourse(), pp = gpsPred(), sig = Math.sqrt(Math.max(1, kf.p00));
  let tx = pp[0], tz = pp[1], db = 1.2, ux = -Math.sin(state.yaw), uz = -Math.cos(state.yaw);
  const Ln = ride.learn ? ride.learn(pp) : null;                       // tes trajets passés : côté de la route où tu roules d'habitude / position fiable sans route
  if (ride.snap) {
    tx = ride.snap.x; tz = ride.snap.z; db = Math.max(0.6, Math.min(3, ride.snap.r.w / 2 - 1)); ux = ride.snap.dx; uz = ride.snap.dz;
    if (Ln && Ln.consistent) { const nx = -uz, nz = ux, lat = (Ln.x - tx) * nx + (Ln.z - tz) * nz, mx = Math.max(0, ride.snap.r.w / 2 - 0.8), lc = Math.max(-mx, Math.min(mx, lat)) * Ln.conf; tx += nx * lc; tz += nz * lc; }
  } else {
    if (course) { ux = course[0]; uz = course[1]; }
    if (Ln) { tx += (Ln.x - tx) * 0.5 * Ln.conf; tz += (Ln.z - tz) * 0.5 * Ln.conf; }
  }
  const ex = tx - rig.position.x, ez = tz - rig.position.z, er = Math.hypot(ex, ez);
  if (er > 60) { if (now - ride.hardT > 4000) { rig.position.x = tx; rig.position.z = tz; ride.hardT = now; } return; }
  const al = ex * ux + ez * uz, cx = ex - al * ux, cz = ez - al * uz, cr = Math.hypot(cx, cz);       // « en travers » et « en avant » mesurés par rapport à la ROUTE
  if (cr > db) { const k = (1 - Math.exp(-dt / 0.6)) * (cr - db) / cr; rig.position.x += cx * k; rig.position.z += cz * k; }
  const dal = Math.max(1.5, Math.min(6, sig * 1.1));                  // zone morte en avant selon la précision du GPS (la vitesse de la roue est plus fiable)
  if (Math.abs(al) > dal) { const a2 = al - Math.sign(al) * dal, ka = 1 - Math.exp(-dt / 1.8); rig.position.x += ux * a2 * ka; rig.position.z += uz * a2 * ka; }
}

ride.learn = pp => {
  if (!settings.rideLog || !realData || !realData.back) return null;
  const now = performance.now(); if (ride._lt && now - ride._lt < 250) return ride._lv; ride._lt = now;
  const [la, lo] = realData.back(pp[0], pp[1]), c = rides.near(la, lo, 14);
  if (!c) return (ride._lv = null);
  const l = realData.loc(c.lat, c.lon);
  return (ride._lv = { x: l[0], z: l[1], conf: Math.min(1, (c.rides - 1) / 4), consistent: Math.hypot(c.hx, c.hz) / Math.max(1, c.n) > 0.6 });
};


let hitWhy = 'wall';
const hit = (x, z) => {
  if (world.real) {
    const k = world.api.hitKind(x, z); if (k) { hitWhy = k; return true; }
    if (world.api.inWater(x, z)) { hitWhy = 'water'; return true; }              // l'eau (hors pont) est infranchissable
  }
  for (const b of world.colliders || []) if (Math.abs(x - b.x) < b.hx && Math.abs(z - b.z) < b.hz) { hitWhy = 'wall'; return true; }
  return false;
};
const loc = (x, y, z, yaw, out) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  out.set(x * c + z * s, y, -x * s + z * c); return out;
};
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
let paused = false;                                              // v9.20 : pause (menu)
let lastNow = performance.now();
let last = performance.now(), time = 0, hudT = 0, spin = 0;

let fpsN = 0, fpsT = 0;
let last0 = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (!world) return;
  if (settings.fps) { fpsN++; if (now - fpsT > 500) { const e = $('#fps'); e.textContent = Math.round(fpsN * 1000 / (now - fpsT)) + ' FPS'; fpsN = 0; fpsT = now; } }
  const dt = paused ? 0 : Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  SL.frame(Math.min(0.25, (now - last0) / 1000), state.started && !paused && !document.hidden, !!(T.connected && T.connected())); last0 = now;
  const tel = state.started ? T.get() : null;
  const kbActive = state.started && (settings.kbAlways || !tel);

  // --- regard libre à la souris : la vue suit les mouvements de la souris (clic sur l'écran pour la capturer ; Échap pour la relâcher)
  if (state.started) {
    const rd = (now - lastNow) / 1000 || 0.016;
    mouse.idle += rd;
    if (settings.mouseReturn && mouse.idle > 1.2) { const k = Math.min(1, rd * 3.5); look.yaw -= look.yaw * k; look.pitch -= look.pitch * k; }
  } else { look.yaw = look.pitch = 0; }
  lastNow = now;
  // --- météo, oiseaux, confettis, rose des vents ; circulation (densité, feux, urgence) ; sirènes
  extras.update(dt, state.started, paused);
  if (state.started && world.traffic) {
    audio.weatherSync(X.rain, X.wind.s); audio.sirenSync(world.traffic.siren(), state.yaw + look.yaw);
    const c = world.traffic.takeCaught();
    if (c && !fall.on) { const last = policeHit(c); if (last) resetStars(); game.event('car'); audio.sfx('crash'); log('🚨 Arrêté par ' + ({ police: 'la police', ambulance: 'une ambulance', fire: 'les pompiers' }[c.g.userData.emg] || 'un véhicule d’urgence') + ' ! Fuis-les !'); startFall('car', Math.max(state.speed, 2)); }
  } else if (audio.ctx) { audio.weatherSync(0, 0); audio.sirenSync(null, 0); }
  edgeCheck(now);

  rideUpdate(now);
  if (settings.rideLog && settings.world === 'real' && realData && realData.back) { const q = ride.locked && kf.ok ? gpsPred() : [rig.position.x, rig.position.z], ll = realData.back(q[0], q[1]); rides.tick(now, ride.locked, ll[0], ll[1], state.speed, gps ? gps.acc : null); }
  // --- direction (+ = droite)
  let si = 0;
  if (state.started && gyro.on) si += gyro.norm(settings.steerSens) * (settings.steerInvert ? -1 : 1);
  if (kbActive) {
    if (kLeft()) si -= 1;
    if (kRight()) si += 1;
    si += joy.x;
  }
  if (ride.locked) si = ride.sv;                                    // en roulant pour vrai, le guidon affiché suit la vraie trajectoire (pas de braquage fantôme)
  state.steer += (clamp(si, -1, 1) - state.steer) * Math.min(1, dt * (X.slip ? 3.5 : 8));

  // --- vitesse (m/s)
  let target = state.speed, kbDirect = false;
  const jy = kbActive ? joy.y : 0;
  if (tel) {
    target = Math.min(50, tel.speed) / 3.6 * (ride.locked && ride.scaleOk ? ride.scale : settings.speedScale);   // en roulant pour vrai : l'échelle est apprise du GPS
    if (tel.lock) target = 0;
    if (ride.locked) { rideScale(dt, tel.speed / 3.6); if (ride.scaleOk && now - ride.saveT > 30000 && Math.abs(ride.scale - settings.speedScale) > 0.02) { ride.saveT = now; set('speedScale', Math.round(ride.scale * 100) / 100); } }
  } else if (kbActive) {
    kbDirect = true;                                                // accélération directe (pas de double lissage) : fluide, pilotée par l'accélérateur
    const VMAX = 12, v = state.speed, accel = 3.6 * (1 - 0.55 * v / VMAX) + 0.6;
    if (kUp()) target = Math.min(VMAX, v + accel * dt);
    else if (jy > 0.12) { const want = VMAX * jy; target = v < want ? Math.min(want, v + accel * dt) : Math.max(want, v - 3 * dt); }
    else if (kDown() || keys.Space || jy < -0.25) target = Math.max(0, v - (X.slip ? 5 : 9) * dt);
    else target = Math.max(0, v - (0.8 + 0.12 * v) * dt);           // roue libre
  } else target = Math.max(0, state.speed - 1.6 * dt);
  if (ride.locked && !tel) target = gpsSpeed();                      // roule pour vrai sans le scooter connecté : la vitesse vient du GPS
  const prev = state.speed;
  state.speed += (target - state.speed) * (kbDirect ? 1 : Math.min(1, dt * 6));
  state.brake = (prev - state.speed) / Math.max(dt, 0.001) > 2.2 || (kbActive && (kDown() || keys.Space || jy < -0.25));
  iceFallCooldown = Math.max(0, iceFallCooldown - dt);
  const icy = world.preset === 'snow' || settings.season === 'winter';
  if (settings.falls && icy && state.started && !fall.on && !air.active && state.speed > 4.5 && iceFallCooldown <= 0) {
    const cold = clamp((18 - (+settings.temperature || 0)) / 18, 0.18, 1.45);
    const chance = dt * 0.00007 * state.speed * state.speed * (0.72 + Math.abs(state.steer) * 0.65) * cold;
    if (Math.random() < chance) { startFall('ice', state.speed); iceFallCooldown = 50 + Math.random() * 100; }
  }

  // --- chute en cours : on est au sol ; puis on est remis sur la piste et on se relève
  let fpose = 0;
  if (fall.on) {
    fall.t += dt; state.speed = 0; state.brake = false;
    if (fall.t >= FALL_UP && !fall.moved) { fall.moved = true; respawnOnLane(); }
    if (fall.t >= FALL_DUR) fall.on = false;
    else fpose = fall.t < FALL_DOWN ? ease(fall.t / FALL_DOWN) : fall.t < FALL_UP ? 1 : 1 - ease((fall.t - FALL_UP) / (FALL_DUR - FALL_UP));
  }

  // --- cap : un guidon à DROITE fait tourner à DROITE (l'angle yaw diminue)
  if (!(ride.locked && rideYaw(dt))) state.yaw -= state.steer * 1.5 * Math.min(1, state.speed / 2) / (1 + state.speed * 0.04) * dt;

  if (!ride.locked) state.yaw += X.wind.yaw * dt;                    // tornade : le vent fait dériver le cap, même guidon bien droit
  // --- avance : l'avant de la trottinette est -Z local  =>  (-sin yaw, -cos yaw)
  const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
  const px = rig.position.x, pz = rig.position.z;
  let vx = fx * state.speed, vz = fz * state.speed;
  snowSlideCooldown = Math.max(0, snowSlideCooldown - dt);
  snowSlide = Math.max(0, snowSlide - dt);
  if (world.preset === 'snow' && !ride.locked && state.speed > 4.2 && Math.abs(state.steer) > 0.52 && snowSlideCooldown <= 0 && Math.random() < dt * 0.48) { snowSlide = 0.85; snowSlideCooldown = 3.5 + Math.random() * 4.5; }
  const drifting = X.slip || snowSlide > 0;
  if (drifting && !ride.locked) {
    const side = snowSlide > 0 ? Math.sign(state.steer || 1) : 0, lateral = side * state.speed * 0.2;
    const tx = fx * state.speed + Math.cos(state.yaw) * lateral, tz = fz * state.speed - Math.sin(state.yaw) * lateral;
    const g = Math.min(1, dt * (snowSlide > 0 ? 1.45 : 2.3)); slide.x += (tx - slide.x) * g; slide.z += (tz - slide.z) * g; vx = slide.x; vz = slide.z;
  } else { slide.x = vx; slide.z = vz; }
  if (!ride.locked) { vx += X.wind.x; vz += X.wind.z; }                // tornade : « magnétisme » du vent vers le monstre
  const nx = px + vx * dt, nz = pz + vz * dt;
  let moved = false, blocked = 0;
  const v0 = state.speed;
  // garde-fous : l'eau (hors pont) et le vide de chaque côté d'un pont sont infranchissables, MÊME en roulant pour vrai (GPS)
  const wa0 = world.api, onB0 = wa0.onBridge(px, pz), inW0 = wa0.inWater(px, pz);
  const guard = (x, z) => {
    if (!inW0 && wa0.inWater(x, z)) return 'water';
    if (wa0.bridgeLeave) { const bl = wa0.bridgeLeave(px, pz, rig.position.y, x, z); if (bl) return bl; }    // garde-corps du pont : infranchissable
    if (wa0.bridgeCeiling && wa0.bridgeCeiling(x, z, wa0.elev(x, z), rig.position.y, 1.7)) return 'ceiling';
    return null;
  };
  const hitf = (x, z) => {
    const g = guard(x, z); if (g) { hitWhy = g; return true; }
    return ride.locked ? false : hit(x, z);                             // en roulant pour vrai, le GPS a raison : pas de mur invisible (bâtiments, arbres)
  };
  if (!hitf(nx, pz)) { rig.position.x = nx; moved = true; } else blocked++;
  if (!hitf(rig.position.x, nz)) { rig.position.z = nz; moved = true; } else blocked++;
  if (blocked && v0 > 1.5) {
    if (hitWhy === 'water' || hitWhy === 'rail' || hitWhy === 'ceiling') { bump(); if (now - ride.waterLog > 3000) { ride.waterLog = now; log(hitWhy === 'rail' ? 'Garde-corps : on ne quitte pas le pont.' : hitWhy === 'ceiling' ? 'Dessous du pont : passage trop bas.' : 'Plan d’eau : on ne roule pas dessus.'); } }
    else if (settings.falls && !fall.on) startFall(hitWhy, v0);     // on percute un bâtiment : on tombe
    else for (let i = 0; i < blocked; i++) bump();
  }
  if (!moved) state.speed *= 0.5;
  const lim = world.real ? world.size / 2 - 30 : SIZE * 0.48;
  rig.position.x = clamp(rig.position.x, -lim, lim); rig.position.z = clamp(rig.position.z, -lim, lim);
  state.dist += state.speed * dt;
  rig.rotation.y = state.yaw;
  {                                                                  // vraie gravité, pente du terrain et surfaces des rampes
    const wa = world.api, px0 = px, pz0 = pz, qx = rig.position.x, qz = rig.position.z;
    const floorAt = (x, z, cy) => {
      let y = wa && wa.hasRelief ? wa.surf(x, z, cy) : 0;
      const ramp = world.rampAt ? world.rampAt(x, z) : null;
      if (ramp && ramp.y > y) y = ramp.y;
      return { y, ramp };
    };
    const before = floorAt(px0, pz0, rig.position.y), after = floorAt(qx, qz, rig.position.y);
    const onBridge = !!(wa && wa.deckY && wa.deckY(px0, pz0) != null);
    const grounded = !air.active && rig.position.y <= before.y + 0.18;
    if (air.requested) {
      air.requested = false;
      if (jumpAllowed() && state.started && !fall.on && grounded && !onBridge && state.speed > 0.8) { air.active = true; air.vy = 4.7; }
    }
    if (jumpAllowed() && !air.active && before.ramp && before.ramp.t > 0.82 && !after.ramp && state.speed > 4.5) {
      const along = (vx * before.ramp.dirX + vz * before.ramp.dirZ) / Math.max(0.01, Math.hypot(vx, vz));
      if (along > 0.35) { air.active = true; air.vy = 4.6; state.bump = Math.max(state.bump, 0.25); }
    }
    if (air.active) {
      air.vy -= 9.81 * dt; rig.position.y += air.vy * dt;
      if (rig.position.y <= after.y) { const impact = Math.abs(air.vy); rig.position.y = after.y; air.active = false; air.vy = 0; air.cooldown = 0.3; state.bump = Math.max(state.bump, Math.min(1, impact / 8)); scooter.setLanding(Math.min(1, impact / 8)); }
    } else rig.position.y = after.y;
    air.cooldown = Math.max(0, air.cooldown - dt);
    const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
    const ahead = floorAt(qx + fx * 1.5, qz + fz * 1.5, rig.position.y).y, behind = floorAt(qx - fx * 1.5, qz - fz * 1.5, rig.position.y).y;
    const sl = (ahead - behind) / 3;
    state.slope += (sl - state.slope) * Math.min(1, dt * 5);
    rig.rotation.x = settings.slopeTilt ? Math.atan(state.slope) : 0;
  }
  state.bump = Math.max(0, state.bump - dt * 3);

  // --- cyclistes, piétons, véhicules : on peut les percuter (ils tombent, et nous aussi)
  state.hitCd = Math.max(0, state.hitCd - dt);
  if (settings.hitCyclists && state.started && !fall.on && state.hitCd <= 0) {
    const m = world.hitMobile(rig.position.x, rig.position.z, rig.position.y);
    if (m) {
      const v = state.speed;
      world.knockMobile(m, m.ref.x - rig.position.x, m.ref.z - rig.position.z);
      state.hitCd = 0.9;
      SL.note('hit', m.type); game.event(m.type === 'cyc' ? 'cyclist' : m.type); audio.sfx('bonk');
      log({ cyc: 'Cycliste percuté !', ped: 'Piéton percuté !', car: 'Véhicule percuté !' }[m.type]);
      if (v > 1.5 || m.type === 'car') startFall(m.type === 'cyc' ? 'cyclist' : m.type, v); else bump();
    }
  }

  // --- feux
  const headOn = tel ? !!tel.head : (state.head || (settings.autoLights && world.night));
  const tailOn = tel ? !!tel.tail : headOn;
  spin = state.speed / 0.13 * dt;
  scooter.update(state.steer, spin, headOn, tailOn, state.brake && state.speed > 0.3, state.speed);
  scooter.setFall(fpose, fall.side);

  // --- caméra
  const fp = settings.view === 'fp' && state.started;
  if (!state.started) {                                              // décor du menu : tour de la trottinette
    const a = time * 0.28 + state.yaw;
    camera.position.set(rig.position.x + Math.cos(a) * 4.6, 1.9 + rig.position.y, rig.position.z + Math.sin(a) * 4.6);
    camera.lookAt(rig.position.x, 0.9 + rig.position.y, rig.position.z);
  } else if (fp) {
    const BA = +settings.bobAmt, bob = Math.sin(now * 0.012 * (1 + state.speed)) * Math.min(0.012, state.speed * 0.004) * BA;
    loc(0, 1.5 + bob + Math.sin(now * 0.07) * 0.01 * state.bump * BA - fpose * 1.1, -0.02 - fpose * 0.4, state.yaw, _v);
    camera.position.set(rig.position.x + _v.x, _v.y + rig.position.y, rig.position.z + _v.z);
    camera.rotation.set(look.pitch - 0.2 + (settings.slopeTilt ? Math.atan(state.slope) * 0.8 : 0) - fpose * 0.45 + Math.sin(now * 0.05) * 0.015 * state.bump * +settings.bobAmt, state.yaw + look.yaw, -state.steer * 0.12 * Math.min(1, state.speed / 5) + fall.side * fpose * 1.2);
  } else {
    let d = state.yaw - state.camYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    state.camYaw += d * Math.min(1, dt * 4);
    loc(0, settings.camHeight - look.pitch * 1.6, settings.camDist, state.camYaw + look.yaw, _v);
    camera.position.set(rig.position.x + _v.x, _v.y + rig.position.y, rig.position.z + _v.z);
    loc(0, 1.1 + look.pitch * 4, look.yaw || look.pitch ? 0 : -4, state.camYaw + look.yaw, _w);
    camera.lookAt(rig.position.x + _w.x, _w.y + rig.position.y, rig.position.z + _w.z);
  }
  if (X.shake > 0.01) { const k = X.shake; camera.position.x += (Math.random() - 0.5) * 0.14 * k; camera.position.y += (Math.random() - 0.5) * 0.1 * k; camera.rotation.z += (Math.random() - 0.5) * 0.03 * k; }
  if (ride.locked && !fall.on) rideMove(dt, now);                  // carte réelle, en roulant pour vrai : recalage sur le GPS / la route
  world.tick(dt, rig.position.x, rig.position.z, camera);
  game.update(dt, rig.position.x, rig.position.z, state.yaw, !panel.hidden || paused);
  free.update(dt, rig.position.x, rig.position.z, state.yaw, rig.position.y, !panel.hidden || paused);
  audio.update(paused ? 0 : state.speed); audio.musicSync(); hudExtras(now); if (pendingFull) swapFull(now);

  // --- HUD (≈ 15 fois / s)
  if (state.started && now - hudT > 66) {
    hudT = now;
    const kmh = state.speed * 3.6;
    $('#sp').textContent = kmh.toFixed(1);
    $('#arc').setAttribute('stroke-dashoffset', String(100 - clamp(kmh / 40, 0, 1) * 100));
    $('#mbat').textContent = tel ? 'Batterie ' + tel.bat + ' %' : 'Batterie --';
    $('#mgear').textContent = tel ? 'Mode ' + tel.gear : 'Mode --';
    const lane = world.real ? world.api.onLane(rig.position.x, rig.position.z) : onLane(rig.position.x, rig.position.z);
    $('#mlane').textContent = lane ? (world.real ? 'Sur route ✓' : 'Sur piste ✓') : (world.real ? 'Hors route' : 'Hors piste'); $('#mlane').className = 'chip ' + (lane ? 'ok' : 'warn');
    { const sj = !!settings.joystick && !tel; $('#joy').hidden = !sj; $('#hud').classList.toggle('joyOn', sj); if (!sj) { joy.x = joy.y = 0; } }
    $('#jumpBtn').hidden = !state.started || !jumpAllowed();
    { const ms = $('#mslope'), rel = !!(world.api && world.api.hasRelief); ms.hidden = !rel;
      if (rel) { const pc = state.slope * 100; ms.textContent = (pc >= 0.5 ? '▲ ' : pc <= -0.5 ? '▼ ' : '▬ ') + Math.abs(pc).toFixed(0) + ' %'; } }
    { const drift = $('#mslide'); drift.hidden = !(world.preset === 'snow' && snowSlide > 0); }
    $('#mdist').textContent = (state.dist / 1000).toFixed(2) + ' km';
    $('#sn').style.left = (50 + state.steer * 46) + '%';
    if (gyro.on && !gyro.calibrated) { $('#mgyro').textContent = 'Gyro : à calibrer'; $('#mgyro').className = 'chip warn'; }
    if (settings.showMap) drawMap();
  }
  renderFrame(dt);
}
function bump() {
  if (state.bump < 0.2) audio.thump();
  state.bump = 1; state.speed *= 0.6;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  if (fxResize) fxResize();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = performance.now(); if (state.started) audio.start(); } });

applyTheme(); applyToggles(); applyView();
rebuildWorld(() => { log('Ville chargée. Gyro + BLE pour le vrai stand, clavier pour tester.'); });
requestAnimationFrame(frame);

window.__okSim = true;   // le module a fini de se charger (sert au détecteur d’erreurs de jeu.html)
