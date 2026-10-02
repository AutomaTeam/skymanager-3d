/* ============================================================
   rideCourse.js — Relief des rampes et rails (phase 40)

   Module PUR (ni Three.js ni DOM) : il decrit le skatepark et les
   petits spots du plan sous forme de primitives, et repond a une seule
   question : « a quelle hauteur est le sol en (x, z) ? ». La physique
   des montures (ridePhysics.js) et le rendu (ridePark.js) partagent
   exactement les memes primitives, donc ce qu'on voit est ce qu'on roule.

   Repere d'une primitive : depart (x, z) au centre de son bord bas,
   cap `a` (meme convention que le joueur : avancer = (sin a, cos a)),
   u le long du cap, v en travers (positif a gauche).

   Types : kicker (rampe de saut), quarter (quart de pipe courbe),
   box (fun box a deux pentes), pyramid (pente sur 4 cotes), spine
   (deux pentes dos a dos). Les rails ont des extremites a hauteurs
   differentes (down-rail).
   ============================================================ */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* Une pente raide est un mur : au-dela, la monture ne monte pas. */
export const WALL_STEP = 0.22;     // marche franchissable sans elan (m)
export const WALL_SLOPE = 2.4;     // pente maximale rideable (dh / dx)

function prep(p) {
  p._s = Math.sin(p.a); p._c = Math.cos(p.a);
  /* longueur utile le long du cap */
  if (p.type === 'kicker' || p.type === 'pyramid' || p.type === 'spine') p._L = p.l;
  else if (p.type === 'quarter') {
    p._th = (p.maxDeg || 62) * Math.PI / 180;
    p._L = p.R * Math.sin(p._th);
    p._H = p.R * (1 - Math.cos(p._th));
  } else if (p.type === 'box') p._L = 2 * p.e + p.t;
  /* boite englobante monde (rectangle tourne) */
  const hw = p.w / 2, L = p._L;
  const xs = [], zs = [];
  for (const [u, v] of [[0, -hw], [0, hw], [L, -hw], [L, hw]]) {
    xs.push(p.x + u * p._s + v * p._c); zs.push(p.z + u * p._c - v * p._s);
  }
  p.box = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  return p;
}

/* Hauteur du profil en (u, v) locaux ; 0 hors de l'emprise. */
export function profile(p, u, v) {
  if (u < 0 || u > p._L || Math.abs(v) > p.w / 2) return 0;
  switch (p.type) {
    case 'kicker': return p.h * Math.pow(u / p.l, p.curve || 1.25);
    case 'quarter': {
      const th = Math.asin(clamp(u / p.R, -1, 1));
      return p.R * (1 - Math.cos(th));
    }
    case 'box': {
      if (u < p.e) return p.h * (u / p.e);
      if (u < p.e + p.t) return p.h;
      return p.h * ((p._L - u) / p.e);
    }
    case 'pyramid': {
      const d = Math.min(u, p.l - u, p.w / 2 - Math.abs(v));
      return p.h * Math.min(1, d / (p.rl || 3));
    }
    case 'spine': return p.h * (1 - Math.abs(2 * u / p.l - 1));
    default: return 0;
  }
}

export class Course {
  /* prims : liste de primitives ; rails : [{ x0, z0, x1, z1, y0, y1 }] */
  constructor(prims = [], rails = [], area = null) {
    this.prims = prims.map(p => prep({ ...p }));
    this.rails = rails.map(r => {
      const dx = r.x1 - r.x0, dz = r.z1 - r.z0, len = Math.hypot(dx, dz);
      return { ...r, y1: r.y1 ?? r.y0, len, dx: dx / len, dz: dz / len };
    });
    this.area = area;
  }

  /* Hauteur du sol (maximum des primitives). */
  heightAt(x, z) {
    let y = 0;
    for (const p of this.prims) {
      const b = p.box;
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      const dx = x - p.x, dz = z - p.z;
      const u = dx * p._s + dz * p._c, v = dx * p._c - dz * p._s;
      const h = profile(p, u, v);
      if (h > y) y = h;
    }
    return y;
  }

  /* Primitive la plus haute en (x, z) : { prim, h } ou null. */
  primAt(x, z) {
    let best = null;
    for (const p of this.prims) {
      const b = p.box;
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      const dx = x - p.x, dz = z - p.z;
      const h = profile(p, dx * p._s + dz * p._c, dx * p._c - dz * p._s);
      if (h > 0 && (!best || h > best.h)) best = { prim: p, h };
    }
    return best;
  }

  /* Inclinaison du sol le long d'une direction (dx, dz) unitaire : dh/ds. */
  slopeAlong(x, z, dx, dz, eps = 0.35) {
    return (this.heightAt(x + dx * eps, z + dz * eps) - this.heightAt(x - dx * eps, z - dz * eps)) / (2 * eps);
  }

