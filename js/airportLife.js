/* ============================================================
   airportLife.js — L'aeroport vit (phase 20)

   Jusqu'ici l'aeroport etait un decor fige : seuls les PNJ
   bougeaient. Ce module ajoute ce qu'on voit dans un vrai aeroport :

   Batiments : caserne de pompiers, depot de carburant, hall de fret,
     heliport, aviation legere, entree cote ville du terminal, indicateur
     de pente (PAPI), feux de taxiway, feu de la tour.
   Vehicules : tracteur a bagages, bus passagers, camion-citerne, camion
     de pompiers en patrouille, fourgon de fret, voitures sur la route
     cote ville. Ils suivent des itineraires (layout.js), s'arretent aux
     postes et freinent devant le joueur.
   Aeronefs : un avion de ligne qui vit sa vie (poste -> roulage ->
     decollage -> ciel ... arrivee -> atterrissage -> roulage -> poste),
     un helicoptere qui decolle et fait le tour du site, du trafic lointain
     dans le ciel quand le joueur pilote.
   Personnes : des voyageurs qui vont du parking a l'entree du terminal.

   Tout est cinematique (aucune physique) et frugal : une trentaine de
   petits groupes, mis a jour avec un dt. Les operations sur la piste
   s'interrompent des que le joueur monte dans l'avion.
   ============================================================ */

import * as THREE from 'three';
import { LAYOUT } from './layout.js?v=1791477622';
import { instanced } from './props.js?v=1791477622';

const L = LAYOUT;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const rnd = (a, b) => a + Math.random() * (b - a);

/* Cap (rad) : 0 = nord (-Z), positif vers l'est. Direction avant = (sin h, -cos h). */
const headingOf = (dx, dz) => Math.atan2(dx, -dz);

/* Materiaux partages (un par couleur) : peu de programmes de shader. */
const _mats = new Map();
function mat(color, { r = 0.6, m = 0.1, e = 0, ei = 0 } = {}) {
  const key = `${color}|${r}|${m}|${e}|${ei}`;
  let x = _mats.get(key);
  if (!x) {
    x = new THREE.MeshStandardMaterial({ color, roughness: r, metalness: m, emissive: e, emissiveIntensity: ei });
    _mats.set(key, x);
  }
  return x;
}

function add(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, material);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.castShadow = true;
  parent.add(o);
  return o;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 14) => new THREE.CylinderGeometry(rt, rb, h, s);

const TIRE = mat(0x1c1f24, { r: 0.95 });
function wheels(g, pts, r = 0.45, w = 0.32) {
  const geo = cyl(r, r, w, 12);
  for (const [x, z] of pts) add(g, geo, TIRE, x, r, z, 0, 0, Math.PI / 2);
}

/* ---------------------------------------------------------- */
/* Vehicules (avant = -Z)                                      */
/* ---------------------------------------------------------- */

function buildTractor(blinkers) {
  const g = new THREE.Group();
  add(g, box(1.7, 0.9, 2.4), mat(0xf5c518), 0, 0.85, 0);
  add(g, box(1.5, 0.9, 1.3), mat(0xf5c518), 0, 1.7, 0.2);
  add(g, box(1.4, 0.5, 0.05), mat(0x243447, { m: 0.3 }), 0, 1.75, -0.47);
  wheels(g, [[-0.85, -0.8], [0.85, -0.8], [-0.85, 0.8], [0.85, 0.8]], 0.42);
  const beacon = add(g, cyl(0.12, 0.12, 0.2, 8), mat(0xffa500, { e: 0xffa500, ei: 1.2 }), 0, 2.3, 0.2);
  blinkers.push({ mesh: beacon, on: 0xffa500, off: 0x553300, rate: 2.2 });
  /* Trois chariots a bagages accroches derriere (rigides). */
  const bagColors = [0xd94a3d, 0x2b6cb0, 0x2f9e44, 0x8e44ad, 0xf08c00];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Group();
    c.position.z = 2.9 + i * 2.9;
    add(c, box(1.9, 0.14, 2.5), mat(0x8a95a3, { m: 0.4 }), 0, 0.62, 0);
    add(c, box(1.9, 0.5, 0.06), mat(0x6b7686, { m: 0.4 }), 0, 0.9, -1.2);
    add(c, box(1.9, 0.5, 0.06), mat(0x6b7686, { m: 0.4 }), 0, 0.9, 1.2);
    wheels(c, [[-0.8, -0.9], [0.8, -0.9], [-0.8, 0.9], [0.8, 0.9]], 0.25, 0.2);
    for (let b = 0; b < 3; b++) {
      add(c, box(0.6, 0.42, 0.4), mat(bagColors[(i * 3 + b) % bagColors.length], { r: 0.8 }),
        -0.5 + b * 0.5, 0.92, (b % 2 ? 0.4 : -0.4));
    }
    g.add(c);
  }
  return g;
}

export function buildBus() {
  const g = new THREE.Group();
  add(g, box(2.6, 2.5, 11), mat(0xfacc15, { r: 0.5 }), 0, 1.9, 0);
  add(g, box(2.62, 0.9, 10.2), mat(0x1e2a3a, { m: 0.4, r: 0.2 }), 0, 2.35, 0);        // vitrage
  add(g, box(2.62, 0.12, 11.02), mat(0xffffff), 0, 1.35, 0);                             // bande blanche
  add(g, box(2.2, 0.3, 4), mat(0xe5e7eb), 0, 3.3, 0.5);                                  // climatisation
  add(g, box(2.4, 0.3, 0.12), mat(0xfff3b0, { e: 0xfff3b0, ei: 0.8 }), 0, 1.4, -5.53);   // phares
  wheels(g, [[-1.2, -3.6], [1.2, -3.6], [-1.2, 3.4], [1.2, 3.4]], 0.6, 0.4);
  return g;
}

