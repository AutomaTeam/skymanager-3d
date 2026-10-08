/* ============================================================
   terminalBuilding.js — Le terminal, batiment integre a la carte (phase 22)

   Avant, le terminal etait un bloc opaque de 260 m dont seul un hall de
   38 x 34 m au centre etait creux : on y « entrait » par un changement
   d'etat, avec une autre camera et un autre HUD, et le reste du batiment
   n'etait qu'un mur.

   Maintenant c'est un vrai batiment du monde ouvert :

   - facades vitrees cote piste ET cote ville, avec trois portes de chaque
     cote (LAYOUT.terminal) : on entre et on sort a pied, sans transition ;
   - un seul volume interieur de 258 x 68 m, visible depuis l'exterieur a
     travers le vitrage, avec ses comptoirs, ses files, ses commerces, sa
     salle des bagages, ses sanitaires et ses salons d'embarquement ;
   - toit debordant, lanterneau central, enseigne, colonnes, ponts
     d'embarquement stationnes aux quatre autres portes ;
   - tout est construit aux coordonnees du monde ; `LAYOUT.termFurniture`
     donne les obstacles, partages avec la navigation.

   Le rendu est en deux temps : buildTerminalShell() (coque, ouverte des
   la construction de l'aeroport) puis buildTerminalInterior() (mobilier,
   qui a besoin de la liste COUNTERS).
   ============================================================ */
import * as THREE from 'three';
import { LAYOUT } from './layout.js?v=1791465643';
import { SHIRTS } from './terminalFlow.js?v=1791465643';
import { buildTerminalDesign } from './terminalDesign.js?v=1791465643';

const T = LAYOUT.terminal;
const W = T.x1 - T.x0;
const D = T.z1 - T.z0;
const CX = (T.x0 + T.x1) / 2;
const CZ = (T.z0 + T.z1) / 2;
const H = T.h;

/* Limites praticables interieures (= zone `termHall` de navigation.js). */
export const HALL = { x0: T.x0 + 1, x1: T.x1 - 1, z0: T.z0 + 1, z1: T.z1 - 1, h: H };

function mesh(parent, geo, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  if (parent) parent.add(o);
  return o;
}
const box = (parent, w, h, d, m, x, y, z) => mesh(parent, new THREE.BoxGeometry(w, h, d), m, x, y, z);

/* Panneau plan a texte (contrairement a makeSign, ce n'est pas un sprite :
   il reste attache a son mur ou a son cable). */
function panelSign(text, { bg = '#0369a1', fg = '#fff', w = 8, h = 1.6, sub = '', both = false } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.max(64, Math.round(512 * h / w));
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 6;
  x.strokeRect(6, 6, c.width - 12, c.height - 12);
  x.fillStyle = fg;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `800 ${Math.round(c.height * (sub ? 0.42 : 0.5))}px -apple-system, "Segoe UI", sans-serif`;
  x.fillText(text, c.width / 2, c.height * (sub ? 0.38 : 0.52));
  if (sub) {
    x.font = `600 ${Math.round(c.height * 0.24)}px -apple-system, "Segoe UI", sans-serif`;
    x.fillStyle = 'rgba(255,255,255,0.82)';
    x.fillText(sub, c.width / 2, c.height * 0.76);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.MeshBasicMaterial({ map: tex });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  if (!both) return front;
  /* Deux faces dos a dos : le texte reste lisible des deux cotes. */
  const grp = new THREE.Group();
  grp.add(front);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  back.rotation.y = Math.PI;
  back.position.z = -0.02;
  grp.add(back);
  return grp;
}

/* Personnage en un seul maillage : torse, tete et cheveux fusionnes avec
   des couleurs de sommet. 200 figurants = 200 appels de dessin au lieu de
   600 ; le materiau est partage. */
const _personCache = new Map();
function personGeometry(clothHex) {
  if (_personCache.has(clothHex)) return _personCache.get(clothHex);
  const parts = [];
  const add = (geo, y, hex) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.translate(0, y, 0);
    const n = g.attributes.position.count, c = new THREE.Color(hex), arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    parts.push(g);
  };
  add(new THREE.CapsuleGeometry(0.2, 0.85, 2, 6), 0.9, clothHex);
  add(new THREE.SphereGeometry(0.16, 8, 6), 1.5, 0xd8ab7e);
  add(new THREE.SphereGeometry(0.165, 8, 6, 0, 6.283, 0, 1.7), 1.52, 0x2b1c12);
  let total = 0; parts.forEach(p => { total += p.attributes.position.count; });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  parts.forEach(p => {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  _personCache.set(clothHex, out);
  return out;
}
const PERSON_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, emissive: 0x201810, emissiveIntensity: 0.6 });

/* ============================================================
   COQUE
   ============================================================ */
