// node fixlines.mjs <report_full.json> [--apply] [--ratio 1.06]
// The report wants every class line to grow by rank in 200 ms loudness (loudRms), each rank at least 4 % above the one before. Fit the closest line that does (isotonic
// regression in the log domain, each step at least `ratio`) and shift the `db:` of the recipes in src/audio/sfx-cats.ts (atk_) and src/audio/sfx-impacts.ts (imp_) by the difference.
import fs from 'node:fs';
const rep = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const apply = process.argv.includes('--apply');
const ratio = process.argv.includes('--ratio') ? Number(process.argv[process.argv.indexOf('--ratio') + 1]) : 1.06;
const LINES = [['w_paw', 'w_sword', 'w_viking', 'w_samurai', 'w_tiger'], ['r_sling', 'r_archer', 'r_ninja', 'r_gunner', 'r_star'], ['m_snow', 'm_fire', 'm_storm', 'm_frost', 'm_cosmo'], ['t_bell', 't_chef', 't_bard', 't_alch', 't_lucky']];
const rows = new Map(rep.sfx.map((x) => [x.id, x]));
const files = { atk_: 'C:/MyProject/Project1/src/audio/sfx-cats.ts', imp_: 'C:/MyProject/Project1/src/audio/sfx-impacts.ts' };
const texts = {};
for (const [k, f] of Object.entries(files)) {
  const s = fs.readFileSync(f, 'utf8');
  texts[k] = { crlf: s.includes('\r\n'), s: s.replace(/\r\n/g, '\n') };
}
function pav(y) {
  const out = [];
  for (const v of y) {
    out.push({ sum: v, n: 1 });
    while (out.length > 1 && out[out.length - 2].sum / out[out.length - 2].n > out[out.length - 1].sum / out[out.length - 1].n) {
      const last = out.pop();
      const prev = out.pop();
      out.push({ sum: prev.sum + last.sum, n: prev.n + last.n });
    }
  }
  return out.flatMap((b) => new Array(b.n).fill(b.sum / b.n));
}
const NL = String.fromCharCode(10);
function shiftDb(prefix, id, delta) {
  const s = texts[prefix].s;
  const a = s.indexOf('  ' + id + ': ');
  const b = s.indexOf(NL + '  }),', a);
  let seg = s.slice(a, b);
  const dbRe = new RegExp(NL + '    db: (-?[0-9.]+),');
  const m = dbRe.exec(seg);
  const old = m ? Number(m[1]) : 0;
  const next = Math.round((old + delta) * 10) / 10;
  if (m) seg = seg.replace(dbRe, next === 0 ? '' : NL + '    db: ' + next + ',');
  else seg = seg.replace(new RegExp(NL + '    rank: ([0-4]),'), (all, r) => NL + '    rank: ' + r + ',' + NL + '    db: ' + next + ',');
  texts[prefix].s = s.slice(0, a) + seg + s.slice(b);
}
for (const prefix of ['atk_', 'imp_']) {
  for (const line of LINES) {
    const cur = line.map((u) => rows.get(prefix + u).loudRms);
    const lr = Math.log(ratio);
    const fit = pav(cur.map((c, k) => Math.log(c) - k * lr)).map((v, k) => Math.exp(v + k * lr));
    const out = [];
    line.forEach((u, k) => {
      const delta = Math.round(20 * Math.log10(fit[k] / cur[k]) * 10) / 10;
      out.push(u + ' ' + cur[k].toFixed(4) + (delta ? ' ' + (delta > 0 ? '+' : '') + delta + ' dB' : ''));
      if (delta && apply) shiftDb(prefix, prefix + u, delta);
    });
    console.log(prefix, out.join(' | '));
  }
}
if (apply) for (const [k, f] of Object.entries(files)) fs.writeFileSync(f, texts[k].crlf ? texts[k].s.replace(/\n/g, '\r\n') : texts[k].s);
