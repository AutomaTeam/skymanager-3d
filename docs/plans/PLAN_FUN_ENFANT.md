> **Statut (2026-10-08) : FAIT : les 7 vagues sont realisees (voir README, phases 36 a 52). Reste utile pour les regles d'or de texte et de design enfant.**
> Ce plan est archive ici ; le plan en cours est `PLAN_AMELIORATION_SONNET.md` a la racine.

# Plan d'amélioration — « Que ce soit FUN pour un enfant de 12 ans »

*Écrit le 2026-10-02 après lecture du README, du mode Arcade (`js/arcade.js`) et des plans précédents.*

## Constat en 5 lignes
- Techniquement le jeu est énorme (vol, cabine, mécanique, terminal, PNJ, météo, tycoon), mais **c'est un simulateur d'adulte habillé en arcade** : beaucoup de systèmes, peu de « waouh ».
- Le début est lourd : rouler à la main jusqu'à la piste, tutoriel de 6 étapes, avant de **voler** — le moment le plus fun.
- Les défis de vol sont surtout « atterris doux » ; il manque des choses **à faire en l'air** (acrobaties, courses, missions rigolotes).
- Peu de **collection / personnalisation / surprises**, ce qui fait revenir un enfant.
- Les menus et textes restent denses pour un enfant.

## Vision
> **« Mon aéroport, mes avions, mes exploits. »** En 30 secondes je vole, en 5 minutes j'ai gagné quelque chose, en 1 heure j'ai un avion à moi que je montre à mes copains.

## Règles d'or (à relire avant chaque ajout)
1. **Voler en moins de 30 s** après le lancement. Le reste se découvre ensuite.
2. **Jamais d'échec frustrant** : un crash = rigolo + on repart en 2 s, sans perdre d'argent.
3. **Chaque action = une récompense immédiate** (son, confettis, pièces, étoile).
4. **Un seul but à l'écran**, en gros, avec flèche. Peu de texte, des icônes, voix du copilote.
5. **Toujours un « encore un ! »** : un défi court (< 2 min) qui donne envie d'en refaire un.
6. **Tout doit marcher au doigt sur iPad** : gros boutons, zéro geste fin.

---

## Chantier 1 — Démarrage éclair *(impact ★★★★★, effort S)*
- Écran d'accueil avec **3 gros boutons** : ✈️ *Voler maintenant* · 🏢 *Mon aéroport* · 🎨 *Mon hangar*.
- « Voler maintenant » : avion **déjà aligné piste, moteurs lancés**, décollage assisté en 1 bouton.
- Tutoriel **rejoué en jeu** et non bloquant : le copilote parle pendant le vol (« Tire doucement ! Super ! »).
- Option « Passer le tuto » toujours visible. Le roulage au sol devient un **bouton « Remorquer à la piste »** (téléportation animée).
- Choix du **nom du pilote + avatar** au premier lancement (3 secondes).

## Chantier 2 — Le vol devient un terrain de jeu *(★★★★★, effort M)*
- **Acrobaties** : tonneau, looping, vrille douce en un geste ; **score d'acrobaties** avec combos et fumée colorée derrière l'avion.
- **Boost / turbo** avec jauge qui se recharge en passant dans les anneaux.
- **Courses d'anneaux chronométrées** (circuits : canyon, ville, montagne, aéroport) avec médailles bronze/argent/or et **fantôme de son meilleur temps**.
- **Passages en rase-mottes** (sous un pont, entre deux tours) : bonus « Casse-cou ! » (sans risque réel).
- **Vol en formation** avec un avion IA qui suit : reste à côté de lui pour marquer des points.
- **Photo mode** : bouton appareil photo, filtres, cadre « carte postale » enregistré dans l'album.
- Caméras à choisir : cockpit, poursuite, **caméra cinéma** (auto), drone.
- Vol libre avec **monde à explorer** : îles, volcan, cascade, château, phare, ferme, cirque (voir chantier 7).

