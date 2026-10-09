/* ============================================================
   flightAssist.js — Aide au pilotage du mode Arcade

   Le joueur ne fait que VIRER (gauche/droite) et MONTER/DESCENDRE
   (haut/bas). Tout le reste est automatique :
     - poussee : plein gaz au decollage, vitesse cible ensuite ;
     - rotation au decollage, train et volets ;
     - ailes a plat quand le manche est relache ;
     - tenue de pente (l'avion ne decroche pas tout seul) ;
     - approche guidee sur la piste, arrondi, spoilers et freins.

   Le module est independant du DOM et de Three.js : il lit l'etat
   de l'appareil (flightPhysics.Aircraft) et rend des commandes.
   Il est teste hors navigateur, voir README (phase 17).

   Repere : cap 0 = nord = -Z, piste 36 : seuil a z = +1500, bout a
   z = -1500, axe x = 0. Inclinaison > 0 = aile droite basse.
   ============================================================ */

import { heliCommand } from './heliModel.js?v=1791576493';

const KTS = 1.94384;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap180 = (a) => ((a + 540) % 360) - 180;

/* Altitude du centre de gravite quand l'appareil roule (train comprime). */
export const GROUND_Y = 3.14;

export const RWY = { x: 0, zStart: 1500, zEnd: -1500 };

/* Vitesses cibles (kt IAS) selon la phase. */

/* Plafond de jeu : au-dela, l'appareil se met en palier (m). */
const CEILING_AGL = 1300;

/* Point de poser vise (m, repere monde) et hauteur de debut d'arrondi. */
const Z_TOUCH = -1200;

/* Guidage lateral en finale : pente vers l'axe (deg/m) et gain de roulis.
   Regles par balayage (tools/flightAssist.sim.mjs) : ecart max au poser
   7 m sur 4 vents (jusqu'a 10 kt de travers, turbulence 1.0) et 4 departs. */
const LAT_K = 0.06, LAT_G = 3.2;

/* Hors approche, l'appareil ne descend pas sous cette hauteur (m). */
const SAFE_AGL = 110;

/* Planeur : largage de la remorque a cette hauteur (m) ; sous GLIDER_LOW (m) hors approche,
   l'aide rappelle le planeur en finale (jamais d'atterrissage force dans un champ). */
export const GLIDER_RELEASE = 520;
const GLIDER_LOW = 70;

export class FlightAssist {
  constructor() {
    this.reset();
  }

  reset() {
    this.tx = 0;                // axe d'approche (x) : piste principale ou piste d'ile
    this.zTouch = Z_TOUCH;      // point de poser vise (z)
    this.pitchHold = null;      // assiette tenue quand le manche est relache
    this.hdgHold = null;        // cap tenu quand le manche est relache
    this.guide = null;          // { x, y, z } : anneau vers lequel l'avion se laisse attirer
    this.rolling = false;       // course au decollage engagee
    this.launched = false;      // "DECOLLER" appuye
    this.landing = false;       // approche guidee active
    this.rolloutT = 0;
    this.state = 'PARKED';
    this.hint = '';
    this.flare = false;
    this.thr = 0;               // poussee commandee (lissee)
    this.gearTimer = 0;
    this.boost = false;         // turbo demande (fun.js)
    this.altHold = null;        // altitude tenue (helicoptere)
    this.vsI = 0;               // terme integral de la descente guidee
  }

  /* Appui sur DECOLLER : plein gaz, roulage guide. */
  launch() {
    this.launched = true;
    this.rolling = true;
  }

  /* Vrai quand l'appareil est en approche guidee vers la piste. */
  get onFinal() { return this.landing; }

  /* Distance (m) et cap relatif (deg) vers le seuil d'atterrissage
     (extremite nord de la piste, on se pose vers le sud, cap 180). */
  static toRunway(ac) {
    const tx = RWY.x, tz = RWY.zEnd;
    const dx = tx - ac.pos.x, dz = tz - ac.pos.z;
    const dist = Math.hypot(dx, dz);
    const brg = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
    return { dist, rel: wrap180(brg - ac.heading) };
  }

