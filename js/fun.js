/* ============================================================
   fun.js — Couche « fun » du mode Arcade (plan PLAN_FUN_ENFANT.md)

   Vague 1 :
     - « Voler maintenant » (decollage en moins de 30 s) ;
     - acrobaties : tonneau et looping, score, combos ;
     - turbo avec jauge qui se recharge ;
     - fumee coloree derriere les ailes ;
     - Coco la mascotte (bulles courtes, voix en option) ;
     - ralenti + confettis sur l'atterrissage parfait ;
     - carte postale (photo) et coffre surprise ;
     - 3 niveaux de difficulte.

   Le module ne touche pas a la physique : une acrobatie est une
   animation cinematique de l'avion (rotation + vitesse conservee)
   qui rend la main a l'aide au pilotage a la fin.
   ============================================================ */

import * as THREE from 'three';
import { sfx } from './sfx.js?v=1791576638';
import { Particles } from './particles.js?v=1791576638';

const STORE = 'skymanager.fun';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const KTS = 1.94384;

const STUNT_MIN_AGL = 200;            // m : pas d'acrobatie plus bas
const COMBO_WINDOW = 9;               // s pour enchainer une acrobatie
const BOOST_DRAIN = 1 / 4.5;          // jauge/s pendant le turbo
const BOOST_REGEN = 1 / 22;           // jauge/s au repos
const BOOST_MIN = 0.12;               // jauge mini pour lancer le turbo

export const AVATARS = ['🧑‍✈️', '🦊', '🐱', '🐶', '🤖', '🦄', '🐼', '🐸'];
export const TRAILS = [
  { id: 'off',     name: 'Sans fumée',  ico: '🚫', colors: null },
  { id: 'white',   name: 'Nuage blanc', ico: '☁️', colors: [0xffffff] },
  { id: 'red',     name: 'Rouge',       ico: '🔴', colors: [0xff3b3b] },
  { id: 'blue',    name: 'Bleu',        ico: '🔵', colors: [0x38a1ff] },
  { id: 'green',   name: 'Vert',        ico: '🟢', colors: [0x3ddc6a] },
  { id: 'pink',    name: 'Rose',        ico: '💗', colors: [0xff6fd8] },
  { id: 'rainbow', name: 'Arc-en-ciel', ico: '🌈', colors: 'rainbow' }
];
export const DIFFS = {
  easy:   { name: 'Facile',   ico: '🐣', ring: 1.5, magnet: true,  coin: 1 },
  normal: { name: 'Normal',   ico: '✈️', ring: 1,   magnet: true,  coin: 1 },
  expert: { name: 'Expert',   ico: '🦅', ring: 0.7, magnet: false, coin: 1.5 }
};

/* ---------- Phrases de Coco (courtes, drôles, jamais effrayantes) ---------- */
const LINES = {
  hello: ['Salut {n} ! Je suis Coco, ton copilote !', 'Coucou {n} ! Prêt pour l\'aventure ?', 'Hello {n} ! Aujourd\'hui, on s\'amuse !'],
  ready: ['Attache ta ceinture… on y va !', 'Moteurs chauds ! Décollage dans 3, 2, 1…'],
  takeoff: ['On vole ! Waouh !', 'Décollage réussi ! Bravo {n} !', 'On monte, on monte !'],
  stuntHint: ['Appuie sur TONNEAU pour faire une pirouette !', 'Tu veux t\'amuser ? Essaie le LOOPING !', 'Psst… le bouton TURBO va très vite !'],
  roll: ['Waouh, quelle pirouette !', 'Tonneau parfait !', 'Ça tourne ! Génial !', 'Hop hop hop ! Bravo !'],
  loop: ['Looping ! J\'ai le tournis !', 'Incroyable, un looping !', 'Tu es un as des airs !', 'Whaaaa ! Encore !'],
  combo: ['COMBO ! Tu enchaînes comme un pro !', 'Et un de plus ! Quel champion !', 'Je n\'en crois pas mes plumes !'],
  boost: ['TURBO ! Accroche-toi !', 'Vroooum ! Ça va vite !', 'Plus vite que le vent !'],
  tooLow: ['Monte plus haut pour les acrobaties !', 'Trop bas ! Prends de la hauteur.'],
  tooSlow: ['Va un peu plus vite pour tourner !'],
  ring: ['Anneau ! Bien joué !', 'Dans le mille !', 'Super vol !'],
  final: ['Je te guide sur la piste, regarde !', 'On rentre ! Garde le nez droit.'],
  star3: ['PARFAIT ! Même les nuages applaudissent !', 'Atterrissage de champion, {n} !', 'Trop fort ! Trois étoiles !'],
  star2: ['Super atterrissage ! Presque parfait !', 'Bravo {n} ! Joli !'],
  star1: ['Posé ! On fait encore mieux au prochain ?', 'Atterri ! Un petit pas de plus vers l\'as des airs.'],
  oops: ['Oups ! On a rebondi… Pas grave, on repart !', 'Boing ! Rigolo, mais on réessaie ?'],
  photo: ['Souris ! Cheese !', 'Quelle belle carte postale !'],
  chest: ['Un coffre ! Ouvre-le vite !'],
  idle: ['Le ciel est magnifique aujourd\'hui, non ?', 'Tu veux faire un tonneau ?', 'Regarde les anneaux dorés !'],
  /* G09 : Coco commente selon la situation (5 variantes chacune, jamais deux fois la même de suite) */
  firstDay: ['Premier vol de la journée ! On est en forme !', 'Bonjour {n} ! Nouvelle journée, nouvelles aventures !', 'Déjà de retour ? J\'adore ça, {n} !', 'Ça sent bon la journée de vol !', 'Les nuages nous attendaient, {n} !'],
  night: ['Oh, il fait nuit ! Regarde toutes les étoiles !', 'Un vol de nuit… c\'est magique, {n} !', 'Les lumières de la piste sont jolies, non ?', 'Chut… tout le monde dort en bas.', 'La lune nous éclaire, {n} !'],
  rain: ['Il pleut ! Les gouttes font plic ploc sur les ailes.', 'Un vol sous la pluie, quelle aventure, {n} !', 'Pas de panique, l\'avion adore la pluie.', 'Regarde les gouttes qui glissent !', 'Après la pluie, il y aura peut-être un arc-en-ciel…'],
  fog: ['Du brouillard ! Suis bien les lumières de la piste.', 'On voit à peine le bout de l\'aile, rigolo !', 'Le brouillard, c\'est comme voler dans un nuage !'],
  storm: ['Ça gronde un peu… mais je suis avec toi, {n} !', 'Les gros nuages sombres, on les contourne gentiment.', 'Éclairs au loin : spectacle garanti !'],
  newPlane: ['Un nouvel avion ! Il est magnifique, {n} !', 'Premier vol avec lui : on fait connaissance !', 'Waouh, ça se pilote comment celui-là ? On va voir !', 'Bienvenue à bord de ton nouvel avion !', 'Nouvel avion, nouvelles sensations !'],
  glider: ['Un planeur ! Chut… on n\'entend que le vent.', 'Cherche les oiseaux qui tournent, ils connaissent les ascendances !', 'Doucement, {n} : un planeur aime les grands virages.', 'On plane comme un vrai oiseau !', 'Un nuage blanc devant ? Dessous, l\'air monte !'],
  heli: ['Un hélico ! On peut rester sur place, regarde !', 'Les pales tournent, {n} ! Vroum vroum !', 'Avec lui, on se pose partout !', 'Hélico : bouton STOP pour rester en l\'air !', 'Prêt pour un petit sauvetage ?'],
  record: ['Un record ! Je n\'en crois pas mes plumes !', 'Nouveau record, {n} ! Tu es trop fort !', 'Personne n\'a jamais fait mieux que toi !', 'Record battu ! Je te dois une graine !', 'Bravo champion, on le fête !']
};

