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
  }

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
    if (!it.cru) $$('#nuancier .carre').forEach((b) => b.setAttribute('aria-checked', 'false'));
    legende();
    if (AC.table) {
      if (kind === 'gateau') AC.table.gateau(id, { silencieux });
      else {
        AC.table.boisson(it.sert || id, { silencieux });
        if (it.gateau) AC.table.gateau(it.gateau, { silencieux: true });
      }
    }
    if (scroll) {
      const t = $('#table-gouter');
      const r = t.getBoundingClientRect(), sc = t.closest('.view-scroll').getBoundingClientRect();
      if (r.top < sc.top || r.bottom > sc.bottom) AC.scrollTo(t, 8);
    }
  }

  AC.carte = {
    servir,
    etat,
    init() {
      // le nuancier
      const box = $('#nuancier');
      if (box) {
        box.innerHTML = AC.CRUS.map((c, i) => `<button class="carre" type="button" role="radio" aria-checked="false" data-id="${c.id}" data-sfx="chip" data-sfx-i="${i}"><span class="carre-choc" style="background:${c.couleur}"></span><b>${c.pc} %</b><span>${esc(c.nom.replace(/ (Noir|Lait)$/, ''))}</span></button>`).join('');
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
      if (AC.view === 'carte' && AC.table) AC.table.reveil();
    },
  };
})();
