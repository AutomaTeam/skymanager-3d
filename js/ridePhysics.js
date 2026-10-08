/* ============================================================
   ridePhysics.js — Physique « arcade » des montures (phase 40)

   Module PUR (aucune dependance a Three.js ni au DOM) : skate,
   trottinette, BMX, rollers et hoverboard roulent, sautent, tournent
   dans les airs, glissent sur les rails et enchainent des figures.

   Principe : on garde une vitesse monde (vx, vz). Chaque pas la
   decompose en vitesse avant (le long du cap) et vitesse laterale ;
   la laterale s'eteint selon l'adherence (`grip`) et rend une partie de
   son energie a l'avant, ce qui donne des virages qui « portent » sans
   jamais sembler sur des rails. Le sol est une carte de hauteurs
   (rideCourse.js) : on suit la surface, on la quitte en vol quand elle
   fuit plus vite que la chute (levres de rampe), on la retrouve a
   l'atterrissage.

   Les figures sont pensees pour un enfant : les rotations se
   « magnetisent » quand on lache le joystick et un atterrissage de
   travers est d'abord « un peu bancal » avant d'etre une chute (sans
   penalite autre que perdre le combo).
   ============================================================ */

import { WALL_STEP, WALL_SLOPE } from './rideCourse.js?v=1791465643';

const TAU = Math.PI * 2;
const PI = Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sgn = (v) => (v < 0 ? -1 : 1);

export const G = 19;                  // gravite arcade (m/s²)
const JUMP_CHARGE = 0.32;             // s : appui maximal pour un saut charge
const GRAB_DELAY = 0.14;              // s : appui en l'air avant de saisir la planche
const CHAIN_BANK_DELAY = 1.8;         // s a terre avant de « banquer » le combo
const CLEAN = 0.85, SKETCHY = 1.5;    // tolerances d'atterrissage (rad)
const WIPE_TIME = 1.1;                // s de chute

/* ---------------- Figures ---------------- */
const T = (id, name, pts, dur, anim) => ({ id, name, pts, dur, anim });

/* Catalogue des montures : physique + noms de figures.
   Directions de la figure : n = neutre, l = gauche, r = droite, u = haut, d = bas. */
