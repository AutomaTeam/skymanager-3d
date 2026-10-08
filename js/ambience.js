/* ============================================================
   ambience.js — Petite vie calme de l'aeroport (mode Arcade)

   Peu d'elements, toujours au meme endroit, pour que l'aeroport
   paraisse habite sans devenir un bazar :

   - SPOTTEURS : trois passionnes d'avions (un papa, une fille, un
     papi) au bord du taxiway, face a la piste. Quand l'avion de ligne
     decolle ou atterrit devant eux, ils sautent de joie et prennent
     des photos. On peut leur dire bonjour (social.js).
   - PIGEONS : deux petites volees (pres de la tour, devant l'entree
     du terminal) qui picorent, et s'envolent quand le joueur, le chien
     ou un vehicule approche, puis se reposent un peu plus loin.
   ============================================================ */

import * as THREE from 'three';
import { sfx } from './sfx.js?v=1791469066';
import { emojiSprite } from './groundFun.js?v=1791469066';
import { TODAY } from './terminalFlow.js?v=1791469066';

/* Annonces du hall (une toutes les ~75 s quand on y est), precedees du carillon. */
const ANNOUNCES = [
  `Le vol ${TODAY.flight} a destination de ${TODAY.dest} embarque ${TODAY.gate.toLowerCase()}.`,
  'Merci de ne pas laisser vos bagages sans surveillance.',
  'Un doudou lapin a ete retrouve pres du cafe. Il attend son proprietaire !',
  `Derniere minute : les passagers du vol ${TODAY.flight} sont attendus ${TODAY.gate.toLowerCase()}.`,
  'Bienvenue dans notre aeroport ! Bon voyage a tous.',
  'Le cafe vous propose un chocolat chaud... avec de la chantilly !'
];

/* Spotteurs : position, couleur de tenue, casquette, echelle (la fille est plus petite). */
const SPOTTERS = [
  { x: 88, z: 1192, color: 0x2563eb, hat: 0xf8fafc, s: 1 },
  { x: 91.2, z: 1191, color: 0xec4899, hat: 0xfacc15, s: 0.72, kid: true },
  { x: 94, z: 1193.5, color: 0x65a30d, hat: 0x78350f, s: 0.98 }
];
const FLOCKS = [{ x: 245, z: 1152 }, { x: 352, z: 1284 }];
const SCARE = 4.5;               // m : distance qui fait s'envoler un pigeon

/* Parapluies : geometries et couleurs partagees (peu de materiaux). */
const UMB_COLORS = [0xef4444, 0x3b82f6, 0xfacc15, 0x22c55e, 0xa855f7, 0xec4899];
let _umbGeo = null;
function buildUmbrella(i) {
  if (!_umbGeo) {
    _umbGeo = {
      canopy: new THREE.ConeGeometry(0.72, 0.32, 10, 1, true),
      stick: new THREE.CylinderGeometry(0.014, 0.014, 1.0, 5),
      mats: UMB_COLORS.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, side: THREE.DoubleSide })),
      stickMat: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 })
    };
  }
  const u = new THREE.Group();
  const c = new THREE.Mesh(_umbGeo.canopy, _umbGeo.mats[i % UMB_COLORS.length]);
  c.position.y = 2.18;
  const st = new THREE.Mesh(_umbGeo.stick, _umbGeo.stickMat);
  st.position.y = 1.72;
  u.add(c, st);
  u.position.set(0.18, 0, 0.05);           // tenu d'une main, au-dessus de la tete
  u.visible = false;
  return u;
}

function buildPigeon() {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x8b93a1, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.9 });
  const neck = new THREE.MeshStandardMaterial({ color: 0x5b7a6e, roughness: 0.6, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), grey);
  body.scale.set(1, 0.85, 1.5); body.position.y = 0.16;
  const head = new THREE.Group();
  head.position.set(0, 0.28, -0.15);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), neck);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 5), new THREE.MeshStandardMaterial({ color: 0xd4a373 }));
  beak.rotation.x = -Math.PI / 2; beak.position.z = -0.08;
  head.add(hm, beak);
  const wings = [-1, 1].map(sd => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.2), dark);
    w.geometry.translate(sd * 0.13, 0, 0);
    w.position.set(sd * 0.06, 0.2, 0.02);
    g.add(w);
    return w;
  });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.14), dark);
  tail.position.set(0, 0.17, 0.22);
  g.add(body, head, tail);
  return { group: g, head, wings };
}

export class Ambience {
  constructor(game) {
    this.g = game;
    this.built = false;
    this.spotters = [];
    this.pigeons = [];
    this._cheerCd = 0;
    this._annT = 25;             // s avant la prochaine annonce du hall
    this._annI = 0;
    this._airState = '';
    this._umbT = 0;
    this._umbN = 0;
  }

