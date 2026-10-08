/* ============================================================
   deco.js — « Ma place » : decorer l'aeroport (mode Arcade, vague 4)

   Le joueur construit une petite place pres du terminal : fontaine,
   arbres, manege, grande roue, glacier... Il deplace un curseur en
   marchant, choisit un objet dans le catalogue et le pose. Chaque
   objet est un obstacle pour les pietons, rapporte du « charme » et
   certains rapportent des pieces en continu.

   Les objets sont fabriques a la volee (formes simples, couleurs
   vives) : aucun fichier a charger.
   ============================================================ */

import * as THREE from 'three';
import * as Save from './save.js?v=1791469860';
import { sfx } from './sfx.js?v=1791469860';

const STORE = 'skymanager.deco';
const $ = (id) => document.getElementById(id);
const COIN = 1000;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/* Zone ou l'on peut construire (rectangle monde). */
export const PLAZA = { x0: 500, x1: 700, z0: 1190, z1: 1284 };

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.7, metalness: o.m ?? 0.05, emissive: o.e ?? 0x000000 });
const B = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const C = (r0, r1, h, m, s = 14) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, s), m);
const S = (r, m) => new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m);

/* ---------------- Catalogue ---------------- */
/* Revenu maximal de « Ma place » (pieces par minute), quel que soit le nombre d'attractions. */
const DECO_INCOME_MAX = 8;

export const ITEMS = [
  { id: 'tree',    ico: '🌳', name: 'Arbre',        cost: 6,   r: 1.4, charm: 1, income: 0, make: mkTree },
  { id: 'flowers', ico: '🌷', name: 'Fleurs',       cost: 4,   r: 1.3, charm: 1, income: 0, make: mkFlowers },
  { id: 'bench',   ico: '🪑', name: 'Banc',         cost: 5,   r: 1.2, charm: 1, income: 0, make: mkBench },
  { id: 'parasol', ico: '⛱️', name: 'Parasol',      cost: 8,   r: 1.5, charm: 1, income: 0, make: mkParasol },
  { id: 'fountain', ico: '⛲', name: 'Fontaine',    cost: 25,  r: 2.6, charm: 4, income: 1, make: mkFountain },
  { id: 'icecream', ico: '🍦', name: 'Glacier',     cost: 30,  r: 1.8, charm: 3, income: 2, make: mkIceCream },
  { id: 'kiosk',   ico: '🏪', name: 'Boutique',     cost: 40,  r: 2.2, charm: 4, income: 3, make: mkKiosk },
  { id: 'tent',    ico: '🎪', name: 'Chapiteau',    cost: 45,  r: 3.4, charm: 5, income: 2, make: mkTent },
  { id: 'slide',   ico: '🛝', name: 'Toboggan',     cost: 35,  r: 2.0, charm: 4, income: 1, make: mkSlide },
  { id: 'statue',  ico: '🗿', name: 'Statue d\'avion', cost: 50, r: 2.0, charm: 6, income: 1, make: mkStatue },
  { id: 'carousel', ico: '🎠', name: 'Manege',      cost: 80,  r: 3.6, charm: 8, income: 5, make: mkCarousel },
  { id: 'ferris',  ico: '🎡', name: 'Grande roue',  cost: 140, r: 5.5, charm: 14, income: 10, make: mkFerris }
];
export const itemOf = (id) => ITEMS.find(i => i.id === id);

