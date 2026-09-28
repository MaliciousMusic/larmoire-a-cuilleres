/* ==========================================================================
   L'Armoire à Cuillères — l'atelier de la vue du dessus : un Worker qui peint les couches (js/ac-ville-peintre.js)
   sur des toiles hors écran et les renvoie en ImageBitmap ; la page ne se fige jamais, même pendant qu'on remonte.
   Demande : { n, couche : 'rue' | 'lueur' | 'toits' | 'plan', Rm, Z, r } → { n, ok, bmp }
   ========================================================================== */
(function () {
  'use strict';
  const v = self.location.search;
  importScripts('ac-ville-donnees.js' + v, 'ac-ville-peintre.js' + v);
  self.onmessage = (e) => {
    const { n, couche, Rm, Z, r } = e.data;
    try {
      const c = self.ACVillePeintre[couche](self.AC_VILLE, Rm, Z, r);
      const bmp = c.transferToImageBitmap();
      self.postMessage({ n, ok: true, bmp }, [bmp]);
    } catch (err) {
      self.postMessage({ n, ok: false, err: String(err && err.message || err) });
    }
  };
})();
