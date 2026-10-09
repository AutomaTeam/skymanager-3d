/* ============================================================
   minigames.js — Mini-jeux au sol (mode Arcade, vague 4)

   Trois petits jeux de 30 a 60 secondes, joues dans un panneau :
     wash   — laver l'avion en frottant l'ecran
     fuel   — remplir le reservoir : lacher dans la zone verte
     scan   — reperer l'objet bizarre dans la valise

   Chacun rend 1 a 3 etoiles. Les pieces ne sont versees qu'une
   fois toutes les 100 s par jeu (le jeu reste libre ensuite).
   Donnees : localStorage 'skymanager.mini'.
   ============================================================ */

import { sfx } from './sfx.js?v=1791553916';
import { BODY_COLORS, ACCENT_COLORS, find } from './livery.js?v=1791553916';

const STORE = 'skymanager.mini';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const COOLDOWN = 100000;           // ms entre deux versements de pieces

export const GAMES = {
  wash: { id: 'wash', ico: '🧽', name: 'Lavage de l\'avion', blurb: 'Frotte l\'ecran pour que l\'avion brille !' },
  fuel: { id: 'fuel', ico: '⛽', name: 'Plein de carburant', blurb: 'Maintiens, puis lache dans la zone verte.' },
  scan: { id: 'scan', ico: '🔍', name: 'Valises bizarres', blurb: 'Trouve l\'objet qui n\'a rien a faire la !' }
};

const NORMAL = ['👕', '👖', '🧦', '🩳', '🧢', '👟', '🧣', '🧥', '📘', '🪥', '🧴', '🕶️'];
const WEIRD = ['🦆', '🍌', '🍕', '🦖', '🧸', '🥕', '🐟', '🎺', '🍩', '🦄', '🔔', '🪁'];

export class MiniGames {
  constructor(game) {
    this.g = game;
    this.data = this._load();
    this.cur = null;
    this._timers = [];
    this._bind();
  }

  _load() {
    const def = { games: {} };
    try { const d = JSON.parse(localStorage.getItem(STORE) || 'null'); if (d) return Object.assign(def, d, { games: d.games || {} }); } catch (e) { /* ignore */ }
    return def;
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }

  _bind() {
    const close = () => this.close();
    $('mg2Close').addEventListener('click', () => { sfx.click(); close(); });
    $('pauseGames').addEventListener('click', () => { this.g.closePause(); this.menu(); });
  }

  _clear() {
    this._timers.forEach(t => { clearInterval(t); clearTimeout(t); cancelAnimationFrame(t); });
    this._timers = [];
  }

  close() {
    this._clear();
    this.cur = null;
    $('mg2').classList.add('hidden');
    this.g._worldPaused = false;
  }

  _show(title, html) {
    this.g._worldPaused = true;
    $('mg2Title').textContent = title;
    $('mg2Body').innerHTML = html;
    $('mg2').classList.remove('hidden');
  }

  /* ---------------- Menu des mini-jeux ---------------- */
  menu() {
    if (this.g.state !== 'HUB') { this.g.toast('Les mini-jeux se jouent a l\'aeroport.', 2400, 'warn'); return; }
    this._clear();
    const now = Date.now();
    const tiles = Object.values(GAMES).map(m => {
      const d = this.data.games[m.id] || {};
      const wait = Math.max(0, Math.ceil(((d.last || 0) + COOLDOWN - now) / 1000));
      const stars = '★'.repeat(d.best || 0) + '<i>' + '★'.repeat(3 - (d.best || 0)) + '</i>';
      return `<button class="mg-tile" data-game="${m.id}"><span class="mg-ico">${m.ico}</span><span class="mg-mid"><b>${m.name}</b><small>${m.blurb}</small></span>` +
        `<span class="mg-meta">${stars}<small>${wait ? `🪙 dans ${wait}s` : '🪙 pret !'}</small></span></button>`;
    }).join('');
    this._show('🎮 Mini-jeux', `<div class="mg-menu">${tiles}</div>`);
    $('mg2Body').querySelectorAll('[data-game]').forEach(b => b.addEventListener('click', () => { sfx.click(); this.open(b.dataset.game); }));
  }

