// A look at sounds without a speaker (docs/qa/sound_audit_2026-10-18.md, "12. Skill sounds"): the sounds are baked offline with the game's own recipes, measured, and drawn as a sheet,
// one panel per sound: the waveform on top, under it a spectrogram (80 Hz to 16 kHz on a log axis, time in ms). Muted headless Edge; nothing is played.
//   node tools/sfx/audit/sheet.mjs <name> --ids sp_tiger_roar,sp_cut_clash [--samples impact-sounds/impactMetal_light_000] [--variants all] [--per 5] [--tmax 0.5]
// needs a dev server (npx vite --port 5253 --host 127.0.0.1); env SND_VITE / SND_CDP change the ports; the sheets go to AUDIT_OUT/sheets (default <tmp>/meow-sound-audit/sheets)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { launch } = await import(new URL('../../edge/cdp.mjs', import.meta.url).href);
const OUT = path.join(process.env.AUDIT_OUT ?? path.join(os.tmpdir(), 'meow-sound-audit'), 'sheets');
const args = process.argv.slice(2);
const name = args[0];
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const spec = { ids: opt('ids')?.split(',').map((s) => (s.startsWith('sfx:') || s.startsWith('stinger:') ? s : 'sfx:' + s)), samples: opt('samples')?.split(','), variants: opt('variants') ?? 'first', perSheet: Number(opt('per') ?? 5) };
if (opt('tmax')) spec.tmax = Number(opt('tmax'));
if (opt('top')) spec.specTop = Number(opt('top'));
const PORT = Number(process.env.SND_CDP ?? 9353), VITE = Number(process.env.SND_VITE ?? 5253);
fs.mkdirSync(OUT, { recursive: true });
const STUB = `(() => { const W = window.WebSocket; window.WebSocket = new Proxy(W, { construct(t, args) { if (args[1] === 'vite-hmr' || (Array.isArray(args[1]) && args[1].includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 3 }; return new t(...args); } }); })();`;
const b = await launch({ port: PORT, userDir: path.join(OUT, 'profile-' + PORT), width: 900, height: 700 });
const dog = setTimeout(() => { console.error('WATCHDOG'); b.close(); process.exit(3); }, 600000);
try {
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  await b.goto(`http://127.0.0.1:${VITE}/?debug=1&demo=audio`);
  for (let i = 0; i < 80; i++) { await b.sleep(500); if (await b.eval('!!(window.__dbg && window.__dbg.audio)').catch(() => false)) break; }
  const code = fs.readFileSync(path.join(here, 'sheet_page.js'), 'utf8');
  const t0 = Date.now();
  const res = JSON.parse(await b.eval(`(${code})(${JSON.stringify(spec)})`));
  res.sheets.forEach((s, i) => fs.writeFileSync(path.join(OUT, `${name}_${i + 1}.png`), Buffer.from(s, 'base64')));
  const pad = (v, n) => String(v).padEnd(n);
  console.log(pad('label', 26), pad('ms', 5), pad('pk', 6), pad('L100', 6), pad('cen', 5), pad('att', 5), pad('t20', 5), pad('bite', 6), pad('body', 6), pad('phone', 5), 'bands(sub/low/lm/mid/hi/air)', 'gain');
  for (const r of res.rows) console.log(pad(r.label, 26), pad(r.ms, 5), pad(r.peakDb, 6), pad(r.l100, 6), pad(r.centroid, 5), pad(r.attack, 5), pad(r.t20, 5), pad(r.bite, 6), pad(r.body, 6), pad(r.phone, 5), pad(r.band, 28), r.gainDb !== undefined ? r.gainDb.toFixed(1) : '');
  console.log('sheets', res.sheets.length, 'secs', ((Date.now() - t0) / 1000).toFixed(1));
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(res.rows));
} finally { clearTimeout(dog); b.close(); }
