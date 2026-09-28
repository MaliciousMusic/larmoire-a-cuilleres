/* ==========================================================================
   L'Armoire à Cuillères — le peintre de la vue du dessus (js/ac-ville.js)
   La terrasse et la rue de tout près, les toits du quartier, le plan : des couches peintes une fois, chacune à sa
   finesse, d'après les données d'OpenStreetMap (js/ac-ville-donnees.js). Dans le Worker (js/ac-ville-atelier.js)
   sur des toiles hors écran, ou dans la page sans Worker. self.ACVillePeintre = { rue, lueur, toits, plan } :
   chacun (données, rayon en mètres, pixels par mètre, densité de pixels) → une toile.
   ========================================================================== */
(function () {
  'use strict';
  /* ======================================================================
     3) la vue du dessus : de la terrasse (tout près) au plan (la ville) — des couches peintes une fois, sur des
        toiles, chacune à sa finesse ; elles se relaient pendant qu'on s'élève
     ====================================================================== */
  // une toile : hors écran dans le Worker (OffscreenCanvas), un <canvas> dans la page
  const nouvelle = (w, h) => {
    if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  };
  function toile(N, r) {
    const c = nouvelle(Math.round(N * r), Math.round(N * r));
    return { c, x: c.getContext('2d'), r };
  }
  /** un hasard qui se répète (le même dessin à chaque fois) */
  function hasard(graine) {
    let a = graine >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** le bord du carré s'efface (un fondu circulaire) : il se fond dans la couche d'en dessous */
  function fondu(x, N, r, a) {
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'destination-in';
    const h = (N * r) / 2, g = x.createRadialGradient(h, h, h * a, h, h, h);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, N * r, N * r);
    x.globalCompositeOperation = 'source-over';
  }
  const TUILES = ['#C4654A', '#B55A3F', '#CF7650', '#A85339', '#C87052', '#BB6044'];
  /** l'axe long d'un contour (analyse en composantes principales) : [cx, cy, angle, longueur, largeur, rectangulaire] */
  function axe(pts) {
    const n = pts.length / 2;
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += pts[2 * i]; cy += pts[2 * i + 1]; }
    cx /= n; cy /= n;
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) { const dx = pts[2 * i] - cx, dy = pts[2 * i + 1] - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const a = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(a), uy = Math.sin(a);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, aire = 0;
    for (let i = 0; i < n; i++) {
      const dx = pts[2 * i] - cx, dy = pts[2 * i + 1] - cy, u = dx * ux + dy * uy, v = -dx * uy + dy * ux;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      const j = (i + 1) % n; aire += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1];
    }
    const L = u1 - u0, Wd = v1 - v0, mc = (u0 + u1) / 2, nc = (v0 + v1) / 2;
    return { cx: cx + mc * ux - nc * uy, cy: cy + mc * uy + nc * ux, a, L, W: Wd, rect: Math.abs(aire / 2) / (L * Wd) > 0.7, aire: Math.abs(aire / 2) };
  }
  const chemin = (pts) => { let d = `M${pts[0]} ${pts[1]}`; for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`; return new Path2D(d + 'Z'); };

  /** la rue de tout près : les pavés, les toits un par un (tuiles, faîtage, velux, cheminées), la devanture vue d'en haut
      (le bois, la corniche fleurie et ses nichoirs, l'enseigne drapeau), la terrasse (tables, chaises, tasse, ardoise,
      fleurs) ; en décimètres autour de la boutique */
  function peindreRue(D, Rm, Z, dpr) {
    const N = Math.round(2 * Rm * Z), { c, x, r } = toile(N, dpr), k = (Z * r) / 10, h = (N * r) / 2;
    const dm = () => x.setTransform(k, 0, 0, k, h, h);
    const [fx1, fy1, fx2, fy2] = D.facade || [40, -18, -41, -20];
    const ux = (fx2 - fx1) / Math.hypot(fx2 - fx1, fy2 - fy1), uy = (fy2 - fy1) / Math.hypot(fx2 - fx1, fy2 - fy1);
    const Fx = (fx1 + fx2) / 2, Fy = (fy1 + fy2) / 2;
    let nx = -uy, ny = ux; // la normale, vers la rue
    if ((D.rue[0] - Fx) * nx + (D.rue[1] - Fy) * ny < 0) { nx = -nx; ny = -ny; }
    const P = (s, d) => [Fx + (ux * s + nx * d) * 10, Fy + (uy * s + ny * d) * 10]; // (mètres le long de la façade, vers la rue)
    const R = hasard(11);
    // 1) les pavés de la rue (un motif, dans le sens de la rue)
    const T = Math.max(8, Math.round(12 * k)), tuile = nouvelle(T, T);
    const tx = tuile.getContext('2d'), q = T / 12;
    tx.fillStyle = '#4C5258'; tx.fillRect(0, 0, T, T);
    const PAVES = ['#6F767D', '#7C8389', '#666D74', '#858B90', '#737A80', '#5F666D', '#8A8680', '#7A756F'];
    for (let row = 0; row < 6; row++) {
      const ls = []; let tot = 0;
      while (tot < 12) { const l = 2.3 + R() * 1.2; ls.push(l); tot += l; }
      const kk = 12 / tot; let xx = R() * 12;
      ls.forEach((l0) => {
        const l = l0 * kk;
        [xx, xx - 12].forEach((x0) => {
          tx.fillStyle = PAVES[Math.floor(R() * PAVES.length)];
          const rx = (x0 + 0.12) * q, ry = (row * 2 + 0.12) * q, rw = (l - 0.24) * q, rh = 1.76 * q, rr = Math.min(rw, rh) * 0.35;
          tx.beginPath(); tx.moveTo(rx + rr, ry); tx.arcTo(rx + rw, ry, rx + rw, ry + rh, rr); tx.arcTo(rx + rw, ry + rh, rx, ry + rh, rr); tx.arcTo(rx, ry + rh, rx, ry, rr); tx.arcTo(rx, ry, rx + rw, ry, rr); tx.fill();
          tx.fillStyle = 'rgba(255,255,255,.07)'; tx.fillRect(rx + rr * 0.6, ry + rh * 0.12, rw - rr * 1.2, rh * 0.22);
        });
        xx = (xx + l) % 12;
      });
    }
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.translate(h, h); x.rotate(Math.atan2(uy, ux));
    x.fillStyle = x.createPattern(tuile, 'repeat'); x.fillRect(-2 * h, -2 * h, 4 * h, 4 * h); x.restore();
    dm();
    // 2) les maisons : leurs ombres sur la rue, puis leurs toits
    const maisons = D.proches.map((b) => ({ ...b, chemin: chemin(b.p), axe: axe(b.p) }));
    x.fillStyle = 'rgba(28,22,20,.36)';
    maisons.forEach((b) => { x.save(); x.translate(5, 8); x.fill(b.chemin); x.restore(); });
    maisons.forEach((b) => {
      const A = b.axe, col = b.b ? '#CD7550' : TUILES[b.i % TUILES.length];
      x.fillStyle = col; x.fill(b.chemin);
      x.save(); x.clip(b.chemin);
      x.translate(A.cx, A.cy); x.rotate(A.a);
      const E2 = Math.max(A.L, A.W) / 2 + 6;
      for (let v = -E2; v < E2; v += 2.8) { // les rangées de tuiles, le long du faîtage
        x.fillStyle = (Math.round(v / 2.8) % 2) ? 'rgba(255,214,186,.14)' : 'rgba(92,34,18,.2)';
        x.fillRect(-E2, v, 2 * E2, 1.3);
      }
      x.fillStyle = 'rgba(92,34,18,.1)';
      for (let u = -E2; u < E2; u += 1.9) x.fillRect(u, -E2, 0.35, 2 * E2);
      if (A.rect) { // le faîtage
        const demi = Math.max(0, (A.L - A.W * 0.55) / 2);
        x.fillStyle = 'rgba(240,172,132,.85)'; x.fillRect(-demi, -1.1, 2 * demi, 2.2);
        x.fillStyle = 'rgba(110,44,26,.45)'; x.fillRect(-demi, 1.1, 2 * demi, 0.6);
      }
      // les velux (deux sur le toit de la boutique, comme sur la photo) et une cheminée
      const nv = b.b ? 2 : A.aire > 400 ? 1 + (b.i % 2) : A.aire > 200 ? b.i % 2 : 0;
      for (let j = 0; j < nv; j++) {
        const u = (nv === 1 ? 0 : (j ? 0.24 : -0.24)) * A.L + ((b.i * 7) % 5 - 2), v = (b.i % 2 ? 1 : -1) * A.W * 0.24;
        x.save(); x.translate(u, v);
        x.fillStyle = 'rgba(30,24,22,.3)'; x.fillRect(-3.4, -5, 8, 11);
        x.fillStyle = '#E6E9E8'; x.fillRect(-4, -5.5, 8, 11);
        const g = x.createLinearGradient(-3, -4.5, 3, 4.5); g.addColorStop(0, '#9CB3C1'); g.addColorStop(1, '#5F7788');
        x.fillStyle = g; x.fillRect(-3, -4.5, 6, 9);
        x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(-3, -4.5, 1.2, 9);
        x.restore();
      }
      if (A.aire > 250 && b.i % 3 !== 0) {
        const u = ((b.i * 13) % 7 - 3) / 10 * A.L, v = (b.i % 2 ? -1 : 1) * A.W * 0.18;
        x.save(); x.translate(u, v);
        x.fillStyle = 'rgba(30,24,22,.35)'; x.fillRect(-2, -1, 8, 8);
        x.fillStyle = '#C9C0AE'; x.fillRect(-3, -3, 7, 7);
        x.fillStyle = '#8E8676'; x.fillRect(-2, -2, 5, 5);
        x.fillStyle = '#5E574D'; x.fillRect(-1, -1, 1.4, 1.4); x.fillRect(1.2, -1, 1.4, 1.4);
        x.restore();
      }
      x.restore();
      x.lineWidth = 1.1; x.strokeStyle = 'rgba(110,48,28,.7)'; x.stroke(b.chemin);
    });
    // 3) la devanture vue d'en haut : le bois chocolat, la corniche garnie de branches, de mousse et de fleurs séchées,
    // les trois nichoirs, l'enseigne drapeau
    const poly = (pts) => { x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); };
    const boite = (s0, s1, d0, d1) => poly([P(s0, d0), P(s1, d0), P(s1, d1), P(s0, d1)]);
    x.fillStyle = 'rgba(28,22,20,.3)'; boite(-1.9, 1.9, 0, 0.62); x.fill(); // (l'ombre de la corniche sur la rue)
    x.fillStyle = '#3B2723'; boite(-1.84, 1.84, 0, 0.18); x.fill();
    x.fillStyle = '#6B4E44'; boite(-1.84, 1.84, 0.15, 0.2); x.fill();
    x.fillStyle = '#5E6E3C'; boite(-1.97, 1.97, 0.1, 0.44); x.fill();
    for (let i = 0; i < 220; i++) { // la mousse, les branches, les fleurs séchées
      const s = -1.95 + R() * 3.9, d = 0.12 + R() * 0.3, [px, py] = P(s, d);
      const t = R();
      if (t < 0.45) { x.fillStyle = ['#7A8C4B', '#586A36', '#8FA05A', '#6C7D41'][Math.floor(R() * 4)]; x.beginPath(); x.arc(px, py, 0.35 + R() * 0.45, 0, 7); x.fill(); }
      else if (t < 0.8) { const a = R() * 7, l = 0.9 + R() * 1.4; x.strokeStyle = ['#8C6B4A', '#6E5238', '#A48160'][Math.floor(R() * 3)]; x.lineWidth = 0.18; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
      else { x.fillStyle = ['#E7A3B6', '#B59AD6', '#EBC45C', '#F4F1EA', '#D96C8A'][Math.floor(R() * 5)]; x.beginPath(); x.arc(px, py, 0.22 + R() * 0.2, 0, 7); x.fill(); }
    }
    [-0.8, 0, 0.8].forEach((s, i) => { // les nichoirs, vus d'en haut : leurs petits toits à deux pans
      const cols = [['#C9D3D8', '#9FB0BA'], ['#F2EEE6', '#CFC8BB'], ['#B7C6CE', '#8FA3B0']][i];
      x.fillStyle = 'rgba(28,22,20,.3)'; boite(s - 0.1, s + 0.14, 0.16, 0.4); x.fill();
      x.fillStyle = cols[0]; boite(s - 0.12, s, 0.12, 0.36); x.fill();
      x.fillStyle = cols[1]; boite(s, s + 0.12, 0.12, 0.36); x.fill();
      x.strokeStyle = '#6E7D86'; x.lineWidth = 0.15; x.beginPath(); x.moveTo(...P(s, 0.12)); x.lineTo(...P(s, 0.36)); x.stroke();
    });
    x.strokeStyle = '#2B2A2C'; x.lineWidth = 0.35; x.beginPath(); x.moveTo(...P(1.9, 0.05)); x.lineTo(...P(1.9, 0.86)); x.stroke(); // la potence de l'enseigne
    x.fillStyle = 'rgba(28,22,20,.3)'; boite(1.9, 1.99, 0.32, 0.86); x.fill();
    x.fillStyle = '#35373B'; boite(1.86, 1.94, 0.26, 0.8); x.fill();
    // 4) la terrasse
    const ombre = (px, py, rr) => { x.fillStyle = 'rgba(28,22,20,.32)'; x.beginPath(); x.arc(px + 0.6, py + 0.9, rr, 0, 7); x.fill(); };
    const rond = (px, py, rr, col, bord) => { x.fillStyle = col; x.beginPath(); x.arc(px, py, rr, 0, 7); x.fill(); if (bord) { x.strokeStyle = bord; x.lineWidth = rr * 0.12; x.stroke(); } };
    function chaise([px, py], rot, col, lat) {
      x.save(); x.translate(px, py); x.rotate(Math.atan2(uy, ux) + rot);
      x.fillStyle = 'rgba(28,22,20,.3)'; x.fillRect(-1.7, -1.3, 4.3, 4.4);
      x.fillStyle = col; x.fillRect(-2.1, -2.1, 4.2, 4); // l'assise
      x.fillStyle = lat; for (let i = -1; i <= 1; i++) x.fillRect(-1.9, i * 1.25 - 0.2, 3.8, 0.4); // ses lattes
      x.fillStyle = lat; x.fillRect(-2.2, -2.9, 4.4, 0.8); // le dossier, côté façade
      x.restore();
    }
    const [tax, tay] = P(-1.6, 1.15); // la table menthe et sa tasse
    ombre(tax, tay, 3.3); rond(tax, tay, 3.2, '#9FD3D2', '#79B3B2');
    rond(tax + 0.4, tay - 0.3, 0.8, '#F7F2EA', '#DDD3C3'); rond(tax + 0.4, tay - 0.3, 0.5, '#FFFFFF'); rond(tax + 0.4, tay - 0.3, 0.38, '#5A3524');
    x.save(); x.translate(tax - 1.2, tay + 0.6); x.rotate(0.3); x.fillStyle = '#FBF7EF'; x.fillRect(-0.8, -0.55, 1.6, 1.1); x.fillStyle = '#C9B9A4'; x.fillRect(-0.55, -0.3, 1.1, 0.12); x.fillRect(-0.55, 0.05, 0.8, 0.12); x.restore();
    chaise(P(-1.0, 0.6), 0.2, '#9FD3D2', '#79B3B2');
    // l'ardoise des pâtisseries, en chevalet, devant la vitrine de gauche
    x.fillStyle = 'rgba(28,22,20,.3)'; boite(-1.06, -0.56, 0.38, 0.6); x.fill();
    x.fillStyle = '#9A6E47'; boite(-1.12, -0.6, 0.32, 0.5); x.fill();
    x.fillStyle = '#2E302E'; boite(-1.09, -0.63, 0.35, 0.47); x.fill();
    // les fleurs au pied de la vitrine de droite : les tulipes dans le seau, les marguerites dans le panier, le buis
    const [bx, by] = P(0.69, 0.2); ombre(bx, by, 1.3); rond(bx, by, 1.2, '#AEB7BC', '#8E989F');
    for (let i = 0; i < 7; i++) { const a = i * 0.9; x.fillStyle = i % 2 ? '#5C9A50' : '#4F8A45'; x.beginPath(); x.ellipse(bx + Math.cos(a) * 0.9, by + Math.sin(a) * 0.9, 0.9, 0.3, a, 0, 7); x.fill(); }
    [[0.3, -0.2, '#E0485C'], [-0.4, 0.3, '#F07A8A'], [0.1, 0.5, '#E0485C'], [-0.3, -0.5, '#F4A6B2']].forEach(([dx, dy, col]) => rond(bx + dx, by + dy, 0.42, col));
    const [px2, py2] = P(1.01, 0.22); ombre(px2, py2, 1.5); rond(px2, py2, 1.5, '#C8A06A', '#A8814F');
    for (let i = 0; i < 9; i++) { const a = i * 2.4, rr = 0.4 + (i % 3) * 0.35, qx = px2 + Math.cos(a) * rr, qy = py2 + Math.sin(a) * rr; rond(qx, qy, 0.36, '#FBF9F3'); rond(qx, qy, 0.13, '#E9B92C'); }
    const [ox, oy] = P(1.33, 0.22); ombre(ox, oy, 1.9); rond(ox, oy, 1.4, '#B86A45'); rond(ox, oy, 1.8, '#5E8A45'); rond(ox - 0.5, oy - 0.5, 0.9, '#7AA85A');
    chaise(P(1.7, 0.55), -0.18, '#E4B4AB', '#C99088'); // la chaise vieux rose
    const [mx, my] = P(2.35, 0.95); ombre(mx, my, 3.5); rond(mx, my, 3.4, '#E2C441', '#C3A52C'); // la table moutarde, un verre d'eau
    rond(mx - 0.6, my + 0.4, 0.4, '#DDEEF0', '#B9D2D6'); rond(mx - 0.72, my + 0.28, 0.12, '#FFFFFF');
    // le paillasson, devant la porte
    x.fillStyle = '#8A6B4F'; boite(-0.36, 0.36, 0.2, 0.52); x.fill();
    x.strokeStyle = '#6E543D'; x.lineWidth = 0.12; boite(-0.33, 0.33, 0.23, 0.49); x.stroke();
    fondu(x, N, r, 0.74);
    return c;
  }
  /** le soir : la lumière de la boutique sur les pavés (au-dessus du voile, en mode « écran ») */
  function peindreLueur(D, Rm, Z, dpr) {
    const N = Math.round(2 * Rm * Z), { c, x, r } = toile(N, dpr), k = (Z * r) / 10, h = (N * r) / 2;
    x.setTransform(k, 0, 0, k, h, h);
    const [fx1, fy1, fx2, fy2] = D.facade || [40, -18, -41, -20];
    const L = Math.hypot(fx2 - fx1, fy2 - fy1), ux = (fx2 - fx1) / L, uy = (fy2 - fy1) / L, Fx = (fx1 + fx2) / 2, Fy = (fy1 + fy2) / 2;
    let nx = -uy, ny = ux;
    if ((D.rue[0] - Fx) * nx + (D.rue[1] - Fy) * ny < 0) { nx = -nx; ny = -ny; }
    const P = (s, d) => [Fx + (ux * s + nx * d) * 10, Fy + (uy * s + ny * d) * 10];
    [[0, 1.2, 26, 0.75], [-1.2, 0.9, 16, 0.4], [1.2, 0.9, 16, 0.4]].forEach(([s, d, rr, a]) => {
      const [px, py] = P(s, d), g = x.createRadialGradient(px, py, 0, px, py, rr);
      g.addColorStop(0, `rgba(255,208,140,${a})`); g.addColorStop(0.5, `rgba(255,190,110,${a * 0.4})`); g.addColorStop(1, 'rgba(255,190,110,0)');
      x.fillStyle = g; x.fillRect(px - rr, py - rr, 2 * rr, 2 * rr);
    });
    return c;
  }
  /** les toits du quartier (moins de détail, plus loin) */
  function peindreToits(D, Rm, Z, dpr) {
    const N = Math.round(2 * Rm * Z), { c, x, r } = toile(N, dpr), k = (Z * r) / 10;
    x.setTransform(k, 0, 0, k, (N * r) / 2, (N * r) / 2);
    const E = 10 * Rm, P2 = (d) => new Path2D(d || 'M0 0');
    x.fillStyle = '#6A6F74'; x.fillRect(-E, -E, 2 * E, 2 * E); // le pavé des rues
    x.fillStyle = '#7E8388'; x.fill(P2(D.places), 'evenodd'); // les places
    x.fillStyle = '#86A868'; x.fill(P2(D.parcs), 'evenodd'); // les jardins
    x.save(); x.translate(8, 12); x.fillStyle = 'rgba(28,22,20,.34)'; x.fill(P2(D.ombres), 'evenodd'); x.restore(); // les ombres portées
    x.lineJoin = 'round'; x.lineWidth = 2.5; x.strokeStyle = 'rgba(112,48,28,.6)';
    D.toits.forEach((d, i) => { const p = P2(d); x.fillStyle = TUILES[i % TUILES.length]; x.fill(p, 'evenodd'); x.stroke(p); });
    x.lineCap = 'round'; x.lineWidth = 5; x.strokeStyle = 'rgba(238,168,124,.85)'; x.stroke(P2(D.faitages));
    x.lineWidth = 1.8; x.strokeStyle = 'rgba(120,52,32,.5)'; x.stroke(P2(D.faitages));
    const cu = P2(D.cultes); // la cathédrale et la chapelle : la pierre noire de Volvic
    x.fillStyle = '#4A4950'; x.fill(cu, 'evenodd'); x.lineWidth = 3; x.strokeStyle = '#2C2B30'; x.stroke(cu);
    if (D.boutique) { const b = P2(D.boutique); x.fillStyle = '#D4805A'; x.fill(b, 'evenodd'); x.lineWidth = Math.max(4, 16 / Z); x.strokeStyle = '#2E767E'; x.stroke(b); }
    for (let i = 0; i < D.arbres.length; i += 2) {
      const ax = D.arbres[i], ay = D.arbres[i + 1];
      x.fillStyle = 'rgba(28,22,20,.28)'; x.beginPath(); x.arc(ax + 8, ay + 11, 24, 0, 7); x.fill();
      x.fillStyle = '#5E8045'; x.beginPath(); x.arc(ax, ay, 24, 0, 7); x.fill();
      x.fillStyle = '#86A860'; x.beginPath(); x.arc(ax - 7, ay - 7, 12, 0, 7); x.fill();
    }
    fondu(x, N, r, 0.74);
    return c;
  }
  function peindrePlan(D, Rm, Z, dpr) {
    const N = Math.round(2 * Rm * Z), { c, x, r } = toile(N, dpr), k = (Z * r) / 10;
    const pose = (ctx) => ctx.setTransform(k, 0, 0, k, (N * r) / 2, (N * r) / 2);
    pose(x);
    const E = 10 * Rm, P2 = (d) => new Path2D(d || 'M0 0');
    x.fillStyle = '#F1E9DA'; x.fillRect(-E, -E, 2 * E, 2 * E);
    x.fillStyle = '#C9DCB2'; x.fill(P2(D.parcs), 'evenodd');
    x.fillStyle = '#E7DCC8'; x.fill(P2(D.places), 'evenodd');
    // les maisons du vieux centre (autour de la boutique), qui s'effacent vers le bord de ce qu'on en connaît
    const b = nouvelle(c.width, c.height);
    const bx = b.getContext('2d'); pose(bx);
    bx.fillStyle = '#DFD2BE'; bx.fill(P2(D.ombres), 'evenodd');
    bx.setTransform(1, 0, 0, 1, 0, 0);
    bx.globalCompositeOperation = 'destination-in';
    const h = (N * r) / 2, rb = (190 / Rm) * h, gb = bx.createRadialGradient(h, h, rb * 0.72, h, h, rb);
    gb.addColorStop(0, 'rgba(0,0,0,1)'); gb.addColorStop(1, 'rgba(0,0,0,0)');
    bx.fillStyle = gb; bx.fillRect(0, 0, b.width, b.height);
    x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(b, 0, 0); pose(x);
    b.width = b.height = 1;
    x.lineCap = 'round'; x.lineJoin = 'round'; // les rues : les bordures, puis la chaussée ; les ruelles en tirets ; le tram
    const trait = (d, w, col, tirets) => { x.lineWidth = w; x.strokeStyle = col; x.setLineDash(tirets || []); x.stroke(P2(d)); };
    trait(D.rues.chemins, 14, '#C2B196', [34, 26]);
    trait(D.rues.pietonnes, 80, '#D7C8AE'); trait(D.rues.rues, 96, '#D1C1A6'); trait(D.rues.grandes, 132, '#D3AA62');
    trait(D.rues.pietonnes, 58, '#FBF6EC'); trait(D.rues.rues, 72, '#FFFFFF'); trait(D.rues.grandes, 104, '#FCE6AE');
    trait(D.tram, 26, '#2E767E');
    x.fillStyle = '#6D6771'; x.fill(P2(D.cultes), 'evenodd');
    fondu(x, N, r, 0.8);
    return c;
  }

  self.ACVillePeintre = { rue: peindreRue, lueur: peindreLueur, toits: peindreToits, plan: peindrePlan };
})();
