/* ============================================================
   flightPhysics.js — Moteur aerodynamique 6 DDL simplifie
   Aeronef de reference : biréacteur turbofan court/moyen courrier
   Repere : Y-up (THREE.js). Axes avion : avant = -Z, droite = +X, haut = +Y
   Unites SI internes (m, m/s, N, kg). Conversion affichage dans main.js
   ============================================================ */

import * as THREE from 'three';
import { heliInit, heliReset, heliStep } from './heliModel.js?v=1791470488';

export const KTS = 1.94384;      // m/s -> noeuds
export const FT = 3.28084;       // m -> pieds
export const FPM = 196.850;      // m/s -> pieds/minute

const G = 9.80665;
const RHO0 = 1.225;

/* Crans de volets : [angle deg, dCL, dCD, Vfe (kt IAS)] */
export const FLAP_STEPS = [
  { name: '0',    cl: 0.00, cd: 0.0000, vfe: 999 },
  { name: '1',    cl: 0.25, cd: 0.0060, vfe: 230 },
  { name: '2',    cl: 0.50, cd: 0.0160, vfe: 200 },
  { name: '3',    cl: 0.75, cd: 0.0320, vfe: 185 },
  { name: 'FULL', cl: 1.00, cd: 0.0600, vfe: 175 }
];

