/* ============================================================
   skySurprises.js — Les surprises du ciel (phase 140)

   En vol libre, une fois les 5 anneaux dorés passés, il ne restait
   qu'à rentrer se poser. Maintenant, toutes les 20 à 30 secondes,
   une SURPRISE apparaît devant l'avion, annoncée par Coco :
     🐦 l'oiseau doré à rattraper ;
     ☁️ le nuage qui pleut des pièces ;
     🌈 le méga-anneau arc-en-ciel (turbo plein + feu d'artifice) ;
     ⚡ la course éclair (4 anneaux en 35 s) ;
     🎈 la grappe de ballons à éclater.
   Jamais pendant une mission, la finale ou le tutoriel. Rien n'est
   perdu si on rate : une autre surprise arrive bientôt.
   Module du registre (js/registry.js) ; stats : arcade.data.stats.surprise.
   ============================================================ */

import * as THREE from 'three';
import { sfx } from './sfx.js?v=1791704088';
import { SkyWorld } from './skyWorld.js?v=1791704088';
import { RING_TOTAL } from './arcadeData.js?v=1791704088';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const basic = (color, o = {}) => new THREE.MeshBasicMaterial({
  color, transparent: o.op !== undefined, opacity: o.op ?? 1, side: o.side ?? THREE.FrontSide,
  depthWrite: o.dw ?? true, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending
});
const GOLD = 0xffcc33;
export const SURPRISE_KINDS = ['bird', 'cloud', 'mega', 'rush', 'balloons'];
const INTRO = {
  bird:     ['🐦', 'Un oiseau doré ! Rattrape-le !'],
  cloud:    ['☁️', 'Un nuage magique qui pleut des pièces ! Passe dessous !'],
  mega:     ['🌈', 'Le méga-anneau arc-en-ciel ! Vole dedans !'],
  rush:     ['⚡', 'Course éclair : 4 anneaux, vite vite !'],
  balloons: ['🎈', 'Des ballons perdus ! Éclate-les tous !']
};
const GOAL = {
  bird: 'Rattrape l\'oiseau doré !',
  cloud: 'Passe sous le nuage magique et attrape les pièces !',
  mega: 'Vole dans le méga-anneau arc-en-ciel !',
  rush: 'Course éclair : passe les anneaux !',
  balloons: 'Éclate les ballons !'
};

export class SkySurprises {
  constructor(game) {
    this.g = game;
    this.world = null;              // SkyWorld cree a la premiere surprise
    this.cur = null;                // { kind, t, limit, ... }
    this.cool = 8;
    this._bag = [];
    this.count = 0;                 // surprises reussies pendant ce vol
  }

  _w() {
    if (!this.world) this.world = new SkyWorld(this.g.r3d.scene);
    return this.world;
  }

  /* Une surprise peut-elle apparaitre maintenant ? */
  eligible() {
    const g = this.g, A = g.arcade, ac = g.ac;
    if (!A || !A.on || g.state !== 'PILOT' || !ac || ac.onGround) return false;
    if (!A.data.tutorialDone || A.step) return false;
    if (!g.flightLog || !g.flightLog.armed) return false;
    if (g.sky && g.sky.busy) return false;
    if (g.assist.landing || (g.assist.finalLike && g.assist.finalLike(ac))) return false;
    if ((A.ringsThisFlight || 0) < RING_TOTAL) return false;
    return ac.pos.y > 30;
  }

  update(dt) {
    const g = this.g;
    if (g.state === 'BOOT') return;
    if (this.world) this.world.update(g.time, dt);
    if (this.cur) {
      if (g.state !== 'PILOT' || g.ac.onGround || (g.sky && g.sky.busy) || g.assist.landing) { this.clear(); return; }
      this._step(dt);
      return;
    }
    if (!this.eligible()) { if (g.state !== 'PILOT' || g.ac.onGround) { this.cool = 8; this.count = 0; } return; }
    this.cool -= dt;
    if (this.cool <= 0) this.spawn();
  }

