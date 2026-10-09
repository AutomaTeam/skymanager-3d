/* ============================================================
   terminal.test.mjs — Tests du circuit passager (phases 25-26)

   Verifie, sans navigateur, les regles de verification (terminalFlow.js)
   et la simulation du hall (terminalSystem.js) : parcours, decisions
   justes et fausses, passagers qui marchent d'un poste a l'autre, erreurs
   qui reviennent plus tard (et seconde chance), bagages abandonnes,
   incidents quand un poste n'est pas tenu, stocks, caisses, equilibrage.

   Usage : npm run test:terminal   (aucune dependance : pas de Three.js)
   ============================================================ */

import {
  TODAY, makePassenger, evaluate, overweightFee, DEFAULT_CHOICE, bestChoice, issueOf, gateNotes, isWrongPass
} from '../js/terminalFlow.js';
import { TerminalSystem, MAX_STOCK, CRATE_QTY, STOCK_KINDS, slotPos, makeWalk, walkAt } from '../js/terminalSystem.js';

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log((ok ? 'PASS' : 'FAIL') + ' — ' + msg); };

/* Generateur pseudo-aleatoire deterministe. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const withRng = (seed, fn) => { const orig = Math.random; Math.random = seeded(seed); try { return fn(); } finally { Math.random = orig; } };

/* Un dossier fabrique a la main (meme forme que makePassenger). */
let pid = 5000;
const pax = (over = {}) => ({
  id: pid++, name: 'Test', face: '🧑', shirt: 0, flight: TODAY.flight, seat: '12A', kg: 15,
  tray: ['👕', '👟', '📱'], danger: null, feePaid: false, dangerSeized: false, passFlight: TODAY.flight, ...over
});
const KNIFE = { e: '🔪', n: 'un couteau' };

/* Hall vide, sans arrivee de nouveaux passagers : pour observer un seul passager. */
function quiet() {
  const t = new TerminalSystem();
  for (const c of Object.values(t.counters)) { c.queue = 0; if (['checkin', 'security', 'gate', 'baggage'].includes(c.kind)) c.open = false; }   // rien ne se traite tout seul
  t._spawnTimer = 1e9;
  return t;
}
/* Fait avancer le temps (pas de 0,1 s) sans nouvelle arrivee. */
function run(t, sec) { for (let i = 0; i < sec * 10; i++) { t._spawnTimer = 1e9; t.update(0.1); } }
/* Met un passager en tete d'une file. */
function put(t, id, p) { t.counters[id].line.unshift(p); return p; }

/* ---------- Regles de verification ---------- */
{
  const flight = pax({ flight: 'SKY 145', passFlight: 'SKY 145' });
  check(evaluate('checkin', flight, 'refuse').ok, 'billet d\'un autre vol : le refuser est juste');
  check(!evaluate('checkin', flight, 'ok').ok, 'billet d\'un autre vol : le valider est une erreur');
  check(evaluate('checkin', flight, 'refuse').proceeds === false, 'billet d\'un autre vol refuse : le passager repart');

  const heavy = pax({ kg: 27 });
  check(evaluate('checkin', heavy, 'fee').ok, 'bagage trop lourd : faire payer la surcharge est juste');
  check(overweightFee(heavy) === (27 - TODAY.bagLimit) * TODAY.feePerKg, 'surcharge = kilos en trop x tarif');
  check(!evaluate('checkin', heavy, 'ok').ok, 'bagage trop lourd valide sans surcharge : erreur');
  check(!evaluate('checkin', heavy, 'refuse').ok, 'bagage trop lourd refuse : erreur (il fallait facturer)');
  check(evaluate('checkin', heavy, 'ok').why.includes('porte'), 'l\'erreur au guichet annonce une seconde chance a la porte');

  const fine = pax();
  check(evaluate('checkin', fine, 'ok').ok, 'dossier en regle : valider est juste');
  check(!evaluate('checkin', fine, 'fee').ok, 'dossier en regle : facturer une surcharge est une erreur');
  check(!evaluate('checkin', fine, 'refuse').ok, 'dossier en regle : refuser est une erreur');

  const knife = pax({ danger: KNIFE, tray: ['👕', '🔪', '📱'] });
  check(evaluate('security', knife, 'seize').ok, 'plateau avec un couteau : confisquer est juste');
  check(!evaluate('security', knife, 'pass').ok, 'objet interdit laisse passer : erreur');
  check(evaluate('security', pax(), 'pass').ok, 'plateau en ordre : laisser passer est juste');
  check(!evaluate('security', pax(), 'seize').ok, 'plateau en ordre : confisquer est une erreur');

  const wrongPass = pax({ passFlight: 'SKY 302' });
  check(evaluate('gate', wrongPass, 'refuse').ok, 'carte pour un autre vol : refuser est juste');
  check(!evaluate('gate', wrongPass, 'scan').ok, 'carte pour un autre vol : scanner est une erreur');
  check(evaluate('gate', pax(), 'scan').ok, 'carte valide : scanner est juste');
  check(!evaluate('gate', pax(), 'refuse').ok, 'carte valide : refuser est une erreur');
}

