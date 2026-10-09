/* ============================================================
   rideModels.js — Skate, trottinette, BMX, rollers, hoverboard (phase 40)

   Modeles procedurels (quelques dizaines de primitives chacun) et
   « poses » : pour chaque monture, ou vont les pieds, les mains et le
   bassin de l'avatar. Le repere de la monture : +z vers l'avant, +x a
   gauche, y vers le haut, l'origine au sol sous le centre.

   Chaque modele rend { root, parts, update(s), pose(s) } :
     update(s) fait tourner roues, guidon, planche ;
     pose(s)   rend la pose de l'avatar { hip, yaw, lean, footL, footR,
               handL, handR, ... } dans le repere de la monture.
   ============================================================ */

import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

const matCache = new Map();
function mat(color, { rough = 0.55, metal = 0.1, emissive = 0, ei = 1, flat = false } = {}) {
  const key = `${color}|${rough}|${metal}|${emissive}|${ei}|${flat}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: emissive ? ei : 0, flatShading: flat }));
  }
  return matCache.get(key);
}
const mesh = (geo, m, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.castShadow = true;
  return o;
};
const box = (w, h, d, m, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);
/* roue : axe selon x */
function wheel(r, w, m, x, y, z) {
  const g = new THREE.CylinderGeometry(r, r, w, 14); g.rotateZ(Math.PI / 2);
  return mesh(g, m, x, y, z);
}
/* tube entre deux points */
function tube(a, b, r, m) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), m);
  o.position.copy(A).add(B).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  o.castShadow = true;
  return o;
}
const DARK = 0x1f2937, STEEL = 0xcbd5e1, GRIP = 0x111827;

/* ---------------------------------------------------------- */
/* Skate                                                       */
/* ---------------------------------------------------------- */
function buildSkate(color) {
  const root = new THREE.Group(), board = new THREE.Group();
  root.add(board);
  const deck = mat(color, { rough: 0.5 }), grip = mat(GRIP, { rough: 0.95 }), wm = mat(0xfef3c7, { rough: 0.4 }), tr = mat(STEEL, { metal: 0.7, rough: 0.35 });
  board.position.y = 0.1;
  board.add(box(0.23, 0.03, 0.56, deck, 0, 0, 0));
  for (const s of [-1, 1]) {
    const kick = box(0.23, 0.03, 0.2, deck, 0, 0.035, s * 0.36); kick.rotation.x = -s * 0.32; board.add(kick);
  }
  board.add(box(0.21, 0.006, 0.56, grip, 0, 0.018, 0));
  const wheels = [];
  for (const sz of [-0.27, 0.27]) {
    board.add(box(0.1, 0.03, 0.06, tr, 0, -0.04, sz));
    for (const sx of [-0.1, 0.1]) {
      const w = wheel(0.032, 0.034, wm, sx, -0.068, sz); board.add(w); wheels.push({ m: w, r: 0.032 });
    }
  }
  return { root, parts: { board, wheels }, rear: -0.27 };
}

/* ---------------------------------------------------------- */
/* Trottinette                                                 */
/* ---------------------------------------------------------- */
function buildScooter(color) {
  const root = new THREE.Group();
  const deckM = mat(color, { rough: 0.45 }), blk = mat(DARK, { rough: 0.6 }), steel = mat(STEEL, { metal: 0.75, rough: 0.3 }), wm = mat(0xf8fafc, { rough: 0.5 });
  /* plateau + roue arriere : tourne autour du pied de la potence pour le tailwhip */
  const deckPivot = new THREE.Group(); deckPivot.position.set(0, 0.1, 0.42); root.add(deckPivot);
  deckPivot.add(box(0.17, 0.035, 0.66, deckM, 0, 0.0, -0.45));
  deckPivot.add(box(0.15, 0.008, 0.62, mat(GRIP, { rough: 0.95 }), 0, 0.02, -0.45));
  const rear = wheel(0.068, 0.028, wm, 0, -0.03, -0.84); deckPivot.add(rear);
  deckPivot.add(box(0.06, 0.012, 0.16, blk, 0, 0.03, -0.8));
  const wheels = [{ m: rear, r: 0.068 }];
  /* direction : fourche + roue avant + potence + guidon */
  const steer = new THREE.Group(); steer.position.set(0, 0.1, 0.42); root.add(steer);
  const front = wheel(0.1, 0.03, wm, 0, 0, 0.0); front.position.set(0, 0.0, 0.0); steer.add(front); wheels.push({ m: front, r: 0.1 });
  steer.add(box(0.1, 0.02, 0.08, blk, 0, 0.1, 0));
  steer.add(tube([0, 0.0, 0], [0, 0.92, -0.06], 0.021, steel));
  const bar = new THREE.Group(); bar.position.set(0, 0.92, -0.06); steer.add(bar);
  bar.add(tube([-0.27, 0, 0], [0.27, 0, 0], 0.018, steel));
  for (const s of [-1, 1]) bar.add(tube([s * 0.27, 0, 0], [s * 0.34, 0, 0], 0.024, blk));
  return { root, parts: { deckPivot, steer, bar, wheels }, rear: -0.84 };
}

/* ---------------------------------------------------------- */
/* BMX                                                         */
/* ---------------------------------------------------------- */
function buildBmx(color) {
  const root = new THREE.Group();
  const frameM = mat(color, { rough: 0.35, metal: 0.45 }), blk = mat(DARK, { rough: 0.6 }), steel = mat(STEEL, { metal: 0.8, rough: 0.3 }), tireM = mat(0x111827, { rough: 0.9 });
  const wheels = [];
  const tyre = (z) => {
    const g = new THREE.TorusGeometry(0.255, 0.034, 8, 22); g.rotateY(Math.PI / 2);
    const w = new THREE.Group(); w.position.set(0, 0.29, z);
    w.add(mesh(g, tireM));
    const hub = wheel(0.04, 0.05, steel, 0, 0, 0); w.add(hub);
    for (let i = 0; i < 3; i++) { const sp = tube([0, -0.23, 0], [0, 0.23, 0], 0.004, steel); sp.rotation.x = i * Math.PI / 3; w.add(sp); }
    wheels.push({ m: w, r: 0.29 });
    return w;
  };
  /* cadre : tourne autour du tube de direction pour le tailwhip */
  const head = [0, 0.74, 0.4];
  const frame = new THREE.Group(); frame.position.set(...head); root.add(frame);
  const P = (x, y, z) => [x - head[0], y - head[1], z - head[2]];
  const BB = P(0, 0.31, -0.06), SEAT = P(0, 0.8, -0.3), RAX = P(0, 0.29, -0.55), HT = [0, 0, 0];
  frame.add(tube(BB, SEAT, 0.022, frameM), tube(SEAT, HT, 0.02, frameM), tube(HT, BB, 0.026, frameM), tube(BB, RAX, 0.016, frameM), tube(SEAT, RAX, 0.016, frameM));
  const rw = tyre(-0.55); rw.position.set(0, 0.29, -0.55 - head[2]); rw.position.y -= head[1]; frame.add(rw);
  frame.add(box(0.12, 0.05, 0.2, blk, 0, SEAT[1] + 0.04, SEAT[2] - 0.02));
  /* pedalier */
  const crank = new THREE.Group(); crank.position.set(...BB); frame.add(crank);
  crank.add(box(0.03, 0.02, 0.02, steel, 0, 0, 0));
  const pedals = [];
  for (const s of [-1, 1]) {
    const arm = tube([s * 0.09, 0, 0], [s * 0.09, 0.17 * s, 0], 0.012, steel); crank.add(arm);
    const pd = box(0.1, 0.02, 0.1, blk, s * 0.14, 0.17 * s, 0); crank.add(pd); pedals.push(pd);
  }
  /* direction : fourche + roue avant + guidon (reste en place pendant le tailwhip) */
  const steer = new THREE.Group(); steer.position.set(...head); root.add(steer);
  const fw = tyre(0.55); fw.position.set(0, 0.29 - head[1], 0.55 - head[2]); steer.add(fw);
  steer.add(tube([0, 0, 0], [0, -0.45, 0.14], 0.018, steel));
  const bar = new THREE.Group(); bar.position.set(0, 0.25, 0.03); steer.add(bar);
  bar.add(tube([0, -0.25, -0.02], [0, 0, 0], 0.02, steel));
  bar.add(tube([-0.31, 0.02, 0], [0.31, 0.02, 0], 0.017, steel));
  for (const s of [-1, 1]) { bar.add(tube([s * 0.31, 0.02, 0], [s * 0.31, -0.1, 0.04], 0.014, steel)); bar.add(tube([s * 0.31, 0.02, 0], [s * 0.38, 0.02, 0], 0.024, blk)); }
  return { root, parts: { frame, steer, bar, crank, pedals, wheels, head }, rear: -0.55 };
}

/* ---------------------------------------------------------- */
/* Rollers                                                     */
/* ---------------------------------------------------------- */
function buildRollers(color) {
  const root = new THREE.Group();
  const bootM = mat(0xf8fafc, { rough: 0.5 }), accent = mat(color, { rough: 0.4 }), frameM = mat(DARK), wm = mat(0xfde047, { rough: 0.4 });
  const skates = [], wheels = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group();
    g.add(box(0.1, 0.13, 0.27, bootM, 0, 0.145, 0));
    g.add(box(0.105, 0.05, 0.12, accent, 0, 0.2, 0.06));
    g.add(box(0.045, 0.05, 0.3, frameM, 0, 0.07, 0));
    for (const z of [-0.12, -0.04, 0.04, 0.12]) { const w = wheel(0.04, 0.026, wm, 0, 0.04, z); g.add(w); wheels.push({ m: w, r: 0.04 }); }
    root.add(g); skates.push(g);
  }
  return { root, parts: { skates, wheels }, rear: -0.1 };
}

/* ---------------------------------------------------------- */
/* Hoverboard                                                  */
/* ---------------------------------------------------------- */
function buildHover(color, hover) {
  const root = new THREE.Group(), board = new THREE.Group();
  root.add(board);
  const deck = mat(0x1e293b, { rough: 0.3, metal: 0.5 }), glow = mat(color, { rough: 0.3, emissive: color, ei: 1.4 }), grip = mat(0x0f172a, { rough: 0.9 });
  board.position.y = hover + 0.06;
  const body = box(0.38, 0.06, 0.98, deck, 0, 0, 0); board.add(body);
  for (const s of [-1, 1]) { const nose = box(0.38, 0.06, 0.12, deck, 0, 0.012, s * 0.54); nose.rotation.x = -s * 0.25; board.add(nose); }
  board.add(box(0.34, 0.008, 0.9, grip, 0, 0.035, 0));
  board.add(box(0.4, 0.016, 0.02, glow, 0, 0, 0.5), box(0.4, 0.016, 0.02, glow, 0, 0, -0.5));
  for (const s of [-1, 1]) board.add(box(0.012, 0.018, 0.9, glow, s * 0.195, 0, 0));
  const fans = [];
  for (const z of [-0.3, 0.3]) {
    const d = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 14), glow, 0, -0.05, z); board.add(d); fans.push(d);
  }
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.62, 22), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.03; root.add(halo);
  return { root, parts: { board, fans, halo, wheels: [] }, rear: -0.3 };
}

/* ---------------------------------------------------------- */
/* Poses de l'avatar                                           */
/* ---------------------------------------------------------- */

/* Les poses rendent des positions dans le repere de la monture (rig), sauf `avHands` : repere de l'avatar. */
function baseSkate(s, hover = 0) {
  const stand = s.H0 * 0.9;
  const hipY = 0.12 + hover + stand - s.crouch * 0.3 - (s.air ? 0.1 : 0) - (s.manual ? 0.04 : 0);
  return {
    hip: [0, hipY, -0.01], yaw: -1.22, lean: 0.12 + clamp(s.speed / 40, 0, 0.18) + s.crouch * 0.1,
    footL: [0.0, 0.13 + hover, 0.2], footR: [0.0, 0.13 + hover, -0.2],
    handL: { av: true, p: [0.5, 1.02 + s.crouch * -0.15 + s.sway * 0.1, 0.22] },
    handR: { av: true, p: [-0.5, 1.1 + s.sway * -0.1, -0.02] },
    knee: 0.25
  };
}

function poseFor(id, s) {
  const stand = s.H0 * 0.9;
  switch (id) {
    case 'skate': return baseSkate(s, 0);
    case 'hover': {
      const p = baseSkate(s, 0.34 + 0.02 * Math.sin(s.t * 3));
      p.yaw = -0.95; p.hip[1] += 0.0;
      p.footL = [0.06, 0.46 + 0.02 * Math.sin(s.t * 3), 0.24]; p.footR = [-0.06, 0.46 + 0.02 * Math.sin(s.t * 3), -0.22];
      return p;
    }
    case 'scooter': {
      const hipY = 0.12 + stand - s.crouch * 0.28 - (s.air ? 0.06 : 0);
      /* pied de poussee : alterne entre le sol (derriere) et le plateau */
      const ph = s.push % 1;
      const pushing = s.pushing;
      let fr = [-0.05, 0.14, -0.28];
      if (pushing) {
        if (ph < 0.55) fr = [-0.06, 0.02, lerp(-0.1, -0.78, ph / 0.55)];
        else fr = [-0.06, 0.02 + Math.sin((ph - 0.55) / 0.45 * Math.PI) * 0.22, lerp(-0.78, -0.1, (ph - 0.55) / 0.45)];
      }
      return {
        hip: [0, hipY, -0.04], yaw: 0, lean: 0.2 + s.crouch * 0.12 + (pushing ? 0.1 : 0),
        footL: [0.04, 0.14, 0.12], footR: fr,
        handL: { p: [0.27, 0.99, 0.36 + 0.0] }, handR: { p: [-0.27, 0.99, 0.36] },
        bars: true, knee: 0.15
      };
    }
    case 'bmx': {
      const ph = s.pedal;
      const hipY = 0.31 + stand * 0.97 - s.crouch * 0.28 - (s.air ? 0.08 : 0);
      const R = 0.17;
      const pedL = [0.14, 0.31 + Math.sin(ph) * R, -0.06 + Math.cos(ph) * R];
      const pedR = [-0.14, 0.31 - Math.sin(ph) * R, -0.06 - Math.cos(ph) * R];
      return {
        hip: [0, hipY, -0.2], yaw: 0, lean: 0.34 + s.crouch * 0.12,
        footL: [pedL[0], pedL[1] + 0.05, pedL[2]], footR: [pedR[0], pedR[1] + 0.05, pedR[2]],
        handL: { p: [0.33, 1.0, 0.44], bar: true }, handR: { p: [-0.33, 1.0, 0.44], bar: true },
        bars: true, knee: 0.35
      };
    }
    case 'rollers': {
      const ph = s.stride;
      const sl = Math.sin(ph), sr = -sl;
      const lift = (v) => Math.max(0, Math.cos(ph * (v > 0 ? 1 : 1) + (v > 0 ? 0 : Math.PI))) * 0.07 * s.glide;
      const hipY = 0.04 + stand - 0.1 - s.crouch * 0.26 - (s.air ? 0.05 : 0);
      const k = s.glide;
      return {
        hip: [0, hipY, 0], yaw: s.air ? -0.2 : 0, lean: 0.26 + s.crouch * 0.1,
        footL: [0.1, 0.1 + lift(1), 0.28 * sl * k + 0.02], footR: [-0.1, 0.1 + lift(-1), 0.28 * sr * k - 0.02],
        handL: { av: true, p: [0.4, 1.0, 0.1 + sr * 0.3 * k] }, handR: { av: true, p: [-0.4, 1.0, 0.1 + sl * 0.3 * k] },
        skates: true, knee: 0.3
      };
    }
    default: return baseSkate(s, 0);
  }
}

/* Modifie la pose de base selon la figure en cours (w = 0..1, intensite). */
function applyFigure(id, p, s) {
  const w = s.poseW;
  if (!s.poseName || w <= 0.001) return p;
  switch (s.poseName) {
    case 'nohand':
      p.handL = { av: true, p: [0.7, 1.75, 0.15], w }; p.handR = { av: true, p: [-0.7, 1.75, 0.15], w };
      break;
    case 'spread':
      p.footL = lerp3(p.footL, [p.footL[0] + 0.5, p.footL[1] + 0.22, p.footL[2]], w);
      p.footR = lerp3(p.footR, [p.footR[0] - 0.5, p.footR[1] + 0.22, p.footR[2]], w);
      p.handL = { av: true, p: [0.95, 1.5, 0.1], w }; p.handR = { av: true, p: [-0.95, 1.5, 0.1], w };
      break;
    case 'tuck':
      p.footL = lerp3(p.footL, [p.footL[0], p.footL[1] + 0.5, p.footL[2] + 0.1], w);
      p.footR = lerp3(p.footR, [p.footR[0], p.footR[1] + 0.5, p.footR[2] - 0.1], w);
      p.hip = [p.hip[0], p.hip[1] + 0.05 * w, p.hip[2]];
      p.handL = { av: true, p: [0.3, 0.7, 0.45], w }; p.handR = { av: true, p: [-0.3, 0.7, 0.45], w };
      break;
    case 'torque':
      p.yaw += 0.9 * w; p.footL = lerp3(p.footL, [p.footL[0] + 0.15, p.footL[1] + 0.25, p.footL[2]], w);
      p.handL = { av: true, p: [0.8, 1.3, 0.5], w }; p.handR = { av: true, p: [-0.5, 1.6, 0.2], w };
      break;
    case 'super':
      p.lean = lerp(p.lean, 1.25, w);
      p.hip = [p.hip[0], lerp(p.hip[1], p.hip[1] - 0.05, w), lerp(p.hip[2], p.hip[2] - 0.3, w)];
      p.footL = lerp3(p.footL, [0.1, p.footL[1] + 0.55, -0.95], w); p.footR = lerp3(p.footR, [-0.1, p.footR[1] + 0.55, -0.95], w);
      if (!p.bars) { p.handL = { av: true, p: [0.8, 1.2, 0.6], w }; p.handR = { av: true, p: [-0.8, 1.2, 0.6], w }; }
      break;
    case 'grab':
      /* la main arriere attrape le bord de la planche / le pied */
      p.hip = [p.hip[0], p.hip[1] - 0.1 * w, p.hip[2]];
      p.lean += 0.25 * w;
      p.handR = { rigGrab: true, p: [-0.12, p.footR[1] - 0.04, p.footR[2] + 0.02], w };
      break;
    default: break;
  }
  return p;
}
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/* ---------------------------------------------------------- */
export const RIDE_COLORS = { skate: 0x38bdf8, scooter: 0xfb923c, bmx: 0xf43f5e, rollers: 0xa78bfa, hover: 0x22d3ee };
export const RIDE_HOVER = 0.34;

export function buildRide(id) {
  const color = RIDE_COLORS[id] || 0x38bdf8;
  const m = id === 'scooter' ? buildScooter(color) : id === 'bmx' ? buildBmx(color) : id === 'rollers' ? buildRollers(color)
    : id === 'hover' ? buildHover(color, RIDE_HOVER) : buildSkate(color);
  const P = m.parts;

  return {
    id, root: m.root, parts: P, rear: m.rear,
    /* s : { dist (m parcourus ce pas), steer (-1..1), anim (figure de planche), t, speed, boost } */
    update(s) {
      for (const w of P.wheels) { w.m.rotation.x += s.dist / w.r; }
      /* direction (velo, trottinette) : le guidon tourne un peu */
      const st = -s.steer * 0.35;
      if (P.steer) P.steer.rotation.y = st;
      /* figures */
      let boardRoll = 0, boardYaw = 0, barYaw = 0, whip = 0, tilt = 0;
      const a = s.anim;
      if (a) {
        const an = a.def.anim, p = a.p;
        if (an.roll) boardRoll = an.roll * p;
        if (an.yaw) { boardYaw = an.yaw * p; whip = an.yaw * p; }
        if (an.bar) barYaw = an.bar * p;
        if (an.tilt) tilt = an.tilt * Math.sin(Math.PI * a.p);
      }
      if (P.board) { P.board.rotation.set(0, boardYaw, boardRoll); }
      if (P.deckPivot) P.deckPivot.rotation.y = whip;
      if (P.frame) P.frame.rotation.y = whip;
      if (P.bar) P.bar.rotation.y = barYaw + (P.steer ? 0 : st);
      if (P.crank) P.crank.rotation.x = s.pedal;
      if (P.pedals) for (let i = 0; i < 2; i++) P.pedals[i].rotation.x = -s.pedal;
      if (P.halo) { P.halo.material.opacity = 0.3 + clamp(s.speed / 30, 0, 0.3) + (s.boost ? 0.2 : 0); P.halo.scale.setScalar(1 + (s.boost ? 0.3 : 0) + 0.05 * Math.sin(s.t * 6)); }
      if (P.fans) for (const f of P.fans) f.rotation.y += 0.5;
      if (P.skates) {
        P.skates[0].position.set(...s.footL); P.skates[1].position.set(...s.footR);
        P.skates[0].position.y -= 0.12; P.skates[1].position.y -= 0.12;
      }
      return { tilt };
    },
    pose(s) {
      return applyFigure(id, poseFor(id, s), s);
    }
  };
}
