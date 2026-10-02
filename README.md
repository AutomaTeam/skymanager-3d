# SkyManager 3D — Ultimate Aviation Experience

Simulateur aeronautique multirole pour navigateur mobile (iPad / iPhone, Safari),
en HTML5 + Three.js, sans build ni compte developpeur Apple.

## Etat d'avancement

| Iteration | Contenu | Etat |
|---|---|---|
| 1 | Squelette 3D + modele de vol pilote | **Livree** |
| 2 | Atelier du mecanicien (maintenance au sol) | **Livree** |
| 3 | Cabine et service hotesse/steward | **Livree** |
| 4 | Boucle globale et economie (tycoon) | **Livree** |

Les 4 iterations du plan de developpement sont livrees : la boucle complete
**Vol → Atterrissage → Maintenance → Gestion → Nouveau vol** est jouable de
bout en bout.

### Chantier « monde ouvert unifie » (livre)

| Phase | Contenu | Etat |
|---|---|---|
| 0 | Graphe de navigation, collision, pathfinding A* | **Livree** |
| 1 | Scene unifiee : terminal creux, cabine parentee, passerelle mobile | **Livree** |
| 2 | PNJ autonomes et pathfinding (`js/agents.js`) | **Livree** |
| 3 | Prise et rendu de controle d'un agent | **Livree** |
| 4 | Boucle continue (le monde tourne pendant qu'on pilote) | **Livree** |
| 5 | Besoins des PNJ (faim, fatigue) et installations dediees | **Livree** |
| 6 | Passe deplacement et collisions (coque, rampe, cap, contournement) | **Livree** |
| 7 | Cycle jour/nuit et meteo dynamique (`js/environment.js`) | **Livree** |
| 8 | Textures procedurales et modelisation enrichie (`js/textures.js`) | **Livree** |
| 9 | Carte d'environnement IBL et reflets metalliques | **Livree** |
| 10 | Approfondissement terminal / cabine / atelier (jeu + decor) | **Livree** |
| 11 | Ombres portees, bloom, ciel physique, marquages et detail cellule | **Livree** |
| 12 | Passe de gameplay : contrats, pannes en vol, carburant, niveaux, remise a zero | **Livree** |
| 13 | Passe HUD et menus : systeme de mise en page, severites, cartes de panneau | **Livree** |
| 14 | Finition HUD : ecran de chargement, toasts qualifies, Echap, coherence des seuils | **Livree** |
| 15 | Modeles glTF externes : avatars, camionnette, fret, bagages, groupe electrogene (`js/assetLoader.js`) | **Livree** |
| 16 | Passe de coherence visuelle : eclairage, cameras interieures, textures partagees, decor | **Livree** |
| 17 | **Mode Arcade** : jeu adapte aux 12 ans (objectifs guides, vol assiste, etoiles, defis du jour) | **Livree** |
| 18 | **Nouvelle carte** : plan coherent et compact, bretelles, tour pres de la porte, cote ville, panneaux, mini-carte | **Livree** |
| 19 | **Deplacements en cabine** : marche au joystick, entree/sortie par la porte, cockpit accessible a pied | **Livree** |
| 20 | **L'aeroport vit** : vehicules, avion de ligne qui decolle et atterrit, helicoptere, voyageurs, batiments annexes | **Livree** |
| 20 | **Cockpit et vue de pilotage** : poste 3D complet, ecrans vivants, regard libre, mini-PFD, vitres du nez | **Livree** |
| 22 | **Terminal integre a la carte, trains d'atterrissage, decor** (`js/terminalBuilding.js`, `js/scenery.js`) | **Livree** |
| 21 | **Exterieur de l'avion** : fuselage de revolution, voilure loftee en profils, nacelles, empennage, surfaces mobiles sur le bord de fuite (`js/airframe.js`) | **Livree** |
| 25 | **Parcours passager** : billet, bagage, surete, carte d'embarquement, machines a recharger, tri des bagages (`js/terminalFlow.js`) | **Livree** |
| 26 | **Foule et passagers suivis** : les passagers du hall marchent d'un poste a l'autre, un meme dossier les suit, une erreur a une suite (avec seconde chance) | **Livree** |

## Monde libre : plus de menu de selection de role

Le jeu ne s'ouvre plus sur un menu "choisissez Pilote / Cabine / Mecanicien /
Aeroport". Au demarrage, le joueur incarne un agent au sol qui se **deplace
librement** (joystick ou ZQSD/fleches) autour de l'appareil — gare a la porte
d'embarquement — et de l'aeroport. Chaque activite se declenche en
s'approchant du bon endroit et en appuyant sur le bouton d'interaction
contextuel, qui affiche l'action disponible :

- **7 points de diagnostic** sur l'appareil (trains, ailes, reacteur,
  fuselage) → inspection et reparation (iteration 2), inchange.
- **Echelle au poste de pilotage** (avant gauche, sous le cockpit) →
  **MONTER AUX COMMANDES** : reprend le pilotage exactement la ou l'appareil
  se trouve (porte, taxiway, piste...), sans teleportation. Au tout premier
  demarrage l'appareil est a la porte, moteurs coupes — il faut le faire
  rouler soi-meme jusqu'a la piste 36 avant de decoller.
- **Passerelle mobile** (ouverture du hall, facade cote piste) → **EMBARQUER EN
  CABINE** (iteration 3), inchange une fois a l'interieur.
- **Bureau d'exploitation** au pied de la tour de controle → **GESTION DE
  L'AEROPORT** : ouvre le tableau de bord tycoon (iteration 4).
- **Le terminal** est un batiment du monde ouvert : on y entre a pied par ses
  portes vitrees (cote piste ou cote ville), sans bouton ni changement d'ecran ;
  comptoirs d'enregistrement, surete et commerces se gerent sur place (phase 22).
- **Un agent au sol a portee** (mecanicien ou agent de piste) → **PRENDRE LE
  CONTROLE** : on se glisse dans sa peau (voir plus bas).

Ces points d'interaction suivent la pose reelle de l'appareil (`ac.pos` /
`ac.quat`) plutot qu'une position fixe : si l'avion atterrit et s'arrete en
bout de piste sans etre ramene au parking, les points de diagnostic et
d'embarquement s'y trouvent aussi. Sortir de l'avion (menu pause, ou bouton
dedie sur l'ecran d'atterrissage) fait simplement descendre le joueur juste
a cote de l'appareil, la ou il est.

Le menu ☰ est desormais un simple menu pause (Reprendre / Sortir vers le
tarmac / Reinitialiser le vol sur la piste), plus un selecteur de role.

> **Phase 18** : la tour et le bureau sont maintenant a 100 m de la porte, le parking est cote ville
> au sud du terminal (voir « Nouvelle carte »).

**Deplacement libre sur l'integralite du complexe** — la zone praticable
couvre desormais la piste sur toute sa longueur, le taxiway, l'aire de
stationnement, le terminal, la tour, les hangars et le parking visiteurs,
et non plus seulement les abords immediats de la porte. Une touche **Shift**
(ou tenir la course sur mobile via une vitesse de base relevee) permet de
sprinter pour traverser rapidement ce grand espace.

### Graphe de navigation (`js/navigation.js`)

Le bornage par rectangle (`HUB_BOUNDS`) est remplace par un **graphe de zones
rectangulaires convexes reliees par des portails**, avec recherche de chemin
A*. Pas de navmesh ni de raycast par frame : le cout est constant, ce qui
compte sur iPad.

- Le joueur est contraint au rectangle de sa zone ; il ne change de zone qu'en
  franchissant un portail. Les batiments (terminal, tour, hangars, appareils
  gares) sont des **blocages soustraits** du tarmac.
- Les zones peuvent etre attachees a un **repere mobile** : la coque de
  l'appareil du joueur et l'allee de cabine sont exprimees dans le repere de
  l'avion et suivent donc son cap et sa position.
- `nav.resolve(from, to)` renvoie la position atteignable ; `nav.findPath()`
  et `nav.waypoints()` servent au deplacement des PNJ (voir ci-dessous).

### Scene unifiee

Le terminal et la cabine ne sont plus des scenes separees qui masquent le
monde : ce sont des **lieux continus** aux coordonnees monde.

- **Terminal** : le bloc plein est devenu une **coque creuse** (4 murs + toit,
  ouverture sur la facade cote piste). Le hall, ses comptoirs et ses files
  d'attente vivent a l'interieur, aux coordonnees monde.
- **Cabine** : l'interieur est un **tube ferme** parente au groupe de
  l'appareil ; il se deplace avec l'avion. La paroi du fuselage se masque
  **uniquement** quand le joueur est a l'interieur.
- **Passerelle mobile** : une rampe inclinee relie l'ouverture du hall a la
  porte cabine. Son extremite mobile est repositionnee chaque frame sur la
  porte reelle de l'appareil, et le sol de la passerelle s'eleve
  progressivement (`groundHeight()`) : le joueur monte reellement de 0 a
  2,5 m en marchant. L'escalier d'embarquement de l'appareil est masque
  automatiquement quand la passerelle est accostee.

> **Precision (phase 16)** : le monde est unifie (memes coordonnees, memes
> objets), mais `main.js` garde une machine a etats `HUB` / `TERMINAL` /
> `CABIN` / `PILOT` qui change de camera et de controleur (`cameraMode`
> `hub` / `terminal` / `cabin` / `chase`). Rien n'est masque, mais les cameras
> interieures doivent rester dans leur volume (voir phase 16).

### PNJ autonomes (`js/agents.js`)

Dix-sept agents peuplent le monde en permanence et vaquent a leurs occupations
sans intervention : **8 passagers** (hall), **4 mecaniciens** et **2 agents de
piste** (tarmac), **2 hotesses** et **1 pilote** (cabine). Ils empruntent le
meme graphe de navigation que le joueur, portails compris — un passager sort
donc reellement du hall par la passerelle pour rejoindre la cabine.

- **Repere mobile** : la position d'un agent est stockee dans le repere de sa
  zone (`l`/`m`), pas en coordonnees monde. Un mecanicien affecte a l'appareil
  suit ainsi l'avion qui roule, gratuitement.
- **`frame` et `gate` sont orthogonaux** : `frame` dit dans quel repere la
  position est exprimee (donc quel jeu d'ancres et quelle conversion
  s'appliquent), `gate` dit quand l'agent est visible. Un interieur masque
  n'est pas simule : les passagers du hall n'existent pas tant que le joueur
  n'est pas dans le terminal, et ceux de la cabine pas avant d'y entrer.
- **Deux niveaux de detail** : au-dela de 95 m du joueur, l'agent accumule le
  temps et ne fait plus qu'un pas par 0,2 s (au lieu d'un par frame). Les
  trajectoires restent identiques, seul le cout baisse.
- **Plafond de 24 agents actifs** — au-dela, `MAX_ACTIVE` les empeche d'etre
  simules. Les 17 actuels laissent de la marge.
- Les PNJ reutilisent `buildTechnician()` avec des couleurs par role, mais
  **sans lampe torche** : chaque `SpotLight` supplementaire est compilee dans
  le shader de toutes les surfaces eclairees, ce qui est ruineux a 24
  exemplaires.
- **Contournement du fuselage** : le bloqueur de coque n'est pas consulte la ou
  la zone `jetBridge`, prioritaire, recouvre le flanc de l'appareil. Les agents
  testent donc la coque eux-memes, en trois couches — le pas qui finirait dans
  le fuselage est refuse, un agent deja dedans est ramene au plus proche point
  libre (`_safeSpot`), et un itineraire dont la corde traverse la coque est
  rejete avant d'etre suivi. Une ouverture plus large que les deux portails
  `cabinDoor`/`bridgeDoor` preserve le passage par la porte.

### Prise de controle d'un agent (`js/main.js` + `js/agents.js`)

Le joueur n'est plus limite a son propre avatar : il peut **se glisser dans la
peau d'un PNJ** du tarmac, agir a sa place, puis lui rendre sa routine.

- **Detection dynamique** : a chaque frame, `agents.nearest(x, z, 4.5, ['mechanic',
  'ramp'])` cherche l'agent le plus proche du joueur. Le bouton contextuel
  affiche alors `PRENDRE LE CONTROLE (MECANICIEN)` ou `(AGENT DE PISTE)`. Un
  agent masque (interieur non affiche) n'est jamais propose : on ne prend pas
  le controle d'un personnage invisible a travers un mur.
- **Priorite d'interaction** : le bouton contextuel teste d'abord la prise de
  controle, puis les points d'interaction classiques (diagnostic, echelle,
  passerelle, tour, terminal). Un agent qui passe a portee ne masque donc
  jamais l'action principale.
- **Prise** : l'avatar du joueur est masque (`r3d.setPlayerVisible(false)`),
  la camera se fixe sur l'agent, et les commandes de deplacement sont routees
  vers `agents.moveControlled()`. Le deplacement reutilise le meme
  `nav.resolve()` et le meme test de coque que les PNJ : on ne traverse pas
  plus le fuselage en tant que mecanicien qu'en tant que joueur.
- **Lampe torche conservee** : `setPlayerVisible()` masque les maillages de
  l'avatar mais laisse son `SpotLight` visible. Three.js ignore une lampe dont
  un ancetre est `visible = false` ; masquer le groupe entier eteindrait
  l'eclairage de la scene.
- **Rendu** : `RENDRE LE CONTROLE` repose l'agent sur place (etat `resting`),
  restaure l'avatar, repositionne le joueur a l'endroit exact ou l'agent se
  trouve, et l'agent reprend sa routine depuis cette position.
- **Simulation continue** : un agent non affiche continue d'etre simule
  (`update()` ne saute plus les agents masques), sinon un agent relache dans un
  interieur resterait fige sur `resting` et ne repartirait jamais.
- **Roles exclus** : le pilote, l'hotesse et le passager ne sont pas
  controlables ici. Leur poste est deja un point d'interaction
  (`MONTER AUX COMMANDES`, `EMBARQUER EN CABINE`, comptoirs du terminal)
  qui ouvre le vrai mini-jeu du role ; le prendre par ce chemin ferait doublon.

### Boucle continue (`js/main.js` + `js/airportTycoon.js`)

Le monde ne s'arrete plus quand le joueur change d'activite. Piloter, servir en
cabine ou gerer le terminal ne suspend plus le reste de l'aeroport : les files
d'attente continuent de se remplir, l'usure continue de courir, la flotte
continue de rapporter.

- **Un seul point d'entree** : `loop()` appelle `worldUpdate(dt)` **avant** de
  dispatcher l'etat courant. `worldUpdate()` fait tourner l'usure passive, le
  terminal, le service cabine et le revenu de flotte, puis l'etat actif fait son
  propre travail (vol, mini-jeu, etc.).
- **Pas de double simulation** : `updateCabin()` appelle deja `cabin.update(dt)`
  pour son etat ; `worldUpdate()` saute donc la cabine quand `state === 'CABIN'`,
  sinon les demandes cabine expireraient deux fois plus vite. Le terminal n'a
  plus d'etat propre (phase 22) : `worldUpdate()` le simule en permanence.
- **Usure passive** : `0.35 * dt / 60` par composant et par seconde quand
  l'appareil est au sol, soit environ 0.35 %/min (~21 %/h de temps de jeu). Un
  avion laisse sans entretien finit donc par reclamer une visite.
- **Service cabine conditionnel** : `cabin.update()` ne tourne que si
  `!ac.onGround`. Au sol, les demandes en attente sont purgees : une hotesse ne
  sert personne dans un avion a l'arret.
- **Revenu de flotte** : `tycoon.creditPassiveFleet(seconds)` credite les
  appareils autres que celui du joueur, une fois par minute de temps de jeu
  (`_fleetAcc`), sur la meme formule par rotation que `registerFlight`.
- **Gel explicite** : `_worldPaused` fige le monde pendant la pause, le panneau
  tycoon, le panneau de maintenance, le mini-jeu de serrage et le carnet de vol.
  Le monde reprend exactement ou il s'etait arrete a la fermeture.
- **Bornage du rattrapage** : `_worldAcc` est plafonne a 0.25 s. Un onglet
  laisse en arriere-plan ne deverse donc pas un `dt` enorme dans le terminal et
  la cabine au retour.
- **Rapport d'activite** : `goToHub()` appelle `announceWorld()`, qui affiche
  4.2 s un resume de ce qui s'est passe pendant l'absence — passagers en file,
  comptoirs ouverts, ambiance, composant le plus use, revenu de flotte encaisse.

### Besoins des PNJ (`js/agents.js`)

Les PNJ ne se contentent plus de faire des allers-retours entre des postes
tires au hasard : ils ont des **besoins** qui s'epuisent et qu'ils vont
satisfaire d'eux-memes. C'est ce qui rend l'autonomie lisible — on comprend
pourquoi un agent marche en regardant ou il va.

- **Deux besoins** : `energy` (fatigue) et `hunger` (faim), de 0 (criant) a
  100 (comble). Chacun s'epuise avec le temps de jeu, y compris pendant une
  pause : un agent qui attend se fatigue aussi.
- **Seuils** : `energy` devient urgent sous 38, `hunger` sous 42. Au-dessus,
  l'agent suit sa routine ordinaire (postes de travail, files, allees).
- **Arbitrage** : quand les deux besoins passent sous leur seuil, c'est le
  plus **relativement** bas qui l'emporte — un besoin a 5/38 passe avant un
  besoin a 30/42.
- **Installations** : chaque besoin a une installation par famille de role.
  Le personnel du terminal vise les banquettes et le fond du hall, l'equipage
  l'arriere et le milieu de l'allee cabine, les equipes de piste le
  baraquement et la roulotte au sud de l'aire de service. Le pilote n'a ni
  besoin ni installation : il ne quitte jamais son poste.
- **Recuperation** : sur place, le besoin remonte de `recover` par seconde.
  L'agent repart des qu'il atteint 92, sans attendre la fin de sa pause — il
  ne reste pas assis a ne rien faire une fois rassasie.
- **Repli** : si l'installation est injoignable (appareil deplace, chemin
  coupe par la coque), l'agent retombe sur un poste ordinaire. Un agent
  bloque en route abandonne la visite et ne remonte donc pas son besoin a
  distance.
- **Inspection** : `__game.agents.needsSummary()` donne le nombre d'agents en
  besoin, en visite, et le minimum par besoin ; `__game.agents.debug()` expose
  `need`, `energy` et `hunger` pour chaque agent.

