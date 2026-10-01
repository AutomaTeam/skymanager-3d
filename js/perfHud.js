/* ============================================================
   perfHud.js — Compteur de performance (etape 0 du plan graphisme)

   Actif seulement avec `?debug` dans l'adresse (index.html?debug).
   Affiche FPS, appels de dessin, triangles, objets, textures et
   geometries en memoire, mis a jour 2 fois par seconde. Sert a
   mesurer « avant / apres » chaque etape du plan.
   `window.__perf()` renvoie les memes valeurs (pour les scripts de test).
   ============================================================ */

const ON = /[?&]debug(=|&|$)/.test(window.location.search);

let el = null;
let frames = 0;
let t0 = performance.now();
let last = { fps: 0, calls: 0, tris: 0, meshes: 0, tex: 0, geos: 0 };

function countMeshes(scene) {
  let n = 0, casters = 0, lights = 0;
  scene.traverse((o) => {
    if (o.isMesh) { n++; if (o.castShadow) casters++; }
    else if (o.isLight) lights++;
  });
  return { meshes: n, casters, lights };
}

export const perfHud = {
  get enabled() { return ON; },

  /* A appeler une fois par image apres le rendu. */
  tick(renderer, scene) {
    if (!ON) return;
    frames++;
    const now = performance.now();
    if (now - t0 < 500) return;
    const info = renderer.info;
    const c = countMeshes(scene);
    last = {
      fps: Math.round(frames * 1000 / (now - t0)),
      calls: info.render.calls, tris: info.render.triangles,
      meshes: c.meshes, casters: c.casters, lights: c.lights,
      tex: info.memory.textures, geos: info.memory.geometries,
      programs: info.programs ? info.programs.length : 0
    };
    frames = 0; t0 = now;
    if (!el) {
      el = document.createElement('pre');
      el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:9999;margin:0;padding:6px 8px;' +
        'font:11px/1.35 ui-monospace,Consolas,monospace;color:#bbf7d0;background:rgba(2,6,23,.78);' +
        'border:1px solid #166534;border-radius:6px;pointer-events:none;white-space:pre';
      document.body.appendChild(el);
      window.__perf = () => ({ ...last });
    }
    el.textContent =
      `FPS ${last.fps}\n` +
      `calls ${last.calls}  tris ${(last.tris / 1000).toFixed(0)}k\n` +
      `objets ${last.meshes}  ombres ${last.casters}  lumieres ${last.lights}\n` +
      `textures ${last.tex}  geos ${last.geos}  shaders ${last.programs}`;
  }
};
