// Journal des parties : garde en mémoire (sur l'appareil, en arrière-plan) un résumé de CHAQUE partie :
// réglages, fluidité (images/seconde), chargement de la carte, coupures Bluetooth, chutes, erreurs, messages.
// Rien n'est envoyé nulle part : tu peux copier le rapport (Réglages → Journal des parties) et me l'envoyer pour améliorer la prochaine version.
const KEY = 'skkkrt3d.sessions.v1', MAX_SESSIONS = 30, MAX_EVENTS = 300, MAX_BYTES = 450000;

export function createSessionLog(settings) {
  let all = [];
  try { all = JSON.parse(localStorage.getItem(KEY)) || []; if (!Array.isArray(all)) all = []; } catch { all = []; }
  const t0 = Date.now();
  const snap = () => ({ q: settings.quality, fov: settings.fov, world: settings.world, map: settings.mapRadius, prem: !!settings.premium, fx: !!settings.fx, ssao: !!settings.ssao, tex: settings.texRes, shadow: settings.shadowQ, view: settings.viewDist, lawn: settings.lawnDist, mode: settings.gameMode, special: settings.special, diff: settings.difficulty });
  const S = {
    t: new Date(t0).toISOString(), ua: (navigator.userAgent || '').slice(0, 140), scr: [innerWidth, innerHeight, +(devicePixelRatio || 1).toFixed(2)],
    v: '9.26', set: snap(), min: 0, fps: [], ev: [], ble: { up: 0, drops: 0 }, map: null, falls: 0, hits: 0, err: 0
  };
  all.push(S);
  let dirty = true, lastSave = 0, acc = 0, n = 0, worst = 1e9, bleOn = null, bleT = 0, evDropped = 0;

  const bytes = () => { try { return JSON.stringify(all).length; } catch { return 0; } };
  function save() {
    S.min = Math.round((Date.now() - t0) / 6000) / 10;
    while (all.length > MAX_SESSIONS) all.shift();
    while (all.length > 1 && bytes() > MAX_BYTES) all.shift();
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { while (all.length > 1) { all.shift(); try { localStorage.setItem(KEY, JSON.stringify(all)); break; } catch {} } }
    dirty = false; lastSave = Date.now();
  }
  function note(kind, msg, extra) {
    const t = Math.round((Date.now() - t0) / 1000);
    if (kind === 'fall') S.falls++; if (kind === 'hit') S.hits++; if (kind === 'err') S.err++;
    if (S.ev.length >= MAX_EVENTS) { evDropped++; if (kind !== 'err' && kind !== 'ble' && kind !== 'fall') return; S.ev.splice(1, 1); }
    const e = [t, kind, String(msg).slice(0, 160)]; if (extra !== undefined) e.push(extra);
    S.ev.push(e); dirty = true;
  }
  function frame(dt, playing, bleNow) {
    const now = Date.now();
    if (bleNow !== bleOn) {                                           // le Bluetooth vient de se connecter ou de se couper
      if (bleOn !== null) { note('ble', bleNow ? 'i9 connectée' : 'i9 coupée' + (bleT ? ' après ' + Math.round((now - bleT) / 1000) + ' s' : '')); if (!bleNow) S.ble.drops++; }
      bleOn = bleNow; bleT = bleNow ? now : 0;
    }
    if (bleNow) S.ble.up += dt;
    if (playing && dt > 0) {
      acc += dt; n++; if (dt > 0 && 1 / dt < worst) worst = 1 / dt;
      if (acc >= 10) { S.fps.push([Math.round(n / acc), Math.round(worst)]); if (S.fps.length > 120) S.fps.splice(1, 1); acc = 0; n = 0; worst = 1e9; dirty = true; }
    }
    if (dirty && now - lastSave > 15000) save();
  }
  function mapInfo(o) { S.map = o; dirty = true; save(); }
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  addEventListener('error', e => note('err', (e.message || 'erreur') + ' (' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0) + ')'));
  addEventListener('unhandledrejection', e => note('err', 'promesse : ' + ((e.reason && (e.reason.message || e.reason)) || '?')));
  save();
  return {
    note, frame, map: mapInfo, save,
    count: () => all.length,
    report() {
      save();
      const fpsAvg = s => s.fps.length ? Math.round(s.fps.reduce((a, b) => a + b[0], 0) / s.fps.length) : null;
      const head = 'SKKKRT3D · rapport de ' + all.length + ' partie(s) · ' + new Date().toISOString() + '\n';
      return head + JSON.stringify(all.map(s => Object.assign({ fpsMoy: fpsAvg(s) }, s)));
    },
    clear() { all = [S]; S.ev = []; S.fps = []; S.falls = S.hits = S.err = 0; S.ble = { up: 0, drops: 0 }; save(); }
  };
}
