/* ============================================================
   cabinService.js — ITERATION 4
   Service en cabine (allee, requetes passagers, duty-free),
   securite (turbulences, passager indiscipline) et satisfaction.

   Nouveautes de cette iteration :
   - 6 types de requetes au lieu de 3, dont deux qui exigent un
     passage au galley (recharge du chariot) avant de pouvoir etre
     servies ;
   - le chariot a une contenance finie : il faut le recharger au
     galley, ce qui cree un aller-retour dans l'allee ;
   - consigne « attachez vos ceintures » : quand elle est active,
     servir un passager non attache coute de la satisfaction ;
   - satisfaction par rangee, pour visualiser les zones delaissees ;
   - le confort du pilotage (iteration 1) alimente toujours la
     satisfaction : turbulences, facteur de charge, poser.
   ============================================================ */

const STORE = 'skymanager.cabin';

export const REQUEST_LABELS = {
  cafe: 'Cafe',
  repas: 'Repas special',
  boisson: 'Boisson fraiche',
  couverture: 'Couverture',
  casque: 'Casque audio',
  medical: 'Assistance medicale',
  /* Mode Arcade : demandes rigolotes. */
  quiz: 'Question de passager',
  bonbon: 'Bonbon',
  ballon: 'Ballon',
  anniv: 'Anniversaire !'
};

/* Emoji affiche dans la bulle au-dessus du siege. */
export const REQUEST_ICONS = {
  cafe: '☕', repas: '🍽️', boisson: '🥤', couverture: '🧣', casque: '🎧', medical: '🩺',
  quiz: '💬', bonbon: '🍬', ballon: '🎈', anniv: '🎂'
};

/* Les requetes « stock » consomment une unite du chariot ; les autres
   sont servies directement depuis l'office. */
export const NEEDS_STOCK = { cafe: true, repas: true, boisson: true, couverture: false, casque: false, medical: false, quiz: false, bonbon: false, ballon: false, anniv: false };
/* Poids de chaque type : les boissons et le cafe sont les plus
   frequents, l'assistance medicale reste rare mais urgente. */
const REQUEST_WEIGHT = { cafe: 26, repas: 14, boisson: 30, couverture: 14, casque: 12, medical: 4 };
/* Arcade : moins de stock a gerer, plus de surprises. */
const ARCADE_WEIGHT = { cafe: 12, repas: 6, boisson: 18, couverture: 8, casque: 8, medical: 2, quiz: 18, bonbon: 10, ballon: 8, anniv: 4 };

const CART_CAPACITY = 12;

export class CabinService {
  constructor() {
    this.rows = 10;             // rangees modelisees dans la scene 3D
    this.seatsPerRow = 6;       // capacite reelle globale (utilisee par le tycoon)
    this.satisfaction = 78;     // 0-100
    this.dutyFreeRevenue = 0;
    this.incidents = [];

    /* Etat de service temps reel (non persiste : remis a zero a chaque entree en cabine) */
    this.requests = [];
    this._nextId = 1;
    this._spawnTimer = 3;
    this.turbulence = { active: false, timeLeft: 0, window: 8 };
    this._turbTimer = 30 + Math.random() * 20;
    this.unruly = null;
    this._unrulyTimer = 35 + Math.random() * 25;

    /* Chariot de service : contenance finie, rechargeable au galley. */
    this.cartStock = CART_CAPACITY;
    this.cartCapacity = CART_CAPACITY;
    this.restocks = 0;

    /* Consigne ceintures : activee par le joueur, elle protege des
       turbulences mais interdit de servir les passagers debout. */
    this.seatbeltSign = false;
    this._seatbeltTimer = 0;

    /* Satisfaction par rangee (1..rows), pour cibler les zones delaissees. */
    this.rowSatisfaction = {};
    for (let r = 1; r <= this.rows; r++) this.rowSatisfaction[r] = 78;

    this.load();
  }

  get paxCapacity() { return 30 * this.seatsPerRow; }

