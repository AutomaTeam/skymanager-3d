/* ============================================================
   renderer3d.js — Scene Three.js globale
   Aeroport, terrain, avion articule, cameras, ambiance
   ============================================================ */

import * as THREE from 'three';
import * as TEX from './textures.js?v=1790900000';
import { spawnModel, preload } from './assetLoader.js?v=1790900000';
import { LIGHT_GAIN } from './environment.js?v=1790900000';
import { LAYOUT } from './layout.js?v=1790900000';
import { buildDecor } from './decor.js?v=1790900000';
import { buildSkyLife } from './skylife.js?v=1790900000';
import { REQUEST_ICONS } from './cabinService.js?v=1790900000';
import { AirportLife } from './airportLife.js?v=1790900000';
import { buildCockpit, COCKPIT_EYE } from './cockpit.js?v=1790900000';
import * as AF from './airframe.js?v=1790900000';
import { LiveryRig } from './livery.js?v=1790900000';
import { buildPlaneModel } from './planeModels.js?v=1790900000';
import { buildLandscape, buildAirportDecor } from './scenery.js?v=1790900000';
import { buildTerminalShell, buildTerminalInterior as buildTermFurniture } from './terminalBuilding.js?v=1790900000';

/* Modeles externes (CC0/CC-BY, voir assets/models/CREDITS.md). Le
   fuselage/gouvernes de l'avion jouable restent procedurales (elles sont
   animees par flightPhysics.js et servent d'ancrage au diagnostic
   mecanicien) ; seuls le decor cosmetique et les PNJ passent en glTF. */
const MODEL = {
  human: 'assets/models/character.glb',
  truck: 'assets/models/truck.glb',
  crates: 'assets/models/cargo_crates.glb',
  suitcase: 'assets/models/suitcase.glb',
  gpu: 'assets/models/gpu.glb'
};

export const RUNWAY = {
  length: 3000,
  width: 45,
  startZ: 1500,      // seuil piste 36 (depart vers -Z)
  endZ: -1500
};

/* ---------------------------------------------------------- */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

/* Melange lineaire de deux couleurs 0xRRGGBB. */
function mixHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/* Les jeux de textures de textures.js sont memoises : un meme objet
   Texture est partage par tous les materiaux. Ecrire `repeat` dessus
   (comme le faisait pbr()) faisait donc gagner le dernier materiau cree,
   qui imposait son echelle au terrain, au terminal, a la cabine... On
   derive une copie par couple (texture, repeat) ; l'image, elle, reste
   partagee. */
const _repeatCache = new Map();
function withRepeat(tex, repeat) {
  if (!repeat) return tex;
  const key = tex.uuid + '|' + repeat[0] + '|' + repeat[1];
  let t = _repeatCache.get(key);
  if (!t) {
    t = tex.clone();
    t.repeat.set(repeat[0], repeat[1]);
    t.needsUpdate = true;
    _repeatCache.set(key, t);
  }
  return t;
}

/* ------------------------------------------------------------
   Materiaux PBR
   ------------------------------------------------------------
   Toutes les surfaces du decor passent par `pbr()` : un
   MeshStandardMaterial alimente par un jeu de textures
   procedurales (couleur + normales + rugosite). Le rendu gagne
   le grain, les joints et les rivets qui manquaient aux aplats
   Lambert d'origine, sans ajouter une seule lampe.

   `rough` et `metal` sont les valeurs par defaut du materiau ;
   les textures fournies peuvent les moduler via `roughnessMap`.
   ------------------------------------------------------------ */
function pbr(set, {
  color = 0xffffff, rough = 0.85, metal = 0.0,
  repeat = null, side = THREE.FrontSide, transparent = false,
  opacity = 1, flatShading = false, emissive = 0x000000,
  emissiveIntensity = 1, envMapIntensity = 0.85, alphaTest = 0
} = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: metal,
    side, transparent, opacity, flatShading,
    emissive, emissiveIntensity, envMapIntensity, alphaTest
  });
  if (set) {
    if (set.map) mat.map = withRepeat(set.map, repeat);
    if (set.normalMap) {
      mat.normalMap = withRepeat(set.normalMap, repeat);
      mat.normalScale.set(1, 1);
    }
    if (set.roughnessMap) mat.roughnessMap = set.roughnessMap;
  }
  return mat;
}

/* Plan de l'aeroport (phase 18). Le bloc terminal / porte / passerelle
   (x 230..490, z 1195..1265) est fige : navigation, comptoirs et PNJ en
   dependent. Tout le reste s'organise autour. */
const TOWER = LAYOUT.tower;                        // tour + bureau, a 100 m de la porte
const LINK_Z = LAYOUT.linkZ;                       // bretelles piste <-> taxiway

/* Panneau d'orientation : un sprite (toujours face a la camera) portant un
   grand texte, pour qu'on sache d'un coup d'oeil ou est quoi. */
