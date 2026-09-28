/* ==========================================================================
   L'Armoire à Cuillères — LA source : la boutique, les horaires, la carte, le brunch
   Tout ce que l'appli affiche vient d'ici (la carte statique d'index.html et le JSON-LD
   en sont une copie pour Google et les IA : les garder d'accord).
   Sources : carte 2026 (story « Carte »), ardoise du 17 sept. 2026, posts brunch du
   24 sept. 2026, fiche Google, site larmoireacuilleres.com. Voir osint/00-SYNTHESE.md.
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});

  AC.SHOP = {
    nom: "L'Armoire à Cuillères",
    accroche: 'Bar à chocolat · pâtisseries maison · brunch du dimanche',
    adresse: '11 rue des Chaussetiers',
    cp: '63000',
    ville: 'Clermont-Ferrand',
    repere: 'dans le vieux Clermont, à deux pas de la cathédrale',
    tel: '07 83 41 21 45',
    telIntl: '+33783412145',
    email: 'hello@larmoireacuilleres.com',
    instagram: 'https://www.instagram.com/larmoireacuilleres/',
    facebook: 'https://www.facebook.com/larmoireacuilleres',
    site: 'https://www.larmoireacuilleres.com/',
    geo: { lat: 45.778325, lng: 3.0841183 },
    maps: 'https://www.google.com/maps/place/L%27Armoire+%C3%A0+cuill%C3%A8res/@45.778325,3.0841183,17z/data=!4m6!3m5!1s0x47f71bdd60ae5327:0x1307a65303df46c3!8m2!3d45.778325!4d3.0841183',
    itineraire: 'https://www.google.com/maps/dir/?api=1&destination=L%27Armoire%20%C3%A0%20cuill%C3%A8res%2C%2011%20rue%20des%20Chaussetiers%2C%2063000%20Clermont-Ferrand',
    avis: { note: 4.6, nombre: 602, source: 'Google', url: 'https://www.google.com/maps/place/L%27Armoire+%C3%A0+cuill%C3%A8res/@45.778325,3.0841183,17z/data=!4m8!3m7!1s0x47f71bdd60ae5327:0x1307a65303df46c3!8m2!3d45.778325!4d3.0841183!9m1!1b1' },
    depuis: 2013,
  };

  /* ---------- Horaires (heure de Paris). [ouverture, fermeture] en minutes ; null = fermé.
     À confirmer : Google et la bio Instagram (sept. 2026) disent mar.–sam. 13h–19h, dim. 11h–19h ;
     la vitrine et le site disent 14h–18h30. */
  const h = (a, b) => [a * 60, b * 60];
  AC.HOURS = {
    semaine: [
      null, // dimanche → remplacé ci-dessous (Date.getDay : 0 = dimanche)
      null, // lundi
      h(13, 19), h(13, 19), h(13, 19), h(13, 19), h(13, 19),
    ],
    fermetures: [], // congés : [{ du: '2026-12-24', au: '2026-12-26', motif: 'Noël' }]
    brunch: { jour: 0, debut: 11.5 * 60, services: ['11h30', '12h30', '13h30'] },
  };
  AC.HOURS.semaine[0] = h(11, 19);
  AC.JOURS = AC.en ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] : ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  /* ---------- La carte (2026) ---------- */
  // ton : 0 = blanc … 1 = le plus noir (sert au nuancier et aux couleurs de secours)
  AC.CRUS = [
    { id: 'blanc-ivoire', nom: 'Blanc Ivoire', pc: 33, famille: 'blanc', notes: 'Chocolat blanc peu sucré, aux notes de gâteau au beurre & de vanille.', couleur: '#EBD9BA' },
    { id: 'kewane', nom: 'Kewane', pc: 34, famille: 'lait', notes: 'Crémeux & réglissé.', couleur: '#B88A62' },
    { id: 'caramelia', nom: 'Caramélia', pc: 35, famille: 'lait', notes: 'Douceur sucrée & ronde.', couleur: '#B67E4F' },
    { id: 'elianza-lait', nom: 'Elianza Lait', pc: 35, famille: 'lait', notes: 'Crème glacée, caramel au beurre, cacao grillé & miel de châtaignier.', couleur: '#A87550' },
    { id: 'vanuari-lait', nom: 'Vanuari Lait', pc: 39, famille: 'lait', notes: 'Lait entier aux notes sucrées.', couleur: '#9A6A47' },
    { id: 'z-caramel', nom: 'Z-Caramel', pc: 43, famille: 'lait', notes: 'Texture craquante de caramel.', couleur: '#A26637' },
    { id: 'elianza-noir', nom: 'Elianza Noir', pc: 55, famille: 'noir', notes: 'Cacao grillé, réglisse, anis étoilé & vanille.', couleur: '#6A4027' },
    { id: 'vanuari-noir', nom: 'Vanuari Noir', pc: 63, famille: 'noir', notes: 'Texture fluide et équilibrée, douceur du miel, fruits rouges & poivre.', couleur: '#5A3421' },
    { id: 'z-cafe', nom: 'Z-Café', pc: 70, famille: 'noir', notes: 'Véritables grains de café broyés avec le cacao.', couleur: '#4B2C1B' },
    { id: 'mokaya-noir', nom: 'Mokaya Noir', pc: 75, famille: 'noir', bio: true, notes: 'Fruits exotiques, miel, amandes & noisettes grillées, cacao fin grillé et poivré, vanille.', couleur: '#432717' },
    { id: 'arcango-noir', nom: 'Arcango Noir', pc: 85, famille: 'noir', notes: 'Cacao grillé aux légères notes de châtaignes.', couleur: '#372014' },
    { id: 'noir-infini', nom: 'Noir Infini', pc: 99, famille: 'noir', notes: 'La saveur la plus intense.', couleur: '#29160D' },
  ];
  AC.CRU_PRIX = 5.2;

  // Rubriques de la carte, dans l'ordre de la carte imprimée. `sert` : ce qui se pose sur la table du goûter
  // (id de boisson d'AC.Boissons ou de gâteau d'AC.Gateaux) ; kind : 'boisson' | 'gateau' | 'info'
  AC.CARTE = [
    {
      id: 'classiques', titre: 'Les classiques', items: [
        { id: 'soyeux', nom: 'Chocolat Soyeux', prix: 4.7, desc: 'Doux & non sucré.', kind: 'boisson' },
        { id: 'intense', nom: 'Chocolat Intense', prix: 5.2, desc: 'Épais & corsé, cannelle et miel.', kind: 'boisson' },
      ],
    },
    {
      id: 'gourmets', titre: 'Chocolats gourmets', items: [
        { id: 'praline', nom: 'Praliné noisette', prix: 5.9, kind: 'boisson' },
        { id: 'guimauve', nom: 'Guimauve', prix: 5.9, kind: 'boisson' },
        { id: 'coco', nom: 'Coco façon Bounty', prix: 5.9, kind: 'boisson' },
      ],
    },
    {
      id: 'glaces', titre: 'Chocolats glacés', items: [
        { id: 'frappe', nom: 'Chocolat frappé simple', prix: 5.5, froid: true, kind: 'boisson' },
        { id: 'mocha-glace', nom: 'Mocha glacé', prix: 5.8, froid: true, kind: 'boisson' },
      ],
    },
    {
      id: 'cafes', titre: 'Cafés', items: [
        { id: 'espresso', nom: 'Espresso', prix: 1.6, kind: 'boisson' },
        { id: 'lungo', nom: 'Lungo', prix: 1.8, kind: 'boisson' },
        { id: 'cappuccino', nom: 'Cappuccino', prix: 3.9, kind: 'boisson' },
        { id: 'latte', nom: 'Café latte', prix: 4.5, kind: 'boisson' },
        { id: 'viennois', nom: 'Café viennois', prix: 2.5, kind: 'boisson' },
        { id: 'mocha', nom: 'Mocha', prix: 4.5, desc: 'Espresso, chocolat & lait.', kind: 'boisson' },
      ],
    },
    {
      id: 'specialites', titre: 'Spécialités', items: [
        { id: 'chai', nom: 'Chaï Latte', prix: 4.5, desc: 'Latte aux épices.', kind: 'boisson' },
        { id: 'matcha', nom: 'Matcha Latte', prix: 5.5, kind: 'boisson' },
        { id: 'matcha-fraise', nom: 'Matcha Fraise', prix: 6.0, kind: 'boisson' },
      ],
    },
    {
      id: 'thes', titre: 'Thés & infusions', prix: 3.9, items: [
        { id: 'montagne-bleue', nom: 'Montagne Bleue', desc: 'Thé noir, fraise & rhubarbe.', kind: 'boisson' },
        { id: 'blue-of-london', nom: 'Blue of London', desc: 'Thé noir du Yunnan & bergamote.', kind: 'boisson' },
        { id: 'alizes', nom: 'Thé des Alizés', desc: "Thé vert, pêche blanche & fleur d'oranger.", kind: 'boisson' },
        { id: 'fakirs', nom: 'Thé des Fakirs', desc: 'Thé vert, cardamome, gingembre & agrumes.', kind: 'boisson' },
        { id: 'merveilleux', nom: 'Thé Merveilleux', desc: 'Thé vert, amandes caramélisées & pistache.', kind: 'boisson' },
        { id: 'limoncha', nom: 'Limoncha', desc: 'Thé vert & noir aux influences japonaises, riz grillé, amandes & citron.', kind: 'boisson' },
        { id: 'mama-relax', nom: 'Mama Relax', desc: 'Infusion BIO, mélisse & lavande.', kind: 'boisson' },
        { id: 'herboriste', nom: "L'Herboriste", desc: 'Infusion BIO, curcuma, réglisse & verveine.', kind: 'boisson' },
        { id: 'paris-for-you', nom: 'Paris for You', desc: 'Thé vert, litchi, framboise & notes de rose.', kind: 'boisson' },
        { id: 'louvre-jardin', nom: 'Louvre côté Jardin', desc: 'Thé vert, pomme, prune & coing.', kind: 'boisson' },
      ],
    },
    {
      id: 'fraiches', titre: 'Boissons fraîches', items: [
        { id: 'matcha-glace', nom: 'Matcha glacé', prix: 5.5, froid: true, kind: 'boisson' },
        { id: 'soda-cola', nom: 'Sodas', prix: 4.0, desc: 'Coca-Cola, Coca-Cola Zéro, ou limonade Lorina.', kind: 'boisson' },
        { id: 'jus', nom: 'Jus de fruits', prix: 4.0, kind: 'boisson' },
        { id: 'citronnade', nom: 'Citronnade maison', prix: 4.5, kind: 'boisson' },
        { id: 'the-glace', nom: 'Thé glacé maison', prix: 4.0, desc: 'Pêche, sureau, framboise ou citron.', kind: 'boisson' },
        { id: 'sirop', nom: "Sirop à l'eau", prix: 2.0, kind: 'boisson' },
      ],
    },
    {
      id: 'gateaux', titre: 'Gâteaux', note: "Gâteaux du jour : voir sur l'ardoise", items: [
        { id: 'fondant-noir', nom: 'Fondant chocolat noir', prix: 5.5, desc: 'Pointe de sel.', kind: 'gateau' },
        { id: 'fondant-lait', nom: 'Fondant chocolat au lait', prix: 5.5, kind: 'gateau' },
        { id: 'brownie', nom: 'Brownie', prix: 5.5, kind: 'gateau' },
        { id: 'cheesecake', nom: 'Cheesecake', prix: 5.5, kind: 'gateau' },
        { id: 'cookie', nom: 'Cookie', prix: 3.9, kind: 'gateau' },
        { id: 'cake-marbre', nom: 'Cake', prix: 4.9, kind: 'gateau' },
      ],
    },
    {
      id: 'enfants', titre: 'Pour les petits bidons', items: [
        { id: 'formule-enfant', nom: 'Formule enfant', prix: 5.6, desc: 'Verre de lait spéculoos-vanille, chocolat chaud ou boisson fraîche + petite part de gâteau.', kind: 'boisson', sert: 'lait-speculoos', gateau: 'petite-part' },
      ],
    },
    {
      id: 'supplements', titre: 'Suppléments', items: [
        { id: 'arome', nom: 'Arôme', prix: 0.3, plus: true, desc: 'Vanille, caramel, spéculoos ou praliné noisette.', kind: 'info' },
        { id: 'lait-vegetal', nom: 'Lait végétal', prix: 0.5, plus: true, desc: 'Avoine, coco ou amande.', kind: 'info' },
        { id: 'chantilly', nom: 'Chantilly', prix: 0.5, plus: true, kind: 'info' },
      ],
    },
  ];

  /* L'ardoise « pâtisseries du jour » (photo du 17 septembre 2026) : en prod, l'équipe la met à jour. */
  AC.ARDOISE = {
    date: '2026-09-17',
    items: [
      { nom: 'Fondant lait caramélisé', prix: 5.5, sert: 'fondant-lait' },
      { nom: 'Fondant noir pointe de sel', prix: 5.5, sert: 'fondant-noir' },
      { nom: 'Brownie noix, noisettes', prix: 5.5, sert: 'brownie' },
      { nom: 'Cheesecake citron vert', prix: 5.5, sert: 'cheesecake' },
      { nom: 'Cookies pépites de chocolat', prix: 3.9, sert: 'cookie' },
      { nom: 'Cake marbré chocolat', prix: 4.9, sert: 'cake-marbre' },
      { nom: 'Tarte citron meringuée', prix: 5.2, sert: 'tarte-citron' },
    ],
    signature: 'Fait-maison par Mallo, Amina',
  };

  /* ---------- Le brunch du dimanche (posts du 24 septembre 2026) ---------- */
  AC.BRUNCH = {
    prix: 23,
    formule: [
      { t: 'Un plat salé au choix', d: 'accompagné de sa salade fraîche' },
      { t: 'Une boisson chaude au choix', d: 'café, thé ou chocolat chaud' },
      { t: 'Un jus de pomme', d: '' },
      { t: 'Notre délicieux cookie', d: 'la petite touche sucrée signée L’Armoire' },
    ],
    buffet: ['Beurre', 'Confitures', 'Miel', 'Fromage blanc', 'Muesli', 'Pâtes à tartiner', 'Pain', 'Fruits frais', 'Petites gourmandises…'],
    note: 'Et surtout… un buffet à volonté pour composer votre brunch comme vous l’aimez.',
    resa: 'Réservation au 07 83 41 21 45 : les places sont limitées, pensez à réserver !',
  };

  /* ---------- Le panneau de la devanture (texte exact) ---------- */
  AC.ICI = {
    verbes: ['poche', 'crème', 'dresse', 'blanchit', 'saupoudre', 'fouette', 'glace', 'zeste', 'enfourne', 'émulsionne', 'nappe', 'caramélise', 'chérit'],
    matiere: ['notre miel de caractère', 'notre farine soyeuse', 'notre crème onctueuse', 'nos oeufs dorés', 'et notre chocolat sélectionné'],
    fin: 'Et donc, ici on aime le fait maison.',
  };

  /* ---------- Nos producteurs (site de la boutique ; à confirmer : toujours d'actualité ?) ---------- */
  AC.PRODUCTEURS = [
    { quoi: 'Le lait bio des chocolats chauds', qui: 'GAEC de Montjeudi', ou: 'Olby' },
    { quoi: 'La farine', qui: 'Moulin Gribory', ou: 'Châtelus' },
    { quoi: 'Le café', qui: 'Chazal, torréfacteur', ou: 'Issoire' },
    { quoi: 'Le pain des tartines', qui: 'Pain Paillasse', ou: 'Clermont-Ferrand' },
    { quoi: 'Les fraises', qui: "Le Verger d'Ornon", ou: 'Lezoux' },
    { quoi: 'Le miel et le confit de noisettes', qui: 'Miellerie de Grattepaille', ou: 'Saint-Préjet-Armandon' },
    { quoi: 'Les tisanes bio', qui: 'Happy Plantes', ou: 'Volvic' },
  ];

  /* ---------- Questions fréquentes (reprises dans le JSON-LD) ---------- */
  AC.FAQ = [
    { q: 'Peut-on réserver pour le goûter ?', r: "Non : pour le goûter, on vient comme on est, sans réservation. L'Armoire est toute petite ; en semaine ou en début d'après-midi, on trouve plus facilement une place." },
    { q: 'Comment réserver le brunch du dimanche ?', r: 'Par téléphone ou SMS au 07 83 41 21 45. Le brunch est servi tous les dimanches à partir de 11h30, 23 € par personne ; les places sont limitées.' },
    { q: 'Le chocolat chaud est-il servi bouillant ?', r: "Non : il est préparé à la minute et servi autour de 65 °C, la température où l'on sent le mieux ses arômes." },
    { q: 'Y a-t-il des laits végétaux ?', r: 'Oui : avoine, coco ou amande, pour 0,50 € de plus. Arômes (vanille, caramel, spéculoos, praliné noisette) : 0,30 €.' },
    { q: 'Peut-on commander un gâteau entier ?', r: "Oui, au moins 24 h à l'avance, par e-mail à hello@larmoireacuilleres.com." },
    { q: 'Tout est-il fait maison ?', r: "Oui : les pâtisseries sont préparées chaque jour dans notre labo, rue des Chaussetiers, avec du lait bio, du miel et de la farine de producteurs d'Auvergne." },
  ];

  /* ---------- Les posts Instagram de la pile de « Nous » (images dans assets/img/insta/) ---------- */
  AC.INSTA = [
    { img: 'fondants', legende: 'Lait caramel ou noir pointe de sel ? Le dilemme du jour.', date: '2026-09-14', url: 'https://www.instagram.com/p/DdRa3TPgLWt/' },
    { img: 'table', legende: "Pas besoin d'une occasion pour manger une pâtisserie. L'occasion, c'est toi.", date: '2026-09-22', url: 'https://www.instagram.com/p/DdmdbaDgHQz/' },
    { img: 'brunch', legende: 'Un peu de nous, beaucoup de gourmandise.', date: '2026-09-20', url: 'https://www.instagram.com/p/DdhMfs2gEH7/' },
    { img: 'tarte', legende: 'Une petite sélection de ce qui vous attend à L’Armoire à Cuillères.', date: '2026-09-17', url: 'https://www.instagram.com/p/DdZnMjMANoJ/' },
    { img: 'rue', legende: 'La terrasse, rue des Chaussetiers.', date: '2026-09-02', url: 'https://www.instagram.com/p/Dcy8rLVAQOU/' },
    { img: 'cheesecake', legende: 'Le choix le plus difficile de la journée…', date: '2026-09-26', url: 'https://www.instagram.com/reel/DdwokaAgRdv/' },
  ];

  /* ---------- Une sélection de 7 avis Google, dans la carte de la note (onglet Nous) ----------
     EXEMPLES : textes provisoires de la maquette (la fiche Google ne montre pas ses avis sans compte, et on ne
     recopie pas ceux des clients sans eux) : à remplacer par 7 vrais avis choisis sur la fiche (prénom + initiale,
     note, mois, texte), puis passer `exemples` à false. Tant qu'il est vrai, la carte le dit en petit. */
  AC.AVIS = {
    exemples: true,
    selection: [
      { nom: 'Prénom N.', note: 5, mois: '2026-09', texte: 'Le chocolat chaud le plus onctueux de Clermont : on choisit son cru, il arrive fumant avec une part de fondant. Une adresse à garder.' },
      { nom: 'Prénom N.', note: 5, mois: '2026-09', texte: 'Brunch du dimanche très généreux : la tarte salée et sa salade, le buffet à volonté, et le cookie pour finir. On a déjà réservé le prochain.' },
      { nom: 'Prénom N.', note: 5, mois: '2026-08', texte: 'Le cheesecake au citron vert est une merveille, léger et bien acidulé. Tout est fait maison, et ça se sent.' },
      { nom: 'Prénom N.', note: 5, mois: '2026-08', texte: 'Un tout petit salon, chaleureux comme un cocon : de vieilles tasses, des livres, et une équipe aux petits soins.' },
      { nom: 'Prénom N.', note: 4, mois: '2026-07', texte: 'La salle se remplit vite le samedi, mieux vaut venir en début d’après-midi. Mais quelle carte de thés et de chocolats !' },
      { nom: 'Prénom N.', note: 5, mois: '2026-06', texte: 'Accueil adorable : on nous a fait goûter deux crus avant de choisir. Coup de cœur pour le Vanuari noir aux fruits rouges.' },
      { nom: 'Prénom N.', note: 5, mois: '2026-05', texte: 'Les pâtisseries changent chaque jour sur l’ardoise : brownie, tarte citron meringuée… Impossible de ne pas revenir.' },
    ],
  };

  /* ---------- Carte fidélité ---------- */
  AC.FIDELITE = {
    objectif: 10, // 10 cuillères accrochées = 1 chocolat chaud offert (règle de la maquette, à valider)
    cadeau: 'un chocolat chaud grand cru offert',
  };

  /* ---------- Utilitaires horaires ---------- */
  // (hors navigateur, pour les outils de tools/ : pas de dictionnaire, le français)
  const t = (fr, v) => (AC.t ? AC.t(fr, v) : String(fr).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
  /** 13h, 11h30 ; en anglais 1pm, 11:30am */
  const fmtH = (m) => {
    const hh = Math.floor(m / 60), mm = m % 60;
    if (AC.en && AC.heureEn) return AC.heureEn(hh, mm);
    return hh + 'h' + (mm ? String(mm).padStart(2, '0') : '');
  };
  AC.fmtH = fmtH;

  /** Le statut maintenant (heure de Paris) : { ouvert, jusqua, prochain: {jour, heure, dansJours} , texte } */
  AC.statut = function (now = AC.parisNow()) {
    // démonstration : ?ouvert dans l'adresse montre la boutique ouverte, quel que soit le jour
    try { if (new URLSearchParams(location.search).has('ouvert')) return { ouvert: true, jusqua: 19 * 60, texte: t('Ouvert · jusqu’à {h}', { h: fmtH(19 * 60) }) }; } catch (e) { /* hors navigateur */ }
    const jour = now.getDay(), min = now.getHours() * 60 + now.getMinutes();
    const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const ferme = (d) => AC.HOURS.fermetures.some((f) => iso(d) >= f.du && iso(d) <= f.au);
    const plage = !ferme(now) && AC.HOURS.semaine[jour];
    if (plage && min >= plage[0] && min < plage[1]) {
      const bientot = plage[1] - min <= 30;
      return { ouvert: true, bientot, jusqua: plage[1], texte: t(bientot ? 'Ferme bientôt · {h}' : 'Ouvert · jusqu’à {h}', { h: fmtH(plage[1]) }) };
    }
    // prochaine ouverture
    for (let k = 0; k < 14; k++) {
      const d = new Date(now.getTime() + k * 86400000);
      const p = !ferme(d) && AC.HOURS.semaine[d.getDay()];
      if (!p) continue;
      if (k === 0 && min >= p[0]) continue;
      const h = fmtH(p[0]);
      const quand = k === 0 ? t('à {h}', { h }) : k === 1 ? t('demain à {h}', { h }) : t('{jour} à {h}', { jour: AC.JOURS[d.getDay()], h });
      return { ouvert: false, prochain: { jour: d.getDay(), heure: p[0], dansJours: k }, quand, texte: t('Fermé · ouvre {quand}', { quand }) };
    }
    return { ouvert: false, texte: t('Fermé') };
  };

  /** Prix « 5,20 € » ; plus : « + 0,30 € » (en anglais « €5.20 », « + €0.30 ») */
  AC.prix = (n, plus) => (plus ? '+ ' : '') + (AC.en ? '€' + n.toFixed(2) : n.toFixed(2).replace('.', ',') + ' €');

  /* ---------- En anglais : les textes de la carte, de l'ardoise, du brunch… passent par le dictionnaire
     (js/ac-en.js ; le texte français est la clé). Les noms propres (les crus, les thés) restent tels quels
     s'ils n'y sont pas. ---------- */
  if (AC.en && AC.t) {
    const tr = (o, ...ks) => ks.forEach((k) => { if (typeof o[k] === 'string') o[k] = AC.t(o[k]); });
    tr(AC.SHOP, 'accroche', 'repere');
    AC.CRUS.forEach((c) => tr(c, 'notes'));
    AC.CARTE.forEach((r) => { tr(r, 'titre', 'note'); r.items.forEach((it) => tr(it, 'nom', 'desc')); });
    AC.ARDOISE.items.forEach((it) => tr(it, 'nom'));
    tr(AC.ARDOISE, 'signature');
    AC.BRUNCH.formule.forEach((x) => tr(x, 't', 'd'));
    AC.BRUNCH.buffet = AC.BRUNCH.buffet.map((x) => AC.t(x));
    tr(AC.BRUNCH, 'note', 'resa');
    AC.PRODUCTEURS.forEach((x) => tr(x, 'quoi'));
    AC.FAQ.forEach((x) => tr(x, 'q', 'r'));
    AC.INSTA.forEach((x) => tr(x, 'legende'));
    AC.AVIS.selection.forEach((x) => tr(x, 'nom', 'texte'));
    tr(AC.FIDELITE, 'cadeau');
  }
})();