function mkTree() {
  const g = new THREE.Group();
  const trunk = C(0.22, 0.3, 1.6, M(0x7a4a22)); trunk.position.y = 0.8;
  const col = pick([0x2fa84f, 0x3bb54a, 0x25984a]);
  const a = S(1.25, M(col)); a.position.y = 2.4; a.scale.y = 1.1;
  const b = S(0.9, M(col)); b.position.set(0.7, 3.0, 0.2);
  g.add(trunk, a, b);
  return { group: g };
}
function mkFlowers() {
  const g = new THREE.Group();
  const bed = C(1.2, 1.3, 0.25, M(0x6b4a2a), 16); bed.position.y = 0.12;
  const grass = C(1.1, 1.1, 0.06, M(0x3aa84f), 16); grass.position.y = 0.27;
  g.add(bed, grass);
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4, r = 0.2 + (i % 5) * 0.18;
    const f = S(0.13, M(pick([0xff4d6d, 0xffd23f, 0xf472b6, 0xffffff, 0xa78bfa, 0xfb923c]), { e: 0x221100 }));
    f.position.set(Math.cos(a) * r, 0.42, Math.sin(a) * r);
    const st = C(0.015, 0.015, 0.2, M(0x2f8f3f), 4); st.position.set(f.position.x, 0.32, f.position.z);
    g.add(f, st);
  }
  return { group: g };
}
function mkBench() {
  const g = new THREE.Group();
  const wood = M(0xb9763a), iron = M(0x333840, { m: 0.6 });
  const seat = B(1.7, 0.08, 0.5, wood); seat.position.y = 0.5;
  const back = B(1.7, 0.45, 0.07, wood); back.position.set(0, 0.8, -0.22); back.rotation.x = -0.15;
  g.add(seat, back);
  for (const x of [-0.75, 0.75]) { const l = B(0.08, 0.5, 0.5, iron); l.position.set(x, 0.25, 0); g.add(l); }
  return { group: g };
}
function mkParasol() {
  const g = new THREE.Group();
  const pole = C(0.03, 0.03, 2.3, M(0xdddddd, { m: 0.6 }), 6); pole.position.y = 1.15;
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.6, 16), M(pick([0xff4d6d, 0xffd23f, 0x38bdf8]))); top.position.y = 2.4;
  const base = C(0.4, 0.45, 0.1, M(0x555a63), 10); base.position.y = 0.05;
  const t = C(0.45, 0.45, 0.04, M(0xf4efe6), 14); t.position.set(0.2, 0.7, 0.1);
  g.add(pole, top, base);
  return { group: g };
}
function mkFountain() {
  const g = new THREE.Group();
  const stone = M(0xcfd3d8, { r: 0.9 });
  const basin = C(2.2, 2.4, 0.5, stone, 24); basin.position.y = 0.25;
  const water = C(2.0, 2.0, 0.05, M(0x4cc3ff, { r: 0.1, m: 0.4, e: 0x0a4a7a }), 24); water.position.y = 0.5;
  const col = C(0.25, 0.4, 1.4, stone, 12); col.position.y = 1.1;
  const bowl = C(0.9, 0.5, 0.25, stone, 16); bowl.position.y = 1.7;
  const jet = C(0.07, 0.12, 1.1, M(0xb8e6ff, { e: 0x2a6a9a }), 8); jet.position.y = 2.3;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 24), M(0xbfe9ff, { e: 0x3a7aaa }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.52;
  g.add(basin, water, col, bowl, jet, ring);
  return { group: g, update(t) { const k = (t * 0.6) % 1; ring.scale.setScalar(0.4 + k * 1.5); ring.material.opacity = 1 - k; ring.material.transparent = true; jet.scale.y = 0.85 + Math.sin(t * 7) * 0.15; } };
}
function stripedAwning(w, d, c1, c2) {
  const g = new THREE.Group();
  const n = 6;
  for (let i = 0; i < n; i++) {
    const s = B(w / n, 0.06, d, M(i % 2 ? c1 : c2)); s.position.set(-w / 2 + (i + 0.5) * w / n, 0, 0); s.rotation.x = 0.25; g.add(s);
  }
  return g;
}
function mkIceCream() {
  const g = new THREE.Group();
  const body = B(1.8, 1.1, 1.1, M(0xfff0f5)); body.position.y = 0.55;
  const counter = B(1.9, 0.08, 1.3, M(0xffa6c9)); counter.position.set(0, 1.12, 0.1);
  const aw = stripedAwning(2.2, 1.5, 0xff6fa5, 0xffffff); aw.position.set(0, 1.85, 0.2);
  const pole1 = C(0.04, 0.04, 1.9, M(0xdddddd), 6); pole1.position.set(-1.0, 0.95, 0.8);
  const pole2 = pole1.clone(); pole2.position.x = 1.0;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 10), M(0xd9a15b)); cone.position.set(0, 2.55, 0); cone.rotation.x = Math.PI;
  const scoop = S(0.34, M(0xff8fb8)); scoop.position.set(0, 3.0, 0);
  const scoop2 = S(0.28, M(0xfff1a8)); scoop2.position.set(0, 3.35, 0);
  g.add(body, counter, aw, pole1, pole2, cone, scoop, scoop2);
  return { group: g, update(t) { cone.parent.rotation.y = 0; scoop.position.y = 3.0 + Math.sin(t * 2) * 0.03; } };
}
function mkKiosk() {
  const g = new THREE.Group();
  const col = pick([0x38bdf8, 0x4ade80, 0xfb923c, 0xc084fc]);
  const body = B(2.4, 1.6, 1.6, M(col)); body.position.y = 0.8;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.9, 4), M(0xe11d48)); roof.position.y = 2.05; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.7);
  const win = B(1.5, 0.6, 0.05, M(0x1e3a5f, { m: 0.7, r: 0.1 })); win.position.set(0, 1.0, 0.83);
  const aw = stripedAwning(2.4, 0.9, 0xffffff, 0xff4d6d); aw.position.set(0, 1.55, 1.2);
  g.add(body, roof, win, aw);
  return { group: g };
}
function mkTent() {
  const g = new THREE.Group();
  const base = C(3.0, 3.0, 1.5, M(0xfff1f2), 20); base.position.y = 0.75;
  const stripes = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(3.02, 3.02, 1.5, 3, 1, true, i * 0.628, 0.314), M(i % 2 ? 0xe11d48 : 0xfacc15)); s.position.y = 0.75; stripes.add(s);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.3, 2.0, 20), M(0xe11d48)); roof.position.y = 2.5;
  const flag = B(0.05, 0.7, 0.5, M(0xfacc15)); flag.position.set(0, 4.0, 0);
  const pole = C(0.04, 0.04, 1.0, M(0xdddddd), 6); pole.position.y = 3.7;
  g.add(base, stripes, roof, pole, flag);
  return { group: g, update(t) { flag.rotation.y = Math.sin(t * 3) * 0.4; } };
}
function mkSlide() {
  const g = new THREE.Group();
  const tower = B(1.0, 2.0, 1.0, M(0xfacc15)); tower.position.set(0, 1.0, -1.0);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.6, 4), M(0xe11d48)); roof.position.set(0, 2.3, -1.0); roof.rotation.y = Math.PI / 4;
  const ramp = B(0.7, 0.08, 2.9, M(0x38bdf8)); ramp.position.set(0, 1.0, 0.7); ramp.rotation.x = 0.62;
  for (const x of [-0.4, 0.4]) { const r = B(0.06, 0.25, 2.9, M(0x0ea5e9)); r.position.set(x, 1.1, 0.7); r.rotation.x = 0.62; g.add(r); }
  const ladder = B(0.5, 2.0, 0.06, M(0x94a3b8)); ladder.position.set(0, 1.0, -1.55);
  g.add(tower, roof, ramp, ladder);
  return { group: g };
}
function mkStatue() {
  const g = new THREE.Group();
  const plinth = B(1.6, 0.8, 1.6, M(0xcfd3d8, { r: 0.9 })); plinth.position.y = 0.4;
  const step = B(2.0, 0.2, 2.0, M(0xb4b9c0, { r: 0.9 })); step.position.y = 0.1;
  const gold = M(0xe8b923, { m: 0.8, r: 0.3 });
  const fus = C(0.18, 0.1, 1.5, gold, 10); fus.rotation.z = Math.PI / 2; fus.position.y = 1.7;
  const wing = B(0.35, 0.04, 1.7, gold); wing.position.y = 1.68;
  const tail = B(0.2, 0.04, 0.6, gold); tail.position.set(-0.7, 1.72, 0);
  const fin = B(0.3, 0.4, 0.04, gold); fin.position.set(-0.7, 1.9, 0);
  const grp = new THREE.Group(); grp.add(fus, wing, tail, fin); grp.rotation.z = 0.25; grp.position.y = 0.1;
  g.add(step, plinth, grp);
  return { group: g, update(t) { grp.rotation.y = t * 0.5; } };
}
function mkCarousel() {
  const g = new THREE.Group();
  const base = C(3.5, 3.6, 0.3, M(0xf4efe6), 24); base.position.y = 0.15;
  const spin = new THREE.Group();
  const floor = C(3.3, 3.3, 0.12, M(0xe11d48), 24); floor.position.y = 0.4;
  const pole = C(0.25, 0.25, 3.2, M(0xfacc15), 10); pole.position.y = 1.9;
  spin.add(floor, pole);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const horse = new THREE.Group();
    const bodyH = B(0.4, 0.45, 0.9, M(pick([0xffffff, 0xf9a8d4, 0xfde047, 0x93c5fd])));
    const head = B(0.28, 0.45, 0.28, bodyH.material); head.position.set(0, 0.35, 0.5);
    const rod = C(0.03, 0.03, 2.2, M(0xe8b923, { m: 0.8 }), 6); rod.position.y = 0.9;
    horse.add(bodyH, head, rod);
    horse.position.set(Math.cos(a) * 2.3, 1.1, Math.sin(a) * 2.3); horse.rotation.y = -a;
    horse.userData.phase = i;
    spin.add(horse);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.7, 1.4, 24), M(0xe11d48)); roof.position.y = 3.9;
  const cap = S(0.22, M(0xfacc15)); cap.position.y = 4.7;
  spin.add(roof, cap);
  g.add(base, spin);
  return { group: g, update(t) { spin.rotation.y = t * 0.8; spin.children.forEach(c => { if (c.userData.phase !== undefined) c.position.y = 1.1 + Math.sin(t * 2.4 + c.userData.phase) * 0.18; }); } };
}
function mkFerris() {
  const g = new THREE.Group();
  const col = M(0xe2e8f0, { m: 0.4 });
  for (const s of [-1, 1]) { const leg = B(0.25, 6.4, 0.25, col); leg.position.set(s * 1.8, 3.1, 0); leg.rotation.z = -s * 0.3; g.add(leg); }
  const wheel = new THREE.Group(); wheel.position.y = 6.2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(5, 0.14, 8, 40), M(0xf43f5e));
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.08, 8, 30), M(0xfacc15));
  wheel.add(rim, rim2);
  const cabins = [];
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const spoke = B(0.06, 5, 0.06, M(0xcbd5e1)); spoke.rotation.z = a; spoke.position.set(Math.sin(a) * 0, 0, 0); spoke.position.x = -Math.sin(a) * 2.5; spoke.position.y = Math.cos(a) * 2.5;
    wheel.add(spoke);
    const cab = new THREE.Group();
    const box = B(0.9, 0.75, 0.9, M(pick([0xff4d6d, 0xffd23f, 0x4ade80, 0x38bdf8, 0xc084fc])));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.4, 4), M(0xffffff)); roof.position.y = 0.55; roof.rotation.y = Math.PI / 4;
    cab.add(box, roof); cab.position.set(Math.sin(a) * 5, Math.cos(a) * 5 - 0.5, 0);
    cab.userData.a = a;
    wheel.add(cab); cabins.push(cab);
  }
  g.add(wheel);
  return { group: g, update(t) { wheel.rotation.z = -t * 0.25; cabins.forEach(c => { c.rotation.z = t * 0.25; }); } };
}

