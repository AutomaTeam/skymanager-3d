/* ============================================================
   terminalSystem.js — Interieur du terminal : le circuit passager

   Phase 25 : parcours logique et verifications.
   Phase 26 : de vrais passagers, suivis d'un poste a l'autre.

     entree cote ville
       -> ENREGISTREMENT  (verifier le billet, peser le bagage, surcharge)
            |-> bagage -> TRI DES BAGAGES -> soute de l'avion
       -> SURETE          (regarder le plateau, confisquer l'interdit)
       -> commerces       (boutique, cafe, distributeur : ils ont un STOCK)
       -> PORTE           (scanner la carte d'embarquement)
       -> avion

   Chaque file est une liste de vrais passagers (un dossier chacun, voir
   terminalFlow.js) : ils MARCHENT d'un poste a l'autre (`transit`), on
   peut les suivre a l'ecran, et une erreur a un poste a une consequence
   plus loin (avec une seconde chance a la porte).

   Un poste que personne ne tient continue de traiter ses files, mais
   sans regarder : les erreurs passent et l'ambiance du hall en souffre.

   `pos` et `facing` sont les coordonnees monde du mobilier :
   renderer3d.js les place telles quelles. Ce module ne connait ni le
   DOM ni Three.js (teste dans tools/terminal.test.mjs).
   ============================================================ */

import {
  makePassenger, evaluate, DEFAULT_CHOICE, overweightFee, bestChoice, hasDanger
} from './terminalFlow.js?v=1791614163';

const STORE = 'skymanager.terminal';
const STORE_VERSION = 2;

/* Le terminal occupe tout le batiment (x 231..489, z 1196..1264). Flux du
   passager : entree cote ville (sud) -> enregistrement -> controle de
   surete -> boutiques -> salon et porte d'embarquement (cote piste, nord).
   Les obstacles correspondants sont dans LAYOUT.termFurniture. */
export const COUNTERS = [
  { id: 'security', label: 'Contrôle de sûreté',    kind: 'security', pos: [396, 1240],   facing: Math.PI },
  { id: 'checkin1', label: 'Enregistrement 1',      kind: 'checkin',  pos: [326, 1248],   facing: Math.PI },
  { id: 'checkin2', label: 'Enregistrement 2',      kind: 'checkin',  pos: [338, 1248],   facing: Math.PI },
  { id: 'checkin3', label: 'Enregistrement 3',      kind: 'checkin',  pos: [350, 1248],   facing: Math.PI },
  { id: 'gate',     label: "Porte d'embarquement", kind: 'gate',     pos: [372, 1208],   facing: 0 },
  { id: 'shop',     label: 'Boutique duty-free',    kind: 'shop',     pos: [452, 1226],   facing: Math.PI / 2 },
  { id: 'cafe',     label: 'Café / restauration',   kind: 'cafe',     pos: [300, 1224],   facing: -Math.PI / 2 },
  /* Phase 25 : tri des bagages (a cote du carrousel), distributeur, reserve. */
  { id: 'baggage',  label: 'Tri des bagages',       kind: 'baggage',  pos: [272.5, 1238], facing: -Math.PI / 2 },
  { id: 'vending',  label: 'Distributeur',          kind: 'vending',  pos: [432, 1206],   facing: 0 },
  { id: 'storage',  label: 'Réserve',               kind: 'storage',  pos: [455, 1257],   facing: 0 }
];
const CT = Object.fromEntries(COUNTERS.map(c => [c.id, c]));

/* Comportement de chaque type de poste. `rate` = secondes par passager
   traite quand PERSONNE ne s'en occupe ; `income` = recette par passager
   (0 pour les postes de controle) ; `board` = le passager monte a bord. */
const KIND = {
  checkin:  { rate: 4.2,  income: 0,  board: false, verb: 'VÉRIFIER LE BILLET', stage: true },
  security: { rate: 3.2,  income: 0,  board: false, verb: 'VÉRIFIER LE PLATEAU', stage: true },
  gate:     { rate: 2.4,  income: 46, board: true,  verb: 'SCANNER LA CARTE', stage: true },
  shop:     { rate: 0,    income: 14, board: false, verb: 'ENCAISSER' },
  cafe:     { rate: 0,    income: 9,  board: false, verb: 'SERVIR' },
  vending:  { rate: 0,    income: 6,  board: false, verb: 'VENDRE' },
  baggage:  { rate: 22,   income: 0,  board: false, verb: 'CHARGER LES BAGAGES' },
  storage:  { rate: 0,    income: 0,  board: false, verb: 'PRENDRE UNE CAISSE' }
};

/* Machines a stock : capacite, prix de vente moyen et vitesse d'ecoulement
   (unites par seconde quand le hall est plein de monde). */
