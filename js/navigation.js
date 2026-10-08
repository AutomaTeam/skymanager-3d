/* ============================================================
   navigation.js — Graphe de navigation et collision du monde

   Le monde est decoupe en zones rectangulaires convexes reliees
   par des portails. C'est volontairement plus simple qu'un navmesh
   ou qu'un raycast par frame : le cout est constant et negligeable,
   ce qui est la contrainte dominante sur iPad.

   - Une zone est praticable si le point est dans son rectangle.
   - Un portail est un petit rectangle qui chevauche deux zones et
     autorise le passage de l'une a l'autre.
   - Un obstacle (blocker) est un rectangle NON praticable, soustrait
     des zones qui le declarent (`blockers: true`). Les batiments sont
     ainsi creuses dans le tarmac sans avoir a decouper la zone.

   Les zones `frame: 'aircraft'` suivent l'appareil : leur rectangle
   est exprime en coordonnees locales de l'avion et transforme par sa
   pose reelle (voir setFrame), exactement comme les hotspots.
   ============================================================ */

import * as THREE from 'three';
import { LAYOUT } from './layout.js?v=1791470179';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* Pas d'echantillonnage des tests de praticabilite de segment (m). */
const SEGMENT_STEP = 0.8;   // < epaisseur des murs les plus fins (1 m), sinon un segment les enjambe

/* ---------------------------------------------------------- */
/* Zones praticables                                           */
/* ---------------------------------------------------------- */

export const ZONES = [
  {
    id: 'tarmac',
    label: 'Aire aeroportuaire',
    frame: 'world',
    priority: 0,          // priorite basse : les interieurs priment
    blockers: true,       // les batiments y sont creuses
    rect: { x0: -140, x1: 660, z0: -1550, z1: 1650 }
  },
  {
    /* Terminal (phase 22) : un seul volume, tout le batiment. Ses
       comptoirs, sanitaires, sieges... sont des obstacles `zone: 'termHall'`. */
    id: 'termHall',
    label: 'Terminal',
    frame: 'world',
    priority: 1,
    blockers: true,
    rect: { x0: LAYOUT.terminal.x0 + 1, x1: LAYOUT.terminal.x1 - 1, z0: LAYOUT.terminal.z0 + 1, z1: LAYOUT.terminal.z1 - 1 }
  },
  {
    /* Alle centrale de la cabine. Largeur 1.8 m pour une cabine de
       3.4 m : le fuselage fait 3.9 m de diametre exterieur, il reste
       donc de la place pour les rangees de sieges de part et d'autre. */
    id: 'cabinAisle',
    label: 'Allee cabine',
    frame: 'aircraft',
    priority: 1,
    rect: { x0: -0.9, x1: 0.9, z0: -12.1, z1: 0.9 }
  },
  {
    /* Corps de la passerelle mobile : c'est le seul chemin entre le
       hall et la porte cabine. Volontairement sans `blockers` : la
       coque de l'appareil est un obstacle du tarmac qui recouvre la
       passerelle, et elle doit pouvoir etre traversee ici. Le sol y
       est incline (voir renderer3d.groundHeight). */
    id: 'jetBridge',
    label: 'Passerelle mobile',
    frame: 'world',
    priority: 1,
    rect: { x0: 357.5, x1: 362.5, z0: 1168, z1: 1198 }
  }
];

/* ---------------------------------------------------------- */
/* Obstacles : rectangles non pratables                        */
/*                                                             */
/* Un obstacle peut etre solidaire d'un repere mobile           */
/* (`frame: 'aircraft'`), auquel cas il est transforme par la   */
/* pose de l'appareil comme les zones.                          */
/*                                                             */
/* La coque de l'appareil joueur n'est deliberement pas encore   */
/* listee : elle recouvre l'allee cabine, qui est une zone      */
/* prioritaire reliant la porte a l'interieur. Elle sera traitee */
/* en Phase 1, quand la cabine sera reellement parentee a        */
/* l'avion et pourra etre exclue du test d'obstacle.            */
/* ---------------------------------------------------------- */

