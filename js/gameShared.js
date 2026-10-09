/* ============================================================
   gameShared.js — constantes et petits utilitaires partages
   (decoupe de main.js : comportement identique, voir tools/splitClass.mjs)
   ============================================================ */

import { STATIONS } from './mechanicSystem.js?v=1791556299';

export const $ = (id) => document.getElementById(id);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* Vitesse de rotation du joueur au sol (rad/s), voir updateHub/updateTerminal.
   Deplacement "commun" a la troisieme personne : gauche/droite tournent
   en continu tant que la touche est maintenue (pas d'angle cible fixe
   a atteindre), haut/bas avancent/reculent selon le cap courant. Avant
   ce correctif, le jeu visait un angle absolu calcule une seule fois par
   pression, pivotait pour s'y aligner (avec un large virage en cas de
   demi-tour) puis marchait tout droit -- tenir "droite" n'avait alors
   plus d'effet une fois l'angle atteint, ce qui ne correspond au
   comportement d'aucun jeu a la troisieme personne usuel. */
export const PLAYER_TURN_SPEED = 2.8;

/* Detection tactile vs souris/clavier : conditionne le texte d'accueil,
   le plein ecran automatique et l'affichage des rappels clavier PC. */
export const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

export const HUB_WALK_SPEED = 5.2;

/* Points d'interaction combinant les postes de maintenance (iteration 2)
   et les nouveaux acces "monter aux commandes" / "embarquer" / "gestion",
   qui remplacent le menu de role : on s'en approche pour agir.
   frame 'aircraft' : offset local qui suit l'appareil partout.
   frame 'world'    : coordonnees fixes (batiment). */
export const HOTSPOTS = [
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
  export const CONTROL_ROLES = ['mechanic', 'ramp'];

export const CONTROL_RADIUS = 4.5;

export const CONTROL_SPEED = { mechanic: 3.6, ramp: 3.8 };

export const CONTROL_LABEL = { mechanic: 'MECANICIEN', ramp: 'AGENT DE PISTE' };

/* Boutons contextuels du monde libre, en mots simples (mode Arcade). */
export const ARCADE_LABEL = {
  mechanic: (h) => `🔧 REPARER : ${h.label.toUpperCase()}`,
  cockpit: () => '✈️ MONTER DANS L\'AVION',
  cabin: () => '🥤 SERVIR EN CABINE',
  tower: () => '🗼 MA TOUR DE CONTROLE',
  game: (h) => h.game === 'wash' ? '🧽 LAVER L\'AVION' : '⛽ FAIRE LE PLEIN',
  terminal: () => '🏢 ENTRER DANS LE TERMINAL'
};