  /* Tirage sans remise : on voit les 5 surprises avant d'en revoir une. */
  _next() {
    if (!this._bag.length) {
      this._bag = SURPRISE_KINDS.slice();
      for (let i = this._bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this._bag[i], this._bag[j]] = [this._bag[j], this._bag[i]]; }
    }
    return this._bag.shift();
  }

  /* Repere devant l'avion : point a `d` m devant, decale de `side` m a droite. */
  _frame() {
    const ac = this.g.ac, f = ac.forward();
    const h = Math.hypot(f.x, f.z) || 1;
    const fx = f.x / h, fz = f.z / h;
    const at = (d, side = 0, dy = 0) => ({
      x: ac.pos.x + fx * d - fz * side,
      y: clamp(ac.pos.y + dy, 55, 900),
      z: ac.pos.z + fz * d + fx * side
    });
    return { at, yaw: Math.atan2(fx, fz) };
  }

  spawn(kind = this._next()) {
    this.clear();
    const g = this.g, w = this._w(), F = this._frame();
    const c = { kind, t: 0, limit: 35, got: 0 };
    if (kind === 'bird') {
      const p = F.at(300, 70, 30);
      c.bird = this._bird(p);
      c.limit = 40;
    } else if (kind === 'cloud') {
      const p = F.at(520, 0, 34);
      c.cloud = this._cloud(p);
      c.limit = 32;
    } else if (kind === 'mega') {
      const p = F.at(560, 0, 0);
      c.mega = this._mega(p, F.yaw);
      c.limit = 30;
    } else if (kind === 'rush') {
      c.hoops = [[330, -45, 0], [600, 45, 18], [870, -45, -8], [1140, 30, 14]].map(([d, s, dy]) => {
        const p = F.at(d, s, dy);
        return w.hoop({ x: p.x, y: p.y, z: p.z, yaw: F.yaw, radius: 32 });
      });
      c.hoops[0].setState('next');
      c.idx = 0;
      c.limit = 38;
    } else if (kind === 'balloons') {
      const COLS = [0xff4d6d, 0x38bdf8, 0xfacc15, 0x4ade80, 0xa78bfa, 0xfb923c, 0xf472b6];
      c.balloons = COLS.map((col, i) => {
        const p = F.at(420 + (i % 3) * 70, (i - 3) * 22, ((i * 37) % 5 - 2) * 9);
        return w.balloon({ x: p.x, y: p.y, z: p.z, color: col, size: 7 });
      });
      c.limit = 32;
    }
    this.cur = c;
    const [ico, txt] = INTRO[kind];
    sfx.sparkle();
    g.toast(`${ico} SURPRISE ! ${txt}`, 3200, 'ok');
    if (g.fun) g.fun.say(txt, 2, 3200);
  }

  clear() {
    const c = this.cur;
    this.cur = null;
    if (!c || !this.world) return;
    for (const o of [c.bird, c.cloud, c.mega, ...(c.hoops || []), ...(c.balloons || [])]) if (o) this.world.remove(o);
  }

  /* Fin de surprise : ok = reussie (recompense deja donnee au fil de l'eau). */
  _end(ok, bonus = 0, msg = '') {
    const g = this.g, A = g.arcade;
    this.clear();
    this.cool = 20 + Math.random() * 10;
    if (ok) {
      this.count++;
      if (bonus) A.giveCoins(bonus, { silent: true, xp: 5 });
      sfx.tada();
      A.confetti(60);
      A.event('surprise');
      g.toast(msg + (bonus ? ` +${bonus} 🪙` : ''), 3600, 'ok');
      if (g.fun) g.fun.say(this.count >= 3 ? 'Tu es trop fort ! Encore une surprise bientôt…' : 'Bravo ! Ouvre l\'œil, il y en aura d\'autres !', 2, 2600);
    } else {
      g.toast(msg || '💨 Raté ! Pas grave, une autre surprise arrive bientôt.', 3000);
    }
  }

  _near(o, r) {
    const p = this.g.ac.pos;
    return Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z) < r * ((this.g.fun && this.g.fun.diff.ring) || 1);
  }

  _step(dt) {
    const g = this.g, A = g.arcade, c = this.cur, ac = g.ac;
    c.t += dt;
    const left = c.limit - c.t;
    const t = g.time;
    if (c.kind === 'bird') {
      const b = c.bird, o = b.group.position;
      /* L'oiseau fuit l'avion en zigzag, un peu moins vite que lui : on le rattrape en le visant. */
      const sp = Math.hypot(ac.vel.x, ac.vel.z);
      const away = Math.atan2(o.x - ac.pos.x, o.z - ac.pos.z) + Math.sin(t * 0.8) * 0.55;
      const v = Math.max(12, sp * 0.6);
      o.x += Math.sin(away) * v * dt; o.z += Math.cos(away) * v * dt;
      o.y += ((clamp(ac.pos.y + 18, 55, 900) + Math.sin(t * 1.1) * 10) - o.y) * Math.min(1, dt * 0.5);
      b.group.rotation.y = away;
      b.flap(t);
      if (this._near(o, 30)) { A.giveCoins(15, { silent: true }); this.world.pop(o.x, o.y, o.z, GOLD); return this._end(true, 0, '🐦 Tu as attrapé l\'oiseau doré ! +15 🪙'); }
      if (Math.hypot(o.x - ac.pos.x, o.z - ac.pos.z) > 1300 || left <= 0) return this._end(false, 0, '🐦 L\'oiseau doré s\'est envolé… La prochaine fois !');
    } else if (c.kind === 'cloud') {
      const cl = c.cloud;
      cl.tick(dt, t);
      const gp = cl.group.position;
      for (const coin of cl.coins) {
        if (coin.got) continue;
        const cp = coin.m.position;
        if (!this._near({ x: gp.x + cp.x, y: gp.y + cp.y, z: gp.z + cp.z }, 20)) continue;
        coin.got = true; coin.m.visible = false; c.got++;
        sfx.coin(); A.giveCoins(1, { silent: true }); A._bumpCombo(); A.popup('🪙 +1');
      }
      const all = c.got >= cl.coins.length;
      const gone = this._behind(cl.group.position, 600);      // on peut faire demi-tour et repasser dessous
      if (all || gone || left <= 0) {
        if (c.got >= 3) return this._end(true, c.got >= 8 ? 6 : 2, `☁️ Pluie de pièces : ${c.got} attrapées !`);
        return this._end(false, 0, c.got ? `☁️ ${c.got} pièce${c.got > 1 ? 's' : ''} attrapée${c.got > 1 ? 's' : ''}. Passe juste dessous la prochaine fois !` : '');
      }
    } else if (c.kind === 'mega') {
      c.mega.tick(t);
      if (this._near(c.mega.group.position, 66)) {
        if (g.fun) g.fun.boostGauge = 1;
        A.giveCoins(10, { silent: true });
        this._fireworks(c.mega.group.position);
        return this._end(true, 0, '🌈 Méga-anneau ! Turbo plein ! +10 🪙');
      }
      if (this._behind(c.mega.group.position, 200) || left <= 0) return this._end(false);
    } else if (c.kind === 'rush') {
      const h = c.hoops[c.idx];
      if (this._near(h, 32)) {
        h.setState('done');
        sfx.ring(c.idx);
        A.giveCoins(2, { silent: true }); A.confetti(10);
        c.idx++;
        if (c.idx >= c.hoops.length) return this._end(true, 10, `⚡ Course éclair réussie en ${Math.round(c.t)} s !`);
        c.hoops[c.idx].setState('next');
        A.popup(`⚡ ${c.idx}/${c.hoops.length}`);
      } else if (this._behind(h, 160)) {
        /* anneau rate : on passe au suivant (pas de retour en arriere) */
        h.setState('hidden'); c.idx++;
        if (c.idx >= c.hoops.length) return this._end(c.got > 0, 0, '⚡ Course finie !');
        c.hoops[c.idx].setState('next');
      }
      if (left <= 0) return this._end(false, 0, '⚡ Trop tard ! Essaie de couper les virages.');
      c.got = c.hoops.filter(x => x.state === 'done').length;
    } else if (c.kind === 'balloons') {
      for (const b of c.balloons) {
        if (!b.alive || !this._near(b.group.position, 16)) continue;
        b.alive = false; c.got++;
        const p = b.group.position;
        this.world.pop(p.x, p.y, p.z, b.group.children[0].material.color.getHex());
        this.world.remove(b);
        sfx.pop(); A.giveCoins(1, { silent: true }); A.popup(`🎈 ${c.got}/${c.balloons.length}`);
      }
      const alive = c.balloons.filter(b => b.alive);
      if (!alive.length) return this._end(true, 6, '🎈 Tous les ballons éclatés !');
      if (alive.every(b => this._behind(b.group.position, 220)) || left <= 0) {
        return c.got >= 3 ? this._end(true, 0, `🎈 ${c.got} ballons éclatés !`) : this._end(false);
      }
    }
  }

  /* La cible est-elle derriere l'avion (de plus de `m` metres) ? */
  _behind(p, m) {
    const ac = this.g.ac, f = ac.forward();
    return (p.x - ac.pos.x) * f.x + (p.z - ac.pos.z) * f.z < -m;
  }

  /* ---------------- Objectif et fleche ---------------- */
  target() {
    const c = this.cur;
    if (!c) return null;
    let p = null;
    if (c.kind === 'bird') p = c.bird.group.position;
    else if (c.kind === 'cloud') p = c.cloud.group.position;
    else if (c.kind === 'mega') p = c.mega.group.position;
    else if (c.kind === 'rush') p = c.hoops[c.idx];
    else if (c.kind === 'balloons') {
      const ac = this.g.ac.pos;
      let best = 1e9;
      for (const b of c.balloons) if (b.alive) { const q = b.group.position, d = Math.hypot(q.x - ac.x, q.z - ac.z); if (d < best) { best = d; p = q; } }
    }
    return p ? { x: p.x, y: p.y, z: p.z } : null;
  }

  /* Appele par arcade.currentGoal aux commandes (pas par le registre : celui-ci ne sert qu'a pied). */
  flightGoal() {
    const c = this.cur;
    if (!c) return null;
    const s = Math.max(0, Math.ceil(c.limit - c.t));
    const prog = c.kind === 'cloud' ? `${c.got} 🪙 · ` : c.kind === 'rush' ? `${c.idx}/${c.hoops.length} · ` : c.kind === 'balloons' ? `${c.got}/${c.balloons.length} · ` : '';
    return { icon: INTRO[c.kind][0], text: `SURPRISE : ${GOAL[c.kind]} (${prog}${s} s)`, target: null };
  }

  tips() { return ['🎁 En vol libre, après les 5 anneaux dorés, des surprises apparaissent : oiseau doré, nuage à pièces, méga-anneau…']; }

  /* ---------------- Objets 3D (formes simples, MeshBasic) ---------------- */
  _bird(p) {
    const group = new THREE.Group();
    const gold = basic(GOLD), dark = basic(0xb7791f);
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), gold); body.scale.set(2.2, 1.9, 3.4);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), gold); head.position.set(0, 1.4, 3.2);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 6), basic(0xff7a00)); beak.rotation.x = Math.PI / 2; beak.position.set(0, 1.2, 5);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3, 4), dark); tail.rotation.x = -Math.PI / 2; tail.position.set(0, 0.4, -4.2);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(7, 14, 10), basic(0xfff1a8, { op: 0.22, add: true, dw: false }));
    const wingGeo = new THREE.PlaneGeometry(7, 3);
    wingGeo.translate(3.5, 0, 0);
    const wl = new THREE.Mesh(wingGeo, basic(GOLD, { side: THREE.DoubleSide }));
    const wr = new THREE.Mesh(wingGeo, wl.material);
    wl.rotation.x = wr.rotation.x = -Math.PI / 2;
    const pl = new THREE.Group(), pr = new THREE.Group();
    pl.add(wl); pr.add(wr); pr.scale.x = -1;
    pl.position.set(1.2, 0.8, 0.5); pr.position.set(-1.2, 0.8, 0.5);
    group.add(body, head, beak, tail, halo, pl, pr);
    group.scale.setScalar(2.8);
    group.position.set(p.x, p.y, p.z);
    return this._w().add({
      group,
      flap(t) { const a = Math.sin(t * 9) * 0.7; pl.rotation.z = a; pr.rotation.z = a; halo.scale.setScalar(1 + Math.sin(t * 5) * 0.08); }
    });
  }

  _cloud(p) {
    const group = new THREE.Group();
    const white = basic(0xffffff), glow = basic(0xffe680, { op: 0.35, add: true, dw: false });
    [[0, 0, 0, 22], [24, -3, 6, 16], [-24, -2, -4, 17], [10, 8, -10, 15], [-10, 7, 12, 14], [0, -6, 18, 13]].forEach(([x, y, z, r]) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), white); s.position.set(x, y, z); s.scale.y = 0.7; group.add(s);
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(40, 16, 10), glow); halo.scale.y = 0.6; group.add(halo);
    group.position.set(p.x, p.y, p.z);
    const coinGeo = new THREE.CylinderGeometry(3, 3, 0.7, 16), coinMat = basic(GOLD);
    const coins = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(coinGeo, coinMat);
      m.rotation.x = Math.PI / 2;
      group.add(m);
      const a = i * 2.4, r = 6 + (i % 4) * 6;
      coins.push({ m, ox: Math.cos(a) * r, oz: Math.sin(a) * r, ph: i / 14, got: false });
    }
    const o = {
      group, coins,
      tick(dt, t) {
        /* les pieces tombent du nuage sur 80 m, puis repartent du haut */
        for (const c of coins) {
          const k = (t * 0.16 + c.ph) % 1;
          c.m.position.set(c.ox, -10 - k * 80, c.oz);
          c.m.rotation.z = t * 4 + c.ph * 6;
        }
        halo.material.opacity = 0.28 + Math.sin(t * 3) * 0.08;
      }
    };
    o.tick(0, 0);
    return this._w().add(o);
  }

  _mega(p, yaw) {
    const group = new THREE.Group();
    const COLS = [0xff3b30, 0xff9500, 0xffcc00, 0x34c759, 0x0a84ff, 0x5e5ce6, 0xbf5af2];
    COLS.forEach((col, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(58 + i * 2.6, 1.5, 8, 56), basic(col));
      group.add(m);
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(58, 40), basic(0xffffff, { op: 0.08, add: true, dw: false, side: THREE.DoubleSide }));
    group.add(disc);
    group.position.set(p.x, p.y, p.z);
    group.rotation.y = yaw;
    return this._w().add({ group, tick(t) { group.rotation.z = t * 0.4; const k = 1 + Math.sin(t * 4) * 0.03; group.scale.set(k, k, 1); } });
  }

  /* Feu d'artifice : 5 eclatements colores autour du point. */
  _fireworks(p) {
    const w = this._w(), COLS = [0xff4d6d, 0xfacc15, 0x38bdf8, 0x4ade80, 0xa78bfa];
    COLS.forEach((col, i) => setTimeout(() => {
      if (!this.world) return;
      const a = i * 1.26;
      w.pop(p.x + Math.cos(a) * 40, p.y + 20 + i * 6, p.z + Math.sin(a) * 40, col);
      sfx.pop();
    }, i * 160));
  }
}

