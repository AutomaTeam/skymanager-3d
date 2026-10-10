/* ============================================================
   seasonal.js — Evenements saisonniers (H07)
   Selon la date reelle :
     🎃 Halloween : du 15 octobre au 2 novembre (citrouilles a ramasser, fantomes qui flottent) ;
     🎄 Noel      : du 1er decembre au 5 janvier (cadeaux a ramasser, sapins).
   Pendant l'evenement, 10 objets sont caches sur l'aeroport (a pied). Chacun rapporte des pieces,
   les 10 trouves donnent un gros bonus et un objet de peinture. Les prises sont gardees par annee
   (skymanager.season) : on ne peut pas tout refaire en boucle, mais on ne perd jamais rien.
   Module du registre (js/registry.js). `seasonOf(date)` est pure.
   ============================================================ */

import * as THREE from 'three';
import { sfx } from './sfx.js?v=1791617374';
import { emojiSprite } from './groundFun.js?v=1791617374';
import * as Save from './save.js?v=1791617374';

const STORE = 'skymanager.season';

/* Rend 'halloween' | 'noel' | null pour une date. */
export function seasonOf(d = new Date()) {
  const m = d.getMonth() + 1, day = d.getDate();
  if ((m === 10 && day >= 15) || (m === 11 && day <= 2)) return 'halloween';
  if (m === 12 || (m === 1 && day <= 5)) return 'noel';
  return null;
}

const THEMES = {
  halloween: {
    ico: '🎃', name: 'Halloween', item: 'citrouille', decor: ['👻', '🦇', '🕸️'],
    hello: '🎃 Joyeux Halloween ! 10 citrouilles se cachent à l\'aéroport : trouve-les à pied !',
    done: '🎃 TOUTES les citrouilles ! Bonus +40 🪙 et une surprise de peinture !'
  },
  noel: {
    ico: '🎁', name: 'Noël', item: 'cadeau', decor: ['🎄', '⛄', '⭐'],
    hello: '🎄 Joyeux Noël ! 10 cadeaux se cachent à l\'aéroport : trouve-les à pied !',
    done: '🎁 TOUS les cadeaux ! Bonus +40 🪙 et une surprise de peinture !'
  }
};

/* 10 cachettes sur le tarmac et pres des batiments (memes points sains que les pieces cachees). */
const SPOTS = [[300, 1160], [440, 1150], [330, 915], [120, 1100], [310, 1215], [470, 1222], [278, 1160], [330, 1335], [100, 1408], [610, 1130]];
/* Decor flottant : autour du hall et de l'aire de stationnement. */
const DECOR_AT = [[352, 1190], [372, 1190], [335, 1160], [395, 1150], [310, 1180], [450, 1180], [355, 1130], [290, 1130]];

export class Seasonal {
  constructor(game) {
    this.g = game;
    /* ?season=halloween|noel force la saison (essais) ; ?season=off la coupe. */
    const force = new URLSearchParams(window.location.search).get('season');
    this.kind = force === 'off' ? null : THEMES[force] ? force : seasonOf();
    this.theme = this.kind ? THEMES[this.kind] : null;
    this.data = Save.load(STORE, { year: 0, kind: '', got: [], done: false, hello: false });
    const year = new Date().getFullYear();
    if (this.kind && (this.data.year !== year || this.data.kind !== this.kind)) this.data = { year, kind: this.kind, got: [], done: false, hello: false };
    this.items = [];
    this.decor = [];
    if (this.theme) this._build();
  }

  save() { Save.write(STORE, this.data); }

  _build() {
    const g = this.g, root = new THREE.Group();
    root.name = 'seasonal';
    SPOTS.forEach((p, i) => {
      if (this.data.got.includes(i)) return;
      const s = emojiSprite(this.theme.ico, 2.4);
      const y = g.r3d.groundHeight ? g.r3d.groundHeight(p[0], p[1]) : 0;
      s.position.set(p[0], y + 1.5, p[1]);
      root.add(s);
      this.items.push({ i, s, x: p[0], z: p[1], y: y + 1.5, ph: i * 0.9 });
    });
    DECOR_AT.forEach((p, i) => {
      const s = emojiSprite(this.theme.decor[i % this.theme.decor.length], 3.2);
      s.position.set(p[0], 5.5 + (i % 3), p[1]);
      root.add(s);
      this.decor.push({ s, y: 5.5 + (i % 3), ph: i * 1.3 });
    });
    g.r3d.scene.add(root);
    this.root = root;
  }

  get active() { return !!this.theme; }
  get found() { return this.data.got.length; }

  update(dt) {
    const g = this.g;
    if (!this.theme || g.state === 'BOOT') return;
    this.root.visible = g.state === 'HUB';
    if (g.state !== 'HUB') return;
    const t = g.time;
    for (const o of this.items) o.s.position.y = o.y + Math.sin(t * 2 + o.ph) * 0.25;
    for (const o of this.decor) o.s.position.y = o.y + Math.sin(t * 0.8 + o.ph) * 0.8;
    if (!this.data.hello && g.arcade.data.tutorialDone) {
      this.data.hello = true; this.save();
      setTimeout(() => { g.toast(this.theme.hello, 5600, 'ok'); g.fun.say(this.theme.hello, 2, 5200); }, 1200);
    }
    const p = g.player.pos;
    for (let k = this.items.length - 1; k >= 0; k--) {
      const o = this.items[k];
      if (Math.hypot(o.x - p.x, o.z - p.z) > 2.6) continue;
      this._collect(o);
      this.root.remove(o.s);
      this.items.splice(k, 1);
    }
  }

  _collect(o) {
    const g = this.g, A = g.arcade;
    this.data.got.push(o.i);
    const n = this.data.got.length;
    sfx.sparkle();
    A.giveCoins(4, { silent: true });
    A.popup(`${this.theme.ico} ${n}/${SPOTS.length}  +4 🪙`);
    A.confetti(12);
    if (n >= SPOTS.length && !this.data.done) {
      this.data.done = true;
      A.giveCoins(40, { silent: true, xp: 25 });
      const u = g.hangar.randomUnlock();
      sfx.tada(); A.confetti(100);
      g.toast(this.theme.done + (u ? ' ' + u.label + ' !' : ''), 6000, 'ok');
    }
    this.save();
  }

  goal() {
    if (!this.theme || this.g.state !== 'HUB' || this.data.done || !this.g.arcade.data.tutorialDone) return null;
    if (this.g.arcade.step) return null;
    const rest = this.items;
    if (!rest.length) return null;
    const p = this.g.player.pos;
    let best = rest[0], bd = 1e9;
    for (const o of rest) { const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < bd) { bd = d; best = o; } }
    /* seulement quand on est a une distance raisonnable : pas de fleche permanente vers un coin lointain */
    if (bd > 160) return null;
    return { icon: this.theme.ico, text: `${this.theme.name} : trouve les ${this.theme.item}s ! (${this.found}/${SPOTS.length})`, target: { x: best.x, z: best.z }, soft: bd > 25 };
  }

  tips() {
    return this.theme && !this.data.done ? [`${this.theme.ico} ${this.theme.name} : ${SPOTS.length - this.found} ${this.theme.item}(s) cachée(s) à l'aéroport !`] : [];
  }
}
