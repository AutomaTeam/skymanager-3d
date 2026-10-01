/* ============================================================
   indexModels.mjs — Inventaire des modeles 3D (etape 1 du plan graphisme)

   Parcourt assets/models/**.glb, lit l'en-tete JSON de chaque fichier
   (sans dependance) et ecrit assets/models/INDEX.json :
   nom, categorie, pack, taille du fichier, boite englobante (m),
   triangles, nombre de materiaux et de textures externes.

   Usage (a la racine du projet) :  node tools/indexModels.mjs
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'models');

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.toLowerCase().endsWith('.glb')) yield p;
  }
}

function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('pas un GLB');
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
}

const round = (v) => Math.round(v * 100) / 100;

const models = [];
const bad = [];
for (const file of walk(root)) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  try {
    const j = readGlb(file);
    let tris = 0;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const mesh of j.meshes || []) {
      for (const pr of mesh.primitives || []) {
        const mode = pr.mode === undefined ? 4 : pr.mode;
        if (mode === 4) {
          const cnt = pr.indices !== undefined ? j.accessors[pr.indices].count : j.accessors[pr.attributes.POSITION].count;
          tris += cnt / 3;
        }
        const a = j.accessors[pr.attributes.POSITION];
        if (a.min && a.max) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], a.min[i]); max[i] = Math.max(max[i], a.max[i]); }
      }
    }
    const external = (j.images || []).filter((im) => im.uri && !im.uri.startsWith('data:')).length;
    const parts = rel.split('/');
    models.push({
      file: rel,
      category: parts[0],
      pack: parts.length > 2 ? parts[1] : null,
      name: path.basename(file, '.glb'),
      kb: Math.round(fs.statSync(file).size / 1024),
      size: [round(max[0] - min[0]), round(max[1] - min[1]), round(max[2] - min[2])],
      minY: round(min[1]),
      tris: Math.round(tris),
      materials: (j.materials || []).length,
      externalTextures: external
    });
  } catch (e) {
    bad.push({ file: rel, error: String(e.message || e) });
  }
}

models.sort((a, b) => a.file.localeCompare(b.file));
const summary = {};
for (const m of models) {
  const k = m.pack || m.category;
  const s = summary[k] || (summary[k] = { count: 0, kb: 0, tris: 0, maxTris: 0 });
  s.count++; s.kb += m.kb; s.tris += m.tris; s.maxTris = Math.max(s.maxTris, m.tris);
}
fs.writeFileSync(path.join(root, 'INDEX.json'), JSON.stringify({ generated: new Date().toISOString(), summary, bad, models }, null, 1));
console.log(`${models.length} modeles indexes, ${bad.length} illisibles`);
for (const [k, s] of Object.entries(summary)) console.log(`${k.padEnd(24)} ${String(s.count).padStart(4)} modeles  ${String(Math.round(s.kb / 1024 * 10) / 10).padStart(5)} Mo  max ${s.maxTris} tri`);
