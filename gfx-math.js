// Calculs purs pour le rendu Premium (aucune dépendance à three.js : testable seul).
// Chaque générateur renvoie { rgbaN, rgbaR, W, H } : carte de relief (normales) et carte de rugosité, sans couture.

const h2 = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
const wrap = (n, P) => ((n % P) + P) % P;
// bruit de valeur lisse, périodique de période P (pour que la texture se répète sans couture)
function vn(x, y, P) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h2(wrap(i, P), wrap(j, P)), b = h2(wrap(i + 1, P), wrap(j, P));
  const c = h2(wrap(i, P), wrap(j + 1, P)), d = h2(wrap(i + 1, P), wrap(j + 1, P));
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, P, oct) {
  let s = 0, a = 0.5, f = 1, t = 0;
  for (let o = 0; o < oct; o++) { s += a * vn(x * f, y * f, P * f); t += a; f *= 2; a *= 0.5; }
  return s / t;
}

// champ de hauteur -> carte de normales (convention OpenGL de three.js : +Y vers le haut de l'image)
export function heightToNormal(hf, W, H, strength) {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const yu = ((y - 1 + H) % H) * W, yd = ((y + 1) % H) * W, yy = y * W;
    for (let x = 0; x < W; x++) {
      const xl = (x - 1 + W) % W, xr = (x + 1) % W;
      const dx = (hf[yy + xr] - hf[yy + xl]) * 0.5 * strength;
      const dy = (hf[yd + x] - hf[yu + x]) * 0.5 * strength;
      let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const o = (yy + x) * 4;
      out[o] = (nx * 0.5 + 0.5) * 255; out[o + 1] = (ny * 0.5 + 0.5) * 255; out[o + 2] = (nz * 0.5 + 0.5) * 255; out[o + 3] = 255;
    }
  }
  return out;
}
export function valueToGray(rf, W, H) {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { const v = Math.max(0, Math.min(1, rf[i])) * 255; out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; out[i * 4 + 3] = 255; }
  return out;
}


/* v9.25 — briques et fissures : mêmes formules pour l'image (world.js) et le relief (ici), donc parfaitement alignées. */
export const BRICK = { W: 8, H: 3.2, COLS: 16 };                                   // en unités de tuile (128 = 16 briques de large, 40 rangs)
export const brickTone = (c, r) => h2(c * 3.7 + 1, r * 5.3 + 2);
export function brickAt(x, y) {                                                    // m : 0 dans le joint, 1 au cœur de la brique
  const { W, H } = BRICK, row = Math.floor(y / H), off = (row % 2) * W / 2, xs = x + off;
  const col = wrap(Math.floor(xs / W), BRICK.COLS), u = xs - Math.floor(xs / W) * W, v = y - row * H;
  const m = Math.min(Math.min(u, W - u) / 0.5, Math.min(v, H - v) / 0.42);
  return { m: Math.max(0, Math.min(1, m)), tone: brickTone(col, wrap(row, 40)) };
}
// asphalte : fissures (lignes de niveau d'un bruit) et plaques réparées ; u, v dans [0,1[ (sans couture).
// Calculé UNE fois sur une grille 256×512 (partagée par l'image et le relief) : rapide même sur téléphone.
let _rd = null;
function roadGrid() {
  if (_rd) return _rd;
  const W = 256, H = 512, crack = new Float32Array(W * H), patch = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, a = fbm(u * 7, v * 14, 7, 3), b = fbm(u * 3 + 1.7, v * 6 + 0.6, 3, 3);
    const sb = Math.max(0, Math.min(1, (b - 0.46) / 0.08)); crack[y * W + x] = Math.max(0, 1 - Math.abs(a - 0.5) / 0.013) * sb * sb * (3 - 2 * sb);
    patch[y * W + x] = Math.max(0, Math.min(1, (fbm(u * 2, v * 4, 2, 2) - 0.56) * 16));
  }
  return (_rd = { W, H, crack, patch });
}
export function roadDetail(u, v) {
  const g = roadGrid(), x = Math.min(g.W - 1, Math.floor(u * g.W)), y = Math.min(g.H - 1, Math.floor(v * g.H)), i = y * g.W + x;
  return { crack: g.crack[i], patch: g.patch[i] };
}

/* Façades : mêmes positions que la texture de fenêtres du jeu (tuile de 128 unités = 4 × 4 cases de 32).
   Fenêtre = verre en retrait (très lisse → reflète le ciel), cadre et appui en relief, bandeau d'étage, crépi granuleux. */
