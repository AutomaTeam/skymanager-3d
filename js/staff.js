/* ============================================================
   staff.js — Personnel de l'aeroport (mode Arcade)

   On embauche des employes avec des pieces ; ils travaillent
   tout seuls, y compris quand le joueur est ailleurs (en vol, en
   cabine...). Chaque metier agit par les memes fonctions que le
   joueur (terminal.decide, loadBag, restock, cabin.serve...) : un
   employe fait donc exactement ce que ferait le joueur, en un peu
   plus lentement et avec une petite chance de se tromper.

   - 8 metiers, chacun avec un nombre de postes maximum ;
   - 3 niveaux de formation (plus vite, plus fiable) ;
   - certains metiers se debloquent avec le niveau de l'aeroport ;
   - pas de salaire, et leurs gains reviennent au joueur (_pay) : un employe reste, jamais de spirale
     de dettes. Le cout est l'embauche et la formation.

   Etat sauvegarde : localStorage « skymanager.staff ».
   ============================================================ */

import { bestChoice, DEFAULT_CHOICE } from './terminalFlow.js?v=1791604049';
import { sfx } from './sfx.js?v=1791604049';
import { collectBodies, PERSON_R } from './bodies.js?v=1791604049';

const STORE = 'skymanager.staff';
const COIN = 1000;                              // EUR par piece (meme valeur que arcade.js)
const MAX_LEVEL = 3;

export const ROLES = [
  { id: 'checkin', ico: '🛂', name: 'Agent d\'enregistrement', max: 3, cost: 40, unlock: 1, base: 5.0,
    desc: 'Tient un guichet : il vérifie les billets et les bagages. Chaque agent ouvre un guichet de plus.',
    counters: ['checkin1', 'checkin2', 'checkin3'] },
  { id: 'baggage', ico: '🧳', name: 'Bagagiste', max: 2, cost: 30, unlock: 1, base: 9,
    desc: 'Charge les valises dans l\'avion sans que tu aies a t\'en occuper.' },
  { id: 'security', ico: '🕵️', name: 'Agent de sûreté', max: 1, cost: 50, unlock: 2, base: 4.0,
    desc: 'Regarde le plateau du scanner et confisque les objets interdits.', counters: ['security'] },
  { id: 'gate', ico: '📲', name: 'Agent de porte', max: 1, cost: 45, unlock: 2, base: 3.5,
    desc: 'Scanne les cartes d\'embarquement et fait monter les passagers.', counters: ['gate'] },
  { id: 'shop', ico: '🛍️', name: 'Vendeur', max: 2, cost: 30, unlock: 2, base: 6,
    desc: 'Sert les clients de la boutique et du café.', counters: ['shop', 'cafe'] },
  { id: 'mechanic', ico: '🧑‍🔧', name: 'Mécanicien', max: 2, cost: 60, unlock: 2, base: 10,
    desc: 'Répare doucement les pièces usées de l\'avion.' },
  { id: 'stock', ico: '📦', name: 'Magasinier', max: 1, cost: 35, unlock: 3, base: 12,
    desc: 'Va chercher des caisses à la réserve et recharge les machines vides.' },
  { id: 'hostess', ico: '👩‍✈️', name: 'Hôtesse', max: 2, cost: 55, unlock: 3, base: 14,
    desc: 'En cabine, elle sert les passagers pendant que tu fais autre chose.' }
];
export const ROLE = Object.fromEntries(ROLES.map(r => [r.id, r]));

/* Couleur de la calotte (repere de metier) et trajets de ronde des employes visibles.
   Les trajets suivent les allees du hall (memes points que terminalSystem.routes). */
const HAT = { checkin: 0x3b82f6, security: 0x1f2937, gate: 0x06b6d4, baggage: 0xf59e0b, shop: 0xec4899, stock: 0x22c55e, mechanic: 0xef4444, hostess: 0xa855f7 };
const PATROL = {
  baggage: [[282, 1246.5], [304, 1246.5]],
  stock: [[455, 1251], [456, 1231.5], [449.5, 1231.5], [449.5, 1229], [456, 1231.5], [436, 1231.5], [436, 1211], [436, 1231.5]]
};
const WALK = 1.35;

/* Cout de la formation d'un niveau au suivant. */
export const trainCost = (role, lvl) => Math.round(role.cost * (lvl === 1 ? 1.5 : 3));

export class Staff {
  constructor(game) {
    this.g = game;
    this.hired = {};
    for (const r of ROLES) this.hired[r.id] = { n: 0, lvl: 1 };
    this._t = {};              // minuteurs par metier et par poste
    this._flagAcc = 0;
    this._badgesDirty = true;
    this.actors = new Map();   // employes visibles (personnages 3D)
    this._load();
  }

