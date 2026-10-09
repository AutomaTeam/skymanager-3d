/* ============================================================
   replay.js — Revoir son vol (G07)
   En vol, la position de l'avion est notee 15 fois par seconde (les 20 dernieres secondes).
   Apres un atterrissage, le bouton « 🎬 Revoir » rejoue ces 20 secondes : le monde est fige
   (pause), l'avion est repose image par image a ses anciennes positions, et la camera change
   toute seule (poursuite, cote, orbite, tour). Le bouton photo marche pendant le rejeu.
   Module du registre (js/registry.js). `sampleAt` est pur (testable sous Node).
   ============================================================ */

const HZ = 15;
const MAX = HZ * 20;
const CAM_EVERY = 4.2;          // s entre deux changements de camera

/* Interpole l'echantillon a l'instant t (secondes depuis le debut). Rend null hors plage. */
export function sampleAt(samples, t) {
  if (!samples.length) return null;
  const f = t * HZ, i = Math.floor(f);
  if (i < 0 || i >= samples.length) return null;
  const a = samples[i], b = samples[Math.min(i + 1, samples.length - 1)], k = f - i;
  const lerp = (x, y) => x + (y - x) * k;
  return { x: lerp(a.x, b.x), y: lerp(a.y, b.y), z: lerp(a.z, b.z), q: a.q.map((v, j) => lerp(v, b.q[j])), roll: lerp(a.roll, b.roll), pitch: lerp(a.pitch, b.pitch), yaw: lerp(a.yaw, b.yaw) };
}

export class Replay {
  constructor(game) {
    this.g = game;
    this.buf = [];
    this._acc = 0;
    this.active = false;
    this.t = 0;
    this.btn = document.getElementById('replayBtn');
    this.stopBtn = document.getElementById('replayStop');
    if (this.btn) this.btn.addEventListener('click', () => this.start());
    if (this.stopBtn) this.stopBtn.addEventListener('click', () => this.stop());
  }

  get available() { return this.buf.length > HZ * 3; }

  update(dt) {
    const g = this.g, ac = g.ac;
    if (this.active) { this._play(dt); return; }
    const flying = g.state === 'PILOT' && !ac.onGround && !g._worldPaused;
    if (flying) {
      this._acc += dt;
      const step = 1 / HZ;
      while (this._acc >= step) {
        this._acc -= step;
        this.buf.push({ x: ac.pos.x, y: ac.pos.y, z: ac.pos.z, q: [ac.quat.x, ac.quat.y, ac.quat.z, ac.quat.w], roll: ac.ctl.roll, pitch: ac.ctl.pitch, yaw: ac.ctl.yaw });
        if (this.buf.length > MAX) this.buf.shift();
      }
    } else if (g.state !== 'PILOT') {
      /* nouveau vol : l'ancien enregistrement n'est plus propose */
      if (g.state === 'HUB') this.buf.length = 0;
    }
    /* bouton : visible quand le rapport d'atterrissage est a l'ecran */
    const show = g.state === 'PILOT' && g.reportShown && this.available;
    if (this.btn) this.btn.classList.toggle('hidden', !show);
  }

  start() {
    const g = this.g, ac = g.ac;
    if (this.active || !this.available) return;
    this.saved = { pos: ac.pos.clone(), quat: ac.quat.clone() };
    this.samples = this.buf.slice();
    this.t = 0; this.camT = 0;
    this.active = true;
    this._wasPaused = g._worldPaused;
    g._worldPaused = true;
    const rep = document.getElementById('kidReport');
    this._repHidden = rep && !rep.classList.contains('hidden');
    if (rep) rep.classList.add('hidden');
    if (this.btn) this.btn.classList.add('hidden');
    if (this.stopBtn) this.stopBtn.classList.remove('hidden');
    g.toast('🎬 Rejeu des 20 dernières secondes !', 2400, 'ok');
    g.r3d.cameraMode = 'chase';
  }

  _play(dt) {
    const g = this.g, ac = g.ac;
    this.t += dt;
    this.camT += dt;
    if (this.camT >= CAM_EVERY) { this.camT = 0; g.r3d.nextCamera(); }
    const s = sampleAt(this.samples, this.t);
    if (!s) { this.stop(); return; }
    ac.pos.set(s.x, s.y, s.z);
    ac.quat.set(s.q[0], s.q[1], s.q[2], s.q[3]).normalize();
    ac.ctl.roll = s.roll; ac.ctl.pitch = s.pitch; ac.ctl.yaw = s.yaw;
  }

  stop() {
    if (!this.active) return;
    const g = this.g, ac = g.ac;
    this.active = false;
    ac.pos.copy(this.saved.pos);
    ac.quat.copy(this.saved.quat);
    g._worldPaused = this._wasPaused;
    const rep = document.getElementById('kidReport');
    if (rep && this._repHidden) rep.classList.remove('hidden');
    if (this.stopBtn) this.stopBtn.classList.add('hidden');
    g.r3d.cameraMode = 'chase';
  }
}
