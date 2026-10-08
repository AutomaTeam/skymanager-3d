/* ============================================================
   scenery.js — Decor de l'aeroport et de son environnement (phase 22)

   Avant : une plaine verte infinie, 26 cones de roche a l'horizon et 500
   arbres uniformes. Maintenant :

   PAYSAGE (buildLandscape)
   - trois chaines de montagnes en anneau, de plus en plus lointaines et
     claires (perspective atmospherique), sommets enneiges ;
   - un patchwork de champs (cultures, prairies, jachere) teintes par
     instance : un seul appel de dessin ;
   - des forets en bosquets (pins et feuillus), jamais dans l'enceinte ;
   - une ville a l'ouest (quartiers, tours, clocher) et un village a l'est,
     un lac, une route reliant l'aeroport au village.

   DECOR DE L'AEROPORT (buildAirportDecor)
   - numeros de piste peints, feux de seuil verts et de fin de piste rouges ;
   - panneaux de taxiway, mats d'eclairage de l'aire, lampadaires du parking ;
   - parvis cote ville : trottoir, passage pieton, abribus, bancs, massifs,
     rangees d'arbres, barriere et guerite d'entree.

   Tout est instancie ou fusionne : quelques dizaines d'appels de dessin.
   ============================================================ */
import * as THREE from 'three';
import { mergeStaticByMaterial } from './staticMerge.js?v=1791470282';

/* Enceinte de l'aeroport : rien de naturel n'y pousse. */
const AIRPORT = { x0: -300, x1: 800, z0: -1750, z1: 1900 };
const inAirport = (x, z, pad = 0) =>
  x > AIRPORT.x0 - pad && x < AIRPORT.x1 + pad && z > AIRPORT.z0 - pad && z < AIRPORT.z1 + pad;

/* Sites naturels et batis : ni champ ni arbre par-dessus. */
const SITES = [
  { x: -3300, z: 300, rx: 1050, rz: 1050 },      // ville
  { x: 4300, z: -900, rx: 520, rz: 520 },        // village
  { x: 1900, z: -3300, rx: 950, rz: 620 }        // lac
];
function onSite(x, z, pad = 0) {
  for (const s of SITES) {
    const dx = (x - s.x) / (s.rx + pad), dz = (z - s.z) / (s.rz + pad);
    if (dx * dx + dz * dz < 1) return true;
  }
  /* Routes de l'est. */
  if (x > 690 && x < 4460 && Math.abs(z - 1290) < 22 + pad) return true;
  if (Math.abs(x - 4420) < 22 + pad && z < 1300 && z > -1000) return true;
  return false;
}
/* Evite le scintillement des surfaces posees a quelques centimetres du sol. */
function po(m, k = 1) { m.polygonOffset = true; m.polygonOffsetFactor = -2 * k; m.polygonOffsetUnits = -2 * k; return m; }

/* Bruit deterministe (le decor est identique d'une partie a l'autre). */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function vnoise(x, z) {                       // bruit de valeur lisse, [0,1]
  const h = (i, j) => { const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return n - Math.floor(n); };
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
}
const fbm = (x, z) => 0.55 * vnoise(x, z) + 0.28 * vnoise(x * 2.1, z * 2.1) + 0.17 * vnoise(x * 4.3, z * 4.3);

/* ============================================================
   PAYSAGE
   ============================================================ */