### Deplacements et collisions (`js/main.js` + `js/agents.js` + `js/navigation.js`)

Passe de correction sur les deplacements : le joueur et les PNJ suivent
desormais les memes regles de collision, et le chemin le plus court n'est plus
le seul chemin possible.

- **Coque de l'appareil pour le joueur** : `updateHub()` ne se contentait du
  `nav.resolve()` du graphe. Or la zone `jetBridge` (prioritaire) recouvre le
  flanc gauche du fuselage et annulait le blocage `playerAircraft` : on
  entrait dans l'avion a pied. Chaque deplacement candidat est maintenant
  valide par `agents._clearOfHull(null, x, z)` avant d'etre applique. Le
  joueur s'arrete donc au seuil de la porte cabine, exactement comme un PNJ.
- **Rampe suivie** : `p.y = r3d.groundHeight(p.x, p.z)` a chaque frame en
  marche libre. Le joueur monte reellement la passerelle (0 m au hall,
  2,52 m a l'accostage) au lieu de flotter a hauteur constante.
- **Cap lisse** : la rotation de l'avatar passe par `turnTowards(heading,
  cible, dt)` avec `TURN_RATE = 5.0` rad/s, au lieu d'un `atan2` sec qui
  faisait claquer le personnage d'un demi-tour instantane a chaque
  changement de direction.
- **Contournement d'obstacle** : `nav.waypoints()` valide la ligne droite par
  `_polylineWalkable()` (echantillonnage tous les `SEGMENT_STEP = 1.5` m). Si
  elle coupe un blocage, il bascule sur `_detour()` : graphe de visibilite
  construit sur les coins des blocages du repere monde, resolu par Dijkstra.
  Un PNJ ne reste donc plus bloque derriere le terminal ou un hangar quand sa
  cible est de l'autre cote. Cout mesure : 0,38 ms au pire par appel.
- **Rendu de controle sans traverser la coque** : `releaseControl()` cherche
  un point de depot valide via `agents._safeSpot()` (spirale
  praticable + hors coque) avec repli sur `nav.nearestWalkable()`. Rendre le
  controle d'un mecanicien debout contre le fuselage ne fait plus apparaitre
  le joueur dans l'appareil.
- **Sortie de coque** : `moveControlled()` pousse l'agent controle vers
  l'exterieur s'il se trouve dans la coque (cas d'un appareil qui se gare
  par-dessus lui), et `_step()` recale `a.wy` sur `_groundY()` pour que les
  PNJ suivent eux aussi la rampe.
- **Points d'interaction** : les marqueurs `fuselage`, `cockpit` et
  `gearNose` sont **dans** la coque. Le filtrage des points d'interaction par
  `_clearOfHull` a donc ete ecarte : il rendait ces trois points
  inaccessibles. La selection reste une simple distance, et le joueur peut
  se placer a portee depuis l'exterieur (cellule praticable la plus proche :
  2,0 m pour `fuselage`, 5,3 m pour `gearNose`, 5,6 m pour `cockpit`).

**Aeroport enrichi** (`js/renderer3d.js`) — en plus de la piste balisee, du
taxiway, du terminal, de la tour et des hangars deja presents :
- Cloture perimetrique avec portail d'entree signale pres du terminal.
- Parking visiteurs (24 vehicules) a l'ouest de la piste.
- Mats d'eclairage sur l'aire de stationnement.
- Un second appareil statique gare a une autre passerelle, pour un aeroport
  qui parait vivant plutot que desert.
- Marquages normalises au sol (axe de piste, seuils, bords, taxiways,
  guidees, barres d'arret, hachures de securite) et petit materiel de piste
  (cones, cales, groupes de parc, chariots a bagages, escabeau, extincteurs)
  — voir « Marquages au sol et petit materiel ».

### Cycle jour/nuit et meteo (`js/environment.js`)

Le monde n'est plus fige a midi par temps clair. L'heure de jeu avance en
continu et la meteo change toute seule, ce qui donne a chaque session une
ambiance differente — et rend le poser de nuit reellement plus exigeant.

- **Duree du jour** : `DAY_SECONDS = 1200`, soit 20 minutes reelles pour un
  jour complet et 50 s par heure de jeu. Assez court pour qu'une session voie
  un coucher de soleil, assez long pour ne pas etre une plaie.
- **Course du soleil** : le soleil se leve a l'est, culmine au sud a midi et
  se couche a l'ouest (`sunDirection()`). Sa hauteur pilote un facteur
  `daylight` (0 = nuit noire, 1 = plein jour) dont derivent toutes les
  intensites, la teinte du ciel et l'allumage des feux.
- **Ciel** : 10 cles de couleur (haut / milieu / bas + teinte du brouillard)
  interpolees lineairement entre 0 h et 24 h. Le degrade du dome, la couleur
  de fond et celle du brouillard suivent donc le meme arc, du bleu nuit au
  bleu de midi en passant par les oranges du coucher.
- **Etoiles** : 900 points fixes sur la voute, reveles par l'opacite de la
  nuit. Un seul appel de rendu.
- **Meteo** : 5 etats — `clear`, `cloudy`, `rain`, `fog`, `storm` — tires
  toutes les 3 a 8 minutes selon des poids (34 / 30 / 18 / 12 / 6 : le beau
  temps reste majoritaire, l'orage rare). Chaque etat definit la couverture
  nuageuse, l'intensite de la pluie, la portee du brouillard, la turbulence
  et l'attenuation du soleil. La transition entre deux etats se fait par un
  `smoothstep` de 25 s : la meteo ne claque jamais d'un coup.
- **Vent** : la direction derive lentement et la vitesse rejoint sa cible
  progressivement. `windVector()` alimente directement `ac.wind`, et
  `turbulence` alimente `ac.turbulence` — un orage secoue donc reellement
  l'appareil, un brouillard non. Le vent n'est plus code en dur au demarrage.
- **Pluie** : un rideau de 1400 traits verticaux dans un volume de 60 x 40 x
  60 m qui suit la camera, en un seul appel de rendu. Les gouttes retombent
  et se recyclent en haut du volume ; le rideau entier est masque quand il ne
  pleut pas, donc rien n'est simule par beau temps.
- **Feux de l'aeroport** : au crepuscule (ou des que la visibilite tombe),
  les feux de piste et la rampe d'approche passent au blanc chaud, les mats
  de l'aire de stationnement montent a pleine puissance, et les interieurs
  (cabine, hall) s'eclairent franchement.
- **Feux de l'appareil** : feux de navigation rouge/vert et feu de queue
  allumes des que la nuit tombe ou que l'appareil est en vol ; feux a eclats
  (deux eclairs brefs par cycle de 1,4 s) ; phares d'ailes allumes la nuit ou
  en approche sous 3000 ft. Le phare d'atterrissage existant est conserve.
- **Brouillard et altitude** : `updateCamera()` etend la portee avec
  l'altitude, mais **a partir de la base posee par l'environnement** — les
  deux ne se marchent donc plus dessus. Un brouillard au sol a 400 m de
  portee s'eclaircit en montant, sans redevenir une journee ensoleillee.
- **Persistance** : heure, meteo et vent sont sauvegardes dans
  `localStorage` (`skymanager.environment`) toutes les 30 s. On retrouve donc
  le monde la ou on l'avait laisse.
- **Reglage manuel** : le menu pause propose `-1 h`, `+1 h` et `Meteo`, ce qui
  permet de tester un poser de nuit sans attendre le cycle.

Le module ne connait ni Three.js ni le DOM : il ne produit que des nombres
(direction du soleil, couleurs, intensites, vent). C'est
`renderer3d.applyEnvironment()` qui les applique a la scene, et `main.js` qui
en tire le vent et la turbulence du modele de vol. Il reste donc testable
seul, sans navigateur.

### Textures procedurales et modelisation (`js/textures.js`)

Toutes les surfaces du jeu sont desormais texturees, et les volumes principaux
ont gagne en detail. Le point cle : **aucun fichier image n'est charge**. Les
30 textures sont generees au demarrage sur des canvas 2D, donc le poids de la
page ne bouge pas et il n'y a aucun aller-retour reseau.

- **Bibliotheque** : `js/textures.js` expose 30 generateurs (`grass`,
  `runway`, `apron`, `concrete`, `metal`, `skin`, `windows`, `livery`,
  `turbine`, `fanDisc`, `tire`, `facade`, `glassGrid`, `roof`, `carpet`,
  `fabric`, `terrazzo`, `chainlink`, `foliage`, `rock`, `cloud`, `hazard`,
  `paintedMetal`, `starSprite`, `skinPores`, `hair`, `leather`, `brushed`,
  `tile`, `luggage`). Chacun renvoie un jeu
  de cartes `{ map, normalMap?, roughnessMap? }` deja configurees.
- **Determinisme** : le bruit est produit par un PRNG `mulberry32` a graine
  fixe, donc les textures sont identiques d'un chargement a l'autre. Les
  captures d'ecran restent comparables.
- **Raccordable** : `valueNoise()` recopie la derniere ligne et la derniere
  colonne de la grille sur la premiere, ce qui rend chaque texture
  parfaitement repetable — indispensable pour un sol de 60 km de cote.
- **Cartes de normales** : `normalFromHeight()` derive une normale tangente
  de la luminance par differences centrees. C'est ce qui fait accrocher la
  lumiere sur le grain du bitume, les joints de dalle et les rivets, au lieu
  d'un aplat uniforme.
- **Memoisation** : `once()` garantit qu'un generateur ne tourne qu'une fois.
  Une texture est donc partagee entre plusieurs materiaux : 38 textures en
  memoire GPU pour 1324 materiaux PBR dans la scene.
- **Materiaux** : les 30 `MeshLambertMaterial` / `MeshPhongMaterial` ont ete
  remplaces par des `MeshStandardMaterial` produits par la fabrique `pbr()`
  de `renderer3d.js`, qui accepte `color`, `rough`, `metal`, `repeat`, `side`,
  `transparent`, `opacity`, `flatShading`, `emissive`, `emissiveIntensity`,
  `envMapIntensity` et `alphaTest`.
- **Modelisation enrichie** :
  - *Terrain* : arbres a deux etages (tronc + canopee texturee) au lieu d'un
    cone unique, collines de roche a 7 cotes ombrees.
  - *Piste* : accotements, marquages adoucis, feux de bord, rampe d'approche.
  - *Aerogare* : facade, vitrage et toiture textures ; tour de controle avec
    jupe de toit, radar et antenne ; hangars avec portails, rails et plaques
    de numero ; bureau d'exploitation avec auvent, vitrage et porte.
  - *Engins de piste* : camion avitailleur (vitrage de cabine, cerclages,
    bande de danger), GPU avec grille, chariots a bagages charges de valises.
  - *Cloture* : grillage a maille percee (texture alpha, `alphaTest: 0.35`)
    au lieu d'un voile translucide — on voit au travers, comme en vrai. Le
    materiau est cree par troncon pour que la repetition de la maille reste
    constante quelle que soit la longueur.
  - *Parking visiteurs* : places marquees et voitures avec vitrage et roues.
  - *Appareil* : bandeau de hublots, portes cabine et soute, APU, antennes
    VHF/GPS, aigrettes de decharge, cones d'echappement, disques de
    soufflante a 12 pales, pneus textures.
  - *Interieurs* : moquette, tissu des sieges, terrazzo du hall, metal peint
    des cloisons, peau et cheveux des personnages, cuir des sieges premium,
    inox brosse des galley et plans de travail, carrelage des blocs
    sanitaires, toile des valises du carrousel.
- **Cout mesure** : 129 a 148 appels de rendu, ~32 000 triangles, 28 a 37
  programmes de shader, 13,8 ms par image en mediane (p95 16,6 ms) — soit
  toujours 60 fps sur la cible iPad/iPhone. Aucune lampe supplementaire n'a
  ete ajoutee : chaque `SpotLight` serait compilee dans le shader de toutes
  les surfaces eclairees. *(Chiffres de la phase 8 ; voir les mesures de la
  phase 11 plus bas pour l'etat courant.)*
- **Correctif de rendu** : le dome de ciel est un `ShaderMaterial` ecrit a la
  main. Il lui manquait les inclusions `tonemapping_fragment` et
  `colorspace_fragment` : ses couleurs lineaires etaient donc ecrites telles
  quelles dans un framebuffer sRGB, et le ciel paraissait presque noir en
  plein jour. Les deux inclusions sont desormais presentes, et le dome suit
  exactement les cles de couleur de `environment.js`.

### Carte d'environnement (`buildEnvSky()` dans `js/renderer3d.js`)

Un materiau PBR avec une `metalness` non nulle n'a d'interet que s'il a
quelque chose a reflechir. Sans carte d'environnement, l'aluminium de
l'appareil, les carrosseries et les vitrages ne renvoyaient que la lumiere
directe du soleil et paraissaient ternes.

- **Fabrication** : un dome de ciel minuscule (rayon 50 m) est rendu dans une
  cubemap 128 px par une `CubeCamera`, puis prefiltre par un `PMREMGenerator`
  (256 px). Le dome dedie reprend le meme degrade que le ciel visible, plus
  une bande de sol : un metal qui plonge vers le bas doit voir du vert, pas
  du bleu.
- **Rafraichissement** : la carte est regeneree quand l'heure de jeu a bouge
  de plus de 0,25 h, soit environ une fois par seconde reelle. Le rendu d'une
  cubemap 128 px coute moins d'une milliseconde.
- **Application selective — le point important** : poser
  `scene.environment` ferait echantillonner la cubemap par **chaque fragment
  de chaque surface**, y compris le sol et la piste qui occupent la majorite
  de l'ecran. Mesure : **+2,4 ms par image**, soit le budget de 60 fps
  entierement mange. La carte est donc posee explicitement sur les seuls
  materiaux dont la `metalness` depasse 0,25 — 435 materiaux sur 876. Le sol,
  les murs et les tissus gardent leur eclairage direct, sans cout
  supplementaire. Resultat mesure : 13,8 ms en mediane, contre 13,5 ms sans
  carte du tout.
- **Gratuite a l'usage** : changer la texture d'un `envMap` ne declenche
  aucune recompilation de shader (la cle de programme ne depend que de la
  presence et du type de mapping). Le rafraichissement horaire ne coute donc
  rien en compilation.
- **Effet mesure** : luminance moyenne de l'image a midi en vue orbite,
  68,5 contre 63,9 sans carte — les surfaces metalliques sont reellement
  plus lumineuses et plus contrastees.

### Ombres portees (`buildLights()` et `applyEnvironment()` dans `js/renderer3d.js`)

Jusqu'a la phase 11, la scene ne comportait **aucune** ombre : un `grep` sur
`castShadow` ne renvoyait qu'une seule occurrence, et elle valait `false`.
L'appareil, le terminal et les personnages flottaient litteralement au-dessus
du tarmac. C'etait le manque de realisme le plus visible du rendu.

- **Une seule carte d'ombre** : celle du soleil. La lune n'en projette pas —
  doubler le cout pour une ombre a peine perceptible n'aurait pas de sens.
- **Frustum serre qui suit le sujet** : la carte est orthographique, large de
  110 m, en 1024 px, soit environ 10,7 cm par texel. `sunTarget` est deplace
  chaque image sur `_shadowFocus` (l'appareil en vue exterieure, le joueur en
  vue libre) et le soleil est pose a `focus + direction * 400`. Le soleil
  reste donc optiquement a l'infini, mais la carte ne couvre que la zone
    utile : les 500 arbres instancies, les 1698 maillages de la scene et le dome
  de ciel sont hors du volume et ne sont pas dessines dans la carte.
- **`normalBias = 0.35`** : volontairement eleve. Le fuselage est une capsule
  de 1,95 m de rayon et les ailes sont des formes extrudees tres fines ; un
  biais faible y produit un acne bien visible.
- **L'appareil projette mais ne recoit pas** : a cette echelle un avion ne se
  fait pas d'ombre a lui-meme de facon perceptible, et ne pas recevoir evite
  l'acne sur les surfaces courbes.
- **Seules les grandes surfaces projettent** : fuselage, nez, bande, verriere,
  ailes, volets, ailerons, spoilers, nacelles et trains. Les decalques de
  joint, les rivets et les marques d'usure sont exclus — ce sont des surfaces
  transparentes, et les inclure multiplierait les appels de dessin sans rien
  changer a l'ombre portee au sol. Le passage de « tout projette » a cette
  liste a fait tomber la vue poursuite de 376 a 297 appels. *(376 etait la
  mesure intermediaire, avant ce resserrement.)*
- **Coupee la nuit et dans les interieurs** : `sun.castShadow` n'est vrai que
  si le soleil est au-dessus de l'horizon (`d.y > 0.06`) **et** que la camera
  n'est ni en cabine ni dans le terminal. Dans ces deux vues la carte n'apporte
  rien et couterait un rendu complet du decor exterieur.
- **Cout mesure** : +1,3 ms en mediane (13,0 contre 11,7 ms) en vue libre, et
  +0,4 ms seulement en vue rapprochee, ou le frustum ne contient que l'appareil.
  En vue libre, le frustum serre ecarte en fait davantage d'objets qu'il n'en
  ajoute : la vue y est legerement **plus rapide** qu'avant la phase 11.

### Bloom (`buildBloom()` dans `js/renderer3d.js`)

Les feux de piste, les lampadaires du tarmac, le disque solaire et les lampes
d'interieur sont des objets emissifs : sans diffusion, ils restent des taches
plates. Une passe de bloom est donc ajoutee, ecrite a la main plutot
qu'importee d'`UnrealBloomPass` — ce dernier enchaine cinq passes plein ecran
et un `EffectComposer` complet, ce qui est hors budget sur la cible iPad.

- **Quatre passes** : extraction des hautes lumieres a 1/4 de resolution, flou
  gaussien separable horizontal puis vertical (neuf taps), puis composition
  additive par-dessus l'image. Trois des quatre passes tournent sur un quart
  de la surface.
- **Seuil a 0,85 avec une rampe douce** (`smoothstep(threshold, threshold +
  knee, l)`) : seules les sources vraiment lumineuses diffusent, pas le ciel
  ni le sable clair. La rampe evite le scintillement qu'une coupure nette
  produirait quand une source traverse le seuil.
- **`renderer.info` cumule sur l'image** : sans desactiver `autoReset`, le
  panneau de debogage n'aurait affiche que la derniere passe, soit « 1 appel,
  2 triangles ». `info.autoReset` est donc coupe pendant le rendu et retabli
  ensuite.
- **Cout mesure** : +0,4 ms en mediane (16,0 contre 15,6 ms).

### Ciel physique (`buildSky()` dans `js/renderer3d.js`)

Le dome de ciel etait un simple degrade a trois bandes, sans soleil. Il
comporte desormais :

- un **disque solaire** a coeur net (`smoothstep` sur l'angle) double d'un
  **halo** a deux lobes (`exp(-ang * 26)` et `exp(-ang * 5)`), ce qui donne un
  soleil credible a regarder directement ;
- une **diffusion avant** (`pow(dot(dir, sunDir), 3)` et `pow(..., 12)`) qui
  eclaircit le ciel du cote du soleil, y compris sous l'horizon — c'est ce qui
  produit les teintes d'aube et de crepuscule ;
- une **brume d'horizon** en bande gaussienne (`exp(-abs(h) * 9)`), dont la
  densite suit la meteo (`0.20 + (1 - fog) * 0.55 + cloud * 0.22`), ce qui
  detache les objets lointains du ciel. Attention : `fog` est un facteur de
  **visibilite** (1 = degage, 0,22 = brouillard a couper au couteau), il faut
  donc l'inverser — la premiere version l'utilisait directement et rendait un
  ciel paradoxalement plus clair par temps bouché ;
- un degrade vertical plus serre pres de l'horizon (`pow(h, 0.62)` au lieu de
  `0.7`), plus proche de la concentration reelle de l'atmosphere.

`sunPower` est module par la hauteur du soleil : `min(1, y * 6 + 0.06)`. Le
disque disparait donc sous l'horizon tout en laissant une faible lueur
residuelle a l'aube et au crepuscule.

### Marquages au sol et petit materiel (`buildGroundMarkings()`, `buildGroundProps()`)

Le tarmac etait une dalle grise uniforme : aucune echelle, aucune lecture de
la circulation. Les marquages normalises d'un aerodrome reel sont maintenant
traces — axe de piste en traits de 30 m espaces de 20 m, bandes de seuil et
marques de designation aux deux extremites, bords de piste continus, axe de
taxiway jaune avec ses bretelles de liaison, guidees et barres d'arret des
postes de stationnement, hachures rouges de zone de securite moteur, voies de
service.

- **Trois appels de dessin au total** : toutes les lignes sont regroupees en
  trois `InstancedMesh` (blanc, jaune, rouge) de plans unitaires mis a
  l'echelle par la matrice d'instance. Pas deux cents maillages.
- **`MeshBasicMaterial`** : aucun cout d'eclairage, et `depthWrite: false`
  pour eviter tout z-fighting avec le revetement, pose 2,2 cm au-dessus.
- **Petit materiel** : cones de balisage (couronne autour de chaque poste plus
  un alignement le long de la voie de service), cales de roue aux trois trains,
  groupes de parc, chariots a bagages, escabeau de maintenance et extincteurs.
  Chaque famille est un `InstancedMesh` unique, sauf l'escabeau (deux
  exemplaires, construits en groupe).

### Detail de la cellule (`buildAircraft()` dans `js/renderer3d.js`)

Le fuselage etait un tube lisse : il paraissait en plastique. Il porte
desormais les details qui font lire un avion de ligne de pres.

- **Joints de panneaux** : onze anneaux circonferentiels (un tous les 2,6 m,
  en un seul `InstancedMesh`) et quatre lignes longitudinales.
- **Rivets** : deux couronnes de points de part et d'autre de la bande de
  hublots, la ou les panneaux sont les plus nombreux.
- **Capteurs** : tube de Pitot de nez, deux prises statiques laterales, lame
  d'antenne dorsale et ventrale, eclairage de logo.
- **Immatriculation** : « F-GHPY » dessine en petits rectangles, lisible de
  loin sans dependre d'une police de caracteres, sur les deux flancs.
- **Voilure** : cinq joints de panneaux par aile (suivant la fleche), bec de
  bord d'attaque metallique, carrenage de feu de saumon.
- **Nacelles** : levre d'entree d'air en tore, ligne de separation
  inverseur / capot, grille d'inverseur suggeree par huit points.
- **Tout est regroupe dans `skinDetail`, ajoute a `hull`** : ces decalques
  exterieurs disparaissent donc automatiquement en vue cockpit et en cabine,
  ou ils n'ont rien a faire. Sans ce regroupement, la cabine passait de 683 a
  907 appels de dessin.

### Approfondissement des trois zones (`js/terminalSystem.js`, `js/cabinService.js`, `js/mechanicSystem.js`)

La phase 10 ne rajoute pas de systeme : elle approfondit les trois lieux
existants, en jeu **et** en decor. Chaque zone gagne une ressource a gerer,
une consequence a subir et un decor qui montre l'etat.

**Zone passager — le terminal**

- Sept comptoirs au lieu de cinq, repartis sur **trois murs** du hall :
  securite, trois enregistrements et porte au nord, boutique a l'ouest,
  cafe a l'est. Chaque comptoir porte sa position monde et son orientation,
  donc le mobilier se construit a partir des donnees de jeu au lieu d'etre
  code en dur.
- Chaine logistique reelle : enregistrement et securite alimentent la file
  de la porte (`feed`), la porte seule embarque (`board`). Une file de porte
  au-dela de 26 passagers fait perdre des clients (`missed`) et effondre
  l'ambiance.
- Economie : la boutique et le cafe rapportent en continu
  (`SHOP_RATE` 5,5 et 3,2 EUR/s) mais coutent un entretien (`SHOP_UPKEEP`
  1,2 et 0,7 EUR/s). Le revenu est module par un facteur de trafic
  `0,6 + ambiance/100 × 0,8 + min(0,6, file × 0,08)` : un terminal sature
  rapporte moins. Servir un client a la main vaut 1,35× le traitement
  automatique.
- Decor : dalles lumineuses encastrees, plans de travail en inox brosse,
  enseignes suspendues, portique de securite et tapis a rayons X, lecteur de
  carte et passerelle vitree a la porte, etageres garnies de produits
  duty-free, machine a expresso et vitrine refrigeree, **carrousel a bagages
  anime** (10 valises en ellipse), **tableau des departs** dont les lignes
  clignotent selon la file, bloc sanitaire carrele et rangees de sieges.

**Interieur de l'avion — la cabine**

- Six types de demande au lieu de trois : cafe, repas, boisson, couverture,
  casque, **medical**. Le medical a une fenetre de 12 s (contre 20 s) et
  compte 2,2× dans la satisfaction.
- **Chariot a stock** : 12 unites. Servir consomme une unite ; chariot vide,
  le service echoue et il faut le recharger au galley. Le chariot grossit et
  monte visuellement avec son stock.
- **Consigne ceintures** : un bouton dedie. Quand elle est active, les
  volets des hublots se baissent, les hublots s'assombrissent, et servir un
  passager debout coute de la satisfaction au lieu d'en rapporter.
- **Satisfaction par rangee** : chaque rangee a sa propre note. Une demande
  expiree ou un incident mal gere fait chuter la rangee concernee, affichee
  en permanence comme « rangee critique ».
- Decor : 20 portes de coffre individuelles avec loquet, 20 sieges detailles
  (assise, dossier, appui-tete, accoudoirs, pieds, tablette, **ecran de
  dossier** qui s'allume selon la satisfaction de la rangee), 20 hublots
  ovales a volet, bandeau lumineux et buses d'air au plafond, galley inox
  avec fours et etageres, bloc sanitaire carrele avec porte et signaletique,
  chariot a roulettes.

**Partie mecanique — l'atelier**

- Huit points de diagnostic (train avant, train gauche, train droit, deux
  ailes, deux moteurs, fuselage) et huit composants suivis sur **trois
  axes** : usure, **niveau de fluide**, **couple de serrage**.
- **Magasin de pieces** : sept references (pneu, plaquettes, joint,
  actionneur, aube, panneau, fluide) avec stock et prix. Une reparation
  consomme la piece correspondante ; sans stock, la qualite est divisee par
  deux. Le stock se rachete avec la caisse du tycoon.
- **Ordres de travail** : des qu'un composant franchit son seuil critique,
  ou qu'un fluide ou un couple passe sous 35 %, un ordre s'ouvre
  automatiquement — `URGENT` si l'usure est en cause, `PLANIFIE` sinon. Il se
  ferme quand tout est revenu au vert. Le panneau de poste affiche le nombre
  d'ordres ouverts et le carnet de bord les rappelle.
- **Risque de panne** elargi : il additionne les depassements d'usure **et**
  les penalites de fluide et de couple bas.
- **Mini-jeu en trois etapes** nommees (serrage au couple, mise a niveau du
  circuit ou controle d'usure, controle final), chacune plus rapide et plus
  etroite que la precedente. La qualite moyenne des trois pilote la
  reparation.
- Decor : l'appareil **montre son etat**. Des taches de crasse apparaissent
  sur le fuselage, de la suie derriere les moteurs, de la poussiere de frein
  sur les roues — opacite et nombre proportionnels a l'usure reelle des
  composants concernes.

**Mesures apres la phase 10** (iPad, 1280 × 800, vue libre, rechargement a
froid) : 13,9 ms en mediane, 16,3 ms au 95e centile, 148 appels de dessin,
31 954 triangles, 37 programmes de shader, 38 textures — soit exactement le
niveau d'avant la phase 10 (13,8 ms / 138 appels / 31 814 triangles). *(Ces
chiffres sont ceux de la phase 10 ; la phase 11 les remplace, voir le tableau
plus bas.)* Les
trois interieurs ne sont construits qu'a la premiere entree dans la zone
concernee, donc le cout de la vue libre ne bouge pas. Une fois le terminal
construit : 19,6 ms en mediane, 133 appels, 31 504 triangles. Deux lampes
ponctuelles suffisent desormais (contre trois auparavant) : l'eclairage
ambiant a ete remonte a 0,62 pour compenser, ce qui a fait passer la
luminance moyenne du hall de 66 a 79 sans cout de shader supplementaire.

**Mesures apres la phase 11** (meme protocole, 160 images par vue, meteo
claire forcee, heure 10:00) :

| Vue | Mediane | p95 | Appels | Triangles | Programmes |
| --- | --- | --- | --- | --- | --- |
| Poursuite | 16,5 ms | 18,4 ms | 297 | 49 198 | 52 |
| Libre (tarmac) | 12,7 ms | 18,5 ms | 194 | 44 634 | 52 |
| Terminal | 18,7 ms | 20,8 ms | 180 | 37 528 | 67 |
| Cabine | 23,0 ms | 24,9 ms | 683 | 50 614 | 104 |

Le surcout total des ombres, du bloom, du nouveau ciel, des marquages et du
detail de cellule est donc de **+2,6 ms en vue poursuite** (16,5 contre
13,9 ms) et de **−1,2 ms en vue libre** (12,7 contre 13,9 ms — la vue libre
gagne du temps, la carte d'ombre ne contenant alors que le joueur et les
agents proches, et le frustum serre ecartant davantage d'objets que la passe
supplementaire n'en coute). La vue cabine reste la plus lourde : elle est
inchangee depuis la phase 10, son cout vient du decor interieur lui-meme
(683 appels) et non des ajouts de cette phase — desactiver le bloom en cabine
ne la fait pas descendre sous 23,2 ms.

Le nombre d'appels de dessin en vue poursuite est passe de 148 a 297 : la
carte d'ombre redessine les objets qui projettent, et les trois passes de
bloom s'ajoutent. Le detail de cellule a lui seul aurait fait grimper la vue
poursuite a 463 appels ; le regroupement des elements repetes en
`InstancedMesh` (anneaux de joint, immatriculation, joints de voilure, grilles
d'inverseur) l'a ramene a 297. La scene compte desormais 1698 maillages. *(Ces chiffres sont ceux de la
phase 11 ; la phase 12 les remplace, voir le tableau plus bas.)*

### Passe de gameplay (`js/missions.js`, `js/mechanicSystem.js`, `js/airportTycoon.js`)

La phase 12 ne touche pas au decor : elle ferme les boucles de jeu qui
restaient ouvertes. Jusqu'ici on pouvait voler sans but, ignorer l'atelier
sans consequence, et le carburant etait gratuit.

**Contrats de vol (`js/missions.js`)**

Un contrat est actif en permanence. Il est tire parmi huit modeles et
s'affiche dans le bandeau du cockpit, dans le panneau de gestion et dans le
rapport d'atterrissage.

| Contrat | Critere | Prime |
| --- | --- | --- |
| Rotation commerciale | ≥ 120 passagers, poser < 320 fpm, ecart axe < 30 m | 45 000 EUR |
| Poser de precision | < 150 fpm, ecart axe < 8 m, inclinaison < 3 deg | 70 000 EUR |
| Vol de nuit | poser entre 20 h et 6 h, < 350 fpm | 80 000 EUR |
| Vol economique | ≥ 180 s de vol, ≤ 900 kg consommes | 60 000 EUR |
| Vent traversier | vent de travers ≥ 7 m/s, < 300 fpm, inclinaison < 5 deg | 85 000 EUR |
| Croisiere haute | ≥ 8 000 ft, ≥ 240 s de vol | 65 000 EUR |
| Appareil irreprochable | usure max < 55 %, < 300 fpm | 55 000 EUR |
| Long-courrier | ≥ 420 s de vol, ≥ 10 000 ft | 110 000 EUR |

Chaque critere est evalue separement et affiche son avancement en pourcentage
dans le rapport. Le contrat est rempli quand **tous** les criteres le sont ;
la prime (45 000 a 110 000 EUR) et le gain de reputation (2 a 5 points) sont
alors verses. Un contrat manque ne coute rien d'autre que l'occasion, mais il
est compte dans les statistiques. Le bouton « Proposer un autre contrat »
permet de relancer le tirage depuis le panneau de gestion. Un contrat dont le
contexte ne se prete pas (vent traversier par temps calme) est retire de
l'urne au tirage plutot que rendu impossible.

**Pannes en vol (`js/mechanicSystem.js` + `js/flightPhysics.js`)**

`failureRisk()` existait depuis la phase 10 mais n'etait jamais appele : un
appareil a 90 % d'usure volait exactement comme un appareil neuf. Le risque
est desormais tire **au decollage**, et il produit de vraies pannes.

- Le nombre de pannes suit le risque : un appareil a 20 % lache en moyenne une
  fois sur cinq, un appareil a 80 % lache presque a chaque vol, parfois deux
  fois. Un appareil parfaitement entretenu (usure 0, fluides et couples a
  100 %) a un risque exactement nul — verifie sur 500 tirages. Sur 200
  tirages avec tous les composants a 95 % d'usure, 198 produisent au moins
  une panne.
- Le composant tire est **pondere par son propre depassement de seuil** : sur
  400 tirages avec un pneu a 100 % et des freins a 76 %, le pneu sort 92 fois
  et les freins 18. C'est donc toujours le poste qu'on a neglige qui casse.
- Huit pannes distinctes, chacune avec son effet reel sur le modele de vol :

| Composant | Panne | Effet mesure |
| --- | --- | --- |
| `fanBlades` | Reacteur degrade | poussee ×0,55 par panne (montee 1 736 → 1 302 → 1 071 ft en 15 s) |
| `hydraulics` | Perte hydraulique | autorite de roulis ×0,62 (43,7 → 27,3 deg d'inclinaison) |
| `brakes` | Freins degrades | freinage reduit |
| `flapsActu` | Volets bloques | configuration figee, `setFlaps()` refuse |
| `struts` / `airframe` | Amortisseur fuyant / fissure | trainee ajoutee |
| `tyresNose` / `tyresMain` | Crevaison | l'appareil tire au roulage |

- Une panne **aggrave** le composant (usure +12, fluide −18, couple −15) et
  ouvre un ordre de travail : il faut passer a l'atelier avant de repartir.
- **Reparer leve la panne** — mais seulement si le composant est reellement
  revenu dans le vert (usure < 55 % du seuil, fluide et couple > 55). Une
  reparation baclee laisse l'appareil en etat de vol degrade.

**Carburant (`js/airportTycoon.js`)**

`fuelPrice` ne servait qu'a la ligne de cout du rapport, apres coup : le
carburant etait gratuit en vol. Le plein est desormais une decision.

- Deux boutons dans le panneau de gestion : appoint de 3 000 kg et plein
  complet, au prix de 0,82 EUR/kg (2 460 EUR pour 3 t).
- Le reservoir demarre a 9 t sur 12 t, donc il y a toujours un appoint a
  decider. Le bouton se desactive quand le reservoir est plein.
- L'appareil ne peut pas acheter plus que sa tresorerie ne permet.

**Facture de crash**

Un crash ne coutait que de la reputation. Il coute maintenant de l'argent :
850 000 EUR de base, plus la gravite du poser (taux de chute au-dela de
900 fpm, inclinaison), plus 6 000 EUR par point d'usure du composant le plus
use. Un crash a 1 500 fpm avec un train rentre et un appareil use coute
environ 1,95 M EUR. La tresorerie peut passer negative : la compagnie
s'endette et doit se refaire.

**Niveau de compagnie**

Un seul chiffre donne un cap : `reputation × 0,5 + vols × 1,2 + infrastructures × 6`.
Le niveau se deduit du score (un palier tous les 60 points) et le panneau de
gestion affiche la barre de progression vers le palier suivant. C'est ce qui
donne un but aux ameliorations au-dela du seul revenu.

**Remise a zero**

Le menu pause gagne un bouton « Reinitialiser la progression » qui efface les
cinq cles de sauvegarde (tycoon, atelier, cabine, terminal, contrats) apres
confirmation, puis recharge la page. `tycoon.lastFlight` est desormais
persiste : le panneau « Dernier vol » survit a un rechargement.

**Un bug corrige au passage**

Le contrat actif etait sauvegarde en entier dans `localStorage`. Or ses
criteres portent des fonctions (`of: c => c.fpm < 320`), que `JSON.stringify`
supprime silencieusement. Au rechargement, le contrat revenait donc sans ses
criteres et `evaluate()` levait `crit.of is not a function` — a chaque image,
depuis le HUD. La sauvegarde ne conserve plus que l'identifiant du contrat et
le recharge depuis la definition du module ; `critProgress()` refuse en plus
tout critere sans fonction au lieu de planter.

**Mesures apres la phase 12** (meme protocole, 160 images par vue, meteo
claire forcee, heure 10:00) :

| Vue | Mediane | p95 | Appels | Triangles | Programmes |
| --- | --- | --- | --- | --- | --- |
| Poursuite | 11,9 ms | 13,9 ms | 202 | 31 402 | 131 |
| Libre (tarmac) | 14,7 ms | 16,9 ms | 895 | 62 538 | 131 |
| Terminal | 19,5 ms | 21,9 ms | 177 | 37 680 | 131 |
| Cabine | 19,3 ms | 22,1 ms | 416 | 33 504 | 132 |

La passe de gameplay n'ajoute **aucun** cout de rendu : elle ne touche ni au
decor, ni aux lumieres, ni aux shaders. Les ecarts avec le tableau de la
phase 11 viennent de la position de l'appareil et de ce qui entre dans le
frustum au moment de la mesure, pas du code ajoute. La scene compte 1702
maillages et 57 textures.

### Passe HUD et menus (`index.html`, `css/style.css`, `js/main.js`)

La phase 13 ne touche pas non plus au decor : elle reprend toute la couche
d'interface. Avant, chaque zone avait sa propre mise en page, les alertes
n'avaient qu'un seul niveau de gravite, les panneaux flottaient sans cadre
commun et le panneau de gestion etait une seule longue carte.

**Systeme de mise en page**

Quatre bandes partagees par les quatre zones, au lieu de positions absolues
repetees :

| Classe | Role |
| --- | --- |
| `.hud-top` | bande 1 : instruments, en haut au centre |
| `.hud-band-1` | bande 2 : consignes et rappels |
| `.hud-env` | pastille heure / meteo, toujours au meme endroit |
| `.hud-menu-btn` | bouton menu, toujours au meme endroit |
| `.hud-config` | colonne d'etat (volets, train, spoilers, inverseur) |
| `.hud-stack` | colonne en flux : alerte → phase → contrat → consigne |
| `.hud-band-inline` | rangee de pastilles qui passe a la ligne |

`.hud-stack` est la piece maitresse : au lieu de superposer alerte, phase,
contrat et consigne a des hauteurs fixes, elle les empile dans une colonne
flex. Ils ne peuvent donc **jamais** se recouvrir, quelle que soit la
longueur du texte ou la largeur de l'ecran. C'est ce qui a corrige les
chevauchements constates a 360 px de large.

**Hierarchie des instruments**

Les six cadrans sont groupes en trois grappes (`.gauge-cluster`) : pilotage
(IAS / ALT / V/S), navigation (HDG), moteur (N1 / FUEL). Chaque cadran a
maintenant trois etats visuels :

- normal : bordure grise ;
- `.caution` (ambre) : a surveiller — IAS proche du decrochage ou 25 % au-dessus
  de Vref, carburant entre 12 et 25 %, N1 avec une panne moteur ;
- `.warn` (rouge, avec halo pulsant) : action requise — decrochage, survitesse,
  carburant sous 12 %.

**Alertes a trois niveaux**

`.alert-box` porte desormais une classe de severite : `.sev-critical` (rouge,
texte blanc, halo), `.sev-warning` (ambre) et `.sev-info` (bleu). Une seule
alerte s'affiche a la fois, choisie par ordre de gravite decroissante :
panne → decrochage → survitesse → train non sorti → panne seche → carburant
faible. Le texte n'est reecrit que lorsqu'il change, pour ne pas toucher au
DOM a chaque image.

**Bandeau de contrat**

`.mission-chip` affiche le contrat actif avec une barre de progression
(`.mc-bar` / `.mc-fill`) et un pourcentage. Le libelle s'ellipse au lieu de
pousser la pastille hors de l'ecran, et la pastille passe au vert
(`.done`) quand tous les criteres sont remplis.

**Cartes de panneau**

Les six panneaux (pause, indiscipline, poste de maintenance, mini-jeu,
gestion, rapport) partagent maintenant `.panel-overlay` / `.panel-card`, avec
`.panel-head`, `.panel-title`, `.panel-sub`, `.panel-group`, `.panel-btn`
(+ `.primary`, `.danger`, `.ghost`, `.sm`), `.panel-row` et `.panel-note`.
Les ouvertures sont animees (`overlayIn`, `panelIn`).

**Panneau de gestion a onglets**

La carte unique est decoupee en trois onglets — Compagnie, Exploitation,
Flotte — pour eviter le defilement. Le clic est delegue depuis `setupUI()`,
donc les onglets fonctionnent sans re-cablage a chaque rafraichissement.

**Rapport d'atterrissage**

Le rapport gagne un macaron de note (`#repBadge`, lettre S / A / B / C / D / X
avec la couleur du palier), des blocs de resultat (`.rep-block.ok` /
`.rep-block.ko`) pour le contrat et l'etat de l'appareil, et deux tuiles de
bilan (`.rep-tile`) pour le profit et la maintenance.

