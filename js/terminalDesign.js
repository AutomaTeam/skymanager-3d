/* ============================================================
   terminalDesign.js — Refonte visuelle du terminal (phase 32)

   Le hall de 260 x 70 m etait un grand volume vide a un seul sol.
   Cette passe lui donne une identite, SANS toucher aux positions des
   comptoirs, a la navigation ni aux PNJ (tout ce qui est ajoute ici
   est au sol a plat, sur les murs ou au plafond) :

   - sol zone par zone : couleur et liseré par fonction (enregistrement,
     surete, boutiques, bagages) + allee centrale ;
   - plafond a nervures, bandeaux lumineux colores par zone, suspensions ;
   - six vitrines de boutiques le long du mur sud (enseignes, etageres) ;
   - fresques aux deux pignons ;
   - bandeau de rive de la facade aux couleurs de la compagnie.

   Tout est auto-eclaire (MeshBasic) ou instancie : une trentaine
   d'appels de dessin au total.
   ============================================================ */
import * as THREE from 'three';
import { LAYOUT } from './layout.js?v=1791470927';

const T = LAYOUT.terminal;
const H = T.h;
const D = T.z1 - T.z0;
const CZ = (T.z0 + T.z1) / 2;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const roundRect = (x, a, b, w, h, r) => {
  x.beginPath();
  x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
};

/* Tapis de sol d'une zone : aplat, liseré clair, motif discret. */
function floorZone(g, [x0, x1, z0, z1], hex, y = 0.038) {
  const col = '#' + new THREE.Color(hex).getHexString();
  const tex = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = col; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,0.05)'; x.lineWidth = 2;
    for (let i = -h; i < w; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + h, h); x.stroke(); }
    x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 8;
    x.strokeRect(10, 10, w - 20, h - 20);
  });
  const m = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.5, metalness: 0.02, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.07,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m);
  p.rotation.x = -Math.PI / 2;
  p.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  p.receiveShadow = true;
  g.add(p);
}

/* Vitrine de boutique : enseigne, vitrine eclairee, etageres colorees. */
function shopTexture(name, accent, items) {
  return canvasTex(512, 160, (x, w, h) => {
    x.fillStyle = '#1b2433'; x.fillRect(0, 0, w, h);
    x.fillStyle = accent; x.fillRect(0, 0, w, 44);
    x.fillStyle = '#fff'; x.font = '800 30px -apple-system,"Segoe UI",sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(name, w / 2, 24);
    const g = x.createLinearGradient(0, 50, 0, h);
    g.addColorStop(0, '#fff3d6'); g.addColorStop(1, '#f6d9a0');
    x.fillStyle = g; roundRect(x, 14, 52, w - 28, h - 62, 8); x.fill();
    x.strokeStyle = '#8b6b3a'; x.lineWidth = 3;
    for (let r = 0; r < 3; r++) {
      const yy = 84 + r * 26;
      x.beginPath(); x.moveTo(24, yy); x.lineTo(w - 24, yy); x.stroke();
      for (let k = 0; k < 9; k++) {
        x.fillStyle = items[(r * 3 + k) % items.length];
        roundRect(x, 34 + k * 52, yy - 20 + (k % 2) * 4, 30, 18 - (k % 3) * 2, 3); x.fill();
      }
    }
  });
}

/* Fresque de pignon : degrade de ciel, silhouette de ville, avion. */
function muralTexture(from, to) {
  return canvasTex(1024, 128, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, from); g.addColorStop(1, to);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.28)';
    for (let i = 0; i < 6; i++) { roundRect(x, 80 + i * 170, 20 + (i % 3) * 14, 90, 22, 11); x.fill(); }
    x.fillStyle = 'rgba(15,40,80,0.55)';
    let px = 0;
    while (px < w) { const bw = 34 + (px * 7 % 40), bh = 22 + (px * 13 % 46); x.fillRect(px, h - bh, bw, bh); px += bw + 4; }
    x.fillStyle = '#fff';
    x.save(); x.translate(700, 52); x.rotate(-0.18);
    x.beginPath(); x.ellipse(0, 0, 58, 7, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(-6, 0); x.lineTo(-30, -26); x.lineTo(-18, -26); x.lineTo(14, 0); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(-6, 0); x.lineTo(-30, 26); x.lineTo(-18, 26); x.lineTo(14, 0); x.closePath(); x.fill();
    x.restore();
    x.fillStyle = '#fff'; x.font = '800 34px -apple-system,"Segoe UI",sans-serif';
    x.textAlign = 'left'; x.textBaseline = 'middle';
    x.fillText('BIENVENUE · WELCOME · BIENVENIDOS', 40, 34);
  });
}