/* ============================================================ */
export class Deco {
  constructor(game) {
    this.g = game;
    this.data = this._load();
    this.built = [];             // { rec, obj, id }
    this.active = false;
    this.cur = ITEMS[0];
    this.rot = 0;
    this.ghost = null;
    this.cursor = { x: 600, z: 1240, ok: false };
    this.mode = 'place';          // place | remove
    this._income = 0;
    this._id = 0;
    this._bind();
  }

  _load() {
    const def = { items: [], earned: 0 };
    const d = Save.load(STORE, def);
    if (!Array.isArray(d.items)) d.items = [];
    return d;
  }
  save() { Save.write(STORE, this.data); }

  get charm() { return this.data.items.reduce((s, r) => s + (itemOf(r.id) ? itemOf(r.id).charm : 0), 0); }
  /* Plafonne : sans limite, quelques grandes roues rapportaient plus que voler, sans rien faire. */
  get incomeRaw() { return this.data.items.reduce((s, r) => s + (itemOf(r.id) ? itemOf(r.id).income : 0), 0); }
  get incomePerMin() { return Math.min(DECO_INCOME_MAX, this.incomeRaw); }

  /* Reconstruit les objets enregistres (au demarrage de la partie). */
  restore() {
    if (this.built.length) return;
    for (const rec of this.data.items) this._materialize(rec);
  }

