// Protocole iScooter i9 / KCQ Scooter — décodé de com.kcq.kcqscooter
// Service FFF0 : FFF7 notify (télémétrie) · FFF6 write (commandes) · FFF1 état mot de passe · FFF5 mot de passe
(function (g) {
  const U = s => `0000${s}-0000-1000-8000-00805f9b34fb`;
  const bit = (b, i) => (b >> i) & 1;
  const gearOf = (a, b) => (a && b ? 3 : a ? 1 : b ? 2 : 1);

  // Trame reçue : AA 55 | vit(lo,hi) ÷10 km/h | total(lo,hi) ÷10 | trajet(lo,hi) ÷10 | batterie % | défauts | drapeaux | réglages | temps s (lo,hi)
  function parse(b) {
    if (!b || b.length < 14 || b[0] !== 0xAA || b[1] !== 0x55) return null;
    const r = b[11], gear = gearOf(bit(r, 0), bit(r, 1));
    return {
      speed: (b[3] << 8 | b[2]) / 10, total: (b[4] | b[5] << 8) / 10, trip: (b[6] | b[7] << 8) / 10,
      bat: b[8], faults: b[9], flags: b[10], time: b[12] | b[13] << 8,
      gear, gearBit: gear === 3 ? 0 : bit(r, 0), cruise: bit(r, 2), start: bit(r, 3),
      head: bit(r, 4), tail: bit(r, 5), mph: bit(r, 6), lock: bit(r, 7), third: bit(b[10], 5)
    };
  }

  // Trame envoyée : AA CC A5 | réglages | info2 | réglages^A5 | somme(réglages,A5,xor) | EE
  // idx = position du bit dans l'octet d'écriture (gear 0, cruise 1, start 2, phare 3, feu arrière 4, unité 5, verrou 6)
  function frame(st, idx, on, gear) {
    const c = [st.gearBit ? 0 : 1, st.cruise, st.start, st.head, st.tail, st.mph, st.lock, 0];
    if (idx != null) c[idx] = on ? 1 : 0;
    const S = c.reduce((s, v, i) => s | v << i, 0), gr = gear == null ? st.gear : gear;
    const I = (gr === 0 ? 2 : 0) | (st.third ? 16 : 0) | (gr === 3 ? 32 : 0);
    const X = S ^ 0xA5;
    return [0xAA, 0xCC, 0xA5, S, I, X, (S + 0xA5 + X) & 255, 0xEE];
  }

  const frameWith = (st, over) => frame(Object.assign({}, st, over), null);
  const CMD = { head: 3, tail: 4, lock: 6, unit: 5, start: 2, cruise: 1 };
  const FAULTS = ['Capteur Hall', 'Contrôleur (MOS)', 'Frein', 'Poignée', 'Sous-tension', 'Communication', 'Surtension', 'Démarrage'];
  const api = { U, parse, frame, frameWith, CMD, FAULTS };
  if (typeof module !== 'undefined') module.exports = api; else g.P = api;
})(this);
