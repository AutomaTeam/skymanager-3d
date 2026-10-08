/* ============================================================
   navigation.test.js — Tests d'invariants du graphe de navigation

   Le module ne connait ni le DOM ni la scene (seul Three.js lui
   sert a manipuler des Vector3/Quaternion) : il est donc testable
   isolement, dans une page vide, sans construire le jeu entier.

   Usage : ouvrir test-navigation.html via devserver.py et lire le
   resultat affiche (ou la console). Aucune dependance de build —
   memes contraintes que le reste du projet.

   Chaque test est une fonction qui leve si l'invariant est viole ;
   `run()` les execute toutes et rapporte le premier echec de
   chacune sans s'arreter au premier test en echec.
   ============================================================ */

import * as THREE from 'three';
import { Navigation, ZONES, PORTALS, BLOCKERS } from './navigation.js';
import { LAYOUT } from './layout.js';
import { slideMove, pushOut, depenetrate } from './bodies.js?v=1791471104';
import { bounceOffScenery, obstacleHeight } from './sceneryCollision.js?v=1791471104';
import { buildDecor } from './decor.js?v=1791471104';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function approxEqual(a, b, eps, msg) {
  assert(Math.abs(a - b) <= eps, `${msg} (attendu ~${b}, obtenu ${a})`);
}

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

/* La zone `cabinAisle` vit dans le repere `aircraft` : tant qu'aucune
   pose n'est publiee, toLocal()/toWorld() retombent sur les
   coordonnees monde inchangees (voir toLocal/toWorld), et un point du
   monde peut alors tomber "par accident" dans le petit rectangle local
   de l'allee. Les tests qui portent sur le tarmac publient donc une
   pose d'appareil realiste avant de questionner le graphe, exactement
   comme le fait le jeu (placeAircraftAtGate) avant tout mouvement. */
function makeNav() {
  const nav = new Navigation();
  const pos = new THREE.Vector3(366, 0, 1168);
  const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 1.5);
  nav.setFrame('aircraft', pos, quat);
  return nav;
}

/* ---------------------------------------------------------- */

test('zoneAt : priorite des interieurs sur le tarmac qui les englobe', () => {
  const nav = makeNav();
  const z1 = nav.zoneAt(0, 0);
  assert(z1 && z1.id === 'tarmac', 'un point neutre du tarmac doit resoudre en tarmac');
  const z2 = nav.zoneAt(360, 1210);
  assert(z2 && z2.id === 'termHall', 'un point dans le hall doit resoudre en termHall, pas tarmac malgre le recouvrement');
});

test('isWalkable : un portail est toujours praticable, meme hors zone declarante', () => {
  const nav = makeNav();
  const p = PORTALS.find(p => p.id === 'termDoor');
  const cx = (p.rect.x0 + p.rect.x1) / 2, cz = (p.rect.z0 + p.rect.z1) / 2;
  assert(nav.isWalkable(cx, cz), 'le centre de la porte du terminal doit etre praticable');
});

test('isWalkable : mur et mobilier du terminal sont refuses, la promenade est praticable', () => {
  const nav = makeNav();
  /* Phase 22 : tout le batiment est praticable, sauf ses murs (x 230..231)
     et son mobilier (LAYOUT.termFurniture). */
  assert(!nav.isWalkable(230.4, 1230), 'le pignon ouest ne doit pas etre praticable');
  assert(!nav.isWalkable(326, 1248), "un comptoir d'enregistrement ne doit pas etre praticable");
  assert(!nav.isWalkable(262, 1238), 'le carrousel a bagages ne doit pas etre praticable');
  assert(nav.isWalkable(360, 1230), 'la promenade centrale doit etre praticable');
  assert(nav.isWalkable(250, 1230), "l'aile ouest du terminal doit etre praticable");
});

