/* ==========================================================================
   L'Armoire à Cuillères — noyau : hasard seedé, maths, couleurs, SVG, stockage, sons
   Scripts classiques (pas de modules) : le site s'ouvre aussi en file://
   ========================================================================== */
(function () {
  'use strict';

  const AC = (window.AC = window.AC || {});
  const SVGNS = 'http://www.w3.org/2000/svg';

  AC.reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- La langue : français, ou anglais ----------
     Le script de <head> a choisi (?lang=, le petit menu de l'accueil, sinon la langue du téléphone) et, en anglais,
     chargé le dictionnaire js/ac-en.js (window.AC_EN). Le texte français sert de clé :
       AC.t('Ouvert aujourd’hui')            → 'Open today' en anglais, le français sinon (ou s'il manque)
       AC.t('Bienvenue {nom} !', { nom })     → les {…} reçoivent leur valeur
     Les textes d'index.html sont traduits au démarrage (AC.traduirePage, en bas de ce fichier). */
  const racineDoc = typeof document !== 'undefined' && document.documentElement;
  AC.lang = racineDoc && racineDoc.lang === 'en' ? 'en' : 'fr';
  AC.en = AC.lang === 'en';
  const EN = (AC.en && typeof window !== 'undefined' && window.AC_EN) || {};
  const aCle = (k) => Object.prototype.hasOwnProperty.call(EN, k);
  AC.t = function (fr, vars) {
    let s = AC.en && aCle(fr) ? EN[fr] : fr;
    if (vars) s = String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  };
  /** Change de langue : on la garde, et on recharge (tout se reconstruit dans la nouvelle langue ; même onglet) */
  AC.choisirLangue = function (l) {
    let garde = false;
    try { localStorage.setItem('ac:lang', JSON.stringify(l)); garde = true; } catch (e) { /* navigation privée : dans l'adresse */ }
    // (les autres réglages de l'adresse gardent leur forme : ?nointro, ?soir…)
    const params = location.search.slice(1).split('&').filter((x) => x && !/^lang=/.test(x));
    if (!garde) params.push('lang=' + l);
    const url = location.pathname + (params.length ? '?' + params.join('&') : '') + location.hash;
    // (une adresse identique à un # près ne recharge pas la page : on recharge nous-mêmes)
    if (url === location.pathname + location.search + location.hash) location.reload(); else location.replace(url);
  };

  /* ---------- Hasard déterministe (mulberry32) ---------- */
  AC.rng = function (seed) {
    let a = seed >>> 0;
    const r = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (min, max) => min + r() * (max - min);
    r.int = (min, max) => Math.floor(min + r() * (max - min + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.sign = () => (r() < 0.5 ? -1 : 1);
    return r;
  };

  /* FNV-1a : une chaîne → une graine */
  AC.hash = function (str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  AC.newSeed = () => (Math.random() * 4294967296) >>> 0;

  /* Bruit simplex 2D seedé (Gustavson) → [-1, 1] */
  AC.noise2 = function (seed) {
    const r = AC.rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    const perm = new Uint8Array(512), pm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm[i] = perm[i] % 12; }
    const G = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1];
    const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
    return function (xin, yin) {
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const x0 = xin - i + t, y0 = yin - j + t;
      const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let n = 0, tt, g;
      tt = 0.5 - x0 * x0 - y0 * y0;
      if (tt > 0) { g = pm[ii + perm[jj]] * 2; tt *= tt; n += tt * tt * (G[g] * x0 + G[g + 1] * y0); }
      tt = 0.5 - x1 * x1 - y1 * y1;
      if (tt > 0) { g = pm[ii + i1 + perm[jj + j1]] * 2; tt *= tt; n += tt * tt * (G[g] * x1 + G[g + 1] * y1); }
      tt = 0.5 - x2 * x2 - y2 * y2;
      if (tt > 0) { g = pm[ii + 1 + perm[jj + 1]] * 2; tt *= tt; n += tt * tt * (G[g] * x2 + G[g + 1] * y2); }
      return 70 * n;
    };
  };

  /* ---------- Maths ---------- */
  AC.clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  AC.lerp = (a, b, t) => a + (b - a) * t;
  AC.prog = (t, a, b) => AC.clamp((t - a) / (b - a)); // avancement de t dans [a, b]
  AC.TAU = Math.PI * 2;
  AC.angDiff = (a, b) => {
    let d = (a - b) % AC.TAU;
    if (d > Math.PI) d -= AC.TAU;
    if (d < -Math.PI) d += AC.TAU;
    return d;
  };

  AC.ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    outElastic: (t) =>
      t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  };

  /* ---------- Couleurs ---------- */
  AC.hex2rgb = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  AC.rgb2hex = (r, g, b) =>
    '#' + [r, g, b].map((v) => Math.round(AC.clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  AC.mix = (a, b, t) => {
    const A = AC.hex2rgb(a), B = AC.hex2rgb(b);
    return AC.rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  };
  AC.shade = (c, amt) => (amt >= 0 ? AC.mix(c, '#ffffff', amt) : AC.mix(c, '#000000', -amt));

  /* ---------- SVG ---------- */
  AC.svg = function (tag, attrs, parent) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };

  let uidCount = 0;
  AC.uid = (p) => (p || 'ac') + (++uidCount).toString(36);

  const f = (n) => Math.round(n * 100) / 100;
  AC.f = f;

  /* Catmull-Rom fermé → courbes de Bézier. tension 0 = polygone, 1 = lisse */
  AC.closedPath = function (pts, tension = 1) {
    const n = pts.length;
    if (n < 3) return '';
    const k = tension / 6;
    let d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += 'C' + f(p1[0] + (p2[0] - p0[0]) * k) + ' ' + f(p1[1] + (p2[1] - p0[1]) * k) + ' ' +
        f(p2[0] - (p3[0] - p1[0]) * k) + ' ' + f(p2[1] - (p3[1] - p1[1]) * k) + ' ' +
        f(p2[0]) + ' ' + f(p2[1]);
    }
    return d + 'Z';
  };

  /* Catmull-Rom ouvert (fissures, filets) */
  AC.openPath = function (pts) {
    const n = pts.length;
    if (n < 2) return '';
    let d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      d += 'C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        f(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f(p2[1] - (p3[1] - p1[1]) / 6) + ' ' +
        f(p2[0]) + ' ' + f(p2[1]);
    }
    return d;
  };

  /* ---------- Animation ---------- */
  AC.tween = (dur, fn, ease = AC.ease.linear) =>
    new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.max(0, Math.min(1, (now - t0) / dur)); // (l'horodatage de l'image peut précéder t0)
        fn(ease(p), p);
        if (p < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  AC.wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- Des scripts chargés à la demande (le salon, la comptine, la tablée, le QR code) ----------
     Même estampille ?v= que ce fichier ; chacun une seule fois, dans l'ordre donné → Promise */
  const VERSION = (() => {
    try { const s = document.currentScript, i = s && s.src ? s.src.indexOf('?') : -1; return i >= 0 ? s.src.slice(i) : ''; } catch (e) { return ''; }
  })();
  const charges = new Map();
  AC.charge = (fichiers) => [].concat(fichiers).reduce((p, f) => p.then(() => {
    if (!charges.has(f)) {
      charges.set(f, new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = 'js/' + f + VERSION;
        s.onload = ok;
        s.onerror = () => { charges.delete(f); ko(new Error('script introuvable : ' + f)); };
        document.head.appendChild(s);
      }));
    }
    return charges.get(f);
  }), Promise.resolve());

  /* ---------- Formats ---------- */
  const nfEUR = new Intl.NumberFormat(AC.en ? 'en-GB' : 'fr-FR', { style: 'currency', currency: 'EUR' });
  AC.fmtPrice = (n) => nfEUR.format(n);
  AC.pad = (n, l = 4) => String(n).padStart(l, '0');

  /* Heure de Paris, quel que soit le fuseau du visiteur (un seul formateur : en créer un à chaque appel coûte cher) */
  let fmtParis = null;
  AC.parisNow = function () {
    try {
      if (!fmtParis) fmtParis = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
      const p = {};
      fmtParis.formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
      return new Date(+p.year, p.month - 1, +p.day, p.hour % 24, +p.minute, +p.second);
    } catch (e) {
      return new Date();
    }
  };

  AC.vibrate = (ms) => {
    try {
      const ua = navigator.userActivation;
      if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(ms);
    } catch (e) { /* iOS : pas de vibration */ }
  };

  /* ---------- Stockage local (maquette ; en prod → base de données) ---------- */
  AC.store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('ac:' + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem('ac:' + k, JSON.stringify(v)); } catch (e) { /* navigation privée */ }
    },
    del(k) {
      try { localStorage.removeItem('ac:' + k); } catch (e) { /* idem */ }
    },
  };

  /* ---------- Petit bus d'événements ---------- */
  const listeners = {};
  AC.on = (ev, fn) => ((listeners[ev] = listeners[ev] || []).push(fn));
  AC.emit = (ev, data) => (listeners[ev] || []).forEach((fn) => fn(data));

  /* ---------- L'ambiance : les animations décoratives sans fin (feuillages, vapeur, reflets…) ----------
     Deux façons de les faire tourner, et seulement quand leur scène se voit (son onglet est ouvert, elle est dans
     la fenêtre, la page est au premier plan) ; sinon elles s'arrêtent net et ne coûtent plus rien.
     1) Sur un calque (AC.monde, plus bas) : l'élément est seul sur son <svg>, l'animation (transform, opacity) est
        jouée par le compositeur, à 60 images/s, sans jamais repeindre le dessin. C'est la règle.
          AC.ambiance.joue(animation, scene)        une animation Web (sans fin, ou un geste), sur un calque : en pause hors de
                                                    vue (sinon Chrome la fait tourner sur le fil principal, onglet caché ou non)
          AC.ambiance.lache(animation)              ne plus la suivre
          AC.ambiance.balance(calques, scene, opts)  des calques qui se balancent (rotation autour d'un pivot)
     2) Dans le dessin (ce qui ne peut pas sortir sur un calque) : on l'avance nous-mêmes, à petite cadence
        (12 images/s) : chaque image repeint le dessin, c'est cher.
          AC.ambiance.anime(animation, scene, ips)  une animation Web sans fin (mise en pause, puis avancée par nous)
          AC.ambiance.pilote(fn, scene, ips)        une fonction fn(t) qui dessine l'instant t (ms, le temps de la
                                                    scène) ; ips : un nombre, ou une fonction de t
     AC.ambiance.visible(scene) : la scène se voit-elle ? (pour les petites vies à minuteur) */
  AC.ambiance = (function () {
    const scenes = new Map(); // élément → { vue, dedans, items : Map<Animation | fonction, { ips, der, t }>, natifs : Set<Animation> }
    // l'onglet ouvert, et l'instant où il a fini d'arriver (il entre en fondu). Une animation relancée pendant que son
    // élément est invisible (opacité 0, hors de l'écran, sans taille), Chrome la juge « sans changement visible » et la
    // fait tourner ensuite sur le fil principal, à chaque image : on attend donc que l'onglet soit là pour la relancer.
    let vue = null, stable = 0, minuteur = 0, raf = 0;
    // (vraiment dans la fenêtre : une scène qui la touche seulement par un bord, juste au-dessus ou au-dessous, n'y est
    // pas — le seuil 0,01 prévient quand elle y entre pour de bon)
    const io = window.IntersectionObserver ? new IntersectionObserver((es) => {
      es.forEach((e) => { const s = scenes.get(e.target); if (s) s.dedans = e.isIntersecting && e.intersectionRatio > 0; });
      relance();
    }, { threshold: [0, 0.01] }) : null;
    function scene(el) {
      let s = scenes.get(el);
      if (!s) {
        const v = el.closest && el.closest('.view');
        s = { vue: v ? v.id : null, dedans: !io, items: new Map(), natifs: new Set() };
        scenes.set(el, s);
        if (io) io.observe(el);
      }
      return s;
    }
    const active = (s) => s.dedans && (!s.vue || (s.vue === vue && performance.now() >= stable)) && !document.hidden;
    // les animations du compositeur : jouées quand leur scène se voit, en pause sinon
    function bascule() {
      scenes.forEach((s, el) => {
        if (!s.natifs.size) return;
        const on = el.isConnected && active(s);
        s.natifs.forEach((a) => {
          const t = a.effect && a.effect.target;
          if (a.playState === 'idle' || (t && !t.isConnected)) { s.natifs.delete(a); return; }
          if (on && a.playState === 'paused') a.play();
          else if (!on && a.playState === 'running') a.pause();
        });
      });
    }
    function image(now) {
      raf = 0;
      if (document.hidden) return;
      let ips = 0;
      scenes.forEach((s, el) => {
        if (!el.isConnected) { scenes.delete(el); if (io) io.unobserve(el); return; }
        if (!active(s)) return;
        s.items.forEach((it, x) => {
          const fn = typeof x === 'function';
          if (!fn) {
            const t = x.effect && x.effect.target;
            if (x.playState === 'idle' || (t && !t.isConnected)) { s.items.delete(x); return; }
          }
          const cad = typeof it.ips === 'function' ? it.ips(it.t) : it.ips;
          ips = Math.max(ips, cad);
          const pas = 1000 / cad, dt = it.der ? now - it.der : pas;
          if (dt < pas * 0.7) return; // pas encore son tour
          it.der = now;
          const avance = Math.min(dt, pas * 2); // au retour d'une pause : on reprend sans sauter
          if (fn) { it.t += avance; x(it.t); }
          else x.currentTime = (x.currentTime || 0) + avance;
        });
      });
      if (ips) minuteur = setTimeout(demande, 750 / ips);
    }
    function demande() { minuteur = 0; if (!raf) raf = requestAnimationFrame(image); }
    function relance() { bascule(); if (!minuteur && !raf) demande(); }
    function pilote(fn, el, ips = 24) {
      scene(el).items.set(fn, { ips, der: 0, t: 0 });
      relance();
    }
    function joue(a, el) {
      const t = el || (a && a.effect && a.effect.target);
      if (!a || !t) return a;
      const s = scene(t);
      s.natifs.add(a);
      // (un geste fini ou annulé n'est plus suivi ; une animation sans fin, toujours)
      if (a.finished) a.finished.then(() => s.natifs.delete(a), () => s.natifs.delete(a));
      if (!(t.isConnected && active(s))) a.pause();
      return a;
    }
    let stableT = 0;
    AC.on('view', (v) => {
      vue = v;
      stable = performance.now() + 460; // (la transition d'un onglet : .38 s)
      relance();
      clearTimeout(stableT);
      stableT = setTimeout(relance, 480);
    });
    document.addEventListener('visibilitychange', relance);
    return {
      joue,
      /** l'animation n'est plus suivie par l'ambiance (on la gère soi-même) */
      lache(a) { scenes.forEach((sc) => sc.natifs.delete(a)); },
      anime(a, el, ips = 12) {
        const t = el || (a && a.effect && a.effect.target);
        if (!a || !t) return a;
        a.pause();
        scene(t).items.set(a, { ips, der: 0, t: 0 });
        relance();
        return a;
      },
      pilote,
      /** de `de` à `a` degrés et retour, adouci, en periode(i) ms ; decale(i) : l'avance de l'élément i (ms) ;
          pivot(i) : [x, y] dans le repère du dessin (sinon l'origine de l'élément).
          Des calques (AC.monde) : le compositeur les balance ; des éléments SVG : leur attribut transform, à 12 images/s. */
      balance(els, el, { de, a, periode, decale = () => 0, pivot = () => null }) {
        if (els.length && els[0] && els[0].svg) {
          return els.map((c, i) => {
            const o = pivot(i) || c.origine;
            if (o) c.svg.style.transformOrigin = `${AC.f(o[0] - c.x)}px ${AC.f(o[1] - c.y)}px`;
            const P = periode(i);
            return joue(c.svg.animate([{ transform: `rotate(${de}deg)` }, { transform: `rotate(${a}deg)` }],
              { duration: P, delay: -((decale(i) % (2 * P)) + 2 * P) % (2 * P), direction: 'alternate', iterations: Infinity, easing: 'cubic-bezier(.37,0,.63,1)' }), el);
          });
        }
        const P = els.map((_, i) => periode(i)), D = els.map((_, i) => decale(i)), O = els.map((_, i) => pivot(i)), der = els.map(() => '');
        pilote((t) => els.forEach((g, i) => {
          const u = (t + D[i]) / P[i], k = Math.floor(u), x = u - k;
          const v = (de + (a - de) * (1 - Math.cos(Math.PI * (k % 2 ? 1 - x : x))) / 2).toFixed(2);
          if (v === der[i]) return;
          der[i] = v;
          g.setAttribute('transform', O[i] ? `rotate(${v} ${O[i][0]} ${O[i][1]})` : `rotate(${v})`);
        }), el, 12);
        return null;
      },
      visible(el) {
        if (document.hidden) return false;
        const s = scenes.get(el);
        return s ? active(s) : true;
      },
    };
  })();

  /* ---------- Un temps mort : requestIdleCallback, ou (Safari ne l'a pas) un moment sans toucher ni défilement ----------
     AC.ric(fn, { timeout }) : fn quand le téléphone ne fait rien d'autre ; au plus tard après timeout ms */
  let dernierGeste = -1e9;
  if (typeof document !== 'undefined' && document.addEventListener) {
    ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach((t) => addEventListener(t, () => { dernierGeste = performance.now(); }, { capture: true, passive: true }));
    document.addEventListener('scroll', () => { dernierGeste = performance.now(); }, { capture: true, passive: true });
  }
  AC.ric = function (fn, { timeout = 3000 } = {}) {
    if (window.requestIdleCallback) return requestIdleCallback(fn, { timeout });
    const t0 = performance.now();
    const essai = () => {
      const calme = performance.now() - dernierGeste > 900;
      if (calme || performance.now() - t0 > timeout) fn({ didTimeout: !calme, timeRemaining: () => (calme ? 12 : 0) });
      else setTimeout(essai, 350);
    };
    return setTimeout(essai, 250);
  };

  /** fn(), une fois, dès que el est affiché (mesurable) : tout de suite, ou quand son onglet s'ouvre */
  AC.quandAffiche = function (el, fn) {
    const ok = () => el.isConnected && el.getBoundingClientRect().width > 0;
    if (ok() || !window.ResizeObserver) { fn(); return; }
    // (fn à l'image suivante : sortir des calques pendant le rappel relancerait les autres observateurs dans la même image)
    const ro = new ResizeObserver(() => { if (ok()) { ro.disconnect(); requestAnimationFrame(fn); } });
    ro.observe(el);
  };

  /* ---------- Les calques : un morceau d'un dessin SVG sur sa propre couche du compositeur ----------
     Dans un grand dessin SVG, tout ce qui bouge oblige le navigateur à repeindre le dessin, sur le fil principal,
     à chaque image : c'est ce qui essouffle un téléphone. Sorti sur son propre <svg> (un calque), posé exactement
     au même endroit et dans le même ordre, un élément s'anime (transform, opacity) sur le compositeur : 60 images/s,
     et le dessin n'est plus repeint.
       const m = AC.monde(svg)       le plan des calques d'un dessin : un <div> juste après lui, qui suit son cadrage
                                     (viewBox, preserveAspectRatio, taille ; le <svg> doit remplir son parent, qui est
                                     positionné) ; dans le plan, 1 unité du dessin = 1 px CSS
       const c = m.calque(el, opts)  sort el sur un calque, avec ses parents en coquilles (mêmes attributs : transform,
                                     clip-path, filter…) ; c.svg : le calque à animer, c.x, c.y : son coin (unités du
                                     dessin), c.coque(g) : la coquille d'un parent g, c.rentre() : tout remettre en place.
                                     opts.marge (unités), opts.fige (taille fixe, pour un dessin qui change à chaque image),
                                     opts.cible (il reçoit les touchers), opts.boite ([x, y, w, h] :
                                     la place du calque, sinon celle de l'élément), opts.enveloppe (le <svg> dans un <div>,
                                     c.boite, qu'on peut découper (clip-path) ou animer à part)
     Les calques se rangent dans l'ordre du dessin (un repère reste à la place de chaque élément sorti) ; un
     « mix-blend-mode » d'un parent passe sur le calque (il se mélange avec ce qui est dessous, comme avant). */
  AC.monde = function (svg) {
    const plan = document.createElement('div');
    plan.className = 'ac-monde';
    // (l'essentiel en style : le plan marche aussi sans la feuille de style de l'appli, dans les pages du labo)
    Object.assign(plan.style, { position: 'absolute', left: '0', top: '0', width: '0', height: '0', transformOrigin: '0 0', pointerEvents: 'none' });
    const parent = svg.parentNode;
    if (parent && getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    svg.after(plan);
    const calques = []; // { noeud (le calque, ou son enveloppe), marque }
    function cadre() {
      const vb = svg.viewBox && svg.viewBox.baseVal, W = svg.clientWidth, H = svg.clientHeight;
      if (!vb || !vb.width || !vb.height || !W || !H) return;
      const par = svg.preserveAspectRatio.baseVal, al = par.align;
      let sx = W / vb.width, sy = H / vb.height;
      if (al !== 1) { const s = par.meetOrSlice === 2 ? Math.max(sx, sy) : Math.min(sx, sy); sx = sy = s; }
      const fx = al < 2 ? 0 : [0, 0.5, 1][(al - 2) % 3], fy = al < 2 ? 0 : [0, 0.5, 1][Math.floor((al - 2) / 3)];
      const tx = (W - vb.width * sx) * fx - vb.x * sx, ty = (H - vb.height * sy) * fy - vb.y * sy;
      plan.style.transform = `matrix(${sx}, 0, 0, ${sy}, ${tx}, ${ty})`;
    }
    cadre();
    if (window.ResizeObserver) new ResizeObserver(cadre).observe(svg);
    if (window.MutationObserver) new MutationObserver(cadre).observe(svg, { attributes: true, attributeFilter: ['viewBox', 'preserveAspectRatio'] });
    /** la matrice de el (son repère) vers le repère du dessin, par ses attributs transform */
    function versDessin(el) {
      let m = new DOMMatrix();
      for (let n = el; n && n !== svg; n = n.parentNode) {
        const tl = n.transform && n.transform.baseVal, c = tl && tl.numberOfItems ? tl.consolidate() : null;
        if (c) { const x = c.matrix; m = new DOMMatrix([x.a, x.b, x.c, x.d, x.e, x.f]).multiply(m); }
      }
      return m;
    }
    function calque(el, { marge = 2, cible = false, boite = null, enveloppe = false, fige = false } = {}) {
      let x, y, w, h;
      const m = versDessin(el);
      if (boite) [x, y, w, h] = boite;
      else {
        const b = el.getBBox();
        const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([px, py]) => m.transformPoint(new DOMPoint(px, py)));
        x = Math.min(...pts.map((p) => p.x)); y = Math.min(...pts.map((p) => p.y));
        w = Math.max(...pts.map((p) => p.x)) - x; h = Math.max(...pts.map((p) => p.y)) - y;
      }
      x = Math.floor(x - marge); y = Math.floor(y - marge); w = Math.ceil(w + 2 * marge + 1); h = Math.ceil(h + 2 * marge + 1);
      const c = AC.svg('svg', { class: enveloppe ? 'ac-dedans' : 'ac-calque', viewBox: `${x} ${y} ${w} ${h}`, width: w, height: h, 'aria-hidden': 'true', focusable: 'false' });
      // (sa taille et sa place en style : aucune règle de la page, « .hote svg { width: 100% } » par exemple, ne les change)
      // (fige : un calque dont le dessin change à chaque image, par le fil principal (les bras de Mallo) : sa propre
      // couche, toujours (sinon il serait peint avec ce qui est dessous, et tout serait repeint avec lui), de taille
      // fixe (sa boîte coupe ce qui déborde : ses bornes ne bougent pas avec lui)
      Object.assign(c.style, { position: 'absolute', width: w + 'px', height: h + 'px', maxWidth: 'none', right: 'auto', bottom: 'auto', overflow: fige ? 'hidden' : 'visible', willChange: fige ? 'transform' : '' });
      let noeud = c;
      if (enveloppe) {
        noeud = document.createElement('div');
        noeud.className = 'ac-calque ac-enveloppe';
        Object.assign(noeud.style, { position: 'absolute', width: w + 'px', height: h + 'px', right: 'auto', bottom: 'auto' });
        Object.assign(c.style, { left: '0px', top: '0px' });
        noeud.appendChild(c);
      }
      noeud.style.left = x + 'px';
      noeud.style.top = y + 'px';
      // les parents, du plus haut au plus proche, en coquilles vides qui gardent leurs attributs
      const chaine = [];
      for (let n = el.parentNode; n && n !== svg; n = n.parentNode) chaine.unshift(n);
      const coques = new Map();
      let dans = c;
      chaine.forEach((p) => {
        const g = AC.svg('g', null, dans);
        [...p.attributes].forEach((at) => { if (at.name !== 'id') g.setAttribute(at.name, at.value); });
        const mix = p.style && p.style.mixBlendMode;
        if (mix && mix !== 'normal') { noeud.style.mixBlendMode = mix; g.style.mixBlendMode = ''; }
        coques.set(p, g);
        dans = g;
      });
      if (el.style && el.style.mixBlendMode && el.style.mixBlendMode !== 'normal') noeud.style.mixBlendMode = el.style.mixBlendMode;
      const marque = document.createComment('calque');
      el.replaceWith(marque);
      dans.appendChild(el);
      if (cible) el.style.pointerEvents = 'auto';
      // à sa place dans l'ordre du dessin : avant le premier calque dont le repère vient après le sien
      const apres = calques.find((k) => marque.compareDocumentPosition(k.marque) & Node.DOCUMENT_POSITION_FOLLOWING);
      plan.insertBefore(noeud, apres ? apres.noeud : null);
      const k = { noeud, marque };
      calques.push(k);
      return {
        svg: c, boite: enveloppe ? noeud : null, el, x, y, w, h,
        coque: (p) => coques.get(p) || null,
        rentre() {
          if (!marque.parentNode) return;
          marque.replaceWith(el);
          if (cible) el.style.pointerEvents = '';
          noeud.remove();
          const i = calques.indexOf(k);
          if (i >= 0) calques.splice(i, 1);
        },
      };
    }
    return { plan, calque, cadre, versDessin };
  };


  /* ---------- Sons : un sound design léger, synthétisé (WebAudio, aucun fichier) ----------
     Doux et discrets : ils ne démarrent qu'après un premier geste, suivent le mode
     silencieux de l'iPhone et se coupent d'un geste (haut-parleur de la barre du haut).
     AC.sfx.play('nom', { delay, gain, … })   son ponctuel (delay en ms)
     AC.sfx.channel(gain)                     sous-bus qu'on coupe net (l'ambiance de la rue)
     Tout bouton ou lien sans son dédié fait un petit « toc » ; data-sfx="nom" en choisit un
     autre (data-sfx-i : sa note), data-sfx="none" le rend muet. */
  AC.sfx = (function () {
    const ACtx = window.AudioContext || window.webkitAudioContext;
    let ctx = null, bus = null, noiseBuf = null;
    let on = AC.store.get('sound', true);
    let gestureAt = -1e9, lastAny = -1e9;
    const lastBy = {};

    /* bus principal : volume général + limiteur doux */
    function makeBus(c) {
      const master = c.createGain();
      master.gain.value = 0.85;
      const lim = c.createDynamicsCompressor();
      lim.threshold.value = -14;
      lim.knee.value = 8;
      lim.ratio.value = 10;
      lim.attack.value = 0.002;
      lim.release.value = 0.12;
      master.connect(lim).connect(c.destination);
      return master;
    }

    /* déblocage : il faut un geste de l'utilisateur */
    function unlock() {
      gestureAt = performance.now();
      if (!on || !ACtx) return;
      if (!ctx) {
        try {
          // « ambient » : se mélange à la musique en cours et respecte le mode silencieux
          if (navigator.audioSession) navigator.audioSession.type = 'ambient';
        } catch (e) { /* API absente */ }
        try {
          ctx = new ACtx();
          bus = makeBus(ctx);
        } catch (e) {
          ctx = null;
          return;
        }
      }
      if (ctx.state !== 'running') {
        ctx.resume().catch(() => {});
        try {
          // iOS : un tampon muet joué pendant le geste ouvre la sortie audio
          const s = ctx.createBufferSource();
          s.buffer = ctx.createBuffer(1, 1, 22050);
          s.connect(ctx.destination);
          s.start(0);
        } catch (e) { /* rien */ }
      }
    }
    ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach((type) => {
      window.addEventListener(type, unlock, { capture: true, passive: true });
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) ctx.suspend().catch(() => {});
        else if (on) ctx.resume().catch(() => {});
      });
    }

    /* contexte utilisable maintenant (sinon rien : pas de sons en attente rejoués d'un coup) */
    function live() {
      if (!on || !ctx) return null;
      if (ctx.state === 'running') return ctx;
      if (ctx.state === 'suspended' && performance.now() - gestureAt < 400) return ctx;
      return null;
    }

    /* ---------- briques de synthèse ---------- */
    function noiseB(c) {
      if (!noiseBuf) {
        noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      return noiseBuf;
    }
    // enveloppe : attaque courte (sans clic), tenue, puis extinction exponentielle
    function env(c, t, a, d, v, hold = 0) {
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + a);
      g.gain.setTargetAtTime(0, t + a + hold, d / 5);
      return g;
    }
    const tail = (t, a, d, hold = 0) => t + a + hold + d * 1.3 + 0.02;
    function tone(c, dst, t, { f, f2, glide, type = 'sine', a = 0.004, d = 0.15, v = 0.1, hold = 0 }) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + (glide != null ? glide : a + d * 0.7));
      o.connect(env(c, t, a, d, v, hold)).connect(dst);
      o.start(t);
      o.stop(tail(t, a, d, hold));
    }
    function noise(c, dst, t, { f = 1200, f2, q = 0.8, type = 'bandpass', a = 0.004, d = 0.1, v = 0.08, hold = 0 }) {
      const src = c.createBufferSource();
      src.buffer = noiseB(c);
      src.loop = true;
      const flt = c.createBiquadFilter();
      flt.type = type;
      flt.Q.value = q;
      flt.frequency.setValueAtTime(f, t);
      if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + a + hold + d);
      src.connect(flt).connect(env(c, t, a, d, v, hold)).connect(dst);
      src.start(t, Math.random() * 1.5);
      src.stop(tail(t, a, d, hold));
    }
    // corps résonnants : [rapport de fréquence, niveau, durée relative]
    const BODY = {
      marimba: [[1, 1, 1], [3.93, 0.22, 0.28], [9.2, 0.05, 0.12]],
      wood: [[1, 1, 1], [2.45, 0.42, 0.5], [5.2, 0.12, 0.3]],
      bell: [[1, 1, 1], [2.76, 0.32, 0.55], [5.4, 0.12, 0.3], [8.93, 0.04, 0.18]],
      ceramic: [[1, 1, 1], [2.32, 0.5, 0.7], [4.25, 0.22, 0.45], [6.63, 0.1, 0.3]],
      metal: [[1, 1, 1], [2.1, 0.55, 0.8], [3.7, 0.3, 0.6], [5.9, 0.14, 0.4]],
    };
    function strike(c, dst, t, f, body, { d = 0.3, v = 0.1, a = 0.002 } = {}) {
      BODY[body].forEach(([r, amp, dk]) => {
        if (f * r < 15000) tone(c, dst, t, { f: f * r, a, d: d * dk, v: v * amp });
      });
    }
    const PENTA = [0, 2, 4, 7, 9];
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const penta = (i, base = 72) => midi(base + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5]);
    const rnd = (a, b) => a + Math.random() * (b - a);

    /* ---------- la palette (registre médium-aigu : les haut-parleurs de téléphone
       ne rendent presque rien sous 300 Hz) ---------- */
    const SOUNDS = {
      // --- l'appli
      tap(c, o, t) { // bouton quelconque : petit « toc » feutré, comme un doigt sur une table en bois
        tone(c, o, t, { f: 760, f2: 520, a: 0.003, d: 0.07, v: 0.07 });
        tone(c, o, t, { f: 1520, a: 0.002, d: 0.03, v: 0.014 });
      },
      tab(c, o, t, { i = 0 }) { // onglets : une petite cuillère qui tinte sur une tasse, la note monte vers la droite
        const f = penta(i + 3, 79);
        strike(c, o, t, f, 'ceramic', { d: 0.3, v: 0.05 });
        tone(c, o, t, { f: f * 2.01, a: 0.001, d: 0.06, v: 0.01 });
      },
      chip(c, o, t, { i = 0 }) { // filtres, choix d'un cru : lames de marimba
        strike(c, o, t, penta(i + 1, 74), 'marimba', { d: 0.24, v: 0.06 });
      },
      on(c, o, t) {
        strike(c, o, t, midi(79), 'ceramic', { d: 0.25, v: 0.06 });
        strike(c, o, t + 0.07, midi(86), 'ceramic', { d: 0.35, v: 0.06 });
      },
      open(c, o, t) { noise(c, o, t, { f: 380, f2: 1600, q: 0.9, a: 0.06, d: 0.18, v: 0.08 }); },
      close(c, o, t) { noise(c, o, t, { f: 1400, f2: 380, q: 0.9, a: 0.02, d: 0.15, v: 0.055 }); },
      pop(c, o, t, { m }) { // (m : il se pose sur cette note, MIDI)
        const f = m ? midi(m) : 1080;
        tone(c, o, t, { f: f * 0.48, f2: f, glide: 0.05, a: 0.003, d: m ? 0.13 : 0.08, v: 0.08 });
      },
      up(c, o, t) { tone(c, o, t, { f: 900, f2: 1200, glide: 0.03, a: 0.002, d: 0.04, v: 0.045 }); },
      down(c, o, t) { tone(c, o, t, { f: 1100, f2: 820, glide: 0.03, a: 0.002, d: 0.04, v: 0.045 }); },
      page(c, o, t) { // une page de la carte qu'on tourne
        noise(c, o, t, { f: 900, f2: 3200, q: 0.7, a: 0.05, d: 0.16, v: 0.05 });
        noise(c, o, t + 0.12, { f: 2600, f2: 1200, q: 0.9, a: 0.01, d: 0.07, v: 0.02 });
      },
      chalk(c, o, t, { n = 4 }) { // la craie sur l'ardoise
        let tt = t;
        for (let k = 0; k < n; k++) {
          noise(c, o, tt, { f: rnd(2600, 4200), f2: rnd(1800, 3000), q: 2.2, a: 0.006, d: rnd(0.05, 0.1), v: 0.045, hold: rnd(0.02, 0.06) });
          tt += rnd(0.07, 0.12);
        }
      },

      // --- la boutique
      bell(c, o, t, { v = 1 }) { // la clochette de la porte : un grelot de laiton secoué, puis qui s'éteint
        const hits = [0, 0.085, 0.16, 0.27, 0.36];
        hits.forEach((dt, k) => {
          const f = rnd(2380, 2470) * (k % 2 ? 1.0 : 1.012);
          strike(c, o, t + dt, f, 'bell', { d: 1.3 - k * 0.12, v: (0.05 - k * 0.006) * v });
          strike(c, o, t + dt + 0.004, f * 1.498, 'bell', { d: 0.6, v: 0.012 * v });
          noise(c, o, t + dt, { f: 6200, type: 'highpass', a: 0.001, d: 0.012, v: 0.012 * v });
        });
      },
      creak(c, o, t) { // une porte en bois qui s'ouvre, à peine
        tone(c, o, t, { f: 210, f2: 290, glide: 0.35, type: 'sawtooth', a: 0.08, d: 0.25, v: 0.006 });
        noise(c, o, t, { f: 700, f2: 1100, q: 3, a: 0.1, d: 0.3, v: 0.018 });
      },
      chirp(c, o, t, { n = 3, base = 5200 }) { // une mésange : « tsi-tsi-tsi », de petits sifflements qui glissent
        for (let k = 0; k < n; k++) {
          const f = base * rnd(0.94, 1.06);
          tone(c, o, t + k * rnd(0.09, 0.12), { f: f * 1.08, f2: f * 0.86, glide: 0.05, a: 0.004, d: 0.05, v: 0.028 });
        }
      },
      trill(c, o, t) { // la réponse, un roulé plus bas
        for (let k = 0; k < 7; k++) tone(c, o, t + k * 0.035, { f: rnd(3600, 3900), f2: rnd(3000, 3300), glide: 0.02, a: 0.002, d: 0.025, v: 0.018 });
      },
      flutter(c, o, t) { // les ailes : quelques battements feutrés
        for (let k = 0; k < 5; k++) noise(c, o, t + k * 0.045, { f: rnd(900, 1500), q: 0.8, a: 0.004, d: 0.03, v: 0.03 });
      },
      rustle(c, o, t) { // les branches séchées de la corniche
        for (let k = 0; k < 6; k++) noise(c, o, t + k * 0.03 + Math.random() * 0.03, { f: rnd(3000, 6000), q: 1.4, a: 0.002, d: rnd(0.02, 0.05), v: rnd(0.012, 0.022) });
      },
      sign(c, o, t) { // l'enseigne drapeau qui grince sur son crochet
        tone(c, o, t, { f: 1250, f2: 1480, glide: 0.18, type: 'triangle', a: 0.03, d: 0.12, v: 0.01 });
        strike(c, o, t + 0.2, 900, 'metal', { d: 0.08, v: 0.012 });
      },
      letter(c, o, t, { m = 79 }) { // chaque lettre de l'enseigne : une lame de boîte à musique
        strike(c, o, t, midi(m), 'bell', { d: 0.5, v: 0.05 });
        tone(c, o, t, { f: midi(m) * 3.01, a: 0.001, d: 0.05, v: 0.008 });
      },

      // --- la vaisselle (m : accordée sur cette note, MIDI — la tablée du brunch en fait une mélodie ; tenue : sa
      // résonance, en multiple)
      clink(c, o, t, { v = 1, m, tenue = 1 }) { // la tasse posée sur sa soucoupe
        const f = m ? midi(m) : rnd(1420, 1560);
        strike(c, o, t, f, 'ceramic', { d: (m ? 0.34 : 0.22) * tenue, v: 0.055 * v });
        strike(c, o, t + 0.012, m ? f * 1.5 : rnd(2250, 2400), 'ceramic', { d: 0.14, v: (m ? 0.012 : 0.02) * v }); // (accordée : sa quinte)
        noise(c, o, t, { f: 3400, q: 1.2, a: 0.001, d: 0.02, v: 0.02 * v });
      },
      plate(c, o, t, { m, tenue = 1 }) { // une assiette qu'on pose sur la table
        strike(c, o, t, m ? midi(m) : 980, 'ceramic', { d: (m ? 0.4 : 0.3) * tenue, v: 0.045 });
        strike(c, o, t, 330, 'wood', { d: 0.07, v: 0.03 });
      },
      spoon(c, o, t, { m }) { // la petite cuillère posée sur la soucoupe
        const f = m ? midi(m) : rnd(3100, 3400);
        strike(c, o, t, f, 'metal', { d: m ? 0.3 : 0.16, v: 0.03 });
        strike(c, o, t + 0.05, m ? f * 2 : rnd(2600, 2800), 'metal', { d: 0.1, v: 0.014 }); // (accordée : son octave)
      },
      stir(c, o, t, { n = 3, per = 0.34 }) { // la cuillère tourne dans le chocolat : liquide + petits tintements
        for (let k = 0; k < n; k++) {
          noise(c, o, t + k * per, { f: 500, f2: 900, q: 1.1, a: per * 0.35, d: per * 0.5, v: 0.03 });
          strike(c, o, t + k * per + per * 0.55, rnd(2900, 3300), 'ceramic', { d: 0.06, v: 0.012 });
        }
      },
      pour(c, o, t, { dur = 0.9 }) { // ça se verse : le filet, puis le niveau qui monte
        noise(c, o, t, { f: 700, f2: 1500, q: 1.9, a: 0.05, d: dur * 0.4, hold: dur * 0.6, v: 0.034 });
        noise(c, o, t + 0.05, { f: 300, type: 'lowpass', q: 0.7, a: 0.1, d: dur * 0.4, hold: dur * 0.3, v: 0.03 });
      },
      steam(c, o, t) { noise(c, o, t, { f: 5200, type: 'highpass', q: 0.6, a: 0.25, d: 0.6, v: 0.01 }); },
      fizz(c, o, t) { // les bulles d'un soda, la glace
        noise(c, o, t, { f: 3800, type: 'highpass', q: 0.7, a: 0.01, d: 0.3, v: 0.03 });
        for (let k = 0; k < 14; k++) noise(c, o, t + Math.random() * 0.7, { f: rnd(5000, 8500), q: 4, a: 0.001, d: 0.012, v: rnd(0.005, 0.012) });
      },
      ice(c, o, t) { for (let k = 0; k < 3; k++) strike(c, o, t + k * 0.07 + Math.random() * 0.03, rnd(2400, 3600), 'bell', { d: 0.08, v: 0.016 }); },
      dust(c, o, t) { // le cacao qu'on saupoudre
        for (let k = 0; k < 10; k++) noise(c, o, t + Math.random() * 0.4, { f: rnd(4000, 7000), q: 3, a: 0.001, d: 0.015, v: rnd(0.004, 0.01) });
      },
      crunch(c, o, t, { power = 1 }) { // une bouchée de cookie
        let tt = t;
        for (let k = 0; k < 7; k++) {
          tt += 0.01 + Math.random() * 0.02;
          noise(c, o, tt, { f: rnd(1400, 5000), q: rnd(0.9, 3.1), a: 0.002, d: rnd(0.03, 0.08), v: rnd(0.07, 0.13) * power });
        }
      },

      // --- la carte fidélité : les cuillères qu'on accroche
      hang(c, o, t, { i = 0 }) { // une cuillère accrochée au râtelier : tintement métallique, petite note qui monte
        strike(c, o, t, midi(84 + [0, 2, 4, 7, 9][i % 5]) * 1.5, 'metal', { d: 0.4, v: 0.035 });
        strike(c, o, t + 0.09, rnd(3000, 3400), 'metal', { d: 0.2, v: 0.016 });
        strike(c, o, t + 0.02, 420, 'wood', { d: 0.05, v: 0.03 });
      },
      key(c, o, t) { // touche du pavé
        tone(c, o, t, { f: 1050, a: 0.002, d: 0.035, v: 0.05 });
        noise(c, o, t, { f: 4200, type: 'highpass', a: 0.001, d: 0.01, v: 0.01 });
      },
      nope(c, o, t) {
        tone(c, o, t, { f: 466, f2: 440, type: 'triangle', a: 0.005, d: 0.08, v: 0.08 });
        tone(c, o, t + 0.13, { f: 415, f2: 392, type: 'triangle', a: 0.005, d: 0.1, v: 0.08 });
      },
      yes(c, o, t) {
        strike(c, o, t, midi(79), 'bell', { d: 0.35, v: 0.055 });
        strike(c, o, t + 0.075, midi(86), 'bell', { d: 0.5, v: 0.055 });
      },
      ding(c, o, t) { // c'est envoyé
        strike(c, o, t, midi(84), 'bell', { d: 0.7, v: 0.065 });
        strike(c, o, t + 0.11, midi(91), 'bell', { d: 0.9, v: 0.055 });
      },
      chime(c, o, t) { // carte pleine : un chocolat offert
        [72, 76, 79, 84, 88].forEach((m, k) => strike(c, o, t + k * 0.09, midi(m), k % 2 ? 'bell' : 'ceramic', { d: k === 4 ? 1.1 : 0.45, v: 0.07 }));
        for (let k = 0; k < 6; k++) strike(c, o, t + 0.5 + Math.random() * 1.0, rnd(2200, 4200), 'bell', { d: 0.25, v: 0.011 });
      },
      flip(c, o, t) { // la carte se retourne
        noise(c, o, t, { f: 500, f2: 2200, q: 0.7, a: 0.08, d: 0.2, v: 0.055 });
        strike(c, o, t + 0.3, 520, 'wood', { d: 0.05, v: 0.04 });
      },
      flick(c, o, t) { noise(c, o, t, { f: 700, f2: 3000, q: 0.8, a: 0.03, d: 0.12, v: 0.07 }); }, // une photo jetée
      like(c, o, t) {
        tone(c, o, t, { f: 620, f2: 1240, glide: 0.05, a: 0.003, d: 0.08, v: 0.08 });
        strike(c, o, t + 0.06, midi(96), 'bell', { d: 0.25, v: 0.02 });
      },

      // --- l'ouverture : la boîte à musique
      tine(c, o, t, { m = 79, v = 1 }) { // une lame de boîte à musique
        const f = midi(m);
        tone(c, o, t, { f, a: 0.002, d: 0.9, v: 0.055 * v });
        tone(c, o, t, { f: f * 2.756, a: 0.001, d: 0.18, v: 0.012 * v });
        tone(c, o, t, { f: f * 5.404, a: 0.001, d: 0.06, v: 0.006 * v });
        noise(c, o, t, { f: 7000, type: 'highpass', a: 0.001, d: 0.006, v: 0.01 * v });
      },
      nib(c, o, t, { dur = 0.4 }) { // la plume qui gratte le papier en dessinant
        noise(c, o, t, { f: 3600, f2: 4400, q: 3.5, a: 0.03, d: 0.08, hold: dur, v: 0.012 });
      },
      chord(c, o, t) { // le logo est complet : accord de boîte à musique
        [67, 71, 74, 79].forEach((m, k) => SOUNDS.tine(c, o, t + k * 0.03, { m, v: 0.8 }));
        [83, 86, 91].forEach((m, k) => SOUNDS.tine(c, o, t + 0.16 + k * 0.07, { m, v: 0.5 }));
      },
    };
    // sons qui peuvent légitimement se répéter vite (sinon : 50 ms minimum entre deux identiques)
    const GAP = { key: 0, chirp: 0, trill: 0, tine: 0, letter: 0, hang: 0, clink: 30, spoon: 30, open: 150, close: 150, rustle: 60, nib: 0 };

        /* voix continue : la rue piétonne, très loin (murmure), pour l'accueil */
    const VOICES = {
      street(c, dst) {
        const src = c.createBufferSource();
        src.buffer = noiseB(c);
        src.loop = true;
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 900;
        bp.Q.value = 0.5;
        const lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.value = 0.07;
        lg.gain.value = 260;
        lfo.connect(lg).connect(bp.frequency);
        const g = c.createGain();
        g.gain.value = 0;
        src.connect(bp).connect(g).connect(dst);
        src.start(c.currentTime, Math.random());
        lfo.start();
        let stopped = false;
        return {
          level(x) { g.gain.setTargetAtTime(0.012 * Math.max(0, Math.min(1, x)), c.currentTime, 0.6); },
          stop() {
            if (stopped) return;
            stopped = true;
            g.gain.setTargetAtTime(0, c.currentTime, 0.2);
            src.stop(c.currentTime + 1.2);
            lfo.stop(c.currentTime + 1.2);
          },
        };
      },
    };

    function emit(name, opts, dst) {
      lastAny = performance.now();
      const c = live(), fn = SOUNDS[name];
      if (!c || !fn || !dst) return;
      const now = performance.now();
      if (!(opts.delay > 0) && now - (lastBy[name] || -1e9) < (GAP[name] != null ? GAP[name] : 50)) return;
      lastBy[name] = now;
      if (window.AC_SFX_LOG) window.AC_SFX_LOG.push(name); // test : liste des sons joués
      let out = dst;
      if (opts.gain != null) {
        out = c.createGain();
        out.gain.value = opts.gain;
        out.connect(dst);
      }
      try {
        fn(c, out, c.currentTime + 0.005 + Math.max(0, opts.delay || 0) / 1000, opts);
      } catch (e) { /* audio indisponible */ }
    }
    const play = (name, opts = {}) => emit(name, opts, bus);

    /* sous-bus qu'on peut couper net (on quitte l'accueil) */
    function channel(gain = 1) {
      let node = null;
      const voices = new Set();
      const get = () => {
        const c = live();
        if (!c) return null;
        if (!node) {
          node = c.createGain();
          node.gain.value = gain;
          node.connect(bus);
        }
        return node;
      };
      return {
        play(name, opts = {}) { emit(name, opts, get()); },
        voice(name) {
          const dst = get();
          if (!dst || !VOICES[name]) return null;
          const v = VOICES[name](ctx, dst);
          voices.add(v);
          return v;
        },
        cut() {
          voices.forEach((v) => v.stop());
          voices.clear();
          if (!node) return;
          const n = node;
          node = null;
          n.gain.setTargetAtTime(0, n.context.currentTime, 0.03);
          setTimeout(() => n.disconnect(), 400);
        },
      };
    }

    /* « toc » par défaut : un clic sur un bouton ou un lien qui n'a pas joué de son dédié */
    let dispatchAt = 0;
    window.addEventListener('click', () => { dispatchAt = performance.now(); }, true);
    window.addEventListener('click', (e) => {
      if (lastAny >= dispatchAt) return;
      const el = e.target.closest && e.target.closest('button, a[href], summary, [role="button"], [data-sfx]');
      if (!el || el.disabled) return;
      const s = el.closest('[data-sfx]');
      const name = s ? s.dataset.sfx : 'tap';
      if (name !== 'none') play(name, { i: s && s.dataset.sfxI ? +s.dataset.sfxI : 0 });
    });

    /* latence de sortie estimée (s) : pour caler une animation sur un son */
    const latency = () => (ctx ? (ctx.outputLatency || ctx.baseLatency || 0) + 0.005 : 0);

    return {
      play, channel, unlock, latency,
      supported: !!ACtx,
      /** le même son, dans un autre contexte (un rendu hors ligne, pour l'écouter en fichier) : t en secondes */
      rendu(c, dst, name, t, opts = {}) { if (SOUNDS[name]) SOUNDS[name](c, dst, t, opts); },
      pop: () => play('pop'),
      ding: () => play('ding'),
      tick: () => play('key'),
      nope: () => play('nope'),
      flick: () => play('flick'),
      get on() { return on; },
      set on(v) {
        on = !!v;
        AC.store.set('sound', on);
        if (on) unlock();
        else if (ctx) ctx.suspend().catch(() => {});
      },
    };
  })();

  /* ---------- La page en anglais ----------
     Au démarrage (ce script est le premier en bas de page : tout le HTML est lu), en anglais seulement :
       - un élément [data-t] est traduit en entier (son HTML français, espaces réduits, est la clé) ;
       - sinon chaque bout de texte, et les attributs aria-label, aria-roledescription, placeholder, title, alt ;
       - les prix (« 5,20 € » → « €5.20 », « 23 € » → « €23 »), les heures (« 13h – 19h » → « 1pm – 7pm ») et les
         nombres à virgule (« 4,6 » → « 4.6 ») se convertissent seuls.
     Le titre de la page et sa description aussi. Puis la page se montre (html.traduit). */
  const net = (s) => String(s).replace(/\s+/g, ' ').trim();
  AC.heureEn = (h, m) => { const hh = h % 12 || 12; return hh + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 || h === 24 ? 'am' : 'pm'); };
  /** Les formats qui se traduisent seuls : un prix, une heure ou une plage d'heures à la française */
  function formatEn(s) {
    let m = /^(\+ )?(\d+)(?:,(\d{2}))? €$/.exec(s);
    if (m) return (m[1] || '') + '€' + m[2] + (m[3] ? '.' + m[3] : '');
    if (/^\d+,\d+$/.test(s)) return s.replace(',', '.'); // une note, « 4,6 »
    const h = (x) => { const r = /^(\d{1,2})h(\d{2})?$/.exec(x); return r ? AC.heureEn(+r[1], +(r[2] || 0)) : null; };
    if (h(s)) return h(s);
    m = /^(\d{1,2}h(?:\d{2})?) – (\d{1,2}h(?:\d{2})?)$/.exec(s);
    if (m && h(m[1]) && h(m[2])) return h(m[1]) + ' – ' + h(m[2]);
    return null;
  }
  AC.traduireTexte = (s) => { const k = net(s); return aCle(k) ? EN[k] : formatEn(k); };
  AC.traduirePage = function (racine) {
    if (!AC.en || !racine || !document.createTreeWalker) return;
    racine.querySelectorAll('[data-t]').forEach((el) => {
      const k = net(el.innerHTML);
      if (aCle(k)) el.innerHTML = EN[k];
      el.removeAttribute('data-t');
    });
    ['aria-label', 'aria-roledescription', 'placeholder', 'title', 'alt'].forEach((a) => racine.querySelectorAll(`[${a}]`).forEach((el) => {
      const v = AC.traduireTexte(el.getAttribute(a));
      if (v != null) el.setAttribute(a, v);
    }));
    const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentNode && n.parentNode.closest && n.parentNode.closest('script, style, .sprite') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const textes = [];
    while (w.nextNode()) textes.push(w.currentNode);
    textes.forEach((n) => {
      const v = n.nodeValue.trim() && AC.traduireTexte(n.nodeValue);
      if (v == null || v === false) return;
      const avant = /^\s*/.exec(n.nodeValue)[0], apres = /\s*$/.exec(n.nodeValue)[0];
      n.nodeValue = avant + v + apres;
    });
  };
  if (racineDoc && typeof document.querySelector === 'function' && document.body) {
    if (AC.en) {
      document.title = AC.t(document.title);
      const md = document.querySelector('meta[name="description"]'), desc = md && md.getAttribute('content');
      if (md) md.setAttribute('content', AC.t(desc));
      try { AC.traduirePage(document.body); } catch (e) { console.warn('traduction', e); }
    }
    racineDoc.classList.add('traduit');
  }
})();
