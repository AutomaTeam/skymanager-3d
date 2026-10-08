/* ============================================================
   skyMissions.js — Missions aeriennes du mode Arcade (vague 3)

   Chaque mission est un petit jeu de 1 a 3 minutes qui se joue
   pendant le vol : on la choisit au tableau (avant le decollage),
   elle demarre au decollage et se termine par une medaille
   (bronze, argent, or) et des pieces. L'aide au pilotage reste
   active : elle s'oriente doucement vers la cible (« aimant »).

     Ballons    — eclate un maximum de ballons
     Course     — anneaux chronometres, avec fantome de son record
     Pompier    — eteins les feux de foret avec l'eau de l'avion
     Colis      — largue des colis a parachute sur les cibles
     Secours    — conduis un patient a l'hopital, en douceur
     Zoo        — transporte un animal (calme... ou fan d'acrobaties)
     Show       — enchaine les figures devant le public

   Le module ne dessine rien lui-meme : les objets 3D viennent de
   skyWorld.js, les boutons et le tableau de index.html.
   ============================================================ */

import * as THREE from 'three';
import { sfx } from './sfx.js?v=1791468897';
import { SkyWorld } from './skyWorld.js?v=1791468897';
import { HELIPAD } from './heliModel.js?v=1791468897';
import { ISLANDS } from './openWorld.js?v=1791468897';

const STORE = 'skymanager.sky';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const KTS = 1.94384;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const wrap = (a) => ((a + 540) % 360) - 180;

/* Mots interdits dans la banniere (remplaces par un coeur) : un message sur le fuselage doit rester gentil. */
const BAD_WORDS = ['merde', 'con', 'conne', 'connard', 'salope', 'pute', 'putain', 'cul', 'bite', 'zob', 'nul', 'debile', 'idiot', 'stupide', 'nazi', 'sexe', 'fdp', 'ntm', 'tg', 'chier', 'crotte'];
export function cleanBanner(raw) {
  const t = String(raw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 !'-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return 'COUCOU !';
  const bad = t.split(/[^a-z0-9]+/).some(w => w && BAD_WORDS.includes(w)) || BAD_WORDS.some(w => w.length > 4 && t.replace(/[^a-z]/g, '').includes(w));
  return bad ? '❤ GENTIL ❤' : t.toUpperCase().slice(0, 12);
}

/* Recompense par medaille : [aucune, bronze, argent, or] (pieces). */
const MEDAL_COINS = [4, 14, 28, 50];
const MEDAL_NAME = ['Participation', 'Bronze', 'Argent', 'Or'];
const MEDAL_ICO = ['🎗️', '🥉', '🥈', '🥇'];

const BALL_COLORS = [0xff4d6d, 0xffd23f, 0x4ade80, 0x38bdf8, 0xc084fc, 0xfb923c, 0xf472b6];

/* ============================================================
   Gabarit d'une mission
   ============================================================ */
class Mission {
  constructor(sky, def) {
    this.sky = sky; this.g = sky.g; this.def = def;
    this.t = 0;
    this.done = false;       // terminee (reussite ou temps ecoule)
    this.limit = def.limit;
  }
  get ac() { return this.g.ac; }
  get agl() { return this.g.ac.pos.y - this.g.ac.groundY; }
  get world() { return this.sky.world; }
  setup() {}
  update(dt) {}
  goal() { return { icon: this.def.ico, text: this.def.name, target: null }; }
  progressText() { return ''; }
  actionInfo() { return null; }      // { ico, label, count }
  action() {}
  onStunt(kind) {}
  target() { return null; }
  guide() { return null; }           // point d'attraction pour l'aide au pilotage
  dispose() {}
  result() { return { score: 0, medal: 0, lines: [] }; }
  timeLeft() { return this.limit ? Math.max(0, this.limit - this.t) : null; }
}

/* ------------------------------------------------------------
   Ballons : ils apparaissent devant l'avion, a sa hauteur.
   ------------------------------------------------------------ */
class BalloonMission extends Mission {
  setup() {
    this.total = 14; this.spawned = 0; this.popped = 0; this.missed = 0;
    this.balls = [];
    this.spawnT = 0;
  }
  _spawn() {
    const ac = this.ac, f = ac.forward();
    const h = Math.hypot(f.x, f.z) || 1, dx = f.x / h, dz = f.z / h;
    const dist = 480 + Math.random() * 240;
    const side = (Math.random() - 0.5) * 120;
    const x = ac.pos.x + dx * dist + (-dz) * side;
    const z = ac.pos.z + dz * dist + dx * side;
    const y = clamp(ac.pos.y + (Math.random() - 0.4) * 70, ac.groundY + 70, 900);
    const b = this.world.balloon({ x, y, z, color: pick(BALL_COLORS), size: 8 });
    b.bornAt = this.t;
    this.balls.push(b);
    this.spawned++;
  }
  update(dt) {
    const ac = this.ac;
    this.spawnT -= dt;
    if (this.spawned < this.total && this.balls.length < 4 && this.spawnT <= 0) { this._spawn(); this.spawnT = 0.8; }
    const f = ac.forward();
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      const dx = b.x - ac.pos.x, dy = b.y - ac.pos.y, dz = b.z - ac.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 36 + b.size) {
        this.popped++;
        this.world.pop(b.x, b.y, b.z, b.group.children[0].material.color.getHex());
        this.world.remove(b);
        this.balls.splice(i, 1);
        sfx.pop();
        this.sky.reward(1, `🎈 ${this.popped}`);
        this.sky.g.fun._boostGain(0.06);
      } else if (dx * f.x + dz * f.z < -140) {      // depasse sans etre eclate
        this.missed++;
        this.world.remove(b);
        this.balls.splice(i, 1);
      }
    }
    if (this.spawned >= this.total && !this.balls.length) this.done = true;
  }
  guide() {
    let best = null, bd = 1e9;
    const ac = this.ac, f = ac.forward();
    for (const b of this.balls) {
      const ahead = (b.x - ac.pos.x) * f.x + (b.z - ac.pos.z) * f.z;
      if (ahead < 40) continue;
      const d = Math.hypot(b.x - ac.pos.x, b.z - ac.pos.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best ? { x: best.x, y: best.y, z: best.z } : null;
  }
  target() { const g = this.guide(); return g ? { x: g.x, z: g.z } : null; }
  goal() { return { icon: '🎈', text: `Eclate les ballons ! (${this.popped}/${this.total})`, target: this.target() }; }
  progressText() { return `🎈 ${this.popped}/${this.total}`; }
  dispose() { this.balls.forEach(b => this.world.remove(b)); this.balls = []; }
  result() {
    const s = this.popped;
    return { score: s, medal: s >= 12 ? 3 : s >= 9 ? 2 : s >= 5 ? 1 : 0, lines: [`🎈 ${s} ballon${s > 1 ? 's' : ''} eclate${s > 1 ? 's' : ''} sur ${this.total}`] };
  }
}

/* ------------------------------------------------------------
   Course d'anneaux, avec fantome
   ------------------------------------------------------------ */
const CIRCUITS = {
  tour: {
    id: 'tour', name: 'Petit tour',
    pts: [[0, 60, 430], [0, 95, -380], [90, 135, -1250], [400, 165, -1900], [820, 175, -1700], [1060, 150, -900], [860, 120, -150], [430, 100, 430]]
  }
};

class RaceMission extends Mission {
  setup() {
    this.circ = CIRCUITS.tour;
    const P = this.circ.pts;
    this.hoops = P.map((p, i) => {
      const nx = P[Math.min(i + 1, P.length - 1)], pv = P[Math.max(i - 1, 0)];
      const dx = nx[0] - pv[0], dz = nx[2] - pv[2];
      const yaw = Math.atan2(dx || 0.001, dz || -1);
      return this.world.hoop({ x: p[0], y: p[1], z: p[2], yaw, radius: 46 });
    });
    this.idx = 0; this.splits = [];
    this._refresh();
    let L = 0;
    for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]);
    const v = this.ac.speeds.cruise / KTS;
    this.ideal = L / v + 14;
    this.limit = this.ideal * 2.4;
    this.rec = []; this.recT = 0;
    /* Fantome : meilleur temps de cet avion sur ce circuit. */
    const key = `${this.circ.id}:${this.ac.profile}`;
    const saved = this.sky.data.ghosts[key];
    this.ghost = null;
    if (saved && saved.s && saved.s.length > 10) {
      this.ghostData = saved;
      this.ghost = this.world.ghost();
    }
    this.key = key;
  }
  _refresh() {
    this.hoops.forEach((h, i) => h.setState(i < this.idx ? 'hidden' : i === this.idx ? 'next' : i <= this.idx + 2 ? 'later' : 'hidden'));
  }
  update(dt) {
    const ac = this.ac;
    /* enregistrement du vol (5 Hz) */
    this.recT += dt;
    if (this.recT >= 0.2) { this.recT = 0; this.rec.push([Math.round(ac.pos.x), Math.round(ac.pos.y), Math.round(ac.pos.z), Math.round(ac.heading)]); }
    /* lecture du fantome */
    if (this.ghost && this.ghostData) {
      const s = this.ghostData.s, f = this.t / 0.2, i = Math.floor(f);
      if (i + 1 < s.length) {
        const a = s[i], b = s[i + 1], k = f - i;
        this.ghost.group.position.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
        this.ghost.group.rotation.y = -THREE.MathUtils.degToRad(a[3] + wrap(b[3] - a[3]) * k);
      } else this.ghost.group.visible = false;
    }
    const h = this.hoops[this.idx];
    if (!h) { this.done = true; return; }
    const d = Math.hypot(ac.pos.x - h.x, ac.pos.y - h.y, ac.pos.z - h.z);
    if (d < h.radius) {
      this.splits.push(this.t);
      sfx.ring();
      this.sky.g.arcade.confetti(10);
      this.sky.reward(1, `🏁 ${this.idx + 1}/${this.hoops.length}`);
      this.sky.g.fun._boostGain(0.1);
      this.idx++;
      this._refresh();
      if (this.idx >= this.hoops.length) { this.done = true; this.finishT = this.t; }
    }
  }
  target() { const h = this.hoops[this.idx]; return h ? { x: h.x, z: h.z } : null; }
  guide() { const h = this.hoops[this.idx]; return h ? { x: h.x, y: h.y, z: h.z } : null; }
  goal() { return { icon: '🏁', text: `Passe dans les anneaux ! (${this.idx}/${this.hoops.length})`, target: this.target() }; }
  progressText() {
    const best = this.sky.data.best.race;
    return `🏁 ${this.idx}/${this.hoops.length}` + (best && best.time ? ` · record ${best.time.toFixed(1)}s` : '');
  }
  dispose() { this.hoops.forEach(h => this.world.remove(h)); if (this.ghost) this.world.remove(this.ghost); }
  result() {
    if (this.idx < this.hoops.length) return { score: this.idx, medal: this.idx >= 6 ? 1 : 0, lines: [`🏁 ${this.idx} anneaux sur ${this.hoops.length} — le temps est ecoule`] };
    const T = this.finishT, r = T / this.ideal;
    const medal = r <= 1.12 ? 3 : r <= 1.4 ? 2 : 1;
    const lines = [`🏁 Course terminee en ${T.toFixed(1)} s`];
    const best = this.sky.data.best.race;
    if (!best || !best.time || T < best.time) {
      lines.push('🏆 Nouveau record !');
      this.sky.data.best.race = Object.assign({}, best, { time: T });
      this.sky.data.ghosts[this.key] = { t: T, s: this.rec };
      this.sky.save();
    }
    return { score: Math.round(T * 10) / 10, medal, lines };
  }
}

