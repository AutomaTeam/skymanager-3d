/* ============================================================
   renderCamera.js — Cameras (vol, tarmac, cabine) et redimensionnement
   (decoupe de renderer3d.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import * as THREE from 'three';
import { COCKPIT_EYE } from './cockpit.js?v=1791556299';
import { clamp01s } from './renderShared.js?v=1791556299';

export const cameraMethods = {
  /* ---------------------------------------------------------- */
  updateCamera(ac, dt) {
    const cam = this.camera;

      /* Le frustum d'ombre suit l'appareil : c'est lui qu'on regarde
         dans toutes les vues exterieures. En vue libre, c'est le
         joueur (voir updateHubCamera). */
      if (ac && ac.pos) this._shadowFocus = ac.pos;

      if (!this._initialized) {
      this._smoothPos.copy(ac.pos);
      this._smoothQuat.copy(ac.quat);
      this._initialized = true;
    }
    /* Lissage : la camera ne copie pas les mouvements haute frequence */
    this._smoothPos.lerp(ac.pos, Math.min(1, dt * 9));
    this._smoothQuat.slerp(ac.quat, Math.min(1, dt * 5.5));

    this._pilotCamActive = true;
    cam.up.set(0, 1, 0);
    cam.near = this.cameraMode === 'cockpit' ? 0.2 : 0.5;

    /* Camera cinema : plans qui s'enchainent (poursuite, cote, orbite, tour). */
    let mode = this.cameraMode;
    if (mode === 'cinema') {
      this._cinemaT = (this._cinemaT || 0) + dt;
      mode = ['chase', 'side', 'orbit', 'chase', 'front', 'tower'][Math.floor(this._cinemaT / 5) % 6];
    }

    if (mode === 'cockpit') {
      /* Regard libre : revient au centre quand on relache. */
      const L = this.look;
      if (!L.hold) {
        const k = Math.exp(-dt * 3.2);
        L.yaw *= k; L.pitch *= k;
      }
      /* Mouvements de la tete : vibrations au roulage, turbulences en vol,
         tassement sous facteur de charge. */
      const now = performance.now() / 1000;
      const spd = Math.min(1, ac.tas / 70);
      const shake = ac.onGround ? spd * 0.005 : (ac.turbulence || 0.3) * 0.010 * (0.4 + spd);
      const hx = (Math.sin(now * 23.1) + 0.6 * Math.sin(now * 9.7)) * shake;
      const hy = (Math.sin(now * 19.3) + 0.6 * Math.sin(now * 7.3)) * shake
               - clamp01s((ac.gLoad - 1) * 0.022, 0.05);
      const eye = new THREE.Vector3(COCKPIT_EYE.x + hx, COCKPIT_EYE.y + hy, COCKPIT_EYE.z)
        .applyQuaternion(ac.quat);
      cam.position.copy(ac.pos).add(eye);
      /* legere inclinaison par defaut vers le tableau de bord */
      this._headEuler.set(-0.17 + L.pitch, L.yaw, 0, 'YXZ');
      this._headQuat.setFromEuler(this._headEuler);
      cam.quaternion.copy(ac.quat).multiply(this._headQuat);
      cam.fov = 82;

    } else if (mode === 'chase') {
      const ks = this.camScale || 1;
      const off = new THREE.Vector3(0, 7.5 * ks, 42 * ks).applyQuaternion(this._smoothQuat);
      cam.position.copy(this._smoothPos).add(off);
      cam.position.y = Math.max(cam.position.y, 1.6);
      /* La camera suit un peu le roulis : on sent les virages. */
      cam.up.lerp(ac.up(), 0.30).normalize();
      const la = ks < 1 ? 0.2 : 0.35;
      cam.lookAt(
        ac.pos.x + ac.vel.x * la,
        ac.pos.y + 2.5 * ks + ac.vel.y * la * 0.85,
        ac.pos.z + ac.vel.z * la
      );
      /* Champ de vision qui s'ouvre avec la vitesse. */
      cam.fov = 58 + Math.min(12, ac.tas * 0.075);

    } else if (mode === 'side' || mode === 'front') {
      /* plan lateral ou de face, un peu en avance de l'appareil */
      const ks = this.camScale || 1;
      const fwd = ac.forward(), right = ac.right();
      if (mode === 'side') cam.position.copy(ac.pos).addScaledVector(right, 34 * ks).addScaledVector(fwd, 12 * ks).add(new THREE.Vector3(0, 6 * ks, 0));
      else cam.position.copy(ac.pos).addScaledVector(fwd, 60 * ks).addScaledVector(right, 10 * ks).add(new THREE.Vector3(0, 8 * ks, 0));
      cam.position.y = Math.max(cam.position.y, 2);
      cam.lookAt(ac.pos);
      cam.fov = 52;

    } else if (mode === 'orbit') {
      this.orbitAngle += dt * 0.22;
      const r = 62 * (this.camScale || 1);
      cam.position.set(
        ac.pos.x + Math.cos(this.orbitAngle) * r,
        ac.pos.y + 14 * (this.camScale || 1),
        ac.pos.z + Math.sin(this.orbitAngle) * r
      );
      cam.position.y = Math.max(cam.position.y, 3);
      cam.lookAt(ac.pos);
      cam.fov = 55;

    } else { /* tower */
      cam.position.copy(this.towerPos);
      cam.lookAt(ac.pos);
      const d = cam.position.distanceTo(ac.pos);
      cam.fov = THREE.MathUtils.clamp(2600 / Math.max(80, d), 8, 55);
    }

    /* Turbo (fun.js) : champ de vision elargi et legere vibration. */
    if (this.fovKick) cam.fov += this.fovKick;
    if (this.camShake) {
      cam.position.x += (Math.random() - 0.5) * this.camShake;
      cam.position.y += (Math.random() - 0.5) * this.camShake;
    }
    cam.updateProjectionMatrix();

    /* Le brouillard s'eclaircit en altitude, en partant de la base
           imposee par l'environnement (meteo + heure). */
        const f = this.scene.fog;
        const base = this._fogBase || { near: 2500, far: 24000 };
        f.near = base.near + ac.pos.y * 2.2;
        f.far = base.far + ac.pos.y * 9;
      },
  nextCamera() {
    const modes = this.activeModel ? this.cameraModes.filter(m => m !== 'cockpit') : this.cameraModes;
    const i = modes.indexOf(this.cameraMode);
    this.cameraMode = modes[(i + 1) % modes.length];
    return this.cameraMode;
  },
  /* Camera troisieme personne suivant le joueur dans le monde libre.
     Le personnage "regarde" dans la direction (sin(heading), 0, cos(heading))
     (voir updateHubScene / grp.rotation.y) : la camera se place donc
     derriere lui, a l'oppose de cette direction, et vise un peu devant lui. */
  updateHubCamera(player, dt) {
    const cam = this.camera;
    this._pilotCamActive = false;
    cam.up.set(0, 1, 0);
    cam.near = 0.5;
      /* En vue libre, c'est le joueur qui est au centre de la carte
         d'ombre : le frustum de 140 m couvre largement l'avatar, les
         agents proches et l'appareil quand on s'en approche. */
      this._shadowFocus = player.pos;
      /* A roulettes (phase 40) : camera plus loin, plus haute et plus large quand on va vite. */
      const rc = player.rideCam;
      const ch = rc && player.camHeading != null ? player.camHeading : player.heading;
      const fwd = new THREE.Vector3(Math.sin(ch), 0, Math.cos(ch));
    const py = player.pos.y || 0;
    const target = new THREE.Vector3(player.pos.x, py + (rc ? rc.look : 1.25), player.pos.z).addScaledVector(fwd, rc ? rc.ahead : 2.2);
    const desired = new THREE.Vector3(player.pos.x, py + (rc ? rc.height : 3.4), player.pos.z).addScaledVector(fwd, rc ? -rc.dist : -6.5);
    /* Dans le terminal, la camera reste sous le plafond et a l'interieur
       des murs (sinon elle traverserait la facade quand on longe une vitre). */
    const hall = this.terminalHall;
    if (hall && this.isInsideTerminal(player.pos.x, player.pos.z)) {
      desired.x = Math.min(hall.x1 - 1.2, Math.max(hall.x0 + 1.2, desired.x));
      desired.z = Math.min(hall.z1 - 1.2, Math.max(hall.z0 + 1.2, desired.z));
      desired.y = Math.min(desired.y, hall.h - 2.2);
    }

    if (!this._hubCamInit) { this._smoothPos.copy(desired); this._hubCamInit = true; }
    this._smoothPos.lerp(desired, Math.min(1, dt * (rc ? rc.follow : 4)));
    cam.position.copy(this._smoothPos);
    cam.lookAt(target);
    const wantFov = rc ? rc.fov : 58;
    cam.fov = this._hubFovOn && Math.abs(cam.fov - wantFov) < 30 ? cam.fov + (wantFov - cam.fov) * Math.min(1, dt * 5) : wantFov;
    this._hubFovOn = true;
    cam.updateProjectionMatrix();
    /* H05 : jumelles, vue zoomee vers la piste qui balaie lentement. */
    if (this.binocOn) {
      const yaw = Math.PI + Math.sin((this.binocT || 0) * 0.35) * 0.7;
      cam.position.set(player.pos.x, py + 1.7, player.pos.z);
      cam.lookAt(player.pos.x + Math.sin(yaw) * 200, py + 1.7 + 6, player.pos.z + Math.cos(yaw) * 200);
      cam.fov = 14;
      cam.updateProjectionMatrix();
    }
        /* En vue pietonne on veut voir loin, mais la meteo doit rester
           sensible : on derive la portee de la base de l'environnement. */
        const base = this._fogBase || { near: 2500, far: 24000 };
        this.scene.fog.near = base.near * 0.16;
        this.scene.fog.far = base.far * 0.25;
      },
  /* Camera troisieme personne suivant l'hotesse/le steward dans l'allee.
     Positions calculees dans le repere cabine puis ramenees au monde par
     la matrice de l'avion : la cabine suit desormais l'appareil. */
  /* K07 : ecran titre vivant. La camera tourne tres lentement autour de l'avion, l'aeroport vit derriere. */
  updateTitleCamera(ac, dt) {
    this._titleA = (this._titleA || 0) + dt * 0.07;
    const a = this._titleA, c = ac.pos;
    const cam = this.camera;
    cam.position.set(c.x + Math.cos(a) * 48, c.y + 11 + Math.sin(a * 1.7) * 3, c.z + Math.sin(a) * 48);
    cam.up.set(0, 1, 0);
    cam.lookAt(c.x, c.y + 3.2, c.z);
    cam.fov = 50;
    cam.updateProjectionMatrix();
    this._shadowFocus = c;
  },

  updateCabinCamera(attendant, dt) {
    const cam = this.camera;
    this._pilotCamActive = false;
    cam.up.set(0, 1, 0);
    cam.near = 0.5;
    const fwd = new THREE.Vector3(Math.sin(attendant.heading), 0, Math.cos(attendant.heading));
    const pos = new THREE.Vector3(attendant.x || 0, 0, attendant.z);
    const target = pos.clone().addScaledVector(fwd, 2.0).setY(1.3);
    target.x = Math.max(-0.5, Math.min(0.5, target.x));
    const desired = pos.clone().addScaledVector(fwd, -3.4).setY(2.0);
    /* La camera reste dans le tube : les cloisons sont a simple face, vue
       de l'exterieur elles disparaissent et laissent voir le ciel. Le
       plafond est a 2,3 m, les cloisons a z = 1,1 (avant) et 1,1 - longueur. */
    if (this.cabinLength) {
      desired.z = Math.min(1.1 - 0.5, Math.max(1.1 - this.cabinLength + 0.5, desired.z));
      desired.x = Math.max(-0.7, Math.min(0.7, desired.x));   // la camera reste dans l'allee
    }

    if (!this._cabinCamInit) { this._cabinCamDesired.copy(desired); this._cabinCamInit = true; }
    this._cabinCamDesired.lerp(desired, Math.min(1, dt * 4.5));

    if (this.cabinGroup) {
      this.cabinGroup.updateWorldMatrix(true, false);
      this._cabinCamPos.copy(this._cabinCamDesired);
      this.cabinGroup.localToWorld(this._cabinCamPos);
      this._cabinTargetPos.copy(target);
      this.cabinGroup.localToWorld(this._cabinTargetPos);
    } else {
      this._cabinCamPos.copy(this._cabinCamDesired);
      this._cabinTargetPos.copy(target);
    }

    cam.position.copy(this._cabinCamPos);
    if (this._cabShake) {
      const tt = performance.now() / 1000;
      cam.position.x += Math.sin(tt * 37) * 0.035;
      cam.position.y += Math.sin(tt * 53) * 0.03;
    }
    cam.lookAt(this._cabinTargetPos);
    cam.fov = 64;
    cam.updateProjectionMatrix();
  },
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
      if (this.bloom) this.bloom.setSize(w, h);
    },
};
