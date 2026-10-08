/* ============================================================
   music.js — Musique dynamique (mode Arcade, vague 6)

   Une petite musique generee en direct (Web Audio, aucun fichier) :
   accords doux a l'aeroport, melodie legere en vol, rythme plus
   rapide pendant le turbo, les missions et les acrobaties.
   Quatre couches (nappe, basse, arpege, percussions) dont le volume
   suit l'« intensite » demandee, avec des fondus.

   Intensite : 0 = calme (sol), 1 = vol, 2 = action.
   ============================================================ */

import { sfx } from './sfx.js?v=1791485856';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);          // numero MIDI -> Hz
/* Progression en do majeur : C  Am  F  G (racines et accords). */
const CHORDS = [
  { root: 48, tones: [60, 64, 67, 71] },
  { root: 45, tones: [60, 64, 69, 72] },
  { root: 41, tones: [60, 65, 69, 72] },
  { root: 43, tones: [62, 67, 71, 74] }
];
const SCALE = [0, 2, 4, 7, 9];                                   // pentatonique majeure

/* J04 : une couleur de musique par lieu. Chaque theme = progression, gamme de l'arpege, note de depart, tempo (x) et son.
   `air` est la musique d'origine ; le changement se fait en fondu (la musique baisse un instant puis revient). */
const mk = (r, t) => ({ root: r, tones: t });
export const THEMES = {
  air:     { chords: CHORDS, scale: SCALE, base: 72, bpm: 1, wave: 'triangle' },
  hall:    { chords: [mk(48, [60, 64, 67, 71]), mk(45, [60, 64, 69, 72]), mk(41, [60, 65, 69, 72]), mk(43, [62, 67, 71, 74])], scale: [0, 2, 4, 7, 9], base: 76, bpm: 0.86, wave: 'sine' },
  park:    { chords: [mk(50, [62, 66, 69, 73]), mk(47, [62, 66, 71, 74]), mk(43, [62, 67, 71, 74]), mk(45, [61, 64, 69, 73])], scale: [0, 2, 4, 7, 9], base: 74, bpm: 1.22, wave: 'square' },
  islands: { chords: [mk(41, [57, 60, 65, 69]), mk(43, [58, 62, 67, 70]), mk(46, [58, 62, 65, 70]), mk(41, [57, 60, 65, 72])], scale: [0, 2, 4, 6, 9], base: 69, bpm: 0.9, wave: 'sine' },
  night:   { chords: [mk(45, [57, 60, 64, 69]), mk(41, [57, 60, 65, 69]), mk(48, [55, 60, 64, 67]), mk(43, [55, 59, 62, 67])], scale: [0, 3, 5, 7, 10], base: 69, bpm: 0.78, wave: 'sine' }
};

export class Music {
  constructor() {
    this.on = true;
    this.intensity = 0;
    this._level = [0, 0, 0, 0];           // volumes courants des 4 couches
    this._timer = null;
    this._nextT = 0;
    this._step = 0;
    this.theme = 'air';
    this.ctx = null;
    this.master = null;
    this.layers = null;
  }

  setOn(v) {
    this.on = !!v;
    if (!this.on) this.stop(); else this.start();
  }

  /* Demarre (apres un geste utilisateur, voir sfx.unlock). */
  start() {
    if (!this.on || this._timer) return;
    const ctx = sfx.context();
    if (!ctx) return;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(ctx.destination);
    this._duck = false;
    this.layers = [0, 1, 2, 3].map(() => { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.master); return g; });
    this._nextT = ctx.currentTime + 0.2;
    this._step = 0;
    this.master.gain.setTargetAtTime(this._masterLevel(), ctx.currentTime, 1.2);
    this._timer = setInterval(() => this._tick(), 120);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    if (this.master && this.ctx) {
      const m = this.master;
      m.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
      setTimeout(() => { try { m.disconnect(); } catch (e) { /* ok */ } }, 900);
    }
    this.master = null;
  }

  setIntensity(i) { this.intensity = i; }

  /* Change de theme (lieu) : la musique baisse un instant, puis revient dans la nouvelle couleur. */
  setTheme(id) {
    if (!THEMES[id] || id === this.theme) return;
    this.theme = id;
    this._swap = true;
    this._apply();
    clearTimeout(this._swapT);
    this._swapT = setTimeout(() => { this._swap = false; this._apply(); }, 650);
  }

  /* J02 : volume de la musique (0 a 1) et baisse automatique quand Coco parle (ducking). */
  setVolume(v) { this.vol = Math.max(0, Math.min(1, v)); this._apply(); }
  duck(on) { this._duck = !!on; this._apply(); }
  _masterLevel() { return 0.5 * (this.vol == null ? 1 : this.vol) * (this._duck ? 0.3 : 1) * (this._swap ? 0.15 : 1); }
  _apply() { if (this.master && this.ctx) this.master.gain.setTargetAtTime(Math.max(0.0001, this._masterLevel()), this.ctx.currentTime, this._duck ? 0.15 : 0.5); }

  _tone(layer, freq, t, dur, type, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.layers[layer]);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _hat(t, vol) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.value = vol;
    s.connect(hp).connect(g).connect(this.layers[3]);
    s.start(t);
  }

  _tick() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    /* volumes cibles par intensite : nappe, basse, arpege, percussions */
    const I = this.intensity;
    const target = [
      0.5,
      I >= 1 ? 0.55 : 0.0,
      I >= 1 ? (I >= 2 ? 0.5 : 0.35) : 0.18,
      I >= 2 ? 0.45 : 0
    ];
    for (let k = 0; k < 4; k++) {
      this._level[k] += (target[k] - this._level[k]) * 0.18;
      this.layers[k].gain.setTargetAtTime(this._level[k] * 0.16, ctx.currentTime, 0.3);
    }
    const TH = THEMES[this.theme] || THEMES.air;
    const bpm = (I >= 2 ? 144 : I >= 1 ? 112 : 84) * TH.bpm;
    const eighth = 60 / bpm / 2;
    /* ordonnance les notes des 0,5 prochaines secondes */
    while (this._nextT < ctx.currentTime + 0.5) {
      const t = this._nextT, s = this._step;
      const chord = TH.chords[Math.floor(s / 8) % TH.chords.length];
      if (s % 8 === 0) {
        for (const n of chord.tones) this._tone(0, NOTE(n), t, eighth * 8 * 0.95, TH.wave === 'square' ? 'triangle' : TH.wave, 0.42);
        this._tone(1, NOTE(chord.root), t, eighth * 3.6, 'sine', 0.8);
      }
      if (s % 4 === 0 && I >= 1) this._tone(1, NOTE(chord.root + (s % 8 ? 7 : 0)), t, eighth * 1.8, 'sine', 0.7);
      /* arpege : monte et descend sur la gamme pentatonique */
      const up = [0, 1, 2, 3, 4, 3, 2, 1][s % 8];
      const deg = TH.scale[up % 5] + 12 * Math.floor(up / 5);
      if (I >= 1 || s % 2 === 0) this._tone(2, NOTE(TH.base + deg + (this.theme === 'air' && chord.root % 12 === 9 ? -3 : 0)), t, eighth * 0.9, TH.wave, TH.wave === 'square' ? 0.3 : 0.55);
      if (I >= 2 || (this.theme === 'park' && I >= 1)) this._hat(t, s % 2 ? 0.5 : 0.9);
      this._nextT += eighth;
      this._step++;
    }
  }
}
