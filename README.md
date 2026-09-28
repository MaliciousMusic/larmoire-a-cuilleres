# L'Armoire à Cuillères — maquette du site-appli

Le site du bar à chocolat de la rue des Chaussetiers, pensé comme une petite appli de téléphone : un écran, des onglets en bas, pas de long défilement.
HTML/CSS/JS sans framework ni build : ça s'ouvre tel quel et s'héberge n'importe où.

Direction artistique : **un salon de thé d'antan dans une toute petite boutique**. Tout part de leur identité réelle :
- **la devanture** (bois chocolat mouluré, enseigne peinte, corniche de branches séchées et de nichoirs, panneau « ICI ON… », enseigne drapeau anthracite aux cuillères, terrasse de chaises pliantes pastel) redessinée en SVG animé, comme celle du Café Laitue ;
- **la typo du logo**, reconstruite en police à partir de leurs affiches de 2013 à 2019 (aucune police du commerce ne correspondait) ;
- **les feuilles colorées** de leur identité 2013 (turquoise, prune, fuchsia, marine, aqua), aujourd'hui en vitrophanie, vectorisées depuis le fichier d'origine et posées en détail partout ;
- **leurs dessins au trait** : la cuillère ciselée du logo, le râtelier de dix cuillères de l'enseigne drapeau, les tasses empilées ;
- **le salon de thé** : chaises bistrot en bois courbé, table menthe, vaisselle ancienne dépareillée (faïence à fleurs bleues, fleurs brun-rose à liseré doré), lin, rotin.

Couleurs : chocolat #3B2723 (la devanture), papier #F7F0E4, teal #2E767E (leur carte 2026), menthe #A1D4D5 (leurs tables), et les feuilles. Polices : Armoire Lettres (reconstruite), Playfair Display (le vinyle « HORAIRES » de la vitrine), Poppins (leur carte 2026). Toutes hébergées sur le site.

## Lancer en local

```bash
python tools/dev-server.py
```

Puis http://localhost:5190 (serveur sans cache). Un double-clic sur `index.html` marche aussi.

| Adresse | Effet |
|---|---|
| `?intro` | rejoue l'ouverture (elle ne passe qu'une fois par visite) · `?nointro` la saute (captures) |
| `?soir` · `?jour` | force l'éclairage du soir ou du jour sur la devanture (sinon : l'heure de Paris et le coucher du soleil) |
| `?ouvert` | montre la boutique ouverte quel que soit le jour (démo un lundi) |
| `lab/facade.html` (`?fige`, `?nuit`, `?ferme`) | la devanture seule (rejouer, jour/soir, ouvert/fermé, un oiseau, toquer à la porte) |
| `lab/marque.html` | le logo, la cuillère (tracé à la plume), le râtelier des dix cuillères, les tasses, les feuilles |
| `lab/vaisselle.html` (`?s=scene,crus,servies,assiettes…`, `?bench=N`) | la vaisselle ancienne, la table, le lin, le rotin, les 46 boissons |
| `lab/gateaux.html` (`?id=`, `?seeds=`, `?zoom=`) | les gâteaux sur leurs assiettes |
| `lab/salon.html` (`?fige`, `?touch=armoire`) | l'intérieur du salon |

## Ce qu'il y a dedans

