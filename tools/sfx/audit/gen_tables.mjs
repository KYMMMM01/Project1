import { SC } from './h.mjs'; process.chdir(SC); // the node-only table scripts read the json files the measuring scripts wrote
import fs from 'node:fs';
const J = (f) => { let r = JSON.parse(fs.readFileSync(f, 'utf8')); if (typeof r === 'string') r = JSON.parse(r); return r; };
const M = J('measure.json');
const runs = ['ch1', 'ch3', 'ch5', 'hard5', 'hard2'].map((n) => ({ n, ...J(`${n}.json`) }));
const C = fs.existsSync('callsites.json') ? J('callsites.json') : {};
// which recipe file defines each id (read from the sources: this script lives in tools/sfx/audit)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RECIPE_FILES = { ui: 'sfx-ui', combat: 'sfx-combat', battle: 'sfx-battle', cats: 'sfx-cats', foes: 'sfx-foes', stinger: 'stingers' };
const fileOf = {};
for (const [k, f] of Object.entries(RECIPE_FILES)) { const t = fs.readFileSync(path.join(root, 'src', 'audio', f + '.ts'), 'utf8'); for (const m of t.matchAll(/^  ([a-z_0-9]+): (?:\{|swing\(|impact\(|foe\(|boss\()/gm)) { fileOf['sfx:' + m[1]] = f; if (k === 'stinger') fileOf['stinger:' + m[1]] = f; } }
// per-id rates
const rate = {};
for (const r of runs) {
  const per = {};
  for (const e of r.log) (per[e[1]] ||= []).push(e[0]);
  for (const [id, ts] of Object.entries(per)) {
    let mx = 0, j = 0;
    for (let i = 0; i < ts.length; i++) { while (ts[i] - ts[j] >= 1) j++; mx = Math.max(mx, i - j + 1); }
    const x = (rate[id] ||= { n: 0, T: 0, max: 0 });
    x.n += ts.length; x.max = Math.max(x.max, mx);
  }
  for (const id of Object.keys(rate)) rate[id].T += r.T;
}
const T = runs.reduce((a, r) => a + r.T, 0);
const f1 = (x) => (+x).toFixed(1);
const order = (k) => (/^sfx:ui_/.test(k) ? 0 : /^sfx:(coin|gem|star|reward|level_up|purchase|sell|upgrade|relic|chest|card|reel|jackpot|gamble)/.test(k) ? 1 : /^sfx:(summon|merge|place|pickup|molt|purr|awaken|call_wave|sunbeam)/.test(k) ? 2 : /^sfx:atk_/.test(k) ? 4 : /^sfx:imp_/.test(k) ? 5 : /^sfx:foe_/.test(k) ? 6 : /^stinger/.test(k) ? 8 : 3);
const rows = M.slice().sort((a, b) => order(a.key) - order(b.key));
let out = '| id | 레시피 파일 | 계열 | 변주 | ms | 피크 dBFS | 크기 LUFS | 100ms 최대 | 중심 Hz | <250 / 250~2.5k / >2.5k (%) | 어택 ms | 전투 평균 /s | 최대 /s |\n|---|---|---|--:|--:|--:|--:|--:|--:|---|--:|--:|--:|\n';
for (const x of rows) {
  const id = x.key.replace(/^sfx:/, '').replace(/^stinger:/, '스팅어 ');
  const b = x.band; const lo = (b[0] + b[1]) * 100, mi = (b[2] + b[3]) * 100, hi = (b[4] + b[5]) * 100;
  const r = rate[x.key.replace(/^sfx:/, '')];
  out += `| ${id} | ${fileOf[x.key] ?? '?'} | ${x.cat} | ${x.variants} | ${Math.round(x.msMean)} | ${f1(x.peakDb)} | ${f1(x.lufsSpanMean)} | ${f1(x.l100Mean)} | ${x.centroidMean} | ${Math.round(lo)} / ${Math.round(mi)} / ${Math.round(hi)} | ${f1(x.attack)} | ${r ? (r.n / r.T).toFixed(2) : '-'} | ${r ? r.max : '-'} |\n`;
}
fs.writeFileSync('appendix_A.md', out);
console.log(out.split('\n').length, 'rows; total play time', T.toFixed(0), 's');
