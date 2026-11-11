// Before / after table from alternating time runs: per scene, the median over runs of each run's median and p95 (ms per frame).
//   node tools/perf/compare.mjs <before prefix> <after prefix> [runs=3]      e.g. before_t after_t 3  (reads .shots/perf/<prefix><i>_time.json)
import fs from 'node:fs';
import path from 'node:path';

const [a, b, n = '3'] = process.argv.slice(2);
const OUT = path.resolve(process.env.PERF_OUT ?? '.shots/perf');
const load = (p) => Array.from({ length: Number(n) }, (_, i) => path.join(OUT, `${p}${i + 1}_time.json`)).filter(fs.existsSync).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const A = load(a);
const B = load(b);
const mid = (xs) => { const s = [...xs].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pick = (runs, scene, k, q) => mid(runs.map((r) => r.scenes[scene]?.[k]?.[q]).filter((x) => x !== undefined));
const fmt = (x) => (x === undefined ? '-' : x.toFixed(2));
console.log(`runs: before ${A.length}, after ${B.length}`);
console.log('scene    | render med (before -> after) | render p95            | frame total med       | frame total p95');
for (const scene of Object.keys(A[0]?.scenes ?? {})) {
  const row = [['render', 'med'], ['render', 'p95'], ['total', 'med'], ['total', 'p95']].map(([k, q]) => {
    const x = pick(A, scene, k, q);
    const y = pick(B, scene, k, q);
    return `${fmt(x).padStart(7)} -> ${fmt(y).padStart(7)} (${x ? (((y - x) / x) * 100).toFixed(0).padStart(4) : '?'}%)`;
  });
  console.log(`${scene.padEnd(8)} | ${row.join(' | ')}`);
}
