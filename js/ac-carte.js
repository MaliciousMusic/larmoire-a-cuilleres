/* ==========================================================================
   L'Armoire à Cuillères — la carte : le nuancier des douze crus, les rubriques,
   et chaque ligne qui se sert sur la table du goûter (ac-table.js).
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const RUBS = [
    ['chocolats', 'Chocolats'], ['cafes', 'Cafés'], ['specialites', 'Spécialités'], ['thes', 'Thés'],
    ['fraiches', 'Fraîches'], ['gateaux', 'Gâteaux'], ['enfants', 'Enfants'], ['supplements', 'Suppléments'],
  ];

  // tout ce qui peut se servir, par id
  const ITEMS = {};
  AC.CRUS.forEach((c) => { ITEMS[c.id] = { id: c.id, nom: `${c.nom} ${c.pc} %`, prix: AC.CRU_PRIX, kind: 'boisson', cru: c }; });
  AC.CARTE.forEach((r) => r.items.forEach((it) => { ITEMS[it.id] = { ...it, prix: it.prix != null ? it.prix : r.prix }; }));
  // les gâteaux de l'ardoise qui ne sont pas sur la carte imprimée
  (AC.ARDOISE ? AC.ARDOISE.items : []).forEach((it) => { if (!ITEMS[it.sert]) ITEMS[it.sert] = { id: it.sert, nom: it.nom, prix: it.prix, kind: 'gateau' }; });
  AC.ITEMS = ITEMS;

  const etat = { boisson: 'vanuari-noir', gateau: 'fondant-noir' };

  /* ---------- le nuancier : trois pages de quatre carrés, du plus doux au plus intense ---------- */
  const PAGES = ['Doux', 'Équilibrés', 'Intenses'];
  const PAR_PAGE = 4;
  const pageDe = (id) => Math.floor(AC.CRUS.findIndex((c) => c.id === id) / PAR_PAGE);
  const f2 = (n) => Math.round(n * 100) / 100;
  // la cuillère de leur logo, en relief au milieu du carré : le cuilleron (en haut à gauche) et le manche
  const CUILLERE = (() => {
    const cx = 25.4, cy = 25.4, rx = 6, ry = 8.4, c = Math.SQRT1_2;
    const a = [cx - rx * c, cy + rx * c], b = [cx + rx * c, cy - rx * c];
    const cuilleron = `M${f2(a[0])} ${f2(a[1])}A${rx} ${ry} -45 1 0 ${f2(b[0])} ${f2(b[1])}A${rx} ${ry} -45 1 0 ${f2(a[0])} ${f2(a[1])}Z`;
    const A = [30.4, 30.4], B = [44.6, 44.6], w0 = 2.4, w1 = 4, n = [-c, c];
    const q = (P, w, sg) => `${f2(P[0] + (n[0] * w * sg) / 2)} ${f2(P[1] + (n[1] * w * sg) / 2)}`;
    const manche = `M${q(A, w0, 1)}L${q(B, w1, 1)}A${w1 / 2} ${w1 / 2} 0 0 0 ${q(B, w1, -1)}L${q(A, w0, -1)}A${w0 / 2} ${w0 / 2} 0 0 0 ${q(A, w0, 1)}Z`;
    return cuilleron + manche;
  })();
  /** Un carré de chocolat moulé : biseaux, plateau bombé, la cuillère en relief, un reflet */
  function carreSVG(c) {
    const C = c.couleur;
    return `<svg class="carre-choc" viewBox="0 0 64 64" aria-hidden="true">
      <rect x=".8" y=".8" width="62.4" height="62.4" rx="8.6" fill="${C}"/>
      <g clip-path="url(#nu-clip)">
        <path d="M.8 .8H63.2L51 13H13Z" fill="#fff" opacity=".3"/>
        <path d="M63.2 .8V63.2L51 51V13Z" fill="#000" opacity=".16"/>
        <path d="M63.2 63.2H.8L13 51H51Z" fill="#000" opacity=".34"/>
        <path d="M.8 63.2V.8L13 13V51Z" fill="#fff" opacity=".13"/>
      </g>
      <rect x="1.2" y="1.2" width="61.6" height="61.6" rx="8.2" fill="none" stroke="#000" stroke-opacity=".2" stroke-width=".8"/>
      <rect x="13" y="13" width="38" height="38" rx="3.5" fill="${C}"/>
      <path d="${CUILLERE}" fill="#000" opacity=".42" transform="translate(1 1)"/>
      <path d="${CUILLERE}" fill="#fff" opacity=".38" transform="translate(-.8 -.8)"/>
      <path d="${CUILLERE}" fill="${C}"/>
      <rect x="13" y="13" width="38" height="38" rx="3.5" fill="url(#nu-bombe)"/>
      <path d="M13.6 13.6H50.4" stroke="#fff" stroke-opacity=".32" stroke-width="1"/>
      <path d="M50.4 13.6V50.4H13.6" fill="none" stroke="#000" stroke-opacity=".2" stroke-width="1"/>
      <path d="M17 18.4C23 15.8 33 15.4 41 16.8" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".3"/>
    </svg>`;
  }
  // les dégradés partagés par les douze carrés (un SVG de taille nulle, pas display:none : Safari n’y lirait pas les dégradés)
  const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
    <clipPath id="nu-clip"><rect x=".8" y=".8" width="62.4" height="62.4" rx="8.6"/></clipPath>
    <radialGradient id="nu-bombe" cx=".32" cy=".26" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".48" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>
  </defs></svg>`;
  const CHEVRON = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

  function legende() {
    const b = ITEMS[etat.boisson], g = etat.gateau ? ITEMS[etat.gateau] : null;
    const nom = [b && b.nom, g && g.nom].filter(Boolean).join(' · ');
    const total = (b ? b.prix || 0 : 0) + (g ? g.prix || 0 : 0);
    $('#tg-legende').innerHTML = `<span class="tg-nom">${esc(nom)}</span><span class="tg-prix">${AC.prix(total)}</span>`;
  }

  function fiche(c) {
    const pos = ((c.pc - 30) / 70) * 100;
    $('#cru-fiche').innerHTML = `
      <div class="cf-tete"><h4 class="cf-nom">${esc(c.nom)}</h4><span class="cf-pc">${c.pc} % de cacao</span>${c.bio ? '<abbr class="bio" title="Issu de l’agriculture biologique">BIO</abbr>' : ''}</div>
      <p class="cf-notes">${esc(c.notes.replace(/'/g, '’'))}</p>
      <div class="cf-jauge" aria-hidden="true"><i style="left:${Math.max(3, Math.min(97, pos)).toFixed(1)}%"></i></div>`;
  }

  function selectCru(id, { silencieux } = {}) {
    const c = AC.CRUS.find((x) => x.id === id);
    if (!c) return;
    $$('#nuancier .carre').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === id)));
    fiche(c);
    servir(id, 'boisson', false, silencieux);
    if (nuPage) nuPage(pageDe(id), !silencieux);
  }
  let nuPage = null; // feuilleter le nuancier (défini à l'init)

  /** Sert un article sur la table (kind : 'boisson' | 'gateau'), et fait défiler jusqu'à elle si demandé */
  function servir(id, kind, scroll, silencieux) {
    const it = ITEMS[id];
    if (!it) return;
    kind = kind || it.kind;
    if (kind === 'gateau') etat.gateau = id;
    else {
      etat.boisson = it.sert || id;
      if (it.gateau) etat.gateau = it.gateau;
    }
    $$('.plat.sert').forEach((p) => p.classList.remove('sert'));
    $$(`.plat[data-id="${id}"]`).forEach((p) => p.classList.add('sert'));
    // une autre boisson qu'un cru : plus de cru choisi (un gâteau, lui, ne change pas la tasse)
    if (kind !== 'gateau' && !it.cru) $$('#nuancier .carre').forEach((b) => b.setAttribute('aria-checked', 'false'));
    legende();
    if (AC.table) {
      if (kind === 'gateau') AC.table.gateau(id, { silencieux });
      else {
        AC.table.boisson(it.sert || id, { silencieux });
        if (it.gateau) AC.table.gateau(it.gateau, { silencieux: true });
      }
    }
    // la table est toujours en haut de l'écran : si la ligne servie n'est pas à l'écran (depuis l'ardoise), on l'amène
    if (scroll) {
      const ligne = $$(`.plat[data-id="${id}"]`).find((p) => p.offsetParent);
      const sc = ligne && ligne.closest('.view-scroll');
      if (sc) {
        const r = ligne.getBoundingClientRect(), b = sc.getBoundingClientRect();
        if (r.top < b.top + 56 || r.bottom > b.bottom) AC.scrollTo(ligne, 96);
      }
    }
  }

  AC.carte = {
    servir,
    etat,
    init() {
      // le nuancier
      const box = $('#nuancier');
      if (box) {
        const carre = (c, i) => `<button class="carre" type="button" role="radio" aria-checked="false" data-id="${c.id}" data-sfx="chip" data-sfx-i="${i}" aria-label="${esc(c.nom)}, ${c.pc} %">${carreSVG(c)}<b>${c.pc} %</b><span class="carre-nom">${esc(c.nom)}</span></button>`;
        const pages = PAGES.map((nom, p) => {
          const cs = AC.CRUS.slice(p * PAR_PAGE, (p + 1) * PAR_PAGE);
          return `<div class="nu-page" role="group" aria-label="${nom}, de ${cs[0].pc} à ${cs[cs.length - 1].pc} %">${cs.map((c, k) => carre(c, p * PAR_PAGE + k)).join('')}</div>`;
        }).join('');
        box.innerHTML = `${DEFS}<div class="nu-pages">${pages}</div>
          <div class="nu-pager">
            <button class="nu-fleche" type="button" data-dir="-1" data-sfx="page" aria-label="Crus plus doux">${CHEVRON('M15 5l-7 7 7 7')}</button>
            ${PAGES.map((nom, p) => `<button class="nu-onglet" type="button" data-p="${p}" data-sfx="page">${nom}</button>`).join('')}
            <button class="nu-fleche" type="button" data-dir="1" data-sfx="page" aria-label="Crus plus intenses">${CHEVRON('M9 5l7 7-7 7')}</button>
          </div>`;
        const track = $('.nu-pages', box);
        let cour = 0, raf = 0;
        const marque = (p) => {
          cour = p;
          $$('.nu-onglet', box).forEach((b) => { const on = +b.dataset.p === p; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'true' : 'false'); });
          $('[data-dir="-1"]', box).disabled = p === 0;
          $('[data-dir="1"]', box).disabled = p === PAGES.length - 1;
        };
        nuPage = (p, lisse = true) => {
          p = Math.max(0, Math.min(PAGES.length - 1, p));
          marque(p);
          if (track.clientWidth) track.scrollTo({ left: p * track.clientWidth, behavior: lisse && !AC.reduced ? 'smooth' : 'auto' });
        };
        // au doigt : la page qui s'arrête au milieu devient la page courante
        track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (track.clientWidth) marque(Math.round(track.scrollLeft / track.clientWidth)); }); }, { passive: true });
        // la largeur change (rotation, bureau) : on reste sur la même page
        if (window.ResizeObserver) new ResizeObserver(() => { if (track.clientWidth) track.scrollLeft = cour * track.clientWidth; }).observe(track);
        $('.nu-pager', box).addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          nuPage(b.dataset.dir ? cour + +b.dataset.dir : +b.dataset.p);
        });
        box.addEventListener('click', (e) => {
          const b = e.target.closest('.carre');
          if (b) selectCru(b.dataset.id);
        });
        box.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          const bs = $$('.carre', box), i = bs.findIndex((b) => b.getAttribute('aria-checked') === 'true');
          const n = bs[Math.max(0, Math.min(bs.length - 1, (i < 0 ? 0 : i) + (e.key === 'ArrowRight' ? 1 : -1)))];
          n.focus();
          n.click();
          e.preventDefault();
        });
      }
      // les rubriques
      const nav = $('#rubriques');
      if (nav) {
        nav.innerHTML = RUBS.map(([id, nom], i) => `<a href="#" data-rub="${id}" data-sfx="chip" data-sfx-i="${i}">${nom}</a>`).join('');
        nav.addEventListener('click', (e) => {
          const a = e.target.closest('[data-rub]');
          if (!a) return;
          e.preventDefault();
          const cible = a.dataset.rub === 'chocolats' ? $('#crus') : $(`.rubrique[data-rub="${a.dataset.rub}"]`);
          if (cible) AC.scrollTo(cible, 60);
        });
        // la puce de la rubrique à l'écran s'allume
        const secs = [$('#crus'), ...$$('.rubrique')].filter(Boolean);
        const sc = $('#carte .view-scroll');
        const spy = () => {
          const top = sc.getBoundingClientRect().top + 90;
          let cur = 'chocolats';
          secs.forEach((s) => { if (s.getBoundingClientRect().top <= top) cur = s.id === 'crus' ? 'chocolats' : s.dataset.rub; });
          $$('a', nav).forEach((a) => {
            const on = a.dataset.rub === cur;
            if (on && !a.classList.contains('on')) nav.scrollTo({ left: a.offsetLeft - nav.clientWidth / 2 + a.clientWidth / 2, behavior: AC.reduced ? 'auto' : 'smooth' });
            a.classList.toggle('on', on);
          });
        };
        sc.addEventListener('scroll', () => requestAnimationFrame(spy), { passive: true });
        spy();
      }
      // chaque ligne de la carte se sert sur la table
      $('#carte').addEventListener('click', (e) => {
        const b = e.target.closest('button.plat');
        if (!b) return;
        servir(b.dataset.id, b.dataset.kind === 'cru' ? 'boisson' : b.dataset.kind, true);
      });
      if (AC.table) AC.table.init($('#table-gouter'));
      selectCru(etat.boisson, { silencieux: true });
      servir(etat.gateau, 'gateau', false, true);
      // la table se prépare quand on ouvre la carte (et pas avant : on garde l'ouverture légère)
      AC.on('view', (v) => { if (v === 'carte' && AC.table) AC.table.reveil(); });
      AC.on('view', (v) => { if (v === 'carte' && nuPage) requestAnimationFrame(() => { const c = AC.CRUS.find((x) => x.id === etat.boisson); nuPage(c ? pageDe(c.id) : 0, false); }); });
      if (AC.view === 'carte' && AC.table) AC.table.reveil();
    },
  };
})();
