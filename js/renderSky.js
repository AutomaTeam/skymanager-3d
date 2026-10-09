/* ============================================================
   renderSky.js — Ciel, dome d'environnement, pluie
   (decoupe de renderer3d.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import * as THREE from 'three';
import * as TEX from './textures.js?v=1791576493';
import { CloudPuffs } from './cloudPuffs.js?v=1791576493';
import { cloudTexture, mixHex } from './renderShared.js?v=1791576493';

export const skyMethods = {
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
        const starCount = 1500;
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
          color: 0xffffff, size: 120, sizeAttenuation: true,
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
    /* K01 : bouffees qu'on traverse (js/cloudPuffs.js) */
    this.cloudPuffs = new CloudPuffs(this.scene, cloudTexture());
  },
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
      },
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
      },
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
      },
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
      },
};
