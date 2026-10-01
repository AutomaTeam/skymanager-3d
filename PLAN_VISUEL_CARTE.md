# État des lieux et plan — Visuel, graphismes et carte

*Écrit le 2026-10-01 après lecture du code, du README, de `PLAN_GRAPHISME_PHYSIQUE.md` et une session de jeu (mode Arcade) dans le navigateur intégré.*

## Avancement (2026-10-01)
- ✅ Lot 0 : `git init` + commit initial (retour arrière possible).
- ✅ Lot 1 : personnage coloré par os (peau, haut orange pour le joueur, pantalon, chaussures), matériau mat : plus de silhouette blanche ni de halo (`paintHuman`, `renderer3d.js`).
- ✅ Lot 2 (partiel) : tarmac plus clair avec joints et taches adoucis, moquette du salon plus fine et plus sombre, herbe moins saturée.
- ✅ Carte (partiel) : étiquettes sans chevauchement (anti-collision, TERMINAL/TOUR déplacées hors bâtiment) et **itinéraire réel** vers l'objectif via la navigation. Limite connue : « FRET » et « CARBURANT » sont masquées faute de place.
- ✅ Clôture : tour à bandes rouges + balise, 2 canapés et 4 plantes contre le mur sud du hall (obstacles ajoutés, 30/30 tests de navigation OK), étiquettes de carte avec plus de positions d'essai.
- ✅ Refonte du terminal (`js/terminalDesign.js`, branché dans `terminalBuilding.js`) : sol par zones (enregistrement, sûreté, boutiques, bagages, allée centrale), plafond à nervures + bandeaux colorés + suspensions, 6 vitrines de boutiques, fresques aux pignons, bandeau de façade bleu compagnie. Positions des comptoirs et navigation inchangées (30/30 tests).
- ✅ Parking et abords (`decor.js`, section parking) : 4 rangées de places marquées, ~100 voitures Kenney de 8 modèles (obstacles de navigation, 30/30 tests), terre-plein arboré avec bordures, 3 passages piétons + ligne jaune sur la route, flèches d'allée, abribus + navette, haies fleuries sur 3 côtés. Anciennes voitures en boîtes retirées de `renderer3d.js`.
- ✅ Nuit et météo (`skylife.js`) : lumières de la ville (520) et du village (180) qui s'allument au crépuscule, fenêtres du quartier au sud du parking, balise de la tour qui clignote la nuit ; orage avec éclairs (flash de lumière en double impulsion + trait de foudre lointain, toutes les 6 à 18 s). Vérifié de nuit sous la pluie (halos de lampadaires, éclaboussures, fenêtres) ; l'éclair a été testé en valeurs, pas capturé à l'écran.
- ✅ Carte : zoom ×1 à ×5 (molette, pincement, double-clic, boutons − + ◎), déplacement au glisser, fond redessiné en double résolution, étiquettes à taille constante avec anti-collision (FRET et CARBURANT réapparaissent), itinéraire réel. Icônes SVG (`js/icons.js`, 67 icônes) : remplacement automatique des emojis connus dans toute l'interface (observateur DOM) et sur les cartes (canvas) ; les emojis sans icône (visages, drapeaux…) restent des emojis.
- ⏳ Non fait (volontairement, pour ne pas complexifier) : source unique des coordonnées de la carte, zoom/glisser, icônes SVG, terminal meublé, tour, parking, nuit/météo.

---

## 1. État des lieux

### Le projet en bref
SkyManager 3D : simulateur d'aéroport en HTML + Three.js, sans build, ~22 000 lignes de JS (`renderer3d.js` 3 700 l., `main.js` 2 760 l., `arcade.js` 1 820 l.). 31 phases livrées : vol, cabine, mécanique, terminal, PNJ, météo, mode Arcade. Sur le plan technique le jeu est très complet ; c'est le **rendu** qui est en retard sur le contenu.

### Ce qui est fait côté graphismes (Phase 30, partielle)
- 732 modèles Kenney CC0 + 2 modèles poly.pizza importés, crédités (`assets/models/CREDITS.md`, `INDEX.json`).
- `palette.js`, `props.js`, `decor.js` (bosquets, herbe, conteneurs, éoliennes, quartier), `skylife.js` (oiseaux, avions, montgolfières, pluie).
- Étalonnage doux + vignettage, ombres, bloom, IBL, textures procédurales.
- Budget mesuré : 621 draw calls, 519 k triangles, 2 855 objets, 697 ombres, 17 lumières, 120 shaders.

