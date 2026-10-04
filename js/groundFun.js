/* ============================================================
   groundFun.js — Evenements surprise a l'aeroport (vague 4)

   Pendant que le joueur marche sur le tarmac, de petites
   surprises arrivent toutes les 2 a 3 minutes :
     - un CHIEN s'est echappe : il faut le rattraper (il court vite,
       mais se fatigue) ;
     - un VISITEUR celebre arrive pres du terminal : on va le saluer,
       il raconte une petite histoire, donne un cadeau et rejoint
       l'album des rencontres.

   Les visiteurs reutilisent l'avatar du jeu (glTF) avec une couleur
   de tenue differente et une bulle d'emoji au-dessus de la tete.
   ============================================================ */

import * as THREE from 'three';
import { sfx } from './sfx.js?v=1791200000';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const STORE = 'skymanager.meet';

/* Terrain de jeu : points de depart possibles (tarmac et abords). */
const SPOTS = [
  [300, 1160], [440, 1150], [210, 1000], [330, 915], [500, 905], [120, 1100], [278, 1160],
  [310, 1215], [470, 1222], [610, 1010], [330, 1335], [420, 1350], [150, 830], [300, 1000]
];

export const STORIES = [
  { id: 'granny', ico: '👵', name: 'Mamie Jeannette', color: 0xb45f8a, hat: 0xe5e7eb, gift: { sticker: 'cat' }, coins: 10,
    lines: ['Oh, bonjour mon petit ! Je pars voir mes petits-enfants.', 'Mon perroquet a mange mon billet… mais tu m\'as retrouvee, merci !', 'Tiens, un petit cadeau pour toi !'] },
  { id: 'clown', ico: '🤡', name: 'Pipo le clown', color: 0xe11d48, hat: 0xfacc15, gift: { sticker: 'smile' }, coins: 12,
    lines: ['Pouet pouet ! Je vais faire le spectacle dans une autre ville !', 'Mon nez rouge est reste dans l\'avion hier… Ah non, le voila !', 'Voici un sourire pour ton avion !'] },
  { id: 'pirate', ico: '🏴‍☠️', name: 'Capitaine Barbe-Rose', color: 0x1f2937, hat: 0x111827, gift: { sticker: 'shark' }, coins: 14, game: 'scan',
    lines: ['Arrr ! Mes bagages sont bizarres, moussaillon !', 'Aide-moi a trouver l\'intrus dans mes valises !'] },
  { id: 'astro', ico: '🧑‍🚀', name: 'Luna l\'astronaute', color: 0xf3f4f6, hat: 0x38bdf8, gift: { sticker: 'rocket' }, coins: 14,
    lines: ['Houston, nous avons un visiteur !', 'Je rentre de l\'espace. Le plus beau vol, c\'est quand meme celui-ci !', 'Prends cette fusee, elle porte bonheur !'] },
  { id: 'star', ico: '🎤', name: 'La chanteuse Stella', color: 0x9333ea, hat: 0xfde047, gift: { sticker: 'star' }, coins: 16,
    lines: ['Coucou ! Je suis en retard pour mon concert !', 'Tu me ramenes a l\'heure ? Tu es mon heros !', 'Une etoile pour toi, comme sur scene !'] },
  { id: 'robot', ico: '🤖', name: 'Bip-Bop le robot', color: 0x64748b, hat: 0x22d3ee, gift: { sticker: 'robot' }, coins: 12,
    lines: ['Bip bop ! Je suis un robot-voyageur.', 'Mon detecteur de sourires indique : 100 % !', 'Je te donne mon badge robot. Bip !'] },
  { id: 'kids', ico: '🧒', name: 'La classe de CE2', color: 0x16a34a, hat: 0xf97316, gift: { sticker: 'rainbow' }, coins: 12,
    lines: ['Bonjour ! On va voir la mer en classe verte !', 'On adore les avions ! Tu nous fais un tonneau, plus tard ?', 'On t\'offre un arc-en-ciel !'] },
  { id: 'chef', ico: '👨‍🍳', name: 'Chef Pizzaiolo', color: 0xf8fafc, hat: 0xf8fafc, gift: { sticker: 'pizza' }, coins: 12,
    lines: ['Buongiorno ! Je transporte la meilleure pizza du monde.', 'Ne dis rien… Je t\'en garde une part !', 'Voici une pizza pour ton avion !'] }
];

