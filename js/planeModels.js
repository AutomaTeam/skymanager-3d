/* ============================================================
   planeModels.js — Modeles 3D des petits avions du hangar

   Trois fabriques procedurales (pas de fichier a charger) :
   Pioupiou (aile haute, helice), Zebulon (voltige, aile basse)
   et, plus tard, d'autres. Chaque modele rend :
     group     : Group, origine au centre de gravite, avant = -Z
     body      : materiaux « couleur de carrosserie »
     accent    : materiaux « couleur d'accent »
     slots     : emplacements des decalques pour livery.js
     update()  : animation (helice, gouvernes)

   Les cotes suivent le profil de js/fleet.js : le bas des roues est
   a groundY sous le centre de gravite.
   ============================================================ */

import * as THREE from 'three';

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({
  color, roughness: o.rough ?? 0.45, metalness: o.metal ?? 0.1,
  transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide,
  envMapIntensity: o.env ?? 0.8, emissive: o.emissive ?? 0x000000
});

/* Fuselage de revolution : profil [[rayon, z], ...], de l'avant vers l'arriere. */
function lathe(profile, m, seg = 24) {
  const geo = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), seg);
  geo.rotateX(Math.PI / 2);
  return new THREE.Mesh(geo, m);
}

/* Plaque horizontale (aile, stabilisateur) a partir d'un contour (x, z). */
function slab(points, thick, m, y = 0) {
  const sh = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.35, bevelSize: thick * 0.45, bevelSegments: 2, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y - thick / 2, 0);
  return new THREE.Mesh(geo, m);
}

/* Plaque verticale (derive) a partir d'un contour (z, y), epaisseur selon X. */
function fin(points, thick, m) {
  const sh = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? sh.lineTo(-z, y) : sh.moveTo(-z, y)));
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.3, bevelSize: thick * 0.4, bevelSegments: 2 });
  geo.rotateY(Math.PI / 2);
  geo.translate(-thick / 2, 0, 0);
  return new THREE.Mesh(geo, m);
}

const cyl = (r0, r1, h, m, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m);

/* Jambe oblique entre deux points. */
function strut(a, b, r, m) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const mesh = cyl(r, r, len, m, 6);
  mesh.position.copy(A).add(B).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return mesh;
}

function wheel(r, w, tireM, hubM) {
  const g = new THREE.Group();
  const t = cyl(r, r, w, tireM, 14);
  t.rotation.z = Math.PI / 2;
  const h = cyl(r * 0.55, r * 0.55, w + 0.02, hubM, 10);
  h.rotation.z = Math.PI / 2;
  g.add(t, h);
  return g;
}

/* Rayon d'un fuselage de revolution a l'abscisse z (interpolation du profil). */
function radiusFrom(profile) {
  return (z) => {
    if (z <= profile[0][1]) return profile[0][0];
    for (let i = 1; i < profile.length; i++) {
      if (z <= profile[i][1]) {
        const [r0, z0] = profile[i - 1], [r1, z1] = profile[i];
        return r0 + (r1 - r0) * (z - z0) / (z1 - z0 || 1);
      }
    }
    return profile[profile.length - 1][0];
  };
}

function shadows(group) {
  group.traverse(o => { if (o.isMesh && !o.userData.noShadow) { o.castShadow = true; o.receiveShadow = false; } });
}

/* Helice : deux pales + disque flou. */
function makeProp(radius, bladeM, discM) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, radius * 0.96, 0.035), bladeM);
    b.position.y = (i ? -1 : 1) * radius * 0.5;
    spin.add(b);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), discM);
  disc.userData.noShadow = true;
  g.add(spin, disc);
  return { group: g, spin, disc };
}

/* ============================================================
   PIOUPIOU — aile haute, helice, train fixe
   ============================================================ */