### Ce que j'ai constaté en jeu (captures)

| Zone | Constat | Gravité |
|---|---|---|
| **Personnage joueur** | Silhouette **blanche/bleue unie**, sans visage ni vêtements, avec un halo qui « brûle » (sur-exposition ou matériau émissif + bloom). Il est à l'écran 100 % du temps : c'est le défaut le plus visible. | Haute |
| **Tarmac** | Dalles grises avec joints noirs très durs, taches sombres en motifs répétés. Aspect « béton sale » sans la douceur du style visé. | Moyenne |
| **Herbe / arbres** | Herbe verte **plate et saturée**, arbres en boules vert fluo low-poly : détonnent avec le ciel et les bâtiments. Contraste dur entre vert pur et gris. | Moyenne |
| **Terminal (intérieur)** | Hall de 260 × 70 m **quasi vide** : moquette bleue au grain trop gros et trop claire, grande distance entre les postes, mobilier minuscule vu de loin. Peu de repères visuels. | Haute |
| **Tour de contrôle** | Cylindre gris uni sans détails (pas de cabine vitrée lisible, pas de bandes). | Moyenne |
| **Véhicules / parking** | Voitures en **couleurs pures** (rouge, bleu) sans reflets, très « blocs ». | Basse |
| **Ciel** | Correct, avec montgolfières et volées d'oiseaux : un des points forts. | OK |
| **HUD** | Cartes arrondies cohérentes ; bandeau objectif lisible. Emojis encore partout (rendu dépendant du système). | Moyenne |
| **Console** | Aucune erreur au chargement. | OK |
| **Performance** | Non mesurable ici (rendu logiciel) : le chargement + 1ʳᵉ frame prend > 10 s dans ce navigateur. À relever sur le PC. | À mesurer |

