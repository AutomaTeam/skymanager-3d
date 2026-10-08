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

import { sfx } from './sfx.js?v=1791469860';
import * as Save from './save.js?v=1791469860';
import { Music } from './music.js?v=1791469860';

const STORE = 'skymanager.comfort';
const $ = (id) => document.getElementById(id);

const QUALITY = ['auto', 'high', 'low'];
const QUALITY_LABEL = { auto: 'Auto', high: 'Haute', low: 'Basse' };
const BREAKS = [0, 20, 30, 45, 60];
/* J05 : klaxons a debloquer avec le niveau de pilote. */
export const HORNS = [
  { id: 'classic', name: 'Classique', ico: '📯', level: 1 },
  { id: 'duck', name: 'Canard', ico: '🦆', level: 3 },
  { id: 'clown', name: 'Clown', ico: '🤡', level: 6 },
  { id: 'train', name: 'Train', ico: '🚂', level: 9 },
  { id: 'truck', name: 'Camion', ico: '🚛', level: 12 },
  { id: 'trumpet', name: 'Trompette', ico: '🎺', level: 15 }
];
const LIMITS = [0, 30, 45, 60, 90];
/* Petit calcul pour les reglages parentaux (un enfant de 12 ans ne le fait pas par hasard). */
function parentGate() {
  const a = 6 + Math.floor(Math.random() * 4), b = 7 + Math.floor(Math.random() * 3);
  const r = window.prompt(`Reglage pour les parents : combien font ${a} x ${b} ?`);
  return r !== null && parseInt(r, 10) === a * b;
}
const today = () => new Date().toISOString().slice(0, 10);

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
    const def = { quality: 'auto', lefty: false, textSize: 0, music: true, haptics: true, voiceRate: 1, breakMin: 0, limitMin: 0, usedDay: '', usedSec: 0, vMusic: 1, vFx: 1, vVoice: 1, horn: 'classic', cb: false };
    const d = Save.load(STORE, def);
    if (d.bigText) { d.textSize = Math.max(1, d.textSize | 0); }        // ancien reglage booleen
    delete d.bigText;
    d.textSize = Math.max(0, Math.min(2, d.textSize | 0));
    return d;
  }
  save() { Save.write(STORE, this.data); }

  _bind() {
    const t = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    t('pauseSettings', () => { this.g.closePause(); this.open(); });
    t('setClose', () => { $('settingsPanel').classList.add('hidden'); sfx.click(); });
    t('setQuality', () => { this.data.quality = QUALITY[(QUALITY.indexOf(this.data.quality) + 1) % QUALITY.length]; this._changed(); });
    t('setLefty', () => { this.data.lefty = !this.data.lefty; this._changed(); });
    t('setBig', () => { this.data.textSize = (this.data.textSize + 1) % 3; this._changed(); });
    t('setMusic', () => { this.data.music = !this.data.music; this._changed(); });
    t('setVoiceRate', () => { const R = [0.8, 1, 1.2]; this.data.voiceRate = R[(R.indexOf(this.data.voiceRate) + 1) % R.length]; this._changed(); this.g.voice.speak('Voila ma voix !', { prio: 3 }); });
    for (const [id, key] of [['volMusic', 'vMusic'], ['volFx', 'vFx'], ['volVoice', 'vVoice']]) {
      const el = $(id);
      if (el) el.addEventListener('input', () => { this.data[key] = +el.value; this.save(); this.apply(); });
      if (el) el.addEventListener('change', () => { if (key === 'vFx') sfx.coin(); else if (key === 'vVoice') this.g.voice.speak('Coucou, c\'est moi !', { prio: 3 }); });
    }
    t('setCb', () => { this.data.cb = !this.data.cb; this._changed(); });
    t('setHorn', () => {
      const lvl = this.g.arcade.data.level;
      const open = HORNS.filter(h => h.level <= lvl);
      const i = open.findIndex(h => h.id === this.data.horn);
      this.data.horn = open[(i + 1) % open.length].id;
      this._changed(); sfx.honk();
    });
    t('setExport', () => this.exportFile());
    t('setImport', () => $('setImportFile').click());
    const fi = $('setImportFile');
    if (fi) fi.addEventListener('change', () => { const f = fi.files && fi.files[0]; if (f) this.importFile(f); fi.value = ''; });
    t('setHaptic', () => { this.data.haptics = !this.data.haptics; this._changed(); });
    t('setTilt', async () => {
      const c = this.g.controls, on = !c.tilt.on;
      const r = await c.setTilt(on);
      if (!r.ok) { this.g.toast('📱 ' + r.why, 2600, 'warn'); return; }
      if (on) { c.tilt.base = null; this.g.toast('📱 Incline l\'iPad pour piloter ! Touche « Calibrer » pour changer le neutre.', 3600, 'ok'); }
      sfx.click(); this.render();
    });
    t('setTiltCal', () => { this.g.controls.calibrateTilt(); this.g.toast('🎯 C\'est ta nouvelle position neutre.', 1800, 'ok'); sfx.click(); });
    t('setLimit', () => {
      if (!parentGate()) { this.g.toast('🌙 Ce reglage est pour les parents.', 2200, 'warn'); return; }
      this.data.limitMin = LIMITS[(LIMITS.indexOf(this.data.limitMin) + 1) % LIMITS.length]; this._changed();
    });
    t('limitParent', () => {
      if (!parentGate()) return;
      this.data.usedSec = Math.max(0, this.data.limitMin * 60 - 15 * 60);
      this.save(); $('limitPanel').classList.add('hidden'); this.g._worldPaused = false; this._limitShown = false; sfx.click();
    });
    t('setBreak', () => { this.data.breakMin = BREAKS[(BREAKS.indexOf(this.data.breakMin) + 1) % BREAKS.length]; this._playT = 0; this._changed(); });
    t('breakOk', () => { $('breakPanel').classList.add('hidden'); this.g._worldPaused = false; this._playT = 0; sfx.click(); });
  }

  /* I07 : toutes les sauvegardes `skymanager.*` dans un seul fichier JSON (protege contre la perte de donnees de Safari). */
  exportFile() {
    try {
      const data = { app: 'skymanager', version: 1, date: new Date().toISOString(), keys: Save.exportAll() };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `skymanager-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      this.g.toast('💾 Fichier de sauvegarde cree !', 3200, 'ok');
    } catch (e) { this.g.toast('💾 Impossible de creer le fichier.', 3000, 'warn'); }
  }

  importFile(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(String(rd.result));
        if (!d || d.app !== 'skymanager' || !d.keys || typeof d.keys !== 'object') throw new Error('format');
        if (!window.confirm('Remplacer ta partie par celle du fichier ?')) return;
        const n = Save.importAll(d.keys);
        if (!n) throw new Error('vide');
        this.g.toast(`📂 Partie chargee (${n} elements). Le jeu redemarre…`, 2600, 'ok');
        setTimeout(() => window.location.reload(), 1200);
      } catch (e) { this.g.toast('📂 Ce fichier n\'est pas une sauvegarde SkyManager.', 3600, 'warn'); }
    };
    rd.onerror = () => this.g.toast('📂 Lecture impossible.', 3000, 'warn');
    rd.readAsText(file);
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
    set('setBig', ['Normal', 'Grand', 'Tres grand'][d.textSize], d.textSize > 0);
    set('setMusic', d.music ? 'Activee' : 'Coupee', d.music);
    const tl = this.g.controls && this.g.controls.tilt;
    set('setTilt', tl && tl.on ? 'Active' : 'Coupe', !!(tl && tl.on));
    const cal = $('setTiltCal'); if (cal) cal.classList.toggle('hidden', !(tl && tl.on));
    set('setVoiceRate', { 0.8: 'Lente', 1: 'Normale', 1.2: 'Rapide' }[d.voiceRate] || 'Normale', d.voiceRate !== 1);
    set('setHaptic', d.haptics ? 'Active' : 'Coupee', d.haptics);
    set('setLimit', d.limitMin ? `${d.limitMin} min par jour` : 'Pas de limite', !!d.limitMin);
    for (const [id, key] of [['volMusic', 'vMusic'], ['volFx', 'vFx'], ['volVoice', 'vVoice']]) { const el = $(id); if (el) el.value = d[key]; }
    const hn = HORNS.find(h => h.id === d.horn) || HORNS[0];
    const nextH = HORNS.find(h => h.level > this.g.arcade.data.level);
    set('setHorn', `${hn.ico} ${hn.name}${nextH ? ` · prochain au niveau ${nextH.level}` : ''}`, hn.id !== 'classic');
    set('setCb', d.cb ? 'Bleu / orange' : 'Normales', d.cb);
    set('setBreak', d.breakMin ? `Toutes les ${d.breakMin} min` : 'Pas de rappel', !!d.breakMin);
  }

  /* Applique les reglages visibles (classes du body, musique, qualite). */
  apply() {
    const d = this.data;
    document.body.classList.toggle('lefty', d.lefty);
    document.body.classList.toggle('cb', !!d.cb);
    document.body.classList.toggle('bigtext', d.textSize === 1);
    document.body.classList.toggle('hugetext', d.textSize === 2);
    this.music.setOn(d.music && !sfx.muted);
    sfx.setHaptics(d.haptics);
    /* J02 : trois volumes (musique / effets / voix) et ducking de la musique pendant que Coco parle */
    sfx.setFxVolume(d.vFx);
    sfx.setHorn(d.horn);
    this.music.setVolume(d.vMusic);
    this.g.voice.volume = 0.9 * d.vVoice;
    this.g.voice.onSpeak = (on) => this.music.duck(on);
    this.g.voice.setRate(d.voiceRate);
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
    /* D04 : carte d'ombre plus petite quand le niveau baisse (1024 -> 768 -> 512). */
    const ss = [1024, 768, 512][level];
    if (r3d.sun && r3d.shadowSize !== ss) {
      r3d.shadowSize = ss;
      r3d.sun.shadow.mapSize.set(ss, ss);
      if (r3d.sun.shadow.map) { r3d.sun.shadow.map.dispose(); r3d.sun.shadow.map = null; }
    }
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
    /* limite de temps par jour (parents) : on ne coupe jamais en plein vol */
    if (this.data.limitMin) {
      if (this.data.usedDay !== today()) { this.data.usedDay = today(); this.data.usedSec = 0; }
      if (!g._worldPaused) {
        this.data.usedSec += dt;
        this._limitSave = (this._limitSave || 0) + dt;
        if (this._limitSave > 20) { this._limitSave = 0; this.save(); }
      }
      if (this.data.usedSec >= this.data.limitMin * 60 && !this._limitShown && !(g.state === 'PILOT' && !g.ac.onGround)) {
        this._limitShown = true; g._worldPaused = true; this.save();
        $('limitPanel').classList.remove('hidden');
        sfx.chime();
      }
    }
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
