/* ============================================================
   agents.js — PNJ autonomes (Phase 2)
   ============================================================

   Ce module peuple le monde d'agents qui se deplacent tout seuls :
   passagers dans le hall, hotesses dans l'allee cabine, pilote aux
   commandes, mecaniciens et agents d'escale sur le tarmac.

   Principe : un agent n'est qu'un etat de navigation. Il ne connait
   ni la scene ni la camera ; il demande au graphe (Navigation) ou il
   a le droit d'aller, et le rendu affiche le resultat. Toute la
   logique de zone/portail/obstacle reste donc dans navigation.js.

   Trois garde-fous mobiles, tous issus du plan :

   1. PLAFOND D'AGENTS (MAX_ACTIVE). Chaque personnage est un groupe
      de trois maillages ; au-dela d'une vingtaine, c'est le nombre
      d'appels de dessin qui coute, pas la geometrie.
   2. MISE A JOUR A 5 Hz AU LOIN. Un agent hors du rayon d'interet
      n'est recalcule qu'une fois par SLOW_INTERVAL et avance alors
      du temps accumule : le resultat est identique, le cout divise.
   3. AUCUNE ALLOCATION PAR FRAME. Les objets de travail sont
      pre-alloues et reutilises ; le pathfinding (waypoints), qui
      alloue, n'est appele qu'a un changement d'intention.

   Les agents circulent dans le repere de leur zone (`frame`) : un
   mecanicien vit dans le monde, une hotesse dans le repere de
   l'appareil. Leur position est donc stockee en coordonnees locales
   et reprojetee a chaque frame — si l'avion roule, l'equipage suit
   sans code supplementaire.
   ============================================================ */

/* Plafond d'agents simultanement affiches (contrainte iPad). */
export const MAX_ACTIVE = 24;

/* Au-dela de cette distance du point d'interet, un agent passe a
   5 Hz : il accumule dt et avance d'un coup. */
import { slideMove } from './bodies.js?v=1791576638';

const SLOW_DIST = 95;
const SLOW_DIST2 = SLOW_DIST * SLOW_DIST;
const SLOW_INTERVAL = 0.2;

/* Distance a laquelle un point de passage est considere atteint. */
const ARRIVE = 0.6;

/* Duree d'inactivite entre deux deplacements. */
const REST_MIN = 1.2;
const REST_MAX = 4.0;

/* Vitesses de marche (m/s). */
const SPEED = { passenger: 1.5, attendant: 1.3, mechanic: 1.7, ramp: 1.8, pilot: 0 };

/* Virage maximal d'un agent en routine autonome (pathfinding, faceControlled),
   en radians par seconde : reorientation rapide vers un cap cible fixe. */
const TURN_RATE = 14.0;

/* Vitesse de rotation quand le joueur controle directement un PNJ
   (moveControlled), en radians par seconde : meme modele "commun" que
   le joueur lui-meme (voir PLAYER_TURN_SPEED dans main.js) -- on tourne
   en continu tant que la touche est maintenue plutot que de viser un
   angle absolu fixe, sinon tenir "droite" finissait par ne plus rien
   faire une fois cet angle atteint. */
const CONTROL_TURN_SPEED = 2.8;

/* ------------------------------------------------------------
   Besoins (phase 5) — ce qui fait qu'un PNJ bouge de lui-meme
   ------------------------------------------------------------

   Sans besoins, un agent ne se deplace que par tirage au sort : il
   a l'air occupe sans jamais rien vouloir. Deux besoins suffisent a
   rendre l'autonomie lisible — l'energie (fatigue) et la faim — et
   chacun se lit dans la destination choisie : un mecanicien qui
   part vers le local de pause est fatigue, un passager qui vise le
   fond du hall a faim.

   Les valeurs vont de 0 (besoin criant) a 100 (satisfait).
   `decay` est exprime par minute de jeu, `recover` par seconde
   passee sur place, `duration` en secondes. La recuperation est
   calibree pour qu'une visite complete ramene le besoin de son
   seuil a 100. */

const NEED_KEYS = ['energy', 'hunger'];

const NEED = {
  energy: { decay: 3.5, threshold: 38, recover: 2.6, duration: 24 },
  hunger: { decay: 5.0, threshold: 42, recover: 3.2, duration: 18 }
};

/* Au-dessus de ce seuil, le besoin est comble : l'agent quitte
   l'installation sans attendre la fin de sa pause. */
const NEED_SATISFIED = 92;

/* ------------------------------------------------------------
   Gammes d'uniformes et points de rassemblement
   ------------------------------------------------------------ */

const CLOTH = [0x64748b, 0x9333ea, 0x0d9488, 0xb45309, 0xdb2777, 0x2563eb];

const ROLE_STYLE = {
  passenger: { uniform: null,     hat: 0x2b1c12, gate: 'terminal', jitter: 0.5 },
  attendant: { uniform: 0x0ea5e9, hat: 0xffffff, gate: 'cabin',    jitter: 0.3 },
  pilot:     { uniform: 0x1e293b, hat: 0x0f172a, gate: 'cabin',    jitter: 0 },
  mechanic:  { uniform: 0xd97706, hat: 0xf5f5f5, gate: 'world',    jitter: 0.8 },
  ramp:      { uniform: 0xf59e0b, hat: 0xfacc15, gate: 'world',    jitter: 1.2 }
};

