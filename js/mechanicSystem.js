/* ============================================================
   mechanicSystem.js — ITERATION 3
   Usure des composants, diagnostic, mini-jeu de reparation
   (cle dynamometrique), mise en conformite vol (carnet de route).

   Nouveautes de cette iteration :
   - chaque composant suit trois etats distincts : usure mecanique,
     niveau de fluide et couple de serrage. Une reparation ne remet
     a niveau que ce que le mini-jeu a effectivement traite ;
   - un stock de pieces detachees, achete avec la tresorerie de
     l'aeroport (tycoon). Reparer sans piece en stock degrade la
     qualite de l'intervention ;
   - des ordres de travail (work orders) generes automatiquement
     quand un composant franchit son seuil, avec priorite ;
   - l'usure est alimentee par les vols : le stress mecanique
     enregistre ici conditionne les pannes en vol suivant.
   ============================================================ */

const STORE = 'skymanager.mechanic';

/* Postes de travail autour de l'appareil : chaque poste regroupe
   un ou plusieurs composants accessibles depuis le meme endroit.
   `pos` est un offset local (m) par rapport au centre de l'avion,
   utilise par renderer3d.js pour placer les points de diagnostic. */
/* Le y de `pos` est l'offset local reel par rapport au centre de l'avion
   (memes reperes que flightPhysics/renderer3d : centre fuselage = 0, sol
   sous les trains = env. -3.4). Cela place chaque point de diagnostic a la
   hauteur physique du composant (au sol pour les trains, a hauteur d'aile
   ou de reacteur ailleurs) plutot qu'a la hauteur du fuselage. */
export const STATIONS = [
  { key: 'gearNose',  label: 'Train avant',        pos: [0, -3.3, -11.5], components: ['tyresNose'] },
  { key: 'gearLeft',  label: 'Train principal G',  pos: [-3.8, -3.45, 1.8], components: ['tyresMain', 'brakes'] },
  { key: 'gearRight', label: 'Train principal D',  pos: [3.8, -3.45, 1.8], components: ['struts'] },
  { key: 'wingLeft',  label: 'Aile gauche',        pos: [-11, -1.0, 3.2], components: ['flapsActu'] },
  { key: 'wingRight', label: 'Aile droite',        pos: [11, -1.0, 3.2], components: ['hydraulics'] },
  { key: 'engineLeft', label: 'Réacteur gauche',   pos: [-6.6, -2.0, -1.2], components: ['fanBlades'] },
  { key: 'engineRight', label: 'Réacteur droit',   pos: [6.6, -2.0, -1.2], components: ['fanBlades'] },
  { key: 'fuselage',  label: 'Fuselage / structure', pos: [0, -1.5, -4], components: ['airframe'] }
];

/* Catalogue de pieces detachees. `part` est l'identifiant de la piece
   consommee par une reparation, `cost` son prix unitaire en EUR. */
export const PARTS = {
  tyre:     { label: 'Pneu',              cost: 4200 },
  pad:      { label: 'Plaquettes frein',  cost: 6800 },
  seal:     { label: 'Joint hydraulique', cost: 2400 },
  actuator: { label: 'Actionneur',        cost: 12500 },
  blade:    { label: 'Aube de soufflante', cost: 18500 },
  panel:    { label: 'Panneau composite', cost: 9400 },
  fluid:    { label: 'Fluide hydraulique', cost: 900 }
};

/* Etat initial de chaque composant : usure, fluide, couple, piece. */
const COMPONENT_DEFS = {
  tyresNose:  { label: 'Pneus train avant',      critical: 85, part: 'tyre',     fluid: null, torque: 60 },
  tyresMain:  { label: 'Pneus train principal',  critical: 80, part: 'tyre',     fluid: null, torque: 60 },
  brakes:     { label: 'Freins carbone',         critical: 75, part: 'pad',      fluid: 70,   torque: 55 },
  struts:     { label: 'Amortisseurs',           critical: 70, part: 'seal',     fluid: 65,   torque: 50 },
  flapsActu:  { label: 'Actionneurs de volets',  critical: 70, part: 'actuator', fluid: 60,   torque: 55 },
  hydraulics: { label: 'Circuits hydrauliques',  critical: 65, part: 'fluid',    fluid: 55,   torque: 50 },
  fanBlades:  { label: 'Soufflantes réacteurs',  critical: 60, part: 'blade',    fluid: 60,   torque: 65 },
  airframe:   { label: 'Structure / composites', critical: 55, part: 'panel',    fluid: null, torque: 70 }
};

