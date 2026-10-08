/* Outil de refactoring (B01-B03) : sort des methodes d'une classe vers des fichiers « mixins »,
   sans changer le comportement. Usage : node tools/splitClass.mjs config.json
   config : { file, className, shared, parts:[{ file, name, title, methods:[...] }] }
   - chaque part devient js/<file>.js : `export const <name> = { methode() {...}, ... }` ;
   - les constantes de tete de fichier utilisees par le code deplace vont dans js/<shared>.js (exportees) ;
   - le fichier d'origine importe les mixins + le partage et fait Object.assign(Classe.prototype, ...).
   Les imports inutiles sont elagues. Necessite acorn (installe avec eslint). */
import { parse } from 'acorn';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const cfg = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const dir = dirname(cfg.file);
const src = readFileSync(cfg.file, 'utf8').replace(/\r\n/g, '\n');
const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' });

const imports = ast.body.filter(n => n.type === 'ImportDeclaration');
const stampM = src.match(/\?v=(\d+)/);
const STAMP = stampM ? stampM[1] : '1';
const isCls = (n) => n.type === 'ClassDeclaration' && n.id.name === cfg.className;
const clsStmt = ast.body.find(n => isCls(n) || (n.type === 'ExportNamedDeclaration' && n.declaration && isCls(n.declaration)));
const cls = isCls(clsStmt) ? clsStmt : clsStmt.declaration;
const members = cls.body.body;

/* Identifiants references dans un noeud (sur-approximation volontaire). */
function idents(node, out = new Set()) {
  (function walk(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'Identifier') out.add(n.name);
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v.type === 'string') walk(v);
    }
  })(node);
  return out;
}

/* Declarations de tete (hors imports et classe) : nom -> noeud. */
const topDecls = new Map();
const exportedNodes = new Set();            // declarations deja precedees de `export`
const declOf = (n) => (n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n);
for (const n of ast.body) {
  const d0 = declOf(n);
  if (d0.type === 'VariableDeclaration') {
    if (d0.kind !== 'const') throw new Error('declaration non const : ' + src.slice(n.start, n.start + 40));
    for (const d of d0.declarations) if (d.id.type === 'Identifier') topDecls.set(d.id.name, n);
  } else if (d0.type === 'FunctionDeclaration') topDecls.set(d0.id.name, n);
  else continue;
  if (n !== d0) exportedNodes.add(n);
}
const namesOfNode = (n) => { const d0 = declOf(n); return d0.declarations ? d0.declarations.map(d => d.id.name) : [d0.id.name]; };

/* Texte d'un membre avec le commentaire qui le precede. */
const chunks = members.map((m, i) => {
  const prevEnd = i === 0 ? cls.body.start + 1 : members[i - 1].end;
  return { m, name: m.key.name || m.key.value, pre: src.slice(prevEnd, m.start), start: prevEnd, end: m.end };
});
const byName = new Map(chunks.filter(c => c.m.kind === 'method' && !c.m.static).map(c => [c.name, c]));

const moved = new Set();
const parts = cfg.parts.map(p => {
  const sel = p.methods.map(nm => {
    const c = byName.get(nm);
    if (!c) throw new Error('methode introuvable ou non deplacable : ' + nm);
    if (moved.has(nm)) throw new Error('deja deplacee : ' + nm);
    moved.add(nm);
    return c;
  });
  return { ...p, sel };
});

/* Declarations partagees : celles utilisees par le code deplace + dependances. */
const used = new Set();
for (const p of parts) for (const c of p.sel) idents(c.m, used);
const shared = new Set();
const addDecl = (name) => {
  if (!topDecls.has(name) || shared.has(name)) return;
  const node = topDecls.get(name);
  for (const nm of namesOfNode(node)) shared.add(nm);
  for (const dep of idents(node)) addDecl(dep);
};
for (const nm of used) addDecl(nm);
const sharedNodes = [...new Set([...shared].map(n => topDecls.get(n)))].sort((a, b) => a.start - b.start);
const sharedNames = new Set(shared);

/* Elagage des imports : ne garde que les specificateurs utilises dans `usedSet`. */
function importsText(usedSet) {
  const lines = [];
  for (const im of imports) {
    const spec = im.specifiers;
    if (!spec.length) { lines.push(src.slice(im.start, im.end)); continue; }
    const keep = spec.filter(s => usedSet.has(s.local.name));
    if (!keep.length) continue;
    const srcStr = src.slice(im.source.start, im.source.end);
    const ns = keep.find(s => s.type === 'ImportNamespaceSpecifier');
    const def = keep.find(s => s.type === 'ImportDefaultSpecifier');
    const named = keep.filter(s => s.type === 'ImportSpecifier')
      .map(s => (s.imported.name === s.local.name ? s.local.name : `${s.imported.name} as ${s.local.name}`));
    const bits = [];
    if (def) bits.push(def.local.name);
    if (ns) bits.push('* as ' + ns.local.name);
    if (named.length) bits.push('{ ' + named.join(', ') + ' }');
    lines.push(`import ${bits.join(', ')} from ${srcStr};`);
  }
  return lines.join('\n');
}

