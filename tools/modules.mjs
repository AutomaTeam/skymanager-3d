/* M02 : carte des modules. Genere docs/MODULES.md a partir des fichiers js/ :
   role (premiere phrase de l'en-tete), cle(s) de sauvegarde `skymanager.*`, qui l'importe, taille.
   Usage : node tools/modules.mjs */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
const files = readdirSync('js').filter(f => f.endsWith('.js') && !f.endsWith('.test.js')).sort();
const src = Object.fromEntries(files.map(f => [f, readFileSync('js/' + f, 'utf8')]));
const importers = {};
for (const f of files) {
  for (const m of src[f].matchAll(/from '\.\/(\w+)\.js(?:\?v=\d+)?'/g)) (importers[m[1] + '.js'] ||= new Set()).add(f.replace('.js', ''));
}
const role = (f) => {
  const m = src[f].match(/\/\*[\s\S]*?\n\s*\S+\.js\s+[—-]\s+([^\n]+)/);
  return (m ? m[1] : '').replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
};
const rows = files.map(f => {
  const keys = [...new Set([...src[f].matchAll(/'(skymanager\.\w+)'/g)].map(m => m[1].replace('skymanager.', '')))].join(', ');
  const by = [...(importers[f] || [])].sort().join(', ');
  return `| \`${f}\` | ${role(f) || ''} | ${keys} | ${by} | ${src[f].split('\n').length} |`;
});
const out = `# Carte des modules

*Genere par \`node tools/modules.mjs\` — ne pas modifier a la main.*

| Fichier | Role | Cle de sauvegarde | Importe par | Lignes |
|---|---|---|---|---|
${rows.join('\n')}

Total : ${files.length} modules, ${files.reduce((s, f) => s + src[f].split('\n').length, 0)} lignes.
`;
mkdirSync('docs', { recursive: true });
writeFileSync('docs/MODULES.md', out);
console.log('docs/MODULES.md : ' + files.length + ' modules');
