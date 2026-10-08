/* ============================================================
   fireTruck.js — Au feu les pompiers ! (mode Arcade)

   De temps en temps, une poubelle prend feu sur le tarmac ou les
   abords (une alarme retentit, la fleche montre la caserne). L'enfant
   court a la caserne, monte dans le camion de pompiers garé devant
   (« 🚒 CONDUIRE LE CAMION DE POMPIERS »), fonce jusqu'au feu sirene
   hurlante et l'arrose (« 💦 ARROSER LE FEU »). Feu eteint : pieces,
   confettis, trophee « Pompier courageux ».

   La conduite vient de vehicle.js (meme base que le tracteur).
   Si personne ne vient, les pompiers de l'aeroport l'eteignent au bout
   de quelques minutes : jamais d'echec penible.
   ============================================================ */

import * as THREE from 'three';
import { sfx } from './sfx.js?v=1791477663';
import { Vehicle } from './vehicle.js?v=1791477663';
import { buildFireTruck } from './airportLife.js?v=1791477663';

const ENTER_RANGE = 6;
const SPRAY_RANGE = 14;          // m entre le camion et le feu pour arroser
const FIRE_LIFE = 240;           // s avant que les pompiers de l'aeroport ne s'en chargent
const REWARD = 12;
/* Endroits ou un feu peut se declarer (tarmac, abords, parking). */
const SPOTS = [
  [300, 1160], [440, 1150], [210, 1000], [330, 915], [500, 905], [120, 1100], [310, 1215],
  [470, 1222], [330, 1335], [420, 1350], [150, 830], [300, 1000], [600, 1130], [280, 865]
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/* Poubelle en feu : flammes qui dansent et fumee qui monte. */
function buildFire() {
  const g = new THREE.Group();
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 1.1, 14), new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.7, metalness: 0.4 }));
  bin.position.y = 0.55; bin.castShadow = true;
  g.add(bin);
  const flames = [];
  const cols = [[0xff3b00, 1.6], [0xff8a00, 1.25], [0xffd000, 0.85]];
  cols.forEach(([c, s], i) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.5 * s, 1.6 * s, 10), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false }));
    f.position.set((i - 1) * 0.12, 1.1 + 0.8 * s, (i % 2) * 0.1);
    g.add(f);
    flames.push({ m: f, s, ph: i * 2.1 });
  });
  const smoke = [];
  const sm = new THREE.MeshBasicMaterial({ color: 0x6b7280, transparent: true, opacity: 0.45, depthWrite: false });
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), sm.clone());
    g.add(p);
    smoke.push({ m: p, t: i / 5 });
  }
  return { group: g, flames, smoke };
}

export class FireTruck extends Vehicle {
  constructor(game) {
    super(game, {
      name: 'CAMION', maxFwd: 9, maxRev: 3, wheelbase: 4.6, maxSteer: 0.55, reach: 4.4, hl: 4.2, hw: 1.3,
      cam: { look: 2, ahead: 5, height: 7.5, dist: 15, follow: 3, fov: 64 }
    });
    this.fire = null;            // { x, z, hp, t, vis }
    this.cd = 120 + Math.random() * 60;
    this.spray = 0;              // s d'arrosage restantes
    this.drops = [];
  }

  _parked() { const life = this.g.r3d.life; return life && life.parkedFire ? life.parkedFire[0] : null; }

  /* ---------------- Le feu ---------------- */
  _startFire() {
    const g = this.g, p = g.player.pos;
    const ac = g.ac.pos;
    const spots = SPOTS.filter(([x, z]) => g.nav.isWalkable(x, z) && !g.r3d.isInsideTerminal(x, z)
      && Math.hypot(x - ac.x, z - ac.z) > 30 && Math.hypot(x - p.x, z - p.z) > 35);
    if (!spots.length) { this.cd = 40; return; }
    const [x, z] = pick(spots);
    const vis = buildFire();
    vis.group.position.set(x, 0, z);
    g.r3d.airport.add(vis.group);
    this.fire = { x, z, hp: 1, t: FIRE_LIFE, vis };
    sfx.siren();
    g.toast('🔥 AU FEU ! Une poubelle brule. Cours a la caserne prendre le camion de pompiers !', 5200, 'warn');
    g.fun.say('Au feu ! Vite, le camion de pompiers est devant la caserne !', 3, 4200);
  }

  _endFire(byPlayer) {
    const g = this.g, f = this.fire;
    if (!f) return;
    this.fire = null;
    g.r3d.airport.remove(f.vis.group);
    this.cd = 180 + Math.random() * 120;
    if (!byPlayer) { g.toast('🚒 Les pompiers de l\'aeroport ont eteint le feu. La prochaine fois, ce sera toi !', 3600); return; }
    const A = g.arcade;
    A.giveCoins(REWARD, { silent: true, xp: 10 });
    A.data.stats.fires = (A.data.stats.fires || 0) + 1;
    A.event('fire');
    A.save();
    sfx.tada();
    A.confetti(90);
    g.toast(`🚒 Bravo pompier ! Le feu est eteint ! +${REWARD} 🪙`, 4200, 'ok');
    g.fun.say('Tu es un vrai pompier ! Tout le monde est en securite !', 3, 3600);
    A.checkBadges();
  }

  _animFire(dt) {
    const f = this.fire, t = this.g.time;
    const k = Math.max(0.15, f.hp);
    for (const fl of f.vis.flames) {
      const w = 1 + Math.sin(t * 13 + fl.ph) * 0.12;
      fl.m.scale.set(k * w, k * (1 + Math.sin(t * 9 + fl.ph) * 0.2), k * w);
      fl.m.position.y = 1.1 + 0.8 * fl.s * k;
    }
    for (const s of f.vis.smoke) {
      s.t = (s.t + dt * 0.25) % 1;
      s.m.position.set(Math.sin(s.t * 6 + t) * 0.4 * s.t, 2 + s.t * 7, Math.cos(s.t * 5) * 0.3 * s.t);
      s.m.scale.setScalar(0.6 + s.t * 2.2);
      s.m.material.opacity = 0.45 * (1 - s.t) * (0.4 + 0.6 * f.hp);
    }
  }

