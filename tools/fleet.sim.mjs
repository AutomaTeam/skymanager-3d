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
import { HELIPAD } from '../js/heliModel.js';

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

const WINDS = [[0, 0, 0.35], [5, 2, 0.6], [4, -12, 0.5]];   // le dernier : gros vent de face (l'avion posait avant la piste)

/* Helicoptere : decollage, vol, stationnaire, atterrissage automatique sur l'helipad. */
function heliTests(id, P) {
  const pad = { x: HELIPAD.x, z: HELIPAD.z };
  const start = (ac, as, P) => { ac.reset({ pos: new THREE.Vector3(pad.x, ac.groundY, pad.z), heading: 0, fuel: P.fuel }); as.launch(); };
  let r = sim(id, start, 30, idle, [0, 0, 0.3]);
  check(!r.ac.onGround && r.ac.pos.y - r.ac.groundY > 25, `helico : decolle et prend de l'altitude (${(r.ac.pos.y - r.ac.groundY).toFixed(0)} m)`);
  check(Math.hypot(r.ac.vel.x, r.ac.vel.z) > 15, `helico : avance en croisiere (${(Math.hypot(r.ac.vel.x, r.ac.vel.z) * KTS).toFixed(0)} kt)`);
  r = sim(id, start, 45, idle, [0, 0, 0.3], (ac, as, t) => { if (t > 20 && !ac.heli.hover) ac.heli.hover = true; });
  check(Math.hypot(r.ac.vel.x, r.ac.vel.z) < 0.5 && r.ac.pos.y - r.ac.groundY > 25, `helico : le bouton STOP le met en vol stationnaire`);
  /* aimant d'anneau (reglage par defaut du jeu) : l'altitude visee ne doit jamais devenir NaN */
  r = sim(id, start, 40, idle, [0, 0, 0.3], (ac, as, t) => {
    if (ac.pos.y > 8 && !as.guide) as.guide = { x: ac.pos.x + 20, y: ac.pos.y + 60, z: ac.pos.z - 500 };
  });
  check(Number.isFinite(r.ac.pos.y) && Number.isFinite(r.ac.vel.y) && !r.ac.crashed, 'helico : guide par un anneau, position toujours valide');
  /* manche a cabrer / piquer : montee puis descente douce */
  r = sim(id, start, 60, (t) => ({ pitch: t > 15 && t < 25 ? 1 : t > 35 ? -1 : 0, roll: 0, yaw: 0 }), [0, 0, 0.3]);
  check(!r.ac.crashed, 'helico : descente au manche sans crash');
  /* atterrissage automatique depuis divers points */
  for (const [x, z, alt] of [[pad.x + 205, pad.z - 290, 90], [pad.x - 195, pad.z + 310, 150], [pad.x, pad.z - 300, 60]]) {
    r = sim(id, (ac, as, P) => { ac.reset({ pos: new THREE.Vector3(x, alt, z), heading: 0, fuel: P.fuel }); ac.onGround = false; ac.wasOnGround = false; as.launched = true; ac.heli.auto = 'land'; ac.heli.vf = 15; ac.heli.airT = 5; ac.armedForLanding = true; }, 90, idle, [3, 1, 0.4]);
    const td = r.ac.touchdown;
    check(!!td && !r.ac.crashed, `helico : atterrissage automatique depuis (${x},${z})`);
    if (td) {
      check(td.fpm < 320, `helico : pose douce (${td.fpm.toFixed(0)} fpm)`);
      const d = Math.hypot(r.ac.pos.x - pad.x, r.ac.pos.z - pad.z);
      check(d < 24, `helico : pose sur l'helipad (a ${d.toFixed(0)} m)`);
    }
  }
}

