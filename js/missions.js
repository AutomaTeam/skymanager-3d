/* ============================================================
   missions.js — PHASE 12
   Objectifs de vol.

   Jusqu'ici le jeu n'avait aucune raison de voler : on decollait,
   on se posait, et le rapport notait le poser. Aucun but, aucune
   contrainte, aucune recompense a la cle.

   Ce module fournit une rotation de contrats. Chaque contrat est
   un ensemble de criteres verifiables sur le journal de vol
   (duree, altitude max, carburant brule, heure, vent traversier,
   etat de l'appareil) plus les criteres de poser deja produits
   par le modele de vol. Un contrat reussi paie une prime et de la
   reputation ; un contrat echoue ne coute rien d'autre que
   l'occasion manquee — la sanction reste le vol lui-meme.

   Le module ne connait ni Three.js ni le DOM : il ne manipule que
   des nombres. C'est `main.js` qui collecte le journal de vol et
   qui affiche le contrat actif.
   ============================================================ */

const STORE = 'skymanager.missions';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ------------------------------------------------------------
   Contrats. `crit` est une liste de criteres ; chacun rend une
   fraction 0-1 de reussite. Le contrat est rempli quand tous les
   criteres sont a 1. `reward` est la prime en EUR, `rep` le gain
   de reputation.

   `min` sert a ecarter un contrat quand le contexte ne s'y prete
   pas (ex. un contrat de vent traversier par temps calme) : le
   tirage le retire de l'urne plutot que de le rendre impossible.
   ------------------------------------------------------------ */
export const MISSIONS = [
  {
    id: 'rotation',
    label: 'Rotation commerciale',
    brief: 'Emportez au moins 120 passagers et posez-vous proprement.',
    reward: 45000, rep: 2,
    crit: [
      { key: 'pax', label: 'Passagers', need: 120, of: c => c.pax },
      { key: 'fpm', label: 'Taux de chute < 320 fpm', need: 1, of: c => c.fpm < 320 ? 1 : 0 },
      { key: 'offset', label: 'Écart axe < 30 m', need: 1, of: c => c.offset < 30 ? 1 : 0 }
    ]
  },
  {
    id: 'precision',
    label: 'Poser de précision',
    brief: 'Touchez la piste à moins de 150 fpm, dans un couloir de 8 m.',
    reward: 70000, rep: 3,
    crit: [
      { key: 'fpm', label: 'Taux de chute < 150 fpm', need: 1, of: c => c.fpm < 150 ? 1 : 0 },
      { key: 'offset', label: 'Écart axe < 8 m', need: 1, of: c => c.offset < 8 ? 1 : 0 },
      { key: 'bank', label: 'Inclinaison < 3 deg', need: 1, of: c => c.bank < 3 ? 1 : 0 }
    ]
  },
  {
    id: 'night',
    label: 'Vol de nuit',
    brief: 'Décollez et posez-vous entre 20 h et 6 h, feux allumés.',
    reward: 80000, rep: 3,
    crit: [
      { key: 'night', label: 'Poser de nuit', need: 1, of: c => c.night ? 1 : 0 },
      { key: 'fpm', label: 'Taux de chute < 350 fpm', need: 1, of: c => c.fpm < 350 ? 1 : 0 }
    ]
  },
  {
    id: 'economy',
    label: 'Vol économique',
    brief: 'Tenez au moins 3 minutes en brûlant moins de 900 kg.',
    reward: 60000, rep: 2,
    crit: [
      { key: 'duration', label: 'Durée >= 180 s', need: 180, of: c => c.duration },
      { key: 'fuel', label: 'Carburant brûle <= 900 kg', need: 1, of: c => c.fuelUsed <= 900 ? 1 : 0 }
    ]
  },
  {
    id: 'crosswind',
    label: 'Vent traversier',
    brief: 'Posez-vous avec au moins 7 m/s de vent de travers, ailes à plat.',
    reward: 85000, rep: 4,
    min: c => c.windSpeed >= 6,
    crit: [
      { key: 'xwind', label: 'Vent de travers >= 7 m/s', need: 7, of: c => c.crosswind },
      { key: 'bank', label: 'Inclinaison < 5 deg', need: 1, of: c => c.bank < 5 ? 1 : 0 },
      { key: 'fpm', label: 'Taux de chute < 300 fpm', need: 1, of: c => c.fpm < 300 ? 1 : 0 }
    ]
  },
  {
    id: 'altitude',
    label: 'Croisière haute',
    brief: 'Montez au-dessus de 8 000 ft et tenez 4 minutes de vol.',
    reward: 65000, rep: 2,
    crit: [
      { key: 'alt', label: 'Altitude max >= 8 000 ft', need: 8000, of: c => c.maxAlt },
      { key: 'duration', label: 'Durée >= 240 s', need: 240, of: c => c.duration }
    ]
  },
  {
    id: 'clean',
    label: 'Appareil irreprochable',
    brief: 'Volez avec un appareil dont aucun composant ne dépasse 55 % d\'usure.',
    reward: 55000, rep: 3,
    crit: [
      { key: 'wear', label: 'Usure max < 55 %', need: 1, of: c => c.worstWear < 55 ? 1 : 0 },
      { key: 'fpm', label: 'Taux de chute < 300 fpm', need: 1, of: c => c.fpm < 300 ? 1 : 0 }
    ]
  },
  {
    id: 'longhaul',
    label: 'Long-courrier',
    brief: 'Sept minutes de vol et 10 000 ft au compteur.',
    reward: 110000, rep: 5,
    crit: [
      { key: 'duration', label: 'Durée >= 420 s', need: 420, of: c => c.duration },
      { key: 'alt', label: 'Altitude max >= 10 000 ft', need: 10000, of: c => c.maxAlt }
    ]
  }
];

