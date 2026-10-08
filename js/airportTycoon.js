/* ============================================================
   airportTycoon.js — ITERATION 4
   Economie de la compagnie, infrastructures, flotte, reputation.
   Ferme la boucle du jeu : Vol -> Atterrissage -> Maintenance ->
   Gestion -> Nouveau vol. Chaque vol termine (iteration 1) credite
   ou debite la tresorerie ici ; les decisions prises ici (prix du
   billet, infrastructures, flotte) modifient la recette du
   prochain vol.
   ============================================================ */

const STORE = 'skymanager.tycoon';

/* Ameliorations disponibles. `baseCost` est le cout du 1er niveau ;
   chaque niveau supplementaire coute baseCost * growth^niveauActuel.
   `once` = achat unique (booleen) plutot qu'un niveau croissant. */
export const UPGRADES = {
  runways:  { label: 'Piste supplementaire', baseCost: 2200000, growth: 1.7, max: 3,
              desc: 'Augmente la capacite de trafic et l\'attractivite de l\'aeroport.' },
  gates:    { label: 'Porte d\'embarquement', baseCost: 550000, growth: 1.45, max: 12,
              desc: 'Necessaire pour accueillir chaque appareil supplementaire de la flotte.' },
  terminals: { label: 'Extension terminal', baseCost: 3200000, growth: 1.8, max: 3,
              desc: 'Ameliore le confort passagers et la recette des boutiques.' },
  shops:    { label: 'Boutique / restauration', baseCost: 280000, growth: 1.35, max: 8,
              desc: 'Genere un revenu passif supplementaire a chaque vol.' },
  vipLounge: { label: 'Salon VIP', baseCost: 1400000, once: true,
              desc: 'Ameliore durablement la reputation de la compagnie (+8).' }
};

