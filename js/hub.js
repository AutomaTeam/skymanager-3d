/* ============================================================
   hub.js — Le Hub : centre de controle de l'aeroport (mode Arcade)

   Un seul ecran pour tout voir d'un coup d'oeil et tout gerer :
     📊 Apercu    : pieces, terminal, avion, cabine, equipe, flotte,
                    objectif du moment et mini-carte en direct ;
     👥 Equipe    : embaucher et former le personnel (staff.js) ;
     🛒 Boutique  : ameliorations, nouvel avion, prix des billets,
                    style de carte ;
     🎯 Objectifs : defis du jour, cadeau, pieces cachees, carnet de
                    voyage, trophees.

   S'ouvre avec le bouton 🏢, la touche H, ou le bureau de la tour.
   Le monde est en pause tant qu'il est ouvert.
   ============================================================ */

import { ROLES, ROLE, trainCost } from './staff.js?v=1791578069';
import { COIN, BADGES, MAP_THEMES, DESTINATIONS, nextReward, titleOf, MAX_LEVEL } from './arcade.js?v=1791578069';
import { UPGRADES } from './airportTycoon.js?v=1791578069';
import { planeOf } from './fleet.js?v=1791578069';
import { sfx } from './sfx.js?v=1791578069';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');

const TABS = [
  { id: 'overview', ico: '📊', name: 'Aperçu' },
  { id: 'team', ico: '👥', name: 'Équipe' },
  { id: 'shop', ico: '🛒', name: 'Boutique' },
  { id: 'stats', ico: '📈', name: 'Stats' },
  { id: 'goals', ico: '🎯', name: 'Objectifs' }
];

/* Jauge horizontale (0..100) coloree selon la valeur. */
function bar(pct, cls = '') {
  const p = Math.round(clamp(pct, 0, 100));
  const tone = cls || (p >= 66 ? 'g' : p >= 33 ? 'o' : 'r');
  return `<span class="hb ${tone}"><i style="width:${p}%"></i></span>`;
}

export class Hub {
  constructor(game, kid) {
    this.g = game;
    this.kid = kid;                   // { KID_UPGRADE, KID_PRICES }
    this.tab = 'overview';
    this.isOpen = false;
    this._raf = 0;
    this._live = 0;
    this._build();
  }

