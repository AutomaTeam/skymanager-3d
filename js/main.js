/* ============================================================
   main.js — Boucle principale et machine a etats
   Etats : HUB (monde libre, tarmac) | PILOT (vol) | CABIN
   Plus de menu de selection de role : le joueur se deplace
   librement autour de l'aeroport et de l'appareil (ou qu'il se
   trouve) et declenche chaque activite en s'en approchant —
   monter aux commandes, embarquer en cabine, inspecter un poste
   de maintenance, entrer au bureau d'exploitation pour la gestion.
   ============================================================ */

import { bounceOffScenery } from './sceneryCollision.js?v=1791200000';
import { slideMove, collectBodies } from './bodies.js?v=1791200000';
import * as THREE from 'three';
import { Renderer3D, RUNWAY } from './renderer3d.js?v=1791200000';
import { Aircraft, KTS, FT, FPM } from './flightPhysics.js?v=1791200000';
import { TouchControls } from './touchControls.js?v=1791200000';
import { WalkJoystick } from './mechanicControls.js?v=1791200000';
import { CabinService, REQUEST_LABELS, NEEDS_STOCK } from './cabinService.js?v=1791200000';
import { MechanicSystem, STATIONS, PARTS, FAILURES } from './mechanicSystem.js?v=1791200000';
import { AirportTycoon, UPGRADES } from './airportTycoon.js?v=1791200000';
import { TerminalSystem, COUNTERS } from './terminalSystem.js?v=1791200000';
import { TODAY, CHOICES, SHIRTS, gateNotes } from './terminalFlow.js?v=1791200000';
import { Navigation } from './navigation.js?v=1791200000';
import { AgentSystem } from './agents.js?v=1791200000';
import { Environment } from './environment.js?v=1791200000';
import { MissionSystem } from './missions.js?v=1791200000';
import { Staff } from './staff.js?v=1791200000';
import { History } from './history.js?v=1791200000';
import { Hub } from './hub.js?v=1791200000';
import { Arcade, COIN, BADGES, FUN_FACTS, MAP_THEMES, nextUnlock, QUIZ, DESTINATIONS } from './arcade.js?v=1791200000';
import { FlightAssist } from './flightAssist.js?v=1791200000';
import { Fun } from './fun.js?v=1791200000';
import { Hangar } from './hangar.js?v=1791200000';
import { SkyMissions } from './skyMissions.js?v=1791200000';
import { MiniGames } from './minigames.js?v=1791200000';
import { GroundFun } from './groundFun.js?v=1791200000';
import { Deco } from './deco.js?v=1791200000';
import { Album } from './album.js?v=1791200000';
import { OpenWorld } from './openWorld.js?v=1791200000';
import { Comfort } from './comfort.js?v=1791200000';
import { Rides } from './rides.js?v=1791200000';
import { planeOf } from './fleet.js?v=1791200000';
import { HELIPAD } from './heliModel.js';
import { sfx } from './sfx.js?v=1791200000';
import { perfHud } from './perfHud.js?v=1791200000';
import { iconify } from './icons.js?v=1791200000';
import { drawPFD } from './cockpit.js?v=1791200000';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* Vitesse de rotation du joueur au sol (rad/s), voir updateHub/updateTerminal.
   Deplacement "commun" a la troisieme personne : gauche/droite tournent
   en continu tant que la touche est maintenue (pas d'angle cible fixe
   a atteindre), haut/bas avancent/reculent selon le cap courant. Avant
   ce correctif, le jeu visait un angle absolu calcule une seule fois par
   pression, pivotait pour s'y aligner (avec un large virage en cas de
   demi-tour) puis marchait tout droit -- tenir "droite" n'avait alors
   plus d'effet une fois l'angle atteint, ce qui ne correspond au
   comportement d'aucun jeu a la troisieme personne usuel. */
const PLAYER_TURN_SPEED = 2.8;

/* Detection tactile vs souris/clavier : conditionne le texte d'accueil,
   le plein ecran automatique et l'affichage des rappels clavier PC. */
const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

/* Bornes de deplacement libre du joueur au sol : couvrent l'integralite
   du complexe aeroportuaire construit (piste sur toute sa longueur,
   taxiway, aire de stationnement, terminal, tour, bureau d'exploitation,
   hangars, parking) — pas seulement les abords immediats de la porte.
   Le joueur peut ainsi marcher partout ou l'avion pourrait se trouver
   apres un vol, et explorer librement le reste des installations. */
const HUB_BOUNDS = { minX: -140, maxX: 660, minZ: -1550, maxZ: 1650 };
const HUB_WALK_SPEED = 5.2;   // m/s — releve pour rendre le grand plan praticable

/* Points d'interaction combinant les postes de maintenance (iteration 2)
   et les nouveaux acces "monter aux commandes" / "embarquer" / "gestion",
   qui remplacent le menu de role : on s'en approche pour agir.
   frame 'aircraft' : offset local qui suit l'appareil partout.
   frame 'world'    : coordonnees fixes (batiment). */
const HOTSPOTS = [
  ...STATIONS.map(s => ({ ...s, type: 'mechanic', frame: 'aircraft' })),
  { key: 'cockpit', type: 'cockpit', frame: 'aircraft', label: 'MONTER AUX COMMANDES', pos: [-2.0, -0.3, -13.2] },
  /* Mini-jeux au sol (vague 4) : laver l'avion, faire le plein. */
  { key: 'wash', type: 'game', game: 'wash', frame: 'aircraft', label: 'LAVER L\'AVION', pos: [-3.7, -1.2, 8.2] },
  { key: 'refuel', type: 'game', game: 'fuel', frame: 'aircraft', label: 'FAIRE LE PLEIN', pos: [-4.2, -1.2, -9.6] },
  { key: 'cabinDoor', type: 'cabin', frame: 'aircraft', label: 'EMBARQUER EN CABINE', pos: [-1.9, -0.9, -6.0] },
  /* La tour (x 252..272) et son bureau (x 273..283) sont a 100 m de la
     porte d'embarquement. Le point de gestion est devant la porte du bureau,
     cote aire de stationnement, sur du sol degage. */
  { key: 'tower', type: 'tower', frame: 'world', label: 'GESTION DE L\'AEROPORT', pos: [289, 0, 1132] },
  /* Repere seulement (fleche d'objectif Arcade) : le terminal s'ouvre a pied, on n'y « entre » plus par un bouton. */
  { key: 'terminal', type: 'terminal', frame: 'world', label: 'TERMINAL', pos: [360, 0, 1193], passive: true }
];

  /* Roles de PNJ dont on peut prendre la place, et rayon d'approche.
     Seuls les roles du tarmac sont proposes : le pilote, l'hotesse et
     le passager ont deja leur propre mode de jeu (MONTER AUX COMMANDES,
     EMBARQUER EN CABINE, terminal ouvert a pied), qui est leur
     controleur de role. Les prendre ici ferait doublon. */
  const CONTROL_ROLES = ['mechanic', 'ramp'];
  const CONTROL_RADIUS = 4.5;
  const CONTROL_SPEED = { mechanic: 3.6, ramp: 3.8 };
  const CONTROL_LABEL = { mechanic: 'MECANICIEN', ramp: 'AGENT DE PISTE' };

/* Boutons contextuels du monde libre, en mots simples (mode Arcade). */
const ARCADE_LABEL = {
  mechanic: (h) => `🔧 REPARER : ${h.label.toUpperCase()}`,
  cockpit: () => '✈️ MONTER DANS L\'AVION',
  cabin: () => '🥤 SERVIR EN CABINE',
  tower: () => '🗼 MA TOUR DE CONTROLE',
  game: (h) => h.game === 'wash' ? '🧽 LAVER L\'AVION' : '⛽ FAIRE LE PLEIN',
  terminal: () => '🏢 ENTRER DANS LE TERMINAL'
};

/* Ameliorations de la tour, en mots simples (mode Arcade). */
const KID_UPGRADE = {
  runways:   { ico: '🛣️', name: 'Nouvelle piste',     desc: 'Plus d\'avions peuvent atterrir.' },
  gates:     { ico: '🚪', name: 'Nouvelle porte',      desc: 'Pour accueillir un avion de plus.' },
  terminals: { ico: '🏢', name: 'Grand terminal',      desc: 'Plus de place pour les passagers.' },
  shops:     { ico: '🛍️', name: 'Boutique',            desc: 'Rapporte des pieces a chaque vol.' },
  vipLounge: { ico: '👑', name: 'Salon VIP',           desc: 'Les passagers adorent ton aeroport !' }
};

/* Prix de billet proposes en Arcade. */
const KID_PRICES = [
  { p: 120, name: 'Pas cher', ico: '🙂' },
  { p: 185, name: 'Normal',   ico: '😀' },
  { p: 260, name: 'Luxe',     ico: '🤩' }
];

