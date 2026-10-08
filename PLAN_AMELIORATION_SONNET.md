# Grand plan d'amélioration — à exécuter par Sonnet 5.5

*Écrit le 2026-10-08 (après les phases 42 à 54). Chaque tâche est autonome : un agent peut la prendre seule, la faire, la vérifier, la committer.*

---

## 0. À LIRE AVANT TOUTE TÂCHE (règles pour l'agent)

### Le projet en 10 lignes
- **SkyManager 3D** : jeu web Three.js (0.169) **sans build**, modules ES dans `js/`, lancé par `index.html` (servi par `devserver.py`, port 8123, config `skymanager` dans `.claude/launch.json`).
- Publié sur GitHub Pages depuis `master` : http://automateam.fr/skymanager-3d/
- Public principal : **un enfant (~12 ans) sur PC et iPad**. Le mode Arcade (`js/arcade.js`) est le mode par défaut ; le mode « pro » (simulateur complet) existe encore.
- Gros fichiers : `renderer3d.js` (3 845 l.), `main.js` (2 816 l.), `arcade.js` (2 156 l.), `textures.js` (1 238 l.).
- Chaque fonctionnalité « fun » vit dans **son propre module** et est appelée depuis la boucle gardée de `main.js` : `for (const m of [this.fun, ...]) try { m.update(dt) } catch …`.
- Les sauvegardes sont des clés `localStorage` `skymanager.*` (arcade, world, sky, hangar, fun, pet, look, rides, deco, mini, meet, staff, tycoon, cabin, mechanic, terminal, missions, history, environment, comfort, sfx).
- L'historique complet des phases est dans `docs/HISTORIQUE.md` (une section par phase) ; le `README.md` est un guide court.

