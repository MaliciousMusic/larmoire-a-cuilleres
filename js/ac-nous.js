/* ==========================================================================
   L'Armoire à Cuillères — l'accueil (ardoise, panneau « ICI », nuancier d'appel)
   et « Nous » (la pile de leurs posts Instagram), plus les bouquets de feuilles
   de la marque posés en décor.
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- les feuilles de la marque, en bouquet ----------
     spec : [[id, x, y, hauteur, rotation], …] dans un repère largeur × hauteur */
  const COULEURS = { turquoise: '#3FC7EE', prune: '#6C2383', fuchsia: '#E64AA8', ecailles: '#5FC8EE', marine: '#13365E', aqua: '#A6E6DC' };
  /** Une feuille de la marque (vectorisée, repère normalisé : pivot en bas à (0, 100), pointe en haut) */
  AC.feuille = function (key) {
    const F = AC.BRAND && AC.BRAND.feuilles;
    return F && F.items ? F.items.find((f) => f.key === key || f.id === key) || null : null;
  };
  AC.dessineFeuille = function (parent, f) {
    if (f.key === 'ecailles') AC.svg('path', { d: f.d, fill: f.fill, 'fill-rule': 'evenodd' }, parent);
    else {
      AC.svg('path', { d: f.d, fill: f.fill }, parent);
      (f.details || []).forEach((d) => AC.svg('path', { d, fill: f.detailFill || '#fff' }, parent));
    }
  };
  /** Leurs tasses empilées (dessin au trait du bandeau 2018 et des affiches d'horaires de 2013) */
  AC.tasses = function (host, couleur = 'currentColor') {
    const T = AC.BRAND && AC.BRAND.tasses;
    if (!host || !T) return null;
    const svg = AC.svg('svg', { viewBox: T.viewBox.join(' '), 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet' });
    AC.svg('path', { d: T.lines, fill: couleur }, svg);
    host.innerHTML = '';
    host.appendChild(svg);
    return svg;
  };

  AC.bouquet = function (host, spec, { w = 200, h = 120, sway = true, par = 'xMidYMid meet' } = {}) {
    if (!host) return null;
    const B = AC.BRAND && AC.BRAND.feuilles && AC.BRAND.feuilles.items;
    const svg = AC.svg('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', height: '100%', preserveAspectRatio: par, 'aria-hidden': 'true' });
    spec.forEach(([id, x, y, hh, rot], i) => {
      const leaf = B ? AC.feuille(id) : null;
      const g = AC.svg('g', { transform: `translate(${x} ${y}) rotate(${rot})` }, svg);
      const inner = AC.svg('g', { class: 'feuille' }, g);
      if (leaf) {
        const s = hh / 100;
        const gg = AC.svg('g', { transform: `scale(${s}) translate(${-leaf.pivot[0]} ${-leaf.pivot[1]})` }, inner);
        AC.dessineFeuille(gg, leaf);
      } else {
        // repli (avant la vectorisation) : une feuille simple aux bonnes couleurs
        const l = hh, wd = hh * (id === 'fuchsia' ? 0.16 : id === 'marine' ? 0.4 : 0.34);
        AC.svg('path', { d: `M0 0C${-wd} ${-l * 0.3} ${-wd * 0.8} ${-l * 0.8} 0 ${-l}C${wd * 0.8} ${-l * 0.8} ${wd} ${-l * 0.3} 0 0Z`, fill: COULEURS[id] || '#3FC7EE' }, inner);
        if (id === 'turquoise' || id === 'aqua') AC.svg('path', { d: `M0 -2V${-l * 0.92}`, stroke: '#fff', 'stroke-width': 0.8, fill: 'none' }, inner);
      }
      if (sway && !AC.reduced) {
        inner.animate([{ transform: 'rotate(-2.5deg)' }, { transform: 'rotate(2.5deg)' }], { duration: 2800 + i * 430, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out', delay: -i * 700 });
      }
    });
    host.innerHTML = '';
    host.appendChild(svg);
    return svg;
  };

  /* ======================================================================
     Accueil
     ====================================================================== */
  AC.accueil = {
    init() {
      // l'ardoise : chaque ligne sert le gâteau sur la table de la carte
      const ul = $('#ardoise-liste');
      if (ul && AC.ARDOISE) {
        ul.innerHTML = AC.ARDOISE.items.map((it) => `<li><button type="button" data-sert="${it.sert}" data-sfx="chalk"><span>${esc(it.nom)}</span><span>${AC.prix(it.prix).replace(' €', '')}</span></button></li>`).join('');
        ul.addEventListener('click', (e) => {
          const b = e.target.closest('[data-sert]');
          if (!b) return;
          AC.go('carte');
          setTimeout(() => AC.carte && AC.carte.servir(b.dataset.sert, 'gateau', true), 420);
        });
        const sig = $('.ardoise-sign');
        if (sig) sig.textContent = AC.ARDOISE.signature;
      }
      // le nuancier d'appel
      const tn = $('#tc-nuancier');
      if (tn) tn.innerHTML = AC.CRUS.map((c) => `<i style="background:${c.couleur}"></i>`).join('');
      // le panneau « ICI » : les mots s'allument un à un quand on arrive dessus
      const p = $('#ici-verbes');
      if (p) {
        const words = p.textContent.split(/(\s+)/);
        p.innerHTML = words.map((w) => (/\s+/.test(w) ? w : `<span class="w">${esc(w)}</span>`)).join('');
        const ws = $$('.w', p);
        let joue = false;
        const lire = async () => {
          if (joue) return;
          joue = true;
          if (AC.reduced) { ws.forEach((w) => w.classList.add('on')); return; }
          for (let i = 0; i < ws.length; i++) {
            ws[i].classList.add('on', 'flash');
            const w = ws[i];
            setTimeout(() => w.classList.remove('flash'), 420);
            if (/^on$/i.test(ws[i].textContent) && AC.sfx) AC.sfx.play('tine', { m: [72, 74, 76, 79, 81, 84, 86][Math.floor(i / 2) % 7], v: 0.5 });
            await AC.wait(/^on$/i.test(ws[i].textContent) ? 150 : 95);
          }
        };
        AC.lireIci = () => { joue = false; ws.forEach((w) => w.classList.remove('on')); lire(); };
        if ('IntersectionObserver' in window) {
          const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { lire(); io.disconnect(); } }), { threshold: 0.5 });
          io.observe(p);
        } else lire();
      }
      AC.tasses($('#pied-tasses'), '#6A5850');
      AC.bouquet($('#pied-feuilles'), [['aqua', 60, 64, 58, -64], ['prune', 86, 64, 62, -18], ['turquoise', 100, 64, 56, 16], ['fuchsia', 92, 64, 50, 34], ['marine', 120, 64, 40, 62]], { w: 180, h: 64 });
      AC.bouquet($('#ab-feuilles'), [['turquoise', -4, 232, 92, 44], ['prune', -12, 236, 104, 64], ['aqua', 6, 240, 80, 84], ['fuchsia', 404, 234, 96, -48], ['marine', 414, 214, 70, -24], ['aqua', 396, 240, 82, -80]], { w: 400, h: 240, par: 'xMidYMax meet' });
    },
  };

  /* ======================================================================
     Nous : la pile de photos (on jette celle du dessus, elle repart dessous)
     ====================================================================== */
  const POSE = [{ x: 0, y: 0, r: -1.5, s: 1 }, { x: 12, y: 8, r: 4, s: 0.97 }, { x: -11, y: 14, r: -4.5, s: 0.94 }, { x: 6, y: 20, r: 2, s: 0.91 }];
  AC.nous = {
    init() {
      // le salon (ac-salon.js) : dessiné à la première visite de l'onglet, joué une fois, puis vivant
      const hostSalon = $('#scene-salon');
      if (hostSalon && AC.Salon && AC.Salon.create) {
        hostSalon.hidden = false;
        let salon = null, pret = null;
        const reveil = async () => {
          if (!pret) pret = AC.Salon.create(hostSalon, {}).then((api) => { salon = api; return api; }).catch((e) => { console.warn('salon', e); hostSalon.hidden = true; });
          const api = await pret;
          if (api && !api._joue) { api._joue = true; try { await api.play(); } catch (e) { /* rien */ } api.idle && api.idle(); }
        };
        AC.on('view', (v) => { if (v === 'nous') reveil(); });
        if (AC.view === 'nous') reveil();
      }
      // la pile de photos n'est construite qu'à la première visite de l'onglet (les photos ne se chargent pas avant)
      let pileFaite = false;
      const faire = () => { if (!pileFaite) { pileFaite = true; pile(); } };
      AC.on('view', (v) => { if (v === 'nous') faire(); });
      if (AC.view === 'nous') faire();
    },
  };

  function pile() {
    {
      const box = $('#pile');
      if (!box || !AC.INSTA) return;
      const fmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
      box.innerHTML = AC.INSTA.map((p, i) => `<figure class="photo" data-i="${i}"><img src="assets/img/insta/${p.img}.webp" alt="${esc(p.legende)}" loading="lazy" decoding="async" draggable="false"><figcaption>${esc(p.legende)}<span class="date">${fmt(p.date)}</span></figcaption></figure>`).join('');
      const cards = $$('.photo', box);
      const N = cards.length;
      let order = cards.map((_, i) => i), busy = false, drag = null;
      const tf = (p, dx = 0, dy = 0, dr = 0) => `translate(${p.x + dx}px, ${p.y + dy}px) rotate(${p.r + dr}deg) scale(${p.s})`;
      const pose = (d) => POSE[Math.min(d, POSE.length - 1)];
      function layout() {
        order.forEach((ci, d) => {
          const c = cards[ci];
          c.style.zIndex = String(N - d);
          c.style.transform = tf(pose(d));
          c.style.opacity = d < POSE.length ? '1' : '0';
          c.setAttribute('aria-hidden', String(d !== 0));
        });
      }
      function toss(dir, dy = 0) {
        if (busy) return;
        busy = true;
        const c = cards[order[0]];
        c.style.transition = 'transform .34s cubic-bezier(.4,0,.9,.6), opacity .34s ease-in';
        c.style.transform = `translate(${dir * 125}%, ${dy + 30}px) rotate(${dir * 22}deg) scale(.96)`;
        c.style.opacity = '0';
        AC.sfx.play('flick');
        setTimeout(() => {
          order.push(order.shift());
          c.style.transition = 'none';
          layout();
          void c.offsetWidth;
          c.style.transition = '';
          busy = false;
        }, AC.reduced ? 0 : 340);
        order.slice(1).forEach((ci, d) => { const n = cards[ci]; n.style.transform = tf(pose(d)); n.style.opacity = d < POSE.length ? '1' : '0'; n.style.zIndex = String(N - d - 1); });
      }
      box.addEventListener('pointerdown', (e) => {
        const c = e.target.closest('.photo');
        if (busy || !c || c !== cards[order[0]]) return;
        drag = { c, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, on: false, lx: e.clientX, lt: e.timeStamp, vx: 0 };
      });
      box.addEventListener('pointermove', (e) => {
        const d = drag;
        if (!d || e.pointerId !== d.id) return;
        d.dx = e.clientX - d.x0;
        d.dy = e.clientY - d.y0;
        if (!d.on) {
          if (Math.abs(d.dy) > 10 && Math.abs(d.dy) > Math.abs(d.dx)) { drag = null; return; }
          if (Math.abs(d.dx) < 6) return;
          d.on = true;
          try { d.c.setPointerCapture(d.id); } catch (_) { /* rien */ }
          d.c.style.transition = 'none';
        }
        const dt = Math.max(8, e.timeStamp - d.lt);
        d.vx = d.vx * 0.4 + ((e.clientX - d.lx) / dt) * 0.6;
        d.lx = e.clientX;
        d.lt = e.timeStamp;
        d.c.style.transform = tf(POSE[0], d.dx, d.dy * 0.25, d.dx * 0.07);
      });
      const end = (e) => {
        const d = drag;
        if (!d || e.pointerId !== d.id) return;
        drag = null;
        d.c.style.transition = '';
        if (!d.on) { if (e.type === 'pointerup') toss(1); return; }
        if (Math.abs(d.dx) > 80 || Math.abs(d.vx) > 0.55) toss(Math.sign(d.dx || d.vx), d.dy);
        else d.c.style.transform = tf(POSE[0]);
      };
      box.addEventListener('pointerup', end);
      box.addEventListener('pointercancel', end);
      box.setAttribute('tabindex', '0');
      box.setAttribute('aria-label', 'Leurs photos Instagram : touchez ou faites glisser pour passer à la suivante');
      box.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); toss(e.key === 'ArrowRight' ? 1 : -1); } });
      layout();
    }
  }
})();