function buildFuelTruck(blinkers) {
  const g = new THREE.Group();
  add(g, box(2.4, 2.2, 2.3), mat(0xffffff), 0, 1.7, -2.6);                     // cabine
  add(g, box(2.2, 0.8, 0.05), mat(0x243447, { m: 0.3 }), 0, 2.2, -3.78);
  add(g, box(2.3, 0.5, 8), mat(0x3b4350), 0, 0.85, 1.5);                        // chassis
  add(g, cyl(1.25, 1.25, 6.2, 18), mat(0xffffff, { m: 0.25, r: 0.35 }), 0, 2.1, 2.2, Math.PI / 2, 0, 0);
  add(g, cyl(1.27, 1.27, 0.7, 18), mat(0xdc2626), 0, 2.1, 2.2, Math.PI / 2, 0, 0);
  add(g, cyl(0.3, 0.3, 0.3, 10), mat(0x9ca3af, { m: 0.6 }), 0, 3.45, 1.2);
  wheels(g, [[-1.1, -2.6], [1.1, -2.6], [-1.1, 2.0], [1.1, 2.0], [-1.1, 3.4], [1.1, 3.4]], 0.55, 0.4);
  const b = add(g, box(0.5, 0.15, 0.25), mat(0xffa500, { e: 0xffa500, ei: 1.2 }), 0, 2.9, -2.6);
  blinkers.push({ mesh: b, on: 0xffa500, off: 0x553300, rate: 2.4 });
  return g;
}

export function buildFireTruck(blinkers) {
  const g = new THREE.Group();
  add(g, box(2.6, 2.6, 2.6), mat(0xd7261e, { r: 0.4 }), 0, 1.9, -2.9);         // cabine
  add(g, box(2.4, 0.9, 0.05), mat(0x1f2937, { m: 0.3 }), 0, 2.4, -4.23);
  add(g, box(2.6, 2.3, 5.6), mat(0xd7261e, { r: 0.4 }), 0, 1.75, 1.3);          // caisson
  add(g, box(2.62, 0.25, 8.4), mat(0xffffff), 0, 1.35, -0.2);                   // bande blanche
  add(g, box(0.5, 0.25, 5.2), mat(0xb8bfc8, { m: 0.6 }), 0, 3.05, 1.3);         // echelle
  add(g, box(1.6, 0.1, 5.4), mat(0xb8bfc8, { m: 0.6 }), 0, 3.0, 1.3);
  wheels(g, [[-1.15, -2.9], [1.15, -2.9], [-1.15, 1.1], [1.15, 1.1], [-1.15, 2.7], [1.15, 2.7]], 0.62, 0.45);
  const bar = add(g, box(1.6, 0.18, 0.4), mat(0x2563eb, { e: 0x2563eb, ei: 1.4 }), 0, 3.3, -3.4);
  blinkers.push({ mesh: bar, on: 0x3b82f6, off: 0xdc2626, rate: 3.2 });
  return g;
}

function buildVan(color = 0xffffff) {
  const g = new THREE.Group();
  add(g, box(2.2, 2.2, 3.2), mat(color), 0, 1.8, 1.0);
  add(g, box(2.1, 1.5, 1.6), mat(color), 0, 1.5, -1.5);
  add(g, box(1.9, 0.7, 0.05), mat(0x243447, { m: 0.3 }), 0, 1.9, -2.32);
  wheels(g, [[-1.0, -1.4], [1.0, -1.4], [-1.0, 1.6], [1.0, 1.6]], 0.42);
  return g;
}

function buildCar(color, lights) {
  const g = new THREE.Group();
  add(g, box(1.85, 0.7, 4.0), mat(color, { r: 0.35, m: 0.4 }), 0, 0.65, 0);
  add(g, box(1.6, 0.55, 2.0), mat(0x2b3947, { m: 0.5, r: 0.15 }), 0, 1.2, 0.2);
  wheels(g, [[-0.85, -1.3], [0.85, -1.3], [-0.85, 1.3], [0.85, 1.3]], 0.33, 0.24);
  const hl = mat(0xfff3b0, { e: 0xfff3b0, ei: 0 });
  add(g, box(0.4, 0.15, 0.05), hl, -0.6, 0.75, -2.02);
  add(g, box(0.4, 0.15, 0.05), hl, 0.6, 0.75, -2.02);
  lights.push(hl);
  return g;
}

/* ---------------------------------------------------------- */
/* Suiveur d'itineraire                                        */
/* ---------------------------------------------------------- */

class Mover {
  constructor(group, route, opt = {}) {
    this.g = group;
    this.pts = route;
    this.i = Math.min(opt.startIndex || 0, route.length - 1);
    this.dir = 1;
    this.speed = opt.speed || 6;
    this.turn = opt.turn || 2.2;
    this.arrive = opt.arrive || 1.6;
    this.accel = opt.accel || 4;
    this.v = 0;
    this.wait = opt.startWait != null ? opt.startWait : (route[this.i][2] || 0);
    this.x = route[this.i][0];
    this.z = route[this.i][1];
    const nxt = route[Math.min(this.i + 1, route.length - 1)];
    this.h = headingOf(nxt[0] - this.x, nxt[1] - this.z);
    this.len = opt.len || 6;
    this.gate = opt.gate || null;        // 'gate' : ne sert le poste du joueur que s'il y est
    this.apply();
  }

  apply() {
    this.g.position.x = this.x;
    this.g.position.z = this.z;
    this.g.rotation.y = -this.h;
  }