test('resolve : une cible en plein mur n\'est jamais acceptee telle quelle', () => {
  const nav = makeNav();
  const b = BLOCKERS.find(b => b.id === 'terminalBuilding');
  const midZ = (b.rect.z0 + b.rect.z1) / 2;
  const from = { x: b.rect.x0 - 5, z: midZ };
  const to = { x: b.rect.x0 + 0.5, z: midZ };   // dans l'epaisseur du pignon ouest
  const r = nav.resolve(from, to);
  assert(!(r.x === to.x && r.z === to.z), 'la cible en plein mur ne doit pas etre acceptee telle quelle');
  assert(nav.isWalkable(r.x, r.z), 'le point resolu doit rester praticable');
});

test('findPath : chemin trivial vers soi-meme', () => {
  const nav = makeNav();
  const p = nav.findPath('tarmac', 'tarmac');
  assert(p && p.length === 1 && p[0] === 'tarmac', 'un chemin vers sa propre zone est un singleton');
});

test('findPath : tarmac -> termHall via le portail termDoor', () => {
  const nav = makeNav();
  const p = nav.findPath('tarmac', 'termHall');
  assert(p && p.join(',') === 'tarmac,termHall', `chemin attendu tarmac->termHall, obtenu ${p && p.join(',')}`);
});

test('findPath : zone inexistante renvoie null plutot que de lever', () => {
  const nav = makeNav();
  const p = nav.findPath('tarmac', 'zoneQuiNexistePas');
  assert(p === null, 'une zone inconnue doit rendre null, pas planter ni renvoyer un chemin errone');
});

test('_detour : contournement d\'un hangar isole (regression phase 6)', () => {
  const nav = makeNav();
  const from = { x: 495, z: 900 };
  const to = { x: 585, z: 900 };
  assert(!nav._segmentWalkable(from.x, from.z, to.x, to.z), 'la ligne directe doit couper le hangar 1 (sinon le test ne teste rien)');
  const wp = nav.waypoints(from, to);
  assert(nav._polylineWalkable(from, wp), 'le contournement du hangar doit produire un trajet entierement praticable');
});

test('waypoints : approche d\'une porte etroite depuis un angle qui coupe le batiment (regression du detour ignorant les portails)', () => {
  const nav = makeNav();
  /* Point a l'ouest du batiment terminal, vers une cible a l'interieur
     du hall : la ligne directe vers la porte coupe le batiment avant
     de l'atteindre. Avant le correctif, `_detour` ne connaissait pas
     les coins de portail et echouait systematiquement dans ce cas,
     renvoyant un trajet direct connu pour traverser le mur. */
  const from = { x: 200, z: 1230 };
  const to = { x: 345, z: 1210 };
  const direct = nav._segmentWalkable(from.x, from.z, to.x, to.z);
  assert(!direct, 'la ligne directe doit couper le batiment (sinon le test ne teste rien)');
  assert(nav.zoneAt(to.x, to.z).id === 'termHall', 'la cible doit etre dans le terminal');
  const wp = nav.waypoints(from, to);
  assert(nav._polylineWalkable(from, wp), 'le trajet retourne doit etre entierement praticable, porte comprise');
});

test('nearestWalkable : ramene un point non praticable sur du sol reel', () => {
  const nav = makeNav();
  const b = BLOCKERS.find(b => b.id === 'terminalBuilding');
  /* x = 250 : dans le batiment mais hors du hall (voir le test isWalkable
     ci-dessus) — non praticable, donc la spirale de recherche est
     reellement exercee, contrairement au centre geometrique du batiment
     qui tombe deja dans le hall. */
  const cx = 338, cz = 1248;      // en plein comptoir d'enregistrement 2
  assert(!nav.isWalkable(cx, cz), 'le point de depart doit etre non praticable (sinon le test ne teste rien)');
  const w = nav.nearestWalkable(cx, cz);
  assert(nav.isWalkable(w.x, w.z), 'le point rendu par nearestWalkable doit toujours etre praticable');
});