export function wallMaps(S) {
  const k = S / 128, hf = new Float32Array(S * S), rf = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const st = fbm(x / S * 24, y / S * 24, 24, 3), gr = h2(x * 1.7 + 3, y * 2.3 + 7);
    let hgt = 0.5 + (st - 0.5) * 0.10 + (gr - 0.5) * 0.04, ro = 0.88 + (st - 0.5) * 0.14;
    const cx = (x / k) % 32, cy = (y / k) % 32;
    const inWin = cx >= 7 && cx < 25 && cy >= 6 && cy < 26;
    if (cy >= 29) { hgt += 0.12; ro = 0.8; }                                              // bandeau entre les étages
    if (inWin) { hgt = 0.16; ro = 0.05 + (st - 0.5) * 0.05; }                              // verre
    else if (cx >= 6 && cx < 26 && cy >= 5 && cy < 27) { hgt = 0.64; ro = 0.45; }         // cadre
    else if (cx >= 5 && cx < 27 && cy >= 27 && cy < 28.6) { hgt = 0.74; ro = 0.8; }        // appui de fenêtre
    if (!inWin && !(cx >= 6 && cx < 26 && cy >= 5 && cy < 27) && !(cy >= 27 && cy < 28.6) && cy < 29) {   // mur nu : briques en léger relief, joints creux
      const b = brickAt(x / k, y / k); hgt += (b.m - 1) * 0.10 + (b.tone - 0.5) * 0.03; ro = 0.92 - 0.05 * b.m;
    }
    hf[y * S + x] = hgt; rf[y * S + x] = ro;
  }
  return { W: S, H: S, rgbaN: heightToNormal(hf, S, S, 3.2), rgbaR: valueToGray(rf, S, S) };
}

/* Asphalte : gravillons fins + traces de roues plus lisses (reflètent un peu le ciel). u = largeur (0..1), v = longueur. */
export function roadMaps(W, H) {
  const hf = new Float32Array(W * H), rf = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, fine = fbm(x / W * 64, y / H * 64, 64, 2), mid = fbm(x / W * 16, y / H * 16, 16, 3), grain = h2(x * 1.3 + 11, y * 2.9 + 5);
    const rd = roadDetail(x / W, y / H);
    hf[y * W + x] = 0.2 * mid + 0.5 * fine + 0.3 * grain - 0.55 * rd.crack + 0.06 * rd.patch;
    const wheel = Math.exp(-(((u - 0.3) / 0.07) ** 2)) + Math.exp(-(((u - 0.7) / 0.07) ** 2));
    rf[y * W + x] = 0.94 - 0.2 * Math.min(1, wheel) + (mid - 0.5) * 0.12;
  }
  return { W, H, rgbaN: heightToNormal(hf, W, H, 2.4), rgbaR: valueToGray(rf, W, H) };
}

/* Herbe / neige : touffes fines et irrégularités du terrain. */
export function groundMaps(S) {
  const hf = new Float32Array(S * S), rf = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const big = fbm(x / S * 12, y / S * 12, 12, 3), fine = fbm(x / S * 96, y / S * 96, 96, 2), gr = h2(x * 1.9 + 2, y * 1.1 + 8);
    hf[y * S + x] = 0.5 * big + 0.35 * fine + 0.15 * gr;
    rf[y * S + x] = 0.9 + (fine - 0.5) * 0.14;
  }
  return { W: S, H: S, rgbaN: heightToNormal(hf, S, S, 1.6), rgbaR: valueToGray(rf, S, S) };
}

/* Antidérapant du plateau : petits losaugements réguliers. */
export function gripMaps(S) {
  const hf = new Float32Array(S * S), rf = new Float32Array(S * S), n = 8;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const a = (x / S * n) % 1, b = (y / S * n) % 1, d = Math.abs(a - 0.5) + Math.abs(b - 0.5);     // losange
    hf[y * S + x] = Math.max(0, 1 - d * 2.2) + (h2(x, y) - 0.5) * 0.05; rf[y * S + x] = 0.9;
  }
  return { W: S, H: S, rgbaN: heightToNormal(hf, S, S, 2.0), rgbaR: valueToGray(rf, S, S) };
}

/* Pneu : sculptures en chevrons le long de la bande de roulement. */
export function treadMaps(W, H) {
  const hf = new Float32Array(W * H), rf = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, side = Math.abs(v - 0.5) * 2;                                   // 0 centre … 1 flanc
    const ch = ((u * 8 + (v < 0.5 ? v : 1 - v) * 3) % 1);
    const groove = ch < 0.3 ? 0 : 1;                                                             // rainures
    hf[y * W + x] = side > 0.9 ? 0.4 : groove * 0.7 + 0.15 * h2(x, y); rf[y * W + x] = 0.95;
  }
  return { W, H, rgbaN: heightToNormal(hf, W, H, 3.0), rgbaR: valueToGray(rf, W, H) };
}
