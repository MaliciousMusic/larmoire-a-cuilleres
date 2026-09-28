/* ==========================================================================
   L'Armoire à Cuillères — l'atelier de la table du goûter (onglet « Carte »)
   La vaisselle, les boissons et les gâteaux se calculent pixel par pixel
   (ac-rendu.js, ac-vaisselle.js, ac-gateaux.js) : plusieurs centaines de
   millisecondes par objet. Ici, dans un Worker, la page ne se fige jamais :
   les canvas sont des OffscreenCanvas, les images repartent en ImageBitmap.
   Les demandes de la page passent avant les précalculs de fond.
   Sans Worker (file://, vieux navigateur), le même fichier se charge dans la
   page (AC.atelierLocal) et calcule sur place.
   Opérations : fond (la table, le chemin de lin, le set en rotin, en une image),
   assiette, servir (une boisson dans son contenant), gateau, rotin, liste
   (ce qu'il faut savoir des boissons : froide ? quel contenant ?).
   ========================================================================== */
(function () {
  'use strict';
  const worker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
  if (worker) {
    // un monde sans DOM : juste de quoi charger le noyau et les moteurs
    self.window = self;
    self.document = { hidden: false, addEventListener() {}, removeEventListener() {}, createElement: () => new OffscreenCanvas(1, 1) };
    const v = self.location.search;
    importScripts('ac-core.js' + v, 'ac-rendu.js' + v, 'ac-vaisselle.js' + v, 'ac-gateaux.js' + v);
  }
  const AC = self.AC;
  const W_MM = 380; // largeur de table visible (ac-table.js)

  /** La table en planches menthe, un chemin de lin en travers sous la tasse, le set en rotin sous l'assiette */
  function fond({ w, h, ppm, hMM, rotin }) {
    const V = AC.Vaisselle;
    const c = AC.R.canvas(w, h), x = c.getContext('2d');
    x.drawImage(V.table({ bois: 'menthe', w: W_MM, h: hMM, seed: 5 }, ppm), 0, 0, w, h);
    const n = V.nappe({ w: 150, h: hMM * 1.5, seed: 9 }, ppm);
    x.save();
    x.translate(W_MM * 0.74 * ppm, hMM * 0.5 * ppm);
    x.rotate(0.1);
    x.shadowColor = 'rgba(40,30,20,.25)'; x.shadowBlur = 6 * ppm; x.shadowOffsetX = 2 * ppm; x.shadowOffsetY = 3 * ppm;
    x.drawImage(n, -n.width / 2, -n.height / 2);
    x.restore();
    AC.R.draw(x, V.rotin({ d: 300, seed: 3 }, ppm), rotin[0] * ppm, rotin[1] * ppm);
    return { canvas: c, w: w / ppm, h: h / ppm, ax: 0, ay: 0 };
  }

  /** Ce que la page doit savoir de chaque boisson (le son, la vapeur, le fondu ou le changement de tasse) */
  function liste() {
    return (AC.Boissons.liste || []).map((e) => {
      const c = e.contenant || e.style || '';
      const cle = typeof c === 'object' ? [c.type, c.style, c.motif, c.soucoupe].join('/') : String(c);
      return { id: e.id, froid: !!(e.froid || /verre|glace|gobelet|bocal/.test(cle)), contenant: cle };
    });
  }

  function traite(op, a) {
    switch (op) {
      case 'fond': return fond(a[0]);
      case 'assiette': return AC.Vaisselle.assiette(a[0], a[1]);
      case 'rotin': return AC.Vaisselle.rotin(a[0], a[1]);
      case 'servir': return AC.Boissons.servir(a[0], a[1], a[2]);
      case 'gateau': return AC.Gateaux.rendre(a[0], a[1], a[2]);
      case 'liste': return liste();
      default: throw new Error('atelier : opération inconnue ' + op);
    }
  }

  if (!worker) { AC.atelierLocal = { traite }; return; }

  /* ---------- le Worker : une file, les demandes de la page d'abord ---------- */
  const urgent = [], tranquille = [];
  let prevu = false;
  const planifie = () => { if (!prevu) { prevu = true; setTimeout(tour, 0); } };
  // un sprite → un message (ses images en ImageBitmap ; seulement les champs dont la table se sert)
  async function aPlat(sp) {
    if (!sp || !sp.canvas) return sp;
    const out = { w: sp.w, h: sp.h, ax: sp.ax, ay: sp.ay };
    if (sp.inner && typeof sp.inner.cx === 'number') out.inner = { cx: sp.inner.cx, cy: sp.inner.cy, r: sp.inner.r };
    out.canvas = await createImageBitmap(sp.canvas);
    out.shadow = sp.shadow ? await createImageBitmap(sp.shadow) : null;
    return out;
  }
  function tour() {
    prevu = false;
    const m = urgent.shift() || tranquille.shift();
    if (!m) return;
    let r = null, err = null;
    try { r = traite(m.op, m.args); } catch (e) { err = String((e && e.message) || e); }
    if (m.n != null) {
      if (err) self.postMessage({ n: m.n, ok: false, err });
      else aPlat(r).then((res) => self.postMessage({ n: m.n, ok: true, res }, res && res.canvas ? [res.canvas].concat(res.shadow ? [res.shadow] : []) : []))
        .catch((e) => self.postMessage({ n: m.n, ok: false, err: String((e && e.message) || e) }));
    }
    if (urgent.length || tranquille.length) planifie();
  }
  self.onmessage = (e) => {
    const m = e.data;
    (m.tranquille ? tranquille : urgent).push(m);
    planifie();
  };
})();
