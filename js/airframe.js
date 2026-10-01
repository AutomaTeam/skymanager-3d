/* ============================================================
   airframe.js — Cellule de l'appareil (phase 21)

   Avant : fuselage en capsule, ailes en plaques extrudees, nacelles en
   simples cylindres, derive en trapeze. Maintenant :

   - fuselage de revolution a profil reel : nez arrondi et radome gris,
     troncon cylindrique (rayon 1,95 m, celui que la cabine suppose),
     cone arriere relevee ;
   - voilure loftee en profils NACA a 5 stations (emplanture, cassure,
     saumon) : fleche, effilement, dihedre, epaisseur decroissante ;
   - sharklets, empennage horizontal profile, derive galbee ;
   - nacelles a levre d'entree, capot, tuyere et pylone profile ;
   - surfaces mobiles (volets, ailerons, spoilers, gouvernes) posees
     sur le bord de fuite reel de la voilure, charniere alignee sur la
     fleche.

   Repere avion : -Z avant, +X droite, +Y haut. Les cotes cles
   (rayon 1,95 m du fuselage entre z = -13 et 9,5 ; garde au sol des
   trains ; position des portes) sont inchangees : la cabine, le
   cockpit, la physique et les points d'interaction s'y appuient.
   ============================================================ */
import * as THREE from 'three';

export const BODY_R = 1.95;
export const NOSE_Z = -20.2;
const NOSE_LEN = 7.2;          // du bout du nez au debut du troncon cylindrique
const TAIL_Z0 = 9.5;           // debut du cone arriere
const TAIL_LEN = 7.1;

/* Rayon du fuselage a l'abscisse z. */
export function fuselageRadius(z) {
  if (z < -13) {
    const t = Math.max(0, (z - NOSE_Z) / NOSE_LEN);
    return BODY_R * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
  }
  if (z <= TAIL_Z0) return BODY_R;
  const u = Math.min(1, (z - TAIL_Z0) / TAIL_LEN);
  return BODY_R - (BODY_R - 0.3) * Math.pow(u, 1.7);
}
const tailLift = z => (z > TAIL_Z0 ? 1.5 * Math.pow((z - TAIL_Z0) / TAIL_LEN, 2) : 0);

/* ---------------------------------------------------------- */
/* Fuselage + radome */
export function makeFuselage(bodyMat, radomeMat) {
  const pts = [];
  for (let i = 0; i <= 22; i++) {                               // nez
    const z = NOSE_Z + (i / 22) * NOSE_LEN;
    pts.push([fuselageRadius(z), z]);
  }
  pts.push([BODY_R, TAIL_Z0]);                                  // troncon cylindrique
  for (let i = 1; i <= 16; i++) {                               // cone arriere
    const z = TAIL_Z0 + (i / 16) * TAIL_LEN;
    pts.push([fuselageRadius(z), z]);
  }
  const geo = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), 40);
  geo.rotateX(Math.PI / 2);
  /* relevage de la queue (sans recalculer les normales : le raccord de
     la revolution resterait visible) */
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  const total = NOSE_LEN + (TAIL_Z0 - (NOSE_Z + NOSE_LEN)) + TAIL_LEN;
  for (let i = 0; i < p.count; i++) {
    /* UV par abscisse reelle : sans cela, le troncon cylindrique (un seul
       segment du profil) etirait la texture de peau sur 22 m. */
    uv.setXY(i, uv.getX(i) * 2, ((p.getZ(i) - NOSE_Z) / total) * 7);
    p.setY(i, p.getY(i) + tailLift(p.getZ(i)));
  }
  const fus = new THREE.Mesh(geo, bodyMat);

  const nosePts = [];
  for (let i = 0; i <= 12; i++) {
    const z = NOSE_Z + (i / 12) * 2.6;
    nosePts.push(new THREE.Vector2(fuselageRadius(z) + 0.012, z));
  }
  const ng = new THREE.LatheGeometry(nosePts, 32);
  ng.rotateX(Math.PI / 2);
  const nose = new THREE.Mesh(ng, radomeMat);
  return { fus, nose };
}