### La carte (mini-carte + grande carte, `arcade.js` `_mapBase` / `_drawMap`, `layout.js`)
Fonctionnelle et riche (objectif, radar de pièces, empreintes, vie de l'aéroport), mais :

1. **Fenêtre trop étroite** : `MAP_WIN = x -80..690, z 770..1510` ⇒ seulement ~770 × 740 m. La piste fait 3 000 m ; on n'en voit que le dernier quart. Le seuil nord, les bretelles et les GA/fret lointains sont invisibles.
2. **Étiquettes mal placées** : « FRET » coupé en haut, « TERMINAL » posé **sur** le bâtiment et sur l'étoile d'objectif, « TOUR » sur son propre marqueur, « POMPIERS » coupé en bas. Aucun anti-chevauchement.
3. **Style plat** : aplats verts + bandes grises, pas d'ombre portée, pas de relief ; ne ressemble pas au jeu 3D (tarmac sombre, bâtiments vitrés).
4. **Bâtiments sans identité** : le terminal est un rectangle bleu clair, les hangars des rectangles orange identiques.
5. **Mini-carte trop petite** pour porter des étiquettes ; ne tourne pas avec le joueur ; en bas le bandeau mange 15 % de la hauteur.
6. **Emojis** pour les lieux (🏢🗼🔧🅿️📦🚒⛽) : aspect variable selon l'OS.
7. **Pas de vraie couche d'infos** : pas de filtres (vestiaires, services, objectifs), pas de zoom ni de glisser, pas de légende contextuelle, pas de marqueur « tu es à l'intérieur du terminal ».
8. **Coordonnées en dur** dans `_mapBase` (ex. `rect(357.5, 1168, 362.5, 1198)`, `emoji('🔧', 540, 900)`) au lieu d'être lues dans `layout.js` : toute modification de la carte du monde désynchronise la carte dessinée.
9. Mini-carte **non utilisable en cabine / cockpit** (affichée seulement en `HUB`).

### Dette et risques
- `renderer3d.js` et `main.js` sont des monolithes ; tout ajout visuel ajoute du risque de régression.
- Dossier non versionné (**pas de git**) : aucune possibilité de revenir en arrière ni de comparer avant/après. À régler **avant** de toucher au rendu.
- `PLAN_GRAPHISME_PHYSIQUE.md` a des restes ouverts (étapes 3, 4, 6, 7) qui rejoignent ce plan.

---

## 2. Plan d'amélioration

**Principe** : une direction artistique unique, « coloré et doux » (déjà décidée), appliquée dans l'ordre de la **visibilité à l'écran**. Budget inchangé : ≥ 90 FPS PC, ≤ 900 draw calls. Chaque lot est livrable seul et se vérifie par capture avant/après.

### Lot 0 — Filet de sécurité (½ h)
- `git init` + premier commit de l'état actuel.
- Fixer un **jeu de 8 points de vue de référence** (tarmac, terminal-entrée, terminal-fond, parking, cabine, cockpit, nuit, pluie) via une fonction `?shots` qui téléporte la caméra, pour comparer avant/après à l'identique.

### Lot 1 — Le personnage et la lumière (priorité n°1)
1. Diagnostiquer le blanc brûlé du joueur (matériau émissif, `toneMappingExposure`, bloom `threshold`, absence de texture dans `character.glb`).
2. Donner une **identité** : tenue colorée (polo + pantalon + casquette) par teinte de palette, visage simple, ombre de contact ronde.
3. Choix de skin pour le joueur (3-4 tenues), cohérent avec l'économie de pièces du mode Arcade.
**Fini quand** : le joueur n'est plus ni blanc ni lumineux, lisible de jour comme de nuit.

### Lot 2 — Sols et matières (tarmac, herbe, hall)
1. Tarmac : joints fins et clairs, variation de teinte à grande échelle, marquages propres (axes, flèches, numéros de poste).
2. Herbe : deux teintes en bruit large + fleurs, moins saturée ; arbres : verts plus variés, troncs, ombres douces.
3. Hall terminal : moquette plus sombre et plus fine, bandes de couleur par zone (enregistrement / sûreté / embarquement), sol brillant devant la baie vitrée.
4. Ombres de contact peintes sous murs, mobilier, voitures.
**Fini quand** : captures tarmac / parking / hall validées.

### Lot 3 — Bâtiments et décor par zone
1. **Terminal intérieur** (le plus vide) : piliers, plafond à poutres + luminaires, panneaux suspendus lisibles de loin, bandes au sol qui guident vers chaque poste, plantes et mobilier en modèles 3D, tableau des départs animé. Passer de « halle vide » à 6 îlots lisibles.
2. **Tour** : fût à bandes, cabine vitrée large, radar tournant, balise clignotante.
3. **Hangars / fret / pompiers** : portes à rainures, enseignes, palettes et chariots, véhicules rouges.
4. **Parking** : voitures Kenney (variées, teintes de palette) à la place des blocs ; abri bus, bornes.
5. **Paysage lointain** : forêts instanciées, champs en damier, route à circulation, relief au loin pour fermer l'horizon.
**Fini quand** : ≥ 15 éléments visibles neufs par zone, sans dépasser le budget.

### Lot 4 — Ciel, nuit, météo (restes de l'étape 6)
- Nuit : fenêtres éclairées, lumières de la ville, étoiles, halos de piste ; éclairs ; fenêtres de cabine avec nuages qui défilent.
- Vérifier un cycle jour/nuit complet.

### Lot 5 — Interface au même style
- Remplacer les emojis (HUD, menus, carte) par un **jeu d'icônes SVG** unique (sprite `icons.svg`).
- Palette CSS unique (`palette.js` → variables CSS), cartes et boutons arrondis, animations douces. Écran titre avec visuel de l'aéroport au lieu d'un fond noir.

### Lot 6 — La carte (voir détail ci-dessous)

### Lot 7 — Validation
- Tableau de mesures avant/après (FPS, draw calls, triangles, chargement) sur le PC.
- Captures jour/nuit par zone, README « Phase 32 », `CREDITS.md` à jour, version `?v=`.

---

## 3. Plan détaillé — la carte

### Objectifs
Une carte qui **ressemble au jeu**, **se lit d'un coup d'œil**, et **reste juste** quand le monde change.

### A. Source de vérité unique (fondation, à faire en premier)
- Déplacer **toutes** les coordonnées encore en dur dans `_mapBase` vers `layout.js` (passerelle, icônes de hangars, pompiers, carburant, étiquettes). Ajouter dans `LAYOUT` une liste `mapLabels` : `{ id, name, icon, x, z, side, minZoom }`.
- Test dans `navigation.test.js` : chaque lieu de `mapLabels` est dans la fenêtre de carte et sur un point praticable (ou à l'entrée d'un bâtiment).

### B. Cadrage et zoom
- **Deux niveaux** : *Complexe* (≈ 770 × 740 m, actuel, mieux cadré avec marge pour les étiquettes de bord) et *Aéroport entier* (piste 3 000 m, seuil nord, GA, fret) pour la grande carte.
- Grande carte : **zoom molette / pincement + glisser**, bouton « me recentrer ».
- Mini-carte : option « **suit le joueur** » (centrée, rotation avec le cap), alternative « carte fixe ». Par défaut : centrée sur le joueur, 280 m de rayon, avec flèche d'objectif en bordure quand il sort du cadre.

### C. Direction artistique de la carte
- Palette tirée de `palette.js` (mêmes verts adoucis, tarmac sombre chaud, toits colorés).
- Relief léger : **ombre portée** décalée des bâtiments, contour clair 2 px, herbe en deux teintes, arbres en petits cercles groupés (au lieu de 46 points aléatoires).
- **Bâtiments distincts** : terminal avec baie vitrée + passerelle, hangars à toit rainuré, tour en pastille violette, pompiers rouges, fret brun ; pistes avec chiffres « 36 / 18 », flèches de taxiway.
- Légère **texture de papier** (grain) pour le côté « carte dessinée ».

### D. Étiquettes lisibles
- Placement automatique avec **anti-collision** (essai de 4 positions : dessus, dessous, droite, gauche ; sinon masquée à ce zoom).
- Étiquettes **hors des bâtiments**, avec petit trait vers l'objet ; priorité à l'objectif et au lieu courant.
- Taille liée au zoom ; sur la mini-carte : icônes seules, étiquette uniquement pour l'objectif.

### E. Icônes SVG
- Un pictogramme par lieu (terminal, tour, hangar/clé, parking, fret, pompiers, carburant, héliport) dessiné en SVG puis rasterisé une fois dans le cache `_bases`. Fin des emojis, rendu identique sur tous les OS (lié au Lot 5).

### F. Informations utiles
- **Filtres** (boutons à puces) : Lieux / Services / Pièces cachées / Véhicules / Objectifs.
- **Légende contextuelle** et bandeau du bas allégé (le lieu courant en pastille flottante au lieu d'une barre pleine largeur).
- **Intérieur du terminal** : carte détaillée du hall (comptoirs, sûreté, embarquement, carrousel, WC, boutiques, café) quand le joueur y entre ; bascule automatique.
- Marqueur **« vous êtes ici »** à l'intérieur (cabine, terminal, atelier) au lieu d'une flèche perdue sur le bâtiment.
- **Chemin réel** : tracer l'itinéraire A* (`nav.findPath`) vers l'objectif au lieu de la ligne droite en pointillés qui traverse les bâtiments.
- Disponible aussi en **cabine / cockpit** (version réduite).

### G. Performance
- Fond de carte rendu **une fois** en cache par (taille, thème, zoom) ; seuls joueur, vie, objectif et radar sont redessinés. Limiter la mini-carte à 20 fps. Pas de relecture de `LAYOUT` à chaque image.

### Ordre conseillé pour la carte
A (fondation) → B (cadrage) → D (étiquettes) → C (style) → F (chemin réel, filtres, hall) → E (icônes SVG, avec le Lot 5).

---

## 4. Ordre de réalisation global

| # | Lot | Effort | Impact visible |
|---|---|---|---|
| 0 | Git + points de vue de référence | ½ h | — (sécurité) |
| 1 | Personnage + exposition | 1 séance | ★★★★★ |
| 6A-D | Carte : source unique, cadrage, étiquettes, style | 1-2 séances | ★★★★ |
| 2 | Sols et matières | 1 séance | ★★★★ |
| 3 | Terminal, tour, parking, paysage | 2-3 séances | ★★★★★ |
| 5 + 6E | Icônes SVG, palette UI, écran titre | 1 séance | ★★★ |
| 6F-G | Carte : chemin réel, filtres, intérieur | 1-2 séances | ★★★ |
| 4 | Nuit, météo | 1 séance | ★★★ |
| 7 | Mesures et clôture | ½ séance | — |

## 5. Questions à trancher
1. **Personnage** : on garde `character.glb` en le repeignant, ou on le remplace par un modèle Kenney/Quaternius habillé ?
2. **Mini-carte** : fixe (comme aujourd'hui) ou centrée sur le joueur avec rotation ?
3. **Terminal** : on le **réduit** (moins de 260 m) pour le rendre dense, ou on le **meuble** à l'échelle actuelle ? (Réduire touche au bloc figé et aux tests de navigation.)
4. **Par quoi commencer** : Lot 1 (personnage) ou Lot 6 (carte) ?
