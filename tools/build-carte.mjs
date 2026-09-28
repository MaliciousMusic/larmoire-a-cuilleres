#!/usr/bin/env node
// Écrit, depuis js/ac-data.js (LA source) :
//  - la carte en HTML statique d'index.html (entre <!-- CARTE:DEBUT --> et <!-- CARTE:FIN -->) : lisible sans JS,
//  - la FAQ (entre <!-- FAQ:DEBUT --> et <!-- FAQ:FIN -->),
//  - les données structurées schema.org (entre <!-- JSONLD:DEBUT --> et <!-- JSONLD:FIN -->),
//  - llms.txt (la fiche de synthèse pour les assistants IA).
// Usage : node tools/build-carte.mjs   (après chaque modification de la carte, des horaires ou de la FAQ)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = (readFileSync(join(ROOT, 'index.html'), 'utf8').match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || 'https://www.larmoireacuilleres.com/';

// charge ac-data.js dans un bac à sable (il s'accroche à window.AC)
const sandbox = { window: {}, console };
sandbox.window.AC = { parisNow: () => new Date() };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(ROOT, 'js', 'ac-data.js'), 'utf8'), sandbox);
const AC = sandbox.window.AC;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const prix = (n, plus) => (plus ? '+ ' : '') + n.toFixed(2).replace('.', ',') + ' €';
const typo = (s) => s.replace(/'/g, '’');

/* ---------- la carte HTML ---------- */
function carteHTML() {
  const out = [];
  // les crus (le nuancier est dessiné en JS ; la liste reste lisible sans JS)
  out.push('<section class="rubrique rub-crus-liste" id="r-crus" aria-labelledby="r-crus-t" data-rub="chocolats">');
  out.push(`  <div class="rub-tete"><h3 id="r-crus-t" class="rub-titre">Les douze crus</h3><span class="rub-prix">${prix(AC.CRU_PRIX)}</span></div>`);
  out.push('  <ul class="plats">');
  for (const c of AC.CRUS) {
    out.push(`    <li><button class="plat" type="button" data-id="${c.id}" data-kind="cru"><span class="p-nom">${esc(c.nom)} ${c.pc} %${c.bio ? ' <abbr class="bio" title="Issu de l’agriculture biologique">BIO</abbr>' : ''}</span><span class="p-desc">${esc(typo(c.notes))}</span></button></li>`);
  }
  out.push('  </ul>');
  out.push('</section>');
  const groupe = { classiques: 'chocolats', gourmets: 'chocolats', glaces: 'chocolats', cafes: 'cafes', specialites: 'specialites', thes: 'thes', fraiches: 'fraiches', gateaux: 'gateaux', enfants: 'enfants', supplements: 'supplements' };
  for (const r of AC.CARTE) {
    out.push(`<section class="rubrique" id="r-${r.id}" aria-labelledby="r-${r.id}-t" data-rub="${groupe[r.id] || r.id}">`);
    out.push(`  <div class="rub-tete"><h3 id="r-${r.id}-t" class="rub-titre">${esc(r.titre)}</h3>${r.prix ? `<span class="rub-prix">${prix(r.prix)}</span>` : ''}</div>`);
    if (r.note) out.push(`  <p class="rub-note">${esc(typo(r.note))}</p>`);
    out.push('  <ul class="plats">');
    for (const it of r.items) {
      const p = it.prix != null ? `<span class="p-prix">${prix(it.prix, it.plus)}</span>` : '';
      const froid = it.froid ? '<span class="p-froid" title="Boisson glacée">❄</span> ' : '';
      const inner = `<span class="p-nom">${froid}${esc(typo(it.nom))}</span>${p}${it.desc ? `<span class="p-desc">${esc(typo(it.desc))}</span>` : ''}`;
      if (it.kind === 'info') out.push(`    <li><div class="plat plat-info">${inner}</div></li>`);
      else out.push(`    <li><button class="plat" type="button" data-id="${it.id}" data-kind="${it.kind}">${inner}</button></li>`);
    }
    out.push('  </ul>');
    out.push('</section>');
  }
  return out.join('\n');
}

/* ---------- la FAQ ---------- */
function faqHTML() {
  return AC.FAQ.map((f) => `<details class="question"><summary>${esc(typo(f.q))}</summary><p>${esc(typo(f.r))}</p></details>`).join('\n');
}

/* ---------- JSON-LD ---------- */
function jsonld() {
  const S = AC.SHOP;
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const hh = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const ohs = [];
  AC.HOURS.semaine.forEach((p, d) => { if (p) ohs.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/' + DAYS[d], opens: hh(p[0]), closes: hh(p[1]) }); });
  const offer = (n) => ({ '@type': 'Offer', price: n.toFixed(2), priceCurrency: 'EUR' });
  const sections = [
    { '@type': 'MenuSection', name: 'Chocolats grands crus', hasMenuItem: AC.CRUS.map((c) => ({ '@type': 'MenuItem', name: `${c.nom} ${c.pc} %`, description: c.notes, offers: offer(AC.CRU_PRIX) })) },
    ...AC.CARTE.filter((r) => r.id !== 'supplements').map((r) => ({
      '@type': 'MenuSection', name: r.titre,
      hasMenuItem: r.items.map((it) => ({ '@type': 'MenuItem', name: it.nom, ...(it.desc ? { description: it.desc } : {}), offers: offer(it.prix != null ? it.prix : r.prix) })),
    })),
    { '@type': 'MenuSection', name: 'Brunch du dimanche', hasMenuItem: [{ '@type': 'MenuItem', name: 'Brunch du dimanche', description: AC.BRUNCH.formule.map((f) => f.t + (f.d ? ' (' + f.d + ')' : '')).join(', ') + ', et buffet à volonté.', offers: offer(AC.BRUNCH.prix) }] },
  ];
  const cafe = {
    '@context': 'https://schema.org',
    '@type': ['CafeOrCoffeeShop', 'Bakery'],
    '@id': SITE + '#armoire',
    name: S.nom,
    alternateName: "L'Armoire à cuillères, bar à chocolat",
    description: 'Bar à chocolat et salon de thé : 12 chocolats chauds grands crus, pâtisseries faites maison, thés, cafés et brunch du dimanche.',
    url: SITE,
    image: SITE + 'assets/img/og-armoire.jpg',
    logo: SITE + 'assets/icons/icon-512.png',
    telephone: S.telIntl,
    email: S.email,
    priceRange: '€',
    servesCuisine: ['Chocolat chaud', 'Pâtisserie', 'Brunch', 'Salon de thé'],
    address: { '@type': 'PostalAddress', streetAddress: S.adresse, postalCode: S.cp, addressLocality: S.ville, addressRegion: 'Auvergne-Rhône-Alpes', addressCountry: 'FR' },
    geo: { '@type': 'GeoCoordinates', latitude: S.geo.lat, longitude: S.geo.lng },
    hasMap: S.maps,
    openingHoursSpecification: ohs,
    acceptsReservations: 'Brunch du dimanche uniquement, par téléphone ou SMS',
    sameAs: [S.instagram, S.facebook],
    hasMenu: { '@type': 'Menu', name: 'La carte', inLanguage: 'fr', hasMenuSection: sections },
    foundingDate: String(S.depuis),
  };
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: AC.FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.r } })),
  };
  const site = { '@context': 'https://schema.org', '@type': 'WebSite', name: S.nom, url: SITE, inLanguage: 'fr' };
  const block = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
  return [block(cafe), block(faq), block(site)].join('\n');
}