/* ---------------------------------------------------------- */
/* Voilure */
export const WING_STATIONS = [
  { x: 0.0,  le: -2.4, te: 4.7, th: 0.130 },
  { x: 4.2,  le: -0.3, te: 5.2, th: 0.120 },
  { x: 10.0, le: 2.8,  te: 6.6, th: 0.105 },
  { x: 16.6, le: 5.9,  te: 7.7, th: 0.085 },
  { x: 16.95, le: 6.1, te: 7.5, th: 0.060 }
];
const DIHEDRAL = 0.05;
const WING_Y0 = -0.85;

const lerpStation = (x, key) => {
  const S = WING_STATIONS;
  const ax = Math.abs(x);
  for (let i = 0; i < S.length - 1; i++) {
    if (ax <= S[i + 1].x) {
      const t = (ax - S[i].x) / (S[i + 1].x - S[i].x);
      return S[i][key] + (S[i + 1][key] - S[i][key]) * t;
    }
  }
  return S[S.length - 1][key];
};
export const wingLE = x => lerpStation(x, 'le');
export const wingTE = x => lerpStation(x, 'te');
export const wingY = x => WING_Y0 + DIHEDRAL * Math.abs(x);

/* Demi-epaisseur NACA 4 chiffres (bord de fuite legerement ouvert). */
const naca = s => 5 * (0.2969 * Math.sqrt(s) - 0.1260 * s - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1015 * s ** 4);

