/* ==========================================================================
   L'Armoire à Cuillères — la tablée du dimanche (onglet Brunch)
   Une table pour deux, vue de dessus, dressée comme leur brunch : pour chacun une part
   de tarte rustique et sa salade composée, une boisson chaude, un jus de pomme, un
   cookie ; au milieu, sur le chemin de lin, le buffet à volonté : le pain, le beurre,
   les confitures, le miel, le fromage blanc, le muesli, la pâte à tartiner, les fruits
   frais et les petites gourmandises. (Les plats sont un exemple : ils changent chaque
   dimanche.) Même lumière que la table de la carte : fenêtre en haut à gauche.
   À la première visite, la table se dresse, plat par plat. On touche un plat : il se
   présente, et sa ligne s'allume dans la formule ou le buffet (et l'inverse).
   API : AC.Tablee.create(hote, { etiquette, scene }) → { dresser(), pose(), vie(), montre(cle) }
         hote : le cadre (l'étiquette s'y place) ; scene : où poser le dessin (défaut : hote)
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});
  const S = (tag, attrs, parent) => AC.svg(tag, attrs, parent);
  const f = (n) => Math.round(n * 100) / 100;
  const TAU = Math.PI * 2;
  const G = (p, a) => S('g', a || {}, p);
  const path = (p, d, fill, x = {}) => S('path', { d, fill, ...x }, p);
  const circ = (p, cx, cy, r, fill, x = {}) => S('circle', { cx: f(cx), cy: f(cy), r: f(r), fill, ...x }, p);
  const ell = (p, cx, cy, rx, ry, fill, x = {}) => S('ellipse', { cx: f(cx), cy: f(cy), rx: f(rx), ry: f(ry), fill, ...x }, p);
  const rect = (p, x, y, w, h, fill, extra = {}) => S('rect', { x: f(x), y: f(y), width: f(w), height: f(h), fill, ...extra }, p);
  const pt = (x, y) => f(x) + ' ' + f(y);

  const W = 400, H = 440;
  const P = {
    table: '#93C6C6', joint: '#669C9D', veine: '#80B8B8',
    lin: '#F4EEE3', linSh: '#E2D7C4', linFil: '#CDBFA6',
    faience: '#FCFAF4', puits: '#FFFDF8', bleu: '#4A6FA5', rose: '#D07F8C', vert: '#6E9B6A',
    choco: '#4A2618', chocoHi: '#7E4B30', mousse: '#EDE2CE', creme: '#B77B48',
    jus: '#D9A03B', jusHi: '#F4CF7C',
    croute: '#C78B45', crouteSh: '#8E5A2B', crouteHi: '#E4AE6A', appareil: '#F0D07A', fond: '#EFE3C4',
    tomate: '#D63F37', tomateHi: '#F2826A', pesto: '#557F2B', tapenade: '#2B2622',
    betterave: '#9E2157', betteraveHi: '#C8457E', feta: '#FBF8EF', thym: '#5B7A3A',
    salades: ['#7DB553', '#5E9A3E', '#98C96B', '#4E8A3E', '#86BE5C'], salRouge: '#86354E',
    concombre: '#D5E8AE', concombreSh: '#6F9E4C',
    cookie: '#C58A48', cookieHi: '#E3B26E', cookieSh: '#9C6630', pepite: '#3A2016',
    pain: '#EFD9AD', painSh: '#D9BA84', croutePain: '#9A582A', osier: '#BF9058', osierSh: '#8A5F33',
    beurre: '#F2D983', beurreHi: '#FBEDB6',
    fraise: '#B51F2E', abricot: '#E3862A', vichy: '#C63F48', ficelle: '#C9A56B',
    miel: '#DE9A25', mielHi: '#F6CD6A', pot: '#E6CE9E', potSh: '#BFA06A',
    fromage: '#FCFBF6', fromageSh: '#E8E2D5',
    muesli: '#E0C497', flocon: '#D1AA6E', raisin: '#4A2A22', noisette: '#B8844A', courge: '#6E8B3D',
    pate: '#4B2A1C', pateHi: '#80503A',
    pomme: '#C83838', pommeHi: '#EE7A6A', pommeVerte: '#9CC04C', poire: '#CDB24A', grain: '#6A3A6C', clementine: '#EC8A2C',
    madeleine: '#D69C4A', madeleineHi: '#F0C57C', truffe: '#3E2217',
    argent: '#CDD2D6', argentSh: '#8E969E', argentHi: '#F5F7F8',
    serviette: '#B7CEBA', servietteSh: '#94AF99',
  };

  function lin(defs, stops, { x1 = 0, y1 = 0, x2 = 0, y2 = 1, units } = {}) {
    const id = AC.uid('tb');
    const g = S('linearGradient', { id, x1, y1, x2, y2, gradientUnits: units }, defs);
    stops.forEach(([o, c, a]) => S('stop', { offset: o, 'stop-color': c, 'stop-opacity': a == null ? 1 : a }, g));
    return `url(#${id})`;
  }
  function rad(defs, stops, { cx = 0.5, cy = 0.5, r = 0.5, fx, fy } = {}) {
    const id = AC.uid('tb');
    const g = S('radialGradient', { id, cx, cy, r, fx, fy }, defs);
    stops.forEach(([o, c, a]) => S('stop', { offset: o, 'stop-color': c, 'stop-opacity': a == null ? 1 : a }, g));
    return `url(#${id})`;
  }
  /** un disque irrégulier (cookie, tranche de pain…) : n points, rayon r·(1 ± k) */
  function blob(cx, cy, rx, ry, n, k, R, rot = 0) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, m = 1 + (R() - 0.5) * 2 * k;
      const x = Math.cos(a) * rx * m, y = Math.sin(a) * ry * m;
      pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
    }
    let d = '';
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      if (!i) d += `M${pt(p1[0], p1[1])}`;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${pt(c1[0], c1[1])} ${pt(c2[0], c2[1])} ${pt(p2[0], p2[1])}`;
    }
    return d + 'Z';
  }
  const rotPt = (x, y, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]; };

  /* ======================================================================
     La table, le chemin de lin
     ====================================================================== */
  function drawTable(defs, g, R) {
    rect(g, -20, -20, W + 40, H + 40, P.table);
    const pl = 57;
    for (let x = -10; x < W + 20; x += pl) {
      // les veines du bois sous la peinture
      for (let k = 0; k < 5; k++) {
        const x0 = x + 6 + k * 10 + R() * 4;
        let d = `M${f(x0)} -20`;
        for (let y = -20; y < H + 20; y += 40) d += `Q${f(x0 + (R() - 0.5) * 3)} ${f(y + 20)} ${f(x0 + (R() - 0.5) * 2)} ${f(y + 40)}`;
        path(g, d, 'none', { stroke: P.veine, 'stroke-width': 0.6, opacity: 0.45 });
      }
      path(g, `M${f(x + pl)} -20V${H + 20}`, 'none', { stroke: P.joint, 'stroke-width': 1.7, opacity: 0.6 });
      path(g, `M${f(x + pl + 1.6)} -20V${H + 20}`, 'none', { stroke: '#C4E5E4', 'stroke-width': 0.7, opacity: 0.5 });
    }
    // la peinture usée par endroits
    for (let k = 0; k < 14; k++) {
      const x = R() * W, y = R() * H;
      ell(g, x, y, 6 + R() * 14, 2 + R() * 4, '#E2F2F1', { opacity: f(0.12 + R() * 0.1), transform: `rotate(${f(80 + R() * 20)} ${f(x)} ${f(y)})` });
    }
    // la lumière de la fenêtre (en haut à gauche), le bas de la table plus sombre
    rect(g, -20, -20, W + 40, H + 40, rad(defs, [[0, '#FFFFFF', 0.16], [0.55, '#FFFFFF', 0], [1, '#0F3536', 0.24]], { cx: 0.18, cy: 0.12, r: 1.05 }));
  }
  function drawRunner(defs, g) {
    const y0 = 148, y1 = 302;
    const r = G(g, { class: 'tb-chemin' });
    rect(r, -20, y1 - 1, W + 40, 5, '#0F3536', { opacity: 0.16 });
    rect(r, -20, y0, W + 40, y1 - y0, P.lin);
    const pid = AC.uid('tbl');
    const pat = S('pattern', { id: pid, width: 3, height: 3, patternUnits: 'userSpaceOnUse' }, defs);
    path(pat, 'M0 .75H3M.75 0V3', 'none', { stroke: '#B9A98E', 'stroke-width': 0.35, opacity: 0.35 });
    rect(r, -20, y0, W + 40, y1 - y0, `url(#${pid})`);
    // des plis doux, la lumière de la fenêtre sur le lin
    rect(r, -20, y0, W + 40, y1 - y0, lin(defs, [[0, '#FFFFFF', 0.35], [0.18, '#FFFFFF', 0], [0.55, '#8C7A5E', 0.06], [0.8, '#FFFFFF', 0], [1, '#8C7A5E', 0.12]]));
    path(r, `M-20 ${y0 + 6.5}H${W + 20}M-20 ${y1 - 6.5}H${W + 20}`, 'none', { stroke: P.linFil, 'stroke-width': 0.8, 'stroke-dasharray': '2.6 1.8' });
    // une rangée de petites fleurs brodées, près des ourlets
    for (let x = 14; x < W; x += 46) [y0 + 13, y1 - 13].forEach((y, k) => {
      const c = k ? P.rose : P.bleu;
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; circ(r, x + Math.cos(a) * 1.6, y + Math.sin(a) * 1.6, 1, c, { opacity: 0.6 }); }
      circ(r, x, y, 0.7, '#E2B84E', { opacity: 0.8 });
      path(r, `M${f(x + 2.5)} ${f(y + 1)}q2.5 1 4.5 -.6`, 'none', { stroke: P.vert, 'stroke-width': 0.7, opacity: 0.6 });
    });
    rect(r, -20, y0, W + 40, 1, '#FFFFFF', { opacity: 0.6 });
    return r;
  }

  /* ======================================================================
     La vaisselle
     ====================================================================== */
  function fleurette(g, x, y, s, c) {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; circ(g, x + Math.cos(a) * s, y + Math.sin(a) * s, s * 0.62, c); }
    circ(g, x, y, s * 0.45, '#F1D36A');
  }
  /** Une assiette ancienne : l'aile décorée, le bassin, l'émail qui brille */
  function drawPlate(defs, g, cx, cy, r, motif = 'bleu') {
    const col = motif === 'rose' ? P.rose : P.bleu;
    circ(g, cx, cy, r, P.faience);
    circ(g, cx, cy, r, rad(defs, [[0.55, '#FFFFFF', 0], [0.9, '#8A7A66', 0.08], [1, '#6E5E4C', 0.22]], { cx: 0.44, cy: 0.42, r: 0.56 }));
    const n = Math.max(10, Math.round(r / 4.4));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU, x = cx + Math.cos(a) * r * 0.875, y = cy + Math.sin(a) * r * 0.875;
      fleurette(g, x, y, r * 0.03 + 0.4, col);
      const b = a + TAU / n / 2, xl = cx + Math.cos(b) * r * 0.875, yl = cy + Math.sin(b) * r * 0.875;
      path(g, `M${pt(xl - Math.sin(b) * 2.2, yl + Math.cos(b) * 2.2)}Q${pt(xl + Math.cos(b) * 1.6, yl + Math.sin(b) * 1.6)} ${pt(xl + Math.sin(b) * 2.2, yl - Math.cos(b) * 2.2)}`, 'none', { stroke: P.vert, 'stroke-width': 0.8, opacity: 0.8 });
    }
    circ(g, cx, cy, r * 0.955, 'none', { stroke: col, 'stroke-width': 0.8, opacity: 0.9 });
    circ(g, cx, cy, r * 0.785, 'none', { stroke: col, 'stroke-width': 0.5, opacity: 0.6 });
    circ(g, cx, cy, r * 0.74, P.puits);
    circ(g, cx, cy, r * 0.74, rad(defs, [[0.7, '#000', 0], [1, '#5E4C3A', 0.14]], { cx: 0.56, cy: 0.58, r: 0.62 }));
    path(g, `M${pt(cx - r * 0.93, cy - r * 0.1)}A${f(r * 0.93)} ${f(r * 0.93)} 0 0 1 ${pt(cx - r * 0.1, cy - r * 0.93)}`, 'none', { stroke: '#FFFFFF', 'stroke-width': 1.6, opacity: 0.8, 'stroke-linecap': 'round' });
  }
  /** La soucoupe, la tasse (sa paroi qu'on devine en bas), l'anse, la boisson */
  function drawCup(defs, g, cx, cy, kind, R) {
    drawPlate(defs, g, cx, cy, 24, 'rose');
    circ(g, cx + 0.8, cy + 2.4, 17, '#6E5E4C', { opacity: 0.18 });
    circ(g, cx, cy + 1.8, 16.6, '#E6DFD3');
    const anse = `M${pt(cx + 15.6, cy - 3.6)}C${pt(cx + 25, cy - 5)} ${pt(cx + 25, cy + 6)} ${pt(cx + 15.6, cy + 4.6)}`;
    path(g, anse, 'none', { stroke: '#D9D1C4', 'stroke-width': 4.2, 'stroke-linecap': 'round' });
    path(g, anse, 'none', { stroke: P.faience, 'stroke-width': 2.8, 'stroke-linecap': 'round' });
    circ(g, cx, cy, 16.6, P.faience);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; fleurette(g, cx + Math.cos(a) * 15, cy + Math.sin(a) * 15, 0.75, P.rose); }
    circ(g, cx, cy, 13.4, kind === 'choco' ? P.choco : P.mousse);
    if (kind === 'choco') {
      circ(g, cx, cy, 13.4, rad(defs, [[0, P.chocoHi, 1], [0.7, P.choco, 0.4], [1, '#2A120A', 0.6]], { cx: 0.4, cy: 0.38, r: 0.62 }));
      circ(g, cx, cy, 12.6, 'none', { stroke: '#8A5A3E', 'stroke-width': 1, opacity: 0.55 });
      path(g, `M${pt(cx - 6, cy - 3)}c3 -3 8 -3 10 1`, 'none', { stroke: '#9A6A4A', 'stroke-width': 1, opacity: 0.6, 'stroke-linecap': 'round' });
      ell(g, cx - 4.6, cy - 6, 4, 1.6, '#FFFFFF', { opacity: 0.28, transform: `rotate(-24 ${f(cx - 4.6)} ${f(cy - 6)})` });
    } else {
      circ(g, cx, cy, 13.4, rad(defs, [[0, P.creme, 0], [0.62, P.creme, 0.2], [0.86, P.creme, 0.95], [1, '#8C5530', 1]]));
      path(g, `M${pt(cx, cy + 5.8)}C${pt(cx - 8.5, cy)} ${pt(cx - 6.4, cy - 7)} ${pt(cx, cy - 2.6)}C${pt(cx + 6.4, cy - 7)} ${pt(cx + 8.5, cy)} ${pt(cx, cy + 5.8)}Z`, '#FBF6EC');
      for (let k = 0; k < 16; k++) { const a = R() * TAU, rr = 3 + R() * 8; circ(g, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.35, '#8A5530', { opacity: 0.5 }); }
    }
    circ(g, cx, cy, 16.6, 'none', { stroke: '#FFFFFF', 'stroke-width': 0.9, opacity: 0.9 });
    // la petite cuillère, sur la soucoupe
    const sx = cx - 6, sy = cy + 19;
    path(g, `M${pt(sx - 12, sy + 1.5)}L${pt(sx + 3, sy - 1)}`, 'none', { stroke: P.argentSh, 'stroke-width': 1.8, 'stroke-linecap': 'round' });
    path(g, `M${pt(sx - 12, sy + 1)}L${pt(sx + 3, sy - 1.4)}`, 'none', { stroke: P.argent, 'stroke-width': 1.2, 'stroke-linecap': 'round' });
    ell(g, sx + 6.4, sy - 1.8, 3.8, 2.4, P.argent, { transform: `rotate(-10 ${f(sx + 6.4)} ${f(sy - 1.8)})` });
    ell(g, sx + 5.8, sy - 2.3, 1.8, 0.9, P.argentHi, { transform: `rotate(-10 ${f(sx + 5.8)} ${f(sy - 2.3)})` });
  }
  /** Le verre de jus de pomme : le fond qu'on voit au travers, la surface, le bord */
  function drawGlass(defs, g, cx, cy) {
    circ(g, cx, cy + 1.2, 15.6, '#FFFFFF', { opacity: 0.35 });
    circ(g, cx, cy + 1.2, 15.6, 'none', { stroke: '#9DB3B7', 'stroke-width': 0.6, opacity: 0.8 });
    circ(g, cx + 1, cy + 3.2, 11.6, '#A87222', { opacity: 0.55 });
    circ(g, cx, cy, 12.4, rad(defs, [[0, P.jusHi], [0.75, P.jus], [1, '#B27A22']], { cx: 0.42, cy: 0.4, r: 0.6 }));
    for (let k = 0; k < 7; k++) { const a = 0.5 + k * 0.5; circ(g, cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, 0.5, '#FFF4D6', { opacity: 0.8 }); }
    circ(g, cx, cy, 13.4, 'none', { stroke: '#B8CCCF', 'stroke-width': 0.7 });
    circ(g, cx, cy, 12.9, 'none', { stroke: '#FFFFFF', 'stroke-width': 1.2, opacity: 0.85 });
    path(g, `M${pt(cx - 9, cy - 5)}A10.5 10.5 0 0 1 ${pt(cx - 3, cy - 10)}`, 'none', { stroke: '#FFFFFF', 'stroke-width': 1.4, opacity: 0.8, 'stroke-linecap': 'round' });
    path(g, `M${pt(cx + 7, cy + 13.4)}A15 15 0 0 0 ${pt(cx + 14, cy + 5)}`, 'none', { stroke: '#FFFFFF', 'stroke-width': 1.6, opacity: 0.7, 'stroke-linecap': 'round' });
  }
  /** Un petit bouquet dans un vase de verre : roses, marguerites, myosotis, boutons d'or */
  function drawBouquet(defs, g, cx, cy, R) {
    circ(g, cx, cy, 11, '#DCE9EA', { opacity: 0.9 });
    circ(g, cx, cy, 11, 'none', { stroke: '#FFFFFF', 'stroke-width': 1.2 });
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU + R() * 0.4, rr = 13 + R() * 5;
      const t = G(g, { transform: `translate(${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}) rotate(${f((a * 180) / Math.PI + 90)})` });
      path(t, 'M0 5C4 2 4 -4 0 -7C-4 -4 -4 2 0 5Z', k % 2 ? '#5E9A3E' : '#78B252');
      path(t, 'M0 4V-5', 'none', { stroke: '#CFE6B0', 'stroke-width': 0.6 });
    }
    const fleur = (x, y, rr, c, coeur) => { for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; circ(g, x + Math.cos(a) * rr * 0.62, y + Math.sin(a) * rr * 0.62, rr * 0.5, c); } circ(g, x, y, rr * 0.38, coeur); };
    const rose = (x, y, rr) => { circ(g, x, y, rr, '#E59AAA'); circ(g, x, y, rr * 0.72, '#EFB3BF'); path(g, `M${pt(x - rr * 0.4, y)}a${f(rr * 0.4)} ${f(rr * 0.4)} 0 1 1 ${f(rr * 0.5)} ${f(rr * 0.3)}`, 'none', { stroke: '#C66A80', 'stroke-width': 0.8 }); };
    rose(cx - 5, cy - 4, 6.4);
    rose(cx + 6, cy + 4, 5.6);
    fleur(cx + 6, cy - 7, 5.4, '#FFFFFF', '#F2C94C');
    fleur(cx - 7, cy + 6, 5, '#FFFFFF', '#F2C94C');
    [[cx + 11, cy - 1], [cx - 1, cy + 10], [cx - 11, cy - 3]].forEach(([x, y]) => fleur(x, y, 2.6, '#7FA7DB', '#F6E27A'));
    [[cx + 1, cy - 12], [cx + 12, cy + 9]].forEach(([x, y]) => circ(g, x, y, 2.2, '#F2C94C'));
  }
  /** Le petit pot à lait (pour le café) */
  function drawLait(defs, g, cx, cy) {
    const t = G(g, { transform: `translate(${f(cx)} ${f(cy)}) rotate(-24)` });
    path(t, 'M13 -2C19 -6 22 4 13 4', 'none', { stroke: '#D9D1C4', 'stroke-width': 3.8, 'stroke-linecap': 'round' });
    path(t, 'M13 -2C19 -6 22 4 13 4', 'none', { stroke: P.faience, 'stroke-width': 2.4, 'stroke-linecap': 'round' });
    path(t, 'M-13 0C-13 -8 -7 -13 0 -13C8 -13 13 -8 13 0C13 8 8 13 0 13C-7 13 -13 8 -13 0Z', P.faience);
    path(t, 'M-13 0C-13 -2.6 -15 -3.4 -18 -3.6C-16.4 -1.8 -16.4 1.8 -18 3.6C-15 3.4 -13 2.6 -13 0Z', P.faience);
    circ(t, 0, 0, 13, rad(defs, [[0.6, '#FFFFFF', 0], [1, '#6E5E4C', 0.22]], { cx: 0.45, cy: 0.43, r: 0.58 }));
    circ(t, 0, 0, 10.2, '#FBF6EA');
    circ(t, 0, 0, 10.2, rad(defs, [[0.5, '#FFFFFF', 0], [1, '#B8AA90', 0.3]], { cx: 0.55, cy: 0.58, r: 0.6 }));
    circ(t, 0, 0, 12, 'none', { stroke: P.bleu, 'stroke-width': 0.7, opacity: 0.8 });
  }
  /** Le cookie, sur une dentelle de papier */
  function drawCookie(defs, g, cx, cy, r, R) {
    let d = '';
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU, rr = r + 6 + (k % 2 ? 1.6 : 0); d += (k ? 'L' : 'M') + pt(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    path(g, d + 'Z', '#FFFFFF', { opacity: 0.95 });
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; circ(g, cx + Math.cos(a) * (r + 3.4), cy + Math.sin(a) * (r + 3.4), 0.9, '#E9E3D8'); }
    path(g, blob(cx, cy, r, r * 0.96, 16, 0.07, R), rad(defs, [[0, P.cookieHi], [0.72, P.cookie], [1, P.cookieSh]], { cx: 0.42, cy: 0.4, r: 0.6 }));
    for (let k = 0; k < 4; k++) { const a = R() * TAU, rr = r * (0.2 + R() * 0.5); path(g, `M${pt(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)}l${f((R() - 0.5) * 5)} ${f((R() - 0.5) * 5)}`, 'none', { stroke: P.cookieSh, 'stroke-width': 0.6, opacity: 0.7 }); }
    for (let k = 0; k < 8; k++) {
      const a = R() * TAU, rr = r * Math.sqrt(R()) * 0.8, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      path(g, blob(x, y, 1.6 + R() * 0.8, 1.3 + R() * 0.6, 6, 0.2, R), P.pepite);
      circ(g, x - 0.5, y - 0.5, 0.45, '#8A5A40', { opacity: 0.8 });
    }
    for (let k = 0; k < 6; k++) rect(g, cx + (R() - 0.5) * r * 1.3, cy + (R() - 0.5) * r * 1.3, 0.7, 0.7, '#FFFFFF', { opacity: 0.9 });
  }
  /** Couteau et fourchette, sur une serviette de lin pliée */
  function drawCouverts(defs, g, x, y, ang) {
    const t = G(g, { transform: `translate(${f(x)} ${f(y)}) rotate(${f(ang)})` });
    rect(t, -13, -30, 26, 60, P.serviette, { rx: 1.5 });
    rect(t, -13, -30, 26, 60, lin(defs, [[0, '#FFFFFF', 0.2], [1, '#000', 0.08]], { x1: 0, y1: 0, x2: 1, y2: 0 }), { rx: 1.5 });
    path(t, 'M-13 -8H13', 'none', { stroke: P.servietteSh, 'stroke-width': 0.8 });
    path(t, 'M-10 -30V30M10 -30V30', 'none', { stroke: '#FFFFFF', 'stroke-width': 0.8, opacity: 0.45 });
    // la fourchette
    path(t, 'M-5 26V-6', 'none', { stroke: P.argentSh, 'stroke-width': 2.4, 'stroke-linecap': 'round' });
    path(t, 'M-5 26V-6', 'none', { stroke: P.argent, 'stroke-width': 1.6, 'stroke-linecap': 'round' });
    path(t, 'M-7.6 -6C-7.6 -12 -2.4 -12 -2.4 -6Z', P.argent);
    path(t, 'M-7.4 -11V-22M-5.7 -11V-22M-4.2 -11V-22M-2.6 -11V-22', 'none', { stroke: P.argent, 'stroke-width': 0.9, 'stroke-linecap': 'round' });
    // le couteau
    path(t, 'M5 27V4', 'none', { stroke: P.argentSh, 'stroke-width': 2.8, 'stroke-linecap': 'round' });
    path(t, 'M5 27V4', 'none', { stroke: P.argent, 'stroke-width': 2, 'stroke-linecap': 'round' });
    path(t, 'M3.6 4V-22C3.6 -24 6.8 -24 7 -20L6.4 4Z', P.argentHi, { stroke: P.argentSh, 'stroke-width': 0.4 });
  }

  /* ======================================================================
     Le plat salé : une part de tarte rustique, sa salade composée
     ====================================================================== */
  function drawTarte(defs, g, cx, cy, ang, kind, R) {
    const t = G(g, { transform: `translate(${f(cx)} ${f(cy)}) rotate(${f(ang)})` });
    const R0 = 45, sp = (52 * Math.PI) / 180;
    const A = [R0 * Math.cos(-sp / 2), R0 * Math.sin(-sp / 2)], B = [R0 * Math.cos(sp / 2), R0 * Math.sin(sp / 2)];
    const coin = `M0 0L${pt(A[0], A[1])}A${R0} ${R0} 0 0 1 ${pt(B[0], B[1])}Z`;
    path(t, coin, '#6E4A2A', { opacity: 0.25, transform: 'translate(1.2 2)' });
    path(t, coin, P.croute);
    const R1 = R0 - 5.5;
    const A1 = [R1 * Math.cos(-sp / 2 + 0.05), R1 * Math.sin(-sp / 2 + 0.05)], B1 = [R1 * Math.cos(sp / 2 - 0.05), R1 * Math.sin(sp / 2 - 0.05)];
    const garni = `M2.2 0L${pt(A1[0], A1[1])}A${R1} ${R1} 0 0 1 ${pt(B1[0], B1[1])}Z`;
    path(t, garni, kind === 'tomates' ? P.appareil : P.fond);
    const cid = AC.uid('tbt');
    S('path', { d: garni }, S('clipPath', { id: cid }, defs));
    const cl = G(t, { 'clip-path': `url(#${cid})` });
    if (kind === 'tomates') {
      [[10, -2], [17, 5], [19, -5.5], [25, 1], [27, -8], [28, 9], [13, 5.5], [33, -3], [35, 6], [34, -12], [36, 13]].forEach(([x, y], k) => {
        circ(cl, x, y, 5.2 + (k % 3) * 0.5, P.tomate);
        circ(cl, x, y, 3.6, P.tomateHi, { opacity: 0.55 });
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU + k, sx = x + Math.cos(a) * 1.9, sy = y + Math.sin(a) * 1.9;
          ell(cl, sx, sy, 0.8, 0.5, '#F6D98A', { transform: `rotate(${f((a * 180) / Math.PI)} ${f(sx)} ${f(sy)})` });
        }
      });
      path(cl, 'M4 1C9 -4 13 5 18 0S26 -6 31 2S38 6 42 0', 'none', { stroke: P.pesto, 'stroke-width': 1.5, 'stroke-linecap': 'round', opacity: 0.95 });
      [[8, 3], [15, -4], [22, 4], [29, -3], [21, -9], [24, 8], [32, 10], [37, -6]].forEach(([x, y]) => circ(cl, x, y, 0.95, P.tapenade));
      [[12, -6], [26, 5]].forEach(([x, y]) => { path(cl, `M${x} ${y}l2.4 -1.2`, 'none', { stroke: P.thym, 'stroke-width': 1.1, 'stroke-linecap': 'round' }); });
    } else {
      [[11, -2], [18, 5], [20, -6], [27, 0.5], [28, -9], [27, 9], [35, -4], [35, 7], [36, -14], [37, 15]].forEach(([x, y]) => {
        circ(cl, x, y, 5.4, P.betterave);
        circ(cl, x, y, 3.8, 'none', { stroke: P.betteraveHi, 'stroke-width': 0.6, opacity: 0.6 });
        circ(cl, x, y, 2, 'none', { stroke: P.betteraveHi, 'stroke-width': 0.5, opacity: 0.5 });
      });
      for (let k = 0; k < 13; k++) { const x = 6 + R() * 32, y = -11 + R() * 22; rect(cl, x, y, 2.6, 2.4, P.feta, { rx: 0.6, transform: `rotate(${f(R() * 60)} ${f(x + 1.3)} ${f(y + 1.2)})` }); }
      for (let k = 0; k < 20; k++) circ(cl, 5 + R() * 34, -12 + R() * 24, 0.55, P.thym);
    }
    path(cl, garni, rad(defs, [[0, '#FFFFFF', 0.12], [1, '#5A3A1A', 0.12]], { cx: 0.3, cy: 0.3, r: 0.8 }));
    path(t, `M${pt(A[0] * 0.93, A[1] * 0.93)}A${f(R0 * 0.93)} ${f(R0 * 0.93)} 0 0 1 ${pt(B[0] * 0.93, B[1] * 0.93)}`, 'none', { stroke: P.crouteHi, 'stroke-width': 1.6, opacity: 0.8, 'stroke-linecap': 'round' });
    path(t, `M${pt(A[0], A[1])}A${R0} ${R0} 0 0 1 ${pt(B[0], B[1])}`, 'none', { stroke: P.crouteSh, 'stroke-width': 1.1 });
    for (let k = 0; k < 7; k++) { const a = -sp / 2 + (k + 0.5) * (sp / 7); path(t, `M${pt(Math.cos(a) * (R0 - 3.6), Math.sin(a) * (R0 - 3.6))}L${pt(Math.cos(a) * (R0 - 0.8), Math.sin(a) * (R0 - 0.8))}`, 'none', { stroke: P.crouteSh, 'stroke-width': 0.7, opacity: 0.55 }); }
  }
  function feuilleSalade(g, x, y, ang, len, wd, col, R) {
    const t = G(g, { transform: `translate(${f(x)} ${f(y)}) rotate(${f(ang)})` });
    const n = 7;
    let d = 'M0 0';
    for (let k = 1; k <= n; k++) { const u = k / n; d += `Q${pt(wd * (0.9 + R() * 0.3) * Math.sin(u * Math.PI) + 1.2, -len * (u - 0.08))} ${pt(wd * 0.8 * Math.sin(u * Math.PI), -len * u)}`; }
    for (let k = n; k >= 1; k--) { const u = k / n; d += `Q${pt(-wd * (0.9 + R() * 0.3) * Math.sin(u * Math.PI) - 1.2, -len * (u - 0.08))} ${pt(-wd * 0.8 * Math.sin((u - 1 / n) * Math.PI), -len * (u - 1 / n))}`; }
    path(t, d + 'Z', col);
    path(t, `M0 -1Q${f(wd * 0.15)} ${f(-len * 0.5)} 0 ${f(-len * 0.88)}`, 'none', { stroke: '#E4F2C8', 'stroke-width': 0.8, opacity: 0.8 });
  }
  function drawSalade(defs, g, cx, cy, R) {
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * 360 + R() * 20;
      feuilleSalade(g, cx + (R() - 0.5) * 8, cy + (R() - 0.5) * 8, a, 14 + R() * 6, 5.6 + R() * 2.6, k % 5 === 4 ? P.salRouge : P.salades[k % 4], R);
    }
    for (let k = 0; k < 6; k++) {
      const a = R() * TAU, rr = 3 + R() * 8, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (k % 2) { circ(g, x, y, 3.4, P.tomate); circ(g, x, y, 2.4, P.tomateHi, { opacity: 0.6 }); circ(g, x - 0.8, y - 0.8, 0.6, '#FFFFFF', { opacity: 0.7 }); }
      else { circ(g, x, y, 3.8, P.concombre); circ(g, x, y, 3.8, 'none', { stroke: P.concombreSh, 'stroke-width': 0.8 }); for (let i = 0; i < 3; i++) { const b = (i / 3) * TAU; ell(g, x + Math.cos(b) * 1.3, y + Math.sin(b) * 1.3, 0.5, 0.3, '#F4FAE4'); } }
    }
    for (let k = 0; k < 10; k++) { const x = cx + (R() - 0.5) * 18, y = cy + (R() - 0.5) * 18; ell(g, x, y, 0.9, 0.5, '#EADCB8', { transform: `rotate(${f(R() * 180)} ${f(x)} ${f(y)})` }); }
  }

  /* ======================================================================
     Le buffet
     ====================================================================== */
  function drawPain(defs, g, cx, cy, R) {
    ell(g, cx, cy, 58, 40, P.osierSh);
    for (let k = 0; k < 5; k++) ell(g, cx, cy, 57 - k * 2.2, 39 - k * 1.6, 'none', { stroke: k % 2 ? P.osier : '#D0A46A', 'stroke-width': 1.3, 'stroke-dasharray': k % 2 ? '3 1.4' : '1.4 3' });
    ell(g, cx, cy, 46, 29, '#6E4A28');
    // un torchon de lin à rayure rouge, qui dépasse
    path(g, `M${pt(cx - 44, cy - 6)}C${pt(cx - 30, cy - 30)} ${pt(cx + 20, cy - 34)} ${pt(cx + 46, cy - 12)}L${pt(cx + 40, cy + 18)}C${pt(cx + 10, cy + 30)} ${pt(cx - 30, cy + 26)} ${pt(cx - 44, cy - 6)}Z`, '#F4EEE3');
    path(g, `M${pt(cx - 38, cy - 16)}C${pt(cx - 20, cy - 32)} ${pt(cx + 18, cy - 34)} ${pt(cx + 42, cy - 18)}`, 'none', { stroke: '#C8414A', 'stroke-width': 1.6, opacity: 0.8 });
    // trois grandes tranches de pain de campagne, deux rondelles de baguette
    const tranche = (x, y, rx, ry, rot) => {
      const d = blob(x, y, rx, ry, 14, 0.07, R, rot);
      path(g, d, '#5A3A1E', { opacity: 0.28, transform: 'translate(1 1.8)' });
      path(g, d, P.croutePain);
      path(g, blob(x, y, rx - 2.2, ry - 2.2, 14, 0.05, R, rot), '#C98A4C');
      path(g, blob(x, y, rx - 3.2, ry - 3.2, 14, 0.06, R, rot), rad(defs, [[0, '#F8E9C8'], [0.75, P.pain], [1, P.painSh]], { cx: 0.44, cy: 0.4, r: 0.62 }));
      for (let i = 0; i < 18; i++) {
        const u = R() * TAU, v = Math.sqrt(R()) * 0.82;
        const q = rotPt(x + Math.cos(u) * (rx - 4) * v, y + Math.sin(u) * (ry - 4) * v, x, y, rot);
        const big = R() < 0.18;
        ell(g, q[0], q[1], big ? 1.9 : 0.7 + R() * 0.8, big ? 1.1 : 0.45 + R() * 0.4, big ? '#C9A56E' : P.painSh, { opacity: 0.85, transform: `rotate(${f((rot * 180) / Math.PI + (R() - 0.5) * 60)} ${f(q[0])} ${f(q[1])})` });
      }
      for (let i = 0; i < 7; i++) { const u = R() * TAU; const q = rotPt(x + Math.cos(u) * (rx - 1), y + Math.sin(u) * (ry - 1), x, y, rot); circ(g, q[0], q[1], 0.55, '#F2E6D2', { opacity: 0.85 }); }
    };
    tranche(cx - 18, cy + 5, 22, 15, -0.35);
    tranche(cx + 6, cy - 4, 22, 15.5, 0.18);
    tranche(cx + 26, cy + 8, 20, 14, -0.12);
    [[cx - 34, cy - 12], [cx + 40, cy - 12]].forEach(([x, y]) => {
      circ(g, x + 1, y + 1.6, 8.6, '#5A3A1E', { opacity: 0.28 });
      circ(g, x, y, 8.6, P.croutePain);
      circ(g, x, y, 6.6, rad(defs, [[0, '#F8E9C8'], [1, P.painSh]], { cx: 0.44, cy: 0.4, r: 0.62 }));
      for (let i = 0; i < 6; i++) circ(g, x + (R() - 0.5) * 8, y + (R() - 0.5) * 8, 0.6, P.painSh);
    });
  }
  function drawBeurre(defs, g, cx, cy) {
    rect(g, cx - 31, cy - 20, 62, 40, P.faience, { rx: 11 });
    rect(g, cx - 31, cy - 20, 62, 40, rad(defs, [[0.6, '#FFFFFF', 0], [1, '#6E5E4C', 0.2]], { cx: 0.46, cy: 0.44, r: 0.62 }), { rx: 11 });
    rect(g, cx - 27.5, cy - 16.5, 55, 33, 'none', { rx: 8.5, stroke: P.bleu, 'stroke-width': 0.8, opacity: 0.8 });
    rect(g, cx - 18.5, cy - 10.5, 36, 21, '#C2A044', { rx: 3.4, opacity: 0.5, transform: 'translate(0.8 1.2)' });
    rect(g, cx - 18.5, cy - 10.5, 36, 21, lin(defs, [[0, P.beurreHi], [1, P.beurre]]), { rx: 3.4 });
    path(g, `M${pt(cx - 9, cy - 1)}c3 -4 9 -4 12 0c-3 -2 -8 -2 -12 0Z`, '#FFF4CC', { opacity: 0.9 });
    path(g, `M${pt(cx - 9, cy - 1)}c3 -4 9 -4 12 0`, 'none', { stroke: '#D9BC5E', 'stroke-width': 0.6 });
    path(g, `M${pt(cx + 4, cy + 13)}L${pt(cx + 30, cy - 12)}`, 'none', { stroke: P.argentSh, 'stroke-width': 2.8, 'stroke-linecap': 'round' });
    path(g, `M${pt(cx + 4, cy + 13)}L${pt(cx + 30, cy - 12)}`, 'none', { stroke: P.argent, 'stroke-width': 2, 'stroke-linecap': 'round' });
    path(g, `M${pt(cx + 18, cy + 0.5)}L${pt(cx + 30, cy - 12)}`, 'none', { stroke: '#B08D5E', 'stroke-width': 2.6, 'stroke-linecap': 'round' });
  }
  /** Un pot de confiture : ouvert (la confiture qui brille, une cuillère) ou coiffé de vichy */
  function drawConfiture(defs, g, cx, cy, col, kind, R) {
    if (kind === 'vichy') {
      const pid = AC.uid('tbv');
      const pat = S('pattern', { id: pid, width: 4, height: 4, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(12 ${cx} ${cy})` }, defs);
      rect(pat, 0, 0, 4, 4, '#FFFFFF');
      rect(pat, 0, 0, 2, 4, P.vichy, { opacity: 0.5 });
      rect(pat, 0, 0, 4, 2, P.vichy, { opacity: 0.5 });
      let d = '';
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, rr = k % 2 ? 17.5 : 19.5; d += (k ? 'L' : 'M') + pt(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      path(g, d + 'Z', `url(#${pid})`);
      circ(g, cx, cy, 13, lin(defs, [[0, '#FFFFFF', 0.25], [1, '#000', 0.12]]));
      circ(g, cx, cy, 13.4, 'none', { stroke: P.ficelle, 'stroke-width': 1.5 });
      path(g, `M${pt(cx + 9, cy + 9.5)}q4 1 6 5M${pt(cx + 9.4, cy + 9)}q3 -2 7 -1`, 'none', { stroke: P.ficelle, 'stroke-width': 1.2, 'stroke-linecap': 'round' });
      return;
    }
    circ(g, cx, cy, 14.6, '#DCE7E8', { opacity: 0.9 });
    circ(g, cx, cy, 12.4, col);
    circ(g, cx, cy, 12.4, rad(defs, [[0, '#FFFFFF', 0.3], [0.5, '#FFFFFF', 0], [1, '#000', 0.3]], { cx: 0.38, cy: 0.36, r: 0.7 }));
    for (let k = 0; k < 6; k++) { const a = R() * TAU, rr = R() * 8; path(g, blob(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.8, 1.3, 6, 0.25, R), '#000', { opacity: 0.16 }); }
    circ(g, cx, cy, 14.6, 'none', { stroke: '#FFFFFF', 'stroke-width': 1, opacity: 0.9 });
    circ(g, cx, cy, 15.4, 'none', { stroke: '#9FB5B8', 'stroke-width': 0.6 });
    ell(g, cx - 5, cy - 6, 3.6, 1.4, '#FFFFFF', { opacity: 0.55, transform: `rotate(-30 ${f(cx - 5)} ${f(cy - 6)})` });
    // la cuillère plantée
    path(g, `M${pt(cx + 2, cy + 1)}L${pt(cx + 16, cy + 14)}`, 'none', { stroke: P.argentSh, 'stroke-width': 2.2, 'stroke-linecap': 'round' });
    path(g, `M${pt(cx + 2, cy + 0.6)}L${pt(cx + 16, cy + 13.6)}`, 'none', { stroke: P.argent, 'stroke-width': 1.4, 'stroke-linecap': 'round' });
  }
  function drawMiel(defs, g, cx, cy) {
    circ(g, cx, cy, 16, P.pot);
    circ(g, cx, cy, 16, rad(defs, [[0.6, '#FFFFFF', 0], [1, '#6E4A20', 0.3]], { cx: 0.44, cy: 0.42, r: 0.58 }));
    for (let k = 0; k < 3; k++) circ(g, cx, cy, 14.8 - k * 0.1, 'none', { stroke: k === 1 ? '#FFFFFF' : P.potSh, 'stroke-width': 0.5, opacity: 0.6 });
    circ(g, cx, cy, 12.6, rad(defs, [[0, P.mielHi], [0.7, P.miel], [1, '#A86A12']], { cx: 0.4, cy: 0.38, r: 0.62 }));
    ell(g, cx - 5, cy - 5.4, 3.8, 1.5, '#FFFFFF', { opacity: 0.5, transform: `rotate(-32 ${f(cx - 5)} ${f(cy - 5.4)})` });
    // la cuillère à miel en bois
    path(g, `M${pt(cx + 1, cy + 2)}L${pt(cx + 24, cy - 16)}`, 'none', { stroke: '#8A5F33', 'stroke-width': 2.8, 'stroke-linecap': 'round' });
    path(g, `M${pt(cx + 1, cy + 1.6)}L${pt(cx + 24, cy - 16.4)}`, 'none', { stroke: '#C69A62', 'stroke-width': 1.8, 'stroke-linecap': 'round' });
    const t = G(g, { transform: `translate(${f(cx - 2)} ${f(cy + 4)}) rotate(-38)` });
    ell(t, 0, 0, 5.6, 4.4, '#B98652');
    [-3, -1, 1, 3].forEach((x) => path(t, `M${x} -4.2V4.2`, 'none', { stroke: '#7A5024', 'stroke-width': 0.9 }));
    ell(t, 0, 0, 5.6, 4.4, P.miel, { opacity: 0.45 });
  }
  function drawBol(defs, g, cx, cy, r, contenu, R) {
    circ(g, cx + 0.6, cy + 2, r, '#D9D1C4');
    circ(g, cx, cy, r, P.faience);
    circ(g, cx, cy, r, rad(defs, [[0.7, '#FFFFFF', 0], [1, '#6E5E4C', 0.22]], { cx: 0.45, cy: 0.43, r: 0.58 }));
    circ(g, cx, cy, r - 1.6, 'none', { stroke: P.bleu, 'stroke-width': 0.9, opacity: 0.85 });
    circ(g, cx, cy, r - 3, 'none', { stroke: P.bleu, 'stroke-width': 0.4, opacity: 0.5 });
    const ri = r * 0.8;
    if (contenu === 'fromage') {
      circ(g, cx, cy, ri, P.fromage);
      path(g, `M${pt(cx - ri * 0.6, cy)}c${f(ri * 0.3)} ${f(-ri * 0.5)} ${f(ri * 0.9)} ${f(-ri * 0.4)} ${f(ri * 1.1)} ${f(ri * 0.1)}M${pt(cx - ri * 0.3, cy + ri * 0.4)}c${f(ri * 0.3)} ${f(-ri * 0.3)} ${f(ri * 0.7)} ${f(-ri * 0.2)} ${f(ri * 0.8)} ${f(ri * 0.1)}`, 'none', { stroke: P.fromageSh, 'stroke-width': 1.2, 'stroke-linecap': 'round' });
      circ(g, cx, cy, ri, rad(defs, [[0.6, '#FFFFFF', 0], [1, '#B8AE9E', 0.3]], { cx: 0.55, cy: 0.58, r: 0.6 }));
      ell(g, cx - ri * 0.35, cy - ri * 0.4, ri * 0.3, ri * 0.12, '#FFFFFF', { transform: `rotate(-28 ${f(cx - ri * 0.35)} ${f(cy - ri * 0.4)})` });
      path(g, `M${pt(cx + 3, cy + 1)}L${pt(cx + r + 6, cy - r * 0.5)}`, 'none', { stroke: P.argentSh, 'stroke-width': 2.2, 'stroke-linecap': 'round' });
      path(g, `M${pt(cx + 3, cy + 0.6)}L${pt(cx + r + 6, cy - r * 0.5 - 0.4)}`, 'none', { stroke: P.argent, 'stroke-width': 1.4, 'stroke-linecap': 'round' });
    } else {
      circ(g, cx, cy, ri, P.muesli);
      for (let k = 0; k < 46; k++) {
        const a = R() * TAU, rr = Math.sqrt(R()) * (ri - 1.5), x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        const kind = R();
        if (kind < 0.62) path(g, blob(x, y, 1.9, 1.3, 5, 0.3, R, R() * 3), R() > 0.5 ? P.flocon : '#EAD3A6');
        else if (kind < 0.76) ell(g, x, y, 1.3, 0.9, P.raisin, { transform: `rotate(${f(R() * 180)} ${f(x)} ${f(y)})` });
        else if (kind < 0.88) ell(g, x, y, 1.6, 1.1, P.noisette);
        else ell(g, x, y, 1.4, 0.7, P.courge, { transform: `rotate(${f(R() * 180)} ${f(x)} ${f(y)})` });
      }
      circ(g, cx, cy, ri, rad(defs, [[0.6, '#FFFFFF', 0], [1, '#5E4020', 0.28]], { cx: 0.55, cy: 0.58, r: 0.6 }));
    }
    path(g, `M${pt(cx - r * 0.9, cy - r * 0.15)}A${f(r * 0.9)} ${f(r * 0.9)} 0 0 1 ${pt(cx - r * 0.15, cy - r * 0.9)}`, 'none', { stroke: '#FFFFFF', 'stroke-width': 1.2, opacity: 0.85, 'stroke-linecap': 'round' });
  }
  function drawPate(defs, g, cx, cy) {
    circ(g, cx, cy, 14.6, '#DCE7E8', { opacity: 0.9 });
    circ(g, cx, cy, 12.4, rad(defs, [[0, P.pateHi], [0.8, P.pate], [1, '#2E170E']], { cx: 0.42, cy: 0.4, r: 0.6 }));
    path(g, `M${pt(cx - 6, cy + 2)}c2 -6 9 -7 11 -2c1 3 -2 6 -5 5`, 'none', { stroke: '#8E5E42', 'stroke-width': 1.3, opacity: 0.7, 'stroke-linecap': 'round' });
    circ(g, cx, cy, 14.6, 'none', { stroke: '#FFFFFF', 'stroke-width': 1, opacity: 0.9 });
    circ(g, cx, cy, 15.4, 'none', { stroke: '#9FB5B8', 'stroke-width': 0.6 });
    path(g, `M${pt(cx - 2, cy + 3)}L${pt(cx - 18, cy + 18)}`, 'none', { stroke: P.argentSh, 'stroke-width': 2.8, 'stroke-linecap': 'round' });
    path(g, `M${pt(cx - 2, cy + 2.6)}L${pt(cx - 18, cy + 17.6)}`, 'none', { stroke: P.argent, 'stroke-width': 1.9, 'stroke-linecap': 'round' });
  }
  function drawPomme(defs, g, x, y, r, col, hi) {
    circ(g, x, y, r, rad(defs, [[0, hi], [0.6, col], [1, '#5E1A18']], { cx: 0.38, cy: 0.36, r: 0.7 }));
    circ(g, x + r * 0.1, y + r * 0.05, r * 0.22, '#5A3A1A', { opacity: 0.35 });
    path(g, `M${pt(x + r * 0.1, y)}l${f(r * 0.3)} ${f(-r * 0.5)}`, 'none', { stroke: '#5A3A1A', 'stroke-width': 1.1, 'stroke-linecap': 'round' });
    path(g, `M${pt(x + r * 0.4, y - r * 0.5)}c${f(r * 0.5)} ${f(-r * 0.4)} ${f(r * 0.9)} ${f(-r * 0.1)} ${f(r * 1)} ${f(r * 0.3)}c${f(-r * 0.4)} ${f(r * 0.1)} ${f(-r * 0.8)} ${f(r * 0.05)} ${f(-r * 1)} ${f(-r * 0.3)}Z`, '#5E9A3E');
    ell(g, x - r * 0.4, y - r * 0.4, r * 0.3, r * 0.15, '#FFFFFF', { opacity: 0.45, transform: `rotate(-38 ${f(x - r * 0.4)} ${f(y - r * 0.4)})` });
  }
  function drawFruits(defs, g, cx, cy, R) {
    circ(g, cx + 0.6, cy + 2.2, 46, '#D9D1C4');
    circ(g, cx, cy, 46, P.faience);
    circ(g, cx, cy, 46, rad(defs, [[0.65, '#FFFFFF', 0], [1, '#6E5E4C', 0.2]], { cx: 0.45, cy: 0.43, r: 0.58 }));
    for (let k = 0; k < 18; k++) { const a = (k / 18) * TAU; fleurette(g, cx + Math.cos(a) * 42.6, cy + Math.sin(a) * 42.6, 0.9, P.vert); }
    circ(g, cx, cy, 39, '#EFE8DB');
    // le raisin
    [[-18, -14], [-14, -18], [-22, -9], [-16, -8], [-12, -12], [-20, -3], [-14, -2], [-9, -6], [-24, -16], [-18, -21]].forEach(([dx, dy]) => {
      circ(g, cx + dx, cy + dy, 4.1, rad(defs, [[0, '#A06AA2'], [0.7, P.grain], [1, '#3A1E3C']], { cx: 0.38, cy: 0.36, r: 0.7 }));
      circ(g, cx + dx - 1.2, cy + dy - 1.3, 0.8, '#FFFFFF', { opacity: 0.5 });
    });
    path(g, `M${pt(cx - 18, cy - 22)}q2 -5 6 -6`, 'none', { stroke: '#6E5A30', 'stroke-width': 1.2 });
    // une poire, deux pommes, trois clémentines
    const poire = G(g, { transform: `translate(${f(cx + 16)} ${f(cy - 14)}) rotate(40)` });
    path(poire, 'M0 -13C4 -13 5 -7 5 -4C9 -1 10 7 5 11C2 13.4 -2 13.4 -5 11C-10 7 -9 -1 -5 -4C-5 -7 -4 -13 0 -13Z', rad(defs, [[0, '#EFDD8A'], [0.65, P.poire], [1, '#8C7A2A']], { cx: 0.38, cy: 0.5, r: 0.7 }));
    path(poire, 'M0 -13l1 -4', 'none', { stroke: '#5A3A1A', 'stroke-width': 1.1, 'stroke-linecap': 'round' });
    drawPomme(defs, g, cx + 14, cy + 14, 11, P.pomme, P.pommeHi);
    drawPomme(defs, g, cx - 6, cy + 20, 10.4, P.pommeVerte, '#DDEBA0');
    [[cx - 20, cy + 6], [cx - 4, cy + 3], [cx + 26, cy - 2]].forEach(([x, y], k) => {
      circ(g, x, y, 8.4, rad(defs, [[0, '#F8B25E'], [0.7, P.clementine], [1, '#A5511A']], { cx: 0.38, cy: 0.36, r: 0.7 }));
      for (let i = 0; i < 10; i++) circ(g, x + (R() - 0.5) * 11, y + (R() - 0.5) * 11, 0.4, '#C66A1E', { opacity: 0.5 });
      circ(g, x + 0.6, y + 0.4, 1, '#6E6A2A', { opacity: 0.6 });
      if (k !== 1) path(g, `M${pt(x + 1, y - 1)}c3 -4 8 -4 10 -1c-3 2 -7 3 -10 1Z`, '#4E8A3E');
    });
  }
  function drawGourmandises(defs, g, cx, cy, R) {
    drawPlate(defs, g, cx, cy, 35, 'rose');
    // trois petites madeleines, leur bosse et leurs rainures
    [[-12, -8, -30], [8, -12, 20], [-2, 10, 70]].forEach(([dx, dy, a]) => {
      const t = G(g, { transform: `translate(${f(cx + dx)} ${f(cy + dy)}) rotate(${a})` });
      const d = 'M-8.6 0C-8.6 -5.6 -4 -7.4 0 -7.4C4 -7.4 8.6 -5.6 8.6 0C8.6 3.6 6 6 0 6C-6 6 -8.6 3.6 -8.6 0Z';
      path(t, d, '#8E5A20', { opacity: 0.3, transform: 'translate(.8 1.2)' });
      path(t, d, rad(defs, [[0, P.madeleineHi], [0.7, P.madeleine], [1, '#9C6424']], { cx: 0.42, cy: 0.38, r: 0.66 }));
      [-5.4, -2.7, 0, 2.7, 5.4].forEach((x) => path(t, `M${f(x * 0.3)} 4.6L${x} -5.6`, 'none', { stroke: '#A8702E', 'stroke-width': 0.6, opacity: 0.6 }));
    });
    // des truffes au cacao, un mini-cookie
    [[14, 8], [20, -2], [10, 16]].forEach(([dx, dy]) => {
      circ(g, cx + dx, cy + dy, 4.2, P.truffe);
      for (let i = 0; i < 8; i++) circ(g, cx + dx + (R() - 0.5) * 6, cy + dy + (R() - 0.5) * 6, 0.45, '#8A5A40', { opacity: 0.7 });
    });
    path(g, blob(cx - 16, cy + 12, 6, 5.8, 10, 0.08, R), P.cookie);
    for (let i = 0; i < 3; i++) circ(g, cx - 16 + (R() - 0.5) * 6, cy + 12 + (R() - 0.5) * 6, 0.9, P.pepite);
  }

  /* ======================================================================
     La table dressée
     ====================================================================== */
  // cle : la ligne de la formule ou du buffet qu'il montre ; nom : ce qui s'affiche quand on le touche
  const NOMS = {
    plat: 'Un plat salé au choix, et sa salade composée',
    boisson: 'Une boisson chaude : café, thé ou chocolat chaud',
    jus: 'Un jus de pomme',
    cookie: 'Le cookie de L’Armoire',
    pain: 'Le pain des tartines',
    beurre: 'Le beurre',
    confitures: 'Les confitures, maison pour la plupart',
    miel: 'Le miel de la Miellerie de Grattepaille',
    'fromage-blanc': 'Le fromage blanc',
    muesli: 'Le muesli',
    'pates-a-tartiner': 'Les pâtes à tartiner',
    fruits: 'Les fruits frais',
    gourmandises: 'Les petites gourmandises',
  };

  function create(hote, { etiquette, scene } = {}) {
    const R = AC.rng(2026);
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, class: 'tablee-svg', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' });
    svg.style.webkitTapHighlightColor = 'transparent';
    const defs = S('defs', {}, svg);
    const flou = AC.uid('tbf');
    S('feGaussianBlur', { stdDeviation: 2.6 }, S('filter', { id: flou, filterUnits: 'userSpaceOnUse', x: -30, y: -30, width: W + 60, height: H + 60 }, defs));
    const L = { table: G(svg), chemin: G(svg), ombres: G(svg, { filter: `url(#${flou})`, opacity: 0.3 }), objets: G(svg), vie: G(svg, { 'pointer-events': 'none' }) };
    drawTable(defs, L.table, R);
    const chemin = drawRunner(defs, L.chemin);

    const objets = [];
    // un objet de la table : son dessin, son ombre (dans le calque des ombres), sa ligne
    function objet(cle, cx, cy, r, ombre) {
      const g = G(L.objets, { class: 'tb-objet' });
      g.dataset.cle = cle;
      g.style.transformBox = 'fill-box';
      g.style.transformOrigin = '50% 50%';
      const o = G(L.ombres);
      if (ombre) ombre(o); else circ(o, cx + 3.2, cy + 4.4, r, '#0E3032');
      const it = { cle, g, o, cx, cy, r };
      objets.push(it);
      return it;
    }

    // --- les deux couverts : en haut (la place d'en face), en bas (la nôtre)
    const places = [
      { assiette: [156, 80], tasse: [244, 60, 'choco'], verre: [280, 108], cookie: [74, 52], couverts: [74, 108, -12], tarte: 'tomates', angT: 160 },
      { assiette: [246, 370], tasse: [156, 388, 'cafe'], verre: [120, 342], cookie: [330, 400], couverts: [330, 336, 12], tarte: 'betterave', angT: -20 },
    ];
    places.forEach((p) => {
      const [nx, ny, na] = p.couverts;
      const c = objet('couverts', nx, ny, 0, (o) => rect(o, nx - 11, ny - 27, 26, 60, '#0E3032', { transform: `rotate(${na} ${nx} ${ny})` }));
      drawCouverts(defs, c.g, nx, ny, na);
      const [ax, ay] = p.assiette;
      const a = objet('plat', ax, ay, 52);
      drawPlate(defs, a.g, ax, ay, 52, 'bleu');
      const th = (p.angT * Math.PI) / 180;
      drawSalade(defs, a.g, ax + Math.cos(th + Math.PI) * 19, ay + Math.sin(th + Math.PI) * 19, R);
      drawTarte(defs, a.g, ax + Math.cos(th + Math.PI) * 6, ay + Math.sin(th + Math.PI) * 6, p.angT, p.tarte, R);
      const t = objet('boisson', p.tasse[0], p.tasse[1], 24);
      drawCup(defs, t.g, p.tasse[0], p.tasse[1], p.tasse[2], R);
      t.vapeur = [p.tasse[0], p.tasse[1]];
      const v = objet('jus', p.verre[0], p.verre[1], 13);
      drawGlass(defs, v.g, p.verre[0], p.verre[1]);
      const k = objet('cookie', p.cookie[0], p.cookie[1], 20);
      drawCookie(defs, k.g, p.cookie[0], p.cookie[1], 12.5, R);
    });

    // --- du décor : un bouquet, le pot à lait
    const bq = objet('deco', 352, 62, 22);
    drawBouquet(defs, bq.g, 352, 62, R);
    const lait = objet('deco', 60, 396, 16);
    drawLait(defs, lait.g, 60, 396);

    // --- le buffet, sur le chemin de lin
    const pain = objet('pain', 70, 198, 0, (o) => ell(o, 73, 203, 58, 40, '#0E3032'));
    drawPain(defs, pain.g, 70, 198, R);
    const fruits = objet('fruits', 190, 196, 46);
    drawFruits(defs, fruits.g, 190, 196, R);
    const gour = objet('gourmandises', 318, 188, 35);
    drawGourmandises(defs, gour.g, 318, 188, R);
    [[40, 266, P.fraise, 'vichy'], [80, 274, P.fraise, 'ouvert'], [116, 258, P.abricot, 'ouvert']].forEach(([x, y, c, k]) => {
      const j = objet('confitures', x, y, k === 'vichy' ? 18 : 15.4);
      drawConfiture(defs, j.g, x, y, c, k, R);
    });
    const miel = objet('miel', 156, 276, 16);
    drawMiel(defs, miel.g, 156, 276);
    const beurre = objet('beurre', 212, 266, 0, (o) => rect(o, 212 - 28, 266 - 16, 62, 40, '#0E3032', { rx: 11 }));
    drawBeurre(defs, beurre.g, 212, 266);
    const fb = objet('fromage-blanc', 272, 272, 22);
    drawBol(defs, fb.g, 272, 272, 22, 'fromage', R);
    const mu = objet('muesli', 322, 262, 22);
    drawBol(defs, mu.g, 322, 262, 22, 'muesli', R);
    const pate = objet('pates-a-tartiner', 368, 282, 15.4);
    drawPate(defs, pate.g, 368, 282);

    /* ---------- la vapeur des deux tasses ---------- */
    const volutes = [];
    objets.filter((o) => o.vapeur).forEach((o, i) => {
      const [x, y] = o.vapeur;
      for (let k = 0; k < 3; k++) {
        const w = path(L.vie, `M${pt(x - 4 + k * 4, y - 2)}c-3 -5 3 -8 0 -13s3 -8 0 -13`, 'none', { stroke: '#FFFFFF', 'stroke-width': 2.4, 'stroke-linecap': 'round', opacity: 0 });
        w.style.transformBox = 'fill-box';
        w.style.transformOrigin = '50% 100%';
        volutes.push([w, i * 3 + k]);
      }
    });

    (scene || hote).appendChild(svg);

    /* ---------- les calques : le chemin de lin, chaque ombre (floutée une fois pour toutes), chaque plat, les volutes,
       chacun sur son <svg> (AC.monde) : la table se dresse, un plat se pose sur son ombre, la vapeur monte… sur le
       compositeur, sans jamais repeindre la table ni recalculer le flou des ombres ---------- */
    const monde = AC.monde(svg);
    const cChemin = monde.calque(chemin, { marge: 2 });
    objets.forEach((o) => {
      o.c = monde.calque(o.g, { marge: 2, cible: true });
      const bb = o.o.getBBox();
      o.co = monde.calque(o.o, { marge: 9 });
      o.co.svg.style.transformOrigin = `${f(bb.x + bb.width / 2 - o.co.x)}px ${f(bb.y + bb.height / 2 - o.co.y)}px`;
    });
    const cVolutes = volutes.map(([w]) => {
      const bb = w.getBBox(), c = monde.calque(w, { marge: 2 });
      c.svg.style.transformOrigin = `${f(bb.x + bb.width / 2 - c.x)}px ${f(bb.y + bb.height - c.y)}px`;
      w.setAttribute('opacity', 1);
      c.svg.style.opacity = 0;
      return c;
    });

    /* ---------- toucher un plat : il se présente ---------- */
    let etiqT = 0;
    function montre(cle, { son = true } = {}) {
      const its = objets.filter((o) => o.cle === cle);
      if (!its.length) return;
      if (!AC.reduced) its.forEach((o, k) => {
        o.c.svg.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.09)', offset: 0.35 }, { transform: 'scale(.98)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 520, delay: k * 70, easing: 'ease-out' });
        o.co.svg.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(1.5px, 2.5px) scale(1.07)', opacity: 0.72, offset: 0.35 }, { transform: 'none', opacity: 1 }], { duration: 520, delay: k * 70, easing: 'ease-out' });
      });
      if (son && AC.sfx) AC.sfx.play(SON[cle] || 'plate', { gain: 0.6, m: NOTE[cle] }); // (sa note de l'air de la tablée)
      if (etiquette && NOMS[cle]) {
        const o = its[0], b = svg.getBoundingClientRect(), hb = hote.getBoundingClientRect();
        const k = Math.max(b.width / W, b.height / H), ox = (b.width - W * k) / 2, oy = (b.height - H * k) / 2;
        const x = b.left - hb.left + ox + o.cx * k, y = b.top - hb.top + oy + (o.cy - (o.r || 24)) * k;
        etiquette.textContent = AC.t(NOMS[cle]);
        etiquette.hidden = false;
        // l'étiquette reste dans le cadre ; sa pointe vise toujours le plat
        const lw = etiquette.offsetWidth, gauche = Math.max(lw / 2 + 8, Math.min(hb.width - lw / 2 - 8, x));
        etiquette.style.left = gauche + 'px';
        etiquette.style.top = Math.max(10, y - 6) + 'px';
        etiquette.style.setProperty('--queue', Math.max(-lw / 2 + 14, Math.min(lw / 2 - 14, x - gauche)) + 'px');
        etiquette.classList.remove('on');
        void etiquette.offsetWidth;
        etiquette.classList.add('on');
        clearTimeout(etiqT);
        etiqT = setTimeout(() => etiquette.classList.remove('on'), 2400);
      }
      hote.dispatchEvent(new CustomEvent('tablee', { detail: { cle } }));
    }
    (scene || hote).addEventListener('click', (e) => {
      const g = e.target.closest && e.target.closest('.tb-objet');
      if (g && g.dataset.cle !== 'couverts' && g.dataset.cle !== 'deco') montre(g.dataset.cle);
    });

    /* ---------- la table se dresse ---------- */
    const ORDRE = ['couverts', 'deco', 'plat', 'boisson', 'jus', 'cookie', 'pain', 'fruits', 'gourmandises', 'confitures', 'miel', 'beurre', 'fromage-blanc', 'muesli', 'pates-a-tartiner'];
    const SON = { deco: 'clink', couverts: 'spoon', plat: 'plate', boisson: 'clink', jus: 'clink', cookie: 'pop', pain: 'plate', fruits: 'plate', gourmandises: 'plate', confitures: 'clink', miel: 'clink', beurre: 'plate', 'fromage-blanc': 'clink', muesli: 'clink', 'pates-a-tartiner': 'clink' };
    // L'air de la tablée : chaque objet posé joue une note avec son propre son (la cuillère, l'assiette, la tasse, le
    // cookie), et la table se dresse sur une petite valse en sol majeur (celle de la boîte à musique de l'ouverture) :
    // une question qui monte et redescend, puis la réponse — les confitures grimpent jusqu'au miel, et la pâte à
    // tartiner se pose sur sol. [note MIDI, durée jusqu'à l'objet suivant, en croches], dans l'ordre de la pose.
    const CROCHE = 150;
    const AIR = [
      [83, 1], [86, 1], // les couverts (l'anacrouse)
      [91, 2], [90, 1], // la déco
      [88, 1], [86, 2], // les plats
      [83, 1], [84, 1], // les chocolats
      [86, 1], [88, 1], // les jus
      [86, 1], [83, 2], // les cookies : la question
      [81, 1], [84, 1], [88, 2], // le pain, les fruits, les gourmandises
      [86, 0.5], [88, 0.5], [90, 0.5], // les confitures, qui montent vite
      [91, 2], // le miel, tout en haut
      [86, 1], [83, 1], [81, 1], // le beurre, le fromage blanc, le muesli
      [79, 3], // la pâte à tartiner : la réponse, sur sol
    ];
    const NOTE = {}; // (la note de chaque plat : celle de son premier objet ; on la rejoue en le touchant)
    { let k = 0; ORDRE.forEach((cle) => objets.filter((o) => o.cle === cle).forEach(() => { if (AIR[k] && NOTE[cle] == null) NOTE[cle] = AIR[k][0]; k++; })); }
    // (l'air a son canal : on le coupe net si l'on quitte l'onglet pendant qu'il joue)
    const voix = AC.sfx && AC.sfx.channel ? AC.sfx.channel(1) : { play: (n, o) => AC.sfx && AC.sfx.play(n, o), cut() {} };
    if (AC.on) AC.on('view', (v) => { if (v !== 'brunch') voix.cut(); });
    function pose() { objets.forEach((o) => { o.c.svg.style.opacity = ''; o.co.svg.style.opacity = ''; }); cChemin.svg.style.transform = ''; }
    /** la table vide (construite d'avance, avant d'être dressée) */
    function cache() { objets.forEach((o) => { o.c.svg.style.opacity = '0'; o.co.svg.style.opacity = '0'; }); cChemin.svg.style.transformOrigin = '0 50%'; cChemin.svg.style.transform = 'scaleX(0)'; }
    async function dresser() {
      if (AC.reduced) { pose(); vie(); return; }
      objets.forEach((o) => { o.c.svg.style.opacity = '0'; o.co.svg.style.opacity = '0'; });
      cChemin.svg.style.transformOrigin = '0 50%';
      cChemin.svg.style.transform = '';
      await cChemin.svg.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 650, easing: 'cubic-bezier(.3,.8,.3,1)' }).finished.catch(() => {});
      // les notes sont toutes données d'avance à l'horloge du son (un minuteur, lui, flotte : l'air boiterait) ; chaque
      // objet apparaît avec la sienne
      let t = 0, k = 0;
      ORDRE.forEach((cle) => {
        objets.filter((o) => o.cle === cle).forEach((o) => {
          const [m, d] = AIR[k++] || [null, 1];
          if (AC.sfx) voix.play(SON[cle] || 'plate', { gain: 0.45, m, tenue: k === AIR.length ? 2.4 : 1, delay: t + 1 });
          setTimeout(() => {
            o.c.svg.style.opacity = '';
            o.c.svg.animate([{ opacity: 0, transform: 'translateY(-10px) scale(1.12)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.3,1.3,.5,1)' });
            // son ombre arrive avec lui : large et pâle tant qu'il est haut, nette quand il touche la table
            o.co.svg.style.opacity = '';
            o.co.svg.animate([{ opacity: 0, transform: 'translate(4px, 7px) scale(1.22)' }, { opacity: 0.55, offset: 0.45 }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.3,.8,.4,1)' });
          }, t);
          t += d * CROCHE;
        });
      });
      await AC.wait(t + 400);
      vie();
    }
    /* ---------- la vie : la vapeur des tasses ---------- */
    let vivant = false;
    function vie() {
      if (vivant) return;
      vivant = true;
      volutes.forEach(([w, k], i) => {
        const c = cVolutes[i].svg;
        if (AC.reduced) { c.style.opacity = 0.3; return; }
        AC.ambiance.joue(c.animate([
          { opacity: 0, transform: 'translate(0px, 4px) scale(.7, .8)' },
          { opacity: 0.55, offset: 0.35 },
          { opacity: 0, transform: `translate(${k % 2 ? 4 : -3}px, -18px) scale(1.2, 1.3)` },
        ], { duration: 2600 + (k % 3) * 400, delay: k * 420, iterations: Infinity, easing: 'ease-out', fill: 'backwards' }), hote);
      });
    }
    return { dresser, pose, cache, vie, montre, cles: Object.keys(NOMS) };
  }

  AC.Tablee = { create, NOMS };
})();