  open(id, opts = {}) {
    this._clear();
    this.cur = { id, opts };
    const m = GAMES[id];
    this._show(`${m.ico} ${m.name}`, '');
    ({ wash: () => this._wash(), fuel: () => this._fuel(), scan: () => this._scan() })[id]();
  }

  /* Fin de partie : etoiles, pieces (avec delai), bouton rejouer. */
  _end(stars, lines = []) {
    this._clear();
    const id = this.cur.id, m = GAMES[id];
    const d = this.data.games[id] || (this.data.games[id] = {});
    d.best = Math.max(d.best || 0, stars);
    d.plays = (d.plays || 0) + 1;
    const now = Date.now();
    const paid = now - (d.last || 0) >= COOLDOWN && stars > 0;
    const coins = paid ? 3 + stars * 4 : 0;
    if (paid) { d.last = now; this.g.arcade.giveCoins(coins, { silent: true, xp: 4 + stars * 3 }); }
    this.g.arcade.event('minigame');
    this.save();
    sfx.star(stars);
    if (stars >= 2) this.g.arcade.confetti(30 + stars * 20);
    const onDone = this.cur.opts.onDone;
    this.cur.opts = {};
    $('mg2Body').innerHTML =
      `<div class="mg-end"><div class="mg-stars">${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></div>` +
      `<p class="mg-lines">${lines.join('<br>')}</p>` +
      `<p class="mg-coins">${paid ? `+${coins} 🪙` : stars ? 'Bravo ! (pieces deja gagnees, reviens plus tard)' : 'Dommage, retente !'}</p>` +
      `<button id="mgAgain" class="panel-btn primary">Rejouer</button> <button id="mgMenu" class="panel-btn">Mini-jeux</button></div>`;
    $('mgAgain').addEventListener('click', () => { sfx.click(); this.open(id); });
    $('mgMenu').addEventListener('click', () => { sfx.click(); onDone ? this.close() : this.menu(); });
    if (onDone) onDone(stars);
  }