export const STOCK_KINDS = ['shop', 'cafe', 'vending'];
export const MAX_STOCK = 12;
export const CRATE_QTY = 8;
const STORAGE_MAX = 6;
const STORAGE_REFILL = 26;               // secondes pour une caisse de plus
const SHOP_RATE = { shop: 5.5, cafe: 3.2, vending: 2.2 };     // EUR/s a ambiance moyenne
const SHOP_UPKEEP = { shop: 1.2, cafe: 0.7, vending: 0.3 };
const DRAIN = { shop: 1 / 15, cafe: 1 / 11, vending: 1 / 9 };  // unites/s de vente de fond
const WALK_SPEED = 2.2;                  // m/s : vitesse de marche des passagers

/* ---------------------------------------------------------- */
/* Geometrie du hall : places dans les files et trajets         */
/* ---------------------------------------------------------- */

/* Place n° i dans la file d'un poste (meme formule que le rendu du mobilier). */
export function slotPos(id, i) {
  const c = CT[id], f = c.facing || 0;
  const d = 2.2 + Math.min(i, 9) * 1.05;
  return [c.pos[0] - Math.sin(f) * d, c.pos[1] - Math.cos(f) * d];
}

const ENTRY = [360, 1264];               // porte cote ville
const AIR_DOOR = [360, 1194.5];          // porte cote piste, vers la passerelle
const LANE_MID = 1231.5;                 // allee centrale (entre les postes et les commerces)
const LANE_SOUTH = 1256.8;               // allee sud (sous les files d'enregistrement)
const LANE_ENTRY = 1259.8;               // allee d'entree, au nord des canapes et plantes du mur sud (z >= 1261.2)

const P = (x, z, dwell = 0) => [x, z, dwell];

/* Trajets (listes de points [x, z, arret en s]). Ils evitent les meubles :
   ils passent par les couloirs entre les postes, jamais a travers. */
const routes = {
  arrive(deskId, idx) {
    const d = CT[deskId], tail = slotPos(deskId, idx);
    return tail[1] > 1262 ? [P(...ENTRY), P(...tail)] : [P(...ENTRY), P(358, LANE_ENTRY), P(d.pos[0], LANE_ENTRY), P(...tail)];
  },
  /* Apres l'enregistrement : on contourne le guichet par l'est et on rejoint la surete. */
  checkinToSecurity(deskId, idx) {
    const from = slotPos(deskId, 0), x = CT[deskId].pos[0] + 4.8;
    return [P(...from), P(x, from[1]), P(x, LANE_SOUTH), P(396, LANE_SOUTH), P(...slotPos('security', idx))];
  },
  /* Apres la surete : (machine) puis la file de la porte. */
  securityToGate(machineId, idx) {
    const pts = [P(396, 1236.5), P(396, LANE_MID)];
    if (machineId === 'shop') pts.push(P(449.8, LANE_MID), P(449.8, 1226, 2.2), P(440, LANE_MID));
    else if (machineId === 'cafe') pts.push(P(302.2, LANE_MID), P(302.2, 1224, 2.5), P(312, LANE_MID));
    else if (machineId === 'vending') pts.push(P(436, LANE_MID), P(436, 1209), P(436, 1203.6, 2), P(436, 1209), P(436, LANE_MID));
    pts.push(P(378, LANE_MID), P(378, 1210), P(378, 1204.2), P(...slotPos('gate', idx)));
    return pts;
  },
  gateToBridge() {
    return [P(...slotPos('gate', 0)), P(366, 1203), P(360, 1199), P(...AIR_DOOR)];
  },
  /* Refuse au guichet : il sort par la porte cote ville. */
  checkinToExit(deskId) {
    const from = slotPos(deskId, 0), x = CT[deskId].pos[0] + 4.8;
    return [P(...from), P(x, from[1]), P(x, LANE_ENTRY), P(358, LANE_ENTRY), P(...ENTRY)];
  },
  /* Refuse a la porte : il traverse le hall et sort. */
  gateToExit() {
    return [P(...slotPos('gate', 0)), P(378, 1210), P(378, LANE_MID), P(360, 1242), P(...ENTRY)];
  },
  /* Detecteur de la porte : retour a la surete. */
  gateToSecurity(idx) {
    return [P(...slotPos('gate', 0)), P(378, 1210), P(378, LANE_MID), P(410, LANE_MID), P(410, LANE_SOUTH),
      P(396, LANE_SOUTH), P(...slotPos('security', idx))];
  }
};

