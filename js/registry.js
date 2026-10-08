/* ============================================================
   registry.js — Registre des modules de jeu (B04)
   Ajouter un module = 1 fichier + 1 import + 1 ligne dans le constructeur du jeu :
       this.modules.add('monModule', new MonModule(this));
   Le registre s'occupe de :
     - update(dt)   : appele chaque image, dans la boucle gardee (une erreur est notee, jamais fatale) ;
     - bodies(opts) : (facultatif) corps qui bloquent le joueur : [{ x, z, r | h/hl/hw, ref }] ;
     - goal()       : (facultatif) objectif a afficher en priorite, { icon, text, target } ou null ;
     - tips()       : (facultatif) conseils pour l'aide : ['🌠 ...'].
   Un module n'implemente que ce dont il a besoin. L'instance reste accessible par game[id].
   ============================================================ */

export class ModuleRegistry {
  constructor(game) {
    this.g = game;
    this.list = [];
  }

  /* opts.update = false pour un module sans mise a jour continue. Rend l'instance. */
  add(id, mod, { update = true } = {}) {
    if (this.g[id] && this.g[id] !== mod) throw new Error('module deja enregistre : ' + id);
    this.g[id] = mod;
    this.list.push({ id, mod, update: update && typeof mod.update === 'function' });
    return mod;
  }

  get(id) { const e = this.list.find(x => x.id === id); return e ? e.mod : null; }

  /* `onError(nom, err)` : appele si un module leve une exception. */
  update(dt, onError) {
    for (const e of this.list) {
      if (!e.update) continue;
      try { e.mod.update(dt); } catch (err) { onError(e.mod.constructor.name + '.update', err); }
    }
  }

  bodies(opts) {
    const out = [];
    for (const e of this.list) if (typeof e.mod.bodies === 'function') out.push(...(e.mod.bodies(opts) || []));
    return out;
  }

  goal() {
    for (const e of this.list) if (typeof e.mod.goal === 'function') { const g = e.mod.goal(); if (g) return g; }
    return null;
  }

  tips() {
    const out = [];
    for (const e of this.list) if (typeof e.mod.tips === 'function') out.push(...(e.mod.tips() || []));
    return out;
  }
}