## Chantier 3 — Missions rigolotes *(★★★★★, effort M)*
Missions courtes (1 à 3 min), à choisir sur un **tableau de missions** avec images.
- 🔥 **Pompier** : arroser des feux de forêt en volant bas (hydravion).
- 🎁 **Père Noël / livreur** : lâcher des colis dans des cibles (cheminées, piscines, trampolines).
- 🚑 **Secours** : amener un patient / un médicament avant la fin du chrono.
- 🐧 **Animaux du zoo** : transporter un pingouin, un panda, un éléphant (cargaison qui réagit en cabine).
- 🎈 **Chasse aux ballons** : éclater des ballons colorés dans le ciel.
- 🏁 **Course contre un autre avion**.
- 🪁 **Bannière publicitaire** : tracter un message dans le ciel (le joueur choisit le texte !).
- 🌈 **Chasse à l'arc-en-ciel** après l'orage.
- 🎪 **Show aérien** : figures imposées devant la foule, note du public.
- Récompense : pièces, **autocollants**, pièces d'avion à débloquer.

## Chantier 4 — Mon avion à moi : personnalisation *(★★★★★, effort M)*
Les enfants adorent customiser. Le plus gros levier de rejouabilité.
- **Hangar** : choisir couleurs, **motifs** (flammes, requin, étoiles, damier), **autocollants**, nom sur le fuselage.
- Éditeur de livrée simple (couleurs à pipette + 10 motifs + 30 autocollants), rendu direct sur le modèle 3D.
- Accessoires : fumée colorée, traînées d'ailes, hélice ou réacteur lumineux, feux de couleur, klaxon rigolo, musique de cabine.
- Avatars : casque, lunettes, combinaison, mascotte (chien pilote, robot…).
- **Boutique** qui s'achète avec pièces (pas d'argent réel, pas d'achats intégrés).
- Boutons « Montrer mon avion » : capture d'écran du hangar.

## Chantier 5 — Plusieurs avions, plusieurs sensations *(★★★★☆, effort L)*
Débloqués par niveau. Chacun a une sensation de pilotage **vraiment différente** (réutiliser `flightPhysics.js` avec des profils).
| Avion | Plaisir |
|---|---|
| Petit avion à hélice | Facile, doux, parfait pour apprendre |
| Avion de voltige | Tonneaux serrés, fumée, courses |
| Hydravion | Se pose sur l'eau, missions pompier/pêche |
| Hélicoptère | Vol stationnaire, treuil, secours |
| Jet de ligne (actuel) | Gros, lent, passagers, tycoon |
| Planeur / ULM | Calme, thermiques, photo |
| Cargo | Largage de colis |
| Fusée-avion « fun » | Mode délire, vitesse extrême |
Option **« Mode facile / normal / expert »** par avion (assistance au pilotage réglable).

## Chantier 6 — L'aéroport tycoon version enfant *(★★★★☆, effort M)*
- **Placer soi-même** des boutiques, un parc de jeux, une glace, un manège, une fontaine, des arbres (glisser-déposer).
- PNJ avec **personnalités et petites histoires** : touriste perdu, clown, grand-mère avec perroquet, célébrité, groupe d'écoliers. Bulles de dialogue drôles.
- **Événements surprise** : arrivée d'une star, carnaval, tempête de neige (déneiger la piste), panne de courant, chien qui court sur la piste (le rattraper).
- Les clients heureux donnent des **cœurs** → niveau de l'aéroport → nouveaux bâtiments.
- Skins d'aéroport : jour, nuit, neige, bonbons (déjà amorcés avec `LEVEL_UNLOCKS`).

