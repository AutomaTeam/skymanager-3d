/* ============================================================
   arcade.js — Couche « Arcade » : le jeu adapte aux enfants

   Un seul but a l'ecran a la fois (objectif + fleche + faisceau
   lumineux), des recompenses immediates (pieces, etoiles, sons,
   confettis), des defis du jour, un niveau d'aeroport. Aucune
   penalite lourde : on ne perd jamais, on gagne plus ou moins.

   Le mode « Pilote » (expert) garde l'ancien jeu intact : tout ce
   qui est ici est inerte quand `on` est faux.

   Unite de monnaie : 1 piece = 1000 EUR de tresorerie. La tresorerie
   du moteur economique (airportTycoon) reste en EUR, seule
   l'affichage et les recompenses passent par les pieces.
   ============================================================ */

import { planeOf } from './fleet.js?v=1791602994';
import { sfx } from './sfx.js?v=1791602994';
export { COIN, SKY_STARS, SKY_ISLANDS, MAP_THEMES, DESTINATIONS, PLAN_TYPES, BADGES } from './arcadeData.js?v=1791602994';
import { mapMethods } from './arcadeMap.js?v=1791602994';
import { challengeMethods } from './arcadeChallenges.js?v=1791602994';
import { funMethods } from './arcadeFun.js?v=1791602994';
import { flightMethods } from './arcadeFlight.js?v=1791602994';
import { MAP_WIN, clamp, $, MAP_THEMES, COIN } from './arcadeData.js?v=1791602994';


const STORE = 'skymanager.arcade';
                        


/* Points de progression du niveau d'aeroport (XP). */
const xpForLevel = (lvl) => 60 + lvl * 40;


                                                    // m devant l'appareil

/* ---------------------------------------------------------- */
/* Tutoriel : chaine d'objectifs                               */
/* ---------------------------------------------------------- */
/* Chaque etape : texte, icone, cible (monde) ou null, condition de fin.
   `g` est le jeu (Game), `a` l'instance Arcade.
   Plan « jeu cool » : on vole tout de suite (etapes 2 a 4), le reste de l'aeroport vient apres. */
const STEPS = [
  {
    id: 'move', icon: '🕹️', reward: 5,
    text: 'Déplace-toi avec le joystick (ou les flèches).',
    target: () => null,
    done: (g, a) => g.state === 'HUB' && a._moved > 10
  },
  {
    id: 'takeoff', icon: '🛫', reward: 20,
    text: 'Monte dans le cockpit, appuie sur DÉCOLLER et pilote !',
    target: (g) => g.arcade.markerPos('cockpit'),
    done: (g, a) => a._stepStats.takeoff >= 1
  },
  {
    id: 'rings', icon: '🟡', reward: 25,
    text: 'Traverse 3 anneaux dorés en volant dedans !',
    target: () => null,
    done: (g, a) => a._stepStats.ring >= 3
  },
  {
    id: 'land', icon: '🛬', reward: 40,
    text: 'Retourne vers la piste (flèche) et atterris. Le bouton ATTERRIR t\'aide !',
    target: () => null,
    done: (g, a) => a._stepStats.landing >= 1
  },
  {
    id: 'repair', icon: '🔧', reward: 10,
    text: 'Répare l\'avion ! Va sur un point coloré et appuie sur le bouton.',
    target: (g) => g.arcade.stationTarget(),
    done: (g, a) => a._stepStats.repair >= 1
  },
  {
    id: 'terminal', icon: '🏢', reward: 10,
    text: 'Entre dans le terminal pour accueillir les passagers.',
    target: (g) => g.arcade.markerPos('terminal'),
    done: (g) => g.inTerminal === true
  },
  {
    id: 'serve', icon: '🧳', reward: 15,
    text: 'Vérifie 3 passagers : billet, bagage, plateau. Lis bien, puis valide ou refuse !',
    target: (g) => g.arcade.counterTarget(),
    done: (g, a) => a._stepStats.serve >= 3
  },
  {
    id: 'tower', icon: '🗼', reward: 15,
    text: 'Va à la tour de contrôle et ouvre le bureau pour agrandir ton aéroport.',
    target: (g) => g.arcade.markerPos('tower'),
    done: (g, a) => a._stepStats.tower >= 1
  }
];
/* Ordre d'avant le plan « jeu cool » (voler venait en dernier) : sert a migrer une sauvegarde en plein tutoriel. */
const OLD_STEP_ORDER = ['move', 'repair', 'terminal', 'serve', 'tower', 'takeoff', 'rings', 'land'];