  /* brake : true si quelque chose barre la route (joueur, autre vehicule). */
  update(dt, brake) {
    if (this.wait > 0) { this.wait -= dt; this.v = 0; return; }
    const t = this.pts[this.i];
    const dx = t[0] - this.x, dz = t[1] - this.z;
    const d = Math.hypot(dx, dz);
    if (d < this.arrive) {
      this.wait = t[2] || 0;
      let n = this.i + this.dir;
      if (n < 0 || n >= this.pts.length) { this.dir *= -1; n = this.i + this.dir; }
      this.i = clamp(n, 0, this.pts.length - 1);
      /* Au repos apres avoir rejoint une extremite : le meme arret que l'aller. */
      return;
    }
    const want = headingOf(dx, dz);
    const dh = wrapPi(want - this.h);
    this.h += clamp(dh, -this.turn * dt, this.turn * dt);
    let target = this.speed * (Math.abs(dh) > 0.6 ? 0.3 : 1);
    if (brake) target = 0;
    this.v += clamp(target - this.v, -this.accel * 2 * dt, this.accel * dt);
    this.x += Math.sin(this.h) * this.v * dt;
    this.z += -Math.cos(this.h) * this.v * dt;
    this.apply();
  }
}

/* ============================================================ */
export class AirportLife {
  /* `h` : { r3d, group, pbr, TEX, makeSign } fournis par le rendu. */
  constructor(h) {
    this.h = h;
    this.group = h.group;
    this.blinkers = [];
    this.headlights = [];
    this.dots = [];                 // pour la mini-carte : { x, z, k }
    this.movers = [];               // vehicules { m: Mover, g, kind, gate }
    this.time = 0;
    this._night = null;

    this.buildStructures();
    this.buildVehicles();
    this.buildAirliner();
    this.buildHelicopter();
    this.buildWalkers();
    this.buildSkyTraffic();
  }

  /* ---------------------------------------------------------- */
  /* Batiments et equipements fixes                              */
  /* ---------------------------------------------------------- */
  buildStructures() {
    const { group: g, pbr, TEX, makeSign } = this.h;

    const facade = pbr(TEX.facade(), { color: 0xdbe2ea, rough: 0.75, repeat: [6, 1] });
    const concrete = pbr(TEX.concrete(), { color: 0xc4cbd4, rough: 0.8, repeat: [4, 2] });
    const roof = pbr(TEX.roof(), { color: 0x9aa3ad, rough: 0.95, repeat: [6, 4] });
    const asphalt = pbr(TEX.apron(), { color: 0x7d838c, rough: 0.9, repeat: [4, 2] });
    const flat = (w, d, x, z, m, y = 0.013) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
      p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true; g.add(p); return p;
    };
    const sign = (t, x, y, z, opt) => { const s = makeSign(t, opt); s.position.set(x, y, z); g.add(s); };

    /* --- Caserne de pompiers : trois portes vers le nord (parvis + camions) --- */
    const fs = L.fireStation, fa = L.fireApron;
    flat(fa.x1 - fa.x0, fa.z1 - fa.z0, (fa.x0 + fa.x1) / 2, (fa.z0 + fa.z1) / 2, asphalt);
    const fsW = fs.x1 - fs.x0, fsD = fs.z1 - fs.z0, fcx = (fs.x0 + fs.x1) / 2, fcz = (fs.z0 + fs.z1) / 2;
    add(g, box(fsW, 8, fsD), facade, fcx, 4, fcz);
    add(g, box(fsW + 2, 0.8, fsD + 2), mat(0xb91c1c), fcx, 8.4, fcz);
    for (let i = 0; i < 3; i++) {
      add(g, box(14, 6, 0.4), mat(0xf5f5f5, { r: 0.5 }), fcx - 18 + i * 18, 3, fs.z0 - 0.15);
      add(g, box(14.4, 0.5, 0.5), mat(0xd7261e), fcx - 18 + i * 18, 6.2, fs.z0 - 0.2);
    }
    sign('POMPIERS', fcx, 14, fs.z0 - 2, { bg: '#b91c1c', w: 30, h: 8 });

    /* Route de service le long de la piste (cote est). */
    const sr = L.serviceRoad;
    flat(sr.w, sr.z1 - sr.z0, sr.x, (sr.z0 + sr.z1) / 2, asphalt);

    /* --- Depot de carburant : trois reservoirs, un local technique, des tuyaux --- */
    const ff = L.fuelFarm;
    ff.tanks.forEach(t => {
      add(g, cyl(ff.r, ff.r, 8, 24), mat(0xf3f4f6, { r: 0.35, m: 0.3 }), t.x, 4, t.z);
      add(g, cyl(ff.r + 0.05, ff.r + 0.05, 1.1, 24), mat(0xdc2626), t.x, 5.6, t.z);
      add(g, cyl(ff.r - 1, ff.r - 1, 0.4, 20), mat(0xcbd5e1, { m: 0.5 }), t.x, 8.2, t.z);
    });
    const sh = ff.shed;
    add(g, box(sh.x1 - sh.x0, 5, sh.z1 - sh.z0), concrete, (sh.x0 + sh.x1) / 2, 2.5, (sh.z0 + sh.z1) / 2);
    add(g, box(sh.x1 - sh.x0 + 1, 0.4, sh.z1 - sh.z0 + 1), roof, (sh.x0 + sh.x1) / 2, 5.2, (sh.z0 + sh.z1) / 2);
    const fcx0 = ff.tanks[1].x, fz0 = ff.tanks[0].z;
    add(g, cyl(0.35, 0.35, 45, 8), mat(0x9ca3af, { m: 0.6 }), fcx0, 1.5, fz0 + 13, 0, 0, Math.PI / 2);
    flat(80, 44, fcx0, fz0 + 17, asphalt);
    sign('CARBURANT', fcx0, 16, sh.z1 + 12, { bg: '#b45309', w: 32, h: 9 });

