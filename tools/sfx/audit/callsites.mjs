// node tools/sfx/audit/callsites.mjs <absolute output .json>   (the repo root is found from this file)
// Static call sites of every SFX id and stinger (outside src/audio, src/demo, src/soundboard): file:line and the line itself.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'));
const norm = (p) => p.split(path.sep).join('/');
const api = fs.readFileSync('src/audio/api.ts', 'utf8');
const ids = [...api.matchAll(/^\s+'([a-z_0-9]+)',/gm)].map((m) => m[1]);
const stingers = ['victory', 'defeat', 'boss_intro', 'mythic', 'level_up', 'jackpot'];
const files = [];
(function walk(d) {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) {
      if (/src\/(audio|demo|soundboard)$/.test(norm(p))) continue;
      walk(p);
    } else if (p.endsWith('.ts')) files.push(p);
  }
})('src');
const lines = files.map((f) => [norm(f).replace('src/', ''), fs.readFileSync(f, 'utf8').split('\n')]);
const out = {};
for (const id of ids) {
  const hits = [];
  for (const [f, ls] of lines) ls.forEach((l, i) => { if (l.includes(`'${id}'`) && !/^\s*(\/\/|\*)/.test(l)) hits.push(`${f}:${i + 1}  ${l.trim().slice(0, 150)}`); });
  out[id] = hits;
}
// stingers: audio.stinger('x')
out.__stingers = {};
for (const id of stingers) {
  const hits = [];
  for (const [f, ls] of lines) ls.forEach((l, i) => { if (/stinger\(/.test(l) && l.includes(`'${id}'`)) hits.push(`${f}:${i + 1}  ${l.trim().slice(0, 150)}`); });
  out.__stingers[id] = hits;
}
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
const none = ids.filter((i) => !/^(atk_|imp_|foe_)/.test(i) && out[i].length === 0);
console.log('ids without a literal call site (outside atk/imp/foe):', none.join(' '));