/* ------------------------------------------------------------
   Pompier : l'eau tombe en cloche, un viseur montre l'impact.
   ------------------------------------------------------------ */
class FireMission extends Mission {
  setup() {
    const spots = [[-380, -260], [260, -1150], [-470, -1750], [560, -2250]];
    this.fires = spots.map(([x, z]) => this.world.fire({ x, z }));
    this.charges = 7;
    this.queue = 0; this.qT = 0;
    this.out = 0;
  }
  action() {
    if (this.charges <= 0 || this.queue > 0 || this.ac.onGround) return;
    this.charges--;
    this.queue = 9;
    sfx.swoosh(0.8, 700, 200);
  }
  actionInfo() { return { ico: '💧', label: 'EAU', count: this.charges }; }
  update(dt) {
    const ac = this.ac;
    if (this.queue > 0) {
      this.qT -= dt;
      if (this.qT <= 0) {
        this.qT = 0.07; this.queue--;
        const sp = 5;
        this.world.blob({
          x: ac.pos.x + (Math.random() - 0.5) * 4, y: ac.pos.y - 2, z: ac.pos.z + (Math.random() - 0.5) * 4,
          vx: ac.vel.x * 0.9 + (Math.random() - 0.5) * sp, vy: ac.vel.y * 0.4 - 1, vz: ac.vel.z * 0.9 + (Math.random() - 0.5) * sp
        });
      }
    }
    /* projectiles */
    for (const o of [...this.world.items]) {
      if (o.kind !== 'water') continue;
      this.sky.stepProjectile(o, dt, 'water');
      if (o.group.position.y <= 0.6) {
        for (const f of this.fires) {
          if (f.out) continue;
          if (Math.hypot(o.group.position.x - f.x, o.group.position.z - f.z) < 36) f.hit(0.15);
        }
        this.world.remove(o);
      }
    }
    for (const f of this.fires) {
      if (f.out && !f.counted) {
        f.counted = true; this.out++;
        this.world.steam(f.x, f.z);
        sfx.tada();
        this.sky.g.arcade.confetti(30);
        this.sky.reward(5, `🔥 ${this.out}/${this.fires.length}`);
        this.sky.say(this.out >= this.fires.length ? 'Tous les feux sont eteints ! Bravo !' : 'Un feu de moins !', 2);
      }
    }
    if (this.out >= this.fires.length) this.done = true;
    else if (this.charges <= 0 && this.queue <= 0 && !this.world.items.size) { this.done = true; }
  }
  _nearest() {
    const ac = this.ac, f = ac.forward();
    let best = null, bd = 1e9;
    for (const fr of this.fires) {
      if (fr.out) continue;
      const ahead = (fr.x - ac.pos.x) * f.x + (fr.z - ac.pos.z) * f.z;
      const d = Math.hypot(fr.x - ac.pos.x, fr.z - ac.pos.z);
      const score = d + (ahead < 0 ? 500 : 0);
      if (score < bd) { bd = score; best = fr; }
    }
    return best;
  }
  target() { const f = this._nearest(); return f ? { x: f.x, z: f.z } : null; }
  guide() { const f = this._nearest(); return f ? { x: f.x, y: 130, z: f.z } : null; }
  reticle() { return this.charges > 0 ? 'water' : null; }
  goal() { return { icon: '🔥', text: `Eteins les feux ! Place le viseur dessus. (${this.out}/${this.fires.length})`, target: this.target() }; }
  progressText() { return `🔥 ${this.out}/${this.fires.length} · 💧 ${this.charges}`; }
  dispose() { this.fires.forEach(f => this.world.remove(f)); for (const o of [...this.world.items]) if (o.kind === 'water') this.world.remove(o); }
  result() {
    const s = this.out;
    return { score: s, medal: s >= 4 ? 3 : s >= 3 ? 2 : s >= 2 ? 1 : 0, lines: [`🔥 ${s} feu${s > 1 ? 'x' : ''} eteint${s > 1 ? 's' : ''} sur ${this.fires.length}`] };
  }
}

/* ------------------------------------------------------------
   Colis a parachute sur des cibles
   ------------------------------------------------------------ */
