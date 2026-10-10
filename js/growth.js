/* ============================================================
   growth.js — L'aéroport grandit (plan « jeu cool », lot G)

   Acheter une amélioration à la tour ne changeait que des chiffres :
   rien de nouveau à voir dans le monde. Ici, chaque achat se voit :
     - boutique (x8)   : un kiosque coloré devant le terminal, côté pistes ;
     - porte (x12)     : un panneau « PORTE n » lumineux sur la façade ;
     - salon VIP       : tapis rouge et arche dorée à la porte côté ville,
                         couronne sur le toit ;
     - terminal (x2)   : drapeaux et grande enseigne, puis dôme de verre sur le toit ;
     - piste (x3)      : une rangée de balises colorées le long de la piste ;
     - avion acheté    : il est garé sur le tarmac (4 places), aux couleurs choisies.
   Après un achat, la flèche « Montre-moi » pointe la nouveauté et Coco la présente.

   Rien n'est sauvegardé ici : tout se déduit de la trésorerie (airportTycoon),
   sauf le dernier état vu (pour savoir ce qui est nouveau) : « skymanager.growth ».
   ============================================================ */

import * as THREE from 'three';
import { sfx } from './sfx.js?v=1791617374';
import { load, write } from './save.js?v=1791617374';
import { LAYOUT } from './layout.js?v=1791617374';
import { mergeStaticByMaterial } from './staticMerge.js?v=1791617374';

const STORE = 'skymanager.growth';
const T = LAYOUT.terminal;
const FRONT_Z = T.z0 - 12;                      // kiosques : 12 m devant la façade côté pistes
const KIOSK_X = [258, 274, 289, 318, 440, 456, 471, 485];
/* buy : libellé du bouton ; lines : ce que dit Coco après l'achat. */
const KIOSKS = [
  { ico: '🍦', name: 'GLACES', c1: '#f472b6', c2: '#fdf2f8', buy: 'UNE GLACE', lines: ['Miam ! Fraise-vanille, mon parfum préféré !', 'Brrr, ça gèle les dents !'] },
  { ico: '🥞', name: 'CRÊPES', c1: '#f59e0b', c2: '#fffbeb', buy: 'UNE CRÊPE', lines: ['Une crêpe au chocolat, le carburant des pilotes !', 'Attention, tu as du sucre sur le nez !'] },
  { ico: '🧸', name: 'JOUETS', c1: '#8b5cf6', c2: '#f5f3ff', buy: 'UN JOUET', lines: ['Un petit avion en peluche ! Il ira dans ton cockpit.', 'Un nounours pilote, trop mignon !'] },
  { ico: '🍭', name: 'BONBONS', c1: '#ef4444', c2: '#fff1f2', buy: 'DES BONBONS', lines: ['Une sucette arc-en-ciel ! Tu en donnes une à Coco ?', 'Crunch crunch ! Super bons !'] },
  { ico: '🍕', name: 'PIZZA', c1: '#16a34a', c2: '#f0fdf4', buy: 'UNE PIZZA', lines: ['Une part de pizza bien chaude, parfait avant un vol !', 'Pizza aux quatre fromages… et une olive !'] },
  { ico: '🌻', name: 'FLEURS', c1: '#eab308', c2: '#fefce8', buy: 'UN BOUQUET', lines: ['Un tournesol pour décorer le cockpit !', 'Ça sent bon le printemps !'] },
  { ico: '📚', name: 'LIVRES', c1: '#2563eb', c2: '#eff6ff', buy: 'UNE BD', lines: ['Une BD d\'aventures dans les nuages !', 'Un livre sur les avions du monde entier !'] },
  { ico: '🧃', name: 'JUS', c1: '#ea580c', c2: '#fff7ed', buy: 'UN JUS', lines: ['Un jus d\'orange pressé, plein d\'énergie !', 'Glou glou glou… délicieux !'] }
];
const SNACK_PRICE = 2;
/* Postes des avions achetés (nez vers le terminal), dans une zone libre du tarmac (vérifiée). */
const STANDS = [[360, 1060], [395, 1060], [360, 990], [395, 990]];
const FLEET_TINT = [0xef4444, 0x22c55e, 0xa855f7, 0xf59e0b, 0x06b6d4, 0xec4899];
const RUNWAY_COLORS = [0x38bdf8, 0x4ade80, 0xf472b6];

/* Panneau texte sur toile (une face). */
function textPlane(text, { w = 4, h = 1, bg = '#0f172a', fg = '#fde047', font = 800 } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.max(64, Math.round(512 * h / w));
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 8; x.strokeRect(6, 6, c.width - 12, c.height - 12);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `${font} ${Math.round(c.height * 0.52)}px -apple-system, "Segoe UI", sans-serif`;
  x.fillText(text, c.width / 2, c.height * 0.54);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
}