  /* ---------------- Parapluies quand il pleut ---------------- */
  /* Toutes les personnes dehors (joueur, PNJ, employes, voyageurs, visiteurs, spotteurs). */
  _people() {
    const g = this.g, out = [];
    if (g.r3d.player) out.push(g.r3d.player);
    if (g.agents && g.agents.agents) for (const a of g.agents.agents) if (a.mesh && a.gate !== 'cabin' && a.gate !== 'terminal') out.push(a.mesh);
    if (g.staff && g.staff.actors) for (const a of g.staff.actors.values()) if (a.ent && a.role !== 'hostess') out.push(a.ent);
    const life = g.r3d.life;
    if (life && life.walkers) for (const w of life.walkers) out.push(w.ent);
    const gr = g.ground;
    if (gr && gr.ev && gr.ev.ent) out.push(gr.ev.ent);
    if (gr && gr.leaving) for (const w of gr.leaving) out.push(w.ent);
    for (const s of this.spotters) out.push(s.ent);
    return out;
  }

  _updateUmbrellas(dt) {
    this._umbT -= dt;
    if (this._umbT > 0) return;
    this._umbT = 0.5;
    const g = this.g;
    const rain = g.env.params && g.env.params.rain > 0.25;
    for (const e of this._people()) {
      if (!e || !e.group) continue;
      if (!e.umb) {
        if (!rain) continue;                       // on n'en fabrique qu'a la premiere pluie
        e.umb = buildUmbrella(this._umbN++);
        e.group.add(e.umb);
      }
      /* Pas de parapluie dans le terminal, ni quand l'avatar est masque (au volant, a roulettes). */
      const p = e.group.position;
      const shown = rain && (!e.avatar || e.avatar.visible) && !g.r3d.isInsideTerminal(p.x, p.z);
      e.umb.visible = shown;
    }
  }

  /* ---------------- Ambiance sonore ---------------- */
  _updateSounds(dt) {
    const g = this.g;
    /* Grondement lointain quand l'avion de ligne met les gaz (une fois par decollage). */
    const air = g.r3d.life && g.r3d.life.air;
    if (air && air.state !== this._airState) {
      if (air.state === 'TAKEOFF' && air.g.visible) {
        const p = g.player.pos, d = Math.hypot(air.x - p.x, air.z - p.z);
        sfx.jet(Math.max(0.15, 1 - d / 1600));
      }
      this._airState = air.state;
    }
    /* Annonces dans le hall. */
    if (g.inTerminal && !g._worldPaused) {
      this._annT -= dt;
      if (this._annT <= 0) {
        this._annT = 70 + Math.random() * 25;
        sfx.chime();
        const msg = ANNOUNCES[this._annI++ % ANNOUNCES.length];
        setTimeout(() => { if (g.inTerminal) g.toast(`📢 ${msg}`, 4200); }, 1100);
      }
    }
  }

  _build() {
    const g = this.g, root = g.r3d.airport;
    for (const d of SPOTTERS) {
      const ent = g.r3d.buildTechnician(d.color, d.hat, false);
      ent.group.scale.setScalar(d.s);
      ent.group.position.set(d.x, 0, d.z);
      ent.group.rotation.y = -Math.PI / 2;           // face a la piste (ouest)
      root.add(ent.group);
      this.spotters.push({ ent, x: d.x, z: d.z, kid: !!d.kid, spotter: true, cheer: 0, bubble: null, ph: Math.random() * 6 });
    }
    FLOCKS.forEach((f, fi) => {
      for (let i = 0; i < 5; i++) {
        const p = buildPigeon();
        const a = Math.random() * 6.28, r = 1 + Math.random() * 3;
        const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
        p.group.position.set(x, 0, z);
        root.add(p.group);
        this.pigeons.push({ ...p, flock: fi, x, z, y: 0, h: Math.random() * 6.28, state: 'ground', t: Math.random() * 3, peck: 0, from: null, to: null });
      }
    });
    this.built = true;
  }

  /* ---------------- Spotteurs ---------------- */
  _updateSpotters(dt) {
    const g = this.g, life = g.r3d.life;
    const air = life && life.air;
    /* L'avion de ligne passe devant eux a pleine vitesse (decollage, atterrissage). */
    const show = !!(air && air.g && air.g.visible && ['TAKEOFF', 'ROLLOUT', 'APPROACH', 'CLIMB'].includes(air.state)
      && Math.abs(air.z - 1192) < 260);
    this._cheerCd -= dt;
    if (show && this._cheerCd <= 0) {
      this._cheerCd = 12;
      this.spotters.forEach((s, i) => { s.cheer = 2.4 + i * 0.25; this._bubble(s, i === 1 ? '🤩' : '📸'); });
      const p = g.player.pos;
      if (g.state === 'HUB' && Math.hypot(p.x - 91, p.z - 1192) < 40) sfx.tada();
    }
    for (const s of this.spotters) {
      if (s.cheer > 0) s.cheer -= dt;
      s.ent.pose = s.cheer > 0 ? 'jump' : (Math.sin(g.time * 0.25 + s.ph) > 0.85 ? 'work' : null);   // de temps en temps, ils montrent le ciel
      g.r3d.updateAvatarAnim(s.ent, false, dt);
      if (s.bubble) {
        s.bubbleT -= dt;
        s.bubble.position.y = 2.6 + Math.sin(g.time * 5) * 0.1;
        if (s.bubbleT <= 0) { s.ent.group.remove(s.bubble); s.bubble = null; }
      }
    }
  }