  /* `inp` : entrees brutes du joueur { pitch, roll, yaw, throttle, brake }.
     Renvoie les commandes a appliquer. Peut aussi agir directement sur
     l'appareil (train, volets, spoilers) via ses methodes. */
  update(ac, inp, dt) {
    if (ac.heli) return heliCommand(ac, this, inp, dt);
    const ias = ac.ias * KTS;
    const agl = ac.pos.y - ac.groundY;
    const vs = ac.vel.y;
    const out = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 0 };
    const hdg = ac.heading;

    /* ---------------- Au sol ---------------- */
    if (ac.onGround) {
      /* Apres un poser (ou un vol termine) : freinage et arret. */
      if (ac.touchdown || this.landing) {
        this.landing = false;
        this.state = 'ROLLOUT';
        this.rolloutT += dt;
        ac.spoilers = true;
        ac.reverse = ias > 60 && !ac.noReverse;
        out.throttle = (ias > 60 && !ac.noReverse) ? 0.6 : 0;       // l'inverseur a besoin de gaz
        out.brake = ias > 25 ? 0.75 : 1;
        this._steerToCenterline(ac, out, 180, ias);
        this.hint = 'On freine ! Doucement...';
        this.pitchHold = null;
        return out;
      }

      ac.spoilers = false;
      ac.reverse = false;

      if (!this.launched) {
        this.state = 'PARKED';
        this.hint = 'Appuie sur DÉCOLLER !';
        out.brake = 1;
        return out;
      }

      /* Course au decollage vers le nord. */
      this.state = 'TAKEOFF';
      if (ac.flapIndex !== 2) ac.setFlaps(2);
      if (!ac.gearDown) ac.gearDown = true;
      out.throttle = 1;
      this._steerToCenterline(ac, out, 0, ias);
      const vr = ac.vRotate() * KTS;
      if (ias >= vr) {
        out.pitch = clamp(inp.pitch + 0.42, -1, 1);
        this.hint = 'On décolle !';
      } else {
        out.pitch = 0;
        this.hint = `Vitesse ${ias.toFixed(0)} / ${vr.toFixed(0)}`;
      }
      return out;
    }

    /* ---------------- En vol ---------------- */
    this.rolling = false;
    if (!this.launched) this.launched = true;      // pose sans DECOLLER (aide)

    /* Train et volets automatiques. */
    this._configure(ac, ias, agl, vs, dt);
    /* Planeur : largage de la corde de remorquage. */
    if (ac.glider && !ac.released && agl >= GLIDER_RELEASE) {
      ac.released = true;
      if (this.onRelease) this.onRelease();
    }

    /* --- Approche guidee ? (train sorti, cap sud, sur l'axe) --- */
    this.landing = this.finalLike(ac) && ac.gearDown && agl < 900;
    const stickPitch = Math.abs(inp.pitch) > 0.08;
    const stickRoll = Math.abs(inp.roll) > 0.08;

    /* --- Poussee --- */
    let vTarget;
    if (this.landing) {
      vTarget = ac.vRef() * KTS + 8;
    } else if (ac.glider) {
      vTarget = ac.released ? ac.speeds.cruise : ac.speeds.climb;
    } else if (agl < 700 && vs > 1) {
      vTarget = ac.speeds.climb;
    } else {
      vTarget = ac.speeds.cruise;
    }
    if (this.boost && !this.landing) vTarget = ac.speeds.boost;
    const err = vTarget - ias;
    const base = this.landing ? 0.30 : 0.55;
    let thrTarget = clamp(base + err * 0.03, this.landing ? 0.0 : 0.15, 1);
    if (this.flare) thrTarget = 0.22;
    if (this.boost) thrTarget = 1;
    const thrRate = this.boost ? 2.5 : 0.5;
    this.thr += clamp(thrTarget - this.thr, -dt * thrRate, dt * thrRate);
    if (ac.glider) this.thr = ac.released ? 0 : 1;      // planeur : plein « moteur » = corde tendue, puis rien
    out.throttle = this.thr;

