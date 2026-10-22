// One build, the whole story: home -> first tap (unlock + bake) -> first battle -> a long busy stretch -> home -> second battle.
//   node scen.mjs <name> <port> [--battle=180] [--battle2=60] [--noskills] [--stacks]
import fs from 'node:fs';
import { open, waitFor, installPageHelpers, snap, digest, closeAll, save, mb, MB, outFile } from './lib.mjs';
// The centre (client css px) of the first Text matching `re` that is really on screen: visible, not faded, inside the canvas.
const textCentre = (bb, re) => bb.eval(`(() => {
  let found = null;
  const walk = (n, a, vis) => {
    if (found) return;
    const al = a * (typeof n.alpha === 'number' ? n.alpha : 1);
    const v = vis && n.visible !== false && n.renderable !== false;
    if (!v || al < 0.5) return;
    if (typeof n.text === 'string' && n.style && ${re}.test(n.text)) {
      const r = n.getBounds();
      const c = window.__dbg.game.app.canvas.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (r.width > 0 && x > 0 && y > 0 && x < c.width && y < c.height) { found = { text: n.text, x, y }; return; }
    }
    for (const ch of n.children || []) walk(ch, al, v);
  };
  walk(window.__dbg.game.app.stage, 1, true);
  return found;
})()`);

const name = process.argv[2];
const port = Number(process.argv[3]);
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? Number(a.split('=')[1]) : d; };
const flag = (k) => process.argv.includes('--' + k);
const BATTLE1 = arg('battle', 180);
const BATTLE2 = arg('battle2', 60);
const IDLE_HOME = arg('idle', 75);
const base = flag('dev') ? `http://127.0.0.1:${port}/` : `http://127.0.0.1:${port}/Project1/`;
const q = '?debug=1&scene=home&lang=ko&fresh=1&notitle=1&sp=1' + (flag('stacks') ? '&stacks=1' : '');
const log = (...a) => console.log(`[${name}]`, ...a);

const SKILL_IDS = ['w_viking', 'w_samurai', 'w_tiger', 'r_ninja', 'r_gunner', 'r_star', 'm_storm', 'm_frost', 'm_cosmo', 't_bard', 't_alch', 't_lucky'];
const result = { name, port, snaps: [], notes: {} };
const push = (s) => { result.snaps.push(s); log(digest(s)); return s; };

