/* ============================================================
   skylife.js — Ciel vivant et sol mouille (plan graphisme, etape 6)

   - volees d'oiseaux qui tournent autour de l'aeroport (le jour, par beau temps) ;
   - avions de ligne lointains avec traînees blanches ;
   - montgolfieres colorees qui derivent avec le vent ;
   - nuit : lumieres de la ville et du village, fenetres du quartier ;
   - orage : eclairs (flash de lumiere + trait de foudre lointain) ;
   - sol mouille : un voile brillant sur l'aire et les pistes quand il pleut,
     et des eclaboussures pres de la camera.

   Tout est leger : un InstancedMesh par famille, aucune texture externe.
   `buildSkyLife()` renvoie { group, update(dt, env, camPos) }.
   ============================================================ */

import * as THREE from 'three';
import { PALETTE } from './palette.js?v=1791556461';
import { sfx } from './sfx.js?v=1791556461';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function buildSkyLife() {
  const group = new THREE.Group();
  group.name = 'skylife';
  const r = rng(424242);
  const rr = (a, b) => a + r() * (b - a);
  const CX = 300, CZ = 1100;            // centre de l'aeroport

  /* ---------------- Oiseaux : 3 volees de 14 ---------------- */
  const FLOCKS = 3, PER = 14, NB = FLOCKS * PER;
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0.5, -1.1, 0.05, -0.1, 0, 0, -0.3,     // aile gauche
    0, 0, 0.5, 0, 0, -0.3, 1.1, 0.05, -0.1       // aile droite
  ]), 3));
  wing.computeVertexNormals();
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x2b3444, side: THREE.DoubleSide, fog: false });
  const birds = new THREE.InstancedMesh(wing, birdMat, NB);
  birds.frustumCulled = false;
  group.add(birds);
  const flocks = Array.from({ length: FLOCKS }, (_, i) => ({
    cx: CX + rr(-160, 160), cz: CZ + rr(-260, 260), rad: rr(90, 220), alt: rr(70, 160),
    w: rr(0.05, 0.09) * (i % 2 ? 1 : -1), ph: rr(0, 6.28)
  }));
  const offs = Array.from({ length: NB }, () => ({ x: rr(-14, 14), y: rr(-5, 5), z: rr(-14, 14), f: rr(0, 6.28) }));

  /* ---------------- Avions lointains + traînees ---------------- */
  const PLANES = 3;
  const bodyGeo = new THREE.CylinderGeometry(1.4, 1.1, 22, 6).rotateZ(Math.PI / 2);
  const wingGeo = new THREE.BoxGeometry(4, 0.2, 24);
  const planeMat = new THREE.MeshBasicMaterial({ color: 0xf4f6fa, fog: false });
  const planes = [];
  const trailMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, fog: false, depthWrite: false });
  const TRAIL = 40;
  for (let i = 0; i < PLANES; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(bodyGeo, planeMat), new THREE.Mesh(wingGeo, planeMat));
    const tp = new Float32Array(TRAIL * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
    const trail = new THREE.Line(tg, trailMat);
    trail.frustumCulled = false;
    group.add(g, trail);
    const dir = i % 2 ? 1 : -1;
    planes.push({
      g, trail, tp, dir, alt: rr(2400, 3600), z: rr(-4000, 6000), x: rr(-6000, 6000), spd: rr(120, 170), hist: [], acc: 0
    });
    g.scale.setScalar(3);
    g.rotation.y = dir > 0 ? 0 : Math.PI;
  }

  /* ---------------- Montgolfieres ---------------- */
  const BALLOONS = 4;
  const envGeo = new THREE.SphereGeometry(1, 20, 14);
  envGeo.scale(1, 1.25, 1);
  const cols = [PALETTE.coral, PALETTE.sun, PALETTE.violet, PALETTE.teal];
  const balloons = [];
  for (let i = 0; i < BALLOONS; i++) {
    const g = new THREE.Group();
    const env = new THREE.Mesh(envGeo, new THREE.MeshBasicMaterial({ color: cols[i % cols.length], fog: true }));
    env.scale.setScalar(16);
    env.position.y = 28;
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(15.6, 1.6, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: PALETTE.cream }));
    stripe.position.y = 28;
    const basket = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), new THREE.MeshBasicMaterial({ color: 0x8b5a2b }));
    basket.position.y = 2;
    g.add(env, stripe, basket);
    g.position.set(CX + rr(-900, 900), rr(120, 320), CZ + rr(-1200, 1200));
    balloons.push({ g, ph: rr(0, 6.28) });
    group.add(g);
  }

  /* ---------------- Sol mouille ---------------- */
  const wetMat = new THREE.MeshStandardMaterial({
    color: 0x1c2733, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  });
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(700, 3100).rotateX(-Math.PI / 2), wetMat);
  wet.position.set(CX - 120, 0.06, 1000);
  wet.visible = false;
  wet.renderOrder = 1;
  group.add(wet);

  /* Eclaboussures : 60 petits anneaux qui s'ouvrent autour de la camera. */
  const SPL = 60;
  const splGeo = new THREE.RingGeometry(0.5, 0.62, 12).rotateX(-Math.PI / 2);
  const splMat = new THREE.MeshBasicMaterial({ color: 0xcfe3f7, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
  const splashes = new THREE.InstancedMesh(splGeo, splMat, SPL);
  splashes.frustumCulled = false;
  splashes.visible = false;
  group.add(splashes);
  const spl = Array.from({ length: SPL }, () => ({ x: rr(-25, 25), z: rr(-25, 25), t: rr(0, 1) }));

  /* ---------------- Nuit : lumieres de la ville, du village, du quartier ---------------- */
  const nightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const lampTints = [0xffd98a, 0xffe9b8, 0xfff2d0, 0xffc870, 0xbfe0ff].map(h => new THREE.Color(h));
  const lightPts = [];
  const disc = (cx, cz, rad, n) => {
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * rad;
      lightPts.push([cx + Math.cos(a) * d, rr(3, 28), cz + Math.sin(a) * d, rr(7, 13)]);
    }
  };
  disc(-3300, 300, 1000, 520);       // ville
  disc(4300, -900, 480, 180);        // village
  /* Fenetres du quartier au sud du parking (12 maisons) : face nord. */
  const winPts = [];
  for (let i = 0; i < 12; i++) {
    const hx = 232 + i * 25;
    for (const [dx, y] of [[-3.2, 2.3], [3.2, 2.3], [-3.2, 5.2], [3.2, 5.2]]) if (r() < 0.7) winPts.push([hx + dx, y, 1509.9]);
  }
  const cityGeo = new THREE.BoxGeometry(1, 0.8, 1);
  const city = new THREE.InstancedMesh(cityGeo, nightMat, lightPts.length + winPts.length);
  city.frustumCulled = false;
  {
    const m = new THREE.Matrix4(), c = new THREE.Color();
    lightPts.forEach(([x, y, z, sz], i) => {
      m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sz, sz * 0.8, sz));
      city.setMatrixAt(i, m);
      city.setColorAt(i, c.copy(lampTints[Math.floor(r() * lampTints.length)]));
    });
    winPts.forEach(([x, y, z], i) => {
      m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(1.2, 1.4, 0.1));
      city.setMatrixAt(lightPts.length + i, m);
      city.setColorAt(lightPts.length + i, c.copy(lampTints[i % 4]));
    });
    city.instanceMatrix.needsUpdate = true;
    city.instanceColor.needsUpdate = true;
  }
  city.visible = false;
  group.add(city);

  /* ---------------- Orage : flash + foudre lointaine ---------------- */
  const flashLight = new THREE.AmbientLight(0xcfe0ff, 0);
  group.add(flashLight);
  const boltPos = new Float32Array(14 * 3);
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3));
  const bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xeef4ff, fog: false, transparent: true, opacity: 1 }));
  bolt.frustumCulled = false;
  bolt.visible = false;
  group.add(bolt);
  let strikeIn = rr(5, 12), strikeT = -1;
  const strike = (cam) => {
    const a = rr(0, 6.283), d = rr(900, 2200);
    let x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d;
    for (let i = 0; i < 14; i++) {
      boltPos[i * 3] = x; boltPos[i * 3 + 1] = 1100 * (1 - i / 13); boltPos[i * 3 + 2] = z;
      x += rr(-45, 45); z += rr(-45, 45);
    }
    boltGeo.attributes.position.needsUpdate = true;
    strikeT = 0;
    /* Le son arrive apres la lumiere : ~343 m/s, plafonne a 4 s. */
    sfx.thunder(Math.min(4, d / 343), Math.max(0.35, 1 - d / 3200));
  };

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
  let time = 0;

  function update(dt, env, cam) {
    time += dt;
    const p = env.params;
    const fair = p.rain < 0.05 && p.cloud < 0.95;

    /* Oiseaux : visibles le jour et hors intemperies. */
    birds.visible = fair && env.daylight > 0.35;
    if (birds.visible) {
      let n = 0;
      for (let f = 0; f < FLOCKS; f++) {
        const fl = flocks[f];
        const a = fl.ph + time * fl.w;
        const bx = fl.cx + Math.cos(a) * fl.rad, bz = fl.cz + Math.sin(a) * fl.rad;
        const heading = -a + (fl.w > 0 ? -Math.PI / 2 : Math.PI / 2);
        for (let i = 0; i < PER; i++, n++) {
          const o = offs[n];
          pos.set(bx + o.x, fl.alt + o.y + Math.sin(time * 0.7 + o.f) * 2, bz + o.z);
          const flap = Math.sin(time * 9 + o.f);
          e.set(0, heading, flap * 0.35);
          q.setFromEuler(e);
          sc.set(1.6, 1.6 + flap * 0.4, 1.6);
          m4.compose(pos, q, sc);
          birds.setMatrixAt(n, m4);
        }
      }
      birds.instanceMatrix.needsUpdate = true;
    }

    /* Avions lointains : traversent le ciel en boucle, traînee de 40 points. */
    const planesVisible = p.cloud < 0.9;
    for (const pl of planes) {
      pl.g.visible = pl.trail.visible = planesVisible;
      if (!planesVisible) continue;
      pl.x += pl.dir * pl.spd * dt;
      if (Math.abs(pl.x) > 7000) { pl.x = -pl.dir * 7000; pl.hist.length = 0; }
      pl.g.position.set(pl.x, pl.alt, pl.z);
      pl.acc += dt;
      if (pl.acc > 0.5) {
        pl.acc = 0;
        pl.hist.unshift([pl.x, pl.alt, pl.z]);
        if (pl.hist.length > TRAIL) pl.hist.pop();
      }
      for (let i = 0; i < TRAIL; i++) {
        const h = pl.hist[Math.min(i, pl.hist.length - 1)] || [pl.x, pl.alt, pl.z];
        pl.tp[i * 3] = i === 0 ? pl.x : h[0]; pl.tp[i * 3 + 1] = i === 0 ? pl.alt : h[1]; pl.tp[i * 3 + 2] = i === 0 ? pl.z : h[2];
      }
      pl.trail.geometry.attributes.position.needsUpdate = true;
    }

    /* Montgolfieres : derive lente avec le vent, balancement. */
    const w = env.windVector ? env.windVector() : { x: 0, z: 0 };
    for (const b of balloons) {
      b.g.position.x += w.x * 0.15 * dt;
      b.g.position.z += w.z * 0.15 * dt;
      if (Math.abs(b.g.position.x - CX) > 1500) b.g.position.x = CX - Math.sign(b.g.position.x - CX) * 1400;
      if (Math.abs(b.g.position.z - CZ) > 1800) b.g.position.z = CZ - Math.sign(b.g.position.z - CZ) * 1700;
      b.g.position.y += Math.sin(time * 0.3 + b.ph) * 0.4 * dt;
      b.g.rotation.z = Math.sin(time * 0.5 + b.ph) * 0.03;
      b.g.visible = fair && p.cloud < 0.85 && env.daylight > 0.25;
    }

    /* Nuit : la ville s'allume progressivement (un peu avant la nuit noire). */
    const nl = clamp((0.55 - env.daylight) * 3, 0, 1);
    nightMat.opacity = nl;
    city.visible = nl > 0.02;

    /* Orage : eclair toutes les 6 a 18 s, double impulsion de 0,4 s. */
    const storm = p.rain > 0.45 && p.cloud > 0.8;
    if (storm && cam) {
      strikeIn -= dt;
      if (strikeIn <= 0 && strikeT < 0) { strike(cam); strikeIn = rr(6, 18); }
    }
    if (strikeT >= 0) {
      strikeT += dt;
      const t = strikeT;
      const pulse = t < 0.08 ? 1 : t < 0.16 ? 0.15 : t < 0.26 ? 0.8 : t < 0.4 ? 0.2 * (1 - (t - 0.26) / 0.14) : 0;
      flashLight.intensity = pulse * 2.4;
      bolt.visible = t < 0.3;
      bolt.material.opacity = pulse;
      if (t > 0.45) { strikeT = -1; flashLight.intensity = 0; bolt.visible = false; }
    }

    /* Sol mouille : le voile monte avec la pluie et redescend lentement. */
    const target = clamp(p.rain * 1.4, 0, 1) * 0.45;
    wetMat.opacity += (target - wetMat.opacity) * clamp(dt * 0.4, 0, 1);
    wet.visible = wetMat.opacity > 0.01;

    /* Eclaboussures autour de la camera. */
    splashes.visible = p.rain > 0.05 && cam && cam.y < 60;
    if (splashes.visible) {
      const gy = 0.1;
      for (let i = 0; i < SPL; i++) {
        const s = spl[i];
        s.t += dt * (1.6 + p.rain);
        if (s.t >= 1) { s.t = 0; s.x = rr(-25, 25); s.z = rr(-25, 25); }
        pos.set(cam.x + s.x, gy, cam.z + s.z);
        q.identity();
        const k = 0.15 + s.t * 0.9;
        sc.set(k, 1, k);
        m4.compose(pos, q, sc);
        splashes.setMatrixAt(i, m4);
      }
      splashes.instanceMatrix.needsUpdate = true;
      splMat.opacity = 0.5 * clamp(p.rain * 1.5, 0, 1);
    }
  }

  return { group, update, strike, flashLight, bolt };
}