class ParcelMission extends Mission {
  setup() {
    const spots = [[-300, -480], [330, -980], [-250, -1500], [450, -1950], [-60, -2350]];
    this.targets = spots.map(([x, z]) => this.world.beacon({ x, z, radius: 24, color: 0xffd23f, height: 300 }));
    this.parcels = 5; this.dropped = 0; this.score = 0; this.hits = 0;
    this.lastLines = [];
  }
  action() {
    if (this.parcels <= 0 || this.ac.onGround) return;
    const ac = this.ac;
    this.parcels--;
    this.dropped++;
    sfx.pop();
    this.world.parcel({ x: ac.pos.x, y: ac.pos.y - 3, z: ac.pos.z, vx: ac.vel.x, vy: Math.min(0, ac.vel.y), vz: ac.vel.z });
  }
  actionInfo() { return { ico: '🎁', label: 'LACHER', count: this.parcels }; }
  update(dt) {
    for (const o of [...this.world.items]) {
      if (o.kind !== 'parcel') continue;
      this.sky.stepProjectile(o, dt, 'parcel');
      if (o.group.position.y <= 1.2) {
        const px = o.group.position.x, pz = o.group.position.z;
        let dmin = 1e9;
        for (const t of this.targets) dmin = Math.min(dmin, Math.hypot(px - t.x, pz - t.z));
        const pts = dmin <= 14 ? 3 : dmin <= 28 ? 2 : dmin <= 50 ? 1 : 0;
        this.score += pts;
        if (pts) this.hits++;
        sfx.star(Math.max(1, pts));
        this.sky.g.arcade.popup(pts === 3 ? '🎯 PILE ! +3' : pts === 2 ? '👍 Bien ! +2' : pts === 1 ? '🙂 Pas loin ! +1' : '😅 Rate…');
        if (pts) this.sky.reward(pts, `🎁 ${this.score}`);
        this.world.pop(px, 4, pz, 0xffd23f);
        this.world.remove(o);
        /* la cible touchee de pres est « livree » */
        for (const t of this.targets) if (Math.hypot(px - t.x, pz - t.z) <= 28) { t.setColor(0x4ade80); }
      }
    }
    const flying = [...this.world.items].some(o => o.kind === 'parcel');
    if (this.parcels <= 0 && !flying) this.done = true;
  }
  _nearest() {
    const ac = this.ac, f = ac.forward();
    let best = null, bd = 1e9;
    for (const t of this.targets) {
      if (t.group.children[1].material.color.getHex() === 0x4ade80) continue;
      const ahead = (t.x - ac.pos.x) * f.x + (t.z - ac.pos.z) * f.z;
      const d = Math.hypot(t.x - ac.pos.x, t.z - ac.pos.z);
      const sc = d + (ahead < 0 ? 600 : 0);
      if (sc < bd) { bd = sc; best = t; }
    }
    return best;
  }
  target() { const t = this._nearest(); return t ? { x: t.x, z: t.z } : null; }
  guide() { const t = this._nearest(); return t ? { x: t.x, y: 150, z: t.z } : null; }
  reticle() { return this.parcels > 0 ? 'parcel' : null; }
  goal() { return { icon: '🎁', text: `Largue les colis sur les cibles ! (${this.score} pts)`, target: this.target() }; }
  progressText() { return `🎁 ${this.parcels} · ${this.score} pts`; }
  dispose() { this.targets.forEach(t => this.world.remove(t)); for (const o of [...this.world.items]) if (o.kind === 'parcel') this.world.remove(o); }
  result() {
    const s = this.score;
    return { score: s, medal: s >= 12 ? 3 : s >= 8 ? 2 : s >= 4 ? 1 : 0, lines: [`🎁 ${s} points sur 15 (${this.hits} colis bien places)`] };
  }
}

/* ------------------------------------------------------------
   Livraison douce : patient (secours) ou animal (zoo)
   ------------------------------------------------------------ */
const CARGOS = {
  rescue: [
    { ico: '🧑‍🦰', name: 'le patient', mode: 'calm', from: 'la maison', to: "l'hopital", say: ['Merci de voler doucement…', 'Aie ! Pas trop de virages !'] }
  ],
  zoo: [
    { ico: '🐧', name: 'le pingouin', mode: 'calm', from: 'la banquise', to: 'le zoo', say: ['Brrr ! Pas de secousses !', 'Oui oui ! Tout doux !'] },
    { ico: '🐼', name: 'le panda', mode: 'calm', from: 'la foret', to: 'le zoo', say: ['Miam… je dors… ne me reveille pas !', 'Ronron ! Doucement !'] },
    { ico: '🦁', name: 'le lion', mode: 'wild', from: 'la savane', to: 'le zoo', say: ['Grrr ! Je m\'ennuie… fais des acrobaties !', 'ROAAAR ! Encore un tonneau !'] },
    { ico: '🐘', name: 'l\'elephant', mode: 'calm', from: 'la savane', to: 'le zoo', say: ['Prout… euh, pardon ! Doucement !', 'Je suis lourd, tiens bien le manche !'] },
    { ico: '🐵', name: 'le singe', mode: 'wild', from: 'la jungle', to: 'le zoo', say: ['Ouh ouh ! Fais des tonneaux !', 'Aaah aaah ! Plus fort !'] },
    { ico: '🐨', name: 'le koala', mode: 'calm', from: 'l\'Australie', to: 'le zoo', say: ['Zzz… je m\'accroche… doucement !', 'Mon eucalyptus va tomber !'] }
  ]
};
export const ANIMALS = CARGOS.zoo;

class CarryMission extends Mission {
  setup() {
    const rescue = this.def.id === 'rescue';
    this.cargo = pick(CARGOS[rescue ? 'rescue' : 'zoo']);
    const A = rescue ? [-260, 70, -620] : [320, 70, -700];
    const B = rescue ? [520, 100, -2450] : [-430, 100, -2250];
    this.pick = this.world.hoop({ x: A[0], y: A[1], z: A[2], yaw: 0, radius: 55 });
    this.pick.setState('next');
    this.drop = this.world.hoop({ x: B[0], y: B[1], z: B[2], yaw: 0, radius: 55 });
    this.drop.setState('later');
    this.beaconA = this.world.beacon({ x: A[0], z: A[2], radius: 20, color: 0x4ade80, height: 260 });
    this.beaconB = this.world.beacon({ x: B[0], z: B[2], radius: 24, color: 0xff6b6b, height: 320 });
    this.phase = 0;
    this.mood = this.cargo.mode === 'wild' ? 20 : 100;
    this.stunts = 0;
    this.limit = rescue ? 190 : 200;
    this.sayT = 14;
  }
  onStunt() {
    if (this.phase < 1) return;
    this.stunts++;
    if (this.cargo.mode === 'wild') this.mood = clamp(this.mood + 36, 0, 100);
    else { this.mood = clamp(this.mood - 22, 0, 100); this.sky.say('Aaah ! Pas d\'acrobaties, ' + this.cargo.name + ' a peur !', 2); }
  }
  update(dt) {
    const ac = this.ac;
    const tgt = this.phase === 0 ? this.pick : this.drop;
    const d = Math.hypot(ac.pos.x - tgt.x, ac.pos.y - tgt.y, ac.pos.z - tgt.z);
    if (d < tgt.radius) {
      sfx.ring();
      this.sky.g.arcade.confetti(20);
      if (this.phase === 0) {
        this.phase = 1;
        this.pick.setState('done'); this.beaconA.group.visible = false;
        this.drop.setState('next');
        this.sky.say(`${this.cargo.ico} ${this.cargo.name} est a bord ! Direction ${this.cargo.to} !`, 3);
      } else {
        this.done = true; this.arrived = true;
        this.drop.setState('done');
      }
    }
    if (this.phase === 1) {
      /* l'humeur de la cargaison */
      const bank = Math.abs(ac.bankDeg);
      let drain = Math.max(0, bank - 28) * 0.9;
      if (ac.gLoad > 1.7 || ac.gLoad < 0.3) drain += 10;
      if (this.sky.g.fun.boosting) drain += 5;
      if (this.cargo.mode === 'calm') this.mood = clamp(this.mood - drain * dt + (drain < 0.1 ? 1.2 * dt : 0), 0, 100);
      else this.mood = clamp(this.mood - 2.5 * dt, 0, 100);
      this.sayT -= dt;
      if (this.sayT <= 0) { this.sayT = 16; this.sky.say(`${this.cargo.ico} ${pick(this.cargo.say)}`, 1, 3200); }
    }
    this.pick.group.visible = this.phase === 0;
    this.beaconA.group.visible = this.phase === 0;
    this.beaconB.group.visible = this.phase === 1;
  }
  target() { const t = this.phase === 0 ? this.pick : this.drop; return { x: t.x, z: t.z }; }
  guide() { const t = this.phase === 0 ? this.pick : this.drop; return { x: t.x, y: t.y, z: t.z }; }
  goal() {
    const c = this.cargo;
    const txt = this.phase === 0 ? `Va chercher ${c.name} ${c.ico} !`
      : c.mode === 'wild' ? `${c.ico} Fais des acrobaties pour amuser ${c.name} ! Puis direction ${c.to}.`
        : `Amene ${c.name} ${c.ico} a ${c.to} — vole en douceur !`;
    return { icon: c.ico, text: txt, target: this.target() };
  }
  progressText() { return this.phase === 0 ? `${this.cargo.ico} en route…` : `${this.cargo.ico} humeur ${Math.round(this.mood)}%`; }
  dispose() { [this.pick, this.drop, this.beaconA, this.beaconB].forEach(o => this.world.remove(o)); }
  result() {
    if (!this.arrived) return { score: 0, medal: 0, lines: [`${this.cargo.ico} Arrive trop tard… retente !`] };
    const m = this.mood, t = this.t / this.limit;
    let medal = m >= 80 ? 3 : m >= 55 ? 2 : m >= 25 ? 1 : 0;
    if (t > 0.85 && medal > 1) medal--;
    return { score: Math.round(m), medal, lines: [`${this.cargo.ico} ${this.cargo.name} est arrive : humeur ${Math.round(m)}% en ${Math.round(this.t)} s`] };
  }
}

