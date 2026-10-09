/* ============================================================
   rides.js — Montures et skatepark (phase 40)

   Skate, trottinette, BMX, rollers, hoverboard : on les enfourche en un
   bouton (🛹) n'importe ou sur le tarmac, on roule 2 a 3 fois plus vite
   qu'a pied, on saute, on tourne dans les airs, on glisse sur les rails
   et on enchaine des figures en combo. Le skatepark (js/ridePark.js) est
   pose sur l'aire, entre la tour et la ligne de cones.

   Ce module est la colle : il lit les commandes, fait avancer la
   physique pure (ridePhysics.js) avec les collisions du graphe de
   navigation, pose l'avatar sur la monture (rideIK.js, rideModels.js),
   pilote la camera, les effets, les sons et l'interface.

   Controles : joystick / fleches = diriger (en l'air : tenir = tourner),
   SAUT (Espace) = sauter, plus longtemps = plus haut, FIGURE (F) = figure
   en l'air (joystick : gauche / droite / haut = flip avant / bas = flip
   arriere ; maintenir = grab) ou manual / wheelie a terre, TURBO (Maj).
   ============================================================ */

import * as THREE from 'three';
import { RideBody, RIDES, RIDE_IDS } from './ridePhysics.js?v=1791559282';
import { buildPark, PARK } from './rideCourse.js?v=1791559282';
import { buildParkMeshes } from './ridePark.js?v=1791559282';
import { buildRide } from './rideModels.js?v=1791559282';
import { findBones, twoBone, rotateWorld } from './rideIK.js?v=1791559282';
import { slideMove, collectBodies } from './bodies.js?v=1791559282';
import { sfx } from './sfx.js?v=1791559282';
import { Particles } from './particles.js?v=1791559282';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const STORE = 'skymanager.rides';
const PARK_TIME = 25;                 // s avant que la monture laissee au sol disparaisse
const WIPE_TIME = 1.1;

const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/* ---------------- Effets : poussiere, etincelles, etoiles ---------------- */
class FX extends Particles {
  /* Etincelle / poussiere : part avec une vitesse, retombe et rebondit sur le sol. */
  emit(x, y, z, vx, vy, vz, hex, life = 0.6) {
    this.spawn(x, y, z, hex, { vx, vy, vz, life, gravity: 9, floor: 0.02, size: 0.3, opacity: 0.95 });
  }
}

/* ---------------- Son de roulage (continu) ---------------- */
class RollAudio {
  constructor() { this.nodes = null; }
  _make(kind) {
    const a = sfx.context();
    if (!a) return null;
    const dur = 1.5, buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9; bp.frequency.value = 400;
    const g = a.createGain(); g.gain.value = 0;
    const hum = a.createOscillator(); hum.type = kind === 'hover' ? 'sine' : 'triangle'; hum.frequency.value = 80;
    const hg = a.createGain(); hg.gain.value = 0;
    src.connect(bp).connect(g).connect(sfx.dest(a));
    hum.connect(hg).connect(sfx.dest(a));
    src.start(); hum.start();
    return { a, src, bp, g, hum, hg, kind };
  }
  set(kind, speed, grounded, grind, top) {
    if (!this.nodes && speed > 0.3) this.nodes = this._make(kind);
    const n = this.nodes;
    if (!n) return;
    if (n.kind !== kind) { this.stop(); return; }
    const t = n.a.currentTime, k = clamp(speed / top, 0, 1.3);
    const surface = grind ? 0.16 : grounded ? 0.07 : 0.0;
    n.g.gain.setTargetAtTime(surface * Math.min(1, speed / 5), t, 0.05);
    n.bp.frequency.setTargetAtTime(grind ? 2600 : 260 + k * 900, t, 0.06);
    n.hg.gain.setTargetAtTime(kind === 'hover' ? 0.05 + k * 0.05 : 0, t, 0.08);
    n.hum.frequency.setTargetAtTime(kind === 'hover' ? 110 + k * 220 : 80, t, 0.08);
  }
  stop() {
    const n = this.nodes;
    if (!n) return;
    try {
      const t = n.a.currentTime;
      n.g.gain.setTargetAtTime(0, t, 0.05); n.hg.gain.setTargetAtTime(0, t, 0.05);
      n.src.stop(t + 0.3); n.hum.stop(t + 0.3);
    } catch (e) { /* ignore */ }
    this.nodes = null;
  }
}

