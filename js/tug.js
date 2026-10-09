/* ============================================================
   tug.js — Conduire le tracteur a bagages (mode Arcade)

   Le tracteur a bagages qui fait la navette entre le terminal et
   l'avion (airportLife.js) peut etre pris par l'enfant : « 🚜
   CONDUIRE LE TRACTEUR ». Il tire deux chariots articules.

   Mission en boucle :
     1. au quai bagages du terminal (porte cote piste), on charge
        jusqu'a 6 valises (le quai se remplit avec le temps) ;
     2. on les livre a la soute de l'avion : pieces, et les valises
        comptent comme chargees (rapport de vol, defis « bagages »).

   Conduite : voir vehicle.js (base commune des vehicules).
   ============================================================ */

import * as THREE from 'three';
import { sfx } from './sfx.js?v=1791559282';
import { LAYOUT } from './layout.js?v=1791559282';
import { Vehicle } from './vehicle.js?v=1791559282';

const ENTER_RANGE = 4;           // m pour monter dans le tracteur
const CART_LEN = 2.9;            // distance d'attelage entre deux elements
const BAGS_MAX = 6;
const DOCK_REFILL = 7;           // s par valise qui arrive au quai
const BAG_COLORS = [0xd94a3d, 0x2b6cb0, 0x2f9e44, 0x8e44ad, 0xf08c00, 0x0ea5e9];

/* Quai bagages : depart de la navette du tracteur ambiant (layout.js). */
const DOCK = { x: LAYOUT.routes.baggage[0][0], z: LAYOUT.routes.baggage[0][1] };

function mat(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.6, metalness: o.m ?? 0.1, emissive: o.e ?? 0, emissiveIntensity: o.ei ?? 0 }); }
function add(p, geo, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; }
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function wheels(g, pts, r, w) {
  const geo = new THREE.CylinderGeometry(r, r, w, 12), m = mat(0x1c1f24, { r: 0.95 });
  for (const [x, z] of pts) { const o = add(g, geo, m, x, r, z); o.rotation.z = Math.PI / 2; }
}

/* Modele : avant = -Z (meme convention que airportLife.js). */
function buildTug() {
  const g = new THREE.Group();
  add(g, box(1.7, 0.9, 2.4), mat(0xf5c518), 0, 0.85, 0);
  add(g, box(1.5, 0.9, 1.3), mat(0xf5c518), 0, 1.7, 0.2);
  add(g, box(1.4, 0.5, 0.05), mat(0x243447, { m: 0.3 }), 0, 1.75, -0.47);
  wheels(g, [[-0.85, -0.8], [0.85, -0.8], [-0.85, 0.8], [0.85, 0.8]], 0.42, 0.32);
  const beacon = add(g, new THREE.CylinderGeometry(0.12, 0.12, 0.2, 8), mat(0xffa500, { e: 0xffa500, ei: 1.2 }), 0, 2.3, 0.2);
  return { group: g, beacon };
}

function buildCart() {
  const c = new THREE.Group();
  add(c, box(1.9, 0.14, 2.5), mat(0x8a95a3, { m: 0.4 }), 0, 0.62, 0);
  add(c, box(1.9, 0.5, 0.06), mat(0x6b7686, { m: 0.4 }), 0, 0.9, -1.2);
  add(c, box(1.9, 0.5, 0.06), mat(0x6b7686, { m: 0.4 }), 0, 0.9, 1.2);
  wheels(c, [[-0.8, -0.9], [0.8, -0.9], [-0.8, 0.9], [0.8, 0.9]], 0.25, 0.2);
  const bags = [];
  for (let b = 0; b < 3; b++) {
    const bag = add(c, box(0.6, 0.42, 0.4), mat(BAG_COLORS[b], { r: 0.8 }), -0.5 + b * 0.5, 0.92, (b % 2 ? 0.4 : -0.4));
    bag.visible = false;
    bags.push(bag);
  }
  return { group: c, bags, x: 0, z: 0, h: 0 };
}

/* Anneau lumineux au sol (quai, soute). */
function ring(color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.2, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.08;
  m.visible = false;
  return m;
}

