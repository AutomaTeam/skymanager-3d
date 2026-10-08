/* ============================================================
   arcadeData.js — constantes et petits utilitaires partages
   (decoupe de arcade.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import { LAYOUT } from './layout.js?v=1791468807';
import { iconify } from './icons.js?v=1791468807';

export const COIN = 1000;

// EUR par piece

export const $ = (id) => document.getElementById(id);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* Collections du ciel qui ne se trouvent qu'une fois (voir openWorld.js : _starPositions, ISLANDS). */
export const SKY_STARS = 40;

export const SKY_ISLANDS = 6;

/* Anneaux d'un vol. */
export const RING_TOTAL = 5;

export const RING_RADIUS = 58;

// m, rayon de capture (anneau visible : 52 m)
export const RING_AHEAD = 620;

/* ---------------------------------------------------------- */
/* Defis du jour                                               */
/* ---------------------------------------------------------- */
export const DAILY_POOL = [
  { id: 'serve',  ev: 'serve',      icon: '🧳', text: (n) => `Verifie ${n} passagers au terminal`, min: 6, max: 12, reward: 20 },
  { id: 'restock', ev: 'restock',   icon: '📦', text: (n) => `Recharge ${n} machine${n > 1 ? 's' : ''} avec une caisse`, min: 2, max: 4, reward: 25 },
  { id: 'bags',   ev: 'bag',        icon: '🧳', text: (n) => `Charge ${n} bagages dans l'avion`, min: 6, max: 12, reward: 20 },
  { id: 'repair', ev: 'repair',     icon: '🔧', text: (n) => `Repare ${n} pieces de l'avion`,          min: 2, max: 4,  reward: 20 },
  { id: 'flight', ev: 'landing',    icon: '✈️', text: (n) => `Fais ${n} vol${n > 1 ? 's' : ''} complet${n > 1 ? 's' : ''}`, min: 1, max: 2, reward: 30 },
  { id: 'plan',   ev: 'plan',       icon: '🌍', text: () => 'Reussis un defi de vol (plan de vol)',   min: 1, max: 1,  reward: 30 },
  { id: 'star3',  ev: 'star3',      icon: '⭐', text: () => 'Reussis un atterrissage 3 etoiles',        min: 1, max: 1,  reward: 40 },
  { id: 'rings',  ev: 'ring',       icon: '🟡', text: (n) => `Traverse ${n} anneaux dores`,            min: 6, max: 10, reward: 25 },
  { id: 'cabin',  ev: 'cabinServe', icon: '🥤', text: (n) => `Sers ${n} passagers en cabine`,          min: 4, max: 8,  reward: 20 },
  { id: 'buy',    ev: 'buy',        icon: '🛍️', text: () => 'Achete une amelioration a la tour',       min: 1, max: 1,  reward: 25 },
  { id: 'stunt',  ev: 'stunt',      icon: '🌀', text: (n) => `Fais ${n} acrobaties (tonneau ou looping)`, min: 3, max: 6, reward: 30 },
  { id: 'mission', ev: 'mission',   icon: '🎯', text: (n) => `Termine ${n} mission${n > 1 ? 's' : ''} aerienne${n > 1 ? 's' : ''}`, min: 1, max: 2, reward: 35 },
  { id: 'secret', ev: 'secret',     icon: '🌠', text: (n) => `Trouve ${n} etoiles filantes dans le ciel`, min: 2, max: 4, reward: 30 },
  { id: 'minigame', ev: 'minigame', icon: '🧽', text: (n) => `Joue a ${n} mini-jeux`,                  min: 2, max: 3, reward: 25 },
  { id: 'photo',  ev: 'photo',      icon: '📸', text: () => 'Prends une photo (carte postale en vol ou selfie 🎈 → 📸)', min: 1, max: 1, reward: 20 },
  { id: 'tug',    ev: 'tugTrip',    icon: '🚜', text: (n) => `Livre ${n} chargement${n > 1 ? 's' : ''} de valises avec le tracteur`, min: 1, max: 3, reward: 25 },
  { id: 'bus',    ev: 'busTrip',    icon: '🚌', text: (n) => `Conduis ${n} fois les passagers en bus jusqu'a l'avion`, min: 1, max: 2, reward: 25 },
  { id: 'greet',  ev: 'greet',      icon: '👋', text: (n) => `Dis bonjour a ${n} personnes de l'aeroport`, min: 4, max: 8, reward: 15 },
  { id: 'fetch',  ev: 'fetch',      icon: '🎾', text: (n) => `Joue ${n} fois a la balle avec ton chien`, min: 3, max: 5, reward: 15 }
];

