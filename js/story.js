/* ============================================================
   story.js — L'Aventure : 6 chapitres racontes par Coco (plan « jeu cool », lot A)

   Apres le tutoriel, l'enfant avait seulement des defis du jour qui
   changent chaque jour : rien a « finir », pas de suite a decouvrir.
   L'aventure donne une colonne vertebrale : 6 chapitres de 4 quetes,
   chacune basee sur un evenement du jeu (`arcade.event`) a faire N fois
   a partir du moment ou la quete commence. Fin de chapitre = grand
   ecran de fete + vraie recompense ; le chapitre 6 termine l'histoire.

   - goal()      : objectif affiche (appele par arcade.currentGoal, apres le tutoriel) ;
   - onEvent()   : appele par arcade.event ;
   - open()      : panneau « Mon aventure » (bouton de gauche, tuile du menu pause).

   Etat sauvegarde : localStorage « skymanager.story ».
   ============================================================ */

import { sfx } from './sfx.js?v=1791602994';
import { load, write } from './save.js?v=1791602994';

const STORE = 'skymanager.story';

/* where : endroit ou va la fleche (et le bouton « J'y vais ! »).
   action : panneau a ouvrir au lieu d'un voyage ('deco', 'hub'). */
export const CHAPTERS = [
  {
    id: 'c1', ico: '🌱', title: 'Un aéroport tout neuf',
    intro: 'Notre aéroport est tout petit et personne ne le connaît. On va le faire briller !',
    outro: 'Les premiers voyageurs adorent ton aéroport. Tout le monde en parle en ville !',
    reward: { coins: 60, paint: true },
    quests: [
      /* Le tutoriel se termine a la tour : on commence par y acheter quelque chose (on voit l'aeroport grandir). */
      { ev: 'buy', n: 1, ico: '🛍️', text: 'Achète une amélioration au bureau de la tour : regarde ce qui apparaît !', where: 'tower' },
      { ev: 'minigame', n: 1, ico: '🧽', text: 'Lave ou fais le plein de l\'avion (mini-jeu)', where: 'wash' },
      { ev: 'landing', n: 2, ico: '🛬', text: 'Réussis {n} atterrissages', where: 'cockpit' },
      { ev: 'serve', n: 5, ico: '🧳', text: 'Enregistre {n} passagers au comptoir du terminal', where: 'counter' }
    ]
  },
  {
    id: 'c2', ico: '🚜', title: 'Les coulisses de l\'aéroport',
    intro: 'Un aéroport, c\'est aussi des valises, des bus et des gens à aider. Viens, je te montre !',
    outro: 'Bravo ! Tu connais maintenant tous les secrets du tarmac.',
    reward: { coins: 80, paint: true },
    quests: [
      { ev: 'tugTrip', n: 1, ico: '🚜', text: 'Livre les valises à l\'avion avec le tracteur jaune', where: 'tug' },
      { ev: 'busTrip', n: 1, ico: '🚌', text: 'Emmène les passagers à l\'avion avec le bus', where: 'bus' },
      { ev: 'greet', n: 3, ico: '👋', text: 'Dis bonjour à {n} personnes', where: 'spot' },
      { ev: 'ride', n: 1, ico: '🛹', text: 'Fais un tour en skate, trottinette ou BMX (bouton 🛹)', where: null, action: 'rides' }
    ]
  },
  {
    id: 'c3', ico: '✈️', title: 'As du ciel',
    intro: 'Le ciel nous appelle ! Montre à tout le monde que tu es le meilleur pilote.',
    outro: 'Quel pilote ! Les spotteurs ont filmé tes figures, tu es une star !',
    reward: { coins: 100, paint: true },
    quests: [
      { ev: 'ring', n: 8, ico: '🟡', text: 'Traverse {n} anneaux dorés en vol', where: 'cockpit' },
      { ev: 'stunt', n: 3, ico: '🌀', text: 'Fais {n} figures en vol (looping, tonneau)', where: 'cockpit' },
      { ev: 'star3', n: 1, ico: '⭐', text: 'Atterris tout doucement pour avoir 3 étoiles', where: 'cockpit' },
      { ev: 'mission', n: 1, ico: '🎯', text: 'Termine une mission du ciel (choisis-la au décollage)', where: 'cockpit' }
    ]
  },
  {
    id: 'c4', ico: '🏝️', title: 'Les îles mystérieuses',
    intro: 'Au large, il y a des îles que personne n\'a jamais visitées. Partons les explorer !',
    outro: 'Tu as trouvé les îles ! Ta carte du monde s\'agrandit, explorateur.',
    reward: { coins: 120, paint: true },
    quests: [
      { ev: 'island', n: 2, ico: '🏝️', text: 'Découvre {n} îles en volant au-dessus de la mer', where: 'cockpit' },
      { ev: 'secret', n: 1, ico: '🌠', text: 'Attrape une étoile filante dans le ciel', where: 'cockpit' },
      { ev: 'stripLanding', n: 1, ico: '🛬', text: 'Pose-toi sur la piste d\'une île', where: 'cockpit' },
      { ev: 'photo', n: 1, ico: '📸', text: 'Prends une photo souvenir (bouton 📸)', where: null }
    ]
  },
  {
    id: 'c5', ico: '🚒', title: 'Héros de l\'aéroport',
    intro: 'Aujourd\'hui, l\'aéroport a besoin d\'un héros. Et ce héros, c\'est toi !',
    outro: 'Feu éteint, passagers heureux, place décorée : tu es le héros de l\'aéroport !',
    reward: { coins: 150, paint: true },
    quests: [
      { ev: 'fire', n: 1, ico: '🔥', text: 'Éteins un feu avec le camion de pompiers', where: 'fire' },
      { ev: 'trick', n: 3, ico: '🛹', text: 'Fais {n} figures au skatepark (prends une monture 🛹)', where: 'park' },
      { ev: 'cabinServe', n: 4, ico: '🥤', text: 'Sers {n} passagers dans la cabine de l\'avion', where: 'cabinDoor' },
      { ev: 'build', n: 1, ico: '🌳', text: 'Décore ta place (menu ☰ puis « Ma place »)', where: null, action: 'deco' }
    ]
  },
  {
    id: 'c6', ico: '🏆', title: 'Le grand aéroport international',
    intro: 'Dernier chapitre ! Si on réussit, notre aéroport devient INTERNATIONAL. Tu es prêt ?',
    outro: 'C\'est officiel : ton aéroport est INTERNATIONAL ! Tu es une légende du ciel !',
    reward: { coins: 300, paint: true, final: true },
    quests: [
      { ev: 'buy', n: 2, ico: '🏗️', text: 'Achète encore {n} améliorations à la tour', where: 'tower' },
      { ev: 'hire', n: 1, ico: '👥', text: 'Recrute quelqu\'un dans ton équipe (bouton 🏢 GÉRER)', where: null, action: 'hub' },
      { ev: 'missionGold', n: 1, ico: '🥇', text: 'Gagne une médaille d\'or à une mission du ciel', where: 'cockpit' },
      { ev: 'landing', n: 3, ico: '✈️', text: 'Fais encore {n} vols', where: 'cockpit' }
    ]
  }
];

