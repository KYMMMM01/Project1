// Print one count/causes result: per scene the totals, then the costliest groups with what changes inside them.
//   node tools/perf/report.mjs .shots/perf/<name>_<mode>.json [--groups=10] [--detail]
import fs from 'node:fs';

const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const n = Number((process.argv.find((a) => a.startsWith('--groups=')) ?? '=10').split('=')[1]);
const detail = process.argv.includes('--detail');
for (const [k, s] of Object.entries(r.scenes)) {
  const g = s.groups;
  console.log(`=== ${k}  render med ${s.render.med} ms  tick med ${s.tick.med} ms${g ? `  | builds/f ${g.total.buildsPerFrame.toFixed(2)}  build ms/f ${g.total.buildMsPerFrame.toFixed(3)}  upload KB/f ${g.total.uploadKBPerFrame.toFixed(1)}  draws/f ${g.total.drawsPerFrame}  GL uploads/f ${g.total.glUploadsPerFrame ?? '?'} (${g.total.glUploadKBPerFrame ?? '?'} KB)  groups ${g.total.groups}` : ''}`);
  if (!g) continue;
  for (const x of g.groups.slice(0, n)) {
    if (!x.buildsPerFrame && !x.uploadKBPerFrame) continue;
    console.log(`  ${x.buildsPerFrame.toFixed(2)} b/f ${String(x.avgRenderables).padStart(4)} rend ${x.buildMsPerFrame.toFixed(3)} ms ${x.uploadKBPerFrame.toFixed(1).padStart(5)} KB [s${x.structural} v${x.byView}] ${x.path.slice(-90)}`);
    if (!detail) continue;
    for (const w of x.why ?? []) console.log(`      why   ${w[1]}  ${w[0].slice(0, 160)}`);
    for (const w of x.viewers ?? []) console.log(`      view  ${w[1]}  ${w[0].slice(-150)}`);
    for (const w of x.movers ?? []) console.log(`      move  ${w[1]}  ${w[0].slice(-150)}`);
  }
}