  _bubble(s, emoji) {
    if (s.bubble) s.ent.group.remove(s.bubble);
    s.bubble = emojiSprite(emoji, 1.1 / (s.ent.group.scale.x || 1));
    s.bubble.position.set(0, 2.6, 0);
    s.ent.group.add(s.bubble);
    s.bubbleT = 2.6;
  }

  /* ---------------- Pigeons ---------------- */
  _scarers() {
    const g = this.g, out = [];
    if (g.state === 'HUB') out.push(g.player.pos);
    if (g.pet && g.pet.dog && g.pet.dog.group.visible) out.push({ x: g.pet.x, z: g.pet.z });
    return out;
  }

  _updatePigeons(dt) {
    const g = this.g, t = g.time;
    const sc = this._scarers();
    let flushed = -1;
    for (const p of this.pigeons) {
      if (p.state === 'ground') {
        /* Picore et sautille. */
        p.t -= dt;
        if (p.t <= 0) {
          p.t = 0.8 + Math.random() * 2.5;
          if (Math.random() < 0.4) { p.h += (Math.random() - 0.5) * 2; p.hop = 0.35; }
          else p.peck = 0.5;
        }
        if (p.hop > 0) { p.hop -= dt; p.x += Math.sin(p.h) * dt * 0.6; p.z += Math.cos(p.h) * dt * 0.6; }
        p.peck = Math.max(0, p.peck - dt);
        p.head.rotation.x = p.peck > 0 ? Math.abs(Math.sin(p.peck * 18)) * 0.9 : 0;
        p.wings.forEach(w => { w.rotation.z = 0; });
        p.y = 0;
        if (sc.some(s => Math.hypot(s.x - p.x, s.z - p.z) < SCARE)) {
          /* Envol : vers un nouvel endroit, pres du lieu de la volee. */
          const f = FLOCKS[p.flock];
          const a = Math.random() * 6.28, r = 4 + Math.random() * 8;
          p.state = 'fly'; p.t = 0; p.dur = 2.6 + Math.random() * 1.6;
          p.from = { x: p.x, z: p.z }; p.to = { x: f.x + Math.cos(a) * r, z: f.z + Math.sin(a) * r };
          p.h = Math.atan2(p.to.x - p.x, p.to.z - p.z);
          flushed = p.flock;
        }
      } else {
        p.t += dt;
        const k = Math.min(1, p.t / p.dur);
        p.x = p.from.x + (p.to.x - p.from.x) * k;
        p.z = p.from.z + (p.to.z - p.from.z) * k;
        p.y = Math.sin(k * Math.PI) * 4.5;
        const flap = Math.sin(t * 38) * 0.9;
        p.wings[0].rotation.z = flap; p.wings[1].rotation.z = -flap;
        if (k >= 1) { p.state = 'ground'; p.t = 1 + Math.random() * 2; }
      }
      p.group.position.set(p.x, p.y, p.z);
      p.group.rotation.y = p.h + Math.PI;
    }
    /* Un seul froissement d'ailes par volee qui s'envole. */
    if (flushed >= 0 && g.state === 'HUB') {
      this._flapCd = this._flapCd || {};
      if (!(this._flapCd[flushed] > t)) { this._flapCd[flushed] = t + 3; sfx.swoosh(0.5, 1200, 500); }
    }
  }

  /* Corps pour collectBodies (registre, js/registry.js) : on ne traverse pas les spotteurs, on peut les saluer. */
  bodies() {
    return this.g.state === 'HUB' ? this.spotters.map(s => ({ x: s.x, z: s.z, r: 0.35, ref: s })) : [];
  }

  update(dt) {
    const g = this.g;
    if (!g.arcade.on || g.state === 'BOOT') return;
    if (!this.built) this._build();
    /* Loin de tout (en vol), on ne les anime pas. */
    if (g.state !== 'HUB') return;
    this._updateSounds(dt);
    this._updateUmbrellas(dt);
    this._updateSpotters(dt);
    this._updatePigeons(dt);
  }
}
