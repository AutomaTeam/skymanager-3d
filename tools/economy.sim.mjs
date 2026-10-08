/* C05 : simulation de l'economie Arcade sur 4 h de jeu typique.
   Hypotheses (a ajuster avec les vraies mesures) :
   - un vol toutes les 3,5 min, ~28 passagers embarques au terminal (6 pieces d'embarquement non comptees) ;
   - hors billets : atterrissage 2,5 etoiles (~25 pieces), anneaux/missions/defis ~25 pieces par vol ;
   - chaque avion en plus rapporte KID_FLEET_PER_MIN pieces / min ;
   - le joueur achete toujours le moins cher de ce qu'il peut s'offrir. */
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 };
const { AirportTycoon, KID_FLEET_PER_MIN } = await import('../js/airportTycoon.js');

const T = new AirportTycoon();
T.arcade = true;
T.cash = 200 * 1000;                     // depart d'une nouvelle partie
T.save = () => {};

const FLIGHT_MIN = 3.5, EXTRA_PER_FLIGHT = 50, BOARDED = 28;
const ac = { fuel: 9000 };
let t = 0, firstAircraft = null, towerDone = null;
const log = [];
const keys = ['runways', 'gates', 'terminals', 'shops', 'vipLounge'];

const buyAll = () => {
  for (;;) {
    const opts = [];
    for (const k of keys) { const c = T.upgradeCost(k); if (c != null && T.cash >= c) opts.push({ k, c }); }
    if (T.canBuyAircraft()) opts.push({ k: 'aircraft', c: T.aircraftCost() });
    if (!opts.length) return;
    opts.sort((a, b) => a.c - b.c);
    const o = opts[0];
    if (o.k === 'aircraft') { T.buyAircraft(); if (firstAircraft == null) firstAircraft = t; log.push([Math.round(t), 'avion', o.c / 1000]); }
    else { T.buyUpgrade(o.k); log.push([Math.round(t), o.k, o.c / 1000]); }
  }
};
const maxed = () => keys.every(k => T.upgradeCost(k) == null) && T.fleet.length >= T.infrastructure.gates;

while (t < 360 && !maxed()) {
  t += FLIGHT_MIN;
  const f = T.registerFlight(ac, { fpm: 200, offset: 5 }, BOARDED, 1);
  T.cash += EXTRA_PER_FLIGHT * 1000;
  T.cash += (T.fleet.length - 1) * KID_FLEET_PER_MIN * FLIGHT_MIN * 1000;
  buyAll();
}
if (maxed()) towerDone = t;

console.log('Achats :'); for (const l of log) console.log(`  ${String(l[0]).padStart(4)} min  ${l[1].padEnd(10)} ${l[2]} pieces`);
console.log(`Premier avion achete a ${firstAircraft} min ; tour complete a ${towerDone} min ; vols : ${T.flightsCompleted}`);
let bad = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + m); if (!c) bad++; };
ok(firstAircraft != null && firstAircraft >= 15 && firstAircraft <= 30, 'premier avion entre 15 et 30 min');
ok(towerDone != null && towerDone >= 120 && towerDone <= 240, 'tour complete entre 2 et 4 h');
if (bad) process.exit(1);
