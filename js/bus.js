/* ============================================================
   bus.js — Conduire le bus des passagers (mode Arcade)

   Le bus jaune fait la navette entre l'arret du terminal et l'avion
   de ligne gare au poste eloigne (airportLife.js, itineraire « bus »).
   L'enfant peut le prendre : « 🚌 CONDUIRE LE BUS ».

   Mission en boucle :
     1. a l'arret du terminal (anneau bleu), les passagers montent
        (jusqu'a 20 ; il en arrive un toutes les 3 s) ;
     2. au pied de l'avion (anneau orange), ils descendent : pieces.

   La conduite vient de vehicle.js (meme base que le tracteur).
   ============================================================ */

import * as THREE from 'three';
import { sfx } from './sfx.js?v=1791470382';
import { LAYOUT } from './layout.js?v=1791470382';
import { Vehicle } from './vehicle.js?v=1791470382';
import { buildBus } from './airportLife.js?v=1791470382';

const ENTER_RANGE = 7;
const PAX_MAX = 20;
const STOP_REFILL = 3;           // s par passager qui arrive a l'arret
const R = LAYOUT.routes.bus;
const STOP = { x: R[0][0], z: R[0][1] };
const STAND = { x: R[R.length - 1][0], z: R[R.length - 1][1] };

function ring(color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(3.6, 4.4, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.08;
  m.visible = false;
  return m;
}

export class Bus extends Vehicle {
  constructor(game) {
    super(game, {
      name: 'BUS', maxFwd: 8, maxRev: 2.6, wheelbase: 7, maxSteer: 0.55, reach: 5.8, hl: 5.5, hw: 1.3,
      cam: { look: 2.2, ahead: 6, height: 8.5, dist: 17, follow: 3, fov: 64 }
    });
    this.pax = 0;
    this.waiting = 8;            // passagers a l'arret
    this._t = 0;
    this.amb = null;
  }

  _ambient() {
    const life = this.g.r3d.life;
    return life ? life.movers.find(m => m.kind === 'bus') : null;
  }

  near() {
    const g = this.g;
    if (this.active || g.driving || !g.arcade.on || g.rides.active || g.controlled || g.inTerminal) return null;
    const it = this._ambient();
    if (!it || it.g.visible === false) return null;
    const p = g.player.pos;
    const d = Math.hypot(it.mv.x - p.x, it.mv.z - p.z);
    return d < ENTER_RANGE ? { kind: 'vehEnter', veh: this, d, label: '🚌 CONDUIRE LE BUS' } : null;
  }

  enter() {
    const g = this.g, it = this._ambient();
    if (!it || this.active) return;
    if (!this.model) this._build();
    this.x = it.mv.x; this.z = it.mv.z; this.h = Math.PI - it.mv.h;
    this.amb = it;
    it.g.visible = false;
    this.model.group.visible = true;
    this.stopRing.visible = this.standRing.visible = true;
    this._seat();
    sfx.honk();
    g.toast('🚌 Au volant du bus ! Fais monter les passagers au terminal (anneau bleu), puis emmene-les a l\'avion (anneau orange).', 5200, 'ok');
  }

  _onExit() {
    this.model.group.visible = false;
    this.stopRing.visible = this.standRing.visible = false;
    if (this.amb) this.amb.g.visible = true;
    this.amb = null;
    if (this.pax) this.g.toast(`🚌 ${this.pax} passager${this.pax > 1 ? 's' : ''} t'attendent dans le bus !`, 3000);
  }

  _build() {
    const root = this.g.r3d.airport;
    this.model = { group: buildBus() };
    root.add(this.model.group);
    this.stopRing = ring(0x38bdf8);
    this.standRing = ring(0xf59e0b);
    this.stopRing.position.set(STOP.x, 0.08, STOP.z);
    this.standRing.position.set(STAND.x, 0.08, STAND.z);
    root.add(this.stopRing, this.standRing);
  }

  _afterMove() {}

  _mission() {
    const g = this.g, t = g.time;
    this.stopRing.material.opacity = this.pax < PAX_MAX && this.waiting > 0 ? 0.55 + Math.sin(t * 4) * 0.3 : 0.2;
    this.standRing.material.opacity = this.pax > 0 ? 0.55 + Math.sin(t * 4) * 0.3 : 0.2;
    const slow = Math.abs(this.v) < 2;
    if (slow && this.pax < PAX_MAX && Math.hypot(this.x - STOP.x, this.z - STOP.z) < 6) {
      const n = Math.min(PAX_MAX - this.pax, Math.floor(this.waiting));
      if (n > 0) {
        this.pax += n; this.waiting -= n;
        sfx.ding();
        g.arcade.popup(`🧍 +${n} passager${n > 1 ? 's' : ''} (${this.pax}/${PAX_MAX})`);
      }
    }
    if (slow && this.pax > 0 && Math.hypot(this.x - STAND.x, this.z - STAND.z) < 7) this._deliver();
  }

  _deliver() {
    const g = this.g, A = g.arcade, n = this.pax;
    this.pax = 0;
    const coins = Math.ceil(n / 2) + (n >= PAX_MAX ? 3 : 0);
    A.giveCoins(coins, { silent: true, xp: n });
    A.data.stats.busTrips = (A.data.stats.busTrips || 0) + 1;
    A.event('busTrip');
    A.save();
    sfx.tada();
    A.confetti(n >= PAX_MAX ? 60 : 30);
    g.toast(`🚌 ${n} passager${n > 1 ? 's' : ''} deposes au pied de l'avion ! +${coins} 🪙${n >= PAX_MAX ? ' (bus plein : bonus !)' : ''}`, 3400, 'ok');
  }

  update(dt) {
    if (!this.g.arcade.on) return;
    this._t += dt;
    if (this._t >= STOP_REFILL) { this._t = 0; this.waiting = Math.min(PAX_MAX, this.waiting + 1); }
    super.update(dt);
  }

  goal() {
    if (!this.active) return null;
    if (this.pax > 0) return { icon: '🚌', text: `Emmene les ${this.pax} passagers jusqu'a l'avion (anneau orange) !`, target: STAND };
    return { icon: '🚌', text: `Va a l'arret du terminal (anneau bleu) : ${Math.floor(this.waiting)} passagers attendent.`, target: STOP };
  }
}