  /* A appeler chaque frame pendant que le joueur est en mode cabine */
  /* `inFlight` faux : l'avion est gare (cabine visitee a la porte), il ne peut pas y avoir de turbulences.
     `crew` vrai : le joueur n'est pas en cabine (il pilote) ; l'equipage s'occupe des demandes et des
     annonces, sans bonus ni penalite. Avant, la satisfaction s'effondrait pendant chaque vol sans que
     le joueur puisse rien y faire. */
  update(dt, inFlight = true, crew = false) {
    /* Requetes passagers */
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0 && this.requests.length < 5) {
      this.spawnRequest();
      this._spawnTimer = 4.5 + Math.random() * 4.5;
    }
    let expiredCount = 0;
    this.requests.forEach(r => { r.timeLeft -= dt; if (r.timeLeft <= 0) expiredCount++; });
    if (expiredCount && crew) {
      this.requests = this.requests.filter(r => r.timeLeft > 0);
    } else if (expiredCount) {
      this.satisfaction = Math.max(this.arcade ? 30 : 0, this.satisfaction - expiredCount * (this.arcade ? 1.5 : 4));   // Arcade : plancher a 30 %
      this.requests.filter(r => r.timeLeft <= 0).forEach(r => this._bumpRow(r.row, -5));
      this.requests = this.requests.filter(r => r.timeLeft > 0);
    }

    /* Turbulences et passager indiscipline : Pilote uniquement. */
    if (this.arcade) this.unruly = null;
    if (!inFlight || (crew && this.turbulence.active)) {
      if (this.turbulence.active) { this.turbulence.active = false; this._turbTimer = 30 + Math.random() * 20; }
    } else if (!this.turbulence.active) {
      this._turbTimer -= dt;
      if (this._turbTimer <= 0) this.triggerTurbulence();
    } else {
      this.turbulence.timeLeft -= dt;
      if (this.turbulence.timeLeft <= 0) this.resolveTurbulence(false);
    }

    /* Passager indiscipline */
    if (!this.arcade && !this.unruly) {
      this._unrulyTimer -= dt;
      if (this._unrulyTimer <= 0) this.spawnUnruly();
    }

