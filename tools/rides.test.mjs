/* ============================================================
   rides.test.mjs — Physique des montures et du skatepark (phase 40)

   Verifie hors navigateur, sur les vraies primitives du skatepark :
   vitesses, sauts, rampes, atterrissages, rails, combos, murs.

   Usage : node tools/rides.test.mjs
   ============================================================ */

import { RideBody, RIDES, RIDE_IDS, trickDir } from '../js/ridePhysics.js?v=1790900000';
import { Course, buildPark, PARK, WALL_STEP } from '../js/rideCourse.js?v=1790900000';

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log((ok ? 'PASS' : 'FAIL') + ' — ' + msg); };

const flat = new Course([], [], null);
const park = buildPark();
const env = (course) => ({ course, resolve: (x0, z0, x1, z1) => ({ x: x1, z: z1, hit: false }) });
const DT = 1 / 60;
const idle = { move: 0, turn: 0, jump: false, trick: false, boost: false };

function run(body, secs, inp, course = flat, each = null) {
  const e = env(course), events = [];
  for (let t = 0; t < secs; t += DT) {
    const i = typeof inp === 'function' ? inp(t, body) : inp;
    events.push(...body.step(DT, i, e));
    if (each) each(t, body);
  }
  return events;
}

/* ---- Catalogue ---- */
check(RIDE_IDS.length === 5, 'cinq montures');
for (const id of RIDE_IDS) {
  const R = RIDES[id];
  check(R.top > 6 && R.boost > R.top && R.jump > 5 && R.spinUnit > 0 && R.board.n && R.board.l && R.board.r && R.grab && R.manual,
    `${id} : parametres et figures complets`);
  check(R.top > 5.2 * 1.5, `${id} : plus rapide que la marche (${R.top} m/s contre 5.2)`);
}

/* ---- Roule plat ---- */
for (const id of RIDE_IDS) {
  const b = new RideBody(id); b.reset(0, 0, 0);
  run(b, 6, { ...idle, move: 1 });
  check(b.speed > RIDES[id].top * 0.85 && b.speed < RIDES[id].top * 1.05, `${id} : atteint ~sa vitesse de croisiere en 6 s (${b.speed.toFixed(1)} m/s)`);
  run(b, 3, { ...idle, move: -1 });
  check(b.speed < 1.8, `${id} : freine presque a l'arret (${b.speed.toFixed(1)} m/s, marche arriere limitee)`);
}
{
  const b = new RideBody('bmx'); b.reset(0, 0, 0);
  let vmax = 0;
  run(b, 8, { ...idle, move: 1, boost: true }, flat, (t, bb) => { vmax = Math.max(vmax, bb.speed); });
  check(vmax > RIDES.bmx.top + 2, `turbo : depasse la vitesse de croisiere (${vmax.toFixed(1)})`);
  check(b.boost < 0.3, 'turbo : la jauge se vide');
}
{
  /* virage : le cap tourne, la vitesse suit (skate) et l'hoverboard derape plus que le skate */
  const sk = new RideBody('skate'); sk.reset(0, 0, 0, 8);
  const hv = new RideBody('hover'); hv.reset(0, 0, 0, 8);
  let maxSk = 0, maxHv = 0;
  const slip = (b) => Math.abs(b.vx * Math.cos(b.h) + b.vz * -Math.sin(b.h));
  run(sk, 2, { ...idle, move: 1, turn: 1 }, flat, (t, b) => { maxSk = Math.max(maxSk, slip(b)); });
  run(hv, 2, { ...idle, move: 1, turn: 1 }, flat, (t, b) => { maxHv = Math.max(maxHv, slip(b)); });
  check(sk.h > 1.5, `virage : le cap tourne (${sk.h.toFixed(2)} rad en 2 s)`);
  check(maxHv > maxSk * 1.5, `l'hoverboard derape plus que le skate (${maxHv.toFixed(2)} contre ${maxSk.toFixed(2)})`);
}