/* ---------- llms.txt ---------- */
function llms() {
  const S = AC.SHOP;
  const J = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const hh = (m) => Math.floor(m / 60) + 'h' + (m % 60 ? String(m % 60).padStart(2, '0') : '');
  const hours = [1, 2, 3, 4, 5, 6, 0].map((d) => { const p = AC.HOURS.semaine[d]; return `- ${J[d]} : ${p ? hh(p[0]) + '–' + hh(p[1]) + (d === 0 ? ' (brunch dès 11h30)' : '') : 'fermé'}`; }).join('\n');
  const lines = [];
  lines.push(`# ${S.nom}`);
  lines.push('');
  lines.push(`> Bar à chocolat et salon de thé au ${S.adresse}, ${S.cp} ${S.ville} (vieux Clermont, près de la cathédrale). Douze chocolats chauds grands crus de 33 à 99 % de cacao, pâtisseries faites maison chaque jour, thés, cafés, et brunch du dimanche à ${AC.BRUNCH.prix} €. Ouvert depuis ${S.depuis}.`);
  lines.push('');
  lines.push('## Infos pratiques');
  lines.push(`- Adresse : ${S.adresse}, ${S.cp} ${S.ville} (rue piétonne)`);
  lines.push(`- Téléphone : ${S.tel} (réservation du brunch par téléphone ou SMS)`);
  lines.push(`- E-mail : ${S.email}`);
  lines.push(`- Instagram : ${S.instagram}`);
  lines.push(`- Note Google : ${String(S.avis.note).replace('.', ',')}/5 (${S.avis.nombre} avis, sept. 2026)`);
  lines.push('- Pas de réservation pour le goûter ; réservation conseillée pour le brunch (places limitées).');
  lines.push('');
  lines.push('## Horaires');
  lines.push(hours);
  lines.push('');
  lines.push(`## Chocolats grands crus (${prix(AC.CRU_PRIX)})`);
  AC.CRUS.forEach((c) => lines.push(`- ${c.nom} ${c.pc} %${c.bio ? ' (bio)' : ''} : ${c.notes}`));
  AC.CARTE.forEach((r) => {
    lines.push('');
    lines.push(`## ${r.titre}${r.prix ? ` (${prix(r.prix)})` : ''}`);
    r.items.forEach((it) => lines.push(`- ${it.nom}${it.prix != null ? ' : ' + prix(it.prix, it.plus) : ''}${it.desc ? ' (' + it.desc + ')' : ''}`));
  });
  lines.push('');
  lines.push(`## Pâtisseries du jour (ardoise du ${AC.ARDOISE.date})`);
  AC.ARDOISE.items.forEach((it) => lines.push(`- ${it.nom} : ${prix(it.prix)}`));
  lines.push('');
  lines.push(`## Brunch du dimanche (${AC.BRUNCH.prix} €)`);
  AC.BRUNCH.formule.forEach((f) => lines.push(`- ${f.t}${f.d ? ' (' + f.d + ')' : ''}`));
  lines.push(`- Buffet à volonté : ${AC.BRUNCH.buffet.join(', ')}`);
  lines.push('');
  lines.push('## Questions fréquentes');
  AC.FAQ.forEach((f) => { lines.push(`- ${f.q} ${f.r}`); });
  lines.push('');
  lines.push('## Producteurs');
  AC.PRODUCTEURS.forEach((p) => lines.push(`- ${p.quoi} : ${p.qui} (${p.ou})`));
  lines.push('');
  return lines.join('\n');
}

let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const put = (tag, content) => {
  const re = new RegExp(`(<!-- ${tag}:DEBUT -->)[\\s\\S]*?(<!-- ${tag}:FIN -->)`);
  if (!re.test(html)) throw new Error('Marqueurs ' + tag + ' introuvables');
  html = html.replace(re, `$1\n${content}\n$2`);
};
put('CARTE', carteHTML());
put('FAQ', faqHTML());
put('JSONLD', jsonld());
writeFileSync(join(ROOT, 'index.html'), html);
writeFileSync(join(ROOT, 'llms.txt'), llms());
console.log('index.html : carte, FAQ et JSON-LD à jour · llms.txt écrit');