/* Toile rayée pour l'auvent. */
function stripes(c1, c2) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? c2 : c1; x.fillRect(i * 16, 0, 16, 16); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* Materiaux partages entre kiosques (et une couleur par kiosque) : apres fusion, quelques appels de dessin au lieu d'un par piece. */
const SHARED = {};
const sharedMat = (key, make) => SHARED[key] || (SHARED[key] = make());

function buildKiosk(k) {
  const g = new THREE.Group();
  const wood = sharedMat('wood', () => new THREE.MeshStandardMaterial({ color: 0xfefce8, roughness: 0.8 }));
  const colorMat = sharedMat('k' + k.c1, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(k.c1), roughness: 0.5 }));
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 1.6), wood);
  counter.position.y = 0.55;
  const front = new THREE.Mesh(new THREE.BoxGeometry(3.02, 0.5, 1.62), colorMat);
  front.position.y = 0.85;
  const postMat = sharedMat('post', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
  for (const sx of [-1.4, 1.4]) for (const sz of [-0.7, 0.7]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 6), postMat);
    p.position.set(sx, 1.15 + 0.6, sz);
    g.add(p);
  }
  const awning = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 2.1), new THREE.MeshStandardMaterial({ map: stripes(k.c1, k.c2), roughness: 0.7 }));
  awning.position.y = 2.95;
  awning.rotation.x = -0.12;
  const sign = textPlane(`${k.ico} ${k.name}`, { w: 3, h: 0.75, bg: k.c1, fg: '#ffffff' });
  sign.position.set(0, 3.5, -0.95);
  sign.rotation.y = Math.PI;               // lisible depuis le tarmac (vers -z)
  /* Une petite marchandise colorée sur le comptoir. */
  const goods = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), colorMat);
  goods.position.set(0.6, 1.35, -0.2);
  g.add(counter, front, awning, sign, goods);
  return g;
}

function buildVip() {
  const g = new THREE.Group();
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 15), new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.9 }));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, 0.03, 7.6);
  const gold = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3, metalness: 0.8 });
  for (const sx of [-2.2, 2.2]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 4.2, 12), gold);
    col.position.set(sx, 2.1, 13.5);
    g.add(col);
    /* Poteaux et cordons le long du tapis. */
    for (let i = 0; i < 4; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1, 8), gold);
      post.position.set(sx * 0.95, 0.5, 2 + i * 3.4);
      g.add(post);
    }
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(5, 0.45, 0.45), gold);
  beam.position.set(0, 4.3, 13.5);
  const sign = textPlane('👑 SALON VIP', { w: 4.4, h: 1, bg: '#7f1d1d', fg: '#fde047' });
  sign.position.set(0, 5.05, 13.5);
  g.add(carpet, beam, sign);
  return g;
}

export class Growth {
  constructor(game) {
    this.g = game;
    this.seen = load(STORE, { shops: -1, gates: -1, vipLounge: -1, terminals: -1, runways: -1, fleet: -1 }, 1);
    this.root = new THREE.Group();
    this.root.name = 'growth';
    this.parts = {};
    this._t = 0;
    this.built = null;
    this.planes = [];
  }

  _counts() {
    const t = this.g.tycoon, inf = t.infrastructure;
    return {
      shops: Math.min(KIOSKS.length, inf.shops || 0),
      gates: Math.min(12, inf.gates || 0),
      vipLounge: inf.vipLounge ? 1 : 0,
      terminals: Math.min(2, Math.max(0, (inf.terminals || 1) - 1)),     // agrandissements achetés (le 1er terminal existe déjà)
      runways: Math.min(3, Math.max(0, (inf.runways || 1) - 1)),
      fleet: Math.min(STANDS.length, Math.max(0, t.fleet.length - 1))
    };
  }

  update(dt) {
    const g = this.g;
    if (!g.arcade || !g.arcade.on || g.state === 'BOOT') return;
    if (!this.root.parent) g.r3d.airport.add(this.root);
    this._t -= dt;
    if (this._t > 0) return;
    this._t = 1;
    const c = this._counts();
    if (!this.built) { this._rebuildAll(c); this.built = c; this._remember(c); return; }
    for (const k of Object.keys(c)) {
      if (c[k] === this.built[k]) continue;
      const grew = c[k] > this.built[k];
      this._rebuild(k, c[k]);
      if (grew && this.seen[k] >= 0 && c[k] > this.seen[k]) this._announce(k, c[k]);
    }
    this.built = c;
    this._remember(c);
  }

