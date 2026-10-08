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

import { sfx } from './sfx.js?v=1791466783';
import { LAYOUT } from './layout.js?v=1791466783';
import { drawIcon, iconify } from './icons.js?v=1791466783';
import { PARK, buildPark } from './rideCourse.js?v=1791466783';

const STORE = 'skymanager.arcade';
export const COIN = 1000;                        // EUR par piece

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* Points de progression du niveau d'aeroport (XP). */
const xpForLevel = (lvl) => 60 + lvl * 40;

/* Collections du ciel qui ne se trouvent qu'une fois (voir openWorld.js : _starPositions, ISLANDS). */
export const SKY_STARS = 40;
export const SKY_ISLANDS = 6;

/* Anneaux d'un vol. */
const RING_TOTAL = 5;
const RING_RADIUS = 58;                          // m, rayon de capture (anneau visible : 52 m)
const RING_AHEAD = 620;                          // m devant l'appareil

/* ---------------------------------------------------------- */
/* Tutoriel : chaine d'objectifs                               */
/* ---------------------------------------------------------- */
/* Chaque etape : texte, icone, cible (monde) ou null, condition de fin.
   `g` est le jeu (Game), `a` l'instance Arcade. */
const STEPS = [
  {
    id: 'move', icon: '🕹️', reward: 5,
    text: 'Deplace-toi avec le joystick (ou les fleches).',
    target: () => null,
    done: (g, a) => g.state === 'HUB' && a._moved > 10
  },
  {
    id: 'repair', icon: '🔧', reward: 10,
    text: 'Repare l\'avion ! Va sur un point colore et appuie sur le bouton.',
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
    text: 'Verifie 3 passagers : billet, bagage, plateau. Lis bien, puis valide ou refuse !',
    target: (g) => g.arcade.counterTarget(),
    done: (g, a) => a._stepStats.serve >= 3
  },
  {
    id: 'tower', icon: '🗼', reward: 15,
    text: 'Va a la tour de controle et ouvre le bureau pour agrandir ton aeroport.',
    target: (g) => g.arcade.markerPos('tower'),
    done: (g, a) => a._stepStats.tower >= 1
  },
  {
    id: 'takeoff', icon: '🛫', reward: 20,
    text: 'Monte dans le cockpit, appuie sur DECOLLER et pilote !',
    target: (g) => g.arcade.markerPos('cockpit'),
    done: (g, a) => a._stepStats.takeoff >= 1
  },
  {
    id: 'rings', icon: '🟡', reward: 25,
    text: 'Traverse 3 anneaux dores en volant dedans !',
    target: () => null,
    done: (g, a) => a._stepStats.ring >= 3
  },
  {
    id: 'land', icon: '🛬', reward: 40,
    text: 'Retourne vers la piste (fleche) et atterris. Le bouton ATTERRIR t\'aide !',
    target: () => null,
    done: (g, a) => a._stepStats.landing >= 1
  }
];

