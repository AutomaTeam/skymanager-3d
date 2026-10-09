/* ============================================================
   assetLoader.js — chargement des modeles glTF externes
   Sources gratuites (poly.pizza : Quaternius CC0, Kay Lousberg
   CC0, Don Carson CC-BY -- voir assets/models/CREDITS.md).
   ============================================================ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map(); // url -> Promise<gltf>

function load(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    }));
  }
  return cache.get(url);
}

/* Promesse du glTF brut (mis en cache) : sert aux modules qui reconstruisent le modele (instanciation). */
export function loadGltf(url) { return load(url); }

/* Precharge une liste de modeles avant de les instancier -- evite
   qu'un premier PNJ apparaisse en retard le temps du fetch reseau. */
export function preload(urls) {
  return Promise.all(urls.map(load));
}

/* Instancie une copie independante d'un modele deja precharge (ou en
   cours de chargement) dans un groupe pose immediatement : l'appelant
   peut positionner ce groupe sans attendre le reseau, le contenu visuel
   apparait des que le glb est pret. Le squelette est clone (SkeletonUtils)
   pour que chaque instance animee ait son propre mixer independant. */
export function spawnModel(url, { onReady, castShadow = true, receiveShadow = true, origin = null } = {}) {
  const holder = new THREE.Group();
  load(url).then((gltf) => {
    const inst = cloneSkeleton(gltf.scene);
    inst.traverse((o) => {
      if (o.isMesh) { o.castShadow = castShadow; o.receiveShadow = receiveShadow; }
    });
    /* Certains exports gltf gardent une origine arbitraire, loin de (0,0,0)
       (le repere de la scene source). `origin` (coin bas du bbox mesure une
       fois hors ligne) recentre l'instance pour que le holder pose bien ses
       pieds au sol a l'endroit voulu. */
    if (origin) inst.position.set(-origin[0], -origin[1], -origin[2]);
    holder.add(inst);

    let mixer = null;
    if (gltf.animations && gltf.animations.length) {
      mixer = new THREE.AnimationMixer(inst);
    }
    holder.userData.model = { scene: inst, animations: gltf.animations || [], mixer };
    if (onReady) onReady(holder.userData.model);
  }).catch((err) => console.error('[assets] échec de chargement :', url, err));
  return holder;
}
