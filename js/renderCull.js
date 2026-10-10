/* ============================================================
   renderCull.js — Economies de rendu sans rien changer a l'image

   1. Tri par taille a l'ecran. Three.js dessine tout ce qui est dans
      le champ, meme un banc a 600 m qui couvre moins d'un pixel (et
      il le redessine dans la carte d'ombre). Ici, chaque maillage eclaire
      dont le rayon apparent tombe sous ~1,5 px est retire du rendu via
      ses `layers` (jamais via `visible`, que le jeu pilote lui-meme) :
      ni appel de dessin, ni ombre, ni mise a jour du squelette (ni de ses
      ~50 os, si rien d'autre n'y est accroche de visible).
      Les reperes de jeu (anneaux, balises, pieces : materiaux « basic »,
      additifs ou sans brouillard) ne sont jamais touches, ni rien qui
      porte `userData.noCull`.
   2. Matrices : un noeud immobile ne recompose plus sa matrice a chaque
      image (voir patchHiddenMatrices). Pendant le rendu, les sous-arbres caches (`visible = false`) ne
      recalculent plus leurs matrices : ~1 400 noeuds sur 4 700 au parking
      (PNJ ranges, nuages, cockpit, thermiques...). Ils sont remis a jour
      des qu'ils reapparaissent. Hors du rendu (appels explicites du jeu,
      getWorldPosition...), rien ne change.
   ============================================================ */

import * as THREE from 'three';

const LAYER_ON = 1;                 // couche 0 seule (tous les objets du jeu)
const LAYER_OFF = 1 << 31;          // couche « hors rendu » (rien ne la regarde)
const LIT = new Set(['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshToonMaterial']);
const _c = new THREE.Vector3();
const _last = new THREE.Vector3();
const _size = new THREE.Vector2();

/* ---------- 2. Matrices : on saute les sous-arbres caches pendant le rendu ---------- */
let skipHidden = false;
let patched = false;
function patchHiddenMatrices() {
  if (patched) return;
  patched = true;
  /* Copie fidele de Object3D.updateMatrixWorld (three r169), plus deux economies :
     - la matrice locale n'est recomposee que si position / rotation / echelle ont change
       (la plupart des 4 700 noeuds ne bougent jamais) ; sans changement, ni recomposition
       ni produit par la matrice du parent, sauf si le parent a lui-meme bouge ;
     - le saut des enfants caches pendant le rendu. */
  THREE.Object3D.prototype.updateMatrixWorld = function (force) {
    if (this.matrixAutoUpdate) {
      const p = this.position, q = this.quaternion, s = this.scale;
      let c = this._mc;
      if (c === undefined) c = this._mc = new Float64Array(10).fill(NaN);
      if (p.x !== c[0] || p.y !== c[1] || p.z !== c[2] || q._x !== c[3] || q._y !== c[4] || q._z !== c[5] || q._w !== c[6] ||
          s.x !== c[7] || s.y !== c[8] || s.z !== c[9]) {
        c[0] = p.x; c[1] = p.y; c[2] = p.z; c[3] = q._x; c[4] = q._y; c[5] = q._z; c[6] = q._w; c[7] = s.x; c[8] = s.y; c[9] = s.z;
        this.updateMatrix();
      }
    }
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.matrixWorldAutoUpdate === true) {
        if (this.parent === null) this.matrixWorld.copy(this.matrix);
        else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      }
      this.matrixWorldNeedsUpdate = false;
      force = true;
    }
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      const child = children[i];
      if (skipHidden) {
        /* Cache, ou squelette d'un personnage trop petit a l'ecran pour etre dessine (_rcSkip). */
        if (child.visible === false || child._rcSkip === true) { child._mwStale = true; continue; }
        /* Revenu a l'ecran : son parent a pu bouger pendant qu'il etait cache. */
        if (child._mwStale) { child._mwStale = false; child.updateMatrixWorld(true); continue; }
      }
      child.updateMatrixWorld(force);
    }
  };
}

/* A encadrer autour de renderer.render(scene) : seule la mise a jour faite par le rendu saute les caches. */
export function renderSkipsHidden(on) { skipHidden = on; }

/* ---------- 1. Tri par taille a l'ecran ---------- */
function cullable(o) {
  if (!o.isMesh || o.isInstancedMesh || o.frustumCulled === false) return false;
  if (o.layers.mask !== LAYER_ON && o.layers.mask !== LAYER_OFF) return false;
  if (o.userData.noCull) return false;
  const m = o.material;
  if (Array.isArray(m)) return m.every(x => LIT.has(x.type) && x.fog !== false);
  return !!m && LIT.has(m.type) && m.fog !== false && m.blending !== THREE.AdditiveBlending;
}

