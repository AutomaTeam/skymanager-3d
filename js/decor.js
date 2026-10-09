/* ============================================================
   decor.js — Decor en modeles 3D (plan graphisme, etape 4)

   Ajoute autour de l'aeroport, avec les packs Kenney (CC0) :
   arbres, buissons, fleurs, herbes, rochers, bancs et plantes du
   parvis, conteneurs, chateau d'eau, eoliennes, vehicules des
   pompiers, un quartier de maisons avec sa cloture.

   Tout est instancie (props.js) : quelques dizaines d'appels de
   dessin pour plusieurs centaines d'objets. Le decor est
   deterministe (meme graine = meme aeroport a chaque partie).

   `buildDecor()` renvoie { group, blockers } : `blockers` sont les
   obstacles (rectangles monde) a ajouter au graphe de navigation,
   pour qu'on ne traverse ni un arbre ni une maison.
   ============================================================ */

import * as THREE from 'three';
import { instanced } from './props.js?v=1791576493';

const N = 'nature/kenney-nature-kit/';
const F = 'interior/kenney-furniture-kit/';
const I = 'city/kenney-industrial/';
const S = 'city/kenney-suburban/';
const C = 'vehicles/kenney-car-kit/';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* Zones ou l'on ne plante rien : piste, taxiway, aire, batiments, routes, parking... */
const EXCL = [
  [-75, 75, -3000, 3000],            // piste + bande de securite
  [110, 190, -3000, 3000],           // taxiway
  [75, 110, 980, 1020], [75, 110, 1360, 1400], [75, 110, 380, 420],   // bretelles
  [110, 560, 850, 1195],             // aire de stationnement
  [215, 505, 1180, 1280],            // terminal + parvis
  [215, 735, 1274, 1306],            // route
  [228, 492, 1296, 1400],            // parking
  [630, 690, 1100, 1360],            // entree
  [495, 585, 840, 1180],             // hangars
  [235, 305, 1095, 1170],            // tour + bureau
  [45, 80, 995, 1410],               // route de service
  [170, 222, 1212, 1256],            // heliport
  [158, 232, 1264, 1352],            // pompiers
  [548, 625, 1196, 1262],            // reservoirs
  [578, 662, 1040, 1192],            // fret + conteneurs
  [62, 138, 1022, 1118],             // aviation legere
  [165, 295, 955, 1082]              // skatepark
];
const free = (x, z, pad = 0) => !EXCL.some(r => x > r[0] - pad && x < r[1] + pad && z > r[2] - pad && z < r[3] + pad);