  _materialize(rec) {
    const it = itemOf(rec.id);
    if (!it) return;
    const obj = it.make();
    obj.group.position.set(rec.x, this.g.r3d.groundHeight(rec.x, rec.z), rec.z);
    obj.group.rotation.y = rec.r || 0;
    obj.group.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    this.g.r3d.airport.add(obj.group);
    const bid = `deco${++this._id}`;
    const r = it.r * 0.8;
    this.g.nav.blockers.push({ id: bid, label: it.name, rect: { x0: rec.x - r, x1: rec.x + r, z0: rec.z - r, z1: rec.z + r } });
    this.built.push({ rec, obj, id: bid, it });
  }

  /* ---------------- Interface ---------------- */
  _bind() {
    $('pauseDeco').addEventListener('click', () => { this.g.closePause(); this.open(); });
    $('decoClose').addEventListener('click', () => { sfx.click(); this.close(); });
    $('decoPlace').addEventListener('click', () => this.place());
    $('decoRot').addEventListener('click', () => { this.rot += Math.PI / 4; sfx.click(); });
    $('decoMode').addEventListener('click', () => {
      this.mode = this.mode === 'place' ? 'remove' : 'place';
      sfx.click(); this._render();
    });
  }

  open() {
    const g = this.g;
    if (g.state !== 'HUB') { g.toast('Construis ta place a l\'aeroport, a pied !', 2400, 'warn'); return; }
    this.active = true;
    this.mode = 'place';
    $('decoBar').classList.remove('hidden');
    document.body.classList.add('in-deco');
    /* On emmene le joueur au bord de la place s'il en est loin. */
    const p = g.player.pos;
    if (Math.hypot(p.x - 560, p.z - 1237) > 220) {
      const w = g.nav.nearestWalkable(540, 1242, 40, 1);
      g.player.pos.set(w.x, g.r3d.groundHeight(w.x, w.z), w.z);
      g.player.heading = Math.PI / 2;
    }
    this._buildGhost();
    this._render();
    g.toast('🏗️ Marche pour deplacer le curseur, puis pose ton objet !', 3200, 'ok');
  }

