/* ============================================================
   pauseMenu.js — Menu pause, reglages, panneaux (carte, album, quiz, tour)
   (decoupe de main.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import * as THREE from 'three';
import * as Save from './save.js?v=1791559596';
import { CabinService } from './cabinService.js?v=1791559596';
import { MechanicSystem, PARTS } from './mechanicSystem.js?v=1791559596';
import { AirportTycoon, UPGRADES } from './airportTycoon.js?v=1791559596';
import { TerminalSystem } from './terminalSystem.js?v=1791559596';
import { MissionSystem } from './missions.js?v=1791559596';
import { Staff } from './staff.js?v=1791559596';
import { History } from './history.js?v=1791559596';
import { Arcade, BADGES, FUN_FACTS, QUIZ } from './arcade.js?v=1791559596';
import { sfx } from './sfx.js?v=1791559596';
import { $, clamp, IS_TOUCH } from './gameShared.js?v=1791559596';

export const pauseMethods = {
  /* ========================================================== */
  setupUI() {
    $('btnStart').addEventListener('click', () => this.start());
    $('btnHangar').addEventListener('click', () => {
      if (this.state !== 'BOOT') return;
      sfx.click();
      this.start();
      this.hangar.applyAll();
      this.hangar.open();
    });
    $('pauseHangar').addEventListener('click', () => {
      if (this.state !== 'HUB') { this.toast('Retourne d\'abord a l\'aeroport pour ouvrir ton hangar.', 2800, 'warn'); return; }
      this.hangar.open();
    });
    $('kidRepHangar').addEventListener('click', () => {
      sfx.click();
      this.returnHome();
      this.hangar.open();
    });

    /* ---- Menu pause (plus de menu de choix de role : on s'en approche) ---- */
    $('btnMenu').addEventListener('click', () => this.openPause());
    $('btnMenu2').addEventListener('click', () => this.openPause());
    $('btnMenu3').addEventListener('click', () => this.openPause());

    /* Onglets du tableau de gestion : trois vues au lieu d'un long defilement. */
    document.querySelectorAll('.tycoon-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const key = tab.dataset.tytab;
        document.querySelectorAll('.tycoon-tab').forEach(t => t.classList.toggle('on', t === tab));
        document.querySelectorAll('.tycoon-pane').forEach(p =>
          p.classList.toggle('hidden', p.dataset.typane !== key));
      });
    });
    $('pauseResume').addEventListener('click', () => this.closePause());
    $('pauseExit').addEventListener('click', () => {
          this.closePause();
      if (this.arcade.on && this.state === 'PILOT') {
        this.returnHome();
      } else if (this.state === 'PILOT') {
        if (this.ac.onGround) this.exitToHub();
        else this.toast('Il faut etre au sol pour sortir de l\'avion.', 2600, 'warn');
      } else if (this.state === 'CABIN') {
        this.exitToHub();
      }
    });
    $('pauseResetRunway').addEventListener('click', () => {
          this.closePause();
          if (this.controlled) this.releaseControl();
          if (this.state === 'CABIN') this.r3d.exitCabinMode();
      if (this.state === 'HUB') this.r3d.exitHubMode();
      $('hudHub').classList.add('hidden');
      $('hudCabin').classList.add('hidden');
      $('hudPilot').classList.remove('hidden');
      this.state = 'PILOT';
      this.resetFlight();
    });

    /* Reglage de l'heure (phase 7) : sert a tester un poser de nuit
       sans attendre le cycle complet. */
    $('pauseHourBack').addEventListener('click', () => {
      this.env.advanceHour(-1);
      this.updateEnvChip();
      this.toast(`Heure de jeu : ${this.env.timeLabel()}`, 1800);
    });
    $('pauseHourFwd').addEventListener('click', () => {
      this.env.advanceHour(1);
      this.updateEnvChip();
      this.toast(`Heure de jeu : ${this.env.timeLabel()}`, 1800);
    });
    $('pauseWeather').addEventListener('click', () => {
      this.env.forceWeather();
      this.updateEnvChip();
      this.toast(`Meteo : ${this.env.weatherLabel()}`, 1800);
    });

        /* PHASE 12 — remise a zero complete de la progression. */
        $('pauseResetProgress').addEventListener('click', () => {
          if (!window.confirm('Effacer toute la progression (tresorerie, flotte, usure, contrats, statistiques) ?')) return;
          /* Arcade : un enfant peut appuyer par erreur, on redemande une fois. */
          if (this.arcade.on && !window.confirm('Vraiment TOUT effacer ? Tes pieces, tes avions, tes etoiles et tes trophees disparaitront.')) return;
          AirportTycoon.reset();
          MechanicSystem.reset();
          CabinService.reset();
          TerminalSystem.reset();
          MissionSystem.reset();
          Arcade.reset();
          Staff.reset();
          History.reset();
          /* Toutes les autres sauvegardes du jeu (hangar, etoiles et iles, missions du ciel,
             mini-jeux, ma place, montures...) : sans elles la remise a zero n'etait que
             partielle. Seuls les reglages (confort, son) sont conserves. */
          Save.resetAll({ keep: ['comfort', 'sfx'] });
          window.location.reload();
        });

    $('repClose').addEventListener('click', () => $('report').classList.add('hidden'));
    $('repExitHub').addEventListener('click', () => {
      $('report').classList.add('hidden');
      this.exitToHub();
    });
    $('repGoTycoon').addEventListener('click', () => {
      $('report').classList.add('hidden');
      this.openTycoonPanel();
    });

    /* ---- Hub (monde libre) : postes de maintenance + acces pilote/cabine/gestion ---- */
    $('btnInspect').addEventListener('click', () => this.handleHubInteract());
    $('stationClose').addEventListener('click', () => {
          $('stationPanel').classList.add('hidden');
          this._worldPaused = false;
        });
        $('btnLogbook').addEventListener('click', () => {
          /* Le carnet est un panneau de lecture : on gele le monde le temps
             de le consulter, sinon la satisfaction cabine s'effondre pendant
             qu'on lit. */
          this._worldPaused = true;
          const ok = this.mechanic.signLogbook();
          if (ok) {
            $('hubHint').textContent = 'Carnet signe — appareil conforme, pret pour le prochain vol.';
            this.toast('Carnet de route signe. Conformite validee.', 3000, 'ok');
          } else {
            const worst = Object.values(this.mechanic.components).sort((a, b) => b.wear - a.wear)[0];
            this.toast(`Non conforme : ${worst.label} a ${worst.wear.toFixed(0)}% d'usure — reparez avant de signer.`, 4200, 'err');
          }
          this._worldPaused = false;
        });

    $('btnFlapsDn').addEventListener('click', () => {
      this.ac.setFlaps(this.ac.flapIndex + 1);
      this.flash(`Volets ${this.ac.flaps.name}`);
    });
    $('btnFlapsUp').addEventListener('click', () => {
      this.ac.setFlaps(this.ac.flapIndex - 1);
      this.flash(`Volets ${this.ac.flaps.name}`);
    });
    $('btnGear').addEventListener('click', () => {
      if (!this.ac.toggleGear()) this.flash('Trop rapide pour manoeuvrer le train (Vlo 270 kt)');
      else this.flash(this.ac.gearDown ? 'Train sorti' : 'Train rentre');
    });
    $('btnSpoiler').addEventListener('click', () => {
      this.ac.spoilers = !this.ac.spoilers;
      $('btnSpoiler').classList.toggle('on', this.ac.spoilers);
    });
    $('btnRev').addEventListener('click', () => {
      this.ac.reverse = !this.ac.reverse;
      $('btnRev').classList.toggle('on', this.ac.reverse);
    });
    $('btnView').addEventListener('click', () => {
      const m = this.r3d.nextCamera();
      this.flash({ chase: 'Vue poursuite', cockpit: 'Vue cockpit — glisse pour regarder autour', orbit: 'Vue exterieure', tower: 'Vue tour de controle', cinema: '🎬 Camera cinema' }[m]);
      this.updatePilotViewUI();
    });

    /* Regard libre en vue cockpit : on glisse sur la scene 3D (les zones
       tactiles du joystick et des gaz gardent leurs propres evenements). */
    {
      const cv = this.r3d.renderer.domElement;
      const look = this.r3d.look;
      let lookId = null, lx = 0, ly = 0;
      cv.style.touchAction = 'none';
      cv.addEventListener('pointerdown', e => {
        if (this.state !== 'PILOT' || this.r3d.cameraMode !== 'cockpit' || lookId !== null) return;
        lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
        look.hold = true;
        cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointermove', e => {
        if (e.pointerId !== lookId) return;
        look.yaw = Math.max(-2.0, Math.min(2.0, look.yaw + (e.clientX - lx) * 0.006));
        look.pitch = Math.max(-0.9, Math.min(0.7, look.pitch + (e.clientY - ly) * 0.006));
        lx = e.clientX; ly = e.clientY;
      });
      const end = e => { if (e.pointerId === lookId) { lookId = null; look.hold = false; } };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
    }

    /* ---- Cabine (iteration 3) : le deplacement passe par le joystick
       de marche (this.cabCtl), comme sur le tarmac et au terminal. ---- */
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape') this.closeTopPanel();
    });

    $('btnServe').addEventListener('click', () => this.handleServeClick());
    $('btnCounter').addEventListener('click', () => this.handleCounterInteract());
    $('btnSeatbelt').addEventListener('click', () => {
      const on = this.cabin.toggleSeatbeltSign();
      this.toast(on
        ? 'Consigne ceintures activee — les volets se ferment, mais ne servez personne debout.'
        : 'Consigne ceintures levee — le service peut reprendre.', 2400);
    });
    $('btnAnnounce').addEventListener('click', () => {
      this.cabin.resolveTurbulence(true);
      if (this.arcade.on) { this.arcade.giveCoins(4, { label: 'Annonce a temps !' }); sfx.hello(); }
      $('turbAlert').classList.add('hidden');
      this.toast('Annonce faite a temps — cabine securisee (+ satisfaction).', 3000, 'ok');
    });
    $('btnCalm').addEventListener('click', () => {
      this.cabin.resolveUnruly('calm');
      $('unrulyPanel').classList.add('hidden');
      this.toast('Situation apaisee.', 3000, 'ok');
    });
    $('btnCaptain').addEventListener('click', () => {
      this.cabin.resolveUnruly('captain');
      $('unrulyPanel').classList.add('hidden');
      this.toast('Le commandant a ete informe — incident clos.', 3000, 'ok');
    });

    /* ---- Aeroport / tycoon (iteration 4) ---- */
    $('tycoonClose').addEventListener('click', () => {
      $('tycoonPanel').classList.add('hidden');
      this._worldPaused = false;
    });
    $('tyPriceUp').addEventListener('click', () => { this.tycoon.setTicketPrice(10); this.refreshTycoonPanel(); });
    $('tyPriceDown').addEventListener('click', () => { this.tycoon.setTicketPrice(-10); this.refreshTycoonPanel(); });
    $('tyBuyAircraft').addEventListener('click', () => {
      if (this.tycoon.buyAircraft()) {
        this.toast(`Nouvel appareil livre — flotte de ${this.tycoon.fleet.length} avions.`, 3000, 'ok');
      } else {
        this.toast(this.tycoon.fleet.length >= this.tycoon.infrastructure.gates
          ? 'Portes insuffisantes — construisez-en une nouvelle avant d\'agrandir la flotte.'
          : 'Tresorerie insuffisante pour cet achat.', 3600);
      }
      this.refreshTycoonPanel();
    });

          /* ---- PHASE 12 : carburant et contrat ---- */
          $('tyFuelHalf').addEventListener('click', () => {
            const target = Math.min(this.ac.fuelCap, this.ac.fuel + 3000);
            const r = this.tycoon.refuel(this.ac, target);
            this.toast(r
              ? `Appoint de ${Math.round(r.kg).toLocaleString('fr-FR')} kg — ${Math.round(r.cost).toLocaleString('fr-FR')} EUR.`
              : 'Reservoir deja plein ou tresorerie insuffisante.', 3200);
            this.refreshTycoonPanel();
          });
          $('tyFuelFull').addEventListener('click', () => {
            const r = this.tycoon.refuel(this.ac);
            this.toast(r
              ? `Plein complet : ${Math.round(r.kg).toLocaleString('fr-FR')} kg — ${Math.round(r.cost).toLocaleString('fr-FR')} EUR.`
              : 'Reservoir deja plein ou tresorerie insuffisante.', 3200);
            this.refreshTycoonPanel();
          });
          $('tyMissionReroll').addEventListener('click', () => {
            const m = this.missions.reroll(this.missionContext());
            this.toast(`Nouveau contrat : ${m.label} — ${m.brief}`, 4200);
            this.refreshTycoonPanel();
          });

    /* Plein ecran au premier contact, uniquement sur appareil tactile
       (mobile/tablette : Android bascule directement, iOS passe par
       "Sur l'ecran d'accueil"). Sur PC, on laisse le joueur dans la
       fenetre du navigateur — un plein ecran impose au premier clic
       serait intrusif et surprendrait un test a la souris. */
    if (IS_TOUCH) {
      document.addEventListener('pointerdown', () => {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      }, { once: true });
    }
  },
  setupArcadeUI() {
    /* Choix du mode sur l'ecran de demarrage. */
    const pick = (mode) => {
      this.arcade.setMode(mode);
      this.applyArcadeFlags();
      $('modeArcade').classList.toggle('on', mode === 'arcade');
      $('modePro').classList.toggle('on', mode === 'pro');
      this.refreshPauseLabels();
      /* Conseils de l'ecran de demarrage selon le mode. */
      $('bootTip').innerHTML = mode === 'arcade'
        ? 'Jeu facile : suis la <b>fleche jaune</b> et le <b>faisceau de lumiere</b> pour trouver quoi faire. ' +
          (IS_TOUCH ? 'Deplacement : joystick (pousse a fond pour courir). ' : 'Deplacement : fleches ou ZQSD (tiens la fleche pour courir). ') +
          'En vol : gauche/droite = virer, haut/bas = monter/descendre.'
        : 'Simulation complete : volets, train, gaz, maintenance et gestion detaillee. ' +
          (IS_TOUCH ? 'Aux commandes : manche et manette des gaz a l\'ecran.'
            : 'Deplacement : fleches ou ZQSD. Aux commandes : cliquez-glissez le manche et la manette des gaz, ou fleches (tangage/roulis) · Q/D (palonnier) · W/S (gaz) · Espace (freins).');
    };
    $('modeArcade').addEventListener('click', () => { sfx.click(); pick('arcade'); });
    $('modePro').addEventListener('click', () => { sfx.click(); pick('pro'); });
    pick('arcade');   // le mode Pilote n'est plus propose : on joue toujours en Arcade

    /* Menu pause : changer de mode (recharge la page, la progression reste) et son. */
    const toggleMode = () => {
      this.arcade.setMode(this.arcade.on ? 'pro' : 'arcade');
      window.location.reload();
    };
    const toggleSound = () => {
      sfx.setMuted(!sfx.muted);
      this.refreshPauseLabels();
      sfx.click();
    };
    $('pauseMode').addEventListener('click', toggleMode);
    $('pauseModePro').addEventListener('click', toggleMode);
    $('pauseSound').addEventListener('click', toggleSound);
    $('pauseSoundPro').addEventListener('click', toggleSound);

    /* Menu pause (Arcade) : trophees, grande carte, ciel. */
    $('pauseAlbum').addEventListener('click', () => { sfx.click(); this.openAlbum(); });
    $('kidAlbumClose').addEventListener('click', () => this.closeAlbum());
    $('btnHub').addEventListener('click', () => this.hub.toggle());
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyH' || !this.arcade.on || this.state === 'BOOT') return;
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      this.hub.toggle();
    });
    /* E07 : onglet cache ou iPad en veille -> pause douce ; au retour, pas de saut de temps. */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        sfx.suspend();
        const busy = this.state === 'BOOT' || !$('pauseMenu').classList.contains('hidden') || !$('mg2').classList.contains('hidden');
        if (!busy) { try { this.openPause(); } catch (e) { this._noteError('pause auto', e); } }
      } else {
        this.lastFrame = performance.now();
      }
    });
    /* H08 : dormir jusqu'au matin (fondu, l'heure de jeu saute a 7 h). Jamais en plein vol. */
    $('pauseSleep').addEventListener('click', () => {
      if (this.state === 'PILOT' && !this.ac.onGround) { this.toast('😴 On ne dort pas en vol ! Atterris d\'abord.', 2600, 'warn'); return; }
      sfx.click(); this.closePause();
      const veil = $('veil');
      veil.classList.add('on');
      this.toast('😴 Bonne nuit… zzz', 1800);
      setTimeout(() => {
        try { this.env.setHour(7); this.updateEnvChip(); this.fun.say('Bonjour ! Il est 7 heures, une belle journee commence !', 2, 4200); } catch (e) { this._noteError('dormir', e); }
        setTimeout(() => veil.classList.remove('on'), 500);
      }, 1700);
    });
    $('pauseLost').addEventListener('click', () => { sfx.click(); this.closePause(); this.goHomeSafe(); });
    $('pauseHelp').addEventListener('click', () => { sfx.click(); $('helpPanel').classList.remove('hidden'); });
    $('helpClose').addEventListener('click', () => $('helpPanel').classList.add('hidden'));
    this.renderHelpCards();
    $('pauseTuto').addEventListener('click', () => {
      if (!window.confirm('Refaire le tutoriel depuis le debut ? (tes pieces et trophees restent)')) return;
      this.arcade.restartTutorial();
      this.closePause();
      this.toast('🎓 Tutoriel relance : suis la fleche jaune !', 3000, 'ok');
    });
    $('pauseMap').addEventListener('click', () => { sfx.click(); this.closePause(); this.openMapBig(); });
    document.querySelectorAll('[data-sky]').forEach(b => b.addEventListener('click', () => {
      this.env.setHour(parseFloat(b.dataset.sky));
      this.updateEnvChip();
      sfx.pop();
      $('pauseEnvInfoKid').textContent = `${this.env.timeLabel()} · ${this.env.weatherLabel()}`;
    }));
    $('pauseWeatherKid').addEventListener('click', () => {
      this.env.forceWeather();
      this.updateEnvChip();
      sfx.pop();
      $('pauseEnvInfoKid').textContent = `${this.env.timeLabel()} · ${this.env.weatherLabel()}`;
    });

    /* Mini-carte : un tap ouvre la grande carte. */
    $('miniMap').addEventListener('click', () => { sfx.click(); this.openMapBig(); });
    $('mapBigClose').addEventListener('click', () => this.closeMapBig());

    /* Petits gestes rigolos. */
    $('funToggle').addEventListener('click', () => {
      const row = $('funRow');
      row.classList.toggle('hidden');
      $('funToggle').classList.toggle('open', !row.classList.contains('hidden'));
      sfx.pop();
    });
    document.querySelectorAll('[data-emote]').forEach(b =>
      b.addEventListener('click', () => this.arcade.emote(b.dataset.emote)));

    /* Vol : DECOLLER et aide a l'atterrissage. */
    const launch = () => this.launchNow();
    $('launchBtn').addEventListener('click', launch);
    $('helpLandBtn').addEventListener('click', () => this.helpLanding());
    window.addEventListener('keydown', (e) => {
      if (!this.arcade.on) return;
      if (e.code === 'Enter') launch();
    });

    /* Verification au comptoir (phase 25). */
    $('chkClose').addEventListener('click', () => this.closeCheckPanel());
    window.addEventListener('keydown', (e) => {
      if ($('checkPanel').classList.contains('hidden') || !this._chkChoices) return;
      const i = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code) % 3;
      if (i >= 0 && this._chkChoices[i]) this.decideCheck(this._chkChoices[i]);
    });

    /* Rapport de vol (Arcade). */
    $('kidRepHome').addEventListener('click', () => { sfx.click(); this.returnHome(); });
    $('kidRepAgain').addEventListener('click', () => {
      sfx.click();
      $('kidReport').classList.add('hidden');
      this.startArcadeFlight();
    });
  },
  /* F05 : aide en cartes illustrees (icone + une phrase + « Montre-moi »). */
  renderHelpCards() {
    const A = this.arcade;
    const cards = [
      { ico: '🔧', text: 'Repare l\'avion : va sur un point colore.', go: () => A.showMe({ icon: '🔧', text: 'Voila le poste a reparer !', target: A.stationTarget() }) },
      { ico: '🏢', text: 'Accueille les passagers au terminal.', go: () => A.showMe({ icon: '🏢', text: 'Voila le terminal !', target: A.markerPos('terminal') }) },
      { ico: '🗼', text: 'La tour : cadeau du jour et boutique.', go: () => A.showMe({ icon: '🗼', text: 'Voila la tour de controle !', target: A.markerPos('tower') }) },
      { ico: '✈️', text: 'Monte dans l\'avion et vole !', go: () => A.showMe({ icon: '✈️', text: 'Voila l\'avion !', target: A.markerPos('cockpit') }) },
      { ico: '🛹', text: 'Roule en skate, BMX, rollers…', go: () => this._pulse('rideBtn') },
      { ico: '🎾', text: 'Joue a la balle avec ton chien.', go: () => this._pulse('petBall') },
      { ico: '🗺️', text: 'Ouvre la grande carte du monde.', go: () => this.openMapBig() },
      { ico: '🎁', text: 'Ton cadeau du jour t\'attend a la tour.', go: () => A.showMe({ icon: '🎁', text: 'Ton cadeau est dans la tour !', target: A.markerPos('tower') }) }
    ];
    const host = $('helpCards');
    if (!host) return;
    host.innerHTML = cards.map((c, i) => `<div class="help-card"><span class="hc-ico">${c.ico}</span><p>${c.text}</p><button data-hc="${i}">Montre-moi 👉</button></div>`).join('');
    host.querySelectorAll('[data-hc]').forEach(b => b.addEventListener('click', () => {
      sfx.click();
      $('helpPanel').classList.add('hidden');
      this.closePause();
      if (this.state !== 'HUB' && cards[+b.dataset.hc].ico !== '🗺️') { this.toast('👉 Reviens a pied pour que je te montre !', 2600); return; }
      cards[+b.dataset.hc].go();
    }));
  },

  /* Fait pulser un bouton du HUD pour dire « c'est ici ». */
  _pulse(id) {
    const el = $(id);
    if (!el) return;
    el.classList.remove('pulse-help'); void el.offsetWidth; el.classList.add('pulse-help');
    setTimeout(() => el.classList.remove('pulse-help'), 4600);
    this.toast('👉 Le bouton qui brille est celui-la !', 2800);
  },

  openPause() {
      this._worldPaused = true;
      $('pauseExit').classList.toggle('hidden', this.state === 'HUB');
      $('pauseExit').textContent = this.arcade.on && this.state === 'PILOT' ? '🏠 Retour a l\'aeroport' : 'Sortir vers le tarmac';
      $('pauseState').textContent = {
        PILOT: 'Aux commandes', HUB: 'Tarmac', CABIN: 'Cabine', TERMINAL: 'Terminal'
      }[this.state] || this.state;
      $('pauseEnvInfo').textContent = `${this.env.timeLabel()} · ${this.env.weatherLabel()}`;
      $('pauseEnvInfoKid').textContent = `${this.env.timeLabel()} · ${this.env.weatherLabel()}`;
      $('pauseFact').textContent = FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
      $('pauseAlbumN').textContent = `${this.arcade.badgeCount()} / ${BADGES.length}`;
      $('pauseMap').classList.toggle('hidden', this.state !== 'HUB');
      const th = this.arcade.treasureHeat();
      $('pauseMapN').textContent = th ? `pieces : ${th.found}/${th.total}` : 'pieces cachees';
      this.refreshPauseLabels();
      this.fun.refreshPause();
      this.pet.refreshPause();
      $('pauseMenu').classList.remove('hidden');
  },
    closePause() {
      $('pauseMenu').classList.add('hidden');
      this._worldPaused = false;
    },
    /* Echap ferme le panneau ouvert le plus prioritaire. Les panneaux
       bloquants (rapport, incident, mini-jeu) ne se ferment pas ainsi :
       ils attendent une decision du joueur. */
    closeTopPanel() {
      if (!$('photoPanel').classList.contains('hidden')) { $('photoPanel').classList.add('hidden'); return true; }
      if (!$('photoAlbum').classList.contains('hidden')) { $('photoAlbum').classList.add('hidden'); return true; }
      if (!$('albumPanel').classList.contains('hidden')) { $('albumPanel').classList.add('hidden'); return true; }
      if (!$('settingsPanel').classList.contains('hidden')) { $('settingsPanel').classList.add('hidden'); return true; }
      if (this.look && this.look.isOpen) { this.look.close(); return true; }
      if (!$('mg2').classList.contains('hidden')) { this.minigames.close(); return true; }
      if (this.hangar.active) { this.hangar.close(false); return true; }
      if (this.deco.active) { this.deco.close(); return true; }
      if (!$('checkPanel').classList.contains('hidden')) { this.closeCheckPanel(); return true; }
      if (!$('helpPanel').classList.contains('hidden')) { $('helpPanel').classList.add('hidden'); return true; }
      if (this.rides.pickerOpen) { this.rides.closePicker(); return true; }
      if (this.hub && this.hub.isOpen) { this.hub.close(); return true; }
      if (!$('mapBig').classList.contains('hidden')) { this.closeMapBig(); return true; }
      if (!$('kidAlbum').classList.contains('hidden')) { this.closeAlbum(); return true; }
      if (!$('pauseMenu').classList.contains('hidden')) { this.closePause(); return true; }
      if (!$('tycoonPanel').classList.contains('hidden')) {
        $('tycoonPanel').classList.add('hidden');
        this._worldPaused = false;
        return true;
      }
      if (!$('stationPanel').classList.contains('hidden')) {
        $('stationPanel').classList.add('hidden');
        this._worldPaused = false;      // le panneau gele le monde : Echap doit le rendre (comme le bouton Fermer)
        return true;
      }
      return false;
    },
  /* ---------------- Tour de controle (Arcade) ---------------- */
  openMapBig() {
    this.arcade.openBigMap();
    this._worldPaused = true;
  },
  closeMapBig() {
    this.arcade.closeBigMap();
    this._worldPaused = false;
  },
  openAlbum() {
    this.renderAlbum($('kidAlbumBody'));
    $('kidAlbumSub').textContent = `${this.arcade.badgeCount()} trophee${this.arcade.badgeCount() > 1 ? 's' : ''} sur ${BADGES.length}`;
    $('kidAlbum').classList.remove('hidden');
  },
  closeAlbum() { $('kidAlbum').classList.add('hidden'); },
  /* Grille de trophees : ceux qu'on n'a pas encore sont grises, avec leur defi. */
  renderAlbum(host) {
    const got = this.arcade.data.badges;
    host.innerHTML = BADGES.map(b => {
      const on = !!got[b.id];
      return `<div class="badge${on ? ' on' : ''}"><span class="b-ico">${on ? b.ico : '❓'}</span><b>${on ? b.name : '???'}</b><small>${b.desc}</small></div>`;
    }).join('');
  },
  /* F04 « Je suis perdu » : retour a l'aeroport en un bouton, avec un fondu. */
  goHomeSafe() {
    const veil = $('veil');
    veil.classList.add('on');
    setTimeout(() => {
      try {
        for (const v of this.vehicles || []) if (v.active) v.exit();
        if (this.rides.active) this.rides.dismount(true);
        if (this.state === 'PILOT') {
          if (this.ac.onGround) this.returnHome();
          else this.helpLanding();
        } else if (this.state === 'CABIN') {
          this.exitCabinByDoor();
        } else {
          const gate = this.r3d.gatePosition;
          this.goToHub({ pos: new THREE.Vector3(gate.x - 16, 0, gate.z - 22), heading: -Math.PI / 2 });
          this.toast('🧭 Tu es de retour pres de ton avion !', 2400, 'ok');
        }
      } catch (e) { this._noteError('retour maison', e); }
      setTimeout(() => veil.classList.remove('on'), 150);
    }, 380);
  },
  /* Pieces detachees : en Arcade, le stock se reconstitue tout seul. */
  topUpParts() {
    for (const p of Object.keys(PARTS)) {
      if ((this.mechanic.parts[p] || 0) < 3) this.mechanic.parts[p] = 3;
    }
  },
  /* Devinette d'un passager (Arcade) : 3 reponses, la bonne rapporte des pieces. */
  openQuiz(req) {
    const pool = QUIZ.filter((_, i) => !(this._quizSeen || []).includes(i));
    const list = pool.length ? pool : QUIZ;
    const item = list[Math.floor(Math.random() * list.length)];
    this._quizSeen = (this._quizSeen || []).concat(QUIZ.indexOf(item)).slice(-Math.min(10, QUIZ.length - 3));
    const answers = item.a.map((t, i) => ({ t, ok: i === 0 })).sort(() => Math.random() - 0.5);
    $('quizQ').textContent = item.q;
    $('quizRes').textContent = '';
    $('quizA').innerHTML = answers.map((a, i) => `<button class="panel-btn quiz-a" data-i="${i}">${a.t}</button>`).join('');
    $('quizPanel').classList.remove('hidden');
    this._worldPaused = true;
    let done = false;
    $('quizA').querySelectorAll('.quiz-a').forEach(b => b.addEventListener('click', () => {
      if (done) return;
      done = true;
      const a = answers[+b.dataset.i];
      const good = answers.find(x => x.ok).t;
      b.classList.add(a.ok ? 'good' : 'bad');
      $('quizA').querySelectorAll('.quiz-a').forEach(x => { if (answers[+x.dataset.i].ok) x.classList.add('good'); });
      if (a.ok) {
        sfx.star(2); this.arcade.confetti(30);
        this.arcade.data.stats.quiz = (this.arcade.data.stats.quiz || 0) + 1;
        this.arcade.giveCoins(5, { silent: true, label: 'Bonne reponse !' });
        $('quizRes').textContent = '🎉 Bravo, bonne reponse !';
      } else {
        sfx.oops();
        this.arcade.giveCoins(1, { silent: true });
        $('quizRes').textContent = `Presque ! La reponse : ${good}`;
      }
      setTimeout(() => {
        $('quizPanel').classList.add('hidden');
        this._worldPaused = false;
        const res = this.cabin.serve(req.id);
        if (res && res.reason === 'ok') this.arcade.cabinServed(req);
      }, a.ok ? 1100 : 1900);
    }));
  },
  /* ========================================================== */
  /* ITERATION 4 — Gestion de l'aeroport (tycoon)                 */
  /* ========================================================== */
  openTycoonPanel() {
    if (this.arcade.on) { this.hub.open(); return; }
    this.refreshTycoonPanel();
    $('tycoonPanel').classList.remove('hidden');
      this._worldPaused = true;
    },
  refreshTycoonPanel() {
    const ty = this.tycoon;

    const cashEl = $('tyCash');
    cashEl.textContent = Math.round(ty.cash).toLocaleString('fr-FR') + ' EUR';
    cashEl.className = ty.cash < 0 ? 'tycoon-stat-val text-red-400' : 'tycoon-stat-val';
    $('tyRep').textContent = ty.reputation.toFixed(0) + '%';
    $('tyFlights').textContent = ty.flightsCompleted;

    $('tyPrice').textContent = ty.ticketPrice + ' EUR';
    /* Arcade : on affiche ce qui monte VRAIMENT au prochain vol (meme formule que le credit). */
    const realPax = ty.arcade ? ty._flightPax(ty.paxPerFlight, this.terminal.boardedSinceFlight) : ty.paxPerFlight;
    $('tyPax').textContent = ty.arcade
      ? `${ty.paxPerFlight} veulent partir · ${realPax} montent`
      : `≈ ${ty.paxPerFlight} passagers / vol`;
    /* Jauge de demande : repere visuel du volume de passagers attire par
       le prix et la reputation actuels, sur une echelle nominale large. */
    const paxPct = clamp((ty.arcade ? realPax : ty.paxPerFlight) / 300, 0, 1);
    $('tyPaxFill').style.width = `${Math.round(paxPct * 100)}%`;
    $('tyPaxFill').className = 'h-full ' + (paxPct >= 0.55 ? 'bg-emerald-500' : paxPct >= 0.3 ? 'bg-amber-500' : 'bg-red-500');

        /* ---- PHASE 12 : niveau de compagnie ---- */
        const lvl = ty.companyLevel;
        const nx = ty.nextLevel();
        const prevNeed = (lvl - 1) * 60;
        const pct = clamp((ty.companyScore - prevNeed) / Math.max(1, nx.need - prevNeed), 0, 1);
        $('tyLevel').textContent = lvl;
        $('tyLevelFill').style.width = `${Math.round(pct * 100)}%`;
        $('tyLevelText').textContent =
          `Score ${ty.companyScore.toFixed(0)} / ${nx.need} — niveau ${nx.level} a ${(nx.need - ty.companyScore).toFixed(0)} points.`;

        /* ---- PHASE 12 : contrat en cours ---- */
        const m = this.missions.active;
        const ctx = this.missionContext();
        this.missions.evaluate(ctx);
        $('tyMission').innerHTML =
          `<div class="font-semibold text-indigo-300">${m.label}</div>` +
          `<div class="text-xs text-slate-400 mt-0.5">${m.brief}</div>` +
          `<div class="text-xs mt-1">Prime ${m.reward.toLocaleString('fr-FR')} EUR · +${m.rep} reputation</div>` +
          m.crit.map(c => {
            const p = MissionSystem.critProgress(c, ctx);
            return `<div class="flex justify-between gap-3 text-xs mt-1"><span class="${p >= 1 ? 'text-emerald-400' : 'text-slate-400'}">${p >= 1 ? '&#10003;' : '&#9675;'} ${c.label}</span><span>${Math.round(p * 100)}%</span></div>`;
          }).join('');
        $('tyMissionStats').textContent =
          `${this.missions.completed} contrat(s) rempli(s) · ${this.missions.failed} manque(s) · ${Math.round(this.missions.earned).toLocaleString('fr-FR')} EUR de primes.`;

        /* ---- PHASE 12 : carburant ---- */
        const ac = this.ac;
        const missing = Math.max(0, ac.fuelCap - ac.fuel);
        $('tyFuelInfo').innerHTML =
          `Reservoir : <span class="font-semibold">${(ac.fuel / 1000).toFixed(1)} t</span> / ${(ac.fuelCap / 1000).toFixed(0)} t ` +
          `(${Math.round(ac.fuel / ac.fuelCap * 100)} %)<br>` +
          `Prix : ${ty.fuelPrice.toFixed(2)} EUR/kg — plein manquant : ` +
          `<span class="font-semibold">${Math.round(ty.fuelCost(missing)).toLocaleString('fr-FR')} EUR</span>`;
        $('tyFuelHalf').disabled = missing < 100;
        $('tyFuelFull').disabled = missing < 100;

        /* ---- Apercu du prochain vol : rend l'economie lisible avant de voler ---- */
        const est = ty.estimateFlight(ac, this.terminal.boardedSinceFlight);
        const estRows = [
          ['Passagers estimes', est.cappedByTerminal
            ? `${est.pax} <span class="text-amber-400">(limite par le terminal, demande ${est.demand})</span>`
            : `${est.pax}`],
          ['Recette billets', `${Math.round(est.ticketRevenue).toLocaleString('fr-FR')} EUR`],
          ['Bonus boutiques/terminal', `x${est.shopBonus.toFixed(2)}`]
        ];
        if (est.passiveFleet > 0) estRows.push(['Revenu flotte passive', `+${Math.round(est.passiveFleet).toLocaleString('fr-FR')} EUR`]);
        estRows.push(['Couts (carburant, redevances)', `-${Math.round(est.costs).toLocaleString('fr-FR')} EUR`]);
        $('tyEstimate').innerHTML =
          estRows.map(([k, v]) => `<div class="estimate-row"><span class="text-slate-400">${k}</span><span>${v}</span></div>`).join('') +
          `<div class="estimate-row total"><span>Profit net estime</span><span class="${est.profit >= 0 ? 'pos' : 'neg'}">${est.profit >= 0 ? '+' : ''}${Math.round(est.profit).toLocaleString('fr-FR')} EUR</span></div>`;

    $('tyUpgrades').innerHTML = Object.keys(UPGRADES).map(key => {
      const u = UPGRADES[key];
      const cost = ty.upgradeCost(key);
      const level = u.once ? (ty.infrastructure[key] ? 'Acquis' : 'Non acquis') : `Niveau ${ty.infrastructure[key]}${u.max ? ' / ' + u.max : ''}`;
      const maxed = cost == null;
      const afford = !maxed && ty.cash >= cost;
      const btnLabel = maxed ? (u.once ? 'Acquis' : 'Max') : `${cost.toLocaleString('fr-FR')} EUR`;
      const missingTxt = (!maxed && !afford) ? `<div class="upgrade-missing">Il manque ${Math.round(cost - ty.cash).toLocaleString('fr-FR')} EUR</div>` : '';
      return `<div class="upgrade-row${afford ? ' afford' : ''}">
        <div class="upgrade-info">
          <div class="upgrade-title">${u.label}</div>
          <div class="upgrade-desc">${u.desc}</div>
          <div class="upgrade-level">${level}</div>
          ${missingTxt}
        </div>
        <button class="upgrade-buy" data-upgrade="${key}" ${maxed || !afford ? 'disabled' : ''}>${btnLabel}</button>
      </div>`;
    }).join('');
    $('tyUpgrades').querySelectorAll('[data-upgrade]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.upgrade;
        if (this.tycoon.buyUpgrade(key)) {
          this.toast(`${UPGRADES[key].label} — amelioration achetee.`, 3000, 'ok');
          this.refreshTycoonPanel();
        }
      });
    });

    const fleet = ty.fleet;
    $('tyFleetInfo').innerHTML = `${fleet.length} appareil(s) / ${ty.infrastructure.gates} portes disponibles.` +
      `<br>Appareil pilote : ${fleet[0].hours.toFixed(1)} h de vol.` +
      (fleet.length > 1 ? `<br>${fleet.length - 1} autre(s) appareil(s) generent un revenu passif a chaque vol.` : '');
    const aircraftCost = ty.aircraftCost();
    $('tyBuyAircraft').textContent = `Acheter un appareil (${aircraftCost.toLocaleString('fr-FR')} EUR)`;
    $('tyBuyAircraft').disabled = !ty.canBuyAircraft();
    if (fleet.length >= ty.infrastructure.gates) {
      $('tyFleetHint').textContent = 'Portes saturees — achetez une porte d\'embarquement supplementaire (onglet Exploitation).';
    } else if (ty.cash < aircraftCost) {
      $('tyFleetHint').textContent = `Il manque ${Math.round(aircraftCost - ty.cash).toLocaleString('fr-FR')} EUR.`;
    } else {
      $('tyFleetHint').textContent = '';
    }

    if (ty.lastFlight) {
      $('tyLastFlight').classList.remove('hidden');
      const f = ty.lastFlight;
      const rows = [
        ['Passagers', `${f.pax}`],
        ['Recette billets + boutiques', `${Math.round(f.revenue).toLocaleString('fr-FR')} EUR`],
        ['Couts (carburant, redevances)', `${Math.round(f.costs).toLocaleString('fr-FR')} EUR`],
        ['Profit net', `${Math.round(f.profit).toLocaleString('fr-FR')} EUR`],
        ['Variation reputation', `${f.repDelta >= 0 ? '+' : ''}${f.repDelta}`]
      ];
      $('tyLastFlightBody').innerHTML = rows.map(([k, v]) =>
        `<div class="flex justify-between gap-4"><span class="text-slate-400">${k}</span><span class="font-semibold">${v}</span></div>`
      ).join('');
    } else {
      $('tyLastFlight').classList.add('hidden');
    }
  },
};
