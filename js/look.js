/* ============================================================
   look.js — Mon personnage (mode Arcade)

   L'enfant choisit l'apparence de son avatar : couleur du t-shirt,
   de la casquette, de la peau et des cheveux (avant : t-shirt orange
   impose, peau et cheveux tires au hasard a chaque partie).
   Le panneau s'ouvre depuis le menu pause (tuile « Mon perso ») et
   l'avatar change en direct.

   Etat sauvegarde : localStorage « skymanager.look ».
   ============================================================ */

import { sfx } from './sfx.js?v=1791557186';
import { SKIN_TONES, HAIR_TONES } from './renderer3d.js?v=1791557186';

const STORE = 'skymanager.look';
const SHIRTS = [0xf97316, 0xef4444, 0xec4899, 0xa855f7, 0x3b82f6, 0x06b6d4, 0x22c55e, 0xfacc15, 0xf8fafc, 0x1f2937];
const CAPS = [0xf5f5f5, 0xef4444, 0xfacc15, 0x22c55e, 0x3b82f6, 0xa855f7, 0xec4899, 0x111827];
const ROWS = [
  { key: 'shirt', label: '👕 T-shirt', list: SHIRTS },
  { key: 'cap', label: '🧢 Casquette', list: CAPS },
  { key: 'skin', label: '✋ Peau', list: SKIN_TONES },
  { key: 'hair', label: '💇 Cheveux', list: HAIR_TONES }
];
/* Pelage du chien (pet.js), propose une fois le chien adopte. */
const FURS = [0xc58a4a, 0xf5d08a, 0x7a4a2a, 0x2b2b2b, 0x8a8a8a, 0xe8e2d6];
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Look {
  constructor(game) {
    this.g = game;
    this.data = this._load();
    this.isOpen = false;
    /* Appliquee avant la creation de l'avatar (enterHubMode la lit). */
    game.r3d.playerLook = this.data;
    this._buildPanel();
    const tile = document.getElementById('pauseLook');
    if (tile) tile.addEventListener('click', () => { this.g.closePause(); this.open(); });
  }

  _load() {
    /* Premiere partie : t-shirt orange (l'ancien defaut), peau et cheveux au hasard, une fois pour toutes. */
    const def = { shirt: SHIRTS[0], cap: CAPS[0], skin: pick(SKIN_TONES), hair: pick(HAIR_TONES) };
    try { const d = JSON.parse(localStorage.getItem(STORE) || 'null'); if (d) return Object.assign(def, d); } catch (e) { /* ignore */ }
    try { localStorage.setItem(STORE, JSON.stringify(def)); } catch (e) { /* ignore */ }
    return def;
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }

  _buildPanel() {
    const el = document.createElement('div');
    el.id = 'lookPanel';
    el.className = 'hidden panel-overlay';
    el.innerHTML = `<div class="panel-card center kid">
      <h2 class="panel-title">👕 Mon personnage</h2>
      <p class="panel-sub">Choisis tes couleurs : ton personnage change tout de suite !</p>
      <div id="lookRows"></div>
      <div class="panel-row mt-2">
        <button id="lookRandom" class="panel-btn">🎲 Au hasard</button>
        <button id="lookClose" class="panel-btn primary">Termine</button>
      </div></div>`;
    document.body.appendChild(el);
    this.el = el;
    el.querySelector('#lookClose').addEventListener('click', () => this.close());
    el.querySelector('#lookRandom').addEventListener('click', () => {
      for (const r of ROWS) this.data[r.key] = pick(r.list);
      this._apply(); sfx.pop();
    });
  }

  _render() {
    const host = this.el.querySelector('#lookRows');
    const pet = this.g.pet && this.g.pet.adopted ? this.g.pet : null;
    const rows = pet ? ROWS.concat([{ key: 'fur', label: `🐕 Pelage de ${pet.data.name}`, list: FURS }]) : ROWS;
    const cur = (k) => k === 'fur' ? pet.data.fur : this.data[k];
    host.innerHTML = rows.map(r => `<div class="look-row"><b>${r.label}</b><div class="look-sws">` +
      r.list.map(c => `<button class="look-sw${cur(r.key) === c ? ' on' : ''}" data-k="${r.key}" data-c="${c}" style="background:${hex(c)}" aria-label="${r.label}"></button>`).join('') +
      '</div></div>').join('');
    host.querySelectorAll('.look-sw').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.k === 'fur') { pet.setFur(+b.dataset.c); sfx.bark(); this._render(); return; }
      this.data[b.dataset.k] = +b.dataset.c;
      this._apply(); sfx.click();
    }));
  }

  _apply() {
    this.save();
    this.g.r3d.setPlayerLook(this.data);
    this._render();
  }

  open() {
    this.isOpen = true;
    this._render();
    this.el.classList.remove('hidden');
    sfx.click();
  }

  close() {
    this.isOpen = false;
    this.el.classList.add('hidden');
    this.g.arcade.popup('👕 Super look !');
  }
}