/* ---------- Un passager, des consequences (phase 26) ---------- */
{
  /* Surcharge oubliee au guichet : rattrapable a la porte. */
  const heavy = pax({ kg: 26 });
  check(gateNotes(heavy).length === 1, 'porte : une note previent d\'une surcharge oubliee');
  check(evaluate('gate', heavy, 'fee').ok && evaluate('gate', heavy, 'fee').fee === (26 - TODAY.bagLimit) * TODAY.feePerKg,
    'porte : encaisser la surcharge oubliee est juste (seconde chance)');
  check(!evaluate('gate', heavy, 'scan').ok, 'porte : scanner sans encaisser la surcharge est une erreur');
  check(evaluate('gate', heavy, 'scan').mood > -3, 'erreur de surcharge oubliee : peu grave (on est en Arcade, enfant)');
  const paid = pax({ kg: 26, feePaid: true });
  check(gateNotes(paid).length === 0 && evaluate('gate', paid, 'scan').ok, 'surcharge payee au guichet : plus de note, scan juste');

  /* Objet interdit oublie a la surete : le detecteur de la porte sonne. */
  const armed = pax({ danger: KNIFE });
  check(gateNotes(armed).some(n => n.icon === '🔔'), 'porte : une note dit que le detecteur sonne');
  const r = evaluate('gate', armed, 'refuse');
  check(r.ok && r.returnTo === 'security' && r.proceeds === false, 'porte : refuser un passager qui fait sonner le detecteur le renvoie a la surete');
  check(!evaluate('gate', armed, 'scan').ok, 'porte : le laisser monter est une grosse erreur');
  check(evaluate('gate', armed, 'scan').mood <= -5, 'detecteur ignore : forte baisse d\'ambiance');
  const seized = pax({ danger: KNIFE, dangerSeized: true });
  check(gateNotes(seized).length === 0 && evaluate('gate', seized, 'scan').ok, 'objet confisque : plus de detecteur qui sonne');

  /* Mauvais vol valide au guichet : la carte le trahit. */
  const lost = pax({ flight: 'SKY 411', passFlight: 'SKY 411' });
  check(isWrongPass(lost) && evaluate('gate', lost, 'refuse').ok, 'billet d\'un autre vol laisse passer : refuse a la porte');

  /* Cas de plusieurs problemes : le mauvais vol prime. */
  check(bestChoice('gate', pax({ passFlight: 'SKY 076', kg: 30, danger: KNIFE })) === 'refuse', 'meilleur choix a la porte : mauvais vol d\'abord');
  check(bestChoice('gate', pax({ kg: 30 })) === 'fee' && bestChoice('security', pax({ danger: KNIFE })) === 'seize', 'bestChoice trouve les bonnes reponses');
  check(issueOf(pax({ kg: 30 })) === 'weight' && issueOf(pax({ flight: 'SKY 076' })) === 'flight' && issueOf(pax()) === null, 'issueOf : vocabulaire lisible');
}

/* ---------- Generation : proportion de vrais problemes ---------- */
withRng(7, () => {
  let flight = 0, weight = 0, danger = 0, wrongPass = 0, n = 4000;
  const ids = new Set();
  for (let i = 0; i < n; i++) {
    const p = makePassenger();
    ids.add(p.id);
    if (issueOf(p) === 'flight') flight++;
    if (p.kg > TODAY.bagLimit) weight++;
    if (p.danger) danger++;
    if (p.passFlight !== TODAY.flight) wrongPass++;
    if (p.danger) { if (!p.tray.includes(p.danger.e)) failures.push('objet interdit absent du plateau'); }
    if (!(p.shirt >= 0 && p.shirt < 6) || !p.face || !p.name) failures.push('passager sans visage / chemise / nom');
  }
  const pct = (x) => (100 * x / n).toFixed(0) + ' %';
  check(ids.size === n, 'chaque passager a un identifiant unique');
  check(flight / n > 0.09 && flight / n < 0.17, `~13 % de billets pour un autre vol (obtenu ${pct(flight)})`);
  check(weight / n > 0.10 && weight / n < 0.20, `~14 % de bagages trop lourds (obtenu ${pct(weight)})`);
  check(danger / n > 0.16 && danger / n < 0.24, `~20 % de plateaux dangereux (obtenu ${pct(danger)})`);
  check(wrongPass / n > 0.10 && wrongPass / n < 0.20, `~13-17 % de cartes d'embarquement fausses (obtenu ${pct(wrongPass)})`);
});