/* ------------------------------------------------------------
   Show aerien : figures imposees devant le public
   ------------------------------------------------------------ */
class ShowMission extends Mission {
  setup() {
    this.center = { x: 80, z: -500 };
    this.radius = 780;
    this.crowd = this.world.beacon({ x: this.center.x, z: this.center.z, radius: 70, color: 0xf472b6, height: 500 });
    const kinds = ['roll', 'loop'];
    this.figs = [pick(kinds), 'roll', 'loop', pick(kinds), 'loop'];
    this.idx = 0; this.done0 = 0; this.score = 0; this.limit = 130;
    this.last = 0;
  }
  inZone() { return Math.hypot(this.ac.pos.x - this.center.x, this.ac.pos.z - this.center.z) < this.radius; }
  onStunt(kind) {
    if (this.done || this.idx >= this.figs.length) return;
    if (!this.inZone()) { this.sky.say('Pas ici ! Fais ta figure devant le public !', 2); return; }
    if (kind === this.figs[this.idx]) {
      this.idx++; this.done0++;
      const quick = this.t - this.last < 16;
      this.last = this.t;
      this.score += 10 + (quick ? 5 : 0);
      sfx.tada();
      this.sky.g.arcade.confetti(30);
      this.sky.g.arcade.popup('👏 Bravo la foule ! +' + (quick ? 15 : 10));
      this.sky.reward(4, `🎪 ${this.done0}/${this.figs.length}`);
      if (this.idx >= this.figs.length) this.done = true;
    } else {
      this.sky.say(`Le public attend ${this.figs[this.idx] === 'roll' ? 'un TONNEAU' : 'un LOOPING'} !`, 2);
    }
  }
  update(dt) {
    this.crowd.group.visible = true;
  }
  target() { return { x: this.center.x, z: this.center.z }; }
  guide() { return this.inZone() ? null : { x: this.center.x, y: this.ac.pos.y, z: this.center.z }; }
  goal() {
    const next = this.figs[this.idx];
    const name = next === 'roll' ? 'un TONNEAU 🌀' : 'un LOOPING 🔄';
    return { icon: '🎪', text: this.inZone() ? `Fais ${name} devant le public ! (${this.done0}/${this.figs.length})` : 'Reviens vole au-dessus du public (la colonne rose) !', target: this.target() };
  }
  progressText() { return `🎪 ${this.done0}/${this.figs.length} · ${this.score} pts`; }
  dispose() { this.world.remove(this.crowd); }
  result() {
    const s = this.done0;
    return { score: this.score, medal: s >= 5 ? 3 : s >= 4 ? 2 : s >= 2 ? 1 : 0, lines: [`🎪 ${s} figure${s > 1 ? 's' : ''} reussie${s > 1 ? 's' : ''} sur ${this.figs.length} — ${this.score} points`] };
  }
}

/* ------------------------------------------------------------
   Exploration : survole 3 iles de l'archipel
   ------------------------------------------------------------ */
class IslandMission extends Mission {
  setup() {
    const ow = this.g.openWorld;
    const seen = ow.data.islands;
    let pool = ISLANDS.slice().sort((a, b) => (seen.includes(a.id) ? 1 : 0) - (seen.includes(b.id) ? 1 : 0) + (Math.random() - 0.5) * 0.9);
    let pick3 = pool.slice(0, 3);
    /* ordre : du plus proche au plus lointain depuis le depart */
    let cur = { x: 0, z: 1380 }, order = [];
    while (pick3.length) {
      pick3.sort((a, b) => Math.hypot(a.x - cur.x, a.z - cur.z) - Math.hypot(b.x - cur.x, b.z - cur.z));
      const n = pick3.shift(); order.push(n); cur = n;
    }
    this.targets = order;
    this.hoops = order.map(i => this.world.hoop({ x: i.x, y: 170, z: i.z, yaw: 0, radius: 120 }));
    this.idx = 0;
    this.hoops.forEach((h, i) => h.setState(i === 0 ? 'next' : 'later'));
    let L = 0, p = { x: 0, z: 1380 };
    for (const i of order) { L += Math.hypot(i.x - p.x, i.z - p.z); p = i; }
    this.limit = L / (this.ac.speeds.cruise / KTS) * 2.2 + 50;
  }
  update(dt) {
    const h = this.hoops[this.idx], ac = this.ac;
    if (!h) { this.done = true; return; }
    if (Math.hypot(ac.pos.x - h.x, ac.pos.y - h.y, ac.pos.z - h.z) < h.radius) {
      sfx.ring(); this.g.arcade.confetti(25);
      this.sky.reward(6, `${this.targets[this.idx].ico} ${this.idx + 1}/${this.targets.length}`);
      h.setState('done');
      this.idx++;
      if (this.hoops[this.idx]) this.hoops[this.idx].setState('next');
      else this.done = true;
    }
  }
  target() { const i = this.targets[this.idx]; return i ? { x: i.x, z: i.z } : null; }
  guide() { const i = this.targets[this.idx]; return i ? { x: i.x, y: 170, z: i.z } : null; }
  goal() { const i = this.targets[this.idx]; return { icon: '🏝️', text: i ? `Cap sur ${i.name} ! (${this.idx}/${this.targets.length})` : 'Exploration terminee !', target: this.target() }; }
  progressText() { return `🏝️ ${this.idx}/${this.targets.length}`; }
  dispose() { this.hoops.forEach(h => this.world.remove(h)); }
  result() {
    const s = this.idx;
    return { score: s, medal: s >= 3 ? 3 : s >= 2 ? 2 : s >= 1 ? 1 : 0, lines: [`🏝️ ${s} ile${s > 1 ? 's' : ''} survolee${s > 1 ? 's' : ''} sur ${this.targets.length}`] };
  }
}