/* ------------------------------------------------------------
   Pannes en vol (phase 12).

   Chaque composant peut lacher d'une maniere qui lui est propre.
   `kind` est interprete par Aircraft.applyFault() : le modele de
   vol ne connait que des facteurs (poussee, autorite, freinage,
   trainee) et des blocages (volets, train). `weight` pondere le
   tirage : un pneu creve est plus probable qu'une structure qui
   rompt, parce qu'il y a deux trains principaux et qu'un pneu
   s'use vite.
   ------------------------------------------------------------ */
export const FAILURES = {
  tyresNose:  { kind: 'tyre',    weight: 3, label: 'Crevaison train avant',    alert: 'CREVAISON AVANT — tenue de cap dégradée' },
  tyresMain:  { kind: 'tyre',    weight: 4, label: 'Crevaison train principal', alert: 'CREVAISON PRINCIPALE — l\'appareil tire au roulage' },
  brakes:     { kind: 'brake',   weight: 3, label: 'Freins dégradé',           alert: 'FREINS DÉGRADÉS — distance d\'arrêt allongée' },
  struts:     { kind: 'drag',    weight: 2, label: 'Amortisseur fuyant',       alert: 'AMORTISSEUR FUYANT — traînée et instabilité' },
  flapsActu:  { kind: 'flaps',   weight: 3, label: 'Volets bloqués',           alert: 'VOLETS BLOQUÉS — configuration figée' },
  hydraulics: { kind: 'control', weight: 3, label: 'Perte hydraulique',        alert: 'PERTE HYDRAULIQUE — gouvernes amollies' },
  fanBlades:  { kind: 'thrust',  weight: 3, label: 'Réacteur dégradé',         alert: 'RÉACTEUR DÉGRADÉ — poussée réduite' },
  airframe:   { kind: 'drag',    weight: 1, label: 'Fissure structurelle',     alert: 'FISSURE STRUCTURELLE — traînée et vibrations' }
};

export class MechanicSystem {
  constructor() {
    this.components = {};
    for (const k in COMPONENT_DEFS) {
      const d = COMPONENT_DEFS[k];
      this.components[k] = {
        label: d.label, critical: d.critical, part: d.part,
        wear: 0, fluid: d.fluid, torque: d.torque
      };
    }
    /* Stock de pieces detachees : 2 de chaque au demarrage. */
    this.parts = {};
    for (const p in PARTS) this.parts[p] = 2;
    this.spend = 0;                 // depenses cumulees en pieces (EUR)
    this.logbook = [];
    this.workOrders = [];
    this._woSeq = 1;
    this.releasedToService = true;
    this.load();
  }

  /* Usure induite par le vol qui vient de se terminer */
  registerFlight(ac) {
    const s = ac.stress;
    const c = this.components;

    c.tyresMain.wear   += 1.2 + s.hard * 3.0;
    c.tyresNose.wear   += 0.8 + s.hard * 1.4;
    c.brakes.wear      += 1.5 + s.hard * 2.2;
    c.struts.wear      += 0.6 + s.hard * 4.5;
    c.flapsActu.wear   += 0.5 + s.flapOverspeed * 2.5;
    c.hydraulics.wear  += 0.7 + s.overG * 1.5;
    c.fanBlades.wear   += 0.9 + (ac.n1 > 92 ? 0.6 : 0);
    c.airframe.wear    += 0.4 + s.overG * 3.0 + s.overspeed * 2.0 + (ac.crashed ? 25 : 0);

    /* Les fluides se consument aussi : freinages durs et facteur de
       charge font baisser les niveaux. */
    if (c.brakes.fluid != null) c.brakes.fluid = Math.max(0, c.brakes.fluid - (0.6 + s.hard * 2.4));
    if (c.struts.fluid != null) c.struts.fluid = Math.max(0, c.struts.fluid - (0.4 + s.hard * 1.8));
    if (c.flapsActu.fluid != null) c.flapsActu.fluid = Math.max(0, c.flapsActu.fluid - (0.3 + s.flapOverspeed * 2.0));
    if (c.hydraulics.fluid != null) c.hydraulics.fluid = Math.max(0, c.hydraulics.fluid - (0.5 + s.overG * 1.6));
    if (c.fanBlades.fluid != null) c.fanBlades.fluid = Math.max(0, c.fanBlades.fluid - 0.3);

    /* Les vibrations desserrent les fixations. */
    for (const k in c) {
      if (c[k].torque == null) continue;
      c[k].torque = Math.max(0, c[k].torque - (0.3 + s.hard * 1.2 + s.overG * 0.8));
    }

    for (const k in c) c[k].wear = Math.min(100, c[k].wear);

    this.logbook.push({
      date: Date.now(),
      touchdownFpm: ac.touchdown ? Math.round(ac.touchdown.fpm) : null,
      stress: { ...s },
      crashed: ac.crashed
    });
    this._refreshWorkOrders();
    this.releasedToService = !this.needsMaintenance();
    this.save();
  }