const GIFTS = [
  { w: 50, kind: 'coins', min: 6,  max: 18,  text: (n) => `${n} pièces !`,        ico: '🪙' },
  { w: 22, kind: 'coins', min: 20, max: 40,  text: (n) => `Gros tas de ${n} pièces !`, ico: '💰' },
  { w: 14, kind: 'xp',    min: 25, max: 50,  text: (n) => `${n} points d'expérience !`, ico: '✨' },
  { w: 10, kind: 'boost', min: 1,  max: 1,   text: () => 'Turbo plein pour le prochain vol !', ico: '⚡' },
  { w: 4,  kind: 'coins', min: 60, max: 100, text: (n) => `JACKPOT : ${n} pièces !`,   ico: '💎' }
];

/* ============================================================
   Fumee coloree : un nuage de points (un seul draw call)
   ============================================================ */
class Trail extends Particles {
  /* Fumee lente : immobile, elle grossit en s'estompant. */
  emit(x, y, z, color, size = 3.2, life = 3.2) { this.spawn(x, y, z, color, { size, life, grow: 1.6 }); }
}

/* ============================================================
   Module principal
   ============================================================ */
export class Fun {
  constructor(game) {
    this.g = game;
    this.data = this._load();

    /* Acrobaties */
    this.stunt = null;                 // { kind, t, dur, q0, speed, dir, sign }
    this.combo = { n: 0, t: 0 };
    this.stuntScore = 0;               // du vol en cours
    this.stuntCount = 0;
    this.stuntCoins = 0;

    /* Turbo */
    this.boostGauge = 1;
    this.boostHeld = false;
    this.boosting = false;
    this._thrustBoost = 1;
    this._fov = 0;

    /* Temps (ralenti) */
    this.timeScale = 1;
    this._slowT = 0;

    /* Mascotte */
    this._say = { t: 0, prio: 0, last: '' };
    this._idleT = 25;

    /* Photo */
    this._photoReq = false;

    /* Jalons du vol en cours */
    this._flags = {};
    this._tdObj = null;
    this._launchTimer = null;
    this._trailAcc = 0;

    /* Fumee */
    this.trail = null;
    try { this.trail = new Trail(game.r3d.scene); } catch (e) { this.trail = null; }

    this._buildMascot();
    this._bindUI();
    this._refreshBoot();
  }

