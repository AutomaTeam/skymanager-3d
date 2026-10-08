/* ============================================================
   renderAvatar.js — Avatar du joueur et techniciens
   (decoupe de renderer3d.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import * as THREE from 'three';
import * as TEX from './textures.js?v=1791471178';
import { spawnModel } from './assetLoader.js?v=1791471178';
import { pbr, MODEL, paintHuman } from './renderShared.js?v=1791471178';

export const avatarMethods = {
  /* ============================================================
     HUB — Monde libre : le joueur incarne un personnage qui se
     deplace autour de l'appareil (ou qu'il se trouve) et de
     l'aeroport, et declenche chaque activite en s'en approchant
     (plus de menu de selection de role).
     ============================================================ */
  /* Personnage generique (agent au sol, hotesse/steward...), uniforme parametrable.
     `withTorch` : chaque SpotLight supplementaire est integree au shader de
     toutes les surfaces eclairees. Les PNJ (phase 2, jusqu'a 24) sont donc
     construits sans lampe ; seuls le joueur et les rares avatars actifs en
     portent une. */
  buildTechnician(uniformColor = 0xd97706, hatColor = 0xf5f5f5, withTorch = true, look = null) {
    const g = new THREE.Group();

    /* Avatar importe (glTF, CC0, anime marche/immobile) : le groupe est
       pose immediatement, le maillage apparait des que le fichier est
       charge (voir assetLoader.spawnModel). Echelle calee sur une
       bounding box mesuree a ~1.75 m de haut a l'origine. */
    const HUMAN_SCALE = 0.325;
    const avatar = spawnModel(MODEL.human, {
      onReady: (m) => {
        if (m.mixer && m.animations.length) {
          const clip = (name) => m.animations.find(a => a.name === name) || null;
          m.actions = {
            idle: (() => { const c = clip('Human Armature|Idle'); return c ? m.mixer.clipAction(c) : null; })(),
            walk: (() => { const c = clip('Human Armature|Walk'); return c ? m.mixer.clipAction(c) : null; })(),
            run: (() => { const c = clip('Human Armature|Run'); return c ? m.mixer.clipAction(c) : null; })(),
            /* Gestes (visiteurs, spotteurs) : saut de joie, bras qui s'activent (on parle). */
            jump: (() => { const c = clip('Human Armature|Jump'); return c ? m.mixer.clipAction(c) : null; })(),
            work: (() => { const c = clip('Human Armature|Working'); return c ? m.mixer.clipAction(c) : null; })()
          };
          if (m.actions.idle) m.actions.idle.play();
        }
        paintHuman(m.scene, uniformColor, look);
      }
    });
    avatar.scale.setScalar(HUMAN_SCALE);
    g.add(avatar);

    /* Marqueur de role : calotte coloree au-dessus de la tete. Le
       maillage importe partage une seule texture peau+tenue ; on ne
       peut pas retexturer juste l'uniforme par role sans la denaturer,
       cette calotte reprend donc le role distinctif de l'ancien casque. */
    const helmet = pbr(TEX.paintedMetal(), { color: hatColor, rough: 0.4, metal: 0.2, repeat: [1, 1] });
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8, 0, 6.283, 0, 1.9), helmet);
    /* Le crane du modele culmine a ~1,71 m (mesure sur la bounding box) ;
       la calotte deborde de 0,04 m sous son centre. */
    hat.position.y = 1.6;
    hat.castShadow = true;
    g.add(hat);

    /* Lampe torche portee (facultative : voir withTorch) */
    let torch = null;
    if (withTorch) {
      torch = new THREE.SpotLight(0xfff3d0, 0, 22, 0.5, 0.4, 1.4);
      torch.position.set(0.25, 1.1, 0.2);
      const torchTarget = new THREE.Object3D();
      torchTarget.position.set(0.25, 0.3, 3);
      g.add(torchTarget);
      torch.target = torchTarget;
      g.add(torch);
    }

    /* Les personnages projettent une ombre : c'est le repere le plus
           lisible pour situer un PNJ par rapport au sol. Ils ne recoivent
           pas d'ombre entre eux (cout inutile a cette echelle). */
        g.traverse(o => { if (o.isMesh) o.castShadow = true; });
        return { group: g, torch, avatar, hat };
  },
  /* Apparence du joueur (look.js) : t-shirt, casquette, peau, cheveux. Repeint l'avatar
     s'il est charge ; sinon l'apparence sera appliquee a son chargement. */
  setPlayerLook(look) {
    this.playerLook = look;
    const P = this.player;
    if (!P) return;
    if (P.hat) P.hat.material.color.setHex(look.cap);
    const m = P.avatar && P.avatar.userData.model;
    if (m && m.scene) paintHuman(m.scene, look.shirt, look);
  },
  /* Fait avancer l'animation (marche/immobile) d'un avatar construit par
     buildTechnician(). `entity` est l'objet {group, torch, avatar}
     retourne par buildTechnician ; `moving` pilote le choix du clip. Ne
     fait rien tant que le glb n'est pas encore charge (avatar.userData
     vide) : le personnage reste alors une simple ombre en attendant. */
  updateAvatarAnim(entity, moving, dt, running = false) {
    const model = entity && entity.avatar && entity.avatar.userData.model;
    if (!model || !model.mixer) return;
    model.mixer.update(dt);
    if (!model.actions) return;
    /* K06 : cadence de marche proportionnelle a l'allure du personnage (1 = normale) */
    if (model.actions.walk) model.actions.walk.timeScale = Math.max(0.7, Math.min(1.4, entity.gaitScale || 1));
    /* Trois allures : immobile, marche, course (clip « Run » du modele). Un geste impose
       (setAvatarPose : saut, bras) remplace l'allure tant qu'il est actif. */
    const forced = entity.pose && model.actions[entity.pose] ? entity.pose : null;
    const want = forced || (!moving ? 'idle' : (running && model.actions.run ? 'run' : 'walk'));
    if ((model._gait || 'idle') !== want) {
      const prev = model.actions[model._gait || 'idle'];
      model._gait = want;
      const next = model.actions[want];
      if (prev) prev.fadeOut(0.2);
      if (next) next.reset().fadeIn(0.2).play();
    }
  },
    /* Masque l'avatar du joueur sans eteindre sa lampe. Le groupe porte
       le SpotLight, et three ignore les lumieres dont un parent est
       invisible : masquer le groupe entier priverait d'eclairage l'agent
       que le joueur conduit. On masque donc les maillages un par un. */
    setPlayerVisible(v) {
      if (!this.player) return;
      const torch = this.player.torch;
      for (const c of this.player.group.children) {
        if (c !== torch) c.visible = v;
      }
    },
  /* Phase 25 : le joueur porte une caisse (visible devant lui). */
  setPlayerCarry(on) {
    if (!this.player) return;
    if (!this._carryCrate) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.5),
        new THREE.MeshStandardMaterial({ color: 0xb7793b, roughness: 0.9 }));
      m.position.set(0, 1.05, 0.5);
      m.castShadow = true;
      this._carryCrate = m;
      this.player.group.add(m);
    }
    this._carryCrate.visible = !!on;
  },
};
