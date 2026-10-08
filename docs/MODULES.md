# Carte des modules

*Genere par `node tools/modules.mjs` — ne pas modifier a la main.*

| Fichier | Role | Cle de sauvegarde | Importe par | Lignes |
|---|---|---|---|---|
| `agents.js` | PNJ autonomes (Phase 2) |  | main | 993 |
| `airframe.js` | Cellule de l'appareil (phase 21) |  | renderAircraft | 436 |
| `airportLife.js` | L'aeroport vit (phase 20) |  | bus, fireTruck, renderGround | 787 |
| `airportTycoon.js` | ITERATION 4 | tycoon | hub, main, pauseMenu | 358 |
| `album.js` | L'album de collection (mode Arcade, vague 4) |  | main | 113 |
| `ambience.js` | Petite vie calme de l'aeroport (mode Arcade) |  | main | 292 |
| `arcade.js` | Couche « Arcade » : le jeu adapte aux enfants | arcade | album, hub, hudController, main, pauseMenu | 462 |
| `arcadeChallenges.js` | Defis du jour et de la semaine, objectif courant, cibles | pet, world | arcade | 253 |
| `arcadeData.js` | constantes et petits utilitaires partages |  | arcade, arcadeChallenges, arcadeFlight, arcadeFun, arcadeMap, hunt | 307 |
| `arcadeFlight.js` | Vol : anneaux, barre d'objectif, plan de vol, atterrissage, tresors |  | arcade | 388 |
| `arcadeFun.js` | Combos, missions flash, cadeau, danse, HUD cabine et vol |  | arcade | 351 |
| `arcadeMap.js` | Carte du monde (mini-carte, grande carte, themes) |  | arcade | 506 |
| `assetLoader.js` | chargement des modeles glTF externes |  | props, renderAvatar, renderGround, renderer3d | 60 |
| `bodies.js` | Collision du joueur avec les corps mobiles |  | agents, hubUpdate, main, rides, social, staff, vehicle | 134 |
| `bus.js` | Conduire le bus des passagers (mode Arcade) |  | main | 141 |
| `cabinService.js` | ITERATION 4 | cabin | hubUpdate, main, pauseMenu, renderCabin | 317 |
| `cockpit.js` | Poste de pilotage 3D (phase 20) |  | hudController, renderAircraft, renderCamera | 698 |
| `comfort.js` | Confort de jeu (mode Arcade, vague 6) | comfort | main | 277 |
| `deco.js` | « Ma place » : decorer l'aeroport (mode Arcade, vague 4) | deco | main, openWorld | 418 |
| `decor.js` | Decor en modeles 3D (plan graphisme, etape 4) |  | renderGround | 378 |
| `environment.js` | PHASE 7 | environment | cockpit, main, renderAircraft, renderCabin, renderGround, renderLights, renderer3d | 294 |
| `fireTruck.js` | Au feu les pompiers ! (mode Arcade) |  | main | 241 |
| `fleet.js` | Les avions du hangar (mode Arcade, vague 2) |  | album, arcade, hangar, hub, hudController, main | 163 |
| `flightAssist.js` | Aide au pilotage du mode Arcade |  | main | 374 |
| `flightPhysics.js` | Moteur aerodynamique 6 DDL simplifie |  | cockpit, hudController, main | 620 |
| `fun.js` | Couche « fun » du mode Arcade (plan PLAN_FUN_ENFANT.md) | fun | main | 932 |
| `gameShared.js` | constantes et petits utilitaires partages |  | hubUpdate, hudController, main, pauseMenu | 72 |
| `gamepadInput.js` | Manette de jeu (Gamepad API) (E05) |  | main | 69 |
| `groundFun.js` | Evenements surprise a l'aeroport (vague 4) | meet | album, ambience, groundVehicles, hunt, main, pet, seasonal, social | 613 |
| `groundVehicles.js` | Trois vehicules de plus a conduire (H03) |  | main | 321 |
| `hangar.js` | « Mon hangar » (mode Arcade, vague 2) | hangar | main | 401 |
| `heliModel.js` | Helicoptere « arcade » (mode Arcade, vague 7) |  | flightAssist, flightPhysics, main, skyMissions | 211 |
| `history.js` | Historique et statistiques de l'aeroport | history | main, pauseMenu | 64 |
| `hub.js` | Le Hub : centre de controle de l'aeroport (mode Arcade) |  | main | 368 |
| `hubUpdate.js` | Monde libre : tarmac, terminal, cabine, postes de maintenance |  | main | 828 |
| `hudController.js` | HUD, bulles et rapports de vol |  | main | 340 |
| `hunt.js` | Cache-cache : les Coco caches (H06) | hunt | main | 123 |
| `icons.js` | Icones vectorielles du jeu (phase 32) |  | arcadeData, arcadeMap, main | 196 |
| `layout.js` | Plan de l'aeroport (phase 18), une seule source |  | airportLife, arcadeData, arcadeMap, bus, groundFun, heliModel, navigation, renderGround, renderShared, terminalBuilding, terminalDesign, tug | 103 |
| `livery.js` | Peinture et decalques des avions (hangar, vague 2) |  | album, hangar, minigames, renderAircraft | 414 |
| `look.js` | Mon personnage (mode Arcade) | look | main | 106 |
| `main.js` | Boucle principale et machine a etats |  |  | 999 |
| `mechanicControls.js` | ITERATION 2 |  | main | 110 |
| `mechanicSystem.js` | ITERATION 3 | mechanic | gameShared, hubUpdate, main, pauseMenu | 378 |
| `minigames.js` | Mini-jeux au sol (mode Arcade, vague 4) | mini | main | 249 |
| `missions.js` | PHASE 12 | missions | main, pauseMenu | 233 |
| `music.js` | Musique dynamique (mode Arcade, vague 6) |  | comfort | 145 |
| `navigation.js` | Graphe de navigation et collision du monde |  | main | 659 |
| `openWorld.js` | Le grand monde (mode Arcade, vague 5) | world | album, main, skyMissions, thermals | 565 |
| `palette.js` | Palette « colore doux » du jeu (plan graphisme, etape 2) |  | props, skylife | 41 |
| `pauseMenu.js` | Menu pause, reglages, panneaux (carte, album, quiz, tour) |  | main | 731 |
| `perfHud.js` | Compteur de performance (etape 0 du plan graphisme) |  | main | 61 |
| `pet.js` | Biscuit, le chien de compagnie (mode Arcade) | pet | main | 461 |
| `planeModels.js` | Modeles 3D des petits avions du hangar |  | renderAircraft | 596 |
| `props.js` | Chaine d'import des modeles 3D (plan graphisme, etape 2) |  | airportLife, decor | 113 |
| `registry.js` | Registre des modules de jeu (B04) |  | main | 54 |
| `renderAircraft.js` | Avions : modele articule, flotte, livrees, usure |  | renderer3d | 793 |
| `renderAvatar.js` | Avatar du joueur et techniciens |  | renderer3d | 138 |
| `renderCabin.js` | Interieur de la cabine |  | renderer3d | 518 |
| `renderCamera.js` | Cameras (vol, tarmac, cabine) et redimensionnement |  | renderer3d | 239 |
| `renderGround.js` | Terrain, aeroport, marquages, accessoires du sol |  | renderer3d | 766 |
| `renderLights.js` | Lumieres, environnement, bloom |  | renderer3d | 315 |
| `renderShared.js` | constantes et petits utilitaires partages |  | renderAircraft, renderAvatar, renderCabin, renderCamera, renderGround, renderLights, renderSky, renderer3d | 171 |
| `renderSky.js` | Ciel, dome d'environnement, pluie |  | renderer3d | 312 |
| `renderer3d.js` | Scene Three.js globale |  | look, main | 688 |
| `rideCourse.js` | Relief des rampes et rails (phase 40) |  | arcadeMap, ridePark, ridePhysics, rides | 182 |
| `rideIK.js` | Poser l'avatar sur une monture (phase 40) |  | rides | 81 |
| `rideModels.js` | Skate, trottinette, BMX, rollers, hoverboard (phase 40) |  | rides | 347 |
| `ridePark.js` | Rendu du skatepark (phase 40) |  | rides | 161 |
| `ridePhysics.js` | Physique « arcade » des montures (phase 40) |  | rides | 587 |
| `rides.js` | Montures et skatepark (phase 40) | rides | main | 705 |
| `save.js` | Sauvegardes centralisees (B05) | pet, comfort | comfort, deco, hunt, pauseMenu, pet, seasonal | 76 |
| `scenery.js` | Decor de l'aeroport et de son environnement (phase 22) |  | renderGround | 581 |
| `sceneryCollision.js` | Obstacles en vol (plan graphisme, etape 5) |  | main | 53 |
| `seasonal.js` | Evenements saisonniers (H07) | season | main | 143 |
| `sfx.js` | Petits sons de recompense (Web Audio, aucun fichier) | sfx | album, ambience, arcade, arcadeChallenges, arcadeFlight, arcadeFun, arcadeMap, bus, comfort, deco, fireTruck, fun, groundFun, groundVehicles, hangar, hub, hubUpdate, hudController, hunt, look, main, minigames, music, openWorld, pauseMenu, pet, rides, seasonal, skyMissions, skylife, social, staff, thermals, tug, vehicle | 257 |
| `skyMissions.js` | Missions aeriennes du mode Arcade (vague 3) | sky | album, main | 1134 |
| `skyWorld.js` | Elements 3D des missions aeriennes (vague 3) |  | skyMissions | 321 |
| `skylife.js` | Ciel vivant et sol mouille (plan graphisme, etape 6) |  | renderGround | 294 |
| `social.js` | Dire bonjour aux gens de l'aeroport (mode Arcade) |  | main | 153 |
| `staff.js` | Personnel de l'aeroport (mode Arcade) | staff | hub, main, pauseMenu | 377 |
| `staticMerge.js` | Fusion des maillages statiques par materiau (D02) |  | ridePark, scenery, terminalBuilding | 63 |
| `terminalBuilding.js` | Le terminal, batiment integre a la carte (phase 22) |  | renderGround, renderer3d | 824 |
| `terminalDesign.js` | Refonte visuelle du terminal (phase 32) |  | terminalBuilding | 201 |
| `terminalFlow.js` | Les verifications du parcours passager (phases 25-26) |  | ambience, hubUpdate, staff, terminalBuilding, terminalSystem | 203 |
| `terminalSystem.js` | Interieur du terminal : le circuit passager | terminal | hubUpdate, main, pauseMenu | 770 |
| `textures.js` | Bibliotheque de textures procedurales |  | renderAircraft, renderAvatar, renderCabin, renderGround, renderShared, renderSky, renderer3d | 1239 |
| `thermals.js` | Ascendances pour le planeur (G01) |  | main | 123 |
| `touchControls.js` | Ergonomie tactile iPad / iPhone |  | main | 248 |
| `tug.js` | Conduire le tracteur a bagages (mode Arcade) |  | main | 236 |
| `vehicle.js` | Base commune des vehicules que l'enfant conduit |  | bus, fireTruck, groundVehicles, tug | 127 |
| `voice.js` | Lecture a voix haute (F01) |  | main | 73 |

Total : 92 modules, 33416 lignes.