export const BLOCKERS = [
  /* Mobilier du hall : obstacles de la seule zone `termHall`. Les autres
     (sans `zone`) appartiennent au tarmac. */
  ...LAYOUT.termFurniture.map(f => ({
    id: f.id, label: f.id, zone: 'termHall', rect: { x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1 }
  })),
  { id: 'terminalBuilding', label: 'Batiment terminal', rect: { x0: 230, x1: 490, z0: 1195, z1: 1265 } },
  /* La tour (phase 18) est un cylindre de rayon 10 au pied, centre
     (262, 1128), a 100 m de la porte d'embarquement (avant : derriere le
     terminal, a 250 m de marche). Le bureau d'exploitation est colle contre
     elle, sa porte cote aire de stationnement (x 283) : c'est la que se
     trouve le point d'interaction (voir HOTSPOTS dans main.js). */
  { id: 'towerBase', label: 'Tour de controle', rect: { x0: 252, x1: 272, z0: 1118, z1: 1138 } },
  { id: 'opsOffice', label: 'Bureau exploitation', rect: { x0: 273, x1: 283, z0: 1128, z1: 1136 } },
  /* Les hangars sont des demi-cylindres de rayon 30 et de 90 m de long,
     tournes a 90 deg : 60 m sur X (510..570) et 90 m sur Z. */
  { id: 'hangar1', label: 'Hangar 1', rect: { x0: 510, x1: 570, z0: 855, z1: 945 } },
  { id: 'hangar2', label: 'Hangar 2', rect: { x0: 510, x1: 570, z0: 965, z1: 1055 } },
  { id: 'hangar3', label: 'Hangar 3', rect: { x0: 510, x1: 570, z0: 1075, z1: 1165 } },
  { id: 'staticAircraft', label: 'Appareil gare', rect: { x0: 424, x1: 476, z0: 984, z1: 1036 } },
  /* Coque de l'appareil joueur : solidaire du repere avion, elle suit
     donc l'appareil partout ou il se gare. Elle recouvre l'allee
     cabine et la passerelle, mais ces deux zones ne consultent pas les
     obstacles : l'embarquement reste possible. */
  { id: 'playerAircraft', label: 'Appareil du joueur', frame: 'aircraft', rect: { x0: -17.2, x1: 17.2, z0: -17.8, z1: 17.8 } }
];
/* Les vehicules d'escale (camion carburant, GPU, chariots) ne sont
   volontairement pas des obstacles : ils font moins de 2 m de large et
   bloqueraient la navigation sans rien apporter a la lecture du lieu. */

/* ---------------------------------------------------------- */
/* Portails : passages entre deux zones                        */
/* ---------------------------------------------------------- */

export const PORTALS = [
  /* Portes vitrees du terminal (LAYOUT.terminal) : trois cote piste, trois
     cote ville. Chaque portail recouvre la facade et deborde de part et
     d'autre pour que l'adjacence tarmac / hall soit franche. */
  ...LAYOUT.terminal.airDoors.map((d, i) => ({
    id: d.x === LAYOUT.terminal.doorX ? 'termDoor' : (d.x < LAYOUT.terminal.doorX ? 'termDoorW' : 'termDoorE'),
    a: 'tarmac', b: 'termHall', frame: 'world',
    rect: { x0: d.x - d.w / 2, x1: d.x + d.w / 2, z0: LAYOUT.terminal.z0 - 4, z1: LAYOUT.terminal.z0 + 6 }
  })),
  ...LAYOUT.terminal.landDoors.map((d, i) => ({
    id: `landDoor${i}`,
    a: 'tarmac', b: 'termHall', frame: 'world',
    rect: { x0: d.x - d.w / 2, x1: d.x + d.w / 2, z0: LAYOUT.terminal.z1 - 6, z1: LAYOUT.terminal.z1 + 5 }
  })),
  {
    /* Porte cabine avant gauche : le portail deborde de la paroi vers
       l'exterieur pour que le joueur puisse entrer depuis la passerelle. */
    id: 'cabinDoor',
    a: 'tarmac', b: 'cabinAisle',
    frame: 'aircraft',
    rect: { x0: -2.4, x1: 0.9, z0: -6.8, z1: -5.2 }
  },
  {
    /* Embouchure de la passerelle sur le hall : la zone `jetBridge`
       chevauche `termHall` sur 1 m (z 1197..1198) ; le portail couvre
       ce recouvrement et le prolonge d'un metre de chaque cote. Il ne
       rend praticable aucune surface nouvelle, il declare seulement
       l'adjacence, sans quoi A* ignore que les deux zones communiquent
       et les PNJ venus du hall ne trouvent pas l'avion. */
    id: 'bridgeMouth',
    a: 'termHall', b: 'jetBridge',
    frame: 'world',
    rect: { x0: 357.5, x1: 362.5, z0: 1194, z1: 1201 }
  },
  {
    /* Tete de passerelle / porte cabine : meme emprise que `cabinDoor`
       mais declaree entre la passerelle et l'allee, pour que le trajet
       hall -> cabine soit un chemin continu de trois zones. */
    id: 'bridgeDoor',
    a: 'jetBridge', b: 'cabinAisle',
    frame: 'aircraft',
    rect: { x0: -2.4, x1: 0.9, z0: -6.8, z1: -5.2 }
  }
];

