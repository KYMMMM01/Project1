// Turns the CC0 sample packs in art/sfx_src/kenney (Ogg Vorbis) into small 16-bit mono WAV files that play on iOS Safari and Android Chrome,
// measures each one, and keeps the sound board's candidate list and the license ledger in step.
//
//   node tools/sfx/convert.mjs                       every pack below (impact, rpg, the interface pack's clicks)
//   node tools/sfx/convert.mjs --pack rpg-audio      one pack
//   node tools/sfx/convert.mjs --pack impact-sounds --only "impactBell|impactPunch"   only the files whose name matches
//   env: SFX_PORT (local server, default 5252), SFX_CDP (Edge debugging port, default 9352), SFX_PROFILE (scratch folder)
//
// How it works: this script starts a tiny local server and headless Edge (muted: `--mute-audio`, and the page only decodes and writes, it never
// plays). The page (convert.html) decodes each Ogg (Edge can; Safari cannot be relied on), mixes it to mono at 44.1 kHz (a peak over 0.98 is turned down to 0.98 so
// the 16-bit file cannot clip), measures it (peak and loudness the way src/audio/analysis.ts does, so the board can match a sample to the game's level),
// trims the silence around it and writes a 16-bit PCM WAV. WAV on purpose: every browser decodes it, and it has no codec delay, so the attack of a hit stays
// sample-exact (AAC / MP3 start later by an amount that depends on the decoder, and iOS cannot be tested from here). Size stays small by the trim:
// a hit is 5 to 25 KB. Output: public/soundboard/kenney/<pack>/<name>.wav, public/soundboard/kenney/manifest.json and the table in
// docs/licenses/sounds.md between its markers. Nothing is downloaded: the sources are the packs the owner approved.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../edge/cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const SRC = path.join(root, 'art', 'sfx_src', 'kenney');
const OUT = path.join(root, 'public', 'soundboard', 'kenney');
const LEDGER = path.join(root, 'docs', 'licenses', 'sounds.md');
const PORT = Number(process.env.SFX_PORT || 5252);
const CDP = Number(process.env.SFX_CDP || 9352);
const PROFILE = process.env.SFX_PROFILE || path.join(os.tmpdir(), 'sfx-convert-edge');

/** The packs the owner approved. `keep` limits a pack to part of it (the interface pack: its click-like family only). */
const PACKS = {
  'impact-sounds': { dir: 'kenney_impact-sounds/Audio' },
  'rpg-audio': { dir: 'kenney_rpg-audio/Audio' },
  'interface-sounds': { dir: 'kenney_interface-sounds/Audio', keep: /^(click|tick|select|switch|toggle)_/ },
};

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const only = arg('--only') ? new RegExp(arg('--only')) : null;
const wanted = arg('--pack') && arg('--pack') !== 'all' ? [arg('--pack')] : Object.keys(PACKS);
for (const p of wanted) if (!PACKS[p]) throw new Error(`unknown pack ${p}; known: ${Object.keys(PACKS).join(', ')}`);

const files = [];
for (const pack of wanted) {
  const dir = path.join(SRC, PACKS[pack].dir);
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.ogg')).sort()) {
    const name = f.replace(/\.ogg$/, '');
    if (PACKS[pack].keep && !PACKS[pack].keep.test(name)) continue;
    if (only && !only.test(name)) continue;
    files.push({ pack, name, src: path.join(dir, f), url: `/src/${pack}/${encodeURIComponent(f)}`, out: `${pack}/${name}.wav` });
  }
}
if (files.length === 0) throw new Error('no files to convert');
console.log(`converting ${files.length} files from ${wanted.join(', ')} to 16-bit mono 44.1 kHz WAV`);

