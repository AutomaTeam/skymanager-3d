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
  for (const meshes of buckets.values()) {
    if (meshes.length < minGroup) continue;
    const mat = meshes[0].material;
    /* Attributs communs a tous (sinon mergeGeometries echoue). */
    const attrs = KEEP.filter(a => meshes.every(m => m.geometry.attributes[a]));
    if (!attrs.includes('position')) continue;
    const geos = [];
    let verts = 0;
    for (const m of meshes) {
      const g = m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!attrs.includes(name)) g.deleteAttribute(name);
      g.morphAttributes = {};
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      verts += g.attributes.position.count;
      geos.push(g);
    }
    if (verts > maxVertices) { geos.forEach(g => g.dispose()); continue; }
    /* Tout indexe ou tout non indexe. */
    const indexed = geos.filter(g => g.index).length;
    if (indexed && indexed !== geos.length) geos.forEach((g, i) => { if (g.index) geos[i] = g.toNonIndexed(); });
    const merged = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = meshes[0].castShadow;
    mesh.receiveShadow = meshes[0].receiveShadow;
    mesh.renderOrder = meshes[0].renderOrder;
    mesh.name = 'merged';
    root.add(mesh);
    for (const m of meshes) if (m.parent) m.parent.remove(m);
    saved += meshes.length - 1;
  }
  return saved;
}
