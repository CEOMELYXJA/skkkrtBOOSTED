import { settings, set, reset, onChange, WORLD_LIST, FONTS } from './settings.js';

const syncs = [];
onChange(() => syncs.forEach(f => f()));

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export function worldPicker(root) {
  root.innerHTML = WORLD_LIST.map(w =>
    `<button type="button" class="wcard" data-w="${w.id}" style="--a:${w.sw[0]};--b:${w.sw[1]};--c:${w.sw[2]}"><i></i><span>${w.icon} ${w.name}</span></button>`).join('');
  root.addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (b) set('world', b.dataset.w); });
  const sync = () => root.querySelectorAll('[data-w]').forEach(b => b.classList.toggle('on', b.dataset.w === settings.world));
  syncs.push(sync); sync();
}

export function segment(root, key, opts) {
  root.classList.add('seg');
  root.innerHTML = opts.map(o => `<button type="button" data-v="${o[0]}">${o[1]}</button>`).join('');
  root.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) set(key, b.dataset.v); });
  const sync = () => root.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === String(settings[key])));
  syncs.push(sync); sync();
}

function field(parent, label) {
  const row = h('div', 'row'); row.append(h('label', null, label)); parent.append(row); return row;
}
function range(parent, label, key, min, max, step, fmt = v => v) {
  const row = field(parent, label);
  const out = h('output'), inp = h('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
  inp.addEventListener('input', () => set(key, +inp.value));
  row.append(inp, out);
  const sync = () => { inp.value = settings[key]; out.textContent = fmt(+settings[key]); };
  syncs.push(sync); sync();
}
function toggle(parent, label, key) {
  const row = field(parent, label);
  const b = h('button', 'sw'); b.type = 'button'; b.setAttribute('role', 'switch');
  b.addEventListener('click', () => set(key, !settings[key]));
  row.append(b);
  const sync = () => { b.classList.toggle('on', !!settings[key]); b.setAttribute('aria-checked', !!settings[key]); };
  syncs.push(sync); sync();
}
function group(root, title) { const g = h('section', 'grp'); g.append(h('h3', null, title)); root.append(g); return g; }

export function buildPanel(root, cb) {
  root.tabIndex = -1;
  root.innerHTML = '';
  const head = h('div', 'phead', '<b>Réglages</b>');
  const close = h('button', 'x', '✕'); close.type = 'button'; close.setAttribute('aria-label', 'Fermer'); close.onclick = () => cb.close();
  head.append(close); root.append(head);
  const body = h('div', 'pbody'); root.append(body);

  let g = group(body, 'Monde'); const wp = h('div', 'worlds'); g.append(wp); worldPicker(wp);
  g.append(h('label', 'lbl', 'Parcours de la ville imaginaire'));
  const presetRow = h('div', 'preset-options'); g.append(presetRow); segment(presetRow, 'preset', [['city', '🏙 Ville + pont'], ['skate', '🛹 Skatepark'], ['mountain', '⛰ Sentier montagne'], ['f1', '🏎 Circuit F1'], ['snow', '❄️ Motoneige'], ['sky', '☁️ Relais dans le ciel']]);
  g.append(h('label', 'lbl', 'Saison (toutes les cartes)'));
  const rs = h('div'); g.append(rs); segment(rs, 'season', [['summer', '☀️ Été'], ['winter', '❄️ Hiver'], ['spring', '🌱 Printemps'], ['autumn', '🍂 Automne']]);
  range(g, 'Température de l’air', 'temperature', -20, 35, 1, v => v + ' °C');
  g.append(h('p', 'hint', 'Sur la neige et en hiver, une température plus froide rend les glissades et les chutes plus probables. La piste de motoneige garde sa neige au sol toute l’année.'));
  g.append(h('label', 'lbl', 'Moment de la journée'));
  const rm = h('div'); g.append(rm); segment(rm, 'tod', [['day', '🌞 Jour'], ['dusk', '🌇 Soir'], ['night', '🌙 Nuit']]);
  g.append(h('label', 'lbl', 'Lumière des bâtiments et des lampes'));
  const rg = h('div'); g.append(rg); segment(rg, 'glow', [['normal', 'Normale (discrète)'], ['neon', '🌈 Néon (très éclairé)']]);
  toggle(g, 'Mini-carte : vraies tuiles OpenStreetMap (comme la 2D)', 'miniOsm');
  g.append(h('label', 'lbl', 'Relief du terrain (pentes réelles)'));
  const rl = h('div'); g.append(rl); segment(rl, 'relief', [['0', 'Plat'], ['1', 'Réel'], ['2', 'Accentué ×2']]);
  toggle(g, 'Recaler sur le GPS quand je roule vraiment', 'gpsSync');
  toggle(g, 'Aimant à la route (en roulant vraiment : cap et position suivent la route, le guidon n’est plus utilisé)', 'roadSnap');
  g.append(h('label', 'lbl', 'Taille de la carte réelle'));
  const rr = h('div'); g.append(rr); segment(rr, 'mapRadius', [['800', '800 m (chargement local rapide)'], ['1500', '1,5 km (zone élargie)']]);
  g.append(h('p', 'hint', 'Version 3D : v9.41 · 6 parcours'));
  const nc = h('button', 'btn', '🎲 Nouvelle ville imaginaire (aléatoire)'); nc.type = 'button'; nc.onclick = () => cb.newCity(); g.append(nc);
  const rc = h('button', 'btn', '📍 Recharger la carte à ma position'); rc.type = 'button'; rc.onclick = () => cb.recenter(false); g.append(rc);
  const rf = h('button', 'btn ghost', '🧹 Tout re-télécharger (ignorer la mémoire)'); rf.type = 'button'; rf.onclick = () => cb.recenter(true); g.append(rf);

  g = group(body, 'Personnage');
  g.append(h('label', 'lbl', 'Cheveux et casque'));
  const hair = h('div'); g.append(hair); segment(hair, 'riderHair', [['helmet', '🪖 Casque'], ['bald', 'Crâne rasé'], ['short', 'Cheveux courts'], ['medium', 'Mi-longs'], ['long', 'Très longs']]);
  toggle(g, 'Lunettes', 'riderGlasses');
  g.append(h('label', 'lbl', 'Teint'));
  const skin = h('div'); g.append(skin); segment(skin, 'riderSkin', [['light', 'Peau claire'], ['dark', 'Peau foncée']]);
  const vest = field(g, 'Couleur du gilet'); const vestColor = h('input'); vestColor.type = 'color'; vestColor.value = settings.riderVest; vestColor.setAttribute('aria-label', 'Couleur du gilet'); vest.append(vestColor);
  vestColor.addEventListener('input', () => set('riderVest', vestColor.value));
  syncs.push(() => { vestColor.value = settings.riderVest || '#202a36'; });

  g = group(body, 'Jeu');
  const gm = h('div'); g.append(gm); segment(gm, 'gameMode', [['ctf', '🚩 Capture de drapeaux'], ['free', 'Balade libre']]);
  g.append(h('label', 'lbl', 'Difficulté'));
  const gd = h('div'); g.append(gd); segment(gd, 'difficulty', [['easy', 'Facile'], ['med', 'Moyen'], ['hard', 'Difficile']]);
  toggle(g, 'Enregistrer chacun de mes trajets (endroits favoris avec pièce + drapeau, et GPS plus précis à chaque sortie)', 'rideLog');
  g.append(h('label', 'lbl', 'Urgences : police, ambulances, pompiers (sirènes)'));
  const sp = h('div'); g.append(sp); segment(sp, 'special', [['auto', 'Auto (en difficile)'], ['off', 'Aucune'], ['emergency', '🚒 Urgence'], ['chase', '🚨 Criminel : fuis !']]);
  toggle(g, 'Chute en percutant un bâtiment ou un arbre', 'falls');
  toggle(g, 'Collision avec cyclistes, piétons et véhicules', 'hitCyclists');
  const cb2 = h('button', 'btn', 'Effacer les records'); cb2.type = 'button'; cb2.onclick = () => cb.clearBest(); g.append(cb2);

  g.append(h('label', 'lbl', 'Journal des parties (gardé sur ton appareil, en arrière-plan)'));
  const jr = h('button', 'btn', '📋 Copier le rapport de mes parties'); jr.type = 'button'; jr.onclick = () => cb.sessionReport(); g.append(jr);
  const jc = h('button', 'btn ghost', 'Effacer le journal des parties'); jc.type = 'button'; jc.onclick = () => cb.sessionClear(); g.append(jc);
  const rb = h('button', 'btn', 'Mes trajets et mes points'); rb.type = 'button'; rb.onclick = () => cb.rideStats(); g.append(rb);
  const clearRidesBtn = h('button', 'btn ghost', 'Effacer l’historique des trajets'); clearRidesBtn.type = 'button'; clearRidesBtn.onclick = () => cb.clearRides(); g.append(clearRidesBtn);
  const clearFreeBtn = h('button', 'btn ghost', 'Remettre à zéro les points de la balade libre'); clearFreeBtn.type = 'button'; clearFreeBtn.onclick = () => cb.clearFree(); g.append(clearFreeBtn);

  g = group(body, 'Vue');
  const v = h('div'); g.append(v); segment(v, 'view', [['fp', '1re personne'], ['tp', '2e personne']]);
  range(g, 'Opacité de la vue 3D (en dessous de 100 %, la caméra arrière apparaît derrière)', 'viewOpacity', 20, 100, 5, x => x + ' %');
  range(g, 'Champ de vision', 'fov', 50, 100, 1, x => x + '°');
  range(g, 'Distance caméra (2e pers.)', 'camDist', 2.5, 9, 0.1, x => x.toFixed(1) + ' m');
  range(g, 'Hauteur caméra (2e pers.)', 'camHeight', 1.2, 4.5, 0.1, x => x.toFixed(1) + ' m');
  range(g, 'Secousses de la caméra (1re pers.)', 'bobAmt', 0, 3, 0.1, x => x === 0 ? 'aucune' : '×' + x.toFixed(1));
  toggle(g, 'Inclinaison de la trottinette dans les pentes', 'slopeTilt');

  g = group(body, 'Police');
  const f = h('div', 'fonts'); g.append(f);
  f.innerHTML = FONTS.map(o => `<button type="button" data-f="${o.id}" style="font-family:${o.css}">${o.name}</button>`).join('');
  f.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) set('font', b.dataset.f); });
  syncs.push(() => f.querySelectorAll('[data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === settings.font)));

  g = group(body, 'Apparence');
  const row = field(g, 'Couleur d’accent');
  const col = h('input'); col.type = 'color'; col.addEventListener('input', () => set('accent', col.value)); row.append(col);
  syncs.push(() => { col.value = settings.accent; });
  const q = h('div'); g.append(h('label', 'lbl', 'Qualité graphique'), q);
  segment(q, 'quality', [['low', 'Basse'], ['med', 'Moyenne'], ['high', 'Haute'], ['ultra', 'Ultra']]);
  toggle(g, 'Circulation (cyclistes, piétons, véhicules)', 'traffic');
  g.append(h('label', 'lbl', 'Quantité de circulation'));
  const tl = h('div'); g.append(tl); segment(tl, 'trafficLevel', [['few', 'Peu'], ['some', 'Moyenne'], ['busy', 'Dense']]);
  g.append(h('label', 'lbl', 'Feux aux carrefours'));
  const tg = h('div'); g.append(tg); segment(tg, 'trafficLights', [['off', 'Aucun'], ['arcade', 'Arcade (partout)'], ['real', 'Réels (OpenStreetMap)']]);
  g.append(h('p', 'hint', 'Feux réels : seulement ceux qui existent vraiment sur la carte (après « Tout re-télécharger » pour les cartes déjà en mémoire).'));

  g = group(body, 'Ambiance & météo');
  g.append(h('label', 'lbl', 'Météo'));
  const wx = h('div'); g.append(wx); segment(wx, 'weather', [['clear', '☀️ Beau temps'], ['storm', '⛈ Orage'], ['tornado', '🌪 Tornade']]);
  g.append(h('p', 'hint', 'Orage : pluie, éclairs, tonnerre, route glissante et visière (bouton 🥽 en haut). Tornade : un entonnoir géant attire la trottinette, même guidon bien droit.'));
  toggle(g, 'Oiseaux (qui volent autour et chantent)', 'birds');
  toggle(g, 'Confettis aux récompenses', 'confetti');
  toggle(g, 'Rose des vents (petite, semi-transparente)', 'showRose');
  toggle(g, 'Porte-gobelet noir sur le guidon (à droite)', 'cupHolder');
  toggle(g, 'Carte réelle : se recharger toute seule près du bord de la carte', 'autoMapRefresh');
  toggle(g, 'Souris : le regard revient au centre quand tu arrêtes de la bouger', 'mouseReturn');

  g = group(body, 'Résolution & performance');
  g.append(h('label', 'lbl', 'Netteté des textures (fenêtres, asphalte, herbe)'));
  const trg = h('div'); g.append(trg); segment(trg, 'texRes', [['1', 'Normale'], ['2', 'Fine ×2'], ['4', 'Ultra ×4'], ['8', 'Extrême ×8']]);
  g.append(h('label', 'lbl', 'Filtrage des textures vues de biais (sol, routes)'));
  const ang = h('div'); g.append(ang); segment(ang, 'aniso', [['4', '×4'], ['8', '×8'], ['16', '×16']]);
  toggle(g, 'Rendu Premium (ciel réaliste, matières en relief, vitres et carrosserie qui reflètent)', 'premium');
  toggle(g, 'Nature réaliste (gazon en brins, arbres à feuillage, briques / crépi / asphalte, ciel et brume) — demande le rendu Premium', 'nature');
  g.append(h('label', 'lbl', 'Gazon (brins autour de toi)'));
  const grg = h('div'); g.append(grg); segment(grg, 'grass', [['0', 'Aucun'], ['auto', 'Auto'], ['med', 'Moyen'], ['high', 'Dense'], ['ultra', 'Très dense']]);
  toggle(g, 'Effets cinéma (reflets, halo lumineux, étalonnage)', 'fx');
  toggle(g, 'Ombrage ambiant (profondeur façon jeu AAA)', 'ssao');
  g.append(h('label', 'lbl', 'Ombres'));
  const sqg = h('div'); g.append(sqg); segment(sqg, 'shadowQ', [['auto', 'Auto'], ['off', 'Aucune'], ['1024', '1024'], ['2048', '2048'], ['4096', '4096'], ['8192', '8192']]);
  range(g, 'Distance des ombres', 'shadowDist', 24, 120, 4, x => x + ' m');
  range(g, 'Distance de vue (brouillard)', 'viewDist', 0.5, 2, 0.05, x => '×' + x.toFixed(2));
  range(g, 'Distance de vue du gazon et des bois', 'lawnDist', 1, 3, 0.25, x => '×' + x.toFixed(2));
  range(g, 'Luminosité', 'exposure', 0.6, 1.6, 0.05, x => '×' + x.toFixed(2));
  toggle(g, 'Afficher les images par seconde (FPS)', 'fps');
  g.append(h('p', 'hint', 'Résolution ×3, textures Ultra et ombres 4096 sont très nets mais lourds : si ça saccade, baisse-les d’abord.'));

  g = group(body, 'Routes & bâtiments (carte réelle 📍)');
  toggle(g, 'Marquage routier (lignes, passages piétons)', 'roadMarks');
  toggle(g, 'Trottoirs le long des rues', 'sidewalks');
  toggle(g, 'Toits en pente et cheminées (maisons)', 'roofs');
  toggle(g, 'Lampadaires le long des rues', 'streetLamps');
  g.append(h('label', 'lbl', 'Densité des arbres'));
  const tdg = h('div'); g.append(tdg); segment(tdg, 'treeDensity', [['0', 'Aucun'], ['0.5', 'Peu'], ['1', 'Normal'], ['2', 'Dense']]);
  g.append(h('label', 'lbl', 'Distance d’affichage des bâtiments'));
  const brg = h('div'); g.append(brg); segment(brg, 'bldRad', [['0', 'Auto'], ['2', '500 m'], ['3', '750 m'], ['4', '1 km'], ['5', '1,25 km'], ['6', '1,5 km']]);

  g = group(body, 'Guidon & vitesse');
  range(g, 'Sensibilité du guidon', 'steerSens', 0.5, 2.5, 0.05, x => '×' + x.toFixed(2));
  toggle(g, 'Inverser le guidon', 'steerInvert');
  range(g, 'Échelle de vitesse', 'speedScale', 0.5, 2.5, 0.05, x => '×' + x.toFixed(2));
  const cal = h('button', 'btn', 'Calibrer le guidon (droit)'); cal.type = 'button'; cal.onclick = cb.calibrate; g.append(cal);
  toggle(g, 'Clavier toujours actif, même avec le scooter (flèches ou W A S D = conduire ; souris = regarder partout ; sans scooter il est déjà actif)', 'kbAlways');
  const home = h('button', 'btn', 'Retour au départ'); home.type = 'button'; home.onclick = cb.home; g.append(home);

  g = group(body, 'Affichage');
  toggle(g, 'Mini-carte', 'showMap');
  g.append(h('label', 'lbl', 'Taille de la mini-carte'));
  const msg = h('div'); g.append(msg); segment(msg, 'mapSize', [['0', 'Auto'], ['96', 'Petite'], ['132', 'Moyenne'], ['180', 'Grande'], ['240', 'Très grande']]);
  range(g, 'Portée de la mini-carte', 'mapRange', 30, 140, 5, x => x + ' m');
  toggle(g, 'Jauge de vitesse', 'showGauge');
  toggle(g, 'Messages système', 'showLog');
  toggle(g, 'Phare auto (monde de nuit)', 'autoLights');
  toggle(g, 'Joystick tactile (si la trottinette n’est pas connectée)', 'joystick');
  g = group(body, 'Son');
  toggle(g, 'Son du moteur', 'sound');
  range(g, 'Volume du moteur', 'volume', 0, 1, 0.05, x => Math.round(x * 100) + ' %');
  toggle(g, 'Musique d’arcade (course aux pièces)', 'music');
  range(g, 'Volume de la musique', 'musicVolume', 0, 1, 0.05, x => Math.round(x * 100) + ' %');
  toggle(g, 'Sons du jeu (pièces, drapeaux, chute, choc)', 'sfx');
  range(g, 'Volume des sons du jeu', 'sfxVolume', 0, 1, 0.05, x => Math.round(x * 100) + ' %');

  const resetBtn = h('button', 'btn ghost', 'Réinitialiser les réglages'); resetBtn.type = 'button'; resetBtn.onclick = () => reset(); body.append(resetBtn);
  // v9.30 : réglages classés en 4 onglets dans un carré au centre de l'écran
  const TABS = [['son', '🔊 Son'], ['image', '🎨 Image et graphisme'], ['ctrl', '🎮 Contrôles'], ['autre', '⚙️ Autre']];
  const OF = { 'Son': 'son', 'Guidon & vitesse': 'ctrl', 'Jeu': 'autre' };
  Array.from(body.children).forEach(el => { const t = el.tagName === 'SECTION' ? (el.querySelector('h3') || {}).textContent : ''; el.dataset.tab = OF[t] || (el.tagName === 'SECTION' ? 'image' : 'autre'); });
  const bar = h('div', 'ptabs'); root.insertBefore(bar, body);
  const show = k => { try { sessionStorage.setItem('panelTab', k); } catch {} Array.from(bar.children).forEach(b => b.classList.toggle('on', b.dataset.k === k)); Array.from(body.children).forEach(el => { el.hidden = el.dataset.tab !== k; }); body.scrollTop = 0; };
  TABS.forEach(([k, t]) => { const b = h('button', null, t); b.type = 'button'; b.dataset.k = k; b.onclick = () => show(k); bar.append(b); });
  let first = 'image'; try { first = sessionStorage.getItem('panelTab') || 'image'; } catch {}
  show(TABS.some(t => t[0] === first) ? first : 'image');
  syncs.forEach(s => s());
  root.addEventListener('keydown', e => {
    if (root.hidden) return;
    const directions = {
      ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
      ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0]
    };
    const dir = directions[e.code]; if (!dir) return;
    const active = document.activeElement;
    if (!root.contains(active)) {
      (root.querySelector('.ptabs button') || root).focus(); e.preventDefault(); return;
    }
    if (active.matches('input[type="range"]')) {
      if (e.code === 'KeyA' || e.code === 'KeyD') {
        const step = Number(active.step) || 1, lo = Number(active.min), hi = Number(active.max);
        active.value = String(Math.max(lo, Math.min(hi, Number(active.value) + dir[0] * step)));
        active.dispatchEvent(new Event('input', { bubbles: true })); e.preventDefault(); return;
      }
      if (e.key.startsWith('Arrow')) return;
    }
    const segment = active.closest('.seg');
    if (dir[0] && segment && active.matches('button')) {
      const choices = Array.from(segment.querySelectorAll('button')).filter(b => !b.closest('[hidden]'));
      const i = choices.indexOf(active), next = choices[(i + dir[0] + choices.length) % choices.length];
      if (next) { next.focus(); next.click(); }
      e.preventDefault(); return;
    }
    const controls = Array.from(root.querySelectorAll('button:not(:disabled), input:not(:disabled)')).filter(el => !el.closest('[hidden]'));
    const r = active.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of controls) {
      if (el === active) continue;
      const q = el.getBoundingClientRect(), cx = q.left + q.width / 2, cy = q.top + q.height / 2;
      const primary = dir[0] ? (dir[0] > 0 ? cx - x : x - cx) : (dir[1] > 0 ? cy - y : y - cy);
      if (primary < 2) continue;
      const secondary = dir[0] ? Math.abs(cy - y) : Math.abs(cx - x);
      const score = primary + secondary * 1.8;
      if (score < bestScore) { best = el; bestScore = score; }
    }
    if (!best && (dir[1] > 0 || dir[0] > 0)) best = controls[0];
    if (!best && (dir[1] < 0 || dir[0] < 0)) best = controls[controls.length - 1];
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    e.preventDefault();
  });
}