  /* ---------------- 1. Lavage ---------------- */
  _wash() {
    const lv = this.g.hangar.livery('liner');
    const body = '#' + find(BODY_COLORS, lv.body).hex.toString(16).padStart(6, '0');
    const acc = '#' + find(ACCENT_COLORS, lv.accent).hex.toString(16).padStart(6, '0');
    $('mg2Body').innerHTML =
      '<p class="mg-help">Frotte avec le doigt pour enlever la saleté !</p>' +
      '<div class="mg-wash"><canvas id="mgBase" width="560" height="260"></canvas><canvas id="mgDirt" width="560" height="260"></canvas></div>' +
      '<div class="mg-bar"><span id="mgBarFill"></span></div><p class="mg-time" id="mgTime">0 s</p>';
    const base = $('mgBase').getContext('2d');
    /* avion de profil */
    base.fillStyle = '#bfe3ff'; base.fillRect(0, 0, 560, 260);
    base.fillStyle = '#e8f6ff'; base.beginPath(); base.ellipse(120, 60, 70, 24, 0, 0, 6.3); base.ellipse(440, 40, 80, 22, 0, 0, 6.3); base.fill();
    base.fillStyle = body;
    base.beginPath(); base.moveTo(40, 140); base.quadraticCurveTo(60, 100, 160, 98); base.lineTo(430, 98); base.quadraticCurveTo(500, 100, 540, 150);
    base.quadraticCurveTo(500, 168, 430, 168); base.lineTo(160, 168); base.quadraticCurveTo(60, 170, 40, 140); base.fill();
    base.fillStyle = acc; base.fillRect(70, 134, 440, 14);
    base.beginPath(); base.moveTo(440, 98); base.lineTo(500, 30); base.lineTo(530, 30); base.lineTo(520, 110); base.fill();
    base.fillStyle = body; base.strokeStyle = 'rgba(0,0,0,0.18)'; base.lineWidth = 3;
    base.beginPath(); base.moveTo(210, 150); base.lineTo(330, 150); base.lineTo(280, 235); base.lineTo(235, 235); base.closePath(); base.fill(); base.stroke();
    base.fillStyle = '#1e3a5f'; for (let i = 0; i < 9; i++) base.fillRect(110 + i * 34, 112, 16, 14);
    base.fillStyle = '#0f2540'; base.beginPath(); base.moveTo(60, 128); base.quadraticCurveTo(72, 108, 100, 106); base.lineTo(100, 126); base.fill();
    /* saleté */
    const dirt = $('mgDirt'), dx = dirt.getContext('2d');
    dx.fillStyle = 'rgba(96,72,40,0.93)'; dx.fillRect(0, 0, 560, 260);
    for (let i = 0; i < 90; i++) { dx.fillStyle = `rgba(${40 + Math.random() * 40},${30 + Math.random() * 30},20,${0.2 + Math.random() * 0.4})`; dx.beginPath(); dx.arc(Math.random() * 560, Math.random() * 260, 8 + Math.random() * 30, 0, 6.3); dx.fill(); }
    let down = false, last = null;
    const pos = (e) => { const r = dirt.getBoundingClientRect(); return { x: (e.clientX - r.left) * 560 / r.width, y: (e.clientY - r.top) * 260 / r.height }; };
    const scrub = (p) => {
      dx.globalCompositeOperation = 'destination-out';
      dx.lineWidth = 62; dx.lineCap = 'round'; dx.strokeStyle = '#000';
      dx.beginPath(); dx.moveTo((last || p).x, (last || p).y); dx.lineTo(p.x, p.y); dx.stroke();
      last = p;
    };
    dirt.addEventListener('pointerdown', (e) => { down = true; try { dirt.setPointerCapture(e.pointerId); } catch (err) { /* ok */ } last = null; scrub(pos(e)); sfx.tick(); });
    dirt.addEventListener('pointermove', (e) => { if (down) scrub(pos(e)); });
    const up = () => { down = false; last = null; };
    dirt.addEventListener('pointerup', up); dirt.addEventListener('pointercancel', up);
    const t0 = performance.now();
    this._timers.push(setInterval(() => {
      const sec = (performance.now() - t0) / 1000;
      const im = dx.getImageData(0, 0, 560, 260).data;
      let clean = 0, n = 0;
      for (let y = 0; y < 260; y += 10) for (let x = 0; x < 560; x += 10) { n++; if (im[(y * 560 + x) * 4 + 3] < 40) clean++; }
      const f = clean / n;
      $('mgBarFill').style.width = `${Math.round(f * 100)}%`;
      $('mgTime').textContent = `${Math.floor(sec)} s · ${Math.round(f * 100)}%`;
      if (f >= 0.93) {
        this._end(sec <= 20 ? 3 : sec <= 36 ? 2 : 1, [`🧽 Avion tout propre en ${Math.round(sec)} s !`]);
      }
    }, 280));
  }

