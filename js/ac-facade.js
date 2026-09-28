/* ==========================================================================
   L'Armoire à Cuillères — la devanture, vue de la rue des Chaussetiers
   SVG dessiné en JS (viewBox 0 0 400 560, 1 unité ≈ 1 cm) d'après leurs photos
   de septembre 2026 : bois chocolat mouluré, enseigne peinte en lettres crème,
   corniche de branches séchées et de nichoirs, vitrines éclairées, panneau
   « ICI ON… », enseigne drapeau aux cuillères, terrasse de chaises pliantes pastel.
   Le décor déborde du cadre (écrans larges). Les calques :
     monde (mur, bois, rue) → voile du soir → intérieurs éclairés → reflets → vie (oiseaux, vapeur)
   Tout ce qui bouge sans fin (rameaux, plaque, pots, vapeur, poussières dorées, reflet, oiseaux) sort sur son
   propre calque (AC.monde, dans ac-core.js) : le compositeur l'anime à 60 images/s et le grand dessin n'est plus
   repeint (seule la porte, quand elle bouge, le repeint encore un instant).
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});
  const S = (tag, attrs, parent) => AC.svg(tag, attrs, parent);
  const f = (n) => Math.round(n * 10) / 10;

  const P = {
    wall: '#E4DDCB', wall2: '#D6CDB7', wallShade: '#B9AE96',
    wood: '#3B2723', woodLight: '#5A4038', woodDark: '#241714', woodMid: '#4A332D', woodEdge: '#6B4E44',
    cream: '#F3EBDD', creamWarm: '#F6E7CF',
    stone: '#8B8378', stoneDark: '#6F675D', stoneLight: '#A39B8F',
    pave: '#7F868D', paveDark: '#5E656C', paveLight: '#9AA1A7',
    glassDark: '#1E1512',
    mint: '#9FD3D2', mintDark: '#79B3B2', sage: '#B7CEBA', pink: '#E4B4AB', pinkDark: '#C99088', yellow: '#E2C441', yellowDark: '#C3A52C',
    teal: '#2E767E', tealLogo: '#6AB8C6',
    turquoise: '#3FC7EE', prune: '#6C2383', fuchsia: '#E64AA8', marine: '#13365E', aqua: '#A6E6DC',
    brass: '#C9A45C',
  };
  const FONT_LETTRES = "'Armoire Lettres', 'Poppins', sans-serif";
  const FONT_SERIF = "'Playfair Display', Georgia, serif";
  const FONT_SANS = "'Poppins', system-ui, sans-serif";

  const ctx2d = document.createElement('canvas').getContext('2d');
  function measure(text, size, font) {
    ctx2d.font = `${size}px ${font}`;
    return ctx2d.measureText(text).width;
  }

  /* ---------- petites briques ---------- */
  function lin(parent, id, stops, { x1 = 0, y1 = 0, x2 = 0, y2 = 1, units } = {}) {
    const g = S('linearGradient', { id, x1, y1, x2, y2, gradientUnits: units }, parent);
    stops.forEach(([o, c, a]) => S('stop', { offset: o, 'stop-color': c, 'stop-opacity': a == null ? 1 : a }, g));
    return `url(#${id})`;
  }
  function rad(parent, id, stops, { cx = 0.5, cy = 0.5, r = 0.5, fx, fy, units } = {}) {
    const g = S('radialGradient', { id, cx, cy, r, fx, fy, gradientUnits: units }, parent);
    stops.forEach(([o, c, a]) => S('stop', { offset: o, 'stop-color': c, 'stop-opacity': a == null ? 1 : a }, g));
    return `url(#${id})`;
  }
  const rect = (p, x, y, w, h, fill, extra = {}) => S('rect', { x: f(x), y: f(y), width: f(w), height: f(h), fill, ...extra }, p);
  const path = (p, d, fill, extra = {}) => S('path', { d, fill, ...extra }, p);

  // formes fusionnées : un seul <path> pour beaucoup de petits disques, ellipses ou pavés de même couleur
  const dDisc = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0z`;
  const dEll = (cx, cy, rx, ry) => `M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0z`;
  const dRR = (x, y, w, h, r) => `M${f(x + r)} ${f(y)}h${f(w - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}v${f(h - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}h${f(-(w - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)}v${f(-(h - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}z`;
  function bucket() {
    const m = new Map();
    return {
      add(col, d) { if (!m.has(col)) m.set(col, []); m.get(col).push(d); },
      flush(par, extra = {}) { m.forEach((ds, col) => S('path', { d: ds.join(''), fill: col, ...extra }, par)); m.clear(); },
    };
  }

  /** Panneau mouluré : cadre + plate-bande en relief (biseaux éclairés en haut à gauche) */
  function panel(p, x, y, w, h, { inset = 5, bevel = 3.2, base = P.wood, cls } = {}) {
    const g = S('g', { class: cls }, p);
    const x0 = x + inset, y0 = y + inset, x1 = x + w - inset, y1 = y + h - inset, b = bevel;
    rect(g, x, y, w, h, base);
    // gorge d'ombre autour de la plate-bande
    rect(g, x0 - 1.2, y0 - 1.2, x1 - x0 + 2.4, y1 - y0 + 2.4, P.woodDark, { opacity: 0.55 });
    path(g, `M${f(x0)} ${f(y0)}H${f(x1)}L${f(x1 - b)} ${f(y0 + b)}H${f(x0 + b)}Z`, P.woodEdge); // haut : lumière
    path(g, `M${f(x0)} ${f(y0)}L${f(x0 + b)} ${f(y0 + b)}V${f(y1 - b)}L${f(x0)} ${f(y1)}Z`, P.woodLight); // gauche
    path(g, `M${f(x0)} ${f(y1)}L${f(x0 + b)} ${f(y1 - b)}H${f(x1 - b)}L${f(x1)} ${f(y1)}Z`, P.woodDark); // bas
    path(g, `M${f(x1)} ${f(y0)}L${f(x1)} ${f(y1)}L${f(x1 - b)} ${f(y1 - b)}V${f(y0 + b)}Z`, '#2E1D19'); // droite
    rect(g, x0 + b, y0 + b, x1 - x0 - 2 * b, y1 - y0 - 2 * b, base);
    return g;
  }

  /** Veinage du bois peint : quelques filets verticaux ondulés, très discrets */
  function grain(p, x, y, w, h, R, n = 6, op = 0.13) {
    const g = S('g', { opacity: op, 'pointer-events': 'none' }, p);
    for (let i = 0; i < n; i++) {
      const gx = x + (w * (i + R() * 0.8)) / n;
      let d = `M${f(gx)} ${f(y)}`;
      const steps = Math.max(2, Math.round(h / 24));
      for (let k = 1; k <= steps; k++) d += ` S${f(gx + (R() - 0.5) * 2.2)} ${f(y + (h * (k - 0.5)) / steps)} ${f(gx + (R() - 0.5) * 1.6)} ${f(y + (h * k) / steps)}`;
      path(g, d, 'none', { stroke: R() > 0.5 ? '#6E5248' : '#1B100D', 'stroke-width': f(0.35 + R() * 0.5) });
    }
    return g;
  }

  /* ---------- texture d'enduit (canvas → image, une fois ; gardée d'une visite à l'autre : elle ne change pas) ---------- */
  let plasterURL = null;
  const ENDUIT = 'ac:enduit:1';
  function plasterTexture() {
    if (plasterURL) return plasterURL;
    try { plasterURL = localStorage.getItem(ENDUIT); } catch (e) { /* navigation privée */ }
    if (plasterURL) return plasterURL;
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const x = c.getContext('2d');
    const img = x.createImageData(160, 160);
    const n1 = AC.noise2(7), n2 = AC.noise2(8);
    for (let j = 0; j < 160; j++) for (let i = 0; i < 160; i++) {
      // bruit périodique (tuile raccordable) : on mélange quatre échantillons
      const u = i / 160, v = j / 160;
      const s = (a, b) => n1(a * 6, b * 6) * 0.6 + n2(a * 22, b * 22) * 0.4;
      const val = s(u, v) * (1 - u) * (1 - v) + s(u - 1, v) * u * (1 - v) + s(u, v - 1) * (1 - u) * v + s(u - 1, v - 1) * u * v;
      const k = (j * 160 + i) * 4;
      const t = 0.5 + val * 0.5;
      img.data[k] = 120 + t * 60; img.data[k + 1] = 110 + t * 55; img.data[k + 2] = 90 + t * 45;
      img.data[k + 3] = 26 + Math.abs(val) * 40;
    }
    x.putImageData(img, 0, 0);
    plasterURL = c.toDataURL();
    try { localStorage.setItem(ENDUIT, plasterURL); } catch (e) { /* plein, ou navigation privée */ }
    return plasterURL;
  }

  /* ======================================================================
     Construction
     ====================================================================== */
  async function create(host, opts = {}) {
    try { await Promise.race([document.fonts.load("40px 'Armoire Lettres'"), AC.wait(1500)]); } catch (e) { /* police absente : repli */ }
    try { await Promise.race([Promise.all([document.fonts.load("20px 'Playfair Display'"), document.fonts.load("600 10px 'Poppins'"), document.fonts.load("700 10px 'Poppins'")]), AC.wait(1200)]); } catch (e) { /* idem */ }
    const R = AC.rng(opts.seed || 11);
    const svg = S('svg', { viewBox: '0 0 400 560', class: 'facade', preserveAspectRatio: 'xMidYMax slice', role: 'img', 'aria-label': AC.t("La devanture de L'Armoire à Cuillères, rue des Chaussetiers") });
    svg.style.overflow = 'visible';
    // cadrage : toute la hauteur, toujours (écran haut : on rogne les côtés ; écran court : le mur et la rue,
    // dessinés bien au-delà du cadre, débordent sur les côtés au lieu de rogner la corniche et les nichoirs)
    const cadrer = () => {
      const W = host.clientWidth, H = host.clientHeight;
      if (W && H) svg.setAttribute('preserveAspectRatio', H / W >= 1.4 ? 'xMidYMax slice' : 'xMidYMax meet');
    };
    if (window.ResizeObserver) new ResizeObserver(cadrer).observe(host);
    const defs = S('defs', {}, svg);
    const U = (p) => AC.uid('fa' + p);

    const world = S('g', { class: 'fa-world' }, svg);
    const night = S('rect', { x: -400, y: -300, width: 1200, height: 1000, fill: '#101a36', opacity: 0, class: 'fa-night', 'pointer-events': 'none' }, svg);
    const spill = S('g', { class: 'fa-spill', 'pointer-events': 'none' }, svg); // la lumière de la porte sur le trottoir
    const lit = S('g', { class: 'fa-lit' }, svg); // les intérieurs éclairés, au-dessus du voile du soir
    const vinyl = S('g', { class: 'fa-vinyl' }, svg); // ce qui est collé sur les vitres (ne s'éteint pas avec la salle)
    const litDoor = S('g', { class: 'fa-lit-door' }, svg); // la salle vue par la porte entrouverte (toujours allumée)
    const glassFx = S('g', { class: 'fa-glassfx', 'pointer-events': 'none' }, svg);
    // la terrasse, les fleurs, l'ardoise : devant les vitrines (la chaise passe devant les horaires collés
    // sur la vitre) ; le soir, elles ont leur propre voile (un filtre), puisqu'elles sont au-dessus de celui de la rue
    const front = S('g', { class: 'fa-front' }, svg);
    const life = S('g', { class: 'fa-life' }, svg); // oiseaux, vapeur, halo de la porte
    const nuitId = U('nf');
    const nuitM = S('feColorMatrix', { type: 'matrix', values: '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0' },
      S('filter', { id: nuitId, x: '-10%', y: '-10%', width: '120%', height: '120%', 'color-interpolation-filters': 'sRGB' }, defs));
    const VOILE = [0x10 / 255, 0x1a / 255, 0x36 / 255]; // le bleu nuit du voile de la rue
    let voileK = 0, voileTour = 0;
    const voilables = []; // les calques sortis du monde (rameaux, plaque…) ou de la terrasse : au-dessus du voile de la rue
    /** Le voile du soir sur la terrasse : ses couleurs mélangées au bleu nuit, comme sous le voile de la rue */
    function voile(k) {
      voileK = k;
      const a = (1 - k).toFixed(4), c = VOILE.map((v) => (v * k).toFixed(4));
      nuitM.setAttribute('values', `${a} 0 0 0 ${c[0]} 0 ${a} 0 0 ${c[1]} 0 0 ${a} 0 ${c[2]} 0 0 0 1 0`);
      [front, ...voilables].forEach((g) => (k > 0.002 ? g.setAttribute('filter', `url(#${nuitId})`) : g.removeAttribute('filter')));
    }
    const hit = S('g', { class: 'fa-hits' }, svg); // zones à toucher, au-dessus de tout

    /* ---------- le mur, la rue au loin ---------- */
    const wallG = S('g', { class: 'fa-wall' }, world);
    const pat = U('pl');
    const pattern = S('pattern', { id: pat, width: 160, height: 160, patternUnits: 'userSpaceOnUse' }, defs);
    S('image', { href: plasterTexture(), width: 160, height: 160 }, pattern);
    const wallGrad = lin(defs, U('wg'), [[0, '#EAE3D2'], [0.55, P.wall], [1, '#CFC6B1']]);
    rect(wallG, -400, -300, 1200, 780, wallGrad);
    rect(wallG, -400, -300, 1200, 780, `url(#${pat})`);
    // soubassement de pierre de Volvic de part et d'autre
    rect(wallG, -400, 400, 416, 70, P.stoneDark);
    rect(wallG, 384, 400, 416, 70, P.stoneDark);
    for (let i = 0; i < 26; i++) { // joints des blocs
      const bx = -400 + i * 32 + (i % 2) * 8;
      if (bx > 8 && bx < 390) continue;
      rect(wallG, bx, 400, 1, 70, '#5A534A', { opacity: 0.7 });
    }
    rect(wallG, -400, 432, 1200, 1, '#5A534A', { opacity: 0.5 });

    // étage : une fenêtre à petits carreaux, volets gris, garde-corps en fer
    const up = S('g', { class: 'fa-upstairs' }, wallG);
    const winGrad = lin(defs, U('uw'), [[0, '#3C4750'], [0.5, '#56626B'], [1, '#2B333A']]);
    rect(up, 132, -46, 116, 98, '#CFC6B0');
    rect(up, 138, -40, 104, 88, '#EFEAE0');
    rect(up, 143, -35, 94, 80, winGrad);
    path(up, 'M190 -35V45M143 5H237M143 -15H237M143 25H237', 'none', { stroke: '#EFEAE0', 'stroke-width': 2.2 });
    path(up, 'M150 42L178 -30L186 -30L158 42Z M196 42L214 -2L219 -2L201 42Z', '#fff', { opacity: 0.12 });
    [[98, 134], [246, 282]].forEach(([a, b]) => {
      rect(up, a, -44, b - a, 94, '#8C938F');
      const lv = [];
      for (let yy = -40; yy < 48; yy += 5.5) lv.push(`M${a + 3} ${yy}H${b - 3}`);
      path(up, lv.join(''), 'none', { stroke: '#707875', 'stroke-width': 1.3 });
      rect(up, a, -44, b - a, 94, 'none', { stroke: '#6A716E', 'stroke-width': 1 });
    });
    const rail = ['M136 30H244', 'M136 50H244'];
    for (let xx = 140; xx <= 240; xx += 8) rail.push(`M${xx} 30V50`);
    for (let xx = 144; xx <= 236; xx += 16) rail.push(`M${xx} 40c2 -4 6 -4 8 0c-2 4 -6 4 -8 0`);
    path(up, rail.join(''), 'none', { stroke: '#2A2522', 'stroke-width': 1.2 });
    rect(up, 124, 52, 132, 5, '#C8BEA7');
    rect(up, 124, 57, 132, 2, '#A89E88');

    // gouttière à gauche
    rect(wallG, 2, -300, 7, 772, '#77756F');
    rect(wallG, 3, -300, 2, 772, '#9A9892', { opacity: 0.8 });
    for (let yy = -260; yy < 460; yy += 110) rect(wallG, 0, yy, 11, 5, '#5F5D58');

    // à droite : l'arc en pierre de Volvic de l'entrée voisine, la plaque « 11 », l'interphone
    const arc = S('g', { class: 'fa-arc' }, wallG);
    path(arc, 'M392 470V250C392 205 430 180 470 180S548 205 548 250V470Z', P.stoneDark);
    path(arc, 'M404 470V256C404 219 434 196 470 196S536 219 536 256V470Z', '#3A3530');
    for (let k = 0; k <= 8; k++) { // voussoirs
      const a = Math.PI + (k / 8) * Math.PI;
      const x0 = 470 + Math.cos(a) * 66, y0 = 250 + Math.sin(a) * 66, x1 = 470 + Math.cos(a) * 78, y1 = 250 + Math.sin(a) * 78;
      path(arc, `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`, 'none', { stroke: '#4F4841', 'stroke-width': 1 });
    }
    rect(arc, 388, 250, 16, 220, P.stone);
    for (let yy = 262; yy < 470; yy += 26) rect(arc, 388, yy, 16, 1, '#6A6258');
    const plaque = S('g', { class: 'fa-num' }, wallG);
    rect(plaque, 390, 294, 22, 17, '#F4F1EA', { rx: 1.5, stroke: '#2A2A2A', 'stroke-width': 1.2 });
    S('text', { x: 401, y: 307.5, 'text-anchor': 'middle', 'font-family': FONT_SANS, 'font-weight': 700, 'font-size': 12, fill: '#222' }, plaque).textContent = '11';
    rect(wallG, 392, 324, 18, 30, '#9EA3A6', { rx: 1.5 });
    rect(wallG, 395, 328, 12, 7, '#6F7478', { rx: 1 });
    for (let k = 0; k < 4; k++) S('circle', { cx: 398 + (k % 2) * 6, cy: 341 + Math.floor(k / 2) * 6, r: 1.2, fill: '#555' }, wallG);

    /* ---------- la devanture ---------- */
    const shop = S('g', { class: 'fa-shop' }, world);
    // ombre portée de la devanture sur le mur
    rect(shop, 18, 80, 372, 392, '#000', { opacity: 0.1, transform: 'translate(3 3)' });
    rect(shop, 16, 78, 368, 392, P.wood);
    grain(shop, 16, 96, 368, 370, R, 28, 0.12);

    // la lumière du ciel (la rue est étroite) : la devanture s'assombrit vers le bas
    const shopLight = S('g', { class: 'fa-shoplight', 'pointer-events': 'none' }, shop);
    // corniche (saillante) : tablette, gorge, filet
    const corn = S('g', { class: 'fa-corniche' }, shop);
    const cornGrad = lin(defs, U('cg'), [[0, '#5B4139'], [0.45, P.wood], [1, P.woodDark]]);
    rect(corn, 8, 78, 384, 7, '#4E372F');
    rect(corn, 8, 78, 384, 1.6, '#735549');
    rect(corn, 12, 85, 376, 8, cornGrad);
    rect(corn, 14, 93, 372, 3, P.woodDark);
    rect(corn, 8, 85, 384, 2.5, '#000', { opacity: 0.22 });

    // bandeau de l'enseigne
    const fascia = S('g', { class: 'fa-fascia' }, shop);
    rect(fascia, 16, 96, 368, 50, P.wood);
    grain(fascia, 16, 96, 368, 50, R, 18, 0.1);
    rect(fascia, 22, 100, 356, 42, 'none', { stroke: P.woodDark, 'stroke-width': 1.6, opacity: 0.8 });
    rect(fascia, 23, 101, 354, 40, 'none', { stroke: P.woodEdge, 'stroke-width': 0.6, opacity: 0.6 });
    // ombre de la corniche sur le bandeau
    rect(fascia, 16, 96, 368, 9, lin(defs, U('cs'), [[0, '#000', 0.45], [1, '#000', 0]]));

    // les lettres peintes (une par une, pour l'animation ; <text> dans un <g> : Safari)
    const signText = "L'ARMOIRE À CUILLÈRES";
    const signSize = 39;
    const spacing = 1.6;
    const advs = [...signText].map((c) => measure(c, signSize, FONT_LETTRES) + spacing);
    const total = advs.reduce((a, b) => a + b, 0) - spacing;
    const scaleX = Math.min(1, 336 / total);
    let cx = 200 - (total * scaleX) / 2;
    const letters = [];
    const lettersG = S('g', { class: 'fa-letters' }, fascia);
    [...signText].forEach((ch, i) => {
      const w = (advs[i] - spacing) * scaleX;
      if (ch !== ' ') {
        const gL = S('g', { class: 'fa-letter' }, lettersG);
        const jx = cx + w / 2, jy = 136 + (R() - 0.5) * 1.4, jr = (R() - 0.5) * 3;
        const t = S('text', { x: f(jx), y: f(jy), 'text-anchor': 'middle', 'font-family': FONT_LETTRES, 'font-size': signSize, fill: P.cream, transform: `rotate(${f(jr)} ${f(jx)} ${f(jy)})` + (scaleX < 1 ? ` translate(${f(jx)} 0) scale(${f(scaleX * 100) / 100} 1) translate(${f(-jx)} 0)` : '') }, gL);
        t.textContent = ch;
        // un voile de peinture un peu usée
        letters.push(gL);
      }
      cx += advs[i] * scaleX;
    });
    lettersG.setAttribute('filter', `url(#${U('paint')})`);
    const paint = S('filter', { id: lettersG.getAttribute('filter').slice(5, -1), x: '-5%', y: '-20%', width: '110%', height: '140%' }, defs);
    S('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.75', numOctaves: 2, seed: 3, result: 'n' }, paint);
    S('feColorMatrix', { in: 'n', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -5.2 4.75', result: 'm' }, paint);
    S('feComposite', { in: 'SourceGraphic', in2: 'm', operator: 'in' }, paint);

    // traverse moulurée sous l'enseigne
    rect(shop, 16, 146, 368, 9, P.woodMid);
    rect(shop, 16, 146, 368, 1.4, P.woodEdge);
    rect(shop, 16, 153.6, 368, 1.4, P.woodDark);

    // imposte : panneau, vitre au-dessus de la porte, panneau à sonnette
    panel(shop, 58, 157, 92, 37, { inset: 5, bevel: 2.6 });
    panel(shop, 250, 157, 92, 37, { inset: 5, bevel: 2.6 });
    rect(shop, 150, 157, 100, 37, P.woodMid);
    const bellBtn = S('g', { class: 'fa-bellbtn' }, shop);
    S('circle', { cx: 296, cy: 175.5, r: 6.2, fill: '#2A1B17' }, bellBtn);
    S('circle', { cx: 296, cy: 175.5, r: 5, fill: rad(defs, U('br'), [[0, '#F3DFA8'], [0.5, P.brass], [1, '#7C5E2A']], { cx: 0.35, cy: 0.35, r: 0.8 }) }, bellBtn);
    S('circle', { cx: 296, cy: 175.5, r: 2, fill: '#E9E2D4' }, bellBtn);

    // pilastres
    panel(shop, 16, 157, 42, 303, { inset: 6, bevel: 3.2 });
    rect(shop, 342, 157, 42, 303, P.wood);
    // montants entre les baies
    rect(shop, 148, 196, 4, 266, P.woodDark, { opacity: 0.6 });
    rect(shop, 248, 196, 4, 266, P.woodDark, { opacity: 0.6 });

    // cadres des vitrines et de la porte
    const frames = S('g', { class: 'fa-frames' }, shop);
    [[58, 196, 92, 196], [250, 196, 92, 196]].forEach(([x, y, w, h]) => {
      rect(frames, x, y, w, h, P.woodMid);
      rect(frames, x + 5, y + 5, w - 10, h - 10, P.woodDark);
      rect(frames, x + 7, y + 7, w - 14, h - 14, P.glassDark);
      rect(frames, x, y, w, 1.2, P.woodEdge);
      rect(frames, x, y + h - 2, w, 2, '#1C110E');
      // petite pièce d'appui
      rect(frames, x - 2, y + h - 4, w + 4, 6, P.woodLight);
      rect(frames, x - 2, y + h + 2, w + 4, 1.5, '#1A100D');
    });
    // soubassements moulurés
    panel(shop, 58, 396, 92, 66, { inset: 7, bevel: 3.4 });
    panel(shop, 250, 396, 92, 66, { inset: 7, bevel: 3.4 });

    // la porte, entrouverte : le vantail tourne sur ses gonds (à droite) vers l'intérieur, en perspective,
    // et la lumière du salon passe par l'entrebâillement. Le vantail est dessiné à plat (repère d'origine)
    // puis projeté : les grandes pièces point par point, les petites (poignée, vinyle, pancarte) par un repère local.
    const DOOR = { hinge: 245, eyeX: 200, eyeY: 322, focal: 700 };
    const AJAR = (34 * Math.PI) / 180, WIDE = (80 * Math.PI) / 180;
    let theta = AJAR;
    const proj = (x, y) => {
      const d = DOOR.hinge - x, X = DOOR.hinge - d * Math.cos(theta), Z = d * Math.sin(theta), s = DOOR.focal / (DOOR.focal + Z);
      return [DOOR.eyeX + (X - DOOR.eyeX) * s, DOOR.eyeY + (y - DOOR.eyeY) * s];
    };
    const pt = (x, y) => { const p = proj(x, y); return f(p[0]) + ' ' + f(p[1]); };
    const polyD = (pts) => 'M' + pts.map(([x, y]) => pt(x, y)).join('L') + 'Z';
    const quadD = (x, y, w, h) => polyD([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
    const affine = (cx, cy, k = 10) => { // la projection, linéarisée autour de (cx, cy)
      const a0 = proj(cx - k, cy), a1 = proj(cx + k, cy), b0 = proj(cx, cy - k), b1 = proj(cx, cy + k), p0 = proj(cx, cy);
      const a = (a1[0] - a0[0]) / (2 * k), b = (a1[1] - a0[1]) / (2 * k), c = (b1[0] - b0[0]) / (2 * k), d = (b1[1] - b0[1]) / (2 * k);
      return `matrix(${[a, b, c, d, p0[0] - a * cx - c * cy, p0[1] - b * cx - d * cy].map((v) => Math.round(v * 10000) / 10000).join(' ')})`;
    };
    const LP = [], LT = []; // pièces projetées [élément, tracé()] ; groupes à repère local [élément, cx, cy]
    const piece = (par, fill, fn, extra = {}) => { const el = path(par, fn(), fill, extra); LP.push([el, fn]); return el; };

    const door = S('g', { class: 'fa-door' }, shop);
    rect(door, 150, 196, 100, 266, P.woodDark); // le tableau de la porte
    const leaf = S('g', { class: 'fa-leaf' }, door);
    piece(leaf, P.wood, () => quadD(155, 200, 90, 262));
    for (let i = 0; i < 7; i++) { // veinage
      const gx = 155 + (90 * (i + R() * 0.8)) / 7, pts = [];
      for (let k = 0; k <= 8; k++) pts.push([gx + (R() - 0.5) * 1.8, 200 + (262 * k) / 8]);
      piece(leaf, 'none', () => 'M' + pts.map(([x, y]) => pt(x, y)).join('L'), { stroke: R() > 0.5 ? '#6E5248' : '#1B100D', 'stroke-width': f(0.35 + R() * 0.5), opacity: 0.12 });
    }
    const bordVitre = piece(leaf, '#1C110E', () => quadD(163, 208, 74, 150));
    const vitrePiece = piece(leaf, P.glassDark, () => quadD(165, 210, 70, 146));
    { // le panneau mouluré du bas
      const x0 = 169, y0 = 372, x1 = 231, y1 = 450, b = 3;
      piece(leaf, P.woodDark, () => quadD(x0 - 1.2, y0 - 1.2, x1 - x0 + 2.4, y1 - y0 + 2.4), { opacity: 0.55 });
      piece(leaf, P.woodEdge, () => polyD([[x0, y0], [x1, y0], [x1 - b, y0 + b], [x0 + b, y0 + b]]));
      piece(leaf, P.woodLight, () => polyD([[x0, y0], [x0 + b, y0 + b], [x0 + b, y1 - b], [x0, y1]]));
      piece(leaf, P.woodDark, () => polyD([[x0, y1], [x0 + b, y1 - b], [x1 - b, y1 - b], [x1, y1]]));
      piece(leaf, '#2E1D19', () => polyD([[x1, y0], [x1, y1], [x1 - b, y1 - b], [x1 - b, y0 + b]]));
      piece(leaf, P.wood, () => quadD(x0 + b, y0 + b, x1 - x0 - 2 * b, y1 - y0 - 2 * b));
    }
    // poignée béquille chromée, rosace
    const handle = S('g', { class: 'fa-handle' }, leaf);
    rect(handle, 169, 364, 5, 22, '#B9BDBF', { rx: 2 });
    rect(handle, 166, 370, 22, 4.4, lin(defs, U('hd'), [[0, '#F1F3F4'], [0.5, '#A9AEB1'], [1, '#6F7477']]), { rx: 2.2 });
    rect(handle, 170, 392, 3, 5, '#3A3A3A', { rx: 1 });
    LT.push([handle, 176, 378]);
    // le vantail tourné ne reçoit plus la lumière de la rue
    const leafShade = piece(leaf, '#000', () => quadD(155, 200, 90, 262), { opacity: 0.15 });
    // seuil
    rect(shop, 146, 462, 108, 8, '#A69E90');
    rect(shop, 146, 462, 108, 1.6, '#C2BAAC');

    // pilastre droit : le panneau « ICI ON… »
    const ici = S('g', { class: 'fa-ici', tabindex: -1 }, shop);
    rect(ici, 345, 160, 36, 298, P.woodMid);
    rect(ici, 349, 164, 28, 290, '#2B1D1A');
    rect(ici, 351, 166, 24, 286, '#221614');
    const iciLines = ['ICI', 'ON POCHE', 'ON CRÈME', 'ON DRESSE', 'ON BLANCHIT', 'ON SAUPOUDRE', 'ON FOUETTE', 'ON GLACE', 'ON ZESTE', 'ON ENFOURNE', 'ON ÉMULSIONNE', 'ON NAPPE', 'ON CARAMÉLISE', 'ON CHÉRIT', 'NOTRE MATIÈRE', 'PREMIÈRE :', 'NOTRE MIEL', 'DE CARACTÈRE', 'NOTRE FARINE', 'SOYEUSE,', 'NOTRE CRÈME', 'ONCTUEUSE,', 'NOS OEUFS', 'DORÉS ET', 'NOTRE CHOCOLAT', 'SÉLECTIONNÉ'];
    const iciText = S('g', { class: 'fa-ici-text', fill: '#EDE6DA', 'font-family': FONT_SANS, 'font-weight': 600, 'text-anchor': 'middle' }, ici);
    const iciWords = [];
    iciLines.forEach((t, i) => {
      const size = i === 0 ? 9 : 3.9;
      const y = i === 0 ? 180 : 187 + (i - 1) * 7.75;
      const w = measure(t, size, i === 0 ? FONT_LETTRES : FONT_SANS);
      const tx = S('text', { x: 363, y: f(y), 'font-size': size, 'font-family': i === 0 ? FONT_LETTRES : FONT_SANS, textLength: w > 22 ? 22 : null, lengthAdjust: 'spacingAndGlyphs' }, S('g', { class: 'fa-ici-w' }, iciText));
      tx.textContent = t;
      iciWords.push(tx.parentNode);
    });
    const iciEnd = S('g', { class: 'fa-ici-fin', fill: '#F3EBDD', 'font-family': FONT_LETTRES, 'text-anchor': 'middle' }, ici);
    ['ET DONC,', 'ICI', 'ON AIME LE', 'FAIT MAISON.'].forEach((t, i) => {
      const w = measure(t, 7.2, FONT_LETTRES);
      const tx = S('text', { x: 363, y: 394 + i * 10.4, 'font-size': 7.2, textLength: w > 22.5 ? 22.5 : null, lengthAdjust: 'spacingAndGlyphs' }, S('g', { class: 'fa-ici-w' }, iciEnd));
      tx.textContent = t;
      iciWords.push(tx.parentNode);
    });

    rect(shopLight, 16, 96, 368, 374, lin(defs, U('sh'), [[0, '#FFE9D0', 0.07], [0.45, '#000', 0], [1, '#000', 0.22]]));
    shop.appendChild(shopLight);

    /* ---------- les intérieurs (au-dessus du voile du soir) ---------- */
    const clipL = U('cl'), clipR = U('cr'), clipD = U('cd'), clipT = U('ct');
    S('rect', { x: 65, y: 203, width: 78, height: 182 }, S('clipPath', { id: clipL }, defs));
    S('rect', { x: 257, y: 203, width: 78, height: 182 }, S('clipPath', { id: clipR }, defs));
    S('rect', { x: 154, y: 160, width: 92, height: 31 }, S('clipPath', { id: clipT }, defs));
    const glowWarm = rad(defs, U('gw'), [[0, '#FFE2A6', 0.95], [0.45, '#F2B66C', 0.55], [1, '#9A5A34', 0]]);
    const roomGrad = lin(defs, U('rg'), [[0, '#5B3A2A'], [0.6, '#7E5236'], [1, '#4A2F22']]);

    // vitre de gauche : la salle, une suspension en macramé, une étagère, le vinyle des horaires
    const inL = S('g', { 'clip-path': `url(#${clipL})`, class: 'fa-in fa-in-l' }, lit);
    rect(inL, 60, 200, 90, 190, roomGrad);
    S('ellipse', { cx: 104, cy: 262, rx: 70, ry: 80, fill: glowWarm, class: 'fa-glow' }, inL);
    rect(inL, 66, 300, 76, 3, '#3A2418');
    for (let k = 0; k < 5; k++) { // bocaux et livres sur l'étagère
      const bx = 70 + k * 14;
      rect(inL, bx, 286 - (k % 2) * 4, 9, 14 + (k % 2) * 4, ['#C9D6C8', '#E6D2B0', '#9FBFC0', '#D9B8A0', '#EDE3CF'][k], { rx: 1.5, opacity: 0.85 });
    }
    // macramé + plante
    const mac = S('g', { class: 'fa-macrame' }, inL);
    path(mac, 'M104 203V222M104 222L96 252M104 222L112 252M104 222L104 252', 'none', { stroke: '#EFE4D0', 'stroke-width': 0.9 });
    path(mac, 'M96 252Q104 262 112 252', 'none', { stroke: '#EFE4D0', 'stroke-width': 1.2 });
    S('ellipse', { cx: 104, cy: 255, rx: 9, ry: 5.5, fill: '#C88E61' }, mac);
    for (let k = 0; k < 7; k++) path(mac, `M104 252q${f((k - 3) * 3)} -8 ${f((k - 3) * 5)} -${f(8 + R() * 6)}`, 'none', { stroke: '#4E7A4A', 'stroke-width': 1.6, 'stroke-linecap': 'round' });
    for (let k = 0; k < 4; k++) path(mac, `M${100 + k * 3} 258q${f(-2 + R() * 4)} 10 ${f(-3 + R() * 6)} ${f(14 + R() * 10)}`, 'none', { stroke: '#5C8A55', 'stroke-width': 1.4, 'stroke-linecap': 'round' });
    // vinyle « HORAIRES » : le mot en lettres dorées, qui s'allument quand le reflet passe ; les jours en crème
    const vinL = S('g', { 'clip-path': `url(#${clipL})` }, vinyl);
    const hor = S('g', { class: 'fa-horaires', fill: '#F6F1E8', 'font-family': FONT_SERIF }, vinL);
    const GOLD = '#EBC877';
    const horGrad = S('linearGradient', { id: U('hg'), x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
    [[0, '#FFF1C4'], [0.5, '#FFFFFF'], [1, '#FFF1C4']].forEach(([o, c]) => S('stop', { offset: o, 'stop-color': c }, horGrad));
    S('ellipse', { cx: 104, cy: 313.5, rx: 34, ry: 8.5, fill: rad(defs, U('hh'), [[0, '#FFD98A', 0.32], [1, '#FFD98A', 0]]) }, hor);
    const MOT_HORAIRES = { x: 104, y: 317.5, 'text-anchor': 'middle', 'font-size': 9.4, 'font-weight': 700, 'letter-spacing': 0.5, stroke: '#3A2416', 'stroke-width': 0.45, 'paint-order': 'stroke', 'stroke-linejoin': 'round' };
    S('text', { ...MOT_HORAIRES, fill: GOLD }, hor).textContent = AC.t('HORAIRES');
    // sa copie allumée (blanc et or pâle), que le reflet découvre en passant (sortie sur un calque dans idle)
    const horLum = S('text', { ...MOT_HORAIRES, fill: `url(#${horGrad.id})`, stroke: 'none', opacity: 0 }, hor);
    horLum.textContent = AC.t('HORAIRES');
    ctx2d.font = `700 9.4px ${FONT_SERIF}`;
    const horW = ctx2d.measureText(AC.t('HORAIRES')).width + (AC.t('HORAIRES').length - 1) * 0.5;
    const sparkle = S('g', { transform: `translate(${f(104 + horW / 2 + 0.5)} 310.5)`, 'pointer-events': 'none' }, hor);
    const sparkleIn = S('g', { transform: 'scale(0)' }, sparkle);
    path(sparkleIn, 'M0 -3.4L.7 -.7L3.4 0L.7 .7L0 3.4L-.7 .7L-3.4 0L-.7 -.7Z', '#FFF8DC');
    rect(hor, 76, 321.5, 56, 0.5, GOLD);
    const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((j) => AC.t(j));
    const horRows = [];
    jours.forEach((j, i) => {
      const y = 328 + i * 5.2;
      const a = S('text', { x: 76, y, 'font-size': 3.5 }, hor);
      a.textContent = j;
      const t = S('text', { x: 132, y, 'font-size': 3.5, 'text-anchor': 'end' }, hor);
      horRows.push([a, t]);
    });
    rect(hor, 99, 324, 0.4, 36, '#F6F1E8');
    // autocollants (couleurs seulement)
    const stick = S('g', { class: 'fa-stickers' }, vinL);
    S('circle', { cx: 74, cy: 371, r: 5.4, fill: '#2E9BB5' }, stick);
    S('circle', { cx: 74, cy: 371, r: 3.8, fill: 'none', stroke: '#fff', 'stroke-width': 0.6 }, stick);
    rect(stick, 82, 364, 9, 12, '#E54B3C', { rx: 1 });
    rect(stick, 93, 366, 8, 10, '#F1E7C9', { rx: 1 });
    rect(stick, 94, 368, 6, 3, '#2E6FA8');
    rect(stick, 70, 379, 12, 5, '#3AA9D8', { rx: 1 });
    // reflet
    path(inL, 'M66 385L118 203L130 203L78 385Z', '#fff', { opacity: 0.07, class: 'fa-reflet' });

    // la porte entrouverte : la salle (vue par la vitre du vantail et par l'entrebâillement), toujours allumée
    const clipDoorP = S('path', {}, S('clipPath', { id: clipD }, defs));
    const inD = S('g', { 'clip-path': `url(#${clipD})`, class: 'fa-in fa-in-d' }, litDoor);
    rect(inD, 150, 196, 100, 224, lin(defs, U('rd'), [[0, '#5E3B2A'], [0.4, '#8C5E3B'], [1, '#6A4430']]));
    S('ellipse', { cx: 192, cy: 300, rx: 84, ry: 150, fill: rad(defs, U('gd'), [[0, '#FFE6B0', 0.95], [0.4, '#F4BC72', 0.6], [1, '#A5653A', 0]]), class: 'fa-glow' }, inD);
    // le sol : un parquet chaud, fuyant vers l'œil, et la flaque de lumière de la suspension
    rect(inD, 150, 418, 100, 50, lin(defs, U('fl'), [[0, '#8E5E38'], [1, '#C9925C']]));
    const lames = [];
    for (let xb = 146; xb <= 256; xb += 11) lames.push(`M${f(200 + (xb - 200) * 0.686)} 418L${f(xb)} 466`);
    path(inD, lames.join(''), 'none', { stroke: '#6E4526', 'stroke-width': 0.6, opacity: 0.55 });
    S('ellipse', { cx: 184, cy: 446, rx: 44, ry: 12, fill: rad(defs, U('fp'), [[0, '#FFF1D2', 0.8], [1, '#FFE2A8', 0]]) }, inD);
    // le comptoir au fond
    rect(inD, 150, 338, 100, 80, '#4A2E20');
    for (let xx = 158; xx < 250; xx += 16) rect(inD, xx, 346, 12, 64, 'none', { stroke: '#6A4630', 'stroke-width': 0.8 });
    rect(inD, 150, 338, 100, 80, lin(defs, U('cm'), [[0, '#FFD89A', 0.22], [1, '#FFD89A', 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    rect(inD, 148, 335, 104, 3.6, '#A57A56');
    rect(inD, 148, 335, 104, 1, '#D2AA80');
    // sur le comptoir : une cloche à gâteau, une pile de tasses
    path(inD, 'M212 335c0 -11 5 -16 11 -16s11 5 11 16z', '#E9F2F2', { opacity: 0.35 });
    path(inD, 'M215 335c0 -5 3 -7 8 -7s8 2 8 7z', '#6B3E24');
    path(inD, 'M221 319.5a2 2 0 0 1 4 0', 'none', { stroke: '#EDEFEF', 'stroke-width': 1 });
    path(inD, 'M214 330c1 -7 4 -10 8 -11', 'none', { stroke: '#fff', 'stroke-width': 0.8, opacity: 0.6 });
    [[168, 331], [169, 326.5], [168.5, 322]].forEach(([x, y]) => { path(inD, `M${x} ${y}h9l-1 4h-7z`, '#F6F1E7'); rect(inD, x - 1, y + 3.6, 11, 0.9, '#E2D8C6'); });
    // la suspension et son cône de lumière
    path(inD, 'M200 196V230', 'none', { stroke: '#2A1A12', 'stroke-width': 0.8 });
    path(inD, 'M187 240Q200 223 213 240Z', '#E7C391');
    path(inD, 'M187 240Q200 223 200 226Z', '#fff', { opacity: 0.25 });
    S('ellipse', { cx: 200, cy: 241, rx: 11, ry: 2.2, fill: '#FFF3D0' }, inD);
    path(inD, 'M189 241L213 241L246 440L154 440Z', lin(defs, U('cn'), [[0, '#FFF0C8', 0.28], [1, '#FFF0C8', 0]]));
    // une chaise bistrot en bois courbé, devant le comptoir (on la voit par l'entrebâillement)
    const bent = S('g', { class: 'fa-bentwood', fill: 'none', stroke: '#2A1710', 'stroke-width': 1.7, 'stroke-linecap': 'round' }, inD);
    path(bent, 'M160 455L162.5 420M176 455L173.5 420M162 440h12', null);
    path(bent, 'M161.5 420c-1 -12 -2 -24 1 -33c2 -7 11 -7 13 0c3 9 2 21 1 33', null);
    path(bent, 'M164.5 391c2 5 7 5 9 0M163.5 402c3 4 8 4 11 0', null, { 'stroke-width': 1.1 });
    S('ellipse', { cx: 168, cy: 420, rx: 10.5, ry: 2.8, fill: '#5A3824', stroke: '#2A1710', 'stroke-width': 1 }, bent);

    // posés sur le vantail : le vinyle de la vitre, la pancarte (ils suivent la porte)
    const clipGl = U('cgd');
    const glassClipP = S('path', {}, S('clipPath', { id: clipGl }, defs));
    const onGlassOut = S('g', { 'clip-path': `url(#${clipGl})`, class: 'fa-onglass', 'pointer-events': 'none' }, litDoor);
    const onGlass = S('g', {}, onGlassOut);
    LT.push([onGlass, 200, 280]);
    const vin = S('g', { class: 'fa-vinyle', fill: '#F7F2EA', 'font-family': FONT_SANS, 'text-anchor': 'middle', 'font-weight': 600 }, onGlass);
    S('text', { x: 200, y: 258, 'font-size': 4.6, 'letter-spacing': 0.3 }, vin).textContent = 'MINI BAR À CHOCOLAT';
    S('text', { x: 200, y: 268, 'font-size': 4.1 }, vin).textContent = 'CHOCOLATS CHAUDS';
    S('text', { x: 200, y: 274.5, 'font-size': 4.1 }, vin).textContent = 'PÂTISSERIES THÉ CAFÉ';
    // la pancarte, suspendue à une cordelette et à une ventouse
    const sign = S('g', { class: 'fa-doorsign' }, onGlass);
    S('circle', { cx: 200, cy: 280.5, r: 1.3, fill: '#D8D2C4' }, sign);
    path(sign, 'M189 288L200 281L211 288', 'none', { stroke: '#D9C9A8', 'stroke-width': 0.6 });
    rect(sign, 184, 288, 32, 14, '#F4ECDC', { rx: 1.6, stroke: '#8C6A4E', 'stroke-width': 0.7 });
    const signTxt = S('text', { x: 200, y: 298, 'text-anchor': 'middle', 'font-family': FONT_LETTRES, 'font-size': 7.6, fill: P.teal }, sign);
    signTxt.textContent = AC.t('OUVERT');
    path(onGlass, 'M172 356L214 210L226 210L184 356Z', '#fff', { opacity: 0.07, class: 'fa-reflet' });
    // le chant du vantail, éclairé par la salle
    const rim = path(litDoor, '', 'none', { stroke: '#FFD98E', 'stroke-width': 1.3, 'stroke-linecap': 'round', opacity: 0.75, 'pointer-events': 'none' });

    // imposte vitrée au-dessus de la porte
    const inT = S('g', { 'clip-path': `url(#${clipT})`, class: 'fa-in' }, lit);
    rect(inT, 150, 157, 100, 37, '#6E4630');
    S('ellipse', { cx: 200, cy: 190, rx: 60, ry: 26, fill: glowWarm, class: 'fa-glow' }, inT);
    path(inT, 'M154 160H246M200 160V191', 'none', { stroke: '#2A1B17', 'stroke-width': 2 });

    // vitre de droite : la vitrine réfrigérée, les gâteaux, les théières, les feuilles
    const inR = S('g', { 'clip-path': `url(#${clipR})`, class: 'fa-in fa-in-r' }, lit);
    rect(inR, 252, 200, 90, 190, roomGrad);
    S('ellipse', { cx: 296, cy: 250, rx: 70, ry: 70, fill: glowWarm, class: 'fa-glow' }, inR);
    // étagère haute : théière argentée et petits vases blancs
    rect(inR, 257, 236, 78, 2.5, '#2F1F17');
    const tp = S('g', { class: 'fa-teapot' }, inR);
    path(tp, 'M300 234c-9 0 -12 -6 -12 -11c0 -6 5 -9 12 -9s12 3 12 9c0 5 -3 11 -12 11z', lin(defs, U('tp'), [[0, '#EEF0F0'], [0.5, '#9CA3A6'], [1, '#5E6568']], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    path(tp, 'M288 222c-5 -1 -8 -5 -9 -9', 'none', { stroke: '#8E9598', 'stroke-width': 1.4 });
    path(tp, 'M312 219c4 0 6 3 5 7', 'none', { stroke: '#8E9598', 'stroke-width': 1.3 });
    S('ellipse', { cx: 300, cy: 214, rx: 3, ry: 1.4, fill: '#C9CED0' }, tp);
    rect(inR, 318, 222, 6, 12, '#F2EEE6', { rx: 2 });
    rect(inR, 326, 226, 5, 8, '#E9E4DA', { rx: 2 });
    rect(inR, 263, 226, 6, 8, '#EFE9DF', { rx: 2 });
    // la vitrine réfrigérée : verre, étagères, gâteaux entiers
    const vit = S('g', { class: 'fa-vitrine' }, inR);
    rect(vit, 259, 246, 74, 140, '#1C1411', { opacity: 0.5 });
    const cakes = [
      [270, 268, '#4A2A1C', '#2B170F', 'fondant'], [300, 268, '#F4EBDD', '#C9A67A', 'cheese'], [322, 268, '#E8C35F', '#C08A3B', 'tarte'],
      [272, 300, '#6B4128', '#3A2215', 'brownie'], [302, 300, '#C9905A', '#8A5A33', 'lait'], [324, 300, '#E9DCC4', '#8E5A3A', 'marbre'],
    ];
    cakes.forEach(([x, y, top, side, kind]) => {
      S('ellipse', { cx: x, cy: y + 9, rx: 12, ry: 2.2, fill: '#F2EEE8', opacity: 0.8 }, vit); // assiette
      if (kind === 'tarte') {
        path(vit, `M${x - 10} ${y + 8}h20l-2 -6h-16z`, '#C98C4E');
        for (let k = 0; k < 6; k++) S('circle', { cx: x - 7 + k * 2.8, cy: y + 1.5 - (k % 2), r: 1.8, fill: '#F7EFE0' }, vit);
      } else {
        rect(vit, x - 10, y - 2, 20, 10, side, { rx: 1.5 });
        rect(vit, x - 10, y - 2, 20, 3, top, { rx: 1.5 });
        if (kind === 'cheese') path(vit, `M${x - 3} ${y - 2}v6`, 'none', { stroke: '#C0394B', 'stroke-width': 1.6 });
      }
    });
    rect(vit, 259, 284, 74, 1.5, '#DDE6E6', { opacity: 0.6 });
    rect(vit, 259, 316, 74, 1.5, '#DDE6E6', { opacity: 0.6 });
    rect(vit, 259, 246, 74, 140, lin(defs, U('vg'), [[0, '#DDF1F1', 0.12], [1, '#DDF1F1', 0.02]]));
    // l'étiquette de la carte collée à la vitre
    rect(inR, 312, 206, 18, 24, '#FBF7F0', { rx: 0.8 });
    for (let k = 0; k < 6; k++) rect(inR, 315, 211 + k * 3, 12 - (k % 3) * 2, 0.8, '#8C7B70');
    path(inR, 'M258 385L308 203L318 203L268 385Z', '#fff', { opacity: 0.06, class: 'fa-reflet' });

    // les feuilles colorées de la vitrophanie (vectorisées depuis leur visuel de 2013 si disponible)
    const decal = S('g', { class: 'fa-decal' }, vinyl);
    drawDecal(decal, 283, 331, 56, R);

    // reflets du verre (au-dessus de tout l'intérieur) ; celui de la porte suit le vantail
    [[65, 203, 78, 182], [257, 203, 78, 182]].forEach(([x, y, w, h]) => {
      rect(glassFx, x, y, w, h, lin(defs, U('gl'), [[0, '#D5E4EC', 0.28], [0.35, '#D5E4EC', 0.06], [1, '#D5E4EC', 0.02]]));
    });
    const doorTint = path(glassFx, '', lin(defs, U('gl'), [[0, '#D5E4EC', 0.22], [0.35, '#D5E4EC', 0.05], [1, '#D5E4EC', 0.02]]));
    // le reflet qui passe, seulement sur les vitres (il fait briller le mot « HORAIRES » au passage)
    const clipGlass = U('cgl');
    const cgl = S('clipPath', { id: clipGlass }, defs);
    [[65, 203, 78, 182], [257, 203, 78, 182], [154, 160, 92, 31]].forEach(([x, y, w, h]) => S('rect', { x, y, width: w, height: h }, cgl));
    const sheenDoorP = S('path', {}, cgl);
    const sheen = S('g', { class: 'fa-sheen', 'clip-path': `url(#${clipGlass})` }, glassFx);
    const band = S('g', { transform: 'translate(-60 0)', opacity: 0 }, sheen);
    rect(band, 60, 150, 18, 260, '#fff', { opacity: 0.2, transform: 'skewX(-18)' });
    const glassQuad = () => quadD(165, 210, 70, 146);

    // la lumière de la porte : sur le trottoir, en halo autour de l'entrebâillement, et quelques poussières dorées
    const spillG = S('g', { style: 'mix-blend-mode: screen' }, spill);
    const spillP = path(spillG, '', lin(defs, U('sp'), [[0, '#FFD493', 0.9], [0.4, '#FFC878', 0.42], [1, '#FFC878', 0]]));
    const haloG = S('g', { class: 'fa-halo', style: 'mix-blend-mode: screen', 'pointer-events': 'none' }, life);
    const halo = S('ellipse', { cx: 166, cy: 330, rx: 30, ry: 165, fill: rad(defs, U('hl'), [[0, '#FFDCA4', 0.8], [0.5, '#FFC47A', 0.3], [1, '#FFC47A', 0]]) }, haloG);
    const motes = S('g', { class: 'fa-motes' }, haloG);
    const moteEls = [];
    for (let k = 0; k < 8; k++) {
      const inGap = k % 2 === 0;
      moteEls.push(S('circle', { cx: f(inGap ? 158 + R() * 14 : 128 + R() * 50), cy: f(inGap ? 370 + R() * 80 : 470 + R() * 50), r: f(0.5 + R() * 0.6), fill: '#FFF2CC', opacity: 0 }, motes));
    }
    let glowK = 1;
    let porte = null; // le vantail sur son calque 3D, une fois la vie ambiante lancée (voir porte3d)
    /** la lumière de la salle qui sort par l'entrebâillement : sur le trottoir, en halo, dans les poussières */
    function layoutLumiere() {
      const s = Math.sin(theta), L = s / Math.sin(WIDE); // la part de lumière qui sort : 0 fermée, 1 grande ouverte
      const lx = proj(155, 462)[0];
      spillP.setAttribute('d', theta > 0.02 ? `M154 463L${f(lx + 1)} 463L${f(lx - 8 + L * 10)} 545L${f(108 - L * 26)} 545Z` : '');
      spillG.setAttribute('opacity', Math.min(1, glowK * (0.2 + 0.8 * L) * (theta > 0.02 ? 1 : 0)).toFixed(3));
      halo.setAttribute('cx', f((155 + lx) / 2));
      halo.setAttribute('rx', f(22 + (lx - 155) * 1.05));
      const hk = Math.min(1, glowK * L).toFixed(3);
      halo.setAttribute('opacity', hk);
      if (motesLibres) moteEls.forEach((m) => m.setAttribute('opacity', hk));
    }
    /** la porte à l'angle theta : le vantail projeté point par point (tant qu'il est dans le dessin), et la lumière */
    function layoutDoor() {
      if (!porte) {
        LP.forEach(([el, fn]) => el.setAttribute('d', fn()));
        LT.forEach(([el, cx, cy]) => el.setAttribute('transform', affine(cx, cy)));
        leafShade.setAttribute('opacity', (0.04 + 0.3 * Math.sin(theta)).toFixed(3));
        const tl = proj(155, 200), bl = proj(155, 462);
        const glassQ = quadD(165, 210, 70, 146);
        clipDoorP.setAttribute('d', `M155 200H245L${f(tl[0])} ${f(tl[1])}L${f(bl[0])} ${f(bl[1])}L245 462H155Z` + glassQ);
        glassClipP.setAttribute('d', glassQ);
        sheenDoorP.setAttribute('d', glassQ);
        doorTint.setAttribute('d', glassQ);
        rim.setAttribute('d', theta > 0.02 ? `M${f(tl[0])} ${f(tl[1] + 1)}L${f(bl[0])} ${f(bl[1] - 1)}` : '');
        if (verre) verre.majClip();
      }
      layoutLumiere();
    }
    let motesLibres = false, verre = null, idleFait = false, idleAttend = false; // (voir idle : les calques)
    let swingId = 0, doorBusy = false;
    const COURBES = new Map([[AC.ease.inOutSine, 'cubic-bezier(.37,0,.63,1)'], [AC.ease.outBack, 'cubic-bezier(.34,1.56,.64,1)'], [AC.ease.outCubic, 'cubic-bezier(.33,1,.68,1)'], [AC.ease.linear, 'linear']]);
    const ombreDe = (th) => (0.04 + 0.3 * Math.sin(th)).toFixed(3);
    const tourne = (th) => `rotateY(${f((-th * 180) / Math.PI)}deg)`;
    async function swingTo(th, ms, ease = AC.ease.inOutSine) {
      const id = ++swingId, th0 = theta;
      if (porte) {
        // sur le compositeur : le vantail tourne sur ses gonds, son ombre suit ; la lumière du trottoir suit les grands gestes
        const T = { duration: AC.reduced ? 0 : Math.max(0, ms), easing: COURBES.get(ease) || 'ease-in-out' };
        const de = getComputedStyle(porte.boite).transform, deO = getComputedStyle(porte.ombre).opacity;
        porte.boite.getAnimations().forEach((a) => a.cancel());
        porte.boite.style.transform = tourne(th);
        porte.ombre.style.opacity = ombreDe(th);
        theta = th;
        if (!T.duration) { layoutLumiere(); return; }
        const a = AC.ambiance.joue(porte.boite.animate([{ transform: de && de !== 'none' ? de : tourne(th0) }, { transform: tourne(th) }], T), host);
        AC.ambiance.joue(porte.ombre.animate([{ opacity: deO }, { opacity: ombreDe(th) }], T), host);
        if (Math.abs(th - th0) > 0.2) AC.tween(ms, (e) => { if (id === swingId) { theta = th0 + (th - th0) * e; layoutLumiere(); } }, ease).then(() => { if (id === swingId) { theta = th; layoutLumiere(); } });
        await a.finished.catch(() => {});
        return;
      }
      if (AC.reduced || ms <= 0) { theta = th; layoutDoor(); return; }
      await AC.tween(ms, (e) => { if (id === swingId) { theta = th0 + (th - th0) * e; layoutDoor(); } }, ease);
    }
    function swingSign(amp) { // la pancarte se balance sur sa cordelette
      if (AC.reduced) return;
      const oscille = (e) => amp * Math.exp(-3.2 * e) * Math.sin(e * 15);
      if (porte) { // (sur sa couche, dans le vantail : le compositeur la balance)
        porte.signe.getAnimations().forEach((a) => a.cancel());
        const k = [];
        for (let i = 0; i <= 36; i++) k.push({ transform: `rotate(${f(oscille(i / 36))}deg)` });
        AC.ambiance.joue(porte.signe.animate(k, { duration: 1500 }), host);
        return;
      }
      AC.tween(1500, (e) => sign.setAttribute('transform', `rotate(${f(oscille(e))} 200 281)`));
    }
    layoutDoor();

    /* ---------- la corniche fleurie : branches, mousse, nichoirs (déco d'Henry le fleuriste) ---------- */
    const garland = S('g', { class: 'fa-garland' }, world);
    const backTw = S('g', { class: 'fa-twigs fa-twigs-back' }, garland);
    const moss = S('g', { class: 'fa-moss' }, garland);
    const twigs = S('g', { class: 'fa-twigs' }, garland);
    const flowers = S('g', { class: 'fa-flowers' }, garland);
    // une brindille ramifiée (deux niveaux), qui part de la corniche. Les brindilles fixes sont fusionnées
    // (un chemin par couleur et par épaisseur : peu d'éléments pour le téléphone) ; celles qui se balancent
    // sont regroupées dans un <g> avec leurs rameaux.
    const merged = new Map(), pivots = new Map();
    function segs(out, x0, y0, len, ang, wid, col, depth) {
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      const bend = (R() - 0.5) * len * 0.35;
      const mx = (x0 + x1) / 2 - Math.sin(ang) * bend, my = (y0 + y1) / 2 + Math.cos(ang) * bend;
      out.push([col, Math.round(wid * 4) / 4, `M${f(x0)} ${f(y0)}Q${f(mx)} ${f(my)} ${f(x1)} ${f(y1)}`]);
      if (depth < 2) {
        const n = 1 + Math.floor(R() * (depth ? 2 : 3));
        for (let k = 0; k < n; k++) {
          const t = 0.35 + R() * 0.55, u = 1 - t;
          const bx = u * u * x0 + 2 * u * t * mx + t * t * x1, by = u * u * y0 + 2 * u * t * my + t * t * y1;
          segs(out, bx, by, len * (0.28 + R() * 0.3), ang + (R() > 0.5 ? 1 : -1) * (0.35 + R() * 0.6), wid * 0.62, col, depth + 1);
        }
      }
    }
    function twig(par, x0, y0, len, ang, wid, col, sway = false) {
      const out = [];
      segs(out, x0, y0, len, ang, wid, col, 0);
      if (sway) {
        const g = S('g', { class: 'fa-twig' }, par);
        pivots.set(g, [f(x0), f(y0)]); // elle se balance autour de son pied (voir idle)
        out.forEach(([c, w, d]) => path(g, d, 'none', { stroke: c, 'stroke-width': w, 'stroke-linecap': 'round' }));
        return g;
      }
      out.forEach(([c, w, d]) => {
        const k = par === backTw ? 'b' : 'f';
        const key = k + c + '|' + w;
        if (!merged.has(key)) merged.set(key, { par, c, w, d: [] });
        merged.get(key).d.push(d);
      });
      return null;
    }
    const flushTwigs = () => merged.forEach(({ par, c, w, d }) => path(par, d.join(''), 'none', { stroke: c, 'stroke-width': w, 'stroke-linecap': 'round' }));
    const twigCols = ['#6B5A4A', '#7E6B58', '#5B4B3E', '#8C7A66', '#9A8C7C'];
    // derrière : de longues branches qui montent et débordent (le volume de la couronne)
    for (let i = 0; i < 46; i++) {
      const x0 = 10 + R() * 380, y0 = 76 + R() * 4;
      const up = -Math.PI / 2 + (R() - 0.5) * 2.1;
      twig(backTw, x0, y0, 16 + R() * 30, up, 0.9 + R() * 1.1, R() > 0.5 ? '#8E7F6E' : '#77685A');
    }
    // lichen et mousse : un bourrelet continu, bosselé, dans plusieurs verts
    const mossCols = ['#7D8A52', '#98A36A', '#6A7644', '#B4BB8E', '#A7B08A', '#5E6A3D'];
    const mb = bucket();
    for (let i = 0; i < 120; i++) {
      const x = 8 + R() * 384, y = 70 + R() * 12 - (R() > 0.8 ? 6 : 0);
      const rx = 3 + R() * 6, ry = 2 + R() * 3.4;
      mb.add(mossCols[Math.floor(R() * mossCols.length)], dEll(x, y, rx, ry));
    }
    for (let i = 0; i < 60; i++) { // lichen pâle en petites grappes
      const x = 8 + R() * 384, y = 66 + R() * 14;
      for (let k = 0; k < 4; k++) mb.add(R() > 0.5 ? '#C9D0B2' : '#DADFC8', dDisc(x + (R() - 0.5) * 5, y + (R() - 0.5) * 3, 0.8 + R() * 1.2));
    }
    mb.flush(moss);
    // devant : brindilles plus fines, dans tous les sens, quelques-unes qui pendent sur l'enseigne
    for (let i = 0; i < 70; i++) {
      const x0 = 8 + R() * 384, y0 = 72 + R() * 8;
      const hang = R() > 0.82;
      const ang = hang ? Math.PI / 2 + (R() - 0.5) * 0.9 : (R() > 0.5 ? 0 : Math.PI) + (R() - 0.5) * 1.2 - 0.35;
      twig(twigs, x0, y0, hang ? 10 + R() * 18 : 14 + R() * 30, ang, 0.7 + R() * 0.9, twigCols[Math.floor(R() * twigCols.length)], i % 4 === 0);
    }
    flushTwigs();
    // fleurs séchées : grappes de statice mauve, gypsophile blanche, quelques touches roses et ocre
    const flCols = ['#8B6BA8', '#A48ABF', '#F2EEE6', '#E7E1D6', '#D9A3B4', '#C9A45C', '#A8B6C8'];
    const fb = bucket();
    for (let i = 0; i < 34; i++) {
      const x = 12 + R() * 376, y = 52 + R() * 26;
      const col = flCols[Math.floor(R() * flCols.length)];
      const n = 5 + Math.floor(R() * 8);
      for (let k = 0; k < n; k++) fb.add(col, dDisc(x + (R() - 0.5) * 7, y + (R() - 0.5) * 5, 0.7 + R() * 1.1));
    }
    // à droite, une cascade de glycine séchée (mauve) qui pend près de l'enseigne drapeau
    for (let k = 0; k < 5; k++) {
      const x = 360 + k * 6 + R() * 3, len = 14 + R() * 16;
      for (let j = 0; j < len; j += 2.2) fb.add(j % 4 < 2 ? '#9C7CB8' : '#B59BCB', dDisc(x + Math.sin(j * 0.4) * 1.2, 78 + j, 1.6 - j / (len * 1.4)));
    }
    fb.flush(flowers, { opacity: 0.95 });
    // nichoirs (trois, comme sur leur corniche) : gris-bleu, blanc, gris vert
    const houses = [];
    [[137, 44, 1.25, '#BFC9CE', '#7E8A91'], [199, 34, 1.4, '#ECE9E2', '#8C8C86'], [258, 45, 1.2, '#C8D0CF', '#6F7B80']].forEach(([x, y, s, body, roof]) => {
      const gh = S('g', { class: 'fa-house', transform: `translate(${x} ${y}) scale(${s})` }, garland);
      const inner = S('g', { class: 'fa-house-in' }, gh);
      path(inner, 'M-8 2V24H8V2Z', body);
      path(inner, 'M4 2V24H8V2Z', '#000', { opacity: 0.13 });
      for (let k = 0; k < 3; k++) path(inner, `M-8 ${8 + k * 6}H8`, 'none', { stroke: '#000', 'stroke-width': 0.3, opacity: 0.12 });
      path(inner, 'M-11.5 3.8L0 -9L11.5 3.8L9.8 5.4L0 -5.8L-9.8 5.4Z', roof);
      path(inner, 'M-11.5 3.8L0 -9L0 -5.8L-9.8 5.4Z', '#fff', { opacity: 0.16 });
      S('circle', { cx: 0, cy: 10, r: 3.3, fill: '#241E1B' }, inner);
      path(inner, 'M-3.3 10A3.3 3.3 0 0 1 3.3 10', 'none', { stroke: '#fff', 'stroke-width': 0.5, opacity: 0.35 });
      rect(inner, -0.6, 15.5, 1.2, 4.2, '#6B5A4A');
      rect(inner, -3.6, 16, 7.2, 1.1, '#6B5A4A');
      houses.push({ g: gh, inner, x, y, s, hole: [x, y + 10 * s] });
    });

    /* ---------- l'enseigne drapeau (plaque blanche, cuillères dessinées) ---------- */
    const flag = S('g', { class: 'fa-flag' }, world);
    path(flag, 'M404 30H330', 'none', { stroke: '#1E1B19', 'stroke-width': 2.4 });
    path(flag, 'M404 44C380 44 366 38 352 31', 'none', { stroke: '#1E1B19', 'stroke-width': 1.4 });
    path(flag, 'M392 30c0 -6 -6 -8 -9 -5', 'none', { stroke: '#1E1B19', 'stroke-width': 1.2 });
    const plaqueG = S('g', { class: 'fa-plaque' }, flag);
    plaqueG.style.transformOrigin = '366px 30px';
    // la plaque en gris anthracite : elle se détache du mur clair ; lettres et cuillères au trait crème
    const PLQ = '#35373B';
    path(plaqueG, 'M338 30V36M394 30V36', 'none', { stroke: '#1E1B19', 'stroke-width': 1 });
    rect(plaqueG, 337.2, 37.4, 60, 74, '#000', { opacity: 0.18 }); // ombre sur le mur
    rect(plaqueG, 336, 36, 60, 74, PLQ, { stroke: '#1C1D20', 'stroke-width': 0.9 });
    rect(plaqueG, 338.2, 38.2, 55.6, 69.6, 'none', { stroke: '#9A9DA3', 'stroke-width': 0.45, opacity: 0.55 });
    rect(plaqueG, 336, 36, 60, 74, lin(defs, U('pq'), [[0, '#fff', 0.13], [0.5, '#fff', 0.02], [1, '#000', 0.12]], { x1: 0, y1: 0, x2: 1, y2: 1 }));
    const pqTxt = S('g', { 'font-family': FONT_LETTRES, fill: P.cream, 'text-anchor': 'middle' }, plaqueG);
    S('text', { x: 366, y: 49, 'font-size': 8.4 }, pqTxt).textContent = "L'ARMOIRE";
    S('text', { x: 366, y: 58, 'font-size': 8.4 }, pqTxt).textContent = 'À CUILLÈRES';
    const spoonsG = S('g', { class: 'fa-plaque-spoons' }, plaqueG);
    drawSpoonRow(spoonsG, 341, 62, 50, 36, { fond: PLQ, trait: '#EFE7DA' });
    S('text', { x: 366, y: 106, 'font-size': 5, 'text-anchor': 'middle', 'font-family': FONT_SANS, 'font-weight': 700, fill: P.tealLogo, 'letter-spacing': 0.4 }, plaqueG).textContent = 'BAR À CHOCOLAT';

    /* ---------- la rue : pavés, terrasse, fleurs, ardoise ---------- */
    const street = S('g', { class: 'fa-street' }, world);
    rect(street, -400, 468, 1200, 120, P.paveDark);
    const rows = [[470, 7, 13], [478, 8, 15], [487, 10, 17], [498, 12, 20], [511, 14, 23], [526, 17, 27], [544, 20, 31], [565, 22, 35]];
    const rowShades = [];
    const paveCols = ['#6F767D', '#7C8389', '#666D74', '#858B90', '#737A80', '#5F666D', '#8A8680', '#7A756F'];
    const pb = bucket();
    rows.forEach(([y, h, w], ri) => {
      const off = (ri % 2) * w * 0.5 + R() * 4;
      const shade = [];
      for (let x = -140 - off; x < 540; x += w * (0.85 + R() * 0.3)) {
        const ww = w * (0.78 + R() * 0.2), hh = h - 1.2 - R() * 1.2;
        const d = dRR(x + 0.8, y + 0.6, ww, hh, Math.min(ww, hh) * 0.42);
        pb.add(paveCols[Math.floor(R() * paveCols.length)], d);
        shade.push(d);
      }
      // l'ombrage bombé de la rangée : un dégradé dans le repère de la rangée
      const gid = U('pr');
      const gr = S('linearGradient', { id: gid, x1: 0, y1: y + 0.6, x2: 0, y2: y + h - 0.6, gradientUnits: 'userSpaceOnUse' }, defs);
      [[0, '#fff', 0.14], [0.35, '#fff', 0.02], [0.7, '#000', 0], [1, '#000', 0.22]].forEach(([o, c, a]) => S('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }, gr));
      rowShades.push([shade.join(''), `url(#${gid})`]);
    });
    pb.flush(street);
    rowShades.forEach(([d, fill]) => S('path', { d, fill }, street));
    // la rue s'enfonce : plus sombre au loin (en haut), plus clair devant
    rect(street, -400, 468, 1200, 110, lin(defs, U('sd'), [[0, '#2A2A2E', 0.35], [0.4, '#2A2A2E', 0.08], [1, '#2A2A2E', 0]]));
    // ombre de la devanture sur le trottoir (la rue est étroite)
    rect(street, -400, 468, 1200, 16, lin(defs, U('st'), [[0, '#000', 0.28], [1, '#000', 0]]));

    // ardoise « pâtisseries du jour », devant la vitrine de gauche
    const slate = S('g', { class: 'fa-slate', tabindex: -1 }, front);
    path(slate, 'M88 520L100 432M142 520L130 432', 'none', { stroke: '#8A5E3B', 'stroke-width': 3, 'stroke-linecap': 'round' });
    rect(slate, 92, 430, 46, 64, '#B98A5C', { rx: 1.5 });
    rect(slate, 95.5, 433.5, 39, 57, '#262826');
    rect(slate, 95.5, 433.5, 39, 57, lin(defs, U('sl'), [[0, '#fff', 0.06], [1, '#fff', 0]], { x1: 0, y1: 0, x2: 1, y2: 1 }));
    const chalk = S('g', { class: 'fa-chalk', fill: '#F1EFEA', 'font-family': FONT_LETTRES, 'text-anchor': 'middle' }, slate);
    S('text', { x: 115, y: 442, 'font-size': 4.6 }, chalk).textContent = AC.t('PÂTISSERIES');
    S('text', { x: 115, y: 447.5, 'font-size': 4.6 }, chalk).textContent = AC.t('DU JOUR');
    const chalkItems = [];
    (AC.ARDOISE ? AC.ARDOISE.items.slice(0, 6) : []).forEach((it, i) => {
      const t = S('text', { x: 98, y: 455 + i * 5.6, 'font-size': 3, 'text-anchor': 'start', 'font-family': FONT_SANS }, chalk);
      t.textContent = '♡ ' + it.nom.replace('pépites de chocolat', 'pépites').replace('pointe de sel', 'p. de sel');
      chalkItems.push(t);
    });
    rect(slate, 95.5, 433.5, 39, 57, 'none', { stroke: '#fff', 'stroke-width': 0.4, opacity: 0.25 });

    // terrasse gauche, au premier plan (plus grande et plus bas : elle donne la profondeur) :
    // table pliante menthe, chaise, la tasse de chocolat qui fume
    const FG = 'translate(-28.8 -302) scale(1.6)';
    const avantPlan = S('g', { transform: FG }, front);
    const terrL = S('g', { class: 'fa-terr-l' }, avantPlan);
    chair(terrL, 38, 470, P.mint, P.mintDark, false, defs);
    const tableL = table(terrL, 6, 490, 74, P.mint, P.mintDark);
    const cup = S('g', { class: 'fa-cup', transform: 'translate(18 0)' }, terrL); // la tasse, au milieu de la table
    S('ellipse', { cx: 30, cy: 489, rx: 11, ry: 3.4, fill: '#F4F0E8' }, cup);
    S('ellipse', { cx: 30, cy: 489, rx: 8, ry: 2.3, fill: '#E4DDD2' }, cup);
    path(cup, 'M23.5 480.5h13l-1.3 7.5c-.3 1.4 -1.5 2.2 -2.9 2.2h-4.6c-1.4 0 -2.6 -.8 -2.9 -2.2z', '#FBF8F2');
    path(cup, 'M36.2 482.4c3 -.4 4.2 1.8 2.8 3.5c-.8 1 -2 1.2 -3.3 1', 'none', { stroke: '#FBF8F2', 'stroke-width': 1.1 });
    S('ellipse', { cx: 30, cy: 480.6, rx: 6.5, ry: 1.7, fill: '#4B2C1B' }, cup);
    S('ellipse', { cx: 29, cy: 480.3, rx: 3, ry: 0.6, fill: '#8A5C40', opacity: 0.6 }, cup);
    path(cup, 'M25 484.5q5 1.4 10 0', 'none', { stroke: '#6AB8C6', 'stroke-width': 0.8, opacity: 0.8 });
    S('ellipse', { cx: 24, cy: 488, rx: 9, ry: 2.8, fill: '#F0E9DD' }, terrL); // la carte posée
    rect(terrL, 17, 483, 14, 9, '#FBF7EF', { transform: 'rotate(-12 24 487)' });
    const steam = S('g', { class: 'fa-steam', 'pointer-events': 'none', transform: 'translate(18 0)' }, S('g', { transform: FG }, life));
    for (let k = 0; k < 3; k++) {
      const w = path(steam, `M${28 + k * 2.2} 478c-3 -5 3 -8 0 -13s3 -8 0 -13`, 'none', { stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0, class: 'fa-wisp' });
      w.style.transformBox = 'fill-box';
    }

    // terrasse droite : chaise vieux rose, table moutarde
    const terrR = S('g', { class: 'fa-terr-r' }, front);
    chair(terrR, 369, 472, P.pink, P.pinkDark, true, defs);
    table(terrR, 392, 496, 80, P.yellow, P.yellowDark);
    S('ellipse', { cx: 412, cy: 494, rx: 7, ry: 2.2, fill: '#F4F0E8' }, terrR);
    rect(terrR, 408.5, 484, 7, 10, '#EEF3F3', { rx: 1, opacity: 0.8 }); // verre d'eau
    rect(terrR, 409, 488, 6, 5.5, '#CFE3E6', { opacity: 0.7 });

    // les fleurs, au pied de la vitrine de droite : des tulipes dans un seau en zinc, des marguerites
    // dans un panier, un buis en boule dans son pot. Les plantes se balancent autour de leur pied.
    const fl = S('g', { class: 'fa-pots' }, front);
    const potsSway = [];
    const plante = (x, y) => {
      const g = S('g', { class: 'fa-plante' }, fl);
      g.style.transformOrigin = `${x}px ${y}px`;
      g.pied = [x, y];
      potsSway.push(g);
      return g;
    };
    const ombres = [[269, 479, 14], [301, 481, 17], [332, 480, 11]].map(([x, y, r]) => dEll(x, y, r, 2.4)).join('');
    path(fl, ombres, '#000', { opacity: 0.28 });
    // 1) le seau en zinc et ses tulipes
    const tul = plante(269, 460);
    [['M264 460q-8 -9 -11 -27q7 9 13 26z', '#5C9A50'], ['M274 460q9 -8 13 -24q-8 8 -15 23z', '#4F8A45'], ['M267 460q-3 -12 1 -30q2 14 1 30z', '#6AA85C'], ['M272 460q5 -10 4 -26q-5 12 -6 26z', '#5C9A50']].forEach(([d, c]) => path(tul, d, c));
    const tb = bucket(), tiges = [];
    [[261, 431], [265, 425], [269, 421], [273, 424], [277, 429], [263.5, 437], [275, 435]].forEach(([x, y], k) => {
      tiges.push(`M${f(266 + k * 0.6)} 460Q${f((266 + x) / 2)} ${f(y + 16)} ${f(x)} ${f(y + 1)}`);
      tb.add(['#E97CA0', '#F4A9C0', '#D94F7C'][k % 3], `M${f(x - 2.7)} ${f(y + 1)}q-.4 -5.6 .9 -7.2l1.8 2l1.8 -2q1.3 1.6 .9 7.2q-2.7 2.2 -5.4 0z`);
    });
    path(tul, tiges.join(''), 'none', { stroke: '#4F8A45', 'stroke-width': 1.1 });
    tb.flush(tul);
    const contenants = [];
    const contenant = () => { const g = S('g', { class: 'fa-contenant' }, fl); contenants.push(g); return g; };
    const zinc = lin(defs, U('zn'), [[0, '#7F8A91'], [0.3, '#B9C3C8'], [0.6, '#8E989F'], [1, '#6B757C']], { x1: 0, y1: 0, x2: 1, y2: 0 });
    const seau = contenant();
    path(seau, 'M258 460h22l-2.3 19h-17.4z', zinc);
    path(seau, 'M258.8 466.5h20.4M259.5 472.5h19', 'none', { stroke: '#667077', 'stroke-width': 0.9 });
    path(seau, 'M258.8 467.4h20.4M259.5 473.4h19', 'none', { stroke: '#D5DCE0', 'stroke-width': 0.5, opacity: 0.7 });
    rect(seau, 257.3, 458.6, 23.4, 2.4, '#C7CFD4', { rx: 1 });
    path(seau, 'M258.4 462.5a1.6 1.6 0 1 1 0 -.1M279.6 462.5a1.6 1.6 0 1 0 0 -.1', 'none', { stroke: '#8E989F', 'stroke-width': 0.8 });
    // 2) le panier et ses marguerites
    const mar = plante(301, 463);
    const fb2 = bucket();
    for (let k = 0; k < 9; k++) fb2.add(k % 2 ? '#557F45' : '#6C9A56', dEll(289 + k * 3.1, 461 - (k % 3) * 1.6, 3.4, 2.6));
    fb2.flush(mar);
    const tigesM = [], petales = [], coeurs = [];
    [[291, 452], [296, 446], [301, 443], [306, 447], [311, 452], [293.5, 440], [304, 438], [309, 442], [298.5, 450], [289, 445], [313, 446]].forEach(([x, y]) => {
      tigesM.push(`M${f(301 + (x - 301) * 0.4)} 462Q${f(x)} ${f(y + 8)} ${f(x)} ${f(y)}`);
      for (let p = 0; p < 9; p++) {
        const a = (p / 9) * AC.TAU, c = Math.cos(a), s = Math.sin(a);
        const px = x + c * 3, py = y + s * 1.7; // la fleur vue un peu de face
        petales.push(`M${f(x + c * 0.8)} ${f(y + s * 0.5)}Q${f(x + c * 2 - s * 0.9)} ${f(y + s * 1.2 + c * 0.5)} ${f(px)} ${f(py)}Q${f(x + c * 2 + s * 0.9)} ${f(y + s * 1.2 - c * 0.5)} ${f(x + c * 0.8)} ${f(y + s * 0.5)}Z`);
      }
      coeurs.push(dEll(x, y, 1.1, 0.8));
    });
    path(mar, tigesM.join(''), 'none', { stroke: '#5E8F4A', 'stroke-width': 0.8 });
    path(mar, petales.join(''), '#FBF9F3');
    path(mar, coeurs.join(''), '#E9B92C');
    const panier = contenant();
    path(panier, 'M286 463h30l-2.6 17h-24.8z', '#C8A06A');
    const tresse = [];
    for (let k = 0; k < 5; k++) tresse.push(`M${f(286.4 + k * 0.5)} ${f(466 + k * 3.2)}h${f(29.2 - k)}`);
    path(panier, tresse.join(''), 'none', { stroke: '#A8814F', 'stroke-width': 1.2, 'stroke-dasharray': '2.2 1.2' });
    path(panier, 'M289 463l1 17M295 463l.5 17M301 463v17M307 463l-.5 17M313 463l-1 17', 'none', { stroke: '#B08754', 'stroke-width': 0.6 });
    rect(panier, 285.2, 461.4, 31.6, 3, '#B58A55', { rx: 1.4 });
    path(panier, 'M289 461.6c4 -1.6 8 1.2 12 0s8 -1.6 12 0', 'none', { stroke: '#8FA4D6', 'stroke-width': 1.6, opacity: 0.9 }); // le torchon à carreaux bleus
    // 3) le buis en boule
    const buis = plante(332, 463);
    S('rect', { x: 331.2, y: 459, width: 1.6, height: 5, fill: '#6B4B2E' }, buis);
    S('circle', { cx: 332, cy: 450, r: 10.5, fill: '#44703A' }, buis);
    const bb2 = bucket();
    for (let k = 0; k < 44; k++) {
      const a = R() * AC.TAU, r = Math.sqrt(R()) * 9.6, x = 332 + Math.cos(a) * r, y = 450 + Math.sin(a) * r;
      const lum = (332 - x) * 0.6 + (450 - y) - R() * 3; // éclairé en haut à gauche
      bb2.add(lum > 2 ? '#7BAA5E' : lum > -3 ? '#5E8E4A' : '#335A2C', dDisc(x, y, 0.9 + R() * 0.9));
    }
    bb2.flush(buis);
    const pot = contenant();
    path(pot, 'M324.5 464h15l-1.7 15h-11.6z', '#B5653F');
    path(pot, 'M324.5 464h4l-.5 15h-1.8z', '#fff', { opacity: 0.12 });
    rect(pot, 323.4, 462, 17.2, 3.4, '#C87A52', { rx: 0.8 });
    rect(pot, 323.4, 465, 17.2, 0.8, '#000', { opacity: 0.18 });

    /* ---------- les oiseaux : une mésange bleue, une charbonnière, un moineau ; ils entrent et sortent des nichoirs ---------- */
    const PLUMES = [
      { ventre: '#F2CF3B', dos: '#5E9CBF', queue: '#2F6FA0', aile: '#3F84BD', joue: '#FBFBF7', calotte: '#3F84BD', bandeau: '#1F2E4A' },
      { ventre: '#EBC43A', dos: '#6E8A55', queue: '#3E4A52', aile: '#55697A', joue: '#FBFBF7', calotte: '#1D1D22', bandeau: '#1D1D22', cravate: '#1D1D22' },
      { ventre: '#D2C9BA', dos: '#8B6445', queue: '#5E4330', aile: '#7A5438', joue: '#ECE6D9', calotte: '#8E8E8A', bavette: '#26221F', stries: '#4A3322' },
    ];
    function makeBird(c) {
      const b = S('g', { class: 'fa-bird', opacity: 0 }, life);
      const body = S('g', { class: 'fa-bird-body' }, b);
      path(body, 'M-5 1.5c0 -3.2 2.6 -5 5.4 -5c2.6 0 4.2 1.6 4.2 3.8c0 3 -2.4 5.2 -5.8 5.2c-2.2 0 -3.8 -1.4 -3.8 -4z', c.ventre); // ventre
      if (c.cravate) path(body, 'M2.4 -1.2c.6 1.8 .5 4 -.5 6.1', 'none', { stroke: c.cravate, 'stroke-width': 1.3, 'stroke-linecap': 'round' });
      path(body, 'M-5.5 0.5c.4 -3.4 3 -5.6 6.2 -5.4c-2.6 1.4 -3.6 3.6 -3.4 6.8z', c.dos); // dos
      if (c.stries) path(body, 'M-4.2 -1.4l1.8 -.7M-3.4 .4l1.8 -.7M-2.2 -3l1.6 -.6', 'none', { stroke: c.stries, 'stroke-width': 0.6, 'stroke-linecap': 'round' });
      path(body, 'M-5.2 1l-5.2 -1.6l.6 2.8z', c.queue); // queue
      const wing = path(body, 'M-3.6 -1.2c2.4 -1 5 -.4 6 1.4c-2.2 1.2 -4.8 1.2 -6.8 .2z', c.aile, { class: 'fa-wing' });
      wing.style.transformBox = 'fill-box';
      wing.style.transformOrigin = '20% 50%';
      const head = S('g', { class: 'fa-bird-head' }, body);
      S('circle', { cx: 3.4, cy: -3.8, r: 2.9, fill: c.joue }, head);
      path(head, 'M1 -5.4c.6 -1.6 2 -2.4 3.6 -2.2c1.4 .2 2.2 1 2.4 2c-1.8 -.6 -4 -.6 -6 .2z', c.calotte); // calotte
      if (c.bandeau) path(head, 'M1.2 -3.6h5.2', 'none', { stroke: c.bandeau, 'stroke-width': 0.8 }); // bandeau
      if (c.bavette) path(head, 'M4.4 -1.8c.9 .5 1.4 1.4 1.2 2.4c-.9 -.2 -1.5 -.9 -1.7 -1.7z', c.bavette);
      S('circle', { cx: 4.2, cy: -3.7, r: 0.7, fill: '#111' }, head);
      path(head, 'M6.2 -3.6l1.6 .5l-1.6 .5z', '#3A3A3A');
      path(b, 'M-0.6 4.6v2M1 4.6v2', 'none', { stroke: '#5A4A3A', 'stroke-width': 0.5, class: 'fa-legs' });
      return { g: b, wing, head, body, busy: false, maison: -1, flap: null, c: null };
    }
    const corpsDe = (b) => (b.c ? b.c.boite : b.g); // l'oiseau sur son calque (voir enCalque), sinon dans le dessin
    const birds = PLUMES.map(makeBird);
    birds[0].maison = 1; // au début, deux sont chez eux (le nichoir du milieu, celui de droite), le moineau est dehors
    birds[1].maison = 2;

    /* ---------- la vie des nichoirs : sortir, s'envoler ; arriver, se poser, rentrer ---------- */
    const BS = 1.6; // les oiseaux, un peu plus grands que nature pour qu'on les voie sur un téléphone
    const poseB = (x, y, dir, k = 1, r = 0) => `translate(${f(x)}px, ${f(y)}px) scale(${(dir * k * BS).toFixed(3)}, ${(k * BS).toFixed(3)}) rotate(${f(r)}deg)`;
    const trou = (h) => [h.x, h.y + 10 * h.s];
    const perchoir = (h) => [h.x, h.y + 16 * h.s - 6.6 * BS]; // debout sur le bâton, sous le trou
    const PERCHES = [[366, 34], [296, 168], [84, 474]];
    const reserve = houses.map(() => false); // un oiseau y entre ou en sort
    const loin = (dir) => [dir > 0 ? 500 : -100, 6 + Math.random() * 60]; // hors champ, même quand on voit un peu plus de rue
    const piou = (n, o = {}) => AC.sfx && AC.sfx.play(n, o);
    let piafsCalques = false; // (idle : les oiseaux passent sur leurs calques)
    /** L'oiseau sur son calque : une enveloppe qui vole (son origine : celle de l'oiseau, au coin du dessin) ; dedans, son
        corps, puis son aile et sa tête chacune sur sa couche : leurs gestes (battre des ailes, regarder) sont joués par
        le compositeur, comme le vol. (Un oiseau en plein geste quand la devanture passe en calques y passe à son
        prochain départ : voir depart) */
    function enCalque(b) {
      if (b.c) return;
      b.g.getAnimations().forEach((a) => a.cancel());
      if (b.flap) { AC.ambiance.lache(b.flap); b.flap.cancel(); b.flap = null; }
      b.g.removeAttribute('opacity');
      b.g.style.opacity = '';
      const c = (b.c = monde.calque(b.g, { marge: 3, enveloppe: true }));
      c.boite.style.transformOrigin = `${f(-c.x)}px ${f(-c.y)}px`;
      c.boite.style.opacity = 0;
      const couche = (el, [ox, oy]) => {
        const v = AC.svg('svg', { class: 'ac-dedans', viewBox: `${c.x} ${c.y} ${c.w} ${c.h}`, width: c.w, height: c.h, 'aria-hidden': 'true' }, c.boite);
        Object.assign(v.style, { position: 'absolute', left: '0px', top: '0px', overflow: 'visible', maxWidth: 'none', transformOrigin: `${f(ox - c.x)}px ${f(oy - c.y)}px` });
        // (ses parents dans le calque, en coquilles : leurs attributs, sauf l'opacité — c'est l'enveloppe qui montre l'oiseau)
        const chaine = [];
        for (let n = el.parentNode; n && n !== c.svg; n = n.parentNode) chaine.unshift(n);
        let dans = v;
        chaine.forEach((q) => {
          const g = AC.svg('g', null, dans);
          [...q.attributes].forEach((at) => { if (at.name !== 'id' && at.name !== 'opacity') g.setAttribute(at.name, at.value); });
          dans = g;
        });
        dans.appendChild(el);
        return v;
      };
      const bb = b.wing.getBBox(); // (l'aile bat autour de son attache : 20 % de sa largeur, à mi-hauteur)
      b.aile = couche(b.wing, [bb.x + bb.width * 0.2, bb.y + bb.height / 2]);
      b.tete = couche(b.head, [0, 0]); // (la tête tourne autour du centre de l'oiseau)
    }
    function battre(b, on) {
      if (!b.flap) b.flap = (b.aile || b.wing).animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-60deg) scaleY(1.3)' }], { duration: 90, direction: 'alternate', iterations: Infinity });
      // (pendant le vol, l'ambiance la suspend si la devanture ne se voit plus ; posé, l'oiseau ne bat plus des ailes)
      if (on) { b.flap.play(); AC.ambiance.joue(b.flap, host); } else { AC.ambiance.lache(b.flap); b.flap.pause(); b.flap.currentTime = 0; }
    }
    // (les gestes des oiseaux passent par l'ambiance : quittée en plein vol, la devanture les suspend, et ils reprennent au retour)
    const geste = (a) => AC.ambiance.joue(a, host);
    const regarde = (b) => geste((b.tete || b.head).animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(10deg)' }, { transform: 'rotate(0)' }], { duration: 900 })).finished;
    function vol(b, from, to, dir, ms, haut = 40) {
      const [x0, y0] = from, [x1, y1] = to;
      const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - haut;
      const steps = [];
      for (let k = 0; k <= 14; k++) {
        const t = k / 14, u = 1 - t;
        steps.push({ transform: poseB(u * u * x0 + 2 * u * t * mx + t * t * x1, u * u * y0 + 2 * u * t * my + t * t * y1, dir, 1, (t - 0.5) * -18) });
      }
      return geste(corpsDe(b).animate(steps, { duration: ms, fill: 'forwards', easing: 'ease-in-out' })).finished;
    }
    const pose = (b, kf, ms, easing = 'ease-in-out') => geste(corpsDe(b).animate(kf, { duration: ms, fill: 'forwards', easing })).finished;
    const depart = (b) => {
      if (piafsCalques) enCalque(b);
      corpsDe(b).getAnimations().forEach((a) => a.cancel());
      b.g.removeAttribute('opacity');
      corpsDe(b).style.opacity = 1;
    };
    /** L'oiseau du nichoir i sort : sa tête au trou, il se pose sur le bâton, regarde, s'envole (parfois se pose et chante) */
    async function sortir(b, i) {
      const h = houses[i];
      b.busy = true;
      reserve[i] = true;
      const dir = Math.random() > 0.5 ? 1 : -1;
      const [tx, ty] = trou(h), [px, py] = perchoir(h);
      depart(b);
      await pose(b, [{ transform: poseB(tx, ty + 1, dir, 0.3) }, { transform: poseB(tx, ty - 1, dir, 0.75) }], 450, 'ease-out');
      piou('chirp', { n: 2 });
      await AC.wait(380);
      await pose(b, [{ transform: poseB(tx, ty - 1, dir, 0.75) }, { transform: poseB(tx, ty - 5, dir, 0.95), offset: 0.45 }, { transform: poseB(px, py, dir) }], 380);
      b.maison = -1;
      await regarde(b);
      await AC.wait(300 + Math.random() * 900);
      battre(b, true);
      piou('flutter');
      let from = [px, py];
      if (Math.random() < 0.45) { // il va se poser un moment, et chante
        const pe = PERCHES[Math.floor(Math.random() * PERCHES.length)];
        await vol(b, from, pe, pe[0] > px ? 1 : -1, 1300);
        reserve[i] = false;
        battre(b, false);
        piou(Math.random() > 0.5 ? 'chirp' : 'trill', { n: 3 });
        await regarde(b);
        await AC.wait(1200 + Math.random() * 1500);
        battre(b, true);
        piou('flutter');
        from = pe;
      }
      const d = Math.random() > 0.5 ? 1 : -1;
      await vol(b, from, loin(d), d, 1500, 30);
      reserve[i] = false;
      battre(b, false);
      corpsDe(b).getAnimations().forEach((a) => a.cancel());
      corpsDe(b).style.opacity = 0;
      b.busy = false;
    }
    /** Un oiseau du dehors arrive, se pose sur le bâton du nichoir i, regarde, et rentre dans le trou */
    async function entrer(b, i) {
      const h = houses[i];
      b.busy = true;
      reserve[i] = true;
      const [tx, ty] = trou(h), [px, py] = perchoir(h);
      const dir = Math.random() > 0.5 ? 1 : -1;
      depart(b);
      battre(b, true);
      piou('flutter', { delay: 700 });
      await vol(b, loin(-dir), [px, py - 2], dir, 1600, 24);
      await pose(b, [{ transform: poseB(px, py - 2, dir) }, { transform: poseB(px, py + 1, dir, 1, 5) }, { transform: poseB(px, py, dir) }], 260);
      battre(b, false);
      piou('chirp', { n: 2 });
      await regarde(b);
      await AC.wait(400 + Math.random() * 1100);
      // un petit saut vers le trou, et il disparaît dedans
      await pose(b, [{ transform: poseB(px, py, dir) }, { transform: poseB(tx, ty - 3, dir, 0.9, -10), offset: 0.5 }, { transform: poseB(tx, ty, dir, 0.3, -10), opacity: 0 }], 520, 'ease-in');
      corpsDe(b).getAnimations().forEach((a) => a.cancel());
      corpsDe(b).style.opacity = 0;
      b.maison = i;
      reserve[i] = false;
      b.busy = false;
    }
    /** Un geste de la vie des nichoirs (i : le nichoir touché) ; rien la nuit, ils dorment */
    function viePiaf(i) {
      if (isNight) return false;
      const chez = houses.map((h, k) => birds.find((b) => b.maison === k) || null);
      if (i != null) {
        const b = chez[i], dehors = birds.find((x) => x.maison < 0 && !x.busy);
        if (reserve[i]) return false;
        if (b && !b.busy) { sortir(b, i); return true; }
        if (!b && dehors) { entrer(dehors, i); return true; }
        return false;
      }
      const sorties = chez.map((b, k) => (b && !b.busy && !reserve[k] ? k : -1)).filter((k) => k >= 0);
      const vides = chez.map((b, k) => (!b && !reserve[k] ? k : -1)).filter((k) => k >= 0);
      const dehors = birds.filter((b) => b.maison < 0 && !b.busy);
      const alea = (a) => a[Math.floor(Math.random() * a.length)];
      if (sorties.length && (!vides.length || !dehors.length || Math.random() < 0.5)) { const k = alea(sorties); sortir(chez[k], k); return true; }
      if (vides.length && dehors.length) { entrer(alea(dehors), alea(vides)); return true; }
      return false;
    }

    /* ---------- le soir : réverbère ---------- */
    const lamp = S('g', { class: 'fa-lamp' }, world);
    path(lamp, 'M-6 150h14v4h-14z M4 154v10', '#1E1B19');
    path(lamp, 'M-2 164h12l-2 16h-8z', '#2A2622');
    const lampGlow = S('ellipse', { cx: 4, cy: 178, rx: 60, ry: 70, fill: rad(defs, U('lg'), [[0, '#FFD98A', 0.55], [1, '#FFD98A', 0]]), opacity: 0, class: 'fa-lampglow', 'pointer-events': 'none' }, life);
    const lampBulb = rect(lamp, 0, 166, 8, 12, '#F7E3B0', { opacity: 0.25 });

    // la porte se touche partout : l'entrebâillement, la vitre, le vantail, le seuil
    const doorHit = rect(hit, 148, 192, 104, 280, '#fff', { 'fill-opacity': 0, class: 'fa-hit fa-hit-door' });
    // les deux vitrines (la salle, le vinyle et les feuilles collées dessus)
    const winHit = rect(hit, 65, 203, 78, 182, '#fff', { 'fill-opacity': 0, class: 'fa-hit fa-hit-vitre' });
    const vitHit = rect(hit, 257, 203, 78, 182, '#fff', { 'fill-opacity': 0, class: 'fa-hit fa-hit-vitrine' });

    /* ======================================================================
       API
       ====================================================================== */
    // la caméra (s'approcher de la vitrine des horaires) bouge le dessin et ses calques ensemble
    const cam = document.createElement('div');
    cam.className = 'fa-cam';
    Object.assign(cam.style, { position: 'absolute', inset: '0' });
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    cam.appendChild(svg);
    host.appendChild(cam);
    const monde = AC.monde(svg);
    let isNight = false, ouvert = true, statut = null, knocking = false, camAnim = null;
    /* le reflet passe sur les vitres toutes les 7 s ; au passage, le mot doré « HORAIRES » s'allume et une étincelle
       brille. Tout sur des calques : la bande glisse (translateX) dans les vitres (un clip-path fixe) ; une fenêtre de
       même forme glisse avec elle sur la copie allumée du mot, que son contenu, glissant à l'envers, garde immobile ;
       l'étincelle grandit et s'éteint. Les quatre animations ont la même horloge (7 s, même départ). */
    const D_REFLET = 7000, FIN = 0.55, X0 = -60, DX = 420 - X0;
    const T_REFLET = { duration: D_REFLET, iterations: Infinity };
    const glisse = (sens) => [{ transform: 'translateX(0px)', offset: 0, easing: 'linear' }, { transform: `translateX(${sens * DX}px)`, offset: FIN }, { transform: `translateX(${sens * DX}px)`, offset: 1 }];
    const BANDE_OPACITE = [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.47 }, { opacity: 0, offset: FIN }, { opacity: 0 }];
    function glints() {
      const ts = ((104 + horW / 2 + 0.5 - 69 + 0.3249 * 310.5 - X0) / DX) * FIN; // quand le reflet atteint la fin du mot
      const T = T_REFLET;
      // 1) la bande, dans les vitres
      band.setAttribute('opacity', 1);
      const cb = monde.calque(band, { enveloppe: true, boite: [60, 155, 290, 310] });
      const cs = cb.coque(sheen);
      if (cs) cs.removeAttribute('clip-path');
      verre = cb;
      cb.majClip = () => {
        const [bx, by] = [cb.x, cb.y], r = (x, y, w, h) => `M${f(x - bx)} ${f(y - by)}h${w}v${h}h${-w}z`;
        const q = porte ? '' : glassQuad().replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, x, y) => `${f(+x - bx)} ${f(+y - by)}`);
        const d = `path('${r(65, 203, 78, 182)}${r(257, 203, 78, 182)}${r(154, 160, 92, 31)}${q}')`;
        cb.boite.style.clipPath = d;
        cb.boite.style.webkitClipPath = d;
      };
      cb.majClip();
      AC.ambiance.joue(cb.svg.animate(glisse(1), T), host);
      AC.ambiance.joue(cb.svg.animate(BANDE_OPACITE, T), host);
      // 2) le mot allumé, découvert par une fenêtre qui suit la bande (sur la ligne du mot)
      const yM = 305, hM = 16, x0 = 60 - 0.3249 * (yM + hM / 2) + X0; // la bande, à la hauteur du mot
      horLum.setAttribute('opacity', 1);
      const cm = monde.calque(horLum, { enveloppe: true, boite: [f(x0 - 3), yM, 24, hM] });
      cm.boite.classList.add('fa-fenetre');
      const fondu = 'linear-gradient(90deg, transparent, #000 35%, #000 65%, transparent)';
      Object.assign(cm.boite.style, { overflow: 'hidden', webkitMaskImage: fondu, maskImage: fondu });
      cm.boite.style.transformOrigin = cm.svg.style.transformOrigin = `${f(12)}px ${f(hM / 2)}px`;
      AC.ambiance.joue(cm.boite.animate(glisse(1).map((k) => ({ ...k, transform: k.transform + ' skewX(-18deg)' })), T), host);
      AC.ambiance.joue(cm.svg.animate(glisse(-1).map((k) => ({ ...k, transform: 'skewX(18deg) ' + k.transform })), T), host);
      // 3) l'étincelle au bout du mot
      sparkleIn.removeAttribute('transform');
      const ce = monde.calque(sparkleIn, { marge: 1, boite: [104 + horW / 2 - 3.5, 307, 8, 8] });
      const [ex, ey] = [104 + horW / 2 + 0.5, 310.5];
      ce.svg.style.transformOrigin = `${f(ex - ce.x)}px ${f(ey - ce.y)}px`;
      AC.ambiance.joue(ce.svg.animate([{ transform: 'scale(0)' }, { transform: 'scale(0)', offset: Math.max(0, ts - 0.018) }, { transform: 'scale(1)', offset: ts }, { transform: 'scale(0)', offset: Math.min(1, ts + 0.04) }, { transform: 'scale(0)' }], T), host);
    }

    /* la porte sur le compositeur : le vantail, redessiné à plat (theta = 0) avec ce qui est posé sur sa vitre (la teinte
       du verre, le vinyle, la pancarte), sort sur un calque qui tourne en 3D sur ses gonds (rotateY, dans la perspective
       de la scène : l'œil en 200, 322, à 700 unités, comme proj()). La vitre y devient un trou, par où l'on voit la
       salle (découpée une fois pour toutes à l'ouverture de la porte). Posés dessus : l'ombre du vantail, sa propre
       bande de reflet (même horloge que celle des vitrines), son chant éclairé qui respire. */
    function porte3d() {
      const th = theta;
      swingId++;
      theta = 0;
      layoutDoor(); // à plat
      // la vitre devient un trou : le verre, le filet autour (évidé) et l'ombre du vantail (évidée) laissent voir la salle
      vitrePiece.remove();
      bordVitre.setAttribute('d', quadD(163, 208, 74, 150) + quadD(165, 210, 70, 146));
      bordVitre.setAttribute('fill-rule', 'evenodd');
      leafShade.setAttribute('d', quadD(155, 200, 90, 262) + quadD(165, 210, 70, 146));
      leafShade.setAttribute('fill-rule', 'evenodd');
      const trou = U('trou');
      S('path', { d: 'M148 194H252V468H148Z' + quadD(165, 210, 70, 146), 'clip-rule': 'evenodd' }, S('clipPath', { id: trou }, defs));
      leaf.setAttribute('clip-path', `url(#${trou})`); // (le bois et son veinage s'arrêtent au bord du verre)
      clipDoorP.setAttribute('d', 'M155 200H245V462H155Z');
      rim.setAttribute('d', 'M155.6 201L155.6 461');
      rim.setAttribute('opacity', 1);
      const c = monde.calque(leaf, { enveloppe: true, marge: 3 });
      voilables.push(c.svg.firstChild); // (le bois : sous le voile du soir, comme le reste du monde)
      const posee = (v) => Object.assign(v.style, { position: 'absolute', left: '0px', top: '0px', overflow: 'visible', maxWidth: 'none' });
      const couche = (el) => { const v = AC.svg('svg', { class: 'ac-dedans', viewBox: `${c.x} ${c.y} ${c.w} ${c.h}`, width: c.w, height: c.h, 'aria-hidden': 'true' }); posee(v); (el || c.boite).appendChild(v); return v; };
      const ombre = couche();
      ombre.appendChild(leafShade);
      leafShade.setAttribute('opacity', 1);
      const vitre = couche();
      vitre.appendChild(doorTint);
      vitre.appendChild(onGlassOut);
      // la pancarte, sur sa couche : elle se balance sur sa cordelette sans repeindre la vitre (voir swingSign)
      const signe = couche();
      const gs = S('g', {}, signe);
      if (onGlass.getAttribute('transform')) gs.setAttribute('transform', onGlass.getAttribute('transform'));
      sign.removeAttribute('transform');
      gs.appendChild(sign);
      signe.style.transformOrigin = `${f(200 - c.x)}px ${f(281 - c.y)}px`;
      // la bande du reflet, dans la vitre de la porte
      const clip = document.createElement('div');
      clip.className = 'ac-dedans fa-vitre-porte';
      Object.assign(clip.style, { position: 'absolute', overflow: 'hidden', left: f(165 - c.x) + 'px', top: f(210 - c.y) + 'px', width: '70px', height: '146px' });
      c.boite.appendChild(clip);
      const bande = AC.svg('svg', { class: 'ac-dedans', viewBox: '165 210 70 146', width: 70, height: 146, 'aria-hidden': 'true' }, clip);
      posee(bande);
      rect(S('g', { transform: 'translate(-60 0)' }, bande), 60, 150, 18, 260, '#fff', { opacity: 0.2, transform: 'skewX(-18)' });
      const chant = couche();
      chant.appendChild(rim);
      c.boite.style.transformOrigin = `${f(245 - c.x)}px 50%`;
      monde.plan.style.perspective = '700px';
      monde.plan.style.perspectiveOrigin = '200px 322px';
      porte = { boite: c.boite, ombre, vitre, signe, chant };
      ombre.style.opacity = ombreDe(th);
      c.boite.style.transform = tourne(th);
      theta = th;
      layoutLumiere();
      if (verre) verre.majClip();
      AC.ambiance.joue(bande.animate(glisse(1), T_REFLET), host);
      AC.ambiance.joue(bande.animate(BANDE_OPACITE, T_REFLET), host);
      AC.ambiance.joue(chant.animate([{ opacity: 0.55 }, { opacity: 0.95 }], { duration: 2300, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }), host);
      api.syncLight();
    }

    const api = {
      svg,
      letters,
      fascia,
      houses,
      targets: { door: doorHit, ici, slate, flag: plaqueG, cup, houses: houses.map((h) => h.g), window: winHit, vitrine: vitHit },
      /** rect du bandeau (repère SVG) : là où se posent les lettres de l'ouverture */
      signBox: { x: 22, y: 100, w: 356, h: 42 },

      setStatus(st) {
        statut = st || statut;
        ouvert = !!(st && st.ouvert);
        signTxt.textContent = AC.t(ouvert ? 'OUVERT' : 'FERMÉ');
        signTxt.setAttribute('fill', ouvert ? P.teal : '#A13D3D');
        // vinyle des horaires : les heures réelles, et le jour même en doré
        const H = AC.HOURS ? AC.HOURS.semaine : [];
        const order = [1, 2, 3, 4, 5, 6, 0];
        const auj = AC.parisNow ? AC.parisNow().getDay() : -1;
        horRows.forEach(([a, t], i) => {
          const p = H[order[i]];
          t.textContent = p ? (order[i] === 0 ? 'Brunch · ' : '') + AC.fmtH(p[0]) + ' – ' + AC.fmtH(p[1]) : AC.t('Fermeture');
          // (la colonne des heures fait 31 unités, jusqu'au filet : un texte plus long, en anglais, s'y resserre)
          const lg = measure(t.textContent, 3.5, FONT_SERIF);
          if (lg > 30.5) { t.setAttribute('textLength', 30.5); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); } else t.removeAttribute('textLength');
          const on = order[i] === auj;
          [a, t].forEach((el) => { el.setAttribute('fill', on ? GOLD : '#F6F1E8'); el.setAttribute('font-weight', on ? 700 : 400); });
        });
        api.syncLight();
      },
      setNight(on) {
        isNight = !!on;
        api.syncLight();
      },
      syncLight() {
        night.style.transition = 'opacity 1.2s ease';
        night.style.opacity = isNight ? '0.52' : '0';
        const k1 = isNight ? 0.52 : 0;
        if (Math.abs(k1 - voileK) > 0.002) {
          const k0 = voileK, tour = ++voileTour;
          if (AC.reduced || !AC.tween) voile(k1);
          else AC.tween(1200, (e) => { if (tour === voileTour) voile(k0 + (k1 - k0) * e); }, AC.ease.inOutSine);
        }
        lampGlow.style.transition = lampBulb.style.transition = 'opacity 1.2s ease';
        lampGlow.style.opacity = isNight ? '1' : '0';
        lampBulb.style.opacity = isNight ? '1' : '0.25';
        lit.style.filter = !ouvert ? 'brightness(.62) saturate(.8)' : '';
        // la porte reste éclairée (on y entre toujours : c'est la carte), un peu moins quand c'est fermé
        litDoor.style.filter = !ouvert ? 'brightness(.9) saturate(.9)' : '';
        if (porte) [porte.vitre, porte.signe, porte.chant].forEach((x) => { x.style.filter = litDoor.style.filter; });
        glowK = (ouvert ? 1 : 0.8) * (isNight ? 1.25 : 1);
        layoutDoor();
      },

      /** La devanture se construit (withLetters : false quand les lettres arrivent de l'ouverture) */
      async play({ withLetters = true } = {}) {
        if (AC.reduced) return;
        const paintF = lettersG.getAttribute('filter');
        lettersG.removeAttribute('filter');
        const A = (el, kf, o) => el.animate(kf, { fill: 'backwards', easing: 'cubic-bezier(.2,.8,.2,1)', ...o });
        const sfx = (n, ms, o = {}) => AC.sfx && AC.sfx.play(n, { ...o, delay: ms });
        const all = [];
        // la porte reste fermée pendant la construction ; à la fin elle s'entrouvre et la lumière sort
        swingId++;
        theta = 0;
        layoutDoor();
        all.push({ finished: AC.wait(2500).then(() => { sfx('creak', 0); swingSign(6); return swingTo(AJAR, 1300, AC.ease.outBack); }) });
        all.push(A(wallG, [{ opacity: 0 }, { opacity: 1 }], { duration: 500 }));
        all.push(A(shop, [{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 150 }));
        [inL, inD, inR, inT, vinyl].forEach((el, i) => all.push(A(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: 700 + i * 120 })));
        sfx('creak', 700);
        if (withLetters) letters.forEach((L, i) => {
          all.push(A(L, [{ opacity: 0, transform: 'translateY(-10px) scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 850 + i * 55, easing: 'cubic-bezier(.3,1.6,.5,1)' }));
          sfx('letter', 850 + i * 55, { m: [72, 74, 76, 79, 81, 84][i % 6] + (i > 12 ? 5 : 0) });
        });
        all.push(A(garland, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 1200 }));
        sfx('rustle', 1250);
        houses.forEach((h, i) => {
          all.push(A(h.inner, [{ transform: 'translateY(-40px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1, offset: 0.7 }, { transform: 'translateY(-3px)' }, { transform: 'none' }], { duration: 700, delay: 1400 + i * 160, easing: 'ease-in' }));
          sfx('clink', 1400 + i * 160 + 480, { v: 0.4 });
        });
        all.push(A(plaqueG, [{ transform: 'rotate(-26deg)' }, { transform: 'rotate(14deg)' }, { transform: 'rotate(-7deg)' }, { transform: 'rotate(3deg)' }, { transform: 'none' }], { duration: 1600, delay: 1500, easing: 'ease-out' }));
        sfx('sign', 1600);
        all.push(A(slate, [{ transform: 'scaleY(0)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 600, delay: 1900, easing: 'cubic-bezier(.3,1.5,.5,1)' }));
        slate.style.transformOrigin = '115px 520px';
        sfx('chalk', 2000, { n: 3 });
        [terrL, terrR].forEach((t, i) => all.push(A(t, [{ transform: `translateX(${i ? 80 : -80}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, delay: 1700 + i * 150 })));
        potsSway.forEach((p, i) => all.push(A(p, [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500, delay: 2100 + i * 110, easing: 'cubic-bezier(.3,1.6,.5,1)' })));
        sfx('clink', 2600);
        await Promise.all(all.map((a) => a.finished.catch(() => {})));
        // les lettres de l'ouverture se posent un peu après : on remet la peinture quand tout est en place
        setTimeout(() => lettersG.setAttribute('filter', paintF), withLetters ? 0 : 1600);
      },

      /** Vie ambiante : vapeur, fleurs, enseigne, reflets, oiseaux. Tout ce qui bouge sans fin sort sur son calque
          (AC.monde) et s'anime sur le compositeur, en pause quand la devanture ne se voit pas (AC.ambiance.joue). */
      idle(frozen) {
        if (AC.reduced || frozen) {
          steam.querySelectorAll('.fa-wisp').forEach((w) => { w.style.opacity = '0.25'; });
          return;
        }
        if (idleFait) return;
        // (pour mesurer ses morceaux, le dessin doit être affiché : sinon, à la première ouverture de l'accueil)
        if (!svg.getBoundingClientRect().width) {
          if (!idleAttend) { idleAttend = true; AC.quandAffiche(svg, () => api.idle()); }
          return;
        }
        idleFait = true;
        const joue = (a) => AC.ambiance.joue(a, host);
        const pivotDe = (c, x, y) => { c.svg.style.transformOrigin = `${f(x - c.x)}px ${f(y - c.y)}px`; };
        // 1) la corniche : les rameaux qui se balancent, puis (au-dessus) les fleurs séchées et les nichoirs ; la plaque
        const brins = [...twigs.querySelectorAll('.fa-twig')];
        const cBrins = brins.map((g) => monde.calque(g, { marge: 3 }));
        const cFleurs = monde.calque(flowers, { marge: 2 });
        houses.forEach((h) => { h.c = monde.calque(h.g, { marge: 2, cible: true }); });
        const cPlaque = monde.calque(plaqueG, { marge: 3, cible: true });
        [...cBrins, cFleurs, ...houses.map((h) => h.c), cPlaque].forEach((c) => voilables.push(c.svg.firstChild)); // (la coquille du monde)
        AC.ambiance.balance(cBrins, host, { de: -1.4, a: 1.4, periode: (i) => 2400 + (i % 7) * 300, pivot: (i) => pivots.get(brins[i]) });
        pivotDe(cPlaque, 366, 30);
        api.targets.flagCalque = cPlaque.svg;
        joue(cPlaque.svg.animate([{ transform: 'rotate(-1.8deg)' }, { transform: 'rotate(1.8deg)' }], { duration: 3200, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }));
        // 2) le reflet des vitres
        glints();
        // 3) la terrasse, au-dessus du reflet ; les plantes qui se balancent, chacune sous son contenant
        [slate, avantPlan, terrR].forEach((g) => voilables.push(monde.calque(g, { marge: 2 }).coque(front)));
        slate.style.pointerEvents = 'auto';
        cup.style.pointerEvents = 'auto';
        const cPlantes = potsSway.map((g) => { g.style.transformOrigin = ''; return monde.calque(g, { marge: 3 }); });
        contenants.forEach((g) => voilables.push(monde.calque(g, { marge: 1 }).coque(front)));
        cPlantes.forEach((c) => voilables.push(c.coque(front)));
        AC.ambiance.balance(cPlantes, host, { de: -1.2, a: 1.4, periode: (i) => 2600 + i * 500, pivot: (i) => potsSway[i].pied });
        voile(voileK);
        // 4) la vapeur de la tasse (au premier plan, agrandie : ses mouvements aussi)
        steam.querySelectorAll('.fa-wisp').forEach((w, i) => {
          const bb = w.getBBox(), m = monde.versDessin(w), o = m.transformPoint(new DOMPoint(bb.x, bb.y)), k = Math.hypot(m.a, m.b);
          const c = monde.calque(w, { marge: 2 });
          w.setAttribute('opacity', 1);
          pivotDe(c, o.x, o.y);
          joue(c.svg.animate([
            { opacity: 0, transform: `translate(0px, ${f(4 * k)}px) scale(.7, .8)` },
            { opacity: 0.55, offset: 0.3 },
            { opacity: 0, transform: `translate(${f((i % 2 ? 3 : -2) * k)}px, ${f(-16 * k)}px) scale(1.2, 1.25)` },
          ], { duration: 2600 + i * 400, delay: i * 800, iterations: Infinity, easing: 'ease-out', fill: 'backwards' }));
        });
        // 5) la lumière de la porte respire, son chant brille, des poussières dorées flottent dedans
        const cHalo = monde.calque(halo, { marge: 4 });
        joue(cHalo.svg.animate([{ opacity: 0.65 }, { opacity: 1 }], { duration: 2300, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }));
        moteEls.forEach((el, i) => {
          const c = monde.calque(el, { marge: 1 });
          const dx = (Math.random() - 0.5) * 16, dy = -(16 + Math.random() * 28);
          joue(c.svg.animate([{ opacity: 0, transform: 'translate(0px, 0px)' }, { opacity: 0.9, offset: 0.35 }, { opacity: 0, transform: `translate(${f(dx)}px, ${f(dy)}px)` }], { duration: 3800 + Math.random() * 3000, delay: i * 650, iterations: Infinity, easing: 'ease-in-out', fill: 'backwards' }));
        });
        motesLibres = true;
        // 6) les oiseaux : chacun sur son calque, avec son aile et sa tête (voir enCalque)
        piafsCalques = true;
        birds.forEach((b) => { if (!b.busy) enCalque(b); });
        // 7) la porte : son vantail tourne en 3D sur le compositeur (le courant d'air, la visite, le retour)
        porte3d();
        // de temps en temps, un courant d'air pousse la porte (on a envie de la toucher)
        const loopDoor = async () => {
          await AC.wait(8000 + Math.random() * 7000);
          if (!svg.isConnected) return;
          if (!knocking && AC.ambiance.visible(host)) {
            swingSign(3.5);
            await swingTo(AJAR + 0.11, 1100);
            if (!knocking) await swingTo(AJAR, 1500);
          }
          loopDoor();
        };
        loopDoor();
        // les nichoirs vivent : toutes les quelques secondes, un oiseau sort ou rentre (parfois deux à la fois)
        const loopBird = async () => {
          await AC.wait(3200 + Math.random() * 4800);
          if (!svg.isConnected) return;
          if (AC.ambiance.visible(host)) viePiaf();
          loopBird();
        };
        setTimeout(() => viePiaf(), 1800);
        loopBird();
      },

      /** On touche un nichoir : son oiseau sort, ou un oiseau du dehors vient y rentrer (sinon il bouge) */
      bird(i = Math.floor(Math.random() * houses.length)) {
        if (!viePiaf(i)) return api.shake(houses[i].inner);
        return Promise.resolve();
      },
      /** le cadre de la caméra (le dessin et ses calques) */
      cam,

      /** Le panneau « ICI » : les mots s'allument un par un */
      async readIci() {
        for (const w of iciWords) {
          w.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 300, fill: 'backwards' });
          await AC.wait(90);
        }
      },
      /** La porte : la clochette tinte, elle s'ouvre en grand et la lumière du salon inonde le trottoir */
      async knock() {
        knocking = true;
        AC.sfx && AC.sfx.play('bell');
        AC.sfx && AC.sfx.play('creak', { delay: 90 });
        swingSign(9);
        await swingTo(WIDE, 750, AC.ease.outCubic);
      },
      /** Elle revient entrouverte (une fois qu'on est entré) */
      async closeDoor(ms = 900) {
        await swingTo(AJAR, ms, AC.ease.inOutSine);
        knocking = false;
      },

      /** La caméra : on s'approche d'un rectangle du décor (repère SVG ; il est centré et entièrement
          visible), ou on recule (null). Transformation CSS du <svg> : fluide pendant le mouvement,
          redessinée nette à l'arrivée. */
      camera(r, ms = 800) {
        const W = host.clientWidth, H = host.clientHeight;
        if (!W || !H) return Promise.resolve();
        const s = H / 560; // la devanture tient toujours toute la hauteur (voir cadrer)
        const ox = 200 - W / (2 * s), oy = 560 - H / s;
        let to = 'none';
        if (r) {
          const k = Math.min(W / (r.w * s), H / (r.h * s)), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
          to = `translate(${(W / 2 - k * (cx - ox) * s).toFixed(1)}px, ${(H / 2 - k * (cy - oy) * s).toFixed(1)}px) scale(${k.toFixed(4)})`;
        }
        const from = getComputedStyle(cam).transform;
        if (camAnim) camAnim.cancel();
        cam.style.transformOrigin = '0 0';
        cam.style.transform = to === 'none' ? '' : to;
        if (AC.reduced || ms <= 0) return Promise.resolve();
        camAnim = cam.animate([{ transform: from }, { transform: to }], { duration: ms, easing: 'cubic-bezier(.55,0,.2,1)' });
        return camAnim.finished.catch(() => {});
      },
      /** Le cadrage de la vitrine des horaires (le vinyle devient lisible) */
      vitreHoraires: { x: 59, y: 270, w: 90, h: 120 },
      async shake(el) {
        el.style.transformBox = 'fill-box';
        el.style.transformOrigin = '50% 100%';
        await el.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(0)' }], { duration: 500 }).finished;
      },
    };
    return api;
  }

  /* ---------- la vitrophanie : les feuilles de la marque ---------- */
  function drawDecal(p, x, y, size, R) {
    const F = AC.BRAND && AC.BRAND.feuilles;
    const g = S('g', { transform: `translate(${x} ${y})` }, p);
    if (F && F.items && F.order) {
      // leur composition d'origine (feuilles complétées), en coin de vitre, découpée au bord du verre
      const [fx, fy, fw] = F.frame;
      const k = (size * 1.05) / fw;
      const cid = AC.uid('dc');
      S('rect', { x: 257 - x, y: 203 - y, width: 78, height: 182 }, S('clipPath', { id: cid }, S('defs', {}, g)));
      const clipG = S('g', { 'clip-path': `url(#${cid})` }, g);
      const comp = S('g', { transform: `translate(-4 -6) scale(${Math.round(k * 10000) / 10000}) translate(${-fx} ${-fy})` }, clipG);
      const byId = {};
      F.items.forEach((it) => { byId[it.id] = it; });
      F.order.forEach((id) => {
        const it = byId[id];
        if (!it) return;
        const gg = S('g', { transform: `matrix(${it.place.join(' ')})` }, comp);
        if (it.key === 'ecailles') S('path', { d: it.d, fill: it.fill, 'fill-rule': 'evenodd' }, gg);
        else {
          S('path', { d: it.d, fill: it.fill }, gg);
          (it.details || []).forEach((d) => S('path', { d, fill: it.detailFill || '#fff' }, gg));
        }
      });
      return g;
    }
    // repli en attendant la vectorisation : les mêmes feuilles, simplifiées
    const leafPath = (l, w) => `M0 0C${-w} ${-l * 0.3} ${-w * 0.8} ${-l * 0.8} 0 ${-l}C${w * 0.8} ${-l * 0.8} ${w} ${-l * 0.3} 0 0Z`;
    const put = (tx, ty, rot, l, w, fill, veins) => {
      const gg = S('g', { transform: `translate(${tx} ${ty}) rotate(${rot})` }, g);
      S('path', { d: leafPath(l, w), fill }, gg);
      if (veins) S('path', { d: `M0 0V${-l * 0.9}` + [0.25, 0.45, 0.65].map((t) => `M0 ${-l * t}l${w * 0.5} ${-l * 0.12}M0 ${-l * t}l${-w * 0.5} ${-l * 0.12}`).join(''), fill: 'none', stroke: '#fff', 'stroke-width': 0.7, opacity: 0.9 }, gg);
    };
    put(40, 50, -70, 40, 13, P.aqua, true);
    put(18, 52, -30, 46, 9, P.fuchsia, false);
    put(22, 52, -42, 50, 14, P.prune, false);
    put(34, 44, -8, 42, 16, P.turquoise, true);
    for (let k = 0; k < 5; k++) put(46 + k * 2, 50 - k * 7, 30 + k * 12, 9, 4, P.marine, false);
    for (let k = 0; k < 14; k++) S('path', { d: `M${14 + R() * 20} ${24 + R() * 22}l2.2 -1`, stroke: '#fff', 'stroke-width': 0.7, 'stroke-linecap': 'round' }, g);
    return g;
  }

  /* ---------- la rangée de cuillères de l'enseigne drapeau ---------- */
  function drawSpoonRow(p, x, y, w, h, { fond = '#FCFCFA', trait = '#3A3B3A' } = {}) {
    const R = AC.BRAND && AC.BRAND.cuilleres;
    if (R && R.length && R.viewBox) {
      // leur dessin d'origine, comme sur la vraie enseigne : les dix silhouettes (qui masquent les
      // cuillères de derrière), puis tous les traits
      const [vx, vy, vw, vh] = R.viewBox;
      const k = Math.min(w / vw, h / vh);
      const g = S('g', { transform: `translate(${f(x + (w - vw * k) / 2)} ${f(y)}) scale(${Math.round(k * 10000) / 10000}) translate(${-vx} ${-vy})` }, p);
      const fonds = S('g', {}, g), traits = S('g', {}, g);
      R.forEach((c) => {
        if (c.fill) S('path', { d: c.fill, fill: fond }, fonds);
        S('path', { d: c.lines, fill: trait }, traits);
      });
      return;
    }
    // repli : dix petites cuillères au trait
    for (let i = 0; i < 10; i++) {
      const sx = x + 2.5 + i * (w / 10), l = h * (0.78 + ((i * 37) % 10) / 50);
      const g = S('g', { fill: 'none', stroke: trait, 'stroke-width': 0.45 }, p);
      S('path', { d: `M${f(sx)} ${y}v${f(l * 0.62)}` }, g);
      S('ellipse', { cx: f(sx), cy: f(y + l * 0.8), rx: 1.8, ry: f(l * 0.17) }, g);
      S('circle', { cx: f(sx), cy: f(y + 1.8), r: 1.2 }, g);
    }
  }

  /* ---------- mobilier pliant de bistrot ---------- */
  function chair(p, x, y, col, dark, flip) {
    const g = S('g', { class: 'fa-chair', transform: flip ? `translate(${2 * x + 30} 0) scale(-1 1)` : null }, p);
    // pieds arrière et avant (croisés, comme une chaise pliante)
    path(g, `M${x + 4} ${y - 44}L${x + 2} ${y + 40}`, 'none', { stroke: dark, 'stroke-width': 3, 'stroke-linecap': 'round' });
    path(g, `M${x + 26} ${y - 44}L${x + 28} ${y + 40}`, 'none', { stroke: dark, 'stroke-width': 3, 'stroke-linecap': 'round' });
    path(g, `M${x + 1} ${y + 2}L${x + 30} ${y + 40}M${x + 29} ${y + 2}L${x} ${y + 40}`, 'none', { stroke: col, 'stroke-width': 3, 'stroke-linecap': 'round' });
    // dossier à lattes
    for (let k = 0; k < 3; k++) rect(g, x + 3, y - 42 + k * 9, 24, 5.6, col, { rx: 1.2 });
    rect(g, x + 3, y - 42, 24, 1.2, '#fff', { opacity: 0.35 });
    // assise
    path(g, `M${x - 1} ${y}h32l-2 5h-28z`, col);
    for (let k = 0; k < 4; k++) rect(g, x + 1 + k * 7.4, y + 0.6, 5.8, 3.4, AC.shade(col, 0.12), { rx: 0.8 });
    return g;
  }
  function table(p, x, y, w, col, dark) {
    const g = S('g', { class: 'fa-table' }, p);
    path(g, `M${x + w / 2 - 14} ${y + 4}L${x + w / 2 + 12} ${y + 64}M${x + w / 2 + 14} ${y + 4}L${x + w / 2 - 12} ${y + 64}`, 'none', { stroke: dark, 'stroke-width': 3.2, 'stroke-linecap': 'round' });
    S('ellipse', { cx: x + w / 2, cy: y + 2, rx: w / 2, ry: 9, fill: dark }, g);
    S('ellipse', { cx: x + w / 2, cy: y, rx: w / 2, ry: 9, fill: col }, g);
    S('ellipse', { cx: x + w / 2 - w * 0.12, cy: y - 2.4, rx: w * 0.3, ry: 3, fill: '#fff', opacity: 0.18 }, g);
    return g;
  }

  AC.Facade = { create };
})();
