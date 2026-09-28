/* ==========================================================================
   Leur cuillère ciselée (AC.BRAND.cuillere), pliée en cercle : l'icône d'appli.
   Le dessin est échantillonné (chaque contour devient un polygone serré), puis
   chaque point est posé sur l'anneau : la longueur de la cuillère suit le cercle,
   sa largeur devient l'épaisseur. AC.cuillereAnneau(opts) → { fill, lines } (chemins).
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});
  const NS = 'http://www.w3.org/2000/svg';

  /** d → sous-chemins absolus (M, L, C, Q, Z), pour les échantillonner un par un */
  function sousChemins(d) {
    const tok = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) || [];
    const out = [];
    let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cur = '', px = 0, py = 0, pc = '';
    const n = () => +tok[i++];
    while (i < tok.length) {
      if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
      if (C === 'Z') { cur += 'Z'; x = sx; y = sy; out.push(cur); cur = ''; pc = 'Z'; continue; }
      if (C === 'M') {
        if (cur) out.push(cur);
        x = (rel ? x : 0) + n(); y = (rel ? y : 0) + n(); sx = x; sy = y; cur = `M${x} ${y}`;
        cmd = rel ? 'l' : 'L'; pc = 'M'; continue;
      }
      if (C === 'L') { x = (rel ? x : 0) + n(); y = (rel ? y : 0) + n(); cur += `L${x} ${y}`; }
      else if (C === 'H') { x = (rel ? x : 0) + n(); cur += `L${x} ${y}`; }
      else if (C === 'V') { y = (rel ? y : 0) + n(); cur += `L${x} ${y}`; }
      else if (C === 'C') {
        const a = [n(), n(), n(), n(), n(), n()].map((v, k) => v + (rel ? (k % 2 ? y : x) : 0));
        cur += `C${a.join(' ')}`; px = a[2]; py = a[3]; x = a[4]; y = a[5]; pc = 'C'; continue;
      } else if (C === 'S') {
        const r = pc === 'C' ? [2 * x - px, 2 * y - py] : [x, y];
        const a = [n(), n(), n(), n()].map((v, k) => v + (rel ? (k % 2 ? y : x) : 0));
        cur += `C${r[0]} ${r[1]} ${a.join(' ')}`; px = a[0]; py = a[1]; x = a[2]; y = a[3]; pc = 'C'; continue;
      } else if (C === 'Q') {
        const a = [n(), n(), n(), n()].map((v, k) => v + (rel ? (k % 2 ? y : x) : 0));
        cur += `Q${a.join(' ')}`; px = a[0]; py = a[1]; x = a[2]; y = a[3]; pc = 'Q'; continue;
      } else if (C === 'A') {
        // (pas d'arcs dans leurs tracés ; au cas où : une ligne droite)
        n(); n(); n(); n(); n(); x = (rel ? x : 0) + n(); y = (rel ? y : 0) + n(); cur += `L${x} ${y}`;
      }
      pc = C;
    }
    if (cur) out.push(cur);
    return out;
  }

  /** un sous-chemin → points, tous les `pas` unités (via un <path> hors écran) */
  function points(d, pas, hote) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    hote.appendChild(p);
    const L = p.getTotalLength(), m = Math.max(3, Math.ceil(L / pas)), pts = [];
    for (let k = 0; k < m; k++) { const q = p.getPointAtLength((L * k) / m); pts.push([q.x, q.y]); }
    p.remove();
    return pts;
  }

  /**
   * opts : cx, cy (centre), R (rayon de l'axe de la cuillère), debut (angle de la pointe du cuilleron, degrés,
   * 0 = à droite, sens horaire), tour (degrés parcourus du cuilleron au bout du manche), epais (échelle de la
   * largeur), pas (finesse de l'échantillonnage, unités du dessin)
   */
  AC.cuillereAnneau = function ({ cx = 256, cy = 256, R = 150, debut = -90, tour = 330, epais = 0.6, pas = 1.2, sens = 1 } = {}) {
    const C = AC.BRAND && AC.BRAND.cuillere;
    if (!C) return null;
    const [bx0, by0, bx1, by1] = C.bbox, axe = (bx0 + bx1) / 2, L = by1 - by0;
    const hote = document.createElementNS(NS, 'svg');
    hote.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
    document.body.appendChild(hote);
    const k = (R * (tour * Math.PI / 180)) / L; // unités de l'icône par unité du dessin, le long de l'anneau
    const f = (v) => Math.round(v * 100) / 100;
    // le cuilleron (en bas du dessin) au début de l'anneau, le bout du manche au bout
    const pose = ([x, y]) => {
      const a = ((debut + sens * ((by1 - y) / L) * tour) * Math.PI) / 180;
      const r = R + (x - axe) * k * epais * sens;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    const plier = (d) => sousChemins(d).map((sc) => {
      const pts = points(sc, pas, hote).map(pose);
      return 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';
    }).join('');
    const out = { fill: C.fill ? plier(C.fill) : '', lines: plier(C.lines) };
    hote.remove();
    return out;
  };
})();