class Game {
  constructor() {
    this.state = 'BOOT';
    this.time = 0;
    this.lastFrame = performance.now();

    this.r3d = new Renderer3D($('scene'));
    this.ac = new Aircraft();
    this.controls = new TouchControls();
    this.hubCtl = new WalkJoystick('hubStickPad', 'hubStickBase', 'hubStickKnob');
    this.cabCtl = new WalkJoystick('cabStickPad', 'cabStickBase', 'cabStickKnob');

    /* Modules des iterations 2 a 4 : deja branches sur la boucle */
    this.mechanic = new MechanicSystem();
    this.cabin = new CabinService();
    this.tycoon = new AirportTycoon();
    this.terminal = new TerminalSystem();
    this.missions = new MissionSystem();
    this.hotspots = HOTSPOTS;
    this.arcade = new Arcade(this);
    this.assist = new FlightAssist();
    this.fun = new Fun(this);
    this.hangar = new Hangar(this);
    this.sky = new SkyMissions(this);
    this.minigames = new MiniGames(this);
    this.ground = new GroundFun(this);
    this.deco = new Deco(this);
    this.album = new Album(this);
    this.openWorld = new OpenWorld(this);
    this.comfort = new Comfort(this);
    this.rides = new Rides(this);
    this.applyArcadeFlags();
    /* Personnel et Hub de gestion (mode Arcade). */
    this.staff = new Staff(this);
    this.history = new History(this);
    this.hub = new Hub(this, { KID_UPGRADE, KID_PRICES });

    /* Graphe de navigation du monde : zones, portails et obstacles.
       Seule source de verite pour ce qui est praticable. */
    this.nav = new Navigation();
    /* Obstacles du decor en modeles 3D (arbres, bancs, maisons...). */
    if (this.r3d.decorBlockers) this.nav.blockers.push(...this.r3d.decorBlockers);

    /* PNJ autonomes : passagers, hotesses, pilote, mecaniciens,
       agents d'escale. Leurs maillages sont construits au premier
       update, une fois la pose de l'appareil publiee au graphe. */
    this.agents = new AgentSystem(this.nav, this.r3d);

    /* Environnement (phase 7) : heure de jeu et meteo dynamique.
       Il pilote le ciel, les lumieres, le brouillard, la pluie, et
       fournit le vent et la turbulence au modele de vol. */
    this.env = new Environment();
    this.applyArcadeFlags();

    this.phase = 'PARKING';
    this.hint = '';
    this.reportShown = false;
    this.tdTimer = 0;

    /* Composants actuellement responsables d'une panne en vol (phase 12).
       Necessaire pour lever une panne correctement : `ac.faults` agrege
       plusieurs composants par `kind` (tyresNose et tyresMain partagent
       'tyre', struts et airframe partagent 'drag'), donc reparer l'un ne
       doit pas effacer la panne encore active de l'autre. */
    this._activeFaultComponents = new Set();

        /* Boucle continue : accumulateurs du monde (voir worldUpdate).
           `_worldPaused` gele le monde pendant les menus, `_worldAcc`
           borne le rattrapage apres un retour d'onglet en arriere-plan. */
        this._worldPaused = false;
        this._worldAcc = 0;
        this._fleetAcc = 0;
        this._fleetIncome = 0;

    /* Avatar du joueur (monde libre, mode HUB) */
    this.player = { pos: new THREE.Vector3(), heading: 0, moving: false };
    this.nearHotspot = null;
    this.currentStation = null;

        /* Prise de controle d'un PNJ (phase 3) : l'agent tenu, son role,
               et le libelle du bouton contextuel. */
            this.controlled = null;
            this.controlRole = null;
            this.controlHint = '';
            this.nearAgent = null;

    /* Etat de l'hotesse/steward (mode CABIN) */
    /* Position dans le repere cabine (x : gauche/droite dans l'allee, z : vers l'avant).
       `target` est le cap voulu (0 = avant, PI = arriere) : l'hotesse reste alignee sur l'allee. */
    this.attendant = { x: 0, z: 0, heading: 0, target: 0, moving: false, _back: 0 };

    /* Terminal integre au monde (phase 22) : on y marche avec le meme avatar
       que sur le tarmac ; `inTerminal` bascule le HUD des comptoirs. */
    this.inTerminal = false;
    this.nearCounter = null;
    this.nearInteraction = null;   // { kind: 'request'|'cart'|'unruly', ... }

    this.setupUI();
    this.setupArcadeUI();
    this.setupPcHints();
    this.setupTouchHints();
  }

  /* Sur PC (pas de tactile detecte), remplace le conseil "ecran d'accueil"
     par les raccourcis clavier, puisque le jeu se joue alors a la souris
     et au clavier plutot qu'au doigt. */
  setupPcHints() {
    if (IS_TOUCH) return;
    document.querySelectorAll('.pc-hint').forEach(el => el.classList.remove('hidden'));
  }

