/* ============================================================
   arcadeFlight.js — Vol : anneaux, barre d'objectif, plan de vol, atterrissage, tresors
   (decoupe de arcade.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import { sfx } from './sfx.js?v=1791468897';
import { seeded, clamp, $, todayKey, RING_TOTAL, DESTINATIONS, TREASURE_SPOTS, GROUND_CLEAR, RING_RADIUS, RING_AHEAD, PLAN_TYPES, EXPRESS_TIME, iconifyHost, TREASURE_COUNT } from './arcadeData.js?v=1791468897';

export const flightMethods = {
  /* ---------------- Anneaux de vol ---------------- */
  /* A appeler chaque image en vol. */
  updateRings(dt) {
    if (!this.on) return;
    const g = this.g, ac = g.ac, r3d = g.r3d;
    if (ac.onGround || !g.flightLog || !g.flightLog.armed) {
      if (this.ring && ac.onGround) this.clearRing();
      return;
    }
    /* Pendant une mission, les anneaux dores laissent la place a la mission. */
    if (g.sky && g.sky.busy) { if (this.ring) this.clearRing(); return; }
    /* Pas d'anneau pendant la finale : on se concentre sur la piste. */
    if (g.assist.landing || g.assist.finalLike(ac)) { if (this.ring) this.clearRing(); return; }
    if (this.ringsThisFlight >= RING_TOTAL) { if (this.ring) this.clearRing(); return; }
    if (!this.ring) {
      if (ac.pos.y > GROUND_CLEAR) this.spawnRing();
      return;
    }
    const dx = ac.pos.x - this.ring.x, dy = ac.pos.y - this.ring.y, dz = ac.pos.z - this.ring.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < RING_RADIUS * (this.g.fun ? this.g.fun.diff.ring : 1)) {
      this.ringsThisFlight++;
      sfx.ring();
      this.event('ring');
      this.giveCoins(2, { silent: true });
      this.g.toast(`Anneau ${this.ringsThisFlight}/${RING_TOTAL} ! +2 🪙`, 1400, 'ok');
      this.confetti(10);
      if (this.g.fun) this.g.fun.onRing();
      this.clearRing();
      if (this.ringsThisFlight < RING_TOTAL) this.spawnRing();
      else this.g.toast('🟡 Tous les anneaux ! Suis la fleche pour retourner a la piste.', 4200, 'ok');
    } else {
      /* Anneau depasse : on en replace un devant. */
      const f = ac.forward();
      const ahead = -(dx * f.x + dz * f.z);
      if (ahead < -90) {
        this._ringMissTimer += dt;
        if (this._ringMissTimer > 1.2) { this._ringMissTimer = 0; this.spawnRing(); }
      } else {
        this._ringMissTimer = 0;
      }
    }
    if (this.ring) r3d.pulseRing(this.g.time);
    this._updateSkyCoins();
  },
  /* Pieces sur la trajectoire vers l'anneau : on les ramasse en passant a moins de 36 m. */
  _updateSkyCoins() {
    const g = this.g, ac = g.ac, sc = this.skyCoins;
    if (!sc || !sc.length) return;
    g.r3d.spinSkyCoins(g.time);
    for (let i = 0; i < sc.length; i++) {
      const c = sc[i];
      if (c.got) continue;
      if (Math.hypot(ac.pos.x - c.x, ac.pos.y - c.y, ac.pos.z - c.z) > 36) continue;
      c.got = true;
      g.r3d.hideSkyCoin(i);
      sfx.coin();
      this.data.stats.skyCoins = (this.data.stats.skyCoins || 0) + 1;
      this.giveCoins(1, { silent: true });
      this._bumpCombo();
      this.popup('🪙 +1');
    }
  },
  spawnRing() {
    const g = this.g, ac = g.ac;
    const f = ac.forward();
    const h = Math.hypot(f.x, f.z) || 1;
    const dirx = f.x / h, dirz = f.z / h;
    /* Petit decalage lateral et vertical pour que ca bouge, sans etre injouable. */
    const side = (this.ringsThisFlight % 2 ? 1 : -1) * (25 + this.ringsThisFlight * 15);
    const x = ac.pos.x + dirx * RING_AHEAD + (-dirz) * side;
    const z = ac.pos.z + dirz * RING_AHEAD + (dirx) * side;
    /* L'anneau se place sur la trajectoire actuelle (pente de montee ou de
       descente mesuree), avec un petit ecart pour qu'il faille corriger. */
    const hv = Math.hypot(ac.vel.x, ac.vel.z) || 1;
    const slope = clamp(ac.vel.y / hv, -0.08, 0.18);
    const wobble = (this.ringsThisFlight % 2 ? 1 : -1) * (12 + this.ringsThisFlight * 4);
    const y = clamp(ac.pos.y + RING_AHEAD * slope + wobble, 55, 1150);
    this.ring = { x, y, z, yaw: Math.atan2(dirx, dirz) };
    g.r3d.setRing(this.ring);
    /* 3 pieces regulierement espacees entre l'avion et l'anneau (aux 30 %, 55 % et 80 %). */
    this.skyCoins = [0.3, 0.55, 0.8].map(k => ({
      x: ac.pos.x + (x - ac.pos.x) * k, y: ac.pos.y + (y - ac.pos.y) * k, z: ac.pos.z + (z - ac.pos.z) * k, got: false
    }));
    g.r3d.setSkyCoins(this.skyCoins);
    g.assist.guide = (g.fun && !g.fun.diff.magnet) ? null : this.ring;          // aimant : l'avion s'oriente doucement vers l'anneau
  },
  clearRing() {
    this.skyCoins = null;
    this.g.r3d.clearSkyCoins();
    this.ring = null;
    this.g.assist.guide = null;
    this.g.r3d.hideRing();
  },
  /* Nouveau vol : on remet les anneaux a zero. */
  resetFlight() {
    this.plan = null;
    this.ringsThisFlight = 0;
    this.clearRing();
  },
  /* ---------------- Plan de vol ---------------- */
  /* Tableau de depart : deux onglets, les missions (jeux de 1 a 3 minutes) et
     les destinations (un defi de vol). Affiche quand on s'asseoit aux commandes. */
  offerPlan() {
    if (!this.on) return;
    const box = $('flightPlan');
    if (!box) return;
    const sky = this.g.sky;
    const dests = DESTINATIONS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    const chal = ['star', 'rings', 'fast', 'perfect'].sort(() => Math.random() - 0.5).slice(0, 2);
    const kinds = [chal[0], chal[1], 'cool'];
    const scale = Math.min(2, 1 + 0.08 * (this.data.level - 1));
    const offers = dests.map((d, i) => {
      const t = PLAN_TYPES[kinds[i]];
      const bonus = t.bonus ? Math.round(t.bonus * scale) + Math.floor(d.km / 3000) : 0;
      return { dest: d, kind: kinds[i], bonus, t0: null };
    });
    const seen = this.data.visited || [];
    const close = () => { box.classList.add('hidden'); sfx.click(); };
    const medals = ['', '🥉', '🥈', '🥇'];
    const renderTab = (tab) => {
      document.querySelectorAll('[data-plantab]').forEach(b => b.classList.toggle('on', b.dataset.plantab === tab));
      const host = $('planCards');
      if (tab === 'missions' && sky) {
        host.innerHTML = sky.cards().map(c =>
          `<button class="plan-card mission${c.locked ? ' locked' : ''}" data-mission="${c.id}"${c.locked ? ' disabled' : ''}>` +
          `<span class="pc-flag">${c.ico}</span><span class="pc-mid"><b>${c.name}</b><small>${c.brief}</small></span>` +
          `<span class="pc-rw">${c.locked ? '🔒 Niv ' + c.level : (medals[c.medal] || 'Nouveau')}</span></button>`).join('');
        host.querySelectorAll('[data-mission]').forEach(b => b.addEventListener('click', () => { close(); this.plan = null; sky.arm(b.dataset.mission); }));
      } else {
        host.innerHTML = offers.map((o, i) => {
          const t = PLAN_TYPES[o.kind];
          return `<button class="plan-card" data-i="${i}"><span class="pc-flag">${o.dest.flag}</span>` +
            `<span class="pc-mid"><b>${o.dest.city}</b><small>${o.dest.km.toLocaleString('fr-FR')} km${seen.includes(o.dest.city) ? '' : ' · 🆕 nouvelle ville !'}</small>` +
            `<em>${t.ico} ${t.name} — ${t.text}</em></span>` +
            `<span class="pc-rw">${o.bonus ? '+' + o.bonus + ' 🪙' : 'Cool'}</span></button>`;
        }).join('');
        host.querySelectorAll('.plan-card').forEach(b => b.addEventListener('click', () => {
          const o = offers[+b.dataset.i];
          close(); this.plan = o;
          if (o && o.bonus) this.g.toast(`${o.dest.flag} Cap sur ${o.dest.city} ! Defi : ${PLAN_TYPES[o.kind].text}`, 3800, 'ok');
        }));
      }
      iconifyHost(host);
    };
    document.querySelectorAll('[data-plantab]').forEach(b => { b.onclick = () => { sfx.click(); renderTab(b.dataset.plantab); }; });
    renderTab(sky ? 'missions' : 'dest');
    box.classList.remove('hidden');
    $('planSkip').onclick = () => { close(); this.plan = null; };
  },
  /* A la fin du vol : le defi est-il reussi ? Renvoie { bonus, line } ou null. */
  resolvePlan(stars, crashed) {
    const p = this.plan;
    this.plan = null;
    if (!p) return null;
    const t = PLAN_TYPES[p.kind];
    const time = p.t0 == null ? 9999 : this.g.time - p.t0;
    /* Toute destination atteinte sans accident va dans le carnet de voyage. */
    if (!crashed) {
      if (!this.data.visited.includes(p.dest.city)) this.data.visited.push(p.dest.city);
    }
    if (!p.bonus) { this.save(); return { bonus: 0, line: `${p.dest.flag} Arrive a ${p.dest.city} ! Bon voyage.` }; }
    const ok = !crashed && t.test({ stars, rings: this.ringsThisFlight, time });
    if (ok) {
      this.data.stats.plans++;
      this.giveCoins(p.bonus, { silent: true, xp: 10 });
      this.event('plan');
      sfx.tada();
      this.save();
      return { bonus: p.bonus, line: `${p.dest.flag} ${p.dest.city} : defi « ${t.name} » reussi ! +${p.bonus} 🪙` };
    }
    this.save();
    return { bonus: 0, line: `${p.dest.flag} ${p.dest.city} : defi « ${t.name} » pas reussi cette fois — retente !` };
  },
  /* Pastille de plan de vol en haut a gauche pendant le vol. */
  _renderPlanChip() {
    const chip = $('planChip');
    if (!chip) return;
    const g = this.g, p = this.plan;
    const show = !!p && g.state === 'PILOT' && !g.reportShown;
    chip.classList.toggle('hidden', !show);
    if (!show) return;
    let txt = `${p.dest.flag} ${p.dest.city}`;
    if (p.bonus) txt += ` · ${PLAN_TYPES[p.kind].ico} ${PLAN_TYPES[p.kind].short}`;
    if (p.kind === 'rings' || p.kind === 'perfect') txt += ` ${Math.min(this.ringsThisFlight, RING_TOTAL)}/${RING_TOTAL}`;
    let late = false;
    if (p.kind === 'fast' && p.t0 != null) {
      const left = Math.max(0, EXPRESS_TIME - (g.time - p.t0));
      txt += ` · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
      late = left < 30;
    }
    if (chip.textContent !== txt) chip.textContent = txt;
    chip.classList.toggle('late', late);
  },
  /* ---------------- Notes d'atterrissage ---------------- */
  rateLanding(td, crashed) {
    if (crashed) return { stars: 0, title: 'Oups ! Un atterrissage brusque', tip: 'Pas grave, recommence : le train est sorti automatiquement.' };
    const off = Math.abs(td.offset);
    let stars = 1, title = 'Atterri ! Bien joue', tip = 'Essaie de descendre plus doucement.';
    /* Seuils genereux : un enfant qui laisse faire l'aide (ou qui pose a peu pres droit) doit voir 2-3 etoiles. */
    if (td.fpm < 420 && off < 24) { stars = 2; title = 'Tres bel atterrissage !'; tip = 'Encore un peu plus doux pour 3 etoiles.'; }
    if (td.fpm < 280 && off < 16) { stars = 3; title = 'ATTERRISSAGE PARFAIT !'; tip = 'Tu es un vrai pilote !'; }
    return { stars, title, tip };
  },
  /* Barre d'objectif avec fleche directionnelle. */
  _renderBar(goal) {
    const bar = $('objBar');
    if (!bar) return;
    const g = this.g;
    const visible = g.state !== 'BOOT';
    bar.classList.toggle('hidden', !visible);
    if (!visible) return;
    if (this._lastText !== goal.text) {
      this._lastText = goal.text;
      $('objIcon').textContent = goal.icon;
      $('objText').textContent = goal.text;
      if (g.fun && g.fun.data.voice) g.voice.speak(goal.text, { prio: 0 });     // F01 : l'objectif est lu a voix haute
      bar.classList.remove('pulse'); void bar.offsetWidth; bar.classList.add('pulse');
    }
    /* Tutoriel : on peut toujours passer l'etape (jamais bloque). */
    const sk = $('objSkip');
    if (sk) {
      sk.classList.toggle('hidden', !this.step || g.state === 'BOOT');
      if (!sk._bound) { sk._bound = true; sk.addEventListener('click', () => this.skipStep()); }
    }
    const arrow = $('objArrow');
    const dist = $('objDist');
    const rel = this._relativeAngle(goal.target);
    if (rel == null) {
      arrow.classList.add('hidden');
      dist.textContent = '';
    } else {
      arrow.classList.remove('hidden');
      arrow.style.transform = `rotate(${rel.rot.toFixed(3)}rad)`;
      dist.textContent = rel.d < 999 ? `${Math.round(rel.d)} m` : `${(rel.d / 1000).toFixed(1)} km`;
      arrow.classList.toggle('near', rel.d < 14);
    }
  },
  /* Angle ecran (rad, 0 = tout droit) et distance vers une cible monde. */
  _relativeAngle(target, forced = false) {
    const g = this.g;
    let px, pz, fx, fz;
    if (g.state === 'HUB') {
      px = g.player.pos.x; pz = g.player.pos.z;
      fx = Math.sin(g.player.heading); fz = Math.cos(g.player.heading);
    } else if (g.state === 'CABIN') {
      /* Repere cabine : la fleche montre le passager a servir, sinon le devant. */
      px = g.attendant.x || 0; pz = g.attendant.z;
      fx = Math.sin(g.attendant.heading); fz = Math.cos(g.attendant.heading);
      target = this.cabinTarget();
    } else if (g.state === 'PILOT') {
      px = g.ac.pos.x; pz = g.ac.pos.z;
      const f = g.ac.forward();
      const l = Math.hypot(f.x, f.z) || 1;
      fx = f.x / l; fz = f.z / l;
      /* Aux commandes, le point du hub ne veut plus rien dire : la fleche
         montre l'anneau, sinon la piste. */
      if (!forced) {
        target = null;
        if (g.sky && g.sky.m) target = g.sky.target();
        else if (this.ring) target = { x: this.ring.x, z: this.ring.z };
        else if (this.wantRunwayArrow()) target = g.ac.heli ? { x: 95, z: 1190 } : { x: 0, z: -1500 };
      }
    } else {
      return null;
    }
    if (!target) return null;
    const dx = target.x - px, dz = target.z - pz;
    const d = Math.hypot(dx, dz);
    const rx = -fz, rz = fx;                 // droite ecran
    const rot = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    return { rot, d };
  },
  _renderChips() {
    const c = $('coinChip');
    if (!c) return;
    const g = this.g;
    c.classList.toggle('hidden', g.state === 'BOOT');
    const coins = this.coins;
    if (this._lastCoins !== coins || this._lastStars !== this.data.stars || this._lastLvl !== this.data.level) {
      this._lastCoins = coins; this._lastStars = this.data.stars; this._lastLvl = this.data.level;
      $('coinN').textContent = coins.toLocaleString('fr-FR');
      $('starN').textContent = this.data.stars;
      $('lvlN').textContent = this.data.level;
    }
    $('xpFill').style.width = `${Math.round(this.xpProgress() * 100)}%`;
  },
  /* Faisceau lumineux vers la cible (hub et terminal). */
  _renderBeacon(target) {
    const r3d = this.g.r3d;
    const st = this.g.state;
    const usable = target && st === 'HUB';
    const key = usable ? `${Math.round(target.x)}:${Math.round(target.z)}` : '';
    if (key !== this._beaconKey) {
      this._beaconKey = key;
      if (usable) r3d.setBeacon(target.x, target.z); else r3d.hideBeacon();
    }
    r3d.pulseBeacon(this.g.time);
  },
  /* ---------------- Chasse aux pieces cachees ---------------- */
  /* 8 pieces par jour, choisies parmi les emplacements de TREASURE_SPOTS et
     recalees sur un sol praticable. Se renouvellent chaque matin. */
  _ensureTreasure() {
    const day = todayKey();
    const g = this.g;
    if (!g.nav) return;
    let tz = this.data.treasure;
    if (!tz || tz.day !== day || !tz.spots || !tz.spots.length) {
      const rnd = seeded('tre' + day);
      const pool = TREASURE_SPOTS.slice();
      const spots = [];
      while (spots.length < TREASURE_COUNT && pool.length) {
        const s = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
        const w = g.nav.nearestWalkable(s[0], s[1], 40, 2);
        spots.push([Math.round(w.x * 10) / 10, Math.round(w.z * 10) / 10]);
      }
      tz = this.data.treasure = { day, spots, got: spots.map(() => false), bonus: false };
      this._treasureKey = '';
      this.save();
    }
    const key = tz.day + ':' + tz.got.join('');
    if (this._treasureKey !== key) {
      this._treasureKey = key;
      const r3d = g.r3d;
      r3d.setTreasures(tz.spots.map(s => ({ x: s[0], z: s[1] })));
      tz.got.forEach((v, i) => { if (v) r3d.hideTreasure(i); });
    }
  },
  /* Distance a la piece la plus proche → indice « chaud / froid ». */
  treasureHeat() {
    const tz = this.data.treasure;
    if (!tz) return null;
    const found = tz.got.filter(Boolean).length;
    const total = tz.got.length;
    if (found >= total) return { ico: '✅', txt: 'Toutes les pieces du jour sont trouvees !', found, total, d: Infinity };
    const p = this.g.player.pos;
    let d = Infinity;
    tz.spots.forEach((s, i) => { if (!tz.got[i]) d = Math.min(d, Math.hypot(s[0] - p.x, s[1] - p.z)); });
    let ico = '🥶', txt = 'Froid...';
    if (d < 25) { ico = '🔥'; txt = 'BRULANT ! Tu y es presque !'; }
    else if (d < 70) { ico = '♨️'; txt = 'Chaud !'; }
    else if (d < 160) { ico = '🙂'; txt = 'Tiede...'; }
    return { ico, txt, found, total, d };
  },
  _updateTreasure(dt) {
    const g = this.g;
    const inHub = g.state === 'HUB';
    this._ensureTreasure();
    g.r3d.spinTreasures(g.time, inHub);
    g.r3d.animateDecor(g.time, inHub);
    const tz = this.data.treasure;
    if (!tz || !inHub) return;
    const p = g.player.pos;
    for (let i = 0; i < tz.spots.length; i++) {
      if (tz.got[i]) continue;
      if (Math.hypot(tz.spots[i][0] - p.x, tz.spots[i][1] - p.z) > 2.8) continue;
      tz.got[i] = true;
      g.r3d.hideTreasure(i);
      this._treasureKey = tz.day + ':' + tz.got.join('');
      const n = tz.got.filter(Boolean).length;
      sfx.sparkle();
      this.data.stats.treasure++;
      this._bumpCombo();
      this.giveCoins(3, { silent: true });
      this.popup(`✨ Piece cachee ! ${n}/${tz.got.length}  +3 🪙`);
      this.confetti(14);
      if (n === tz.got.length && !tz.bonus) {
        tz.bonus = true;
        this.data.stats.treasureDays++;
        this.giveCoins(25, { silent: true, xp: 20 });
        this.giveStars(1);
        sfx.tada(); this.confetti(90);
        g.toast('🗺️ TOUTES les pieces du jour ! Bonus +25 🪙 et 1 ⭐', 5000, 'ok');
      }
      this.save();
    }
  },
};
