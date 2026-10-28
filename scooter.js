import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { premium, gripPBR, treadPBR } from './gfx.js';

// Trottinette 100 % noire (l'avant est vers -Z). Le pilote n'est visible qu'en 2e personne.
const lerp = (a, b, t) => a + (b - a) * t;

function limb(r, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 1, 20), mat);
  m.castShadow = true;
  return m;
}
const UP = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
function setLimb(m, a, b) {
  _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]);
  _d.subVectors(_b, _a);
  const len = _d.length() || 0.001;
  m.position.addVectors(_a, _b).multiplyScalar(0.5);
  m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(UP, _d.normalize());
}

export function makeScooter() {
  const root = new THREE.Group();
  const lean = new THREE.Group();          // inclinaison dans les virages
  root.add(lean);

  // Tout est noir : de légères variations de brillance pour qu'on lise les formes
  const PREM = premium();
  // Premium : peinture à vernis (clearcoat) — les reflets du ciel glissent sur la carrosserie ; sinon, matériaux d'origine
  const matte  = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.85, metalness: 0.1 });
  const satin  = PREM ? new THREE.MeshPhysicalMaterial({ color: 0x0a0b0d, roughness: 0.4, metalness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.22 }) : new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.42, metalness: 0.55 });
  const gloss  = PREM ? new THREE.MeshPhysicalMaterial({ color: 0x020203, roughness: 0.2, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.06 }) : new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 0.18, metalness: 0.7 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 0.95, metalness: 0 });
  const lamp   = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.3, metalness: 0.4, emissive: 0xfff1d0, emissiveIntensity: 0 });
  const tailM  = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.4, emissive: 0xff1a1a, emissiveIntensity: 0 });
  const mats = [matte, satin, gloss, rubber, lamp, tailM];
  // Premium : pneu sculpté (bande de roulement en chevrons) et plateau antidérapant en relief
  let tire = rubber, grip = matte;
  if (PREM) try {
    const tp = treadPBR(), gp = gripPBR();
    const tm = rubber.clone(); tm.roughness = 1; tm.normalMap = tp.normal; tm.roughnessMap = tp.rough; tm.normalScale.set(1.2, 1.2);
    const tn = tp.normal.clone(); tn.repeat.set(28, 1); tn.needsUpdate = true; tm.normalMap = tn;
    tire = [tm, rubber, rubber];                                   // CylinderGeometry : [bande de roulement, flancs]
    grip = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1, metalness: 0.05, normalMap: gp.normal.clone(), roughnessMap: gp.rough, normalScale: new THREE.Vector2(1.1, 1.1) });
    grip.normalMap.repeat.set(2, 9); grip.normalMap.needsUpdate = true;
    mats.push(tm, grip);
  } catch (e) { console.warn('Détails Premium de la trottinette indisponibles :', e); tire = rubber; grip = matte; }

  const add = (parent, geo, mat, x = 0, y = 0, z = 0, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    parent.add(m);
    return m;
  };

  // ---- Plateau + batterie
  add(lean, new RoundedBoxGeometry(0.2, 0.05, 0.9, 4, Math.min(0.2, 0.05, 0.9) * 0.3), satin, 0, 0.13, 0.14);
  add(lean, new RoundedBoxGeometry(0.17, 0.012, 0.74, 4, Math.min(0.17, 0.012, 0.74) * 0.3), grip, 0, 0.16, 0.16, false);
  add(lean, new RoundedBoxGeometry(0.19, 0.06, 0.4, 4, Math.min(0.19, 0.06, 0.4) * 0.3), gloss, 0, 0.1, 0.14);

  // ---- Roue arrière + garde-boue + moteur
  const rearPivot = new THREE.Group();
  rearPivot.position.set(0, 0.13, 0.66);
  lean.add(rearPivot);
  const tireGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.075, 60);
  tireGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.085, 40);
  hubGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new RoundedBoxGeometry(0.09, 0.012, 0.02, 4, Math.min(0.09, 0.012, 0.02) * 0.3);
  const wR = new THREE.Group(); rearPivot.add(wR);
  add(wR, tireGeo, tire); add(wR, hubGeo, gloss);
  for (let i = 0; i < 3; i++) { const s = add(wR, spokeGeo, satin, 0, 0, 0, false); s.rotation.x = i * Math.PI / 3; }
  const fenderR = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 45, 1, true, -0.3, Math.PI * 0.95), matte);
  fenderR.rotation.z = Math.PI / 2; fenderR.rotation.y = Math.PI; fenderR.material.side = THREE.DoubleSide;
  fenderR.rotation.set(0, 0, Math.PI / 2);
  fenderR.position.set(0, 0.0, 0);
  fenderR.castShadow = true;
  rearPivot.add(fenderR);
  const tailLight = add(rearPivot, new RoundedBoxGeometry(0.09, 0.035, 0.03, 4, Math.min(0.09, 0.035, 0.03) * 0.3), tailM, 0, 0.17, 0.15, false);

  // ---- Bloc de direction (tourne avec le guidon)
  const steer = new THREE.Group();
  steer.position.set(0, 0.13, -0.58);
  lean.add(steer);

  const wF = new THREE.Group(); steer.add(wF);
  add(wF, tireGeo, tire); add(wF, hubGeo, gloss);
  for (let i = 0; i < 3; i++) { const s = add(wF, spokeGeo, satin, 0, 0, 0, false); s.rotation.x = i * Math.PI / 3; }
  // fourche
  add(steer, new RoundedBoxGeometry(0.018, 0.34, 0.03, 4, Math.min(0.018, 0.34, 0.03) * 0.3), satin, 0.062, 0.15, 0.0);
  add(steer, new RoundedBoxGeometry(0.018, 0.34, 0.03, 4, Math.min(0.018, 0.34, 0.03) * 0.3), satin, -0.062, 0.15, 0.0);
  add(steer, new RoundedBoxGeometry(0.15, 0.025, 0.05, 4, Math.min(0.15, 0.025, 0.05) * 0.3), gloss, 0, 0.33, 0.0);
  // tube de direction (incliné vers le pilote)
  const TILT = 0.18, STEM = 0.98;
  const stem = add(steer, new THREE.CylinderGeometry(0.0175, 0.021, STEM, 30), satin, 0, STEM / 2 * Math.cos(TILT), STEM / 2 * Math.sin(TILT));
  stem.rotation.x = TILT;
  const topY = STEM * Math.cos(TILT), topZ = STEM * Math.sin(TILT);
  // charnière de pliage
  const hinge = add(steer, new RoundedBoxGeometry(0.06, 0.08, 0.06, 4, Math.min(0.06, 0.08, 0.06) * 0.3), gloss, 0, 0.42 * Math.cos(TILT) + 0.35, 0.42 * Math.sin(TILT), false);
  hinge.rotation.x = TILT;
  // phare + support
  const head = add(steer, new RoundedBoxGeometry(0.07, 0.05, 0.05, 4, Math.min(0.07, 0.05, 0.05) * 0.3), lamp, 0, 0.7, 0.03 - 0.04, false);
  // guidon
  const bars = new THREE.Group(); bars.position.set(0, topY, topZ); steer.add(bars);
  const bar = add(bars, new THREE.CylinderGeometry(0.0115, 0.0115, 0.56, 25), satin);
  bar.rotation.z = Math.PI / 2;
  for (const sx of [-1, 1]) {
    const gr = add(bars, new THREE.CylinderGeometry(0.0185, 0.0185, 0.11, 30), rubber, sx * 0.27, 0, 0);
    gr.rotation.z = Math.PI / 2;
    add(bars, new RoundedBoxGeometry(0.014, 0.012, 0.075, 4, Math.min(0.014, 0.012, 0.075) * 0.3), satin, sx * 0.22, 0.012, -0.045, false); // levier de frein
  }
  add(bars, new RoundedBoxGeometry(0.025, 0.03, 0.04, 4, Math.min(0.025, 0.03, 0.04) * 0.3), gloss, 0.2, 0.018, 0.012, false);           // poignée d'accélération
  // écran / compteur
  const dash = add(bars, new RoundedBoxGeometry(0.115, 0.03, 0.06, 4, Math.min(0.115, 0.03, 0.06) * 0.3), gloss, 0, 0.032, 0.0, false);
  dash.rotation.x = -0.35;
  add(bars, new RoundedBoxGeometry(0.1, 0.004, 0.05, 4, Math.min(0.1, 0.004, 0.05) * 0.3), matte, 0, 0.048, 0.004, false).rotation.x = -0.35;

  // v9.21 : porte-gobelet noir, simple, à DROITE du guidon (vers l'extérieur) — retirable dans les réglages
  const cup = new THREE.Group(); cup.position.set(0, 0, 0); bars.add(cup);
  {
    const cl = add(cup, new THREE.CylinderGeometry(0.0165, 0.0165, 0.03, 24), rubber, 0.155, 0, 0.0, false); cl.rotation.z = Math.PI / 2;            // collier sur le tube
    const arm = add(cup, new THREE.CylinderGeometry(0.0055, 0.0055, 0.2, 14), rubber, 0.255, -0.022, -0.012, false); arm.rotation.z = Math.PI / 2;     // bras vers l'extérieur
    add(cup, new THREE.CylinderGeometry(0.005, 0.005, 0.05, 12), rubber, 0.355, -0.0, -0.012, false);                                                  // montant
    const ring = add(cup, new THREE.TorusGeometry(0.037, 0.0042, 12, 40).rotateX(Math.PI / 2), rubber, 0.355, 0.024, -0.012, false);                  // anneau du gobelet
    add(cup, new THREE.CylinderGeometry(0.03, 0.03, 0.004, 28), rubber, 0.355, -0.03, -0.012, false);                                                  // petit fond
    for (const a of [0, 2.1, 4.2]) add(cup, new THREE.CylinderGeometry(0.0035, 0.0035, 0.055, 8), rubber, 0.355 + Math.cos(a) * 0.034, -0.002, -0.012 + Math.sin(a) * 0.034, false);
  }
  function setCup(v) { cup.visible = !!v; }

  // Premium : faisceau de câbles le long du tube, disque et étrier de frein (détails qui rendent le modèle « vrai »)
  if (PREM) try {
    const cm = [new THREE.Vector3(0.012, topY - 0.04, topZ - 0.026), new THREE.Vector3(0.016, topY * 0.7, topZ * 0.7 - 0.03),
      new THREE.Vector3(0.016, topY * 0.35, topZ * 0.35 - 0.032), new THREE.Vector3(0.012, 0.36, 0.0 - 0.03)];
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cm), 28, 0.0042, 6, false), rubber);
    cable.castShadow = false; steer.add(cable);
    const dg = new THREE.CylinderGeometry(0.062, 0.062, 0.0035, 48); dg.rotateZ(Math.PI / 2);
    const disc = new THREE.Mesh(dg, satin); disc.position.set(0.047, 0, 0); wF.add(disc);
    add(steer, new RoundedBoxGeometry(0.022, 0.042, 0.05, 3, 0.006), gloss, 0.05, 0.05, -0.02, false);          // étrier
  } catch (e) { console.warn('Câbles et frein Premium indisponibles :', e); }

  // phare réel (cône de lumière) — attaché au bloc de direction
  const spot = new THREE.SpotLight(0xfff1d6, 0, 55, 0.5, 0.6, 1.3);
  spot.position.set(0, 0.7, -0.05);
  const spotT = new THREE.Object3D(); spotT.position.set(0, 0.2, -12);
  steer.add(spot, spotT); spot.target = spotT;

  // ---- Pilote (visible en 2e personne ; en 1re personne seuls les bras/mains restent)
  const jacket = PREM ? new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, roughness: 0.75, sheen: 0.15, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x2a2d33) }) : new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.7 });
  const pants  = new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.8 });
  const skin   = new THREE.MeshStandardMaterial({ color: 0xe0b08c, roughness: 0.7 });
  const helmet = PREM ? new THREE.MeshPhysicalMaterial({ color: 0x15171b, roughness: 0.35, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }) : new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.35, metalness: 0.3 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x30231d, roughness: 0.88 });
  const glassesMat = new THREE.MeshStandardMaterial({ color: 0x131b22, roughness: 0.32, metalness: 0.45, side: THREE.DoubleSide });
  const glove  = new THREE.MeshStandardMaterial({ color: 0xd9b9a6, roughness: 0.7 });     // v9.28 : bout des bras (mains) en peau, le reste du haut du corps est noir
  const shoeM  = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.8 });
  const rider = new THREE.Group(); lean.add(rider);
  const body = new THREE.Group(); rider.add(body);     // tronc + tête (caché en 1re personne)
  const hips = [0, 0.93, 0.22];
  const sh = [0, 1.4, 0.17];
  const torso = limb(0.17, jacket); setLimb(torso, hips, sh); torso.scale.x = 1.15; body.add(torso);
  const head2 = add(body, new THREE.SphereGeometry(0.105, 40, 30), skin, 0, 1.6, 0.14);
  const hel = add(body, new THREE.SphereGeometry(0.125, 40, 30, 0, Math.PI * 2, 0, Math.PI * 0.62), helmet, 0, 1.62, 0.14);
  const hairStyles = {};
  let landingAt = -1e9, landingStrength = 0;
  const makeHair = (name, length) => {
    const g = new THREE.Group(); body.add(g);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.108, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.48), hairMat);
    cap.position.set(0, 1.625, 0.14); cap.scale.y = 1.08; g.add(cap);
    if (length > 0) for (const sx of [-1, 1]) {
      const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, length, 10), hairMat);
      lock.position.set(sx * 0.088, 1.61 - length * 0.5, 0.15); lock.rotation.z = sx * -0.08; g.add(lock);
    }
    hairStyles[name] = g;
  };
  makeHair('short', 0.05); makeHair('medium', 0.18);
  {
    // Chevelure longue complète à l’arrière, avec des mèches souples et ondulées aux pointes.
    const g = new THREE.Group(); g.position.set(0, 1.42, 0.14); body.add(g);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.108, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.48), hairMat);
    cap.position.set(0, 0.205, 0); cap.scale.y = 1.08; g.add(cap);
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.104, 24, 16), hairMat);
    back.position.set(0, -0.025, 0.055); back.scale.set(1.02, 2.05, 0.72); g.add(back);
    for (let i = 0; i < 11; i++) {
      const u = i / 10, x = -0.097 + u * 0.194, side = i % 2 ? 1 : -1;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x * 0.84, 0.13, 0.025),
        new THREE.Vector3(x * 0.98, -0.08, 0.078),
        new THREE.Vector3(x * 1.08, -0.30, 0.105 + side * 0.012),
        new THREE.Vector3(x * 1.05 + side * 0.008, -0.50 + (i % 3) * 0.018, 0.075 + side * 0.025)
      ]);
      const lock = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.016, 5, false), hairMat);
      g.add(lock);
    }
    hairStyles.long = g;
  }
  const glassesGroup = new THREE.Group(); glassesGroup.position.set(0, 1.61, 0.025); glassesGroup.rotation.y = Math.PI; body.add(glassesGroup);
  for (const sx of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.006, 7, 20), glassesMat);
    lens.position.x = sx * 0.047; glassesGroup.add(lens);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.008, 0.01), glassesMat); bridge.position.y = 0.004; glassesGroup.add(bridge);
  // jambes
  const legs = [];
  for (const sx of [-1, 1]) {
    const foot = [sx * 0.07, 0.19, sx < 0 ? 0.0 : 0.34];
    const knee = [sx * 0.1, 0.55, sx < 0 ? 0.0 : 0.3];
    const l1 = limb(0.062, pants), l2 = limb(0.055, pants);
    setLimb(l1, foot, knee); setLimb(l2, knee, [sx * 0.09, 0.93, 0.22]);
    rider.add(l1, l2);
    add(rider, new RoundedBoxGeometry(0.095, 0.06, 0.26, 4, Math.min(0.095, 0.06, 0.26) * 0.3), shoeM, foot[0], 0.2, foot[2] - 0.03);
    legs.push(l1, l2);
  }
  // bras (mis à jour chaque frame pour suivre le guidon)
  const arms = [], hands = [];
  for (const sx of [-1, 1]) {
    const upper = limb(0.048, jacket), fore = limb(0.042, jacket);
    const hand = add(rider, new THREE.SphereGeometry(0.035, 25, 20), glove, 0, 0, 0);
    rider.add(upper, fore);
    arms.push({ sx, upper, fore, hand });
  }

  const pivot = [0, 0.13, -0.58];
  function updateArms(steerAngle) {
    const c = Math.cos(steerAngle), s = Math.sin(steerAngle);
    for (const a of arms) {
      // position de la poignée dans le repère du bloc de direction, puis rotation autour de Y
      const px = a.sx * 0.27, py = topY, pz = topZ;
      const gx = pivot[0] + px * c + pz * s, gz = pivot[2] - px * s + pz * c, gy = pivot[1] + py + 0.01;
      const shoulder = [a.sx * 0.2, 1.38, 0.17];
      const elbow = [a.sx * 0.3, 1.1, -0.12];
      setLimb(a.upper, shoulder, elbow);
      setLimb(a.fore, elbow, [gx, gy, gz]);
      a.hand.position.set(gx, gy, gz);
    }
  }
  updateArms(0);

  function setView(fp) { body.visible = !fp; }
  setView(true);
  function setRider(opts = {}) {
    const hair = ['helmet', 'bald', 'short', 'medium', 'long'].includes(opts.hair) ? opts.hair : 'helmet';
    hel.visible = hair === 'helmet';
    Object.entries(hairStyles).forEach(([name, g]) => { g.visible = hair === name; });
    glassesGroup.visible = !!opts.glasses;
    const skinColor = opts.skin === 'dark' ? 0x6f422c : 0xe0b08c;
    skin.color.setHex(skinColor); glove.color.setHex(skinColor);
    try { jacket.color.set(opts.vest || '#202a36'); } catch { jacket.color.set('#202a36'); }
  }

  function setAccent(hex) { /* v9.28 : le haut du corps reste noir, la couleur d'accent ne le teinte plus */ }

  return {
    root, lean, steer, wF, wR, head, spot, tailLight, lamp, tailM, mats, rider,
    setView, setAccent, setCup, setRider,
    setLanding(strength = 1) { landingAt = performance.now(); landingStrength = Math.max(0, Math.min(1, strength)); },
    // chute : p = 0 (debout) → 1 (au sol), side = ±1 (côté de la chute)
    setFall(p, side = 1) {
      root.rotation.z = side * p * 1.38;
      root.rotation.x = -p * 0.1;
      root.position.y = p * 0.11;
      rider.rotation.x = -p * 1.05;
      rider.position.set(side * p * 0.1, 0, -p * 0.45);
    },
    update(steerNorm, spinF, headOn, tailOn, braking, speed) {
      const ang = -steerNorm * 0.62;               // + steer = droite -> rotation Y négative
      steer.rotation.y = ang;
      const landingT = (performance.now() - landingAt) / 480;
      lean.position.y = landingT >= 0 && landingT < 1 ? Math.sin(landingT * Math.PI) * landingStrength * 0.15 : 0;
      if (hairStyles.long) { const wind = Math.min(1, speed / 8), t = performance.now() * 0.002; hairStyles.long.rotation.x = -0.06 - wind * 0.28 + Math.sin(t) * 0.025; hairStyles.long.rotation.z = Math.sin(t * 0.7) * (0.018 + wind * 0.035); hairStyles.long.rotation.y = Math.sin(t * 0.55) * 0.025; }
      updateArms(ang);
      wF.rotation.x -= spinF; wR.rotation.x -= spinF;
      const k = Math.min(1, speed / 6);
      lean.rotation.z = -steerNorm * 0.16 * k;
      spot.intensity = headOn ? 70 : 0;
      lamp.emissiveIntensity = headOn ? 2.2 : 0;
      tailM.emissiveIntensity = tailOn ? (braking ? 3.2 : 1.4) : (braking ? 3.2 : 0);
    },
    dispose() {
      root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      mats.concat([jacket, pants, skin, helmet, glove, shoeM, hairMat, glassesMat]).forEach(m => m.dispose());
    }
  };
}
