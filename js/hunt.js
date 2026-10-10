/* ============================================================
   hunt.js — Cache-cache : les Coco caches (H06)
   Chaque semaine, 10 petits Coco 🦜 se cachent a l'aeroport (tires au sort parmi 30 cachettes,
   toujours les memes pour toute la semaine). On les trouve a pied. Pas de fleche : le chien
   (ou la puce « chaud / froid ») dit si on se rapproche. Chaque Coco = +3 pieces ;
   les 10 = +50 pieces et 1 ⭐. Renouvele tous les lundis (cle de semaine).
   Module du registre (js/registry.js).
   ============================================================ */

import * as THREE from 'three';
import { sfx } from './sfx.js?v=1791603808';
import { emojiSprite } from './groundFun.js?v=1791603808';
import { weekKey, seeded, TREASURE_SPOTS } from './arcadeData.js?v=1791603808';
import * as Save from './save.js?v=1791603808';

const STORE = 'skymanager.hunt';
const COUNT = 10;
/* 30 cachettes : les 24 des pieces cachees + 6 de plus pres du hall et du skatepark. */
const SPOTS = [...TREASURE_SPOTS, [345, 1196], [388, 1205], [172, 1100], [250, 1120], [545, 1215], [405, 1330]];

/* Les 10 cachettes de la semaine (deterministe pour une cle de semaine donnee). */
export function weekSpots(key) {
  const rnd = seeded('coco:' + key);
  const idx = SPOTS.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx.slice(0, COUNT);
}

/* Temperature selon la distance (m) au Coco le plus proche. */
export function warmth(d) {
  if (d < 9) return { ico: '🔥', txt: 'Tu brûles !' };
  if (d < 25) return { ico: '🌡️', txt: 'Chaud, chaud !' };
  if (d < 60) return { ico: '🙂', txt: 'Tiède…' };
  return { ico: '🧊', txt: 'Froid…' };
}

export class Hunt {
  constructor(game) {
    this.g = game;
    this.week = weekKey();
    this.data = Save.load(STORE, { week: '', got: [] });
    if (this.data.week !== this.week) this.data = { week: this.week, got: [] };
    this.spots = weekSpots(this.week);
    this.items = [];
    this._near = 999;
    this._dogT = 0;
    this._build();
  }

  save() { Save.write(STORE, this.data); }
  get found() { return this.data.got.length; }

  _build() {
    const g = this.g, root = new THREE.Group();
    root.name = 'hunt';
    this.spots.forEach((si, k) => {
      if (this.data.got.includes(si)) return;
      const p = SPOTS[si];
      const s = emojiSprite('🦜', 1.7);
      const y = g.r3d.groundHeight ? g.r3d.groundHeight(p[0], p[1]) : 0;
      /* cache : petit, pose au ras du sol, il ne se voit bien que de pres */
      s.position.set(p[0] + 1.2, y + 0.9, p[1] + 1.2);
      s.material.opacity = 0.9;
      root.add(s);
      this.items.push({ si, s, x: p[0] + 1.2, z: p[1] + 1.2, y: y + 0.9, ph: k });
    });
    g.r3d.scene.add(root);
    this.root = root;
  }

  update(dt) {
    const g = this.g;
    if (g.state === 'BOOT') return;
    this.root.visible = g.state === 'HUB';
    if (g.state !== 'HUB' || !this.items.length) { this._near = 999; return; }
    const p = g.player.pos, t = g.time;
    let best = 999;
    for (let k = this.items.length - 1; k >= 0; k--) {
      const o = this.items[k];
      o.s.position.y = o.y + Math.sin(t * 3 + o.ph) * 0.12;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < 2.4) { this._collect(o); this.root.remove(o.s); this.items.splice(k, 1); continue; }
      if (d < best) best = d;
    }
    this._near = best;
    /* le chien flaire quand on est tout pres */
    this._dogT -= dt;
    if (this._dogT <= 0 && best < 30 && g.pet && g.pet.adopted) {
      this._dogT = 7;
      try { g.pet._say('👃', 2.4); } catch (e) { /* chien facultatif */ }
    }
  }

  _collect(o) {
    const g = this.g, A = g.arcade;
    this.data.got.push(o.si);
    const n = this.data.got.length;
    sfx.sparkle();
    A.giveCoins(3, { silent: true });
    A.popup(`🦜 Coco trouvé ! ${n}/${COUNT}  +3 🪙`);
    A.confetti(14);
    if (n >= COUNT) {
      A.giveCoins(50, { silent: true, xp: 25 });
      A.giveStars(1);
      sfx.tada(); A.confetti(100);
      g.toast('🦜 Tous les Coco de la semaine ! Bonus +50 🪙 et 1 ⭐ — reviens lundi pour de nouvelles cachettes !', 6000, 'ok');
    }
    this.save();
  }

  /* Objectif : seulement quand on est deja dans le coin (jamais une fleche permanente), texte chaud / froid. */
  goal() {
    const g = this.g;
    if (g.state !== 'HUB' || !this.items.length || this._near > 80 || !g.arcade.data.tutorialDone || g.arcade.step) return null;
    const w = warmth(this._near);
    /* soft : passe apres la quete d'aventure, sauf tout pres d'une cachette. */
    return { icon: '🦜', text: `Cache-cache : ${w.ico} ${w.txt} (${this.found}/${COUNT} Coco)`, target: null, soft: this._near > 18 };
  }

  tips() {
    return this.items.length ? [`🦜 ${this.items.length} Coco se cachent cette semaine à l'aéroport : cherche-les à pied !`] : [];
  }
}
