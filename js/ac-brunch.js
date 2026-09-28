/* ==========================================================================
   L'Armoire à Cuillères — le brunch du dimanche : la demande de réservation
   Ils réservent par téléphone ou SMS (07 83 41 21 45) : on prépare le message
   ici, il part de l'appli SMS du client. Rien n'est envoyé par le site.
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});
  const $ = (s, r = document) => r.querySelector(s);
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  function dimanches(n = 6) {
    const now = AC.parisNow();
    const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const out = [];
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // aujourd'hui dimanche : encore possible avant 13h30
    if (!(d.getDay() === 0 && now.getHours() * 60 + now.getMinutes() < 13 * 60 + 30)) d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
    while (out.length < n) {
      const ferme = AC.HOURS.fermetures.some((f) => iso(d) >= f.du && iso(d) <= f.au);
      if (!ferme) out.push(new Date(d));
      d.setDate(d.getDate() + 7);
    }
    return out;
  }

  /* ---------- la commande d'un gâteau entier (24 h à l'avance), par e-mail ---------- */
  const GATEAUX_ENTIERS = [
    ['Fondant chocolat noir, pointe de sel', 'fondant-noir'], ['Fondant chocolat au lait caramélisé', 'fondant-lait'],
    ['Brownie noix, noisettes', 'brownie'], ['Cheesecake citron vert', 'cheesecake'], ['Cake marbré chocolat', 'cake-marbre'],
    ['Tarte citron meringuée', 'tarte-citron'], ['Cookies (par 6)', 'cookie'],
  ];
  function initCommande() {
    const form = $('#commande');
    if (!form) return;
    $('#cg-gateaux').innerHTML = GATEAUX_ENTIERS.map(([nom, id], i) => `<label class="puce"><input type="radio" name="gateau" value="${nom}"${i === 0 ? ' checked' : ''} data-id="${id}"><span>${nom}</span></label>`).join('');
    const d = $('#cg-date');
    const demain = new Date(AC.parisNow().getTime() + 36 * 3600000);
    const iso = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    d.min = iso(demain);
    d.value = iso(demain);
    const maj = () => {
      const g = (form.querySelector('input[name=gateau]:checked') || {}).value || '';
      const parts = (form.querySelector('input[name=parts]:checked') || {}).value || '6';
      const jour = d.value ? new Date(d.value + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
      const prenom = $('#cg-prenom').value.trim(), tel = $('#cg-tel').value.trim(), mot = $('#cg-mot').value.trim();
      const lignes = [
        'Bonjour !', '',
        `Je voudrais commander : ${g}${/Cookies/.test(g) ? '' : ', pour ' + parts + ' parts'}.`,
        `Pour le ${jour}, à retirer à la boutique.`,
        ...(mot ? [mot] : []), '',
        ...(prenom || tel ? [(prenom || '') + (prenom && tel ? ' · ' : '') + (tel || '')] : []),
        'Merci !',
      ];
      const corps = lignes.join('\n');
      $('#cg-apercu').textContent = '« ' + lignes.filter(Boolean).join(' ') + ' »';
      $('#cg-envoyer').href = 'mailto:' + AC.SHOP.email + '?subject=' + encodeURIComponent('Commande de gâteau · ' + jour) + '&body=' + encodeURIComponent(corps);
      // un jour de fermeture ? on prévient
      const j = d.value ? new Date(d.value + 'T12:00:00').getDay() : -1;
      d.setCustomValidity(j >= 0 && !AC.HOURS.semaine[j] ? 'La boutique est fermée ce jour-là' : '');
    };
    form.addEventListener('input', maj);
    form.addEventListener('change', (e) => {
      if (e.target.name === 'gateau' && AC.carte) AC.carte.servir(e.target.dataset.id, 'gateau', false, true);
      if (e.target === d && d.validationMessage) AC.toast(d.validationMessage);
      maj();
    });
    $('#cg-envoyer').addEventListener('click', () => AC.sfx.play('ding'));
    $('#cg-ouvrir').addEventListener('click', () => { maj(); AC.openSheet('#sheet-commande'); });
    maj();
  }

  AC.brunch = {
    init() {
      initCommande();
      const form = $('#resa-form');
      if (!form) return;
      const box = $('#resa-dates');
      const ds = dimanches();
      const auj = AC.parisNow();
      box.innerHTML = ds.map((d, i) => {
        const today = d.toDateString() === new Date(auj.getFullYear(), auj.getMonth(), auj.getDate()).toDateString();
        const label = today ? 'Aujourd’hui' : i === 0 && (d - auj) / 86400000 < 7 ? 'Dimanche' : 'Dim.';
        return `<label class="puce"><input type="radio" name="date" value="${d.getDate()} ${MOIS[d.getMonth()]}"${i === 0 ? ' checked' : ''}><span>${d.getDate()} ${MOIS_C[d.getMonth()]}<small>${label}</small></span></label>`;
      }).join('');
      let couverts = 2;
      const out = $('#couverts');
      const maj = () => {
        out.textContent = couverts;
        const date = (form.querySelector('input[name=date]:checked') || {}).value || '';
        const heure = (form.querySelector('input[name=heure]:checked') || {}).value || '11h30';
        const prenom = $('#resa-prenom').value.trim();
        const mot = $('#resa-mot').value.trim();
        const msg = `Bonjour ! Je voudrais réserver le brunch du dimanche ${date} à ${heure}, pour ${couverts} personne${couverts > 1 ? 's' : ''}${prenom ? ', au nom de ' + prenom : ''}.${mot ? ' ' + mot.replace(/\.?$/, '.') : ''} Merci !`;
        $('#resa-apercu').textContent = '« ' + msg + ' »';
        // iOS comme Android comprennent « ?&body= »
        $('#resa-sms').href = 'sms:' + AC.SHOP.telIntl + '?&body=' + encodeURIComponent(msg);
        $('#resa-sms').classList.toggle('grand-groupe', couverts >= 9);
      };
      $('#couverts-moins').addEventListener('click', () => { couverts = Math.max(1, couverts - 1); maj(); });
      $('#couverts-plus').addEventListener('click', () => {
        if (couverts >= 12) { AC.toast('Pour un grand groupe, appelez-nous : on s’organise ensemble.'); return; }
        couverts++;
        if (couverts === 9) AC.toast('À partir de 9, un petit appel c’est mieux !');
        maj();
      });
      form.addEventListener('change', (e) => { if (e.target.name === 'date' || e.target.name === 'heure') AC.sfx.play('chip', { i: [...form.querySelectorAll('input[name=' + e.target.name + ']')].indexOf(e.target) }); maj(); });
      form.addEventListener('input', maj);
      form.addEventListener('submit', (e) => e.preventDefault());
      $('#resa-sms').addEventListener('click', () => {
        AC.sfx.play('ding');
        // sur ordinateur, le lien sms: ne mène nulle part : on propose le numéro
        if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) AC.toast('Depuis votre téléphone : SMS au ' + AC.SHOP.tel, 4200);
      });
      maj();
    },
  };
})();