    /* --- Roulis --- */
    /* Trajectoire sol (et non cap) : c'est elle qui compte pour rester sur
       l'axe de piste quand il y a du vent de travers. */
    const trk = (Math.atan2(ac.vel.x, -ac.vel.z) * 180 / Math.PI + 360) % 360;
    const SAFE = ac.safeAgl || SAFE_AGL;
    const low = agl < SAFE && !this.landing;      // trop bas pour virer serre
    let bankTarget = 0;
    if (stickRoll) {
      bankTarget = clamp(inp.roll * 32, -32, 32);
      this.hdgHold = null;
    } else if (this.landing) {
      const want = 180 + clamp((ac.pos.x - this.tx) * LAT_K, -18, 18);
      bankTarget = clamp(wrap180(want - trk) * LAT_G, -22, 22);
      this.hdgHold = null;
    } else {
      /* Cap tenu : l'avion continue tout droit apres un virage. */
      if (this.hdgHold == null) this.hdgHold = hdg;
      const gd = this._guideInfo(ac);
      if (gd) this.hdgHold = gd.bearing;      // aimant : on se laisse guider vers l'anneau
      bankTarget = clamp(wrap180(this.hdgHold - hdg) * 0.8, -20, 20);
    }
    if (low) bankTarget = clamp(bankTarget, -10, 10);
    const gain = ac.gain || { roll: 1, pitch: 1 };
    out.roll = clamp((bankTarget - ac.bankDeg) * 0.11 * gain.roll, -1, 1);
    if (Math.abs(ac.bankDeg) > 40) out.roll = clamp(-Math.sign(ac.bankDeg) * 0.8, -1, 1);

