/* ============================================================
   bodies.js — Collision du joueur avec les corps mobiles
   (plan graphisme, etape 5 : physique du personnage)

   Le graphe de navigation (navigation.js) gere les murs et les
   obstacles fixes. Il ne connait ni les personnes (passagers,
   employes, PNJ) ni les vehicules d'ambiance, qui bougent. Ce module
   ajoute ces corps mobiles :
     - cercle  { x, z, r }                      : une personne ;
     - boite   { x, z, h, hl, hw }              : un vehicule (cap h,
       demi-longueur hl le long du cap, demi-largeur hw).
   `slideMove()` deplace un point par petits pas, glisse le long des
   obstacles et ne traverse jamais rien, meme a grande vitesse.
   Module pur : aucune dependance a Three.js ni au DOM.
   ============================================================ */

export const PERSON_R = 0.35;     // rayon d'une personne
export const STEP_MAX = 0.25;     // longueur maximale d'un sous-pas (m)

/* Repousse le point (x, z) hors d'un corps s'il est dedans ; rend null sinon. */
export function pushOut(b, x, z, pr = PERSON_R) {
  if (b.r !== undefined) {
    const dx = x - b.x, dz = z - b.z, min = b.r + pr, d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return null;
    const d = Math.sqrt(d2);
    if (d < 1e-6) return { x: b.x + min, z: b.z };
    return { x: b.x + dx / d * (min + 1e-3), z: b.z + dz / d * (min + 1e-3) };
  }
  /* Boite orientee : repere local (u le long du cap, w en travers). */
  const fx = Math.sin(b.h), fz = -Math.cos(b.h);           // cap : x += sin h, z -= cos h (voir Mover)
  const rx = -fz, rz = fx;
  const dx = x - b.x, dz = z - b.z;
  const u = dx * fx + dz * fz, w = dx * rx + dz * rz;
  const hu = b.hl + pr, hw = b.hw + pr;
  if (Math.abs(u) >= hu || Math.abs(w) >= hw) return null;
  /* Sortie par la face la plus proche. */
  const pu = hu - Math.abs(u), pw = hw - Math.abs(w);
  let nu = u, nw = w;
  if (pu < pw) nu = Math.sign(u || 1) * (hu + 1e-3); else nw = Math.sign(w || 1) * (hw + 1e-3);
  return { x: b.x + fx * nu + rx * nw, z: b.z + fz * nu + rz * nw };
}

/* Deplace `from` vers `to` : navigation d'abord (murs, obstacles fixes), puis corps mobiles.
   `clear(x, z)` facultatif : test supplementaire (ex. coque de l'avion). Rend { x, z, hit }. */
export function slideMove(nav, from, to, bodies = [], clear = null, self = null) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / STEP_MAX));
  let x = from.x, z = from.z, hit = false;
  for (let s = 1; s <= n; s++) {
    /* Chaque pas part de la position COURANTE (et non de la ligne de depart) : apres un
       blocage, la cible ne doit pas filer derriere l'obstacle. */
    const rx = to.x - x, rz = to.z - z, rd = Math.hypot(rx, rz);
    if (rd < 1e-6) break;
    const k = Math.min(1, STEP_MAX / rd);
    const tx = x + rx * k, tz = z + rz * k;
    let c = nav.resolve({ x, z }, { x: tx, z: tz });
    if (clear && !clear(c.x, c.z)) c = { x, z };
    for (let pass = 0; pass < 2; pass++) {
      for (const b of bodies) {
        if (self && b.ref === self) continue;      // on ne se pousse pas soi-meme
        const p = pushOut(b, c.x, c.z);
        if (!p) continue;
        hit = true;
        /* Le point repousse doit rester praticable ; sinon on ne bouge pas. */
        if (nav.isWalkable(p.x, p.z) && (!clear || clear(p.x, p.z))) c = p; else c = { x, z };
      }
    }
    x = c.x; z = c.z;
  }
  return { x, z, hit };
}

/* Si des corps mobiles ont marche sur (x, z) (un passager qui avance, un PNJ), rend le point
   repousse sur du sol praticable ; sinon null. Sert a l'avatar immobile : sans cela un PNJ
   pourrait le traverser. */
export function depenetrate(nav, x, z, bodies, clear = null, self = null) {
  let c = null;
  for (const b of bodies) {
    if (self && b.ref === self) continue;
    const p = pushOut(b, c ? c.x : x, c ? c.z : z);
    if (!p) continue;
    if (nav.isWalkable(p.x, p.z) && (!clear || clear(p.x, p.z))) c = p;
  }
  return c;
}

/* Rassemble les corps mobiles du jeu : personnes visibles (PNJ, employes, passagers du hall,
   voyageurs du parking, visiteur et chien des rencontres) + vehicules d'ambiance.
   `opts.player` : ajoute l'avatar du joueur (pour les PNJ qui doivent le contourner). */
export function collectBodies(game, opts = {}) {
  const out = [];
  const ag = game.agents && game.agents.agents;
  if (ag) for (const a of ag) {
    if (a.hidden || a === game.controlled || !a.mesh || !a.mesh.group.visible) continue;
    if (a.gate === 'cabin') continue;       // la cabine a son propre repere
    out.push({ x: a.wx, z: a.wz, r: PERSON_R, ref: a });
  }
  const staff = game.staff && game.staff.actors;
  if (staff) for (const a of staff.values()) {
    if (!a.ent || !a.ent.group.visible) continue;
    const p = a.ent.group.position;
    out.push({ x: p.x, z: p.z, r: PERSON_R, ref: a });
  }
  /* Passagers du hall (files et trajets) : seulement quand le hall est affiche. */
  const tg = game.r3d && game.r3d.terminalGroup;
  if (game.terminal && tg && tg.visible) {
    for (const c of game.terminal.crowd()) out.push({ x: c.x, z: c.z, r: PERSON_R, ref: c.id });
  }
  const life = game.r3d && game.r3d.life;
  if (life) {
    for (const it of life.movers) {
      if (it.g && it.g.visible === false) continue;
      const m = it.mv;
      out.push({ x: m.x, z: m.z, h: m.h, hl: m.len / 2, hw: it.kind === 'car' ? 0.95 : 1.4, ref: it });
    }
    if (life.walkers) for (const w of life.walkers) {
      if (w.state === 'WALK' && w.ent.group.visible) out.push({ x: w.x, z: w.z, r: PERSON_R, ref: w });
    }
  }
  /* Rencontres au sol : le visiteur et le chien sont de vrais corps (le chien est plus petit). */
  const ev = game.ground && game.ground.ev;
  if (ev && Number.isFinite(ev.x) && Number.isFinite(ev.z)) out.push({ x: ev.x, z: ev.z, r: ev.kind === 'dog' ? 0.3 : PERSON_R, ref: ev });
  if (opts.player && game.state === 'HUB' && !game.controlled) {
    out.push({ x: game.player.pos.x, z: game.player.pos.z, r: PERSON_R, ref: game.player });
  }
  return out;
}