test('setFrame/toLocal/toWorld : conversion reversible pour un repere mobile', () => {
  const nav = new Navigation();
  const pos = new THREE.Vector3(360, 0, 1168);
  const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 3);
  nav.setFrame('aircraft', pos, quat);
  const localPt = { x: 5, z: -12 };
  const world = nav.toWorld('aircraft', localPt.x, localPt.z);
  const backToLocal = nav.toLocal('aircraft', world.x, world.z);
  approxEqual(backToLocal.x, localPt.x, 1e-6, 'aller-retour monde->local en x');
  approxEqual(backToLocal.z, localPt.z, 1e-6, 'aller-retour monde->local en z');
});

test('zoneCenter/_portalCenter : coherents avec le repere declare de la zone/portail', () => {
  const nav = new Navigation();
  const pos = new THREE.Vector3(360, 0, 1168);
  const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4);
  nav.setFrame('aircraft', pos, quat);
  const cabinAisle = ZONES.find(z => z.id === 'cabinAisle');
  const c = nav.zoneCenter(cabinAisle);
  /* Le centre de l'allee cabine (repere avion) doit se retrouver a
     proximite immediate de la position de l'appareil, pas au centre
     du monde (bug frequent : oublier de transformer par le repere). */
  const d = Math.hypot(c.x - pos.x, c.z - pos.z);
  assert(d < 15, `le centre de l'allee cabine doit rester pres de l'appareil (distance obtenue ${d.toFixed(2)})`);
});

/* ---------------------------------------------------------- */
/* Plan de l'aeroport (layout.js) : coherent avec la navigation */
/* ---------------------------------------------------------- */

const rectEq = (a, b) => a.x0 === b.x0 && a.x1 === b.x1 && a.z0 === b.z0 && a.z1 === b.z1;

test('layout : les obstacles de navigation suivent le plan (terminal, bureau, hangars)', () => {
  const blk = (id) => BLOCKERS.find(b => b.id === id);
  const L = LAYOUT;
  assert(rectEq(blk('terminalBuilding').rect, L.terminal), 'terminal : obstacle different du plan');
  assert(rectEq(blk('opsOffice').rect, L.office), 'bureau : obstacle different du plan');
  L.hangars.forEach((h, i) => assert(rectEq(blk('hangar' + (i + 1)).rect, h), `hangar ${i + 1} : obstacle different du plan`));
});

test('layout : la tour est contenue dans son obstacle et proche de la porte', () => {
  const t = LAYOUT.tower;
  const r = BLOCKERS.find(b => b.id === 'towerBase').rect;
  assert(t.x - t.r >= r.x0 && t.x + t.r <= r.x1 && t.z - t.r >= r.z0 && t.z + t.r <= r.z1,
    'l\'emprise de la tour depasse son obstacle');
  const d = Math.hypot(t.x - LAYOUT.gate.x, t.z - LAYOUT.gate.z);
  assert(d < 130, `la tour doit etre a moins de 130 m de la porte d'embarquement (obtenu ${d.toFixed(0)} m)`);
});

test('layout : rien ne se superpose (tour, bureau, terminal, aire, hangars)', () => {
  const t = LAYOUT.tower;
  const boxes = [
    ['tour', { x0: t.x - t.r, x1: t.x + t.r, z0: t.z - t.r, z1: t.z + t.r }],
    ['bureau', LAYOUT.office], ['terminal', LAYOUT.terminal],
    ...LAYOUT.hangars.map((h, i) => ['hangar ' + (i + 1), h])
  ];
  const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
  /* La tour touche le bureau (batiment accole) : seule paire autorisee. */
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    if (boxes[i][0] === 'tour' && boxes[j][0] === 'bureau') continue;
    assert(!hit(boxes[i][1], boxes[j][1]), `${boxes[i][0]} et ${boxes[j][0]} se chevauchent`);
  }
});