    /* --- Tangage --- */
    const pitch = ac.pitchDeg;
    if (this.landing && !stickPitch) {
      /* Plan de descente de 3 deg visant un point de poser 300 m apres le
         seuil (le seuil nord est a z = -1500, on roule vers +Z). */
      const dist = Math.max(0, this.zTouch - ac.pos.z);
      let hDesired = Math.tan(3 * Math.PI / 180) * dist;
      /* Planeur : pas de pente fixe a 3 deg (impossible a tenir face au vent) ; le plan est celui que la
         finesse SOL du moment permet (vitesse sol / 1,15 m/s de chute), avec 15 % de marge de hauteur. */
      if (ac.glider) hDesired = dist / clamp(Math.hypot(ac.vel.x, ac.vel.z) / 1.15, 6, 26) * 1.15;
      const e = agl - hDesired;
      /* Pente suivie par rapport au SOL : avec du vent de face, la vitesse air est
         bien plus grande que la vitesse sol et l'avion plongeait trop court. */
      const gs = Math.hypot(ac.vel.x, ac.vel.z);
      let vsTarget = clamp(-gs * Math.tan(3 * Math.PI / 180) - e * 0.05, -7, -0.3);
      if (agl < ac.flareAgl) {
        /* Arrondi : on ralentit la chute jusqu'au poser. */
        this.flare = true;
        vsTarget = clamp(-0.3 - agl * 0.04, -1.25, -0.3);
      } else {
        this.flare = false;
      }
      if (ac.glider && !this.flare) {
        /* Planeur : l'assiette tient la VITESSE (sans moteur on ne peut pas la regler autrement),
           et ce sont les aerofreins qui ajustent la pente (ouverts si on est trop haut). */
        const hw = Math.max(0, -ac.wind.z * KTS);            // vent de face (on pose vers le sud) : on vole plus vite pour garder de la finesse sol
        const vL = ac.vRef() * KTS + 8 + hw * 0.7;
        const tgt = clamp(1.5 + (ias - vL) * 0.6, -10, 14);
        out.pitch = clamp((tgt - pitch) * 0.16 * gain.pitch, -0.6, 0.6);
      } else {
        this._vsHold(ac, out, vsTarget, pitch);
      }
      if (ac.glider) ac.spoilers = !this.flare && (e > 12 || (ac.spoilers && e > 0));
      /* Terme integral sur l'ecart au plan : sans lui, un petit avion s'installe sous la pente
         (il chute a 2 m/s au lieu de 1) et se pose 500 m avant la piste. */
      if (!this.flare && !ac.glider) {
        this.vsI = clamp(this.vsI - e * dt * 0.002, -0.25, 0.25);
        out.pitch = clamp(out.pitch + this.vsI, -0.6, 0.6);
      }
      this.state = this.flare ? 'FLARE' : 'APPROACH';
      this.hint = this.flare ? 'Arrondi...' : 'Descente vers la piste : tout est automatique !';
    } else {
      this.flare = false;
      this.vsI = 0;
      this.state = agl < 700 && vs > 0.5 ? 'CLIMB' : 'FLIGHT';
      if (stickPitch) {
        out.pitch = clamp(inp.pitch, -1, 1);
        this.pitchHold = null;
      } else {
        if (this.pitchHold == null) {
          /* En montee basse on garde au moins 8 deg : sinon l'appareil
             tient une pente ridicule des qu'on lache le manche. */
          this.pitchHold = clamp(agl < 900 && vs > 0 ? Math.max(pitch, 8) : pitch, -6, 12);
        }
        if (agl > CEILING_AGL && this.pitchHold > 0) this.pitchHold = 0;
        const gd2 = this._guideInfo(ac);
        if (gd2) {
          /* Angle de pente voulu vers l'anneau, converti en assiette. */
          const gam = Math.atan2(vs, Math.hypot(ac.vel.x, ac.vel.z) || 1) * 180 / Math.PI;
          this.pitchHold = clamp(pitch + (gd2.slope - gam), -5, 14);
        }
        /* Protection : trop lent -> on baisse le nez. */
        const stallMargin = ias - ac.stallSpeed() * KTS * 1.18;
        let target = this.pitchHold;
        /* Planeur : on tient la vitesse par l'assiette (plus vite = on cabre, plus lent = on pique). */
        if (ac.glider) target = clamp(1.5 + (ias - vTarget) * 0.32, -9, 14);
        if (stallMargin < 0) target = Math.min(target, 2 + stallMargin * 0.4);
        out.pitch = clamp((target - pitch) * 0.09 * gain.pitch, -0.6, 0.6);
      }
      this.hint = '';
    }
    /* Reste du joueur : inputs de tangage ajoutes au maintien. */
    if (this.landing && stickPitch) out.pitch = clamp(inp.pitch, -1, 1);

