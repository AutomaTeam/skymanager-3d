/* ============================================================
   ridePark.js — Rendu du skatepark (phase 40)

   Construit en meshes les memes primitives que rideCourse.js :
   chaque rampe est une surface echantillonnee avec `profile()`, donc
   exactement ce que la physique roule. Rampes peintes de couleurs vives,
   flancs en beton, rails jaunes sur poteaux, marquage au sol, panneau.
   ============================================================ */

import * as THREE from 'three';
import { mergeStaticByMaterial } from './staticMerge.js?v=1791469860';
import { profile } from './rideCourse.js?v=1791469860';

const CONCRETE = new THREE.MeshStandardMaterial({ color: 0xb6bcc6, roughness: 0.9 });
const COPING = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.3, metalness: 0.8 });
const RAIL_M = new THREE.MeshStandardMaterial({ color: 0xfde047, roughness: 0.3, metalness: 0.6 });
const POST_M = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5, metalness: 0.6 });

/* Breakpoints le long de u pour que les aretes (box, pyramide, spine) soient nettes. */
function uSamples(p) {
  const L = p._L;
  const base = [];
  if (p.type === 'box') base.push(0, p.e, p.e + p.t, L);
  else if (p.type === 'pyramid') base.push(0, p.rl || 3, L - (p.rl || 3), L);
  else if (p.type === 'spine') base.push(0, L / 2, L);
  else base.push(0, L);
  const out = new Set(base);
  const step = p.type === 'quarter' ? L / 22 : p.type === 'kicker' ? L / 10 : 0;
  if (step) for (let u = step; u < L - 1e-6; u += step) out.add(+u.toFixed(4));
  return [...out].sort((a, b) => a - b);
}
function vSamples(p) {
  const hw = p.w / 2;
  if (p.type === 'pyramid') { const rl = Math.min(p.rl || 3, hw); return [-hw, -hw + rl, hw - rl, hw]; }
  return [-hw, hw];
}

function rampGeometry(p) {
  const us = uSamples(p), vs = vSamples(p);
  const pos = [], idx = [];
  const toWorld = (u, v, y) => [p.x + u * p._s + v * p._c, y, p.z + u * p._c - v * p._s];
  /* surface (la hauteur est lue au centre des bords pour que les aretes soient franches) */
  const h = (u, v) => profile(p, Math.min(Math.max(u, 0), p._L - 1e-6) , Math.max(-p.w / 2 + 1e-6, Math.min(p.w / 2 - 1e-6, v)));
  for (const u of us) for (const v of vs) pos.push(...toWorld(u, v, p.type === 'quarter' && u >= p._L - 1e-6 ? p._H : h(u, v)));
  const nv = vs.length;
  for (let i = 0; i < us.length - 1; i++) for (let j = 0; j < nv - 1; j++) {
    const a = i * nv + j, b = a + 1, c = a + nv, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const flat = p.type !== 'quarter';
  const out = flat ? g.toNonIndexed() : g;
  out.computeVertexNormals();
  return out;
}

/* Flancs et dos : parois verticales jusqu'au sol. */
function skirtGeometry(p) {
  const us = uSamples(p), hw = p.w / 2;
  const pos = [], idx = [];
  const W = (u, v, y) => [p.x + u * p._s + v * p._c, y, p.z + u * p._c - v * p._s];
  const hh = (u, v) => profile(p, Math.min(Math.max(u, 1e-6), p._L - 1e-6), v);
  const quad = (a, b, c, d) => { const o = pos.length / 3; pos.push(...a, ...b, ...c, ...d); idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); };
  for (const side of [-1, 1]) {
    const v = side * (hw - 1e-6);
    for (let i = 0; i < us.length - 1; i++) {
      const u0 = us[i], u1 = us[i + 1];
      const y0 = hh(u0, v), y1 = hh(u1, v);
      if (side > 0) quad(W(u0, side * hw, 0), W(u1, side * hw, 0), W(u0, side * hw, y0), W(u1, side * hw, y1));
      else quad(W(u1, side * hw, 0), W(u0, side * hw, 0), W(u1, side * hw, y1), W(u0, side * hw, y0));
    }
  }
  const yEnd = hh(p._L, 0);
  if (yEnd > 0.01) quad(W(p._L, hw, 0), W(p._L, -hw, 0), W(p._L, hw, yEnd), W(p._L, -hw, yEnd));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}

