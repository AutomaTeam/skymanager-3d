/* ============================================================
   props.js — Chaine d'import des modeles 3D (plan graphisme, etape 2)

   - normalise l'echelle : on demande une taille cible en metres
     (hauteur, longueur ou largeur), pas un facteur au hasard ;
   - pose l'origine au sol, centree ;
   - applique le rendu « doux » (voir palette.js) aux materiaux ;
   - instancie : N copies d'un modele = quelques appels de dessin
     (un InstancedMesh par piece du modele), pas N.

   Le contenu apparait des que le .glb est charge ; le groupe rendu
   est utilisable tout de suite. Si un fichier manque, on ignore
   l'erreur : le jeu ne casse jamais pour un decor.
   ============================================================ */

import * as THREE from 'three';
import { loadGltf } from './assetLoader.js?v=1791576226';
import { SOFT, RECOLOR } from './palette.js?v=1791576226';

export const MODELS = 'assets/models/';

const softCache = new Map();

/* Copie d'un materiau avec le style doux (mise en cache par materiau source). */
export function softMaterial(src) {
  if (softCache.has(src.uuid)) return softCache.get(src.uuid);
  const m = src.clone();
  if (m.isMeshStandardMaterial) {
    m.roughness = Math.max(m.roughness ?? 1, SOFT.roughness);
    m.metalness = SOFT.metalness;
    m.envMapIntensity = SOFT.envMapIntensity;
    if (RECOLOR[m.name] !== undefined && !m.map) m.color.setHex(RECOLOR[m.name]);
    if (m.map) { m.emissiveMap = m.map; m.emissive.setScalar(SOFT.emissiveLift); }
    else { m.emissive.copy(m.color).multiplyScalar(SOFT.emissiveLift * 0.8); }
  }
  softCache.set(src.uuid, m);
  return m;
}

const templates = new Map();

/* Modele « a plat » : pieces (geometrie + materiau) avec la pose du fichier cuite dedans,
   origine au sol et centree en X/Z, echelle ramenee a la taille cible. */
function template(file, fit) {
  const key = file + '|' + JSON.stringify(fit || {});
  if (templates.has(key)) return templates.get(key);
  const p = loadGltf(MODELS + file).then((gltf) => {
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    let k = 1;
    if (fit && fit.height) k = fit.height / Math.max(size.y, 1e-4);
    else if (fit && fit.length) k = fit.length / Math.max(size.z, 1e-4);
    else if (fit && fit.width) k = fit.width / Math.max(size.x, 1e-4);
    else if (fit && fit.scale) k = fit.scale;
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const parts = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      geo.translate(-cx, -box.min.y, -cz);
      const mats = Array.isArray(o.material) ? o.material.map(softMaterial) : softMaterial(o.material);
      parts.push({ geo, mat: mats });
    });
    return { parts, k, size: size.clone().multiplyScalar(k) };
  });
  templates.set(key, p);
  return p;
}

/* Taille finale (m) d'un modele une fois mis a l'echelle : promesse { x, y, z }. */
export function modelSize(file, fit) {
  return template(file, fit).then((t) => t.size).catch(() => null);
}

/* N copies d'un modele. list = [{ x, z, y?, r? (rotation Y, rad), s? (echelle relative) }].
   opts = { height | length | width | scale, cast (ombres portees) }. */
export function instanced(file, list, opts = {}) {
  const group = new THREE.Group();
  group.name = 'inst:' + file;
  if (!list.length) return group;
  template(file, opts).then((t) => {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const part of t.parts) {
      const mesh = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      list.forEach((it, i) => {
        const s = t.k * (it.s || 1);
        pos.set(it.x, it.y || 0, it.z);
        q.setFromAxisAngle(up, it.r || 0);
        sc.set(s, s, s);
        m4.compose(pos, q, sc);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = !!opts.cast;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }).catch((e) => console.warn('[props] modèle ignore :', file, e && e.message));
  return group;
}

/* Une seule copie (non instanciee), utile pour un objet unique avec sa propre pose. */
export function single(file, opts = {}, place = {}) {
  return instanced(file, [{ x: place.x || 0, y: place.y || 0, z: place.z || 0, r: place.r || 0, s: place.s || 1 }], opts);
}
