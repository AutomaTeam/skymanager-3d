> **Statut (2026-10-08) : PARTIEL : decor, modeles, physique du personnage et ciel sont faits ; reste en bas de la section « Avancement » (hangars, hublots, hauteur de marche...).**
> Ce plan est archive ici ; le plan en cours est `PLAN_AMELIORATION_SONNET.md` a la racine.

# Plan — Design, décor, modèles 3D et physique (à lancer à la prochaine session)

## Avancement
- ✅ **Étape 0 faite** : compteur `?debug` (`js/perfHud.js`), dossiers `assets/models/{vehicles,nature,city,props,interior,characters}`, mesures « avant » ci-dessous. Aucune autre session n'avait modifié les fichiers du rendu.
- ✅ **Étape 1 — vague 1 faite** : 7 packs Kenney CC0 téléchargés (732 modèles `.glb`, 24 Mo sur disque), crédités dans `assets/models/CREDITS.md`, inventoriés dans `assets/models/INDEX.json` (`node tools/indexModels.mjs`). Chargement vérifié dans le jeu (voitures colorées visibles).
- ✅ **Étape 2 (faite)** : `js/palette.js` (palette + recoloration des verts Kenney), `js/props.js` (échelle cible en mètres, origine au sol, rendu « doux », instanciation), `loadGltf` dans `assetLoader.js`. L'échelle est calculée au chargement, pas depuis `INDEX.json`.
- 🟡 **Étape 3 (partielle)** : herbe plus fraîche, étalonnage doux (saturation +12 %, vignettage) dans la passe finale. **Reste** : béton/asphalte plus propres, murs de cabine, sols du terminal, ombres de contact peintes.
- 🟡 **Étape 4 (partielle)** : `js/decor.js` — 34 bosquets (arbres, buissons, fleurs, rochers), 260 touffes d'herbe, bancs/plantes/poubelles du parvis, conteneurs de fret, château d'eau, éoliennes, véhicules des pompiers, quartier de maisons avec clôture. Ajouté ensuite : plantes le long de la baie vitrée et tapis sous les sièges du terminal, halos et flaques de lumière sous les mâts la nuit (`setNight`), nuit moins noire (lune, ambiance), passagers de cabine plus variés (5 teintes de peau, 7 couleurs de cheveux). **Reste** : hangars, hublots animés, pluie et sol mouillé, oiseaux/avions lointains/montgolfières.
- 🟡 **Étape 5 (partielle)** : ~230 obstacles de décor ajoutés à la navigation ; **grille spatiale** dans `navigation.js` (les tests de marche ne balayent plus tous les obstacles). **Reste** : hauteur de marche, rebonds en vol, véhicules d'ambiance, objets réactifs, tests élargis.
- ✅ **Étape 5 (avancée)** : `_detour` de `navigation.js` passé en A* à arêtes paresseuses + couloir autour du trajet (100 trajets aléatoires : moyenne 13 ms, max 300 ms, avant jusqu'à 2,4 s) ; 2 nouveaux tests (`navigation.test.js`, 27/27 OK : 500 trajets aléatoires avec tout le décor, aucun obstacle sur un portail) ; cônes de balisage renversés au contact du joueur (`Renderer3D.reactCones`). **Reste** : hauteur de marche, rebonds en vol, véhicules d'ambiance.
- ✅ **Physique du personnage** : `js/bodies.js` — le joueur ne traverse ni les personnes (passagers, PNJ, employés) ni les véhicules d'ambiance (boîtes orientées), glisse le long des obstacles, avance par sous-pas de 25 cm (plus de passage à travers un mur à grande vitesse) et est repoussé s'il se retrouve englobé. Tests : 29/29. PNJ contrôlés corrigés aussi (`Agents.moveControlled`). Non couvert : la cabine (repère propre).
- ✅ **Obstacles en vol (Arcade)** : `js/sceneryCollision.js` — arbres, maisons, hangars, tour, éoliennes, conteneurs : l'avion rebondit doucement (−15 % de vitesse, petit coup vers le haut) et un message s'affiche, jamais de crash. Test ajouté (30/30). Non vérifié en vol réel, seulement en test unitaire.
- ✅ **Étape 6 (partielle)** : `js/skylife.js` — 3 volées d'oiseaux, 3 avions lointains avec traînées, 4 montgolfières qui dérivent avec le vent, voile de sol mouillé et éclaboussures sous la pluie. **Reste** : fenêtres éclairées / lumières de ville la nuit, éclairs.
- 🟡 **Étape 7 (partielle)** : variables CSS de la palette, animations douces, anneau de focus (fin de `css/style.css`). **Reste** : remplacer les emojis par des icônes SVG.
- 🟡 **Étape 8** : mesures après (tarmac, PC, volet du navigateur intégré) : 621 draw calls, 519 k triangles, 2 855 objets, 697 ombres, 17 lumières, 120 shaders. Budget draw calls respecté ; le FPS n'est pas mesurable dans le navigateur intégré (rendu logiciel), à relever sur le PC. Version des scripts : `?v=1789710000`.
- 🟡 **Étape 1 (vague 2 partielle)** : avion de ligne et hélicoptère (poly.pizza, **CC BY 3.0**, crédités dans `CREDITS.md`) posés dans `decor.js` : avion gare en (190, 925), hélicoptère pose près de l'héliport (l'hélicoptère animé fait en code reste, le modèle n'a pas de rotor séparé). Véhicules d'aéroport : camion-citerne (KolosStudios, CC BY) remplace celui fait en code dans `airportLife.js` (mêmes freinages devant le joueur, vérifié) et chariot élévateur au fret. Tracteur et chariot testés puis **écartés** (tracteur agricole et étal de marché : hors style). **Reste** : tracteur à bagages, passerelle (aucun modèle adapté trouvé sur poly.pizza). L'avion du joueur n'a pas changé.

## Décisions prises
- **Pas d'optimisation iPad / iPhone pour l'instant** : on cible le PC. On garde quand même de bonnes habitudes (instanciation, fusion des objets fixes) pour ne pas se bloquer plus tard.
- **Style : coloré et doux** (palette chaude et saturée, formes arrondies, peu de bruit dans les textures, ombres douces).
- **Télécharger un maximum de modèles 3D libres de droits** qui collent à ce style, puis **adapter la physique** à ces nouveaux modèles.

## Point de départ (mesuré)
| Situation | FPS (PC) | Draw calls | Triangles |
|---|---|---|---|
| Tarmac | 131 | 585 | 283 k |
| Terminal | 208 | 284 | 265 k |
| Cabine | 181 | 282 | 25 k |
| Vol | 239 | 174 | 25 k |

2 708 objets 3D, 622 qui projettent des ombres, 17 lumières, 165 shaders, textures générées par code de 128 à 512 px.
**Mesure avec `?debug` (tarmac, page fraîche)** : 415 draw calls, 360 k triangles, 2 708 objets, 622 ombres, 17 lumières, 115 shaders, 63 textures.

Outils déjà là : `js/assetLoader.js` (charge les .glb), `tools/flightAssist.sim.mjs`, `tools/terminal.test.mjs`, `js/navigation.test.js`.

**Budget PC à ne pas dépasser** : ≥ 90 FPS sur le tarmac, ≤ 900 draw calls, chargement < 8 s.

---

## Étape 0 — Préparation (30 min)
1. Vérifier que l'autre session n'édite plus `renderer3d.js`, `scenery.js`, `textures.js`, `terminalBuilding.js`, `navigation.js`. Sinon, travailler d'abord sur des fichiers séparés (voir « Règles »).
2. Ajouter un compteur de performance (`?debug`) : FPS, draw calls, triangles, objets. Relever les mesures « avant ».
3. Créer `assets/models/` sous-dossiers : `vehicles/ nature/ city/ props/ interior/ characters/`.

**Fini quand** : le compteur s'affiche et les mesures « avant » sont dans le README.

## Étape 1 — Récupérer les modèles (à valider avec toi avant chaque téléchargement)
Je ne télécharge que des `.glb` / `.gltf` libres de droits (CC0 de préférence). Je te donne le nom, la source et la taille avant chaque téléchargement.

| Source (licence) | Ce qu'on y cherche | Sert à |
|---|---|---|
| [Kenney](https://kenney.nl/assets) (CC0) : Car Kit, City Kit (commercial, suburbain, routes, industriel), Nature Kit, Furniture Kit | voitures, bus, camions, bâtiments, routes, mobilier | parking, route, hangars, terminal, arrêt de bus |
| [Quaternius](https://quaternius.com/) (CC0) : Stylized Nature MegaKit, Ultimate Stylized Nature, Cars Bundle | arbres, buissons, fleurs, rochers, voitures | herbe, haies, massifs, forêts |
| [poly.pizza](https://poly.pizza/) (CC0 ou CC-BY, licence à vérifier une par une) | avions, véhicules d'aéroport, valises, bancs, poubelles, cônes | tarmac, terminal, cabine |
| [Kay Lousberg](https://poly.pizza/) (CC0, déjà utilisé pour le fret) | caisses, palettes | zone de fret |

Règles de téléchargement :
- Total visé : **≤ 40 Mo** de modèles, chaque modèle ≤ 3 000 triangles (les décors répétés ≤ 800).
- Noter chaque modèle dans `assets/models/CREDITS.md` (auteur, licence, lien). Pas de licence claire = pas de modèle.
- Jamais d'exécutable ni d'archive dont je ne peux pas lister le contenu.
- Liste de courses cible : 6 à 8 voitures, 2 bus, 2 camions, 1 avion de ligne secondaire, 1 hélicoptère, 20 arbres/buissons/fleurs, 15 accessoires (bancs, poubelles, lampadaires, panneaux, drapeaux, cônes, barrières), 10 meubles de terminal, 6 caisses/palettes/chariots.

**Fini quand** : les modèles sont classés, crédités et un fichier `assets/models/INDEX.json` liste nom, dimensions, nombre de triangles.

## Étape 2 — Chaîne d'import (1 séance)
1. Script `tools/prepModels.mjs` (Node) : lit chaque .glb, **recale l'échelle** (1 unité = 1 m), pose l'origine au sol, calcule la boîte de collision, écrit `INDEX.json`.
2. **Harmonisation du style** : au chargement, `spawnModel(..., { palette })` remplace les couleurs par la palette du jeu et applique un rendu lisse (`flatShading` désactivé, `roughness` ~0.6, légère lueur émissive pour un côté doux).
3. Ajouter à `assetLoader.js` : instanciation en masse (`spawnMany`) avec `InstancedMesh` pour les objets répétés (arbres, lampadaires, voitures).
4. Repli : si un modèle ne charge pas, l'ancien objet fabriqué par code reste affiché (le jeu ne casse jamais).

**Fini quand** : un modèle test s'affiche à la bonne taille, avec la bonne couleur, à 1 draw call pour 100 copies.

## Étape 3 — Matériaux et textures « coloré doux »
1. **Palette commune** (`js/palette.js`) : 12 couleurs de base + variantes claires/foncées, utilisée par les textures, les modèles et l'interface.
2. Refaire dans `textures.js` : béton (dalles nettes, usure légère, traces de pneus), asphalte de piste, herbe (variations de teinte + fleurs), trottoirs, gravier, murs de la cabine (moins de grain), moquette, sols du terminal. Cassage de la répétition (variation à grande échelle).
3. Ombres de contact peintes dans les textures (bas des murs) et fausses ombres rondes sous voitures/personnages.
4. Ciel et couleurs : léger étalonnage (contraste, saturation, vignettage) dans la passe de bloom existante.

**Fini quand** : captures avant/après du tarmac, de la cabine et du terminal validées par toi.

## Étape 4 — Décor par zone (dans cet ordre)
1. **Tarmac et alentours** : haies, massifs de fleurs, clôtures, bancs, poubelles, arrêt de bus, drapeaux qui flottent (selon le vent), panneaux, voitures variées au parking, véhicules d'escale en modèles 3D.
2. **Terminal** : mobilier en modèles 3D, plantes, affiches, tableau des départs qui défile, boutiques garnies.
3. **Hangars et fret** : palettes, caisses, chariots élévateurs, établis, avion en maintenance.
4. **Cabine** : passagers plus variés, bagages, hublots avec nuages qui défilent.
5. **Paysage lointain** : forêts en modèles instanciés, champs, lac avec bateaux, route avec circulation.

**Fini quand** : chaque zone a au moins 15 nouveaux éléments visibles, sans passer sous le budget de FPS.

## Étape 5 — Physique adaptée aux nouveaux modèles
1. **Collisions du décor** : `tools/genColliders.mjs` transforme la boîte de chaque modèle posé en obstacle dans `navigation.js` (`BLOCKERS`). Grille de recherche rapide (les obstacles seront bien plus nombreux). Tests dans `navigation.test.js` : aucun poste, porte ni objectif ne devient inatteignable.
2. **Personnage** : hauteur de marche (bordures de 15 cm), glissement le long des obstacles, rayon du personnage adapté aux nouveaux objets, plus de blocage dans les passages étroits (`nearestWalkable`).
3. **Avion du joueur** : si le modèle d'avion change, recaler `gearPoints`, le rayon des roues et la hauteur du fuselage dans `flightPhysics.js`. Rejouer `npm run test:flight` (décollage, vent de travers, atterrissage) et garder les seuils 3 étoiles cohérents.
4. **Obstacles en vol et au sol** : collision avec bâtiments, arbres et mâts. En Arcade : rebond doux et message d'aide, jamais de crash brutal sur un décor.
5. **Véhicules d'ambiance** : suivent leurs trajets, ralentissent près du joueur, roues qui tournent selon la vitesse réelle.
6. **Objets amusants** : cônes, poubelles et ballons qui réagissent quand on les touche (renversés puis remis en place), drapeaux et manche à air liés à `env.windVector()`.
7. **Cabine** : colliders des sièges et largeur de l'allée adaptées aux nouveaux passagers ; tremblement de turbulence déjà en place.
8. **Tests automatiques** : étendre `navigation.test.js` (accès à chaque objet) et `flightAssist.sim.mjs` ; ajouter un test de non-blocage (marche de 500 trajets aléatoires sur la carte).

**Fini quand** : tous les tests passent et aucun objet ne bloque un chemin ou un poste du terminal.

## Étape 6 — Ciel, nuit et météo
- Deux couches de nuages, oiseaux en volée, avions lointains avec traînées, montgolfières.
- Nuit : halo des feux de piste, lampadaires qui s'allument, fenêtres éclairées, lumières de la ville, étoiles.
- Pluie : éclaboussures, sol mouillé brillant, brouillard plus doux, éclairs.

**Fini quand** : cycle jour/nuit complet regardé sans défaut visible ; FPS dans le budget.

## Étape 7 — Interface au même style
- Remplacer les emojis par des icônes dessinées (SVG) : ils changent d'une machine à l'autre (drapeaux illisibles sur Windows).
- Cartes et boutons arrondis, couleurs de la palette, animations douces.

## Étape 8 — Validation et clôture
- Tableau de mesures avant/après (FPS, draw calls, triangles, chargement).
- Captures de chaque zone, jour et nuit.
- README : nouvelle section « Phase 30 — Design, modèles et physique ».
- Vérifier `assets/models/CREDITS.md` complet.

---

## Règles pour toute la session
- **Coordination** : si une autre session est active, ne pas éditer les mêmes fichiers en même temps. Nouveau code dans de nouveaux fichiers quand c'est possible (`palette.js`, `props.js`, `colliders.js`).
- Après chaque étape : recharger le jeu, vérifier la console et le FPS, puis passer à la suivante.
- Changer le numéro de version `?v=` de tous les scripts à chaque livraison.
- Ne rien supprimer sans replacement : l'ancien décor reste en secours tant que le nouveau n'est pas validé.
- Une amélioration qui fait passer sous **90 FPS** sur le tarmac est revue avant d'être gardée.

## Questions à trancher au début de la session
1. **Téléchargements** : OK pour récupérer les modèles listés à l'étape 1, pack par pack (je donne nom, source et taille avant chaque fichier) ?
2. **Avion du joueur** : on garde le modèle actuel (fait par code) ou on le remplace par un modèle externe plus stylisé ? Le remplacer oblige à recaler la physique de vol.
3. **Priorité** : par quelle zone commencer (tarmac, terminal, cabine) ?

## Phrase de lancement
> « Lis PLAN_GRAPHISME_PHYSIQUE.md et commence par l'étape 0 puis l'étape 1. Demande-moi confirmation avant chaque téléchargement. »
