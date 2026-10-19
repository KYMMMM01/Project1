// hit measure: node hm.mjs <name> <ids,comma> [--variants all|first] [--per 5] [--chunk 5] [--tmax 0.3] [--samples a,b]
// Same page code as tools/sfx/audit/sheet_page.js, but in chunks with a timeout per chunk, a fresh browser after a hang, a table of numbers as the result and
// the pictures in <SCR>/sheets/<name>_<n>.png. Muted headless Edge, nothing is played.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { launch } = await import(new URL('../../edge/cdp.mjs', import.meta.url).href);
const SC = (process.env.AUDIT_OUT ?? path.join(os.tmpdir(), 'meow-sound-audit')).split(path.sep).join('/');
const args = process.argv.slice(2);
const name = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ids = args[1] && !args[1].startsWith('--') ? args[1].split(',') : [];
const variants = opt('variants', 'first'), per = Number(opt('per', 5)), chunk = Number(opt('chunk', 5)), tmax = opt('tmax') ? Number(opt('tmax')) : undefined;
const samples = opt('samples') ? opt('samples').split(',') : undefined;
const noimg = args.includes('--noimg');
const PORT = Number(process.env.HM_CDP ?? 9354), VITE = Number(process.env.HM_VITE ?? 5254);
let code = fs.readFileSync('' + path.join(HERE, 'sheet_page.js') + '', 'utf8');
if (noimg) {
  code = code.replace('drawPanel(ctx, y, it.x, it.rate, it.label, m, tmax);', 'void tmax;').replace("out.sheets.push(cv.toDataURL('image/png').split(',')[1]);", 'void cv;');
}
const STUB = `(() => { const W = window.WebSocket; window.WebSocket = new Proxy(W, { construct(t, args) { if (args[1] === 'vite-hmr' || (Array.isArray(args[1]) && args[1].includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 3 }; return new t(...args); } }); })();`;
fs.mkdirSync(`${SC}/sheets`, { recursive: true });
const rows = [];
let sheetNo = 0;
async function session(groups) {
  const b = await launch({ port: PORT, userDir: path.join(SC, 'profile-' + PORT), width: 900, height: 700 });
  const dog = setTimeout(() => { console.error('WATCHDOG'); b.close(); process.exit(3); }, 420000);
  try {
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
    await b.goto(`http://127.0.0.1:${VITE}/?debug=1&demo=audio`);
    for (let i = 0; i < 80; i++) { await b.sleep(500); if (await b.eval('!!(window.__dbg && window.__dbg.audio)').catch(() => false)) break; }
    for (let g = 0; g < groups.length; g++) {
      const spec = { ids: groups[g].ids.map((s) => (s.startsWith('stinger:') ? s : 'sfx:' + s)), samples: groups[g].samples, variants, perSheet: per };
      if (tmax) spec.tmax = tmax;
      const r = await Promise.race([
        b.eval(`(${code})(${JSON.stringify(spec)})`).then((x) => JSON.parse(x)),
        new Promise((res) => setTimeout(() => res('HANG'), 60000)),
      ]);
      if (r === 'HANG') { console.error('HANG in', JSON.stringify(groups[g].ids)); return groups.slice(g + 1); }
      rows.push(...r.rows);
      if (!noimg) for (const s of r.sheets) fs.writeFileSync(`${SC}/sheets/${name}_${++sheetNo}.png`, Buffer.from(s, 'base64'));
    }
    return [];
  } finally { clearTimeout(dog); b.close(); }
}
let groups = [];
for (let i = 0; i < ids.length; i += chunk) groups.push({ ids: ids.slice(i, i + chunk) });
if (samples) groups.push({ ids: [], samples });
while (groups.length) groups = await session(groups);
const pad = (v, n) => String(v).padEnd(n);
console.log(pad('label', 24), pad('ms', 5), pad('pk', 6), pad('L100', 6), pad('cen', 5), pad('att', 5), pad('t20', 5), pad('bite', 6), pad('body', 6), pad('phone', 5), 'bands(sub/low/lm/mid/hi/air)');
for (const r of rows) console.log(pad(r.label, 24), pad(r.ms, 5), pad(r.peakDb, 6), pad(r.l100, 6), pad(r.centroid, 5), pad(r.attack, 5), pad(r.t20, 5), pad(r.bite, 6), pad(r.body, 6), pad(r.phone, 5), pad(r.band, 28), r.gainDb !== undefined ? r.gainDb.toFixed(1) : '');
fs.writeFileSync(`${SC}/sheets/${name}.json`, JSON.stringify(rows));