export function buildLandscape({ TEX, pbr }) {
  const group = new THREE.Group();
  group.name = 'landscape';
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();

  /* ---- Chaines de montagnes ---- */
  const ridge = (R, hMax, run, base, seed, snow) => {
    const N = 320, ROWS = 7;
    const pos = [], colors = [], idx = [];
    const ph = [seed * 1.3, seed * 2.1, seed * 3.7, seed * 5.9];
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI * 2;
      /* Profil du sommet : somme de sinus entiers => la chaine se referme. */
      let f = 0.5 + 0.22 * Math.sin(3 * th + ph[0]) + 0.16 * Math.sin(5 * th + ph[1])
        + 0.11 * Math.sin(9 * th + ph[2]) + 0.07 * Math.sin(17 * th + ph[3]) + 0.05 * Math.sin(41 * th + ph[1]);
      f = Math.max(0.12, f);
      const h = hMax * f;
      for (let j = 0; j <= ROWS; j++) {
        const t = j / ROWS;                                   // 0 pied, 1 sommet
        const r = R + (1 - t) * run * (0.6 + f);
        pos.push(Math.cos(th) * r, -60 + t * (h + 60), Math.sin(th) * r);
        /* Couleur : foret au pied, roche, neige au sommet. */
        const n = vnoise(i * 0.35 + j, j * 1.7 + seed) * 0.25;
        if (t < 0.28) col.setHex(base.low).lerp(col.clone().setHex(base.mid), t / 0.28);
        else col.setHex(base.mid).lerp(col.clone().setHex(base.high), Math.min(1, (t - 0.28) / 0.5));
        if (snow && t > 0.78 && f > 0.55) col.lerp(new THREE.Color(0xf4f7fb), Math.min(1, (t - 0.78) * 6));
        col.offsetHSL(0, 0, n - 0.12);
        colors.push(col.r, col.g, col.b);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < ROWS; j++) {
        const a = i * (ROWS + 1) + j, b = (i + 1) * (ROWS + 1) + j;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    return mesh;
  };
  group.add(ridge(8200, 420, 2600, { low: 0x2f5a30, mid: 0x4d6b3a, high: 0x77806a }, 1, false));
  group.add(ridge(13500, 950, 5200, { low: 0x466a58, mid: 0x6c7f84, high: 0x9aa4ad }, 2, true));
  group.add(ridge(21000, 1900, 9000, { low: 0x6f8aa6, mid: 0x93a6bb, high: 0xc3cfdc }, 3, true));

  /* ---- Champs : une cellule de 700 m par parcelle ---- */
  {
    const CELL = 700, RMIN = 900, RMAX = 7200;
    const cells = [];
    const rnd = rng(11);
    for (let cx = -Math.ceil(RMAX / CELL); cx <= Math.ceil(RMAX / CELL); cx++) {
      for (let cz = -Math.ceil(RMAX / CELL); cz <= Math.ceil(RMAX / CELL); cz++) {
        const x = cx * CELL + (rnd() - 0.5) * 60, z = cz * CELL + (rnd() - 0.5) * 60;
        const d = Math.hypot(x, z);
        if (d < RMIN || d > RMAX) continue;
        if (inAirport(x, z, 260) || onSite(x, z, 420)) continue;
        cells.push({ x, z, w: 470 + rnd() * 190, d: 470 + rnd() * 190, rot: (rnd() - 0.5) * 0.35, k: rnd() });
      }
    }
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = po(pbr(TEX.grass(), { color: 0xffffff, rough: 0.95, repeat: [3, 3] }), 1);
    const im = new THREE.InstancedMesh(geo, mat, cells.length);
    const tints = [0x9cc06a, 0xb5c86a, 0xd6c36a, 0x86ad5c, 0xc8a56a, 0xa2b978, 0xe0d08a, 0x7fa860];
    cells.forEach((c, i) => {
      Q.setFromAxisAngle(Y, c.rot);
      M.compose(P.set(c.x, -0.035, c.z), Q, S.set(c.w, 1, c.d));
      im.setMatrixAt(i, M);
      im.setColorAt(i, col.setHex(tints[Math.floor(c.k * tints.length) % tints.length]).multiplyScalar(1.9));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.receiveShadow = false;
    group.add(im);
    /* Haies : lignes sombres entre certaines parcelles. */
    const hedgeMat = new THREE.MeshLambertMaterial({ color: 0x2f5327 });
    const hedges = cells.filter((_, i) => i % 3 === 0);
    const hg = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 2.4, 3), hedgeMat, hedges.length);
    hedges.forEach((c, i) => {
      Q.setFromAxisAngle(Y, c.rot);
      M.compose(P.set(c.x, 1.2, c.z + c.d / 2 + 4), Q, S.set(c.w * 0.98, 1, 1));
      hg.setMatrixAt(i, M);
    });
    hg.instanceMatrix.needsUpdate = true;
    group.add(hg);
  }

  /* ---- Forets : pins et feuillus en bosquets ---- */
  {
    const rnd = rng(23);
    const pines = [], round = [];
    let tries = 0;
    while (pines.length + round.length < 3600 && tries < 90000) {
      tries++;
      const a = rnd() * Math.PI * 2, d = 500 + Math.pow(rnd(), 0.7) * 7500;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (inAirport(x, z, 150) || onSite(x, z, 60)) continue;
      const n = fbm(x / 900 + 7, z / 900 + 3);
      if (n < 0.5) continue;                                 // hors des bosquets
      const item = { x, z, s: 1.1 + rnd() * 1.6, r: rnd() * 6.28, k: rnd() };
      (n > 0.62 && rnd() < 0.7 ? pines : round).push(item);
    }
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 5, 5);
    trunkGeo.translate(0, 2.5, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3626 });
    const pineGeo = (() => {
      const a = new THREE.ConeGeometry(4.4, 9, 6); a.translate(0, 8.5, 0);
      const b = new THREE.ConeGeometry(3.4, 8, 6); b.translate(0, 13, 0);
      const c = new THREE.ConeGeometry(2.3, 6, 6); c.translate(0, 17, 0);
      return mergeGeos([a, b, c]);
    })();
    const roundGeo = (() => {
      const a = new THREE.IcosahedronGeometry(4.2, 0); a.translate(0, 9, 0);
      const b = new THREE.IcosahedronGeometry(3.1, 0); b.translate(2.2, 7.6, 1.2);
      return mergeGeos([a, b]);
    })();
    const pineMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const roundMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const place = (list, geo, mat, withTrunk) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const tr = withTrunk ? new THREE.InstancedMesh(trunkGeo, trunkMat, list.length) : null;
      list.forEach((t, i) => {
        Q.setFromAxisAngle(Y, t.r);
        M.compose(P.set(t.x, 0, t.z), Q, S.set(t.s, t.s * (0.85 + t.k * 0.4), t.s));
        im.setMatrixAt(i, M);
        if (tr) tr.setMatrixAt(i, M);
        im.setColorAt(i, col.setHSL(mat === pineMat ? 0.34 + t.k * 0.03 : 0.22 + t.k * 0.1, 0.38, 0.15 + t.k * 0.08));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      group.add(im);
      if (tr) { tr.instanceMatrix.needsUpdate = true; group.add(tr); }
    };
    place(pines, pineGeo, pineMat, true);
    place(round, roundGeo, roundMat, true);
  }

  /* ---- Villes ---- */
  const houseTown = (cx, cz, radius, count, seed, tall) => {
    const rnd = rng(seed);
    const houses = [];
    /* Quartiers en damier, jitter par ilot. */
    const BLOCK = 46;
    for (let bx = -radius; bx <= radius; bx += BLOCK) {
      for (let bz = -radius; bz <= radius; bz += BLOCK) {
        const d = Math.hypot(bx, bz);
        if (d > radius || houses.length >= count) continue;
        const inRoad = false;
        if (inRoad) continue;
        const n = 2 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          houses.push({
            x: cx + bx + (rnd() - 0.5) * 26, z: cz + bz + (rnd() - 0.5) * 26,
            w: 7 + rnd() * 7, d: 7 + rnd() * 7, h: 5 + rnd() * 5 + (d < radius * 0.35 ? rnd() * 12 : 0),
            r: Math.round(rnd() * 2) * Math.PI / 2, k: rnd()
          });
        }
      }
    }
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wallMat, houses.length);
    const roofGeo = new THREE.ConeGeometry(0.72, 1, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roofs = new THREE.InstancedMesh(roofGeo, roofMat, houses.length);
    const wallCols = [0xeadfca, 0xd7c9ae, 0xcfd6dd, 0xe3d3c1, 0xbfc7cf, 0xf1ebe0];
    const roofCols = [0xa8442f, 0x5b6470, 0x3e6b8c, 0x6f7a3a, 0xb9a37a, 0x3f4a56, 0x8a3f31];
    houses.forEach((h, i) => {
      Q.setFromAxisAngle(Y, h.r);
      M.compose(P.set(h.x, h.h / 2, h.z), Q, S.set(h.w, h.h, h.d));
      walls.setMatrixAt(i, M);
      walls.setColorAt(i, col.setHex(wallCols[Math.floor(h.k * 97) % wallCols.length]));
      const rh = 2.5 + h.k * 3;
      M.compose(P.set(h.x, h.h + rh / 2, h.z), Q, S.set(h.w * 1.05, rh, h.d * 1.05));
      roofs.setMatrixAt(i, M);
      roofs.setColorAt(i, col.setHex(roofCols[Math.floor(h.k * 61) % roofCols.length]));
    });
    walls.instanceMatrix.needsUpdate = true; roofs.instanceMatrix.needsUpdate = true;
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
    group.add(walls, roofs);

    /* Rues : quadrillage fin de bandes sombres entre les ilots. */
    {
      const roadMat = po(new THREE.MeshLambertMaterial({ color: 0x4c5056 }), 2);
      const lines = [];
      for (let t = -radius + BLOCK / 2; t <= radius; t += BLOCK) {
        const half = Math.sqrt(Math.max(0, radius * radius - t * t));
        if (half < 30) continue;
        lines.push({ x: cx + t, z: cz, len: half * 2, rot: 0 });        // rue nord-sud
        lines.push({ x: cx, z: cz + t, len: half * 2, rot: 1 });        // rue est-ouest
      }
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), roadMat, lines.length);
      lines.forEach((l, i) => {
        const rx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
        const ry = new THREE.Quaternion().setFromAxisAngle(Y, l.rot ? Math.PI / 2 : 0);
        Q.copy(ry).multiply(rx);
        M.compose(P.set(l.x, 0.02, l.z), Q, S.set(7, l.len, 1));
        im.setMatrixAt(i, M);
      });
      im.instanceMatrix.needsUpdate = true;
      group.add(im);
    }

    /* Immeubles du centre. */
    if (tall) {
      const towers = [];
      for (let i = 0; i < 14; i++) {
        const a = rnd() * 6.28, d = rnd() * radius * 0.28;
        towers.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, w: 16 + rnd() * 14, d: 16 + rnd() * 14, h: 45 + rnd() * 90 });
      }
      const glassTex = pbr(TEX.glassGrid(), { color: 0xdfeaf4, rough: 0.2, metal: 0.4, repeat: [2, 4], emissive: 0x2a3a4a, emissiveIntensity: 1 });
      towers.forEach(t => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.d), glassTex);
        m.position.set(t.x, t.h / 2, t.z);
        group.add(m);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.6, 3, t.d * 0.6), new THREE.MeshLambertMaterial({ color: 0x59636e }));
        cap.position.set(t.x, t.h + 1.5, t.z);
        group.add(cap);
      });
    }
    /* Eglise : nef + clocher. */
    const chMat = new THREE.MeshLambertMaterial({ color: 0xe5dcc8 });
    const nave = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 30), chMat);
    nave.position.set(cx + radius * 0.4, 5, cz - radius * 0.3);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(7, 34, 7), chMat);
    tower.position.set(cx + radius * 0.4, 17, cz - radius * 0.3 + 18);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(5, 14, 4), new THREE.MeshLambertMaterial({ color: 0x4b525c }));
    spire.position.set(cx + radius * 0.4, 41, cz - radius * 0.3 + 18);
    spire.rotation.y = Math.PI / 4;
    group.add(nave, tower, spire);
  };
  houseTown(-3300, 300, 900, 4200, 5, true);       // ville a l'ouest
  houseTown(4300, -900, 420, 900, 9, false);       // village a l'est

  /* ---- Lac ---- */
  {
    const lake = new THREE.Mesh(new THREE.CircleGeometry(520, 48),
      po(new THREE.MeshStandardMaterial({ color: 0x2f6f9a, roughness: 0.08, metalness: 0.4, envMapIntensity: 1.2 }), 2));
    lake.rotation.x = -Math.PI / 2;
    lake.scale.set(1.6, 1, 1);
    lake.position.set(1900, -0.02, -3300);
    group.add(lake);
    const shore = new THREE.Mesh(new THREE.RingGeometry(500, 560, 48),
      po(new THREE.MeshLambertMaterial({ color: 0xd8cfa0, side: THREE.DoubleSide }), 3));
    shore.rotation.x = -Math.PI / 2;
    shore.scale.set(1.6, 1, 1);
    shore.position.set(1900, -0.015, -3300);
    group.add(shore);
  }

  /* ---- Route de l'aeroport au village de l'est ---- */
  {
    const roadMat = po(new THREE.MeshLambertMaterial({ color: 0x4a4e55 }), 3);
    const r1 = new THREE.Mesh(new THREE.PlaneGeometry(3700, 12), roadMat);
    r1.rotation.x = -Math.PI / 2;
    r1.position.set(720 + 1850, 0.01, 1290);
    group.add(r1);
    const r2 = new THREE.Mesh(new THREE.PlaneGeometry(12, 2200), roadMat);
    r2.rotation.x = -Math.PI / 2;
    r2.position.set(4420, 0.01, 1290 - 1100);
    group.add(r2);
    const dash = po(new THREE.MeshBasicMaterial({ color: 0xe8e2c0 }), 4);
    const lines = [];
    for (let x = 760; x < 4400; x += 24) lines.push([x, 1290, 0]);
    for (let z = 1270; z > -900; z -= 24) lines.push([4420, z, Math.PI / 2]);
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 0.3), dash, lines.length);
    lines.forEach(([x, z, r], i) => {
      Q.setFromAxisAngle(Y, r);
      M.compose(P.set(x, 0.03, z), Q, S.set(1, 1, 1));
      const rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
      im.setMatrixAt(i, M.multiply(rot));
    });
    im.instanceMatrix.needsUpdate = true;
    group.add(im);
  }
  return group;
}

