/* ============================================================
   renderLights.js — Lumieres, environnement, bloom
   (decoupe de renderer3d.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import * as THREE from 'three';
import { LIGHT_GAIN } from './environment.js?v=1791603808';
import { mixHex, clamp } from './renderShared.js?v=1791603808';

export const lightMethods = {
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
    },
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
                                    this.sun.castShadow = this.shadowsEnabled && d.y > 0.06 && !interior && !(focus.y > 600);   // D04 : pas d'ombres en vol haut
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
        /* Une lumiere a 0 coute autant qu'une allumee (chaque pixel la calcule) : on la retire. */
        if (this.moon) this.moon.visible = this.moon.intensity > 0.001;
        if (this.hemi) this.hemi.intensity = light.hemiIntensity * (inside ? 0.45 : 1);
        if (this.ambient) this.ambient.intensity = light.ambientIntensity * (inside ? 0.6 : 1);

        /* Etoiles : opacite liee a la nuit, et leger scintillement. */
        if (this.starMat) {
          this.starMat.opacity = Math.max(0, light.night - 0.15) * 1.5;
          this.stars.visible = this.starMat.opacity > 0.02;
        }

        /* Nuages : densite et teinte (gris sous la pluie, dores au
           coucher du soleil). */
        if (this.cloudMat) {
          this.cloudMat.opacity = 0.18 + 0.5 * p.cloud;
          this.cloudMat.color.setHex(mixHex(0xffffff, 0x8a94a4, clamp(p.cloud * 0.9, 0, 1)));
          this.clouds.visible = p.cloud > 0.05;
        }
        if (this.cloudPuffs) this.cloudPuffs.update(dt || 0, this.camera.position, p.cloud, this.cloudMat ? this.cloudMat.color.getHex() : 0xffffff);

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
        /* Lampadaires du tarmac : la nuit seulement (le jour, quatre lumieres de plus
           calculees pour chaque pixel, sans rien eclairer de visible). */
        if (this.apronLamps) {
          for (const l of this.apronLamps) { l.intensity = lightsOn ? 1.6 * LIGHT_GAIN : 0; l.visible = lightsOn; }
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
      },
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
    },
};
