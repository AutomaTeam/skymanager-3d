/* ============================================================
   data.test.mjs — Coherence des catalogues « fun » (vagues 1 a 6)

   Verifie, hors navigateur, que les donnees se tiennent entre elles :
   identifiants uniques, autocollants cites qui existent, prix
   positifs, avions complets, missions et badges bien formes, etc.

   Usage : npm install three@0.169.0 --no-save ; node tools/data.test.mjs
   ============================================================ */

/* Les modules lisent window/document seulement dans leurs fonctions ;
   un faux « window » suffit pour les importer. */
globalThis.window = globalThis.window || { addEventListener() {}, location: { search: '' }, devicePixelRatio: 1 };
globalThis.document = globalThis.document || { getElementById() { return null; }, addEventListener() {}, querySelectorAll() { return []; }, createElement() { return { getContext() { return {}; } }; }, body: { classList: { toggle() {}, add() {}, remove() {} } } };

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log((ok ? 'PASS' : 'FAIL') + ' — ' + msg); };
const unique = (arr) => new Set(arr).size === arr.length;

const { PLANES, PLANE_IDS } = await import('../js/fleet.js');
const L = await import('../js/livery.js');
const { STORIES } = await import('../js/groundFun.js');
const { ITEMS } = await import('../js/deco.js');
const { MISSION_DEFS, ANIMALS } = await import('../js/skyMissions.js');
const { ISLANDS, EGGS } = await import('../js/openWorld.js');
const { BADGES, DESTINATIONS } = await import('../js/arcade.js');
const { GAMES } = await import('../js/minigames.js');

/* ---- Avions ---- */
check(unique(PLANE_IDS), 'avions : identifiants uniques');
for (const id of PLANE_IDS) {
  const P = PLANES[id];
  check(P.id === id && P.name && P.ico && P.blurb && P.stars && P.gain, `avion ${id} : champs de base presents`);
  check(P.seats > 0 && P.income > 0 && P.fuel > 0 && P.camScale > 0, `avion ${id} : places, revenu, carburant, camera > 0`);
  if (P.phys) {
    const p = P.phys;
    check(p.S > 0 && p.b > 0 && p.gear && p.gear.length >= 3 && p.speeds && p.speeds.boost > p.speeds.cruise, `avion ${id} : physique complete (surface, train, vitesses)`);
    check(p.groundY > 0 && Math.min(...p.gear.map(g => -g.p[1])) <= p.groundY + 0.2, `avion ${id} : hauteur au sol coherente avec le train`);
  }
}
check(PLANES.liner.price === 0 && PLANES.pioupiou.price === 0, 'avions : le jet et le Pioupiou sont gratuits');

/* ---- Livree ---- */
for (const [name, list] of [['couleurs', L.BODY_COLORS], ['accents', L.ACCENT_COLORS], ['motifs', L.PATTERNS], ['autocollants', L.STICKERS]]) {
  check(unique(list.map(x => x.id)), `livree : ${name} a des identifiants uniques`);
  check(list.every(x => x.price >= 0 && x.name), `livree : ${name} ont un nom et un prix >= 0`);
}
check(L.BODY_COLORS.some(c => !c.price) && L.PATTERNS.some(c => !c.price && c.id !== 'none'), 'livree : des choix gratuits existent');
for (const id of PLANE_IDS) {
  const lv = L.defaultLivery(id);
  check(L.find(L.BODY_COLORS, lv.body).id === lv.body && L.find(L.ACCENT_COLORS, lv.accent).id === lv.accent, `livree par defaut de ${id} valide`);
}

/* ---- Visiteurs, autocollants offerts ---- */
const stickerIds = L.STICKERS.map(s => s.id);
for (const s of STORIES) check(!s.gift || stickerIds.includes(s.gift.sticker), `visiteur ${s.id} : l'autocollant offert existe`);
check(unique(STORIES.map(s => s.id)), 'visiteurs : identifiants uniques');

/* ---- Decoration ---- */
check(unique(ITEMS.map(i => i.id)), 'decoration : identifiants uniques');
check(ITEMS.every(i => i.cost > 0 && i.r > 0 && typeof i.make === 'function'), 'decoration : cout, rayon et fabrique definis');

/* ---- Missions ---- */
check(unique(MISSION_DEFS.map(d => d.id)), 'missions : identifiants uniques');
check(MISSION_DEFS.every(d => d.cls && d.name && d.brief && d.level >= 1), 'missions : classe, nom, texte, niveau');
check(MISSION_DEFS.some(d => d.level === 1), 'missions : au moins une mission accessible des le niveau 1');
check(ANIMALS.length >= 6 && ANIMALS.every(a => a.say.length >= 2 && (a.mode === 'calm' || a.mode === 'wild')), 'animaux : 6 ou plus, phrases et humeur definies');

/* ---- Monde ---- */
check(unique(ISLANDS.map(i => i.id)) && ISLANDS.length === 6, 'iles : 6, identifiants uniques');
const SEA = { x: 3300, z: -5200, r: 1950 };
check(ISLANDS.every(i => Math.hypot(i.x - SEA.x, i.z - SEA.z) + i.r < SEA.r), 'iles : toutes a l\'interieur de la mer');
let ok = true;
for (let a = 0; a < ISLANDS.length; a++) for (let b = a + 1; b < ISLANDS.length; b++) {
  if (Math.hypot(ISLANDS[a].x - ISLANDS[b].x, ISLANDS[a].z - ISLANDS[b].z) < ISLANDS[a].r + ISLANDS[b].r + 100) ok = false;
}
check(ok, 'iles : ne se chevauchent pas');
check(EGGS.length === 3 && unique(EGGS.map(e => e.id)), 'surprises du ciel : 3, identifiants uniques');

/* ---- Badges, jeux, destinations ---- */
check(unique(BADGES.map(b => b.id)), 'badges : identifiants uniques');
const d0 = { stats: new Proxy({}, { get: () => 0 }), level: 1, coinsEarned: 0, visited: [], badges: {}, gift: null };
check(BADGES.every(b => { try { return b.test(d0) === false; } catch (e) { return false; } }), 'badges : aucun badge debloque au depart, tous evaluables');
check(Object.keys(GAMES).length >= 3, 'mini-jeux : au moins 3');
check(DESTINATIONS.length >= 8 && unique(DESTINATIONS.map(d => d.city)), 'destinations : 8 ou plus, villes uniques');

console.log(failures.length ? `\n${failures.length} test(s) en echec` : '\nTous les tests passent');
process.exit(failures.length ? 1 : 0);