export const MAP_SIZE = { mini: [480, 462], big: [960, 924] };


           

/* ---------------------------------------------------------- */
/* Missions flash : petites courses chronometrees sur le tarmac  */
/* ---------------------------------------------------------- */
/* Cadeaux de niveau : styles de carte offerts. */
const LEVEL_UNLOCKS = { 3: 'nuit', 5: 'neige', 8: 'bonbon' };
export const nextUnlock = (lvl) => { const k = Object.keys(LEVEL_UNLOCKS).map(Number).find(n => n > lvl); return k ? { level: k, theme: LEVEL_UNLOCKS[k] } : null; };

/* I02 : 30 niveaux, une recompense visible a chaque niveau.
   'livery' = un objet de peinture au hasard (couleur, motif, autocollant) ; 'plane' = un avion offert ;
   'theme' = un style de carte ; 'coins' = pieces en plus des 100 habituelles. Chaque niveau a aussi
   un titre de pilote (TITLES). */
export const MAX_LEVEL = 30;
const PLANE_GIFTS = { 6: 'hydravion', 12: 'zebulon', 18: 'helico', 24: 'plume' };
const BIG_COINS = { 10: 300, 20: 300, 30: 500 };
export const TITLES = [[1, 'Apprenti pilote'], [5, 'Pilote junior'], [10, 'Pilote confirmé'], [15, 'As des airs'], [20, 'Capitaine'], [25, 'Commandant'], [30, 'Légende du ciel']];
export const titleOf = (lvl) => TITLES.filter(t => t[0] <= lvl).pop()[1];
export function rewardKind(lvl) {
  if (lvl > MAX_LEVEL) return null;
  if (LEVEL_UNLOCKS[lvl]) return { kind: 'theme', ico: '🗺️', text: `Carte « ${LEVEL_UNLOCKS[lvl]} »` };
  if (PLANE_GIFTS[lvl]) return { kind: 'plane', ico: '✈️', text: `Un avion offert : ${PLANE_GIFTS[lvl]}` };
  if (BIG_COINS[lvl]) return { kind: 'coins', ico: '💰', text: `${BIG_COINS[lvl]} pièces en plus` };
  return { kind: 'livery', ico: '🎨', text: 'Un objet de peinture surprise' };
}
/* Prochaine recompense apres le niveau `lvl`. */
export function nextReward(lvl) {
  const n = lvl + 1;
  const r = rewardKind(n);
  return r ? Object.assign({ level: n }, r) : null;
}


                 


             

