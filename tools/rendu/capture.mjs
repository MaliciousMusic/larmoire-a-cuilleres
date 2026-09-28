#!/usr/bin/env node
/* Capture d'une page de contrôle avec Chrome sans tête (protocole CDP, sans dépendance).
   node tools/rendu/capture.mjs <page.html|url> <sortie.png> [--w 1400] [--h 900] [--scale 2]
        [--sel "#id"] [--wait LAB_DONE] [--timeout 60000] [--eval "expr"]
   - attend que window[--wait] soit vrai (par défaut LAB_DONE), capture la page entière
     (ou l'élément --sel) à l'échelle --scale, affiche la console et les erreurs de la page.
   - --eval : affiche en plus le résultat d'une expression JS (ex. les temps mesurés). */
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [page, out] = pos;
if (!page || !out) {
  console.error('usage : node capture.mjs <page> <sortie.png> [--w 1400] [--h 900] [--scale 2] [--sel css] [--eval js]');
  process.exit(1);
}
const W = +opt('w', 1400), H = +opt('h', 900), SCALE = +opt('scale', 2);
const SEL = opt('sel', null), WAIT = opt('wait', 'LAB_DONE'), TIMEOUT = +opt('timeout', 90000);
const EVAL = opt('eval', null);
const url = /^(https?|file):/.test(page) ? page : pathToFileURL(resolve(page.split('?')[0])).href + (page.includes('?') ? '?' + page.split('?')[1] : '');

const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p));
const port = 9300 + Math.floor(Math.random() * 500);
const prof = join(tmpdir(), 'ac-capture-' + port);
mkdirSync(prof, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + prof,
  '--no-first-run', '--no-default-browser-check', ...(process.env.GPU ? ['--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] : ['--disable-gpu']), '--hide-scrollbars',
  '--allow-file-access-from-files', '--window-size=' + W + ',' + H, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
  for (let k = 0; k < 100; k++) {
    try {
      const l = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      const p = l.find((t) => t.type === 'page');
      if (p) return p.webSocketDebuggerUrl;
    } catch (e) { /* pas encore prêt */ }
    await sleep(100);
  }
  throw new Error('Chrome ne répond pas');
}

let ws, seq = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}

try {
  ws = new WebSocket(await target());
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    } else if (m.method === 'Runtime.consoleAPICalled') {
      console.log('[console.' + m.params.type + ']', m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      console.log('[ERREUR]', d.exception ? d.exception.description : d.text, d.url || '', d.lineNumber);
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });
  const PROF = args.includes('--profile');
  if (PROF) {
    await send('Profiler.enable');
    await send('Profiler.setSamplingInterval', { interval: 200 });
    await send('Profiler.start');
  }
  const t0 = Date.now();
  await send('Page.navigate', { url });
  let ok = false;
  while (Date.now() - t0 < TIMEOUT) {
    await sleep(250);
    const r = await send('Runtime.evaluate', { expression: '!!window.' + WAIT, returnByValue: true });
    if (r.result && r.result.value) { ok = true; break; }
  }
  if (!ok) console.log('[capture] délai dépassé en attendant window.' + WAIT);
  if (PROF) {
    // profil CPU : temps propre par fonction (les 30 plus coûteuses)
    const { profile } = await send('Profiler.stop');
    const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = profile.timeDeltas;
    profile.samples.forEach((id, k) => {
      const n = byId.get(id), cf = n.callFrame;
      const key = (cf.functionName || '(anonyme)') + ' ' + (cf.url || '').split('/').pop() + ':' + (cf.lineNumber + 1);
      self.set(key, (self.get(key) || 0) + (dt[k] || 0) / 1000);
    });
    [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, v]) => console.log(v.toFixed(1).padStart(8) + ' ms  ' + k));
  }
  if (EVAL) {
    const r = await send('Runtime.evaluate', { expression: EVAL, returnByValue: true });
    console.log(typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value, null, 1));
  }
  let clip;
  if (SEL) {
    const r = await send('Runtime.evaluate', {
      expression: `(()=>{const e=document.querySelector(${JSON.stringify(SEL)});if(!e)return null;const b=e.getBoundingClientRect();return {x:b.left+scrollX,y:b.top+scrollY,width:b.width,height:b.height}})()`,
      returnByValue: true,
    });
    clip = r.result.value;
  } else {
    const m = await send('Page.getLayoutMetrics');
    const cs = m.cssContentSize || m.contentSize;
    clip = { x: 0, y: 0, width: Math.max(W, Math.ceil(cs.width)), height: Math.ceil(cs.height) };
  }
  if (!clip) throw new Error('élément introuvable : ' + SEL);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...clip, scale: 1 } });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('[capture] ' + out + ' (' + Math.round(clip.width) + '×' + Math.round(clip.height) + ' css, ×' + SCALE + ') en ' + (Date.now() - t0) + ' ms');
} catch (e) {
  console.error('[capture] échec :', e.message);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch (e) { /* rien */ }
  chrome.kill();
}