  _remember(c) {
    if (Object.keys(c).some(k => c[k] !== this.seen[k])) { this.seen = Object.assign({}, c); write(STORE, this.seen, 1); }
  }

  _rebuildAll(c) { for (const k of Object.keys(c)) this._rebuild(k, c[k]); }

  _rebuild(kind, n) {
    const old = this.parts[kind];
    if (old) { this.root.remove(old); old.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    const grp = new THREE.Group();
    grp.name = 'growth-' + kind;
    this['_build_' + kind](grp, n);
    if (kind !== 'fleet') mergeStaticByMaterial(grp);     // les pieces qui partagent un materiau = un seul appel de dessin
    this.parts[kind] = grp;
    this.root.add(grp);
  }

  _build_shops(grp, n) {
    for (let i = 0; i < n; i++) {
      const k = buildKiosk(KIOSKS[i]);
      k.position.set(KIOSK_X[i], 0, FRONT_Z);
      grp.add(k);
    }
  }

  _build_gates(grp, n) {
    if (n < 1) return;
    const x0 = T.x0 + 14, x1 = T.x1 - 14;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (n - 1);
      const s = textPlane(`PORTE ${i + 1}`, { w: 4.2, h: 1.1, bg: '#0c4a6e', fg: '#fde047' });
      s.position.set(x, 8.6, T.z0 - 0.35);
      s.rotation.y = Math.PI;
      grp.add(s);
    }
  }

  _build_vipLounge(grp, n) {
    if (!n) return;
    const v = buildVip();
    v.position.set(T.doorX, 0, T.z1);
    grp.add(v);
    const crown = textPlane('👑 VIP', { w: 5, h: 1.6, bg: '#7f1d1d', fg: '#fde047' });
    crown.position.set(T.doorX, T.h + 2.2, T.z0 + 2);
    crown.rotation.y = Math.PI;
    grp.add(crown);
  }