/* Chronologie d'un trajet : temps de chaque troncon et de chaque arret. */
export function makeWalk(points, speed = WALK_SPEED) {
  const segs = [];
  let t = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dt = len / speed;
    segs.push({ t0: t, t1: t + dt, a, b, len });
    t += dt;
    if (b[2]) { segs.push({ t0: t, t1: t + b[2], a: b, b, len: 0, dwell: true }); t += b[2]; }
  }
  return { points, segs, dur: t };
}

function segHeading(s) { return Math.atan2(s.b[0] - s.a[0], s.b[1] - s.a[1]); }
function lastHeading(segs, from) {
  for (let i = from; i >= 0; i--) if (!segs[i].dwell && segs[i].len > 0) return segHeading(segs[i]);
  return 0;
}

/* Position et cap a l'instant `el` (s depuis le depart). */
export function walkAt(walk, el) {
  const segs = walk.segs;
  if (!segs.length) { const p = walk.points[0]; return { x: p[0], z: p[1], h: 0, moving: false, done: true }; }
  if (el >= walk.dur) {
    const s = segs[segs.length - 1];
    return { x: s.b[0], z: s.b[1], h: lastHeading(segs, segs.length - 1), moving: false, done: true };
  }
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (el <= s.t1) {
      if (s.dwell) return { x: s.a[0], z: s.a[1], h: lastHeading(segs, i - 1), moving: false, done: false };
      const k = s.t1 > s.t0 ? (el - s.t0) / (s.t1 - s.t0) : 1;
      return {
        x: s.a[0] + (s.b[0] - s.a[0]) * k, z: s.a[1] + (s.b[1] - s.a[1]) * k,
        h: segHeading(s), moving: true, done: false
      };
    }
  }
  const s = segs[segs.length - 1];
  return { x: s.b[0], z: s.b[1], h: 0, moving: false, done: true };
}

/* ---------------------------------------------------------- */
/* Files : `queue` reste un nombre (lecture/ecriture) pour tout le code existant */
/* ---------------------------------------------------------- */
let _plId = 100000;
function placeholder(c) {
  if (KIND[c.kind].stage) return makePassenger();
  if (c.kind === 'baggage') return { id: _plId++, ownerId: -1, kg: 12, orphan: false };
  return { id: _plId++ };
}
function defineQueue(c) {
  Object.defineProperty(c, 'queue', {
    enumerable: true, configurable: true,
    get() { return c.line.length; },
    set(n) {
      n = Math.max(0, Math.floor(n));
      while (c.line.length < n) c.line.push(placeholder(c));
      if (c.line.length > n) c.line.length = n;
    }
  });
  /* Dossier du passager de tete (les tests et l'ancien code l'assignent). */
  Object.defineProperty(c, 'head', {
    enumerable: false, configurable: true,
    get() { return c.line[0] || null; },
    set(p) { if (!p) c.line.shift(); else if (c.line.length) c.line[0] = p; else c.line.push(p); }
  });
}

export class TerminalSystem {
  constructor() {
    this.counters = {};
    COUNTERS.forEach(c => {
      const o = {
        ...c,
        /* Les postes du circuit demarrent ouverts, sauf deux guichets
           d'enregistrement : si le controle de surete etait ferme, les files
           s'y accumuleraient sans debouche (le parcours est lineaire). */
        open: ['checkin1', 'security', 'gate', 'shop', 'cafe', 'vending', 'baggage', 'storage'].includes(c.id),
        line: [],                   // les passagers (ou bagages) presents au poste, dans l'ordre
        stock: STOCK_KINDS.includes(c.kind) ? MAX_STOCK : null,
        crates: c.kind === 'storage' ? STORAGE_MAX : null,
        _acc: 0,
        served: 0,
        revenue: 0
      };
      defineQueue(o);
      o.queue = c.kind === 'checkin' ? 3 : (c.kind === 'baggage' ? 2 : 0);
      this.counters[c.id] = o;
    });
    this.transit = [];          // passagers en train de marcher entre deux postes
    this.clock = 0;             // horloge du hall (s), sert aux trajets
    this.inspectId = null;      // passager dont le dossier est ouvert (mis en evidence a l'ecran)
    this.mood = 72;             // 0-100 : ambiance generale du hall
    this.revenue = 0;           // recette cumulee du hall (EUR)
    this.boarded = 0;           // passagers montes a bord (cumul de la partie)
    /* Sous-compteur remis a zero a chaque vol enregistre (voir
       consumeBoardedSinceFlight) : c'est lui qui relie le hall a la
       recette billets du vol suivant. */
    this.boardedSinceFlight = 0;
    this.missed = 0;            // passagers perdus faute d'embarquement
    this.carry = 0;             // unites de stock portees par le joueur (une caisse = 8)
    this.stats = {
      checked: 0, errors: 0, fees: 0, seized: 0, refused: 0, restocks: 0, bags: 0,
      lostSales: 0, incidents: 0, recovered: 0, orphans: 0
    };
    this.bagsSinceFlight = 0;   // bagages charges dans l'avion depuis le dernier vol
    this._spawnTimer = 3;
    this._shopAcc = 0;
    this._crateAcc = 0;
    this.lastMessage = '';
    this.load();
  }