export const RIDES = {
  skate: {
    id: 'skate', name: 'Skate', ico: '🛹', price: 0, color: '#38bdf8',
    desc: 'Le classique ! Ollie, kickflip, grind. Il faut pousser pour prendre de la vitesse.',
    top: 11, boost: 16.5, acc: 7.2, drag: 1.0, brake: 11, steer: 2.7, grip: 6.2, jump: 6.6, hover: 0,
    spinRate: 10.5, flipRate: 9.5, spinUnit: PI, hipH: 0.0,
    board: {
      n: T('kickflip', 'Kickflip', 100, 0.5, { roll: TAU }),
      l: T('heelflip', 'Heelflip', 100, 0.5, { roll: -TAU }),
      r: T('shove', 'Pop shove-it', 90, 0.5, { yaw: PI })
    },
    grab: { name: 'Indy grab', pts: 120 }, manual: 'Manual', slide: 'Boardslide'
  },
  scooter: {
    id: 'scooter', name: 'Trottinette', ico: '🛴', price: 0, color: '#fb923c',
    desc: 'Stable et facile ! Barspin, tailwhip, mains en l\'air. Parfaite pour débuter.',
    top: 9.8, boost: 14.5, acc: 7.6, drag: 1.3, brake: 12, steer: 2.9, grip: 8.0, jump: 6.2, hover: 0,
    spinRate: 9.5, flipRate: 8.5, spinUnit: TAU, hipH: 0.0,
    board: {
      n: T('barspin', 'Barspin', 110, 0.5, { bar: TAU }),
      l: T('tailwhip', 'Tailwhip', 150, 0.6, { yaw: TAU }),
      r: T('nohander', 'No-hander', 130, 0.7, { pose: 'nohand' }),
    },
    grab: { name: 'Superman', pts: 150, pose: 'super' }, manual: 'Wheelie', slide: 'Grind pegs'
  },
  bmx: {
    id: 'bmx', name: 'BMX', ico: '🚲', price: 25, color: '#f43f5e',
    desc: 'Rapide, avec de gros sauts ! Wheelie, tailwhip, backflip. Pour les vrais riders.',
    top: 13, boost: 19, acc: 6.4, drag: 0.8, brake: 10, steer: 2.35, grip: 5.6, jump: 7.1, hover: 0,
    spinRate: 9.0, flipRate: 9.0, spinUnit: TAU, hipH: 0.0,
    board: {
      n: T('barspin', 'Barspin', 110, 0.5, { bar: TAU }),
      l: T('tailwhip', 'Tailwhip', 160, 0.6, { yaw: TAU }),
      r: T('nohander', 'No-hander', 130, 0.7, { pose: 'nohand' }),
    },
    grab: { name: 'Superman', pts: 160, pose: 'super' }, manual: 'Wheelie', slide: 'Pegs grind'
  },
  rollers: {
    id: 'rollers', name: 'Rollers', ico: '🛼', price: 40, color: '#a78bfa',
    desc: 'Ça glisse très loin ! Fais des spins, des grabs, des figures stylées.',
    top: 11.8, boost: 17, acc: 5.6, drag: 0.45, brake: 8.5, steer: 2.5, grip: 4.2, jump: 6.4, hover: 0,
    spinRate: 11, flipRate: 9.5, spinUnit: PI, hipH: 0.0,
    board: {
      n: T('tuck', 'Tuck', 100, 0.6, { pose: 'tuck' }),
      l: T('spread', 'Spread eagle', 150, 0.7, { pose: 'spread' }),
      r: T('torque', 'Torque', 130, 0.6, { pose: 'torque' }),
    },
    grab: { name: 'Fishbrain', pts: 130, pose: 'grab' }, manual: 'Sur un pied', slide: 'Soul slide'
  },
  hover: {
    id: 'hover', name: 'Hoverboard', ico: '🛸', price: 70, color: '#22d3ee',
    desc: 'Il flotte ! Très rapide, il dérape en glissant. Spins et flips sont faciles.',
    top: 14.5, boost: 21, acc: 8.2, drag: 0.35, brake: 7.5, steer: 2.9, grip: 1.9, jump: 6.9, hover: 0.34,
    spinRate: 12, flipRate: 10.5, spinUnit: PI, hipH: 0.0,
    board: {
      n: T('spin', 'Board spin', 120, 0.55, { yaw: TAU }),
      l: T('flip', 'Flip board', 130, 0.55, { roll: TAU }),
      r: T('freeze', 'Hover freeze', 140, 0.7, { pose: 'spread' }),
    },
    grab: { name: 'Star grab', pts: 130, pose: 'grab' }, manual: 'Hover wheelie', slide: 'Hover grind'
  }
};
export const RIDE_IDS = Object.keys(RIDES);

/* Direction de la figure d'apres le joystick (turn > 0 = gauche, move > 0 = avant). */
export function trickDir(move, turn) {
  if (Math.abs(move) > 0.55 && Math.abs(move) >= Math.abs(turn)) return move > 0 ? 'u' : 'd';
  if (turn > 0.5) return 'l';
  if (turn < -0.5) return 'r';
  return 'n';
}

const spinPts = (units) => [0, 50, 150, 300, 520, 800, 1150][Math.min(units, 6)] + Math.max(0, units - 6) * 400;
const spinName = (units) => `${units * 180}°`;
const easeIO = (p) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));

/* ------------------------------------------------------------
   Etat et pas de simulation d'une monture.
   env = { course, resolve(x0, z0, x1, z1) -> { x, z, hit } }
   inp = { move, turn, jump, trick, boost }  (jump/trick = maintenus)
   ------------------------------------------------------------ */
export class RideBody {
  constructor(ride = 'skate') {
    this.setRide(ride);
    this.total = 0;
    this.best = 0;
    this.reset(0, 0, 0);
  }

