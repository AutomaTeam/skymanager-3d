# Plan « Un vrai petit jeu cool » (2026-10-09)

Le jeu a déjà énormément de choses (vol, réparation, terminal, cabine, véhicules, chien, montures,
îles, missions, déco, 30 niveaux...). Ce qui manque pour que ce soit **un vrai jeu** pour un enfant
de 12 ans, ce n'est pas une fonction de plus : c'est **une colonne vertébrale, de la lisibilité et
des sensations**. Diagnostic fait en jouant une partie neuve dans le Browser pane.

## Diagnostic (ce qu'un enfant ressent)

| # | Constat en jouant | Effet sur l'enfant |
|---|---|---|
| 1 | Après le tutoriel (8 étapes), il ne reste que des « défis du jour » qui changent chaque jour et un objectif suggéré qui tourne toutes les 40 s. | Pas d'histoire, pas de « je veux voir la suite ». On picore puis on s'ennuie. |
| 2 | La carte est grande ; aller du skatepark à l'avion ou à la caserne prend du temps à pied. | On perd du temps à marcher au lieu de jouer. |
| 3 | Des **EUR** apparaissent encore en mode Arcade (tableau HUB : « Duty-free : 0 EUR », « Billet 185 EUR » ; magasin de pièces du poste de réparation en EUR) alors que la monnaie du jeu est la pièce 🪙. | Deux monnaies : incompréhensible. |
| 4 | Le panneau de réparation parle comme un manuel (« Circuits hydrauliques », « Santé 48 % », « ordre(s) »). | Jargon. |
| 5 | Presque tout le texte est **sans accents** (« Repare l'avion », « Deplace-toi », « tresors »). | Ça fait « pas fini » ; un enfant qui apprend l'orthographe le remarque. |
| 6 | La caméra entre dans l'aile quand on va au poste de réparation sous l'aile (écran à moitié noir/blanc). | Bug visible dès le tutoriel. |
| 7 | Le tableau HUB affiche « AVION : EN VOL » quand l'avion est au parking. | Incohérent. |
| 8 | Les récompenses sont des toasts texte ; les pièces n'« arrivent » pas dans le compteur. | Peu de sensation de gain. |

## Lots

### Lot A — L'Aventure : une histoire en chapitres (colonne vertébrale) ⭐ priorité 1
- **A1** `js/story.js` : 6 chapitres × 4 quêtes, racontés par Coco. Chaque quête = un événement du jeu (`arcade.event`) à faire N fois, compté à partir du début de la quête. ✅
- **A2** L'objectif affiché après le tutoriel est la quête d'aventure en cours (avant les défis du jour), avec la flèche/le faisceau vers le bon endroit. ✅
- **A3** Panneau « 📖 Mon aventure » : les chapitres, les quêtes cochées, les chapitres suivants en « ? ». Bouton dans la colonne de gauche + tuile du menu pause. ✅
- **A4** Fin de chapitre = grand écran de fête (titre, récompense, confettis, fanfare) + vraie récompense (pièces, objet de peinture, titre). ✅
- **A5** Final du chapitre 6 : « Aéroport international », trophée « Légende de l'aventure ». ✅
- **A6** Coco annonce chaque nouvelle quête et félicite à chaque quête finie (bulle + voix si activée). ✅
- A7 (plus tard) une petite cinématique de caméra à chaque fin de chapitre (survol de l'aéroport).

### Lot B — Moins marcher, plus jouer ⭐ priorité 2
- **B1** Panneau « 🧭 Où aller ? » : téléportation avec fondu vers l'avion, le terminal, la tour, le skatepark, la caserne, les spotteurs, l'aviation légère, le tracteur, le bus. ✅
- **B2** Bouton dans la colonne de gauche, touche `T`. ✅
- **B3** Le panneau propose en premier l'endroit de la quête en cours (« ⭐ Pour ta quête »). ✅

### Lot C — Lisible pour un enfant ⭐ priorité 3
- **C1** Plus aucun EUR en mode Arcade (tableau HUB, panneau de réparation). ✅
- **C2** Mots simples au poste de réparation (« État », pas de stock/ordres en Arcade). ✅
- **C3** Accents français dans tout le texte affiché (HTML + chaînes JS affichées), par un outil qui ne touche qu'aux textes (`tools/accents.mjs`), jamais aux identifiants ni aux clés. ✅
- C4 (plus tard) relire chaque phrase de Coco à voix haute avec un enfant.

### Lot D — Bugs vus en jouant ⭐ priorité 4
- **D1** Caméra qui traverse l'aile : la caméra du tarmac se rapproche du joueur quand un morceau d'avion est entre les deux. ✅
- **D2** Tableau HUB « EN VOL » au parking → « AU PARKING » / « EN VOL » selon l'état réel. ✅
- D3 Le compteur de pièces affiche une valeur intermédiaire au tout premier lancement (288 puis 213) : animation du compteur depuis l'ancienne trésorerie ; à surveiller.

### Lot E — Des sensations (« jus ») ⭐ priorité 5
- **E1** Les pièces gagnées s'envolent vers le compteur, qui grossit et brille. ✅
- **E2** Les anneaux d'un même vol sonnent de plus en plus aigu (do-ré-mi...). ✅
- E3 (plus tard) ralenti de 0,4 s au toucher des roues quand c'est 3 étoiles.
- E4 (plus tard) vibration de manette / iPad déjà gérée ailleurs : la brancher sur la fin de chapitre.

### Lot F — Vérification
- **F1** Scénario navigateur `story` (`?scenario=story`) : finit une quête, un chapitre, ouvre les deux panneaux, voyage partout. ✅
- **F2** `npm test`, `npm run lint`, `?fuzz=1` après chaque lot. ✅
- F3 (à faire par un humain) une vraie partie de 20 min sur iPad avec l'enfant, noter où elle bloque.

## Idées pour la suite (non faites)
- Chapitres saisonniers (Halloween, Noël) branchés sur `seasonal.js`.
- Un « rival » sympa (un autre aéroport) dont on bat le score chaque semaine.
- Mode deux joueurs sur le même écran (un pilote, un au sol).
- Personnages récurrents avec un nom (la contrôleuse, le mécano) qui donnent les quêtes au lieu de Coco seul.

## Journal

| Tâche | Statut | Notes |
|---|---|---|
| A1–A6 | ✅ | `js/story.js` ; phase 123. Testé : scénario `?scenario=story` (6 chapitres, fêtes, final, trophées) + parcours à la main d'un chapitre dans le Browser pane. Quêtes pas jouées « pour de vrai » une par une (événements simulés). |
| A7 | ⏭ | survol caméra en fin de chapitre : pas fait |
| B1–B3 | ✅ | `js/travel.js`, touche T, 9 lieux tous praticables (scénario) |
| C1, C2 | ✅ | tableau GÉRER sans EUR, noms simples des pièces (`KID_PART`). Le bouton « HUB » s'appelle maintenant « GÉRER » |
| C3 | ✅ | phase 124 : `tools/accents.mjs` + `accents.dict.json`, 736 lignes relues à la main ; relancer `--diff` après avoir ajouté du texte |
| D1 | ✅ | caméra qui évite l'avion (rayon, 0,02 ms) ; avant/après vérifié à l'écran sous l'aile droite |
| D2 | ✅ | « au parking » / « en vol » |
| D3 | ⏭ | non reproduit après coup |
| E1, E2 | ✅ | pièces qui volent + compteur qui monte ; anneaux en gamme montante (pas écouté à l'oreille) |
| E3 | ✅ | existait déjà (ralenti 0,35 sur l'atterrissage parfait, fun.js) |
| F1, F2 | ✅ | 12 scénarios verts, fuzz 25 s sans erreur, `npm test` vert, lint 0 erreur |
| F3 | ⏭ | partie réelle sur iPad avec l'enfant : à faire par un adulte |
| Bonus | ✅ | phase 125 : le tutoriel fait voler dès l'étape 2 (et pas de menu de missions avant le premier vol) ; phase 126 : écrans de fête pour avion offert / nouveau titre, bulle de Coco qui ne cache plus les boutons |
| G (ajout) | ✅ | phases 127-128 : `js/growth.js`, chaque achat se voit (kiosques, portes, VIP, toit, balises, avions garés) + kiosques où l'on achète une glace (trophée Gourmand) ; cadeau du chapitre affiché |
| Contrôle tablette | ✅ | phases 129-130 : tours du chien qui cachaient 🛹 (bug existant), VUE qui chevauchait ATTERRIR ; vérifié par `elementFromPoint` en 1024x768 |
| Passe du 2026-10-10 | ✅ | phases 131-135 : nouveautés fusionnées (212 → 77 maillages), 2e moitié du tutoriel jouée pour de vrai, l'aventure ne répète plus le tutoriel, plus aucun €, écran titre avec l'avion à sa porte (il était enterré), fumée des ailes qui ne couvre plus l'écran, cabine sans jargon, panneaux accentués |
| A7 | ✅ | phase 137 : survol camera de 3,6 s avant l'écran de fin de chapitre (à pied) |
