/* ============================================================
   travel.js — « Où aller ? » : voyage rapide sur l'aéroport (plan « jeu cool », lot B)

   L'aéroport est grand : du skatepark à l'avion ou de la caserne aux
   spotteurs, un enfant passait beaucoup de temps à marcher. Ce panneau
   l'emmène d'un fondu à l'endroit choisi (à pied, mode Arcade).
   L'endroit de la quête d'aventure en cours est proposé en premier.

   Bouton 🧭 dans la colonne de gauche, touche T.
   ============================================================ */

import { sfx } from './sfx.js?v=1791602844';
import { placeOf } from './story.js?v=1791602844';

/* Lieux proposés. `near` : décalage du point d'arrivée pour ne pas tomber dans l'objet. */
export const PLACES = [
  { id: 'cockpit', ico: '✈️', name: 'Mon avion', sub: 'piloter, réparer', near: [-6, 4] },
  { id: 'terminal', ico: '🏢', name: 'Le terminal', sub: 'passagers, boutiques', near: [0, 6] },
  { id: 'tower', ico: '🗼', name: 'La tour', sub: 'acheter, améliorer', near: [4, 4] },
  { id: 'park', ico: '🛹', name: 'Le skatepark', sub: 'figures, rampes', near: [0, 40] },
  { id: 'fire', ico: '🚒', name: 'La caserne', sub: 'camion de pompiers', near: [0, 0] },
  { id: 'tug', ico: '🚜', name: 'Le tracteur', sub: 'livrer les valises', near: [3, 3] },
  { id: 'bus', ico: '🚌', name: 'Le bus', sub: 'transporter les passagers', near: [3, 3] },
  { id: 'spot', ico: '🔭', name: 'Les spotteurs', sub: 'regarder les avions', near: [0, 0] },
  { id: 'ga', ico: '🛩️', name: 'Aviation légère', sub: 'petits avions', near: [0, 0] }
];

export class Travel {
  constructor(game) {
    this.g = game;
    this.isOpen = false;
    this._build();
    const btn = document.getElementById('travelBtn');
    if (btn) btn.addEventListener('click', () => this.open());
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyT' || e.repeat || !this.g.arcade.on || this.g.state !== 'HUB') return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (this.isOpen) this.close(); else this.open();
    });
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'travelPanel';
    el.className = 'hidden panel-overlay';
    el.innerHTML = `<div class="panel-card center kid travel-card">
      <h2 class="panel-title">🧭 Où veux-tu aller ?</h2>
      <p class="panel-sub">Touche un endroit : tu y es tout de suite !</p>
      <div id="travelGrid" class="travel-grid"></div>
      <button id="travelClose" class="panel-btn mt-2">Fermer</button>
    </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.querySelector('#travelClose').addEventListener('click', () => this.close());
  }

  /* Le voyage n'a de sens qu'à pied sur le tarmac (pas en vol, ni en cabine). */
  get available() { return this.g.arcade.on && this.g.state === 'HUB'; }

  open() {
    if (!this.available) return;
    this.isOpen = true;
    const raw = this.g.story && this.g.story.questPlace();
    const qp = { counter: 'terminal', wash: 'cockpit', cabinDoor: 'cockpit' }[raw] || raw;
    const list = PLACES.filter(p => placeOf(this.g, p.id));
    if (qp) list.sort((a, b) => (b.id === qp) - (a.id === qp));
    const grid = this.el.querySelector('#travelGrid');
    grid.innerHTML = list.map(p => `<button class="kp-tile travel-tile${p.id === qp ? ' quest' : ''}" data-go="${p.id}">` +
      `<span class="kp-ico">${p.ico}</span><b>${p.name}</b><small>${p.id === qp ? '⭐ pour ta quête' : p.sub}</small></button>`).join('');
    grid.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { this.close(); this.go(b.dataset.go); }));
    this.el.classList.remove('hidden');
    sfx.click();
  }

  close() {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  /* Fondu au noir, déplacement, fondu retour. */
  go(id) {
    const g = this.g;
    if (!this.available) return false;
    const p = placeOf(g, id);
    if (!p) return false;
    const def = PLACES.find(x => x.id === id) || { near: [0, 0], name: '', ico: '🧭' };
    const veil = document.getElementById('veil');
    if (veil) veil.classList.add('on');
    sfx.whoosh();
    setTimeout(() => {
      try { this._teleport(p.x + def.near[0], p.z + def.near[1], p); } catch (e) { g._noteError('voyage rapide', e); }
      setTimeout(() => { if (veil) veil.classList.remove('on'); }, 150);
      if (def.name) g.arcade.popup(`${def.ico} ${def.name}`);
    }, 360);
    return true;
  }

  _teleport(x, z, look) {
    const g = this.g;
    if (g.state !== 'HUB') return;
    for (const v of g.vehicles || []) if (v.active) v.exit();
    if (g.rides.active) g.rides.dismount(true);
    const w = g.nav.nearestWalkable(x, z);
    g.player.pos.set(w.x, g.r3d.groundHeight(w.x, w.z), w.z);
    /* Le joueur regarde vers l'endroit (utile quand on arrive à côté d'un véhicule). */
    const dx = look.x - w.x, dz = look.z - w.z;
    if (Math.hypot(dx, dz) > 0.5) g.player.heading = Math.atan2(dx, dz);
    if (g.player.vel) g.player.vel.set(0, 0, 0);
    g.r3d._hubCamInit = false;          // la caméra se replace d'un coup, sans traverser la carte
    g.r3d._camPull = null;
    g.arcade._lastPos = null;           // pas de « distance parcourue » pour le tutoriel
  }
}