/* ------------------------------------------------------------
   Arc-en-ciel : traverse 4 arches colorees dans le ciel (G04)
   ------------------------------------------------------------ */
class RainbowMission extends Mission {
  setup() {
    const ac = this.ac, f = ac.forward();
    const h = Math.hypot(f.x, f.z) || 1;
    const dx = f.x / h, dz = f.z / h;
    this.arches = [];
    let px = ac.pos.x, pz = ac.pos.z, ang = Math.atan2(dx, dz);
    for (let i = 0; i < 4; i++) {
      ang += (i === 0 ? 0 : (i % 2 ? 0.55 : -0.5));
      const d = 520 + i * 60;
      px += Math.sin(ang) * d; pz += Math.cos(ang) * d;
      const y = clamp(ac.pos.y + 60 + i * 10, ac.groundY + 120, 450);
      this.arches.push(this.world.rainbow({ x: px, y, z: pz, yaw: ang, radius: 95 }));
    }
    this.idx = 0; this.limit = 150;
    this._refresh();
  }
  _refresh() { this.arches.forEach((a, i) => a.setState(i < this.idx ? 'done' : i === this.idx ? 'next' : i === this.idx + 1 ? 'later' : 'hidden')); }
  update(dt) {
    const a = this.arches[this.idx], ac = this.ac;
    if (!a) { this.done = true; return; }
    if (Math.hypot(ac.pos.x - a.x, ac.pos.y - a.y, ac.pos.z - a.z) < a.radius) {
      sfx.tada(); this.g.arcade.confetti(30);
      this.sky.reward(5, `🌈 ${this.idx + 1}/${this.arches.length}`);
      this.idx++;
      this._refresh();
      if (this.idx >= this.arches.length) this.done = true;
    }
  }
  target() { const a = this.arches[this.idx]; return a ? { x: a.x, z: a.z } : null; }
  guide() { const a = this.arches[this.idx]; return a ? { x: a.x, y: a.y, z: a.z } : null; }
  goal() { return { icon: '🌈', text: `Traverse l'arc-en-ciel ! (${this.idx}/${this.arches.length})`, target: this.target() }; }
  progressText() { return `🌈 ${this.idx}/${this.arches.length}`; }
  dispose() { this.arches.forEach(a => this.world.remove(a)); }
  result() {
    const s = this.idx;
    return { score: s, medal: s >= 4 ? 3 : s >= 3 ? 2 : s >= 1 ? 1 : 0, lines: [`🌈 ${s} arc${s > 1 ? 's' : ''}-en-ciel traverse${s > 1 ? 's' : ''} sur ${this.arches.length}`] };
  }
}

/* ------------------------------------------------------------
   Banniere : un message ecrit par l'enfant, remorque derriere l'avion (G04)
   ------------------------------------------------------------ */
const BANNER_PTS = [[0, 150, -700], [520, 175, -1300], [900, 150, -350], [330, 135, 560]];
class BannerMission extends Mission {
  setup() {
    this.text = cleanBanner(this.sky.data.banner);
    this.banner = this.world.banner(this.text);
    this.hoops = BANNER_PTS.map((p, i) => {
      const n = BANNER_PTS[(i + 1) % BANNER_PTS.length];
      return this.world.hoop({ x: p[0], y: p[1], z: p[2], yaw: Math.atan2(n[0] - p[0] || 0.001, n[2] - p[2]), radius: 120 });
    });
    this.idx = 0; this.limit = 190;
    this._refresh();
  }
  _refresh() { this.hoops.forEach((h, i) => h.setState(i < this.idx ? 'hidden' : i === this.idx ? 'next' : 'later')); }
  update(dt) {
    const ac = this.ac, f = ac.forward();
    const h = Math.hypot(f.x, f.z) || 1;
    /* la banniere flotte derriere l'avion (entre l'avion et la camera de poursuite, a 42 m), alignee sur le cap :
       lisible de cote (vues cote, orbite, photo), fine de dos pour ne pas cacher l'ecran. */
    this.banner.group.position.set(ac.pos.x - f.x / h * 26, ac.pos.y - 1.6, ac.pos.z - f.z / h * 26);
    this.banner.group.rotation.y = Math.atan2(f.x, f.z) - Math.PI / 2;
    const t = this.hoops[this.idx];
    if (!t) { this.done = true; return; }
    if (Math.hypot(ac.pos.x - t.x, ac.pos.y - t.y, ac.pos.z - t.z) < t.radius) {
      sfx.ring(); this.g.arcade.confetti(20);
      this.sky.reward(5, `🪁 ${this.idx + 1}/${this.hoops.length}`);
      this.idx++; this._refresh();
      if (this.idx >= this.hoops.length) this.done = true;
    }
  }
  target() { const t = this.hoops[this.idx]; return t ? { x: t.x, z: t.z } : null; }
  guide() { const t = this.hoops[this.idx]; return t ? { x: t.x, y: t.y, z: t.z } : null; }
  goal() { return { icon: '🪁', text: `Montre ton message a la foule ! (${this.idx}/${this.hoops.length})`, target: this.target() }; }
  progressText() { return `🪁 ${this.text} · ${this.idx}/${this.hoops.length}`; }
  dispose() { this.world.remove(this.banner); this.hoops.forEach(h => this.world.remove(h)); }
  result() {
    const s = this.idx;
    return { score: s, medal: s >= 4 ? 3 : s >= 3 ? 2 : s >= 1 ? 1 : 0, lines: [`🪁 Ton message « ${this.text} » a ete vu ${s} fois sur ${this.hoops.length}`] };
  }
}

/* ------------------------------------------------------------
   Sauvetage en helicoptere : treuille un randonneur sur une ile et ramene-le a l'helipad (G04)
   ------------------------------------------------------------ */
class WinchMission extends Mission {
  setup() {
    const pool = ISLANDS.slice().sort((a, b) => Math.hypot(a.x - HELIPAD.x, a.z - HELIPAD.z) - Math.hypot(b.x - HELIPAD.x, b.z - HELIPAD.z));
    this.isle = pool[Math.min(1, pool.length - 1)];
    this.spot = { x: this.isle.x + 40, z: this.isle.z };
    const gy = this.g.r3d.groundHeight ? this.g.r3d.groundHeight(this.spot.x, this.spot.z) : 0;
    this.hikerObj = this.world.hiker({ x: this.spot.x, z: this.spot.z, y: gy });
    this.mark = this.world.beacon({ x: this.spot.x, z: this.spot.z, radius: 38, color: 0xfacc15, height: 300 });
    this.pad = null;
    this.phase = 'find';       // find -> home
    this.hold = 0; this.need = 4;
    this.limit = 260;
  }
  _speed() { return this.ac.vel.length(); }
  _hovering(x, z, maxAgl, maxSpeed) {
    const ac = this.ac;
    return Math.hypot(ac.pos.x - x, ac.pos.z - z) < 42 && this.agl < maxAgl && this._speed() < maxSpeed;
  }
  update(dt) {
    if (this.phase === 'find') {
      if (this._hovering(this.spot.x, this.spot.z, 90, 14)) {
        this.hold += dt;
        if (this.hold >= this.need) {
          this.phase = 'home';
          this.world.remove(this.hikerObj); this.world.remove(this.mark);
          this.pad = this.world.beacon({ x: HELIPAD.x, z: HELIPAD.z, radius: 30, color: 0x4ade80, height: 300 });
          sfx.tada(); this.g.arcade.confetti(40);
          this.sky.reward(10, '🚁 Randonneur a bord !');
          this.hold = 0;
        }
      } else this.hold = Math.max(0, this.hold - dt * 2);
    } else if (this._hovering(HELIPAD.x, HELIPAD.z, 35, 10)) {
      this.hold += dt;
      if (this.hold >= 2) { this.arrived = true; this.done = true; }
    } else this.hold = Math.max(0, this.hold - dt * 2);
  }
  target() { return this.phase === 'home' ? { x: HELIPAD.x, z: HELIPAD.z } : { x: this.spot.x, z: this.spot.z }; }
  guide() { const t = this.target(); return { x: t.x, y: this.ac.groundY + 60, z: t.z }; }
  goal() {
    if (this.phase === 'find') return { icon: '🚁', text: this.hold > 0.2 ? `Reste immobile… ${Math.round(this.hold / this.need * 100)} %` : 'Vole vers le randonneur (colonne jaune), puis reste en vol stationnaire !', target: this.target() };
    return { icon: '🏥', text: this.hold > 0.2 ? 'Pose-toi doucement…' : 'Ramene le randonneur a l\'helipad (colonne verte) !', target: this.target() };
  }
  progressText() { return this.phase === 'find' ? '🚁 cherche le randonneur' : '🚁 retour a l\'helipad'; }
  dispose() { [this.hikerObj, this.mark, this.pad].forEach(o => o && this.world.remove(o)); }
  result() {
    if (!this.arrived) return { score: 0, medal: this.phase === 'home' ? 1 : 0, lines: [this.phase === 'home' ? '🚁 Randonneur treuille, mais le retour n\'est pas fini' : '🚁 Le randonneur attend toujours…'] };
    const r = this.t / this.limit;
    return { score: Math.round(this.t), medal: r < 0.45 ? 3 : r < 0.7 ? 2 : 1, lines: [`🚁 Randonneur sauve en ${Math.round(this.t)} s !`] };
  }
}

