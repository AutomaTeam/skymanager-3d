/* Trace d'une approche de planeur (G01) : node tools/gliderLand.mjs [ventX ventZ] */
import * as THREE from 'three';
import { Aircraft, KTS } from '../js/flightPhysics.js';
import { FlightAssist } from '../js/flightAssist.js';
import { PLANES } from '../js/fleet.js';
const dt = 1 / 60, P = PLANES.plume;
const wx = +(process.argv[2] || 4), wz = +(process.argv[3] || -12);
const ac = new Aircraft(); ac.applyProfile('plume', P.phys); ac.gain = P.gain; ac.fuel = P.fuel;
const as = new FlightAssist();
ac.reset({ pos: new THREE.Vector3(60, 170, -2800), heading: 180, speed: 29, flaps: 0, gear: true, fuel: P.fuel });
ac.released = true; as.launched = true; ac.wind.set(wx, 0, wz); ac.turbulence = 0.5;
let t = 0;
for (let i = 0; i < 60 * 240; i++) {
  t += dt;
  const o = as.update(ac, { pitch: 0, roll: 0, yaw: 0 }, dt);
  Object.assign(ac.ctl, { pitch: o.pitch, roll: o.roll, yaw: o.yaw, throttle: o.throttle, brake: o.brake });
  ac.update(dt, t);
  if (i % 240 === 0) console.log(`t=${t.toFixed(0).padStart(3)} z=${ac.pos.z.toFixed(0).padStart(6)} agl=${(ac.pos.y - ac.groundY).toFixed(0).padStart(4)} ias=${(ac.ias * KTS).toFixed(0)}kt vs=${ac.vel.y.toFixed(1)} spoil=${ac.spoilers ? 1 : 0} pitch=${ac.pitchDeg.toFixed(1)} outp=${o.pitch.toFixed(2)} ctl=${ac.ctl.pitch.toFixed(2)} ${as.state}${as.landing ? ' L' : ''}`);
  if (ac.touchdown) { console.log('TOUCH z=', ac.pos.z.toFixed(0), 'fpm', ac.touchdown.fpm.toFixed(0)); break; }
}