/* Terminal (phase 22) : points ou les passagers se rassemblent. Tous sont
   en terrain libre (hors LAYOUT.termFurniture) : files des comptoirs, salons
   d'embarquement, promenade centrale et portes. */
const HALL = { doorX: 360, doorZ: 1200, midZ: 1226 };
const QUEUE_SPOTS = [
  [326, 1257], [338, 1257], [350, 1257],      // fin des files d'enregistrement
  [396, 1250],                                // fin de la file de surete
  [372, 1198.5]                               // file de la porte d'embarquement
];
const SEAT_SPOTS = [
  [266, 1208.4], [322, 1208.4], [404, 1208.4], [462, 1208.4],
  [258, 1208.4], [330, 1208.4], [412, 1208.4], [470, 1208.4]
];
const PROMENADE = [[330, 1228], [360, 1230], [392, 1228], [420, 1214], [300, 1214]];

/* Points de veille des mecaniciens, exprimes dans le repere de
   l'appareil. La coque du joueur est un obstacle de x ±17.2 et
   z ±17.8 : ces postes sont deliberement poses a l'exterieur, sous
   les saumons d'aile et devant le nez, la ou travaille l'equipe. */
const MECHANIC_POSTS = [
  { x: -19.5, z: 3.2 },
  { x: 19.5, z: 3.2 },
  { x: -19.5, z: -11.5 },
  { x: 8, z: -19.5 },
  { x: -8, z: -19.5 },
  { x: 0, z: -19.6 },
  { x: 19.5, z: 12.5 }
];

/* Allees du hall, sous les comptoirs. */
const AISLE_Z = [-10.8, -8.5, -6.0, -3.5, -1.0, 0.3];

/* Poste du pilote, cale sur le point d'interaction « cockpit »
   (main.js) : les commandes ne sont pas une zone navigable, le
   pilote y est donc pose et non marcheur. */
const PILOT_POST = { x: -1.0, z: -13.2 };

/* Aire de service au sud de l'appareil, pour les agents d'escale. */
const RAMP_POSTS = [
  { x: 344, z: 1138 },
  { x: 388, z: 1138 },
  { x: 396, z: 1150 },
  { x: 336, z: 1150 },
  { x: 360, z: 1130 }
];

/* ------------------------------------------------------------
   Installations (phase 5) — ou l'on satisfait un besoin
   ------------------------------------------------------------

   Chaque installation est un point du monde ou un agent peut
   combler un besoin. Elles sont volontairement peu nombreuses et
   toutes situees dans des zones deja praticables : le hall pour le
   personnel du terminal, l'allee cabine pour l'equipage, le
   tarmac pour les equipes de piste.

   `frame` suit la meme regle que les postes : un equipage vit dans
   le repere de l'appareil et suit donc l'avion s'il roule. */

const FACILITIES = {
  /* Coin repos du hall : les salons d'embarquement, devant les sieges. */
  rest: [
    { frame: 'world', x: 322, z: 1208.6 },
    { frame: 'world', x: 404, z: 1208.6 },
    { frame: 'world', x: 462, z: 1208.6 }
  ],
  /* Coin repas : devant le cafe et la boutique. */
  food: [
    { frame: 'world', x: 304.2, z: 1224 },
    { frame: 'world', x: 304.2, z: 1221 },
    { frame: 'world', x: 447.6, z: 1226 }
  ],
  /* Local de pause de l'equipage : arriere de l'allee cabine. */
  crewRest: [
    { frame: 'aircraft', x: 0, z: 0.4 },
    { frame: 'aircraft', x: 0, z: -0.6 }
  ],
  /* Point d'eau de l'equipage : milieu de l'allee. */
  crewFood: [
    { frame: 'aircraft', x: 0, z: -6.0 },
    { frame: 'aircraft', x: 0, z: -8.5 }
  ],
  /* Baraquement de piste : au sud de l'aire de service. */
  rampRest: [
    { frame: 'world', x: 336, z: 1150 },
    { frame: 'world', x: 396, z: 1150 }
  ],
  /* Roulotte de chantier, pres des mecaniciens. */
  rampFood: [
    { frame: 'world', x: 344, z: 1138 },
    { frame: 'world', x: 388, z: 1138 }
  ]
};

/* Quelle installation pour quel besoin, par famille de role. */
const NEED_PLACE = {
  energy: { terminal: 'rest', cabin: 'crewRest', world: 'rampRest' },
  hunger: { terminal: 'food', cabin: 'crewFood', world: 'rampFood' }
};

/* Famille d'installations d'un role. Le pilote reste a son poste :
   il n'a pas de pause, c'est le joueur qui prend sa place. */
const ROLE_FAMILY = {
  passenger: 'terminal',
  attendant: 'cabin',
  mechanic: 'world',
  ramp: 'world'
};

/* Nombre d'agents par role. Total volontairement sous MAX_ACTIVE.
   `frame` est le repere de STOCKAGE de la position, pas la porte de
   visibilite (celle-ci est `gate`, dans ROLE_STYLE). Les mecaniciens
   vivent donc dans le repere de l'appareil, comme leurs postes, meme
   s'ils restent visibles en toutes circonstances. */
const PLAN = [
  /* Phase 26 : les passagers du hall sont ceux du circuit (terminalSystem.crowd), plus des figurants. */
  { role: 'passenger', count: 0,  frame: 'world' },
  { role: 'mechanic',  count: 4,  frame: 'aircraft' },
  { role: 'ramp',      count: 2,  frame: 'world' },
  { role: 'attendant', count: 2,  frame: 'aircraft' },
  { role: 'pilot',     count: 1,  frame: 'aircraft' }
];

