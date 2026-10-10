/* ============================================================
   staticMerge.js — Fusion des maillages statiques par materiau (D02)
   Un decor fait de 100 petits maillages qui partagent quelques materiaux
   coute 100 appels de dessin ; fusionne par materiau il en coute une dizaine.
   A n'appliquer qu'a un groupe dont plus personne ne deplace les pieces :
   les maillages fusionnes sont REMPLACES (les anciens sont retires de la scene).
   Exclus : instances, maillages animes (skinned), materiaux multiples, et tout
   objet marque `userData.dynamic = true` ou `userData.noMerge = true`.
   ============================================================ */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const KEEP = ['position', 'normal', 'uv', 'color'];

/* root : le groupe a fusionner. Rend le nombre de maillages economises. */
/* cell : taille (m) d'une case. Avec une case, on ne fusionne que les pieces voisines : un decor etale sur
   des kilometres (clôture, marquages) reste elimine par la camera au lieu d'etre dessine d'un bloc. */
export function mergeStaticByMaterial(root, { minGroup = 2, maxVertices = 400000, cell = 0 } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material)) return;
    if (!o.visible || o.userData.dynamic || o.userData.noMerge) return;
    let key = o.material.uuid + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + o.renderOrder;
    if (cell > 0) { _v.setFromMatrixPosition(o.matrixWorld); key += '|' + Math.floor(_v.x / cell) + ',' + Math.floor(_v.z / cell); }
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  });
  let saved = 0;
  for (const meshes of buckets.values()) saved += mergeBucket(meshes, root, minGroup, maxVertices, (m) => _m.multiplyMatrices(inv, m.matrixWorld));
  return saved;
}

/* Fusionne un paquet de maillages de meme materiau en un seul, ajoute a `root`.
   `toRoot(m)` rend la matrice qui passe du repere du maillage a celui de `root`. */
function mergeBucket(meshes, root, minGroup, maxVertices, toRoot) {
  if (meshes.length < minGroup) return 0;
  const mat = meshes[0].material;
  /* Attributs communs a tous (sinon mergeGeometries echoue). */
  const attrs = KEEP.filter(a => meshes.every(m => m.geometry.attributes[a]));
  if (!attrs.includes('position')) return 0;
  const geos = [];
  let verts = 0;
  for (const m of meshes) {
    const g = m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!attrs.includes(name)) g.deleteAttribute(name);
    g.morphAttributes = {};
    g.applyMatrix4(toRoot(m));
    verts += g.attributes.position.count;
    geos.push(g);
  }
  if (verts > maxVertices) { geos.forEach(g => g.dispose()); return 0; }
  /* Tout indexe ou tout non indexe. */
  const indexed = geos.filter(g => g.index).length;
  if (indexed && indexed !== geos.length) geos.forEach((g, i) => { if (g.index) geos[i] = g.toNonIndexed(); });
  const merged = mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  if (!merged) return 0;
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = meshes[0].castShadow;
  mesh.receiveShadow = meshes[0].receiveShadow;
  mesh.renderOrder = meshes[0].renderOrder;
  mesh.name = 'merged';
  root.add(mesh);
  for (const m of meshes) if (m.parent) m.parent.remove(m);
  return meshes.length - 1;
}

/* Fusion « entre freres » : dans chaque groupe du sous-arbre, les maillages enfants DIRECTS
   qui partagent un materiau sont fusionnes, et le resultat reste enfant de ce meme groupe.
   Les pieces animees par groupe (roues, soufflante, jambe de train) gardent donc leur
   mouvement. A reserver aux groupes dont le code ne garde aucune reference aux maillages
   enfants (un maillage qui a lui-meme des enfants n'est jamais fusionne). */
export function mergeSiblings(root, { minGroup = 2, maxVertices = 200000 } = {}) {
  let saved = 0;
  const nodes = [];
  root.traverse((o) => { if (o.children.length > 1) nodes.push(o); });
  for (const node of nodes) {
    const buckets = new Map();
    for (const o of node.children) {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || o.children.length) continue;
      if (!o.visible || o.userData.dynamic || o.userData.noMerge) continue;
      const key = o.material.uuid + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + o.renderOrder;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(o);
    }
    for (const meshes of buckets.values()) {
      saved += mergeBucket(meshes, node, minGroup, maxVertices, (m) => { m.updateMatrix(); return m.matrix; });
    }
  }
  return saved;
}
