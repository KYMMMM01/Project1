// node tools/sfx/audit/skill_table.mjs -> what each skill's scene plays when cast alone at 1x (files skills_now_<skill>.json of run_skills.mjs in AUDIT_OUT), and what the director's rules let through
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const AOUT = process.env.AUDIT_OUT ?? path.join(os.tmpdir(), 'meow-sound-audit');
const dir = process.argv[2] ? path.resolve(process.argv[2]) : AOUT;
const order = ['shove', 'cut', 'charge', 'clones', 'wanted', 'lap', 'cloud', 'knock', 'meteor', 'jam', 'fish', 'capsule'];
let blocked = 0, asked = 0;
for (const k of order) {
  const o = JSON.parse(fs.readFileSync(path.join(dir, `skills_now_${k}.json`), 'utf8'))[k];
  const mine = (r) => /dir\/sp\//.test(r[5]) || /intro/.test(r[5]);
  const plays = o.log.filter(mine);
  const req = o.req.filter((r) => /dir\/sp\//.test(r[4]));
  const bad = req.filter((r) => r[2] === 0);
  asked += req.length; blocked += bad.length;
  console.log(`\n${k}: ${plays.length} sounds from the scene, ${req.length} asks of the stage's rules, ${bad.length} refused`);
  console.log('  ' + plays.map((r) => `${(r[0] + (r[8] || 0)).toFixed(2)} ${r[1].replace('sp_', '')}${r[4] >= 0 ? '#' + r[4] : ''} v${r[2]}${r[3] !== 1 ? ' p' + r[3] : ''}${r[7] ? ' pan' + r[7] : ''}${r[8] ? ' +' + r[8] : ''}`).join('\n  '));
  if (bad.length) console.log('  REFUSED: ' + bad.map((r) => `${r[0]} ${r[1]} (${r[3]})`).join(', '));
}
console.log(`\ntotal asks of the stage's rules ${asked}, refused ${blocked}`);
