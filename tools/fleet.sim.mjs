/* ============================================================
   fleet.sim.mjs — Tests des avions du hangar (js/fleet.js)

   Fait voler chaque profil avec la vraie physique et l'aide au
   pilotage : decollage, montee, croisiere, manche extreme, finale
   guidee, poser et arret. Affiche aussi les performances mesurees
   (distance de roulage, vitesses, taux de roulis...) pour regler
   les profils.

   Usage : npm install three@0.169.0 --no-save ; node tools/fleet.sim.mjs
   ============================================================ */
import * as THREE from 'three';
import { Aircraft, KTS, FT } from '../js/flightPhysics.js';
import { FlightAssist } from '../js/flightAssist.js';
import { PLANES } from '../js/fleet.js';

const dt = 1 / 60;
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log((ok ? 'PASS' : 'FAIL') + ' — ' + msg); };
const only = process.argv[2];

function make(id) {
  const P = PLANES[id];
  const ac = new Aircraft();
  ac.applyProfile(id, P.phys);
  ac.gain = P.gain;
  ac.fuel = P.fuel;
  return { ac, P };
}

function sim(id, setup, secs, script, wind, hook) {
  const { ac, P } = make(id);
  const as = new FlightAssist();
  setup(ac, as, P);
  ac.wind.set(wind[0], 0, wind[1]);
  ac.turbulence = wind[2];
  let t = 0, maxBank = 0, minIas = 999, maxIas = 0, rollDist = null, z0 = ac.pos.z;
  for (let i = 0; i < secs * 60; i++) {
    t += dt;
    const o = as.update(ac, script(t, ac), dt);
    Object.assign(ac.ctl, { pitch: o.pitch, roll: o.roll, yaw: o.yaw, throttle: o.throttle, brake: o.brake });
    ac.update(dt, t);
    if (!ac.onGround) {
      maxBank = Math.max(maxBank, Math.abs(ac.bankDeg)); minIas = Math.min(minIas, ac.ias * KTS); maxIas = Math.max(maxIas, ac.ias * KTS);
      if (rollDist == null) rollDist = z0 - ac.pos.z;
    }
    if (hook) hook(ac, as, t);
    if (ac.crashed) break;
  }
  return { ac, as, t, maxBank, minIas, maxIas, rollDist, P };
}

const idle = () => ({ pitch: 0, roll: 0, yaw: 0 });
const takeoff = (ac, as, P) => {
  ac.reset({ pos: new THREE.Vector3(0, ac.groundY, 1380), heading: 0, flaps: 2, gear: true, fuel: P.fuel });
  as.launch();
};
const final = (x, hdg = 180, alt = 215, z = -5500) => (ac, as, P) => {
  ac.reset({ pos: new THREE.Vector3(x, alt, z), heading: hdg, speed: ac.speeds.cruise / KTS * 0.75, flaps: 0, gear: ac.fixedGear, fuel: P.fuel });
  as.launched = true;
};

const WINDS = [[0, 0, 0.35], [5, 2, 0.6]];
const ids = Object.keys(PLANES).filter(id => id !== 'liner' && (!only || id === only));

