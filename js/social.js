/* ============================================================
   social.js — Dire bonjour aux gens de l'aeroport (mode Arcade)

   A pied, pres de n'importe quelle personne (passager du hall,
   voyageur du parking, employe, mecanicien, agent de piste), le
   bouton contextuel devient « 👋 DIRE BONJOUR ». La personne
   repond par une bulle emoji et une petite phrase. Premier bonjour
   a une personne : +1 piece (12 par jour au plus).

   Pres de Biscuit (pet.js), le meme bouton sert a le caresser.
   ============================================================ */

import { sfx } from './sfx.js?v=1791300000';
import { collectBodies } from './bodies.js?v=1791300000';
import { emojiSprite } from './groundFun.js?v=1791300000';

const RANGE = 2.8;               // m pour saluer quelqu'un
const COINS_PER_DAY = 12;
const EMOJIS = ['😄', '👋', '😊', '🤩', '😁', '🙌', '😎', '🥰'];
const LINES = {
  passenger: [
    'Bonjour ! Je pars en vacances a la mer !',
    'Coucou ! Tu travailles ici ? Trop de la chance !',
    'Salut ! C\'est mon premier voyage en avion !',
    'Bonjour ! J\'ai mis mon maillot de bain dans ma valise.',
    'Hello ! Je vais voir ma mamie, elle fait les meilleures crepes.',
    'Salut ! Tu sais ou on achete des bonbons ?'
  ],
  staff: [
    'Salut chef ! On travaille dur pour toi !',
    'Bonjour patron ! Tout va bien ici.',
    'Coucou ! Merci de m\'avoir embauche !'
  ],
  mechanic: [
    'Salut ! L\'avion brille grace a toi !',
    'Bonjour ! J\'ai serre tous les boulons !',
    'Coucou ! Tu veux m\'aider a reparer ?'
  ],
  ramp: [
    'Salut ! Je guide les avions avec mes batons lumineux !',
    'Bonjour ! Attention aux helices !',
    'Coucou ! Les valises sont bien rangees.'
  ],
  pilot: [
    'Salut ! Je suis le commandant. On decolle bientot !',
    'Bonjour ! Tu veux devenir pilote plus tard ?'
  ],
  attendant: [
    'Bonjour ! Bienvenue dans notre compagnie !',
    "Coucou ! J'ai prepare plein de jus d'orange."
  ],
  spotter: [
    'Regarde ! Le prochain avion va decoller juste devant nous !',
    'Je collectionne les photos d\'avions. J\'en ai plus de mille !',
    'Tu entends ? C\'est le bruit des reacteurs, j\'adore !',
    'Ici, c\'est la meilleure place de l\'aeroport pour voir les avions.'
  ],
  spotterKid: [
    'Coucou ! Plus tard, je serai pilote !',
    'Mon papa m\'emmene voir les avions tous les dimanches !'
  ],
  other: [
    'Bonjour ! Belle journee pour voler !',
    'Salut ! Ton aeroport est super !',
    'Coucou ! J\'adore les avions !'
  ]
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export class Social {
  constructor(game) {
    this.g = game;
    this.greeted = new Set();    // personnes deja saluees (pieces)
    this.fx = [];                // bulles en cours { spr, t }
    this._near = null;
  }

  /* Type de la personne, d'apres l'objet source de collectBodies. */
  _kind(ref) {
    const g = this.g;
    if (typeof ref === 'number') return 'passenger';                       // passager du hall
    if (ref && ref.spotter) return ref.kid ? 'spotterKid' : 'spotter';
    if (g.agents && g.agents.agents.includes(ref)) return LINES[ref.role] ? ref.role : 'other';
    if (g.staff && [...g.staff.actors.values()].includes(ref)) return 'staff';
    return 'passenger';                                                    // voyageurs du parking
  }

  /* Interaction possible la plus proche, ou null. Appele a chaque image par main.js. */
  near() {
    const g = this.g;
    this._near = null;
    if (!g.arcade.on || g.state !== 'HUB' || g.controlled || g.rides.active || g.nearCounter) return null;
    /* Priorites : un vehicule a prendre, puis les gens, puis le chien. Le chien suit le joueur
       a 2 m : s'il passait en premier, il prenait le bouton devant chaque personne ou vehicule. */
    for (const v of g.vehicles || []) {
      const veh = v.near();
      if (veh) return (this._near = veh);
    }
    const p = g.player.pos;
    let best = null, bd = RANGE;
    for (const b of collectBodies(g)) {
      if (b.r === undefined || b.ref === g.ground.ev || b.ref === g.player) continue;
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) { const pet = g.pet && g.pet.near(); return pet ? (this._near = pet) : null; }
    return (this._near = { kind: 'hello', label: '👋 DIRE BONJOUR', body: best });
  }

  interact(n = this._near) {
    if (!n) return;
    if (n.kind === 'vehEnter') { n.veh.enter(); return; }
    if (n.kind === 'vehExit') { n.veh.exit(); return; }
    if (n.kind === 'vehAction') { n.veh.doAction(); return; }
    if (n.kind === 'pet') { this.g.pet.pet(); return; }
    const g = this.g, b = n.body, kind = this._kind(b.ref);
    sfx.hello();
    this._bubble(b.x, b.z, pick(EMOJIS));
    g.toast(`${kind === 'passenger' ? '🧳' : kind === 'staff' ? '👥' : kind === 'mechanic' ? '🔧' : '👋'} « ${pick(LINES[kind] || LINES.other)} »`, 2600);
    const A = g.arcade, s = A.data.stats;
    s.greet = (s.greet || 0) + 1;
    A.event('greet');
    /* Un bonjour a quelqu'un de nouveau rapporte une piece (plafond quotidien). */
    const day = todayKey();
    if (!A.data.greetDay || A.data.greetDay.day !== day) A.data.greetDay = { day, n: 0 };
    if (!this.greeted.has(b.ref) && A.data.greetDay.n < COINS_PER_DAY) {
      this.greeted.add(b.ref);
      A.data.greetDay.n++;
      A.giveCoins(1, { silent: true, label: 'Nouvel ami !' });
    }
    A.save();
  }

  _bubble(x, z, emoji) {
    const spr = emojiSprite(emoji, 1.1);
    spr.position.set(x, 2.5, z);
    this.g.r3d.scene.add(spr);
    this.fx.push({ spr, t: 0 });
  }

  update(dt) {
    for (const f of this.fx) {
      f.t += dt;
      f.spr.position.y += dt * 0.6;
      f.spr.material.opacity = Math.max(0, 1 - Math.max(0, f.t - 1.4) / 0.8);
      if (f.t > 2.2) { this.g.r3d.scene.remove(f.spr); f.spr.material.map.dispose(); f.spr.material.dispose(); }
    }
    this.fx = this.fx.filter(f => f.t <= 2.2);
  }
}

