// Frame time of the standard crowded wave (see docs/handoff/fx.md "the crowded wave got slower" and field.md "2026-10-09 batch"):
// chapter 3, wave 21, speed 3, a board of frost / cosmic / alchemist cats (12 cells of them), about 40 enemies and 20 areas alive,
// 150 frames of `game.tick + render + gl.finish` after 120 warm-up frames. Prints one JSON line starting with `PERF`.
//   GAME_PORT=5199 tools/battle_motion.sh perf tools/crowded_wave.js            20 cats (cells 0 to 19, the board of the old 5 x 4 field)
// Set ALL below to true for all 25 cells filled.
// The Aside machine is noisy by about 1.5 ms between runs: run it three times.
const ALL = false;
await mcOpen('?scene=battle&chapter=3&seed=7&sandbox=1&runs=5&debug=1');
const r = await ev(async (all) => {
  const d = window.__dbg.battle;
  const game = window.__dbg.game;
  const pr = window.__dbg.lessons.progress;
  for (const id of pr.unread()) pr.markTaught(id);
  d.skipToWave(21);
  const board = { 0: 'm_frost', 1: 'm_cosmo', 2: 't_alch', 3: 'm_frost', 4: 'm_cosmo', 5: 't_alch', 6: 'm_frost', 7: 'm_frost', 8: 'm_cosmo', 9: 't_alch', 10: 'm_frost', 11: 't_alch', 12: 'w_tiger', 13: 'r_gunner', 14: 'm_fire', 15: 'm_storm', 16: 't_bard', 17: 'w_viking', 18: 'r_ninja', 19: 'w_samurai' };
  if (all) Object.assign(board, { 20: 'm_frost', 21: 't_alch', 22: 'm_cosmo', 23: 'm_frost', 24: 't_alch' });
  d.board(board);
  d.ctx.setSpeed(3);
  const gl = game.app.renderer.gl;
  for (let i = 0; i < 120; i++) game.tick(1 / 30);
  const times = [];
  let tickSum = 0;
  let zonesSum = 0;
  let enemiesSum = 0;
  let maxZones = 0;
  for (let i = 0; i < 150; i++) {
    if (i % 15 === 0) {
      d.spawn('roomba', 4, 60);
      d.spawn('dust', 8, 400);
    }
    const t0 = performance.now();
    game.tick(1 / 30);
    const t1 = performance.now();
    game.app.render();
    if (gl && gl.finish) gl.finish();
    times.push(performance.now() - t0);
    tickSum += t1 - t0;
    const z = d.battle.zones.length;
    zonesSum += z;
    maxZones = Math.max(maxZones, z);
    enemiesSum += d.battle.enemies.length;
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return { tickMean: +(tickSum / 150).toFixed(2), mean: +mean.toFixed(2), p50: +times[75].toFixed(2), p95: +times[142].toFixed(2), zonesAvg: +(zonesSum / 150).toFixed(1), maxZones, enemiesAvg: +(enemiesSum / 150).toFixed(1) };
}, ALL);
console.log('PERF ' + JSON.stringify(r));
await done();
