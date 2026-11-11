// CPU profile of one ui_groups scene: the top self-time functions over the measured frames.
//   node tools/perf/profile.mjs <base url> <scene> [--frames=120] [--port=9397]
import path from 'node:path';
import { launch } from '../edge/cdp.mjs';

const [base, scene] = process.argv.slice(2);
const opt = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : String(d); };
const frames = Number(opt('frames', 120));
const tab = scene === 'cats' || scene === 'shop' ? scene : null;
const b = await launch({ port: Number(opt('port', 9397)), userDir: path.resolve('.shots/perf/prof_cpu'), width: 390, height: 844 });
try {
  await b.goto(base + '?debug=1&scene=home&lang=ko&fresh=1&notitle=1');
  for (let i = 0; i < 120; i++) {
    await b.sleep(250);
    if (await b.eval('!!(window.__dbg && window.__dbg.home)').catch(() => false)) break;
  }
  await b.sleep(4000);
  await b.eval(`(async () => { const m = window.__dbg.meta; m.unlockAll(); m.addGold(50000); m.addGems(5000); m.addCards(200);
    ${tab ? `window.__dbg.home.goTab('${tab}');` : ''} await new Promise((r) => setTimeout(r, 2500));
    for (const p of [...window.__dbg.game.popupLayer.children]) if (typeof p.close === 'function') p.close();
    await new Promise((r) => setTimeout(r, 800));
    const views = []; const walk = (c) => { if (!c.visible) return; if (c.isScrollHost) views.push(c); for (const ch of c.children) walk(ch); }; walk(window.__dbg.game.app.stage);
    views.sort((a, b) => b.content.height - a.content.height); const v = views[0];
    const span = Math.max(200, Math.min(1600, v.content.height - 600));
    window.__step = (i) => { const k = (i % 180) / 180; v.scrollTo(span * (k < 0.5 ? k * 2 : 2 - k * 2), false); };
    const game = window.__dbg.game; game.app.ticker.stop(); for (let i = 0; i < 60; i++) { window.__step(i); game.tick(1/60); game.app.render(); } return 1; })()`);
  await b.send('Profiler.enable');
  await b.send('Profiler.setSamplingInterval', { interval: 200 });
  await b.send('Profiler.start');
  await b.eval(`(() => { const game = window.__dbg.game; const gl = game.app.renderer.gl; for (let i = 0; i < ${frames}; i++) { window.__step(i + 60); game.tick(1/60); game.app.render(); if (gl && gl.finish) gl.finish(); } return 1; })()`);
  const { profile } = await b.send('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i]);
    const f = n.callFrame;
    const key = `${f.functionName || '(anon)'} ${f.url.replace(/.*\//, '').replace(/\?.*/, '')}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + (dt[i] || 0));
  }
  const total = [...self.values()].reduce((a, x) => a + x, 0);
  console.log(`total ${(total / 1000).toFixed(0)} ms over ${frames} frames`);
  for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${(v / 1000).toFixed(1).padStart(8)} ms  ${(100 * v / total).toFixed(1).padStart(5)}%  ${k}`);
} finally {
  b.close();
}
