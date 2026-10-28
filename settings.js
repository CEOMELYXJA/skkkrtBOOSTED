// Réglages persistants du jeu (localStorage) + petit bus d'évènements
const KEY = 'skkkrt3d.v2';

export const WORLD_LIST = [
  { id: 'day',    name: 'Ville imaginaire', icon: '🏙', sw: ['#2f86d6', '#bcdcf2', '#7dbb62'] },
  { id: 'real',   name: 'Ma position (carte réelle)', icon: '📍', sw: ['#4da3ff', '#e9e1d3', '#46e08a'] }
];

export const FONTS = [
  { id: 'inter',   name: 'Normale',      css: "Inter, -apple-system, system-ui, sans-serif" },
  { id: 'orbitron',name: 'Digitale',     css: "Orbitron, 'Segoe UI', sans-serif" },
  { id: 'bebas',   name: 'Sport',        css: "'Bebas Neue', Impact, sans-serif" },
  { id: 'pirata',  name: 'Gothique',     css: "'Pirata One', serif" },
  { id: 'vibes',   name: 'Calligraphie', css: "'Great Vibes', cursive" },
  { id: 'retro',   name: 'Rétro',        css: "'Press Start 2P', monospace" }
];

export const DEFAULTS = {
  world: 'day',
  seed: 0,             // numéro de la ville imaginaire (0 = à tirer au hasard une fois)
  preset: 'city',      // parcours imaginaire : city | skate | mountain | f1 | snow | sky
  riderHair: 'helmet', // helmet | bald | short | medium | long
  riderGlasses: false,
  riderSkin: 'light',
  riderVest: '#202a36',
  mapRadius: '800',    // carte réelle : demi-côté en mètres (zone locale pour limiter le téléchargement initial)
  mapV: 1,             // migration : revient une fois de la zone 6 km qui lançait plus de 200 requêtes
  realTheme: 'day',    // (ancien réglage, remplacé par saison / moment / lumière)
  season: 'summer',    // ville imaginaire ET carte réelle : summer | winter | spring (neige par plaques) | autumn (feuilles qui tombent)
  tod: 'day',          // moment : day | dusk (soir) | night (nuit)
  glow: 'normal',      // lumière : normal (discrète) | neon (intérieurs et lampes très éclairés)
  miniOsm: true,       // carte réelle : la mini-carte utilise les vraies tuiles OpenStreetMap (comme la 2D)
  relief: '1',         // carte réelle : relief du terrain ('0' = plat · '1' = réel · '2' = accentué ×2)
  gpsSync: true,       // carte réelle : recale la position sur le GPS quand tu roules pour vrai
  roadSnap: true,      // carte réelle : en roulant pour vrai, aimant à la route (cap et position recalés sur la route, trajectoire droite)
  view: 'fp',          // 'fp' = 1re personne, 'tp' = 2e personne (caméra derrière)
  font: 'inter',
  quality: 'high',       // low | med | high | ultra (Haute = meilleur compromis fluidité / beauté sur téléphone)
  fov: 100,
  camDist: 4.4,
  camHeight: 2.1,
  steerSens: 1,
  steerInvert: false,
  speedScale: 1,
  accent: '#ff9aa8',
  sound: true,
  volume: 0.5,         // volume du moteur
  joystick: true,      // joystick tactile en bas de l'écran quand la trottinette n'est pas connectée
  sfx: true,           // sons du jeu (pièces, drapeaux, chute, choc) — indépendants du moteur
  sfxVolume: 0.5,
  music: true,         // musique d'arcade « course aux pièces » en fond
  musicVolume: 0.5,
  traffic: true,
  showMap: true,
  showGauge: true,
  showLog: true,
  autoLights: true,
  gameMode: 'ctf',     // 'ctf' = capture de drapeaux · 'free' = balade libre
  difficulty: 'med',   // 'easy' | 'med' | 'hard'
  falls: true,         // on tombe en percutant un bâtiment, un arbre
  hitCyclists: true,   // on peut percuter les cyclistes, piétons et véhicules
  // v9.21 : ambiance, météo, circulation
  confetti: true,      // confettis aux récompenses (style loterie)
  showRose: true,      // petite rose des vents semi-transparente (suit le nord)
  birds: true,         // oiseaux qui volent autour (et chantent)
  weather: 'clear',    // clear | storm (orage : pluie, éclairs, route glissante, visière) | tornado (le vent attire la trottinette)
  cupHolder: true,     // porte-gobelet noir à droite du guidon
  autoMapRefresh: true, // carte réelle : recharge la carte centrée sur toi seulement quand tu es tout près du bord (jamais pendant les 90 s après un chargement, 1 fois aux 3 min max)
  mouseReturn: false,  // souris : le regard revient au centre quand on arrête de bouger la souris (désactivé : la vue reste où tu la mets)
  trafficLevel: 'few', // quantité de circulation : few (peu) | some (moyenne) | busy (dense)
  trafficLights: 'arcade', // feux aux carrefours : off | arcade (partout) | real (ceux d'OpenStreetMap)
  special: 'auto',     // auto (urgence en difficile) | off | emergency (sirènes qui passent) | chase (mode criminel : on te poursuit)
  // v9.9 : résolution, ombres, distance, routes et bâtiments
  resScale: '0',       // résolution du rendu : '0' = auto (selon la qualité) · '1' · '1.5' · '2' · '3' pixels par pixel d'écran
  texRes: '2',         // netteté des textures : '1' normale · '2' fine · '4' ultra
  aniso: '8',          // filtrage anisotrope des textures vues de biais (sol, routes)
  shadowQ: '2048',     // ombres : auto · off · 1024 · 2048 · 4096
  shadowDist: 40,      // demi-côté de la zone ombrée autour de toi (m)
  lawnDist: 2,         // distance de vue du gazon / des bois par rapport au reste (×) : 2 = deux fois plus loin
  viewDist: 1,         // distance de vue (brouillard) : multiplicateur
  exposure: 1,         // luminosité
  roadMarks: true,     // lignes de route et passages piétons
  sidewalks: true,     // trottoirs le long des rues
  roofs: true,         // toits en pente et cheminées sur les maisons
  kbAlways: false,     // clavier (flèches ET W A S D / Z Q S D = conduire) actif même quand le scooter est connecté (sinon : seulement sans scooter)
  viewOpacity: 100,    // opacité de la vue 3D en % : en dessous de 100, la caméra arrière du téléphone apparaît derrière (réalité augmentée)
  rideLog: true,       // enregistrer chaque trajet (sur l'appareil) : endroits favoris + précision qui s'améliore
  streetLamps: true,   // lampadaires le long des rues (carte réelle)
  treeDensity: '1',    // '0' aucun · '0.5' peu · '1' normal · '2' dense
  bldRad: '0',         // distance d'affichage des bâtiments, en morceaux de 250 m ('0' = auto)
  bobAmt: 1,           // secousses de la caméra (1re personne)
  slopeTilt: true,     // la trottinette s'incline dans les pentes
  mapSize: '0',        // taille de la mini-carte en px ('0' = auto)
  mapRange: 75,        // portée de la mini-carte (m)
  fx: true,            // effets cinéma : reflets, halo lumineux, étalonnage, vignette
  ssao: false,         // ombrage ambiant (profondeur façon jeu AAA)
  nature: true,        // v9.25 Nature réaliste : gazon en brins, arbres à cartes de feuillage, briques / crépi / asphalte fissuré, ciel et brume (demande le rendu Premium)
  grass: 'auto',       // gazon : '0' aucun · auto (selon la qualité) · med · high · ultra
  premium: true,       // v9.12 Rendu Premium : ciel réaliste, matières en relief, vitres qui reflètent, arbres plus riches, ombres stables
  gfxV: 11,
  migV: 0,             // numéro de la dernière migration de réglages appliquée
  fps: false           // compteur d'images par seconde
};
// ombres actives ? (auto = selon la qualité, off = jamais, une taille = toujours)
export const shadowsOn = q => settings.shadowQ === 'off' ? false : settings.shadowQ === 'auto' ? q !== 'low' : true;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

