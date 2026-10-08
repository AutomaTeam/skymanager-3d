/* Sonde du planeur (G01) : affiche l'evolution d'un vol remorque + plane. Usage : node tools/gliderProbe.mjs [thermique m/s] */
import * as THREE from 'three';
import { Aircraft, KTS } from '../js/flightPhysics.js';
import { FlightAssist } from '../js/flightAssist.js';
import { PLANES } from '../js/fleet.js';

const dt = 1 / 60;
const w = +(process.argv[2] || 0);
const P = PLANES.plume;
const ac = new Aircraft(); ac.applyProfile('plume', P.phys); ac.gain = P.gain; ac.fuel = P.fuel;
const as = new FlightAssist();
ac.reset({ pos: new THREE.Vector3(0, ac.groundY, 1380), heading: 0, flaps: 2, gear: true, fuel: P.fuel });
as.launch();
let t = 0, relT = null, relPos = null;
as.onRelease = () => { relT = t; relPos = ac.pos.clone(); };
for (let i = 0; i < 60 * 260; i++) {
  t += dt;
  const o = as.update(ac, { pitch: 0, roll: 0, yaw: 0 }, dt);
  Object.assign(ac.ctl, { pitch: o.pitch, roll: o.roll, yaw: o.yaw, throttle: o.throttle, brake: o.brake });
  ac.wind.set(0, relT != null ? w : 0, 0);
  ac.update(dt, t);
  if (i % 300 === 0) console.log(`t=${t.toFixed(0).padStart(3)} alt=${ac.pos.y.toFixed(0).padStart(4)} ias=${(ac.ias * KTS).toFixed(0).padStart(3)}kt vs=${ac.vel.y.toFixed(1).padStart(5)} pitch=${ac.pitchDeg.toFixed(1).padStart(5)} z=${ac.pos.z.toFixed(0)} thr=${o.throttle.toFixed(2)} ${as.state}${ac.onGround ? ' SOL' : ''}${ac.released ? ' L' : ''}`);
  if (!ac.onGround && ac.ias * KTS < 40 && !globalThis.__lo) { globalThis.__lo = 1; console.log(`  IAS bas: t=${t.toFixed(1)} ias=${(ac.ias*KTS).toFixed(0)} alt=${ac.pos.y.toFixed(0)} vs=${ac.vel.y.toFixed(1)} pitch=${ac.pitchDeg.toFixed(1)} state=${as.state}`); }
  if (ac.crashed) { console.log('CRASH', t.toFixed(1)); break; }
}
if (relT != null) {
  const d = Math.hypot(ac.pos.x - relPos.x, ac.pos.z - relPos.z), dh = relPos.y - ac.pos.y;
  console.log(`largue a t=${relT.toFixed(0)} s ; finesse mesuree ${(d / Math.max(1, dh)).toFixed(1)} (distance ${d.toFixed(0)} m pour ${dh.toFixed(0)} m)`);
}