  /* ---------------- 2. Carburant ---------------- */
  _fuel() {
    $('mg2Body').innerHTML =
      '<p class="mg-help">Maintiens le bouton pour remplir, lache dans la zone verte !</p>' +
      '<div class="mg-fuel"><div class="mg-tank"><div id="mgBand" class="mg-band"></div><div id="mgLevel" class="mg-level"></div></div>' +
      '<div class="mg-fuelside"><p id="mgFuelInfo" class="mg-info">Manche 1 / 4</p><button id="mgHold" class="mg-hold">⛽<small>MAINTIENS</small></button></div></div>';
    let round = 0, ok = 0, level = 0, filling = false, locked = false, lo = 0, hi = 0;
    const speeds = [0.5, 0.62, 0.78, 0.95];
    const newRound = () => {
      level = 0; lo = 0.4 + Math.random() * 0.4; hi = lo + 0.18 - round * 0.012;
      $('mgBand').style.bottom = `${lo * 100}%`; $('mgBand').style.height = `${(hi - lo) * 100}%`;
      $('mgFuelInfo').textContent = `Manche ${round + 1} / 4`;
      locked = false;
    };
    newRound();
    const btn = $('mgHold');
    const start = (e) => { e.preventDefault(); if (!locked) { filling = true; sfx.tick(); } };
    const stop = () => {
      if (!filling) return;
      filling = false; locked = true;
      const good = level >= lo && level <= hi;
      if (good) { ok++; sfx.ring(); this.g.arcade.popup('🎯 Parfait !'); } else { sfx.oops(); this.g.arcade.popup(level > hi ? '💦 Trop plein !' : 'Pas assez…'); }
      round++;
      setTimeout(() => { if (!this.cur || this.cur.id !== 'fuel') return; if (round >= 4) this._end(ok >= 4 ? 3 : ok >= 3 ? 2 : ok >= 1 ? 1 : 0, [`⛽ ${ok} remplissage${ok > 1 ? 's' : ''} parfait${ok > 1 ? 's' : ''} sur 4`]); else newRound(); }, 700);
    };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop); btn.addEventListener('pointercancel', stop);
    let lt = performance.now();
    this._timers.push(setInterval(() => {
      const now = performance.now(), dt = Math.min(0.1, (now - lt) / 1000); lt = now;
      if (filling) { level = Math.min(1.05, level + dt * speeds[Math.min(round, 3)]); if (level >= 1.05) stop(); }
      $('mgLevel').style.height = `${Math.min(100, level * 100)}%`;
    }, 16));
  }

  /* ---------------- 3. Valises bizarres ---------------- */
  _scan() {
    $('mg2Body').innerHTML =
      '<p class="mg-help">Une valise passe au scanner : touche l\'objet bizarre !</p>' +
      '<div class="mg-scan"><div class="mg-bar"><span id="mgBarFill"></span></div><div id="mgGrid" class="mg-grid"></div><p id="mgScanInfo" class="mg-info"></p></div>';
    let round = 0, ok = 0, tLeft = 0;
    const TOTAL = 5, TIME = 8;
    const next = () => {
      const cat = pick(NORMAL), set = [];
      const pool = NORMAL.slice().sort(() => Math.random() - 0.5).slice(0, 4);
      for (let i = 0; i < 8; i++) set.push(pool[i % pool.length]);
      const weird = pick(WEIRD);
      set.push(weird);
      set.sort(() => Math.random() - 0.5);
      $('mgGrid').innerHTML = set.map(e => `<button class="mg-cell" data-w="${e === weird ? 1 : 0}">${e}</button>`).join('');
      $('mgScanInfo').textContent = `Valise ${round + 1} / ${TOTAL}`;
      tLeft = TIME;
      $('mgGrid').querySelectorAll('.mg-cell').forEach(b => b.addEventListener('click', () => {
        if (b.dataset.w === '1') { ok++; tLeft = 99; sfx.ring(); b.classList.add('good'); this._after(next, () => { round++; return round >= TOTAL; }, () => this._end(ok >= 5 ? 3 : ok >= 4 ? 2 : ok >= 2 ? 1 : 0, [`🔍 ${ok} objet${ok > 1 ? 's' : ''} bizarre${ok > 1 ? 's' : ''} trouve${ok > 1 ? 's' : ''} sur ${TOTAL}`])); }
        else { sfx.oops(); b.classList.add('bad'); tLeft = Math.max(0, tLeft - 2); }
      }));
    };
    next();
    this._timers.push(setInterval(() => {
      tLeft -= 0.1;
      $('mgBarFill').style.width = `${clamp(tLeft / TIME, 0, 1) * 100}%`;
      if (tLeft <= 0) { round++; if (round >= TOTAL) { this._end(ok >= 5 ? 3 : ok >= 4 ? 2 : ok >= 2 ? 1 : 0, [`🔍 ${ok} objet${ok > 1 ? 's' : ''} bizarre${ok > 1 ? 's' : ''} trouve${ok > 1 ? 's' : ''} sur ${TOTAL}`]); } else next(); }
    }, 100));
  }

  _after(next, advance, end) {
    setTimeout(() => {
      if (!this.cur || this.cur.id !== 'scan') return;
      if (advance()) end(); else next();
    }, 350);
  }
}