  /* ---------------- Etat ---------------- */
  count(id) { return this.hired[id].n; }
  level(id) { return this.hired[id].lvl; }
  get total() { return ROLES.reduce((a, r) => a + this.hired[r.id].n, 0); }
  get slots() { return ROLES.reduce((a, r) => a + r.max, 0); }

  /* Fiabilite (0..1) et cadence (multiplicateur) selon la formation. */
  accuracy(id) { return 0.72 + 0.09 * (this.hired[id].lvl - 1); }
  speed(id) { return 1 + 0.4 * (this.hired[id].lvl - 1); }

  isUnlocked(id) { return this.g.arcade.data.level >= ROLE[id].unlock; }

  /* ---------------- Achats ---------------- */
  canHire(id) {
    const r = ROLE[id], h = this.hired[id];
    if (!this.isUnlocked(id)) return { ok: false, why: `Débloque au niveau ${r.unlock}` };
    if (h.n >= r.max) return { ok: false, why: 'Équipe complète' };
    if (this.g.arcade.coins < r.cost) return { ok: false, why: `Il te faut ${r.cost} pièces` };
    return { ok: true };
  }

  hire(id) {
    const c = this.canHire(id);
    if (!c.ok) return c;
    const t = this.g.tycoon;
    t.cash -= ROLE[id].cost * COIN;
    t.save();
    this.hired[id].n++;
    this._save();
    this.applyFlags();
    sfx.levelUp();
    this.g.arcade.confetti(35);
    this.g.arcade.event('hire');
    return { ok: true };
  }

  canTrain(id) {
    const h = this.hired[id], r = ROLE[id];
    if (h.n < 1) return { ok: false, why: 'Recrute d\'abord' };
    if (h.lvl >= MAX_LEVEL) return { ok: false, why: 'Niveau max' };
    const cost = trainCost(r, h.lvl);
    if (this.g.arcade.coins < cost) return { ok: false, why: `Il te faut ${cost} pièces`, cost };
    return { ok: true, cost };
  }

  train(id) {
    const c = this.canTrain(id);
    if (!c.ok) return c;
    const t = this.g.tycoon;
    t.cash -= c.cost * COIN;
    t.save();
    this.hired[id].lvl++;
    this._save();
    sfx.star(2);
    this.g.arcade.confetti(25);
    return { ok: true };
  }

  /* ---------------- Effets sur le terminal : postes tenus ---------------- */
  applyFlags() {
    const term = this.g.terminal;
    if (!term) return;
    for (const r of ROLES) {
      if (!r.counters) continue;
      const n = this.hired[r.id].n;
      r.counters.forEach((cid, i) => {
        const c = term.counters[cid];
        if (!c) return;
        const staffed = i < n;
        c.staffed = staffed;
        /* Un guichet tenu est ouvert. */
        if (staffed && !c.open) c.open = true;
      });
    }
    this._badgesDirty = true;
  }

  /* Pastilles 🛂 🕵️ au-dessus des postes tenus (visibles dans le hall). */
  _updateBadges() {
    const r3d = this.g.r3d, term = this.g.terminal;
    if (!r3d || !r3d.setStaffBadges) return;
    const list = [];
    for (const r of ROLES) {
      if (!r.counters) continue;
      r.counters.forEach((cid, i) => {
        if (i < this.hired[r.id].n && term.counters[cid]) list.push({ key: cid, emoji: r.ico, x: term.counters[cid].pos[0], z: term.counters[cid].pos[1] });
      });
    }
    r3d.setStaffBadges(list);
  }

