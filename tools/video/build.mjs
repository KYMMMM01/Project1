// Builds the patch-notes video. See tools/video/README.md.
//   node tools/video/build.mjs                 narration (changed lines only) -> timeline -> render in headless Edge -> video/<name>.mp4 + thumbnail
//   node tools/video/build.mjs --timeline      narration + timeline only, prints the card table (no render)
//   node tools/video/build.mjs --stills 3,12.5 renders only those moments to PNG (fast look at the layout) into video/work/shots
//   node tools/video/build.mjs --verify        opens the finished MP4 in a page, saves stills and measures its audio
// Options: --force-tts (render every line again), --no-tts, --shots-dir <dir> (where stills and the verification PNGs go)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, work, runPage } from './runner.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };

const script = JSON.parse(fs.readFileSync(path.join(here, 'script.json'), 'utf8'));
const ttsDir = path.join(work, 'tts');
const outDir = path.join(work, 'out');
fs.mkdirSync(ttsDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

// ───────────── glyph check: every character on screen must exist in the game's full fonts ─────────────
function cmapOf(file) {
  const b = fs.readFileSync(file);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = v.getUint16(4);
  let cmapAt = -1;
  for (let i = 0; i < n; i++) {
    const tag = b.toString('latin1', 12 + i * 16, 16 + i * 16);
    if (tag === 'cmap') cmapAt = v.getUint32(20 + i * 16);
  }
  const out = new Set();
  const subtables = v.getUint16(cmapAt + 2);
  for (let i = 0; i < subtables; i++) {
    const at = cmapAt + v.getUint32(cmapAt + 8 + i * 8);
    const format = v.getUint16(at);
    if (format === 12) {
      const groups = v.getUint32(at + 12);
      for (let g = 0; g < groups; g++) {
        const first = v.getUint32(at + 16 + g * 12), last = v.getUint32(at + 20 + g * 12);
        for (let c = first; c <= last; c++) out.add(c);
      }
    } else if (format === 4) {
      const seg = v.getUint16(at + 6) / 2;
      const ends = at + 14, starts = ends + seg * 2 + 2;
      for (let s = 0; s < seg; s++) {
        const last = v.getUint16(ends + s * 2);
        for (let c = v.getUint16(starts + s * 2); c <= last && c < 0xffff; c++) out.add(c);
      }
    }
  }
  return out;
}

function checkGlyphs() {
  const jua = cmapOf(path.join(root, 'node_modules/@expo-google-fonts/jua/400Regular/Jua_400Regular.ttf'));
  const lilita = cmapOf(path.join(root, 'node_modules/@expo-google-fonts/lilita-one/400Regular/LilitaOne_400Regular.ttf'));
  const chars = new Set();
  const walk = (o) => {
    if (typeof o === 'string') for (const ch of o) chars.add(ch);
    else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') Object.values(o).forEach(walk);
  };
  const clone = JSON.parse(JSON.stringify(script));
  for (const c of clone.cards) { delete c.say; walk(c.caption = (c.caption || '').replace(/\*\*/g, '')); }
  walk(clone.meta); walk(clone.chapters.map((c) => [c.no, c.title, c.sub]));
  walk(clone.cards.map((c) => [c.title, c.lines, c.banner, c.ranks, c.foot, c.sub, c.items, c.rows, c.chip, c.counts, c.chips, c.bars, c.a, c.b, c.since]));
  const missing = [...chars].filter((ch) => ch.trim() && !/[\u0000-\u001f]/.test(ch) && !jua.has(ch.codePointAt(0)) && !lilita.has(ch.codePointAt(0)));
  const hangul = [...chars].filter((ch) => ch >= '가' && ch <= '힣').length;
  console.log(`[glyphs] ${chars.size} distinct characters, ${hangul} Hangul syllables, missing from Jua + Lilita One: ${missing.length ? missing.join(' ') : 'none'}`);
  return missing;
}

// ───────────── narration ─────────────
function runTts() {
  const lines = script.cards.map((c) => ({ id: c.id, say: c.say }));
  const linesFile = path.join(work, 'lines.json');
  fs.writeFileSync(linesFile, JSON.stringify(lines, null, 1));
  const psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'tts.ps1'), '-Lines', linesFile, '-OutDir', ttsDir, '-Rate', String(script.tts.rate), '-Voice', script.tts.voice];
  if (flag('--force-tts')) psArgs.push('-Force');
  const r = spawnSync('powershell', psArgs, { encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  if (r.status !== 0) { process.stderr.write(r.stderr || ''); throw new Error('tts.ps1 failed'); }
}

function wavInfo(file) {
  const b = fs.readFileSync(file);
  let pos = 12, fmt = null, dataBytes = 0;
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    if (id === 'fmt ') fmt = { channels: b.readUInt16LE(pos + 10), rate: b.readUInt32LE(pos + 12), bits: b.readUInt16LE(pos + 22) };
    if (id === 'data') { dataBytes = Math.min(size, b.length - pos - 8); break; }
    pos += 8 + size + (size & 1);
  }
  if (!fmt) throw new Error('bad wav ' + file);
  return { ...fmt, seconds: dataBytes / (fmt.rate * fmt.channels * (fmt.bits / 8)) };
}

