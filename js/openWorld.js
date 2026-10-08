/* ============================================================
   openWorld.js — Le grand monde (mode Arcade, vague 5)

   Au-dela de l'aeroport :
     - une MER et six ILES a decouvrir (volcan, chateau, phare,
       parc d'attractions, plage, banquise) ;
     - 40 ETOILES FILANTES cachees dans le ciel ;
     - des surprises : un OVNI, une baleine, un dragon de nuages ;
     - des evenements du ciel : arc-en-ciel apres la pluie, etoiles
       filantes la nuit, feux d'artifice ;
     - le vol rase-mottes au-dessus de l'eau (eclaboussures + pieces).

   Tout est procedural (formes simples) et ne se charge qu'a la
   premiere partie. Donnees : localStorage 'skymanager.world'.
   ============================================================ */

import * as THREE from 'three';
import { sfx } from './sfx.js?v=1791471178';
import { itemOf } from './deco.js?v=1791471178';

const STORE = 'skymanager.world';
const $ = (id) => document.getElementById(id);

/* PRNG deterministe : les etoiles sont toujours aux memes endroits. */
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

/* ---------------- Geographie ---------------- */
export const SEA = { x: 3300, z: -5200, r: 1950 };
const LAKE = { x: 1900, z: -3300, rx: 832, rz: 520 };

/* K02 : carte de relief des vagues (canvas 128 x 128, sans fichier) : somme de sinus periodiques, convertie en normales. */
function waterNormal() {
  const N = 128, h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N * Math.PI * 2, v = y / N * Math.PI * 2;
    h[y * N + x] = Math.sin(u * 3 + Math.sin(v * 2) * 1.3) * 0.5 + Math.sin(v * 4 + u) * 0.35 + Math.sin((u + v) * 5) * 0.18 + Math.sin((u - v * 2) * 7) * 0.1;
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const c = cv.getContext('2d'), img = c.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hx = h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N], hy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
    const nx = -hx * 1.2, ny = -hy * 1.2, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * N + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export const ISLANDS = [
  { id: 'lighthouse', ico: '🗼', name: 'Ile du Phare',         x: 3200, z: -4300, r: 210, hint: 'Le phare veille sur la mer' },
  { id: 'palm',       ico: '🏝️', name: 'Ile aux Palmiers',     x: 2250, z: -4900, r: 270, hint: 'Sable chaud et cocotiers' },
  { id: 'fun',        ico: '🎡', name: 'Ile des Manèges',      x: 4350, z: -4550, r: 320, hint: 'Un parc d\'attractions geant' },
  { id: 'castle',     ico: '🏰', name: 'Ile du Chateau',       x: 2400, z: -6150, r: 310, hint: 'Chevaliers et dragons ?' },
  { id: 'volcano',    ico: '🌋', name: 'Ile du Volcan',        x: 3950, z: -6050, r: 390, hint: 'Attention, il fume !' },
  { id: 'ice',        ico: '🧊', name: 'Banquise des Pingouins', x: 3250, z: -6700, r: 300, hint: 'Brrr ! Il fait froid ici' }
];
export const islandOf = (id) => ISLANDS.find(i => i.id === id);

export const EGGS = [
  { id: 'ufo',    ico: '👽', name: 'L\'OVNI' },
  { id: 'whale',  ico: '🐋', name: 'La baleine' },
  { id: 'dragon', ico: '🐉', name: 'Le dragon de nuages' }
];

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.8, metalness: o.m ?? 0.02, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1, flatShading: o.flat ?? false });
const B = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const C = (r0, r1, h, m, s = 14) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, s), m);
const Sp = (r, m, ws = 14, hs = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), m);
const addBasic = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, transparent: o.op !== undefined, opacity: o.op ?? 1, side: o.side ?? THREE.FrontSide, depthWrite: o.dw ?? true, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: o.fog ?? true });

