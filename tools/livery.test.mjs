/* I06 : codes de partage d'avion (js/livery.js). */
import { encodeLivery, decodeLivery } from '../js/livery.js';
let bad = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + m); if (!c) bad++; };

const lv = { body: 'sun', accent: 'blue', pattern: 'stripes', stickers: ['star', 'heart', 'none'], name: 'Eclair' };
const code = encodeLivery('pioupiou', lv);
ok(/^SKY1\.[A-Za-z0-9_-]+$/.test(code) && code.length < 200, 'code court et sans caractere special (' + code.length + ' car.)');
const r = decodeLivery(code);
ok(r && r.planeId === 'pioupiou' && r.livery.body === 'sun' && r.livery.pattern === 'stripes' && r.livery.stickers[1] === 'heart' && r.livery.name === 'ECLAIR', 'aller-retour identique');
for (const junk of ['', 'abc', 'SKY1.', 'SKY1.!!!!', 'SKY2.eyJ4IjoxfQ', 'SKY1.' + 'A'.repeat(700), null, '<script>']) ok(decodeLivery(junk) === null, 'code invalide refuse : ' + String(junk).slice(0, 12));
ok(decodeLivery('SKY1.bm90LWpzb24') === null, 'JSON invalide refuse');
const rare = encodeLivery('zebulon', { body: 'gold', accent: 'gold', pattern: 'rainbow', stickers: ['rocket', 'star', 'none'], name: 'x<y>' });
const r2 = decodeLivery(rare, (kind, it) => !it.price);
ok(r2.livery.body !== 'gold' && r2.livery.accent !== 'gold' && r2.livery.pattern === 'none' && r2.livery.stickers[0] === 'none' && r2.livery.stickers[1] === 'star', 'objets non possedes remplaces par le gratuit');
ok(!/[<>]/.test(r2.livery.name), 'nom nettoye');
const r3 = decodeLivery(encodeLivery('x', { body: 'zzz', accent: 'zzz', pattern: 'zzz', stickers: ['zzz'], name: 'a'.repeat(40) }));
ok(r3 && r3.livery.name.length <= 12 && r3.livery.body === 'white', 'ids inconnus remplaces, nom limite a 12');
if (bad) process.exit(1);
console.log('Tout est bon (livery).');