/* ------------------------------------------------------------
   Outils
   ------------------------------------------------------------ */

/* Rotation la plus courte de `from` vers `to`, bornee a `max`. */
function turnTowards(from, to, max) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  if (d > max) d = max;
  else if (d < -max) d = -max;
  return from + d;
}

/* Coque du fuselage, en coordonnees locales de l'appareil. Le bloqueur
   `playerAircraft` du graphe couvre la boite englobante (ailes
   comprises) et la zone `jetBridge`, prioritaire et sans bloqueur, le
   recouvre : isWalkable() y repond donc `true`. On teste donc la coque
   elle-meme, sinon un PNJ traverse le fuselage. */
const HULL = { x0: -2.1, x1: 2.1, z0: -18, z1: 18 };
/* La porte, percée dans la coque : elle doit rester franchissable,
   sinon le test ci-dessus mure la passerelle. */
const HULL_DOOR = { x0: -2.4, x1: 0.6, z0: -7.2, z1: -4.8 };

/* ------------------------------------------------------------
   AgentSystem
   ------------------------------------------------------------ */

export class AgentSystem {
  /* `r3d` fournit la fabrique d'avatars (buildTechnician) et la
     hauteur de sol (groundHeight), `nav` le graphe de navigation.
     Aucune construction de maillage ici : elle est differee au
     premier update, une fois le repere appareil publie au graphe. */
  constructor(nav, r3d) {
    this.nav = nav;
    this.r3d = r3d;
    this.agents = [];
    this.count = 0;
    /* Objets de travail reutilises : la boucle ne doit rien allouer. */
    this._from = { x: 0, z: 0 };
    this._to = { x: 0, z: 0 };
    this._built = false;
    /* Tant que le monde n'est pas demarre, aucun PNJ n'est construit
       ni simule : la pose du repere `aircraft` n'est pas encore
       publiee, les postes seraient projetes a partir de l'identite. */
    this.active = false;
        /* Agent actuellement conduit par le joueur (phase 3), ou null.
           Sa routine est suspendue tant qu'il est tenu. */
        this.controlled = null;
      }

  /* Autorise la construction et la simulation. A appeler une fois la
     pose de l'appareil publiee au graphe (apres placeAircraftAtGate). */
  begin() {
    this.active = true;
  }

  /* ----------------------------------------------------------
     Construction differee
     ---------------------------------------------------------- */

  _build() {
    if (this._built) return;
    this._built = true;
    const r3d = this.r3d;
    if (!r3d || typeof r3d.buildTechnician !== 'function') return;

    const anchors = this._anchorTable();
    this._anchors = anchors;
    let n = 0;

    for (const group of PLAN) {
      const style = ROLE_STYLE[group.role];
      for (let i = 0; i < group.count; i++) {
        if (this.agents.length >= MAX_ACTIVE) break;
        const uniform = style.uniform === null
          ? CLOTH[n % CLOTH.length]
          : style.uniform;
        /* withTorch = false : chaque SpotLight supplementaire est
           integree au shader de toutes les surfaces eclairees. Les
           PNJ n'ont pas besoin d'eclairage, le joueur si. */
        const mesh = r3d.buildTechnician(uniform, style.hat, false);
        r3d.scene.add(mesh.group);
        mesh.group.visible = false;

        const start = anchors[group.role][i % anchors[group.role].length];
        const a = {
          id: group.role + n,
          role: group.role,
          frame: group.frame,
          gate: style.gate,
          static: group.role === 'pilot',
          /* Position en coordonnees du repere de l'agent. */
          l: start.x,
          m: start.z,
          /* Cache monde, rafraichi a chaque frame. */
          wx: 0, wz: 0, wy: 0,
          heading: 0,
          /* K06 : chacun son allure (presse, normal, flaneur) : vitesse et cadence de marche */
          gait: 0.78 + Math.random() * 0.5,
          speed: (SPEED[group.role] || 1.4) * 1,
          moving: false,
          phase: Math.random() * 6.283,
          state: group.role === 'pilot' ? 'working' : 'resting',
          timer: Math.random() * REST_MAX,
          path: null,
          pi: 0,
          stuck: 0,
          slow: 0,
          jx: 0, jz: 0,
          jitter: style.jitter,
                    /* Masque par le jeu quand le role possede deja son propre
                       avatar (pilote aux commandes, hotesse en cabine). */
                    hidden: false,
                    /* Besoins (phase 5). Le pilote n'en a pas : il ne
                       quitte jamais son poste. */
                    needs: group.role === 'pilot' ? null : {
                      energy: 55 + Math.random() * 45,
                      hunger: 55 + Math.random() * 45
                    },
                    /* Besoin en cours de satisfaction, ou null. */
                    need: null,
                    mesh
                  };
        if (a.jitter > 0) {
          a.jx = (Math.random() - 0.5) * 2 * a.jitter;
          a.jz = (Math.random() - 0.5) * 2 * a.jitter;
        }
        this.agents.push(a);
        n++;
      }
    }

    this.count = this.agents.length;
    this._refresh();
  }