/* ---------------- Les iles ---------------- */
function baseIsland(r, grass = 0x4fb35a, sand = 0xf0dfa0) {
  const g = new THREE.Group();
  const beach = C(r, r * 1.08, 1.6, M(sand, { r: 0.95 }), 40); beach.position.y = 0.2;
  const top = C(r * 0.82, r * 0.9, 2.2, M(grass, { r: 0.95 }), 40); top.position.y = 0.9;
  g.add(beach, top);
  return g;
}
function palm(h = 14) {
  const g = new THREE.Group();
  const trunk = C(0.5, 0.8, h, M(0x8a5a2a), 7); trunk.position.y = h / 2; trunk.rotation.z = 0.12;
  g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 9, 4), M(0x2f9e44)); const a = i / 6 * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 3, h + 0.5, Math.sin(a) * 3); leaf.rotation.z = Math.cos(a) * 1.25; leaf.rotation.x = -Math.sin(a) * 1.25;
    g.add(leaf);
  }
  return g;
}
const BUILDERS = {
  lighthouse(isl) {
    const g = baseIsland(isl.r);
    const tower = new THREE.Group();
    for (let i = 0; i < 6; i++) { const s = C(5.5 - i * 0.55, 6 - i * 0.55, 10, M(i % 2 ? 0xffffff : 0xe11d48), 16); s.position.y = 5 + i * 10; tower.add(s); }
    const gal = C(5.2, 5.2, 1.2, M(0x333840), 16); gal.position.y = 61;
    const lamp = C(3, 3, 6, M(0xfff3b0, { e: 0xffe066, ei: 1.4 }), 12); lamp.position.y = 65;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 5, 16), M(0xe11d48)); roof.position.y = 71;
    const beam = new THREE.Mesh(new THREE.ConeGeometry(14, 260, 14, 1, true), addBasic(0xfff3b0, { op: 0.22, side: THREE.DoubleSide, dw: false, add: true }));
    beam.rotation.z = Math.PI / 2; beam.position.set(130, 65, 0);
    const beamPivot = new THREE.Group(); beamPivot.position.y = 0; beamPivot.add(beam);
    tower.add(gal, lamp, roof, beamPivot);
    g.add(tower);
    return { group: g, update(t) { beamPivot.rotation.y = t * 0.9; } };
  },
  palm(isl) {
    const g = baseIsland(isl.r);
    const rnd = rng(11);
    for (let i = 0; i < 22; i++) { const a = rnd() * 6.28, r = 40 + rnd() * (isl.r * 0.62); const p = palm(10 + rnd() * 8); p.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r); p.rotation.y = rnd() * 6; g.add(p); }
    const hut = new THREE.Group();
    const wall = C(9, 9, 6, M(0xd9a15b), 8); wall.position.y = 3; const roof = new THREE.Mesh(new THREE.ConeGeometry(12, 7, 8), M(0xb45309)); roof.position.y = 9.4;
    hut.add(wall, roof); hut.position.set(20, 1.5, -15); g.add(hut);
    const towel = B(10, 0.3, 4, M(0xff4d6d)); towel.position.set(-40, 1.7, 30); g.add(towel);
    return { group: g };
  },
  fun(isl) {
    const g = baseIsland(isl.r, 0x65c26f);
    const fer = itemOf('ferris').make(); fer.group.scale.setScalar(5); fer.group.position.set(-40, 1.5, 0);
    const car = itemOf('carousel').make(); car.group.scale.setScalar(3.5); car.group.position.set(80, 1.5, 40);
    const tent = itemOf('tent').make(); tent.group.scale.setScalar(3.5); tent.group.position.set(60, 1.5, -80);
    g.add(fer.group, car.group, tent.group);
    return { group: g, update(t) { fer.update && fer.update(t); car.update && car.update(t); tent.update && tent.update(t); } };
  },
  castle(isl) {
    const g = baseIsland(isl.r, 0x5aa85a);
    const stone = M(0xcfc9be, { r: 0.9 }), roofM = M(0x6d28d9), flag = M(0xfacc15);
    const keep = B(46, 60, 46, stone); keep.position.y = 32;
    const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(36, 30, 4), roofM); keepRoof.position.y = 77; keepRoof.rotation.y = Math.PI / 4;
    g.add(keep, keepRoof);
    const flags = [];
    for (const [x, z] of [[-60, -60], [60, -60], [-60, 60], [60, 60]]) {
      const t = C(12, 13, 55, stone, 12); t.position.set(x, 29, z);
      const r = new THREE.Mesh(new THREE.ConeGeometry(15, 24, 12), roofM); r.position.set(x, 68, z);
      const f = B(0.6, 7, 10, flag); f.position.set(x, 90, z + 5);
      g.add(t, r, f); flags.push(f);
    }
    for (const [w, d, x, z] of [[120, 5, 0, -60], [120, 5, 0, 60], [5, 120, -60, 0], [5, 120, 60, 0]]) { const wl = B(w, 22, d, stone); wl.position.set(x, 12, z); g.add(wl); }
    const gate = B(18, 18, 6, M(0x5b3a1a)); gate.position.set(0, 10, 61); g.add(gate);
    return { group: g, update(t) { flags.forEach((f, i) => { f.rotation.y = Math.sin(t * 3 + i) * 0.5; }); } };
  },
  volcano(isl) {
    const g = baseIsland(isl.r * 1.0, 0x3f8f4a);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(210, 250, 28, 1, true), M(0x5a3a2a, { r: 1, flat: true }));
    cone.position.y = 126;
    const lavaM = M(0xff5a1a, { e: 0xff3a00, ei: 1.5 });
    const crater = C(40, 46, 10, M(0x2a1a14), 20); crater.position.y = 250;
    const lava = C(34, 34, 4, lavaM, 20); lava.position.y = 253;
    g.add(cone, crater, lava);
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28 + 0.4; const s = new THREE.Mesh(new THREE.ConeGeometry(10, 150, 6), lavaM); s.scale.set(0.5, 1, 0.5); s.position.set(Math.cos(a) * 80, 170, Math.sin(a) * 80); s.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55); g.add(s); }
    const smokes = [];
    for (let i = 0; i < 6; i++) { const s = Sp(30, addBasic(0x444444, { op: 0.55, dw: false })); smokes.push(s); g.add(s); }
    return { group: g, update(t) { smokes.forEach((s, i) => { const k = ((t * 0.12 + i / 6) % 1); s.position.set(Math.sin(i + t * 0.2) * 20 * k, 255 + k * 380, Math.cos(i) * 20 * k); s.scale.setScalar(0.6 + k * 2.4); s.material.opacity = 0.6 * (1 - k); }); lava.material.emissiveIntensity = 1.2 + Math.sin(t * 4) * 0.4; } };
  },
  ice(isl) {
    const g = baseIsland(isl.r, 0xeef6fb, 0xdbeaf3);
    const ice = M(0xcdeeff, { r: 0.2, m: 0.2 });
    const rnd = rng(31);
    for (let i = 0; i < 14; i++) { const a = rnd() * 6.28, r = rnd() * isl.r * 0.7; const c = new THREE.Mesh(new THREE.ConeGeometry(10 + rnd() * 22, 25 + rnd() * 70, 5), ice); c.position.set(Math.cos(a) * r, 14 + 10, Math.sin(a) * r); c.rotation.y = rnd() * 3; g.add(c); }
    const pg = [];
    for (let i = 0; i < 10; i++) { const a = rnd() * 6.28, r = 30 + rnd() * isl.r * 0.5; const p = new THREE.Group(); const b = C(1.2, 1.6, 5, M(0x1e293b), 8); b.position.y = 3.5; const bel = C(1.0, 1.3, 3.8, M(0xffffff), 8); bel.position.set(0, 3.2, 0.7); const bk = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 4), M(0xfb923c)); bk.rotation.x = Math.PI / 2; bk.position.set(0, 5.2, 1.4); p.add(b, bel, bk); p.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r); p.rotation.y = rnd() * 6; g.add(p); pg.push(p); }
    return { group: g, update(t) { pg.forEach((p, i) => { p.position.y = 1.5 + Math.abs(Math.sin(t * 2 + i)) * 0.4; }); } };
  }
};