/* Defis de la semaine : un objectif plus long, qui rapporte gros. */
export const WEEKLY_POOL = [
  { id: 'wstars',   ev: 'secret',   icon: '🌠', text: (n) => `Trouve ${n} etoiles filantes`,            target: [8, 12],  reward: 120 },
  { id: 'wmission', ev: 'mission',  icon: '🏅', text: (n) => `Termine ${n} missions aeriennes`,       target: [5, 8],   reward: 130 },
  { id: 'wstunt',   ev: 'stunt',    icon: '🌀', text: (n) => `Fais ${n} acrobaties`,                  target: [25, 40], reward: 120 },
  { id: 'wstar3',   ev: 'star3',    icon: '💎', text: (n) => `Reussis ${n} atterrissages parfaits`,   target: [3, 5],   reward: 130 },
  { id: 'wmini',    ev: 'minigame', icon: '🎮', text: (n) => `Joue a ${n} mini-jeux`,                 target: [10, 15], reward: 100 },
  { id: 'wfire',    ev: 'fire',     icon: '🚒', text: (n) => `Eteins ${n} feux avec le camion de pompiers`, target: [2, 3], reward: 110 },
  { id: 'wdoudou',  ev: 'doudou',   icon: '🐰', text: (n) => `Rapporte ${n} doudous perdus`,         target: [2, 3],   reward: 100 },
  { id: 'wgreet',   ev: 'greet',    icon: '👋', text: (n) => `Dis bonjour a ${n} personnes`,          target: [20, 30], reward: 90 },
  { id: 'wisland',  ev: 'island',   icon: '🏝️', text: (n) => `Decouvre ${n} nouvelle${n > 1 ? 's' : ''} ile${n > 1 ? 's' : ''}`, target: [2, 3], reward: 110 }
];

