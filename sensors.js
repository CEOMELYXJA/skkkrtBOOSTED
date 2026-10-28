// Gyroscope / boussole : le téléphone est sur le guidon, on mesure la direction
// vers laquelle pointe le DOS du téléphone (ou le haut s'il est posé à plat).
const D2R = Math.PI / 180;
const wrap180 = d => ((d + 180) % 360 + 360) % 360 - 180;

// Angles W3C (alpha, beta, gamma) -> cap en degrés (sens horaire depuis le nord)
function headingFrom(a, b, g) {
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
  // axe Z de l'appareil (sort de l'écran) dans le repère terrestre (x est, y nord, z haut)
  const zx = sg * ca + cg * sb * sa;
  const zy = sg * sa - cg * sb * ca;
  // axe Y de l'appareil (haut du téléphone)
  const yx = -cb * sa, yy = cb * ca;
  let x = -zx, y = -zy;                 // dos du téléphone
  if (Math.hypot(x, y) < 0.35) { x = yx; y = yy; } // téléphone presque à plat
  return (Math.atan2(x, y) / D2R + 360) % 360;
}

export const gyro = {
  on: false,
  heading: null,
  zero: null,
  useAbs: false,
  lastEvt: 0,
  deg: 0,            // écart au zéro (degrés, + = vers la droite)
  _h: null,

  async enable() {
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      const p = await DeviceOrientationEvent.requestPermission();
      if (p !== 'granted') throw new Error('permission ' + p);
    }
    if (this._h) return;
    this._h = e => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      if (e.type === 'deviceorientationabsolute') this.useAbs = true;
      else if (this.useAbs) return;               // Android : on garde seulement l'absolu
      this.heading = headingFrom(e.alpha * D2R, e.beta * D2R, e.gamma * D2R);
      this.lastEvt = performance.now();
      if (this.zero != null) this.deg = wrap180(this.heading - this.zero);
    };
    addEventListener('deviceorientationabsolute', this._h, true);
    addEventListener('deviceorientation', this._h, true);
    this.on = true;
  },

  calibrate() {
    if (this.heading == null) return false;
    this.zero = this.heading;
    this.deg = 0;
    return true;
  },

  get calibrated() { return this.zero != null; },

  // valeur normalisée -1..1 (± 32° / sensibilité = plein braquage)
  norm(sens = 1) {
    if (!this.on || this.zero == null) return 0;
    const dz = 1.2;
    const d = Math.abs(this.deg) < dz ? 0 : this.deg - Math.sign(this.deg) * dz;
    return Math.max(-1, Math.min(1, d / (32 / sens)));
  }
};
