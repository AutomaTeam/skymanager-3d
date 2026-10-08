/* ============================================================
   renderGround.js — Terrain, aeroport, marquages, accessoires du sol
   (decoupe de renderer3d.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import * as THREE from 'three';
import * as TEX from './textures.js?v=1791479130';
import { spawnModel } from './assetLoader.js?v=1791479130';
import { LIGHT_GAIN } from './environment.js?v=1791479130';
import { LAYOUT } from './layout.js?v=1791479130';
import { buildDecor } from './decor.js?v=1791479130';
import { buildSkyLife } from './skylife.js?v=1791479130';
import { AirportLife } from './airportLife.js?v=1791479130';
import { buildLandscape, buildAirportDecor } from './scenery.js?v=1791479130';
import { buildTerminalShell } from './terminalBuilding.js?v=1791479130';
import { pbr, RUNWAY, LINK_Z, TOWER, MODEL, makeSign } from './renderShared.js?v=1791479130';

export const groundMethods = {
      buildTerrain() {
    this.terrainGroup = new THREE.Group();
        const grassSet = TEX.grass();
        const ground = new THREE.Mesh(
          new THREE.PlaneGeometry(60000, 60000),
          pbr(grassSet, { color: 0xdfe9c9, rough: 0.95, metal: 0, repeat: [180, 180] })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.05;
                ground.receiveShadow = true;
                this.terrainGroup.add(ground);

        /* Paysage (phase 22) : chaines de montagnes, champs, forets, villes,
           lac et route, voir scenery.js. */
        this.terrainGroup.add(buildLandscape({ TEX, pbr }));
        this.scene.add(this.terrainGroup);
      },
  /* ---------------------------------------------------------- */
  buildAirport() {
    const g = new THREE.Group();
    const R = RUNWAY;

    /* --- Piste --- */
    const rwSet = TEX.runway();
    const rw = new THREE.Mesh(
      new THREE.PlaneGeometry(R.width, R.length),
      pbr(rwSet, { rough: 0.92, metal: 0.02, repeat: [1, 40] })
    );
    rw.rotation.x = -Math.PI / 2;
    rw.position.set(0, 0.02, (R.startZ + R.endZ) / 2);
        rw.receiveShadow = true;
        g.add(rw);

    /* Accotements : herbe rase, texturee comme le terrain mais
       avec une repetition plus serree pour marquer la transition. */
    const shoulderMat = pbr(TEX.grass(), { color: 0xa8b89a, rough: 0.95, repeat: [6, 120] });
    [-1, 1].forEach(s => {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(30, R.length + 300), shoulderMat);
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(s * (R.width / 2 + 15), 0.01, (R.startZ + R.endZ) / 2);
            sh.receiveShadow = true;
            g.add(sh);
    });

    /* Marquages : le blanc pur d'origine est conserve (MeshBasic)
       car un marquage de piste ne doit pas dependre de l'eclairage
       pour rester lisible, mais il est legerement adouci pour ne
       plus "bruler" en plein soleil. */
    const white = new THREE.MeshBasicMaterial({ color: 0xdfe6ec });

    /* Axe central : tirets 30 m / 20 m */
    for (let z = R.startZ - 80; z > R.endZ + 80; z -= 50) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 30), white);
      d.rotation.x = -Math.PI / 2;
      d.position.set(0, 0.04, z);
      g.add(d);
    }

    /* Seuils (barres) et zones de toucher des roues */
    [[R.startZ - 12, 1], [R.endZ + 12, -1]].forEach(([z0, dir]) => {
      for (let i = 0; i < 8; i++) {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 26), white);
        b.rotation.x = -Math.PI / 2;
        b.position.set(-16 + i * 4.6, 0.04, z0 - dir * 14);
        g.add(b);
      }
      for (const off of [300, 450, 600]) {
        [-1, 1].forEach(s => {
          const t = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 22), white);
          t.rotation.x = -Math.PI / 2;
          t.position.set(s * 9, 0.04, z0 - dir * off);
          g.add(t);
        });
      }
    });

    /* Feux de bord de piste : on collecte d'abord, on instancie au compte exact
       (sinon les instances non ecrites restent a l'origine, au milieu de la piste) */
    const lightPos = [];
    for (let z = R.startZ; z >= R.endZ; z -= 60) {
      lightPos.push([-(R.width / 2 + 2), z], [R.width / 2 + 2, z]);
    }
    const edge = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.5, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0 }),
      lightPos.length
    );
    const m = new THREE.Matrix4();
    lightPos.forEach(([x, z], i) => {
      m.makeTranslation(x, 0.5, z);
      edge.setMatrixAt(i, m);
    });
    edge.instanceMatrix.needsUpdate = true;
    g.add(edge);
    this.runwayLights = edge;

    /* Rampe d'approche avant le seuil 36 */
    const appMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.approachMat = appMat;
    for (let i = 1; i <= 10; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(i % 5 === 0 ? 14 : 4, 0.4, 0.8), appMat);
      bar.position.set(0, 0.6, R.startZ + i * 60);
      g.add(bar);
    }

    /* --- Manche a air --- */
    const sockPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 8),
      pbr(TEX.metal(), { color: 0xd8dee6, rough: 0.45, metal: 0.7, repeat: [1, 2] }));
    sockPole.position.set(-(R.width / 2 + 16), 3, R.startZ - 60);
    g.add(sockPole);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.6, 12),
      pbr(TEX.fabric(), { color: 0xf97316, rough: 0.85, side: THREE.DoubleSide, repeat: [2, 2] }));
    sock.rotation.z = Math.PI / 2;
    this.windsock = sock;               // oriente par AirportLife selon le vent
    sock.position.set(-(R.width / 2 + 16) + 1.3, 5.7, R.startZ - 60);
    g.add(sock);

    /* --- Taxiway + parking --- */
    const apronSet = TEX.apron();
    const taxiMat = pbr(apronSet, { rough: 0.9, metal: 0.02, repeat: [1, 40] });
    const taxi = new THREE.Mesh(new THREE.PlaneGeometry(24, 2200), taxiMat);
    taxi.rotation.x = -Math.PI / 2;
    taxi.position.set(150, 0.015, 400);
    g.add(taxi);

    /* Bretelles de liaison piste <-> taxiway : de l'asphalte reel, la ou il
       n'y avait que des lignes jaunes tracees sur l'herbe. La premiere (z = 1380)
       est celle du point d'attente ou le tracteur depose l'avion. */
    const linkMat = pbr(apronSet, { rough: 0.9, metal: 0.02, repeat: [4, 1] });
    for (const lz of LINK_Z) {
      const link = new THREE.Mesh(new THREE.PlaneGeometry(126, 24), linkMat);
      link.rotation.x = -Math.PI / 2;
      link.position.set(80, 0.017, lz);
      link.receiveShadow = true;
      g.add(link);
    }

    /* Etendue vers le nord (z decroissant) jusqu'a 870 : a 260 m de
       profondeur (920..1180) le premier hangar (hz=900, voir plus bas)
       depassait de l'aire betonnee et se retrouvait avec de l'herbe
       devant sa porte, contrairement aux deux autres. */
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(420, 310),
      pbr(apronSet, { rough: 0.9, metal: 0.02, repeat: [10, 7] }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(330, 0.012, 1025);
        apron.receiveShadow = true;
        g.add(apron);
    /* Poste d'embarquement : l'appareil joueur est gare parallelement a
       la facade du terminal, porte cabine avant gauche tournee vers le
       hall (voir placeAircraftAtGate, cap 90). C'est ce qui permet une
       passerelle courte au lieu d'un bras de 180 m. */
    this.gatePosition = new THREE.Vector3(366, 3.45, 1168);

    /* --- Terminal (phase 22) : batiment integre a la carte ---
       Coque vitree, portes cote piste et cote ville, toit, enseigne,
       ponts stationnes : voir terminalBuilding.js. Le mobilier interieur
       est ajoute par prebuildTerminal() (il a besoin de COUNTERS). */
    const termMat = pbr(TEX.facade(), { color: 0xd6dde4, rough: 0.72, metal: 0.05, repeat: [4, 1] });
    const glassMat = pbr(TEX.glassGrid(), { color: 0xffffff, rough: 0.12, metal: 0.55, repeat: [3, 1] });
    const roofMat = pbr(TEX.roof(), { color: 0xb8bec6, rough: 0.95, repeat: [8, 8] });
    const termShell = buildTerminalShell({ TEX, pbr });
    g.add(termShell.group);
    this.terminalGlassMat = termShell.glassMat;   // s'eclaire la nuit (voir applyEnvironment)
    this.terminalBounds = termShell.bounds;

    /* --- Passerelle mobile du poste joueur ---
       Ancree dans l'ouverture du hall (x = 360, z = 1195), elle monte
       en rampe jusqu'a la porte cabine. Son extremite mobile est
       repositionnee chaque frame sur la porte reelle de l'appareil
       (updateJetBridge) : la passerelle suit donc l'avion. */
    const bridgeMat = pbr(TEX.metal(), { color: 0xe4e9ee, rough: 0.42, metal: 0.55, repeat: [1, 4] });
    const bridgeDark = pbr(TEX.metal(), { color: 0x7c8794, rough: 0.55, metal: 0.5, repeat: [1, 4] });
    const bridgeAnchor = new THREE.Vector3(360, 0, 1195);
    const bridge = new THREE.Group();
    bridge.position.copy(bridgeAnchor);
    g.add(bridge);

    /* Rotule : oriente le bras vers l'appareil (lacet seulement). */
    const boom = new THREE.Group();
    /* Lacet avant tangage : l'inclinaison se fait autour de l'axe
       transversal du bras, pas de l'axe monde. */
    boom.rotation.order = 'YXZ';
    bridge.add(boom);

    /* Geometries de longueur unitaire en Z, origine au seuil du hall :
       l'origine est posee sur la surface de marche, la portee est
       donnee par scale.z et l'inclinaison par la rotation du groupe.
       Toutes recalculees a chaque frame. */
    const ramp = new THREE.Group();
    const floorGeo = new THREE.BoxGeometry(4.4, 0.22, 1);
    floorGeo.translate(0, -0.11, 0.5);        // origine posee sur le dessus
    ramp.add(new THREE.Mesh(floorGeo, bridgeMat));
    [-2.14, 2.14].forEach(px => {
      const wallGeo = new THREE.BoxGeometry(0.12, 2.2, 1);
      wallGeo.translate(px, 1.1, 0.5);
      ramp.add(new THREE.Mesh(wallGeo, bridgeDark));
    });
    const roofGeo = new THREE.BoxGeometry(4.6, 0.14, 1);
    roofGeo.translate(0, 2.27, 0.5);
    ramp.add(new THREE.Mesh(roofGeo, bridgeMat));
    boom.add(ramp);

    /* Pieds de soutien : abscisse et hauteur suivent la rampe. */
    const legs = [];
    for (const frac of [0.34, 0.68]) {
      for (const px of [-1.9, 1.9]) {
        const legGeo = new THREE.BoxGeometry(0.18, 1, 0.18);
        legGeo.translate(0, -1, 0);           // origine posee en tete
        const leg = new THREE.Mesh(legGeo, bridgeDark);
        boom.add(leg);
        legs.push({ mesh: leg, frac, x: px });
      }
    }

    /* Plaque d'accostage : posee au contact de la porte cabine. */
/* Tete d'accostage. Son origine locale (z = 0) est posee sur le plan
   de la porte : tout le volume est construit vers l'exterieur (z < 0),
   sinon le plateau et le soufflet entreraient dans le fuselage. */
const dockGrp = new THREE.Group();
const dockGeo = new THREE.BoxGeometry(4.4, 0.2, 1.8);
dockGeo.translate(0, -0.1, -0.9);
dockGrp.add(new THREE.Mesh(dockGeo, bridgeMat));
const bellowGeo = new THREE.BoxGeometry(3.2, 2.3, 1.0);
bellowGeo.translate(0, 1.15, -0.5);
dockGrp.add(new THREE.Mesh(bellowGeo, bridgeDark));
boom.add(dockGrp);

    this.jetBridge = { root: bridge, boom, ramp, dock: dockGrp, legs };
    this.jetBridgeAnchor = bridgeAnchor;
    this._jbDock = new THREE.Vector3();
    this._jbUp = new THREE.Vector3(0, 1, 0);
    /* Emprise au sol de la passerelle : partagee par groundHeight() et
       par la zone `jetBridge` du graphe de navigation. Elle est figee
       sur la position de garage (le graphe de navigation est statique),
       alors que le bras visuel, lui, suit l'appareil. */
    this.jetBridgeBounds = {
      x0: 357.5, x1: 362.5, z0: 1168, z1: 1198,
      zDock: 1169.72, zTop: 1195, yDock: 2.52
    };

    /* --- Tour de controle --- */
    const towerBase = new THREE.Mesh(new THREE.CylinderGeometry(7, 10, 58, 16),
      pbr(TEX.concrete(), { color: 0xc8ced6, rough: 0.8, repeat: [4, 6] }));
    towerBase.position.set(TOWER.x, 29, TOWER.z);
    g.add(towerBase);
    /* Bandes rouges et blanches + balise : la tour se lit de loin. */
    const bandMat = pbr(TEX.paintedMetal(), { color: 0xdc2626, rough: 0.6, repeat: [1, 1] });
    for (const [by, br] of [[12, 8.9], [26, 8.2], [40, 7.5]]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(br + 0.08, br + 0.08, 5, 16), bandMat);
      band.position.set(TOWER.x, by, TOWER.z);
      g.add(band);
    }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
    beacon.position.set(TOWER.x, 76.4, TOWER.z);
    g.add(beacon);
    this.towerBeacon = beacon;
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(14, 11, 12, 16), glassMat);
    cab.position.set(TOWER.x, 63, TOWER.z);
    g.add(cab);
    /* Jupe de toiture : la tour cesse d'etre un simple cylindre. */
    const cabRoof = new THREE.Mesh(new THREE.CylinderGeometry(15.2, 15.2, 1.1, 16), roofMat);
    cabRoof.position.set(TOWER.x, 69.4, TOWER.z);
    g.add(cabRoof);
    /* Radar + antenne : deux details qui donnent l'echelle. */
    const radarMat = pbr(TEX.metal(), { color: 0xd0d6de, rough: 0.4, metal: 0.7, repeat: [1, 1] });
    const radarPole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4, 8), radarMat);
    radarPole.position.set(TOWER.x, 72, TOWER.z);
    g.add(radarPole);
    const radar = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.22, 0.9), radarMat);
    radar.position.set(TOWER.x, 74, TOWER.z);
    radar.rotation.z = 0.22;
    g.add(radar);
    this.towerRadar = radar;
    this.towerPos = new THREE.Vector3(TOWER.x, 68, TOWER.z);

    /* --- Hangars ---
       Arche en demi-cylindre + portail en facade : la silhouette
       d'origine (un demi-cylindre nu) ne se lisait pas comme un
       batiment. */
    const hangarMat = pbr(TEX.metal(), { color: 0xa8b2be, rough: 0.55, metal: 0.45, repeat: [6, 2] });
    const hangarDoorMat = pbr(TEX.metal(), { color: 0x6e7885, rough: 0.6, metal: 0.5, repeat: [4, 2] });
    for (let i = 0; i < 3; i++) {
      const hz = 900 + i * 110;
      const h = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 90, 20, 1, false, 0, Math.PI), hangarMat);
      h.rotation.z = Math.PI / 2;
      h.rotation.y = Math.PI / 2;
      h.position.set(540, 0, hz);
      g.add(h);
      /* Portail : grand panneau plat sur la face ouest. */
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 26, 44), hangarDoorMat);
      door.position.set(495, 13, hz);
      g.add(door);
      /* Rails de guidage du portail. */
      for (const dz of [-23, 23]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 46), hangarDoorMat);
        rail.position.set(494.6, 26.4, hz + dz * 0.02);
        g.add(rail);
      }
      /* Bandeau de numero de hangar. */
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(6, 3),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
      plate.position.set(494.6, 30, hz);
      plate.rotation.y = -Math.PI / 2;
      g.add(plate);

      /* Palette de fret au pied du hangar : modele importe (glTF, CC0,
         voir assets/models/CREDITS.md), pur decor. */
      const crates = spawnModel(MODEL.crates);
      crates.scale.setScalar(1.4);
      crates.position.set(508, 0, hz - 20);
      crates.rotation.y = i * 0.9;
      g.add(crates);
    }

    /* --- Bureau d'exploitation (entree de la gestion aeroport) ---
       Petit batiment au pied de la tour : c'est ce point que le joueur
       approche pour ouvrir le tableau de bord de gestion. */
    const officeMat = pbr(TEX.concrete(), { color: 0xb4bcc6, rough: 0.78, repeat: [3, 2] });
    const office = new THREE.Mesh(new THREE.BoxGeometry(10, 4.5, 8), officeMat);
    office.position.set(TOWER.x + 16, 2.25, TOWER.z + 4);
    g.add(office);
    /* Auvent + vitrage : le bureau d'exploitation devient un vrai
       batiment plutot qu'un cube gris. */
    const officeRoof = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.4, 9.4), roofMat);
    officeRoof.position.set(TOWER.x + 16, 4.7, TOWER.z + 4);
    g.add(officeRoof);
    const officeGlass = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.8, 6.4), glassMat);
    officeGlass.position.set(TOWER.x + 21.05, 2.6, TOWER.z + 4);
    g.add(officeGlass);
    const officeDoor = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4),
      new THREE.MeshBasicMaterial({ color: 0x0c2233 }));
    officeDoor.position.set(TOWER.x + 21.15, 1.3, TOWER.z + 4);
    officeDoor.rotation.y = Math.PI / 2;
    g.add(officeDoor);
    this.opsOfficePos = new THREE.Vector3(TOWER.x + 24, 0, TOWER.z + 4);

    /* --- Equipements au sol pres de la porte (camion, GPU, chariots) --- */
    const wheelMat = pbr(TEX.tire(), { color: 0x2a2d33, rough: 0.95, repeat: [1, 1] });
    const addWheels = (parent, positions, r = 0.42) => {
      positions.forEach(([wx, wz]) => {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 12), wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(wx, r, wz);
        parent.add(w);
      });
    };

    /* Camion de piste : modele importe (glTF, CC0, deja a l'echelle
       reelle -- pas de correction necessaire, voir assets/models/CREDITS.md). */
    const fuelTruck = spawnModel(MODEL.truck);
    fuelTruck.position.set(326, 0, 1034);
    fuelTruck.rotation.y = Math.PI / 2;
    g.add(fuelTruck);

    /* Groupe electrogene au sol (GPU) : modele importe (glTF, CC-BY, voir
       assets/models/CREDITS.md). Origine mesuree hors-ligne (bbox min),
       le fichier source n'etant pas centre en (0,0,0). */
    const gpu = spawnModel(MODEL.gpu, { origin: [12.14, -0.12, 6.62] });
    gpu.position.set(320, 0, 995);
    g.add(gpu);

    const cartTrainMat = pbr(TEX.paintedMetal(), { color: 0x7c8794, rough: 0.65, metal: 0.3, repeat: [2, 1] });
    for (let i = 0; i < 3; i++) {
      const cart = new THREE.Group();
      cart.position.set(338 - i * 2.3, 0, 1072);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 1.4), cartTrainMat);
      bed.position.y = 0.55;
      cart.add(bed);
      /* Valises empilees sur le chariot : modele importe (glTF, CC-BY,
         voir assets/models/CREDITS.md), mis a l'echelle d'un bagage cabine. */
      for (let b = 0; b < 3; b++) {
        const bag = spawnModel(MODEL.suitcase);
        bag.scale.setScalar(0.55);
        bag.position.set(-0.5 + b * 0.5, 0.85, (b % 2) * 0.2 - 0.1);
        bag.rotation.y = (b - 1) * 0.2 + (i + b);
        cart.add(bag);
      }
      addWheels(cart, [[-0.75, -0.5], [0.75, -0.5], [-0.75, 0.5], [0.75, 0.5]], 0.22);
      g.add(cart);
    }

    /* --- Cloture perimetrique ---
       Grillage a maille percee (texture alpha) au lieu d'un voile
           translucide uniforme : on voit au travers, comme en vrai.
           Le materiau est cree par troncon pour que la repetition de la
           maille reste constante quelle que soit la longueur du troncon. */
        const fenceH = 2.2;
        const B = { minX: -140, maxX: 660, minZ: -1550, maxZ: 1650 };
        const postMat = pbr(TEX.metal(), { color: 0x5a6470, rough: 0.5, metal: 0.6, repeat: [1, 2] });
        const addFenceRun = (x0, z0, x1, z1) => {
          const len = Math.hypot(x1 - x0, z1 - z0);
          const fenceMat = pbr(TEX.chainlink(), {
            color: 0xa8b2be, rough: 0.6, metal: 0.5,
            transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
            repeat: [Math.max(1, Math.round(len / 2)), 1]
          });
          const rail = new THREE.Mesh(new THREE.PlaneGeometry(len, fenceH), fenceMat);
          rail.position.set((x0 + x1) / 2, fenceH / 2, (z0 + z1) / 2);
          rail.rotation.y = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
          g.add(rail);
          const postCount = Math.max(2, Math.round(len / 30));
          for (let i = 0; i <= postCount; i++) {
            const t = i / postCount;
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, fenceH + 0.3, 8), postMat);
            post.position.set(x0 + (x1 - x0) * t, (fenceH + 0.3) / 2, z0 + (z1 - z0) * t);
            g.add(post);
          }
        };
    /* Cote est et ouest, avec une coupure d'entree pres du terminal (cote est) */
    addFenceRun(B.minX, B.minZ, B.minX, B.maxZ);
    addFenceRun(B.maxX, B.minZ, B.maxX, 1120);
    addFenceRun(B.maxX, 1340, B.maxX, B.maxZ);
    addFenceRun(B.minX, B.minZ, B.maxX, B.minZ);
    addFenceRun(B.minX, B.maxZ, B.maxX, B.maxZ);
    /* Portail d'entree */
    const gateMat = pbr(TEX.hazard(), { color: 0xffffff, rough: 0.7, repeat: [1, 1] });
    const gatePost1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), gateMat);
    gatePost1.position.set(B.maxX, 1.5, 1120);
    g.add(gatePost1);
    const gatePost2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), gateMat);
    gatePost2.position.set(B.maxX, 1.5, 1340);
    g.add(gatePost2);
    const gateSign = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 220), gateMat);
    gateSign.position.set(B.maxX, 3.2, 1230);
    g.add(gateSign);

    /* --- Cote ville (phase 18) ---
       Le parking etait de l'autre cote de la piste, a 400 m du terminal :
       on y arrivait en traversant la piste. Il est maintenant cote ville,
       au sud du terminal, relie par une route au portail d'entree de
       l'enceinte (x = 660, z 1120..1340). */
    const roadMat = pbr(TEX.apron(), { color: 0x9aa3b0, rough: 0.9, repeat: [24, 1] });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(490, 14), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(475, 0.014, 1290);
    road.receiveShadow = true;
    g.add(road);
    const feeder = new THREE.Mesh(new THREE.PlaneGeometry(14, 60), roadMat);
    feeder.rotation.x = -Math.PI / 2;
    feeder.position.set(690, 0.014, 1262);
    g.add(feeder);

    const parkMat = pbr(TEX.apron(), { color: 0xc4cad2, rough: 0.9, repeat: [10, 4] });
    const parkSlab = new THREE.Mesh(new THREE.PlaneGeometry(240, 78), parkMat);
    parkSlab.rotation.x = -Math.PI / 2;
    parkSlab.position.set(360, 0.012, 1345);
    parkSlab.receiveShadow = true;
    g.add(parkSlab);
    /* Marquage des places et voitures (modeles Kenney) : voir decor.js, section parking. */
    /* Lampadaires de la route et arbres d'alignement : de la vie cote ville. */
    const roadPole = pbr(TEX.metal(), { color: 0x94a3b8, rough: 0.5, metal: 0.6, repeat: [1, 4] });
    const treeTrunk = pbr(TEX.rock(), { color: 0x4a3a2a, rough: 0.95, flatShading: true, repeat: [1, 2] });
    const treeCrown = pbr(TEX.foliage(), { color: 0x8fbf7a, rough: 0.9, flatShading: true, repeat: [2, 2] });
    for (let px = 260; px <= 660; px += 50) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 8, 8), roadPole);
      pole.position.set(px, 4, 1282);
      g.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.8), new THREE.MeshBasicMaterial({ color: 0xfff1c0 }));
      head.position.set(px, 8.1, 1282);
      g.add(head);
      if (px % 100 === 10) continue;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 5, 6), treeTrunk);
      trunk.position.set(px + 25, 2.5, 1432);
      g.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(4, 9, 7), treeCrown);
      crown.position.set(px + 25, 9, 1432);
      g.add(crown);
    }

    /* --- Panneaux d'orientation : on sait toujours ou aller --- */
    const signs = [
      { t: 'TERMINAL',        at: [360, 34, 1189], opt: { bg: '#0369a1', w: 46, h: 12 } },
      { t: 'TOUR',            at: [TOWER.x, 86, TOWER.z], opt: { bg: '#7c3aed', w: 26, h: 9 } },
      { t: 'HANGARS',         at: [540, 36, 1010], opt: { bg: '#b45309', w: 40, h: 10 } },
      { t: 'PARKING',         at: [360, 12, 1372], opt: { bg: '#15803d', w: 30, h: 8 } },
      { t: 'PISTE',           at: [78, 16, 1420], opt: { bg: '#334155', w: 24, h: 8 } },
      { t: 'ENTREE',          at: [660, 10, 1230], opt: { bg: '#0f766e', w: 22, h: 7 } }
    ];
    for (const sg of signs) {
      const spr = makeSign(sg.t, sg.opt);
      spr.position.set(sg.at[0], sg.at[1], sg.at[2]);
      g.add(spr);
    }

    /* --- Mats d'eclairage de l'aire de stationnement --- */
    const poleMat = pbr(TEX.metal(), { color: 0xcbd5e1, rough: 0.45, metal: 0.65, repeat: [1, 4] });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
        this.apronLamps = [];
        [[150, 930], [510, 930], [150, 1170], [510, 1170]].forEach(([px, pz]) => {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 14, 8), poleMat);
          pole.position.set(px, 7, pz);
          g.add(pole);
          const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.2), lampMat);
          head.position.set(px, 14, pz);
          g.add(head);
          const glow = new THREE.PointLight(0xfff6d8, 0.5 * LIGHT_GAIN, 60);
          glow.position.set(px, 13.5, pz);
          g.add(glow);
          this.apronLamps.push(glow);
        });

    /* --- Second appareil statique a une autre passerelle (aeroport vivant) --- */
    /* L'avion du poste 2 est maintenant construit et anime par AirportLife
       (il roule, decolle, revient). */

        this.buildGroundMarkings(g);
        this.buildGroundProps(g);
        g.add(buildAirportDecor({ TEX, pbr, RUNWAY, LAYOUT }));
        /* Decor en modeles 3D (plan graphisme, etape 4) + ses obstacles pour la navigation. */
        const modelDecor = buildDecor();
        g.add(modelDecor.group);
        this.decorBlockers = modelDecor.blockers;
        this.decorApi = modelDecor;
        /* Ciel vivant + sol mouille (plan graphisme, etape 6). */
        this.skyLife = buildSkyLife();
        g.add(this.skyLife.group);

        this.airport = g;
        this.scene.add(g);
        /* L'aeroport vit : vehicules, avions, helicoptere, voyageurs, batiments annexes. */
        this.life = new AirportLife({ r3d: this, group: g, pbr, TEX, makeSign });
      },
      /* ----------------------------------------------------------
         Marquages au sol.

         Sans eux, le tarmac est une dalle grise uniforme : aucune
         echelle, aucune lecture de la circulation. On trace donc les
         lignes normalisees d'un aerodrome reel — axe de piste avec
         bandes de seuil, lignes de taxiway jaunes, guidees d'aire de
         stationnement, numeros de poste — en `MeshBasicMaterial`
         (aucun cout d'eclairage) poses 2 cm au-dessus du revetement.

         Toutes les lignes sont fusionnees en un seul BufferGeometry
         par couleur : 3 appels de dessin au total, pas 200.
         ---------------------------------------------------------- */
      buildGroundMarkings(g) {
        const white = [], yellow = [], red = [];

        /* --- Piste 36/18 : axe en traits de 30 m espaces de 20 m. --- */
        for (let z = -1440; z <= 1440; z += 50) {
          white.push({ x: 0, z, w: 0.9, l: 30 });
        }
        /* Bandes de seuil : 8 traits de chaque cote, aux deux extremites. */
        for (const zEnd of [1440, -1440]) {
          const dir = zEnd > 0 ? -1 : 1;
          for (let i = 0; i < 8; i++) {
            const x = -18 + i * 5.2;
            white.push({ x, z: zEnd + dir * 22, w: 1.8, l: 30 });
          }
          /* Marque de designation : deux rectangles pleins. */
          white.push({ x: -6, z: zEnd + dir * 62, w: 4.5, l: 22 });
          white.push({ x: 6, z: zEnd + dir * 62, w: 4.5, l: 22 });
        }
        /* Bords de piste : deux lignes continues. */
        for (const x of [-21.5, 21.5]) {
          white.push({ x, z: 0, w: 0.9, l: 2900 });
        }

        /* --- Taxiway : axe jaune continu + bords. --- */
        yellow.push({ x: 150, z: 400, w: 0.35, l: 2200 });
        yellow.push({ x: 138.5, z: 400, w: 0.25, l: 2200 });
        yellow.push({ x: 161.5, z: 400, w: 0.25, l: 2200 });
        /* Bretelles de liaison piste <-> taxiway : axe jaune et barre d'attente
           (point d'arret avant la piste) sur chacune. */
        for (const z of LINK_Z) {
          yellow.push({ x: 80, z, w: 0.35, l: 126, rot: Math.PI / 2 });
          yellow.push({ x: 27, z: z - 6, w: 0.5, l: 10 });
          yellow.push({ x: 27, z: z + 6, w: 0.5, l: 10 });
        }

        /* --- Aire de stationnement : guidees de poste. --- */
        /* Ligne d'alignement des postes, parallele a la facade. */
        yellow.push({ x: 366, z: 1120, w: 0.3, l: 300, rot: Math.PI / 2 });
        /* Guidee d'entree de chaque poste (perpendiculaire). */
        for (const z of [1010, 1168]) {
          yellow.push({ x: 366, z: z - 60, w: 0.3, l: 120, rot: Math.PI / 2 });
          /* Barre d'arret : le nez de l'appareil s'y aligne. */
          yellow.push({ x: 366, z: z - 22, w: 12, l: 0.5 });
        }
        /* Zone de securite moteur : hachures rouges de part et d'autre. */
        for (let i = 0; i < 10; i++) {
          red.push({ x: 366 - 26 - i * 2.4, z: 1168, w: 1.2, l: 0.4, rot: Math.PI / 4 });
          red.push({ x: 366 + 26 + i * 2.4, z: 1168, w: 1.2, l: 0.4, rot: Math.PI / 4 });
        }

        /* --- Voie de service le long du terminal. --- */
        /* Voies de service : elles s'arretent a la facade du terminal (z 1195). */
        white.push({ x: 300, z: 1075, w: 0.25, l: 210, rot: Math.PI / 2 });
        white.push({ x: 432, z: 1075, w: 0.25, l: 210, rot: Math.PI / 2 });

        /* --- Route cote ville : axe blanc en pointilles. --- */
        for (let rx = 240; rx < 715; rx += 12) white.push({ x: rx, z: 1290, w: 5, l: 0.25, rot: Math.PI / 2 });

        const build = (list, color) => {
          if (!list.length) return;
          const geo = new THREE.PlaneGeometry(1, 1);
          const mat = new THREE.MeshBasicMaterial({ color, depthWrite: false });
          const inst = new THREE.InstancedMesh(geo, mat, list.length);
          const m = new THREE.Matrix4(), q = new THREE.Quaternion();
          const e = new THREE.Euler(-Math.PI / 2, 0, 0);
          const pos = new THREE.Vector3(), scl = new THREE.Vector3();
          list.forEach((it, i) => {
            q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, it.rot || 0, 'XYZ'));
            pos.set(it.x, 0.022, it.z);
            scl.set(it.w, it.l, 1);
            m.compose(pos, q, scl);
            inst.setMatrixAt(i, m);
          });
          inst.instanceMatrix.needsUpdate = true;
          inst.frustumCulled = false;
          g.add(inst);
          return inst;
        };
        build(white, 0xe8eef4);
        build(yellow, 0xe8c33a);
        build(red, 0xd94a3d);
      },
      /* ----------------------------------------------------------
         Petit materiel de piste.

         Un tarmac sans materiel parait abandonne. On ajoute les objets
         qu'on voit sur toute aire de trafic reelle : cones de balisage,
         cales de roue, groupes de parc, chariots a bagages, escabeau
         de maintenance et extincteurs. Chaque famille est un
         InstancedMesh unique, donc une poignee d'appels de dessin.
         ---------------------------------------------------------- */
      buildGroundProps(g) {
        const coneMat = pbr(TEX.paintedMetal(), { color: 0xe8622a, rough: 0.6, metal: 0.05, repeat: [1, 1] });
        const coneBandMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
        const metalMat = pbr(TEX.metal(), { color: 0xb9c2cc, rough: 0.42, metal: 0.7, repeat: [1, 2] });
        const darkMat = pbr(TEX.tire(), { color: 0x22262c, rough: 0.95, repeat: [1, 1] });
        const yellowMat = pbr(TEX.paintedMetal(), { color: 0xf2c53d, rough: 0.5, metal: 0.15, repeat: [1, 1] });
        const redMat = pbr(TEX.paintedMetal(), { color: 0xc0392b, rough: 0.5, metal: 0.15, repeat: [1, 1] });

        /* --- Cones de balisage : couronne autour de chaque poste. --- */
        const conePositions = [];
        for (const [cx, cz] of [[366, 1168], [450, 1010]]) {
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            conePositions.push([cx + Math.cos(a) * 30, cz + Math.sin(a) * 22]);
          }
        }
        /* Alignement le long de la voie de service. */
        for (let i = 0; i < 8; i++) conePositions.push([300, 980 + i * 26]);   // s'arrete avant la facade (z 1195)

        const coneGeo = new THREE.ConeGeometry(0.34, 0.95, 10);
        const cones = new THREE.InstancedMesh(coneGeo, coneMat, conePositions.length);
        const bandGeo = new THREE.CylinderGeometry(0.235, 0.27, 0.16, 10);
        const bands = new THREE.InstancedMesh(bandGeo, coneBandMat, conePositions.length);
        const baseGeo = new THREE.BoxGeometry(0.72, 0.06, 0.72);
        const bases = new THREE.InstancedMesh(baseGeo, coneMat, conePositions.length);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
        conePositions.forEach(([x, z], i) => {
          q.identity();
          m.compose(new THREE.Vector3(x, 0.5, z), q, s); cones.setMatrixAt(i, m);
          m.compose(new THREE.Vector3(x, 0.62, z), q, s); bands.setMatrixAt(i, m);
          m.compose(new THREE.Vector3(x, 0.05, z), q, s); bases.setMatrixAt(i, m);
        });
        [cones, bands, bases].forEach(o => { o.instanceMatrix.needsUpdate = true; o.castShadow = true; g.add(o); });
        /* Cones reactifs (plan graphisme, etape 5) : renverses au contact du joueur, remis debout ensuite. */
        this._coneSet = { meshes: [cones, bands, bases], pos: conePositions, st: conePositions.map(() => ({ t: 0, ax: 0, az: 0, fall: 0 })) };

        /* --- Cales de roue : deux par train principal, une par train avant. --- */
        const chockGeo = new THREE.BoxGeometry(0.9, 0.28, 0.34);
        const chockPos = [];
        for (const [cx, cz, hd] of [[366, 1168, 270], [450, 1010, 180]]) {
          const r = hd * Math.PI / 180;
          const fx = Math.sin(r), fz = Math.cos(r);
          for (const [ox, oz] of [[-3.8, 1.8], [3.8, 1.8], [0, -11.5]]) {
            const wx = cx + ox * Math.cos(r) + oz * fx;
            const wz = cz - ox * fx + oz * fz;
            chockPos.push([wx, wz, r]);
          }
        }
        const chocks = new THREE.InstancedMesh(chockGeo, yellowMat, chockPos.length);
        chockPos.forEach(([x, z, r], i) => {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r);
          m.compose(new THREE.Vector3(x, 0.16, z), q, s);
          chocks.setMatrixAt(i, m);
        });
        chocks.instanceMatrix.needsUpdate = true;
        chocks.castShadow = true;
        g.add(chocks);

        /* --- Groupes de parc (GPU) : chassis + capot + ventilateur. --- */
        const gpuPos = [[318, 1100], [318, 1160], [414, 1100], [414, 1160]];
        const gpuBody = new THREE.InstancedMesh(new THREE.BoxGeometry(3.4, 1.5, 1.8), metalMat, gpuPos.length);
        const gpuHood = new THREE.InstancedMesh(new THREE.BoxGeometry(3.0, 0.9, 1.6), darkMat, gpuPos.length);
        const gpuWheel = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10), darkMat, gpuPos.length * 4);
        gpuPos.forEach(([x, z], i) => {
          q.identity();
          m.compose(new THREE.Vector3(x, 0.95, z), q, s); gpuBody.setMatrixAt(i, m);
          m.compose(new THREE.Vector3(x, 1.85, z), q, s); gpuHood.setMatrixAt(i, m);
          [[-1.4, -0.8], [1.4, -0.8], [-1.4, 0.8], [1.4, 0.8]].forEach(([ox, oz], k) => {
            q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
            m.compose(new THREE.Vector3(x + ox, 0.34, z + oz), q, s);
            gpuWheel.setMatrixAt(i * 4 + k, m);
          });
        });
        [gpuBody, gpuHood, gpuWheel].forEach(o => { o.instanceMatrix.needsUpdate = true; o.castShadow = true; g.add(o); });

        /* --- Chariots a bagages : plateau + ridelles + 4 roues. --- */
        const cartPos = [[330, 1080], [334, 1080], [338, 1080], [330, 1125], [334, 1125], [338, 1125]];
        const cartBed = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.16, 1.5), metalMat, cartPos.length);
        const cartRail = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.7, 0.08), metalMat, cartPos.length * 2);
        const cartWheel = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 8), darkMat, cartPos.length * 4);
        cartPos.forEach(([x, z], i) => {
          q.identity();
          m.compose(new THREE.Vector3(x, 0.62, z), q, s); cartBed.setMatrixAt(i, m);
          m.compose(new THREE.Vector3(x, 1.0, z - 0.71), q, s); cartRail.setMatrixAt(i * 2, m);
          m.compose(new THREE.Vector3(x, 1.0, z + 0.71), q, s); cartRail.setMatrixAt(i * 2 + 1, m);
          [[-1.0, -0.6], [1.0, -0.6], [-1.0, 0.6], [1.0, 0.6]].forEach(([ox, oz], k) => {
            q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
            m.compose(new THREE.Vector3(x + ox, 0.22, z + oz), q, s);
            cartWheel.setMatrixAt(i * 4 + k, m);
          });
        });
        [cartBed, cartRail, cartWheel].forEach(o => { o.instanceMatrix.needsUpdate = true; o.castShadow = true; g.add(o); });

        /* --- Escabeau de maintenance + extincteurs pres des postes. --- */
        const stairMat = pbr(TEX.paintedMetal(), { color: 0x2f6fb0, rough: 0.5, metal: 0.3, repeat: [1, 1] });
        for (const [x, z, r] of [[352, 1150, 0.4], [436, 1030, -0.6]]) {
          const st = new THREE.Group();
          const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.2), stairMat);
          frame.position.y = 2.4; st.add(frame);
          for (let i = 0; i < 5; i++) {
            const step = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.28), stairMat);
            step.position.set(0, 0.5 + i * 0.48, 0.5 - i * 0.24);
            st.add(step);
          }
          for (const [ox, oz] of [[-0.7, -0.5], [0.7, -0.5], [-0.7, 0.5], [0.7, 0.5]]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), metalMat);
            leg.position.set(ox, 1.2, oz); st.add(leg);
          }
          st.position.set(x, 0, z);
          st.rotation.y = r;
          st.traverse(o => { if (o.isMesh) o.castShadow = true; });
          g.add(st);
        }
        for (const [x, z] of [[344, 1140], [388, 1186], [428, 1040]]) {
          const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.62, 10), redMat);
          ext.position.set(x, 0.31, z);
          ext.castShadow = true;
          g.add(ext);
        }
      },
};
