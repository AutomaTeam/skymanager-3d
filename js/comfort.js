/* ============================================================
   comfort.js — Confort de jeu (mode Arcade, vague 6)

   - Qualite automatique : si l'image saccade (iPad ancien), le jeu
     baisse tout seul la definition, les ombres puis le bloom ;
     il peut aussi etre regle a la main (Haute / Basse).
   - Gaucher : les gros boutons passent de l'autre cote.
   - Gros texte.
   - Musique dynamique (js/music.js), avec son bouton.
   - Rappel de pause pour les parents (toutes les 20 a 60 minutes).
   - Reglages enregistres : localStorage 'skymanager.comfort'.
   ============================================================ */

import { sfx } from './sfx.js?v=1791465405';
import * as Save from './save.js?v=1791465405';
import { Music } from './music.js?v=1791465405';

const STORE = 'skymanager.comfort';
const $ = (id) => document.getElementById(id);

const QUALITY = ['auto', 'high', 'low'];
const QUALITY_LABEL = { auto: 'Auto', high: 'Haute', low: 'Basse' };
const BREAKS = [0, 20, 30, 45, 60];

export class Comfort {
  constructor(game) {
    this.g = game;
    this.data = this._load();
    this.music = new Music();
    /* Niveau de qualite applique : 0 haute, 1 moyenne, 2 basse. En « auto », on repart du dernier
       niveau trouve (sinon chaque partie recommencait en haute qualite et saccadait d'abord). */
    this.level = Math.max(0, Math.min(2, this.data.autoLevel | 0));
    this._fpsAcc = 0; this._fpsN = 0; this._good = 0; this._bad = 0;
    this._playT = 0;
    this._shadowSkip = 0;
    this._bind();
    this.apply();
  }

  _load() {
    const def = { quality: 'auto', lefty: false, bigText: false, music: true, breakMin: 0 };
    return Save.load(STORE, def);
  }
  save() { Save.write(STORE, this.data); }

  _bind() {
    const t = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    t('pauseSettings', () => { this.g.closePause(); this.open(); });
    t('setClose', () => { $('settingsPanel').classList.add('hidden'); sfx.click(); });
    t('setQuality', () => { this.data.quality = QUALITY[(QUALITY.indexOf(this.data.quality) + 1) % QUALITY.length]; this._changed(); });
    t('setLefty', () => { this.data.lefty = !this.data.lefty; this._changed(); });
    t('setBig', () => { this.data.bigText = !this.data.bigText; this._changed(); });
    t('setMusic', () => { this.data.music = !this.data.music; this._changed(); });
    t('setBreak', () => { this.data.breakMin = BREAKS[(BREAKS.indexOf(this.data.breakMin) + 1) % BREAKS.length]; this._playT = 0; this._changed(); });
    t('breakOk', () => { $('breakPanel').classList.add('hidden'); this.g._worldPaused = false; this._playT = 0; sfx.click(); });
  }

  _changed() {
    this.save();
    sfx.click();
    this.apply();
    this.render();
  }

  open() {
    this.render();
    $('settingsPanel').classList.remove('hidden');
  }

  render() {
    const d = this.data;
    const set = (id, txt, on) => { const el = $(id); if (!el) return; el.querySelector('small').textContent = txt; el.classList.toggle('on', on); };
    set('setQuality', `${QUALITY_LABEL[d.quality]}${d.quality === 'auto' && this.level ? ` (niveau ${this.level})` : ''}`, d.quality !== 'auto');
    set('setLefty', d.lefty ? 'Boutons a gauche' : 'Boutons a droite', d.lefty);
    set('setBig', d.bigText ? 'Gros' : 'Normal', d.bigText);
    set('setMusic', d.music ? 'Activee' : 'Coupee', d.music);
    set('setBreak', d.breakMin ? `Toutes les ${d.breakMin} min` : 'Pas de rappel', !!d.breakMin);
  }

  /* Applique les reglages visibles (classes du body, musique, qualite). */
  apply() {
    const d = this.data;
    document.body.classList.toggle('lefty', d.lefty);
    document.body.classList.toggle('bigtext', d.bigText);
    this.music.setOn(d.music && !sfx.muted);
    this._applyQuality(d.quality === 'high' ? 0 : d.quality === 'low' ? 2 : this.level);
  }

  /* Niveaux : 0 definition max + ombres + bloom ; 1 definition reduite ;
     2 definition 1x, ombres rafraichies 1 image sur 3, bloom coupe. */
  _applyQuality(level) {
    const r3d = this.g.r3d;
    const dpr = window.devicePixelRatio || 1;
    const cap = [1.8, 1.25, 1.0][level];
    r3d.renderer.setPixelRatio(Math.min(dpr, cap));
    r3d.resize();
    if (r3d.bloom) r3d.bloom.enabled = level < 2;
    r3d.renderer.shadowMap.autoUpdate = level < 2;
    this._shadowEvery = level >= 2 ? 3 : 1;
    this.applied = level;
  }

  _keepLevel() { this.data.autoLevel = this.level; this.save(); }

  /* ---------------- Boucle ---------------- */
  update(dt) {
    const g = this.g;
    if (g.state === 'BOOT') return;
    /* ombres: en qualite basse, une image sur trois */
    if (this._shadowEvery > 1) {
      this._shadowSkip = (this._shadowSkip + 1) % this._shadowEvery;
      this.g.r3d.renderer.shadowMap.needsUpdate = this._shadowSkip === 0;
    }
    /* mesure de la fluidite (dt brut, avant ralenti) */
    const raw = Math.max(0.001, g.rawDt || dt);
    this._fpsAcc += raw; this._fpsN++;
    if (this._fpsAcc >= 3) {
      const fps = this._fpsN / this._fpsAcc;
      this._fpsAcc = 0; this._fpsN = 0;
      if (this.data.quality === 'auto' && !document.hidden) {
        if (fps < 27 && this.level < 2) { this._bad++; if (this._bad >= 2) { this.level++; this._bad = 0; this._good = 0; this._applyQuality(this.level); this.render(); this._keepLevel(); } }
        else if (fps > 56 && this.level > 0) { this._good++; if (this._good >= 6) { this.level--; this._good = 0; this._applyQuality(this.level); this.render(); this._keepLevel(); } }
        else { this._bad = Math.max(0, this._bad - 1); if (fps < 50) this._good = 0; }
      }
    }
    /* musique */
    if (this.data.music && !this.music._timer && !sfx.muted && g.state !== 'BOOT') this.music.start();
    if (sfx.muted && this.music._timer) this.music.stop();
    let I = 0;
    if (g.state === 'PILOT' && !g.ac.onGround) {
      I = 1;
      if (g.fun.boosting || g.fun.stunt || (g.sky && g.sky.m) || g.fun.combo.n > 0) I = 2;
    }
    this.music.setIntensity(I);
    /* rappel de pause */
    if (this.data.breakMin && !g._worldPaused) {
      this._playT += dt;
      if (this._playT >= this.data.breakMin * 60 && g.state !== 'PILOT') {
        this._playT = 0;
        g._worldPaused = true;
        $('breakPanel').classList.remove('hidden');
        sfx.hello();
      }
    }
  }
}
