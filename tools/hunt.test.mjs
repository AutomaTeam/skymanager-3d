/* H06 : cachettes de la semaine (js/hunt.js, fonctions pures). */
globalThis.window = { location: { search: '' }, addEventListener() {} };
globalThis.document = { createElement: () => ({ getContext: () => ({}) }), getElementById: () => null, addEventListener() {} };
const { weekSpots, warmth } = await import('../js/hunt.js');
let bad = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + m); if (!c) bad++; };
const a = weekSpots('2026-W41'), b = weekSpots('2026-W41'), c = weekSpots('2026-W42');
ok(a.length === 10 && new Set(a).size === 10, '10 cachettes differentes');
ok(JSON.stringify(a) === JSON.stringify(b), 'meme semaine = memes cachettes');
ok(JSON.stringify(a) !== JSON.stringify(c), 'semaine suivante = autres cachettes');
ok(a.every(i => Number.isInteger(i) && i >= 0 && i < 30), 'indices valides');
ok(warmth(3).txt === 'Tu brûles !' && warmth(15).txt === 'Chaud, chaud !' && warmth(40).txt === 'Tiède…' && warmth(300).txt === 'Froid…', 'chaud / froid selon la distance');
if (bad) process.exit(1);
console.log('Tout est bon (cache-cache).');