## Chantier 7 — Un monde vivant à explorer *(★★★★☆, effort L)*
- Dépasser la seule piste : **archipel de destinations** (plage, neige, désert, ville futuriste, jungle, volcan, château) avec atterrissage possible partout.
- **Secrets cachés** : étoiles, anneaux dorés, tunnel secret, île OVNI, baleine qui saute, cachette de trésor. Compteur « 12/40 trouvés ».
- Événements du ciel : arc-en-ciel, aurore boréale, feu d'artifice, banc d'oiseaux, montgolfières (déjà en partie), étoile filante.
- **Œufs de Pâques** : OVNI à suivre, dragon dans les nuages, clin d'œil à des jeux connus.
- Météo à choisir en mini-jeu (« chasseur de tempêtes » : voler dans l'orage pour des points).

## Chantier 8 — Mini-jeux au sol *(★★★★☆, effort M)*
Chacun se joue en 30 à 90 secondes et rapporte des pièces.
- **Chargement des bagages** (tri couleur, tapis roulant, Tetris-like).
- **Contrôle de sécurité** : repérer l'objet bizarre dans la valise (canard en plastique, banane…).
- **Ravitaillement** : tenir la jauge dans la zone verte.
- **Dégivrage / lavage** de l'avion (frotter l'écran).
- **Guide d'avion « Follow me »** : conduire la voiture jaune sans se faire doubler.
- **Marshaller** : faire les gestes avec les bras pour guider l'avion.
- **Tour de contrôle** : donner l'ordre de décollage aux avions IA (jeu de gestion de flux).
- **Cabine** : service express (déjà amorcé), avec bébés qui pleurent, boissons à servir, ceintures.

## Chantier 9 — Progression, collection, récompenses *(★★★★★, effort M)*
- **Album de collection** : villes visitées, avions, animaux transportés, autocollants, photos. Cases grisées à remplir.
- **Coffres surprise** (ouvrent avec animation) après chaque vol réussi.
- **Série du jour** (🔥 streak) + récompense quotidienne + défi de la semaine.
- **Succès / badges** en images (déjà 20 environ → viser 60 avec paliers bronze/argent/or).
- Niveau du pilote **et** niveau de l'aéroport, barre d'XP toujours visible.
- **Records personnels** : meilleur temps, meilleur score acrobatie, atterrissage le plus doux.
- Écran de fin de vol « Tu as gagné ! » : étoiles qui tombent, chiffres qui défilent, **compteurs qui se remplissent**.
- Mode **partage local** : envoyer un lien / une image de son avion et de ses records.

## Chantier 10 — « Juice » : sons, effets, mascotte *(★★★★★, effort M)*
Ce qui rend n'importe quel jeu agréable.
- **Mascotte copilote** (petit perroquet ou robot) qui encourage, avertit, plaisante. Voix synthétisée ou courts bruitages, bulles courtes.
- **Musique dynamique** : calme au sol, rythmée en course, grandiose à l'atterrissage parfait.
- **Retour visuel** : secousse de caméra, flash, étoiles, particules, ralenti à l'atterrissage parfait, **confettis** (déjà amorcés).
- **Sons** satisfaisants : pièce, anneau, combo qui monte en hauteur, tonneau « swoosh », moteur riche.
- Vibration (haptique) sur iPad quand supporté.
- Transitions courtes et animées entre menus ; plus de pages blanches.

## Chantier 11 — Accessibilité enfant et ergonomie *(★★★★☆, effort S/M)*
- **Boutons tactiles ≥ 64 px**, joystick réglable (taille/position), gauche/droit pour gauchers.
- **Textes courts + icônes** (déjà 67 icônes SVG) ; option « lire à voix haute ».
- Contrôles **inclinaison iPad** (gyroscope) en option pour piloter.
- **Mode sans stress** : pas de chrono, pas de panne, atterrissage automatique à tout moment (bouton « Aide »).
- **Aide contextuelle** : un « ? » qui explique l'écran en une phrase + image.
- **Pause intelligente** et sauvegarde automatique à chaque événement important.
- Option **« temps de jeu »** pour les parents (rappel de pause, simple).
- Textes relus pour être drôles, jamais effrayants (« Oups, on repart ! » au lieu de « CRASH »).

