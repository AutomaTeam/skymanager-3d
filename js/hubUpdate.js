/* ============================================================
   hubUpdate.js — Monde libre : tarmac, terminal, cabine, postes de maintenance
   (decoupe de main.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import { slideMove, collectBodies, depenetrate } from './bodies.js?v=1791603208';
import * as THREE from 'three';
import { REQUEST_LABELS, NEEDS_STOCK } from './cabinService.js?v=1791603208';
import { STATIONS, PARTS } from './mechanicSystem.js?v=1791603208';
import { COUNTERS } from './terminalSystem.js?v=1791603208';
import { TODAY, SHIRTS, gateNotes } from './terminalFlow.js?v=1791603208';
import { sfx } from './sfx.js?v=1791603208';
import { $, clamp, IS_TOUCH, HUB_WALK_SPEED, CONTROL_SPEED, PLAYER_TURN_SPEED, HOTSPOTS, CONTROL_RADIUS, CONTROL_ROLES, CONTROL_LABEL, ARCADE_LABEL } from './gameShared.js?v=1791603208';

/* Noms simples des pieces au poste de reparation (mode Arcade). */
const KID_PART = {
  tyresNose: '🛞 Pneus de devant', tyresMain: '🛞 Grosses roues', brakes: '🛑 Freins', struts: '🦘 Amortisseurs',
  flapsActu: '🪽 Volets des ailes', hydraulics: '💧 Tuyaux d\'huile', fanBlades: '🌀 Hélices du réacteur', airframe: '🛡️ Carrosserie'
};

