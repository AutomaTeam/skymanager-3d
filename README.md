# SkyManager 3D

Jeu d'aeroport en 3D pour navigateur (Three.js, **sans build**), pense pour un enfant d'une douzaine d'annees sur PC et iPad : on repare l'avion, on accueille les passagers, on pilote (avion, helicoptere, planeur), on fait grandir son aeroport. Le mode **Arcade** est le mode par defaut ; le mode **Pilote** garde la simulation complete.

Publie sur GitHub Pages depuis `master` : http://automateam.fr/skymanager-3d/

## Lancer

```bash
python devserver.py 8123      # puis http://localhost:8123  (ou « Lancer le jeu.bat »)
```

`devserver.py` desactive le cache navigateur et est multi-thread. Parametres d'URL utiles : `?nosw` (sans service worker), `?debug` (compteur de performance), `?fuzz=1&secs=25` (test aleatoire), `?scenario=all` (scenarios de test), `?season=halloween|noel|off`.

## Installer sur l'iPad, jouer hors ligne

Ouvrir l'adresse dans Safari, **Partager > Sur l'ecran d'accueil** : le jeu s'ouvre en plein ecran, et se recharge sans reseau apres un premier chargement (manifeste + `sw.js`). Aucun build, aucun compte developpeur : Three.js et Tailwind viennent d'un CDN (mis en cache par le service worker).

## Deployer

Pousser sur `master` : GitHub Pages republie tout seul (`.nojekyll` present). Apres un changement de code, **incrementer le tampon `?v=`** (`npm run bump`) : il force les navigateurs et le cache hors ligne a recharger.

## Architecture

- `index.html` + `css/style.css` : tout l'interface ; `js/` : un module par fonction (carte complete et generee : **`docs/MODULES.md`**, `npm run modules`).
- `main.js` : classe `Game`, ordre d'initialisation, boucle gardee (`loop` / `_frame`). Les gros morceaux sont des **mixins** copies sur le prototype : `hudController.js`, `pauseMenu.js`, `hubUpdate.js` (+ `gameShared.js`). Meme principe pour `renderer3d.js` (`renderSky`, `renderLights`, `renderGround`, `renderCamera`, `renderAvatar`, `renderCabin`, `renderAircraft`) et `arcade.js` (`arcadeMap`, `arcadeChallenges`, `arcadeFun`, `arcadeFlight`, `arcadeData`). Outil : `tools/splitClass.mjs`.
- **Registre de modules** (`js/registry.js`) : `this.modules.add('monModule', new MonModule(this))` donne `update(dt)` dans la boucle gardee ; un module peut fournir `bodies()`, `goal()`, `tips()`. Une erreur dans un module est notee dans `__game.errors` et ne fige jamais le jeu.
- **Sauvegardes** : cles `localStorage` `skymanager.*` via `js/save.js` (lecture tolerante, fusion avec les valeurs par defaut, reset selectif, export / import dans un fichier).
- Donnees pures (testables sous Node) : `fleet.js`, `flightPhysics.js`, `flightAssist.js`, `airportTycoon.js`, `bodies.js`, `navigation.js`, `thermals.js`...

## Tests

```bash
npm install three@0.169.0 eslint@9 globals --no-save     # une seule commande (un --no-save efface les autres paquets)
npm test            # vol, flotte (dont le planeur), economie, donnees, terminal, montures, sauvegardes, livrees, saisons, chasse, son, tampon ?v=
npm run lint        # eslint (no-undef, no-import-assign... en erreur)
```

Navigateur : `?scenario=all` (ou `firstFlight`, `tutorial`, `allPlanes`, `allRides`, `allVehicles`, `cabin`, `panels`, `petFetch`, `nightRain`, `missions`, `glider`) renvoie `{ok, steps, errors}` dans `window.__scenarioReport` ; `?fuzz=1` envoie des touches et clics au hasard et renvoie `window.__fuzzReport`. Voir `tools/`.

## Debogage

`window.__game` expose le jeu : `.ac` (avion), `.r3d` (scene), `.nav`, `.agents`, `.arcade`, `.modules`... `__game.errors` / `__game.errorList()` listent les erreurs attrapees (module, message, nombre). `.env.setHour(22)` saute a 22 h, `.env.forceWeather()` change la meteo. Dans le Browser pane (rendu logiciel ~2 fps) : remplacer `__game.r3d.render` par une fonction vide, `requestAnimationFrame` par `()=>0` et appeler `__game.loop()` a la main (voir `tools/scenarios.js`).

## Plans et historique

- `PLAN_AMELIORATION_SONNET.md` : le plan d'amelioration en cours (avec son journal).
- `docs/HISTORIQUE.md` : toutes les phases, une section chacune (anciennement ce README).
- `docs/plans/` : anciens plans (fun enfant, graphisme, carte) avec leur statut.
- Modeles 3D et credits : `assets/models/CREDITS.md`.
