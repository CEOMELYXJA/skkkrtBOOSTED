// Télémétrie de la i9 : soit via Bluetooth direct (version autonome),
// soit via l'app SKKRT / i9 Dash qui contient déjà la connexion (mode intégré).
export function createTelemetry({ log, setStatus, onLink }) {
  const embedded = (() => { try { return window.parent !== window && typeof window.parent.i9get === 'function'; } catch { return false; } })();
  const SVC = window.P ? P.U('fff0') : null;
  const t = { embedded, s: null, seen: 0, dev: null, chW: null };

  t.get = () => {
    if (embedded) {
      try { const s = window.parent.i9get(); return s && s.age < 5000 ? s : null; } catch { return null; }
    }
    return t.s && performance.now() - t.seen < 3000 ? t.s : null;
  };
  t.connected = () => !!t.get();

  t.command = async key => {
    const s = t.get();
    if (!s) return false;
    if (embedded) { try { window.parent.i9cmd(key); return true; } catch { return false; } }
    if (!t.chW) return false;
    try {
      const u = new Uint8Array(P.frame(s, P.CMD[key], !s[key]));
      await (t.chW.writeValueWithResponse ? t.chW.writeValueWithResponse(u) : t.chW.writeValue(u));
      return true;
    } catch (e) { log('Écriture : ' + e.message); return false; }
  };

  async function listen(s) {
    try { t.chW = await s.getCharacteristic(P.U('fff6')); } catch (e) { log('Pas d’écriture FFF6'); }
    const n = await s.getCharacteristic(P.U('fff7'));
    n.addEventListener('characteristicvaluechanged', ev => {
      const v = ev.target.value;
      const p = P.parse(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      if (p) { t.s = p; t.seen = performance.now(); }
    });
    await n.startNotifications();
    try { await navigator.wakeLock.request('screen'); } catch {}
  }
  async function autoReco() {                                        // coupure involontaire : on se reconnecte tout seul, sans rouvrir le sélecteur
    if (t.reco || !t.dev) return; t.reco = true;
    for (let i = 1; i <= 8 && !t.user; i++) {
      setStatus('Reconnexion ' + i + '/8…'); await new Promise(r => setTimeout(r, Math.min(1200 * i, 6000)));
      if (t.user || t.dev.gatt.connected) break;
      try { const g = await t.dev.gatt.connect(), sv = await g.getPrimaryService(SVC); await listen(sv); setStatus('Connecté · ' + (t.dev.name || 'i9')); onLink(true); log('i9 reconnectée'); t.reco = false; return; }
      catch (e) { log('Reconnexion échouée : ' + e.message); }
    }
    t.reco = false;
  }

  t.connect = async () => {
    if (embedded) { log('Connexion gérée par l’app (onglet Tableau).'); return; }
    if (!navigator.bluetooth) { setStatus('Bluetooth web absent'); log('Ouvre Chrome (Android) ou Bluefy (iPhone).'); return; }
    if (t.dev && t.dev.gatt.connected) { t.user = true; t.dev.gatt.disconnect(); return; }
    try {
      setStatus('Choisis la i9…');
      const dev = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SVC, P.U('ffe0'), P.U('180a'), '6e400001-b5a3-f393-e0a9-e50e24dcca9e']
      });
      t.dev = dev;
      dev.addEventListener('gattserverdisconnected', () => { t.s = null; t.chW = null; setStatus('Déconnecté'); onLink(false); log('BLE coupé'); if (!t.user) autoReco(); t.user = false; });
      setStatus('Connexion…');
      const g = await dev.gatt.connect();
      const s = await g.getPrimaryService(SVC);
      try {
        const on = (await (await s.getCharacteristic(P.U('fff1'))).readValue()).getUint8(0) === 1;
        if (on) {
          const v = await (await s.getCharacteristic(P.U('fff5'))).readValue();
          const u = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
          let pin; try { pin = new TextDecoder('gbk').decode(u); } catch { pin = new TextDecoder().decode(u); }
          const ans = prompt('Mot de passe de la trottinette :');
          if (ans !== pin.replace(/\0/g, '')) { g.disconnect(); alert('Mot de passe incorrect'); return; }
        }
      } catch (e) { log('Mot de passe ignoré'); }
      await listen(s);
      setStatus('Connecté · ' + (dev.name || 'i9'));
      onLink(true);
      log('i9 en écoute — accélère avec la vraie poignée');
    } catch (e) {
      setStatus(e.name === 'NotFoundError' ? 'Annulé' : e.message);
      log('BLE : ' + e.message);
    }
  };
  return t;
}
