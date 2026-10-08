/* ============================================================
   environment.js — PHASE 7
   Cycle jour/nuit et meteo dynamique.

   Le monde n'est plus fige a midi par temps clair : l'heure de
   jeu avance en continu, le soleil suit sa course (levers et
   couchers compris), et la meteo change toute seule — degage,
   nuageux, pluie, brouillard, orage.

   Ce module ne connait ni Three.js ni le DOM : il ne produit que
   des nombres (direction du soleil, couleurs, intensites, vent).
   C'est `renderer3d.applyEnvironment()` qui les applique a la
   scene, et `main.js` qui en tire le vent et la turbulence du
   modele de vol. Le module reste donc testable seul.
   ============================================================ */

const STORE = 'skymanager.environment';

/* Three.js >= r155 n'applique plus le facteur pi aux lumieres (mode
   physique). Toutes les intensites du projet ont ete reglees pour l'ancien
   mode : on les remet a l'echelle ici, en un seul endroit. */
export const LIGHT_GAIN = Math.PI;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

/* Duree d'un jour complet, en secondes reelles : 20 min, soit
   50 s par heure de jeu. Assez court pour qu'une session voie un
   coucher de soleil, assez long pour ne pas etre une plaie. */
export const DAY_SECONDS = 1200;

/* Duree de la transition entre deux etats meteo. */
const WEATHER_BLEND = 25;

/* ------------------------------------------------------------
   Cles de ciel : heure -> couleurs (haut, milieu, bas) et teinte
   du brouillard. Interpolees lineairement entre deux cles.
   ------------------------------------------------------------ */
const SKY_KEYS = [
  { h: 0.0,  top: 0x050a1a, mid: 0x0a1430, bot: 0x101c38, fog: 0x0a1430 },
  { h: 4.5,  top: 0x081026, mid: 0x14204a, bot: 0x1c2a4e, fog: 0x14204a },
  { h: 6.0,  top: 0x1c3e7c, mid: 0xb8607a, bot: 0xffa060, fog: 0x9a6a78 },
  { h: 7.5,  top: 0x2c6bb5, mid: 0x9fc0e0, bot: 0xe8d8c0, fog: 0xb8c8d8 },
  { h: 12.0, top: 0x1f6fd0, mid: 0x8fc3ee, bot: 0xdceaf5, fog: 0x9fcbee },
  { h: 16.5, top: 0x2c6bb5, mid: 0x9fc8ea, bot: 0xe8dcc8, fog: 0xa8c8e0 },
  { h: 18.5, top: 0x2a3a7a, mid: 0xf06a3a, bot: 0xffb050, fog: 0xd8805a },
  { h: 19.3, top: 0x1c2a5c, mid: 0xb0507a, bot: 0xe08a58, fog: 0x9a6a7a },
  { h: 20.2, top: 0x0e1a3a, mid: 0x3a3a66, bot: 0x6a4a5a, fog: 0x3a3a5a },
  { h: 21.5, top: 0x050a1a, mid: 0x0a1430, bot: 0x101c38, fog: 0x0a1430 },
  { h: 24.0, top: 0x050a1a, mid: 0x0a1430, bot: 0x101c38, fog: 0x0a1430 }
];

/* ------------------------------------------------------------
   Etats meteo. `wind` est la plage de vitesse en m/s dont on tire
   une cible a chaque changement ; `fog` est un facteur applique
   aux distances de brouillard (1 = visibilite nominale, 0.22 =
   brouillard a couper au couteau) ; `dim` attenue le soleil.
   ------------------------------------------------------------ */
export const WEATHERS = {
  clear:  { label: 'Degage',     cloud: 0.35, rain: 0.0, fog: 1.00, wind: [2, 6],   turb: 0.25, dim: 1.00 },
  cloudy: { label: 'Nuageux',    cloud: 0.78, rain: 0.0, fog: 0.85, wind: [5, 11],  turb: 0.45, dim: 0.72 },
  rain:   { label: 'Pluie',      cloud: 0.92, rain: 0.6, fog: 0.60, wind: [8, 16],  turb: 0.70, dim: 0.50 },
  fog:    { label: 'Brouillard', cloud: 0.60, rain: 0.0, fog: 0.22, wind: [1, 4],   turb: 0.20, dim: 0.60 },
  storm:  { label: 'Orage',      cloud: 1.00, rain: 1.0, fog: 0.45, wind: [14, 26], turb: 1.00, dim: 0.35 }
};

/* Poids de tirage : le beau temps reste majoritaire, l'orage rare. */
const WEATHER_WEIGHT = { clear: 34, cloudy: 30, rain: 18, fog: 12, storm: 6 };