function buildPioupiou(opts = {}) {
  const group = new THREE.Group();
  const body = mat(opts.bodyColor ?? 0xf4f0e6, { rough: 0.38 });
  const accent = mat(opts.accentColor ?? 0xe53935, { rough: 0.38 });
  const dark = mat(0x2a2f36, { rough: 0.7 });
  const glass = mat(0x0f2740, { rough: 0.05, metal: 0.8, transparent: true, opacity: 0.62, env: 1.3 });
  const skin = mat(0xf1c9a5, { rough: 0.7 });
  const metal = mat(0xb9c0c8, { rough: 0.35, metal: 0.8 });

  const prof = [[0.0, -3.02], [0.2, -2.98], [0.38, -2.82], [0.5, -2.55], [0.58, -2.15], [0.62, -1.6], [0.62, -0.5], [0.55, 0.6], [0.4, 1.8], [0.24, 3.0], [0.13, 4.0], [0.07, 4.4]];
  group.add(lathe(prof, body));
  /* Capot moteur et cone d'helice : couleur d'accent */
  const cowl = lathe([[0.0, -3.08], [0.2, -3.04], [0.4, -2.9], [0.52, -2.62], [0.595, -2.22], [0.63, -1.95]], accent);
  group.add(cowl);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 14), accent);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -3.2;
  group.add(spinner);

  const prop = makeProp(1.08, dark, new THREE.MeshBasicMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  prop.group.position.z = -3.0;
  group.add(prop.group);

  /* Verriere et pilotes */
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(0.5, 0.36, 1.0);
  canopy.position.set(0, 0.52, -0.55);
  group.add(canopy);
  for (const [z] of [[-0.9], [-0.15]]) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skin);
    head.position.set(0, 0.5, z);
    head.userData.noShadow = true;
    group.add(head);
  }

  /* Aile haute */
  const wing = slab([[-5.45, -0.25], [-5.35, 0.5], [-2.2, 0.62], [0, 0.66], [2.2, 0.62], [5.35, 0.5], [5.45, -0.25], [2.2, -0.9], [0, -1.0], [-2.2, -0.9]].map(([x, z]) => [x, z]), 0.13, body, 0.74);
  group.add(wing);
  const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.6), accent);
  tipL.position.set(-5.3, 0.74, 0.1);
  const tipR = tipL.clone();
  tipR.position.x = 5.3;
  group.add(tipL, tipR);
  for (const s of [-1, 1]) {
    group.add(strut([s * 0.5, -0.4, -0.2], [s * 2.9, 0.7, -0.2], 0.035, metal));
    group.add(strut([s * 0.5, -0.4, 0.15], [s * 2.9, 0.7, 0.15], 0.03, metal));
  }
  /* Ailerons */
  const ailerons = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Group();
    p.position.set(s * 3.9, 0.74, 0.5);
    const a = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.38), accent);
    a.position.z = 0.19;
    p.add(a);
    group.add(p);
    ailerons.push(p);
  }

  /* Empennage */
  group.add(slab([[-1.9, 3.5], [-1.9, 4.1], [0, 4.35], [1.9, 4.1], [1.9, 3.5], [0, 3.2]], 0.07, body, 0.3));
  group.add(fin([[2.7, 0.2], [3.15, 1.55], [3.75, 1.55], [4.1, 0.3]], 0.08, body));
  const elev = new THREE.Group();
  elev.position.set(0, 0.3, 4.12);
  const eb = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.05, 0.5), accent);
  eb.position.z = 0.2;
  elev.add(eb);
  group.add(elev);
  const rud = new THREE.Group();
  rud.position.set(0, 0.2, 4.08);
  const rb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.25, 0.42), accent);
  rb.position.set(0, 0.62, 0.0);
  rud.add(rb);
  group.add(rud);

  /* Train fixe, ou flotteurs pour l'hydravion */
  const tireM = mat(0x1d2025, { rough: 0.95 });
  const addGear = (x, y, z, r, w, top) => {
    const wh = wheel(r, w, tireM, metal);
    wh.position.set(x, y, z);
    group.add(wh);
    return wh;
  };
  const wheels = [];
  if (opts.floats) {
    for (const s of [-1, 1]) {
      const fl = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 3.6, 6, 12), accent);
      fl.rotation.x = Math.PI / 2;
      fl.scale.set(1, 1, 0.8);
      fl.position.set(s * 1.35, -1.2, 0.05);
      group.add(fl);
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), accent);
      nose.scale.set(1, 0.8, 1.6); nose.position.set(s * 1.35, -1.2, -2.15);
      group.add(nose);
      group.add(strut([s * 0.45, -0.35, -0.45], [s * 1.3, -1.0, -0.9], 0.05, metal));
      group.add(strut([s * 0.45, -0.35, 0.35], [s * 1.3, -1.0, 0.9], 0.05, metal));
    }
  } else {
    wheels.push(addGear(0, -1.19, -1.65, 0.26, 0.12));
    group.add(strut([0, -0.35, -1.55], [0, -1.15, -1.65], 0.045, metal));
    for (const s of [-1, 1]) {
      wheels.push(addGear(s * 1.15, -1.2, 0.25, 0.3, 0.14));
      group.add(strut([s * 0.45, -0.35, -0.1], [s * 1.12, -1.15, 0.25], 0.05, metal));
      const pant = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), accent);
      pant.scale.set(0.45, 0.85, 1.25);
      pant.position.set(s * 1.15, -1.2, 0.25);
      group.add(pant);
    }
  }

  /* Feux */
  const nav = (x, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, 0.74, 0.1); m.userData.noShadow = true; group.add(m); return m; };
  nav(-5.55, 0xff2d2d); nav(5.55, 0x2dff6a);

  shadows(group);
  const slots = {
    radius: radiusFrom(prof),
    band: { z0: -1.8, z1: 2.2, yc: -0.08, h: 0.26 },
    name: { z0: -1.5, z1: 2.4, yc: 0.2, h: 0.17 },
    stickers: [
      { z: -2.35, yc: 0.05, size: 0.42, radius: 0.52 },
      { z: 2.1, yc: 0.1, size: 0.34, radius: 0.34 },
      { z: 0.9, yc: 0.25, size: 0.3, radius: 0.55 }
    ],
    tailFin: { zc: 3.5, yc: 0.95, size: 0.5, halfThick: 0.045 }
  };
  return {
    id: opts.id || 'pioupiou', group, body: [body], accent: [accent], slots,
    update(ac, dt, t) {
      const rpm = 8 + (ac.n1 - 20) * 0.9;
      prop.spin.rotation.z += rpm * dt;
      prop.disc.material.opacity = THREE.MathUtils.clamp((ac.n1 - 35) / 80, 0, 0.55) * 0.5;
      ailerons[0].rotation.x = -ac.ctl.roll * 0.45;
      ailerons[1].rotation.x = ac.ctl.roll * 0.45;
      elev.rotation.x = -ac.ctl.pitch * 0.4;
      rud.rotation.y = -ac.ctl.yaw * 0.45;
      if (ac.onGround) wheels.forEach(w => { w.rotation.x -= ac.tas / 0.3 * dt; });
    }
  };
}