for (const id of ids) {
  const P = PLANES[id];
  const { ac: a0 } = make(id);
  console.log(`\n=== ${P.name} (${id}) ===`);
  console.log(`masse ${a0.mass.toFixed(0)} kg, decrochage ${(a0.stallSpeed() * KTS).toFixed(0)} kt, Vr ${(a0.vRotate() * KTS).toFixed(0)} kt, Vref ${(a0.vRef() * KTS).toFixed(0)} kt`);

  /* Repos : l'avion doit tenir sur ses roues sans s'enfoncer ni rebondir. */
  {
    const r = sim(id, (ac, as, P) => { ac.reset({ pos: new THREE.Vector3(0, ac.groundY + 0.3, 1380), heading: 0, flaps: 1, gear: true, fuel: P.fuel }); }, 6, () => ({ pitch: 0, roll: 0, yaw: 0 }), [0, 0, 0]);
    check(r.ac.onGround && Math.abs(r.ac.pos.y - r.ac.groundY) < 0.35, `repose sur ses roues (y=${r.ac.pos.y.toFixed(2)}, groundY=${r.ac.groundY})`);
  }

  for (const w of WINDS) {
    const tag = ` (vent ${w[0]},${w[1]} turb ${w[2]})`;
    let r = sim(id, takeoff, 80, idle, w);
    const alt = r.ac.pos.y;
    check(!r.ac.crashed && !r.ac.onGround && alt > 200, `decollage et montee sans toucher au manche (alt ${alt.toFixed(0)} m, ${(r.ac.ias * KTS).toFixed(0)} kt, roulage ${r.rollDist ? r.rollDist.toFixed(0) : '?'} m)` + tag);
    check(r.minIas > r.ac.stallSpeed() * KTS * 1.05, `vitesse jamais critique (mini ${r.minIas.toFixed(0)} kt)` + tag);
    check(r.maxIas < r.ac.vne * 1.05, `vitesse max ${r.maxIas.toFixed(0)} kt < Vne ${r.ac.vne}` + tag);

    r = sim(id, takeoff, 100, (t) => ({ pitch: t > 30 && t < 50 ? 1 : 0, roll: 0, yaw: 0 }), w);
    check(!r.ac.crashed, 'manche a cabrer a fond 20 s : pas de crash' + tag);
    r = sim(id, takeoff, 100, (t) => ({ pitch: 0, roll: t > 30 && t < 60 ? 1 : 0, yaw: 0 }), w);
    check(!r.ac.crashed, 'virage a fond apres le decollage : pas de crash' + tag);
    r = sim(id, takeoff, 100, (t) => ({ pitch: t > 35 && t < 60 ? -1 : 0, roll: 0, yaw: 0 }), w);
    check(!r.ac.crashed, 'manche a piquer a fond : altitude de securite respectee' + tag);

    for (const [x, hdg, altF, z] of [[0, 180, 215, -5500], [200, 172, 215, -5500]]) {
      r = sim(id, final(x, hdg, altF, z), 260, idle, w);
      const td = r.ac.touchdown;
      check(!!td && !r.ac.crashed, `atterrissage guide depuis x=${x} cap ${hdg}` + tag);
      if (td) {
        check(Math.abs(td.offset) < 22, `pose sur la piste (ecart ${td.offset.toFixed(0)} m)` + tag);
        check(td.fpm < 350, `pose douce (${td.fpm.toFixed(0)} fpm, ${td.ias.toFixed(0)} kt)` + tag);
        const gs = Math.hypot(r.ac.vel.x, r.ac.vel.z) * KTS;
        check(gs < 2, `s'arrete tout seul (vitesse sol ${gs.toFixed(1)} kt)` + tag);
      }
    }
  }

  /* Maniabilite : taux de roulis au plein manche, sans aide. */
  {
    const { ac } = make(id);
    ac.reset({ pos: new THREE.Vector3(0, 800, 0), heading: 0, speed: ac.speeds.cruise / KTS, flaps: 0, gear: ac.fixedGear, fuel: P.fuel });
    ac.parkBrake = false; ac.onGround = false; ac.groundHold = 0;
    ac.ctl.throttle = 0.6;
    let maxRate = 0, t = 0;
    for (let i = 0; i < 90; i++) {
      t += dt;
      ac.ctl.roll = 1;
      ac.update(dt, t);
      maxRate = Math.max(maxRate, Math.abs(ac.omega.z) * 180 / Math.PI);
    }
    console.log(`  roulis plein manche : ${maxRate.toFixed(0)} deg/s`);
    const { ac: b } = make(id);
    b.reset({ pos: new THREE.Vector3(0, 800, 0), heading: 0, speed: b.speeds.cruise / KTS, flaps: 0, gear: b.fixedGear, fuel: P.fuel });
    b.parkBrake = false; b.onGround = false; b.groundHold = 0; b.ctl.throttle = 0.6;
    let maxP = 0; t = 0;
    for (let i = 0; i < 60; i++) { t += dt; b.ctl.pitch = 1; b.update(dt, t); maxP = Math.max(maxP, Math.abs(b.omega.x) * 180 / Math.PI); }
    console.log(`  tangage plein manche : ${maxP.toFixed(0)} deg/s`);
  }
}

console.log(failures.length ? `\n${failures.length} test(s) en echec` : '\nTous les tests passent');
process.exit(failures.length ? 1 : 0);
