// what each skill sounds like NOW: its own sounds (sp/ call sites and the cut-in) of the solo cast, replayed through the real limiter, no music
import fs from 'node:fs';
import { open, save, SC, PAGE } from './h.mjs';
const order = ['shove', 'cut', 'charge', 'clones', 'wanted', 'lap', 'cloud', 'knock', 'meteor', 'jam', 'fish', 'capsule'];
const code = fs.readFileSync(`${PAGE}/mix_page.js`, 'utf8');
const b = await open('?debug=1&demo=audio');
const res = {};
try {
  for (const k of order) {
    const o = JSON.parse(fs.readFileSync(`${SC}/skills_now_${k}.json`, 'utf8'))[k];
    const ev = o.log.filter((r) => /dir\/sp\//.test(r[5]) || /intro/.test(r[5])).map((r) => [r[0] + 1, r[1], r[2], r[3], r[4], r[7] ?? 0, r[8] ?? 0]).filter((r) => r[0] >= 0);
    const t1 = Math.max(...ev.map((e) => e[0])) + 3;
    const r = await b.eval(`(${code})(${JSON.stringify({ events: ev, t0: 0, t1, musicUser: 0.5, measureFrom: 0, measureTo: t1 - 1 })})`);
    res[k] = { n: ev.length, spanSec: r.spanSec, sfxOnly: r.sfxOnly, events: r.events };
    console.log(k.padEnd(8), 'sounds', ev.length, 'span', r.spanSec, 's', 'peak', r.sfxOnly.peakDb, 'LUFS', r.sfxOnly.lufs, 'm100', r.sfxOnly.m100, 'bands', JSON.stringify(r.sfxOnly.band));
  }
  save('skill_render.json', res);
} finally { b.close(); }
