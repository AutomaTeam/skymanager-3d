/* ============================================================
   main.js — Boucle principale et machine a etats
   Etats : HUB (monde libre, tarmac) | PILOT (vol) | CABIN
   Plus de menu de selection de role : le joueur se deplace
   librement autour de l'aeroport et de l'appareil (ou qu'il se
   trouve) et declenche chaque activite en s'en approchant —
   monter aux commandes, embarquer en cabine, inspecter un poste
   de maintenance, entrer au bureau d'exploitation pour la gestion.
   ============================================================ */

import { bounceOffScenery } from './sceneryCollision.js?v=1791470927';
import { collectBodies } from './bodies.js?v=1791470927';
import * as THREE from 'three';
import { Jobs } from './jobs.js?v=1791470927';
import { Replay } from './replay.js?v=1791470927';
import { FuelTruck, Sweeper, Stairs } from './groundVehicles.js?v=1791470927';
import { Hunt } from './hunt.js?v=1791470927';
import { Seasonal } from './seasonal.js?v=1791470927';
import { Thermals } from './thermals.js?v=1791470927';
import { ModuleRegistry } from './registry.js?v=1791470927';
import { Voice } from './voice.js?v=1791470927';
import { GamepadInput } from './gamepadInput.js?v=1791470927';
import { Renderer3D, RUNWAY } from './renderer3d.js?v=1791470927';
import { Aircraft, KTS, FT } from './flightPhysics.js?v=1791470927';
import { TouchControls } from './touchControls.js?v=1791470927';
import { WalkJoystick } from './mechanicControls.js?v=1791470927';
import { CabinService } from './cabinService.js?v=1791470927';
import { MechanicSystem, FAILURES } from './mechanicSystem.js?v=1791470927';
import { AirportTycoon, KID_FLEET_PER_MIN } from './airportTycoon.js?v=1791470927';
import { TerminalSystem, COUNTERS } from './terminalSystem.js?v=1791470927';
import { Navigation } from './navigation.js?v=1791470927';
import { AgentSystem } from './agents.js?v=1791470927';
import { Environment } from './environment.js?v=1791470927';
import { MissionSystem } from './missions.js?v=1791470927';
import { Staff } from './staff.js?v=1791470927';
import { History } from './history.js?v=1791470927';
import { Hub } from './hub.js?v=1791470927';
import { Arcade } from './arcade.js?v=1791470927';
import { FlightAssist } from './flightAssist.js?v=1791470927';
import { Fun } from './fun.js?v=1791470927';
import { Hangar } from './hangar.js?v=1791470927';
import { SkyMissions } from './skyMissions.js?v=1791470927';
import { MiniGames } from './minigames.js?v=1791470927';
import { GroundFun } from './groundFun.js?v=1791470927';
import { Pet } from './pet.js?v=1791470927';
import { Social } from './social.js?v=1791470927';
import { Tug } from './tug.js?v=1791470927';
import { FireTruck } from './fireTruck.js?v=1791470927';
import { Ambience } from './ambience.js?v=1791470927';
import { Bus } from './bus.js?v=1791470927';
import { Look } from './look.js?v=1791470927';
import { Deco } from './deco.js?v=1791470927';
import { Album } from './album.js?v=1791470927';
import { OpenWorld } from './openWorld.js?v=1791470927';
import { Comfort } from './comfort.js?v=1791470927';
import { Rides } from './rides.js?v=1791470927';
import { planeOf } from './fleet.js?v=1791470927';
import { HELIPAD } from './heliModel.js?v=1791470927';
import { sfx } from './sfx.js?v=1791470927';
import { perfHud } from './perfHud.js?v=1791470927';
import { iconify } from './icons.js?v=1791470927';
import { hudMethods } from './hudController.js?v=1791470927';
import { pauseMethods } from './pauseMenu.js?v=1791470927';
import { hubMethods } from './hubUpdate.js?v=1791470927';
import { $, IS_TOUCH, HOTSPOTS } from './gameShared.js?v=1791470927';


   // m/s — releve pour rendre le grand plan praticable


  
  
  
  


