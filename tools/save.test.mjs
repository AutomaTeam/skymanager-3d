/* C04 : tests de js/save.js avec un localStorage simule. */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; }
};
const S = await import('../js/save.js');
let bad = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + m); if (!c) bad++; };

ok(S.load('skymanager.a', { x: 1 }).x === 1, 'defauts quand la cle est absente');
S.write('skymanager.a', { y: 2 }, 1);
const a = S.load('skymanager.a', { x: 1, y: 0 }, 1);
ok(a.x === 1 && a.y === 2 && a._v === undefined, 'fusion defauts + donnees, sans _v');
const b = S.load('skymanager.a', { x: 1 }, 2, (d, from) => ({ ...d, y: d.y * 10, from }));
ok(b.y === 20 && b.from === 1, 'migration appelee avec la version precedente');
for (const junk of ['{', 'null', '5', '[]', '"x"', 'true']) {
  mem.set('skymanager.j', junk);
  const r = S.load('skymanager.j', { z: 3 });
  ok(r.z === 3 && Object.keys(r).length === 1, 'contenu corrompu ignore : ' + junk);
}
mem.set('skymanager.m', JSON.stringify({ q: 1 }));
S.write('skymanager.comfort', { c: 1 });
ok(S.resetAll({ keep: ['comfort'] }) >= 2 && mem.has('skymanager.comfort') && !mem.has('skymanager.m'), 'reset selectif');
mem.set('autre.cle', '1');
S.resetAll();
ok(mem.has('autre.cle') && S.keys().length === 0, 'reset ne touche que skymanager.*');
const exp = (S.write('skymanager.e', { k: 1 }), S.exportAll());
mem.clear();
ok(S.importAll({ ...exp, 'hack.x': '1', 'skymanager.bad': '{' }) === 1 && mem.has('skymanager.e') && !mem.has('hack.x'), 'import valide et filtre');
globalThis.localStorage = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
ok(S.load('skymanager.a', { x: 1 }).x === 1 && S.write('skymanager.a', {}) === false, 'stockage indisponible : aucune exception');
if (bad) { console.error(bad + ' echec(s)'); process.exit(1); }
console.log('Tout est bon (save).');