  /* Rail le plus proche d'un point : { rail, t, dist, y } ou null.
     `dist` = ecart lateral, `t` = abscisse reduite (0..1). */
  nearestRail(x, z, maxDist = 1, margin = 0.02) {
    let best = null;
    for (const r of this.rails) {
      const px = x - r.x0, pz = z - r.z0;
      const s = px * r.dx + pz * r.dz;
      const t = s / r.len;
      if (t < -margin || t > 1 + margin) continue;
      const dist = Math.abs(px * r.dz - pz * r.dx);
      if (dist > maxDist) continue;
      if (!best || dist < best.dist) best = { rail: r, t: clamp(t, 0, 1), dist, y: r.y0 + (r.y1 - r.y0) * clamp(t, 0, 1) };
    }
    return best;
  }

  /* Le point est-il dans l'emprise d'une primitive (ou d'un rail) ? Sert a l'aide a la carte et a la navigation. */
  inPark(x, z) {
    const a = this.area;
    return !!a && x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1;
  }
}

/* ------------------------------------------------------------
   Plans du skatepark et des spots.
   Les coordonnees sont absolues (voir layout.js : le skatepark est pose
   sur l'aire de stationnement, a l'ouest de la tour, entre la ligne de
   roulage des avions et la ligne de cones).
   ------------------------------------------------------------ */
const E = Math.PI / 2;      // cap vers l'est (+x)
const W = -Math.PI / 2;     // cap vers l'ouest (-x)
const S = 0;                // cap vers le sud (+z)
const N = Math.PI;          // cap vers le nord (-z)

export const PARK = {
  area: { x0: 166, x1: 296, z0: 956, z1: 1082 },
  name: 'Skatepark',
  prims: [
    /* --- rangee nord : half-pipe, spine, pyramide --- */
    { id: 'hpL',  type: 'quarter', x: 204, z: 976, a: W, w: 13, R: 4.6, color: 0x38bdf8 },
    { id: 'hpR',  type: 'quarter', x: 218, z: 976, a: E, w: 13, R: 4.6, color: 0x38bdf8 },
    { id: 'spine', type: 'spine',  x: 244, z: 968, a: S, w: 9, l: 13, h: 1.9, color: 0xf472b6 },
    { id: 'pyr',  type: 'pyramid', x: 270, z: 972, a: S, w: 13, l: 13, h: 1.05, rl: 3.8, color: 0xfacc15 },
    /* --- rangee centrale : fun box avec ses rails, kicker + saut de gap --- */
    { id: 'box',  type: 'box',     x: 176, z: 1003, a: E, w: 7, e: 3.8, t: 9, h: 0.95, color: 0xa78bfa },
    { id: 'gapA', type: 'kicker',  x: 276, z: 1018, a: W, w: 7, l: 5.2, h: 1.7, color: 0xfb923c },
    { id: 'gapB', type: 'kicker',  x: 256, z: 1018, a: E, w: 8, l: 9, h: 1.15, color: 0xfb923c },
    /* --- rangee sud : grosse rampe de « big air » et sa pente de reception --- */
    { id: 'bigA', type: 'kicker',  x: 268, z: 1050, a: W, w: 8, l: 8.5, h: 2.5, curve: 1.5, color: 0x4ade80 },
    { id: 'bigB', type: 'kicker',  x: 210, z: 1050, a: E, w: 10, l: 14, h: 1.6, curve: 1, color: 0x4ade80 },
    { id: 'qSouth', type: 'quarter', x: 186, z: 1068, a: N, w: 11, R: 3.4, color: 0x38bdf8 }
  ],
  rails: [
    /* au-dessus de la fun box (cotes) */
    { id: 'rb1', x0: 180, z0: 1000.2, x1: 196, z1: 1000.2, y0: 1.05 },
    { id: 'rb2', x0: 180, z0: 1005.8, x1: 196, z1: 1005.8, y0: 1.05 },
    /* rail plat et down-rail, a aborder de chaque cote */
    { id: 'flat', x0: 206, z0: 1002, x1: 228, z1: 1002, y0: 0.9 },
    { id: 'down', x0: 232, z0: 1034, x1: 214, z1: 1034, y0: 1.5, y1: 0.55 },
    { id: 'rise', x0: 176, z0: 1030, x1: 196, z1: 1030, y0: 0.5, y1: 1.2 }
  ]
};

export function buildPark() {
  return new Course(PARK.prims, PARK.rails, PARK.area);
}

/* Rectangles au sol occupes par la structure (affichage carte, tests de chevauchement). */
export function footprints(course) {
  return course.prims.map(p => ({ id: p.id, ...p.box }));
}
