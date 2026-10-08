/* H07 : saisons (js/seasonal.js, fonction pure seasonOf). */
globalThis.window = { location: { search: '' }, addEventListener() {} };
globalThis.document = { createElement: () => ({ getContext: () => ({}) }), getElementById: () => null, addEventListener() {} };
const { seasonOf } = await import('../js/seasonal.js');
let bad = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + m); if (!c) bad++; };
const d = (y, m, day) => new Date(y, m - 1, day);
ok(seasonOf(d(2026, 10, 14)) === null, '14 octobre : rien');
ok(seasonOf(d(2026, 10, 15)) === 'halloween' && seasonOf(d(2026, 10, 31)) === 'halloween' && seasonOf(d(2026, 11, 2)) === 'halloween', '15 octobre au 2 novembre : Halloween');
ok(seasonOf(d(2026, 11, 3)) === null && seasonOf(d(2026, 11, 30)) === null, 'novembre apres le 2 : rien');
ok(seasonOf(d(2026, 12, 1)) === 'noel' && seasonOf(d(2026, 12, 25)) === 'noel' && seasonOf(d(2027, 1, 5)) === 'noel', '1er decembre au 5 janvier : Noel');
ok(seasonOf(d(2027, 1, 6)) === null && seasonOf(d(2026, 7, 14)) === null, 'janvier apres le 5, ete : rien');
if (bad) process.exit(1);
console.log('Tout est bon (saisons).');
