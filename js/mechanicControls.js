/* ============================================================
   mechanicControls.js — ITERATION 2
   Joystick flottant pour le deplacement du technicien au sol
   (meme ergonomie que le manche du pilote, DOM separe).
   ============================================================ */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class WalkJoystick {
  constructor(padId, baseId, knobId) {
    this.pad = document.getElementById(padId);
    this.base = document.getElementById(baseId);
    this.knob = document.getElementById(knobId);
    this.id = null;
    this.origin = { x: 0, y: 0 };
    this.radius = 58;
    this.axes = { x: 0, y: 0 };
    this.keys = new Set();
    this.bind();
  }

  bind() {
    const pad = this.pad;

    const down = (e) => {
      if (this.id !== null) return;
      this.id = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      const r = pad.getBoundingClientRect();
      this.origin = { x: e.clientX, y: e.clientY };
      this.base.style.left = (e.clientX - r.left) + 'px';
      this.base.style.top = (e.clientY - r.top) + 'px';
      this.base.classList.add('active');
      this.move(0, 0);
      e.preventDefault();
    };
    const move = (e) => {
      if (e.pointerId !== this.id) return;
      const dx = clamp(e.clientX - this.origin.x, -this.radius, this.radius);
      const dy = clamp(e.clientY - this.origin.y, -this.radius, this.radius);
      this.move(dx, dy);
      e.preventDefault();
    };
    const up = (e) => {
      if (e.pointerId !== this.id) return;
      this.id = null;
      this.base.classList.remove('active');
      this.move(0, 0);
    };

    pad.addEventListener('pointerdown', down);
    pad.addEventListener('pointermove', move);
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);
    pad.addEventListener('pointerleave', up);

    window.addEventListener('keydown', e => {
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
  }

  move(dx, dy) {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const norm = (v) => {
      const n = clamp(v / this.radius, -1, 1);
      return Math.abs(n) < 0.08 ? 0 : n;
    };
    this.axes.x = norm(dx);
    this.axes.y = norm(dy);
  }

  /* Retourne des commandes relatives au personnage : { move, turn },
     chacune dans [-1, 1] (fallback clavier ZQSD/fleches).

     Avant ce correctif, read() rendait un vecteur direction ABSOLU
     (independant du cap courant) : appuyer sur "droite" visait un angle
     du monde fixe une fois pour toutes, le personnage pivotait jusqu'a
     s'aligner dessus puis marchait tout droit -- tenir la touche
     n'avait alors plus aucun effet des que le cap etait atteint.

     Le modele commun (haut/bas = avancer/reculer selon le cap courant,
     gauche/droite = tourner en continu, comme la quasi-totalite des
     jeux a la troisieme personne avec camera fixe derriere le
     personnage) evite ce probleme par construction : tenir "droite"
     fait tourner en continu tant que la touche est maintenue, il n'y a
     pas d'"angle cible" fixe vers lequel foncer. */
  read() {
    let x = this.axes.x, y = this.axes.y;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) x += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) y -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) y += 1;
    x = clamp(x, -1, 1); y = clamp(y, -1, 1);
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    /* y de l'ecran est negatif vers l'avant (ArrowUp/joystick pousse vers
       le haut) : avancer doit donner move positif, d'ou l'inversion.
       x positif (ArrowRight/joystick a droite) doit tourner vers la
       droite du personnage, qui correspond a turn negatif dans le sens
       de cap utilise par updateHub/updateTerminal (voir main.js) : d'ou
       la seconde inversion, choisie pour prolonger exactement le sens
       de "droite" deja etabli avant ce correctif. */
    return { move: -y, turn: -x };
  }
}