    /* --- Hall de fret : quais et rampes cote sud --- */
    const cg = L.cargo, cw = cg.x1 - cg.x0, cd = cg.z1 - cg.z0, ccx = (cg.x0 + cg.x1) / 2, ccz = (cg.z0 + cg.z1) / 2;
    add(g, box(cw, 10, cd), pbr(TEX.metal(), { color: 0x8fa3b8, rough: 0.6, metal: 0.4, repeat: [8, 1] }), ccx, 5, ccz);
    add(g, box(cw + 2, 0.6, cd + 2), roof, ccx, 10.3, ccz);
    for (let i = 0; i < 5; i++) {
      add(g, box(8, 5, 0.4), mat(0x334155, { r: 0.6 }), cg.x0 + 12 + i * 14, 2.5, cg.z1 + 0.1);
      add(g, box(8.4, 0.5, 0.5), mat(0xf59e0b), cg.x0 + 12 + i * 14, 5.1, cg.z1 + 0.15);
    }
    flat(cw, 40, ccx, cg.z1 + 20, asphalt);
    sign('FRET', ccx, 17, cg.z1 + 3, { bg: '#1d4ed8', w: 22, h: 8 });
    for (let i = 0; i < 2; i++) {
      const v = buildVan(i ? 0xf1f5f9 : 0xfde68a);
      v.position.set(cg.x0 + 20 + i * 28, 0, cg.z1 + 10);
      v.rotation.y = 0.3 * (i ? 1 : -1);
      g.add(v);
    }

