/* ============================================================
   album.js — L'album de collection (mode Arcade, vague 4)

   Tout ce que l'on peut collectionner au meme endroit : avions,
   villes visitees, animaux transportes, rencontres, medailles de
   mission et autocollants. Les cases vides donnent un indice sur
   la facon de les obtenir. Le total encourage a « tout avoir ».
   ============================================================ */

import { sfx } from './sfx.js?v=1791576493';
import { PLANES, PLANE_IDS } from './fleet.js?v=1791576493';
import { STICKERS } from './livery.js?v=1791576493';
import { DESTINATIONS, BADGES } from './arcade.js?v=1791576493';
import { MISSION_DEFS, ANIMALS } from './skyMissions.js?v=1791576493';
import { STORIES } from './groundFun.js?v=1791576493';
import { ISLANDS, EGGS } from './openWorld.js?v=1791576493';

const $ = (id) => document.getElementById(id);

const TABS = [
  { id: 'planes',   ico: '✈️', label: 'Avions' },
  { id: 'cities',   ico: '🌍', label: 'Villes' },
  { id: 'animals',  ico: '🐾', label: 'Animaux' },
  { id: 'people',   ico: '🎭', label: 'Rencontres' },
  { id: 'world',    ico: '🏝️', label: 'Monde' },
  { id: 'medals',   ico: '🏅', label: 'Médailles' },
  { id: 'stickers', ico: '🎨', label: 'Stickers' },
  { id: 'trophies', ico: '🏆', label: 'Trophées' },
  { id: 'photos',   ico: '📸', label: 'Photos' }
];
const FILTERS = [['all', 'Tout'], ['todo', 'À trouver'], ['done', 'Trouvés']];
const MEDALS = ['', '🥉', '🥈', '🥇'];

export class Album {
  constructor(game) {
    this.g = game;
    this.tab = 'planes';
    this.filter = 'all';
    $('pauseCollec').addEventListener('click', () => { this.g.closePause(); this.open(); });
    $('albumClose').addEventListener('click', () => { sfx.click(); $('albumPanel').classList.add('hidden'); });
  }

  /* Contenu de chaque onglet : [{ico, name, got, hint}] */
  items(tab) {
    const g = this.g;
    switch (tab) {
      case 'planes':
        return PLANE_IDS.map(id => ({ ico: PLANES[id].ico, name: PLANES[id].name, got: g.hangar.planeOwned(id), hint: PLANES[id].price ? `Niveau ${PLANES[id].level} + ${PLANES[id].price} pièces (ou cadeau de niveau)` : 'Dans ton hangar' }));
      case 'cities':
        return DESTINATIONS.map(d => ({ ico: d.flag, name: d.city, got: (g.arcade.data.visited || []).includes(d.city), hint: 'Vole vers cette ville (plan de vol)' }));
      case 'animals':
        return ANIMALS.map(a => ({ ico: a.ico, name: a.name.replace('le ', '').replace('la ', ''), got: (g.sky.data.animals || []).includes(a.ico), hint: 'Mission « Transport d\'animaux »' }));
      case 'people':
        return STORIES.map(s => ({ ico: s.ico, name: s.name, got: g.ground.data.met.includes(s.id), hint: 'Un visiteur arrive parfois à l\'aéroport' }));
      case 'world': {
        const ow = g.openWorld.data;
        const out = ISLANDS.map(i => ({ ico: i.ico, name: i.name, got: ow.islands.includes(i.id), hint: 'Survole cette île (au nord-est)' }));
        for (const e of EGGS) out.push({ ico: e.ico, name: e.name, got: !!ow.eggs[e.id], hint: 'Une surprise cachée dans le ciel…' });
        for (const n of [10, 20, 30, 40]) out.push({ ico: '🌠', name: `${n} étoiles filantes`, got: ow.stars.length >= n, hint: `Trouve ${n} étoiles filantes (${ow.stars.length}/40)` });
        return out;
      }
      case 'medals':
        return MISSION_DEFS.filter(d => d.id !== 'zoo' || true).map(d => {
          const m = (g.sky.data.best[d.id] || {}).medal || 0;
          return { ico: d.ico, name: d.name, got: m > 0, badge: MEDALS[m], hint: 'Réussis cette mission' };
        });
      case 'stickers':
        return STICKERS.filter(s => s.id !== 'none').map(s => ({ ico: s.ico, name: s.name, got: !s.price || g.hangar.data.owned.sticker.includes(s.id), hint: s.price ? 'Boutique du hangar ou coffre surprise' : '' }));
      case 'trophies':
        return BADGES.map(b => ({ ico: b.ico, name: b.name, got: !!g.arcade.data.badges[b.id], hint: b.desc }));
      case 'photos': {
        const n = (g.fun.data.photos || []).length;
        return Array.from({ length: 12 }, (_, i) => ({ ico: '📸', name: `Photo ${i + 1}`, got: i < n, hint: 'Appuie sur l\'appareil photo en vol' }));
      }
      default: return [];
    }
  }

  stats() {
    let got = 0, total = 0;
    for (const t of TABS) { const it = this.items(t.id); total += it.length; got += it.filter(i => i.got).length; }
    return { got, total };
  }

  open() {
    $('albumPanel').classList.remove('hidden');
    sfx.click();
    this.render();
  }

  render() {
    const st = this.stats();
    $('albumTotal').textContent = `${st.got} / ${st.total}`;
    $('albumBar').style.width = `${Math.round(st.got / Math.max(1, st.total) * 100)}%`;
    $('albumTabs').innerHTML = TABS.map(t => {
      const it = this.items(t.id);
      return `<button data-atab="${t.id}" class="${t.id === this.tab ? 'on' : ''}">${t.ico}<small>${t.label}</small><em>${it.filter(i => i.got).length}/${it.length}</em></button>`;
    }).join('');
    $('albumTabs').querySelectorAll('[data-atab]').forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.atab; sfx.click(); this.render(); }));
    /* Filtres : tout / a trouver / trouves */
    const fl = $('albumFilters');
    if (fl) {
      fl.innerHTML = FILTERS.map(([id, label]) => `<button data-afil="${id}" class="${id === this.filter ? 'on' : ''}">${label}</button>`).join('');
      fl.querySelectorAll('[data-afil]').forEach(b => b.addEventListener('click', () => { this.filter = b.dataset.afil; sfx.click(); this.render(); }));
    }
    const shown = this.items(this.tab).filter(i => this.filter === 'all' || (this.filter === 'done' ? i.got : !i.got));
    $('albumGrid').innerHTML = shown.length ? shown.map(i =>
      `<div class="al-card${i.got ? ' got' : ''}" title="${i.got ? i.name : i.hint}">` +
      `<span class="al-ico">${i.got ? i.ico : '❔'}</span><b>${i.got ? i.name : '???'}</b>` +
      `${i.badge ? `<span class="al-badge">${i.badge}</span>` : ''}${i.got ? '' : `<small>${i.hint}</small>`}</div>`).join('') : '<p class="al-empty">Rien ici pour le moment ✨</p>';
  }
}