  /* Genere/met a jour les ordres de travail a partir de l'etat reel. */
  _refreshWorkOrders() {
    const open = new Set(this.workOrders.filter(w => !w.done).map(w => w.key));
    for (const k in this.components) {
      const c = this.components[k];
      const bad = c.wear >= c.critical
        || (c.fluid != null && c.fluid < 35)
        || (c.torque != null && c.torque < 35);
      if (bad && !open.has(k)) {
        this.workOrders.push({
          id: this._woSeq++, key: k, done: false, date: Date.now(),
          priority: c.wear >= c.critical ? 'urgent' : 'planifie'
        });
      }
    }
    /* Un composant revenu dans le vert cloture son ordre. */
    this.workOrders.forEach(w => {
      const c = this.components[w.key];
      if (!c) return;
      const ok = c.wear < c.critical * 0.55
        && (c.fluid == null || c.fluid > 55)
        && (c.torque == null || c.torque > 55);
      if (ok) w.done = true;
    });
    this.workOrders = this.workOrders.slice(-60);
  }

  openWorkOrders() {
    return this.workOrders.filter(w => !w.done);
  }

  needsMaintenance() {
    return Object.values(this.components).some(c => c.wear >= c.critical);
  }

  /* Probabilite de panne en vol si l'avion part mal entretenu.
     Les fluides bas et les fixations desserrees y contribuent. */
  failureRisk() {
    let r = 0;
    for (const c of Object.values(this.components)) {
      if (c.wear > c.critical) r += (c.wear - c.critical) / 100;
      if (c.fluid != null && c.fluid < 30) r += (30 - c.fluid) / 400;
      if (c.torque != null && c.torque < 30) r += (30 - c.torque) / 400;
    }
    return Math.min(0.95, r);
  }

  /* ----------------------------------------------------------
     Tirage des pannes en vol (phase 12).

     Appele au decollage. Le nombre de pannes suit le risque : un
     appareil a 20 % de risque lache en moyenne une fois sur cinq,
     un appareil a 80 % lache presque a coup sur, et parfois deux
     fois. Le composant tire est pondere par son propre depassement
     de seuil, donc c'est toujours le poste qu'on a neglige qui
     casse — pas un composant au hasard.
     ---------------------------------------------------------- */
  rollFailures() {
    const risk = this.failureRisk();
    if (risk <= 0.02) return [];

    /* Nombre de pannes : 0, 1 ou 2 selon le risque. */
    let count = 0;
    if (Math.random() < risk) count++;
    if (Math.random() < risk * risk * 0.8) count++;
    if (count === 0) return [];

    /* Urne ponderee : poids = depassement du seuil + fluide/couple bas. */
    const urn = [];
    for (const k in this.components) {
      const c = this.components[k];
      const f = FAILURES[k];
      if (!f) continue;
      let w = 0;
      if (c.wear > c.critical) w += (c.wear - c.critical) * f.weight;
      if (c.fluid != null && c.fluid < 30) w += (30 - c.fluid) * f.weight * 0.5;
      if (c.torque != null && c.torque < 30) w += (30 - c.torque) * f.weight * 0.5;
      if (w > 0) urn.push({ key: k, w });
    }
    if (!urn.length) return [];

    const out = [];
    for (let i = 0; i < count; i++) {
      const total = urn.reduce((s, e) => s + e.w, 0);
      let r = Math.random() * total;
      let hit = urn[urn.length - 1];
      for (const e of urn) { r -= e.w; if (r <= 0) { hit = e; break; } }
      if (out.some(o => o.key === hit.key)) continue;   // pas deux fois le meme poste
      out.push({ key: hit.key, ...FAILURES[hit.key] });
    }
    return out;
  }

  /* Une panne aggrave l'etat du composant : elle ne se repare pas
     toute seule, il faudra passer a l'atelier. */
  registerFailure(key) {
    const c = this.components[key];
    if (!c) return;
    c.wear = Math.min(100, c.wear + 12);
    if (c.fluid != null) c.fluid = Math.max(0, c.fluid - 18);
    if (c.torque != null) c.torque = Math.max(0, c.torque - 15);
    this._refreshWorkOrders();
    this.releasedToService = false;
    this.save();
  }