### Règles de travail
1. **Une tâche = un commit** (message en français, comme l'historique : `Phase NN : <résumé>`). Ne pas pousser sans accord de l'utilisateur.
2. **Avant de coder** : lire le(s) fichier(s) cités + la section README correspondante. Ne pas réécrire ce qui marche.
3. **Après chaque changement de JS** : incrémenter le tampon `?v=` (il apparaît dans `index.html` et ~43 fois dans `main.js` ; chercher la valeur actuelle avec `grep -o "?v=[0-9]*" index.html` et la remplacer partout, y compris dans les imports des autres modules qui en ont).
4. **Tests** : `npm install three@0.169.0 --no-save` une fois, puis `npm test` doit rester vert. `test-navigation.html` doit rester à 30/30.
5. **Vérification navigateur** (Browser pane, `preview_start skymanager`) — astuces obligatoires :
   - Le rendu logiciel fait ~2 fps ; pour la logique, remplacer `__game.r3d.render` par une fonction vide (garder l'original pour le remettre).
   - Si le panneau est caché, `requestAnimationFrame` s'arrête : remplacer `requestAnimationFrame` et appeler `__game.loop()` à la main avec `__game.lastFrame = performance.now() - 16.67`.
   - Les captures ne montrent que 80 % de la page : `document.body.style.cssText+='width:100vw;height:100vh;transform-origin:0 0;transform:scale(.8)'`.
   - L'avatar est invisible sur une seule image (compilation de shaders) : rendre plusieurs images avant la capture.
   - `javascript_tool` coupe à 45 s : garder chaque script de test sous ~30 s.
   - La console garde les vieilles erreurs après un rechargement : vérifier la ligne avant d'y croire.
6. **Textes du jeu** : français simple, phrases courtes, émojis/icônes plutôt que paragraphes (règles d'or de `docs/plans/PLAN_FUN_ENFANT.md`). Dans le code et le README, rester cohérent avec l'existant (README sans accents).
7. **Jamais d'échec frustrant** pour l'enfant : pas de perte d'argent, pas de blocage, toujours une sortie en 1 bouton.
8. **Documenter** : ajouter une courte section `### <Titre> (phase NN)` en fin de `docs/HISTORIQUE.md` (le README est maintenant un guide court) pour chaque tâche visible par le joueur.
9. Ne pas toucher aux modèles `.glb` ni aux crédits sans raison ; ne rien télécharger d'internet sans accord.
10. Si une tâche s'avère plus grosse que prévu : faire la partie sûre, committer, noter le reste dans la section « Journal » en bas de ce fichier.

### Format des tâches
`ID — Titre` · **Taille** S (< 1 h), M (1–3 h), L (> 3 h) · **Impact** ★ à ★★★★★ · **Dépend de**
- *Pourquoi* — *Fichiers* — *Étapes* — *Fini quand* (critères vérifiables) — *Vérifier*

---

## Ordre conseillé (vagues)

| Vague | Contenu | Pourquoi d'abord |
|---|---|---|
| **V0** | T00 | Sauver le travail en cours |
| **V1 Fondations** | A01–A08, C01–C04 | Filet de sécurité avant de grossir encore |
| **V2 iPad & confort** | E01–E07, F01–F06 | L'enfant joue sur iPad |
| **V3 Architecture** | B01–B06 | Rendre les gros fichiers maniables (après les tests) |
| **V4 Contenu vol** | G01–G10 | Le cœur du fun |
| **V5 Vie au sol** | H01–H09 | Déjà riche, on approfondit |
| **V6 Progression** | I01–I07 | Donner envie de revenir |
| **V7 Son & image** | J01–J05, K01–K07 | Finition « waouh » |
| **V8 Perf** | D01–D06 | Mesurer sur ce qui existe à la fin |
| **V9 Docs** | M01–M03 | Remettre de l'ordre |

---

## V0 — Sauvegarde

### T00 — Committer les phases 53–54 · S · ★★★★★
- *Pourquoi* : `README.md`, `js/arcade.js`, `js/fun.js`, `js/groundFun.js` sont modifiés et non commités (doudou perdu, vrai selfie).
- *Étapes* : `npm test` ; vérifier rapidement dans le navigateur que le jeu démarre sans erreur console ; committer `Phases 53 et 54 : doudou perdu, vrai selfie au sol`.
- *Fini quand* : `git status` propre.

---

## A — Stabilité, bugs connus, incohérences

### A01 — Une seule signification pour « étoile » · M · ★★★★
- *Pourquoi* : les étoiles d'atterrissage (1 à 3 ⭐) et les 40 étoiles du ciel (🌟, `SKY_STARS` dans `arcade.js`, `openWorld.js`) se confondent pour un enfant.
- *Fichiers* : `arcade.js`, `openWorld.js`, `album.js`, `index.html`, `css/style.css`, `tools/data.test.mjs`.
- *Étapes* : garder ⭐ pour la note d'atterrissage ; renommer les collectibles du ciel en **« étoiles filantes » 🌠** (ou « gemmes du ciel » 💎 — choisir une seule option et l'appliquer partout : HUD, défis, trophées, album, carte, aide). Ne pas changer les clés de sauvegarde (seulement les libellés).
- *Fini quand* : `grep -n "étoile\|etoile\|⭐\|🌟" js/*.js index.html` ne montre plus de libellé ambigu ; `npm test` vert.

### A02 — Pastille prix de la tour cohérente · S · ★★★
- *Pourquoi* : la pastille de prix affiche la demande (~150 passagers) alors qu'un vol arcade embarque ~40 + 6 par embarqué.
- *Fichiers* : `airportTycoon.js`, `arcade.js`.
- *Étapes* : afficher le nombre de passagers **réellement embarqués** au prochain vol (même formule que le crédit), ou les deux avec libellés clairs (« 152 veulent partir · 46 montent »).
- *Fini quand* : la valeur affichée = la valeur créditée après un vol (tester avec 3 prix de billet).

### A03 — Collision du hub sous le ventre de l'avion · S · ★★
- *Pourquoi* : bug cosmétique connu : en réparation, le personnage traverse le dessous du fuselage.
- *Fichiers* : `mechanicSystem.js`, `bodies.js`, `renderer3d.js` (`updateHubCamera`).
- *Fini quand* : capture en mode réparation sans personnage dans la carlingue.

### A04 — Tutoriel complet sur sauvegarde neuve · M · ★★★★
- *Pourquoi* : étapes 5 à 8 jamais testées de bout en bout sur une sauvegarde vierge.
- *Étapes* : vider toutes les clés `skymanager.*` ; jouer le tuto entièrement (piloté par script) ; corriger tout blocage ; ajouter un bouton « Passer » visible à chaque étape s'il manque.
- *Fini quand* : un script de test peut aller de « nouvelle partie » à « tuto terminé » sans erreur console ; noter le script dans `tools/` (voir C03).

### A05 — Boucle du service cabine vérifiée · M · ★★★
- *Pourquoi* : jamais testée (phase 41). `cabinService.js`.
- *Fini quand* : un vol complet avec service (repas, boissons, demandes) se termine avec satisfaction > 0, aucune demande orpheline, aucune erreur.

### A06 — Panneaux déco / photo / album testés à fond · S · ★★★
- *Étapes* : ouvrir chaque panneau, utiliser chaque bouton, fermer avec Échap, la croix et en touchant à côté ; vérifier que le monde n'est jamais gelé après fermeture (bug déjà vu sur le panneau de réparation).
- *Fini quand* : liste des boutons testés notée dans le Journal ; zéro gel.

### A07 — Fuzz test permanent · M · ★★★★
- *Pourquoi* : un fuzz aléatoire a déjà été écrit à la main (phase 44) mais n'est pas conservé.
- *Fichiers* : nouveau `tools/fuzz.js` (à coller dans la console ou chargé via `?fuzz=1` dans `main.js`).
- *Étapes* : actions aléatoires (marcher, monter dans l'avion, décoller, ouvrir/fermer chaque panneau, monter sur une monture, conduire chaque véhicule, caresser le chien, pause, reprise) pendant N secondes, avec `render` neutralisé ; compter les exceptions attrapées par la boucle gardée (exposer un compteur `__game.errors`).
- *Fini quand* : `?fuzz=1&secs=25` affiche un rapport `{actions, errors:[...]}` ; 0 erreur sur 5 passes.

### A08 — Compteur d'erreurs visible en debug · S · ★★
- *Étapes* : la boucle gardée (`main.js`, `_frame()`) enregistre module + message + nombre dans `__game.errors` ; la console de débogage (README « Console de debogage ») gagne une commande `errors`.
- *Fini quand* : une erreur forcée dans un module apparaît dans `errors` sans geler le jeu.

---

## B — Architecture (rendre les gros fichiers maniables)

> Règle : **refactor à comportement identique**. Avant chaque tâche B, faire passer A07 (fuzz) et `npm test` ; après, refaire les mêmes et comparer.

### B01 — Découper `main.js` · L · ★★★ · dépend de A07
- *Étapes* : sortir en modules : `hudController.js` (mise à jour du HUD), `pauseMenu.js` (menu pause + réinitialisation), `hubUpdate.js` (branche `updateHub` : véhicules, montures, social, chien), `saveReset.js`. `main.js` garde la classe `Game`, l'ordre d'init et la boucle.
- *Fini quand* : `main.js` < 1 500 lignes ; mêmes résultats fuzz/tests ; aucune variable globale nouvelle.

### B02 — Découper `renderer3d.js` · L · ★★★ · dépend de A07
- *Étapes* : extraire `renderSky.js` (`buildSky`, `buildEnvSky`), `renderLights.js` (`buildLights`, `applyEnvironment`, ombres, bloom), `renderGround.js` (`buildGroundMarkings`, `buildGroundProps`), `renderCamera.js` (`updateCamera`, `updateHubCamera`, `rideCam`), `renderAvatar.js` (`paintHuman`, `updateAvatarAnim`). Fonctions qui prennent le renderer en paramètre ou mixins sur le prototype.
- *Fini quand* : `renderer3d.js` < 1 800 lignes ; capture avant/après identique (jour, nuit, pluie).

### B03 — Découper `arcade.js` · L · ★★★
- *Étapes* : `arcadeChallenges.js` (défis du jour/semaine, `currentGoal`, `_suggestGoal`), `arcadeBadges.js` (trophées), `arcadeMap.js` (carte), `arcadeData.js` (`SKY_STARS`, `SKY_ISLANDS`, catalogues — à garder importable par `tools/data.test.mjs`).
- *Fini quand* : `arcade.js` < 1 000 lignes ; `npm test` vert.

### B04 — Registre des modules de jeu · M · ★★
- *Pourquoi* : chaque nouveau module se branche à la main à 4–6 endroits (`main.js` boucle, `social.near`, `bodies.collectBodies`, `arcade.currentGoal`, `rides._canRide`, aide).
- *Étapes* : petit registre `js/registry.js` : `register({id, update, bodies?, interactions?, goals?, help?})` ; migrer 3 modules simples (pet, ambience, bus) pour valider, puis le reste si simple.
- *Fini quand* : ajouter un module = 1 fichier + 1 import ; documenté dans README « Architecture ».

### B05 — Sauvegarde centralisée et versionnée · M · ★★★★
- *Fichiers* : nouveau `js/save.js`.
- *Étapes* : API `save.load(key, defaults, version, migrate)` / `save.write(key, data)` avec try/catch (Safari privé), fusion avec les défauts (champs ajoutés plus tard), numéro de version par clé ; migrer les ~20 modules progressivement ; la réinitialisation de la pause passe par `save.resetAll({keep:['comfort','sfx']})`.
- *Fini quand* : une sauvegarde corrompue (JSON invalide) dans n'importe quelle clé ne casse plus le démarrage (test : écrire `"{"` dans chaque clé puis recharger).

### B06 — Nettoyage du code mort · S · ★★
- *Étapes* : chercher fonctions/exports jamais appelés (`grep` sur chaque `export`), éléments HTML sans référence JS, classes CSS orphelines dans `style.css`. Supprimer seulement ce qui est sûr à 100 %.
- *Fini quand* : liste des suppressions dans le commit ; fuzz OK.

---

## C — Tests et outillage

### C01 — Lint « no-undef » scripté · S · ★★★
- *Étapes* : ajouter `eslint.config.js` minimal (globals navigateur, `THREE` si global, règles `no-undef`, `no-unused-vars` en warn, `no-dupe-keys`) et un script `npm run lint` (eslint installé en `--no-save` comme three, noter la commande dans README).
- *Fini quand* : `npm run lint` passe sans erreur.

### C02 — Test du tampon `?v=` · S · ★★
- *Étapes* : `tools/stamp.test.mjs` vérifie que tous les `?v=` de `index.html` et `js/*.js` ont la même valeur ; l'ajouter à `npm test`. Bonus : `tools/bumpStamp.mjs` qui remplace partout par `Date.now()/1000|0`.
- *Fini quand* : un tampon oublié fait échouer `npm test`.

### C03 — Scénarios navigateur rejouables · M · ★★★★
- *Étapes* : dossier `tools/scenarios/` avec des scripts JS à coller (ou charger via `?scenario=nom`) : `firstFlight`, `tutorial`, `allPlanes`, `allRides`, `allVehicles`, `petFetch`, `nightRain`. Chacun pilote `__game` pas à pas et renvoie `{ok, steps, errors}`.
- *Fini quand* : chaque scénario renvoie `ok:true` ; README « Tests » explique comment les lancer.

### C04 — Test des sauvegardes · S · ★★★ · dépend de B05
- *Étapes* : `tools/save.test.mjs` (stub `localStorage`) : défauts, migration, JSON corrompu, reset sélectif.

### C05 — Tests de l'économie · M · ★★★
- *Étapes* : `tools/economy.sim.mjs` simule 2 h de jeu typique (vols, défis, revenus déco plafonnés à 8/min, avions +2/min) et affiche la courbe pièces/temps ; seuils : premier achat d'avion entre 15 et 30 min, tour complète en 2 à 4 h.
- *Fini quand* : la simulation tourne dans `npm test` et vérifie ces seuils ; si hors seuil, ajuster `KID_COST` (voir I01).

---

## D — Performance (iPad surtout)

### D01 — Mesure de référence · S · ★★★
- *Étapes* : utiliser `perfHud.js` ; noter dans le Journal appels de dessin, triangles, ms JS/frame à 5 endroits (parking, terminal intérieur, piste, skatepark, en vol au-dessus des îles), jour et nuit.

### D02 — Instancing du décor répété · M · ★★★★
- *Fichiers* : `decor.js`, `deco.js`, `scenery.js`, `props.js`.
- *Étapes* : regrouper arbres, plots, lampadaires, bancs, panneaux en `InstancedMesh` (ou fusion de géométries statiques par matériau).
- *Fini quand* : -30 % d'appels de dessin au parking (mesure D01).

### D03 — LOD des personnages · M · ★★★
- *Étapes* : au-delà de ~40 m, animation à 1 image sur 3 ; au-delà de ~80 m, masquer (ou silhouette simple). Ne jamais toucher au joueur ni au chien.

### D04 — Ombres adaptatives · S · ★★★
- *Étapes* : taille de carte d'ombre et distance selon le niveau auto de `comfort.js` ; ombres coupées en vol haut (> 600 m) sauf l'avion.

### D05 — Chargement plus rapide · M · ★★★
- *Étapes* : écran de chargement avec barre réelle (`assetLoader.js`) ; textures procédurales lourdes générées à la demande (pas au démarrage) ; mesurer le temps jusqu'au premier contrôle avant/après.
- *Fini quand* : démarrage à froid au moins 25 % plus rapide (mesure dans le Journal).

### D06 — Garde mémoire · S · ★★
- *Étapes* : vérifier que fermer/rouvrir panneaux, changer d'avion, de livrée, de pelage ne fait pas grossir `renderer.info.memory` (dispose des géométries/textures remplacées — `pet.setFur`, `livery.js`, `look.js`).

---

## E — iPad, tactile et installation

### E01 — PWA installable et hors ligne · M · ★★★★★
- *Pourquoi* : l'enfant lance le jeu depuis l'écran d'accueil de l'iPad, même sans wifi.
- *Fichiers* : nouveau `manifest.webmanifest`, `sw.js`, icônes `assets/icons/` (générées en canvas → PNG par un petit script `tools/makeIcons.mjs`, pas de téléchargement), `index.html`.
- *Étapes* : manifeste (nom, `display: fullscreen`, orientation paysage, couleurs) ; service worker « cache d'abord » versionné par le tampon `?v=` ; Three.js : vérifier d'où il est chargé (CDN ?) et le mettre en cache aussi ; balises `apple-mobile-web-app-*`.
- *Fini quand* : en coupant le serveur après un premier chargement, un rechargement fonctionne ; pas de vieux cache après un bump du tampon.

### E02 — Gros boutons partout (audit tactile) · M · ★★★★
- *Étapes* : tous les boutons ≥ 48 px CSS, espacement ≥ 8 px ; aucune action qui demande survol, clic droit ou double clic ; vérifier en `resize_window` mobile/tablette.
- *Fini quand* : liste des boutons corrigés dans le commit ; captures tablette du HUD sol, vol, pause.

### E03 — Mise en page sûre (encoche, barre d'accueil) · S · ★★★
- *Étapes* : `env(safe-area-inset-*)` sur le HUD ; `viewport-fit=cover`.

### E04 — Contrôle par inclinaison (option) · M · ★★★
- *Pourquoi* : jamais fait faute d'appareil. On le code proprement, désactivé par défaut.
- *Fichiers* : `touchControls.js`, `comfort.js`.
- *Étapes* : `DeviceOrientationEvent` (avec `requestPermission()` sur iOS, déclenché par un bouton), calibrage « tiens l'iPad comme tu veux puis touche OK », zone morte, sensibilité réglable.
- *Fini quand* : simulation via faux événements dans la console qui fait tourner l'avion ; option dans le confort ; noté « non testé sur appareil » dans le Journal.

### E05 — Manette de jeu · M · ★★★
- *Étapes* : Gamepad API (manette Xbox/PS/MFi) : sticks = joystick tactile, gâchettes = gaz, A = action contextuelle, B = retour, Start = pause.
- *Fini quand* : faux gamepad injecté dans la console pilote l'avion et le perso.

### E06 — Retour haptique · S · ★
- *Étapes* : `navigator.vibrate` (Android) aux atterrissages, pièces, chocs ; désactivable.

### E07 — Reprise propre après mise en veille · S · ★★★
- *Étapes* : sur `visibilitychange` → pause auto (sauf mini-jeux qui utilisent `setInterval` exprès), reprise sans saut de physique (dt plafonné, déjà 0.05 : vérifier aussi audio et musique).

---

## F — Confort, accessibilité, clarté

### F01 — Lecture vocale de tous les textes importants · M · ★★★★
- *Pourquoi* : `fun.js` utilise déjà `speechSynthesis` pour Coco ; un enfant lit moins vite.
- *Étapes* : fonction commune `say(text, {priority})` avec file d'attente, voix française choisie si dispo, débit réglable ; brancher objectifs, défis, tuto.

### F02 — Taille du texte et contraste · S · ★★★
- *Étapes* : réglage « texte : normal / grand / très grand » (variable CSS racine) ; contraste ≥ 4.5:1 sur le HUD (utiliser le skill `design:accessibility-review` si utile).

### F03 — Mode daltonien · S · ★★
- *Étapes* : anneaux, flèches, marqueurs : ajouter forme/icône en plus de la couleur ; palette alternative dans `palette.js`.

### F04 — « Je suis perdu » · S · ★★★★
- *Étapes* : bouton 🧭 dans la pause : téléporte le joueur au hub (ou l'avion au parking) avec un fondu ; en vol, « Rentrer à l'aéroport » active l'atterrissage assisté.

### F05 — Panneau d'aide visuel · M · ★★★
- *Étapes* : refaire l'aide en cartes illustrées (icône + 1 phrase + bouton « Montre-moi » qui active la flèche vers l'endroit).

### F06 — Limite de temps parentale (option) · S · ★★★
- *Étapes* : dans « Plus d'options », protégé par un petit calcul (ex. 7 × 8) : durée max par jour, message doux de fin (« Coco va dormir, à demain ! ») avec sauvegarde.

---

## G — Contenu en vol (cœur du fun)

### G01 — Planeur et ascendances · L · ★★★★
- *Pourquoi* : idée laissée de côté (vague fun). Le calme après les acrobaties.
- *Fichiers* : `fleet.js`, `planeModels.js`, `flightPhysics.js`/`flightAssist.js`, `openWorld.js`, `tools/fleet.sim.mjs`.
- *Étapes* : nouvel appareil « Plume » (sans moteur, finesse ~30) ; remorquage automatique jusqu'à 600 m puis largage ; colonnes d'ascendance visibles (oiseaux qui tournent, petits cumulus) au-dessus des îles et des parkings ; vario sonore (bip qui monte) ; défi « reste 3 min en l'air ».
- *Fini quand* : `npm test` (fleet sim) inclut le planeur et vérifie qu'il monte dans une ascendance et descend hors ascendance.

### G02 — Vol en formation avec un avion IA · L · ★★★★
- *Étapes* : un avion IA (« Capitaine Coco ») suit un parcours ; boîte de formation visible (fantôme) ; points tant que le joueur y reste ; 3 niveaux de parcours ; mission dans `skyMissions.js` avec médailles.

### G03 — Fantôme du meilleur temps · M · ★★★★
- *Étapes* : enregistrer position/rotation à 10 Hz pendant les courses d'anneaux ; rejouer un avion transparent ; sauvegarde compressée (delta + arrondi) dans `skymanager.sky`.

### G04 — Nouvelles missions · M chacune · ★★★★
Ajouter dans `skyMissions.js`, chacune avec médailles bronze/argent/or et une icône :
1. 🎪 **Show aérien** : figures imposées (tonneau, looping, passage bas) devant la foule des spotters (`ambience.js`) qui applaudit.
2. 🪁 **Bannière** : l'enfant tape un message (12 caractères, filtre de mots), tracté derrière l'avion, visible en photo.
3. 🌈 **Arc-en-ciel** : apparaît après la pluie (`environment.js`), le traverser = bonus.
4. 🐧 **Zoo volant** : cargaison d'animaux qui réagit aux secousses (sons, émojis dans la cabine).
5. 🎈 **Ballons géants** : éclater 20 ballons en 90 s.
6. 🚁 **Sauvetage hélico** : treuiller un randonneur sur une île (Colibri).
- *Fini quand* : chaque mission jouable de bout en bout via scénario C03.

### G05 — Météo-jeu · M · ★★★
- *Étapes* : orage évitable (nuages sombres = secousses douces + éclairs, jamais de crash) ; vent annoncé par une manche à air géante sur la piste ; brouillard du matin avec balisage lumineux.

### G06 — Atterrissages ailleurs · M · ★★★★
- *Étapes* : petites pistes sur 2–3 îles (`openWorld.js`) avec un mini-événement à l'arrivée (marchand de glaces, phare à visiter à pied, pique-nique) ; hydravion amerrissage sur le lagon.

### G07 — Caméra cinéma et rejeu · M · ★★★
- *Étapes* : enregistrer les 20 dernières secondes ; bouton « Revoir » après un atterrissage ou une acrobatie : caméras auto (sol, poursuite, aile) ; bouton photo pendant le rejeu.

### G08 — Pilote automatique « balade » · S · ★★
- *Étapes* : tour des îles automatique pour regarder le paysage et prendre des photos (l'enfant peut reprendre la main à tout moment).

### G09 — Copilote vivant · M · ★★★
- *Étapes* : Coco commente selon le contexte (premier vol de la journée, nuit, pluie, record battu, nouvel avion) avec 5–10 variantes par situation pour éviter la répétition (mémoire des 10 dernières phrases).

### G10 — Livraisons inter-îles · M · ★★★
- *Étapes* : commandes simples (« 3 caisses de glaces pour l'île Coco ») avec carte, récompense, et stock visible au sol (lien avec `tug.js` pour charger).

---

## H — Vie au sol

### H01 — Rampes satellites et éclairage du skatepark · M · ★★★
- *Pourquoi* : laissé en suspens (phase 40).
- *Fichiers* : `rideCourse.js`, `ridePark.js`, `tools/rides.test.mjs`.
- *Étapes* : 4–6 petits modules (tremplin, rail, quarter) le long des allées entre parking et terminal ; projecteurs du skatepark la nuit (en respectant la règle perf de la phase 47 : lumières la nuit seulement).

### H02 — Chien : nouvelles astuces · M · ★★★
- *Fichiers* : `pet.js`.
- *Étapes* : apprendre « assis », « couché », « tourne », « high five » par répétition (3 fois = appris, trophée) ; il creuse et trouve un trésor rare 1 fois par jour ; il monte dans le bus/tracteur avec le joueur.

### H03 — Nouveaux véhicules · M chacun · ★★★
- *Base* : `vehicle.js` (`drive`, `button()`, `body()`, `_seat/exit`).
1. 🚚 **Camion avitailleur** : remplir l'avion avant le vol (jauge, +pièces).
2. 🧹 **Balayeuse de piste** : ramasser des débris (FOD) qui apparaissent, mini-défi chrono.
3. 🪜 **Escalier mobile** : l'amener à la porte de l'avion pour faire descendre les passagers.
- *Fini quand* : chaque véhicule dans `game.vehicles`, `social.near`, `bodies`, aide ; scénario `allVehicles` à jour.

### H04 — Métiers à la journée · M · ★★★
- *Étapes* : un tableau « Aujourd'hui je suis… » : pompier, bagagiste, guide, mécanicien, contrôleur ; chaque métier donne 3 petites tâches enchaînées et un costume (lien `look.js`).

### H05 — Intérieur du terminal plus vivant · M · ★★★
- *Étapes* : boutique où l'on achète vraiment un objet cosmétique, café avec PNJ assis, fenêtre de spotting avec jumelles (zoom caméra), tapis bagages qui tourne avec valises.

### H06 — Cache-cache / chasse au trésor · M · ★★★
- *Étapes* : 10 « Coco cachés » sur la carte au sol (renouvelés chaque semaine) ; indice chaud/froid par le chien qui renifle (réutiliser la logique `pet` des pièces au trésor).

### H07 — Événements saisonniers · M · ★★★
- *Étapes* : selon la date réelle : Halloween (citrouilles, PNJ déguisés, octobre !), Noël (neige légère, sapin dans le hall, mission livraison de cadeaux), anniversaire du pilote (à saisir dans le profil, gâteau et confettis).
- *Note* : on est le 2026-10-08 → commencer par Halloween.

### H08 — Repos et nuit · S · ★★
- *Étapes* : banc / lit au salon VIP pour « dormir jusqu'au matin » (accélère le cycle jour/nuit `environment.js` en fondu).

### H09 — Photos de groupe · S · ★★
- *Étapes* : au selfie (`fun.selfie`), les PNJ salués et le chien à proximité se tournent vers la caméra et font un geste.

---

## I — Progression, économie, collection

### I01 — Rééquilibrage mesuré · M · ★★★★ · dépend de C05
- *Étapes* : ajuster `KID_COST` (`airportTycoon.js`), récompenses de missions et défis selon la simulation C05 ; noter avant/après dans README.

### I02 — Niveaux de pilote · M · ★★★★
- *Étapes* : XP gagnée par tout (vols, missions, salutations, véhicules) ; niveau 1 à 30 avec une récompense visible à chaque niveau (livrée, autocollant, accessoire, avion) ; écran de niveau qui montre la prochaine récompense.

### I03 — Carnet de collection unifié · M · ★★★
- *Étapes* : un seul écran « Mes trésors » qui regroupe autocollants, trophées, photos, étoiles filantes, îles, animaux rencontrés, avec pourcentage global et filtres.

### I04 — Coffre du jour avec suite · S · ★★★
- *Étapes* : série de jours (1 → 7) avec récompense croissante, **sans punition** si on rate un jour (la série recule d'un cran seulement).

### I05 — Éditeur de livrée v2 · L · ★★★★
- *Fichiers* : `livery.js`, `hangar.js`.
- *Étapes* : peinture par zones (fuselage, ailes, queue, moteurs), 10 motifs, 30 autocollants placés au doigt sur le modèle (raycast), nom sur le fuselage, aperçu 360°.

### I06 — Partage de code d'avion · S · ★★
- *Étapes* : exporter livrée + nom en code court (base64 compact) que l'enfant peut copier pour un copain ; import avec validation stricte.

### I07 — Sauvegarde exportable · S · ★★★★ · dépend de B05
- *Étapes* : bouton « Sauvegarder dans un fichier » / « Charger un fichier » (toutes les clés `skymanager.*` en JSON) dans « Plus d'options » ; protège contre la perte des données Safari.

---

## J — Son

### J01 — Audit audio complet · M · ★★★
- *Pourquoi* : l'audio n'a jamais été testé (phase 41).
- *Étapes* : lister chaque son de `sfx.js` et `music.js`, vérifier qu'il se joue au bon moment, volumes équilibrés, pas de son qui boucle à l'infini en pause ; déblocage de l'AudioContext au premier toucher sur iOS.

### J02 — Mixage par catégories · S · ★★★
- *Étapes* : curseurs musique / effets / voix dans le confort ; ducking (la musique baisse quand Coco parle).

### J03 — Sons d'ambiance spatialisés · M · ★★
- *Étapes* : `PannerNode` pour moteurs des autres avions, fontaine, foule du hall, oiseaux ; atténuation à la distance.

### J04 — Musiques par lieu · M · ★★
- *Étapes* : thème hall, thème skatepark, thème îles, thème nuit ; transitions croisées dans `music.js`.

### J05 — Klaxons et sons rigolos à choisir · S · ★★
- *Étapes* : 6 klaxons synthétisés (pas de fichiers) pour avion/véhicules, à débloquer.

---

## K — Image et « waouh »

### K01 — Nuages volumétriques simples · L · ★★★★
- *Étapes* : nuages en sprites/billboards en couches (ou shader raymarch léger en qualité haute uniquement) qu'on traverse avec une brume ; désactivés en qualité basse.

### K02 — Eau plus belle · M · ★★★
- *Étapes* : vagues animées, écume sur les plages des îles, reflet du soleil, sillage de l'hydravion.

### K03 — Particules et confettis unifiés · S · ★★★
- *Étapes* : un seul système de particules pooled (confettis, fumée, poussière à l'atterrissage, éclaboussures, étincelles de grind) au lieu de plusieurs.

### K04 — Atterrissage spectaculaire · S · ★★★
- *Étapes* : fumée des pneus au toucher, petite secousse caméra, ralenti 0,5 s sur un atterrissage 3 ⭐.

### K05 — Cycle de la journée plus marqué · M · ★★
- *Étapes* : lever/coucher de soleil plus colorés, étoiles et lune plus visibles, lumières des fenêtres du terminal la nuit.

### K06 — Animations des personnages · M · ★★★
- *Étapes* : variété de marche (pressé, flâneur, enfant qui sautille), transitions douces entre clips, regards vers le joueur quand il passe près.

### K07 — Écran titre vivant · S · ★★★
- *Étapes* : vue cinéma lente de l'aéroport derrière les 3 gros boutons, avion qui décolle de temps en temps.

---

## M — Documentation

### M01 — README restructuré · M · ★★
- *Pourquoi* : 2 280 lignes, ordre historique, difficile à lire.
- *Étapes* : garder l'historique dans `docs/HISTORIQUE.md` ; le README devient : présentation, lancer, déployer, architecture (registre, sauvegarde, boucle), tests, débogage, liens.

### M02 — Carte des modules · S · ★★
- *Étapes* : `docs/MODULES.md` : un tableau (module, rôle, clé de sauvegarde, qui l'appelle). Généré en partie par un script `tools/modules.mjs` qui lit les imports.

### M03 — Archiver les vieux plans · S · ★
- *Étapes* : déplacer `docs/plans/PLAN_FUN_ENFANT.md`, `docs/plans/PLAN_GRAPHISME_PHYSIQUE.md`, `docs/plans/PLAN_VISUEL_CARTE.md` dans `docs/plans/` avec un statut en tête (fait / partiel / abandonné).

---

## Récapitulatif

| Lot | Tâches | Gros impact à faire en premier |
|---|---|---|
| A Stabilité | 8 | A01, A04, A07 |
| B Architecture | 6 | B05 |
| C Tests | 5 | C03, C05 |
| D Perf | 6 | D02 |
| E iPad | 7 | E01, E02 |
| F Confort | 6 | F01, F04 |
| G Vol | 10 (+6 missions) | G01, G02, G03, G04, G06 |
| H Sol | 9 | H03, H07 (Halloween !) |
| I Progression | 7 | I02, I05, I07 |
| J Son | 5 | J01 |
| K Image | 7 | K01, K04 |
| M Docs | 3 | M01 |

**Total : 80 tâches environ.** Une session Sonnet peut raisonnablement enchaîner 3 à 8 tâches S/M ou 1 à 2 tâches L.

### Prompt type pour lancer une session
> « Lis `PLAN_AMELIORATION_SONNET.md` (section 0 obligatoire). Fais les tâches **XXX, YYY** dans l'ordre. Pour chacune : lis les fichiers, code, bump du `?v=`, `npm test`, vérifie dans le Browser pane avec les astuces de la section 0, ajoute la section README, commit. Note dans le Journal ce qui reste ou ce qui n'a pas pu être testé. Ne pousse pas. »

---

## Journal (à remplir par les agents)

*Session Sonnet 5.5 du 2026-10-08. Légende : ✅ fait et vérifié · 🟡 partiel · ⏭ non fait (raison).*

| Tâche | Statut | Notes / non testé |
|---|---|---|
| T00 | ✅ | commit des phases 53–54 |
| A01 | ✅ | « étoiles filantes » 🌠 ; le badge garde son nom « Chercheur d'étoiles » |
| A02 | ✅ | « N veulent partir · M montent » |
| A03 | ⏭ | bug cosmétique non reproduit (pas de rendu net sous le fuselage dans le Browser pane) |
| A04 | 🟡 | bouton Passer + scénario `tutorial` ; pas joué à la main de bout en bout |
| A05 | 🟡 | scénario `cabin` (service, sortie) ; boucle de satisfaction complète non mesurée |
| A06 | ✅ | scénario `panels` : 9 panneaux, aucun gel |
| A07 | ✅ | `?fuzz=1` ; 3 passes de 25 s, 0 erreur (le plan demandait 5) |
| A08 | ✅ | `__game.errors` |
| B01–B03 | ✅ | `main.js` ~950 l., `renderer3d.js` ~690 l., `arcade.js` ~460 l. ; `tools/splitClass.mjs` |
| B04 | 🟡 | registre ; migrés : pet, bus, ambience + tous les nouveaux modules ; fun/sky/ground/social/tug/fire/deco/openWorld/comfort/rides pas migrés |
| B05 | ✅ | `save.js` ; migrés pet, deco, comfort, reset ; les autres modules gardent leur lecture (tolérante, testée) |
| B06 | 🟡 | constantes inutilisées retirées ; 37 avertissements `no-unused-vars` restent (variables locales), pas de suppression de code actif |
| C01–C05 | ✅ | eslint, `npm run bump` + test du tampon, 11 scénarios, tests save / économie |
| D01 | 🟡 | mesures : ~440 appels de dessin au parking (rendu logiciel), 3 130 maillages, `bootMs` ≈ 1,8 s ; pas de mesure sur un vrai iPad |
| D02 | 🟡 | `staticMerge.js` appliqué au terminal, au skatepark, au décor d'aéroport : −5 % d'appels de dessin seulement (l'objectif −30 % n'est pas atteint : le reste est animé) |
| D03 | 🟡 | existait déjà (PNJ simulés moins souvent au loin, `agents.js`) |
| D04 | ✅ | taille d'ombre selon le niveau, pas d'ombres au-dessus de 600 m |
| D05 | ⏭ | temps de chargement mesuré, pas amélioré |
| D06 | ✅ | `renderer.info.memory` stable après 5 cycles de panneaux / avions |
| E01 | 🟡 | manifeste, icônes, service worker vérifiés (cache rempli) ; coupure réseau réelle et iPad non testés |
| E02, E03, E07 | ✅ | cibles ≥ 48 px mesurées en tablette ; zones sûres déjà là ; pause auto en veille |
| E04, E05, E06 | 🟡 | inclinaison, manette, vibration testées avec de fausses données, pas sur appareil |
| F01, F02, F04, F06 | ✅ | voix en file d'attente, texte 3 tailles (contraste WCAG non mesuré), « Je suis perdu », limite de temps |
| F03, F05 | ✅ | couleurs pour tous, aide en cartes « Montre-moi » |
| G01 | ✅ | planeur Plume, ascendances, vario, mission ; `npm run test:fleet` |
| G02, G03 | ✅ | formation (3 parcours) ; le fantôme de la course existait déjà |
| G04 | ✅ | arc-en-ciel, bannière, treuillage ; show / zoo / ballons / secours existaient déjà |
| G05 | 🟡 | éclairs, manche à air, balisage de brouillard existaient déjà ; rien d'ajouté |
| G06 | 🟡 | phase 102 : pistes de 340 m sur l'Ile aux Palmiers et l'Ile des Manèges (îles aplaties, `_flattenIsland`), cadeau 1×/jour au poser ; pas d'aide à l'atterrissage sur île ; amerrissage de l'hydravion : éclaboussures + cadeau du jour (phase 107, non testé à l'écran) ; scénarios navigateur non relancés (panneau caché) |
| G07, G08, G09, G10 | ✅ | rejeu, balade, copilote vivant, livraison (sans lien avec le tracteur) |
| H01 | ✅ | 6 modules satellites + projecteurs de nuit |
| H02, H03 | ✅ | astuces du chien + trésor quotidien (le chien ne monte pas dans le bus) ; 3 véhicules |
| H04 | ✅ | métiers à la journée |
| H05 | 🟡 | phase 103 : la boutique du terminal vend un vrai souvenir (2 appuis, objet du hangar) ; tapis à bagages et café existaient déjà ; jumelles ajoutées (phase 104, aux 2 vitres côté piste, vue zoomée qui balaie, +2 🪙/jour ; rendu non vu à l'écran, panneau caché) ; clients assis au café ajoutés (phase 105) |
| H06, H07, H08, H09 | ✅/🟡 | cache-cache hebdomadaire ; Halloween + Noël (pas d'anniversaire, pas de neige) ; dormir ; photo de groupe |
| I01 | ✅ | `KID_AIRCRAFT` 350 → 300 |
| I02, I03, I04, I06, I07 | ✅ | 30 niveaux, album unifié, coffre en série de 7 jours, code d'avion, fichier de sauvegarde |
| I05 | 🟡 | phase 106 : 33 autocollants (+8) ; peinture par zones et placement au doigt pas faits |
| J01, J02, J05 | ✅ | audit statique, 3 volumes + ducking, 6 klaxons ; équilibre à l'oreille non vérifié |
| J03 | 🟡 | pan stéréo du grondement de l'avion de ligne seulement |
| J04 | ✅ | thèmes hall / skatepark / îles / nuit |
| K01 | 🟡 | cumulus visibles pour tous les avions (pas de nuages volumétriques) |
| K02 | 🟡 | vagues + reflets ; pas de sillage ni d'écume |
| K03 | ⏭ | système de particules unifié : pas fait (gain invisible, risque de régression) |
| K04, K05, K07 | ✅ | fumée des pneus + secousse, couchers de soleil et étoiles, écran titre vivant |
| K06 | 🟡 | allures variées (101) + les PNJ à l'arrêt tournent le corps vers le joueur à moins de 6 m (105, non vu à l'écran) ; transitions de clips pas faites |
| M01–M03 | ✅ | README court + `docs/HISTORIQUE.md`, `docs/MODULES.md` généré, anciens plans archivés |

Bug trouvé et corrigé en route : le menu pause ne figeait pas l'avion en vol.