  /* ---------------------------------------------------------- */
  /* Simulation                                                  */
  /* ---------------------------------------------------------- */

  /* A appeler chaque image, meme quand le joueur est ailleurs. */
  update(dt) {
    this.clock += dt;
    const all = Object.values(this.counters);

    /* Les passagers en marche arrivent a destination. */
    this._deliver();

    /* Nouveaux passagers : ils entrent TOUS par la porte cote ville et vont a un
       guichet d'enregistrement (le moins charge parmi ceux qui sont ouverts). */
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawn();
      const open = all.filter(c => c.kind === 'checkin' && c.open);
      const pressure = open.length ? 1 : 0.5;
      /* Rythme regle pour qu'un joueur attentif suive et qu'un joueur absent voie
         l'ambiance baisser lentement (voir tools/terminal.test.mjs). */
      this._spawnTimer = (this.arcade ? 5.2 + Math.random() * 3.6 : 3.2 + Math.random() * 2.8) / pressure;
    }

    /* Traitement d'un poste que personne ne tient (lent, et SANS verification) */
    all.forEach(c => {
      const k = KIND[c.kind];
      if (!k || !k.rate || !c.open || c.line.length <= 0 || c.staffed) return;   // `staffed` : un employe s'en occupe (staff.js)
      c._acc = (c._acc || 0) + dt;
      const rate = k.rate * (this.arcade ? 1.6 : 1);   // Arcade : le joueur a plus a faire
      while (c._acc >= rate && c.line.length > 0) {
        c._acc -= rate;
        this._auto(c);
      }
    });

    /* La reserve recoit une caisse de temps en temps (livraison). */
    const st = this.counters.storage;
    if (st && st.crates < STORAGE_MAX) {
      this._crateAcc += dt;
      if (this._crateAcc >= STORAGE_REFILL) { this._crateAcc = 0; st.crates++; }
    }

    /* Commerces et distributeurs : la vente de fond vide le stock ; une machine
       vide ne vend plus (ventes perdues, clients decus). */
    this._shopAcc += dt;
    if (this._shopAcc >= 1) {
      const step = this._shopAcc;
      this._shopAcc = 0;
      for (const c of all) {
        if (!STOCK_KINDS.includes(c.kind)) continue;
        if (c.open) {
          if (c.stock >= 1) {
            const traffic = 0.6 + (this.mood / 100) * 0.8 + Math.min(0.6, c.line.length * 0.08);
            const gain = SHOP_RATE[c.kind] * traffic * step;
            c.revenue += gain;
            this.revenue += gain;
            c.stock = Math.max(0, c.stock - DRAIN[c.kind] * traffic * step * (this.arcade ? 0.5 : 1));
          } else if (Math.random() < 0.25) {
            this.stats.lostSales++;
            this.mood = Math.max(0, this.mood - 0.5);
          }
          /* Le passage cree une petite file de clients a servir a la main. */
          if (c.kind !== 'vending' && Math.random() < 0.35) c.queue = Math.min(8, c.line.length + 1);
        }
        this.revenue -= SHOP_UPKEEP[c.kind] * step;
      }
    }

    /* Ambiance : penalisee par les files longues et par la porte saturee,
       se redresse sinon. */
    const longQueues = all.filter(c => c.line.length > 12 && c.kind !== 'baggage' && c.kind !== 'storage' && c.kind !== 'vending').length;
    const gate = this.counters.gate;
    const gatePressure = gate.line.length > 20 ? 1 : 0;
    let delta = (longQueues > 0 ? -longQueues * 1.2 : 0.3) - gatePressure * 1.6;
    if (this.counters.baggage.line.length > 16) delta -= 0.15;   // des valises s'entassent au tri
    if (this.arcade && delta < 0) delta *= 0.5;     // Arcade : on se fache moins vite
    this.mood = Math.max(0, Math.min(100, this.mood + delta * dt));

