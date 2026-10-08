/* ============================================================
   vehicle.js — Base commune des vehicules que l'enfant conduit
   (tracteur a bagages : tug.js, camion de pompiers : fireTruck.js)

   Direction de voiture : haut/bas = avancer/reculer, gauche/droite
   = braquer (on ne tourne qu'en roulant). Le vehicule s'arrete
   devant les murs, l'interieur du terminal, la coque de l'avion et
   les gens (et klaxonne). Pendant la conduite, le joueur « est » le
   vehicule : la camera, la fleche et les objectifs le suivent.

   Une sous-classe fournit : _build(), enter(), _onExit(), _afterMove(dt),
   _mission(dt), near(), goal(), et facultativement action()/doAction().
   ============================================================ */

import { sfx } from './sfx.js?v=1791468326';
import { collectBodies } from './bodies.js?v=1791468326';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Vehicle {
  constructor(game, cfg) {
    this.g = game;
    this.cfg = Object.assign({
      name: 'VEHICULE', maxFwd: 7.5, maxRev: 2.6, wheelbase: 2.1, maxSteer: 0.62,
      reach: 1.6,                  // m du centre a l'avant (test des obstacles)
      hl: 1.3, hw: 0.95,           // demi-longueur et demi-largeur (corps pour les PNJ)
      cam: { look: 1.6, ahead: 3.5, height: 6, dist: 12, follow: 3, fov: 62 }
    }, cfg);
    this.active = false;
    this.model = null;
    this.x = 0; this.z = 0; this.h = 0; this.v = 0;
    this._honkCd = 0;
    this._bumpCd = 0;
  }

  /* Corps pour collectBodies (meme convention de cap que les vehicules d'ambiance). */
  body() { return { x: this.x, z: this.z, h: Math.PI - this.h, hl: this.cfg.hl, hw: this.cfg.hw, ref: this }; }

  /* Le vehicule peut-il etre en (x, z) ? */
  _free(x, z) {
    const g = this.g;
    return g.nav.isWalkable(x, z) && !g.r3d.isInsideTerminal(x, z) && g.agents._clearOfHull(null, x, z);
  }

  /* Le joueur s'installe au volant. */
  _seat() {
    const g = this.g;
    this.active = true;
    this.v = 0;
    g.r3d.setPlayerVisible(false);
    g.player.rideCam = this.cfg.cam;
    g.player.camHeading = null;
  }

  exit() {
    const g = this.g;
    if (!this.active) return;
    this.active = false;
    /* On descend a cote du vehicule. */
    const side = this.cfg.hw + 1.3;
    const w = g.nav.nearestWalkable(this.x + Math.cos(this.h) * side, this.z - Math.sin(this.h) * side);
    g.player.pos.set(w.x, g.r3d.groundHeight(w.x, w.z), w.z);
    g.player.heading = this.h;
    g.player.rideCam = null;
    g.r3d.setPlayerVisible(true);
    sfx.pop();
    this._onExit();
  }

  /* Bouton contextuel pendant la conduite : l'action du vehicule s'il y en a une, sinon descendre. */
  button() {
    const a = this.action && this.action();
    if (a) return { kind: 'vehAction', veh: this, label: a.label };
    return { kind: 'vehExit', veh: this, label: `🚪 DESCENDRE DU ${this.cfg.name}` };
  }

  /* ---------------- Conduite (appelee par main.updateHub) ---------------- */
  drive(dt) {
    const g = this.g, C = this.cfg;
    const { move, turn } = g.hubCtl.read();
    /* Vitesse : accelere vers la consigne, freine fort si on lache ou change de sens. */
    const want = move > 0.05 ? move * C.maxFwd : move < -0.05 ? move * C.maxRev : 0;
    const acc = Math.sign(want - this.v) === Math.sign(this.v) || this.v === 0 ? 4 : 9;
    this.v += clamp(want - this.v, -acc * dt, acc * dt);
    /* En marche arriere, ca tourne a l'envers, comme une vraie voiture. */
    const nh = this.h + this.v / C.wheelbase * Math.tan(turn * C.maxSteer) * dt;
    const nx = this.x + Math.sin(nh) * this.v * dt, nz = this.z + Math.cos(nh) * this.v * dt;
    const dir = this.v >= 0 ? 1 : -1;
    const fx = nx + Math.sin(nh) * C.reach * dir, fz = nz + Math.cos(nh) * C.reach * dir;
    let blocked = !this._free(nx, nz) || !this._free(fx, fz);
    /* Des gens devant : on s'arrete et on klaxonne (gentiment). */
    if (!blocked && Math.abs(this.v) > 0.3) {
      for (const b of collectBodies(g)) {
        if (b.r === undefined || b.ref === g.player) continue;
        if (Math.hypot(b.x - fx, b.z - fz) < C.hw + 0.7) {
          blocked = true;
          this._honkCd -= dt;
          if (this._honkCd <= 0) { this._honkCd = 2.5; sfx.honk(); }
          break;
        }
      }
    }
    if (blocked) {
      if (Math.abs(this.v) > 3 && this._bumpCd <= 0) { sfx.bump(); this._bumpCd = 1; }
      this.v = 0;
    } else {
      this.x = nx; this.z = nz; this.h = nh;
    }
    this._bumpCd -= dt;

    const P = g.player;
    P.pos.set(this.x, 0, this.z);
    P.heading = this.h;
    P.moving = false;
    P.running = false;
    this.model.group.position.set(this.x, 0, this.z);
    this.model.group.rotation.y = this.h + Math.PI;
    this._afterMove(dt);
    this._mission(dt);
  }

  /* On ne conduit qu'au sol, dans le monde libre. */
  update() {
    if (this.active && this.g.state !== 'HUB') this.exit();
  }
}
