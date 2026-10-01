/* ============================================================
   history.js — Historique et statistiques de l'aeroport

   Un releve toutes les 30 s de jeu (pieces, ambiance du hall,
   satisfaction cabine, passagers embarques, equipe) et la liste
   des 12 derniers vols. Alimente l'onglet « Stats » du Hub.
   Sauvegarde : localStorage « skymanager.history ».
   ============================================================ */

const STORE = 'skymanager.history';
const EVERY = 30;               // s de jeu entre deux releves
const MAX_SAMPLES = 96;         // 48 minutes de jeu
const MAX_FLIGHTS = 12;

export class History {
  constructor(game) {
    this.g = game;
    this.samples = [];          // { coins, mood, sat, boarded, staff }
    this.flights = [];          // { pax, coins, stars, city, ico }
    this._acc = EVERY - 3;      // premier releve rapide
    this._unsaved = 0;
    this._load();
  }

  update(dt) {
    const g = this.g;
    if (g._worldPaused) return;
    this._acc += dt;
    if (this._acc < EVERY) return;
    this._acc = 0;
    this.samples.push({
      coins: Math.round(g.arcade.coins),
      mood: Math.round(g.terminal.mood),
      sat: Math.round(g.cabin.satisfaction),
      boarded: g.terminal.boarded,
      staff: g.staff ? g.staff.total : 0
    });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    if (++this._unsaved >= 4) this._save();
  }

  addFlight(rec) {
    this.flights.push(rec);
    if (this.flights.length > MAX_FLIGHTS) this.flights.shift();
    this._save();
  }

  series(key) { return this.samples.map(s => s[key]); }

  _save() {
    this._unsaved = 0;
    try { localStorage.setItem(STORE, JSON.stringify({ samples: this.samples, flights: this.flights })); } catch (e) { /* ignore */ }
  }
  _load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (d) { this.samples = d.samples || []; this.flights = d.flights || []; }
    } catch (e) { /* ignore */ }
  }
  static reset() {
    try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
  }
}
