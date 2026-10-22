// Side by side across builds.  node compare.mjs head f00 s1 c77
import fs from 'node:fs';
import path from 'node:path';
import { HERE, mb } from './lib.mjs';

const names = process.argv.slice(2);
const runs = Object.fromEntries(names.map((n) => [n, JSON.parse(fs.readFileSync(path.join(HERE, 'out', `scen_${n}.json`), 'utf8'))]));
const find = (r, label) => r.snaps.find((s) => s.label === label) ?? r.snaps.filter((s) => s.label.startsWith(label)).pop();
const labels = ['A_home', 'B2_after_bake', 'C_battle1_start', 'D_battle1_30s', 'D_battle1_60s', 'D_battle1_120s', 'D_battle1_180s', 'E_home_again', 'F_battle2_start', 'G_battle2'];
// the drawing buffer of the stage canvas (colour + 4x MSAA colour + 4x depth/stencil), as the page asked for it
const drawing = (s) => { const d = s.page.stage?.drawingBuffer; return d ? (d[0] * d[1] * 4 * (1 + 4 + 4)) : 0; };
const fields = {
  'JS heap after GC': (s) => mb(s.post.jsUsed),
  'JS heap before GC': (s) => mb(s.pre.jsUsed),
  'AudioBuffers (bank+)': (s) => mb(s.heap.audioBuffers?.bytes ?? 0),
  'ArrayBuffers': (s) => mb(s.heap.arraybuffers?.bytes ?? 0),
  'art ImageBitmaps (CPU)': (s) => mb(s.heap.bitmaps?.bytes ?? 0),
  '2D canvases (live)': (s) => mb((s.heap.canvases?.bytes ?? 0) + (s.heap.offscreen?.bytes ?? 0)),
  'GL textures': (s) => mb(s.page.gl.texBytes),
  'GL MSAA renderbuffers': (s) => mb(s.page.gl.rbBytes),
  'GL buffers': (s) => mb(s.page.gl.bufBytes),
  'GL textures peak so far': (s) => mb(s.page.gl.texPeak),
  'MSAA rb peak so far': (s) => mb(s.page.gl.rbPeak),
  'stage drawing buffer (est)': (s) => mb(drawing(s)),
  'SUM of the above (est)': (s) => mb(s.post.jsUsed + (s.heap.audioBuffers?.bytes ?? 0) + (s.heap.arraybuffers?.bytes ?? 0) + (s.heap.bitmaps?.bytes ?? 0) + (s.heap.canvases?.bytes ?? 0) + (s.heap.offscreen?.bytes ?? 0) + s.page.gl.texBytes + s.page.gl.rbBytes + s.page.gl.bufBytes + drawing(s)),
  'Pixi sources alive (n)': (s) => s.heap.sources?.alive ?? 0,
  'Pixi sources uploaded (n)': (s) => s.heap.sources?.up ?? 0,
  'GL textures live (n)': (s) => s.page.gl.textures,
  'GL renderbuffers live (n)': (s) => s.page.gl.rbAll,
  'display objects in tree': (s) => s.page.tree?.total ?? 0,
  'display objects alive (heap)': (s) => s.heap.display?.alive ?? 0,
  'destroyed but still reachable': (s) => s.heap.display?.destroyed ?? 0,
  'Chromium renderer private': (s) => mb(s.proc?.by?.renderer?.priv ?? 0, 0),
  'Chromium GPU private': (s) => mb(s.proc?.by?.['gpu-process']?.priv ?? 0, 0),
};
for (const lab of labels) {
  console.log(`\n--- ${lab} ---`);
  console.log('field'.padEnd(32) + names.map((n) => n.padStart(10)).join(''));
  for (const [f, fn] of Object.entries(fields)) {
    console.log(f.padEnd(32) + names.map((n) => { const s = find(runs[n], lab); return String(s ? fn(s) : '-').padStart(10); }).join(''));
  }
}
