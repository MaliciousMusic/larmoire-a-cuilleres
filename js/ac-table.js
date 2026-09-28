/* ==========================================================================
   L'Armoire à Cuillères — la table du goûter (onglet « Carte »)
   Vue de dessus, comme leurs photos : table en bois peint menthe, nappe de lin,
   set en rotin, une assiette ancienne avec la part de gâteau, la tasse sur sa
   soucoupe. Les objets viennent des moteurs de rendu (ac-vaisselle.js pour la
   vaisselle et les boissons, ac-gateaux.js pour les gâteaux) ; sans eux, un
   rendu de secours simple.
   Service : même contenant → fondu (seul le chocolat change) ; sinon la tasse
   glisse et une autre arrive. Vapeur en SVG au-dessus des boissons chaudes.
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});

  const W_MM = 380; // largeur de table visible
  let host, cv, ctx, vie, ro;
  let size = { w: 0, h: 0, dpr: 1, ppm: 1, H_MM: 380 };
  let fond = null; // table + nappe + set (canvas de la taille de l'écran)
  let visible = false;
  const S = {
    boisson: { id: null, sprite: null, prev: null, t: 1, mode: 'fondu', froid: false, contenant: null },
    gateau: { id: null, sprite: null, prev: null, t: 1 },
    plate: null,
  };
  let raf = 0;

  /* ---------- positions (mm, repère de la table) ---------- */
  const POS = {
    plate: () => [W_MM * 0.33, size.H_MM * 0.62],
    cup: () => [W_MM * 0.72, size.H_MM * 0.36],
  };

  /* ---------- données boissons (chaud / froid, contenant) ---------- */
  function infoBoisson(id) {
    const L = AC.Boissons && AC.Boissons.liste;
    const e = L ? L.find((b) => b.id === id) : null;
    const it = AC.ITEMS ? AC.ITEMS[id] : null;
    const c = e ? (e.contenant || e.style || '') : '';
    // le contenant peut être une chaîne ou un objet { type, style, motif, … } : on en fait une clé comparable
    const cle = typeof c === 'object' ? [c.type, c.style, c.motif, c.soucoupe].join('/') : String(c);
    const froid = !!((e && (e.froid || /verre|glace|gobelet|bocal/.test(cle))) || (it && it.froid) || /glace|soda|jus|citronnade|sirop|frappe|lait-speculoos/.test(id));
    return { froid, contenant: cle || (froid ? 'verre' : 'tasse') };
  }

  /* ======================================================================
     Rendus de secours (si les moteurs ne sont pas chargés)
     ====================================================================== */
  function secoursFond(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#9FCFCF';
    x.fillRect(0, 0, w, h);
    const pl = Math.max(40, w / 4.2);
    for (let i = 0; i * pl < w + pl; i++) {
      x.fillStyle = i % 2 ? 'rgba(0,0,0,.03)' : 'rgba(255,255,255,.04)';
      x.fillRect(i * pl, 0, pl, h);
      x.fillStyle = 'rgba(40,70,70,.18)';
      x.fillRect(i * pl, 0, 1.5, h);
    }
    return c;
  }
  function secoursSprite(kind, id, ppm) {
    const mm = kind === 'plate' ? 210 : kind === 'boisson' ? 150 : 110;
    const px = Math.round(mm * ppm);
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const x = c.getContext('2d');
    const r = px / 2;
    x.translate(r, r);
    if (kind === 'plate') {
      const g = x.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      g.addColorStop(0, '#FFFDF8'); g.addColorStop(1, '#E9E1D2');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, r * 0.95, 0, 7); x.fill();
      x.strokeStyle = '#3E5E9C'; x.lineWidth = r * 0.07; x.globalAlpha = 0.35; x.beginPath(); x.arc(0, 0, r * 0.8, 0, 7); x.stroke();
    } else if (kind === 'boisson') {
      x.fillStyle = '#F6F1E8'; x.beginPath(); x.arc(0, 0, r * 0.92, 0, 7); x.fill();
      x.fillStyle = '#FFFCF6'; x.beginPath(); x.arc(0, 0, r * 0.6, 0, 7); x.fill();
      const cru = AC.CRUS.find((q) => q.id === id);
      x.fillStyle = cru ? cru.couleur : '#6A4027'; x.beginPath(); x.arc(0, 0, r * 0.5, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(-r * 0.15, -r * 0.2, r * 0.18, r * 0.07, -0.6, 0, 7); x.fill();
    } else {
      x.fillStyle = id && /cheese|citron/.test(id) ? '#F3E6CF' : '#4A2A1C';
      x.beginPath(); x.moveTo(0, -r * 0.8); x.lineTo(r * 0.55, r * 0.6); x.lineTo(-r * 0.55, r * 0.6); x.closePath(); x.fill();
    }
    return { canvas: c, shadow: null, w: mm, h: mm, ax: mm / 2, ay: mm / 2 };
  }

  /* ======================================================================
     Fabrication des objets (moteurs réels si présents)
     ====================================================================== */
  function makeFond() {
    const w = Math.round(size.w * size.dpr), h = Math.round(size.h * size.dpr), ppm = size.ppm;
    const V = AC.Vaisselle;
    if (!V || !V.table) return secoursFond(w, h);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    try {
      const t = V.table({ bois: 'menthe', w: W_MM, h: size.H_MM, seed: 5 }, ppm);
      x.drawImage(t, 0, 0, w, h);
      if (V.nappe) { // un chemin de lin en travers, sous la tasse
        const n = V.nappe({ w: 150, h: size.H_MM * 1.5, seed: 9 }, ppm);
        x.save();
        x.translate(W_MM * 0.74 * ppm, size.H_MM * 0.5 * ppm);
        x.rotate(0.1);
        x.shadowColor = 'rgba(40,30,20,.25)'; x.shadowBlur = 6 * ppm; x.shadowOffsetX = 2 * ppm; x.shadowOffsetY = 3 * ppm;
        x.drawImage(n, -n.width / 2, -n.height / 2);
        x.restore();
      }
      if (V.rotin) {
        const r = V.rotin({ d: 300, seed: 3 }, ppm);
        const [px, py] = POS.plate();
        AC.R.draw(x, r, px * ppm, py * ppm);
      }
    } catch (e) {
      console.warn('table', e);
      return secoursFond(w, h);
    }
    return c;
  }
  function makePlate() {
    const V = AC.Vaisselle;
    try { if (V && V.assiette) return V.assiette({ motif: 'bleu', d: 200, chantourne: true, seed: 12 }, size.ppm); } catch (e) { console.warn('assiette', e); }
    return secoursSprite('plate', null, size.ppm);
  }
  function makeBoisson(id) {
    const B = AC.Boissons;
    try { if (B && B.servir) return B.servir(id, { seed: 4 }, size.ppm); } catch (e) { console.warn('boisson', id, e); }
    return secoursSprite('boisson', id, size.ppm);
  }
  function makeGateau(id) {
    const G = AC.Gateaux;
    try { if (G && G.rendre) return G.rendre(id, { seed: 7, angle: -0.35 }, size.ppm); } catch (e) { console.warn('gâteau', id, e); }
    return secoursSprite('gateau', id, size.ppm);
  }

  /* ======================================================================
     Dessin
     ====================================================================== */
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  function drawSprite(sp, xmm, ymm, { s = 1, a = 1, rot = 0, dx = 0, dy = 0 } = {}) {
    if (!sp || a <= 0.001) return;
    const p = size.ppm;
    AC.R ? AC.R.draw(ctx, sp, (xmm + dx) * p, (ymm + dy) * p, { s, alpha: a, rot }) : ctx.drawImage(sp.canvas, (xmm + dx) * p - sp.canvas.width / 2, (ymm + dy) * p - sp.canvas.height / 2);
  }

  function draw() {
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    if (fond) ctx.drawImage(fond, 0, 0);
    const [px, py] = POS.plate(), [cx, cy] = POS.cup();
    // assiette + gâteau
    drawSprite(S.plate, px, py);
    const G = S.gateau;
    if (G.prev && G.t < 1) drawSprite(G.prev, px, py, { a: 1 - easeOut(Math.min(1, G.t * 1.6)), s: 1 + 0.05 * G.t, dy: -6 * G.t });
    if (G.sprite) {
      const t = Math.min(1, G.t);
      drawSprite(G.sprite, px, py, { a: Math.min(1, t * 2.2), s: 0.9 + 0.1 * easeBack(t), dy: (1 - easeOut(t)) * -14 });
    }
    // la boisson
    const B = S.boisson;
    if (B.mode === 'fondu') {
      if (B.prev && B.t < 1) drawSprite(B.prev, cx, cy);
      if (B.sprite) drawSprite(B.sprite, cx, cy, { a: B.prev ? easeOut(Math.min(1, B.t)) : 1 });
    } else { // glissé : l'ancienne sort à droite, la nouvelle arrive
      const t = Math.min(1, B.t);
      if (B.prev && t < 0.5) drawSprite(B.prev, cx, cy, { dx: easeOut(t * 2) * 220, a: 1 - t * 1.6 });
      if (B.sprite && t >= 0.35) {
        const u = Math.min(1, (t - 0.35) / 0.65);
        drawSprite(B.sprite, cx, cy, { dx: (1 - easeBack(u)) * 200, a: Math.min(1, u * 2) });
      }
    }
  }

  function animate() {
    cancelAnimationFrame(raf);
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      let busy = false;
      [S.boisson, S.gateau].forEach((o) => {
        if (o.t < 1) { o.t = Math.min(1, o.t + dt / (o === S.boisson ? (o.mode === 'fondu' ? 0.7 : 1.1) : 0.65)); busy = true; }
        if (o.t >= 1) o.prev = null;
      });
      draw();
      if (busy) raf = requestAnimationFrame(step);
      else steamPlace();
    };
    raf = requestAnimationFrame(step);
  }

  /* ---------- la vapeur (SVG par-dessus le canvas) ---------- */
  let steamG = null;
  function buildSteam() {
    vie.innerHTML = '';
    const svg = AC.svg('svg', { viewBox: `0 0 ${size.w} ${size.h}`, preserveAspectRatio: 'none' }, vie);
    const f = AC.uid('bl');
    const flt = AC.svg('filter', { id: f, x: '-50%', y: '-50%', width: '200%', height: '200%' }, AC.svg('defs', {}, svg));
    AC.svg('feGaussianBlur', { stdDeviation: 2.2 }, flt);
    steamG = AC.svg('g', { class: 'tg-vapeur', filter: `url(#${f})`, opacity: 0 }, svg);
    for (let k = 0; k < 4; k++) {
      const w = AC.svg('path', { d: `M${k * 9 - 13} 0c-8 -14 8 -22 0 -36s8 -22 0 -36`, fill: 'none', stroke: '#fff', 'stroke-width': 5, 'stroke-linecap': 'round', opacity: 0 }, steamG);
      if (!AC.reduced) w.animate([
        { opacity: 0, transform: 'translate(0,6px) scale(.7,.8)' },
        { opacity: 0.42, offset: 0.35 },
        { opacity: 0, transform: `translate(${k % 2 ? 7 : -6}px,-38px) scale(1.25,1.3)` },
      ], { duration: 2800 + k * 380, delay: k * 650, iterations: Infinity, easing: 'ease-out' });
      else w.setAttribute('opacity', 0.25);
    }
  }
  function steamPlace() {
    if (!steamG) return;
    let [cx, cy] = POS.cup();
    // au-dessus du liquide lui-même (la tasse est vue un peu de biais : son ouverture remonte dans l'image)
    const sp = S.boisson.sprite, inn = sp && sp.inner;
    if (inn && inn.cx != null) { cx += inn.cx - sp.ax; cy += inn.cy - sp.ay; }
    else cy -= 8;
    const k = size.ppm / size.dpr; // px CSS par mm
    steamG.setAttribute('transform', `translate(${(cx * k).toFixed(1)} ${(cy * k).toFixed(1)}) scale(${Math.max(0.7, k * 1.1).toFixed(2)})`);
    steamG.style.transition = 'opacity .8s ease';
    steamG.style.opacity = S.boisson.froid ? '0' : '1';
  }

  /* ======================================================================
     Mise en page
     ====================================================================== */
  function resize() {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    size = { w: r.width, h: r.height, dpr, ppm: (r.width * dpr) / W_MM, H_MM: (r.height / r.width) * W_MM };
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    fond = makeFond();
    S.plate = makePlate();
    if (S.boisson.id) { S.boisson.sprite = makeBoisson(S.boisson.id); S.boisson.prev = null; S.boisson.t = 1; }
    if (S.gateau.id) { S.gateau.sprite = makeGateau(S.gateau.id); S.gateau.prev = null; S.gateau.t = 1; }
    buildSteam();
    draw();
    steamPlace();
    return true;
  }

  function pret() {
    if (!visible) return false;
    if (!size.w) return resize();
    return true;
  }

  /* précalcul en temps mort (l'onglet n'est pas encore ouvert) : on devine sa taille et on remplit les caches
     des moteurs de rendu, pour que la table s'affiche tout de suite à la première visite */
  function prechauffer() {
    if (visible || size.w) return;
    const main = document.querySelector('main');
    if (!main) return;
    const w = main.clientWidth, h = Math.min(w * 0.96, 420);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const ppm = (w * dpr) / W_MM;
    const etapes = [
      () => AC.Vaisselle && AC.Vaisselle.assiette && makePlateAt(ppm),
      () => S.gateau.id && AC.Gateaux && AC.Gateaux.rendre(S.gateau.id, { seed: 7, angle: -0.35 }, ppm),
      () => S.boisson.id && AC.Boissons && AC.Boissons.servir(S.boisson.id, { seed: 4 }, ppm),
      () => AC.Vaisselle && AC.Vaisselle.rotin && AC.Vaisselle.rotin({ d: 300, seed: 3 }, ppm),
    ];
    void h;
    const suite = () => {
      const f = etapes.shift();
      if (!f || visible) return;
      try { f(); } catch (e) { /* on réessaiera à l'ouverture */ }
      (window.requestIdleCallback || ((cb) => setTimeout(cb, 60)))(suite, { timeout: 800 });
    };
    suite();
  }
  function makePlateAt(ppm) { return AC.Vaisselle.assiette({ motif: 'bleu', d: 200, chantourne: true, seed: 12 }, ppm); }

  AC.table = {
    prechauffer,
    init(el) {
      host = el;
      cv = el.querySelector('canvas');
      ctx = cv.getContext('2d');
      vie = el.querySelector('.tg-vie');
      let t = 0;
      ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { if (visible) resize(); }, 120); });
      ro.observe(el);
    },
    /** l'onglet carte s'ouvre : on calcule (une fois) */
    reveil() {
      if (visible) return;
      visible = true;
      requestAnimationFrame(() => {
        resize();
        // les douze crus, préparés en temps mort : le nuancier répond tout de suite
        if (AC.Vaisselle && AC.Vaisselle.prechauffer) setTimeout(() => { try { AC.Vaisselle.prechauffer(AC.CRUS.map((c) => c.id), size.ppm); } catch (e) { /* rien */ } }, 900);
      });
    },
    boisson(id, { silencieux } = {}) {
      const B = S.boisson;
      if (B.id === id) return;
      const info = infoBoisson(id);
      const memeContenant = B.id && B.contenant === info.contenant;
      B.id = id;
      B.froid = info.froid;
      B.contenant = info.contenant;
      if (!pret()) return;
      B.prev = B.sprite;
      B.sprite = makeBoisson(id);
      B.t = 0;
      B.mode = memeContenant || !B.prev ? 'fondu' : 'glisse';
      if (!silencieux && AC.sfx) {
        if (B.mode === 'fondu') AC.sfx.play(info.froid ? 'ice' : 'stir', { n: 2 });
        else { AC.sfx.play('clink', { delay: 520 }); if (info.froid) AC.sfx.play('ice', { delay: 700 }); }
      }
      animate();
    },
    gateau(id, { silencieux } = {}) {
      const G = S.gateau;
      if (G.id === id) return;
      G.id = id;
      if (!pret()) return;
      G.prev = G.sprite;
      G.sprite = makeGateau(id);
      G.t = 0;
      if (!silencieux && AC.sfx) AC.sfx.play('plate', { delay: 250 });
      animate();
    },
  };
})();
