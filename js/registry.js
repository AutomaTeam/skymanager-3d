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

  /* opts.update = false pour un module sans mise a jour continue ; opts.order (defaut 0) fixe l'ordre
     de mise a jour (les plus petits d'abord, a egalite l'ordre d'ajout) ; opts.hooks = false : le module
     ne fournit ni bodies/goal/tips au registre (il les expose lui-meme). Rend l'instance. */
  add(id, mod, { update = true, order = 0, hooks = true } = {}) {
    if (this.g[id] && this.g[id] !== mod) throw new Error('module déjà enregistré : ' + id);
    this.g[id] = mod;
    this.list.push({ id, mod, order, hooks, update: update && typeof mod.update === 'function' });
    this.list.sort((a, b) => a.order - b.order);      // tri stable : l'ordre d'ajout departage
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
    for (const e of this.list) if (e.hooks && typeof e.mod.bodies === 'function') out.push(...(e.mod.bodies(opts) || []));
    return out;
  }

  /* Un objectif `soft` (cache-cache, saison) ne passe qu'a defaut d'un objectif normal. */
  goal() {
    let soft = null;
    for (const e of this.list) {
      if (!e.hooks || typeof e.mod.goal !== 'function') continue;
      const g = e.mod.goal();
      if (g && !g.soft) return g;
      if (g && !soft) soft = g;
    }
    return soft;
  }

  tips() {
    const out = [];
    for (const e of this.list) if (e.hooks && typeof e.mod.tips === 'function') out.push(...(e.mod.tips() || []));
    return out;
  }
}
