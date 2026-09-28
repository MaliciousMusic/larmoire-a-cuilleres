/* ==========================================================================
   L'Armoire à Cuillères — le salon : un coin de la salle, vu de face
   SVG dessiné en JS (viewBox 0 0 400 520 ; 1 unité = 1 cm au fond de la salle) d'après
   leurs photos : la voûte crème et sa guirlande, le papier peint à fleurettes, la vieille
   armoire vitrée en bois chocolat (assiettes anciennes, tasses suspendues, râtelier de
   cuillères, une colonie de livres sur le dessus), la suspension en tissu plissé,
   l'applique en laiton, le pan de carreaux noir et blanc, les tomettes cirées, le guéridon
   menthe et sa nappe de lin fleurie, la vaisselle d'antan, la chaise bistrot en bois courbé
   (Thonet n° 14), la chaise paillée vieux rose et son coussin, la vieille malle aux livres.
   Perspective : horizon à y = 248 (les yeux à 1,50 m), mur du fond à 4,50 m ; le mobilier
   de devant est projeté par une petite vue 3D (échelle 1,1 à 1,7).
   Calques : salle → armoire → malle, chaises, guéridon → pénombre → suspension → lumière
   → vapeur. Le décor déborde du cadre (hôtes plus larges que 400/520).
   API : AC.Salon.create(host, opts) → Promise<{ svg, play(), idle(), touch(nom), stop(), targets }>
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});
  const S = (tag, attrs, parent) => AC.svg(tag, attrs, parent);
  const f = (n) => Math.round(n * 100) / 100;

  const P = {
    wood: '#3B2723', woodLight: '#5A4038', woodDark: '#241714', woodMid: '#4A332D', woodEdge: '#6B4E44', woodDeep: '#2E1D19', woodWarm: '#8A6655',
    porc: '#FCF9F3',
    mint: '#A1D4D5', mintDark: '#7DB2B4', mintDeep: '#5B8F92', mintLight: '#CDEDEC',
    teal: '#2E767E', yellow: '#E2C441', yellowDark: '#C3A52C', yellowDeep: '#9E8420',
    pink: '#E4B4AB', pinkDark: '#C99088', pinkDeep: '#A06A63', pinkLight: '#F6DAD3',
    brass: '#C9A45C', brassLight: '#F3DFA8', brassDark: '#7C5E2A',
    turquoise: '#3FC7EE', prune: '#6C2383', fuchsia: '#E64AA8', marine: '#13365E', aqua: '#A6E6DC',
    blue: '#34549A', rose: '#D98B8B', roseDeep: '#B8615F', leafG: '#7FA277', gold: '#C9A45C',
    chocTop: '#2C140A', chocCrumb: '#6E3B22',
    bent: '#56301C', bentHi: '#A36A42', bentSpec: '#F0C898',
    cane: '#D8AF6C', caneDark: '#8E6232', caneLight: '#F0D7A2',
    tileK: '#2A2421', tileW: '#E9E1D0',
    silver: '#C9CDD2', silverDark: '#7E848A',
    straw: '#D9B96E', strawDark: '#A8863F',
  };
  const BOOKS = ['#7A2E2E', '#3F5B3A', P.marine, '#C98E2E', '#E6D9BD', P.teal, '#5E2A6E', '#D39C95', '#8A5A3C', '#9FB39A', '#B8433A', '#44617A', P.yellow, '#2F4A3A', '#A6C8C0', P.prune];

  /* ---------- la perspective de la salle ---------- */
  const HZ = 248; // l'horizon : les yeux à 1,50 m
  const EYE = 150;
  const Z0 = 450; // le mur du fond est à 4,50 m (échelle 1)
  const WALL = HZ + EYE; // le pied du mur du fond (y = 398)
  const footY = (k) => HZ + EYE * k; // y du sol sous un objet d'échelle k
  const floorY = (z) => HZ + (EYE * Z0) / z;
  const zAt = (y) => (EYE * Z0) / (y - HZ);
  // la voûte : l'arc du mur du fond
  const ARC = { cx: 200, cy: 358, r: 290 };
  const archY = (x) => ARC.cy - Math.sqrt(Math.max(0, ARC.r * ARC.r - (x - ARC.cx) ** 2));

  /* ---------- petites briques ---------- */
  function lin(defs, id, stops, { x1 = 0, y1 = 0, x2 = 0, y2 = 1, units, tr } = {}) {
    const g = S('linearGradient', { id, x1, y1, x2, y2, gradientUnits: units, gradientTransform: tr }, defs);
    stops.forEach(([o, c, a]) => S('stop', { offset: o, 'stop-color': c, 'stop-opacity': a == null ? 1 : a }, g));
    return `url(#${id})`;
  }
  function rad(defs, id, stops, { cx = 0.5, cy = 0.5, r = 0.5, fx, fy, units, tr } = {}) {
    const g = S('radialGradient', { id, cx, cy, r, fx, fy, gradientUnits: units, gradientTransform: tr }, defs);
    stops.forEach(([o, c, a]) => S('stop', { offset: o, 'stop-color': c, 'stop-opacity': a == null ? 1 : a }, g));
    return `url(#${id})`;
  }
  const rect = (p, x, y, w, h, fill, extra = {}) => S('rect', { x: f(x), y: f(y), width: f(w), height: f(h), fill, ...extra }, p);
  const path = (p, d, fill, extra = {}) => S('path', { d, fill, ...extra }, p);
  const ell = (p, cx, cy, rx, ry, fill, extra = {}) => S('ellipse', { cx: f(cx), cy: f(cy), rx: f(rx), ry: f(ry), fill, ...extra }, p);
  const circ = (p, cx, cy, r, fill, extra = {}) => S('circle', { cx: f(cx), cy: f(cy), r: f(r), fill, ...extra }, p);
  const G = (p, attrs) => S('g', attrs || {}, p);
  const pt = (q) => f(q[0]) + ' ' + f(q[1]);
  const poly = (pts, close = true) => 'M' + pts.map(pt).join('L') + (close ? 'Z' : '');
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  /** une ellipse en sous-chemin (pour grouper les formes d'une même couleur dans un seul <path>) */
  function ellD(cx, cy, rx, ry, rot = 0) {
    const c = Math.cos((rot * Math.PI) / 180), s = Math.sin((rot * Math.PI) / 180);
    const a = [cx - rx * c, cy - rx * s], b = [cx + rx * c, cy + rx * s];
    return `M${pt(a)}A${f(rx)} ${f(ry)} ${f(rot)} 1 0 ${pt(b)}A${f(rx)} ${f(ry)} ${f(rot)} 1 0 ${pt(a)}Z`;
  }
  /** moitié avant (basse) d'une ellipse, de gauche à droite */
  const frontArc = (cx, cy, rx, ry) => `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 0 0 ${f(cx + rx)} ${f(cy)}`;
  /** zone de toucher invisible (les petits objets doivent rester faciles à toucher au doigt) */
  const hit = (p, d) => path(p, d, '#000', { 'fill-opacity': 0, class: 'sa-hit' });
  const boxD = (pts, m = 0) => {
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const x0 = Math.min(...xs) - m, y0 = Math.min(...ys) - m;
    return `M${f(x0)} ${f(y0)}H${f(Math.max(...xs) + m)}V${f(Math.max(...ys) + m)}H${f(x0)}Z`;
  };

  /** Une petite vue 3D : (x, y, z) en cm (y vers le haut, z vers nous) → écran. th : rotation, ph : plongée */
  function view(X, Y, s, th = 0, ph = 0.3) {
    const ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
    const v = (x, y, z) => [X + (x * ct + z * st) * s, Y - (y * cp - (-x * st + z * ct) * sp) * s];
    v.depth = (x, z) => -x * st + z * ct;
    Object.assign(v, { X, Y, s, th, ph, cp, sp });
    return v;
  }
  /** Un membre tourné ou cintré, droit de A à B (écran) ; prof : [[t, largeur]…] ; side : côté éclairé */
  function tubeD(A, B, prof, side = 1) {
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const l = [], r = [], h = [];
    prof.forEach(([t, w]) => {
      const cx = A[0] + dx * t, cy = A[1] + dy * t, k = w / 2;
      l.push([cx + nx * k, cy + ny * k]);
      r.push([cx - nx * k, cy - ny * k]);
      const kh = side * (k - Math.min(0.9, w * 0.24));
      h.push([cx + nx * kh, cy + ny * kh]);
    });
    return { body: poly(l.concat(r.reverse())), hi: poly(h, false) };
  }

  /** Panneau mouluré (plate-bande en relief), éclairé en haut à droite : la lumière vient de la salle */
  function panel(p, x, y, w, h, { inset = 4, bevel = 2.4, base = P.wood } = {}) {
    const g = G(p);
    const x0 = x + inset, y0 = y + inset, x1 = x + w - inset, y1 = y + h - inset, b = bevel;
    rect(g, x, y, w, h, base);
    rect(g, x0 - 0.8, y0 - 0.8, x1 - x0 + 1.6, y1 - y0 + 1.6, P.woodDark, { opacity: 0.6 });
    path(g, `M${f(x0)} ${f(y0)}H${f(x1)}L${f(x1 - b)} ${f(y0 + b)}H${f(x0 + b)}Z`, P.woodEdge);
    path(g, `M${f(x1)} ${f(y0)}V${f(y1)}L${f(x1 - b)} ${f(y1 - b)}V${f(y0 + b)}Z`, P.woodLight);
    path(g, `M${f(x0)} ${f(y1)}L${f(x0 + b)} ${f(y1 - b)}H${f(x1 - b)}L${f(x1)} ${f(y1)}Z`, P.woodDark);
    path(g, `M${f(x0)} ${f(y0)}L${f(x0 + b)} ${f(y0 + b)}V${f(y1 - b)}L${f(x0)} ${f(y1)}Z`, P.woodDeep);
    rect(g, x0 + b, y0 + b, x1 - x0 - 2 * b, y1 - y0 - 2 * b, base);
    return g;
  }
  /** Veinage : quelques filets ondulés, très discrets */
  function grainD(x, y, w, h, R, n = 6, vertical = true) {
    let d = '';
    for (let i = 0; i < n; i++) {
      if (vertical) {
        const gx = x + (w * (i + R() * 0.8)) / n;
        d += `M${f(gx)} ${f(y)}`;
        const steps = Math.max(2, Math.round(h / 20));
        for (let k = 1; k <= steps; k++) d += `S${f(gx + (R() - 0.5) * 1.8)} ${f(y + (h * (k - 0.5)) / steps)} ${f(gx + (R() - 0.5) * 1.2)} ${f(y + (h * k) / steps)}`;
      } else {
        const gy = y + (h * (i + R() * 0.8)) / n;
        d += `M${f(x)} ${f(gy)}`;
        const steps = Math.max(2, Math.round(w / 20));
        for (let k = 1; k <= steps; k++) d += `S${f(x + (w * (k - 0.5)) / steps)} ${f(gy + (R() - 0.5) * 1.6)} ${f(x + (w * k) / steps)} ${f(gy + (R() - 0.5) * 1.1)}`;
      }
    }
    return d;
  }
  const grain = (p, x, y, w, h, R, n = 6, op = 0.12, vertical = true) =>
    path(p, grainD(x, y, w, h, R, n, vertical), 'none', { stroke: '#7A5A4C', 'stroke-width': 0.4, opacity: op, 'pointer-events': 'none' });
  /** Feuille en cœur (pothos) : attache en (x, y), pointe dans la direction a (radians), taille s */
  function heartLeaf(x, y, s, a) {
    const c = Math.cos(a - Math.PI / 2), sn = Math.sin(a - Math.PI / 2);
    const T = (u, v) => [x + (u * c - v * sn) * s, y + (u * sn + v * c) * s];
    const q = [[0, 0.06], [-0.36, -0.14], [-0.64, 0.1], [-0.53, 0.43], [-0.43, 0.72], [-0.1, 0.9], [0, 1.06], [0.1, 0.9], [0.43, 0.72], [0.53, 0.43], [0.64, 0.1], [0.36, -0.14], [0, 0.06]].map(([u, v]) => T(u, v));
    return `M${pt(q[0])}C${pt(q[1])} ${pt(q[2])} ${pt(q[3])}C${pt(q[4])} ${pt(q[5])} ${pt(q[6])}C${pt(q[7])} ${pt(q[8])} ${pt(q[9])}C${pt(q[10])} ${pt(q[11])} ${pt(q[12])}Z`;
  }
  /** Feuille lancéolée (cadre, décors) : base en (x, y), longueur l, demi-largeur w, angle a (degrés) */
  function lanceLeaf(x, y, l, w, a) {
    const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    const T = (u, v) => [x + u * c - v * s, y + u * s + v * c];
    const q = [T(0, 0), T(l * 0.3, -w), T(l * 0.8, -w * 0.8), T(l, 0), T(l * 0.8, w * 0.8), T(l * 0.3, w)];
    return `M${pt(q[0])}C${pt(q[1])} ${pt(q[2])} ${pt(q[3])}C${pt(q[4])} ${pt(q[5])} ${pt(q[0])}Z`;
  }
  /** Un pothos qui retombe : tiges et feuilles, groupées par couleur (4 éléments en tout) */
  function pothos(p, R, x0, y0, vines, crown = 6) {
    const stems = [], leaves = [[], [], []];
    vines.forEach(([dx, lean, len], vi) => {
      const pts = [];
      const n = Math.max(4, Math.round(len / 9));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        pts.push([x0 + dx + lean * 16 * Math.min(1, t * 2.5) + Math.sin(t * 6 + vi * 1.7) * 2, y0 + 3 + t * len]);
      }
      stems.push(AC.openPath(pts));
      pts.forEach((q, k) => {
        if (!k) return;
        const side = (k + vi) % 2 ? 1 : -1;
        leaves[(k + vi) % 3].push(heartLeaf(q[0] + side * 1.2, q[1], 5.4 + R() * 2, Math.PI / 2 + side * (0.6 + R() * 0.6)));
      });
    });
    for (let k = 0; k < crown; k++) leaves[k % 3].push(heartLeaf(x0 + (k - (crown - 1) / 2) * 2.7, y0, 6.4 + R() * 1.6, -Math.PI / 2 + (k - (crown - 1) / 2) * 0.46));
    path(p, stems.join(''), 'none', { stroke: '#557A3E', 'stroke-width': 0.7 });
    ['#46703A', '#6A954B', '#8CB662'].forEach((c, i) => path(p, leaves[i].join(''), c));
  }
  function pot(p, x, y, w = 14, h = 11) {
    path(p, `M${f(x - w / 2)} ${f(y - h)}h${w}l${f(-w * 0.12)} ${h}h${f(-w * 0.76)}z`, '#B9694A');
    rect(p, x - w / 2 - 0.8, y - h - 1.4, w + 1.6, 2.6, '#CD7E5B', { rx: 0.8 });
    path(p, `M${f(x + w * 0.2)} ${f(y - h + 1.6)}l-0.8 ${f(h - 2.4)}`, 'none', { stroke: '#E29A78', 'stroke-width': 0.8, opacity: 0.6 });
  }

  /* ---------- texture d'enduit (canvas → image, une fois) ---------- */
  let plasterURL = null;
  function plasterTexture() {
    if (plasterURL !== null) return plasterURL;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      const img = x.createImageData(128, 128);
      const n1 = AC.noise2(31), n2 = AC.noise2(32);
      for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
        const u = i / 128, v = j / 128;
        const s = (a, b) => n1(a * 5, b * 5) * 0.6 + n2(a * 19, b * 19) * 0.4;
        const val = s(u, v) * (1 - u) * (1 - v) + s(u - 1, v) * u * (1 - v) + s(u, v - 1) * (1 - u) * v + s(u - 1, v - 1) * u * v;
        const k = (j * 128 + i) * 4, t = 0.5 + val * 0.5;
        img.data[k] = 150 + t * 75; img.data[k + 1] = 118 + t * 62; img.data[k + 2] = 78 + t * 46;
        img.data[k + 3] = 18 + Math.abs(val) * 36;
      }
      x.putImageData(img, 0, 0);
      plasterURL = c.toDataURL();
    } catch (e) { plasterURL = ''; }
    return plasterURL;
  }

  /* ======================================================================
     La salle : voûte, guirlande, mur, papier peint, carreaux, applique, cadre, tomettes
     ====================================================================== */
  const LAMP = { x: 268, k: 1.55 };
  LAMP.cap = HZ - (231 - EYE) * LAMP.k; // la douille
  LAMP.y0 = HZ - (224 - EYE) * LAMP.k; // haut de l'abat-jour
  LAMP.y1 = HZ - (186 - EYE) * LAMP.k; // l'ourlet
  LAMP.w0 = 11 * LAMP.k;
  LAMP.w1 = 45 * LAMP.k;

  function drawRoom(C, p) {
    const { defs, U, R, LIN, RAD } = C;
    const out = {};
    const xa = ARC.cx - ARC.r, xb = ARC.cx + ARC.r;
    // la voûte en berceau (elle vient vers nous), éclairée par en dessous
    rect(p, -130, -90, 660, WALL + 90, RAD([[0, '#F3DFB8'], [0.26, '#DCBE90'], [0.62, '#A9875E'], [1, '#6A4F37']], { cx: LAMP.x, cy: 160, r: 420, units: 'userSpaceOnUse' }));
    // un arc doubleau plus près de nous : la profondeur du berceau
    const k2 = 1.34, c2 = HZ + (ARC.cy - HZ) * k2, r2 = ARC.r * k2;
    path(p, `M${f(ARC.cx - r2 - 30)} ${f(c2)}A${f(r2)} ${f(r2)} 0 0 1 ${f(ARC.cx + r2 + 30)} ${f(c2)}`, 'none', { stroke: '#8F7152', 'stroke-width': 13, opacity: 0.2 });
    path(p, `M${f(ARC.cx - r2 + 6)} ${f(c2)}A${f(r2 - 6)} ${f(r2 - 6)} 0 0 1 ${f(ARC.cx + r2 - 6)} ${f(c2)}`, 'none', { stroke: '#FFF0D2', 'stroke-width': 1.2, opacity: 0.3 });
    // le mur du fond, fermé par l'arc ; papier peint à fleurettes
    const wallD = `M${xa} ${WALL + 1}V${ARC.cy}A${ARC.r} ${ARC.r} 0 0 1 ${xb} ${ARC.cy}V${WALL + 1}Z`;
    path(p, wallD, RAD([[0, '#FFF0CE'], [0.24, '#F5DDAF'], [0.55, '#DFBD88'], [1, '#A5825A']], { cx: LAMP.x, cy: 215, r: 360, units: 'userSpaceOnUse' }));
    const wp = U('wp');
    const wpat = S('pattern', { id: wp, width: 22, height: 26, patternUnits: 'userSpaceOnUse' }, defs);
    // un brin : trois petits pétales et deux feuilles, en quinconce, entre de fines rayures
    const fl = (x, y) => ellD(x, y - 1.5, 0.8, 1.2) + ellD(x - 1.3, y - 0.4, 1.2, 0.8, 30) + ellD(x + 1.3, y - 0.4, 1.2, 0.8, -30);
    const lf = (x, y) => lanceLeaf(x, y + 0.6, 3.2, 0.8, 120) + lanceLeaf(x, y + 0.6, 3.2, 0.8, 60);
    path(wpat, 'M0 0V26M11 0V26', 'none', { stroke: '#B8986A', 'stroke-width': 0.3, opacity: 0.22 });
    path(wpat, lf(5.5, 6.5) + lf(16.5, 19.5), '#8C8A5A', { opacity: 0.16 });
    path(wpat, fl(5.5, 6.5) + fl(16.5, 19.5), '#B0765A', { opacity: 0.2 });
    path(p, wallD, `url(#${wp})`);
    // l'enduit
    const tex = plasterTexture();
    if (tex) {
      const pat = U('pl');
      const pa = S('pattern', { id: pat, width: 128, height: 128, patternUnits: 'userSpaceOnUse' }, defs);
      S('image', { href: tex, width: 128, height: 128 }, pa);
      rect(p, -130, -90, 660, WALL + 90, `url(#${pat})`, { 'pointer-events': 'none' });
    }
    // l'arête de la voûte : un filet d'ombre, un filet de lumière
    path(p, `M${xa} ${ARC.cy}A${ARC.r} ${ARC.r} 0 0 1 ${xb} ${ARC.cy}`, 'none', { stroke: '#7E6044', 'stroke-width': 2.6, opacity: 0.4 });
    path(p, `M${xa + 3} ${ARC.cy}A${ARC.r - 3} ${ARC.r - 3} 0 0 1 ${xb - 3} ${ARC.cy}`, 'none', { stroke: '#FFF6E2', 'stroke-width': 1.3, opacity: 0.5 });

    // la guirlande guinguette, en festons sous la voûte
    const hooks = [-40, 58, 150, 242, 334, 430].map((x) => [x, archY(x) + 4]);
    let wire = '';
    const bulbs = [];
    for (let i = 0; i < hooks.length - 1; i++) {
      const [x0, y0] = hooks[i], [x1, y1] = hooks[i + 1];
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + 30;
      wire += `M${f(x0)} ${f(y0)}Q${f(mx)} ${f(my)} ${f(x1)} ${f(y1)}`;
      for (let k = 1; k <= 4; k++) {
        const t = k / 5, u = 1 - t;
        bulbs.push([u * u * x0 + 2 * u * t * mx + t * t * x1, u * u * y0 + 2 * u * t * my + t * t * y1]);
      }
    }
    const gar = G(p, { class: 'sa-guirlande' });
    path(gar, bulbs.map(([x, y]) => ellD(x, y + 4, 8, 8)).join(''), '#FFD98C', { opacity: 0.14 });
    path(gar, bulbs.map(([x, y]) => ellD(x, y + 4, 4.4, 4.4)).join(''), '#FFE6A8', { opacity: 0.28 });
    path(gar, wire, 'none', { stroke: '#3A2A20', 'stroke-width': 0.6, opacity: 0.8 });
    path(gar, bulbs.map(([x, y]) => `M${f(x)} ${f(y)}v1.8`).join(''), 'none', { stroke: '#2A1E17', 'stroke-width': 1.3 });
    path(gar, bulbs.map(([x, y]) => ellD(x, y + 4, 1.9, 2.3)).join(''), '#FFF3CC');
    out.garland = gar;

    // le pan de carreaux noir et blanc (en losanges), coiffé d'une étagère
    const TX = 322, TY = 152;
    const tp = U('tl');
    const tpat = S('pattern', { id: tp, width: 13, height: 13, patternUnits: 'userSpaceOnUse', x: TX, y: WALL }, defs);
    rect(tpat, 0, 0, 13, 13, P.tileW);
    path(tpat, 'M6.5 0L13 6.5L6.5 13L0 6.5Z', P.tileK);
    path(tpat, 'M6.5 0L13 6.5L6.5 13L0 6.5Z', 'none', { stroke: '#A0978B', 'stroke-width': 0.45 });
    path(tpat, 'M6.5 1.4L7.6 2.5', 'none', { stroke: '#fff', 'stroke-width': 0.5, opacity: 0.35 });
    rect(p, TX, TY, 560 - TX, WALL - TY, `url(#${tp})`);
    rect(p, TX, TY, 560 - TX, WALL - TY, LIN([[0, '#2A160C', 0.3], [0.12, '#FFE6BA', 0.14], [0.45, '#FFE6BA', 0.04], [1, '#140A05', 0.45]]));
    rect(p, TX, TY, 70, WALL - TY, LIN([[0, '#FFD89A', 0.22], [1, '#FFD89A', 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    rect(p, TX - 2.6, TY, 2.6, WALL - TY, P.woodMid);
    rect(p, TX - 2.6, TY, 0.8, WALL - TY, P.woodEdge);
    // l'étagère, les boîtes à thé, un pothos qui retombe sur les carreaux
    const shelf = G(p, { class: 'sa-etagere' });
    [TX + 10, TX + 64].forEach((bx) => path(shelf, `M${bx} ${TY + 1}v11c0 -5.5 5 -9 9.5 -10h-9.5z`, P.woodDark));
    rect(shelf, TX - 7, TY - 6, 560 - TX, 7, P.woodMid);
    rect(shelf, TX - 7, TY - 6, 560 - TX, 1.4, P.woodWarm);
    rect(shelf, TX - 7, TY, 560 - TX, 1.2, P.woodDeep);
    [[TX + 3, 12, 16, P.teal, '#1F5A60'], [TX + 17, 10.5, 12.5, P.yellow, P.yellowDark], [TX + 30, 12, 18, P.pink, P.pinkDeep]].forEach(([x, w, h, c, cd]) => {
      const y = TY - 6;
      rect(shelf, x, y - h, w, h, c, { rx: 1 });
      rect(shelf, x - 0.5, y - h - 1.2, w + 1, 3, cd, { rx: 0.8 });
      rect(shelf, x + 1.6, y - h * 0.62, w - 3.2, h * 0.36, '#F4ECDD', { rx: 0.6 });
      path(shelf, `M${x + 3} ${f(y - h * 0.5)}h${f(w - 6)}M${x + 3.6} ${f(y - h * 0.4)}h${f(w - 7.2)}`, 'none', { stroke: cd, 'stroke-width': 0.6, opacity: 0.8 });
      rect(shelf, x + w - 2.6, y - h + 1.4, 1.1, h - 2.4, '#fff', { opacity: 0.3 });
    });
    pot(shelf, TX + 60, TY - 6);
    pothos(shelf, R, TX + 60, TY - 18, [[-5, -0.2, 60], [2, 0.3, 96], [6, 0.6, 44], [-2, -0.7, 30]], 7);

    // le lambris de pin blond à mi-hauteur (nostalgique du bois), sa cimaise, la plinthe
    const LX0 = 136, LX1 = TX - 2.6, LY = WALL - 96;
    rect(p, LX0, LY, LX1 - LX0, WALL - LY, LIN([[0, '#D6AC77'], [0.55, '#C99C68'], [1, '#A77B4C']]));
    const boards = [], hi = [];
    for (let x = LX0 + 9.6; x < LX1 - 1; x += 9.6) { boards.push(`M${f(x)} ${f(LY)}V${WALL}`); hi.push(`M${f(x + 0.7)} ${f(LY)}V${WALL}`); }
    path(p, boards.join(''), 'none', { stroke: '#7E5530', 'stroke-width': 0.7, opacity: 0.75 });
    path(p, hi.join(''), 'none', { stroke: '#F0CF9C', 'stroke-width': 0.5, opacity: 0.45 });
    grain(p, LX0, LY, LX1 - LX0, WALL - LY, R, 22, 0.16);
    path(p, [[LX0 + 30, LY + 40], [LX0 + 97, LY + 62], [LX0 + 150, LY + 28]].map(([x, y]) => ellD(x, y, 1.3, 1.9)).join(''), '#8A5E36', { opacity: 0.45 });
    rect(p, LX0, LY - 5, LX1 - LX0, 5, P.woodMid);
    rect(p, LX0, LY - 5, LX1 - LX0, 1.3, P.woodWarm);
    rect(p, LX0, LY, LX1 - LX0, 1.6, '#000', { opacity: 0.22 });
    rect(p, LX0, WALL - 8, LX1 - LX0, 8, P.woodMid);
    rect(p, LX0, WALL - 8, LX1 - LX0, 1.2, P.woodWarm);

    // l'applique en laiton, tulipe d'opaline
    const AX = 175, AY = 224;
    out.appGlow = ell(p, AX + 1, AY - 22, 64, 78, RAD([[0, '#FFEFC4', 1], [0.25, '#FFE0A0', 0.55], [0.6, '#FFD48E', 0.16], [1, '#FFD08A', 0]]), { class: 'sa-glow-app' });
    const app = G(p, { class: 'sa-applique' });
    const brassG = LIN([[0, P.brassLight], [0.5, P.brass], [1, P.brassDark]], { x1: 0, y1: 0, x2: 1, y2: 0 });
    path(app, `M${AX} ${AY + 5}c0 3.6 -3.6 5 -5 2.8c-1 -1.6 0.6 -3.2 2 -2`, 'none', { stroke: P.brass, 'stroke-width': 1.1, 'stroke-linecap': 'round' });
    ell(app, AX, AY, 4, 6, brassG);
    const arm = `M${AX} ${AY - 2}C${AX} ${AY - 9} ${AX + 9} ${AY - 7} ${AX + 9} ${AY - 14}C${AX + 9} ${AY - 17} ${AX + 5} ${AY - 18} ${AX + 2} ${AY - 17.6}`;
    path(app, arm, 'none', { stroke: P.brassDark, 'stroke-width': 2.2, 'stroke-linecap': 'round' });
    path(app, arm, 'none', { stroke: P.brassLight, 'stroke-width': 0.8, 'stroke-linecap': 'round', transform: 'translate(-0.3 -0.4)' });
    path(app, `M${AX - 3.4} ${AY - 19.2}h7.4l-1.2 3h-5z`, brassG);
    const tulipG = LIN([[0, '#FFFCF2'], [0.45, '#FDEEDC'], [1, '#ECC9BA']]);
    const T0 = AY - 19.2;
    path(app, `M${AX - 10.5} ${T0 - 20}C${AX - 10} ${T0 - 11} ${AX - 5} ${T0 - 3} ${AX - 2} ${T0}H${AX + 2}C${AX + 5} ${T0 - 3} ${AX + 10} ${T0 - 11} ${AX + 10.5} ${T0 - 20}C${AX + 6} ${T0 - 18} ${AX - 6} ${T0 - 18} ${AX - 10.5} ${T0 - 20}Z`, tulipG);
    path(app, `M${AX - 10.5} ${T0 - 20}C${AX - 6} ${T0 - 21.8} ${AX + 6} ${T0 - 21.8} ${AX + 10.5} ${T0 - 20}`, 'none', { stroke: '#fff', 'stroke-width': 1, opacity: 0.9 });
    path(app, `M${AX + 5} ${T0 - 17}C${AX + 4.6} ${T0 - 11} ${AX + 3} ${T0 - 6} ${AX + 1.5} ${T0 - 3}`, 'none', { stroke: '#fff', 'stroke-width': 1.4, 'stroke-linecap': 'round', opacity: 0.75 });
    out.applique = app;
    out.appCore = ell(app, AX, T0 - 12, 9, 10, RAD([[0, '#FFFBEA', 0.95], [0.6, '#FFF1C8', 0.4], [1, '#FFE9B0', 0]]));

    // le cadre ovale doré, accroché à un clou : les feuilles de la vitrine
    const FX = 222, FY = 272;
    const frame = G(p, { class: 'sa-cadre' });
    path(frame, `M${FX} ${FY - 34}L${FX - 9} ${FY - 16}M${FX} ${FY - 34}L${FX + 9} ${FY - 16}`, 'none', { stroke: '#7C6448', 'stroke-width': 0.55 });
    circ(frame, FX, FY - 34, 1.1, P.brassDark);
    ell(frame, FX + 1.6, FY + 2, 15, 19, '#3A2416', { opacity: 0.2 });
    ell(frame, FX, FY, 15, 19, LIN([[0, '#F6E2A6'], [0.45, P.brass], [1, '#6E5122']], { x1: 0.2, y1: 0, x2: 0.8, y2: 1 }));
    ell(frame, FX, FY, 12, 16, '#7C5E2A');
    ell(frame, FX, FY, 11.2, 15.2, '#F4ECDC');
    path(frame, lanceLeaf(FX - 3, FY + 11.5, 21, 4.4, -104), P.prune);
    path(frame, lanceLeaf(FX - 1, FY + 11.5, 19, 3.5, -82), P.fuchsia);
    path(frame, lanceLeaf(FX + 1, FY + 11.5, 18, 5.8, -58), P.turquoise);
    path(frame, lanceLeaf(FX, FY + 11.5, 13, 4.8, -130), P.aqua);
    path(frame, `M${FX + 1} ${FY + 11.5}L${f(FX + 1 + 14 * Math.cos(-1.01))} ${f(FY + 11.5 + 14 * Math.sin(-1.01))}`, 'none', { stroke: '#fff', 'stroke-width': 0.55, opacity: 0.9 });
    path(frame, [0, 1, 2, 3].map((k) => ellD(FX + 6 + k * 1.5, FY - 4 + k * 3.4, 1.15, 1.15)).join(''), P.marine);
    ell(frame, FX - 4, FY - 8, 4.5, 7, '#fff', { opacity: 0.2, transform: `rotate(-18 ${FX - 4} ${FY - 8})` });

    // les tomettes cirées, en perspective
    const floor = G(p, { class: 'sa-sol' });
    const clip = U('sc');
    S('rect', { x: -130, y: WALL, width: 660, height: 160 }, S('clipPath', { id: clip }, defs));
    floor.setAttribute('clip-path', `url(#${clip})`);
    rect(floor, -130, WALL, 660, 160, '#5E3222');
    const cols = ['#A8553A', '#9C4E36', '#B06045', '#944731', '#B56A4B'];
    const ds = cols.map(() => []);
    const r = 9.4, gap = 0.8, dz = 1.5 * r, dx = Math.sqrt(3) * r;
    let row = 0;
    for (let zc = Z0 + r * 0.4; zc > zAt(560) - r; zc -= dz, row++) {
      const half = (340 * (zc + r)) / Z0 + dx;
      const off = row % 2 ? dx / 2 : 0;
      for (let xc = -Math.ceil(half / dx) * dx - off; xc <= half; xc += dx) {
        const q = [];
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 2 + (i * Math.PI) / 3;
          const px = xc + (r - gap) * Math.cos(a), pz = zc + (r - gap) * Math.sin(a);
          q.push([200 + (px * Z0) / pz, floorY(pz)]);
        }
        ds[Math.floor(R() * cols.length)].push(poly(q));
      }
    }
    ds.forEach((d, i) => d.length && path(floor, d.join(''), cols[i]));
    // la lumière sur le sol : flaque chaude sous la suspension, reflet de cire, fond plus sombre
    rect(floor, -130, WALL, 660, 160, LIN([[0, '#1E0E07', 0.5], [0.3, '#1E0E07', 0.14], [1, '#1E0E07', 0.1]]));
    out.floorGlow = G(floor, { class: 'sa-sol-lumiere' });
    ell(out.floorGlow, LAMP.x, 470, 170, 52, RAD([[0, '#FFD9A0', 0.4], [0.5, '#FFD9A0', 0.14], [1, '#FFD9A0', 0]]));
    ell(out.floorGlow, LAMP.x - 4, 430, 14, 26, RAD([[0, '#FFF1D6', 0.32], [1, '#FFF1D6', 0]]));
    return out;
  }

  /* ======================================================================
     L'armoire vitrée (bois chocolat), sa vaisselle, son râtelier, ses livres
     ====================================================================== */
  const ARM = { x: 6, k: 1.11, w: 120 };
  ARM.y = footY(ARM.k);

  function drawArmoire(C, root) {
    const { defs, U, R, LIN } = C;
    const out = {};
    // le flanc droit (on le voit un peu : l'armoire est à gauche du point de fuite)
    const xf = ARM.x + ARM.w * ARM.k, xb = 200 + (xf - 200) / ARM.k;
    const yTF = ARM.y - 214 * ARM.k, yTB = HZ - (214 - EYE), yBF = ARM.y - 7 * ARM.k, yBB = HZ + (EYE - 7);
    path(root, `M${f(xf)} ${f(yTF)}L${f(xb)} ${f(yTB)}V${f(yBB)}L${f(xf)} ${f(yBF)}Z`, LIN([[0, '#6A4A3C'], [1, '#3E2923']], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    const A = G(root, { transform: `translate(${ARM.x} ${f(ARM.y)}) scale(${ARM.k})` });
    out.g = A;

    // pieds miches et socle
    [[3, 16], [104, 117]].forEach(([a, b]) => {
      path(A, `M${a} -7C${a - 1.5} -3.5 ${a + 2} 0 ${(a + b) / 2} 0S${b + 1.5} -3.5 ${b} -7Z`, P.woodDark);
      path(A, `M${a + 3} -5.6C${a + 3.5} -3.4 ${a + 5} -2.2 ${f((a + b) / 2)} -2`, 'none', { stroke: P.woodEdge, 'stroke-width': 0.9, opacity: 0.7 });
    });
    rect(A, -1, -15, 122, 8, P.woodMid);
    rect(A, -2, -15.8, 124, 2, P.woodEdge);
    rect(A, -1, -8, 122, 1, P.woodDeep);
    // le bas de buffet
    rect(A, 0, -84, 120, 69, P.wood);
    grain(A, 0, -84, 120, 69, R, 12, 0.14);
    const escG = LIN([[0, P.brassLight], [0.6, P.brass], [1, P.brassDark]], { x1: 0, y1: 0, x2: 1, y2: 1 });
    const drawer = (x, y, w, h) => {
      const g = G(A);
      rect(g, x, y, w, h, P.woodMid);
      rect(g, x, y, w, 1, P.woodEdge);
      rect(g, x + w - 1, y, 1, h, P.woodLight, { opacity: 0.7 });
      rect(g, x, y + h - 1, w, 1, P.woodDeep);
      grain(g, x, y, w, h, R, 3, 0.16, false);
      const cx = x + w / 2, cy = y + h / 2;
      path(g, `M${f(cx - 4.4)} ${f(cy)}c0 -2.7 1.9 -4 4.4 -4s4.4 1.3 4.4 4s-1.9 4 -4.4 4s-4.4 -1.3 -4.4 -4z`, escG);
      path(g, `M${f(cx)} ${f(cy - 1.7)}a1 1 0 0 1 0 2l0.5 1.8h-1z`, P.woodDeep);
      return g;
    };
    drawer(6, -82, 52.5, 15.5);
    // le tiroir entrouvert : l'ombre du dedans et les cuillères qui attendent au fond
    rect(A, 61.5, -82, 52.5, 4.2, '#140B08');
    const handles = [], bowls = [];
    [[67, 6, -24], [74, 4.5, -8], [80, 5.5, -30], [88, 4, 12], [95, 5, -18], [103, 4.2, 20]].forEach(([x, l, a]) => {
      const r = (a * Math.PI) / 180;
      const x1 = x + Math.sin(r) * l, y1 = -78.4 - Math.cos(r) * l;
      handles.push(`M${f(x)} -78.2L${f(x1)} ${f(y1)}`);
      bowls.push(ellD(x1 + Math.sin(r) * 1.2, y1 - Math.cos(r) * 1.2, 0.9, 1.5, a));
    });
    path(A, handles.join(''), 'none', { stroke: '#DDE1E5', 'stroke-width': 0.8, 'stroke-linecap': 'round' });
    path(A, bowls.join(''), LIN([[0, '#FFFFFF'], [0.35, '#E3E6EA'], [0.7, P.silver], [1, P.silverDark]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    out.drawer = drawer(61.5, -77.8, 52.5, 15.5);
    rect(out.drawer, 61.5, -77.8, 52.5, 0.9, P.woodWarm);
    rect(A, 4, -64.6, 112, 3, P.woodDark, { opacity: 0.5 });
    panel(A, 6, -61, 52.5, 43, { inset: 5, bevel: 2.6 });
    panel(A, 61.5, -61, 52.5, 43, { inset: 5, bevel: 2.6 });
    // la tablette (le plateau du buffet)
    rect(A, -4, -91, 128, 7, P.woodMid);
    rect(A, -4, -91, 128, 1.6, P.woodWarm);
    rect(A, -4, -85, 128, 1, P.woodDeep);
    rect(A, -4, -84, 128, 2.4, '#000', { opacity: 0.25 });

    // le haut : vitrine à deux portes, l'intérieur peint en teal (le teal de leur carte)
    rect(A, 4, -190, 112, 99, P.wood);
    const inner = G(A, { class: 'sa-interieur' });
    rect(inner, 11, -183, 98, 85, LIN([[0, '#17454A'], [0.35, '#2A6A71'], [1, '#2F7A80']]));
    rect(inner, 11, -183, 3.2, 85, '#3F8A90', { opacity: 0.6 });
    [-155, -130].forEach((y) => {
      rect(inner, 11, y, 98, 2.2, '#3D8C91');
      rect(inner, 11, y + 2.2, 98, 1.6, '#123E43', { opacity: 0.6 });
    });
    rect(inner, 11, -183, 98, 4, '#0D2F33', { opacity: 0.5 });
    drawCabinetContents(C, inner, out);

    // les portes vitrées : bois, petits bois, verre
    out.doors = [];
    [[11, 49], [60, 49]].forEach(([x, w], i) => {
      const door = G(A, { class: 'sa-porte' });
      const gx = x + 5, gy = -178, gw = w - 10, gh = 75;
      rect(door, gx, gy, gw, gh, LIN([[0, '#E8F4F2', 0.24], [0.45, '#E8F4F2', 0.05], [1, '#E8F4F2', 0.12]], { x1: 0, y1: 0, x2: 1, y2: 1 }));
      const wrap = G(door);
      const sc = U('sw');
      S('rect', { x: gx, y: gy, width: gw, height: gh }, S('clipPath', { id: sc }, defs));
      wrap.setAttribute('clip-path', `url(#${sc})`);
      path(wrap, `M${gx + 4} ${gy + gh}L${gx + 22} ${gy}H${gx + 28}L${gx + 10} ${gy + gh}Z`, '#fff', { opacity: 0.1 });
      const sweep = path(wrap, `M${gx - 32} ${gy + gh}L${gx - 12} ${gy}H${gx - 2}L${gx - 22} ${gy + gh}Z`, '#fff', { opacity: 0, class: 'sa-reflet' });
      path(door, `M${x} -183H${x + w}V-98H${x}Z M${gx} ${gy}V${gy + gh}H${gx + gw}V${gy}Z`, P.woodMid, { 'fill-rule': 'evenodd' });
      rect(door, x, -183, w, 1.2, P.woodEdge);
      rect(door, x + w - 1.2, -183, 1.2, 85, P.woodLight, { opacity: 0.8 });
      rect(door, x, -99.2, w, 1.2, P.woodDeep);
      path(door, `M${gx - 1} ${gy + gh + 1}V${gy - 1}H${gx + gw + 1}`, 'none', { stroke: P.woodDeep, 'stroke-width': 0.9 });
      path(door, `M${gx + gw + 0.9} ${gy - 0.6}V${gy + gh + 0.9}H${gx - 0.6}`, 'none', { stroke: '#7A5A4C', 'stroke-width': 0.8 });
      // petits bois, dans l'alignement des étagères
      rect(door, gx, -155.4, gw, 2.4, P.woodMid);
      rect(door, gx, -155.4, gw, 0.7, P.woodEdge);
      rect(door, gx, -130.4, gw, 2.4, P.woodMid);
      rect(door, gx, -130.4, gw, 0.7, P.woodEdge);
      const hx = i ? x + w - 0.4 : x - 0.8;
      rect(door, hx, -176, 1.2, 6, P.brass);
      rect(door, hx, -112, 1.2, 6, P.brass);
      const shade = rect(door, x, -183, w, 85, '#120A07', { opacity: 0, 'pointer-events': 'none' });
      door.style.transformBox = 'fill-box';
      door.style.transformOrigin = i ? '100% 50%' : '0% 50%';
      out.doors.push({ g: door, sweep, shade, x, w, i });
    });
    // la tranche des portes, visible quand elles s'entrouvrent (ouverture : 0.78)
    out.doors.forEach((d) => {
      const e = d.i ? d.x + d.w - d.w * 0.78 - 2.6 : d.x + d.w * 0.78;
      d.edge = G(A, { opacity: 0, 'pointer-events': 'none' });
      rect(d.edge, e, -183.6, 2.6, 86.2, P.woodEdge);
      rect(d.edge, d.i ? e : e + 1.8, -183.6, 0.8, 86.2, '#9A7866');
    });
    // la petite clé en laiton et son pompon vieux rose
    const key = G(out.doors[0].g, { class: 'sa-cle' });
    circ(key, 57.6, -141, 1.6, P.brassDark);
    path(key, 'M57.6 -141v4.6', 'none', { stroke: P.brass, 'stroke-width': 1 });
    path(key, 'M57.6 -136.2c-1.6 1 -1.9 5.4 0 7.4c1.9 -2 1.6 -6.4 0 -7.4z', P.pink);
    path(key, 'M57 -134v5M58.2 -134v5', 'none', { stroke: P.pinkDeep, 'stroke-width': 0.35 });
    key.style.transformBox = 'fill-box';
    key.style.transformOrigin = '50% 0%';
    out.key = key;
    rect(A, 4, -190, 7, 99, P.wood);
    rect(A, 109, -190, 7, 99, P.wood);
    rect(A, 114.6, -190, 1.4, 99, '#6A4C40');
    rect(A, 4, -190, 112, 7, P.wood);
    rect(A, 4, -98, 112, 7, P.woodMid);
    rect(A, 4, -98, 112, 1, P.woodDeep);

    // la corniche : frise sculptée, gorge, plateau
    rect(A, 2, -197, 116, 7, P.woodMid);
    rect(A, 2, -190.8, 116, 0.8, P.woodDeep);
    const petals = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 360;
      const ar = (a * Math.PI) / 180;
      petals.push(ellD(60 + Math.cos(ar) * 2.6, -193.5 + Math.sin(ar) * 1.7, 1.6, 0.9, a));
    }
    path(A, petals.join(''), P.woodEdge);
    circ(A, 60, -193.5, 1.3, P.woodWarm);
    path(A, 'M18 -193.5h30M72 -193.5h30', 'none', { stroke: P.woodEdge, 'stroke-width': 0.8, 'stroke-dasharray': '2.4 1.6' });
    path(A, 'M2 -197L-3 -206H123L118 -197Z', LIN([[0, '#1E120F'], [0.55, P.woodMid], [1, '#7A5A4C']]));
    rect(A, -5, -212, 130, 6, P.wood);
    rect(A, -5, -212, 130, 1.2, '#7A5A4C');
    rect(A, -5, -207, 130, 1, P.woodDeep);
    rect(A, -4, -214, 128, 2, P.woodDark);
    // la cire : un reflet chaud du côté de la lumière
    rect(A, -5, -214, 130, 214, LIN([[0, '#FFD9A6', 0], [0.6, '#FFD9A6', 0.03], [1, '#FFD9A6', 0.14]], { x1: 0, y1: 0, x2: 1, y2: 0 }), { 'pointer-events': 'none' });
    path(A, 'M112 -186v88M8 -186v88M115 -80v60', 'none', { stroke: '#FFE3BF', 'stroke-width': 0.8, opacity: 0.18 });

    // la colonie de livres sur le dessus
    out.books = drawBookColony(C, A);
    hit(A, 'M-6 -262H132V0H-6Z');
    return out;
  }

  /** L'intérieur de la vitrine : assiettes debout, tasses suspendues, râtelier, piles */
  function drawCabinetContents(C, g, out) {
    const { R, LIN } = C;
    const porcG = LIN([[0, '#FFFFFF'], [0.6, P.porc], [1, '#D9CFBF']], { x1: 0, y1: 0, x2: 1, y2: 1 });
    // assiettes debout (décor en couronne)
    const plate = (cx, cy, r, col) => {
      circ(g, cx + 0.8, cy + 0.8, r, '#0E2E32', { opacity: 0.35 });
      circ(g, cx, cy, r, porcG);
      circ(g, cx, cy, r * 0.8, 'none', { stroke: col, 'stroke-width': r * 0.2, 'stroke-dasharray': `${f(r * 0.16)} ${f(r * 0.1)}`, opacity: 0.9 });
      circ(g, cx, cy, r * 0.56, 'none', { stroke: col, 'stroke-width': 0.4, opacity: 0.8 });
      circ(g, cx, cy, r * 0.2, col, { opacity: 0.55 });
    };
    plate(25, -167, 10, P.blue);
    plate(45, -166.4, 9.4, '#A0613F');
    plate(79, -168, 11.6, P.blue);
    // un sucrier
    ell(g, 98, -155.6, 5.4, 1.2, '#0E2E32', { opacity: 0.4 });
    path(g, 'M92.6 -163c0 5 1.6 7.4 5.4 7.4s5.4 -2.4 5.4 -7.4z', porcG);
    path(g, 'M92.4 -163.2c1 -2.8 10.2 -2.8 11.2 0z', porcG);
    circ(g, 98, -166.4, 1.1, porcG);
    path(g, 'M93.6 -160.4c2.4 1 6.4 1 8.8 0', 'none', { stroke: P.rose, 'stroke-width': 0.9, opacity: 0.8 });
    rect(g, 92.6, -163.2, 10.8, 0.5, P.gold);

    // trois tasses suspendues par l'anse
    const cupHang = (hx, col, deco) => {
      path(g, `M${hx} -153v1.6a1 1 0 0 0 2 0`, 'none', { stroke: P.brass, 'stroke-width': 0.6 });
      const cg = G(g, { transform: `translate(${hx + 1} -149) rotate(-96)` });
      path(cg, 'M-3.2 -1.2c3.4 -0.6 4.2 3.4 0.8 4', 'none', { stroke: '#F2ECE2', 'stroke-width': 1 });
      path(cg, 'M-10.2 -4.6c0.3 3.6 1.6 6.2 3.8 6.9h3.4c2.2 -0.7 3.5 -3.3 3.8 -6.9z', col);
      path(cg, 'M-10.2 -4.6c0.3 3.6 1.6 6.2 3.8 6.9h3.4c2.2 -0.7 3.5 -3.3 3.8 -6.9z', LIN([[0, '#000', 0], [1, '#000', 0.2]]));
      rect(cg, -10.3, -5, 14, 0.7, P.gold);
      if (deco) path(cg, deco, 'none', { stroke: P.rose, 'stroke-width': 0.9, 'stroke-linecap': 'round' });
    };
    cupHang(20, '#F4EEE4', 'M-7.6 -2.4l1 1M-4.4 -2.8l0.8 1.2M-1.6 -2.2l1 1');
    cupHang(33, '#DDE6F2', 'M-7 -2l1 1M-3.4 -2.2l1 1');
    cupHang(46, '#F1DAD4', null);
    // une pile de soucoupes
    const sauc = [];
    for (let k = 0; k < 5; k++) sauc.push(ellD(36, -131.2 - k * 1.25, 14, 1.4));
    path(g, sauc.join(''), porcG, { stroke: '#B9AE9E', 'stroke-width': 0.3 });
    path(g, 'M22.4 -131.4h27.2M22.6 -133.9h26.8', 'none', { stroke: P.blue, 'stroke-width': 0.4, opacity: 0.7 });

    // le râtelier de cuillères (comme leur dessin de 2013) : elles tintent quand on ouvre
    const rk = G(g, { class: 'sa-ratelier' });
    path(rk, 'M65 -148.6V-152c3 0 3 -2.2 6 -2.2s3 2.2 6 2.2s3 -2.2 6 -2.2s3 2.2 6 2.2s3 -2.2 6 -2.2s3 2.2 6 2.2v3.4z', '#6A4632');
    rect(rk, 65, -149.8, 38, 1.2, '#8E6A50');
    const silverG = LIN([[0, '#FFFFFF'], [0.35, '#E3E6EA'], [0.7, P.silver], [1, P.silverDark]], { x1: 0, y1: 0, x2: 1, y2: 0 });
    const vermeilG = LIN([[0, '#FFF3C8'], [0.5, '#D9B66A'], [1, '#8A6A2E']], { x1: 0, y1: 0, x2: 1, y2: 0 });
    out.spoons = [];
    for (let k = 0; k < 9; k++) {
      const x = 68.2 + k * 4.2;
      const len = 11 + (k % 3) * 1.1 + R() * 0.8;
      const bw = 1.35 + (k % 2) * 0.25;
      const d = `M${f(x - 0.9)} -153.6c0 -1.6 0.9 -2.4 0.9 -2.4s0.9 0.8 0.9 2.4c0 0.9 -0.5 1.3 -0.9 1.3s-0.9 -0.4 -0.9 -1.3z` +
        `M${f(x - 0.42)} -152.4H${f(x + 0.42)}L${f(x + 0.3)} ${f(-149 + len - 2.2)}H${f(x - 0.3)}Z` + ellD(x, -149 + len + 0.3, bw, 2.5);
      const sp = path(rk, d, k === 3 || k === 7 ? vermeilG : silverG, { class: 'sa-cuillere' });
      sp.style.transformBox = 'fill-box';
      sp.style.transformOrigin = '50% 12%';
      out.spoons.push(sp);
    }
    path(rk, 'M65 -148.6h38v1.1h-38z', '#3A2418', { opacity: 0.6 });

    // en bas : une pile d'assiettes, un pot à lait, des bols, trois tasses empilées (comme leur dessin)
    const pile = [];
    for (let k = 0; k < 7; k++) pile.push(ellD(33, -99.6 - k * 1.3, 16.5, 1.6));
    path(g, pile.join(''), porcG, { stroke: '#A89C8A', 'stroke-width': 0.3 });
    path(g, [0, 1, 2, 3, 4, 5, 6].map((k) => `M17.4 ${f(-99.4 - k * 1.3)}h31.2`).join(''), 'none', { stroke: P.blue, 'stroke-width': 0.35, opacity: 0.8 });
    path(g, 'M49.5 -99c-0.4 -3 -0.2 -6.4 1.4 -8.8c-0.4 -1 -0.4 -1.8 0.2 -2.4h6.2c0.6 0.6 0.6 1.4 0.2 2.4c1.6 2.4 1.8 5.8 1.4 8.8z', porcG);
    path(g, 'M50.6 -110.2l-2.4 -1.2l2.6 -0.4M58.4 -107.6c2.6 0 2.8 4.6 0.2 5', 'none', { stroke: '#EDE6DA', 'stroke-width': 0.7 });
    path(g, 'M50.6 -104c2 0.8 5 0.8 7 0', 'none', { stroke: P.leafG, 'stroke-width': 0.8 });
    [[80, -99, 11.5, 6.4, '#F3EEE6'], [80, -104.6, 9.4, 5.4, '#DDE7F0'], [80, -109.4, 7.4, 4.6, '#F2DDD6']].forEach(([cx, by, rw, h, c]) => {
      path(g, `M${cx - rw} ${by - h}c0.6 ${f(h * 0.8)} ${f(rw * 0.5)} ${h} ${rw} ${h}s${f(rw * 0.94)} ${f(-h * 0.2)} ${rw} ${-h}z`, c);
      ell(g, cx, by - h, rw, 1.2, '#FFFFFF');
      ell(g, cx, by - h + 0.2, rw - 1, 0.8, '#E6DDD0');
    });
    for (let k = 0; k < 3; k++) {
      const by = -99 - k * 7.2;
      ell(g, 99, by - 0.8, 7.4, 1.3, porcG, { stroke: '#B8AE9E', 'stroke-width': 0.3 });
      path(g, `M94.2 ${f(by - 6.8)}c0.3 3 1.5 5.2 3.3 5.6h3c1.8 -0.4 3 -2.6 3.3 -5.6z`, k === 1 ? '#DDE6F2' : '#F6F0E6');
      path(g, `M103.6 ${f(by - 5.8)}c2 -0.4 2.4 2.6 0.2 2.8`, 'none', { stroke: '#EFE8DD', 'stroke-width': 0.7 });
      rect(g, 94.2, by - 7, 9.6, 0.5, P.gold);
      path(g, `M96 ${f(by - 4.6)}l0.8 0.8M98.4 ${f(by - 4.2)}l0.6 0.9M100.8 ${f(by - 4.6)}l0.7 0.7`, 'none', { stroke: k === 1 ? P.blue : P.rose, 'stroke-width': 0.7, 'stroke-linecap': 'round' });
    }
    // l'ombre de la corniche dans la vitrine
    rect(g, 11, -183, 98, 85, LIN([[0, '#061618', 0.5], [0.25, '#061618', 0.08], [1, '#061618', 0.2]]), { 'pointer-events': 'none' });
  }

  /** La colonie de livres : piles couchées, rangée debout, livres penchés, un pothos qui retombe */
  function drawBookColony(C, A) {
    const { R } = C;
    const g = G(A, { class: 'sa-livres' });
    const bands = [], shades = [], items = [];
    const book = (par, x, y, w, h, c, lying) => {
      items.push(rect(par, x, y, w, h, c, { rx: 0.5 }));
      if (lying) {
        bands.push(`M${f(x + 2.2)} ${f(y + 0.5)}v${f(h - 1)}M${f(x + w - 2.2)} ${f(y + 0.5)}v${f(h - 1)}`);
        shades.push(`M${f(x)} ${f(y + h - 0.9)}h${f(w)}v0.9h${f(-w)}z`);
        if (w > 26 && h > 4) bands.push(`M${f(x + w * 0.4)} ${f(y + h / 2)}h${f(w * 0.2)}`);
      } else {
        bands.push(`M${f(x + 0.4)} ${f(y + 2.4)}h${f(w - 0.8)}M${f(x + 0.4)} ${f(y + h - 2.6)}h${f(w - 0.8)}`);
        if (w > 3.4) bands.push(`M${f(x + w / 2)} ${f(y + h * 0.34)}v${f(h * 0.2)}`);
        shades.push(`M${f(x + w - 0.9)} ${f(y)}h0.9v${f(h)}h-0.9z`);
      }
    };
    // pile de gauche : de gros volumes couchés, et une petite pile par-dessus
    let y = -214;
    [[36, 5.4, 0], [30, 3.6, 4], [34, 6.2, 1], [28, 3.4, 3], [31, 4.8, 13], [24, 3.2, 7], [26, 4.2, 2], [20, 3, 14]].forEach(([w, t, c]) => {
      y -= t;
      book(g, -3 + (36 - w) / 2 + (R() - 0.5) * 3, y, w, t, BOOKS[c], true);
    });
    // la rangée debout
    let x = 36;
    [[4.4, 29, 5], [3, 24, 4], [5.6, 33, 10], [3.6, 26, 12], [6.2, 35, 1], [3.2, 23, 7], [4.6, 30, 2], [5.2, 32, 9], [3.4, 25, 14], [4.4, 28, 11]].forEach(([w, h, c]) => {
      book(g, x, -214 - h, w, h, BOOKS[c], false);
      x += w + 0.2;
    });
    // deux livres penchés contre la rangée
    const lean = G(g, { transform: `rotate(-18 ${f(x + 0.6)} -214)` });
    book(lean, x + 0.6, -214 - 30, 5, 30, '#8A3B4A', false);
    book(lean, x + 5.8, -214 - 25, 3.6, 25, '#44617A', false);
    // pile de droite, couchée, avec un pot de pothos qui retombe sur le flanc
    y = -214;
    [[40, 5.6, 13], [34, 4, 7], [37, 3.6, 4], [30, 4.4, 11], [27, 3.2, 8]].forEach(([w, t, c]) => {
      y -= t;
      book(g, 85 + (40 - w) / 2 + (R() - 0.5) * 2, y, w, t, BOOKS[c], true);
    });
    path(g, bands.join(''), 'none', { stroke: '#E8C77A', 'stroke-width': 0.55, opacity: 0.75 });
    path(g, shades.join(''), '#000', { opacity: 0.22 });
    pot(g, 110, y, 14, 11);
    pothos(g, R, 110, y - 13, [[4, 0.9, 118], [6, 1.4, 84], [1, 0.5, 60], [-5, -0.4, 22]], 6);
    return { g, items };
  }

  /* ======================================================================
     Le guéridon menthe, la nappe de lin fleurie, la vaisselle d'antan
     ====================================================================== */
  const TABLE = { x: 270, k: 1.58 };
  function drawTable(C, p) {
    const { LIN, RAD } = C;
    const out = {};
    const v = view(TABLE.x, footY(TABLE.k), TABLE.k, 0, 0.3);
    const vF = view(TABLE.x, footY(TABLE.k), TABLE.k, 0.35, 0.44);
    const s = v.s;
    const Yh = (h) => v.Y - h * v.cp * s;
    const g = G(p, { class: 'sa-gueridon' });
    out.g = g;
    // ombre au sol
    ell(g, v.X + 3, v.Y + 3, 58, 15, RAD([[0, '#1A0B05', 0.5], [0.6, '#1A0B05', 0.2], [1, '#1A0B05', 0]]));
    ell(g, v.X + 1, v.Y + 1, 16, 5, '#1A0B05', { opacity: 0.35 });
    // les pieds (tripode cambré)
    // profil cambré (genou, puis la cheville qui s'effile, un petit enroulement au bout)
    const legU = [[5.5, 14.2], [9, 13.4], [13.5, 10.6], [18.5, 6.6], [23.5, 3.6], [27.5, 2.4], [30.4, 2.6]];
    const legL = [[5.5, 7.6], [9, 6.8], [13.5, 4.9], [18.5, 2.6], [23.5, 0.9], [27.5, 0.2], [30.4, 0]];
    const wAt = (d) => 2.1 - (0.9 * (d - 5.5)) / 25;
    const smooth = (a, b) => AC.openPath(a) + AC.openPath(b).replace(/^M/, 'L') + 'Z';
    const legs = (angles) => {
      const sideD = [], topD = [], hiD = [], toes = [];
      angles.forEach((a) => {
        const c = Math.cos(a), sn = Math.sin(a), px = -sn, pz = c;
        const at = (d, h, o) => vF(d * c + px * o, h, d * sn + pz * o);
        const sg = vF.depth(px, pz) > 0 ? 1 : -1;
        const U1 = legU.map(([d, h]) => at(d, h, sg * wAt(d))), U2 = legU.map(([d, h]) => at(d, h, -sg * wAt(d)));
        sideD.push(smooth(U1, legL.slice().reverse().map(([d, h]) => at(d, h, sg * wAt(d)))));
        topD.push(smooth(U1, U2.slice().reverse()));
        hiD.push(AC.openPath(U2.slice(0, -1)));
        const t = at(30.6, 1.4, 0);
        toes.push(ellD(t[0], t[1], 1.5 * s * 0.62, 1.4 * s * 0.62));
      });
      path(g, sideD.join(''), LIN([[0, P.mintDark], [1, P.mintDeep]]));
      path(g, topD.join(''), P.mint);
      path(g, hiD.join(''), 'none', { stroke: P.mintLight, 'stroke-width': 0.9, 'stroke-linecap': 'round' });
      path(g, toes.join(''), P.mintDeep);
    };
    legs([-Math.PI / 2]);
    // le fût tourné
    const col = [[70, 6.8], [67.6, 6.8], [66.6, 5], [63.4, 4.5], [62, 5.8], [60.4, 4.5], [50, 3.9], [38, 4.1], [30, 4.8], [24, 6.4], [19, 7.6], [15.6, 7.4], [14, 5.8], [12.6, 7], [10, 7], [8.4, 5.8]];
    const right = col.map(([h, r]) => [v.X + r * s, Yh(h)]);
    const left = col.slice().reverse().map(([h, r]) => [v.X - r * s, Yh(h)]);
    path(g, AC.closedPath(right.concat(left), 0.35), LIN([[0, P.mintDeep], [0.35, P.mintDark], [0.7, P.mintLight], [1, P.mintDark]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    path(g, [[62, 5.8], [19, 7.6], [12.6, 7]].map(([h, r]) => frontArc(v.X, Yh(h), r * s, r * s * v.sp)).join(''), 'none', { stroke: '#E6F7F6', 'stroke-width': 0.8, opacity: 0.8 });
    legs([Math.PI / 6, (5 * Math.PI) / 6]);

    // le plateau, épais : du bois massif sous les tasses fines
    const top = { cx: v.X, cy: Yh(74), rx: 36 * s, ry: 36 * s * v.sp };
    const th = 4.4 * s * v.cp;
    path(g, `${frontArc(top.cx, top.cy, top.rx, top.ry)}L${f(top.cx + top.rx)} ${f(top.cy + th)}A${f(top.rx)} ${f(top.ry)} 0 0 1 ${f(top.cx - top.rx)} ${f(top.cy + th)}Z`, LIN([[0, P.mintDeep], [0.3, P.mintDark], [0.72, '#ACDCDB'], [1, P.mintDark]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    path(g, frontArc(top.cx, top.cy + th - 0.4, top.rx, top.ry), 'none', { stroke: '#3E6E71', 'stroke-width': 0.9, opacity: 0.6 });
    ell(g, top.cx, top.cy, top.rx, top.ry, RAD([[0, '#D6F1EF'], [0.55, P.mint], [1, '#86BFC0']], { cx: 0.5, cy: 0.3, r: 0.75 }));
    path(g, frontArc(top.cx, top.cy, top.rx, top.ry), 'none', { stroke: P.mintLight, 'stroke-width': 1 });
    path(g, [-18, 0, 18].map((x) => { const z = Math.sqrt(36 * 36 - x * x); return `M${pt(v(x, 74, -z))}L${pt(v(x, 74, z))}`; }).join(''), 'none', { stroke: '#6FA3A5', 'stroke-width': 0.55, opacity: 0.5 });
    out.top = top;

    // la nappe de lin (chemin de table) qui retombe devant
    const cloth = G(g, { class: 'sa-nappe' });
    const W = 16;
    const edgeZ = (x) => Math.sqrt(36 * 36 - x * x);
    const xs = []; for (let k = 0; k <= 8; k++) xs.push(-W + (2 * W * k) / 8);
    const topPts = xs.map((x) => v(x, 74.2, -edgeZ(x))).concat(xs.slice().reverse().map((x) => v(x, 74.2, edgeZ(x) + 0.6)));
    path(cloth, poly(topPts), LIN([[0, '#F1E8D8'], [1, '#E2D5BF']]));
    const hang = xs.map((x) => v(x, 74.2, edgeZ(x) + 0.6)).concat(xs.slice().reverse().map((x) => v(x * 1.02, 47, edgeZ(x) + 1.6)));
    path(cloth, poly(hang), LIN([[0, '#EDE3D1'], [1, '#D6C6AC']]));
    const fr = [];
    xs.forEach((x, i) => { if (!i) return; for (let k = 0; k < 3; k++) { const xx = x - ((2 * W) / 8) * (k / 3); fr.push(`M${pt(v(xx * 1.02, 47, edgeZ(xx) + 1.6))}v2.8`); } });
    path(cloth, fr.join(''), 'none', { stroke: '#CDBC9E', 'stroke-width': 0.6 });
    // fleurs peintes sur le lin (brun-rose et bleu, comme leur nappe)
    const flower = (cx, cy, r, ky, col, colC) => {
      const fg = G(cloth, { transform: `translate(${f(cx)} ${f(cy)}) scale(1 ${f(ky)})` });
      const petals = [];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * 360 + 18, ar = (a * Math.PI) / 180;
        petals.push(ellD(Math.cos(ar) * r * 0.55, Math.sin(ar) * r * 0.55, r * 0.55, r * 0.34, a));
      }
      path(fg, lanceLeaf(r * 0.3, r * 0.2, r * 1.4, r * 0.32, 30) + lanceLeaf(-r * 0.3, r * 0.2, r * 1.3, r * 0.3, 150), '#9DB08E', { opacity: 0.75 });
      path(fg, petals.join(''), col, { opacity: 0.72 });
      circ(fg, 0, 0, r * 0.2, colC, { opacity: 0.85 });
    };
    const f1 = v(-6, 74.2, -18), f2 = v(7, 74.2, 14), f3 = v(1, 61, edgeZ(1) + 1.2), f4 = v(-10, 53, edgeZ(-10) + 1.4);
    flower(f1[0], f1[1], 6.2, v.sp * 1.1, '#C99083', '#8C5A4E');
    flower(f2[0], f2[1], 5.2, v.sp * 1.1, '#8FA6C4', '#4E6A8E');
    flower(f3[0], f3[1], 7.4, 0.92, '#C99083', '#8C5A4E');
    flower(f4[0], f4[1], 4.4, 0.9, '#8FA6C4', '#4E6A8E');
    // la flaque de lumière de la suspension
    ell(g, top.cx - 2, top.cy - 1, top.rx * 0.8, top.ry * 0.85, RAD([[0, '#FFF3D2', 0.55], [1, '#FFF3D2', 0]]), { 'pointer-events': 'none' });

    // la vaisselle (dessinée en cm, posée par la vue du plateau)
    const at = (x, z) => { const q = v(x, 74.2, z); return `translate(${f(q[0])} ${f(q[1])}) scale(${f(s)})`; };
    const shadow = (x, z, rx, ry) => { const q = v(x, 74.2, z); ell(g, q[0] + 1.5, q[1] + 1, rx * s, ry * s, '#2A1A10', { opacity: 0.18 }); };
    // l'assiette à décor bleu et la part de fondant
    shadow(-19, 13, 11.5, 3.6);
    out.plate = G(g, { class: 'sa-assiette' });
    const plate = G(out.plate, { transform: at(-19, 13) });
    drawBluePlate(C, plate);
    out.cake = G(plate);
    drawCake(C, out.cake);
    // le napperon de dentelle, puis la théière à fleurs
    drawDoily(C, G(g, { transform: at(1, -17) }));
    shadow(1, -17, 9.5, 3);
    out.teapot = G(g, { class: 'sa-theiere' });
    drawTeapot(C, G(out.teapot, { transform: at(1, -17) }));
    // la tasse et sa soucoupe à fleurs, un chocolat chaud
    shadow(17, 10, 7.5, 2.4);
    out.cup = G(g, { class: 'sa-tasse' });
    drawCup(C, G(out.cup, { transform: at(17, 10) }));
    const cq = v(17, 74.2, 10);
    out.cupRim = [cq[0], cq[1] - 6.2 * s];
    // la petite cuillère ancienne, posée sur la soucoupe
    out.spoon = G(g, { class: 'sa-petite-cuillere' });
    drawSpoon(C, G(out.spoon, { transform: at(17, 10) }));
    // zones de toucher
    hit(out.cup, `M${f(cq[0] - 16)} ${f(cq[1] - 24)}h34v30h-34z`);
    const tq = v(1, 74.2, -17);
    hit(out.teapot, `M${f(tq[0] - 24)} ${f(tq[1] - 30)}h50v30h-50z`);
    [out.plate, out.cup, out.spoon].forEach((e) => { e.style.transformBox = 'fill-box'; e.style.transformOrigin = '50% 100%'; });
    // la théière bascule sur le bord de son pied, côté bec
    out.teapot.style.transformOrigin = `${f(tq[0] + 6.5 * s)}px ${f(tq[1])}px`;
    return out;
  }

  /** Napperon rond au crochet : bord festonné, rangs ajourés — en cm, ellipse aplatie */
  function drawDoily(C, g) {
    const k = 0.3, pts = [];
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2, r = 12.4 + 0.8 * Math.abs(Math.sin(a * 12));
      pts.push([Math.cos(a) * r, Math.sin(a) * r * k]);
    }
    path(g, AC.closedPath(pts, 0.9), '#FFFDF7', { opacity: 0.96 });
    ell(g, 0, 0, 11.4, 11.4 * k, 'none', { stroke: '#D5CAB8', 'stroke-width': 0.7, 'stroke-dasharray': '0.2 1', 'stroke-linecap': 'round' });
    ell(g, 0, 0, 9.4, 9.4 * k, 'none', { stroke: '#DCD2C2', 'stroke-width': 0.9, 'stroke-dasharray': '1.2 0.7' });
    ell(g, 0, 0, 7.4, 7.4 * k, 'none', { stroke: '#D5CAB8', 'stroke-width': 0.6, 'stroke-dasharray': '0.2 0.9', 'stroke-linecap': 'round' });
  }
  /** Assiette en faïence, décor bleu (terre de fer), bord chantourné — en cm, ellipse aplatie */
  function drawBluePlate(C, g) {
    const { LIN } = C;
    const k = 0.3;
    const pts = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2, r = 11 + 0.28 * Math.cos(a * 16);
      pts.push([Math.cos(a) * r, Math.sin(a) * r * k]);
    }
    path(g, AC.closedPath(pts, 1), LIN([[0, '#FFFFFF'], [1, '#DAD1C2']]));
    ell(g, 0, 0.1, 9.6, 9.6 * k, 'none', { stroke: P.blue, 'stroke-width': 1.7, 'stroke-dasharray': '0.9 0.45', opacity: 0.92 });
    ell(g, 0, 0.1, 8.2, 8.2 * k, 'none', { stroke: P.blue, 'stroke-width': 0.3, opacity: 0.8 });
    ell(g, 0, 0.3, 7.6, 7.6 * k, '#EFE9DF');
    ell(g, 0, 0.1, 10.9, 10.9 * k, 'none', { stroke: '#fff', 'stroke-width': 0.3, opacity: 0.8 });
  }
  /** Une part de fondant au chocolat, noisettes, crème fouettée, une framboise */
  function drawCake(C, g) {
    const { LIN } = C;
    const Tb = [-5.6, 0.9], Tt = [-5.6, -3.2], FRb = [3.8, 1.5], FRt = [3.8, -2.6], BRb = [5.6, -0.8], BRt = [5.6, -4.8];
    path(g, poly([Tb, FRb, BRb, BRt, Tt]), '#1E0E07', { opacity: 0.2, transform: 'translate(0.6 0.4)' });
    path(g, poly([FRb, BRb, BRt, FRt]), P.chocTop);
    path(g, poly([Tb, FRb, FRt, Tt]), LIN([[0, P.chocCrumb], [1, '#55301B']]));
    path(g, 'M-4.4 -1.6l0.3 0.2M-2.4 -0.6l0.3 0.1M-0.6 -1.9l0.3 0.2M1.4 -0.2l0.2 0.2M2.4 -1.6l0.3 0.1M-3.2 0.4l0.2 0.1', 'none', { stroke: '#3A1A0C', 'stroke-width': 0.5, 'stroke-linecap': 'round' });
    path(g, poly([Tt, FRt, BRt]), LIN([[0, '#4A2616'], [1, P.chocTop]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    path(g, 'M-3.6 -3.4L3.2 -3.1', 'none', { stroke: '#8A5A3E', 'stroke-width': 0.35, opacity: 0.7 });
    path(g, ellD(-1.2, -3.35, 0.8, 0.45, -8) + ellD(1.4, -3.6, 0.75, 0.42, 10) + ellD(3.6, -4.2, 0.7, 0.4, 0), '#E9D3A6');
    path(g, 'M6.2 0.6c-0.6 -1.4 0.6 -2.6 1.8 -2.2c0.6 -1.2 2.4 -1 2.6 0.4c1.2 0.2 1.4 1.6 0.4 2.2z', '#FFFDF7');
    path(g, 'M7 -0.6c0.8 -0.4 1.6 -0.2 2.2 0.4', 'none', { stroke: '#E6DCCB', 'stroke-width': 0.35 });
    circ(g, 9.4, -2.3, 1.15, '#C23A4C');
    path(g, 'M8.9 -2.6h0.1M9.7 -2h0.1M9.3 -1.6h0.1M9.8 -2.8h0.1', 'none', { stroke: '#E97A86', 'stroke-width': 0.4, 'stroke-linecap': 'round' });
    path(g, 'M9.4 -3.4l-0.3 -0.8l0.9 0.3', 'none', { stroke: '#5F8A4A', 'stroke-width': 0.4 });
  }
  /** Théière en porcelaine à roses, filets d'or — en cm, base en (0, 0) */
  function drawTeapot(C, g) {
    const { RAD } = C;
    const body = 'M-6 0C-9.6 -0.4 -10.8 -4.4 -10.2 -7.6C-9.6 -10.8 -5.6 -12.6 0 -12.6C5.6 -12.6 9.6 -10.8 10.2 -7.6C10.8 -4.4 9.6 -0.4 6 0Z';
    const porcR = RAD([[0, '#FFFFFF'], [0.45, '#FAF5EC'], [1, '#CFC4B2']], { cx: 0.62, cy: 0.28, r: 0.78 });
    path(g, 'M-9.3 -9.6C-14.8 -10.6 -15.6 -3.6 -9.8 -3', 'none', { stroke: '#D6CCBC', 'stroke-width': 1.7, 'stroke-linecap': 'round' });
    path(g, 'M-9.3 -9.6C-14.8 -10.6 -15.6 -3.6 -9.8 -3', 'none', { stroke: '#FBF7F0', 'stroke-width': 0.8, 'stroke-linecap': 'round', transform: 'translate(0.2 -0.3)' });
    path(g, 'M8.8 -3.8C11.8 -4.4 12.8 -8 14.8 -11.6L16.2 -12.9C16.7 -12.1 16.4 -11.1 15.9 -10.4C14.1 -7.6 13.4 -3.4 9.6 -1.2Z', porcR);
    path(g, 'M16.2 -12.9C16.7 -12.1 16.4 -11.1 15.9 -10.4', 'none', { stroke: P.gold, 'stroke-width': 0.4 });
    ell(g, 0, -0.2, 6.2, 1.5, '#D8CEBD');
    path(g, body, porcR);
    path(g, frontArc(0, -0.9, 6.1, 1.1), 'none', { stroke: P.gold, 'stroke-width': 0.45 });
    const roses = [[-4.6, -6.2, 1.5], [3.4, -7.4, 1.8], [7.6, -4.6, 1.2], [-1, -3.6, 1.1]];
    path(g, roses.map(([x, y, r]) => lanceLeaf(x + r * 0.6, y + r * 0.3, r * 1.9, r * 0.5, 20) + lanceLeaf(x - r * 0.6, y + r * 0.2, r * 1.7, r * 0.45, 160)).join(''), P.leafG);
    path(g, roses.map(([x, y, r]) => ellD(x, y, r, r * 0.86)).join(''), '#E8A4A0');
    path(g, roses.map(([x, y, r]) => `M${f(x - r * 0.5)} ${f(y)}a${f(r * 0.5)} ${f(r * 0.4)} 0 1 1 ${f(r * 0.6)} ${f(r * 0.3)}`).join(''), 'none', { stroke: P.roseDeep, 'stroke-width': 0.35 });
    ell(g, 0, -12.4, 5.2, 1.4, '#E9E1D4');
    path(g, 'M-4.8 -12.5C-4.8 -15.4 4.8 -15.4 4.8 -12.5Z', porcR);
    ell(g, 0, -12.5, 4.8, 1.2, 'none', { stroke: P.gold, 'stroke-width': 0.45 });
    ell(g, 0, -15.6, 1.4, 1.15, porcR);
    circ(g, 0.4, -15.9, 0.35, P.gold);
    path(g, 'M3.6 -11.2c2.6 0.4 4.4 1.8 5 3.6', 'none', { stroke: '#fff', 'stroke-width': 0.9, 'stroke-linecap': 'round', opacity: 0.85 });
  }
  /** Tasse et soucoupe à fleurs, chocolat chaud — en cm, centre de la soucoupe en (0, 0) */
  function drawCup(C, g) {
    const { LIN, RAD } = C;
    const porcR = RAD([[0, '#FFFFFF'], [0.45, '#FAF5EC'], [1, '#CFC4B2']], { cx: 0.62, cy: 0.28, r: 0.78 });
    ell(g, 0, 0, 7.4, 2.3, LIN([[0, '#FFFFFF'], [1, '#DAD1C2']]));
    ell(g, 0, 0, 6.2, 1.9, 'none', { stroke: '#D98B8B', 'stroke-width': 0.7, 'stroke-dasharray': '0.6 0.5', opacity: 0.85 });
    ell(g, 0, 0, 7.3, 2.25, 'none', { stroke: P.gold, 'stroke-width': 0.3 });
    ell(g, 0, 0.15, 3.8, 1.1, '#E6DDCF');
    path(g, 'M4.2 -5.2C7 -5.8 7.6 -2.6 3.8 -2', 'none', { stroke: '#D6CCBC', 'stroke-width': 1.1, 'stroke-linecap': 'round' });
    path(g, 'M4.2 -5.2C7 -5.8 7.6 -2.6 3.8 -2', 'none', { stroke: '#FBF7F0', 'stroke-width': 0.5, 'stroke-linecap': 'round', transform: 'translate(0.15 -0.2)' });
    path(g, 'M-4.8 -6C-4.6 -3 -3.5 -1.2 -1.9 -0.6L1.9 -0.6C3.5 -1.2 4.6 -3 4.8 -6Z', porcR);
    ell(g, 0, -0.5, 2.1, 0.5, '#E9E1D4');
    const roses = [[-2.6, -3.4, 0.8], [0.4, -2.6, 0.95], [3, -3.6, 0.7]];
    path(g, roses.map(([x, y, r]) => lanceLeaf(x + r * 0.5, y + r * 0.3, r * 1.8, r * 0.5, 25)).join(''), P.leafG);
    path(g, roses.map(([x, y, r]) => ellD(x, y, r, r * 0.85)).join(''), '#E8A4A0');
    ell(g, 0, -6, 4.8, 1.45, '#F6F0E6');
    ell(g, 0, -6, 4.8, 1.45, 'none', { stroke: P.gold, 'stroke-width': 0.4 });
    ell(g, 0, -5.85, 4.2, 1.12, RAD([[0, '#7A4428'], [0.7, '#4A220F'], [1, '#3A1A0A']], { cx: 0.4, cy: 0.35, r: 0.7 }));
    path(g, 'M-2.4 -6.1c1 -0.5 2.6 -0.5 3.4 0.1', 'none', { stroke: '#B07A55', 'stroke-width': 0.35, opacity: 0.8 });
  }
  /** La petite cuillère ancienne en argent, manche ouvragé — en cm (soucoupe en 0, 0) */
  function drawSpoon(C, g) {
    const { LIN } = C;
    const sg = LIN([[0, '#FFFFFF'], [0.35, '#E3E6EA'], [0.7, P.silver], [1, P.silverDark]], { x1: 0, y1: 0, x2: 1, y2: 0 });
    path(g, `${ellD(3.2, 1.05, 1.25, 0.55, -8)}M4.3 0.9L9.4 0.2L9.5 0.55L4.4 1.2Z M9.2 0.35c0.4 -0.7 1.6 -0.9 2.2 -0.3c0.4 0.5 0 1.2 -0.8 1.2c-0.6 0 -1.2 -0.3 -1.4 -0.9z`, sg);
    path(g, 'M2.6 0.85c0.4 -0.2 1 -0.2 1.3 0', 'none', { stroke: '#fff', 'stroke-width': 0.3 });
    circ(g, 10.4, 0.45, 0.25, P.silverDark);
  }

  /* ======================================================================
     Les chaises
     ====================================================================== */
  /** La chaise bistrot en bois courbé (Thonet n° 14), assise cannée, cirée brun chaud */
  const THONET = { x: 178, k: 1.66 };
  function drawThonet(C, p) {
    const { defs, U, LIN, RAD } = C;
    const v = view(THONET.x, footY(THONET.k), THONET.k, 0.9, 0.36);
    const s = v.s;
    const g = G(p, { class: 'sa-thonet' });
    const pr = (q) => v(q[0], q[1], q[2]);
    const mir = (q) => [-q[0], q[1], q[2]];
    const sh = v(0, 0, -2);
    ell(g, sh[0], sh[1] + 1, 40, 10, RAD([[0, '#1A0B05', 0.5], [0.6, '#1A0B05', 0.2], [1, '#1A0B05', 0]]));
    // le dos : un seul bois courbé, du pied gauche au pied droit en passant par la grande boucle
    const hoopR = [[14.5, 46, -14.5], [15.4, 56, -16.6], [16.1, 66, -18.4], [16.2, 75, -19.9], [15, 82.6, -21], [11.6, 87.2, -21.7], [6.1, 89.5, -22], [0, 90, -22.1]];
    const legR = [[16.5, 0, -24], [15.8, 16, -20.6], [15, 32, -17.1], [14.5, 46, -14.5]];
    const backPts = legR.map(mir).concat(hoopR.slice(1).map(mir), hoopR.slice(0, -1).reverse(), legR.slice(0, -1).reverse()).map(pr);
    const innerR = [[9, 46, -18.4], [9.9, 53, -19.3], [9.6, 60, -20], [7, 65, -20.5], [0, 66.8, -20.7]];
    const innerPts = innerR.map(mir).concat(innerR.slice(0, -1).reverse()).map(pr);
    const ringPts = [];
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; ringPts.push(v(21 * Math.cos(a), 15, -2.6 + 21.5 * Math.sin(a))); }
    // bois ciré : une base, un reflet chaud, un éclat
    const wood = (d, w) => {
      path(g, d, 'none', { stroke: P.bent, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      path(g, d, 'none', { stroke: P.bentHi, 'stroke-width': w * 0.34, 'stroke-linecap': 'round', transform: `translate(${f(w * 0.2)} ${f(-w * 0.2)})` });
      path(g, d, 'none', { stroke: P.bentSpec, 'stroke-width': w * 0.13, 'stroke-linecap': 'round', opacity: 0.6, transform: `translate(${f(w * 0.28)} ${f(-w * 0.3)})` });
    };
    wood(AC.openPath(backPts), 2.9 * s);
    wood(AC.openPath(innerPts), 2.3 * s);
    wood(AC.closedPath(ringPts, 1), 2 * s);
    // les pieds avant, fuselés
    const legs = [-1, 1].map((sx) => tubeD(pr([sx * 11.5, 43, 13]), pr([sx * 15.5, 0, 17.5]), [[0, 3.6 * s], [0.5, 3.2 * s], [1, 2.5 * s]], -1));
    path(g, legs.map((l) => l.body).join(''), P.bent);
    path(g, legs.map((l) => l.hi).join(''), 'none', { stroke: P.bentHi, 'stroke-width': 1.1 });
    // l'assise : ceinture cintrée, cannage
    const seatPts = [], lowPts = [];
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; seatPts.push(v(20.5 * Math.cos(a), 46, 20.5 * Math.sin(a))); lowPts.push(v(20.5 * Math.cos(a), 41.5, 20.5 * Math.sin(a))); }
    path(g, AC.closedPath(lowPts, 1), LIN([[0, '#2E170C'], [0.6, P.bent], [1, '#8A5634']], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    const cp = U('cn');
    const c0 = v(0, 46, 0);
    const pat = S('pattern', { id: cp, width: 4.6, height: 4.6, patternUnits: 'userSpaceOnUse', patternTransform: `translate(${f(c0[0])} ${f(c0[1])}) scale(1 ${f(v.sp * 1.15)}) rotate(${f((v.th * 180) / Math.PI)})` }, defs);
    rect(pat, 0, 0, 4.6, 4.6, '#4A2C16');
    path(pat, 'M0 1.15H4.6M0 3.45H4.6', 'none', { stroke: P.caneLight, 'stroke-width': 0.9 });
    path(pat, 'M1.15 0V4.6M3.45 0V4.6', 'none', { stroke: P.cane, 'stroke-width': 0.9 });
    path(pat, 'M0 0L4.6 4.6M4.6 0L0 4.6', 'none', { stroke: P.caneDark, 'stroke-width': 0.55 });
    const seatD = AC.closedPath(seatPts, 1);
    path(g, seatD, `url(#${cp})`);
    path(g, seatD, RAD([[0, '#FFE2B0', 0.2], [0.7, '#000', 0.05], [1, '#000', 0.42]], { cx: 0.62, cy: 0.35, r: 0.7 }));
    wood(seatD, 2.2 * s);
    hit(g, poly([pr([-24, 92, -22]), pr([24, 92, -22]), pr([24, 0, 22]), pr([-24, 0, 22])]));
    const foot = pr([15.5, 0, 17.5]);
    g.style.transformOrigin = `${f(foot[0])}px ${f(foot[1])}px`;
    return { g, v };
  }

  /** La chaise paillée peinte en vieux rose, son coussin moutarde */
  const PINK = { x: 364, k: 1.48 };
  function drawPinkChair(C, p) {
    const { LIN, RAD } = C;
    const v = view(PINK.x, footY(PINK.k), PINK.k, -0.95, 0.33);
    const s = v.s;
    const g = G(p, { class: 'sa-chaise-rose' });
    const pr = (x, y, z) => v(x, y, z);
    const sh = v(0, 0, 0);
    ell(g, sh[0], sh[1] + 1, 42, 10, RAD([[0, '#1A0B05', 0.5], [0.6, '#1A0B05', 0.2], [1, '#1A0B05', 0]]));
    const turned = (w) => [[0, w * 0.86], [0.06, w * 1.08], [0.1, w * 0.84], [0.42, w * 0.78], [0.47, w * 1.02], [0.52, w * 0.8], [0.9, w * 0.86], [0.94, w * 1.06], [1, w]];
    const straight = (w) => [[0, w], [1, w]];
    const bodies = { far: [], near: [] }, his = { far: [], near: [] };
    const member = (key, A, B, prof) => { const t = tubeD(A, B, prof, 1); bodies[key].push(t.body); his[key].push(t.hi); };
    const W = 3.3 * s;
    member('far', pr(-18.5, 0, -16.5), pr(-18.5, 44, -17), turned(W));
    member('far', pr(-20.5, 17, -16), pr(-20.5, 17, 18), straight(1.9 * s));
    member('far', pr(-18.5, 22, -16.8), pr(18.5, 22, -16.8), straight(1.9 * s));
    member('far', pr(-21, 0, 19), pr(-20.6, 44, 18.6), turned(W));
    member('far', pr(18.5, 0, -16.5), pr(18.5, 44, -17), turned(W));
    member('near', pr(-21, 13, 19), pr(21, 13, 19), straight(1.9 * s));
    member('near', pr(-21, 25, 19), pr(21, 25, 19), straight(1.9 * s));
    member('near', pr(20.5, 17, -16), pr(20.5, 17, 18), straight(1.9 * s));
    member('near', pr(21, 0, 19), pr(20.6, 44, 18.6), turned(W));
    const paintG = LIN([[0, P.pinkDark], [1, P.pink]], { x1: 0, y1: 0, x2: 1, y2: 0 });
    const paint = (key) => {
      path(g, bodies[key].join(''), paintG);
      path(g, his[key].join(''), 'none', { stroke: P.pinkLight, 'stroke-width': 0.9, opacity: 0.9 });
    };
    paint('far');
    paint('near');
    // l'assise paillée
    const FL = pr(-21.5, 45, 19.5), FR = pr(21.5, 45, 19.5), BR = pr(19, 45, -17.5), BL = pr(-19, 45, -17.5), Cc = pr(0, 45.6, 1);
    const FLd = pr(-21.5, 41, 19.5), FRd = pr(21.5, 41, 19.5), BRd = pr(19, 41, -17.5);
    path(g, poly([FL, FR, FRd, FLd]), P.strawDark);
    path(g, poly([FR, BR, BRd, FRd]), '#B8964E');
    const wrap = [];
    for (let k = 1; k < 16; k++) wrap.push(`M${pt(lerp2(FL, FR, k / 16))}L${pt(lerp2(FLd, FRd, k / 16))}`);
    path(g, wrap.join(''), 'none', { stroke: '#8E6F30', 'stroke-width': 0.4, opacity: 0.7 });
    path(g, poly([FL, FR, BR, BL]), LIN([[0, '#E6CB86'], [1, P.straw]]));
    const weave = [];
    [[FL, FR], [FR, BR], [BR, BL], [BL, FL]].forEach(([a, b]) => {
      for (let k = 1; k < 7; k++) { const u = k / 7.4; weave.push(`M${pt(lerp2(a, Cc, u))}L${pt(lerp2(b, Cc, u))}`); }
    });
    path(g, weave.join(''), 'none', { stroke: '#B08E45', 'stroke-width': 0.45, opacity: 0.8 });
    path(g, [FL, FR, BR, BL].map((q) => `M${pt(q)}L${pt(Cc)}`).join(''), 'none', { stroke: '#8A6A2C', 'stroke-width': 0.7 });
    // le dossier à barrettes courbées et le montant arrière gauche
    const xPost = (h) => 18.5 - (h - 45) / 49, zPost = (h) => -17 - (6 * (h - 45)) / 49;
    const upL = tubeD(pr(-18.5, 44, -17), pr(-17.5, 93, -23), turned(W * 0.92), 1);
    const slats = [[63, 70], [79, 86]].map(([h1, h2]) => {
      const top = [], bot = [];
      for (let k = 0; k <= 8; k++) {
        const t = -1 + (2 * k) / 8;
        top.push(pr(t * xPost(h2), h2, zPost(h2) - 2.2 * (1 - t * t)));
        bot.push(pr(t * xPost(h1), h1, zPost(h1) - 2.2 * (1 - t * t)));
      }
      return { d: poly(top.concat(bot.reverse())), top };
    });
    path(g, upL.body + slats.map((sl) => sl.d).join(''), paintG);
    path(g, upL.hi + slats.map((sl) => poly(sl.top, false)).join(''), 'none', { stroke: P.pinkLight, 'stroke-width': 0.9 });
    // le coussin moelleux, moutarde, capitonné
    const cush = G(g, { class: 'sa-coussin' });
    const cc = [0, 60, -9], ang = 0.3;
    const cu = (u, w, t = 0) => pr(cc[0] + u, cc[1] + w * Math.cos(ang), cc[2] - w * Math.sin(ang) - t);
    const pillow = (t) => {
      const c = [cu(-16.5, -14.5, t), cu(16.5, -14.5, t), cu(16.5, 14.5, t), cu(-16.5, 14.5, t)];
      const m = cu(0, 0, t);
      let d = `M${pt(c[0])}`;
      for (let i = 0; i < 4; i++) {
        const a = c[i], b = c[(i + 1) % 4], mid = lerp2(a, b, 0.5);
        d += `Q${pt([mid[0] + (mid[0] - m[0]) * 0.28, mid[1] + (mid[1] - m[1]) * 0.28])} ${pt(b)}`;
      }
      return d + 'Z';
    };
    path(cush, pillow(9), P.yellowDeep);
    const face = pillow(0);
    path(cush, face, RAD([[0, '#EFD37C'], [0.55, '#DDB83E'], [1, '#B8942A']], { cx: 0.42, cy: 0.35, r: 0.72 }));
    path(cush, face, 'none', { stroke: '#B99A22', 'stroke-width': 0.9 });
    const petalsC = [], hearts = [];
    [[-9, -6], [7, -8.5], [-2, 3.5], [10, 5.5], [-11, 8.5], [2.5, 11]].forEach(([u, w]) => {
      const q = cu(u, w);
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; petalsC.push(ellD(q[0] + Math.cos(a) * 1.25, q[1] + Math.sin(a) * 1.1, 0.8, 0.8)); }
      hearts.push(ellD(q[0], q[1], 0.6, 0.6));
    });
    path(cush, petalsC.join(''), '#FBF3DC', { opacity: 0.85 });
    path(cush, hearts.join(''), '#C0613F', { opacity: 0.8 });
    const m = cu(0, 0);
    path(cush, [cu(-9, -8), cu(9, -8), cu(9, 8), cu(-9, 8)].map((q) => `M${pt(m)}L${pt(lerp2(m, q, 0.9))}`).join(''), 'none', { stroke: '#A48617', 'stroke-width': 0.8, 'stroke-linecap': 'round', opacity: 0.6 });
    circ(cush, m[0], m[1], 1.5, '#B99A22');
    circ(cush, m[0] - 0.4, m[1] - 0.4, 0.5, '#F6E39A');
    cush.style.transformBox = 'fill-box';
    cush.style.transformOrigin = '50% 100%';
    // le montant arrière droit, devant le coussin, et les pommeaux
    const upR = tubeD(pr(18.5, 44, -17), pr(17.5, 93, -23), turned(W * 0.92), 1);
    path(g, upR.body, paintG);
    path(g, upR.hi, 'none', { stroke: P.pinkLight, 'stroke-width': 0.9 });
    [pr(-17.5, 95, -23.2), pr(17.5, 95, -23.2)].forEach((q) => { circ(g, q[0], q[1], 1.2 * s + 0.8, P.pink); circ(g, q[0] - 0.6, q[1] - 0.7, 0.8, P.pinkLight); });
    hit(g, poly([pr(-23, 97, -24), pr(23, 97, -24), pr(23, 0, 21), pr(-23, 0, 21)]));
    return { g, cushion: cush, v };
  }

  /* ======================================================================
     La vieille malle aux livres (ouverte), le livre ouvert posé dessus
     ====================================================================== */
  const TRUNK = { x: 62, k: 1.36 };
  function drawTrunk(C, p) {
    const { R, LIN, RAD } = C;
    const v = view(TRUNK.x, footY(TRUNK.k), TRUNK.k, -0.16, 0.38);
    const g = G(p, { class: 'sa-malle' });
    const pr = (x, y, z) => v(x, y, z);
    const X = 33, D = 19, H = 35, T = 1.8;
    const o = pr(4, 0, 2);
    ell(g, o[0], o[1] + 2, 62, 14, RAD([[0, '#1A0B05', 0.5], [0.6, '#1A0B05', 0.2], [1, '#1A0B05', 0]]));
    // le couvercle ouvert (charnière à l'arrière), doublé d'un vieux papier rayé
    const al = (104 * Math.PI) / 180, ca = Math.cos(al), sa = Math.sin(al);
    const lid = (x, d, t) => pr(x, H + t * ca + d * sa, -D - t * sa + d * ca);
    const LD = 2 * D;
    path(g, poly([lid(-X, 0, 0), lid(X, 0, 0), lid(X, LD, 0), lid(-X, LD, 0)]), LIN([[0, '#5E311B'], [1, '#7E4426']]));
    const lining = poly([lid(-X + 3, 2.5, 0), lid(X - 3, 2.5, 0), lid(X - 3, LD - 3, 0), lid(-X + 3, LD - 3, 0)]);
    path(g, lining, LIN([[0, '#A87F68'], [1, '#C49A80']]));
    const stripes = [];
    for (let k = 1; k < 11; k++) { const x = -X + 3 + (k * (2 * X - 6)) / 11; stripes.push(`M${pt(lid(x, 2.5, 0))}L${pt(lid(x, LD - 3, 0))}`); }
    path(g, stripes.join(''), 'none', { stroke: '#8E5A48', 'stroke-width': 0.7, opacity: 0.45 });
    path(g, lining, LIN([[0, '#2A140A', 0.45], [0.45, '#2A140A', 0.08], [1, '#2A140A', 0]]));
    const lab = lid(9, LD * 0.55, 0);
    const labR = `rotate(-8 ${f(lab[0])} ${f(lab[1])})`;
    ell(g, lab[0], lab[1], 7.6, 5.4, '#F2E6CC', { transform: labR });
    ell(g, lab[0], lab[1], 6, 4, 'none', { stroke: P.teal, 'stroke-width': 0.8, transform: labR });
    path(g, lanceLeaf(lab[0] - 3.4, lab[1] + 1.4, 6.4, 1.6, -30) + lanceLeaf(lab[0] - 1, lab[1] + 1.8, 5.6, 1.4, -60), P.fuchsia, { transform: labR, opacity: 0.85 });
    path(g, poly([lid(-X, LD, 0), lid(X, LD, 0), lid(X, LD, 5), lid(-X, LD, 5)]), '#4E2815');
    path(g, poly([lid(X, 0, 0), lid(X, LD, 0), lid(X, LD, 5), lid(X, 0, 5)]), '#40210F');
    // l'intérieur : paroi du fond et paroi gauche
    path(g, poly([pr(-X + T, H, -D + T), pr(X - T, H, -D + T), pr(X - T, 18, -D + T), pr(-X + T, 18, -D + T)]), '#4A2716');
    path(g, poly([pr(-X + T, H, -D + T), pr(-X + T, H, D - T), pr(-X + T, 18, D - T), pr(-X + T, 18, -D + T)]), '#633520');
    // les livres debout, dos en l'air
    let x = -X + T + 0.3, i = 0;
    const tails = [], edges = [], gilt = [];
    while (x < X - T - 2) {
      const t = Math.min(X - T - x, 2.6 + R() * 2.8), len = 20 + R() * 9, h = 30 + R() * 5;
      const z0 = -D + T, z1 = z0 + len;
      tails.push(poly([pr(x, h, z1), pr(x + t, h, z1), pr(x + t, h - 9, z1), pr(x, h - 9, z1)]));
      edges.push(`M${pt(pr(x + 0.35, h - 0.4, z1))}L${pt(pr(x + 0.35, h - 9, z1))}M${pt(pr(x + t - 0.35, h - 0.4, z1))}L${pt(pr(x + t - 0.35, h - 9, z1))}`);
      path(g, poly([pr(x, h, z0), pr(x + t, h, z0), pr(x + t, h, z1), pr(x, h, z1)]), BOOKS[(i * 7 + 3) % BOOKS.length]);
      gilt.push(`M${pt(pr(x + 0.3, h, z0 + len * 0.22))}L${pt(pr(x + t - 0.3, h, z0 + len * 0.22))}M${pt(pr(x + 0.3, h, z1 - len * 0.2))}L${pt(pr(x + t - 0.3, h, z1 - len * 0.2))}`);
      x += t + 0.15;
      i++;
    }
    path(g, tails.join(''), '#EDE3CF');
    path(g, edges.join(''), 'none', { stroke: '#8A6A55', 'stroke-width': 0.5, opacity: 0.8 });
    path(g, gilt.join(''), 'none', { stroke: '#E8C77A', 'stroke-width': 0.55, opacity: 0.85 });
    // le bord, la façade et le flanc : planches, coins de fer, serrure
    path(g, poly([pr(-X, H, D), pr(X, H, D), pr(X, H, -D), pr(X - T, H, -D + T), pr(X - T, H, D - T), pr(-X + T, H, D - T)]), '#A0603A');
    path(g, poly([pr(-X, H, -D), pr(-X + T, H, -D + T), pr(-X + T, H, D - T), pr(-X, H, D)]), '#9A5A36');
    const fTL = pr(-X, H, D), fBL = pr(-X, 0, D), fTR = pr(X, H, D);
    path(g, poly([fBL, pr(X, 0, D), fTR, fTL]), LIN([[0, '#9C5A33'], [1, '#6A381D']]));
    path(g, poly([pr(X, 0, D), pr(X, 0, -D), pr(X, H, -D), fTR]), LIN([[0, '#7A4226'], [1, '#52301A']]));
    path(g, [11.5, 23.5].map((h) => `M${pt(pr(-X, h, D))}L${pt(pr(X, h, D))}L${pt(pr(X, h, -D))}`).join('') + grainD(fTL[0], fTL[1], fTR[0] - fTL[0], fBL[1] - fTL[1], R, 8, false), 'none', { stroke: '#3E2011', 'stroke-width': 0.7, opacity: 0.55 });
    path(g, `M${pt(pr(-X, H - 0.8, D))}L${pt(pr(X, H - 0.8, D))}`, 'none', { stroke: '#C98A5E', 'stroke-width': 0.8, opacity: 0.7 });
    const iron = [], rivets = [];
    [[-X, 1], [X, -1]].forEach(([cx, dir]) => {
      [0, H].forEach((cy) => {
        const up = cy ? -1 : 1;
        iron.push(poly([pr(cx, cy, D), pr(cx + dir * 7, cy, D), pr(cx + dir * 7, cy + up * 2.2, D), pr(cx + dir * 2.2, cy + up * 2.2, D), pr(cx + dir * 2.2, cy + up * 7, D), pr(cx, cy + up * 7, D)]));
        rivets.push(pr(cx + dir * 1.1, cy + up * 4.6, D), pr(cx + dir * 4.6, cy + up * 1.1, D));
      });
    });
    [0, H].forEach((cy) => { const up = cy ? -1 : 1; iron.push(poly([pr(X, cy, D), pr(X, cy, D - 7), pr(X, cy + up * 2.2, D - 7), pr(X, cy + up * 2.2, D - 2.2), pr(X, cy + up * 7, D - 2.2), pr(X, cy + up * 7, D)])); });
    path(g, iron.join(''), '#2F2926');
    path(g, rivets.map((q) => ellD(q[0], q[1], 0.6, 0.6)).join(''), '#8C8580');
    path(g, poly([pr(-4, H, D), pr(4, H, D), pr(4, H - 8, D), pr(-4, H - 8, D)]), LIN([[0, P.brassLight], [0.6, P.brass], [1, P.brassDark]], { x1: 0, y1: 0, x2: 1, y2: 1 }));
    const kh = pr(0, H - 4.2, D);
    path(g, `M${f(kh[0])} ${f(kh[1] - 1.4)}a1 1 0 0 1 0 2l0.5 1.8h-1z`, '#2A1A10');
    const h1 = pr(X, 24, -6), h2 = pr(X, 24, 6);
    path(g, `M${pt(h1)}C${f(h1[0] + 3)} ${f(h1[1] + 7)} ${f(h2[0] + 3)} ${f(h2[1] + 7)} ${pt(h2)}`, 'none', { stroke: '#4A2A18', 'stroke-width': 2.2, 'stroke-linecap': 'round' });

    // le livre ouvert, posé sur les autres ; une page qui tourne
    const bookG = G(g, { class: 'sa-livre' });
    const B = { x: -8, y: 36.2, z: 1, psi: 0.45 };
    const bw = (u, w, hgt) => {
      const c = Math.cos(B.psi), sn = Math.sin(B.psi);
      return pr(B.x + u * c - w * sn, B.y + hgt, B.z + u * sn + w * c);
    };
    const hPage = (u) => 1.8 * Math.sin(Math.min(1, Math.abs(u) / 15) * Math.PI * 0.62) + 0.5;
    path(bookG, poly([bw(-16, -11.2, 0), bw(16, -11.2, 0), bw(16, 11.2, 0), bw(-16, 11.2, 0)]), '#2E6A70');
    path(bookG, poly([bw(-16, 11.2, 0), bw(16, 11.2, 0), bw(16, 11.2, -0.8), bw(-16, 11.2, -0.8)]), '#1F4A4F');
    const pageD = (sgn) => {
      const us = []; for (let k = 0; k <= 8; k++) us.push((sgn * 15 * k) / 8);
      return poly(us.map((u) => bw(u, -10.5, hPage(u))).concat(us.slice().reverse().map((u) => bw(u, 10.5, hPage(u)))));
    };
    path(bookG, pageD(-1) + pageD(1), LIN([[0, '#FBF6EA'], [1, '#E9DFCA']]));
    path(bookG, poly([bw(15, 10.5, hPage(15)), bw(15, 10.5, 0.2), bw(-15, 10.5, 0.2), bw(-15, 10.5, hPage(15))]), '#E4D8BF');
    const txt = [];
    [-1, 1].forEach((sgn) => {
      for (let k = 0; k < 7; k++) {
        const w = -8 + k * 2.6, u0 = sgn * 2.4, u1 = sgn * (k === 6 ? 8 : 12.8);
        const seg = []; for (let j = 0; j <= 4; j++) { const u = u0 + ((u1 - u0) * j) / 4; seg.push(bw(u, w, hPage(u) + 0.05)); }
        txt.push(poly(seg, false));
      }
    });
    path(bookG, txt.join(''), 'none', { stroke: '#9A8C7A', 'stroke-width': 0.45, opacity: 0.8 });
    path(bookG, poly([bw(0, -10.5, 0.4), bw(0, 10.5, 0.4)], false), 'none', { stroke: '#B8AA92', 'stroke-width': 0.6 });
    const r0 = bw(0.6, 10.5, 0.4);
    path(bookG, `M${pt(r0)}c0.6 3 -0.8 5.6 0.6 8.6l1.2 -0.6c-1.2 -2.8 0.2 -5.2 -0.4 -8z`, '#C23A4C');
    const page = path(bookG, 'M0 0Z', LIN([[0, '#FFFBF2'], [1, '#E6DAC4']]), { stroke: '#CDBEA4', 'stroke-width': 0.3, class: 'sa-page', display: 'none' });
    // la page de droite tourne autour du dos, en se courbant un peu (le bord part devant)
    const pageAt = (beta) => {
      const us = []; for (let k = 0; k <= 8; k++) us.push((15 * k) / 8);
      const cb = Math.abs(Math.cos(beta));
      const P3 = (u, w) => {
        const b = beta + 0.45 * Math.sin(beta) * (u / 15);
        return bw(u * Math.cos(b), w, 0.58 + u * Math.sin(b) + (hPage(u) - 0.5) * cb);
      };
      return poly(us.map((u) => P3(u, -10.5)).concat(us.slice().reverse().map((u) => P3(u, 10.5))));
    };
    const bb = [bw(-17, -12, 0), bw(17, -12, 0), bw(17, 12, 0), bw(-17, 12, 0), bw(0, 0, 12)];
    hit(bookG, boxD(bb, 4));
    hit(g, poly([pr(-X, 0, D), pr(X, 0, D), pr(X, 0, -D), lid(X, LD, 0), lid(-X, LD, 0)]));
    return { g, book: bookG, page, pageAt };
  }

  /* ======================================================================
     La suspension (tissu plissé, festons, pompons) et sa lumière
     ====================================================================== */
  function drawLamp(C, pLamp, pLight) {
    const { LIN, RAD } = C;
    const out = {};
    const { x, cap, y0, y1, w0, w1 } = LAMP;
    // le halo sur la salle (au-dessus de tout, sauf la suspension elle-même)
    out.halo = ell(pLight, x, y1 + 18, 250, 230, RAD([[0, '#FFE4A0', 0.6], [0.16, '#FFD684', 0.34], [0.42, '#FFC96E', 0.12], [1, '#FFC96E', 0]]), { class: 'sa-halo' });
    // la lumière qui file par le haut de l'abat-jour et éclaire la voûte
    ell(pLight, x, y0 - 18, 70, 52, RAD([[0, '#FFEBC0', 0.42], [0.5, '#FFE2A8', 0.14], [1, '#FFE2A8', 0]]));
    // un cône de lumière, très doux, sous l'abat-jour
    const coneG = LIN([[0, '#FFF1CC', 0.13], [0.55, '#FFF1CC', 0.035], [1, '#FFF1CC', 0]]);
    out.cone = path(pLight, `M${f(x - w1 / 2 + 2)} ${f(y1)}L${f(x - 92)} ${f(y1 + 200)}H${f(x + 92)}L${f(x + w1 / 2 - 2)} ${f(y1)}Z`, coneG);
    path(pLight, `M${f(x - w1 / 2 + 8)} ${f(y1)}L${f(x - 58)} ${f(y1 + 180)}H${f(x + 58)}L${f(x + w1 / 2 - 8)} ${f(y1)}Z`, coneG);
    const sw = G(pLamp, { class: 'sa-suspension' });
    sw.style.transformOrigin = `${x}px -60px`;
    out.swing = sw;
    // le cordon torsadé
    path(sw, `M${x} -60V${f(cap)}`, 'none', { stroke: '#5E3F2C', 'stroke-width': 1.6 });
    path(sw, `M${x} -60V${f(cap)}`, 'none', { stroke: '#D6B488', 'stroke-width': 1.6, 'stroke-dasharray': '1.1 1.3', opacity: 0.85 });
    // la douille en laiton
    path(sw, `M${f(x - 4.5)} ${f(cap)}h9l1.8 ${f(y0 - cap + 1)}h-12.6z`, LIN([[0, P.brassLight], [0.5, P.brass], [1, P.brassDark]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    // l'abat-jour : dôme de tissu plissé, ourlet festonné
    const n = 9, L = x - w1 / 2, Rr = x + w1 / 2;
    let d = `M${f(x - w0 / 2)} ${f(y0)}C${f(x - w0 / 2 - 11)} ${f(y0 + 5)} ${f(L + 2)} ${f(y1 - 20)} ${f(L)} ${f(y1)}`;
    const scal = [];
    for (let k = 0; k < n; k++) {
      const a = L + (k * w1) / n, b = L + ((k + 1) * w1) / n;
      d += `Q${f((a + b) / 2)} ${f(y1 + 6)} ${f(b)} ${f(y1)}`;
      scal.push([(a + b) / 2, y1 + 3]);
    }
    d += `C${f(Rr - 2)} ${f(y1 - 20)} ${f(x + w0 / 2 + 11)} ${f(y0 + 5)} ${f(x + w0 / 2)} ${f(y0)}Z`;
    path(sw, d, LIN([[0, '#D39A7C'], [0.42, '#F0C29C'], [1, '#FFE5BE']]));
    path(sw, d, LIN([[0, '#6A3A1E', 0.4], [0.28, '#6A3A1E', 0], [0.72, '#6A3A1E', 0], [1, '#6A3A1E', 0.42]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    out.off = path(sw, d, '#4A2E1E', { opacity: 0, class: 'sa-eteint' });
    const pleats = [];
    for (let k = 1; k < 14; k++) {
      const t = k / 14, xa = x - w0 / 2 + w0 * t, xb2 = L + w1 * t;
      pleats.push(`M${f(xa)} ${f(y0 + 1)}Q${f(xa + (xb2 - xa) * 0.3)} ${f(y0 + (y1 - y0) * 0.55)} ${f(xb2)} ${f(y1 + 2)}`);
    }
    path(sw, pleats.join(''), 'none', { stroke: '#B57656', 'stroke-width': 0.6, opacity: 0.5 });
    path(sw, `M${f(x - w0 / 2 - 1)} ${f(y0 + 0.8)}h${f(w0 + 2)}`, 'none', { stroke: P.brass, 'stroke-width': 1.6 });
    // le dessous éclairé (on le voit par en dessous) et l'ampoule
    ell(sw, x, y1 + 0.8, w1 / 2 - 2.4, 4.6, '#FFF4D6');
    ell(sw, x, y1 - 0.2, 7.5, 3, '#FFFEF6');
    // les pompons
    path(sw, scal.map(([sx, sy]) => `M${f(sx)} ${f(sy)}v3.4`).join(''), 'none', { stroke: '#D6A06E', 'stroke-width': 0.55 });
    path(sw, scal.map(([sx, sy]) => ellD(sx, sy + 4.8, 1.6, 1.7)).join(''), '#D9876A');
    sw.appendChild(out.off);
    out.offUnder = ell(sw, x, y1 + 0.8, w1 / 2 - 1, 5.6, '#4A2E1E', { opacity: 0 });
    // la lueur au cœur de l'abat-jour
    out.core = ell(sw, x, y1 - 5, 40, 19, RAD([[0, '#FFF6DC', 0.9], [0.5, '#FFE9B5', 0.35], [1, '#FFE0A0', 0]]), { class: 'sa-coeur' });
    hit(sw, `M${f(x - 40)} ${f(y0 - 16)}H${f(x + 40)}V${f(y1 + 14)}H${f(x - 40)}Z`);
    return out;
  }

  /* ======================================================================
     Construction, animations, interactions
     ====================================================================== */
  async function create(host, opts = {}) {
    const R = AC.rng(opts.seed || 1914);
    // opts.cadre : le cadrage (l'onglet Nous l'agrandit : le texte du conte en haut, le comptoir en bas)
    const svg = S('svg', {
      viewBox: opts.cadre || '0 0 400 520', class: 'salon', preserveAspectRatio: 'xMidYMid meet', role: 'group',
      'aria-label': "Le salon de thé : la vieille armoire vitrée et ses livres, la chaise bistrot en bois courbé, le guéridon menthe et la vaisselle ancienne, sous la suspension dorée",
    });
    svg.style.overflow = 'visible';
    svg.style.webkitTapHighlightColor = 'transparent';
    const defs = S('defs', {}, svg);
    const U = (p) => AC.uid('sa' + p);
    // les dégradés : une définition identique n'est écrite qu'une fois
    const memo = new Map();
    const cached = (kind, fn) => (stops, o = {}) => {
      const key = kind + JSON.stringify(stops) + JSON.stringify(o);
      if (!memo.has(key)) memo.set(key, fn(defs, U(kind), stops, o));
      return memo.get(key);
    };
    const C = { defs, U, R, LIN: cached('l', lin), RAD: cached('r', rad) };
    const L = {
      room: G(svg, { class: 'sa-salle' }),
      armoire: G(svg, { class: 'sa-armoire' }),
      mid: G(svg, { class: 'sa-milieu' }),
      dim: G(svg, { class: 'sa-penombre', 'pointer-events': 'none' }),
      light: G(svg, { class: 'sa-lumiere', 'pointer-events': 'none' }),
      lamp: G(svg, { class: 'sa-lampe' }),
      life: G(svg, { class: 'sa-vie', 'pointer-events': 'none' }),
    };
    const room = drawRoom(C, L.room);
    const arm = drawArmoire(C, L.armoire);
    const trunk = drawTrunk(C, L.mid);
    const pink = drawPinkChair(C, L.mid);
    const table = drawTable(C, L.mid);
    const thonet = drawThonet(C, L.mid);
    // la pénombre des coins : un cocon
    rect(L.dim, -130, -90, 660, 700, C.RAD([[0, '#000', 0], [0.38, '#000', 0], [0.7, '#1E0F08', 0.3], [1, '#1E0F08', 0.64]], { cx: 250, cy: 285, r: 380, units: 'userSpaceOnUse' }));
    const veil = rect(L.dim, -130, -90, 660, 700, '#170B05', { opacity: 0 });
    const lamp = drawLamp(C, L.lamp, L.light);
    // la vapeur de la tasse
    const [sx, sy] = table.cupRim;
    const WISP = [
      [-2.6, 0, 'c-2.6 -4 2.2 -7 0.4 -11.5s-3.2 -6.4 -0.6 -12'],
      [0.4, -1.5, 'c2.4 -3.6 -2.6 -6.2 -0.2 -10.4s2.8 -5.2 0.8 -9'],
      [2.8, 0.5, 'c-1.8 -3 2.6 -5.4 0.8 -9s-2.2 -4.6 -0.4 -8.2'],
    ];
    const wisps = WISP.map(([dx, dy, d], k) => {
      const w = path(L.life, `M${f(sx + dx)} ${f(sy - 1 + dy)}${d}`, 'none', { stroke: '#FFFDF6', 'stroke-width': k === 1 ? 1.9 : 1.4, 'stroke-linecap': 'round', opacity: 0, class: 'sa-volute' });
      w.style.transformBox = 'fill-box';
      w.style.transformOrigin = '50% 100%';
      return w;
    });

    host.appendChild(svg);

    /* ---------- les animations ---------- */
    const running = new Set(); // animations en boucle (idle)
    const timers = new Set();
    let alive = true, idleOn = false;
    const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const sfx = (n, o) => AC.sfx && AC.sfx.play(n, o || {});
    const busy = new Set();
    const A = (el, kf, o) => el.animate(kf, { easing: 'cubic-bezier(.2,.8,.2,1)', ...o });

    function setStatic() {
      wisps.forEach((w) => { w.style.opacity = '0.34'; });
    }

    /** La vapeur : trois volutes qui montent, se tordent et s'effacent */
    function steamLoop() {
      wisps.forEach((w, i) => {
        running.add(w.animate([
          { opacity: 0, transform: 'translate(0,3px) scale(.7,.75)' },
          { opacity: 0.6, offset: 0.3 },
          { opacity: 0, transform: `translate(${i % 2 ? 3 : -2.5}px,-15px) scale(1.2,1.3)` },
        ], { duration: 2700 + i * 420, delay: i * 820, iterations: Infinity, easing: 'ease-out' }));
      });
    }
    function steamPuff() {
      wisps.forEach((w, i) => w.animate([
        { opacity: 0, transform: 'translate(0,2px) scale(.8,.8)' },
        { opacity: 0.95, offset: 0.25 },
        { opacity: 0, transform: `translate(${i % 2 ? 4 : -3}px,-22px) scale(1.5,1.6)` },
      ], { duration: 1400 + i * 160, delay: i * 90, easing: 'ease-out', composite: 'replace' }));
    }

    /** Une page du livre ouvert se tourne */
    async function turnPage() {
      if (busy.has('page')) return;
      busy.add('page');
      sfx('page');
      trunk.page.setAttribute('display', 'inline');
      await AC.tween(760, (e) => trunk.page.setAttribute('d', trunk.pageAt(e * Math.PI)), AC.ease.inOutCubic);
      trunk.page.setAttribute('display', 'none');
      busy.delete('page');
    }
    /** Un reflet passe sur les vitres de l'armoire */
    function sheen() {
      arm.doors.forEach((d, i) => d.sweep.animate([
        { opacity: 0, transform: 'translateX(0)' },
        { opacity: 0.2, offset: 0.3 },
        { opacity: 0.16, offset: 0.7 },
        { opacity: 0, transform: 'translateX(78px)' },
      ], { duration: 1700, delay: i * 240, easing: 'ease-in-out' }));
    }

    /* ---------- les cibles touchables ---------- */
    const touch = {
      /** la tasse : elle tinte sur sa soucoupe, la vapeur s'envole */
      tasse() {
        sfx('clink');
        sfx('steam', { delay: 220 });
        if (AC.reduced) return;
        A(table.cup, [{ transform: 'none' }, { transform: 'translateY(-2.2px) rotate(-3deg)', offset: 0.35 }, { transform: 'translateY(0.4px)', offset: 0.7 }, { transform: 'none' }], { duration: 420 });
        steamPuff();
      },
      /** l'armoire : les portes s'entrouvrent en grinçant, les cuillères tintent */
      async armoire() {
        if (busy.has('armoire')) return;
        busy.add('armoire');
        sfx('creak');
        [0, 1, 2, 3].forEach((k) => sfx('spoon', { delay: 380 + k * 170 + Math.random() * 60 }));
        sfx('hang', { delay: 520, i: 2 });
        if (!AC.reduced) {
          const T = { duration: 2300, easing: 'ease-in-out' };
          const open = [{ transform: 'none' }, { transform: 'scaleX(.78)', offset: 0.28 }, { transform: 'scaleX(.8)', offset: 0.76 }, { transform: 'none' }];
          const anims = arm.doors.map((d) => A(d.g, open, T));
          arm.doors.forEach((d) => {
            A(d.shade, [{ opacity: 0 }, { opacity: 0.3, offset: 0.28 }, { opacity: 0.28, offset: 0.76 }, { opacity: 0 }], T);
            A(d.edge, [{ opacity: 0 }, { opacity: 1, offset: 0.24 }, { opacity: 1, offset: 0.78 }, { opacity: 0, offset: 0.9 }, { opacity: 0 }], T);
            A(d.sweep, [{ opacity: 0, transform: 'translateX(10px)' }, { opacity: 0.24, transform: 'translateX(26px)', offset: 0.3 }, { opacity: 0.2, transform: 'translateX(30px)', offset: 0.75 }, { opacity: 0, transform: 'translateX(12px)' }], T);
          });
          arm.spoons.forEach((sp, i) => {
            const a = (i % 2 ? 1 : -1) * (7 + (i % 3) * 2);
            A(sp, [{ transform: 'rotate(0)' }, { transform: `rotate(${a}deg)`, offset: 0.2 }, { transform: `rotate(${-a * 0.6}deg)`, offset: 0.45 }, { transform: `rotate(${a * 0.3}deg)`, offset: 0.7 }, { transform: 'rotate(0)' }], { duration: 1500, delay: 300 + i * 45, easing: 'ease-in-out' });
          });
          A(arm.key, [{ transform: 'rotate(0)' }, { transform: 'rotate(14deg)' }, { transform: 'rotate(-9deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(0)' }], { duration: 1400, delay: 100, easing: 'ease-out' });
          later(1900, () => sfx('close'));
          await Promise.all(anims.map((a) => a.finished.catch(() => {})));
        } else await AC.wait(600);
        busy.delete('armoire');
      },
      /** le livre : une page se tourne */
      livre() {
        if (AC.reduced) { sfx('page'); return; }
        turnPage();
      },
      /** la chaise en bois courbé : elle grince un peu */
      chaise() {
        sfx('creak');
        if (AC.reduced) return;
        A(thonet.g, [{ transform: 'rotate(0)' }, { transform: 'rotate(-1.6deg)', offset: 0.3 }, { transform: 'rotate(1deg)', offset: 0.6 }, { transform: 'rotate(-.4deg)', offset: 0.8 }, { transform: 'rotate(0)' }], { duration: 760, easing: 'ease-in-out' });
      },
      /** le coussin : on tapote, il se regonfle */
      chaise2() {
        sfx('flutter');
        if (AC.reduced) return;
        A(pink.cushion, [{ transform: 'none' }, { transform: 'scale(1.06,.86)', offset: 0.3 }, { transform: 'scale(.97,1.05)', offset: 0.65 }, { transform: 'none' }], { duration: 620, easing: 'ease-out' });
      },
      /** la théière : elle verse un peu, la tasse fume */
      theiere() {
        if (busy.has('theiere')) return;
        busy.add('theiere');
        sfx('pour', { dur: 0.8 });
        if (AC.reduced) { busy.delete('theiere'); return; }
        A(table.teapot, [{ transform: 'rotate(0)' }, { transform: 'translateY(-1.5px) rotate(14deg)', offset: 0.32 }, { transform: 'translateY(-1.5px) rotate(15deg)', offset: 0.72 }, { transform: 'rotate(0)' }], { duration: 1400, easing: 'ease-in-out' })
          .finished.catch(() => {}).then(() => { busy.delete('theiere'); sfx('clink', { v: 0.6 }); steamPuff(); });
      },
      /** la suspension : on la pousse, elle se balance, la lumière vacille */
      lampe() {
        sfx('tine', { m: 91, v: 0.45 });
        if (AC.reduced) return;
        A(lamp.swing, [{ transform: 'rotate(0)' }, { transform: 'rotate(3deg)', offset: 0.18 }, { transform: 'rotate(-2.2deg)', offset: 0.42 }, { transform: 'rotate(1.2deg)', offset: 0.64 }, { transform: 'rotate(-.5deg)', offset: 0.84 }, { transform: 'rotate(0)' }], { duration: 2600, easing: 'ease-in-out', composite: 'add' });
        A(L.light, [{ opacity: 1 }, { opacity: 0.78, offset: 0.1 }, { opacity: 1, offset: 0.2 }, { opacity: 0.88, offset: 0.3 }, { opacity: 1 }], { duration: 900, easing: 'linear' });
      },
    };
    const targets = { tasse: table.cup, armoire: L.armoire, livre: trunk.g, chaise: thonet.g, chaise2: pink.g, theiere: table.teapot, lampe: lamp.swing };
    const labels = { tasse: 'La tasse de chocolat chaud', armoire: "L'armoire vitrée et ses cuillères", livre: 'Le livre ouvert sur la malle', chaise: 'La chaise bistrot en bois courbé', chaise2: 'Le coussin de la chaise rose', theiere: 'La théière à fleurs', lampe: 'La suspension' };
    if (opts.interactive !== false) {
      Object.keys(targets).forEach((k) => {
        const el = targets[k];
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', opts.focusable === false ? '-1' : '0');
        el.setAttribute('aria-label', labels[k]);
        el.setAttribute('data-sfx', 'none');
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => touch[k]());
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); touch[k](); } });
      });
    }

    const api = {
      svg,
      targets,

      /** La scène se compose (~2,5 s) : la salle, l'armoire, les livres, les meubles,
          la lumière qui s'allume, la vaisselle qui se pose en tintant */
      async play() {
        if (AC.reduced) { setStatic(); return; }
        const all = [];
        const B = (el, kf, o) => { const a = el.animate(kf, { fill: 'backwards', easing: 'cubic-bezier(.2,.8,.2,1)', ...o }); all.push(a); return a; };
        const drop = (el, delay, dy = -16, dur = 520) => B(el, [{ opacity: 0, transform: `translateY(${dy}px)` }, { opacity: 1, transform: 'translateY(0)', offset: 0.7 }, { transform: 'translateY(1.2px)', offset: 0.85 }, { transform: 'none' }], { duration: dur, delay, easing: 'ease-in' });
        const at = (n, ms, o = {}) => sfx(n, { ...o, delay: ms });
        // 0 : la salle, dans la pénombre
        B(L.room, [{ opacity: 0 }, { opacity: 1 }], { duration: 500 });
        B(veil, [{ opacity: 0.6 }, { opacity: 0.6, offset: 0.62 }, { opacity: 0.22, offset: 0.7 }, { opacity: 0.46, offset: 0.75 }, { opacity: 0 }], { duration: 1900, easing: 'linear' });
        B(room.garland, [{ opacity: 0.2 }, { opacity: 0.2, offset: 0.7 }, { opacity: 1 }], { duration: 1700 });
        // 150 : l'armoire se pose, ses livres arrivent un à un
        drop(L.armoire, 150, -22, 640);
        at('creak', 520);
        arm.books.items.forEach((b, i) => B(b, [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 560 + i * 26, easing: 'cubic-bezier(.3,1.5,.5,1)' }));
        at('tap', 700, { gain: 0.5 });
        at('tap', 980, { gain: 0.4 });
        // 600 : la malle, les chaises, le guéridon
        drop(trunk.g, 620, -14, 480);
        drop(pink.g, 760, -14, 480);
        drop(table.g, 880, -12, 480);
        drop(thonet.g, 1000, -16, 500);
        at('creak', 1300);
        // 1200 : la lumière s'allume (un petit vacillement)
        B(L.light, [{ opacity: 0 }, { opacity: 0.7, offset: 0.2 }, { opacity: 0.25, offset: 0.34 }, { opacity: 1 }], { duration: 700, delay: 1180, easing: 'linear' });
        B(lamp.core, [{ opacity: 0 }, { opacity: 0.8, offset: 0.2 }, { opacity: 0.3, offset: 0.34 }, { opacity: 1 }], { duration: 700, delay: 1180, easing: 'linear' });
        [lamp.off, lamp.offUnder].forEach((el) => B(el, [{ opacity: 0.62 }, { opacity: 0.62, offset: 0.63 }, { opacity: 0.15, offset: 0.7 }, { opacity: 0.45, offset: 0.74 }, { opacity: 0 }], { duration: 1880, easing: 'linear' }));
        B(room.appGlow, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 1300 });
        B(room.floorGlow, [{ opacity: 0 }, { opacity: 0.8, offset: 0.2 }, { opacity: 0.3, offset: 0.34 }, { opacity: 1 }], { duration: 700, delay: 1180, easing: 'linear' });
        B(lamp.swing, [{ transform: 'rotate(2.4deg)' }, { transform: 'rotate(-1.6deg)' }, { transform: 'rotate(.8deg)' }, { transform: 'rotate(0)' }], { duration: 1600, delay: 900, easing: 'ease-in-out' });
        at('tine', 1200, { m: 91, v: 0.35 });
        // 1500 : la vaisselle se pose, en tintant
        drop(table.plate, 1520, -12, 380);
        at('plate', 1760);
        drop(table.cup, 1760, -12, 380);
        at('clink', 2000);
        drop(table.teapot, 1960, -14, 400);
        at('clink', 2220, { v: 0.6 });
        drop(table.spoon, 2240, -8, 300);
        at('spoon', 2400);
        B(pink.cushion, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.08,.94)', opacity: 1, offset: 0.6 }, { transform: 'none' }], { duration: 480, delay: 1400, easing: 'ease-out' });
        await Promise.all(all.map((a) => a.finished.catch(() => {})));
      },

      /** La vie ambiante : vapeur, lumière qui respire, suspension qui oscille,
          une page qui se tourne de temps en temps, un reflet sur la vitre de l'armoire */
      idle(frozen) {
        if (AC.reduced || frozen) { setStatic(); return; }
        if (idleOn) return;
        idleOn = true;
        alive = true;
        steamLoop();
        // la lumière respire (par petits paliers : presque rien à repeindre)
        running.add(L.light.animate([{ opacity: 0.86 }, { opacity: 1 }], { duration: 3600, direction: 'alternate', iterations: Infinity, easing: 'steps(14, jump-none)' }));
        running.add(room.appGlow.animate([{ opacity: 0.88 }, { opacity: 1 }], { duration: 2900, direction: 'alternate', iterations: Infinity, easing: 'steps(10, jump-none)' }));
        running.add(lamp.swing.animate([{ transform: 'rotate(-.45deg)' }, { transform: 'rotate(.45deg)' }], { duration: 5400, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }));
        const loop = (fn, a, b) => later(a + Math.random() * (b - a), () => {
          if (!alive) return;
          if (!svg.isConnected) { loop(fn, a, b); return; }
          if (!document.hidden) fn();
          loop(fn, a, b);
        });
        loop(turnPage, 9000, 15000);
        loop(sheen, 6000, 10000);
      },

      /** Réaction d'une cible (même effet qu'un toucher) */
      touch(name) { if (touch[name]) return touch[name](); },

      /** Arrête la vie ambiante (on quitte la page) */
      stop() {
        alive = false;
        idleOn = false;
        running.forEach((a) => a.cancel());
        running.clear();
        timers.forEach((t) => clearTimeout(t));
        timers.clear();
      },
    };
    api.parts = { room, arm, trunk, pink, table, thonet, lamp, wisps, layers: L };
    return api;
  }

  AC.Salon = { create };
})();
