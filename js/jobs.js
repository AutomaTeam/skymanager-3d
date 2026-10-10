/* ============================================================
   jobs.js — Metiers a la journee (H04)
   « Aujourd'hui je suis… » : pompier, bagagiste, guide, mecanicien ou controleur.
   Chaque metier = 3 petites taches enchainees (comptees avec les compteurs deja suivis par le jeu),
   un costume (couleur du haut et de la casquette) et 15 pieces a la fin. Un metier par jour peut
   etre recommence ; 3 metiers differents dans la meme journee = +40 pieces. Jamais de perte.
   Module du registre (js/registry.js). Etat : skymanager.jobs.
   ============================================================ */

import { sfx } from './sfx.js?v=1791617374';
import * as Save from './save.js?v=1791617374';

const STORE = 'skymanager.jobs';

/* src : 'a' = arcade.data.stats, 'f' = fun.data.stats. */
export const JOBS = [
  { id: 'fire', ico: '🚒', name: 'Pompier', shirt: 0xef4444, cap: 0xef4444, tasks: [
    { text: 'Éteins un feu avec le camion', src: 'a', key: 'fires', n: 1 },
    { text: 'Rassure 2 personnes (dis bonjour)', src: 'a', key: 'greet', n: 2 },
    { text: 'Prends une photo de l\'équipe', src: 'f', key: 'photos', n: 1 }] },
  { id: 'bags', ico: '🧳', name: 'Bagagiste', shirt: 0xfacc15, cap: 0xfacc15, tasks: [
    { text: 'Livre 2 chargements de valises (tracteur)', src: 'a', key: 'tugTrips', n: 2 },
    { text: 'Fais un plein avec le camion citerne', src: 'a', key: 'refuels', n: 1 },
    { text: 'Nettoie la piste avec la balayeuse', src: 'a', key: 'sweeps', n: 1 }] },
  { id: 'guide', ico: '🗺️', name: 'Guide', shirt: 0x06b6d4, cap: 0xf5f5f5, tasks: [
    { text: 'Dis bonjour à 4 personnes', src: 'a', key: 'greet', n: 4 },
    { text: 'Trouve 2 pièces cachées', src: 'a', key: 'treasure', n: 2 },
    { text: 'Prends une photo de groupe (selfie)', src: 'f', key: 'photos', n: 1 }] },
  { id: 'mech', ico: '🔧', name: 'Mécanicien', shirt: 0x3b82f6, cap: 0x111827, tasks: [
    { text: 'Répare 3 pièces de l\'avion', src: 'a', key: 'repair', n: 3 },
    { text: 'Fais le plein avec le camion citerne', src: 'a', key: 'refuels', n: 1 },
    { text: 'Amène l\'escalier à la porte de l\'avion', src: 'a', key: 'stairsTrips', n: 1 }] },
  { id: 'ctrl', ico: '🗼', name: 'Contrôleur', shirt: 0xf8fafc, cap: 0x22c55e, tasks: [
    { text: 'Vérifie 4 passagers au terminal', src: 'a', key: 'serve', n: 4 },
    { text: 'Sers 3 passagers en cabine', src: 'a', key: 'cabinServe', n: 3 },
    { text: 'Conduis le bus une fois', src: 'a', key: 'busTrips', n: 1 }] }
];

