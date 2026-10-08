/* ============================================================
   skyWorld.js — Elements 3D des missions aeriennes (vague 3)

   Anneaux de course, ballons, feux, cibles de colis, projectiles
   (eau, colis a parachute), fantome de course. Materiaux
   MeshBasic uniquement : aucun cout d'eclairage, lisible de loin.
   Chaque fabrique rend un objet { group, update(t), dispose() }.
   ============================================================ */

import * as THREE from 'three';

const basic = (color, o = {}) => new THREE.MeshBasicMaterial({
  color, transparent: o.opacity !== undefined && o.opacity < 1, opacity: o.opacity ?? 1,
  side: o.side ?? THREE.FrontSide, depthWrite: o.depthWrite ?? true, fog: o.fog ?? true,
  blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending
});

const geoCache = {};
const geo = (key, make) => (geoCache[key] || (geoCache[key] = make()));

export class SkyWorld {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'skyMissionWorld';
    scene.add(this.root);
    this.items = new Set();
    this.fx = [];
  }

  add(obj) {
    this.root.add(obj.group);
    this.items.add(obj);
    return obj;
  }

  remove(obj) {
    if (!obj) return;
    this.root.remove(obj.group);
    this.items.delete(obj);
  }

  clear() {
    for (const o of [...this.items]) this.remove(o);
    for (const f of this.fx) this.root.remove(f.group);
    this.fx.length = 0;
  }

  update(t, dt) {
    for (const o of this.items) if (o.update) o.update(t, dt);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      if (f.life <= 0) { this.root.remove(f.group); this.fx.splice(i, 1); continue; }
      f.tick(f, dt);
    }
  }

  /* ---------------- Anneau (course, secours) ---------------- */
  hoop({ x, y, z, yaw = 0, radius = 38, color = 0xffd23f } = {}) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(geo('hoopRing', () => new THREE.TorusGeometry(1, 0.06, 10, 40)), basic(color));
    ring.scale.setScalar(radius);
    const halo = new THREE.Mesh(geo('hoopHalo', () => new THREE.TorusGeometry(1, 0.16, 8, 40)), basic(color, { opacity: 0.28, depthWrite: false, additive: true }));
    halo.scale.setScalar(radius);
    const disc = new THREE.Mesh(geo('hoopDisc', () => new THREE.CircleGeometry(1, 32)), basic(color, { opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, additive: true }));
    disc.scale.setScalar(radius * 0.97);
    group.add(ring, halo, disc);
    group.position.set(x, y, z);
    group.rotation.y = yaw;
    const o = {
      group, x, y, z, radius, state: 'next', color,
      setState(s) {
        this.state = s;
        const col = s === 'next' ? 0xffd23f : s === 'later' ? 0xcfe8ff : (document.body.classList.contains('cb') ? 0x38bdf8 : 0x4ade80);
        ring.material.color.setHex(col); halo.material.color.setHex(col); disc.material.color.setHex(col);
        group.visible = s !== 'hidden';
        const k = s === 'next' ? 1 : s === 'later' ? 0.75 : 0.9;
        ring.scale.setScalar(radius * k); halo.scale.setScalar(radius * k); disc.scale.setScalar(radius * k * 0.97);
        halo.material.opacity = s === 'next' ? 0.4 : 0.18;
        disc.material.opacity = s === 'next' ? 0.16 : 0.05;
      },
      update(t) {
        if (this.state === 'next') { const k = 1 + Math.sin(t * 6) * 0.05; halo.scale.setScalar(radius * k); }
      }
    };
    o.setState('later');
    return this.add(o);
  }

  /* ---------------- Ballon ---------------- */
  balloon({ x, y, z, color = 0xff4d6d, size = 7.5 } = {}) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(geo('balloonBody', () => new THREE.SphereGeometry(1, 16, 12)), basic(color));
    body.scale.set(size, size * 1.18, size);
    const hi = new THREE.Mesh(geo('balloonHi', () => new THREE.SphereGeometry(1, 8, 6)), basic(0xffffff, { opacity: 0.55 }));
    hi.scale.set(size * 0.22, size * 0.3, size * 0.22);
    hi.position.set(-size * 0.35, size * 0.5, size * 0.55);
    const knot = new THREE.Mesh(geo('balloonKnot', () => new THREE.ConeGeometry(1, 1.6, 6)), basic(color));
    knot.scale.setScalar(size * 0.22);
    knot.position.y = -size * 1.22;
    knot.rotation.x = Math.PI;
    const str = new THREE.Mesh(geo('balloonStr', () => new THREE.CylinderGeometry(0.05, 0.05, 1, 4)), basic(0xdddddd));
    str.scale.y = size * 2.2;
    str.position.y = -size * 2.3;
    group.add(body, hi, knot, str);
    group.position.set(x, y, z);
    const ph = Math.random() * 6.28;
    const o = {
      group, x, y, z, size, alive: true,
      update(t) { group.position.y = y + Math.sin(t * 1.3 + ph) * 2.2; group.rotation.y = t * 0.3 + ph; }
    };
    return this.add(o);
  }

  /* Eclatement d'un ballon : fragments qui s'ecartent. */
  pop(x, y, z, color) {
    const group = new THREE.Group();
    const bits = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(geo('popBit', () => new THREE.PlaneGeometry(1, 1)), basic(color, { side: THREE.DoubleSide }));
      m.scale.setScalar(1.5 + Math.random() * 1.6);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize().multiplyScalar(14 + Math.random() * 14);
      bits.push({ m, v });
      group.add(m);
    }
    group.position.set(x, y, z);
    this.root.add(group);
    this.fx.push({
      group, life: 0.9, bits,
      tick(f, dt) {
        for (const b of f.bits) {
          b.m.position.addScaledVector(b.v, dt);
          b.v.y -= 22 * dt;
          b.m.rotation.x += dt * 6; b.m.rotation.z += dt * 5;
          b.m.material.opacity = Math.max(0, f.life);
          b.m.material.transparent = true;
        }
      }
    });
  }

  /* ---------------- Faisceau + disque au sol (cible, aire) ---------------- */
  beacon({ x, z, y = 0, radius = 28, color = 0x38bdf8, height = 420 } = {}) {
    const group = new THREE.Group();
    const col = new THREE.Mesh(geo('beaconCol', () => new THREE.CylinderGeometry(1, 1, 1, 20, 1, true)), basic(color, { opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, additive: true }));
    col.scale.set(radius * 0.55, height, radius * 0.55);
    col.position.y = height / 2;
    const disc = new THREE.Mesh(geo('beaconDisc', () => new THREE.CircleGeometry(1, 40)), basic(color, { opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.scale.setScalar(radius); disc.position.y = 0.4;
    const ring = new THREE.Mesh(geo('beaconRing', () => new THREE.RingGeometry(0.62, 0.7, 40)), basic(0xffffff, { opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(radius); ring.position.y = 0.55;
    const ring2 = new THREE.Mesh(geo('beaconRing2', () => new THREE.RingGeometry(0.28, 0.34, 40)), basic(0xffffff, { opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring2.rotation.x = -Math.PI / 2; ring2.scale.setScalar(radius); ring2.position.y = 0.55;
    group.add(col, disc, ring, ring2);
    group.position.set(x, y, z);
    const o = {
      group, x, y, z, radius,
      setColor(c) { col.material.color.setHex(c); disc.material.color.setHex(c); },
      update(t) { col.material.opacity = 0.18 + Math.sin(t * 3) * 0.06; }
    };
    return this.add(o);
  }

  /* ---------------- Feu de foret ---------------- */
  fire({ x, z, size = 1 } = {}) {
    const group = new THREE.Group();
    const flames = [];
    const cols = [0xff3b1a, 0xff8a1a, 0xffd23f];
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(geo('flame' + i, () => new THREE.ConeGeometry(1, 2.4, 7)), basic(cols[i], { opacity: 0.92 - i * 0.1 }));
      c.scale.setScalar((13 - i * 3.2) * 1.5);
      c.position.y = (13 - i * 3.2) * 1.8;
      group.add(c);
      flames.push(c);
    }
    for (let k = 0; k < 4; k++) {
      const c = new THREE.Mesh(geo('flameS', () => new THREE.ConeGeometry(1, 2.4, 6)), basic(k % 2 ? 0xff6a1a : 0xffa21a, { opacity: 0.85 }));
      const a = k * 1.57 + 0.6;
      c.scale.setScalar(7);
      c.position.set(Math.cos(a) * 13, 8, Math.sin(a) * 13);
      group.add(c);
      flames.push(c);
    }
    const scorch = new THREE.Mesh(geo('scorch', () => new THREE.CircleGeometry(1, 24)), basic(0x1a1410, { opacity: 0.75, depthWrite: false }));
    scorch.rotation.x = -Math.PI / 2; scorch.scale.setScalar(26); scorch.position.y = 0.3;
    const smoke = new THREE.Mesh(geo('smoke', () => new THREE.CylinderGeometry(0.4, 1, 1, 10, 1, true)), basic(0x3a3a3a, { opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    smoke.scale.set(16, 120, 16); smoke.position.y = 70;
    group.add(scorch, smoke);
    group.position.set(x, 0, z);
    group.scale.setScalar(size);
    const ph = Math.random() * 10;
    const o = {
      group, x, z, health: 1, out: false, size,
      update(t) {
        const h = Math.max(0.0001, this.health);
        flames.forEach((f, i) => { const s = (0.85 + Math.sin(t * (9 + i) + ph + i) * 0.18) * (0.15 + 0.85 * h); f.scale.y = (f.scale.x) * 1.0 * s * 1.4; f.visible = h > 0.02; });
        smoke.visible = h > 0.02;
        smoke.scale.set(16, 120 * (0.4 + 0.6 * h), 16);
        smoke.material.opacity = 0.2 + 0.3 * h;
      },
      hit(d) {
        this.health = Math.max(0, this.health - d);
        if (this.health <= 0 && !this.out) { this.out = true; scorch.material.color.setHex(0x2a2a2a); }
      }
    };
    return this.add(o);
  }

  /* Vapeur apres l'extinction. */
  steam(x, z) {
    const group = new THREE.Group();
    const m = new THREE.Mesh(geo('steam', () => new THREE.SphereGeometry(1, 10, 8)), basic(0xf2f6fb, { opacity: 0.7, depthWrite: false }));
    m.scale.setScalar(10);
    group.add(m);
    group.position.set(x, 8, z);
    this.root.add(group);
    this.fx.push({ group, life: 1.6, tick(f, dt) { group.position.y += 18 * dt; m.scale.multiplyScalar(1 + dt * 0.9); m.material.opacity = Math.max(0, f.life * 0.4); m.material.transparent = true; } });
  }

  /* ---------------- Projectiles ---------------- */
  blob({ x, y, z, vx, vy, vz }) {
    const group = new THREE.Group();
    const m = new THREE.Mesh(geo('blob', () => new THREE.SphereGeometry(1, 8, 6)), basic(0x66c8ff, { opacity: 0.9 }));
    m.scale.setScalar(2.2 + Math.random() * 1.4);
    group.add(m);
    group.position.set(x, y, z);
    return this.add({ group, vel: new THREE.Vector3(vx, vy, vz), kind: 'water', alive: true });
  }

  parcel({ x, y, z, vx, vy, vz }) {
    const group = new THREE.Group();
    const box = new THREE.Mesh(geo('parcelBox', () => new THREE.BoxGeometry(1, 1, 1)), basic(0xc98a4b));
    box.scale.set(3.2, 2.6, 3.2);
    const tape = new THREE.Mesh(geo('parcelTape', () => new THREE.BoxGeometry(1, 1, 1)), basic(0xffd23f));
    tape.scale.set(3.3, 2.7, 0.7);
    const chute = new THREE.Mesh(geo('chute', () => new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), basic(0xff4d6d, { side: THREE.DoubleSide }));
    chute.scale.set(7, 5, 7);
    chute.position.y = 9;
    const lines = new THREE.Mesh(geo('chuteLines', () => new THREE.ConeGeometry(1, 1, 6, 1, true)), basic(0xffffff, { opacity: 0.8, side: THREE.DoubleSide }));
    lines.scale.set(6, 8, 6); lines.position.y = 5; lines.rotation.x = Math.PI;
    group.add(box, tape, chute, lines);
    group.position.set(x, y, z);
    return this.add({ group, vel: new THREE.Vector3(vx, vy, vz), kind: 'parcel', alive: true });
  }

  /* ---------------- Arc-en-ciel a traverser (G04) ----------------
     Le centre de detection (x, y, z) est au milieu de l'arche ; `radius` = zone de passage. */
  rainbow({ x, y, z, yaw = 0, radius = 90 } = {}) {
    const group = new THREE.Group();
    const cols = [0xef4444, 0xf97316, 0xfacc15, 0x4ade80, 0x38bdf8, 0x6366f1, 0xa855f7];
    const R = radius * 1.35;
    cols.forEach((c, i) => {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(R - i * R * 0.07, R * 0.035, 6, 36, Math.PI), basic(c, { opacity: 0.85, depthWrite: false }));
      group.add(arc);
    });
    group.position.set(x, y - R * 0.5, z);
    group.rotation.y = yaw;
    const o = {
      group, x, y, z, radius, state: 'next',
      setState(s) { this.state = s; group.visible = s !== 'hidden'; group.children.forEach(a => { a.material.opacity = s === 'next' ? 0.9 : s === 'done' ? 0.25 : 0.55; }); },
      update(t) { if (this.state === 'next') group.scale.setScalar(1 + Math.sin(t * 4) * 0.015); }
    };
    return this.add(o);
  }

  /* ---------------- Banniere remorquee (G04) : texte lisible des deux cotes ---------------- */
  banner(text) {
    const group = new THREE.Group();
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 96;
    const c = cv.getContext('2d');
    c.fillStyle = '#fef3c7'; c.fillRect(0, 0, 512, 96);
    c.strokeStyle = '#dc2626'; c.lineWidth = 8; c.strokeRect(4, 4, 504, 88);
    c.fillStyle = '#7f1d1d'; c.font = '900 56px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, 256, 52, 480);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide, fog: false });
    const g = geo('bannerPlane', () => new THREE.PlaneGeometry(1, 1));
    const a = new THREE.Mesh(g, mat); a.scale.set(28, 5.4, 1);
    const b = new THREE.Mesh(g, mat); b.scale.set(28, 5.4, 1); b.rotation.y = Math.PI;
    const rope = new THREE.Mesh(geo('bannerRope', () => new THREE.CylinderGeometry(0.1, 0.1, 1, 4)), basic(0xffffff));
    rope.rotation.z = Math.PI / 2; rope.scale.y = 10; rope.position.x = 19;
    group.add(a, b, rope);
    return this.add({ group, tex, mat, dispose() { tex.dispose(); mat.dispose(); } });
  }

  /* ---------------- Randonneur a treuiller (G04) ---------------- */
  hiker({ x, z, y = 0 } = {}) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(geo('hikerBody', () => new THREE.CylinderGeometry(0.7, 0.9, 3.2, 8)), basic(0xef4444));
    body.position.y = 1.6;
    const head = new THREE.Mesh(geo('hikerHead', () => new THREE.SphereGeometry(0.75, 10, 8)), basic(0xf1c9a5));
    head.position.y = 4;
    const flag = new THREE.Mesh(geo('hikerFlag', () => new THREE.PlaneGeometry(1, 1)), basic(0xfacc15, { side: THREE.DoubleSide }));
    flag.scale.set(4, 2.4, 1); flag.position.set(2.2, 6, 0);
    const pole = new THREE.Mesh(geo('hikerPole', () => new THREE.CylinderGeometry(0.08, 0.08, 1, 4)), basic(0xffffff));
    pole.scale.y = 7; pole.position.set(0.2, 3.5, 0);
    group.add(body, head, pole, flag);
    group.position.set(x, y, z);
    return this.add({ group, x, y, z, update(t) { flag.rotation.y = Math.sin(t * 5) * 0.4; head.position.y = 4 + Math.abs(Math.sin(t * 3)) * 0.4; } });
  }

  /* ---------------- Fantome de course : silhouette d'avion translucide ---------------- */
  ghost() {
    const group = new THREE.Group();
    const m = basic(0x7dd3fc, { opacity: 0.45, depthWrite: false });
    const fus = new THREE.Mesh(geo('gFus', () => new THREE.CylinderGeometry(0.7, 0.35, 8, 8)), m);
    fus.rotation.x = Math.PI / 2;
    const wing = new THREE.Mesh(geo('gWing', () => new THREE.BoxGeometry(11, 0.2, 1.8)), m);
    const tail = new THREE.Mesh(geo('gTail', () => new THREE.BoxGeometry(4, 0.2, 1.2)), m);
    tail.position.z = 3.6;
    const fin = new THREE.Mesh(geo('gFin', () => new THREE.BoxGeometry(0.2, 2, 1.4)), m);
    fin.position.set(0, 1, 3.6);
    group.add(fus, wing, tail, fin);
    group.scale.setScalar(2.2);
    return this.add({ group });
  }
}