  _build_terminals(grp, n) {
    if (n >= 1) {
      /* Drapeaux de toutes les couleurs le long du toit, côté pistes. */
      const cols = [0xef4444, 0xf59e0b, 0x22c55e, 0x3b82f6, 0xa855f7, 0xec4899];
      const pole = sharedMat('pole', () => new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.4, metalness: 0.6 }));
      for (let i = 0, x = T.x0 + 10; x <= T.x1 - 10; x += 20, i++) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), pole);
        p.position.set(x, T.h + 2, T.z0 + 1.5);
        const col = cols[i % cols.length];
        const f = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), sharedMat('flag' + col, () => new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.8 })));
        f.position.set(x + 0.95, T.h + 3.4, T.z0 + 1.5);
        f.userData.flag = i;
        grp.add(p, f);
      }
    }
    if (n >= 1) {
      const s = textPlane('✈ AÉROPORT INTERNATIONAL ✈', { w: 48, h: 5, bg: '#1e3a8a', fg: '#fde047' });
      s.position.set(T.doorX, T.h + 9, T.z0 + 8);
      s.rotation.y = Math.PI;
      grp.add(s);
    }
    if (n >= 2) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x7dd3fc, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.55 }));
      dome.position.set(T.doorX + 70, T.h, (T.z0 + T.z1) / 2);
      grp.add(dome);
    }
  }

  _build_runways(grp, n) {
    const R = LAYOUT.runway;
    const geo = new THREE.BoxGeometry(0.7, 0.9, 0.7);
    for (let k = 0; k < n; k++) {
      const per = Math.floor((R.zStart - R.zEnd) / 60);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: RUNWAY_COLORS[k] }), per * 2);
      const m = new THREE.Matrix4();
      let i = 0;
      for (let j = 0; j < per; j++) {
        const z = R.zEnd + 30 + j * 60 + k * 20;
        for (const side of [-1, 1]) { m.makeTranslation(R.x + side * (R.width / 2 + 3 + k * 2), 0.45, z); mesh.setMatrixAt(i++, m); }
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      grp.add(mesh);
    }
  }

  _build_fleet(grp, n) {
    this.planes = [];
    /* Un seul avion construit, les autres en sont des copies : memes materiaux (donc fusionnables
       ensemble), sauf la peinture d'accent (rough 0.32, metal 0.2) propre a chaque compagnie. */
    let model = null;
    for (let i = 0; i < n; i++) {
      const [x, z] = STANDS[i];
      let a;
      if (!model) { a = model = this.g.r3d.buildStaticAircraft(grp, new THREE.Vector3(x, 3.45, z), 180); } else { a = model.clone(); a.position.set(x, 3.45, z); grp.add(a); }
      const tint = FLEET_TINT[i % FLEET_TINT.length];
      let accent = null;
      a.traverse(o => {
        if (!o.isMesh || !o.material || o.material.roughness !== 0.32 || o.material.metalness !== 0.2) return;
        if (!accent) {
          accent = o.material.clone();
          accent.map = null;                // la texture de livrée (bleu nuit) mangeait la teinte
          accent.color.setHex(tint);
        }
        o.material = accent;
      });
      this.planes.push({ x, z });
    }
    if (n) mergeStaticByMaterial(grp);
  }

  /* La flèche montre la nouveauté, Coco la présente. */
  _announce(kind, n) {
    const g = this.g, A = g.arcade;
    const at = {
      shops: () => ({ x: KIOSK_X[n - 1], z: FRONT_Z - 3, txt: `Regarde ! Ton kiosque ${KIOSKS[n - 1].ico} ${KIOSKS[n - 1].name.toLowerCase()} est devant le terminal !` }),
      gates: () => ({ x: T.doorX, z: T.z0 - 14, txt: `Nouvelle porte ! Ton terminal a maintenant ${n} portes.` }),
      vipLounge: () => ({ x: T.doorX, z: T.z1 + 16, txt: 'Le salon VIP est ouvert : tapis rouge côté ville !' }),
      terminals: () => ({ x: T.doorX, z: T.z0 - 20, txt: n >= 2 ? 'Un dôme de verre sur le toit : ton terminal est magnifique !' : 'Regarde le toit du terminal : des drapeaux et AÉROPORT INTERNATIONAL !' }),
      runways: () => ({ x: LAYOUT.runway.x + 30, z: 1100, txt: 'Ta piste brille de nouvelles balises de couleur !' }),
      fleet: () => ({ x: STANDS[n - 1][0], z: STANDS[n - 1][1] + 18, txt: 'Ton nouvel avion est garé sur le tarmac. Il vole tout seul pour toi !' })
    }[kind];
    if (!at) return;
    const p = at();
    if (g.state === 'HUB' && A.showMe) A.showMe({ icon: '✨', text: '✨ ' + p.txt, target: { x: p.x, z: p.z } }, 25);
    if (g.fun) g.fun.say(p.txt, 3, 5200);
  }

  /* Bouton contextuel près d'un kiosque ouvert (social.near). */
  nearKiosk(p) {
    if (!this.built) return null;
    for (let i = 0; i < this.built.shops; i++) {
      if (Math.hypot(KIOSK_X[i] - p.x, FRONT_Z - p.z) < 3.4) {
        const k = KIOSKS[i];
        return { kind: 'kiosk', i, label: `${k.ico} ${k.buy} (${SNACK_PRICE} 🪙)` };
      }
    }
    return null;
  }

  /* Petit achat rigolo : quelques pièces, une bulle, une phrase. Trophée « Gourmand » à 5. */
  buyAt(i, bubble) {
    const g = this.g, A = g.arcade, k = KIOSKS[i];
    if (!k) return;
    if (A.coins < SNACK_PRICE) { g.toast('Pas assez de pièces… vole encore un peu !', 2200, 'warn'); return; }
    g.tycoon.cash -= SNACK_PRICE * 1000;
    g.tycoon.save();
    const s = A.data.stats;
    s.snacks = (s.snacks || 0) + 1;
    A.save();
    A.event('snack');
    if (bubble) bubble(k.ico);
    sfx.pop();
    A.popup(`${k.ico} -${SNACK_PRICE} 🪙`);
    if (g.fun) g.fun.say(k.lines[Math.floor(Math.random() * k.lines.length)], 2, 3600);
    try { A.confetti(12); } catch (e) { /* effet seulement */ }
  }

  /* Corps solides pour le joueur : kiosques, colonnes VIP, fuselages et réacteurs des avions garés. */
  bodies() {
    if (this.g.state !== 'HUB' || !this.built) return [];
    const out = [];
    for (let i = 0; i < this.built.shops; i++) out.push({ x: KIOSK_X[i], z: FRONT_Z, r: 1.7, ref: this });
    if (this.built.vipLounge) for (const sx of [-2.2, 2.2]) out.push({ x: T.doorX + sx, z: T.z1 + 13.5, r: 0.35, ref: this });
    for (const p of this.planes) {
      out.push({ x: p.x, z: p.z, h: 0, hl: 13, hw: 1.6, ref: this });
      for (const sx of [-4.6, 4.6]) out.push({ x: p.x + sx, z: p.z + 0.5, r: 1.2, ref: this });
    }
    return out;
  }

  tips() {
    const c = this.built;
    if (!c) return [];
    return c.shops < KIOSKS.length ? ['🛍️ Chaque boutique achetée à la tour ouvre un kiosque devant le terminal !'] : [];
  }
}
