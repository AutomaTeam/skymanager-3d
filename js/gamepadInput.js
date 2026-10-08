/* ============================================================
   gamepadInput.js — Manette de jeu (Gamepad API) (E05)
   Xbox / PlayStation / MFi. Aucune configuration : des qu'une manette
   est branchee et qu'on appuie sur un bouton, elle pilote.
     - stick gauche : manche en vol, deplacement a pied ;
     - stick droit (horizontal) : palonnier ;
     - gachettes : RT gaz +, LT gaz - ;  X : frein ;
     - A : bouton d'action (le gros bouton contextuel) ;
     - B : retour (ferme le panneau ouvert) ;  Start : pause.
   Le module ne fait que remplir `controls.pad` et `hubCtl.gp` /
   `cabCtl.gp` ; la lecture reste dans touchControls.js / mechanicControls.js.
   ============================================================ */

const DEAD = 0.15;
const dz = (v) => { const a = Math.abs(v || 0); return a < DEAD ? 0 : Math.sign(v) * (a - DEAD) / (1 - DEAD); };

export class GamepadInput {
  constructor(game) {
    this.g = game;
    this.prev = {};
    this.connected = false;
    window.addEventListener('gamepadconnected', () => { this.connected = true; });
    window.addEventListener('gamepaddisconnected', () => { this._clear(); });
  }

  _pad() {
    let list = [];
    try { list = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { return null; }
    for (const p of list) if (p && p.connected) return p;
    return null;
  }

  _clear() {
    const g = this.g;
    this.connected = false;
    g.controls.pad = { pitch: 0, roll: 0, yaw: 0, thr: 0, brake: 0 };
    for (const w of [g.hubCtl, g.cabCtl]) if (w) w.gp = { x: 0, y: 0 };
  }

  /* Front montant d'un bouton. */
  _press(p, i) {
    const now = !!(p.buttons[i] && p.buttons[i].pressed);
    const was = !!this.prev[i];
    this.prev[i] = now;
    return now && !was;
  }

  update() {
    const g = this.g, p = this._pad();
    if (!p) { if (this.connected) this._clear(); return; }
    this.connected = true;
    const ax = (i) => dz(p.axes[i]);
    const lx = ax(0), ly = ax(1), rx = ax(2);
    const rt = p.buttons[7] ? p.buttons[7].value : 0, lt = p.buttons[6] ? p.buttons[6].value : 0;
    g.controls.pad = { roll: lx, pitch: ly, yaw: rx, thr: rt - lt, brake: p.buttons[2] && p.buttons[2].pressed ? 1 : 0 };
    for (const w of [g.hubCtl, g.cabCtl]) if (w) w.gp = { x: lx, y: ly };

    if (this._press(p, 0)) {                         // A : action contextuelle
      const b = document.getElementById('btnAction');
      if (b && !b.classList.contains('hidden')) b.click();
    }
    if (this._press(p, 1)) g.closeTopPanel();        // B : retour
    if (this._press(p, 9)) {                         // Start : pause
      if (document.getElementById('pauseMenu').classList.contains('hidden')) { if (g.state !== 'BOOT') g.openPause(); }
      else g.closePause();
    }
  }
}
