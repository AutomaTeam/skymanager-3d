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
import { sfx } from './sfx.js?v=1791471104';
import { LAYOUT } from './layout.js?v=1791471104';

const $ = (id) => document.getElementById(id);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const STORE = 'skymanager.meet';

/* Terrain de jeu : points de depart possibles (tarmac et abords). */
const SPOTS = [
  [300, 1160], [440, 1150], [210, 1000], [330, 915], [500, 905], [120, 1100], [278, 1160],
  [310, 1215], [470, 1222], [610, 1010], [330, 1335], [420, 1350], [150, 830], [300, 1000]
];

export const STORIES = [
  { id: 'granny', ico: '👵', name: 'Mamie Jeannette', color: 0xb45f8a, hat: 0xe5e7eb, gift: { sticker: 'cat' }, coins: 10, escort: 'Je ne trouve plus mon avion… tu m\'accompagnes ?',
    lines: ['Oh, bonjour mon petit ! Je pars voir mes petits-enfants.', 'Mon perroquet a mange mon billet… mais tu m\'as retrouvee, merci !', 'Tiens, un petit cadeau pour toi !'] },
  { id: 'clown', ico: '🤡', name: 'Pipo le clown', color: 0xe11d48, hat: 0xfacc15, gift: { sticker: 'smile' }, coins: 12,
    lines: ['Pouet pouet ! Je vais faire le spectacle dans une autre ville !', 'Mon nez rouge est reste dans l\'avion hier… Ah non, le voila !', 'Voici un sourire pour ton avion !'] },
  { id: 'pirate', ico: '🏴‍☠️', name: 'Capitaine Barbe-Rose', color: 0x1f2937, hat: 0x111827, gift: { sticker: 'shark' }, coins: 14, game: 'scan',
    lines: ['Arrr ! Mes bagages sont bizarres, moussaillon !', 'Aide-moi a trouver l\'intrus dans mes valises !'] },
  { id: 'astro', ico: '🧑‍🚀', name: 'Luna l\'astronaute', color: 0xf3f4f6, hat: 0x38bdf8, gift: { sticker: 'rocket' }, coins: 14,
    lines: ['Houston, nous avons un visiteur !', 'Je rentre de l\'espace. Le plus beau vol, c\'est quand meme celui-ci !', 'Prends cette fusee, elle porte bonheur !'] },
  { id: 'star', ico: '🎤', name: 'La chanteuse Stella', color: 0x9333ea, hat: 0xfde047, gift: { sticker: 'star' }, coins: 16, escort: 'Vite, emmene-moi a l\'avion, mon concert commence bientot !',
    lines: ['Coucou ! Je suis en retard pour mon concert !', 'Tu me ramenes a l\'heure ? Tu es mon heros !', 'Une etoile pour toi, comme sur scene !'] },
  { id: 'robot', ico: '🤖', name: 'Bip-Bop le robot', color: 0x64748b, hat: 0x22d3ee, gift: { sticker: 'robot' }, coins: 12,
    lines: ['Bip bop ! Je suis un robot-voyageur.', 'Mon detecteur de sourires indique : 100 % !', 'Je te donne mon badge robot. Bip !'] },
  { id: 'kids', ico: '🧒', name: 'La classe de CE2', color: 0x16a34a, hat: 0xf97316, gift: { sticker: 'rainbow' }, coins: 12, escort: 'La maitresse a dit de suivre le guide jusqu\'a l\'avion : c\'est toi !',
    lines: ['Bonjour ! On va voir la mer en classe verte !', 'On adore les avions ! Tu nous fais un tonneau, plus tard ?', 'On t\'offre un arc-en-ciel !'] },
  { id: 'chef', ico: '👨‍🍳', name: 'Chef Pizzaiolo', color: 0xf8fafc, hat: 0xf8fafc, gift: { sticker: 'pizza' }, coins: 12,
    lines: ['Buongiorno ! Je transporte la meilleure pizza du monde.', 'Ne dis rien… Je t\'en garde une part !', 'Voici une pizza pour ton avion !'] },
  { id: 'magician', ico: '🎩', name: 'Zigomar le magicien', color: 0x312e81, hat: 0x111827, gift: { sticker: 'unicorn' }, coins: 14,
    lines: ['Abracadabra ! J\'ai fait disparaitre ma valise…', 'Ah non, elle etait dans mon chapeau !', 'Pour toi, une licorne magique. Chut, c\'est un secret !'] },
  { id: 'football', ico: '⚽', name: 'Lina la footballeuse', color: 0x2563eb, hat: 0xfacc15, gift: { sticker: 'flame' }, coins: 14,
    lines: ['Salut ! Mon equipe joue la finale demain !', 'Tu veux faire une passe ? Attention, je tire fort !', 'Une flamme pour ton avion : tu es un champion !'] },
  { id: 'polar', ico: '🐧', name: 'Igor l\'explorateur polaire', color: 0xe0f2fe, hat: 0xdc2626, gift: { sticker: 'fox' }, coins: 14,
    lines: ['Brrr ! Je reviens du pole Nord, il faisait -40 degres !', 'Un renard des neiges m\'a suivi pendant trois jours.', 'Je te donne son portrait, pour ton hangar !'] },
  { id: 'dino', ico: '🦖', name: 'Docteur Ossa la paleontologue', color: 0x92400e, hat: 0x65a30d, gift: { sticker: 'dino' }, coins: 16,
    lines: ['Bonjour ! J\'emmene un os de dinosaure au musee.', 'Il est plus grand que toi ! Heureusement qu\'il voyage en soute.', 'Un dino pour ton avion. Roaaar !'] }
];