const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export class Jobs {
  constructor(game) {
    this.g = game;
    this.data = Save.load(STORE, { day: '', done: [], active: null });
    if (this.data.day !== todayKey()) this.data = { day: todayKey(), done: [], active: null };
    this.panel = document.getElementById('jobPanel');
    const tile = document.getElementById('pauseJobs');
    if (tile) tile.addEventListener('click', () => { sfx.click(); game.closePause(); this.open(); });
    const close = document.getElementById('jobClose');
    if (close) close.addEventListener('click', () => this.close());
    this._t = 0;
  }

  save() { Save.write(STORE, this.data); }
  _stat(t) {
    const g = this.g;
    return t.src === 'f' ? (g.fun.data.stats[t.key] || 0) : (g.arcade.data.stats[t.key] || 0);
  }

  get job() { return this.data.active ? JOBS.find(j => j.id === this.data.active.id) : null; }
  get task() { const j = this.job; return j ? j.tasks[this.data.active.i] : null; }
  progress() { const t = this.task; return t ? Math.min(t.n, this._stat(t) - this.data.active.base) : 0; }

  /* ---------------- Panneau ---------------- */
  open() {
    if (!this.panel) return;
    this.render();
    this.panel.classList.remove('hidden');
    this.g._worldPaused = true;
  }
  close() {
    if (!this.panel) return;
    this.panel.classList.add('hidden');
    this.g._worldPaused = false;
  }
  render() {
    const host = document.getElementById('jobList');
    if (!host) return;
    const act = this.job;
    host.innerHTML = JOBS.map(j => {
      const done = this.data.done.includes(j.id);
      const on = act && act.id === j.id;
      return `<button class="job-card${done ? ' done' : ''}${on ? ' on' : ''}" data-job="${j.id}"><span class="jc-ico">${j.ico}</span><b>${j.name}</b>` +
        `<small>${on ? `Tâche ${this.data.active.i + 1}/3 : ${this.task.text}` : j.tasks.map((t, i) => `${i + 1}. ${t.text}`).join('<br>')}</small>` +
        `<em>${done ? '✔ Fait aujourd\'hui' : on ? '▶ En cours' : 'Je choisis ce métier !'}</em></button>`;
    }).join('');
    host.querySelectorAll('[data-job]').forEach(b => b.addEventListener('click', () => { this.start(b.dataset.job); this.close(); }));
    const stop = document.getElementById('jobStop');
    if (stop) { stop.classList.toggle('hidden', !act); stop.onclick = () => { this.cancel(); this.close(); }; }
  }

  /* ---------------- Cycle ---------------- */
  start(id) {
    const j = JOBS.find(x => x.id === id);
    if (!j) return;
    if (this.data.active) this._restoreLook();
    this.data.active = { id, i: 0, base: this._stat(j.tasks[0]) };
    this.save();
    this._dress(j);
    sfx.tada();
    this.g.arcade.confetti(25);
    this.g.toast(`${j.ico} Aujourd'hui tu es ${j.name} ! ${j.tasks[0].text}.`, 4200, 'ok');
  }

  cancel() {
    this.data.active = null;
    this._restoreLook();
    this.save();
  }

  _dress(j) {
    const g = this.g;
    if (g.look && g.look.data) g.r3d.setPlayerLook(Object.assign({}, g.look.data, { shirt: j.shirt, cap: j.cap }));
  }
  _restoreLook() { const g = this.g; if (g.look && g.look.data) g.r3d.setPlayerLook(g.look.data); }

  update(dt) {
    const g = this.g;
    if (!this.data.active || g.state === 'BOOT') return;
    if (this.data.day !== todayKey()) { this.data = { day: todayKey(), done: [], active: null }; this._restoreLook(); this.save(); return; }
    this._t -= dt;
    if (this._t > 0) return;
    this._t = 0.5;
    const j = this.job, a = this.data.active, t = this.task;
    if (!j || !t) { this.cancel(); return; }
    if (this._stat(t) - a.base < t.n) return;
    /* tache terminee */
    const A = g.arcade;
    sfx.ding();
    A.confetti(30);
    if (a.i + 1 < j.tasks.length) {
      a.i++; a.base = this._stat(j.tasks[a.i]);
      this.save();
      g.toast(`${j.ico} Bravo ! Tâche suivante : ${j.tasks[a.i].text}.`, 3800, 'ok');
      return;
    }
    /* metier termine */
    this.data.done.push(j.id);
    this.data.active = null;
    A.giveCoins(15, { silent: true, xp: 15 });
    sfx.tada(); A.confetti(80);
    let msg = `${j.ico} Métier de ${j.name} terminé ! +15 🪙`;
    if (new Set(this.data.done).size >= 3 && !this.data.bonus) {
      this.data.bonus = true;
      A.giveCoins(40, { silent: true, xp: 25 });
      msg += ' · 3 métiers dans la journée : bonus +40 🪙 !';
    }
    this.save();
    this._restoreLook();
    g.toast(msg, 5200, 'ok');
  }

  goal() {
    const g = this.g;
    if (!this.data.active || g.state !== 'HUB') return null;
    const j = this.job, t = this.task;
    if (!j || !t) return null;
    return { icon: j.ico, text: `${j.name} : ${t.text} (${this.progress()}/${t.n})`, target: null };
  }
}