  /* ---------------- Vehicule ---------------- */
  near() {
    const g = this.g;
    if (this.active || g.driving || !g.arcade.on || g.rides.active || g.controlled || g.inTerminal) return null;
    const t = this._parked();
    if (!t || !t.visible) return null;
    const p = g.player.pos;
    const d = Math.hypot(t.position.x - p.x, t.position.z - p.z);
    return d < ENTER_RANGE ? { kind: 'vehEnter', veh: this, d, label: '🚒 CONDUIRE LE CAMION DE POMPIERS' } : null;
  }

  enter() {
    const g = this.g, t = this._parked();
    if (!t || this.active) return;
    if (!this.model) this._build();
    /* Garé nez au nord (-Z) : cap PI dans la convention du joueur. */
    this.x = t.position.x; this.z = t.position.z; this.h = Math.PI - t.rotation.y;
    t.visible = false;
    this.model.group.visible = true;
    this._seat();
    sfx.siren();
    g.toast(this.fire ? '🚒 Pin-pon ! Suis la fleche jusqu\'au feu, puis arrose-le !' : '🚒 Au volant du camion de pompiers ! Fais un tour… ou attends l\'alarme.', 4200, 'ok');
  }

  _onExit() {
    /* Le camion rentre tout seul a la caserne. */
    this.model.group.visible = false;
    for (const d of this.drops) d.visible = false;
    const t = this._parked();
    if (t) t.visible = true;
    this.spray = 0;
  }

  _build() {
    const g = this.g, root = g.r3d.airport;
    const blink = [];
    const grp = buildFireTruck(blink);
    this.model = { group: grp, bar: blink[0] && blink[0].mesh };
    if (this.model.bar) this.model.bar.material = this.model.bar.material.clone();   // materiau partage : on a le notre
    root.add(grp);
    const dm = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.8, depthWrite: false });
    const dg = new THREE.SphereGeometry(0.16, 8, 6);
    for (let i = 0; i < 24; i++) { const d = new THREE.Mesh(dg, dm); d.visible = false; root.add(d); this.drops.push(d); }
  }

  _afterMove() {
    /* Gyrophare bleu / rouge. */
    const bar = this.model.bar;
    if (!bar) return;
    const c = Math.sin(this.g.time * 10) > 0 ? 0x3b82f6 : 0xdc2626;
    bar.material.color.setHex(c);
    bar.material.emissive.setHex(c);
  }

  /* Le canon a eau, en haut a l'avant (avant du modele = -Z). */
  _nozzle() { return this.model.group.localToWorld(new THREE.Vector3(0, 3.4, -3.6)); }

  action() {
    const f = this.fire;
    if (!f || Math.abs(this.v) > 3) return null;
    return Math.hypot(f.x - this.x, f.z - this.z) < SPRAY_RANGE ? { label: '💦 ARROSER LE FEU' } : null;
  }

  doAction() {
    if (!this.action()) return;
    this.spray = 1.4;
    sfx.splash();
  }

  _mission(dt) {
    const f = this.fire;
    if (this.spray > 0) {
      this.spray -= dt;
      const from = this._nozzle();
      const to = f ? new THREE.Vector3(f.x, 1.4, f.z) : from.clone().add(new THREE.Vector3(Math.sin(this.h) * 10, -3, Math.cos(this.h) * 10));
      const t = this.g.time;
      this.drops.forEach((d, i) => {
        const u = ((t * 1.6 + i / this.drops.length) % 1);
        d.visible = true;
        d.position.lerpVectors(from, to, u);
        d.position.y += Math.sin(u * Math.PI) * 3;
      });
      if (f && Math.hypot(f.x - this.x, f.z - this.z) < SPRAY_RANGE + 2) {
        f.hp -= dt * 0.3;                         // ~3 jets pour eteindre
        if (f.hp <= 0) { this.spray = 0; this._endFire(true); }
      }
    } else for (const d of this.drops) d.visible = false;
  }

  update(dt) {
    const g = this.g;
    if (!g.arcade.on) return;
    super.update(dt);
    if (this.fire) {
      this.fire.t -= dt;
      this._animFire(dt);
      if (this.fire.t <= 0) this._endFire(false);
      return;
    }
    /* Pas d'incendie avant la fin du tutoriel, ni ailleurs que sur le tarmac. */
    const ready = g.arcade.data.tutorialDone || g.arcade.data.stats.flights >= 1;
    if (!ready || g.state !== 'HUB' || g.inTerminal || g._worldPaused) return;
    this.cd -= dt;
    if (this.cd <= 0) this._startFire();
  }

  goal() {
    const f = this.fire, g = this.g;
    if (!f || g.state !== 'HUB') return null;
    if (this.active) {
      return Math.hypot(f.x - this.x, f.z - this.z) < SPRAY_RANGE
        ? { icon: '💦', text: 'Arrete-toi et appuie sur ARROSER LE FEU !', target: { x: f.x, z: f.z } }
        : { icon: '🚒', text: 'Pin-pon ! Fonce jusqu\'au feu (suis la fleche) !', target: { x: f.x, z: f.z } };
    }
    if (g.driving) return null;
    const t = this._parked();
    return { icon: '🔥', text: 'AU FEU ! Cours a la caserne et monte dans le camion de pompiers !', target: t ? { x: t.position.x, z: t.position.z - 6 } : null };
  }
}
