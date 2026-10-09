/* ============================================================
   renderAircraft.js — Avions : modele articule, flotte, livrees, usure
   (decoupe de renderer3d.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import * as THREE from 'three';
import * as TEX from './textures.js?v=1791575411';
import { LIGHT_GAIN } from './environment.js?v=1791575411';
import { buildCockpit } from './cockpit.js?v=1791575411';
import * as AF from './airframe.js?v=1791575411';
import { LiveryRig } from './livery.js?v=1791575411';
import { buildPlaneModel } from './planeModels.js?v=1791575411';
import { pbr } from './renderShared.js?v=1791575411';

export const aircraftMethods = {
  /* Silhouette d'appareil simplifiee (non pilotable) pour peupler les
     autres postes de l'aeroport sans alourdir la scene. */
  buildStaticAircraft(parent, pos, headingDeg) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = -headingDeg * Math.PI / 180;

    const bodyMat = pbr(TEX.skin(), { color: 0xffffff, rough: 0.36, metal: 0.15, repeat: [1, 1] });
        const accentMat = pbr(TEX.livery(), { color: 0xffffff, rough: 0.32, metal: 0.2, repeat: [1, 1] });

        /* Meme cellule que l'appareil du joueur (airframe.js), reduite a 70 %
           pour rester dans l'emprise des anciens postes de stationnement. */
        const radomeMat = pbr(TEX.metal(), { color: 0xc9ced6, rough: 0.5, metal: 0.25, repeat: [1, 1] });
        const darkMat = pbr(TEX.metal(), { color: 0x3a424c, rough: 0.55, metal: 0.45, repeat: [2, 2] });
        const metalMat = pbr(TEX.metal(), { color: 0xb8c0ca, rough: 0.32, metal: 0.85, repeat: [2, 2] });
        const tireMat = pbr(TEX.tire(), { color: 0x2a2d33, rough: 0.95, repeat: [1, 1] });
        const shell = new THREE.Group();
        const { fus, nose } = AF.makeFuselage(bodyMat, radomeMat);
        shell.add(fus, nose);
        const winBand = new THREE.Mesh(
          new THREE.CylinderGeometry(1.985, 1.985, 19, 32, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
          pbr(TEX.windows(), {
            color: 0xffffff, rough: 0.15, metal: 0.4,
            transparent: true, side: THREE.DoubleSide, repeat: [1, 1]
          })
        );
        winBand.rotation.x = Math.PI / 2;
        winBand.rotation.y = Math.PI;
        winBand.position.set(0, 0.42, 0);
        shell.add(winBand);
        const { wingL, wingR } = AF.makeWings(bodyMat);
        shell.add(wingL, wingR, AF.makeWinglets(accentMat));
        const tail = AF.makeTail(bodyMat, accentMat);
        tail.elevator.position.set(...AF.TAIL.elev);
        tail.rudder.position.set(...AF.TAIL.rud);
        shell.add(tail.fin, tail.stab, tail.elevator, tail.rudder);
        [-1, 1].forEach(sd => {
          const eg = AF.makeNacelle(bodyMat, darkMat, metalMat);
          eg.position.set(sd * 6.6, -2.0, -0.8);
          shell.add(eg);
        });
        shell.add(AF.makeStaticGear({ tireMat, metalMat, darkMat, bodyMat }));
        shell.scale.setScalar(0.7);
        shell.position.y = -3.45 * 0.3;
        g.add(shell);

    parent.add(g);
    return g;
  },
  /* ---------------------------------------------------------- */
  buildAircraft() {
    const group = new THREE.Group();

    /* Peau : blanc de fuselage avec panneaux, rivets et coulures.
       Le metalness reste bas (0.15) car une livree est peinte, mais
       la rugosite basse redonne le brillant d'un avion neuf. */
    const skinSet = TEX.skin();
    const bodyMat = pbr(skinSet, { color: 0xffffff, rough: 0.34, metal: 0.15, repeat: [1, 1] });
    const accentMat = pbr(TEX.livery(), { color: 0xffffff, rough: 0.30, metal: 0.20, repeat: [1, 1] });
    const darkMat = pbr(TEX.metal(), { color: 0x3a424c, rough: 0.55, metal: 0.45, repeat: [2, 2] });
      const metalMat = pbr(TEX.metal(), { color: 0xb8c0ca, rough: 0.32, metal: 0.85, repeat: [2, 2] });
      const tireMat = pbr(TEX.tire(), { color: 0x2a2d33, rough: 0.95, repeat: [1, 1] });

    /* --- Fuselage : revolution a profil reel (airframe.js) --- */
    const radomeMat = pbr(TEX.metal(), { color: 0xc9ced6, rough: 0.5, metal: 0.25, repeat: [1, 1] });
    const { fus, nose } = AF.makeFuselage(bodyMat, radomeMat);
    group.add(fus, nose);

    /* Bande de couleur */
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.97, 1.97, 22, 24, 1, true, 0, Math.PI), accentMat);
    stripe.rotation.x = Math.PI / 2;
    stripe.rotation.y = Math.PI;
    stripe.position.set(0, -0.35, -2);
    stripe.scale.set(1, 1, 0.22);
    group.add(stripe);

    /* Bandeau de hublots : cylindre ouvert a transparence, pose
       juste au-dessus de la bande de couleur. C'est ce qui donne
       immediatement l'echelle d'un avion de ligne. */
    const winBand = new THREE.Mesh(
      new THREE.CylinderGeometry(1.985, 1.985, 19, 32, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
      pbr(TEX.windows(), {
        color: 0xffffff, rough: 0.15, metal: 0.4,
        transparent: true, side: THREE.DoubleSide, repeat: [1, 1]
      })
    );
    winBand.rotation.x = Math.PI / 2;
    winBand.rotation.y = Math.PI;
    winBand.position.set(0, 0.42, 0.0);
    group.add(winBand);

    /* Portes de soute et de cabine : panneaux affleurants. */
    const doorMat = pbr(TEX.metal(), { color: 0xdde3ea, rough: 0.4, metal: 0.3, repeat: [1, 1] });
    [[-1, -6.0], [-1, 6.4], [1, -6.0], [1, 6.4]].forEach(([s, dz]) => {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.9, 1.5), doorMat);
      d.position.set(s * 1.94, -0.35, dz);
      group.add(d);
    });

    /* Cockpit : verriere exterieure (le poste interieur est dans cockpit.js) */
    const cockpit = buildCockpit();
    group.add(cockpit.group);
    /* Vitres du poste de pilotage, posees sur le nez : deux panneaux de
       pare-brise et une vitre laterale de chaque cote. */
    const noseWindows = new THREE.Group();
    {
      const glass = pbr(null, { color: 0x0b1b2b, rough: 0.05, metal: 0.92, envMapIntensity: 1.4 });
      const frameM = pbr(null, { color: 0x14181d, rough: 0.6, metal: 0.3 });
      const specs = [
        [0.34, -16.9, 0.62, 0.36], [-0.34, -16.9, 0.62, 0.36],     // pare-brise
        [0.98, -16.3, 0.55, 0.32], [-0.98, -16.3, 0.55, 0.32]      // vitres laterales
      ];
      specs.forEach(([phi, z, w, h]) => {
        const r = AF.fuselageRadius(z);
        const dr = (AF.fuselageRadius(z + 0.05) - AF.fuselageRadius(z - 0.05)) / 0.1;
        const slope = Math.atan(dr);
        const N = new THREE.Vector3(Math.sin(phi) * Math.cos(slope), Math.cos(phi) * Math.cos(slope), -Math.sin(slope));
        const P = new THREE.Vector3(Math.sin(phi) * r, Math.cos(phi) * r, z);
        [[w + 0.07, h + 0.07, frameM, 0.012], [w, h, glass, 0.024]].forEach(([pw, ph, m, off]) => {
          const pane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), m);
          pane.position.copy(P).addScaledVector(N, off);
          pane.lookAt(pane.position.clone().add(N));
          noseWindows.add(pane);
        });
      });
      group.add(noseWindows);
    }

    /* Carenage de raccord voilure / fuselage (ventre) : cache l'emplanture
       et donne la quille caracteristique d'un avion a aile basse. */
    const wind = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), bodyMat);
    wind.scale.set(2.02, 0.72, 5.6);
    wind.position.set(0, -1.5, 1.1);
    group.add(wind);

    /* --- Voilure : loft de profils (airframe.js) --- */
    const { wingL, wingR } = AF.makeWings(bodyMat);
    group.add(wingL, wingR);
    group.add(AF.makeWinglets(accentMat));

    /* --- Volets (animes) : deux par cote, charniere alignee sur la fleche --- */
    const flaps = [];
    [-1, 1].forEach(s => {
      const f = AF.makeControlSurface({ side: s, x0: 2.7, x1: 12.2, back: 1.25, chord: 1.55, mat: bodyMat, yTop: -0.04 });
      group.add(f.pivot);
      flaps.push(f.pivot);
    });

    /* --- Ailerons (animes) --- */
    const ailerons = [];
    [-1, 1].forEach(s => {
      const a = AF.makeControlSurface({ side: s, x0: 12.7, x1: 16.3, back: 0.85, chord: 1.05, thick: 0.11, mat: bodyMat, yTop: -0.03 });
      group.add(a.pivot);
      ailerons.push(a.pivot);
    });

    /* --- Spoilers (animes) : sur l'extrados, devant les volets --- */
    const spoilers = [];
    [-1, 1].forEach(s => {
      const sp = AF.makeControlSurface({ side: s, x0: 4.4, x1: 11.6, back: 2.75, chord: 1.3, thick: 0.08, mat: darkMat, yTop: 0.17 });
      group.add(sp.pivot);
      spoilers.push(sp.pivot);
    });

    /* --- Empennage --- */
    const tail = AF.makeTail(bodyMat, accentMat);
    group.add(tail.fin, tail.stab);

    /* Gouverne de profondeur (animee) */
    const elevPivot = new THREE.Group();
    elevPivot.position.set(...AF.TAIL.elev);
    elevPivot.add(tail.elevator);
    group.add(elevPivot);

    /* Gouverne de direction (animee) */
    const rudPivot = new THREE.Group();
    rudPivot.position.set(...AF.TAIL.rud);
    rudPivot.add(tail.rudder);
    group.add(rudPivot);

        /* --- Details de cellule : APU, antennes, balais statiques --- */
        const apu = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.7, 12), darkMat);
        apu.rotation.x = Math.PI / 2;
        apu.position.set(0, 1.5, 16.45);
        group.add(apu);

        const antennaMat = pbr(TEX.metal(), { color: 0xd8dee6, rough: 0.4, metal: 0.6, repeat: [1, 1] });
        const vhf = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.5), antennaMat);
        vhf.position.set(0, 2.1, 6.5);
        group.add(vhf);
        const gps = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), antennaMat);
        gps.position.set(0, 2.05, 2.0);
        group.add(gps);

        /* Balais statiques : 3 par aile + 2 sur l'empennage. */
        const wickMat = new THREE.MeshBasicMaterial({ color: 0x2b3038 });
        const wickGeo = new THREE.BoxGeometry(0.05, 0.05, 0.7);
        [-1, 1].forEach(s => {
          [10.5, 13.5, 16.2].forEach(wx => {
            const w = new THREE.Mesh(wickGeo, wickMat);
            w.position.set(s * wx, AF.wingY(wx), AF.wingTE(wx) + 0.3);
            group.add(w);
          });
        });
        [-1, 1].forEach(s => {
          const w = new THREE.Mesh(wickGeo, wickMat);
          w.position.set(s * 6.4, 1.05, 14.0);
          group.add(w);
        });

    /* --- Reacteurs --- */
    const fans = [];
    const engines = [];
    [-1, 1].forEach(s => {
      const eg = new THREE.Group();
      /* Garde au sol : bas de nacelle a y = -3.15, roues a -3.45 */
      eg.position.set(s * 6.6, -2.00, -0.8);

      eg.add(AF.makeNacelle(bodyMat, darkMat, metalMat));

      /* Disque de soufflante : texture radiale + aubes en relief. */
      const fanGeo = new THREE.CylinderGeometry(0.92, 0.92, 0.2, 24);
      const fan = new THREE.Mesh(fanGeo, pbr(TEX.fanDisc(), { color: 0xffffff, rough: 0.35, metal: 0.8, repeat: [1, 1] }));
      fan.rotation.x = Math.PI / 2;
      fan.position.z = -1.9;
      eg.add(fan);
      fans.push(fan);

      /* Aubes pour voir la rotation */
      for (let i = 0; i < 14; i++) {
        const bl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.78, 0.06), metalMat);
        bl.position.set(Math.cos(i / 14 * 6.283) * 0.5, Math.sin(i / 14 * 6.283) * 0.5, 0);
        bl.rotation.z = i / 14 * 6.283;
        fan.add(bl);
      }
      /* Ogive centrale (tourne avec la soufflante) */
      const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 16), metalMat);
      spinner.rotation.x = Math.PI;
      spinner.position.y = -0.3;
      fan.add(spinner);

      group.add(eg);
      engines.push(eg);
    });

    /* --- Trains d'atterrissage (animes) --- */
    const gearMats = { tireMat, metalMat, darkMat, bodyMat };
    const makeGear = (x, y, z, legLen, wheelR, wheels, nose = false) =>
      AF.makeGear({ x, y, z, legLen, wheelR, wheels, nose, mats: gearMats });

    /* jambe + rayon de roue = distance au point de contact utilise par la physique */
    const gNose = makeGear(0, -1.60, -11.5, 1.28, 0.42, 2, true);
    const gLeft = makeGear(-3.8, -1.60, 1.8, 1.27, 0.58, 2);
    const gRight = makeGear(3.8, -1.60, 1.8, 1.27, 0.58, 2);
    [gNose, gLeft, gRight].forEach(g => group.add(g.pivot));

    /* --- Phares / feux --- */
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), beaconMat);
    beacon.position.set(0, 2.15, 1.5);
    group.add(beacon);

    const navL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
    navL.position.set(-17.1, AF.wingY(17) + 0.05, 6.5); group.add(navL);
    const navR = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), new THREE.MeshBasicMaterial({ color: 0x2dff6a }));
    navR.position.set(17.1, AF.wingY(17) + 0.05, 6.5); group.add(navR);

        /* Feux a eclats (strobe) : deux eclairs blancs par cycle, aux
           saumons. Ils ne s'allument qu'en vol ou la nuit. */
        const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const strobeL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), strobeMat);
        strobeL.position.set(-17.0, AF.wingY(17) + 0.05, 7.7); group.add(strobeL);
        const strobeR = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), strobeMat);
        strobeR.position.set(17.0, AF.wingY(17) + 0.05, 7.7); group.add(strobeR);

        /* Feu de queue : blanc, allume en permanence. */
        const tailLight = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5),
          new THREE.MeshBasicMaterial({ color: 0xf5f5f5 }));
        tailLight.position.set(0, 1.9, 16.35); group.add(tailLight);

        const landingLight = new THREE.SpotLight(0xfff6e0, 0, 900, 0.30, 0.55, 1.2);
        landingLight.position.set(0, -1.2, -10);
        const lt = new THREE.Object3D();
        lt.position.set(0, -6, -260);
        group.add(lt);
        landingLight.target = lt;
        group.add(landingLight);

        /* Phare d'atterrissage : deux lampes d'ailes, allumees la nuit
           ou sous 3000 ft. Elles eclairent reellement la piste. */
        const wingLightL = new THREE.SpotLight(0xfff6e0, 0, 260, 0.42, 0.6, 1.4);
        wingLightL.position.set(-9, -0.6, -2);
        const wlt = new THREE.Object3D();
        wlt.position.set(-9, -14, -120);
        group.add(wlt);
        wingLightL.target = wlt;
        group.add(wingLightL);
        const wingLightR = wingLightL.clone();
        wingLightR.position.set(9, -0.6, -2);
        const wrt = new THREE.Object3D();
        wrt.position.set(9, -14, -120);
        group.add(wrt);
        wingLightR.target = wrt;
        group.add(wingLightR);

    /* --- Escalier d'embarquement (porte cabine avant gauche) ---
       Attache a l'appareil : il suit l'avion partout ou il se gare.
       L'escalier et la passerelle mobile desservent la meme porte :
       on masque l'un quand l'autre est en service (updateJetBridge). */
    const stairMat = pbr(TEX.metal(), { color: 0xcbd5e1, rough: 0.45, metal: 0.6, repeat: [1, 2] });
    /* --- Escalier d'embarquement, aligne sur la porte cabine ---
       La porte est percee dans la paroi gauche de la cabine (x = -1.72),
       sur z -6.9..-5.1, et le plancher cabine est a y = -0.62 dans le
       repere avion. L'escalier descend de la porte vers l'exterieur. */
    const stairs = new THREE.Group();
    stairs.position.set(-1.72, 0, -6.0);
    stairs.rotation.y = Math.PI / 2;
    /* L'escalier et la passerelle mobile desservent la meme porte : on
       masque l'un quand l'autre est en service (voir updateJetBridge). */
    this.boardingStairs = stairs;
    const stepRise = 0.125, stepRun = 0.245;
    for (let i = 0; i < 8; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, stepRun + 0.04), stairMat);
      step.position.set(0, -0.62 - (i + 1) * stepRise, -(i + 0.5) * stepRun);
      stairs.add(step);
    }
    const stairRail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.25, 0.07), stairMat);
    stairRail.position.set(-0.58, -0.12, -0.98);
    stairRail.rotation.x = Math.atan2(8 * stepRise, 8 * stepRun);
    stairs.add(stairRail);
    const stairRail2 = stairRail.clone();
    stairRail2.position.x = 0.58;
    stairs.add(stairRail2);
    group.add(stairs);

    /* --- Echelle d'acces au poste de pilotage ---
       Le plancher cabine est a y = -0.62 dans le repere avion, et la
       cloison interieure a x = +/-1.72 : l'echelle se dresse depuis
       l'allee, contre la cloison, et debouche sous le plafond (2.3). */
    const ladderMat = pbr(TEX.metal(), { color: 0x94a3b8, rough: 0.5, metal: 0.6, repeat: [1, 2] });
    const ladder = new THREE.Group();
    ladder.position.set(-1.38, -0.62, -13.2);
    const railGeo = new THREE.CylinderGeometry(0.035, 0.035, 2.2, 6);
    [-0.28, 0.28].forEach(rx => {
      const rail = new THREE.Mesh(railGeo, ladderMat);
      rail.position.set(rx, 1.1, 0);
      rail.rotation.x = -0.12;
      ladder.add(rail);
    });
    for (let i = 0; i < 8; i++) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), ladderMat);
      rung.rotation.z = Math.PI / 2;
      rung.position.set(0, 0.25 + i * 0.28, -i * 0.035);
      ladder.add(rung);
    }
    group.add(ladder);

    /* --- Cache-moteur / trappe de soute (detail visuel) --- */
    const cargoOutline = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6),
      new THREE.MeshBasicMaterial({ color: 0x24548a, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
    cargoOutline.rotation.y = Math.PI / 2;
    cargoOutline.position.set(1.94, -1.1, 5.5);
    group.add(cargoOutline);

        /* --- Lignes de joint et rivets --------------------------------
           Une cellule d'avion de ligne est un patchwork de panneaux. Sans
           ces traits, le fuselage reste un tube lisse et parait en
           plastique. On les dessine en decalques tres fins (MeshBasicMaterial
           a faible opacite) : aucun cout d'eclairage, et ils suivent la
           courbure du fuselage puisqu'ils sont poses sur des cylindres
           concentriques.

           Tout est regroupe dans `skinDetail` : ce groupe est ajoute a
           `hull`, donc masque en vue cockpit et en cabine, ou ces
           decalques exterieurs n'ont rien a faire. */
        const skinDetail = new THREE.Group();
        const seamMat = new THREE.MeshBasicMaterial({
          color: 0x6b7480, transparent: true, opacity: 0.30, depthWrite: false, side: THREE.DoubleSide
        });
        const rivetMat = new THREE.MeshBasicMaterial({
          color: 0x8b939d, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide
        });
        /* Joints circonferentiels : un anneau tous les 2,6 m. Instancies :
           onze anneaux pour un seul appel de dessin. */
        const ringGeo = new THREE.CylinderGeometry(1.958, 1.958, 0.045, 24, 1, true);
        const ringZ = [];
        for (let z = -12; z <= 9; z += 2.6) ringZ.push(z);
        const rings = new THREE.InstancedMesh(ringGeo, seamMat, ringZ.length);
        {
          const m = new THREE.Matrix4(), q = new THREE.Quaternion();
          q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
          const s1 = new THREE.Vector3(1, 1, 1);
          ringZ.forEach((z, i) => {
            m.compose(new THREE.Vector3(0, 0, z), q, s1);
            rings.setMatrixAt(i, m);
          });
          rings.instanceMatrix.needsUpdate = true;
          rings.frustumCulled = false;
          skinDetail.add(rings);
        }
        /* Joints longitudinaux : quatre lignes courant sur la longueur.
           Chacune a un `thetaStart` different, donc une geometrie propre :
           quatre appels de dessin, negligeable. */
        for (const a of [0.35, 1.35, 2.35, 3.35]) {
          const line = new THREE.Mesh(
            new THREE.CylinderGeometry(1.958, 1.958, 22, 24, 1, true, a, 0.012), seamMat);
          line.rotation.x = Math.PI / 2;
          line.position.z = -2;
          skinDetail.add(line);
        }
        /* Rivets : deux couronnes de petits points de part et d'autre de
           la bande de hublots, la ou les panneaux sont les plus nombreux. */
        for (const y of [1.05, -0.95]) {
          const x = Math.sqrt(Math.max(0.01, 1.958 * 1.958 - y * y));
          for (const sd of [-1, 1]) {
            const row = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 22), rivetMat);
            row.position.set(sd * x, y, -2);
            skinDetail.add(row);
          }
        }

        /* --- Prises statiques, capteurs et antennes ------------------- */
        const probeMat = pbr(TEX.metal(), { color: 0xd8dde3, rough: 0.3, metal: 0.8, repeat: [1, 1] });
        /* Tube de Pitot de nez. */
        const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.1, 8), probeMat);
        pitot.rotation.x = Math.PI / 2;
        pitot.position.set(0, 0.0, -20.6);
        skinDetail.add(pitot);
        /* Prises statiques : deux plots lateraux. */
        for (const s of [-1, 1]) {
          const port = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 8), probeMat);
          port.rotation.z = Math.PI / 2;
          port.position.set(s * 1.94, 0.15, -11.5);
          skinDetail.add(port);
        }
        /* Antennes : une lame dorsale et une lame ventrale. */
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 1.5), probeMat);
        blade.position.set(0, 1.95, 6.5);
        skinDetail.add(blade);
        const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 1.1), probeMat);
        blade2.position.set(0, -1.95, 2.0);
        skinDetail.add(blade2);
        /* Eclairage de logo : petit carre lumineux sur le cote. */
        for (const s of [-1, 1]) {
          const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5),
            new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
          logo.rotation.y = s * Math.PI / 2;
          logo.position.set(s * 1.96, 0.9, 9.5);
          skinDetail.add(logo);
        }

        /* --- Immatriculation et drapeau ------------------------------- */
        const regMat = new THREE.MeshBasicMaterial({
          color: 0x1b2430, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide
        });
        /* « F- » + 4 lettres, dessinees en petits rectangles : lisible de
           loin sans dependre d'une police de caracteres. */
        const regGlyphs = [
          [0, 1, 1, 0, 1, 1, 0, 1, 1],   // F
          [1, 1, 1, 1, 0, 0, 1, 1, 1],   // G
          [1, 0, 1, 1, 1, 1, 1, 0, 1],   // H
          [1, 1, 1, 1, 0, 0, 1, 0, 0],   // P
          [1, 1, 1, 0, 1, 0, 0, 1, 0]    // Y
        ];
        for (const s of [-1, 1]) {
          const cells = [];
          regGlyphs.forEach((glyph, gi) => {
            glyph.forEach((on, ci) => {
              if (!on) return;
              cells.push([s * 1.965, 0.05 + (2 - Math.floor(ci / 3)) * 0.24, 11.4 + gi * 0.42 + (ci % 3) * 0.19]);
            });
          });
          const glyphGeo = new THREE.PlaneGeometry(0.16, 0.22);
          const glyphs = new THREE.InstancedMesh(glyphGeo, regMat, cells.length);
          const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s * Math.PI / 2);
          cells.forEach(([x, y, z], i) => {
            m.compose(new THREE.Vector3(x, y, z), q, s1);
            glyphs.setMatrixAt(i, m);
          });
          glyphs.instanceMatrix.needsUpdate = true;
          glyphs.frustumCulled = false;
          skinDetail.add(glyphs);
        }

        /* --- Details de voilure : joints de panneaux et becs de bord
           d'attaque, poses sur la voilure loftee (extrados). --- */
        for (const s of [-1, 1]) {
          /* Becs de bord d'attaque : bande claire suivant la fleche. */
          const slatMat = seamMat;
          for (const [x0, x1] of [[1.9, 8.6], [9.2, 16.2]]) {
            const len = (x1 - x0) / Math.cos(Math.atan((AF.wingLE(x1) - AF.wingLE(x0)) / (x1 - x0)));
            const slat = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.05), slatMat);
            const xm = (x0 + x1) / 2;
            slat.position.set(s * xm, AF.wingY(xm) + 0.07, AF.wingLE(xm) + 0.55);
            slat.rotation.y = -s * Math.atan((AF.wingLE(x1) - AF.wingLE(x0)) / (x1 - x0));
            skinDetail.add(slat);
          }
          /* Joints de panneaux : lignes transversales sur l'extrados. */
          for (const x of [3.4, 6.0, 8.6, 11.2, 13.8]) {
            const zA = AF.wingLE(x) + 0.5, zB = AF.wingTE(x) - 1.0;
            const seam = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, zB - zA), seamMat);
            seam.position.set(s * x, AF.wingY(x) + 0.14, (zA + zB) / 2);
            skinDetail.add(seam);
          }
        }

        /* --- Nacelles : ligne de separation capot / inverseur ---------- */
        for (const s of [-1, 1]) {
          const split = new THREE.Mesh(new THREE.CylinderGeometry(1.275, 1.275, 0.05, 24, 1, true), seamMat);
          split.rotation.x = Math.PI / 2;
          split.position.set(s * 6.6, -2.0, 0.2);
          skinDetail.add(split);
        }

        group.add(skinDetail);

        /* --- Marques d'usure (iteration 3) -------------------------------
       Voile de salissure sur la coque, traces de suie derriere les
       reacteurs et poussiere de frein sur les roues. Tout est en
       MeshBasicMaterial transparent : aucun cout d'eclairage, et
       l'opacite est pilotee par applyWearVisuals() d'apres l'etat
       reel des composants. */
    const wearGroup = new THREE.Group();
    const grimeMat = new THREE.MeshBasicMaterial({
      color: 0x2b2b28, transparent: true, opacity: 0, depthWrite: false
    });
    const sootMat = new THREE.MeshBasicMaterial({
      color: 0x14161a, transparent: true, opacity: 0, depthWrite: false
    });
    const dustMat = new THREE.MeshBasicMaterial({
      color: 0x6b5a44, transparent: true, opacity: 0, depthWrite: false
    });

    /* Salissure repartie sur le bas du fuselage. */
    const grimeGeo = new THREE.PlaneGeometry(3.4, 1.5);
    const grimePatches = [];
    for (let i = 0; i < 10; i++) {
      const p = new THREE.Mesh(grimeGeo, grimeMat);
      const side = i % 2 === 0 ? 1 : -1;
      p.position.set(side * 1.9, -1.15 + (i % 3) * 0.22, -9 + i * 2.1);
      p.rotation.y = side * Math.PI / 2;
      p.rotation.z = (i % 4) * 0.4;
      wearGroup.add(p);
      grimePatches.push(p);
    }

    /* Suie derriere chaque reacteur. */
    const sootGeo = new THREE.PlaneGeometry(1.5, 1.1);
    const sootPatches = [];
    [-6.6, 6.6].forEach(x => {
      for (let i = 0; i < 3; i++) {
        const p = new THREE.Mesh(sootGeo, sootMat);
        p.position.set(x + (i - 1) * 0.5, -0.6 - i * 0.25, 3.4 + i * 0.9);
        p.rotation.y = Math.PI;
        wearGroup.add(p);
        sootPatches.push(p);
      }
    });

    /* Poussiere de frein sur les jantes. */
    const dustGeo = new THREE.RingGeometry(0.2, 0.56, 14);
    const dustPatches = [];
    [gNose, gLeft, gRight].forEach(g => {
      g.wheels.forEach(w => {
        const d = new THREE.Mesh(dustGeo, dustMat);
        d.position.set(0.23, 0, 0);
        d.rotation.y = Math.PI / 2;
        w.add(d);
        dustPatches.push(d);
      });
    });

    group.add(wearGroup);

        /* Ombres : seules les grandes surfaces de la cellule projettent.
                   Un avion ne se fait pas d'ombre a lui-meme de facon visible a
                   cette echelle, donc rien ne recoit — cela evite l'acne sur les
                   surfaces courbes. Les marques d'usure et les decalques de
                   joint sont exclus : ce sont des surfaces transparentes, et
                   les inclure dans la carte d'ombre multiplierait les appels de
                   dessin sans rien changer a l'ombre portee au sol. */
                const casters = [
                  fus, nose, stripe, wind, wingL, wingR,
                  ...flaps, ...ailerons, ...spoilers,
                  ...engines, gNose.pivot, gLeft.pivot, gRight.pivot
                ];
                casters.forEach(o => {
                  if (!o) return;
                  if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
                  else o.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = false; } });
                });

        return {
      /* coque masquee en vue cockpit (la camera est a l'interieur du fuselage) */
      hull: [fus, nose, stripe, wind, skinDetail, noseWindows],
      group, cockpit, flaps, ailerons, spoilers, elevPivot, rudPivot,
      fans, engines, gears: { nose: gNose, left: gLeft, right: gRight },
      beacon, landingLight, wingLights: [wingLightL, wingLightR],
      strobes: [strobeL, strobeR], tailLight, navL, navR,
      materials: { bodyMat, accentMat, darkMat },
      wear: { group: wearGroup, grimeMat, sootMat, dustMat, grimePatches, sootPatches, dustPatches }
    };
  },
  /* ---------------------------------------------------------- */
  /* Hangar (vague 2) : livrees et petits avions                   */
  /* ---------------------------------------------------------- */
  setupFleet() {
    const A = this.aircraft;
    /* Emplacements des decalques sur le fuselage du jet de ligne. */
    const slots = {
      radius: (z) => AF.fuselageRadius(z),
      band: { z0: -12.2, z1: 9.2, yc: -0.62, h: 0.34 },
      name: { z0: -8.6, z1: 4.0, yc: 1.22, h: 0.26 },
      stickers: [
        { z: -14.4, yc: -0.05, size: 1.25 },
        { z: -11.0, yc: -0.25, size: 1.05 },
        { z: 11.2, yc: 0.15, size: 1.2 }
      ],
      tailFin: { zc: 10.7, yc: 4.0, size: 2.3, halfThick: 0.17 }
    };
    const rig = new LiveryRig({ group: A.group, body: [A.materials.bodyMat], accent: [A.materials.accentMat], slots });
    A.hull.push(rig.group);
    this.liveryRigs = { liner: rig };
    this.fleetModels = {};
    this.activeModel = null;
    this.activePlane = 'liner';
    this.camScale = 1;
    this._linerAccentMap = A.materials.accentMat.map;
  },
  /* Cree (une fois) le modele d'un petit avion et sa livree. */
  ensurePlane(id) {
    if (id === 'liner') return null;
    if (this.fleetModels[id]) return this.fleetModels[id];
    const model = buildPlaneModel(id);
    if (!model) return null;
    model.group.visible = false;
    this.scene.add(model.group);
    this.fleetModels[id] = model;
    this.liveryRigs[id] = new LiveryRig(model);
    return model;
  },
  /* Choisit l'avion affiche (jet de ligne ou petit avion). */
  setActivePlane(id, camScale = 1) {
    const model = id === 'liner' ? null : this.ensurePlane(id);
    for (const m of Object.values(this.fleetModels)) m.group.visible = (m === model);
    this.aircraft.group.visible = !model;
    this.activeModel = model;
    this.activePlane = model ? id : 'liner';
    this.camScale = model ? camScale : 1;
    if (model && this.cameraMode === 'cockpit') this.cameraMode = 'chase';
    this._initialized = false;
  },
  /* Applique une livree (couleurs, motif, autocollants, nom) a un avion. */
  applyLivery(id, lv) {
    if (id !== 'liner') this.ensurePlane(id);
    const rig = this.liveryRigs[id];
    if (!rig) return;
    if (id === 'liner') {
      /* la texture bleue d'origine ternirait la couleur choisie */
      this.aircraft.materials.accentMat.map = null;
      this.aircraft.materials.accentMat.needsUpdate = true;
    }
    rig.apply(lv);
  },
  /* Traduit l'etat d'usure des composants en signes visuels sur la
     cellule : salissure, suie, poussiere de frein. Appele a basse
     frequence (voir main.js) car rien ici ne change vite. */
  applyWearVisuals(mechanic) {
    const w = this.aircraft && this.aircraft.wear;
    if (!w || !mechanic) return;
    const c = mechanic.components;
    const norm = (v, crit) => Math.max(0, Math.min(1, (v - crit * 0.35) / (crit * 0.65)));

    const airframe = norm(c.airframe.wear, c.airframe.critical);
    const fan = norm(c.fanBlades.wear, c.fanBlades.critical);
    const brakes = norm(c.brakes.wear, c.brakes.critical);

    w.grimeMat.opacity = airframe * 0.42;
    w.sootMat.opacity = fan * 0.5;
    w.dustMat.opacity = brakes * 0.55;

    /* Les traces apparaissent progressivement plutot que d'un bloc. */
    w.grimePatches.forEach((p, i) => { p.visible = airframe > (i / w.grimePatches.length) * 0.8; });
    w.sootPatches.forEach((p, i) => { p.visible = fan > (i / w.sootPatches.length) * 0.7; });
    w.dustPatches.forEach(p => { p.visible = brakes > 0.15; });
  },
  /* ---------------------------------------------------------- */
  /* Synchronisation modele <- physique */
  syncAircraft(ac, dt, t) {
    if (this.activeModel) {
      const M = this.activeModel;
      M.group.position.copy(ac.pos);
      M.group.quaternion.copy(ac.quat);
      M.update(ac, dt, t);
      return;
    }
    const A = this.aircraft;
    A.group.position.copy(ac.pos);
    A.group.quaternion.copy(ac.quat);

    /* Volets */
    const flapTarget = (ac.flapIndex / 4) * 0.62;
    A.flapAngle = THREE.MathUtils.lerp(A.flapAngle ?? 0, flapTarget, dt * 1.4);
    A.flaps.forEach(f => f.rotation.x = A.flapAngle);

    /* Ailerons : differentiels */
    A.ailerons[0].rotation.x = -ac.ctl.roll * 0.38;
    A.ailerons[1].rotation.x = ac.ctl.roll * 0.38;

    /* Profondeur et direction */
    A.elevPivot.rotation.x = -ac.ctl.pitch * 0.34;
    A.rudPivot.rotation.y = -ac.ctl.yaw * 0.40;

    /* Spoilers */
    const spTarget = ac.spoilers ? 0.85 : 0;
    A.spoilerAngle = THREE.MathUtils.lerp(A.spoilerAngle ?? 0, spTarget, dt * 5);
    A.spoilers.forEach(s => s.rotation.x = -A.spoilerAngle);

    /* Trains : retraction */
    const gearTarget = ac.gearDown ? 0 : 1;
    A.gearAnim = THREE.MathUtils.lerp(A.gearAnim ?? 0, gearTarget, dt * 0.55);
    const ga = A.gearAnim;
    A.gears.nose.pivot.rotation.x = ga * 1.55;
    /* Les trains principaux se replient vers l'axe, dans le carenage ventral. */
    A.gears.left.pivot.rotation.z = ga * 1.5;
    A.gears.right.pivot.rotation.z = -ga * 1.5;
    [A.gears.nose, A.gears.left, A.gears.right].forEach(g => {
      g.pivot.visible = ga < 0.97;
    });

    /* Rotation des roues au sol */
    if (ac.onGround) {
      const spin = ac.tas / 0.5 * dt;
      [A.gears.nose, A.gears.left, A.gears.right].forEach(g =>
        g.wheels.forEach(w => { w.rotation.x -= spin; }));
    }

    /* Soufflantes */
    const fanSpeed = (ac.n1 / 100) * 34 * dt;
    A.fans.forEach(f => f.rotation.y += fanSpeed);

    /* En vue cockpit ou en cabine on masque la coque pour degager le champ de vision */
    const inCockpit = this.cameraMode === 'cockpit' && this._pilotCamActive;
    const hideHull = inCockpit || this.insideCabin;
    A.hull.forEach(o => o.visible = !hideHull);
    A.cockpit.group.visible = inCockpit;
    if (inCockpit) A.cockpit.update(ac, dt, t, this.cockpitWarn);

    /* Feux */
        const night = this._lightsOn === true;
        const airborne = !ac.onGround;
        A.beacon.visible = Math.sin(t * 6) > 0 && !inCockpit;
        /* Phare d'atterrissage : au decollage et a l'atterrissage, pas a l'arret au parking. */
        const rolling = airborne || ac.ias > 15;
        A.landingLight.intensity = (ac.gearDown && ac.pos.y < 900 && rolling) ? 4.5 * LIGHT_GAIN : 0;
        A.landingLight.visible = A.landingLight.intensity > 0;

        /* Feux de navigation : allumes des que la nuit tombe ou que
           l'appareil est en vol. */
        const navOn = night || airborne;
        A.navL.visible = navOn;
        A.navR.visible = navOn;
        A.tailLight.visible = navOn;

        /* Feux a eclats : deux eclairs brefs par cycle de 1.4 s. */
        const strobePhase = (t % 1.4);
        const strobeOn = navOn && (strobePhase < 0.06 || (strobePhase > 0.16 && strobePhase < 0.22));
        A.strobes.forEach(s => s.visible = strobeOn);

        /* Phares d'ailes : la nuit, ou en approche sous 3000 ft. */
        const wingOn = (night || (airborne && ac.pos.y < 900)) && ac.gearDown && rolling;
        A.wingLights.forEach(l => { l.intensity = wingOn ? 3.2 * LIGHT_GAIN : 0; l.visible = wingOn; });
      },
};
