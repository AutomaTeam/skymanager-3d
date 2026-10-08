/* ============================================================
   livery.js — Peinture et decalques des avions (hangar, vague 2)

   Une livree = couleur de carrosserie + couleur d'accent + motif
   sur le flanc + autocollants + nom sur le fuselage. Ce module fournit :
     - le catalogue (couleurs, motifs, autocollants, prix) ;
     - les textures dessinees a la volee (canvas) ;
     - LiveryRig : pose les decalques sur un modele et applique
       une livree (couleurs, motif, autocollants, nom).

   Les decalques sont des bandes COURBES collees sur le fuselage
   (rayon variable selon z) : ils suivent la peau de l'avion. Sur le
   flanc gauche le nez est a gauche de l'ecran, sur le droit a droite ;
   les textes sont retournes pour rester lisibles des deux cotes.
   ============================================================ */

import * as THREE from 'three';

/* ---------------- Catalogue ---------------- */
/* tier : 0 = gratuit, 1 = courant, 2 = rare (coffres, plus cher) */
export const BODY_COLORS = [
  { id: 'white',  name: 'Blanc',      hex: 0xf4f0e6, price: 0 },
  { id: 'sun',    name: 'Soleil',     hex: 0xffd23f, price: 0 },
  { id: 'red',    name: 'Rouge',      hex: 0xe53935, price: 0 },
  { id: 'sky',    name: 'Ciel',       hex: 0x4aa3ff, price: 0 },
  { id: 'mint',   name: 'Menthe',     hex: 0x4fd6a0, price: 0 },
  { id: 'pink',   name: 'Bonbon',     hex: 0xff7ac6, price: 0 },
  { id: 'orange', name: 'Mandarine',  hex: 0xff8a2b, price: 8 },
  { id: 'purple', name: 'Violet',     hex: 0x9b6bff, price: 8 },
  { id: 'lime',   name: 'Citron vert', hex: 0xa4e832, price: 8 },
  { id: 'navy',   name: 'Nuit',       hex: 0x233a7a, price: 12 },
  { id: 'black',  name: 'Ninja',      hex: 0x2b2d33, price: 20 },
  { id: 'gold',   name: 'Or',         hex: 0xe8b923, price: 60, rare: true },
  { id: 'silver', name: 'Argent',     hex: 0xc7ccd4, price: 40, rare: true },
  { id: 'rose',   name: 'Rose gold',  hex: 0xf0a58d, price: 60, rare: true }
];

export const ACCENT_COLORS = [
  { id: 'red',    name: 'Rouge',    hex: 0xe53935, price: 0 },
  { id: 'blue',   name: 'Bleu',     hex: 0x1e6fe0, price: 0 },
  { id: 'yellow', name: 'Jaune',    hex: 0xffcc00, price: 0 },
  { id: 'green',  name: 'Vert',     hex: 0x22b573, price: 0 },
  { id: 'orange', name: 'Orange',   hex: 0xff7a1a, price: 0 },
  { id: 'pink',   name: 'Rose',     hex: 0xff4fa3, price: 0 },
  { id: 'purple', name: 'Violet',   hex: 0x7c4dff, price: 8 },
  { id: 'cyan',   name: 'Turquoise', hex: 0x18c6d8, price: 8 },
  { id: 'black',  name: 'Noir',     hex: 0x1d2025, price: 8 },
  { id: 'white',  name: 'Blanc',    hex: 0xffffff, price: 8 },
  { id: 'gold',   name: 'Or',       hex: 0xe8b923, price: 40, rare: true }
];

/* Motifs : dessines dans une bande 1024 x 128 (nez a gauche). */
export const PATTERNS = [
  { id: 'none',    name: 'Sans motif',  ico: '⬜', price: 0 },
  { id: 'stripes', name: 'Rayures',     ico: '➖', price: 0 },
  { id: 'wave',    name: 'Vagues',      ico: '🌊', price: 0 },
  { id: 'checker', name: 'Damier',      ico: '🏁', price: 10 },
  { id: 'zigzag',  name: 'Zigzag',      ico: '⚡', price: 10 },
  { id: 'dots',    name: 'Pois',        ico: '🔴', price: 10 },
  { id: 'stars',   name: 'Etoiles',     ico: '⭐', price: 15 },
  { id: 'flames',  name: 'Flammes',     ico: '🔥', price: 20 },
  { id: 'tiger',   name: 'Tigre',       ico: '🐯', price: 25, rare: true },
  { id: 'rainbow', name: 'Arc-en-ciel', ico: '🌈', price: 40, rare: true }
];