  /* Points de rassemblement par role. Les postes exprimes dans le
     repere de l'appareil y restent : ils seront reprojetes a chaque
     changement d'intention, donc valides meme apres un roulage. */
  _anchorTable() {
    const passengers = [];
    for (const [x, z] of QUEUE_SPOTS) passengers.push({ frame: 'world', x, z });
    for (const [x, z] of SEAT_SPOTS) passengers.push({ frame: 'world', x, z });
    for (const [x, z] of PROMENADE) passengers.push({ frame: 'world', x, z });
    passengers.push({ frame: 'world', x: HALL.doorX, z: HALL.doorZ });
    passengers.push({ frame: 'world', x: HALL.doorX, z: HALL.midZ });

    const attendants = AISLE_Z.map(z => ({ frame: 'aircraft', x: 0, z }));

    const mechanics = MECHANIC_POSTS.map(p => ({ frame: 'aircraft', x: p.x, z: p.z }));

    const ramp = RAMP_POSTS.map(p => ({ frame: 'world', x: p.x, z: p.z }));

    return {
      passenger: passengers,
      attendant: attendants,
      mechanic: mechanics,
      ramp: ramp,
      pilot: [{ frame: 'aircraft', x: PILOT_POST.x, z: PILOT_POST.z }]
    };
  }

  /* ----------------------------------------------------------
     Projection monde / repere de l'agent
     ---------------------------------------------------------- */

  /* Position monde d'un agent, copiee immediatement : toWorld rend
     un objet partage par tout le graphe. */
  _project(a) {
    if (a.frame === 'world') {
      a.wx = a.l;
      a.wz = a.m;
    } else {
      const w = this.nav.toWorld(a.frame, a.l, a.m);
      a.wx = w.x;
      a.wz = w.z;
    }
    a.wy = this._groundY(a);
  }

  /* Hauteur du sol sous un agent. Deux cas seulement :
     - les occupants de la cabine (hotesse, pilote) marchent sur le
       plancher cabine, pose a y = -0.62 dans le repere de l'appareil ;
     - tout le reste foule le sol du monde, rampe de la passerelle
       comprise (renderer3d.groundHeight).
     Le role prime sur le repere : un mecanicien travaille dans le
     repere appareil mais debout sur le tarmac. */
  _groundY(a) {
    if (a.gate === 'cabin') {
      const f = this.nav.frames[a.frame];
      const base = f && f.pos ? f.pos.y : 0;
      return base - 0.62;
    }
    const r3d = this.r3d;
        if (!r3d || typeof r3d.groundHeight !== 'function') return 0;
        /* La rampe de la passerelle est un plan incline : un agent qui la
           remonte doit suivre la pente, sinon il s'enfonce dans le tablier
           a mesure qu'il approche de la porte cabine. */
        return r3d.groundHeight(a.wx, a.wz);
      }

  /* Un point est-il hors de la coque de l'appareil ? `isWalkable` ne
     suffit pas ici : la zone `jetBridge`, prioritaire, recouvre le
     flanc gauche et masque le bloqueur `playerAircraft`. Les occupants
     de la cabine (hotesse, pilote) en sont evidemment exemptes : leur
     allee est a l'interieur du fuselage. */
  _clearOfHull(a, x, z) {
    if (a && a.gate === 'cabin') return true;
    const nav = this.nav;
    if (!nav.frames || !nav.frames.aircraft) return true;
    const p = nav.toLocal('aircraft', x, z);
    const lx = p.x, lz = p.z;
    if (lx < HULL.x0 || lx > HULL.x1 || lz < HULL.z0 || lz > HULL.z1) return true;
    return lx >= HULL_DOOR.x0 && lx <= HULL_DOOR.x1 && lz >= HULL_DOOR.z0 && lz <= HULL_DOOR.z1;
  }