  /* ---------------- Employes visibles ---------------- */
  /* Un personnage 3D par employe : derriere son comptoir, en ronde dans le hall, pres de l'avion
     ou dans l'allee de la cabine. */
  _syncActors() {
    const r3d = this.g.r3d, term = this.g.terminal;
    if (!r3d || !r3d.buildTechnician) return;
    for (const r of ROLES) {
      const n = this.hired[r.id].n;
      for (let i = 0; i < n; i++) {
        const key = r.id + ':' + i;
        if (this.actors.has(key)) continue;
        if (r.id === 'hostess' && !r3d.cabinGroup) continue;       // cabine pas encore construite
        const a = { key, role: r.id, i, x: 0, z: 0, h: 0, moving: false, path: null, pi: 0, dir: 1 };
        if (r.counters) {
          const c = term.counters[r.counters[i % r.counters.length]];
          if (!c) continue;
          const f = c.facing || 0;
          a.x = c.pos[0] + Math.sin(f) * 1.9; a.z = c.pos[1] + Math.cos(f) * 1.9;
          a.h = Math.atan2(-Math.sin(f), -Math.cos(f));               // il fait face a la file
        } else if (PATROL[r.id]) {
          a.path = PATROL[r.id]; a.pi = (i * Math.max(1, a.path.length >> 1)) % a.path.length;
          a.off = i % 2 ? 0.9 : 0;                 // deux employes sur la meme ronde : deux files, pas le meme point
          a.x = a.path[a.pi][0]; a.z = a.path[a.pi][1] + a.off;
        } else if (r.id === 'hostess') {
          a.path = [[0.58, 0.4], [0.58, -5.2]]; a.pi = i % 2; a.x = a.path[a.pi][0]; a.z = a.path[a.pi][1];
        }
        a.ent = r3d.buildTechnician(0xffffff, HAT[r.id], false);
        (r.id === 'hostess' ? r3d.cabinGroup : r3d.scene).add(a.ent.group);
        this.actors.set(key, a);
      }
    }
  }

  _moveActors(dt) {
    if (!this.actors.size) return;
    const g = this.g, r3d = g.r3d, cam = r3d.camera.position;
    for (const a of this.actors.values()) {
      const grp = a.ent.group;
      a.moving = false;
      if (a.role === 'mechanic') {
        const ac = g.ac;
        const p = g.nav.toWorld('aircraft', a.i ? 5.8 : -5.8, 1.8);
        a.x = p.x; a.z = p.z;
        a.h = Math.atan2(ac.pos.x - a.x, ac.pos.z - a.z);
        grp.visible = ac.onGround && Math.hypot(cam.x - a.x, cam.z - a.z) < 170;
      } else {
        if (a.path) {
          const t = a.path[a.pi];
          const dx = t[0] - a.x, dz = t[1] + (a.off || 0) - a.z, d = Math.hypot(dx, dz);
          if (d < 0.12) {
            a.pi += a.dir;
            if (a.pi >= a.path.length || a.pi < 0) { a.dir *= -1; a.pi += 2 * a.dir; }
          } else {
            const step = Math.min(d, WALK * dt);
            const nx = a.x + dx / d * step, nz = a.z + dz / d * step;
            /* Physique : un employe s'arrete devant le joueur ou une autre personne (pas de traversee). */
            if (a.role === 'hostess' ? !this._cabinBlocked(a, nx, nz) : !this._blockedAt(a, nx, nz)) {
              a.x = nx; a.z = nz;
              a.moving = true;
            }
            a.h = Math.atan2(dx, dz);
          }
        }
        grp.visible = a.role === 'hostess' ? true : Math.hypot(cam.x - a.x, cam.z - a.z) < 170;
      }
      const y = a.role === 'hostess' ? 0 : (r3d.groundHeight ? r3d.groundHeight(a.x, a.z) : 0);
      grp.position.set(a.x, y, a.z);
      grp.rotation.y = a.h;
      r3d.updateAvatarAnim(a.ent, a.moving, dt);
    }
  }

  /* Cabine (repere de l'avion) : l'hotesse ne traverse pas le joueur dans l'allee etroite. */
  _cabinBlocked(a, nx, nz) {
    const att = this.g.attendant;
    if (this.g.state !== 'CABIN' || !att) return false;
    const lim = 0.7;
    if (Math.hypot(a.x - att.x, a.z - att.z) < lim) return false;      // deja colles : on se degage
    return Math.hypot(nx - att.x, nz - att.z) < lim;
  }

  /* Un corps mobile est-il sur le chemin ? (on ne bloque que s'il n'y etait pas deja : pas de coincage.) */
  _blockedAt(a, nx, nz) {
    if (!this._bodiesT || this._bodiesT !== this.g.time) { this._bodies = collectBodies(this.g, { player: true }); this._bodiesT = this.g.time; }
    for (const b of this._bodies) {
      if (b.ref === a || b.r === undefined) continue;
      const lim = b.r + PERSON_R;
      const dNow = Math.hypot(a.x - b.x, a.z - b.z);
      if (dNow < lim) continue;
      if (Math.hypot(nx - b.x, nz - b.z) < lim) return true;
    }
    return false;
  }