export class Tug extends Vehicle {
  constructor(game) {
    super(game, { name: 'TRACTEUR', maxFwd: 7.5, maxRev: 2.6, wheelbase: 2.1, reach: 1.6, hl: 1.3, hw: 0.95 });
    this.carts = [];
    this.bags = 0;
    this.dock = 3;               // valises qui attendent au quai
    this._dockT = 0;
    this.amb = null;             // tracteur ambiant remplace pendant qu'on conduit
  }

  /* Le tracteur ambiant (airportLife.js). */
  _ambient() {
    const life = this.g.r3d.life;
    return life ? life.movers.find(m => m.kind === 'baggage') : null;
  }

  /* Soute de l'avion : a droite de la coque, vers l'arriere, ramenee sur du sol praticable. */
  _hold() {
    const g = this.g;
    const w = g.nav.toWorld('aircraft', 9, 6);
    return g.nav.nearestWalkable(w.x, w.z, 12, 1);
  }

  /* Bouton contextuel : monter dans le tracteur s'il est tout pres. */
  near() {
    const g = this.g;
    if (this.active || g.driving || !g.arcade.on || g.rides.active || g.controlled || g.inTerminal) return null;
    const it = this._ambient();
    if (!it || it.g.visible === false) return null;
    const p = g.player.pos;
    const d = Math.hypot(it.mv.x - p.x, it.mv.z - p.z);
    return d < ENTER_RANGE ? { kind: 'vehEnter', veh: this, d, label: '🚜 CONDUIRE LE TRACTEUR' } : null;
  }

  enter() {
    const g = this.g, it = this._ambient();
    if (!it || this.active) return;
    if (!this.model) this._build();
    /* Cap : le tracteur ambiant avance vers (sin a, -cos a) ; ici (sin h, cos h). */
    this.x = it.mv.x; this.z = it.mv.z; this.h = Math.PI - it.mv.h;
    this.amb = it;
    it.g.visible = false;
    this._placeCarts(true);
    this.model.group.visible = true;
    for (const c of this.carts) c.group.visible = true;
    this.dockRing.visible = this.holdRing.visible = true;
    this._seat();
    sfx.honk();
    g.toast('🚜 Au volant ! Va chercher les valises au terminal (anneau bleu), puis livre-les a l\'avion (anneau orange).', 5200, 'ok');
    this._refreshBags();
  }

  _onExit() {
    const g = this.g;
    this.model.group.visible = false;
    for (const c of this.carts) c.group.visible = false;
    this.dockRing.visible = this.holdRing.visible = false;
    if (this.amb) this.amb.g.visible = true;
    this.amb = null;
    if (this.bags) g.toast(`🧳 Les ${this.bags} valise${this.bags > 1 ? 's' : ''} attendent dans le tracteur : reviens les livrer !`, 3200);
  }

  _build() {
    const g = this.g, root = g.r3d.airport;
    this.model = buildTug();
    root.add(this.model.group);
    this.carts = [0, 1].map(() => { const c = buildCart(); root.add(c.group); return c; });
    /* Couleurs de valises differentes d'un chariot a l'autre. */
    this.carts.forEach((c, i) => c.bags.forEach((b, k) => b.material.color.setHex(BAG_COLORS[(i * 3 + k) % BAG_COLORS.length])));
    this.dockRing = ring(0x38bdf8);
    this.holdRing = ring(0xf59e0b);
    root.add(this.dockRing, this.holdRing);
  }

  /* Chariots : chacun suit l'attelage du precedent (remorque simple). */
  _placeCarts(reset = false) {
    let px = this.x, pz = this.z, ph = this.h, back = 1.4 + CART_LEN / 2;
    for (const c of this.carts) {
      const hx = px - Math.sin(ph) * back, hz = pz - Math.cos(ph) * back;      // point d'attelage
      if (reset) { c.x = hx - Math.sin(ph) * CART_LEN / 2; c.z = hz - Math.cos(ph) * CART_LEN / 2; }
      const dx = hx - c.x, dz = hz - c.z, d = Math.hypot(dx, dz) || 1;
      c.h = Math.atan2(dx, dz);
      c.x = hx - dx / d * (CART_LEN / 2);
      c.z = hz - dz / d * (CART_LEN / 2);
      c.group.position.set(c.x, 0, c.z);
      c.group.rotation.y = c.h + Math.PI;
      px = c.x; pz = c.z; ph = c.h; back = CART_LEN / 2 + 0.4;
    }
  }