export function buildDecor() {
  const group = new THREE.Group();
  group.name = 'decor';
  const blockers = [];
  let bid = 0;
  const block = (x, z, hx, hz, label = 'decor') => {
    blockers.push({ id: `decor${bid++}`, label, rect: { x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz } });
  };

  const r = rng(20260930);
  const rr = (a, b) => a + r() * (b - a);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];

  /* --------------------------------------------------------
     Vegetation : bosquets + arbres isoles + fleurs + herbes
     -------------------------------------------------------- */
  const TREES = [
    { f: 'tree_default', h: 8, w: 6 }, { f: 'tree_oak', h: 7.5, w: 5 }, { f: 'tree_fat', h: 6, w: 3 },
    { f: 'tree_pineRoundA', h: 10, w: 4 }, { f: 'tree_small', h: 5, w: 3 }, { f: 'tree_tall', h: 9.5, w: 3 },
    { f: 'tree_simple', h: 7.5, w: 3 }, { f: 'tree_detailed', h: 8, w: 2 },
    { f: 'tree_default_fall', h: 8, w: 1 }, { f: 'tree_oak_fall', h: 7.5, w: 1 }
  ];
  const totalW = TREES.reduce((a, t) => a + t.w, 0);
  const pickTree = () => { let p = r() * totalW; for (const t of TREES) { p -= t.w; if (p <= 0) return t; } return TREES[0]; };

  const treeLists = new Map(TREES.map(t => [t.f, []]));
  const bushLists = { plant_bush: [], plant_bushLarge: [], plant_bushSmall: [] };
  const flowerNames = ['purple', 'red', 'yellow'].flatMap(c => ['A', 'B', 'C'].map(k => `flower_${c}${k}`));
  const flowerLists = new Map(flowerNames.map(n => [n, []]));
  const rockLists = { rock_smallA: [], rock_smallB: [], rock_smallC: [], rock_largeA: [], rock_largeB: [] };
  const grassLists = { grass_large: [], grass: [] };

  const sample = (pad) => {
    for (let i = 0; i < 40; i++) {
      const x = rr(-140, 745), z = rr(640, 1535);
      if (free(x, z, pad)) return { x, z };
    }
    return null;
  };
  const addTree = (x, z) => {
    const t = pickTree();
    treeLists.get(t.f).push({ x, z, r: r() * 6.28, s: rr(0.8, 1.25) });
    block(x, z, 0.55, 0.55, 'arbre');
  };

  /* Bosquets : 2 a 5 arbres, buissons, fleurs autour. */
  for (let c = 0; c < 34; c++) {
    const p = sample(14);
    if (!p) continue;
    const nT = 2 + Math.floor(r() * 4);
    for (let i = 0; i < nT; i++) {
      const a = r() * 6.28, d = rr(1.5, 9);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (free(x, z, 6)) addTree(x, z);
    }
    const nB = 3 + Math.floor(r() * 4);
    for (let i = 0; i < nB; i++) {
      const a = r() * 6.28, d = rr(3, 11);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (free(x, z, 3)) bushLists[pick(Object.keys(bushLists))].push({ x, z, r: r() * 6.28, s: rr(0.8, 1.3) });
    }
    const nF = 8 + Math.floor(r() * 10);
    const fc = pick(['purple', 'red', 'yellow']);
    for (let i = 0; i < nF; i++) {
      const a = r() * 6.28, d = rr(2, 8);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (free(x, z, 2)) flowerLists.get(`flower_${r() < 0.7 ? fc : pick(['purple', 'red', 'yellow'])}${pick(['A', 'B', 'C'])}`).push({ x, z, r: r() * 6.28, s: rr(0.8, 1.4) });
    }
    if (r() < 0.4) { const x = p.x + rr(-8, 8), z = p.z + rr(-8, 8); if (free(x, z, 3)) { const k = pick(Object.keys(rockLists)); rockLists[k].push({ x, z, r: r() * 6.28, s: rr(0.8, 1.3) }); } }
  }
  /* Arbres isoles et touffes d'herbe repartis. */
  for (let i = 0; i < 40; i++) { const p = sample(8); if (p) addTree(p.x, p.z); }
  for (let i = 0; i < 260; i++) { const p = sample(1.5); if (p) grassLists[r() < 0.6 ? 'grass_large' : 'grass'].push({ x: p.x, z: p.z, r: r() * 6.28, s: rr(0.8, 1.5) }); }

  for (const t of TREES) group.add(instanced(N + t.f + '.glb', treeLists.get(t.f), { height: t.h, cast: true }));
  group.add(instanced(N + 'plant_bush.glb', bushLists.plant_bush, { width: 1.7 }));
  group.add(instanced(N + 'plant_bushLarge.glb', bushLists.plant_bushLarge, { width: 2.3 }));
  group.add(instanced(N + 'plant_bushSmall.glb', bushLists.plant_bushSmall, { width: 1.2 }));
  for (const n of flowerNames) group.add(instanced(N + n + '.glb', flowerLists.get(n), { height: 0.6 }));
  group.add(instanced(N + 'rock_smallA.glb', rockLists.rock_smallA, { width: 1.1 }));
  group.add(instanced(N + 'rock_smallB.glb', rockLists.rock_smallB, { width: 1.1 }));
  group.add(instanced(N + 'rock_smallC.glb', rockLists.rock_smallC, { width: 1.1 }));
  group.add(instanced(N + 'rock_largeA.glb', rockLists.rock_largeA, { width: 2.6 }));
  group.add(instanced(N + 'rock_largeB.glb', rockLists.rock_largeB, { width: 2.6 }));
  group.add(instanced(N + 'grass_large.glb', grassLists.grass_large, { width: 1.1 }));
  group.add(instanced(N + 'grass.glb', grassLists.grass, { width: 1.0 }));
  for (const k of ['rock_largeA', 'rock_largeB']) for (const p of rockLists[k]) block(p.x, p.z, 1.2, 1.2, 'rocher');

  /* --------------------------------------------------------
     Parvis du terminal : bancs et plantes (cote ville)
     -------------------------------------------------------- */
  const benches = [], plants = [], bins = [];
  for (const x of [262, 322, 388, 448, 478]) { benches.push({ x, z: 1279.2, r: Math.PI }); block(x, 1279.2, 0.95, 0.4, 'banc'); }
  for (const x of [284, 338, 384, 440]) { plants.push({ x, z: 1268.6 }); block(x, 1268.6, 0.4, 0.4, 'plante'); }
  for (const x of [250, 402]) { bins.push({ x, z: 1268.6 }); block(x, 1268.6, 0.35, 0.35, 'poubelle'); }
  group.add(instanced(F + 'benchCushion.glb', benches, { width: 1.9 }));
  group.add(instanced(F + 'pottedPlant.glb', plants, { height: 1.3 }));
  group.add(instanced(F + 'trashcan.glb', bins, { height: 0.95 }));

  /* --------------------------------------------------------
     Zone de fret : conteneurs colores, empiles
     -------------------------------------------------------- */
  const cont = { a: [], b: [], c: [] };
  const contKeys = ['a', 'b', 'c'];
  let ci = 0;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const x = 592 + col * 4.4, z = 1050 + row * 22;
      cont[contKeys[ci++ % 3]].push({ x, z });
      block(x, z, 1.9, 4.2, 'conteneur');
      if (col === 1 || col === 2) cont[contKeys[ci++ % 3]].push({ x, z, y: 3.4 });
    }
  }
  for (const k of contKeys) group.add(instanced(`${I}shipping-container-${k}.glb`, cont[k], { length: 8, cast: true }));

  /* --------------------------------------------------------
     Reperes de paysage : chateau d'eau, eoliennes, pompiers
     -------------------------------------------------------- */
  group.add(instanced(I + 'water-tower.glb', [{ x: 700, z: 815 }], { height: 15, cast: true }));
  block(700, 815, 2.6, 2.6, "château d'eau");
  const mills = [{ x: 650, z: 880 }, { x: 650, z: 1040 }];
  group.add(instanced(I + 'windmill.glb', mills, { height: 17, cast: true }));
  mills.forEach(m => block(m.x, m.z, 1.6, 1.6, 'eolienne'));

  /* Vague 2 (poly.pizza, CC BY 3.0, voir CREDITS.md) : avion de ligne gare sur l'aire et helicoptere pose. */
  const P = 'vehicles/polypizza/';
  group.add(instanced(P + 'airliner-poly-by-google.glb', [{ x: 190, z: 925, r: Math.PI / 2 }], { length: 36, cast: true }));
  block(190, 925, 19, 17, 'avion de ligne');
  block(95, 1226, 3, 6, 'helicoptere');
  group.add(instanced(P + 'helicopter-jeremy.glb', [{ x: 95, z: 1226, r: 0.6 }], { length: 12, cast: true }));

  /* Chariot elevateur (poly.pizza, CC BY 3.0) dans la zone de fret. */
  group.add(instanced(P + 'forklift-kolos.glb', [{ x: 640, z: 1158, r: 2.2 }], { length: 3.4, cast: true }));
  block(640, 1158, 1.0, 1.6, 'chariot élévateur');
  group.add(instanced(C + 'firetruck.glb', [{ x: 178, z: 1285, r: Math.PI }], { length: 8.5, cast: true }));
  group.add(instanced(C + 'ambulance.glb', [{ x: 212, z: 1285, r: Math.PI }], { length: 6.2, cast: true }));
  block(178, 1285, 1.7, 4.3, 'camion de pompiers');
  block(212, 1285, 1.5, 3.2, 'ambulance');

  /* --------------------------------------------------------
     Quartier de maisons au sud (derriere le parking), avec cloture
     -------------------------------------------------------- */
  const houseFiles = 'abcdefghijklmnopqrstu'.split('').map(l => `${S}building-type-${l}.glb`);
  const houses = new Map(houseFiles.map(f => [f, []]));
  for (let i = 0; i < 12; i++) {
    const x = 232 + i * 25 + rr(-2, 2), z = 1516 + rr(-2, 3);
    houses.get(houseFiles[(i * 5 + 3) % houseFiles.length]).push({ x, z, r: Math.PI });
    block(x, z, 6.2, 5.6, 'maison');
  }
  for (const [f, list] of houses) if (list.length) group.add(instanced(f, list, { width: 12.5, cast: true }));
  const fences = [];
  for (let x = 226; x < 536; x += 6.4) { fences.push({ x, z: 1494 }); }
  group.add(instanced(S + 'fence-low.glb', fences, { width: 6.4 }));
  block(381, 1494, 156, 0.25, 'cloture');

  /* --------------------------------------------------------
     Interieur du terminal : plantes le long de la baie vitree, tapis sous les sieges
     (obstacles de la seule zone `termHall`)
     -------------------------------------------------------- */
  const hallPlants = [];
  const AIR_DOORS = [300, 360, 420];
  for (let x = 246; x <= 474; x += 16) {
    if (AIR_DOORS.some(d => Math.abs(x - d) < 10)) continue;
    hallPlants.push({ x, z: 1200.2 });
    blockers.push({ id: `decor${bid++}`, label: 'plante', zone: 'termHall', rect: { x0: x - 0.35, x1: x + 0.35, z0: 1199.8, z1: 1200.6 } });
  }
  group.add(instanced(F + 'pottedPlant.glb', hallPlants, { height: 1.5 }));
  /* Coins salon contre le mur sud, entre les portes cote ville. */
  const sofas = [], wallPlants = [];
  for (const x of [330, 390]) {
    sofas.push({ x, z: 1262.2, r: Math.PI });
    blockers.push({ id: `decor${bid++}`, label: 'canape', zone: 'termHall', rect: { x0: x - 1.4, x1: x + 1.4, z0: 1261.2, z1: 1263.3 } });
  }
  for (const x of [318, 342, 378, 402]) {
    wallPlants.push({ x, z: 1262.4 });
    blockers.push({ id: `decor${bid++}`, label: 'plante', zone: 'termHall', rect: { x0: x - 0.35, x1: x + 0.35, z0: 1262, z1: 1262.8 } });
  }
  group.add(instanced(F + 'loungeSofaLong.glb', sofas, { width: 2.8 }));
  group.add(instanced(F + 'pottedPlant.glb', wallPlants, { height: 1.5 }));
  const rugs = [266, 322, 404, 462].map(x => ({ x, z: 1210.5, y: 0.04 }));
  group.add(instanced(F + 'rugRound.glb', rugs, { width: 7 }));

  /* --------------------------------------------------------
     Parking et abords (phase 32) : places marquees, voitures Kenney,
     terre-plein arbore, passages pietons, ligne de route, abribus, haies
     -------------------------------------------------------- */
  {
    const PK = { x0: 240, x1: 480 };
    const ROWS = [{ z: 1316, d: 0 }, { z: 1328, d: Math.PI }, { z: 1352, d: 0 }, { z: 1364, d: Math.PI }];
    const PITCH = 3.1, NSLOT = 71;
    const lampX = [250, 294, 338, 382, 426, 470];
    const flat = (w, d, hex, y, rough = 0.9) => new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: hex, roughness: rough, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const inst = (geo, hex, pts, y = 0.024) => {
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), pts.length);
      const m4 = new THREE.Matrix4();
      pts.forEach(([x, z], i) => { m4.makeTranslation(x, y, z); im.setMatrixAt(i, m4); });
      im.instanceMatrix.needsUpdate = true;
      im.receiveShadow = true;
      return im;
    };
    const flatGeo = (w, d) => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); return g; };

    /* Marquage des places. */
    const lines = [];
    for (const row of ROWS) for (let i = 0; i <= NSLOT; i++) lines.push([250 - PITCH / 2 + i * PITCH, row.z]);
    group.add(inst(flatGeo(0.12, 5.4), 0xe8edf2, lines));

    /* Voitures : une dizaine de modeles, places libres tirees au hasard. */
    const CARS = ['sedan', 'suv', 'hatchback-sports', 'van', 'taxi', 'sedan-sports', 'suv-luxury', 'delivery'];
    const carLists = new Map(CARS.map(c => [c, []]));
    for (const row of ROWS) {
      for (let k = 0; k < NSLOT; k++) {
        const x = 250 + k * PITCH;
        if (r() > 0.4) continue;
        if (lampX.some(lx => Math.abs(lx - x) < 1.9) && row.z === 1316) continue;
        const model = CARS[Math.floor(r() * CARS.length)];
        const rot = row.d + (r() < 0.2 ? Math.PI : 0) + rr(-0.04, 0.04);
        carLists.get(model).push({ x: x + rr(-0.2, 0.2), z: row.z + rr(-0.2, 0.2), r: rot });
        block(x, row.z, 1.0, 2.15, 'voiture');
      }
    }
    for (const [m, list] of carLists) group.add(instanced(C + m + '.glb', list, { length: m === 'van' || m === 'delivery' ? 5 : 4.4 }));

    /* Terre-plein central : pelouse, arbres, buissons, bordures. */
    const med = flat(PK.x1 - PK.x0 - 8, 15, 0x86b86f, 0);
    med.rotation.x = -Math.PI / 2; med.position.set(360, 0.03, 1340); med.receiveShadow = true;
    group.add(med);
    const curbs = inst(new THREE.BoxGeometry(PK.x1 - PK.x0 - 8, 0.18, 0.35), 0xcfd5dc, [[360, 1332.4], [360, 1347.6]], 0.09);
    group.add(curbs);
    const medTrees = [], medBushes = [];
    for (let x = 252; x <= 468; x += 12) {
      medTrees.push({ x, z: 1340, r: r() * 6.28, s: rr(0.8, 1.1) });
      block(x, 1340, 0.55, 0.55, 'arbre');
      medBushes.push({ x: x + 6, z: 1338.5 + rr(0, 3), r: r() * 6.28, s: rr(0.8, 1.2) });
    }
    group.add(instanced(N + 'tree_small.glb', medTrees, { height: 5.5, cast: false }));
    group.add(instanced(N + 'plant_bush.glb', medBushes, { width: 1.5 }));

    /* Passages pietons du parking vers le terminal (x 300, 360, 420) + ligne axiale. */
    const bars = [];
    for (const xc of [300, 360, 420]) for (let k = 0; k < 13; k++) bars.push([xc, 1284.2 + k * 1.0]);
    group.add(inst(flatGeo(3.2, 0.5), 0xf3f4f6, bars, 0.03));
    const dash = [];
    for (let x = 244; x < 720; x += 8) dash.push([x, 1290]);
    group.add(inst(flatGeo(3, 0.22), 0xf5c518, dash, 0.03));
    /* Flèches d'allee dans le parking. */
    const arrows = [];
    for (const az of [1322, 1358]) for (let x = 270; x < 480; x += 40) arrows.push([x, az]);
    group.add(inst(flatGeo(2.2, 0.35), 0xe8edf2, arrows, 0.026));

    /* Abribus + navette. */
    {
      const sh = new THREE.Group();
      sh.position.set(455, 0, 1300.5);
      const frame = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.5 });
      const glass = new THREE.MeshStandardMaterial({ color: 0x9fd0e8, roughness: 0.1, transparent: true, opacity: 0.4 });
      const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; sh.add(o); return o; };
      add(new THREE.BoxGeometry(5, 0.15, 2.2), new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.6 }), 0, 2.6, 0);
      for (const x of [-2.4, 2.4]) add(new THREE.BoxGeometry(0.12, 2.6, 0.12), frame, x, 1.3, 1);
      add(new THREE.BoxGeometry(5, 1.8, 0.06), glass, 0, 1.5, 1.05);
      add(new THREE.BoxGeometry(1.6, 0.5, 0.3), new THREE.MeshBasicMaterial({ color: 0x15803d }), 0, 3.0, 1.0);
      group.add(sh);
      block(455, 1300.5, 2.6, 1.3, 'abribus');
      group.add(instanced(F + 'benchCushion.glb', [{ x: 455, z: 1300.2, r: Math.PI }], { width: 1.9 }));
      group.add(instanced(C + 'van.glb', [{ x: 470, z: 1286, r: Math.PI / 2 }], { length: 5.2 }));
    }

    /* Haies autour du parking : sud, ouest, est. */
    const hedge = [], hedgeFl = [];
    for (let x = 232; x <= 490; x += 4.2) { hedge.push({ x, z: 1392, r: r() * 6.28, s: rr(0.9, 1.3) }); }
    for (let z = 1308; z <= 1388; z += 4.2) { hedge.push({ x: 235, z, r: r() * 6.28, s: rr(0.9, 1.3) }, { x: 485, z, r: r() * 6.28, s: rr(0.9, 1.3) }); }
    for (let x = 236; x <= 488; x += 9) hedgeFl.push({ x, z: 1394.2, r: r() * 6.28, s: rr(0.9, 1.3) });
    group.add(instanced(N + 'plant_bushLarge.glb', hedge, { width: 2.6 }));
    const fcols = ['purple', 'red', 'yellow'];
    for (const c of fcols) group.add(instanced(N + `flower_${c}A.glb`, hedgeFl.filter((_, i) => i % 3 === fcols.indexOf(c)), { height: 0.7 }));
    block(361, 1392, 130, 1.4, 'haie');
    block(235, 1348, 1.4, 41, 'haie');
    block(485, 1348, 1.4, 41, 'haie');
  }

  /* --------------------------------------------------------
     Nuit : halos et flaques de lumiere sous les mats (aire + parking)
     -------------------------------------------------------- */
  const masts = [];
  for (let x = 200; x <= 520; x += 80) { masts.push({ x, z: 880, h: 26.4, r: 26 }, { x, z: 1090, h: 26.4, r: 26 }); }
  masts.push({ x: 150, z: 780, h: 26.4, r: 26 }, { x: 150, z: 1300, h: 26.4, r: 26 }, { x: 30, z: 1300, h: 26.4, r: 26 });
  for (let x = 250; x <= 470; x += 44) masts.push({ x, z: 1318, h: 9.1, r: 11 }, { x, z: 1358, h: 9.1, r: 11 });

  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,236,190,1)'); g.addColorStop(0.35, 'rgba(255,214,140,0.45)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, masts.length);
  const M4 = new THREE.Matrix4();
  masts.forEach((m, i) => { M4.compose(new THREE.Vector3(m.x, 0.3, m.z), new THREE.Quaternion(), new THREE.Vector3(m.r * 2, 1, m.r * 2)); pools.setMatrixAt(i, M4); });
  pools.instanceMatrix.needsUpdate = true;
  pools.frustumCulled = false;
  pools.renderOrder = 2;
  group.add(pools);

  const hp = new Float32Array(masts.length * 3);
  masts.forEach((m, i) => { hp[i * 3] = m.x; hp[i * 3 + 1] = m.h; hp[i * 3 + 2] = m.z; });
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
  const haloMat = new THREE.PointsMaterial({ map: glowTex, size: 14, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
  const halos = new THREE.Points(hg, haloMat);
  halos.frustumCulled = false;
  group.add(halos);

  const setNight = (n) => {
    const k = Math.max(0, Math.min(1, (n - 0.15) / 0.5));
    poolMat.opacity = 0.55 * k;
    haloMat.opacity = 0.9 * k;
    pools.visible = halos.visible = k > 0.01;
  };

  return { group, blockers, setNight };
}