/* ---------------------------------------------------------- */

export class Navigation {
  /* `radius` dilate les obstacles du demi-corps du marcheur : on
     s'arrete avant le mur au lieu de s'y enfoncer. */
  constructor(zones = ZONES, portals = PORTALS, blockers = BLOCKERS, radius = 0.35) {
    this.zones = zones;
    this.portals = portals;
    this.blockers = blockers;
    this.radius = radius;
    this.frames = {};          // name -> { pos, quat, quatInv }
    this._adj = null;          // cache d'adjacence des zones
    /* Objets de travail reutilises : les conversions de repere sont
       appelees plusieurs fois par frame, on ne veut aucune allocation
       dans la boucle de jeu (contrainte iPad). */
    this._v = new THREE.Vector3();
    this._out = { x: 0, z: 0 };
  }

  /* ---------------------------------------------------------- */
  /* Reperes mobiles                                             */
  /* ---------------------------------------------------------- */

  /* Enregistre la pose d'un repere mobile (typiquement l'appareil).
     A appeler chaque frame avant resolve()/isWalkable(). Les vecteurs
     internes sont reutilises : aucun garbage par frame. */
  setFrame(name, pos, quat) {
    let f = this.frames[name];
    if (!f) {
      f = this.frames[name] = {
        pos: new THREE.Vector3(),
        quat: new THREE.Quaternion(),
        quatInv: new THREE.Quaternion()
      };
    }
    f.pos.copy(pos);
    f.quat.copy(quat);
    f.quatInv.copy(quat).invert();
  }

  /* ---------------------------------------------------------- */
  /* Conversions de repere                                       */
  /* ---------------------------------------------------------- */

  /* Renvoie un objet reutilise : ne pas conserver la reference. */
  toLocal(frame, x, z) {
    const out = this._out;
    if (frame === 'world') { out.x = x; out.z = z; return out; }
    const f = this.frames[frame];
    if (!f) { out.x = x; out.z = z; return out; }
    const v = this._v.set(x, 0, z).sub(f.pos).applyQuaternion(f.quatInv);
    out.x = v.x; out.z = v.z;
    return out;
  }

  /* Renvoie un objet reutilise : ne pas conserver la reference. */
  toWorld(frame, x, z) {
    const out = this._out;
    if (frame === 'world') { out.x = x; out.z = z; return out; }
    const f = this.frames[frame];
    if (!f) { out.x = x; out.z = z; return out; }
    const v = this._v.set(x, 0, z).applyQuaternion(f.quat).add(f.pos);
    out.x = v.x; out.z = v.z;
    return out;
  }

  /* ---------------------------------------------------------- */
  /* Primitives                                                  */
  /* ---------------------------------------------------------- */

  _inRect(p, r) {
    return p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
  }

  /* Zone la plus specifique contenant le point (les interieurs priment
     sur le tarmac, qui les englobe geometriquement). */
  zoneAt(x, z) {
    let best = null;
    for (const zone of this.zones) {
      if (!this._inRect(this.toLocal(zone.frame, x, z), zone.rect)) continue;
      if (!best || zone.priority > best.priority) best = zone;
    }
    return best;
  }

  zoneById(id) {
    return this.zones.find(z => z.id === id) || null;
  }

