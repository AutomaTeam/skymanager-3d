/* ============================================================
   particles.js — UN SEUL systeme de particules (K03)

   Un tampon circulaire de points (un seul appel de dessin) qui sert :
     - aux traînees et fumees de l'avion, fumee des pneus, eclaboussures,
       sillage (fun.js, openWorld.js) : lentes, elles grossissent ;
     - aux etincelles, poussiere et etoiles des engins (rides.js) :
       balistiques, elles retombent et rebondissent sur le sol.
   Les confettis restent a l'ecran (DOM, arcadeFun.js) : ce sont des
   elements d'interface, pas des objets 3D.
   ============================================================ */

import * as THREE from 'three';

export class Particles {
  constructor(parent, count = 1100) {
    this.n = count;
    this.head = 0;
    this.hue = 0;                       // teinte courante (arc-en-ciel de la traînee)
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.age = new Float32Array(count).fill(99);
    this.life = new Float32Array(count).fill(1);
    this.base = new Float32Array(count).fill(1);
    this.grow = new Float32Array(count);
    this.grav = new Float32Array(count);
    this.floor = new Float32Array(count).fill(-1e9);
    this.opacity = new Float32Array(count).fill(0.85);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      /* fadeNear (m) : en dessous de x la particule est invisible, au-dela de y elle est entiere (0,0 = jamais).
         maxPx : taille maxi a l'ecran. Sert a la fumee des ailes qui, en passant contre la camera,
         couvrait la moitie de l'ecran. */
      uniforms: { scale: { value: 600 }, fadeNear: { value: new THREE.Vector2(0, 0) }, maxPx: { value: 4096 } },
      vertexShader: `
        attribute float size; attribute float alpha; varying vec3 vCol; varying float vA;
        uniform float scale; uniform vec2 fadeNear; uniform float maxPx;
        void main() {
          vCol = color; vA = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          if (fadeNear.y > 0.0) vA *= smoothstep(fadeNear.x, fadeNear.y, -mv.z);
          gl_PointSize = min(maxPx, size * scale / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vCol; varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d) * 4.0;
          if (r > 1.0) discard;
          float soft = 1.0 - r;
          gl_FragColor = vec4(vCol, vA * soft);
        }`,
      vertexColors: true
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    parent.add(this.points);
    this.tmp = new THREE.Color();
  }

  setViewport(h, fovDeg) {
    this.points.material.uniforms.scale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  /* Emet une particule.
     o : { size, life, vx, vy, vz, gravity (m/s²), grow (taille finale = taille × (1 + grow)),
           floor (hauteur du sol : rebond), opacity } */
  spawn(x, y, z, color, o = {}) {
    const i = this.head;
    this.head = (this.head + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = o.vx || 0; this.vel[i * 3 + 1] = o.vy || 0; this.vel[i * 3 + 2] = o.vz || 0;
    this.tmp.set(color);
    this.col[i * 3] = this.tmp.r; this.col[i * 3 + 1] = this.tmp.g; this.col[i * 3 + 2] = this.tmp.b;
    this.age[i] = 0;
    this.life[i] = o.life || 1;
    this.base[i] = o.size || 1;
    this.grow[i] = o.grow || 0;
    this.grav[i] = o.gravity || 0;
    this.floor[i] = o.floor === undefined ? -1e9 : o.floor;
    this.opacity[i] = o.opacity === undefined ? 0.85 : o.opacity;
    return i;
  }

  /* Gerbe : n particules parties du meme point dans toutes les directions horizontales. */
  burst(x, y, z, n, color, speed = 3, up = 2, life = 0.7, o = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.283, s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, z, color, {
        vx: Math.cos(a) * s, vy: up * (0.3 + Math.random()), vz: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.6), gravity: 9, floor: 0.02, size: 0.3, opacity: 0.95, ...o
      });
    }
  }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      const a = this.age[i];
      if (a >= this.life[i]) { this.alpha[i] = 0; continue; }
      const t = a + dt;
      this.age[i] = t;
      if (t >= this.life[i]) { this.alpha[i] = 0; continue; }
      const u = t / this.life[i];
      const k = i * 3;
      if (this.grav[i]) this.vel[k + 1] -= this.grav[i] * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < this.floor[i]) { this.pos[k + 1] = this.floor[i]; this.vel[k + 1] *= -0.3; }
      this.alpha[i] = (1 - u) * this.opacity[i];
      this.size[i] = this.base[i] * (1 + u * this.grow[i]);
    }
    const A = this.geo.attributes;
    A.alpha.needsUpdate = true; A.size.needsUpdate = true; A.position.needsUpdate = true; A.color.needsUpdate = true;
  }

  clear() { this.age.fill(99); this.alpha.fill(0); this.geo.attributes.alpha.needsUpdate = true; }
}