function labelSprite(text, w = 12, h = 3.2) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 140;
  const x = cv.getContext('2d');
  x.fillStyle = '#0f172a'; x.fillRect(0, 0, 512, 140);
  x.strokeStyle = '#facc15'; x.lineWidth = 8; x.strokeRect(6, 6, 500, 128);
  x.fillStyle = '#facc15'; x.font = '900 70px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 256, 74);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
  return m;
}

export function buildParkMeshes(course, title = 'SKATEPARK') {
  const g = new THREE.Group();
  g.name = 'skatepark';
  const A = course.area;

  /* dalle de beton lisse peinte, avec liseres */
  if (A) {
    const w = A.x1 - A.x0, d = A.z1 - A.z0, cx = (A.x0 + A.x1) / 2, cz = (A.z0 + A.z1) / 2;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0x6b7686, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.02, cz); floor.receiveShadow = true; g.add(floor);
    const lineM = new THREE.MeshBasicMaterial({ color: 0xfacc15, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    for (const [lw, ld, lx, lz] of [[w, 0.5, cx, A.z0], [w, 0.5, cx, A.z1], [0.5, d, A.x0, cz], [0.5, d, A.x1, cz]]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), lineM);
      l.rotation.x = -Math.PI / 2; l.position.set(lx, 0.03, lz); g.add(l);
    }
    /* panneau a l'entree cote est (vers la porte) */
    const sign = labelSprite(title); sign.position.set(A.x1 + 2, 6.5, cz); sign.rotation.y = Math.PI / 2; g.add(sign);
    const sign2 = labelSprite(title); sign2.position.set(cx, 6.5, A.z0 - 1.5); g.add(sign2);
    for (const [px, pz] of [[A.x1 + 2, cz - 5.5], [A.x1 + 2, cz + 5.5], [cx - 5.5, A.z0 - 1.5], [cx + 5.5, A.z0 - 1.5]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.5, 8), POST_M); post.position.set(px, 3.25, pz); post.castShadow = true; g.add(post);
    }
  }

  for (const p of course.prims) {
    const top = new THREE.Mesh(rampGeometry(p), new THREE.MeshStandardMaterial({ color: p.color || 0x38bdf8, roughness: 0.65, metalness: 0.05, side: THREE.DoubleSide, flatShading: p.type !== 'quarter' }));
    top.castShadow = true; top.receiveShadow = true; g.add(top);
    const sk = new THREE.Mesh(skirtGeometry(p), new THREE.MeshStandardMaterial({ color: 0x9aa3af, roughness: 0.9, side: THREE.DoubleSide }));
    sk.receiveShadow = true; sk.castShadow = true; g.add(sk);
    /* levre en metal : quart de pipe et kickers */
    if (p.type === 'quarter' || p.type === 'kicker') {
      const lipH = p.type === 'quarter' ? p._H : p.h;
      const hw = p.w / 2;
      const a = [p.x + p._L * p._s + (-hw) * p._c, lipH, p.z + p._L * p._c - (-hw) * p._s];
      const b = [p.x + p._L * p._s + (hw) * p._c, lipH, p.z + p._L * p._c - (hw) * p._s];
      const A3 = new THREE.Vector3(...a), B3 = new THREE.Vector3(...b), len = A3.distanceTo(B3);
      const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 8), COPING);
      lip.position.copy(A3).add(B3).multiplyScalar(0.5);
      lip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B3.clone().sub(A3).normalize());
      lip.castShadow = true; g.add(lip);
    }
  }

  /* rails : tube jaune + poteaux tous les ~3 m */
  for (const r of course.rails) {
    const A3 = new THREE.Vector3(r.x0, r.y0, r.z0), B3 = new THREE.Vector3(r.x1, r.y1, r.z1);
    const len = A3.distanceTo(B3);
    const tubeM = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, len, 8), RAIL_M);
    tubeM.position.copy(A3).add(B3).multiplyScalar(0.5);
    tubeM.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B3.clone().sub(A3).normalize());
    tubeM.castShadow = true; g.add(tubeM);
    const n = Math.max(2, Math.round(len / 3.2) + 1);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), y = r.y0 + (r.y1 - r.y0) * t;
      /* pas de poteau la ou le rail est pose sur une fun box (on ne le verrait pas) */
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, y, 6), POST_M);
      const px = r.x0 + (r.x1 - r.x0) * t, pz = r.z0 + (r.z1 - r.z0) * t;
      if (course.heightAt(px, pz) >= y - 0.05) continue;
      post.position.set(px, y / 2, pz); post.castShadow = true; g.add(post);
    }
  }
  /* D02 : le skatepark est statique -> fusion par materiau. */
  mergeStaticByMaterial(g);
  return g;
}
