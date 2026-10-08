/* C02 : tous les tampons ?v= de index.html et js/*.js doivent avoir la meme valeur. */
import { readFileSync, readdirSync } from 'node:fs';
const files = ['index.html', ...readdirSync('js').filter(f => f.endsWith('.js')).map(f => 'js/' + f)];
const seen = new Map();
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(/\?v=(\d+)/g)) {
    if (!seen.has(m[1])) seen.set(m[1], new Set());
    seen.get(m[1]).add(f);
  }
}
if (seen.size > 1) {
  console.error('FAIL — plusieurs tampons ?v= :');
  for (const [v, fs] of seen) console.error('  ' + v + ' : ' + [...fs].slice(0, 6).join(', '));
  process.exit(1);
}
console.log('PASS — tampon ?v= unique (' + [...seen.keys()][0] + ')');