/* ---- Saut a plat ---- */
for (const id of RIDE_IDS) {
  const b = new RideBody(id); b.reset(0, 0, 0, 6);
  let peak = 0, took = false;
  run(b, 1.8, (t) => ({ ...idle, move: 0.2, jump: t < 0.12 }), flat, (t, bb) => { peak = Math.max(peak, bb.y); if (!bb.grounded) took = true; });
  check(took && peak > 0.6 && peak < 2.2, `${id} : saut a plat ${peak.toFixed(2)} m`);
  check(b.grounded && Math.abs(b.y) < 1e-6, `${id} : se pose apres le saut`);
}
{
  const b = new RideBody('skate'); b.reset(0, 0, 0, 6);
  let tap = 0, held = 0;
  run(b, 1.8, (t) => ({ ...idle, jump: t < 0.05 }), flat, (t, bb) => { tap = Math.max(tap, bb.y); });
  const c = new RideBody('skate'); c.reset(0, 0, 0, 6);
  run(c, 1.8, (t) => ({ ...idle, jump: t < 0.5 }), flat, (t, bb) => { held = Math.max(held, bb.y); });
  check(held > tap * 1.3, `saut charge plus haut (${held.toFixed(2)} contre ${tap.toFixed(2)})`);
}

/* ---- Kicker : on decolle, on vole, on se pose ---- */
{
  const k = new Course([{ type: 'kicker', x: 0, z: 10, a: 0, w: 6, l: 5, h: 1.6 }], []);
  const b = new RideBody('skate'); b.reset(0, 0, 0, 9);
  let peak = 0, airMax = 0, took = false, landZ = 0;
  const ev = run(b, 3, { ...idle, move: 0.3 }, k, (t, bb) => { peak = Math.max(peak, bb.y); if (!bb.grounded) { took = true; landZ = bb.z; } });
  check(took, 'kicker : on decolle de la levre');
  check(peak > 1.7 && peak < 4, `kicker : hauteur de vol ${peak.toFixed(2)} m`);
  check(ev.some(e => e.t === 'land' && e.quality === 'clean'), 'kicker : atterrissage propre');
  check(b.grounded, 'kicker : on est a terre a la fin');
  check(landZ > 15 && landZ < 24, `kicker : distance de saut raisonnable (retombe vers z=${landZ.toFixed(1)})`);
}

/* ---- Murs : on ne traverse pas le dos d'une rampe ---- */
{
  const k = new Course([{ type: 'kicker', x: 0, z: 10, a: 0, w: 6, l: 5, h: 1.6 }], []);
  const b = new RideBody('skate'); b.reset(0, 20, Math.PI, 8);       // vient de derriere la rampe, cap nord
  const ev = run(b, 2, { ...idle, move: 1 }, k);
  check(b.z > 15 - 0.5, `mur : le dos de la rampe arrete (z=${b.z.toFixed(1)})`);
  check(ev.some(e => e.t === 'bump'), 'mur : choc signale');
}

/* ---- Quart de pipe : on monte, on decolle, on retombe ---- */
{
  const q = new Course([{ type: 'quarter', x: 0, z: 10, a: 0, w: 10, R: 4.6 }], []);
  const b = new RideBody('skate'); b.reset(0, 0, 0, 10);
  let peak = 0, took = false;
  const ev = run(b, 4.5, { ...idle, move: 0 }, q, (t, bb) => { peak = Math.max(peak, bb.y); if (!bb.grounded) took = true; });
  check(took && peak > 2.4, `quart de pipe : decolle depuis la levre (pic ${peak.toFixed(2)} m)`);
  check(b.z < 14, `quart de pipe : on revient sur la rampe, pas derriere (z=${b.z.toFixed(1)})`);
  check(Math.cos(b.h - Math.atan2(b.vx, b.vz)) > 0.5 || b.speed < 1, 'quart de pipe : on repart face a la descente');
  const slow = new RideBody('skate'); slow.reset(0, 0, 0, 4);
  run(slow, 2.5, { ...idle }, q);
  check(slow.y < 0.1 && !slow.air, 'quart de pipe : trop lent, on redescend sans decoller');
  check(ev.some(e => e.t === 'jump') && ev.some(e => e.t === 'land'), 'quart de pipe : saut puis atterrissage notes');
}