/* Niveaux de depart des infrastructures (voir le constructeur). */
const START_LEVEL = { runways: 1, gates: 4, terminals: 1, shops: 2 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* Mode Arcade : recettes triplees, couts forfaitaires (pas de carburant au
   kilo ni de redevances), pas de faillite possible. */
const ARCADE_INCOME = 3;
const ARCADE_COSTS = 1500;

/* Mode Arcade : prix en pieces (1 piece = 1000 EUR) a la portee d'un enfant. Avant, la tour
   reprenait les prix du mode Pilote (un avion a 9 500 pieces pour ~60 pieces par vol). */
const KID_COST = { runways: 260, gates: 70, terminals: 380, shops: 40, vipLounge: 180 };
const KID_AIRCRAFT = 300;        // phase 61 : 350 -> 300 (tools/economy.sim.mjs : tour complete en ~3 h 30)
/* Chaque avion en plus vole tout seul et rapporte des pieces chaque minute (main.js). */
export const KID_FLEET_PER_MIN = 2;

export class AirportTycoon {
  constructor() {
    this.cash = 2500000;
    this.reputation = 62;        // 0-100
    this.flightsCompleted = 0;
    this.ticketPrice = 185;      // EUR
    this.fuelPrice = 0.82;       // EUR/kg

    this.infrastructure = {
      runways: 1,
      gates: 4,
      terminals: 1,
      vipLounge: false,
      shops: 2
    };
    this.fleet = [{ type: 'A320neo', hours: 0 }];
    this.load();
  }

  /* Demande passagers : penalisee par un billet trop cher, dopee par la reputation
     et les infrastructures (pistes/terminal = plus de trafic accueilli). */
  get paxPerFlight() {
    const base = 180 * (0.55 + 0.45 * this.reputation / 100);
    const infraBonus = 1 + (this.infrastructure.runways - 1) * 0.12 + (this.infrastructure.terminals - 1) * 0.06;
    const priceFactor = clamp(1 - (this.ticketPrice - 150) / 500, 0.5, 1.2);
    return Math.max(20, Math.round(base * infraBonus * priceFactor));
  }

  /* Cout du prochain niveau d'une amelioration (ou cout fixe si achat unique).
     Le niveau de depart (1 pour runways/terminals, 4 pour gates, 2 pour shops)
     compte comme deja "achete" : le cout suit toujours baseCost * growth^(niveau-1). */
  upgradeCost(key) {
    const u = UPGRADES[key];
    if (!u) return Infinity;
    const base = this.arcade ? KID_COST[key] * 1000 : u.baseCost;
    if (u.once) return this.infrastructure[key] ? null : base;
    const level = this.infrastructure[key];
    if (level >= u.max) return null;
    /* Arcade : le niveau de depart est gratuit, le premier achat coute le prix de base. */
    const bought = level - START_LEVEL[key];
    return Math.round(base * Math.pow(u.growth, this.arcade ? Math.max(0, bought) : level - 1));
  }

  canBuy(key) {
    const cost = this.upgradeCost(key);
    return cost != null && this.cash >= cost;
  }

  buyUpgrade(key) {
    const cost = this.upgradeCost(key);
    if (cost == null || this.cash < cost) return false;
    this.cash -= cost;
    const u = UPGRADES[key];
    if (u.once) {
      this.infrastructure[key] = true;
      if (key === 'vipLounge') this.reputation = Math.min(100, this.reputation + 8);
    } else {
      this.infrastructure[key] += 1;
      if (key === 'runways' || key === 'terminals') this.reputation = Math.min(100, this.reputation + 2);
    }
    this.save();
    return true;
  }

  /* Cout d'un nouvel appareil : croit avec la taille de la flotte, plafonne par le nombre de portes */
  aircraftCost() {
    return Math.round((this.arcade ? KID_AIRCRAFT * 1000 : 9500000) * Math.pow(1.35, this.fleet.length - 1));
  }
  canBuyAircraft() {
    return this.fleet.length < this.infrastructure.gates && this.cash >= this.aircraftCost();
  }
  buyAircraft() {
    if (!this.canBuyAircraft()) return false;
    this.cash -= this.aircraftCost();
    this.fleet.push({ type: 'A320neo', hours: 0 });
    this.save();
    return true;
  }

  setTicketPrice(delta) {
    this.ticketPrice = clamp(this.ticketPrice + delta, 80, 400);
    this.save();
  }

  /* ----------------------------------------------------------
     Carburant (phase 12).

     Jusqu'ici le carburant etait gratuit : `fuelPrice` ne servait
     qu'a la ligne de cout du rapport, apres coup. Le plein devient
     une decision : on paie au kilo, et un vol economique se voit
     immediatement dans la tresorerie.
     ---------------------------------------------------------- */

  /* Cout d'un appoint de `kg` kilos. */
  fuelCost(kg) {
    return Math.max(0, kg) * this.fuelPrice;
  }

  /* Remplit l'appareil jusqu'a `target` kilos, dans la limite de la
     tresorerie disponible. Rend { kg, cost } ou null si rien n'a pu
     etre achete. */
  refuel(ac, target = null) {
    const want = (target == null ? ac.fuelCap : target) - ac.fuel;
    if (want <= 0.5) return null;
    const affordable = Math.floor(this.cash / this.fuelPrice);
    const kg = Math.min(want, affordable);
    if (kg <= 0.5) return null;
    const cost = this.fuelCost(kg);
    this.cash -= cost;
    ac.fuel += kg;
    this.save();
    return { kg, cost };
  }

  /* ----------------------------------------------------------
     Facture de remise en etat apres un crash (phase 12).

     Un crash ne coutait que de la reputation. Il coute desormais
     de l'argent : structure, trains, reacteurs. Le montant suit
     la gravite (facteur de charge et vitesse au toucher) et
     l'usure deja accumulee, donc un appareil deja fatigue coute
     plus cher a remettre en ligne.
     ---------------------------------------------------------- */
  crashCost(ac, mechanic) {
    let base = 850000;
    if (ac && ac.touchdown) {
      base += Math.min(1.2e6, Math.max(0, ac.touchdown.fpm - 900) * 900);
      base += Math.min(4e5, Math.abs(ac.touchdown.bank) * 45000);
    }
    if (mechanic) {
      const worst = Object.values(mechanic.components).sort((a, b) => b.wear - a.wear)[0];
      if (worst) base += worst.wear * 6000;
    }
    return Math.round(base);
  }

  /* Applique la facture. La tresorerie peut passer negative : c'est
     volontaire, la compagnie s'endette et doit se refaire. */
  chargeCrash(amount) {
    this.cash -= amount;
    this.save();
    return this.cash;
  }

  /* ----------------------------------------------------------
     Niveau de compagnie (phase 12).

     Donne un cap lisible a la progression : reputation, vols
     effectues et infrastructures se combinent en un seul chiffre,
     avec un palier suivant a atteindre. C'est ce qui donne un but
     aux ameliorations au-dela du seul revenu.
     ---------------------------------------------------------- */
  get companyScore() {
    const infra = this.infrastructure.runways + this.infrastructure.terminals
      + this.infrastructure.gates / 4 + this.infrastructure.shops / 2
      + (this.infrastructure.vipLounge ? 2 : 0);
    return this.reputation * 0.5 + this.flightsCompleted * 1.2 + infra * 6;
  }

  get companyLevel() {
    return 1 + Math.floor(this.companyScore / 60);
  }

  /* Palier suivant : score a atteindre et recompense. */
  nextLevel() {
    const need = this.companyLevel * 60;
    return { level: this.companyLevel + 1, need, score: this.companyScore };
  }

  /* ----------------------------------------------------------
     Apercu du prochain vol (amelioration gestion/lisibilite).

     Reprend exactement le calcul de `registerFlight` mais sans
     rien modifier : sert a afficher dans le tableau de bord l'effet
     immediat d'un changement de prix ou d'une infrastructure,
     avant meme de decoller.
     ---------------------------------------------------------- */
  /* `boardedSinceFlight` (passager reellement montes a la porte du
     terminal, voir TerminalSystem.consumeBoardedSinceFlight) plafonne
     la demande theorique : on ne facture pas des billets a des gens
     qui ne sont jamais montes a bord. Absent ou nul (le joueur vient
     de commencer, ou le terminal n'a pas encore eu le temps de tourner),
     on retombe sur la demande theorique seule, comme avant ce correctif. */
  /* `incomeMul` : rendement de l'avion du vol (fleet.js, `income`) ; un petit avion
     rapporte moins que le jet de ligne. Il s'applique a la recette passagers. */
  estimateFlight(ac, boardedSinceFlight = null, incomeMul = 1) {
    const demand = this.paxPerFlight;
    const pax = this._flightPax(demand, boardedSinceFlight);
    const ticketRevenue = pax * this.ticketPrice * (this.arcade ? ARCADE_INCOME : 1);
    const shopBonus = this._shopBonus();
    const passiveFleet = this.arcade ? 0 : (this.fleet.length - 1) * 9500;     // Arcade : verse chaque minute (main.js)
    const fuelBurn = Math.max(0, 9000 - (ac ? ac.fuel : 0));
    const upkeep = this.infrastructure.gates * 350 + this.infrastructure.runways * 1800
      + this.infrastructure.terminals * 2200 + (this.infrastructure.vipLounge ? 900 : 0);
    const costs = this.arcade ? ARCADE_COSTS : fuelBurn * this.fuelPrice + 9500 + upkeep;
    const revenue = ticketRevenue * shopBonus * incomeMul + passiveFleet;
    return {
      pax, demand, cappedByTerminal: pax < demand,
      ticketRevenue, shopBonus, passiveFleet, fuelBurn, upkeep, costs, revenue, profit: revenue - costs
    };
  }

  /* Bonus des boutiques et du terminal sur la recette. En Arcade, une boutique se sent davantage. */
  _shopBonus() {
    const k = this.arcade ? 2 : 1;
    return 1 + this.infrastructure.shops * 0.10 * k + (this.infrastructure.terminals - 1) * 0.15 * k;
  }

  /* Passagers du vol. Mode Pilote : demande theorique plafonnee par ce qui
     a reellement embarque. Arcade : un socle de passagers, plus 6 par
     personne embarquee au terminal (chaque client represente un groupe). */
  _flightPax(demand, boarded) {
    if (this.arcade) {
      /* Chaque achat de la tour se voit au vol suivant : piste, terminal et salon VIP amenent du monde. */
      const inf = this.infrastructure;
      const base = 40 + (inf.runways - 1) * 12 + (inf.terminals - 1) * 10 + (inf.vipLounge ? 10 : 0);
      /* Le prix du billet compte aussi en Arcade : pas cher = plus de passagers, luxe = moins
         (sans cela, « Luxe » etait toujours le meilleur choix). */
      const priceK = clamp(1 - (this.ticketPrice - 185) / 300, 0.6, 1.3);
      return Math.min(demand, Math.round((base + Math.max(0, boarded || 0) * 6) * priceK));
    }
    return boarded > 0 ? Math.min(demand, boarded) : demand;
  }

  /* Vol termine (appele depuis le rapport d'atterrissage de l'iteration 1) */
  registerFlight(ac, quality, boardedSinceFlight = null, incomeMul = 1) {
    const demand = this.paxPerFlight;
    const pax = this._flightPax(demand, boardedSinceFlight);
    const ticketRevenue = pax * this.ticketPrice * (this.arcade ? ARCADE_INCOME : 1);
    const shopBonus = this._shopBonus();

    /* Le reste de la flotte continue de voler en arriere-plan pendant ce temps */
    const passiveFleet = this.arcade ? 0 : (this.fleet.length - 1) * (7000 + Math.random() * 5000);

    const fuelBurn = Math.max(0, 9000 - ac.fuel);
    const upkeep = this.infrastructure.gates * 350 + this.infrastructure.runways * 1800
      + this.infrastructure.terminals * 2200 + (this.infrastructure.vipLounge ? 900 : 0);
    const costs = this.arcade ? ARCADE_COSTS : fuelBurn * this.fuelPrice + 9500 + upkeep;

    const revenue = ticketRevenue * shopBonus * incomeMul + passiveFleet;

    let repDelta = 2;
    if (this.arcade) {
      /* Arcade : la reputation ne fait que monter. */
      if (quality.fpm < 230) repDelta += 2;
    } else {
      if (quality.fpm > 450) repDelta -= 5;
      else if (quality.fpm < 150) repDelta += 3;
      if (ac.crashed) repDelta -= 30;
    }

    this.cash += revenue - costs;
    this.reputation = Math.max(0, Math.min(100, this.reputation + repDelta));
    this.flightsCompleted++;
    this.fleet[0].hours += 1.5;

    this.lastFlight = {
      pax, demand, cappedByTerminal: pax < demand,
      revenue, costs, profit: revenue - costs, repDelta, passiveFleet
    };
    this.save();
    return this.lastFlight;
  }

  status() {
    const c = (this.cash / 1e6).toFixed(2);
    return `Tresorerie ${c} M EUR — reputation ${this.reputation.toFixed(0)}% — ${this.flightsCompleted} vol(s)`;
  }

  /* Revenu passif de la flotte, credite en continu par la boucle du monde.
     Les appareils autres que celui qu'on pilote volent pour nous : c'est
     la meme formule que `passiveFleet` dans registerFlight, mais ramenee
     a la seconde pour pouvoir etre versee en continu. */
  creditPassiveFleet(seconds) {
    const others = this.fleet.length - 1;
    if (others <= 0) return 0;
    const perFlight = others * (7000 + Math.random() * 5000);
    const gain = perFlight * (seconds / 5400);   // ~1,5 h de vol par rotation
    this.cash += gain;
    this.save();
    return gain;
  }

  save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        cash: this.cash, reputation: this.reputation,
        flightsCompleted: this.flightsCompleted, ticketPrice: this.ticketPrice,
        infrastructure: this.infrastructure, fleet: this.fleet,
        lastFlight: this.lastFlight
      }));
    } catch (e) { /* ignore */ }
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || '{}');
      if (typeof d.cash === 'number') this.cash = d.cash;
      if (typeof d.reputation === 'number') this.reputation = d.reputation;
      if (typeof d.flightsCompleted === 'number') this.flightsCompleted = d.flightsCompleted;
      if (typeof d.ticketPrice === 'number') this.ticketPrice = d.ticketPrice;
      if (d.infrastructure) Object.assign(this.infrastructure, d.infrastructure);
      if (d.fleet) this.fleet = d.fleet;
      if (d.lastFlight) this.lastFlight = d.lastFlight;
    } catch (e) { /* ignore */ }
  }

  /* Efface toute la progression (bouton du menu pause). */
  static reset() {
    try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
  }
}
