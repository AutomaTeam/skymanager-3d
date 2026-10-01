# Modeles 3D externes

Tous recuperes via [poly.pizza](https://poly.pizza), format glTF binaire.

| Fichier | Modele | Auteur | Licence | Usage |
|---|---|---|---|---|
| `character.glb` | Animated Human | Quaternius | CC0 (domaine public) | PNJ, avatar joueur/hotesse (buildTechnician) |
| `truck.glb` | Pickup Truck | Quaternius | CC0 (domaine public) | Vehicule de piste |
| `cargo_crates.glb` | Cargo Depot A | Kay Lousberg | CC0 (domaine public) | Palettes de fret decoratives |
| `suitcase.glb` | Simple Suitcase | Don Carson | CC-BY (attribution requise) | Bagages sur chariot |
| `gpu.glb` | Generator | KolosStudios | CC-BY (attribution requise) | Groupe electrogene au sol (GPU) |

CC0 : aucune attribution legalement requise. CC-BY (suitcase.glb, gpu.glb) :
credit "Simple Suitcase by Don Carson" et "Generator by KolosStudios" a
conserver si le projet est redistribue publiquement.

## Choix ecartes

- **Avion jouable** : reste en geometrie procedurale (`buildAircraft()` dans
  `js/renderer3d.js`). Aucun modele gratuit trouve n'a de gouvernes
  (ailerons/volets/spoilers/gouverne de profondeur) separees et animables
  individuellement -- necessaire pour `flightPhysics.js` et le diagnostic
  mecanicien. Un remplacement casserait ces systemes.
- **Hangars, tour de controle, terminal, bureau d'exploitation** : restent
  procedureaux. Aucun modele gratuit a l'echelle reelle (hangar ~90 m) n'a
  ete trouve ; un modele plus petit etire donnerait un rendu deforme. Le
  terminal a en plus une ouverture alignee au pixel pres sur le portail de
  navigation des PNJ (`TERM.doorX0/doorX1` dans `buildAirport()`) et la
  passerelle mobile suit la porte de l'avion image par image -- ces
  elements resteraient de toute facon procedureaux meme avec un bon modele
  de terminal, pour ne pas casser ces mecaniques.

## Vague 1 (etape 1 du plan graphisme) — Kenney, licence CC0

Tous ces packs sont de **Kenney** (www.kenney.nl), licence **CC0 1.0** (domaine public, credit facultatif) ;
le `License.txt` d'origine est conserve dans chaque dossier. Seuls les fichiers `.glb` (et la texture
`Textures/colormap.png` quand elle est referencee) ont ete gardes.

| Dossier | Pack (source) | Modeles |
|---|---|---|
| `vehicles/kenney-car-kit/` | [Car Kit](https://kenney.nl/assets/car-kit) | 50 |
| `city/kenney-commercial/` | [City Kit (Commercial)](https://kenney.nl/assets/city-kit-commercial) | 41 |
| `city/kenney-suburban/` | [City Kit (Suburban)](https://kenney.nl/assets/city-kit-suburban) | 40 |
| `city/kenney-roads/` | [City Kit (Roads)](https://kenney.nl/assets/city-kit-roads) | 95 |
| `city/kenney-industrial/` | [City Kit (Industrial)](https://kenney.nl/assets/city-kit-industrial) | 37 |
| `nature/kenney-nature-kit/` | [Nature Kit](https://kenney.nl/assets/nature-kit) | 329 |
| `interior/kenney-furniture-kit/` | [Furniture Kit](https://kenney.nl/assets/furniture-kit) | 140 |

L'inventaire complet (dimensions, triangles, taille) est dans `INDEX.json`, regenere par `node tools/indexModels.mjs`.

## Vague 2 — poly.pizza (licence **CC BY 3.0** : attribution obligatoire)

| Fichier | Auteur | Licence | Source |
|---|---|---|---|
| `vehicles/polypizza/airliner-poly-by-google.glb` (« Airplane ») | Poly by Google | CC BY 3.0 | https://poly.pizza/m/8ciDd9k8wha |
| `vehicles/polypizza/helicopter-jeremy.glb` (« Helicopter ») | Jeremy | CC BY 3.0 | https://poly.pizza/m/eb7b31pjGtQ |

### Vehicules d'aeroport (poly.pizza)

| Fichier | Auteur | Licence | Source |
|---|---|---|---|
| `vehicles/polypizza/forklift-kolos.glb` (« Forklift ») | KolosStudios | CC BY 3.0 | https://poly.pizza/m/DTQBuenKJY |
| `vehicles/polypizza/fuel-truck-kolos.glb` (« Truck Tank ») | KolosStudios | CC BY 3.0 | https://poly.pizza/m/64ayx6pW3O |