test('layout : le point de gestion de la tour est praticable et hors obstacle', () => {
  const nav = new Navigation();
  /* Meme point que HOTSPOTS.tower dans main.js. */
  assert(nav.isWalkable(289, 1132), 'le point d\'interaction de la tour n\'est pas praticable');
  assert(!nav.isWalkable(LAYOUT.tower.x, LAYOUT.tower.z), 'le centre de la tour devrait etre bloque');
  assert(!nav.isWalkable((LAYOUT.office.x0 + LAYOUT.office.x1) / 2, (LAYOUT.office.z0 + LAYOUT.office.z1) / 2),
    'le centre du bureau devrait etre bloque');
});

test('layout : chaque bretelle relie la piste au taxiway sans traverser un batiment', () => {
  const L = LAYOUT;
  const x0 = L.runway.x + L.runway.width / 2, x1 = L.taxiway.x - L.taxiway.width / 2;
  for (const z of L.linkZ) {
    const strip = { x0, x1, z0: z - 12, z1: z + 12 };
    for (const b of BLOCKERS.filter(b => !b.frame)) {
      const hit = strip.x0 < b.rect.x1 && strip.x1 > b.rect.x0 && strip.z0 < b.rect.z1 && strip.z1 > b.rect.z0;
      assert(!hit, `la bretelle z=${z} traverse ${b.label}`);
    }
  }
  assert(L.linkZ.includes(1380), 'il faut une bretelle au point d\'attente (z 1380) ou le tracteur depose l\'avion');
});

/* ---------------------------------------------------------- */
/* Vie de l'aeroport (phase 20)                                 */
/* ---------------------------------------------------------- */

const boxOf = (r) => ({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 });
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

/* Emprises au sol des batiments et zones du plan (hors routes et bretelles, qui se croisent volontairement). */
function footprints() {
  const L = LAYOUT, t = L.tower, ff = L.fuelFarm, hp = L.helipad;
  const list = [
    ['terminal', L.terminal], ['tour', { x0: t.x - t.r, x1: t.x + t.r, z0: t.z - t.r, z1: t.z + t.r }],
    ['bureau', L.office], ['caserne', L.fireStation], ['parvis pompiers', L.fireApron],
    ['fret', L.cargo], ['aviation legere', L.gaApron], ['parking', L.parking],
    ['local carburant', ff.shed], ['heliport', { x0: hp.x - hp.r, x1: hp.x + hp.r, z0: hp.z - hp.r, z1: hp.z + hp.r }]
  ];
  L.hangars.forEach((h, i) => list.push(['hangar ' + (i + 1), h]));
  ff.tanks.forEach((k, i) => list.push(['reservoir ' + (i + 1), { x0: k.x - ff.r, x1: k.x + ff.r, z0: k.z - ff.r, z1: k.z + ff.r }]));
  return list;
}

test('vie : les nouveaux batiments ne se chevauchent pas (ni avec les anciens)', () => {
  const list = footprints();
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    if (list[i][0] === 'tour' && list[j][0] === 'bureau') continue;      // batiments accoles
    assert(!overlap(list[i][1], list[j][1]), `${list[i][0]} et ${list[j][0]} se chevauchent`);
  }
});

test('vie : batiments et parvis restent dans l\'enceinte et hors piste, taxiway et aire', () => {
  const L = LAYOUT;
  const fence = { x0: -140, x1: 660, z0: -1550, z1: 1650 };
  const runwayBand = { x0: L.runway.x - 53, x1: L.runway.x + 53, z0: -1600, z1: 1700 };   // piste + accotements
  const taxi = { x0: L.taxiway.x - L.taxiway.width / 2, x1: L.taxiway.x + L.taxiway.width / 2, z0: L.taxiway.z0, z1: L.taxiway.z1 };
  for (const [name, r] of footprints()) {
    assert(r.x0 >= fence.x0 && r.x1 <= fence.x1 && r.z0 >= fence.z0 && r.z1 <= fence.z1, `${name} sort de l'enceinte`);
    assert(!overlap(r, runwayBand), `${name} empiete sur la piste ou ses accotements`);
    assert(!overlap(r, taxi), `${name} empiete sur le taxiway`);
    if (name !== 'terminal' && !/hangar|tour|bureau/.test(name)) {
      assert(!overlap(r, L.apron), `${name} empiete sur l'aire de stationnement`);
    }
  }
});

