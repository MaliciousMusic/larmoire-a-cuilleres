/* ==========================================================================
   L'Armoire à Cuillères — la comptine du fait-maison (onglet Nous)
   Leur panneau « ICI ON POCHE, ON CRÈME… » devient une petite histoire. Au premier
   plan du salon, en grand : le comptoir (plan de travail en hêtre, étagère de la matière
   première, four encastré) et Mallo, vue de dos : chignon piqué d'une baguette-cuillère,
   chouchou bleu, marinière, tablier croisé.
   À chaque verbe, elle fait le geste : elle poche des rosaces sur le gâteau, crème le
   beurre dans la bassine en cuivre, pose une fraise, blanchit les jaunes, saupoudre,
   fouette, glace, zeste, enfourne une plaque de choux, émulsionne une ganache, nappe de
   caramel, caramélise au chalumeau… puis chérit leur matière première, ingrédient par
   ingrédient. Elle le dit dans une bulle de dialogue, sous elle, comme dans un jeu :
   une page à la fois, lettre à lettre.
   Premier plan dessiné dans le SVG du salon, agrandi (PLAN) ; le cadrage suit l'écran :
   le salon le remplit, le haut de la bulle tombe juste sous le four.
   Bras articulés : épaule → coude → main (cinématique inverse à deux segments) ;
   l'outil change à chaque geste.
   API : AC.Conte.create(salon, bulle) → { jouer(), fin(), arreter(), entree(), joue }
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});
  const S = (tag, attrs, parent) => AC.svg(tag, attrs, parent);
  const f = (n) => Math.round(n * 100) / 100;
  const TAU = Math.PI * 2;
  const pt = (q) => f(q[0]) + ' ' + f(q[1]);
  const rect = (p, x, y, w, h, fill, extra = {}) => S('rect', { x: f(x), y: f(y), width: f(w), height: f(h), fill, ...extra }, p);
  const path = (p, d, fill, extra = {}) => S('path', { d, fill, ...extra }, p);
  const ell = (p, cx, cy, rx, ry, fill, extra = {}) => S('ellipse', { cx: f(cx), cy: f(cy), rx: f(rx), ry: f(ry), fill, ...extra }, p);
  const circ = (p, cx, cy, r, fill, extra = {}) => S('circle', { cx: f(cx), cy: f(cy), r: f(r), fill, ...extra }, p);
  const G = (p, attrs) => S('g', attrs || {}, p);
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function ellD(cx, cy, rx, ry, rot = 0) {
    const c = Math.cos((rot * Math.PI) / 180), s = Math.sin((rot * Math.PI) / 180);
    const a = [cx - rx * c, cy - rx * s], b = [cx + rx * c, cy + rx * s];
    return `M${pt(a)}A${f(rx)} ${f(ry)} ${f(rot)} 1 0 ${pt(b)}A${f(rx)} ${f(ry)} ${f(rot)} 1 0 ${pt(a)}Z`;
  }
  /** un membre : de A à B, largeurs w0 → w1, bouts arrondis */
  function tube(A, B, w0, w1) {
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const a1 = [A[0] + (nx * w0) / 2, A[1] + (ny * w0) / 2], a2 = [A[0] - (nx * w0) / 2, A[1] - (ny * w0) / 2];
    const b1 = [B[0] + (nx * w1) / 2, B[1] + (ny * w1) / 2], b2 = [B[0] - (nx * w1) / 2, B[1] - (ny * w1) / 2];
    return `M${pt(a1)}L${pt(b1)}A${f(w1 / 2)} ${f(w1 / 2)} 0 0 0 ${pt(b2)}L${pt(a2)}A${f(w0 / 2)} ${f(w0 / 2)} 0 0 0 ${pt(a1)}Z`;
  }
  /** une bande en travers d'un membre (les rayures de la marinière), entre t0 et t1 */
  function bande(A, B, t0, t1, w) {
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const p = (t, s) => { const k = (w(t) / 2) * s; return [A[0] + dx * t + nx * k, A[1] + dy * t + ny * k]; };
    return `M${pt(p(t0, 1))}L${pt(p(t1, 1))}L${pt(p(t1, -1))}L${pt(p(t0, -1))}Z`;
  }
  const coeurD = (x, y, s) => `M${f(x)} ${f(y + 2.6 * s)}C${f(x - 4.4 * s)} ${f(y - 0.6 * s)} ${f(x - 2.8 * s)} ${f(y - 4.4 * s)} ${f(x)} ${f(y - 2 * s)}C${f(x + 2.8 * s)} ${f(y - 4.4 * s)} ${f(x + 4.4 * s)} ${f(y - 0.6 * s)} ${f(x)} ${f(y + 2.6 * s)}Z`;

  const P = {
    skin: '#E5B592', skinSh: '#C48D6B', skinHi: '#F4D0B2',
    hair: '#3A2217', hairMid: '#5A3522', hairHi: '#8E5D3C',
    shirt: '#F4EDE1', shirtSh: '#D8CDBC', stripe: '#2E3F68',
    apron: '#3D7C80', apronHi: '#5E9C9D', apronSh: '#2A5B5E',
    scrunch: '#5FAEE3', scrunchSh: '#2F76B0', scrunchHi: '#B4DDF6',
    spoon: '#C38D55', spoonSh: '#8C5D30',
    beech: '#D6A86F', beechHi: '#EFCB94', beechSh: '#A87848',
    wood: '#3B2723', woodMid: '#4A332D', woodEdge: '#6B4E44', woodDark: '#241714', hollow: '#20140F',
    copper: '#C4703F', copperHi: '#F3B17D', copperSh: '#7C391B',
    enamel: '#EDE4D3', enamelSh: '#C9BCA6', mint: '#A1D4D5', mintDark: '#6FA8AA',
    brass: '#C9A45C', brassHi: '#F3DFA8', brassSh: '#7C5E2A',
    milk: '#F7F5F0', milkSh: '#D9D6D0',
    sponge: '#E2B676', spongeTop: '#F2D8A5', spongeSh: '#B98749',
    cream: '#FFF9EF', creamSh: '#E8DAC3',
    straw: '#D8373F', leaf: '#4E8A3E',
    caramel: '#D9922F', glaze: '#F2A2B5', glazeSh: '#D97891',
    lemon: '#F2D33C', lemonSh: '#C9A91E', steel: '#CDD1D5', steelSh: '#8B9197',
    fuchsia: '#E64AA8', prune: '#6C2383', turquoise: '#3FC7EE', aqua: '#A6E6DC', marine: '#13365E',
  };

  /* ---------- le premier plan : ses repères ---------- */
  const CX = 204;                                // Mallo, au milieu
  const TOP = { far: 467, near: 489 };           // le plan de travail (arête du fond, nez)
  const SHO = { L: [177, 470], R: [231, 470] };  // les épaules (elle est mince)
  const LU = 45, LF = 44;                        // bras, avant-bras
  // les mains au repos, posées sur le comptoir devant elle (cachées par son dos, les bras le long du corps) ;
  // le 3e nombre : l'avant-bras fuit vers le comptoir (1 : droit devant, très raccourci ; 0 : de profil)
  const REST = { L: [186, 486, 0.42], R: [222, 486, 0.42] };
  const BOWL = { x: 113, y: 470, rx: 24, ry: 6 };           // la bassine en cuivre : son bord
  const CAKE = { x: 297, y: 444, rx: 23, ry: 5.4, h: 17 };  // le gâteau : son dessus
  const OVEN = { x: 250, y: 497, w: 82, h: 60 };            // le four, dans la face du comptoir
  // Le premier plan est dessiné à l'échelle du salon, puis agrandi et descendu : le haut du chignon
  // (y = 385) tombe en y = 400, sous le guéridon ; le comptoir déborde des deux côtés de l'écran.
  const ZOOM = 1.4;
  const PLAN = `translate(${CX} 400) scale(${ZOOM}) translate(${-CX} -385)`;
  const versSalon = (y) => 400 + (y - 385) * ZOOM;
  const ANCRE = versSalon(562); // le haut de la bulle de dialogue : juste sous le four
  const CONTENU = { beurre: '#EFD08A', creme: '#F6E4B9', jaunes: '#F1C23B', blanchi: '#F8EAC2', chantilly: '#FFFCF5', choco: '#5A2E1A', ganache: '#6B3A22' };

  /* ======================================================================
     Le dessin
     ====================================================================== */
  function lin(defs, stops, { x1 = 0, y1 = 0, x2 = 0, y2 = 1, units } = {}) {
    const id = AC.uid('co');
    const g = S('linearGradient', { id, x1, y1, x2, y2, gradientUnits: units }, defs);
    stops.forEach(([o, c, a]) => S('stop', { offset: o, 'stop-color': c, 'stop-opacity': a == null ? 1 : a }, g));
    return `url(#${id})`;
  }
  function rad(defs, stops, { cx = 0.5, cy = 0.5, r = 0.5, fx, fy, units } = {}) {
    const id = AC.uid('co');
    const g = S('radialGradient', { id, cx, cy, r, fx, fy, gradientUnits: units }, defs);
    stops.forEach(([o, c, a]) => S('stop', { offset: o, 'stop-color': c, 'stop-opacity': a == null ? 1 : a }, g));
    return `url(#${id})`;
  }

  /** Le plan de travail en hêtre (bloc de bout), vu d'en haut */
  function drawTop(defs, g) {
    path(g, `M-160 ${TOP.far}H560V${TOP.near}H-160Z`, lin(defs, [[0, P.beechSh], [0.3, P.beech], [1, '#DFB47C']]));
    const rows = [], joints = [];
    for (let y = TOP.far + 4.4, r = 0; y < TOP.near - 1; y += 4.4, r++) rows.push(`M-160 ${f(y)}H560`);
    for (let y = TOP.far, r = 0; y < TOP.near - 1; y += 4.4, r++) {
      for (let x = -160 + (r % 2) * 12; x < 560; x += 24) joints.push(`M${f(x)} ${f(y)}v${f(Math.min(4.4, TOP.near - y))}`);
    }
    path(g, rows.join(''), 'none', { stroke: '#B7844F', 'stroke-width': 0.45, opacity: 0.5 });
    path(g, joints.join(''), 'none', { stroke: '#AE7A46', 'stroke-width': 0.4, opacity: 0.45 });
    path(g, `M-160 ${TOP.far}H560`, 'none', { stroke: '#7E5530', 'stroke-width': 1, opacity: 0.55 });
    // la lumière du salon glisse sur le plan (plus clair au milieu, les bouts dans l'ombre)
    path(g, `M-160 ${TOP.far}H560V${TOP.near}H-160Z`, lin(defs, [[0, '#1E0F07', 0.45], [0.3, '#1E0F07', 0], [0.7, '#1E0F07', 0], [1, '#1E0F07', 0.4]], { x1: -160, y1: 0, x2: 560, y2: 0, units: 'userSpaceOnUse' }));
  }

  /** La face du comptoir, côté cuisine : traverse, étagère ouverte de la matière première (à gauche),
   *  four encastré (à droite) ; elle descend jusque sous la bulle. Rend le groupe de l'étagère. */
  function drawFace(defs, g) {
    const Y0 = TOP.near, Y1 = 760;
    rect(g, -160, Y0, 720, Y1 - Y0, P.wood);
    // un panneau, plus bas (sous la bulle, on n'en voit que le haut)
    rect(g, -160, Y0 + 58, 720, 1.2, '#000', { opacity: 0.3 });
    rect(g, -160, Y0 + 59.2, 720, 0.8, P.woodEdge, { opacity: 0.5 });
    // l'étagère ouverte, à gauche de Mallo : le creux, la matière première, le chant de la planche
    const x0 = -160, x1 = 150, h0 = Y0 + 9, h1 = Y0 + 47;
    rect(g, x0, h0, x1 - x0, h1 - h0, P.hollow);
    rect(g, x0, h0, x1 - x0, h1 - h0, lin(defs, [[0, '#000', 0.5], [0.4, '#000', 0], [1, '#000', 0.12]]));
    rect(g, x1 - 3, h0, 3, h1 - h0, '#000', { opacity: 0.35 });
    const etagere = G(g);
    rect(g, x0 - 2, h1 - 4.4, x1 - x0 + 2, 4.4, P.woodMid);
    rect(g, x0 - 2, h1 - 4.4, x1 - x0 + 2, 1, P.woodEdge);
    // la traverse du haut, par-dessus
    rect(g, -160, Y0, 720, 7, P.woodMid);
    rect(g, -160, Y0, 720, 1.3, P.woodEdge);
    rect(g, -160, Y0 + 7, 720, 1.4, '#000', { opacity: 0.35 });
    // les bouts du comptoir dans la pénombre du salon
    rect(g, -160, Y0, 720, Y1 - Y0, lin(defs, [[0, '#0C0603', 0.5], [0.28, '#0C0603', 0], [0.72, '#0C0603', 0], [1, '#0C0603', 0.45]], { x1: -160, y1: 0, x2: 560, y2: 0, units: 'userSpaceOnUse' }));
    return etagere;
  }

  /** Le four encastré : sa porte bascule vers nous, la plaque de choux y entre, il s'allume */
  function drawOven(defs, g) {
    const { x, y, w, h } = OVEN;
    const o = G(g, { class: 'co-four' });
    rect(o, x, y, w, h, P.enamel, { rx: 3 });
    rect(o, x, y, w, h, lin(defs, [[0, '#fff', 0.3], [1, '#000', 0.14]]), { rx: 3 });
    rect(o, x + 2.5, y + 2.5, w - 5, 7, P.mintDark, { rx: 1.8 });
    [x + 11, x + 21, x + w - 11].forEach((kx) => { circ(o, kx, y + 6, 2.3, '#F5F0E6'); path(o, `M${kx} ${y + 4.1}v1.9`, 'none', { stroke: P.woodDark, 'stroke-width': 0.7 }); });
    const voyant = circ(o, x + 34, y + 6, 1.3, '#5E4632');
    rect(o, x + 5, y + 12.5, w - 10, h - 16, '#140B07', { rx: 2 });
    const four = { glow: [], voyant };
    four.glow.push(rect(o, x + 5, y + 12.5, w - 10, h - 16, rad(defs, [[0, '#FFB45E', 0.9], [0.6, '#E0702E', 0.55], [1, '#7A2E12', 0.25]]), { rx: 2, opacity: 0 }));
    path(o, `M${x + 8} ${y + 34}h${w - 16}M${x + 8} ${y + 47}h${w - 16}`, 'none', { stroke: '#4E4036', 'stroke-width': 0.8 });
    // la plaque de choux, une fois enfournée (cachée d'ici là)
    four.plaque = G(o, { opacity: 0 });
    drawTray(four.plaque, x + 18, y + 33.4);
    // la porte, charnière en bas
    four.hinge = y + h - 3.5;
    four.door = G(o, { class: 'co-four-porte' });
    const d = four.door;
    rect(d, x + 4, y + 11.5, w - 8, h - 15, P.enamel, { rx: 3, stroke: P.enamelSh, 'stroke-width': 0.8 });
    rect(d, x + 13, y + 19.5, w - 26, h - 33, '#2A1C14', { rx: 4 });
    // par la vitre, les choux qui cuisent (quand la plaque est dedans)
    four.vitrePlaque = G(d, { opacity: 0 });
    const cid = AC.uid('cov');
    S('rect', { x: x + 13, y: y + 19.5, width: w - 26, height: h - 33, rx: 4 }, S('clipPath', { id: cid }, defs));
    drawTray(G(four.vitrePlaque, { 'clip-path': `url(#${cid})` }), x + 18, y + 33.4);
    four.glow.push(rect(d, x + 13, y + 19.5, w - 26, h - 33, rad(defs, [[0, '#FFC46E', 0.7], [0.7, '#E57B2E', 0.55], [1, '#8F3A16', 0.5]]), { rx: 4, opacity: 0 }));
    path(d, `M${x + 16} ${y + 21.5}h9l-12 15z`, '#fff', { opacity: 0.12 });
    rect(d, x + 14, y + 14.6, w - 28, 2.4, lin(defs, [[0, P.brassHi], [0.5, P.brass], [1, P.brassSh]], { x1: 0, y1: 0, x2: 1, y2: 0 }), { rx: 1.2 });
    return four;
  }
  /** Une plaque de pâtisserie : la tôle et cinq choux dorés (x : bord gauche, y : dessus de la tôle) */
  function drawTray(p, x, y) {
    rect(p, x, y, 46, 3, '#6E757B', { rx: 1 });
    rect(p, x, y, 46, 0.9, '#A9B0B6', { rx: 0.5 });
    for (let k = 0; k < 5; k++) {
      const cx = x + 5 + k * 9;
      path(p, `M${f(cx - 4)} ${f(y)}C${f(cx - 4)} ${f(y - 5.2)} ${f(cx + 4)} ${f(y - 5.2)} ${f(cx + 4)} ${f(y)}Z`, '#D9A24E');
      path(p, `M${f(cx - 2.2)} ${f(y - 2.6)}C${f(cx - 1.6)} ${f(y - 4)} ${f(cx + 0.6)} ${f(y - 4.2)} ${f(cx + 1.4)} ${f(y - 3.8)}`, 'none', { stroke: '#F4CB82', 'stroke-width': 0.8, 'stroke-linecap': 'round' });
    }
  }

  /** La bassine en cuivre : le fond et son contenu (sous l'outil), la paroi avant (par-dessus) */
  function drawBowl(defs, back, front) {
    const { x, y, rx, ry } = BOWL;
    const b = {};
    ell(back, x, y, rx, ry, lin(defs, [[0, P.copperSh], [0.6, '#9C4C27'], [1, '#B7613A']]));
    b.contenu = ell(back, x, y + 1.3, rx - 3.6, ry - 1.7, CONTENU.beurre);
    b.reflet = ell(back, x - 5, y + 0.6, 6, 1.1, '#fff', { opacity: 0.22 });
    b.texture = G(back); // les pics de chantilly, la spirale de la ganache
    b.pics = G(b.texture, { opacity: 0 });
    [[-10, 0.6], [-4.5, -0.6], [1.5, 0.4], [7.5, -0.4], [12, 0.8], [-7, 2.2], [4.5, 2]].forEach(([dx, dy]) => {
      path(b.pics, `M${f(x + dx - 3.2)} ${f(y + 2 + dy)}C${f(x + dx - 2)} ${f(y - 1.5 + dy)} ${f(x + dx)} ${f(y - 3.6 + dy)} ${f(x + dx + 0.6)} ${f(y - 4.4 + dy)}C${f(x + dx + 0.8)} ${f(y - 2.4 + dy)} ${f(x + dx + 2.4)} ${f(y - 0.6 + dy)} ${f(x + dx + 3.2)} ${f(y + 2 + dy)}Z`, '#FFFFFF');
      path(b.pics, `M${f(x + dx + 0.6)} ${f(y - 4.2 + dy)}C${f(x + dx + 1)} ${f(y - 2 + dy)} ${f(x + dx + 2)} ${f(y + dy)} ${f(x + dx + 2.8)} ${f(y + 1.6 + dy)}`, 'none', { stroke: '#E4DACB', 'stroke-width': 0.6 });
    });
    b.spirale = path(b.texture, `M${x} ${y + 1.3}` + Array.from({ length: 24 }, (_, k) => { const a = k * 0.62, r = 1 + k * 0.62; return `L${f(x + Math.cos(a) * r)} ${f(y + 1.3 + Math.sin(a) * r * 0.22)}`; }).join(''), 'none', { stroke: '#F4E6CF', 'stroke-width': 1.3, opacity: 0, 'stroke-linecap': 'round' });
    b.spirale.style.transformBox = 'fill-box';
    b.spirale.style.transformOrigin = '50% 50%';
    // la paroi avant, le bord roulé, un petit pied
    const cuivre = lin(defs, [[0, P.copperSh], [0.18, '#A9542B'], [0.38, P.copperHi], [0.55, P.copper], [1, '#6A2E14']], { x1: 0, y1: 0, x2: 1, y2: 0 });
    path(front, `M${x - rx} ${y}C${x - rx} ${y + 12} ${x - 12} ${y + 16.5} ${x} ${y + 16.5}C${x + 12} ${y + 16.5} ${x + rx} ${y + 12} ${x + rx} ${y}A${rx} ${ry} 0 0 1 ${x - rx} ${y}Z`, cuivre);
    path(front, `M${x - rx} ${y}A${rx} ${ry} 0 0 0 ${x + rx} ${y}`, 'none', { stroke: '#F7C396', 'stroke-width': 1.5 });
    path(front, `M${x - rx + 4} ${y + 6}C${x - rx + 6} ${y + 11} ${x - 10} ${y + 13.5} ${x - 4} ${y + 14}`, 'none', { stroke: '#FFD6AE', 'stroke-width': 1.2, opacity: 0.55, 'stroke-linecap': 'round' });
    path(front, `M${x - rx - 1} ${y + 2}c-4 0 -5 5 -1.2 6.4`, 'none', { stroke: P.copperSh, 'stroke-width': 1.4 }); // l'anneau
    ell(front, x, y + 17, 9, 1.8, P.copperSh);
    return b;
  }

  /** Le gâteau sur son présentoir en opaline, et tout ce qu'on lui fera */
  function drawCake(defs, g) {
    const { x, y, rx, ry, h } = CAKE;
    const c = {};
    // le présentoir
    ell(g, x, 486.5, 13, 2.8, P.milkSh);
    path(g, `M${x - 12} 486.5C${x - 9} 481 ${x - 3.4} 478.5 ${x - 3} ${y + h + 6}L${x + 3} ${y + h + 6}C${x + 3.4} 478.5 ${x + 9} 481 ${x + 12} 486.5Z`, lin(defs, [[0, '#E2E0DB'], [0.42, '#FFFFFF'], [1, '#C8C5BE']], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    const py = y + h + 3.4;
    ell(g, x, py + 1.8, 31, 6.4, P.milkSh);
    ell(g, x, py, 31, 6.4, lin(defs, [[0, '#FFFFFF'], [1, '#E8E5DF']]));
    path(g, `M${x - 31} ${py}A31 6.4 0 0 0 ${x + 31} ${py}`, 'none', { stroke: '#FFFFFF', 'stroke-width': 0.8, opacity: 0.8 });
    // le biscuit
    path(g, `M${x - rx} ${y}V${y + h}A${rx} ${ry} 0 0 0 ${x + rx} ${y + h}V${y}Z`, lin(defs, [[0, P.spongeSh], [0.28, P.sponge], [0.62, '#EBC487'], [1, P.spongeSh]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    path(g, `M${x - rx} ${y + h * 0.52}A${rx} ${ry} 0 0 0 ${x + rx} ${y + h * 0.52}`, 'none', { stroke: P.cream, 'stroke-width': 1.8 });
    path(g, `M${x - rx} ${y + h * 0.52 + 1.1}A${rx} ${ry} 0 0 0 ${x + rx} ${y + h * 0.52 + 1.1}`, 'none', { stroke: '#D9372F', 'stroke-width': 0.7, opacity: 0.65 });
    ell(g, x, y, rx, ry, P.spongeTop);
    // le glaçage rose : un anneau au bord, des coulures sur le côté
    c.glacage = G(g, { opacity: 0 });
    path(c.glacage, ellD(x, y, rx, ry) + ellD(x, y + 0.2, rx - 4.5, ry - 1.6), P.glaze, { 'fill-rule': 'evenodd' });
    path(c.glacage, `M${x - rx} ${y}A${rx} ${ry} 0 0 0 ${x + rx} ${y}`, 'none', { stroke: P.glazeSh, 'stroke-width': 0.8 });
    c.coulures = [-17, -10, -3, 4, 11, 17].map((dx, k) => {
      const yy = y + Math.sqrt(Math.max(0, 1 - (dx * dx) / (rx * rx))) * ry;
      const L = [7, 11, 6, 9, 12, 7][k];
      const d = path(g, `M${f(x + dx - 1.8)} ${f(yy - 0.5)}V${f(yy + L)}a1.8 1.8 0 0 0 3.6 0V${f(yy - 0.5)}Z`, P.glaze);
      d.dataset.top = yy;
      d.setAttribute('transform', `translate(0 ${f(yy)}) scale(1 0) translate(0 ${f(-yy)})`);
      return d;
    });
    // les rosaces (poche), triées du fond vers l'avant
    const pos = Array.from({ length: 8 }, (_, k) => { const a = ((k + 0.5) / 8) * TAU; return [x + Math.cos(a) * rx * 0.8, y + Math.sin(a) * ry * 0.72]; }).sort((a, b) => a[1] - b[1]);
    c.rosaces = pos.map(([rx0, ry0]) => {
      const r = G(g);
      const inner = G(r, { transform: `translate(${f(rx0)} ${f(ry0)})` });
      const s = G(inner, { class: 'co-rosace' });
      path(s, 'M-3.2 0.6C-3.4 -2.6 -1.4 -4.8 0.3 -5.4C1.8 -4.4 3.4 -2.6 3.2 0.6C1.8 1.8 -1.8 1.8 -3.2 0.6Z', P.cream);
      path(s, 'M-2.2 -0.4C-1.4 -2.8 1.4 -3 2 -1M-1.2 -2.6C-0.4 -4 0.8 -4.2 1 -3.6', 'none', { stroke: P.creamSh, 'stroke-width': 0.55, 'stroke-linecap': 'round' });
      const cap = path(s, 'M-1.6 -3.4C-0.8 -5.2 1.1 -5.4 1.7 -3.8C0.6 -3.1 -0.6 -3 -1.6 -3.4Z', '#9A5A22', { opacity: 0 });
      s.setAttribute('transform', 'scale(0)');
      return { s, cap, x: rx0, y: ry0 };
    });
    // la fraise, au milieu
    c.fraise = G(g, { transform: `translate(${x} ${y - 1})` });
    c.fraiseIn = G(c.fraise, { transform: 'scale(0)' });
    drawStrawberry(c.fraiseIn, 0, -6);
    // le sucre glace
    c.sucre = G(g, { opacity: 0 });
    ell(c.sucre, x, y, rx - 1, ry - 0.6, '#FFFFFF', { opacity: 0.45 });
    let dots = '';
    for (let k = 0; k < 70; k++) { const a = Math.random() * TAU, r = Math.sqrt(Math.random()); dots += ellD(x + Math.cos(a) * r * (rx - 2), y + Math.sin(a) * r * (ry - 1) - 1.2 * Math.random(), 0.45, 0.35); }
    path(c.sucre, dots, '#FFFFFF');
    // les zestes
    c.zestes = Array.from({ length: 16 }, () => {
      const a = Math.random() * TAU, r = 0.25 + Math.random() * 0.7;
      const zx = x + Math.cos(a) * r * (rx - 3), zy = y + Math.sin(a) * r * (ry - 1) - 1.6 - Math.random() * 1.4;
      return path(g, `M${f(zx - 1.2)} ${f(zy)}c0.6 -1 1.8 -1 2.4 0`, 'none', { stroke: P.lemon, 'stroke-width': 0.8, 'stroke-linecap': 'round', opacity: 0 });
    });
    // le filet de caramel (nappe)
    const zig = [];
    for (let k = 0; k <= 7; k++) { const t = k / 7; zig.push([x - rx * 0.75 + t * rx * 1.5, y + (k % 2 ? ry * 0.55 : -ry * 0.62) - 1.5]); }
    c.filet = path(g, 'M' + zig.map(pt).join('L'), 'none', { stroke: P.caramel, 'stroke-width': 1.1, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    c.filetLen = Math.ceil(zig.reduce((s, q, k) => (k ? s + Math.hypot(q[0] - zig[k - 1][0], q[1] - zig[k - 1][1]) : 0), 0)) + 2;
    c.filet.setAttribute('stroke-dasharray', String(c.filetLen));
    c.filet.setAttribute('stroke-dashoffset', String(c.filetLen));
    c.zig = zig;
    // l'étincelle de la fin
    c.etincelle = G(g, { transform: `translate(${x + 16} ${y - 12}) scale(0)` });
    path(c.etincelle, 'M0 -5L1 -1L5 0L1 1L0 5L-1 1L-5 0L-1 -1Z', '#FFF6D6');
    return c;
  }
  function drawStrawberry(p, x, y) {
    path(p, `M${x} ${y + 2}C${x + 4} ${y + 2} ${x + 5} ${y + 6} ${x + 2.8} ${y + 9.4}C${x + 1.8} ${y + 10.9} ${x + 0.7} ${y + 11.7} ${x} ${y + 11.9}C${x - 0.7} ${y + 11.7} ${x - 1.8} ${y + 10.9} ${x - 2.8} ${y + 9.4}C${x - 5} ${y + 6} ${x - 4} ${y + 2} ${x} ${y + 2}Z`, P.straw);
    path(p, [[-1.6, 5], [1.4, 4.6], [0, 7], [-2, 8], [2, 8.2], [-0.6, 9.8], [1, 10]].map(([dx, dy]) => ellD(x + dx, y + dy, 0.3, 0.45)).join(''), '#F7D46A');
    path(p, `M${x - 1.8} ${y + 3.5}C${x - 1} ${y + 3} ${x} ${y + 3} ${x + 1} ${y + 3.6}`, 'none', { stroke: '#fff', 'stroke-width': 0.6, opacity: 0.5 });
    path(p, `M${x} ${y + 2.4}l-3.4 -0.8l2 -0.8l-1.2 -1.8l2.2 1.2l0.4 -2.2l0.8 2.2l2.2 -1.2l-1.2 1.8l2 0.8z`, P.leaf);
  }

  /** La matière première, sur l'étagère sous le plan de travail : miel, farine, crème, œufs, chocolat
   *  (dessinés en y = 485, posés en y = 532 ; leurs cœurs, par-dessus tout le premier plan) */
  function drawIngredients(defs, g, coeurs) {
    const base = 485, DX = 54, DY = 47;
    const items = [];
    const pose = G(g, { transform: `translate(${DX} ${DY})` });
    const mk = (cx, top) => {
      const it = G(pose);
      const coeur = path(coeurs, coeurD(cx + DX, top + DY - 6, 1.6), P.fuchsia, { opacity: 0 });
      coeur.style.transformBox = 'fill-box';
      coeur.style.transformOrigin = '50% 100%';
      items.push({ g: it, coeur, x: cx + DX, top: top + DY });
      return it;
    };
    // le miel : un pot de verre, une cuillère à miel en bois
    const miel = mk(17, 461);
    path(miel, `M10 ${base}V468c0 -2 1.4 -3 3 -3h8c1.6 0 3 1 3 3V${base}Z`, lin(defs, [[0, '#C0721A'], [0.45, '#F2B84B'], [1, '#B8691A']], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    rect(miel, 11.5, 472, 11, 7.5, '#F7EFDF', { rx: 0.8 });
    S('text', { x: 17, y: 477.4, 'text-anchor': 'middle', 'font-family': 'Poppins, sans-serif', 'font-weight': 700, 'font-size': 3.1, fill: '#8C4A12' }, miel).textContent = 'MIEL';
    path(miel, 'M12 468.5v14', 'none', { stroke: '#fff', 'stroke-width': 1, opacity: 0.35 });
    path(miel, 'M21 466L26 452', 'none', { stroke: '#B98752', 'stroke-width': 1.4, 'stroke-linecap': 'round' });
    path(miel, ellD(26.4, 451, 2.2, 3, 20), '#A8773F');
    path(miel, 'M24.6 449.6l3.6 0.6M24.4 451.6l3.6 0.6', 'none', { stroke: '#7A5024', 'stroke-width': 0.5 });
    // la farine : un sac de papier kraft ouvert
    const far = mk(40, 456);
    path(far, `M30 ${base}l1.2 -24h17.6l1.2 24z`, '#D9C39B');
    path(far, `M30 ${base}l1.2 -24h17.6l1.2 24z`, lin(defs, [[0, '#000', 0.12], [0.5, '#000', 0], [1, '#000', 0.16]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    path(far, 'M31.2 461l2 -3h13.6l2 3z', '#C9B083');
    ell(far, 40, 460.2, 7.4, 1.8, '#FBF9F4');
    path(far, 'M34 459.6c2 -1.6 5 -2 8 -1.4', 'none', { stroke: '#fff', 'stroke-width': 1.4, 'stroke-linecap': 'round' });
    S('text', { x: 40, y: 474, 'text-anchor': 'middle', 'font-family': 'Poppins, sans-serif', 'font-weight': 700, 'font-size': 3.4, fill: '#3E5F8A', 'letter-spacing': 0.2 }, far).textContent = 'FARINE';
    path(far, 'M35 476.5h10', 'none', { stroke: '#3E5F8A', 'stroke-width': 0.4 });
    // la crème : une bouteille de verre, capsule bleue
    const cre = mk(56.5, 458);
    path(cre, `M52 ${base}V470c0 -3 1.6 -4.4 2.6 -6v-3.4h3.8V464c1 1.6 2.6 3 2.6 6V${base}Z`, '#FBFAF6');
    path(cre, `M52 ${base}V470c0 -3 1.6 -4.4 2.6 -6v-3.4h3.8V464c1 1.6 2.6 3 2.6 6V${base}Z`, lin(defs, [[0, '#9FB4C0', 0.25], [0.4, '#fff', 0], [1, '#9FB4C0', 0.3]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    rect(cre, 54.2, 458.6, 4.6, 2.6, '#4A77B4', { rx: 0.6 });
    path(cre, 'M53.6 471v11', 'none', { stroke: '#fff', 'stroke-width': 0.9, opacity: 0.8 });
    // les œufs, dans leur panier de fil de fer
    const oeu = mk(75, 462);
    [[68.5, 476.6], [74.5, 475.6], [80.5, 476.6], [71.5, 471.4], [77.6, 471]].forEach(([ex, ey]) => { path(oeu, ellD(ex, ey, 3.2, 4.2), '#E9C49A'); path(oeu, ellD(ex - 1, ey - 1.4, 1, 1.4), '#F8E3C8', { opacity: 0.8 }); });
    path(oeu, `M63.5 476c0 7 4 9 11.5 9s11.5 -2 11.5 -9`, 'none', { stroke: '#3A3530', 'stroke-width': 0.8 });
    path(oeu, 'M66 480.4h18M64.6 477.4h20.8M68 484l-1.6 -8M75 485v-9M82 484l1.6 -8', 'none', { stroke: '#3A3530', 'stroke-width': 0.55 });
    path(oeu, 'M63.5 476C63 466 87 466 86.5 476', 'none', { stroke: '#3A3530', 'stroke-width': 0.7 });
    // le chocolat : une tablette, son papier doré entrouvert
    const cho = mk(44, 482);
    path(cho, `M32 ${base + 2}l3 -5.6h22l2 5.6z`, '#4A2414');
    const car = [];
    for (let k = 1; k < 5; k++) car.push(`M${f(35 + k * 4.4 - 0.6)} ${base - 3.6}l-0.6 5.6`);
    car.push(`M33.6 ${base - 0.8}h24`);
    path(cho, car.join(''), 'none', { stroke: '#6E3A22', 'stroke-width': 0.5 });
    path(cho, `M47 ${base + 2}l2.2 -5.6h8.8l2 5.6z`, lin(defs, [[0, '#F3DF9A'], [0.5, '#C9A24E'], [1, '#F0D78E']], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    return items;
  }

  /** Mallo, vue de dos : le buste (marinière, tablier croisé, nœud), la nuque, la tête */
  function drawOwner(defs, L) {
    const o = {};
    // un buste mince : épaules tombantes, taille marquée (il descend sous la bulle)
    const TORSE = 'M180 760V586C180 566 178 552 178.5 540C179 524 171 508 169.4 492C168.3 481 168.4 473 171.2 467.5C175.5 460.5 186 456.5 193 453.6C195.8 452.4 197.4 451.4 198.2 450.2L209.8 450.2C210.6 451.4 212.2 452.4 215 453.6C222 456.5 232.5 460.5 236.8 467.5C239.6 473 239.7 481 238.6 492C237 508 229 524 229.5 540C230 552 228 566 228 586V760Z';
    const t = G(L.torse);
    path(t, TORSE, P.shirt);
    const cid = AC.uid('cot');
    S('path', { d: TORSE }, S('clipPath', { id: cid }, defs));
    const clip = G(t, { 'clip-path': `url(#${cid})` });
    const raies = [];
    for (let y = 456.5; y < 640; y += 6.2) raies.push(`M160 ${f(y)}C180 ${f(y + 1)} 228 ${f(y + 1)} 248 ${f(y)}v2.3C228 ${f(y + 3.3)} 180 ${f(y + 3.3)} 160 ${f(y + 2.3)}z`);
    path(clip, raies.join(''), P.stripe);
    // son dos est dans son ombre (la lumière du salon est devant elle) ; le bord de la silhouette s'éclaire
    path(clip, TORSE, lin(defs, [[0, '#1B0F08', 0.3], [0.22, '#1B0F08', 0.06], [0.5, '#1B0F08', 0.14], [0.78, '#1B0F08', 0.06], [1, '#1B0F08', 0.32]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    path(clip, 'M204 452C202.6 482 205.4 512 204 566', 'none', { stroke: '#1B0F08', 'stroke-width': 3.2, opacity: 0.08 });
    path(clip, 'M176.5 474C182 482 184.5 493 185.5 505M231.5 474C226 482 223.5 493 222.5 505', 'none', { stroke: '#1B0F08', 'stroke-width': 1.8, opacity: 0.09 });
    // les bretelles croisées du tablier
    const bret = (a, b, w = 3.4) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], L0 = Math.hypot(dx, dy), nx = (-dy / L0) * w, ny = (dx / L0) * w;
      return `M${f(a[0] + nx)} ${f(a[1] + ny)}L${f(b[0] + nx)} ${f(b[1] + ny)}L${f(b[0] - nx)} ${f(b[1] - ny)}L${f(a[0] - nx)} ${f(a[1] - ny)}Z`;
    };
    path(clip, bret([188.5, 454.5], [227, 540]), P.apronSh);
    path(clip, bret([188.5, 454.5], [227, 540]), P.apron, { transform: 'translate(-0.5 0)' });
    path(clip, bret([219.5, 454.5], [181, 540]), P.apron);
    path(clip, 'M216.9 455.6L178.8 539', 'none', { stroke: P.apronHi, 'stroke-width': 0.8, opacity: 0.7 });
    path(clip, 'M191.1 455.6L229.2 539', 'none', { stroke: P.apronHi, 'stroke-width': 0.6, opacity: 0.45 });
    // la ceinture et le nœud, à la taille
    path(clip, 'M160 536C180 538.6 228 538.6 248 536V543.4C228 546 180 546 160 543.4Z', P.apron);
    path(clip, 'M160 536C180 538.6 228 538.6 248 536', 'none', { stroke: P.apronHi, 'stroke-width': 0.7, opacity: 0.8 });
    const n = G(t);
    path(n, ellD(194.6, 538.6, 8.4, 4.6, -16), P.apron);
    path(n, ellD(213.4, 538.6, 8.4, 4.6, 16), P.apron);
    path(n, ellD(195.4, 539.2, 4.8, 1.9, -16) + ellD(212.6, 539.2, 4.8, 1.9, 16), P.apronSh);
    path(n, 'M202 541.6L196.4 563L200.6 564L203.6 543.4Z M206 541.6L211.6 563L207.4 564L204.4 543.4Z', P.apron);
    path(n, 'M202 541.6L196.4 563M206 541.6L211.6 563', 'none', { stroke: P.apronSh, 'stroke-width': 0.6 });
    ell(n, 204, 540.4, 3.1, 3.8, P.apronHi);
    // le liseré de lumière sur les épaules
    path(t, 'M169.3 488C168.4 478 168.9 471.4 171.6 467C176 460.4 186 456.6 193 453.8M238.7 488C239.6 478 239.1 471.4 236.4 467C232 460.4 222 456.6 215 453.8', 'none', { stroke: '#FFDDAA', 'stroke-width': 1.2, opacity: 0.55, 'stroke-linecap': 'round' });
    o.torse = t;

    // la nuque
    const cou = G(L.tete);
    const COU = 'M197.8 451C197.4 444 198.2 438 199.2 432L208.8 432C209.8 438 210.6 444 210.2 451Z';
    path(cou, COU, P.skin);
    path(cou, COU, lin(defs, [[0, '#5A3020', 0.6], [0.5, '#5A3020', 0.1], [1, '#5A3020', 0]]));
    // la tête (elle se penche vers ce qu'elle fait)
    o.tete = G(L.tete, { class: 'co-tete' });
    const h = o.tete;
    // la joue, pour le regard par-dessus l'épaule à la fin (cachée par les cheveux sinon)
    o.joue = G(h, { opacity: 0 });
    path(o.joue, 'M219 415C227 417 231.5 424 230.5 431.5C229.8 437 226 441.5 220 443.5Z', P.skin);
    path(o.joue, 'M229.6 426.6l3 1.9l-2.6 1.2', P.skin);
    path(o.joue, 'M226.4 432.6c1.4 0.6 2.4 0.4 3 -0.2', 'none', { stroke: P.skinSh, 'stroke-width': 0.6, 'stroke-linecap': 'round' });
    path(o.joue, ellD(226.8, 436.4, 2.2, 1.4, -10), '#E99A90', { opacity: 0.55 });
    path(o.joue, 'M228 421.8l2.4 -1.4', 'none', { stroke: P.hair, 'stroke-width': 0.6, 'stroke-linecap': 'round' });
    // les oreilles
    path(h, ellD(183.2, 427, 3.3, 5.8, 8), P.skin);
    path(h, ellD(224.8, 427, 3.3, 5.8, -8), P.skin);
    path(h, ellD(183.7, 427.4, 1.5, 3.2, 8) + ellD(224.3, 427.4, 1.5, 3.2, -8), P.skinSh, { opacity: 0.6 });
    // les cheveux
    o.cheveux = G(h);
    const hc = o.cheveux;
    ell(hc, 204, 421.5, 21.8, 24.4, rad(defs, [[0, P.hairHi], [0.4, P.hairMid], [1, P.hair]], { cx: 0.42, cy: 0.16, r: 0.95 }));
    path(hc, 'M204 399.5C193 402.5 186 411.5 185 426M204 399.5C215 402.5 222 411.5 223 426M201 400.5C195 408.5 193 421 194 437M207 400.5C213 408.5 215 421 214 437M204 399.5C203 413 204 427 204 442', 'none', { stroke: '#24130B', 'stroke-width': 0.9, opacity: 0.55, 'stroke-linecap': 'round' });
    path(hc, 'M197.5 404C192 410.5 190.2 418.5 190.2 427M210.5 404C216 410.5 217.8 418.5 217.8 427', 'none', { stroke: P.hairHi, 'stroke-width': 0.8, opacity: 0.55, 'stroke-linecap': 'round' });
    path(hc, 'M197.6 444c-0.8 3 -2.6 4.4 -4 4.8M210.4 444c0.8 3 2.6 4.4 4 4.8M203.4 445c0 2.2 -0.8 3.2 -1.4 4', 'none', { stroke: P.hair, 'stroke-width': 1, 'stroke-linecap': 'round' });
    path(hc, 'M188.5 406C194 400.2 214 400.2 219.5 406', 'none', { stroke: '#FFDBA6', 'stroke-width': 1.2, opacity: 0.5, 'stroke-linecap': 'round' });
    // le chignon, son chouchou bleu, et la baguette en bois (un bout de cuillère) qui le traverse :
    // dessinée sous le chignon, on ne voit que ses deux bouts, qui en sortent de part et d'autre
    const bun = G(hc);
    const baguette = G(bun, { transform: 'rotate(17 205 397)' });
    path(baguette, 'M181.5 397.9H229.4', 'none', { stroke: P.spoonSh, 'stroke-width': 2.7, 'stroke-linecap': 'round' });
    path(baguette, 'M181.5 397.3H229.4', 'none', { stroke: P.spoon, 'stroke-width': 1.8, 'stroke-linecap': 'round' });
    path(baguette, 'M221 396.6H228.6', 'none', { stroke: '#E9B67E', 'stroke-width': 0.5, 'stroke-linecap': 'round', opacity: 0.9 });
    path(baguette, ellD(177.6, 397.4, 4.6, 2.7), P.spoon);
    path(baguette, ellD(177.3, 397.6, 3.1, 1.6), P.spoonSh);
    path(baguette, 'M174.6 396.2c1.2 -0.8 2.8 -1 4 -0.5', 'none', { stroke: '#F0C08C', 'stroke-width': 0.6, 'stroke-linecap': 'round' });
    ell(bun, 205, 397, 12.6, 11.4, rad(defs, [[0, P.hairHi], [0.5, P.hairMid], [1, P.hair]], { cx: 0.38, cy: 0.3, r: 0.8 }));
    path(bun, 'M196 399C195 392 201 387.5 206.5 388.5C212 389.5 215 395 212.5 399.5C210 403.5 203.5 403 201.5 399C200 396 202.5 393 205.5 393.5', 'none', { stroke: '#24130B', 'stroke-width': 0.9, opacity: 0.6, 'stroke-linecap': 'round' });
    path(bun, 'M198.5 393C200.5 389.8 204.5 389 207.5 390', 'none', { stroke: '#FFDBA6', 'stroke-width': 1, opacity: 0.45, 'stroke-linecap': 'round' });
    // le chouchou : un anneau froncé, bleu, qui serre le bas du chignon
    const ch = G(bun);
    path(ch, 'M192.2 400.6C195 409.6 215 409.6 217.8 400.6', 'none', { stroke: P.scrunchSh, 'stroke-width': 6.2, 'stroke-linecap': 'round' });
    path(ch, 'M192.4 400C195.2 408.6 214.8 408.6 217.6 400', 'none', { stroke: P.scrunch, 'stroke-width': 4.8, 'stroke-linecap': 'round' });
    path(ch, 'M194.6 402.3l1.4 -2.2M197.6 404.7l1 -2.6M201 406.1l0.6 -2.8M204.8 406.6v-2.9M208.6 406.1l-0.6 -2.8M212 404.7l-1 -2.6M215 402.3l-1.4 -2.2', 'none', { stroke: P.scrunchSh, 'stroke-width': 0.8, 'stroke-linecap': 'round', opacity: 0.8 });
    path(ch, 'M194.4 400.2C197.4 405.6 212.6 405.6 215.6 400.2', 'none', { stroke: P.scrunchHi, 'stroke-width': 0.9, 'stroke-linecap': 'round', opacity: 0.75 });
    return o;
  }

  /** Les outils, dessinés autour de la main (0, 0) ; l'outil « descend » vers +y */
  function drawTools(defs, par) {
    const T = {};
    const mk = (nom) => { const g = G(par, { class: 'co-outil co-' + nom }); g.style.display = 'none'; T[nom] = g; return g; };
    // la maryse
    let g = mk('spatule');
    rect(g, -1.4, -11, 2.8, 13, P.mintDark, { rx: 1.2 });
    path(g, 'M-3.9 1.6C-3.9 9 -3.2 13 0 14.2C3.2 13 3.9 9 3.9 1.6Z', '#F7F1E5');
    path(g, 'M-1.8 3.6v8.4', 'none', { stroke: '#DDD3C3', 'stroke-width': 0.7 });
    // le fouet
    g = mk('fouet');
    rect(g, -1.6, -12, 3.2, 12, '#BD8A54', { rx: 1.4 });
    rect(g, -1.9, -1, 3.8, 3.2, P.steel, { rx: 0.6 });
    path(g, 'M0 2C-7.2 7 -7.2 17.5 0 21.5C7.2 17.5 7.2 7 0 2M0 2C-3.6 7 -3.6 17.5 0 21.5C3.6 17.5 3.6 7 0 2', 'none', { stroke: '#DDE1E4', 'stroke-width': 0.8 });
    path(g, 'M0 2C-5.4 7 -5.4 17.5 0 21.5C5.4 17.5 5.4 7 0 2', 'none', { stroke: P.steelSh, 'stroke-width': 0.6 });
    // la poche à douille (tenue par le haut)
    g = mk('poche');
    path(g, 'M-6.6 -6C-6.6 -9.4 6.6 -9.4 6.6 -6L1.7 15L-1.7 15Z', '#F8F3EA');
    path(g, 'M-6.6 -6C-6.6 -9.4 6.6 -9.4 6.6 -6L1.7 15L-1.7 15Z', lin(defs, [[0, '#000', 0.14], [0.5, '#000', 0], [1, '#000', 0.08]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    path(g, 'M-2.6 -4L-0.6 12M2.8 -3.6L0.9 11', 'none', { stroke: '#DED3C2', 'stroke-width': 0.6 });
    path(g, 'M-1.7 15L1.7 15L0.8 19.6L-0.8 19.6Z', P.steel);
    circ(g, 0, 20.2, 0.9, P.cream);
    // la fraise, du bout des doigts
    g = mk('fraise');
    drawStrawberry(g, 0, 1.4);
    // le tamis (on le tient par le manche, il pend à gauche)
    g = mk('tamis');
    path(g, 'M1 -1L-7 5', 'none', { stroke: '#BD8A54', 'stroke-width': 2.2, 'stroke-linecap': 'round' });
    path(g, 'M-25 7C-24 15.5 -8 15.5 -7 7Z', '#E3E6E9', { opacity: 0.85 });
    const mail = [];
    for (let k = 0; k < 7; k++) mail.push(`M${f(-24 + k * 2.6)} 7.4l${f(1.2 + k * 0.3)} 6.8`);
    for (let k = 0; k < 3; k++) mail.push(`M-24 ${f(9 + k * 2)}h16`);
    path(g, mail.join(''), 'none', { stroke: '#A6ADB3', 'stroke-width': 0.4 });
    path(g, ellD(-16, 7, 9.2, 2.3), 'none', { stroke: P.steel, 'stroke-width': 1.3 });
    ell(g, -16, 8, 6, 1.4, '#FFFFFF', { opacity: 0.9 });
    // le petit pot à glaçage (tenu par son anse, le bec à gauche)
    g = mk('pichet');
    path(g, 'M0 -3C4.5 -3 5 5 0.6 6', 'none', { stroke: '#F1EBDF', 'stroke-width': 2 });
    path(g, 'M-1.5 -4H-15L-17.6 -6.2L-15.6 -2.6C-17 1 -16.4 9 -12 10.6H-4C-0.6 9.6 -0.4 3 -1.5 -4Z', '#F5EFE4');
    path(g, 'M-1.5 -4H-15L-17.6 -6.2', 'none', { stroke: P.mintDark, 'stroke-width': 1.2 });
    path(g, 'M-12.5 -1.6v9.2', 'none', { stroke: '#fff', 'stroke-width': 1, opacity: 0.8 });
    // le citron
    g = mk('citron');
    path(g, ellD(-1, 6.4, 7, 5.2, -8), P.lemon);
    path(g, ellD(-1, 6.4, 7, 5.2, -8), lin(defs, [[0, '#fff', 0.35], [0.5, '#fff', 0], [1, '#000', 0.12]]));
    path(g, 'M5.6 4.4l2.4 -1.2', 'none', { stroke: P.lemonSh, 'stroke-width': 1.6, 'stroke-linecap': 'round' });
    // la plaque de choux (tenue par le bout droit)
    g = mk('plaque');
    drawTray(g, -46, 3);
    // la casserole de caramel (tenue par le manche, le bec à gauche)
    g = mk('casserole');
    path(g, 'M1 0L-9 3', 'none', { stroke: '#2E2A27', 'stroke-width': 2.6, 'stroke-linecap': 'round' });
    path(g, 'M-26 1H-9V8.6C-9 11.6 -11 13 -14 13H-21C-24 13 -26 11.6 -26 8.6Z', lin(defs, [[0, P.copperSh], [0.35, P.copperHi], [1, P.copperSh]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    path(g, ellD(-17.5, 1, 8.5, 1.8), P.caramel);
    path(g, 'M-26 1L-28.6 -0.8', 'none', { stroke: P.copperSh, 'stroke-width': 1.4, 'stroke-linecap': 'round' });
    // le chalumeau
    g = mk('chalumeau');
    rect(g, -3.3, -10, 6.6, 13, '#C84A3E', { rx: 2 });
    rect(g, -3.3, -10, 2, 13, '#E7786A', { rx: 1, opacity: 0.6 });
    path(g, 'M-2.2 3h4.4v3l3.4 5.6h-3.2l-4.6 -5.2z', '#2B2B2B');
    T.flamme = G(g, { transform: 'translate(4 12.2) rotate(-28)', opacity: 0 });
    path(T.flamme, 'M0 0C-2.6 4 -2.2 9.6 0 13.6C2.2 9.6 2.6 4 0 0Z', '#FFB347', { opacity: 0.9 });
    path(T.flamme, 'M0 1C-1.2 3.4 -1 6.4 0 8.4C1 6.4 1.2 3.4 0 1Z', '#7CC4FF');
    return T;
  }
  /** Une main vue de dos (l'avant-bras arrive de -y) */
  function drawHand(p, side) {
    const g = G(p);
    const m = G(g, { transform: side === 'L' ? 'scale(-0.86 0.86)' : 'scale(0.86)' });
    path(m, 'M-5 -1C-5.6 3.4 -4 7.4 0 7.8C4 7.4 5.8 3.4 5 -1C3 -3.2 -3 -3.2 -5 -1Z', P.skin);
    path(m, 'M4.2 -0.4C6.8 0.6 7.2 3.8 5.6 5.4', 'none', { stroke: P.skin, 'stroke-width': 2.6, 'stroke-linecap': 'round' });
    path(m, 'M4.2 -0.4C6.8 0.6 7.2 3.8 5.6 5.4', 'none', { stroke: P.skinSh, 'stroke-width': 0.6, opacity: 0.6 });
    path(m, 'M-3.4 5.2C-1.4 6.6 1.6 6.6 3.4 5', 'none', { stroke: P.skinSh, 'stroke-width': 0.7, opacity: 0.8 });
    return g;
  }

  /* ======================================================================
     Le premier plan, et la comptine
     ====================================================================== */
  function create(salon, bulle) {
    const svg = salon.svg;
    const defs = svg.querySelector('defs') || S('defs', {}, svg);
    const entre = G(svg, { class: 'co-premier-plan' }); // l'entrée (animée) ; dedans, le premier plan agrandi
    const root = G(entre, { transform: PLAN });
    const L = {
      plan: G(root), bol: G(root), outilsL: G(root), bolAvant: G(root), gateau: G(root), face: G(root),
      outilsR: G(root), avant: G(root), torse: G(root), tete: G(root), bras: G(root), fx: G(root, { 'pointer-events': 'none' }),
      coeurs: G(root, { 'pointer-events': 'none' }),
    };
    drawTop(defs, L.plan);
    const bol = drawBowl(defs, L.bol, L.bolAvant);
    const gateau = drawCake(defs, L.gateau);
    const etagere = drawFace(defs, L.face);
    const ingredients = drawIngredients(defs, etagere, L.coeurs);
    const four = drawOven(defs, L.face);
    const mallo = drawOwner(defs, L);
    const outils = { L: drawTools(defs, L.outilsL), R: drawTools(defs, L.outilsR) };
    // les bras : l'avant-bras et la main sous le buste (cachés quand ils travaillent devant elle), le haut du bras par-dessus
    const bras = {};
    ['L', 'R'].forEach((sd) => {
      const b = (bras[sd] = {});
      b.avant = path(L.avant, '', P.skin);
      b.avantOmbre = path(L.avant, '', 'none', { stroke: P.skinSh, 'stroke-width': 0.9, opacity: 0.5 });
      b.main = drawHand(L.avant, sd);
      b.coude = path(L.bras, '', P.skin);
      b.manche = path(L.bras, '', P.shirt);
      b.raies = path(L.bras, '', P.stripe);
      b.revers = path(L.bras, '', P.shirt, { stroke: P.shirtSh, 'stroke-width': 0.8 });
    });
    // on la touche : elle recommence
    const cible = path(root, 'M166 562C166 522 164 482 174 464C184 452 186 436 186 420C186 386 224 386 224 420C224 436 224 452 234 464C244 482 242 522 242 562Z', '#000', { 'fill-opacity': 0, class: 'co-cible', 'aria-hidden': 'true' });
    cible.style.cursor = 'pointer';

    /* ---------- le cadrage : le salon remplit son cadre, le haut de la bulle tombe juste sous le four ---------- */
    const hote = svg.parentNode;
    function cadrer() {
      const W = hote.clientWidth, H = hote.clientHeight;
      if (!W || !H) return;
      let u = W / 400; // px par unité : toute la largeur du salon
      const bord = bulle && bulle.offsetParent === hote ? bulle.offsetTop : H;
      let y0 = ANCRE - bord / u;
      // cadre très haut : plutôt que de montrer le dessus de la voûte, on rogne un peu les côtés
      if (y0 < -70) { u = bord / (ANCRE + 70); y0 = -70; }
      const w = W / u;
      svg.setAttribute('viewBox', `${f(200 - w / 2)} ${f(y0)} ${f(w)} ${f(H / u)}`);
    }
    cadrer();
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => cadrer());
      ro.observe(hote);
      if (bulle) ro.observe(bulle);
    } else addEventListener('resize', cadrer);

    const main = { L: REST.L.slice(0, 2), R: REST.R.slice(0, 2) };
    const prof = { L: REST.L[2], R: REST.R[2] }; // l'avant-bras fuit vers le comptoir (raccourci) ou se présente de profil
    const corps = { x: 0, y: 0 };     // elle se penche (pour enfourner), elle respire
    const outilNom = { L: null, R: null };
    const outilAng = { L: 0, R: 0 };
    const epaule = (sd) => [SHO[sd][0] + corps.x, SHO[sd][1] + corps.y];

    function ik(sd) {
      const S0 = epaule(sd), lf = LF * (1 - 0.72 * prof[sd]);
      let H = main[sd];
      let dx = H[0] - S0[0], dy = H[1] - S0[1], d = Math.hypot(dx, dy) || 0.01;
      const dmax = LU + lf - 0.6, dmin = Math.abs(LU - lf) + 0.6;
      if (d > dmax) { H = [S0[0] + (dx / d) * dmax, S0[1] + (dy / d) * dmax]; dx = H[0] - S0[0]; dy = H[1] - S0[1]; d = dmax; }
      const dd = Math.max(d, dmin);
      const a = (LU * LU - lf * lf + dd * dd) / (2 * dd), hh = Math.sqrt(Math.max(0, LU * LU - a * a));
      const ux = dx / d, uy = dy / d, px = S0[0] + ux * a, py = S0[1] + uy * a;
      const e1 = [px - uy * hh, py + ux * hh], e2 = [px + uy * hh, py - ux * hh];
      // le coude plutôt en bas (le bras pend), puis vers l'extérieur
      const out = sd === 'L' ? -1 : 1;
      const score = (e) => (e[1] - S0[1]) + (e[0] - CX) * out * 0.35;
      return { e: score(e1) >= score(e2) ? e1 : e2, h: H };
    }
    function drawArm(sd) {
      const S0 = epaule(sd), { e: E, h: H } = ik(sd), b = bras[sd];
      const w = (t) => 13.2 + (10.2 - 13.2) * t;
      b.coude.setAttribute('d', tube(lerp2(S0, E, 0.82), E, w(0.82), 9.8));
      b.manche.setAttribute('d', tube(S0, lerp2(S0, E, 0.76), 13.2, w(0.76)));
      b.raies.setAttribute('d', [0.12, 0.3, 0.48, 0.64].map((t0) => bande(S0, E, t0, t0 + 0.07, w)).join(''));
      b.revers.setAttribute('d', bande(S0, E, 0.7, 0.84, (t) => w(t) + 1.4));
      b.avant.setAttribute('d', tube(E, H, 9.4, 7.2));
      b.avantOmbre.setAttribute('d', `M${pt(lerp2(E, H, 0.15))}L${pt(lerp2(E, H, 0.85))}`);
      const ang = (Math.atan2(H[1] - E[1], H[0] - E[0]) * 180) / Math.PI - 90;
      b.main.setAttribute('transform', `translate(${f(H[0])} ${f(H[1])}) rotate(${f(ang)})`);
      const n = outilNom[sd];
      if (n) outils[sd][n].setAttribute('transform', `translate(${f(H[0])} ${f(H[1])}) rotate(${f(outilAng[sd])})`);
    }
    const dessine = () => { drawArm('L'); drawArm('R'); };
    function outil(sd, nom, ang = 0) {
      Object.keys(outils[sd]).forEach((k) => { if (k !== 'flamme') outils[sd][k].style.display = k === nom ? '' : 'none'; });
      outilNom[sd] = nom || null;
      outilAng[sd] = ang;
      drawArm(sd);
    }
    // un point de l'outil, dans le repère du salon
    function pointOutil(sd, [lx, ly]) {
      const a = (outilAng[sd] * Math.PI) / 180, [hx, hy] = ik(sd).h;
      return [hx + lx * Math.cos(a) - ly * Math.sin(a), hy + lx * Math.sin(a) + ly * Math.cos(a)];
    }

    /* ---------- le temps ---------- */
    let tour = 0, joue = false, courant = -1;
    const vivant = (id) => id === tour;
    const sfx = (n, o) => AC.sfx && AC.sfx.play(n, o || {});
    const tw = (id, ms, fn, ease = AC.ease.inOutSine) => (vivant(id) ? AC.tween(ms, (e, p) => { if (vivant(id)) fn(e, p); }, ease) : Promise.resolve());
    const attends = (id, ms) => (vivant(id) ? AC.wait(ms) : Promise.resolve());
    async function visible(id) {
      while (vivant(id) && (document.hidden || (AC.view && AC.view !== 'nous'))) await AC.wait(300);
    }
    // la main va en « to » ([x, y] ; un 3e nombre : l'avant-bras qui fuit vers le comptoir, 0 par défaut)
    function vers(id, sd, to, ms = 420, ease = AC.ease.inOutSine) {
      const from = [...main[sd]], p0 = prof[sd], p1 = to[2] || 0;
      return tw(id, ms, (e) => { main[sd] = lerp2(from, to, e); prof[sd] = p0 + (p1 - p0) * e; drawArm(sd); }, ease);
    }
    function poseCorps() {
      const tr = corps.x || corps.y ? `translate(${f(corps.x)} ${f(corps.y)})` : null;
      [L.torse, L.tete].forEach((g) => (tr ? g.setAttribute('transform', tr) : g.removeAttribute('transform')));
      drawArm('L');
      drawArm('R');
    }
    function penche(id, x, y, ms = 420) {
      const x0 = corps.x, y0 = corps.y;
      return tw(id, ms, (e) => { corps.x = x0 + (x - x0) * e; corps.y = y0 + (y - y0) * e; poseCorps(); });
    }
    function tourne(id, sd, c, rx, ry, tours, ms) {
      return tw(id, ms, (e, p) => { const a = p * tours * TAU - Math.PI / 2; main[sd] = [c[0] + Math.cos(a) * rx, c[1] + Math.sin(a) * ry]; drawArm(sd); }, AC.ease.linear);
    }
    function secoue(id, sd, c, ax, ay, n, ms) {
      return tw(id, ms, (e, p) => { const s = Math.sin(p * n * TAU); main[sd] = [c[0] + s * ax, c[1] + Math.abs(s) * ay]; drawArm(sd); }, AC.ease.linear);
    }
    function incline(id, sd, a0, a1, ms) {
      return tw(id, ms, (e) => { outilAng[sd] = a0 + (a1 - a0) * e; drawArm(sd); });
    }
    async function repos(id, sd, ms = 420) {
      await vers(id, sd, REST[sd], ms);
      outil(sd, null);
    }
    function tete(id, deg, dx, ms = 420) {
      const t0 = { ...teteEtat };
      return tw(id, ms, (e) => { teteEtat.a = t0.a + (deg - t0.a) * e; teteEtat.x = t0.x + (dx - t0.x) * e; poseTete(); });
    }
    const teteEtat = { a: 0, x: 0 };
    function poseTete() { mallo.tete.setAttribute('transform', `translate(${f(teteEtat.x)} 0) rotate(${f(teteEtat.a)} 204 446)`); }
    const couleur = (el, a, b, e) => el.setAttribute('fill', mix(a, b, e));
    function mix(a, b, e) {
      const pa = [1, 3, 5].map((i) => parseInt(a.substr(i, 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.substr(i, 2), 16));
      return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * e).toString(16).padStart(2, '0')).join('');
    }
    // des grains qui tombent (sucre, zestes) d'un point vers le dessus du gâteau
    function pluie(from, n, col, ms, r = 0.55) {
      if (AC.reduced) return;
      for (let k = 0; k < n; k++) {
        const x0 = from[0] + (Math.random() - 0.5) * 10, y0 = from[1] + Math.random() * 2;
        const x1 = CAKE.x + (Math.random() - 0.5) * CAKE.rx * 1.6, y1 = CAKE.y + (Math.random() - 0.5) * CAKE.ry * 1.2;
        const c = circ(L.fx, x0, y0, r * (0.7 + Math.random() * 0.6), col);
        c.animate([{ transform: 'translate(0,0)', opacity: 0.95 }, { transform: `translate(${f(x1 - x0)}px, ${f(y1 - y0)}px)`, opacity: 0.95, offset: 0.92 }, { transform: `translate(${f(x1 - x0)}px, ${f(y1 - y0)}px)`, opacity: 0 }], { duration: ms * (0.55 + Math.random() * 0.45), delay: Math.random() * ms * 0.6, easing: 'cubic-bezier(.4,0,1,1)' }).finished.then(() => c.remove(), () => c.remove());
      }
    }
    function coeurs(x, y, n = 5, ms = 1400) {
      if (AC.reduced) return;
      const cols = [P.fuchsia, P.prune, P.turquoise, '#E4B4AB', P.fuchsia];
      for (let k = 0; k < n; k++) {
        const c = path(L.fx, coeurD(0, 0, 1.4 + Math.random() * 0.8), cols[k % cols.length]);
        const dx = (k - (n - 1) / 2) * 9 + (Math.random() - 0.5) * 5;
        c.animate([{ transform: `translate(${f(x)}px, ${f(y)}px) scale(.2)`, opacity: 0 }, { transform: `translate(${f(x + dx * 0.4)}px, ${f(y - 8)}px) scale(1)`, opacity: 1, offset: 0.25 }, { transform: `translate(${f(x + dx)}px, ${f(y - 34 - Math.random() * 10)}px) scale(.9) rotate(${f(dx)}deg)`, opacity: 0 }], { duration: ms, delay: k * 110, easing: 'ease-out' }).finished.then(() => c.remove(), () => c.remove());
      }
    }
    const echelle = (el, s) => el.setAttribute('transform', `scale(${f(s)})`);
    function porte(s) { four.door.setAttribute('transform', `translate(0 ${f(four.hinge)}) scale(1 ${f(s)}) translate(0 ${f(-four.hinge)})`); }
    function fourAllume(on) { four.glow.forEach((g) => { g.style.transition = 'opacity .6s ease'; g.style.opacity = on ? '1' : '0'; }); four.voyant.setAttribute('fill', on ? '#FF9D3C' : '#5E4632'); }

    /* ---------- la bulle : Mallo parle, une page à la fois, lettre à lettre ---------- */
    const pages = bulle ? [...bulle.querySelectorAll('.bulle-page')] : [];
    const pageDe = []; // l'étape → sa page
    const mots = [];   // l'étape → ses mots (span.m), chaque lettre dans un span.l (--k : son rang dans le mot)
    pages.forEach((pg, i) => pg.querySelectorAll('[data-s]').forEach((sp) => {
      const s = +sp.dataset.s;
      pageDe[s] = i;
      const parts = [];
      [...sp.childNodes].forEach((n) => {
        if (n.nodeType !== 3) return;
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((w) => {
          if (!w) return;
          if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
          const m = document.createElement('span');
          m.className = 'm';
          [...w].forEach((ch, k) => { const l = document.createElement('span'); l.className = 'l'; l.style.setProperty('--k', k); l.textContent = ch; m.appendChild(l); });
          m.n = [...w].length;
          frag.appendChild(m);
          parts.push(m);
        });
        n.replaceWith(frag);
      });
      mots[s] = parts;
    }));
    const finPage = []; // la dernière étape de chaque page
    pageDe.forEach((p, s) => { finPage[p] = s; });
    const DERNIERE = pageDe.length - 1;
    const btn = bulle && bulle.querySelector('.conte-rejouer');
    let page = -1;
    function montre(i) {
      if (!bulle || i === page) return;
      page = i;
      pages.forEach((pg, k) => pg.classList.toggle('on', k === i));
      bulle.classList.remove('finie');
    }
    const ouvre = (on) => bulle && bulle.classList.toggle('ouverte', on);
    // les mots de l'étape s s'écrivent, lettre à lettre, en ms (à peu près) ; la page pleine, le ▼ du « suite »
    function dit(id, s, ms) {
      if (!mots[s]) return;
      montre(pageDe[s]);
      const n = mots[s].reduce((a, m) => a + m.n + 1, 0);
      const pas = AC.reduced ? 0 : Math.max(16, Math.min(55, ms / n));
      let t = 0;
      mots[s].forEach((m) => {
        setTimeout(() => { if (vivant(id)) { m.style.setProperty('--pas', f(pas) + 'ms'); m.classList.add('on', 'vif'); } }, t);
        t += (m.n + 1) * pas;
      });
      const p = pageDe[s];
      if (finPage[p] === s && s !== DERNIERE) setTimeout(() => { if (vivant(id) && page === p) bulle.classList.add('finie'); }, t + 300);
    }
    const calme = (s) => (mots[s] || []).forEach((m) => m.classList.remove('vif'));
    // tout effacer (au début), ou la dernière page déjà écrite (à la fin)
    function texte(fini) {
      mots.forEach((ms) => (ms || []).forEach((m) => { m.style.setProperty('--pas', '0ms'); m.classList.toggle('on', fini); m.classList.remove('vif'); }));
      page = -1;
      montre(fini ? pageDe[DERNIERE] : 0);
    }

    /* ---------- l'état du comptoir : au début, à la fin ---------- */
    function etat(fini) {
      gateau.rosaces.forEach((r) => { echelle(r.s, fini ? 1 : 0); r.cap.setAttribute('opacity', fini ? 1 : 0); });
      echelle(gateau.fraiseIn, fini ? 1 : 0);
      gateau.sucre.setAttribute('opacity', fini ? 1 : 0);
      gateau.glacage.setAttribute('opacity', fini ? 1 : 0);
      gateau.coulures.forEach((d) => { const y = +d.dataset.top; d.setAttribute('transform', `translate(0 ${f(y)}) scale(1 ${fini ? 1 : 0}) translate(0 ${f(-y)})`); });
      gateau.zestes.forEach((z) => z.setAttribute('opacity', fini ? 1 : 0));
      gateau.filet.setAttribute('stroke-dashoffset', fini ? '0' : String(gateau.filetLen));
      echelle(gateau.etincelle, 0);
      gateau.etincelle.setAttribute('transform', `translate(${CAKE.x + 16} ${CAKE.y - 12}) scale(0)`);
      bol.contenu.setAttribute('fill', fini ? CONTENU.ganache : CONTENU.beurre);
      bol.pics.setAttribute('opacity', 0);
      bol.spirale.setAttribute('opacity', 0);
      four.plaque.setAttribute('opacity', fini ? 1 : 0);
      four.vitrePlaque.setAttribute('opacity', fini ? 1 : 0);
      porte(1);
      fourAllume(!!fini);
      mallo.joue.setAttribute('opacity', 0);
      teteEtat.a = 0; teteEtat.x = 0; poseTete();
      mallo.cheveux.removeAttribute('transform');
      main.L = REST.L.slice(0, 2); main.R = REST.R.slice(0, 2);
      prof.L = REST.L[2]; prof.R = REST.R[2];
      corps.x = corps.y = 0;
      poseCorps();
      outil('L', null); outil('R', null);
      outils.R.flamme.setAttribute('opacity', 0);
      L.fx.innerHTML = '';
      texte(!!fini);
      ouvre(!!fini); // au début, la bulle est fermée : elle s'ouvre quand Mallo commence à parler
      if (btn) btn.hidden = !fini;
    }

    /* ---------- les gestes ---------- */
    const B = [BOWL.x, BOWL.y];
    const bolCouleur = (id, a, b, ms) => tw(id, ms, (e) => couleur(bol.contenu, a, b, e));
    const ETAPES = [
      { s: 0, ms: 500, async f(id) { // Ici, (elle prend son souffle)
        await tw(id, 620, (e) => { corps.y = -Math.sin(e * Math.PI) * 2; poseCorps(); });
        corps.y = 0;
        poseCorps();
        await attends(id, 250);
      } },
      { s: 1, ms: 420, async f(id) { // on poche,
        outil('R', 'poche', 0);
        tete(id, 5, 1.5);
        await vers(id, 'R', [CAKE.x + 10, CAKE.y - 28], 420);
        for (const r of gateau.rosaces) {
          await vers(id, 'R', [r.x, r.y - 20.5], 150);
          if (!vivant(id)) return;
          sfx('pop', { gain: 0.3 });
          await tw(id, 150, (e) => echelle(r.s, e), AC.ease.outBack);
        }
        await repos(id, 'R');
      } },
      { s: 2, ms: 420, async f(id) { // on crème,
        outil('L', 'spatule', 14);
        tete(id, -6, -1.5);
        await vers(id, 'L', [B[0] + 3, B[1] - 16], 400);
        sfx('stir', { n: 3, gain: 0.7 });
        await Promise.all([tourne(id, 'L', [B[0], B[1] - 13], 9, 2.6, 2, 1100), bolCouleur(id, CONTENU.beurre, CONTENU.creme, 1100)]);
        await repos(id, 'L');
      } },
      { s: 3, ms: 420, async f(id) { // on dresse,
        outil('R', 'fraise', 0);
        tete(id, 5, 1.5);
        await vers(id, 'R', [CAKE.x, CAKE.y - 20], 420);
        await vers(id, 'R', [CAKE.x, CAKE.y - 9.5], 260);
        outil('R', null);
        sfx('plate', { gain: 0.45 });
        await tw(id, 260, (e) => echelle(gateau.fraiseIn, e), AC.ease.outBack);
        await repos(id, 'R');
      } },
      { s: 4, ms: 420, async f(id) { // on blanchit,
        outil('L', 'fouet', 0);
        tete(id, -6, -1.5);
        await Promise.all([vers(id, 'L', [B[0], B[1] - 22], 380), bolCouleur(id, CONTENU.creme, CONTENU.jaunes, 380)]);
        sfx('stir', { n: 5, per: 0.2, gain: 0.7 });
        await Promise.all([tourne(id, 'L', [B[0], B[1] - 21], 7.5, 2, 5, 1100), bolCouleur(id, CONTENU.jaunes, CONTENU.blanchi, 1100)]);
        await repos(id, 'L');
      } },
      { s: 5, ms: 480, async f(id) { // on saupoudre,
        outil('R', 'tamis', 0);
        tete(id, 5, 1.5);
        await vers(id, 'R', [CAKE.x + 16, CAKE.y - 30], 420);
        sfx('dust', { gain: 0.8 });
        pluie(pointOutil('R', [-16, 12]), 46, '#FFFFFF', 1000);
        await Promise.all([secoue(id, 'R', [CAKE.x + 16, CAKE.y - 30], 3.2, 0.8, 6, 1000), tw(id, 1000, (e) => gateau.sucre.setAttribute('opacity', f(e)))]);
        await repos(id, 'R');
      } },
      { s: 6, ms: 420, async f(id) { // on fouette,
        outil('L', 'fouet', 0);
        tete(id, -6, -1.5);
        await Promise.all([vers(id, 'L', [B[0], B[1] - 22], 380), bolCouleur(id, CONTENU.blanchi, '#FFF6E6', 380)]);
        sfx('stir', { n: 7, per: 0.14, gain: 0.7 });
        await Promise.all([tourne(id, 'L', [B[0], B[1] - 21], 8, 2.2, 8, 1200), bolCouleur(id, '#FFF6E6', CONTENU.chantilly, 1200), tw(id, 1200, (e) => bol.pics.setAttribute('opacity', f(Math.max(0, e * 1.6 - 0.6))))]);
        await repos(id, 'L');
      } },
      { s: 7, ms: 420, async f(id) { // on glace,
        outil('R', 'pichet', 0);
        tete(id, 5, 1.5);
        await vers(id, 'R', [CAKE.x + 24, CAKE.y - 19], 420);
        await incline(id, 'R', 0, -62, 380);
        const filet = path(L.fx, '', 'none', { stroke: P.glaze, 'stroke-width': 1.8, 'stroke-linecap': 'round' });
        const bec = pointOutil('R', [-17.4, -5.8]);
        filet.setAttribute('d', `M${pt(bec)}Q${f(bec[0] - 2)} ${f(bec[1] + 6)} ${f(CAKE.x + 6)} ${f(CAKE.y - 0.5)}`);
        sfx('pour', { dur: 0.8, gain: 0.7 });
        await Promise.all([
          tw(id, 500, (e) => gateau.glacage.setAttribute('opacity', f(e))),
          ...gateau.coulures.map((d, k) => tw(id, 700, (e) => { const y = +d.dataset.top; const s = Math.max(0, Math.min(1, e * 1.7 - k * 0.1)); d.setAttribute('transform', `translate(0 ${f(y)}) scale(1 ${f(s)}) translate(0 ${f(-y)})`); }, AC.ease.outCubic)),
        ]);
        filet.remove();
        await incline(id, 'R', -62, 0, 300);
        await repos(id, 'R');
      } },
      { s: 8, ms: 420, async f(id) { // on zeste,
        outil('R', 'citron', 0);
        tete(id, 5, 1.5);
        await vers(id, 'R', [CAKE.x + 4, CAKE.y - 20], 400);
        sfx('crunch', { power: 0.25, gain: 0.35 });
        sfx('crunch', { power: 0.25, gain: 0.3, delay: 380 });
        pluie(pointOutil('R', [-1, 10]), 14, P.lemon, 900, 0.5);
        await Promise.all([
          secoue(id, 'R', [CAKE.x + 4, CAKE.y - 20], 4, 0.6, 5, 900),
          tw(id, 900, (e) => gateau.zestes.forEach((z, k) => z.setAttribute('opacity', e * gateau.zestes.length > k ? 1 : 0))),
        ]);
        await repos(id, 'R');
      } },
      { s: 9, ms: 480, async f(id) { // on enfourne,
        outil('R', 'plaque', 0);
        tete(id, 9, 2.5);
        await Promise.all([penche(id, 14, 6, 480), vers(id, 'R', [OVEN.x + 64, OVEN.y + 8], 480)]);
        sfx('creak', { gain: 0.5 });
        await tw(id, 360, (e) => porte(1 - 0.84 * e), AC.ease.outCubic);
        await vers(id, 'R', [OVEN.x + 64, OVEN.y + 30.4], 380);
        outil('R', null);
        four.plaque.setAttribute('opacity', 1);
        four.vitrePlaque.setAttribute('opacity', 1);
        await vers(id, 'R', [OVEN.x + 68, OVEN.y + 4], 300);
        sfx('close', { gain: 0.6 });
        await tw(id, 320, (e) => porte(0.16 + 0.84 * e), AC.ease.inCubic);
        fourAllume(true);
        await Promise.all([penche(id, 0, 0, 420), repos(id, 'R', 420)]);
      } },
      { s: 10, ms: 480, async f(id) { // on émulsionne,
        outil('L', 'spatule', 14);
        tete(id, -6, -1.5);
        await Promise.all([vers(id, 'L', [B[0] + 3, B[1] - 16], 380), bolCouleur(id, CONTENU.chantilly, CONTENU.choco, 380), tw(id, 380, (e) => { bol.pics.setAttribute('opacity', f(1 - e)); bol.spirale.setAttribute('opacity', f(e)); })]);
        sfx('stir', { n: 4, gain: 0.7 });
        const rot = AC.reduced ? null : bol.spirale.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(540deg)' }], { duration: 1300, easing: 'linear' });
        await Promise.all([tourne(id, 'L', [B[0], B[1] - 13], 9, 2.6, 3, 1300), bolCouleur(id, CONTENU.choco, CONTENU.ganache, 1300), tw(id, 1300, (e) => bol.spirale.setAttribute('opacity', f(1 - e)))]);
        if (rot) rot.cancel();
        await repos(id, 'L');
      } },
      { s: 11, ms: 420, async f(id) { // on nappe,
        outil('R', 'casserole', 0);
        tete(id, 5, 1.5);
        const z = gateau.zig;
        await vers(id, 'R', [z[z.length - 1][0] + 26, z[z.length - 1][1] - 18], 420);
        await incline(id, 'R', 0, -48, 320);
        const filet = path(L.fx, '', 'none', { stroke: P.caramel, 'stroke-width': 1.3, 'stroke-linecap': 'round' });
        sfx('pour', { dur: 1, gain: 0.6 });
        await tw(id, 1000, (e) => {
          const k = Math.min(z.length - 1, Math.floor((1 - e) * (z.length - 1))), t = (1 - e) * (z.length - 1) - k;
          const q = z[Math.min(z.length - 1, k + 1)], p0 = z[k], cur = lerp2(p0, q, t);
          main.R = [cur[0] + 26, cur[1] - 18];
          drawArm('R');
          const bec = pointOutil('R', [-28, -0.8]);
          filet.setAttribute('d', `M${pt(bec)}L${pt(cur)}`);
          gateau.filet.setAttribute('stroke-dashoffset', f(gateau.filetLen * (1 - e)));
        }, AC.ease.linear);
        filet.remove();
        await incline(id, 'R', -48, 0, 280);
        await repos(id, 'R');
      } },
      { s: 12, ms: 480, async f(id) { // on caramélise,
        outil('R', 'chalumeau', 26);
        tete(id, 5, 1.5);
        await vers(id, 'R', [CAKE.x + 18, CAKE.y - 24], 400);
        outils.R.flamme.setAttribute('opacity', 1);
        sfx('fizz', { gain: 0.6 });
        sfx('fizz', { gain: 0.5, delay: 500 });
        const fl = AC.reduced ? null : outils.R.flamme.animate([{ transform: 'translate(4px, 12.2px) rotate(-28deg) scale(1, 1)' }, { transform: 'translate(4px, 12.2px) rotate(-26deg) scale(.9, 1.12)' }], { duration: 90, iterations: Infinity, direction: 'alternate' });
        await tw(id, 1100, (e) => {
          const x = CAKE.x + 16 - e * 32;
          main.R = [x + 6, CAKE.y - 24 + Math.sin(e * 9) * 0.8];
          drawArm('R');
          const bout = pointOutil('R', [9.6, 23]);
          gateau.rosaces.forEach((r) => { if (Math.abs(r.x - bout[0]) < 4) r.cap.setAttribute('opacity', 1); });
        }, AC.ease.inOutSine);
        gateau.rosaces.forEach((r) => r.cap.setAttribute('opacity', 1));
        if (fl) fl.cancel();
        outils.R.flamme.setAttribute('opacity', 0);
        await repos(id, 'R');
      } },
      { s: 13, ms: 900, async f(id) { // on chérit notre matière première :
        tete(id, 0, 0, 380);
        await Promise.all([vers(id, 'L', [128, 446], 520, AC.ease.outCubic), vers(id, 'R', [282, 446], 520, AC.ease.outCubic)]);
        sfx('chime', { gain: 0.45 });
        coeurs(CX, 388, 5, 1500);
        await attends(id, 650);
        await Promise.all([vers(id, 'L', REST.L, 480), vers(id, 'R', REST.R, 480)]);
      } },
      ...ingredientsSteps(),
      { s: 19, ms: 1300, async f(id) { // Et donc, ici on aime le fait maison.
        await tw(id, 520, (e) => { teteEtat.a = 7 * e; teteEtat.x = 1.5 * e; poseTete(); mallo.joue.setAttribute('opacity', f(e)); mallo.cheveux.setAttribute('transform', `translate(${f(-1.4 * e)} 0)`); });
        coeurs(CX + 14, 392, 3, 1400);
        sfx('ding', { gain: 0.5 });
        four.glow.forEach((g) => g.animate && !AC.reduced && g.animate([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], { duration: 700 }));
        await tw(id, 420, (e) => gateau.etincelle.setAttribute('transform', `translate(${CAKE.x + 16} ${CAKE.y - 12}) scale(${f(Math.sin(e * Math.PI) * 1.2)}) rotate(${f(e * 90)})`));
        sfx('chord', { gain: 0.5, delay: 200 });
        await attends(id, 1500);
        await tw(id, 520, (e) => { teteEtat.a = 7 * (1 - e); teteEtat.x = 1.5 * (1 - e); poseTete(); mallo.joue.setAttribute('opacity', f(1 - e)); mallo.cheveux.setAttribute('transform', `translate(${f(-1.4 * (1 - e))} 0)`); });
      } },
    ];
    function ingredientsSteps() {
      return ingredients.map((it, k) => ({ s: 14 + k, ms: 520, async f(id) {
        sfx('tine', { m: [76, 79, 81, 84, 88][k], gain: 0.4 });
        if (!AC.reduced) {
          it.g.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-3.5px)', offset: 0.35 }, { transform: 'translateY(0)' }], { duration: 420, easing: 'ease-out' });
          it.coeur.animate([{ opacity: 0, transform: 'translateY(4px) scale(.4)' }, { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.3 }, { opacity: 0, transform: 'translateY(-10px) scale(.9)' }], { duration: 1100, easing: 'ease-out' });
        }
        await attends(id, 560);
      } }));
    }

    /* ---------- la lecture ---------- */
    async function jouer() {
      const id = ++tour;
      joue = true;
      if (btn) btn.hidden = true;
      etat(false);
      if (AC.reduced) { etat(true); joue = false; return; }
      await visible(id);
      await attends(id, 250);
      if (!vivant(id)) return;
      ouvre(true); // la bulle s'ouvre : elle va parler
      sfx('pop', { gain: 0.22 });
      await attends(id, 380);
      for (const st of ETAPES) {
        await visible(id);
        if (!vivant(id)) return;
        courant = st.s;
        dit(id, st.s, st.ms);
        await st.f(id);
        if (!vivant(id)) return;
        calme(st.s);
        await attends(id, 160);
      }
      if (!vivant(id)) return;
      joue = false;
      try { sessionStorage.setItem('ac-conte', '1'); } catch (e) { /* navigation privée */ }
      if (btn) btn.hidden = false;
    }
    function fin() { tour++; joue = false; etat(true); }
    function arreter() { tour++; joue = false; }
    cible.addEventListener('click', () => { if (!joue) jouer(); });
    if (btn) btn.addEventListener('click', () => jouer());
    etat(false);
    dessine();
    /** Le premier plan arrive pendant que le salon se construit (le comptoir monte, Mallo avec) */
    function entree(delay = 1500) {
      if (AC.reduced) return;
      entre.animate([{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 750, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    }
    return {
      jouer, fin, arreter, entree,
      get joue() { return joue; },
      get etape() { return courant; }, // l'étape en cours (contrôles visuels)
      deja: () => { try { return sessionStorage.getItem('ac-conte') === '1'; } catch (e) { return false; } },
    };
  }

  AC.Conte = { create };
})();