export function buildTerminalDesign({ pbr, TEX }) {
  const g = new THREE.Group();
  g.name = 'terminalDesign';

  /* ---- Sol : zones par fonction + allee centrale ---- */
  floorZone(g, [318, 358, 1230, 1262], 0x2f5fa8);      // enregistrement
  floorZone(g, [384, 408, 1228, 1262], 0x1f8a80);      // surete
  floorZone(g, [426, 472, 1241, 1262], 0xb4572f);      // boutiques
  floorZone(g, [248, 282, 1226, 1262], 0x6d4fb3);      // bagages
  floorZone(g, [355, 365, 1210, 1262], 0x8fa6bd);      // allee centrale

  /* ---- Plafond : nervures blanches + longerons ---- */
  {
    const ribMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6, emissive: 0x2a2f36, emissiveIntensity: 1 });
    const xs = [];
    for (let x = T.x0 + 5; x < T.x1 - 3; x += 10) xs.push(x);
    const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.8, D - 3), ribMat, xs.length);
    const m4 = new THREE.Matrix4();
    xs.forEach((x, i) => { m4.makeTranslation(x, H - 0.5, CZ); ribs.setMatrixAt(i, m4); });
    ribs.instanceMatrix.needsUpdate = true;
    g.add(ribs);
    for (const z of [T.z0 + 14, CZ, T.z1 - 14]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(T.x1 - T.x0 - 4, 0.4, 0.5), ribMat);
      beam.position.set((T.x0 + T.x1) / 2, H - 0.8, z);
      g.add(beam);
    }
  }

  /* ---- Bandeaux lumineux colores, un par zone ---- */
  const strips = [
    [338, 1244, 22, 0x38bdf8], [396, 1240, 16, 0x2dd4bf], [452, 1250, 26, 0xfb923c],
    [265, 1238, 22, 0xa78bfa], [305, 1226, 20, 0xf59e0b], [360, 1206, 24, 0xfacc15]
  ];
  for (const [x, z, len, hex] of strips) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.45), new THREE.MeshBasicMaterial({ color: hex }));
    s.position.set(x, H - 1.0, z);
    g.add(s);
  }

  /* ---- Suspensions : disques lumineux sur tige ---- */
  {
    const pts = [];
    for (let x = T.x0 + 10; x < T.x1 - 6; x += 20) for (const z of [1219, 1244]) pts.push([x, z]);
    const disc = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.9, 0.9, 0.14, 16), new THREE.MeshBasicMaterial({ color: 0xffeccc }), pts.length);
    const rod = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 4), new THREE.MeshBasicMaterial({ color: 0x64748b }), pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach(([x, z], i) => {
      m4.makeTranslation(x, H - 2.6, z); disc.setMatrixAt(i, m4);
      m4.makeTranslation(x, H - 1.4, z); rod.setMatrixAt(i, m4);
    });
    disc.instanceMatrix.needsUpdate = rod.instanceMatrix.needsUpdate = true;
    g.add(disc, rod);
  }

  /* ---- Vitrines de boutiques, mur sud (entre les portes cote ville) ---- */
  {
    const awnMats = {};
    const awn = (hex) => awnMats[hex] || (awnMats[hex] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7 }));
    const shops = [
      [307, 327, 'LIBRAIRIE', '#7c3aed', 0x7c3aed, ['#f87171', '#fbbf24', '#60a5fa', '#34d399']],
      [331, 351, 'MODE', '#db2777', 0xdb2777, ['#fda4af', '#f9a8d4', '#fde68a', '#a5b4fc']],
      [369, 389, 'PARFUMS', '#0d9488', 0x0d9488, ['#fde68a', '#99f6e4', '#fbcfe8', '#c4b5fd']],
      [393, 413, 'SOUVENIRS', '#ea580c', 0xea580c, ['#fb923c', '#38bdf8', '#facc15', '#4ade80']],
      [427, 447, 'HIGH-TECH', '#2563eb', 0x2563eb, ['#94a3b8', '#38bdf8', '#e2e8f0', '#818cf8']],
      [451, 471, 'BIJOUX', '#b45309', 0xb45309, ['#fde047', '#e5e7eb', '#fca5a5', '#fcd34d']]
    ];
    for (const [x0, x1, name, accent, hex, items] of shops) {
      const w = x1 - x0, cx = (x0 + x1) / 2;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 160 / 512 * 1.0), new THREE.MeshBasicMaterial({ map: shopTexture(name, accent, items) }));
      p.position.set(cx, 0.9 + w * 0.3125 / 2, 1264.2);
      p.rotation.y = Math.PI;
      g.add(p);
      const aw = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, 1.3), awn(hex));
      aw.position.set(cx, 0.9 + w * 0.3125 + 0.1, 1263.55);
      aw.rotation.x = -0.18;
      g.add(aw);
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, 0.3), awn(0x1b2433));
      base.position.set(cx, 0.45, 1264.1);
      g.add(base);
    }
  }

  /* ---- Fresques aux pignons ---- */
  for (const [x, ry, from, to] of [[T.x0 + 1.06, Math.PI / 2, '#38bdf8', '#e0f2fe'], [T.x1 - 1.06, -Math.PI / 2, '#fb923c', '#fef3c7']]) {
    const mu = new THREE.Mesh(new THREE.PlaneGeometry(44, 5.5), new THREE.MeshBasicMaterial({ map: muralTexture(from, to) }));
    mu.position.set(x, 2.9, 1227);
    mu.rotation.y = ry;
    g.add(mu);
  }

  return g;
}