/* ------------------------------------------------------------
   Planeur : reste 3 minutes en l'air apres le largage (G01)
   ------------------------------------------------------------ */
class GlideMission extends Mission {
  setup() { this.air = 0; this.need = 180; this.limit = 0; }
  update(dt) {
    const ac = this.ac;
    if (ac.released && !ac.onGround) this.air += dt;
    if (this.air >= this.need) this.done = true;
  }
  goal() {
    if (!this.ac.released) return { icon: '🪂', text: 'Le remorqueur te monte a 500 m…', target: null };
    return { icon: '🪂', text: `Reste en l'air ! Cherche les ascendances (oiseaux, nuages). ${Math.round(this.air)}/${this.need} s`, target: null };
  }
  progressText() { return `🪂 ${Math.round(this.air)}/${this.need} s en vol libre`; }
  result() {
    const a = this.air;
    return { score: Math.round(a), medal: a >= 180 ? 3 : a >= 140 ? 2 : a >= 80 ? 1 : 0, lines: [`🪂 ${Math.round(a)} s en vol libre sur ${this.need}`] };
  }
}

/* ------------------------------------------------------------
   Formation : reste a cote de « Capitaine Coco » pour gagner des points (G02)
   3 niveaux de parcours selon ta meilleure medaille.
   ------------------------------------------------------------ */
const FORMATION_LEVELS = [
  { name: 'facile', turn: 0, wave: 0 },
  { name: 'moyen', turn: 3.2, wave: 0 },
  { name: 'difficile', turn: 6, wave: 14 }
];
class FormationMission extends Mission {
  setup() {
    const b = this.sky.data.best.formation;
    this.lvl = FORMATION_LEVELS[Math.min(2, (b && b.medal) || 0)];
    const ac = this.ac, f = ac.forward();
    this.hd = Math.atan2(f.x, f.z);                    // cap du chef (rad, 0 = +Z)
    this.speed = Math.max(40, ac.speeds.cruise / KTS * 0.82);
    this.baseY = clamp(ac.pos.y + 80, ac.groundY + 150, 420);
    this.leader = this.world.ghost();
    this.leader.group.children.forEach(m => { if (m.material) { m.material = m.material.clone(); m.material.color.setHex(0xfacc15); m.material.opacity = 0.9; } });
    this.leader.group.scale.setScalar(2.6);
    this.lx = ac.pos.x + Math.sin(this.hd) * 260; this.lz = ac.pos.z + Math.cos(this.hd) * 260; this.ly = ac.pos.y + 40;
    this.slot = this.world.hoop({ x: this.lx, y: this.ly, z: this.lz, radius: 34, color: 0x4ade80 });
    this.slot.setState('next');
    this.inside = 0; this.total = 60; this.limit = this.total + 6;
    this.turnDir = 1; this.phaseT = 0;
    this.tol = 52;
  }
  _slotPos() {
    /* 75 m derriere et 38 m a gauche du chef, un peu plus bas */
    const back = 75, side = 38;
    const fx = Math.sin(this.hd), fz = Math.cos(this.hd);
    return { x: this.lx - fx * back - fz * side, y: this.ly - 6, z: this.lz - fz * back + fx * side };
  }
  update(dt) {
    /* parcours du chef */
    this.phaseT += dt;
    if (this.phaseT > 9) { this.phaseT = 0; this.turnDir *= -1; }
    this.hd += (this.lvl.turn * Math.PI / 180) * this.turnDir * dt;
    this.lx += Math.sin(this.hd) * this.speed * dt; this.lz += Math.cos(this.hd) * this.speed * dt;
    const targetY = this.baseY + Math.sin(this.t * 0.4) * this.lvl.wave;
    this.ly += clamp(targetY - this.ly, -14 * dt, 14 * dt);
    this.leader.group.position.set(this.lx, this.ly, this.lz);
    this.leader.group.rotation.y = this.hd + Math.PI;
    const s = this._slotPos();
    this.slot.group.position.set(s.x, s.y, s.z);
    this.slot.x = s.x; this.slot.y = s.y; this.slot.z = s.z;
    const ac = this.ac;
    const d = Math.hypot(ac.pos.x - s.x, ac.pos.y - s.y, ac.pos.z - s.z);
    const ok = d < this.tol;
    this.slot.setState(ok ? 'done' : 'next');
    if (ok) {
      const before = Math.floor(this.inside / 5);
      this.inside += dt;
      if (Math.floor(this.inside / 5) > before) { sfx.ding(); this.sky.reward(2, '✈️ En formation !'); }
    }
    if (this.t >= this.total) this.done = true;
  }
  target() { return { x: this.lx, z: this.lz }; }
  guide() { const s = this._slotPos(); return { x: s.x, y: s.y, z: s.z }; }
  goal() { return { icon: '✈️', text: `Reste dans le rond vert, a cote du Capitaine Coco ! (${Math.round(this.inside)}/${this.total} s)`, target: this.target() }; }
  progressText() { return `✈️ ${Math.round(this.inside)} s · parcours ${this.lvl.name}`; }
  dispose() { this.world.remove(this.leader); this.world.remove(this.slot); }
  result() {
    const r = this.inside / this.total;
    return { score: Math.round(this.inside), medal: r >= 0.7 ? 3 : r >= 0.5 ? 2 : r >= 0.25 ? 1 : 0, lines: [`✈️ ${Math.round(this.inside)} s en formation sur ${this.total} (parcours ${this.lvl.name})`] };
  }
}

/* ------------------------------------------------------------
   Balade : l'avion te promene tout seul au-dessus de toutes les iles (G08).
   Aucune pression : pas de temps limite, l'aide te guide toujours ; reprends la main quand tu veux.
   ------------------------------------------------------------ */