    /* Altitude de securite : hors approche, on ne descend pas sous
       SAFE_AGL. Le manche vers l'avant ne fait plus piquer vers le sol. */
    if (ac.glider && !this.landing && !ac.onGround && agl < GLIDER_LOW && ac.released) {
      if (this.onLowGlider) this.onLowGlider();
    } else if (!this.landing && !ac.onGround) {
      if (agl < SAFE) {
        const sink = -vs;
        if (sink > -1 && out.pitch < 0.1) out.pitch = Math.max(out.pitch, clamp((3 - pitch) * 0.1, 0, 0.5));
        if (agl < SAFE * 0.6 && vs < 0) out.pitch = Math.max(out.pitch, 0.5);
      }
    }
    /* Protection : gard-fou sur l'assiette extreme. */
    if (pitch > 16 && out.pitch > 0) out.pitch = 0;
    if (pitch < -14 && out.pitch < 0) out.pitch = 0;
    return out;
  }

  /* Direction et pente vers l'anneau, s'il est devant et assez proche. */
  _guideInfo(ac) {
    const g = this.guide;
    if (!g) return null;
    const dx = g.x - ac.pos.x, dz = g.z - ac.pos.z, dy = g.y - ac.pos.y;
    const hd = Math.hypot(dx, dz);
    if (hd > 900 || hd < 25) return null;
    const bearing = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
    if (Math.abs(wrap180(bearing - ac.heading)) > 65) return null;   // derriere : on laisse tomber
    return { bearing, slope: Math.atan2(dy, hd) * 180 / Math.PI, y: g.y };
  }

  /* L'appareil est-il aligne a peu pres sur la finale (cap sud, proche
     de l'axe, avant la fin de piste) ? */
  finalLike(ac) {
    const hdg = ac.heading;
    const okHdg = Math.abs(wrap180(180 - hdg)) < 50;
    const okX = Math.abs(ac.pos.x) < 900;
    const okZ = ac.pos.z < RWY.zStart - 300 && ac.pos.z > RWY.zEnd - 9000;
    if (okHdg && okX && okZ) { this.tx = 0; this.zTouch = Z_TOUCH; return true; }
    /* G06 : pistes d'ile. Couloir etroit (±100 m) pour ne pas detourner un vol qui passe par la. */
    if (okHdg && this.strips) {
      for (const st of this.strips) {
        const zt = st.zN + 20;
        if (Math.abs(ac.pos.x - st.x) < 100 && ac.pos.z < zt + 700 && ac.pos.z > zt - 3600) {
          this.tx = st.x; this.zTouch = zt;
          return true;
        }
      }
    }
    return false;
  }

  /* Maintien de l'axe de piste au roulage. */
  _steerToCenterline(ac, out, rwyHdg, ias) {
    const sign = rwyHdg === 0 ? -1 : 1;
    const targetHdg = rwyHdg + sign * clamp((ac.pos.x - this.tx) * 0.06, -8, 8);
    const err = wrap180(targetHdg - ac.heading);
    out.yaw = clamp(err * 0.08, -0.6, 0.6);
    if (ias > 60) out.yaw *= 0.5;
  }

  /* Tenue de vitesse verticale par la gouverne de profondeur. */
  _vsHold(ac, out, vsTarget, pitch) {
    /* Assiette souhaitee = fonction de l'ecart de vitesse verticale. */
    const gain = this.flare ? 7 : 0.9;
    const pitchTarget = clamp(pitch + (vsTarget - ac.vel.y) * gain, -8, this.flare ? 12 : 10);
    out.pitch = clamp((pitchTarget - pitch) * 0.12 * ((ac.gain || { pitch: 1 }).pitch), -0.5, 0.5);
  }

  /* Train et volets. */
  _configure(ac, ias, agl, vs, dt) {
    this.gearTimer += dt;
    const wantDown = this.finalLike(ac) && agl < 500 && vs < 1;
    const wantUp = agl > 160 && vs > 0.5 && !wantDown;
    if (!ac.fixedGear) {
      if (wantDown && !ac.gearDown && ias < 250) ac.toggleGear();
      if (wantUp && ac.gearDown && ias < 250) ac.toggleGear();
    }

    /* Volets : on choisit le cran le plus grand autorise a cette vitesse,
       avec un cran mini selon la phase. */
    let want = 0;
    if (this.landing) want = agl < 300 ? 4 : 3;
    else if (wantDown) want = 3;
    else if (agl < 150) want = 2;
    else want = 0;
    // respecte la vitesse maxi de chaque cran
    want = Math.min(want, ac.maxFlap);
    while (want > 0 && ias > (ac.constructor.FLAP_LIMITS ? ac.constructor.FLAP_LIMITS[want] : [999, 230, 200, 185, 175][want]) - 4) want--;
    if (want !== ac.flapIndex && this.gearTimer > 0.5) {
      this.gearTimer = 0;
      ac.setFlaps(ac.flapIndex + Math.sign(want - ac.flapIndex));
    }
  }
}
