/* ============================================================
   flightAssist.sim.mjs — Tests de l'aide au pilotage (mode Arcade)

   Fait voler la vraie physique (js/flightPhysics.js) avec l'aide
   (js/flightAssist.js), sans navigateur ni DOM : decollage, montee,
   manche brutal, vent de travers, approche guidee et poser.

   Usage (a la racine du projet) :
     npm install three@0.169.0      (une seule fois, uniquement pour ce test)
     npm run test:flight

   Le script sort avec un code non nul si une regle est violee.
   ============================================================ */

import * as THREE from 'three';
import { Aircraft, KTS, FT } from '../js/flightPhysics.js';
import { FlightAssist } from '../js/flightAssist.js';

const dt = 1 / 60;
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log((ok ? 'PASS' : 'FAIL') + ' — ' + msg); };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* Simule `secs` secondes. `script(t, ac)` donne le manche du joueur. */
function sim(setup, secs, script, wind, hook) {
  const ac = new Aircraft();
  const as = new FlightAssist();
  setup(ac, as);
  ac.wind.set(wind[0], 0, wind[1]);
  ac.turbulence = wind[2];
  let t = 0, maxBank = 0, minIas = 999;
  for (let i = 0; i < secs * 60; i++) {
    t += dt;
    const o = as.update(ac, script(t, ac), dt);
    Object.assign(ac.ctl, { pitch: o.pitch, roll: o.roll, yaw: o.yaw, throttle: o.throttle, brake: o.brake });
    ac.update(dt, t);
    if (!ac.onGround) { maxBank = Math.max(maxBank, Math.abs(ac.bankDeg)); minIas = Math.min(minIas, ac.ias * KTS); }
    if (hook) hook(ac, as, t);
    if (ac.crashed) break;
  }
  return { ac, as, t, maxBank, minIas };
}

const idle = () => ({ pitch: 0, roll: 0, yaw: 0 });
const takeoff = (ac, as) => {
  ac.reset({ pos: new THREE.Vector3(0, 3.14, 1380), heading: 0, flaps: 2, gear: true, fuel: 9000 });
  as.launch();
};
const final = (x, hdg = 180, alt = 215, z = -5500) => (ac, as) => {
  ac.reset({ pos: new THREE.Vector3(x, alt, z), heading: hdg, speed: 77, flaps: 0, gear: false, fuel: 9000 });
  as.launched = true;
};

const WINDS = [[0, 0, 0.35], [6, 3, 0.6], [-8, 4, 0.8]];

for (const w of WINDS) {
  const tag = ` (vent ${w[0]},${w[1]} turb ${w[2]})`;

  let r = sim(takeoff, 90, idle, w);
  check(!r.ac.crashed && !r.ac.onGround && r.ac.pos.y * FT > 600, 'decollage et montee sans toucher au manche' + tag);
  check(r.minIas > 150, `vitesse jamais critique (mini ${r.minIas.toFixed(0)} kt)` + tag);

  r = sim(takeoff, 120, (t) => ({ pitch: t > 40 && t < 60 ? 1 : 0, roll: 0, yaw: 0 }), w);
  check(!r.ac.crashed, 'manche a cabrer a fond pendant 20 s : pas de crash' + tag);

  r = sim(takeoff, 120, (t) => ({ pitch: 0, roll: t > 40 && t < 70 ? 1 : 0, yaw: 0 }), w);
  check(!r.ac.crashed, 'virage a fond juste apres le decollage : pas de crash' + tag);

  r = sim(takeoff, 120, (t) => ({ pitch: t > 45 && t < 70 ? -1 : 0, roll: 0, yaw: 0 }), w);
  check(!r.ac.crashed, 'manche a piquer a fond : altitude de securite respectee' + tag);

  for (const [x, hdg, alt, z] of [[0, 180, 215, -5500], [300, 170, 215, -5500], [-400, 195, 300, -6500]]) {
    r = sim(final(x, hdg, alt, z), 190, idle, w);
    const td = r.ac.touchdown;
    check(!!td && !r.ac.crashed, `atterrissage guide depuis x=${x} cap ${hdg}` + tag);
    if (td) {
      check(Math.abs(td.offset) < 22, `pose sur la piste (ecart ${td.offset.toFixed(0)} m, demi-largeur 22 m)` + tag);
      check(td.fpm < 350, `pose douce (${td.fpm.toFixed(0)} fpm)` + tag);
      const gs = Math.hypot(r.ac.vel.x, r.ac.vel.z) * KTS;   // vitesse sol : la vitesse air n'est jamais nulle par vent
      check(gs < 2, 'l\'avion s\'arrete tout seul (vitesse sol ' + gs.toFixed(1) + ' kt)' + tag);
    }
  }
}

/* Anneaux : avec l'aimant, un joueur qui ne touche a rien en collecte au moins 4 sur 5. */
{
  const AHEAD = 620, R = 58;
  let ok = true;
  for (const w of WINDS) {
    let rings = 0, ring = null, miss = 0;
    sim(takeoff, 130, idle, w, (ac, as) => {
      if (ac.onGround || ac.pos.y < 12 || rings >= 5) return;
      const spawn = () => {
        const f = ac.forward(); const h = Math.hypot(f.x, f.z) || 1; const dx = f.x / h, dz = f.z / h;
        const side = (rings % 2 ? 1 : -1) * (25 + rings * 15);
        const hv = Math.hypot(ac.vel.x, ac.vel.z) || 1;
        const y = clamp(ac.pos.y + AHEAD * clamp(ac.vel.y / hv, -0.08, 0.18) + (rings % 2 ? 1 : -1) * (12 + rings * 4), 55, 1150);
        ring = { x: ac.pos.x + dx * AHEAD + (-dz) * side, y, z: ac.pos.z + dz * AHEAD + dx * side };
        as.guide = ring;
      };
      if (!ring) spawn();
      else if (Math.hypot(ac.pos.x - ring.x, ac.pos.y - ring.y, ac.pos.z - ring.z) < R) { rings++; ring = null; as.guide = null; miss = 0; }
      else {
        const f = ac.forward();
        if (-((ac.pos.x - ring.x) * f.x + (ac.pos.z - ring.z) * f.z) < -90) { miss += dt; if (miss > 1.2) { miss = 0; spawn(); } }
      }
    });
    if (rings < 4) ok = false;
  }
  check(ok, 'aimant d\'anneaux : au moins 4 anneaux sur 5 sans toucher au manche (3 vents)');
}

console.log(failures.length ? `\n${failures.length} test(s) en echec` : '\nTous les tests passent');
process.exit(failures.length ? 1 : 0);
