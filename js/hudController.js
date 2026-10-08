/* ============================================================
   hudController.js — HUD, bulles et rapports de vol
   (decoupe de main.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import { KTS, FT, FPM } from './flightPhysics.js?v=1791468476';
import { COIN } from './arcade.js?v=1791468476';
import { planeOf } from './fleet.js?v=1791468476';
import { sfx } from './sfx.js?v=1791468476';
import { drawPFD } from './cockpit.js?v=1791468476';
import { $, clamp } from './gameShared.js?v=1791468476';

export const hudMethods = {
  updateHUD() {
    const ac = this.ac;
    const kt = ac.ias * KTS;

    /* Le poste 3D affiche ses propres alertes ; le mini-PFD suit en vue exterieure. */
    this.r3d.cockpitWarn = this.faultAlert || null;
    this.updatePfdHud(ac);

    $('gIas').textContent = kt.toFixed(0);
    $('gAlt').textContent = (ac.pos.y * FT).toFixed(0);
    $('gVs').textContent = (ac.vsi * FPM).toFixed(0);
    $('gHdg').textContent = ac.heading.toFixed(0).padStart(3, '0');
    $('gN1').textContent = ac.n1.toFixed(0);
    $('gFuel').textContent = (ac.fuel / ac.fuelCap * 100).toFixed(0);

    $('gIas').parentElement.classList.toggle('warn', ac.stall > 0.05 || ac.overspeed);
    $('gIas').parentElement.classList.toggle('caution',
      !ac.stall && !ac.overspeed && (ac.stall > 0.01 || kt > ac.vRef() * KTS * 1.25));
    const fuelPct = ac.fuel / ac.fuelCap;
    $('gFuel').parentElement.classList.toggle('warn', fuelPct < 0.12);
    $('gFuel').parentElement.classList.toggle('caution', fuelPct >= 0.12 && fuelPct < 0.25);
    $('gN1').parentElement.classList.toggle('caution', ac.hasFault && ac.faults.thrust < 1);

    $('phaseTag').textContent = {
      PARKING: 'Au parking', ROULAGE: 'Roulage', DECOLLAGE: 'Decollage',
      MONTEE: 'Montee', CROISIERE: 'Croisiere', DESCENTE: 'Descente',
      APPROCHE: 'Approche', FREINAGE: 'Freinage'
    }[this.phase] || this.phase;

    /* Une seule alerte a la fois, par ordre de gravite decroissante.
       La classe de severite pilote la couleur et l'animation, et suit le
       meme seuil que le cadran correspondant : rouge sous 12 % de
       carburant (comme le cadran), ambre entre 12 et 25 %. */
    const alert = $('alertBox');
    let alertText = null, alertSev = 'sev-critical';
    if (this.faultAlert) {
      alertText = this.faultAlert;
    } else if (ac.stall > 0.02 && !ac.onGround) {
      alertText = 'STALL — POUSSEZ LE MANCHE';
    } else if (ac.overspeed) {
      alertText = 'OVERSPEED';
    } else if (!ac.gearDown && ac.pos.y * FT < 500 && ac.vsi < 0) {
      alertText = 'TRAIN NON SORTI';
    } else if (ac.fuel <= 0) {
      alertText = 'PANNE SECHE';
    } else if (fuelPct < 0.12) {
      alertText = 'CARBURANT FAIBLE';
    } else if (fuelPct < 0.25) {
      alertText = 'CARBURANT A SURVEILLER';
      alertSev = 'sev-warning';
    }
    if (alertText) {
      if (alert.textContent !== alertText) alert.textContent = alertText;
      alert.className = `alert-box ${alertSev} alert-flash`;
    } else {
      alert.className = 'hidden alert-box sev-critical alert-flash';
    }

    /* Bandeau de contrat : avancement en direct pendant le vol. */
    const mc = $('missionChip');
    if (mc) {
      const m = this.missions.active;
      if (m) {
        const res = this.missions.evaluate(this.missionContext());
        const pct = Math.round(res.progress * 100);
        mc.querySelector('.mc-label').textContent = m.label;
        $('missionPct').textContent = `${pct}%`;
        $('missionFill').style.width = `${pct}%`;
        mc.classList.toggle('done', res.ok);
      } else {
        mc.querySelector('.mc-label').textContent = 'Aucun contrat';
        $('missionPct').textContent = '--';
        $('missionFill').style.width = '0%';
        mc.classList.remove('done');
      }
    }

    $('hintBox').textContent = this.hint || '';
    $('hintBox').style.opacity = this.hint ? '1' : '0';

    $('sFlaps').textContent = `FLAPS ${ac.flaps.name}`;
    $('sFlaps').classList.toggle('on', ac.flapIndex > 0);
    $('sGear').textContent = ac.gearDown ? 'GEAR DOWN' : 'GEAR UP';
    $('sGear').classList.toggle('on', ac.gearDown);
    $('sSpoil').textContent = ac.spoilers ? 'SPOILERS ON' : 'SPOILERS OFF';
    $('sSpoil').classList.toggle('on', ac.spoilers);
    $('sRev').textContent = ac.reverse ? 'REV ON' : 'REV OFF';
    $('sRev').classList.toggle('on', ac.reverse);
  },
  /* ========================================================== */
  /* Mini-PFD : 16 images/s suffisent, et il disparait en vue cockpit. */
  updatePfdHud(ac) {
    const cv = $('pfdHud');
    if (!cv) return;
    const show = this.r3d.cameraMode !== 'cockpit';
    cv.classList.toggle('off', !show);
    if (!show || document.body.classList.contains('arcade')) return;
    if (this.time - (this._pfdT || 0) < 0.06) return;
    this._pfdT = this.time;
    drawPFD(cv.getContext('2d'), cv.width, cv.height, ac, this.time);
  },
  /* Adapte l'interface a la vue de pilotage courante. */
  updatePilotViewUI() {
    document.body.classList.toggle('view-cockpit', this.r3d.cameraMode === 'cockpit');
  },
    /* Bandeau heure + meteo, present sur tous les HUD. On ne touche au
       DOM que si le texte change : le libelle ne bouge qu'une fois par
       minute de jeu, inutile de le reecrire 60 fois par seconde. */
    updateEnvChip() {
      const txt = this.env.chip();
      if (txt === this._envChipText) return;
      this._envChipText = txt;
      for (const id of ['envChipPilot', 'envChipHub', 'envChipCabin']) {
        const el = $(id);
        if (el) el.textContent = txt;
      }
    },
  /* Interface du vol (boutons d'action et anneaux). */
  updateArcadePilotUI() {
    const ac = this.ac;
    $('launchBtn').classList.toggle('hidden',
      !(ac.onGround && !this.assist.launched && !ac.touchdown && !this.reportShown));
    $('helpLandBtn').classList.toggle('hidden', ac.onGround || this.assist.landing);
    $('ringChip').classList.toggle('hidden', ac.onGround || this.sky.busy);
    $('ringN').textContent = this.arcade.ringsThisFlight;
  },
  /* Message transitoire independant du HUD actif (statuts cabine/aeroport, carnet...).
     `kind` colore la bordure : 'ok' (succes), 'warn' (avertissement), 'err' (echec). */
  toast(msg, ms = 3000, kind = '') {
    if (kind === 'err') sfx.oops();
    const el = $('toast');
    el.textContent = msg;
    el.className = el.className.replace(/\bt-(ok|warn|err)\b/g, '').replace(/\s+/g, ' ').trim();
    if (kind) el.classList.add(`t-${kind}`);
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  },
  flash(msg, ms = 2200) {
    this.hint = msg;
    this.hintUntil = this.time + ms / 1000;
  },
  /* Rapport de vol simplifie : etoiles, pieces, retour a l'aeroport. */
  showKidReport() {
    const ac = this.ac, t = ac.touchdown, arc = this.arcade;
    const rate = arc.rateLanding(t, ac.crashed);

    /* Le moteur economique tourne comme avant, seul l'affichage change. */
    this.mechanic.registerFlight(ac);
    this.cabin.registerFlight(ac);
    this.tycoon.reputation = clamp(this.tycoon.reputation + this.terminal.registerFlight(), 0, 100);
    const boarded = this.terminal.consumeBoardedSinceFlight();
    const bagsLoaded = this.terminal.consumeBagsSinceFlight();
    const plane = planeOf(this.ac.profile);
    /* Le rendement de l'avion s'applique au credit reel (avant : seulement a l'affichage,
       le rapport annoncait moins de pieces que ce qui etait verse). */
    const fr = this.tycoon.registerFlight(ac, { fpm: t.fpm, offset: Math.abs(t.offset) }, boarded, plane.income);
    const flightCoins = Math.max(0, Math.round(fr.profit / COIN));
    const paxShown = Math.min(fr.pax, plane.seats);
    const bonus = rate.stars * 10 + arc.ringsThisFlight * 3;
    arc.giveStars(rate.stars);
    arc.giveCoins(bonus, { silent: true });
    const planDest = arc.plan && arc.plan.dest;
    const pr = arc.resolvePlan(rate.stars, ac.crashed);
    this.history.addFlight({ pax: fr.pax, coins: flightCoins + bonus + (pr ? pr.bonus : 0), stars: rate.stars, city: planDest ? planDest.city : '', ico: planDest ? planDest.flag : '🛫' });
    if (!ac.crashed) {
      arc.event('landing');
      if (rate.stars === 3) arc.event('star3');
    }

    const row = $('kidStarsRow');
    [...row.children].forEach((el, i) => el.classList.toggle('on', i < rate.stars));
    $('kidRepTitle').textContent = rate.title;
    $('kidRepTitle').className = 'panel-title ' + (rate.stars === 3 ? 'text-amber-300' : rate.stars > 0 ? 'text-sky-300' : 'text-orange-300');
    $('kidRepTip').textContent = rate.tip;
    $('kidRepPax').textContent = paxShown;
    $('kidRepPax').nextElementSibling.textContent = paxShown > 1 ? 'passagers' : 'passager';
    $('kidRepRings').textContent = `${arc.ringsThisFlight}/5`;
    $('kidRepCoins').textContent = `+${flightCoins + bonus + (pr ? pr.bonus : 0)}`;
    const lines = [];
    if (rate.stars) lines.push(`⭐ ${rate.stars} etoile${rate.stars > 1 ? 's' : ''} = +${rate.stars * 10} 🪙`);
    if (arc.ringsThisFlight) lines.push(`🟡 ${arc.ringsThisFlight} anneau${arc.ringsThisFlight > 1 ? 'x' : ''} = +${arc.ringsThisFlight * 3} 🪙`);
    lines.push(`🎫 ${paxShown} passager${paxShown > 1 ? 's' : ''} = +${flightCoins} 🪙`);
    if (pr) lines.push(pr.line);
    if (bagsLoaded) lines.push(`🧳 ${bagsLoaded} bagage${bagsLoaded > 1 ? 's' : ''} charge${bagsLoaded > 1 ? 's' : ''} dans la soute`);
    else if (boarded > 0) lines.push('🧳 Aucun bagage charge : passe au tri des bagages !');
    if (boarded === 0) lines.push('💡 Fais embarquer des passagers au terminal pour gagner plus !');
    $('kidRepBonus').innerHTML = lines.join('<br>');

    const funLines = this.fun.reportFx(rate, flightCoins + bonus + (pr ? pr.bonus : 0)).concat(this.sky.reportLines());
    if (funLines.length) $('kidRepBonus').innerHTML = funLines.join('<br>') + '<br>' + $('kidRepBonus').innerHTML;
    $('kidReport').classList.remove('hidden');
    if (rate.stars >= 2) { arc.confetti(rate.stars === 3 ? 90 : 45); }
    else if (rate.stars === 0) sfx.oops();
  },
  showReport() {
    if (this.arcade.on) { this.showKidReport(); return; }
    const t = this.ac.touchdown;
    const fpm = t.fpm;
    let grade, color, badge, letter;
    if (this.ac.crashed) { grade = 'CRASH — appareil endommage'; color = 'text-red-400'; badge = 'g-red'; letter = 'X'; }
    else if (fpm < 80) { grade = 'BUTTER — poser parfait'; color = 'text-emerald-400'; badge = 'g-emerald'; letter = 'S'; }
    else if (fpm < 180) { grade = 'SMOOTH — tres bon poser'; color = 'text-sky-400'; badge = 'g-sky'; letter = 'A'; }
    else if (fpm < 320) { grade = 'CORRECT — poser standard'; color = 'text-amber-300'; badge = 'g-amber'; letter = 'B'; }
    else if (fpm < 600) { grade = 'FERME — passagers secoues'; color = 'text-orange-400'; badge = 'g-orange'; letter = 'C'; }
    else { grade = 'BRUTAL — inspection requise'; color = 'text-red-400'; badge = 'g-red'; letter = 'D'; }

    $('repTitle').className = `panel-title ${color}`;
    $('repGrade').textContent = grade;
    const badgeEl = $('repBadge');
    badgeEl.className = `rep-badge ${badge}`;
    badgeEl.textContent = letter;

    const off = Math.abs(t.offset);
    const rows = [
      ['Taux de chute', `${fpm.toFixed(0)} fpm`],
      ['Vitesse au toucher', `${t.ias.toFixed(0)} kt (Vref ${(this.ac.vRef() * KTS).toFixed(0)})`],
      ['Inclinaison', `${Math.abs(t.bank).toFixed(1)} deg`],
      ['Ecart axe de piste', `${off.toFixed(1)} m`],
      ['Configuration', `Volets ${t.flaps} / train ${t.gearDown ? 'sorti' : 'RENTRE'}`],
      ['Carburant restant', `${(this.ac.fuel / 1000).toFixed(1)} t`]
    ];
    $('repStats').innerHTML = rows.map(([k, v]) =>
      `<div class="rep-stat"><span>${k}</span><span>${v}</span></div>`
    ).join('');

    /* Transmission aux autres modules : la boucle Vol -> Atterrissage ->
       Maintenance -> Gestion -> Nouveau vol se referme ici. */
    this.mechanic.registerFlight(this.ac);
    /* Le duty-free du vol (recette annexe) est verse a la tresorerie. */
    const cabinRes = this.cabin.registerFlight(this.ac);
    this.tycoon.cash += cabinRes.sales;
    this.tycoon.reputation = clamp(this.tycoon.reputation + this.terminal.registerFlight(), 0, 100);
    const flightResult = this.tycoon.registerFlight(this.ac, { fpm, offset: off }, this.terminal.consumeBoardedSinceFlight());

        /* ---- PHASE 12 : contrat, facture de crash, pannes ---- */
        const ctx = this.missionContext();
        const mission = this.missions.settle(ctx);
        if (mission.ok) {
          this.tycoon.cash += mission.reward;
          this.tycoon.reputation = clamp(this.tycoon.reputation + mission.rep, 0, 100);
          this.tycoon.save();
        }

        /* Un crash se paie : structure, trains, reacteurs. La facture
           suit la gravite et l'usure deja accumulee. */
        let crashBill = 0;
        if (this.ac.crashed) {
          crashBill = this.tycoon.crashCost(this.ac, this.mechanic);
          this.tycoon.chargeCrash(crashBill);
        }

        /* Les pannes du vol sont listees dans le rapport : c'est la
           consequence visible d'un appareil mal entretenu. */
        const faults = (this.flightLog && this.flightLog.faults) || [];

        const profitEl = $('repProfit');
        const net = flightResult.profit + cabinRes.sales + (mission.ok ? mission.reward : 0) - crashBill;
        profitEl.textContent = `${net >= 0 ? '+' : ''}${Math.round(net).toLocaleString('fr-FR')} EUR`;
        profitEl.className = `rep-tile-val ${net >= 0 ? 'text-emerald-400' : 'text-red-400'}`;

        /* Passagers reellement embarques a la porte du terminal, quand
           ca a limite la recette : rend visible un mecanisme sinon
           invisible (voir TerminalSystem.consumeBoardedSinceFlight). */
        const paxNoteEl = $('repPaxNote');
        if (paxNoteEl) {
          paxNoteEl.classList.toggle('hidden', !flightResult.cappedByTerminal);
          if (flightResult.cappedByTerminal) {
            paxNoteEl.textContent = `${flightResult.pax} passagers embarques au terminal (demande : ${flightResult.demand})`;
          }
        }

        /* Bloc contrat : critere par critere, avec la prime. */
        const mEl = $('repMission');
        if (mEl) {
          const head = mission.ok
            ? `<div class="text-emerald-400 font-bold">CONTRAT REMPLI — ${mission.label} (+${mission.reward.toLocaleString('fr-FR')} EUR, +${mission.rep} rep.)</div>`
            : `<div class="text-amber-300 font-bold">CONTRAT NON REMPLI — ${mission.label}</div>`;
          const lines = (mission.rows || []).map(r =>
            `<div class="rep-stat"><span>${r.ok ? '&#10003;' : '&#10007;'} ${r.label}</span><span>${Math.round(r.progress * 100)}%</span></div>`
          ).join('');
          const next = `<div class="text-slate-400 mt-1">Prochain contrat : ${mission.next.label} — ${mission.next.brief}</div>`;
          mEl.innerHTML = `<div class="rep-block-h">Contrat</div>` + head + lines + next;
          mEl.className = `rep-block ${mission.ok ? 'ok' : 'ko'}`;
        }

        /* Bloc pannes / facture. */
        const fEl = $('repFaults');
        if (fEl) {
          const parts = [];
          if (faults.length) parts.push(`<div class="text-red-400 font-bold">PANNES EN VOL : ${faults.join(', ')}</div>`);
          if (crashBill > 0) parts.push(`<div class="text-red-400 font-bold">FACTURE DE REMISE EN ETAT : ${crashBill.toLocaleString('fr-FR')} EUR</div>`);
          if (!parts.length) parts.push('<div class="text-emerald-400">Aucune panne, aucun dommage.</div>');
          fEl.innerHTML = `<div class="rep-block-h">Etat de l'appareil</div>` + parts.join('');
          fEl.className = `rep-block ${parts.length > 1 || faults.length || crashBill > 0 ? 'ko' : 'ok'}`;
        }

        const maintEl = $('repMaint');
        if (this.mechanic.needsMaintenance()) {
          maintEl.textContent = 'Requise';
          maintEl.className = 'rep-tile-val text-amber-400';
        } else {
          maintEl.textContent = 'Conforme';
          maintEl.className = 'rep-tile-val text-emerald-400';
        }

        $('report').classList.remove('hidden');
      },
  refreshPauseLabels() {
    /* Tuiles du menu Arcade */
    const tile = (id, ico, title, sub) => {
      const el = $(id);
      if (!el) return;
      el.querySelector('.kp-ico').textContent = ico;
      el.querySelector('b').textContent = title;
      el.querySelector('small').textContent = sub;
    };
    tile('pauseMode', '🛠️', 'Mode Pilote', 'la vraie simulation');
    tile('pauseSound', sfx.muted ? '🔇' : '🔊', 'Son', sfx.muted ? 'coupe' : 'actif');
    /* Boutons du menu Pilote */
    const b = $('pauseModePro');
    if (b) b.textContent = '🎮 Passer en mode Arcade (facile)';
    const sp = $('pauseSoundPro');
    if (sp) sp.textContent = sfx.muted ? '🔇 Son coupe' : '🔊 Son actif';
  },
};