/* Fusion minimale de geometries non indexees compatibles. */
function mergeGeos(list) {
  let total = 0;
  const parts = list.map(g => { const ng = g.index ? g.toNonIndexed() : g; total += ng.attributes.position.count; return ng; });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let o = 0;
  parts.forEach(g => {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

/* ============================================================
   DECOR DE L'AEROPORT
   ============================================================ */
export function buildAirportDecor({ TEX, pbr, RUNWAY, LAYOUT }) {
  const g = new THREE.Group();
  g.name = 'airportDecor';
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const T = LAYOUT.terminal;
  const metal = pbr(TEX.metal(), { color: 0xcbd5e1, rough: 0.45, metal: 0.65, repeat: [1, 4] });
  const glow = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });

  const numberTex = (txt, col = '#eef2f5') => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = col; x.font = '900 190px "Arial Black", Impact, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(txt, 128, 138);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };

  /* ---- Numeros de piste peints + feux de seuil / de fin ---- */
  {
    const R = RUNWAY;
    const put = (txt, z, rot) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 14),
        new THREE.MeshBasicMaterial({ map: numberTex(txt), transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rot;
      m.position.set(0, 0.045, z);
      g.add(m);
    };
    /* Cap 360 au seuil sud (z = +1500), cap 180 au seuil nord. */
    put('36', R.startZ - 95, 0);
    put('18', R.endZ + 95, Math.PI);

    /* Feux de seuil verts (a l'interieur des extremites) et de fin de piste
       rouges (juste au-dela) : dix de chaque cote de l'axe. */
    const greenM = new THREE.MeshBasicMaterial({ color: 0x22e37a });
    const redM = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    const gg = new THREE.SphereGeometry(0.55, 6, 4);
    const xs = [];
    for (let i = -10; i <= 10; i++) if (i !== 0) xs.push(i * 2.1);
    const row = (mat, z) => {
      const im = new THREE.InstancedMesh(gg, mat, xs.length);
      xs.forEach((x, i) => { M.makeTranslation(x, 0.3, z); im.setMatrixAt(i, M); });
      im.instanceMatrix.needsUpdate = true;
      g.add(im);
    };
    row(greenM, R.startZ - 3);
    row(greenM, R.endZ + 3);
    row(redM, R.startZ + 8);
    row(redM, R.endZ - 8);
  }

  /* ---- Panneaux de taxiway (jaune sur noir) ---- */
  {
    const mkSign = (txt, x, z, rotY, bg = '#facc15', fg = '#111') => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 128;
      const cx = c.getContext('2d');
      cx.fillStyle = bg; cx.fillRect(0, 0, 256, 128);
      cx.strokeStyle = '#111'; cx.lineWidth = 8; cx.strokeRect(4, 4, 248, 120);
      cx.fillStyle = fg; cx.font = '900 84px Arial, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText(txt, 128, 70);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.2), [
        new THREE.MeshLambertMaterial({ color: 0x222222 }), new THREE.MeshLambertMaterial({ color: 0x222222 }),
        new THREE.MeshLambertMaterial({ color: 0x222222 }), new THREE.MeshLambertMaterial({ color: 0x222222 }),
        new THREE.MeshBasicMaterial({ map: t }), new THREE.MeshBasicMaterial({ map: t })
      ]);
      m.position.set(x, 1.2, z);
      m.rotation.y = rotY;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), metal);
      post.position.set(x, 0.6, z);
      g.add(m, post);
    };
    LAYOUT.linkZ.forEach((lz, i) => {
      mkSign(`A${i + 1}`, 38, lz - 16, Math.PI / 2);
      mkSign(`A${i + 1}`, 138, lz - 16, -Math.PI / 2);
    });
    mkSign('RWY 18/36', 34, 1348, Math.PI / 2, '#dc2626', '#fff');
    mkSign('STANDS 1-5', 150, 1090, 0, '#facc15', '#111');
  }

  /* ---- Mats d'eclairage de l'aire (instancies, sans lumiere reelle) ---- */
  {
    const pts = [];
    for (let x = 200; x <= 520; x += 80) { pts.push([x, 880], [x, 1090]); }
    pts.push([150, 780], [150, 1300], [30, 1300]);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.34, 26, 8), metal, pts.length);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(5.2, 0.7, 1.6), glow, pts.length);
    pts.forEach(([x, z], i) => {
      M.makeTranslation(x, 13, z); poles.setMatrixAt(i, M);
      M.makeTranslation(x, 26.4, z); heads.setMatrixAt(i, M);
    });
    poles.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
    poles.castShadow = true;
    g.add(poles, heads);
  }

  /* ---- Cote ville : parvis du terminal ---- */
  {
    const paveMat = pbr(TEX.apron(), { color: 0xb9bec6, rough: 0.9, repeat: [60, 6] });
    /* Trottoir large devant la facade sud. */
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(T.x1 - T.x0 + 20, 16), paveMat);
    walk.rotation.x = -Math.PI / 2;
    walk.position.set((T.x0 + T.x1) / 2, 0.02, T.z1 + 8 + 4);
    walk.receiveShadow = true;
    g.add(walk);
    /* Bordure. */
    const kerb = new THREE.Mesh(new THREE.BoxGeometry(T.x1 - T.x0 + 20, 0.2, 0.4), pbr(TEX.concrete(), { color: 0xd0d5da, rough: 0.8, repeat: [40, 1] }));
    kerb.position.set((T.x0 + T.x1) / 2, 0.1, T.z1 + 22);
    g.add(kerb);
    /* Passages pietons devant chaque porte. */
    const zebra = new THREE.MeshBasicMaterial({ color: 0xe8ecef });
    for (const d of T.landDoors) {
      const bars = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.6, 6), zebra, 9);
      for (let i = 0; i < 9; i++) {
        M.compose(P.set(d.x - 4 + i * 1, 0.03, T.z1 + 26.5), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), S);
        bars.setMatrixAt(i, M);
      }
      bars.instanceMatrix.needsUpdate = true;
      g.add(bars);
    }
    /* Abribus, bancs et massifs le long du trottoir. */
    const glassM = new THREE.MeshStandardMaterial({ color: 0xa9cde2, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.35 });
    const benchM = pbr(TEX.paintedMetal(), { color: 0x3b4654, rough: 0.6, repeat: [1, 1] });
    const woodM = new THREE.MeshLambertMaterial({ color: 0x8b6b45 });
    const shelter = (x) => {
      const s = new THREE.Group();
      s.position.set(x, 0, T.z1 + 19);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(8, 0.25, 3.2), benchM); roof.position.y = 3; s.add(roof);
      for (const dx of [-3.8, 3.8]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3, 0.14), benchM); p.position.set(dx, 1.5, -1.4); s.add(p); }
      const back = new THREE.Mesh(new THREE.BoxGeometry(7.6, 2.4, 0.06), glassM); back.position.set(0, 1.6, -1.5); s.add(back);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(5, 0.1, 0.7), woodM); seat.position.set(0, 0.55, -1.0); s.add(seat);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ color: 0x0f766e })); sign.position.set(3.6, 3.9, 0.2); s.add(sign);
      g.add(s);
    };
    shelter(255); shelter(465);
    /* Massifs d'arbustes et arbres d'alignement entre trottoir et route. */
    const leaf = new THREE.MeshLambertMaterial({ color: 0x4f8a45, flatShading: true });
    const trunk = new THREE.MeshLambertMaterial({ color: 0x5b4330 });
    const shrubs = [];
    for (let x = T.x0 + 6; x < T.x1 + 10; x += 12) {
      if (T.landDoors.some(d => Math.abs(d.x - x) < d.w / 2 + 3)) continue;
      shrubs.push(x);
    }
    const sh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.1, 1), leaf, shrubs.length);
    const tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.22, 2.6, 6), trunk, shrubs.length);
    const cr = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.1, 1), leaf, shrubs.length);
    shrubs.forEach((x, i) => {
      M.makeTranslation(x, 0.7, T.z1 + 15.5); sh.setMatrixAt(i, M);
      M.makeTranslation(x + 6, 1.3, T.z1 + 21); tr.setMatrixAt(i, M);
      M.makeTranslation(x + 6, 3.8, T.z1 + 21); cr.setMatrixAt(i, M);
    });
    [sh, tr, cr].forEach(o => { o.instanceMatrix.needsUpdate = true; o.castShadow = true; g.add(o); });
    /* Bornes anti-vehicule devant les portes. */
    const bollard = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 8), metal, 24);
    let bi = 0;
    for (const d of T.landDoors) for (let k = -5; k <= 5; k += 2) {
      if (bi >= 24 || Math.abs(k) < 1) continue;
      M.makeTranslation(d.x + k * (d.w / 10) * 1.2, 0.45, T.z1 + 15); bollard.setMatrixAt(bi++, M);
    }
    bollard.count = bi;
    bollard.instanceMatrix.needsUpdate = true;
    g.add(bollard);
  }

  /* ---- Parking : lampadaires ---- */
  {
    const pts = [];
    for (let x = 250; x <= 470; x += 44) pts.push([x, 1318], [x, 1358]);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.16, 9, 8), metal, pts.length);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.3, 0.7), glow, pts.length);
    pts.forEach(([x, z], i) => {
      M.makeTranslation(x, 4.5, z); poles.setMatrixAt(i, M);
      M.makeTranslation(x, 9.1, z); heads.setMatrixAt(i, M);
    });
    poles.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
    g.add(poles, heads);
  }

  /* ---- Guerite et barriere d'entree de l'enceinte ---- */
  {
    const ent = LAYOUT.entrance;
    const houseM = pbr(TEX.concrete(), { color: 0xdfe4ea, rough: 0.8, repeat: [2, 1] });
    const booth = new THREE.Group();
    booth.position.set(ent.x - 6, 0, 1200);
    const at = (m, x, y, z) => { m.position.set(x, y, z); booth.add(m); return m; };
    at(new THREE.Mesh(new THREE.BoxGeometry(4, 3, 3), houseM), 0, 1.5, 0);
    at(new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.25, 3.6), pbr(TEX.roof(), { color: 0x9aa3ad, repeat: [1, 1] })), 0, 3.1, 0);
    at(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 2.4), new THREE.MeshStandardMaterial({ color: 0x9fc4dc, transparent: true, opacity: 0.5, roughness: 0.1 })), -2.02, 1.8, 0);
    g.add(booth);
    /* Barriere levee : lisse rayee rouge et blanc. */
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 8), pbr(TEX.hazard(), { color: 0xffffff, rough: 0.7, repeat: [1, 6] }));
    arm.position.set(ent.x - 2, 4.4, 1210);
    arm.rotation.x = 1.2;
    g.add(arm);
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.3, 0.4), houseM);
    sp.position.set(ent.x - 2, 0.65, 1206);
    g.add(sp);
  }
  mergeStaticByMaterial(g);      // D02 : decor statique, un appel de dessin par materiau
  return g;
}