/* Questions des passagers (cabine) : { q, a: [bonne reponse, faux, faux] }. */
export const QUIZ = [
  { q: 'Combien de moteurs a notre avion de ligne ?', a: ['2', '1', '6'] },
  { q: 'Comment s\'appelle l\'endroit ou les avions atterrissent ?', a: ['La piste', 'Le quai', 'La route'] },
  { q: 'De quelle couleur est la « boîte noire » d\'un avion ?', a: ['Orange', 'Noire', 'Bleue'] },
  { q: 'Qui aide le commandant à piloter ?', a: ['Le copilote', 'Le contrôleur', 'Le steward'] },
  { q: 'Que fait la tour de contrôle ?', a: ['Elle guide les avions', 'Elle répare les avions', 'Elle vend les billets'] },
  { q: 'À quoi servent les volets des ailes ?', a: ['À voler doucement', 'À ouvrir les portes', 'À faire du bruit'] },
  { q: 'En quelle unité mesure-t-on l\'altitude d\'un avion ?', a: ['En pieds', 'En bananes', 'En litres'] },
  { q: 'Quel pays a vu voler les frères Wright, en 1903 ?', a: ['Les États-Unis', 'La Chine', 'Le Brésil'] },
  { q: 'Quel oiseau est un grand champion de vol ?', a: ['L\'albatros', 'Le pingouin', 'L\'autruche'] },
  { q: 'Le son voyage à environ...', a: ['1 200 km/h', '100 km/h', '30 km/h'] },
  { q: 'Quel métal sert le plus à fabriquer les avions ?', a: ['L\'aluminium', 'L\'or', 'Le bois'] },
  { q: 'Que veut dire « atterrir » ?', a: ['Se poser sur le sol', 'Décoller', 'Faire demi-tour'] },
  { q: 'Ou se trouve la Tour Eiffel ?', a: ['A Paris', 'A Rome', 'A Londres'] },
  { q: 'Quelle planète est la plus proche du Soleil ?', a: ['Mercure', 'Mars', 'Jupiter'] },
  { q: 'Que met-on quand l\'avion décolle ?', a: ['La ceinture', 'Un chapeau', 'Des palmes'] },
  { q: 'Comment dit-on « aéroport » en anglais ?', a: ['Airport', 'Harbor', 'Station'] },
  { q: 'Combien de minutes dans une heure ?', a: ['60', '100', '30'] },
  { q: 'Quel animal ne sait PAS voler ?', a: ['Le manchot', 'La chauve-souris', 'L\'aigle'] }
];


/* « Le savais-tu ? » : petits faits d'aviation affiches dans le menu pause. */
export const FUN_FACTS = [
  'Un avion de ligne décolle à environ 250 km/h. Plus vite qu\'une voiture de course sur autoroute !',
  'Les pilotes parlent aux tours de contrôle en anglais, partout dans le monde.',
  'La « boîte noire » d\'un avion est en réalité... orange, pour être retrouvée facilement.',
  'Les pistes portent un numéro : c\'est leur direction en degrés, divisée par 10. Piste 36 = plein nord !',
  'Un gros avion peut peser plus de 300 tonnes, autant que 200 voitures.',
  'Les ailes des avions se plient un peu en vol : c\'est fait expres, elles sont souples !',
  'Le plus long vol du monde dure plus de 18 heures sans escale.',
  'Les pompiers d\'aéroport arrivent au bout de la piste en moins de 3 minutes.',
  'Les hublots sont ronds pour que l\'avion ne se fissure pas aux coins.',
  'À 10 000 mètres d\'altitude, il fait environ -50 °C dehors !',
  'Un avion d\'aujourd\'hui peut se poser tout seul, grâce au pilote automatique.',
  'Le manche sert à monter et descendre, le palonnier à tourner la queue de l\'avion.'
];

/* ============================================================ */
export class Arcade {
  constructor(game) {
    this.g = game;
    this.data = this._load();
    this.on = this.data.mode === 'arcade';

    /* Nouvelle partie Arcade : on part avec 200 pieces (et non 2 500) pour que les achats
       de la tour soient un vrai objectif. Une partie deja entamee n'est jamais touchee. */
    if (this.on && !this.data.econ) {
      this.data.econ = 2;
      const t = game.tycoon;
      if (t && t.cash === 2500000 && t.flightsCompleted === 0) { t.cash = 200 * COIN; t.save(); }
      this.save();
    }

    /* Progression du tutoriel : compteurs de l'etape en cours. */
    this._stepStats = { repair: 0, serve: 0, tower: 0, takeoff: 0, ring: 0, landing: 0 };
    this._moved = 0;
    this._lastPos = null;
    this._lastHead = 0;

    /* Anneaux du vol en cours. */
    this.ring = null;                // { x, y, z, yaw }
    this.ringsThisFlight = 0;
    this._ringMissTimer = 0;

    /* Combo : enchainer les actions rapporte des pieces en plus. */
    this.combo = { n: 0, t: 0 };
    /* Plan de vol choisi pour le vol en cours : { dest, type, bonus, t0 } ou null. */
    this.plan = null;
    /* Cabine : objectif de service de la visite en cours. */
    this.cabinSess = null;
    this._cd = {};                       // recharges des gestes (secondes de jeu)
    this._dockScope = '';
    this._prevState = '';
    /* Mission flash en cours (voir QUESTS) et delai avant la prochaine. */
    this.quest = null;
    this._questCd = 40;

    this._beaconKey = '';
    this.applyBodyClass();
    this._ensureDaily();
    this._ensureWeekly();
  }