| Onglet | Contenu |
|---|---|
| **Ouverture** | Leur logo en filigrane, deux gros bouquets de leurs feuilles dans les coins de l'écran, « Entrer » (le geste qui autorise le son) ou « Entrer sans le son ». La cuillère se dessine à la plume, les lettres éclosent une à une sur une petite valse musette à la boîte à musique (un air à nous, en sol : une note par lettre, la basse et le « pom-pa-pa » à chaque mesure), accord, la clochette de la porte tinte, et la devanture se construit. Son coupé : elle part toute seule. |
| **Accueil** | Pas de barre du haut : tout est sur la devanture. La devanture vivante : les lettres de l'enseigne, les vitrines qui s'allument, les nichoirs qui tombent sur la corniche, l'enseigne drapeau qui se balance, les chaises et les fleurs qui arrivent, et **la porte qui s'entrouvre** à la fin : la lumière du salon passe par l'entrebâillement (on voit la chaise bistrot, le comptoir, le parquet), déborde en halo et s'étale sur les pavés, avec quelques poussières dorées ; de temps en temps un courant d'air la pousse. Au toucher, la clochette tinte, la porte s'ouvre en grand et on entre dans le salon (l'onglet Nous). La pancarte « OUVERT / FERMÉ » pend derrière la vitre de la porte et suit le vantail. Les horaires sont sur la vitrine de gauche, « HORAIRES » en lettres dorées, le jour même en doré : le reflet qui passe sur les vitres (et seulement sur les vitres) allume les lettres une à une, puis une étincelle ; on touche la vitrine : la caméra s'approche dans la scène, le vinyle se lit en grand avec l'état du jour en bas, et un toucher ramène dans la rue (« Les horaires », sous le logo, fait de même ; plus de feuille par-dessus). Les nichoirs vivent : une mésange bleue, une charbonnière et un moineau en sortent (la tête d'abord, puis sur le bâton), s'envolent, parfois se posent et chantent, reviennent se poser et rentrent dans le trou ; on touche un nichoir pour faire sortir (ou rentrer) son oiseau ; la nuit, ils dorment. La terrasse est devant les vitrines (la chaise passe devant les horaires) et garde le voile du soir. Le soir (heure de Paris), la rue bleuit, le réverbère s'allume et la porte éclaire le trottoir ; fermé, les vitrines s'assombrissent (la porte reste éclairée : on peut toujours entrer voir le salon ; les vinyles collés sur les vitres restent nets). On touche aussi : le panneau « ICI » (les mots s'allument, puis on entre voir Mallo jouer la comptine, dans l'onglet Nous), l'ardoise, les nichoirs, l'enseigne, la tasse de la terrasse. Au premier plan, la table pliante menthe et sa tasse de chocolat qui fume, en grand (la profondeur). Au pied de la vitrine de droite : des tulipes dans un seau en zinc, des marguerites dans un panier, un buis en boule. Le bas de la devanture se fond dans le papier : les pavés se dissolvent en un motif très léger qui mène au logo. À l'ouverture, on voit toujours toute la devanture (sur un écran court, un peu plus de rue sur les côtés) et, dessous, le logo avec sa phrase. Dessous : leur logo avec la cuillère, centré sur la pointe de la cuillère et pas sur les lettres (comme à l'ouverture ; la police des lettres peintes reste sur l'enseigne) ; les accès rapides en quatre soucoupes anciennes (l'icône peinte au milieu) ; les horaires du jour sur une enseigne de bois chocolat suspendue à sa ficelle (un voyant ouvert/fermé ; elle se balance, puis on s'approche de la vitrine) ; l'ardoise des pâtisseries, un vrai tableau à la craie dans son cadre, avec ses craies sur le rebord et un petit dessin à la craie par gâteau (chaque ligne se sert sur la table de la carte). |
| **La carte** | L'écran est coupé en deux : en haut, toujours visible, la table du goûter vue de dessus, comme leurs photos (bois peint menthe, chemin de lin, set en rotin, assiette ancienne, tasse sur sa soucoupe, vapeur ; l'assiette et la tasse se placent au-dessus du bandeau), « La carte » dans son coin, l'addition dans le coin opposé (« Total : » et le prix, qui saute quand il change) et leur phrase en bandeau au bas, toujours sur une ligne (la taille suit la largeur) ; en dessous, seule la carte défile. Le nuancier des **douze grands crus** (du Blanc Ivoire 33 % au Noir Infini 99 %), en carrés de chocolat moulés (biseaux, cuillère en relief), trois pages de quatre qu'on feuillette au doigt ou avec le pager (‹ Doux · Équilibrés · Intenses ›) : on choisit, la tasse se remplit, la fiche donne les notes. Toute la carte 2026, avec leurs descriptions et leurs prix ; chaque ligne se sert sur la table (gâteau sur l'assiette, boisson dans son contenant). |
| **Brunch** | L'affiche du dimanche (23 €, dès 11h30), puis **la tablée du dimanche** : une table pour deux vue de dessus, dressée plat par plat à la première visite (pour chacun une part de tarte rustique et sa salade composée, une boisson chaude, un jus de pomme, un cookie ; au milieu, sur le chemin de lin, le buffet : pain, beurre, confitures, miel, fromage blanc, muesli, pâte à tartiner, fruits frais, petites gourmandises). On touche un plat : il se présente et sa ligne s'allume dans la formule ou le buffet (et l'inverse). Puis la formule, le buffet à volonté, et la réservation : dimanche, heure, couverts, prénom, un mot → le SMS est prêt, il part de l'appli SMS du client (ou « Appeler »). |
| **Fidélité** | Un râtelier à cuillères en bois, la plaque au prénom en laiton vissée sur le fronton : à chaque passage l'équipe y accroche une de leurs dix cuillères anciennes, avec son code à 6 chiffres (même système que Café Laitue et Kookies : 5 essais puis une minute de pause, 5 cuillères au plus par passage). Dix cuillères = un chocolat grand cru offert, validé par le même code. Verso : le QR du numéro de carte. |
| **Sur ordinateur** | La vitrine : l'appli n'y démarre pas, elle est montrée dans un téléphone (un iPhone, barre d'état à l'heure de Paris, îlot, barre d'accueil), où elle tourne pour de vrai (elle-même, dans un cadre `?cadre` : largeur, hauteur, son, fidélité, tout marche comme sur un téléphone) ; à côté, leur logo, leur phrase, l'adresse, les horaires, le brunch, et le QR code pour l'ouvrir sur son téléphone. Le téléphone et sa présentation se réduisent si la fenêtre est basse. Le mode est choisi avant le premier affichage (grand écran et souris) ; une tablette garde l'appli en colonne. |
| **Nous** | En haut, un fin bandeau en bois chocolat, comme la barre des onglets (« Nous » et leur phrase, en blanc), puis le salon jusqu'en bas de l'écran. **La comptine du fait-maison** : au premier plan, en grand, le comptoir qui déborde des deux côtés (plan de travail en hêtre, étagère de la matière première, four encastré) et Mallo, vue de dos, mince (chignon traversé d'une baguette-cuillère en bois, chouchou bleu, marinière, tablier croisé). Elle joue leur panneau « ICI ON… » geste par geste : elle poche des rosaces, crème le beurre dans la bassine en cuivre, pose une fraise, blanchit les jaunes, saupoudre, fouette, glace, zeste, enfourne une plaque de choux (le four s'allume), émulsionne une ganache, nappe de caramel, caramélise au chalumeau, puis chérit le miel, la farine, la crème, les œufs et le chocolat (ils sautillent sur l'étagère) ; à la fin, un regard par-dessus l'épaule. Elle le dit dans une bulle de dialogue, sous elle, comme dans un jeu : son nom en étiquette, une page à la fois, lettre à lettre, le petit ▼ quand la page est pleine, la dernière ligne dans leur police. Le cadrage suit l'écran (le haut de la bulle tombe juste sous le four). Une fois par visite ; « Revoir Mallo » ou toucher Mallo la rejoue. Puis trois volets qui se déplient en douceur : l'histoire, les producteurs, et « Un gâteau entier ? » (la commande sur mesure, 24 h à l'avance) ; la pile de leurs posts Instagram (on jette celle du dessus), la note Google, l'adresse, les horaires, les contacts, la FAQ ; en bas, l'interrupteur « Les petits bruits de la boutique » (le son, qui n'a plus sa place dans une barre du haut). |

```
index.html              tout le contenu (lisible par Google et les IA sans JS) + JSON-LD + icônes au trait (sprite SVG)
css/armoire.css         l'identité : papier, bois chocolat, teal, menthe, ardoise, panneau ICI, vitre des horaires
css/fonts.css           polices hébergées (généré par tools/fetch-fonts.py)
js/ac-core.js           hasard seedé, bruit, maths, couleurs, SVG, stockage, sons WebAudio (clochette, boîte à musique, porcelaine, mésange…),
                        l'ambiance (les animations décoratives, pilotées : voir « Performances »), le chargement à la demande
js/ac-data.js           LA source : la boutique, les horaires, la carte, l'ardoise, le brunch, la FAQ, les producteurs
js/ac-brand.js          le logo, la cuillère, les dix cuillères, les tasses et les feuilles, vectorisés (tools/vector/)
js/ac-facade.js         la devanture (SVG dessiné en JS)
js/ac-salon.js          l'intérieur du salon (SVG dessiné en JS) — chargé à la demande
js/ac-conte.js          la comptine : le comptoir, Mallo et ses gestes (bras articulés), la bulle de dialogue, le cadrage — à la demande
js/ac-atelier.js        l'atelier de la table : un Worker qui charge les trois moteurs ci-dessous et calcule hors de la page
js/ac-rendu.js          la lumière commune des objets de la table (calcul pixel par pixel) — dans l'atelier
js/ac-vaisselle.js      vaisselle ancienne, table, lin, rotin, et toutes les boissons vues de dessus — dans l'atelier
js/ac-gateaux.js        les gâteaux maison vus de dessus — dans l'atelier
js/ac-table.js          la table du goûter : composition, service, vapeur (demande ses images à l'atelier)
js/ac-carte.js          le nuancier des crus, les rubriques, le service
js/ac-splash.js         l'ouverture, le logo de la barre du haut
js/ac-brunch.js         la demande de réservation par SMS, le branchement de la tablée
js/ac-tablee.js         la tablée du dimanche (SVG) : la table dressée, les plats qui se présentent — à la demande
js/ac-fidelite.js       le râtelier à cuillères, le code équipe, le QR
js/ac-nous.js           l'accueil (ardoise, nuancier), le salon et sa comptine, la pile Instagram, les bouquets de feuilles
js/ac-app.js            onglets, feuilles, son, Ouvert/Fermé à l'heure de Paris (pancarte de la porte, vitrine des horaires)
tools/build-carte.mjs   carte HTML statique + FAQ + JSON-LD + llms.txt, depuis ac-data.js
tools/font/             reconstruction de la police du logo depuis leurs affiches
tools/vector/           vectorisation du logo, des cuillères, des tasses et des feuilles
tools/render-assets.mjs icônes d'appli et image de partage (Chrome sans tête, serveur local lancé)
tools/capture.mjs       capture d'écran d'une page locale (contrôles visuels)
tools/rendu/            outils de mesure et de capture des moteurs de rendu (vaisselle, gâteaux)
tools/set-pin.mjs       changer le code équipe
tools/set-domain.mjs    mettre le vrai domaine partout
tools/bump.mjs          estampiller CSS et JS avant chaque publication (cache de GitHub Pages)
osint/                  le dossier d'enquête (non publié) : osint/00-SYNTHESE.md
```

Après une modification de la carte, des horaires ou de la FAQ : `node tools/build-carte.mjs`.
Icônes (la cuillère pliée en cercle, tools/render/icone.html) et image de partage (serveur local lancé) : `node tools/render-assets.mjs`.
Police du logo : `tools/font/` (`extract.py`, `build.py`, `specimen.py`) ; éléments de marque : `python tools/vector/build_all.py`.

**Ce qui est dessiné, et comment.** La devanture et le salon sont des SVG dessinés en JavaScript. La table de la carte est calculée pixel par pixel dans le navigateur, avec une lumière commune (`js/ac-rendu.js`, une fenêtre en haut à gauche) : cartes de hauteur, matières, reflets, ombres portées. Vaisselle dépareillée à décors « terre de fer » générés (fleurs bleues, brun-rose à liseré doré), 46 boissons (les 12 crus dans la même tasse fleurie, latte art, glaçons), 9 gâteaux. Tout est déterministe (même graine, même image) et mis en cache ; la table se précalcule en temps mort.
Le logo, la cuillère, le râtelier, les tasses et les feuilles sont **vectorisés depuis leurs fichiers** (98 % de concordance avec le logo, 99,99 % pour les feuilles) ; la police du logo est reconstruite depuis leurs affiches 2013-2019 (25 lettres vectorisées, les autres recomposées dans le même trait : `tools/font/README.md`).

**Performances.** Mesurées dans Chrome sans tête, écran de téléphone, processeur ralenti ×4 (un téléphone moyen) :
- **Les animations décoratives sans fin** (rameaux, vapeur, poussières, reflet des vitres, feuilles, lumières du salon) passent par `AC.ambiance` (`js/ac-core.js`) : on les avance nous-mêmes, 12 images/s pour les mouvements lents (invisible à l'œil), 24 pour le reflet qui passe, et elles s'arrêtent net quand leur scène ne se voit pas (autre onglet, devanture sortie de l'écran, page en arrière-plan). Au repos, le fil principal passe de ~100 % à 2-7 % sur la carte, la fidélité ou l'accueil défilé, ~40 % sur la devanture animée.
- **Les onglets quittés** ne se dessinent plus (`content-visibility: hidden` une fois leur transition finie) mais gardent leur état et leur défilement.
- **La table de la carte se calcule dans un Worker** (`js/ac-atelier.js`, OffscreenCanvas → ImageBitmap) : la page ne se fige plus (avant, jusqu'à 1,2 s d'un bloc) ; sans Worker (file://, vieux navigateur) ou s'il échoue, les mêmes moteurs se chargent dans la page.
- **Au démarrage, seul l'accueil** : la carte, le brunch et la fidélité s'initialisent à leur première ouverture ou dans un temps mort ; le salon, la comptine, la tablée et le QR code se chargent à la demande (préchargés en temps mort). 11 scripts au lieu de 18.
- Mallo a son propre calque SVG par-dessus le salon (le salon n'est plus repeint à chaque image de la comptine) ; le reflet des vitres est piloté en JS (plus de SMIL) ; la texture d'enduit est gardée d'une visite à l'autre.
- Essayé puis écarté : précharger toutes les polices (la devanture se construisait alors dans la même tâche que le démarrage : plus lent, mesuré sur 5 passages).

**Code équipe de la maquette : 631319** (63, le Puy-de-Dôme, puis 13h → 19h). Pour le changer : `node tools/set-pin.mjs 482157`.

**L'icône d'appli** (écran d'accueil, onglet du navigateur) : leur cuillère ciselée pliée en cercle, comme une bague-cuillère, au trait noir sur fond blanc (`tools/render/cuillere-anneau.js` échantillonne leur dessin et le pose sur l'anneau ; `tools/render/icone.html`).

## À confirmer avec la boutique

- **Horaires** : quatre versions publiques. Google et la bio Instagram (sept. 2026) : mar.–sam. 13h–19h, dim. 11h–19h ; la vitrine et le site : 14h–18h30 (samedi 10h). La maquette suit Google.
- **Le brunch** : leur site affiche encore « Dimanche 6 septembre (dernier brunch avant fermeture définitive) », alors qu'Instagram relance le brunch le 24 septembre avec une nouvelle formule (23 €, buffet à volonté). Heures de service (11h30 · 12h30 · 13h30 dans la maquette).
- **Carte fidélité** : la règle (10 passages = un chocolat offert) est une proposition.
- **L'histoire** : reprise de leur site (Mallo, la Pologne, le Canada, « douillet comme un duvet d'oiseau ») ; prénoms à citer (Mallo, Amina) ; « depuis 2013 ».
- **Producteurs** : ceux de leur site (lait du GAEC de Montjeudi, farine du Moulin Gribory, café Chazal…) : toujours d'actualité ?
- **Le logo** : vectorisé depuis leurs fichiers ; demander le fichier source et le nom de la police. Les fichiers des feuilles de la vitrophanie.
- **Mentions légales** : TVA, directrice de publication, hébergeur de production.
- **Photos Instagram** de la pile : les originaux HD et leur accord (certaines sont signées @agenceares).

## Passer en production

1. Hébergement statique (GitHub Pages, Netlify, Cloudflare Pages) sur **larmoireacuilleres.com** (le domaine sert aujourd'hui leur WordPress) ; `node tools/set-domain.mjs https://www.larmoireacuilleres.com` ; retirer le `noindex`.
2. **L'ardoise du jour** : un petit back-office (ou un Google Sheet publié) pour que l'équipe change les gâteaux du jour sans toucher au code.
3. **Réservations du brunch** : garder le SMS, ou un formulaire relié à un agenda (confirmation par SMS).
4. **Carte fidélité infalsifiable** : les cartes côté serveur (Supabase par exemple), tamponnage par code équipe ou scan du QR.
5. **Commandes de gâteaux entiers** (24 h à l'avance) : formulaire + paiement Stripe si souhaité.

## SEO local et référencement par les IA

En place : JSON-LD `CafeOrCoffeeShop` + `Bakery` (horaires, géo, carte complète en `Menu`), `FAQPage`, `WebSite` ; toute la carte en HTML statique ; `llms.txt` ; robots.txt ouvert aux robots IA ; géo-balises ; manifest.
Hors du site, le plus rentable : harmoniser les horaires partout (Google, Instagram, vitrine, PagesJaunes, leur site actuel), mettre le lien du site dans la bio Instagram, Apple Business Connect et Bing Places.