/* Planeur : remorquage, largage, finesse, ascendance, approche sans moteur. */
function gliderTests(id, P) {
  {
    const r = sim(id, (ac, as, P) => { ac.reset({ pos: new THREE.Vector3(0, ac.groundY + 0.3, 1380), heading: 0, flaps: 1, gear: true, fuel: P.fuel }); }, 6, idle, [0, 0, 0]);
    check(r.ac.onGround && Math.abs(r.ac.pos.y - r.ac.groundY) < 0.35, `repose sur ses roues (y=${r.ac.pos.y.toFixed(2)})`);
  }
  for (const w of WINDS) {
    const tag = ` (vent ${w[0]},${w[1]} turb ${w[2]})`;
    let released = null;
    let minIas = 999;
    let r = sim(id, takeoff, 160, idle, w, (ac, as, t) => { if (released == null && ac.released) released = { t, y: ac.pos.y - ac.groundY }; if (t > 10 && !ac.onGround) minIas = Math.min(minIas, ac.ias * KTS); });
    check(!r.ac.crashed && released && released.y >= 500 && released.t < 150, `remorquage puis largage a ${released ? released.y.toFixed(0) : '?'} m apres ${released ? released.t.toFixed(0) : '?'} s` + tag);
    check(minIas > r.ac.stallSpeed() * KTS * 1.02, `vitesse jamais critique (mini ${minIas.toFixed(0)} kt)` + tag);
    r = sim(id, takeoff, 100, (t) => ({ pitch: t > 30 && t < 50 ? 1 : 0, roll: 0, yaw: 0 }), w);
    check(!r.ac.crashed, 'manche a cabrer a fond 20 s : pas de crash' + tag);
    r = sim(id, takeoff, 140, (t) => ({ pitch: t > 90 && t < 120 ? -1 : 0, roll: 0, yaw: 0 }), w);
    check(!r.ac.crashed, 'manche a piquer a fond apres le largage : pas de crash' + tag);
  }
  /* Finesse en air calme : distance / hauteur perdue apres le largage. */
  {
    let rel = null;
    const r = sim(id, takeoff, 220, idle, [0, 0, 0], (ac, as, t) => { if (!rel && ac.released) rel = { p: ac.pos.clone(), t }; });
    const d = Math.hypot(r.ac.pos.x - rel.p.x, r.ac.pos.z - rel.p.z), dh = rel.p.y - r.ac.pos.y;
    const fin = d / Math.max(1, dh);
    check(fin > 24 && fin < 40, `finesse ${fin.toFixed(1)} (vise ~30)`);
  }
  /* Ascendance de 2,5 m/s : on monte. */
  {
    let rel = null;
    const r = sim(id, takeoff, 200, idle, [0, 0, 0], (ac, as, t) => { if (!rel && ac.released) rel = { y: ac.pos.y, t }; if (rel) ac.wind.y = 2.5; });
    check(r.ac.pos.y > rel.y + 30, `monte dans une ascendance (+${(r.ac.pos.y - rel.y).toFixed(0)} m)`);
  }
  /* Approche sans moteur depuis 1,8 km de la piste et 260 m (comme le bouton ATTERRIR : aerofreins pour la pente). */
  for (const w of WINDS) {
    const tag = ` (vent ${w[0]},${w[1]} turb ${w[2]})`;
    const r = sim(id, (ac, as, P) => { ac.reset({ pos: new THREE.Vector3(60, 260, -3300), heading: 180, speed: 29, flaps: 0, gear: true, fuel: P.fuel }); ac.released = true; as.launched = true; }, 240, idle, w);
    const td = r.ac.touchdown;
    check(!!td && !r.ac.crashed, 'atterrissage guide sans moteur' + tag);
    if (td) {
      check(Math.abs(td.offset) < 25, `pose sur la piste (ecart ${td.offset.toFixed(0)} m)` + tag);
      check(td.fpm < 350, `pose douce (${td.fpm.toFixed(0)} fpm)` + tag);
      check(Math.hypot(r.ac.vel.x, r.ac.vel.z) * KTS < 2 && r.ac.pos.z > -1500, `s'arrete sur la piste (z=${r.ac.pos.z.toFixed(0)})` + tag);
    }
  }
}
const ids = Object.keys(PLANES).filter(id => id !== 'liner' && (!only || id === only));

for (const id of ids) {
  const P = PLANES[id];
  const { ac: a0 } = make(id);
  console.log(`\n=== ${P.name} (${id}) ===`);
  console.log(`masse ${a0.mass.toFixed(0)} kg, decrochage ${(a0.stallSpeed() * KTS).toFixed(0)} kt, Vr ${(a0.vRotate() * KTS).toFixed(0)} kt, Vref ${(a0.vRef() * KTS).toFixed(0)} kt`);

  if (P.phys && P.phys.isHeli) { heliTests(id, P); continue; }
  if (P.phys && P.phys.glider) { gliderTests(id, P); continue; }

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
        check(r.ac.pos.z > -1500, `s'arrete sur la piste, pas avant le seuil (z=${r.ac.pos.z.toFixed(0)})` + tag);
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