  close() {
    this.active = false;
    $('decoBar').classList.add('hidden');
    document.body.classList.remove('in-deco');
    if (this.ghost) { this.g.r3d.airport.remove(this.ghost.group); this.ghost = null; }
    if (this.mark) { this.g.r3d.airport.remove(this.mark); this.mark = null; }
  }

  _render() {
    const coins = this.g.arcade.coins;
    $('decoCoins').textContent = coins;
    $('decoInfo').textContent = `Charme ${this.charm} · +${this.incomePerMin} 🪙/min` + (this.incomeRaw >= DECO_INCOME_MAX ? ` (maximum)` : '');
    $('decoMode').textContent = this.mode === 'place' ? '🗑️ Enlever' : '🏗️ Construire';
    $('decoPlace').textContent = this.mode === 'place' ? `✔ Poser (${this.cur.cost} 🪙)` : '🗑️ Enlever';
    const list = $('decoList');
    list.classList.toggle('hidden', this.mode !== 'place');
    list.innerHTML = ITEMS.map(it => `<button class="deco-it${it.id === this.cur.id ? ' on' : ''}${coins < it.cost ? ' poor' : ''}" data-it="${it.id}"><span>${it.ico}</span><small>${it.name}</small><em>${it.cost}</em></button>`).join('');
    list.querySelectorAll('[data-it]').forEach(b => b.addEventListener('click', () => { this.cur = itemOf(b.dataset.it); sfx.click(); this._buildGhost(); this._render(); }));
  }