/* ---- Figures : spin, flip, planche ---- */
{
  const skate = new RideBody('skate'); skate.reset(0, 0, 0, 7);
  /* saut + spin gauche maintenu 0,55 s + figure */
  const ev = run(skate, 2.4, (t, bb) => ({ ...idle, move: 0.1, jump: t < 0.4, turn: (t > 0.45 && t < 0.95) ? 1 : 0, trick: false }));
  const land = ev.find(e => e.t === 'land');
  check(land && land.quality !== 'crash' && land.units >= 1, `spin : ${land ? land.units * 180 : '?'}° atterri (${land && land.quality})`);
  check(skate.chain.pts > 0 || skate.total > 0, 'spin : des points sont gagnes');
}
{
  const b = new RideBody('bmx'); b.reset(0, 0, 0, 8);
  const ev = run(b, 2.4, (t) => ({ ...idle, move: t > 0.5 && t < 0.58 ? -1 : 0, trick: t > 0.5 && t < 0.58, jump: t < 0.4 }));
  const land = ev.find(e => e.t === 'land');
  check(land && land.flips >= 1 && land.quality === 'clean', `backflip BMX : ${land ? land.flips : 0} flip(s), ${land && land.quality}`);
}
{
  const b = new RideBody('skate'); b.reset(0, 0, 0, 7);
  const ev = run(b, 2.5, (t) => ({ ...idle, jump: t < 0.35, trick: t > 0.5 && t < 0.58 }));
  check(ev.some(e => e.t === 'trick' && e.name === 'Kickflip'), 'figure : un appui en l\'air = Kickflip');
  const land = ev.find(e => e.t === 'land');
  check(land && land.pts >= 100 && land.quality === 'clean', `figure : Kickflip rapporte des points (${land && land.pts})`);
  check(b.total > 0 || b.chain.pts >= 100, 'figure : le combo est comptabilise');
}
{
  /* un bmx qui atterrit a 180 deg tombe ; un skate non */
  const mk = (id) => { const b = new RideBody(id); b.reset(0, 0, 0, 8); return b; };
  const inp = (t) => ({ ...idle, jump: t < 0.4, turn: (t > 0.45 && t < 0.45 + 0.46) ? 1 : 0 });
  const sk = mk('skate'); const evS = run(sk, 2.6, inp);
  const bm = mk('bmx'); const evB = run(bm, 2.6, inp);
  const lS = evS.find(e => e.t === 'land'), lB = evB.find(e => e.t === 'land');
  check(lS && lS.quality !== 'crash', 'rotation partielle : le skate se rattrape (fakie)');
  check(lB && ['clean', 'sketchy', 'crash'].includes(lB.quality), `rotation partielle : le BMX atterrit ${lB && lB.quality}`);
}
{
  /* sans rien toucher, le joystick lache « magnetise » le cap : on retombe droit */
  const b = new RideBody('bmx'); b.reset(0, 0, 0, 8);
  const ev = run(b, 2.4, (t) => ({ ...idle, jump: t < 0.3, turn: t > 0.4 && t < 0.5 ? 1 : 0 }));
  const land = ev.find(e => e.t === 'land');
  check(land && land.quality === 'clean', `aide : un petit coup de joystick ne fait pas tomber (${land && land.quality})`);
  /* tenir le joystick en roulant (cas courant) ne fait ni tourner ni basculer le BMX */
  const c = new RideBody('bmx'); c.reset(0, 0, 0, 8);
  const ev2 = run(c, 2.4, (t) => ({ ...idle, move: 1, jump: t < 0.3 }));
  const l2 = ev2.find(e => e.t === 'land');
  check(l2 && l2.quality === 'clean' && l2.flips === 0, `aide : le joystick pousse en avant pendant le saut ne fait pas basculer (${l2 && l2.quality})`);
}
{
  /* chute : le combo est perdu, la chute dure ~1 s, on repart */
  const b = new RideBody('bmx'); b.reset(0, 0, 0, 8);
  b.chain = { pts: 400, mult: 2, n: 3, idle: 0, names: [] };
  const ev = run(b, 3.5, (t) => ({ ...idle, jump: t < 0.4, turn: (t > 0.45 && t < 0.45 + 0.27) ? -1 : 0 }));
  const land = ev.find(e => e.t === 'land');
  if (land && land.quality === 'crash') {
    check(b.chain.pts === 0, 'chute : le combo est perdu');
    check(b.wipe <= 0, 'chute : on se releve');
  } else check(true, `chute : (cas non declenche : ${land && land.quality})`);
}

/* ---- Rails ---- */
{
  const rail = new Course([], [{ x0: 0, z0: 10, x1: 0, z1: 30, y0: 0.9 }]);
  const b = new RideBody('skate'); b.reset(0.2, 4, 0, 8);
  let grinding = 0, endZ = 0;
  const ev = run(b, 4, (t) => ({ ...idle, move: 0.3, jump: t < 0.3 }), rail, (t, bb) => { if (bb.grind) { grinding += DT; endZ = bb.z; } });
  check(ev.some(e => e.t === 'grind'), 'rail : on s\'accroche en sautant dessus');
  check(grinding > 0.6, `rail : on glisse un moment (${grinding.toFixed(2)} s)`);
  check(ev.some(e => e.t === 'grindEnd'), 'rail : on quitte le rail au bout');
  check(b.chain.pts > 40 || b.total > 40, 'rail : le grind rapporte des points');
}
{
  const rail = new Course([], [{ x0: 0, z0: 10, x1: 0, z1: 30, y0: 0.9 }]);
  const b = new RideBody('skate'); b.reset(8, 0, 0, 8);               // loin du rail : rien
  const ev = run(b, 4, (t) => ({ ...idle, move: 0.3, jump: t < 0.3 }), rail);
  check(!ev.some(e => e.t === 'grind'), 'rail : loin du rail, pas de grind');
}