/* Autocollants (emoji dessines sur une pastille). */
export const STICKERS = [
  { id: 'none', name: 'Aucun', ico: '∅', price: 0 },
  { id: 'star', name: 'Etoile', ico: '⭐', price: 0 },
  { id: 'heart', name: 'Coeur', ico: '❤️', price: 0 },
  { id: 'smile', name: 'Sourire', ico: '😀', price: 0 },
  { id: 'sun', name: 'Soleil', ico: '☀️', price: 4 },
  { id: 'bolt', name: 'Eclair', ico: '⚡', price: 4 },
  { id: 'rocket', name: 'Fusee', ico: '🚀', price: 6 },
  { id: 'flame', name: 'Flamme', ico: '🔥', price: 6 },
  { id: 'rainbow', name: 'Arc-en-ciel', ico: '🌈', price: 6 },
  { id: 'cat', name: 'Chat', ico: '🐱', price: 8 },
  { id: 'dog', name: 'Chien', ico: '🐶', price: 8 },
  { id: 'panda', name: 'Panda', ico: '🐼', price: 8 },
  { id: 'fox', name: 'Renard', ico: '🦊', price: 8 },
  { id: 'unicorn', name: 'Licorne', ico: '🦄', price: 12 },
  { id: 'dino', name: 'Dino', ico: '🦖', price: 12 },
  { id: 'shark', name: 'Requin', ico: '🦈', price: 12 },
  { id: 'robot', name: 'Robot', ico: '🤖', price: 12 },
  { id: 'alien', name: 'Alien', ico: '👽', price: 15 },
  { id: 'ghost', name: 'Fantome', ico: '👻', price: 15 },
  { id: 'pizza', name: 'Pizza', ico: '🍕', price: 15 },
  { id: 'donut', name: 'Donut', ico: '🍩', price: 15 },
  { id: 'cool', name: 'Lunettes', ico: '😎', price: 15 },
  { id: 'turtle', name: 'Tortue', ico: '🐢', price: 8 },
  { id: 'penguin', name: 'Pingouin', ico: '🐧', price: 8 },
  { id: 'butterfly', name: 'Papillon', ico: '🦋', price: 8 },
  { id: 'flower', name: 'Fleur', ico: '🌸', price: 8 },
  { id: 'icecream', name: 'Glace', ico: '🍦', price: 12 },
  { id: 'ball', name: 'Ballon', ico: '⚽', price: 12 },
  { id: 'octopus', name: 'Pieuvre', ico: '🐙', price: 12 },
  { id: 'guitar', name: 'Guitare', ico: '🎸', price: 15 },
  { id: 'crown', name: 'Couronne', ico: '👑', price: 40, rare: true },
  { id: 'diamond', name: 'Diamant', ico: '💎', price: 40, rare: true },
  { id: 'trophy', name: 'Trophee', ico: '🏆', price: 40, rare: true },
  { id: 'dragon', name: 'Dragon', ico: '🐉', price: 50, rare: true }
];

export const find = (list, id) => list.find(x => x.id === id) || list[0];

export const defaultLivery = (planeId) => ({
  body: planeId === 'zebulon' ? 'white' : 'white',
  accent: planeId === 'zebulon' ? 'orange' : planeId === 'pioupiou' ? 'red' : planeId === 'hydravion' ? 'blue' : planeId === 'helico' ? 'orange' : 'blue',
  pattern: 'none',
  stickers: ['none', 'none', 'none'],
  name: ''
});

/* ---------------- Partage d'une livree (I06) ----------------
   Code court : « SKY1. » + base64 d'un JSON compact { p: avion, b: couleur, a: accent, t: motif, s: [3 autocollants], n: nom }.
   decodeLivery valide tout (ids connus, nom de 12 lettres) ; ce que le joueur ne possede pas est remplace par le choix gratuit. */