// ───────────── timeline ─────────────
function makeTimeline() {
  const T = script.timing;
  const fps = 30;
  const grid0 = script.bgm.dropInVideo, beat = script.bgm.beat;
  let t = 0;
  const cards = [];
  for (const c of script.cards) {
    const wav = path.join(ttsDir, c.id + '.wav');
    const info = wavInfo(wav);
    const lead = c.lead ?? T.lead;
    const need = Math.max(T.minCard, lead + info.seconds + T.breath) + (c.tail || 0);
    let end = t + need;
    if (T.beatSnap) { const unit = beat / T.beatSnap; end = grid0 + Math.ceil((end - grid0) / unit - 1e-6) * unit; }
    end = Math.round(end * fps) / fps; // card edges on frame boundaries
    if (end < t + need - 1e-6) end += 1 / fps;
    cards.push({ id: c.id, kind: c.kind, start: +t.toFixed(4), dur: +(end - t).toFixed(4), narrStart: +(t + lead).toFixed(4), narrDur: +info.seconds.toFixed(4), wav: `/work/tts/${c.id}.wav` });
    t = end;
  }
  const total = Math.ceil(t * fps) / fps;
  return { fps, total, frames: Math.round(total * fps), grid: { t0: grid0, beat }, bgmStart: +(script.bgm.dropAt - grid0).toFixed(4), cards };
}

function fmtTime(s) { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; }

if (!flag('--no-tts')) runTts();
const missing = checkGlyphs();
const timeline = makeTimeline();
fs.writeFileSync(path.join(work, 'timeline.json'), JSON.stringify(timeline, null, 1));
console.log(`[timeline] ${timeline.cards.length} cards, ${timeline.total.toFixed(2)} s (${timeline.frames} frames)`);
for (const c of timeline.cards) {
  const sc = script.cards.find((x) => x.id === c.id);
  console.log(`  ${c.id} ${c.kind.padEnd(8)} ${fmtTime(c.start)}  dur ${c.dur.toFixed(2).padStart(5)}  voice ${c.narrDur.toFixed(2).padStart(5)}  ${sc.caption.replace(/\*\*/g, '')}`);
}
const speech = timeline.cards.reduce((a, c) => a + c.narrDur, 0);
console.log(`[timeline] speech ${speech.toFixed(1)} s of ${timeline.total.toFixed(1)} s; bed starts at ${timeline.bgmStart.toFixed(3)} s of the track`);
if (flag('--timeline')) process.exit(0);
if (missing.length) console.log('[glyphs] WARNING: the characters above would be drawn in a fallback font');

const shotsDir = path.resolve(opt('--shots-dir', path.join(work, 'shots')));
fs.mkdirSync(shotsDir, { recursive: true });

if (flag('--stills')) {
  const times = opt('--stills').split(',').map((tok) => {
    const m = /^(c\d+)@([\d.]+)$/.exec(tok); // cNN@u = u seconds into card cNN
    if (!m) return tok;
    const card = timeline.cards.find((c) => c.id === m[1]);
    return String(Math.min(card.start + Number(m[2]), card.start + card.dur - 1 / 30));
  }).join(',');
  const r = await runPage({ page: 'index.html', query: `mode=stills&times=${encodeURIComponent(times)}`, env: { VIDEO_SHOTS_DIR: shotsDir }, timeoutMs: 5 * 60 * 1000 });
  console.log(r.ok ? `stills saved to ${shotsDir}` : 'render page did not finish');
  process.exit(r.ok ? 0 : 1);
}

if (flag('--verify')) {
  const file = path.join(outDir, 'video.mp4');
  if (!fs.existsSync(file)) throw new Error('no video yet: run the build first');
  const r = await runPage({ page: 'verify.html', env: { VIDEO_SHOTS_DIR: shotsDir }, timeoutMs: 6 * 60 * 1000 });
  const rep = r.events.find((e) => e.type === 'verify');
  if (rep) fs.writeFileSync(path.join(shotsDir, 'verify.json'), JSON.stringify(rep, null, 1));
  console.log(r.ok ? `verification stills and verify.json saved to ${shotsDir}` : 'verify page did not finish');
  process.exit(r.ok ? 0 : 1);
}

// ───────────── render ─────────────
fs.rmSync(path.join(outDir, 'video.mp4'), { force: true });
const started = Date.now();
const r = await runPage({ page: 'index.html', query: 'mode=render', env: { VIDEO_SHOTS_DIR: shotsDir }, timeoutMs: 25 * 60 * 1000 });
const mixEv = r.events.find((e) => e.type === 'mix');
if (mixEv) fs.writeFileSync(path.join(outDir, 'mix_stats.json'), JSON.stringify(mixEv.stats, null, 1));
const mp4 = path.join(outDir, 'video.mp4');
if (!r.ok || !fs.existsSync(mp4)) throw new Error('the render page did not deliver an mp4');
const finalDir = path.join(root, 'video');
const name = script.meta.output;
fs.copyFileSync(mp4, path.join(finalDir, `${name}.mp4`));
const thumb = path.join(outDir, 'thumb.png');
if (fs.existsSync(thumb)) fs.copyFileSync(thumb, path.join(finalDir, `${name}_thumb.png`));
const size = fs.statSync(path.join(finalDir, `${name}.mp4`)).size;
console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)} s: video/${name}.mp4 (${(size / 1048576).toFixed(1)} MB, ${timeline.total.toFixed(1)} s)`);
