import { parse } from 'acorn';
import { readFileSync } from 'node:fs';
const [,, file, cls] = process.argv;
const src = readFileSync(file, 'utf8');
const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
const top = [];
for (const n of ast.body) {
  if (n.type === 'ClassDeclaration' || (n.type==='ExportNamedDeclaration' && n.declaration && n.declaration.type==='ClassDeclaration')) {
    const c = n.type==='ClassDeclaration'?n:n.declaration;
    if (c.id.name !== cls) continue;
    for (const m of c.body.body) console.log(m.kind.padEnd(11), (m.static?'static ':'')+(m.key.name||m.key.value), m.loc.start.line, m.loc.end.line - m.loc.start.line + 1);
  } else if (n.type !== 'ImportDeclaration') {
    const names = n.declarations ? n.declarations.map(d=>d.id.name||'{..}') : [n.id && n.id.name];
    top.push(`${n.type} ${names.join(',')} ${n.loc.start.line}-${n.loc.end.line}`);
  }
}
console.log('--- top-level'); console.log(top.join('\n'));
