/* ============================================================
   thermals.js — Ascendances pour le planeur (G01)
   Des colonnes d'air chaud : au-dessus des champs, de l'aire de stationnement et des iles.
   - cumulus blanc au sommet et oiseaux qui tournent dans la colonne (visibles seulement en planeur) ;
   - la physique recoit un vent vertical (ac.wind.y) qui depend de la position ;
   - vario sonore : un bip qui monte avec la vitesse de montee ;
   - module du registre (js/registry.js) : update(dt) et tips().
   `thermalLift(x, z)` est pure : testable hors navigateur (tools/fleet.sim.mjs ne l'utilise pas).
   ============================================================ */

import * as THREE from 'three';
import { sfx } from './sfx.js?v=1791469645';
import { ISLANDS } from './openWorld.js?v=1791469645';

/* Colonnes fixes : { x, z, r : rayon (m), w : montee au centre (m/s) }. */
export const THERMALS = [
  { x: 330, z: 1180, r: 260, w: 2.6 },       // aire de stationnement (le bitume chauffe)
  { x: -900, z: -400, r: 300, w: 3.0 },
  { x: 900, z: -900, r: 300, w: 2.8 },
  { x: -500, z: 900, r: 260, w: 2.4 },
  ...ISLANDS.map(i => ({ x: i.x, z: i.z, r: 280, w: 3.2 }))
];

/* Montee de l'air (m/s) au point (x, z) : cosinus doux, nul hors de la colonne. */
export function thermalLift(x, z, list = THERMALS) {
  let w = 0;
  for (const t of list) {
    const d = Math.hypot(x - t.x, z - t.z);
    if (d < t.r) w += t.w * (0.5 + 0.5 * Math.cos(Math.PI * d / t.r));
  }
  return w;
}

export class Thermals {
  constructor(game) {
    this.g = game;
    this.group = new THREE.Group();
    this.group.name = 'thermals';
    this.group.visible = false;
    this.birds = [];
    const cloudM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: true, depthWrite: false });
    const birdM = new THREE.MeshBasicMaterial({ color: 0x1f2937, side: THREE.DoubleSide, fog: true });
    const puff = new THREE.SphereGeometry(1, 12, 9);
    const wing = new THREE.PlaneGeometry(1, 1);
    for (const t of THERMALS) {
      /* cumulus : 4 boules groupees au-dessus de la colonne */
      const cl = new THREE.Group();
      [[0, 0, 0, 120], [90, -20, 40, 85], [-80, -10, -30, 90], [20, 30, -70, 70]].forEach(([dx, dy, dz, s]) => {
        const m = new THREE.Mesh(puff, cloudM);
        m.position.set(dx, dy, dz); m.scale.set(s * 1.5, s * 0.8, s * 1.2);
        cl.add(m);
      });
      cl.position.set(t.x, 1050, t.z);
      this.group.add(cl);
      /* oiseaux : 4 petits « V » qui montent en spirale dans la colonne */
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Group();
        for (const s of [-1, 1]) {
          const w = new THREE.Mesh(wing, birdM);
          w.scale.set(7, 1.6, 1); w.position.x = s * 3.3; w.rotation.z = s * 0.35;
          b.add(w);
        }
        this.group.add(b);
        this.birds.push({ b, t, ph: (i / 4) * Math.PI * 2, rr: t.r * 0.28 * (0.6 + 0.2 * i), h0: 60 + i * 90 });
      }
    }
    game.r3d.scene.add(this.group);
    this._beep = 0;
    this._inside = false;
    this.lift = 0;
  }

  get active() { const g = this.g; return !!(g.ac && g.ac.glider); }

  update(dt) {
    const g = this.g, ac = g.ac;
    const gl = this.active && g.state === 'PILOT';
    this.group.visible = gl;
    if (!gl) { const c = document.getElementById('varioChip'); if (c) c.classList.add('hidden'); }
    if (!ac.glider) { if (this.lift) { ac.wind.y = 0; this.lift = 0; } return; }
    this.lift = ac.onGround ? 0 : thermalLift(ac.pos.x, ac.pos.z);
    ac.wind.y = this.lift;
    if (!gl) return;
    /* oiseaux */
    const time = g.time;
    for (const o of this.birds) {
      const a = time * 0.45 + o.ph;
      const y = 150 + ((o.h0 + time * 9) % 780);
      o.b.position.set(o.t.x + Math.cos(a) * o.rr, y, o.t.z + Math.sin(a) * o.rr);
      o.b.rotation.y = -a;
      o.b.rotation.z = Math.sin(time * 6 + o.ph) * 0.2;
    }
    /* annonce a l'entree d'une ascendance, et vario sonore */
    const inside = this.lift > 0.8 && !ac.onGround;
    if (inside && !this._inside) {
      g.arcade.popup('☁️ Ascendance ! Tourne pour rester dedans');
      g.fun.say('Ça monte ! Tourne en rond pour rester dans la colonne !', 2, 3200);
    }
    this._inside = inside;
    if (ac.released && !ac.onGround) {
      const vs = ac.vel.y;
      this._beep -= dt;
      if (vs > 0.4 && this._beep <= 0) { sfx.vario(vs); this._beep = Math.max(0.16, 0.7 - vs * 0.13); }
    }
    this._chip(ac);
  }

  /* Puce « vario » : montee / descente en m/s et hauteur. */
  _chip(ac) {
    const el = document.getElementById('varioChip');
    if (!el) return;
    el.classList.remove('hidden');
    const vs = ac.vel.y;
    const txt = `${vs >= 0.2 ? '⬆️' : vs <= -0.2 ? '⬇️' : '➡️'} ${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s · ${Math.round(ac.pos.y - ac.groundY)} m${ac.released ? '' : ' · remorque'}`;
    if (el.textContent !== txt) el.textContent = txt;
    el.classList.toggle('good', vs > 0.5);
  }

  tips() {
    return this.active ? ['🪂 Cherche les oiseaux qui tournent et les gros nuages blancs : dessous, l\'air monte !'] : [];
  }
}
