/* ============================================================
   groundVehicles.js — Trois vehicules de plus a conduire (H03)

     🚚 Camion avitailleur : va au point de ravitaillement de l'avion (anneau orange) et
        reste 4 secondes pour faire le plein : pieces ;
     🧹 Balayeuse de piste : ramasse les debris (anneaux jaunes) en 70 secondes : pieces par debris ;
     🪜 Escalier mobile : amene l'escalier a la porte de l'avion (anneau bleu) pour faire
        descendre les passagers : pieces.

   Meme base que le tracteur et le bus (vehicle.js) : haut/bas = avancer/reculer, gauche/droite = braquer.
   Chaque vehicule a son garage sur l'aire de stationnement ; tous sont des modules du registre
   (js/registry.js) : bouton « CONDUIRE », objectif, corps qui bloquent les gens.
   ============================================================ */

import * as THREE from 'three';
import { sfx } from './sfx.js?v=1791602844';
import { Vehicle } from './vehicle.js?v=1791602844';
import { emojiSprite } from './groundFun.js?v=1791602844';

const ENTER_RANGE = 5.5;

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0.15 });
function box(w, h, d, m, x = 0, y = 0, z = 0) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; return b; }
function wheels(g, xs, zs, r = 0.5) {
  const m = std(0x1d2025, { rough: 0.95 });
  for (const x of xs) for (const z of zs) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.4, 14), m);
    w.rotation.z = Math.PI / 2; w.position.set(x, r, z); g.add(w);
  }
}
function ring(color, r = 3.4) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.8, r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.09; m.visible = false;
  return m;
}

/* Base : un vehicule gare qui apparait pres de l'avion. `garage` = point de depart souhaite (x, z, cap). */
class GroundVehicle extends Vehicle {
  constructor(game, cfg, garage) {
    super(game, cfg);
    this.garage = garage;
    this.parkedAt = null;
  }

  _place() {
    if (this.parkedAt) return;
    const w = this.g.nav.nearestWalkable(this.garage.x, this.garage.z);
    this.parkedAt = { x: w.x, z: w.z, h: this.garage.h };
    this.x = w.x; this.z = w.z; this.h = this.garage.h;
    if (!this.model) this._build();
    this.model.group.position.set(this.x, 0, this.z);
    this.model.group.rotation.y = this.h + Math.PI;
    this.model.group.visible = true;
  }

  /* Corps fixe quand le vehicule est gare (on ne marche pas a travers) ; `Vehicle.body()` quand on le conduit. */
  bodies() {
    if (!this.parkedAt || this.g.state !== 'HUB' || this.active) return [];
    return [this.body()];
  }

  near() {
    const g = this.g;
    if (this.active || g.driving || !g.arcade.on || g.rides.active || g.controlled || g.inTerminal || !this.parkedAt) return null;
    const p = g.player.pos;
    const d = Math.hypot(this.x - p.x, this.z - p.z);
    return d < ENTER_RANGE + this.cfg.hl ? { kind: 'vehEnter', veh: this, d, label: this.cfg.enterLabel } : null;
  }

  enter() {
    if (this.active) return;
    this._place();
    this._seat();
    sfx.honk();
    this.g.toast(this.cfg.intro, 5200, 'ok');
    this._onEnter && this._onEnter();
  }

  _onExit() {}
  _afterMove() {}

  update(dt) {
    if (!this.g.arcade.on) return;
    if (this.g.state === 'HUB') this._place();
    if (this.model) this.model.group.visible = this.g.state === 'HUB' || this.active;
    this._tick && this._tick(dt);
    super.update(dt);
  }
}

/* ------------------------------------------------------------
   🚚 Camion avitailleur
   ------------------------------------------------------------ */
export class FuelTruck extends GroundVehicle {
  constructor(game) {
    super(game, {
      name: 'CAMION CITERNE', maxFwd: 7, maxRev: 2.4, wheelbase: 4.2, maxSteer: 0.55, reach: 3.6, hl: 3.6, hw: 1.3,
      cam: { look: 1.8, ahead: 4.5, height: 6.5, dist: 13.5, follow: 3, fov: 62 },
      enterLabel: '🚚 CONDUIRE LE CAMION CITERNE',
      intro: '🚚 Camion citerne ! Va à l\'anneau orange, à côté de l\'avion, et reste immobile 4 secondes pour faire le plein.'
    }, { x: 318, z: 1112, h: Math.PI });
    this.fill = 0;
    this.cool = 0;
  }

