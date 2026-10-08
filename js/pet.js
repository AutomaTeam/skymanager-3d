/* ============================================================
   pet.js — Biscuit, le chien de compagnie (mode Arcade)

   Le chien echappe que l'enfant rattrape (groundFun.js) devient
   son compagnon : il le suit partout a pied, a roulettes et dans
   le terminal, s'assoit quand on s'arrete, et se laisse caresser.

   Surtout, il FLAIRE les pieces cachees du jour (arcade.js) : quand
   une piece est a moins de 30 m, il aboie et court se poster dessus.
   L'enfant n'a qu'a le suivre.

   Etat sauvegarde : localStorage « skymanager.pet ».
   ============================================================ */

import * as THREE from 'three';
import * as Save from './save.js?v=1791485856';
import { sfx } from './sfx.js?v=1791485856';
import { buildDog, emojiSprite } from './groundFun.js?v=1791485856';

const STORE = 'skymanager.pet';
const SNIFF_RANGE = 30;          // m autour du joueur ou Biscuit sent une piece
const PET_RANGE = 2.4;           // m pour le caresser
const PET_LINES = [
  '{n} remue la queue tres fort !',
  '{n} te leche la main. Beurk... mais trop mignon !',
  '{n} fait une roulade de joie !',
  '{n} te donne la patte !',
  '{n} est le plus heureux des chiens !'
];
/* ---------------- Astuces (H02) : 3 repetitions = apprise ---------------- */
const TRICKS = {
  sit:  { name: 'Assis',   ico: '⬇️', dur: 1.8 },
  lie:  { name: 'Couche',  ico: '🛌', dur: 2.2 },
  spin: { name: 'Tourne',  ico: '🔄', dur: 1.3 },
  five: { name: 'Haut-la', ico: '✋', dur: 1.6 }
};
const LEARN = 3;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export class Pet {
  constructor(game) {
    this.g = game;
    this.data = this._load();
    this.dog = null;
    this.x = 0; this.z = 0; this.h = 0;
    this.idle = 0;               // s passees a l'arret (il s'assoit)
    this.joy = 0;                // s de joie apres une caresse (il saute et remue la queue)
    this.bubble = null;
    this.bubbleT = 0;
    this._barkCd = 0;
    this._sniffed = '';          // derniere piece annoncee (on ne l'annonce qu'une fois)
    const tile = document.getElementById('pausePet');
    if (tile) tile.addEventListener('click', () => this.rename());
    this.act = null;             // astuce en cours { id, t, dur } (H02) ou fouille { id: 'dig' }
    this.tricksBar = document.getElementById('petTricks');
    if (this.tricksBar) this.tricksBar.querySelectorAll('[data-trick]').forEach(b => b.addEventListener('click', () => this.trick(b.dataset.trick)));
    this.fetch = null;           // partie de balle en cours { phase, t, from, to, ball }
    this.ballBtn = document.getElementById('petBall');
    if (this.ballBtn) this.ballBtn.addEventListener('click', () => this.throwBall());
  }

  /* Tuile « Mon chien » du menu pause : visible une fois le chien adopte. */
  refreshPause() {
    const tile = document.getElementById('pausePet');
    if (!tile) return;
    tile.classList.toggle('hidden', !this.data.adopted);
    const n = document.getElementById('pausePetName');
    if (n) n.textContent = `${this.data.name} · changer son nom`;
  }

  /* Pelage choisi dans « Mon perso » (look.js) : on reconstruit le chien au meme endroit. */
  setFur(color) {
    this.data.fur = color;
    this.save();
    if (!this.dog) return;
    const vis = this.dog.group.visible;
    if (this.bubble) { this.dog.group.remove(this.bubble); this.bubble = null; }
    if (this.fetch) this._endFetch(false);
    this.g.r3d.airport.remove(this.dog.group);
    const x = this.x, z = this.z;
    this._build();
    this.x = x; this.z = z;
    this.dog.group.visible = vis;
  }

  /* L'enfant choisit le nom de son chien. */
  rename() {
    const v = window.prompt('Comment s\'appelle ton chien ?', this.data.name);
    if (v == null) return;
    const name = v.replace(/[<>&"]/g, '').trim().slice(0, 14);
    if (!name) return;
    this.data.name = name;
    this.save();
    this.refreshPause();
    sfx.bark();
    this.g.toast(`🐕 Ton chien s'appelle maintenant ${name} !`, 3000, 'ok');
  }

  /* ---------------- Jouer a la balle ---------------- */
  /* La balle part devant le joueur ; le chien court la chercher et la rapporte. */
  throwBall() {
    const g = this.g;
    if (!this.dog || this.fetch || g.state !== 'HUB') return;
    const p = g.player.pos, h = g.player.heading;
    let to = null;
    for (let d = 13; d >= 5; d -= 2) {
      const x = p.x + Math.sin(h) * d, z = p.z + Math.cos(h) * d;
      if (g.nav.isWalkable(x, z) && g.agents._clearOfHull(null, x, z)) { to = { x, z }; break; }
    }
    if (!to) { g.arcade.popup('🎾 Pas assez de place pour lancer ici !'); return; }
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd9f99d, emissive: 0x84cc16, emissiveIntensity: 0.25, roughness: 0.6 }));
    ball.castShadow = true;
    g.r3d.airport.add(ball);
    this.fetch = { phase: 'fly', t: 0, dur: 0.9, from: { x: p.x, z: p.z }, to, ball, life: 0 };
    sfx.pop();
    this._say('❗', 1);
  }

  /* Avance la partie de balle ; rend le point vise par le chien. */
  _stepFetch(dt) {
    const f = this.fetch, g = this.g, p = g.player.pos;
    f.life += dt;
    if (f.life > 25) { this._endFetch(false); return null; }       // coince quelque part : on abandonne
    if (f.phase === 'fly') {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.ball.position.set(f.from.x + (f.to.x - f.from.x) * k, 1.3 * (1 - k) + 0.16 + Math.sin(k * Math.PI) * 3, f.from.z + (f.to.z - f.from.z) * k);
      if (k >= 1) f.phase = 'chase';
      return f.to;
    }
    if (f.phase === 'chase') {
      f.ball.position.set(f.to.x, 0.16, f.to.z);
      if (Math.hypot(this.x - f.to.x, this.z - f.to.z) < 0.7) {
        /* Il l'attrape : la balle passe dans sa gueule. */
        g.r3d.airport.remove(f.ball);
        f.ball.position.set(0, 0.74, -0.86);
        this.dog.group.add(f.ball);
        f.phase = 'back';
        sfx.bark();
      }
      return f.to;
    }
    /* Retour : il la depose aux pieds du joueur. */
    if (Math.hypot(this.x - p.x, this.z - p.z) < 1.6) { this._endFetch(true); return null; }
    return { x: p.x, z: p.z };
  }

  _endFetch(ok) {
    const f = this.fetch, g = this.g;
    this.fetch = null;
    if (!f) return;
    if (f.ball.parent) f.ball.parent.remove(f.ball);
    f.ball.geometry.dispose(); f.ball.material.dispose();
    if (!ok) return;
    this.joy = 1.5;
    this._say('🎾', 1.6);
    const s = g.arcade.data.stats;
    s.fetch = (s.fetch || 0) + 1;
    g.arcade.event('fetch');
    /* Les 5 premieres balles du jour rapportent une piece. */
    const day = todayKey();
    if (this.data.fetchDay !== day) { this.data.fetchDay = day; this.data.fetchN = 0; }
    if (this.data.fetchN < 5) {
      this.data.fetchN++;
      g.arcade.giveCoins(1, { silent: true, xp: 1 });
      g.arcade.popup(`🎾 ${this.data.name} rapporte la balle ! +1 🪙`);
    } else {
      g.arcade.popup(`🎾 ${this.data.name} rapporte la balle !`);
    }
    this.save();
    g.arcade.save();
  }

  _line() { return PET_LINES[Math.floor(Math.random() * PET_LINES.length)].replace('{n}', this.data.name); }

  /* Les gestes rigolos (menu Fun) : le chien saute de joie avec une bulle. */
  cheer(kind) {
    if (!this.dog || !this.dog.group.visible) return;
    const ICO = { dance: '🎵', party: '🎉', honk: '❗', hello: '👋', selfie: '📸', candy: '🍬', music: '🎶', announce: '❗' };
    this.joy = 1.6;
    this._say(ICO[kind] || '💖', 1.8);
    if (kind === 'honk' || kind === 'party' || kind === 'hello') sfx.bark();
  }

  _load() {
    const def = { adopted: false, name: 'Biscuit', pets: 0, petDay: '', fur: 0xc58a4a, tricks: { sit: 0, lie: 0, spin: 0, five: 0 }, digDay: '' };
    const d = Save.load(STORE, def);
    d.tricks = Object.assign({ sit: 0, lie: 0, spin: 0, five: 0 }, d.tricks && typeof d.tricks === 'object' ? d.tricks : {});
    return d;
  }
  save() { Save.write(STORE, this.data); }

  get adopted() { return !!this.data.adopted; }

  /* ---------------- Boucle ---------------- */
  update(dt) {
    const g = this.g;
    if (!g.arcade.on) return;
    if (!this.data.adopted) {
      if (g.ground.data.dogs >= 1 && g.state === 'HUB' && !g.ground.active) this._adopt();
      return;
    }
    const show = g.state === 'HUB' && !g.hangar.active && !g.controlled;
    /* Bouton balle : dehors, a pied. */
    if (this.ballBtn) this.ballBtn.classList.toggle('hidden', !(show && !g.inTerminal && !g.rides.active && !g.driving));
    if (!this.dog) {
      if (!show) return;
      this._build();
    }
    this.dog.group.visible = show;
    if (!show) { if (this.fetch) this._endFetch(false); return; }
    this._move(dt);
    this._animate(dt);
    this._updateTricks(dt);
  }

  /* H02 : barre d'astuces visible quand on est pres du chien et a l'arret ; fouille quotidienne d'un tresor rare. */
  _updateTricks(dt) {
    const g = this.g, p = g.player.pos;
    const near = !this.fetch && Math.hypot(this.x - p.x, this.z - p.z) < 4 && !g.player.moving && !g.inTerminal && !g.rides.active && !g.driving && !g._worldPaused;
    if (this.tricksBar) {
      this.tricksBar.classList.toggle('hidden', !near);
      if (near) this.tricksBar.querySelectorAll('[data-trick]').forEach(b => b.classList.toggle('learned', this.data.tricks[b.dataset.trick] >= LEARN));
    }
    if (this.act) {
      this.act.t += dt;
      if (this.act.t >= this.act.dur) this._endAct();
      return;
    }
    /* Une fois par jour, a l'arret et pres de son maitre : il creuse et trouve un tresor rare. */
    if (this.data.digDay !== todayKey() && g.arcade.data.tutorialDone && !this.moving && this.idle > 5 && near) {
      this.data.digDay = todayKey();
      this.save();
      this.act = { id: 'dig', t: 0, dur: 3.2 };
      this._say('👃', 3);
      sfx.bark();
    }
  }

  trick(id) {
    const T = TRICKS[id];
    if (!T || this.act || !this.dog || this.joy > 0) return;
    this.act = { id, t: 0, dur: T.dur };
    const n = this.data.tricks[id];
    const learned = n >= LEARN;
    this._say(learned ? T.ico : '❓', T.dur);
    sfx.bark();
    if (!learned) {
      this.data.tricks[id] = n + 1;
      if (this.data.tricks[id] >= LEARN) {
        this.g.arcade.giveCoins(8, { silent: true, xp: 10 });
        this.g.arcade.confetti(40);
        sfx.tada();
        this.g.toast(`🐕 ${this.data.name} a appris « ${T.name} » ! +8 🪙`, 4000, 'ok');
        if (Object.values(this.data.tricks).every(v => v >= LEARN)) { this.g.fun.say(`${this.data.name} sait faire TOUTES les astuces ! Quel chien intelligent !`, 3, 4800); this.g.arcade.giveStars(1); }
      } else {
        this.g.arcade.popup(`🐕 Entrainement « ${T.name} » : ${this.data.tricks[id]}/${LEARN}`);
      }
    } else this.g.arcade.popup(`🐕 ${T.name} !`);
    this.save();
  }

  _endAct() {
    const a = this.act;
    this.act = null;
    this.idle = 0;
    if (a && a.id === 'dig') {
      const g = this.g;
      g.arcade.giveCoins(20, { silent: true, xp: 12 });
      const u = Math.random() < 0.25 ? g.hangar.randomUnlock() : null;
      g.arcade.confetti(50);
      sfx.sparkle();
      this._say('💎', 3);
      g.toast(`🐕 ${this.data.name} a deterre un tresor rare ! 💎 +20 🪙${u ? ' · ' + u.label + ' !' : ''}`, 4800, 'ok');
    }
  }

  _adopt() {
    const g = this.g;
    this.data.adopted = true;
    this.save();
    this._build();
    sfx.bark();
    g.arcade.confetti(50);
    g.toast(`🐕 ${this.data.name}, le chien que tu as rattrape, veut rester avec toi ! Il flaire les pieces cachees.`, 5200, 'ok');
    g.fun.say(`${this.data.name} te suit partout maintenant ! Suis-le quand il aboie : il a trouve une piece !`, 3, 4800);
  }

  _build() {
    const g = this.g, p = g.player.pos;
    this.dog = buildDog(this.data.fur);
    this.dog.group.scale.setScalar(0.9);
    this.dog.group.rotation.order = 'YXZ';      // s'asseoir = basculer autour de son propre axe
    const w = g.nav.nearestWalkable(p.x - 1.5, p.z - 1.5);
    this.x = w.x; this.z = w.z;
    this.dog.group.position.set(this.x, 0, this.z);
    g.r3d.airport.add(this.dog.group);
  }

  /* Piece cachee non trouvee la plus proche du joueur, si Biscuit peut la sentir. */
  _scent() {
    const tz = this.g.arcade.data.treasure;
    if (!tz || !tz.spots) return null;
    const p = this.g.player.pos;
    let best = null, bd = SNIFF_RANGE;
    tz.spots.forEach((s, i) => {
      if (tz.got[i]) return;
      const d = Math.hypot(s[0] - p.x, s[1] - p.z);
      if (d < bd) { bd = d; best = { x: s[0], z: s[1], key: tz.day + ':' + i }; }
    });
    return best;
  }

  _move(dt) {
    const g = this.g, p = g.player.pos, ph = g.player.heading;
    if (this.act) {                      // astuce ou fouille en cours : il ne bouge pas
      this.moving = false; this.idle += dt;
      this.h = lerpAngle(this.h, Math.atan2(p.x - this.x, p.z - this.z), Math.min(1, dt * 4));
      return;
    }
    const coin = this.joy > 0 || this.fetch ? null : this._scent();
    let tx, tz;
    const ft = this.fetch && this._stepFetch(dt);
    if (ft) {
      tx = ft.x; tz = ft.z;
    } else if (coin) {
      tx = coin.x; tz = coin.z;
      if (coin.key !== this._sniffed) {
        this._sniffed = coin.key;
        this._barkCd = 0;
        g.arcade.popup(`🐕 Wouf ! ${this.data.name} a flaire une piece cachee !`);
      }
    } else {
      /* A cote du joueur (a sa gauche) et a peine en arriere : derriere lui, il se mettait entre
         la camera et l'avatar et le cachait. */
      tx = p.x - Math.sin(ph) * 0.6 + Math.cos(ph) * 1.8;
      tz = p.z - Math.cos(ph) * 0.6 - Math.sin(ph) * 1.8;
    }
    /* Aboie de temps en temps sur la piece, pour guider l'enfant. */
    this._barkCd -= dt;
    if (coin && this._barkCd <= 0 && Math.hypot(coin.x - this.x, coin.z - this.z) < 2) {
      this._barkCd = 4.5;
      sfx.bark();
      this._say('🪙', 2);
    }

    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    /* Trop loin (le joueur a couru, ou est passe par une porte) : il le rejoint d'un bond. */
    if (d > 32) {
      const w = g.nav.nearestWalkable(tx, tz);
      this.x = w.x; this.z = w.z;
      this.moving = false;
      return;
    }
    const stop = ft ? 0.3 : coin ? 0.5 : 0.7;
    this.moving = d > stop && this.joy <= 0;
    if (!this.moving) {
      this.idle += dt;
      /* A l'arret, il regarde le joueur. */
      this.h = lerpAngle(this.h, Math.atan2(p.x - this.x, p.z - this.z), Math.min(1, dt * 4));
      return;
    }
    this.idle = 0;
    const speed = clamp(d * 3, 1.6, 12);
    const base = Math.atan2(dx, dz);
    const step = Math.min(d, speed * dt);
    for (const da of [0, 0.45, -0.45, 0.9, -0.9, 1.5, -1.5]) {
      const a = base + da;
      const nx = this.x + Math.sin(a) * step, nz = this.z + Math.cos(a) * step;
      if (g.nav.isWalkable(nx, nz) && g.agents._clearOfHull(null, nx, nz)) {
        this.x = nx; this.z = nz;
        this.h = lerpAngle(this.h, a, Math.min(1, dt * 10));
        this.speed = speed;
        return;
      }
    }
    this.moving = false;
  }

  _animate(dt) {
    const g = this.g, d = this.dog, t = g.time;
    const y = g.r3d.groundHeight ? g.r3d.groundHeight(this.x, this.z) : 0;
    let hop = 0;
    if (this.joy > 0) { this.joy -= dt; hop = Math.abs(Math.sin(t * 9)) * 0.35; }
    d.group.position.set(this.x, y + hop, this.z);
    d.group.rotation.y = this.h + Math.PI;
    /* Assis apres un moment a l'arret. */
    const sit = !this.moving && this.idle > 1.2 && this.joy <= 0;
    d.group.rotation.x += ((sit ? 0.32 : 0) - d.group.rotation.x) * Math.min(1, dt * 6);
    d.tail.rotation.z = Math.sin(t * (this.joy > 0 ? 34 : 16)) * (this.joy > 0 ? 0.8 : 0.45);
    const run = this.moving ? clamp((this.speed || 2) / 6, 0.35, 1) : 0;
    d.legs.forEach((l, i) => {
      const k = sit && i >= 2 ? -1.2 : Math.sin(t * 15 * Math.max(run, 0.3) + (i % 2 ? Math.PI : 0)) * 0.75 * run;
      l.rotation.x += (k - l.rotation.x) * Math.min(1, dt * 12);
    });
    const A = this.act;
    if (A) {
      const u = clamp(A.t / A.dur, 0, 1), env = Math.sin(u * Math.PI);          // 0 -> 1 -> 0
      if (A.id === 'sit') { d.group.rotation.x = 0.42 * Math.min(1, env * 2); d.legs.forEach((l, i) => { if (i >= 2) l.rotation.x = -1.3 * Math.min(1, env * 2); }); }
      else if (A.id === 'lie') { d.group.position.y = y - 0.2 * Math.min(1, env * 2); d.group.rotation.x = 0.1; d.legs.forEach((l, i) => { l.rotation.x = (i < 2 ? 1.25 : -1.25) * Math.min(1, env * 2); }); d.tail.rotation.z = Math.sin(t * 6) * 0.3; }
      else if (A.id === 'spin') { d.group.rotation.y = this.h + Math.PI + u * Math.PI * 2; d.group.position.y = y + Math.abs(Math.sin(u * Math.PI * 2)) * 0.12; }
      else if (A.id === 'five') { d.group.rotation.x = 0.3 * Math.min(1, env * 2); d.legs[1].rotation.x = -1.4 * Math.min(1, env * 2) + Math.sin(t * 14) * 0.2 * env; }
      else if (A.id === 'dig') { d.group.rotation.x = -0.35 * Math.min(1, env * 2.5); d.legs[0].rotation.x = Math.sin(t * 22) * 1.0; d.legs[1].rotation.x = -Math.sin(t * 22) * 1.0; d.group.position.y = y; }
    }
    if (this.bubble) {
      this.bubbleT -= dt;
      this.bubble.position.y = 2.2 + Math.sin(t * 5) * 0.08;
      if (this.bubbleT <= 0) { d.group.remove(this.bubble); this.bubble = null; }
    }
  }

  /* Petite bulle emoji au-dessus de Biscuit. */
  _say(emoji, secs) {
    if (!this.dog) return;
    if (this.bubble) this.dog.group.remove(this.bubble);
    this.bubble = emojiSprite(emoji, 1.1);
    this.bubble.position.set(0, 2.2, 0);
    this.dog.group.add(this.bubble);
    this.bubbleT = secs;
  }

  /* ---------------- Interaction (bouton du monde libre, voir social.js) ---------------- */
  near() {
    if (!this.dog || !this.dog.group.visible || this.joy > 0) return null;
    /* Le chien suit le joueur partout : sans pause, le gros bouton « caresser » restait affiche
       en permanence. Il revient 45 s apres une caresse, et seulement quand on s'arrete. */
    if (this.g.time - (this._lastPet ?? -1e9) < 45 || this.g.player.moving) return null;
    const p = this.g.player.pos;
    const d = Math.hypot(this.x - p.x, this.z - p.z);
    return d < PET_RANGE ? { kind: 'pet', d, label: `🐕 CARESSER ${this.data.name.toUpperCase()}` } : null;
  }

  pet() {
    const g = this.g;
    this._lastPet = g.time;
    this.joy = 1.8;
    this._say('💖', 2);
    sfx.bark();
    this.data.pets++;
    g.arcade.data.stats.pets = (g.arcade.data.stats.pets || 0) + 1;
    /* Premiere caresse du jour : un petit cadeau. */
    const day = todayKey();
    if (this.data.petDay !== day) {
      this.data.petDay = day;
      g.arcade.giveCoins(3, { silent: true, xp: 3 });
      g.toast(`🐕 ${this._line()} +3 🪙`, 3000, 'ok');
    } else {
      g.arcade.popup(`🐕 ${this._line()}`);
    }
    this.save();
    g.arcade.save();
  }
}

function lerpAngle(a, b, k) {
  let d = b - a;
  d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + d * k;
}