function shown(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

export class RenderCull {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.enabled = true;
    this.minPx = 1.5;               // rayon apparent minimal (pixels CSS) ; monte avec le niveau de qualite
    this.list = [];
    this.culled = 0;
    this._i = 0;
    this._scanT = 0;
    this._scanId = 0;
    patchHiddenMatrices();
  }

  setLevel(level) { this.minPx = [1.5, 2, 2.6][level] ?? 1.5; }

  /* Liste des candidats, refaite toutes les 2 s (objets ajoutes / retires, materiaux changes). */
  _scan() {
    const id = ++this._scanId;
    const list = [];
    this.scene.traverse((o) => {
      if (cullable(o)) {
        list.push(o); o._rcScan = id;
        /* Personnage anime : l'os racine connait ses maillages et ce qui y est accroche (chapeau, sac). */
        const root = o.isSkinnedMesh && o.skeleton && o.skeleton.bones[0];
        if (root) {
          if (root._rcRoot !== id) {
            root._rcRoot = id; root._rcUsers = [];
            root._rcAtt = [];
            root.traverse((a) => { if (a.isMesh || a.isLine || a.isPoints || a.isSprite) root._rcAtt.push(a); });
          }
          root._rcUsers.push(o);
        }
      } else if (o.layers.mask === LAYER_OFF) o.layers.mask = LAYER_ON;   // n'est plus candidat : on le rend
    });
    /* Sorti de la scene en etant masque : on le rend tel qu'on l'a trouve (il peut revenir, ou etre clone). */
    for (const o of this.list) {
      if (o._rcScan !== id && o.layers.mask === LAYER_OFF) o.layers.mask = LAYER_ON;
      if (o._rcScan !== id && o.isSkinnedMesh && o.skeleton) o.skeleton.bones[0]._rcSkip = false;
    }
    this.list = list;
    this._i = 0;
    this.culled = list.reduce((n, o) => n + (o.layers.mask === LAYER_OFF ? 1 : 0), 0);
  }

  /* Tout remettre (coupure de la fonction, debogage). */
  restore() {
    for (const o of this.list) {
      if (o.layers.mask === LAYER_OFF) o.layers.mask = LAYER_ON;
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.bones[0]._rcSkip = false;
    }
    this.culled = 0;
  }

  /* Les os ne bougent plus a l'ecran si tous les maillages du personnage sont retires
     et que rien de visible n'y est accroche. */
  _skeleton(o) {
    const root = o.skeleton && o.skeleton.bones[0];
    if (!root || !root._rcUsers) return;
    root._rcSkip = root._rcUsers.every(u => u.layers.mask === LAYER_OFF) &&
      root._rcAtt.every(a => a.layers.mask === LAYER_OFF || !a.visible);
  }

  update(dt) {
    if (!this.enabled) { if (this.culled) this.restore(); return; }
    this._scanT -= dt;
    if (this._scanT <= 0) { this._scanT = 2; this._scan(); }
    const cam = this.camera, list = this.list, n = list.length;
    if (!n) return;
    /* Facteur pixels : hauteur d'ecran / (2 tan(fov/2)). */
    /* Taille CSS connue du moteur (lire clientHeight forcerait un calcul de mise en page). */
    const h = this.renderer.getSize(_size).y || 720;
    const k = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const lim = this.minPx / k;           // rayon / distance minimal
    const back = lim * 1.2;                // hysteresis : on reaffiche un peu plus tot
    const cp = cam.position;
    /* La camera a saute (teleportation, changement de vue) : tout refaire tout de suite. */
    const jump = _last.distanceToSquared(cp) > 40 * 40;
    _last.copy(cp);
    const count = jump ? n : Math.ceil(n / 8);
    let culled = this.culled;
    for (let j = 0; j < count; j++) {
      if (this._i >= n) this._i = 0;
      const o = list[this._i++];
      /* Sous un parent cache : ses matrices ne sont pas a jour. On le laisse « affiche », pour qu'il ne
         manque pas a son retour ; il sera re-trie au passage suivant. */
      if (!shown(o)) {
        if (o.layers.mask === LAYER_OFF) { o.layers.mask = LAYER_ON; culled--; if (o.isSkinnedMesh) this._skeleton(o); }
        continue;
      }
      const bs = o.geometry && (o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere));
      if (!bs) continue;
      _c.copy(bs.center).applyMatrix4(o.matrixWorld);
      const d = _c.distanceTo(cp);
      const ratio = d > 1e-3 ? bs.radius * o.matrixWorld.getMaxScaleOnAxis() / d : 1;
      const was = o.layers.mask;
      if (was === LAYER_ON) {
        if (ratio < lim) { o.layers.mask = LAYER_OFF; culled++; }
      } else if (ratio > back) { o.layers.mask = LAYER_ON; culled--; }
      if (o.isSkinnedMesh && was !== o.layers.mask) this._skeleton(o);
    }
    this.culled = culled;
  }
}