export const hubMethods = {
  updateHub(dt) {
    const { move, turn } = this.hubCtl.read();
    /* Sprint (Shift) : utile pour traverser rapidement le complexe
       aeroportuaire desormais integralement praticable a pied. */
    const shift = this.hubCtl.keys.has('ShiftLeft') || this.hubCtl.keys.has('ShiftRight');
    /* Course automatique : joystick (ou fleche) pousse a fond vers l'avant, on se met a
       courir apres un court instant. Sur tablette il n'y a pas de touche Maj : sans cela
       un enfant ne pouvait jamais courir (ni rattraper le chien). */
    this._runT = move > 0.85 ? Math.min(1, (this._runT || 0) + dt / 0.7) : 0;
    const runMul = shift ? 1.8 : 1 + 0.65 * clamp((this._runT - 0.4) / 0.6, 0, 1);
    this.player.running = runMul > 1.3;
    const speed = HUB_WALK_SPEED * runMul;

      /* Deux cas de figure : on conduit un PNJ, ou on deplace son propre
         avatar. Dans les deux cas la collision passe par le graphe de
         navigation — murs du terminal, tour, bureau, hangars et appareil
         gare sont reellement infranchissables, et les portails sont les
         seuls passages entre le tarmac et les interieurs. */
      if (this.controlled) {
        const a = this.controlled;
        this.agents.moveControlled({ move, turn }, CONTROL_SPEED[a.role] || 3.4, dt, collectBodies(this));
        /* La camera suit l'agent tenu : on publie sa pose dans le meme
           objet que celui utilise par updateHubScene. */
        this.player.pos.set(a.wx, a.wy, a.wz);
        this.player.heading = a.heading;
        this.player.moving = a.moving;
      } else if (this.driving) {
        /* Au volant d'un vehicule (tracteur, camion de pompiers : js/vehicle.js). */
        this.driving.drive(dt);
      } else if (this.rides.active) {
        /* A roulettes (phase 40) : la monture conduit le joueur, voir js/rides.js. */
        this.rides.drive(dt);
      } else {
        /* Tourner en continu (gauche/droite) et avancer/reculer selon le
           cap courant (haut/bas), sans angle cible fixe : voir
           WalkJoystick.read() et la note sur PLAYER_TURN_SPEED plus haut. */
        if (Math.abs(turn) > 0.02) {
          this.player.heading += turn * PLAYER_TURN_SPEED * dt;
        }
        this.player.moving = Math.abs(move) > 0.05;
        if (this.player.moving) {
          const p = this.player.pos;
          const h = this.player.heading;
          const to = {
            x: p.x + Math.sin(h) * speed * move * dt,
            z: p.z + Math.cos(h) * speed * move * dt
          };
          /* Murs, obstacles fixes (graphe), coque de l'avion, personnes et vehicules :
             deplacement par petits pas avec glissement (js/bodies.js). */
          const next = slideMove(this.nav, p, to, collectBodies(this),
            (x, z) => this.agents._clearOfHull(null, x, z) && this.rides.walkable(x, z, p.y));
          p.x = next.x;
          p.z = next.z;
          /* Le sol n'est pas plat partout : la rampe de la passerelle
             mobile s'eleve du hall jusqu'a la porte cabine. */
                    p.y = Math.max(this.r3d.groundHeight(p.x, p.z), this.rides.surface(p.x, p.z));
        }
      }

      /* Un passager ou un PNJ qui avance sur l'avatar immobile le repousse : personne ne se traverse. */
      if (!this.controlled && !this.rides.active && !this.driving) {
        const pp = this.player.pos;
        const push = depenetrate(this.nav, pp.x, pp.z, collectBodies(this),
          (x, z) => this.agents._clearOfHull(null, x, z) && this.rides.walkable(x, z, pp.y));
        if (push) { pp.x = push.x; pp.z = push.z; }
      }

      this.r3d.updateHubScene(this.ac, this.mechanic, this.player, dt, this.time);
      this.rides.afterScene(dt);
      this.r3d.reactCones(this.player.pos.x, this.player.pos.z, dt);

      /* Point d'interaction le plus proche : poste de maintenance, cockpit,
         porte cabine ou bureau d'exploitation. */
      let nearest = null, nearestDist = 8.5;   // 8.5 : le laveur et l'aile droite sont a 7-8 m du bord de la zone interdite autour de l'avion
            const markers = this.r3d.hotspotMarkers || {};
            for (const h of HOTSPOTS) {
              if (h.passive) continue;
              const m = markers[h.key];
              if (!m) continue;
              const d = Math.hypot(m.group.position.x - this.player.pos.x, m.group.position.z - this.player.pos.z);
              if (d < nearestDist) { nearestDist = d; nearest = h; }
            }
            if (this.driving) nearest = null;      // au volant, le bouton sert au vehicule
            this.nearHotspot = nearest;

      /* Terminal : comptoirs et HUD des files quand on est dans le batiment. */
      this.updateTerminalInteractions();

      /* PNJ le plus proche, parmi les roles controlables. */
      const npc = this.arcade.on ? null : this.agents.nearest(this.player.pos.x, this.player.pos.z, CONTROL_RADIUS, CONTROL_ROLES);
      this.nearAgent = npc;

      /* Priorite au bouton de prise/rendu de controle : c'est l'action
         la plus specifique quand on est colle a un agent. */
      if (this.controlled) {
        $('btnInspect').classList.remove('hidden');
        $('btnInspectLabel').textContent = 'RENDRE LE CONTRÔLE';
      } else if (npc) {
        $('btnInspect').classList.remove('hidden');
        $('btnInspectLabel').textContent = `PRENDRE LE CONTRÔLE (${CONTROL_LABEL[npc.role] || npc.role.toUpperCase()})`;
      } else {
        /* Rien a faire ici ? On peut toujours dire bonjour aux gens ou caresser Biscuit (social.js). */
        const soc = this.driving ? this.driving.button() : nearest ? null : this.social.near();
        this.nearSocial = soc;
        $('btnInspect').classList.toggle('hidden', !nearest && !soc);
        if (nearest) $('btnInspectLabel').textContent = this.arcade.on
          ? (ARCADE_LABEL[nearest.type] ? ARCADE_LABEL[nearest.type](nearest) : nearest.label)
          : nearest.label;
        else if (soc) $('btnInspectLabel').textContent = soc.label;
      }

      /* Rappel contextuel du role tenu. */
      if (this.controlled) {
        $('hubHint').textContent = this.controlHint;
      }
    },
    /* ---------------------------------------------------------- */
    /* PHASE 3 — Prise et rendu de controle d'un PNJ                */
    /* ---------------------------------------------------------- */

    /* Le joueur endosse un agent : son avatar disparait, la camera
       passe sur l'agent, et les commandes de deplacement pilotent
       l'agent au lieu de l'avatar. */
    takeControl(a) {
      if (!a) return;
      this.agents.takeControl(a);
      this.controlled = a;
      this.controlRole = a.role;
      this.controlHint = `Vous êtes ${CONTROL_LABEL[a.role] || a.role}. ${this.roleHint(a.role)}`;
      /* L'avatar du joueur s'efface : on ne joue plus qu'un seul corps.
         La lampe reste allumee, elle suit desormais l'agent tenu. */
      this.r3d.setPlayerVisible(false);
      this.player.pos.set(a.wx, a.wy, a.wz);
      this.player.heading = a.heading;
      this.player.moving = false;
      this.nearHotspot = null;
      $('hubHint').textContent = this.controlHint;
      this.toast(`Contrôle pris : ${CONTROL_LABEL[a.role] || a.role}.`, 2200);
    },
    /* L'agent reprend sa routine depuis sa position actuelle : aucune
       teleportation, il repart d'ou le joueur l'a laisse. */
    releaseControl() {
      const a = this.agents.releaseControl();
      this.controlled = null;
      this.controlRole = null;
      this.controlHint = '';
      this.r3d.setPlayerVisible(true);
      if (a) {
        /* On repose l'avatar la ou l'agent a ete rendu, sur du sol
                 praticable ET hors du fuselage, pour que la reprise soit
                 continue sans se retrouver dans la coque. */
              const w = this.agents._safeSpot(a, a.wx, a.wz, 12, 1) || this.nav.nearestWalkable(a.wx, a.wz, 12, 1);
              this.player.pos.set(w.x, this.r3d.groundHeight(w.x, w.z), w.z);
              this.player.heading = a.heading;
              this.toast('Contrôle rendu — l\'agent reprend son service.', 2200);
            }
      $('hubHint').textContent = this.mechanic.needsMaintenance()
        ? 'Maintenance requise avant le prochain vol — approchez-vous d\'un point de diagnostic sur l\'appareil.'
        : 'Approchez-vous de l\'avion pour piloter ou embarquer, et de la tour pour gérer l\'aéroport.';
    },
    /* Rappel de ce que le role tenu sait faire, pour ne pas laisser le
       joueur devant un avatar sans autre perspective que marcher. */
    roleHint(role) {
      if (role === 'mechanic') return 'Approchez-vous d\'un point de diagnostic sur l\'appareil pour réparer.';
      return 'Vous circulez sur l\'aire de trafic, autour de l\'appareil.';
    },
    handleHubInteract() {
      /* Le bouton contextuel sert d'abord a la prise/au rendu de controle. */
      if (this.controlled) { this.releaseControl(); return; }
      if (this.nearAgent) { this.rides.dismount(true); this.takeControl(this.nearAgent); return; }

      const h = this.nearHotspot;
      if (!h) { if (this.nearSocial) this.social.interact(this.nearSocial); return; }
      this.rides.dismount(true);
      if (h.type === 'mechanic') this.openStationPanel(h.key);
      else if (h.type === 'cockpit') this.boardAircraft();
      else if (h.type === 'cabin') this.enterCabin();
      else if (h.type === 'tower') this.openTycoonPanel();
      else if (h.type === 'game') this.minigames.open(h.game);
    },
  /* ========================================================== */
  /* TERMINAL — batiment du monde ouvert (phase 22).              */
  /* Plus d'etat ni de camera a part : on y marche depuis la      */
  /* piste ou depuis la ville. Appele a chaque image par updateHub */
  /* ========================================================== */
  updateTerminalInteractions() {
    const p = this.player.pos;
    /* La caisse portee se voit partout, dedans comme dehors. */
    this.r3d.setPlayerCarry(this.terminal.carry > 0);
    const inside = this.r3d.isInsideTerminal(p.x, p.z) && !this.controlled;
    if (inside !== this.inTerminal) {
      this.inTerminal = inside;
      $('termStats').classList.toggle('hidden', !inside);
      if (inside) {
        $('hubAreaName').textContent = 'Terminal';
        $('hubHint').textContent = this.arcade.on
          ? 'Va devant un comptoir (suis la flèche) et appuie sur le bouton pour faire avancer les passagers !'
          : "Rejoignez un poste pour l'ouvrir ou traiter la file. La porte d'embarquement rapporte de l'argent.";
        this.toast('Vous entrez dans le terminal.', 1400);
      } else {
        $('hubAreaName').textContent = 'Tarmac';
        $('hubHint').textContent = "Approchez-vous de l'avion pour piloter ou embarquer, et de la tour pour gérer l'aéroport.";
        $('btnCounter').classList.add('hidden');
        this.nearCounter = null;
      }
    }
    if (!inside) return;

    /* Poste le plus proche. Les commerces se touchent de plus loin : on
       interagit depuis la voie centrale, pas depuis l'arriere-comptoir. */
    let nearest = null, bestScore = 0;
    const markers = this.r3d.terminalCounters || {};
    for (const c of COUNTERS) {
      const vis = markers[c.id];
      if (!vis) continue;
      const d = Math.hypot(vis.deskGroup.position.x - p.x, vis.deskGroup.position.z - p.z);
      /* Portee depuis le centre du meuble : le portique de surete est profond (5 m),
         les commerces sont larges, un distributeur est petit. */
      const reach = { security: 7.2, shop: 4.6, cafe: 4.6, storage: 4.4, baggage: 4.4, vending: 3.8, gate: 4.2 }[c.kind] || 3.8;
      const score = d - reach;          // negatif = a portee
      if (score < 0 && score < bestScore) { bestScore = score; nearest = c; }
    }
    this.nearCounter = nearest;
    $('btnCounter').classList.toggle('hidden', !nearest);
    if (nearest) {
      let lbl = this.terminal.actionLabel(nearest.id);
      if (this.arcade.on && lbl === 'FERMER LE POSTE') lbl = '⏳ EN ATTENTE DE CLIENTS';
      if (this.arcade.on && nearest.kind === 'shop' && this.terminal.actionKind(nearest.id) === 'info') lbl = '🎁 ACHETER UN SOUVENIR';
      $('btnCounterLabel').textContent = lbl;
    }

    $('termMood').textContent = this.terminal.mood.toFixed(0);
    $('termMood').parentElement.classList.toggle('warn', this.terminal.mood < 35);
    const openCount = Object.values(this.terminal.counters).filter(c => c.open).length;
    $('termOpen').textContent = openCount;
    $('termTotal').textContent = COUNTERS.length;
    const totalQueue = this.terminal.totalQueue();
    $('termQueue').textContent = totalQueue;
    $('termQueue').parentElement.classList.toggle('warn', totalQueue > 20);
    $('termBoarded').textContent = this.terminal.boarded;
    $('termRevenue').textContent = Math.round(this.terminal.revenue).toLocaleString('fr-FR');
    $('termMissed').textContent = this.terminal.missed;
    $('termMissed').parentElement.classList.toggle('warn', this.terminal.missed > 0);

    /* Stocks des machines (boutique, cafe, distributeur) et caisse portee. */
    const ts = this.terminal.counters;
    const chip = (id, ico) => {
      const n = Math.floor(ts[id].stock);
      const col = n >= 6 ? 'text-emerald-300' : n >= 3 ? 'text-amber-300' : 'text-rose-300';
      return `<span class="${col}">${ico}${n}</span>`;
    };
    $('termStock').innerHTML = `${chip('shop', '🛍️')} ${chip('cafe', '☕')} ${chip('vending', '🥤')}`;
    $('termCarryChip').classList.toggle('hidden', this.terminal.carry <= 0);
    $('termCarry').textContent = this.terminal.carry;
  },
      /* ---------- Comptoirs et machines (phase 25) ----------
         Le bouton contextuel depend du poste : verifier un passager (billet,
         plateau, carte), charger un bagage, prendre une caisse a la reserve,
         recharger une machine, servir un client. */
      handleCounterInteract() {
        const c = this.nearCounter;
        if (!c) return;
        const t = this.terminal, A = this.arcade;
        switch (t.actionKind(c.id)) {
          case 'take': {
            const r = t.takeCrate();
            this.toast(r.msg, 2600, r.ok ? 'ok' : 'warn');
            if (r.ok) { sfx.click(); if (A.on) A.popup('📦 Caisse prise !'); } else sfx.oops();
            break;
          }
          case 'restock': {
            const r = t.restock(c.id);
            this.toast(r.msg, 2200, r.ok ? 'ok' : 'warn');
            if (r.ok) {
              if (A.on) { A.giveCoins(3, { label: 'Machine rechargée !' }); A.event('restock'); } else sfx.ding();
            } else sfx.oops();
            break;
          }
          case 'bag': {
            if (t.loadBag()) {
              if (A.on) { A.giveCoins(1, { label: 'Bagage chargé' }); A.event('bag'); } else sfx.click();
            }
            break;
          }
          case 'serve': {
            const left = t.serveNext(c.id);
            if (left === null) { this.toast(t.lastMessage || 'Rien à servir ici.', 1800, 'warn'); sfx.oops(); break; }
            if (A.on) { A.giveCoins({ shop: 3, cafe: 3, vending: 2 }[c.kind] || 2, { label: 'Vendu !' }); A.event('serve'); } else sfx.click();
            break;
          }
          case 'check':
            this.openCheckPanel(c);
            break;
          case 'open':
            t.toggleCounter(c.id);
            this.toast(`${c.label} ouvert.`, 1600);
            if (A.on) A.giveCoins(1, { label: 'Poste ouvert !' });
            break;
          case 'close':
            if (A.on) this.toast('Personne ici ! Va voir un autre poste 👀', 1800);
            else { t.toggleCounter(c.id); this.toast(`${c.label} ferme.`, 1600); }
            break;
          default:
            if (c.kind === 'shop' && A.on) this.shopSouvenir();
            else this.toast(t.actionLabel(c.id), 1800);
        }
      },
      /* H05 : on achete vraiment un souvenir (autocollant, couleur...) pour le hangar.
         1er appui : on propose ; 2e appui dans les 8 s : on achete. */
      shopSouvenir() {
        const h = this.hangar, o = h.shopOffer();
        if (!o) { this.toast('🛍️ Tu as déjà tout acheté ici, bravo !', 2600); return; }
        const now = performance.now();
        const same = this._souvenir && this._souvenir.id === o.it.id && now - this._souvenir.t < 8000;
        if (!same) {
          this._souvenir = { id: o.it.id, t: now };
          this.toast(`🎁 ${o.it.ico || ''} ${o.it.name} : ${o.it.price} 🪙. Appuie encore pour l'acheter !`, 4200);
          sfx.click();
          return;
        }
        this._souvenir = null;
        if (h.buyOffer(o)) { sfx.tada(); this.arcade.confetti(30); this.arcade.event('souvenir'); this.toast(`🎉 ${o.it.ico || ''} ${o.it.name} est dans ton hangar !`, 3600, 'ok'); }
        else { sfx.oops(); this.toast('Pas assez de pièces… vole encore un peu !', 2400, 'warn'); }
      },
      /* ---------- Panneau de verification ---------- */
      openCheckPanel(c) {
        this._chkCounter = c;
        this._chkBusy = false;
        this._worldPaused = true;
        $('checkPanel').classList.remove('hidden');
        this.renderCheck();
      },
      closeCheckPanel() {
        clearTimeout(this._chkTimer);
        $('checkPanel').classList.add('hidden');
        this._chkCounter = null;
        this._chkBusy = false;
        this.terminal.inspectId = null;
        this._worldPaused = false;
      },
      renderCheck() {
        const c = this._chkCounter;
        if (!c) return;
        const t = this.terminal;
        const pax = t.head(c.id);
        $('chkVerdict').classList.add('hidden');
        if (!pax) { this.closeCheckPanel(); return; }
        t.inspectId = pax.id;
        const sh = SHIRTS[pax.shirt] || SHIRTS[0];
        $('chkCount').textContent = `${t.counters[c.id].queue} en file`;
        let title = '', rule = '', body = '', btns = [];
        const card = (h, inner, cls = '') => `<div class="chk-card ${cls}"><h4>${h}</h4>${inner}</div>`;
        /* Le passager est reconnaissable dans le hall : meme couleur de chemise que sur le panneau. */
        const who = card('PASSAGER', `<div class="big">${pax.face} ${pax.name}</div><div class="ref">Chemise ${sh.name} ${sh.dot} : regarde-le dans le hall !</div>`, 'wide');
        if (c.kind === 'checkin') {
          title = '🎫 Enregistrement';
          rule = `Compare le billet au vol du jour, puis regarde le poids du bagage (limite ${TODAY.bagLimit} kg).`;
          body = who + card('BILLET', `<div class="big">${pax.name}</div><div>Vol : <b>${pax.flight}</b> · siège ${pax.seat}</div>` +
                 `<div class="ref">Vol du jour : ${TODAY.flight} → ${TODAY.dest}</div>`) +
                 card('BAGAGE', `<div class="big">${pax.kg} kg</div><div class="ref">Limite : ${TODAY.bagLimit} kg · plus lourd = surcharge à payer</div>`);
          btns = [['ok', 'ok', '✅ VALIDER', 'en règle'], ['fee', 'fee', '💰 SURCHARGE', 'bagage trop lourd'], ['refuse', 'no', '⛔ REFUSER', 'mauvais vol']];
        } else if (c.kind === 'security') {
          title = '🛃 Contrôle de sûreté';
          rule = 'Regarde le plateau. Couteau, ciseaux, pétards, marteau ou grande bouteille : on confisque !';
          body = who + card('PLATEAU (SCANNER)', `<div class="chk-tray">${pax.tray.map(e => `<span>${e}</span>`).join('')}</div>` +
                 `<div class="ref" style="text-align:center;margin-top:.3rem">Interdit : 🔪 ✂️ 🧨 🍾 🔨</div>`, 'wide');
          btns = [['pass', 'ok', '✅ PASSER', 'rien d\'interdit'], ['seize', 'no', '🚫 CONFISQUER', 'objet interdit']];
        } else {
          title = '📲 Porte d\'embarquement';
          rule = `Scanne la carte (vol ${TODAY.flight}). Lis les notes : elles t'aident à rattraper une erreur d'avant !`;
          const notes = gateNotes(pax);
          body = who + card('CARTE D\'EMBARQUEMENT', `<div class="big">${pax.name}</div><div>Vol : <b>${pax.passFlight}</b> · place ${pax.seat}</div>` +
                 `<div class="ref">Ici : ${TODAY.flight} · ${TODAY.gate} · ${TODAY.dest}</div>`, 'wide') +
                 (notes.length ? card('NOTES DU HALL', notes.map(n => `<div class="chk-note">${n.icon} ${n.text}</div>`).join(''), 'wide') : '');
          btns = [['scan', 'ok', '📲 SCANNER', 'carte valide'], ['fee', 'fee', '💰 SURCHARGE', 'bagage trop lourd'],
                  ['refuse', 'no', '⛔ REFUSER', 'mauvais vol ou détecteur']];
        }
        $('chkTitle').textContent = title;
        $('chkRule').textContent = rule;
        $('chkBody').innerHTML = body;
        this._chkChoices = btns.map(b => b[0]);
        $('chkButtons').innerHTML = btns.map(([ch, cls, lbl, sub], i) =>
          `<button class="chk-btn ${cls}" data-choice="${ch}">${lbl}<small>${sub}${IS_TOUCH ? '' : ' · touche ' + (i + 1)}</small></button>`).join('');
        $('chkButtons').querySelectorAll('[data-choice]').forEach(b =>
          b.addEventListener('click', () => this.decideCheck(b.dataset.choice)));
      },
      decideCheck(choice) {
        const c = this._chkCounter;
        if (!c || this._chkBusy) return;
        const res = this.terminal.decide(c.id, choice);
        if (!res) { this.closeCheckPanel(); return; }
        this._chkBusy = true;
        $('chkButtons').querySelectorAll('button').forEach(b => { b.disabled = true; });
        const A = this.arcade;
        const v = $('chkVerdict');
        v.className = 'chk-verdict ' + (res.ok ? 'ok' : 'ko');
        v.innerHTML = res.ok ? res.msg : `${res.msg}<small>${res.why}</small>`;
        if (res.ok) {
          if (A.on) { A.giveCoins(res.coins, { silent: false }); A.event('serve'); } else sfx.click();
          if (res.fee) this.toast('💰 Surcharge payée par le passager !', 1400, 'ok');
        } else {
          sfx.oops();
        }
        this._chkTimer = setTimeout(() => { this._chkBusy = false; this.renderCheck(); }, res.ok ? 750 : 1900);
      },
  /* Monte aux commandes : reprend le pilotage exactement ou l'appareil
     se trouve (porte, taxiway, piste...), sans le teleporter. */
  boardAircraft() {
      if (this.controlled) this.releaseControl();
      /* Depuis la cabine (on marche jusqu'au cockpit) : on quitte d'abord la cabine. */
      const fromCabin = this.state === 'CABIN';
      if (fromCabin) {
        this.r3d.exitCabinMode();
        $('hudCabin').classList.add('hidden');
      }
      this.r3d.exitHubMode();
      /* On a marche jusqu'au cockpit : on s'assied dans le siege gauche. */
      if (fromCabin) {
        this.r3d.cameraMode = 'cockpit';
        this.r3d.look.yaw = this.r3d.look.pitch = 0;
      }
      this.updatePilotViewUI();
    $('hudHub').classList.add('hidden');
    $('hudPilot').classList.remove('hidden');
    this.state = 'PILOT';

    this.reportShown = false;
    this.tdTimer = 0;
    this.ac.touchdown = null;
    this.controls.setThrottle(0);
        this.beginFlightLog();
        $('report').classList.add('hidden');

        if (this.arcade.on) { this.startArcadeFlight(); return; }
        this.flash('Aux commandes. Relâchez le frein et roulez vers la piste 36.', 4500);
      },
  openStationPanel(stationKey) {
    const st = STATIONS.find(s => s.key === stationKey);
    if (!st) return;
    this.currentStation = stationKey;
    if (this.arcade.on) this.topUpParts();
    $('stationTitle').textContent = st.label;
    this.refreshStationPanel();
    $('stationPanel').classList.remove('hidden');
        /* Panneau de lecture : on gele le monde pour ne pas perdre de
           satisfaction pendant qu'on choisit quoi reparer. */
        this._worldPaused = true;
      },
  /* Atelier en Arcade : une barre de sante et un gros bouton REPARER. */
  /* Plan « jeu cool » C2 : des noms que l'enfant comprend (KID_PART, en tete de fichier). */
  refreshStationPanelKid() {
    const st = STATIONS.find(s => s.key === this.currentStation);
    $('stationSub').textContent = 'Appuie sur RÉPARER, puis tape au bon moment !';
    $('stationWo').textContent = '';
    $('stationList').innerHTML = st.components.map(key => {
      const c = this.mechanic.components[key];
      const hp = clamp(Math.round(100 - c.wear), 0, 100);
      const color = hp < 40 ? '#f87171' : hp < 70 ? '#fbbf24' : '#34d399';
      return `<div class="station-row kid">
        <div style="flex:1;min-width:0">
          <div class="nm">${KID_PART[key] || c.label}</div>
          <div class="hp-bar"><div class="hp-fill" style="width:${hp}%;background:${color}"></div></div>
          <div class="station-wear">${hp >= 92 ? 'Comme neuf !' : hp >= 70 ? 'Un peu usé' : hp >= 40 ? 'À réparer bientôt' : 'Très abîmé : vite !'} (${hp}%)</div>
        </div>
        <button class="station-repair-btn" data-repair="${key}" ${hp >= 92 ? 'disabled' : ''}>${hp >= 92 ? '✅ Parfait' : '🔧 RÉPARER'}</button>
      </div>`;
    }).join('');
    $('stationList').querySelectorAll('[data-repair]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.repair;
        const label = this.mechanic.components[key].label;
        $('stationPanel').classList.add('hidden');
        this._worldPaused = false;
        this.playMinigame(key, label).then(() => {
          $('stationPanel').classList.remove('hidden');
          this._worldPaused = true;
          this.refreshStationPanelKid();
        });
      });
    });
  },
  refreshStationPanel() {
    if (!this.currentStation) return;
    if (this.arcade.on) { this.refreshStationPanelKid(); return; }
    const st = STATIONS.find(s => s.key === this.currentStation);
    const rows = st.components.map(key => {
      const c = this.mechanic.components[key];
      const color = c.wear >= c.critical ? '#f87171' : (c.wear >= c.critical * 0.55 ? '#fbbf24' : '#34d399');
      const part = PARTS[c.part];
      const stock = this.mechanic.parts[c.part] || 0;
      const sub = [];
      sub.push(`Usure ${c.wear.toFixed(0)}% / seuil ${c.critical}%`);
      if (c.fluid != null) sub.push(`Fluide ${c.fluid.toFixed(0)}%`);
      if (c.torque != null) sub.push(`Couple ${c.torque.toFixed(0)}%`);
      const wo = this.mechanic.openWorkOrders().find(w => w.key === key);
      return `<div class="station-row">
        <div>
          <span class="station-dot" style="background:${color}"></span>${c.label}
          ${wo ? `<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded ${wo.priority === 'urgent' ? 'bg-red-500/25 text-red-300' : 'bg-amber-500/20 text-amber-300'}">${wo.priority === 'urgent' ? 'URGENT' : 'PLANIFIE'}</span>` : ''}
          <div class="station-wear">${sub.join(' · ')}</div>
          <div class="station-wear">Pièce : ${part ? part.label : '—'} <span class="${stock > 0 ? 'text-emerald-400' : 'text-red-400'}">(stock ${stock})</span></div>
        </div>
        <button class="station-repair-btn" data-repair="${key}">Réparer</button>
      </div>`;
    }).join('');
    $('stationList').innerHTML = rows;
    $('stationWo').textContent = `${this.mechanic.openWorkOrders().length} ordre(s)`;
    $('stationSub').textContent = this.mechanic.needsMaintenance()
      ? 'Des composants dépassent leur seuil critique : intervention obligatoire avant le vol.'
      : 'Diagnostic : usure, fluides et couples de serrage.';

    /* Magasin de pieces : achat avec la tresorerie de l'aeroport. */
    const cash = this.tycoon.cash;
    const cashEl = $('partsCash');
    cashEl.textContent = `${Math.round(cash).toLocaleString('fr-FR')} EUR`;
    cashEl.className = cash < 0 ? 'text-[11px] text-red-400' : 'text-[11px] text-emerald-300';
    $('partsList').innerHTML = Object.keys(PARTS).map(p => {
      const def = PARTS[p];
      const stock = this.mechanic.parts[p] || 0;
      const afford = cash >= def.cost;
      return `<button class="parts-btn ${afford ? '' : 'opacity-40'}" data-buy="${p}" ${afford ? '' : 'disabled'}>
        <span class="block text-[11px] font-semibold text-slate-100">${def.label}</span>
        <span class="block text-[10px] text-slate-400">${def.cost.toLocaleString('fr-FR')} EUR · stock ${stock}</span>
      </button>`;
    }).join('');
    $('partsList').querySelectorAll('[data-buy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.buy;
        const res = this.mechanic.buyPart(p, 1, this.tycoon.cash);
        if (!res) { this.toast('Trésorerie insuffisante pour cette pièce.', 2000, 'err'); return; }
        this.tycoon.cash -= res.cost;
        this.tycoon.save();
        this.toast(`${PARTS[p].label} acheté (${res.cost.toLocaleString('fr-FR')} EUR).`, 2000);
        this.refreshStationPanel();
      });
    });

    $('stationList').querySelectorAll('[data-repair]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.repair;
        const label = this.mechanic.components[key].label;
        $('stationPanel').classList.add('hidden');
                this._worldPaused = false;
                this.playMinigame(key, label).then(() => {
                  $('stationPanel').classList.remove('hidden');
                  this._worldPaused = true;
                  this.refreshStationPanel();
          $('hubHint').textContent = this.mechanic.needsMaintenance()
            ? 'Des composants restent au-dessus du seuil critique.'
            : 'Tous les composants sont conformes — vous pouvez signer le carnet.';
        });
      });
    });
  },
  /* Mini-jeu de reparation en trois etapes : serrage au couple,
     remplissage du circuit, puis controle final. La moyenne des trois
     notes determine la qualite de l'intervention (voir
     MechanicSystem.repair) et donc ce qui est reellement remis a niveau. */
  async playMinigame(componentKey, label) {
    const modal = $('minigame');
    const comp = this.mechanic.components[componentKey];
    const hasFluid = comp.fluid != null;
    const steps = this.arcade.on ? [
      { name: 'Visse la pièce', hint: 'Tape quand la barre blanche passe dans le vert !', speed: 1.2, width: 38 }
    ] : [
      { name: 'Serrage au couple', hint: 'Tapez quand le repère passe dans la zone verte', speed: 1.6, width: 22 },
      { name: hasFluid ? 'Mise à niveau du circuit' : 'Contrôle d\'usure',
        hint: hasFluid ? 'Remplissez jusqu\'au repère — visez le centre' : 'Vérifiez l\'épaisseur restante',
        speed: 2.1, width: 18 },
      { name: 'Contrôle final', hint: 'Dernière vérification avant remise en service', speed: 2.7, width: 14 }
    ];

    $('mgTitle').textContent = this.arcade.on ? '🔧 Répare !' : 'Serrage au couple';
    $('mgDot1').style.display = $('mgDot2').style.display = this.arcade.on ? 'none' : '';
    $('mgSub').textContent = label;
    $('mgResult').textContent = '';
    $('mgTapBtn').textContent = 'TAPER';
    [0, 1, 2].forEach(i => { $('mgDot' + i).className = 'mg-dot'; });
    modal.classList.remove('hidden');
    /* Mini-jeu modal : le monde est gele le temps des trois manches,
       comme pour les autres panneaux. */
    this._worldPaused = true;

    const results = [];
    for (let round = 0; round < steps.length; round++) {
      const step = steps[round];
      $('mgStep').textContent = steps.length === 1 ? step.name : `Étape ${round + 1}/${steps.length} — ${step.name}`;
      $('mgSub').textContent = step.hint;
      const q = await this.runMinigameRound(round, step);
      results.push(q);
      $('mgDot' + round).classList.add(q >= 55 ? 'hit' : 'miss');
    }
    const rawAvg = results.reduce((a, b) => a + b, 0) / results.length;
    /* En Arcade la reparation reussit presque toujours, seule la recompense varie. */
    const avg = this.arcade.on ? Math.min(100, 70 + rawAvg * 0.3) : rawAvg;
    const res = this.mechanic.repair(componentKey, avg, { wear: true, fluid: true, torque: true });
    this.r3d.applyWearVisuals(this.mechanic);
        /* PHASE 12 : une reparation remet le composant en etat, donc la
           panne qu'il avait provoquee en vol disparait. Sans cela, un
           appareil parfaitement repare continuerait de voler avec un
           reacteur bride jusqu'au rechargement de la page. */
        this.clearFaultFor(componentKey);
        const bits = [`Qualité ${avg.toFixed(0)}%`, `usure ${res.wear.toFixed(0)}%`];
    if (res.fluid != null) bits.push(`fluide ${res.fluid.toFixed(0)}%`);
    if (res.torque != null) bits.push(`couple ${res.torque.toFixed(0)}%`);
    if (!res.usedPart) bits.push('sans pièce neuve (qualité réduite)');
    $('mgResult').textContent = bits.join(' · ');
    $('mgTapBtn').textContent = 'CONTINUER';
    if (this.arcade.on) {
      $('mgResult').textContent = rawAvg >= 85 ? 'PARFAIT ! ✨' : rawAvg >= 55 ? 'Bien joué !' : 'Réparé, mais essaie plus précis !';
      this.arcade.giveCoins(3 + Math.round(rawAvg / 25), { label: 'Réparation !' });
      this.arcade.event('repair');
    }

    await new Promise(resolve => {
      $('mgTapBtn').onclick = () => resolve();
    });
    $('mgTapBtn').onclick = null;
    modal.classList.add('hidden');
    this._worldPaused = false;
  },
  runMinigameRound(round, step) {
    return new Promise(resolve => {
      const zoneW = Math.max(9, (step ? step.width : 22 - round * 4));  // % de la largeur
      const zoneCenter = 15 + Math.random() * 70;       // %
      $('mgZone').style.left = (zoneCenter - zoneW / 2) + '%';
      $('mgZone').style.width = zoneW + '%';

      const speed = step ? step.speed : 1.6 + round * 0.5;
      const t0 = performance.now();
      let raf, pos = 50;

      const tick = (now) => {
        const t = (now - t0) / 1000;
        pos = 50 + 48 * Math.sin(t * speed * Math.PI);
        $('mgNeedle').style.left = pos + '%';
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      const onTap = () => {
        cancelAnimationFrame(raf);
        $('mgTapBtn').removeEventListener('click', onTap);
        const half = zoneW / 2;
        const diff = Math.abs(pos - zoneCenter);
        const q = diff <= half ? 100 - (diff / half) * 35 : Math.max(0, 60 - (diff - half) * 3);
        resolve(q);
      };
      $('mgTapBtn').addEventListener('click', onTap);
    });
  },
  /* ========================================================== */
  /* ITERATION 3 — Cabine et service passagers                    */
  /* ========================================================== */
  enterCabin() {
      if (this.controlled) this.releaseControl();
      this.r3d.exitHubMode();
    $('hudHub').classList.add('hidden');
    $('hudCabin').classList.remove('hidden');
    this.state = 'CABIN';

    this.r3d.enterCabinMode(this.cabin.rows, this.arcade.on);
    /* Arcade : on repart d'une cabine correcte a chaque visite (jamais coince a 0 %). */
    if (this.arcade.on && this.cabin.satisfaction < 50) { this.cabin.satisfaction = 50; this.cabin.save(); }
    /* On entre par la porte avant gauche (z = -5.2), face a l'avant : on
       vient de la passerelle, la porte est dans le dos. */
    const att = this.attendant;
    att.x = -0.3; att.z = -5.2;
    att.heading = att.target = 0;
    att._back = 0;
    this.nearInteraction = null;
    $('btnServe').classList.add('hidden');
    $('turbAlert').classList.add('hidden');
    $('unrulyPanel').classList.add('hidden');

    $('cabHint').textContent = this.arcade.on
      ? 'Avance dans l\'allée et sers les passagers qui ont une bulle. Porte SORTIE à gauche, COCKPIT tout devant !'
      : 'Servez les passagers dans l\'allée. Rechargez le chariot au galley (avant) et vendez le duty-free à l\'entrée.';
  },
  /* Sortie par la porte : on reparait sur le seuil, cote passerelle. */
  exitCabinByDoor() {
    const w = this.nav.toWorld('aircraft', -3.2, -6.0);
    const pos = new THREE.Vector3(w.x, 0, w.z);
    this.goToHub({ pos, heading: 0 });
    this.toast('🚪 Tu descends de l\'avion.', 1800);
  },
  updateCabin(dt) {
    const cabin = this.cabin;
    const att = this.attendant;
    const rowSpacing = this.r3d.cabinRowSpacing || 1.3;

    /* Marche libre dans l'allee (phase 19). Meme joystick que le tarmac.
       - haut : avancer dans le sens du regard ;
       - bas (0,3 s) : demi-tour, puis on avance dans l'autre sens ;
       - gauche / droite : se decaler dans l'allee (1,3 m de large) pour
         se rapprocher d'un siege ou de la porte.
       Le galley occupe l'avant (z = 0,9), le bloc sanitaire l'arriere. */
    const minZ = -(cabin.rows - 1) * rowSpacing - 0.4;
    const maxZ = 0.9;
    const DOOR = { z0: -6.8, z1: -5.2 };            // ouverture de la porte, paroi gauche (x < 0)
    const { move, turn } = this.cabCtl.read();
    const speed = this.arcade.on ? 3.0 : 2.6;

    /* Demi-tour : on recule un instant -> on se retourne. `_back` sert aussi de delai de repos. */
    if (att._back < 0) att._back = Math.min(0, att._back + dt);
    else if (move < -0.6) {
      att._back += dt;
      if (att._back > 0.3) { att.target = att.target === 0 ? Math.PI : 0; att._back = -0.7; }
    } else att._back = 0;

    /* Le cap glisse vers l'axe de l'allee (0 = avant, PI = arriere). */
    let dh = att.target - att.heading;
    dh = ((dh + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    att.heading += clamp(dh, -7 * dt, 7 * dt);
    const turning = Math.abs(dh) > 0.25;

    const forward = Math.cos(att.heading);           // +1 vers l'avant, -1 vers l'arriere
    if (!turning && move > 0.05) att.z += forward * move * speed * dt;
    /* Decalage lateral : face a l'avant, la droite est vers x < 0. */
    att.x += forward * turn * 1.5 * dt;
    att.z = clamp(att.z, minZ, maxZ);
    const inDoor = att.z > DOOR.z0 && att.z < DOOR.z1;
    att.x = clamp(att.x, inDoor ? -1.5 : -0.42, 0.42);
    att.moving = (!turning && move > 0.05) || Math.abs(turn) > 0.05;

    if (!this._worldPaused) cabin.update(dt, !this.ac.onGround);
    /* Arcade : le chariot se recharge tout seul en passant au galley. */
    if (this.arcade.on && att.z >= maxZ - 0.05 && cabin.cartStock < cabin.cartCapacity) {
      cabin.restockCart();
      this.arcade.popup('🥤 Chariot rempli !');
      sfx.click();
    }
    this.r3d.updateCabinScene(cabin, att, dt, this.time);

    /* Poste le plus proche : requete passager, passager indiscipline,
       galley (recharge) ou chariot (duty-free). */
    let near = null, nearestDist = 1.7;
    /* Debout dans l'ouverture de la porte : on peut sortir. */
    const atDoor = att.z > DOOR.z0 - 0.3 && att.z < DOOR.z1 + 0.3 && att.x < -0.9;
    if (atDoor) near = { kind: 'door', label: '🚪 SORTIR DE L\'AVION' };
    /* Tout devant avec le chariot plein : le cockpit prime sur le siege de la rangee 1. */
    const frontTip = att.z >= maxZ - 0.05 && cabin.cartStock >= cabin.cartCapacity;
    if (frontTip && !near) near = { kind: 'cockpit', label: '✈️ ALLER AU COCKPIT' };
    for (const r of (near ? [] : cabin.requests)) {
      const rz = -(r.row - 1) * rowSpacing;
      const d = Math.abs(rz - att.z);
      if (d < nearestDist) {
        nearestDist = d;
        const stock = NEEDS_STOCK[r.type] && cabin.cartStock <= 0;
        near = {
          kind: 'request', id: r.id,
          label: stock ? `CHARIOT VIDE (${REQUEST_LABELS[r.type]})` : `SERVIR (${REQUEST_LABELS[r.type]})`
        };
      }
    }
    if (!near && cabin.unruly) {
      const rz = -(cabin.unruly.row - 1) * rowSpacing;
      if (Math.abs(rz - att.z) < 1.7) near = { kind: 'unruly', label: 'GÉRER L\'INCIDENT' };
    }
    /* Le galley occupe l'avant de la cabine (z = 0.2) et le chariot
       duty-free est juste derriere (z = 0.95). Le rail s'arrete a 0.9 :
       tout en haut du rail on est au galley, sinon au chariot. */
    if (!near && att.z >= maxZ - 0.05) {
      /* Tout devant : recharger le chariot s'il n'est pas plein, sinon aller au cockpit. */
      near = cabin.cartStock < cabin.cartCapacity
        ? { kind: 'galley', label: `RECHARGER LE CHARIOT (${cabin.cartStock}/${cabin.cartCapacity})` }
        : { kind: 'cockpit', label: '✈️ ALLER AU COCKPIT' };
    }
    if (!near && Math.abs(att.z - 0.9) < 1.7) {
      near = { kind: 'cart', label: 'VENDRE (DUTY-FREE)' };
    }
    this.nearInteraction = near;
    $('btnServe').classList.toggle('hidden', !near);
    if (near) $('btnServeLabel').textContent = near.label;

    /* Alerte turbulences */
    if (cabin.turbulence.active) {
      $('turbAlert').classList.remove('hidden');
      $('turbBar').style.width = (cabin.turbulence.timeLeft / cabin.turbulence.window * 100) + '%';
    } else {
      $('turbAlert').classList.add('hidden');
    }

    /* Panneau passager indiscipline (ouvert manuellement via GERER, pas automatique) */

    $('cabSat').textContent = cabin.satisfaction.toFixed(0);
    $('cabRevenue').textContent = cabin.dutyFreeRevenue.toLocaleString('fr-FR');
    $('cabSat').parentElement.classList.toggle('warn', cabin.satisfaction < 35);
    $('cabStock').textContent = cabin.cartStock;
    $('cabStock').parentElement.classList.toggle('warn', cabin.cartStock <= 2);
    const worst = cabin.worstRow();
    $('cabWorst').textContent = `R${worst.row} (${worst.value.toFixed(0)}%)`;
    $('cabWorst').parentElement.classList.toggle('warn', worst.value < 45);
    $('cabBelt').textContent = cabin.seatbeltSign ? 'ON' : 'OFF';
    $('cabBelt').className = cabin.seatbeltSign ? 'text-emerald-300 font-semibold' : 'text-slate-300 font-semibold';
    $('btnSeatbelt').classList.toggle('bg-emerald-600/80', cabin.seatbeltSign);
  },
  handleServeClick() {
    const near = this.nearInteraction;
    if (!near) return;
    if (near.kind === 'request') {
      const req = this.cabin.requests.find(r => r.id === near.id);
      /* Question d'un passager : une petite devinette avant de le servir. */
      if (req && req.type === 'quiz' && this.arcade.on) { this.openQuiz(req); return; }
      const res = this.cabin.serve(near.id);
      if (!res) return;
      if (res.reason === 'stock') {
        this.toast('Chariot vide — rechargez-le au galley.', 2000, 'warn');
      } else if (res.reason === 'seatbelt') {
        this.toast('Consigne ceintures active : le passager n\'a pas apprécié.', 2200, 'warn');
      } else {
        if (this.arcade.on) {
          this.arcade.cabinServed(req);
        } else this.toast(`Passager servi (+${res.gain.toFixed(1)}% satisfaction)`, 1800);
      }
    } else if (near.kind === 'cart') {
      const amount = this.cabin.sellDutyFree();
      if (!this.arcade.on) { this.tycoon.cash += amount; this.tycoon.save(); }
      if (this.arcade.on) this.arcade.giveCoins(3, { label: 'Vente !' });
      else this.toast(`Vente duty-free : +${amount} EUR`, 1800);
    } else if (near.kind === 'galley') {
      const added = this.cabin.restockCart();
      this.toast(added > 0 ? `Chariot rechargé (+${added} unités).` : 'Le chariot est déjà plein.', 1800);
    } else if (near.kind === 'unruly') {
      $('unrulyPanel').classList.remove('hidden');
    } else if (near.kind === 'door') {
      this.exitCabinByDoor();
    } else if (near.kind === 'cockpit') {
      this.boardAircraft();
    }
  },
};
