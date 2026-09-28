# Armoire Lettres

Police de capitales au feutre de L'Armoire à Cuillères (logo, affiches 2013-2019, enseigne), reconstruite depuis les visuels de la boutique. Les affiches, le logo et « HORAIRES ESTIVAUX » sont des rendus d'une même police numérique : chaque lettre présente y est vectorisée depuis sa meilleure occurrence (recalée sur l'affiche de février, rééchantillonnée ~4 à 7 × puis tracée avec potrace). Les glyphes absents sont recomposés à partir de traits découpés dans ces lettres réelles.

- `assets/fonts/armoire-lettres.woff2` (web) et `armoire-lettres.ttf` — famille « Armoire Lettres », Regular.
- `tools/font/specimen.png`, `tools/font/comparaison.png` (source au-dessus, police en dessous).
- `tools/font/_work/` : bitmaps intermédiaires, planches de contrôle, `kerning.fea` (non publié).

Reproduire (Python 3.11 + numpy, scipy, Pillow, opencv-python-headless, scikit-image, fontTools, brotli, potracer) :

```
python tools/font/extract.py    # sources -> _work/glyphs/*.png + glyphs.json (~1 min)
python tools/font/build.py      # potrace + cu2qu + fontTools -> ttf, woff2, README
python tools/font/specimen.py   # specimen.png, comparaison.png, test Chrome (_work/chrome.png)
```

## Emploi en CSS

```css
@font-face {
  font-family: "Armoire Lettres";
  src: url("/assets/fonts/armoire-lettres.woff2") format("woff2"),
       url("/assets/fonts/armoire-lettres.ttf") format("truetype");
  font-weight: 400; font-style: normal; font-display: swap;
}
.titre { font-family: "Armoire Lettres", sans-serif; font-synthesis: none;
         line-height: 1.1; letter-spacing: 0.01em; }
```

- Hauteur de capitale : **0,70 em** (`font-size = hauteur de capitale voulue / 0,7`). Les lettres varient de 0,61 em (E, T) à 0,76 em (O, R), comme l'original ; chiffres ≈ 0,56 em.
- Interlignage : `line-height: 1.1` pour les titres (1.15–1.2 sur plusieurs lignes avec accents circonflexes et Q/J/virgules) ; valeur `normal` = 1,2.
- Approche : l'approche d'origine est serrée (celle des affiches). `letter-spacing: 0` à `0.02em` en titre, `0.04em` sous 20 px. Pour imiter le logo (lettres qui se touchent) : `-0.03em`.
- Crénage : table GPOS (840 paires optiques : AV, AT, LT, L', TA, VA, LV, PA, T., V,…), active par défaut.
- Minuscules tapées = capitales, sauf « à » (le à à une panse des affiches). Éviter `text-transform: uppercase` (il changerait « à » en « À »).

## Métriques

UPM 1000 ; capitale 700 ; ascendante 950 / descendante −250 (hhea = typo, USE_TYPO_METRICS) ; win 950/250 ; plus haut point 902 (« Ù »), plus bas -145 (« ( », « ) ») : rien n'est rogné. Espace mot 219 (mesuré sur les affiches). 87 glyphes, 20306 points au total. Épaisseur de trait (2 × distance au bord le long du squelette) : 57–82 u pour les lettres sources, les recompositions ramenées dans 61–75 u ; I et L gardent leur fût gras d'origine (≈ 92–96 u).

## Sources

- **logo** : `osint/site/_logo_cover_crop.png` — logo blanc sur menthe (bandeau Facebook 2018), lettres ≈ 170 px
- **février** : `osint/site/brand/2016_11_Sans-titre-8.jpg` — « EN FEVRIER à L'ARMOIRE à CUILLERES », lettres ≈ 123 px
- **mars** : `osint/site/brand/2018_03_Sans-titre-14-1.jpg` — « EN MARS à L'ARMOIRE à CUILLERES » (même rendu que février)
- **brocante** : `osint/site/affiches/2018_09_brocante-1-e1536222251251.jpg` — « BROCANTE DE LIVRES », lettres ≈ 115 px
- **estivaux** : `osint/site/affiches/2013_12_j.jpg` — « HORAIRES ESTIVAUX », lettres ≈ 98 px, rendu plus gras
- **panneau** : `osint/insta/2026-09-22_DdmdbaDgHQz-6.jpg` — panneau de la devanture, vinyle condensé à 72 %
- Références de forme (lettres de 23 à 31 px, non tracées) : `osint/site/brand/2016_10_MENU.jpg` et `2016_10_MENU-A-IMPRIMER-PAGE-2.jpg` (G, P, J, W, K, parenthèses, trait d'union), `osint/site/affiches/2013_12_FFF.jpg` (J, Q), `2018_05_vacancs-e1525381191955.jpg` (Q, J, points, « 22 »). « SPEED BOOKING » (`2016_11_Speed-booking.jpg`) est composé dans une autre police (lettres toutes de même hauteur, dessin différent) : écarté. Les lignes du haut du panneau (« DORÉS ET / NOTRE CHOCOLAT / SÉLECTIONNÉ ») sont dans une capitale linéale étroite différente : écartées.

## Glyphe par glyphe

Vectorisés depuis une source (25) :

| glyphe | nom | source (fichier : voir légende) — mot | trait (u) |
|---|---|---|---|
| ' | quotesingle | février + mars, « L'ARMOIRE » | 70.0 |
| , | comma | panneau, « DONC, » (vinyle condensé à 72 %, redressé) | 49.5 |
| . | period | panneau, « MAISON. » (vinyle condensé à 72 %, redressé) | 114.8 |
| A a | A | logo, « ARM » (contact avec le O réparé par février) | 62.0 |
| B b | B | brocante, « BROCANTE » | 74.5 |
| C c | C | logo, « CUILL » | 69.0 |
| D d | D | brocante, « DE » | 71.2 |
| E e | E | logo, « OIRE » + « ERES » (moyenne des deux) | 64.4 |
| F f | F | février, « FEVRIER » | 78.3 |
| H h | H | estivaux, « HORAIRES » (graisse -12 u, rendu plus gras) | 58.8 |
| I i | I | logo, « OIRE » + « CUILL » (sommets réparés par février) | 96.0 |
| L l | L | logo, « CUILL » (moyenne des deux L) | 92.0 |
| M m | M | logo, « ARM » | 70.8 |
| N n | N | février + mars, « EN » | 73.2 |
| O o | O | logo, « OIRE » | 66.0 |
| R r | R | logo, « ARM » + « ERES » (moyenne) | 64.3 |
| S s | S | logo, « ERES » | 57.9 |
| T t | T | brocante, « BROCANTE » | 82.0 |
| U u | U | logo, « CUILL » | 68.0 |
| V v | V | février, « FEVRIER » | 74.7 |
| X x | X | estivaux, « ESTIVAUX » (graisse -12 u) | 59.1 |
| À | Agrave | logo, « À CUILL » (A étroit à sommet arrondi, propre au À du logo) | 60.0 |
| È è | Egrave | logo, « ÈRES » (E propre au È ; bout de l'accent caché par le pied du À, complété par l'accent du À) | 61.2 |
| à | agrave | février + mars, « à » à une panse (4 occurrences) | 64.0 |
| ’ | quoteright | logo, apostrophe de « L’ARM » | 49.2 |

Recomposés (58) :

| glyphe | nom | recomposé à partir de… | trait (u) |
|---|---|---|---|
| ! | exclam | I de février raccourci + point (panneau) | 88.3 |
| " | quotedbl | deux apostrophes droites de février | 70.0 |
| # | numbersign | fûts du H inclinés + traits de la barre du T | 65.2 |
| % | percent | deux petits O du logo + barre oblique (graisse +21 u) | 60.0 |
| & | ampersand | U du logo tassé et penché + petit O + jambe du R (graisse +4 u) | 59.9 |
| ( | parenleft | fûts du H mis bout à bout et courbés | 65.0 |
| ) | parenright | miroir de la parenthèse ouvrante | 65.6 |
| + | plus | deux traits tirés de la barre du T (graisse -1 u) | 76.0 |
| - | hyphen | deux bouts de la barre du T (brocante) | 70.0 |
| / | slash | bras droit du V (février) prolongé par son propre sommet retourné (graisse -3 u) | 75.9 |
| 0 | zero | O du logo resserré (80 × 86 %) (graisse +5 u) | 60.7 |
| 1 | one | fût droit du H (estivaux) + drapeau = accent du À retourné | 62.0 |
| 2 | two | haut du S du logo en miroir + bras du V (février) + pied du L (logo) (graisse +5 u) | 60.2 |
| 3 | three | deux panses basses du S du logo, la haute retournée (graisse +1 u) | 60.0 |
| 4 | four | fût droit du H + bras du V + trait tiré de la barre du T | 63.9 |
| 5 | five | haut du E (fût + bras) + panse basse du S (logo) (graisse +1 u) | 60.0 |
| 6 | six | C du logo + panse basse du S (logo) | 64.6 |
| 7 | seven | barre du T (brocante) + bras droit du V retourné | 68.0 |
| 8 | eight | S du logo et son miroir croisés (sans terminaisons) | 67.9 |
| 9 | nine | le 6 tourné de 180 degrés | 64.0 |
| : | colon | deux points du panneau | 114.8 |
| ; | semicolon | point + virgule du panneau | 50.7 |
| ? | question | haut du S en miroir + bas de fût du H + point (graisse +5 u) | 61.1 |
| @ | at | tirets (barre du T) enroulés en anneau + panse du à | 67.9 |
| G g | G | C du logo + bras médian du E (logo, retourné) + sommet du fût droit du U (logo) | 65.1 |
| J j | J | U du logo : fût droit et boucle, fût gauche raccourci et coiffé de son propre sommet | 62.0 |
| K k | K | fût gauche du H (estivaux), bras droit du V (février) incliné, jambe du R (logo) | 66.8 |
| P p | P | R du logo sans sa jambe (fût + panse) | 67.2 |
| Q q | Q | O du logo + queue : sommet du bras gauche du V (février) et pied de la jambe du R (logo) | 64.3 |
| W w | W | deux V de février resserrés à 74 %, sommet central = pointe du V retournée | 70.7 |
| Y y | Y | moitié haute du X (estivaux) + bas du fût du R (logo) (graisse +2 u) | 59.1 |
| Z z | Z | barre du T (brocante) + bras droit du V (février) incliné + pied du L (logo) (graisse -4 u) | 76.0 |
| « | guillemotleft | chevrons faits des accents du À (aigu + grave) (graisse +8 u) | 59.6 |
| · | periodcentered | point du panneau remonté | 114.8 |
| » | guillemotright | miroir de « (graisse +8 u) | 59.5 |
| Â â | Acircumflex | A du logo + circonflexe fait des accents du À (graisse +1 u) | 60.0 |
| Ä ä | Adieresis | A du logo + tréma (points du panneau) | 62.0 |
| Æ æ | AE | A du logo + E du logo partageant le fût | 68.0 |
| Ç ç | Ccedilla | C du logo + cédille (virgule du panneau réduite) | 68.7 |
| É é | Eacute | E du È (logo) + accent du À en miroir | 62.4 |
| Ê ê | Ecircumflex | E du È (logo) + circonflexe (graisse +1 u) | 60.0 |
| Ë ë | Edieresis | E du È (logo) + tréma | 62.0 |
| Î î | Icircumflex | I + circonflexe | 92.8 |
| Ï ï | Idieresis | I + tréma | 96.0 |
| Ô ô | Ocircumflex | O du logo + circonflexe | 64.3 |
| Ö ö | Odieresis | O du logo + tréma | 66.0 |
| Ù ù | Ugrave | U du logo + accent du À | 68.0 |
| Û û | Ucircumflex | U du logo + circonflexe | 65.9 |
| Ü ü | Udieresis | U du logo + tréma | 68.0 |
| Ÿ ÿ | Ydieresis | Y recomposé + tréma (graisse +2 u) | 59.1 |
| Œ œ | OE | O du logo + E du logo partageant le fût | 64.8 |
| – | endash | deux bouts de la barre du T (brocante) (graisse -3 u) | 76.0 |
| — | emdash | deux traits d'union longs (barre du T) raccordés (graisse -3 u) | 76.0 |
| ‘ | quoteleft | apostrophe du logo tournée de 180 degrés | 49.2 |
| “ | quotedblleft | deux apostrophes du logo tournées | 49.5 |
| ” | quotedblright | deux apostrophes du logo | 50.6 |
| … | ellipsis | trois points du panneau | 114.8 |
| € | Euro | C du logo + deux traits tirés de la barre du T | 62.0 |

Espace, espace insécable et espace fine insécable (U+202F, 0,55 espace) : sans dessin.

## Défauts connus

- H et X viennent de « HORAIRES ESTIVAUX » (jaune sur blanc, chroma JPEG sous-échantillonnée, rendu gras) : amincis de 12 u, ils sont un peu moins nets que les lettres du logo.
- Les glyphes recomposés (G J K P Q W Y Z, chiffres, ponctuation, & @ # %) sont des reconstructions plausibles guidées par des échantillons de 25-30 px, pas des copies des glyphes d'origine ; & et 3 sont les plus libres.
- Seuls À et È existent en capitale accentuée dans les sources (logo) ; ils sont repris tels quels : le À garde son A étroit à sommet arrondi, plus petit que les autres capitales (comme dans le logo), le È son E abaissé. É Ê Ë reprennent le E du È ; Â Ä, Î Ï, Ô Ö, Ù Û Ü, Ÿ utilisent la lettre courante.
- L'approche du logo est plus serrée que celle de la police (lettres jointives) : la police suit l'approche des affiches.
- Chiffres à ≈ 0,8 de la capitale d'après les « 22 » de l'affiche de 2018 (seul chiffre attesté).
- Police non hintée (lissage gasp) : prévue pour l'affichage, rendu doux sous 14 px.
- Crénage calculé automatiquement (enveloppes convexes) sans relecture paire par paire.
- Aux points où les lettres du logo se touchaient (A-O, R-M, I-R, I-S), le contour est complété par le rendu de l'affiche de février (même glyphe, résolution 1,36 × moindre).
