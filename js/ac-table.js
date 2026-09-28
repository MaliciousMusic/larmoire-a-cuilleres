/* ==========================================================================
   L'Armoire à Cuillères — la table du goûter (onglet « Carte »)
   Vue de dessus, comme leurs photos : table en bois peint menthe, nappe de lin,
   set en rotin, une assiette ancienne avec la part de gâteau, la tasse sur sa
   soucoupe. Les objets se calculent dans l'atelier (js/ac-atelier.js : un Worker,
   la page ne se fige jamais ; sinon les moteurs se chargent dans la page, à la
   demande) ; si rien ne vient, un rendu de secours simple.
   Service : même contenant → fondu (seul le chocolat change) ; sinon la tasse
   glisse et une autre arrive. Vapeur en SVG au-dessus des boissons chaudes.
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});

  const W_MM = 380; // largeur de table visible
  // ce qui est servi, toujours pareil (les caches de l'atelier se retrouvent d'une visite de l'onglet à l'autre)
  const ASSIETTE = { motif: 'bleu', d: 200, chantourne: true, seed: 12 };
  const ROTIN = { d: 300, seed: 3 };
  const BOISSON = { seed: 4 };
  const GATEAU = { seed: 7, angle: -0.35 };
  let host, cv, ctx, vie, ro;
  let size = { w: 0, h: 0, dpr: 1, ppm: 1, H_MM: 380, V_MM: 350 };
  let fond = null; // table + nappe + set (une image de la taille de l'écran)
  let visible = false;
  const S = {
    boisson: { id: null, sprite: null, prev: null, t: 1, mode: 'fondu', froid: false, contenant: null, jeton: 0 },
    gateau: { id: null, sprite: null, prev: null, t: 1, jeton: 0 },
    plate: null,
  };
  let raf = 0;

  /* ---------- l'atelier : les rendus se calculent dans un Worker (js/ac-atelier.js) ; sans Worker (file://,
     vieux navigateur) ou s'il échoue, le même atelier se charge dans la page, avec les moteurs ---------- */
  const VER = (() => { const s = document.currentScript; return s && s.src ? new URL(s.src, location.href).search : ''; })();
  const atelier = (() => {
    let w = null, n = 0, local = null, essaye = false;
    const attente = new Map();
    function surPlace() {
      if (!local) local = AC.charge(['ac-rendu.js', 'ac-vaisselle.js', 'ac-gateaux.js', 'ac-atelier.js']).then(() => AC.atelierLocal);
      return local;
    }
    // sur place, un calcul à la fois, dans les temps morts pour les précalculs
    let file = Promise.resolve();
    const calculeIci = (op, args, tranquille) => (file = file.then(() => surPlace()).then((L) => new Promise((ok, ko) => {
      const go = () => { try { ok(L.traite(op, args)); } catch (e) { ko(e); } };
      if (tranquille) AC.ric(go, { timeout: 1500 }); else go();
    })));
    function abandon() {
      if (w) { try { w.terminate(); } catch (e) { /* déjà fini */ } }
      w = null;
      attente.forEach((p) => calculeIci(p.op, p.args).then(p.ok, p.ko));
      attente.clear();
    }
    function ouvrir() {
      essaye = true;
      try {
        if (!window.Worker || !window.OffscreenCanvas || location.protocol === 'file:') return;
        w = new Worker('js/ac-atelier.js' + VER);
        w.onmessage = (e) => {
          const r = e.data, p = attente.get(r.n);
          if (!p) return;
          attente.delete(r.n);
          if (r.ok) p.ok(r.res);
          else abandon(); // il calcule mais ne sait pas rendre ses images (un Safari…) : on fait tout ici
          if (!r.ok) calculeIci(p.op, p.args).then(p.ok, p.ko);
        };
        // le Worker n'a pas pu démarrer (moteurs introuvables, OffscreenCanvas incomplet…) : tout se refait ici
        w.onerror = (e) => {
          if (e && e.preventDefault) e.preventDefault();
          abandon();
        };
      } catch (e) { w = null; }
    }
    return {
      /** → Promise du résultat ; tranquille : un précalcul (pas de réponse, après les demandes de la page) */
      demande(op, args, tranquille) {
        if (!essaye) ouvrir();
        if (!w) return calculeIci(op, args, tranquille);
        if (tranquille) { w.postMessage({ op, args, tranquille: true }); return Promise.resolve(null); }
        return new Promise((ok, ko) => {
          const i = ++n;
          attente.set(i, { ok, ko, op, args });
          w.postMessage({ n: i, op, args });
        });
      },
    };
  })();

  /* ---------- positions (mm, repère de la table) : dans la partie visible, au-dessus du bandeau (V_MM) ---------- */
  const POS = {
    plate: () => [W_MM * 0.33, size.V_MM * 0.62],
    cup: () => [W_MM * 0.72, size.V_MM * 0.36],
  };

  /* ---------- données boissons (chaud / froid, contenant) : la liste vient de l'atelier ---------- */
  let LISTE = null;
  function infoBoisson(id) {
    const e = LISTE ? LISTE.get(id) : null;
    const it = AC.ITEMS ? AC.ITEMS[id] : null;
    const froid = !!((e && e.froid) || (it && it.froid) || /glace|soda|jus|citronnade|sirop|frappe|lait-speculoos/.test(id));
    return { froid, contenant: (e && e.contenant) || (froid ? 'verre' : 'tasse') };
  }
  let listeDemandee = false;
  function demandeListe() {
    if (listeDemandee) return;
    listeDemandee = true;
    atelier.demande('liste', []).then((l) => { if (Array.isArray(l)) LISTE = new Map(l.map((e) => [e.id, e])); }).catch(() => {});
  }

  /* ======================================================================
     Rendus de secours (si l'atelier ne répond pas)
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
     Ce qu'on demande à l'atelier
     ====================================================================== */
  const demandeFond = () => atelier.demande('fond', [{ w: cv.width, h: cv.height, ppm: size.ppm, hMM: size.H_MM, rotin: POS.plate() }]).then((r) => r.canvas).catch(() => secoursFond(cv.width, cv.height));
  const demandeAssiette = (ppm) => atelier.demande('assiette', [ASSIETTE, ppm]).catch(() => secoursSprite('plate', null, ppm));
  const demandeBoisson = (id, ppm) => atelier.demande('servir', [id, BOISSON, ppm]).catch(() => secoursSprite('boisson', id, ppm));
  const demandeGateau = (id, ppm) => atelier.demande('gateau', [id, GATEAU, ppm]).catch(() => secoursSprite('gateau', id, ppm));

  /** Une image de l'atelier dont on ne se sert plus : rendue tout de suite (ImageBitmap), sans attendre le ramasse-miettes */
  function libere(sp) {
    const B = S.boisson, G = S.gateau;
    if (!sp || sp === S.plate || sp === B.sprite || sp === B.prev || sp === G.sprite || sp === G.prev) return; // encore dessinée
    [sp.canvas, sp.shadow].forEach((c) => { if (c && typeof c.close === 'function') c.close(); });
  }

  /* ======================================================================
     Dessin
     ====================================================================== */
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  /** Pose un sprite centré sur (x, y) mm, avec son ombre (comme AC.R.draw), à l'échelle de la table */
  function drawSprite(sp, xmm, ymm, { s = 1, a = 1, rot = 0, dx = 0, dy = 0 } = {}) {
    if (!sp || !sp.canvas || a <= 0.001) return;
    const p = size.ppm, k = sp.canvas.width / sp.w; // pixels par mm du sprite
    ctx.save();
    ctx.translate((xmm + dx) * p, (ymm + dy) * p);
    if (rot) ctx.rotate(rot);
    ctx.scale((s * p) / k, (s * p) / k);
    ctx.globalAlpha = a;
    const ox = -sp.ax * k, oy = -sp.ay * k;
    if (sp.shadow) ctx.drawImage(sp.shadow, ox, oy);
    ctx.drawImage(sp.canvas, ox, oy);
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    if (fond) ctx.drawImage(fond, 0, 0, W, H);
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
        if (o.t >= 1 && o.prev) { const p = o.prev; o.prev = null; libere(p); }
      });
      draw();
      if (busy) raf = requestAnimationFrame(step);
      else steamPlace();
    };
    raf = requestAnimationFrame(step);
  }

  /* ---------- la vapeur, par-dessus le canvas : quatre volutes floutées, chacune sur son propre <svg> (un calque :
     le compositeur l'anime, le flou n'est calculé qu'une fois), dans un groupe posé sur la tasse ---------- */
  let steamG = null;
  function buildSteam() {
    vie.innerHTML = '';
    steamG = document.createElement('div');
    steamG.className = 'tg-vapeur';
    steamG.style.display = 'none'; // (jusqu'à ce qu'une tasse chaude soit posée : steamPlace)
    vie.appendChild(steamG);
    const fid = AC.uid('bl');
    for (let k = 0; k < 4; k++) {
      const svg = AC.svg('svg', { class: 'tg-volute', viewBox: '-40 -84 80 96', width: 80, height: 96, 'aria-hidden': 'true' }, steamG);
      const flt = AC.svg('filter', { id: fid + k, x: '-50%', y: '-50%', width: '200%', height: '200%' }, AC.svg('defs', {}, svg));
      AC.svg('feGaussianBlur', { stdDeviation: 2.2 }, flt);
      AC.svg('path', { d: `M${k * 9 - 13} 0c-8 -14 8 -22 0 -36s8 -22 0 -36`, fill: 'none', stroke: '#fff', 'stroke-width': 5, 'stroke-linecap': 'round', filter: `url(#${fid + k})` }, svg);
      // (la scène de ces animations : le groupe lui-même. Caché (boisson froide), il sort de l'écran pour l'ambiance, qui
      // les met en pause : une animation qui ne se voit pas, Chrome la ferait tourner sur le fil principal)
      if (!AC.reduced) AC.ambiance.joue(svg.animate([
        { opacity: 0, transform: 'translate(0px, 6px) scale(.7, .8)' },
        { opacity: 0.42, offset: 0.35 },
        { opacity: 0, transform: `translate(${k % 2 ? 7 : -6}px, -38px) scale(1.25, 1.3)` },
      ], { duration: 2800 + k * 380, delay: k * 650, iterations: Infinity, easing: 'ease-out', fill: 'backwards' }), steamG);
      else svg.style.opacity = 0.25;
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
    steamG.style.transform = `translate(${(cx * k).toFixed(1)}px, ${(cy * k).toFixed(1)}px) scale(${Math.max(0.7, k * 1.1).toFixed(2)})`;
    steamG.style.display = S.boisson.froid || !sp ? 'none' : '';
  }

  /* ======================================================================
     Mise en page
     ====================================================================== */
  let tailleJeton = 0;
  function resize() {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const bandeau = host.querySelector('.tg-bandeau'), hb = bandeau ? bandeau.offsetHeight : 0;
    size = { w: r.width, h: r.height, dpr, ppm: (r.width * dpr) / W_MM, H_MM: (r.height / r.width) * W_MM, V_MM: ((r.height - hb) / r.width) * W_MM };
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    buildSteam();
    draw(); // ce qu'on a déjà (redessiné à la nouvelle échelle), en attendant l'atelier
    steamPlace();
    // tout, à la bonne échelle : le fond, l'assiette, la boisson et le gâteau servis
    const j = ++tailleJeton, ppm = size.ppm, B = S.boisson, G = S.gateau, bId = B.id, gId = G.id;
    Promise.all([demandeFond(), demandeAssiette(ppm), bId ? demandeBoisson(bId, ppm) : null, gId ? demandeGateau(gId, ppm) : null]).then(([f, p, b, g]) => {
      if (j !== tailleJeton) { [p, b, g].forEach(libere); if (f && f.close) f.close(); return; } // une autre taille est arrivée entre-temps
      const avant = [fond, S.plate, B.sprite, B.prev, G.sprite, G.prev];
      fond = f;
      S.plate = p;
      if (b && B.id === bId) { B.sprite = b; B.prev = null; B.t = 1; } else libere(b);
      if (g && G.id === gId) { G.sprite = g; G.prev = null; G.t = 1; } else libere(g);
      if (avant[0] && avant[0] !== fond && avant[0].close) avant[0].close();
      avant.slice(1).forEach(libere);
      draw();
      steamPlace();
      cv.classList.add('pret');
      // les douze crus, préparés en tâche de fond : le nuancier répond tout de suite
      (AC.CRUS || []).forEach((c) => atelier.demande('servir', [c.id, BOISSON, ppm], true));
    });
    return true;
  }

  function pret() {
    if (!visible) return false;
    if (!size.w) { resize(); return false; }
    return true;
  }

  /* précalcul en temps mort (l'onglet n'est pas encore ouvert) : on devine sa taille, et l'atelier prépare
     l'assiette, le set, la boisson et le gâteau du jour (dans son Worker : la page ne s'en aperçoit pas) */
  function prechauffer() {
    demandeListe();
    if (visible || size.w) return;
    const main = document.querySelector('main');
    if (!main) return;
    const ppm = (main.clientWidth * Math.min(2.5, window.devicePixelRatio || 1)) / W_MM;
    atelier.demande('assiette', [ASSIETTE, ppm], true);
    if (S.gateau.id) atelier.demande('gateau', [S.gateau.id, GATEAU, ppm], true);
    if (S.boisson.id) atelier.demande('servir', [S.boisson.id, BOISSON, ppm], true);
    atelier.demande('rotin', [ROTIN, ppm], true);
  }

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
      demandeListe();
      requestAnimationFrame(() => resize());
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
      const mode = memeContenant || !B.sprite ? 'fondu' : 'glisse';
      if (!silencieux && AC.sfx) {
        if (mode === 'fondu') AC.sfx.play(info.froid ? 'ice' : 'stir', { n: 2 });
        else { AC.sfx.play('clink', { delay: 520 }); if (info.froid) AC.sfx.play('ice', { delay: 700 }); }
      }
      const j = ++B.jeton, ppm = size.ppm;
      demandeBoisson(id, ppm).then((sp) => {
        if (j !== B.jeton || ppm !== size.ppm) { libere(sp); return; } // une autre boisson (ou une autre taille) est passée devant
        const vieille = B.prev;
        B.prev = B.sprite;
        B.sprite = sp;
        libere(vieille);
        B.t = 0;
        B.mode = mode;
        animate();
      });
    },
    gateau(id, { silencieux } = {}) {
      const G = S.gateau;
      if (G.id === id) return;
      G.id = id;
      if (!pret()) return;
      if (!silencieux && AC.sfx) AC.sfx.play('plate', { delay: 250 });
      const j = ++G.jeton, ppm = size.ppm;
      demandeGateau(id, ppm).then((sp) => {
        if (j !== G.jeton || ppm !== size.ppm) { libere(sp); return; }
        const vieux = G.prev;
        G.prev = G.sprite;
        G.sprite = sp;
        libere(vieux);
        G.t = 0;
        animate();
      });
    },
  };
})();
