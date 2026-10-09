/* ============================================================
   renderCabin.js — Interieur de la cabine
   (decoupe de renderer3d.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import * as THREE from 'three';
import * as TEX from './textures.js?v=1791575411';
import { LIGHT_GAIN } from './environment.js?v=1791575411';
import { REQUEST_ICONS } from './cabinService.js?v=1791575411';
import { pbr, makeSign } from './renderShared.js?v=1791575411';

export const cabinMethods = {
  /* ============================================================
     ITERATION 3 — Cabine et service passagers
     ============================================================ */
  buildCabinInterior(rows, bright = false) {
    const g = new THREE.Group();
    const rowSpacing = 1.3;
    const length = rows * rowSpacing + 2.2;
    this.cabinLength = length;
    this.cabinRowSpacing = rowSpacing;

    /* La cabine est un tube ferme accroche a l'avion : le sol est a
       y = CABIN_FLOOR_Y dans le repere avion (le fuselage nu fait
       3,90 m de diametre, la cabine 3,44 m). */
    const HALF_W = 1.72;
    const CH = 2.3;                 // hauteur sous plafond
    const ZF = 1.1;                 // cloison avant
    const ZB = ZF - length;         // cloison arriere
    const zc = (ZF + ZB) / 2;
    g.position.set(0, -0.62, 0);

    const seatMat = pbr(TEX.fabric(), { color: 0x24548a, rough: 0.92, repeat: [2, 2] });
    const seatMatFront = pbr(TEX.leather(), { color: 0x7c2d12, rough: 0.55, repeat: [2, 2] });
    const skinMat = pbr(TEX.skinPores(), { color: 0xd8ab7e, rough: 0.75, repeat: [1, 1] });
    const hairMat = pbr(TEX.hair(), { color: 0x3f2a1d, rough: 0.85, repeat: [1, 1] });
    /* Passagers varies : 5 teintes de peau, 7 couleurs de cheveux (materiaux partages). */
    const skinVars = [0xf1c8a5, 0xd8ab7e, 0xb98a63, 0x8d5a3b, 0x5b3a29].map(c => { const m = skinMat.clone(); m.color.setHex(c); return m; });
    const hairVars = [0x2b1b12, 0x3f2a1d, 0x8a5a2b, 0xc9a24d, 0x141414, 0xa14a3b, 0xd8d8d8].map(c => { const m = hairMat.clone(); m.color.setHex(c); return m; });
    const floorMat = pbr(TEX.carpet(), { color: bright ? 0x94a3b8 : 0x4b5563, rough: 0.95, repeat: [4, 40] });
    const carpetMat = pbr(TEX.carpet(), { color: bright ? 0xbe3455 : 0x334155, rough: 0.95, repeat: [1, 40] });
    const wallMat = pbr(TEX.paintedMetal(), { color: 0xe7ebef, rough: 0.55, metal: 0.1, repeat: [4, 20] });
    const binMat = pbr(TEX.metal(), { color: 0xcbd5e1, rough: 0.4, metal: 0.5, repeat: [2, 2] });
    /* Textures ajoutees pour cette iteration : inox du galley, carrelage
       du bloc sanitaire, cuir des rangees premium. */
    const steelMat = pbr(TEX.brushed(), { color: 0xd7dee6, rough: 0.25, metal: 0.9, repeat: [2, 1] });
    const tileMat = pbr(TEX.tile(), { color: 0xf8fafc, rough: 0.15, metal: 0.02, repeat: [2, 2] });
    const leatherMat = pbr(TEX.leather(), { color: 0x1e293b, rough: 0.5, repeat: [1, 1] });
    const clothPalette = bright
      ? [0xef4444, 0xfacc15, 0x22d3ee, 0xa3e635, 0xf472b6, 0xfb923c]
      : [0x64748b, 0x9333ea, 0x0d9488, 0xb45309, 0x475569, 0xdb2777];
    /* Arcade : cabine arc-en-ciel (une couleur de siege par rangee), parois pastel moins granuleuses. */
    let rowMats = null;
    if (bright) {
      wallMat.color.setHex(0xdbeafe);
      if (wallMat.normalScale) wallMat.normalScale.set(0.15, 0.15);
      rowMats = [0x3b82f6, 0xf59e0b, 0x22c55e, 0xec4899, 0x8b5cf6].map(c => {
        const m = pbr(TEX.fabric(), { color: c, rough: 0.85, repeat: [2, 2] });
        m.emissive = new THREE.Color(c); m.emissiveIntensity = 0.32;
        return m;
      });
    }

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, length), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, zc);
    g.add(floor);

    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(0.9, length), carpetMat);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.005, zc);
    g.add(carpet);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, length), wallMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, CH, zc);
    g.add(ceiling);

    /* Cloisons avant/arriere : le tube est reellement ferme. */
    const front = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, CH), wallMat);
    front.position.set(0, CH / 2, ZF);
    front.rotation.y = Math.PI;
    g.add(front);
    const rear = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, CH), wallMat);
    rear.position.set(0, CH / 2, ZB);
    g.add(rear);

    /* Paroi droite pleine, paroi gauche percee de la porte d'embarquement
       (alignee sur le portail `cabinDoor` de navigation.js). */
    const right = new THREE.Mesh(new THREE.PlaneGeometry(length, CH), wallMat);
    right.position.set(HALF_W, CH / 2, zc);
    right.rotation.y = -Math.PI / 2;
    g.add(right);

    const doorZ0 = -6.9, doorZ1 = -5.1, doorTop = CH - 0.35;
    const seg = (a, b) => {
      const w = b - a;
      if (w <= 0.01) return;
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, CH), wallMat);
      wall.position.set(-HALF_W, CH / 2, (a + b) / 2);
      wall.rotation.y = Math.PI / 2;
      g.add(wall);
    };
    seg(ZB, doorZ0);
    seg(doorZ1, ZF);
    const lintel = new THREE.Mesh(new THREE.PlaneGeometry(doorZ1 - doorZ0, CH - doorTop), wallMat);
    lintel.position.set(-HALF_W, (doorTop + CH) / 2, (doorZ0 + doorZ1) / 2);
    lintel.rotation.y = Math.PI / 2;
    g.add(lintel);

    /* Bacs a bagages : caissons individuels avec porte et loquet, plutot
       qu'une longue poutre. Un caisson par rangee et par cote. */
    const binDoorGeo = new THREE.BoxGeometry(0.5, 0.34, 1.1);
    const binLatchGeo = new THREE.BoxGeometry(0.06, 0.1, 0.16);
    const latchMat = pbr(TEX.metal(), { color: 0x94a3b8, rough: 0.35, metal: 0.7, repeat: [1, 1] });
    this.cabinBins = [];
    for (let r = 0; r < rows; r++) {
      const z = -r * rowSpacing;
      [-1, 1].forEach(side => {
        const bin = new THREE.Mesh(binDoorGeo, binMat);
        bin.position.set(side * 1.5, CH - 0.3, z);
        g.add(bin);
        const latch = new THREE.Mesh(binLatchGeo, latchMat);
        latch.position.set(side * 1.24, CH - 0.42, z);
        g.add(latch);
        this.cabinBins.push(bin);
      });
    }

    /* Rangees de sieges : assise, dossier, appui-tete, accoudoirs,
       tablette rabattue et ecran de divertissement. */
    const seatPadGeo = new THREE.BoxGeometry(0.95, 0.16, 0.9);
    const seatBackGeo = new THREE.BoxGeometry(0.95, 0.72, 0.16);
    const headrestGeo = new THREE.BoxGeometry(0.62, 0.24, 0.14);
    const armGeo = new THREE.BoxGeometry(0.09, 0.09, 0.72);
    const trayGeo = new THREE.BoxGeometry(0.5, 0.03, 0.34);
    const screenGeo = new THREE.BoxGeometry(0.34, 0.22, 0.03);
    const legGeo = new THREE.BoxGeometry(0.07, 0.34, 0.07);
    const legMat = pbr(TEX.metal(), { color: 0x475569, rough: 0.45, metal: 0.65, repeat: [1, 1] });
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const trayMat = pbr(TEX.paintedMetal(), { color: 0xdbe3ea, rough: 0.5, repeat: [1, 1] });

    this.cabinSeats = [];
    for (let r = 0; r < rows; r++) {
      const z = -r * rowSpacing;
      const premium = r < 2;
      const upholstery = rowMats ? rowMats[r % rowMats.length] : (premium ? seatMatFront : seatMat);
      [-1, 1].forEach(side => {
        const seatGroup = new THREE.Group();
        seatGroup.position.set(side * 1.15, 0, z);

        const pad = new THREE.Mesh(seatPadGeo, upholstery);
        pad.position.y = 0.44;
        seatGroup.add(pad);
        const back = new THREE.Mesh(seatBackGeo, upholstery);
        back.position.set(0, 0.82, -0.42);
        seatGroup.add(back);
        const headrest = new THREE.Mesh(headrestGeo, premium && !rowMats ? leatherMat : upholstery);
        headrest.position.set(0, 1.24, -0.42);
        seatGroup.add(headrest);
        for (const a of [-1, 1]) {
          const arm = new THREE.Mesh(armGeo, legMat);
          arm.position.set(a * 0.5, 0.62, -0.05);
          seatGroup.add(arm);
        }
        for (const lx of [-0.38, 0.38]) {
          const leg = new THREE.Mesh(legGeo, legMat);
          leg.position.set(lx, 0.17, 0.28);
          seatGroup.add(leg);
        }
        /* Tablette rabattue et ecran sur le dossier du siege precedent. */
        const tray = new THREE.Mesh(trayGeo, trayMat);
        tray.position.set(0, 0.72, -0.56);
        seatGroup.add(tray);
        const screen = new THREE.Mesh(screenGeo, screenMat);
        screen.position.set(0, 1.02, -0.52);
        seatGroup.add(screen);

        /* Un passager stylise par groupe de sieges (perf) ; couleur de vetement variee */
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.28, 3, 8),
                  pbr(TEX.fabric(), { color: clothPalette[(r * 2 + (side < 0 ? 0 : 1)) % clothPalette.length], rough: 0.92, repeat: [1, 1] }));
        torso.position.set(0, 0.78, -0.05);
        seatGroup.add(torso);
        const pi = r * 2 + (side < 0 ? 0 : 1);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), skinVars[(pi * 3 + 1) % skinVars.length]);
        head.position.set(0, 1.08, -0.1);
        seatGroup.add(head);
        const hair = new THREE.Mesh(new THREE.SphereGeometry(0.145, 8, 6, 0, 6.283, 0, 1.7), hairVars[(pi * 5 + 2) % hairVars.length]);
        hair.position.set(0, 1.1, -0.1);
        seatGroup.add(hair);

        g.add(seatGroup);
        this.cabinSeats.push({ row: r + 1, side: side < 0 ? 'L' : 'R', group: seatGroup, head, screen });
      });
    }

    /* Hublots : ovoide lumineux perce dans chaque paroi, avec son
       volet. Ils donnent l'echelle et la lumiere du tube. */
    const windowMat = new THREE.MeshBasicMaterial({ color: 0xbfe3ff });
    const shadeMat = pbr(TEX.paintedMetal(), { color: 0xf1f5f9, rough: 0.7, repeat: [1, 1] });
    const winGeo = new THREE.CircleGeometry(0.19, 12);
    const shadeGeo = new THREE.BoxGeometry(0.02, 0.5, 0.44);
    this.cabinWindows = [];
    for (let r = 0; r < rows; r++) {
      const z = -r * rowSpacing - 0.3;
      [-1, 1].forEach(side => {
        const win = new THREE.Mesh(winGeo, windowMat);
        win.position.set(side * (HALF_W - 0.02), 1.35, z);
        win.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        g.add(win);
        const shade = new THREE.Mesh(shadeGeo, shadeMat);
        shade.position.set(side * (HALF_W - 0.06), 1.35, z);
        g.add(shade);
        this.cabinWindows.push({ win, shade, side });
      });
    }

    /* Plafond : bandeau lumineux central et diffuseurs d'air. */
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xfff4e0 });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, length - 0.6), stripMat);
    strip.position.set(0, CH - 0.02, zc);
    g.add(strip);
    const ventMat = pbr(TEX.paintedMetal(), { color: 0xcbd5e1, rough: 0.6, repeat: [1, 1] });
    for (let r = 0; r < rows; r += 2) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.34), ventMat);
      vent.position.set(0, CH - 0.05, -r * rowSpacing);
      g.add(vent);
    }

    /* ------------------------------------------------------------
       Office (galley) a l'avant : plan de travail inox, fours,
       armoires et chariot. C'est le point de recharge du service.
       ------------------------------------------------------------ */
    const galley = new THREE.Group();
    galley.position.set(0, 0, ZF - 0.9);
    const galleyBody = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.9, 0.9), steelMat);
    galleyBody.position.set(0, 0.95, 0);
    galley.add(galleyBody);
    const galleyTop = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.08, 1.0), steelMat);
    galleyTop.position.set(0, 1.94, 0);
    galley.add(galleyTop);
    for (let o = 0; o < 3; o++) {
      const oven = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.06),
        pbr(TEX.paintedMetal(), { color: 0x334155, rough: 0.4, metal: 0.4, repeat: [1, 1] }));
      oven.position.set(-0.85 + o * 0.85, 1.35, 0.47);
      galley.add(oven);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), steelMat);
      handle.position.set(-0.85 + o * 0.85, 1.62, 0.5);
      galley.add(handle);
    }
    /* Etagere a bacs repas, garnie. */
    for (let s = 0; s < 2; s++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.5), steelMat);
      shelf.position.set(0, 0.6 + s * 0.5, -0.1);
      galley.add(shelf);
      for (let k = 0; k < 5; k++) {
        const tray = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34),
          new THREE.MeshBasicMaterial({ color: [0xf59e0b, 0x22d3ee, 0xa3e635, 0xec4899, 0xfbbf24][(s + k) % 5] }));
        tray.position.set(-0.96 + k * 0.48, 0.69 + s * 0.5, -0.1);
        galley.add(tray);
      }
    }
    g.add(galley);
    this.cabinGalley = galley;

    /* ------------------------------------------------------------
       Bloc sanitaire a l'arriere : carrelage, vasque et porte.
       ------------------------------------------------------------ */
    const lav = new THREE.Group();
    lav.position.set(0, 0, ZB + 0.9);
    const lavBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.1, 1.0), tileMat);
    lavBody.position.set(0, 1.05, 0);
    lav.add(lavBody);
    const lavDoor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.06),
      pbr(TEX.paintedMetal(), { color: 0x94a3b8, rough: 0.5, metal: 0.3, repeat: [1, 1] }));
    lavDoor.position.set(0, 0.95, 0.53);
    lav.add(lavDoor);
    const lavSign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x22c55e }));
    lavSign.position.set(0, 2.0, 0.53);
    lav.add(lavSign);
    g.add(lav);
    this.cabinLavatory = lav;

    /* Chariot de service / duty-free pres de l'entree (z proche de 0) */
    const cart = new THREE.Group();
    const cartBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.95, 0.85), steelMat);
    cartBody.position.y = 0.48;
    cart.add(cartBody);
    const cartTop = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.9), steelMat);
    cartTop.position.y = 0.98;
    cart.add(cartTop);
    for (const cz of [-0.3, 0.3]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8), legMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0.24, 0.06, cz);
      cart.add(wheel);
    }
    cart.position.set(0, 0, 0.95);
    g.add(cart);
    this.cabinCart = cart;

    /* Eclairage cabine */
    const lamp1 = new THREE.PointLight(0xfff2d8, 1.0 * LIGHT_GAIN, length * 0.7 + 4);
    lamp1.position.set(0, CH - 0.15, 0);
    g.add(lamp1);
    const lamp2 = new THREE.PointLight(0xfff2d8, 1.0 * LIGHT_GAIN, length * 0.7 + 4);
    lamp2.position.set(0, CH - 0.15, -length + 2);
    g.add(lamp2);
    this.cabinLamps = [lamp1, lamp2];
    this.cabinAmb = new THREE.AmbientLight(0xffffff, 0.38 * LIGHT_GAIN);
    g.add(this.cabinAmb);

    /* Reperes de la cabine : on voit ou sortir et ou est le cockpit. */
    const doorSign = makeSign('SORTIE', { bg: '#15803d', w: 1.0, h: 0.32 });
    doorSign.position.set(-1.3, 2.1, -6.0);
    g.add(doorSign);
    const cockpitSign = makeSign('COCKPIT', { bg: '#0369a1', w: 1.3, h: 0.38 });
    cockpitSign.position.set(0, 2.05, 0.95);
    g.add(cockpitSign);
    const doorRing = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.46, 24),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide }));
    doorRing.rotation.x = -Math.PI / 2;
    doorRing.position.set(-1.25, 0.03, -6.0);
    g.add(doorRing);

    g.visible = false;
    this.aircraft.group.add(g);
    this.cabinGroup = g;
    this.requestMarkers = {};
    return g;
  },
  enterCabinMode(rows, bright = false) {
    if (!this.cabinGroup) this.buildCabinInterior(rows, bright);
    /* Arcade : cabine claire et chaleureuse. */
    if (this.cabinAmb) this.cabinAmb.intensity = (bright ? 0.7 : 0.38) * LIGHT_GAIN;
    if (this.cabinLamps) this.cabinLamps.forEach(l => { l.intensity = (bright ? 1.6 : 1.0) * LIGHT_GAIN; });
    this.cabinGroup.visible = true;
    /* Le fuselage cache la cabine : on masque sa coque pour voir dedans. */
    this.insideCabin = true;
    this.aircraft.hull.forEach(o => { o.visible = false; });

    if (!this.attendant) {
      this.attendant = this.buildTechnician(0x0ea5e9, 0xffffff);
      this.cabinGroup.add(this.attendant.group);
    }
    this.attendant.group.visible = true;
    this._cabinCamInit = false;
    this.cameraMode = 'cabin';
  },
  /* Pastilles emoji au-dessus des postes du terminal tenus par un employe. list = [{ key, emoji, x, z }]. */
  setStaffBadges(list) {
    this._staffBadges = this._staffBadges || new Map();
    const keep = new Set(list.map(b => b.key));
    for (const [k, s] of this._staffBadges) {
      if (!keep.has(k)) { this.scene.remove(s); s.material.dispose(); this._staffBadges.delete(k); }
    }
    for (const b of list) {
      let s = this._staffBadges.get(b.key);
      if (!s || s.userData.emoji !== b.emoji) {
        if (s) { this.scene.remove(s); s.material.dispose(); }
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._bubbleTex(b.emoji, false), transparent: true }));
        s.userData.emoji = b.emoji;
        s.scale.set(1.5, 1.5, 1);
        this.scene.add(s);
        this._staffBadges.set(b.key, s);
      }
      s.position.set(b.x, 3.3, b.z);
    }
  },
  /* Bulle de dialogue (fond rond + queue + emoji), mise en cache par emoji et etat. */
  _bubbleTex(emoji, urgent) {
    this._bubbleCache = this._bubbleCache || {};
    const key = emoji + (urgent ? '!' : '');
    if (this._bubbleCache[key]) return this._bubbleCache[key];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = urgent ? '#dc2626' : '#ffffff';
    x.strokeStyle = urgent ? '#fecaca' : '#0ea5e9';
    x.lineWidth = 6;
    x.beginPath(); x.arc(64, 56, 50, 0, Math.PI * 2); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(46, 96); x.lineTo(64, 124); x.lineTo(82, 96); x.closePath(); x.fill();
    x.font = '60px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#000';
    x.fillText(emoji, 64, 60);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return (this._bubbleCache[key] = tex);
  },
  /* Emoji qui monte au-dessus du siege (row, side) : reaction a un service reussi. */
  cabinReact(row, side, emoji) {
    if (!this.cabinGroup || !this.cabinSeats) return;
    const seat = this.cabinSeats.find(s => s.row === row && s.side === side);
    if (!seat) return;
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const x = c.getContext('2d');
    x.font = '70px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(emoji, 48, 52);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.renderOrder = 11;
    this.cabinGroup.add(s);
    this._cabFx = this._cabFx || [];
    this._cabFx.push({ s, t: 0, x: seat.group.position.x, z: seat.group.position.z });
  },
  exitCabinMode() {
    if (this.cabinGroup) this.cabinGroup.visible = false;
    this.insideCabin = false;
    if (this.attendant) this.attendant.group.visible = false;
    this.cameraMode = 'chase';
  },
  /* attendant = { z, heading } — z decroissant vers l'arriere de la cabine */
  updateCabinScene(cabin, attendant, dt, t) {
    if (!this.cabinGroup || !this.attendant) return;
    this.attendant.group.position.set(attendant.x || 0, 0, attendant.z);
    this.attendant.group.rotation.y = attendant.heading;
    this.attendant.group.position.y = attendant.moving ? Math.abs(Math.sin(t * 9)) * 0.05 : 0;
    this.updateAvatarAnim(this.attendant, attendant.moving, dt);

    /* Marqueurs de requetes passagers (icone flottante coloree par type) */
    const activeIds = new Set(cabin.requests.map(r => r.id));
    for (const id in this.requestMarkers) {
      if (!activeIds.has(+id)) {
        this.cabinGroup.remove(this.requestMarkers[id]);
        delete this.requestMarkers[id];
      }
    }
    /* Bulle emoji au-dessus du passager : rouge quand l'attente devient longue. */
    cabin.requests.forEach(r => {
      let m = this.requestMarkers[r.id];
      if (!m) {
        m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._bubbleTex(REQUEST_ICONS[r.type] || '❓', false), transparent: true, depthTest: false }));
        m.renderOrder = 10;
        this.cabinGroup.add(m);
        this.requestMarkers[r.id] = m;
        m.userData.urgent = false;
      }
      const seat = this.cabinSeats.find(s => s.row === r.row && s.side === r.side);
      if (seat) {
        const urgency = 1 - r.timeLeft / r.maxTime;
        const urgent = urgency > 0.65;
        if (urgent !== m.userData.urgent) {
          m.userData.urgent = urgent;
          m.material.map = this._bubbleTex(REQUEST_ICONS[r.type] || '❓', urgent);
        }
        m.position.set(seat.group.position.x, 1.85 + Math.sin(t * 5 + r.id) * 0.06, seat.group.position.z);
        const s = 0.62 * (1 + urgency * 0.35) * (urgent ? 1 + Math.sin(t * 14) * 0.08 : 1);
        m.scale.set(s, s, 1);
      }
    });

    /* Petites reactions (coeur, etoile...) qui montent au-dessus d'un passager. */
    this._cabShake = cabin.turbulence && cabin.turbulence.active ? 1 : 0;
    if (this._cabFx) {
      for (let i = this._cabFx.length - 1; i >= 0; i--) {
        const f = this._cabFx[i];
        f.t += dt;
        const k = f.t / 1.3;
        if (k >= 1) { this.cabinGroup.remove(f.s); f.s.material.dispose(); this._cabFx.splice(i, 1); continue; }
        f.s.position.set(f.x, 1.6 + k * 1.1, f.z);
        f.s.material.opacity = k < 0.7 ? 1 : (1 - k) / 0.3;
        const sc = 0.5 + Math.sin(Math.min(1, k * 3) * Math.PI / 2) * 0.3;
        f.s.scale.set(sc, sc, 1);
      }
    }

    /* Chariot : la hauteur de la pile de plateaux traduit le stock
       restant, et le chariot s'eclaire quand il est vide. */
    if (this.cabinCart) {
      const ratio = cabin.cartCapacity ? cabin.cartStock / cabin.cartCapacity : 1;
      this.cabinCart.scale.y = 0.75 + ratio * 0.25;
      this.cabinCart.position.y = (this.cabinCart.scale.y - 1) * 0.48;
    }

    /* Hublots : les volets descendent quand la consigne ceintures est
       active, et la lumiere exterieure varie avec l'heure. */
    if (this.cabinWindows) {
      const shade = cabin.seatbeltSign ? 0.34 : 0.0;
      this.cabinWindows.forEach((w, i) => {
        w.shade.position.y = 1.35 + shade;
        w.win.material.color.setHex(cabin.seatbeltSign ? 0x2b3a4a : 0xbfe3ff);
      });
    }

    /* Ecrans de divertissement : allumes sur les rangees satisfaites. */
    if (this.cabinSeats) {
      this.cabinSeats.forEach(s => {
        if (!s.screen) return;
        const sat = cabin.rowSatisfaction ? (cabin.rowSatisfaction[s.row] || 78) : 78;
        s.screen.material.color.setHex(sat > 60 ? 0x1e3a8a : 0x0f172a);
      });
    }

    /* Passager perturbateur : anneau rouge pulsant au sol */
    if (cabin.unruly) {
      if (!this.unrulyRing) {
        this.unrulyRing = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 18),
          new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide }));
        this.unrulyRing.rotation.x = -Math.PI / 2;
        this.cabinGroup.add(this.unrulyRing);
      }
      const seat = this.cabinSeats.find(s => s.row === cabin.unruly.row && s.side === cabin.unruly.side);
      if (seat) {
        this.unrulyRing.position.set(seat.group.position.x, 0.03, seat.group.position.z);
        this.unrulyRing.visible = true;
        this.unrulyRing.scale.setScalar(1 + Math.sin(t * 6) * 0.22);
      }
    } else if (this.unrulyRing) {
      this.unrulyRing.visible = false;
    }
  },
};