/* Mini-chien procedural : corps, tete, oreilles, pattes, queue qui remue. */
function buildDog() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xc58a4a, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5b3a1a, roughness: 0.85 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.85), fur);
  body.position.y = 0.52;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.3), white);
  chest.position.set(0, 0.48, -0.32);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.32), fur);
  head.position.set(0, 0.8, -0.5);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.14, 0.2), white);
  snout.position.set(0, 0.74, -0.7);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.05), dark);
  nose.position.set(0, 0.78, -0.81);
  const ears = [-1, 1].map(s => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.14), dark); e.position.set(s * 0.17, 0.88, -0.45); e.rotation.z = s * 0.3; return e; });
  const tail = new THREE.Group();
  tail.position.set(0, 0.66, 0.42);
  const tb = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.07), fur);
  tb.position.y = 0.16;
  tail.add(tb); tail.rotation.x = 0.5;
  const legs = [];
  for (const [x, z] of [[-0.15, -0.28], [0.15, -0.28], [-0.15, 0.3], [0.15, 0.3]]) {
    const l = new THREE.Group(); l.position.set(x, 0.42, z);
    const lm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), fur); lm.position.y = -0.21; l.add(lm);
    g.add(l); legs.push(l);
  }
  g.add(body, chest, head, snout, nose, ...ears, tail);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(1.25);
  return { group: g, tail, legs, head };
}

function emojiSprite(emoji, size = 1.6) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.arc(64, 64, 58, 0, 6.3); x.fill();
  x.strokeStyle = '#7c3aed'; x.lineWidth = 6; x.stroke();
  x.font = '78px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(emoji, 64, 72);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, depthTest: false }));
  s.scale.set(size, size, 1);
  s.renderOrder = 30;
  return s;
}

export class GroundFun {
  constructor(game) {
    this.g = game;
    this.data = this._load();
    this.cd = 70 + Math.random() * 40;       // delai avant le premier evenement
    this.ev = null;                          // evenement en cours
    this._bind();
  }

  _load() {
    const def = { met: [], dogs: 0 };
    try { const d = JSON.parse(localStorage.getItem(STORE) || 'null'); if (d) return Object.assign(def, d, { met: d.met || [] }); } catch (e) { /* ignore */ }
    return def;
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }

  _bind() {
    const ok = $('storyOk');
    if (ok) ok.addEventListener('click', () => this._storyNext());
    const gm = $('storyGame');
    if (gm) gm.addEventListener('click', () => { this._closeStory(); this.g.minigames.open(this.story.game, { onDone: () => {} }); });
  }

  get active() { return !!this.ev; }

  /* ---------------- Boucle ---------------- */
  update(dt) {
    const g = this.g;
    if (!g.arcade.on) return;
    if (g.state !== 'HUB' || g.controlled || g.hangar.active) { this._renderHud(); return; }
    if (!this.ev) {
      const ready = g.arcade.data.tutorialDone || g.arcade.data.stats.flights >= 1;
      if (!ready || g.inTerminal) return;
      this.cd -= dt;
      if (this.cd <= 0) this._spawn();
      this._renderHud();
      return;
    }
    const e = this.ev;
    e.t -= dt;
    e.kind === 'dog' ? this._updateDog(dt) : this._updateVisitor(dt);
    if (this.ev && e.t <= 0) this._end(false);
    this._renderHud();
  }

  _spawn() {
    const g = this.g;
    const p = g.player.pos;
    const spots = SPOTS.filter(([x, z]) => Math.hypot(x - p.x, z - p.z) > 40 && g.nav.isWalkable(x, z));
    if (!spots.length) { this.cd = 30; return; }
    const [x, z] = pick(spots);
    if (Math.random() < 0.5) this._startDog(x, z); else this._startVisitor(x, z);
  }

