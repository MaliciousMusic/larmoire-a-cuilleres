#!/usr/bin/env node
// Change le code équipe de la carte fidélité (6 chiffres), celui qui accroche les cuillères.
// Usage : node tools/set-pin.mjs 482157
// Le code n'est jamais stocké en clair : seule son empreinte SHA-256 est écrite dans js/ac-fidelite.js.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pin = process.argv[2];
if (!/^\d{6}$/.test(pin || '')) {
  console.error('Usage : node tools/set-pin.mjs <code à 6 chiffres>');
  process.exit(1);
}

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'ac-fidelite.js');
const src = readFileSync(file, 'utf8');
const salt = (src.match(/salt:\s*'([^']+)'/) || [])[1];
if (!salt) {
  console.error('Sel introuvable dans js/ac-fidelite.js');
  process.exit(1);
}
const hash = createHash('sha256').update(`${salt}:${pin}`).digest('hex');
writeFileSync(file, src.replace(/pinHash:\s*'[0-9a-f]*'/, `pinHash: '${hash}'`));
console.log('Code équipe mis à jour. Pensez à publier la modification.');
