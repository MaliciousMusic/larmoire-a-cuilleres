/* ==========================================================================
   L'Armoire à Cuillères — la carte fidélité : un râtelier à cuillères
   Une petite armoire à cuillères en bois (le « cuillerier » de grand-mère) :
   à chaque passage, l'équipe y accroche une cuillère, avec son code à 4 chiffres,
   sur le téléphone du client (même système que Café Laitue et Kookies).
   Dix cuillères = un chocolat grand cru offert. Les dix cuillères sont celles de
   leur dessin (l'enseigne drapeau), vectorisées dans ac-brand.js.
   Maquette : la carte vit sur l'appareil ; en prod, côté serveur.
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const GOAL = (AC.FIDELITE && AC.FIDELITE.objectif) || 10;
  const LOYALTY = {
    maxPerVisit: 5,
    // Code équipe (4 chiffres) : seule l'empreinte SHA-256 de `${salt}:${code}` est publiée.
    // Pour le changer : node tools/set-pin.mjs 1234
    salt: 'armoire-a-cuilleres',
    pinHash: 'db9ca0ae12c015182fe38ec29f4518a0588f6f0c4391de60d2b8db1bd1d44a30',
  };

  let card = load();
  let pendingNew = [];

  function load() {
    const c = AC.store.get('carte', null);
    return c && typeof c === 'object' && c.id ? c : null;
  }
  const save = () => AC.store.set('carte', card);
  function newId() {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = 'AC-';
    for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
    return s + '-' + String(Math.floor(Math.random() * 90) + 10);
  }

  /* ======================================================================
     Le râtelier (SVG) : 460 × 400
     ====================================================================== */
  const HOOKS = Array.from({ length: GOAL }, (_, i) => [58 + i * 38.2, 128]);

  function spoonSVG(parent, i, { vide = false } = {}) {
    const B = AC.BRAND && AC.BRAND.cuilleres && AC.BRAND.cuilleres[i % AC.BRAND.cuilleres.length];
    const [hx, hy] = HOOKS[i];
    const g = AC.svg('g', { class: 'rk-spoon' + (vide ? ' vide' : '') }, parent);
    const L = 190; // longueur d'une cuillère suspendue
    if (B && B.bbox) {
      const [bx, by, bx1, by1] = B.bbox; // [x0, y0, x1, y1], repère du dessin d'origine
      const hook = B.hook || [(bx + bx1) / 2, by];
      const sc = L / Math.max(1, by1 - hook[1]);
      const inner = AC.svg('g', { transform: `translate(${hx} ${hy + 4}) scale(${sc.toFixed(4)}) translate(${-hook[0]} ${-hook[1]})` }, g);
      if (vide) {
        AC.svg('path', { d: B.fill || B.lines, fill: 'none', stroke: 'rgba(243,235,221,.28)', 'stroke-width': 1.2 / sc, 'stroke-dasharray': `${3 / sc} ${3 / sc}` }, inner);
      } else {
        if (B.fill) AC.svg('path', { d: B.fill, fill: 'url(#rk-argent)' }, inner);
        AC.svg('path', { d: B.lines, fill: AC.BRAND.cuilleres.lineColor || '#2F2A26' }, inner);
      }
    } else {
      // repli : une cuillère ancienne simple, manche ouvragé qui varie
      const w = 7 + (i % 3), bowl = 15 + (i % 4) * 1.5;
      const d = `M${hx} ${hy + 4}c${w * 0.7} 0 ${w} 5 ${w * 0.5} 11c-1 1.4 -1.8 2.8 -1.8 5l.6 ${L * 0.5}c0 3 1.5 5 ${bowl * 0.45} 10c${bowl * 0.3} 6 ${bowl * 0.3} 30 0 ${bowl * 2.2}c-2 3 -5 4 -${bowl * 0.45 - 1} 4s-7 -1 -9 -4c-3 -${bowl * 1.2} -3 -${bowl * 1.9} 0 -${bowl * 2.2}c3 -5 ${bowl * 0.45 - 4} -7 ${bowl * 0.45 - 4} -10l.6 -${L * 0.5}c0 -2.2 -.8 -3.6 -1.8 -5c-.5 -6 -.2 -11 ${w * 0.5} -11z`;
      if (vide) AC.svg('path', { d, fill: 'none', stroke: 'rgba(243,235,221,.28)', 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }, g);
      else AC.svg('path', { d, fill: 'url(#rk-argent)', stroke: '#2F2A26', 'stroke-width': 1.1 }, g);
    }
    g.style.transformOrigin = `${hx}px ${hy + 2}px`;
    return g;
  }

  function rackSVG() {
    const svg = AC.svg('svg', { viewBox: '0 0 460 400', role: 'img', 'aria-label': `Râtelier de ${GOAL} cuillères : ${card ? Math.min(card.stamps, GOAL) : 0} accrochées` });
    const defs = AC.svg('defs', {}, svg);
    const lin = (id, stops, a = {}) => { const g = AC.svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1, ...a }, defs); stops.forEach(([o, c, op]) => AC.svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': op == null ? 1 : op }, g)); };
    lin('rk-bois', [[0, '#5A4038'], [0.5, '#3B2723'], [1, '#2A1B18']]);
    lin('rk-fond', [[0, '#2E1F1B'], [1, '#1F1411']]);
    lin('rk-argent', [[0, '#FBFBF8'], [0.45, '#E4E6E6'], [0.55, '#C9CDCE'], [1, '#F2F3F1']], { x1: 0, y1: 0, x2: 1, y2: 0 });
    lin('rk-laiton', [[0, '#F3DFA8'], [0.5, '#C9A45C'], [1, '#8A6A2E']]);
    // le meuble : fronton chantourné, fond, montants, tablette
    AC.svg('path', { d: 'M22 96C22 60 60 58 90 56C140 52 170 30 230 30S320 52 370 56C400 58 438 60 438 96V386H22Z', fill: 'url(#rk-bois)' }, svg);
    AC.svg('path', { d: 'M38 104H422V352H38Z', fill: 'url(#rk-fond)' }, svg);
    for (let k = 0; k < 9; k++) AC.svg('path', { d: `M${60 + k * 42} 104V352`, stroke: '#000', 'stroke-width': 0.6, opacity: 0.25 }, svg); // planches du fond
    AC.svg('path', { d: 'M22 96C22 60 60 58 90 56C140 52 170 30 230 30S320 52 370 56C400 58 438 60 438 96', fill: 'none', stroke: '#6B4E44', 'stroke-width': 2 }, svg);
    AC.svg('path', { d: 'M196 58c10 -12 24 -16 34 -16s24 4 34 16c-10 -4 -22 -6 -34 -6s-24 2 -34 6z', fill: '#6B4E44' }, svg); // petite coquille sculptée
    AC.svg('circle', { cx: 230, cy: 70, r: 4, fill: '#6B4E44' }, svg);
    // la tringle et les crochets de laiton
    AC.svg('rect', { x: 38, y: 116, width: 384, height: 10, rx: 3, fill: '#5A4038' }, svg);
    AC.svg('rect', { x: 38, y: 116, width: 384, height: 2.4, fill: '#7C5E52' }, svg);
    HOOKS.forEach(([x, y]) => AC.svg('path', { d: `M${x} ${y - 4}v5a4 4 0 0 0 8 0`, fill: 'none', stroke: 'url(#rk-laiton)', 'stroke-width': 2.4, 'stroke-linecap': 'round', transform: `translate(-4 0)` }, svg));
    // la tablette du bas + la plaque au prénom
    AC.svg('rect', { x: 26, y: 352, width: 408, height: 18, rx: 3, fill: '#4A332D' }, svg);
    AC.svg('rect', { x: 26, y: 352, width: 408, height: 3, fill: '#7C5E52' }, svg);
    AC.svg('rect', { x: 22, y: 370, width: 416, height: 16, fill: '#2A1B18' }, svg);
    const pl = AC.svg('g', { class: 'rk-plaque' }, svg);
    AC.svg('rect', { x: 150, y: 318, width: 160, height: 30, rx: 6, fill: 'url(#rk-laiton)', stroke: '#6B5023', 'stroke-width': 1 }, pl);
    AC.svg('circle', { cx: 160, cy: 333, r: 2, fill: '#6B5023' }, pl);
    AC.svg('circle', { cx: 300, cy: 333, r: 2, fill: '#6B5023' }, pl);
    const nom = AC.svg('text', { x: 230, y: 340, 'text-anchor': 'middle', 'font-family': "'Armoire Lettres', Poppins, sans-serif", 'font-size': 19, fill: '#3B2723' }, pl);
    nom.textContent = card ? card.name.toUpperCase() : '';
    // les cuillères
    const spoonsG = AC.svg('g', { class: 'rk-spoons' }, svg);
    const shown = card ? Math.min(card.stamps, GOAL) : 0;
    const els = [];
    for (let i = 0; i < GOAL; i++) els.push(spoonSVG(spoonsG, i, { vide: i >= shown }));
    // la dixième : le cadeau
    const cad = AC.svg('g', { class: 'rk-cadeau', transform: `translate(${HOOKS[GOAL - 1][0]} 312)` }, svg);
    AC.svg('circle', { r: 15, fill: shown >= GOAL ? '#E64AA8' : 'rgba(243,235,221,.14)' }, cad);
    const tx = AC.svg('text', { y: 4.5, 'text-anchor': 'middle', 'font-size': 13, fill: shown >= GOAL ? '#fff' : 'rgba(243,235,221,.55)', 'font-family': "'Armoire Lettres', Poppins, sans-serif" }, cad);
    tx.textContent = '♥';
    // le compteur, gravé sur la tringle
    const cpt = AC.svg('text', { x: 230, y: 100, 'text-anchor': 'middle', 'font-family': 'Poppins, sans-serif', 'font-weight': 600, 'font-size': 12, fill: '#E9DCC9', 'letter-spacing': 1.2 }, svg);
    cpt.textContent = shown >= GOAL ? 'VOTRE CHOCOLAT EST OFFERT' : `${shown} / ${GOAL} CUILLÈRES`;
    // les feuilles de la marque, dans un coin
    const fl = AC.svg('g', { transform: 'translate(20 380)' }, svg);
    if (AC.bouquet) {
      const tmp = document.createElement('div');
      const b = AC.bouquet(tmp, [['aqua', 16, 60, 54, -30], ['prune', 26, 60, 60, 8], ['turquoise', 40, 60, 50, 34], ['marine', 8, 60, 38, -60]], { w: 80, h: 60, sway: false });
      if (b) { b.setAttribute('x', -16); b.setAttribute('y', -62); b.setAttribute('width', 80); b.setAttribute('height', 60); fl.appendChild(b); }
    }
    return { svg, els };
  }

  /* ======================================================================
     Rendu
     ====================================================================== */
  function render() {
    const recto = $('#rc-recto'), verso = $('#rc-verso'), act = $('#fid-actions');
    if (!recto) return;
    $('#ratelier-carte').classList.remove('retourne');
    if (!card) {
      recto.innerHTML = '';
      const { svg } = rackSVG();
      recto.appendChild(svg);
      verso.innerHTML = '';
      act.innerHTML = `<form class="fid-form" id="fid-form" novalidate>
          <label class="champ"><span>Votre prénom, sur la plaque</span><input id="fid-nom" name="given-name" autocomplete="given-name" maxlength="14" placeholder="Julie" required></label>
          <button class="btn btn-choco" type="submit">Créer ma carte</button>
        </form>`;
      $('#fid-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = $('#fid-nom').value.trim();
        if (v.length < 2) { $('#fid-nom').focus(); AC.toast('Votre prénom, pour que la carte soit à vous'); return; }
        card = { v: 1, id: newId(), name: v, stamps: 0, redeemed: 0, history: [], created: Date.now() };
        save();
        AC.sfx.play('hang', { i: 0 });
        AC.toast(`Bienvenue ${v} ! Votre râtelier est prêt.`);
        render();
      });
      return;
    }
    recto.innerHTML = '';
    const { svg, els } = rackSVG();
    recto.appendChild(svg);
    // les nouvelles cuillères tombent sur leur crochet et se balancent
    pendingNew.forEach((i, k) => {
      const el = els[i];
      if (!el || AC.reduced) return;
      el.animate([
        { transform: 'translateY(-160px) rotate(-6deg)', opacity: 0 },
        { transform: 'translateY(0) rotate(0)', opacity: 1, offset: 0.45 },
        { transform: 'rotate(9deg)', offset: 0.6 },
        { transform: 'rotate(-6deg)', offset: 0.74 },
        { transform: 'rotate(3deg)', offset: 0.87 },
        { transform: 'rotate(0)' },
      ], { duration: 1500, delay: k * 380, easing: 'ease-out', fill: 'backwards' });
      AC.sfx.play('hang', { i, delay: k * 380 + 620 });
    });
    if (pendingNew.length && card.stamps >= GOAL) AC.sfx.play('chime', { delay: pendingNew.length * 380 + 900 });
    pendingNew = [];
    verso.innerHTML = `<div class="qr" id="rc-qr"></div><p class="rc-id">${esc(card.id)}</p><p class="rc-aide">À montrer au comptoir si on vous le demande.</p>`;
    drawQR($('#rc-qr'), 'ARMOIRE:' + card.id);
    const plein = card.stamps >= GOAL;
    act.innerHTML = `
      ${plein ? '<button class="btn btn-choco" type="button" id="fid-offert">Mon chocolat offert : à valider au comptoir</button>' : '<button class="btn btn-choco" type="button" id="fid-tampon">Accrocher une cuillère (au comptoir)</button>'}
      <button class="btn btn-ligne" type="button" id="fid-qr" data-sfx="flip"><svg aria-hidden="true"><use href="#i-qr"/></svg>Mon QR code</button>`;
    $('#fid-qr').addEventListener('click', () => $('#ratelier-carte').classList.toggle('retourne'));
    $('#ratelier-carte').onclick = (e) => { if (e.target.closest('.rc-verso')) $('#ratelier-carte').classList.remove('retourne'); };
    const t = $('#fid-tampon');
    if (t) t.addEventListener('click', () => pinSheet('tampon'));
    const o = $('#fid-offert');
    if (o) o.addEventListener('click', () => pinSheet('offert'));
  }

  function drawQR(el, text) {
    if (!el) return;
    if (typeof window.qrcode !== 'function') { el.innerHTML = `<p class="rc-id">${esc(text)}</p>`; return; }
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    el.innerHTML = `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="QR code ${esc(text)}"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#FCF9F3"/><path d="${d}" fill="#2A1B18"/></svg>`;
  }

  /* ======================================================================
     Le code équipe
     ====================================================================== */
  async function sha(s) {
    if (!(window.crypto && crypto.subtle)) return '';
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let essais = 0, bloqueJusqua = 0;
  function pinSheet(mode) {
    const box = $('#pin');
    let code = '', qte = 1;
    const titre = mode === 'offert' ? 'Chocolat offert' : 'Accrocher des cuillères';
    const sous = mode === 'offert' ? 'L’équipe valide le chocolat offert avec son code.' : 'Réservé à l’équipe : combien de boissons, puis le code.';
    box.innerHTML = `
      <h2 id="sp-titre">${titre}</h2>
      <p>${sous}</p>
      ${mode === 'tampon' ? `<div class="pin-qte"><div class="stepper"><button type="button" id="pq-m" aria-label="Une de moins" data-sfx="down">−</button><output id="pq">1</output><button type="button" id="pq-p" aria-label="Une de plus" data-sfx="up">+</button></div><span>cuillère(s)</span></div>` : ''}
      <div class="pin-points" id="pin-points" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="pave" id="pave">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => `<button type="button" class="${k === '' ? 'vide' : ''}" data-k="${k}" data-sfx="key" ${k === '⌫' ? 'aria-label="Effacer"' : ''}>${k}</button>`).join('')}</div>`;
    const pts = $('#pin-points');
    const maj = () => [...pts.children].forEach((p, i) => p.classList.toggle('on', i < code.length));
    if (mode === 'tampon') {
      const max = Math.min(LOYALTY.maxPerVisit, GOAL - card.stamps);
      $('#pq-m').onclick = () => { qte = Math.max(1, qte - 1); $('#pq').textContent = qte; };
      $('#pq-p').onclick = () => { qte = Math.min(max, qte + 1); $('#pq').textContent = qte; };
    }
    $('#pave').onclick = async (e) => {
      const b = e.target.closest('[data-k]');
      if (!b || b.dataset.k === '') return;
      if (Date.now() < bloqueJusqua) { AC.toast('Trop d’essais : patientez une minute.'); return; }
      if (b.dataset.k === '⌫') { code = code.slice(0, -1); maj(); return; }
      if (code.length >= 4) return;
      code += b.dataset.k;
      maj();
      if (code.length < 4) return;
      const ok = LOYALTY.pinHash && (await sha(`${LOYALTY.salt}:${code}`)) === LOYALTY.pinHash;
      if (!ok) {
        essais++;
        AC.sfx.play('nope');
        pts.classList.remove('faux'); void pts.offsetWidth; pts.classList.add('faux');
        code = '';
        setTimeout(maj, 380);
        if (essais >= 5) { bloqueJusqua = Date.now() + 60000; essais = 0; AC.toast('Code incorrect. Réessayez dans une minute.'); }
        return;
      }
      essais = 0;
      AC.sfx.play('yes');
      AC.closeSheet('#sheet-pin');
      if (mode === 'offert') {
        card.stamps -= GOAL;
        card.redeemed = (card.redeemed || 0) + 1;
        card.history = (card.history || []).concat({ t: Date.now(), k: 'offert' }).slice(-40);
        save();
        setTimeout(() => { AC.sfx.play('ding'); AC.toast('Bonne dégustation ! Un nouveau râtelier commence.', 3400); render(); }, 450);
      } else {
        const avant = card.stamps;
        card.stamps = Math.min(GOAL, card.stamps + qte);
        card.history = (card.history || []).concat({ t: Date.now(), k: 'tampon', n: card.stamps - avant }).slice(-40);
        save();
        pendingNew = Array.from({ length: card.stamps - avant }, (_, k) => avant + k);
        setTimeout(() => {
          render();
          AC.toast(card.stamps >= GOAL ? 'Dixième cuillère : votre chocolat est offert !' : `${card.stamps - avant > 1 ? card.stamps - avant + ' cuillères accrochées' : 'Une cuillère de plus'} · ${card.stamps}/${GOAL}`, 3200);
        }, 450);
      }
    };
    AC.openSheet('#sheet-pin');
  }

  AC.fidelite = {
    LOYALTY,
    init() {
      render();
      AC.on('view', (v) => { if (v === 'fidelite') $('#ratelier-carte').classList.remove('retourne'); });
    },
  };
})();
