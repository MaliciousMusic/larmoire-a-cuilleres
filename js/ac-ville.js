/* ==========================================================================
   L'Armoire à Cuillères — au-dessus de la devanture : l'immeuble, le ciel, la rue vue du dessus, le plan
   On remonte depuis la devanture (on fait défiler vers le haut) :
     1) le reste de l'immeuble, dessiné comme la devanture et dans son repère (les étages continuent la fenêtre du
        premier, le même enduit, le même mur), son toit de tuiles, ses cheminées — du défilement ordinaire ;
        Un chat noir dort sur le faîtage ;
     2) derrière lui, une scène figée : le ciel (le jour, un beau soleil et des nuages qui passent ; le soir, la lune,
        des étoiles qui scintillent, des nuages, une étoile filante de temps en temps). Quand le toit descend vers le
        bas de l'écran, la caméra bascule vers le sol : la rue vue d'en haut se relève derrière notre toit — la
        devanture, sa corniche fleurie et ses nichoirs, la terrasse (tables, chaises, la tasse, l'ardoise, les
        fleurs), les pavés, les toits voisins et leurs velux (d'après OpenStreetMap) ;
     3) en continuant, on s'élève : les toits du quartier, la cathédrale, puis la carte tourne (nord en haut) et se
        fond dans le plan : les rues, les places, le tram ; une petite carte : l'adresse, l'itinéraire, le retour.
   Pendant le défilement, seuls des transform et opacity changent (le compositeur) : la vue du dessus est faite de
   couches peintes une fois, sur des toiles, chacune à sa finesse (de 50 px par mètre sur la terrasse à 0,5 pour le
   plan), qui se relaient. Les données (js/ac-ville-donnees.js, © OpenStreetMap) ne se
   chargent qu'à la première remontée.
   API : AC.ville.init() (l'accueil affiché), AC.ville.haut() (la position de la devanture, pour y revenir)
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});
  const $ = (s, r = document) => r.querySelector(s);
  const S = (tag, attrs, parent) => AC.svg(tag, attrs, parent);
  const f = (n) => Math.round(n * 10) / 10;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lisse = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;

  const HAUT = 760; // l'immeuble au-dessus du cadre de la devanture (unités du dessin, 1 ≈ 1 cm) : trois étages, le toit

  /* ======================================================================
     1) l'immeuble : les étages au-dessus de la devanture (SVG, dans le repère de la devanture : y < 0) ; au-dessus
        des toits il est transparent : c'est le ciel de la scène, derrière, qu'on y voit
     ====================================================================== */
  function immeuble() {
    const P = (AC.Facade && AC.Facade.P) || { wall: '#E4DDCB' };
    const svg = S('svg', { viewBox: `0 ${-HAUT} 400 ${HAUT + 1}`, class: 'ville-svg', 'aria-hidden': 'true', focusable: 'false' });
    svg.style.overflow = 'hidden';
    const defs = S('defs', {}, svg);
    const U = (p) => AC.uid('vi' + p);
    const lin = (stops, o = {}) => {
      const id = U('g');
      const g = S('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1, ...o }, defs);
      stops.forEach(([off, c, a]) => S('stop', { offset: off, 'stop-color': c, 'stop-opacity': a == null ? 1 : a }, g));
      return `url(#${id})`;
    };
    const rect = (p, x, y, w, h, fill, extra = {}) => S('rect', { x: f(x), y: f(y), width: f(w), height: f(h), fill, ...extra }, p);
    const path = (p, d, fill, extra = {}) => S('path', { d, fill, ...extra }, p);
    const G = (p, attrs = {}) => S('g', attrs, p);

    // le mur (le même enduit, le même dégradé que la devanture : même repère, même couleur au raccord)
    const pat = U('pl');
    const motif = S('pattern', { id: pat, width: 160, height: 160, patternUnits: 'userSpaceOnUse' }, defs);
    if (AC.Facade && AC.Facade.enduit) S('image', { href: AC.Facade.enduit(), width: 160, height: 160 }, motif);
    const mur = lin([[0, '#EAE3D2'], [0.55, P.wall], [1, '#CFC6B1']], { gradientUnits: 'userSpaceOnUse', x1: 0, y1: -300, x2: 0, y2: 480 });
    const murs = G(svg);
    // trois maisons côte à côte : la nôtre (sa corniche à -492), la voisine de gauche plus haute, celle de droite plus basse
    const MAISONS = [[-400, -12, -604, 60], [-12, 396, -492, 84], [396, 800, -446, 60]]; // [x0, x1, corniche, hauteur du toit]
    MAISONS.forEach(([x0, x1, h]) => { rect(murs, x0, h, x1 - x0, -h + 2, mur); rect(murs, x0, h, x1 - x0, -h + 2, `url(#${pat})`); });
    // les joints entre les maisons ; le pignon qui dépasse, dans l'ombre
    rect(murs, -13, -604, 2, 606, '#B9AE96', { opacity: 0.55 });
    rect(murs, 395, -492, 2, 494, '#B9AE96', { opacity: 0.55 });
    rect(murs, 396, -492, 8, 46, '#000', { opacity: 0.08 });
    // la gouttière à gauche (celle de la devanture, qui monte jusqu'au toit)
    rect(murs, 2, -492, 7, 494, '#77756F');
    rect(murs, 3, -492, 2, 494, '#9A9892', { opacity: 0.8 });
    for (let yy = -480; yy < 0; yy += 110) rect(murs, 0, yy, 11, 5, '#5F5D58');
    // les bandeaux de pierre, entre les étages
    [-96, -286].forEach((y) => { rect(murs, -400, y, 1200, 7, '#D6CDB7'); rect(murs, -400, y + 7, 1200, 1.6, '#B9AE96', { opacity: 0.6 }); });

    // les fenêtres : celle du premier (la même que la devanture, complétée au-dessus du cadre), puis deux étages
    const fenetres = G(svg);
    const vitreG = lin([[0, '#3C4750'], [0.5, '#56626B'], [1, '#2B333A']]);
    function fenetre(dx, dy, { volets = '#8C938F', lames = '#707875', garde = true, fleurs = false } = {}) {
      const up = G(fenetres, { transform: `translate(${dx} ${dy})` });
      rect(up, 132, -46, 116, 98, '#CFC6B0');
      rect(up, 138, -40, 104, 88, '#EFEAE0');
      rect(up, 143, -35, 94, 80, vitreG);
      path(up, 'M190 -35V45M143 5H237M143 -15H237M143 25H237', 'none', { stroke: '#EFEAE0', 'stroke-width': 2.2 });
      path(up, 'M150 42L178 -30L186 -30L158 42Z M196 42L214 -2L219 -2L201 42Z', '#fff', { opacity: 0.12 });
      [[98, 134], [246, 282]].forEach(([a, b]) => {
        rect(up, a, -44, b - a, 94, volets);
        const lv = [];
        for (let yy = -40; yy < 48; yy += 5.5) lv.push(`M${a + 3} ${yy}H${b - 3}`);
        path(up, lv.join(''), 'none', { stroke: lames, 'stroke-width': 1.3 });
        rect(up, a, -44, b - a, 94, 'none', { stroke: '#6A716E', 'stroke-width': 1 });
      });
      if (garde) {
        const rail = ['M136 30H244', 'M136 50H244'];
        for (let xx = 140; xx <= 240; xx += 8) rail.push(`M${xx} 30V50`);
        for (let xx = 144; xx <= 236; xx += 16) rail.push(`M${xx} 40c2 -4 6 -4 8 0c-2 4 -6 4 -8 0`);
        path(up, rail.join(''), 'none', { stroke: '#2A2522', 'stroke-width': 1.2 });
      }
      rect(up, 124, 52, 132, 5, '#C8BEA7');
      rect(up, 124, 57, 132, 2, '#A89E88');
      if (fleurs) { // une jardinière de géraniums sur l'appui
        rect(up, 146, 40, 88, 12, '#8A5A3C', { rx: 2 });
        let d = '', dr = '';
        for (let k = 0; k < 11; k++) {
          const x = 150 + k * 8, y = 36 - (k % 3) * 3;
          d += `M${x - 5} ${y + 4}a5 4 0 1 0 10 0a5 4 0 1 0 -10 0z`;
          if (k % 2 === 0) dr += `M${x - 2.5} ${y - 1}a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0z`;
        }
        path(up, d, '#5E8A45');
        path(up, dr, '#D9485A');
      }
    }
    fenetre(0, 0); // le premier (sa moitié haute : le reste est dans la devanture)
    fenetre(0, -190, { garde: false, fleurs: true });
    fenetre(0, -380, { volets: '#93988F' });
    // chez les voisins, aux étages (visibles sur un écran large)
    [-190, -380].forEach((dy, i) => fenetre(-300, dy, { volets: '#A7A08C', lames: '#8A846F', garde: i === 1 }));
    fenetre(392, -190, { volets: '#7F9A93', lames: '#65807A', garde: false });

    // la corniche, la génoise, la gouttière, le toit de tuiles canal, le faîtage : chez nous et chez les voisins
    const toits = G(svg);
    MAISONS.forEach(([x0, x1, h, hToit]) => {
      rect(toits, x0 - 6, h - hToit, x1 - x0 + 12, hToit, lin([[0, '#9C4E34'], [1, '#C4674A']])); // le toit, vu d'en bas, en fuite
      let canaux = '';
      for (let x = x0 - 4; x < x1 + 6; x += 8) canaux += `M${x} ${h - hToit + 3}V${h - 10}`;
      path(toits, canaux, 'none', { stroke: '#8A4029', 'stroke-width': 2.2, opacity: 0.55 });
      let rangs = '';
      for (let y = h - hToit + 10; y < h - 8; y += 11) rangs += `M${x0 - 6} ${y}H${x1 + 6}`;
      path(toits, rangs, 'none', { stroke: '#E08A62', 'stroke-width': 1.2, opacity: 0.45 });
      rect(toits, x0 - 8, h - hToit - 7, x1 - x0 + 16, 8, '#8E4430'); // le faîtage
      let gen = ''; // la génoise : des tuiles sous l'avant-toit
      for (let x = x0; x < x1; x += 9) gen += `M${x} ${h - 2}a4.5 4.5 0 0 1 9 0z`;
      path(toits, gen, '#B45C3F');
      rect(toits, x0 - 8, h - 12, x1 - x0 + 16, 5, '#8E959A'); // la gouttière en zinc
      rect(toits, x0 - 8, h - 12, x1 - x0 + 16, 1.6, '#C4CACD');
      rect(toits, x0, h, x1 - x0, 9, '#D6CDB7'); // la corniche
      rect(toits, x0, h + 9, x1 - x0, 2, '#A89E88', { opacity: 0.7 });
    });
    // les cheminées (sortent du toit, dépassent le faîtage), leurs pots de terre cuite, une vieille antenne
    const CHEMINEES = [[52, -540, 34, 96], [296, -530, 30, 80], [-150, -630, 30, 84], [560, -468, 26, 66]]; // [x, pied, largeur, hauteur]
    CHEMINEES.forEach(([x, y, w, h]) => {
      rect(toits, x, y - h, w, h, '#C9C0AE');
      rect(toits, x + w * 0.62, y - h, w * 0.38, h, '#A9A08E');
      rect(toits, x - 3, y - h - 6, w + 6, 7, '#8E8676');
      rect(toits, x + 5, y - h - 16, 8, 11, '#B5654A', { rx: 1.5 });
      rect(toits, x + w - 13, y - h - 13, 8, 8, '#A6593F', { rx: 1.5 });
    });
    path(toits, 'M69 -642V-700M55 -692H83M59 -682H79M63 -672H75', 'none', { stroke: '#4E4A46', 'stroke-width': 1.4 });

    // le soir : le voile de la rue (comme sur la devanture), sur les maisons seulement, et deux fenêtres allumées
    const soir = G(svg, { class: 'nuit-seul' });
    let ombre = MAISONS.map(([x0, x1, h, hToit]) => `M${x0 - 8} ${h - hToit - 7}H${x1 + 8}V2H${x0 - 8}Z`).join('');
    ombre += CHEMINEES.map(([x, y, w, h]) => `M${x - 3} ${y - h - 16}H${x + w + 3}V${y}H${x - 3}Z`).join('');
    path(soir, ombre, '#101a36', { opacity: 0.52 });
    const lueur = lin([[0, '#FFE2A6'], [1, '#F2B866']]);
    [[0, -190], [-300, -380]].forEach(([dx, dy]) => {
      const g = G(soir, { transform: `translate(${dx} ${dy})` });
      rect(g, 143, -35, 94, 80, lueur);
      path(g, 'M143 -35h26c-4 30 -2 56 6 80h-32zM237 -35h-24c5 28 4 54 -4 80h28z', '#C98A4B', { opacity: 0.55 }); // les rideaux
      path(g, 'M190 -35V45M143 5H237M143 -15H237M143 25H237', 'none', { stroke: '#EFEAE0', 'stroke-width': 2.2, opacity: 0.8 });
    });
    // le chat noir qui dort sur le faîtage, roulé en boule, la tête sur les pattes (la lune le cerne un peu) ;
    // il respire, sa queue bouge, des « z » s'envolent (sur leurs calques : voir batir)
    const chat = G(svg, { class: 'vi-chat', transform: 'translate(176 -583)' });
    const corps = G(chat, { class: 'vi-chat-corps' });
    path(corps, 'M8 0C4 -13 17 -24 33 -24C49 -24 60 -14 58 0Z', '#1C1A1F');
    path(corps, 'M9 -3C6 -14 18 -23 33 -23C47 -23 57 -15 57 -3', 'none', { stroke: '#4B4760', 'stroke-width': 1.3, opacity: 0.9 }); // (le liseré de lumière)
    path(corps, 'M-4 0C-6 -9 1 -16 10 -16C19 -16 24 -9 22 0Z', '#211E24'); // la tête, posée sur les pattes
    path(corps, 'M-1 -12L1 -22L7 -15ZM11 -16L16 -24L19 -14Z', '#211E24'); // les oreilles
    path(corps, 'M1 -13.5L2 -19L5 -15ZM12.5 -16L15.5 -21L17 -15Z', '#3A2F3A');
    path(corps, 'M3 -7.5q3 2.2 6 0M12 -7.5q3 2.2 6 0', 'none', { stroke: '#7A7488', 'stroke-width': 1, 'stroke-linecap': 'round' }); // les yeux fermés
    path(corps, 'M-3 -1.5c4 1.6 9 1.6 14 0', 'none', { stroke: '#2E2A33', 'stroke-width': 3, 'stroke-linecap': 'round' }); // les pattes
    const queue = G(chat, { class: 'vi-chat-queue' });
    path(queue, 'M57 -3C66 -2 64 5 50 5C38 5 26 4 18 2', 'none', { stroke: '#1C1A1F', 'stroke-width': 5.5, 'stroke-linecap': 'round' });
    path(queue, 'M58 -4C65 -3 64 3 54 4', 'none', { stroke: '#4B4760', 'stroke-width': 1, opacity: 0.8, 'stroke-linecap': 'round' });
    const zzz = [[6, -30, 7], [12, -40, 9], [20, -52, 11]].map(([x, y, t]) => {
      const z = G(chat, { class: 'vi-chat-z' });
      const tx = S('text', { x, y, 'font-family': "'Playfair Display', Georgia, serif", 'font-style': 'italic', 'font-size': t, fill: '#F7F0E4', opacity: 0.9 }, z);
      tx.textContent = 'z';
      return z;
    });
    svg._chat = { corps, queue, zzz };
    return svg;
  }

  /* ======================================================================
     2) le ciel, derrière l'immeuble : le jour un beau soleil et des nuages qui passent ; le soir une lune, des
        étoiles qui scintillent, des nuages, et de temps en temps une étoile filante
     ====================================================================== */
  const NS = 'http://www.w3.org/2000/svg';
  const svgDe = (cls, vb, contenu, parent) => {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', cls); s.setAttribute('viewBox', vb); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    s.innerHTML = contenu;
    parent.appendChild(s);
    return s;
  };
  const NUAGE = (col, ombre) => `<path d="M26 58c-14 0-22-9-20-19 2-9 12-14 21-11 3-13 16-22 30-19 10 2 17 9 20 18 5-6 15-8 22-3 7 4 9 11 7 17 9 1 15 8 14 15-1 6-7 10-14 10H26z" fill="${col}"/><path d="M14 52c6 5 13 6 22 6h90c5 0 10-2 12-6-4 2-9 3-14 3H36c-9 0-16-1-22-3z" fill="${ombre}"/>`;
  function ciel(plateau, nuit) {
    const c = document.createElement('div');
    c.className = 'vs-ciel';
    c.setAttribute('aria-hidden', 'true');
    plateau.insertBefore(c, plateau.firstChild); // (toujours au fond de la scène)
    const jour = document.createElement('div'); jour.className = 'vc-jour';
    const nuitD = document.createElement('div'); nuitD.className = 'vc-nuit';
    c.appendChild(nuit ? nuitD : jour); // (seulement le ciel du moment : il se refait au coucher du soleil)
    const anims = [];
    const joue = (el, kf, o) => { const a = el.animate(kf, o); anims.push(a); return a; };
    // le soleil : son halo, son disque, ses rayons qui tournent lentement
    svgDe('vc-soleil', '-70 -70 140 140', '<defs><radialGradient id="vcS1"><stop offset="0" stop-color="#FFF6C8" stop-opacity=".9"/><stop offset=".45" stop-color="#FFE38A" stop-opacity=".35"/><stop offset="1" stop-color="#FFE38A" stop-opacity="0"/></radialGradient><radialGradient id="vcS2" cx=".42" cy=".38"><stop offset="0" stop-color="#FFFBE6"/><stop offset=".6" stop-color="#FFE17A"/><stop offset="1" stop-color="#FFC94A"/></radialGradient></defs><circle r="70" fill="url(#vcS1)"/><circle r="24" fill="url(#vcS2)"/>', jour);
    let rayons = '';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, l = i % 2 ? 44 : 54; rayons += `<path d="M${f(Math.cos(a - 0.07) * 31)} ${f(Math.sin(a - 0.07) * 31)}L${f(Math.cos(a) * l)} ${f(Math.sin(a) * l)}L${f(Math.cos(a + 0.07) * 31)} ${f(Math.sin(a + 0.07) * 31)}Z"/>`; }
    const r = svgDe('vc-rayons', '-70 -70 140 140', `<g fill="#FFE59A" opacity=".75">${rayons}</g>`, jour);
    joue(r, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 90000, iterations: Infinity });
    joue(r, [{ opacity: 0.7 }, { opacity: 1 }], { duration: 3200, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out', composite: 'add' });
    // les nuages de beau temps, qui passent doucement
    [['n1', 0.9, 46000, 38], ['n2', 0.75, 61000, -30], ['n3', 0.6, 53000, 26], ['n4', 0.8, 70000, -42]].forEach(([cl, o, d, dx]) => {
      const n = svgDe('vc-nuage ' + cl, '0 0 150 64', NUAGE('#FFFFFF', '#D8E8F2'), jour);
      n.style.opacity = o;
      joue(n, [{ transform: 'translateX(0)' }, { transform: `translateX(${dx}px)` }], { duration: d, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
    });
    // le soir : les étoiles (trois groupes qui scintillent chacun à son rythme), quelques étoiles à branches
    const R = AC.rng(2026);
    for (let g = 0; g < 3; g++) {
      let d = '';
      for (let i = 0; i < 26; i++) { const x = R() * 400, y = R() * 460, rr = 0.5 + R() * 1.1; d += `M${f(x - rr)} ${f(y)}a${f(rr)} ${f(rr)} 0 1 0 ${f(2 * rr)} 0a${f(rr)} ${f(rr)} 0 1 0 ${f(-2 * rr)} 0z`; }
      if (g === 2) for (let i = 0; i < 6; i++) { const x = 20 + R() * 360, y = 10 + R() * 300, s = 3 + R() * 3; d += `M${f(x)} ${f(y - s)}Q${f(x + s * 0.18)} ${f(y - s * 0.18)} ${f(x + s)} ${f(y)}Q${f(x + s * 0.18)} ${f(y + s * 0.18)} ${f(x)} ${f(y + s)}Q${f(x - s * 0.18)} ${f(y + s * 0.18)} ${f(x - s)} ${f(y)}Q${f(x - s * 0.18)} ${f(y - s * 0.18)} ${f(x)} ${f(y - s)}z`; }
      const e = svgDe('vc-etoiles', '0 0 400 700', `<path d="${d}" fill="#FFF6DC"/>`, nuitD);
      e.setAttribute('preserveAspectRatio', 'xMidYMin slice');
      joue(e, [{ opacity: 1 }, { opacity: 0.35 + g * 0.1 }], { duration: 1700 + g * 900, delay: -g * 700, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
    }
    // la lune : un halo, le disque et ses mers, un peu de relief
    svgDe('vc-lune', '-80 -80 160 160', '<defs><radialGradient id="vcL1"><stop offset=".3" stop-color="#FFF4CC" stop-opacity=".62"/><stop offset=".6" stop-color="#FFF4CC" stop-opacity=".16"/><stop offset="1" stop-color="#FFF4CC" stop-opacity="0"/></radialGradient><radialGradient id="vcL2" cx=".4" cy=".36" r=".7"><stop offset="0" stop-color="#FFFBEA"/><stop offset=".7" stop-color="#F3E7BE"/><stop offset="1" stop-color="#D9CA98"/></radialGradient></defs><circle r="80" fill="url(#vcL1)"/><circle r="33" fill="url(#vcL2)"/><g fill="#CFC08E" opacity=".55" transform="scale(1.22)"><path d="M-14 -12c5-4 13-3 15 3 2 6-4 10-10 9-7-1-9-8-5-12z"/><path d="M4 2c6-2 12 1 12 7s-6 9-11 7c-5-1-6-11-1-14z"/><path d="M-12 8c3-1 6 1 6 4s-3 5-6 4-3-7 0-8z"/><circle cx="10" cy="-13" r="3.2"/><circle cx="-4" cy="17" r="2.2"/><circle cx="17" cy="-2" r="1.8"/></g><circle r="33" fill="none" stroke="#FFFBEA" stroke-opacity=".55" stroke-width="1.2"/>', nuitD);
    // les nuages de nuit, que la lune éclaire par-dessus
    [['nn1', 0.8, 58000, 34], ['nn2', 0.65, 72000, -40]].forEach(([cl, o, d, dx]) => {
      const n = svgDe('vc-nuage ' + cl, '0 0 150 64', NUAGE('#2E3A63', '#1C2546') + '<path d="M26 22c4-9 14-13 23-9M78 16c5-6 14-7 20-2" fill="none" stroke="#8C95BE" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>', nuitD);
      n.style.opacity = o;
      joue(n, [{ transform: 'translateX(0)' }, { transform: `translateX(${dx}px)` }], { duration: d, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
    });
    // l'étoile filante : une traînée qui file en diagonale, de temps en temps (voir init)
    const filante = document.createElement('div'); filante.className = 'vc-filante'; nuitD.appendChild(filante);
    return { anims, filante: nuit ? filante : null, el: c };
  }

  /* ======================================================================
     4) la scène (figée derrière l'immeuble), et le défilement qui la mène
     ====================================================================== */
  // les couches de la vue du dessus, de la plus proche à la plus lointaine : [nom, rayon (m), px par mètre peints,
  // pleine jusqu'à (px/m), partie à (px/m)] ; la dernière, le plan, arrive quand les autres s'en vont
  const COUCHES = [
    ['terrasse', 8, 70, 26, 18],
    ['rue', 26, 16, 7, 5],
    ['quartier', 90, 5, 3, 2.2],
    ['ville', 200, 2, 1.5, 1.0],
    ['plan', 950, 0.5, 0, 0],
  ];
  // l'échelle (px par mètre) selon l'avancée : la bascule tout près de la terrasse, un temps pour la regarder, puis on
  // s'élève jusqu'au plan
  const ZOOM = [[0, 100], [0.28, 82], [0.4, 64], [0.5, 20], [0.58, 6], [0.66, 2.2], [0.76, 0.9], [1, 0.34]];
  const PERSP = 700;
  const VER = (() => { const sc = document.currentScript; return sc && sc.src ? new URL(sc.src, location.href).search : ''; })();
  const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };

  AC.ville = {
    init() {
      const ville = $('#ville'), sc = ville && ville.closest('.view-scroll'), scene = $('#scene-facade');
      if (!ville || !sc || !scene || this.lance) return;
      this.lance = true;
      const plateau = $('#ville-scene'), course = $('#ville-course'), etage = $('#ville-immeuble');
      let V = 0, W = 0, Hs = 0, T0 = 1, hImm = 0, echelle = 1, total = 0, svgImm = null, nuit = null, S0 = null, demandee = false, cielS = null;
      const joueCiel = (a) => AC.ambiance.joue(a, plateau);
      function faireCiel() {
        if (cielS) { cielS.anims.forEach((a) => a.cancel()); cielS.el.remove(); }
        cielS = ciel(plateau, nuit);
        cielS.anims.forEach(joueCiel);
      }
      function teintes() {
        const n = !!(AC.estNuit && AC.estNuit());
        if (n === nuit) return;
        nuit = n;
        if (svgImm) svgImm.classList.toggle('nuit', n);
        plateau.classList.toggle('nuit', n);
        if (svgImm) faireCiel();
        poser();
      }
      /** les hauteurs : la scène (un écran), sa course (la bascule, le dézoom), l'immeuble ; on garde sa place */
      function mesurer() {
        const avant = total, pos = sc.scrollTop;
        V = sc.clientHeight; W = sc.clientWidth;
        const s = scene.clientHeight / 560; // (l'échelle de la devanture : elle tient toujours toute sa hauteur)
        if (!V || !s) return false;
        // (des hauteurs en pixels entiers : la devanture commence pile sous l'immeuble, sans couture ni chevauchement ;
        // l'immeuble garde exactement l'échelle de la devanture : son viewBox suit la hauteur arrondie)
        echelle = s;
        hImm = Math.ceil(HAUT * s); Hs = Math.round(V * 2.8); T0 = Hs + V * 0.3 + (HAUT - 583) * s;
        plateau.style.height = V + 'px';
        course.style.height = Hs + 'px';
        etage.style.height = hImm + 'px';
        total = V + Hs + hImm;
        if (svgImm) cadrerImm();
        sc.scrollTop = pos + (total - avant); // (sur la devanture, ou au même endroit au-dessus)
        poser();
        return true;
      }
      // (la même règle que la devanture : même échelle, même centrage, le bas du dessin au bas de la boîte)
      const cadrage = () => { const fac = $('#facade-host svg.facade'); return (fac && fac.getAttribute('preserveAspectRatio')) || 'xMidYMax slice'; };
      /** l'immeuble et son chat, le ciel (dans un temps mort, avant qu'on remonte) */
      function cadrerImm() {
        svgImm.setAttribute('preserveAspectRatio', cadrage());
        svgImm.setAttribute('viewBox', `0 ${f(-hImm / echelle)} 400 ${f(hImm / echelle)}`);
      }
      function batir() {
        if (svgImm) return;
        svgImm = immeuble();
        cadrerImm();
        etage.appendChild(svgImm);
        nuit = null; teintes();
        if (!cielS) faireCiel();
        if (AC.reduced) return;
        // le chat : il respire, sa queue ondule, des « z » s'envolent (sur leurs calques, joués par le compositeur)
        const joueI = (a) => AC.ambiance.joue(a, etage);
        const mondeI = AC.monde(svgImm), ch = svgImm._chat;
        const cc = mondeI.calque(ch.corps, { marge: 3 });
        cc.svg.style.transformOrigin = `${f(176 + 30 - cc.x)}px ${f(-583 - cc.y)}px`;
        joueI(cc.svg.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.05)' }], { duration: 2100, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }));
        const cq = mondeI.calque(ch.queue, { marge: 4 });
        cq.svg.style.transformOrigin = `${f(176 + 22 - cq.x)}px ${f(-583 + 2 - cq.y)}px`;
        joueI(cq.svg.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-5deg)', offset: 0.5 }, { transform: 'rotate(2deg)' }], { duration: 3600, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }));
        ch.zzz.forEach((zz, i) => {
          const c = mondeI.calque(zz, { marge: 2 });
          joueI(c.svg.animate([{ transform: 'translate(0px, 6px)', opacity: 0 }, { opacity: 0.9, offset: 0.3 }, { transform: 'translate(-8px, -16px)', opacity: 0 }], { duration: 3600, delay: i * 1200, iterations: Infinity, easing: 'ease-out', fill: 'backwards' }));
        });
        // l'étoile filante : de temps en temps, le soir, quand on regarde le ciel
        const filer = () => setTimeout(() => {
          if (nuit && cielS && cielS.filante && AC.ambiance.visible(plateau)) {
            const e = cielS.filante;
            e.style.left = 45 + Math.random() * 45 + '%'; e.style.top = 4 + Math.random() * 22 + '%';
            e.animate([{ transform: 'rotate(-32deg) translateX(0) scaleX(.3)', opacity: 0 }, { opacity: 1, offset: 0.18 }, { transform: 'rotate(-32deg) translateX(-260px) scaleX(1)', opacity: 0 }], { duration: 1050, easing: 'cubic-bezier(.3,0,.8,1)' });
          }
          filer();
        }, 4500 + Math.random() * 8000);
        filer();
      }
      /** la scène : les données (les étiquettes, l'épingle), puis les couches, peintes par l'atelier (la plus proche
          d'abord) ; elles se posent à mesure qu'elles arrivent */
      function monter() {
        if (demandee) return;
        demandee = true;
        AC.charge('ac-ville-donnees.js').then(() => {
          const D = self.AC_VILLE;
          if (!D) return;
          S0 = squelette(D);
          const dpr = window.devicePixelRatio || 1;
          const demandes = COUCHES.map(([nom, Rm, Zn], i) => ({ i, couche: nom === 'terrasse' || nom === 'rue' ? 'rue' : nom === 'plan' ? 'plan' : 'toits', Rm, Zn, r: Math.min(i < 2 ? 2 : 1.5, dpr) }));
          demandes.splice(1, 0, { i: 'lueur', couche: 'lueur', Rm: 8, Zn: 20, r: 1 });
          demandes.forEach((d) => peindre(d).then((image) => placer(d, image)).catch((e) => console.warn('ville', e)));
        }).catch((e) => console.warn('ville', e));
      }
      /** une couche peinte → sa toile dans la page, à sa place dans l'empilement (la plus lointaine au fond) */
      function placer(d, image) {
        let c = image;
        if (!(c instanceof HTMLCanvasElement)) { // (une ImageBitmap de l'atelier)
          c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
          const br = c.getContext('bitmaprenderer');
          if (br) br.transferFromImageBitmap(image); else { c.getContext('2d').drawImage(image, 0, 0); image.close && image.close(); }
        }
        const N = Math.round(2 * d.Rm * d.Zn);
        c.style.width = c.style.height = N + 'px';
        c._N = N;
        if (d.i === 'lueur') { c.className = 'vs-toile vs-lueur'; S0.lueur = c; S0.sol.appendChild(c); poser(); return; }
        c.className = 'vs-toile';
        S0.toiles[d.i] = c;
        let dessus = null;
        for (let j = d.i - 1; j >= 0 && !dessus; j--) dessus = S0.toiles[j] || null;
        S0.sol.insertBefore(c, dessus || S0.voile);
        if (S0.toiles.filter(Boolean).length === COUCHES.length) plateau.classList.add('prete');
        poser();
      }
      /** l'atelier (un Worker : la page ne se fige pas) ; sans lui, ou s'il échoue, le même peintre ici, un temps mort à la fois */
      let atelier = null, essaye = false, nDem = 0, file = Promise.resolve();
      const enCours = new Map();
      function ici(d) {
        return (file = file.then(() => AC.charge('ac-ville-peintre.js')).then(() => new Promise((ok, ko) => AC.ric(() => {
          try { ok(self.ACVillePeintre[d.couche](self.AC_VILLE, d.Rm, d.Zn, d.r)); } catch (e) { ko(e); }
        }, { timeout: 300 }))));
      }
      function peindre(d) {
        if (!essaye) {
          essaye = true;
          try {
            if (window.Worker && window.OffscreenCanvas && location.protocol !== 'file:') {
              atelier = new Worker('js/ac-ville-atelier.js' + VER);
              atelier.onmessage = (e) => {
                const r = e.data, p = enCours.get(r.n);
                if (!p) return;
                enCours.delete(r.n);
                if (r.ok) p.ok(r.bmp); else ici(p.d).then(p.ok, p.ko);
              };
              atelier.onerror = (e) => { // (il n'a pas pu démarrer : tout se refait ici)
                if (e && e.preventDefault) e.preventDefault();
                try { atelier.terminate(); } catch (err) { /* déjà fini */ }
                atelier = null;
                enCours.forEach((p) => ici(p.d).then(p.ok, p.ko));
                enCours.clear();
              };
            }
          } catch (e) { atelier = null; }
        }
        if (!atelier) return ici(d);
        return new Promise((ok, ko) => {
          const n = ++nDem;
          enCours.set(n, { ok, ko, d });
          atelier.postMessage({ n, couche: d.couche, Rm: d.Rm, Z: d.Zn, r: d.r });
        });
      }
      function squelette(D) {
        const sol = el('div', 'vs-sol', plateau);
        sol.setAttribute('aria-hidden', 'true');
        const voile = el('div', 'vs-voile', sol); // (le soir : la rue s'assombrit comme la devanture ; le plan reste lisible)
        const etiquettes = el('div', 'vs-etiquettes', plateau);
        etiquettes.setAttribute('aria-hidden', 'true');
        const traduits = { Cathédrale: AC.t('Cathédrale'), Opéra: AC.t('Opéra') }; // (les autres sont des noms propres)
        const lieux = D.reperes.map(([x, y, nom, genre]) => { const e = el('span', 'vs-lieu vs-' + genre, etiquettes); e.textContent = traduits[nom] || nom; return { e, x: x / 10, y: y / 10 }; });
        const rue = el('span', 'vs-lieu vs-rue', etiquettes); rue.textContent = 'Rue des Chaussetiers';
        const epingle = el('div', 'vs-epingle', plateau, '<svg viewBox="0 0 40 52" aria-hidden="true"><path d="M20 51C20 51 3 32 3 19a17 17 0 0 1 34 0c0 13-17 32-17 32z" fill="#2E767E" stroke="#F7F0E4" stroke-width="2.5"/><circle cx="20" cy="19" r="10.5" fill="#F7F0E4"/><path d="M20 12.5c2.6 0 3.6 2.3 3.6 4.3 0 2.2-1.6 3.4-2.6 4 .1 2 .3 5.6.3 8 0 .7-.6 1.2-1.3 1.2s-1.3-.5-1.3-1.2c0-2.4.2-6 .3-8-1-.6-2.6-1.8-2.6-4 0-2 1-4.3 3.6-4.3z" fill="#3B2723"/></svg><span class="vs-epingle-nom">L’Armoire à Cuillères</span>');
        epingle.setAttribute('aria-hidden', 'true');
        const info = el('div', 'vs-info', plateau);
        info.innerHTML = '<p class="vs-nom">L’Armoire à Cuillères</p><p class="vs-adr">11 rue des Chaussetiers<br>63000 Clermont-Ferrand</p><div class="vs-actions"><a class="btn btn-choco vs-itin" target="_blank" rel="noopener"></a><button class="btn btn-ligne vs-retour" type="button"></button></div><p class="vs-osm"></p>';
        const itin = $('.vs-itin', info), retour = $('.vs-retour', info);
        itin.textContent = AC.t('Itinéraire');
        itin.href = (AC.SHOP && (AC.SHOP.itineraire || AC.SHOP.maps)) || '#';
        retour.textContent = AC.t('Revenir à la boutique');
        $('.vs-osm', info).textContent = AC.t('Plan : © les contributeurs d’OpenStreetMap');
        retour.addEventListener('click', () => sc.scrollTo({ top: total, behavior: AC.reduced ? 'auto' : 'smooth' }));
        if ('inert' in info) info.inert = true;
        lieux.forEach((l) => { l.w = l.e.offsetWidth; l.h = l.e.offsetHeight; });
        return { sol, voile, lueur: null, toiles: [], epingle, lieux, rue, info, hInfo: 0, D, infoVue: false };
      }
      function zoom(q) {
        for (let i = 0; i < ZOOM.length - 1; i++) {
          const [q0, z0] = ZOOM[i], [q1, z1] = ZOOM[i + 1];
          if (q <= q1) return Math.exp(mix(Math.log(z0), Math.log(z1), clamp((q - q0) / (q1 - q0), 0, 1)));
        }
        return ZOOM[ZOOM.length - 1][1];
      }
      /** la scène à l'avancée q (0 : le toit est encore au bas de l'écran, le ciel derrière ; 1 : le plan) */
      // (une écriture de style seulement si la valeur change : moins de style à recalculer à chaque image)
      const pose = (e, k, v) => { const c = e._v || (e._v = {}); if (c[k] !== v) { c[k] = v; e.style[k] = v; } };
      function poser() {
        if (!S0 || !V) return;
        const q = clamp((T0 - sc.scrollTop) / T0, 0, 1);
        const a = 82 * (1 - Math.pow(lisse(0, 0.28, q), 0.8)); // la bascule (degrés)
        const z = zoom(q);
        const th = S0.D.orientation * (1 - lisse(0.45, 0.88, q)); // la carte tourne : nord en haut
        const cx = W / 2, cy = V * mix(0.16, 0.44, lisse(0.4, 0.62, q));
        const sx = cx + W, sy = cy + V * 1.5; // (la même place, dans le sol : il déborde d'un écran à gauche et à droite, d'un et demi en haut)
        pose(S0.sol, 'transform', `rotateX(${f(a)}deg)`);
        const T = (N, Zn) => `translate(${f(sx)}px, ${f(sy)}px) rotate(${f(th)}deg) scale(${(z / Zn).toFixed(4)}) translate(${-N / 2}px, ${-N / 2}px)`;
        // chaque couche : pleine tant qu'on est assez près, puis fondue dans la suivante ; celles qu'une couche pleine
        // cache entièrement ne sont pas dessinées
        const ops = COUCHES.map(([, , , haut, bas], i) => (i === COUCHES.length - 1 ? 1 - lisse(1.0, 1.6, z) : lisse(bas, haut, z)));
        const diag = Math.hypot(Math.max(cx, W - cx), Math.max(cy, V - cy));
        let couvert = false;
        COUCHES.forEach(([, Rm, Zn], i) => {
          const c = S0.toiles[i];
          if (!c) return;
          const vis = ops[i] > 0.002 && !couvert;
          pose(c, 'visibility', vis ? '' : 'hidden');
          if (vis) { pose(c, 'opacity', ops[i].toFixed(3)); pose(c, 'transform', T(c._N, Zn)); }
          if (ops[i] > 0.999 && a < 1 && Rm * 0.72 * z > diag) couvert = true;
        });
        const oNuit = nuit ? 0.55 * (1 - ops[4]) : 0;
        pose(S0.voile, 'opacity', oNuit.toFixed(3));
        if (S0.lueur) {
          const oL = nuit ? Math.max(ops[0], ops[1] * 0.7) : 0;
          pose(S0.lueur, 'visibility', oL > 0.002 ? '' : 'hidden');
          pose(S0.lueur, 'opacity', oL.toFixed(3));
          pose(S0.lueur, 'transform', T(320, 20));
        }
        // l'épingle, debout, là où la boutique apparaît (la perspective de la scène : 50 % 30 %), quand on s'élève
        const px = W / 2, py = V * 0.3, v = cy - V, ar = (a * Math.PI) / 180;
        const k = PERSP / (PERSP - v * Math.sin(ar));
        const ex = px + (cx - px) * k, ey = py + (V + v * Math.cos(ar) - py) * k;
        pose(S0.epingle, 'transform', `translate(${f(ex - 20)}px, ${f(ey - 52)}px) scale(${(0.55 + 0.45 * k).toFixed(3)})`);
        pose(S0.epingle, 'opacity', (1 - lisse(9, 14, z)).toFixed(3));
        S0.epingle.classList.toggle('nomme', q > 0.8);
        // les étiquettes : droites, posées sur la vue (une fois la bascule faite)
        const plat = lisse(0.24, 0.3, q), rad = (th * Math.PI) / 180, cs = Math.cos(rad), sn = Math.sin(rad);
        const ecran = (mx, my) => [cx + (mx * cs - my * sn) * z, cy + (mx * sn + my * cs) * z];
        const oL = plat * lisse(0.6, 0.76, q);
        const pris = []; // (les étiquettes déjà posées : pas de chevauchement)
        if (q > 0.8) pris.push([ex - 95, ey - 118, ex + 95, ey - 50]); // (le nom de la boutique, au-dessus de l'épingle)
        if (q > 0.84) { S0.hInfo = S0.hInfo || S0.info.offsetHeight; pris.push([0, V - 14 - S0.hInfo - 6, W, V]); } // (la petite carte)
        S0.lieux.forEach((l) => {
          if (oL <= 0.01) { pose(l.e, 'opacity', '0'); return; }
          const [lx, ly] = ecran(l.x, l.y);
          const b = [lx - l.w / 2 - 3, ly - l.h / 2 - 2, lx + l.w / 2 + 3, ly + l.h / 2 + 2];
          const libre = b[0] > 4 && b[2] < W - 4 && b[1] > 4 && b[3] < V - 4 && !pris.some((p) => b[0] < p[2] && b[2] > p[0] && b[1] < p[3] && b[3] > p[1]);
          if (libre && oL > 0.01) pris.push(b);
          pose(l.e, 'opacity', libre ? oL.toFixed(3) : '0');
          pose(l.e, 'transform', `translate(${f(lx)}px, ${f(ly)}px) translate(-50%, -50%)`);
        });
        const [rx, ry] = ecran(S0.D.rue[0] / 10, S0.D.rue[1] / 10);
        let ang = S0.D.rue[2] + th;
        ang = ((((ang + 90) % 180) + 180) % 180) - 90; // (toujours lisible, de gauche à droite)
        pose(S0.rue, 'opacity', (plat * lisse(3.5, 6, z)).toFixed(3));
        pose(S0.rue, 'transform', `translate(${f(rx)}px, ${f(ry)}px) rotate(${f(ang)}deg) translate(-50%, -50%)`);
        // la petite carte, à la fin
        const oI = lisse(0.86, 0.97, q);
        pose(S0.info, 'opacity', oI.toFixed(3));
        pose(S0.info, 'transform', `translateY(${f((1 - oI) * 18)}px)`);
        const vue = oI > 0.5;
        if (vue !== S0.infoVue) { S0.infoVue = vue; if ('inert' in S0.info) S0.info.inert = !vue; S0.info.style.pointerEvents = vue ? 'auto' : 'none'; }
      }
      let raf = 0;
      const maj = () => {
        raf = 0;
        const y = sc.scrollTop;
        if (y < total - 20) batir();
        if (y < total - 20) monter(); // (dès qu'on remonte : les couches sont prêtes quand on arrive au toit)
        if (y <= T0 + 2) poser();
      };
      sc.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(maj); }, { passive: true });
      let rz = 0;
      window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (sc.clientHeight) mesurer(); }, 150); });
      AC.on('view', (v) => { if (v === 'accueil') requestAnimationFrame(() => { if (sc.clientHeight && (sc.clientHeight !== V || !total)) mesurer(); teintes(); }); });
      setInterval(teintes, 60000);
      this.haut = () => total;
      // la place au-dessus de la devanture existe tout de suite (on peut remonter) ; l'immeuble, son chat et le ciel se
      // dessinent dans un temps mort, la vue du dessus à la première remontée
      mesurer();
      AC.ric(batir, { timeout: 5000 });
    },
    haut: () => 0,
  };
})();