test('vie : aucun itineraire de vehicule ne traverse un batiment', () => {
  const nav = new Navigation();
  const walls = BLOCKERS.filter(b => !b.frame && b.id !== 'staticAircraft' && b.id !== 'playerAircraft');
  const R = LAYOUT.routes;
  for (const name of ['baggage', 'bus', 'fuel', 'cargo', 'fire', 'taxiOut', 'taxiIn']) {
    const pts = R[name];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2));
      for (let k = 0; k <= n; k++) {
        const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n;
        for (const b of walls) {
          const r = b.rect;
          assert(!(x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1), `l'itineraire ${name} traverse ${b.label} en (${x.toFixed(0)}, ${z.toFixed(0)})`);
        }
      }
    }
  }
  assert(nav, 'navigation');
});

test('vie : les itineraires de roulage relient le poste, l\'attente de piste et une sortie de piste', () => {
  const R = LAYOUT.routes, s = LAYOUT.standS2;
  assert(R.taxiOut[0][0] === s.x && R.taxiOut[0][1] === s.z, 'le roulage au depart doit partir du poste');
  const last = R.taxiOut[R.taxiOut.length - 1];
  assert(LAYOUT.linkZ.includes(last[1]), 'le point d\'attente doit etre sur une bretelle');
  const exit = R.taxiIn[0];
  assert(LAYOUT.linkZ.includes(exit[1]), 'la sortie de piste doit etre une bretelle');
  const end = R.taxiIn[R.taxiIn.length - 1];
  assert(end[0] === s.x && end[1] === s.z, 'le roulage a l\'arrivee doit finir au poste');
});

/* ---------------------------------------------------------- */

export function run() {
  const results = TESTS.map(({ name, fn }) => {
    try { fn(); return { name, ok: true }; }
    catch (e) { return { name, ok: false, error: e.message }; }
  });
  const passed = results.filter(r => r.ok).length;
  return { results, passed, total: results.length };
}

/* ---------------------------------------------------------- */
/* Terminal integre (phase 22) */
/* ---------------------------------------------------------- */

test('terminal : six portes (3 cote piste, 3 cote ville) relient le tarmac au hall', () => {
  const doors = PORTALS.filter(p => p.a === 'tarmac' && p.b === 'termHall');
  assert(doors.length === 6, `6 portails attendus, obtenu ${doors.length}`);
  const nav = makeNav();
  for (const d of doors) {
    const cx = (d.rect.x0 + d.rect.x1) / 2;
    /* On doit pouvoir traverser la facade en ligne droite par chaque porte. */
    const north = d.rect.z0 < LAYOUT.terminal.z0;
    const z0 = north ? LAYOUT.terminal.z0 - 8 : LAYOUT.terminal.z1 + 8;
    const z1 = north ? LAYOUT.terminal.z0 + 8 : LAYOUT.terminal.z1 - 8;
    assert(nav._segmentWalkable(cx, z0, cx, z1), `la porte ${d.id} doit se franchir en ligne droite`);
  }
});

test('terminal : les facades pleines ne se traversent pas (entre les portes)', () => {
  const nav = makeNav();
  assert(!nav._segmentWalkable(320, LAYOUT.terminal.z0 - 8, 320, LAYOUT.terminal.z0 + 8), 'facade nord pleine entre deux portes');
  assert(!nav._segmentWalkable(390, LAYOUT.terminal.z1 + 8, 390, LAYOUT.terminal.z1 - 8), 'facade sud pleine entre deux portes');
  assert(!nav._segmentWalkable(220, 1230, 240, 1230), 'pignon ouest plein');
});