  setRide(id) { this.R = RIDES[id] || RIDES.skate; this.id = this.R.id; }

  reset(x, z, h, speed = 0) {
    this.x = x; this.z = z; this.y = 0; this.h = h;
    this.vx = Math.sin(h) * speed; this.vz = Math.cos(h) * speed; this.vy = 0; this.vySurf = 0;
    this.yawRate = 0; this.lean = 0; this.pitch = 0;
    this.grounded = true; this.speed = speed; this.fs = speed;
    this.air = null; this.grind = null; this.manual = false;
    this.crouch = 0; this.jumpT = 0; this.jumpHeld = false; this.trickHeld = false; this.trickT = 0;
    this.wipe = 0; this.sketchy = 0; this.bump = 0;
    this.boost = Math.max(this.boost ?? 1, 0.4); this.boosting = false;
    this.chain = { pts: 0, mult: 1, n: 0, idle: 0, names: [] };
    this.events = [];
    this.pushT = 0;
    this.surfY = 0;
  }

  /* Visual : angle de rotation (cap + spin) et flip, pour le rendu. */
  get yaw() { return this.h + (this.air ? this.air.spin : 0); }

  _ev(e) { this.events.push(e); }

  _addPts(pts, name) {
    const c = this.chain;
    c.pts += pts; c.idle = 0;
    if (name) { c.n++; c.mult = clamp(1 + 0.5 * (c.n - 1), 1, 7); c.names.push(name); }
  }

  _bank() {
    const c = this.chain;
    const score = Math.round(c.pts * c.mult);
    if (score > 0) {
      this.total += score;
      if (score > this.best) this.best = score;
      this._ev({ t: 'bank', score, pts: c.pts, mult: c.mult, n: c.n });
    }
    this.chain = { pts: 0, mult: 1, n: 0, idle: 0, names: [] };
  }

  /* Pas de temps principal : sous-pas de 1/60 s au plus. */
  step(dt, inp, env) {
    this.events = [];
    const n = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this._sub(h, inp, env);
    return this.events;
  }

  _sub(dt, inp, env) {
    const R = this.R, course = env.course;
    const jumpDown = !!inp.jump, trickDown = !!inp.trick;
    const jumpRel = this.jumpHeld && !jumpDown;
    const trickPress = trickDown && !this.trickHeld;
    this.jumpHeld = jumpDown; this.trickHeld = trickDown;

    /* ----- Chute : on ne controle plus rien ----- */
    if (this.wipe > 0) {
      this.wipe -= dt;
      this.vx *= Math.exp(-7 * dt); this.vz *= Math.exp(-7 * dt);
      this._advance(dt, env, true);
      this.speed = Math.hypot(this.vx, this.vz);
      return;
    }

    /* ----- Turbo ----- */
    const wantBoost = !!inp.boost && this.boost > 0.04 && Math.abs(inp.move) + Math.abs(this.fs) > 0.1;
    if (wantBoost && !this.boosting) this._ev({ t: 'boost' });
    this.boosting = wantBoost;
    this.boost = clamp(this.boost + (wantBoost ? -dt / 3.6 : dt / 10), 0, 1);

    if (this.grind) { this._grindStep(dt, inp, env, jumpRel, trickPress); return; }

    if (this.grounded) this._groundStep(dt, inp, env, jumpDown, jumpRel, trickDown);
    else this._airStep(dt, inp, env, trickDown, trickPress);

    /* ----- Combo : il se « banque » quand on est calme a terre ----- */
    const c = this.chain;
    if (c.pts > 0 || c.n > 0) {
      if (this.grounded && !this.manual) {
        c.idle += dt;
        if (c.idle >= CHAIN_BANK_DELAY) this._bank();
      } else c.idle = 0;
    }
    this.bump = Math.max(0, this.bump - dt);
    this.sketchy = Math.max(0, this.sketchy - dt);
  }