/* Ameliorations de la tour, en mots simples (mode Arcade). */
const KID_UPGRADE = {
  runways:   { ico: '🛣️', name: 'Nouvelle piste',     desc: '+12 passagers a chaque vol.' },
  gates:     { ico: '🚪', name: 'Nouvelle porte',      desc: 'Pour accueillir un avion de plus.' },
  terminals: { ico: '🏢', name: 'Grand terminal',      desc: '+10 passagers et plus de pieces a chaque vol.' },
  shops:     { ico: '🛍️', name: 'Boutique',            desc: 'Plus de pieces a chaque vol.' },
  vipLounge: { ico: '👑', name: 'Salon VIP',           desc: '+10 passagers : ils adorent ton aeroport !' }
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
    /* Planeur (G01) : largage de la remorque, et rappel en finale si on se retrouve trop bas. */
    this.assist.onRelease = () => { sfx.whoosh(); this.toast('🪂 Remorque larguee ! Maintenant tu planes en silence.', 3600, 'ok'); this.fun.say('Cherche les oiseaux qui tournent : l\'air monte dessous !', 2, 4200); };
    this.assist.onLowGlider = () => { this.toast('🛬 Presque au sol ! Je te ramene en finale.', 3000, 'ok'); this.helpLanding(); };
    this.voice = new Voice();
    this.fun = new Fun(this);
    this.hangar = new Hangar(this);
    this.sky = new SkyMissions(this);
    this.minigames = new MiniGames(this);
    this.ground = new GroundFun(this);
    this.modules = new ModuleRegistry(this);     // modules a mise a jour continue (js/registry.js)
    this.modules.add('jobs', new Jobs(this));                // metiers a la journee (H04)
    this.modules.add('replay', new Replay(this));            // revoir les 20 dernieres secondes (G07)
    this.modules.add('hunt', new Hunt(this));               // cache-cache : les Coco de la semaine
    this.modules.add('seasonal', new Seasonal(this));       // Halloween, Noel (date reelle)
    this.modules.add('thermals', new Thermals(this));   // ascendances du planeur
    this.modules.add('pet', new Pet(this));      // Biscuit, le chien de compagnie
    this.social = new Social(this);     // dire bonjour aux gens, caresser Biscuit
    this.tug = new Tug(this);           // conduire le tracteur a bagages
    this.fire = new FireTruck(this);    // au feu les pompiers !
    this.modules.add('bus', new Bus(this));      // conduire le bus des passagers
    this.modules.add('fuelTruck', new FuelTruck(this));      // camion avitailleur (H03)
    this.modules.add('sweeper', new Sweeper(this));          // balayeuse de piste
    this.modules.add('stairs', new Stairs(this));            // escalier mobile
    this.vehicles = [this.fire, this.tug, this.bus, this.fuelTruck, this.sweeper, this.stairs];
    this.modules.add('ambience', new Ambience(this));   // spotteurs et pigeons
    this.look = new Look(this);          // apparence de l'avatar
    this.deco = new Deco(this);
    this.album = new Album(this);
    this.openWorld = new OpenWorld(this);
    this.comfort = new Comfort(this);
    this.gamepad = new GamepadInput(this);
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
    /* Les PNJ contournent le joueur et les autres personnes (js/bodies.js). */
    this.agents.bodyProvider = () => collectBodies(this, { player: true });

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
  /* Vehicule que l'enfant conduit (ou null). */
  get driving() { return this.vehicles ? this.vehicles.find(v => v.active) || null : null; }

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
    /* Planeur : on le replace plus pres de la piste (3,3 km) et plus haut, sans moteur il ne porte pas aussi loin. */
    if (ac.glider) ac.pos.set((Math.random() - 0.5) * 120, 260, -3300);
    else ac.pos.set((Math.random() - 0.5) * 120, 225, -5500);
    ac.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI);   // cap 180
    ac.vel.set(0, 0, 0).addScaledVector(ac.forward(), ac.glider ? 29 : 78);
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
        /* Mode Pilote : la recette du hall (porte, commerces, surcharges, moins l'entretien) va
           dans la tresorerie. Avant, ce n'etait qu'un compteur affiche. (En Arcade, le hall paie en pieces.) */
        if (!this.arcade.on) {
          if (this._termRevSeen == null) this._termRevSeen = this.terminal.revenue;
          const d = this.terminal.revenue - this._termRevSeen;
          this._termRevSeen = this.terminal.revenue;
          if (d) { this.tycoon.cash += d; this._termRevAcc = (this._termRevAcc || 0) + d; }
        }
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
      if (!this.ac.onGround && this.state !== 'CABIN') this.cabin.update(step, true, true);

      /* Revenu passif de la flotte : les autres appareils volent pour
         nous. Credite une fois par minute de jeu, pas a chaque frame. */
      this._fleetAcc = (this._fleetAcc || 0) + step;
      if (this._fleetAcc >= 60) {
        this._fleetAcc -= 60;
        if (this.arcade.on) {
          /* Arcade : chaque avion achete a la tour rapporte quelques pieces par minute, et on le voit. */
          const n = (this.tycoon.fleet.length - 1) * KID_FLEET_PER_MIN;
          if (n > 0) {
            this.arcade.giveCoins(n, { silent: true });
            if (this.state === 'HUB') this.arcade.popup(`✈️ Tes avions ont vole : +${n} 🪙`);
          }
        } else {
          const gain = this.tycoon.creditPassiveFleet(60);
          if (gain > 0) this._fleetIncome = (this._fleetIncome || 0) + gain;
          this.tycoon.save();                 // recette du hall creditee au fil de l'eau
        }
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
      if (this._termRevAcc) parts.push(`Hall : ${this._termRevAcc >= 0 ? '+' : ''}${Math.round(this._termRevAcc).toLocaleString('fr-FR')} EUR`);
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
      this._termRevAcc = 0;
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

  /* ========================================================== */
  /* Une erreur dans une image ne doit jamais figer le jeu : la suivante est
     toujours programmee, et chaque message different n'est note qu'une fois. */
  /* Registre des erreurs attrapees : { 'Module: message': {module, message, count} }.
     Lisible depuis la console : __game.errors, ou __game.errorList(). */
  _noteError(module, err) {
    const msg = (err && err.message) || String(err);
    const key = module + ': ' + msg;
    this.errors = this.errors || {};
    const e = this.errors[key];
    if (e) { e.count++; return; }
    this.errors[key] = { module, message: msg, count: 1 };
    console.error('Erreur dans ' + module, err);
  }

  errorList() { return Object.values(this.errors || {}); }

  loop() {
    try { this._frame(); } catch (err) {
      this._noteError('boucle', err);
    }
    requestAnimationFrame(() => this.loop());
  }

  _frame() {
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
        this.gamepad.update();
        this.arcade.update(dt);
        /* Les couches « fun » ne doivent jamais figer le jeu : une erreur y est notee une fois. */
        for (const m of [this.fun, this.sky, this.ground, this.social, this.tug, this.fire, this.deco, this.openWorld, this.comfort, this.rides]) {
          try { m.update(dt); } catch (err) { this._noteError(m.constructor.name + '.update', err); }
        }
        this.modules.update(dt, (name, err) => this._noteError(name, err));   // pet, bus, ambience (registre)

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

      /* Acrobatie en cours : animation cinematique, la physique attend. Menu ouvert : l'avion est fige (pause). */
      if (!this._worldPaused && !(this.arcade.on && this.fun.stepStunt(dt))) this.ac.update(dt, this.time);
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
    else if (this.state === 'BOOT') this.r3d.updateTitleCamera(this.ac, dt);
    else if (this.state === 'HUB') this.r3d.updateHubCamera(this.player, dt);
    else if (this.state === 'CABIN') this.r3d.updateCabinCamera(this.attendant, dt);
    else this.r3d.updateCamera(this.ac, dt);
    this.r3d.render();
    try { this.fun.afterRender(); } catch (err) { console.error(err); }
    perfHud.tick(this.r3d.renderer, this.r3d.scene);
  }
}

/* Methodes deplacees dans des modules : js/hudController.js, js/pauseMenu.js, js/hubUpdate.js */
Object.assign(Game.prototype, hudMethods, pauseMethods, hubMethods);

/* ============================================================ */
window.addEventListener('load', () => {
  const fill = $('bootFill');
  const bar = $('bootBar');
  if (fill) fill.style.width = '55%';
  try {
    const t0 = performance.now();
    const game = new Game();
    window.__game = game;      // debug console
    window.__bootMs = Math.round(performance.now() - t0);     // D05 : duree de construction du jeu
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
    if (/[?&]fuzz(=|&|$)/.test(window.location.search)) import('../tools/fuzz.js');   // A07 : test aleatoire
    if (/[?&]scenario=/.test(window.location.search)) import('../tools/scenarios.js');   // C03
  } catch (err) {
    if (bar) bar.classList.add('done');
    $('bootMsg').innerHTML =
      `<span class="text-red-400">Erreur d'initialisation :</span><br><span class="text-xs">${err.message}</span>`;
    console.error(err);
  }
});