## Chantier 12 — Technique et robustesse *(★★★★☆, effort M)*
Sans ça le fun s'arrête dès que ça rame.
- **Perf iPad** : cible 30–60 fps constant ; qualité automatique selon fps ; chargement progressif (le jeu démarre avant tout le décor).
- **Découper `main.js` (2 760 l.), `renderer3d.js` (3 700 l.), `arcade.js` (1 820 l.)** en modules par chantier pour ajouter des fonctions sans risque.
- Sauvegarde versionnée avec **migration** (ne jamais perdre la progression).
- Tests automatiques : navigation (déjà 30), physique des avions, règles de score ; un test de fumée « le jeu démarre et on peut décoller ».
- Journal d'erreurs simple + bouton « Signaler un bug » pour que l'enfant ou le parent le retrouve.
- Bonne gestion mémoire (libérer les objets 3D quittés), arrêt des sons à la mise en veille.

---

## Feuille de route (par vagues, chacune jouable et testée avec l'enfant)

### Vague 1 — « Je vole tout de suite » (1–2 semaines) ★ À FAIRE EN PREMIER
Chantier 1 complet + boost + tonneau/looping + sons « juice » de base + mascotte avec 10 phrases + écran de fin de vol animé.
> Résultat : le premier quart d'heure devient fun.

### Vague 2 — « Mon avion » (2 semaines)
Hangar, livrées, autocollants, boutique à pièces, coffres surprise, 3 avions supplémentaires (hélice, voltige, hélicoptère).
> Résultat : envie de revenir pour personnaliser.

### Vague 3 — « Missions » (2–3 semaines)
Tableau de missions + 6 missions (pompier, colis, ballons, course, secours, zoo), courses d'anneaux avec fantôme et médailles, photo mode.
> Résultat : plein de choses à faire en l'air.

### Vague 4 — « Mon aéroport vit » (2–3 semaines)
Placement de bâtiments, PNJ à histoires, événements surprise, 4 mini-jeux au sol, album de collection, série du jour.
> Résultat : le côté tycoon devient amusant.

### Vague 5 — « Le grand monde » (3 semaines)
Archipel de destinations, secrets cachés, événements du ciel, hydravion, planeur, œufs de Pâques.
> Résultat : explorer devient une aventure.

### Vague 6 — « Peaufinage » (continu)
Optimisation iPad, découpage du code, tests, accessibilité, musique dynamique, mode parent.

---

## Les 12 petites choses qui changent tout (à faire dès maintenant, < 1 jour chacune)
1. Bouton « Décoller maintenant » sur l'accueil.
2. Fumée colorée derrière l'avion (choix de couleur).
3. Tonneau en un bouton avec « swoosh » et +points.
4. Son et animation plus gros quand on prend une pièce / un anneau.
5. Mascotte qui dit une phrase drôle à chaque atterrissage.
6. Slow-motion + confettis sur l'atterrissage 3 étoiles.
7. Possibilité de **renommer son avion** et de l'afficher sur le fuselage.
8. Écran de fin de vol : chiffres qui défilent et étoiles qui tombent.
9. Coffre surprise après chaque vol (même petit).
10. Bouton « Photo » qui enregistre une carte postale.
11. Crash = cartoon (rebondit, remet en place) au lieu d'un échec dur.
12. Réglage « difficulté » à 3 niveaux, affiché clairement.

---

## Comment savoir que c'est réussi (à tester avec l'enfant)
- Il **vole en moins de 30 s** sans aide.
- Il **rejoue de lui-même** le lendemain.
- Il **montre son avion** à quelqu'un.
- Il **dit « encore un »** à la fin d'une mission.
- Il **ne reste pas bloqué** plus de 20 s sur un écran (observer sans l'aider).
- Il peut citer **3 choses** qu'il veut débloquer ensuite.

*Méthode : à la fin de chaque vague, 15 minutes de session observée, 3 notes (ce qui l'a fait rire, ce qui l'a bloqué, ce qu'il redemande), puis réajuster la vague suivante.*