  _build() {
    const g = new THREE.Group();
    g.add(box(2.1, 0.5, 6.4, std(0x374151), 0, 0.85, 0));
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 4.4, 20), std(0xf8fafc, { metal: 0.4 }));
    tank.rotation.x = Math.PI / 2; tank.position.set(0, 1.9, 0.5); tank.castShadow = true; g.add(tank);
    g.add(box(2.02, 0.28, 4.4, std(0xdc2626), 0, 1.9, 0.5));
    g.add(box(2.0, 1.5, 1.5, std(0xdc2626), 0, 1.65, -2.55));
    g.add(box(1.7, 0.7, 0.06, std(0x93c5fd, { metal: 0.6 }), 0, 2.0, -3.3));
    wheels(g, [-1.0, 1.0], [-2.3, 1.5, 2.7], 0.55);
    this.model = { group: g };
    this.g.r3d.airport.add(g);
    this.mark = ring(0xf59e0b); this.g.r3d.airport.add(this.mark);
  }

  _fuelPoint() {
    const w = this.g.nav.toWorld('aircraft', -9.5, -3.0);       // a cote de l'aile gauche, cote refuel
    return { x: w.x, z: w.z };
  }

  _onExit() { if (this.mark) this.mark.visible = false; }
  _onEnter() { this.mark.visible = true; this._pos(); }
  _pos() { const f = this._fuelPoint(); this.mark.position.set(f.x, 0.09, f.z); }

  _tick(dt) { this.cool = Math.max(0, this.cool - dt); }

  _mission(dt) {
    const g = this.g, t = g.time;
    this._pos();
    const f = this._fuelPoint();
    const d = Math.hypot(this.x - f.x, this.z - f.z);
    this.mark.material.opacity = this.cool > 0 ? 0.2 : 0.55 + Math.sin(t * 4) * 0.3;
    if (this.cool > 0) return;
    if (d < 6 && Math.abs(this.v) < 0.6) {
      this.fill += dt;
      if (Math.floor(this.fill) !== this._lastN) { this._lastN = Math.floor(this.fill); g.arcade.popup(`⛽ ${Math.min(100, Math.round(this.fill / 4 * 100))} %`); sfx.tick(); }
      if (this.fill >= 4) {
        this.fill = 0; this._lastN = -1; this.cool = 45;
        const A = g.arcade;
        A.giveCoins(9, { silent: true, xp: 6 });
        A.data.stats.refuels = (A.data.stats.refuels || 0) + 1;
        A.save();
        sfx.tada(); A.confetti(40);
        g.toast('⛽ Plein fait ! L\'avion est prêt. +9 🪙', 3200, 'ok');
        g.ac.fuel = Math.max(g.ac.fuel, planeFuel(g));
      }
    } else this.fill = Math.max(0, this.fill - dt * 2);
  }

  goal() {
    if (!this.active) return null;
    return { icon: '🚚', text: this.cool > 0 ? 'Plein terminé ! Tu peux descendre ou refaire un tour.' : 'Va à l\'anneau orange à côté de l\'avion, puis reste immobile.', target: this.cool > 0 ? null : this._fuelPoint() };
  }
}
const planeFuel = (g) => (g.ac.fuelCap || 9000);

/* ------------------------------------------------------------
   🧹 Balayeuse de piste : ramasse les debris (FOD)
   ------------------------------------------------------------ */