/* Loft de profils entre stations. `sign` = +1 (droite) ou -1 (gauche). */
export function loftSurface(stations, sign, { camber = 0.02, chordPts = 14 } = {}) {
  const P = chordPts * 2;
  const pos = [], uv = [], idx = [];
  stations.forEach((st, j) => {
    const c = st.te - st.le;
    for (let k = 0; k < P; k++) {
      let s, side;
      if (k <= chordPts) { s = 0.5 - 0.5 * Math.cos(Math.PI * k / chordPts); side = 1; }
      else { s = 0.5 - 0.5 * Math.cos(Math.PI * (P - k) / chordPts); side = -1; }
      const y = st.y + camber * c * 4 * s * (1 - s) + side * naca(s) * st.th * c;
      pos.push(sign * st.x, y, st.le + s * c);
      uv.push(k / P, j / (stations.length - 1));
    }
  });
  for (let j = 0; j < stations.length - 1; j++) {
    for (let k = 0; k < P; k++) {
      const a = j * P + k, b = j * P + (k + 1) % P;
      const c = (j + 1) * P + k, d = (j + 1) * P + (k + 1) % P;
      if (sign > 0) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  /* capuchon de saumon */
  const last = (stations.length - 1) * P;
  for (let k = 1; k < P - 1; k++) {
    if (sign > 0) idx.push(last, last + k + 1, last + k);
    else idx.push(last, last + k, last + k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function makeWings(bodyMat) {
  const st = WING_STATIONS.map(s => ({ ...s, y: wingY(s.x) }));
  const wingR = new THREE.Mesh(loftSurface(st, +1), bodyMat);
  const wingL = new THREE.Mesh(loftSurface(st, -1), bodyMat);
  return { wingL, wingR };
}

/* Sharklets : plaque galbee en bout d'aile, inclinee vers l'exterieur. */
export function makeWinglets(accentMat) {
  const g = new THREE.Group();
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(1.75, 0); sh.lineTo(1.5, 2.5); sh.lineTo(0.95, 2.6); sh.lineTo(0.35, 1.2); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, {
    depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.04, bevelSegments: 2
  });
  geo.rotateY(-Math.PI / 2);
  geo.translate(0.05, 0, 0);
  [-1, 1].forEach(s => {
    const w = new THREE.Mesh(geo, accentMat);
    w.position.set(s * 16.9, wingY(16.9) - 0.02, 5.95);
    w.rotation.z = -s * 0.22;
    g.add(w);
  });
  return g;
}

/* ---------------------------------------------------------- */
/* Surface mobile posee sur le bord de fuite : charniere alignee sur la
   fleche. Le pivot tourne en 'YXZ' pour que rotation.x soit l'angle de
   deflexion autour de la charniere. Retourne { pivot, mesh }. */
export function makeControlSurface({ side, x0, x1, back, chord, thick = 0.14, mat, yTop = 0, hingeFrom = 'te' }) {
  const L = x1 - x0;
  const zH = (x) => (hingeFrom === 'te' ? wingTE(x) - back : wingTE(x) - back);
  const slope = (zH(x1) - zH(x0)) / L;
  const a = Math.atan(slope);
  const pivot = new THREE.Group();
  pivot.rotation.order = 'YXZ';
  pivot.position.set(side * x0, wingY(x0) + yTop, zH(x0));
  pivot.rotation.y = -side * a;
  pivot.rotation.z = side * DIHEDRAL;
  const len = L / Math.cos(a);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, thick, chord), mat);
  mesh.position.set(side * len / 2, 0, chord / 2);
  pivot.add(mesh);
  return { pivot, mesh };
}

/* ---------------------------------------------------------- */
/* Empennage. Renvoie les pieces a assembler par l'appelant :
   - fin     : derive (fixe)                 -> group.add
   - stab    : plan fixe horizontal           -> group.add
   - elevator: gouverne de profondeur, origine a la charniere (pivot TAIL.elev)
   - rudder  : gouverne de direction, origine a la charniere (pivot TAIL.rud) */
export const TAIL = {
  fin: [0, 1.5, 8.0],
  rud: [0, 5.1, 12.65],
  elev: [0, 1.05, 13.6]
};

export function makeTail(bodyMat, accentMat) {
  /* derive */
  const fs = new THREE.Shape();
  fs.moveTo(-1.6, 0); fs.lineTo(0.0, 1.4); fs.lineTo(3.7, 7.2); fs.lineTo(4.4, 7.2); fs.lineTo(4.95, 0); fs.closePath();
  const fg = new THREE.ExtrudeGeometry(fs, {
    depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2
  });
  fg.rotateY(-Math.PI / 2);
  fg.translate(0.13, 0, 0);
  const fin = new THREE.Mesh(fg, accentMat);
  fin.position.set(...TAIL.fin);

  /* plan fixe horizontal, profile */
  const stns = [
    { x: 0.0, le: 10.6, te: 13.6, th: 0.10, y: TAIL.elev[1] },
    { x: 6.6, le: 12.6, te: 13.6, th: 0.075, y: TAIL.elev[1] }
  ];
  const stab = new THREE.Group();
  stab.add(new THREE.Mesh(loftSurface(stns, +1, { camber: 0 }), bodyMat));
  stab.add(new THREE.Mesh(loftSurface(stns, -1, { camber: 0 }), bodyMat));

  /* gouverne de profondeur */
  const es = new THREE.Shape();
  es.moveTo(-6.6, 0); es.lineTo(6.6, 0); es.lineTo(6.6, 0.9); es.lineTo(0, 1.7); es.lineTo(-6.6, 0.9); es.closePath();
  const eg = new THREE.ExtrudeGeometry(es, { depth: 0.1, bevelEnabled: false });
  eg.rotateX(Math.PI / 2);
  eg.translate(0, 0.05, 0);
  const elevator = new THREE.Mesh(eg, bodyMat);

  /* gouverne de direction, charniere legerement inclinee */
  const rs = new THREE.Shape();
  rs.moveTo(0.25, -3.6); rs.lineTo(-0.3, 3.6); rs.lineTo(0.75, 3.6); rs.lineTo(2.0, -3.6); rs.closePath();
  const rg = new THREE.ExtrudeGeometry(rs, {
    depth: 0.14, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1
  });
  rg.rotateY(-Math.PI / 2);
  rg.translate(0.07, 0, 0);
  const rudder = new THREE.Mesh(rg, accentMat);

  return { fin, stab, elevator, rudder };
}

/* ---------------------------------------------------------- */
/* Nacelle : capot exterieur, paroi interne sombre, tuyere, cone d'echappement
   et pylone. Le disque de soufflante est ajoute par l'appelant (il tourne).
   Origine = centre du reacteur ; entree vers -Z. */
export function makeNacelle(bodyMat, darkMat, metalMat) {
  const g = new THREE.Group();
  const outer = [
    [1.06, -2.44], [1.18, -2.30], [1.24, -2.0], [1.27, -1.2], [1.26, 0.2],
    [1.18, 1.3], [1.02, 2.2], [0.86, 2.9]
  ];
  const inner = [
    [1.05, -2.42], [0.96, -2.1], [0.95, -1.4], [0.94, 0.0], [0.90, 1.4],
    [0.82, 2.4], [0.78, 2.9]
  ];
  const mk = (pts, mat) => {
    const geo = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), 28);
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat.clone());
    m.material.side = THREE.DoubleSide;
    return m;
  };
  g.add(mk(outer, bodyMat), mk(inner, darkMat));

  /* levre d'entree metallique */
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1.115, 0.05, 8, 28), metalMat);
  lip.position.z = -2.4;
  g.add(lip);
  /* cone d'echappement */
  const plug = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 16), darkMat);
  plug.rotation.x = Math.PI / 2;
  plug.position.z = 2.5;
  g.add(plug);

  /* pylone profile (plan z-y extrude en x) */
  const ps = new THREE.Shape();
  ps.moveTo(-1.5, 0.95); ps.lineTo(-0.5, 1.55); ps.lineTo(3.6, 1.6); ps.lineTo(3.9, 1.05);
  ps.lineTo(2.6, 0.55); ps.lineTo(-0.8, 0.85); ps.closePath();
  const pg = new THREE.ExtrudeGeometry(ps, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 });
  pg.rotateY(-Math.PI / 2);
  pg.translate(0.15, 0, 0);
  g.add(new THREE.Mesh(pg, bodyMat));
  return g;
}