export class Rides {
  constructor(game) {
    this.g = game;
    this.data = this._load();
    this.course = buildPark();
    this.body = new RideBody(this.data.last);
    this.active = false;
    this.models = {};
    this.btn = { jump: false, trick: false, boost: false };
    this.rig = new THREE.Group(); this.rig.matrixAutoUpdate = false; this.rig.visible = false; this.rig.name = 'ride';
    this.parked = null;               // { t, id } monture laissee au sol
    this.bones = null; this.H0 = 0.95;
    this.t = 0; this.dist = 0; this.pedal = 0; this.stride = 0; this.push = 0; this.sway = 0;
    this.poseW = 0; this.poseName = null; this.camH = 0; this.km = 0; this.kmAcc = 0; this.wheelie = 0;
    this._lastAir = false; this._audio = new RollAudio(); this._posed = false;
    this._bodies = null;
    try {
      const r3d = game.r3d;
      this.group = new THREE.Group(); this.group.name = 'rides';
      r3d.airport.add(this.group);
      this.parkMesh = buildParkMeshes(this.course, 'SKATEPARK');
      this.group.add(this.parkMesh);
      this.group.add(this.rig);
      this.fx = new FX(this.group, 160);
    } catch (e) { console.error('[rides] scene', e); }
    this._bind();
  }