function makeSign(text, { bg = '#0f766e', fg = '#ffffff', w = 40, h = 11 } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round(512 * h / w);
  const x = c.getContext('2d');
  const r = 36;
  /* roundRect n'existe pas sur les navigateurs anciens : repli sur un rectangle. */
  const rr = (px, py, pw, ph, pr) => { x.beginPath(); if (x.roundRect) x.roundRect(px, py, pw, ph, pr); else x.rect(px, py, pw, ph); x.fill(); };
  x.fillStyle = 'rgba(255,255,255,0.95)';
  rr(4, 4, c.width - 8, c.height - 8, r);
  x.fillStyle = bg;
  rr(16, 16, c.width - 32, c.height - 32, r - 10);
  x.fillStyle = fg;
  x.font = `800 ${Math.round(c.height * 0.44)}px -apple-system, "Segoe UI", sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, c.width / 2, c.height / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
  spr.scale.set(w, h, 1);
  return spr;
}

/* Raccourci vers le jeu de textures du ciel. */
const cloudTexture = () => TEX.cloud().map;

/* ============================================================ */
const clamp01s = (v, lim) => Math.max(-lim, Math.min(lim, v));

/* Le personnage glTF n'a aucune texture (un seul materiau gris) : on le
   colore par sommet selon l'os dominant (tete, bras, jambes, pieds...).
   Materiau mat (metalness 0) : supprime le halo blanc du bloom. */
const SKIN_TONES = [0xf1c9a5, 0xe0ac86, 0xc68642, 0x8d5524, 0xffdbb4];
const HAIR_TONES = [0x2b1d14, 0x5a3825, 0x1a1a1a, 0xb5651d, 0xd9b45b];
function paintHuman(root, shirtHex) {
  const pick = (a) => new THREE.Color(a[Math.floor(Math.random() * a.length)]);
  const skin = pick(SKIN_TONES), hair = pick(HAIR_TONES);
  const shirt = new THREE.Color(shirtHex), pants = new THREE.Color(0x475569), shoes = new THREE.Color(0x1f2937);
  root.traverse((o) => {
    if (!o.isMesh || !o.isSkinnedMesh) return;
    const names = o.skeleton.bones.map(b => b.name);
    const part = names.map(n =>
      /Foot|Toe/.test(n) ? shoes : /UpLeg|Leg|Hips/.test(n) ? pants :
      /HeadTop/.test(n) ? hair : /Head|Neck|Hand|ForeArm/.test(n) ? skin : shirt);
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    const col = new Float32Array(si.count * 3);
    for (let i = 0; i < si.count; i++) {
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      const c = part[best] || shirt;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    o.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, envMapIntensity: 0.5 });
  });
}

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

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xbcdcff, 0x4a5b3a, 1.15 * LIGHT_GAIN);
    this.scene.add(hemi);
      this.hemi = hemi;

      const sun = new THREE.DirectionalLight(0xfff0d8, 2.1 * LIGHT_GAIN);
      sun.position.set(-1200, 2400, 900);
            /* Le soleil est la seule source d'ombre. Le frustum est
               volontairement etroit : une carte de 1024 px couvrant 120 m
               donne 12 cm par texel, largement assez pour l'avion et le
               batiment, et le tri par frustum ecarte tout le reste. */
            sun.castShadow = true;
            sun.shadow.mapSize.set(this.shadowSize, this.shadowSize);
            sun.shadow.camera.near = 1;
            sun.shadow.camera.far = 900;
            sun.shadow.camera.left = -55;
            sun.shadow.camera.right = 55;
            sun.shadow.camera.top = 55;
            sun.shadow.camera.bottom = -55;
            sun.shadow.bias = -0.0006;
            sun.shadow.normalBias = 0.35;
            this.scene.add(sun);
            this.sun = sun;
            /* Cible du soleil : deplacee avec l'appareil pour que le
               frustum d'ombre reste centre sur ce qu'on regarde. */
            this.sunTarget = new THREE.Object3D();
            this.scene.add(this.sunTarget);
            sun.target = this.sunTarget;

      /* Lune : une seule lampe directionnelle, allumee la nuit. Elle
         remplace le soleil couche et evite une scene totalement noire
         ou l'on ne distinguerait plus la piste. */
      const moon = new THREE.DirectionalLight(0x9fb8e8, 0);
      moon.position.set(900, 1600, -700);
      this.scene.add(moon);
      this.moon = moon;

      const amb = new THREE.AmbientLight(0x6a86a8, 0.35 * LIGHT_GAIN);
      this.scene.add(amb);
      this.ambient = amb;
    }

  buildSky() {
    this.skyGroup = new THREE.Group();
    const geo = new THREE.SphereGeometry(30000, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x2c6bb5) },
        mid: { value: new THREE.Color(0x8fc3ee) },
              bot: { value: new THREE.Color(0xd8e8f2) },
              sunDir: { value: new THREE.Vector3(0, 1, 0) },
              sunColor: { value: new THREE.Color(0xfff2d0) },
              sunPower: { value: 1 },
              haze: { value: 0.35 }
            },
            vertexShader: `varying vec3 vDir;
              void main(){ vDir = normalize(position);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
            fragmentShader: `varying vec3 vDir;
              uniform vec3 top, mid, bot, sunColor;
              uniform vec3 sunDir;
              uniform float sunPower, haze;
              void main(){
                float h = clamp(vDir.y, -1.0, 1.0);

                /* Degrade vertical : plus serre pres de l'horizon pour
                   imiter la concentration de l'air. */
                vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.62)) : mix(mid, bot, -h);

                /* Brume d'horizon : bande claire concentree autour de y=0,
                   qui « detache » les objets lointains du ciel. */
                float band = exp(-abs(h) * 9.0);
                c = mix(c, mix(c, bot, 0.55), band * haze);

                /* Diffusion avant : le ciel s'eclaircit du cote du soleil,
                   meme quand celui-ci est sous l'horizon (aube / crepuscule). */
                float sd = max(dot(vDir, sunDir), 0.0);
                c += sunColor * pow(sd, 3.0) * 0.16 * sunPower;
                c += sunColor * pow(sd, 12.0) * 0.30 * sunPower;

                /* Disque solaire : deux lobes de tailles tres differentes
                   donnent un coeur net et un halo large. */
                float ang = acos(clamp(dot(vDir, sunDir), -1.0, 1.0));
                float disc = smoothstep(0.0100, 0.0075, ang);
                float glow = exp(-ang * 26.0) * 0.55 + exp(-ang * 5.0) * 0.16;
                c += sunColor * (disc * 2.6 + glow) * sunPower;

                gl_FragColor = vec4(c, 1.0);
                      /* Sans ces deux inclusions, un ShaderMaterial ecrit ses
                         couleurs lineaires telles quelles dans un framebuffer
                         sRGB : le dome paraitrait presque noir. */
                      #include <tonemapping_fragment>
                      #include <colorspace_fragment>
                    }`
    });
    this.skyGroup.add(new THREE.Mesh(geo, mat));
        this.skyMat = mat;

        /* Etoiles : points fixes sur la voute, reveles par la nuit. */
        const starCount = 900;
        const starPos = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
          /* Repartition uniforme sur la demi-sphere superieure. */
          const u = Math.random() * 2 - 1;
          const phi = Math.random() * Math.PI * 2;
          const r = Math.sqrt(1 - u * u);
          starPos[i * 3] = Math.cos(phi) * r * 26000;
          starPos[i * 3 + 1] = Math.abs(u) * 26000 + 400;
          starPos[i * 3 + 2] = Math.sin(phi) * r * 26000;
        }
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        this.starMat = new THREE.PointsMaterial({
          color: 0xffffff, size: 90, sizeAttenuation: true,
          map: TEX.starSprite().map, alphaTest: 0.02,
          transparent: true, opacity: 0, depthWrite: false
        });
        this.stars = new THREE.Points(starGeo, this.starMat);
        this.skyGroup.add(this.stars);

        /* Nuages : plans semi-transparents a 1200 m */
        const cloudGeo = new THREE.PlaneGeometry(1, 1);
        const cloudMat = new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0.55,
          map: cloudTexture(), depthWrite: false, side: THREE.DoubleSide
        });
        this.cloudMat = cloudMat;
        this.clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 90);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    for (let i = 0; i < 90; i++) {
      const sc = 600 + Math.random() * 1600;
      s.set(sc, sc * 0.7, 1);
      m.compose(new THREE.Vector3(
        (Math.random() - 0.5) * 26000,
        1100 + Math.random() * 900,
        (Math.random() - 0.5) * 26000
      ), q, s);
      this.clouds.setMatrixAt(i, m);
    }
    this.skyGroup.add(this.clouds);
    this.scene.add(this.skyGroup);
  }

      /* ----------------------------------------------------------
         Carte d'environnement (IBL).

         Les materiaux PBR de la phase 8 ont une metalness non nulle
         (carrosseries, aluminium, vitrages) mais rien a reflechir :
         sans `scene.environment`, un metal ne renvoie que la lumiere
         directe et parait terne. On fabrique donc une petite cubemap
         a partir du meme degrade de ciel que le dome, on la passe au
         PMREM (prefiltrage par rugosite), et on la pose comme
         environnement de la scene.

         Cout : une cubemap 128 px et un PMREM 256 px, generes une
         fois au demarrage puis regeneres seulement quand l'heure
         change de plus de 0,25 h — soit environ une fois par seconde
         de jeu. Aucune lampe ajoutee, aucun appel de rendu ajoute.
         ---------------------------------------------------------- */
      buildEnvSky() {
        /* Cube de ciel : 6 faces rendues par une camera cubique. */
        const cubeRT = new THREE.WebGLCubeRenderTarget(128, {
          generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter
        });
        const cubeCam = new THREE.CubeCamera(1, 100, cubeRT);
        this._envCubeRT = cubeRT;
        this._envCubeCam = cubeCam;

        /* Dome dedie, minuscule, rendu uniquement dans la cubemap :
           il ne fait pas partie de la scene visible. */
        const geo = new THREE.SphereGeometry(50, 16, 12);
        const mat = new THREE.ShaderMaterial({
          side: THREE.BackSide, depthWrite: false, depthTest: false,
          uniforms: {
            top: { value: new THREE.Color(0x2c6bb5) },
            mid: { value: new THREE.Color(0x8fc3ee) },
            bot: { value: new THREE.Color(0xd8e8f2) },
            ground: { value: new THREE.Color(0x4a5b3a) }
          },
          vertexShader: `varying float vY;
            void main(){ vY = normalize(position).y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: `varying float vY; uniform vec3 top, mid, bot, ground;
            void main(){
              float h = clamp(vY, -1.0, 1.0);
              /* Sous l'horizon on renvoie le sol : un metal qui
                 plonge vers le bas doit voir du vert, pas du bleu. */
              vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.7))
                               : mix(mid, ground, pow(-h, 0.45));
              gl_FragColor = vec4(c, 1.0);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`
        });
        this._envDome = new THREE.Mesh(geo, mat);
        this._envDomeMat = mat;
        this._envScene = new THREE.Scene();
        this._envScene.add(this._envDome);

        /* PMREM : prefiltre la cubemap par niveau de rugosite, ce qui
           donne des reflets flous sur le plastique et nets sur le
           chrome. */
        this._pmrem = new THREE.PMREMGenerator(this.renderer);
        this._pmrem.compileCubemapShader();
        this._envRT = null;
        /* -99 : la premiere image de jeu declenchera le premier
           rafraichissement. On ne le fait pas ici, car a ce stade la
           scene ne contient encore aucun decor — la carte serait
           posee sur zero materiau. */
        this._envHour = -99;
      }

      /* Regenere la carte d'environnement pour une heure donnee.
         Appelee au demarrage puis par applyEnvironment() quand
         l'heure a assez bouge. */
      refreshEnvMap(hour) {
        if (!this._pmrem || !this._envScene) return;
        const env = this._envSource;
        const sky = env ? env.skyColors() : null;
        const light = env ? env.lighting() : null;
        const top = sky ? sky.top : 0x2c6bb5;
        const mid = sky ? sky.mid : 0x8fc3ee;
        const bot = sky ? sky.bot : 0xd8e8f2;

        /* La nuit, le sol ne renvoie plus du vert mais un gris tres
           sombre : sinon les reflets rasants restent verts a 3 h. */
        const d = light ? light.daylight : 1;
        const ground = mixHex(0x1a2018, 0x4a5b3a, d);

        this._envDomeMat.uniforms.top.value.setHex(top);
        this._envDomeMat.uniforms.mid.value.setHex(mid);
        this._envDomeMat.uniforms.bot.value.setHex(bot);
        this._envDomeMat.uniforms.ground.value.setHex(ground);

        this._envCubeCam.update(this.renderer, this._envScene);
        const rt = this._pmrem.fromCubemap(this._envCubeRT.texture);
        if (this._envRT) this._envRT.dispose();
        this._envRT = rt;
        this._envHour = hour;

        /* On n'applique PAS `scene.environment` : cela ferait
           echantillonner la cubemap par chaque fragment de chaque
           surface, y compris le sol et la piste qui occupent la
           majorite de l'ecran — mesure a +2,4 ms par image, soit le
           budget de 60 fps entierement mange.

           On pose donc la carte explicitement sur les seuls
           materiaux qui en tirent quelque chose : ceux dont la
           metalness est non nulle (aluminium, carrosseries,
           vitrages). Le sol, les murs et les tissus gardent leur
           eclairage direct, sans cout supplementaire.

           Changer la texture d'un `envMap` ne declenche aucune
           recompilation de shader (la cle de programme ne depend que
           de la presence et du type de mapping) : le rafraichissement
           horaire reste donc gratuit. */
        let first = false;
        this.scene.traverse(o => {
          if (!o.isMesh) return;
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of ms) {
            if (!m || !m.isMeshStandardMaterial) continue;
            if (m.metalness < 0.25) continue;
            if (!m.envMap) { m.envMap = rt.texture; m.needsUpdate = true; first = true; }
            else m.envMap = rt.texture;
          }
        });
        this._envApplied = true;
        return first;
      }

      /* ----------------------------------------------------------
         Pluie : un rideau de traits verticaux dans un volume de
         60 x 40 x 60 m qui suit la camera. Les gouttes retombent et
         se recyclent en haut du volume ; le rideau entier est
         simplement masque quand il ne pleut pas, ce qui evite de
         simuler quoi que ce soit par beau temps.
         ---------------------------------------------------------- */
      buildRain() {
        const COUNT = 1400;
        const SPAN = 60, HEIGHT = 40;
        const pos = new Float32Array(COUNT * 6);   // 2 sommets par goutte
        const vel = new Float32Array(COUNT);
        for (let i = 0; i < COUNT; i++) {
          const x = (Math.random() - 0.5) * SPAN;
          const y = Math.random() * HEIGHT;
          const z = (Math.random() - 0.5) * SPAN;
          const len = 0.9 + Math.random() * 1.6;
          pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
          pos[i * 6 + 3] = x; pos[i * 6 + 4] = y - len; pos[i * 6 + 5] = z;
          vel[i] = 26 + Math.random() * 16;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.rainMat = new THREE.LineBasicMaterial({
          color: 0xaecbe8, transparent: true, opacity: 0.0, depthWrite: false
        });
        this.rain = new THREE.LineSegments(geo, this.rainMat);
        this.rain.frustumCulled = false;
        this.rain.visible = false;
        this._rainVel = vel;
        this._rainSpan = SPAN;
        this._rainHeight = HEIGHT;
        this.scene.add(this.rain);
      }

      /* Fait tomber la pluie autour de la camera. `intensity` va de 0
         (sec) a 1 (averse). */
      updateRain(dt, intensity) {
        if (!this.rain) return;
        if (intensity <= 0.01) {
          this.rain.visible = false;
          return;
        }
        this.rain.visible = true;
        this.rainMat.opacity = 0.16 + 0.34 * intensity;

        const cam = this.camera.position;
        this.rain.position.set(cam.x, cam.y - this._rainHeight * 0.45, cam.z);

        const attr = this.rain.geometry.attributes.position;
        const arr = attr.array;
        const span = this._rainSpan, height = this._rainHeight;
        const fall = 1 + intensity * 0.6;
        for (let i = 0; i < this._rainVel.length; i++) {
          const drop = this._rainVel[i] * fall * dt;
          const o = i * 6;
          arr[o + 1] -= drop;
          arr[o + 4] -= drop;
          if (arr[o + 4] < 0) {
            /* Recyclage en haut du volume, a une abscisse nouvelle :
               sinon la pluie tombe en colonnes visibles. */
            const x = (Math.random() - 0.5) * span;
            const z = (Math.random() - 0.5) * span;
            const len = arr[o + 1] - arr[o + 4];
            arr[o] = x; arr[o + 2] = z;
            arr[o + 3] = x; arr[o + 5] = z;
            arr[o + 1] = height;
            arr[o + 4] = height - len;
          }
        }
        attr.needsUpdate = true;
      }

      /* ----------------------------------------------------------
         Applique un etat d'environnement (js/environment.js) a la
         scene : ciel, brouillard, soleil, lune, nuages, etoiles,
         pluie, et allumage des feux de l'aeroport.
         ---------------------------------------------------------- */
      applyEnvironment(env, dt) {
        if (!env) return;
        this._envSource = env;
        const sky = env.skyColors();
        const light = env.lighting();
        const fog = env.fogParams();
        const p = env.params;

        /* Ciel : les trois bandes du degrade, plus la position du soleil
                   pour le disque, le halo et la diffusion avant. */
                if (this.skyMat) {
                  this.skyMat.uniforms.top.value.setHex(sky.top);
                  this.skyMat.uniforms.mid.value.setHex(sky.mid);
                  this.skyMat.uniforms.bot.value.setHex(sky.bot);
                  const sd = env.sunDirection();
                  this.skyMat.uniforms.sunDir.value.copy(sd);
                  /* Le soleil ne « brille » que lorsqu'il est au-dessus de
                     l'horizon ; sous l'horizon on garde une faible lueur
                     residuelle pour l'aube et le crepuscule. */
                  const above = Math.max(0, sd.y);
                  this.skyMat.uniforms.sunPower.value = Math.min(1, above * 6 + 0.06);
                  this.skyMat.uniforms.sunColor.value.setHex(light.sunColor);
                  /* Brume d'horizon : plus dense quand la visibilite
                                       baisse. `p.fog` est un facteur de visibilite
                                       (1 = degage, 0,22 = brouillard a couper au
                                       couteau), il faut donc l'inverser. */
                                    this.skyMat.uniforms.haze.value =
                                      0.20 + (1 - (p.fog ?? 1)) * 0.55 + (p.cloud || 0) * 0.22;
                }
        /* Carte d'environnement : regeneree seulement quand l'heure a
           bouge de plus de 0,25 h (environ une fois par seconde de
           jeu). Le rendu d'une cubemap 128 px coute moins d'une
           milliseconde, mais inutile de le faire a chaque image. */
        if (Math.abs(env.hour - this._envHour) > 0.25) {
          this.refreshEnvMap(env.hour);
        }
        /* Les appareils construits apres coup (interieurs, cabine)
           n'ont pas encore recu la carte : on la leur pose une fois,
           au premier passage. */
        if (this._envRT && !this._envApplied) this.refreshEnvMap(env.hour);
        this.scene.background.setHex(sky.fog);
        this.scene.fog.color.setHex(sky.fog);
        /* On memorise la base : updateCamera() l'etend ensuite avec
           l'altitude, ce qui evite que les deux se marchent dessus. */
        this._fogBase = { near: fog.near, far: fog.far };
        this.scene.fog.near = fog.near;
        this.scene.fog.far = fog.far;

        /* Soleil : position sur la voute, intensite et teinte. */
        const d = env.sunDirection();
        if (this.sun) {
                  /* Le frustum d'ombre suit l'appareil : on place la cible
                     sur lui et la lampe a 400 m dans la direction du soleil.
                     Le soleil reste donc « a l'infini » optiquement, mais sa
                     carte d'ombre ne couvre que la zone utile. */
                  const focus = this._shadowFocus || { x: 0, y: 0, z: 0 };
                  this.sunTarget.position.set(focus.x, focus.y, focus.z);
                  this.sunTarget.updateMatrixWorld();
                  this.sun.position.set(
                    focus.x + d.x * 400,
                    focus.y + Math.max(60, d.y * 400),
                    focus.z + d.z * 400
                  );
                  this.sun.intensity = light.sunIntensity;
                  this.sun.color.setHex(light.sunColor);
                  /* Sous l'horizon, plus rien a ombrer : on coupe la carte
                                       pour ne pas payer un rendu inutile toute la nuit.
                                       Idem dans les interieurs (cabine, terminal) : la
                                       carte d'ombre n'y apporte rien et coute un rendu
                                       complet du decor exterieur. */
                                    const interior = this.cameraMode === 'cabin' || this.cameraMode === 'terminal';
                                    this.sun.castShadow = this.shadowsEnabled && d.y > 0.06 && !interior;
                }
        if (this.moon) {
          this.moon.intensity = light.moonIntensity;
          /* La lune se leve a l'oppose du soleil : elle eclaire donc la
             scene quand le soleil est passe sous l'horizon. */
          this.moon.position.set(-d.x * 3000, Math.max(200, -d.y * 3000 + 900), -d.z * 3000);
        }
        /* Dans un interieur (cabine, terminal) la carte d'ombre est coupee :
           le soleil traverserait donc le toit et delaverait tout. Il est
           remplace par les lampes et l'ambiance propres au lieu. */
        const inside = this.cameraMode === 'cabin' || this.cameraMode === 'terminal';
        if (this.sun && inside) this.sun.intensity = 0;
        if (this.moon && inside) this.moon.intensity = 0;
        if (this.hemi) this.hemi.intensity = light.hemiIntensity * (inside ? 0.45 : 1);
        if (this.ambient) this.ambient.intensity = light.ambientIntensity * (inside ? 0.6 : 1);

        /* Etoiles : opacite liee a la nuit, et leger scintillement. */
        if (this.starMat) {
          this.starMat.opacity = Math.max(0, light.night - 0.25) * 1.3;
          this.stars.visible = this.starMat.opacity > 0.02;
        }

        /* Nuages : densite et teinte (gris sous la pluie, dores au
           coucher du soleil). */
        if (this.cloudMat) {
          this.cloudMat.opacity = 0.18 + 0.5 * p.cloud;
          this.cloudMat.color.setHex(mixHex(0xffffff, 0x8a94a4, clamp(p.cloud * 0.9, 0, 1)));
          this.clouds.visible = p.cloud > 0.05;
        }

        this.updateRain(dt || 0, p.rain);
        if (this.skyLife) this.skyLife.update(dt || 0, env, this.camera.position);
        /* Feux de piste et de balisage : allumes des que la nuit tombe
           ou que la visibilite se degrade. */
        const lightsOn = light.night > 0.25 || p.fog < 0.5;
        if (this.runwayLights) {
          this.runwayLights.material.color.setHex(lightsOn ? 0xfff2c0 : 0xd8d2b0);
        }
        if (this.approachMat) {
          this.approachMat.color.setHex(lightsOn ? 0xffffff : 0xcfd6dd);
        }
        if (this.apronLamps) {
          for (const l of this.apronLamps) l.intensity = (lightsOn ? 1.6 : 0.5) * LIGHT_GAIN;
        }
        /* Interieurs : la cabine et le hall s'eclairent franchement la
           nuit, ou l'eclairage naturel ne suffit plus. */
        if (this.cabinLamps) {
          for (const l of this.cabinLamps) l.intensity = (1.0 + 0.5 * light.night) * LIGHT_GAIN;
        }
        this._nightLevel = light.night;
        if (this.decorApi) this.decorApi.setNight(light.night);
        /* Le vitrage du terminal s'allume la nuit. */
        if (this.terminalGlassMat) {
          this.terminalGlassMat.emissive.setHex(0xffd98a);
          this.terminalGlassMat.emissiveIntensity = lightsOn ? 0.8 : 0;
        }
        /* Balise de la tour : clignote en rouge la nuit, sombre le jour. */
        if (this.towerBeacon) {
          const on = lightsOn && Math.sin(performance.now() / 1000 * 3.1) > 0.2;
          this.towerBeacon.material.color.setHex(on ? 0xff3030 : 0x5a1010);
        }
        this._lightsOn = lightsOn;
      }

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
      }

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
      }

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
      }

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
      }

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
  }

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
    const glassMat = pbr(TEX.glassGrid(), { color: 0xffffff, rough: 0.08, metal: 0.75, repeat: [1, 1] });
    const metalMat = pbr(TEX.metal(), { color: 0xb8c0ca, rough: 0.32, metal: 0.85, repeat: [2, 2] });
    const turbineMat = pbr(TEX.turbine(), { color: 0xffffff, rough: 0.42, metal: 0.7, repeat: [1, 1] });
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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
        A.landingLight.intensity = (ac.gearDown && ac.pos.y < 900) ? 4.5 * LIGHT_GAIN : 0;

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
        const wingOn = (night || (airborne && ac.pos.y < 900)) && ac.gearDown;
        A.wingLights.forEach(l => l.intensity = wingOn ? 3.2 * LIGHT_GAIN : 0);
      }

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
  buildTechnician(uniformColor = 0xd97706, hatColor = 0xf5f5f5, withTorch = true) {
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
            walk: (() => { const c = clip('Human Armature|Walk'); return c ? m.mixer.clipAction(c) : null; })()
          };
          if (m.actions.idle) m.actions.idle.play();
        }
        paintHuman(m.scene, uniformColor);
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
        return { group: g, torch, avatar };
  }

  /* Fait avancer l'animation (marche/immobile) d'un avatar construit par
     buildTechnician(). `entity` est l'objet {group, torch, avatar}
     retourne par buildTechnician ; `moving` pilote le choix du clip. Ne
     fait rien tant que le glb n'est pas encore charge (avatar.userData
     vide) : le personnage reste alors une simple ombre en attendant. */
  updateAvatarAnim(entity, moving, dt) {
    const model = entity && entity.avatar && entity.avatar.userData.model;
    if (!model || !model.mixer) return;
    model.mixer.update(dt);
    if (!model.actions) return;
    const want = !!moving;
    if (model._walking !== want) {
      model._walking = want;
      const next = want ? model.actions.walk : model.actions.idle;
      const prev = want ? model.actions.idle : model.actions.walk;
      if (prev) prev.fadeOut(0.2);
      if (next) next.reset().fadeIn(0.2).play();
    }
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
      this.player = this.buildTechnician(0xf97316, 0xf5f5f5);
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
    }

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
  }

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
  }

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
  }

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
  }

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
  }

  exitCabinMode() {
    if (this.cabinGroup) this.cabinGroup.visible = false;
    this.insideCabin = false;
    if (this.attendant) this.attendant.group.visible = false;
    this.cameraMode = 'chase';
  }

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
  }

  /* Camera troisieme personne suivant l'hotesse/le steward dans l'allee.
     Positions calculees dans le repere cabine puis ramenees au monde par
     la matrice de l'avion : la cabine suit desormais l'appareil. */
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
    const target = Math.max(0, Math.min(1, 1 - (dist - 8) / 45));
    this._termK += (target - this._termK) * Math.min(1, dt * 3);
    const night = this._nightLevel || 0;
    this._termApi.setLightLevel(this._termK, night);
    this.insideTerminal = dist === 0;
    if (this._termK < 0.02 && target === 0) return;   // hors de portee : pas d'animation

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
    this.updateAvatarAnim(this.player, player.moving, dt);
      /* La lampe suit le corps joue : l'avatar du joueur, ou l'agent
         qu'il conduit (la camera est alors sur l'agent). */
      if (this.player.torch) this.player.torch.intensity = 1.6 * LIGHT_GAIN;

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
      }

  nextCamera() {
    const modes = this.activeModel ? this.cameraModes.filter(m => m !== 'cockpit') : this.cameraModes;
    const i = modes.indexOf(this.cameraMode);
    this.cameraMode = modes[(i + 1) % modes.length];
    return this.cameraMode;
  }

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
        /* En vue pietonne on veut voir loin, mais la meteo doit rester
           sensible : on derive la portee de la base de l'environnement. */
        const base = this._fogBase || { near: 2500, far: 24000 };
        this.scene.fog.near = base.near * 0.16;
        this.scene.fog.far = base.far * 0.25;
      }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
      if (this.bloom) this.bloom.setSize(w, h);
    }

    /* ----------------------------------------------------------
       Bloom.

       Les feux de piste, les lampadaires du tarmac, le disque solaire
       et les lumieres d'interieur sont des objets emissifs : sans
       diffusion, ils restent des taches plates. On ajoute donc une
       passe de bloom « bright pass + flou separable » a demi
       resolution, ecrite a la main plutot qu'importee d'UnrealBloomPass
       (qui coute cinq passes plein ecran et un EffectComposer complet).

       Cout : 3 passes a 1/4 de la surface (extraction, flou H, flou V)
       plus une composition. Sur la cible iPad cela represente environ
       0,6 ms — acceptable pour le gain visuel.

       Le seuil est volontairement haut (0,85) : seules les sources
       vraiment lumineuses diffusent, pas le ciel ni le sable clair.
       ---------------------------------------------------------- */
    buildBloom() {
      const quadGeo = new THREE.PlaneGeometry(2, 2);
      const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const quad = new THREE.Mesh(quadGeo, null);
      const quadScene = new THREE.Scene();
      quadScene.add(quad);

      const rtOpts = {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false
      };
      const brightRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);
      const blurRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);
      /* Cible pleine resolution de la scene : la passe de composition doit
         pouvoir la rechantillonner comme texture, ce que le framebuffer par
         defaut (canvas) ne permet pas. */
      const sceneRT = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        depthBuffer: true, stencilBuffer: false
      });

      const brightMat = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          threshold: { value: 0.85 },
          knee: { value: 0.35 }
        },
        vertexShader: `varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: `varying vec2 vUv;
          uniform sampler2D tDiffuse; uniform float threshold, knee;
          void main(){
            vec3 c = texture2D(tDiffuse, vUv).rgb;
            float l = max(c.r, max(c.g, c.b));
            /* Rampe douce : evite une coupure nette qui scintille
               quand une source traverse le seuil. */
            float w = smoothstep(threshold, threshold + knee, l);
            gl_FragColor = vec4(c * w, 1.0);
          }`
      });

      const blurMat = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          dir: { value: new THREE.Vector2(1, 0) },
          texel: { value: new THREE.Vector2(1 / 512, 1 / 512) }
        },
        vertexShader: `varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: `varying vec2 vUv;
          uniform sampler2D tDiffuse; uniform vec2 dir, texel;
          void main(){
            /* Neuf taps gaussiens : suffisant a demi resolution. */
            vec2 o = dir * texel;
            vec3 s = texture2D(tDiffuse, vUv).rgb * 0.227027;
            s += texture2D(tDiffuse, vUv + o * 1.3846).rgb * 0.316216;
            s += texture2D(tDiffuse, vUv - o * 1.3846).rgb * 0.316216;
            s += texture2D(tDiffuse, vUv + o * 3.2308).rgb * 0.070270;
            s += texture2D(tDiffuse, vUv - o * 3.2308).rgb * 0.070270;
            gl_FragColor = vec4(s, 1.0);
          }`
      });

      const compMat = new THREE.ShaderMaterial({
        depthTest: false, depthWrite: false,
        uniforms: {
          tDiffuse: { value: null },
          tBloom: { value: null },
          strength: { value: 0.62 }
        },
        vertexShader: `varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: `varying vec2 vUv;
          uniform sampler2D tDiffuse, tBloom; uniform float strength;
          void main(){
            vec3 base = texture2D(tDiffuse, vUv).rgb;
            vec3 bloom = texture2D(tBloom, vUv).rgb;
            /* Etalonnage doux (plan graphisme) : saturation +12 %, leger vignettage. */
            float l = dot(base, vec3(0.299, 0.587, 0.114));
            vec3 c = mix(vec3(l), base, 1.12);
            vec2 d = vUv - 0.5;
            c *= 1.0 - dot(d, d) * 0.32;
            gl_FragColor = vec4(c + bloom * strength, 1.0);
          }`
      });

      this.bloom = {
        enabled: true, strength: 0.62,
        quad, quadScene, quadCam, brightRT, blurRT, sceneRT,
        brightMat, blurMat, compMat,
        setSize: (w, h) => {
          const bw = Math.max(2, Math.floor(w / 4));
          const bh = Math.max(2, Math.floor(h / 4));
          brightRT.setSize(bw, bh);
          blurRT.setSize(bw, bh);
          sceneRT.setSize(Math.max(2, Math.floor(w)), Math.max(2, Math.floor(h)));
          blurMat.uniforms.texel.value.set(1 / bw, 1 / bh);
        }
      };
      this.bloom.setSize(window.innerWidth, window.innerHeight);
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
