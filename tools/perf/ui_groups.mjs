// UI render-group cost, before and after: the same scripted scenes, frame by frame, in a muted headless Edge (SwiftShader).
//   node tools/perf/ui_groups.mjs <base url> <out name> [--mode=time|count|causes] [--scenes=battle,crowd,home] [--port=9395]
// time:   per frame `game.tick` + `app.render` (JS side) + `gl.finish`, no probe installed. Medians and p95 over the measured frames.
// count:  the probe (probe.js) on: per render group, rebuilds per frame, renderables rebuilt, build ms, vertex upload KB per frame.
// causes: count plus where the structure changes and the view updates come from (use a dev server: names are readable there).
// Base url: a dev server (http://127.0.0.1:5173/) or a production build under vite preview (http://127.0.0.1:5288/Project1/).
// The machine is noisy (about 1.5 ms between runs): compare builds by alternating runs, see compare.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../edge/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2];
const name = process.argv[3];
const opt = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : String(d); };
const mode = opt('mode', 'time');
const scenes = opt('scenes', 'battle,crowd,home,cats,shop').split(',');
const port = Number(opt('port', 9395));
const FRAMES = Number(opt('frames', 600));
const OUT = path.resolve(process.env.PERF_OUT ?? '.shots/perf');
fs.mkdirSync(OUT, { recursive: true });
const probe = fs.readFileSync(path.join(HERE, 'probe.js'), 'utf8');

// Each scene: the page query, then a set-up run in the page, then FRAMES frames of `step(i)`.
const SCENES = {
  // An ordinary mid-run moment at speed 1: wave 8, twelve cats, a stream of enemies, the HUD counting and gauges filling.
  battle: {
    query: '?scene=battle&chapter=1&seed=7&sandbox=1&runs=5&debug=1&lang=ko',
    dt: 1 / 60,
    setup: `(() => { const d = window.__dbg.battle; const pr = window.__dbg.lessons.progress; for (const id of pr.unread()) pr.markTaught(id);
      d.skipToWave(8); d.board({ 0: 'w_viking', 1: 'r_gunner', 2: 'm_frost', 3: 't_bard', 5: 'w_tiger', 6: 'r_ninja', 7: 'm_storm', 8: 't_alch', 10: 'w_samurai', 11: 'r_star', 12: 'm_cosmo', 13: 't_lucky' });
      d.give(400); d.setSpeed(1); window.__step = (i) => { if (i % 40 === 0) d.spawn('dust', 4, 300, 80); }; return 1; })()`,
  },
  // The standard crowded wave (tools/crowded_wave.js): chapter 3, wave 21, speed 3, about 40 enemies and 20 areas alive.
  crowd: {
    query: '?scene=battle&chapter=3&seed=7&sandbox=1&runs=5&debug=1&lang=ko',
    dt: 1 / 30,
    setup: `(() => { const d = window.__dbg.battle; const pr = window.__dbg.lessons.progress; for (const id of pr.unread()) pr.markTaught(id);
      d.skipToWave(21); d.board({ 0: 'm_frost', 1: 'm_cosmo', 2: 't_alch', 3: 'm_frost', 4: 'm_cosmo', 5: 't_alch', 6: 'm_frost', 7: 'm_frost', 8: 'm_cosmo', 9: 't_alch', 10: 'm_frost', 11: 't_alch', 12: 'w_tiger', 13: 'r_gunner', 14: 'm_fire', 15: 'm_storm', 16: 't_bard', 17: 'w_viking', 18: 'r_ninja', 19: 'w_samurai' });
      d.ctx.setSpeed(3); window.__step = (i) => { if (i % 15 === 0) { d.spawn('roomba', 4, 60); d.spawn('dust', 8, 400); } }; return 1; })()`,
  },
  // A home tab scrolled up and down every frame (a finger dragging the list): the tab's biggest scroll view, moved 9 px a frame.
  cats: scrollScene('cats'),
  shop: scrollScene('shop'),
  // The home screen standing idle (the shell's breathing, ticking and floating bits).
  home: {
    query: '?debug=1&scene=home&lang=ko&fresh=1&notitle=1',
    dt: 1 / 60,
    setup: `(() => { window.__step = () => {}; return 1; })()`,
  },
};