  /* ---------------- Donnees ---------------- */
  _load() {
    const def = { last: 'skate', owned: ['skate', 'scooter'], best: 0, tricks: 0, tried: [], tips: {} };
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (d) {
        const o = Object.assign(def, d);
        o.owned = [...new Set([...(d.owned || []), 'skate', 'scooter'])];
        if (!RIDES[o.last] || !o.owned.includes(o.last)) o.last = 'skate';
        o.tried = d.tried || []; o.tips = d.tips || {};
        return o;
      }
    } catch (e) { /* ignore */ }
    return def;
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }

  get R() { return RIDES[this.body.id]; }

  /* ---------------- Interface ---------------- */
  _bind() {
    const hold = (id, key) => {
      const el = $(id);
      if (!el) return;
      const on = (e) => { this.btn[key] = true; el.classList.add('down'); try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } e.preventDefault(); };
      const off = () => { this.btn[key] = false; el.classList.remove('down'); el.blur(); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    hold('rideJump', 'jump'); hold('rideTrick', 'trick'); hold('rideBoost', 'boost');
    document.addEventListener('visibilitychange', () => { if (document.hidden) this._audio.stop(); });

    const rb = $('rideBtn');
    if (rb) rb.addEventListener('click', () => { rb.blur(); sfx.click(); this.active ? this.dismount() : this.openPicker(); });
    const cl = $('rideClose');
    if (cl) cl.addEventListener('click', () => this.closePicker());
    window.addEventListener('keydown', (e) => {
      const g = this.g;
      if (!g.arcade.on || g.state !== 'HUB' || (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) return;
      if (e.code === 'Space' && this.active) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'KeyR') {
        if (this.pickerOpen) { this.closePicker(); return; }
        if (this.active) this.dismount(); else this.mount(this.data.last);
      }
      if (this.pickerOpen) {
        const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
        if (i >= 0 && RIDE_IDS[i]) this.choose(RIDE_IDS[i]);
      }
    });
  }

  get pickerOpen() { const p = $('ridePicker'); return !!p && !p.classList.contains('hidden'); }

  openPicker() {
    if (!this._canRide(true)) return;
    const host = $('rideList');
    if (!host) return;
    host.innerHTML = RIDE_IDS.map((id, i) => {
      const R = RIDES[id], owned = this.data.owned.includes(id), cur = this.active && this.body.id === id;
      const coins = this.g.arcade.coins;
      const price = owned ? (cur ? 'Sur ta monture' : 'Choisir') : `🪙 ${R.price}${coins < R.price ? ' (manque ' + (R.price - coins) + ')' : ''}`;
      return `<button class="ride-card${owned ? '' : ' locked'}${cur ? ' cur' : ''}" data-ride="${id}" style="--rc:${R.color}">
        <span class="rc-ico">${R.ico}</span>
        <span class="rc-body"><b>${R.name}</b><small>${R.desc}</small></span>
        <span class="rc-act">${price}</span><kbd>${i + 1}</kbd></button>`;
    }).join('');
    host.querySelectorAll('[data-ride]').forEach(b => b.addEventListener('click', () => this.choose(b.dataset.ride)));
    $('ridePicker').classList.remove('hidden');
    this.g._worldPaused = true;
    sfx.pop();
  }

  closePicker() {
    const p = $('ridePicker');
    if (p) p.classList.add('hidden');
    this.g._worldPaused = false;
  }

  choose(id) {
    const R = RIDES[id];
    if (!R) return;
    if (!this.data.owned.includes(id)) {
      const g = this.g;
      if (g.arcade.coins < R.price) { sfx.oops(); g.toast(`Il te faut ${R.price} 🪙 pour ${R.name} : continue à jouer !`, 2400, 'warn'); return; }
      g.tycoon.cash -= R.price * 1000; g.tycoon.save();
      this.data.owned.push(id); this.save();
      sfx.tada(); g.arcade.confetti(50);
      g.toast(`${R.ico} ${R.name} débloqué ! Bon ride !`, 3000, 'ok');
    }
    this.closePicker();
    this.mount(id);
  }

  /* ---------------- Monter / descendre ---------------- */
  _canRide(msg = false) {
    const g = this.g;
    const why = !g.arcade.on ? 'Les montures sont dans le mode Arcade.'
      : g.state !== 'HUB' ? ''
      : g.controlled ? 'Rends d\'abord le contrôle de l\'agent.'
      : g.driving ? 'Descends d\'abord du vehicule.'
      : g.inTerminal ? 'Pas de roulettes dans le terminal ! Sors d\'abord.'
      : g.hangar.active || g.deco.active ? 'Ferme d\'abord cet écran.' : null;
    if (why === null) return true;
    if (msg && why) g.toast(why, 2200, 'warn');
    return false;
  }

  mount(id) {
    const g = this.g;
    if (!RIDES[id] || !this._canRide(true)) return;
    if (this.active) this._release(false);
    const p = g.player.pos;
    this.body.setRide(id);
    this.body.reset(p.x, p.z, g.player.heading, 2.2);
    this.body.y = this.course.heightAt(p.x, p.z);
    this._model(id);
    this.data.last = id;
    if (!this.data.tried.includes(id)) {
      this.data.tried.push(id);
      g.arcade.event('rideKind');
    }
    this.save();
    g.arcade.event('ride');
    this.active = true;
    this.parked = null;
    this.poseW = 0; this.poseName = null; this.camH = g.player.heading; this.wheelie = 0;
    g.player.moving = false;
    this._measure();
    this._ui(true);
    this.rig.visible = true;
    sfx.pop();
    const R = RIDES[id];
    g.toast(`${R.ico} ${R.name} ! Pousse le joystick pour rouler.`, 2400, 'ok');
    this._tip('jump', 'Appuie sur SAUT pour sauter. Plus tu appuies longtemps, plus tu sautes haut !');
    g.arcade.checkBadges();
  }

  dismount(silent = false) {
    if (!this.active) return;
    const g = this.g;
    this._release(true);
    if (!silent) { sfx.pop(); g.toast('Tu poses ta monture. Appuie sur 🛹 pour repartir !', 1800); }
  }

  /* Quitte la monture : la monture reste un moment au sol, l'avatar se remet debout. */
  _release(park) {
    const g = this.g, b = this.body;
    this.active = false;
    this._bank();
    const P = g.player;
    P.pos.set(b.x, b.grounded ? b.y : this.course.heightAt(b.x, b.z), b.z);
    P.heading = b.h; P.moving = false; P.rideCam = null; P.camHeading = null;
    this._audio.stop();
    if (park) { this.parked = { t: PARK_TIME, id: b.id }; this._poseParked(); }
    else this.rig.visible = false;
    this._ui(false);
  }

  _ui(on) {
    const pad = $('ridePad'), hud = $('rideHud'), rb = $('rideBtn');
    if (pad) pad.classList.toggle('hidden', !on);
    if (hud) hud.classList.toggle('hidden', !on);
    if (rb) { rb.classList.toggle('on', on); rb.firstElementChild && (rb.firstElementChild.textContent = on ? RIDES[this.body.id].ico : '🛹'); }
    document.body.classList.toggle('riding', on);
    if (on) this._updateBoostUi();
    else { const sl = $('speedLines'); if (sl) sl.style.opacity = '0'; }
  }

  _tip(key, text) {
    if (this.data.tips[key]) return;
    this.data.tips[key] = 1; this.save();
    try { this.g.fun.say(text, 2, 4200); } catch (e) { /* ignore */ }
  }

  _model(id) {
    if (!this.models[id]) { this.models[id] = buildRide(id); this.rig.add(this.models[id].root); }
    for (const k in this.models) this.models[k].root.visible = (k === id);
    this.cur = this.models[id];
  }

  /* Hauteur des hanches debout (pour caler la pose). */
  _measure() {
    const r3d = this.g.r3d, A = r3d.player && r3d.player.group;
    const sc = A && r3d.player.avatar && r3d.player.avatar.userData.model && r3d.player.avatar.userData.model.scene;
    if (!sc) return;
    if (!this.bones) this.bones = findBones(sc);
    if (!this.bones) return;
    A.updateMatrixWorld(true);
    this.bones.hips.getWorldPosition(_v1);
    A.getWorldPosition(_v2);
    const h = _v1.y - _v2.y;
    if (h > 0.5 && h < 1.5 && !this._measured) { this.H0 = h; this._measured = true; }
  }

  /* ---------------- Etat du joueur a pied : relief et marche ---------------- */
  /* Hauteur du sol (rampes comprises) : sert aussi au joueur a pied. */
  surface(x, z) { return this.course.heightAt(x, z); }
  /* Un pieton ne grimpe pas un mur de rampe (> 0.45 m) mais marche sur les pentes douces. */
  walkable(x, z, y) { return this.course.heightAt(x, z) - (y || 0) <= 0.45; }

  /* ---------------- Boucle (une fois par image, avant les controleurs) ---------------- */
  update(dt) {
    const g = this.g;
    this.t += dt;
    if (this.fx) {
      const cam = g.r3d.camera;
      this.fx.setViewport(g.r3d.renderer.domElement.height, cam ? cam.fov : 60);
      this.fx.update(dt);
    }
    /* H01 : projecteurs allumes la nuit seulement (on ne change qu'au besoin). */
    if (this.parkMesh && this.parkMesh.userData.setNight) {
      const night = g.r3d._lightsOn === true;
      if (night !== this._parkNight) { this._parkNight = night; this.parkMesh.userData.setNight(night); }
    }
    if (this.parked) {
      this.parked.t -= dt;
      if (this.parked.t <= 0) { this.parked = null; if (!this.active) this.rig.visible = false; }
    }
    const arc = g.arcade.on;
    if (this.active) {
      /* Cas ou la monture ne peut pas continuer. */
      if (!arc || g.state !== 'HUB' || g.controlled) { this._release(false); return; }
      if (g.inTerminal) { this.dismount(true); g.toast('🛹 Tu laisses ta monture devant le terminal.', 2200); return; }
      if (g.hangar.active || g.deco.active) { this.dismount(true); return; }
    } else if (this.rig.visible && !this.parked) this.rig.visible = false;
    if (g.state !== 'HUB' && this.pickerOpen) this.closePicker();
    /* Petite presentation, une seule fois, quand le tutoriel est fini. */
    if (!this.active && arc && g.state === 'HUB' && g.arcade.data.tutorialDone && !this.data.tips.intro && !g._worldPaused) {
      this._tip('intro', 'Nouveau : appuie sur 🛹 pour rouler en skate, trottinette ou BMX. Le skatepark est près de la tour !');
    }
    this._updateHud();
  }

  /* ---------------- Mouvement (appele par main.updateHub) ---------------- */
  drive(dt) {
    const g = this.g, b = this.body, P = g.player, R = this.R;
    if (g._worldPaused) { this._audio.stop(); return; }
    const { move, turn } = g.hubCtl.read();
    const k = g.hubCtl.keys;
    const inp = {
      move, turn,
      jump: this.btn.jump || k.has('Space'),
      trick: this.btn.trick || k.has('KeyF') || k.has('KeyJ'),
      boost: this.btn.boost || k.has('ShiftLeft') || k.has('ShiftRight')
    };
    const bodies = collectBodies(g);
    const nav = g.nav, hull = (x, z) => g.agents._clearOfHull(null, x, z);
    const env = {
      course: this.course,
      resolve: (x0, z0, x1, z1) => slideMove(nav, { x: x0, z: z0 }, { x: x1, z: z1 }, bodies, hull)
    };
    const ox = b.x, oz = b.z;
    const evs = b.step(dt, inp, env);
    const d = Math.hypot(b.x - ox, b.z - oz);
    this.dist = d;
    P.pos.set(b.x, b.y, b.z);
    P.heading = b.h;
    P.moving = false;

    for (const e of evs) this._event(e);
    this._camera(dt);
    this._audioUpdate();

    /* effets continus */
    const fx = this.fx, sp = b.speed;
    if (fx) {
      if (b.grind) { if (Math.random() < 0.9) fx.emit(b.x, b.y + 0.05, b.z, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3, 0xffb020, 0.35); }
      else if (b.grounded && sp > 6 && R.hover > 0 && Math.random() < 0.7) fx.emit(b.x - Math.sin(b.h) * 0.6, 0.15, b.z - Math.cos(b.h) * 0.6, (Math.random() - 0.5), 0.3, (Math.random() - 0.5), 0x22d3ee, 0.5);
      else if (b.grounded && b.boosting && Math.random() < 0.8) fx.emit(b.x - Math.sin(b.h) * 0.7, 0.2, b.z - Math.cos(b.h) * 0.7, (Math.random() - 0.5) * 2, 0.4, (Math.random() - 0.5) * 2, 0x38bdf8, 0.4);
      else if (b.grounded && Math.abs(b.yawRate) > 1.6 && sp > 5 && Math.random() < 0.5) fx.emit(b.x, 0.08, b.z, (Math.random() - 0.5), 0.5, (Math.random() - 0.5), 0xcbd5e1, 0.4);
    }
    /* distance parcourue : trophee « Globe-rider » */
    this.kmAcc += d;
    if (this.kmAcc >= 100) { g.arcade.event('rideKm', this.kmAcc / 1000); this.kmAcc = 0; }
    /* wheelie / manual long */
    this.wheelie = b.manual ? this.wheelie + dt : 0;
    if (this.wheelie > 5 && !this._wheelieDone) { this._wheelieDone = true; g.arcade.event('wheelie'); g.arcade.checkBadges(); }
    if (!b.manual) this._wheelieDone = false;
    /* La zone du skatepark : petite fierte. */
    if (b.speed > 3 && this.course.inPark(b.x, b.z)) this._tip('trick', 'En l\'air, appuie sur FIGURE pour une figure ! Maintiens-le pour attraper la planche.');
  }

  /* ---------------- Evenements de la physique ---------------- */
  _event(e) {
    const g = this.g, b = this.body, A = g.arcade;
    switch (e.t) {
      case 'jump':
        if (e.power > 0) { sfx.ollie(); if (this.fx) this.fx.burst(b.x, 0.1, b.z, 6, 0xd1d5db, 1.8, 1, 0.45); }
        break;
      case 'boost': sfx.boost(); break;
      case 'hint': this._tip('flip', 'Pour un flip, saute plus haut : maintiens SAUT plus longtemps ou prends une rampe !'); break;
      case 'trick':
        sfx.trick(b.chain.n);
        this._banner(e.name, e.kind === 'manual' ? 'm' : '');
        if (e.kind === 'board' || e.kind === 'grab' || e.kind === 'flip') this._tip('grind', 'Saute vers un rail jaune pour glisser dessus : c\'est un grind !');
        break;
      case 'grind':
        sfx.grindOn(); this._banner(e.name, 'g');
        break;
      case 'grindEnd': A.event('grind'); A.checkBadges(); break;
      case 'bump':
        sfx.bump(e.speed);
        if (this.fx) this.fx.burst(b.x, 0.6, b.z, 8, 0xfef08a, 2.5, 2, 0.4);
        break;
      case 'land': {
        const hard = clamp((e.airT || 0) / 1.1, 0.3, 1.4);
        if (e.quality === 'crash') {
          sfx.crash(); this._banner('Aïe ! 💫', 'x');
          if (this.fx) { this.fx.burst(b.x, 1.2, b.z, 18, 0xfde047, 3.5, 4, 0.9); this.fx.burst(b.x, 0.2, b.z, 10, 0xd1d5db, 3, 1.5, 0.6); }
          this._camKick = 1;
        } else {
          sfx.land(hard);
          if (this.fx) this.fx.burst(b.x, 0.08, b.z, 8 + Math.round(hard * 6), 0xd1d5db, 2.2, 1.2, 0.5);
          if (e.quality === 'sketchy') this._banner('Un peu bancal !', 'm');
          else if (e.tricks && e.tricks.length) this._banner(e.tricks.slice(-3).join(' + '), 'ok');
          if ((e.height || 0) > 4) { A.event('bigair'); A.checkBadges(); }
        }
        if (e.quality !== 'crash' && e.tricks && e.tricks.length) {
          const n = e.tricks.filter(t => !/^Air /.test(t)).length;
          if (n) { this.data.tricks += n; A.event('trick', n); A.checkBadges(); }
        }
        break;
      }
      case 'bank': this._onBank(e); break;
      default: break;
    }
  }

  _onBank(e) {
    const g = this.g, A = g.arcade;
    const coins = clamp(Math.floor(e.score / 90), 1, 40);
    A.giveCoins(coins, { silent: true, xp: Math.min(30, Math.floor(e.score / 60)) });
    sfx.coin();
    this._banner(`+${e.score} pts  ·  +${coins} 🪙`, 'bank');
    if (e.score > this.data.best) { this.data.best = e.score; this.save(); if (e.score >= 400) { sfx.tada(); A.confetti(40); } }
    const s = A.data.stats;
    if (e.score > (s.bestTrick || 0)) { s.bestTrick = e.score; A.save(); }
    A.checkBadges();
  }

  /* Le combo en cours est banque quand on quitte la monture. */
  _bank() {
    const b = this.body;
    if (b.chain.pts > 0) { b._bank(); for (const e of b.events) if (e.t === 'bank') this._onBank(e); b.events = []; }
  }

  /* ---------------- Camera ---------------- */
  _camera(dt) {
    const b = this.body, P = this.g.player, sp = b.speed;
    let d = b.h - this.camH; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.camH += d * Math.min(1, dt * (b.grind ? 3 : 4.5));
    P.camHeading = this.camH;
    const air = !b.grounded && !b.grind;
    this._camKick = Math.max(0, (this._camKick || 0) - dt * 2);
    P.rideCam = {
      dist: 7.4 + sp * 0.16 + (air ? 0.8 : 0) + (b.boosting ? 1.2 : 0) - this._camKick * 0.6,
      height: 2.9 + sp * 0.02 + (air ? Math.min(1.2, (b.y - b.surfY) * 0.25) : 0),
      look: 1.1, ahead: 2.6 + sp * 0.14,
      fov: 60 + clamp(sp * 0.85, 0, 15) + (b.boosting ? 7 : 0),
      follow: 6.5
    };
  }

  _audioUpdate() {
    const b = this.body, R = this.R;
    this._audio.set(R.id, b.speed, b.grounded || !!b.grind, !!b.grind, R.top);
  }

  /* ---------------- Rendu : monture + avatar (apres updateHubScene) ---------------- */
  afterScene(dt) {
    const g = this.g, r3d = g.r3d;
    const A = r3d.player && r3d.player.group;
    if (!A) return;
    if (!this.active) {
      if (this._posed) {
        /* retour a la marche : on remet l'avatar droit (l'animation reprend seule) */
        A.quaternion.identity(); A.rotation.set(0, g.player.heading, 0);
        this._posed = false;
      }
      if (this.parked && this.rig.visible) this._poseParked();
      return;
    }
    const b = this.body, R = this.R, M = this.cur;
    if (!M) return;
    this._posed = true;
    if (!this.bones) this._measure();

    /* ----- phases animees ----- */
    const sp = b.speed;
    this.pedal += (g.hubCtl && b.grounded ? sp * dt / 0.5 : 0) * (b.fs >= 0 ? 1 : -1);
    this.stride += dt * (2 + sp * 0.5) * (b.grounded ? 1 : 0.3);
    this.sway += (clamp(b.yawRate * 0.3, -1, 1) - this.sway) * Math.min(1, dt * 6);
    const pushing = R.id === 'scooter' || R.id === 'skate' ? (b.grounded && b.fs < R.top * 0.7 && Math.abs(this._lastMove || 0) > 0.1) : false;
    this._lastMove = g.hubCtl ? g.hubCtl.read().move : 0;
    if (pushing) this.push += dt * 1.7;

    /* figure en cours (planche + pose du corps) */
    const anim = b.boardAnim();
    let poseName = null, wT = 0;
    if (anim && anim.def.anim.pose) { poseName = anim.def.anim.pose; wT = Math.sin(Math.PI * clamp(anim.p, 0, 1)); }
    if (b.air && b.air.grab) { poseName = R.grab.pose || 'grab'; wT = Math.min(1, b.air.grab.t * 8); }
    if (anim && anim.def.anim.tilt === undefined && !poseName && anim.def.id === 'nohander') { poseName = 'nohand'; wT = Math.sin(Math.PI * anim.p); }
    this.poseName = poseName || this.poseName;
    this.poseW += ((poseName ? wT : 0) - this.poseW) * Math.min(1, dt * 14);
    if (this.poseW < 0.01 && !poseName) this.poseName = null;

    const st = {
      dist: this.dist, steer: clamp(-b.yawRate / 3, -1, 1), anim, t: this.t, speed: sp, boost: b.boosting, pedal: this.pedal,
      crouch: b.crouch, air: !b.grounded && !b.grind, manual: b.manual, push: this.push, pushing, stride: this.stride,
      glide: b.grounded ? clamp(sp / 6, 0.2, 1) : 0.3, sway: this.sway, H0: this.H0, poseName: this.poseName, poseW: this.poseW
    };
    const pose = M.pose(st);
    const mi = { footL: pose.footL, footR: pose.footR };
    const upd = M.update({ ...st, ...mi });

    /* ----- transformation de la monture ----- */
    const air = b.air;
    const yaw = b.h + (air ? air.spin : 0);
    const flip = air ? air.flip : 0;
    const roll = b.lean + (upd.tilt || 0) * 0.5;
    const pitch = b.pitch;
    this._rigMatrix(b.x, b.y, b.z, yaw, flip, roll, pitch, M.rear);
    const wipe = b.wipe > 0 ? clamp(1 - b.wipe / WIPE_TIME, 0, 1) : -1;
    this.rig.matrixWorldNeedsUpdate = true;
    this.rig.updateMatrixWorld(true);

    /* ----- avatar ----- */
    this._poseAvatar(A, pose, wipe, dt);

    /* halo / traînée de l'hoverboard et lumiere de la nuit : rien d'autre a faire */
  }

  _rigMatrix(x, y, z, yaw, flip, roll, pitch, rearZ) {
    const m = this.rig.matrix;
    m.makeTranslation(x, y, z);
    m.multiply(_m1.makeRotationY(yaw));
    if (flip) { m.multiply(_m2.makeTranslation(0, 0.9, 0)); m.multiply(_m1.makeRotationX(flip)); m.multiply(_m2.makeTranslation(0, -0.9, 0)); }
    if (roll) m.multiply(_m1.makeRotationZ(roll));
    if (pitch) { m.multiply(_m2.makeTranslation(0, 0, rearZ)); m.multiply(_m1.makeRotationX(-pitch)); m.multiply(_m2.makeTranslation(0, 0, -rearZ)); }
  }

  /* Pose l'avatar : le bassin d'abord, puis jambes et bras par cinematique inverse. */
  _poseAvatar(A, pose, wipe, dt) {
    const rig = this.rig;
    const par = A.parent;
    /* matrice monde de l'avatar : monture * T(bassin) * Ry(yaw) * Rx(penche) * T(0, -H0, 0) */
    _m3.copy(rig.matrixWorld);
    _m3.multiply(_m1.makeTranslation(pose.hip[0], pose.hip[1], pose.hip[2]));
    _m3.multiply(_m1.makeRotationY(pose.yaw));
    _m3.multiply(_m1.makeRotationX(pose.lean));
    if (wipe >= 0) {
      /* chute : on bascule en arriere puis on se releve */
      const fall = Math.sin(Math.PI * wipe);
      _m3.multiply(_m1.makeRotationX(-fall * 1.35)); _m3.multiply(_m1.makeRotationZ(Math.sin(wipe * 9) * 0.25 * fall));
    }
    _m3.multiply(_m1.makeTranslation(0, -this.H0, 0));
    if (par) { par.updateMatrixWorld(); _m3.premultiply(_m2.copy(par.matrixWorld).invert()); }
    _m3.decompose(A.position, A.quaternion, _v1);
    A.scale.set(1, 1, 1);
    A.updateMatrixWorld(true);
    if (!this.bones || wipe >= 0) return;
    const B = this.bones;

    /* ---- jambes ---- */
    const world = (p) => rig.localToWorld(_v2.set(p[0], p[1], p[2])).clone();
    const fwdW = _v3.set(0, 0, 1).transformDirection(A.matrixWorld).clone();
    const leftW = _v4.set(1, 0, 0).transformDirection(A.matrixWorld).clone();
    const kneeL = fwdW.clone().multiplyScalar(1).addScaledVector(leftW, 0.25 + (pose.knee || 0));
    const kneeR = fwdW.clone().multiplyScalar(1).addScaledVector(leftW, -0.25 - (pose.knee || 0));
    twoBone(B.lUp, B.lLeg, B.lFoot, world(pose.footL), kneeL);
    twoBone(B.rUp, B.rLeg, B.rFoot, world(pose.footR), kneeR);

    /* ---- tete : reste a l'horizontale et regarde dans le sens de la marche ---- */
    _q1.setFromAxisAngle(leftW, -pose.lean * 0.55);
    rotateWorld(B.spine2, _q1);
    if (Math.abs(pose.yaw) > 0.05) { _q2.setFromAxisAngle(UP, -pose.yaw * 0.6 * (1 - 0 * this.poseW)); rotateWorld(B.neck, _q2); }

    /* ---- bras ---- */
    const hand = (h) => {
      if (h.av) return A.localToWorld(_v2.set(h.p[0], h.p[1] + this.H0 - 0.95, h.p[2])).clone();
      if (h.rigGrab) { const w = world(h.p); return w; }
      return world(h.p);
    };
    const hl = hand(pose.handL), hr = hand(pose.handR);
    const upW = new THREE.Vector3(0, -1, 0);
    const elL = upW.clone().multiplyScalar(0.7).addScaledVector(leftW, 0.8).addScaledVector(fwdW, -0.4);
    const elR = upW.clone().multiplyScalar(0.7).addScaledVector(leftW, -0.8).addScaledVector(fwdW, -0.4);
    twoBone(B.lArm, B.lFore, B.lHand, hl, elL);
    twoBone(B.rArm, B.rFore, B.rHand, hr, elR);
  }

  /* Monture laissee au sol : posee debout, sans conducteur. */
  _poseParked() {
    const b = this.body;
    if (!this.cur || !this.models[this.parked ? this.parked.id : b.id]) return;
    this._model(this.parked ? this.parked.id : b.id);
    const y = this.course.heightAt(b.x, b.z);
    this._rigMatrix(b.x, y, b.z, b.h, 0, 0.0, 0, 0);
    this.rig.matrixWorldNeedsUpdate = true;
    this.rig.visible = true;
    /* roulette arretee, sans pose d'avatar : on lui donne une position de repos neutre */
    const st = { dist: 0, steer: 0, anim: null, t: this.t, speed: 0, boost: false, pedal: this.pedal, crouch: 0, air: false, manual: false, push: 0, pushing: false, stride: 0, glide: 0, sway: 0, H0: this.H0, poseName: null, poseW: 0 };
    const pose = this.cur.pose(st);
    this.cur.update({ ...st, footL: [pose.footL[0] + 0.6, pose.footL[1], pose.footL[2]], footR: [pose.footR[0] + 0.6, pose.footR[1], pose.footR[2]] });
    this.rig.updateMatrixWorld(true);
  }

  /* ---------------- Interface en jeu ---------------- */
  _banner(text, cls = '') {
    const el = $('rideBanner');
    if (!el) return;
    el.textContent = text;
    el.className = 'ride-banner ' + cls;
    void el.offsetWidth;
    el.classList.add('go');
  }

  _updateBoostUi() {
    const f = $('rideBoostFill');
    if (f) f.style.height = `${Math.round(this.body.boost * 100)}%`;
  }

  _updateHud() {
    const rb = $('rideBtn');
    if (rb) rb.classList.toggle('hidden', !this.g.arcade.on);
    if (!this.active) return;
    const b = this.body, c = b.chain;
    const sp = Math.round(b.speed * 3.6);
    if (sp !== this._sp) { this._sp = sp; const e = $('rhSpeed'); if (e) e.textContent = sp; }
    const box = $('rhCombo');
    const on = c.pts > 0 || c.n > 0 || b.manual || !!b.grind;
    if (box) box.classList.toggle('hidden', !on);
    if (on) {
      const names = c.names.slice(-3).join(' + ');
      if (names !== this._names) { this._names = names; const e = $('rhNames'); if (e) e.textContent = names || (b.manual ? this.R.manual : b.grind ? this.R.slide : ''); }
      const pts = Math.round(c.pts);
      if (pts !== this._pts) { this._pts = pts; const e = $('rhPts'); if (e) e.textContent = pts; }
      const mu = `x${c.mult.toFixed(1).replace('.0', '')}`;
      if (mu !== this._mu) { this._mu = mu; const e = $('rhMult'); if (e) e.textContent = mu; }
      const bar = $('rhBank'); if (bar) bar.style.width = `${Math.round(clamp(1 - c.idle / 1.8, 0, 1) * 100)}%`;
    }
    const tot = $('rhTotal'); if (tot && tot.textContent !== String(b.total)) tot.textContent = b.total;
    this._updateBoostUi();
    const bst = $('rideBoost'); if (bst) bst.classList.toggle('on', b.boosting);
    const sl = $('speedLines');
    if (sl) sl.style.opacity = b.boosting ? '0.7' : String(clamp((b.speed - this.R.top * 0.85) / 8, 0, 0.35));
  }

  /* Pour la carte : le skatepark. */
  static get PARK() { return PARK; }
}
