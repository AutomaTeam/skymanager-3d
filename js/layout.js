/* ============================================================
   layout.js — Plan de l'aeroport (phase 18), une seule source

   Coordonnees monde (m). x vers l'est, z vers le sud ; la piste 36
   part du seuil (z = +1500) vers le nord (z = -1500).

   Organisation, d'ouest en est :
     piste (x 0) -- bretelles -- taxiway (x 150) -- aire de
     stationnement (x 120..540) -- hangars (x 510..570)
   et du nord au sud, cote aire : aire, terminal, route, parking.

   Le bloc terminal / porte / passerelle est FIGE : les comptoirs, la
   navigation et les PNJ en dependent (terminalSystem.js, navigation.js).
   La tour et son bureau sont a 100 m de la porte d'embarquement, pas
   derriere le terminal comme avant (250 m de marche).
   ============================================================ */

export const LAYOUT = {
  runway:   { x: 0, width: 45, zStart: 1500, zEnd: -1500 },
  taxiway:  { x: 150, width: 24, z0: -700, z1: 1500 },
  linkZ:    [1380, 1000, 400, -300],
  apron:    { x0: 120, x1: 540, z0: 870, z1: 1180 },
  gate:     { x: 366, z: 1168 },
  /* Terminal (phase 22) : batiment de 260 x 70 m, entierement praticable.
     Portes cote piste (z0) et cote ville (z1) ; `h` = hauteur des facades. */
  terminal: {
    x0: 230, x1: 490, z0: 1195, z1: 1265, doorX: 360, h: 11,
    airDoors:  [{ x: 300, w: 10 }, { x: 360, w: 14 }, { x: 420, w: 10 }],
    landDoors: [{ x: 300, w: 8 },  { x: 360, w: 12 }, { x: 420, w: 8 }]
  },
  tower:    { x: 262, z: 1128, r: 10 },
  office:   { x0: 273, x1: 283, z0: 1128, z1: 1136 },
  hangars:  [
    { x0: 510, x1: 570, z0: 855, z1: 945 },
    { x0: 510, x1: 570, z0: 965, z1: 1055 },
    { x0: 510, x1: 570, z0: 1075, z1: 1165 }
  ],
  road:     { x0: 230, x1: 720, z: 1290, w: 14 },
  parking:  { x0: 240, x1: 480, z0: 1306, z1: 1384 },
  entrance: { x: 660, z0: 1120, z1: 1340 },

  /* ---- Vie de l'aeroport (phase 20) : batiments supplementaires ---- */
  fireStation: { x0: 62, x1: 122, z0: 1425, z1: 1465 },       // caserne, portes vers le nord
  fireApron:   { x0: 60, x1: 124, z0: 1392, z1: 1425 },       // parvis des pompiers
  serviceRoad: { x: 62, z0: 1005, z1: 1392, w: 5 },           // route de service le long de la piste
  fuelFarm:    { tanks: [{ x: 590, z: 800 }, { x: 612, z: 800 }, { x: 634, z: 800 }], r: 9,
                 shed: { x0: 585, x1: 640, z0: 815, z1: 830 } },
  cargo:       { x0: 190, x1: 270, z0: 785, z1: 845 },        // fret, quais vers le sud
  helipad:     { x: 95, z: 1190, r: 13 },
  gaApron:     { x0: 70, x1: 130, z0: 640, z1: 720 },         // aviation legere
  papi:        { x: -40, z: -1330 },                          // indicateur de pente, seuil nord
  landsideDoor: { x: 360, z: 1265, w: 12 },                    // entree cote ville du terminal
  standS2:     { x: 450, z: 1010, heading: 180 },             // poste de l'avion de ligne « vivant »

  /* Mobilier du hall (phase 22) : rectangles NON praticables, en coordonnees
     monde, partages par le rendu (terminalBuilding.js) et la navigation.
     Les postes de COUNTERS (terminalSystem.js) y sont poses. */
  termFurniture: [
    { id: 'deskCheckin1', x0: 324.6, x1: 327.4, z0: 1247.3, z1: 1248.7 },
    { id: 'deskCheckin2', x0: 336.6, x1: 339.4, z0: 1247.3, z1: 1248.7 },
    { id: 'deskCheckin3', x0: 348.6, x1: 351.4, z0: 1247.3, z1: 1248.7 },
    { id: 'deskSecurity', x0: 392.6, x1: 398.6, z0: 1239.2, z1: 1244.4 },
    { id: 'deskGate',     x0: 370.6, x1: 373.4, z0: 1207.3, z1: 1208.7 },
    { id: 'deskShop',     x0: 450.9, x1: 453.6, z0: 1223.9, z1: 1228.1 },
    { id: 'deskCafe',     x0: 297.6, x1: 301.2, z0: 1222.0, z1: 1226.2 },
    { id: 'carousel',     x0: 255.4, x1: 268.6, z0: 1235.4, z1: 1240.6 },
    /* Phase 25 : tri des bagages, distributeur, reserve. */
    { id: 'deskBaggage',  x0: 271.8, x1: 273.2, z0: 1236.8, z1: 1239.2 },
    { id: 'deskVending',  x0: 431.3, x1: 432.7, z0: 1205.5, z1: 1206.5 },
    { id: 'deskStorage',  x0: 453.8, x1: 456.2, z0: 1256.3, z1: 1257.7 },
    { id: 'wcWest',       x0: 231,   x1: 246,   z0: 1250,   z1: 1263 },
    { id: 'wcEast',       x0: 474,   x1: 489,   z0: 1250,   z1: 1263 },
    { id: 'seatsA',       x0: 258,   x1: 274,   z0: 1203.4, z1: 1207.6 },
    { id: 'seatsB',       x0: 314,   x1: 330,   z0: 1203.4, z1: 1207.6 },
    { id: 'seatsC',       x0: 396,   x1: 412,   z0: 1203.4, z1: 1207.6 },
    { id: 'seatsD',       x0: 454,   x1: 470,   z0: 1203.4, z1: 1207.6 }
  ],
  /* Rangees de sieges tournees vers la baie vitree (nord). */
  termSeats: [
    { x: 266, z: 1205, n: 6 }, { x: 322, z: 1205, n: 6 }, { x: 404, z: 1205, n: 6 }, { x: 462, z: 1205, n: 6 }
  ],

  /* Itineraires : listes de [x, z, arret en secondes]. Les vehicules font des
     allers-retours ; les avions suivent `aircraft`. Aucun troncon ne traverse
     un batiment (verifie par navigation.test.js). */
  routes: {
    baggage: [[340, 1190, 4], [340, 1136, 0], [366, 1136, 18]],
    bus:     [[400, 1189, 4], [432, 1120, 0], [470, 1050, 0], [476, 1012, 16]],
    fuel:    [[600, 832, 4], [520, 832, 0], [495, 832, 0], [495, 960, 0], [450, 972, 22]],
    cargo:   [[230, 850, 5], [330, 905, 0], [420, 905, 8]],
    fire:    [[75, 1410, 6], [62, 1392, 0], [62, 1200, 0], [62, 1010, 5]],
    /* Avion de ligne : du poste jusqu'au point d'attente de la piste (z 1380). */
    taxiOut: [[450, 1010], [450, 930], [165, 930], [150, 945], [150, 1370], [100, 1380], [27, 1380]],
    /* Arrivee : sortie de piste par la bretelle z = -300, retour au poste. */
    taxiIn:  [[27, -300], [150, -300], [150, 915], [165, 930], [450, 930], [450, 1010]],
    walkers: { from: [360, 1318], to: [360, 1268] }
  }
};