  /* ---------------- Le chien ---------------- */
  _startDog(x, z) {
    const g = this.g;
    const d = buildDog();
    d.group.position.set(x, 0, z);
    g.r3d.airport.add(d.group);
    const mark = emojiSprite('🐕', 1.3);
    mark.position.set(0, 2.9, 0);
    d.group.add(mark);
    this.ev = { kind: 'dog', t: 60, total: 60, dog: d, x, z, vx: 0, vz: 0, tire: 0, fleeing: 0, goal: { x, z }, wander: 0, mark, caught: false };
    sfx.ding();
    g.toast('🐕 Un chien s\'est echappe sur le tarmac ! Rattrape-le !', 4200, 'ok');
    g.fun.say('Oh non ! Un chien court partout ! Attrape-le !', 3, 3800);
  }

  _updateDog(dt) {
    const g = this.g, e = this.ev, d = e.dog, p = g.player.pos;
    const dist = Math.hypot(e.x - p.x, e.z - p.z);
    if (dist < 2.2) { this._end(true); return; }
    /* fuite ou balade */
    let tx, tz, speed;
    if (dist < 15 && e.tire < 14) {
      e.fleeing += dt; e.tire += dt;
      const ax = e.x - p.x, az = e.z - p.z, l = Math.hypot(ax, az) || 1;
      tx = e.x + ax / l * 12 + (Math.random() - 0.5) * 6; tz = e.z + az / l * 12 + (Math.random() - 0.5) * 6;
      speed = e.tire < 8 ? 6.4 : 4.2;
    } else {
      e.tire = Math.max(0, e.tire - dt * 0.6);
      e.wander -= dt;
      if (e.wander <= 0) { e.wander = 2 + Math.random() * 3; e.goal = { x: e.x + (Math.random() - 0.5) * 40, z: e.z + (Math.random() - 0.5) * 40 }; }
      tx = e.goal.x; tz = e.goal.z; speed = 2.6;
    }
    /* meilleure direction praticable */
    const base = Math.atan2(tx - e.x, tz - e.z);
    let best = null;
    for (const da of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4]) {
      const a = base + da, nx = e.x + Math.sin(a) * speed * dt * 3, nz = e.z + Math.cos(a) * speed * dt * 3;
      if (g.nav.isWalkable(nx, nz) && !g.r3d.isInsideTerminal(nx, nz)) { best = a; break; }
    }
    if (best == null) { e.wander = 0; }
    else {
      e.x += Math.sin(best) * speed * dt; e.z += Math.cos(best) * speed * dt;
      d.group.rotation.y = best + Math.PI;
    }
    d.group.position.set(e.x, 0, e.z);
    const t = g.time;
    d.tail.rotation.z = Math.sin(t * 22) * 0.6;
    const run = speed > 4 ? 1 : 0.35;
    d.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 16 * run + (i % 2 ? Math.PI : 0)) * 0.7 * run; });
    e.mark.position.y = 2.9 + Math.sin(t * 5) * 0.12;
  }

  /* ---------------- Les visiteurs ---------------- */
  _startVisitor(x, z) {
    const g = this.g;
    const met = this.data.met;
    const pool = STORIES.filter(s => !met.includes(s.id));
    const story = pick(pool.length ? pool : STORIES);
    const ent = g.r3d.buildTechnician(story.color, story.hat, false);
    ent.group.position.set(x, 0, z);
    g.r3d.airport.add(ent.group);
    const mark = emojiSprite(story.ico, 1.5);
    mark.position.set(0, 3.1, 0);
    ent.group.add(mark);
    const beam = g.r3d.setBeacon ? null : null;
    this.ev = { kind: 'visitor', t: 100, total: 100, story, ent, x, z, mark, wait: 0 };
    sfx.ding();
    g.toast(`${story.ico} ${story.name} est arrive(e) ! Va le saluer.`, 4200, 'ok');
    g.fun.say(`${story.ico} Regarde, ${story.name} vient d'arriver !`, 3, 3800);
  }

  _updateVisitor(dt) {
    const g = this.g, e = this.ev, p = g.player.pos;
    g.r3d.updateAvatarAnim(e.ent, false, dt);
    e.mark.position.y = 3.1 + Math.sin(g.time * 4) * 0.15;
    e.ent.group.rotation.y = Math.atan2(p.x - e.x, p.z - e.z);
    if (Math.hypot(e.x - p.x, e.z - p.z) < 3.2 && !this.story) this._openStory(e.story);
  }

  _openStory(s) {
    this.story = s; this.line = 0;
    this.g._worldPaused = true;
    $('storyIco').textContent = s.ico;
    $('storyName').textContent = s.name;
    $('storyGame').classList.toggle('hidden', !s.game);
    this._showLine();
    $('storyCard').classList.remove('hidden');
    sfx.hello();
  }
  _showLine() {
    const s = this.story;
    $('storyText').textContent = s.lines[this.line];
    $('storyOk').textContent = this.line >= s.lines.length - 1 ? '🎁 Merci !' : 'Suite ▶';
  }
  _storyNext() {
    const s = this.story;
    if (!s) return;
    sfx.click();
    if (this.line < s.lines.length - 1) { this.line++; this._showLine(); return; }
    this._closeStory();
    this._end(true);
  }
  _closeStory() {
    $('storyCard').classList.add('hidden');
    this.g._worldPaused = false;
    this.story = null;
  }

  /* ---------------- Fin d'evenement ---------------- */
  _end(ok) {
    const g = this.g, e = this.ev;
    if (!e) return;
    this.ev = null;
    this.cd = 130 + Math.random() * 90;
    if (e.kind === 'dog') { g.r3d.airport.remove(e.dog.group); }
    else { g.r3d.airport.remove(e.ent.group); }
    if (!ok) {
      g.toast(e.kind === 'dog' ? '🐕 Le chien s\'est enfui… il reviendra peut-etre !' : `${e.story.ico} ${e.story.name} est reparti(e).`, 3200);
      return;
    }
    sfx.tada(); g.arcade.confetti(60);
    if (e.kind === 'dog') {
      this.data.dogs++;
      g.arcade.giveCoins(14, { silent: true, xp: 8 });
      g.arcade.event('dog');
      g.toast('🐕 Attrape ! +14 🪙 — et un autocollant « Chien » pour ton hangar !', 4200, 'ok');
      this._giveSticker('dog');
      g.fun.say('Bravo ! Le chien est sain et sauf !', 3);
    } else {
      const s = e.story;
      if (!this.data.met.includes(s.id)) this.data.met.push(s.id);
      g.arcade.giveCoins(s.coins, { silent: true, xp: 8 });
      g.arcade.event('meet');
      const got = s.gift && this._giveSticker(s.gift.sticker);
      g.toast(`${s.ico} Nouvelle rencontre dans ton album ! +${s.coins} 🪙${got ? ' et un autocollant !' : ''}`, 4400, 'ok');
    }
    this.save();
    g.arcade.checkBadges();
  }

  _giveSticker(id) {
    const h = this.g.hangar;
    if (!h.data.owned.sticker.includes(id)) { h.data.owned.sticker.push(id); h.save(); return true; }
    return false;
  }

  /* ---------------- Objectif et interface ---------------- */
  goal() {
    const e = this.ev;
    if (!e) return null;
    if (e.kind === 'dog') return { icon: '🐕', text: 'Rattrape le chien ! Il court vite : cours (Maj) et coince-le !', target: { x: e.x, z: e.z } };
    return { icon: e.story.ico, text: `Va saluer ${e.story.name} !`, target: { x: e.x, z: e.z } };
  }

  _renderHud() {
    const chip = $('eventChip');
    if (!chip) return;
    const e = this.ev, show = !!e && this.g.state === 'HUB';
    chip.classList.toggle('hidden', !show);
    if (show) {
      const t = Math.max(0, Math.ceil(e.t));
      const txt = `${e.kind === 'dog' ? '🐕' : e.story.ico} ⏱ ${t} s`;
      if (chip.textContent !== txt) chip.textContent = txt;
      chip.classList.toggle('late', t < 15);
    }
  }
}
