// node mixall.mjs [run ...] : for every run (default: the five of 2026-10-18), (a) the limiter replay of the whole run (no render), (b) the render of the busiest 1 s (5 s window) and of a median second
// (a run name is a file of AUDIT_OUT written by run_battle.mjs; the skills' runs of 2026-10-19 are n_ch1 n_ch3 n_ch5 n_hard5 n_hard2). The result is mixall<suffix>.json, suffix = the first name's prefix "n_" when the runs are those.
import fs from 'node:fs';
import { open, save, SC, PAGE } from './h.mjs';
const names = process.argv.length > 2 ? process.argv.slice(2) : ['ch1', 'ch3', 'ch5', 'hard5', 'hard2'];
const code = fs.readFileSync(`${PAGE}/mix_page.js`, 'utf8');
const b = await open('?debug=1&demo=audio');
// the page's own loop draws a frame every 16 ms in software (a headless browser has no GPU) and takes the cores the offline renders need: a replay of one run took 60 s without it and 2 to 10 minutes (and a watchdog) with it
await b.eval('void (window.__dbg.game && window.__dbg.game.app && window.__dbg.game.app.ticker.stop())').catch(() => undefined);
const all = {};
try {
  for (const name of names) {
    const o = JSON.parse(fs.readFileSync(`${SC}/${name}.json`, 'utf8'));
    // a log row is [t, id, volume, pitch, step, call site, caller, pan, delay]; the mixer wants [t, id, volume, pitch, step, pan, delay]
    const log = o.log.map((r) => [r[0], r[1], r[2], r[3], r[4], r[7] ?? 0, r[8] ?? 0]); const times = log.map((r) => r[0]);
    const per = new Array(Math.floor(o.T) + 1).fill(0); for (const t of times) per[Math.floor(t)]++;
    const cnt = (a, c) => { let n = 0; for (const t of times) if (t >= a && t < c) n++; return n; };
    let best = { n: 0, t: 0 };
    for (let t = 3; t < o.T - 3; t += 0.1) { const n = cnt(t, t + 1); if (n > best.n) best = { n, t }; }
    const sorted = per.map((n, i) => [n, i]).filter(([, i]) => i > 5 && i < per.length - 6).sort((a, c) => a[0] - c[0]);
    const med = sorted[Math.floor(sorted.length / 2)][1];
    const whole = await b.eval(`(${code})(${JSON.stringify({ events: log, t0: 0, t1: o.T, render: false })})`);
    const busy = await b.eval(`(${code})(${JSON.stringify({ events: log, t0: Math.max(0, best.t - 2), t1: Math.max(0, best.t - 2) + 5, measureFrom: best.t - Math.max(0, best.t - 2), measureTo: best.t - Math.max(0, best.t - 2) + 1 })})`);
    const median = await b.eval(`(${code})(${JSON.stringify({ events: log, t0: med - 2, t1: med + 3, measureFrom: 2, measureTo: 3 })})`);
    all[name] = { T: o.T, busiestAt: best.t, busiestN: best.n, medianAt: med, whole: { requested: whole.requested, accepted: whole.accepted, dropped: whole.droppedReasons, concurrency: whole.concurrency, reqById: whole.reqById, okById: whole.okById }, busy, median };
    const f = (x) => `${x.fullNoLimiter.lufs}/${x.fullNoLimiter.m100}`;
    console.log(name, 'whole run: requested', whole.requested, 'accepted', whole.accepted, JSON.stringify(whole.droppedReasons), 'voices', JSON.stringify(whole.concurrency));
    console.log('   busiest 1 s @', best.t.toFixed(1), 'n', best.n, 'sfx LUFS', busy.sfxOnly.lufs, 'm100', busy.sfxOnly.m100, 'peak', busy.sfxOnly.peakDb, '| music', busy.musicOnly.lufs, '| full+lim', busy.full.lufs, 'peak', busy.full.peakDb, 'clip', busy.fullNoLimiter.clipped, 'lim max red', busy.limiter.maxReductionDb, 'pump', busy.limiter.pumpDb, 'voices', JSON.stringify(busy.concurrency));
    console.log('   median second @', med, 'n', per[med], 'sfx LUFS', median.sfxOnly.lufs, 'music', median.musicOnly.lufs, 'peak', median.full.peakDb);
    console.log('   share (busiest):', JSON.stringify(busy.share));
  }
  save(names[0].startsWith('n_') ? 'mixall_n.json' : 'mixall.json', all);
} finally { b.close(); }