const b = await open(base + q, { tag: name });
try {
  const ready = await waitFor(b, '!!(window.__dbg && window.__dbg.game && window.__dbg.game.app && window.__dbg.home)');
  log('ready', ready);
  await b.sleep(3500);
  await installPageHelpers(b);
  const epoch0 = await b.eval('window.__trk.epoch0');
  result.notes.epoch0 = epoch0;
  push(await snap(b, 'A_home'));
  if (process.env.JSPROF) await b.send('HeapProfiler.startSampling', { samplingInterval: 8192 });
  await b.eval('window.__homeScene1 = window.__dbg.home.scene; 1');

  // ---------------------------------------------------------------- first tap: unlock + bake
  const tapAt = Date.now();
  await b.click(195, 6);
  const bakeLog = [];
  let midDone = false;
  for (let i = 0; i < 40; i++) {
    await b.sleep(2000);
    const a = JSON.parse(await b.eval('JSON.stringify(window.__dbg.audio ? window.__dbg.audio.stats() : null)'));
    if (!a) { log('no audio stats'); break; }
    const m = b.mon.latest();
    bakeLog.push({ t: (Date.now() - tapAt) / 1000, state: a.state, baked: a.baked, pending: a.bakePending, kb: a.bakedKB, evicted: a.evicted, bakeMs: a.bakeMs, R: m?.by.renderer?.priv, G: m?.by['gpu-process']?.priv });
    if (!midDone && Date.now() - tapAt > 6000) { midDone = true; push(await snap(b, 'B1_bake_mid', { gc: false, heap: true })); }
    if (a.state === 'running' && a.bakePending === 0 && i > 3) break;
  }
  result.notes.bakeLog = bakeLog;
  await b.sleep(4000);
  const tapEnd = Date.now();
  result.notes.bakePeakProc = b.mon.peak(tapAt, tapEnd);
  const tl = await b.eval('JSON.stringify(window.__trk.tl)').then(JSON.parse);
  const inWin = tl.filter((r) => r[0] + epoch0 >= tapAt && r[0] + epoch0 <= tapEnd);
  result.notes.bakeJsPeak = { used: Math.max(...inWin.map((r) => r[1])), total: Math.max(...inWin.map((r) => r[2])), start: inWin[0]?.[1] };
  result.notes.audioTrk = JSON.parse(await b.eval('JSON.stringify(window.__page().audioTrk)'));
  push(await snap(b, 'B2_after_bake'));

  // ---------------------------------------------------------------- first battle
  const TOPICS = ["summon","summon_grade","pity","merge","class_lines","acts","lose_gauge","lose_boss","continue","classes","synergy","class_sheet","class_upgrade","pick3","sp_skill","purr","molt","awaken","sell","move_swap","sun","hazards","laser","call_wave","speed","preview","toys","toy_reroll","stakes","elite","boss","boss_vacuum","boss_blender","boss_bath","boss_cloud","boss_needle","trait_armored","trait_warded","trait_fast","trait_swarm","trait_split","trait_haste_aura","trait_heal_aura","trait_shield","trait_weaken","cards","wild_cards","chests","free_chest","missions","daily_chest","calendar","pass","patrol","sweep","daily_challenge","weekly_cup","gold_dungeon","endless","backup_code"];
  const startBattle = async (label) => {
    await b.eval('(() => { const p = window.__dbg.codex && window.__dbg.codex.progress; if (!p) return 0; for (const id of ' + JSON.stringify(TOPICS) + ') { try { p.markTaught(id); p.markRead(id); } catch (e) {} } return 1; })()');
    await b.eval(`localStorage.setItem('meowguard.laser', JSON.stringify({ v: 1, t: Date.now(), data: { opened: 2, guided: true } })); 1`);
    await b.eval('window.__oldBattleScene = window.__dbg.battle ? window.__dbg.battle.scene : null; 1');
    await b.eval("(async () => { const p = window.__dbg.meta.profile; if (p.pendingRun) await p.discardPendingRun(); return 1; })()");
    await b.eval("void window.__dbg.home.shell.startRun({ mode: 'chapter', chapter: 1, stake: 0 })");
    await b.sleep(2500);
    let p = null;
    for (let i = 0; i < 20 && !p; i++) { p = await textCentre(b, '/간식 없이 출발/'); if (!p) await b.sleep(500); }
    if (!p) throw new Error('no start button');
    await b.click(p.x, p.y);
    const ok = await waitFor(b, '!!(window.__dbg.battle && window.__dbg.battle.scene && window.__dbg.scenes.current === window.__dbg.battle.scene && window.__dbg.battle.scene !== window.__oldBattleScene)', { tries: 80, every: 500 }).catch(() => false);
    log(label, 'battle opened', ok);
    await b.sleep(4500);
    await dismiss(b);
  };
  const dismiss = async (bb) => {
    for (let i = 0; i < 4; i++) {
      const ok = await textCentre(bb, '/^(알겠어요|Got it)$/');
      if (!ok) break;
      await bb.click(ok.x, ok.y);
      await bb.sleep(1500);
    }
  };
  await startBattle('battle1');
  push(await snap(b, 'C_battle1_start'));
  result.notes.battleState1 = await b.eval('JSON.stringify({ phase: window.__dbg.battle.battle.phase, wave: window.__dbg.battle.battle.wave, pause: window.__dbg.battle.pauseReasons() })').then(JSON.parse);

  // board of skill cats, then drive
  const setupBoard = async () => {
    await b.eval(`(() => { const bt = window.__dbg.battle; const ids = ${JSON.stringify(SKILL_IDS)}; if (bt.put) { for (let c = 0; c < 25; c++) { try { bt.put(c, ids[c % ids.length], 0.5); } catch (e) { window.__errors.push('put ' + c + ' ' + e); } } } else { const m = {}; for (let c = 0; c < 25; c++) m[c] = ids[c % ids.length]; bt.board(m); } if (bt.capsule) bt.capsule('fish'); bt.setSpeed(3); return 1; })()`);
  };
  await setupBoard();
  const driveCode = (secs) => `(async () => {
    const bt = window.__dbg.battle; const B = bt.battle;
    let done = 0, paused = 0, choiceWait = 0;
    const t0 = performance.now();
    while (done < ${secs}) {
      if (B.phase === 'won' || B.phase === 'lost') break;
      if (B.phase === 'choice') { choiceWait++; if (choiceWait > 8) break; await new Promise((r) => setTimeout(r, 150)); continue; } else choiceWait = 0;
      if (bt.pauseReasons().length) { paused++; if (paused > 3) break; await new Promise((r) => setTimeout(r, 150)); continue; }
      if (B.enemies.length < 14) { if (bt.crowd) bt.crowd(14 - B.enemies.length, 'cucumber', 120, 30, 60); else bt.spawn('cucumber', 14 - B.enemies.length, 120, 60); }
      if (bt.gaugeAll && done % 3 === 0) bt.gaugeAll(1);
      for (let k = 0; k < 60; k++) bt.scene.update(1 / 60);
      done += 1;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { done, paused, phase: B.phase, wave: B.wave, enemies: B.enemies.length, wallS: Math.round((performance.now() - t0) / 1000), pause: bt.pauseReasons(), pending: B.pending ? B.pending.kind : null };
  })()`;
  const visibleTexts = (bb) => bb.eval(`(() => {
    const out = [];
    const walk = (n, a) => {
      const al = a * (typeof n.alpha === 'number' ? n.alpha : 1);
      if (n.visible === false || n.renderable === false || al < 0.5) return;
      if (typeof n.text === 'string' && n.style) { const r = n.getBounds(); if (r.width > 0 && r.x >= 0 && r.y >= 0 && r.x < 390 && r.y < 844) out.push(n.text); }
      for (const c of n.children || []) walk(c, al);
    };
    walk(window.__dbg.game.app.stage, 1);
    return out.join(' | ');
  })()`);
  let stuckN = 0;
  const unstick = async (bb, tag) => {
    const texts = await visibleTexts(bb);
    stuckN++;
    if (stuckN <= 6) { log('stuck texts:', texts.slice(0, 300)); await bb.shot(outFile(tag + '.png')); }
    if (/골라요/.test(texts)) {
      // the toy sheet: the title of its first card (the text that follows the line with "골라요", past the sub-line)
      const pt = await bb.eval(`(() => {
        const nodes = [];
        const walk = (n, a) => {
          const al = a * (typeof n.alpha === 'number' ? n.alpha : 1);
          if (n.visible === false || n.renderable === false || al < 0.5) return;
          if (typeof n.text === 'string' && n.style) { const r = n.getBounds(); if (r.width > 0 && r.x >= 0 && r.y >= 0 && r.x < 390 && r.y < 844) nodes.push([n.text, r.x + r.width / 2, r.y + r.height / 2]); }
          for (const c of n.children || []) walk(c, al);
        };
        walk(window.__dbg.game.app.stage, 1);
        const i = nodes.findIndex((x) => /골라요/.test(x[0]));
        for (let k = i + 1; k < nodes.length; k++) { if (/^(복 뽑기 한 판!|.*획득!|.*클리어!)$/.test(nodes[k][0])) continue; return { x: nodes[k][1], y: nodes[k][2], text: nodes[k][0] }; }
        return null;
      })()`);
      if (pt) { await bb.click(pt.x, pt.y); await bb.sleep(2200); }
      return 'toy';
    }
    if (/알겠어요|Got it/.test(texts)) { await dismiss(bb); return 'card'; }
    // anything else (a summon pick, a result sheet): the sim's own first choice, then let the sheet go
    await bb.eval(`(() => { const B = window.__dbg.battle.battle; try { if (B.pending && B.pending.kind === 'summon') B.pickSummon(0); else if (B.pending) B.pickRelic(0); } catch (e) { window.__errors.push('pick ' + e); } return 1; })()`);
    await bb.sleep(1500);
    return 'sim';
  };
  const drive = async (secs) => {
    let left = secs, last = null, kinds = {};
    for (let guard = 0; guard < 80 && left > 0; guard++) {
      last = await b.eval(driveCode(left));
      left -= last.done;
      if (last.done === 0 || guard % 6 === 0) log('drive', JSON.stringify(last), 'left', left);
      if (last.phase === 'won' || last.phase === 'lost') break;
      if (last.pause.length || last.phase === 'choice') { if (stuckN > 60) { last.bailed = true; break; } const k = await unstick(b, name + '_stuck' + guard); kinds[k] = (kinds[k] || 0) + 1; await b.sleep(400); }
    }
    if (last) last.unstick = kinds;
    return last;
  };
  const settle = async () => {
    for (let i = 0; i < 8; i++) {
      const st = await b.eval('JSON.stringify({ p: window.__dbg.battle.pauseReasons(), ph: window.__dbg.battle.battle.phase })').then(JSON.parse);
      if (!st.p.length && st.ph !== 'choice') break;
      await unstick(b, name + '_settle' + i);
      await b.sleep(600);
    }
    await b.sleep(1200);
  };
  const marks = [30, 60, 120, 180, 240, 300, 420, 600].filter((x) => x <= BATTLE1);
  let elapsed = 0;
  for (const m of marks) {
    const r = await drive(m - elapsed);
    elapsed = m;
    result.notes['drive1_' + m] = r;
    await settle();
    push(await snap(b, `D_battle1_${m}s`));
    if (r.phase === 'won' || r.phase === 'lost') break;
  }
  result.notes.fxTier1 = await b.eval("localStorage.getItem('fx.tier')");

  // ---------------------------------------------------------------- back home, second battle
  await b.eval('window.__dbg.battle.ctx.exit()');
  await b.sleep(5000);
  const homeOk = await waitFor(b, '!!(window.__dbg.home && window.__dbg.scenes.current === window.__dbg.home.scene && window.__dbg.home.scene !== window.__homeScene1)', { tries: 40, every: 500 });
  log('home again', homeOk);
  await b.sleep(3000);
  push(await snap(b, 'E_home_again'));
  if (process.env.JSPROF) { const prof = await b.send('HeapProfiler.stopSampling'); fs.writeFileSync(outFile('jsprof_' + name + '.json'), JSON.stringify(prof)); log('jsprof saved'); }
  await b.sleep(IDLE_HOME * 1000);
  push(await snap(b, 'E2_home_idle'));
  await startBattle('battle2');
  push(await snap(b, 'F_battle2_start'));
  await setupBoard();
  const r2 = await drive(BATTLE2);
  result.notes.drive2 = r2;
  await settle();
  push(await snap(b, `G_battle2_${BATTLE2}s`));
  // the whole timeline
  result.timeline = await b.eval('JSON.stringify(window.__trk.tl)').then(JSON.parse);
  result.procSamples = b.mon.samples.map((s) => { const by = {}; for (const p of s.procs) by[p.type] = (by[p.type] ?? 0) + p.priv; return [s.t, by.renderer ?? 0, by['gpu-process'] ?? 0, by.browser ?? 0]; });
  result.errors = await b.eval('JSON.stringify(window.__errors || [])').then(JSON.parse);
  result.glBig = await b.eval('JSON.stringify(window.__trk.gl.big)').then(JSON.parse);
  result.audioList = await b.eval('JSON.stringify(window.__trk.audio.list)').then(JSON.parse);
} catch (e) {
  log('FAILED', e.stack ?? e);
  result.failed = String(e.stack ?? e);
  try { result.errors = await b.eval('JSON.stringify(window.__errors || [])').then(JSON.parse); } catch {}
} finally {
  save(`scen_${name}.json`, result);
  closeAll(b);
}
log('done');