  /* Un obstacle peut etre solidaire d'un repere mobile ; on projette
     donc le point dans le repere de l'obstacle avant de tester.
     L'emprise testee est dilatee du rayon du marcheur : on s'arrete
     avant le mur, pas dedans. Quand deux batiments voisins se
     rejoignent apres dilatation, ils forment une paroi continue,
     ce qui est le comportement attendu. */
  _blocked(x, z, zoneId = 'tarmac') {
    if (!this._grid || this._gridN !== this.blockers.length) this._buildGrid();
    /* Obstacles solidaires d'un repere mobile (avion) : toujours testes. */
    for (const b of this._dyn) if (this._hit(b, x, z, zoneId)) return true;
    /* Obstacles du monde : seulement ceux de la case (grille de 32 m). */
    const cell = this._grid.get(this._key(Math.floor(x / 32), Math.floor(z / 32)));
    if (cell) for (const b of cell) if (this._hit(b, x, z, zoneId)) return true;
    return false;
  }

  _key(cx, cz) { return (cx + 2000) * 8192 + (cz + 2000); }

  /* Grille spatiale des obstacles fixes (les decors en ajoutent des centaines :
     un balayage lineaire par test de marche ne tiendrait plus). Reconstruite
     si la liste change. */
  _buildGrid() {
    this._gridN = this.blockers.length;
    this._grid = new Map();
    this._dyn = [];
    const m = this.radius;
    for (const b of this.blockers) {
      if (b.frame && b.frame !== 'world') { this._dyn.push(b); continue; }
      const r = b.rect;
      const cx0 = Math.floor((r.x0 - m) / 32), cx1 = Math.floor((r.x1 + m) / 32);
      const cz0 = Math.floor((r.z0 - m) / 32), cz1 = Math.floor((r.z1 + m) / 32);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const k = this._key(cx, cz);
          let arr = this._grid.get(k);
          if (!arr) this._grid.set(k, arr = []);
          arr.push(b);
        }
      }
    }
  }

  _hit(b, x, z, zoneId) {
    if (b.disabled) return false;          // ex. l'avion de ligne est parti de son poste
    if ((b.zone || 'tarmac') !== zoneId) return false;
    const r0 = this.radius, r = b.rect;
    const x0 = r.x0 - r0, x1 = r.x1 + r0;
    const z0 = r.z0 - r0, z1 = r.z1 + r0;
    if (!b.frame || b.frame === 'world') return x >= x0 && x <= x1 && z >= z0 && z <= z1;
    const p = this.toLocal(b.frame, x, z);
    return p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1;
  }

  /* Un point est praticable s'il est dans un portail, ou dans une zone
     qui ne le declare pas bloque. */
  isWalkable(x, z) {
    for (const p of this.portals) {
      if (this._inRect(this.toLocal(p.frame, x, z), p.rect)) return true;
    }
    const zone = this.zoneAt(x, z);
    if (!zone) return false;
    if (zone.blockers && this._blocked(x, z, zone.id)) return false;
    return true;
  }

  /* ---------------------------------------------------------- */
  /* Collision                                                   */
  /* ---------------------------------------------------------- */

  /* Deplace de `from` vers `to` en respectant les zones et les
     obstacles. Si la destination est invalide, on tente le glissement
     le long de chaque axe (comportement attendu contre un mur), sinon
     on reste sur place. */
  resolve(from, to) {
    if (this.isWalkable(to.x, to.z)) return { x: to.x, z: to.z };
    if (this.isWalkable(to.x, from.z)) return { x: to.x, z: from.z };
    if (this.isWalkable(from.x, to.z)) return { x: from.x, z: to.z };
    return { x: from.x, z: from.z };
  }

  /* ---------------------------------------------------------- */
  /* Pathfinding : A* sur le graphe de zones                     */
  /* ---------------------------------------------------------- */

  _adjacency() {
    if (this._adj) return this._adj;
    const adj = {};
    this.zones.forEach(z => { adj[z.id] = []; });
    this.portals.forEach(p => {
      if (adj[p.a] && adj[p.b]) {
        adj[p.a].push(p.b);
        adj[p.b].push(p.a);
      }
    });
    this._adj = adj;
    return adj;
  }

  /* Centre d'une zone, ramene en coordonnees monde. Objet neuf :
     les appelants (A*, waypoints) en conservent la reference. */
  zoneCenter(zone) {
    const r = zone.rect;
    const w = this.toWorld(zone.frame, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
    return { x: w.x, z: w.z };
  }

  _portalBetween(a, b) {
    return this.portals.find(p =>
      (p.a === a && p.b === b) || (p.a === b && p.b === a)) || null;
  }

  _portalCenter(portal) {
    const r = portal.rect;
    const w = this.toWorld(portal.frame, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
    return { x: w.x, z: w.z };
  }

  /* Chemin de zones entre deux zones (incluses). null si injoignables. */
  findPath(fromId, toId) {
    if (fromId === toId) return [fromId];
    const adj = this._adjacency();
    if (!adj[fromId] || !adj[toId]) return null;

    const target = this.zoneById(toId);
    const h = (id) => {
      const z = this.zoneById(id);
      if (!z || !target) return 0;
      const a = this.zoneCenter(z), b = this.zoneCenter(target);
      return Math.hypot(a.x - b.x, a.z - b.z);
    };

    const open = new Set([fromId]);
    const cameFrom = {};
    const g = { [fromId]: 0 };
    const f = { [fromId]: h(fromId) };

    while (open.size) {
      let current = null, bestF = Infinity;
      for (const id of open) {
        const v = f[id] ?? Infinity;
        if (v < bestF) { bestF = v; current = id; }
      }
      if (current === toId) {
        const path = [current];
        while (cameFrom[current]) { current = cameFrom[current]; path.unshift(current); }
        return path;
      }

      open.delete(current);
      for (const next of adj[current]) {
        const tentative = g[current] + 1;
        if (tentative < (g[next] ?? Infinity)) {
          cameFrom[next] = current;
          g[next] = tentative;
          f[next] = tentative + h(next);
          open.add(next);
        }
      }
    }
    return null;
  }

  /* Le segment est-il entierement praticable ? On echantillonne : les
       zones sont convexes, mais les bloqueurs y creusent des trous, et
       une corde peut donc couper un batiment. */
    _segmentWalkable(x0, z0, x1, z1) {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / SEGMENT_STEP));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        if (!this.isWalkable(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
      }
      return true;
    }

    _polylineWalkable(from, pts) {
      let px = from.x, pz = from.z;
      for (const p of pts) {
        if (!this._segmentWalkable(px, pz, p.x, p.z)) return false;
        px = p.x; pz = p.z;
      }
      return true;
    }

    /* Contournement d'obstacle : graphe de visibilite construit sur les
       coins des bloqueurs proches, dilates du rayon du marcheur, plus
       les deux extremites. A* sur les aretes dont le segment est
       praticable. Rend null si aucun detour n'existe.

       Les bloqueurs solidaires d'un repere mobile sont ignores : leurs
       coins ne sont pas des points fixes, et l'appareil est de toute
       facon traite a part par les agents (test de coque). */
    _detour(from, to) {
      const r = this.radius + 0.1;
      const pad = 24;
      const bx0 = Math.min(from.x, to.x) - pad, bx1 = Math.max(from.x, to.x) + pad;
      const bz0 = Math.min(from.z, to.z) - pad, bz1 = Math.max(from.z, to.z) + pad;

      const nodes = [{ x: from.x, z: from.z }, { x: to.x, z: to.z }];
      const lx = to.x - from.x, lz = to.z - from.z, ll = Math.max(lx * lx + lz * lz, 1e-6);
      for (const b of this.blockers) {
        if (b.disabled) continue;
        if (b.frame && b.frame !== 'world') continue;
        const q = b.rect;
        if (q.x1 + r < bx0 || q.x0 - r > bx1 || q.z1 + r < bz0 || q.z0 - r > bz1) continue;
        /* Couloir : seuls les obstacles proches de la droite from -> to comptent. */
        const cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2;
        const t = Math.max(0, Math.min(1, ((cx - from.x) * lx + (cz - from.z) * lz) / ll));
        if (Math.hypot(cx - (from.x + lx * t), cz - (from.z + lz * t)) > pad + Math.hypot(q.x1 - q.x0, q.z1 - q.z0) / 2) continue;
        const corners = [
          [q.x0 - r, q.z0 - r], [q.x1 + r, q.z0 - r],
          [q.x1 + r, q.z1 + r], [q.x0 - r, q.z1 + r]
        ];
        for (const [x, z] of corners) {
          if (this.isWalkable(x, z)) nodes.push({ x, z });
        }
      }
      /* Coins des portails proches : un portail perce un bloqueur (la
         porte du terminal est a z = 1197, a l'interieur meme de
         l'emprise dilatee du batiment qui s'arrete a z = 1195). Son
         centre n'est donc "visible" depuis aucun coin de batiment — il
         faut d'abord longer le mur jusqu'a l'aplomb de l'ouverture, puis
         tourner pour la franchir. Sans ces coins, `_detour` echoue des
         qu'une cible se trouve juste derriere une porte etroite. */
      for (const p of this.portals) {
        if (p.frame && p.frame !== 'world') continue;
        const q = p.rect;
        if (q.x1 < bx0 || q.x0 > bx1 || q.z1 < bz0 || q.z0 > bz1) continue;
        const corners = [
          [q.x0, q.z0], [q.x1, q.z0], [q.x1, q.z1], [q.x0, q.z1]
        ];
        for (const [x, z] of corners) {
          if (this.isWalkable(x, z)) nodes.push({ x, z });
        }
      }
      if (nodes.length <= 2) return null;

      /* A* avec aretes evaluees a la demande : sur un long trajet le graphe compte
         des centaines de coins, et tester toutes les paires (O(n2) segments) coutait
         plusieurs centaines de ms. Ici on ne teste que depuis les noeuds ouverts. */
      const n = nodes.length;
      const goal = nodes[1];
      const h = (i) => Math.hypot(nodes[i].x - goal.x, nodes[i].z - goal.z);
      const dist = new Array(n).fill(Infinity);
      const prev = new Array(n).fill(-1);
      const done = new Array(n).fill(false);
      dist[0] = 0;
      for (;;) {
        let u = -1, best = Infinity;
        for (let i = 0; i < n; i++) {
          if (!done[i] && dist[i] < Infinity && dist[i] + h(i) < best) { best = dist[i] + h(i); u = i; }
        }
        if (u < 0) break;
        if (u === 1) break;
        done[u] = true;
        for (let j = 0; j < n; j++) {
          if (done[j]) continue;
          const d = Math.hypot(nodes[u].x - nodes[j].x, nodes[u].z - nodes[j].z);
          if (dist[u] + d >= dist[j]) continue;
          if (!this._segmentWalkable(nodes[u].x, nodes[u].z, nodes[j].x, nodes[j].z)) continue;
          dist[j] = dist[u] + d; prev[j] = u;
        }
      }
      if (!isFinite(dist[1])) return null;

      const pts = [];
      for (let i = 1; i !== -1; i = prev[i]) pts.push({ x: nodes[i].x, z: nodes[i].z });
      pts.reverse();
      return pts.length ? pts : null;
    }

    /* Suite de points a suivre pour aller de `from` a `to`. Les zones
       etant convexes, traverser le centre de chaque portail suffit —
       a condition qu'aucun bloqueur ne coupe la ligne brisee, ce qui
       arrive des qu'un batiment jouxte un portail. On valide donc le
       trace et, s'il est coupe, on cherche un contournement. */
    waypoints(from, to) {
      const zf = this.zoneAt(from.x, from.z);
      const zt = this.zoneAt(to.x, to.z);
      if (!zf || !zt) return [{ x: to.x, z: to.z }];

      if (zf.id === zt.id) {
        if (this._segmentWalkable(from.x, from.z, to.x, to.z)) return [{ x: to.x, z: to.z }];
        return this._detour(from, to) || [{ x: to.x, z: to.z }];
      }

      const path = this.findPath(zf.id, zt.id);
      if (!path) return [{ x: to.x, z: to.z }];

      const pts = [];
      for (let i = 0; i < path.length - 1; i++) {
        const portal = this._portalBetween(path[i], path[i + 1]);
        if (portal) pts.push(this._portalCenter(portal));
      }
      pts.push({ x: to.x, z: to.z });
      if (this._polylineWalkable(from, pts)) return pts;

      /* Un detour global de `from` a `to` ignorerait les portails : son
         graphe de visibilite ne connait que les coins des bloqueurs, pas
         les passages obliges, et une cible a l'interieur d'un batiment
         (au-dela d'un portail etroit comme la porte du terminal) n'est
         jamais "visible" depuis l'exterieur. Sans ca, `_detour` echoue
         systematiquement des que l'angle d'approche coupe le batiment
         avant le portail, et la fonction retombait alors sur `pts` —
         un trace connu pour traverser un mur — au lieu d'un vrai
         contournement. On detoure donc troncon par troncon, en
         respectant l'ordre impose par les portails. */
      const out = [];
      let px = from.x, pz = from.z;
      for (const p of pts) {
        if (this._segmentWalkable(px, pz, p.x, p.z)) {
          out.push(p);
        } else {
          const d = this._detour({ x: px, z: pz }, p);
          if (!d) return [{ x: to.x, z: to.z }];
          for (let i = 1; i < d.length; i++) out.push(d[i]);
        }
        px = p.x; pz = p.z;
      }
      return out;
    }

  /* ---------------------------------------------------------- */
  /* Bornes de securite                                          */
  /* ---------------------------------------------------------- */

  /* Rectangle englobant du monde, pour les usages qui ont encore
     besoin d'un clamp grossier (spawn, camera). */
  worldBounds() {
    const t = this.zoneById('tarmac');
    return t ? t.rect : { x0: -140, x1: 660, z0: -1550, z1: 1650 };
  }

  clampToWorld(x, z) {
    const b = this.worldBounds();
    return { x: clamp(x, b.x0, b.x1), z: clamp(z, b.z0, b.z1) };
  }

  /* Ramene un point sur le premier emplacement praticable trouve, en
     spirale de rayon croissant. Sert aux points d'apparition (sortie
     de cabine, de vol, de terminal) : sans cela, un spawn tombant dans
     un mur condamne le joueur a rester bloque.

     Le rayon croit par pas constant, ce qui garantit qu'aucune
     couronne n'est oubliee, et l'espacement angulaire reste voisin du
     pas : le cout croit lineairement avec le rayon. Cette fonction ne
     tourne jamais dans la boucle de jeu — elle n'est appelee qu'a une
     transition. Un balayage du monde sert de dernier recours, de
     sorte qu'un point praticable est toujours rendu tant qu'il en
     existe un. */
  nearestWalkable(x, z, maxRadius = 120, step = 2) {
    if (this.isWalkable(x, z)) return { x, z };
    /* Un spawn hors carte n'a aucune chance d'etre praticable : on le
       recadre d'abord, sinon la spirale chercherait dans le vide. */
    const c = this.clampToWorld(x, z);
    x = c.x; z = c.z;
    if (this.isWalkable(x, z)) return { x, z };

    for (let r = step; r <= maxRadius; r += step) {
      const n = Math.max(8, Math.round((2 * Math.PI * r) / step));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (!this._inBounds(px, pz)) continue;
        if (this.isWalkable(px, pz)) return { x: px, z: pz };
      }
    }
    return this._scanWorld() || { x, z };
  }

  _inBounds(x, z) {
    const b = this.worldBounds();
    return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
  }

  /* Balayage de secours : premier point praticable rencontre en
     partant du coin nord-ouest du monde. Deterministe, donc le
     resultat est reproductible d'une execution a l'autre. */
  _scanWorld() {
    const b = this.worldBounds();
    for (let z = b.z0; z <= b.z1; z += 6) {
      for (let x = b.x0; x <= b.x1; x += 6) {
        if (this.isWalkable(x, z)) return { x, z };
      }
    }
    return null;
  }

  /* ---------------------------------------------------------- */
  /* Debogage                                                    */
  /* ---------------------------------------------------------- */

  debug() {
    return {
      zones: this.zones.map(z => ({ id: z.id, frame: z.frame, rect: z.rect })),
      portals: this.portals.map(p => ({ id: p.id, a: p.a, b: p.b })),
      blockers: this.blockers.length,
      frames: Object.keys(this.frames)
    };
  }
}