  status() {
    const worst = Object.values(this.components).sort((a, b) => b.wear - a.wear)[0];
    const wo = this.openWorkOrders().length;
    return this.needsMaintenance()
      ? `Maintenance requise : ${worst.label} a ${worst.wear.toFixed(0)}% d'usure (${wo} ordre(s) ouvert(s))`
      : `Appareil conforme au vol. Usure max : ${worst.label} ${worst.wear.toFixed(0)}%`;
  }

  /* Usure maximale parmi les composants d'un poste (pour colorer le point de diagnostic) */
  stationWear(stationKey) {
    const st = STATIONS.find(s => s.key === stationKey);
    if (!st) return 0;
    return Math.max(...st.components.map(k => this.components[k].wear));
  }
  stationNeedsWork(stationKey) {
    const st = STATIONS.find(s => s.key === stationKey);
    if (!st) return false;
    return st.components.some(k => {
      const c = this.components[k];
      return c.wear >= c.critical * 0.55
        || (c.fluid != null && c.fluid < 45)
        || (c.torque != null && c.torque < 45);
    });
  }

  /* Etat agrege d'un composant, pour l'affichage du panneau. */
  componentState(key) {
    const c = this.components[key];
    if (!c) return null;
    const flags = [];
    if (c.wear >= c.critical) flags.push('usure critique');
    else if (c.wear >= c.critical * 0.55) flags.push('usure à surveiller');
    if (c.fluid != null && c.fluid < 35) flags.push('niveau bas');
    if (c.torque != null && c.torque < 35) flags.push('fixations desserrées');
    return { ...c, flags, ok: flags.length === 0 };
  }

  /* Achete des pieces avec la tresorerie de l'aeroport.
     Renvoie { bought, cost } ou null si la tresorerie est insuffisante. */
  buyPart(partId, qty, cash) {
    const p = PARTS[partId];
    if (!p) return null;
    const cost = p.cost * qty;
    if (cash < cost) return null;
    this.parts[partId] = (this.parts[partId] || 0) + qty;
    this.spend += cost;
    this.save();
    return { bought: qty, cost };
  }

  /* Reparation notee par le mini-jeu (quality 0-100).
     `steps` decrit ce qui a ete effectivement traite : une reparation
     de couple ne remet pas le niveau de fluide a niveau, et
     inversement. Sans piece en stock, la qualite est divisee par deux. */
  repair(key, quality, steps) {
    const c = this.components[key];
    if (!c) return null;
    const q = Math.max(0, Math.min(100, quality));
    const s = steps || { wear: true, fluid: true, torque: true };

    /* Consommation de piece : une seule par intervention. */
    let usedPart = false;
    if (c.part && (this.parts[c.part] || 0) > 0) {
      this.parts[c.part]--;
      usedPart = true;
    }
    const eff = usedPart ? q : q * 0.5;

    if (s.wear) c.wear = Math.max(0, c.wear - (5 + eff * 0.95));
    if (s.fluid && c.fluid != null) c.fluid = Math.min(100, c.fluid + 20 + eff * 0.8);
    if (s.torque && c.torque != null) c.torque = Math.min(100, c.torque + 25 + eff * 0.75);

    this._refreshWorkOrders();
    this.releasedToService = !this.needsMaintenance();
    this.save();
    return { wear: c.wear, fluid: c.fluid, torque: c.torque, usedPart, quality: eff };
  }

  /* Signature du carnet de route : autorise le prochain vol si tout est conforme */
  signLogbook() {
    const ok = !this.needsMaintenance();
    this.logbook.push({ date: Date.now(), signed: true, releasedToService: ok });
    this.releasedToService = ok;
    this.save();
    return ok;
  }

  save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        components: this.components,
        parts: this.parts,
        spend: this.spend,
        workOrders: this.workOrders.slice(-60),
        woSeq: this._woSeq,
        logbook: this.logbook.slice(-40)
      }));
    } catch (e) { /* mode navigation privee */ }
  }

  load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.components) {
        for (const k in d.components) {
          if (this.components[k]) Object.assign(this.components[k], d.components[k]);
        }
      }
      if (d.parts) Object.assign(this.parts, d.parts);
      if (typeof d.spend === 'number') this.spend = d.spend;
      if (d.workOrders) this.workOrders = d.workOrders;
      if (typeof d.woSeq === 'number') this._woSeq = d.woSeq;
      if (d.logbook) this.logbook = d.logbook;
      this.releasedToService = !this.needsMaintenance();
    } catch (e) { /* donnees corrompues : on repart a neuf */ }
  }

  static reset() {
    try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
  }
}
