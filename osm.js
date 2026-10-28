// Relais de carte conservé pour les anciennes pages Dash / SKKKRT 3D (v9.35).
// Le téléphone demande la carte à CE site (même adresse : pas de blocage, pas de « Load failed »),
// et c'est ce serveur qui interroge les serveurs OpenStreetMap (Overpass), en essayant plusieurs miroirs.
const MIRRORS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
];
const J = (code, obj, extra) => ({ statusCode: code, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, extra || {}), body: typeof obj === 'string' ? obj : JSON.stringify(obj) });

exports.handler = async (event) => {
  const q = ((event.queryStringParameters || {}).q || '').toString();
  if (!/^\[out:json\]/.test(q) || q.length > 6000 || /out:csv|out:xml|\bconvert\b|\bmake\b/.test(q)) return J(400, { error: 'requête refusée' });
  const t0 = Date.now(), LIMIT = 9000;                         // les fonctions Netlify s'arrêtent à ~10 s
  const start = Math.floor(t0 / 1000) % MIRRORS.length;        // on change de miroir de départ pour répartir la charge
  let last = '';
  for (let n = 0; n < MIRRORS.length; n++) {
    const left = LIMIT - (Date.now() - t0); if (left < 1500) break;
    const base = MIRRORS[(start + n) % MIRRORS.length];
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), Math.min(left - 300, 6000));
    try {
      const r = await fetch(base + '?data=' + encodeURIComponent(q), { signal: ctl.signal, headers: { 'User-Agent': 'skkkrt-dash/9.35 (jeu personnel)', Accept: 'application/json' } });
      if (!r.ok) { clearTimeout(to); last = base.split('/')[2] + ' : HTTP ' + r.status; continue; }
      const txt = await r.text(); clearTimeout(to);
      let j; try { j = JSON.parse(txt); } catch { last = base.split('/')[2] + ' : réponse illisible'; continue; }
      if (!j || !Array.isArray(j.elements)) { last = 'réponse invalide'; continue; }
      if (j.remark && /error|timed out|out of memory/i.test(j.remark)) { last = base.split('/')[2] + ' : surchargé'; continue; }
      if (txt.length > 5500000) return J(413, { error: 'morceau trop gros pour le relais' });      // limite de réponse Netlify (6 Mo) : le jeu ira directement
      return J(200, txt, { 'cache-control': 'public, max-age=86400', 'x-osm-op': base.split('/')[2] });
    } catch (e) { clearTimeout(to); last = base.split('/')[2] + ' : ' + (e.name === 'AbortError' ? 'trop lent' : e.message); }
  }
  return J(502, { error: last || 'aucun serveur disponible' });
};