/* ============================================================ */
export class OpenWorld {
  constructor(game) {
    this.g = game;
    this.data = this._load();
    this.root = new THREE.Group();
    this.root.name = 'openWorld';
    this.islands = [];
    this.stars = [];
    this.eggs = {};
    this._built = false;
    this._lowT = 0;
    this._lowCoins = 0;
    this._lowBank = 0;
    this._rain = 0;
    this._starsCd = 6;
    this.fx = [];
    this.shoot = [];
  }

  _load() {
    const def = { islands: [], stars: [], eggs: {}, lowPasses: 0 };
    try { const d = JSON.parse(localStorage.getItem(STORE) || 'null'); if (d) return Object.assign(def, d, { islands: d.islands || [], stars: d.stars || [], eggs: d.eggs || {} }); } catch (e) { /* ignore */ }
    return def;
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }

  isWater(x, z) {
    if (Math.hypot(x - SEA.x, z - SEA.z) < SEA.r) {
      for (const i of ISLANDS) if (Math.hypot(x - i.x, z - i.z) < i.r * 0.95) return false;
      return true;
    }
    const dx = (x - LAKE.x) / LAKE.rx, dz = (z - LAKE.z) / LAKE.rz;
    return dx * dx + dz * dz < 1;
  }

  /* ---------------- Construction ---------------- */
  build() {
    if (this._built) return;
    this._built = true;
    const scene = this.g.r3d.scene;
    scene.add(this.root);
    /* mer */
    const sea = new THREE.Mesh(new THREE.CircleGeometry(SEA.r, 64), new THREE.MeshStandardMaterial({ color: 0x1f86c4, roughness: 0.12, metalness: 0.35, envMapIntensity: 1.3 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(SEA.x, -0.02, SEA.z);
    /* K02 : vagues (relief qui defile lentement) et reflets du soleil sur l'eau */
    this.waterNm = waterNormal();
    this.waterNm.repeat.set(90, 90);
    sea.material.normalMap = this.waterNm;
    sea.material.normalScale.set(0.45, 0.45);
    const foam = new THREE.Mesh(new THREE.RingGeometry(SEA.r - 30, SEA.r + 40, 64), new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2; foam.position.set(SEA.x, -0.01, SEA.z);
    this.root.add(sea, foam);
    /* iles */
    for (const isl of ISLANDS) {
      const o = BUILDERS[isl.id](isl);
      o.group.position.set(isl.x, 0, isl.z);
      o.group.traverse(m => { if (m.isMesh) m.castShadow = false; });
      this.root.add(o.group);
      this.islands.push({ isl, obj: o });
    }
    this._buildStars();
    this._buildEggs();
    this._buildSkyEvents();
  }

  /* ---------------- Etoiles filantes ---------------- */
  _starPositions() {
    const r = rng(2024), out = [];
    const ring = (n, cx, cz, rad, y0, y1) => { for (let i = 0; i < n; i++) { const a = r() * 6.28, d = rad * (0.25 + 0.75 * Math.sqrt(r())); out.push([cx + Math.cos(a) * d, y0 + r() * (y1 - y0), cz + Math.sin(a) * d]); } };
    ring(10, 150, -300, 1500, 80, 260);          // autour de la piste
    ring(8, LAKE.x, LAKE.z, 1100, 60, 300);       // le lac
    for (const isl of ISLANDS) ring(2, isl.x, isl.z, isl.r * 0.8, 110, 360);   // 12 sur les iles
    ring(6, -3300, 300, 1300, 150, 450);          // la ville
    ring(4, 4300, -900, 800, 120, 350);           // le village
    return out.slice(0, 40);
  }

  _buildStars() {
    const pts = this._starPositions();
    const sh = new THREE.Shape();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 4.2 : 10; (k ? sh.lineTo : sh.moveTo).call(sh, Math.cos(a) * rr, Math.sin(a) * rr); }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 1 });
    geo.translate(0, 0, -1.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa800, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.6 });
    const halo = new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    pts.forEach((p, i) => {
      const grp = new THREE.Group();
      const m = new THREE.Mesh(geo, mat);
      const h = new THREE.Mesh(new THREE.CircleGeometry(20, 20), halo);
      grp.add(m, h);
      grp.position.set(p[0], p[1], p[2]);
      grp.visible = false;
      this.root.add(grp);
      this.stars.push({ i, x: p[0], y: p[1], z: p[2], grp, star: m, halo: h, got: this.data.stars.includes(i) });
    });
  }