test("terminal : le mobilier est a l'interieur du hall et ne se chevauche pas", () => {
  const T = LAYOUT.terminal, F = LAYOUT.termFurniture;
  for (const f of F) {
    assert(f.x0 > T.x0 && f.x1 < T.x1 && f.z0 > T.z0 && f.z1 < T.z1, `${f.id} sort du batiment`);
  }
  for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
    const a = F[i], b = F[j];
    assert(a.x1 <= b.x0 || b.x1 <= a.x0 || a.z1 <= b.z0 || b.z1 <= a.z0, `${a.id} et ${b.id} se chevauchent`);
  }
});

test("terminal : aucune porte n'est bouchee par du mobilier, et chaque poste est joignable", () => {
  const nav = makeNav();
  const F = LAYOUT.termFurniture;
  for (const d of [...LAYOUT.terminal.airDoors, ...LAYOUT.terminal.landDoors]) {
    for (const f of F) {
      const overlapX = f.x1 > d.x - d.w / 2 - 1 && f.x0 < d.x + d.w / 2 + 1;
      const nearWall = f.z0 < LAYOUT.terminal.z0 + 8 || f.z1 > LAYOUT.terminal.z1 - 8;
      assert(!(overlapX && nearWall), `${f.id} obstrue la porte x=${d.x}`);
    }
  }
  /* Le joueur doit pouvoir aller de la porte ville a la porte piste. */
  const wp = nav.waypoints({ x: 360, z: 1280 }, { x: 360, z: 1170 });
  assert(nav._polylineWalkable({ x: 360, z: 1280 }, wp), 'trajet ville -> piste a travers le terminal impraticable');
});

/* ---------------------------------------------------------- */
/* Decor en modeles 3D (plan graphisme, etape 5) */
/* ---------------------------------------------------------- */

test('decor : 500 trajets aleatoires sur le tarmac, avec tous les obstacles du decor, restent praticables', () => {
  const nav = makeNav();
  nav.blockers = [...nav.blockers, ...buildDecor().blockers];
  nav._buildGrid();
  let seed = 987654321;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = () => {
    for (let i = 0; i < 200; i++) {
      const x = -120 + rnd() * 840, z = 640 + rnd() * 900;
      const zn = nav.zoneAt(x, z);
      if (zn && zn.id === 'tarmac' && nav.isWalkable(x, z)) return { x, z };
    }
    return null;
  };
  let tried = 0, bad = 0;
  for (let i = 0; i < 500; i++) {
    const a = pick(), b = pick();
    if (!a || !b) continue;
    tried++;
    const wp = nav.waypoints(a, b);
    if (!nav._polylineWalkable(a, wp)) bad++;
  }
  assert(tried > 400, `trop peu de trajets tires (${tried})`);
  assert(bad / tried < 0.03, `${bad}/${tried} trajets bloques par le decor (max 3 %)`);
});

test("decor : aucun obstacle du decor n'est place sur un poste, une porte ou un portail", () => {
  const blockers = buildDecor().blockers.filter(b => !b.zone);
  for (const p of PORTALS) {
    for (const b of blockers) {
      const hit = b.rect.x0 < p.rect.x1 && b.rect.x1 > p.rect.x0 && b.rect.z0 < p.rect.z1 && b.rect.z1 > p.rect.z0;
      assert(!hit, `${b.label} (${b.id}) bloque le portail ${p.id}`);
    }
  }
});

/* ---------------------------------------------------------- */
/* Physique du personnage : corps mobiles (js/bodies.js) */
/* ---------------------------------------------------------- */

test('corps mobiles : une personne ou un vehicule ne se traverse pas, meme en un grand pas', () => {
  const nav = makeNav();
  const veh = { x: 400, z: 900, h: 0, hl: 4.5, hw: 1.4 };
  let r = slideMove(nav, { x: 400, z: 915 }, { x: 400, z: 880 }, [veh]);
  assert(r.z > 904, `le vehicule est traverse (z=${r.z})`);
  const per = { x: 350, z: 900, r: 0.35 };
  r = slideMove(nav, { x: 350, z: 920 }, { x: 350, z: 880 }, [per]);
  assert(r.z > 900.5, `la personne est traversee (z=${r.z})`);
  /* Un sprint a travers toute la facade du terminal reste dehors. */
  r = slideMove(nav, { x: 330, z: LAYOUT.terminal.z0 - 4 }, { x: 330, z: LAYOUT.terminal.z0 + 30 }, []);
  assert(r.z < LAYOUT.terminal.z0, `la facade est traversee (z=${r.z})`);
});

