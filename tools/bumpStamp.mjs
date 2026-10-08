/* Remplace partout le tampon ?v=NNN par une valeur neuve (secondes depuis 1970). */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const stamp = Math.floor(Date.now() / 1000);
const files = ['index.html', ...readdirSync('js').filter(f => f.endsWith('.js')).map(f => 'js/' + f)];
let n = 0;
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  const t = s.replace(/\?v=\d+/g, '?v=' + stamp);
  if (t !== s) { writeFileSync(f, t); n++; }
}
console.log('Tampon ?v=' + stamp + ' dans ' + n + ' fichiers');