**Accessibilite et petits ecrans**

- `:focus-visible` sur tous les boutons et zones tactiles.
- `@media (prefers-reduced-motion: reduce)` coupe le clignotement des alertes,
  le halo des cadrans en defaut et les animations de panneau.
- `@media (max-width: 380px)` : cadrans compacts, bouton menu reduit, bande
  d'instruments alignee a droite pour degager le coin superieur gauche, et
  contrat borne a 62 % de la largeur. Verifie a 360 × 640 : **aucun
  chevauchement** sur les quatre zones.
- `@media (max-height: 420px)` : bandes resserrees et cartes plus compactes.

**Aucun cout de rendu**

La passe est purement DOM et CSS. Les mesures apres coup (echantillonnage
rAF, 120 images par vue) donnent 10,2 ms de mediane en poursuite, 9,1 ms sur
le tarmac, 13,6 ms au terminal et 16,6 ms en cabine — soit **mieux** que la
phase 12, l'ecart venant de la position de l'appareil et de ce qui entre dans
le frustum au moment de la mesure. Aucune lumiere, aucun shader et aucun
maillage n'a ete ajoute.

### Finition HUD (`index.html`, `css/style.css`, `js/main.js`)

La phase 14 reprend la passe precedente et corrige ce qui restait incoherent.