export function buildTerminalShell({ TEX, pbr }) {
  const g = new THREE.Group();
  g.name = 'terminalShell';

  const wallMat = pbr(TEX.facade(), { color: 0xd9e0e7, rough: 0.72, metal: 0.05, repeat: [8, 1] });
  const concreteMat = pbr(TEX.concrete(), { color: 0xd3d9df, rough: 0.8, repeat: [1, 3] });
  const roofMat = pbr(TEX.roof(), { color: 0xb8bec6, rough: 0.95, repeat: [10, 6] });
  const frameMat = pbr(TEX.metal(), { color: 0x3b4654, rough: 0.45, metal: 0.6, repeat: [1, 3] });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xa9cde2, roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.26,
    side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.3,
    emissive: 0xffd98a, emissiveIntensity: 0
  });
  const floorMat = pbr(TEX.terrazzo(), { color: 0xf4efe6, rough: 0.35, metal: 0.05, repeat: [400, 105], emissive: 0x33373c, emissiveIntensity: 1 });
  const ceilMat = pbr(TEX.paintedMetal(), { color: 0xe4e9ee, rough: 0.7, repeat: [24, 8], side: THREE.DoubleSide, emissive: 0x30343a, emissiveIntensity: 1 });
  const brandMat = new THREE.MeshStandardMaterial({ color: 0x0b3b66, roughness: 0.5, metalness: 0.2 });
  const casters = [];

  /* ---- Sol et plafond ---- */
  const floor = mesh(g, new THREE.PlaneGeometry(W - 1.4, D - 1.4), floorMat, CX, 0.03, CZ);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const ceil = mesh(g, new THREE.PlaneGeometry(W - 1.4, D - 1.4), ceilMat, CX, H - 0.05, CZ);
  ceil.rotation.x = Math.PI / 2;

  /* Dalles lumineuses : instanciees, purement emissives. */
  {
    const pts = [];
    for (let x = T.x0 + 12; x < T.x1 - 6; x += 14) {
      for (let z = T.z0 + 8; z < T.z1 - 4; z += 10.5) pts.push([x, z]);
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(3.6, 0.06, 1.6), new THREE.MeshBasicMaterial({ color: 0xfff6e2 }), pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach(([x, z], i) => { m4.makeTranslation(x, H - 0.1, z); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true;
    g.add(im);
  }

  /* ---- Facades nord (cote piste) et sud (cote ville) ---- */
  const plinthH = 0.9;
  const glassH = H - plinthH;
  const facade = (zc, doors, inward) => {
    const zf = zc + inward * 0.25;                    // demi-epaisseur
    /* Bornes des troncons pleins entre les ouvertures. */
    const cuts = doors.map(d => [d.x - d.w / 2, d.x + d.w / 2]).sort((a, b) => a[0] - b[0]);
    const segs = [];
    let px = T.x0;
    for (const [a, b] of cuts) { if (a > px) segs.push([px, a]); px = b; }
    if (px < T.x1) segs.push([px, T.x1]);
    for (const [a, b] of segs) {
      const w = b - a;
      box(g, w, plinthH, 0.6, concreteMat, (a + b) / 2, plinthH / 2, zc);
      const gl = box(g, w, glassH, 0.14, glassMat, (a + b) / 2, plinthH + glassH / 2, zc);
      gl.renderOrder = 2;
    }
    /* Linteaux au-dessus des portes + montants. */
    for (const d of doors) {
      const dh = 4.8;
      box(g, d.w, H - dh, 0.6, wallMat, d.x, dh + (H - dh) / 2, zc);
      for (const s of [-1, 1]) {
        box(g, 0.28, dh, 0.5, frameMat, d.x + s * d.w / 2, dh / 2, zc);
      }
      /* Vantaux de porte coulissante ouverts, rangés dans la paroi. */
      for (const s of [-1, 1]) {
        const leaf = box(g, d.w * 0.16, dh - 0.3, 0.1, glassMat, d.x + s * (d.w / 2 - d.w * 0.08), dh / 2, zc + inward * 0.2);
        leaf.renderOrder = 2;
      }
    }
    /* Meneaux tous les 5 m, hors ouvertures. */
    const ms = [];
    for (let x = T.x0 + 5; x < T.x1; x += 5) {
      if (cuts.some(([a, b]) => x > a - 0.2 && x < b + 0.2)) continue;
      ms.push(x);
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, glassH, 0.3), frameMat, ms.length);
    const m4 = new THREE.Matrix4();
    ms.forEach((x, i) => { m4.makeTranslation(x, plinthH + glassH / 2, zf); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true;
    g.add(im);
    /* Poutre de rive. */
    box(g, W, 0.9, 0.9, brandMat, CX, H - 0.45, zc);
  };
  facade(T.z0 + 0.3, T.airDoors, +1);
  facade(T.z1 - 0.3, T.landDoors, -1);

  /* Marquises : les boites ci-dessus sont posees cote batiment ; on ajoute
     l'avancee cote exterieur (nord et sud) pour donner de la profondeur. */
  for (const d of T.airDoors) box(g, d.w + 3, 0.3, 5, frameMat, d.x, 5.25, T.z0 - 2.5);
  for (const d of T.landDoors) box(g, d.w + 3, 0.3, 5, frameMat, d.x, 5.25, T.z1 + 2.5);
  for (const d of [...T.airDoors, ...T.landDoors]) {
    /* Poteaux de marquise. */
    const north = T.airDoors.includes(d);
    for (const s of [-1, 1]) {
      const post = mesh(g, new THREE.CylinderGeometry(0.11, 0.13, 5.2, 8), frameMat, d.x + s * (d.w / 2 + 1.3), 2.6, north ? T.z0 - 4.6 : T.z1 + 4.6);
      casters.push(post);
    }
  }

  /* ---- Colonnes interieures, pres des facades ---- */
  {
    const xs = [];
    for (let x = T.x0 + 10; x < T.x1; x += 20) xs.push(x);
    const cols = [];
    xs.forEach(x => { cols.push([x, T.z0 + 1.9], [x, T.z1 - 1.9]); });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, H, 0.9), concreteMat, cols.length);
    const m4 = new THREE.Matrix4();
    cols.forEach(([x, z], i) => { m4.makeTranslation(x, H / 2, z); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true;
    g.add(im);
  }

  /* ---- Pignons ouest et est : murs pleins avec bandeau vitre ---- */
  for (const [x, s] of [[T.x0 + 0.5, -1], [T.x1 - 0.5, 1]]) {
    box(g, 1, H, D, wallMat, x, H / 2, CZ);
    const gl = box(g, 0.14, 3.2, D - 8, glassMat, x + s * 0.55, 6.2, CZ);
    gl.renderOrder = 2;
  }

  /* ---- Toit debordant + lanterneau central ---- */
  const roof = box(g, W + 12, 0.8, D + 12, roofMat, CX, H + 0.4, CZ);
  casters.push(roof);
  {
    const lw = 110, ld = 34;
    const lanternWall = box(g, lw, 3.4, ld, wallMat, CX, H + 0.8 + 1.7, CZ);
    casters.push(lanternWall);
    const lanternRoof = box(g, lw + 4, 0.5, ld + 4, roofMat, CX, H + 0.8 + 3.65, CZ);
    casters.push(lanternRoof);
    /* Bandeau vitre du lanterneau sur ses quatre faces. */
    for (const [w, d, x, z] of [[lw - 4, 0.14, CX, CZ - ld / 2 - 0.1], [lw - 4, 0.14, CX, CZ + ld / 2 + 0.1],
      [0.14, ld - 4, CX - lw / 2 - 0.1, CZ], [0.14, ld - 4, CX + lw / 2 + 0.1, CZ]]) {
      const b = box(g, w, 1.9, d, glassMat, x, H + 0.8 + 1.9, z);
      b.renderOrder = 2;
    }
    /* Verriere zenithale : ouverture claire dans le plafond, sous le lanterneau. */
    const sky = mesh(g, new THREE.PlaneGeometry(lw - 8, ld - 8),
      new THREE.MeshBasicMaterial({ color: 0xcfe6f7, side: THREE.DoubleSide }), CX, H - 0.03, CZ);
    sky.rotation.x = Math.PI / 2;

    /* Enseigne monumentale sur la face nord du lanterneau. */
    const sn = panelSign('SKYMANAGER  INTERNATIONAL', { bg: '#0b3b66', w: 62, h: 3.2, sub: '' });
    sn.position.set(CX, H + 0.8 + 1.8, CZ - ld / 2 - 0.25);
    sn.rotation.y = Math.PI;
    g.add(sn);
    const sn2 = panelSign('SKYMANAGER  INTERNATIONAL', { bg: '#0b3b66', w: 62, h: 3.2 });
    sn2.position.set(CX, H + 0.8 + 1.8, CZ + ld / 2 + 0.25);
    g.add(sn2);
  }
  /* Groupes de climatisation sur le toit. */
  {
    const acMat = pbr(TEX.paintedMetal(), { color: 0x9aa4b0, rough: 0.6, metal: 0.4, repeat: [2, 1] });
    for (let i = 0; i < 12; i++) {
      const x = T.x0 + 18 + i * 20, side = i % 2 ? 1 : -1;
      box(g, 6, 2, 4, acMat, x, H + 1.8, CZ + side * 24);
    }
  }

  /* ---- Ponts d'embarquement stationnes aux autres portes ---- */
  {
    const bridgeMat = pbr(TEX.metal(), { color: 0xe4e9ee, rough: 0.42, metal: 0.55, repeat: [1, 4] });
    const dark = pbr(TEX.metal(), { color: 0x6b7683, rough: 0.55, metal: 0.5, repeat: [1, 2] });
    for (const jx of [246, 306, 426, 486]) {
      const br = new THREE.Group();
      br.position.set(jx, 0, T.z0 - 0.5);
      /* Rotonde de raccord contre la facade. */
      mesh(br, new THREE.CylinderGeometry(2.4, 2.4, 3.6, 16), bridgeMat, 0, 3.4, -0.6);
      /* Tunnel de 13 m, replie contre le terminal. */
      const tun = box(br, 4.2, 3.0, 12, bridgeMat, 0, 3.3, -7.4);
      const win = box(br, 4.3, 0.9, 11, new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.1, metalness: 0.6 }), 0, 3.6, -7.4);
      /* Tete mobile + soufflet. */
      box(br, 3.4, 2.6, 1.8, dark, 0, 3.1, -14.2);
      /* Piliers et chassis a roues. */
      box(br, 0.5, 2.0, 0.5, dark, 0, 1.0, -10.5);
      box(br, 2.4, 0.3, 0.9, dark, 0, 0.2, -10.5);
      for (const s of [-1, 1]) {
        const w = mesh(br, new THREE.CylinderGeometry(0.34, 0.34, 0.3, 10), dark, s * 1.1, 0.34, -10.5);
        w.rotation.z = Math.PI / 2;
      }
      /* Numero de porte. */
      const label = panelSign(`PORTE ${[246, 306, 366, 426, 486].indexOf(jx) + 1}`, { bg: '#f59e0b', fg: '#1c1917', w: 4, h: 1.1 });
      label.position.set(0, 5.5, -0.9);
      label.rotation.y = Math.PI;
      br.add(label);
      casters.push(tun);
      g.add(br);
    }
    /* Numeros de poste peints devant chaque pont. */
    [246, 306, 366, 426, 486].forEach((jx, i) => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = '#f5c518'; x.font = '900 104px -apple-system, "Segoe UI", sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(String(i + 1), 64, 70);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const n = mesh(g, new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), jx + 7, 0.04, T.z0 - 22);
      n.rotation.x = -Math.PI / 2;
      n.rotation.z = Math.PI;
    });
  }

  casters.forEach(o => { o.castShadow = true; o.receiveShadow = true; });
  return { group: g, glassMat, bounds: T };
}

