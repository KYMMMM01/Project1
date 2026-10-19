import { SC } from './h.mjs'; process.chdir(SC); // the node-only table scripts read the json files the measuring scripts wrote
import fs from 'node:fs';
const names = process.argv.slice(2);
const group = (id) => id.startsWith('imp_') ? 'impact' : id.startsWith('atk_') ? 'release' : id.startsWith('foe_') ? 'foe' : /^(hit_light|hit_heavy|crit)$/.test(id) ? 'hit-layer' : /^(coin|gem|star)$/.test(id) ? 'currency' : /^(summon|merge|upgrade|sell|molt|awaken|level_up|place|pickup|relic_pick|purr)/.test(id) ? 'growth' : /^ui_/.test(id) ? 'ui' : 'other';
for (const name of names) {
  const j = JSON.parse(JSON.parse(JSON.stringify(fs.readFileSync(`${name}.json`, 'utf8'))));
  const o = typeof j === 'string' ? JSON.parse(j) : j;
  const log = o.log;
  const T = o.T;
  console.log(`\n=== ${name}: ${log.length} audio calls in ${T.toFixed(1)} s of 3x play (${(log.length / T).toFixed(1)} per second on average), ${o.errors.length} errors`);
  // per id
  const cnt = {};
  for (const r of log) cnt[r[1]] = (cnt[r[1]] || 0) + 1;
  const byG = {};
  for (const [id, n] of Object.entries(cnt)) byG[group(id)] = (byG[group(id)] || 0) + n;
  console.log('by group', JSON.stringify(Object.fromEntries(Object.entries(byG).map(([k, v]) => [k, +(v / T).toFixed(2)]))), 'per s');
  // sliding 1 s windows (step 0.1 s)
  let best = { n: 0, t: 0 };
  const times = log.map((r) => r[0]);
  const win = (t0, t1) => { let lo = 0, hi = times.length; const lb = (x) => { let a = 0, b = times.length; while (a < b) { const m = (a + b) >> 1; if (times[m] < x) a = m + 1; else b = m; } return a; }; return [lb(t0), lb(t1)]; };
  for (let t = 0; t < T; t += 0.1) { const [a, b] = win(t, t + 1); if (b - a > best.n) best = { n: b - a, t, a, b }; }
  const inBest = {};
  for (let i = best.a; i < best.b; i++) inBest[log[i][1]] = (inBest[log[i][1]] || 0) + 1;
  console.log('busiest 1 s starts at', best.t.toFixed(1), 's with', best.n, 'calls:', JSON.stringify(inBest));
  // distribution of per-second counts
  const secs = Math.floor(T);
  const per = new Array(secs + 1).fill(0);
  for (const r of log) per[Math.floor(r[0])]++;
  const sorted = [...per].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  console.log('per-second calls: mean', (log.length / secs).toFixed(1), 'median', pct(0.5), 'p90', pct(0.9), 'p99', pct(0.99), 'max', sorted.at(-1));
  // per id, mean/s and the max in any 1 s window
  const rows = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([id, n]) => {
    const ts = log.filter((r) => r[1] === id).map((r) => r[0]);
    let mx = 0, j = 0;
    for (let i = 0; i < ts.length; i++) { while (ts[i] - ts[j] >= 1) j++; mx = Math.max(mx, i - j + 1); }
    return { id, n, perS: +(n / T).toFixed(2), max1s: mx };
  });
  console.log(rows.map((r) => `${r.id}:${r.n} (${r.perS}/s, max ${r.max1s}/s)`).join('  '));
  // by source
  const src = {};
  for (const r of log) { const k = r[6] === 'dir/stage.ts:160' || r[6] === 'dir/stage.ts:169' || r[6] === 'dir/stage.ts:175' ? r[6] : r[5]; }
  const sp = {};
  for (const r of log) { const w = `${r[5]} < ${r[6]}`; if (/dir\/sp\//.test(w)) { const f = (/dir\/sp\/([a-zA-Z]+)\.ts/.exec(w) || [])[1]; sp[f + ':' + r[1]] = (sp[f + ':' + r[1]] || 0) + 1; } }
  console.log('skill-scene calls (scene:id)', JSON.stringify(sp));
  console.log('calls (stinger/music/duck):', JSON.stringify(o.calls.reduce((a, c) => { const k = c[1] + (c[1] === 'duck' ? '' : ':' + c[2]); a[k] = (a[k] || 0) + 1; return a; }, {})));
}