let manifest = null;
let finished = false;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const body = () => new Promise((resolve) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => resolve(Buffer.concat(c))); });
  const send = (code, type, data) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(data); };
  if (req.method === 'POST' && p.startsWith('/save/')) {
    body().then((b) => {
      const rel = decodeURI(p.slice('/save/'.length));
      const target = path.resolve(OUT, rel);
      if (!target.startsWith(OUT + path.sep)) return send(400, 'text/plain', 'bad path');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, b);
      send(200, 'text/plain', 'ok');
    });
    return;
  }
  if (req.method === 'POST' && p === '/manifest') { body().then((b) => { manifest = JSON.parse(b.toString('utf8')); send(200, 'text/plain', 'ok'); }); return; }
  if (req.method === 'POST' && p === '/event') { body().then((b) => { console.log('page:', b.toString('utf8')); send(200, 'text/plain', 'ok'); }); return; }
  if (req.method === 'POST' && p === '/finish') { finished = true; send(200, 'text/plain', 'ok'); return; }
  if (p === '/convert.html') return send(200, 'text/html; charset=utf-8', fs.readFileSync(path.join(here, 'convert.html')));
  if (p === '/config.json') return send(200, 'application/json', JSON.stringify({ files: files.map((f) => ({ pack: f.pack, name: f.name, url: f.url, out: f.out })) }));
  if (p.startsWith('/src/')) {
    const [, , pack, ...rest] = p.split('/');
    const f = files.find((x) => x.pack === pack && encodeURIComponent(path.basename(x.src)) === rest.join('/'));
    if (!f) return send(404, 'text/plain', 'no such source');
    return send(200, 'audio/ogg', fs.readFileSync(f.src));
  }
  send(404, 'text/plain', 'not found');
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const b = await launch({ port: CDP, userDir: PROFILE, width: 600, height: 400 });
try {
  await b.goto(`http://127.0.0.1:${PORT}/convert.html`);
  const t0 = Date.now();
  while (!finished) {
    if (Date.now() - t0 > 10 * 60 * 1000) throw new Error('timed out');
    await b.sleep(500);
  }
} finally {
  b.close();
  server.close();
}

// ── manifest: this run's entries replace the same packs' old ones, other packs stay ──
fs.mkdirSync(OUT, { recursive: true });
const manifestFile = path.join(OUT, 'manifest.json');
let all = [];
try { all = JSON.parse(fs.readFileSync(manifestFile, 'utf8')).files; } catch { /* first run */ }
const fresh = new Set(manifest.map((m) => `${m.pack}/${m.name}`));
all = all.filter((m) => !fresh.has(`${m.pack}/${m.name}`)).concat(manifest.filter((m) => !m.error));
const order = Object.keys(PACKS);
all.sort((a, c) => order.indexOf(a.pack) - order.indexOf(c.pack) || (a.name < c.name ? -1 : 1));
fs.writeFileSync(manifestFile, JSON.stringify({ made: new Date().toISOString().slice(0, 10), codec: 'PCM 16-bit mono 44100 Hz WAV, silence trimmed', files: all }, null, 0) + '\n');

const bad = manifest.filter((m) => m.error);
const bytes = manifest.reduce((s, m) => s + (m.bytes || 0), 0);
console.log(`done: ${manifest.length - bad.length} files, ${(bytes / 1024).toFixed(0)} KB, ${bad.length} failed`);
for (const m of bad) console.log('FAILED', m.name, m.error);
// ── the license ledger: the table between the markers is rewritten from the manifest ──
const URLS = { 'impact-sounds': 'https://kenney.nl/assets/impact-sounds', 'rpg-audio': 'https://kenney.nl/assets/rpg-audio', 'interface-sounds': 'https://kenney.nl/assets/interface-sounds' };
const today = new Date().toISOString().slice(0, 10);
const rows = all.map((m) => `| public/soundboard/kenney/${m.file} | ${m.pack} / ${m.name}.ogg | ${URLS[m.pack]} | CC0 | ${today} | sound board candidate only (not in the game) |`);
const table = ['| file served | source pack / file | source URL | license | date | where it is used |', '|---|---|---|---|---|---|', ...rows].join('\n');
if (fs.existsSync(LEDGER)) {
  const text = fs.readFileSync(LEDGER, 'utf8');
  const a = text.indexOf('<!-- board:begin -->');
  const z = text.indexOf('<!-- board:end -->');
  if (a >= 0 && z > a) {
    fs.writeFileSync(LEDGER, `${text.slice(0, a)}<!-- board:begin -->\n${table}\n${text.slice(z)}`);
    console.log(`ledger table rewritten (${rows.length} rows, ${today})`);
  } else console.log('ledger has no markers: table not written');
} else console.log('no ledger file yet: create docs/licenses/sounds.md with the board:begin / board:end markers');
