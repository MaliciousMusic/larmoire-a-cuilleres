/* ==========================================================================
   L'Armoire à Cuillères — l'ouverture
   Leur logo en filigrane et « Entrer » (le geste qui autorise le son). Au toucher :
   la cuillère se dessine à la plume, les lettres éclosent une à une, chacune sur
   une note de boîte à musique, accord final, la clochette de la porte… et la
   devanture se construit derrière. Son coupé : elle part toute seule.
   Une fois par visite ; ?intro dans l'adresse la rejoue ; un toucher pendant
   l'animation la passe.
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});
  const $ = (s, r = document) => r.querySelector(s);
  // la mélodie : « Au clair de la lune », sur une boîte à musique (une note par lettre)
  const AIR = [72, 72, 72, 74, 76, 74, 72, 76, 74, 74, 72, 72, 72, 74, 76, 74, 72, 76, 74, 74, 72];

  /** Le logo en SVG (vectorisé depuis leurs fichiers si ac-brand.js est là, sinon composé avec la police) */
  AC.logoSVG = function ({ couleur = 'currentColor', cuillere = true } = {}) {
    const L = AC.BRAND && AC.BRAND.logo;
    if (L && L.letters) {
      const vb = Array.isArray(L.viewBox) ? L.viewBox.join(' ') : L.viewBox || '0 0 995 594';
      const svg = AC.svg('svg', { viewBox: vb, role: 'img', 'aria-label': "L'Armoire à Cuillères" });
      const lettres = L.letters.map((l) => AC.svg('path', { d: l.d, fill: couleur, class: 'lg-l' }, svg));
      let spoon = null;
      if (cuillere && L.spoon) {
        spoon = AC.svg('g', { class: 'lg-spoon' }, svg);
        if (L.spoon.fill) AC.svg('path', { d: L.spoon.fill, fill: '#FFFFFF', class: 'lg-sf' }, spoon);
        AC.svg('path', { d: L.spoon.lines, fill: '#1F1A17', class: 'lg-sl' }, spoon);
      }
      const sb = L.spoon && L.spoon.bbox; // [x0, y0, x1, y1]
      return { svg, lettres, spoon, bbox: sb ? [sb[0], sb[1], sb[2] - sb[0], sb[3] - sb[1]] : null };
    }
    // repli : la police de l'enseigne, en deux lignes de part et d'autre d'une cuillère simple
    const svg = AC.svg('svg', { viewBox: '0 0 1008 604', role: 'img', 'aria-label': "L'Armoire à Cuillères" });
    const lignes = [["L'ARM", 40, 250, 'start'], ['OIRE', 110, 400, 'start'], ['À CUILL', 520, 290, 'start'], ['ÈRES', 520, 440, 'start']];
    const lettres = [];
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = "150px 'Armoire Lettres', Poppins, sans-serif";
    lignes.forEach(([t, x, y]) => {
      let cx = x;
      [...t].forEach((ch) => {
        const w = ctx.measureText(ch).width;
        if (ch !== ' ') {
          const g = AC.svg('g', { class: 'lg-l' }, svg);
          const te = AC.svg('text', { x: cx, y, 'font-family': "'Armoire Lettres', Poppins, sans-serif", 'font-size': 150, fill: couleur }, g);
          te.textContent = ch;
          lettres.push(g);
        }
        cx += w + 6;
      });
    });
    let spoon = null;
    if (cuillere) {
      spoon = AC.svg('g', { class: 'lg-spoon' }, svg);
      AC.svg('path', { d: 'M470 20c22 0 30 20 22 38c-6 14 -10 22 -10 40l2 330c0 16 10 22 20 34c14 18 16 70 0 104c-8 18 -20 26 -34 26s-26 -8 -34 -26c-16 -34 -14 -86 0 -104c10 -12 20 -18 20 -34l2 -330c0 -18 -4 -26 -10 -40c-8 -18 0 -38 22 -38z', fill: '#fff', stroke: '#1F1A17', 'stroke-width': 5 }, spoon);
    }
    return { svg, lettres, spoon, bbox: [410, 20, 120, 580] };
  };

  /** Le titre de l'accueil : leur logo, avec sa cuillère (le nom est dans le texte caché du titre) */
  AC.logo = {
    init() {
      const h = $('#accueil-logo');
      if (!h) return;
      const { svg } = AC.logoSVG({ couleur: '#3B2723' });
      svg.removeAttribute('role');
      svg.removeAttribute('aria-label');
      svg.setAttribute('aria-hidden', 'true');
      h.innerHTML = '';
      h.appendChild(svg);
    },
  };

  /* ---------- l'envol : chaque lettre du logo va se poser sur l'enseigne peinte ----------
     Même ordre de lettres dans le logo et sur l'enseigne (L ' A R M O I R E À C U I L L È R E S).
     On mesure l'encre de chaque lettre de l'enseigne (canvas), on la projette à l'écran, et on fait
     voler une copie de la lettre du logo d'une boîte à l'autre, dans un calque au-dessus de tout. */
  const ink = new Map();
  function encre(ch, font, size) {
    const k = ch + '|' + size;
    if (ink.has(k)) return ink.get(k);
    const c = document.createElement('canvas'), W = Math.ceil(size * 3), H = Math.ceil(size * 3);
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.font = `${size}px ${font}`;
    x.textAlign = 'center';
    x.fillStyle = '#000';
    x.fillText(ch, W / 2, H * 0.7);
    const d = x.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (d[(j * W + i) * 4 + 3] > 60) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
    const r = x1 >= x0 ? { x0: x0 - W / 2, y0: y0 - H * 0.7, x1: x1 + 1 - W / 2, y1: y1 + 1 - H * 0.7 } : null;
    ink.set(k, r);
    return r;
  }
  function envol(lettres, spoon) {
    const F = AC.facade;
    const cibles = F.letters.map((g) => {
      const t = g.querySelector('text');
      const r = encre(t.textContent, t.getAttribute('font-family'), +t.getAttribute('font-size'));
      const m = t.getScreenCTM();
      if (!r || !m) return null;
      const bx = +t.getAttribute('x'), by = +t.getAttribute('y');
      const P = (x, y) => new DOMPoint(bx + x, by + y).matrixTransform(m);
      const a = P(r.x0, r.y0), b = P(r.x1, r.y1);
      return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    });
    if (cibles.some((c) => !c)) { F.letters.forEach((g) => { g.style.opacity = ''; }); return; }
    F.letters.forEach((g) => { g.style.opacity = '0'; });
    const calque = AC.svg('svg', { class: 'envol', 'aria-hidden': 'true' });
    Object.assign(calque.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: 95, pointerEvents: 'none', overflow: 'visible' });
    document.body.appendChild(calque);
    const fin = [];
    lettres.forEach((l, i) => {
      const src = l.getBoundingClientRect(), c = cibles[i];
      const clone = l.cloneNode(true);
      clone.removeAttribute('style');
      const m = l.getScreenCTM();
      const g = AC.svg('g', {}, calque);
      g.appendChild(clone);
      clone.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
      clone.setAttribute('fill', '#2E767E');
      // de la boîte de départ à la boîte d'arrivée (translation + échelle), avec un léger arc
      const sx = c.w / Math.max(1, src.width), sy = c.h / Math.max(1, src.height);
      const dx = c.x - src.x * sx, dy = c.y - src.y * sy;
      const mid = `translate(${(dx * 0.5).toFixed(1)}px, ${(dy * 0.5 - 40 - (i % 3) * 12).toFixed(1)}px) scale(${((1 + sx) / 2).toFixed(3)}, ${((1 + sy) / 2).toFixed(3)}) rotate(${(i % 2 ? 8 : -8)}deg)`;
      g.style.transformOrigin = '0 0';
      const a = g.animate([
        { transform: 'none' },
        { transform: mid, offset: 0.55 },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})` },
      ], { duration: 1150, delay: i * 45, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' });
      clone.animate([{ fill: '#2E767E' }, { fill: '#F3EBDD' }], { duration: 1150, delay: i * 45, fill: 'forwards' });
      fin.push(a.finished.then(() => {
        F.letters[i].style.opacity = '';
        g.remove();
        AC.sfx.play('letter', { m: [72, 74, 76, 79, 81, 84][i % 6] + (i > 12 ? 5 : 0), gain: 0.6 });
      }).catch(() => {}));
    });
    if (spoon) { // la cuillère file vers l'enseigne drapeau
      const s = spoon.cloneNode(true);
      const m = spoon.getScreenCTM();
      const g = AC.svg('g', {}, calque);
      g.appendChild(s);
      s.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
      s.removeAttribute('clip-path');
      const plq = AC.facade.targets.flag.getBoundingClientRect(), sb = spoon.getBoundingClientRect();
      const k = (plq.height * 0.5) / Math.max(1, sb.height);
      g.style.transformOrigin = '0 0';
      g.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${(plq.x + plq.width / 2 - (sb.x + sb.width / 2) * k).toFixed(1)}px, ${(plq.y + plq.height * 0.5 - (sb.y + sb.height / 2) * k).toFixed(1)}px) scale(${k.toFixed(4)})`, opacity: 0 }], { duration: 1200, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' });
    }
    Promise.all(fin).then(() => setTimeout(() => calque.remove(), 200));
  }

  AC.splash = function () {
    return new Promise((resolve) => {
      const el = $('#splash');
      const q = new URLSearchParams(location.search);
      let deja = false;
      try { deja = sessionStorage.getItem('ac-intro') === '1'; } catch (e) { /* navigation privée */ }
      if (!el || q.has('nointro') || (deja && !q.has('intro'))) { resolve({ skipped: true }); return; }
      try { sessionStorage.setItem('ac-intro', '1'); } catch (e) { /* idem */ }
      el.hidden = false;
      const host = $('#splash-logo');
      const { svg, lettres, spoon, bbox } = AC.logoSVG({ couleur: '#2E767E' });
      host.innerHTML = '';
      host.appendChild(svg);
      AC.bouquet && AC.bouquet($('#splash-feuilles'), [
        ['aqua', 30, 700, 170, 40], ['turquoise', 10, 660, 150, 10], ['prune', 50, 690, 190, 62], ['fuchsia', 70, 700, 160, 80], ['marine', 110, 700, 110, 30],
        ['turquoise', 390, 90, 130, 200], ['aqua', 410, 60, 150, 230], ['prune', 360, 40, 150, 170],
      ], { w: 420, h: 720 });
      // filigrane
      svg.style.opacity = '.16';
      const btn = $('#splash-entrer');
      const muet = $('#splash-muet');
      const sous = $('.splash-sous', el);
      if (muet && AC.sfx && !AC.sfx.on) muet.hidden = true;
      setTimeout(() => { btn.classList.add('on'); sous.classList.add('on'); muet && muet.classList.add('on'); }, 250);

      let fini = false, skip = false;
      const partir = (opts) => {
        if (fini) return;
        fini = true;
        el.classList.add('part');
        setTimeout(() => { el.hidden = true; el.classList.remove('part'); }, 650);
        resolve(opts);
      };

      let lance = false;
      async function jouer() {
        if (lance) return;
        lance = true;
        btn.classList.remove('on');
        btn.disabled = true;
        if (muet) muet.hidden = true;
        if (AC.reduced) { svg.style.opacity = '1'; await AC.wait(500); partir({ letters: false }); return; }
        svg.style.transition = 'opacity .3s ease';
        svg.style.opacity = '1';
        // tout se cache, puis se dessine
        lettres.forEach((l) => { l.style.opacity = '0'; });
        if (spoon) {
          const [bx, by, bw, bh] = bbox || [0, 0, 1008, 604];
          const clipId = AC.uid('sp');
          const clip = AC.svg('clipPath', { id: clipId }, AC.svg('defs', {}, svg));
          const r = AC.svg('rect', { x: bx - 20, y: by - 20, width: bw + 40, height: 0 }, clip);
          spoon.setAttribute('clip-path', `url(#${clipId})`);
          AC.sfx.play('nib', { dur: 1.2 });
          await AC.tween(1300, (e) => r.setAttribute('height', ((bh + 40) * e).toFixed(1)), AC.ease.inOutSine);
          if (skip) return;
        }
        for (let i = 0; i < lettres.length && !skip; i++) {
          const l = lettres[i];
          l.style.transformBox = 'fill-box';
          l.style.transformOrigin = '50% 90%';
          l.animate([{ opacity: 0, transform: 'translateY(18%) scale(.5) rotate(-8deg)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.3,1.6,.5,1)', fill: 'forwards' });
          AC.sfx.play('tine', { m: AIR[i % AIR.length] });
          await AC.wait(i === 4 || i === 8 || i === 14 ? 230 : 150);
        }
        if (skip) return;
        AC.sfx.play('chord');
        await AC.wait(900);
        AC.sfx.play('bell');
        await AC.wait(250);
        // les lettres s'envolent vers l'enseigne de la devanture (si on est sur l'accueil)
        if (AC.facade && AC.view === 'accueil' && lettres.length === AC.facade.letters.length) {
          envol(lettres, spoon);
          partir({ letters: true });
        } else partir({ letters: false });
      }
      btn.addEventListener('click', () => { AC.sfx.unlock && AC.sfx.unlock(); jouer(); }, { once: true });
      if (muet) muet.addEventListener('click', () => { AC.sfx.on = false; AC.syncSound && AC.syncSound(); jouer(); }, { once: true });
      // un toucher pendant l'animation : on passe
      el.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.splash-entrer') || !btn.disabled) return;
        skip = true;
        lettres.forEach((l) => { l.getAnimations().forEach((a) => a.finish()); l.style.opacity = '1'; });
        partir({ letters: false });
      });
      // son coupé : l'ouverture part toute seule
      if (AC.sfx && !AC.sfx.on) setTimeout(jouer, 900);
    });
  };
})();
