/* ============================================================
   fleet.js — Les avions du hangar (mode Arcade, vague 2)

   Chaque appareil est un PROFIL : des coefficients pour le moteur
   de vol (flightPhysics.js, voir Aircraft.applyProfile), des vitesses
   pour l'aide au pilotage (flightAssist.js) et quelques reglages de
   camera et d'economie. Le jet de ligne est le profil par defaut
   (phys: null) ; il reste l'avion de l'aeroport (cabine, atelier).

   Pur data : aucune dependance au DOM ni a Three.js, donc testable
   hors navigateur (tools/fleet.sim.mjs).
   ============================================================ */

export const PLANES = {
  liner: {
    id: 'liner', name: 'Jet de ligne', ico: '✈️', level: 1, price: 0,
    blurb: 'Gros, stable et plein de passagers.',
    stars: { ease: 5, fun: 3, speed: 4 },
    seats: 140, income: 1, fuel: 9000,
    camScale: 1, camMode: 'chase',
    phys: null,
    gain: { roll: 1, pitch: 1 }
  },

  pioupiou: {
    id: 'pioupiou', name: 'Pioupiou', ico: '🛩️', level: 1, price: 0,
    blurb: 'Petit avion a helice : doux, facile, parfait pour apprendre.',
    stars: { ease: 5, fun: 4, speed: 2 },
    seats: 2, income: 0.4, fuel: 100,
    camScale: 0.42, camMode: 'chase',
    phys: {
      S: 16.2, b: 10.9, c: 1.55, oswald: 0.8,
      emptyMass: 650, payload: 180, fuelCap: 120,
      Ipitch: 1400, Iyaw: 2300, Iroll: 1000,
      CL0: 0.25, CLa: 5.0, alphaStall: 0.30, CD0: 0.034,
      Cm0: 0.03, Cma: -1.3, Cmq: -28, Cme: 0.30,
      Clda: 0.080, Clp: -0.5, Clb: -0.1,
      Cnb: 0.12, Cnr: -0.25, Cndr: 0.04, Cnda: -0.01,
      engines: 1, thrustPerEngine: 3500, sfc: 2.5e-6,
      gearK: 5.5e4, gearC: 9500,
      gear: [
        { name: 'nose', p: [0, -1.45, -1.65], steer: true },
        { name: 'left', p: [-1.15, -1.5, 0.25], brake: true },
        { name: 'right', p: [1.15, -1.5, 0.25], brake: true }
      ],
      groundY: 1.43, maxFlap: 2, fixedGear: true, noReverse: true,
      rateDamping: 3.2, propVmax: 92, vne: 165, flareAgl: 7, stuntMinKt: 75,
      speeds: { climb: 82, cruise: 100, boost: 128 }
    },
    gain: { roll: 0.7, pitch: 0.8 }
  },

  zebulon: {
    id: 'zebulon', name: 'Zebulon', ico: '🛩️', level: 3, price: 150,
    blurb: 'Avion de voltige : vif, rapide, il adore les tonneaux !',
    stars: { ease: 3, fun: 5, speed: 4 },
    seats: 1, income: 0.5, fuel: 80,
    camScale: 0.4, camMode: 'chase',
    phys: {
      S: 11.0, b: 7.9, c: 1.45, oswald: 0.85,
      emptyMass: 520, payload: 90, fuelCap: 90,
      Ipitch: 700, Iyaw: 1000, Iroll: 500,
      CL0: 0.12, CLa: 5.0, alphaStall: 0.30, CD0: 0.027,
      Cm0: 0.03, Cma: -1.3, Cmq: -26, Cme: 0.34,
      Clda: 0.12, Clp: -0.5, Clb: -0.1,
      Cnb: 0.12, Cnr: -0.25, Cndr: 0.04, Cnda: -0.01,
      engines: 1, thrustPerEngine: 5300, sfc: 3e-6,
      gearK: 4.6e4, gearC: 7500,
      gear: [
        { name: 'nose', p: [0, -1.35, -1.5], steer: true },
        { name: 'left', p: [-1.05, -1.4, 0.2], brake: true },
        { name: 'right', p: [1.05, -1.4, 0.2], brake: true }
      ],
      groundY: 1.33, maxFlap: 2, fixedGear: true, noReverse: true,
      rateDamping: 3.2, propVmax: 125, vne: 215, flareAgl: 7, stuntMinKt: 95,
      speeds: { climb: 115, cruise: 145, boost: 185 }
    },
    gain: { roll: 0.45, pitch: 0.6 }
  }
};

export const PLANE_IDS = Object.keys(PLANES);
export const planeOf = (id) => PLANES[id] || PLANES.liner;