export const QUEST_COUNT = CHAPTERS.reduce((s, c) => s + c.quests.length, 0);

/* Etat initial : chapitre 0, quete 0, compteur 0. `done` = histoire finie. */
const DEFAULTS = { ch: 0, q: 0, prog: 0, done: false, seenIntro: -1 };

/* Lieux connus du jeu (memes que le voyage rapide). Rend { x, z } ou null. */
export function placeOf(g, where) {
  const A = g.arcade;
  switch (where) {
    case 'cockpit': case 'tower': case 'terminal': case 'wash': case 'cabinDoor': return A.markerPos(where);
    case 'counter': return A.counterTarget() || A.markerPos('terminal');
    case 'tug': { const t = g.tug && g.tug._ambient(); return t ? { x: t.mv.x, z: t.mv.z } : null; }
    case 'bus': { const b = g.bus && g.bus._ambient(); return b ? { x: b.mv.x, z: b.mv.z } : null; }
    case 'fire': {
      if (g.fire && g.fire.fire && g.driving === g.fire) return { x: g.fire.fire.x, z: g.fire.fire.z };
      const ft = g.fire && g.fire._parked();
      return ft ? { x: ft.position.x, z: ft.position.z - 6 } : null;
    }
    case 'park': return { x: 231, z: 1019 };
    case 'spot': return { x: 92, z: 1188 };
    case 'ga': return { x: 92, z: 1070 };
    default: return null;
  }
}

export class Story {
  constructor(game) {
    this.g = game;
    this.data = load(STORE, DEFAULTS, 1);
    this.isOpen = false;
    this._buildPanels();
    const tile = document.getElementById('pauseStory');
    if (tile) tile.addEventListener('click', () => { this.g.closePause(); this.open(); });
    const btn = document.getElementById('storyBtn');
    if (btn) btn.addEventListener('click', () => this.open());
  }