  _buildGhost() {
    const r3d = this.g.r3d;
    if (this.ghost) r3d.airport.remove(this.ghost.group);
    const o = this.cur.make();
    o.group.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.62; m.castShadow = false; } });
    r3d.airport.add(o.group);
    this.ghost = o;
  }

  /* Le curseur est devant le joueur. */
  update(dt) {
    const g = this.g;
    /* revenu passif : toutes les 60 s de jeu */
    if (this.data.items.length && g.arcade.on && !g._worldPaused) {      // menus ouverts : pas de revenu
      this._income += dt;
      if (this._income >= 60) {
        this._income = 0;
        const n = this.incomePerMin;
        if (n > 0) { g.arcade.giveCoins(n, { silent: true }); this.data.earned += n; this.save(); if (g.state === 'HUB') g.arcade.popup(`🎡 Ma place : +${n} 🪙`); }
      }
    }
    for (const b of this.built) if (b.obj.update) b.obj.update(g.time);
    if (!this.active || g.state !== 'HUB') return;
    const p = g.player.pos, h = g.player.heading;
    const cx = Math.round(p.x + Math.sin(h) * 7), cz = Math.round(p.z + Math.cos(h) * 7);
    this.cursor.x = cx; this.cursor.z = cz;
    const ok = this._valid(cx, cz, this.cur.r);
    this.cursor.ok = ok;
    if (this.mode === 'place' && this.ghost) {
      this.ghost.group.visible = true;
      this.ghost.group.position.set(cx, g.r3d.groundHeight(cx, cz), cz);
      this.ghost.group.rotation.y = this.rot;
      if (this.ghost.update) this.ghost.update(g.time);
      this.ghost.group.traverse(m => { if (m.isMesh && m.material.emissive) { m.material.emissive.setHex(ok ? 0x003a10 : 0x5a0a0a); } });
    } else if (this.ghost) this.ghost.group.visible = false;
    this._updateMark(cx, cz, ok);
    $('decoPlace').disabled = this.mode === 'place' ? (!ok || g.arcade.coins < this.cur.cost) : !this._nearest(cx, cz);
  }

  _updateMark(cx, cz, ok) {
    const r3d = this.g.r3d;
    if (!this.mark) {
      this.mark = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
      this.mark.rotation.x = -Math.PI / 2;
      r3d.airport.add(this.mark);
    }
    this.mark.position.set(cx, 0.15, cz);
    const rad = this.mode === 'place' ? this.cur.r : 2.5;
    this.mark.scale.setScalar(rad);
    const near = this.mode === 'remove' ? this._nearest(cx, cz) : null;
    this.mark.material.color.setHex(this.mode === 'remove' ? (near ? 0xfb923c : 0x94a3b8) : (ok ? 0x4ade80 : 0xf87171));
  }

  _valid(x, z, r) {
    const g = this.g;
    if (x - r < PLAZA.x0 || x + r > PLAZA.x1 || z - r < PLAZA.z0 || z + r > PLAZA.z1) return false;
    if (!g.nav.isWalkable(x, z)) return false;
    for (const b of this.built) if (Math.hypot(b.rec.x - x, b.rec.z - z) < b.it.r + r + 0.4) return false;
    /* pas sur le joueur */
    if (Math.hypot(g.player.pos.x - x, g.player.pos.z - z) < r + 0.5) return false;
    return true;
  }

  _nearest(x, z) {
    let best = null, bd = 4.5;
    for (const b of this.built) { const d = Math.hypot(b.rec.x - x, b.rec.z - z); if (d < bd + b.it.r * 0.3) { bd = d; best = b; } }
    return best;
  }

  place() {
    const g = this.g;
    if (this.mode === 'remove') {
      const b = this._nearest(this.cursor.x, this.cursor.z);
      if (!b) return;
      g.r3d.airport.remove(b.obj.group);
      const i = g.nav.blockers.findIndex(k => k.id === b.id);
      if (i >= 0) g.nav.blockers.splice(i, 1);
      this.built.splice(this.built.indexOf(b), 1);
      this.data.items.splice(this.data.items.indexOf(b.rec), 1);
      g.arcade.giveCoins(Math.floor(b.it.cost / 2), { silent: true });
      this.save(); sfx.pop(); this._render();
      return;
    }
    if (!this.cursor.ok) return;
    const it = this.cur;
    if (g.arcade.coins < it.cost) { g.toast('Pas assez de pieces !', 1800, 'warn'); sfx.oops(); return; }
    g.tycoon.cash -= it.cost * COIN; g.tycoon.save();
    const rec = { id: it.id, x: this.cursor.x, z: this.cursor.z, r: this.rot };
    this.data.items.push(rec);
    this._materialize(rec);
    this.save();
    sfx.tada(); g.arcade.confetti(24);
    g.arcade.event('build');
    g.arcade.popup(`${it.ico} ${it.name} pose !`);
    this._render();
  }
}
