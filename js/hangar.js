/* ============================================================
   hangar.js — « Mon hangar » (mode Arcade, vague 2)

   Le joueur choisit son avion, le peint (couleur, accent, motif),
   colle des autocollants, lui donne un nom, et depense ses pieces
   pour debloquer de nouveaux objets. L'apercu est le vrai modele
   3D de la scene, pose a la porte et filme en orbite : on peut
   essayer un objet verrouille avant de l'acheter.

   Donnees : localStorage 'skymanager.hangar'.
   ============================================================ */

import { sfx } from './sfx.js?v=1791559596';
import { PLANES, PLANE_IDS, planeOf } from './fleet.js?v=1791559596';
import {
  BODY_COLORS, ACCENT_COLORS, NOSE_COLORS, PATTERNS, STICKERS, defaultLivery, find, encodeLivery, decodeLivery
} from './livery.js?v=1791559596';

const STORE = 'skymanager.hangar';
const $ = (id) => document.getElementById(id);
const COIN = 1000;

const CATALOG = { body: BODY_COLORS, accent: ACCENT_COLORS, pattern: PATTERNS, sticker: STICKERS };
/* Onglets de peinture : 'nose' (nez / moteur) a son propre choix mais partage les couleurs d'accent possedees. */
const LISTS = { ...CATALOG, nose: NOSE_COLORS };
const OWN_KEY = (kind) => (kind === 'nose' ? 'accent' : kind);
const SLOT_LABELS = ['Nez', 'Avant', 'Arriere'];

export class Hangar {
  constructor(game) {
    this.g = game;
    this.data = this._load();
    this.active = false;
    this.tab = 'plane';
    this.slot = 0;
    this.trial = null;            // { kind, id, price } : objet essaye, pas encore achete
    this.az = 0;                  // azimut de la camera d'apercu (rad)
    this._drag = null;
    this._bind();
  }