/* ------------------------------------------------------------
   Interpolation de couleur : on travaille sur les canaux bruts,
   ce qui suffit pour des degrades de ciel.
   ------------------------------------------------------------ */
function mixHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return ((lerp(ar, br, t) | 0) << 16) | ((lerp(ag, bg, t) | 0) << 8) | (lerp(ab, bb, t) | 0);
}

export class Environment {
  constructor() {
    this.hour = 8.0;              // heure de jeu, 0-24
    this.weather = 'clear';       // etat courant (cible de la transition)
    this._from = { ...WEATHERS.clear };
    this._blend = 1;              // 0 = debut de transition, 1 = arrive
    this._weatherTimer = 210;     // s avant le prochain tirage

    this.windDir = 320;           // provenance, degres
    this.windSpeed = 4.1;         // m/s
    this._windTarget = 4.1;
    this.turbulence = 0.35;

    this._params = { ...WEATHERS.clear };
    this._saveAcc = 0;
    this.load();
  }

  /* ---------------------------------------------------------- */
  /* Avancement                                                 */
  /* ---------------------------------------------------------- */
  update(dt) {
    /* Heure de jeu : un jour complet par DAY_SECONDS reelles. */
    this.hour = (this.hour + (dt / DAY_SECONDS) * 24) % 24;

    /* Meteo : tirage periodique, puis fondu vers le nouvel etat. */
    this._weatherTimer -= dt;
    if (this._weatherTimer <= 0) this._pickWeather();
    if (this._blend < 1) this._blend = Math.min(1, this._blend + dt / WEATHER_BLEND);
    this._params = this._blendParams();

    /* Vent : la direction derive lentement, la vitesse rejoint sa
       cible. Un changement de meteo ne fait donc pas claquer le
       vent d'un coup sous les ailes du pilote. */
    this.windDir = (this.windDir + dt * 0.12) % 360;
    this.windSpeed += (this._windTarget - this.windSpeed) * Math.min(1, dt * 0.12);
    this.turbulence = this._params.turb;

    /* Sauvegarde espacee : inutile d'ecrire a chaque frame. */
    this._saveAcc += dt;
    if (this._saveAcc > 30) { this._saveAcc = 0; this.save(); }
  }

  _pickWeather() {
    const keys = Object.keys(WEATHERS);
    let total = 0;
    const wt = (k) => WEATHER_WEIGHT[k] * (this.kid && (k === 'storm' || k === 'fog' || k === 'rain') ? 0.3 : 1);
    for (const k of keys) if (k !== this.weather) total += wt(k);
    let r = Math.random() * total;
    let next = keys[0];
    for (const k of keys) {
      if (k === this.weather) continue;
      r -= wt(k);
      if (r <= 0) { next = k; break; }
    }

    this._from = { ...this._params };
    this.weather = next;
    this._blend = 0;
    this._weatherTimer = 180 + Math.random() * 300;   // 3 a 8 min

    const range = WEATHERS[next].wind;
    this._windTarget = range[0] + Math.random() * (range[1] - range[0]);
    this.save();
  }

  _blendParams() {
    const a = this._from, b = WEATHERS[this.weather];
    const t = this._blend * this._blend * (3 - 2 * this._blend);   // smoothstep
    return {
      cloud: lerp(a.cloud, b.cloud, t),
      rain: lerp(a.rain, b.rain, t),
      fog: lerp(a.fog, b.fog, t),
      turb: lerp(a.turb, b.turb, t),
      dim: lerp(a.dim, b.dim, t)
    };
  }

  /* ---------------------------------------------------------- */
  /* Soleil                                                     */
  /* ---------------------------------------------------------- */

  /* Direction unitaire du soleil. Repere monde : -Z = nord,
     +X = est, +Z = sud. Le soleil se leve a l'est, culmine au
     sud a midi, se couche a l'ouest. */
  sunDirection() {
    const t = clamp((this.hour - 6) / 12, -0.5, 1.5);   // 0 a 6 h, 1 a 18 h
    const elev = Math.sin(t * Math.PI) * 1.18;           // ~67,6 deg au zenith
    const az = t * Math.PI;                              // 0 = est, PI/2 = sud, PI = ouest
    const ce = Math.cos(elev);
    return { x: Math.cos(az) * ce, y: Math.sin(elev), z: Math.sin(az) * ce };
  }

  /* 0 = nuit noire, 1 = plein jour. Sert de facteur commun a tous
     les eclairages et a l'allumage des feux. */
  get daylight() {
    return clamp(this.sunDirection().y * 3.5, 0, 1);
  }
  get night() { return 1 - this.daylight; }