/* ---------- Trajets : les passagers marchent ---------- */
{
  const w = makeWalk([[0, 0, 0], [3, 0, 0], [3, 4, 2], [3, 6, 0]], 1);
  check(Math.abs(w.dur - (3 + 4 + 2 + 2)) < 1e-9, 'un trajet dure distance / vitesse + arrets');
  const mid = walkAt(w, 1.5);
  check(Math.abs(mid.x - 1.5) < 1e-9 && mid.moving && Math.abs(mid.h - Math.PI / 2) < 1e-9, 'a mi-troncon le passager est au milieu, cap vers l\'est');
  const wait = walkAt(w, 8);
  check(!wait.moving && wait.z === 4, 'pendant un arret (machine) le passager ne bouge pas');
  check(walkAt(w, 99).done && walkAt(w, 99).z === 6, 'arrive : au dernier point');
  const s0 = slotPos('checkin1', 0), s5 = slotPos('checkin1', 5);
  check(s5[1] > s0[1] && s0[1] > 1248, 'la file du guichet s\'allonge vers le sud (cote entree)');
  const g0 = slotPos('gate', 0), g3 = slotPos('gate', 3);
  check(g3[1] < g0[1] && g0[1] < 1208, 'la file de la porte s\'allonge vers le nord');
}

/* ---------- Circuit dans le hall ---------- */
withRng(11, () => {
  const t = quiet();

  /* Un passager en regle au guichet : il MARCHE jusqu'a la surete, son bagage part au tri. */
  const a = put(t, 'checkin1', pax());
  const r = t.decide('checkin1', 'ok');
  check(r && r.ok, 'decision a l\'enregistrement prise');
  check(t.counters.security.line.length === 0 && t.transit.some(e => e.pax === a), 'apres le guichet le passager marche (il n\'est pas teleporte)');
  check(t.counters.baggage.line.some(b => b.ownerId === a.id), 'son bagage part au tri, a son nom');
  check(t.counters.gate.line.length === 0, 'la porte n\'est pas alimentee directement par l\'enregistrement');
  run(t, 140);
  check(t.counters.security.line[0] === a, 'le MEME passager arrive a la file de la surete');

  /* Surete -> porte. */
  t.decide('security', 'pass');
  run(t, 140);
  check(t.counters.gate.line.includes(a) && t.counters.security.line.length === 0, 'le meme passager arrive ensuite a la file de la PORTE');

  /* Porte -> avion : compte quand il arrive a la passerelle. */
  const before = t.boarded;
  const g = t.decide('gate', 'scan');
  check(g.ok && t.boarded === before, 'scanner : le passager part a pied vers l\'avion');
  run(t, 20);
  check(t.boarded === before + 1 && t.boardedSinceFlight === before + 1, 'il est embarque une fois arrive a la passerelle');

  /* Un refus juste ne nourrit pas la suite. */
  const q = put(t, 'checkin1', pax({ flight: 'SKY 219', passFlight: 'SKY 219' }));
  const secBefore = t.counters.security.line.length + t.transit.length;
  t.decide('checkin1', 'refuse');
  run(t, 30);
  check(t.counters.security.line.length === 0 && !t.counters.security.line.includes(q), 'un passager refuse a juste titre quitte le circuit');
  check(t.stats.refused === 1 && t.transit.length === 0, 'le refus est compte, le passager est sorti du hall');

  /* Surcharge : recette, et le dossier retient qu'elle est payee. */
  const h = put(t, 'checkin1', pax({ kg: 25 }));
  const rev0 = t.revenue;
  t.decide('checkin1', 'fee');
  check(t.revenue - rev0 === 20 && t.stats.fees === 1 && h.feePaid, 'la surcharge de 5 kg x 4 EUR est encaissee et memorisee');

  /* Tri des bagages. */
  const bagN = t.counters.baggage.line.length;
  const bs = t.stats.bags;
  const lb = t.loadBag();
  check(lb && lb.ok && t.counters.baggage.line.length === bagN - 1 && t.stats.bags === bs + 1, 'charger un bagage le retire du tri et le compte pour le vol');
  const n = t.consumeBagsSinceFlight();
  check(n >= 1 && t.bagsSinceFlight === 0, 'le compteur de bagages repart a zero apres le vol');
});

