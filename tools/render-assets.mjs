#!/usr/bin/env node
// Icônes d'appli (écran d'accueil, PWA) et image de partage (Open Graph), rendues par Chrome sans tête
// depuis tools/render/icone.html et tools/render/og.html (qui dessinent avec les vrais éléments de la marque).
// Il faut le serveur local : python tools/dev-server.py (port 5190), puis : node tools/render-assets.mjs
// (node tools/render-assets.mjs icones : les icônes seules ; … og : l'image de partage seule)
import { capture } from './capture.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:5190';
const out = (...p) => path.join(ROOT, ...p);
const quoi = process.argv[2] || 'tout';

// [fichier, taille, échelle du dessin (maskable : dans le cercle de sécurité), épaisseur du trait, silhouettes pleines]
const jobs = [
  ['apple-touch-icon.png', 180, 1, 1.2, 0],
  ['icon-192.png', 192, 1, 1.2, 0],
  ['icon-512.png', 512, 1, 1.2, 0],
  ['icon-maskable-512.png', 512, 0.74, 1.2, 0],
  ['favicon.png', 64, 1.12, 8, 1], // l'onglet du navigateur : les silhouettes pleines, plus grandes (le trait fin y disparaît)
];
if (quoi !== 'og') {
  for (const [name, size, k, trait, plein] of jobs) {
    await capture(`${BASE}/tools/render/icone.html?k=${k}&trait=${trait}&plein=${plein}`, out('assets', 'icons', name), { w: 512, h: 512, scale: size / 512, wait: 2500, selector: '#ic' });
    console.log('icône', name);
  }
}
if (quoi !== 'icones') {
  await capture(`${BASE}/tools/render/og.html`, out('assets', 'img', 'og-armoire.jpg'), { w: 1200, h: 630, scale: 1, wait: 3500, format: 'jpeg', quality: 86 });
  console.log('image de partage assets/img/og-armoire.jpg');
}
process.exit(0);
