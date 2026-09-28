# Vectorisation des éléments de marque

Le logo et les dessins de L'Armoire à Cuillères sont **vectorisés depuis leurs fichiers d'origine**, jamais
redessinés « à la manière de ». Les seules parties inventées sont celles que le cadre ou une superposition
cache dans les sources (feuilles, filet d'écailles, une partie du râtelier) ; elles sont listées plus bas.

## Reconstruire

```
python tools/vector/build_all.py          # tout, ~6 min
python tools/vector/build_all.py --vite   # réutilise la séparation du râtelier (_work/rack_masks.npz)
```

Dépendances : Python 3.11, numpy, scipy, Pillow, opencv-python-headless, scikit-image, potracer (`import
potrace`, port Python de potrace). Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`) sert aux
rendus de contrôle (SVG → PNG comparé à la source).

Chaîne commune (`vec.py`) : bitmap agrandi 2 à 4 fois (bicubique), seuil à mi-hauteur (seuil adaptatif pour
les hachures du râtelier), potrace (alphamax 1, opttolerance 0,2), puis **compaction** : fusion des Béziers
consécutifs et, courbe par courbe, remplacement par un polygone quand il est plus court à écrire, à écart
maximal borné (0,25 à 0,55 px source selon l'élément et l'épaisseur du trait) et à aire conservée (sinon
les petites cellules des hachures rétrécissent et le dessin s'assombrit). Chemins en coordonnées relatives,
une décimale ; séparateurs au plus court (`1.5.5` = 1.5 puis .5).

Sorties : `assets/brand/*.svg`, `js/ac-brand.js` (généré par `build_js.py`, ne pas éditer), données
intermédiaires `_work/data/*.json`, images de contrôle dans `_work/`.

## 1. Logo — `logo.py`

- **Source** : `osint/site/_logo_cover_crop.png` (1008×604, lettres blanches, cuillère au trait noir remplie
  de blanc, fond menthe #67E8CC). Recoupé à l'œil avec `osint/site/brand/2018_07_Logo2.png` (teal) et la
  version noire de la carte 2026.
- **Lettrage** : « blancheur » = (luminance − menthe) / (blanc − menthe), agrandie 4×, seuil 0,5. Les lettres
  qui se touchent dans le dessin (A/O, R/I, R/R, M/R, M/E, A/È, U/E, I/S) sont séparées par neuf courtes
  lignes de coupe tracées à la main le long de leur contour naturel (`CUTS`), puis chaque lettre est tracée
  seule : 19 `<path>` dans l'ordre de lecture, `l-L1 l-apos l-A1 l-R1 l-M l-O l-I1 l-R2 l-E1 l-A2 (À) l-C l-U
  l-I2 l-L2 l-L3 l-E2 (È) l-R3 l-E3 l-S`. Pour À et È, l'accent seul et la lettre sans accent sont aussi
  fournis (`accent`, `base`).
- **Cuillère** : c'est le même dessin que la grande cuillère (et que la cuillère n° 2 du râtelier). La
  transformation affine est estimée par corrélation (ECC, 0,989 ; échelle 0,627 ; rotation nulle) entre
  l'encre de la grande cuillère et celle du logo, puis les chemins de la grande cuillère sont reportés dans
  le logo. `<g id="cuillere">` : `c-fond` (blanc) sous `c-trait` (noir #1A1919).
- **Fichiers** : `logo.svg` (lettres en `currentColor`), `logo-noir.svg`, `logo-blanc.svg`,
  `logo-teal.svg` (#6AB8C6).
- **Contrôles** : rendu Chrome contre la source, écart moyen < 1/255, 0,2 % de pixels franchement
  différents ; recoupement avec le logo teal 2018 (`2018_07_Logo2.png`) après simple recalage affine :
  corrélation 0,999, IoU du lettrage 0,981 (`_work/logo_vs_logo2.png`) — mêmes lettres, mêmes positions,
  mêmes déformations.

## 2. Grande cuillère — `cuillere.py`, `skel.py`

- **Source** : `osint/site/brand/2020_04_cuillere_grand.png` (570×1089, traits noirs sur transparent ; une
  tache parasite hors de la cuillère est écartée).
- **Traits** : encre = alpha × (1 − luminance), agrandie 4×. **Silhouette** : alpha, rentrée d'1 px pour
  rester sous le trait. Repère : pixels de la source recadrés (173×951).
- **Ordre de tracé** (`strokes`) : squelette (skimage `skeletonize`) de l'encre agrandie 3×, converti en
  graphe ; ergots élagués, jonctions voisines fusionnées ; aux jonctions, les branches sont appariées par
  continuité de direction pour former des traits continus ; lissage, Douglas-Peucker (1,4 px). Traits triés
  de haut en bas (ornement du manche d'abord, cuilleron et éventail à la fin), chacun commençant par son
  point le plus haut. `maskWidth` (7) : largeur d'un trait-masque qui, suivant les polylignes, couvre
  99,6 % des vrais traits.

## 3. Râtelier — `cuilleres.py`

- **Source** : `osint/site/brand/2013_11_Cuilleres-copie.png` (1813×1300, dix cuillères au trait gris-noir
  #373837).
- **Seuil adaptatif** : renforcement du contraste local pondéré par la densité d'encre, pour que les cellules
  gris clair des hachures (cuillères 3, 8, 9, 10) restent ouvertes ; sans effet sur les traits isolés.
- **Séparation** des cuillères qui se chevauchent (cuillerons 1/2, 3/4, 5/6, 6/7/8, sommets 8/9/10) :
  squelette → graphe → arêtes attribuées par zones exclusives, par des « lassos » (courbes-guides relevées
  sur des zooms quadrillés, suivies par plus court chemin sur le squelette) pour les contours de cuilleron
  qui traversent un chevauchement, par continuité le long des chaînes, puis quelques épingles et exclusions.
  Les parties cachées sont complétées par des raccords (`RACCORDS`) : épaule droite du cuilleron 6 (sous la
  bande sombre de la 7), bas du flanc droit de la 7 (sous les hachures de la 8), bord gauche du sommet de la
  9 (sous l'anneau du médaillon de la 8).
- **Cuillère n° 2** = la grande cuillère (même dessin : corrélation 0,985, échelle 1,027, rotation nulle) :
  ses chemins sont reportés (`fromCuillere`), un seul tracé partagé.
- **Repère publié** : 1 unité = 2 px de la source (viewBox 620,5 × 487,5) ; `hook` = point le plus haut de
  la silhouette (haut du manche).
- **SVG** : `<g id="cuillere-1">` … `cuillere-10`, de gauche à droite, chaque groupe = une cuillère
  complète (raccords compris). Dans la composition, la silhouette blanche de chaque cuillère est découpée
  pour ne pas masquer les traits réels des précédentes (les deux contours restent visibles dans les
  chevauchements, comme dans le dessin) mais recouvre leurs raccords (qui repassent donc « dessous »). Dans le
  JS, `fill` est la silhouette entière (pour accrocher les cuillères une à une).
- **Contrôle** : rendu Chrome contre la source, IoU 1× ≈ 0,93, 0,1 % de pixels franchement différents.

## 4. Tasses — `tasses.py`

- **Source** : `osint/site/brand/2018_09_CouvFacebook2.jpg` (3546×1313, CMJN → RVB), dessin au trait blanc
  sur menthe, x 930–2270. La bande claire du haut du bandeau (21 px) laisse voir le dessin : il y est lu avec
  son propre fond de référence.
- **Traits** : blancheur agrandie 2×, seuil 0,5. **Silhouette** (`fill`, classe `t-fond`) : intérieur des
  contours ; les « jours » (fond visible dans les anses et entre les deux piles) sont évidés à partir de
  graines (`JOURS`). Repère publié : 1 unité = 2 px de la source.
- **Vérification** : le dessin de l'affiche `2013_12_FFF.jpg` (teal, plus petit), cherché à plusieurs
  échelles dans le rendu du vecteur, est retrouvé sur la pile de droite (corrélation normalisée 0,80,
  `_work/tasses_vs_fff.png`). Rendu Chrome contre la source : IoU 1× 0,90.

## 5. Feuilles — `feuilles_seg.py`, `feuilles.py`, `feuilles_out.py`

- **Source** : `osint/site/affiches/2013_11_Mallo_TestSite.jpg` (3508×2481, CMJN), quart inférieur droit ;
  formes vérifiées sur la vitrophanie actuelle et `2013_11_Mallo_FondDecran-1.jpg`.
- **Segmentation** : chaque pixel prend la couleur de palette la plus proche (appartenance douce, agrandie
  2×) ; au-delà d'une distance de 70, c'est la photo de la tasse, qui disparaît. La feuille turquoise et le
  filet d'écailles ont la même couleur : séparés par position. Les blancs ne sont gardés que s'ils sont
  entourés d'une feuille (le bord blanc de la tasse, vu à travers le filet, est rejeté) : nervures et tirets
  deviennent des tracés séparés.
- **Empilement** (du fond vers l'avant) : lame fuchsia (c) < filet d'écailles (d) < plume prune (b) < feuille
  turquoise (a) < grande feuille aqua (f) < rameau marine (e).
- **Complétion** : les bords réels visibles (contre la photo ou une feuille située derrière) sont gardés ;
  chaque tronçon caché ou coupé par le cadre est remplacé par une spline passant par des points des bords
  réels (continuité de tangente) et par des points relevés à la main (`GAPS`) ; la partie inventée n'est
  acceptée que sous une feuille de devant ou hors cadre. Contrôle : la composition complétée, vue dans le
  cadre d'origine, est identique à l'affiche à 99,99 % des pixels.
- **Couleurs de la marque** appliquées : turquoise #3FC7EE, prune #6C2383, fuchsia #E64AA8, marine #13365E,
  aqua #A6E6DC, écailles #5FC8EE, détails #FFFFFF.
- **Repère normalisé** de chaque feuille : base (pivot) en bas au centre (x = 0), pointe en haut, hauteur
  100, deux décimales (≈ 0,1–0,2 px de l'affiche). `place` ramène ce repère dans la composition.
- **`feuilles.svg`** : la composition complétée (`<g id="feuille-…" data-pivot="x y">`, cadre d'origine en
  commentaire et dans `AC.BRAND.feuilles.frame`) + un `<symbol id="feuille-…-seule">` par feuille normalisée.

### Ce qui est inventé (feuilles)

| Feuille | Visible dans l'affiche | Complété |
|---|---|---|
| (a) turquoise | pointe, 6 nervures jusqu'au cadre | base hors cadre (x ≈ 3866) ; 4 nervures prolongées jusqu'à la base, en convergeant comme à la pointe |
| (b) plume prune | pointe et moitié gauche | partie sous la turquoise, l'aqua et le rameau, base en pointe hors cadre ; 49 tirets recopiés (formes d'origine) sur un semis régulier |
| (c) lame fuchsia | pointe et haut de la lame, un peu à travers les mailles | toute la moitié basse (sous la plume, le filet, l'aqua), base arrondie hors cadre |
| (d) filet d'écailles | pointe et 2/3 de la bande | extrémité sous la plume et l'aqua (≈ 90 px), mailles recopiées sur le réseau d'origine, fil de bordure |
| (e) rameau marine | 5 feuilles, tige | 2 feuilles coupées par le cadre complétées, tige prolongée jusqu'à la coupe (pivot), 2 feuilles ajoutées |
| (f) grande feuille aqua | pointe, nervures, moitié gauche | bas et droite hors cadre, base ; 3 nervures prolongées, 10 tirets recopiés |

## Diagnostics — `diag/`

`zoom.py` (zoom quadrillé d'une source), `ascii.py` (encre du râtelier en ASCII), `feuille_zoom.py` (contour
final d'une feuille sur l'affiche), `feuilles_bords.py` (bords réels / cachés), `tasses_regions.py` (régions
fermées des tasses, pour les graines des jours). Lancer depuis `tools/vector/`.