  /* Sur tactile : le joystick de deplacement reste discret au repos (voir
     .stick-base dans style.css), donc sans ce rappel ecrit un joueur qui
     decouvre le jeu n'a litteralement aucun indice pour savoir qu'il peut
     glisser le doigt en bas a gauche de l'ecran pour marcher. */
  setupTouchHints() {
    if (!IS_TOUCH) return;
    document.querySelectorAll('.touch-hint').forEach(el => el.classList.remove('hidden'));

    /* Le conseil "orientation paysage" de l'ecran de demarrage n'a de sens
       que tant qu'on est effectivement en portrait : on le masque des que
       l'appareil est deja en paysage, et on suit les rotations en direct. */
    const orientationTip = $('bootTipOrientation');
    if (orientationTip) {
      const updateOrientationTip = () => {
        orientationTip.classList.toggle('hidden', window.innerWidth >= window.innerHeight);
      };
      updateOrientationTip();
      window.addEventListener('resize', updateOrientationTip);
      window.addEventListener('orientationchange', updateOrientationTip);
    }
  }

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
          AirportTycoon.reset();
          MechanicSystem.reset();
          CabinService.reset();
          TerminalSystem.reset();
          MissionSystem.reset();
          Arcade.reset();
          Staff.reset();
          History.reset();
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
  }

  /* ========================================================== */
  /* MODE ARCADE (phase 17) — voir js/arcade.js et js/flightAssist.js */
  /* ========================================================== */

  /* Le mode se propage aux modules qui ont une variante « facile ». */
  applyArcadeFlags() {
    const on = this.arcade.on;
    this.tycoon.arcade = on;
    this.cabin.arcade = on;
    this.terminal.arcade = on;
    this.mechanic.arcade = on;
    if (this.env) this.env.kid = on;
    if (this.r3d && this.r3d.renderer) this.r3d.renderer.toneMappingExposure = on ? 1.22 : 1.05;
    document.body.dataset.state = this.state;
  }

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
  }

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
          (IS_TOUCH ? 'Deplacement : joystick. ' : 'Deplacement : fleches ou ZQSD (Maj pour courir). ') +
          'En vol : gauche/droite = virer, haut/bas = monter/descendre.'
        : 'Simulation complete : volets, train, gaz, maintenance et gestion detaillee. ' +
          (IS_TOUCH ? 'Aux commandes : manche et manette des gaz a l\'ecran.'
            : 'Deplacement : fleches ou ZQSD. Aux commandes : cliquez-glissez le manche et la manette des gaz, ou fleches (tangage/roulis) · Q/D (palonnier) · W/S (gaz) · Espace (freins).');
    };
    $('modeArcade').addEventListener('click', () => { sfx.click(); pick('arcade'); });
    $('modePro').addEventListener('click', () => { sfx.click(); pick('pro'); });
    pick(this.arcade.data.mode);

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
    $('pauseHelp').addEventListener('click', () => { sfx.click(); $('helpPanel').classList.remove('hidden'); });
    $('helpClose').addEventListener('click', () => $('helpPanel').classList.add('hidden'));
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

    /* Tour : onglets et nom de l'aeroport. */
    document.querySelectorAll('.kid-tab').forEach(tab => tab.addEventListener('click', () => {
      sfx.click();
      this.showKidTab(tab.dataset.ktab);
    }));
    $('kidName').addEventListener('change', () => {
      $('kidName').value = this.arcade.setName($('kidName').value);
      sfx.ding();
    });
    $('kidName').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); });

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

    /* Tour (Arcade). */
    $('kidTowerClose').addEventListener('click', () => this.closeKidTower());

    /* Rapport de vol (Arcade). */
    $('kidRepHome').addEventListener('click', () => { sfx.click(); this.returnHome(); });
    $('kidRepAgain').addEventListener('click', () => {
      sfx.click();
      $('kidReport').classList.add('hidden');
      this.startArcadeFlight();
    });
  }

  /* Roulage automatique : le tracteur amene l'avion en bout de piste. */
  /* Choisit l'avion du vol (profil physique, modele 3D, livree). */
  setFlightPlane(id) {
    const P = planeOf(id);
    this.ac.applyProfile(id, P.phys);
    this.ac.gain = P.gain;
    this.r3d.setActivePlane(id, P.camScale);
    this.r3d.applyLivery(id, this.hangar.livery(id));
  }

  /* Decollage assiste (bouton DECOLLER, touche Entree ou compte a rebours). */
  launchNow() {
    if (this.state !== 'PILOT' || !this.ac.onGround || this.assist.launched) return;
    this.assist.launch();
    this.controls.setThrottle(1);
    sfx.whoosh();
    $('launchBtn').classList.add('hidden');
  }

  /* « Voler maintenant » : de l'ecran d'accueil au decollage en quelques secondes. */
  flyNow() {
    if (this.state !== 'BOOT') return;
    this.start();
    if (!this.arcade.on) return;
    this._flyNow = true;
    this.boardAircraft();
  }

  startArcadeFlight() {
    const quick = this._flyNow;
    this._flyNow = false;
    this.setFlightPlane(this.hangar.selected);
    this.resetFlight();
    this.assist.reset();
    this.arcade.resetFlight();
    this.sky.reset();
    this.openWorld.resetFlight();
    this.fun.onFlightStart();
    this.hint = '';
    this.hintUntil = 0;
    sfx.whoosh();
    if (quick) {
      /* Depart express : pas de plan de vol, decollage automatique. */
      this.fun.countdownLaunch();
      return;
    }
    this.toast(this.ac.heli ? '🚁 Ton helicoptere t\'attend sur l\'helipad !' : '🚜 Le tracteur t\'amene au bout de la piste !', 2600);
    /* Choix du plan de vol (destination + defi). */
    this.arcade.offerPlan();
  }

  /* Aide a l'atterrissage : on replace l'avion en finale, aligne sur la piste. */
  helpLanding() {
    const ac = this.ac;
    if (this.state !== 'PILOT' || ac.onGround) return;
    if (ac.heli) {
      ac.heli.auto = 'land';
      this.assist.altHold = null;
      this.arcade.clearRing();
      sfx.whoosh();
      this.toast('🚁 Je te ramene sur l\'helipad et je te pose doucement !', 3400, 'ok');
      return;
    }
    ac.pos.set((Math.random() - 0.5) * 120, 225, -5500);
    ac.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI);   // cap 180
    ac.vel.set(0, 0, 0).addScaledVector(ac.forward(), 78);
    ac.omega.set(0, 0, 0);
    ac.gearDown = !!ac.fixedGear;     // train fixe : il reste « sorti », sinon l'approche guidee ne demarre jamais
    ac.setFlaps(0);
    this.assist.reset();
    this.assist.launched = true;
    this.arcade.clearRing();
    sfx.whoosh();
    this.toast('🛬 Tu es en finale ! Garde le nez droit, l\'avion s\'occupe du reste.', 3600, 'ok');
  }

  /* Apres un vol : le tracteur ramene l'avion a la porte, le joueur retrouve l'aeroport. */
  returnHome() {
    $('kidReport').classList.add('hidden');
    this.reportShown = false;
    this.placeAircraftAtGate();
    this.assist.reset();
    this.arcade.resetFlight();
    const gate = this.r3d.gatePosition;
    this.goToHub({ pos: new THREE.Vector3(gate.x - 16, 0, gate.z - 22), heading: -Math.PI / 2 });
    this.toast('🚜 L\'avion est revenu a la porte. Bien joue !', 2600, 'ok');
  }

  /* Interface du vol (boutons d'action et anneaux). */
  updateArcadePilotUI() {
    const ac = this.ac;
    $('launchBtn').classList.toggle('hidden',
      !(ac.onGround && !this.assist.launched && !ac.touchdown && !this.reportShown));
    $('helpLandBtn').classList.toggle('hidden', ac.onGround || this.assist.landing);
    $('ringChip').classList.toggle('hidden', ac.onGround || this.sky.busy);
    $('ringN').textContent = this.arcade.ringsThisFlight;
  }

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
    const fr = this.tycoon.registerFlight(ac, { fpm: t.fpm, offset: Math.abs(t.offset) }, boarded);
    const plane = planeOf(this.ac.profile);
    const flightCoins = Math.max(0, Math.round(fr.profit / COIN * plane.income));
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
  }

  /* ---------------- Tour de controle (Arcade) ---------------- */
  openMapBig() {
    this.arcade.openBigMap();
    this._worldPaused = true;
  }

  closeMapBig() {
    this.arcade.closeBigMap();
    this._worldPaused = false;
  }

  openAlbum() {
    this.renderAlbum($('kidAlbumBody'));
    $('kidAlbumSub').textContent = `${this.arcade.badgeCount()} trophee${this.arcade.badgeCount() > 1 ? 's' : ''} sur ${BADGES.length}`;
    $('kidAlbum').classList.remove('hidden');
  }

  closeAlbum() { $('kidAlbum').classList.add('hidden'); }

  /* Grille de trophees : ceux qu'on n'a pas encore sont grises, avec leur defi. */
  renderAlbum(host) {
    const got = this.arcade.data.badges;
    host.innerHTML = BADGES.map(b => {
      const on = !!got[b.id];
      return `<div class="badge${on ? ' on' : ''}"><span class="b-ico">${on ? b.ico : '❓'}</span><b>${on ? b.name : '???'}</b><small>${b.desc}</small></div>`;
    }).join('');
  }

  showKidTab(key) {
    document.querySelectorAll('.kid-tab').forEach(t => t.classList.toggle('on', t.dataset.ktab === key));
    document.querySelectorAll('.kid-pane').forEach(p => p.classList.toggle('hidden', p.dataset.kpane !== key));
  }

  openKidTower() { this.hub.open(); }

  /* Ancien panneau de la tour, remplace par le Hub (hub.js) : conserve, non utilise. */
  _legacyKidTower() {
    this.arcade.event('tower');
    this.showKidTab('home');
    this.refreshKidTower();
    $('kidTower').classList.remove('hidden');
    this._worldPaused = true;
    sfx.click();
  }

  closeKidTower() {
    $('kidTower').classList.add('hidden');
    this._worldPaused = false;
  }

  refreshKidTower() {
    const ty = this.tycoon, arc = this.arcade;
    $('kidCoins').textContent = `${arc.coins.toLocaleString('fr-FR')} 🪙`;
    $('kidStars').textContent = `${arc.data.stars} ⭐`;
    $('kidFlights').textContent = `${ty.flightsCompleted} ✈️`;
    $('kidLevel').textContent = arc.data.level;
    $('kidXp').style.width = `${Math.round(arc.xpProgress() * 100)}%`;
    if (document.activeElement !== $('kidName')) $('kidName').value = arc.data.name;
    const nu = nextUnlock(arc.data.level);
    $('kidNextUnlock').textContent = nu ? `🎁 Niveau ${nu.level} : carte « ${MAP_THEMES[nu.theme].name} » offerte !` : '🌟 Tous les cadeaux de niveau sont debloques !';
    $('kidBadgeN').textContent = `${arc.badgeCount()}/${BADGES.length}`;
    this.renderAlbum($('kidAlbumTower'));

    /* Cadeau du jour : une surprise chaque matin, plus grosse si on revient plusieurs jours de suite. */
    const gift = $('kidGift');
    const ready = arc.giftReady();
    const streak = (arc.data.gift && arc.data.gift.streak) || 0;
    gift.className = 'kid-gift' + (ready ? ' ready' : '');
    gift.innerHTML = `<span class="gi">${ready ? '🎁' : '📭'}</span>` +
      `<div class="gt"><b>${ready ? 'Ton cadeau du jour est la !' : 'Cadeau ouvert, a demain !'}</b>` +
      `${streak > 0 ? `🔥 ${streak} jour${streak > 1 ? 's' : ''} de suite` : 'Reviens chaque jour pour un plus gros cadeau'}</div>` +
      `<button id="kidGiftBtn" ${ready ? '' : 'disabled'}>${ready ? 'OUVRIR' : '✔'}</button>`;
    $('kidGiftBtn').addEventListener('click', () => {
      const r = arc.openGift();
      if (!r) return;
      this.toast(`🎁 +${r.coins} 🪙 ! ${r.streak > 1 ? `🔥 ${r.streak} jours de suite !` : 'Reviens demain pour plus !'}`, 4200, 'ok');
      this.refreshKidTower();
    });

    /* Carnet de voyage : les villes deja visitees. */
    const cities = DESTINATIONS.map(d => `<span class="trip${arc.data.visited.includes(d.city) ? ' on' : ''}" title="${d.city}">${arc.data.visited.includes(d.city) ? d.flag : '❔'}</span>`).join('');
    $('kidTravel').innerHTML = `<div class="trips">${cities}</div><div class="text-xs text-slate-400 mt-1.5">${arc.data.visited.length}/${DESTINATIONS.length} villes visitees — choisis une nouvelle destination avant de decoller !</div>`;

    /* Pieces cachees du jour. */
    const th = arc.treasureHeat();
    $('kidTreasure').innerHTML = th
      ? `<div class="coins">${(arc.data.treasure.got).map(v => `<i class="${v ? 'on' : ''}">🪙</i>`).join('')}</div>` +
        `<div class="flex-1">${th.found}/${th.total} trouvees.<br><span class="text-slate-400">Cherche-les sur l'aeroport, la mini-carte t'aide !</span></div>`
      : '<div>Sors sur le tarmac pour les decouvrir !</div>';

    /* Styles de mini-carte : on achete avec des pieces. */
    $('kidThemes').innerHTML = Object.keys(MAP_THEMES).map(id => {
      const t = MAP_THEMES[id];
      const owned = arc.data.themes.includes(id);
      const on = arc.data.mapTheme === id;
      return `<button class="theme-btn${on ? ' on' : ''}${owned ? '' : ' locked'}" data-theme="${id}">${t.ico}<small>${t.name}</small>` +
        `<span class="pr">${on ? '✔ choisi' : owned ? 'choisir' : t.cost + ' 🪙'}</span>` +
        `<span class="sw" style="background:linear-gradient(90deg,${t.grass} 33%,${t.runway} 33% 66%,${t.hangar} 66%)"></span></button>`;
    }).join('');
    $('kidThemes').querySelectorAll('[data-theme]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.theme;
      if (arc.data.themes.includes(id)) { arc.setTheme(id); sfx.click(); }
      else if (arc.buyTheme(id)) this.toast(`🎨 Carte « ${MAP_THEMES[id].name} » debloquee !`, 2600, 'ok');
      else { sfx.oops(); this.toast('Pas assez de pieces... Va en gagner !', 2200, 'warn'); }
      this.refreshKidTower();
    }));

    $('kidDaily').innerHTML = arc.dailyItems.map(d =>
      `<div class="kid-daily-row${d.done ? ' done' : ''}"><span class="ico">${d.done ? '✅' : d.icon}</span>` +
      `<span>${d.label} <b>(${d.progress}/${d.target})</b></span><span class="rw">+${d.reward} 🪙</span></div>`
    ).join('');

    /* Prix du billet : trois choix, la demande se voit tout de suite. */
    const cur = ty.ticketPrice;
    $('kidPrice').innerHTML = KID_PRICES.map(o => {
      ty.ticketPrice = o.p;
      const pax = ty.paxPerFlight;
      ty.ticketPrice = cur;
      const on = Math.abs(cur - o.p) < 30 && KID_PRICES.every(x => Math.abs(cur - o.p) <= Math.abs(cur - x.p));
      return `<button class="price-btn${on ? ' on' : ''}" data-price="${o.p}">${o.ico} ${o.name}<small>≈ ${pax} passagers</small></button>`;
    }).join('');
    $('kidPrice').querySelectorAll('[data-price]').forEach(b => b.addEventListener('click', () => {
      ty.ticketPrice = parseInt(b.dataset.price, 10);
      ty.save();
      sfx.click();
      this.refreshKidTower();
    }));
    $('kidPriceNote').textContent = 'Billet cher = moins de passagers. Billet pas cher = plus de passagers. A toi de choisir !';

    /* Ameliorations + nouvel avion. */
    const cards = Object.keys(UPGRADES).map(key => {
      const k = KID_UPGRADE[key];
      const cost = ty.upgradeCost(key);
      const maxed = cost == null;
      const coinsCost = maxed ? 0 : Math.round(cost / COIN);
      const afford = !maxed && arc.coins >= coinsCost;
      const lvl = UPGRADES[key].once ? (ty.infrastructure[key] ? 'Acquis' : '') : `Niveau ${ty.infrastructure[key]}`;
      return `<div class="kid-up${afford ? ' afford' : ''}"><span class="ico">${k.ico}</span>` +
        `<div class="info"><div class="t">${k.name}</div><div class="d">${k.desc}</div><div class="lv">${lvl}</div></div>` +
        `<button class="kid-buy" data-up="${key}" ${maxed || !afford ? 'disabled' : ''}>${maxed ? 'MAX' : coinsCost.toLocaleString('fr-FR') + ' 🪙'}</button></div>`;
    });
    const acCost = Math.round(ty.aircraftCost() / COIN);
    const acOk = ty.canBuyAircraft();
    cards.push(`<div class="kid-up${acOk ? ' afford' : ''}"><span class="ico">✈️</span>` +
      `<div class="info"><div class="t">Nouvel avion</div><div class="d">${ty.fleet.length >= ty.infrastructure.gates ? 'Il faut d\'abord une nouvelle porte !' : 'Un avion de plus rapporte des pieces tout seul.'}</div>` +
      `<div class="lv">${ty.fleet.length} avion${ty.fleet.length > 1 ? 's' : ''}</div></div>` +
      `<button class="kid-buy" data-plane="1" ${acOk ? '' : 'disabled'}>${acCost.toLocaleString('fr-FR')} 🪙</button></div>`);
    $('kidUpgrades').innerHTML = cards.join('');
    $('kidUpgrades').querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => {
      if (this.tycoon.buyUpgrade(b.dataset.up)) {
        sfx.levelUp();
        this.arcade.confetti(50);
        this.arcade.event('buy');
        this.toast(`🎉 ${KID_UPGRADE[b.dataset.up].name} achete(e) !`, 2600, 'ok');
        this.refreshKidTower();
      }
    }));
    $('kidUpgrades').querySelectorAll('[data-plane]').forEach(b => b.addEventListener('click', () => {
      if (this.tycoon.buyAircraft()) {
        sfx.levelUp();
        this.arcade.confetti(70);
        this.arcade.event('buy');
        this.toast('✈️ Nouvel avion livre ! Il gagne des pieces pour toi.', 3200, 'ok');
        this.refreshKidTower();
      }
    }));
  }

  /* Pieces detachees : en Arcade, le stock se reconstitue tout seul. */
  topUpParts() {
    for (const p of Object.keys(PARTS)) {
      if ((this.mechanic.parts[p] || 0) < 3) this.mechanic.parts[p] = 3;
    }
  }

  flash(msg, ms = 2200) {
    this.hint = msg;
    this.hintUntil = this.time + ms / 1000;
  }

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
  }

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
    }

    /* ==========================================================
       BOUCLE CONTINUE — le monde tourne meme quand on ne le regarde pas.

       `world.update(dt)` fait avancer ce qui ne depend pas du joueur :
       usure de l'appareil, files du terminal, service cabine, et le
       revenu passif de la flotte. Il tourne a chaque frame, quel que
       soit l'etat, puis le controleur de l'etat actif prend la main.

       Deux garde-fous :
       - `_worldPaused` gele le monde pendant les menus (pause, carnet,
         tableau de bord) : on ne veut pas perdre de satisfaction parce
         qu'on a ouvert un panneau.
       - `_worldAcc` borne le rattrapage a 0,25 s : un onglet en
         arriere-plan peut produire un `dt` enorme, et sans plafond le
         terminal se viderait d'un coup au retour.
       ========================================================== */
    worldUpdate(dt) {
      if (this._worldPaused) return;
      this._worldAcc = Math.min(0.25, (this._worldAcc || 0) + dt);
      const step = this._worldAcc;
      this._worldAcc = 0;

            /* Environnement : l'heure avance et la meteo evolue en continu,
               y compris pendant qu'on est dans le terminal ou en cabine. */
            this.env.update(step);
            if (this.arcade.on) { this.staff.update(step); this.history.update(step); }

            /* Le vent et la turbulence ressentis par l'appareil viennent de
               la meteo : un orage secoue, un brouillard non. */
            const wv = this.env.windVector();
            this.ac.wind.set(wv.x, wv.y, wv.z);
            this.ac.turbulence = this.env.turbulence;

      /* Usure passive : l'appareil s'use aussi quand il ne vole pas
         (roulage, freinage, cycles hydrauliques). ~0,35 %/min au sol,
         soit environ 21 % par heure de jeu — assez pour obliger a
         passer a l'atelier sans rendre la maintenance permanente. */
      if (this.ac.onGround) {
        const w = 0.35 * step / 60;
        for (const k in this.mechanic.components) {
          const c = this.mechanic.components[k];
          c.wear = Math.min(100, c.wear + w);
        }
      }

      /* Signes visuels d'usure sur la cellule : recalcules deux fois
         par seconde seulement, l'etat ne change pas plus vite. */
      this._wearAcc = (this._wearAcc || 0) + step;
      if (this._wearAcc > 0.5) {
        this._wearAcc = 0;
        this.r3d.applyWearVisuals(this.mechanic);
      }

      /* Le terminal vit en permanence : les files se forment et se
         resorbent meme quand le joueur est sur le tarmac ou en vol. */
      {
        this.terminal.update(step);
        /* Alerte croisee : sans elle, rien ne signale au joueur occupe en
           cockpit ou en cabine que le hall est en train de deborder -- il
           ne le decouvre qu'en y retournant, des dizaines de passagers
           plus tard. Hysteresis (20 points) pour ne declencher qu'une
           fois par episode de crise, pas a chaque frame sous le seuil. */
        if (this.terminal.mood < 25 && !this._terminalCritical) {
          this._terminalCritical = true;
          this.toast('Terminal en difficulte — l\'ambiance du hall s\'effondre.', 4000, 'err');
        } else if (this.terminal.mood > 45) {
          this._terminalCritical = false;
        }
      }

      /* Le service cabine ne tourne que si l'appareil est en vol : au
         sol, il n'y a personne a servir. Meme regle qu'au-dessus, le
         mode CABIN a son propre appel. */
      if (!this.ac.onGround && this.state !== 'CABIN') this.cabin.update(step);

      /* Revenu passif de la flotte : les autres appareils volent pour
         nous. Credite une fois par minute de jeu, pas a chaque frame. */
      this._fleetAcc = (this._fleetAcc || 0) + step;
      if (this._fleetAcc >= 60) {
        this._fleetAcc -= 60;
        const gain = this.tycoon.creditPassiveFleet(60);
        if (gain > 0) this._fleetIncome = (this._fleetIncome || 0) + gain;
      }
    }

    /* ==========================================================
       RAPPORT D'ACTIVITE — ce que le monde a fait pendant qu'on
       etait ailleurs. Affiche au retour dans le hub, pour que
       l'autonomie soit visible et pas seulement simulee.
       ========================================================== */
    worldReport() {
      const parts = [];
      const t = this.terminal;
      const queues = Object.values(t.counters).reduce((s, c) => s + c.queue, 0);
      const open = Object.values(t.counters).filter(c => c.open).length;
      parts.push(`Terminal : ${queues} passager(s) en file, ${open} comptoir(s) ouvert(s), ambiance ${t.mood.toFixed(0)}%`);

      if (this.mechanic.needsMaintenance()) {
        const worst = Object.values(this.mechanic.components).sort((a, b) => b.wear - a.wear)[0];
        parts.push(`Atelier : ${worst.label} a ${worst.wear.toFixed(0)}%`);
      }
      if (this._fleetIncome) parts.push(`Flotte : +${Math.round(this._fleetIncome).toLocaleString('fr-FR')} EUR`);
            parts.push(this.env.report());
            return parts.join(' · ');
    }

    /* A appeler a chaque entree dans le hub : resume l'activite du monde. */
    announceWorld() {
      if (this.arcade.on) { this._fleetIncome = 0; return; }
      const report = this.worldReport();
      if (report) this.toast(report, 4200);
      /* Le revenu annonce ne doit pas etre reannonce au retour suivant. */
      this._fleetIncome = 0;
    }

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
      $('pauseMenu').classList.remove('hidden');
  }

    closePause() {
      $('pauseMenu').classList.add('hidden');
      this._worldPaused = false;
    }

    /* Echap ferme le panneau ouvert le plus prioritaire. Les panneaux
       bloquants (rapport, incident, mini-jeu) ne se ferment pas ainsi :
       ils attendent une decision du joueur. */
    closeTopPanel() {
      if (!$('photoPanel').classList.contains('hidden')) { $('photoPanel').classList.add('hidden'); return true; }
      if (!$('photoAlbum').classList.contains('hidden')) { $('photoAlbum').classList.add('hidden'); return true; }
      if (!$('albumPanel').classList.contains('hidden')) { $('albumPanel').classList.add('hidden'); return true; }
      if (!$('settingsPanel').classList.contains('hidden')) { $('settingsPanel').classList.add('hidden'); return true; }
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
      if (!$('kidTower').classList.contains('hidden')) { this.closeKidTower(); return true; }
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
    }

  /* ========================================================== */
  /* HUB — Monde libre : deplacement, postes de maintenance,       */
  /* acces au poste de pilotage, a la cabine et a la gestion       */
  /* ========================================================== */

  /* Place l'appareil a la porte d'embarquement — uniquement au tout
     premier demarrage, jamais pendant le jeu libre. */
  placeAircraftAtGate() {
    const gate = this.r3d.gatePosition;
    /* A l'aeroport on voit toujours le jet de ligne (le petit avion du hangar ne sert qu'en vol). */
    this.ac.applyProfile('liner', null);
    this.ac.gain = planeOf('liner').gain;
    this.r3d.setActivePlane('liner');
    this.ac.reset({
      pos: new THREE.Vector3(gate.x, 3.14, gate.z),
      heading: 270, speed: 0, flaps: 1, gear: true, fuel: 9000
    });
    this._activeFaultComponents.clear();
    /* La pose est publiee au graphe immediatement : sinon le repere
       `aircraft` reste a l'identite, et les PNJ y placant un poste
       calculeraient des coordonnees locales prises pour du monde. */
    this.nav.setFrame('aircraft', this.ac.pos, this.ac.quat);
  }

  /* Position/orientation de reprise par defaut du joueur : juste a
     cote de l'appareil, quelle que soit sa position actuelle.
     Le point est ramene sur du sol praticable : si l'appareil est
     colle a un batiment, on ne veut pas apparaitre dans le mur. */
  defaultHubSpawn() {
    const ac = this.ac;
    const off = new THREE.Vector3(-20, 0, 0).applyQuaternion(ac.quat);
    const c = this.nav.clampToWorld(ac.pos.x + off.x, ac.pos.z + off.z);
    const w = this.nav.nearestWalkable(c.x, c.z);
        return { pos: new THREE.Vector3(w.x, this.r3d.groundHeight(w.x, w.z), w.z), heading: 0 };
  }

  /* Bascule vers le monde libre. spawn = { pos, heading } optionnel. */
  goToHub(spawn) {
      /* On ne peut pas rester aux commandes d'un PNJ en changeant de
         mode : l'agent est rendu a sa routine avant la bascule. */
      if (this.controlled) this.releaseControl();
      $('hudPilot').classList.add('hidden');
      $('flightPlan').classList.add('hidden');       // le choix du vol ne doit pas rester ouvert a l'aeroport
    if (this.state === 'CABIN') this.r3d.exitCabinMode();
    $('hudCabin').classList.add('hidden');
    $('hudHub').classList.remove('hidden');
    this.state = 'HUB';

    /* L'appareil reste exactement ou il s'est arrete : on coupe juste
       les commandes et les moteurs pour qu'il paraisse a l'arret. */
    const ac = this.ac;
    ac.ctl.pitch = ac.ctl.roll = ac.ctl.yaw = ac.ctl.throttle = ac.ctl.brake = 0;
    ac.n1 = ac.n1Target = 20;
    ac.vel.set(0, 0, 0);
    ac.omega.set(0, 0, 0);
    ac.spoilers = false;
    ac.reverse = false;
    ac.parkBrake = true;

    this.r3d.enterHubMode(HOTSPOTS);

    const s = spawn || this.defaultHubSpawn();
    /* Filet de securite : aucun point d'apparition ne doit tomber
       dans un mur, sinon le joueur y resterait bloque. */
    const safe = this.nav.nearestWalkable(s.pos.x, s.pos.z);
        /* Le sol n'est pas plat partout (rampe de passerelle) : on pose le
           joueur sur la vraie hauteur du terrain, sinon il s'enfonce. */
        this.player.pos.set(safe.x, this.r3d.groundHeight(safe.x, safe.z), safe.z);
    this.player.heading = s.heading;
    this.currentStation = null;
    this.nearHotspot = null;
    $('btnInspect').classList.add('hidden');
    $('stationPanel').classList.add('hidden');
    $('minigame').classList.add('hidden');

    $('hubHint').textContent = this.mechanic.needsMaintenance()
      ? 'Maintenance requise avant le prochain vol — approchez-vous d\'un point de diagnostic sur l\'appareil.'
      : 'Approchez-vous de l\'avion pour piloter ou embarquer, et de la tour pour gerer l\'aeroport.';

        /* Le monde a continue de tourner pendant qu'on etait ailleurs :
           on resume ce qu'il s'est passe, sinon l'autonomie reste invisible. */
        this.announceWorld();
      }

      /* Retour au monde libre pres de l'appareil, depuis le cockpit ou la cabine */
  exitToHub() {
    this.goToHub(this.defaultHubSpawn());
    this.toast('Vous descendez sur le tarmac.', 1800);
  }

  updateHub(dt) {
    const { move, turn } = this.hubCtl.read();
    /* Sprint (Shift) : utile pour traverser rapidement le complexe
       aeroportuaire desormais integralement praticable a pied. */
    const running = this.hubCtl.keys.has('ShiftLeft') || this.hubCtl.keys.has('ShiftRight');
    const speed = HUB_WALK_SPEED * (running ? 1.8 : 1);

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

      this.r3d.updateHubScene(this.ac, this.mechanic, this.player, dt, this.time);
      this.rides.afterScene(dt);
      this.r3d.reactCones(this.player.pos.x, this.player.pos.z, dt);

      /* Point d'interaction le plus proche : poste de maintenance, cockpit,
         porte cabine ou bureau d'exploitation. */
      let nearest = null, nearestDist = 6.5;
            const markers = this.r3d.hotspotMarkers || {};
            for (const h of HOTSPOTS) {
              if (h.passive) continue;
              const m = markers[h.key];
              if (!m) continue;
              const d = Math.hypot(m.group.position.x - this.player.pos.x, m.group.position.z - this.player.pos.z);
              if (d < nearestDist) { nearestDist = d; nearest = h; }
            }
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
        $('btnInspectLabel').textContent = 'RENDRE LE CONTROLE';
      } else if (npc) {
        $('btnInspect').classList.remove('hidden');
        $('btnInspectLabel').textContent = `PRENDRE LE CONTROLE (${CONTROL_LABEL[npc.role] || npc.role.toUpperCase()})`;
      } else {
        $('btnInspect').classList.toggle('hidden', !nearest);
        if (nearest) $('btnInspectLabel').textContent = this.arcade.on
          ? (ARCADE_LABEL[nearest.type] ? ARCADE_LABEL[nearest.type](nearest) : nearest.label)
          : nearest.label;
      }

      /* Rappel contextuel du role tenu. */
      if (this.controlled) {
        $('hubHint').textContent = this.controlHint;
      }
    }

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
      this.controlHint = `Vous etes ${CONTROL_LABEL[a.role] || a.role}. ${this.roleHint(a.role)}`;
      /* L'avatar du joueur s'efface : on ne joue plus qu'un seul corps.
         La lampe reste allumee, elle suit desormais l'agent tenu. */
      this.r3d.setPlayerVisible(false);
      this.player.pos.set(a.wx, a.wy, a.wz);
      this.player.heading = a.heading;
      this.player.moving = false;
      this.nearHotspot = null;
      $('hubHint').textContent = this.controlHint;
      this.toast(`Controle pris : ${CONTROL_LABEL[a.role] || a.role}.`, 2200);
    }

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
              this.toast('Controle rendu — l\'agent reprend son service.', 2200);
            }
      $('hubHint').textContent = this.mechanic.needsMaintenance()
        ? 'Maintenance requise avant le prochain vol — approchez-vous d\'un point de diagnostic sur l\'appareil.'
        : 'Approchez-vous de l\'avion pour piloter ou embarquer, et de la tour pour gerer l\'aeroport.';
    }

    /* Rappel de ce que le role tenu sait faire, pour ne pas laisser le
       joueur devant un avatar sans autre perspective que marcher. */
    roleHint(role) {
      if (role === 'mechanic') return 'Approchez-vous d\'un point de diagnostic sur l\'appareil pour reparer.';
      return 'Vous circulez sur l\'aire de trafic, autour de l\'appareil.';
    }

    handleHubInteract() {
      /* Le bouton contextuel sert d'abord a la prise/au rendu de controle. */
      if (this.controlled) { this.releaseControl(); return; }
      if (this.nearAgent) { this.rides.dismount(true); this.takeControl(this.nearAgent); return; }

      const h = this.nearHotspot;
      if (!h) return;
      this.rides.dismount(true);
      if (h.type === 'mechanic') this.openStationPanel(h.key);
      else if (h.type === 'cockpit') this.boardAircraft();
      else if (h.type === 'cabin') this.enterCabin();
      else if (h.type === 'tower') this.openTycoonPanel();
      else if (h.type === 'game') this.minigames.open(h.game);
    }

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
          ? 'Va devant un comptoir (suis la fleche) et appuie sur le bouton pour faire avancer les passagers !'
          : "Rejoignez un poste pour l'ouvrir ou traiter la file. La porte d'embarquement rapporte de l'argent.";
        this.toast('Vous entrez dans le terminal.', 1400);
      } else {
        $('hubAreaName').textContent = 'Tarmac';
        $('hubHint').textContent = "Approchez-vous de l'avion pour piloter ou embarquer, et de la tour pour gerer l'aeroport.";
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
  }

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
              if (A.on) { A.giveCoins(3, { label: 'Machine rechargee !' }); A.event('restock'); } else sfx.ding();
            } else sfx.oops();
            break;
          }
          case 'bag': {
            if (t.loadBag()) {
              if (A.on) { A.giveCoins(1, { label: 'Bagage charge' }); A.event('bag'); } else sfx.click();
            }
            break;
          }
          case 'serve': {
            const left = t.serveNext(c.id);
            if (left === null) { this.toast(t.lastMessage || 'Rien a servir ici.', 1800, 'warn'); sfx.oops(); break; }
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
            this.toast(t.actionLabel(c.id), 1800);
        }
      }

      /* ---------- Panneau de verification ---------- */
      openCheckPanel(c) {
        this._chkCounter = c;
        this._chkBusy = false;
        this._worldPaused = true;
        $('checkPanel').classList.remove('hidden');
        this.renderCheck();
      }

      closeCheckPanel() {
        clearTimeout(this._chkTimer);
        $('checkPanel').classList.add('hidden');
        this._chkCounter = null;
        this._chkBusy = false;
        this.terminal.inspectId = null;
        this._worldPaused = false;
      }

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
          body = who + card('BILLET', `<div class="big">${pax.name}</div><div>Vol : <b>${pax.flight}</b> · siege ${pax.seat}</div>` +
                 `<div class="ref">Vol du jour : ${TODAY.flight} → ${TODAY.dest}</div>`) +
                 card('BAGAGE', `<div class="big">${pax.kg} kg</div><div class="ref">Limite : ${TODAY.bagLimit} kg · surcharge ${TODAY.feePerKg} €/kg</div>`);
          btns = [['ok', 'ok', '✅ VALIDER', 'en regle'], ['fee', 'fee', '💰 SURCHARGE', 'bagage trop lourd'], ['refuse', 'no', '⛔ REFUSER', 'mauvais vol']];
        } else if (c.kind === 'security') {
          title = '🛃 Controle de surete';
          rule = 'Regarde le plateau. Couteau, ciseaux, petards, marteau ou grande bouteille : on confisque !';
          body = who + card('PLATEAU (SCANNER)', `<div class="chk-tray">${pax.tray.map(e => `<span>${e}</span>`).join('')}</div>` +
                 `<div class="ref" style="text-align:center;margin-top:.3rem">Interdit : 🔪 ✂️ 🧨 🍾 🔨</div>`, 'wide');
          btns = [['pass', 'ok', '✅ PASSER', 'rien d\'interdit'], ['seize', 'no', '🚫 CONFISQUER', 'objet interdit']];
        } else {
          title = '📲 Porte d\'embarquement';
          rule = `Scanne la carte (vol ${TODAY.flight}). Lis les notes : elles t'aident a rattraper une erreur d'avant !`;
          const notes = gateNotes(pax);
          body = who + card('CARTE D\'EMBARQUEMENT', `<div class="big">${pax.name}</div><div>Vol : <b>${pax.passFlight}</b> · place ${pax.seat}</div>` +
                 `<div class="ref">Ici : ${TODAY.flight} · ${TODAY.gate} · ${TODAY.dest}</div>`, 'wide') +
                 (notes.length ? card('NOTES DU HALL', notes.map(n => `<div class="chk-note">${n.icon} ${n.text}</div>`).join(''), 'wide') : '');
          btns = [['scan', 'ok', '📲 SCANNER', 'carte valide'], ['fee', 'fee', '💰 SURCHARGE', 'bagage trop lourd'],
                  ['refuse', 'no', '⛔ REFUSER', 'mauvais vol ou detecteur']];
        }
        $('chkTitle').textContent = title;
        $('chkRule').textContent = rule;
        $('chkBody').innerHTML = body;
        this._chkChoices = btns.map(b => b[0]);
        $('chkButtons').innerHTML = btns.map(([ch, cls, lbl, sub], i) =>
          `<button class="chk-btn ${cls}" data-choice="${ch}">${lbl}<small>${sub}${IS_TOUCH ? '' : ' · touche ' + (i + 1)}</small></button>`).join('');
        $('chkButtons').querySelectorAll('[data-choice]').forEach(b =>
          b.addEventListener('click', () => this.decideCheck(b.dataset.choice)));
      }

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
          if (res.fee) this.toast(`💰 Surcharge : +${res.fee} €`, 1400, 'ok');
        } else {
          sfx.oops();
        }
        this._chkTimer = setTimeout(() => { this._chkBusy = false; this.renderCheck(); }, res.ok ? 750 : 1900);
      }

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
        this.flash('Aux commandes. Relachez le frein et roulez vers la piste 36.', 4500);
      }

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
      }

  /* Atelier en Arcade : une barre de sante et un gros bouton REPARER. */
  refreshStationPanelKid() {
    const st = STATIONS.find(s => s.key === this.currentStation);
    $('stationSub').textContent = 'Appuie sur REPARER, puis tape au bon moment !';
    $('stationWo').textContent = '';
    $('stationList').innerHTML = st.components.map(key => {
      const c = this.mechanic.components[key];
      const hp = clamp(Math.round(100 - c.wear), 0, 100);
      const color = hp < 40 ? '#f87171' : hp < 70 ? '#fbbf24' : '#34d399';
      return `<div class="station-row kid">
        <div style="flex:1;min-width:0">
          <div class="nm">${c.label}</div>
          <div class="hp-bar"><div class="hp-fill" style="width:${hp}%;background:${color}"></div></div>
          <div class="station-wear">Sante : ${hp}%</div>
        </div>
        <button class="station-repair-btn" data-repair="${key}" ${hp >= 92 ? 'disabled' : ''}>${hp >= 92 ? '✅ Parfait' : '🔧 REPARER'}</button>
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
  }

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
          <div class="station-wear">Piece : ${part ? part.label : '—'} <span class="${stock > 0 ? 'text-emerald-400' : 'text-red-400'}">(stock ${stock})</span></div>
        </div>
        <button class="station-repair-btn" data-repair="${key}">Reparer</button>
      </div>`;
    }).join('');
    $('stationList').innerHTML = rows;
    $('stationWo').textContent = `${this.mechanic.openWorkOrders().length} ordre(s)`;
    $('stationSub').textContent = this.mechanic.needsMaintenance()
      ? 'Des composants depassent leur seuil critique : intervention obligatoire avant le vol.'
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
        if (!res) { this.toast('Tresorerie insuffisante pour cette piece.', 2000, 'err'); return; }
        this.tycoon.cash -= res.cost;
        this.tycoon.save();
        this.toast(`${PARTS[p].label} achete (${res.cost.toLocaleString('fr-FR')} EUR).`, 2000);
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
  }

  /* Mini-jeu de reparation en trois etapes : serrage au couple,
     remplissage du circuit, puis controle final. La moyenne des trois
     notes determine la qualite de l'intervention (voir
     MechanicSystem.repair) et donc ce qui est reellement remis a niveau. */
  async playMinigame(componentKey, label) {
    const modal = $('minigame');
    const comp = this.mechanic.components[componentKey];
    const hasFluid = comp.fluid != null;
    const steps = this.arcade.on ? [
      { name: 'Visse la piece', hint: 'Tape quand la barre blanche passe dans le vert !', speed: 1.2, width: 38 }
    ] : [
      { name: 'Serrage au couple', hint: 'Tapez quand le repere passe dans la zone verte', speed: 1.6, width: 22 },
      { name: hasFluid ? 'Mise a niveau du circuit' : 'Controle d\'usure',
        hint: hasFluid ? 'Remplissez jusqu\'au repere — visez le centre' : 'Verifiez l\'epaisseur restante',
        speed: 2.1, width: 18 },
      { name: 'Controle final', hint: 'Derniere verification avant remise en service', speed: 2.7, width: 14 }
    ];

    $('mgTitle').textContent = this.arcade.on ? '🔧 Repare !' : 'Serrage au couple';
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
      $('mgStep').textContent = steps.length === 1 ? step.name : `Etape ${round + 1}/${steps.length} — ${step.name}`;
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
        const bits = [`Qualite ${avg.toFixed(0)}%`, `usure ${res.wear.toFixed(0)}%`];
    if (res.fluid != null) bits.push(`fluide ${res.fluid.toFixed(0)}%`);
    if (res.torque != null) bits.push(`couple ${res.torque.toFixed(0)}%`);
    if (!res.usedPart) bits.push('sans piece neuve (qualite reduite)');
    $('mgResult').textContent = bits.join(' · ');
    $('mgTapBtn').textContent = 'CONTINUER';
    if (this.arcade.on) {
      $('mgResult').textContent = rawAvg >= 85 ? 'PARFAIT ! 🌟' : rawAvg >= 55 ? 'Bien joue !' : 'Repare, mais essaie plus precis !';
      this.arcade.giveCoins(3 + Math.round(rawAvg / 25), { label: 'Reparation !' });
      this.arcade.event('repair');
    }

    await new Promise(resolve => {
      $('mgTapBtn').onclick = () => resolve();
    });
    $('mgTapBtn').onclick = null;
    modal.classList.add('hidden');
    this._worldPaused = false;
  }

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
  }

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
      ? 'Avance dans l\'allee et sers les passagers qui ont une bulle. Porte SORTIE a gauche, COCKPIT tout devant !'
      : 'Servez les passagers dans l\'allee. Rechargez le chariot au galley (avant) et vendez le duty-free a l\'entree.';
  }

  /* Sortie par la porte : on reparait sur le seuil, cote passerelle. */
  exitCabinByDoor() {
    const w = this.nav.toWorld('aircraft', -3.2, -6.0);
    const pos = new THREE.Vector3(w.x, 0, w.z);
    this.goToHub({ pos, heading: 0 });
    this.toast('🚪 Tu descends de l\'avion.', 1800);
  }

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

    if (!this._worldPaused) cabin.update(dt);
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
      if (Math.abs(rz - att.z) < 1.7) near = { kind: 'unruly', label: 'GERER L\'INCIDENT' };
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
  }

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
        this.toast('Consigne ceintures active : le passager n\'a pas apprecie.', 2200, 'warn');
      } else {
        if (this.arcade.on) {
          this.arcade.cabinServed(req);
        } else this.toast(`Passager servi (+${res.gain.toFixed(1)}% satisfaction)`, 1800);
      }
    } else if (near.kind === 'cart') {
      const amount = this.cabin.sellDutyFree();
      if (this.arcade.on) this.arcade.giveCoins(3, { label: 'Vente !' });
      else this.toast(`Vente duty-free : +${amount} EUR`, 1800);
    } else if (near.kind === 'galley') {
      const added = this.cabin.restockCart();
      this.toast(added > 0 ? `Chariot recharge (+${added} unites).` : 'Le chariot est deja plein.', 1800);
    } else if (near.kind === 'unruly') {
      $('unrulyPanel').classList.remove('hidden');
    } else if (near.kind === 'door') {
      this.exitCabinByDoor();
    } else if (near.kind === 'cockpit') {
      this.boardAircraft();
    }
  }

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
  }

  /* ========================================================== */
  /* ITERATION 4 — Gestion de l'aeroport (tycoon)                 */
  /* ========================================================== */
  openTycoonPanel() {
    if (this.arcade.on) { this.openKidTower(); return; }
    this.refreshTycoonPanel();
    $('tycoonPanel').classList.remove('hidden');
      this._worldPaused = true;
    }

  refreshTycoonPanel() {
    const ty = this.tycoon;

    const cashEl = $('tyCash');
    cashEl.textContent = Math.round(ty.cash).toLocaleString('fr-FR') + ' EUR';
    cashEl.className = ty.cash < 0 ? 'tycoon-stat-val text-red-400' : 'tycoon-stat-val';
    $('tyRep').textContent = ty.reputation.toFixed(0) + '%';
    $('tyFlights').textContent = ty.flightsCompleted;

    $('tyPrice').textContent = ty.ticketPrice + ' EUR';
    $('tyPax').textContent = `≈ ${ty.paxPerFlight} passagers / vol`;
    /* Jauge de demande : repere visuel du volume de passagers attire par
       le prix et la reputation actuels, sur une echelle nominale large. */
    const paxPct = clamp(ty.paxPerFlight / 300, 0, 1);
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
        const res = this.missions.evaluate(ctx);
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
  }

  /* ========================================================== */
  start() {
    sfx.unlock();
    $('boot').classList.add('hidden');
    if (this.arcade.on) this.arcade.seedWear();
    this.placeAircraftAtGate();
    this.hangar.applyAll();
    this.deco.restore();
    this.fun.checkStreak();
    /* Les PNJ n'entrent en scene qu'ici : la pose de l'appareil est
       desormais publiee, leurs postes sont projetables. */
    this.agents.begin();
    /* Le hall est preconstruit (donc masque) : ses passagers font partie
       du monde des le depart, sans attendre une premiere visite. */
    this.r3d.prebuildTerminal(COUNTERS);
    /* Vent et turbulence du moment, donnes par la meteo (phase 7) */
        const wv = this.env.windVector();
        this.ac.wind.set(wv.x, wv.y, wv.z);
        this.ac.turbulence = this.env.turbulence;
        const gate = this.r3d.gatePosition;
    /* Cap -PI/2 (vers l'ouest) : l'espace est libre devant le joueur. Avec le cap 0 il
       faisait face au fuselage et « avancer » ne le deplacait pas d'un metre. */
    this.goToHub({ pos: new THREE.Vector3(gate.x - 16, 0, gate.z - 22), heading: -Math.PI / 2 });
    this.lastFrame = performance.now();
  }

  resetFlight() {
    /* l'helicoptere part de l'helipad, les avions du bout de la piste */
    const start = this.ac.heli ? new THREE.Vector3(HELIPAD.x, this.ac.groundY, HELIPAD.z) : new THREE.Vector3(0, this.ac.groundY, RUNWAY.startZ - 120);
    this.ac.reset({
      pos: start,
      heading: 0, speed: 0, flaps: 1, gear: true, fuel: planeOf(this.ac.profile).fuel
    });
    this._activeFaultComponents.clear();
    /* Vent et turbulence du moment, donnes par la meteo (phase 7) */
        const wv = this.env.windVector();
        this.ac.wind.set(wv.x, wv.y, wv.z);
        this.ac.turbulence = this.env.turbulence;
        this.controls.setThrottle(0);
    this.phase = 'PARKING';
    this.reportShown = false;
    this.tdTimer = 0;
            this.beginFlightLog();
            $('report').classList.add('hidden');
            this.flash('Aligne piste 36. Poussee decollage quand vous etes pret.', 5000);
          }

  /* ========================================================== */
    /* PHASE 12 — journal de vol, pannes, contrat en cours        */
    /* ========================================================== */

    /* Une reparation annule la panne que le composant avait causee.
       Le composant repare est remis dans le vert, donc le facteur de
       panne correspondant est retire du modele de vol.

       `ac.faults` agrege plusieurs composants par `kind` (tyresNose et
       tyresMain partagent 'tyre', struts et airframe partagent 'drag') :
       remettre bêtement `faults.pull = 0` effacerait aussi la panne encore
       active de l'autre composant si les deux avaient lache le meme vol.
       On recalcule donc tout l'etat de panne a partir des composants
       encore effectivement en defaut, plutot que d'annuler un `kind`
       entier au premier repare. */
    clearFaultFor(componentKey) {
      const f = FAILURES[componentKey];
      if (!f) return;
      const c = this.mechanic.components[componentKey];
      /* On ne leve la panne que si le composant est effectivement
         revenu dans le vert : une reparation baclee laisse l'appareil
         en etat de vol degrade. */
      const ok = c && c.wear < c.critical * 0.55
        && (c.fluid == null || c.fluid > 55)
        && (c.torque == null || c.torque > 55);
      if (!ok) return;
      if (!this._activeFaultComponents.has(componentKey)) return;
      this._activeFaultComponents.delete(componentKey);
      this.ac.clearFaults();
      for (const key of this._activeFaultComponents) {
        const ff = FAILURES[key];
        if (ff) this.ac.applyFault(ff.kind);
      }
      this.mechanic.releasedToService = !this.mechanic.needsMaintenance();
      this.toast(`${c.label} remis en etat — panne levee.`, 3000, 'ok');
    }

    /* Remet le journal a zero. Appele a chaque nouveau vol. */
    beginFlightLog() {
      this.flightLog = {
        t0: this.time,
        duration: 0,
        maxAlt: 0,
        fuelStart: this.ac.fuel,
        fuelUsed: 0,
        night: false,
        crosswind: 0,
        windSpeed: 0,
        worstWear: 0,
        faults: [],
        armed: false
      };
      this.faultAlert = null;
      this.faultAlertUntil = 0;
    }

    /* Contexte du contrat : melange le journal de vol, le poser et
       l'etat de l'appareil. C'est l'objet unique que missions.js
       evalue, et il sert aussi au bandeau HUD. */
    missionContext() {
      const l = this.flightLog || {};
      const t = this.ac.touchdown;
      const worst = Object.values(this.mechanic.components)
        .sort((a, b) => b.wear - a.wear)[0];
      return {
        pax: this.tycoon.paxPerFlight,
        fpm: t ? t.fpm : 9999,
        offset: t ? Math.abs(t.offset) : 999,
        bank: t ? Math.abs(t.bank) : 99,
        duration: l.duration || 0,
        maxAlt: l.maxAlt || 0,
        fuelUsed: l.fuelUsed || 0,
        night: !!l.night,
        crosswind: l.crosswind || 0,
        windSpeed: l.windSpeed || 0,
        worstWear: worst ? worst.wear : 0
      };
    }

    /* ----------------------------------------------------------
       Boucle de vol (phase 12).

       Tient le journal, declenche le tirage de pannes au decollage,
       et surveille les pannes actives pour l'alerte.
       ---------------------------------------------------------- */
    updatePilot(dt) {
      const ac = this.ac;
      const l = this.flightLog;
      if (!l) return;

      /* Le journal ne court qu'a partir du moment ou l'appareil quitte
         le sol : le roulage ne compte ni dans la duree ni dans le
         carburant brule du contrat. */
      if (!ac.onGround) {
        if (!l.armed) {
          l.armed = true;
          l.t0 = this.time;
          l.fuelStart = ac.fuel;
          if (this.arcade.on) { this.arcade.event('takeoff'); sfx.whoosh(); }
          else this.rollFaults();
        }
        l.duration = this.time - l.t0;
        l.maxAlt = Math.max(l.maxAlt, ac.pos.y * FT);
        l.fuelUsed = Math.max(0, l.fuelStart - ac.fuel);
        if (this.env.night > 0.5) l.night = true;

        /* Vent de travers : composante perpendiculaire a l'axe de
           piste (piste 36, donc axe nord-sud). */
        const w = ac.wind;
        l.windSpeed = Math.hypot(w.x, w.z);
        l.crosswind = Math.abs(w.x);
      }

      /* Alerte de panne : elle reste affichee quelques secondes. */
      if (this.faultAlert && this.time > this.faultAlertUntil) this.faultAlert = null;
    }

    /* ----------------------------------------------------------
       Tirage des pannes au decollage.

       Le risque vient de l'etat reel de l'appareil. Un appareil
       entretenu ne lache jamais ; un appareil dont trois composants
       ont depasse leur seuil lache presque a chaque vol. La panne
       est appliquee au modele de vol et aggrave le composant, donc
       il faut passer a l'atelier avant de repartir.
       ---------------------------------------------------------- */
    rollFaults() {
      const list = this.mechanic.rollFailures();
      if (!list.length) return;
      for (const f of list) {
        this.ac.applyFault(f.kind);
        this.mechanic.registerFailure(f.key);
        this._activeFaultComponents.add(f.key);
        this.flightLog.faults.push(f.label);
      }
      const first = list[0];
      this.faultAlert = list.length > 1
        ? `${first.alert} (+${list.length - 1} autre panne)`
        : first.alert;
      this.faultAlertUntil = this.time + 9;
      this.toast(`PANNE EN VOL — ${list.map(f => f.label).join(', ')}.`, 6000, 'err');
      this.r3d.applyWearVisuals(this.mechanic);
    }

    /* ========================================================== */
    updatePhase() {
    const ac = this.ac;
    const kt = ac.ias * KTS;
    const altFt = ac.pos.y * FT;
    const prev = this.phase;

    if (ac.onGround) {
      if (kt < 1.5) this.phase = ac.touchdown ? 'PARKING' : 'PARKING';
      else if (kt < 60) this.phase = ac.touchdown ? 'FREINAGE' : 'ROULAGE';
      else this.phase = ac.touchdown ? 'FREINAGE' : 'DECOLLAGE';
    } else {
      if (altFt < 1500 && ac.vsi > 1) this.phase = 'MONTEE';
      else if (ac.gearDown || (altFt < 3000 && ac.vsi < -1)) this.phase = 'APPROCHE';
      else if (ac.vsi < -2.5) this.phase = 'DESCENTE';
      else this.phase = 'CROISIERE';
    }

    /* Conseils contextuels de procedure */
    if (this.time > (this.hintUntil || 0)) {
      const vr = ac.vRotate() * KTS, vref = ac.vRef() * KTS;
      if (this.phase === 'PARKING' && kt < 2) {
        this.hint = 'Relachez le frein et roulez vers la piste 36, puis poussee decollage une fois aligne';
      } else if (this.phase === 'DECOLLAGE' && kt < vr) {
        this.hint = `Vr ${vr.toFixed(0)} kt — tirez le manche a la rotation`;
      } else if (this.phase === 'MONTEE') {
        this.hint = ac.gearDown ? 'Rentrez le train (GEAR)' :
          (ac.flapIndex > 0 ? 'Rentrez les volets progressivement' : 'Montez a 250 kt, assiette 12 deg');
      } else if (this.phase === 'CROISIERE') {
        this.hint = 'Croisiere stable — surveillez le carburant';
      } else if (this.phase === 'APPROCHE') {
        this.hint = `Vref ${vref.toFixed(0)} kt — train sorti, volets FULL, -700 fpm`;
      } else if (this.phase === 'FREINAGE') {
        this.hint = 'Spoilers + inverseurs + freins';
      } else this.hint = '';
    }

    if (this.arcade.on) this.hint = this.assist.hint || '';
    if (prev !== this.phase && this.phase === 'DECOLLAGE') this.ac.parkBrake = false;
  }

  /* ========================================================== */
  checkLanding() {
    const ac = this.ac;
    if (!ac.touchdown || this.reportShown) return;
    this.tdTimer += this.dt;
    /* Arcade : on attend l'arret complet (vitesse sol : par vent, la vitesse
       air ne tombe jamais a zero). */
    const stopped = this.arcade.on
      ? Math.hypot(ac.vel.x, ac.vel.z) * KTS < 5
      : ac.ias * KTS < 35;
    if (this.tdTimer > (this.arcade.on ? 40 : 5) || stopped) {
      this.showReport();
      this.reportShown = true;
    }
  }

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
    this.cabin.registerFlight(this.ac);
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
        const net = flightResult.profit + (mission.ok ? mission.reward : 0) - crashBill;
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
      }

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
  }

  /* Adapte l'interface a la vue de pilotage courante. */
  updatePilotViewUI() {
    document.body.classList.toggle('view-cockpit', this.r3d.cameraMode === 'cockpit');
  }

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
  }

  /* ========================================================== */
  loop() {
    const now = performance.now();
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    dt = Math.min(dt, 0.05);
    this.rawDt = dt;
    dt *= this.fun.timeScale;         // ralenti sur l'atterrissage parfait
    this.dt = dt;
    this.time += dt;
    if (this._bodyState !== this.state) { this._bodyState = this.state; document.body.dataset.state = this.state; }

    /* La pose de l'appareil est publiee au graphe AVANT la repartition
       par etat : ainsi les zones `frame: 'aircraft'` sont valides meme
       en CABIN ou TERMINAL, ou syncAircraft n'est pas appele. */
    this.nav.setFrame('aircraft', this.ac.pos, this.ac.quat);

    /* Les PNJ vivent independamment de l'etat du joueur : ils sont
       simules avant la repartition par etat, avec le point d'interet
       courant pour l'abaissement de frequence au loin. */
    const ref = this.state === 'HUB' ? this.player.pos : this.ac.pos;
    this.agents.update(dt, ref.x, ref.z);

    /* ---- 1. LE MONDE TOURNE, quel que soit l'etat du joueur ----
           Usure, files du terminal, service cabine, revenu de flotte :
           tout cela avance avant meme de savoir qui controle l'appareil.
           C'est ce qui rend l'autonomie reelle — le terminal continue de
           se remplir pendant qu'on pilote. */
        this.worldUpdate(dt);

        /* ---- 1b. L'ENVIRONNEMENT s'applique a la scene ----
           Ciel, soleil, lune, brouillard, nuages, pluie et feux de
           piste. Fait avant les cameras : updateCamera() etend
           ensuite le brouillard avec l'altitude, a partir de la base
           posee ici. */
        this.r3d.applyEnvironment(this.env, dt);
        this.updateEnvChip();
        this.arcade.update(dt);
        /* Les couches « fun » ne doivent jamais figer le jeu : une erreur y est notee une fois. */
        for (const m of [this.fun, this.sky, this.ground, this.deco, this.openWorld, this.comfort, this.rides]) {
          try { m.update(dt); } catch (err) {
            if (!m._errLogged) { m._errLogged = true; console.error('Erreur dans ' + m.constructor.name + '.update', err); }
          }
        }

        /* L'aeroport vit : vehicules, avions, helicoptere, voyageurs. Les operations sur la
           piste s'arretent des que le joueur prend l'avion (jamais deux appareils au meme endroit). */
        if (this.r3d.life) {
          const gate = this.r3d.gatePosition;
          const acAtGate = this.ac.onGround && Math.hypot(this.ac.pos.x - gate.x, this.ac.pos.z - gate.z) < 30;
          const pl = this.state === 'HUB' ? this.player.pos : null;
          const wv = this.env.windVector();
          const life = this.r3d.life;
          life.update(dt, this.time, {
            state: this.state,
            player: pl ? { x: pl.x, z: pl.z } : null,
            acAtGate,
            runwayFree: this.state !== 'PILOT' && acAtGate,
            wind: { x: wv.x, z: wv.z },
            bagsWaiting: this.terminal.counters.baggage.queue,
            bagsLoaded: this.terminal.stats.bags,
            lightsOn: this.r3d._lightsOn === true
          });
          /* L'obstacle de l'avion du poste 2 n'existe que tant qu'il y est. */
          const stand = this.nav.blockers.find(b => b.id === 'staticAircraft');
          if (stand) stand.disabled = !life.airAtStand;
        }

        /* ---- 2. PUIS le controleur de l'etat actif prend la main ---- */
        if (this.state === 'PILOT') {
          let c = this.controls.update(dt);
          /* Arcade : l'aide au pilotage transforme les entrees du joueur. */
          if (this.arcade.on) c = this.assist.update(this.ac, c, dt);
      this.ac.ctl.pitch = c.pitch;
      this.ac.ctl.roll = c.roll;
      this.ac.ctl.yaw = c.yaw;
      this.ac.ctl.throttle = c.throttle;
      this.ac.ctl.brake = c.brake;

      /* Acrobatie en cours : animation cinematique, la physique attend. */
      if (!(this.arcade.on && this.fun.stepStunt(dt))) this.ac.update(dt, this.time);
      /* Arcade : les obstacles du decor font rebondir l'avion, jamais le detruire. */
      if (this.arcade.on) {
        const hit = bounceOffScenery(this.ac, this.nav.blockers);
        if (hit && this.time - (this._lastBounce || -9) > 4) {
          this._lastBounce = this.time;
          this.toast(`Oups, ${hit.label} ! Reste plus haut ou contourne-le.`, 2600, 'warn');
        }
      }
              this.updatePilot(dt);
              this.updatePhase();
              this.checkLanding();
              this.updateHUD();
              if (this.arcade.on) { this.arcade.updateRings(dt); this.updateArcadePilotUI(); }
            } else if (this.state === 'HUB') {
      if (!this.hangar.active) this.updateHub(dt);
    } else if (this.state === 'CABIN') {
      this.updateCabin(dt);
    }

    /* Le hall s'anime et s'eclaire selon la distance du point d'interet
       (le joueur a pied, sinon l'appareil). */
    this.r3d.updateTerminalScene(this.terminal, ref, dt, this.time);

    if (this.state !== 'CABIN') this.r3d.syncAircraft(this.ac, dt, this.time);
    if (this.hangar.active) { this.hangar.placePreview(); this.r3d._shadowFocus = this.r3d.gatePosition; this.hangar.updateCamera(this.r3d.camera, dt); }
    else if (this.state === 'HUB') this.r3d.updateHubCamera(this.player, dt);
    else if (this.state === 'CABIN') this.r3d.updateCabinCamera(this.attendant, dt);
    else this.r3d.updateCamera(this.ac, dt);
    this.r3d.render();
    try { this.fun.afterRender(); } catch (err) { console.error(err); }
    perfHud.tick(this.r3d.renderer, this.r3d.scene);

    requestAnimationFrame(() => this.loop());
  }
}

/* ============================================================ */
window.addEventListener('load', () => {
  const fill = $('bootFill');
  const bar = $('bootBar');
  if (fill) fill.style.width = '55%';
  try {
    const game = new Game();
    window.__game = game;      // debug console
    iconify(document.body);    // emojis -> icones SVG (js/icons.js)
    if (fill) fill.style.width = '100%';
    if (bar) bar.classList.add('done');
    $('bootMsg').textContent = 'Systemes prets.';
    $('btnStart').classList.remove('hidden');
    $('btnFlyNow').classList.remove('hidden');
    $('btnHangar').classList.remove('hidden');
    $('pilotCard').classList.remove('hidden');
    $('modePick').classList.remove('hidden');
    game.loop();
  } catch (err) {
    if (bar) bar.classList.add('done');
    $('bootMsg').innerHTML =
      `<span class="text-red-400">Erreur d'initialisation :</span><br><span class="text-xs">${err.message}</span>`;
    console.error(err);
  }
});