export const weekKey = () => {
  const d = new Date();
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t - y0) / 86400000 + 1) / 7)}`;
};

export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/* Petit generateur pseudo-aleatoire deterministe (meme defis toute la journee). */
export function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

/* ---------------------------------------------------------- */
/* Mini-carte : fenetre, styles, lieux                         */
/* ---------------------------------------------------------- */
export const MAP_WIN = { x0: -80, x1: 690, z0: 770, z1: 1510 };

/* Vue « aeroport entier » : toute la piste (3 000 m) sur un canevas en hauteur. */
export const MAP_FULL = { x0: -502, x1: 1103, z0: -1565, z1: 1525 };

export const BIG_CANVAS = { complex: [960, 924], full: [640, 1232] };

/* Styles de carte : le premier est gratuit, les autres s'achetent (en pieces). */
export const MAP_THEMES = {
  jour:   { name: 'Jour',   ico: '☀️', cost: 0,  grass: '#4a8f43', grass2: '#54a04c', runway: '#2f3744', edge: '#e5e7eb', mark: '#f8fafc', taxi: '#4b5563', taxiLine: '#facc15', apron: '#6b7280', road: '#4b5563', park: '#8a9098', cargo: '#94a3b8', cargoLine: '#e2e8f0', hangar: '#c2620c', hangarLine: '#fbbf24', term: '#dbe4ee', termLine: '#38bdf8', tree: '#2f6f36', treeShade: 'rgba(0,0,0,0.22)' },
  nuit:   { name: 'Nuit',   ico: '🌙', cost: 20, grass: '#1e3a3a', grass2: '#244646', runway: '#0f172a', edge: '#7dd3fc', mark: '#bae6fd', taxi: '#1e293b', taxiLine: '#38bdf8', apron: '#334155', road: '#1e293b', park: '#475569', cargo: '#475569', cargoLine: '#94a3b8', hangar: '#7c3a0a', hangarLine: '#f59e0b', term: '#94a3b8', termLine: '#22d3ee', tree: '#14532d', treeShade: 'rgba(0,0,0,0.35)' },
  neige:  { name: 'Neige',  ico: '❄️', cost: 40, grass: '#e8f1f8', grass2: '#f7fbff', runway: '#64748b', edge: '#ffffff', mark: '#ffffff', taxi: '#8391a3', taxiLine: '#facc15', apron: '#94a3b8', road: '#7b8898', park: '#a8b4c2', cargo: '#b6c2d0', cargoLine: '#ffffff', hangar: '#dc7a2b', hangarLine: '#fde68a', term: '#ffffff', termLine: '#38bdf8', tree: '#3b7a57', treeShade: 'rgba(30,58,90,0.25)' },
  bonbon: { name: 'Bonbon', ico: '🍬', cost: 60, grass: '#f9a8d4', grass2: '#fbcfe8', runway: '#6d28d9', edge: '#fde047', mark: '#ffffff', taxi: '#8b5cf6', taxiLine: '#fde047', apron: '#a78bfa', road: '#7c3aed', park: '#c4b5fd', cargo: '#67e8f9', cargoLine: '#ffffff', hangar: '#fb923c', hangarLine: '#fef08a', term: '#fef9c3', termLine: '#f472b6', tree: '#22c55e', treeShade: 'rgba(80,0,60,0.2)' }
};

/* Lieux nommes (le premier qui contient le point gagne) : sert au bandeau « Tu es ici ». */
export let _places = null;

export function placeList() {
  if (_places) return _places;
  const L = LAYOUT, r = (x0, x1, z0, z1) => ({ x0, x1, z0, z1 });
  const t = L.tower;
  _places = [
    { name: 'Terminal', ico: '🏢', rect: L.terminal },
    { name: 'Tour de controle', ico: '🗼', rect: r(t.x - 26, t.x + 32, t.z - 26, t.z + 26) },
    ...L.hangars.map((h, i) => ({ name: `Hangar ${i + 1}`, ico: '🔧', rect: h })),
    { name: 'Pompiers', ico: '🚒', rect: r(L.fireApron.x0, L.fireStation.x1, L.fireApron.z0, L.fireStation.z1) },
    { name: 'Heliport', ico: '🚁', rect: r(L.helipad.x - 18, L.helipad.x + 18, L.helipad.z - 18, L.helipad.z + 18) },
    { name: 'Carburant', ico: '⛽', rect: r(580, 645, 785, 835) },
    { name: 'Fret', ico: '📦', rect: L.cargo },
    { name: 'Parking', ico: '🅿️', rect: L.parking },
    { name: 'Aire des avions', ico: '🅰️', rect: L.apron },
    { name: 'Route', ico: '🛣️', rect: r(L.road.x0, L.road.x1, L.road.z - 9, L.road.z + 9) },
    { name: 'Entree', ico: '🚪', rect: r(L.entrance.x - 12, L.entrance.x + 12, L.entrance.z0, L.entrance.z1) },
    { name: 'Piste', ico: '🛬', rect: r(L.runway.x - 26, L.runway.x + 26, -9999, 9999) },
    { name: 'Voie de circulation', ico: '🚕', rect: r(L.taxiway.x - 15, L.taxiway.x + 15, -9999, 9999) }
  ];
  return _places;
}

export function roundRectPath(x, a, b, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  x.beginPath();
  x.moveTo(a + r, b);
  x.arcTo(a + w, b, a + w, b + h, r);
  x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r);
  x.arcTo(a, b, a + w, b, r);
  x.closePath();
}

/* Silhouette d'avion vue de dessus, nez dans la direction `ang` (0 = vers le bas de la carte / sud). */
export function drawPlane(x, cx, cy, ang, s, fill, stroke, k = 1) {
  x.save();
  x.translate(cx, cy);
  x.rotate(-ang);                 // le repere carte a z vers le bas : nez vers +z a ang 0
  x.rotate(Math.PI);              // dessin construit nez vers le haut
  x.fillStyle = fill; x.strokeStyle = stroke; x.lineWidth = 1.6 * k; x.lineJoin = 'round';
  x.beginPath();
  x.moveTo(0, -s);
  x.lineTo(s * 0.16, -s * 0.35);
  x.lineTo(s * 0.95, s * 0.12);
  x.lineTo(s * 0.95, s * 0.3);
  x.lineTo(s * 0.16, s * 0.12);
  x.lineTo(s * 0.13, s * 0.62);
  x.lineTo(s * 0.45, s * 0.86);
  x.lineTo(s * 0.45, s);
  x.lineTo(0, s * 0.88);
  x.lineTo(-s * 0.45, s);
  x.lineTo(-s * 0.45, s * 0.86);
  x.lineTo(-s * 0.13, s * 0.62);
  x.lineTo(-s * 0.16, s * 0.12);
  x.lineTo(-s * 0.95, s * 0.3);
  x.lineTo(-s * 0.95, s * 0.12);
  x.lineTo(-s * 0.16, -s * 0.35);
  x.closePath();
  x.fill(); x.stroke();
  x.restore();
}

/* ---------------------------------------------------------- */
/* Chasse aux pieces cachees                                   */
/* ---------------------------------------------------------- */
export const TREASURE_COUNT = 8;

export const TREASURE_RADAR = 140;

// m : les pieces plus proches apparaissent sur la carte
export const TREASURE_SPOTS = [
  [300, 1160], [440, 1150], [210, 1000], [330, 915], [500, 905], [120, 1100], [95, 1245], [30, 1300],
  [-45, 1050], [100, 1408], [590, 880], [625, 1010], [600, 1130], [280, 865], [330, 1335], [420, 1350],
  [660, 1230], [470, 1222], [310, 1215], [278, 1160], [150, 830], [300, 1000], [610, 810], [200, 1440]
];

export const COMBO_EVENTS = ['serve', 'repair', 'cabinServe', 'ring'];

export const GENERIC_EVENTS = ['stunt', 'mission', 'missionGold', 'secret', 'island', 'egg', 'minigame', 'meet', 'dog', 'build', 'photo', 'rainbow',
  'ride', 'rideKind', 'trick', 'grind', 'bigair', 'wheelie', 'rideKm'];

export const COMBO_TIME = 9;

// s pour enchainer une action de plus
export const QUESTS = [
  { id: 'bag',   ico: '🧳', text: 'Une valise est perdue ! Va la chercher vite.',   time: 75, reward: 8,  pick: (a) => a.randomSpot() },
  { id: 'vip',   ico: '🕶️', text: 'Un VIP arrive ! Va l\'accueillir a la porte.',  time: 65, reward: 10, pick: (a) => { const p = a.g.r3d.gatePosition; return { x: p.x, z: p.z + 24 }; } },
  { id: 'fire',  ico: '🚒', text: 'Les pompiers ont besoin de toi a la caserne !',  time: 90, reward: 9,  pick: () => ({ x: (LAYOUT.fireStation.x0 + LAYOUT.fireStation.x1) / 2, z: LAYOUT.fireApron.z0 + 8 }) },
  { id: 'tower', ico: '🗼', text: 'Le controleur t\'appelle : va au pied de la tour.', time: 70, reward: 7, pick: () => ({ x: LAYOUT.tower.x + 26, z: LAYOUT.tower.z }) },
  { id: 'heli',  ico: '🚁', text: 'Va faire coucou a l\'helicoptere sur l\'heliport !', time: 80, reward: 8, pick: () => ({ x: LAYOUT.helipad.x, z: LAYOUT.helipad.z + 16 }) },
  { id: 'pic',   ico: '📸', text: 'Prends un selfie (🎈 → 📸) devant le terminal !', time: 80, reward: 12, pick: () => ({ x: 360, z: 1290 }), needSelfie: true }
];

/* ---------------------------------------------------------- */
/* Plans de vol : une destination + un defi choisis avant le decollage */
/* ---------------------------------------------------------- */
export const DESTINATIONS = [
  { city: 'Londres', flag: '🎡', km: 340 }, { city: 'Berlin', flag: '🐻', km: 880 }, { city: 'Madrid', flag: '💃', km: 1050 },
  { city: 'Rome', flag: '🏛️', km: 1100 }, { city: 'Oslo', flag: '⛷️', km: 1350 }, { city: 'Lisbonne', flag: '🚋', km: 1450 },
  { city: 'Marrakech', flag: '🐪', km: 1900 }, { city: 'Athenes', flag: '🏺', km: 2100 }, { city: 'Reykjavik', flag: '🌋', km: 2250 },
  { city: 'Le Caire', flag: '🔺', km: 3200 }, { city: 'New York', flag: '🗽', km: 5840 }, { city: 'Rio', flag: '🎭', km: 9100 },
  { city: 'Tokyo', flag: '🍣', km: 9700 }, { city: 'Sydney', flag: '🦘', km: 16900 }
];

export const EXPRESS_TIME = 210;

// s de vol pour le defi « express »
export const PLAN_TYPES = {
  cool:    { ico: '🌤️', name: 'Vol tranquille',    text: 'Pas de defi : profite du vol !',       bonus: 0,  short: 'Tranquille', test: () => true },
  star:    { ico: '⭐', name: 'Atterrissage doux',  text: 'Atterris avec au moins 2 etoiles',     bonus: 12, short: '2 etoiles',  test: (r) => r.stars >= 2 },
  rings:   { ico: '🟡', name: 'Chasse aux anneaux', text: 'Traverse les 5 anneaux dores',         bonus: 14, short: 'Anneaux',    test: (r) => r.rings >= RING_TOTAL },
  fast:    { ico: '⏱️', name: 'Vol express',        text: 'Pose-toi en moins de 3 min 30',        bonus: 16, short: 'Express',    test: (r) => r.time <= EXPRESS_TIME && r.stars >= 1 },
  perfect: { ico: '💎', name: 'Vol parfait',        text: '3 etoiles ET les 5 anneaux',           bonus: 30, short: 'Parfait',    test: (r) => r.stars >= 3 && r.rings >= RING_TOTAL }
};

/* Missions flash du terminal : elles se suivent par les compteurs du hall (lecture seule). */
export const TERM_QUESTS = [
  { id: 'tboard', ico: '🛄', text: 'Fais embarquer 4 passagers a la porte !', time: 200, reward: 14, goal: 4,
    base: (t) => t.boarded, cur: (t, b) => t.boarded - b, pick: (a) => a.counterPos('gate', 3) },
  { id: 'trestock', ico: '📦', text: 'Recharge une machine avec une caisse de la reserve !', time: 150, reward: 10, goal: 1,
    base: (t) => t.stats.restocks, cur: (t, b) => t.stats.restocks - b, pick: (a) => a.counterPos('storage', 3) },
  { id: 'tbags', ico: '🧳', text: 'Charge 2 bagages dans l\'avion (tri des bagages) !', time: 160, reward: 10, goal: 2,
    base: (t) => t.stats.bags, cur: (t, b) => t.stats.bags - b, pick: (a) => a.counterPos('baggage', 3) },
  { id: 'tmood', ico: '😊', text: 'Garde l\'ambiance du hall au-dessus de 70 % pendant 40 s !', time: 140, reward: 12, goal: 40, hold: true,
    ok: (t) => t.mood >= 70, pick: () => null }
];

/* ---------------------------------------------------------- */
/* Trophees                                                    */
/* ---------------------------------------------------------- */
export const BADGES = [
  { id: 'first',    ico: '🛫', name: 'Premier vol',          desc: 'Termine un vol.',                         test: d => d.stats.flights >= 1 },
  { id: 'pilot5',   ico: '🧑‍✈️', name: 'Vrai pilote',          desc: 'Fais 5 vols.',                            test: d => d.stats.flights >= 5 },
  { id: 'star3',    ico: '⭐', name: 'Atterrissage parfait', desc: 'Obtiens 3 etoiles a un atterrissage.',    test: d => d.stats.star3 >= 1 },
  { id: 'rings',    ico: '🟡', name: 'Chasseur d\'anneaux',  desc: 'Traverse 20 anneaux dores.',              test: d => d.stats.rings >= 20 },
  { id: 'mech',     ico: '🔧', name: 'Super mecano',         desc: 'Repare 10 pieces de l\'avion.',           test: d => d.stats.repair >= 10 },
  { id: 'serve',    ico: '🧳', name: 'Roi de l\'accueil',    desc: 'Fais avancer 30 passagers.',              test: d => d.stats.serve >= 30 },
  { id: 'treasure', ico: '💰', name: 'Chasseur de tresors',  desc: 'Trouve 10 pieces cachees.',               test: d => d.stats.treasure >= 10 },
  { id: 'mapday',   ico: '🗺️', name: 'Carte complete',       desc: 'Trouve les 8 pieces cachees d\'un jour.', test: d => d.stats.treasureDays >= 1 },
  { id: 'honk',     ico: '📯', name: 'Roi du klaxon',        desc: 'Klaxonne 10 fois.',                       test: d => d.stats.honk >= 10 },
  { id: 'selfie',   ico: '📸', name: 'Photographe',          desc: 'Prends 3 selfies.',                       test: d => d.stats.selfie >= 3 },
  { id: 'party',    ico: '🎉', name: 'Ambianceur',           desc: 'Lance 5 fetes.',                          test: d => d.stats.party >= 5 },
  { id: 'dance',    ico: '💃', name: 'Star de la piste',     desc: 'Danse 5 fois.',                           test: d => d.stats.dance >= 5 },
  { id: 'lvl5',     ico: '🏗️', name: 'Directeur',            desc: 'Atteins le niveau 5.',                    test: d => d.level >= 5 },
  { id: 'rich',     ico: '💎', name: 'Millionnaire',         desc: 'Gagne 500 pieces en tout.',               test: d => d.coinsEarned >= 500 },
  { id: 'quests',   ico: '⚡', name: 'Super coursier',       desc: 'Reussis 5 missions flash.',               test: d => d.stats.quests >= 5 },
  { id: 'combo',    ico: '🔥', name: 'Combo de feu',         desc: 'Atteins un combo x4.',                    test: d => d.stats.bestCombo >= 4 },
  { id: 'cabin',    ico: '🥤', name: 'Hotesse de l\'air',    desc: 'Sers 20 passagers en cabine.',            test: d => d.stats.cabinServe >= 20 },
  { id: 'quiz',     ico: '🧠', name: 'Cerveau volant',       desc: 'Reponds juste a 8 questions de passagers.', test: d => d.stats.quiz >= 8 },
  { id: 'speaker',  ico: '📢', name: 'Voix de la cabine',    desc: 'Fais 5 annonces.',                        test: d => d.stats.announce >= 5 },
  { id: 'plans',    ico: '🌍', name: 'Globe-trotter',        desc: 'Reussis 5 defis de vol.',                 test: d => d.stats.plans >= 5 },
  { id: 'world',    ico: '🧭', name: 'Tour du monde',        desc: 'Visite 8 villes differentes.',            test: d => (d.visited || []).length >= 8 },
  { id: 'boss',     ico: '👔', name: 'Grand patron',         desc: 'Recrute 6 employes.',                     test: d => (d.staff || 0) >= 6 },
  { id: 'streak3',  ico: '🔥', name: 'Fidele',               desc: 'Ouvre le cadeau 3 jours de suite.',       test: d => !!(d.gift && d.gift.streak >= 3) },
  { id: 'friendly', ico: '👋', name: 'Ami de tous',          desc: 'Dis bonjour a 25 personnes de l\'aeroport.', test: d => (d.stats.greet || 0) >= 25 },
  { id: 'petlove',  ico: '🐶', name: 'Meilleur ami',         desc: 'Caresse ton chien 10 fois.',              test: d => (d.stats.pets || 0) >= 10 },
  { id: 'fireman',  ico: '🚒', name: 'Pompier courageux',    desc: 'Eteins 3 feux avec le camion de pompiers.', test: d => (d.stats.fires || 0) >= 3 },
  { id: 'doudou',   ico: '🐰', name: 'Ami des enfants',      desc: 'Rapporte 3 doudous perdus.',              test: d => (d.stats.doudous || 0) >= 3 },
  { id: 'guide',    ico: '🧭', name: 'Guide de l\'aeroport', desc: 'Accompagne 3 visiteurs jusqu\'a leur avion.', test: d => (d.stats.escorts || 0) >= 3 },
  { id: 'bus',      ico: '🚌', name: 'Chauffeur de bus',     desc: "Conduis 5 fois les passagers jusqu'a l'avion.", test: d => (d.stats.busTrips || 0) >= 5 },
  { id: 'tug',      ico: '🚜', name: 'Chauffeur de piste',   desc: 'Livre 10 chargements de valises avec le tracteur.', test: d => (d.stats.tugTrips || 0) >= 10 },
  { id: 'fetch',    ico: '🎾', name: 'Lanceur de balle',     desc: 'Joue 20 fois a la balle avec ton chien.', test: d => (d.stats.fetch || 0) >= 20 },
  { id: 'stunt10',  ico: '🌀', name: 'Acrobate',             desc: 'Fais 10 acrobaties.',                     test: d => d.stats.stunt >= 10 },
  { id: 'stunt50',  ico: '🤹', name: 'Roi de la voltige',    desc: 'Fais 50 acrobaties.',                     test: d => d.stats.stunt >= 50 },
  { id: 'mission1', ico: '🎯', name: 'Missionnaire',         desc: 'Termine une mission aerienne.',           test: d => d.stats.mission >= 1 },
  { id: 'mission10', ico: '🏅', name: 'Pro des missions',    desc: 'Termine 10 missions aeriennes.',          test: d => d.stats.mission >= 10 },
  { id: 'gold',     ico: '🥇', name: 'Medaille d\'or',       desc: 'Gagne une medaille d\'or.',                test: d => d.stats.missionGold >= 1 },
  { id: 'secret10', ico: '🌠', name: 'Chercheur d\'etoiles', desc: 'Trouve 10 etoiles filantes.',               test: d => d.stats.secret >= 10 },
  { id: 'secret40', ico: '🌌', name: 'Constellation',        desc: 'Trouve les 40 etoiles filantes.',           test: d => d.stats.secret >= 40 },
  { id: 'island6',  ico: '🏝️', name: 'Explorateur',          desc: 'Decouvre les 6 iles.',                    test: d => d.stats.island >= 6 },
  { id: 'egg3',     ico: '👽', name: 'Curieux',              desc: 'Trouve 3 surprises cachees dans le ciel.', test: d => d.stats.egg >= 3 },
  { id: 'rainbow',  ico: '🌈', name: 'Au bout de l\'arc-en-ciel', desc: 'Traverse un arc-en-ciel.',        test: d => d.stats.rainbow >= 1 },
  { id: 'mini10',   ico: '🧽', name: 'Touche-a-tout',        desc: 'Joue a 10 mini-jeux.',                    test: d => d.stats.minigame >= 10 },
  { id: 'meet4',    ico: '🎭', name: 'Sociable',             desc: 'Rencontre 4 visiteurs.',                  test: d => d.stats.meet >= 4 },
  { id: 'dog',      ico: '🐕', name: 'Ami des chiens',       desc: 'Rattrape le chien echappe.',              test: d => d.stats.dog >= 1 },
  { id: 'build5',   ico: '🏗️', name: 'Architecte',           desc: 'Pose 5 objets sur ta place.',             test: d => d.stats.build >= 5 },
  { id: 'photo5',   ico: '📷', name: 'Reporter',             desc: 'Prends 5 cartes postales.',               test: d => d.stats.photo >= 5 },
  { id: 'ride1',    ico: '🛹', name: 'Premier tour',         desc: 'Monte sur une monture.',                  test: d => d.stats.ride >= 1 },
  { id: 'ride5',    ico: '🎠', name: 'Collectionneur de montures', desc: 'Essaie les 5 montures.',            test: d => d.stats.rideKind >= 5 },
  { id: 'trick10',  ico: '🤸', name: 'Apprenti rider',       desc: 'Reussis 10 figures.',                     test: d => d.stats.trick >= 10 },
  { id: 'trick100', ico: '🏆', name: 'Roi du skatepark',     desc: 'Reussis 100 figures.',                    test: d => d.stats.trick >= 100 },
  { id: 'grind10',  ico: '⚙️', name: 'Maitre du rail',       desc: 'Glisse 10 fois sur un rail.',             test: d => d.stats.grind >= 10 },
  { id: 'combo1000', ico: '💯', name: 'Gros combo',          desc: 'Marque 1000 points en un seul combo.',    test: d => d.stats.bestTrick >= 1000 },
  { id: 'combo5000', ico: '🌠', name: 'Combo legendaire',    desc: 'Marque 5000 points en un seul combo.',    test: d => d.stats.bestTrick >= 5000 },
  { id: 'bigair',   ico: '🚀', name: 'Haut perche',          desc: 'Saute a plus de 4 metres de haut.',       test: d => d.stats.bigair >= 1 },
  { id: 'wheelie',  ico: '🎡', name: 'Equilibriste',         desc: 'Tiens un wheelie ou un manual 5 secondes.', test: d => d.stats.wheelie >= 1 },
  { id: 'rideKm',   ico: '🛣️', name: 'Globe-rider',          desc: 'Roule 5 kilometres.',                     test: d => d.stats.rideKm >= 5 }
];

/* Altitude minimale (m, centre de gravite) avant de placer le 1er anneau. */
export const GROUND_CLEAR = 12;

export const iconifyHost = (el) => { try { iconify(el); } catch (e) { /* icones facultatives */ } };

