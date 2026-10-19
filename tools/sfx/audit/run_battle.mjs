// A scripted 3x chapter run with the twelve skill cats on the board, counting every audio call (1 frame = 1/30 s of real time at speed 3).
// node run_battle.mjs <name> [chapter=1] [level=5] [maxFrames=14000] [fillers=1] [fish=300]
import fs from 'node:fs';
import { open, save, SC, PAGE } from './h.mjs';
const name = process.argv[2] || 'run';
const chapter = +(process.argv[3] || 1), level = +(process.argv[4] || 5), maxFrames = +(process.argv[5] || 14000), fillerMode = process.argv[6] ?? '1', fish = +(process.argv[7] || 300);
const W = 450;
const lib = await import(new URL('../../edge/lib.mjs', import.meta.url).href);
const b = await open(`?debug=1&scene=battle&chapter=${chapter}&seed=7&lang=ko&sp=1&runs=5&sandbox=1&level=${level}`, { ready: '!!(window.__dbg && window.__dbg.battle && window.__dbg.audio)' });
try {
  await b.sleep(1500);
  await b.eval('void window.__dbg.lessons?.progress?.markSkipped?.()').catch(() => {});
  await lib.quiet(b);
  console.log('setup', await b.eval(fs.readFileSync(`${PAGE}/run_setup.js`, 'utf8')));
  // the driver: a bot every 8 frames; the page's own loop is stopped, every frame is ours
  await b.eval(`window.__A.run = async (frames, dt, bot) => {
    const A = window.__A, d = A.d, bt = d.battle, scene = d.scene;
    for (let i = 0; i < frames; i++) {
      if (bt.phase === 'won' || bt.phase === 'lost') return { done: bt.phase };
      if (bot && bt.phase !== 'choice' && A.frames % 8 === 0) { try { A.bot.act(bt); } catch (e) { A.errors.push('act ' + e.message); } }
      window.__dbg.game.tick(dt); A.T += dt; A.frames++;
    }
    const s = d.spState();
    return { phase: bt.phase, wave: bt.wave, time: +bt.time.toFixed(1), enemies: bt.enemies.length, T: +A.T.toFixed(1), frames: A.frames, shown: s.shown, lost: s.lost, plays: A.log.length, pr: scene.pauseReasons().join('+'), pend: bt.pending ? bt.pending.kind : null, errs: A.errors.length, speed: scene.speed, fish: Math.round(bt.fish) };
  }; window.__A.render = () => { window.__dbg.game.app.render(); return 1; }; 1`);
  // prep (held, 2.4 s in 1/60 steps), then the board
  await b.eval('(() => { const d = window.__A.d; d.hold(true); d.step(2.4); return 1; })()');
  const board = { 0: 'w_viking', 1: 'w_samurai', 2: 'w_tiger', 3: 'r_ninja', 4: 'r_gunner', 5: 'r_star', 6: 'm_storm', 7: 'm_frost', 8: 'm_cosmo', 9: 't_bard', 10: 't_alch', 11: 't_lucky' };
  if (fillerMode !== '0') Object.assign(board, { 12: 'w_paw', 13: 'w_sword', 14: 'r_sling', 15: 'r_archer', 16: 'm_snow', 17: 'm_fire', 18: 't_bell', 19: 't_chef' });
  if (fillerMode === '2') Object.assign(board, { 20: 'w_paw', 21: 'w_sword', 22: 'r_archer', 23: 'm_snow', 24: 't_bell' });
  await b.eval(`(() => { const d = window.__A.d; d.board(${JSON.stringify(board)}); d.give(${fish}, 20); d.setSpeed(3); d.hold(false); return 1; })()`);
  console.log(JSON.stringify(await b.eval('window.__A.run(90, 1/30, false)')));
  // forget everything the setup played (the board swap fires the cats' events)
  await b.eval('(() => { const A = window.__A; A.log.length = 0; A.req.length = 0; A.calls.length = 0; A.marks.length = 0; A.T = 0; A.frames = 0; return 1; })()');
  const t0 = Date.now();
  let last = null, toys = 0, picks = 0, still = 0, prevTime = -1;
  for (let i = 0; i < Math.ceil(maxFrames / 60); i++) {
    last = await b.eval('window.__A.run(60, 1/30, true)');
    if (last.done) break;
    if (last.pend === 'relic') {
      toys++;
      await b.eval('window.__A.marks.push([+window.__A.T.toFixed(2), "toy"]); 1');
      for (let tries = 0; tries < 4; tries++) {
        for (let k = 0; k < 12; k++) await b.eval('window.__A.run(10, 1/30, false)');
        await b.eval('window.__A.render()');
        const pt = [[W / 2, W * 0.66], [W / 2, W * 0.75], [W / 2, W * 0.58], [W / 2, W * 0.5]][tries];
        await b.click(pt[0], pt[1]);
        for (let k = 0; k < 8; k++) await b.eval('window.__A.run(10, 1/30, false)');
        if (!(await b.eval('window.__A.d.battle.pending ? 1 : 0'))) break;
      }
      // the clock must not have run in the meantime: forget nothing, the sim stood still while a choice was pending
    } else if (last.pend === 'summon') {
      picks++;
      await b.eval('window.__A.marks.push([+window.__A.T.toFixed(2), "pick"]); void window.__A.d.battle.pickSummon(0); 1');
      await b.eval('window.__A.run(40, 1/30, false)');
    }
    if (i % 10 === 0) console.log(JSON.stringify(last), ((Date.now() - t0) / 1000).toFixed(0) + 's', 'toys', toys, 'picks', picks);
    if (last.time === prevTime && !last.pend) { if (++still > 40) { console.log('STUCK', JSON.stringify(last)); break; } } else still = 0;
    prevTime = last.time;
  }
  const out = await b.eval('JSON.stringify({ log: window.__A.log, req: window.__A.req, calls: window.__A.calls, marks: window.__A.marks, errors: window.__A.errors, T: window.__A.T, frames: window.__A.frames })');
  save(`${name}.json`, out);
  const o = JSON.parse(out);
  console.log('END', JSON.stringify(last), 'saved', name, 'plays', o.log.length, 'T', o.T.toFixed(1), 'errors', o.errors.length, 'page errors', await b.eval('JSON.stringify(window.__errors ?? null)'));
} finally { b.close(); }
