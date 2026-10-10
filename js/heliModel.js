/* ============================================================
   heliModel.js — Helicoptere « arcade » (mode Arcade, vague 7)

   Ce n'est pas un modele aerodynamique : l'helicoptere se pilote
   comme les avions du jeu (gauche/droite = tourner, haut/bas =
   monter/descendre) mais il sait aussi STATIONNER sur place et se
   poser n'importe ou, doucement. La vitesse est automatique ; le
   bouton « STOP » le met en vol stationnaire.

   Le module exporte :
     heliReset(ac, headingDeg)  — remet l'etat a zero
     heliStep(ac, dt, t)        — un pas de simulation (remplace la
                                  physique de flightPhysics.js)
     heliCommand(ac, assist, inp, dt) — les « ordres » du pilote
                                  automatique (utilise par flightAssist.js)
   L'etat vit dans ac.heli ; l'appareil garde les memes champs que
   les avions (pos, vel, quat, onGround, touchdown, ias, n1...), donc
   le HUD, la camera, les missions et le rapport fonctionnent tels quels.
   ============================================================ */

import * as THREE from 'three';
import { LAYOUT } from './layout.js?v=1791614163';

const KTS = 1.94384;
const FPM = 196.85;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap180 = (a) => ((a + 540) % 360) - 180;

/* L'heliport vient du plan de l'aeroport (layout.js) : une seule source. */
export const HELIPAD = { x: LAYOUT.helipad.x, z: LAYOUT.helipad.z, r: LAYOUT.helipad.r };

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _Y = new THREE.Vector3(0, 1, 0), _X = new THREE.Vector3(1, 0, 0), _mZ = new THREE.Vector3(0, 0, -1);

export function heliInit(ac) {
  ac.heli = { hdg: 0, vf: 0, vy: 0, spin: 0, bank: 0, pitch: 0, rotor: 0, turn: 0, hover: false, auto: null,
    cmd: { vy: 0, turn: 0, speed: 0 }, airT: 0 };
}

export function heliReset(ac, headingDeg = 0) {
  const h = ac.heli;
  h.hdg = headingDeg * Math.PI / 180;
  h.vf = h.vy = h.spin = h.bank = h.pitch = h.turn = 0;
  h.hover = false; h.auto = null; h.airT = 0;
  h.cmd = { vy: 0, turn: 0, speed: 0 };
  ac.onGround = true;
}

/* Un pas de simulation. */
export function heliStep(ac, dt, t) {
  const h = ac.heli;
  dt = clamp(dt, 0.0005, 0.05);
  const c = h.cmd;
  const agl = ac.pos.y - ac.groundY;
  const ground = agl <= 0.002;

  /* rotor : monte en regime des que le pilote a donne les gaz */
  const spinWant = (ac.ctl.throttle > 0.05 || !ground) ? 1 : 0;
  h.spin += clamp(spinWant - h.spin, -dt * 0.8, dt * 0.45);
  const power = clamp((h.spin - 0.85) / 0.15, 0, 1);       // portance disponible

  /* vitesses cibles */
  const vyT = ground && power < 1 ? 0 : c.vy;
  if (ground && vyT <= 0) h.vy = 0;
  else h.vy += clamp(vyT - h.vy, -dt * 7, dt * 5.5);
  const vfT = power > 0.5 ? c.speed : 0;
  h.vf += clamp(vfT - h.vf, -dt * (ground ? 14 : 6), dt * 5);
  if (Math.abs(h.vf) < 0.02 && vfT === 0) h.vf = 0;
  h.turn += clamp(c.turn - h.turn, -dt * 3.2, dt * 3.2);
  h.hdg += h.turn * dt;
  if (h.hdg > Math.PI * 2) h.hdg -= Math.PI * 2; else if (h.hdg < 0) h.hdg += Math.PI * 2;

  /* effet de sol : on ne s'ecrase pas, on se pose */
  const prevVy = h.vy;
  const vx = Math.sin(h.hdg) * h.vf, vz = -Math.cos(h.hdg) * h.vf;
  ac.vel.set(vx, h.vy, vz);
  ac.pos.addScaledVector(ac.vel, dt);

  /* contact avec le sol */
  const was = ac.wasOnGround;
  if (ac.pos.y <= ac.groundY + 0.002) {
    const impact = -prevVy;
    ac.pos.y = ac.groundY;
    if (!was && ac.armedForLanding && impact > 0.05) {
      const dx = ac.pos.x - HELIPAD.x, dz = ac.pos.z - HELIPAD.z;
      const fpm = impact * FPM;
      ac.touchdown = {
        fpm, ias: h.vf * KTS, bank: h.bank * 180 / Math.PI, offset: Math.max(0, Math.hypot(dx, dz) - HELIPAD.r * 0.4),
        gearDown: true, flaps: '0'
      };
      if (fpm > 650) ac.crashed = true;
    }
    h.vy = Math.max(0, h.vy);
    ac.onGround = true;
    h.airT = 0;
  } else {
    ac.onGround = false;
    h.airT += dt;
    if (h.airT > 2) ac.armedForLanding = true;
  }
  ac.wasOnGround = ac.onGround;
  if (ac.onGround && ac.touchdown) ac.armedForLanding = false;

  /* attitude : nez qui plonge avec la vitesse, inclinaison dans les virages */
  const pitchT = -h.vf * 0.0065 - (h.vy < 0 ? 0 : 0);
  const bankT = clamp(h.turn * (0.22 + h.vf * 0.01), -0.55, 0.55);
  h.pitch += (pitchT - h.pitch) * Math.min(1, dt * 4);
  h.bank += (bankT - h.bank) * Math.min(1, dt * 4);
  _q1.setFromAxisAngle(_Y, -h.hdg);
  _q2.setFromAxisAngle(_X, h.pitch);
  _q3.setFromAxisAngle(_mZ, h.bank);
  ac.quat.copy(_q1).multiply(_q2).multiply(_q3);

  /* champs lus par le reste du jeu */
  ac.omega.set(0, 0, 0);
  ac.tas = ac.ias = Math.hypot(h.vf, 0);
  ac.mach = ac.tas / 340;
  ac.n1 = 20 + h.spin * 80;
  ac.n1Target = ac.n1;
  ac.gLoad = 1;
  ac.alpha = ac.beta = 0;
  ac.stall = 0;
  ac.overspeed = false;
  ac.lastVs = ac.vel.y;
  ac.thrustN = 0;
  /* le rotor sert d'animation : vitesse proportionnelle au regime */
  h.rotor = (h.rotor + h.spin * dt * 38) % (Math.PI * 2);
  ac.fuel = Math.max(0, ac.fuel - dt * 0.012 * (0.4 + h.spin));
}