  /* ---------------- Donnees ---------------- */
  _load() {
    const def = {
      selected: 'pioupiou',
      planes: ['liner', 'pioupiou'],
      owned: { body: [], accent: [], pattern: [], sticker: [] },
      liveries: {}
    };
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (d) {
        const owned = Object.assign(def.owned, d.owned || {});
        return Object.assign(def, d, { owned, planes: d.planes || def.planes, liveries: d.liveries || {} });
      }
    } catch (e) { /* ignore */ }
    return def;
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }

  get selected() { return this.data.selected; }
  livery(id) {
    const base = defaultLivery(id);
    const saved = this.data.liveries[id] || {};
    return Object.assign(base, saved, { stickers: (saved.stickers || base.stickers).slice(0, 3) });
  }
  _setLivery(id, lv) { this.data.liveries[id] = lv; this.save(); }

  isOwned(kind, item) {
    return !item.price || (this.data.owned[OWN_KEY(kind)] || []).includes(item.id);
  }
  planeOwned(id) { return this.data.planes.includes(id); }

  get coins() { return this.g.arcade.coins; }
  _spend(n) {
    const t = this.g.tycoon;
    if (this.coins < n) return false;
    t.cash -= n * COIN;
    t.save();
    return true;
  }

  /* Applique toutes les livrees enregistrees (au demarrage). */
  applyAll() {
    for (const id of PLANE_IDS) this.g.r3d.applyLivery(id, this.livery(id));
  }

  /* Cadeau de coffre : un objet verrouille au hasard, ou null s'il n'en reste pas. */
  randomUnlock() {
    const pool = [];
    for (const kind of Object.keys(CATALOG)) {
      for (const it of CATALOG[kind]) {
        if (it.price && !this.isOwned(kind, it)) pool.push({ kind, it, w: it.rare ? 1 : 4 });
      }
    }
    if (!pool.length) return null;
    let r = Math.random() * pool.reduce((s, p) => s + p.w, 0), pick = pool[0];
    for (const p of pool) { r -= p.w; if (r <= 0) { pick = p; break; } }
    this.data.owned[pick.kind].push(pick.it.id);
    this.save();
    const nameOf = { body: 'Couleur', accent: 'Accent', pattern: 'Motif', sticker: 'Autocollant' }[pick.kind];
    return { kind: pick.kind, item: pick.it, label: `${nameOf} « ${pick.it.name} » ${pick.it.ico || ''}` };
  }

  /* H05 : souvenir de la boutique du terminal. Rend l'objet propose du moment
     (le moins cher non possede, hors rares) ou null. */
  shopOffer() {
    let best = null;
    for (const kind of Object.keys(CATALOG)) for (const it of CATALOG[kind]) {
      if (it.price && !it.rare && !this.isOwned(kind, it) && (!best || it.price < best.it.price)) best = { kind, it };
    }
    return best;
  }
  buyOffer(o) {
    if (!o || this.isOwned(o.kind, o.it)) return false;
    if (!this._spend(o.it.price)) return false;
    this.data.owned[o.kind].push(o.it.id);
    this.save();
    return true;
  }

  /* I06 : code de partage de la livree de l'avion affiche. */
  _shareCode() {
    const code = encodeLivery(this.previewId, this.livery(this.previewId));
    const done = () => this.g.toast('📤 Code copie ! Envoie-le a un copain.', 3200, 'ok');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done).catch(() => window.prompt('Copie ce code :', code));
    else window.prompt('Copie ce code :', code);
  }

  _importCode() {
    const code = window.prompt('Colle le code de ton copain :');
    if (code == null) return;
    const r = decodeLivery(code, (kind, it) => this.isOwned(kind, it));
    if (!r) { this.g.toast('📥 Ce code ne marche pas.', 3000, 'warn'); return; }
    const mine = this.livery(this.previewId);
    this._setLivery(this.previewId, Object.assign(mine, r.livery));
    this._applyView();
    this._render();
    sfx.tada();
    this.g.toast('📥 Avion copie ! Ce que tu n\'as pas encore est remplace.', 3600, 'ok');
  }

  /* ---------------- Ouverture / fermeture ---------------- */
  open() {
    const g = this.g;
    if (this.active || g.state !== 'HUB') return false;
    this.active = true;
    this.g.arcade.data.stats.hangarVisit = (this.g.arcade.data.stats.hangarVisit || 0) + 1;
    this.tab = 'plane';
    this.trial = null;
    this.previewId = this.data.selected;
    g.closePause();
    g._worldPaused = false;
    $('hudHub').classList.add('hidden');
    $('hangar').classList.remove('hidden');
    document.body.classList.add('in-hangar');
    this._showPreview(this.previewId);
    this._render();
    sfx.pop();
    return true;
  }

  close(fly = false) {
    if (!this.active) return;
    this.active = false;
    this.trial = null;
    $('hangar').classList.add('hidden');
    document.body.classList.remove('in-hangar');
    this.g.r3d.camera.clearViewOffset();
    $('hudHub').classList.remove('hidden');
    /* A l'aeroport on revoit le jet de ligne ; la livree est deja appliquee. */
    this.g.r3d.setActivePlane('liner');
    if (fly) this.g.boardAircraft();
  }

  /* Affiche un avion sur le parking, avec sa livree enregistree. */
  _showPreview(id) {
    this.previewId = id;
    const P = planeOf(id);
    this.g.r3d.setActivePlane(id, P.camScale);
    this.g.r3d.applyLivery(id, this.livery(id));
    this._radius = id === 'liner' ? 66 : 19;
    this._height = id === 'liner' ? 12 : 4.2;
  }

  /* L'apercu d'un petit avion est pose a la porte, roues au sol. */
  placePreview() {
    const r3d = this.g.r3d, M = r3d.activeModel;
    if (!M) return;
    const P = planeOf(this.previewId);
    const gate = r3d.gatePosition;
    M.group.position.set(gate.x, P.phys ? P.phys.groundY : 3.14, gate.z);
    M.group.quaternion.copy(this.g.ac.quat);
    M.update({ n1: 22, ctl: { roll: 0, pitch: 0, yaw: 0 }, onGround: false, tas: 0 }, 0.016, this.g.time);
  }

  /* Camera en orbite autour de l'avion, cote aire de stationnement. */
  updateCamera(cam, dt) {
    const gate = this.g.r3d.gatePosition;
    /* apercu a 360° : l'avion tourne tout seul, un doigt le fait tourner a la main */
    if (!this._drag) this.az += dt * 0.22;
    if (this.az > Math.PI) this.az -= 2 * Math.PI;
    if (this.az < -Math.PI) this.az += 2 * Math.PI;
    const R = this._radius, H = this._height;
    /* base : le nord (-z) ; az pivote autour de l'avion */
    const tx = gate.x, tz = gate.z, ty = this.previewId === 'liner' ? 4.2 : 1.1;
    cam.position.set(tx + Math.sin(this.az) * R, ty + H, tz - Math.cos(this.az) * R);
    cam.up.set(0, 1, 0);
    cam.lookAt(tx, ty, tz);
    cam.fov = this.previewId === 'liner' ? 46 : 42;
    cam.near = 0.3;
    /* Le panneau couvre une moitie de l'ecran : on decale l'image pour
       que l'avion reste centre dans la partie libre. */
    const W = window.innerWidth, Hh = window.innerHeight;
    if (W > 700) cam.setViewOffset(W, Hh, W * 0.22, 0, W, Hh);
    else cam.setViewOffset(W, Hh, 0, Hh * 0.2, W, Hh);
    cam.updateProjectionMatrix();
  }

  /* ---------------- Interface ---------------- */
  _bind() {
    $('hgBack').addEventListener('click', () => { sfx.click(); this.close(false); });
    $('hgFly').addEventListener('click', () => { sfx.whoosh(); this.close(true); });
    document.querySelectorAll('[data-hgtab]').forEach(b => b.addEventListener('click', () => {
      this.tab = b.dataset.hgtab; this.trial = null; sfx.click(); this._render(); this._applyView();
    }));
    $('hgBuyYes').addEventListener('click', () => this._buy());
    $('hgBuyNo').addEventListener('click', () => { this.trial = null; sfx.click(); this._render(); this._applyView(); });

    /* Glisser pour tourner autour de l'avion. */
    const surface = $('scene');
    const down = (e) => {
      if (!this.active) return;
      this._drag = { x: e.clientX, az: this.az };
    };
    const move = (e) => {
      if (!this._drag) return;
      this.az = this._drag.az - (e.clientX - this._drag.x) * 0.006;
    };
    const up = () => { this._drag = null; };
    surface.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /* Livree effectivement affichee : l'enregistree + l'objet essaye. */
  _viewLivery() {
    const lv = this.livery(this.previewId);
    if (this.trial) {
      const t = this.trial;
      if (t.kind === 'body') lv.body = t.id;
      else if (t.kind === 'accent') lv.accent = t.id;
      else if (t.kind === 'nose') lv.accent2 = t.id;
      else if (t.kind === 'pattern') lv.pattern = t.id;
      else if (t.kind === 'sticker') lv.stickers[this.slot] = t.id;
    }
    return lv;
  }
  _applyView() { this.g.r3d.applyLivery(this.previewId, this._viewLivery()); }

  _choose(kind, item) {
    if (this.isOwned(kind, item)) {
      this.trial = null;
      const lv = this.livery(this.previewId);
      if (kind === 'body') lv.body = item.id;
      else if (kind === 'accent') lv.accent = item.id;
      else if (kind === 'nose') lv.accent2 = item.id;
      else if (kind === 'pattern') lv.pattern = item.id;
      else if (kind === 'sticker') lv.stickers[this.slot] = item.id;
      this._setLivery(this.previewId, lv);
      sfx.pop();
    } else {
      this.trial = { kind, id: item.id, price: item.price, name: item.name };
      sfx.click();
    }
    this._applyView();
    this._render();
  }

  _buy() {
    const t = this.trial;
    if (!t) return;
    if (t.kind === 'plane') {
      if (!this._spend(t.price)) { sfx.oops(); this.g.toast('Pas assez de pieces… vole encore un peu !', 2400, 'warn'); return; }
      this.data.planes.push(t.id);
      this.data.selected = t.id;
      this.save();
      this.trial = null;
      sfx.levelUp(); this.g.arcade.confetti(60);
      this._showPreview(t.id);
      this.g.fun.say(`Bravo ! ${planeOf(t.id).name} est a toi !`, 3);
      this._render();
      return;
    }
    if (!this._spend(t.price)) { sfx.oops(); this.g.toast('Pas assez de pieces… vole encore un peu !', 2400, 'warn'); return; }
    this.data.owned[OWN_KEY(t.kind)].push(t.id);
    const lv = this.livery(this.previewId);
    if (t.kind === 'body') lv.body = t.id;
    else if (t.kind === 'accent') lv.accent = t.id;
    else if (t.kind === 'nose') lv.accent2 = t.id;
    else if (t.kind === 'pattern') lv.pattern = t.id;
    else if (t.kind === 'sticker') lv.stickers[this.slot] = t.id;
    this._setLivery(this.previewId, lv);
    this.trial = null;
    sfx.tada(); this.g.arcade.confetti(40);
    this._applyView();
    this._render();
  }

  _choosePlane(id) {
    const P = PLANES[id];
    if (this.planeOwned(id)) {
      this.data.selected = id;
      this.save();
      this.trial = null;
      this._showPreview(id);
      sfx.pop();
    } else {
      this.trial = { kind: 'plane', id, price: P.price, name: P.name };
      this._showPreview(id);
      sfx.click();
    }
    this._render();
  }

  _render() {
    $('hgCoins').textContent = this.coins;
    document.querySelectorAll('[data-hgtab]').forEach(b => b.classList.toggle('on', b.dataset.hgtab === this.tab));
    const body = $('hgBody');
    const lv = this.livery(this.previewId);
    const tabTitle = {
      plane: 'Choisis ton avion', nose: 'Nez et moteur', body: 'Couleur de l\'avion', accent: 'Couleur d\'accent (queue, ailes)',
      pattern: 'Motif sur le flanc', sticker: 'Autocollants', name: 'Nom sur le fuselage'
    }[this.tab];
    let html = `<p class="hg-sub">${tabTitle}</p>`;

    if (this.tab === 'plane') {
      html += '<div class="hg-planes">';
      for (const id of PLANE_IDS) {
        const P = PLANES[id];
        const owned = this.planeOwned(id);
        const lvOk = this.g.arcade.data.level >= P.level;
        const sel = this.data.selected === id;
        const stars = (n) => '★'.repeat(n) + '<i>' + '★'.repeat(5 - n) + '</i>';
        html += `<button class="hg-plane${sel ? ' sel' : ''}${owned ? '' : ' locked'}" data-plane="${id}">` +
          `<span class="hp-ico">${P.ico}</span><span class="hp-mid"><b>${P.name}</b><small>${P.blurb}</small>` +
          `<em>Facile ${stars(P.stars.ease)} · Fun ${stars(P.stars.fun)} · Vitesse ${stars(P.stars.speed)}</em></span>` +
          `<span class="hp-tag">${sel ? '✔ Choisi' : owned ? 'Choisir' : (lvOk ? `🪙 ${P.price}` : `🔒 Niv ${P.level}`)}</span></button>`;
      }
      html += '</div>';
    } else if (this.tab === 'name') {
      html += '<input id="hgName" class="hg-name" maxlength="12" autocomplete="off" placeholder="Ex : ECLAIR" />';
      html += '<p class="hg-hint">Le nom apparait sur le flanc de ton avion.</p>';
      html += '<div class="hg-share"><button id="hgShare">📤 Partager mon avion</button><button id="hgImport">📥 Copier celui d\'un copain</button></div>';
    } else {
      const kind = this.tab;
      if (kind === 'sticker') {
        html += '<div class="hg-slots">' + SLOT_LABELS.map((l, i) =>
          `<button data-slot="${i}" class="${this.slot === i ? 'on' : ''}">${l}</button>`).join('') + '</div>';
      }
      const current = kind === 'body' ? lv.body : kind === 'accent' ? lv.accent : kind === 'nose' ? (lv.accent2 || 'same') : kind === 'pattern' ? lv.pattern : lv.stickers[this.slot];
      if (kind === 'nose' && this.previewId === 'liner') html += '<p class="hg-hint">Pas de couleur de nez sur le gros avion.</p>';
      html += '<div class="hg-grid">';
      for (const it of LISTS[kind]) {
        const owned = this.isOwned(kind, it);
        const on = (this.trial && this.trial.kind === kind && this.trial.id === it.id) || (!this.trial && current === it.id);
        const sw = it.hex !== undefined
          ? `<span class="sw" style="background:#${it.hex.toString(16).padStart(6, '0')}"></span>`
          : `<span class="ic">${it.ico}</span>`;
        html += `<button class="hg-item${on ? ' on' : ''}${owned ? '' : ' locked'}${it.rare ? ' rare' : ''}" data-kind="${kind}" data-id="${it.id}" title="${it.name}">` +
          `${sw}<small>${it.name}</small>${owned ? '' : `<span class="pr">${it.price}</span>`}</button>`;
      }
      html += '</div>';
    }
    body.innerHTML = html;
    body.querySelectorAll('[data-plane]').forEach(b => b.addEventListener('click', () => this._choosePlane(b.dataset.plane)));
    body.querySelectorAll('[data-slot]').forEach(b => b.addEventListener('click', () => { this.slot = +b.dataset.slot; this.trial = null; sfx.click(); this._render(); }));
    body.querySelectorAll('.hg-item').forEach(b => b.addEventListener('click', () => {
      const it = find(LISTS[b.dataset.kind], b.dataset.id);
      this._choose(b.dataset.kind, it);
    }));
    const sh = body.querySelector('#hgShare');
    if (sh) sh.addEventListener('click', () => this._shareCode());
    const im = body.querySelector('#hgImport');
    if (im) im.addEventListener('click', () => this._importCode());
    /* champ du nom : le recree a chaque rendu, donc on le relie ici */
    const nm = body.querySelector('#hgName');
    if (nm) {
      nm.value = lv.name || '';
      nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); });
      nm.addEventListener('input', () => {
        const l2 = this.livery(this.previewId);
        l2.name = nm.value.slice(0, 12).toUpperCase();
        this._setLivery(this.previewId, l2);
        this._applyView();
      });
    }
    /* barre d'achat */
    const bar = $('hgBuy');
    if (this.trial) {
      const t = this.trial;
      const can = this.coins >= t.price;
      const lvOk = t.kind !== 'plane' || this.g.arcade.data.level >= PLANES[t.id].level;
      $('hgBuyTxt').innerHTML = lvOk
        ? `Essai : <b>${t.name}</b> — <b>${t.price} 🪙</b>${can ? '' : ' <em>(il te manque ' + (t.price - this.coins) + ' 🪙)</em>'}`
        : `<b>${t.name}</b> se debloque au <b>niveau ${PLANES[t.id].level}</b>`;
      $('hgBuyYes').classList.toggle('hidden', !lvOk);
      $('hgBuyYes').disabled = !can;
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }
    $('hgFly').textContent = `🛫 Voler avec ${planeOf(this.data.selected).name} !`;
  }
}
