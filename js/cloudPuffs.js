/* ============================================================
   cloudPuffs.js — Nuages en bouffees qu'on peut traverser (K01)

   Des sprites (toujours face a la camera) repartis entre 500 et 1800 m
   autour du joueur. Ils sont recycles de l'autre cote quand on s'eloigne,
   s'effacent quand on les traverse (brume blanche) et suivent la meteo
   (nombre, teinte grise sous la pluie). Desactives en qualite basse.
   ============================================================ */
import * as THREE from 'three';

const N = 64, BOX = 9000, ALT0 = 500, ALT1 = 1800, FADE_NEAR = 120, FADE_FAR = 420;

export class CloudPuffs {
  constructor(scene, texture) {
    this.group = new THREE.Group();
    this.group.name = 'cloudPuffs';
    this.items = [];
    this.enabled = true;
    this.cover = 0.4;
    let s = 7771;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < N; i++) {
      const mat = new THREE.SpriteMaterial({ map: texture, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: true });
      const sp = new THREE.Sprite(mat);
      const size = 450 + rnd() * 750;
      sp.scale.set(size, size * 0.6, 1);
      sp.frustumCulled = true;
      this.group.add(sp);
      this.items.push({ sp, mat, x: (rnd() - 0.5) * BOX, z: (rnd() - 0.5) * BOX, y: ALT0 + rnd() * (ALT1 - ALT0), base: 0.55 + rnd() * 0.35, rank: i / N });
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  /* cam : position de la camera ; cloud : couverture 0..1 ; tint : couleur (0xRRGGBB). */
  update(dt, cam, cloud, tint) {
    const on = this.enabled && cloud > 0.2 && cam.y > 80 && cam.y < 3200;
    this.group.visible = on;
    if (!on) return;
    const half = BOX / 2;
    const col = new THREE.Color(tint);
    let inside = 0;
    for (const it of this.items) {
      /* recyclage : la boite suit la camera */
      if (it.x - cam.x > half) it.x -= BOX; else if (it.x - cam.x < -half) it.x += BOX;
      if (it.z - cam.z > half) it.z -= BOX; else if (it.z - cam.z < -half) it.z += BOX;
      const shown = it.rank < cloud;                         // plus il y a de couverture, plus il y a de bouffees
      const d = Math.hypot(it.x - cam.x, it.y - cam.y, it.z - cam.z);
      const near = Math.min(1, Math.max(0, (d - FADE_NEAR) / (FADE_FAR - FADE_NEAR)));   // fondu quand on traverse
      it.mat.opacity = shown ? it.base * near * Math.min(1, cloud + 0.2) : 0;
      it.mat.color.copy(col);
      it.sp.position.set(it.x, it.y, it.z);
      if (shown && d < FADE_FAR) inside++;
    }
    this.inside = inside;                                    // > 0 : on frole ou traverse un nuage
  }
}
