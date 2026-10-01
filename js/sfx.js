/* ============================================================
   sfx.js — Petits sons de recompense (Web Audio, aucun fichier)

   Pieces, etoiles, anneaux, niveau superieur : chaque bonne action
   fait un bruit court et joyeux. Le contexte audio n'est cree qu'apres
   un premier geste de l'utilisateur (regle des navigateurs).
   ============================================================ */

const STORE = 'skymanager.sfx';

let ctx = null;
let muted = false;
try { muted = localStorage.getItem(STORE) === 'off'; } catch (e) { /* ignore */ }

function audio() {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/* Une note : frequence (Hz), debut (s), duree (s), type d'onde, volume. */
function tone(freq, at, dur, type = 'triangle', vol = 0.12) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export const sfx = {
  get muted() { return muted; },

  setMuted(v) {
    muted = !!v;
    try { localStorage.setItem(STORE, muted ? 'off' : 'on'); } catch (e) { /* ignore */ }
  },

  /* A appeler depuis un vrai geste (clic sur DEMARRER). */
  unlock() { audio(); },

  coin()  { tone(988, 0, 0.09, 'square', 0.06); tone(1319, 0.08, 0.16, 'square', 0.06); },
  ding()  { tone(880, 0, 0.14, 'triangle', 0.12); tone(1175, 0.1, 0.2, 'triangle', 0.1); },
  ring()  { tone(660, 0, 0.1, 'triangle', 0.13); tone(880, 0.07, 0.1, 'triangle', 0.13); tone(1320, 0.14, 0.22, 'triangle', 0.13); },
  star(n = 1) {
    for (let i = 0; i < n; i++) tone(784 * Math.pow(1.26, i), i * 0.16, 0.28, 'triangle', 0.14);
  },
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, 'triangle', 0.14));
  },
  oops()  { tone(220, 0, 0.18, 'sawtooth', 0.07); tone(165, 0.14, 0.25, 'sawtooth', 0.07); },
  click() { tone(520, 0, 0.05, 'square', 0.04); },
  /* Petits sons rigolos (menu Fun) */
  honk()  { tone(311, 0, 0.16, 'square', 0.07); tone(392, 0, 0.16, 'square', 0.07); tone(311, 0.2, 0.26, 'square', 0.07); tone(392, 0.2, 0.26, 'square', 0.07); },
  shutter() { tone(2400, 0, 0.03, 'square', 0.05); tone(1500, 0.05, 0.05, 'square', 0.05); },
  pop()   { tone(400, 0, 0.05, 'sine', 0.12); tone(800, 0.03, 0.08, 'sine', 0.1); },
  tada()  { [392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.12, 'triangle', 0.11)); tone(1047, 0.32, 0.4, 'triangle', 0.13); },
  jingle() { [523, 659, 784, 659, 523, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.22, 'triangle', 0.1)); },
  hello() { tone(660, 0, 0.09, 'sine', 0.1); tone(880, 0.1, 0.14, 'sine', 0.1); },
  sparkle() { [1568, 2093, 2637].forEach((f, i) => tone(f, i * 0.05, 0.14, 'sine', 0.07)); },
  whoosh() {
    const a = audio();
    if (!a) return;
    const t0 = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t0);
    o.frequency.exponentialRampToValueAtTime(700, t0 + 0.5);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + 0.6);
  }
};