  /* ---------------- Persistance ---------------- */
  _load() {
    const def = {
      mode: 'arcade', stars: 0, xp: 0, level: 1, step: 0, stepOrder: 2, tutorialDone: false,
      coinsEarned: 0, daily: null, stats: { serve: 0, repair: 0, flights: 0, rings: 0, star3: 0 },
      name: 'Mon aéroport', mapTheme: 'jour', themes: ['jour'], badges: {}, gift: null, treasure: null
    };
    def.stats.treasure = 0; def.stats.treasureDays = 0; def.stats.quests = 0; def.stats.bestCombo = 0;
    for (const k of ['quiz', 'cabinServe', 'announce', 'candy', 'music', 'plans']) def.stats[k] = 0;
    def.visited = [];
    for (const k of ['honk', 'hello', 'party', 'dance', 'selfie']) def.stats[k] = 0;
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || 'null');
      /* Tutoriel en cours avec l'ancien ordre : on retrouve la meme etape dans le nouvel ordre. */
      if (d && !d.tutorialDone && d.stepOrder !== 2 && typeof d.step === 'number') d.step = Math.max(0, STEPS.findIndex(x => x.id === OLD_STEP_ORDER[d.step]));
      if (d) d.stepOrder = 2;
      if (d) return Object.assign(def, d, { stats: Object.assign(def.stats, d.stats || {}), badges: d.badges || {}, themes: d.themes || ['jour'], visited: (d.visited || []).map(c => (c === 'Athenes' ? 'Athènes' : c)) });   // ville renommee avec son accent
    } catch (e) { /* ignore */ }
    return def;
  }
  save() {
    try { localStorage.setItem(STORE, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  }
  static reset() {
    try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
  }

  /* Au premier demarrage l'avion est neuf : on abime 3 pieces pour que
     l'objectif « repare l'avion » ait quelque chose a reparer. */
  seedWear() {
    const m = this.g.mechanic;
    const worn = Object.values(m.components).filter(c => c.wear > 25).length;
    if (worn >= 2) return;
    for (const k of ['tyresMain', 'brakes', 'hydraulics']) {
      const c = m.components[k];
      if (c) c.wear = Math.max(c.wear, 38 + Math.random() * 22);
    }
    if (m._refreshWorkOrders) m._refreshWorkOrders();
    if (m.save) m.save();
  }

  /* ---------------- Mode ---------------- */
  setMode(mode) {
    this.data.mode = mode;
    this.on = mode === 'arcade';
    this.save();
    this.applyBodyClass();
  }
  applyBodyClass() {
    document.body.classList.toggle('arcade', this.on);
  }

  /* ---------------- Pieces, etoiles, niveau ---------------- */
  get coins() { return Math.floor(this.g.tycoon.cash / COIN); }

  /* Donne des pieces (credit reel de la tresorerie) et de l'XP. */
  giveCoins(n, opts = {}) {
    if (!this.on || n <= 0) return;
    const t = this.g.tycoon;
    t.cash += n * COIN;
    t.save();
    this.data.coinsEarned += n;
    this.addXp(n + (opts.xp || 0));
    if (!opts.silent) sfx.coin();
    try { this.coinFly(n); } catch (e) { /* effet visuel seulement */ }
    if (opts.label) this.popup(`+${n} 🪙 ${opts.label}`);
    this.save();
  }

  giveStars(n) {
    if (!this.on || n <= 0) return;
    this.data.stars += n;
    this.addXp(n * 8);
    sfx.star(Math.min(3, n));
    this.save();
  }

  addXp(n) {
    this.data.xp += n;
    let lvl = this.data.level;
    while (this.data.xp >= xpForLevel(lvl)) {
      this.data.xp -= xpForLevel(lvl);
      lvl++;
      this.data.level = lvl;
      this._levelUp(lvl);
    }
  }

  _levelUp(lvl) {
    const g = this.g, t = g.tycoon;
    t.cash += 100 * COIN;
    sfx.levelUp();
    this.confetti(70);
    const r = rewardKind(lvl);
    let line = '';
    if (r) {
      if (r.kind === 'theme') {
        const th = LEVEL_UNLOCKS[lvl];
        if (!this.data.themes.includes(th)) this.data.themes.push(th);
        line = `carte « ${MAP_THEMES[th].name} » débloquée !`;
      } else if (r.kind === 'plane') {
        const id = PLANE_GIFTS[lvl];
        if (!g.hangar.data.planes.includes(id)) { g.hangar.data.planes.push(id); g.hangar.save(); }
        line = `avion « ${planeOf(id).name} » offert ${planeOf(id).ico} !`;
      } else if (r.kind === 'coins') {
        t.cash += BIG_COINS[lvl] * COIN;
        line = `${BIG_COINS[lvl]} pièces en plus !`;
      } else {
        const u = g.hangar.randomUnlock();
        if (u) line = `${u.label} débloqué !`;
        else { t.cash += 50 * COIN; line = '+50 pièces (tu as déjà toute la peinture !)'; }
      }
    }
    t.save();
    const title = TITLES.find(x => x[0] === lvl);
    g.toast(`🎉 NIVEAU ${lvl} ! +100 🪙${line ? ' et ' + line : ''}${title ? ` Nouveau titre : ${title[1]} !` : ''}`, 5600, 'ok');
    /* Plan « jeu cool » : un avion offert ou un nouveau titre merite le grand ecran de fete (montre au sol). */
    if (g.story && ((r && r.kind === 'plane') || title)) {
      const plane = r && r.kind === 'plane' ? planeOf(PLANE_GIFTS[lvl]) : null;
      g.story.celebrate({
        ico: plane ? plane.ico : '🎖️', kicker: `NIVEAU ${lvl} !`,
        title: plane ? `Un nouvel avion : ${plane.name} !` : `Tu es maintenant « ${title[1]} » !`,
        text: plane ? 'Il t\'attend dans ton hangar. Choisis-le avant ton prochain vol !' : 'Ton nouveau titre de pilote est affiché dans le bouton 🏢 GÉRER.',
        gifts: ['+100 🪙'].concat(line ? [line] : [])
      });
    }
    this.save();
  }

  xpProgress() {
    return clamp(this.data.xp / xpForLevel(this.data.level), 0, 1);
  }

  get dailyItems() {
    const items = (this.data.daily && this.data.daily.items) || [];
    const w = this.data.weekly && this.data.weekly.item;
    return w ? items.concat([w]) : items;
  }

  /* ---------------- Objectif courant ---------------- */
  get step() {
    if (this.data.tutorialDone) return null;
    return STEPS[this.data.step] || null;
  }

  /* ---------------- Boucle : mise a jour du HUD arcade ---------------- */
  update(dt) {
    if (!this.on) return;
    const g = this.g;

    /* Distance parcourue (etape « deplace-toi »). */
    const p = g.state === 'HUB' ? g.player.pos : null;
    if (p) {
      if (this._lastPos) {
        this._moved += Math.hypot(p.x - this._lastPos.x, p.z - this._lastPos.z);
        /* Tourner sur place compte aussi (face a un mur, on ne peut pas avancer). */
        this._moved += Math.abs(Math.atan2(Math.sin(g.player.heading - this._lastHead), Math.cos(g.player.heading - this._lastHead))) * 3;
      }
      this._lastPos = { x: p.x, z: p.z };
      this._lastHead = g.player.heading;
    }

    /* Fin d'etape ? */
    const st = this.step;
    if (st && st.done(g, this)) this._completeStep(st);

    const goal = this.currentGoal();
    this._renderBar(goal);
    this._renderMap(goal.target);
    this._renderChips();
    this._renderBeacon(goal.target);
    this._updateTreasure(dt);
    this._updateDance(dt);
    if (!g._worldPaused) { this._updateCombo(dt); this._updateQuest(dt); }
    this._renderFlightHud();
    this._renderPlanChip();
    document.body.classList.toggle('in-term', g.state === 'HUB' && !!g.inTerminal);
    const hb = $('btnHub');
    if (hb) hb.classList.toggle('hidden', g.state === 'BOOT');
    this._updateDock();
    this._updateCabinHud(dt);
    this._badgeT = (this._badgeT || 0) + dt;
    if (this._badgeT > 1) {
      this._badgeT = 0;
      this.checkBadges();
      /* Le jeu peut rester ouvert apres minuit : nouveaux defis sans recharger la page. */
      this._ensureDaily();
      this._ensureWeekly();
    }
  }

  /* Passer l'etape en cours sans recompense. */
  skipStep() {
    if (!this.step) return;
    this.data.step++;
    this._stepStats = { repair: 0, serve: 0, tower: 0, takeoff: 0, ring: 0, landing: 0 };
    this._moved = 0;
    if (this.data.step >= STEPS.length) this.data.tutorialDone = true;
    this._lastText = null;
    this.save();
  }

  _completeStep(st) {
    sfx.ding();
    this.giveCoins(st.reward, { silent: false, label: 'Objectif réussi !' });
    this.confetti(30);
    this.data.step++;
    this._stepStats = { repair: 0, serve: 0, tower: 0, takeoff: 0, ring: 0, landing: 0 };
    this._moved = 0;
    if (this.data.step >= STEPS.length) {
      this.data.tutorialDone = true;
      this.g.toast('🎓 Tutoriel terminé ! Relève les défis du jour pour gagner plus de pièces.', 5000, 'ok');
      this.giveCoins(50, { silent: true });
      sfx.levelUp();
      this.confetti(90);
    }
    this.save();
  }

  /* ---------------- Mini-carte ---------------- */
  /* Fenetre monde de la carte : de la piste aux hangars, du fret au parking. */
  static get MAP() { return MAP_WIN; }

  get theme() { return MAP_THEMES[this.data.mapTheme] || MAP_THEMES.jour; }

  /* ---------------- Petits gestes (menu Fun) ---------------- */
  /* Recharges (secondes de jeu) des gestes qui ont un effet sur le jeu. */
  static get COOLDOWNS() { return { announce: 25, candy: 12, music: 30 }; }

  /* ---------------- Combo ---------------- */
  get comboMult() { return Math.min(5, 1 + Math.floor(this.combo.n / 3)); }

  /* Rejouer le tutoriel depuis le debut (menu pause). */
  restartTutorial() {
    this.data.tutorialDone = false;
    this.data.step = 0;
    this._stepStats = { repair: 0, serve: 0, tower: 0, takeoff: 0, ring: 0, landing: 0 };
    this._moved = 0;
    this._lastText = null;
    this.quest = null;
    this.save();
  }

  /* ---------------- Perso : nom de l'aeroport et style de carte ---------------- */
  setName(n) {
    const v = (n || '').replace(/[<>]/g, '').trim().slice(0, 20);
    this.data.name = v || 'Mon aéroport';
    this.save();
    return this.data.name;
  }
}

/* Methodes deplacees dans des modules : js/arcadeMap.js, js/arcadeChallenges.js, js/arcadeFun.js, js/arcadeFlight.js */
Object.assign(Arcade.prototype, mapMethods, challengeMethods, funMethods, flightMethods);