  _refreshBags() {
    let n = this.bags;
    for (const c of this.carts) for (const b of c.bags) { b.visible = n > 0; n--; }
  }

  _afterMove() {
    this._placeCarts();
    this.model.beacon.material.emissiveIntensity = Math.sin(this.g.time * 7) > 0 ? 1.6 : 0.2;
  }

  /* ---------------- Mission : quai -> soute ---------------- */
  _mission() {
    const g = this.g;
    const hold = this._hold();
    this.dockRing.position.set(DOCK.x, 0.08, DOCK.z);
    this.holdRing.position.set(hold.x, 0.08, hold.z);
    const t = g.time;
    this.dockRing.material.opacity = this.bags < BAGS_MAX && this.dock > 0 ? 0.55 + Math.sin(t * 4) * 0.3 : 0.2;
    this.holdRing.material.opacity = this.bags > 0 ? 0.55 + Math.sin(t * 4) * 0.3 : 0.2;

    const slow = Math.abs(this.v) < 2.5;
    /* Chargement au quai. */
    if (slow && this.bags < BAGS_MAX && Math.hypot(this.x - DOCK.x, this.z - DOCK.z) < 4.5) {
      const n = Math.min(BAGS_MAX - this.bags, Math.floor(this.dock));
      if (n > 0) {
        this.bags += n; this.dock -= n;
        this._refreshBags();
        sfx.pop();
        g.arcade.popup(`🧳 +${n} valise${n > 1 ? 's' : ''} chargee${n > 1 ? 's' : ''} (${this.bags}/${BAGS_MAX})`);
      } else if (!this._emptyMsg) {
        this._emptyMsg = true;
        g.arcade.popup('🧳 Pas de valise pour l\'instant… elles arrivent !');
      }
    } else this._emptyMsg = false;
    /* Livraison a la soute. */
    if (slow && this.bags > 0 && Math.hypot(this.x - hold.x, this.z - hold.z) < 5.5) this._deliver();
  }

  _deliver() {
    const g = this.g, n = this.bags, A = g.arcade, term = g.terminal;
    this.bags = 0;
    this._refreshBags();
    /* Elles comptent comme des bagages charges dans la soute (rapport de vol, defis). */
    term.stats.bags += n;
    term.bagsSinceFlight += n;
    term.save();
    const coins = n + (n >= BAGS_MAX ? 3 : 0);
    A.giveCoins(coins, { silent: true, xp: n });
    A.event('bag', n);
    A.data.stats.tugTrips = (A.data.stats.tugTrips || 0) + 1;
    A.event('tugTrip');
    A.save();
    sfx.tada();
    A.confetti(n >= BAGS_MAX ? 60 : 30);
    g.toast(`🚜 ${n} valise${n > 1 ? 's' : ''} dans la soute ! +${coins} 🪙${n >= BAGS_MAX ? ' (tracteur plein : bonus !)' : ''}`, 3200, 'ok');
  }

  /* Le quai se remplit meme quand on ne conduit pas. */
  update(dt) {
    if (!this.g.arcade.on) return;
    this._dockT += dt;
    if (this._dockT >= DOCK_REFILL) { this._dockT = 0; this.dock = Math.min(BAGS_MAX, this.dock + 1); }
    super.update(dt);
  }

  /* Objectif affiche (arcade.currentGoal) pendant qu'on conduit. */
  goal() {
    if (!this.active) return null;
    if (this.bags > 0) { const h = this._hold(); return { icon: '🚜', text: `Livre les ${this.bags} valise${this.bags > 1 ? 's' : ''} a la soute de l'avion (anneau orange) !`, target: { x: h.x, z: h.z } }; }
    return { icon: '🚜', text: `Va charger les valises au terminal (anneau bleu) : ${Math.floor(this.dock)} t'attendent.`, target: { x: DOCK.x, z: DOCK.z } };
  }
}