export class Sweeper extends GroundVehicle {
  constructor(game) {
    super(game, {
      name: 'BALAYEUSE', maxFwd: 6.5, maxRev: 2.2, wheelbase: 3.0, maxSteer: 0.6, reach: 2.4, hl: 2.4, hw: 1.2,
      cam: { look: 1.6, ahead: 4, height: 6.2, dist: 12, follow: 3, fov: 62 },
      enterLabel: '🧹 CONDUIRE LA BALAYEUSE',
      intro: '🧹 Balayeuse ! Ramasse les débris (anneaux jaunes) avant la fin du temps : chaque débris rapporte des pièces.'
    }, { x: 334, z: 1105, h: Math.PI });
    this.debris = [];
    this.timer = 0;
    this.picked = 0;
    this.running = false;
  }

  _build() {
    const g = new THREE.Group();
    g.add(box(1.9, 0.5, 4.2, std(0xf59e0b), 0, 0.8, 0));
    g.add(box(1.7, 1.2, 1.6, std(0xf59e0b), 0, 1.5, -0.9));
    g.add(box(1.5, 0.6, 0.06, std(0x93c5fd, { metal: 0.6 }), 0, 1.7, -1.72));
    this.brush = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.9, 12), std(0x374151));
    this.brush.rotation.z = Math.PI / 2; this.brush.position.set(0, 0.4, -2.3); g.add(this.brush);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfb923c }));
    beacon.position.set(0, 2.25, -0.9); g.add(beacon);
    wheels(g, [-0.9, 0.9], [-1.4, 1.4], 0.42);
    this.model = { group: g };
    this.g.r3d.airport.add(g);
    this.rootDeb = new THREE.Group(); this.g.r3d.airport.add(this.rootDeb);
  }

  _onEnter() { this._spawn(); }
  _onExit() { this._clear(); this.running = false; }

  _clear() { for (const d of this.debris) this.rootDeb.remove(d.s); this.debris = []; }

  _spawn() {
    this._clear();
    const g = this.g, N = 8;
    let tries = 0;
    while (this.debris.length < N && tries++ < 200) {
      const x = this.x + (Math.random() - 0.5) * 120, z = this.z + (Math.random() - 0.5) * 100;
      if (!g.nav.isWalkable(x, z) || g.r3d.isInsideTerminal(x, z) || !g.agents._clearOfHull(null, x, z)) continue;
      if (Math.hypot(x - this.x, z - this.z) < 12) continue;
      const s = emojiSprite('🔩', 1.3);
      s.position.set(x, 0.9, z);
      this.rootDeb.add(s);
      this.debris.push({ s, x, z });
    }
    this.picked = 0; this.timer = 70; this.running = true;
  }

  _tick() {}

  _mission(dt) {
    const g = this.g, t = g.time;
    if (this.brush) this.brush.rotation.x += dt * (6 + Math.abs(this.v));
    if (!this.running) return;
    this.timer -= dt;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.s.position.y = 0.9 + Math.sin(t * 4 + i) * 0.15;
      if (Math.hypot(d.x - this.x - Math.sin(this.h) * 2.2, d.z - this.z - Math.cos(this.h) * 2.2) < 2.6) {
        this.rootDeb.remove(d.s); this.debris.splice(i, 1); this.picked++;
        sfx.sparkle();
        g.arcade.giveCoins(2, { silent: true });
        g.arcade.popup(`🔩 ${this.picked}/8  +2 🪙`);
      }
    }
    if (!this.debris.length || this.timer <= 0) this._finish();
  }

  _finish() {
    const g = this.g, A = g.arcade;
    this.running = false;
    const all = !this.debris.length;
    this._clear();
    if (all) {
      A.giveCoins(12 + Math.round(this.timer / 5), { silent: true, xp: 12 });
      sfx.tada(); A.confetti(60);
      A.data.stats.sweeps = (A.data.stats.sweeps || 0) + 1; A.save();
      g.toast(`🧹 Piste propre en ${Math.round(70 - this.timer)} s ! Bonus +${12 + Math.round(this.timer / 5)} 🪙`, 4200, 'ok');
    } else g.toast(`🧹 Temps écoulé : ${this.picked} débris ramassés. Bravo quand même !`, 3200);
    /* On peut recommencer tout de suite. */
    setTimeout(() => { if (this.active) this._spawn(); }, 2500);
  }

  goal() {
    if (!this.active) return null;
    if (!this.debris.length) return { icon: '🧹', text: 'Piste propre ! Une nouvelle série arrive…', target: null };
    let best = this.debris[0], bd = 1e9;
    for (const d of this.debris) { const k = Math.hypot(d.x - this.x, d.z - this.z); if (k < bd) { bd = k; best = d; } }
    return { icon: '🧹', text: `Ramasse les débris ! ${this.picked}/8 · ${Math.max(0, Math.ceil(this.timer))} s`, target: { x: best.x, z: best.z } };
  }
}

