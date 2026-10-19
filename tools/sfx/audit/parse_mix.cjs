// AUDIT_OUT=<dir> node parse_mix.cjs : the busiest second of the five runs, before (b_: the state the pass started from) and after (a_), from the text the mixer printed
const fs = require('fs');
const path = require('path');
const SC = (process.env.AUDIT_OUT ?? path.join(require('os').tmpdir(), 'meow-sound-audit')).split(path.sep).join('/') + '/';
function parse(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let cur = null;
  for (const l of lines) {
    let m = /^(\S+) whole run: requested (\d+) accepted (\d+) (\{[^}]*\}) voices (\{[^}]*\})/.exec(l);
    if (m) { cur = { name: m[1], requested: +m[2], accepted: +m[3], voices: JSON.parse(m[5]) }; out[m[1]] = cur; continue; }
    if (!cur) continue;
    m = /busiest 1 s @ ([\d.]+) n (\d+) sfx LUFS (-?[\d.]+) m100 (-?[\d.]+) peak (-?[\d.]+) \| music (-?[\d.]+) \| full\+lim (-?[\d.]+) peak (-?[\d.]+) clip (\d+) lim max red (-?[\d.]+) pump (-?[\d.]+) voices (\{[^}]*\})/.exec(l);
    if (m) { Object.assign(cur, { at: +m[1], n: +m[2], sfx: +m[3], m100: +m[4], sfxPeak: +m[5], music: +m[6], full: +m[7], fullPeak: +m[8], clip: +m[9], red: +m[10], pump: +m[11], busyVoices: JSON.parse(m[12]) }); continue; }
    m = /median second @ (\d+) n (\d+) sfx LUFS (-?[\d.]+) music (-?[\d.]+) peak (-?[\d.]+)/.exec(l);
    if (m) { Object.assign(cur, { medSfx: +m[3], medMusic: +m[4] }); continue; }
    m = /share \(busiest\): (\{.*)$/.exec(l);
    if (m) { try { cur.share = JSON.parse(m[1]); } catch { cur.share = null; } }
  }
  return out;
}
const before = parse(SC + 'mixall_b.out');
const after = { ...parse(SC + 'mixall_final.out') };
for (const r of ['a_ch5', 'a_hard5', 'a_hard2']) Object.assign(after, parse(SC + `mf_${r}.out`));
const replay = {};
for (const r of ['b_ch1', 'b_ch3', 'b_ch5', 'b_hard5', 'b_hard2']) Object.assign(replay, parse(SC + `mr_${r}.out`));
const names = [['ch1', '챕터 1'], ['ch3', '챕터 3'], ['ch5', '챕터 5'], ['hard5', '어려운 5'], ['hard2', '어려운 2']];
const fmt = (x, k) => (x && x[k] !== undefined ? x[k] : '-');
const top = (x, n = 3) => (x && x.share ? Object.entries(x.share).slice(0, n).map(([k, v]) => `${k} ${v}`).join(', ') : '-');
const rows = [];
for (const [n, ko] of names) {
  const b = before['b_' + n], a = after['a_' + n], r = replay['b_' + n];
  rows.push({ ko, b, a, r });
}
const md = [];
md.push('| 판 | 가장 바쁜 1초 SFX LUFS 전 → 후 | 최대 피크(한계기 뒤) 전 → 후 | 음악(그 초) 전 → 후 | 한계기 최대 감소 dB 전 → 후 | 동시 소리 최대(그 초) 전 → 후 | 중간 초 SFX 전 → 후 | 그 초의 에너지 상위 3(후) |');
md.push('|---|---|---|---|---|---|---|---|');
for (const { ko, b, a } of rows) {
  md.push(`| ${ko} | ${fmt(b, 'sfx')} → **${fmt(a, 'sfx')}** | ${fmt(b, 'fullPeak')} → **${fmt(a, 'fullPeak')}** | ${fmt(b, 'music')} → **${fmt(a, 'music')}** | ${fmt(b, 'red')} → **${fmt(a, 'red')}** | ${b ? b.busyVoices.max : '-'} → **${a ? a.busyVoices.max : '-'}** | ${fmt(b, 'medSfx')} → **${fmt(a, 'medSfx')}** | ${top(a)} |`);
}
const avg = (xs) => (xs.length ? +(xs.reduce((s, v) => s + v, 0) / xs.length).toFixed(1) : '-');
const col = (which, k) => avg(rows.map((r) => r[which]).filter(Boolean).map((x) => x[k]).filter((v) => v !== undefined));
md.push(`| 평균 | ${col('b', 'sfx')} → **${col('a', 'sfx')}** | ${col('b', 'fullPeak')} → **${col('a', 'fullPeak')}** | ${col('b', 'music')} → **${col('a', 'music')}** | ${col('b', 'red')} → **${col('a', 'red')}** | ${col('b', 'busyVoices') === '-' ? '' : ''}${avg(rows.map((r) => r.b).filter(Boolean).map((x) => x.busyVoices.max))} → **${avg(rows.map((r) => r.a).filter(Boolean).map((x) => x.busyVoices.max))}** | ${col('b', 'medSfx')} → **${col('a', 'medSfx')}** | |`);
fs.writeFileSync(SC + 'busiest.md', md.join('\n'));
// the paired replay (the same calls through the old and the new engine)
const pm = [];
pm.push('| 판 | 가장 바쁜 1초 SFX LUFS 옛 엔진 → 새 엔진(같은 호출) | 피크(한계기 뒤) | 음악 | 중간 초 SFX |');
pm.push('|---|---|---|---|---|');
for (const { ko, b, r } of rows) if (r) pm.push(`| ${ko} | ${fmt(b, 'sfx')} → **${fmt(r, 'sfx')}** | ${fmt(b, 'fullPeak')} → **${fmt(r, 'fullPeak')}** | ${fmt(b, 'music')} → **${fmt(r, 'music')}** | ${fmt(b, 'medSfx')} → **${fmt(r, 'medSfx')}** |`);
fs.writeFileSync(SC + 'paired.md', pm.join('\n'));
console.log(md.join('\n'));
console.log('---');
console.log(pm.join('\n'));
console.log(JSON.stringify(Object.fromEntries(Object.entries(after).map(([k, v]) => [k, { requested: v.requested, accepted: v.accepted, vmax: v.voices && v.voices.max, share: v.share && Object.entries(v.share).slice(0, 4) }])), null, 0));