/* ---------- Une erreur au guichet, rattrapee a la porte ---------- */
withRng(13, () => {
  const t = quiet();
  const heavy = put(t, 'checkin1', pax({ kg: 27 }));
  const bad = t.decide('checkin1', 'ok');
  check(!bad.ok && !heavy.feePaid, 'guichet : surcharge oubliee');
  run(t, 140); t.decide('security', 'pass'); run(t, 140);
  check(t.counters.gate.line[0] === heavy && gateNotes(heavy).length === 1, 'a la porte, LE MEME passager porte la note de la surcharge oubliee');
  const rec = t.decide('gate', 'fee');
  check(rec.ok && heavy.feePaid && t.stats.recovered === 1, 'la surcharge est rattrapee a la porte (compte comme « erreur reparee »)');
  run(t, 20);
  check(t.boarded >= 1, 'apres rattrapage le passager embarque');

  /* Objet interdit oublie a la surete -> renvoye -> confisque -> revient. */
  const armed = put(t, 'security', pax({ danger: KNIFE }));
  const e = t.decide('security', 'pass');
  check(!e.ok && armed.danger && !armed.dangerSeized, 'surete : objet interdit laisse passer');
  run(t, 140);
  check(t.counters.gate.line[0] === armed, 'le passager arrive a la porte avec son objet');
  const ret = t.decide('gate', 'refuse');
  check(ret.ok && ret.returnTo === 'security' && t.stats.recovered === 2, 'detecteur : renvoye a la surete (erreur reparee)');
  run(t, 140);
  check(t.counters.security.line[0] === armed, 'le MEME passager est de retour dans la file de la surete');
  const fix = t.decide('security', 'seize');
  check(fix.ok && armed.dangerSeized && !armed.danger === false, 'cette fois l\'objet est confisque et memorise');
  run(t, 140);
  check(t.counters.gate.line[0] === armed && gateNotes(armed).length === 0, 'de retour a la porte : plus aucune alerte');
  check(t.decide('gate', 'scan').ok, 'il peut enfin embarquer');
});

/* ---------- Bagage abandonne ---------- */
withRng(17, () => {
  const t = quiet();
  const wrong = put(t, 'checkin1', pax({ flight: 'SKY 302', passFlight: 'SKY 302' }));
  t.decide('checkin1', 'ok');                        // erreur : bagage parti au tri
  check(t.counters.baggage.line.some(b => b.ownerId === wrong.id && !b.orphan), 'bagage enregistre : pas encore abandonne');
  run(t, 140); t.decide('security', 'pass'); run(t, 140);
  t.decide('gate', 'refuse');                        // refuse a la porte : son bagage devient orphelin
  const orph = t.counters.baggage.line.find(b => b.ownerId === wrong.id);
  check(orph && orph.orphan, 'passager refuse a la porte : son bagage devient « abandonne »');
  /* Le retirer est une bonne action ; le charger automatiquement est un incident. */
  t.counters.baggage.line = [orph];
  const m0 = t.mood;
  const rm = t.loadBag();
  check(rm.ok && rm.orphan && t.stats.orphans === 1 && t.bagsSinceFlight === 0 && t.mood > m0, 'retirer un bagage abandonne : bonne action, pas charge dans l\'avion');
  t.counters.baggage.line = [{ id: 1, ownerId: wrong.id, kg: 10, orphan: true }];
  t.arcade = true;
  t._auto(t.counters.baggage);
  check(t.stats.incidents === 1 && t.bagsSinceFlight === 0, 'bagage abandonne charge sans surveillance : incident');
  t.counters.baggage.line = [{ id: 2, ownerId: 1, kg: 10, orphan: true }];
  check(t.actionLabel('baggage').includes('ABANDONNÉ'), 'le bouton du tri annonce le bagage abandonne');
});

