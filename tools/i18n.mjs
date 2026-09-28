#!/usr/bin/env node
// La traduction anglaise (js/ac-en.js) : quelles clés françaises existent, lesquelles manquent.
// Les clés viennent de trois endroits :
//  - la page (index.html, lue par Chrome sans tête exactement comme AC.traduirePage : les bouts de texte, les
//    attributs aria-label / placeholder / title / alt, les éléments [data-t] en entier, le titre et la description) ;
//  - les scripts (les textes passés à AC.t(…) ou t(…), les listes traduites par .map(… AC.t …), les étiquettes) ;
//  - les données (js/ac-data.js : la carte, l'ardoise, le brunch, la FAQ, les avis…).
// Les prix et les heures à la française se traduisent seuls (pas de clé).
// Usage (le serveur local tourne : python tools/dev-server.py) :
//   node tools/i18n.mjs              la liste des clés manquantes
//   node tools/i18n.mjs --ecrire     ajoute les clés manquantes à js/ac-en.js (valeur vide, à traduire)
//   node tools/i18n.mjs --verifier   code de sortie 1 s'il en manque (ou s'il en reste de vides)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:5190/';
const ECRIRE = process.argv.includes('--ecrire'), VERIFIER = process.argv.includes('--verifier');
const net = (s) => String(s).replace(/\s+/g, ' ').trim();