  /* Point praticable ET hors coque, cherche en spirale. nearestWalkable
     ne suffit pas : il ignore le fuselage (cf. _clearOfHull). */
  _safeSpot(a, x, z, maxRadius = 30, step = 2) {
    const nav = this.nav;
    const c = nav.clampToWorld(x, z);
    x = c.x; z = c.z;
    if (nav.isWalkable(x, z) && this._clearOfHull(a, x, z)) return { x, z };
    for (let r = step; r <= maxRadius; r += step) {
      const n = Math.max(8, Math.round((2 * Math.PI * r) / step));
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const px = x + Math.cos(ang) * r;
        const pz = z + Math.sin(ang) * r;
        if (nav.isWalkable(px, pz) && this._clearOfHull(a, px, pz)) return { x: px, z: pz };
      }
    }
    return null;
  }

  /* Le fuselage coupe-t-il le segment ? On echantillonne : un agent qui
     viserait un poste de l'autre bord pousserait sinon dans la coque,
     `isWalkable` ignorant le bloqueur sous la zone `jetBridge`. */
  _segmentClear(a, x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (!this._clearOfHull(a, x0 + dx * t, z0 + dz * t)) return false;
    }
    return true;
  }

  _pathClear(a, path) {
    let px = a.wx, pz = a.wz;
    for (let i = 0; i < path.length; i++) {
      if (!this._segmentClear(a, px, pz, path[i].x, path[i].z)) return false;
      px = path[i].x;
      pz = path[i].z;
    }
    return true;
  }

  /* ----------------------------------------------------------
     Boucle
     ---------------------------------------------------------- */

  /* `refX`/`refZ` : point d'interet (le joueur) pour le niveau de
     detail. Sans lui, tous les agents restent a pleine frequence. */
  update(dt, refX = 0, refZ = 0) {
    this._refX = refX; this._refZ = refZ;
    if (!this.active) return;
    this._build();
    if (!this.agents.length) return;
    this._bodies = this.bodyProvider ? this.bodyProvider() : null;

    const termVisible = !!(this.r3d && this.r3d.terminalGroup && this.r3d.terminalGroup.visible);
    const cabinVisible = !!(this.r3d && this.r3d.cabinGroup && this.r3d.cabinGroup.visible);

    for (const a of this.agents) {
      /* Un interieur masque n'est pas simule : ses occupants
             n'existent visuellement pas. Un agent tenu par le joueur est
             deplace par le controleur du role, pas par sa routine. */
          const visible = !a.hidden && (a.gate === 'terminal' ? termVisible
            : a.gate === 'cabin' ? cabinVisible : true);
          a.mesh.group.visible = visible;

          this._project(a);

          let step = dt;
          if (!a.static && visible && a !== this.controlled) {
            const dx = a.wx - refX, dz = a.wz - refZ;
            if (dx * dx + dz * dz > SLOW_DIST2) {
              a.slow += dt;
              if (a.slow < SLOW_INTERVAL) { this._draw(a, dt); continue; }
              step = a.slow;
              a.slow = 0;
            } else {
              a.slow = 0;
            }
            this._step(a, step);
          } else if (!a.static && a !== this.controlled) {
            /* Interieur masque : l'agent n'est pas affiche, mais sa
               routine doit continuer a tourner — sinon il resterait
               fige et ne serait pas la ou on l'attend en rouvrant. */
            this._step(a, dt);
          }
          this._draw(a, dt);
    }
  }

  /* Rafraichit les positions monde sans simuler (placement initial). */
  _refresh() {
    for (const a of this.agents) {
      this._project(a);
      this._draw(a, 0);
    }
  }

  /* ----------------------------------------------------------
       Prise de controle (phase 3)
     ---------------------------------------------------------- */

    /* Agent le plus proche d'un point monde, dans un rayon donne.
       `roles` restreint la recherche (ex. ['mechanic']). Un agent non
       affiche (interieur masque) n'est jamais propose : on ne prend pas
       le controle d'un personnage invisible a travers un mur. */
    nearest(x, z, radius = 4, roles = null) {
      let best = null, bestD = radius;
      for (const a of this.agents) {
        if (a.hidden || !a.mesh.group.visible) continue;
        if (roles && roles.indexOf(a.role) < 0) continue;
        const d = Math.hypot(a.wx - x, a.wz - z);
        if (d < bestD) { bestD = d; best = a; }
      }
      return best;
    }

    /* Suspend la routine de l'agent et rend la main au joueur. */
    takeControl(a) {
      if (!a) return null;
      a.path = null;
      a.pi = 0;
      a.moving = false;
      a.stuck = 0;
      a.slow = 0;
      a.state = 'controlled';
      this.controlled = a;
      return a;
    }

    /* Rend l'agent a sa routine, depuis sa position courante : il
           repart de la ou le joueur l'a laisse, sans teleportation.
           `reached = false` : le joueur a interrompu le trajet, l'agent ne
           doit donc pas etre credite d'une arrivee a destination — sinon il
           satisfaisait son besoin sur place, sans jamais atteindre le lieu. */
        releaseControl() {
          const a = this.controlled;
          this.controlled = null;
          if (a) this._arrive(a, false);
          return a;
        }

        /* Deplace l'agent tenu, en respectant le graphe de navigation.
           `cmd` = { move, turn } dans [-1, 1] (voir WalkJoystick.read()) :
           turn fait pivoter en continu, move avance/recule selon le cap
           courant. `speed` en m/s. */
        moveControlled(cmd, speed, dt, bodies = []) {
          const a = this.controlled;
          if (!a) return;
          const { move, turn } = cmd;
          a.moving = Math.abs(move) > 0.05;
          if (Math.abs(turn) > 0.02) a.heading += turn * CONTROL_TURN_SPEED * dt;
          if (!a.moving) return;

          /* Filet de securite : si l'agent se trouve dans la coque (pose
             forcee, appareil qui a roule sur lui), aucun deplacement n'est
             accepte et il resterait bloque pour toujours. On le degage
             d'abord vers le point praticable le plus proche. */
          if (!this._clearOfHull(a, a.wx, a.wz)) {
            const out = this._safeSpot(a, a.wx, a.wz, 40, 2);
            if (out) {
              a.wx = out.x;
              a.wz = out.z;
              this._store(a);
            }
          }

          const mx = Math.sin(a.heading), mz = Math.cos(a.heading);
          const to = { x: a.wx + mx * speed * move * dt, z: a.wz + mz * speed * move * dt };
          /* Murs, coque (la zone passerelle la recouvre : testee ici aussi), personnes et
             vehicules : petits pas avec glissement (js/bodies.js). */
          const next = slideMove(this.nav, { x: a.wx, z: a.wz }, to, bodies, (x, z) => this._clearOfHull(a, x, z));
          a.wx = next.x;
          a.wz = next.z;
          this._store(a);
          a.wy = this._groundY(a);
          this._draw(a, dt);
        }

    /* Oriente l'agent tenu sans le deplacer (visite d'un poste). */
    faceControlled(heading, dt) {
      const a = this.controlled;
      if (!a) return;
      a.heading = turnTowards(a.heading, heading, TURN_RATE * dt);
      this._draw(a, dt);
    }

    /* Masque un agent dont le role possede deja son propre avatar. */
    setHidden(a, hidden) {
      if (!a) return;
      a.hidden = !!hidden;
      a.mesh.group.visible = !hidden;
    }

    /* ----------------------------------------------------------
       Deplacement
       ---------------------------------------------------------- */

      /* Reecrit la position locale d'un agent depuis sa position monde.
         Le repere de stockage est celui de la zone : un agent du monde
         garde ses coordonnees telles quelles, un agent du repere appareil
         est ramene en local — il suivra donc l'avion s'il roule. */
      _store(a) {
        if (a.frame === 'world') {
          a.l = a.wx;
          a.m = a.wz;
        } else {
          const loc = this.nav.toLocal(a.frame, a.wx, a.wz);
          a.l = loc.x;
          a.m = loc.z;
        }
      }

      _step(a, dt) {
    const nav = this.nav;

    /* Le temps passe pour tout le monde, meme a l'arret. */
    this._decayNeeds(a, dt);

    if (a.state === 'resting') {
      a.timer -= dt;
      a.moving = false;
      this._recover(a, dt);
      if (a.timer <= 0) this._plan(a);
      return;
    }

    /* Arrive en bout de chemin (ou chemin vide) : on souffle. */
    let wp = a.path ? a.path[a.pi] : null;
    if (!wp) { this._arrive(a); return; }

    let dx = wp.x - a.wx, dz = wp.z - a.wz;
    let d = Math.hypot(dx, dz);
    if (d < ARRIVE) {
      a.pi++;
      if (a.pi >= a.path.length) { this._arrive(a); return; }
      wp = a.path[a.pi];
      dx = wp.x - a.wx;
      dz = wp.z - a.wz;
      d = Math.hypot(dx, dz) || 1;
    }

    const step = Math.min(d, a.speed * (a.gait || 1) * dt);
    this._from.x = a.wx;
    this._from.z = a.wz;
    this._to.x = a.wx + (dx / d) * step;
    this._to.z = a.wz + (dz / d) * step;
    /* Murs et obstacles (graphe), coque, et AUTRES PERSONNES (joueur, passagers, employes,
       vehicules) : un PNJ ne traverse plus personne. Sans fournisseur de corps (tests) : graphe seul. */
    const bodies = this._bodies;
    const r = bodies
      ? slideMove(nav, this._from, this._to, bodies, (x, z) => this._clearOfHull(a, x, z), a)
      : nav.resolve(this._from, this._to);

    /* La coque se teste apres le glissement : `resolve` ne connait que
       les bloqueurs du graphe, pas le fuselage. */
    const clear = this._clearOfHull(a, r.x, r.z);
    const moved = clear ? Math.hypot(r.x - a.wx, r.z - a.wz) : 0;
    a.moving = moved > 1e-4;
    if (a.moving) {
      a.stuck = 0;
      a.wx = r.x;
            a.wz = r.z;
            this._store(a);
            a.heading = turnTowards(a.heading, Math.atan2(dx, dz), TURN_RATE * dt);
      a.phase += dt * 9;
    } else {
      /* Bloque par un obstacle ou un bord de zone : au bout d'un
         moment on renonce, sinon l'agent pousse dans le vide. */
      a.stuck += dt;
      if (a.stuck > 1.5) { a.stuck = 0; this._arrive(a, false); }
    }
        /* Le sol se relit a chaque pas : la rampe de la passerelle monte. */
        a.wy = this._groundY(a);
      }

  /* ----------------------------------------------------------
     Besoins (phase 5)
     ---------------------------------------------------------- */

  /* Les besoins s'epuisent avec le temps de jeu, y compris pendant
     une pause : un agent qui attend sur place se fatigue aussi. */
  _decayNeeds(a, dt) {
    const n = a.needs;
    if (!n) return;
    for (const k of NEED_KEYS) {
      n[k] = Math.max(0, n[k] - NEED[k].decay * dt / 60);
    }
  }

  /* Le besoin le plus criant sous son seuil, ou null si l'agent est
     a l'aise. L'ordre de NEED_KEYS sert d'arbitrage a egalite. */
  _urgentNeed(a) {
    const n = a.needs;
    if (!n) return null;
    let best = null, bestScore = 0;
    for (const k of NEED_KEYS) {
      const def = NEED[k];
      if (n[k] >= def.threshold) continue;
      /* Plus le besoin est bas, plus il est urgent : on compare
         l'ecart relatif au seuil, pas la valeur brute. */
      const score = (def.threshold - n[k]) / def.threshold;
      if (score > bestScore) { bestScore = score; best = k; }
    }
    return best;
  }

  /* Installation ou satisfaire un besoin, dans le repere de l'agent.
     Rend null si le role n'a pas d'installation (pilote) ou si le
     besoin est inconnu. */
  _facility(a, need) {
    const family = ROLE_FAMILY[a.role];
    if (!family) return null;
    const place = NEED_PLACE[need];
    if (!place) return null;
    const list = FACILITIES[place[family]];
    if (!list || !list.length) return null;
    /* On tire au sort : deux agents fatigues ne se disputent pas la
       meme banquette. */
    return list[(Math.random() * list.length) | 0];
  }

  /* Sur place : le besoin remonte. On quitte des qu'il est comble,
     sans attendre la fin de la pause — sinon un agent resterait
     assis a ne rien faire alors qu'il n'a plus besoin de rien. */
  _recover(a, dt) {
    const need = a.need;
    if (!need) return;
    const def = NEED[need];
    a.needs[need] = Math.min(100, a.needs[need] + def.recover * dt);
    if (a.needs[need] >= NEED_SATISFIED) {
      a.need = null;
      a.timer = Math.min(a.timer, 0.4);
    }
  }

  /* Nouvelle intention : on tire un poste, on verifie qu'il est
     praticable, et on demande l'itineraire au graphe. C'est le seul
     endroit qui alloue (waypoints rend des objets neufs) : il n'est
     atteint qu'a la fin d'une pause. */
  _plan(a) {
    const nav = this.nav;
    const pool = this._anchors || (this._anchors = this._anchorTable());
    const list = pool[a.role];
        if (!list || !list.length) { this._arrive(a, false); return; }

    /* resolve() ne fait que glisser le long des obstacles : un agent
       dont la position courante tombe DANS un bloqueur (l'appareil a
       bouge sous ses pieds) ne pourrait jamais en sortir. On le
       ramene d'abord sur du sol praticable. */
    if (!nav.isWalkable(a.wx, a.wz) || !this._clearOfHull(a, a.wx, a.wz)) {
      const back = this._safeSpot(a, a.wx, a.wz, 30, 2) || nav.nearestWalkable(a.wx, a.wz, 30, 2);
      if (a.frame === 'world') {
        a.l = back.x;
        a.m = back.z;
      } else {
        const loc = nav.toLocal(a.frame, back.x, back.z);
        a.l = loc.x;
        a.m = loc.z;
      }
      this._project(a);
      this._from.x = a.wx;
      this._from.z = a.wz;
    }

    /* Un besoin criant prime sur la routine : c'est ce qui rend
       l'autonomie lisible. On tente d'abord l'installation, et on
       retombe sur un poste ordinaire si elle est injoignable. */
    const urgent = this._urgentNeed(a);
    if (urgent) {
      const fac = this._facility(a, urgent);
      if (fac && this._goTo(a, fac, urgent)) return;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const an = list[(Math.random() * list.length) | 0];
      /* Le poste doit vivre dans le meme repere que l'agent : la
         position est ecrite en retour via `a.frame` (_step), un
         desaccord entre les deux corromprait la position. */
      if (an.frame !== a.frame) continue;
      if (this._goTo(a, an, null)) return;
    }
    /* Aucun poste joignable : on patiente, la prochaine tentative
       aura peut-etre plus de chance (l'appareil aura bouge). */
    a.need = null;
    a.state = 'resting';
    a.timer = REST_MIN;
  }

  /* Tente d'aller vers un point, exprime dans n'importe quel repere :
     la cible est ramenee en coordonnees monde, seul espace ou le
     graphe calcule. Rend true si l'itineraire est accepte. `need`
     non nul marque le deplacement comme une visite d'installation :
     l'agent s'y attardera. */
  _goTo(a, target, need) {
    const nav = this.nav;
    const w = nav.toWorld(target.frame, target.x, target.z);
    let tx = w.x + a.jx;
    let tz = w.z + a.jz;
    if (!nav.isWalkable(tx, tz) || !this._clearOfHull(a, tx, tz)) {
      const f = this._safeSpot(a, tx, tz, 24, 2);
      if (!f) return false;
      tx = f.x;
      tz = f.z;
    }
    this._from.x = a.wx;
    this._from.z = a.wz;
    const path = nav.waypoints(this._from, { x: tx, z: tz });
    /* Les deux bouts peuvent etre hors coque alors que la corde la
       traverse : on rejette l'itineraire et on tire un autre poste,
       sinon l'agent pousserait dans le fuselage jusqu'a l'abandon. */
    if (!path || !path.length || !this._pathClear(a, path)) return false;
    a.path = path;
    a.pi = 0;
    a.stuck = 0;
    a.state = 'walking';
    a.need = need;
    return true;
  }

  _arrive(a, reached = true) {
    a.path = null;
    a.pi = 0;
    a.moving = false;
    a.state = 'resting';
    /* Arrive a une installation : on s'y attarde le temps de
       remonter le besoin. Sinon, pause ordinaire. Un agent bloque en
       route abandonne la visite : il ne doit pas croire qu'il est
       sur place, sinon son besoin remonterait a distance. */
    if (a.need && reached) {
      a.timer = NEED[a.need].duration;
    } else {
      if (a.need) a.need = null;
      a.timer = REST_MIN + Math.random() * (REST_MAX - REST_MIN);
    }
  }

  /* ----------------------------------------------------------
     Rendu
     ---------------------------------------------------------- */

  _draw(a, dt = 0) {
    const g = a.mesh.group;
    /* Leger rebond de marche, comme l'avatar du joueur. */
    const bob = a.moving ? Math.abs(Math.sin(a.phase)) * 0.05 : 0;
    g.position.set(a.wx, a.wy + bob, a.wz);
    /* K06 : a l'arret, il tourne doucement la tete (le corps) vers le joueur qui passe pres de lui. */
    let gz = 0;
    if (!a.moving && a !== this.controlled) {
      const dx = this._refX - a.wx, dz = this._refZ - a.wz;
      if (dx * dx + dz * dz < 36 && dx * dx + dz * dz > 0.5) {
        gz = (Math.atan2(dx, dz) - a.heading) % (Math.PI * 2);
        if (gz > Math.PI) gz -= Math.PI * 2; else if (gz < -Math.PI) gz += Math.PI * 2;
        gz = Math.max(-0.9, Math.min(0.9, gz));
      }
    }
    a.gaze = (a.gaze || 0) + (gz - (a.gaze || 0)) * Math.min(1, dt * 4);
    g.rotation.y = a.heading + a.gaze;
    a.mesh.gaitScale = a.gait || 1;
    if (this.r3d && this.r3d.updateAvatarAnim) this.r3d.updateAvatarAnim(a.mesh, a.moving, dt);
  }

  /* ----------------------------------------------------------
     Inspection
     ---------------------------------------------------------- */

  /* Nombre d'agents actuellement affiches (donc simules). */
  activeCount() {
    let n = 0;
    for (const a of this.agents) if (a.mesh.group.visible) n++;
    return n;
  }

  debug() {
    const byRole = {};
    for (const a of this.agents) {
      byRole[a.role] = (byRole[a.role] || 0) + 1;
    }
    return {
      total: this.count,
      cap: MAX_ACTIVE,
      visible: this.activeCount(),
          controlled: this.controlled ? this.controlled.id : null,
          byRole,
      agents: this.agents.map(a => ({
        id: a.id, role: a.role, state: a.state, frame: a.frame,
        x: +a.wx.toFixed(2), y: +a.wy.toFixed(2), z: +a.wz.toFixed(2),
        visible: a.mesh.group.visible,
        need: a.need,
        energy: a.needs ? +a.needs.energy.toFixed(1) : null,
        hunger: a.needs ? +a.needs.hunger.toFixed(1) : null
      }))
    };
  }

  /* Repartition des besoins, pour l'inspection et les tests. */
  needsSummary() {
    const out = { urgent: 0, visiting: 0, byNeed: {}, min: {} };
    for (const k of NEED_KEYS) out.min[k] = 100;
    for (const a of this.agents) {
      if (!a.needs) continue;
      if (a.need) out.visiting++;
      if (this._urgentNeed(a)) out.urgent++;
      for (const k of NEED_KEYS) {
        out.min[k] = Math.min(out.min[k], a.needs[k]);
        if (a.needs[k] < NEED[k].threshold) out.byNeed[k] = (out.byNeed[k] || 0) + 1;
      }
    }
    for (const k of NEED_KEYS) out.min[k] = +out.min[k].toFixed(1);
    return out;
  }

  /* ----------------------------------------------------------
     Garde-fous (inspection manuelle, console : __game.agents.checkInvariants())

     N'est appele nulle part dans la boucle de jeu — le cout d'un
     balayage complet chaque frame ne se justifie pas pour un filet de
     securite de diagnostic. Sert a detecter en un coup d'oeil les
     classes de bug deja rencontrees ici : un appel a mauvaise arite
     qui contamine une position de NaN (cf. le bug d'origine de
     `_clearOfHull` dans `_plan()`), un agent stocke dans un repere
     mais visible dans un gate incoherent, ou un cap qui sort de
     ]-2pi, 2pi[ faute de normalisation. Rend la liste des anomalies ;
     un tableau vide signifie que tout est sain. */
  checkInvariants() {
    const problems = [];
    for (const a of this.agents) {
      const tag = `${a.id} (${a.role})`;
      if (!Number.isFinite(a.wx) || !Number.isFinite(a.wy) || !Number.isFinite(a.wz)) {
        problems.push(`${tag} : position non finie (wx=${a.wx}, wy=${a.wy}, wz=${a.wz})`);
      }
      if (!Number.isFinite(a.l) || !Number.isFinite(a.m)) {
        problems.push(`${tag} : coordonnées locales non finies (l=${a.l}, m=${a.m})`);
      }
      if (!Number.isFinite(a.heading)) {
        problems.push(`${tag} : cap non fini (heading=${a.heading})`);
      } else if (Math.abs(a.heading) > Math.PI * 2 + 1e-6) {
        problems.push(`${tag} : cap hors de l'intervalle normalise (heading=${a.heading.toFixed(3)})`);
      }
      /* Un agent en cabine doit vivre dans le repere de l'appareil : un
         desaccord signifie que sa position se projetterait dans le
         mauvais repere (cf. _project / _store). */
      if (a.gate === 'cabin' && a.frame !== 'aircraft') {
        problems.push(`${tag} : gate 'cabin' mais frame '${a.frame}' (attendu 'aircraft')`);
      }
      /* Un agent affiche et non tenu par le joueur doit se trouver sur
         du sol praticable — sinon _plan()/_step() le laisseraient
         pousser indefiniment contre un bloqueur. */
      if (a.mesh.group.visible && a !== this.controlled
          && this.nav.frames && this.nav.frames.aircraft
          && !this.nav.isWalkable(a.wx, a.wz)) {
        problems.push(`${tag} : position affichée hors du graphe praticable (${a.wx.toFixed(1)}, ${a.wz.toFixed(1)})`);
      }
    }
    if (this.agents.length > MAX_ACTIVE) {
      problems.push(`Plafond dépassé : ${this.agents.length} agents construits pour MAX_ACTIVE=${MAX_ACTIVE}`);
    }
    return problems;
  }
}