/* ============================================================
   INTERIEUR
   ============================================================ */
export function buildTerminalInterior({ TEX, pbr, LIGHT_GAIN }, counters) {
  const g = new THREE.Group();
  g.name = 'terminalInterior';

  const wallMat = pbr(TEX.paintedMetal(), { color: 0xe7ebef, rough: 0.6, metal: 0.05, repeat: [8, 2], emissive: 0x25282c, emissiveIntensity: 1 });
  const deskMat = pbr(TEX.paintedMetal(), { color: 0x1f3b52, rough: 0.5, metal: 0.15, repeat: [2, 1], emissive: 0x0b1620, emissiveIntensity: 1 });
  const seatMat = pbr(TEX.fabric(), { color: 0x3f6ea8, rough: 0.92, repeat: [2, 2], emissive: 0x16283f, emissiveIntensity: 1 });
  const skinMat = pbr(TEX.skinPores(), { color: 0xd8ab7e, rough: 0.75, repeat: [1, 1], emissive: 0x2a1a10, emissiveIntensity: 1 });
  const hairMat = pbr(TEX.hair(), { color: 0x2b1c12, rough: 0.85, repeat: [1, 1] });
  const steelMat = pbr(TEX.brushed(), { color: 0xcbd5e1, rough: 0.28, metal: 0.85, repeat: [2, 1] });
  const tileMat = pbr(TEX.tile(), { color: 0xf1f5f9, rough: 0.18, metal: 0.02, repeat: [6, 3], emissive: 0x24272a, emissiveIntensity: 1 });
  const beltMat = pbr(TEX.metal(), { color: 0x1e293b, rough: 0.7, metal: 0.3, repeat: [8, 1] });
  const legMat = pbr(TEX.metal(), { color: 0x475569, rough: 0.5, metal: 0.6, repeat: [1, 1] });
  const glassMat = pbr(TEX.glassGrid(), { color: 0xbfdbfe, rough: 0.08, metal: 0.1, transparent: true, opacity: 0.35, repeat: [2, 1] });
  const leafMat = pbr(TEX.foliage(), { color: 0x6aa860, rough: 0.9, repeat: [1, 1], emissive: 0x0a1a08, emissiveIntensity: 1 });
  const potMat = pbr(TEX.paintedMetal(), { color: 0xf1f5f9, rough: 0.5, repeat: [1, 1] });
  const bagMats = [0x7c3aed, 0x0f766e, 0xb91c1c].map(c => pbr(TEX.luggage(), { color: c, rough: 0.85, repeat: [1, 1] }));

  /* ---- Tapis : salons d'embarquement, allee centrale ---- */
  const carpetMat = { color: 0x3f5f80, emissive: 0x0e1822 };
  const carpet2 = { color: 0x8a7458, emissive: 0x201a13 };
  const carpetAt = (x0, x1, z0, z1, spec) => {
    const m = pbr(TEX.carpet(), { color: spec.color, rough: 0.95, repeat: [(x1 - x0) / 1.1, (z1 - z0) / 1.1], emissive: spec.emissive, emissiveIntensity: 1 });
    const c = mesh(g, new THREE.PlaneGeometry(x1 - x0, z1 - z0), m, (x0 + x1) / 2, 0.045, (z0 + z1) / 2);
    c.rotation.x = -Math.PI / 2;
    return c;
  };
  carpetAt(T.x0 + 3, T.x1 - 3, T.z0 + 2, T.z0 + 15, carpetMat);       // salon d'embarquement
  carpetAt(285, 325, T.z0 + 17, T.z0 + 45, carpet2);                  // cafe
  carpetAt(428, T.x1 - 3, T.z0 + 18, T.z0 + 45, carpet2);             // boutiques

  /* Bande de guidage jaune du sol : de la porte ville aux comptoirs. */
  {
    const yel = new THREE.MeshBasicMaterial({ color: 0xf5c518 });
    const l = mesh(g, new THREE.PlaneGeometry(0.3, 34), yel, 360, 0.05, T.z1 - 22);
    l.rotation.x = -Math.PI / 2;
  }

  /* Refonte visuelle (phase 32) : zones de sol, plafond, vitrines, fresques. */
  g.add(buildTerminalDesign({ TEX, pbr }));

  /* ---- Lumiere d'interieur : eteinte de loin, voir setLightLevel ---- */
  const ambient = new THREE.AmbientLight(0xffffff, 0);
  g.add(ambient);
  const lamps = [];
  for (const lx of [290, 360, 430]) {
    const lamp = new THREE.PointLight(0xfff2d8, 0, 70, 1.4);
    lamp.position.set(lx, H - 1.2, CZ);
    g.add(lamp);
    lamps.push(lamp);
  }

  /* ------------------------------------------------------------
     Postes de traitement
     ------------------------------------------------------------ */
  const terminalCounters = {};
  const clothPalette = [0x64748b, 0x9333ea, 0x0d9488, 0xb45309, 0xdb2777, 0x2563eb];
  const torsoGeo = new THREE.CapsuleGeometry(0.2, 0.85, 3, 8);
  const headGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const hairGeo = new THREE.SphereGeometry(0.165, 8, 6, 0, 6.283, 0, 1.7);
  const clothMats = clothPalette.map(col => pbr(TEX.fabric(), { color: col, rough: 0.92, repeat: [1, 1], emissive: col, emissiveIntensity: 0.08 }));

  counters.forEach((c, i) => {
    const cx = c.pos[0], cz = c.pos[1];
    const facing = c.facing || 0;

    /* ---- Phase 25 : distributeur et reserve (pas de file de personnes) ---- */
    if (c.kind === 'vending' || c.kind === 'storage') {
      const dg = new THREE.Group();
      dg.position.set(cx, 0.03, cz);
      dg.rotation.y = facing;
      let light, stockBar = null;
      if (c.kind === 'vending') {
        mesh(dg, new THREE.BoxGeometry(1.4, 2.1, 0.9), pbr(TEX.paintedMetal(), { color: 0xdc2626, rough: 0.4, metal: 0.2, repeat: [1, 1], emissive: 0x2a0808, emissiveIntensity: 1 }), 0, 1.05, 0);
        mesh(dg, new THREE.BoxGeometry(1.0, 1.3, 0.05), new THREE.MeshBasicMaterial({ color: 0xbfe6ff }), 0, 1.35, -0.47);
        for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
          mesh(dg, new THREE.BoxGeometry(0.16, 0.2, 0.06),
            new THREE.MeshBasicMaterial({ color: [0xf59e0b, 0x22d3ee, 0xec4899, 0xa3e635][(r + k) % 4] }),
            -0.36 + k * 0.24, 1.75 - r * 0.3, -0.5);
        }
        mesh(dg, new THREE.BoxGeometry(0.9, 0.18, 0.05), new THREE.MeshBasicMaterial({ color: 0x1e293b }), 0, 0.45, -0.47);
        stockBar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0x34d399 }));
        stockBar.position.set(0, 2.02, -0.47);
        dg.add(stockBar);
        light = mesh(dg, new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0x34d399 }), 0.55, 2.2, -0.3);
      } else {
        /* Reserve : etageres de caisses brunes. */
        const shelf = pbr(TEX.metal(), { color: 0x64748b, rough: 0.5, metal: 0.5, repeat: [1, 1] });
        mesh(dg, new THREE.BoxGeometry(2.6, 2.2, 0.8), shelf, 0, 1.1, 0.3);
        const crateMat = pbr(TEX.luggage(), { color: 0xb7793b, rough: 0.9, repeat: [1, 1] });
        for (let s = 0; s < 3; s++) for (let k = 0; k < 3; k++) {
          mesh(dg, new THREE.BoxGeometry(0.62, 0.5, 0.55), crateMat, -0.82 + k * 0.82, 0.4 + s * 0.68, -0.25);
        }
        light = mesh(dg, new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0x34d399 }), 0, 2.45, 0);
      }
      const hang = panelSign(c.kind === 'vending' ? 'DISTRIBUTEUR' : 'RESERVE', { bg: c.kind === 'vending' ? '#991b1b' : '#78350f', w: 2.4, h: 0.6, both: true });
      hang.position.set(0, c.kind === 'vending' ? 2.7 : 3.0, 0);
      dg.add(hang);
      g.add(dg);
      terminalCounters[c.id] = { deskGroup: dg, light, paxProps: [], queueDir: [0, 0], stockBar };
      return;
    }

    const qx = -Math.sin(facing), qz = -Math.cos(facing);
    const isShop = c.kind === 'shop' || c.kind === 'cafe';
    const deskW = isShop ? 3.6 : 2.4;
    const isBag = c.kind === 'baggage';

    const deskGroup = new THREE.Group();
    deskGroup.position.set(cx, 0.03, cz);
    deskGroup.rotation.y = facing;

    const desk = mesh(deskGroup, new THREE.BoxGeometry(deskW, 1.1, 1.1), isShop ? steelMat : deskMat, 0, 0.55, 0);
    desk.castShadow = true;
    mesh(deskGroup, new THREE.BoxGeometry(deskW + 0.1, 0.08, 1.2), steelMat, 0, 1.14, 0);
    mesh(deskGroup, new THREE.BoxGeometry(0.7, 0.5, 0.06),
      new THREE.MeshBasicMaterial({ color: isShop ? 0xfbbf24 : 0x38bdf8 }), 0, 1.45, -0.5);
    const light = mesh(deskGroup, new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x34d399 }), 0, 2.0, 0);

    /* Enseigne suspendue : cable + panneau lisible. */
    const label = { checkin: 'ENREGISTREMENT', security: 'SURETE', gate: 'EMBARQUEMENT', shop: 'DUTY FREE', cafe: 'CAFE',
      baggage: 'TRI BAGAGES', vending: 'DISTRIBUTEUR', storage: 'RESERVE' }[c.kind] || c.label;
    const hang = panelSign(label, { bg: isShop ? '#7c2d12' : '#0c4a6e', w: deskW * 1.5, h: 0.8, both: true });
    hang.position.set(0, 3.4, 0);
    deskGroup.add(hang);
    mesh(deskGroup, new THREE.CylinderGeometry(0.02, 0.02, H - 3.4, 4), steelMat, deskW * 0.6, 3.4 + (H - 3.4) / 2, 0);
    mesh(deskGroup, new THREE.CylinderGeometry(0.02, 0.02, H - 3.4, 4), steelMat, -deskW * 0.6, 3.4 + (H - 3.4) / 2, 0);

    if (c.kind === 'security') {
      const arch = pbr(TEX.metal(), { color: 0x94a3b8, rough: 0.45, metal: 0.6, repeat: [1, 1] });
      mesh(deskGroup, new THREE.BoxGeometry(0.15, 2.2, 0.15), arch, -0.9, 1.1, -2.6);
      mesh(deskGroup, new THREE.BoxGeometry(0.15, 2.2, 0.15), arch, 0.9, 1.1, -2.6);
      mesh(deskGroup, new THREE.BoxGeometry(1.95, 0.15, 0.15), arch, 0, 2.2, -2.6);
      mesh(deskGroup, new THREE.BoxGeometry(0.9, 0.12, 3.2), beltMat, 1.9, 0.72, -1.6);
      mesh(deskGroup, new THREE.BoxGeometry(1.1, 1.0, 1.1), steelMat, 1.9, 1.3, -3.0);
      /* Cordons de file : potelets. */
      for (let k = 0; k < 5; k++) mesh(deskGroup, new THREE.CylinderGeometry(0.04, 0.05, 0.95, 6), steelMat, -1.6, 0.48, -1.5 - k * 1.6);
    }
    if (c.kind === 'gate') {
      mesh(deskGroup, new THREE.BoxGeometry(0.35, 0.5, 0.2), steelMat, -0.9, 1.4, -0.4);
      mesh(deskGroup, new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: 0x22d3ee }), -0.9, 1.72, -0.4);
      /* Ecran de porte : destination. */
      const gs = panelSign('PORTE 3  ·  LYON', { bg: '#0f2f52', fg: '#fde047', w: 3.2, h: 0.7, sub: 'Embarquement immediat' });
      gs.position.set(0, 2.5, 0.05);
      gs.rotation.y = Math.PI;
      deskGroup.add(gs);
    }
    if (isBag) {
      /* Bande de tri : un tapis sombre sur le bureau, une tremie vers la soute. */
      mesh(deskGroup, new THREE.BoxGeometry(deskW - 0.3, 0.06, 0.8), beltMat, 0, 1.2, 0);
      mesh(deskGroup, new THREE.BoxGeometry(0.6, 0.9, 0.9), steelMat, deskW / 2 + 0.2, 0.75, 0);
      mesh(deskGroup, new THREE.BoxGeometry(0.06, 0.4, 1.0), steelMat, -deskW / 2 + 0.05, 1.4, 0);
    }
    if (isShop) {
      const shelfMat = pbr(TEX.paintedMetal(), { color: 0xf8fafc, rough: 0.55, repeat: [2, 1] });
      for (let s = 0; s < 3; s++) {
        mesh(deskGroup, new THREE.BoxGeometry(deskW - 0.4, 0.06, 0.5), shelfMat, 0, 1.5 + s * 0.55, 0.55);
        for (let k = 0; k < 4; k++) {
          mesh(deskGroup, new THREE.BoxGeometry(0.22, 0.3, 0.22),
            new THREE.MeshBasicMaterial({ color: [0xf59e0b, 0xec4899, 0x22d3ee, 0xa3e635][(s + k) % 4] }),
            -deskW / 2 + 0.5 + k * 0.75, 1.68 + s * 0.55, 0.55);
        }
      }
      if (c.kind === 'cafe') {
        mesh(deskGroup, new THREE.BoxGeometry(0.8, 0.7, 0.6), steelMat, -1.0, 1.53, 0.1);
        mesh(deskGroup, new THREE.BoxGeometry(1.4, 0.9, 0.7), glassMat, 0.9, 1.63, 0.1);
        /* Tables rondes de la terrasse du cafe. */
        for (let t = 0; t < 4; t++) {
          const tx = 5 + (t % 2) * 3.2, tz = -2.2 + Math.floor(t / 2) * 4.4;
          const table = new THREE.Group();
          table.position.set(tx, 0, tz);
          mesh(table, new THREE.CylinderGeometry(0.55, 0.55, 0.05, 14), steelMat, 0, 0.75, 0);
          mesh(table, new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), steelMat, 0, 0.37, 0);
          for (const a of [0, 2.1, 4.2]) {
            mesh(table, new THREE.CylinderGeometry(0.22, 0.22, 0.06, 10), seatMat, Math.cos(a) * 0.85, 0.46, Math.sin(a) * 0.85);
          }
          deskGroup.add(table);
        }
      }
    }
    let stockBar = null;
    if (isShop) {
      /* Jauge de stock sur la face avant du comptoir : vert / orange / rouge. */
      mesh(deskGroup, new THREE.BoxGeometry(deskW - 0.5, 0.2, 0.04), new THREE.MeshBasicMaterial({ color: 0x0b1220 }), 0, 0.42, -0.56);
      stockBar = new THREE.Mesh(new THREE.BoxGeometry(deskW - 0.6, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: 0x34d399 }));
      stockBar.position.set(0, 0.42, -0.58);
      deskGroup.add(stockBar);
    }
    g.add(deskGroup);

    /* File d'attente visible (pour le tri des bagages : des valises sur la bande). */
    const maxPax = isBag ? 5 : (isShop ? 7 : (c.kind === 'gate' ? 8 : 10));
    const paxProps = [];
    if (isBag) {
      for (let q = 0; q < maxPax; q++) {
        const bag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.3), bagMats[q % 3]);
        bag.position.set(-deskW / 2 + 0.5 + q * 0.42, 1.38, 0);
        bag.rotation.y = 0.3 * (q % 2 ? 1 : -1);
        bag.visible = false;
        deskGroup.add(bag);
        paxProps.push(bag);
      }
    }
    for (let q = 0; q < (isBag ? 0 : maxPax); q++) {
      const pax = new THREE.Mesh(personGeometry(clothPalette[(i + q) % clothPalette.length]), PERSON_MAT);
      const d = 2.2 + q * 1.05;
      pax.position.set(cx + qx * d + (Math.random() - 0.5) * 0.3, 0.03,
                       cz + qz * d + (Math.random() - 0.5) * 0.3);
      pax.rotation.y = facing + Math.PI;
      /* Valise a roulettes pour un passager sur deux. */
      if (q % 2 === 0) mesh(pax, new THREE.BoxGeometry(0.42, 0.62, 0.24), bagMats[q % 3], 0.38, 0.4, 0.15);
      pax.visible = false;
      g.add(pax);
      paxProps.push(pax);
    }
    terminalCounters[c.id] = { deskGroup, light, paxProps, queueDir: [qx, qz], stockBar };
  });

  /* ------------------------------------------------------------
     Salle des bagages : carrousel a l'ouest
     ------------------------------------------------------------ */
  const carousel = new THREE.Group();
  carousel.position.set(262, 0.03, 1238);
  {
    mesh(carousel, new THREE.BoxGeometry(11, 0.5, 3.4), beltMat, 0, 0.55, 0);
    mesh(carousel, new THREE.BoxGeometry(11.4, 0.12, 3.8), steelMat, 0, 0.86, 0);
    /* Extremites arrondies du tapis. */
    for (const s of [-1, 1]) {
      const cap = mesh(carousel, new THREE.CylinderGeometry(1.7, 1.7, 0.5, 20), beltMat, s * 5.5, 0.55, 0);
      cap.rotation.y = 0;
    }
  }
  const bagGeo = new THREE.BoxGeometry(0.62, 0.42, 0.34);
  const bags = [];
  for (let b = 0; b < 12; b++) {
    const bag = mesh(carousel, bagGeo, bagMats[b % 3], -5 + b * 0.9, 1.12, (b % 2 ? 0.9 : -0.9));
    bag.rotation.y = (b % 2 ? 0.3 : -0.3);
    bags.push(bag);
  }
  g.add(carousel);
  g.add((() => {
    const s = panelSign('BAGAGES', { bg: '#7c3aed', w: 6, h: 1.2, both: true, sub: 'Livraison des bagages' });
    s.position.set(262, H - 3.2, 1238);
    return s;
  })());
  const termCarousel = { group: carousel, bags, cx: 0, cz: 0, r: 5.2, len: 11 };

  /* ------------------------------------------------------------
     Tableaux des departs : deux grands panneaux suspendus, deux faces
     ------------------------------------------------------------ */
  const boardMat = pbr(TEX.paintedMetal(), { color: 0x1d3a63, rough: 0.4, metal: 0.2, repeat: [3, 1] });
  const rowColors = [0x22d3ee, 0x22d3ee, 0xfbbf24, 0x22d3ee, 0x34d399, 0x22d3ee];
  const boardRows = [];
  for (const bx of [330, 390]) {
    const board = new THREE.Group();
    board.position.set(bx, 0, 1226);
    box(board, 9, 2.4, 0.3, boardMat, 0, 8.0, 0);
    for (const s of [-1, 1]) {
      const title = panelSign('DEPARTS', { bg: '#0f2f52', fg: '#fde047', w: 8.4, h: 0.55 });
      title.position.set(0, 8.85, s * 0.17);
      title.rotation.y = s > 0 ? 0 : Math.PI;
      board.add(title);
      for (let r = 0; r < 6; r++) {
        const row = mesh(board, new THREE.BoxGeometry(7.4, 0.16, 0.04),
          new THREE.MeshBasicMaterial({ color: rowColors[r] }), 0, 8.45 - r * 0.27 - 0.1, s * 0.17);
        boardRows.push(row);
      }
    }
    for (const dx of [-3.6, 3.6]) mesh(board, new THREE.CylinderGeometry(0.04, 0.04, H - 9.2, 4), steelMat, dx, 9.2 + (H - 9.2) / 2, 0);
    g.add(board);
  }
  const termBoard = { rows: boardRows, colors: boardRows.map((_, i) => rowColors[i % 6]) };

  /* ------------------------------------------------------------
     Panneaux d'orientation suspendus
     ------------------------------------------------------------ */
  const hangSign = (txt, x, z, opt, ry = 0) => {
    const s = panelSign(txt, { both: true, ...opt });
    s.position.set(x, H - 2.2, z);
    s.rotation.y = ry;
    g.add(s);
    for (const dx of [-opt.w / 2 + 0.3, opt.w / 2 - 0.3]) {
      mesh(g, new THREE.CylinderGeometry(0.02, 0.02, 1.7, 4), steelMat, x + dx * Math.cos(ry), H - 1.3, z - dx * Math.sin(ry));
    }
  };
  hangSign('PORTES 1 - 5   ↑', 360, 1214, { bg: '#f59e0b', fg: '#1c1917', w: 9, h: 1.4 });
  hangSign('ENREGISTREMENT   ↓', 338, 1236, { bg: '#0369a1', w: 10, h: 1.4 });
  hangSign('SURETE   →', 396, 1233, { bg: '#0f766e', w: 6.5, h: 1.4 });
  hangSign('BOUTIQUES   →', 428, 1222, { bg: '#b45309', w: 8, h: 1.4 });
  hangSign('←   CAFE · BAGAGES', 292, 1232, { bg: '#7c3aed', w: 10, h: 1.4 });
  hangSign('SORTIE / PARKING   ↓', 360, 1256, { bg: '#15803d', w: 10, h: 1.4 });

  /* ------------------------------------------------------------
     Sanitaires : deux blocs carreles, aux angles sud
     ------------------------------------------------------------ */
  const wcBlock = (x0, x1, doorSide, label) => {
    const wc = new THREE.Group();
    const w = x1 - x0, d = 13;
    const cx = (x0 + x1) / 2, cz = 1263 - d / 2;
    mesh(wc, new THREE.BoxGeometry(w, 3.4, d), tileMat, cx, 1.7, cz);
    const doorX = doorSide < 0 ? x0 - 0.05 : x1 + 0.05;
    const door = mesh(wc, new THREE.BoxGeometry(0.1, 2.2, 1.6),
      pbr(TEX.paintedMetal(), { color: 0x94a3b8, rough: 0.5, metal: 0.3, repeat: [1, 1] }), doorX, 1.1, 1256);
    const sg = panelSign(label, { bg: '#0ea5e9', w: 3.6, h: 0.9 });
    sg.position.set(doorX + doorSide * 0.08, 2.9, 1256);
    sg.rotation.y = doorSide < 0 ? -Math.PI / 2 : Math.PI / 2;
    wc.add(sg);
    g.add(wc);
  };
  wcBlock(231, 246, +1, 'SANITAIRES');
  wcBlock(474, 489, -1, 'SANITAIRES');

  /* ------------------------------------------------------------
     Salons d'embarquement : rangees de sieges face a la baie vitree,
     avec quelques passagers assis
     ------------------------------------------------------------ */
  {
    const seatPos = [], sitters = [];
    LAYOUT.termSeats.forEach((cl, ci) => {
      for (const rz of [-1.1, 1.1]) {
        for (let s = 0; s < cl.n; s++) {
          const sx = cl.x - (cl.n - 1) * 0.55 + s * 1.1, sz = cl.z + rz;
          seatPos.push([sx, sz]);
          if (((ci * 7 + s * 3 + (rz > 0 ? 1 : 0)) % 5) < 2) sitters.push([sx, sz, (s + ci) % clothPalette.length]);
        }
      }
    });
    const n = seatPos.length;
    /* Un seul InstancedMesh par piece : 288 objets => 4 appels de dessin. */
    const parts = [
      { geo: new THREE.BoxGeometry(1.1, 0.14, 0.9), mat: seatMat, off: [0, 0.44, 0], per: 1 },
      { geo: new THREE.BoxGeometry(1.1, 0.7, 0.14), mat: seatMat, off: [0, 0.78, 0.38], per: 1 },      // dossier, cote nord
      { geo: new THREE.BoxGeometry(0.1, 0.1, 0.8), mat: legMat, off: [-0.55, 0.62, 0], per: 1 },
      { geo: new THREE.BoxGeometry(0.1, 0.1, 0.8), mat: legMat, off: [0.55, 0.62, 0], per: 1 },
      { geo: new THREE.BoxGeometry(0.08, 0.4, 0.08), mat: legMat, off: [-0.45, 0.2, -0.3], per: 1 },
      { geo: new THREE.BoxGeometry(0.08, 0.4, 0.08), mat: legMat, off: [0.45, 0.2, -0.3], per: 1 }
    ];
    const m4 = new THREE.Matrix4();
    for (const p of parts) {
      const im = new THREE.InstancedMesh(p.geo, p.mat, n);
      seatPos.forEach(([sx, sz], i) => { m4.makeTranslation(sx + p.off[0], 0.03 + p.off[1], sz + p.off[2]); im.setMatrixAt(i, m4); });
      im.instanceMatrix.needsUpdate = true;
      g.add(im);
    }
    for (const [sx, sz, ci] of sitters) {
      const px = new THREE.Mesh(personGeometry(clothPalette[ci]), PERSON_MAT);
      px.position.set(sx, 0.03 + 0.05, sz);
      px.scale.set(1, 0.8, 1);
      px.rotation.y = Math.PI;
      g.add(px);
    }
  }

  /* ------------------------------------------------------------
     Decoration : bacs a plantes le long de l'allee centrale, bancs
     ------------------------------------------------------------ */
  const planter = (x, z) => {
    mesh(g, new THREE.CylinderGeometry(0.6, 0.5, 0.7, 12), potMat, x, 0.38, z);
    mesh(g, new THREE.SphereGeometry(0.75, 10, 8), leafMat, x, 1.25, z);
    mesh(g, new THREE.ConeGeometry(0.45, 1.2, 8), leafMat, x + 0.2, 1.75, z - 0.1);
  };
  for (const x of [310, 410]) for (const z of [1214, 1236]) planter(x, z);
  for (const x of [240, 480]) for (const z of [1200, 1226]) planter(x, z);

  /* Chariots a bagages alignes pres de la porte ville. */
  {
    const cartMat = pbr(TEX.metal(), { color: 0xb8c0ca, rough: 0.4, metal: 0.7, repeat: [1, 1] });
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Group();
      c.position.set(378 + i * 0.5, 0.03, 1258.5 - i * 0.5);
      mesh(c, new THREE.BoxGeometry(0.6, 0.06, 0.9), cartMat, 0, 0.4, 0);
      mesh(c, new THREE.BoxGeometry(0.6, 0.5, 0.05), cartMat, 0, 0.75, -0.42);
      mesh(c, new THREE.BoxGeometry(0.6, 0.05, 0.05), cartMat, 0, 1.0, 0.45);
      g.add(c);
    }
  }

  /* Information / borne d'accueil, cote ville. */
  {
    const info = new THREE.Group();
    info.position.set(392, 0.03, 1258);
    mesh(info, new THREE.CylinderGeometry(1.1, 1.1, 1.1, 14), deskMat, 0, 0.55, 0);
    mesh(info, new THREE.CylinderGeometry(1.2, 1.2, 0.08, 14), steelMat, 0, 1.14, 0);
    const i = panelSign('i  INFORMATIONS', { bg: '#0369a1', w: 3.4, h: 0.8, both: true });
    i.position.set(0, 2.6, 0);
    info.add(i);
    g.add(info);
  }

  /* ------------------------------------------------------------
     Phase 26 : la foule du circuit. Un lot de figurants par couleur de
     chemise ; chaque passager de terminalSystem.crowd() en prend un et
     le garde tant qu'il est dans le hall (on peut donc le suivre des yeux).
     Le passager dont le dossier est ouvert est entoure d'un anneau et
     surmonte d'une fleche.
     ------------------------------------------------------------ */
  const crowdGroup = new THREE.Group();
  g.add(crowdGroup);
  const bagMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
  const POOL_PER_SHIRT = 9;
  const pools = SHIRTS.map((s, k) => {
    const arr = [];
    for (let i = 0; i < POOL_PER_SHIRT; i++) {
      const m = new THREE.Mesh(personGeometry(new THREE.Color(s.hex).getHex()), PERSON_MAT);
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.6, 0.24), bagMat);
      bag.position.set(0.32, 0.4, 0.1);
      m.add(bag);
      m.visible = false;
      m.userData = { free: true, id: -1 };
      crowdGroup.add(m);
      arr.push(m);
    }
    return arr;
  });
  const inspectRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 28),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
  inspectRing.rotation.x = -Math.PI / 2;
  inspectRing.visible = false;
  crowdGroup.add(inspectRing);
  const inspectArrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
  inspectArrow.rotation.x = Math.PI;
  inspectArrow.visible = false;
  crowdGroup.add(inspectArrow);
  const taken = new Map();       // id passager -> figurant

  const crowd = {
    /* list = terminal.crowd() ; inspectId = passager dont le dossier est ouvert. */
    update(list, dt, t, inspectId) {
      const seen = new Set();
      let target = null;
      for (const c of list) {
        seen.add(c.id);
        let m = taken.get(c.id);
        if (!m) {
          const pool = pools[c.shirt % pools.length];
          m = pool.find(x => x.userData.free) || pools.flat().find(x => x.userData.free);
          if (!m) continue;
          m.userData.free = false; m.userData.id = c.id;
          m.position.set(c.x, 0.03, c.z);
          m.rotation.y = c.h;
          m.visible = true;
          taken.set(c.id, m);
        }
        const dx = c.x - m.position.x, dz = c.z - m.position.z, dist = Math.hypot(dx, dz);
        let moving = c.moving, hd = c.h;
        if (c.mode === 'walk' && dist < 6) { m.position.x = c.x; m.position.z = c.z; }
        else if (dist > 0.02) {
          /* File qui avance : il rejoint sa place en marchant, sans se teleporter. */
          const step = Math.min(dist, 2.4 * dt);
          m.position.x += dx / dist * step; m.position.z += dz / dist * step;
          moving = dist > 0.1;
          if (moving) hd = Math.atan2(dx, dz);
        }
        let dh = (hd - m.rotation.y) % (Math.PI * 2);
        if (dh > Math.PI) dh -= Math.PI * 2; else if (dh < -Math.PI) dh += Math.PI * 2;
        m.rotation.y += dh * Math.min(1, dt * 8);
        /* Marche : petit rebond et balancement ; a l'arret il respire a peine. */
        m.position.y = 0.03 + (moving ? Math.abs(Math.sin(t * 9 + c.id)) * 0.05 : 0);
        m.rotation.z = moving ? Math.sin(t * 9 + c.id) * 0.05 : 0;
        if (c.id === inspectId) target = m;
      }
      for (const [id, m] of taken) {
        if (!seen.has(id)) { m.visible = false; m.userData.free = true; taken.delete(id); }
      }
      if (target) {
        inspectRing.visible = inspectArrow.visible = true;
        inspectRing.position.set(target.position.x, 0.06, target.position.z);
        inspectRing.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
        inspectArrow.position.set(target.position.x, 2.35 + Math.sin(t * 5) * 0.12, target.position.z);
      } else { inspectRing.visible = inspectArrow.visible = false; }
    },
    count() { return taken.size; }
  };

  return {
    group: g,
    crowd,
    counters: terminalCounters,
    carousel: termCarousel,
    board: termBoard,
    lamps,
    ambient,
    /* 0 = eteint (le joueur est loin), 1 = plein feu. */
    setLightLevel(k, night = 0) {
      ambient.intensity = 0.3 * LIGHT_GAIN * k * (0.6 + 0.8 * night);
      lamps.forEach(l => { l.intensity = 2.0 * LIGHT_GAIN * k * (0.6 + 0.9 * night); l.visible = k > 0.01; });
      ambient.visible = k > 0.01;
    }
  };
}
