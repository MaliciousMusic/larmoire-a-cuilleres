/* ==========================================================================
   L'Armoire à Cuillères — l'accueil (l'ardoise et ses dessins à la craie, panneau « ICI »)
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
    const feuilles = [];
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
      feuilles.push(inner);
    });
    host.innerHTML = '';
    host.appendChild(svg);
    // elles se balancent doucement, chacune à son rythme (pilotées par l'ambiance : seulement quand on les voit)
    if (sway && !AC.reduced) AC.ambiance.balance(feuilles, host, { de: -2.5, a: 2.5, periode: (i) => 2800 + i * 430, decale: (i) => i * 700 });
    return svg;
  };

  /* ======================================================================
     Accueil
     ====================================================================== */
  /* les petits dessins à la craie de l'ardoise (48 × 34), un par pâtisserie ; la craie : le filtre #craie */
  const C = { brun: '#C99368', caramel: '#F2BE6E', noisette: '#E3B886', vert: '#BFE39A', citron: '#F6E27A', rose: '#F2B8C6' };
  const ASSIETTE = '<path d="M4 29.5h40"/><path d="M9 31.6h30" stroke-width="1"/>';
  const FONDANT = '<ellipse cx="24" cy="12" rx="14" ry="4.2"/><path d="M10 12v12.5c0 2.4 6.3 4.3 14 4.3s14-1.9 14-4.3V12"/>';
  const DESSINS = {
    'fondant-lait': ASSIETTE + FONDANT +
      `<path d="M14 17l3 7M19 18l3 8M24 18.6l3 8M29 18.4l3 7.6M34 17.4l2.6 6" stroke="${C.brun}" stroke-width=".8"/>` +
      `<path d="M11 13.4c1 3 2.2 4.6 3.2 1.4 1 4.6 2.2 5.4 3.4 1.2 1.2 3 2.2 3.4 3.4.8 1.2 4.2 2.4 4.8 3.6.8 1.2 2.6 2.4 3 3.6.6 1.2 3.6 2.2 4 3.2.4.8 1.6 1.6 1.6 2.4 0" stroke="${C.caramel}" stroke-width="1.5"/>`,
    'fondant-noir': ASSIETTE + FONDANT +
      '<path d="M13 16l4 9M17 17l4 9.6M21 17.6l4 9.6M25 17.8l4 9.4M29 17.6l4 9M33 17l3.4 7.6" stroke-width=".8"/>' +
      '<path d="M36 16l-4 9M32 17.2l-4 9.6M28 17.8l-4 9.6M24 17.8l-4 9.6M20 17.4l-4 9M16 16.6l-3.2 7.4" stroke-width=".8"/>' +
      '<path d="M16 10.6l1.4 1.2M17.4 10.6l-1.4 1.2M24 9.4l1.4 1.2M25.4 9.4l-1.4 1.2M30 11.6l1.2 1.2M31.2 11.6l-1.2 1.2M20 13l1 1M21 13l-1 1" stroke-width=".9"/>',
    brownie: '<path d="M6 15.5L22 9l20 4.5-16 6.6z"/><path d="M6 15.5V26l20 6V20.1"/><path d="M26 32l16-6.4V13.5"/>' +
      `<path d="M9 19l3 1M13 21l3 1M17 22.6l3 1M9 23.4l3 1M14 25l3 1M19 27l3 1M29 23l3-1.2M33 21.4l3-1.2M29 27l3-1.2M34 25l3-1.2" stroke="${C.brun}" stroke-width=".9"/>` +
      `<g stroke="${C.noisette}"><ellipse cx="17" cy="12.6" rx="2.2" ry="1.3"/><ellipse cx="25" cy="14.8" rx="2.2" ry="1.3"/><ellipse cx="31" cy="11.8" rx="2" ry="1.2"/></g>`,
    cheesecake: '<path d="M5 17L39 10.5V28H5z"/><path d="M5 24.5h34"/>' +
      `<path d="M8 27l2-2.4M13 27l2-2.4M18 27l2-2.4M23 27l2-2.4M28 27l2-2.4M33 27l2-2.4" stroke="${C.noisette}" stroke-width=".9"/>` +
      `<g stroke="${C.vert}"><circle cx="27" cy="9.4" r="5.2"/><path d="M27 4.2v10.4M21.8 9.4h10.4M23.3 5.7l7.4 7.4M30.7 5.7l-7.4 7.4" stroke-width=".8"/></g>`,
    cookie: '<circle cx="17" cy="18" r="10"/><path d="M26.4 14.6A8.6 8.6 0 1 1 25.2 26"/>' +
      `<g fill="${C.brun}" stroke="none"><circle cx="13" cy="14" r="1.5"/><circle cx="20" cy="16" r="1.3"/><circle cx="15" cy="22" r="1.5"/><circle cx="21" cy="23" r="1.1"/><circle cx="31" cy="18" r="1.3"/><circle cx="36" cy="22" r="1.4"/><circle cx="32" cy="25" r="1.1"/></g>` +
      '<path d="M10 19l3 1.2M17 12l2.4 1M34 16.6l1.8 1.4" stroke-width=".8"/>',
    'cake-marbre': '<path d="M4 28V16c0-4 7-6.5 14-6.5s14 2.5 14 6.5v12z"/><path d="M3 28h42"/><path d="M34.5 28V15.5h9V28"/>' +
      `<path d="M36.8 19.4c1.6-1.6 4-1 4.2 1 .2 2-2.2 2.8-3.4 1.6-1-1 .2-2.2 1.2-1.6" stroke="${C.brun}" stroke-width="1"/>` +
      `<path d="M8 17c3-2 6 1 9-1s6 1 8-1M9 22c3 1.4 6-1 9 .6s6 1 9-.4" stroke="${C.brun}" stroke-width="1"/>`,
    'tarte-citron': '<path d="M5 26.5L40 20v8H5z"/>' +
      `<path d="M5.5 25.8L39.6 19.6" stroke="${C.citron}" stroke-width="2.2"/>` +
      '<path d="M7 24.6c1-3 2-4.2 3.2-6.4.6 2.2 1.4 3.4 2.4 5.2 1-3.2 2.2-5.2 3.4-7.6.6 2.4 1.4 3.8 2.4 5.8 1.2-3 2.2-5 3.4-7.4.6 2.2 1.4 3.6 2.4 5.4 1.2-3 2.2-4.8 3.4-7 .6 2 1.4 3.4 2.4 5 1-2.6 2-4.2 3.2-6.2.6 1.8 1.2 3 2 4.2"/>' +
      `<path d="M8 28l1.6-1.6M14 28l1.6-1.6M20 28l1.6-1.6M26 28l1.6-1.6M32 28l1.6-1.6" stroke="${C.noisette}" stroke-width=".9"/>`,
  };
  const COEUR = `<path d="M24 26c-7-4.4-10-8.6-8-12.4 1.6-3 5.6-3 8 .2 2.4-3.2 6.4-3.2 8-.2 2 3.8-1 8-8 12.4z" stroke="${C.rose}"/>`;
  const dessin = (id) => `<svg class="ardoise-dessin" viewBox="0 0 48 34" aria-hidden="true"><g filter="url(#craie)" fill="none" stroke="#F3F0E8" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${DESSINS[id] || COEUR}</g></svg>`;
  AC.accueil = {
    init() {
      // l'ardoise : chaque ligne sert le gâteau sur la table de la carte
      const ul = $('#ardoise-liste');
      if (ul && AC.ARDOISE) {
        ul.innerHTML = AC.ARDOISE.items.map((it) => `<li><button type="button" data-sert="${it.sert}" data-sfx="chalk">${dessin(it.sert)}<span class="ad-nom">${esc(it.nom)}</span><span class="ad-prix">${AC.prix(it.prix).replace(' €', '')}</span></button></li>`).join('');
        ul.addEventListener('click', (e) => {
          const b = e.target.closest('[data-sert]');
          if (!b) return;
          AC.go('carte');
          setTimeout(() => AC.carte && AC.carte.servir(b.dataset.sert, 'gateau', true), 420);
        });
        const sig = $('.ardoise-sign');
        if (sig) sig.textContent = AC.ARDOISE.signature;
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
      // le salon (ac-salon.js) : dessiné à la première visite de l'onglet, joué une fois, puis vivant ;
      // au premier plan, le comptoir et Mallo qui joue la comptine du fait-maison (ac-conte.js)
      const hostSalon = $('#scene-salon');
      if (hostSalon) {
        let pret = null;
        const reveil = async () => {
          if (!pret) {
            // (chargés à la demande : ils ne pèsent pas sur l'ouverture de l'accueil)
            // le cadrage suit l'écran (ac-conte.js) : le salon remplit le haut de l'onglet, la bulle sous Mallo
            pret = AC.charge(['ac-salon.js', 'ac-conte.js']).then(() => AC.Salon.create(hostSalon, { cadre: '0 0 400 760' })).then((api) => {
              try { AC.conte = AC.Conte ? AC.Conte.create(api, $('#conte')) : null; } catch (e) { console.warn('conte', e); }
              return api;
            }).catch((e) => { console.warn('salon', e); });
          }
          const api = await pret;
          if (api && !api._joue) {
            api._joue = true;
            // déjà vue pendant cette visite : l'histoire est écrite, on peut la revoir
            if (AC.conte && AC.conte.deja() && !AC.conteDemande) AC.conte.fin();
            if (AC.conte) AC.conte.entree();
            try { await api.play(); } catch (e) { /* rien */ }
            api.idle && api.idle();
            if (AC.conte && (!AC.conte.deja() || AC.conteDemande)) AC.conte.jouer();
            AC.conteDemande = false;
          }
        };
        AC.on('view', (v) => { if (v === 'nous') reveil(); });
        if (AC.view === 'nous') reveil();
      }
      // les volets qui se déplient (l'histoire, les producteurs, le gâteau entier) : ils s'ouvrent et se ferment en douceur
      $$('.pli').forEach((d) => {
        const corps = $('.pli-corps', d);
        const sommaire = $('summary', d);
        if (!corps || !sommaire || !corps.animate) return;
        sommaire.addEventListener('click', (e) => {
          if (AC.reduced) return; // le <details> s'ouvre tout seul
          e.preventDefault();
          if (d.dataset.anim) return;
          const ouvrir = !d.open;
          if (ouvrir) d.open = true;
          const h = corps.scrollHeight;
          d.dataset.anim = '1';
          const a = corps.animate(ouvrir
            ? [{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }]
            : [{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: ouvrir ? 380 : 260, easing: 'cubic-bezier(.3,.8,.3,1)' });
          const fin = () => { if (!ouvrir) d.open = false; delete d.dataset.anim; };
          a.onfinish = fin;
          a.oncancel = fin;
        });
      });
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