    /* --- Heliport --- */
    const hp = L.helipad;
    flat(hp.r * 2 + 4, hp.r * 2 + 4, hp.x, hp.z, asphalt);
    const ring = new THREE.Mesh(new THREE.RingGeometry(hp.r - 1.2, hp.r, 40),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(hp.x, 0.03, hp.z); g.add(ring);
    const hc = document.createElement('canvas'); hc.width = hc.height = 128;
    const hx = hc.getContext('2d');
    hx.fillStyle = 'rgba(0,0,0,0)'; hx.fillRect(0, 0, 128, 128);
    hx.fillStyle = '#facc15'; hx.font = '900 110px sans-serif'; hx.textAlign = 'center'; hx.textBaseline = 'middle';
    hx.fillText('H', 64, 68);
    const htex = new THREE.CanvasTexture(hc);
    htex.colorSpace = THREE.SRGBColorSpace;
    const hm = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: htex, transparent: true, depthWrite: false }));
    hm.rotation.x = -Math.PI / 2; hm.position.set(hp.x, 0.035, hp.z); g.add(hm);

    /* --- Aviation legere : dalle et petits avions colores --- */
    const ga = L.gaApron;
    flat(ga.x1 - ga.x0, ga.z1 - ga.z0, (ga.x0 + ga.x1) / 2, (ga.z0 + ga.z1) / 2, asphalt);
    const gaColors = [0xef4444, 0x3b82f6, 0xfacc15, 0x22c55e];
    for (let i = 0; i < 4; i++) {
      const p = this.smallPlane(gaColors[i]);
      p.position.set(ga.x0 + 10 + (i % 2) * 24, 0, ga.z0 + 16 + Math.floor(i / 2) * 36);
      p.rotation.y = (i % 2 ? 0.25 : -0.2);
      g.add(p);
    }
    sign('AVIATION LEGERE', (ga.x0 + ga.x1) / 2, 12, ga.z0 - 2, { bg: '#0e7490', w: 34, h: 9 });
    sign('HELIPORT', hp.x, 14, hp.z - 16, { bg: '#7c3aed', w: 26, h: 8 });

    /* --- Entree cote ville du terminal : porte, auvent, panneau --- */
    const ld = L.landsideDoor;
    /* Phase 22 : la facade vitree et la marquise sont dans terminalBuilding.js ;
       l'entree est une vraie porte ouverte, on la franchit a pied. */
    sign('DEPARTS', ld.x, 8.4, ld.z + 6.5, { bg: '#0369a1', w: 12, h: 3.4 });
    flat(ld.w + 8, 30, ld.x, ld.z + 17, mat(0xa8adb5, { r: 0.9 }));

    /* --- PAPI : quatre feux rouges / blancs a gauche du seuil nord --- */
    this.papi = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.MeshBasicMaterial({ color: i < 2 ? 0xff3b30 : 0xffffff });
      const b = new THREE.Mesh(box(1.6, 1, 1.6), m);
      b.position.set(L.papi.x - i * 5, 0.6, L.papi.z);
      g.add(b);
      this.papi.push(m);
    }

    /* --- Feux de taxiway (bleus) : instancies le long du taxiway --- */
    const pts = [];
    for (let z = -700; z <= 1500; z += 45) { pts.push([L.taxiway.x - L.taxiway.width / 2 - 0.6, z], [L.taxiway.x + L.taxiway.width / 2 + 0.6, z]); }
    this.taxiMat = new THREE.MeshBasicMaterial({ color: 0x24344a });
    const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 6, 4), this.taxiMat, pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach(([x, z], i) => { m4.makeTranslation(x, 0.35, z); inst.setMatrixAt(i, m4); });
    inst.instanceMatrix.needsUpdate = true;
    g.add(inst);

    /* --- Feu de la tour : gyrophare vert / blanc --- */
    this.towerLight = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshBasicMaterial({ color: 0x22c55e, fog: false }));
    this.towerLight.position.set(L.tower.x, 77, L.tower.z);
    g.add(this.towerLight);
  }

  smallPlane(color) {
    const g = new THREE.Group();
    add(g, cyl(0.75, 0.5, 7.2, 12), mat(0xf8fafc, { r: 0.4 }), 0, 1.5, 0, Math.PI / 2, 0, 0);
    add(g, cyl(0.76, 0.76, 1.6, 12), mat(color), 0, 1.5, -2.0, Math.PI / 2, 0, 0);
    add(g, box(11, 0.14, 1.5), mat(0xf8fafc), 0, 2.15, -0.6);
    add(g, box(0.12, 1.5, 1.1), mat(color), 0, 2.4, 3.2);
    add(g, box(3.4, 0.1, 0.9), mat(0xf8fafc), 0, 1.7, 3.2);
    add(g, cyl(0.06, 0.06, 2.2, 6), mat(0x222222), 0, 1.5, -3.75, 0, 0, Math.PI / 2);   // helice (pale)
    wheels(g, [[-1.1, -0.6], [1.1, -0.6], [0, -2.6]], 0.3, 0.16);
    return g;
  }

  /* ---------------------------------------------------------- */
  /* Vehicules                                                   */
  /* ---------------------------------------------------------- */
  buildVehicles() {
    const R = L.routes, g = this.group;
    const veh = (model, route, opt, kind, gate = null) => {
      g.add(model);
      const mv = new Mover(model, route, opt);
      this.movers.push({ mv, g: model, kind, gate });
      return mv;
    };

    veh(buildTractor(this.blinkers), R.baggage, { speed: 5.5, len: 12 }, 'baggage', 'gate');
    veh(buildBus(), R.bus, { speed: 7, len: 11, turn: 1.5 }, 'bus');
    /* Camion-citerne en modele 3D (poly.pizza, CC BY 3.0) : nez vers -X dans le fichier, le Mover avance vers -Z. */
    const fuelModel = new THREE.Group();
    fuelModel.add(instanced('vehicles/polypizza/fuel-truck-kolos.glb', [{ x: 0, z: 0, r: -Math.PI / 2 }], { width: 9, cast: true }));
    veh(fuelModel, R.fuel, { speed: 6.5, len: 9, turn: 1.4 }, 'fuel');
    veh(buildVan(0xf8fafc), R.cargo, { speed: 8, len: 5 }, 'van');
    veh(buildFireTruck(this.blinkers), R.fire, { speed: 9, len: 9, turn: 1.3, startWait: 40 }, 'fire');
    /* Deux camions de pompiers au repos devant la caserne. */
    this.parkedFire = [];               // le premier se conduit (fireTruck.js)
    for (let i = 0; i < 2; i++) {
      const t = buildFireTruck(this.blinkers);
      t.position.set(L.fireApron.x0 + 22 + i * 18, 0, L.fireApron.z1 - 6);
      t.rotation.y = 0;
      g.add(t);
      this.parkedFire.push(t);
    }

    /* Voitures sur la route cote ville : entrent, se garent un moment, repartent. */
    const colors = [0xef4444, 0x3b82f6, 0xf8fafc, 0x22c55e, 0x64748b, 0xfacc15, 0xf97316];
    for (let i = 0; i < 5; i++) {
      const slotX = 270 + i * 44 + rnd(-6, 6);
      const route = [[712, 1293, 0], [slotX, 1293, 0], [slotX, 1312, rnd(6, 16)]];
      const car = buildCar(colors[i % colors.length], this.headlights);
      const mv = veh(car, route, { speed: rnd(7, 10), len: 4.2, turn: 2.6, arrive: 2, startIndex: 0, startWait: i * 7 }, 'car');
      mv.dir = 1;
    }
  }

  /* ---------------------------------------------------------- */
  /* Avion de ligne « vivant »                                   */
  /* ---------------------------------------------------------- */
  buildAirliner() {
    const s = L.standS2;
    const a = this.h.r3d.buildStaticAircraft(this.group, new THREE.Vector3(s.x, 3.45, s.z), s.heading);
    a.rotation.order = 'YXZ';
    this.air = {
      g: a, x: s.x, y: 3.45, z: s.z, h: s.heading * Math.PI / 180, pitch: 0, v: 0,
      state: 'PARKED', t: 30, path: null, pi: 0, gone: 0
    };
    this._airApply();
  }

  _airApply() {
    const a = this.air;
    a.g.position.set(a.x, a.y, a.z);
    a.g.rotation.set(a.pitch, -a.h, 0);
  }

  /* Suit un chemin au sol (rayon d'arrivee large : les virages sont coupes). */
  _airTaxi(dt, speed) {
    const a = this.air;
    const t = a.path[a.pi];
    const dx = t[0] - a.x, dz = t[1] - a.z, d = Math.hypot(dx, dz);
    if (d < 9) { a.pi++; return a.pi >= a.path.length; }
    const dh = wrapPi(headingOf(dx, dz) - a.h);
    a.h += clamp(dh, -0.5 * dt, 0.5 * dt);
    const target = speed * (Math.abs(dh) > 0.5 ? 0.4 : 1);
    a.v += clamp(target - a.v, -6 * dt, 3 * dt);
    a.x += Math.sin(a.h) * a.v * dt;
    a.z += -Math.cos(a.h) * a.v * dt;
    return false;
  }

  _airliner(dt, ctx) {
    const a = this.air;
    const free = ctx.runwayFree;
    /* Le joueur monte dans l'avion : tout ce qui est sur la piste ou en l'air disparait. */
    if (!free && ['LINEUP', 'TAKEOFF', 'CLIMB', 'APPROACH', 'ROLLOUT'].includes(a.state)) {
      a.state = 'GONE'; a.t = 25; a.g.visible = false;
    }
    /* A l'attente, on le cache si le joueur occupe la piste (il partirait du meme point). */
    if (a.state === 'HOLD') a.g.visible = !!free;
    switch (a.state) {
      case 'PARKED':
        a.t -= dt;
        if (a.t <= 0) { a.state = 'TAXI_OUT'; a.path = L.routes.taxiOut; a.pi = 1; }
        break;
      case 'TAXI_OUT':
        if (this._airTaxi(dt, 11)) { a.state = 'HOLD'; a.v = 0; }
        break;
      case 'HOLD':
        a.v = 0;
        if (free) { a.state = 'LINEUP'; a.t = 6; }
        break;
      case 'LINEUP': {
        /* On s'aligne sur l'axe de piste, cap nord. */
        a.x += clamp(0 - a.x, -3 * dt, 3 * dt);
        a.h += clamp(wrapPi(0 - a.h), -0.35 * dt, 0.35 * dt);
        a.t -= dt;
        if (a.t <= 0 && Math.abs(a.x) < 0.5) { a.state = 'TAKEOFF'; a.v = 0; }
        break;
      }
      case 'TAKEOFF':
        a.v = Math.min(78, a.v + 2.1 * dt);
        a.z -= a.v * dt;
        if (a.v > 68) a.pitch = Math.min(0.2, a.pitch + 0.09 * dt * 8);
        if (a.v > 70) { a.y += (a.v - 60) * 0.55 * dt; }
        if (a.y > 60) a.state = 'CLIMB';
        break;
      case 'CLIMB':
        a.z -= a.v * dt;
        a.y += 13 * dt;
        if (a.z < -6500 || a.y > 900) { a.state = 'GONE'; a.t = rnd(45, 80); a.g.visible = false; }
        break;
      case 'GONE':
        a.t -= dt;
        if (a.t <= 0 && free) {
          /* Arrivee : en finale a 5,5 km, cap sud, dans l'axe. */
          a.g.visible = true; a.state = 'APPROACH';
          a.x = 0; a.z = -6800; a.y = 3.45 + 0.0524 * (-1200 - a.z); a.h = Math.PI; a.v = 75; a.pitch = -0.05;
        }
        break;
      case 'APPROACH': {
        a.z += a.v * dt;
        const target = a.z < -1200 ? 3.45 + 0.0524 * (-1200 - a.z) : 3.45;
        a.y = Math.max(3.45, target);
        a.pitch += (a.y > 3.6 ? -0.05 - a.pitch : 0.07 - a.pitch) * 1.5 * dt;
        if (a.y <= 3.46) { a.state = 'ROLLOUT'; a.pitch = 0; }
        break;
      }
      case 'ROLLOUT':
        a.pitch += (0 - a.pitch) * 3 * dt;
        a.v = Math.max(16, a.v - 2.6 * dt);
        a.z += a.v * dt;
        if (a.z > -300 - 40) {
          /* Sortie de piste par la bretelle z = -300 : on tourne vers l'est. */
          a.state = 'TAXI_IN'; a.path = L.routes.taxiIn; a.pi = 1;
        }
        break;
      case 'TAXI_IN':
        a.pitch = 0;
        if (this._airTaxi(dt, 11)) {
          /* Arrive : on se range face au sud, comme au depart. */
          a.state = 'PARK_TURN';
        }
        break;
      case 'PARK_TURN': {
        a.h += clamp(wrapPi(Math.PI - a.h), -0.5 * dt, 0.5 * dt);
        a.v = Math.max(0, a.v - 4 * dt);
        a.x += Math.sin(a.h) * a.v * dt; a.z += -Math.cos(a.h) * a.v * dt;
        if (Math.abs(wrapPi(Math.PI - a.h)) < 0.02 && a.v < 0.1) {
          a.state = 'PARKED'; a.t = rnd(45, 70); a.x = L.standS2.x; a.z = L.standS2.z; a.h = Math.PI;
        }
        break;
      }
    }
    /* Le sol suit la position 2D : au sol y = 3.45. */
    if (['PARKED', 'TAXI_OUT', 'HOLD', 'LINEUP', 'TAXI_IN', 'PARK_TURN'].includes(a.state)) { a.y = 3.45; a.pitch = 0; }
    this._airApply();
  }

  /* ---------------------------------------------------------- */
  /* Helicoptere                                                 */
  /* ---------------------------------------------------------- */
  buildHelicopter() {
    const g = new THREE.Group();
    add(g, new THREE.SphereGeometry(1.4, 16, 12), mat(0xdc2626, { r: 0.3, m: 0.3 }), 0, 1.9, 0).scale.set(1, 0.95, 1.7);
    add(g, box(1.7, 0.7, 1.3), mat(0x1e3a5f, { m: 0.4, r: 0.1 }), 0, 2.15, -1.3);              // verriere
    add(g, cyl(0.28, 0.14, 5.5, 8), mat(0xdc2626), 0, 2.2, 4.0, Math.PI / 2, 0, 0);            // poutre de queue
    add(g, box(0.1, 1.4, 0.9), mat(0xf8fafc), 0, 2.8, 6.4);
    for (const sx of [-0.9, 0.9]) {
      add(g, cyl(0.07, 0.07, 3.6, 6), mat(0x222222), sx, 0.5, 0.2, Math.PI / 2, 0, 0);
      add(g, cyl(0.06, 0.06, 1.1, 6), mat(0x222222), sx, 1.0, -0.9);
      add(g, cyl(0.06, 0.06, 1.1, 6), mat(0x222222), sx, 1.0, 1.2);
    }
    add(g, cyl(0.1, 0.1, 0.5, 8), mat(0x555555), 0, 3.1, 0);
    const rotor = new THREE.Group();
    rotor.position.y = 3.35;
    add(rotor, box(11, 0.06, 0.35), mat(0x2a2a2a), 0, 0, 0);
    add(rotor, box(0.35, 0.06, 11), mat(0x2a2a2a), 0, 0, 0);
    g.add(rotor);
    const tail = new THREE.Group();
    tail.position.set(0.25, 2.8, 6.4);
    add(tail, box(0.08, 1.7, 0.1), mat(0x2a2a2a), 0, 0, 0);
    g.add(tail);
    g.position.set(L.helipad.x, 0, L.helipad.z);
    this.group.add(g);
    this.heli = { g, rotor, tail, x: L.helipad.x, z: L.helipad.z, y: 0, h: 0, state: 'IDLE', t: rnd(20, 45), rs: 6, ang: 0 };
  }

  _heli(dt, ctx) {
    const h = this.heli;
    /* Il ne vole pas quand le joueur est aux commandes (jamais de collision). */
    const canFly = ctx.state !== 'PILOT';
    const cx = L.helipad.x, cz = L.helipad.z;
    switch (h.state) {
      case 'IDLE':
        h.rs += (7 - h.rs) * dt;
        h.t -= dt;
        if (h.t <= 0 && canFly) { h.state = 'SPIN'; h.t = 6; }
        break;
      case 'SPIN':
        h.rs += (32 - h.rs) * 1.2 * dt;
        h.t -= dt;
        if (h.t <= 0) h.state = 'RISE';
        break;
      case 'RISE':
        h.y += 7 * dt; h.rs = 32;
        if (h.y >= 70) { h.state = 'FLY'; h.t = rnd(50, 70); h.ang = 0; }
        break;
      case 'FLY': {
        /* Grand tour de l'aeroport : cercle de 320 m centre sur l'aire. */
        h.ang += dt * 0.11;
        const px = 230 + Math.cos(h.ang) * 300, pz = 1030 + Math.sin(h.ang) * 300;
        const nx = px - h.x, nz = pz - h.z;
        const d = Math.hypot(nx, nz);
        if (d > 0.1) {
          const want = headingOf(nx, nz);
          h.h += clamp(wrapPi(want - h.h), -1.2 * dt, 1.2 * dt);
          const sp = Math.min(30, d * 0.8 + 6);
          h.x += Math.sin(h.h) * sp * dt; h.z += -Math.cos(h.h) * sp * dt;
        }
        h.t -= dt;
        if (h.t <= 0 || !canFly) h.state = 'RETURN';
        break;
      }
      case 'RETURN': {
        const nx = cx - h.x, nz = cz - h.z, d = Math.hypot(nx, nz);
        const want = headingOf(nx, nz);
        h.h += clamp(wrapPi(want - h.h), -1.2 * dt, 1.2 * dt);
        const sp = Math.min(28, d * 0.6 + 4);
        h.x += Math.sin(h.h) * sp * dt; h.z += -Math.cos(h.h) * sp * dt;
        if (d < 8) { h.state = 'LAND'; }
        break;
      }
      case 'LAND':
        h.x += (cx - h.x) * 1.5 * dt; h.z += (cz - h.z) * 1.5 * dt;
        h.y = Math.max(0, h.y - 5 * dt);
        h.h += clamp(wrapPi(0 - h.h), -0.6 * dt, 0.6 * dt);
        if (h.y <= 0) { h.state = 'IDLE'; h.t = rnd(60, 110); h.y = 0; }
        break;
    }
    if (h.state === 'IDLE' || h.state === 'LAND') h.rs += ((h.state === 'LAND' ? 20 : 6) - h.rs) * dt;
    h.rotor.rotation.y += h.rs * dt;
    h.tail.rotation.x += h.rs * 1.6 * dt;
    /* Inclinaison vers l'avant en vol. */
    const fly = h.state === 'FLY' || h.state === 'RETURN';
    h.g.position.set(h.x, h.y, h.z);
    h.g.rotation.set(fly ? -0.12 : 0, -h.h, 0, 'YXZ');
  }

  /* ---------------------------------------------------------- */
  /* Voyageurs cote ville                                        */
  /* ---------------------------------------------------------- */
  buildWalkers() {
    const { r3d } = this.h;
    this.walkers = [];
    const uniform = [0xe11d48, 0x2563eb, 0x16a34a, 0xf59e0b, 0x7c3aed, 0x0891b2, 0xdb2777, 0x475569];
    for (let i = 0; i < 8; i++) {
      const ent = r3d.buildTechnician(uniform[i], uniform[(i + 3) % uniform.length], false);
      ent.group.visible = false;
      this.group.add(ent.group);
      this.walkers.push({ ent, state: 'WAIT', t: i * 4 + rnd(1, 6), x: 0, z: 0, tx: 0, tz: 0 });
    }
  }

  _walkers(dt, ctx) {
    const { r3d } = this.h;
    const door = L.landsideDoor;
    for (const w of this.walkers) {
      if (w.state === 'WAIT') {
        w.t -= dt;
        if (w.t <= 0) {
          w.x = rnd(L.parking.x0 + 10, L.parking.x1 - 10);
          w.z = 1316;
          w.tx = door.x + rnd(-2.5, 2.5); w.tz = door.z - 6;
          w.state = 'WALK';
          w.ent.group.visible = true;
        }
        continue;
      }
      const dx = w.tx - w.x, dz = w.tz - w.z, d = Math.hypot(dx, dz);
      if (d < 0.8) {
        w.state = 'WAIT'; w.t = rnd(8, 26); w.ent.group.visible = false;
        continue;
      }
      /* Ils s'arretent un instant si le joueur leur barre la route. */
      let sp = 1.7;
      if (ctx.player && Math.hypot(ctx.player.x - w.x, ctx.player.z - w.z) < 1.8) sp = 0;
      w.x += dx / d * sp * dt; w.z += dz / d * sp * dt;
      w.ent.group.position.set(w.x, 0, w.z);
      w.ent.group.rotation.y = Math.atan2(dx, dz);     // les personnages regardent vers +Z local
      r3d.updateAvatarAnim(w.ent, sp > 0, dt);
    }
  }

  /* ---------------------------------------------------------- */
  /* Trafic lointain (visible quand le joueur pilote)            */
  /* ---------------------------------------------------------- */
  buildSkyTraffic() {
    this.sky = [];
    const defs = [
      { y: 1900, z: -5200, x: -6000, vx: 210, vz: 0, h: 90 },
      { y: 2600, z: 4200, x: 6500, vx: -230, vz: 0, h: 270 },
      { y: 1500, z: -2600, x: -7000, vx: 190, vz: 60, h: 100 }
    ];
    for (const d of defs) {
      const a = this.h.r3d.buildStaticAircraft(this.group, new THREE.Vector3(d.x, d.y, d.z), d.h);
      a.scale.setScalar(4);
      a.visible = false;
      this.sky.push({ g: a, ...d });
    }
  }

  _sky(dt, ctx) {
    const show = ctx.state === 'PILOT';
    for (const s of this.sky) {
      s.g.visible = show;
      if (!show) continue;
      s.x += s.vx * dt; s.z += s.vz * dt;
      if (Math.abs(s.x) > 9000) s.x = -Math.sign(s.vx) * 8500;
      s.g.position.set(s.x, s.y, s.z);
    }
  }

  /* ---------------------------------------------------------- */
  /* Boucle                                                      */
  /* ---------------------------------------------------------- */
  /* ctx : { state, player:{x,z}, acAtGate, runwayFree, wind:{x,z}, lightsOn } */
  update(dt, t, ctx) {
    this.time += dt;
    dt = Math.min(dt, 0.1);
    this.setNight(!!ctx.lightsOn);

    /* Vehicules : freinent devant le joueur et devant un autre vehicule. */
    for (const it of this.movers) {
      const m = it.mv;
      let brake = false;
      const fx = Math.sin(m.h), fz = -Math.cos(m.h);
      const check = (px, pz, r) => {
        const dx = px - m.x, dz = pz - m.z, d = Math.hypot(dx, dz);
        return d < r && (dx * fx + dz * fz) / (d || 1) > 0.5;
      };
      if (ctx.player && check(ctx.player.x, ctx.player.z, m.len * 0.5 + 5)) brake = true;
      if (!brake) for (const o of this.movers) {
        if (o === it) continue;
        if (check(o.mv.x, o.mv.z, m.len * 0.5 + o.mv.len * 0.5 + 3)) { brake = true; break; }
      }
      /* Le tracteur ne va au poste du joueur que si l'avion y est. */
      if (it.gate === 'gate' && !ctx.acAtGate && m.i >= m.pts.length - 1) m.wait = Math.max(m.wait, 1);
      /* Phase 25 : au terminal, il attend qu'on charge des bagages (tri des bagages) ;
         des qu'un bagage est charge il part vers l'avion. */
      if (it.kind === 'baggage' && ctx.bagsWaiting != null) {
        const n0 = L.routes.baggage[0];
        const atTerm = Math.hypot(m.x - n0[0], m.z - n0[1]) < 3;
        if (ctx.bagsLoaded > (this._bagSeen || 0)) { this._bagSeen = ctx.bagsLoaded; this._bagGo = true; if (atTerm) m.wait = 0; }
        else if (atTerm && m.dir === 1 && !this._bagGo && ctx.bagsWaiting > 0) m.wait = Math.max(m.wait, 0.5);
        if (!atTerm) this._bagGo = false;
      }
      m.update(dt, brake);
    }

    this._airliner(dt, ctx);
    this._heli(dt, ctx);
    this._walkers(dt, ctx);
    this._sky(dt, ctx);

    /* Gyrophares. */
    for (const b of this.blinkers) {
      const on = Math.sin(this.time * b.rate * Math.PI) > 0;
      b.mesh.material = on ? this._blinkMat(b.on) : this._blinkMat(b.off);
    }
    /* Feu de la tour : alternance vert / blanc. */
    if (this.towerLight) this.towerLight.material.color.setHex(Math.sin(this.time * 2.4) > 0 ? 0x22ff88 : 0xffffff);

    /* Manche a air : s'oriente sous le vent. */
    const r3d = this.h.r3d;
    if (r3d.windsock && ctx.wind) {
      const sp = Math.hypot(ctx.wind.x, ctx.wind.z);
      if (sp > 0.2) r3d.windsock.rotation.y = -Math.atan2(ctx.wind.z, ctx.wind.x);
      r3d.windsock.rotation.z = Math.PI / 2 - clamp(sp / 12, 0, 1) * 0.5 * (1 - 0.15 * Math.sin(this.time * 4));
    }

    /* Points de la mini-carte. */
    const d = this.dots;
    d.length = 0;
    for (const it of this.movers) d.push({ x: it.mv.x, z: it.mv.z, k: 'v' });
    if (this.air.g.visible) d.push({ x: this.air.x, z: this.air.z, k: 'a' });
    d.push({ x: this.heli.x, z: this.heli.z, k: 'h' });
  }

  /* L'avion de ligne est-il a son poste ? (sert a activer son obstacle de navigation) */
  get airAtStand() {
    const s = this.air.state;
    return s === 'PARKED' || s === 'PARK_TURN' || (s === 'TAXI_IN' && this.air.pi >= this.air.path.length - 1);
  }

  _blinkMat(color) {
    this._bm = this._bm || new Map();
    let m = this._bm.get(color);
    if (!m) { m = new THREE.MeshBasicMaterial({ color }); this._bm.set(color, m); }
    return m;
  }

  /* Nuit : phares allumes, feux de taxiway bleus, PAPI plein feu. */
  setNight(on) {
    if (on === this._night) return;
    this._night = on;
    for (const m of this.headlights) { m.emissiveIntensity = on ? 1.6 : 0; }
    if (this.taxiMat) this.taxiMat.color.setHex(on ? 0x3aa0ff : 0x24344a);
  }
}