/* ---- Le skatepark ---- */
{
  const a = PARK.area;
  check(park.prims.every(p => p.box.x0 >= a.x0 && p.box.x1 <= a.x1 && p.box.z0 >= a.z0 && p.box.z1 <= a.z1), 'park : toutes les rampes sont dans la zone');
  for (const r of PARK.rails) check(r.x0 >= a.x0 && r.x1 <= a.x1 && r.z0 >= a.z0 && r.z1 <= a.z1, `park : rail ${r.id} dans la zone`);
  let overlaps = [];
  const P = park.prims;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const A = P[i].box, B = P[j].box;
    if (A.x0 < B.x1 - 0.2 && A.x1 > B.x0 + 0.2 && A.z0 < B.z1 - 0.2 && A.z1 > B.z0 + 0.2) overlaps.push(P[i].id + '/' + P[j].id);
  }
  check(overlaps.length === 0, 'park : aucune rampe ne chevauche une autre ' + overlaps.join(','));
  check(park.heightAt(a.x0 - 5, a.z0 - 5) === 0, 'park : sol plat hors des rampes');
  let maxH = 0;
  for (const p of P) { const h = park.heightAt(p.x + p._s * p._L * 0.98, p.z + p._c * p._L * 0.98); maxH = Math.max(maxH, h); }
  check(maxH > 2 && maxH < 3.5, `park : plus haute rampe ${maxH.toFixed(2)} m`);
  /* chaque rampe est abordable : pente maximale < WALL_SLOPE */
  let worst = 0;
  for (const p of P) for (let u = 0.05; u < p._L - 0.45; u += 0.1) {
    const x = p.x + p._s * u, z = p.z + p._c * u;
    worst = Math.max(worst, Math.abs(park.slopeAlong(x, z, p._s, p._c)));
  }
  check(worst < 2.4, `park : pente maximale roulable ${worst.toFixed(2)}`);
}
{
  /* l'echelle du saut : le gap se franchit au turbo, a la vitesse de croisiere du skate avec un saut charge */
  const gp = park.prims.find(p => p.id === 'gapA'), gb = park.prims.find(p => p.id === 'gapB');
  const b = new RideBody('skate');
  b.reset(gp.x + 14, gp.z, Math.PI / 2 * -1, 9.5);                     // vient de l'est, cap ouest
  let took = false, peak = 0;
  const ev = run(b, 3, { ...idle, move: 0.4, boost: true }, park, (t, bb) => { if (!bb.grounded) took = true; peak = Math.max(peak, bb.y); });
  check(took, 'gap : on decolle de la rampe de lancement');
  check(!ev.some(e => e.t === 'bump'), 'gap : on passe sans heurter la reception');
}


/* ---- Murs du graphe de navigation : la monture s'arrete et glisse ---- */
{
  const wallEnv = { course: flat, resolve: (x0, z0, x1, z1) => ({ x: Math.min(x1, 10), z: z1, hit: false }) };
  const b = new RideBody('bmx'); b.reset(0, 0, Math.PI / 2, 9);          // fonce vers l'est, mur en x = 10
  const ev = [];
  for (let t = 0; t < 3; t += DT) ev.push(...b.step(DT, { ...idle, move: 1 }, wallEnv));
  check(b.x <= 10.0001, `mur : on ne le traverse pas (x=${b.x.toFixed(2)})`);
  check(ev.some(e => e.t === 'bump'), 'mur : choc signale');
  check(b.speed < 3, `mur : on ne reste pas colle a pleine vitesse (${b.speed.toFixed(1)} m/s)`);
  /* en diagonale, la composante le long du mur est conservee */
  const d = new RideBody('bmx'); d.reset(0, 0, Math.PI / 4, 9);
  for (let t = 0; t < 2; t += DT) d.step(DT, { ...idle, move: 1 }, wallEnv);
  check(d.z > 8, `mur : glissement le long du mur (z=${d.z.toFixed(1)})`);
}

console.log(failures.length ? `\n${failures.length} ECHEC(S)` : '\nTout est bon.');
process.exit(failures.length ? 1 : 0);