  /* ---------------- DOM ---------------- */
  _build() {
    const root = document.createElement('div');
    root.id = 'hubRoot';
    root.className = 'hidden panel-overlay hub-overlay';
    root.innerHTML = `
      <div class="panel-card hub-card">
        <div class="hub-head">
          <div class="hub-title">
            <span class="hub-logo">🏢</span>
            <div class="min-w-0">
              <input id="hubName" class="hub-name" maxlength="20" autocomplete="off" spellcheck="false" aria-label="Nom de ton aéroport">
              <div id="hubSub" class="hub-sub"></div>
            </div>
          </div>
          <div class="hub-wallet"><b id="hubCoins">0</b><span>🪙</span></div>
          <button id="hubClose" class="panel-btn sm !w-auto px-3">Fermer</button>
        </div>
        <div class="hub-tabs" id="hubTabs">
          ${TABS.map(t => `<button class="hub-tab" data-act="tab:${t.id}"><span>${t.ico}</span>${t.name}<em id="hubBadge-${t.id}"></em></button>`).join('')}
        </div>
        <div id="hubBody" class="hub-body"></div>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.body = root.querySelector('#hubBody');

    this.mapCv = document.createElement('canvas');
    this.mapCv.width = 480; this.mapCv.height = 462;
    this.mapCv.className = 'hub-map';

    root.addEventListener('click', (e) => {
      if (e.target === root) { this.close(); return; }
      const el = e.target.closest('[data-act]');
      if (el) this._act(el.dataset.act);
    });
    root.querySelector('#hubClose').addEventListener('click', () => this.close());
    /* Pas de rafraichissement de l'apercu pendant un appui (un clic ne doit jamais tomber sur un element reconstruit). */
    root.addEventListener('pointerdown', () => { this._down = true; });
    const up = () => { this._down = false; };
    root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up); root.addEventListener('pointerleave', up);
    const nm = root.querySelector('#hubName');
    nm.addEventListener('change', () => { nm.value = this.g.arcade.setName(nm.value); sfx.ding(); });
    nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); });
  }

  /* ---------------- Ouverture / fermeture ---------------- */
  open(tab) {
    if (tab) this.tab = tab;
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.g._worldPaused = true;
    this.g.arcade.event('tower');
    this.render();
    sfx.click();
    const loop = () => {
      if (!this.isOpen) return;
      const now = performance.now();
      if (this.tab === 'overview') {
        if (now - this._live > 900 && !this._down) { this._live = now; this._renderOverview(true); }
        this.g.arcade._drawMap(this.mapCv, this.g.arcade.currentGoal().target);
      }
      this._raf = requestAnimationFrame(loop);
    };
    loop();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    cancelAnimationFrame(this._raf);
    this.root.classList.add('hidden');
    this.g._worldPaused = false;
  }

  toggle() { this.isOpen ? this.close() : this.open(); }

  /* ---------------- Actions (delegation des clics) ---------------- */
  _act(a) {
    const g = this.g, arc = g.arcade, ty = g.tycoon;
    const [k, v] = a.split(':');
    if (k === 'tab') { this.tab = v; sfx.click(); this.render(); return; }
    if (k === 'hire') {
      const r = g.staff.hire(v);
      if (!r.ok) { sfx.oops(); g.toast(r.why, 2200, 'warn'); } else g.toast(`${ROLE[v].ico} ${ROLE[v].name} recrute(e) !`, 2600, 'ok');
    } else if (k === 'train') {
      const r = g.staff.train(v);
      if (!r.ok) { sfx.oops(); g.toast(r.why, 2200, 'warn'); } else g.toast(`🎓 ${ROLE[v].name} : formation réussie !`, 2600, 'ok');
    } else if (k === 'buy') {
      if (ty.buyUpgrade(v)) { sfx.levelUp(); arc.confetti(50); arc.event('buy'); g.toast(`🎉 ${this.kid.KID_UPGRADE[v].name} acheté(e) !`, 2600, 'ok'); }
      else { sfx.oops(); g.toast('Pas assez de pièces...', 2000, 'warn'); }
    } else if (k === 'plane') {
      if (ty.buyAircraft()) { sfx.levelUp(); arc.confetti(70); arc.event('buy'); g.toast('✈️ Nouvel avion livré ! Il gagne des pièces pour toi.', 3200, 'ok'); }
      else { sfx.oops(); g.toast(ty.fleet.length >= ty.infrastructure.gates ? 'Il faut d\'abord une nouvelle porte !' : 'Pas assez de pièces...', 2400, 'warn'); }
    } else if (k === 'price') {
      ty.ticketPrice = parseInt(v, 10); ty.save(); sfx.click();
    } else if (k === 'theme') {
      if (arc.data.themes.includes(v)) { arc.setTheme(v); sfx.click(); }
      else if (arc.buyTheme(v)) g.toast(`🎨 Carte « ${MAP_THEMES[v].name} » débloquée !`, 2600, 'ok');
      else { sfx.oops(); g.toast('Pas assez de pièces...', 2000, 'warn'); }
    } else if (k === 'gift') {
      const r = arc.openGift();
      if (r) g.toast(`🎁 +${r.coins} 🪙 ! 🔥 Jour ${r.streak}/7${r.bonus ? ' · ' + r.bonus + ' !' : r.streak < 7 ? ' : reviens demain, le cadeau grossit !' : ''}`, 4600, 'ok');
    }
    this.render();
  }

  /* ---------------- Rendu ---------------- */
  render() {
    const g = this.g, arc = g.arcade;
    const nm = this.root.querySelector('#hubName');
    if (document.activeElement !== nm) nm.value = arc.data.name;
    this.root.querySelector('#hubSub').textContent =
      `Niveau ${arc.data.level} · ${arc.data.stats.flights} vol${arc.data.stats.flights > 1 ? 's' : ''} · ${g.staff.total} employé${g.staff.total > 1 ? 's' : ''}`;
    this.root.querySelector('#hubCoins').textContent = fmt(arc.coins);
    this.root.querySelectorAll('.hub-tab').forEach(t => t.classList.toggle('on', t.dataset.act === 'tab:' + this.tab));
    /* Pastilles d'alerte sur les onglets. */
    const hirable = ROLES.some(r => g.staff.canHire(r.id).ok);
    const canShop = ['shops', 'gates', 'vipLounge', 'terminals', 'runways'].some(k => g.tycoon.canBuy(k)) || g.tycoon.canBuyAircraft();
    const set = (id, on) => { const e = $('hubBadge-' + id); if (e) e.textContent = on ? '●' : ''; };
    set('team', hirable); set('shop', canShop); set('goals', arc.giftReady());
    if (this.tab === 'overview') this._renderOverview(false);
    else if (this.tab === 'team') this.body.innerHTML = this._team();
    else if (this.tab === 'shop') this.body.innerHTML = this._shop();
    else if (this.tab === 'stats') this.body.innerHTML = this._stats();
    else this.body.innerHTML = this._goals();
  }

  /* ----- Apercu ----- */
  _renderOverview(live) {
    const g = this.g, arc = g.arcade, ty = g.tycoon, term = g.terminal, cab = g.cabin, mech = g.mechanic, ac = g.ac;
    const wears = Object.values(mech.components).map(c => c.wear);
    const health = 100 - (wears.reduce((a, b) => a + b, 0) / Math.max(1, wears.length));
    const worst = Object.entries(mech.components).sort((a, b) => b[1].wear - a[1].wear)[0];
    /* L'avion a la porte est toujours le jet ; le prochain vol se fait avec celui du hangar. */
    const est = ty.estimateFlight(ac, term.boardedSinceFlight, planeOf(g.hangar.selected).income);
    const goal = arc.currentGoal();
    const done = arc.dailyItems.filter(d => d.done).length;
    const sat = cab.satisfaction, face = sat >= 88 ? '😍' : sat >= 70 ? '😀' : sat >= 50 ? '🙂' : sat >= 30 ? '😕' : '😠';
    const mood = term.mood, moodFace = mood >= 80 ? '😄' : mood >= 55 ? '🙂' : mood >= 30 ? '😐' : '😟';
    const machines = ['shop', 'cafe', 'vending'].map(id => term.counters[id]);
    const nextRw = nextReward(arc.data.level);
    const hiredIcons = ROLES.flatMap(r => Array(g.staff.count(r.id)).fill(r.ico)).join(' ') || '<span class="hub-dim">Personne pour l\'instant</span>';
    const tile = (cls, act, inner) => `<div class="hub-tile ${cls}" ${act ? `data-act="${act}"` : ''}>${inner}</div>`;

    const html = `<div class="hub-grid">
      ${tile('gold', 'tab:shop', `
        <div class="ht-h"><span>💰</span>Trésor</div>
        <div class="ht-big">${fmt(arc.coins)} <small>🪙</small></div>
        <div class="ht-row">⭐ ${arc.data.stars} · Niveau <b>${arc.data.level}</b>/${MAX_LEVEL} · ${titleOf(arc.data.level)}</div>
        <div class="xp-bar big"><span class="xp-fill" style="width:${Math.round(arc.xpProgress() * 100)}%"></span></div>
        <div class="ht-note">Prochain vol : environ <b>+${Math.max(0, Math.round(est.profit / COIN))} 🪙</b></div>
        ${nextRw ? `<div class="ht-note">🎁 Niveau ${nextRw.level} : ${nextRw.ico} ${nextRw.text}</div>` : '<div class="ht-note">👑 Niveau maximum atteint !</div>'}`)}
      ${tile('', 'tab:goals', `
        <div class="ht-h"><span>⚡</span>Objectif</div>
        <div class="ht-goal"><span>${goal.icon}</span><p>${goal.text}</p></div>
        <div class="ht-row">Défis du jour : ${'●'.repeat(done)}${'○'.repeat(Math.max(0, arc.dailyItems.length - done))} ${arc.giftReady() ? '· 🎁 cadeau prêt !' : ''}</div>`)}
      ${tile('', 'tab:team', `
        <div class="ht-h"><span>👥</span>Équipe <em>${g.staff.total}/${g.staff.slots}</em></div>
        <div class="ht-icons">${hiredIcons}</div>
        <div class="ht-note">${ROLES.some(r => g.staff.canHire(r.id).ok) ? '✨ Tu peux recruter quelqu\'un !' : 'Ils travaillent même quand tu voles.'}</div>`)}
      ${tile('', null, `
        <div class="ht-h"><span>🏢</span>Terminal <em>${moodFace}</em></div>
        <div class="ht-row">Ambiance ${bar(mood)}<b>${Math.round(mood)}%</b></div>
        <div class="ht-row">Files <b>${term.totalQueue()}</b> · Embarqués <b>${term.boarded}</b> · Caisses <b>${term.counters.storage.crates}</b></div>
        <div class="ht-row ht-stock">${machines.map(c => `<span>${{ shop: '🛍️', cafe: '☕', vending: '🥤' }[c.id]}${bar(c.stock / 12 * 100)}</span>`).join('')}</div>`)}
      ${tile('', null, `
        <div class="ht-h"><span>✈️</span>Avion <em>${g.state === 'PILOT' && !ac.onGround ? 'en vol' : 'au parking'}</em></div>
        <div class="ht-row">Santé ${bar(health)}<b>${Math.round(health)}%</b></div>
        <div class="ht-row">Carburant ${bar(ac.fuel / ac.fuelCap * 100, 'b')}<b>${Math.round(ac.fuel / ac.fuelCap * 100)}%</b></div>
        <div class="ht-note">${worst && worst[1].wear > 40 ? '🔧 À surveiller : ' + (worst[1].label || worst[0]) : '✅ Tout va bien'}</div>`)}
      ${tile('', null, `
        <div class="ht-h"><span>🥤</span>Cabine <em>${face}</em></div>
        <div class="ht-row">Satisfaction ${bar(sat)}<b>${Math.round(sat)}%</b></div>
        <div class="ht-note">Boutique à bord : ${fmt(Math.floor(cab.dutyFreeRevenue / COIN))} 🪙</div>`)}
      ${tile('', 'tab:shop', `
        <div class="ht-h"><span>🛫</span>Flotte</div>
        <div class="ht-row"><b>${ty.fleet.length}</b> avion${ty.fleet.length > 1 ? 's' : ''} · <b>${ty.infrastructure.gates}</b> porte${ty.infrastructure.gates > 1 ? 's' : ''}</div>
        <div class="ht-row">≈ <b>${est.pax}</b> passagers par vol</div>
        <div class="ht-row">Réputation ${bar(ty.reputation, 'b')}<b>${Math.round(ty.reputation)}%</b></div>`)}
      <div class="hub-tile map" data-slot="map"><div class="ht-h"><span>🗺️</span>En direct</div><div id="hubMapSlot"></div></div>
    </div>`;

    /* En rafraichissement direct on remplace seulement le texte, la carte reste en place. */
    this.body.innerHTML = html;
    const slot = this.body.querySelector('#hubMapSlot');
    if (slot) slot.replaceWith(this.mapCv);
  }

  /* ----- Equipe ----- */
  _team() {
    const st = this.g.staff, arc = this.g.arcade;
    return `<p class="hub-intro">Recrute des employés : ils travaillent tout seuls, <b>même quand tu voles ou que tu es en cabine</b>. Forme-les pour qu'ils aillent plus vite et se trompent moins.</p>
      <div class="hub-list">${ROLES.map(r => {
        const h = st.hired[r.id], hire = st.canHire(r.id), tr = st.canTrain(r.id);
        const locked = !st.isUnlocked(r.id);
        return `<div class="hub-role${locked ? ' locked' : ''}${h.n ? ' has' : ''}">
          <div class="hr-ico">${locked ? '🔒' : r.ico}</div>
          <div class="hr-mid">
            <div class="hr-name">${r.name} <em>${h.n}/${r.max}</em></div>
            <div class="hr-desc">${locked ? `Débloque au niveau ${r.unlock} (tu es niveau ${arc.data.level})` : r.desc}</div>
            <div class="hr-lvl">${h.n ? `Formation niveau ${h.lvl}/3 · fiable ${Math.round(st.accuracy(r.id) * 100)} %` : ''}</div>
          </div>
          <div class="hr-btns">
            <button class="hub-buy" data-act="hire:${r.id}" ${hire.ok ? '' : 'disabled'}>${h.n >= r.max ? 'Complet' : locked ? '🔒' : `Recruter<br><b>${r.cost} 🪙</b>`}</button>
            ${h.n ? `<button class="hub-buy alt" data-act="train:${r.id}" ${tr.ok ? '' : 'disabled'}>${h.lvl >= 3 ? 'Expert' : `Former<br><b>${trainCost(r, h.lvl)} 🪙</b>`}</button>` : ''}
          </div>
        </div>`;
      }).join('')}</div>`;
  }

  /* ----- Boutique ----- */
  _shop() {
    const g = this.g, ty = g.tycoon, arc = g.arcade, K = this.kid;
    const ups = Object.keys(UPGRADES).map(key => {
      const k = K.KID_UPGRADE[key], cost = ty.upgradeCost(key), maxed = cost == null;
      const c = maxed ? 0 : Math.round(cost / COIN), afford = !maxed && arc.coins >= c;
      const lvl = UPGRADES[key].once ? (ty.infrastructure[key] ? 'Acquis' : '') : `Niveau ${ty.infrastructure[key]}`;
      return `<div class="hub-role has${afford ? ' afford' : ''}"><div class="hr-ico">${k.ico}</div>
        <div class="hr-mid"><div class="hr-name">${k.name}</div><div class="hr-desc">${k.desc}</div><div class="hr-lvl">${lvl}</div></div>
        <div class="hr-btns"><button class="hub-buy" data-act="buy:${key}" ${maxed || !afford ? 'disabled' : ''}>${maxed ? 'MAX' : `<b>${fmt(c)} 🪙</b>`}</button></div></div>`;
    }).join('');
    const acc = Math.round(ty.aircraftCost() / COIN), acOk = ty.canBuyAircraft();
    const plane = `<div class="hub-role has${acOk ? ' afford' : ''}"><div class="hr-ico">✈️</div>
      <div class="hr-mid"><div class="hr-name">Nouvel avion</div><div class="hr-desc">${ty.fleet.length >= ty.infrastructure.gates ? 'Il faut d\'abord une nouvelle porte !' : 'Il vole tout seul : +2 🪙 par minute.'}</div><div class="hr-lvl">${ty.fleet.length} avion${ty.fleet.length > 1 ? 's' : ''}</div></div>
      <div class="hr-btns"><button class="hub-buy" data-act="plane" ${acOk ? '' : 'disabled'}><b>${fmt(acc)} 🪙</b></button></div></div>`;
    const cur = ty.ticketPrice;
    const prices = K.KID_PRICES.map(o => {
      /* Passagers reels du prochain vol (socle Arcade + embarques au terminal), pas la demande theorique. */
      ty.ticketPrice = o.p; const pax = ty._flightPax(ty.paxPerFlight, g.terminal.boardedSinceFlight); ty.ticketPrice = cur;
      const on = K.KID_PRICES.every(x => Math.abs(cur - o.p) <= Math.abs(cur - x.p));
      return `<button class="price-btn${on ? ' on' : ''}" data-act="price:${o.p}">${o.ico} ${o.name}<small>≈ ${pax} passagers</small></button>`;
    }).join('');
    const themes = Object.keys(MAP_THEMES).map(id => {
      const t = MAP_THEMES[id], owned = arc.data.themes.includes(id), on = arc.data.mapTheme === id;
      return `<button class="theme-btn${on ? ' on' : ''}${owned ? '' : ' locked'}" data-act="theme:${id}">${t.ico}<small>${t.name}</small><span class="pr">${on ? '✔ choisi' : owned ? 'choisir' : t.cost + ' 🪙'}</span>
        <span class="sw" style="background:linear-gradient(90deg,${t.grass} 33%,${t.runway} 33% 66%,${t.hangar} 66%)"></span></button>`;
    }).join('');
    return `<h3 class="hub-h3">Améliorations</h3><div class="hub-list">${ups}${plane}</div>
      <h3 class="hub-h3">Prix des billets</h3><div class="grid grid-cols-3 gap-2">${prices}</div>
      <p class="hub-dim">Billet cher = moins de passagers. Billet pas cher = plus de passagers.</p>
      <h3 class="hub-h3">Style de la mini-carte</h3><div class="grid grid-cols-4 gap-2">${themes}</div>`;
  }

  /* ----- Stats : courbes et historique des vols ----- */
  _stats() {
    const g = this.g, hist = g.history, arc = g.arcade;
    /* Courbe(s) SVG : `series` = [{ values, color, label }], echelle commune. */
    const chart = (series, { min = 0, max = null, unit = '' } = {}) => {
      const W = 320, Hh = 110, L = 30, R = 10, T = 10, B = 16;
      const all = series.flatMap(s => s.values);
      if (all.length < 2) return '<div class="hub-empty">Les courbes se remplissent toutes les 30 s de jeu.<br>Reviens dans un instant ! ⏳</div>';
      let lo = min, hi = max == null ? Math.max(...all, lo + 1) : max;
      if (max == null) hi = Math.ceil(hi / 10) * 10 || 10;
      const x = (i, n) => L + (n <= 1 ? 0 : i / (n - 1)) * (W - L - R);
      const y = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (Hh - T - B);
      const grid = [0, 0.5, 1].map(f => { const v = lo + (hi - lo) * f, yy = y(v); return `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="cg"/><text x="${L - 4}" y="${yy + 3}" class="ct" text-anchor="end">${Math.round(v)}</text>`; }).join('');
      const lines = series.map(s => {
        const n = s.values.length, pts = s.values.map((v, i) => `${x(i, n).toFixed(1)},${y(v).toFixed(1)}`);
        const area = series.length === 1 ? `<polygon points="${L},${y(lo)} ${pts.join(' ')} ${x(n - 1, n)},${y(lo)}" fill="${s.color}" opacity="0.16"/>` : '';
        const last = s.values[n - 1];
        return `${area}<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>` +
          `<circle cx="${x(n - 1, n)}" cy="${y(last)}" r="3.6" fill="${s.color}" stroke="#0b1220" stroke-width="1.5"/>` +
          `<text x="${x(n - 1, n) - 6}" y="${y(last) < T + 12 ? y(last) + 15 : y(last) - 7}" class="cl" fill="${s.color}" text-anchor="end">${last}${unit}</text>`;
      }).join('');
      const legend = series.length > 1 ? `<div class="cleg">${series.map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}</div>` : '';
      return `<svg viewBox="0 0 ${W} ${Hh}" class="hub-svg" role="img">${grid}${lines}</svg>${legend}`;
    };

    /* Barres : gain de chaque vol, couleur selon les etoiles. */
    const bars = () => {
      const f = hist.flights;
      if (!f.length) return '<div class="hub-empty">Aucun vol pour l\'instant : décolle pour remplir ce graphique ! 🛫</div>';
      const max = Math.max(...f.map(v => v.coins), 10);
      return `<div class="fbars">${f.map(v => `<div class="fb" title="${v.city || 'Vol libre'} : +${v.coins} pieces, ${v.pax} passagers">
        <b>+${v.coins}</b><span class="fbar s${v.stars}" style="height:${Math.max(6, Math.round(v.coins / max * 100))}%"></span>
        <em>${v.ico || '🛫'}</em><small>${'⭐'.repeat(v.stars) || '·'}</small></div>`).join('')}</div>`;
    };

    const s = arc.data.stats;
    const cards = [
      ['🛫', 'Vols', s.flights], ['🪙', 'Pièces gagnées', fmt(arc.data.coinsEarned)], ['🧳', 'Passagers embarqués', fmt(g.terminal.boarded)],
      ['⭐', 'Atterrissages parfaits', s.star3], ['🟡', 'Anneaux', s.rings], ['✨', 'Pièces cachées', s.treasure]
    ].map(c => `<div class="stat-card"><span>${c[0]}</span><b>${c[2]}</b><small>${c[1]}</small></div>`).join('');

    return `<div class="stat-cards">${cards}</div>
      <div class="hub-charts">
        <div class="hub-chart"><h3 class="hub-h3">💰 Pièces</h3>${chart([{ values: hist.series('coins'), color: '#fbbf24', label: 'Pièces' }])}</div>
        <div class="hub-chart"><h3 class="hub-h3">😊 Bonheur</h3>${chart([{ values: hist.series('mood'), color: '#38bdf8', label: 'Ambiance du hall' }, { values: hist.series('sat'), color: '#f472b6', label: 'Satisfaction cabine' }], { min: 0, max: 100, unit: '%' })}</div>
        <div class="hub-chart"><h3 class="hub-h3">🧳 Passagers embarqués</h3>${chart([{ values: hist.series('boarded'), color: '#4ade80', label: 'Embarqués' }])}</div>
        <div class="hub-chart"><h3 class="hub-h3">👥 Équipe</h3>${chart([{ values: hist.series('staff'), color: '#a78bfa', label: 'Employés' }])}</div>
      </div>
      <h3 class="hub-h3">🛫 Gains des derniers vols</h3>${bars()}`;
  }

  /* ----- Objectifs ----- */
  _goals() {
    const g = this.g, arc = g.arcade;
    const daily = arc.dailyItems.map(d => `<div class="kid-daily-row${d.done ? ' done' : ''}"><span class="ico">${d.done ? '✅' : d.icon}</span><span>${d.label} <b>(${d.progress}/${d.target})</b></span><span class="rw">+${d.reward} 🪙</span></div>`).join('');
    const gf = arc.data.gift, ready = arc.giftReady(), streak = (gf && gf.streak) || 0;
    const gift = `<div class="kid-gift${ready ? ' ready' : ''}"><span class="gi">${ready ? '🎁' : '📭'}</span>
      <div class="gt"><b>${ready ? 'Ton cadeau du jour est là !' : 'Cadeau ouvert, à demain !'}</b>${streak > 0 ? `🔥 ${streak} jour${streak > 1 ? 's' : ''} de suite` : 'Reviens chaque jour pour un plus gros cadeau'}</div>
      <button data-act="gift" ${ready ? '' : 'disabled'}>${ready ? 'OUVRIR' : '✔'}</button></div>`;
    const th = arc.treasureHeat();
    const trea = th ? `<div class="kid-treasure"><div class="coins">${arc.data.treasure.got.map(v => `<i class="${v ? 'on' : ''}">🪙</i>`).join('')}</div><div class="flex-1">${th.found}/${th.total} trouvées.<br><span class="hub-dim">${th.txt}</span></div></div>` : '<div class="hub-dim">Sors sur le tarmac pour les découvrir !</div>';
    const trips = DESTINATIONS.map(d => `<span class="trip${arc.data.visited.includes(d.city) ? ' on' : ''}" title="${d.city}">${arc.data.visited.includes(d.city) ? d.flag : '❔'}</span>`).join('');
    const got = arc.data.badges;
    const badges = BADGES.map(b => { const on = !!got[b.id]; return `<div class="badge${on ? ' on' : ''}"><span class="b-ico">${on ? b.ico : '❓'}</span><b>${on ? b.name : '???'}</b><small>${b.desc}</small></div>`; }).join('');
    return `${gift}
      <h3 class="hub-h3">Défis du jour</h3><div class="space-y-1.5">${daily}</div>
      <h3 class="hub-h3">Chasse aux pièces cachées</h3>${trea}
      <h3 class="hub-h3">Carnet de voyage <em>${arc.data.visited.length}/${DESTINATIONS.length}</em></h3><div class="trips">${trips}</div>
      <h3 class="hub-h3">Trophées <em>${arc.badgeCount()}/${BADGES.length}</em></h3><div class="album-grid">${badges}</div>`;
  }
}