    /* Passagers perdus : au-dela de 26 en porte, la file deborde. */
    const gateMax = this.arcade ? 40 : 26;
    if (gate.line.length > gateMax) {
      const lost = Math.min(gate.line.length - gateMax, Math.ceil(dt * 0.6));
      for (let i = 0; i < lost; i++) this._leave(gate.line.pop());
      this.missed += lost;
      this.mood = Math.max(0, this.mood - lost * 0.6);
    }
  }

  /* ---------------------------------------------------------- */
  /* Passagers en marche                                         */
  /* ---------------------------------------------------------- */

  /* Combien de passagers sont deja en route vers la file `id` ? */
  _pendingTo(id) {
    let n = 0;
    for (const e of this.transit) if (e.to.kind === 'line' && e.to.id === id) n++;
    return n;
  }

  _startWalk(pax, points, to, extra = {}) {
    this.transit.push({ pax, to, walk: makeWalk(points), t0: this.clock, ...extra });
  }

  _spawn() {
    const desks = Object.values(this.counters).filter(c => c.kind === 'checkin');
    const open = desks.filter(c => c.open);
    const pool = open.length ? open : desks;
    let best = pool[0], bl = Infinity;
    for (const d of pool) {
      const l = d.line.length + this._pendingTo(d.id);
      if (l < bl) { bl = l; best = d; }
    }
    if (bl >= 30) return;                       // hall sature : personne ne peut entrer
    const pax = makePassenger();
    this._startWalk(pax, routes.arrive(best.id, bl), { kind: 'line', id: best.id });
  }

  _deliver() {
    if (!this.transit.length) return;
    const keep = [];
    for (const e of this.transit) {
      /* Achat a la machine au moment ou le passager y arrive. */
      const el = this.clock - e.t0;
      if (e.buy && !e.bought && el >= e.buy.at) { e.bought = true; this._buy(e.buy.id); }
      if (el < e.walk.dur) { keep.push(e); continue; }
      if (e.to.kind === 'line') {
        const c = this.counters[e.to.id];
        if (c.line.length < 30) c.line.push(e.pax); else this.missed++;
      } else if (e.to.kind === 'board') {
        /* Il monte a bord : compte a l'arrivee a la passerelle. */
        this.boarded++;
        this.boardedSinceFlight++;
      }
      /* 'gone' : il est sorti, on n'en parle plus. */
    }
    this.transit = keep;
  }

  _leave(pax) { if (pax && pax.id != null) this._orphanBags(pax.id); }

  /* Un passager refuse ou parti : ses bagages deja au tri deviennent « abandonnes ». */
  _orphanBags(ownerId) {
    for (const b of this.counters.baggage.line) if (b.ownerId === ownerId) b.orphan = true;
  }

  /* ---------------------------------------------------------- */
  /* Dossiers et decisions                                       */
  /* ---------------------------------------------------------- */

  /* Dossier du passager de tete (celui qui est au guichet), ou null. */
  headOf(id) {
    const c = this.counters[id];
    if (!c || !KIND[c.kind].stage) return null;
    return c.line[0] || null;
  }

  head(id) { return this.headOf(id); }

  /* Le joueur decide au poste `id`. `choice` : voir terminalFlow.CHOICES.
     Rend le verdict { ok, proceeds, coins, mood, msg, why, fee?, returnTo? } ou null. */
  decide(id, choice) {
    const c = this.counters[id];
    const pax = this.headOf(id);
    if (!c || !pax) return null;
    const res = evaluate(c.kind, pax, choice);
    this._apply(c, pax, choice, res, true);
    this.save();
    this.lastMessage = res.msg;
    return res;
  }

  /* Poste non tenu : on laisse passer sans regarder. */
  _auto(c) {
    const k = KIND[c.kind];
    if (!k.stage) {
      /* Tri des bagages automatique, lent. */
      if (c.kind === 'baggage') this._loadBag(c, false);
      else if (c.line.length) c.line.shift();
      return;
    }
    const pax = this.headOf(c.id);
    if (!pax) return;
    const choice = DEFAULT_CHOICE[c.kind];
    const res = evaluate(c.kind, pax, choice);
    this._apply(c, pax, choice, res, false);
  }

  /* Consequences d'une decision (manuelle ou automatique) : le passager repart ou avance. */
  _apply(c, pax, choice, res, manual) {
    const k = KIND[c.kind];
    const hadDanger = hasDanger(pax);
    c.line.shift();
    c.served++;

    /* Ce qui change dans le dossier (il suit le passager). */
    if (res.ok && choice === 'fee') pax.feePaid = true;
    if (res.ok && c.kind === 'security' && choice === 'seize' && hadDanger) pax.dangerSeized = true;

    if (manual) this.stats.checked++;
    if (!res.ok) {
      this.stats.errors++;
      if (!manual) this.stats.incidents++;
    } else if (manual && c.kind === 'gate' && (choice === 'fee' || (choice === 'refuse' && res.returnTo))) {
      this.stats.recovered++;               // erreur d'un poste precedent rattrapee a la porte
    }
    if (manual && res.ok) {
      if (choice === 'fee') { this.stats.fees++; this.revenue += res.fee || overweightFee(pax); }
      if (choice === 'seize') this.stats.seized++;
      if (choice === 'refuse') this.stats.refused++;
    }
    /* Non tenu : les erreurs coutent plus cher (personne n'a rien vu). */
    const moodDelta = manual ? res.mood : (res.ok ? 0.15 : res.mood * (this.arcade ? 0.5 : 0.9));
    this.mood = Math.max(0, Math.min(100, this.mood + moodDelta));

    /* Il ne continue pas : il sort, ou retourne a la surete. */
    if (!res.proceeds) {
      if (res.returnTo === 'security') {
        const sec = this.counters.security;
        this._startWalk(pax, routes.gateToSecurity(sec.line.length + this._pendingTo('security')), { kind: 'line', id: 'security' });
        return;
      }
      this._leave(pax);
      if (!res.ok) this.missed++;
      this._startWalk(pax, c.kind === 'gate' ? routes.gateToExit() : routes.checkinToExit(c.id), { kind: 'gone' });
      return;
    }

    if (c.kind === 'checkin') {
      /* Le bagage part au tri (il porte le nom de son proprietaire), le passager va a la surete. */
      const bag = this.counters.baggage;
      if (bag.line.length < 30) bag.line.push({ id: _plId++, ownerId: pax.id, kg: pax.kg, orphan: false });
      const sec = this.counters.security;
      this._startWalk(pax, routes.checkinToSecurity(c.id, sec.line.length + this._pendingTo('security')), { kind: 'line', id: 'security' });
    } else if (c.kind === 'security') {
      /* Apres la surete, un passager sur deux passe par une machine (l'achat a lieu a son arrivee). */
      const machine = this._pickMachine();
      const gate = this.counters.gate;
      const pts = routes.securityToGate(machine, gate.line.length + this._pendingTo('gate'));
      const extra = {};
      if (machine) {
        const w = makeWalk(pts);
        const at = w.segs.find(s => s.dwell);
        extra.buy = { id: machine, at: at ? at.t0 : w.dur / 2 };
      }
      this._startWalk(pax, pts, { kind: 'line', id: 'gate' }, extra);
    } else if (c.kind === 'gate') {
      const gain = k.income * (manual && res.ok ? 1.35 : 1);
      c.revenue += gain;
      this.revenue += gain;
      /* Il marche jusqu'a la passerelle ; l'embarquement est compte quand il y arrive. */
      this._startWalk(pax, routes.gateToBridge(), { kind: 'board' });
    }
  }

  _pickMachine() {
    if (Math.random() > 0.45) return null;
    const pool = STOCK_KINDS.map(id => this.counters[id]).filter(c => c.open);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].id : null;
  }

  /* Le passager arrive a la machine : il achete si elle a du stock. */
  _buy(id) {
    const m = this.counters[id];
    if (m.stock >= 1) {
      m.stock = Math.max(0, m.stock - 1);
      const gain = KIND[m.kind].income;
      m.revenue += gain;
      this.revenue += gain;
      this.mood = Math.min(100, this.mood + 0.3);
    } else {
      this.stats.lostSales++;
      this.mood = Math.max(0, this.mood - 0.8);
    }
  }

  /* ---------------------------------------------------------- */
  /* Stocks, caisses, bagages                                    */
  /* ---------------------------------------------------------- */

  /* Prend une caisse a la reserve (le joueur en porte une seule). */
  takeCrate() {
    const st = this.counters.storage;
    if (this.carry > 0) return { ok: false, msg: 'Tu portes déjà une caisse : va la poser dans une machine.' };
    if (st.crates < 1) return { ok: false, msg: 'La réserve est vide ! Une livraison arrive bientôt.' };
    st.crates--;
    this.carry = CRATE_QTY;
    this.save();
    return { ok: true, msg: `Caisse prise (${CRATE_QTY} articles). Porte-la a une machine !` };
  }

  /* Recharge une machine avec la caisse portee. */
  restock(id) {
    const c = this.counters[id];
    if (!c || !STOCK_KINDS.includes(c.kind)) return { ok: false, msg: 'Ce n\'est pas une machine.' };
    if (this.carry <= 0) return { ok: false, msg: 'Va d\'abord chercher une caisse à la réserve.' };
    const room = MAX_STOCK - Math.floor(c.stock);
    if (room < 1) return { ok: false, msg: `${c.label} est déjà pleine.` };
    const add = Math.min(this.carry, room);
    c.stock = Math.min(MAX_STOCK, c.stock + add);
    this.carry -= add;
    this.stats.restocks++;
    this.mood = Math.min(100, this.mood + 1.5);
    this.save();
    return { ok: true, added: add, left: this.carry, msg: `${c.label} rechargée (+${add}).` };
  }

  /* Charge (ou retire) un bagage du tri. Un bagage « abandonne » (son passager a ete
     refuse) doit etre retire, pas charge : le charger dans l'avion est un incident. */
  _loadBag(c, manual) {
    const b = c.line[0];
    if (!b) return null;
    c.line.shift();
    c.served++;
    if (b.orphan) {
      if (manual) { this.stats.orphans++; this.mood = Math.min(100, this.mood + 0.8); }
      else { this.stats.incidents++; this.stats.errors++; this.mood = Math.max(0, this.mood - (this.arcade ? 1.2 : 2.5)); }
      return { ok: manual, orphan: true };
    }
    this.stats.bags++;
    this.bagsSinceFlight++;
    this.mood = Math.min(100, this.mood + (manual ? 0.4 : 0.1));
    return { ok: true, orphan: false };
  }

  loadBag() {
    const r = this._loadBag(this.counters.baggage, true);
    if (r) this.save();
    return r;
  }

  /* Machine presque vide ? (guidage Arcade) */
  lowMachine() {
    let best = null;
    for (const id of STOCK_KINDS) {
      const c = this.counters[id];
      if (c.open && c.stock < 4 && (!best || c.stock < best.stock)) best = c;
    }
    return best;
  }

  toggleCounter(id) {
    const c = this.counters[id];
    if (!c) return;
    c.open = !c.open;
    this.save();
    return c.open;
  }

  /* Action rapide (mode Pilote, clients d'une boutique) : la bonne decision est prise a
     la place du joueur. Rend le nombre restant dans la file ou null. */
  serveNext(id) {
    const c = this.counters[id];
    if (!c || c.line.length <= 0) return null;
    const k = KIND[c.kind];
    if (k.stage) {
      this.decide(id, bestChoice(c.kind, this.headOf(id)));
      return c.line.length;
    }
    if (c.kind === 'baggage') { this.loadBag(); return c.line.length; }
    if (STOCK_KINDS.includes(c.kind)) {
      if (c.stock < 1) { this.lastMessage = 'Rupture de stock !'; this.stats.lostSales++; return null; }
      c.line.shift();
      c.served++;
      c.stock = Math.max(0, c.stock - 1);
      c.revenue += k.income * 1.35;
      this.revenue += k.income * 1.35;
      this.mood = Math.min(100, this.mood + 0.8);
      this.save();
      return c.line.length;
    }
    return null;
  }

  /* Libelle du bouton contextuel, adapte au type de poste. */
  actionLabel(id) {
    const c = this.counters[id];
    if (!c) return 'AGIR';
    const k = KIND[c.kind];
    if (c.kind === 'storage') {
      if (this.carry > 0) return `📦 TU PORTES UNE CAISSE (${this.carry})`;
      return c.crates > 0 ? `📦 PRENDRE UNE CAISSE (réserve : ${c.crates})` : '📦 RÉSERVE VIDE';
    }
    if (STOCK_KINDS.includes(c.kind)) {
      const s = Math.floor(c.stock), q = c.line.length;
      if (this.carry > 0 && s < MAX_STOCK) return `📦 RECHARGER (${s}/${MAX_STOCK})`;
      if (q > 0 && s >= 1) return `${k.verb} (file : ${q}) · stock ${s}`;
      if (q > 0) return `⛔ RUPTURE DE STOCK`;
      return s < 4 ? `⚠️ PRESQUE VIDE (${s}/${MAX_STOCK}) : apporte une caisse` : `STOCK ${s}/${MAX_STOCK}`;
    }
    if (c.kind === 'baggage') {
      if (!c.line.length) return 'AUCUN BAGAGE À CHARGER';
      return c.line[0].orphan ? '🗑️ RETIRER UN BAGAGE ABANDONNÉ' : `🧳 ${k.verb} (${c.line.length} en attente)`;
    }
    if (!c.open) return `OUVRIR ${c.label.toUpperCase()}`;
    if (c.line.length > 0) return `${k.verb} (file : ${c.line.length})`;
    return 'FERMER LE POSTE';
  }

  /* Type d'interaction que le bouton declenche (pour l'interface). */
  actionKind(id) {
    const c = this.counters[id];
    if (!c) return 'none';
    if (c.kind === 'storage') return 'take';
    if (STOCK_KINDS.includes(c.kind)) {
      if (this.carry > 0 && Math.floor(c.stock) < MAX_STOCK) return 'restock';
      return c.line.length > 0 ? 'serve' : 'info';
    }
    if (c.kind === 'baggage') return c.line.length > 0 ? 'bag' : 'info';
    if (!c.open) return 'open';
    return c.line.length > 0 ? 'check' : 'close';
  }

  totalQueue() {
    return Object.values(this.counters).reduce((a, c) => a + (c.kind === 'storage' || c.kind === 'vending' ? 0 : c.line.length), 0);
  }

  /* ---------------------------------------------------------- */
  /* Vue pour le rendu 3D : qui est ou (les passagers du hall)    */
  /* ---------------------------------------------------------- */
  crowd() {
    const out = [];
    for (const id of ['checkin1', 'checkin2', 'checkin3', 'security', 'gate']) {
      const c = this.counters[id];
      c.line.forEach((p, i) => {
        if (i > 9) return;
        const s = slotPos(id, i);
        out.push({ id: p.id, shirt: p.shirt, mode: 'line', x: s[0], z: s[1], h: (c.facing || 0) + Math.PI, moving: false });
      });
    }
    for (const e of this.transit) {
      const w = walkAt(e.walk, this.clock - e.t0);
      if (w.done && e.to.kind !== 'line') continue;
      out.push({ id: e.pax.id, shirt: e.pax.shirt, mode: 'walk', x: w.x, z: w.z, h: w.h, moving: w.moving });
    }
    return out;
  }

  /* Petit effet sur la reputation de la compagnie, comme les autres modules,
     applique a chaque atterrissage pour boucler la boucle de jeu. */
  registerFlight() {
    const delta = this.mood > 70 ? 1 : (this.mood < 35 ? -2 : 0);
    this.save();
    return delta;
  }

  /* Rend le nombre de passagers effectivement embarques a la porte
     depuis le dernier vol enregistre, et remet le compteur a zero. */
  consumeBoardedSinceFlight() {
    const n = this.boardedSinceFlight;
    this.boardedSinceFlight = 0;
    return n;
  }

  /* Bagages charges depuis le dernier vol (pour le rapport de vol). */
  consumeBagsSinceFlight() {
    const n = this.bagsSinceFlight;
    this.bagsSinceFlight = 0;
    return n;
  }

  status() {
    return `Ambiance terminal ${this.mood.toFixed(0)}% — ${this.totalQueue()} passager(s) en attente`
      + ` — ${this.boarded} embarqué(s) — recette ${Math.round(this.revenue).toLocaleString('fr-FR')} EUR`;
  }

  save() {
    try {
      const counters = {};
      for (const id in this.counters) {
        const c = this.counters[id];
        counters[id] = { open: c.open, queue: c.line.length, stock: c.stock, crates: c.crates, served: c.served, revenue: c.revenue };
      }
      localStorage.setItem(STORE, JSON.stringify({
        ver: STORE_VERSION,
        mood: this.mood, revenue: this.revenue,
        boarded: this.boarded, boardedSinceFlight: this.boardedSinceFlight, missed: this.missed,
        carry: this.carry, stats: this.stats, bagsSinceFlight: this.bagsSinceFlight,
        counters
      }));
    } catch (e) { /* ignore */ }
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || '{}');
      if (typeof d.mood === 'number') this.mood = d.mood;
      if (typeof d.revenue === 'number') this.revenue = d.revenue;
      if (typeof d.boarded === 'number') this.boarded = d.boarded;
      if (typeof d.boardedSinceFlight === 'number') this.boardedSinceFlight = d.boardedSinceFlight;
      if (typeof d.missed === 'number') this.missed = d.missed;
      if (typeof d.carry === 'number') this.carry = d.carry;
      if (typeof d.bagsSinceFlight === 'number') this.bagsSinceFlight = d.bagsSinceFlight;
      if (d.stats) Object.assign(this.stats, d.stats);
      if (d.counters) {
        for (const id in d.counters) {
          const c = this.counters[id], s = d.counters[id];
          if (!c) continue;
          /* Ancienne sauvegarde (avant le circuit) : les postes ouverts/fermes ne
             veulent plus rien dire, on garde les valeurs par defaut. */
          if (d.ver === STORE_VERSION && typeof s.open === 'boolean') c.open = s.open;
          if (typeof s.queue === 'number') c.queue = Math.min(30, s.queue);     // les passagers sont recrees
          if (typeof s.stock === 'number' && c.stock != null) c.stock = s.stock;
          if (typeof s.crates === 'number' && c.crates != null) c.crates = s.crates;
          if (typeof s.served === 'number') c.served = s.served;
          if (typeof s.revenue === 'number') c.revenue = s.revenue;
        }
      }
    } catch (e) { /* ignore */ }
  }

  static reset() {
    try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
  }
}