/* ---------- Un poste non tenu laisse passer les erreurs ---------- */
withRng(23, () => {
  const t = quiet();
  put(t, 'security', pax({ danger: KNIFE }));
  const mood0 = t.mood;
  t._auto(t.counters.security);
  check(t.stats.incidents === 1, 'un objet interdit laisse passer sans surveillance est un incident');
  check(t.mood < mood0, 'l\'incident fait chuter l\'ambiance du hall');

  /* Sans joueur, le hall tourne quand meme (les files avancent). */
  const t2 = new TerminalSystem();
  const boarded0 = t2.boarded;
  for (let i = 0; i < 60 * 300; i++) { t2.update(1 / 60); }
  check(t2.boarded > boarded0, 'sans joueur, des passagers finissent par embarquer (le circuit est continu)');
  check(t2.stats.incidents > 0, 'sans joueur, des erreurs passent (les postes ne sont pas verifies)');
});

/* ---------- Vue de la foule pour le rendu ---------- */
withRng(29, () => {
  const t = new TerminalSystem();
  for (let i = 0; i < 20 * 60; i++) t.update(1 / 60);
  const crowd = t.crowd();
  check(crowd.length > 0 && crowd.every(c => Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.h)), 'crowd() : positions valides');
  check(new Set(crowd.map(c => c.id)).size === crowd.length, 'crowd() : un seul avatar par passager');
  check(crowd.every(c => c.x > 225 && c.x < 495 && c.z > 1190 && c.z < 1268), 'crowd() : tout le monde reste dans le batiment');
  check(crowd.some(c => c.mode === 'walk'), 'crowd() : des passagers marchent');
});

/* ---------- Stocks, caisses, reserve ---------- */
withRng(5, () => {
  const t = new TerminalSystem();
  const shop = t.counters.shop, st = t.counters.storage;

  check(shop.stock === MAX_STOCK, 'les machines demarrent pleines');
  shop.stock = 2;
  check(t.lowMachine() === shop || t.lowMachine().stock <= 2, 'une machine presque vide est detectee');
  check(!t.restock('shop').ok, 'on ne peut pas recharger sans caisse');

  const crates0 = st.crates;
  const take = t.takeCrate();
  check(take.ok && t.carry === CRATE_QTY && st.crates === crates0 - 1, 'prendre une caisse a la reserve : elle est portee, le stock de la reserve baisse');
  check(!t.takeCrate().ok, 'on ne porte qu\'une caisse a la fois');

  const r = t.restock('shop');
  check(r.ok && r.added === CRATE_QTY && Math.round(shop.stock) === 2 + CRATE_QTY, 'recharger : le stock monte de 8 et la caisse est videe');
  check(t.carry === 0, 'la caisse est vide apres avoir tout verse');

  /* Trop plein : le reste de la caisse est conserve. */
  shop.stock = MAX_STOCK - 3;
  t.carry = CRATE_QTY;
  const r2 = t.restock('shop');
  check(r2.added === 3 && t.carry === CRATE_QTY - 3, 'machine presque pleine : on ne verse que la place disponible, le reste est garde');
  check(!t.restock('shop').ok, 'machine pleine : refuse de recharger');
  check(!t.restock('gate').ok, 'seules les machines se rechargent');

  /* Reserve vide. */
  st.crates = 0; t.carry = 0;
  check(!t.takeCrate().ok, 'reserve vide : rien a prendre');
  /* Livraison. */
  for (let i = 0; i < 60 * 40; i++) t.update(1 / 60);
  check(st.crates >= 1, 'la reserve recoit une livraison au bout d\'un moment');

  /* Une machine vide n'encaisse plus et fait des mecontents. */
  const t3 = new TerminalSystem();
  STOCK_KINDS.forEach(id => { t3.counters[id].stock = 0; });
  const lost0 = t3.stats.lostSales;
  t3.counters.shop.queue = 3;
  check(t3.serveNext('shop') === null, 'boutique vide : impossible de servir (rupture de stock)');
  for (let i = 0; i < 60 * 60; i++) t3.update(1 / 60);
  check(t3.stats.lostSales > lost0, 'machines vides : des ventes sont perdues');
  check(t3.mood < 72, 'machines vides : l\'ambiance du hall baisse');

  /* Vendre consomme du stock. */
  const t4 = new TerminalSystem();
  t4.counters.cafe.queue = 2;
  const s0 = t4.counters.cafe.stock;
  t4.serveNext('cafe');
  check(Math.round(t4.counters.cafe.stock) === s0 - 1, 'servir un client consomme un article du stock');

  /* Un passager qui passe par une machine y achete quelque chose, a son arrivee. */
  const t5 = quiet();
  const s5 = t5.counters.vending.stock;
  const p = put(t5, 'security', pax());
  const orig = Math.random;
  Math.random = () => 0.9;                                    // pas de machine tiree au hasard
  Math.random = () => 0.0;                                    // machine = la premiere du pool, achat garanti
  t5.decide('security', 'pass');
  Math.random = orig;
  const e = t5.transit.find(x => x.pax === p);
  check(e && e.buy, 'apres la surete, le passager va acheter a une machine (arret dans son trajet)');
  const before = t5.counters[e.buy.id].stock;
  run(t5, 60);
  check(t5.counters[e.buy.id].stock < before, 'il achete a son arrivee (le stock baisse)');
});