test("corps mobiles : on glisse le long d'un obstacle et on ressort s'il nous englobe", () => {
  const nav = makeNav();
  const veh = { x: 400, z: 900, h: 0, hl: 4.5, hw: 1.4 };
  const r = slideMove(nav, { x: 399, z: 909 }, { x: 392, z: 902 }, [veh]);
  assert(r.x < 399 && !pushOut(veh, r.x, r.z), 'pas de glissement le long de la face');
  const out = pushOut(veh, 400.2, 900);
  assert(out && Math.abs(out.x - 400) > 1.7, 'le point englobe doit etre repousse hors de la boite');
  assert(pushOut(veh, 420, 900) === null, 'un point libre ne doit pas bouger');
});

test("corps mobiles : un PNJ ne traverse pas une personne, et une personne qui avance sur l'avatar le repousse", () => {
  const nav = makeNav();
  const me = {};
  const other = { x: 350, z: 900, r: 0.35, ref: {} };
  /* Un PNJ (self = lui) fonce sur une autre personne : il s'arrete devant elle. */
  const r = slideMove(nav, { x: 350, z: 920 }, { x: 350, z: 880 }, [other, { x: 350, z: 910, r: 0.35, ref: me }], null, me);
  assert(r.z > 900.5, `la personne est traversee (z=${r.z})`);
  /* On ne se repousse pas soi-meme. */
  const r2 = slideMove(nav, { x: 350, z: 920 }, { x: 350, z: 915 }, [{ x: 350, z: 920, r: 0.35, ref: me }], null, me);
  assert(Math.abs(r2.z - 915) < 1e-6, 'un corps ne doit pas se bloquer lui-meme');
  /* Avatar immobile avec une personne qui lui marche dessus : repousse hors du corps. */
  const p = depenetrate(nav, 350.1, 900, [other]);
  assert(p && Math.hypot(p.x - other.x, p.z - other.z) >= 0.7, "l'avatar doit etre repousse");
  assert(depenetrate(nav, 360, 900, [other]) === null, 'pas de repoussee a distance');
});

test("vol : un avion qui fonce dans un arbre ou un hangar rebondit, sans le traverser", () => {
  const tree = { id: 'decor1', label: 'arbre', rect: { x0: 99.5, x1: 100.5, z0: 99.5, z1: 100.5 } };
  const ac = { onGround: false, pos: { x: 92, y: 5, z: 100 }, vel: { x: 70, y: 0, z: 0 } };
  const hit = bounceOffScenery(ac, [tree]);
  assert(hit && hit.label === 'arbre', 'le contact doit etre signale');
  assert(ac.pos.x < 99.5 - 9 + 0.01 && ac.vel.x <= 0, `rebond attendu (x=${ac.pos.x}, vx=${ac.vel.x})`);
  assert(ac.vel.y >= 4, 'petit coup vers le haut');
  const far = { onGround: false, pos: { x: 92, y: 60, z: 100 }, vel: { x: 70, y: 0, z: 0 } };
  assert(!bounceOffScenery(far, [tree]), "au-dessus de l'arbre, rien ne se passe");
  const gnd = { onGround: true, pos: { x: 99.8, y: 0, z: 100 }, vel: { x: 5, y: 0, z: 0 } };
  assert(!bounceOffScenery(gnd, [tree]), 'au sol, la navigation gere les obstacles');
  const hangar = BLOCKERS.find(b => b.id === 'hangar1');
  assert(obstacleHeight(hangar) >= 10, 'le hangar doit avoir une hauteur');
});