  /* ---------------- Au sol ---------------- */
  _groundStep(dt, inp, env, jumpDown, jumpRel, trickDown) {
    const R = this.R, course = env.course;
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    const px = Math.cos(this.h), pz = -Math.sin(this.h);
    const fs0 = this.vx * fx + this.vz * fz;
    let fs = fs0;
    const move = inp.move, turn = inp.turn;
    const top = this.boosting ? R.boost : R.top;

    /* Accelerer, freiner ou rouler sur son erre. */
    if (move > 0.05) {
      if (fs < top) fs += R.acc * (this.boosting ? 1.8 : 1) * move * (0.3 + 0.7 * (1 - Math.max(0, fs) / top)) * dt;
      else fs -= ((fs - top) * 1.2 + 1.5) * dt;
      this.pushT += dt * (0.6 + Math.max(0, fs) / 6);
    } else if (move < -0.05) {
      if (fs > 0.25) fs = Math.max(0, fs + R.brake * move * dt);
      else fs = Math.max(-1.6, fs + 3 * move * dt);
    } else {
      const fr = Math.min(Math.abs(fs), (R.drag + 0.05 * Math.abs(fs)) * dt);
      fs -= sgn(fs) * fr;
    }
    /* Pente : on ralentit en montant, on accelere en descendant. */
    const sl = course.slopeAlong(this.x, this.z, fx, fz);
    fs -= G * 0.6 * sl * dt;
    this.vx += fx * (fs - fs0); this.vz += fz * (fs - fs0);

    /* Direction : plus vive a vitesse moyenne, plus douce tres vite. */
    const av = Math.abs(fs);
    const k = Math.min(1, 0.4 + av / 4.5) / (1 + Math.max(0, av - 6) * 0.05);
    const yawT = turn * R.steer * k * (fs < -0.3 ? -1 : 1);
    this.yawRate += (yawT - this.yawRate) * Math.min(1, dt * 9);
    this.h += this.yawRate * dt;

    /* Adherence : en tournant, la vitesse « glisse » de cote ; elle s'eteint selon le grip
       et rend un peu d'energie a l'avant. Un hoverboard (grip faible) derape longtemps. */
    const nfx = Math.sin(this.h), nfz = Math.cos(this.h), npx = Math.cos(this.h), npz = -Math.sin(this.h);
    let fs2 = this.vx * nfx + this.vz * nfz;
    const ls2 = this.vx * npx + this.vz * npz;
    const lsD = ls2 * Math.exp(-R.grip * dt);
    if (fs2 >= 0) fs2 += (Math.abs(ls2) - Math.abs(lsD)) * 0.5;
    this.vx = nfx * fs2 + npx * lsD; this.vz = nfz * fs2 + npz * lsD;
    const ls = lsD;

    this.lean += ((-turn * Math.min(1, av / R.top) * 0.5 - ls * 0.04) - this.lean) * Math.min(1, dt * 8);

    /* Saut : appui = on se prepare, relache = on saute (plus long = plus haut). */
    if (jumpDown) { this.jumpT = Math.min(JUMP_CHARGE, this.jumpT + dt); this.crouch = Math.min(1, this.jumpT / JUMP_CHARGE); }
    else if (!jumpRel) { this.crouch = Math.max(0, this.crouch - dt * 6); }
    if (jumpRel || (jumpDown && this.jumpT >= JUMP_CHARGE)) {
      const power = 1 + 0.42 * clamp(this.jumpT / JUMP_CHARGE, 0, 1);
      this.jumpT = 0; this.crouch = 0; this.jumpHeld = false;
      this._takeOff(R.jump * power, false);
    }
    if (!jumpDown) this.jumpT = 0;

    /* Manual / wheelie : on garde la figure appuyee a terre. */
    const wantManual = trickDown && this.grounded && Math.abs(fs) > 3 && this.crouch === 0;
    if (wantManual) {
      if (!this.manual) { this.manual = true; this.manualT = 0; this._ev({ t: 'trick', name: R.manual, pts: 0, kind: 'manual' }); }
      this.manualT += dt;
      this._addPts(70 * dt * this.chain.mult, null);
      if (this.chain.n === 0) this.chain.n = 1;
    } else if (this.manual) {
      this.manual = false;
      this._addPts(0, R.manual);
    }
    this.pitch += ((this.manual ? 0.5 : 0) - this.pitch) * Math.min(1, dt * 8);

    this._advance(dt, env, true);
    this.fs = this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h);
    this.speed = Math.hypot(this.vx, this.vz);
  }

  _newAir() {
    return { t: 0, spin: 0, spinV: 0, hold: 0, holdDir: 0, flip: 0, flipBase: 0, flipAnim: null, board: null, grab: null, pts: 0, tricks: [], peak: this.y };
  }

  _takeOff(vy, fromGrind) {
    this.grounded = false;
    this.vy = (fromGrind ? 0 : this.vySurf) + vy;
    this.air = this._newAir();
    this.manual = false;
    this._ev({ t: 'jump', power: vy });
  }

  /* ---------------- En l'air ---------------- */
  _airStep(dt, inp, env, trickDown, trickPress) {
    const R = this.R, a = this.air, course = env.course;
    a.t += dt;
    this.vy -= G * dt;

    /* Rotations. Un coup de joystick lateral dirige un peu en l'air ; une tenue de plus de
       0,2 s fait TOURNER (spin). Lache, la rotation se « magnetise » sur le demi-tour
       (ou le tour) le plus proche : on retombe droit sans effort. */
    const su = R.spinUnit;
    const dirIn = Math.abs(inp.turn) > 0.6 ? Math.sign(inp.turn) : 0;
    if (dirIn !== 0 && dirIn === a.holdDir) a.hold += dt; else { a.hold = 0; a.holdDir = dirIn; }
    const spinning = a.hold >= 0.2 || (a.holdDir !== 0 && Math.abs(a.spin) > 0.4);
    let spinT = 0;
    if (spinning && dirIn !== 0) spinT = dirIn * R.spinRate;
    else {
      const near = Math.round(a.spin / su) * su, d = near - a.spin;
      spinT = Math.abs(d) < 1.35 ? d * 7 : 0;
    }
    a.spinV += (spinT - a.spinV) * Math.min(1, dt * 10);
    a.spin += a.spinV * dt;
    if (a.vert) {
      /* demi-tour naturel au sommet : on se remet face a la direction du deplacement */
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > 0.6) {
        let d = Math.atan2(this.vx, this.vz) - this.h; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.h += clamp(d, -8 * dt, 8 * dt);
      }
    } else if (!spinning && Math.abs(inp.turn) > 0.05) {
      /* petit pilotage en l'air */
      const dh = inp.turn * 1.1 * dt;
      this.h += dh;
      const c = Math.cos(dh), sN = Math.sin(dh);
      const vx = this.vx * c + this.vz * sN, vz = -this.vx * sN + this.vz * c;
      this.vx = vx; this.vz = vz;
    }

    /* Flip : une bascule complete, animee (le joueur choisit juste le sens). */
    if (a.flipAnim) {
      const f = a.flipAnim;
      f.t += dt;
      const p = clamp(f.t / f.dur, 0, 1);
      a.flip = a.flipBase + f.dir * TAU * easeIO(p);
      if (p >= 1) { a.flipBase += f.dir * TAU; a.flipAnim = null; }
    }

    /* Figure de planche / de velo, ou flip : un appui, une figure (selon le joystick). */
    if (a.board) {
      a.board.t += dt;
      if (a.board.t >= a.board.def.dur) a.board = null;
    }
    if (trickPress && !a.board && !a.grab) {
      let dir = trickDir(inp.move, inp.turn);
      if (dir === 'u' || dir === 'd') {
        /* Un flip demande du temps de vol : sinon on fait la figure de planche (jamais une chute). */
        const surf = course.heightAt(this.x, this.z);
        const remain = (this.vy + Math.sqrt(Math.max(0, this.vy * this.vy + 2 * G * Math.max(0, this.y - surf)))) / G;
        const dur = 0.78 / (R.flipRate / 9);
        if (a.flipAnim || remain < dur * 0.92) { dir = 'n'; this._ev({ t: 'hint', text: 'flip' }); }
        else {
          const fd = dir === 'u' ? 1 : -1;
          a.flipAnim = { dir: fd, t: 0, dur };
          this._ev({ t: 'trick', name: fd > 0 ? 'Front flip' : 'Back flip', pts: 0, kind: 'flip' });
        }
      }
      if (dir !== 'u' && dir !== 'd') {
        const def = R.board[dir] || R.board.n;
        a.board = { def, t: 0 };
        a.pts += def.pts; a.tricks.push(def.name);
        this._ev({ t: 'trick', name: def.name, pts: def.pts, kind: 'board' });
      }
    }
    /* Grab : appui prolonge. */
    if (trickDown) {
      this.trickT += dt;
      if (this.trickT >= GRAB_DELAY && !a.board) {
        if (!a.grab) {
          a.grab = { t: 0 }; a.tricks.push(R.grab.name);
          this._ev({ t: 'trick', name: R.grab.name, pts: R.grab.pts, kind: 'grab' });
          a.pts += R.grab.pts;
        }
        a.grab.t += dt; a.pts += 40 * dt;
      }
    } else { this.trickT = 0; a.grab = null; }

    this.lean += (0 - this.lean) * Math.min(1, dt * 4);
    this.pitch += (0 - this.pitch) * Math.min(1, dt * 6);

    /* Deplacement : un peu de frottement de l'air. */
    this.vx *= Math.exp(-0.12 * dt); this.vz *= Math.exp(-0.12 * dt);
    this.y += this.vy * dt;
    if (this.y > a.peak) a.peak = this.y;
    this._advance(dt, env, false);

    /* Accrochage a un rail : on est au-dessus, on descend, on va dans le sens du rail. */
    if (this.vy < 2.5 && Math.hypot(this.vx, this.vz) > 2.5) {
      const hit = course.nearestRail(this.x, this.z, 0.95);
      if (hit && this.y - hit.y > -0.2 && this.y - hit.y < 0.9) {
        const r = hit.rail, vn = Math.hypot(this.vx, this.vz);
        const dir = (this.vx * r.dx + this.vz * r.dz) / vn;
        if (Math.abs(dir) > 0.4) { this._startGrind(hit, dir >= 0 ? 1 : -1); return; }
      }
    }

    /* Atterrissage. */
    const ground = course.heightAt(this.x, this.z);
    this.surfY = ground;
    if (this.y <= ground && this.vy <= 0.5) this._land(ground, env);
  }

  _land(ground, env) {
    const R = this.R, a = this.air;
    const su = R.spinUnit;
    const errS = Math.abs(a.spin - Math.round(a.spin / su) * su);
    const errF = Math.abs(a.flip - Math.round(a.flip / TAU) * TAU);
    const err = Math.max(errS, errF);
    const q = err <= CLEAN ? 'clean' : err <= SKETCHY ? 'sketchy' : 'crash';
    const units = Math.round(Math.abs(a.spin) / PI);
    const flips = Math.round(Math.abs(a.flip) / TAU);
    this.y = ground; this.vy = 0; this.vySurf = 0; this.grounded = true;
    this.air = null; this.trickT = 0;
    this.pitch = 0;
    const airT = a.t;

    if (q === 'crash') {
      this.wipe = WIPE_TIME;
      this.vx *= 0.25; this.vz *= 0.25;
      const lost = Math.round((this.chain.pts + a.pts) * this.chain.mult);
      this.chain = { pts: 0, mult: 1, n: 0, idle: 0, names: [] };
      this._ev({ t: 'land', quality: 'crash', airT, lost });
      return;
    }

    /* Points de la rotation, des flips, du temps de vol. */
    const gained = [];
    let pts = a.pts, n = a.tricks.length;
    if (units >= 1) { const sp = spinPts(units); pts += sp; n++; gained.push(spinName(units)); }
    if (flips >= 1) {
      const fp = 240 * flips + (flips > 1 ? 160 * (flips - 1) : 0);
      pts += fp; n++; gained.push((a.flip > 0 ? 'Front flip' : 'Back flip') + (flips > 1 ? ` x${flips}` : ''));
    }
    if (airT > 0.9) { pts += Math.round(120 * (airT - 0.8)); gained.push(`Air ${airT.toFixed(1)} s`); }
    const height = a.peak - ground;
    if (q === 'sketchy') {
      this.sketchy = 0.8;
      this.vx *= 0.7; this.vz *= 0.7;
      pts = Math.round(pts * 0.6);
    }
    if (pts > 0) {
      const c = this.chain; c.pts += pts; c.idle = 0;
      for (let i = 0; i < n; i++) { c.n++; }
      c.mult = clamp(1 + 0.5 * (c.n - 1), 1, 7);
      c.names.push(...a.tricks, ...gained);
    }
    this._ev({ t: 'land', quality: q, airT, height, pts, tricks: [...a.tricks, ...gained], units, flips });
  }

  /* ---------------- Rails ---------------- */
  _startGrind(hit, dir) {
    const r = hit.rail;
    this.grind = { rail: r, t: hit.t, dir, sp: Math.max(4, Math.hypot(this.vx, this.vz)), time: 0, styled: false, side: 0 };
    const a = this.air;
    /* la figure en cours est terminee proprement, le reste est conserve */
    const pend = a ? a.pts : 0;
    this.grindPend = pend;
    this.air = null; this.grounded = false; this.vy = 0; this.vySurf = 0;
    this.y = hit.y; this.manual = false;
    this._ev({ t: 'grind', name: this.R.slide });
  }

  _grindStep(dt, inp, env, jumpRel, trickPress) {
    const g = this.grind, r = g.rail;
    g.time += dt;
    g.sp = Math.max(3.5, g.sp - 0.7 * dt);
    g.t += g.dir * g.sp * dt / r.len;
    const rh = Math.atan2(r.dx * g.dir, r.dz * g.dir);
    /* le cap rejoint celui du rail */
    let d = rh - this.h; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.h += d * Math.min(1, dt * 14);
    this.x = r.x0 + r.dx * r.len * clamp(g.t, 0, 1);
    this.z = r.z0 + r.dz * r.len * clamp(g.t, 0, 1);
    this.y = r.y0 + (r.y1 - r.y0) * clamp(g.t, 0, 1);
    this.vx = r.dx * g.dir * g.sp; this.vz = r.dz * g.dir * g.sp;
    this.speed = g.sp; this.fs = g.sp;
    this.lean += (0 - this.lean) * Math.min(1, dt * 6);
    const c = this.chain;
    c.pts += 95 * dt + this.grindPend; this.grindPend = 0;
    if (c.n === 0) { c.n = 1; }
    c.idle = 0;
    if (trickPress && !g.styled) {
      g.styled = true; this._addPts(60, this.R.slide);
      this._ev({ t: 'trick', name: this.R.slide + ' stylé', pts: 60, kind: 'grind' });
    }
    g.side += (clamp(inp.turn, -1, 1) - g.side) * Math.min(1, dt * 8);
    const out = g.t < 0 || g.t > 1;
    if (jumpRel || out) {
      /* on quitte le rail avec un petit saut, l'elan est conserve */
      this.grind = null;
      this._grindOutName = null;
      const dirx = r.dx * g.dir, dirz = r.dz * g.dir;
      this.vx = dirx * Math.max(4.5, g.sp); this.vz = dirz * Math.max(4.5, g.sp);
      this.grounded = false;
      this.vy = jumpRel ? this.R.jump * 0.85 : 2.6;
      this.air = this._newAir();
      this._ev({ t: 'grindEnd', time: g.time });
    }
  }

  /* ---------------- Deplacement et collisions ---------------- */
  /* Avance de vx, vz * dt : murs et corps via env.resolve, relief via la carte de hauteurs. */
  _advance(dt, env, ground) {
    const course = env.course;
    const tx = this.x + this.vx * dt, tz = this.z + this.vz * dt;
    const r = env.resolve ? env.resolve(this.x, this.z, tx, tz) : { x: tx, z: tz, hit: false };
    let nx = r.x, nz = r.z;
    const d = Math.hypot(nx - this.x, nz - this.z);

    if (d < Math.hypot(tx - this.x, tz - this.z) - 1e-4) {
      /* Un mur ou une personne : on glisse, on perd de l'elan. */
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > 3.5 && this.bump <= 0) { this._ev({ t: 'bump', speed: sp }); this.bump = 0.5; }
      if (dt > 0) { this.vx = (nx - this.x) / dt * 0.8; this.vz = (nz - this.z) / dt * 0.8; }
    }

    const surf = course.heightAt(nx, nz);
    if (ground) {
      /* Les murs des rampes (cote, derriere) arretent la monture. */
      if (surf - this.y > WALL_STEP + WALL_SLOPE * d) {
        const sp = Math.hypot(this.vx, this.vz);
        if (sp > 3 && this.bump <= 0) { this._ev({ t: 'bump', speed: sp }); this.bump = 0.5; }
        this.vx *= 0.25; this.vz *= 0.25; this.speed = 0;
        return;
      }
      const ox = this.x, oz = this.z;
      this.x = nx; this.z = nz;
      const yBall = this.y + this.vySurf * dt - 0.5 * G * dt * dt;
      if (surf < yBall - 0.015 && (this.vySurf > 0.3 || this.y - surf > 0.06)) {
        /* On quitte la surface (levre de rampe, bord de boite) : envol balistique. */
        const pm = course.primAt(ox, oz);
        const hs = Math.hypot(this.vx, this.vz), slope = this.vySurf / Math.max(0.1, hs);
        this._takeOff(0, false);
        if (pm && pm.prim.type === 'quarter' && slope > 1.15) {
          /* Sortie « verticale » d'un quart de pipe : on monte presque tout droit et la courbe
             nous ramene vers la rampe, face a la descente. */
          const vt = Math.hypot(hs, this.vySurf), f = Math.sign(hs) || 1;
          const fx = Math.sin(this.h), fz = Math.cos(this.h);
          this.vy = 0.93 * vt; this.vx = -fx * 0.3 * vt * f; this.vz = -fz * 0.3 * vt * f;
          this.air.vert = true;
        }
        this.y = Math.max(this.y, surf);
        this.surfY = surf;
        return;
      }
      const vsNew = dt > 0 ? (surf - this.y) / dt : 0;
      this.vySurf = clamp(vsNew, -14, 14);
      this.y = surf; this.surfY = surf;
    } else {
      /* En l'air : un mur plus haut que nous nous arrete. */
      if (surf - this.y > 0.3) {
        this.vx *= 0.15; this.vz *= 0.15;
        nx = this.x; nz = this.z;
        if (this.bump <= 0) { this._ev({ t: 'bump', speed: 4 }); this.bump = 0.5; }
      }
      this.x = nx; this.z = nz;
    }
  }

  /* Infos pour le HUD / le rendu. */
  info() {
    const c = this.chain;
    return {
      speed: this.speed, air: !this.grounded && !this.grind, grind: !!this.grind, manual: this.manual,
      pts: Math.round(c.pts), mult: c.mult, n: c.n, wipe: this.wipe > 0, boost: this.boost
    };
  }

  /* Avancement de la figure de planche en cours : { def, p } (p = 0..1 lisse) ou null. */
  boardAnim() {
    const a = this.air;
    if (!a || !a.board) return null;
    return { def: a.board.def, p: easeIO(clamp(a.board.t / a.board.def.dur, 0, 1)) };
  }
}
