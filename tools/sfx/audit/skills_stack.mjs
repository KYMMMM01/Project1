// What the twelve skills sound like when they pile up: (a) all twelve cast in the same instant, alone; (b) four of them 0.25 s apart (the stage rule's gap) on top of
// the busiest second of a chapter run. Uses the sounds as they are today (the files run_skills.mjs wrote). With a run of 2026-10-19 (node skills_stack.mjs n_ch5) the base is
// that run's busiest second WITHOUT the skill scenes' own sounds (what an ordinary fight sounds like), so "four skills on top" is what the four add; the result is skills_stack_n.json.
import fs from 'node:fs';
import { open, save, SC, PAGE } from './h.mjs';
const order = ['shove', 'cut', 'charge', 'clones', 'wanted', 'lap', 'cloud', 'knock', 'meteor', 'jam', 'fish', 'capsule'];
const code = fs.readFileSync(`${PAGE}/mix_page.js`, 'utf8');
const run = process.argv[2] || 'ch5';
const seq = {};
for (const k of order) {
  const o = JSON.parse(fs.readFileSync(`${SC}/skills_now_${k}.json`, 'utf8'))[k];
  seq[k] = o.log.filter((r) => /dir\/sp\//.test(r[5]) || /intro/.test(r[5])).map((r) => [r[0] + 0.02, r[1], r[2], r[3], r[4], r[7] ?? 0, r[8] ?? 0]).filter((r) => r[0] >= 0);
}
const b = await open('?debug=1&demo=audio');
const out = {};
try {
  // (a) all twelve at once
  const all = order.flatMap((k) => seq[k]);
  out.allTwelve = await b.eval(`(${code})(${JSON.stringify({ events: all, t0: 0, t1: 4, measureFrom: 0, measureTo: 3 })})`);
  // (b) four loud ones 0.25 s apart on the busiest second of a run
  const o = JSON.parse(fs.readFileSync(`${SC}/${run}.json`, 'utf8'));
  const times = o.log.map((r) => r[0]);
  let best = { n: 0, t: 0 };
  for (let t = 3; t < o.T - 3; t += 0.1) { let n = 0; for (const x of times) if (x >= t && x < t + 1) n++; if (n > best.n) best = { n, t }; }
  const own = (r) => /dir[/]sp[/]/.test(r[5]) || /intro/.test(r[5]);
  const base = o.log.filter((r) => r[0] >= best.t - 2 && r[0] < best.t + 3 && !(run.startsWith('n_') && own(r))).map((r) => [r[0] - (best.t - 2), r[1], r[2], r[3], r[4], r[7] ?? 0, r[8] ?? 0]);
  const four = ['charge', 'meteor', 'knock', 'cut'];
  const over = four.flatMap((k, i) => seq[k].map((r) => [r[0] + 2 + i * 0.25, r[1], r[2], r[3], r[4], r[5] ?? 0, r[6] ?? 0]));
  out.fourOnBusiest = await b.eval(`(${code})(${JSON.stringify({ events: [...base, ...over], t0: 0, t1: 5, measureFrom: 2, measureTo: 3 })})`);
  out.busiestOnly = await b.eval(`(${code})(${JSON.stringify({ events: base, t0: 0, t1: 5, measureFrom: 2, measureTo: 3 })})`);
  save(run.startsWith('n_') ? 'skills_stack_n.json' : 'skills_stack.json', out);
  for (const k of Object.keys(out)) { const r = out[k]; console.log(k, 'req', r.requested, 'acc', r.accepted, 'sfx dry peak', r.sfxOnly.peakDb, 'LUFS', r.sfxOnly.lufs, 'm100', r.sfxOnly.m100, '| full+lim peak', r.full.peakDb, 'clip(no-lim)', r.fullNoLimiter.clipped, 'peak(no-lim)', r.fullNoLimiter.peakDb, 'lim red', r.limiter.maxReductionDb, 'pump', r.limiter.pumpDb, 'voices', JSON.stringify(r.concurrency)); console.log('   share', JSON.stringify(r.share)); }
} finally { b.close(); }