/* Ordres du pilote automatique de l'helicoptere.
   `as` = FlightAssist (garde l'etat : altitude tenue, lancement, guide). */
export function heliCommand(ac, as, inp, dt) {
  const h = ac.heli, c = h.cmd;
  const agl = ac.pos.y - ac.groundY;
  const out = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 0 };
  const cruise = ac.speeds.cruise / KTS;
  const speedFast = as.boost ? ac.speeds.boost / KTS : cruise;

  /* Pose terminee : on reste au sol, le rotor ralentit. */
  if (ac.onGround && ac.touchdown) {
    as.state = 'ROLLOUT';
    as.hint = 'Pose ! Bravo, pilote.';
    c.vy = 0; c.turn = 0; c.speed = 0; h.auto = null; as.landing = false;
    out.brake = 1;
    return out;
  }
  if (!as.launched) {
    as.state = 'PARKED';
    as.hint = 'Appuie sur DÉCOLLER !';
    out.brake = 1;
    c.vy = 0; c.turn = 0; c.speed = 0;
    return out;
  }
  out.throttle = 1;
  as.state = agl > 3 ? 'FLIGHT' : 'TAKEOFF';

  const stickP = Math.abs(inp.pitch) > 0.1;
  const stickR = Math.abs(inp.roll) > 0.1;
  const dx = HELIPAD.x - ac.pos.x, dz = HELIPAD.z - ac.pos.z;
  const dPad = Math.hypot(dx, dz);

  /* --- Atterrissage automatique sur l'helipad --- */
  if (h.auto === 'land') {
    const brg = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
    const rel = wrap180(brg - ac.heading);
    c.turn = clamp(rel * 0.03, -0.9, 0.9);
    c.speed = dPad > 160 ? speedFast : clamp(dPad * 0.16, 0, cruise);
    if (Math.abs(rel) > 50) c.speed = Math.min(c.speed, 6);
    const wantY = ac.groundY + (dPad > 60 ? 38 : dPad > 22 ? 28 : 0);
    if (dPad > 22) c.vy = clamp((wantY - ac.pos.y) * 0.5, -3.5, 5);
    else c.vy = agl > 10 ? -3.2 : agl > 3 ? -1.6 : -0.7;
    as.hint = 'Je te pose sur l\'helipad, tout doucement…';
    if (ac.onGround) { c.speed = 0; c.turn = 0; c.vy = 0; h.auto = null; as.landing = false; }
    as.landing = true;
    out.roll = clamp(c.turn, -1, 1);
    return out;
  }
  as.landing = false;

  /* --- Virage : manche, sinon l'aimant d'une mission --- */
  const gd = as._guideInfo ? as._guideInfo(ac) : null;
  if (stickR) { c.turn = inp.roll * 1.0; as.hdgHold = null; }
  else if (gd) c.turn = clamp(wrap180(gd.bearing - ac.heading) * 0.03, -0.75, 0.75);
  else c.turn = 0;

  /* --- Altitude : manche, sinon l'altitude tenue --- */
  if (stickP) {
    as.altHold = null;
    c.vy = inp.pitch * 9;
    /* pres du sol, la descente reste douce */
    if (c.vy < 0 && agl < 22) c.vy = Math.max(c.vy, -(0.8 + agl * 0.12));
  } else {
    if (as.altHold == null) as.altHold = Math.max(ac.pos.y, ac.groundY + (ac.onGround ? 40 : 0));
    if (gd && agl > 20) as.altHold = clamp(gd.y, ac.groundY + 30, ac.groundY + 700);
    c.vy = clamp((as.altHold - ac.pos.y) * 0.7, -4.5, 6.5);
  }
  /* au sol on ne descend pas, et on attend le plein regime */
  if (ac.onGround && c.vy < 0) c.vy = 0;

  /* --- Vitesse : stationnaire sur demande, ou pres du sol au decollage --- */
  if (h.hover) c.speed = 0;
  else c.speed = agl < 14 ? Math.min(speedFast, 4 + agl * 0.9) : speedFast;
  if (ac.onGround) c.speed = 0;

  as.hint = h.hover ? 'Vol stationnaire ! Appuie sur STOP pour repartir.' : '';
  out.roll = clamp(c.turn, -1, 1);
  out.pitch = clamp(c.vy / 9, -1, 1);
  return out;
}
