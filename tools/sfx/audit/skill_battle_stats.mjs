// node tools/sfx/audit/skill_battle_stats.mjs n_ch5 [n_ch1 ...]  (runs written by run_battle.mjs into AUDIT_OUT) -> per skill sound: asks of the director's rules, let through, share
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const AOUT = process.env.AUDIT_OUT ?? path.join(os.tmpdir(), 'meow-sound-audit');
const names = process.argv.slice(2);
const agg = new Map();
let secs = 0, calls = 0;
for (const n of names) {
  const o = JSON.parse(fs.readFileSync(path.join(AOUT, `${n}.json`), 'utf8'));
  secs += o.T; calls += o.log.length;
  for (const r of o.req) {
    if (!r[1].startsWith('sp_')) continue;
    const e = agg.get(r[1]) ?? { asks: 0, ok: 0, rule: r[3] };
    e.asks++; if (r[2]) e.ok++;
    agg.set(r[1], e);
  }
}
const pad = (v, n) => String(v).padEnd(n);
console.log(`runs ${names.join(', ')}: ${secs.toFixed(0)} s of real time, ${calls} audio calls (${(calls / secs).toFixed(1)} /s)`);
console.log(pad('id', 22), pad('rule', 10), pad('asked', 6), pad('played', 7), 'refused%');
let A = 0, K = 0, sigA = 0, sigK = 0;
for (const [id, e] of [...agg].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(pad(id, 22), pad(e.rule, 10), pad(e.asks, 6), pad(e.ok, 7), ((1 - e.ok / e.asks) * 100).toFixed(0) + '%');
  A += e.asks; K += e.ok;
  if (e.rule === 'skill') { sigA += e.asks; sigK += e.ok; }
}
console.log(`all skill sounds: asked ${A}, played ${K} (${((1 - K / A) * 100).toFixed(1)}% refused); of them the signature rule: asked ${sigA}, played ${sigK}`);