**Ecran de chargement**

`#boot` gagne une barre de progression (`#bootBar` / `#bootFill`) pilotee par
`window.load` : 55 % a l'entree dans le constructeur, 100 % une fois les
systemes prets, puis la barre s'efface (`.boot-bar.done`). En cas d'echec
d'initialisation, la barre disparait et le message d'erreur s'affiche a sa
place.

**Toasts qualifies**

`toast(msg, ms, kind)` accepte un troisieme argument qui colore la bordure :
`'ok'` (vert), `'warn'` (ambre), `'err'` (rouge). Les treize messages qui
portent une information de reussite ou d'echec (carnet signe, panne en vol,
tresorerie insuffisante, chariot vide, piece achetee, amelioration achetee,
appareil livre, incident resolu...) sont qualifies ; les messages neutres
(heure, meteo, changement de zone) restent sans couleur.

**Fermeture au clavier**

`closeTopPanel()` ferme le panneau ouvert le plus prioritaire : pause, puis
gestion, puis poste de maintenance. La touche `Echap` y est reliee dans le
gestionnaire `keydown` existant. Les panneaux **bloquants** — rapport
d'atterrissage, incident cabine, mini-jeu — ne se ferment volontairement pas
ainsi : ils attendent une decision du joueur.

**Coherence des seuils**

Le cadran carburant et l'alerte texte suivaient deux seuils differents : a
8 % le cadran etait rouge mais l'alerte ambre. Les deux suivent maintenant le
meme bareme, avec un palier supplementaire :

| Carburant | Cadran | Alerte |
| --- | --- | --- |
| > 25 % | normal | aucune |
| 12 – 25 % | `.caution` (ambre) | `CARBURANT A SURVEILLER` (`.sev-warning`) |
| < 12 % | `.warn` (rouge) | `CARBURANT FAIBLE` (`.sev-critical`) |
| 0 % | `.warn` | `PANNE SECHE` |

**Tresorerie negative**

`#tyCash` et `#partsCash` affichaient une tresorerie negative en vert. Les
deux passent au rouge sous zero.

**Corrections de mise en page**

- `.gauge.wide` etait declare deux fois : la seconde regle (valeur fixe de
  6,4 rem) ecrasait le `clamp()` responsive de la premiere. La declaration
  dupliquee est supprimee, donc les cadrans larges (satisfaction cabine,
  ambiance terminal) se reduisent enfin sur petit ecran — 83 px a 360 px de
  large au lieu de 102 px.
- `.hud-band-2` n'etait plus utilisee par aucune zone depuis la phase 13 :
  supprimee, ainsi que ses deux surcharges responsive.
- La colonne d'etat de configuration (`.hud-config`) etait positionnee par
  des classes utilitaires et recouvrait la colonne d'information a 360 px
  (les pastilles `FLAPS` / `GEAR` passaient sous le bandeau de contrat).
  Elle a sa propre regle, et sous 380 px la colonne d'information est bornee
  a 62 % de la largeur. Verifie a 360 × 640 et a 874 × 994 : **aucun
  chevauchement** sur les quatre zones.

**Verification**

Les quatre zones, les six panneaux, les trois onglets de gestion, les quatre
paliers de carburant, la panne moteur, les trois niveaux de toast et les deux
chemins de rapport (poser normal et crash) ont ete rejoues en direct : zero
erreur console. Les mesures rAF apres coup donnent 12,4 ms de mediane en
poursuite, 9,7 ms sur le tarmac, 15,9 ms au terminal et 19,4 ms en cabine,
conformes a la reference de la phase 12.

## Modeles glTF externes (`js/assetLoader.js`, `assets/models/`)

Depuis la phase 15, les PNJ et le joueur ne sont plus des capsules
procedurales : `buildTechnician()` charge `character.glb` (anime : marche et
repos). Une camionnette de piste, des palettes de fret, des valises et un groupe
electrogene (GPU) sont aussi importes. Le detail des sources, licences et des
choix ecartes (avion, hangars, terminal restent procéduraux) est dans
`assets/models/CREDITS.md`. Les credits CC-BY sont rappeles dans le menu pause.

- `spawnModel(url, opts)` renvoie tout de suite un groupe positionnable ; le
  maillage apparait quand le `.glb` est charge. Le squelette est clone
  (`SkeletonUtils`) : chaque instance a son propre `AnimationMixer`.
- `character.glb` est mis a l'echelle 0,325 (crane a ~1,71 m). La calotte de
  role (couleur) est posee a `y = 1,6`.
- L'avion jouable reste procedural : il faut des gouvernes separees et
  animables pour la physique de vol et le diagnostic du mecanicien.

## Passe de coherence visuelle (phase 16)

Audit visuel en direct de toutes les zones (tarmac, terminal, cabine, cockpit,
panneaux). Causes racines corrigees :

| Symptome | Cause | Correction |
| --- | --- | --- |
| Tout est sombre, meme a midi | Three.js 0.169 n'applique plus le facteur π aux lumieres ; toutes les intensites avaient ete reglees pour l'ancien mode | `LIGHT_GAIN = Math.PI` (`js/environment.js`), applique a toutes les lumieres |
| Interieurs delaves | En interieur la carte d'ombre du soleil est coupee : le soleil traversait le toit | Soleil et lune a 0, hemisphere et ambiance reduits quand `cameraMode` est `cabin` ou `terminal` |
| Lampes du hall sans effet | Position `x = ±10` au lieu de `hcx ± 10` (repere monde) | Corrigee |
| Echelle de texture aleatoire (sol geant, rayons en cabine) | `pbr()` ecrivait `repeat` sur des textures **memoisees et partagees** ; le dernier materiau cree gagnait | `withRepeat()` derive une copie par couple (texture, repeat), l'image reste partagee |
| Tapis et sieges noirs | Textures deja sombres multipliees par une teinte sombre | `TEX.carpet` et `TEX.fabric` rendues neutres et claires : la teinte du materiau donne la couleur |
| Casque flottant | `y = 1,88` pour un crane a 1,71 m | `y = 1,6` |
| Vue cassee dans le terminal / la cabine | La camera 3e personne reculait **hors** du volume (cloisons a simple face, donc invisibles de dehors) | Camera bornee au hall (`terminalHall`) et au tube de cabine ; apparition en cabine a `z = -0,6` |
| Joueur enfonce dans le sol du hall | Le carrousel a bagages etait pose devant la porte, sur le point d'apparition | Range contre le mur ouest, tourne de 90° |
| Mur qui bouche la vue de poursuite | Passerelle decorative a `x = 390`, a 24 m de l'avion | Grille de postes recalee : 246, 306, [366 = joueur], 426, 486 |
| `devserver.py` se bloque | Serveur mono-thread | `ThreadingHTTPServer` |

Nuit : eclairage de base releve (hemisphere 0,32, ambiance 0,24, lune 0,45)
pour rester jouable. Les 12 tests de `test-navigation.html` passent.

**Choix conserve** : `scene.environment` reste vide (l'IBL n'est posee que
sur les materiaux metalliques, voir `refreshEnvMap`) : l'appliquer partout
coutait +2,4 ms par image.

**Reste a faire / decisions ouvertes** : profit estime negatif au tout premier
vol (il est calcule sur les passagers reellement embarques au terminal, donc
faible tant que le hall n'a pas tourne — choix de design) ; l'altitude affichee
au sol vaut ~10 ft (position Y du centre de gravite, pas une hauteur sol) ;
`renderer3d.js` (3 600 lignes) et `main.js` (1 900 lignes) meriteraient d'etre
decoupes ; le jeu depend toujours de CDN (Three.js, Tailwind).

## Mode Arcade (phase 17) — le jeu adapte aux enfants

Deux modes, au choix sur l'ecran de demarrage (et dans le menu pause, ce qui
recharge la page ; la progression est conservee) :

| | Arcade (par defaut) | Pilote |
| --- | --- | --- |
| Aide | objectif + fleche + faisceau lumineux | aucune |
| Vol | poussee, rotation, train, volets, freins automatiques | tout a la main |
| Atterrissage | approche guidee, arrondi automatique, note en etoiles | rapport technique |
| Maintenance | un seul geste, pieces gratuites, barre de sante | 3 manches, pieces payantes |
| Cabine | pas de turbulences ni d'incidents, chariot auto-recharge | complet |
| Economie | pieces (1 piece = 1 000 EUR), recettes x3, cout forfaitaire, jamais de faillite | complete |
| Tour | cartes d'ameliorations, 3 prix de billet | 3 onglets detailles |

Le mode Pilote est l'ancien jeu, inchange. Tout ce qui est propre a l'Arcade
est inerte quand `arcade.on` est faux (classes CSS `.arcade-only` / `.pro-only`
sur `<body class="arcade">`).

### Boucle de jeu

1. **Tutoriel guide** de 8 etapes (`STEPS` dans `js/arcade.js`) : marcher →
   reparer → entrer au terminal → servir 3 passagers → visiter la tour →
   decoller → 3 anneaux → atterrir. Chaque etape donne des pieces.
2. **Defis du jour** : 3 defis tires d'un jeu de 7, identiques toute la
   journee (graine sur la date), avec recompense.
3. **Niveau d'aeroport** (XP) : chaque niveau donne +100 pieces et des confettis.
4. **Etoiles** a chaque atterrissage : 3 si moins de 230 fpm et a moins de 14 m
   de l'axe, 2 si moins de 320 fpm et 20 m.

L'objectif courant s'affiche en haut (`#objBar`) avec une fleche qui tourne
selon la direction du joueur et la distance en metres. Sur le terrain, un
**faisceau de lumiere** (`Renderer3D.setBeacon`) marque la cible ; en vol, la
fleche montre l'anneau, puis la piste.

### Aide au pilotage (`js/flightAssist.js`)

Le joueur ne fait que **virer** (gauche/droite) et **monter/descendre**
(haut/bas). Le module lit l'etat de `Aircraft` et rend des commandes :

- au sol : freins serres tant que DECOLLER n'est pas presse, puis plein gaz,
  maintien de l'axe de piste, rotation a Vr ;
- en vol : ailes a plat et cap tenu quand le manche est relache, assiette
  tenue (au moins 8 deg en montee basse), garde-fou de decrochage, plafond a
  1 300 m, **altitude de securite de 110 m** hors approche, virages limites a
  10 deg tant que l'avion est bas ;
- train et volets automatiques selon l'altitude et la vitesse ;
- **approche guidee** quand l'avion est en finale (cap sud, a moins de 900 m de
  l'axe) : plan de descente de 3 deg, guidage lateral sur la *trajectoire sol*
  (donc correct par vent de travers), arrondi, spoilers, inverseurs et freins ;
- **aimant d'anneau** : sans action du joueur, l'avion s'oriente doucement vers
  l'anneau (4 a 5 sur 5 sans rien toucher, avec ou sans vent).