const sharedFile = cfg.shared;
const baseName = cfg.file.split(/[\\/]/).pop();
const header = (title) => `/* ============================================================\n   ${title}\n   (decoupe de ${baseName} : comportement identique, voir tools/splitClass.mjs)\n   ============================================================ */\n\n`;

/* Commentaire de tete d'une declaration : le dernier bloc commentaire colle au noeud. */
function leadingComment(n) {
  const idx = ast.body.indexOf(n);
  const prevEnd = idx === 0 ? 0 : ast.body[idx - 1].end;
  const pre = src.slice(prevEnd, n.start);
  const m = pre.match(/(\/\*[\s\S]*?\*\/\s*|(?:\/\/[^\n]*\n\s*)+)$/);
  return m ? { text: m[1], start: n.start - m[1].length } : { text: '', start: n.start };
}

/* 1. fichier partage */
if (sharedNodes.length) {
  const sharedIdents = new Set();
  sharedNodes.forEach(n => idents(n, sharedIdents));
  let out = header(`${sharedFile}.js — constantes et petits utilitaires partages`);
  out += importsText(sharedIdents) + '\n\n';
  for (const n of sharedNodes) out += leadingComment(n).text + (exportedNodes.has(n) ? '' : 'export ') + src.slice(n.start, n.end) + '\n\n';
  writeFileSync(join(dir, sharedFile + '.js'), out.replace(/\n{3,}/g, '\n\n'));
}

/* 2. mixins */
for (const p of parts) {
  const body = p.sel.map(c => c.pre.replace(/^\s*\n/, '') + src.slice(c.m.start, c.m.end) + ',').join('\n');
  const mixIdents = new Set();
  p.sel.forEach(c => idents(c.m, mixIdents));
  const sharedUsed = [...sharedNames].filter(n => mixIdents.has(n));
  let out = header(`${p.file}.js — ${p.title || p.name}`);
  const imp = importsText(mixIdents);
  out += imp + (imp ? '\n' : '') + (sharedUsed.length ? `import { ${sharedUsed.join(', ')} } from './${sharedFile}.js?v=${STAMP}';\n` : '') + '\n';
  out += `export const ${p.name} = {\n${body.replace(/\n{3,}/g, '\n\n')}\n};\n`;
  writeFileSync(join(dir, p.file + '.js'), out);
}

/* 3. fichier d'origine */
const removals = [];
for (const p of parts) for (const c of p.sel) removals.push([c.start, c.end]);
for (const n of sharedNodes) removals.push([leadingComment(n).start, n.end]);
const firstImport = imports[0].start;
const lastImportEnd = imports[imports.length - 1].end;
removals.push([firstImport, lastImportEnd]);
removals.sort((a, b) => b[0] - a[0]);
let rest = src;
for (const [a, b] of removals) rest = rest.slice(0, a) + rest.slice(b);
const topComment = src.slice(0, firstImport);

const restAst = parse(rest, { ecmaVersion: 'latest', sourceType: 'module' });
const restUsed = new Set();
idents(restAst, restUsed);
const sharedUsedHere = [...sharedNames].filter(n => restUsed.has(n));
let head = importsText(restUsed) + '\n';
const reexport = sharedNodes.filter(n => exportedNodes.has(n)).flatMap(namesOfNode);
if (reexport.length) head += `export { ${reexport.join(', ')} } from './${sharedFile}.js?v=${STAMP}';
`;
for (const p of parts) head += `import { ${p.name} } from './${p.file}.js?v=${STAMP}';\n`;
if (sharedUsedHere.length) head += `import { ${sharedUsedHere.join(', ')} } from './${sharedFile}.js?v=${STAMP}';\n`;
let out = rest.slice(0, topComment.length) + head + rest.slice(topComment.length);

const outAst = parse(out, { ecmaVersion: 'latest', sourceType: 'module' });
const outStmt = outAst.body.find(n => isCls(n) || (n.type === 'ExportNamedDeclaration' && n.declaration && isCls(n.declaration)));
const mixNames = parts.map(p => p.name);
out = out.slice(0, outStmt.end)
  + `\n\n/* Methodes deplacees dans des modules : ${parts.map(p => 'js/' + p.file + '.js').join(', ')} */\nObject.assign(${cfg.className}.prototype, ${mixNames.join(', ')});`
  + out.slice(outStmt.end);
out = out.replace(/\n{4,}/g, '\n\n\n');
writeFileSync(cfg.file, out);
console.log(`${cfg.file} : ${out.split('\n').length} lignes ; partage : ${[...sharedNames].join(', ')}`);
