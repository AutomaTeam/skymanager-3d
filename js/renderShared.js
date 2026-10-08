/* ============================================================
   renderShared.js — constantes et petits utilitaires partages
   (decoupe de renderer3d.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import * as THREE from 'three';
import * as TEX from './textures.js?v=1791485856';
import { LAYOUT } from './layout.js?v=1791485856';

/* Modeles externes (CC0/CC-BY, voir assets/models/CREDITS.md). Le
   fuselage/gouvernes de l'avion jouable restent procedurales (elles sont
   animees par flightPhysics.js et servent d'ancrage au diagnostic
   mecanicien) ; seuls le decor cosmetique et les PNJ passent en glTF. */
export const MODEL = {
  human: 'assets/models/character.glb',
  truck: 'assets/models/truck.glb',
  crates: 'assets/models/cargo_crates.glb',
  suitcase: 'assets/models/suitcase.glb',
  gpu: 'assets/models/gpu.glb'
};

export const RUNWAY = {
  length: 3000,
  width: 45,
  startZ: 1500,      // seuil piste 36 (depart vers -Z)
  endZ: -1500
};

/* ---------------------------------------------------------- */
export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

/* Melange lineaire de deux couleurs 0xRRGGBB. */
export function mixHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/* Les jeux de textures de textures.js sont memoises : un meme objet
   Texture est partage par tous les materiaux. Ecrire `repeat` dessus
   (comme le faisait pbr()) faisait donc gagner le dernier materiau cree,
   qui imposait son echelle au terrain, au terminal, a la cabine... On
   derive une copie par couple (texture, repeat) ; l'image, elle, reste
   partagee. */
export const _repeatCache = new Map();

export function withRepeat(tex, repeat) {
  if (!repeat) return tex;
  const key = tex.uuid + '|' + repeat[0] + '|' + repeat[1];
  let t = _repeatCache.get(key);
  if (!t) {
    t = tex.clone();
    t.repeat.set(repeat[0], repeat[1]);
    t.needsUpdate = true;
    _repeatCache.set(key, t);
  }
  return t;
}

/* ------------------------------------------------------------
   Materiaux PBR
   ------------------------------------------------------------
   Toutes les surfaces du decor passent par `pbr()` : un
   MeshStandardMaterial alimente par un jeu de textures
   procedurales (couleur + normales + rugosite). Le rendu gagne
   le grain, les joints et les rivets qui manquaient aux aplats
   Lambert d'origine, sans ajouter une seule lampe.

   `rough` et `metal` sont les valeurs par defaut du materiau ;
   les textures fournies peuvent les moduler via `roughnessMap`.
   ------------------------------------------------------------ */
export function pbr(set, {
  color = 0xffffff, rough = 0.85, metal = 0.0,
  repeat = null, side = THREE.FrontSide, transparent = false,
  opacity = 1, flatShading = false, emissive = 0x000000,
  emissiveIntensity = 1, envMapIntensity = 0.85, alphaTest = 0
} = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: metal,
    side, transparent, opacity, flatShading,
    emissive, emissiveIntensity, envMapIntensity, alphaTest
  });
  if (set) {
    if (set.map) mat.map = withRepeat(set.map, repeat);
    if (set.normalMap) {
      mat.normalMap = withRepeat(set.normalMap, repeat);
      mat.normalScale.set(1, 1);
    }
    if (set.roughnessMap) mat.roughnessMap = set.roughnessMap;
  }
  return mat;
}

/* Plan de l'aeroport (phase 18). Le bloc terminal / porte / passerelle
   (x 230..490, z 1195..1265) est fige : navigation, comptoirs et PNJ en
   dependent. Tout le reste s'organise autour. */
export const TOWER = LAYOUT.tower;

// tour + bureau, a 100 m de la porte
export const LINK_Z = LAYOUT.linkZ;   // bretelles piste <-> taxiway

/* Panneau d'orientation : un sprite (toujours face a la camera) portant un
   grand texte, pour qu'on sache d'un coup d'oeil ou est quoi. */
export function makeSign(text, { bg = '#0f766e', fg = '#ffffff', w = 40, h = 11 } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round(512 * h / w);
  const x = c.getContext('2d');
  const r = 36;
  /* roundRect n'existe pas sur les navigateurs anciens : repli sur un rectangle. */
  const rr = (px, py, pw, ph, pr) => { x.beginPath(); if (x.roundRect) x.roundRect(px, py, pw, ph, pr); else x.rect(px, py, pw, ph); x.fill(); };
  x.fillStyle = 'rgba(255,255,255,0.95)';
  rr(4, 4, c.width - 8, c.height - 8, r);
  x.fillStyle = bg;
  rr(16, 16, c.width - 32, c.height - 32, r - 10);
  x.fillStyle = fg;
  x.font = `800 ${Math.round(c.height * 0.44)}px -apple-system, "Segoe UI", sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, c.width / 2, c.height / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
  spr.scale.set(w, h, 1);
  return spr;
}

/* Raccourci vers le jeu de textures du ciel. */
export const cloudTexture = () => TEX.cloud().map;

/* ============================================================ */
export const clamp01s = (v, lim) => Math.max(-lim, Math.min(lim, v));

/* Le personnage glTF n'a aucune texture (un seul materiau gris) : on le
   colore par sommet selon l'os dominant (tete, bras, jambes, pieds...).
   Materiau mat (metalness 0) : supprime le halo blanc du bloom. */
export const SKIN_TONES = [0xf1c9a5, 0xe0ac86, 0xc68642, 0x8d5524, 0xffdbb4];

export const HAIR_TONES = [0x2b1d14, 0x5a3825, 0x1a1a1a, 0xb5651d, 0xd9b45b];

/* `look` facultatif ({ skin, hair } en couleurs) : l'avatar du joueur garde l'apparence choisie
   (look.js) ; les PNJ, eux, sont tires au hasard. */
export function paintHuman(root, shirtHex, look = null) {
  const pick = (a) => new THREE.Color(a[Math.floor(Math.random() * a.length)]);
  const skin = look && look.skin != null ? new THREE.Color(look.skin) : pick(SKIN_TONES);
  const hair = look && look.hair != null ? new THREE.Color(look.hair) : pick(HAIR_TONES);
  const shirt = new THREE.Color(shirtHex), pants = new THREE.Color(0x475569), shoes = new THREE.Color(0x1f2937);
  root.traverse((o) => {
    if (!o.isMesh || !o.isSkinnedMesh) return;
    /* Les clones du modele partagent la meme geometrie : sans copie, les couleurs du dernier
       personnage peint s'appliquaient a TOUS (PNJ et joueur habilles pareil). */
    if (!o.userData.ownGeo) { o.geometry = o.geometry.clone(); o.userData.ownGeo = true; }
    const names = o.skeleton.bones.map(b => b.name);
    const part = names.map(n =>
      /Foot|Toe/.test(n) ? shoes : /UpLeg|Leg|Hips/.test(n) ? pants :
      /HeadTop/.test(n) ? hair : /Head|Neck|Hand|ForeArm/.test(n) ? skin : shirt);
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    const col = new Float32Array(si.count * 3);
    for (let i = 0; i < si.count; i++) {
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      const c = part[best] || shirt;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    o.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, envMapIntensity: 0.5 });
  });
}