  save() { write(STORE, this.data, 1); }

  /* L'aventure commence apres le tutoriel, en mode Arcade. */
  get active() {
    const A = this.g.arcade;
    return !!(A && A.on && A.data.tutorialDone && !this.data.done);
  }
  get chapter() { return CHAPTERS[this.data.ch] || null; }
  get quest() { const c = this.chapter; return c ? c.quests[this.data.q] || null : null; }

  /* Nombre a faire, reduit si la collection est presque epuisee (iles, etoiles filantes). */
  _need(q) {
    const left = this.g.arcade._left(q.ev);
    return Math.max(0, Math.min(q.n, left === Infinity ? q.n : left + this.data.prog));
  }
  questText(q) { return q.text.replace('{n}', this._need(q)); }

  /* ---------------- Boucle ---------------- */
  update() {
    const g = this.g;
    /* Ecran de fete en attente (chapitre fini en vol) : on le montre une fois au sol. */
    if (this._queue && this._queue.length && !this._celebrating && (g.state !== 'PILOT' || g.ac.onGround) && g.state !== 'BOOT') {
      this._show(this._queue.shift());
    }
    if (!this.active) return;
    if (g.state === 'BOOT' || g._worldPaused) return;
    /* Nouveau chapitre : Coco raconte le debut une fois. */
    if (this.data.seenIntro !== this.data.ch && g.state === 'HUB' && !this._celebrating && !(this._queue && this._queue.length)) {
      this.data.seenIntro = this.data.ch;
      this.save();
      const c = this.chapter;
      g.fun.say(`${c.ico} Chapitre ${this.data.ch + 1} : ${c.title} ! ${c.intro}`, 3, 6500);
      g.toast(`📖 Nouveau chapitre : ${c.ico} ${c.title}`, 4200, 'ok');
      this._onQuestStart();
    }
    /* Quete devenue impossible (collection deja finie) : on la valide. */
    const q = this.quest;
    /* Quete du feu : pas plus de 40 s sans feu (sinon 3 a 5 min d'attente si le precedent s'est eteint sans nous). */
    if (q && q.ev === 'fire' && g.fire && !g.fire.fire && g.fire.cd > 40) g.fire.cd = 40;
    if (q && this._need(q) <= this.data.prog) this._completeQuest();
  }

  /* Coups de pouce au debut de certaines quetes. */
  _onQuestStart() {
    const q = this.quest, g = this.g;
    if (!q) return;
    if (q.ev === 'fire' && g.fire && !g.fire.fire) g.fire.cd = Math.min(g.fire.cd, 25);
  }

  onEvent(type, n = 1) {
    if (!this.active) return;
    const q = this.quest;
    if (!q || q.ev !== type) return;
    this.data.prog += n;
    const need = this._need(q);
    if (this.data.prog >= need) this._completeQuest();
    else { this.g.arcade.popup(`${q.ico} ${this.data.prog}/${need}`); this.save(); }
  }

  skipQuest() {
    if (!this.active || !this.quest) return;
    this._completeQuest(true);
  }

  _completeQuest(skipped = false) {
    const g = this.g, A = g.arcade, c = this.chapter, q = this.quest;
    this.data.prog = 0;
    this.data.q++;
    if (skipped) sfx.click();
    else { sfx.tada(); A.confetti(45); A.giveCoins(10, { silent: true, xp: 15, label: 'Quête réussie !' }); }
    if (this.data.q >= c.quests.length) { this.save(); this._completeChapter(); return; }
    const next = this.quest;
    g.fun.say(skipped ? `D'accord ! Nouvelle quête : ${this.questText(next)}.` : `Bravo ! ${q.ico} Quête réussie ! Maintenant : ${this.questText(next)}.`, 3, 5200);
    this._onQuestStart();
    this.save();
  }

  _completeChapter() {
    const g = this.g, A = g.arcade, c = this.chapter, r = c.reward;
    const lines = [`+${r.coins} 🪙`];
    A.giveCoins(r.coins, { silent: true, xp: 60 });
    if (r.paint) {
      const u = g.hangar.randomUnlock();
      if (u) lines.push(`🎨 ${u.label}`);
    }
    A.data.stats.chapters = this.data.ch + 1;
    A.save();
    this.data.ch++;
    this.data.q = 0;
    this.data.prog = 0;
    if (this.data.ch >= CHAPTERS.length) this.data.done = true;
    this.save();
    if (g.state === 'PILOT' && !g.ac.onGround) {
      g.fun.say(`${c.ico} Chapitre terminé ! Pose-toi pour ouvrir ton cadeau !`, 3, 5000);
      sfx.tada();
    }
    this._celebrate(c, lines, !!r.final);
  }