  /* ---------------- Travail ---------------- */
  update(dt) {
    const g = this.g;
    if (g._worldPaused) return;
    this._flagAcc += dt;
    if (this._flagAcc > 1 || this._badgesDirty) {
      this._flagAcc = 0;
      this.applyFlags();
      if (this._badgesDirty) { this._badgesDirty = false; this._updateBadges(); }
      this._syncActors();
    }
    this._moveActors(dt);
    this._reportEarnings(dt);
    for (const r of ROLES) {
      const h = this.hired[r.id];
      if (h.n < 1) continue;
      const workers = r.counters ? h.n : h.n;             // un minuteur par employe
      for (let i = 0; i < workers; i++) {
        const key = r.id + ':' + i;
        this._t[key] = (this._t[key] || Math.random() * r.base) + dt;
        const every = r.base / this.speed(r.id);
        if (this._t[key] < every) continue;
        this._t[key] = 0;
        this._work(r, i);
      }
    }
  }

  _work(role, i) {
    const g = this.g, term = g.terminal;
    switch (role.id) {
      case 'checkin':
      case 'security':
      case 'gate': {
        const cid = role.counters[i];
        const c = term.counters[cid];
        if (!c || !c.open || !c.line.length) return;
        const pax = term.headOf(cid);
        if (!pax) return;
        const choice = Math.random() < this.accuracy(role.id) ? bestChoice(c.kind, pax) : DEFAULT_CHOICE[c.kind];
        const res = term.decide(cid, choice);
        if (res && res.ok) this._pay(res.coins || 1);
        break;
      }
      case 'baggage':
        if (term.counters.baggage.line.length && term.loadBag()) this._pay(1);
        break;
      case 'shop': {
        const cid = role.counters[i % role.counters.length];
        const c = term.counters[cid];
        if (c && c.open && c.line.length && term.serveNext(cid) != null) this._pay(3);
        break;
      }
      case 'stock': {
        if (term.carry > 0) {
          const m = term.lowMachine() || ['shop', 'cafe', 'vending'].map(id => term.counters[id]).sort((a, b) => a.stock - b.stock)[0];
          if (m) { const r = term.restock(m.id); if (r && r.ok) this._pay(3); }
          if (term.carry > 0 && m && m.stock >= 12) term.carry = 0;          // machine pleine : on range la caisse
        } else if (term.lowMachine()) {
          term.takeCrate();
        }
        break;
      }
      case 'mechanic': {
        const mech = g.mechanic;
        let worst = null;
        for (const k in mech.components) { const c = mech.components[k]; if (c.wear > 12 && (!worst || c.wear > worst.wear)) worst = c; }
        if (!worst) return;
        worst.wear = Math.max(0, worst.wear - 3 * this.speed('mechanic'));
        this._pay(1);
        if (mech._refreshWorkOrders) mech._refreshWorkOrders();
        break;
      }
      case 'hostess': {
        if (g.state !== 'CABIN') return;
        const cab = g.cabin;
        let best = null;
        for (const r of cab.requests) if (r.type !== 'quiz' && (!best || r.timeLeft < best.timeLeft)) best = r;
        if (!best) return;
        const req = { row: best.row, side: best.side, type: best.type };
        const res = cab.serve(best.id);
        if (res && res.reason === 'ok') g.arcade.cabinServed(req);
        break;
      }
    }
  }

  /* Les employes travaillent pour le joueur : leurs gains lui reviennent (avant, il payait
     l'embauche et ne touchait rien). Pieces versees en silence, resume de temps en temps. */
  _pay(n) {
    n = Math.max(1, Math.round(n * 0.6));         // un employe rapporte un peu moins que le joueur
    this.g.arcade.giveCoins(n, { silent: true });
    this._earned = (this._earned || 0) + n;
  }

  /* Petit message « ton equipe a gagne ... » au plus toutes les 25 s. */
  _reportEarnings(dt) {
    if (!this._earned) return;
    this._earnT = (this._earnT || 0) + dt;
    if (this._earnT < 25) return;
    this.g.toast(`👥 Ton équipe a gagné +${this._earned} 🪙`, 2200, 'ok');
    this._earned = 0; this._earnT = 0;
  }

  /* ---------------- Sauvegarde ---------------- */
  _save() {
    try { localStorage.setItem(STORE, JSON.stringify(this.hired)); } catch (e) { /* ignore */ }
  }
  _load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!d) return;
      for (const r of ROLES) if (d[r.id]) this.hired[r.id] = { n: Math.min(r.max, d[r.id].n | 0), lvl: Math.min(MAX_LEVEL, Math.max(1, d[r.id].lvl | 0)) };
    } catch (e) { /* ignore */ }
  }
  static reset() {
    try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
  }
}
