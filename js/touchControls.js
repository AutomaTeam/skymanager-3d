/* ============================================================
   touchControls.js — Ergonomie tactile iPad / iPhone
   Joystick flottant (gauche), manette des gaz (droite),
   palonnier + frein, boutons d'action.
   Fallback clavier pour le test sur desktop.
   ============================================================ */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class TouchControls {
  constructor() {
    this.axes = { pitch: 0, roll: 0, yaw: 0 };
    this.throttle = 0;
    this.brake = 0;

    this.stickPad = document.getElementById('stickPad');
    this.stickBase = document.getElementById('stickBase');
    this.stickKnob = document.getElementById('stickKnob');
    this.thrPad = document.getElementById('throttlePad');
    this.thrFill = document.getElementById('throttleFill');
    this.thrKnob = document.getElementById('throttleKnob');

    this.stickId = null;
    this.thrId = null;
    this.stickOrigin = { x: 0, y: 0 };
    this.radius = 62;
    this.keys = new Set();

    /* E04 : pilotage par inclinaison (option, desactive par defaut). */
    this.pad = { pitch: 0, roll: 0, yaw: 0, thr: 0, brake: 0 };   // manette (gamepadInput.js)
    this.tilt = { on: false, base: null, raw: null, range: 25, dead: 4, invert: false };
    this.bindStick();
    this.bindThrottle();
    this.bindRudder();
    this.bindKeyboard();
  }

  /* ---------------- Joystick flottant ---------------- */
  bindStick() {
    const pad = this.stickPad;

    const down = (e) => {
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      const r = pad.getBoundingClientRect();
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.stickBase.style.left = (e.clientX - r.left) + 'px';
      this.stickBase.style.top = (e.clientY - r.top) + 'px';
      this.stickBase.classList.add('active');
      this.moveStick(0, 0);
      e.preventDefault();
    };

    const move = (e) => {
      if (e.pointerId !== this.stickId) return;
      const dx = clamp(e.clientX - this.stickOrigin.x, -this.radius, this.radius);
      const dy = clamp(e.clientY - this.stickOrigin.y, -this.radius, this.radius);
      this.moveStick(dx, dy);
      e.preventDefault();
    };

    const up = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.stickBase.classList.remove('active');
      this.moveStick(0, 0);
      this.axes.pitch = 0;
      this.axes.roll = 0;
    };

    pad.addEventListener('pointerdown', down);
    pad.addEventListener('pointermove', move);
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);
    pad.addEventListener('pointerleave', up);
  }

  moveStick(dx, dy) {
    this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    /* zone morte de 6 px puis reponse quadratique douce */
    const norm = (v) => {
      const n = clamp(v / this.radius, -1, 1);
      const d = Math.abs(n) < 0.09 ? 0 : (Math.abs(n) - 0.09) / 0.91;
      return Math.sign(n) * d * d * 0.65 + Math.sign(n) * d * 0.35;
    };
    this.axes.roll = norm(dx);
    this.axes.pitch = norm(dy);   // tirer vers soi (bas) = cabrer
  }

  /* ---------------- Manette des gaz ---------------- */
  bindThrottle() {
    const pad = this.thrPad;

    const setFrom = (clientY) => {
      const r = pad.getBoundingClientRect();
      const v = 1 - (clientY - r.top) / r.height;
      this.setThrottle(clamp(v, 0, 1));
    };

    const down = (e) => {
      if (this.thrId !== null) return;
      this.thrId = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      setFrom(e.clientY);
      e.preventDefault();
    };
    const move = (e) => {
      if (e.pointerId !== this.thrId) return;
      setFrom(e.clientY);
      e.preventDefault();
    };
    const up = (e) => {
      if (e.pointerId !== this.thrId) return;
      this.thrId = null;
    };

    pad.addEventListener('pointerdown', down);
    pad.addEventListener('pointermove', move);
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);

    /* Molette de souris : ajustement fin de la poussee (confort PC) */
    pad.addEventListener('wheel', e => {
      e.preventDefault();
      this.setThrottle(this.throttle - Math.sign(e.deltaY) * 0.05);
    }, { passive: false });
  }

  setThrottle(v) {
    this.throttle = clamp(v, 0, 1);
    const pct = this.throttle * 100;
    this.thrFill.style.height = pct + '%';
    this.thrKnob.style.bottom = `calc(${pct}% - 13px)`;
  }

  /* ---------------- Palonnier + frein ---------------- */
  bindRudder() {
    document.querySelectorAll('[data-rudder]').forEach(btn => {
      const dir = parseFloat(btn.dataset.rudder);
      const on = (e) => { this.yawHold = dir; btn.classList.add('on'); e.preventDefault(); };
      const off = () => { if (this.yawHold === dir) this.yawHold = 0; btn.classList.remove('on'); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    });

    const bb = document.getElementById('btnBrake');
    const bon = (e) => { this.brakeHold = true; bb.classList.add('on'); e.preventDefault(); };
    const boff = () => { this.brakeHold = false; bb.classList.remove('on'); };
    bb.addEventListener('pointerdown', bon);
    bb.addEventListener('pointerup', boff);
    bb.addEventListener('pointercancel', boff);
    bb.addEventListener('pointerleave', boff);
  }

  /* ---------------- Clavier (test desktop) ---------------- */
  bindKeyboard() {
    window.addEventListener('keydown', e => {
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
  }

  /* ---------------- Inclinaison (E04) ---------------- */
  /* Active/desactive. Sur iOS, la permission doit etre demandee depuis un geste (le bouton du reglage).
     Rend une promesse { ok, why }. */
  async setTilt(on) {
    if (!on) { this.tilt.on = false; this.tilt.base = null; window.removeEventListener('deviceorientation', this._onOrient); return { ok: true }; }
    if (typeof DeviceOrientationEvent === 'undefined') return { ok: false, why: 'Cet appareil n\'a pas de capteur.' };
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { if (await DeviceOrientationEvent.requestPermission() !== 'granted') return { ok: false, why: 'Permission refusée.' }; }
      catch (e) { return { ok: false, why: 'Permission impossible.' }; }
    }
    this._onOrient = this._onOrient || ((e) => this.injectOrientation(e.beta, e.gamma));
    window.removeEventListener('deviceorientation', this._onOrient);
    window.addEventListener('deviceorientation', this._onOrient);
    this.tilt.on = true; this.tilt.base = null;       // calibrage a la premiere mesure
    return { ok: true };
  }

  /* « Tiens l'iPad comme tu veux, puis touche OK » : la position actuelle devient le neutre. */
  calibrateTilt() { this.tilt.base = this.tilt.raw ? { ...this.tilt.raw } : null; }

  /* Mesure du capteur (aussi utilisable en console pour simuler : controls.injectOrientation(beta, gamma)). */
  injectOrientation(beta, gamma) {
    if (typeof beta !== 'number' || typeof gamma !== 'number') return;
    const ang = (window.screen && screen.orientation && screen.orientation.angle) || 0;
    /* Axes de l'ecran : x = vers la droite, y = vers le haut de l'ecran, selon l'orientation. */
    let roll, pitch;
    if (ang === 90) { roll = beta; pitch = -gamma; }
    else if (ang === 270) { roll = -beta; pitch = gamma; }
    else if (ang === 180) { roll = -gamma; pitch = -beta; }
    else { roll = gamma; pitch = beta; }
    this.tilt.raw = { roll, pitch };
    if (!this.tilt.base) this.tilt.base = { roll, pitch };
  }

  _tiltAxes() {
    const t = this.tilt;
    if (!t.on || !t.raw || !t.base) return { p: 0, r: 0 };
    const f = (d) => { const a = Math.abs(d); if (a < t.dead) return 0; return Math.sign(d) * clamp((a - t.dead) / (t.range - t.dead), 0, 1); };
    const s = t.invert ? -1 : 1;
    /* Pencher a droite = rouler a droite ; incliner le haut de l'ecran vers soi = cabrer. */
    return { r: s * f(t.raw.roll - t.base.roll), p: s * f(t.raw.pitch - t.base.pitch) };
  }

  /* ---------------- Lecture par frame ---------------- */
  update(dt) {
    const k = this.keys;
    let kp = 0, kr = 0, ky = 0;
    /* Cabrer = valeur positive, comme le joystick (moveStick : "tirer vers
       soi (bas) = cabrer" -> axes.pitch positif). Avant ce correctif, le
       clavier etait invers par rapport au joystick : ArrowUp donnait
       kp = -1, qui combine a Cme (positif) pour piquer au lieu de cabrer
       — l'appareil ne pouvait jamais lever le nez au decollage, meme
       gaz et vitesse au-dela de Vr, et divergeait en roulis/tangage une
       fois le net decrochage partiel atteint. */
    if (k.has('ArrowUp')) kp += 1;
    if (k.has('ArrowDown')) kp -= 1;
    if (k.has('ArrowLeft')) kr -= 1;
    if (k.has('ArrowRight')) kr += 1;
    if (k.has('KeyQ')) ky -= 1;
    if (k.has('KeyD')) ky += 1;
    if (k.has('KeyW')) this.setThrottle(this.throttle + dt * 0.6);
    if (k.has('KeyS')) this.setThrottle(this.throttle - dt * 0.6);

    /* Le lacet suit une rampe : plus doux qu'un tout ou rien */
    const yawTarget = clamp((this.yawHold || 0) + ky, -1, 1);
    this.axes.yaw += clamp(yawTarget - this.axes.yaw, -dt * 3.5, dt * 3.5);
    if (Math.abs(this.axes.yaw) < 0.01) this.axes.yaw = 0;

    this.brake = (this.brakeHold || k.has('Space') || this.pad.brake) ? 1 : 0;

    if (this.pad.thr) this.setThrottle(this.throttle + this.pad.thr * dt * 0.8);
    const ti = this._tiltAxes();
    return {
      pitch: clamp(this.axes.pitch + kp + ti.p + this.pad.pitch, -1, 1),
      roll: clamp(this.axes.roll + kr + ti.r + this.pad.roll, -1, 1),
      yaw: clamp(this.axes.yaw + this.pad.yaw, -1, 1),
      throttle: this.throttle,
      brake: this.brake
    };
  }
}
