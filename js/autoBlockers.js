/* ============================================================
   autoBlockers.js — Rend solides les objets du decor qui ne l'etaient pas

   Les obstacles de la navigation sont listes a la main (navigation.js,
   decor.js). Tout ce qui est ajoute ailleurs (batiments annexes, abris,
   panneaux, pylones...) restait traversable. Ce module parcourt l'aeroport
   une fois, apres sa construction, et ajoute un obstacle pour chaque objet
   statique qui a une vraie masse (plus d'1,5 m de haut, pose au sol,
   emprise entre 0,8 et 120 m) et dont l'emprise est encore praticable.

   Jamais obstacle : vehicules et personnages qui bougent, passerelle,
   portails, points d'interaction, pose de l'avion, decor deja gere
   (`decor`, interieur du terminal, ciel, engins du skatepark).
   ============================================================ */

import * as THREE from 'three';

const SKIP_GROUPS = new Set(['decor', 'terminalShell', 'skylife', 'rides', 'wearGroup']);
const _b = new THREE.Box3();
const _bb = new THREE.Box3();

/* Boite monde d'un objet, sans les maillages instancies. */
function worldBox(obj, out) {
  out.makeEmpty();
  obj.updateWorldMatrix(true, true);
  obj.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    _bb.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
    out.union(_bb);
  });
  return out;
}

export function addAutoBlockers(game) {
  const r3d = game.r3d, nav = game.nav, root = r3d.airport;
  if (!root || !nav) return 0;
  /* Objets qui bougent ou qui se conduisent : exclus (eux et leurs descendants). */
  const moving = new Set();
  const life = r3d.life;
  if (life) {
    for (const mv of life.movers || []) if (mv.g) moving.add(mv.g);
    for (const t of life.parkedFire || []) moving.add(t);
    for (const w of life.walkers || []) if (w.ent && w.ent.group) moving.add(w.ent.group);
  }
  const isMoving = (o) => { for (let p = o; p && p !== root; p = p.parent) if (moving.has(p)) return true; return false; };

  /* Points a garder degages : points d'interaction, portes, pose de l'avion. */
  const keep = [];
  for (const h of game.hotspots || []) if (h.frame === 'world' && h.pos) keep.push({ x: h.pos[0], z: h.pos[2] });
  if (r3d.gatePosition) keep.push({ x: r3d.gatePosition.x, z: r3d.gatePosition.z });
  const portalRects = (nav.portals || []).filter(p => !p.frame || p.frame === 'world').map(p => p.rect);

  const cand = [];
  const visit = (o) => {
    for (const c of o.children) {
      if (!c.visible || isMoving(c)) continue;
      if (SKIP_GROUPS.has(c.name)) continue;
      if (c.name === 'airportDecor' || c.name === 'skylife') { visit(c); continue; }
      if (c.isInstancedMesh || c.isLight || c.isSprite || c.isPoints) continue;
      cand.push(c);
    }
  };
  visit(root);

  let added = 0, id = 0;
  for (const c of cand) {
    worldBox(c, _b);
    if (_b.isEmpty()) continue;
    const w = _b.max.x - _b.min.x, d = _b.max.z - _b.min.z, h = _b.max.y - _b.min.y;
    if (h < 1.5 || _b.min.y > 1.2) continue;                 // trop bas, ou en l'air (auvent, passerelle)
    if (w > 120 || d > 120 || (w < 0.8 && d < 0.8)) continue;
    if (Math.abs(_b.min.x) > 3000 || Math.abs(_b.min.z) > 3000) continue;
    const rect = { x0: _b.min.x, x1: _b.max.x, z0: _b.min.z, z1: _b.max.z };
    /* Deja bloque (4 points sur 5) : on n'ajoute rien. */
    const pts = [[(rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2], [rect.x0 + w * 0.25, rect.z0 + d * 0.25], [rect.x1 - w * 0.25, rect.z1 - d * 0.25],
      [rect.x0 + w * 0.25, rect.z1 - d * 0.25], [rect.x1 - w * 0.25, rect.z0 + d * 0.25]];
    if (pts.filter(p => nav.isWalkable(p[0], p[1])).length < 4) continue;
    /* Doit rester praticable : portails et points d'interaction. */
    const pad = 1.2;
    if (portalRects.some(r => r && rect.x1 + pad > r.x0 && rect.x0 - pad < r.x1 && rect.z1 + pad > r.z0 && rect.z0 - pad < r.z1)) continue;
    if (keep.some(k => k.x > rect.x0 - 2 && k.x < rect.x1 + 2 && k.z > rect.z0 - 2 && k.z < rect.z1 + 2)) continue;
    /* L'emprise de l'avion joueur n'est pas un decor. */
    nav.blockers.push({ id: `auto${id++}`, label: c.name || 'objet', rect, auto: true });
    added++;
  }
  nav._grid = null;           // la grille spatiale est reconstruite au prochain test
  return added;
}

/* Interieur du terminal (construit apres le demarrage) : meubles et piliers de 1,2 a 8 m restes traversables.
   Les petites pieces (potelets, valises, passagers) ne comptent pas : elles bougent ou se contournent. */
export function addInteriorBlockers(game) {
  const nav = game.nav;
  const ti = game.r3d.scene.children.find(c => c.name === 'terminalInterior');
  if (!ti || !nav) return 0;
  let added = 0, id = 0;
  for (const c of ti.children) {
    if (!c.visible) continue;
    worldBox(c, _b);
    if (_b.isEmpty()) continue;
    const w = _b.max.x - _b.min.x, d = _b.max.z - _b.min.z, h = _b.max.y - _b.min.y;
    const big = Math.max(w, d);
    if (h < 1.2 || _b.min.y > 1.0 || big < 1.2 || big > 8 || Math.min(w, d) < 0.8) continue;
    const rect = { x0: _b.min.x, x1: _b.max.x, z0: _b.min.z, z1: _b.max.z };
    const pts = [[(rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2], [rect.x0 + w * 0.25, rect.z0 + d * 0.25], [rect.x1 - w * 0.25, rect.z1 - d * 0.25],
      [rect.x0 + w * 0.25, rect.z1 - d * 0.25], [rect.x1 - w * 0.25, rect.z0 + d * 0.25]];
    if (pts.filter(p => nav.isWalkable(p[0], p[1])).length < 4) continue;
    nav.blockers.push({ id: `autoHall${id++}`, label: c.name || 'meuble', zone: 'termHall', rect, auto: true });
    added++;
  }
  return added;
}