const _saved = load();
export const settings = Object.assign({}, DEFAULTS, _saved);
if ((_saved.mapV || 0) < 1) {
  settings.mapRadius = '800'; settings.mapV = 1;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
}
if (_saved.accent === '#ff9f1c') settings.accent = DEFAULTS.accent;
if (_saved.season === undefined && _saved.realTheme) {                // migration de l'ancien réglage « Ambiance »
  const m = { day: ['summer', 'day', 'normal'], sunset: ['summer', 'dusk', 'normal'], neon: ['summer', 'night', 'neon'], winter: ['winter', 'day', 'normal'] }[_saved.realTheme];
  if (m) [settings.season, settings.tod, settings.glow] = m;
}
// v9.20 : les anciens mondes imaginaires (coucher de soleil, nuit néon, hiver) sont devenus des réglages saison / moment / lumière, communs à la ville imaginaire et à la carte réelle
{ const OLD = { sunset: ['summer', 'dusk', 'normal'], neon: ['summer', 'night', 'neon'], winter: ['winter', 'day', 'normal'] }[settings.world];
  if (OLD) { [settings.season, settings.tod, settings.glow] = OLD; settings.world = 'day'; try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {} } }
// v9.10 : une seule fois, on passe tout le monde en rendu Ultra (l'ancien réglage enregistré l'aurait gardé en Moyenne)
if ((settings.gfxV || 0) < 11) {                                      // v9.25c : réglages optimaux par défaut, appliqués UNE fois aux réglages déjà enregistrés
  Object.assign(settings, { gfxV: 11, quality: 'high', resScale: '0', texRes: '2', aniso: '8', shadowQ: '2048', shadowDist: 40, ssao: false, grass: 'auto', nature: true });
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
}
// v9.26 : champ de vision de base à 100° (ceux qui avaient encore l'ancien 72° y passent) ; la résolution « pixels par pixel d'écran » n'existe plus : toujours automatique
if ((settings.migV || 0) < 26) {
  if (!_saved.fov || _saved.fov === 72) settings.fov = 100;
  settings.resScale = '0'; settings.migV = 26;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
}
if (!settings.seed) { settings.seed = Math.floor(Math.random() * 2147483647) + 1; try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {} }
const listeners = new Set();

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
}
export function set(k, v) {
  settings[k] = v;
  save();
  listeners.forEach(f => f(k, v));
}
export function reset() {
  const keep = settings.seed;
  Object.assign(settings, DEFAULTS); settings.seed = keep;
  save();
  listeners.forEach(f => f('*', null));
}
export function onChange(f) { listeners.add(f); return () => listeners.delete(f); }