class TourMission extends IslandMission {
  setup() {
    const order = [];
    let cur = { x: 0, z: 1380 };
    const left = ISLANDS.slice();
    while (left.length) {
      left.sort((a, b) => Math.hypot(a.x - cur.x, a.z - cur.z) - Math.hypot(b.x - cur.x, b.z - cur.z));
      const n = left.shift(); order.push(n); cur = n;
    }
    this.targets = order;
    this.hoops = order.map(i => this.world.hoop({ x: i.x, y: 190, z: i.z, yaw: 0, radius: 170 }));
    this.idx = 0; this.limit = 0;
    this.hoops.forEach((h, i) => h.setState(i === 0 ? 'next' : 'later'));
    this.sky.say('Balade ! Je te guide. Appuie sur l\'appareil photo pour prendre de belles photos !', 2, 4500);
  }
  guide() { const i = this.targets[this.idx]; return i ? { x: i.x, y: 190, z: i.z } : null; }
  goal() { const i = this.targets[this.idx]; return { icon: '🌅', text: i ? `Balade : cap sur ${i.name} ! (${this.idx}/${this.targets.length})` : 'Balade terminee, bravo !', target: this.target() }; }
  progressText() { return `🌅 ${this.idx}/${this.targets.length} iles`; }
  result() {
    const s = this.idx, n = this.targets.length;
    return { score: s, medal: s >= n ? 3 : s >= n - 2 ? 2 : s >= 2 ? 1 : 0, lines: [`🌅 ${s} ile${s > 1 ? 's' : ''} visitee${s > 1 ? 's' : ''} sur ${n}`] };
  }
}

/* ============================================================
   Catalogue
   ============================================================ */
export const MISSION_DEFS = [
  { id: 'balloons', ico: '🎈', name: 'Chasse aux ballons', brief: 'Eclate un maximum de ballons colores !', level: 1, limit: 110, cls: BalloonMission },
  { id: 'race',     ico: '🏁', name: 'Course d\'anneaux',  brief: 'Passe tous les anneaux le plus vite possible. Bats ton record !', level: 1, limit: 0, cls: RaceMission },
  { id: 'fire',     ico: '🔥', name: 'Pompier du ciel',    brief: 'Eteins les feux de foret avec l\'eau de ton avion.', level: 2, limit: 170, cls: FireMission },
  { id: 'parcel',   ico: '🎁', name: 'Livreur de colis',   brief: 'Largue les colis a parachute sur les cibles.', level: 2, limit: 170, cls: ParcelMission },
  { id: 'tour',     ico: '🌅', name: 'Balade des iles',    brief: 'L\'avion te promene au-dessus de toutes les iles. Zen et photos !', level: 1, limit: 0, cls: TourMission, always: true },
  { id: 'islands',  ico: '🏝️', name: 'Exploration des iles', brief: 'Survole 3 iles de l\'archipel, tout au nord-est !', level: 2, limit: 0, cls: IslandMission, glider: true },
  { id: 'show',     ico: '🎪', name: 'Show aerien',        brief: 'Enchaine tonneaux et loopings devant le public.', level: 3, limit: 130, cls: ShowMission, noHeli: true },
  { id: 'rescue',   ico: '🚑', name: 'Secours',            brief: 'Amene un patient a l\'hopital, en douceur et vite !', level: 3, limit: 190, cls: CarryMission },
  { id: 'glide',    ico: '🪂', name: 'Vol a voile',        brief: 'Planeur : reste 3 minutes en l\'air grace aux ascendances.', level: 3, limit: 0, cls: GlideMission, gliderOnly: true, glider: true },
  { id: 'rainbow',  ico: '🌈', name: 'Arc-en-ciel',        brief: 'Traverse 4 arcs-en-ciel dans le ciel !', level: 2, limit: 150, cls: RainbowMission, glider: true },
  { id: 'banner',   ico: '🪁', name: 'Banniere',           brief: 'Ecris un message et promene-le au-dessus de la foule.', level: 2, limit: 190, cls: BannerMission, needsText: true },
  { id: 'winch',    ico: '🚁', name: 'Treuillage',         brief: 'En helicoptere : sauve un randonneur sur une ile !', level: 2, limit: 260, cls: WinchMission, heliOnly: true },
  { id: 'formation', ico: '✈️', name: 'Vol en formation',  brief: 'Reste a cote du Capitaine Coco, 3 parcours.', level: 3, limit: 66, cls: FormationMission, noHeli: true },
  { id: 'zoo',      ico: '🐧', name: 'Transport d\'animaux', brief: 'Amene un animal au zoo. Chacun a ses gouts !', level: 4, limit: 200, cls: CarryMission }
];
export const defOf = (id) => MISSION_DEFS.find(d => d.id === id);

/* ============================================================
   Gestionnaire
   ============================================================ */
export class SkyMissions {
  constructor(game) {
    this.g = game;
    this.data = this._load();
    this.world = new SkyWorld(game.r3d.scene);
    this.armed = null;         // mission choisie, en attente du decollage
    this.flown = false;        // une mission a deja eu lieu pendant ce vol
    this.m = null;             // mission en cours
    this.over = null;          // { def, res } : mission terminee, en attente de l'affichage final
    this.lastResult = null;
    this.reticleMesh = null;
    this._bind();
  }

  get active() { return !!this.m; }
  get busy() { return !!(this.m || this.armed || this.flown); }