  /* ---------------- Objectif affiche ---------------- */
  goal() {
    if (!this.active) return null;
    const q = this.quest;
    if (!q) return null;
    const need = this._need(q);
    const prog = need > 1 ? ` (${this.data.prog}/${need})` : '';
    return {
      icon: q.ico, story: true,
      text: `📖 ${this.questText(q)}${prog}`,
      target: q.where ? placeOf(this.g, q.where) : null
    };
  }

  /* Petit texte de la tuile du menu pause. */
  progressLabel() {
    if (this.data.done) return '🏆 terminée !';
    if (!this.g.arcade.data.tutorialDone) return 'après le tutoriel';
    return `chapitre ${this.data.ch + 1} / ${CHAPTERS.length}`;
  }

  /* Pour le voyage rapide : endroit de la quete en cours. */
  questPlace() {
    const q = this.active && this.quest;
    return q && q.where ? q.where : null;
  }

  /* ---------------- Panneau « Mon aventure » ---------------- */
  _buildPanels() {
    const el = document.createElement('div');
    el.id = 'storyPanel';
    el.className = 'hidden panel-overlay';
    el.innerHTML = `<div class="panel-card center kid adv-card">
      <h2 class="panel-title">📖 Mon aventure</h2>
      <p id="storySub" class="panel-sub"></p>
      <div id="storyList" class="story-list"></div>
      <div class="panel-row mt-2">
        <button id="storyGo" class="panel-btn primary">🧭 J'y vais !</button>
        <button id="storyClose" class="panel-btn">Fermer</button>
      </div>
      <button id="storySkip" class="panel-btn ghost sm mt-2">Trop dur ? Passer cette quête ⏭</button></div>`;
    document.body.appendChild(el);
    this.el = el;
    el.querySelector('#storyClose').addEventListener('click', () => this.close());
    el.querySelector('#storyGo').addEventListener('click', () => { this.close(); this.goToQuest(); });
    /* Jamais bloque : une quete trop dure se passe (sans les pieces de la quete). */
    el.querySelector('#storySkip').addEventListener('click', () => { this.skipQuest(); this._render(); });

    const cel = document.createElement('div');
    cel.id = 'storyCelebrate';
    cel.className = 'hidden story-celebrate';
    cel.innerHTML = `<div class="sc-card">
      <div class="sc-rays"></div>
      <div id="scIco" class="sc-ico">🏆</div>
      <div id="scKicker" class="sc-kicker">CHAPITRE TERMINÉ !</div>
      <h2 id="scTitle" class="sc-title"></h2>
      <p id="scText" class="sc-text"></p>
      <div id="scGifts" class="sc-gifts"></div>
      <button id="scOk" class="panel-btn primary sc-ok">Super ! 🎉</button>
    </div>`;
    document.body.appendChild(cel);
    this.cel = cel;
    cel.querySelector('#scOk').addEventListener('click', () => this._closeCelebrate());
  }

  open() {
    const A = this.g.arcade;
    if (!A || !A.on) return;
    this.isOpen = true;
    this._render();
    this.el.classList.remove('hidden');
    sfx.click();
  }