/* ============================================================
   ZEBULON — avion de voltige, aile basse, verriere bulle
   ============================================================ */
function buildZebulon() {
  const group = new THREE.Group();
  const body = mat(0xfff4d6, { rough: 0.3 });
  const accent = mat(0xff7a1a, { rough: 0.3 });
  const dark = mat(0x23272e, { rough: 0.7 });
  const glass = mat(0x10304f, { rough: 0.04, metal: 0.85, transparent: true, opacity: 0.55, env: 1.4 });
  const skin = mat(0xe8b896, { rough: 0.7 });
  const metal = mat(0xc4cbd3, { rough: 0.3, metal: 0.85 });

  const prof = [[0.0, -2.55], [0.22, -2.5], [0.4, -2.32], [0.52, -2.0], [0.58, -1.5], [0.58, -0.5], [0.5, 0.7], [0.33, 1.9], [0.2, 3.0], [0.1, 3.8], [0.06, 4.0]];
  group.add(lathe(prof, body));
  group.add(lathe([[0.0, -2.62], [0.22, -2.57], [0.42, -2.4], [0.545, -2.08], [0.595, -1.7]], accent));
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 14), accent);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -2.78;
  group.add(spinner);
  const prop = makeProp(1.0, dark, new THREE.MeshBasicMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  prop.group.position.z = -2.58;
  group.add(prop.group);

  /* Verriere bulle et pilote */
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(0.46, 0.5, 1.15);
  canopy.position.set(0, 0.38, 0.0);
  group.add(canopy);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skin);
  head.position.set(0, 0.5, 0.0);
  head.userData.noShadow = true;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), accent);
  helmet.position.copy(head.position);
  helmet.userData.noShadow = true;
  group.add(head, helmet);

  /* Aile basse, epaisse, bouts rayes */
  const wing = slab([[-3.95, -0.1], [-3.9, 0.55], [-1.5, 0.75], [0, 0.8], [1.5, 0.75], [3.9, 0.55], [3.95, -0.1], [1.5, -1.0], [0, -1.15], [-1.5, -1.0]], 0.2, body, -0.28);
  group.add(wing);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.215, 0.95), accent);
    tip.position.set(s * 3.5, -0.28, 0.22);
    group.add(tip);
  }
  const ailerons = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Group();
    p.position.set(s * 2.55, -0.28, 0.62);
    const a = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.07, 0.38), accent);
    a.position.z = 0.19;
    p.add(a);
    group.add(p);
    ailerons.push(p);
  }

  /* Empennage haut et large */
  group.add(slab([[-1.85, 2.9], [-1.85, 3.45], [0, 3.7], [1.85, 3.45], [1.85, 2.9], [0, 2.7]], 0.08, body, 0.2));
  group.add(fin([[2.1, 0.1], [2.5, 1.55], [3.25, 1.55], [3.75, 0.25]], 0.09, body));
  const elev = new THREE.Group();
  elev.position.set(0, 0.2, 3.45);
  const eb = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.06, 0.48), accent);
  eb.position.z = 0.24;
  elev.add(eb);
  group.add(elev);
  const rud = new THREE.Group();
  rud.position.set(0, 0.15, 3.5);
  const rb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.45), accent);
  rb.position.set(0, 0.65, 0.0);
  rud.add(rb);
  group.add(rud);

  /* Train fixe carene */
  const tireM = mat(0x1d2025, { rough: 0.95 });
  const wheels = [];
  const nw = wheel(0.24, 0.11, tireM, metal);
  nw.position.set(0, -1.11, -1.5);
  group.add(nw, strut([0, -0.35, -1.4], [0, -1.08, -1.5], 0.04, metal));
  wheels.push(nw);
  for (const s of [-1, 1]) {
    const w = wheel(0.28, 0.13, tireM, metal);
    w.position.set(s * 1.05, -1.12, 0.2);
    group.add(w, strut([s * 0.4, -0.5, -0.1], [s * 1.02, -1.08, 0.2], 0.045, metal));
    const pant = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), accent);
    pant.scale.set(0.42, 0.8, 1.3);
    pant.position.set(s * 1.05, -1.12, 0.2);
    group.add(pant);
    wheels.push(w);
  }

  /* Pots de fumee sous les ailes (decor) */
  for (const s of [-1, 1]) {
    const pod = cyl(0.07, 0.07, 0.5, dark, 8);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(s * 2.2, -0.5, 0.5);
    group.add(pod);
  }

  const nav = (x, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, -0.28, 0.3); m.userData.noShadow = true; group.add(m); return m; };
  nav(-3.98, 0xff2d2d); nav(3.98, 0x2dff6a);

  shadows(group);
  const slots = {
    radius: radiusFrom(prof),
    band: { z0: -1.3, z1: 2.2, yc: -0.06, h: 0.24 },
    name: { z0: -1.0, z1: 2.2, yc: 0.18, h: 0.15 },
    stickers: [
      { z: -1.9, yc: 0.05, size: 0.4, radius: 0.5 },
      { z: 2.1, yc: 0.08, size: 0.32, radius: 0.3 },
      { z: 0.9, yc: -0.05, size: 0.3, radius: 0.52 }
    ],
    tailFin: { zc: 3.0, yc: 0.95, size: 0.5, halfThick: 0.05 }
  };
  return {
    id: 'zebulon', group, body: [body], accent: [accent], slots,
    update(ac, dt, t) {
      const rpm = 8 + (ac.n1 - 20) * 1.0;
      prop.spin.rotation.z += rpm * dt;
      prop.disc.material.opacity = THREE.MathUtils.clamp((ac.n1 - 35) / 80, 0, 0.55) * 0.5;
      ailerons[0].rotation.x = -ac.ctl.roll * 0.5;
      ailerons[1].rotation.x = ac.ctl.roll * 0.5;
      elev.rotation.x = -ac.ctl.pitch * 0.45;
      rud.rotation.y = -ac.ctl.yaw * 0.5;
      if (ac.onGround) wheels.forEach(w => { w.rotation.x -= ac.tas / 0.28 * dt; });
    }
  };
}

export const MODEL_BUILDERS = {
  pioupiou: () => buildPioupiou(),
  hydravion: () => buildPioupiou({ id: 'hydravion', floats: true, bodyColor: 0xfff1a8, accentColor: 0x1e6fe0 }),
  zebulon: buildZebulon
};

export function buildPlaneModel(id) {
  const b = MODEL_BUILDERS[id];
  return b ? b() : null;
}
