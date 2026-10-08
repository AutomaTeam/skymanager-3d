/* ============================================================
   renderer3d.js — Scene Three.js globale
   Aeroport, terrain, avion articule, cameras, ambiance
   ============================================================ */

import * as THREE from 'three';
import * as TEX from './textures.js?v=1791470927';
import { preload } from './assetLoader.js?v=1791470927';
import { LIGHT_GAIN } from './environment.js?v=1791470927';
import { buildTerminalInterior as buildTermFurniture } from './terminalBuilding.js?v=1791470927';
export { RUNWAY, SKIN_TONES, HAIR_TONES } from './renderShared.js?v=1791470927';
import { skyMethods } from './renderSky.js?v=1791470927';
import { lightMethods } from './renderLights.js?v=1791470927';
import { groundMethods } from './renderGround.js?v=1791470927';
import { cameraMethods } from './renderCamera.js?v=1791470927';
import { avatarMethods } from './renderAvatar.js?v=1791470927';
import { cabinMethods } from './renderCabin.js?v=1791470927';
import { aircraftMethods } from './renderAircraft.js?v=1791470927';
import { pbr, MODEL } from './renderShared.js?v=1791470927';


export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

        /* Ombres portees. Sans elles, l'avion et le batiment semblaient
           poses sur une photo : rien ne les ancrait au sol. Une seule
           carte d'ombre (le soleil), 1024 px, filtree en PCF doux. Le
           frustum est volontairement serre (120 m) et suit l'appareil,
           donc le tri par frustum de Three.js ecarte la quasi-totalite
           du decor : le surcout reste d'un seul appel de rendu. */
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.shadowMap.autoUpdate = true;
        this.shadowSize = 1024;
        this.shadowsEnabled = true;

        TEX.configureTextures(this.renderer);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fc3ee);
    this.scene.fog = new THREE.Fog(0x9fcbee, 2500, 24000);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.5, 60000);
    this.camera.position.set(0, 12, 940);

    this.cameraModes = ['chase', 'cockpit', 'orbit', 'tower', 'cinema'];
    /* Regard libre en vue cockpit (glisser pour tourner la tete). Le
       regard revient au centre des qu'on relache. */
    this.look = { yaw: 0, pitch: 0, hold: false };
    this._pilotCamActive = false;
    this._headEuler = new THREE.Euler();
    this._headQuat = new THREE.Quaternion();
    this.cameraMode = 'chase';
    this.orbitAngle = 0;

    this._smoothPos = new THREE.Vector3();
    this._smoothQuat = new THREE.Quaternion();
    this._cabinCamDesired = new THREE.Vector3();
    this._cabinCamPos = new THREE.Vector3();
    this._cabinTargetPos = new THREE.Vector3();
    this.insideCabin = false;
    this.insideTerminal = false;
    this._initialized = false;

    preload(Object.values(MODEL));

    this.buildLights();
    this.buildSky();
        this.buildEnvSky();
        this.buildRain();
        this.buildTerrain();
    this.buildAirport();
    this.aircraft = this.buildAircraft();
    this.scene.add(this.aircraft.group);
    this.setupFleet();
        this.buildBloom();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /* hotspots : liste generique { key, label, type, frame, pos }
     - type   : 'mechanic' (poste de diagnostic, colore par usure),
                'cockpit' (monter aux commandes), 'cabin' (embarquer),
                'tower' (gestion de l'aeroport).
     - frame  : 'aircraft' (pos = offset local, suit l'appareil ou
                qu'il se trouve) ou 'world' (pos = coordonnees fixes,
                pour un batiment).
     Les hotspots 'world' sont positionnes une seule fois ici ; les
     hotspots 'aircraft' sont repositionnes chaque frame dans
     updateHubScene() d'apres la pose reelle de l'avion. */
  buildHotspotMarkers(hotspots) {
    this.hotspotMarkers = {};
    const ringGeo = new THREE.RingGeometry(0.5, 0.68, 24);
    const dotGeo = new THREE.SphereGeometry(0.22, 10, 8);
    const FIXED_COLOR = { cockpit: 0x38bdf8, cabin: 0xf59e0b, tower: 0xa78bfa, terminal: 0x22d3ee, game: 0xf472b6 };

    hotspots.forEach(h => {
      const grp = new THREE.Group();
      const color = FIXED_COLOR[h.type] ?? 0x34d399;
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.85, side: THREE.DoubleSide
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      grp.add(ring);

      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color }));
      dot.position.y = 1.1;
      grp.add(dot);

      this.airport.add(grp);
      const offset = new THREE.Vector3(...h.pos);
      if (h.frame === 'world') grp.position.copy(offset);
      this.hotspotMarkers[h.key] = { group: grp, ring, dot, offset, type: h.type, frame: h.frame };
    });
  }

  /* ----------------------------------------------------------
     Mode Arcade : faisceau d'objectif et anneaux de vol.
     ---------------------------------------------------------- */

  /* Faisceau lumineux pose sur le lieu de l'objectif : visible de loin,
     il dit ou aller sans avoir a lire la carte. */
  buildBeacon() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfde047, transparent: true, opacity: 0.32, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.3, 110, 20, 1, true), mat);
    pillar.position.y = 55;
    g.add(pillar);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfff3a0, transparent: true, opacity: 0.85, fog: false, side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.3, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    g.add(ring);
    g.visible = false;
    this.beacon = { group: g, pillar, ring, mat };
    this.scene.add(g);
  }

  setBeacon(x, z) {
    if (!this.beacon) this.buildBeacon();
    const gh = this.groundHeight ? this.groundHeight(x, z) : 0;
    this.beacon.group.position.set(x, gh, z);
    this.beacon.group.visible = true;
  }

  hideBeacon() {
    if (this.beacon) this.beacon.group.visible = false;
  }

  pulseBeacon(t) {
    const b = this.beacon;
    if (!b || !b.group.visible) return;
    const k = 1 + Math.sin(t * 4) * 0.12;
    b.ring.scale.setScalar(k * 1.2);
    /* Quand on est dessus, le faisceau s'efface pour ne pas boucher la vue. */
    const cp = this.camera.position, bp = b.group.position;
    const d = Math.hypot(cp.x - bp.x, cp.z - bp.z);
    const near = Math.min(1, Math.max(0.1, (d - 4) / 14));
    b.mat.opacity = (0.26 + Math.sin(t * 3) * 0.07) * near;
  }

  /* Pieces cachees (chasse au tresor du mode Arcade) : petites pieces dorees
     qui tournent et flottent, avec un halo. `list` = [{ x, z }]. */
  setTreasures(list) {
    if (!this._treasureGroup) {
      this._treasureGroup = new THREE.Group();
      this.scene.add(this._treasureGroup);
      this._treasureGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.14, 24);
      this._treasureMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, fog: false, toneMapped: false });
      this._treasureRimMat = new THREE.MeshBasicMaterial({ color: 0xfff3a0, fog: false, toneMapped: false });
      this._treasureGlowMat = new THREE.MeshBasicMaterial({
        color: 0xffe680, transparent: true, opacity: 0.28, fog: false, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false
      });
      this._treasureRimGeo = new THREE.TorusGeometry(0.62, 0.07, 8, 24);
      this._treasureGlowGeo = new THREE.SphereGeometry(1.35, 14, 10);
    }
    const grp = this._treasureGroup;
    while (grp.children.length) grp.remove(grp.children[0]);
    this._treasures = [];
    for (const t of list) {
      const g = new THREE.Group();
      const coin = new THREE.Mesh(this._treasureGeo, this._treasureMat);
      coin.rotation.x = Math.PI / 2;
      const rim = new THREE.Mesh(this._treasureRimGeo, this._treasureRimMat);
      const glow = new THREE.Mesh(this._treasureGlowGeo, this._treasureGlowMat);
      const spin = new THREE.Group();
      spin.add(coin, rim);
      g.add(spin, glow);
      const gh = this.groundHeight ? this.groundHeight(t.x, t.z) : 0;
      g.position.set(t.x, gh + 1.3, t.z);
      grp.add(g);
      this._treasures.push({ g, spin, base: gh + 1.3, ph: Math.random() * 6 });
    }
  }

  /* Fait disparaitre une piece ramassee (indice dans la liste donnee a setTreasures). */
  hideTreasure(i) {
    const t = this._treasures && this._treasures[i];
    if (t) t.g.visible = false;
  }

  spinTreasures(t, visible) {
    if (!this._treasureGroup) return;
    this._treasureGroup.visible = visible;
    if (!visible) return;
    for (const c of this._treasures) {
      c.spin.rotation.y = t * 2.4 + c.ph;
      c.g.position.y = c.base + Math.sin(t * 2 + c.ph) * 0.18;
    }
  }

  /* Pieces du ciel : petite piste de pieces qui guide vers l'anneau. `list` = [{ x, y, z }]. */
  setSkyCoins(list) {
    if (!this._skyGroup) {
      this._skyGroup = new THREE.Group();
      this.scene.add(this._skyGroup);
      this._skyGeo = new THREE.CylinderGeometry(3.4, 3.4, 0.7, 24);
      this._skyMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, fog: false, toneMapped: false });
      this._skyGlowMat = new THREE.MeshBasicMaterial({
        color: 0xffe680, transparent: true, opacity: 0.25, fog: false, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false
      });
      this._skyGlowGeo = new THREE.SphereGeometry(6.5, 12, 8);
    }
    const grp = this._skyGroup;
    while (grp.children.length) grp.remove(grp.children[0]);
    this._skyCoins = list.map(c => {
      const g = new THREE.Group();
      const coin = new THREE.Mesh(this._skyGeo, this._skyMat);
      coin.rotation.x = Math.PI / 2;
      g.add(coin, new THREE.Mesh(this._skyGlowGeo, this._skyGlowMat));
      g.position.set(c.x, c.y, c.z);
      grp.add(g);
      return { g, coin };
    });
  }

  hideSkyCoin(i) { const c = this._skyCoins && this._skyCoins[i]; if (c) c.g.visible = false; }

  clearSkyCoins() {
    if (this._skyGroup) while (this._skyGroup.children.length) this._skyGroup.remove(this._skyGroup.children[0]);
    this._skyCoins = [];
  }

  spinSkyCoins(t) {
    if (!this._skyCoins) return;
    for (const c of this._skyCoins) c.coin.rotation.z = t * 3;
  }

  /* Cones de balisage : le joueur les renverse en les touchant, ils se relevent apres ~6 s. */
  reactCones(px, pz, dt) {
    const set = this._coneSet;
    if (!set) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const axis = new THREE.Vector3();
    let dirty = false;
    set.pos.forEach(([x, z], i) => {
      const st = set.st[i];
      const dx = x - px, dz = z - pz;
      if (st.fall === 0 && dx * dx + dz * dz < 0.8 * 0.8) {
        const d = Math.hypot(dx, dz) || 1;
        st.ax = dx / d; st.az = dz / d; st.fall = 1; st.t = 0;
      }
      if (st.fall === 0) return;
      st.t += dt;
      /* 0 -> 0.35 s : chute ; jusqu'a 6 s : couche ; 6 -> 6.6 s : se releve. */
      let k = st.t < 0.35 ? st.t / 0.35 : st.t < 6 ? 1 : Math.max(0, 1 - (st.t - 6) / 0.6);
      if (st.t >= 6.6) { st.fall = 0; k = 0; }
      const ang = k * 1.45;
      axis.set(st.az, 0, -st.ax);
      q.setFromAxisAngle(axis, ang);
      [[0, 0.5], [1, 0.62], [2, 0.05]].forEach(([mi, y]) => {
        const h = y * Math.cos(ang) ;
        p.set(x + st.ax * y * Math.sin(ang), Math.max(h, 0.12 * k + y * (1 - k) * 0), z + st.az * y * Math.sin(ang));
        p.y = Math.max(0.05, h + 0.3 * Math.sin(ang));
        m.compose(p, q, one);
        set.meshes[mi].setMatrixAt(i, m);
      });
      dirty = true;
    });
    if (dirty) for (const o of set.meshes) o.instanceMatrix.needsUpdate = true;
  }

  /* Decor de fete (mode Arcade, tarmac) : ballons attaches qui se balancent. */
  animateDecor(t, visible) {
    if (!this._balloons) {
      if (!visible) return;
      const spots = [[240, 1276], [300, 1276], [420, 1276], [480, 1276], [250, 1302], [470, 1302], [125, 880], [125, 1170],
                     [535, 1170], [200, 1190], [90, 1130], [45, 1200], [600, 900], [600, 1100], [660, 1290], [172, 1100]];
      const cols = [0xef4444, 0xfacc15, 0x38bdf8, 0x4ade80, 0xf472b6, 0xa78bfa, 0xfb923c];
      const grp = new THREE.Group();
      const geo = new THREE.SphereGeometry(1, 18, 14);
      const lineGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 4);
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xf1f5f9 });
      this._balloons = [];
      spots.forEach((s, i) => {
        const g = new THREE.Group();
        const gh = this.groundHeight ? this.groundHeight(s[0], s[1]) : 0;
        g.position.set(s[0], gh, s[1]);
        const len = 5 + (i % 4);
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.scale.y = len; line.position.y = len / 2;
        const b = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.25, metalness: 0.05, emissive: cols[i % cols.length], emissiveIntensity: 0.18 }));
        b.scale.set(1.05, 1.3, 1.05); b.position.y = len + 1.2;
        g.add(line, b);
        grp.add(g);
        this._balloons.push({ g, ph: i * 1.7 });
      });
      this._balloonGroup = grp;
      this.scene.add(grp);
    }
    this._balloonGroup.visible = visible;
    if (!visible) return;
    for (const b of this._balloons) {
      b.g.rotation.z = Math.sin(t * 0.9 + b.ph) * 0.09;
      b.g.rotation.x = Math.cos(t * 0.7 + b.ph) * 0.07;
    }
  }

  /* Anneau dore a traverser en vol. */
  buildFlightRing() {
    const g = new THREE.Group();
    const gold = new THREE.MeshBasicMaterial({ color: 0xffd23f, fog: false, toneMapped: false });
    const torus = new THREE.Mesh(new THREE.TorusGeometry(52, 4.4, 12, 48), gold);
    g.add(torus);
    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(52, 10, 8, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffe680, transparent: true, opacity: 0.22, fog: false, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false
      })
    );
    g.add(glow);
    g.visible = false;
    this.flightRing = { group: g, glow };
    this.scene.add(g);
  }

  setRing(r) {
    if (!this.flightRing) this.buildFlightRing();
    const g = this.flightRing.group;
    g.position.set(r.x, r.y, r.z);
    g.rotation.set(0, r.yaw, 0);      // le disque fait face a la trajectoire
    g.visible = true;
  }

  hideRing() {
    if (this.flightRing) this.flightRing.group.visible = false;
  }

  pulseRing(t) {
    const f = this.flightRing;
    if (!f || !f.group.visible) return;
    f.glow.scale.setScalar(1 + Math.sin(t * 5) * 0.06);
    f.group.rotation.z = t * 0.6;
  }

  /* Bascule la scene en mode "monde libre" : le joueur marche autour
     de l'appareil, quelle que soit sa position actuelle (porte,
     taxiway, piste...). */
  enterHubMode(hotspots) {
    this.hubMode = true;

    if (!this.player) {
      const L = this.playerLook;
      this.player = this.buildTechnician(L ? L.shirt : 0xf97316, L ? L.cap : 0xf5f5f5, true, L);
      this.scene.add(this.player.group);
    }
    this.player.group.visible = true;

    if (!this.hotspotMarkers) this.buildHotspotMarkers(hotspots);
    Object.values(this.hotspotMarkers).forEach(m => m.group.visible = true);

    this.cameraMode = 'hub';
  }

  exitHubMode() {
    this.hubMode = false;
    if (this.player) this.player.group.visible = false;
    if (this.hotspotMarkers) Object.values(this.hotspotMarkers).forEach(m => m.group.visible = false);
    this.cameraMode = 'chase';
  }

  /* ============================================================
     Terminal (phase 22) : batiment du monde ouvert.

     La coque est construite avec l'aeroport (buildAirport) et le mobilier
     ici, des le demarrage : il n'y a plus de mode « dans le terminal »,
     le joueur y entre a pied par les portes vitrees. Tout est aux
     coordonnees du monde ; voir terminalBuilding.js.
     ============================================================ */
  buildTerminalInterior(counters) {
    if (this.terminalGroup) return this.terminalGroup;
    const t = buildTermFurniture({ TEX, pbr, LIGHT_GAIN }, counters);
    this.scene.add(t.group);
    this._termApi = t;
    this.terminalGroup = t.group;
    this.terminalCounters = t.counters;
    this.termCarousel = t.carousel;
    this.termBoard = t.board;
    this.termLamps = t.lamps;
    this.terminalHall = { x0: 231, x1: 489, z0: 1196, z1: 1264, h: 11 };
    this._termK = 0;
    t.setLightLevel(0, 0);
    return t.group;
  }

  /* Construit le mobilier au demarrage : les passagers du hall existent
     ainsi des le premier instant. */
  prebuildTerminal(counters) {
    if (this.terminalGroup) return;
    this.buildTerminalInterior(counters);
  }

  /* Le joueur est-il dans l'emprise du batiment ? */
  isInsideTerminal(x, z) {
    const h = this.terminalHall;
    return !!h && x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1;
  }

  /* Animation du hall, appelee a chaque image par le monde libre.
     `pos` = position du joueur : elle regle l'eclairage interieur (allume
     a l'approche, eteint de loin pour ne pas payer des lumieres inutiles). */
  updateTerminalScene(terminal, pos, dt, t) {
    if (!this.terminalGroup) return;
    const h = this.terminalHall;
    const dx = Math.max(h.x0 - pos.x, 0, pos.x - h.x1);
    const dz = Math.max(h.z0 - pos.z, 0, pos.z - h.z1);
    const dist = Math.hypot(dx, dz);
    const night = this._nightLevel || 0;
    /* Portee : au-dela de ~53 m le hall n'est ni anime ni dessine (on ne voit plus rien par les vitres). */
    const reach = Math.max(0, Math.min(1, 1 - (dist - 8) / 45));
    this.terminalGroup.visible = reach > 0;
    /* Le jour, l'eclairage du hall ne sert qu'a l'interieur ; la nuit, il se voit par les vitres. */
    const target = night > 0.25 || dist < 2 ? reach : 0;
    this._termK += (target - this._termK) * Math.min(1, dt * 3);
    this._termApi.setLightLevel(this._termK, night);
    this.insideTerminal = dist === 0;
    if (reach <= 0) return;   // hors de portee : pas d'animation

    for (const id in this.terminalCounters) {
      const vis = this.terminalCounters[id];
      const data = terminal.counters[id];
      if (!data) continue;
      /* Phase 26 : les files des postes de controle sont faites de vrais passagers (foule ci-dessous). */
      const ownCrowd = data.kind === 'checkin' || data.kind === 'security' || data.kind === 'gate';
      const shown = ownCrowd ? 0 : Math.min(data.queue, vis.paxProps.length);
      vis.paxProps.forEach((p, i) => { p.visible = i < shown; });
      /* Phase 25 : les machines montrent leur stock (vert > orange > rouge clignotant),
         la reserve ses caisses ; les postes de controle leur etat ouvert / ferme. */
      if (vis.stockBar && data.stock != null) {
        const f = Math.max(0.03, Math.min(1, data.stock / 12));
        vis.stockBar.scale.x = f;
        const col = f > 0.5 ? 0x34d399 : f > 0.25 ? 0xfbbf24 : 0xef4444;
        vis.stockBar.material.color.setHex(col);
        vis.light.material.color.setHex(f > 0.25 ? 0x34d399 : (Math.sin(t * 8) > 0 ? 0xef4444 : 0x7f1d1d));
      } else if (data.crates != null) {
        vis.light.material.color.setHex(data.crates > 0 ? 0x34d399 : 0xef4444);
      } else {
        vis.light.material.color.setHex(data.open ? 0x34d399 : 0xef4444);
      }
      vis.light.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
    }

    if (this._termApi.crowd) this._termApi.crowd.update(terminal.crowd(), dt, t, terminal.inspectId);

    /* Tapis a bagages : boucle allongee, les valises defilent. */
    const car = this.termCarousel;
    if (car) {
      const n = car.bags.length, half = car.len / 2 - 0.4;
      for (let i = 0; i < n; i++) {
        const bag = car.bags[i];
        const u = ((t * 0.05 + i / n) % 1) * 2;             // 0..2 : aller puis retour
        const along = u < 1 ? -half + u * 2 * half : half - (u - 1) * 2 * half;
        bag.position.x = along;
        bag.position.z = u < 1 ? 0.9 : -0.9;
        bag.position.y = 1.12 + Math.abs(Math.sin(t * 6 + i)) * 0.02;
        bag.rotation.y = u < 1 ? 0.15 : Math.PI - 0.15;
      }
    }

    /* Tableaux des departs : les lignes clignotent au rythme des files. */
    const bd = this.termBoard;
    if (bd) {
      const q = terminal.totalQueue();
      bd.rows.forEach((row, i) => {
        const r = i % 6;
        const active = r < Math.min(6, 2 + Math.floor(q / 4));
        const blink = active && Math.sin(t * 3 + r * 1.7) > 0.6;
        row.material.color.setHex(blink ? 0xfbbf24 : (active ? bd.colors[i] : 0x3a557c));
      });
    }
  }

  /* Place l'appareil a une pose donnee (au sol, amortisseurs au repos) :
     utilise uniquement pour le tout premier depart (porte d'embarquement)
     ou une reinitialisation explicite — jamais pendant le jeu libre, ou
     l'avion reste exactement la ou le pilote l'a laisse. */
  placeAircraft(ac, pos, headingDeg) {
    ac.pos.copy(pos);
    ac.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -headingDeg * Math.PI / 180);
    ac.vel.set(0, 0, 0);
    ac.omega.set(0, 0, 0);
  }

  /* Hauteur du sol praticable en (x, z). Nulle partout, sauf sous la
     passerelle mobile ou elle suit la rampe : 0 m au seuil du hall
     (z = 1195) jusqu'a la hauteur du plancher cabine a l'accostage
     (z = 1169.72). Le marcheur monte donc reellement la pente. */
  groundHeight(x, z) {
    const b = this.jetBridgeBounds;
    if (!b) return 0;
    if (x < b.x0 || x > b.x1 || z < b.zDock || z > b.zTop) return 0;
    const t = (b.zTop - z) / (b.zTop - b.zDock);   // 0 au hall, 1 a la porte
    return b.yDock * Math.min(1, Math.max(0, t));
  }

  /* Recale la passerelle mobile sur la porte cabine reelle : le bras
     s'allonge, s'oriente et s'incline a chaque frame pour suivre
     l'appareil partout ou il est gare. */
  updateJetBridge() {
    const jb = this.jetBridge;
    if (!jb) return;
    const ac = this.aircraft;
    /* Porte cabine avant gauche, en repere avion. */
    this._jbDock.set(-1.72, -0.62, -6.0).applyQuaternion(ac.group.quaternion).add(ac.group.position);
    const d = this._jbDock;

    /* Repere du bras : ancre dans l'ouverture du hall, orientee vers la
       porte, mesuree au sol pour ne pas incliner le lacet. */
    const dx = d.x - this.jetBridgeAnchor.x;
    const dz = d.z - this.jetBridgeAnchor.z;
    const span = Math.max(0.5, Math.hypot(dx, dz));
    jb.boom.rotation.y = Math.atan2(dx, dz);

    /* Inclinaison : le bras tourne de `pitch` autour de son axe
       transversal. La rampe a son origine sur la surface de marche et
       s'etire sur Z : sa longueur vaut l'hypotenuse. */
    const dy = d.y - this.jetBridgeAnchor.y;
    const len = Math.hypot(span, dy);
    const pitch = Math.atan2(dy, span);
    jb.ramp.rotation.x = -pitch;
    jb.ramp.scale.z = len;

    /* Pieds de soutien : ils restent verticaux (leur rotation annule
       celle du bras) et prennent la hauteur du sol sous la rampe a
       leur abscisse. */
    for (const leg of jb.legs) {
      const lz = leg.frac * len;
      leg.mesh.position.set(leg.x, 0, lz);
      leg.mesh.rotation.x = pitch;
      leg.mesh.scale.y = Math.max(0.4, lz * Math.sin(pitch));
    }

    /* Plaque d'accostage : posee au ras de la porte, 1.35 m au-dela du
       bout du bras. Elle est dans le repere du bras, donc son lacet
       suit automatiquement ; seule la hauteur est donnee en clair. */
    /* z = span : l'origine du groupe d'accostage tombe pile sur le plan
     de la porte, le volume s'etendant vers l'exterieur. */
  jb.dock.position.set(0, dy, span);

    /* L'escalier d'embarquement et la passerelle desservent la meme
       porte : des que l'avion est gare assez pres du hall, la
       passerelle prend le relais et l'escalier disparait. */
    const docked = span < 26;
    if (this.boardingStairs) this.boardingStairs.visible = !docked;
    jb.root.visible = docked;
  }

  /* player = { pos: THREE.Vector3 (sol, y=0), heading, moving } — le meme
     avatar sert pour toutes les activites au sol (plus de personnage
     separe par mode). Les hotspots 'aircraft' suivent la pose reelle de
     l'appareil (ac), qu'il soit a la porte, sur le taxiway ou la piste. */
  updateHubScene(ac, mechanic, player, dt, t) {
    if (!this.player) return;
    this.updateJetBridge();
    const grp = this.player.group;
    grp.position.set(player.pos.x, player.pos.y || 0, player.pos.z);
    grp.rotation.y = player.heading;
    /* Petit rebond de marche */
    const moving = player.moving ? 1 : 0;
    grp.position.y += moving * Math.abs(Math.sin(t * 9)) * 0.05;
    this.updateAvatarAnim(this.player, player.moving, dt, player.running);
      /* La lampe suit le corps joue : l'avatar du joueur, ou l'agent
         qu'il conduit (la camera est alors sur l'agent). */
      if (this.player.torch) {
        /* La lampe ne s'allume que la nuit (le jour, elle ne se voyait pas mais coutait). */
        const on = (this._nightLevel || 0) > 0.25;
        this.player.torch.intensity = on ? 1.6 * LIGHT_GAIN : 0;
        this.player.torch.visible = on;
      }

    if (!this.hotspotMarkers) return;
    for (const key in this.hotspotMarkers) {
      const m = this.hotspotMarkers[key];
      if (m.frame === 'aircraft') {
        m.group.position.copy(ac.pos).add(m.offset.clone().applyQuaternion(ac.quat));
      }
      /* frame 'world' : position fixe, deja posee dans buildHotspotMarkers */

      if (m.type === 'mechanic' && mechanic) {
        const wear = mechanic.stationWear(key);
        const needs = mechanic.stationNeedsWork(key);
        const color = needs ? (wear > 85 ? 0xf87171 : 0xfbbf24) : 0x34d399;
        m.ring.material.color.setHex(color);
        m.dot.material.color.setHex(color);
        m.ring.scale.setScalar(1 + Math.sin(t * 5) * (needs ? 0.12 : 0.03));
      } else {
        m.ring.scale.setScalar(1 + Math.sin(t * 4 + key.length) * 0.08);
      }
    }
  }

    render() {
      const b = this.bloom;
      const r = this.renderer;
      /* Le bloom enchaine quatre passes : sans desactiver la remise a
         zero automatique, `renderer.info` ne refleterait que la derniere
         (le quad de composition) et le panneau de debogage afficherait
         « 1 appel, 2 triangles ». On cumule donc sur l'image entiere. */
      r.info.autoReset = false;
      r.info.reset();

      if (!b || !b.enabled) {
        r.render(this.scene, this.camera);
        r.info.autoReset = true;
        return;
      }

      /* 1. Scene complete dans une cible texturable : le framebuffer par
         defaut (canvas) ne peut pas etre rechantillonne comme texture, il
         faut donc rendre dans sceneRT pour que les passes suivantes
         puissent le lire. */
      r.setRenderTarget(b.sceneRT);
      r.render(this.scene, this.camera);

      /* 2. Extraction des hautes lumieres a 1/4 de resolution. */
      b.quad.material = b.brightMat;
      b.brightMat.uniforms.tDiffuse.value = b.sceneRT.texture;
      r.setRenderTarget(b.brightRT);
      r.render(b.quadScene, b.quadCam);

      /* 3. Flou separable horizontal puis vertical. */
      b.quad.material = b.blurMat;
      b.blurMat.uniforms.tDiffuse.value = b.brightRT.texture;
      b.blurMat.uniforms.dir.value.set(1, 0);
      r.setRenderTarget(b.blurRT);
      r.render(b.quadScene, b.quadCam);

      b.blurMat.uniforms.tDiffuse.value = b.blurRT.texture;
      b.blurMat.uniforms.dir.value.set(0, 1);
      r.setRenderTarget(b.brightRT);
      r.render(b.quadScene, b.quadCam);

      /* 4. Composition additive par-dessus la scene. */
      b.quad.material = b.compMat;
      b.compMat.uniforms.tDiffuse.value = b.sceneRT.texture;
      b.compMat.uniforms.tBloom.value = b.brightRT.texture;
      b.compMat.uniforms.strength.value = b.strength;
      r.setRenderTarget(null);
      r.autoClear = false;
      r.render(b.quadScene, b.quadCam);
      r.autoClear = true;
      r.info.autoReset = true;
    }
  }

/* Methodes deplacees dans des modules : js/renderSky.js, js/renderLights.js, js/renderGround.js, js/renderCamera.js, js/renderAvatar.js, js/renderCabin.js, js/renderAircraft.js */
Object.assign(Renderer3D.prototype, skyMethods, lightMethods, groundMethods, cameraMethods, avatarMethods, cabinMethods, aircraftMethods);