export function airDensity(altM) {
  const h = Math.max(0, altM);
  return RHO0 * Math.pow(Math.max(0.05, 1 - 2.25577e-5 * h), 4.2559);
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Aircraft {
  static PROFILE_KEYS = ['S', 'b', 'c', 'oswald', 'emptyMass', 'payload', 'fuelCap', 'Ipitch', 'Iyaw', 'Iroll',
    'CL0', 'CLa', 'alphaStall', 'CD0', 'CYb', 'Cm0', 'Cma', 'Cmq', 'Cme', 'Clda', 'Clp', 'Clb', 'Cnb', 'Cnr', 'Cndr',
    'Cnda', 'engines', 'thrustPerEngine', 'sfc', 'gearK', 'gearC'];

  constructor() {
    /* ---- Geometrie / masse ---- */
    this.S = 122.6;            // surface alaire m2
    this.b = 34.1;             // envergure m
    this.c = 4.19;             // corde moyenne m
    this.AR = this.b * this.b / this.S;
    this.oswald = 0.80;

    this.emptyMass = 44000;    // kg
    this.payload = 14000;      // kg (passagers + fret)
    this.fuelCap = 12000;      // kg
    this.fuel = 9000;

    /* Inerties autour des axes AVION (kg.m2) */
    this.Ipitch = 4.0e6;       // axe X (droite)
    this.Iyaw   = 5.5e6;       // axe Y (haut)
    this.Iroll  = 1.5e6;       // axe Z (avant)

    /* ---- Coefficients aerodynamiques ---- */
    this.CL0 = 0.18;
    this.CLa = 5.1;            // /rad
    this.alphaStall = 0.265;   // ~15.2 deg
    this.CD0 = 0.0220;
    this.CYb = -0.90;          // force laterale / derapage

    this.Cm0 = 0.03;
    /* Stabilite et amortissement releves par rapport a un calcul "realiste"
       (Cma -1.10 / Cmq -22 / Clp -0.48) : a ces valeurs, une simple
       pichenette au manche de 0.3 s suffisait a lancer une oscillation
       phugoide de plusieurs dizaines de secondes, avec des ecarts
       d'altitude et de vitesse enormes (+-1500 ft, +-100 kt) avant de
       s'amortir. Injouable au clavier/tactile sans experience de pilotage.
       Le jeu vise l'arcade, pas la simulation : l'appareil doit revenir
       de lui-meme vers une assiette stable sans que le joueur ait a
       contrer une oscillation lente et amplifiee par ses propres corrections. */
    this.Cma = -1.30;          // stabilite statique longitudinale
    this.Cmq = -28.0;          // amortissement tangage
    this.Cme = 0.95;           // autorite gouverne de profondeur (reponse plus douce)

    this.Clda = 0.045;         // ailerons
    this.Clp  = -0.70;         // amortissement roulis (un peu plus permissif qu'en reel)
    this.Clb  = -0.10;         // effet diedre

    this.Cnb = 0.13;           // stabilite de route
    this.Cnr = -0.40;          // amortissement lacet
    this.Cndr = 0.075;         // autorite direction
    this.Cnda = -0.012;        // lacet inverse

    /* ---- Propulsion ---- */
    this.engines = 2;
    this.thrustBoost = 1;           // turbo (mode Arcade) : multiplicateur de poussee
    this.thrustPerEngine = 111000;  // N au decollage, niveau mer
    this.n1 = 20;                   // % regime actuel (lisse)
    this.n1Target = 20;
    this.sfc = 1.05e-5;             // kg/(N.s)

    /* ---- Trains ---- */
    this.gearPoints = [
      { name: 'nose',  p: new THREE.Vector3(0.0, -3.30, -11.5), steer: true,  brake: false, load: 0 },
      { name: 'left',  p: new THREE.Vector3(-3.8, -3.45, 1.8),  steer: false, brake: true,  load: 0 },
      { name: 'right', p: new THREE.Vector3(3.8, -3.45, 1.8),   steer: false, brake: true,  load: 0 }
    ];
    this.gearK = 7.0e5;      // raideur amortisseur N/m
    this.gearC = 2.6e5;      // amortissement N.s/m (regime sur-amorti : pas de rebond)
    this.groundHold = 0;     // hysteresis de contact

    /* ---- Etat ---- */
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.omega = new THREE.Vector3();   // rad/s, repere avion (x,y,z)

    /* ---- Commandes ---- */
    this.ctl = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 0 };
    this.flapIndex = 0;
    this.gearDown = true;
    this.spoilers = false;
    this.reverse = false;
    this.parkBrake = true;

    /* ---- Meteo ---- */
    this.wind = new THREE.Vector3(0, 0, 0);
    this.gustPhase = Math.random() * 100;
    this.turbulence = 0.35;

    /* ---- Telemetrie ---- */
    this.alpha = 0; this.beta = 0;
    this.ias = 0; this.tas = 0; this.mach = 0;
    this.gLoad = 1; this.onGround = true; this.wasOnGround = true;
    this.airborneTime = 0; this.lastVs = 0;
    this.stall = 0; this.overspeed = false;
    this.touchdown = null;         // rempli au poser
    this.stress = { hard: 0, overG: 0, overspeed: 0, flapOverspeed: 0 };
    this.crashed = false;

        /* Pannes en vol (phase 12). Rempli par MechanicSystem quand un
           composant lache : le modele de vol ne connait que des facteurs
           multiplicateurs, il ignore d'ou vient la panne. Tous les
           facteurs valent 1 (ou false) quand l'appareil est sain. */
        this.faults = {
          thrust: 1,      // facteur de poussee disponible
          control: 1,     // autorite des gouvernes
          brake: 1,       // efficacite du freinage
          drag: 0,        // trainee additionnelle (CD)
          flaps: false,   // volets bloques en position courante
          gear: false,    // train bloque
          pull: 0         // derapage au roulage (crevaison)
        };

        this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
    this._qi = new THREE.Quaternion();

    /* ---- Profil d'appareil (mode Arcade, js/fleet.js) ----
       Les valeurs ci-dessus sont celles du jet de ligne. applyProfile()
       les remplace pour un petit avion et les restaure au retour. */
    this.groundY = 3.14;       // altitude du centre de gravite sur le train
    this.maxFlap = 4;
    this.fixedGear = false;
    this.noReverse = false;
    this.rateDamping = 3.2;    // amortissement arcade de la rotation
    this.propVmax = 0;         // > 0 : helice, la poussee tombe avec la vitesse (m/s)
    this.vne = 350;            // vitesse a ne jamais depasser (kt)
    this.speeds = { climb: 215, cruise: 235, boost: 305 };
    this.flareAgl = 24;
    this.stuntMinKt = 140;
    this.safeAgl = 0;          // > 0 : altitude de securite reduite (rase-mottes sur l'eau)
    this.profile = 'liner';
    this.heli = null;           // etat de l'helicoptere (heliModel.js), null pour un avion
    this.isHeli = false;
    this.glider = false;        // planeur : le « moteur » est la corde de remorquage (coupee au largage)
    this.released = false;      // planeur largue (plus aucune traction)
    this.gain = { roll: 1, pitch: 1 };     // gains de l'aide au pilotage (flightAssist.js)
    this._base = {};
    for (const k of Aircraft.PROFILE_KEYS) this._base[k] = this[k];
    this._baseGear = this.gearPoints.map(g => ({ ...g, p: g.p.clone() }));
  }

  /* Applique un profil physique (objet `phys` de fleet.js) ; null = jet de ligne. */
  applyProfile(id, phys) {
    for (const k of Aircraft.PROFILE_KEYS) this[k] = this._base[k];
    this.gearPoints = this._baseGear.map(g => ({ ...g, p: g.p.clone() }));
    this.groundY = 3.14; this.maxFlap = 4; this.fixedGear = false; this.noReverse = false;
    this.rateDamping = 3.2; this.propVmax = 0; this.vne = 350; this.flareAgl = 24; this.stuntMinKt = 140;
    this.speeds = { climb: 215, cruise: 235, boost: 305 };
    this.isHeli = false; this.heli = null; this.safeAgl = 0;
    this.glider = false; this.released = false;
    if (phys) {
      const { gear, ...rest } = phys;
      Object.assign(this, rest);
      if (gear) {
        this.gearPoints = gear.map(g => ({ name: g.name, p: new THREE.Vector3(...g.p), steer: !!g.steer, brake: !!g.brake, load: 0 }));
      }
    }
    this.AR = this.b * this.b / this.S;
    if (this.isHeli) heliInit(this);
    this.profile = id;
    this.gain = (phys && phys.gain) || { roll: 1, pitch: 1 };
    if (this.fixedGear) this.gearDown = true;
  }

  /* -------------------------------------------------- */
  get mass() { return this.emptyMass + this.payload + this.fuel; }
  get flaps() { return FLAP_STEPS[this.flapIndex]; }

  get altitude() { return this.pos.y; }
  get vsi() { return this.vel.y; }                         // m/s
  get heading() {                                          // deg, 0 = Nord (-Z)
    const f = this.forward();
    let h = Math.atan2(f.x, -f.z) * 180 / Math.PI;
    return (h + 360) % 360;
  }
  get pitchDeg() {
    const f = this.forward();
    return Math.asin(clamp(f.y, -1, 1)) * 180 / Math.PI;
  }
  get bankDeg() {
    /* inclinaison positive = aile droite basse */
    const r = this.right();
    return Math.asin(clamp(-r.y, -1, 1)) * 180 / Math.PI;
  }

  forward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.quat); }
  up()      { return new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat); }
  right()   { return new THREE.Vector3(1, 0, 0).applyQuaternion(this.quat); }

  /* Vitesse de decrochage a la configuration courante (m/s IAS) */
  stallSpeed() {
    const clMax = (this.CL0 + this.CLa * this.alphaStall) + this.flaps.cl;
    return Math.sqrt((2 * this.mass * G) / (RHO0 * this.S * clMax));
  }
  vRef() { return this.stallSpeed() * 1.30; }
  vRotate() { return this.stallSpeed() * 1.13; }

  /* -------------------------------------------------- */
  reset(opts = {}) {
    const o = Object.assign({
      pos: new THREE.Vector3(0, 3.14, 900),
      heading: 0, speed: 0, fuel: 9000, flaps: 1, gear: true
    }, opts);

    this.pos.copy(o.pos);
    this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -o.heading * Math.PI / 180);
    this.vel.set(0, 0, 0).addScaledVector(this.forward(), o.speed);
    this.omega.set(0, 0, 0);
    this.fuel = o.fuel;
    this.flapIndex = o.flaps;
    this.gearDown = o.gear || this.fixedGear;
    this.spoilers = false;
    this.reverse = false;
    this.released = false;
    this.n1 = this.n1Target = 20;
    this.ctl.throttle = 0;
    this.ctl.pitch = this.ctl.roll = this.ctl.yaw = 0;
    this.parkBrake = o.speed < 1;
    this.armedForLanding = false;
    this.onGround = this.wasOnGround = true;
    this.airborneTime = 0;
    this.lastVs = 0;
    this.touchdown = null;
    this.crashed = false;
    this.stress = { hard: 0, overG: 0, overspeed: 0, flapOverspeed: 0 };
        this.clearFaults();
        if (this.heli) heliReset(this, o.heading);
      }

      /* -------------------------------------------------- */
      /* Pannes en vol (phase 12)                           */
      /* -------------------------------------------------- */

      /* Remet tous les facteurs de panne a leur valeur nominale. Appele
         au reset et apres une reparation complete. */
      clearFaults() {
        this.faults.thrust = 1;
        this.faults.control = 1;
        this.faults.brake = 1;
        this.faults.drag = 0;
        this.faults.flaps = false;
        this.faults.gear = false;
        this.faults.pull = 0;
      }

      /* Applique une panne. `kind` vient de MechanicSystem.FAILURES.
         Les effets sont cumulatifs : deux pannes de poussee se
         multiplient, ce qui rend l'appareil tres mal entretenu
         reellement dangereux. */
      applyFault(kind) {
        const f = this.faults;
        switch (kind) {
          case 'thrust': f.thrust *= 0.55; break;
          case 'control': f.control *= 0.62; break;
          case 'brake': f.brake *= 0.45; break;
          case 'drag': f.drag += 0.030; break;
          case 'flaps': f.flaps = true; break;
          case 'gear': f.gear = true; break;
          case 'tyre': f.pull += 0.55; break;
          default: break;
        }
      }

      get hasFault() {
        const f = this.faults;
        return f.thrust < 1 || f.control < 1 || f.brake < 1 || f.drag > 0
          || f.flaps || f.gear || f.pull > 0;
      }

  /* ==================================================
     Integration : pas fixe, sous-pas pour la stabilite
     ================================================== */
  update(dt, t) {
    if (this.heli) { heliStep(this, dt, t); return; }
    dt = clamp(dt, 0.0005, 0.05);
    const sub = 2;
    for (let i = 0; i < sub; i++) this.step(dt / sub, t);
    this.postUpdate(dt);
  }

  step(dt, t) {
    const m = this.mass;
    const rho = airDensity(this.pos.y);

    /* ---------- Vent + turbulence ---------- */
    const gust = this._tmpA.set(
      Math.sin(t * 0.9 + this.gustPhase) * 0.6 + Math.sin(t * 2.7) * 0.25,
      Math.sin(t * 1.7 + this.gustPhase * 1.3) * 0.5,
      Math.cos(t * 1.1 + this.gustPhase * 0.7) * 0.6
    ).multiplyScalar(this.turbulence * (this.onGround ? 0.2 : 1));

    const vAir = this._tmpB.copy(this.vel).sub(this.wind).sub(gust);
    const V = vAir.length();

    /* ---------- Angles aerodynamiques ---------- */
    this._qi.copy(this.quat).invert();
    const vb = vAir.clone().applyQuaternion(this._qi);   // repere avion
    const u = -vb.z;                                     // composante avant
    this.alpha = V > 1 ? Math.atan2(-vb.y, Math.max(u, 0.1)) : 0;
    this.beta  = V > 1 ? Math.atan2(vb.x, Math.max(u, 0.1)) : 0;
    if (u < 0) this.alpha = this.beta = 0;               // marche arriere : pas d'aero

    this.tas = V;
    this.ias = V * Math.sqrt(rho / RHO0);
    this.mach = V / (340.3 * Math.sqrt(Math.max(0.6, 1 - 2.25577e-5 * this.pos.y * 4.5)));

    const q = 0.5 * rho * V * V;
    const qS = q * this.S;

    /* ---------- Portance / decrochage ---------- */
    let clLin = this.CL0 + this.CLa * this.alpha + this.flaps.cl;
    const aAbs = Math.abs(this.alpha);
    const aStall = this.alphaStall + this.flaps.cl * 0.02;
    /* transition douce vers le regime post-decroche (plaque plane) */
    const sMix = clamp((aAbs - aStall) / 0.12, 0, 1);
    this.stall = sMix;
    const clFlat = 1.05 * Math.sin(2 * this.alpha);
    let CL = clLin * (1 - sMix) + clFlat * sMix;
    if (this.spoilers) CL *= 0.72;

    let CD = this.CD0 + this.flaps.cd
      + (this.gearDown && !this.glider ? 0.019 : 0)      // planeur : roue carenee, pas de trainee de train
      + (this.spoilers ? 0.055 : 0)
      + (CL * CL) / (Math.PI * this.AR * this.oswald)
      + sMix * 0.09
          + Math.abs(this.beta) * 0.22
          + this.faults.drag;

    const forces = new THREE.Vector3(0, -m * G, 0);   // poids

    if (V > 0.6) {
      const vDir = vAir.clone().divideScalar(V);
      const rightAx = this.right();
      const liftDir = new THREE.Vector3().crossVectors(rightAx, vDir);
      if (liftDir.lengthSq() > 1e-6) liftDir.normalize();

      forces.addScaledVector(liftDir, qS * CL);
      forces.addScaledVector(vDir, -qS * CD);
      forces.addScaledVector(rightAx, qS * this.CYb * this.beta);
    }

    /* ---------- Poussee ---------- */
    const n1n = clamp((this.n1 - 20) / 80, 0, 1);
    const thrustRatio = Math.pow(n1n, 1.35);
    const altFactor = rho / RHO0;
    let thrust = this.engines * this.thrustPerEngine * thrustRatio * (0.35 + 0.65 * altFactor);
        thrust *= this.faults.thrust * this.thrustBoost;
        if (this.propVmax > 0) thrust *= clamp(1 - 0.78 * (V / this.propVmax) * (V / this.propVmax), 0.18, 1);
        if (this.fuel <= 0) thrust = 0;
        if (this.glider && this.released) thrust = 0;
    if (this.reverse && !this.noReverse) thrust *= (this.onGround ? -0.42 : 0);
    forces.addScaledVector(this.forward(), thrust);
    this.thrustN = thrust;

    /* ---------- Moments aerodynamiques ---------- */
    const p =  -this.omega.z;   // roulis a droite
    const qr =  this.omega.x;   // tangage a cabrer
    const r  = -this.omega.y;   // lacet a droite
    const Vd = Math.max(V, 25);

    const Cm = this.Cm0 + this.Cma * this.alpha
      + this.Cmq * (qr * this.c / (2 * Vd))
          + this.Cme * this.ctl.pitch * (this.stall > 0.5 ? 0.45 : 1) * this.faults.control;

        const Cl = this.Clda * this.ctl.roll * (1 - 0.5 * sMix) * this.faults.control
      + this.Clp * (p * this.b / (2 * Vd))
      + this.Clb * this.beta;

    const Cn = this.Cnb * this.beta
      + this.Cnr * (r * this.b / (2 * Vd))
          + this.Cndr * this.ctl.yaw * this.faults.control
      + this.Cnda * this.ctl.roll;

    const Mpitch = q * this.S * this.c * Cm;
    const Mroll  = q * this.S * this.b * Cl;
    const Myaw   = q * this.S * this.b * Cn;

    /* accelerations angulaires (repere avion) */
    const angAcc = new THREE.Vector3(
      Mpitch / this.Ipitch,
      -Myaw / this.Iyaw,
      -Mroll / this.Iroll
    );

    /* ---------- Assistance arcade : amortissement direct de vitesse
       angulaire ----------
       Le jeu vise l'arcade, pas la simulation. Or le phugoide (echange
       altitude/vitesse a energie quasi constante) est domine par la
       trainee et la finesse de l'appareil, pas par Cmq/Cma : ceux-ci
       n'amortissent que le mode court-periode (quelques secondes). Sur
       ce modele, une simple pichenette au manche relachee aussitot
       lancait une oscillation de +-1500 ft / +-100 kt qui ne s'amortissait
       qu'au bout de plus d'une minute — injouable sans experience de
       pilotage. Plutot que de retoucher les coefficients aerodynamiques
       (dont les interactions sont difficiles a predire et ont d'abord
       aggrave le probleme), on ajoute un freinage direct de la vitesse de
       rotation, indépendant de l'aerodynamique — la meme recette que les
       jeux d'arcade grand public (Ace Combat, War Thunder en mode
       arcade) : l'appareil finit toujours par cesser de tourner tout
       seul, quel que soit l'angle ou la vitesse. Les commandes du joueur
       restent pleinement prioritaires : ce terme ne fait que dissiper
       l'exces de rotation, il ne pousse vers aucune assiette cible. */
    const ARCADE_RATE_DAMPING = this.rateDamping;
    angAcc.x -= ARCADE_RATE_DAMPING * this.omega.x;
    angAcc.y -= ARCADE_RATE_DAMPING * 0.6 * this.omega.y;
    angAcc.z -= ARCADE_RATE_DAMPING * this.omega.z;

    /* ---------- Contact au sol ---------- */
    this.onGround = false;
    const omegaWorld = this.omega.clone().applyQuaternion(this.quat);
    let totalLoad = 0;

    if (this.gearDown || this.pos.y < 2.0) {
      for (const g of this.gearPoints) {
        g.load = 0;
        if (!this.gearDown && g.name !== 'belly') continue;

        const wp = g.p.clone().applyQuaternion(this.quat).add(this.pos);
        const pen = -wp.y;
        if (pen <= 0) continue;

        const rArm = wp.clone().sub(this.pos);
        const vp = this.vel.clone().add(new THREE.Vector3().crossVectors(omegaWorld, rArm));

        /* Amortisseur */
        let Fn = this.gearK * Math.min(pen, 0.6) - this.gearC * vp.y;
        if (Fn < 0) Fn = 0;
        g.load = Fn;
        totalLoad += Fn;
        this.onGround = true;

        const F = new THREE.Vector3(0, Fn, 0);

        /* Direction de roulement de la roue (projetee au sol) */
        let wheelFwd = this.forward().setY(0);
        if (wheelFwd.lengthSq() < 1e-4) wheelFwd.set(0, 0, -1);
        wheelFwd.normalize();
        if (g.steer) {
          const steerAng = this.ctl.yaw * 0.52 * clamp(1 - this.tas / 55, 0.12, 1);
          wheelFwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), -steerAng);
        }
        const wheelSide = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), wheelFwd).normalize();

        const vGround = vp.clone().setY(0);
        const slipF = vGround.dot(wheelFwd);
        const slipS = vGround.dot(wheelSide);

        const muRoll = 0.018 + (g.brake ? this.ctl.brake * 0.42 * this.faults.brake : 0) + (this.parkBrake ? 0.55 : 0);
        const muSide = 0.72;

        F.addScaledVector(wheelFwd, -Fn * muRoll * Math.tanh(slipF / 0.9));
        F.addScaledVector(wheelSide, -Fn * muSide * Math.tanh(slipS / 0.55));

                /* Crevaison : la roue tire d'un cote. Une seule roue principale
                   touchee suffit a faire sortir de l'axe au roulage. */
                if (this.faults.pull > 0 && g.brake) {
                  F.addScaledVector(wheelSide, Fn * this.faults.pull * Math.sign(slipF || 1));
                }

        forces.add(F);
        const tau = new THREE.Vector3().crossVectors(rArm, F).applyQuaternion(this._qi);
        angAcc.x += tau.x / this.Ipitch;
        angAcc.y += tau.y / this.Iyaw;
        angAcc.z += tau.z / this.Iroll;
      }
    }

    /* Hysteresis de contact : un rebond de 0.3 s ne compte pas comme un envol */
    if (this.onGround) this.groundHold = 0.3;
    else if (this.groundHold > 0) { this.groundHold -= dt; this.onGround = true; }

    /* Amortissement angulaire additionnel au sol (evite l'oscillation) */
    if (this.onGround) angAcc.addScaledVector(this.omega, -1.6);

    /* ---------- Assistance arcade : amortissement de phugoide ----------
       L'amortissement de vitesse de rotation ci-dessus (ARCADE_RATE_DAMPING)
       empeche la rotation de s'emballer, mais un phugoide est lent : sur
       une oscillation de 20-30 s, la vitesse angulaire moyenne reste
       minuscule, donc un freinage de rotation n'y dissipe presque rien.
       La variable qui oscille vraiment est la vitesse verticale (l'appareil
       echange altitude et vitesse) : on la freine donc directement, en
       vol seulement (au sol, les trains s'en chargent deja). Sans ca,
       l'amplitude grandissait cycle apres cycle (7 -> 12 deg de tangage
       sur les deux premieres pointes) au lieu de s'amortir. */
    if (!this.onGround) forces.y -= 0.09 * m * this.vel.y;

    /* ---------- Integration ---------- */
    const acc = forces.divideScalar(m);
    /* Facteur de charge : acceleration non gravitationnelle projetee sur l'axe haut avion */
    this.gLoad = acc.clone().add(new THREE.Vector3(0, G, 0)).dot(this.up()) / G;
    this.vel.addScaledVector(acc, dt);
    this.pos.addScaledVector(this.vel, dt);

    this.omega.addScaledVector(angAcc, dt);
    this.omega.multiplyScalar(0.999);

    const dq = new THREE.Quaternion(
      this.omega.x * dt * 0.5,
      this.omega.y * dt * 0.5,
      this.omega.z * dt * 0.5,
      1
    );
    this.quat.multiply(dq).normalize();

    /* Butee dure : filet de securite au-dela de la course d'amortisseur (0.6 m).
       Ne doit jamais se declencher en roulage normal, sinon les amortisseurs
       ne se chargent plus et les freins n'ont plus d'appui. */
    const lowest = this.lowestPointY();
    if (lowest < -0.85) {
      this.pos.y -= lowest;
      if (this.vel.y < 0) this.vel.y *= -0.05;
    }

    /* Consommation carburant */
    this.fuel = Math.max(0, this.fuel - Math.abs(thrust) * this.sfc * dt);
  }

  lowestPointY() {
    let lo = Infinity;
    const pts = (this.gearDown || this.fixedGear)
      ? this.gearPoints.map(g => g.p)
      : [new THREE.Vector3(0, -2.3, -8), new THREE.Vector3(0, -2.3, 6)];
    for (const p of pts) {
      const y = p.clone().applyQuaternion(this.quat).add(this.pos).y;
      if (y < lo) lo = y;
    }
    return lo;
  }

  /* -------------------------------------------------- */
  postUpdate(dt) {
    /* Inertie des reacteurs (spool up/down) */
    this.n1Target = 20 + this.ctl.throttle * 80;
    const rate = (this.n1Target > this.n1 ? 14 : 22) * dt;
    this.n1 += clamp(this.n1Target - this.n1, -rate * 3, rate * 3);

    /* Limitations structurelles */
    const iasKt = this.ias * KTS;
    this.overspeed = iasKt > this.vne;
    if (this.overspeed) this.stress.overspeed += (iasKt - this.vne) * dt * 0.01;
    if (this.flapIndex > 0 && iasKt > this.flaps.vfe) {
      this.stress.flapOverspeed += (iasKt - this.flaps.vfe) * dt * 0.02;
    }
    if (Math.abs(this.gLoad) > 2.5) this.stress.overG += (Math.abs(this.gLoad) - 2.5) * dt;

    /* Detection du poser : armee seulement apres un vol reel */
    if (this.onGround) this.airborneTime = 0;
    else this.airborneTime += dt;

    if (this.onGround && !this.wasOnGround && this.armedForLanding) {
      const fpm = -this.lastVs * FPM;
      this.touchdown = {
        fpm: Math.max(0, fpm),
        ias: this.ias * KTS,
        bank: this.bankDeg,
        offset: this.pos.x,
        gearDown: this.gearDown,
        flaps: this.flaps.name
      };
      this.stress.hard += Math.max(0, (fpm - 250)) * 0.004;
      if (fpm > 900 || !this.gearDown || Math.abs(this.bankDeg) > 12) this.crashed = true;
    }
    if (!this.onGround) this.lastVs = this.vel.y;
    if (this.airborneTime > 2.0 && this.pos.y > 8) this.armedForLanding = true;
    if (this.onGround && this.touchdown) this.armedForLanding = false;
    this.wasOnGround = this.onGround;

    /* Parking brake libere des que les gaz montent */
    if (this.ctl.throttle > 0.12) this.parkBrake = false;
  }

  /* -------------------------------------------------- */
    setFlaps(i) {
      if (this.faults.flaps) return false;      // volets bloques
      this.flapIndex = clamp(i, 0, FLAP_STEPS.length - 1);
      return true;
    }
    toggleGear() {
      if (this.faults.gear || this.fixedGear) return false;       // train bloque ou fixe
      if (this.ias * KTS > 270) return false;   // Vlo
      this.gearDown = !this.gearDown;
      return true;
    }
}
