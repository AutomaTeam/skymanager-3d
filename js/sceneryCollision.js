/* ============================================================
   sceneryCollision.js — Obstacles en vol (plan graphisme, etape 5)

   En mode Arcade, toucher un arbre, une maison, un hangar, la tour ou
   une eolienne ne detruit jamais l'avion : il rebondit doucement, perd
   un peu de vitesse, et un message explique. Module pur (pas de
   Three.js) : `ac` doit juste exposer pos/vel {x,y,z} et onGround.
   ============================================================ */

/* Hauteur (m) d'un obstacle selon son nom ; 0 = trop bas pour un avion (ignore). */
const HEIGHTS = [
  [/tour de controle/i, 45], [/terminal/i, 14], [/hangar/i, 16], [/bureau/i, 6], [/appareil gare|avion de ligne/i, 12],
  [/arbre/i, 10], [/maison/i, 10], [/conteneur/i, 7], [/chateau/i, 16], [/eolienne/i, 19], [/rocher/i, 3],
  [/pompiers|ambulance|camion/i, 4], [/helicoptere/i, 4]
];

export function obstacleHeight(b) {
  if (b.h !== undefined) return b.h;
  const name = `${b.label || ''} ${b.id || ''}`;
  for (const [re, h] of HEIGHTS) if (re.test(name)) return h;
  return 0;
}

const WING_R = 9;       // demi-envergure approchee (m)
const MIN_H = 3;

/* Repousse `ac` hors d'un obstacle qu'il toucherait. Rend { label } ou null. */
export function bounceOffScenery(ac, blockers, wingR = WING_R) {
  if (ac.onGround) return null;
  const p = ac.pos, v = ac.vel;
  for (const b of blockers) {
    if (b.disabled || b.zone || (b.frame && b.frame !== 'world')) continue;
    const h = obstacleHeight(b);
    if (h < MIN_H || p.y > h + 2) continue;
    const r = b.rect;
    const x0 = r.x0 - wingR, x1 = r.x1 + wingR, z0 = r.z0 - wingR, z1 = r.z1 + wingR;
    if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue;
    /* Face de sortie la plus proche. */
    const d = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z];
    const k = d.indexOf(Math.min(...d));
    let nx = 0, nz = 0;
    if (k === 0) { p.x = x0 - 0.2; nx = -1; } else if (k === 1) { p.x = x1 + 0.2; nx = 1; }
    else if (k === 2) { p.z = z0 - 0.2; nz = -1; } else { p.z = z1 + 0.2; nz = 1; }
    /* Vitesse : on retire la composante qui entre dans l'obstacle, on en renvoie un peu, -15 %. */
    const vn = v.x * nx + v.z * nz;
    if (vn < 0) { v.x -= vn * 1.4 * nx; v.z -= vn * 1.4 * nz; }
    v.x *= 0.85; v.z *= 0.85;
    if (p.y < h + 2) v.y = Math.max(v.y, 4);        // petit coup vers le haut : on repasse au-dessus
    return { label: b.label || 'obstacle' };
  }
  return null;
}