/* ---------------------------------------------------------- */
/* Defis du jour                                               */
/* ---------------------------------------------------------- */
const DAILY_POOL = [
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
const WEEKLY_POOL = [
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
const weekKey = () => {
  const d = new Date();
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t - y0) / 86400000 + 1) / 7)}`;
};

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/* Petit generateur pseudo-aleatoire deterministe (meme defis toute la journee). */
function seeded(str) {
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
const MAP_WIN = { x0: -80, x1: 690, z0: 770, z1: 1510 };
/* Vue « aeroport entier » : toute la piste (3 000 m) sur un canevas en hauteur. */
const MAP_FULL = { x0: -502, x1: 1103, z0: -1565, z1: 1525 };
const BIG_CANVAS = { complex: [960, 924], full: [640, 1232] };
export const MAP_SIZE = { mini: [480, 462], big: [960, 924] };

/* Styles de carte : le premier est gratuit, les autres s'achetent (en pieces). */
export const MAP_THEMES = {
  jour:   { name: 'Jour',   ico: '☀️', cost: 0,  grass: '#4a8f43', grass2: '#54a04c', runway: '#2f3744', edge: '#e5e7eb', mark: '#f8fafc', taxi: '#4b5563', taxiLine: '#facc15', apron: '#6b7280', road: '#4b5563', park: '#8a9098', cargo: '#94a3b8', cargoLine: '#e2e8f0', hangar: '#c2620c', hangarLine: '#fbbf24', term: '#dbe4ee', termLine: '#38bdf8', tree: '#2f6f36', treeShade: 'rgba(0,0,0,0.22)' },
  nuit:   { name: 'Nuit',   ico: '🌙', cost: 20, grass: '#1e3a3a', grass2: '#244646', runway: '#0f172a', edge: '#7dd3fc', mark: '#bae6fd', taxi: '#1e293b', taxiLine: '#38bdf8', apron: '#334155', road: '#1e293b', park: '#475569', cargo: '#475569', cargoLine: '#94a3b8', hangar: '#7c3a0a', hangarLine: '#f59e0b', term: '#94a3b8', termLine: '#22d3ee', tree: '#14532d', treeShade: 'rgba(0,0,0,0.35)' },
  neige:  { name: 'Neige',  ico: '❄️', cost: 40, grass: '#e8f1f8', grass2: '#f7fbff', runway: '#64748b', edge: '#ffffff', mark: '#ffffff', taxi: '#8391a3', taxiLine: '#facc15', apron: '#94a3b8', road: '#7b8898', park: '#a8b4c2', cargo: '#b6c2d0', cargoLine: '#ffffff', hangar: '#dc7a2b', hangarLine: '#fde68a', term: '#ffffff', termLine: '#38bdf8', tree: '#3b7a57', treeShade: 'rgba(30,58,90,0.25)' },
  bonbon: { name: 'Bonbon', ico: '🍬', cost: 60, grass: '#f9a8d4', grass2: '#fbcfe8', runway: '#6d28d9', edge: '#fde047', mark: '#ffffff', taxi: '#8b5cf6', taxiLine: '#fde047', apron: '#a78bfa', road: '#7c3aed', park: '#c4b5fd', cargo: '#67e8f9', cargoLine: '#ffffff', hangar: '#fb923c', hangarLine: '#fef08a', term: '#fef9c3', termLine: '#f472b6', tree: '#22c55e', treeShade: 'rgba(80,0,60,0.2)' }
};

/* Lieux nommes (le premier qui contient le point gagne) : sert au bandeau « Tu es ici ». */
let _places = null;
function placeList() {
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

function roundRectPath(x, a, b, w, h, r) {
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
function drawPlane(x, cx, cy, ang, s, fill, stroke, k = 1) {
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
const TREASURE_COUNT = 8;
const TREASURE_RADAR = 140;           // m : les pieces plus proches apparaissent sur la carte
const TREASURE_SPOTS = [
  [300, 1160], [440, 1150], [210, 1000], [330, 915], [500, 905], [120, 1100], [95, 1245], [30, 1300],
  [-45, 1050], [100, 1408], [590, 880], [625, 1010], [600, 1130], [280, 865], [330, 1335], [420, 1350],
  [660, 1230], [470, 1222], [310, 1215], [278, 1160], [150, 830], [300, 1000], [610, 810], [200, 1440]
];

/* ---------------------------------------------------------- */
/* Missions flash : petites courses chronometrees sur le tarmac  */
/* ---------------------------------------------------------- */
/* Cadeaux de niveau : styles de carte offerts. */
const LEVEL_UNLOCKS = { 3: 'nuit', 5: 'neige', 8: 'bonbon' };
export const nextUnlock = (lvl) => { const k = Object.keys(LEVEL_UNLOCKS).map(Number).find(n => n > lvl); return k ? { level: k, theme: LEVEL_UNLOCKS[k] } : null; };
const COMBO_EVENTS = ['serve', 'repair', 'cabinServe', 'ring'];
const GENERIC_EVENTS = ['stunt', 'mission', 'missionGold', 'secret', 'island', 'egg', 'minigame', 'meet', 'dog', 'build', 'photo', 'rainbow',
  'ride', 'rideKind', 'trick', 'grind', 'bigair', 'wheelie', 'rideKm'];
const COMBO_TIME = 9;                 // s pour enchainer une action de plus
const QUESTS = [
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
const EXPRESS_TIME = 210;             // s de vol pour le defi « express »
export const PLAN_TYPES = {
  cool:    { ico: '🌤️', name: 'Vol tranquille',    text: 'Pas de defi : profite du vol !',       bonus: 0,  short: 'Tranquille', test: () => true },
  star:    { ico: '⭐', name: 'Atterrissage doux',  text: 'Atterris avec au moins 2 etoiles',     bonus: 12, short: '2 etoiles',  test: (r) => r.stars >= 2 },
  rings:   { ico: '🟡', name: 'Chasse aux anneaux', text: 'Traverse les 5 anneaux dores',         bonus: 14, short: 'Anneaux',    test: (r) => r.rings >= RING_TOTAL },
  fast:    { ico: '⏱️', name: 'Vol express',        text: 'Pose-toi en moins de 3 min 30',        bonus: 16, short: 'Express',    test: (r) => r.time <= EXPRESS_TIME && r.stars >= 1 },
  perfect: { ico: '💎', name: 'Vol parfait',        text: '3 etoiles ET les 5 anneaux',           bonus: 30, short: 'Parfait',    test: (r) => r.stars >= 3 && r.rings >= RING_TOTAL }
};

/* Questions des passagers (cabine) : { q, a: [bonne reponse, faux, faux] }. */
export const QUIZ = [
  { q: 'Combien de moteurs a notre avion de ligne ?', a: ['2', '1', '6'] },
  { q: 'Comment s\'appelle l\'endroit ou les avions atterrissent ?', a: ['La piste', 'Le quai', 'La route'] },
  { q: 'De quelle couleur est la « boite noire » d\'un avion ?', a: ['Orange', 'Noire', 'Bleue'] },
  { q: 'Qui aide le commandant a piloter ?', a: ['Le copilote', 'Le controleur', 'Le steward'] },
  { q: 'Que fait la tour de controle ?', a: ['Elle guide les avions', 'Elle repare les avions', 'Elle vend les billets'] },
  { q: 'A quoi servent les volets des ailes ?', a: ['A voler doucement', 'A ouvrir les portes', 'A faire du bruit'] },
  { q: 'En quelle unite mesure-t-on l\'altitude d\'un avion ?', a: ['En pieds', 'En bananes', 'En litres'] },
  { q: 'Quel pays a vu voler les freres Wright, en 1903 ?', a: ['Les Etats-Unis', 'La Chine', 'Le Bresil'] },
  { q: 'Quel oiseau est un grand champion de vol ?', a: ['L\'albatros', 'Le pingouin', 'L\'autruche'] },
  { q: 'Le son voyage a environ...', a: ['1 200 km/h', '100 km/h', '30 km/h'] },
  { q: 'Quel metal sert le plus a fabriquer les avions ?', a: ['L\'aluminium', 'L\'or', 'Le bois'] },
  { q: 'Que veut dire « atterrir » ?', a: ['Se poser sur le sol', 'Decoller', 'Faire demi-tour'] },
  { q: 'Ou se trouve la Tour Eiffel ?', a: ['A Paris', 'A Rome', 'A Londres'] },
  { q: 'Quelle planete est la plus proche du Soleil ?', a: ['Mercure', 'Mars', 'Jupiter'] },
  { q: 'Que met-on quand l\'avion decolle ?', a: ['La ceinture', 'Un chapeau', 'Des palmes'] },
  { q: 'Comment dit-on « aeroport » en anglais ?', a: ['Airport', 'Harbor', 'Station'] },
  { q: 'Combien de minutes dans une heure ?', a: ['60', '100', '30'] },
  { q: 'Quel animal ne sait PAS voler ?', a: ['Le manchot', 'La chauve-souris', 'L\'aigle'] }
];

/* Missions flash du terminal : elles se suivent par les compteurs du hall (lecture seule). */
const TERM_QUESTS = [
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

/* « Le savais-tu ? » : petits faits d'aviation affiches dans le menu pause. */
export const FUN_FACTS = [
  'Un avion de ligne decolle a environ 250 km/h. Plus vite qu\'une voiture de course sur autoroute !',
  'Les pilotes parlent aux tours de controle en anglais, partout dans le monde.',
  'La « boite noire » d\'un avion est en realite... orange, pour etre retrouvee facilement.',
  'Les pistes portent un numero : c\'est leur direction en degres, divisee par 10. Piste 36 = plein nord !',
  'Un gros avion peut peser plus de 300 tonnes, autant que 200 voitures.',
  'Les ailes des avions se plient un peu en vol : c\'est fait expres, elles sont souples !',
  'Le plus long vol du monde dure plus de 18 heures sans escale.',
  'Les pompiers d\'aeroport arrivent au bout de la piste en moins de 3 minutes.',
  'Les hublots sont ronds pour que l\'avion ne se fissure pas aux coins.',
  'A 10 000 metres d\'altitude, il fait environ -50 °C dehors !',
  'Un avion d\'aujourd\'hui peut se poser tout seul, grace au pilote automatique.',
  'Le manche sert a monter et descendre, le palonnier a tourner la queue de l\'avion.'
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
      mode: 'arcade', stars: 0, xp: 0, level: 1, step: 0, tutorialDone: false,
      coinsEarned: 0, daily: null, stats: { serve: 0, repair: 0, flights: 0, rings: 0, star3: 0 },
      name: 'Mon aeroport', mapTheme: 'jour', themes: ['jour'], badges: {}, gift: null, treasure: null
    };
    def.stats.treasure = 0; def.stats.treasureDays = 0; def.stats.quests = 0; def.stats.bestCombo = 0;
    for (const k of ['quiz', 'cabinServe', 'announce', 'candy', 'music', 'plans']) def.stats[k] = 0;
    def.visited = [];
    for (const k of ['honk', 'hello', 'party', 'dance', 'selfie']) def.stats[k] = 0;
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (d) return Object.assign(def, d, { stats: Object.assign(def.stats, d.stats || {}), badges: d.badges || {}, themes: d.themes || ['jour'], visited: d.visited || [] });
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
    const t = this.g.tycoon;
    t.cash += 100 * COIN;
    t.save();
    sfx.levelUp();
    this.confetti(70);
    const th = LEVEL_UNLOCKS[lvl];
    if (th && !this.data.themes.includes(th)) {
      this.data.themes.push(th);
      this.g.toast(`🎉 NIVEAU ${lvl} ! +100 🪙 et carte « ${MAP_THEMES[th].name} » debloquee !`, 5200, 'ok');
    } else {
      this.g.toast(`🎉 NIVEAU ${lvl} ! Ton aeroport grandit — +100 🪙`, 4500, 'ok');
    }
  }

  xpProgress() {
    return clamp(this.data.xp / xpForLevel(this.data.level), 0, 1);
  }

  /* ---------------- Evenements du jeu ---------------- */
  /* Appele par main.js a chaque action notable :
     'repair' 'serve' 'cabinServe' 'tower' 'takeoff' 'ring' 'landing' 'star3' 'buy' */
  event(type, n = 1) {
    if (!this.on) return;
    if (type in this._stepStats) this._stepStats[type] += n;
    if (COMBO_EVENTS.includes(type)) this._bumpCombo();
    const s = this.data.stats;
    if (type === 'serve') s.serve += n;
    if (type === 'repair') s.repair += n;
    if (type === 'landing') s.flights += n;
    if (type === 'hire') this.data.staff = (this.data.staff || 0) + n;
    if (type === 'takeoff' && this.plan && this.plan.t0 == null) this.plan.t0 = this.g.time;
    if (type === 'cabinServe') { s.cabinServe = (s.cabinServe || 0) + n; if (this.cabinSess) this.cabinSess.served += n; }
    if (type === 'ring') s.rings += n;
    if (type === 'star3') s.star3 += n;
    if (GENERIC_EVENTS.includes(type)) s[type] = (s[type] || 0) + n;

    /* Defi de la semaine. */
    const wk = this.data.weekly;
    if (wk && wk.item && !wk.item.done && wk.item.ev === type) {
      wk.item.progress = Math.min(wk.item.target, wk.item.progress + n);
      if (wk.item.progress >= wk.item.target) {
        wk.item.done = true;
        sfx.levelUp();
        this.confetti(90);
        this.giveCoins(wk.item.reward, { silent: true, xp: 40 });
        this.g.toast(`🏆 DEFI DE LA SEMAINE reussi ! +${wk.item.reward} 🪙`, 5200, 'ok');
      }
    }
    /* Defis du jour. */
    const daily = this.data.daily;
    if (daily) {
      for (const d of daily.items) {
        if (d.done || d.ev !== type) continue;
        d.progress = Math.min(d.target, d.progress + n);
        if (d.progress >= d.target) {
          d.done = true;
          sfx.levelUp();
          this.confetti(40);
          this.giveCoins(d.reward, { silent: true, xp: 10 });
          this.g.toast(`🏆 Defi reussi : ${d.label} — +${d.reward} 🪙`, 4200, 'ok');
        }
      }
    }
    this.save();
  }

  /* Combien reste-t-il a trouver pour un defi de collection ? Les 40 etoiles filantes et
     les 6 iles (openWorld.js) ne se trouvent qu'une fois : sans ce test, un defi
     « trouve 3 etoiles » pouvait etre tire alors qu'il n'en restait plus, et bloquer
     l'objectif affiche toute la journee. Infinity pour les autres defis. */
  _left(ev) {
    if (ev === 'fetch') {
      let pet = this.g.pet && this.g.pet.data;
      if (!pet) { try { pet = JSON.parse(localStorage.getItem('skymanager.pet') || 'null'); } catch (e) { pet = null; } }
      return pet && pet.adopted ? Infinity : 0;
    }
    if (ev !== 'secret' && ev !== 'island') return Infinity;
    let w = this.g.openWorld && this.g.openWorld.data;
    if (!w) { try { w = JSON.parse(localStorage.getItem('skymanager.world') || 'null'); } catch (e) { w = null; } }
    const got = (w && (ev === 'secret' ? w.stars : w.islands)) || [];
    return (ev === 'secret' ? SKY_STARS : SKY_ISLANDS) - got.length;
  }

  /* Un defi en cours peut-il encore etre reussi ? */
  _doable(d) { return d.done || this._left(d.ev) >= d.target - d.progress; }

  _ensureDaily() {
    const day = todayKey();
    if (this.data.daily && this.data.daily.day === day) return;
    const rnd = seeded('sky' + day);
    const pool = DAILY_POOL.slice();
    const items = [];
    while (items.length < 3 && pool.length) {
      const d = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const left = this._left(d.ev);
      const n = Math.min(left, d.min + Math.floor(rnd() * (d.max - d.min + 1)));
      if (n < d.min) continue;                       // plus rien a trouver : on tire un autre defi
      items.push({
        id: d.id, ev: d.ev, icon: d.icon, label: d.text(n),
        target: n, progress: 0, reward: d.reward, done: false
      });
    }
    this.data.daily = { day, items };
    this.save();
  }

  _ensureWeekly() {
    const wk = weekKey();
    if (this.data.weekly && this.data.weekly.week === wk) return;
    const rnd = seeded('week' + wk);
    /* Seulement les defis encore faisables (etoiles et iles epuisables, voir _left). */
    const pool = WEEKLY_POOL.filter(x => this._left(x.ev) >= x.target[0]);
    const d = pool[Math.floor(rnd() * pool.length)];
    const target = Math.min(this._left(d.ev), d.target[0] + Math.floor(rnd() * (d.target[1] - d.target[0] + 1)));
    this.data.weekly = { week: wk, item: { id: d.id, ev: d.ev, icon: d.icon, label: '📅 Semaine : ' + d.text(target), target, progress: 0, reward: d.reward, done: false, weekly: true } };
    this.save();
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

  /* Objectif a afficher : etape du tutoriel, sinon premier defi non fait. */
  currentGoal() {
    /* Aux commandes : le but est toujours celui du vol en cours. */
    if (this.g.state === 'PILOT') {
      const ac = this.g.ac;
      const sg = this.g.sky && this.g.sky.goal();
      if (sg) return sg;
      if (ac.onGround && !this.g.assist.launched && !ac.touchdown) return { icon: '🛫', text: 'Appuie sur DECOLLER, puis tire vers le haut !', target: null };
      if (ac.onGround && !ac.touchdown) return { icon: '🛫', text: 'Ca roule ! Tire vers le haut pour decoller.', target: null };
      if (ac.onGround) return { icon: '🅿️', text: 'Bravo ! Ouvre le menu ☰ pour rentrer a la maison.', target: null };
      if (this.ring) return { icon: '🟡', text: `Vole dans l'anneau dore ! (${this.ringsThisFlight}/${RING_TOTAL})`, target: null };
      if (ac.heli) return { icon: '🚁', text: 'Suis la fleche vers l\'helipad, descends doucement et pose-toi (ou appuie sur ATTERRIR).', target: null };
      return { icon: '🛬', text: 'Suis la fleche vers la piste et atterris doucement.', target: null };
    }
    if (this.g.state === 'HUB') for (const v of this.g.vehicles || []) { const vg = v.goal(); if (vg) return vg; }
    const ge = this.g.state === 'HUB' && this.g.ground && this.g.ground.goal();
    if (ge) return ge;
    if (this.quest && this.g.state === 'HUB') return { icon: this.quest.ico, text: '⚡ ' + this.quest.text + (this.quest.goal ? ` (${this.quest.prog}/${this.quest.goal})` : ''), target: this.quest.target };
    const st = this.step;
    if (st) return { icon: st.icon, text: st.text, target: st.target(this.g) };
    const d = this.dailyItems.find(x => !x.done && this._doable(x));
    if (d) {
      const tgt = this._targetForChallenge(d);
      return {
        icon: d.icon, text: `${d.label} (${d.progress}/${d.target})`, target: tgt
      };
    }
    return this._suggestGoal();
  }

  /* Quand tout est fait, le jeu propose quand meme quelque chose d'utile (jamais d'impasse). */
  _suggestGoal() {
    const g = this.g, t = g.tycoon, opts = [];
    const wear = Math.max(0, ...Object.values(g.mechanic.components).map(c => c.wear));
    if (wear > 55) opts.push({ icon: '🔧', text: 'Une piece de l\'avion est usee : va la reparer !', target: this.stationTarget() });
    const buy = ['shops', 'gates', 'vipLounge', 'terminals', 'runways'].find(k => t.canBuy(k));
    if (buy) opts.push({ icon: '🛍️', text: 'Tu as assez de pieces : va acheter une amelioration a la tour !', target: this.markerPos('tower') });
    else if (t.canBuyAircraft()) opts.push({ icon: '✈️', text: 'Tu peux acheter un nouvel avion a la tour !', target: this.markerPos('tower') });
    const tz = this.data.treasure;
    if (tz && tz.got.some(v => !v)) opts.push({ icon: '✨', text: `Cherche les pieces cachees (${tz.got.filter(Boolean).length}/${tz.got.length}) : la mini-carte t'aide !`, target: null });
    if (this.giftReady()) opts.push({ icon: '🎁', text: 'Ton cadeau du jour t\'attend a la tour !', target: this.markerPos('tower') });
    const unseen = DESTINATIONS.filter(d => !(this.data.visited || []).includes(d.city));
    opts.push({ icon: '🛫', text: unseen.length ? 'Prends un vol vers une nouvelle ville pour remplir ton carnet !' : 'Refais un vol pour battre ton record d\'etoiles !', target: this.markerPos('cockpit') });
    opts.push({ icon: '🥤', text: 'Va en cabine servir les passagers et repondre a leurs questions !', target: this.markerPos('cabinDoor') });
    /* Ce qu'on peut faire a pied (souvent jamais decouvert sans un petit coup de pouce). */
    const st = this.data.stats;
    const tug = g.tug && g.tug._ambient();
    if (tug && !(st.tugTrips > 2)) opts.push({ icon: '🚜', text: 'Conduis le tracteur a bagages jaune : charge les valises et livre-les a l\'avion !', target: { x: tug.mv.x, z: tug.mv.z } });
    const bus = g.bus && g.bus._ambient();
    if (bus && !(st.busTrips > 1)) opts.push({ icon: '🚌', text: 'Conduis le bus jaune : emmene les passagers du terminal jusqu\'a l\'avion !', target: { x: bus.mv.x, z: bus.mv.z } });
    const ft = g.fire && g.fire._parked();
    if (ft && !(st.fires > 0)) opts.push({ icon: '🚒', text: 'Va voir le camion de pompiers devant la caserne : tu peux le conduire !', target: { x: ft.position.x, z: ft.position.z - 6 } });
    if (g.pet && g.pet.adopted && !(st.fetch > 3)) opts.push({ icon: '🎾', text: `Joue a la balle avec ${g.pet.data.name} : appuie sur 🎾 !`, target: null });
    if (!(st.greet > 5)) opts.push({ icon: '👋', text: 'Dis bonjour aux gens de l\'aeroport : les spotteurs au bord de la piste adorent parler d\'avions !', target: { x: 92, z: 1188 } });
    return opts[Math.floor(g.time / 40) % opts.length];
  }

  _targetForChallenge(d) {
    if (d.ev === 'serve') return this.counterTarget();
    if (d.ev === 'repair') return this.stationTarget();
    if (d.ev === 'buy') return this.markerPos('tower');
    if (d.ev === 'cabinServe') return this.markerPos('cabinDoor');
    if (d.ev === 'landing' || d.ev === 'star3' || d.ev === 'ring') return this.markerPos('cockpit');
    if (d.ev === 'tugTrip' && this.g.tug) { const t = this.g.tug._ambient(); return t ? { x: t.mv.x, z: t.mv.z } : null; }
    if (d.ev === 'greet') return { x: 92, z: 1188 };
    if (d.ev === 'busTrip' && this.g.bus) { const b = this.g.bus._ambient(); return b ? { x: b.mv.x, z: b.mv.z } : null; }
    return null;
  }

  /* Position monde d'un point d'interaction du hub. */
  markerPos(key) {
    const m = this.g.r3d.hotspotMarkers && this.g.r3d.hotspotMarkers[key];
    if (!m) return null;
    return { x: m.group.position.x, z: m.group.position.z };
  }

  /* Poste de maintenance le plus use. */
  stationTarget() {
    const g = this.g;
    let best = null, bw = -1;
    for (const h of g.hotspots) {
      if (h.type !== 'mechanic') continue;
      const w = Math.max(...h.components.map(k => g.mechanic.components[k].wear));
      if (w > bw) { bw = w; best = h; }
    }
    return best ? this.markerPos(best.key) : null;
  }

  /* Comptoir du terminal avec le plus de monde, sinon le premier ouvert. */
  /* Poste qui a le plus besoin du joueur, dans l'ordre logique du circuit :
     1. il porte une caisse -> la machine la plus vide ;
     2. une machine est presque vide -> la reserve (pour prendre une caisse) ;
     3. des bagages attendent -> le tri des bagages ;
     4. sinon le guichet (enregistrement, surete, porte) avec le plus de monde. */
  counterTarget() {
    const g = this.g, t = g.terminal;
    const vis = g.r3d.terminalCounters || {};
    const at = (id) => vis[id] ? { x: vis[id].deskGroup.position.x, z: vis[id].deskGroup.position.z } : null;
    const low = t.lowMachine();
    if (t.carry > 0) {
      let m = low;
      if (!m) for (const id of ['shop', 'cafe', 'vending']) { const c = t.counters[id]; if (Math.floor(c.stock) < 12 && (!m || c.stock < m.stock)) m = c; }
      if (m) return at(m.id);
    }
    if (low && t.counters.storage.crates > 0) return at('storage');
    if (t.counters.baggage.queue >= 4) return at('baggage');
    let best = null, bq = 0;
    for (const id of ['checkin1', 'checkin2', 'checkin3', 'security', 'gate']) {
      const c = t.counters[id];
      const score = (c.open ? c.queue : -1) + (c.kind === 'checkin' ? 0.5 : 0);
      if (score > bq && vis[id]) { bq = score; best = id; }
    }
    return best ? at(best) : (at('checkin1') || null);
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
    this.giveCoins(st.reward, { silent: false, label: 'Objectif reussi !' });
    this.confetti(30);
    this.data.step++;
    this._stepStats = { repair: 0, serve: 0, tower: 0, takeoff: 0, ring: 0, landing: 0 };
    this._moved = 0;
    if (this.data.step >= STEPS.length) {
      this.data.tutorialDone = true;
      this.g.toast('🎓 Tutoriel termine ! Releve les defis du jour pour gagner plus de pieces.', 5000, 'ok');
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

  _mapToPx(x, z, w, h) {
    const M = MAP_WIN;
    return [(x - M.x0) / (M.x1 - M.x0) * w, (z - M.z0) / (M.z1 - M.z0) * h];
  }

  /* Nom du lieu ou se trouve un point monde. */
  placeAt(x, z) {
    for (const p of placeList()) {
      const r = p.rect;
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return p;
    }
    return { name: 'Aeroport', ico: '🌍' };
  }

  /* Fond fixe (decor), dessine une seule fois par taille et par theme. */
  _mapBase(w, h, win = MAP_WIN, big = w > 700) {
    const key = `${w}x${h}:${this.data.mapTheme}:${win === MAP_FULL ? 'f' : 'c'}`;
    this._bases = this._bases || {};
    if (this._bases[key]) return this._bases[key];
    const base = document.createElement('canvas');
    base.width = w; base.height = h;
    const x = base.getContext('2d');
    const T = this.theme, M = win, L = LAYOUT, k = w / 480;
    const area = (M.x1 - M.x0) * (M.z1 - M.z0) / ((MAP_WIN.x1 - MAP_WIN.x0) * (MAP_WIN.z1 - MAP_WIN.z0));
    const X = (wx) => (wx - M.x0) / (M.x1 - M.x0) * w;
    const Z = (wz) => (wz - M.z0) / (M.z1 - M.z0) * h;
    const rect = (x0, z0, x1, z1, fill, stroke, lw = 1.6) => {
      const a = X(x0), b = Z(z0), cw = X(x1) - a, ch = Z(z1) - b;
      x.fillStyle = fill;
      roundRectPath(x, a, b, cw, ch, 3 * k); x.fill();
      if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw * k; x.stroke(); }
    };
    const emoji = (e, wx, wz, size) => {
      x.font = `${size * k}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = '#000';
      if (!drawIcon(x, e, X(wx), Z(wz), size * k * 1.05)) x.fillText(e, X(wx), Z(wz));
      if (big) this._iconSrc.push({ wx, wz });
    };
    /* Etiquettes et icones : seulement enregistrees ici ; dessinees a chaque image
       a taille constante (voir _drawMapLabels), pour rester lisibles au zoom. */
    if (big) { this._pillSrc = []; this._iconSrc = []; }
    const pill = (txt, wx, wz) => { if (big) this._pillSrc.push({ txt, wx, wz }); };

    /* Herbe + taches + arbres (fixes : meme graine a chaque fois). */
    x.fillStyle = T.grass; x.fillRect(0, 0, w, h);
    const rnd = seeded('map-decor');
    x.fillStyle = T.grass2;
    for (let i = 0; i < Math.round(70 * Math.min(area, 1.3)); i++) {
      x.beginPath();
      x.ellipse(rnd() * w, rnd() * h, (10 + rnd() * 22) * k, (6 + rnd() * 12) * k, rnd() * 3, 0, Math.PI * 2);
      x.fill();
    }

    const rw = L.runway;
    /* Piste. */
    const rz0 = Math.max(rw.zEnd, M.z0 - 20), rz1 = Math.min(rw.zStart, M.z1 + 20);
    rect(rw.x - rw.width / 2, rz0, rw.x + rw.width / 2, rz1, T.runway, T.edge, 1.2);
    x.strokeStyle = T.mark; x.lineWidth = 2.2 * k; x.setLineDash([9 * k, 8 * k]);
    x.beginPath(); x.moveTo(X(rw.x), Z(rz0)); x.lineTo(X(rw.x), Z(rz1)); x.stroke(); x.setLineDash([]);
    /* Seuils : barres d'attache et numeros de piste (36 au sud, 18 au nord). */
    for (const [zt, num] of [[rw.zStart, '36'], [rw.zEnd, '18']]) {
      const dir = zt > 0 ? -1 : 1;
      x.fillStyle = T.mark;
      for (let i = -3; i <= 3; i++) x.fillRect(X(rw.x + i * 5) - 1.2 * k, Z(zt + dir * 8), 2.4 * k, Math.abs(Z(zt + dir * 28) - Z(zt + dir * 8)));
      if (big) {
        x.save(); x.translate(X(rw.x), Z(zt + dir * 60)); x.rotate(dir < 0 ? Math.PI : 0);
        x.font = `900 ${14 * k}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(num, 0, 0);
        x.restore();
      }
    }
    /* Bretelles + taxiway. */
    for (const lz of L.linkZ) if (lz > M.z0 - 30 && lz < M.z1 + 30) rect(rw.x + rw.width / 2, lz - 12, L.taxiway.x, lz + 12, T.taxi);
    const tz0 = Math.max(L.taxiway.z0, M.z0 - 20), tz1 = Math.min(L.taxiway.z1, M.z1 + 20);
    rect(L.taxiway.x - L.taxiway.width / 2, tz0, L.taxiway.x + L.taxiway.width / 2, tz1, T.taxi);
    x.strokeStyle = T.taxiLine; x.lineWidth = 1.6 * k; x.setLineDash([6 * k, 5 * k]);
    x.beginPath(); x.moveTo(X(L.taxiway.x), Z(tz0)); x.lineTo(X(L.taxiway.x), Z(tz1)); x.stroke(); x.setLineDash([]);
    /* Aviation legere + PAPI (visibles surtout en vue complete). */
    rect(L.gaApron.x0, L.gaApron.z0, L.gaApron.x1, L.gaApron.z1, T.apron, T.taxiLine, 1.2);
    x.fillStyle = '#fde047'; x.beginPath(); x.arc(X(L.papi.x), Z(L.papi.z), 3 * k, 0, Math.PI * 2); x.fill();
    /* Aire de stationnement. */
    rect(L.apron.x0, L.apron.z0, L.apron.x1, L.apron.z1, T.apron, T.taxiLine, 1.2);
    /* Skatepark (phase 40) : dalle teintee, rampes colorees, rails jaunes. */
    {
      const pk = PARK.area, course = this._parkCourse || (this._parkCourse = buildPark());
      rect(pk.x0, pk.z0, pk.x1, pk.z1, 'rgba(56,189,248,0.28)', '#38bdf8', 1.4);
      for (const p of course.prims) rect(p.box.x0, p.box.z0, p.box.x1, p.box.z1, '#' + (p.color || 0x38bdf8).toString(16).padStart(6, '0'), 'rgba(15,23,42,0.45)', 0.8);
      x.strokeStyle = '#fde047'; x.lineWidth = 2 * k; x.lineCap = 'round';
      for (const r of course.rails) { x.beginPath(); x.moveTo(X(r.x0), Z(r.z0)); x.lineTo(X(r.x1), Z(r.z1)); x.stroke(); }
      x.lineCap = 'butt';
    }
    /* Routes. */
    rect(L.road.x0, L.road.z - L.road.w / 2, L.road.x1, L.road.z + L.road.w / 2, T.road);
    rect(L.entrance.x - 7, L.entrance.z0, L.entrance.x + 7, L.entrance.z1, T.road);
    rect(L.serviceRoad.x - 3, L.serviceRoad.z0, L.serviceRoad.x + 3, L.serviceRoad.z1, T.road);
    x.strokeStyle = T.mark; x.lineWidth = 1.2 * k; x.setLineDash([5 * k, 6 * k]);
    x.beginPath(); x.moveTo(X(L.road.x0), Z(L.road.z)); x.lineTo(X(L.road.x1), Z(L.road.z)); x.stroke(); x.setLineDash([]);
    /* Parking : places en rang. */
    const P = L.parking;
    rect(P.x0, P.z0, P.x1, P.z1, T.park, T.edge, 1);
    x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 1 * k;
    for (let px = P.x0 + 12; px < P.x1; px += 12) { x.beginPath(); x.moveTo(X(px), Z(P.z0 + 4)); x.lineTo(X(px), Z(P.z1 - 4)); x.stroke(); }
    /* Fret, carburant, pompiers, heliport, aviation legere. */
    const c = L.cargo;
    rect(c.x0, c.z0, c.x1, c.z1, T.cargo, T.cargoLine);
    const fr = L.fireStation;
    rect(L.fireApron.x0, L.fireApron.z0, L.fireApron.x1, L.fireApron.z1, T.apron);
    rect(fr.x0, fr.z0, fr.x1, fr.z1, '#dc2626', '#fecaca');
    for (const tk of L.fuelFarm.tanks) {
      x.fillStyle = '#e5e7eb'; x.strokeStyle = '#64748b'; x.lineWidth = 1.4 * k;
      x.beginPath(); x.arc(X(tk.x), Z(tk.z), L.fuelFarm.r / (M.x1 - M.x0) * w, 0, Math.PI * 2); x.fill(); x.stroke();
    }
    rect(L.fuelFarm.shed.x0, L.fuelFarm.shed.z0, L.fuelFarm.shed.x1, L.fuelFarm.shed.z1, '#94a3b8');
    const hp = L.helipad;
    x.fillStyle = T.apron; x.strokeStyle = '#fde047'; x.lineWidth = 2 * k;
    x.beginPath(); x.arc(X(hp.x), Z(hp.z), hp.r / (M.x1 - M.x0) * w * 1.15, 0, Math.PI * 2); x.fill(); x.stroke();
    x.fillStyle = '#fde047'; x.font = `900 ${15 * k}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('H', X(hp.x), Z(hp.z) + k);
    /* Hangars. */
    for (const hg of L.hangars) {
      rect(hg.x0, hg.z0, hg.x1, hg.z1, T.hangar, T.hangarLine);
      x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 1 * k;
      for (let zz = hg.z0 + 12; zz < hg.z1; zz += 12) { x.beginPath(); x.moveTo(X(hg.x0), Z(zz)); x.lineTo(X(hg.x1), Z(zz)); x.stroke(); }
    }
    /* Avion gare + passerelle + terminal. */
    drawPlane(x, X(L.standS2.x), Z(L.standS2.z), Math.PI, 15 * k, '#e2e8f0', 'rgba(15,23,42,0.5)', k);
    rect(357.5, 1168, 362.5, 1198, '#94a3b8');
    const t = L.terminal;
    rect(t.x0, t.z0, t.x1, t.z1, T.term, T.termLine, 2.4);
    x.fillStyle = 'rgba(56,189,248,0.55)';
    x.fillRect(X(t.x0) + 3 * k, Z(t.z0) - 1 * k, X(t.x1) - X(t.x0) - 6 * k, 3.4 * k);
    /* Tour + bureau. */
    const o = L.office;
    rect(o.x0, o.z0, o.x1, o.z1, '#a78bfa');
    x.fillStyle = '#7c3aed'; x.strokeStyle = '#ede9fe'; x.lineWidth = 2 * k;
    x.beginPath(); x.arc(X(L.tower.x), Z(L.tower.z), L.tower.r / (M.x1 - M.x0) * w * 1.5, 0, Math.PI * 2); x.fill(); x.stroke();

    /* Arbres, uniquement sur l'herbe. */
    const solid = [
      [rw.x - 30, M.z0, rw.x + 30, M.z1], [L.taxiway.x - 18, M.z0, L.taxiway.x + 18, M.z1],
      [L.apron.x0 - 5, L.apron.z0 - 5, L.apron.x1 + 5, L.apron.z1 + 5], [L.road.x0 - 5, L.road.z - 12, L.road.x1 + 5, L.road.z + 12],
      [P.x0 - 6, P.z0 - 6, P.x1 + 6, P.z1 + 6], [t.x0 - 6, t.z0 - 6, t.x1 + 6, t.z1 + 6],
      [c.x0 - 6, c.z0 - 6, c.x1 + 6, c.z1 + 6], [L.fireApron.x0 - 6, L.fireApron.z0 - 6, fr.x1 + 6, fr.z1 + 6],
      [L.fuelFarm.shed.x0 - 12, L.fuelFarm.tanks[0].z - 14, L.fuelFarm.shed.x1 + 12, L.fuelFarm.shed.z1 + 10], [L.gaApron.x0 - 6, L.gaApron.z0 - 6, L.gaApron.x1 + 6, L.gaApron.z1 + 6], [hp.x - 22, hp.z - 22, hp.x + 22, hp.z + 22], [L.entrance.x - 14, L.entrance.z0 - 10, L.entrance.x + 14, L.entrance.z1 + 10],
      [L.serviceRoad.x - 8, L.serviceRoad.z0, L.serviceRoad.x + 8, L.serviceRoad.z1],
      [L.tower.x - 22, L.tower.z - 22, L.tower.x + 22, L.tower.z + 22],
      [PARK.area.x0, PARK.area.z0, PARK.area.x1, PARK.area.z1],
      ...L.hangars.map(hg => [hg.x0 - 8, hg.z0 - 8, hg.x1 + 8, hg.z1 + 8])
    ];
    const trng = seeded('map-trees');
    let placed = 0;
    const maxTrees = Math.round(46 * Math.min(area, 2.5));
    for (let i = 0; i < 700 * Math.min(area, 3) && placed < maxTrees; i++) {
      const wx = M.x0 + trng() * (M.x1 - M.x0), wz = M.z0 + trng() * (M.z1 - M.z0);
      if (solid.some(s => wx > s[0] && wx < s[2] && wz > s[1] && wz < s[3])) continue;
      placed++;
      x.fillStyle = T.treeShade;
      x.beginPath(); x.arc(X(wx) + 1.5 * k, Z(wz) + 2 * k, 6.5 * k, 0, Math.PI * 2); x.fill();
      x.fillStyle = T.tree;
      x.beginPath(); x.arc(X(wx), Z(wz), 6 * k, 0, Math.PI * 2); x.fill();
    }

    /* Icones des lieux + etiquettes (grande carte seulement). */
    emoji('🏢', (t.x0 + t.x1) / 2 + 60, (t.z0 + t.z1) / 2, 22);
    emoji('🛹', (PARK.area.x0 + PARK.area.x1) / 2, (PARK.area.z0 + PARK.area.z1) / 2, 20);
    emoji('🗼', L.tower.x, L.tower.z, 20);
    emoji('🔧', 540, 900, 18); emoji('🔧', 540, 1010, 18); emoji('🔧', 540, 1120, 18);
    emoji('🅿️', (P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2, 20);
    emoji('📦', (c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, 18);
    emoji('🚒', (fr.x0 + fr.x1) / 2, (fr.z0 + fr.z1) / 2, 17);
    emoji('⛽', L.fuelFarm.tanks[1].x, L.fuelFarm.tanks[0].z, 15);
    pill('TERMINAL', (t.x0 + t.x1) / 2, t.z1 + 14);
    pill('SKATEPARK', (PARK.area.x0 + PARK.area.x1) / 2, PARK.area.z1 + 11);
    pill('TOUR', L.tower.x, L.tower.z - 26);
    pill('HANGARS', 541, 850);
    pill('PARKING', (P.x0 + P.x1) / 2, P.z1 + 12);
    pill('AIRE DES AVIONS', 330, 892);
    pill('PISTE', rw.x, 1330);
    pill('FRET', (c.x0 + c.x1) / 2, c.z0 - 10);
    pill('CARBURANT', L.fuelFarm.tanks[1].x, L.fuelFarm.tanks[0].z - 18);
    pill('POMPIERS', (fr.x0 + fr.x1) / 2, fr.z0 - 12);
    pill('HELIPORT', hp.x + 30, hp.z - 24);
    pill('AVIATION LEGERE', L.gaApron.x1 + 34, (L.gaApron.z0 + L.gaApron.z1) / 2);
    pill('SEUIL 36', rw.x + 56, rw.zStart - 40);
    pill('SEUIL 18', rw.x + 56, rw.zEnd + 40);
    pill('PAPI', L.papi.x + 26, L.papi.z);

    /* Cadre + rose des vents. */
    x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 3 * k; x.strokeRect(0, 0, w, h);
    const cx = 27 * k, cz = 30 * k;
    x.fillStyle = 'rgba(15,23,42,0.7)';
    x.beginPath(); x.arc(cx, cz, 17 * k, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f87171';
    x.beginPath(); x.moveTo(cx, cz - 12 * k); x.lineTo(cx + 5 * k, cz + 2 * k); x.lineTo(cx - 5 * k, cz + 2 * k); x.closePath(); x.fill();
    x.fillStyle = '#fff'; x.font = `900 ${10 * k}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('N', cx, cz + 9 * k);
    return (this._bases[key] = base);
  }

  /* Dessine une carte complete (mini ou grande) dans `cv`. */
  _drawMap(cv, target) {
    const g = this.g;
    const w = cv.width, h = cv.height, k = w / 480, x = cv.getContext('2d');
    const T = performance.now() / 1000;
    const big = cv.id === 'mapBigCv';
    const M0 = big ? this._bigWin() : MAP_WIN;
    const V = big ? this._viewRect() : M0;
    const base = this._mapBase(big ? w * 2 : w, big ? h * 2 : h, M0, big);
    const fx = (V.x0 - M0.x0) / (M0.x1 - M0.x0), fz = (V.z0 - M0.z0) / (M0.z1 - M0.z0);
    x.drawImage(base, fx * base.width, fz * base.height,
      (V.x1 - V.x0) / (M0.x1 - M0.x0) * base.width, (V.z1 - V.z0) / (M0.z1 - M0.z0) * base.height, 0, 0, w, h);
    const P = (wx, wz) => [(wx - V.x0) / (V.x1 - V.x0) * w, (wz - V.z0) / (V.z1 - V.z0) * h];
    if (big) this._drawMapLabels(x, P, w, h, k);
    const clampPx = (p, m = 10 * k) => [clamp(p[0], m, w - m), clamp(p[1], m, h - m)];
    const pp = g.player;
    const [px, pz] = clampPx(P(pp.pos.x, pp.pos.z));
    const mPerPx = (V.x1 - V.x0) / w;

    /* Radar des pieces cachees : un anneau qui grandit autour de toi. */
    const R = TREASURE_RADAR;
    const rr = R / mPerPx;
    const pulse = (T * 0.7) % 1;
    x.strokeStyle = `rgba(253,224,71,${0.5 * (1 - pulse)})`; x.lineWidth = 2.2 * k;
    x.beginPath(); x.arc(px, pz, rr * pulse, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = 'rgba(253,224,71,0.22)'; x.lineWidth = 1.2 * k; x.setLineDash([4 * k, 5 * k]);
    x.beginPath(); x.arc(px, pz, rr, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);

    /* Pas du joueur : petites empreintes qui s'effacent. */
    const tr = this._trail || [];
    for (let i = 0; i < tr.length; i++) {
      const [tx, tz] = P(tr[i].x, tr[i].z);
      x.fillStyle = `rgba(255,255,255,${0.12 + 0.4 * (i / tr.length)})`;
      x.beginPath(); x.arc(tx, tz, (2 + 1.6 * (i / tr.length)) * k, 0, Math.PI * 2); x.fill();
    }

    /* Chemin en pointilles vers l'objectif. */
    if (target) {
      const [tx, tz] = clampPx(P(target.x, target.z), 14 * k);
      x.save();
      x.strokeStyle = '#fde047'; x.lineWidth = 3 * k; x.lineCap = 'round';
      x.setLineDash([2 * k, 8 * k]); x.lineDashOffset = -T * 20 * k;
      /* Vrai itineraire (graphe de navigation), recalcule 2 fois par seconde. */
      const now = performance.now();
      if (!this._routeAt || now - this._routeAt > 500 || this._routeKey !== target.x + ',' + target.z) {
        this._routeAt = now; this._routeKey = target.x + ',' + target.z;
        try { this._route = g.nav && g.state === 'HUB' ? g.nav.waypoints(pp.pos, target) : null; } catch (e) { this._route = null; }
      }
      x.beginPath(); x.moveTo(px, pz);
      if (this._route && this._route.length) for (const q of this._route) { const [qx, qz] = P(q.x, q.z); x.lineTo(qx, qz); }
      else x.lineTo(tx, tz);
      x.stroke();
      x.restore();
    }

    /* Vie de l'aeroport. */
    const life = g.r3d.life;
    if (life) {
      for (const d of life.dots) {
        const [dx, dz] = P(d.x, d.z);
        if (dx < 0 || dz < 0 || dx > w || dz > h) continue;
        if (big) {
          drawIcon(x, d.k === 'a' ? '✈️' : d.k === 'h' ? '🚁' : '🚚', dx, dz, (d.k === 'a' ? 22 : 16) * k);
        } else {
          x.fillStyle = d.k === 'a' ? '#ffffff' : d.k === 'h' ? '#f87171' : '#fde047';
          x.strokeStyle = '#0f172a'; x.lineWidth = 1.2 * k;
          x.beginPath(); x.arc(dx, dz, (d.k === 'a' ? 5.5 : 3.4) * k, 0, Math.PI * 2); x.fill(); x.stroke();
        }
      }
    }

    /* Avion du joueur, oriente comme il l'est vraiment. */
    const ac = g.ac;
    if (g.state !== 'PILOT') {
      const f = ac.forward();
      const [ax, az] = clampPx(P(ac.pos.x, ac.pos.z));
      drawPlane(x, ax, az, Math.atan2(f.x, f.z), 15 * k, '#ffffff', '#0f172a', k);
    }

    /* Pieces cachees a portee de radar. */
    const tz0 = this.data.treasure;
    if (tz0) {
      tz0.spots.forEach((s, i) => {
        if (tz0.got[i]) return;
        if (Math.hypot(s[0] - pp.pos.x, s[1] - pp.pos.z) > R) return;
        const [sx, sz] = P(s[0], s[1]);
        const k2 = 1 + Math.sin(T * 5 + i) * 0.25;
        x.fillStyle = '#fde047'; x.strokeStyle = '#78350f'; x.lineWidth = 1.6 * k;
        x.beginPath();
        for (let j = 0; j < 8; j++) {
          const rad = (j % 2 ? 2.6 : 8) * k * k2, ang = j * Math.PI / 4;
          x.lineTo(sx + Math.cos(ang) * rad, sz + Math.sin(ang) * rad);
        }
        x.closePath(); x.fill(); x.stroke();
      });
    }

    /* Cible de l'objectif : grosse etoile qui pulse + onde. */
    if (target) {
      const [tx, tz] = clampPx(P(target.x, target.z), 16 * k);
      const kk = 1 + Math.sin(T * 6) * 0.22;
      const wave = (T * 0.9) % 1;
      x.strokeStyle = `rgba(253,224,71,${0.7 * (1 - wave)})`; x.lineWidth = 3 * k;
      x.beginPath(); x.arc(tx, tz, (10 + 22 * wave) * k, 0, Math.PI * 2); x.stroke();
      x.fillStyle = '#fde047'; x.strokeStyle = '#78350f'; x.lineWidth = 2.6 * k;
      x.beginPath();
      for (let i = 0; i < 10; i++) {
        const rad = (i % 2 ? 6.5 : 15) * k * kk, ang = -Math.PI / 2 + i * Math.PI / 5;
        x.lineTo(tx + Math.cos(ang) * rad, tz + Math.sin(ang) * rad);
      }
      x.closePath(); x.fill(); x.stroke();
    }

    /* Toi : halo qui respire + fleche de direction. */
    const halo = 0.5 + 0.5 * Math.sin(T * 4);
    x.fillStyle = `rgba(239,68,68,${0.16 + 0.16 * halo})`;
    x.beginPath(); x.arc(px, pz, (13 + 5 * halo) * k, 0, Math.PI * 2); x.fill();
    const hd = pp.heading;
    x.fillStyle = '#ef4444'; x.strokeStyle = '#fff'; x.lineWidth = 2.6 * k; x.lineJoin = 'round';
    x.beginPath();
    x.moveTo(px + Math.sin(hd) * 14 * k, pz + Math.cos(hd) * 14 * k);
    x.lineTo(px + Math.sin(hd + 2.5) * 10 * k, pz + Math.cos(hd + 2.5) * 10 * k);
    x.lineTo(px + Math.sin(hd - 2.5) * 10 * k, pz + Math.cos(hd - 2.5) * 10 * k);
    x.closePath(); x.fill(); x.stroke();

    /* Bandeau : lieu actuel a gauche, chasse aux pieces a droite. */
    const bh = (big ? 34 : 30) * k;
    x.fillStyle = 'rgba(15,23,42,0.82)'; x.fillRect(0, h - bh, w, bh);
    const place = this.placeAt(pp.pos.x, pp.pos.z);
    x.font = `800 ${(big ? 15 : 14) * k}px -apple-system,"Segoe UI","Apple Color Emoji","Segoe UI Emoji",sans-serif`;
    x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillStyle = '#fff';
    const isz = (big ? 18 : 16) * k;
    if (drawIcon(x, place.ico, 10 * k + isz / 2, h - bh / 2, isz)) x.fillText(place.name, 10 * k + isz + 6 * k, h - bh / 2);
    else x.fillText(`${place.ico} ${place.name}`, 10 * k, h - bh / 2);
    const th = this.treasureHeat();
    x.textAlign = 'right'; x.fillStyle = '#fde68a';
    if (th) {
      const label = `${th.found}/${th.total}`;
      x.fillText(label, w - 10 * k, h - bh / 2);
      const tw = x.measureText(label).width;
      if (!drawIcon(x, th.ico, w - 10 * k - tw - isz / 2 - 4 * k, h - bh / 2, isz)) x.fillText(th.ico, w - 10 * k - tw - 4 * k, h - bh / 2);
    }
    if (!big) drawIcon(x, '🔍', w - 18 * k, 20 * k, 18 * k);
  }

  /* Etiquettes de la grande carte : taille constante, anti-collision (essais de decalages). */
  _drawMapLabels(x, P, w, h, k) {
    const pills = this._pillSrc || [];
    const taken = [];
    for (const ic of this._iconSrc || []) {
      const [px, pz] = P(ic.wx, ic.wz);
      taken.push([px - 12 * k, pz - 12 * k, px + 12 * k, pz + 12 * k]);
    }
    x.save();
    x.font = `800 ${11 * k}px -apple-system,"Segoe UI",sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const th = 17 * k, gap = 3 * k;
    for (const p of pills) {
      const [cx0, cz0] = P(p.wx, p.wz);
      if (cx0 < -40 * k || cx0 > w + 40 * k || cz0 < -20 * k || cz0 > h + 20 * k) continue;
      const tw = x.measureText(p.txt).width + 12 * k;
      const tries = [[0, 0], [0, -th - gap], [0, th + gap], [tw / 2 + gap, 0], [-tw / 2 - gap, 0], [0, -2 * (th + gap)], [0, 2 * (th + gap)], [tw + gap, 0], [-tw - gap, 0]];
      for (const [dx, dz] of tries) {
        const cx = clamp(cx0 + dx, tw / 2 + 4 * k, w - tw / 2 - 4 * k), cz = clamp(cz0 + dz, th / 2 + 4 * k, h - 34 * k - th / 2);
        const r = [cx - tw / 2, cz - th / 2, cx + tw / 2, cz + th / 2];
        if (taken.some(t => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1])) continue;
        taken.push(r);
        x.fillStyle = 'rgba(15,23,42,0.74)';
        roundRectPath(x, r[0], r[1], tw, th, th / 2); x.fill();
        x.fillStyle = '#fff'; x.fillText(p.txt, cx, cz + k * 0.5);
        break;
      }
    }
    x.restore();
  }

  /* ---- Zoom / deplacement de la grande carte ---- */
  _bigWin() { return this._bigMode === 'full' ? MAP_FULL : MAP_WIN; }

  _viewRect() {
    const M = this._bigWin();
    const v = this._view || (this._view = { cx: (M.x0 + M.x1) / 2, cz: (M.z0 + M.z1) / 2, zoom: 1 });
    const vw = (M.x1 - M.x0) / v.zoom, vh = (M.z1 - M.z0) / v.zoom;
    v.cx = clamp(v.cx, M.x0 + vw / 2, M.x1 - vw / 2);
    v.cz = clamp(v.cz, M.z0 + vh / 2, M.z1 - vh / 2);
    return { x0: v.cx - vw / 2, x1: v.cx + vw / 2, z0: v.cz - vh / 2, z1: v.cz + vh / 2 };
  }

  /* Zoom par le facteur f, le point (px, py) (fractions du canevas) restant sous le doigt. */
  zoomMap(f, px = 0.5, py = 0.5) {
    const V = this._viewRect(), v = this._view, M = this._bigWin();
    const wx = V.x0 + (V.x1 - V.x0) * px, wz = V.z0 + (V.z1 - V.z0) * py;
    v.zoom = clamp(v.zoom * f, 1, 5);
    const vw = (M.x1 - M.x0) / v.zoom, vh = (M.z1 - M.z0) / v.zoom;
    v.cx = wx - (px - 0.5) * vw; v.cz = wz - (py - 0.5) * vh;
  }

  panMap(dx, dy) {
    const V = this._viewRect(), v = this._view;
    v.cx -= dx * (V.x1 - V.x0); v.cz -= dy * (V.z1 - V.z0);
  }

  resetMapView() { this._view = null; }

  /* Bascule « complexe » <-> « aeroport entier » : le canevas change de proportions. */
  setMapMode(mode) {
    this._bigMode = mode === 'full' ? 'full' : 'complex';
    const cv = $('mapBigCv');
    if (cv) {
      const [cw, ch] = BIG_CANVAS[this._bigMode];
      cv.width = cw; cv.height = ch;
      cv.classList.toggle('tall', this._bigMode === 'full');
    }
    const btn = $('mapModeBtn');
    if (btn) btn.textContent = this._bigMode === 'full' ? 'Complexe' : 'Tout l\'aeroport';
    this.resetMapView();
  }

  _bindMapGestures(cv) {
    if (this._gesturesBound) return;
    this._gesturesBound = true;
    cv.style.touchAction = 'none';
    const pts = new Map();
    let pinch = 0;
    const frac = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const [px, py] = frac(e); this.zoomMap(e.deltaY < 0 ? 1.25 : 0.8, px, py); }, { passive: false });
    cv.addEventListener('dblclick', (e) => { const [px, py] = frac(e); this.zoomMap(2, px, py); });
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const r = cv.getBoundingClientRect();
      if (pts.size === 1) this.panMap((e.clientX - prev[0]) / r.width, (e.clientY - prev[1]) / r.height);
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) this.zoomMap(d / pinch, ((a[0] + b[0]) / 2 - r.left) / r.width, ((a[1] + b[1]) / 2 - r.top) / r.height);
        pinch = d;
      }
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    for (const [id, f] of [['mapModeBtn', () => this.setMapMode(this._bigMode === 'full' ? 'complex' : 'full')], ['mapZoomIn', () => this.zoomMap(1.5)], ['mapZoomOut', () => this.zoomMap(1 / 1.5)], ['mapZoomReset', () => this.resetMapView()]]) {
      const btn = $(id); if (btn) btn.addEventListener('click', f);
    }
  }

  _renderMap(target) {
    const cv = $('miniMap');
    if (!cv) return;
    const g = this.g;
    const show = g.state === 'HUB';
    cv.classList.toggle('hidden', !show);
    if (!show) return;
    /* Empreintes : un point toutes les 0,8 s de marche. */
    const now = performance.now();
    if (!this._trailAt || now - this._trailAt > 800) {
      this._trailAt = now;
      this._trail = this._trail || [];
      const p = g.player.pos, last = this._trail[this._trail.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.z - p.z) > 2) this._trail.push({ x: p.x, z: p.z });
      if (this._trail.length > 14) this._trail.shift();
    }
    this._drawMap(cv, target);
  }

  /* Grande carte (overlay) : redessinee en boucle tant qu'elle est ouverte. */
  openBigMap() {
    const box = $('mapBig');
    if (!box) return;
    this._bigOpen = true;
    this.setMapMode(this._bigMode || 'complex');
    this._bindMapGestures($('mapBigCv'));
    box.classList.remove('hidden');
    $('mapBigName').textContent = this.data.name;
    const loop = () => {
      if (!this._bigOpen) return;
      this._drawMap($('mapBigCv'), this.currentGoal().target);
      requestAnimationFrame(loop);
    };
    loop();
  }
  closeBigMap() {
    this._bigOpen = false;
    const box = $('mapBig');
    if (box) box.classList.add('hidden');
  }

  /* ---------------- Chasse aux pieces cachees ---------------- */
  /* 8 pieces par jour, choisies parmi les emplacements de TREASURE_SPOTS et
     recalees sur un sol praticable. Se renouvellent chaque matin. */
  _ensureTreasure() {
    const day = todayKey();
    const g = this.g;
    if (!g.nav) return;
    let tz = this.data.treasure;
    if (!tz || tz.day !== day || !tz.spots || !tz.spots.length) {
      const rnd = seeded('tre' + day);
      const pool = TREASURE_SPOTS.slice();
      const spots = [];
      while (spots.length < TREASURE_COUNT && pool.length) {
        const s = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
        const w = g.nav.nearestWalkable(s[0], s[1], 40, 2);
        spots.push([Math.round(w.x * 10) / 10, Math.round(w.z * 10) / 10]);
      }
      tz = this.data.treasure = { day, spots, got: spots.map(() => false), bonus: false };
      this._treasureKey = '';
      this.save();
    }
    const key = tz.day + ':' + tz.got.join('');
    if (this._treasureKey !== key) {
      this._treasureKey = key;
      const r3d = g.r3d;
      r3d.setTreasures(tz.spots.map(s => ({ x: s[0], z: s[1] })));
      tz.got.forEach((v, i) => { if (v) r3d.hideTreasure(i); });
    }
  }

  /* Distance a la piece la plus proche → indice « chaud / froid ». */
  treasureHeat() {
    const tz = this.data.treasure;
    if (!tz) return null;
    const found = tz.got.filter(Boolean).length;
    const total = tz.got.length;
    if (found >= total) return { ico: '✅', txt: 'Toutes les pieces du jour sont trouvees !', found, total, d: Infinity };
    const p = this.g.player.pos;
    let d = Infinity;
    tz.spots.forEach((s, i) => { if (!tz.got[i]) d = Math.min(d, Math.hypot(s[0] - p.x, s[1] - p.z)); });
    let ico = '🥶', txt = 'Froid...';
    if (d < 25) { ico = '🔥'; txt = 'BRULANT ! Tu y es presque !'; }
    else if (d < 70) { ico = '♨️'; txt = 'Chaud !'; }
    else if (d < 160) { ico = '🙂'; txt = 'Tiede...'; }
    return { ico, txt, found, total, d };
  }

  _updateTreasure(dt) {
    const g = this.g;
    const inHub = g.state === 'HUB';
    this._ensureTreasure();
    g.r3d.spinTreasures(g.time, inHub);
    g.r3d.animateDecor(g.time, inHub);
    const tz = this.data.treasure;
    if (!tz || !inHub) return;
    const p = g.player.pos;
    for (let i = 0; i < tz.spots.length; i++) {
      if (tz.got[i]) continue;
      if (Math.hypot(tz.spots[i][0] - p.x, tz.spots[i][1] - p.z) > 2.8) continue;
      tz.got[i] = true;
      g.r3d.hideTreasure(i);
      this._treasureKey = tz.day + ':' + tz.got.join('');
      const n = tz.got.filter(Boolean).length;
      sfx.sparkle();
      this.data.stats.treasure++;
      this._bumpCombo();
      this.giveCoins(3, { silent: true });
      this.popup(`✨ Piece cachee ! ${n}/${tz.got.length}  +3 🪙`);
      this.confetti(14);
      if (n === tz.got.length && !tz.bonus) {
        tz.bonus = true;
        this.data.stats.treasureDays++;
        this.giveCoins(25, { silent: true, xp: 20 });
        this.giveStars(1);
        sfx.tada(); this.confetti(90);
        g.toast('🗺️ TOUTES les pieces du jour ! Bonus +25 🪙 et 1 ⭐', 5000, 'ok');
      }
      this.save();
    }
  }

  /* ---------------- Petits gestes (menu Fun) ---------------- */
  /* Recharges (secondes de jeu) des gestes qui ont un effet sur le jeu. */
  static get COOLDOWNS() { return { announce: 25, candy: 12, music: 30 }; }

  /* Un « boost » d'ambiance : satisfaction de la cabine ou ambiance du hall. */
  _boost(n) {
    const g = this.g;
    if (g.state === 'CABIN') g.cabin.boost(n, 1);
    else if (g.inTerminal) g.terminal.mood = Math.min(100, g.terminal.mood + n);
  }

  emote(kind) {
    if (!this.on) return;
    const g = this.g;
    const cd = Arcade.COOLDOWNS[kind];
    if (cd) {
      if ((this._cd[kind] || 0) > g.time) { this.popup('⏳ Patiente un peu...'); return; }
      this._cd[kind] = g.time + cd;
    }
    const ANNOUNCES = [
      'Mesdames et messieurs, bienvenue a bord ! Ici votre steward prefere.',
      'Attention : le duty-free vend des bonbons... et des rires !',
      'Nous volons a 10 000 metres. Merci de ne pas ouvrir la fenetre.',
      'Pour votre securite, gardez le sourire attache.',
      'Le commandant vous salue, il a dit que c\'etait facile !'
    ];
    const E = {
      announce: { ico: '📢', txt: 'Annonce !', snd: () => { sfx.hello(); this._boost(2.5); g.toast('📢 ' + ANNOUNCES[Math.floor(Math.random() * ANNOUNCES.length)], 3600); } },
      candy:    { ico: '🍬', txt: 'Bonbons pour tous !', snd: () => { sfx.pop(); this._boost(1.5); this.giveCoins(1, { silent: true }); } },
      music:    { ico: '🎵', txt: 'Musique !', snd: () => { sfx.jingle(); this._boost(2); } },
      honk:   { ico: '📯', txt: 'PIIIIP !',      snd: () => sfx.honk() },
      hello:  { ico: '👋', txt: 'Salut !',       snd: () => sfx.hello() },
      party:  { ico: '🎉', txt: 'Fete !',        snd: () => { sfx.tada(); this.confetti(60); } },
      dance:  { ico: '💃', txt: 'On danse !',    snd: () => { sfx.pop(); this._danceT = 2.2; } },
      /* Au sol, un vrai selfie qui part dans l'album (fun.selfie) ; ailleurs, juste le flash. */
      selfie: { ico: '📸', txt: 'Cheese !',      snd: () => { if (!(g.fun && g.fun.selfie())) { sfx.shutter(); this._flash(); } } }
    }[kind];
    if (!E) return;
    E.snd();
    if (g.pet) g.pet.cheer(kind);          // Biscuit participe a la fete
    this.data.stats[kind] = (this.data.stats[kind] || 0) + 1;
    this.floatEmoji(E.ico, (kind === 'dance' || kind === 'music') ? 3 : kind === 'candy' ? 2 : 1);
    this.popup(`${E.ico} ${E.txt}`);
    this.giveXpQuiet(1);
    /* Mission « selfie » : il faut etre pres du lieu demande. */
    const q = this.quest;
    if (q && q.needSelfie && kind === 'selfie' && this.g.state === 'HUB') {
      const p = this.g.player.pos;
      if (Math.hypot(q.target.x - p.x, q.target.z - p.z) < 14) this._endQuest(true);
    }
    this.save();
  }

  giveXpQuiet(n) { if (this.on) this.addXp(n); }

  /* Emoji qui monte au-dessus du joueur (position ecran calculee depuis la camera). */
  floatEmoji(ico, count = 1) {
    const host = $('popHost');
    if (!host) return;
    let lx = 50, ly = 55;
    try {
      const g = this.g;
      if (g.state !== 'HUB') throw new Error('centre');
      const v = g.player.pos.clone(); v.y += 2.4;
      v.project(g.r3d.camera);
      if (v.z < 1) { lx = clamp((v.x * 0.5 + 0.5) * 100, 6, 94); ly = clamp((-v.y * 0.5 + 0.5) * 100, 8, 90); }
    } catch (e) { /* position par defaut */ }
    for (let i = 0; i < count * 3; i++) {
      const el = document.createElement('div');
      el.className = 'emote-float';
      el.textContent = count > 1 ? ['🎵', '🎶', ico][i % 3] : ico;
      el.style.left = `${lx + (Math.random() - 0.5) * 8}%`;
      el.style.top = `${ly}%`;
      el.style.setProperty('--dx', `${(Math.random() - 0.5) * 90}px`);
      el.style.animationDelay = `${i * 0.12}s`;
      host.appendChild(el);
      setTimeout(() => el.remove(), 2200 + i * 120);
    }
  }

  _flash() {
    const el = document.createElement('div');
    el.className = 'photo-flash';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  /* Le joueur tourne sur lui-meme pendant une danse. */
  _updateDance(dt) {
    if (!(this._danceT > 0)) return;
    this._danceT -= dt;
    const g = this.g;
    if (g.state === 'HUB' && !g.player.moving) g.player.heading += dt * 9;
    else this._danceT = 0;
  }

  /* ---------------- Cadeau du jour ---------------- */
  giftReady() { return !this.data.gift || this.data.gift.day !== todayKey(); }

  openGift() {
    if (!this.giftReady()) return null;
    const gf = this.data.gift || { day: '', streak: 0, last: '' };
    const y = new Date(Date.now() - 864e5);
    const yKey = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
    const streak = gf.day === yKey ? gf.streak + 1 : 1;
    const coins = 8 + Math.min(streak, 7) * 3 + Math.floor(Math.random() * 5);
    this.data.gift = { day: todayKey(), streak };
    this.giveCoins(coins, { silent: true, xp: 5 });
    sfx.tada(); this.confetti(80);
    this.save();
    return { coins, streak };
  }

  /* Le dock de gestes s'adapte au lieu : tarmac, terminal ou cabine. */
  _updateDock() {
    const g = this.g, dock = $('funDock');
    if (!dock) return;
    const scope = g.state === 'CABIN' ? 'cabin' : g.state === 'HUB' ? (g.inTerminal ? 'term' : 'hub') : '';
    dock.classList.toggle('hidden', !scope);
    if (scope !== this._dockScope) {
      this._dockScope = scope;
      dock.querySelectorAll('[data-emote]').forEach(b => {
        b.classList.toggle('hidden', !(b.dataset.scope || 'hub term cabin').split(' ').includes(scope));
      });
    }
    const cds = Arcade.COOLDOWNS;
    for (const k in cds) {
      const b = dock.querySelector(`[data-emote="${k}"]`);
      if (b) b.classList.toggle('cool', (this._cd[k] || 0) > g.time);
    }
  }

  /* ---------------- Cabine : objectif de service, visage, resume ---------------- */
  _updateCabinHud(dt) {
    const g = this.g, inCabin = g.state === 'CABIN';
    if (inCabin && this._prevState !== 'CABIN') {
      this.cabinSess = { served: 0, goal: 5, rounds: 0, sat0: g.cabin.satisfaction };
    }
    if (!inCabin && this._prevState === 'CABIN' && this.cabinSess) this._cabinSummary();
    this._prevState = g.state;
    if (!inCabin || !this.cabinSess) return;
    const s = this.cabinSess;
    if (s.served >= s.goal) {
      s.rounds++;
      const bonus = 6 + s.rounds * 3;
      sfx.tada(); this.confetti(50);
      this.giveCoins(bonus, { silent: true, xp: 6, label: 'Objectif de service !' });
      g.toast(`🎯 Service reussi ! +${bonus} 🪙 — encore ${s.goal + 3} passagers pour le suivant !`, 3600, 'ok');
      s.goal += 3;
    }
    const sat = g.cabin.satisfaction;
    const face = sat >= 88 ? '😍' : sat >= 70 ? '😀' : sat >= 50 ? '🙂' : sat >= 30 ? '😕' : '😠';
    $('cabGoal').textContent = `${face} Service : ${s.served}/${s.goal}`;
    const tt = $('turbText');
    if (tt && tt.dataset.kid !== '1') { tt.dataset.kid = '1'; tt.textContent = '🌩️ TURBULENCES ! Appuie vite sur ANNONCER'; }
  }

  _cabinSummary() {
    const s = this.cabinSess;
    this.cabinSess = null;
    if (!s || s.served < 1) return;
    const sat = Math.round(this.g.cabin.satisfaction);
    const face = sat >= 85 ? '😍' : sat >= 60 ? '🙂' : '😕';
    if (sat >= 85 && s.served >= 3) { this.giveStars(1); this.g.toast(`${face} Service termine : ${s.served} passagers, ${sat} % contents ! +1 ⭐`, 4200, 'ok'); }
    else this.g.toast(`${face} Service termine : ${s.served} passagers servis, ${sat} % contents.`, 3600, 'ok');
    this.save();
  }

  /* Recompense d'un service en cabine (appele par main.js) ; req = { row, side, type }. */
  cabinServed(req) {
    if (!this.on || !req) return;
    const R = {
      bonbon: [2, '😋'], ballon: [3, '🥰'], anniv: [7, '🥳'], medical: [4, '💖'], quiz: [0, '🤓']
    }[req.type] || [2, '😊'];
    if (R[0]) this.giveCoins(R[0], { label: req.type === 'anniv' ? 'Joyeux anniversaire !' : 'Servi !' });
    if (req.type === 'anniv') { sfx.jingle(); this.confetti(60); }
    try { this.g.r3d.cabinReact(req.row, req.side, R[1]); } catch (e) { /* cabine non construite */ }
    this.event('cabinServe');
  }

  /* ---------------- Combo ---------------- */
  get comboMult() { return Math.min(5, 1 + Math.floor(this.combo.n / 3)); }

  _bumpCombo() {
    const c = this.combo;
    const before = this.comboMult;
    c.n++; c.t = COMBO_TIME;
    const m = this.comboMult;
    this.data.stats.bestCombo = Math.max(this.data.stats.bestCombo || 0, m);
    if (m > 1) {
      /* Chaque action au-dela du 3e enchainement rapporte (m-1) pieces de plus. */
      this.giveCoins(m - 1, { silent: true });
      this.popup(`🔥 COMBO x${m} ! +${m - 1} 🪙`);
      if (m > before) { sfx.levelUp(); this.confetti(25); }
    }
  }

  _updateCombo(dt) {
    const c = this.combo;
    if (c.n > 0) {
      c.t -= dt;
      if (c.t <= 0) {
        if (this.comboMult > 1) this.g.toast(`Combo termine : ${c.n} actions enchainees !`, 2400, 'ok');
        c.n = 0; c.t = 0;
      }
    }
    const chip = $('comboChip');
    if (!chip) return;
    const show = c.n >= 2 && this.g.state !== 'BOOT';
    chip.classList.toggle('hidden', !show);
    if (show) {
      const m = this.comboMult;
      $('comboTxt').textContent = m > 1 ? `🔥 COMBO x${m}` : `⚡ x${c.n}`;
      $('comboFill').style.width = `${Math.round(clamp(c.t / COMBO_TIME, 0, 1) * 100)}%`;
      chip.dataset.lvl = m;
    }
  }

  /* ---------------- Missions flash ---------------- */
  randomSpot() {
    const s = TREASURE_SPOTS[Math.floor(Math.random() * TREASURE_SPOTS.length)];
    const w = this.g.nav.nearestWalkable(s[0], s[1], 40, 2);
    return { x: w.x, z: w.z };
  }

  /* Position monde d'un poste du terminal (un peu devant, cote joueur). */
  counterPos(id, off = 3) {
    const c = this.g.terminal.counters[id];
    return c ? { x: c.pos[0], z: c.pos[1] + off } : null;
  }

  _startQuest() {
    const g = this.g;
    /* Dans le terminal : missions du hall ; dehors : missions du tarmac. */
    const pool = g.inTerminal ? TERM_QUESTS : QUESTS;
    const def = pool[Math.floor(Math.random() * pool.length)];
    const tg = def.pick(this);
    const w = tg ? g.nav.nearestWalkable(tg.x, tg.z, 40, 2) : null;
    this.quest = {
      id: def.id, ico: def.ico, text: def.text, reward: def.reward, t: def.time, total: def.time,
      target: w ? { x: w.x, z: w.z } : null, needSelfie: !!def.needSelfie,
      def, goal: def.goal || 0, prog: 0, base: def.base ? def.base(g.terminal) : 0, hold: 0
    };
    sfx.ding();
    this.g.toast(`⚡ MISSION FLASH ! ${def.text}`, 4200, 'ok');
    this._lastText = null;              // force la mise a jour de la barre d'objectif
  }

  _endQuest(ok) {
    const q = this.quest;
    this.quest = null;
    this._questCd = 45 + Math.random() * 45;
    this._lastText = null;
    if (ok) {
      this.data.stats.quests = (this.data.stats.quests || 0) + 1;
      sfx.tada(); this.confetti(45);
      this.giveCoins(q.reward, { silent: true, xp: 8, label: 'Mission flash reussie !' });
      this._bumpCombo();
    } else {
      this.g.toast('⏱ Trop tard... pas grave, une autre mission arrive bientot !', 3000);
    }
    this.save();
  }

  _updateQuest(dt) {
    const g = this.g, bar = $('questBar');
    if (!this.data.tutorialDone) { if (bar) bar.classList.add('hidden'); return; }
    if (this.quest) {
      /* Le chrono ne tourne que sur le tarmac : monter dans l'avion met la mission en pause. */
      if (g.state === 'HUB') {
        const q = this.quest;
        q.t -= dt;
        const p = g.player.pos;
        if (q.def.cur || q.def.hold) {
          /* Mission du terminal : on lit les compteurs du hall. */
          if (q.def.hold) { if (q.def.ok(g.terminal)) q.hold += dt; else q.hold = Math.max(0, q.hold - dt * 0.5); q.prog = Math.floor(q.hold); }
          else q.prog = Math.max(0, Math.min(q.goal, q.def.cur(g.terminal, q.base)));
          if (q.prog >= q.goal) return this._endQuest(true);
        } else {
          const d = Math.hypot(q.target.x - p.x, q.target.z - p.z);
          if (d < (q.needSelfie ? 14 : 4.5) && !q.needSelfie) return this._endQuest(true);
        }
        if (q.t <= 0) this._endQuest(false);
      }
    } else if (g.state === 'HUB') {
      this._questCd -= dt;
      if (this._questCd <= 0 && !g.controlled) this._startQuest();
    }
    if (!bar) return;
    const q = this.quest;
    bar.classList.toggle('hidden', !q || g.state !== 'HUB');
    if (q) {
      $('questTime').textContent = Math.max(0, Math.ceil(q.t));
      $('questFill').style.width = `${Math.round(clamp(q.t / q.total, 0, 1) * 100)}%`;
      bar.classList.toggle('urgent', q.t < 15);
      $('questReward').textContent = `+${q.reward} 🪙`;
      $('questProg').textContent = q.goal ? `${q.prog}/${q.goal}` : '';
    }
  }

  /* ---------------- HUD de vol : etapes + jauge de douceur ---------------- */
  _renderFlightHud() {
    const steps = $('flightSteps'), meter = $('landMeter');
    if (!steps || !meter) return;
    const g = this.g, ac = g.ac;
    const inFlight = g.state === 'PILOT' && !g.reportShown && !ac.crashed;
    steps.classList.toggle('hidden', !inFlight);
    if (!inFlight) { meter.classList.add('hidden'); return; }
    const done = this.ringsThisFlight >= RING_TOTAL;
    let cur = 0;
    if (!ac.onGround) cur = (done || g.assist.landing) ? 2 : 1;
    if (ac.onGround && ac.touchdown) cur = 2;
    [...steps.querySelectorAll('[data-fs]')].forEach((el, i) => {
      el.classList.toggle('cur', i === cur);
      el.classList.toggle('done', i < cur);
    });
    $('fsRings').textContent = `${Math.min(this.ringsThisFlight, RING_TOTAL)}/${RING_TOTAL}`;

    /* Jauge de douceur : seulement en descente vers le sol. Aiguille a gauche = tres doux. */
    const agl = ac.pos.y;
    const sink = -ac.vel.y * 196.85;                       // ft/min vers le bas
    const show = !ac.onGround && agl < 45 && ac.vel.y < -0.3 && (g.assist.landing || ac.gearDown);
    meter.classList.toggle('hidden', !show);
    if (!show) return;
    const pos = clamp(sink / 600, 0, 1);
    $('lmNeedle').style.left = `${Math.round(pos * 100)}%`;
    const txt = sink < 230 ? ['Parfait, continue comme ca !', 'ok'] : sink < 320 ? ['Un peu vite... tire doucement', 'mid'] : ['Trop vite ! Tire vers le haut', 'bad'];
    const t = $('lmTxt');
    t.textContent = txt[0];
    meter.dataset.lvl = txt[1];
  }

  /* ---------------- Trophees ---------------- */
  checkBadges() {
    if (!this.on) return;
    for (const b of BADGES) {
      if (this.data.badges[b.id] || !b.test(this.data)) continue;
      this.data.badges[b.id] = todayKey();
      sfx.tada(); this.confetti(60);
      this.g.toast(`🏅 Nouveau trophee : ${b.name} !`, 4200, 'ok');
      this.save();
    }
  }

  badgeCount() { return BADGES.filter(b => this.data.badges[b.id]).length; }

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
    this.data.name = v || 'Mon aeroport';
    this.save();
    return this.data.name;
  }

  setTheme(id) {
    if (!MAP_THEMES[id] || !this.data.themes.includes(id)) return false;
    this.data.mapTheme = id;
    this.save();
    return true;
  }

  buyTheme(id) {
    const th = MAP_THEMES[id];
    if (!th || this.data.themes.includes(id) || this.coins < th.cost) return false;
    const t = this.g.tycoon;
    t.cash -= th.cost * COIN;
    t.save();
    this.data.themes.push(id);
    this.data.mapTheme = id;
    sfx.levelUp(); this.confetti(50);
    this.save();
    return true;
  }

  /* Barre d'objectif avec fleche directionnelle. */
  _renderBar(goal) {
    const bar = $('objBar');
    if (!bar) return;
    const g = this.g;
    const visible = g.state !== 'BOOT';
    bar.classList.toggle('hidden', !visible);
    if (!visible) return;
    if (this._lastText !== goal.text) {
      this._lastText = goal.text;
      $('objIcon').textContent = goal.icon;
      $('objText').textContent = goal.text;
      if (g.fun && g.fun.data.voice) g.voice.speak(goal.text, { prio: 0 });     // F01 : l'objectif est lu a voix haute
      bar.classList.remove('pulse'); void bar.offsetWidth; bar.classList.add('pulse');
    }
    /* Tutoriel : on peut toujours passer l'etape (jamais bloque). */
    const sk = $('objSkip');
    if (sk) {
      sk.classList.toggle('hidden', !this.step || g.state === 'BOOT');
      if (!sk._bound) { sk._bound = true; sk.addEventListener('click', () => this.skipStep()); }
    }
    const arrow = $('objArrow');
    const dist = $('objDist');
    const rel = this._relativeAngle(goal.target);
    if (rel == null) {
      arrow.classList.add('hidden');
      dist.textContent = '';
    } else {
      arrow.classList.remove('hidden');
      arrow.style.transform = `rotate(${rel.rot.toFixed(3)}rad)`;
      dist.textContent = rel.d < 999 ? `${Math.round(rel.d)} m` : `${(rel.d / 1000).toFixed(1)} km`;
      arrow.classList.toggle('near', rel.d < 14);
    }
  }

  /* Angle ecran (rad, 0 = tout droit) et distance vers une cible monde. */
  _relativeAngle(target, forced = false) {
    const g = this.g;
    let px, pz, fx, fz;
    if (g.state === 'HUB') {
      px = g.player.pos.x; pz = g.player.pos.z;
      fx = Math.sin(g.player.heading); fz = Math.cos(g.player.heading);
    } else if (g.state === 'CABIN') {
      /* Repere cabine : la fleche montre le passager a servir, sinon le devant. */
      px = g.attendant.x || 0; pz = g.attendant.z;
      fx = Math.sin(g.attendant.heading); fz = Math.cos(g.attendant.heading);
      target = this.cabinTarget();
    } else if (g.state === 'PILOT') {
      px = g.ac.pos.x; pz = g.ac.pos.z;
      const f = g.ac.forward();
      const l = Math.hypot(f.x, f.z) || 1;
      fx = f.x / l; fz = f.z / l;
      /* Aux commandes, le point du hub ne veut plus rien dire : la fleche
         montre l'anneau, sinon la piste. */
      if (!forced) {
        target = null;
        if (g.sky && g.sky.m) target = g.sky.target();
        else if (this.ring) target = { x: this.ring.x, z: this.ring.z };
        else if (this.wantRunwayArrow()) target = g.ac.heli ? { x: 95, z: 1190 } : { x: 0, z: -1500 };
      }
    } else {
      return null;
    }
    if (!target) return null;
    const dx = target.x - px, dz = target.z - pz;
    const d = Math.hypot(dx, dz);
    const rx = -fz, rz = fx;                 // droite ecran
    const rot = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    return { rot, d };
  }

  /* Cible en cabine : le passager qui attend depuis le plus longtemps, sinon la porte
     si l'objectif est termine, sinon le galley. */
  cabinTarget() {
    const g = this.g, cab = g.cabin;
    let best = null, bt = Infinity;
    for (const r of cab.requests) {
      if (r.timeLeft < bt) {
        const seat = g.r3d.cabinSeats && g.r3d.cabinSeats.find(s => s.row === r.row && s.side === r.side);
        if (seat) { bt = r.timeLeft; best = { x: seat.group.position.x, z: seat.group.position.z }; }
      }
    }
    if (best) return best;
    return { x: 0, z: 0.9 };
  }

  /* En vol, la fleche montre la piste une fois les anneaux faits. */
  wantRunwayArrow() {
    return !this.ring && !this.g.ac.onGround;
  }

  _renderChips() {
    const c = $('coinChip');
    if (!c) return;
    const g = this.g;
    c.classList.toggle('hidden', g.state === 'BOOT');
    const coins = this.coins;
    if (this._lastCoins !== coins || this._lastStars !== this.data.stars || this._lastLvl !== this.data.level) {
      this._lastCoins = coins; this._lastStars = this.data.stars; this._lastLvl = this.data.level;
      $('coinN').textContent = coins.toLocaleString('fr-FR');
      $('starN').textContent = this.data.stars;
      $('lvlN').textContent = this.data.level;
    }
    $('xpFill').style.width = `${Math.round(this.xpProgress() * 100)}%`;
  }

  /* Faisceau lumineux vers la cible (hub et terminal). */
  _renderBeacon(target) {
    const r3d = this.g.r3d;
    const st = this.g.state;
    const usable = target && st === 'HUB';
    const key = usable ? `${Math.round(target.x)}:${Math.round(target.z)}` : '';
    if (key !== this._beaconKey) {
      this._beaconKey = key;
      if (usable) r3d.setBeacon(target.x, target.z); else r3d.hideBeacon();
    }
    r3d.pulseBeacon(this.g.time);
  }

  /* ---------------- Anneaux de vol ---------------- */
  /* A appeler chaque image en vol. */
  updateRings(dt) {
    if (!this.on) return;
    const g = this.g, ac = g.ac, r3d = g.r3d;
    if (ac.onGround || !g.flightLog || !g.flightLog.armed) {
      if (this.ring && ac.onGround) this.clearRing();
      return;
    }
    /* Pendant une mission, les anneaux dores laissent la place a la mission. */
    if (g.sky && g.sky.busy) { if (this.ring) this.clearRing(); return; }
    /* Pas d'anneau pendant la finale : on se concentre sur la piste. */
    if (g.assist.landing || g.assist.finalLike(ac)) { if (this.ring) this.clearRing(); return; }
    if (this.ringsThisFlight >= RING_TOTAL) { if (this.ring) this.clearRing(); return; }
    if (!this.ring) {
      if (ac.pos.y > GROUND_CLEAR) this.spawnRing();
      return;
    }
    const dx = ac.pos.x - this.ring.x, dy = ac.pos.y - this.ring.y, dz = ac.pos.z - this.ring.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < RING_RADIUS * (this.g.fun ? this.g.fun.diff.ring : 1)) {
      this.ringsThisFlight++;
      sfx.ring();
      this.event('ring');
      this.giveCoins(2, { silent: true });
      this.g.toast(`Anneau ${this.ringsThisFlight}/${RING_TOTAL} ! +2 🪙`, 1400, 'ok');
      this.confetti(10);
      if (this.g.fun) this.g.fun.onRing();
      this.clearRing();
      if (this.ringsThisFlight < RING_TOTAL) this.spawnRing();
      else this.g.toast('🟡 Tous les anneaux ! Suis la fleche pour retourner a la piste.', 4200, 'ok');
    } else {
      /* Anneau depasse : on en replace un devant. */
      const f = ac.forward();
      const ahead = -(dx * f.x + dz * f.z);
      if (ahead < -90) {
        this._ringMissTimer += dt;
        if (this._ringMissTimer > 1.2) { this._ringMissTimer = 0; this.spawnRing(); }
      } else {
        this._ringMissTimer = 0;
      }
    }
    if (this.ring) r3d.pulseRing(this.g.time);
    this._updateSkyCoins();
  }

  /* Pieces sur la trajectoire vers l'anneau : on les ramasse en passant a moins de 36 m. */
  _updateSkyCoins() {
    const g = this.g, ac = g.ac, sc = this.skyCoins;
    if (!sc || !sc.length) return;
    g.r3d.spinSkyCoins(g.time);
    for (let i = 0; i < sc.length; i++) {
      const c = sc[i];
      if (c.got) continue;
      if (Math.hypot(ac.pos.x - c.x, ac.pos.y - c.y, ac.pos.z - c.z) > 36) continue;
      c.got = true;
      g.r3d.hideSkyCoin(i);
      sfx.coin();
      this.data.stats.skyCoins = (this.data.stats.skyCoins || 0) + 1;
      this.giveCoins(1, { silent: true });
      this._bumpCombo();
      this.popup('🪙 +1');
    }
  }

  spawnRing() {
    const g = this.g, ac = g.ac;
    const f = ac.forward();
    const h = Math.hypot(f.x, f.z) || 1;
    const dirx = f.x / h, dirz = f.z / h;
    /* Petit decalage lateral et vertical pour que ca bouge, sans etre injouable. */
    const side = (this.ringsThisFlight % 2 ? 1 : -1) * (25 + this.ringsThisFlight * 15);
    const x = ac.pos.x + dirx * RING_AHEAD + (-dirz) * side;
    const z = ac.pos.z + dirz * RING_AHEAD + (dirx) * side;
    /* L'anneau se place sur la trajectoire actuelle (pente de montee ou de
       descente mesuree), avec un petit ecart pour qu'il faille corriger. */
    const hv = Math.hypot(ac.vel.x, ac.vel.z) || 1;
    const slope = clamp(ac.vel.y / hv, -0.08, 0.18);
    const wobble = (this.ringsThisFlight % 2 ? 1 : -1) * (12 + this.ringsThisFlight * 4);
    const y = clamp(ac.pos.y + RING_AHEAD * slope + wobble, 55, 1150);
    this.ring = { x, y, z, yaw: Math.atan2(dirx, dirz) };
    g.r3d.setRing(this.ring);
    /* 3 pieces regulierement espacees entre l'avion et l'anneau (aux 30 %, 55 % et 80 %). */
    this.skyCoins = [0.3, 0.55, 0.8].map(k => ({
      x: ac.pos.x + (x - ac.pos.x) * k, y: ac.pos.y + (y - ac.pos.y) * k, z: ac.pos.z + (z - ac.pos.z) * k, got: false
    }));
    g.r3d.setSkyCoins(this.skyCoins);
    g.assist.guide = (g.fun && !g.fun.diff.magnet) ? null : this.ring;          // aimant : l'avion s'oriente doucement vers l'anneau
  }

  clearRing() {
    this.skyCoins = null;
    this.g.r3d.clearSkyCoins();
    this.ring = null;
    this.g.assist.guide = null;
    this.g.r3d.hideRing();
  }

  /* Nouveau vol : on remet les anneaux a zero. */
  resetFlight() {
    this.plan = null;
    this.ringsThisFlight = 0;
    this.clearRing();
  }

  /* ---------------- Plan de vol ---------------- */
  /* Tableau de depart : deux onglets, les missions (jeux de 1 a 3 minutes) et
     les destinations (un defi de vol). Affiche quand on s'asseoit aux commandes. */
  offerPlan() {
    if (!this.on) return;
    const box = $('flightPlan');
    if (!box) return;
    const sky = this.g.sky;
    const dests = DESTINATIONS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    const chal = ['star', 'rings', 'fast', 'perfect'].sort(() => Math.random() - 0.5).slice(0, 2);
    const kinds = [chal[0], chal[1], 'cool'];
    const scale = Math.min(2, 1 + 0.08 * (this.data.level - 1));
    const offers = dests.map((d, i) => {
      const t = PLAN_TYPES[kinds[i]];
      const bonus = t.bonus ? Math.round(t.bonus * scale) + Math.floor(d.km / 3000) : 0;
      return { dest: d, kind: kinds[i], bonus, t0: null };
    });
    const seen = this.data.visited || [];
    const close = () => { box.classList.add('hidden'); sfx.click(); };
    const medals = ['', '🥉', '🥈', '🥇'];
    const renderTab = (tab) => {
      document.querySelectorAll('[data-plantab]').forEach(b => b.classList.toggle('on', b.dataset.plantab === tab));
      const host = $('planCards');
      if (tab === 'missions' && sky) {
        host.innerHTML = sky.cards().map(c =>
          `<button class="plan-card mission${c.locked ? ' locked' : ''}" data-mission="${c.id}"${c.locked ? ' disabled' : ''}>` +
          `<span class="pc-flag">${c.ico}</span><span class="pc-mid"><b>${c.name}</b><small>${c.brief}</small></span>` +
          `<span class="pc-rw">${c.locked ? '🔒 Niv ' + c.level : (medals[c.medal] || 'Nouveau')}</span></button>`).join('');
        host.querySelectorAll('[data-mission]').forEach(b => b.addEventListener('click', () => { close(); this.plan = null; sky.arm(b.dataset.mission); }));
      } else {
        host.innerHTML = offers.map((o, i) => {
          const t = PLAN_TYPES[o.kind];
          return `<button class="plan-card" data-i="${i}"><span class="pc-flag">${o.dest.flag}</span>` +
            `<span class="pc-mid"><b>${o.dest.city}</b><small>${o.dest.km.toLocaleString('fr-FR')} km${seen.includes(o.dest.city) ? '' : ' · 🆕 nouvelle ville !'}</small>` +
            `<em>${t.ico} ${t.name} — ${t.text}</em></span>` +
            `<span class="pc-rw">${o.bonus ? '+' + o.bonus + ' 🪙' : 'Cool'}</span></button>`;
        }).join('');
        host.querySelectorAll('.plan-card').forEach(b => b.addEventListener('click', () => {
          const o = offers[+b.dataset.i];
          close(); this.plan = o;
          if (o && o.bonus) this.g.toast(`${o.dest.flag} Cap sur ${o.dest.city} ! Defi : ${PLAN_TYPES[o.kind].text}`, 3800, 'ok');
        }));
      }
      iconifyHost(host);
    };
    document.querySelectorAll('[data-plantab]').forEach(b => { b.onclick = () => { sfx.click(); renderTab(b.dataset.plantab); }; });
    renderTab(sky ? 'missions' : 'dest');
    box.classList.remove('hidden');
    $('planSkip').onclick = () => { close(); this.plan = null; };
  }

  /* A la fin du vol : le defi est-il reussi ? Renvoie { bonus, line } ou null. */
  resolvePlan(stars, crashed) {
    const p = this.plan;
    this.plan = null;
    if (!p) return null;
    const t = PLAN_TYPES[p.kind];
    const time = p.t0 == null ? 9999 : this.g.time - p.t0;
    /* Toute destination atteinte sans accident va dans le carnet de voyage. */
    if (!crashed) {
      if (!this.data.visited.includes(p.dest.city)) this.data.visited.push(p.dest.city);
    }
    if (!p.bonus) { this.save(); return { bonus: 0, line: `${p.dest.flag} Arrive a ${p.dest.city} ! Bon voyage.` }; }
    const ok = !crashed && t.test({ stars, rings: this.ringsThisFlight, time });
    if (ok) {
      this.data.stats.plans++;
      this.giveCoins(p.bonus, { silent: true, xp: 10 });
      this.event('plan');
      sfx.tada();
      this.save();
      return { bonus: p.bonus, line: `${p.dest.flag} ${p.dest.city} : defi « ${t.name} » reussi ! +${p.bonus} 🪙` };
    }
    this.save();
    return { bonus: 0, line: `${p.dest.flag} ${p.dest.city} : defi « ${t.name} » pas reussi cette fois — retente !` };
  }

  /* Pastille de plan de vol en haut a gauche pendant le vol. */
  _renderPlanChip() {
    const chip = $('planChip');
    if (!chip) return;
    const g = this.g, p = this.plan;
    const show = !!p && g.state === 'PILOT' && !g.reportShown;
    chip.classList.toggle('hidden', !show);
    if (!show) return;
    let txt = `${p.dest.flag} ${p.dest.city}`;
    if (p.bonus) txt += ` · ${PLAN_TYPES[p.kind].ico} ${PLAN_TYPES[p.kind].short}`;
    if (p.kind === 'rings' || p.kind === 'perfect') txt += ` ${Math.min(this.ringsThisFlight, RING_TOTAL)}/${RING_TOTAL}`;
    let late = false;
    if (p.kind === 'fast' && p.t0 != null) {
      const left = Math.max(0, EXPRESS_TIME - (g.time - p.t0));
      txt += ` · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
      late = left < 30;
    }
    if (chip.textContent !== txt) chip.textContent = txt;
    chip.classList.toggle('late', late);
  }

  /* ---------------- Notes d'atterrissage ---------------- */
  rateLanding(td, crashed) {
    if (crashed) return { stars: 0, title: 'Oups ! Un atterrissage brusque', tip: 'Pas grave, recommence : le train est sorti automatiquement.' };
    const off = Math.abs(td.offset);
    let stars = 1, title = 'Atterri ! Bien joue', tip = 'Essaie de descendre plus doucement.';
    /* Seuils genereux : un enfant qui laisse faire l'aide (ou qui pose a peu pres droit) doit voir 2-3 etoiles. */
    if (td.fpm < 420 && off < 24) { stars = 2; title = 'Tres bel atterrissage !'; tip = 'Encore un peu plus doux pour 3 etoiles.'; }
    if (td.fpm < 280 && off < 16) { stars = 3; title = 'ATTERRISSAGE PARFAIT !'; tip = 'Tu es un vrai pilote !'; }
    return { stars, title, tip };
  }

  /* ---------------- Petits effets ---------------- */
  /* Petit message flottant au centre bas de l'ecran. */
  popup(text) {
    const host = $('popHost');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'pop';
    el.textContent = text;
    host.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  confetti(n = 40) {
    const host = $('popHost');
    if (!host) return;
    const colors = ['#fde047', '#38bdf8', '#f472b6', '#4ade80', '#fb923c', '#a78bfa'];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      el.className = 'confetti';
      el.style.left = `${10 + Math.random() * 80}%`;
      el.style.background = colors[i % colors.length];
      el.style.setProperty('--dx', `${(Math.random() - 0.5) * 220}px`);
      el.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
      el.style.animationDelay = `${Math.random() * 0.25}s`;
      el.style.animationDuration = `${1.3 + Math.random() * 0.9}s`;
      host.appendChild(el);
      setTimeout(() => el.remove(), 2600);
    }
  }
}

/* Altitude minimale (m, centre de gravite) avant de placer le 1er anneau. */
const GROUND_CLEAR = 12;
const iconifyHost = (el) => { try { iconify(el); } catch (e) { /* icones facultatives */ } };
