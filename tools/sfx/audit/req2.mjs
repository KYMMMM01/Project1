import { SC } from './h.mjs'; process.chdir(SC); // the node-only table scripts read the json files the measuring scripts wrote
import fs from 'node:fs';
const names = ['ch1', 'ch3', 'ch5', 'hard5', 'hard2'];
const agg = {}; const rules = {}; const byId = {};
let T = 0;
for (const n of names) {
  const o = JSON.parse(fs.readFileSync(`${n}.json`, 'utf8')); T += o.T;
  for (const [t, id, ok, rule, site] of o.req) {
    // key: skill scene + sound (line numbers dropped: the tree is being edited by others)
    const sc = /dir\/sp\/([a-zA-Z]+)\.ts/.exec(site);
    const k = (sc ? 'SP:' + sc[1] : site.replace(/:\d+$/, '')) + ' ' + id + ' [' + rule + ']';
    (agg[k] ||= { req: 0, ok: 0 }); agg[k].req++; agg[k].ok += ok;
    const r = (rules[rule] ||= { req: 0, ok: 0 }); r.req++; r.ok += ok;
    const q = (byId[id] ||= { req: 0, ok: 0 }); q.req++; q.ok += ok;
  }
}
console.log('5 runs,', T.toFixed(0), 's of 3x play');
console.log('by rule:', Object.entries(rules).map(([k, v]) => `${k} ${v.ok}/${v.req} (${(v.ok / v.req * 100).toFixed(0)}%)`).join('; '));
console.log('--- skill scenes (requests per second of play, played share):');
for (const [k, v] of Object.entries(agg).filter(([k]) => /^SP:/.test(k)).sort()) console.log(k.padEnd(52), `${v.ok}/${v.req}`.padStart(9), `${(v.ok / v.req * 100).toFixed(0)}%`.padStart(5));
console.log('--- fight sounds by id (played share):');
for (const id of ['imp_w_tiger', 'imp_r_star', 'hit_heavy', 'crit', 'zap', 'whoosh', 'molt', 'explosion', 'shield_break', 'atk_w_samurai', 'imp_w_samurai']) { const v = byId[id]; if (v) console.log(id.padEnd(16), `${v.ok}/${v.req}`, (v.ok / v.req * 100).toFixed(0) + '%'); }
const grp = (id) => /^atk_/.test(id) ? 'release (atk_)' : /^imp_/.test(id) ? 'impact (imp_)' : /^foe_.*_hit/.test(id) ? 'foe hit' : /^foe_.*_die/.test(id) ? 'foe die' : /^(hit_heavy|crit)$/.test(id) ? 'hit layer' : null;
const g = {};
for (const [id, v] of Object.entries(byId)) { const k = grp(id); if (!k) continue; (g[k] ||= { req: 0, ok: 0 }); g[k].req += v.req; g[k].ok += v.ok; }
console.log('--- groups:', Object.entries(g).map(([k, v]) => `${k} ${v.ok}/${v.req} (${(v.ok / v.req * 100).toFixed(0)}%)`).join('; '));