  close() {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  /* Echap : ferme d'abord l'ecran de fete, puis le panneau. */
  closeTop() {
    if (this._celebrating) { this._closeCelebrate(); return true; }
    if (this.isOpen) { this.close(); return true; }
    return false;
  }

  _render() {
    const A = this.g.arcade, d = this.data;
    const sub = this.el.querySelector('#storySub');
    if (!A.data.tutorialDone) sub.textContent = 'Termine d\'abord le tutoriel (l\'objectif en haut de l\'écran) : l\'aventure commence juste après !';
    else if (d.done) sub.textContent = 'Tu as fini toute l\'aventure ! Ton aéroport est international. Continue les défis du jour pour gagner encore plus.';
    else sub.textContent = `Chapitre ${d.ch + 1} sur ${CHAPTERS.length}. Chaque chapitre fini donne un gros cadeau !`;
    const list = this.el.querySelector('#storyList');
    list.innerHTML = CHAPTERS.map((c, i) => {
      const state = d.done || i < d.ch ? 'done' : i === d.ch && A.data.tutorialDone ? 'cur' : 'lock';
      if (state === 'lock') return `<div class="av-ch lock"><span class="av-ico">❓</span><b>Chapitre ${i + 1}</b><small>À découvrir...</small></div>`;
      const quests = state === 'cur' ? '<ul class="av-q">' + c.quests.map((q, j) => {
        const st = j < d.q ? 'ok' : j === d.q ? 'now' : '';
        const need = this._need(q);
        const prog = j === d.q && need > 1 ? ` <em>${d.prog}/${need}</em>` : '';
        return `<li class="${st}"><span>${j < d.q ? '✅' : q.ico}</span>${this.questText(q)}${prog}</li>`;
      }).join('') + '</ul>' : '';
      return `<div class="av-ch ${state}"><span class="av-ico">${state === 'done' ? '✅' : c.ico}</span><b>${i + 1}. ${c.title}</b>` +
        `<small>${state === 'done' ? 'Terminé !' : c.intro}</small>${quests}` +
        (state === 'cur' ? `<div class="av-rw">🎁 Cadeau du chapitre : +${c.reward.coins} 🪙${c.reward.paint ? ' + 🎨 peinture surprise' : ''}${c.reward.final ? ' + 🏆 trophée' : ''}</div>` : '') + '</div>';
    }).join('');
    const q = this.quest;
    const go = this.el.querySelector('#storyGo');
    go.classList.toggle('hidden', !this.active || !q || (!q.where && !q.action));
    this.el.querySelector('#storySkip').classList.toggle('hidden', !this.active || !q);
    if (q && q.action === 'deco') go.textContent = '🌳 Décorer ma place';
    else if (q && q.action === 'hub') go.textContent = '👥 Ouvrir « Gérer »';
    else if (q && q.action === 'rides') go.textContent = '🛹 Choisir ma monture';
    else go.textContent = '🧭 J\'y vais !';
  }

  /* Bouton « J'y vais ! » : voyage vers la quete ou ouvre le bon panneau. */
  goToQuest() {
    const q = this.quest, g = this.g;
    if (!q) return;
    if (q.action === 'deco') { g.deco.open(); return; }
    if (q.action === 'hub') { g.hub.open(); return; }
    if (q.action === 'rides') { g.rides.openPicker(); return; }
    if (q.where && g.travel) g.travel.go(q.where);
  }

  /* ---------------- Ecran de fete ---------------- */
  /* Carte de fin de chapitre. */
  _celebrate(c, lines, final) {
    this.celebrate({
      ico: final ? '🏆' : c.ico, final, title: c.title, text: c.outro, gifts: lines,
      kicker: final ? 'AVENTURE TERMINÉE !' : `CHAPITRE ${CHAPTERS.indexOf(c) + 1} TERMINÉ !`,
      toast: final ? '🏆 Nouveau titre : Légende de l\'aventure !' : null
    });
  }

  /* Ecran de fete generique (chapitres, avion offert, nouveau titre...) : mis en file et montre
     une fois au sol (jamais en plein vol), un a la fois. card = { ico, kicker, title, text, gifts[], final, toast }. */
  celebrate(card) {
    this._queue = this._queue || [];
    this._queue.push(card);
  }

  _show(card) {
    const g = this.g, A = g.arcade;
    this._celebrating = true;
    const $ = (id) => this.cel.querySelector('#' + id);
    $('scIco').textContent = card.ico;
    $('scKicker').textContent = card.kicker;
    $('scTitle').textContent = card.title;
    $('scText').textContent = card.text || '';
    $('scGifts').innerHTML = (card.gifts || []).map((l, i) => `<span style="animation-delay:${0.5 + i * 0.25}s">${l}</span>`).join('');
    this.cel.classList.toggle('final', !!card.final);
    this.cel.classList.remove('hidden');
    sfx.chest();
    setTimeout(() => sfx.jingle(), 650);
    A.confetti(card.final ? 160 : 110);
    if (card.toast) g.toast(card.toast, 5200, 'ok');
  }

  _closeCelebrate() {
    this._celebrating = false;
    this.cel.classList.add('hidden');
    sfx.click();
    if (this.data.done) { this.g.fun.say('Merci pour cette super aventure ! Les défis du jour t\'attendent toujours.', 3, 6000); return; }
    /* Le chapitre suivant se presente tout de suite (update le raconte). */
  }
}