    /* La consigne ceintures se relache toute seule au bout d'un moment. */
    if (this.seatbeltSign) {
      this._seatbeltTimer -= dt;
      if (this._seatbeltTimer <= 0) this.seatbeltSign = false;
    }
  }

  _bumpRow(row, delta) {
    if (this.rowSatisfaction[row] == null) return;
    this.rowSatisfaction[row] = Math.max(0, Math.min(100, this.rowSatisfaction[row] + delta));
  }

  spawnRequest() {
    const row = 1 + Math.floor(Math.random() * this.rows);
    const side = Math.random() < 0.5 ? 'L' : 'R';
    if (this.requests.some(r => r.row === row && r.side === side)) return;
    /* Tirage pondere : les boissons arrivent plus souvent que le medical. */
    const W = this.arcade ? ARCADE_WEIGHT : REQUEST_WEIGHT;
    const total = Object.values(W).reduce((a, b) => a + b, 0);
    let pick = Math.random() * total, type = 'boisson';
    for (const k in W) {
      pick -= W[k];
      if (pick <= 0) { type = k; break; }
    }
    /* L'assistance medicale est plus urgente : fenetre plus courte. */
    const window = (type === 'medical' ? 12 : type === 'anniv' ? 30 : 20) * (this.arcade ? 1.8 : 1);
    this.requests.push({ id: this._nextId++, row, side, type, timeLeft: window, maxTime: window });
  }

  /* Sert une requete : plus c'est rapide, meilleure est la satisfaction gagnee.
     Renvoie { gain, reason } ou null si la requete n'existe plus. */
  serve(id) {
    const r = this.requests.find(x => x.id === id);
    if (!r) return null;

    /* Le chariot doit contenir la marchandise demandee. */
    if (NEEDS_STOCK[r.type] && this.cartStock <= 0) {
      return { gain: 0, reason: 'stock' };
    }
    /* Servir debout pendant la consigne ceintures est mal vecu. */
    if (this.seatbeltSign) {
      this.satisfaction = Math.max(0, this.satisfaction - 3);
      this._bumpRow(r.row, -4);
      this.requests = this.requests.filter(x => x.id !== id);
      this.save();
      return { gain: -3, reason: 'seatbelt' };
    }

    if (NEEDS_STOCK[r.type]) this.cartStock--;

    const promptness = Math.max(0, r.timeLeft / r.maxTime);
    /* L'assistance medicale pese plus lourd dans le ressenti. */
    const weight = r.type === 'medical' ? 2.2 : 1;
    const gain = (2 + promptness * 5) * weight;
    this.satisfaction = Math.min(100, this.satisfaction + gain);
    this._bumpRow(r.row, gain * 0.8);
    this.requests = this.requests.filter(x => x.id !== id);
    this.save();
    return { gain, reason: 'ok' };
  }

  /* Recharge le chariot au galley. Renvoie le nombre d'unites ajoutees. */
  restockCart() {
    const added = this.cartCapacity - this.cartStock;
    if (added <= 0) return 0;
    this.cartStock = this.cartCapacity;
    this.restocks++;
    this.satisfaction = Math.min(100, this.satisfaction + 0.5);
    this.save();
    return added;
  }

  /* Consigne « attachez vos ceintures ». Protege des turbulences mais
     empeche de servir. */
  toggleSeatbeltSign() {
    this.seatbeltSign = !this.seatbeltSign;
    this._seatbeltTimer = this.seatbeltSign ? 45 : 0;
    return this.seatbeltSign;
  }

  triggerTurbulence() {
    const w = this.arcade ? 12 : 8;
    this.turbulence = { active: true, timeLeft: w, window: w };
  }

  /* Le joueur fait un geste (annonce, bonbons, musique...) : bonus de satisfaction sur toute la cabine. */
  boost(n, rowsAlso = 0) {
    this.satisfaction = Math.min(100, this.satisfaction + n);
    for (const r in this.rowSatisfaction) this._bumpRow(+r, n + rowsAlso);
    this.save();
  }

  /* announced=true si le joueur a fait l'annonce a temps */
  resolveTurbulence(announced) {
    if (announced) this.satisfaction = Math.min(100, this.satisfaction + 3);
    else this.satisfaction = Math.max(0, this.satisfaction - (this.arcade ? 5 : 14));
    this.turbulence.active = false;
    this._turbTimer = (45 + Math.random() * 35) * (this.arcade ? 1.3 : 1);
    this.save();
    return announced;
  }

  spawnUnruly() {
    const row = 1 + Math.floor(Math.random() * this.rows);
    const side = Math.random() < 0.5 ? 'L' : 'R';
    this.unruly = { row, side };
  }

  /* choice: 'calm' (apaiser soi-meme) ou 'captain' (appeler le commandant) */
  resolveUnruly(choice) {
    if (choice === 'calm') {
      this.satisfaction = Math.min(100, this.satisfaction + 3);
      this._bumpRow(this.unruly.row, 4);
    } else {
      this.satisfaction = Math.max(0, this.satisfaction - 2);   // resolu mais tension a bord
      this._bumpRow(this.unruly.row, -3);
    }
    this.incidents.push({ date: Date.now(), row: this.unruly.row, choice });
    this.unruly = null;
    this._unrulyTimer = 50 + Math.random() * 30;
    this.save();
  }

  sellDutyFree() {
    const amount = Math.round(30 + Math.random() * 90);
    this.dutyFreeRevenue += amount;
    this.satisfaction = Math.min(100, this.satisfaction + 0.5);
    this.save();
    return amount;
  }

  /* Rangee la moins bien notee : sert a guider le joueur dans l'allee. */
  worstRow() {
    let worst = 1, val = 101;
    for (const r in this.rowSatisfaction) {
      if (this.rowSatisfaction[r] < val) { val = this.rowSatisfaction[r]; worst = Number(r); }
    }
    return { row: worst, value: val };
  }

  /* Impact du pilotage (poser, G, survitesse) sur le ressenti cabine, a l'atterrissage */
  registerFlight(ac) {
    let delta = 4;                                    // vol nominal : leger gain
    const fpm = ac.touchdown ? ac.touchdown.fpm : 0;

    if (fpm < 120) delta += 6;
    else if (fpm < 250) delta += 2;
    else if (fpm < 450) delta -= 6;
    else delta -= 16;

    delta -= ac.stress.overG * 8;
    delta -= ac.stress.overspeed * 4;
    if (ac.crashed) delta -= 45;

    this.satisfaction = Math.max(0, Math.min(100, this.satisfaction + delta));

    /* Recette annexe : proportionnelle a la satisfaction */
    const sales = Math.round(this.paxCapacity * 0.18 * (this.satisfaction / 100) * 14);
    this.dutyFreeRevenue += sales;
    this.lastSales = sales;
    this.save();
    return { delta, sales };
  }

  status() {
    return `Satisfaction passagers ${this.satisfaction.toFixed(0)}% — duty-free cumule ${this.dutyFreeRevenue.toLocaleString('fr-FR')} EUR`;
  }

  save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        satisfaction: this.satisfaction,
        dutyFreeRevenue: this.dutyFreeRevenue
      }));
    } catch (e) { /* ignore */ }
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || '{}');
      if (typeof d.satisfaction === 'number') this.satisfaction = d.satisfaction;
      if (typeof d.dutyFreeRevenue === 'number') this.dutyFreeRevenue = d.dutyFreeRevenue;
    } catch (e) { /* ignore */ }
  }

        static reset() {
          try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
        }
      }
