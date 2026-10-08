/* ============================================================
   lightning.js — Eclairs d'orage (G05)
   Pendant un orage : un flash blanc doux sur l'ecran, puis le tonnerre quelques secondes apres.
   Jamais dangereux : les secousses de l'orage restent douces (voir environment.js, mode enfant).
   Module du registre (js/registry.js).
   ============================================================ */

import { sfx } from './sfx.js?v=1791469540';

export class Lightning {
  constructor(game) {
    this.g = game;
    this.t = 6 + Math.random() * 8;     // secondes avant le prochain eclair
    this.el = document.createElement('div');
    this.el.id = 'lightningFlash';
    this.el.className = 'lightning-flash';
    document.body.appendChild(this.el);
    this.flashes = 0;
  }

  update(dt) {
    const g = this.g;
    if (g.state === 'BOOT' || g._worldPaused) return;
    if (g.env.weather !== 'storm') { this.t = Math.max(this.t, 4); return; }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 7 + Math.random() * 11;
    this.flash();
  }

  /* Un ou deux flashs rapides, puis le tonnerre (plus tard = plus loin). */
  flash() {
    this.flashes++;
    const el = this.el;
    const hit = (op, ms) => { el.style.opacity = String(op); setTimeout(() => { el.style.opacity = '0'; }, ms); };
    hit(0.55, 90);
    if (Math.random() < 0.6) setTimeout(() => hit(0.4, 70), 170);
    const delay = 0.6 + Math.random() * 2.4;
    sfx.thunder(delay, 0.5 + Math.random() * 0.4);
  }
}
