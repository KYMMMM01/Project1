// Check for the bakeFix.ts quad patch: after busy frames, every baked piece on screen must have in its parent's vertex buffer exactly
// what Pixi would pack for it now (position, size, colour, texture). A stale quad is a picture drawn in an old place or colour.
//   node tools/perf/stale_check.mjs <base url> [--port=9399]
import path from 'node:path';
import { launch } from '../edge/cdp.mjs';

const base = process.argv[2];
const port = Number((process.argv.find((a) => a.startsWith('--port=')) ?? '=9399').split('=')[1]);

// Page side: compare every visible cached group's quad with a fresh pack of it.
// It draws one frame first, so the frame it reads is the one just drawn (not a tick that ran after the last draw).
const CHECK = `(() => {
  window.__dbg.game.app.render();
  const stage = window.__dbg.game.app.stage;
  let checked = 0, stale = [];
  const walk = (c) => {
    if (!c.visible || !c.renderable) return;
    const g = c.renderGroup;
    if (g && g.isCachedAsTexture && g.root === c && c.parent) {
      const q = g._batchableRenderGroup;
      const b = q && q._batcher;
      if (b && q._batch) {
        const n = 4 * b.vertexSize;
        const f = new Float32Array(n); const u = new Uint32Array(f.buffer);
        b.packQuadAttributes(q, f, u, 0, q._textureId);
        const cur = b.attributeBuffer.float32View.subarray(q._attributeStart, q._attributeStart + n);
        let same = true;
        for (let i = 0; i < n; i++) if (Math.abs(cur[i] - f[i]) > 1e-3 && !(Number.isNaN(cur[i]) && Number.isNaN(f[i]))) { same = false; break; }
        checked++;
        if (!same) {
          const p = []; for (let x = c, i = 0; x && i < 7; x = x.parent, i++) p.unshift(x.label || x.constructor.name);
          const diff = []; for (let i = 0; i < n && diff.length < 6; i++) if (cur[i] !== f[i]) diff.push([i % b.vertexSize, +cur[i].toFixed(2), +f[i].toFixed(2)]);
          stale.push({ path: p.join('>'), diff, vsize: b.vertexSize, worldAlpha: g.renderGroupParent ? g.renderGroupParent.worldAlpha : null, groupAlpha: c.groupAlpha, alpha: c.alpha, needs: g.textureNeedsUpdate });
        }
      }
    }
    for (const ch of c.children) walk(ch);
  };
  walk(stage);
  return { checked, stale: stale.slice(0, 10), staleCount: stale.length };
})()`;

const SCENES = [
  { name: 'crowd', query: '?scene=battle&chapter=3&seed=7&sandbox=1&runs=5&debug=1&lang=ko', ready: 'window.__dbg.battle',
    run: `(async () => { const d = window.__dbg.battle; const pr = window.__dbg.lessons.progress; for (const id of pr.unread()) pr.markTaught(id);
      d.skipToWave(21); d.board({ 0: 'm_frost', 1: 'm_cosmo', 2: 't_alch', 3: 'w_tiger', 4: 'r_gunner', 5: 'm_fire', 6: 'm_storm', 7: 't_bard', 8: 'w_viking', 9: 'r_ninja' });
      d.ctx.setSpeed(3); const game = window.__dbg.game; const out = [];
      for (let i = 0; i < 400; i++) { if (i % 15 === 0) { d.spawn('roomba', 4, 60); d.spawn('dust', 8, 400); } if (i === 200) d.boss('boss_blender', 200); game.tick(1 / 30); game.app.render();
        if (i % 100 === 99) out.push(${CHECK}); await new Promise((r) => setTimeout(r, 0)); }
      return out; })()` },
  { name: 'home', query: '?debug=1&scene=home&lang=ko&fresh=1&notitle=1', ready: 'window.__dbg.home',
    run: `(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const game = window.__dbg.game; const out = [];
      window.__dbg.meta.unlockAll(); window.__dbg.meta.addGold(50000); window.__dbg.meta.addGems(5000);
      out.push(${CHECK});
      for (const tab of ['shop', 'cats', 'missions', 'pass', 'battle']) {
        for (const p of [...game.popupLayer.children]) if (typeof p.close === 'function') p.close();
        window.__dbg.home.goTab(tab); await wait(1500); out.push(${CHECK});
        const views = []; const walk = (c) => { if (!c.visible) return; if (c.isScrollHost) views.push(c); for (const ch of c.children) walk(ch); }; walk(game.app.stage);
        for (const v of views) { v.scrollTo(400, true); }
        await wait(900); out.push(${CHECK});
        for (const v of views) { v.scrollTo(0, true); }
        await wait(900); out.push(${CHECK});
      }
      return out; })()` },
];

// The case review found (2026-11-11): a baked piece hidden by alpha 0 is not drawn, its group is rebuilt meanwhile (the rebuild packs
// it at alpha 0), then the alpha comes back to the value last sent. Every baked piece of the shop list goes through it at once.
SCENES.push({ name: 'snap', query: '?debug=1&scene=home&lang=ko&fresh=1&notitle=1', ready: 'window.__dbg.home',
  run: `(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const game = window.__dbg.game; const out = [];
    window.__dbg.meta.unlockAll();
    for (let i = 0; i < 6; i++) { await wait(500); for (const p of [...game.popupLayer.children]) if (typeof p.close === 'function') p.close(); }
    window.__dbg.home.goTab('shop'); await wait(1500);
    const views = []; const walk = (c) => { if (!c.visible) return; if (c.isScrollHost) views.push(c); for (const ch of c.children) walk(ch); }; walk(game.app.stage);
    views.sort((a, b) => b.content.height - a.content.height);
    const content = views[0].content;
    game.app.ticker.stop();
    const rows = [...content.children];
    for (const r of rows) r.alpha = 0;
    game.app.render();
    const probe = new (content.constructor)(); content.addChild(probe); game.app.render(); content.removeChild(probe); game.app.render();
    for (const r of rows) r.alpha = 1;
    out.push(${CHECK});
    game.app.ticker.start();
    return out; })()` });

let bad = 0;
for (const sc of SCENES) {
  const b = await launch({ port, userDir: path.resolve(`.shots/perf/prof_stale_${sc.name}`), width: 390, height: 844 });
  try {
    await b.goto(base + sc.query);
    for (let i = 0; i < 120; i++) { await b.sleep(250); if (await b.eval(`!!(window.__dbg && window.__dbg.game && ${sc.ready})`).catch(() => false)) break; }
    await b.sleep(4000);
    const out = await b.eval(sc.run);
    for (const r of out) { if (r.staleCount) bad++; console.log(`[${sc.name}] checked ${r.checked} stale ${r.staleCount}${r.staleCount ? ' ' + JSON.stringify(r.stale) : ''}`); }
    const errors = await b.eval('JSON.stringify(window.__errors || [])');
    if (errors !== '[]') { bad++; console.log(`[${sc.name}] page errors ${errors.slice(0, 300)}`); }
  } finally {
    b.close();
  }
}
console.log(bad ? `STALE OR ERRORS: ${bad}` : 'OK: no stale quads');
process.exitCode = bad ? 1 : 0;
