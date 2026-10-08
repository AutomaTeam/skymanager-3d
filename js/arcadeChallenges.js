/* ============================================================
   arcadeChallenges.js — Defis du jour et de la semaine, objectif courant, cibles
   (decoupe de arcade.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import { sfx } from './sfx.js?v=1791470488';
import { seeded, COMBO_EVENTS, GENERIC_EVENTS, SKY_STARS, SKY_ISLANDS, todayKey, DAILY_POOL, weekKey, WEEKLY_POOL, RING_TOTAL, DESTINATIONS, BADGES } from './arcadeData.js?v=1791470488';

export const challengeMethods = {
  /* ---------------- Evenements du jeu ---------------- */
  /* Appele par main.js a chaque action notable :
     'repair' 'serve' 'cabinServe' 'tower' 'takeoff' 'ring' 'landing' 'star3' 'buy' */
  event(type, n = 1) {
    if (!this.on) return;
    if (type in this._stepStats) this._stepStats[type] += n;
    if (COMBO_EVENTS.includes(type)) this._bumpCombo();
    const s = this.data.stats;
    if (type === 'serve') s.serve += n;
    if (type === 'repair') s.repair += n;
    if (type === 'landing') s.flights += n;
    if (type === 'hire') this.data.staff = (this.data.staff || 0) + n;
    if (type === 'takeoff' && this.plan && this.plan.t0 == null) this.plan.t0 = this.g.time;
    if (type === 'cabinServe') { s.cabinServe = (s.cabinServe || 0) + n; if (this.cabinSess) this.cabinSess.served += n; }
    if (type === 'ring') s.rings += n;
    if (type === 'star3') s.star3 += n;
    if (GENERIC_EVENTS.includes(type)) s[type] = (s[type] || 0) + n;

    /* Defi de la semaine. */
    const wk = this.data.weekly;
    if (wk && wk.item && !wk.item.done && wk.item.ev === type) {
      wk.item.progress = Math.min(wk.item.target, wk.item.progress + n);
      if (wk.item.progress >= wk.item.target) {
        wk.item.done = true;
        sfx.levelUp();
        this.confetti(90);
        this.giveCoins(wk.item.reward, { silent: true, xp: 40 });
        this.g.toast(`🏆 DEFI DE LA SEMAINE reussi ! +${wk.item.reward} 🪙`, 5200, 'ok');
      }
    }
    /* Defis du jour. */
    const daily = this.data.daily;
    if (daily) {
      for (const d of daily.items) {
        if (d.done || d.ev !== type) continue;
        d.progress = Math.min(d.target, d.progress + n);
        if (d.progress >= d.target) {
          d.done = true;
          sfx.levelUp();
          this.confetti(40);
          this.giveCoins(d.reward, { silent: true, xp: 10 });
          this.g.toast(`🏆 Defi reussi : ${d.label} — +${d.reward} 🪙`, 4200, 'ok');
        }
      }
    }
    this.save();
  },
  /* Combien reste-t-il a trouver pour un defi de collection ? Les 40 etoiles filantes et
     les 6 iles (openWorld.js) ne se trouvent qu'une fois : sans ce test, un defi
     « trouve 3 etoiles » pouvait etre tire alors qu'il n'en restait plus, et bloquer
     l'objectif affiche toute la journee. Infinity pour les autres defis. */
  _left(ev) {
    if (ev === 'fetch') {
      let pet = this.g.pet && this.g.pet.data;
      if (!pet) { try { pet = JSON.parse(localStorage.getItem('skymanager.pet') || 'null'); } catch (e) { pet = null; } }
      return pet && pet.adopted ? Infinity : 0;
    }
    if (ev !== 'secret' && ev !== 'island') return Infinity;
    let w = this.g.openWorld && this.g.openWorld.data;
    if (!w) { try { w = JSON.parse(localStorage.getItem('skymanager.world') || 'null'); } catch (e) { w = null; } }
    const got = (w && (ev === 'secret' ? w.stars : w.islands)) || [];
    return (ev === 'secret' ? SKY_STARS : SKY_ISLANDS) - got.length;
  },
  /* Un defi en cours peut-il encore etre reussi ? */
  _doable(d) { return d.done || this._left(d.ev) >= d.target - d.progress; },
  _ensureDaily() {
    const day = todayKey();
    if (this.data.daily && this.data.daily.day === day) return;
    const rnd = seeded('sky' + day);
    const pool = DAILY_POOL.slice();
    const items = [];
    while (items.length < 3 && pool.length) {
      const d = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const left = this._left(d.ev);
      const n = Math.min(left, d.min + Math.floor(rnd() * (d.max - d.min + 1)));
      if (n < d.min) continue;                       // plus rien a trouver : on tire un autre defi
      items.push({
        id: d.id, ev: d.ev, icon: d.icon, label: d.text(n),
        target: n, progress: 0, reward: d.reward, done: false
      });
    }
    this.data.daily = { day, items };
    this.save();
  },
  _ensureWeekly() {
    const wk = weekKey();
    if (this.data.weekly && this.data.weekly.week === wk) return;
    const rnd = seeded('week' + wk);
    /* Seulement les defis encore faisables (etoiles et iles epuisables, voir _left). */
    const pool = WEEKLY_POOL.filter(x => this._left(x.ev) >= x.target[0]);
    const d = pool[Math.floor(rnd() * pool.length)];
    const target = Math.min(this._left(d.ev), d.target[0] + Math.floor(rnd() * (d.target[1] - d.target[0] + 1)));
    this.data.weekly = { week: wk, item: { id: d.id, ev: d.ev, icon: d.icon, label: '📅 Semaine : ' + d.text(target), target, progress: 0, reward: d.reward, done: false, weekly: true } };
    this.save();
  },
  /* Objectif a afficher : etape du tutoriel, sinon premier defi non fait. */
  /* F05 : « Montre-moi » (aide en cartes) : une fleche vers l'endroit demande pendant `secs` secondes. */
  showMe(goal, secs = 25) {
    this._showMe = Object.assign({}, goal, { until: this.g.time + secs });
    this._lastText = null;
  },
  currentGoal() {
    if (this._showMe && this.g.state === 'HUB' && this.g.time < this._showMe.until) return this._showMe;
    /* Aux commandes : le but est toujours celui du vol en cours. */
    if (this.g.state === 'PILOT') {
      const ac = this.g.ac;
      const sg = this.g.sky && this.g.sky.goal();
      if (sg) return sg;
      if (ac.onGround && !this.g.assist.launched && !ac.touchdown) return { icon: '🛫', text: 'Appuie sur DECOLLER, puis tire vers le haut !', target: null };
      if (ac.onGround && !ac.touchdown) return { icon: '🛫', text: 'Ca roule ! Tire vers le haut pour decoller.', target: null };
      if (ac.onGround) return { icon: '🅿️', text: 'Bravo ! Ouvre le menu ☰ pour rentrer a la maison.', target: null };
      if (this.ring) return { icon: '🟡', text: `Vole dans l'anneau dore ! (${this.ringsThisFlight}/${RING_TOTAL})`, target: null };
      if (ac.heli) return { icon: '🚁', text: 'Suis la fleche vers l\'helipad, descends doucement et pose-toi (ou appuie sur ATTERRIR).', target: null };
      return { icon: '🛬', text: 'Suis la fleche vers la piste et atterris doucement.', target: null };
    }
    if (this.g.state === 'HUB') for (const v of this.g.vehicles || []) { const vg = v.goal(); if (vg) return vg; }
    const mg = this.g.state === 'HUB' && this.g.modules.goal();      // objectifs des modules du registre
    if (mg) return mg;
    const ge = this.g.state === 'HUB' && this.g.ground && this.g.ground.goal();
    if (ge) return ge;
    if (this.quest && this.g.state === 'HUB') return { icon: this.quest.ico, text: '⚡ ' + this.quest.text + (this.quest.goal ? ` (${this.quest.prog}/${this.quest.goal})` : ''), target: this.quest.target };
    const st = this.step;
    if (st) return { icon: st.icon, text: st.text, target: st.target(this.g) };
    const d = this.dailyItems.find(x => !x.done && this._doable(x));
    if (d) {
      const tgt = this._targetForChallenge(d);
      return {
        icon: d.icon, text: `${d.label} (${d.progress}/${d.target})`, target: tgt
      };
    }
    return this._suggestGoal();
  },
  /* Quand tout est fait, le jeu propose quand meme quelque chose d'utile (jamais d'impasse). */
  _suggestGoal() {
    const g = this.g, t = g.tycoon, opts = [];
    const wear = Math.max(0, ...Object.values(g.mechanic.components).map(c => c.wear));
    if (wear > 55) opts.push({ icon: '🔧', text: 'Une piece de l\'avion est usee : va la reparer !', target: this.stationTarget() });
    const buy = ['shops', 'gates', 'vipLounge', 'terminals', 'runways'].find(k => t.canBuy(k));
    if (buy) opts.push({ icon: '🛍️', text: 'Tu as assez de pieces : va acheter une amelioration a la tour !', target: this.markerPos('tower') });
    else if (t.canBuyAircraft()) opts.push({ icon: '✈️', text: 'Tu peux acheter un nouvel avion a la tour !', target: this.markerPos('tower') });
    const tz = this.data.treasure;
    if (tz && tz.got.some(v => !v)) opts.push({ icon: '✨', text: `Cherche les pieces cachees (${tz.got.filter(Boolean).length}/${tz.got.length}) : la mini-carte t'aide !`, target: null });
    if (this.giftReady()) opts.push({ icon: '🎁', text: 'Ton cadeau du jour t\'attend a la tour !', target: this.markerPos('tower') });
    const unseen = DESTINATIONS.filter(d => !(this.data.visited || []).includes(d.city));
    opts.push({ icon: '🛫', text: unseen.length ? 'Prends un vol vers une nouvelle ville pour remplir ton carnet !' : 'Refais un vol pour battre ton record d\'etoiles !', target: this.markerPos('cockpit') });
    opts.push({ icon: '🥤', text: 'Va en cabine servir les passagers et repondre a leurs questions !', target: this.markerPos('cabinDoor') });
    /* Ce qu'on peut faire a pied (souvent jamais decouvert sans un petit coup de pouce). */
    const st = this.data.stats;
    const tug = g.tug && g.tug._ambient();
    if (tug && !(st.tugTrips > 2)) opts.push({ icon: '🚜', text: 'Conduis le tracteur a bagages jaune : charge les valises et livre-les a l\'avion !', target: { x: tug.mv.x, z: tug.mv.z } });
    const bus = g.bus && g.bus._ambient();
    if (bus && !(st.busTrips > 1)) opts.push({ icon: '🚌', text: 'Conduis le bus jaune : emmene les passagers du terminal jusqu\'a l\'avion !', target: { x: bus.mv.x, z: bus.mv.z } });
    const ft = g.fire && g.fire._parked();
    if (ft && !(st.fires > 0)) opts.push({ icon: '🚒', text: 'Va voir le camion de pompiers devant la caserne : tu peux le conduire !', target: { x: ft.position.x, z: ft.position.z - 6 } });
    if (g.pet && g.pet.adopted && !(st.fetch > 3)) opts.push({ icon: '🎾', text: `Joue a la balle avec ${g.pet.data.name} : appuie sur 🎾 !`, target: null });
    if (!(st.greet > 5)) opts.push({ icon: '👋', text: 'Dis bonjour aux gens de l\'aeroport : les spotteurs au bord de la piste adorent parler d\'avions !', target: { x: 92, z: 1188 } });
    return opts[Math.floor(g.time / 40) % opts.length];
  },
  _targetForChallenge(d) {
    if (d.ev === 'serve') return this.counterTarget();
    if (d.ev === 'repair') return this.stationTarget();
    if (d.ev === 'buy') return this.markerPos('tower');
    if (d.ev === 'cabinServe') return this.markerPos('cabinDoor');
    if (d.ev === 'landing' || d.ev === 'star3' || d.ev === 'ring') return this.markerPos('cockpit');
    if (d.ev === 'tugTrip' && this.g.tug) { const t = this.g.tug._ambient(); return t ? { x: t.mv.x, z: t.mv.z } : null; }
    if (d.ev === 'greet') return { x: 92, z: 1188 };
    if (d.ev === 'busTrip' && this.g.bus) { const b = this.g.bus._ambient(); return b ? { x: b.mv.x, z: b.mv.z } : null; }
    return null;
  },
  /* Position monde d'un point d'interaction du hub. */
  markerPos(key) {
    const m = this.g.r3d.hotspotMarkers && this.g.r3d.hotspotMarkers[key];
    if (!m) return null;
    return { x: m.group.position.x, z: m.group.position.z };
  },
  /* Poste de maintenance le plus use. */
  stationTarget() {
    const g = this.g;
    let best = null, bw = -1;
    for (const h of g.hotspots) {
      if (h.type !== 'mechanic') continue;
      const w = Math.max(...h.components.map(k => g.mechanic.components[k].wear));
      if (w > bw) { bw = w; best = h; }
    }
    return best ? this.markerPos(best.key) : null;
  },
  /* Comptoir du terminal avec le plus de monde, sinon le premier ouvert. */
  /* Poste qui a le plus besoin du joueur, dans l'ordre logique du circuit :
     1. il porte une caisse -> la machine la plus vide ;
     2. une machine est presque vide -> la reserve (pour prendre une caisse) ;
     3. des bagages attendent -> le tri des bagages ;
     4. sinon le guichet (enregistrement, surete, porte) avec le plus de monde. */
  counterTarget() {
    const g = this.g, t = g.terminal;
    const vis = g.r3d.terminalCounters || {};
    const at = (id) => vis[id] ? { x: vis[id].deskGroup.position.x, z: vis[id].deskGroup.position.z } : null;
    const low = t.lowMachine();
    if (t.carry > 0) {
      let m = low;
      if (!m) for (const id of ['shop', 'cafe', 'vending']) { const c = t.counters[id]; if (Math.floor(c.stock) < 12 && (!m || c.stock < m.stock)) m = c; }
      if (m) return at(m.id);
    }
    if (low && t.counters.storage.crates > 0) return at('storage');
    if (t.counters.baggage.queue >= 4) return at('baggage');
    let best = null, bq = 0;
    for (const id of ['checkin1', 'checkin2', 'checkin3', 'security', 'gate']) {
      const c = t.counters[id];
      const score = (c.open ? c.queue : -1) + (c.kind === 'checkin' ? 0.5 : 0);
      if (score > bq && vis[id]) { bq = score; best = id; }
    }
    return best ? at(best) : (at('checkin1') || null);
  },
  /* Cible en cabine : le passager qui attend depuis le plus longtemps, sinon la porte
     si l'objectif est termine, sinon le galley. */
  cabinTarget() {
    const g = this.g, cab = g.cabin;
    let best = null, bt = Infinity;
    for (const r of cab.requests) {
      if (r.timeLeft < bt) {
        const seat = g.r3d.cabinSeats && g.r3d.cabinSeats.find(s => s.row === r.row && s.side === r.side);
        if (seat) { bt = r.timeLeft; best = { x: seat.group.position.x, z: seat.group.position.z }; }
      }
    }
    if (best) return best;
    return { x: 0, z: 0.9 };
  },
  /* En vol, la fleche montre la piste une fois les anneaux faits. */
  wantRunwayArrow() {
    return !this.ring && !this.g.ac.onGround;
  },
  /* ---------------- Trophees ---------------- */
  checkBadges() {
    if (!this.on) return;
    for (const b of BADGES) {
      if (this.data.badges[b.id] || !b.test(this.data)) continue;
      this.data.badges[b.id] = todayKey();
      sfx.tada(); this.confetti(60);
      this.g.toast(`🏅 Nouveau trophee : ${b.name} !`, 4200, 'ok');
      this.save();
    }
  },
  badgeCount() { return BADGES.filter(b => this.data.badges[b.id]).length; },
};