/* Mini-chien procedural : corps, tete, oreilles, pattes, queue qui remue. */
export function buildDog(furColor = 0xc58a4a) {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: furColor, roughness: 0.85 });
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

export function emojiSprite(emoji, size = 1.6) {
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
    this.cd = 40 + Math.random() * 30;       // delai avant le premier evenement
    this.ev = null;                          // evenement en cours
    this.leaving = [];                       // visiteurs qui repartent a pied
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
    if (this.leaving.length) this._updateLeaving(dt);
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
    if (e.kind === 'dog') this._updateDog(dt);
    else if (e.kind === 'balloons') this._updateBalloons(dt);
    else if (e.kind === 'lost') this._updateLost(dt);
    else if (e.phase === 'follow') this._updateEscort(dt);
    else this._updateVisitor(dt);
    /* Temps ecoule : rate, sauf les ballons deja attrapes qui comptent quand meme. */
    if (this.ev && e.t <= 0) this._end((e.kind === 'balloons' && e.n > 0) || e.phase === 'follow');   // la rencontre a eu lieu
    this._renderHud();
  }

  _spawn() {
    const g = this.g;
    const p = g.player.pos;
    const spots = SPOTS.filter(([x, z]) => Math.hypot(x - p.x, z - p.z) > 40 && g.nav.isWalkable(x, z));
    if (!spots.length) { this.cd = 30; return; }
    const [x, z] = pick(spots);
    const r = Math.random();
    if (r < 0.27) this._startDog(x, z); else if (r < 0.54) this._startVisitor();
    else if (r < 0.77) this._startBalloons(x, z); else this._startLost(x, z);
  }

  /* ---------------- Le chien ---------------- */
  _startDog(x, z) {
    const g = this.g;
    /* Si l'enfant a deja Biscuit (pet.js), le fugueur a un autre pelage : on ne les confond pas. */
    const d = buildDog(g.pet && g.pet.adopted ? pick([0x2b2b2b, 0xe8e2d6, 0x8a8a8a, 0x7a4a2a]) : undefined);
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

  /* ---------------- Le doudou perdu ---------------- */
  /* Un petit enfant pleure dans le hall : son lapin en peluche est tombe dehors. On le retrouve
     (la fleche aide), on le ramasse en passant dessus, et on le lui rapporte. */
  _startLost(x, z) {
    const g = this.g;
    const c = g.nav.nearestWalkable(318 + Math.random() * 90, 1212);
    const child = g.r3d.buildTechnician(pick([0xf472b6, 0x60a5fa, 0xfacc15, 0x4ade80]), 0xffffff, false);
    child.group.scale.setScalar(0.6);
    child.group.position.set(c.x, 0, c.z);
    g.r3d.airport.add(child.group);
    const mark = emojiSprite('😢', 1.4 / 0.6);
    mark.position.set(0, 3.0, 0);
    child.group.add(mark);
    /* Le doudou : un petit lapin blanc, avec une bulle pour le reperer de loin. */
    const plush = new THREE.Group();
    const fur = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.95 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xf9a8d4, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), fur); body.position.y = 0.22;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), fur); head.position.y = 0.5;
    plush.add(body, head);
    for (const sd of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.2, 4, 8), fur); ear.position.set(sd * 0.06, 0.74, 0); ear.rotation.z = sd * 0.2;
      const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.15, 4, 6), pink); inner.position.set(sd * 0.06, 0.74, 0.03); inner.rotation.z = sd * 0.2;
      plush.add(ear, inner);
    }
    plush.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const pm = emojiSprite('🐰', 1.2);
    pm.position.set(0, 1.6, 0);
    plush.add(pm);
    plush.position.set(x, 0, z);
    g.r3d.airport.add(plush);
    this.ev = { kind: 'lost', t: 200, total: 200, phase: 'find', child, mark, plush, pm, x: c.x, z: c.z, h: 0, px: x, pz: z };
    sfx.chime();
    g.toast('📢 Un petit enfant a perdu son doudou lapin ! Aide-le a le retrouver.', 4600, 'ok');
    g.fun.say('Oh, un enfant pleure dans le terminal… son doudou est tombe quelque part dehors !', 3, 4200);
  }

  _updateLost(dt) {
    const g = this.g, e = this.ev, p = g.player.pos, t = g.time;
    e.mark.position.y = 3.0 + Math.sin(t * 3) * 0.12;
    e.child.group.rotation.y = Math.atan2(p.x - e.x, p.z - e.z);
    g.r3d.updateAvatarAnim(e.child, false, dt);
    if (e.phase === 'find') {
      e.plush.rotation.y = t * 0.8;
      e.pm.position.y = 1.6 + Math.sin(t * 4) * 0.15;
      if (Math.hypot(e.px - p.x, e.pz - p.z) < 2) {
        /* Ramasse : le doudou part dans les bras du joueur. */
        e.phase = 'bring';
        e.plush.remove(e.pm);
        g.r3d.airport.remove(e.plush);
        e.plush.position.set(0.28, 0.85, 0.25);
        e.plush.rotation.set(0, 0, 0);
        e.plush.scale.setScalar(0.8);
        if (g.r3d.player) g.r3d.player.group.add(e.plush);
        sfx.pop();
        g.arcade.popup('🐰 Doudou trouve ! Rapporte-le a l\'enfant.');
      }
    } else if (Math.hypot(e.x - p.x, e.z - p.z) < 2.6) {
      e.done = true;
      this._end(true);
    }
  }

  /* ---------------- Les ballons envoles ---------------- */
  /* Un lacher de ballons rate : 6 ballons montent doucement. On passe dessous pour les attraper
     avant qu'ils ne s'envolent trop haut. */
  _startBalloons(x, z) {
    const g = this.g;
    const COLORS = [0xef4444, 0xf59e0b, 0x22c55e, 0x3b82f6, 0xa855f7, 0xec4899];
    const string = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const balloons = [];
    for (let i = 0; i < 6; i++) {
      let bx = x, bz = z;
      for (let k = 0; k < 12; k++) {
        const a = Math.random() * 6.28, d = 5 + Math.random() * 9;
        if (g.nav.isWalkable(x + Math.cos(a) * d, z + Math.sin(a) * d)) { bx = x + Math.cos(a) * d; bz = z + Math.sin(a) * d; break; }
      }
      const grp = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshStandardMaterial({ color: COLORS[i], roughness: 0.35, metalness: 0.05, emissive: COLORS[i], emissiveIntensity: 0.25 }));
      ball.scale.y = 1.18;
      ball.position.y = 1.25;
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 4), string);
      str.position.y = 0.55;
      grp.add(ball, str);
      grp.position.set(bx, 0.6 + Math.random() * 0.6, bz);
      g.r3d.airport.add(grp);
      balloons.push({ grp, x: bx, z: bz, y: grp.position.y, ph: Math.random() * 6, got: false, lost: false });
    }
    this.ev = { kind: 'balloons', t: 55, total: 55, balloons, x, z, n: 0 };
    sfx.pop();
    g.toast('🎈 Oh non, les ballons de la fete s\'envolent ! Passe dessous pour les attraper !', 4200, 'ok');
    g.fun.say('Vite, attrape les ballons avant qu\'ils montent dans le ciel !', 3, 3800);
  }

  _updateBalloons(dt) {
    const g = this.g, e = this.ev, p = g.player.pos, t = g.time;
    let left = 0;
    for (const b of e.balloons) {
      if (b.got) continue;
      /* Il monte doucement ; trop haut, il s'envole pour de bon (et plus vite). */
      b.y += dt * (b.lost ? 2.5 : 0.11);
      b.grp.position.set(b.x + Math.sin(t * 1.3 + b.ph) * 0.3, b.y, b.z + Math.cos(t * 1.1 + b.ph) * 0.3);
      b.grp.rotation.z = Math.sin(t * 1.7 + b.ph) * 0.12;
      if (b.lost) { if (b.y > 40) { g.r3d.airport.remove(b.grp); b.got = true; } continue; }
      if (b.y > 6.5) { b.lost = true; continue; }
      left++;
      if (Math.hypot(b.x - p.x, b.z - p.z) < 2.4) {
        b.got = true; e.n++;
        g.r3d.airport.remove(b.grp);
        sfx.pop();
        g.arcade.giveCoins(1, { silent: true });
        g.arcade.popup(`🎈 ${e.n}/6 +1 🪙`);
      }
    }
    if (!left && !e.balloons.some(b => b.lost && !b.got)) this._end(e.n > 0);
  }

  /* ---------------- Les visiteurs ---------------- */
  /* Le visiteur sort du terminal par une porte cote piste et marche jusqu'a un point degage
     de l'aire, ou il attend en faisant coucou. Apres la rencontre (ou s'il attend trop),
     il repart a pied vers le terminal au lieu de disparaitre d'un coup. */
  _startVisitor() {
    const g = this.g;
    const met = this.data.met;
    const pool = STORIES.filter(s => !met.includes(s.id));
    const story = pick(pool.length ? pool : STORIES);
    const T = LAYOUT.terminal;
    const door = pick(T.airDoors);
    const from = { x: door.x, z: T.z0 - 3 };
    let to = null;
    for (let k = 0; k < 10 && !to; k++) {
      const c = g.nav.nearestWalkable(door.x + (Math.random() - 0.5) * 24, T.z0 - 14 - Math.random() * 12);
      if (this._lineFree(from, c)) to = c;
    }
    if (!to) to = { x: from.x, z: from.z - 6 };
    const ent = g.r3d.buildTechnician(story.color, story.hat, false);
    ent.group.position.set(from.x, 0, from.z);
    g.r3d.airport.add(ent.group);
    const mark = emojiSprite(story.ico, 1.5);
    mark.position.set(0, 3.1, 0);
    ent.group.add(mark);
    this.ev = { kind: 'visitor', t: 100, total: 100, story, ent, x: from.x, z: from.z, mark, phase: 'arrive', to, door: from, waveT: 2, h: Math.PI };
    sfx.ding();
    g.toast(`${story.ico} ${story.name} sort du terminal ! Va le saluer.`, 4200, 'ok');
    g.fun.say(`${story.ico} Regarde, ${story.name} arrive !`, 3, 3800);
  }

  /* Ligne droite praticable entre deux points (echantillonnee tous les 1,5 m). */
  _lineFree(a, b) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.5);
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      if (!this.g.nav.isWalkable(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k)) return false;
    }
    return true;
  }

  /* Un pas de marche vers (tx, tz) ; rend true une fois arrive. */
  _walk(w, tx, tz, dt, speed = 1.4) {
    const dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
    if (d < 0.3) return true;
    const st = Math.min(d, speed * dt);
    w.x += dx / d * st; w.z += dz / d * st;
    w.h = Math.atan2(dx, dz);
    return false;
  }

  _updateVisitor(dt) {
    const g = this.g, e = this.ev, p = g.player.pos;
    const dp = Math.hypot(e.x - p.x, e.z - p.z);
    let moving = false;
    if (e.phase === 'arrive') {
      moving = !this._walk(e, e.to.x, e.to.z, dt);
      if (!moving) e.phase = 'wait';
    }
    if (e.phase === 'wait') {
      /* Il regarde le joueur, et fait coucou (petit saut + bulle) quand il le voit approcher. */
      e.h = Math.atan2(p.x - e.x, p.z - e.z);
      e.waveT -= dt;
      if (dp < 22 && e.waveT <= 0) { e.waveT = 6; e.ent.pose = 'jump'; e.poseT = 0.9; }
    }
    if (e.poseT > 0) { e.poseT -= dt; if (e.poseT <= 0 && !this.story) e.ent.pose = null; }
    e.ent.group.position.set(e.x, 0, e.z);
    e.ent.group.rotation.y = e.h;
    g.r3d.updateAvatarAnim(e.ent, moving, dt);
    e.mark.position.y = 3.1 + Math.sin(g.time * 4) * 0.15 + (e.ent.pose === 'jump' ? 0.3 : 0);
    if (dp < 3.2 && !this.story) { e.h = Math.atan2(p.x - e.x, p.z - e.z); this._openStory(e.story); }
  }

  /* Visiteurs qui repartent vers le terminal (apres la rencontre ou un temps d'attente). */
  _updateLeaving(dt) {
    const g = this.g;
    for (const w of this.leaving) {
      if (w.byeT > 0) { w.byeT -= dt; if (w.byeT <= 0) w.ent.pose = null; }
      const done = w.byeT <= 0 && this._walk(w, w.door.x, w.door.z, dt, 1.6);
      w.ent.group.position.set(w.x, 0, w.z);
      w.ent.group.rotation.y = w.h;
      g.r3d.updateAvatarAnim(w.ent, w.byeT <= 0 && !done, dt);
      if (done || w.t > 40) { g.r3d.airport.remove(w.ent.group); w.gone = true; }
      w.t += dt;
    }
    this.leaving = this.leaving.filter(w => !w.gone);
  }

  _openStory(s) {
    this.story = s; this.line = 0;
    this.g._worldPaused = true;
    if (this.ev && this.ev.ent) this.ev.ent.pose = 'work';        // il parle avec les mains
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
    if (s.escort && this.ev && this.ev.kind === 'visitor' && this.ev.phase !== 'follow') { this._startEscort(); return; }
    this._end(true);
  }

  /* ---------------- Accompagner un visiteur jusqu'a l'avion ---------------- */
  _escortTarget() {
    const d = this.g.arcade.markerPos('cabinDoor');
    return d ? this.g.nav.nearestWalkable(d.x, d.z) : null;
  }

  _startEscort() {
    const g = this.g, e = this.ev;
    if (!this._escortTarget()) { this._end(true); return; }
    e.phase = 'follow';
    e.t = 150; e.total = 150;
    e.ent.pose = null;
    sfx.ding();
    g.toast(`${e.story.ico} « ${e.story.escort} » Emmene ${e.story.name} jusqu'a la porte de l'avion !`, 5200, 'ok');
  }

  /* Le visiteur suit le joueur (un peu en arriere), en contournant les obstacles comme il peut. */
  _updateEscort(dt) {
    const g = this.g, e = this.ev, p = g.player.pos, ph = g.player.heading;
    const tgt = this._escortTarget();
    const tx = p.x - Math.sin(ph) * 1.6, tz = p.z - Math.cos(ph) * 1.6;
    const d = Math.hypot(tx - e.x, tz - e.z);
    let moving = false;
    if (d > 25) {
      const w = g.nav.nearestWalkable(tx, tz);
      e.x = w.x; e.z = w.z;
    } else if (d > 0.8) {
      const speed = Math.min(5.5, 1.4 + d * 0.8), step = Math.min(d, speed * dt), base = Math.atan2(tx - e.x, tz - e.z);
      for (const da of [0, 0.5, -0.5, 1.1, -1.1]) {
        const a = base + da, nx = e.x + Math.sin(a) * step, nz = e.z + Math.cos(a) * step;
        if (g.nav.isWalkable(nx, nz) && g.agents._clearOfHull(null, nx, nz)) { e.x = nx; e.z = nz; e.h = a; moving = true; break; }
      }
    }
    e.ent.group.position.set(e.x, 0, e.z);
    e.ent.group.rotation.y = e.h;
    g.r3d.updateAvatarAnim(e.ent, moving, dt, d > 6);
    e.mark.position.y = 3.1 + Math.sin(g.time * 4) * 0.15;
    /* Arrive a la porte : merci, bonus, et il monte a bord. */
    /* Meme portee que le bouton de la porte cabine (la coque empeche d'aller plus pres). */
    if (tgt && (Math.hypot(p.x - tgt.x, p.z - tgt.z) < 8.5 || Math.hypot(e.x - tgt.x, e.z - tgt.z) < 8.5)) {
      e.door = tgt;
      g.arcade.giveCoins(8, { silent: true, xp: 6 });
      this.data.escorts = (this.data.escorts || 0) + 1;
      g.arcade.data.stats.escorts = (g.arcade.data.stats.escorts || 0) + 1;
      g.arcade.popup('🧭 Bien guide ! +8 🪙');
      g.fun.say(`${e.story.ico} Merci de m'avoir accompagne(e) jusqu'a l'avion !`, 3, 3600);
      this._end(true);
    }
  }
  _closeStory() {
    $('storyCard').classList.add('hidden');
    if (this.ev && this.ev.ent && this.ev.ent.pose === 'work') this.ev.ent.pose = null;
    this.g._worldPaused = false;
    this.story = null;
  }

  /* ---------------- Fin d'evenement ---------------- */
  _end(ok) {
    const g = this.g, e = this.ev;
    if (!e) return;
    this.ev = null;
    this.cd = 80 + Math.random() * 50;
    if (e.kind === 'dog') { g.r3d.airport.remove(e.dog.group); }
    else if (e.kind === 'balloons') { for (const b of e.balloons) g.r3d.airport.remove(b.grp); }
    else if (e.kind === 'lost') {
      if (e.plush.parent) e.plush.parent.remove(e.plush);
      e.mark.visible = false;
      /* L'enfant saute de joie, puis repart vers la sortie cote ville avec ses parents. */
      if (ok) { const b = emojiSprite('😄', 1.4 / 0.6); b.position.set(0, 3.0, 0); e.child.group.add(b); }
      e.child.pose = ok ? 'jump' : null;
      this.leaving.push({ ent: e.child, x: e.x, z: e.z, h: e.h, door: { x: e.x, z: 1262 }, byeT: ok ? 2 : 0, t: 0 });
    }
    else {
      /* Le visiteur ne disparait pas : il fait au revoir (si la rencontre a eu lieu) et repart. */
      e.ent.pose = ok ? 'jump' : null;
      e.mark.visible = false;
      this.leaving.push({ ent: e.ent, x: e.x, z: e.z, h: e.h, door: e.door || { x: e.x, z: e.z }, byeT: ok ? 1.1 : 0, t: 0 });
    }
    if (!ok) {
      g.toast(e.kind === 'dog' ? '🐕 Le chien s\'est enfui… il reviendra peut-etre !'
        : e.kind === 'balloons' ? '🎈 Les ballons sont partis dans le ciel… une autre fois !'
        : e.kind === 'lost' ? '🐰 Un agent a retrouve le doudou. La prochaine fois, ce sera toi !'
        : `${e.story.ico} ${e.story.name} est reparti(e).`, 3200);
      return;
    }
    sfx.tada(); g.arcade.confetti(60);
    if (e.kind === 'lost') {
      g.arcade.giveCoins(15, { silent: true, xp: 10 });
      g.arcade.data.stats.doudous = (g.arcade.data.stats.doudous || 0) + 1;
      g.arcade.event('doudou');
      const got = this._giveSticker('heart');
      g.toast(`🐰 L'enfant a retrouve son doudou ! Merci ! +15 🪙${got ? ' et un autocollant coeur !' : ''}`, 4400, 'ok');
      g.fun.say('Tu as rendu un enfant tout heureux !', 3, 3200);
    } else if (e.kind === 'balloons') {
      const all = e.n === 6;
      if (all) g.arcade.giveCoins(8, { silent: true, xp: 8 });
      g.toast(all ? '🎈 Les 6 ballons ! La fete est sauvee ! +8 🪙 de bonus' : `🎈 ${e.n} ballon${e.n > 1 ? 's' : ''} rattrape${e.n > 1 ? 's' : ''} ! Bien joue !`, 4000, 'ok');
    } else if (e.kind === 'dog') {
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
    if (e.kind === 'visitor' && e.phase === 'follow') {
      const t = this._escortTarget();
      return { icon: e.story.ico, text: `Accompagne ${e.story.name} jusqu'a la porte de l'avion !`, target: t ? { x: t.x, z: t.z } : null };
    }
    if (e.kind === 'lost') {
      return e.phase === 'find'
        ? { icon: '🐰', text: 'Un enfant a perdu son doudou lapin ! Retrouve-le dehors (suis la fleche).', target: { x: e.px, z: e.pz } }
        : { icon: '🐰', text: 'Rapporte le doudou a l\'enfant qui pleure dans le terminal !', target: { x: e.x, z: e.z } };
    }
    if (e.kind === 'balloons') {
      const p = this.g.player.pos;
      let best = null, bd = Infinity;
      for (const b of e.balloons) { if (b.got || b.lost) continue; const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bd) { bd = d; best = b; } }
      return { icon: '🎈', text: `Attrape les ballons avant qu'ils s'envolent ! (${e.n}/6)`, target: best ? { x: best.x, z: best.z } : null };
    }
    if (e.kind === 'dog') return { icon: '🐕', text: 'Rattrape le chien ! Fonce tout droit pour courir et coince-le !', target: { x: e.x, z: e.z } };
    return { icon: e.story.ico, text: `Va saluer ${e.story.name} !`, target: { x: e.x, z: e.z } };
  }

  _renderHud() {
    const chip = $('eventChip');
    if (!chip) return;
    const e = this.ev, show = !!e && this.g.state === 'HUB';
    chip.classList.toggle('hidden', !show);
    if (show) {
      const t = Math.max(0, Math.ceil(e.t));
      const txt = `${e.kind === 'dog' ? '🐕' : e.kind === 'balloons' ? '🎈' : e.kind === 'lost' ? '🐰' : e.story.ico} ⏱ ${t} s`;
      if (chip.textContent !== txt) chip.textContent = txt;
      chip.classList.toggle('late', t < 15);
    }
  }
}
