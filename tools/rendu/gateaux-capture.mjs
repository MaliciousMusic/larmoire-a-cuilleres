#!/usr/bin/env node
// Capture de la page de contrôle des gâteaux avec Chrome sans tête (protocole DevTools, sans dépendance).
// Usage : node tools/rendu/gateaux-capture.mjs [sortie.png] [--page lab/gateaux.html] [--q "zoom=1&id=cookie"]
//         [--w 1320] [--dpr 2] [--clip x,y,w,h]   (clip en px CSS)
// Affiche aussi les temps de calcul mesurés par la page (window.__mesures).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = { out: null, page: 'lab/gateaux.html', q: '', w: 1320, dpr: 2, clip: null };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--page') opt.page = args[++i];
  else if (a === '--q') opt.q = args[++i];
  else if (a === '--w') opt.w = +args[++i];
  else if (a === '--dpr') opt.dpr = +args[++i];
  else if (a === '--clip') opt.clip = args[++i].split(',').map(Number);
  else opt.out = a;
}
opt.out = resolve(opt.out || join(ROOT, 'tools', 'rendu', 'gateaux-planche.png'));

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profil = mkdtempSync(join(tmpdir(), 'ac-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files', '--remote-debugging-port=0', `--user-data-dir=${profil}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const wsUrl = await new Promise((ok, ko) => {
  let buf = '';
  const t = setTimeout(() => ko(new Error('Chrome ne répond pas')), 20000);
  chrome.stderr.on('data', (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) { clearTimeout(t); ok(m[1]); }
  });
});

const ws = new WebSocket(wsUrl);
await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));
let id = 0;
const attente = new Map(), ecoute = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && attente.has(m.id)) {
    const { ok, ko } = attente.get(m.id);
    attente.delete(m.id);
    m.error ? ko(new Error(m.error.message)) : ok(m.result);
  } else if (m.method) ecoute.forEach((f) => f(m));
});
const send = (method, params = {}, sessionId) => new Promise((ok, ko) => {
  const n = ++id;
  attente.set(n, { ok, ko });
  ws.send(JSON.stringify({ id: n, method, params, sessionId }));
});

try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  const logs = [];
  ecoute.push((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  });
  await S('Runtime.enable');
  await S('Page.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: opt.w, height: 900, deviceScaleFactor: opt.dpr, mobile: false });
  const url = pathToFileURL(join(ROOT, opt.page)).href + (opt.q ? '?' + opt.q : '');
  const charge = new Promise((ok) => ecoute.push((m) => m.sessionId === sessionId && m.method === 'Page.loadEventFired' && ok()));
  await S('Page.navigate', { url });
  await charge;
  // la page expose window.__pret (promesse) quand tout est dessiné
  await S('Runtime.evaluate', { expression: 'window.__pret || true', awaitPromise: true, timeout: 120000 });
  const { result } = await S('Runtime.evaluate', { expression: 'JSON.stringify({h: document.documentElement.scrollHeight, m: window.__mesures || []})', returnByValue: true });
  const info = JSON.parse(result.value);
  const H = opt.clip ? opt.clip[1] + opt.clip[3] : info.h;
  await S('Emulation.setDeviceMetricsOverride', { width: opt.w, height: Math.min(16000, H), deviceScaleFactor: opt.dpr, mobile: false });
  const clip = opt.clip ? { x: opt.clip[0], y: opt.clip[1], width: opt.clip[2], height: opt.clip[3], scale: 1 }
    : { x: 0, y: 0, width: opt.w, height: Math.min(16000, H), scale: 1 };
  const shot = await S('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
  writeFileSync(opt.out, Buffer.from(shot.data, 'base64'));
  console.log('capture :', opt.out);
  for (const l of logs) console.log('  console :', l);
  if (info.m.length) {
    console.log('  temps de calcul (ms) :');
    for (const m of info.m) console.log(`    ${m.id.padEnd(22)} graine ${String(m.seed).padEnd(6)} ppm ${m.ppm}  ${String(m.ms).padStart(6)} ms  (${m.px})`);
  }
} finally {
  ws.close();
  chrome.kill();
  setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch (e) { /* profil encore verrouillé */ } }, 500);
}
