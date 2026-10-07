// Frame times of real waves, for tools/battle_frames.sh (needs `const CH`, `TARGETS`, `FULL`, `BUDGET` in front of it, see the .sh).
// Chapter CH at speed 3 with the bot's own board: for each target wave T the run plays waves T-3 to T (preparations, pick of three and toy
// screens answered with real taps), every frame timed as tick + render + gl.finish. Prints: the first frames of every enemy kind (six frames
// from the first one the simulation had), the median / p95 / p99 frame, and the slowest frames of each target wave. A boss or elite that has
// stood 450 frames is killed (the bot's board is not meant to win a boss fight). Waves in FULL are played to their end, the others for 120 frames.
async function resolveChoice(kind) {
  await mcWarp(1.6);
  if (kind === 'relic') { await mcMouse('down', 360, 460); await mcMouse('up', 360, 460); }
  else {
    const p = await ev(() => { const game = window.__dbg.game; const k = game.scale; let hit = null; const walk = (o) => { if (hit || !o.visible || o.alpha <= 0) return; if (o.constructor.name === 'Text' && typeof o.text === 'string' && o.text.includes('추천') && o.width > 0) { const r = o.getBounds(); hit = [Math.round((r.x + r.width / 2) / k), Math.round((r.y + r.height / 2) / k)]; return; } for (const c of o.children || []) walk(c); }; walk(game.app.stage); return hit; });
    if (p) { await mcMouse('down', p[0] - 40, p[1] + 150); await mcMouse('up', p[0] - 40, p[1] + 150); } else console.log('NO PICK LABEL');
  }
  await mcWarp(1.2);
  const left = await ev(() => window.__dbg.battle.battle.phase);
  if (left === 'choice') console.log('CHOICE STILL OPEN ' + kind);
}
async function dismissCards() {
  for (let i = 0; i < 8; i++) {
    const card = await ev(() => ({ id: window.__dbg.lessons.card(), body: window.__dbg.lessons.cardBody() }));
    if (!card.id || !card.body) break;
    console.log('CARD ' + card.id + ' ' + JSON.stringify(card.body));
    await mcMouse('down', card.body.x + 130, card.body.y + card.body.h - 60); await mcMouse('up', card.body.x + 130, card.body.y + card.body.h - 60); await mcWarp(0.5);
  }
}
await mcOpen('?scene=battle&chapter=' + CH + '&seed=7&sandbox=1&runs=5&debug=1');
await ev(async ([L, R]) => {
  const resolve = (0, eval)(R); const imp = (p) => new Function('u', L)(resolve(p));
  const { killEnemy } = await imp('/src/game/sim/enemies.ts');
  const d = window.__dbg.battle; const game = window.__dbg.game; const b = d.battle;
  const pr = window.__dbg.lessons.progress; for (const id of pr.unread()) pr.markTaught(id);
  const gl = game.app.renderer.gl;
  const W = (window.__w = { n: 0, seen: new Set(), pending: [], all: [], waves: {} });
  W.frame = () => { const t0 = performance.now(); game.tick(1 / 30); game.app.render(); if (gl && gl.finish) gl.finish(); return performance.now() - t0; };
  W.step = (until, maxFrames) => {
    let k = 0;
    while (k++ < maxFrames && b.wave < until && b.phase !== 'won' && b.phase !== 'lost') { if (b.phase === 'choice') return 'choice'; W.one(); }
    return 'ok';
  };
  W.bossAge = 0;
  const isBig = (e) => e.id.startsWith('boss_') || e.id === 'spray' || e.id === 'firecracker';
  W.one = () => {
    // The bot's board is not meant to win a boss fight: a boss or elite that has stood for 450 frames is killed, the way a player's board would have.
    if (b.enemies.some(isBig)) { if (++W.bossAge > 450) { for (const e of b.enemies.slice()) if (isBig(e)) killEnemy(b, e, null); W.bossAge = 0; } } else W.bossAge = 0;
    const kinds = []; for (const e of b.enemies) if (!W.seen.has(e.id)) { W.seen.add(e.id); kinds.push(e.id); }
    const dt = W.frame(); W.n++; W.all.push(dt);
    for (const k of kinds) W.pending.push({ kind: k, wave: b.wave, frames: [], left: 6 });
    for (const p of W.pending) if (p.left > 0) { p.frames.push(+dt.toFixed(1)); p.left--; }
    const w = (W.waves[b.wave] ||= { max: 0, n: 0, top: [] });
    w.n++; w.max = Math.max(w.max, dt); if (dt > 8) { w.top.push([w.n, +dt.toFixed(1)]); w.top.sort((a, b) => b[1] - a[1]); if (w.top.length > 8) w.top.pop(); }
  };
  const hud = d.scene.hud; hud.hints.only = new Set(); hud.hints.close();
  d.ctx.setSpeed(3);
  d.board({ 0: 'm_frost', 1: 'm_cosmo', 2: 't_alch', 3: 'm_frost', 4: 'm_cosmo', 5: 't_alch', 6: 'w_tiger', 7: 'r_gunner', 8: 'm_fire', 9: 'm_storm', 10: 't_bard', 11: 'w_viking', 12: 'r_ninja', 13: 'w_samurai', 14: 'm_snow', 15: 'r_star' });
  for (let i = 0; i < 30; i++) W.frame();
}, [LOADER, RESOLVE]);
await mcWarp(0.5); await dismissCards();
const t0 = Date.now();
for (const T of TARGETS) {
  if (Date.now() - t0 > BUDGET * 1000) { console.log('OUT OF TIME before wave ' + T); break; }
  await ev(([T]) => { const d = window.__dbg.battle; if (d.battle.wave < T - 3) d.skipToWave(T - 3); for (let i = 0; i < 20; i++) window.__w.frame(); }, [T]);
  for (let k = 0; k < 60; k++) {
    const st = await ev(([T]) => { const r = window.__w.step(T, 150); const b = window.__dbg.battle.battle; return { r, wave: b.wave, kind: b.pending ? b.pending.kind : null }; }, [T]);
    if (st.r === 'choice') await resolveChoice(st.kind);
    if (st.wave >= T) break;
  }
  // wave T itself: until the next wave starts or 1400 frames
  for (let k = 0; k < 20; k++) {
    const st = await ev(([T, n]) => { const b = window.__dbg.battle.battle; let i = 0; while (i++ < n && b.wave === T && b.phase !== 'won' && b.phase !== 'lost') { if (b.phase === 'choice') return { r: 'choice', kind: b.pending ? b.pending.kind : null, i }; window.__w.one(); } return { r: 'ok', i }; }, [T, FULL.includes(T) ? 1500 : 120]);
    if (st.r === 'choice') { await resolveChoice(st.kind); continue; }
    break;
  }
}
const r = await ev(() => { const W = window.__w; const a = [...W.all].sort((x, y) => x - y); return { n: W.n, median: a[Math.floor(a.length / 2)], p95: a[Math.floor(a.length * 0.95)], p99: a[Math.floor(a.length * 0.99)], pending: W.pending, waves: W.waves }; });
console.log('RUN ch' + CH + ' frames ' + r.n + ' median ' + r.median.toFixed(2) + ' p95 ' + r.p95.toFixed(1) + ' p99 ' + r.p99.toFixed(1));
for (const p of r.pending) console.log('FIRSTKIND ' + p.kind + ' w' + p.wave + ' ' + p.frames.join(','));
for (const [w, v] of Object.entries(r.waves)) if (TARGETS.includes(Number(w)) || Number(w) <= TARGETS[0]) console.log('WAVE ' + w + ' frames ' + v.n + ' max ' + v.max.toFixed(1) + ' worst ' + JSON.stringify(v.top));
await done();