  /* ---------------------------------------------------------- */
  /* Ciel, brouillard, lumieres                                 */
  /* ---------------------------------------------------------- */
  skyColors() {
    const h = this.hour;
    let i = 0;
    while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].h <= h) i++;
    const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
    const t = clamp((h - a.h) / Math.max(0.001, b.h - a.h), 0, 1);
    return {
      top: mixHex(a.top, b.top, t),
      mid: mixHex(a.mid, b.mid, t),
      bot: mixHex(a.bot, b.bot, t),
      fog: mixHex(a.fog, b.fog, t)
    };
  }

  /* Intensites et teintes des lumieres de la scene. */
  lighting() {
    const d = this.daylight;
    /* Mode Arcade : ciel plus franc, meteo moins sombre. */
    const dim = this.kid ? lerp(this._params.dim, 1, 0.8) : this._params.dim;
    const kg = this.kid ? 1.12 : 1;
    return {
      daylight: d,
      night: 1 - d,
      sunIntensity: 2.4 * d * dim * LIGHT_GAIN,
      /* Le soleil rase est chaud, le soleil haut est blanc. */
      sunColor: mixHex(0xffb070, 0xfff0d8, clamp(d * 1.4, 0, 1)),
      moonIntensity: 0.85 * (1 - d) * LIGHT_GAIN,
      hemiIntensity: lerp(0.5, 1.15, d) * (0.6 + 0.4 * dim) * kg * LIGHT_GAIN,
      ambientIntensity: lerp(0.42, 0.35, d) * LIGHT_GAIN
    };
  }

  /* Distances de brouillard : la meteo resserre la visibilite, la
     nuit la resserre aussi (on voit moins loin dans le noir). */
  fogParams() {
    const f = this._params.fog * lerp(0.75, 1, this.daylight);
    return { near: 2500 * f, far: 24000 * f };
  }

  /* Vent ressenti par l'appareil, en m/s. Meme convention que le
     vent d'origine : `windDir` est la provenance. */
  windVector() {
    const a = this.windDir * Math.PI / 180;
    return { x: -Math.sin(a) * this.windSpeed, y: 0, z: Math.cos(a) * this.windSpeed };
  }

  /* ---------------------------------------------------------- */
  /* Lecture                                                    */
  /* ---------------------------------------------------------- */
  get params() { return this._params; }

  timeLabel() {
    const h = Math.floor(this.hour) % 24;
    const m = Math.floor((this.hour - Math.floor(this.hour)) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  weatherLabel() { return WEATHERS[this.weather].label; }

  /* Resume court pour le HUD : "14:32 · Nuageux · vent 320/08". */
  chip() {
    const kt = Math.round(this.windSpeed * 1.94384);
    return `${this.timeLabel()} · ${this.weatherLabel()} · vent ${String(Math.round(this.windDir)).padStart(3, '0')}/${String(kt).padStart(2, '0')}`;
  }

  /* Resume long pour le rapport d'activite du monde. */
  report() {
    const kt = Math.round(this.windSpeed * 1.94384);
    return `Meteo : ${this.weatherLabel().toLowerCase()}, ${this.timeLabel()}, vent ${String(Math.round(this.windDir)).padStart(3, '0')} a ${kt} kt`;
  }

  /* Reglage manuel de l'heure (menu pause) : sert aussi a tester
     un poser de nuit sans attendre le cycle. */
  setHour(h) {
    this.hour = ((h % 24) + 24) % 24;
    this.save();
  }
  advanceHour(n = 1) { this.setHour(this.hour + n); }

  /* Force un nouveau tirage meteo immediat (menu pause). Le fondu
     reste le meme : la meteo ne claque pas d'un coup. */
  forceWeather() {
    this._pickWeather();
    this._blend = 0;
    return this.weather;
  }

  /* ---------------------------------------------------------- */
  save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        hour: this.hour, weather: this.weather,
        windDir: this.windDir, windSpeed: this.windSpeed
      }));
    } catch (e) { /* ignore */ }
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || '{}');
      if (typeof d.hour === 'number') this.hour = ((d.hour % 24) + 24) % 24;
      if (d.weather && WEATHERS[d.weather]) {
        this.weather = d.weather;
        this._from = { ...WEATHERS[d.weather] };
        this._params = { ...WEATHERS[d.weather] };
      }
      if (typeof d.windDir === 'number') this.windDir = d.windDir;
      if (typeof d.windSpeed === 'number') {
        this.windSpeed = this._windTarget = d.windSpeed;
      }
    } catch (e) { /* ignore */ }
  }
}