  /* ---------------- Persistance ---------------- */
  _load() {
    const def = {
      pilot: { name: '', avatar: AVATARS[0] },
      trail: 'white', difficulty: 'normal', voice: false,
      stats: { rolls: 0, loops: 0, boosts: 0, photos: 0, bestStunt: 0, chests: 0, flights: 0, combo: 0 },
      photos: [], pendingBoost: false, streak: { last: '', n: 0 }
    };
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (d) return Object.assign(def, d, {
        pilot: Object.assign(def.pilot, d.pilot || {}),
        stats: Object.assign(def.stats, d.stats || {}),
        photos: d.photos || [],
        streak: Object.assign(def.streak, d.streak || {})
      });
    } catch (e) { /* ignore */ }
    return def;
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.data)); } catch (e) { /* quota: on ignore */ } }

  get name() { return (this.data.pilot.name || '').trim() || 'pilote'; }
  get diff() { return DIFFS[this.data.difficulty] || DIFFS.normal; }
  get active() { return this.g.arcade.on; }

  /* ---------------- Serie quotidienne ---------------- */
  _dayKey(offset = 0) {
    const d = new Date(Date.now() + offset * 86400000);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  /* A l'ouverture de la partie : compte les jours consecutifs et offre un cadeau. */
  checkStreak() {
    const s = this.data.streak, today = this._dayKey();
    if (s.last === today) return null;
    s.n = s.last === this._dayKey(-1) ? s.n + 1 : 1;
    s.last = today;
    this.save();
    const coins = 5 + Math.min(s.n, 7) * 3;
    this.g.arcade.giveCoins(coins, { silent: true });
    const msg = s.n > 1 ? `🔥 ${s.n} jours de suite ! Cadeau : +${coins} 🪙` : `🌞 Bienvenue ! Cadeau du jour : +${coins} 🪙`;
    setTimeout(() => { this.g.toast(msg, 4600, 'ok'); sfx.levelUp(); this.g.arcade.confetti(40); }, 900);
    return s.n;
  }

  /* ---------------- Ecran d'accueil ---------------- */
  _refreshBoot() {
    const sb = $('streakBadge');
    if (sb) {
      const s = this.data.streak;
      const alive = s.last === this._dayKey() || s.last === this._dayKey(-1);
      sb.classList.toggle('hidden', !(alive && s.n >= 1));
      sb.textContent = `🔥 ${s.n} jour${s.n > 1 ? 's' : ''} de suite`;
    }
    for (const id of ['pilotName', 'pausePilotName']) { const inp = $(id); if (inp && inp !== document.activeElement) inp.value = this.data.pilot.name || ''; }
    document.querySelectorAll('.av-btn').forEach(b => b.classList.toggle('on', b.dataset.av === this.data.pilot.avatar));
  }

  /* ---------------- Mascotte ---------------- */
  _buildMascot() {
    if ($('mascot')) return;
    const el = document.createElement('div');
    el.id = 'mascot';
    el.className = 'mascot hidden';
    el.innerHTML = '<div class="m-av">🦜</div><div class="m-bub"></div>';
    document.body.appendChild(el);
  }

  /* Coco parle. `prio` plus haut = coupe la phrase en cours. */
  say(text, prio = 1, ms = 3600) {
    if (!text) return;
    const el = $('mascot');
    if (!el) return;
    const now = performance.now();
    if (this._say.t > now && prio < this._say.prio) return;
    if (text === this._say.last && prio < 3) return;
    text = text.replace('{n}', this.name);
    this._say = { t: now + ms, prio, last: text };
    el.querySelector('.m-bub').textContent = text;
    el.classList.remove('hidden');
    el.classList.remove('talk'); void el.offsetWidth; el.classList.add('talk');
    sfx.chirp();
    clearTimeout(this._hideT);
    this._hideT = setTimeout(() => el.classList.add('hidden'), ms);
    if (this.data.voice) this.g.voice.speak(text, { prio, pitch: 1.6 });
  }
  /* Une phrase de la liste, en evitant les 10 dernieres dites (memoire), pour ne pas se repeter. */
  sayKey(key, prio = 1, ms = 3600) {
    const all = LINES[key] || [''];
    this._recent = this._recent || [];
    const fresh = all.filter(t => !this._recent.includes(t));
    const t = pick(fresh.length ? fresh : all);
    this._recent.push(t);
    if (this._recent.length > 10) this._recent.shift();
    this.say(t, prio, ms);
  }

  /* G09 : la phrase d'accueil depend de la situation (premier vol du jour, nuit, meteo, nouvel avion...). */
  _contextKey() {
    const g = this.g, d = this.data;
    const today = new Date().toISOString().slice(0, 10);
    d.planesFlown = d.planesFlown || [];
    const id = g.ac.profile;
    let key = null;
    if (!d.planesFlown.includes(id) && id !== 'liner' && id !== 'pioupiou') key = 'newPlane';
    else if (g.ac.glider) key = 'glider';
    else if (g.ac.heli) key = 'heli';
    else if (d.lastDay !== today) key = 'firstDay';
    else {
      const h = g.env.hour, w = g.env.weather || (g.env.params && g.env.params.weather);
      if (h >= 20.5 || h < 5.5) key = 'night';
      else if (w === 'storm') key = 'storm';
      else if (w === 'rain') key = 'rain';
      else if (w === 'fog') key = 'fog';
    }
    if (!d.planesFlown.includes(id)) d.planesFlown.push(id);
    d.lastDay = today;
    return key;
  }

  /* ---------------- Interface ---------------- */
  _bindUI() {
    /* Pilote : prenom + avatar. */
    for (const id of ['pilotName', 'pausePilotName']) {
      const inp = $(id);
      if (!inp) continue;
      inp.addEventListener('input', () => { this.data.pilot.name = inp.value.slice(0, 12); this.save(); this._refreshBoot(); });
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
    }
    document.querySelectorAll('.av-btn').forEach(b => b.addEventListener('click', () => {
      this.data.pilot.avatar = b.dataset.av; this.save(); sfx.pop(); this._refreshBoot();
    }));

    /* Boutons de vol. */
    const hold = (id, on, off) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); on(); });
      const up = () => off && off();
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };
    hold('btnTurbo', () => { this.boostHeld = true; }, () => { this.boostHeld = false; });
    hold('btnRoll', () => this.startStunt('roll'));
    hold('btnLoop', () => this.startStunt('loop'));
    hold('btnTrail', () => this.cycleTrail());
    hold('btnPhoto', () => this.requestPhoto());
    hold('btnHover', () => { const h = this.g.ac.heli; if (h) { h.hover = !h.hover; sfx.pop(); this.g.arcade.popup(h.hover ? '⏸ Vol stationnaire' : '▶ En avant !'); } });

    /* Clavier. */
    window.addEventListener('keydown', (e) => {
      if (!this.active || this.g.state !== 'PILOT' || e.repeat) return;
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.code === 'KeyR') this.startStunt('roll');
      else if (e.code === 'KeyE') this.startStunt('loop');
      else if (e.code === 'KeyB' || e.code === 'ShiftLeft') this.boostHeld = true;
      else if (e.code === 'KeyF') this.cycleTrail();
      else if (e.code === 'KeyP') this.requestPhoto();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyB' || e.code === 'ShiftLeft') this.boostHeld = false;
    });

    /* Menu pause : difficulte, fumee, voix. */
    const t = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    t('pauseDiff', () => { this.cycleDifficulty(); });
    t('pauseTrail', () => { this.cycleTrail(); });
    t('pauseVoice', () => { this.data.voice = !this.data.voice; this.save(); sfx.click(); this.refreshPause(); if (this.data.voice) this.say('Je parle maintenant !', 3); });

    /* Coffre surprise dans le rapport de vol. */
    t('kidChest', () => this.openChest());
    t('photoClose', () => $('photoPanel').classList.add('hidden'));
    document.querySelectorAll('[data-pfilter]').forEach(b => b.addEventListener('click', () => this.applyFilter(b.dataset.pfilter)));
    t('pausePhotos', () => this.openAlbum());
    t('photoAlbumClose', () => $('photoAlbum').classList.add('hidden'));

    /* Compte a rebours « Voler maintenant ». */
    t('btnFlyNow', () => { sfx.click(); this.g.flyNow(); });
  }

  refreshPause() {
    const set = (id, ico, title, sub) => {
      const el = $(id);
      if (!el) return;
      el.querySelector('.kp-ico').textContent = ico;
      el.querySelector('b').textContent = title;
      el.querySelector('small').textContent = sub;
    };
    set('pauseDiff', this.diff.ico, 'Difficulté', this.diff.name);
    const tr = TRAILS.find(x => x.id === this.data.trail) || TRAILS[0];
    set('pauseTrail', tr.ico, 'Fumée', tr.name);
    set('pauseVoice', this.data.voice ? '🗣️' : '🤐', 'Voix de Coco', this.data.voice ? 'active' : 'coupee');
  }

  cycleDifficulty() {
    const ids = Object.keys(DIFFS);
    this.data.difficulty = ids[(ids.indexOf(this.data.difficulty) + 1) % ids.length];
    this.save(); sfx.pop(); this.refreshPause();
    this.g.toast(`${this.diff.ico} Difficulté : ${this.diff.name}`, 2200, 'ok');
  }

  cycleTrail() {
    const i = TRAILS.findIndex(x => x.id === this.data.trail);
    const nx = TRAILS[(i + 1) % TRAILS.length];
    this.data.trail = nx.id; this.save(); sfx.pop(); this.refreshPause();
    this.g.arcade.popup(`${nx.ico} ${nx.name}`);
  }

  /* ---------------- Vol : debut / fin ---------------- */
  onFlightStart() {
    this.stunt = null;
    this.combo = { n: 0, t: 0 };
    this.stuntScore = this.stuntCount = this.stuntCoins = 0;
    this.boostGauge = this.data.pendingBoost ? 1 : Math.max(this.boostGauge, 0.6);
    this.data.pendingBoost = false;
    this._flags = {};
    this._tdObj = null;
    this._idleT = 25;
    this.timeScale = 1;
    this.data.stats.flights++;
    this.save();
    if (this.trail) this.trail.clear();
    if (!this.data.pilot.name) this.say('Salut ! Je suis Coco, ton copilote !', 2);
    else this.sayKey(this._contextKey() || 'hello', 2);
  }

  /* Decollage automatique apres un petit compte a rebours. */
  countdownLaunch() {
    const g = this.g;
    clearTimeout(this._launchTimer);
    let n = 3;
    this.sayKey('ready', 3, 3000);
    const tick = () => {
      if (g.state !== 'PILOT' || g.assist.launched) return;
      if (n > 0) {
        g.arcade.popup(String(n));
        sfx.tick();
        n--;
        this._launchTimer = setTimeout(tick, 800);
      } else {
        g.launchNow();
      }
    };
    this._launchTimer = setTimeout(tick, 900);
  }

  /* ---------------- Acrobaties ---------------- */
  canStunt(say = true) {
    const g = this.g, ac = g.ac;
    if (!this.active || g.state !== 'PILOT' || g.reportShown || this.stunt) return false;
    if (ac.onGround || g.assist.landing || ac.heli) return false;
    const agl = ac.pos.y - ac.groundY;
    if (agl < STUNT_MIN_AGL) { if (say) this.sayKey('tooLow', 2); return false; }
    if (ac.tas * KTS < ac.stuntMinKt) { if (say) this.sayKey('tooSlow', 2); return false; }
    return true;
  }

  startStunt(kind) {
    if (!this.canStunt()) return false;
    const g = this.g, ac = g.ac;
    const bank = g.controls && g.controls.axes ? g.controls.axes.roll : 0;
    this.stunt = {
      kind, t: 0,
      dur: kind === 'roll' ? 1.8 : 4.6,
      q0: ac.quat.clone(),
      speed: Math.max(ac.vel.length(), ac.stuntMinKt / KTS * 0.8),
      dir: ac.vel.clone().normalize(),
      sign: bank < -0.25 ? -1 : 1
    };
    sfx.swoosh(kind === 'roll' ? 0.9 : 1.8, 300, 2400);
    return true;
  }

  /* Un pas d'acrobatie. Renvoie true tant qu'elle est en cours (la physique est suspendue). */
  stepStunt(dt) {
    const s = this.stunt;
    if (!s) return false;
    const ac = this.g.ac;
    s.t += dt;
    const u = clamp(s.t / s.dur, 0, 1);
    const e = u * u * (3 - 2 * u);                 // depart et arrivee en douceur
    const ang = e * Math.PI * 2;
    const qr = new THREE.Quaternion();
    if (s.kind === 'roll') qr.setFromAxisAngle(new THREE.Vector3(0, 0, -1), s.sign * ang);
    else qr.setFromAxisAngle(new THREE.Vector3(1, 0, 0), ang);
    ac.quat.copy(s.q0).multiply(qr).normalize();
    if (s.kind === 'roll') ac.vel.copy(s.dir).multiplyScalar(s.speed);
    else ac.vel.copy(ac.forward()).multiplyScalar(s.speed);
    ac.pos.addScaledVector(ac.vel, dt);
    ac.omega.set(0, 0, 0);
    if (ac.pos.y < ac.groundY + 40) { ac.pos.y = ac.groundY + 40; }     // filet de securite
    if (u >= 1) this._endStunt();
    return true;
  }

  _endStunt() {
    const s = this.stunt;
    this.stunt = null;
    const g = this.g, ac = g.ac;
    ac.omega.set(0, 0, 0);
    /* L'aide au pilotage reprend : elle garde le cap et l'assiette actuels. */
    g.assist.hdgHold = null;
    g.assist.pitchHold = null;
    ac.vel.copy(ac.forward()).multiplyScalar(s.speed);
    this._stuntDone(s.kind);
  }

  _stuntDone(kind) {
    const arc = this.g.arcade;
    this.combo.n = this.combo.t > 0 ? this.combo.n + 1 : 1;
    this.combo.t = COMBO_WINDOW;
    const base = kind === 'roll' ? 10 : 16;
    const pts = base * this.combo.n;
    this.stuntScore += pts;
    this.stuntCount++;
    /* Le combo fait monter les points sans fin, mais les pieces plafonnent a x5 : sinon un
       enchainement de tonneaux rapportait des centaines de pieces par minute. */
    const coins = (kind === 'roll' ? 3 : 5) + (Math.min(this.combo.n, 5) - 1) * 2;
    this.stuntCoins += coins;
    arc.giveCoins(coins, { silent: true, xp: 4 });
    arc.event('stunt');
    if (this.g.sky) this.g.sky.onStunt(kind);
    const st = this.data.stats;
    if (kind === 'roll') st.rolls++; else st.loops++;
    st.combo = Math.max(st.combo, this.combo.n);
    st.bestStunt = Math.max(st.bestStunt, this.stuntScore);
    this.save();
    sfx.combo(this.combo.n);
    arc.popup(this.combo.n > 1 ? `✨ COMBO x${this.combo.n} ! +${pts} (+${coins} 🪙)` : `✨ ${kind === 'roll' ? 'Tonneau' : 'Looping'} ! +${pts} (+${coins} 🪙)`);
    arc.confetti(this.combo.n > 1 ? 24 : 12);
    this._boostGain(0.25);
    this.sayKey(this.combo.n >= 2 ? 'combo' : kind, 2, 2600);
    this._flags.stunted = true;
  }

  /* ---------------- Turbo ---------------- */
  _boostGain(v) { this.boostGauge = clamp(this.boostGauge + v, 0, 1); }
  /* Appele par arcade.js quand on traverse un anneau. */
  onRing() { this._boostGain(0.3); this.sayKey('ring', 1, 1800); }

  _updateBoost(dt, flying) {
    const g = this.g, ac = g.ac;
    const can = flying && !this.stunt && !g.assist.landing && ac.tas * KTS < 330;
    const want = this.boostHeld && can && this.boostGauge > (this.boosting ? 0.001 : BOOST_MIN);
    if (want && !this.boosting) { sfx.boost(); this.data.stats.boosts++; if (!this._flags.boostSay) { this._flags.boostSay = true; this.sayKey('boost', 2, 2000); } }
    this.boosting = want;
    if (want) this.boostGauge = Math.max(0, this.boostGauge - dt * BOOST_DRAIN);
    else this.boostGauge = Math.min(1, this.boostGauge + dt * BOOST_REGEN);
    g.assist.boost = want;
    this._thrustBoost += ((want ? 1.7 : 1) - this._thrustBoost) * Math.min(1, dt * 3);
    ac.thrustBoost = this._thrustBoost;
    const r3d = g.r3d;
    const tf = want ? 16 : 0;
    this._fov += (tf - this._fov) * Math.min(1, dt * 4);
    r3d.fovKick = this._fov;
    r3d.camShake = want ? 0.35 : (this._tdShake > 0 ? 0.22 : 0);      // K04 : petite secousse au toucher
    if (this._tdShake > 0) this._tdShake -= dt;
    const sl = $('speedLines');
    if (sl) sl.style.opacity = String(clamp(this._fov / 16, 0, 1) * 0.9);
  }

  /* ---------------- Fumee ---------------- */
  /* K04 : fumee blanche des pneus au toucher + petite secousse de camera (plus forte si l'atterrissage est parfait). */
  _touchdownFx(rate) {
    const g = this.g, ac = g.ac, tr = this.trail;
    this._tdShake = rate.stars === 3 ? 0.45 : 0.3;
    if (!tr) return;
    const ks = Math.max(0.35, g.r3d.camScale || 1);
    const pts = (ac.gearPoints || []).filter(p => p.name !== 'nose');
    const spots = pts.length ? pts.map(p => p.p) : [new THREE.Vector3(-1, -ac.groundY, 0), new THREE.Vector3(1, -ac.groundY, 0)];
    for (const sp of spots) {
      const base = sp.clone().applyQuaternion(ac.quat).add(ac.pos);
      for (let i = 0; i < 9; i++) {
        tr.emit(base.x + (Math.random() - 0.5) * 2.2 * ks, base.y + 0.3 + Math.random() * 0.8, base.z + (Math.random() - 0.5) * 2.2 * ks, 0xf3f4f6, (3.6 + Math.random() * 2.2) * ks, 1.2 + Math.random() * 0.9);
      }
    }
  }

  _updateTrail(dt, flying) {
    const tr = this.trail;
    if (!tr) return;
    const g = this.g, ac = g.ac;
    const cfg = TRAILS.find(x => x.id === this.data.trail) || TRAILS[0];
    let colors = cfg.colors;
    if (this.stunt && !colors) colors = [0xffffff];
    if (flying && colors) {
      this._trailAcc += dt;
      const step = 1 / 55;
      while (this._trailAcc >= step) {
        this._trailAcc -= step;
        const q = ac.quat;
        const half = ac.heli ? 1.0 : Math.max(1.2, ac.b / 2 - 0.3);
        const back = ac.heli ? 0.4 : ac.profile === 'liner' ? 3.2 : 0.7;
        for (const side of [-1, 1]) {
          const p = new THREE.Vector3(side * half, ac.heli ? -1.2 : 0.4, back).applyQuaternion(q).add(ac.pos);
          let c;
          if (colors === 'rainbow') { tr.hue = (tr.hue + 0.012) % 1; c = new THREE.Color().setHSL(tr.hue, 0.95, 0.55).getHex(); }
          else c = colors[0];
          const ks = Math.max(0.35, g.r3d.camScale || 1);
          tr.emit(p.x, p.y, p.z, c, (this.boosting ? 4.4 : 3.4) * ks, this.boosting ? 2.4 : 3.6);
        }
      }
    }
    const cam = g.r3d.camera;
    tr.setViewport(g.r3d.renderer.domElement.height, cam ? cam.fov : 60);
    tr.update(dt);
  }

  /* ---------------- Photo / carte postale ---------------- */
  /* Selfie au sol : la camera se retourne face a l'avatar (et au chien), puis la photo part
     dans l'album comme une carte postale. Rend false si impossible (au volant, en cabine...). */
  selfie() {
    const g = this.g;
    if (!this.active || this._selfie || g.state !== 'HUB' || g.driving || g.controlled || g.rides.active) return false;
    const P = g.player;
    this._selfie = { t: 0, prev: P.rideCam, prevH: P.camHeading };
    /* Camera devant le personnage, legerement de cote pour avoir le chien dans le cadre. */
    P.rideCam = { look: 1.25, ahead: 0, height: 1.7, dist: 4.4, follow: 9, fov: 52 };
    P.camHeading = P.heading + Math.PI + 0.35;
    return true;
  }

  /* H09 : photo de groupe. Les personnes a moins de 10 m se tournent vers le groupe, avec une bulle joyeuse ;
     le chien et les spotteurs aussi. */
  _groupPose(s, P) {
    const g = this.g;
    const ags = (g.agents && g.agents.agents) || [];
    const near = [];
    for (const a of ags) {
      if (a.hidden || a === g.controlled || !a.mesh || !a.mesh.group.visible || a.gate === 'cabin') continue;
      if (Math.hypot(a.wx - P.pos.x, a.wz - P.pos.z) < 10) near.push(a);
    }
    for (const a of near) a.heading = Math.atan2(P.pos.x - a.wx, P.pos.z - a.wz);
    if (!s.posed) {
      s.posed = true;
      const em = ['😀', '😄', '🤩', '✌️', '📸'];
      near.slice(0, 5).forEach((a, i) => { try { g.social._bubble(a.wx, a.wz, em[i % em.length]); } catch (e) { /* bulle facultative */ } });
      if (near.length) g.arcade.popup(`📸 Photo de groupe ! ${near.length + 1} personnes`);
      try { if (g.pet.dog) g.pet._say('📸', 2); } catch (e) { /* chien facultatif */ }
    }
  }

  _updateSelfie(dt) {
    const s = this._selfie;
    if (!s) return;
    const g = this.g, P = g.player;
    s.t += dt;
    if (g.state !== 'HUB') { this._selfie = null; P.rideCam = s.prev; P.camHeading = s.prevH; return; }
    P.camHeading = P.heading + Math.PI + 0.35;
    this._groupPose(s, P);
    if (s.t > 0.9 && !s.shot) { s.shot = true; this.requestPhoto(); }
    if (s.t > 1.3) { this._selfie = null; P.rideCam = s.prev; P.camHeading = s.prevH; }
  }

  requestPhoto() {
    if (!this.active || this._photoReq) return;
    this._photoReq = true;
    sfx.shutter();
    const f = $('photoFlash');
    if (f) { f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
  }

  afterRender() {
    if (!this._photoReq) return;
    this._photoReq = false;
    const src = this.g.r3d.renderer.domElement;
    const W = 960, H = Math.round(W * src.height / src.width);
    const cv = document.createElement('canvas');
    cv.width = W + 40; cv.height = H + 110;
    const x = cv.getContext('2d');
    x.fillStyle = '#fffdf5'; x.fillRect(0, 0, cv.width, cv.height);
    x.drawImage(src, 20, 20, W, H);
    x.strokeStyle = '#e5dcc3'; x.lineWidth = 3; x.strokeRect(20, 20, W, H);
    x.fillStyle = '#334155'; x.font = 'bold 34px Arial, sans-serif';
    const arc = this.g.arcade;
    const dest = arc.plan && arc.plan.dest ? `${arc.plan.dest.city}` : (this.g.arcade.data.name || 'Mon aéroport');
    x.fillText(`${this.data.pilot.avatar} ${this.name} · ${dest}`, 30, H + 72);
    x.font = '22px Arial, sans-serif'; x.fillStyle = '#64748b';
    x.textAlign = 'right';
    x.fillText(`SkyManager · ${new Date().toLocaleDateString('fr-FR')}`, cv.width - 30, H + 72);
    this._shot = cv;
    this._shotFilter = 'normal';
    const url = cv.toDataURL('image/jpeg', 0.88);
    /* Miniature pour l'album. */
    const th = document.createElement('canvas');
    th.width = 240; th.height = Math.round(240 * cv.height / cv.width);
    th.getContext('2d').drawImage(cv, 0, 0, th.width, th.height);
    this.data.photos.unshift({ t: Date.now(), img: th.toDataURL('image/jpeg', 0.6), dest });
    this.data.photos = this.data.photos.slice(0, 12);
    this.data.stats.photos++;
    this.save();
    arc.event('photo');
    arc.giveCoins(2, { silent: true });
    const img = $('photoImg');
    if (img) img.src = url;
    const dl = $('photoSave');
    if (dl) { dl.href = url; dl.download = `carte-postale-${Date.now()}.jpg`; }
    $('photoPanel').classList.remove('hidden');
    this.sayKey('photo', 2, 2200);
  }

  /* Filtres de la carte postale (calcules pixel par pixel : compatibles Safari). */
  applyFilter(name) {
    if (!this._shot) return;
    const src = this._shot;
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const x = cv.getContext('2d');
    x.drawImage(src, 0, 0);
    if (name !== 'normal') {
      const W = src.width - 40, Hh = src.height - 110;   // seulement la photo, pas le cadre
      const im = x.getImageData(20, 20, W, Hh), d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        const l = r * 0.3 + g * 0.59 + b * 0.11;
        if (name === 'bw') { r = g = b = l * 1.05; }
        else if (name === 'warm') { r = r * 1.12 + 8; g = g * 1.02 + 2; b = b * 0.82; }
        else if (name === 'pop') { r = l + (r - l) * 1.7; g = l + (g - l) * 1.7; b = l + (b - l) * 1.7; r = (r - 128) * 1.12 + 128; g = (g - 128) * 1.12 + 128; b = (b - 128) * 1.12 + 128; }
        else if (name === 'vintage') { const s = l * 0.7; r = s + 62 + (r - l) * 0.3; g = s + 38 + (g - l) * 0.3; b = s + 18 + (b - l) * 0.3; }
        d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
      x.putImageData(im, 20, 20);
    }
    const url = cv.toDataURL('image/jpeg', 0.88);
    $('photoImg').src = url;
    const dl = $('photoSave');
    if (dl) dl.href = url;
    document.querySelectorAll('[data-pfilter]').forEach(b => b.classList.toggle('on', b.dataset.pfilter === name));
    /* la miniature de l'album suit le filtre choisi */
    if (this.data.photos[0]) {
      const th = document.createElement('canvas');
      th.width = 240; th.height = Math.round(240 * cv.height / cv.width);
      th.getContext('2d').drawImage(cv, 0, 0, th.width, th.height);
      this.data.photos[0].img = th.toDataURL('image/jpeg', 0.6);
      this.save();
    }
    sfx.pop();
  }

  openAlbum() {
    const box = $('photoAlbum');
    if (!box) return;
    this.g.closePause();
    const list = this.data.photos;
    $('photoAlbumGrid').innerHTML = list.length
      ? list.map(p => `<figure class="pa-item"><img src="${p.img}" alt="Photo"><figcaption>${p.dest} · ${new Date(p.t).toLocaleDateString('fr-FR')}</figcaption></figure>`).join('')
      : '<p class="panel-sub">Pas encore de photo : appuie sur 📸 pendant un vol !</p>';
    box.classList.remove('hidden');
    sfx.click();
  }

  /* ---------------- Coffre surprise ---------------- */
  openChest() {
    const btn = $('kidChest');
    if (!btn || btn.dataset.open === '1') return;
    btn.dataset.open = '1';
    /* Parfois, le coffre cache un objet pour le hangar (couleur, motif, autocollant). */
    const unlock = (Math.random() < 0.3 && this.g.hangar) ? this.g.hangar.randomUnlock() : null;
    if (unlock) {
      this.data.stats.chests++;
      this.save();
      sfx.chest();
      this.g.arcade.confetti(70);
      btn.classList.add('opened');
      btn.innerHTML = `<span class="chest-ico">${unlock.item.ico || '🎨'}</span><b>NOUVEAU pour ton hangar : ${unlock.label} !</b>`;
      return;
    }
    const total = GIFTS.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total, gift = GIFTS[0];
    for (const x of GIFTS) { r -= x.w; if (r <= 0) { gift = x; break; } }
    const n = gift.min + Math.floor(Math.random() * (gift.max - gift.min + 1));
    const arc = this.g.arcade;
    if (gift.kind === 'coins') arc.giveCoins(n, { silent: true });
    else if (gift.kind === 'xp') arc.giveXpQuiet(n);
    else if (gift.kind === 'boost') { this.data.pendingBoost = true; }
    this.data.stats.chests++;
    this.save();
    sfx.chest();
    arc.confetti(60);
    btn.classList.add('opened');
    btn.innerHTML = `<span class="chest-ico">${gift.ico}</span><b>${gift.text(n)}</b>`;
  }

  /* Une idee pour le prochain vol : toujours un « encore un ! » a portee de main. */
  nextTip() {
    const g = this.g, tips = [];
    const st = this.data.stats;
    if (!g.sky.data.done) tips.push('🎯 Essaie une MISSION au tableau de départ : ballons, course, pompier…');
    else if (!Object.values(g.sky.data.best).some(b => b.medal === 3)) tips.push("🥇 Vise une médaille d'OR sur une mission !");
    if (st.rolls + st.loops < 3) tips.push('🌀 En vol, essaie TONNEAU et LOOPING pour gagner des points !');
    if (g.openWorld.starCount < 8) tips.push('🌠 Des étoiles filantes sont cachées dans le ciel : cherche-les !');
    if (!g.openWorld.data.islands.length) tips.push("🏝️ Au nord-est, une mer et six îles t'attendent !");
    const h = g.hangar;
    if (g.arcade.coins >= 25 && !g.arcade.data.stats.hangarVisit) tips.push(`🎨 Tu as ${g.arcade.coins} pièces : passe à Mon hangar pour peindre ton avion !`);
    if (!h.planeOwned('hydravion') && g.arcade.data.level >= 2 && g.arcade.coins >= 120) tips.push("🛩️ Tu peux acheter l'Hydravion au hangar !");
    if (!h.planeOwned('zebulon') && g.arcade.data.level >= 3 && g.arcade.coins >= 150) tips.push('🛩️ Tu peux acheter le Zébulon (avion de voltige) au hangar !');
    if (!g.deco.data.items.length && g.arcade.coins >= 30) tips.push('🏗️ Construis ta place : fontaine, manège, grande roue…');
    const ast = g.arcade.data.stats;
    if (!(ast.tugTrips > 0)) tips.push('🚜 À l\'aéroport, monte dans le tracteur jaune et livre les valises à l\'avion !');
    if (!(ast.fires > 0)) tips.push('🚒 Quand l\'alarme sonne, cours à la caserne : tu peux conduire le camion de pompiers !');
    tips.push(...g.modules.tips());                  // conseils fournis par les modules du registre
    if (!tips.length) tips.push("🔁 Refais un vol : bats ton record d'étoiles et d'acrobaties !");
    return tips[Math.floor(Math.random() * tips.length)];
  }

  /* ---------------- Rapport de vol ---------------- */
  reportFx(rate, coinsTotal) {
    /* Etoiles : un son par etoile, au rythme de l'animation CSS. */
    for (let i = 0; i < rate.stars; i++) setTimeout(() => sfx.star(i + 1), 250 + i * 300);
    /* Compteur de pieces qui defile. */
    const el = $('kidRepCoins');
    if (el) {
      const t0 = performance.now(), dur = 1300;
      const step = () => {
        const u = clamp((performance.now() - t0) / dur, 0, 1);
        const n = Math.round(coinsTotal * (1 - Math.pow(1 - u, 3)));
        el.textContent = `+${n}`;
        if (Math.floor(u * 14) !== this._lastTick) { this._lastTick = Math.floor(u * 14); if (u < 1) sfx.tick(); }
        if (u < 1 && !$('kidReport').classList.contains('hidden')) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    /* Coffre. */
    const ch = $('kidChest');
    if (ch) {
      ch.dataset.open = '0';
      ch.classList.remove('opened');
      ch.innerHTML = '<span class="chest-ico">🎁</span><b>Ouvre ton coffre surprise !</b>';
      ch.classList.remove('hidden');
    }
    const line = [];
    if (this.stuntCount) line.push(`✨ ${this.stuntCount} acrobatie${this.stuntCount > 1 ? 's' : ''} : ${this.stuntScore} points (+${this.stuntCoins} 🪙)`);
    if (this.data.stats.bestStunt && this.stuntScore >= this.data.stats.bestStunt && this.stuntScore > 0) { this.sayKey('record', 3, 4200); line.push('🏆 Nouveau record d\'acrobaties !'); }
    line.push('👉 ' + this.nextTip());
    return line;
  }

  /* ---------------- Boucle ---------------- */
  update(dt) {
    const g = this.g;
    this._updateSelfie(dt);
    /* Mascotte : repos. */
    if (this.active && g.state === 'PILOT') {
      this._idleT -= dt;
      if (this._idleT <= 0) { this._idleT = 30 + Math.random() * 20; if (!g.ac.onGround && !g.assist.landing) this.sayKey('idle', 0, 3200); }
    }

    /* Ralenti (atterrissage parfait). */
    if (this._slowT > 0) {
      this._slowT -= dt;
      this.timeScale = 0.35;
      if (this._slowT <= 0) this.timeScale = 1;
    }

    const ac = g.ac;
    const flying = this.active && g.state === 'PILOT' && !ac.onGround && !g.reportShown;
    this._updateBoost(dt, flying);
    this.combo.t = Math.max(0, this.combo.t - dt);
    if (this.combo.t <= 0) this.combo.n = 0;
    this._updateTrail(dt, g.state === 'PILOT' && !ac.onGround);

    if (this.active && g.state === 'PILOT') {
      const f = this._flags;
      const agl = ac.pos.y - ac.groundY;
      if (!ac.onGround && !f.air) { f.air = true; this.sayKey('takeoff', 2, 2600); }
      if (f.air && !f.hint && agl > 260 && !this.data.stats.rolls && !this.data.stats.loops) { f.hint = true; this.sayKey('stuntHint', 2, 4200); $('btnRoll') && $('btnRoll').classList.add('hint-pulse'); }
      if (this.data.stats.rolls || this.data.stats.loops) $('btnRoll') && $('btnRoll').classList.remove('hint-pulse');
      if (g.assist.landing && !f.final) { f.final = true; this.sayKey('final', 2, 3000); }
      /* Atterrissage : reaction immediate au toucher. */
      if (ac.touchdown && ac.touchdown !== this._tdObj) {
        this._tdObj = ac.touchdown;
        const rate = g.arcade.rateLanding(ac.touchdown, ac.crashed);
        this._touchdownFx(rate);
        if (ac.crashed) this.sayKey('oops', 3, 4200);
        else if (rate.stars === 3) { this._slowT = 1.6; g.arcade.confetti(70); sfx.tada(); this.sayKey('star3', 3, 4200); }
        else if (rate.stars === 2) this.sayKey('star2', 3, 3600);
        else this.sayKey('star1', 3, 3600);
      }
    }
    this._renderHud();
  }

  _renderHud() {
    const g = this.g;
    const show = this.active && g.state === 'PILOT' && !g.reportShown;
    const pad = $('funPad');
    if (pad) pad.classList.toggle('hidden', !show);
    if (!show) return;
    const ac = g.ac;
    const ok = !ac.onGround && !g.assist.landing && (ac.pos.y - ac.groundY) >= STUNT_MIN_AGL && ac.tas * KTS >= ac.stuntMinKt && !this.stunt;
    ['btnRoll', 'btnLoop'].forEach(id => { const b = $(id); if (b) { b.classList.toggle('dim', !ok); b.classList.toggle('hidden', !!ac.heli); } });
    const hb = $('btnHover');
    if (hb) { hb.classList.toggle('hidden', !ac.heli); hb.classList.toggle('on', !!(ac.heli && ac.heli.hover)); hb.querySelector('small').textContent = ac.heli && ac.heli.hover ? 'AVANCER' : 'STOP'; }
    const tb = $('btnTurbo');
    if (tb) { tb.classList.toggle('dim', ac.onGround || this.boostGauge < BOOST_MIN); tb.classList.toggle('on', this.boosting); }
    const fill = $('turboFill');
    if (fill) fill.style.height = `${Math.round(this.boostGauge * 100)}%`;
    const chip = $('stuntChip');
    if (chip) {
      const txt = this.stuntCount ? `✨ ${this.stuntScore}${this.combo.n > 1 ? ` · x${this.combo.n}` : ''}` : '';
      chip.classList.toggle('hidden', !txt);
      if (chip.textContent !== txt) chip.textContent = txt;
      chip.classList.toggle('combo', this.combo.n > 1);
    }
  }
}
