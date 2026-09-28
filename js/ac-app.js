/* ==========================================================================
   L'Armoire à Cuillères — l'appli : onglets (#accueil, #carte, #brunch, #fidelite, #nous),
   feuilles qui montent, son, « Ouvert / Fermé » à l'heure de Paris (la pancarte de la porte,
   la vitre des horaires), la devanture. Pas de barre du haut : tout est sur la devanture.
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const VIEWS = ['accueil', 'carte', 'brunch', 'fidelite', 'nous'];
  let current = null;
  let facade = null;

  /* ---------- petits messages ---------- */
  let toastT = 0;
  AC.toast = function (msg, ms = 2600) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), ms);
  };

  /* ---------- onglets ---------- */
  function route(first) {
    const raw = decodeURIComponent((location.hash || '#accueil').slice(1));
    let view = VIEWS.includes(raw) ? raw : null;
    let target = null;
    if (!view) {
      target = raw ? document.getElementById(raw) : null;
      const v = target && target.closest('.view');
      view = v ? v.dataset.view : 'accueil';
    }
    show(view, first);
    if (target) setTimeout(() => AC.scrollTo(target), first ? 60 : 380);
  }
  AC.scrollTo = function (el, offset = 64) {
    const sc = el.closest('.view-scroll');
    if (!sc) return;
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - offset;
    sc.scrollTo({ top: Math.max(0, top), behavior: AC.reduced ? 'auto' : 'smooth' });
  };
  AC.go = function (view) {
    if (location.hash !== '#' + view) location.hash = view;
    else route(false);
  };

  // Les onglets quittés s'endorment une fois sortis (.dort : content-visibility: hidden) : ils gardent leur mise en page
  // et leur état, mais ne sont plus peints, ni comptés à chaque image (sinon chaque image du téléphone traite aussi
  // les couches de tous les onglets cachés) ; leur contenu n'est plus atteignable (focus, lecteurs d'écran). L'onglet
  // ouvert passe au-dessus des autres (z-index) : lui seul reçoit les touchers. (inert faisait tout cela, mais
  // recalculait le style de tout l'onglet à chaque changement d'onglet : cher, sur un dessin de milliers d'éléments)
  const sommeil = new Map();
  AC.endors = function (v, ms = 0) {
    clearTimeout(sommeil.get(v));
    sommeil.set(v, setTimeout(() => { sommeil.delete(v); if (!v.classList.contains('is-active')) v.classList.add('dort'); }, ms));
  };
  const reveille = (v) => { clearTimeout(sommeil.get(v)); sommeil.delete(v); v.classList.remove('dort'); };

  function show(view, first) {
    if (view === current) return;
    const iNew = VIEWS.indexOf(view), iOld = VIEWS.indexOf(current);
    $$('.view').forEach((v) => {
      const i = VIEWS.indexOf(v.dataset.view);
      const on = v.dataset.view === view, etait = v.classList.contains('is-active');
      if (on) reveille(v);
      if (on && !v.classList.contains('vue')) {
        v.classList.add('vue');
        v.classList.toggle('is-left', i < iOld);
        if (!first) void getComputedStyle(v).opacity;
      }
      v.classList.toggle('is-active', on);
      v.classList.toggle('is-left', !on && i < iNew);
      v.setAttribute('aria-hidden', String(!on));
      if (etait && !on) AC.endors(v, 450); // (après son fondu : .38 s)
    });
    $$('#tabbar .tab').forEach((t) => {
      const on = t.dataset.tab === view;
      t.classList.toggle('is-active', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    current = view;
    AC.view = view;
    // (les onglets quittés dorment, avec leur mise en page : y revenir coûte peu ; leurs animations sont en pause,
    // AC.ambiance)
    AC.emit('view', view);
  }

  function initTabs() {
    // les vues inactives sont décalées pour leur transition : main ne doit jamais défiler (focus, scrollIntoView)
    const main = $('main');
    main.addEventListener('scroll', () => { if (main.scrollLeft || main.scrollTop) { main.scrollLeft = 0; main.scrollTop = 0; } });
    $$('#tabbar .tab').forEach((t) => {
      t.addEventListener('click', (e) => {
        if (t.dataset.tab === current) {
          e.preventDefault();
          const sc = $(`#${current} .view-scroll`);
          if (sc) sc.scrollTo({ top: 0, behavior: AC.reduced ? 'auto' : 'smooth' });
        }
      });
    });
    window.addEventListener('hashchange', () => route(false));
  }

  /* ---------- feuilles ---------- */
  const closers = new Map();
  AC.openSheet = function (sel, onClose) {
    const s = $(sel);
    if (!s) return;
    closers.set(sel, onClose);
    s.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add('is-open')));
    const panel = s.querySelector('.sheet-panel');
    panel.setAttribute('tabindex', '-1');
    setTimeout(() => panel.focus({ preventScroll: true }), 60);
    AC.sfx.play('open');
  };
  AC.closeSheet = function (sel) {
    const s = $(sel);
    if (!s || s.hidden) return;
    s.classList.remove('is-open');
    const fn = closers.get(sel);
    closers.delete(sel);
    AC.sfx.play('close');
    setTimeout(() => { s.hidden = true; fn && fn(); }, 420);
  };
  function initSheets() {
    $$('.sheet').forEach((s) => {
      const sel = '#' + s.id;
      s.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) AC.closeSheet(sel); });
      const panel = s.querySelector('.sheet-panel');
      let y0 = null, dy = 0;
      panel.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.sheet-grab') && !(panel.scrollTop <= 0 && e.pointerType === 'touch' && !e.target.closest('button, input, a'))) return;
        y0 = e.clientY; dy = 0;
        panel.style.transition = 'none';
      });
      panel.addEventListener('pointermove', (e) => {
        if (y0 == null) return;
        dy = Math.max(0, e.clientY - y0);
        panel.style.transform = `translateY(${dy}px)`;
      });
      const end = () => {
        if (y0 == null) return;
        y0 = null;
        panel.style.transition = '';
        panel.style.transform = '';
        if (dy > 110) AC.closeSheet(sel);
      };
      panel.addEventListener('pointerup', end);
      panel.addEventListener('pointercancel', end);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $$('.sheet.is-open').forEach((s) => AC.closeSheet('#' + s.id));
    });
  }

  /* ---------- son (l'interrupteur est en bas de l'onglet Nous ; l'ouverture propose aussi d'entrer sans le son) ---------- */
  AC.syncSound = () => $$('[data-son]').forEach((b) => b.setAttribute('aria-checked', String(!!AC.sfx.on)));
  function initSound() {
    $$('[data-son]').forEach((b) => b.addEventListener('click', () => {
      AC.sfx.on = !AC.sfx.on;
      AC.syncSound();
      if (AC.sfx.on) AC.sfx.play('on');
      AC.emit('sound', AC.sfx.on);
    }));
    AC.syncSound();
  }

  /* ---------- horaires : carte du jour, tableau, devanture ---------- */
  function renderHours() {
    const st = AC.statut();
    const now = AC.parisNow(), j = now.getDay();
    const plage = AC.HOURS.semaine[j];
    $('#cj-etat').textContent = AC.t(st.ouvert ? 'Ouvert aujourd’hui' : plage ? 'Aujourd’hui' : 'Fermé aujourd’hui');
    $('#carte-jour').classList.toggle('ouvert', !!st.ouvert);
    $('#cj-heures').textContent = plage ? AC.fmtH(plage[0]) + ' – ' + AC.fmtH(plage[1]) : st.quand ? AC.t('ouvre {quand}', { quand: st.quand }) : AC.t('Fermé');
    $$('#horaires-table tr').forEach((tr) => tr.classList.toggle('auj', +tr.dataset.j === j));
    if (facade) facade.setStatus(st);
    return st;
  }
  function initHours() {
    // « Les horaires » : on remonte à la devanture et on s'approche de la vitrine
    $('#carte-jour').addEventListener('click', async () => {
      // l'enseigne se balance sur sa ficelle
      if (!AC.reduced) $('#carte-jour').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(2.6deg)' }, { transform: 'rotate(-1.8deg)' }, { transform: 'rotate(1deg)' }, { transform: 'rotate(0)' }], { duration: 1000, easing: 'ease-out' });
      const sc = $('#accueil .view-scroll');
      if (sc && sc.scrollTop > 2) {
        sc.scrollTo({ top: 0, behavior: AC.reduced ? 'auto' : 'smooth' });
        const t0 = performance.now();
        while (sc.scrollTop > 2 && performance.now() - t0 < 1200) await AC.wait(40);
      }
      vitre(true);
    });
    renderHours();
    setInterval(renderHours, 60000);
  }

  /* ---------- la vitrine des horaires : la caméra s'approche dans la scène (pas de feuille par-dessus) ---------- */
  let vitreOn = false;
  function semaineTexte() {
    return [2, 3, 4, 5, 6, 0, 1].map((d) => {
      const pl = AC.HOURS.semaine[d];
      return AC.JOURS[d] + ' ' + (pl ? AC.fmtH(pl[0]) + ' – ' + AC.fmtH(pl[1]) + (d === 0 ? AC.t(', brunch dès {h}', { h: AC.fmtH(AC.HOURS.brunch.debut) }) : '') : AC.t('fermé'));
    }).join(AC.en ? '; ' : ' ; ');
  }
  async function vitre(on) {
    if (!facade || on === vitreOn) return;
    vitreOn = on;
    const scene = $('#scene-facade'), voile = $('#scene-vitre');
    if (on) {
      $('#sv-etat').textContent = AC.statut().texte;
      $('#sv-semaine').textContent = AC.t('. Horaires : {semaine}.', { semaine: semaineTexte() });
      voile.hidden = false;
      scene.classList.add('zoom');
      AC.sfx.play('open');
      await facade.camera(facade.vitreHoraires);
      if (vitreOn) $('#sv-fermer').focus({ preventScroll: true });
    } else {
      voile.hidden = true;
      scene.classList.remove('zoom');
      AC.sfx.play('close');
      await facade.camera(null);
    }
  }
  function initVitre() {
    $('#scene-vitre').addEventListener('click', () => vitre(false)); // un toucher n'importe où, ou la croix
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && vitreOn) vitre(false); });
    AC.on('view', (v) => { if (v !== 'accueil' && vitreOn) { vitreOn = false; $('#scene-vitre').hidden = true; $('#scene-facade').classList.remove('zoom'); facade && facade.camera(null, 0); } });
    let rz = 0;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (vitreOn && facade) facade.camera(facade.vitreHoraires, 0); }, 120); });
  }

  /* ---------- le soir (heure de Paris, coucher du soleil approximatif) ---------- */
  function isNight() {
    const q = new URLSearchParams(location.search);
    if (q.has('soir')) return true;
    if (q.has('jour')) return false;
    const now = AC.parisNow();
    const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const coucher = 19.1 + 2.2 * Math.sin(((doy - 80) / 365) * AC.TAU); // ~16h55 en déc., ~21h20 en juin (+ heure d'été approchée)
    const lever = 7.4 - 1.9 * Math.sin(((doy - 80) / 365) * AC.TAU);
    const h = now.getHours() + now.getMinutes() / 60;
    return h >= coucher || h < lever;
  }

  /* ---------- la devanture ---------- */
  async function initFacade() {
    const host = $('#facade-host');
    if (!host || !AC.Facade) return null;
    facade = await AC.Facade.create(host, {});
    AC.facade = facade;
    facade.setStatus(AC.statut());
    facade.setNight(isNight());
    setInterval(() => facade.setNight(isNight()), 120000);
    const T = facade.targets;
    const on = (el, fn) => el && el.addEventListener('click', fn);
    // la porte : on entre dans le salon (l'onglet Nous)
    on(T.door, async () => {
      const ouvert = AC.statut().ouvert;
      await facade.knock();
      AC.toast(AC.t(ouvert ? 'Entrez, installez-vous !' : 'C’est fermé pour l’instant… mais entrez voir le salon.'));
      setTimeout(() => AC.go('nous'), 250);
      setTimeout(() => facade.closeDoor(700), 1500);
    });
    // le panneau « ICI ON… » : ses mots s'allument, puis on entre voir Mallo les faire (onglet Nous)
    on(T.ici, async () => {
      facade.readIci();
      await AC.wait(900);
      if (AC.conte) { AC.go('nous'); setTimeout(() => AC.conte.jouer(), 450); } else { AC.conteDemande = true; AC.go('nous'); }
    });
    on(T.slate, () => { AC.sfx.play('chalk'); AC.scrollTo($('#ardoise')); });
    on(T.window, () => vitre(true));
    on(T.vitrine, () => { AC.sfx.play('clink'); AC.go('carte'); setTimeout(() => { const g = $('#r-gateaux'); g && AC.scrollTo(g); }, 450); });
    // la plaque se balance (sur son calque, une fois la vie ambiante lancée : le compositeur ajoute ce coup au balancement)
    on(T.flag, () => { AC.sfx.play('sign'); (T.flagCalque || T.flag).animate([{ transform: 'rotate(0)' }, { transform: 'rotate(12deg)' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(0)' }], { duration: 1400, easing: 'ease-out', composite: 'add' }); });
    on(T.cup, () => { AC.sfx.play('clink'); AC.sfx.play('steam', { delay: 200 }); });
    (T.houses || []).forEach((h, i) => on(h, () => facade.bird(i)));
    return facade;
  }

  /* ---------- la langue : le petit menu en haut à gauche de l'accueil (Français / English) ---------- */
  function initLangue() {
    const box = $('#langue'), btn = $('#langue-bouton'), menu = $('#langue-menu');
    if (!box || !btn || !menu) return;
    $('.langue-code', btn).textContent = AC.lang.toUpperCase();
    btn.setAttribute('aria-label', AC.en ? 'Language: English' : 'Langue : français');
    $$('[data-lang]', menu).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === AC.lang)));
    const ouvre = (on) => {
      menu.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
    };
    btn.addEventListener('click', (e) => { e.stopPropagation(); ouvre(menu.hidden); });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lang]');
      if (!b) return;
      ouvre(false);
      if (b.dataset.lang !== AC.lang) AC.choisirLangue(b.dataset.lang);
    });
    document.addEventListener('click', (e) => { if (!menu.hidden && !box.contains(e.target)) ouvre(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { ouvre(false); btn.focus(); } });
    AC.on('view', () => ouvre(false));
  }

  /* ---------- l'astuce de la scène, qui s'efface ---------- */
  function hint() {
    const a = $('#scene-astuce');
    if (!a || AC.store.get('astuce-vue', false)) return;
    setTimeout(() => a.classList.add('on'), 1200);
    setTimeout(() => a.classList.remove('on'), 7000);
    AC.store.set('astuce-vue', true);
  }

  /* ---------- sur ordinateur : le QR code de la page, les feuilles ---------- */
  function initBureau() {
    if (!matchMedia('(min-width: 1000px)').matches) return;
    const q = $('#bureau-qr');
    if (q) AC.charge('qrcode.js').then(() => {
      const qr = window.qrcode(0, 'M');
      qr.addData(location.href.split('#')[0].split('?')[0]);
      qr.make();
      const n = qr.getModuleCount();
      let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      q.innerHTML = `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${d}" fill="#3B2723"/></svg>`;
    }).catch(() => {});
    if (AC.bouquet) {
      AC.bouquet($('#bureau-feuilles-g'), [['aqua', 70, 180, 150, -40], ['turquoise', 100, 180, 160, -8], ['prune', 130, 180, 170, 22], ['fuchsia', 150, 180, 140, 44], ['marine', 170, 180, 100, 70]], { w: 240, h: 180 });
      AC.bouquet($('#bureau-feuilles-d'), [['marine', 70, 0, 100, 150], ['prune', 100, 0, 160, 170], ['turquoise', 130, 0, 150, 196], ['aqua', 160, 0, 150, 220]], { w: 240, h: 180 });
    }
  }

  /* ---------- sur ordinateur : la vitrine ----------
     La page ne démarre pas l'appli : elle la montre dans un téléphone (elle-même, dans un cadre : tout s'y
     passe comme sur un vrai, la largeur, la hauteur, le son, la fidélité), et la présente à côté.
     Même requête média que le petit script de <head>, qui choisit le mode avant le premier affichage. */
  const VITRINE = '(min-width: 900px) and (min-height: 600px) and (hover: hover) and (pointer: fine)';
  function initVitrine() {
    const v = $('#vitrine');
    if (!v) return;
    v.hidden = false;
    // l'appli, dans le téléphone (les réglages de l'adresse suivent : ?soir, ?intro, ?ouvert…)
    const u = new URL(location.href);
    u.searchParams.set('cadre', '1');
    $('#vt-app').src = u.pathname + u.search + (location.hash || '#accueil');
    // le téléphone (et sa présentation) tiennent toujours dans la fenêtre ; un peu plus grands sur un grand écran
    const cadrer = () => v.style.setProperty('--k', Math.min(1.12, (innerHeight - 40) / 868).toFixed(3));
    cadrer();
    addEventListener('resize', cadrer);
    // l'heure de la barre d'état : celle de Paris
    const heure = () => { const d = AC.parisNow(); $('#vt-heure').textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
    heure();
    setInterval(heure, 15000);
    // leur logo, avec sa cuillère
    if (AC.logoSVG) {
      const { svg } = AC.logoSVG({ couleur: '#3B2723' });
      svg.removeAttribute('role');
      svg.removeAttribute('aria-label');
      $('#vt-logo').appendChild(svg);
    }
    // leurs feuilles, dans deux coins de la page
    if (AC.bouquet) {
      AC.bouquet($('#vt-coin-hd'), [['aqua', 300, 4, 250, 226], ['turquoise', 306, -4, 232, 244], ['prune', 298, 10, 240, 212], ['marine', 304, 16, 170, 200], ['fuchsia', 310, 0, 226, 256], ['turquoise', 290, 6, 146, 270]], { w: 300, h: 300, par: 'xMaxYMin meet' });
      AC.bouquet($('#vt-coin-bg'), [['aqua', 0, 296, 250, 46], ['turquoise', -6, 304, 232, 64], ['prune', 2, 290, 240, 32], ['marine', -4, 284, 170, 20], ['fuchsia', -10, 300, 226, 76], ['aqua', 14, 288, 128, 70]], { w: 300, h: 300, par: 'xMinYMax meet' });
    }
    // le QR code de l'appli (l'adresse de la page, sans ses réglages)
    AC.charge('qrcode.js').then(() => {
      const qr = window.qrcode(0, 'M');
      qr.addData(location.origin + location.pathname);
      qr.make();
      const n = qr.getModuleCount();
      let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      $('#vt-qr').innerHTML = `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-hidden="true"><path d="${d}" fill="#2A1B18"/></svg>`;
    }).catch(() => {});
  }

  /* ---------- démarrage ---------- */
  async function init() {
    document.documentElement.classList.remove('no-js');
    // la fenêtre passe d'un mode à l'autre (on l'agrandit, on la rétrécit) : on recharge dans le bon
    const html = document.documentElement;
    if (!html.classList.contains('en-cadre') && window.matchMedia) {
      const mq = matchMedia(VITRINE), change = () => { if (mq.matches !== html.classList.contains('mode-vitrine')) location.reload(); };
      if (mq.addEventListener) mq.addEventListener('change', change); else if (mq.addListener) mq.addListener(change);
    }
    // la langue change dans le téléphone de la vitrine (ou dans un autre onglet) : on suit
    // (un ?lang= de l'adresse passerait devant ce choix : on le retire)
    addEventListener('storage', (e) => {
      try {
        if (e.key !== 'ac:lang' || !e.newValue || JSON.parse(e.newValue) === AC.lang) return;
        const params = location.search.slice(1).split('&').filter((x) => x && !/^lang=/.test(x));
        location.replace(location.pathname + (params.length ? '?' + params.join('&') : '') + location.hash);
      } catch (x) { /* valeur illisible */ }
    });
    if (html.classList.contains('mode-vitrine')) { initVitrine(); return; }
    initLangue();
    initSound();
    initSheets();
    initTabs();
    initHours();
    route(true);
    try { initBureau(); } catch (e) { console.warn('bureau', e); }
    // l'accueil d'abord ; la carte, le brunch et la fidélité à leur première ouverture, ou dans un temps
    // mort après la devanture (l'ouverture reste légère)
    const faits = new Set();
    const initMod = (m) => {
      if (faits.has(m)) return;
      faits.add(m);
      try { AC[m] && AC[m].init && AC[m].init(); } catch (e) { console.warn('module', m, e); }
    };
    const TARD = ['carte', 'brunch', 'fidelite'];
    ['logo', 'nous', 'accueil'].forEach(initMod);
    AC.on('view', (v) => { if (TARD.includes(v)) initMod(v); });
    if (TARD.includes(current)) initMod(current);
    const ric = (cb, o) => AC.ric(cb, o); // (Safari : un moment sans toucher ni défilement, voir ac-core.js)
    const tempsMort = () => {
      const m = TARD.find((x) => !faits.has(x));
      if (m) { initMod(m); ric(tempsMort, { timeout: 2500 }); return; }
      if (AC.table) AC.table.prechauffer(); // la table de la carte se prépare (dans l'atelier)
      // le salon, la comptine et la tablée : chargés d'avance, pour que leurs onglets s'ouvrent tout de suite
      ric(() => AC.charge(['ac-salon.js', 'ac-conte.js', 'ac-tablee.js']).catch(() => {}).then(() => ric(prechauffe, { timeout: 3000 })), { timeout: 4000 });
    };
    // puis les onglets pas encore ouverts se préparent, un par temps mort : affichés mais invisibles (leur mise en
    // page et leur scène — la tablée, le salon — se font maintenant, pas au premier toucher ; la scène joue son
    // entrée à la première visite), puis ils s'endorment (AC.endors). Leurs animations restent en pause (AC.ambiance).
    const aPreparer = ['carte', 'brunch', 'nous', 'fidelite', 'accueil'];
    const prechauffe = () => {
      let v;
      while ((v = aPreparer.shift()) && (v === current || document.getElementById(v).classList.contains('vue')));
      if (!v) return;
      initMod(v === 'accueil' ? 'accueil' : v);
      const el = document.getElementById(v);
      el.classList.add('vue');
      AC.emit('prechauffe', v);
      ric(() => { if (!el.classList.contains('is-active')) AC.endors(el, 400); prechauffe(); }, { timeout: 3000 });
    };
    const fac = initFacade();
    initVitre();
    const splash = AC.splash ? AC.splash() : Promise.resolve({ fromSplash: false });
    const [f, sp] = await Promise.all([fac, splash]);
    if (f) {
      if (!sp || !sp.skipped) await f.play({ withLetters: !(sp && sp.letters) });
      f.idle();
      hint();
    }
    setTimeout(() => ric(tempsMort, { timeout: 2500 }), 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
