// Each of the twelve skills cast alone in a calm battle at 1x: every audio call it makes, with its time from the cast, and what the stage rules did to it.
// node run_skills.mjs [skill ...]   (default: all twelve) -> skills_now.json
import fs from 'node:fs';
import { open, save, SC, PAGE } from './h.mjs';
const only = process.argv.slice(2);
const lib = await import(new URL('../../edge/lib.mjs', import.meta.url).href);
const SK = [
  { skill: 'shove', cat: 'w_viking', cell: 0, setup: ['put(1, "w_paw", 0)', 'crowd(20, "cucumber", 110, 34, 80)'] },
  { skill: 'cut', cat: 'w_samurai', cell: 2, setup: ['put(7, "w_paw", 0)', 'crowd(9, "cucumber", 60, 34, 60)'] },
  { skill: 'charge', cat: 'w_tiger', cell: 12, setup: ['put(7, "w_paw", 0)', 'crowd(14, "cucumber", 120, 30, 90)', 'crowd(10, "dust", 520, 30, 90)'] },
  { skill: 'clones', cat: 'r_ninja', cell: 12, gauge: 0.5, setup: ['crowd(12, "cucumber", 500, 34, 60)'] },
  { skill: 'wanted', cat: 'r_gunner', cell: 12, setup: ['put(7, "w_paw", 0)', 'crowd(6, "cucumber", 60, 36, 1)', 'boss("boss_blender", 230, true)'] },
  { skill: 'lap', cat: 'r_star', cell: 12, setup: ['put(7, "w_paw", 0)', 'crowd(12, "cucumber", 300, 40, 60)'] },
  { skill: 'cloud', cat: 'm_storm', cell: 12, setup: ['put(7, "w_paw", 0)', 'crowd(6, "cucumber", 100, 40, 60)'] },
  { skill: 'knock', cat: 'm_frost', cell: 12, setup: ['put(7, "w_paw", 0)', 'crowd(12, "cucumber", 380, 34, 3)'], after: ['chill(3, 6, 60, 0)'] },
  { skill: 'meteor', cat: 'm_cosmo', cell: 12, setup: ['put(7, "w_paw", 0)', 'crowd(8, "cucumber", 540, 30, 80)'] },
  { skill: 'jam', cat: 't_bard', cell: 12, setup: ['put(7, "w_paw", 0.3)', 'put(11, "r_archer", 0.6)', 'put(13, "m_fire", 0.1)', 'put(17, "w_sword", 0.9)', 'put(22, "t_lucky", 0.2)', 'crowd(8, "cucumber", 380, 40, 60)'] },
  { skill: 'fish', cat: 't_alch', cell: 12, setup: ['put(7, "w_paw", 0)', 'put(6, "r_sling", 0)', 'put(8, "r_archer", 0)', 'crowd(6, "cucumber", 60, 36, 1)', 'boss("boss_blender", 230, true)'] },
  { skill: 'capsule', cat: 't_lucky', cell: 12, setup: ['put(7, "w_paw", 0)', 'put(11, "r_archer", 0.3)', 'put(13, "m_fire", 0.3)', 'crowd(6, "cucumber", 360, 40, 60)'], pre: ['capsule("fish")'] },
];
const b = await open('?debug=1&scene=battle&chapter=1&seed=7&lang=ko&sp=1&runs=5&sandbox=1&level=5', { ready: '!!(window.__dbg && window.__dbg.battle && window.__dbg.audio)' });
const result = {};
try {
  await b.sleep(1500);
  await b.eval('void window.__dbg.lessons?.progress?.markSkipped?.()').catch(() => {});
  await lib.quiet(b);
  await b.eval(fs.readFileSync(`${PAGE}/run_setup.js`, 'utf8'));
  await b.eval('window.__A.render = () => { window.__dbg.game.app.render(); return 1; }; 1');
  await b.eval(`window.__A.cast = async (cell, frames) => {
    const A = window.__A, d = A.d, bt = d.battle, st = window.__dbg.spStage;
    const before = st.stats().shown;
    d.gauge(cell, 1);
    let castT = null;
    for (let i = 0; i < frames; i++) {
      window.__dbg.game.tick(1 / 60); A.T += 1 / 60;
      if (castT === null && st.stats().shown > before) { castT = A.T; }
    }
    return { castT, shown: st.stats().shown - before, lost: st.stats().lost };
  }; 1`);
  await b.eval('(() => { const d = window.__A.d; d.hold(true); d.step(2.4); return 1; })()');
  for (const k of SK) {
    if (only.length && !only.includes(k.skill)) continue;
    await b.eval('(() => { const d = window.__A.d; d.board({}); d.hold(false); d.setSpeed(1); return 1; })()');
    for (const c of [`put(${k.cell}, "${k.cat}", ${k.gauge ?? 0})`, ...(k.pre || []), ...k.setup]) await b.eval(`void window.__A.d.${c}`);
    const settle = async () => {
      for (let i = 0; i < 8; i++) {
        await b.eval('(() => { for (let i = 0; i < 40; i++) { window.__dbg.game.tick(1 / 60); window.__A.T += 1 / 60; } return 1; })()');
        const pr = await b.eval('window.__A.d.scene.pauseReasons().join("+")');
        if (!pr) break;
        await b.eval('window.__A.render()');
        for (let t = 0; t < 4; t++) { const ok = await lib.textCentre(b, '/^(알겠어요|Got it)$/'); if (!ok) break; await b.click(ok.x, ok.y); await b.sleep(600); await b.eval('(() => { for (let i = 0; i < 40; i++) { window.__dbg.game.tick(1 / 60); window.__A.T += 1 / 60; } return 1; })()'); }
      }
    };
    await settle();
    for (const c of k.after || []) await b.eval(`void window.__A.d.${c}`);
    await b.eval('(() => { for (let i = 0; i < 60; i++) { window.__dbg.game.tick(1 / 60); window.__A.T += 1 / 60; } return 1; })()');
    await b.eval('(() => { const A = window.__A; A.log.length = 0; A.req.length = 0; A.calls.length = 0; return 1; })()');
    const t0 = await b.eval('window.__A.T');
    const info = await b.eval(`window.__A.cast(${k.cell}, 360)`);
    const log = JSON.parse(await b.eval('JSON.stringify(window.__A.log)'));
    const req = JSON.parse(await b.eval('JSON.stringify(window.__A.req)'));
    const calls = JSON.parse(await b.eval('JSON.stringify(window.__A.calls)'));
    const ref = info.castT ?? t0;
    result[k.skill] = { cat: k.cat, info, t0, ref, log: log.map((e) => [+(e[0] - ref).toFixed(3), e[1], e[2], e[3], e[4], e[5], e[6], e[7], e[8]]), req: req.map((e) => [+(e[0] - ref).toFixed(3), e[1], e[2], e[3], e[4]]), calls: calls.map((c) => [+(c[0] - ref).toFixed(3), ...c.slice(1)]) };
    console.log(k.skill.padEnd(8), JSON.stringify(info), 'calls', log.length, 'requests', req.length, '->', [...new Set(log.map((e) => e[1]))].join(' '));
    await b.eval('window.__A.d.hold(true)');
  }
  console.log('errors', await b.eval('JSON.stringify(window.__errors ?? null)'));
  save(only.length ? `skills_now_${only.join('_')}.json` : 'skills_now.json', result);
} finally { b.close(); }
