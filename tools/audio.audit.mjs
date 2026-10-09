/* J01 : audit statique du son. Echoue si le code appelle un `sfx.xxx()` qui n'existe pas ;
   liste les sons definis mais jamais appeles (information). */
import { readFileSync, readdirSync } from 'node:fs';
const src = readFileSync('js/sfx.js', 'utf8');
const body = src.slice(src.indexOf('export const sfx'));
const defined = new Set([...body.matchAll(/^  (\w+)\s*\(/gm)].map(m => m[1]));
const files = readdirSync('js').filter(f => f.endsWith('.js')).map(f => 'js/' + f);
const used = new Map();
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\bsfx\.(\w+)\s*\(/g)) used.set(m[1], (used.get(m[1]) || 0) + 1);
const missing = [...used.keys()].filter(k => !defined.has(k));
const never = [...defined].filter(k => !used.has(k) && !['unlock', 'suspend', 'context', 'dest', 'setMuted', 'setHaptics', 'setFxVolume'].includes(k));
console.log(`${defined.size} sons definis, ${used.size} utilises.`);
if (never.length) console.log('Definis mais jamais appeles : ' + never.join(', '));
if (missing.length) { console.error('FAIL — appels a des sons qui n\'existent pas : ' + missing.join(', ')); process.exit(1); }
console.log('PASS — tous les appels sfx.* existent');
/* Le gain commun des effets doit finir sur la sortie du contexte (bug phase 82 : il etait branche sur lui-meme = silence). */
if (!/fxGain\.connect\(a\.destination\)/.test(src)) { console.error('FAIL — fxGain doit etre connecte a a.destination'); process.exit(1); }
console.log('PASS — les effets sont relies a la sortie audio');