  _load() {
    const def = { best: {}, ghosts: {}, done: 0, animals: [] };
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (d) return Object.assign(def, d, { best: d.best || {}, ghosts: d.ghosts || {} });
    } catch (e) { /* ignore */ }
    return def;
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.data)); } catch (e) { /* quota */ } }

  _bind() {
    const a = $('btnAction');
    if (a) {
      a.addEventListener('pointerdown', (e) => { e.preventDefault(); this.action(); });
    }
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyX' && e.code !== 'Space') return;
      if (!this.g.arcade.on || this.g.state !== 'PILOT' || e.repeat) return;
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (this.m) { e.preventDefault(); this.action(); }
    });
    const c = $('skyResultOk');
    if (c) c.addEventListener('click', () => { $('skyResult').classList.add('hidden'); sfx.click(); });
  }

  /* ---------------- Tableau des missions ---------------- */
  cards() {
    const lvl = this.g.arcade.data.level;
    const heli = this.g.hangar.selected === 'helico';
    const gl = !!this.g.ac.glider;
    return MISSION_DEFS.filter(d => !(heli && d.noHeli) && !(!heli && d.heliOnly) && (gl ? d.glider : !d.gliderOnly)).map(d => {
      const b = this.data.best[d.id] || {};
      return {
        id: d.id, ico: d.ico, name: d.name, brief: d.brief, level: d.level,
        locked: lvl < d.level, medal: b.medal || 0
      };
    });
  }

  arm(id) {
    this.reset();
    this.armed = defOf(id) || null;
    /* Banniere : l'enfant ecrit son message avant de decoller (12 lettres, mots vilains remplaces). */
    if (this.armed && this.armed.needsText) {
      let t = null;
      try { t = window.prompt('Ecris ton message (12 lettres) :', this.data.banner || 'COUCOU !'); } catch (e) { /* pas de prompt */ }
      this.data.banner = cleanBanner(t === null ? this.data.banner : t);
      this.save();
    }
    if (this.armed) {
      this.g.fun.say(`${this.armed.ico} Mission « ${this.armed.name} » ! Decolle et c'est parti !`, 3, 4200);
      /* Depart express : si l'avion est deja pret, il decolle tout seul. */
    }
  }

  reset() {
    if (this.m) { this.m.dispose(); }
    this.m = null;
    this.armed = null;
    this.flown = false;
    this.over = null;
    this.world.clear();
    this._hideReticle();
    const g = this.g;
    if (g.assist) g.assist.guide = null;
    this._renderHud();
  }

  /* ---------------- Cycle de vie ---------------- */
  _begin() {
    const def = this.armed;
    this.armed = null;
    this.flown = true;
    this.m = new def.cls(this, def);
    this.m.setup();
    this.g.arcade.clearRing();
    this.g.arcade.popup(`${def.ico} ${def.name} !`);
    sfx.levelUp();
    this.g.fun.say(`${def.ico} C'est parti !`, 3, 2200);
  }

  update(dt) {
    const g = this.g;
    if (!g.arcade.on) return;
    this.world.update(g.time, dt);
    const ac = g.ac;
    if (g.state !== 'PILOT') {
      if (this.m || this.armed) this.reset();
      return;
    }
    if (this.armed && !ac.onGround && ac.pos.y - ac.groundY > 14) this._begin();
    if (!this.m) { this._renderHud(); return; }
    /* Fin de vol : la mission s'arrete a l'atterrissage. */
    if (ac.onGround && ac.touchdown) { this.finish(true); return; }
    this.m.t += dt;
    this.m.update(dt);
    /* l'aide au pilotage s'oriente vers la cible */
    if (g.assist) g.assist.guide = (g.fun.diff.magnet || this.m.def.id === 'show' || this.m.def.always) ? this.m.guide() : null;
    if (this.m.limit && this.m.t >= this.m.limit) this.m.done = true;
    if (this.m.done) { this.finish(false); return; }
    this._updateReticle();
    this._renderHud();
  }

  /* Pieces immediates pendant la mission (petits gains qui motivent). */
  reward(n, label) {
    this.g.arcade.giveCoins(n, { silent: true });
    this.g.arcade.popup(`${label} +${n} 🪙`);
  }

  say(t, prio = 1, ms = 3200) { this.g.fun.say(t, prio, ms); }

  onStunt(kind) { if (this.m) this.m.onStunt(kind); }

  action() { if (this.m) this.m.action(); }

  finish(aborted) {
    const m = this.m;
    if (!m) return;
    const def = m.def;
    const res = m.result();
    const unfinished = aborted && !m.done;
    this.m = null;
    m.dispose();
    this.world.clear();
    this._hideReticle();
    if (this.g.assist) this.g.assist.guide = null;
    this._renderHud();
    if (unfinished) {
      this.g.arcade.popup('Mission interrompue');
      return;
    }
    /* recompense */
    const coins = MEDAL_COINS[res.medal];
    this.g.arcade.giveCoins(coins, { silent: true, xp: 6 + res.medal * 6 });
    this.g.arcade.event('mission');
    if (res.medal >= 3) this.g.arcade.event('missionGold');
    const b = this.data.best[def.id] || {};
    if (res.medal > (b.medal || 0)) this.data.best[def.id] = Object.assign({}, b, { medal: res.medal, score: res.score });
    else if (res.score > (b.score || 0) && def.id !== 'race') this.data.best[def.id] = Object.assign({}, b, { score: res.score });
    this.data.done++;
    if (def.id === 'zoo' && m.arrived && m.cargo) {
      this.data.animals = this.data.animals || [];
      if (!this.data.animals.includes(m.cargo.ico)) {
        this.data.animals.push(m.cargo.ico);
        res.lines.push(`📖 Nouvel animal dans ton album : ${m.cargo.ico} !`);
      }
    }
    this.save();
    this.lastResult = { def, res, coins };
    sfx[res.medal >= 2 ? 'tada' : 'star'](res.medal);
    this.g.arcade.confetti(res.medal ? 40 + res.medal * 25 : 8);
    this._showResult();
    this.say(res.medal === 3 ? 'MEDAILLE D\'OR ! Tu es un champion !' : res.medal ? 'Mission reussie ! Bravo !' : 'Pas grave, on recommence ?', 3, 4200);
  }

  _showResult() {
    const { def, res, coins } = this.lastResult;
    const box = $('skyResult');
    if (!box) return;
    $('skyResMedal').textContent = MEDAL_ICO[res.medal];
    $('skyResTitle').textContent = res.medal ? `${MEDAL_NAME[res.medal]} !` : 'Mission terminee';
    $('skyResName').textContent = `${def.ico} ${def.name}`;
    $('skyResLines').innerHTML = res.lines.join('<br>') + `<br><b>+${coins} 🪙</b>`;
    box.classList.remove('hidden');
    clearTimeout(this._resT);
    this._resT = setTimeout(() => box.classList.add('hidden'), 6500);
  }

  /* Lignes pour le rapport de fin de vol. */
  reportLines() {
    const r = this.lastResult;
    this.lastResult = null;
    if (!r) return [];
    return [`${MEDAL_ICO[r.res.medal]} ${r.def.name} : ${r.res.medal ? MEDAL_NAME[r.res.medal] : 'termine'} (+${r.coins} 🪙)`];
  }

  /* ---------------- Interface en vol ---------------- */
  goal() {
    if (this.m) return this.m.goal();
    if (this.armed) return { icon: this.armed.ico, text: `Mission « ${this.armed.name} » : decolle !`, target: null };
    return null;
  }
  target() { return this.m ? this.m.target() : null; }

  _renderHud() {
    const chip = $('skyChip'), btn = $('btnAction');
    const m = this.m;
    if (chip) {
      const show = !!m && this.g.state === 'PILOT';
      chip.classList.toggle('hidden', !show);
      if (show) {
        const left = m.timeLeft();
        const t = left == null ? `${Math.floor(m.t / 60)}:${String(Math.floor(m.t % 60)).padStart(2, '0')}` : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
        const txt = `${m.def.ico} ${m.progressText()} · ⏱ ${t}`;
        if (chip.textContent !== txt) chip.textContent = txt;
        chip.classList.toggle('late', left != null && left < 20);
      }
    }
    if (btn) {
      const info = m && m.actionInfo ? m.actionInfo() : null;
      const show = !!info && this.g.state === 'PILOT';
      btn.classList.toggle('hidden', !show);
      if (show) {
        const html = `<span>${info.ico}</span><small>${info.label} ×${info.count}</small>`;
        if (btn.dataset.h !== html) { btn.dataset.h = html; btn.innerHTML = html; }
        btn.classList.toggle('dim', info.count <= 0);
      }
    }
  }

  /* ---------------- Viseur de largage ---------------- */
  stepProjectile(o, dt, kind) {
    const v = o.vel, p = o.group.position;
    if (kind === 'water') {
      v.x -= v.x * 0.1 * dt; v.z -= v.z * 0.1 * dt;
      v.y -= 9.8 * dt;
    } else {
      /* parachute : la vitesse horizontale s'eteint, la chute se stabilise */
      const k = Math.exp(-1.15 * dt);
      v.x *= k; v.z *= k;
      v.y += (-9 - v.y) * (1 - Math.exp(-1.6 * dt));
    }
    p.addScaledVector(v, dt);
    if (kind === 'parcel') o.group.rotation.y += dt * 0.8;
  }

  predictImpact(kind) {
    const ac = this.g.ac;
    const p = ac.pos.clone().add(new THREE.Vector3(0, -2, 0)), v = ac.vel.clone();
    if (kind === 'water') v.multiplyScalar(0.9); else v.y = Math.min(0, v.y);
    const o = { vel: v, group: { position: p, rotation: { y: 0 } } };
    for (let i = 0; i < 160 && p.y > 0.6; i++) this.stepProjectile(o, 0.1, kind);
    return { x: p.x, z: p.z };
  }

  _updateReticle() {
    const m = this.m;
    const kind = m && m.reticle ? m.reticle() : null;
    if (!kind || this.g.ac.onGround) { this._hideReticle(); return; }
    if (!this.reticleMesh) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
      const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }));
      const cross2 = cross.clone(); cross2.rotation.z = Math.PI / 2;
      [ring, ring2, cross, cross2].forEach(o => { o.renderOrder = 20; g.add(o); });
      g.rotation.x = -Math.PI / 2;
      this.reticleMesh = new THREE.Group();
      this.reticleMesh.add(g);
      this.g.r3d.scene.add(this.reticleMesh);
    }
    const imp = this.predictImpact(kind);
    this.reticleMesh.visible = true;
    this.reticleMesh.position.set(imp.x, 1, imp.z);
    const s = kind === 'water' ? 26 : 22;
    this.reticleMesh.scale.setScalar(s);
    const col = kind === 'water' ? 0x66c8ff : 0xffd23f;
    this.reticleMesh.children[0].children.forEach(o => o.material.color.setHex(col));
  }
  _hideReticle() { if (this.reticleMesh) this.reticleMesh.visible = false; }
}
