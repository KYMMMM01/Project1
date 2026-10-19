// node tools/sfx/audit/skill_levels.mjs [prefix=all] -> reads <prefix>1..6.json (the rows sheet.mjs writes into AUDIT_OUT/sheets, 8 sounds each, all variants) and prints each skill sound's play-time L100 (K-weighted, 100 ms)
// against its target, and the trim that would hit it; writes <prefix>_trims.json. The play volumes are the scenes' own (src/view/director/sp/*.ts); the targets are the plan's levels (§9.3 of the audit).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const here = path.join(process.env.AUDIT_OUT ?? path.join(os.tmpdir(), 'meow-sound-audit'), 'sheets');
const prefix = process.argv[2] || 'all';
// [play volume in the scene, target play-time L100 (K-weighted, 100 ms window) in LUFS-like dB]
const T = {
  sp_cutin: [0.9, -18],
  sp_shield_slam: [1, -16.5], sp_dust_wedge: [0.8, -25],
  sp_dash: [0.9, -19], sp_sheath: [0.9, -19], sp_cut_clash: [1, -16.5],
  sp_tiger_roar: [1, -16.5], sp_tiger_land: [0.9, -18], sp_stomp: [0.85, -23], sp_tiger_roar_end: [0.9, -20],
  sp_smoke_pop: [1, -16.5], sp_clone_hop: [0.7, -25], sp_clone_throw: [0.8, -24], sp_clone_vanish: [0.9, -23],
  sp_poster_slap: [1, -17], sp_cork_pop: [0.9, -18.5], sp_poster_hole: [1, -16.5], sp_seal_stamp: [0.9, -19],
  sp_night_hush: [0.9, -23], sp_arrow_whoosh: [0.85, -19.5], sp_star_ping: [0.8, -23],
  sp_cloud_pop: [0.95, -18], sp_thunder_tick: [0.9, -22], sp_cloud_hop: [0.8, -24], sp_cloud_sigh: [0.9, -21],
  sp_glass_tap: [0.9, -19], sp_glass_shatter: [1, -16.5], sp_shard_hit: [1, -23],
  sp_meteor_warn: [0.85, -26], sp_meteor_whistle: [0.8, -19], sp_meteor_boom: [1, -15.5], sp_meteor_ring: [0.8, -19],
  sp_strum: [0.95, -17.5], sp_note: [0.8, -23],
  sp_flask_toss: [0.9, -20], sp_flask_pop: [1, -16.5], sp_fish_boing: [0.9, -19], sp_flask_mini: [0.9, -23], sp_fish_back: [0.9, -21],
  sp_capsule_fall: [0.85, -24], sp_capsule_bounce: [0.9, -24], sp_capsule_rattle: [0.8, -22], sp_capsule_pop: [0.9, -18],
  sp_prize_fish: [0.9, -20], sp_prize_partner: [0.9, -18], sp_prize_more: [0.9, -20], sp_prize_toy: [1, -16.5], sp_prize_guardian: [1.05, -16.5],
};
const rows = [];
for (let i = 1; i <= 6; i++) { const f = path.join(here, `${prefix}${i}.json`); if (fs.existsSync(f)) rows.push(...JSON.parse(fs.readFileSync(f, 'utf8'))); }
const by = new Map();
for (const r of rows) { const id = r.label.replace(/ v\d+$/, ''); if (!by.has(id)) by.set(id, []); by.get(id).push(r); }
const pad = (v, n) => String(v).padEnd(n);
console.log(pad('id', 20), pad('cat', 10), pad('trim', 6), pad('L100', 7), pad('vol', 5), pad('play', 7), pad('target', 7), pad('delta', 6), pad('newTrim', 8), 'peak(after)  phone%  ms');
let fixed = [];
for (const [id, list] of by) {
  const l100 = list.reduce((a, r) => a + r.l100, 0) / list.length;
  const peak = Math.max(...list.map((r) => r.peakDb));
  const trim = list[0].trim;
  const [vol, target] = T[id] ?? [1, -20];
  const play = l100 + 20 * Math.log10(vol);
  let delta = target - play;
  // the baker never passes a peak of 0.95 (-0.45 dB)
  const room = -1.0 - peak;
  const capped = delta > room;
  if (capped) delta = room;
  const newTrim = Math.round((trim + delta) * 2) / 2;
  const phone = Math.round(list.reduce((a, r) => a + r.phone, 0) / list.length);
  console.log(pad(id, 20), pad(list[0].cat, 10), pad(trim, 6), pad(l100.toFixed(1), 7), pad(vol, 5), pad(play.toFixed(1), 7), pad(target, 7), pad(delta.toFixed(1), 6), pad(newTrim + (capped ? '*' : ''), 8), pad((peak + delta).toFixed(1), 12), pad(phone, 7), Math.round(Math.max(...list.map((r) => r.ms))));
  fixed.push([id, newTrim]);
}
fs.writeFileSync(path.join(here, `${prefix}_trims.json`), JSON.stringify(Object.fromEntries(fixed)));
