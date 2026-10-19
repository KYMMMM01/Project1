import { SC } from './h.mjs'; process.chdir(SC); // the node-only table scripts read the json files the measuring scripts wrote
import fs from 'node:fs';
let M = JSON.parse(fs.readFileSync('measure.json', 'utf8')); if (typeof M === 'string') M = JSON.parse(M);
const by = Object.fromEntries(M.map((x) => [x.key.replace(/^sfx:/, ''), x]));
const dbv = (v) => 20 * Math.log10(v);
// [label, id, volume, pitch note]
const cues = [
  ['ordinary impact (any cat)', 'imp_r_star', 0.8], ['ordinary impact', 'imp_w_sword', 0.8], ['ordinary impact', 'imp_w_paw', 0.8], ['ordinary impact', 'imp_m_frost', 0.8],
  ['ordinary release', 'atk_r_star', 0.75], ['ordinary release', 'atk_w_paw', 0.75],
  ['foe hit (cucumber)', 'foe_juicy_hit', 0.65], ['foe die (cucumber)', 'foe_juicy_die', 0.8], ['hit weight layer', 'hit_heavy', 0.5], ['crit layer', 'crit', 0.65],
  ['coin', 'coin', 1], ['UI click', 'ui_click', 1], ['summon_common', 'summon_common', 1], ['merge', 'merge', 0.75], ['merge_big', 'merge_big', 0.85], ['awaken', 'awaken', 0.9], ['boss_roar', 'boss_roar', 0.85],
  ['SKILL shove: shield slam', 'hit_heavy', 0.8], ['SKILL shove: whoosh', 'whoosh', 0.35],
  ['SKILL samurai: cast', 'atk_w_samurai', 0.7], ['SKILL samurai: lines open', 'imp_w_samurai', 0.75],
  ['SKILL tiger: cast', 'atk_w_tiger', 0.7], ['SKILL tiger: landing', 'imp_w_tiger', 0.9], ['SKILL tiger: stomp', 'imp_w_tiger', 0.5],
  ['SKILL ninja: puff', 'molt', 0.4], ['SKILL ninja: clone throw', 'atk_r_ninja', 0.3], ['SKILL ninja: vanish', 'whoosh', 0.22],
  ['SKILL gunner: poster', 'whoosh', 0.4], ['SKILL gunner: cork', 'atk_r_gunner', 0.8], ['SKILL gunner: hole', 'imp_r_gunner', 0.9],
  ['SKILL star: cast', 'atk_r_star', 0.8], ['SKILL star: each star', 'imp_r_star', 0.45],
  ['SKILL storm: cloud out', 'shoot_magic', 0.42], ['SKILL storm: bolt', 'zap', 0.36],
  ['SKILL frost: tap', 'place', 0.45], ['SKILL frost: glass break', 'shield_break', 0.7], ['SKILL frost: shard', 'imp_m_frost', 0.42],
  ['SKILL meteor: whistle', 'whoosh', 0.34], ['SKILL meteor: cast', 'atk_m_cosmo', 0.7], ['SKILL meteor: boom', 'explosion', 0.85], ['SKILL meteor: ring', 'imp_m_cosmo', 0.55],
  ['SKILL bard: strum', 'atk_t_bard', 0.9], ['SKILL bard: note', 'imp_t_bard', 0.5],
  ['SKILL alchemist: flask', 'atk_t_alch', 0.7], ['SKILL alchemist: big pop', 'foe_glass_hit', 0.7], ['SKILL alchemist: fish', 'molt', 0.7],
  ['SKILL capsule: fall', 'whoosh', 0.3], ['SKILL capsule: landing', 'place', 0.42], ['SKILL capsule: opens (fish)', 'chest_open', 0.5], ['SKILL capsule: opens (toy)', 'level_up', 0.6],
];
console.log('| cue | id | 연출 볼륨 | 소리 기준 L100 (LUFS) | 재생 시 L100 | 재생 시 피크 dBFS |\n|---|---|--:|--:|--:|--:|');
for (const [label, id, v] of cues) { const x = by[id]; console.log(`| ${label} | ${id} | ${v} | ${x.l100Mean.toFixed(1)} | ${(x.l100Mean + dbv(v)).toFixed(1)} | ${(x.peakDb + dbv(v)).toFixed(1)} |`); }