const b64e = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = (str) => decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));
export function encodeLivery(planeId, lv) {
  return 'SKY1.' + b64e(JSON.stringify({ p: planeId, b: lv.body, a: lv.accent, t: lv.pattern, s: lv.stickers.slice(0, 3), n: (lv.name || '').slice(0, 12) }));
}
/* owned(kind, item) -> bool. Rend { planeId, livery } ou null si le code est invalide. */
export function decodeLivery(code, owned = () => true) {
  try {
    const m = String(code || '').trim().match(/^SKY1\.([A-Za-z0-9_-]{8,600})$/);
    if (!m) return null;
    const d = JSON.parse(b64d(m[1]));
    if (!d || typeof d !== 'object') return null;
    const pick = (list, kind, id, fallback) => { const it = list.find(x => x.id === id); return it && owned(kind, it) ? it.id : fallback; };
    const base = defaultLivery(String(d.p || ''));
    const stickers = Array.isArray(d.s) ? d.s.slice(0, 3) : [];
    return {
      planeId: String(d.p || ''),
      livery: {
        body: pick(BODY_COLORS, 'body', d.b, base.body),
        accent: pick(ACCENT_COLORS, 'accent', d.a, base.accent),
        pattern: pick(PATTERNS, 'pattern', d.t, 'none'),
        stickers: [0, 1, 2].map(i => pick(STICKERS, 'sticker', stickers[i], 'none')),
        name: String(d.n || '').toUpperCase().replace(/[^A-Z0-9 !'-]/g, '').slice(0, 12)
      }
    };
  } catch (e) { return null; }
}

/* ---------------- Textures ---------------- */
const cache = new Map();
const hexCss = (h) => '#' + (h & 0xffffff).toString(16).padStart(6, '0');
const canvasTex = (cv) => {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

export function patternTexture(id, c1, c2) {
  const key = `p:${id}:${c1}:${c2}`;
  if (cache.has(key)) return cache.get(key);
  const W = 1024, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const A = hexCss(c1), B = hexCss(c2);
  x.clearRect(0, 0, W, H);
  switch (id) {
    case 'stripes':
      x.fillStyle = A; x.fillRect(0, 22, W, 40);
      x.fillStyle = B; x.fillRect(0, 72, W, 16);
      break;
    case 'wave':
      for (let k = 0; k < 2; k++) {
        x.beginPath();
        x.moveTo(0, H);
        for (let i = 0; i <= W; i += 8) x.lineTo(i, 52 + k * 30 + Math.sin(i / 38 + k) * 16);
        x.lineTo(W, H); x.closePath();
        x.fillStyle = k ? B : A; x.fill();
      }
      break;
    case 'checker': {
      const s = 32;
      for (let i = 0; i < W / s; i++) for (let j = 0; j < 4; j++) {
        if ((i + j) % 2) { x.fillStyle = A; x.fillRect(i * s, j * s, s, s); }
        else { x.fillStyle = B; x.fillRect(i * s, j * s, s, s); }
      }
      break;
    }
    case 'zigzag':
      x.fillStyle = A;
      x.beginPath(); x.moveTo(0, H);
      for (let i = 0; i <= W; i += 64) { x.lineTo(i, 20); x.lineTo(i + 32, H - 8); }
      x.lineTo(W, H); x.closePath(); x.fill();
      x.strokeStyle = B; x.lineWidth = 10; x.beginPath(); x.moveTo(0, 20);
      for (let i = 0; i <= W; i += 64) { x.lineTo(i, 20); x.lineTo(i + 32, H - 8); }
      x.stroke();
      break;
    case 'dots':
      for (let i = 0; i < 17; i++) for (let j = 0; j < 3; j++) {
        x.fillStyle = (i + j) % 2 ? A : B;
        x.beginPath(); x.arc(30 + i * 60, 22 + j * 42 + (i % 2) * 20, 15, 0, 6.3); x.fill();
      }
      break;
    case 'stars':
      for (let i = 0; i < 11; i++) {
        const cx = 50 + i * 92, cy = 64 + (i % 2 ? -16 : 16), R = 30 + (i % 3) * 5;
        x.fillStyle = i % 2 ? A : B;
        x.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? R * 0.45 : R;
          x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        x.closePath(); x.fill();
      }
      break;
    case 'flames':
      /* des langues de feu qui partent du nez (a gauche) vers l'arriere */
      for (const [col, k] of [[A, 1], [B, 0.62]]) {
        x.fillStyle = col;
        x.beginPath(); x.moveTo(0, H);
        x.lineTo(0, 30);
        for (let i = 0; i < 6; i++) {
          const x0 = i * 56 * k + 20;
          x.bezierCurveTo(x0 + 120 * k, 18 + i * 8, x0 + 190 * k, 70 + i * 4, x0 + 330 * k - i * 20, 62 + i * 4);
          x.bezierCurveTo(x0 + 190 * k, 100, x0 + 130 * k, 110, x0 + 90 * k, H);
        }
        x.lineTo(0, H); x.closePath(); x.fill();
      }
      break;
    case 'tiger':
      x.fillStyle = A; x.fillRect(0, 0, W, H);
      x.fillStyle = B;
      for (let i = 0; i < 24; i++) {
        const px = 20 + i * 42 + (i % 3) * 6;
        x.beginPath();
        x.moveTo(px, 0); x.quadraticCurveTo(px + 14, 40 + (i % 4) * 14, px + 4, 40 + (i % 5) * 18 + 30);
        x.lineTo(px + 18, 0); x.closePath(); x.fill();
        x.beginPath();
        x.moveTo(px + 6, H); x.quadraticCurveTo(px + 20, H - 30, px + 8, H - 50 - (i % 3) * 12);
        x.lineTo(px + 24, H); x.closePath(); x.fill();
      }
      break;
    case 'rainbow': {
      const cols = ['#ff3b3b', '#ff9a1f', '#ffe033', '#3ddc6a', '#38a1ff', '#9b6bff'];
      cols.forEach((c, i) => { x.fillStyle = c; x.fillRect(0, 8 + i * 18, W, 18); });
      break;
    }
    default: break;
  }
  const t = canvasTex(cv);
  cache.set(key, t);
  return t;
}

export function stickerTexture(id) {
  const key = `s:${id}`;
  if (cache.has(key)) return cache.get(key);
  const S = find(STICKERS, id);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const x = cv.getContext('2d');
  /* pastille blanche + liseret pour que l'emoji se lise sur toutes les couleurs */
  x.fillStyle = 'rgba(255,255,255,0.96)';
  x.beginPath(); x.arc(128, 128, 118, 0, 6.3); x.fill();
  x.strokeStyle = 'rgba(20,30,50,0.55)'; x.lineWidth = 8; x.stroke();
  x.font = '150px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(S.ico, 128, 140);
  const t = canvasTex(cv);
  cache.set(key, t);
  return t;
}

export function nameTexture(text, color) {
  const key = `n:${text}:${color}`;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 128;
  const x = cv.getContext('2d');
  x.clearRect(0, 0, 1024, 128);
  if (text) {
    let size = 104;
    x.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
    while (x.measureText(text).width > 980 && size > 30) { size -= 4; x.font = `900 ${size}px "Arial Black", Arial, sans-serif`; }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineJoin = 'round';
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 12; x.strokeText(text, 512, 68);
    x.fillStyle = hexCss(color); x.fillText(text, 512, 68);
  }
  const t = canvasTex(cv);
  cache.set(key, t);
  return t;
}

/* ---------------- Geometrie : bande courbe collee sur un fuselage ----------------
   side  : -1 flanc gauche, +1 flanc droit
   z0,z1 : etendue de la bande ; yc,h : centre et demi-hauteur
   radius: z -> rayon du fuselage ; flipU : lecture de l'avant vers l'arriere */
export function curvedDecal({ side, z0, z1, yc, h, radius, flipU = false, off = 0.012, nz = 14, ny = 3 }) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nz; i++) {
    const z = z0 + (z1 - z0) * i / nz;
    const R = radius(z) + off;
    for (let j = 0; j <= ny; j++) {
      const y = yc - h + (2 * h) * j / ny;
      const xx = Math.sqrt(Math.max(0.0001, R * R - y * y));
      pos.push(side * xx, y, z);
      const u = i / nz;
      uv.push(flipU ? 1 - u : u, j / ny);
    }
  }
  for (let i = 0; i < nz; i++) for (let j = 0; j < ny; j++) {
    const a = i * (ny + 1) + j, b = a + ny + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const decalMat = () => new THREE.MeshBasicMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
});

/* ---------------- LiveryRig ----------------
   model : { group, body:[mat], accent:[mat], slots } (voir planeModels.js)
   Pour le jet de ligne, slots est fourni par renderer3d (linerSlots). */
export class LiveryRig {
  constructor(model) {
    this.model = model;
    this.group = new THREE.Group();
    this.group.name = 'livery';
    model.group.add(this.group);
    const s = model.slots;
    this.bands = [];
    this.names = [];
    this.stickerMeshes = [];
    const r = s.radius;

    /* motif de flanc */
    for (const side of [-1, 1]) {
      const b = s.band;
      const m = new THREE.Mesh(curvedDecal({ side, z0: b.z0, z1: b.z1, yc: b.yc, h: b.h, radius: r, flipU: false, nz: 24 }), decalMat());
      m.visible = false;
      m.userData.noShadow = true;
      this.group.add(m);
      this.bands.push(m);
      /* nom */
      const n = s.name;
      const nm = new THREE.Mesh(curvedDecal({ side, z0: n.z0, z1: n.z1, yc: n.yc, h: n.h, radius: r, flipU: side > 0, off: 0.016, nz: 24 }), decalMat());
      nm.visible = false;
      nm.userData.noShadow = true;
      this.group.add(nm);
      this.names.push(nm);
    }
    /* autocollants */
    s.stickers.forEach((st, k) => {
      const pair = [];
      for (const side of [-1, 1]) {
        const half = st.size / 2;
        const m = new THREE.Mesh(curvedDecal({
          side, z0: st.z - half, z1: st.z + half, yc: st.yc, h: half,
          radius: (z) => st.radius || r(z), flipU: side > 0, off: 0.02, nz: 6, ny: 6
        }), decalMat());
        m.visible = false;
        m.userData.noShadow = true;
        this.group.add(m);
        pair.push(m);
      }
      this.stickerMeshes.push(pair);
    });
    /* autocollant de derive (un par cote) */
    this.fin = [];
    if (s.tailFin) {
      const f = s.tailFin;
      for (const side of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(f.size, f.size), decalMat());
        m.position.set(side * (f.halfThick + 0.012), f.yc, f.zc);
        m.rotation.y = side * Math.PI / 2;
        m.visible = false;
        m.userData.noShadow = true;
        this.group.add(m);
        this.fin.push(m);
      }
    }
  }

  apply(lv) {
    const body = find(BODY_COLORS, lv.body), acc = find(ACCENT_COLORS, lv.accent);
    this.model.body.forEach(m => m.color.setHex(body.hex));
    this.model.accent.forEach(m => m.color.setHex(acc.hex));
    /* motif : couleur 1 = accent, couleur 2 = blanc (ou noir sur fond clair) */
    const bodyLum = ((body.hex >> 16 & 255) * 0.3 + (body.hex >> 8 & 255) * 0.59 + (body.hex & 255) * 0.11);
    const second = bodyLum > 140 ? 0x1d2025 : 0xffffff;
    const c2 = (lv.pattern === 'tiger') ? 0x1d2025 : (lv.pattern === 'flames' ? 0xffd23f : second);
    const showPattern = lv.pattern && lv.pattern !== 'none';
    this.bands.forEach(m => {
      m.visible = !!showPattern;
      if (showPattern) { m.material.map = patternTexture(lv.pattern, acc.hex, c2); m.material.needsUpdate = true; }
    });
    /* nom */
    const nameColor = bodyLum > 150 ? acc.hex : 0xffffff;
    this.names.forEach(m => {
      m.visible = !!lv.name;
      if (lv.name) { m.material.map = nameTexture(lv.name, nameColor); m.material.needsUpdate = true; }
    });
    /* autocollants */
    this.stickerMeshes.forEach((pair, k) => {
      const id = lv.stickers[k];
      const on = id && id !== 'none';
      pair.forEach(m => { m.visible = !!on; if (on) { m.material.map = stickerTexture(id); m.material.needsUpdate = true; } });
    });
    /* derive : reprend le premier autocollant non vide */
    const finId = lv.stickers.find(x => x && x !== 'none');
    this.fin.forEach((m, i) => {
      m.visible = !!finId;
      if (finId) { m.material.map = stickerTexture(finId); m.material.needsUpdate = true; m.scale.x = i ? -1 : 1; }
    });
  }
}
