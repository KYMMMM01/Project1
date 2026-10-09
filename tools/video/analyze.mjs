// node tools/video/analyze.mjs : decodes video/bgm.* in headless Edge and prints its length, loudness envelope and a tempo guess.
import fs from 'node:fs';
import path from 'node:path';
import { runPage, work } from './runner.mjs';

// optional: node analyze.mjs 78 86  prints the 50 ms envelope and the onsets of that stretch
const [from, to] = process.argv.slice(2);
const r = await runPage({ page: 'analyze.html', query: from ? `from=${from}&to=${to || Number(from) + 8}` : '', quiet: true, timeoutMs: 120000 });
const ev = r.events.find((e) => e.type === 'bgm');
if (!ev) { console.error('no analysis came back'); process.exit(1); }
const out = path.join(work, 'out', 'bgm_analysis.json');
console.log('duration', ev.duration.toFixed(1), 's, sample rate', ev.sampleRate, ', peak', ev.peakDb, 'dBFS');
console.log('tempo guesses', JSON.stringify(ev.tempos));
const rows = [];
for (let i = 0; i < ev.envDb.length; i += 10) rows.push(`${String(i * 0.5).padStart(6)}s ${ev.envDb.slice(i, i + 10).map((x) => x.toFixed(0).padStart(4)).join('')}`);
console.log('envelope (RMS dBFS per 0.5 s, 10 per row):\n' + rows.join('\n'));
if (ev.zoom) { console.log('zoom from', ev.zoom.from, 'step', ev.zoom.step); const z = ev.zoom.rows; for (let i = 0; i < z.length; i += 20) console.log((ev.zoom.from + i * ev.zoom.step).toFixed(2).padStart(7), z.slice(i, i + 20).map((x) => x.toFixed(0).padStart(4)).join('')); console.log('strong onsets', JSON.stringify(ev.zoom.peaks.filter((p) => p[1] >= 0.17))); }
console.log('saved', fs.existsSync(out) ? out : '(not saved)');