function scrollScene(tab) {
  return {
    query: '?debug=1&scene=home&lang=ko&fresh=1&notitle=1',
    dt: 1 / 60,
    ready: 'window.__dbg.home',
    setup: `(async () => { const m = window.__dbg.meta; m.unlockAll(); m.addGold(50000); m.addGems(5000); m.addCards(200);
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      // The greeting popups (calendar, offers) queue one after another: close whatever opens for a few seconds.
      for (let i = 0; i < 8; i++) { await wait(500); for (const p of [...window.__dbg.game.popupLayer.children]) if (typeof p.close === 'function') p.close(); }
      window.__dbg.home.goTab('${tab}'); await wait(2500);
      for (const p of [...window.__dbg.game.popupLayer.children]) if (typeof p.close === 'function') p.close();
      await wait(800);
      // Only scroll views really on screen: every ancestor shown.
      const views = []; const walk = (c) => { if (!c.visible) return; if (c.isScrollHost) views.push(c); for (const ch of c.children) walk(ch); }; walk(window.__dbg.game.app.stage);
      views.sort((a, b) => b.content.height - a.content.height); const v = views[0];
      if (!v) throw new Error('no scroll view on ${tab}');
      const span = Math.max(200, Math.min(1600, v.content.height - 600));
      window.__step = (i) => { const k = (i % 180) / 180; v.scrollTo(span * (k < 0.5 ? k * 2 : 2 - k * 2), false); };
      return { contentH: Math.round(v.content.height), popups: window.__dbg.game.popupLayer.children.length }; })()`,
  };
}

const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const med = (a) => quantile(a, 0.5);

const results = { name, base, mode, frames: FRAMES, scenes: {} };
for (const key of scenes) {
  const sc = SCENES[key];
  const b = await launch({ port, userDir: path.join(OUT, `prof_${name}_${key}`), width: 390, height: 844 });
  try {
    await b.goto(base + sc.query);
    for (let i = 0; i < 120; i++) {
      await b.sleep(250);
      const ok = await b.eval(`!!(window.__dbg && window.__dbg.game && window.__dbg.game.app && ${sc.ready ?? (key === 'home' ? 'window.__dbg.home' : 'window.__dbg.battle')})`).catch(() => false);
      if (ok) break;
    }
    await b.sleep(4000);
    const setupOut = await b.eval(sc.setup);
    // --pre: a page expression run after the set-up (e.g. to switch some render groups off for a variant run).
    if (opt('pre', '')) await b.eval(opt('pre', ''));
    if (mode !== 'time') await b.eval(probe);
    const r = await b.eval(`(async () => {
      const game = window.__dbg.game; const gl = game.app.renderer.gl; const dt = ${sc.dt};
      game.app.ticker.stop();
      for (let i = 0; i < 120; i++) { window.__step(i); game.tick(dt); game.app.render(); }
      if (gl && gl.finish) gl.finish();
      const mode = ${JSON.stringify(mode)};
      if (mode !== 'time') window.__perf.start({ causes: mode === 'causes' });
      const tick = [], render = [], finish = [], total = [];
      for (let i = 0; i < ${FRAMES}; i++) {
        window.__step(i + 120);
        const t0 = performance.now(); game.tick(dt);
        const t1 = performance.now(); game.app.render();
        const t2 = performance.now(); if (gl && gl.finish) gl.finish();
        const t3 = performance.now();
        if (mode !== 'time') window.__perf.frame();
        tick.push(t1 - t0); render.push(t2 - t1); finish.push(t3 - t2); total.push(t3 - t0);
        if (i % 60 === 59) await new Promise((r) => setTimeout(r, 0));
      }
      const groups = mode !== 'time' ? window.__perf.stop() : null;
      game.app.ticker.start();
      return { tick, render, finish, total, groups, errors: window.__errors || [] };
    })()`);
    const sum = (k) => ({ med: +med(r[k]).toFixed(3), p95: +quantile(r[k], 0.95).toFixed(3), mean: +(r[k].reduce((a, x) => a + x, 0) / r[k].length).toFixed(3) });
    results.scenes[key] = { setup: setupOut, tick: sum('tick'), render: sum('render'), finish: sum('finish'), total: sum('total'), groups: r.groups, errors: r.errors };
    console.log(`[${name}] ${key}: render med ${results.scenes[key].render.med} ms p95 ${results.scenes[key].render.p95}, tick med ${results.scenes[key].tick.med}, total med ${results.scenes[key].total.med}${r.errors.length ? ' ERRORS ' + JSON.stringify(r.errors).slice(0, 200) : ''}`);
  } finally {
    b.close();
  }
  await new Promise((res) => setTimeout(res, 800));
}
const file = path.join(OUT, `${name}_${mode}.json`);
fs.writeFileSync(file, JSON.stringify(results, null, 1));
console.log('wrote', file);