/* ============================================================
   TRAINS D'ATTERRISSAGE (phase 22)

   Chaque train est un pivot (rotation animee par syncAircraft) portant :
   - une jambe telescopique : cylindre exterieur peint, tige chromee ;
   - contre-fiche, compas (torque links), verin et durites ;
   - un carenage de jambe et une trappe qui suivent la jambe ;
   - des roues : pneu de revolution a flancs bombes, jante, disque de frein.
   Cotes inchangees : pivot a (x, y, z), axe de roue a y - legLen, rayon wheelR,
   donc le contact avec le sol reste celui de la physique (gearPoints).
   `nose` ajoute collier de direction, phare de roulage et garde-boue.
   Renvoie { pivot, wheels } ; chaque roue est un groupe a axe X (elle tourne
   en rotation.x).
   ============================================================ */
export function makeGear({ x, y, z, legLen, wheelR, wheels, nose = false, mats }) {
  const { tireMat, metalMat, darkMat, bodyMat } = mats;
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);

  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.18, metalness: 0.95 });
  const paint = new THREE.MeshStandardMaterial({ color: nose ? 0xaeb6c0 : 0x9aa3ae, roughness: 0.5, metalness: 0.6 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.2 });

  /* Jambe : fut exterieur (haut) + tige (bas). */
  const upper = legLen * 0.55;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, upper, 14), paint);
  barrel.position.y = -upper / 2;
  pivot.add(barrel);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, legLen - upper + 0.1, 12), chrome);
  rod.position.y = -upper - (legLen - upper) / 2 + 0.05;
  pivot.add(rod);
  /* Joint superieur et carenage de jambe. */
  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), paint);
  pivot.add(knuckle);
  const fairing = new THREE.Mesh(new THREE.BoxGeometry(nose ? 0.42 : 0.5, upper * 0.9, nose ? 0.14 : 0.16), bodyMat);
  fairing.position.set(0, -upper * 0.5, nose ? -0.22 : -0.24);
  pivot.add(fairing);

  /* Compas a deux branches articule a mi-jambe. */
  const collarY = -upper;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.12, 14), darkMat);
  collar.position.y = collarY;
  pivot.add(collar);
  for (const sgn of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.05), metalMat);
    arm.position.set(sgn * 0.02, collarY - 0.2, 0.19);
    arm.rotation.z = sgn * 0.5;
    pivot.add(arm);
  }
  /* Verin et durite. */
  const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, upper * 0.9, 6), rubber);
  strut.position.set(0.24, -upper * 0.45, 0.08);
  pivot.add(strut);

  /* Contre-fiche oblique (trains principaux) ou barre de traction (nez). */
  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.09, upper * 1.05, 0.09), darkMat);
  if (nose) {
    brace.position.set(0, -upper * 0.55, 0.36);
    brace.rotation.x = -0.55;
  } else {
    brace.position.set(x < 0 ? 0.42 : -0.42, -upper * 0.45, 0);
    brace.rotation.z = x < 0 ? 0.6 : -0.6;
  }
  pivot.add(brace);

  /* Trappe de train : vantail plat porte par le pivot, cote exterieur. */
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, legLen * 0.95, 0.85), bodyMat);
  if (nose) { door.geometry = new THREE.BoxGeometry(0.62, legLen * 0.6, 0.05); door.position.set(0, -legLen * 0.32, 0.35); }
  else door.position.set(x < 0 ? -0.34 : 0.34, -legLen * 0.48, 0);
  pivot.add(door);

  /* Traverse d'essieu / palonnier. */
  const axleY = -legLen;
  const span = (wheels - 1) * 0.62 + 0.3;
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, span, 10), metalMat);
  axle.rotation.z = Math.PI / 2;
  axle.position.y = axleY;
  pivot.add(axle);
  if (!nose) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.3), darkMat);
    beam.position.set(0, axleY + 0.18, 0);
    pivot.add(beam);
  }

  /* Roues : pneu de revolution + jante + disque de frein. */
  const R = wheelR, halfW = 0.21;
  const tirePts = [
    [R * 0.62, -halfW], [R * 0.90, -halfW], [R * 0.985, -halfW * 0.72], [R, -halfW * 0.3],
    [R, halfW * 0.3], [R * 0.985, halfW * 0.72], [R * 0.90, halfW], [R * 0.62, halfW]
  ].map(([r, yy]) => new THREE.Vector2(r, yy));
  const tireGeo = new THREE.LatheGeometry(tirePts, 24);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(R * 0.64, R * 0.64, halfW * 2.05, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(R * 0.2, R * 0.2, halfW * 2.4, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const discGeo = new THREE.CylinderGeometry(R * 0.5, R * 0.5, 0.03, 16);
  discGeo.rotateZ(Math.PI / 2);
  const boltGeo = new THREE.BoxGeometry(halfW * 2.5, R * 0.05, R * 0.05);
  const ws = [];
  for (let i = 0; i < wheels; i++) {
    const w = new THREE.Group();
    w.position.set((i - (wheels - 1) / 2) * 0.62, axleY, 0);
    w.add(new THREE.Mesh(tireGeo, tireMat));
    w.add(new THREE.Mesh(rimGeo, metalMat));
    w.add(new THREE.Mesh(hubGeo, darkMat));
    if (!nose) w.add(new THREE.Mesh(discGeo, darkMat));
    /* Repere visuel : deux boulons decales, pour que la rotation se voie. */
    for (const a of [0, 2.2, 4.4]) {
      const b = new THREE.Mesh(boltGeo, chrome);
      b.position.set(0, Math.sin(a) * R * 0.42, Math.cos(a) * R * 0.42);
      w.add(b);
    }
    pivot.add(w);
    ws.push(w);
  }

  if (nose) {
    /* Garde-boue et phare de roulage. */
    const guard = new THREE.Mesh(new THREE.BoxGeometry(wheels * 0.62 + 0.1, 0.05, 0.55), bodyMat);
    guard.position.set(0, axleY + R + 0.12, 0);
    pivot.add(guard);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
    lamp.position.set(0, -upper * 0.25, -0.31);
    pivot.add(lamp);
    /* Barre de remorquage. */
    const tow = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), darkMat);
    tow.rotation.x = Math.PI / 2;
    tow.position.set(0, axleY + 0.2, -0.48);
    pivot.add(tow);
  }
  return { pivot, wheels: ws };
}

/* Train fixe pour les appareils gares : memes cotes, memes pieces. */
export function makeStaticGear(mats) {
  const g = new THREE.Group();
  g.add(makeGear({ x: 0, y: -1.6, z: -11.5, legLen: 1.28, wheelR: 0.42, wheels: 2, nose: true, mats }).pivot);
  g.add(makeGear({ x: -3.8, y: -1.6, z: 1.8, legLen: 1.27, wheelR: 0.58, wheels: 2, mats }).pivot);
  g.add(makeGear({ x: 3.8, y: -1.6, z: 1.8, legLen: 1.27, wheelR: 0.58, wheels: 2, mats }).pivot);
  return g;
}