Boutons : **DECOLLER** (au bout de la piste, le roulage est automatique : « le
tracteur t'amene ») et **ATTERRIR (aide)**, qui replace l'avion en finale a
4 km de la piste. Apres l'atterrissage, « Retour a l'aeroport » ramene l'avion
a la porte.

### Tests hors navigateur

`tools/flightAssist.sim.mjs` fait voler la vraie physique avec l'aide, sans
navigateur : decollage, manche brutal (cabre, pique, virage a fond), 3 vents
avec turbulence, 3 departs d'approche, aimant d'anneaux. plus de 50 controles, dont :
aucun crash, pose a moins de 22 m de l'axe, moins de 350 fpm, arret complet.

```bash
npm install three@0.169.0 --no-save   # une fois, uniquement pour ce test
npm run test:flight
```

Le reglage du guidage lateral (`LAT_K`, `LAT_G`) vient d'un balayage sur
4 vents (jusqu'a 10 kt de travers, turbulence 1,0) et 4 departs : ecart maxi au
poser de 7 m. Le critere d'arret du rapport utilise la **vitesse sol** : par
vent, la vitesse air ne tombe jamais a zero.

### Autres fichiers

- `js/arcade.js` — objectifs, pieces/etoiles/niveau, defis du jour, anneaux,
  notes d'atterrissage, confettis, faisceau, sauvegarde (`skymanager.arcade`).
- `js/sfx.js` — sons de recompense (Web Audio, aucun fichier), coupables dans
  le menu pause.
- `js/main.js` — `applyArcadeFlags()`, `setupArcadeUI()`, `startArcadeFlight()`,
  `helpLanding()`, `returnHome()`, `showKidReport()`, `openKidTower()`,
  `arcadeCounter()`, `refreshStationPanelKid()`.
- Les modules economie, terminal et cabine portent un drapeau `arcade`
  (recettes x3, files plus fournies, pas d'incidents...).

Console : `__game.arcade.data` (progression), `__game.arcade.dailyItems`,
`__game.assist.state` / `.hint`, `__game.helpLanding()`.

**Limites connues** : pas de mode deux joueurs ; les anneaux sont regeneres
devant l'avion (pas de parcours fixe) ; l'interface n'a ete verifiee qu'a
375 px (telephone), 768 px (tablette) et sur ordinateur.

## Nouvelle carte (phase 18)

L'ancienne carte etait eparpillee : la tour et son bureau derriere le terminal
(250 m de marche depuis la porte), le parking **de l'autre cote de la piste**,
un taxiway qui ne rejoignait rien (des lignes jaunes peintes sur l'herbe),
des accessoires poses **a l'interieur** du terminal, des arbres sur le tarmac.

```
                    N (z -)
      piste ── bretelles ── taxiway ── AIRE ──────── HANGARS
     (x 0)                  (x 150)    x 120..540     x 510..570
                                         │ porte (366, 1168)
        TOUR + bureau (x 262..283) ──────┤
                                       TERMINAL  x 230..490
                                         │
              route (z 1290) ── ENTREE (x 660)
                                       PARKING  z 1306..1384
                    S (z +)
```

- **Bloc terminal / porte / passerelle : fige.** Comptoirs, navigation et PNJ
  en dependent ; tout le reste s'organise autour.
- **Tour et bureau** : a `(262, 1128)`, a 100 m de la porte, portes du bureau
  cote aire (avant : 250 m de marche en contournant le terminal).
- **Bretelles asphaltees** a z = 1380 (point d'attente ou le tracteur depose
  l'avion), 1000, 400 et -300, avec axe jaune et barres d'attente.
- **Cote ville** : route (z 1290) depuis le portail d'entree de l'enceinte,
  parking avec voitures et places libres, lampadaires, arbres d'alignement.
- **Panneaux d'orientation** (sprites) : TERMINAL, TOUR, HANGARS, PARKING,
  PISTE, ENTREE.
- **Accessoires** sortis du terminal (cones, groupes de parc, chariots,
  extincteur), voies de service arretees a la facade.
- **Arbres** : plus aucun dans l'enceinte de l'aeroport.
- **Mini-carte** (Arcade) : piste, bretelles, aire, terminal, tour, hangars,
  parking ; le joueur (pointe rouge), l'avion (blanc) et l'objectif (etoile
  qui pulse). Affichee au sol et dans le terminal.

`js/layout.js` regroupe les rectangles du plan (piste, taxiway, aire, terminal,
tour, bureau, hangars, route, parking, entree). Le rendu (`renderer3d.js`) et
la mini-carte (`arcade.js`) l'utilisent. La navigation garde ses propres
obstacles, mais 5 tests (`js/navigation.test.js`, 17 en tout) verifient qu'ils
restent d'accord avec le plan : obstacles = terminal/bureau/hangars, tour
contenue dans son obstacle et a moins de 130 m de la porte, aucun
chevauchement, point de gestion praticable, bretelles sans batiment.

**Limite** : la piste garde ses 3 000 m (le decollage en demande 1 700) ; le
plan reste donc etire, mais tout ce qui se joue a pied tient dans un rayon de
250 m de la porte.

## Deplacements en cabine (phase 19)

Avant, la cabine se parcourait sur un **rail** : deux boutons AVANT / ARRIERE, un
seul axe, une entree qui faisait apparaitre le joueur au galley et une sortie
cachee dans le menu pause. Le reste du jeu (tarmac, terminal) se jouait pourtant
au joystick.

- **Meme joystick** que le tarmac et le terminal (`this.cabCtl`, fleches / ZQSD au
  clavier) :
  - **haut** : avancer dans le sens du regard ;
  - **bas** (0,3 s) : demi-tour, puis on avance dans l'autre sens ;
  - **gauche / droite** : se decaler dans l'allee (1,3 m de large) pour se
    rapprocher d'un siege.
- Le cap reste **aligne sur l'allee** (0 = avant, PI = arriere) : on ne se coince
  jamais dans un siege et la camera ne regarde jamais un mur.
- **On entre par la porte** avant gauche (z = -5,2), face a l'avant, comme si on
  venait de la passerelle.
- **On sort en marchant jusqu'a la porte** : dans l'ouverture (paroi gauche,
  z -6,8 a -5,2) le bouton « 🚪 SORTIR DE L'AVION » apparait et on reparait sur le
  seuil, cote passerelle (`exitCabinByDoor()`).
- **Le cockpit est accessible a pied** : tout devant, quand le chariot est plein
  (en Arcade il se recharge tout seul), « ✈️ ALLER AU COCKPIT » (`boardAircraft()`
  quitte la cabine proprement).
- **Reperes dans la cabine** : panneaux SORTIE et COCKPIT, anneau vert au sol devant
  la porte ; en Arcade la fleche d'objectif montre le passager qui attend le plus
  longtemps (`Arcade.cabinTarget()`).

Etat de l'hotesse : `attendant = { x, z, heading, target, moving }` dans le repere
cabine. Le code est dans `updateCabin()` (`js/main.js`) ; la camera
(`updateCabinCamera`) reste dans le tube et dans l'allee.

**Premier contact** : le joueur apparait face a l'espace libre (cap ouest). Avec l'ancien cap il
faisait face au fuselage et « avancer » ne le deplacait pas ; l'objectif « deplace-toi » compte
aussi le fait de tourner. Tout devant en cabine, avec le chariot plein, le cockpit prime sur le
siege de la rangee 1.

**Limite** : les bouts de l'allee (galley, sanitaires) restent des butees ; le
joueur ne peut pas entrer dans les rangees de sieges.

## Cockpit et vue de pilotage (phase 20)

Avant, la « vue cockpit » n'etait qu'une camera dans le nez, coque masquee, sans
aucun decor ni instrument. Le poste est maintenant un vrai modele 3D (`js/cockpit.js`),
parente au groupe de l'appareil et visible **uniquement en vue cockpit** (le reste du
temps il est cache, donc sans cout de rendu).

- **Tableau de bord** : trois ecrans dessines sur canvas (~14 images/s) + un affichage
  secondaire.
  - *PFD* : horizon artificiel (tangage/roulis), bande de vitesse avec zone rouge sous
    le decrochage et repere Vref, bande d'altitude, vario, ruban de cap, hauteur radio-sonde,
    alertes STALL / OVERSPEED.
  - *ENGINE / SYSTEMS* : deux cadrans N1, carburant, volets, train, aerofreins, inverseur,
    frein de parc, facteur de charge et liste des alertes (rouge/ambre).
  - *NAV* : rose des caps, vitesse sol / vraie, cap, vent.
- **Piedestal** : manettes des gaz (suivent `ctl.throttle`, tirees en marche arriere quand
  l'inverseur est actif), levier d'aerofreins, levier de volets (5 crans), frein de parc
  avec voyant, levier de train avec voyants verts.
- **Volants** : celui du joueur suit le roulis (rotation) et le tangage (on le tire vers
  soi) ; celui du copilote l'imite.
- **Voyants MASTER WARN / CAUTION** sur le glareshield : ils clignotent avec les alertes.
- Decor : sieges, montants de pare-brise, plafonnier avec panneau lumineux, cloison
  arriere, eclairage d'ambiance.

### Regard libre et mouvements de tete (`updateCamera()`, `js/renderer3d.js`)

- **Glisser** sur la scene 3D (souris ou doigt) tourne la tete (±115° a l'horizontale,
  -50°/+40° en hauteur) ; le regard **revient au centre** des qu'on relache. Les zones
  du joystick et des gaz gardent leurs propres evenements.
- La tete vibre au roulage (proportionnellement a la vitesse), tremble en turbulence et
  s'affaisse legerement sous facteur de charge. Champ de vision de 82°.
- Le plan proche passe a 0,2 m en vue cockpit (0,5 m ailleurs) pour ne pas tronquer les
  volants ; il est remis a 0,5 m par les cameras du monde libre, de la cabine et du terminal.
- **Marcher jusqu'au cockpit depuis la cabine** (`boardAircraft()`) installe directement
  le joueur en vue cockpit ; monter par l'echelle garde la vue poursuite.

### Autres changements de la phase

- **Vue poursuite** : la camera suit un tiers du roulis (on sent les virages) et le champ
  de vision s'ouvre avec la vitesse (58° a l'arret, jusqu'a 70°).
- **Mini-PFD du HUD** (`#pfdHud`, mode Pilote, vues exterieures) : meme `drawPFD()` que
  l'ecran du cockpit, en haut a gauche sous l'heure. Masque en Arcade et en vue cockpit
  (le reticule DOM aussi, via `body.view-cockpit`).
- **Vitres du poste sur l'exterieur** : deux panneaux de pare-brise et une vitre laterale
  de chaque cote, poses sur le cone du nez (masques en vue cockpit avec la coque).
- **Correctif** : la coque n'est plus masquee dans le monde libre si la derniere vue
  choisie en vol etait « cockpit » (`_pilotCamActive`).
- `cam.up` est remis a la verticale a chaque changement de camera (la poursuite l'incline).

## L'aeroport vit (phase 20)

La carte etait un decor fige. `js/airportLife.js` (construit par `Renderer3D` a la fin
de `buildAirport`, mis a jour a chaque image depuis `main.js`) la fait vivre. Tout est
cinematique (aucune physique), avec une trentaine de petits groupes.

**Nouveaux batiments et equipements** (positions dans `js/layout.js`)

| Quoi | Ou |
| --- | --- |
| Caserne de pompiers + parvis + 2 camions | z 1425..1465, au bout de la bretelle de depart |
| Route de service le long de la piste | x 62, z 1005..1392 |
| Depot de carburant (3 reservoirs, local, tuyau) | x 585..640, z 790..830 |
| Hall de fret (5 quais) + 2 fourgons | x 190..270, z 785..845 |
| Heliport (grand « H ») | (95, 1190) |
| Aviation legere (4 petits avions colores) | x 70..130, z 640..720 |
| Entree cote ville du terminal (porte, auvent, « DEPARTS ») | (360, 1265) |
| PAPI (4 feux rouge/blanc) | seuil nord de la piste |
| Feux de taxiway bleus, feu vert/blanc de la tour | taxiway, sommet de la tour |

**Vehicules** (`Mover`, itineraires `LAYOUT.routes`) : un tracteur a 3 chariots de bagages
(terminal → avion du joueur, 18 s d'arret), un bus passagers (terminal → avion du poste 2),
un camion-citerne (depot → poste 2), un fourgon de fret, un camion de pompiers en patrouille
le long de la piste, 5 voitures sur la route cote ville qui entrent, se garent et repartent.
Ils **freinent devant le joueur** et devant un autre vehicule, et le tracteur ne sert le poste
du joueur que si l'avion y est. Gyrophares clignotants, phares allumes la nuit.

**Avion de ligne** (poste 2, x 450 z 1010) : un cycle d'environ 9 minutes — au poste (45–70 s)
→ roulage jusqu'a l'attente de piste (z 1380) → alignement → decollage → ciel → (absent
45–80 s) → approche a 3 deg → poser → roulage en piste → sortie par la bretelle z = -300 →
retour au poste. **Il ne prend jamais la piste du joueur** : les operations sur piste
s'arretent (l'avion disparait proprement) des que le joueur monte dans l'avion, et
reprennent quand l'avion du joueur est revenu a la porte (`runwayFree`). Son obstacle de
navigation (`staticAircraft`) n'est actif que tant qu'il est au poste.

**Helicoptere** : rotor au ralenti sur l'heliport, decolle toutes les 1 a 2 minutes, fait un
tour de l'aeroport a 70 m, se repose. Il ne vole pas quand le joueur pilote.

**Voyageurs** : 8 personnages animes vont du parking a l'entree « DEPARTS » et disparaissent
dans le terminal, puis reapparaissent. **Trafic lointain** : 3 avions traversent le ciel a
1 500–2 600 m (visibles uniquement quand le joueur pilote). **Manche a air** orientee selon
le vent, **vitrage du terminal** allume la nuit.

**Mini-carte** (Arcade) : vehicules en jaune, avion de ligne en blanc, helicoptere en rouge.

**Tests** : `js/navigation.test.js` compte 21 tests (5 pour cette phase) : batiments qui ne se
chevauchent pas, dans l'enceinte et hors piste/taxiway/aire, itineraires qui ne traversent
aucun batiment, roulage qui relie le poste, l'attente et une sortie de piste. La machine a etats
de l'avion a ete rejouee sur plus de 15 minutes de jeu accelerees (2 cycles complets, retour
exact au poste).

**Cout** : environ 1,6 ms par image mesure sur la machine de test (lente), pour un nombre
d'appels de rendu quasi inchange (~310).

**Limites** : les vehicules et les avions ne sont pas des obstacles pour le joueur (comme les
autres accessoires de piste) ; ils freinent mais le joueur peut les traverser. Le tracteur, le
bus et le camion-citerne n'ont pas de conducteur visible.

## Exterieur de l'appareil (phase 21)

La cellule est construite par `js/airframe.js` (avant : capsule + cone, ailes en plaques
extrudees, nacelles cylindriques).

- **Fuselage** : solide de revolution a profil reel (`fuselageRadius(z)`) : nez arrondi avec
  radome gris, troncon cylindrique de rayon 1,95 m entre z = -13 et 9,5 (cote dont
  dependent la cabine et le cockpit), cone arriere relevee de 1,5 m. Les UV suivent
  l'abscisse reelle, ce qui evite l'etirement de la texture de peau.
- **Voilure** : loft de profils NACA sur 5 stations (emplanture, cassure, saumon) avec
  fleche, effilement, dihedre et epaisseur decroissante ; sharklets ; carenage de raccord
  ventral. `wingLE/wingTE/wingY(x)` donnent la geometrie a tout le code qui pose quelque
  chose sur l'aile.
- **Surfaces mobiles** (`makeControlSurface`) : volets, ailerons et spoilers sont poses sur le
  vrai bord de fuite, charniere alignee sur la fleche (pivot en ordre d'Euler `YXZ` :
  `rotation.x` reste l'angle de deflexion, l'animation de `syncAircraft` est inchangee).
- **Empennage** : derive galbee, plan fixe profile, gouverne de profondeur trapezoidale,
  gouverne de direction a charniere inclinee.
- **Nacelles** : capot, levre d'entree, paroi interne sombre, tuyere, cone d'echappement,
  pylone profile, ogive tournante et 14 aubes.
- **Appareils gares** : meme cellule reduite a 70 %.
- **Correctifs** : les rangees de rivets etaient des demi-cylindres decales qui sortaient de
  la coque (traits noirs sur le dessus du fuselage) ; joints, hublots et anneaux s'arretent
  maintenant avant le cone arriere ; feux de navigation, strobes, feu de queue et balais
  statiques suivent la nouvelle geometrie.

## Terminal integre a la carte, trains et decor (phase 22)

### Le terminal, batiment du monde ouvert (`js/terminalBuilding.js`)

Avant, le terminal etait un bloc opaque de 260 m dont seul un hall de 38 x 34 m etait
creux ; on y « entrait » par un bouton, avec un etat `TERMINAL`, une autre camera, un autre
HUD et un autre joystick. Maintenant :

- **Plus d'etat `TERMINAL`** : le joueur marche du tarmac ou de la ville jusque dans les
  comptoirs avec le meme avatar, la meme camera (`updateHubCamera`, qui reste sous le plafond
  et entre les murs a l'interieur) et le meme joystick. `this.inTerminal` bascule un bandeau
  de statistiques (ambiance, files, embarques, recette) et le bouton de comptoir dans le HUD
  du monde libre. Le repere `terminal` (ancien bouton) reste un point de guidage Arcade
  (`passive: true`).
- **Six portes vitrees** : trois cote piste (x 300, 360, 420) et trois cote ville, definies
  dans `LAYOUT.terminal` et partagees par le rendu et la navigation (`PORTALS` est genere
  depuis ce plan).
- **Un seul volume de 258 x 68 m**, visible de l'exterieur a travers le vitrage : facades
  vitrees a meneaux, marquises, colonnes, toit debordant, lanterneau central vitre,
  enseigne monumentale, ponts d'embarquement stationnes aux quatre autres postes avec leur
  numero de porte peint.
- **Parcours du passager** : entree cote ville → enregistrement (3 comptoirs, sud) →
  controle de surete → boutiques et cafe → salons d'embarquement et porte (nord, face aux
  avions). Salle des bagages a l'ouest (carrousel a valises), deux blocs sanitaires, borne
  d'information, chariots, plantes, deux grands tableaux des departs a deux faces, panneaux
  d'orientation suspendus. Les positions des postes sont dans `COUNTERS`
  (`js/terminalSystem.js`) ; les obstacles dans `LAYOUT.termFurniture`.
- **Navigation** : la zone `termHall` couvre tout le batiment et porte ses propres
  obstacles (`blocker.zone`, comptoirs, carrousel, sanitaires, sieges) ; les obstacles sans
  `zone` restent ceux du tarmac. Le pas d'echantillonnage des segments passe de 1,5 a 0,8 m :
  un segment de trajet pouvait enjamber un mur de 1 m. Les PNJ passagers se rassemblent
  aux files, salons, promenade et portes (`agents.js`).
- **Eclairage** : le mobilier porte sa propre lumiere (ambiance + trois lampes) qui
  s'allume progressivement a l'approche du batiment et s'eteint de loin (`updateTerminalScene`),
  au lieu de rester active partout.
- **Cout** : mobilier fusionne (sieges instancies, passagers en un maillage a couleurs de
  sommet) : environ 370 objets pour tout l'interieur.
- **Tests** : `js/navigation.test.js` compte 25 tests (4 nouveaux : six portes franchissables,
  facades pleines, mobilier sans chevauchement, portes non obstruees).

### Trains d'atterrissage (`makeGear` dans `js/airframe.js`)

Jambe telescopique (fut peint + tige chromee), joint, carenage, compas, verin, contre-fiche,
trappe portee par la jambe, essieu, palonnier ; pneus de revolution a flancs bombes, jantes,
disques de frein et boulons visibles (la rotation se voit) ; train avant avec collier, phare
de roulage, garde-boue et barre de remorquage. Cotes de contact inchangees. Les trains
principaux se replient maintenant **vers l'axe** (ils sortaient vers l'exterieur). Les avions
gares utilisent les memes trains.

### Paysage et decor (`js/scenery.js`)

- **Montagnes** : trois chaines en anneau (8, 13 et 21 km), plus claires avec la distance,
  sommets enneiges ; remplacent les 26 cones.
- **Champs** : patchwork d'environ 250 parcelles teintees par instance + haies (un appel de dessin).
- **Forets** : 3 600 pins et feuillus en bosquets (bruit de valeur), hors enceinte, villes,
  lac et routes.
- **Ville** a l'ouest (4 200 maisons, quadrillage de rues, tours, eglise) et **village** a l'est,
  **lac**, **route** avec marquage reliant l'aeroport au village.
- **Aeroport** : numeros de piste peints (36 / 18), feux de seuil verts et de fin de piste
  rouges, panneaux de taxiway, mats d'eclairage de l'aire, parvis cote ville (trottoir,
  passages pietons, abribus, massifs, arbres d'alignement, bornes), lampadaires du parking,
  guerite et barriere d'entree.
- **Cout** : environ 340 000 triangles, dont l'essentiel est la foret ; le terrain ne fait que
  quelques appels de dessin.

**Limites** : le decor de l'aeroport d'avant (hangars, tour, vehicules, parking) est conserve ;
la scene compte encore de l'ordre de 850 appels de dessin quand tout est visible, ce qui
merite une passe de fusion de maillages avant un test sur iPad.

## Parcours passager (phase 25)

Avant, le hall n'etait qu'un jeu de files : on appuyait sur un bouton et un passager disparaissait,
sans rien verifier, et les commerces rapportaient de l'argent sans jamais rien vendre. Maintenant le
passager suit un **circuit logique**, chaque poste a sa **verification**, et les machines ont un **stock**.

```
 entree ville ──> ENREGISTREMENT ──> SURETE ──> commerces / distributeur ──> PORTE ──> avion
                     │  billet + bagage    plateau      (stock !)            carte
                     └──> TRI DES BAGAGES ──> tracteur ──> soute
   RESERVE (caisses) ──────────────────────────────────> recharge des machines
```

### A chaque poste, une decision (`js/terminalFlow.js`)

| Poste | Ce que le joueur lit | Choix |
| --- | --- | --- |
| Enregistrement | billet (vol) et bagage (kg, limite 20 kg) | ✅ valider · 💰 surcharge (4 €/kg) · ⛔ refuser |
| Surete | plateau du scanner (emojis) | ✅ passer · 🚫 confisquer (🔪 ✂️ 🧨 🍾 🔨) |
| Porte | carte d'embarquement (vol, place) | 📲 scanner · ⛔ refuser |

Le probleme est **ecrit** (le vol du billet est affiche a cote du vol du jour, le poids a cote de la
limite) : il suffit de lire. Environ 13 % de billets pour un autre vol, 16 % de bagages trop lourds,
20 % de plateaux dangereux, 10 % de cartes fausses. Une erreur affiche **pourquoi** (« 12 kg, sous la
limite de 20 kg ») ; une bonne decision rapporte des pieces (2 a 4) et de l'ambiance. Touches 1/2/3 au
clavier. Le panneau enchaine les passagers de la file.

### Un poste que personne ne tient laisse tout passer

Le poste continue de traiter sa file, mais **sans regarder** : les erreurs passent, ce sont des
*incidents* (objet interdit non vu, mauvais vol embarque...) qui font baisser l'ambiance du hall.
Le circuit ne se bloque donc jamais, mais un hall abandonne se degrade.

### Machines a stock et reserve

- **Boutique, cafe, distributeur** : 12 articles chacun. Le stock baisse avec les clients et les
  passagers qui passent apres la surete. Une machine **vide** ne vend plus (ventes perdues, clients decus).
  Jauge verte / orange / rouge sur chaque machine et puces `STOCK 🛍️ ☕ 🥤` dans le bandeau du terminal.
- **Reserve** (angle sud-est) : on y prend **une caisse de 8 articles** (visible devant le joueur, puce 📦) ;
  6 caisses en stock, une livraison toutes les 26 s. On la verse dans une machine (« RECHARGER ») ; si la
  machine est presque pleine, le reste de la caisse est garde.
- **Tri des bagages** (a cote du carrousel) : chaque bagage enregistre y arrive ; on les **charge** un a un.
  Le **tracteur** de l'aeroport attend au terminal tant que des valises sont a charger, puis part vers l'avion.
  Le rapport de vol affiche « N bagages charges ».
- Le guidage Arcade (fleche + faisceau) suit la logique : machine vide → reserve, caisse en main → machine la
  plus vide, valises en attente → tri, sinon le guichet le plus charge. Deux defis du jour en plus
  (recharger des machines, charger des bagages).

### Equilibrage (mesure, pas devine)

`tools/terminal.test.mjs` (`npm run test:terminal`, aucune dependance) simule le hall sur 7 minutes avec un
joueur attentif et sans joueur, sur 3 graines : joueur attentif **81–91 %** d'ambiance minimum ; hall
abandonne : ambiance qui s'erode jusqu'a ~0 % en 7 minutes, avec 2 a 3 fois plus d'incidents (30–48 contre
13–18) ; sans joueur le circuit avance quand meme (~60 embarques). La premiere version s'effondrait (32 %
en une minute meme avec un joueur) : arrivee des passagers ralentie, retour au calme a 0,3/s, bagages en
attente hors du compte des « files longues », ecoulement des stocks adouci en Arcade.

73 verifications : regles de chaque decision, proportions de problemes, circuit (l'enregistrement nourrit la
surete et le tri, pas directement la porte), refus, surcharge, stocks, caisses, reserve, livraison, rupture,
equilibrage. `js/navigation.test.js` (25 tests) verifie que les trois nouveaux meubles ne bouchent rien et
que chaque poste reste joignable.

**Limites (phase 25)** : dossiers tires au sort a chaque poste — leve en phase 26 ci-dessous.

## Foule et passagers suivis (phase 26)

Avant, les gens du hall etaient des figurants immobiles et chaque poste tirait un dossier au hasard.
Maintenant **chaque passager est reel** : il a un visage, un nom, une **couleur de chemise**, un billet, un
bagage, un plateau, une carte d'embarquement. Le meme dossier le suit de poste en poste, et on le voit
marcher.

```
 porte ville ─marche─> file ENREGISTREMENT ─> (allee sud) ─> file SURETE ─> (boutique / cafe / distributeur)
                                                                              │ arret 2 s, il achete si stock
                                                                              ▼
 passerelle <─marche─ PORTE <───────────────────────── allee centrale ────────┘
 refuse au guichet ou a la porte : il ressort par la porte ville
 detecteur de la porte : il retourne a la file de la SURETE
```

- **Foule visible** (`terminalSystem.crowd()` + `terminalBuilding.js`) : un lot de figurants par couleur de
  chemise ; ils gardent leur identite tant qu'ils sont dans le hall, rejoignent leur place quand la file avance
  (sans teleportation), marchent avec un petit rebond, et les trajets evitent le mobilier. Les anciens
  figurants des files (`agents.js`) sont retires : la foule, c'est les vrais passagers.
- **Le passager dont tu regardes le dossier est entoure d'un anneau dore avec une fleche** dans le hall, et
  sa couleur de chemise est ecrite sur le panneau (« Chemise jaune 🟨 »).
- **Une erreur a une suite, et une seconde chance** (`terminalFlow.gateNotes`) :

  | Erreur plus tot | Ce qui se passe a la porte | Comment la reparer |
  | --- | --- | --- |
  | Bagage lourd valide sans surcharge | Note « ⚠️ Son bagage pese 26 kg… surcharge non payee » | 💰 SURCHARGE (recette + points) |
  | Objet interdit laisse passer | Note « 🔔 Le detecteur sonne ! » | ⛔ REFUSER : il retourne a la surete, tu le fouilles, il revient |
  | Billet d'un autre vol valide | Sa carte le trahit | ⛔ REFUSER |
  | Passager refuse a la porte | Son **bagage** est deja au tri : il devient « abandonne » | 🗑️ RETIRER le bagage (le charger dans l'avion est un incident) |

- **Accessible a un enfant** : le probleme est toujours *ecrit* (notes jaunes), les messages d'erreur disent
  quoi faire et annoncent la seconde chance, les erreurs rattrapables sont peu punies, rien ne se bloque, un
  poste sans joueur continue de tourner. Compteur « erreurs reparees » dans les stats.
- **Embarquement** : compte quand le passager arrive a la passerelle (il y va a pied), ce qui relie
  proprement le hall a la recette du vol.

**Tests** : `npm run test:terminal` (124 verifications) couvre les regles, les trajets (`makeWalk`/`walkAt`),
la persistance d'un meme passager sur tout le circuit, les trois cas de rattrapage, le bagage abandonne, la
foule (positions valides, dans le batiment, un avatar par passager) et l'equilibrage sur 3 graines
(joueur attentif >= 91 % d'ambiance, ~43 embarques en 7 min ; hall abandonne : ambiance a 0 % et 2-3x plus
d'incidents). Verifie aussi en navigateur (foule qui marche, panneau de porte avec notes et refus).

**Limites** : au plus 10 passagers visibles par file (les suivants existent mais ne sont pas dessines) ;
la foule ne se voit que quand on est pres du terminal (economie de rendu) ; un passager qui va a une machine
fait un long detour (jusqu'a ~100 s) : c'est voulu, c'est ce qui rend le hall vivant.

## Iteration 1 — ce qui fonctionne

**Modele de vol** (`js/flightPhysics.js`)
- 6 degres de liberte, forces aerodynamiques reelles (portance, trainee induite +
  parasite, force laterale de derapage, poussee turbofan avec inertie de rotor).
- Decrochage progressif avec transition vers un regime de plaque plane.
- Moments aerodynamiques complets : stabilite statique longitudinale, amortissements
  en tangage/roulis/lacet, effet diedre, lacet inverse, stabilite de route.
- Train d'atterrissage a trois points : amortisseurs ressort/amortisseur, adherence
  laterale des pneus, freinage, orientation de la roue avant.
- Vent de travers, turbulence, densite de l'air variable avec l'altitude,
  consommation de kerosene et masse variable.

**Chiffres mesures sur le modele** (masse 67 t, volets 1)
- Vs 136 kt, Vr 154 kt, Vref 177 kt
- Distance d'arret depuis 140 kt : 728 m (freins seuls), 522 m (avec inverseurs)

**Scene 3D** (`js/renderer3d.js`)
- Piste de 3000 m balisee (axe, seuils, zones de toucher, feux de bord, rampe
  d'approche), taxiway, aire de stationnement, terminal, passerelles, tour de
  controle, hangars, relief lointain et bosquets (reperes de vitesse).
- Avion articule : volets, ailerons differentiels, profondeur, direction, spoilers,
  retraction des trains, rotation des soufflantes et des roues, feux a eclats,
  phare d'atterrissage.
- 4 cameras : poursuite, cockpit, exterieure orbitale, tour de controle.

**Ergonomie tactile** (`js/touchControls.js`)
- Joystick flottant a gauche (apparait sous le doigt), manette des gaz verticale a
  droite, palonnier et frein, boutons volets / train / spoilers / inverseurs / vue.
- Zone morte et reponse progressive sur le manche.
- Fallback clavier pour le test sur ordinateur : fleches (manche), Q/D (palonnier),
  W/S (gaz), Espace (freins).

**Boucle de jeu** (`js/main.js`)
- Detection de phase (parking, roulage, decollage, montee, croisiere, descente,
  approche, freinage) avec rappels de procedure contextuels.
- Alarmes : decrochage, survitesse, train non sorti, panne seche.
- Notation du poser : taux de chute en fpm, vitesse, inclinaison, ecart d'axe,
  configuration. Le resultat alimente l'usure mecanique, la satisfaction cabine
  et la tresorerie de la compagnie.

## Iteration 2 — l'atelier du mecanicien

Accessible en marchant jusqu'a un point de diagnostic sur l'appareil, ou
qu'il se trouve (voir "Monde libre" ci-dessus).

**Usure persistante** (`js/mechanicSystem.js`) — 8 composants (pneus avant/
principaux, freins, amortisseurs, actionneurs de volets, circuits hydrauliques,
soufflantes reacteurs, structure) dont l'usure est alimentee par chaque vol de
l'iteration 1 : atterrissage brutal, survitesse, survitesse volets, facteur de
charge excessif. Persistance via `localStorage`, donc l'usure traverse les
rechargements de page.

**Deplacement et diagnostic** (`js/mechanicControls.js`, `js/renderer3d.js`)
- Le technicien se deplace au joystick (ou ZQSD/fleches) autour de l'appareil
  parque, camera a la troisieme personne.
- 7 postes de travail repartis sur l'appareil (trains, ailes, reacteur,
  fuselage), chacun marque par un point lumineux au sol colore selon l'usure
  reelle des composants qu'il couvre (vert / orange / rouge, avec pulsation
  quand une intervention est requise).
- Un bouton **INSPECTER** apparait a portee d'un poste et ouvre la liste des
  composants concernes avec leur usure et un bouton **Reparer**.

**Mini-jeu de reparation : serrage au couple**
- Une aiguille oscille sur une jauge ; il faut taper quand elle passe dans la
  zone verte. 3 manches, de plus en plus rapides et etroites, dont la moyenne
  determine la qualite de la reparation (un bon serrage resorbe presque toute
  l'usure, un mauvais la laisse en grande partie).

**Carnet de route** — bouton **CARNET** dans le HUD mecanicien : signe la
conformite de l'appareil si aucun composant n'est au-dessus de son seuil
critique, sinon indique lequel bloque. Un appareil non conforme conserve un
risque de panne en vol (`mechanic.failureRisk()`, deja calcule, branche sur
l'iteration 4 pour les consequences economiques).

## Iteration 3 — la cabine et le service passagers

Accessible en marchant jusqu'a la passerelle d'embarquement (porte cabine
avant gauche). Bascule sur une vue en coupe de la cabine passagers,
independante de la scene exterieure (l'aeroport, le ciel et l'avion exterieur
sont masques pendant ce mode et restaures a la sortie).

**Deplacement et service** (`js/main.js`, `js/renderer3d.js`)
- L'hotesse/le steward se deplace dans l'allee centrale via deux boutons
  directionnels (AVANT / ARRIERE), camera a la troisieme personne.
- Des requetes passagers apparaissent aleatoirement (cafe, repas special,
  boisson fraiche), materialisees par une icone flottante coloree au-dessus
  de la rangee concernee, avec un compte a rebours (20 s). Non servies a
  temps, elles expirent et penalisent la satisfaction.
- S'approcher d'une rangee avec une requete active affiche un bouton
  **SERVIR** ; la rapidite du service determine le gain de satisfaction.
- Pres du chariot (entree de cabine), le bouton devient **VENDRE
  (DUTY-FREE)** et genere une recette immediate.

**Securite en cabine** (`js/cabinService.js`)
- *Turbulences* : declenchees aleatoirement, une alerte plein ecran avec
  compte a rebours (8 s) demande une **ANNONCE** ; sans reaction a temps la
  satisfaction chute fortement (consignes de securite / trolleys non
  securises).
- *Passager indiscipline* : un incident aleatoire est localise sur une
  rangee (anneau rouge pulsant au sol) ; s'en approcher et taper **GERER
  L'INCIDENT** ouvre un choix rapide entre apaiser soi-meme ou appeler le
  commandant de bord, chacun avec un impact different sur la satisfaction.

**Donnees persistantes** — satisfaction (0-100%) et recette duty-free
cumulee, sauvegardees en `localStorage` et deja utilisees par le rapport
d'atterrissage de l'iteration 1 (`cabin.registerFlight`).

## Iteration 4 — gestion de l'aeroport (tycoon)

Accessible en marchant jusqu'au bureau d'exploitation au pied de la tour de
controle, ou directement depuis l'ecran d'atterrissage (bouton **Voir le
bilan aeroport**). C'est un tableau de bord de gestion (pas de scene 3D a
l'interieur) : les decisions economiques s'appliquent simplement au prochain
vol.

**Economie** (`js/airportTycoon.js`)
- Prix du billet ajustable (+/- 10 EUR, 80-400 EUR) : un prix trop eleve
  reduit la demande passagers, calculee aussi a partir de la reputation et
  des infrastructures.
- 5 ameliorations a acheter avec un cout croissant a chaque niveau (pistes,
  portes, extension terminal, boutiques, salon VIP) ; chacune a un effet
  concret sur la recette ou la reputation.
- Achat de nouveaux appareils (cout croissant, plafonne par le nombre de
  portes disponibles) : chaque appareil supplementaire genere un revenu
  passif a chaque vol, en simulant le reste de la flotte qui continue
  d'operer pendant que vous pilotez.

**Boucle complete** — le rapport d'atterrissage de l'iteration 1 affiche
desormais le profit du vol et le statut de conformite mecanique, avec des
raccourcis directs vers l'atelier de maintenance et le tableau de bord
aeroport : **Vol → Atterrissage → Maintenance → Gestion → Nouveau vol**.

## Interieur du terminal — files d'attente

> **Phase 22** : le terminal n'est plus un etat a part ; voir « Terminal integre a la carte »
> ci-dessous. Ce qui suit (comptoirs, files, ambiance) reste valable.

Accessible en marchant : c'est un batiment du monde ouvert.

**Comptoirs et files d'attente** (`js/terminalSystem.js`, `js/renderer3d.js`)
- 3 comptoirs d'enregistrement + 1 controle de surete, chacun avec sa propre
  file de passagers, visible sous forme de personnages en attente (jusqu'a
  12 par file) qui apparaissent et disparaissent en temps reel selon le
  nombre reel de passagers.
- Un comptoir ferme n'accepte aucun passager mais la file continue de
  grossir devant lui ; l'ouvrir (bouton contextuel en s'approchant) demarre
  un traitement automatique lent, et le voyant passe du rouge au vert.
- Le joueur peut aussi traiter manuellement le passager en tete de file
  (bouton **SERVIR**) pour resorber rapidement une file trop longue.
- Une jauge **Ambiance terminal** (0-100 %) se degrade quand plusieurs files
  depassent 10 passagers, et se redresse sinon ; elle influence legerement
  la reputation de la compagnie a chaque atterrissage, comme les autres
  modules.
- Salle d'embarquement avec passagers assis en arriere-plan, pour
  l'ambiance.

**Simplification assumee** : pas de cout direct associe a l'ouverture d'un
comptoir (contrairement aux ameliorations de l'iteration 4) — c'est un choix
purement strategique de gestion des files, pas une decision budgetaire.

## Lancer en local

```bash
python devserver.py 8123
```

Puis ouvrir http://localhost:8123. Ce petit serveur est identique a
`python -m http.server` mais desactive le cache navigateur (Cache-Control:
no-store) et multi-thread (un navigateur ouvre plusieurs connexions ; un serveur
mono-thread se bloquait apres `index.html`) — utile pendant le developpement pour ne jamais voir une version
perimee des modules JS. `python -m http.server 8123` fonctionne aussi pour un
simple test, mais forcez alors un rechargement complet (Ctrl+Maj+R) apres
chaque modification de fichier JS.

## Deploiement sur iPad / iPhone (sans compte developpeur)

1. Creer un depot GitHub public et y deposer l'integralite des fichiers.
2. Settings > Pages > Source : `main` / `root`, puis valider.
3. Ouvrir l'URL `https://<utilisateur>.github.io/<depot>/` dans Safari sur l'iPad.
4. Bouton Partager > **Sur l'ecran d'accueil** : le jeu s'ouvre alors en plein
   ecran tactile, sans barre de navigation.

Aucune etape de build n'est necessaire : Three.js est charge via importmap depuis
un CDN et Tailwind via son CDN.

## Structure

```
/
├── index.html              Structure UI (Tailwind) et couche HUD (phases 13 et 14)
├── css/style.css           Styles, ergonomie tactile et systeme de design HUD (phases 13 et 14)
├── js/main.js              Boucle principale et machine a etats
├── js/renderer3d.js        Scene Three.js
├── js/flightPhysics.js     Moteur aerodynamique
├── js/touchControls.js     Joystick, manette des gaz, palonnier (pilote)
├── js/mechanicControls.js  Joystick de deplacement du technicien (iteration 2)
├── js/navigation.js        Graphe de navigation, portails, A* (monde unifie)
├── js/agents.js            PNJ autonomes : besoins, routines, pathfinding
├── js/mechanicSystem.js    Usure, fluides, couple, pieces, ordres de travail, pannes (iterations 2, 10 et 12)
├── js/cabinService.js      Requetes, chariot, ceintures, rangees, duty-free (iterations 3 et 10)
├── js/airportTycoon.js     Economie, infrastructures, flotte, carburant, niveaux (iterations 4 et 12)
├── js/terminalSystem.js    Comptoirs, files, economie du hall (phase 10)
├── js/missions.js          Contrats de vol, evaluation, primes (phase 12)
├── js/environment.js       Cycle jour/nuit et meteo dynamique (phase 7)
├── js/textures.js          Textures procedurales sur canvas (phase 8)
├── js/assetLoader.js       Chargeur glTF, clonage de squelettes (phase 15)
├── js/arcade.js            Mode Arcade : objectifs, pieces, etoiles, defis, anneaux (phase 17)
├── js/flightAssist.js      Aide au pilotage : decollage, approche guidee, arrondi (phase 17)
├── js/cockpit.js           Poste de pilotage 3D, ecrans PFD / moteurs / nav, drawPFD() (phase 20)
├── js/airframe.js          Cellule : fuselage, voilure loftee, nacelles, empennage (phase 21)
├── js/terminalBuilding.js  Terminal : coque vitree, hall, mobilier (phase 22)
├── js/scenery.js           Paysage et decor de l'aeroport (phase 22)
├── js/sfx.js               Sons de recompense Web Audio (phase 17)
├── js/layout.js            Plan de l'aeroport : une seule source des positions (phases 18 et 20)
├── js/airportLife.js       Trafic et batiments annexes : l'aeroport vit (phase 20)
├── js/terminalFlow.js      Regles de verification, dossier de passager persistant (phases 25-26)
├── js/fun.js               Acrobaties, turbo, fumee, mascotte Coco, photo, coffre (phase 33)
├── js/fleet.js, planeModels.js, livery.js, hangar.js   Avions, peinture, hangar (phase 34)
├── js/skyMissions.js, skyWorld.js   Missions aeriennes (phase 35)
├── js/minigames.js, groundFun.js, album.js, deco.js   Mini-jeux, evenements au sol, album, Ma place (phase 36)
├── js/openWorld.js         Mer, iles, etoiles, surprises, evenements du ciel (phase 37)
├── js/comfort.js, music.js Reglages, qualite auto, musique (phase 38)
├── js/heliModel.js         Helicoptere arcade (phase 39)
├── tools/fleet.sim.mjs, data.test.mjs   Tests des avions et des catalogues (npm test)
├── tools/terminal.test.mjs Tests du circuit passager, des stocks et de l'equilibrage (npm run test:terminal)
├── tools/flightAssist.sim.mjs  Tests de vol hors navigateur (npm run test:flight)
├── package.json            Uniquement pour les tests hors navigateur
├── js/navigation.test.js   Tests d'invariants du graphe de navigation
├── test-navigation.html    Page qui execute ces tests (via devserver.py)
├── assets/models/          Modeles .glb (poly.pizza) et CREDITS.md
├── .claude/launch.json     Configuration du serveur de previsualisation
└── devserver.py            Serveur local multi-thread sans cache (voir "Lancer en local")
```

## Console de debogage

L'objet de jeu est expose : `window.__game` (`.ac` pour l'avion, `.r3d` pour la
scene, `.nav` pour le graphe de navigation, `.agents` pour les PNJ
(`.agents.debug()`, `.agents.needsSummary()`), `.mechanic` / `.cabin` / `.tycoon`
pour les modules). `.controlled` / `.controlRole` donnent l'agent actuellement
incarne, le cas echeant. `.worldUpdate(dt)` / `.worldReport()` / `.announceWorld()`
pilotent la boucle continue, et `._worldPaused` / `._worldAcc` / `._fleetAcc`
exposent son etat interne.

L'environnement (phase 7) est accessible via `.env` : `.env.setHour(22)` saute
a 22 h, `.env.advanceHour(1)` avance d'une heure, `.env.forceWeather()` tire un
nouvel etat meteo, `.env.chip()` / `.env.report()` resument heure et meteo, et
`.env.params` donne les valeurs courantes (couverture nuageuse, pluie,
brouillard, turbulence).

Les textures (phase 8) sont accessibles via `TEX` importe dans
`js/renderer3d.js` : `TEX.grass()`, `TEX.metal()`, etc. renvoient le jeu de
cartes memoise, et `TEX.disposeTextures()` libere la memoire GPU. Le nombre de
textures chargees se lit dans `__game.r3d.renderer.info.memory.textures`.

La carte d'environnement se pilote via `__game.r3d.refreshEnvMap(h)` : elle
regenere la cubemap de ciel pour une heure donnee et la repose sur les
materiaux metalliques. `__game.r3d._envRT` donne la render target PMREM
courante, `__game.r3d._envHour` l'heure du dernier rafraichissement, et
`__game.r3d._envDomeMat.uniforms` les couleurs du dome source.

Les trois zones approfondies (phase 10) s'inspectent directement :

- **Terminal** — `__game.terminal.counters` est un objet indexe par
  identifiant (`checkin1`, `gate`, `shop`...), pas un tableau. Chaque entree
  porte `open`, `queue`, `pos`, `facing`. `__game.terminal.revenue` /
  `.boarded` / `.missed` / `.mood` donnent les compteurs, et
  `.actionLabel('gate')` le libelle du bouton contextuel.
- **Cabine** — `__game.cabin.cartStock` / `.cartCapacity` pour le chariot,
  `.seatbeltSign` pour la consigne, `.rowSatisfaction` (tableau de 10 notes)
  et `.worstRow()` pour la rangee critique. `.serve(id)` renvoie
  `{ gain, reason }` ou `reason` vaut `'ok'`, `'stock'` ou `'seatbelt'`.
- **Atelier** — `__game.mechanic.components` donne usure, fluide et couple par
  composant ; `.parts` le stock de pieces ; `.openWorkOrders()` les ordres en
  cours ; `.failureRisk()` le risque de panne ; `.buyPart('tyre', 1, cash)`
  achete une piece. `__game.r3d.applyWearVisuals(__game.mechanic)` force la
  mise a jour des taches de crasse, de suie et de poussiere sur l'appareil.

Le gameplay (phase 12) s'inspecte et se force :

- **Contrats** — `__game.missions.active` donne le contrat en cours,
  `.evaluate(__game.missionContext())` son avancement, `.reroll(ctx)` en tire
  un autre, `.completed` / `.failed` / `.earned` les statistiques, et
  `.history` les derniers resultats. `__game.missionContext()` construit le
  contexte a partir du journal de vol courant.
- **Pannes** — `__game.mechanic.rollFailures()` tire les pannes sans les
  appliquer, `__game.mechanic.failureRisk()` donne le risque courant,
  `__game.ac.applyFault('thrust')` applique une panne a la main,
  `__game.ac.clearFaults()` les efface, `__game.ac.faults` les liste et
  `__game.ac.hasFault` dit s'il y en a. `__game.rollFaults()` fait le tirage
  complet (application + aggravation + alerte). `__game.clearFaultFor('fanBlades')`
  leve la panne d'un composant repare.
- **Carburant** — `__game.tycoon.refuel(__game.ac)` fait le plein,
  `.refuel(__game.ac, 9000)` remplit jusqu'a 9 t, `.fuelCost(3000)` donne le
  prix d'un appoint, `.fuelPrice` le prix au kilo.
- **Crash** — `__game.tycoon.crashCost(__game.ac, __game.mechanic)` calcule la
  facture, `.chargeCrash(montant)` l'applique.
- **Niveaux** — `__game.tycoon.companyScore` / `.companyLevel` / `.nextLevel()`.
- **Remise a zero** — `AirportTycoon.reset()`, `MechanicSystem.reset()`,
  `CabinService.reset()`, `TerminalSystem.reset()`, `MissionSystem.reset()`
  effacent chacun leur cle de sauvegarde (le bouton du menu pause les appelle
  toutes puis recharge la page).

L'interface (phase 13) se verifie depuis la console :

- **Bandes HUD** — `document.querySelectorAll('.hud-top')` en renvoie quatre
  (une par zone), comme `.hud-env` et `.hud-menu-btn`. `.hud-stack` est la
  colonne en flux qui empile alerte, phase, contrat et consigne : ses enfants
  ne peuvent pas se recouvrir.
- **Severites** — `document.getElementById('alertBox').className` vaut
  `alert-box sev-critical alert-flash`, `sev-warning` ou `hidden alert-box ...`
  selon l'etat. Les cadrans portent `.caution` ou `.warn` sur leur parent :
  `document.getElementById('gFuel').parentElement.className`.
- **Contrat** — `#missionFill.style.width` et `#missionPct.textContent` suivent
  l'avancement ; `#missionChip` recoit `.done` quand le contrat est rempli.
- **Panneau de gestion** — les onglets sont
  `.tycoon-tab[data-tytab="company"|"ops"|"fleet"]` et les panneaux
  `.tycoon-pane[data-typane]` ; le clic est delegue depuis `setupUI()`.
- **Rapport** — `#repBadge` porte la lettre de note (S / A / B / C / D / X) et
  la classe de couleur (`g-emerald`, `g-sky`, `g-amber`, `g-orange`, `g-red`).
- **Pause** — `#pauseState` affiche la zone courante et `#pauseEnvInfo` l'heure
  et la meteo, tous deux remplis par `openPause()`.

  Le rendu (phase 11) se regle a chaud :

  - **Ombres** — `__game.r3d.shadowsEnabled = false` coupe la carte d'ombre
    (utile pour comparer), `__game.r3d.shadowSize` fixe la resolution (1024 par
    defaut), `__game.r3d.sun.castShadow` dit si le soleil projette reellement
    dans l'image courante, et `__game.r3d._shadowFocus` est le point que la
    carte suit.
  - **Bloom** — `__game.r3d.bloom.enabled = false` desactive la passe,
    `__game.r3d.bloom.strength` regle l'intensite, et
    `__game.r3d.bloom.brightMat.uniforms.threshold` / `.knee` le seuil et la
    rampe. `__game.r3d.bloom.setSize(w, h)` suit un redimensionnement.
  - **Ciel** — `__game.r3d.skyMat.uniforms` expose `sunDir`, `sunColor`,
    `sunPower` et `haze`. `sunPower` vaut 0 la nuit et 1 en plein jour.
  - **Marquages et materiel** — `__game.r3d.airport` est le groupe de
    l'aeroport ; ses trois premiers `InstancedMesh` ajoutes sont les marquages
    (blanc, jaune, rouge), suivis des groupes de petit materiel (cones, cales,
    groupes de parc, chariots, escabeau, extincteurs).
  - **Detail de cellule** — `__game.r3d.aircraft.skinDetail` regroupe joints,
    rivets, capteurs, immatriculation et details de nacelle ; il est masque
    automatiquement en vue cockpit et en cabine.

## Phase 23 — Mini-carte, menus et petites choses a faire (mode Arcade)

**Mini-carte** (`js/arcade.js`, `css/style.css`) : refaite en haute definition, avec arbres, marquages, icones des lieux
(🏢 🗼 🔧 🅿️ 🚒 ⛽ 📦), rose des vents, avion gare, chemin en pointilles anime vers l'objectif, empreintes du joueur,
halo qui respire et bandeau « tu es ici » (nom du lieu). **Toucher la mini-carte ouvre la grande carte** (etiquettes,
legende, vehicules en emoji, `Echap` ou Fermer pour revenir). 4 styles de carte : Jour, Nuit, Neige, Bonbon (les 3 derniers
s'achetent en pieces a la tour, onglet Boutique).

**Petites choses a faire** :
- **Chasse aux pieces cachees** : 8 pieces dorees par jour (tirage stable dans la journee, 24 emplacements possibles),
  visibles en 3D et sur la carte quand elles sont a moins de 140 m ; indice chaud/froid dans le bandeau ; bonus si on a tout.
- **Dock 🎈** (tarmac) : klaxon, salut, fete (confettis), danse (le personnage tourne), selfie (flash + son).
- **Cadeau du jour** 🎁 a la tour, plus gros quand on revient plusieurs jours de suite (serie 🔥).
- **15 trophees** (album dans le menu pause et dans la tour), toast + confettis au deblocage.
- **Nom de l'aeroport** modifiable, « Le savais-tu ? » (12 faits d'aviation) dans le menu pause.

**Menus** : le menu pause Arcade passe en grosses tuiles (Trophees, Grande carte, Mode, Son), boutons de ciel
(Matin / Midi / Soir / Nuit / Meteo) et options avancees repliees. La tour a 3 onglets : Aeroport (cadeau, defis, pieces
cachees), Boutique (billets, ameliorations, style de carte), Trophees. Le menu du mode Pilote est inchange.

**Passe visuelle (Arcade)** : ciel et lumiere plus francs (`Environment.kid` : meteo moins sombre, pluie/orage/brouillard plus rares, exposition relevee), beton de l'aire, de la route et du parking eclairci, ballons de fete colores attaches sur le tarmac (`Renderer3D.animateDecor`).

## Phase 24 — Passe gameplay / HUD (mode Arcade)

- **Combo** : enchainer service, reparation, service cabine, anneau ou piece cachee en moins de 9 s → jauge « COMBO xN »
  (N = 1 + actions/3, max x5), pieces bonus a chaque action (`Arcade._bumpCombo`).
- **Missions flash** (apres le tutoriel) : toutes les 45-90 s sur le tarmac, une petite course chronometree (valise perdue, VIP a
  la porte, pompiers, tour, helicoptere, selfie devant le terminal). Elle remplace l'objectif, la fleche, la mini-carte et le
  faisceau la suivent ; le chrono s'arrete quand on monte dans l'avion.
- **HUD de vol** : barre d'etapes (Decolle → Anneaux n/5 → Atterris), objectif toujours coherent avec la phase du vol,
  jauge « douceur de la descente » pendant l'arrondi (vert = 3 etoiles).
- **Cadeaux de niveau** : cartes Nuit (niv. 3), Neige (niv. 5), Bonbon (niv. 8) ; 2 trophees de plus (Super coursier, Combo de feu).

## Phase 27 — Cabine enrichie, missions du terminal (mode Arcade)

**Cabine** (`js/cabinService.js`, `js/renderer3d.js`, `js/arcade.js`, `js/main.js`)
- **Cabine arc-en-ciel** : sieges de couleur vive (une couleur par rangee), passagers en vetements clairs, parois pastel moins
  granuleuses, eclairage plus franc (`enterCabinMode(rows, bright)`).
- **Bulles emoji** au-dessus des passagers (☕ 🥤 🍽️ 🎧 🧣 🩺 + 💬 🍬 🎈 🎂), qui virent au rouge quand l'attente est longue ;
  reactions (😍 🥳 💖…) qui montent apres un service.
- **Nouvelles demandes Arcade** : 💬 *question de passager* (devinette a 3 reponses, 18 questions, `QUIZ` dans arcade.js,
  5 pieces si juste, 1 sinon), 🍬 bonbon, 🎈 ballon, 🎂 anniversaire (jingle + confettis).
- **Turbulences en Arcade** (avant : desactivees) : 12 s pour appuyer sur ANNONCER, camera qui tremble, penalite douce, +4 pieces.
- **Objectif de service** par visite (« 🎯 Service : 2/5 », puis +3 a chaque palier, prime croissante), visage de satisfaction
  😍→😠, resume a la sortie (+1 ⭐ si la cabine est ravie).
- **Dock de gestes contextuel** (🎈) : en cabine 📢 annonce (message drole, +satisfaction), 🍬 bonbons, 🎵 musique, avec recharge.
- `cabin.update` ne tourne plus pendant un menu ouvert (les demandes n'expiraient plus derriere la pause).

**Terminal** : le coeur du hall (phases 25-26, `terminalSystem.js`, `terminalFlow.js`) n'est pas modifie. Ajout cote Arcade,
en lecture seule des compteurs : **missions flash du hall** (embarquer 4 passagers, recharger une machine, charger 2 bagages,
tenir l'ambiance > 70 % pendant 40 s, avec progression n/N) et gestes 📢 / 🎵 qui remontent l'ambiance du hall.
Trophees : Hotesse de l'air, Cerveau volant, Voix de la cabine.

## Phase 28 — Plans de vol et carnet de voyage (mode Arcade)

- **Choisis ton vol** : en s'asseyant aux commandes, 3 destinations (parmi 14 villes, 340 a 16 900 km) sont proposees, chacune avec
  un defi : ⭐ atterrissage doux (2 etoiles), 🟡 chasse aux anneaux (5/5), ⏱️ vol express (pose en moins de 3 min 30, chrono
  affiche apres le decollage), 💎 vol parfait (3 etoiles + 5 anneaux), ou 🌤️ vol tranquille sans defi. La prime grandit avec le
  niveau et la distance ; « Vol libre » saute le choix (`Arcade.offerPlan`, `PLAN_TYPES`, `DESTINATIONS`).
- **Rapport de vol** : ligne de defi reussi / pas reussi et prime ajoutee au total (`Arcade.resolvePlan`).
- **Carnet de voyage** dans la tour (onglet Aeroport) : villes visitees, 🆕 sur les nouvelles destinations ; defi du jour
  « reussis un defi de vol » ; trophees Globe-trotter (5 defis) et Tour du monde (8 villes).

## Phase 29 — Grosse passe logique de jeu (mode Arcade)

- **Pieces du ciel** : chaque anneau est precede de 3 pieces sur la trajectoire (+1 🪙 et combo chacune) qui guident le joueur
  (`Arcade._updateSkyCoins`, `Renderer3D.setSkyCoins`).
- **Jamais d'impasse** : quand le tutoriel et les defis sont finis, `_suggestGoal()` propose un objectif utile qui tourne toutes les
  40 s (reparer une piece usee, acheter une amelioration abordable, cadeau du jour, pieces cachees, nouvelle ville, cabine).
- **Economie** : une nouvelle partie Arcade demarre avec 200 pieces (avant : 2 500, ce qui rendait les achats de la tour
  immediats). Une partie deja entamee n'est pas modifiee (`data.econ`).
- **Aide** (menu pause → ❓) : 7 fiches (deplacement, reparation, terminal, vol, cabine, missions/combos, tour) ;
  **Refaire le tuto** relance le tutoriel sans toucher a la progression.

## Phase 30 (en cours) — Design, modeles et physique : etape 0
- **Compteur de performance** : ouvrir `index.html?debug` affiche FPS, draw calls, triangles, objets, ombres, lumieres, textures,
  shaders (`js/perfHud.js`) ; `window.__perf()` renvoie les memes valeurs.
- Mesure avant (tarmac, page fraiche) : 415 calls, 360 k triangles, 2 708 objets, 622 ombres, 17 lumieres, 115 shaders.
- Plan complet : `PLAN_GRAPHISME_PHYSIQUE.md`.
- **Etape 1 (vague 1)** : 7 packs Kenney CC0 (`assets/models/{vehicles,city,nature,interior}/kenney-*`) : voitures, batiments,
  routes, industriel, nature, mobilier. Inventaire `assets/models/INDEX.json` (`node tools/indexModels.mjs`) ; credits dans
  `assets/models/CREDITS.md`. Pas encore utilises dans le jeu (etape 2 : chaine d'import et palette).
- **Etape 2** : `js/palette.js` (palette « colore doux », recoloration des verts Kenney), `js/props.js` (modeles a l'echelle cible
  en metres, origine au sol, rendu doux, `instanced()` = un InstancedMesh par piece).
- **Etape 3 (partielle)** : herbe plus fraiche ; etalonnage de la passe finale (saturation +12 %, vignettage).
- **Etape 4 (partielle)** : `js/decor.js` — bosquets, fleurs, herbes, rochers, bancs/plantes du parvis, conteneurs, chateau d'eau,
  eoliennes, pompiers, quartier de maisons. +82 draw calls, +150 k triangles (instancies).
- **Etape 5 (partielle)** : obstacles du decor dans `Navigation` + grille spatiale de 32 m (`_buildGrid`) ; verifie : aucun poste ni
  cible n'est devenu inatteignable (memes resultats avec et sans le decor).
- **Suite etape 4** : plantes et tapis dans le hall du terminal (obstacles `zone: 'termHall'`), halos + flaques de lumiere sous les mats
  la nuit (`decor.setNight`), nuit moins noire (`environment.lighting`), passagers de cabine varies (peau / cheveux).
- **Reste a faire** : reduire les draw calls de la vue terminal (~1 000-1 350, surtout l'interieur et la foule), vague 2 de modeles
  (avion, helicoptere, vehicules d'aeroport), hangars, pluie / sol mouille, ciel vivant, hauteur de marche, vehicules d'ambiance,
  icones SVG, tableau de mesures avant/apres.

- **Suite phase 30 (etapes 5 a 8, partielles)** : `js/skylife.js` (oiseaux, avions lointains + trainees, montgolfieres, sol mouille,
  eclaboussures) ; `Navigation._detour` en A* a aretes paresseuses avec couloir (13 ms en moyenne au lieu de plusieurs centaines) ;
  tests de navigation 27/27 (500 trajets aleatoires avec le decor) ; cones de balisage renverses au contact (`reactCones`) ;
  variables CSS de la palette et animations douces. Mesure apres (tarmac) : 621 calls, 519 k triangles, 2 855 objets.
- **Vague 2 (partielle)** : avion de ligne (Poly by Google) et helicoptere (Jeremy), poly.pizza, CC BY 3.0, dans `assets/models/vehicles/polypizza/` ; credits dans `assets/models/CREDITS.md`.
  Camion-citerne (KolosStudios, CC BY) et chariot elevateur au fret ; le camion-citerne anime garde ses freins devant le joueur.
- **Physique du personnage** (`js/bodies.js`) : collision avec personnes et vehicules mobiles, glissement, sous-pas de 25 cm ; 2 tests ajoutes (29/29).
- **PNJ controles** : memes collisions que le joueur. **Obstacles en vol** (`js/sceneryCollision.js`, Arcade) : rebond doux sur le decor.

## Phase 31 — Le Hub et l'equipe (mode Arcade)

**Hub** (`js/hub.js`) : un seul ecran pour tout voir et tout gerer. Bouton 🏢 HUB (haut gauche), touche **H**, ou bureau de la tour ;
le monde est en pause tant qu'il est ouvert. Quatre onglets :
- 📊 **Apercu** : tresor + niveau + gain estime du prochain vol, objectif du moment, equipe, terminal (ambiance, files, stocks des
  3 machines, caisses), avion (sante, carburant, piece a surveiller), cabine (visage + satisfaction), flotte (avions, portes,
  billet, reputation) et **mini-carte en direct**. Chaque tuile mene a l'onglet concerne.
- 👥 **Equipe** : embaucher et former le personnel.
- 🛒 **Boutique** : ameliorations, nouvel avion, prix des billets, style de carte.
- 🎯 **Objectifs** : cadeau du jour, defis, pieces cachees, carnet de voyage, trophees.
L'ancien panneau de la tour est conserve mais n'est plus utilise (`_legacyKidTower`).

**Personnel** (`js/staff.js`) : 8 metiers (agent d'enregistrement ×3, bagagiste ×2, agent de surete, agent de porte, vendeur ×2,
mecanicien ×2, magasinier, hotesse ×2), 3 niveaux de formation (plus vite, jusqu'a 90 % de fiabilite), certains metiers se
debloquent au niveau 2 ou 3. Pas de salaire : le cout est l'embauche (30 a 60 🪙) et la formation. Ils agissent par les memes
fonctions que le joueur (`terminal.decide`, `loadBag`, `restock`, `cabin.serve`, usure du mecanicien...) et travaillent meme
en vol. Un poste tenu (`counter.staffed`) n'est plus traite « sans regarder » par le terminal ; une pastille emoji flotte au
dessus (`Renderer3D.setStaffBadges`). Sauvegarde : `skymanager.staff`. Trophee « Grand patron » (6 employes).

**Suite phase 31** :
- **Employes visibles** (`Staff._syncActors` / `_moveActors`) : un personnage 3D par employe, avec une calotte de couleur par metier.
  Les agents d'enregistrement, de surete, de porte et les vendeurs se tiennent derriere leur comptoir et font face a la file ;
  le bagagiste et le magasinier font leur ronde dans les allees du hall (memes points que les trajets des passagers) ; les
  mecaniciens travaillent a cote de l'avion (masques quand il vole) ; l'hotesse fait des allers-retours dans l'allee de la cabine.
- **Onglet 📈 Stats** du Hub (`js/history.js`) : releve toutes les 30 s de jeu (pieces, ambiance du hall, satisfaction cabine,
  passagers embarques, equipe ; 96 releves), courbes SVG, six compteurs (vols, pieces gagnees, passagers, atterrissages parfaits,
  anneaux, pieces cachees) et barres des gains des 12 derniers vols (couleur selon les etoiles). Sauvegarde `skymanager.history`.

## Phase 32 — Refonte visuelle : personnage, terminal, parking, nuit, carte, icones

Suivi detaille : `PLAN_VISUEL_CARTE.md` (etat des lieux, plan, avancement). Controle git : le dossier est versionne depuis cette phase.

- **Personnage** (`renderer3d.js`, `paintHuman`) : le modele glTF n'a aucune texture ; il est colore par os (peau, haut aux couleurs du role — orange pour le joueur —, pantalon, chaussures), materiau mat (plus de halo blanc du bloom).
- **Sols** (`textures.js`, `terminalBuilding.js`, `renderer3d.js`) : tarmac plus clair (joints et taches adoucis), moquette du salon plus fine, herbe moins saturee.
- **Terminal** (`terminalDesign.js`) : sol par zones (enregistrement, surete, boutiques, bagages, allee centrale), plafond a nervures, bandeaux lumineux par zone, suspensions, 6 vitrines de boutiques le long du mur sud, fresques aux pignons, bandeau de facade aux couleurs de la compagnie. Positions des comptoirs et navigation inchangees.
- **Parking et abords** (`decor.js`) : 4 rangees de places, ~100 voitures Kenney (obstacles de navigation), terre-plein arbore, passages pietons, ligne de route, abribus + navette, haies fleuries.
- **Nuit et meteo** (`skylife.js`, `sfx.js`) : lumieres de la ville et du village, fenetres du quartier, balise de la tour clignotante, orage avec eclairs (flash en double impulsion + trait de foudre) et tonnerre synthetise retarde selon la distance (`sfx.thunder`).
- **Carte** (`arcade.js`) : zoom x1 a x5 (molette, pincement, double-clic, boutons), deplacement au glisser, fond en double resolution, etiquettes a taille constante avec anti-collision, itineraire reel via la navigation.
- **Vue « aeroport entier »** : bouton sur la grande carte, fenetre de 3 090 m (`MAP_FULL`) sur canevas en hauteur ; piste, taxiway, seuils 36/18, aviation legere et PAPI a leur vraie place.
- **Icones** (`icons.js`) : 67 icones SVG ; `iconify()` remplace automatiquement les emojis connus du DOM (observateur) et `drawIcon()` les dessine sur les canvas. Les emojis sans icone restent des emojis.
- **Mesures** (navigateur integre, rendu logiciel, aeroport charge) : 367 draw calls et ~469 k triangles dans la vue testee ; 30/30 tests de navigation. Le FPS reste a relever sur le PC cible (budget : >= 90 FPS, <= 900 draw calls).
- Version des scripts : `?v=1790900000`.

## Phases 33 a 39 — Plan « fun pour un enfant de 12 ans »

Suivi du plan : `PLAN_FUN_ENFANT.md`. Tout est en mode Arcade (rien ne change en mode Pilote). Chaque couche est un module independant, ajoute a la boucle de `main.js` dans un `try/catch` : une erreur dans une couche « fun » est notee une fois dans la console et ne fige jamais le jeu.

| Phase | Contenu | Modules |
|---|---|---|
| 33 (vague 1) | **Voler maintenant** (bouton d'accueil, prenom + avatar, compte a rebours, decollage auto), acrobaties (**tonneau**, **looping**, score, combos), **turbo** (jauge qui se recharge aux anneaux et aux acrobaties), **fumee coloree** (7 couleurs), **Coco** la mascotte (bulles, voix en option), ralenti + confettis sur le 3 etoiles, **carte postale** (photo), **coffre surprise**, 3 niveaux de difficulte | `fun.js` |
| 34 (vague 2) | **Mon hangar** : choix de l'avion, couleur, accent, 10 motifs, 25 autocollants (3 emplacements), nom sur le fuselage, boutique (essayer avant d'acheter), objets rares dans les coffres. **Pioupiou** (helice, facile) et **Zebulon** (voltige, niveau 3) avec leur propre physique | `hangar.js`, `fleet.js`, `livery.js`, `planeModels.js` |
| 35 (vague 3) | **Tableau de missions** (onglet « Missions » du depart) : ballons, course d'anneaux avec **fantome**, pompier, colis a parachute, secours, transport d'animaux, show aerien, exploration. Viseur de largage, medailles bronze / argent / or. Photos : filtres et album. Camera cinema | `skyMissions.js`, `skyWorld.js` |
| 36 (vague 4) | **Mini-jeux** (lavage, carburant, valises bizarres), **chien echappe** et **visiteurs celebres** (8 histoires, album des rencontres), **album de collection**, **Ma place** (12 objets : fontaine, manege, grande roue... qui rapportent des pieces), **serie quotidienne** | `minigames.js`, `groundFun.js`, `album.js`, `deco.js` |
| 37 (vague 5) | **Le grand monde** : mer + 6 iles (volcan, chateau, phare, parc d'attractions, plage, banquise), **40 etoiles dorees**, surprises (OVNI, baleine, dragon de nuages), arc-en-ciel apres la pluie, etoiles filantes, feux d'artifice, **rase-mottes sur l'eau** (reservoir du pompier), **Hydravion** | `openWorld.js` |
| 38 (vague 6) | **Reglages** : qualite d'image automatique, mode gaucher, gros texte, rappel de pause parent ; **musique dynamique** (3 intensites) ; **defi de la semaine** ; 16 nouveaux trophees ; conseil « prochain vol » dans le rapport | `comfort.js`, `music.js` |
| 39 (vague 7) | **Colibri**, l'**helicoptere** : stationnaire, atterrissage automatique sur l'helipad, pose partout | `heliModel.js` |

### Les avions (`js/fleet.js`)

Un avion = un **profil** (coefficients du moteur de vol via `Aircraft.applyProfile`, vitesses de l'aide au pilotage, camera, economie). Le jet de ligne reste l'avion de l'aeroport (cabine, atelier) ; le petit avion choisi au hangar ne sert qu'en vol, et le jet reapparait a la porte au retour. Ajouter un avion : un profil dans `fleet.js` + un constructeur dans `planeModels.js` (`MODEL_BUILDERS`) ; `tools/fleet.sim.mjs` le fait decoller, monter, atterrir et s'arreter tout seul avec l'aide au pilotage et verifie la maniabilite.

| Avion | Niveau | Prix | Particularite |
|---|---|---|---|
| Jet de ligne | 1 | gratuit | gros, stable, cabine jouable |
| Pioupiou | 1 | gratuit | helice, tres facile |
| Hydravion | 2 | 120 | flotteurs, rase l'eau |
| Colibri (helicoptere) | 4 | 200 | stationnaire, pose partout |
| Zebulon | 3 | 150 | voltige, roulis 200 deg/s |

### Missions (`js/skyMissions.js`)

Une mission est une classe (`setup`, `update`, `goal`, `result`...). Elle est choisie au tableau, demarre au decollage, guide l'avion par l' « aimant » de l'aide au pilotage (desactive en difficulte Expert) et finit par une medaille et des pieces (`MEDAL_COINS`). Les objets 3D (anneaux, ballons, feux, cibles, colis a parachute, fantome) viennent de `skyWorld.js`. Le viseur de largage (`predictImpact`) utilise exactement le meme integrateur que les projectiles, donc il ne ment jamais.

### Donnees enregistrees

`skymanager.fun` (pilote, fumee, difficulte, photos, serie), `skymanager.hangar` (avion choisi, livrees, objets achetes), `skymanager.sky` (medailles, fantomes), `skymanager.meet` (rencontres), `skymanager.deco` (ma place), `skymanager.world` (iles, etoiles, surprises), `skymanager.mini` (mini-jeux), `skymanager.comfort` (reglages).

### Tests hors navigateur

```
npm install three@0.169.0 --no-save
npm test          # aide au pilotage, avions du hangar, coherence des catalogues, terminal
```

- `tools/fleet.sim.mjs` : chaque avion decolle, monte, supporte les manches extremes, atterrit seul et s'arrete (2 vents) ; l'helicoptere decolle, stationne et se pose sur l'helipad.
- `tools/data.test.mjs` : identifiants uniques, autocollants offerts qui existent, iles a l'interieur de la mer, badges evaluables, avions complets.

### Notes de mise en place

- Navigateur integre de l'application : la capture d'ecran ne montre que 80 % de la page ; pour tout voir, appliquer `document.body.style.cssText='width:100vw;height:100vh;transform-origin:0 0;transform:scale(.8)'` (test seulement).
- Rendu logiciel : ~2 images/s. Pour tester la logique, remplacer `__game.r3d.render` par une fonction vide.
- Non fait (voulu) : pilotage a l'inclinaison de l'iPad (a tester sur l'appareil), planeur et thermiques, vol en formation avec un avion IA, voix enregistrees.