/* ------------------------------------------------------------
   🪜 Escalier mobile : amene-le a la porte de l'avion
   ------------------------------------------------------------ */
export class Stairs extends GroundVehicle {
  constructor(game) {
    super(game, {
      name: 'ESCALIER', maxFwd: 5, maxRev: 2, wheelbase: 2.6, maxSteer: 0.6, reach: 2.2, hl: 2.0, hw: 1.2,
      cam: { look: 1.5, ahead: 3.5, height: 6, dist: 11.5, follow: 3, fov: 62 },
      enterLabel: '🪜 CONDUIRE L\'ESCALIER MOBILE',
      intro: '🪜 Escalier mobile ! Amène-le à la porte de l\'avion (anneau bleu) et arrête-toi : les passagers descendent.'
    }, { x: 350, z: 1100, h: Math.PI });
    this.hold = 0;
    this.cool = 0;
  }

  _build() {
    const g = new THREE.Group();
    const grey = std(0x94a3b8, { metal: 0.4 }), rail = std(0xfacc15);
    g.add(box(1.8, 0.4, 3.4, std(0x475569), 0, 0.7, 0));
    for (let i = 0; i < 6; i++) g.add(box(1.5, 0.12, 0.4, grey, 0, 1.0 + i * 0.32, 1.4 - i * 0.42));
    g.add(box(1.8, 0.2, 1.2, grey, 0, 3.0, -1.2));
    for (const s of [-1, 1]) g.add(box(0.07, 0.9, 3.6, rail, s * 0.85, 2.0, 0.2));
    wheels(g, [-0.85, 0.85], [-1.2, 1.2], 0.38);
    this.model = { group: g };
    this.g.r3d.airport.add(g);
    this.mark = ring(0x38bdf8, 3.0); this.g.r3d.airport.add(this.mark);
  }

  _doorPoint() {
    const w = this.g.nav.toWorld('aircraft', -4.5, -6.0);       // pres de la porte cabine avant gauche
    return { x: w.x, z: w.z };
  }

  _onEnter() { this.mark.visible = true; }
  _onExit() { if (this.mark) this.mark.visible = false; }
  _tick(dt) { this.cool = Math.max(0, this.cool - dt); }

  _mission(dt) {
    const g = this.g, t = g.time;
    const f = this._doorPoint();
    this.mark.position.set(f.x, 0.09, f.z);
    this.mark.material.opacity = this.cool > 0 ? 0.2 : 0.55 + Math.sin(t * 4) * 0.3;
    if (this.cool > 0) return;
    const d = Math.hypot(this.x - f.x, this.z - f.z);
    if (d < 4.5 && Math.abs(this.v) < 0.6) {
      this.hold += dt;
      if (this.hold >= 2) {
        this.hold = 0; this.cool = 40;
        const n = 6 + Math.floor(Math.random() * 6);
        const A = g.arcade;
        A.giveCoins(8 + Math.floor(n / 2), { silent: true, xp: n });
        A.data.stats.stairsTrips = (A.data.stats.stairsTrips || 0) + 1; A.save();
        sfx.tada(); A.confetti(40);
        g.toast(`🪜 ${n} passagers descendent en toute sécurité ! +${8 + Math.floor(n / 2)} 🪙`, 3600, 'ok');
      }
    } else this.hold = Math.max(0, this.hold - dt * 2);
  }

  goal() {
    if (!this.active) return null;
    return { icon: '🪜', text: this.cool > 0 ? 'Passagers descendus ! Bravo.' : 'Amène l\'escalier à la porte de l\'avion (anneau bleu), puis arrête-toi.', target: this.cool > 0 ? null : this._doorPoint() };
  }
}
