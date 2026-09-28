#!/usr/bin/env node
// Icônes d'appli (écran d'accueil, PWA) et image de partage (Open Graph), rendues par Chrome sans tête
// depuis tools/render/icone.html et tools/render/og.html (qui dessinent avec les vrais éléments de la marque).
// Il faut le serveur local : python tools/dev-server.py (port 5190), puis : node tools/render-assets.mjs
import { capture } from './capture.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:5190';
const out = (...p) => path.join(ROOT, ...p);

// [fichier, taille, échelle du dessin (maskable : dans le cercle de sécurité), épaisseur du trait]
const jobs = [
  ['apple-touch-icon.png', 180, 1, 2.8],
  ['icon-192.png', 192, 1, 2.8],
  ['icon-512.png', 512, 1, 2.8],
  ['icon-maskable-512.png', 512, 0.8, 2.8],
  ['favicon.png', 64, 1, 7], // l'onglet du navigateur : un trait bien plus épais, sinon il disparaît
];
for (const [name, size, k, trait] of jobs) {
  await capture(`${BASE}/tools/render/icone.html?k=${k}&trait=${trait}`, out('assets', 'icons', name), { w: 512, h: 512, scale: size / 512, wait: 2500, selector: '#ic' });
  console.log('icône', name);
}
await capture(`${BASE}/tools/render/og.html`, out('assets', 'img', 'og-armoire.jpg'), { w: 1200, h: 630, scale: 1, wait: 3500, format: 'jpeg', quality: 86 });
console.log('image de partage assets/img/og-armoire.jpg');
process.exit(0);