/* ---------- Equilibrage : le hall doit se jouer, pas s'effondrer ---------- */
function simulate(seconds, playerFn, seed) {
  return withRng(seed, () => {
    const t = new TerminalSystem();
    t.arcade = true;
    const moods = [];
    for (let tick = 0; tick <= seconds * 10; tick++) {          // pas de 0,1 s ; compteur entier (pas de flottants)
      t.update(0.1);
      if (playerFn) playerFn(t, tick);
      if (tick % 100 === 0) moods.push(t.mood);
    }
    return { t, moods };
  });
}
{
  /* Un joueur attentif : une decision toutes les 2,5 s sur la plus longue file, une caisse toutes les 15 s. */
  const attentive = (t, tick) => {
    if (tick % 25 !== 0) return;               // une decision toutes les 2,5 s
    const cand = ['checkin1', 'checkin2', 'checkin3', 'security', 'gate'].map(i => t.counters[i])
      .filter(c => c.open && c.queue > 0).sort((a, b) => b.queue - a.queue)[0];
    if (cand) {
      t.decide(cand.id, bestChoice(cand.kind, t.head(cand.id)));
    } else if (t.counters.baggage.queue > 0) t.loadBag();
    if (tick % 150 === 0) { const m = t.lowMachine(); if (m) { t.takeCrate(); t.restock(m.id); } }       // une caisse toutes les 15 s
    for (const i of ['checkin2', 'checkin3']) t.counters[i].open = true;
  };
  for (const seed of [3, 9, 27]) {
    const a = simulate(420, attentive, seed);
    const min = Math.min(...a.moods.slice(3));
    check(min > 45, `joueur attentif (graine ${seed}) : l'ambiance reste correcte (mini ${min.toFixed(0)} %)`);
    const idle = simulate(420, null, seed);
    check(idle.moods[6] > 40, `sans joueur (graine ${seed}) : rien ne s'effondre dans la premiere minute (${idle.moods[6].toFixed(0)} %)`);
    check(idle.moods[idle.moods.length - 1] < 45, `sans joueur (graine ${seed}) : au bout de 7 minutes l'ambiance a nettement baisse (${idle.moods[idle.moods.length - 1].toFixed(0)} %)`);
    check(idle.t.stats.incidents > a.t.stats.incidents, `un hall abandonne a plus d'incidents (${idle.t.stats.incidents}) qu'un hall suivi (${a.t.stats.incidents})`);
    check(idle.t.boarded > 30, `sans joueur le circuit avance quand meme (${idle.t.boarded} embarques)`);
    check(a.t.boarded > 40, `joueur attentif : le hall embarque beaucoup de monde (${a.t.boarded} embarques)`);
  }
}

/* ---------- Libelles et types d'action ---------- */
{
  const t = new TerminalSystem();
  check(t.actionKind('storage') === 'take', 'la reserve propose de prendre une caisse');
  t.carry = 8; t.counters.cafe.stock = 3;
  check(t.actionKind('cafe') === 'restock', 'avec une caisse, une machine non pleine propose de recharger');
  t.carry = 0;
  t.counters.checkin1.queue = 2;
  check(t.actionKind('checkin1') === 'check', 'un guichet avec du monde propose de verifier');
  check(t.actionLabel('storage').includes('CAISSE'), 'libelle de la reserve');
  check(DEFAULT_CHOICE.gate === 'scan', 'poste non tenu : choix par defaut = laisser passer');
  /* Compatibilite : `queue` reste un nombre lisible et modifiable. */
  t.counters.gate.queue = 4;
  check(t.counters.gate.line.length === 4 && t.head('gate') && t.head('gate').flight, 'queue = nombre de passagers reels (dossiers crees a la demande)');
  t.counters.gate.queue = 1;
  check(t.counters.gate.line.length === 1, 'reduire queue retire des passagers');
}

console.log(failures.length ? `\n${failures.length} test(s) en echec` : '\nTous les tests passent');
process.exit(failures.length ? 1 : 0);