  /* ---------------- Surprises ---------------- */
  _buildEggs() {
    /* OVNI */
    const ufo = new THREE.Group();
    const disc = Sp(1, M(0xbfc7d4, { m: 0.8, r: 0.25 }), 20, 12); disc.scale.set(34, 7, 34);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, 6.28, 0, 1.6), M(0x7ee8c7, { e: 0x2ad6a0, ei: 0.8, r: 0.1 })); dome.scale.set(14, 12, 14); dome.position.y = 4;
    ufo.add(disc, dome);
    const lights = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; const l = Sp(1.6, addBasic(0xffe066)); l.position.set(Math.cos(a) * 30, 0, Math.sin(a) * 30); ufo.add(l); lights.push(l); }
    const beam = new THREE.Mesh(new THREE.ConeGeometry(30, 160, 18, 1, true), addBasic(0x9dffd8, { op: 0.16, side: THREE.DoubleSide, dw: false, add: true }));
    beam.position.y = -80; ufo.add(beam);
    ufo.visible = false;
    this.root.add(ufo);
    this.eggs.ufo = { grp: ufo, lights, a: 0 };
    /* baleine */
    const whale = new THREE.Group();
    const wb = Sp(1, M(0x3a6a9a, { r: 0.5 }), 14, 10); wb.scale.set(18, 8, 8);
    const belly = Sp(1, M(0xe8f1f8, { r: 0.6 }), 12, 8); belly.scale.set(14, 4, 6); belly.position.set(0, -3, 0);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(5, 18, 4), M(0x3a6a9a)); tail.rotation.z = Math.PI / 2; tail.position.x = 22;
    const fluke = B(1.5, 14, 6, M(0x3a6a9a)); fluke.position.x = 31;
    whale.add(wb, belly, tail, fluke);
    whale.visible = false;
    this.root.add(whale);
    this.eggs.whale = { grp: whale, t: 0, cd: 20, spot: { x: 3050, z: -5450 } };
    /* dragon de nuages */
    const dragon = new THREE.Group();
    const cloud = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false });
    const spheres = [[0, 0, 0, 60], [70, 12, 0, 50], [135, 28, 0, 42], [190, 55, 0, 36], [235, 90, 0, 30], [275, 120, 0, 38], [-60, -10, 0, 40], [-115, -30, 0, 36], [-165, -40, 0, 28], [300, 150, 0, 22], [80, 50, 40, 22], [80, 50, -40, 22], [150, 70, 45, 20], [150, 70, -45, 20]];
    spheres.forEach(([x, y, z, r]) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), cloud); s.position.set(x, y, z); dragon.add(s); });
    const eye = Sp(8, addBasic(0xef4444)); eye.position.set(290, 160, 22); dragon.add(eye);
    dragon.position.set(-2400, 700, -4200); dragon.rotation.y = 0.5;
    this.root.add(dragon);
    this.eggs.dragon = { grp: dragon };
  }

  /* ---------------- Evenements du ciel ---------------- */
  _buildSkyEvents() {
    /* arc-en-ciel : sept bandes de tore, debout sur le sol */
    const rb = new THREE.Group();
    const cols = [0xff3b3b, 0xff9a1f, 0xffe033, 0x3ddc6a, 0x38a1ff, 0x5b5bff, 0x9b6bff];
    cols.forEach((c, i) => {
      const t = new THREE.Mesh(new THREE.TorusGeometry(900 - i * 22, 11, 8, 64, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false }));
      rb.add(t);
    });
    rb.position.set(900, 0, -2600); rb.rotation.y = -0.35;
    rb.visible = false;
    this.root.add(rb);
    this.rainbow = { grp: rb, life: 0, hit: false };
    /* etoile filante : un trait lumineux */
    this.shootMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    this.shootMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shootMat);
    this.shootMesh.scale.set(260, 6, 1);
    this.shootMesh.visible = false;
    this.root.add(this.shootMesh);
    this.shoot = { life: 0, from: new THREE.Vector3(), dir: new THREE.Vector3() };
  }

  /* Feu d'artifice : une gerbe de points qui retombent. */
  fireworks(x, y, z, n = 3) {
    for (let k = 0; k < n; k++) {
      const cx = x + (Math.random() - 0.5) * 220, cy = y + Math.random() * 120, cz = z + (Math.random() - 0.5) * 220;
      const N = 90, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = [];
      const hue = Math.random(), c = new THREE.Color().setHSL(hue, 1, 0.6);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = cx; pos[i * 3 + 1] = cy; pos[i * 3 + 2] = cz;
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(40 + Math.random() * 40);
        vel.push(v);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 9, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      pts.frustumCulled = false;
      this.root.add(pts);
      this.fx.push({ pts, vel, life: 2.4 + k * 0.1, delay: k * 0.35 });
    }
    sfx.sparkle();
  }

  /* ---------------- Boucle ---------------- */
  update(dt) {
    const g = this.g;
    if (!g.arcade.on) return;
    if (!this._built) { if (g.state === 'PILOT') this.build(); else return; }
    const t = g.time;
    for (const o of this.islands) if (o.obj.update) o.obj.update(t);
    if (this.waterNm) { this.waterNm.offset.x += dt * 0.006; this.waterNm.offset.y += dt * 0.0035; }
    this._updateFx(dt);
    const ac = g.ac;
    const flying = g.state === 'PILOT' && !ac.onGround && !g.reportShown;
    if (flying) {
      this._updateStars(dt, t);
      this._updateIslands();
      this._updateEggs(dt, t);
      this._updateLow(dt);
    } else {
      this.stars.forEach(s => { s.grp.visible = false; });
      if (this.eggs.ufo) this.eggs.ufo.grp.visible = false;
      ac.safeAgl = 0;
    }
    this._updateSky(dt, t);
    this._renderHud(flying);
  }

  _updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      if (f.delay > 0) { f.delay -= dt; f.pts.visible = f.delay <= 0; continue; }
      f.life -= dt;
      if (f.life <= 0) { this.root.remove(f.pts); f.pts.geometry.dispose(); this.fx.splice(i, 1); continue; }
      const p = f.pts.geometry.attributes.position.array;
      for (let j = 0; j < f.vel.length; j++) {
        const v = f.vel[j]; v.y -= 22 * dt; v.multiplyScalar(1 - 0.5 * dt);
        p[j * 3] += v.x * dt; p[j * 3 + 1] += v.y * dt; p[j * 3 + 2] += v.z * dt;
      }
      f.pts.geometry.attributes.position.needsUpdate = true;
      f.pts.material.opacity = Math.min(1, f.life / 1.2);
    }
  }

  _updateStars(dt, t) {
    const ac = this.g.ac;
    let near = null, nd = 1e9;
    for (const s of this.stars) {
      if (s.got) { s.grp.visible = false; continue; }
      const d = Math.hypot(ac.pos.x - s.x, ac.pos.z - s.z);
      s.grp.visible = d < 3500;
      if (s.grp.visible) {
        s.star.rotation.y = t * 1.6 + s.i; s.grp.position.y = s.y + Math.sin(t * 2 + s.i) * 3;
        s.halo.lookAt(this.g.r3d.camera.position);
        const dd = Math.hypot(ac.pos.x - s.x, ac.pos.y - s.y, ac.pos.z - s.z);
        if (dd < 55) { this._collect(s); continue; }
        if (dd < nd) { nd = dd; near = s; }
      }
    }
    this.nearStar = near && nd < 1100 ? { s: near, d: nd } : null;
  }

  _collect(s) {
    s.got = true; s.grp.visible = false;
    this.data.stars.push(s.i);
    const n = this.data.stars.length;
    const arc = this.g.arcade;
    arc.giveCoins(3, { silent: true, xp: 3 });
    sfx.sparkle(); sfx.star(2);
    arc.popup(`🌠 ${n}/${this.stars.length} +3 🪙`);
    arc.event('secret');
    this.g.fun._boostGain(0.15);
    if (n % 10 === 0) {
      const bonus = n * 2;
      arc.giveCoins(bonus, { silent: true, xp: 20 });
      arc.confetti(80);
      this.fireworks(s.x, s.y + 40, s.z, 4);
      this.g.toast(`🌠 ${n} etoiles trouvees ! Bonus +${bonus} 🪙`, 4200, 'ok');
      this.g.fun.say(n >= this.stars.length ? 'TOUTES les etoiles ! Tu es legendaire !' : `${n} etoiles ! Continue, il en reste ${this.stars.length - n} !`, 3);
      if (n >= this.stars.length) this._unlockSticker('crown');
    }
    this.save();
  }

  _unlockSticker(id) {
    const h = this.g.hangar;
    if (!h.data.owned.sticker.includes(id)) { h.data.owned.sticker.push(id); h.save(); this.g.toast('👑 Nouvel autocollant rare dans ton hangar !', 3600, 'ok'); }
  }

  _updateIslands() {
    const ac = this.g.ac;
    for (const { isl } of this.islands) {
      if (this.data.islands.includes(isl.id)) continue;
      if (Math.hypot(ac.pos.x - isl.x, ac.pos.z - isl.z) < isl.r + 260 && ac.pos.y < 700) {
        this.data.islands.push(isl.id);
        const arc = this.g.arcade;
        arc.giveCoins(20, { silent: true, xp: 12 });
        arc.confetti(60); sfx.tada();
        arc.event('island');
        this.g.toast(`${isl.ico} ${isl.name} decouverte ! +20 🪙`, 4400, 'ok');
        this.g.fun.say(`${isl.ico} Regarde, ${isl.name} ! ${isl.hint}.`, 3, 4200);
        this.fireworks(isl.x, 160, isl.z, 2);
        if (this.data.islands.length === ISLANDS.length) { this._unlockSticker('shark'); arc.giveCoins(50, { silent: true }); this.g.toast('🏆 Les 6 iles ! Explorateur du monde ! +50 🪙', 5000, 'ok'); }
        this.save();
      }
    }
  }

  _egg(id, ico, text, coins, sticker) {
    const today = new Date().toDateString();
    if (this.data.eggs[id] === today) return;
    const first = !this.data.eggs[id];
    this.data.eggs[id] = today;
    const arc = this.g.arcade;
    arc.giveCoins(coins, { silent: true, xp: 10 });
    sfx.tada(); arc.confetti(50);
    this.g.toast(`${ico} ${text} +${coins} 🪙`, 4200, 'ok');
    this.g.fun.say(`${ico} ${text}`, 3, 3800);
    arc.event('egg');
    if (sticker && first) this._unlockSticker(sticker);
    this.save();
  }

  _updateEggs(dt, t) {
    const ac = this.g.ac, E = this.eggs;
    /* OVNI : tourne autour du lac, tres haut */
    const u = E.ufo;
    if (u) {
      u.a += dt * 0.08;
      const x = LAKE.x + Math.cos(u.a) * 1500, z = LAKE.z + Math.sin(u.a) * 1500, y = 850 + Math.sin(t * 0.7) * 25;
      u.grp.position.set(x, y, z);
      u.grp.rotation.y += dt * 1.2;
      u.grp.visible = Math.hypot(ac.pos.x - x, ac.pos.z - z) < 4500;
      u.lights.forEach((l, i) => { l.visible = Math.sin(t * 8 + i * 0.8) > -0.3; });
      if (Math.hypot(ac.pos.x - x, ac.pos.y - y, ac.pos.z - z) < 110) this._egg('ufo', '👽', 'Un OVNI ! Les extraterrestres te saluent !', 30, 'alien');
    }
    /* baleine : saute toutes les 35 s */
    const w = E.whale;
    if (w) {
      w.cd -= dt;
      if (w.cd <= 0 && w.t <= 0) { w.t = 0.001; w.cd = 35; w.spot = { x: SEA.x - 400 + Math.random() * 800, z: SEA.z + (Math.random() - 0.5) * 900 }; }
      if (w.t > 0) {
        w.t += dt;
        const k = w.t / 3.2;
        if (k >= 1) { w.t = 0; w.grp.visible = false; }
        else {
          w.grp.visible = true;
          const y = Math.sin(k * Math.PI) * 60 - 6;
          w.grp.position.set(w.spot.x + k * 90 - 45, y, w.spot.z);
          w.grp.rotation.z = Math.cos(k * Math.PI) * 0.9;
          if (Math.hypot(ac.pos.x - w.grp.position.x, ac.pos.z - w.grp.position.z) < 450 && ac.pos.y < 600) this._egg('whale', '🐋', 'Une baleine saute dans la mer !', 15, null);
        }
      }
    }
    /* dragon de nuages */
    const d = E.dragon;
    if (d && Math.hypot(ac.pos.x - d.grp.position.x, ac.pos.y - d.grp.position.y, ac.pos.z - d.grp.position.z) < 160) this._egg('dragon', '🐉', 'Tu as traverse le dragon de nuages !', 25, 'dragon');
  }

  /* Rase-mottes au-dessus de l'eau : altitude de securite reduite, eclaboussures, pieces. */
  _updateLow(dt) {
    const g = this.g, ac = g.ac;
    const water = this.isWater(ac.pos.x, ac.pos.z);
    ac.safeAgl = water && !g.assist.landing ? 16 : 0;
    const agl = ac.pos.y - ac.groundY;
    const skim = water && agl < 36 && ac.tas > 20 && !g.assist.landing;
    if (skim) {
      this._lowT += dt;
      /* eclaboussures */
      const tr = g.fun.trail;
      if (tr && Math.random() < 0.9) {
        const f = ac.forward();
        for (const s of [-0.6, 0.6]) tr.emit(ac.pos.x - f.x * 8 + s * 4, 1, ac.pos.z - f.z * 8, 0xe8f6ff, 4.5, 1.1);
      }
      if (this._lowT > 1.2) {
        this._lowT = 0;
        if (this._lowCoins < 12) { this._lowCoins++; g.arcade.giveCoins(1, { silent: true }); g.arcade.popup('🌊 Rase-mottes ! +1 🪙'); sfx.swoosh(0.5, 900, 300); }
        if (g.sky.m && g.sky.m.charges !== undefined && g.sky.m.charges < 7) { g.sky.m.charges = 7; g.arcade.popup('💧 Reservoir plein !'); g.fun.say('Reservoir rempli ! On retourne eteindre les feux !', 2); }
      }
    } else this._lowT = Math.max(0, this._lowT - dt);
  }
  resetFlight() { this._lowCoins = 0; this._lowT = 0; }

  _updateSky(dt, t) {
    const g = this.g, env = g.env;
    /* arc-en-ciel : quand la pluie s'arrete en journee */
    const rain = env._params ? env._params.rain : 0;
    const day = env.hour > 8 && env.hour < 18;
    if (this._rain > 0.25 && rain < 0.2 && day && this.rainbow.life <= 0) this.rainbow.life = 150;
    this._rain = rain;
    const rb = this.rainbow;
    if (rb && rb.life > 0) {
      rb.life -= dt;
      const a = Math.min(1, rb.life / 20, (150 - rb.life) / 12) * 0.65;
      rb.grp.visible = a > 0.01;
      rb.grp.children.forEach(m => { m.material.opacity = a; });
      const ac = g.ac;
      if (g.state === 'PILOT' && !ac.onGround && !rb.hit) {
        const c = rb.grp.position;
        const dx = ac.pos.x - c.x, dz = ac.pos.z - c.z;
        const loc = new THREE.Vector3(dx, ac.pos.y, dz).applyAxisAngle(new THREE.Vector3(0, 1, 0), -rb.grp.rotation.y);
        const r = Math.hypot(loc.x, loc.y);
        if (Math.abs(loc.z) < 90 && r > 760 && r < 920 && loc.y > 0) {
          rb.hit = true; g.arcade.giveCoins(10, { silent: true }); g.arcade.confetti(60); sfx.tada();
          g.toast('🌈 Tu as traverse l\'arc-en-ciel ! +10 🪙', 3600, 'ok'); g.arcade.event('rainbow');
        }
      }
    } else if (rb) { rb.grp.visible = false; rb.hit = false; }
    /* etoiles filantes la nuit */
    const night = env.hour > 20.5 || env.hour < 4.5;
    this._starsCd -= dt;
    if (night && this._starsCd <= 0 && g.state !== 'BOOT') {
      this._starsCd = 9 + Math.random() * 14;
      const cam = g.r3d.camera.position;
      const a = Math.random() * 6.28;
      this.shoot.from.set(cam.x + Math.cos(a) * 2600, 900 + Math.random() * 500, cam.z + Math.sin(a) * 2600);
      this.shoot.dir.set(-Math.sin(a) + Math.random() * 0.4, -0.25, Math.cos(a)).normalize();
      this.shoot.life = 1.2;
      sfx.sparkle();
      if (Math.random() < 0.5) g.fun.say('Une etoile filante ! Fais un voeu !', 1, 3000);
    }
    const sh = this.shoot;
    if (sh && sh.life > 0) {
      sh.life -= dt;
      this.shootMesh.visible = true;
      this.shootMesh.position.copy(sh.from).addScaledVector(sh.dir, (1.2 - sh.life) * 1400);
      this.shootMesh.lookAt(g.r3d.camera.position);
      this.shootMat.opacity = Math.max(0, Math.min(1, sh.life * 1.6));
    } else if (this.shootMesh) this.shootMesh.visible = false;
  }

  /* ---------------- Interface ---------------- */
  _renderHud(flying) {
    const chip = $('starChip');
    if (!chip) return;
    const n = this.nearStar;
    const show = flying && !!n && !this.g.sky.m;
    chip.classList.toggle('hidden', !show);
    if (!show) return;
    const rel = this.g.arcade._relativeAngle({ x: n.s.x, z: n.s.z }, true);
    const txt = `🌠 ${Math.round(n.d)} m`;
    if (chip.firstChild && chip.firstChild.nodeValue !== txt) chip.firstChild.nodeValue = txt;
    const ar = chip.querySelector('.arr');
    if (ar && rel) ar.style.transform = `rotate(${rel.rot.toFixed(3)}rad)`;
    chip.classList.toggle('hot', n.d < 350);
  }

  get starCount() { return this.data.stars.length; }
}