/* ---------- 1) la page et les données, lues dans Chrome ---------- */
async function depuisLaPage() {
  const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-i18n-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 200 && !target; i++) { try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(200); } }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  // la page telle que le HTML l'écrit (avant que les scripts la remplissent) : on la relit depuis le fichier
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  await send('Page.navigate', { url: new URL('?nointro&lang=fr', BASE).href });
  await sleep(2500);
  const expr = `(() => {
    const net = (s) => String(s).replace(/\\s+/g, ' ').trim();
    const cles = [];
    const d = new DOMParser().parseFromString(${JSON.stringify(html)}, 'text/html');
    cles.push(net(d.title));
    const md = d.querySelector('meta[name="description"]'); if (md) cles.push(net(md.getAttribute('content')));
    d.body.querySelectorAll('[data-t]').forEach((el) => { cles.push(net(el.innerHTML)); el.remove(); });
    ['aria-label', 'aria-roledescription', 'placeholder', 'title', 'alt'].forEach((a) => d.body.querySelectorAll('[' + a + ']').forEach((el) => cles.push(net(el.getAttribute(a)))));
    const w = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentNode.closest('script, style, .sprite') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    while (w.nextNode()) { const k = net(w.currentNode.nodeValue); if (k) cles.push(k); }
    // les données (en français : la page est ouverte en français)
    const A = window.AC, champs = (o, ...ks) => ks.forEach((k) => { if (o && typeof o[k] === 'string') cles.push(o[k]); });
    champs(A.SHOP, 'accroche', 'repere');
    A.CRUS.forEach((c) => champs(c, 'notes'));
    A.CARTE.forEach((r) => { champs(r, 'titre', 'note'); r.items.forEach((it) => champs(it, 'nom', 'desc')); });
    A.ARDOISE.items.forEach((it) => champs(it, 'nom')); champs(A.ARDOISE, 'signature');
    A.BRUNCH.formule.forEach((x) => champs(x, 't', 'd')); A.BRUNCH.buffet.forEach((x) => cles.push(x)); champs(A.BRUNCH, 'note', 'resa');
    A.PRODUCTEURS.forEach((x) => champs(x, 'quoi'));
    A.FAQ.forEach((x) => champs(x, 'q', 'r'));
    A.INSTA.forEach((x) => champs(x, 'legende'));
    champs(A.FIDELITE, 'cadeau');
    A.AVIS.selection.forEach((x) => champs(x, 'nom', 'texte'));
    return cles;
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  ws.close(); proc.kill(); await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* rien */ }
  if (!r.result || !r.result.result || !Array.isArray(r.result.result.value)) throw new Error('lecture de la page impossible : ' + JSON.stringify(r).slice(0, 300));
  return r.result.result.value;
}

/* ---------- 2) les scripts ---------- */
function litteraux(src) {
  // les chaînes '…', "…" et `…` (sans ${…}) d'un bout de code
  const out = [], re = /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\$]|\$(?!\{))*)`/g;
  let m;
  while ((m = re.exec(src))) out.push((m[1] ?? m[2] ?? m[3]).replace(/\\(.)/g, '$1'));
  return out;
}
function premierArgument(src, i) {
  // src[i] est la parenthèse ouvrante : le premier argument, jusqu'à la virgule de premier niveau ou la parenthèse fermante
  let prof = 0, q = null;
  for (let k = i + 1; k < src.length; k++) {
    const c = src[k];
    if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '(' || c === '[' || c === '{') prof++;
    else if (c === ')' || c === ']' || c === '}') { if (!prof) return src.slice(i + 1, k); prof--; }
    else if (c === ',' && !prof) return src.slice(i + 1, k);
  }
  return '';
}
function depuisLesScripts() {
  const cles = [];
  const dir = path.join(ROOT, 'js');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'ac-en.js' && x !== 'ac-brand.js' && x !== 'qrcode.js')) {
    // (sans les commentaires : un exemple d'AC.t(…) dans un commentaire n'est pas une clé)
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s;])\/\/[^\n]*/g, '$1');
    // AC.t(…) et t(…) (les fichiers où t = AC.t)
    const re = /(?:\bAC\.t|(?<![\w.$])t)\(/g;
    let m;
    while ((m = re.exec(src))) litteraux(premierArgument(src, m.index + m[0].length - 1)).forEach((s) => cles.push(s));
    // les listes traduites d'un coup : [ '…', … ].map(… AC.t …)
    const reL = /\[((?:[^[\]]|\[[^[\]]*\])*)\]\s*\.map\(\s*\(?[^)]*\)?\s*=>\s*[^;]{0,40}?\b(?:AC\.)?t\(/g;
    while ((m = reL.exec(src))) {
      const liste = m[1], lits = litteraux(liste);
      // les paires [id, nom] : seul le nom (le 2e élément) se traduit ; [nom, id] : le 1er
      if (/\[\s*'[a-z-]+'\s*,\s*'/.test(liste)) lits.filter((_, i) => i % 2 === 1).forEach((s) => cles.push(s));
      else if (/\[\s*'[^']+'\s*,\s*'[a-z-]+'\s*\]/.test(liste)) lits.filter((_, i) => i % 2 === 0).forEach((s) => cles.push(s));
      else lits.forEach((s) => cles.push(s));
    }
    // les étiquettes nommées (salon, tablée) : const labels = { … } / const NOMS = { … }
    const reO = /const (?:labels|NOMS) = \{([\s\S]*?)\};/g;
    while ((m = reO.exec(src))) {
      const reV = /:\s*('((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")/g;
      let v;
      while ((v = reV.exec(m[1]))) cles.push((v[2] ?? v[3]).replace(/\\(.)/g, '$1'));
    }
  }
  return cles;
}

/* ---------- 3) le dictionnaire actuel ---------- */
function dico() {
  const f = path.join(ROOT, 'js', 'ac-en.js');
  if (!fs.existsSync(f)) return {};
  const sb = { window: {} };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(f, 'utf8'), sb);
  return sb.window.AC_EN || {};
}

// ce qui se traduit tout seul (comme formatEn dans js/ac-core.js), ou ne se traduit pas (sans lettres : facultatif,
// un numéro d'exemple peut quand même avoir sa traduction)
const auto = (k) => /^(\+ )?\d+(,\d{2})? €$/.test(k) || /^\d+,\d+$/.test(k) || /^\d{1,2}h(\d{2})?( – \d{1,2}h(\d{2})?)?$/.test(k);
const neutre = (k) => !/\p{L}/u.test(k) || /^[\w.+-]+@[\w.-]+$/.test(k) || /^@\w+$/.test(k) || /^https?:/.test(k) || /^[\d\s·–-]+$/.test(k);

const page = await depuisLaPage();
const brutes = [...new Set([...page, ...depuisLesScripts()].map(net))].filter((k) => k && !auto(k));
const toutes = brutes.filter((k) => !neutre(k));
const D = dico();
const manquent = toutes.filter((k) => !(k in D));
const vides = toutes.filter((k) => k in D && !D[k]);
const orphelines = Object.keys(D).filter((k) => !brutes.includes(k));
console.log(`${toutes.length} clés · ${manquent.length} manquent · ${vides.length} à traduire (vides) · ${orphelines.length} en trop`);
if (!ECRIRE) {
  manquent.slice(0, 400).forEach((k) => console.log('  + ' + k));
  if (orphelines.length) console.log('en trop (plus utilisées) :\n' + orphelines.map((k) => '  - ' + k).join('\n'));
}
if (ECRIRE) {
  const tout = { ...D };
  manquent.forEach((k) => { tout[k] = ''; });
  const lignes = Object.entries(tout).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  const tete = `/* ==========================================================================
   L'Armoire à Cuillères — la traduction anglaise (chargée seulement en anglais, par le script de <head>)
   La clé : le texte français tel qu'il est écrit (espaces réduits) ; la valeur : l'anglais. {nom} : une valeur.
   Les clés : node tools/i18n.mjs (--ecrire ajoute celles qui manquent, --verifier contrôle).
   ========================================================================== */
window.AC_EN = {
`;
  fs.writeFileSync(path.join(ROOT, 'js', 'ac-en.js'), tete + lignes.join('\n') + '\n};\n');
  console.log(`js/ac-en.js : ${Object.keys(tout).length} clés (${manquent.length} ajoutées, vides)`);
}
if (VERIFIER && (manquent.length || vides.length)) process.exit(1);
