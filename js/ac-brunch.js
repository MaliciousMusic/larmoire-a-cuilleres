/* ==========================================================================
   L'Armoire à Cuillères — le brunch du dimanche : la demande de réservation
   Ils réservent par téléphone ou SMS (07 83 41 21 45) : on prépare le message
   ici, il part de l'appli SMS du client. Rien n'est envoyé par le site.
   ========================================================================== */
(function () {
  'use strict';
  const AC = (window.AC = window.AC || {});
  const $ = (s, r = document) => r.querySelector(s);
  const t = AC.t;
  const MOIS = AC.en ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    : ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MOIS_C = AC.en ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    : ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const LOCALE = AC.en ? 'en-GB' : 'fr-FR';
  // au-delà de 6 personnes, on réserve au téléphone ; le compteur s'arrête à 15
  const GROUPE = 6, MAX = 15;
  // « 11h30 » (la valeur des boutons d'heure) → « 11:30am » en anglais
  const heure = (v) => (AC.en && AC.traduireTexte ? AC.traduireTexte(v) || v : v);

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
  ].map(([nom, id]) => [t(nom), id]);
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
      const jour = d.value ? new Date(d.value + 'T12:00:00').toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }) : '';
      const prenom = $('#cg-prenom').value.trim(), tel = $('#cg-tel').value.trim(), mot = $('#cg-mot').value.trim();
      const choisi = form.querySelector('input[name=gateau]:checked');
      const cookies = !!choisi && choisi.dataset.id === 'cookie';
      const lignes = [
        t('Bonjour !'), '',
        cookies ? t('Je voudrais commander : {gateau}.', { gateau: g }) : t('Je voudrais commander : {gateau}, pour {parts} parts.', { gateau: g, parts }),
        t('Pour le {jour}, à retirer à la boutique.', { jour }),
        ...(mot ? [mot] : []), '',
        ...(prenom || tel ? [(prenom || '') + (prenom && tel ? ' · ' : '') + (tel || '')] : []),
        t('Merci !'),
      ];
      const corps = lignes.join('\n');
      $('#cg-apercu').textContent = t('« {msg} »', { msg: lignes.filter(Boolean).join(' ') });
      $('#cg-envoyer').href = 'mailto:' + AC.SHOP.email + '?subject=' + encodeURIComponent(t('Commande de gâteau · {jour}', { jour })) + '&body=' + encodeURIComponent(corps);
      // un jour de fermeture ? on prévient
      const j = d.value ? new Date(d.value + 'T12:00:00').getDay() : -1;
      d.setCustomValidity(j >= 0 && !AC.HOURS.semaine[j] ? t('La boutique est fermée ce jour-là') : '');
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
        const label = today ? t('Aujourd’hui') : i === 0 && (d - auj) / 86400000 < 7 ? t('Dimanche') : t('Dim.');
        return `<label class="puce"><input type="radio" name="date" value="${d.getDate()} ${MOIS[d.getMonth()]}"${i === 0 ? ' checked' : ''}><span>${d.getDate()} ${MOIS_C[d.getMonth()]}<small>${label}</small></span></label>`;
      }).join('');
      let couverts = 2, groupeAvant = false;
      const out = $('#couverts'), sms = $('#resa-sms'), tel = $('#resa-tel'), avis = $('#resa-groupe');
      const maj = () => {
        out.textContent = couverts;
        $('#couverts-moins').disabled = couverts <= 1;
        const date = (form.querySelector('input[name=date]:checked') || {}).value || '';
        const h = heure((form.querySelector('input[name=heure]:checked') || {}).value || '11h30');
        const prenom = $('#resa-prenom').value.trim();
        const mot = $('#resa-mot').value.trim();
        const qui = prenom ? t(', au nom de {prenom}', { prenom }) : '';
        const msg = t(couverts > 1 ? 'Bonjour ! Je voudrais réserver le brunch du dimanche {date} à {heure}, pour {n} personnes{qui}.' : 'Bonjour ! Je voudrais réserver le brunch du dimanche {date} à {heure}, pour {n} personne{qui}.', { date, heure: h, n: couverts, qui })
          + (mot ? ' ' + mot.replace(/\.?$/, '.') : '') + ' ' + t('Merci !');
        $('#resa-apercu').textContent = t('« {msg} »', { msg });
        // iOS comme Android comprennent « ?&body= »
        sms.href = 'sms:' + AC.SHOP.telIntl + '?&body=' + encodeURIComponent(msg);
        // plus de 6 : le SMS s'efface, l'appel devient le bouton principal
        const groupe = couverts > GROUPE;
        form.classList.toggle('groupe', groupe);
        avis.hidden = !groupe;
        tel.classList.toggle('btn-choco', groupe);
        tel.classList.toggle('btn-ligne', !groupe);
        if (groupe !== groupeAvant) {
          groupeAvant = groupe;
          if (groupe && !AC.reduced) avis.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
      };
      $('#couverts-moins').addEventListener('click', () => { couverts = Math.max(1, couverts - 1); maj(); });
      $('#couverts-plus').addEventListener('click', () => {
        if (couverts >= MAX) { AC.toast(t('Pour un grand groupe, appelez-nous : on s’organise ensemble.')); return; }
        couverts++;
        maj();
      });
      form.addEventListener('change', (e) => { if (e.target.name === 'date' || e.target.name === 'heure') AC.sfx.play('chip', { i: [...form.querySelectorAll('input[name=' + e.target.name + ']')].indexOf(e.target) }); maj(); });
      form.addEventListener('input', maj);
      form.addEventListener('submit', (e) => e.preventDefault());
      $('#resa-sms').addEventListener('click', () => {
        AC.sfx.play('ding');
        // sur ordinateur, le lien sms: ne mène nulle part : on propose le numéro
        if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) AC.toast(t('Depuis votre téléphone : SMS au {tel}', { tel: AC.SHOP.tel }), 4200);
      });
      maj();
      initTablee();
    },
  };

  /* ---------- la tablée du dimanche : dressée à la première visite de l'onglet ; la table et les
     lignes de la formule et du buffet se répondent ---------- */
  function initTablee() {
    const hote = $('#tablee-scene');
    if (!hote) return;
    let tab = null;
    const lignes = [...document.querySelectorAll('#formule [data-cle], #buffet [data-cle]')];
    let allumeT = 0;
    const allume = (cle) => {
      clearTimeout(allumeT);
      lignes.forEach((li) => li.classList.toggle('eclaire', li.dataset.cle === cle));
      allumeT = setTimeout(() => lignes.forEach((li) => li.classList.remove('eclaire')), 2400);
    };
    // la table se construit d'avance (un temps mort, onglet invisible : AC.emit('prechauffe')), vide ; elle se dresse,
    // plat par plat, à la première visite de l'onglet
    let charge = null, dressee = false;
    const prepare = () => {
      if (!charge) {
        charge = AC.charge('ac-tablee.js').then(() => {
          try { tab = AC.Tablee.create($('#tablee'), { etiquette: $('#tablee-etiquette'), scene: hote }); } catch (e) { console.warn('tablée', e); return null; }
          $('#tablee').addEventListener('tablee', (e) => allume(e.detail.cle));
          tab.cache();
          return tab;
        }).catch((e) => { console.warn('tablée', e); return null; });
      }
      return charge;
    };
    const reveil = () => prepare().then((t) => {
      if (!t || dressee) return;
      dressee = true;
      t.dresser();
    });
    AC.on('prechauffe', (v) => { if (v === 'brunch') prepare(); });
    // on touche une ligne : le plat se présente sur la table (on remonte la voir si elle n'est pas à l'écran)
    lignes.forEach((li) => {
      li.setAttribute('role', 'button');
      li.tabIndex = 0;
      const go = () => {
        if (!tab) return;
        const r = hote.getBoundingClientRect(), sc = hote.closest('.view-scroll');
        const b = sc ? sc.getBoundingClientRect() : { top: 0, bottom: innerHeight };
        const voir = r.bottom < b.top + 80 || r.top > b.bottom - 80;
        if (voir && AC.scrollTo) AC.scrollTo(hote, 24);
        setTimeout(() => tab.montre(li.dataset.cle), voir ? 420 : 0);
      };
      li.addEventListener('click', go);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    AC.on('view', (v) => { if (v === 'brunch') reveil(); });
    if (AC.view === 'brunch') reveil();
  }
})();