export class MissionSystem {
  constructor() {
    this.active = null;
    this.completed = 0;
    this.failed = 0;
    this.earned = 0;
    this.history = [];        // 12 derniers contrats, pour le panneau de gestion
    this._seq = 0;
    this.load();
    if (!this.active) this.active = this.pick();
  }

  /* Tirage d'un contrat. On ecarte le contrat deja en cours et ceux
     dont la precondition n'est pas remplie par la meteo du moment. */
  pick(ctx = {}) {
    const pool = MISSIONS.filter(m => m.id !== (this.active && this.active.id) && (!m.min || m.min(ctx)));
    const list = pool.length ? pool : MISSIONS.filter(m => m.id !== (this.active && this.active.id));
    const m = list[Math.floor(Math.random() * list.length)] || MISSIONS[0];
    this._seq++;
    return { ...m, seq: this._seq };
  }

  /* Remplace le contrat en cours (bouton "nouveau contrat" du panneau). */
  reroll(ctx = {}) {
    this.active = this.pick(ctx);
    this.save();
    return this.active;
  }

  /* Avancement d'un critere, 0-1. */
  static critProgress(crit, ctx) {
      if (typeof crit.of !== 'function') return 0;
      const v = crit.of(ctx);
      if (crit.need <= 1) return clamp(v, 0, 1);
      return clamp(v / crit.need, 0, 1);
    }

  /* Evaluation complete du contrat actif sur le journal de vol.
     Rend { ok, progress, rows } ou `rows` sert a l'affichage detaille
     du rapport d'atterrissage. */
  evaluate(ctx) {
    const m = this.active;
    if (!m) return { ok: false, progress: 0, rows: [] };
    const rows = m.crit.map(c => {
      const p = MissionSystem.critProgress(c, ctx);
      return { label: c.label, progress: p, ok: p >= 1 };
    });
    const progress = rows.reduce((s, r) => s + r.progress, 0) / rows.length;
    const ok = rows.every(r => r.ok);
    return { ok, progress, rows };
  }

  /* Enregistre le resultat et rend la prime a verser. */
  settle(ctx) {
    const m = this.active;
    const res = this.evaluate(ctx);
    const entry = {
      id: m.id, label: m.label, ok: res.ok,
          progress: res.progress, reward: res.ok ? m.reward : 0, rep: res.ok ? m.rep : 0,
          rows: res.rows
        };
    if (res.ok) { this.completed++; this.earned += m.reward; }
    else this.failed++;
    this.history.unshift(entry);
    this.history = this.history.slice(0, 12);
    this.active = this.pick(ctx);
    this.save();
    return { ...entry, next: this.active };
  }

  /* Resume court pour le bandeau HUD. */
  chip(ctx) {
    const m = this.active;
    if (!m) return 'Aucun contrat';
    const res = this.evaluate(ctx);
    return `${m.label} — ${Math.round(res.progress * 100)}%`;
  }

  save() {
    try {
        /* On ne sauvegarde que l'identifiant du contrat : les criteres
           portent des fonctions, que JSON.stringify supprime. Les
           recharger depuis la definition du module est la seule facon
           de retrouver un contrat evaluable. */
        localStorage.setItem(STORE, JSON.stringify({
          activeId: this.active ? this.active.id : null,
          completed: this.completed, failed: this.failed,
          earned: this.earned, history: this.history, seq: this._seq
        }));
      } catch (e) { /* ignore */ }
    }

    load() {
      try {
        const d = JSON.parse(localStorage.getItem(STORE) || '{}');
        if (d.activeId) {
          const def = MISSIONS.find(m => m.id === d.activeId);
          if (def) this.active = { ...def, seq: d.seq || 0 };
        }
        if (typeof d.completed === 'number') this.completed = d.completed;
        if (typeof d.failed === 'number') this.failed = d.failed;
        if (typeof d.earned === 'number') this.earned = d.earned;
        if (Array.isArray(d.history)) this.history = d.history;
        if (typeof d.seq === 'number') this._seq = d.seq;
      } catch (e) { /* ignore */ }
    }

  static reset() {
    try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
  }
}