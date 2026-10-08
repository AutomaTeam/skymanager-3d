/* ============================================================
   arcadeFun.js — Combos, missions flash, cadeau, danse, HUD cabine et vol
   (decoupe de arcade.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import { sfx } from './sfx.js?v=1791470488';
import { clamp, $, todayKey, RING_TOTAL, COMBO_TIME, TREASURE_SPOTS, TERM_QUESTS, QUESTS } from './arcadeData.js?v=1791470488';

export const funMethods = {
  /* Un « boost » d'ambiance : satisfaction de la cabine ou ambiance du hall. */
  _boost(n) {
    const g = this.g;
    if (g.state === 'CABIN') g.cabin.boost(n, 1);
    else if (g.inTerminal) g.terminal.mood = Math.min(100, g.terminal.mood + n);
  },
  emote(kind) {
    if (!this.on) return;
    const g = this.g;
    const cd = this.constructor.COOLDOWNS[kind];
    if (cd) {
      if ((this._cd[kind] || 0) > g.time) { this.popup('⏳ Patiente un peu...'); return; }
      this._cd[kind] = g.time + cd;
    }
    const ANNOUNCES = [
      'Mesdames et messieurs, bienvenue a bord ! Ici votre steward prefere.',
      'Attention : le duty-free vend des bonbons... et des rires !',
      'Nous volons a 10 000 metres. Merci de ne pas ouvrir la fenetre.',
      'Pour votre securite, gardez le sourire attache.',
      'Le commandant vous salue, il a dit que c\'etait facile !'
    ];
    const E = {
      announce: { ico: '📢', txt: 'Annonce !', snd: () => { sfx.hello(); this._boost(2.5); g.toast('📢 ' + ANNOUNCES[Math.floor(Math.random() * ANNOUNCES.length)], 3600); } },
      candy:    { ico: '🍬', txt: 'Bonbons pour tous !', snd: () => { sfx.pop(); this._boost(1.5); this.giveCoins(1, { silent: true }); } },
      music:    { ico: '🎵', txt: 'Musique !', snd: () => { sfx.jingle(); this._boost(2); } },
      honk:   { ico: '📯', txt: 'PIIIIP !',      snd: () => sfx.honk() },
      hello:  { ico: '👋', txt: 'Salut !',       snd: () => sfx.hello() },
      party:  { ico: '🎉', txt: 'Fete !',        snd: () => { sfx.tada(); this.confetti(60); } },
      dance:  { ico: '💃', txt: 'On danse !',    snd: () => { sfx.pop(); this._danceT = 2.2; } },
      /* Au sol, un vrai selfie qui part dans l'album (fun.selfie) ; ailleurs, juste le flash. */
      selfie: { ico: '📸', txt: 'Cheese !',      snd: () => { if (!(g.fun && g.fun.selfie())) { sfx.shutter(); this._flash(); } } }
    }[kind];
    if (!E) return;
    E.snd();
    if (g.pet) g.pet.cheer(kind);          // Biscuit participe a la fete
    this.data.stats[kind] = (this.data.stats[kind] || 0) + 1;
    this.floatEmoji(E.ico, (kind === 'dance' || kind === 'music') ? 3 : kind === 'candy' ? 2 : 1);
    this.popup(`${E.ico} ${E.txt}`);
    this.giveXpQuiet(1);
    /* Mission « selfie » : il faut etre pres du lieu demande. */
    const q = this.quest;
    if (q && q.needSelfie && kind === 'selfie' && this.g.state === 'HUB') {
      const p = this.g.player.pos;
      if (Math.hypot(q.target.x - p.x, q.target.z - p.z) < 14) this._endQuest(true);
    }
    this.save();
  },
  giveXpQuiet(n) { if (this.on) this.addXp(n); },
  /* Emoji qui monte au-dessus du joueur (position ecran calculee depuis la camera). */
  floatEmoji(ico, count = 1) {
    const host = $('popHost');
    if (!host) return;
    let lx = 50, ly = 55;
    try {
      const g = this.g;
      if (g.state !== 'HUB') throw new Error('centre');
      const v = g.player.pos.clone(); v.y += 2.4;
      v.project(g.r3d.camera);
      if (v.z < 1) { lx = clamp((v.x * 0.5 + 0.5) * 100, 6, 94); ly = clamp((-v.y * 0.5 + 0.5) * 100, 8, 90); }
    } catch (e) { /* position par defaut */ }
    for (let i = 0; i < count * 3; i++) {
      const el = document.createElement('div');
      el.className = 'emote-float';
      el.textContent = count > 1 ? ['🎵', '🎶', ico][i % 3] : ico;
      el.style.left = `${lx + (Math.random() - 0.5) * 8}%`;
      el.style.top = `${ly}%`;
      el.style.setProperty('--dx', `${(Math.random() - 0.5) * 90}px`);
      el.style.animationDelay = `${i * 0.12}s`;
      host.appendChild(el);
      setTimeout(() => el.remove(), 2200 + i * 120);
    }
  },
  _flash() {
    const el = document.createElement('div');
    el.className = 'photo-flash';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 700);
  },
  /* Le joueur tourne sur lui-meme pendant une danse. */
  _updateDance(dt) {
    if (!(this._danceT > 0)) return;
    this._danceT -= dt;
    const g = this.g;
    if (g.state === 'HUB' && !g.player.moving) g.player.heading += dt * 9;
    else this._danceT = 0;
  },
  /* ---------------- Cadeau du jour ---------------- */
  giftReady() { return !this.data.gift || this.data.gift.day !== todayKey(); },
  /* I04 : coffre du jour, serie de 1 a 7 jours. Sans punition : si on rate un jour, la serie recule
     d'UN cran (jamais retour a zero). Le 7e jour donne aussi un objet de peinture. */
  openGift() {
    if (!this.giftReady()) return null;
    const gf = this.data.gift || { day: '', streak: 0, num: 0 };
    const num = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 864e5);   // numero du jour local
    const gap = gf.num ? num - gf.num : 1;
    const prev = gf.streak || 0;
    let streak = gap <= 1 ? Math.min(7, prev + 1) : Math.max(1, prev);          // jour rate : on reste sur le meme cran (recule d'un)
    if (gap > 1 && prev > 1) streak = Math.max(1, prev - 1);
    const DAYS = [10, 14, 18, 24, 30, 38, 60];
    const coins = DAYS[streak - 1] + Math.floor(Math.random() * 5);
    this.data.gift = { day: todayKey(), streak, num };
    this.giveCoins(coins, { silent: true, xp: 5 });
    let bonus = '';
    if (streak === 7) { const u = this.g.hangar.randomUnlock(); if (u) bonus = u.label; }
    sfx.tada(); this.confetti(80 + streak * 8);
    this.save();
    return { coins, streak, bonus };
  },
  /* Le dock de gestes s'adapte au lieu : tarmac, terminal ou cabine. */
  _updateDock() {
    const g = this.g, dock = $('funDock');
    if (!dock) return;
    const scope = g.state === 'CABIN' ? 'cabin' : g.state === 'HUB' ? (g.inTerminal ? 'term' : 'hub') : '';
    dock.classList.toggle('hidden', !scope);
    if (scope !== this._dockScope) {
      this._dockScope = scope;
      dock.querySelectorAll('[data-emote]').forEach(b => {
        b.classList.toggle('hidden', !(b.dataset.scope || 'hub term cabin').split(' ').includes(scope));
      });
    }
    const cds = this.constructor.COOLDOWNS;
    for (const k in cds) {
      const b = dock.querySelector(`[data-emote="${k}"]`);
      if (b) b.classList.toggle('cool', (this._cd[k] || 0) > g.time);
    }
  },
  /* ---------------- Cabine : objectif de service, visage, resume ---------------- */
  _updateCabinHud(dt) {
    const g = this.g, inCabin = g.state === 'CABIN';
    if (inCabin && this._prevState !== 'CABIN') {
      this.cabinSess = { served: 0, goal: 5, rounds: 0, sat0: g.cabin.satisfaction };
    }
    if (!inCabin && this._prevState === 'CABIN' && this.cabinSess) this._cabinSummary();
    this._prevState = g.state;
    if (!inCabin || !this.cabinSess) return;
    const s = this.cabinSess;
    if (s.served >= s.goal) {
      s.rounds++;
      const bonus = 6 + s.rounds * 3;
      sfx.tada(); this.confetti(50);
      this.giveCoins(bonus, { silent: true, xp: 6, label: 'Objectif de service !' });
      g.toast(`🎯 Service reussi ! +${bonus} 🪙 — encore ${s.goal + 3} passagers pour le suivant !`, 3600, 'ok');
      s.goal += 3;
    }
    const sat = g.cabin.satisfaction;
    const face = sat >= 88 ? '😍' : sat >= 70 ? '😀' : sat >= 50 ? '🙂' : sat >= 30 ? '😕' : '😠';
    $('cabGoal').textContent = `${face} Service : ${s.served}/${s.goal}`;
    const tt = $('turbText');
    if (tt && tt.dataset.kid !== '1') { tt.dataset.kid = '1'; tt.textContent = '🌩️ TURBULENCES ! Appuie vite sur ANNONCER'; }
  },
  _cabinSummary() {
    const s = this.cabinSess;
    this.cabinSess = null;
    if (!s || s.served < 1) return;
    const sat = Math.round(this.g.cabin.satisfaction);
    const face = sat >= 85 ? '😍' : sat >= 60 ? '🙂' : '😕';
    if (sat >= 85 && s.served >= 3) { this.giveStars(1); this.g.toast(`${face} Service termine : ${s.served} passagers, ${sat} % contents ! +1 ⭐`, 4200, 'ok'); }
    else this.g.toast(`${face} Service termine : ${s.served} passagers servis, ${sat} % contents.`, 3600, 'ok');
    this.save();
  },
  /* Recompense d'un service en cabine (appele par main.js) ; req = { row, side, type }. */
  cabinServed(req) {
    if (!this.on || !req) return;
    const R = {
      bonbon: [2, '😋'], ballon: [3, '🥰'], anniv: [7, '🥳'], medical: [4, '💖'], quiz: [0, '🤓']
    }[req.type] || [2, '😊'];
    if (R[0]) this.giveCoins(R[0], { label: req.type === 'anniv' ? 'Joyeux anniversaire !' : 'Servi !' });
    if (req.type === 'anniv') { sfx.jingle(); this.confetti(60); }
    try { this.g.r3d.cabinReact(req.row, req.side, R[1]); } catch (e) { /* cabine non construite */ }
    this.event('cabinServe');
  },
  _bumpCombo() {
    const c = this.combo;
    const before = this.comboMult;
    c.n++; c.t = COMBO_TIME;
    const m = this.comboMult;
    this.data.stats.bestCombo = Math.max(this.data.stats.bestCombo || 0, m);
    if (m > 1) {
      /* Chaque action au-dela du 3e enchainement rapporte (m-1) pieces de plus. */
      this.giveCoins(m - 1, { silent: true });
      this.popup(`🔥 COMBO x${m} ! +${m - 1} 🪙`);
      if (m > before) { sfx.levelUp(); this.confetti(25); }
    }
  },
  _updateCombo(dt) {
    const c = this.combo;
    if (c.n > 0) {
      c.t -= dt;
      if (c.t <= 0) {
        if (this.comboMult > 1) this.g.toast(`Combo termine : ${c.n} actions enchainees !`, 2400, 'ok');
        c.n = 0; c.t = 0;
      }
    }
    const chip = $('comboChip');
    if (!chip) return;
    const show = c.n >= 2 && this.g.state !== 'BOOT';
    chip.classList.toggle('hidden', !show);
    if (show) {
      const m = this.comboMult;
      $('comboTxt').textContent = m > 1 ? `🔥 COMBO x${m}` : `⚡ x${c.n}`;
      $('comboFill').style.width = `${Math.round(clamp(c.t / COMBO_TIME, 0, 1) * 100)}%`;
      chip.dataset.lvl = m;
    }
  },
  /* ---------------- Missions flash ---------------- */
  randomSpot() {
    const s = TREASURE_SPOTS[Math.floor(Math.random() * TREASURE_SPOTS.length)];
    const w = this.g.nav.nearestWalkable(s[0], s[1], 40, 2);
    return { x: w.x, z: w.z };
  },
  /* Position monde d'un poste du terminal (un peu devant, cote joueur). */
  counterPos(id, off = 3) {
    const c = this.g.terminal.counters[id];
    return c ? { x: c.pos[0], z: c.pos[1] + off } : null;
  },
  _startQuest() {
    const g = this.g;
    /* Dans le terminal : missions du hall ; dehors : missions du tarmac. */
    const pool = g.inTerminal ? TERM_QUESTS : QUESTS;
    const def = pool[Math.floor(Math.random() * pool.length)];
    const tg = def.pick(this);
    const w = tg ? g.nav.nearestWalkable(tg.x, tg.z, 40, 2) : null;
    this.quest = {
      id: def.id, ico: def.ico, text: def.text, reward: def.reward, t: def.time, total: def.time,
      target: w ? { x: w.x, z: w.z } : null, needSelfie: !!def.needSelfie,
      def, goal: def.goal || 0, prog: 0, base: def.base ? def.base(g.terminal) : 0, hold: 0
    };
    sfx.ding();
    this.g.toast(`⚡ MISSION FLASH ! ${def.text}`, 4200, 'ok');
    this._lastText = null;              // force la mise a jour de la barre d'objectif
  },
  _endQuest(ok) {
    const q = this.quest;
    this.quest = null;
    this._questCd = 45 + Math.random() * 45;
    this._lastText = null;
    if (ok) {
      this.data.stats.quests = (this.data.stats.quests || 0) + 1;
      sfx.tada(); this.confetti(45);
      this.giveCoins(q.reward, { silent: true, xp: 8, label: 'Mission flash reussie !' });
      this._bumpCombo();
    } else {
      this.g.toast('⏱ Trop tard... pas grave, une autre mission arrive bientot !', 3000);
    }
    this.save();
  },
  _updateQuest(dt) {
    const g = this.g, bar = $('questBar');
    if (!this.data.tutorialDone) { if (bar) bar.classList.add('hidden'); return; }
    if (this.quest) {
      /* Le chrono ne tourne que sur le tarmac : monter dans l'avion met la mission en pause. */
      if (g.state === 'HUB') {
        const q = this.quest;
        q.t -= dt;
        const p = g.player.pos;
        if (q.def.cur || q.def.hold) {
          /* Mission du terminal : on lit les compteurs du hall. */
          if (q.def.hold) { if (q.def.ok(g.terminal)) q.hold += dt; else q.hold = Math.max(0, q.hold - dt * 0.5); q.prog = Math.floor(q.hold); }
          else q.prog = Math.max(0, Math.min(q.goal, q.def.cur(g.terminal, q.base)));
          if (q.prog >= q.goal) return this._endQuest(true);
        } else {
          const d = Math.hypot(q.target.x - p.x, q.target.z - p.z);
          if (d < (q.needSelfie ? 14 : 4.5) && !q.needSelfie) return this._endQuest(true);
        }
        if (q.t <= 0) this._endQuest(false);
      }
    } else if (g.state === 'HUB') {
      this._questCd -= dt;
      if (this._questCd <= 0 && !g.controlled) this._startQuest();
    }
    if (!bar) return;
    const q = this.quest;
    bar.classList.toggle('hidden', !q || g.state !== 'HUB');
    if (q) {
      $('questTime').textContent = Math.max(0, Math.ceil(q.t));
      $('questFill').style.width = `${Math.round(clamp(q.t / q.total, 0, 1) * 100)}%`;
      bar.classList.toggle('urgent', q.t < 15);
      $('questReward').textContent = `+${q.reward} 🪙`;
      $('questProg').textContent = q.goal ? `${q.prog}/${q.goal}` : '';
    }
  },
  /* ---------------- HUD de vol : etapes + jauge de douceur ---------------- */
  _renderFlightHud() {
    const steps = $('flightSteps'), meter = $('landMeter');
    if (!steps || !meter) return;
    const g = this.g, ac = g.ac;
    const inFlight = g.state === 'PILOT' && !g.reportShown && !ac.crashed;
    steps.classList.toggle('hidden', !inFlight);
    if (!inFlight) { meter.classList.add('hidden'); return; }
    const done = this.ringsThisFlight >= RING_TOTAL;
    let cur = 0;
    if (!ac.onGround) cur = (done || g.assist.landing) ? 2 : 1;
    if (ac.onGround && ac.touchdown) cur = 2;
    [...steps.querySelectorAll('[data-fs]')].forEach((el, i) => {
      el.classList.toggle('cur', i === cur);
      el.classList.toggle('done', i < cur);
    });
    $('fsRings').textContent = `${Math.min(this.ringsThisFlight, RING_TOTAL)}/${RING_TOTAL}`;

    /* Jauge de douceur : seulement en descente vers le sol. Aiguille a gauche = tres doux. */
    const agl = ac.pos.y;
    const sink = -ac.vel.y * 196.85;                       // ft/min vers le bas
    const show = !ac.onGround && agl < 45 && ac.vel.y < -0.3 && (g.assist.landing || ac.gearDown);
    meter.classList.toggle('hidden', !show);
    if (!show) return;
    const pos = clamp(sink / 600, 0, 1);
    $('lmNeedle').style.left = `${Math.round(pos * 100)}%`;
    const txt = sink < 230 ? ['Parfait, continue comme ca !', 'ok'] : sink < 320 ? ['Un peu vite... tire doucement', 'mid'] : ['Trop vite ! Tire vers le haut', 'bad'];
    const t = $('lmTxt');
    t.textContent = txt[0];
    meter.dataset.lvl = txt[1];
  },
  /* ---------------- Petits effets ---------------- */
  /* Petit message flottant au centre bas de l'ecran. */
  popup(text) {
    const host = $('popHost');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'pop';
    el.textContent = text;
    host.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  },
  confetti(n = 40) {
    const host = $('popHost');
    if (!host) return;
    const colors = ['#fde047', '#38bdf8', '#f472b6', '#4ade80', '#fb923c', '#a78bfa'];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      el.className = 'confetti';
      el.style.left = `${10 + Math.random() * 80}%`;
      el.style.background = colors[i % colors.length];
      el.style.setProperty('--dx', `${(Math.random() - 0.5) * 220}px`);
      el.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
      el.style.animationDelay = `${Math.random() * 0.25}s`;
      el.style.animationDuration = `${1.3 + Math.random() * 0.9}s`;
      host.appendChild(el);
      setTimeout(() => el.remove(), 2600);
    }
  },
};
