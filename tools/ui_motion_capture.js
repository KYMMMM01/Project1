// Prelude for tools/ui_motion.sh, run inside `aside repl` after tools/aside_run.sh's own prelude.
// Frame-by-frame capture at full motion. Real time must not move the game, but the page has to keep
// producing frames or the browser cannot take a screenshot: so the ticker keeps running with speed 0
// (game.tick(0) every real frame) and the capture advances the game by hand, game.tick(dt), then
// shoots. tools/ui_motion_tile.py tiles the numbered shots into one labelled strip.
//
//   await scene('?scene=home&tab=battle')   open + full motion + freeze + settle
//   await adv(0.5)                          advance without a shot
//   await frames(12, { key: 'press', dt: 1/30, probe: '() => ...' })   tick + shoot, 12 times
//   await steps([1/60, 1/60, 1/30, 1/15], { key: 'k', tag: 'x' })      one shot per listed step
//   await sfxLog()                          sound calls since the last call, with capture time
//   await down(x, y); await up(); await tap(x, y)   real pointer events (design coordinates)
//
// Shots are named <key>_<index>_t<ms>[_<tag>][_p<probe>].png so the tiler can label them.
// The REPL refuses a script containing the module-load call, so the page-side call is assembled at run time.
// Vite serves a module that changed since the server started as <path>?t=<stamp>, and the app imports it
// under that exact URL: a plain import would be a second copy of the module (a second `motion`), so the
// URL is taken from the page's own resource list.
const IMP = "(p) => { const hit = performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes(p + '?') || n.endsWith(p)); return (0, eval)('im' + 'port(\"' + (hit || p) + '\")'); }";
async function motionOn() {
  await ev(async (impSrc) => {
    const imp = (0, eval)(impSrc);
    const m = await imp('/src/ui/motion.ts');
    const s = await imp('/src/fx/settings.ts');
    m.motion.reduced = false;
    s.fxSettings.reducedMotion = false;
    window.__dbg.game.app.ticker.speed = 0;
    const cap = (window.__cap = { t: 0, sfx: [] });
    // Sound calls are logged against the capture clock so the frame of the visual impact can be compared.
    const { audio } = await imp('/src/audio/index.ts');
    for (const k of ['play', 'stinger', 'playStep']) {
      const orig = audio[k].bind(audio);
      audio[k] = (...a) => { cap.sfx.push(cap.t.toFixed(2) + ' ' + k + ' ' + a[0]); orig(...a); };
    }
    cap.motion = m.motion.reduced;
  }, IMP);
}
async function sfxLog() {
  const l = await ev(() => { const a = window.__cap.sfx; window.__cap.sfx = []; return a; });
  console.log('SFX ' + (l.join(' | ') || '(none)'));
}
async function reducedOn() {
  await ev(async (impSrc) => {
    const imp = (0, eval)(impSrc);
    const m = await imp('/src/ui/motion.ts');
    const s = await imp('/src/fx/settings.ts');
    m.motion.reduced = true;
    s.fxSettings.reducedMotion = true;
  }, IMP);
}
// One tick at a time with the page's tasks let through in between: a promise continuation (a scene
// transition's `await tween.finished`, a reveal's choreography) only runs when the script yields.
async function adv(sec, dt = 1 / 30) {
  await ev(async ([sec, dt]) => {
    const g = window.__dbg.game;
    let n = Math.round(sec / dt);
    while (n-- > 0) {
      g.tick(dt);
      await new Promise((r) => setTimeout(r, 0));
    }
    window.__cap.t += sec;
  }, [sec, dt]);
}
async function scene(query, settle = 0.6) {
  await openGame(query);
  await motionOn();
  // The first scene arrives through a fade; run it out (in game time) before anything is captured.
  for (let i = 0; i < 40; i++) {
    await adv(0.1);
    if (!(await ev(() => window.__dbg.scenes.transitioning))) break;
  }
  await adv(settle);
  console.log('MOTION reduced=' + (await ev(() => window.__cap.motion)));
}
// frames(n, o): n equal steps of o.dt. steps(dts, o): one step per entry (dense where the motion is fast).
async function frames(n, o = {}) { return await steps(new Array(n).fill(o.dt ?? 1 / 30), o); }
const SHOT_IDX = {};
async function steps(dts, o = {}) {
  const key = o.key || 'f';
  const probes = [];
  for (let i = 0; i < dts.length; i++) {
    const dt = dts[i];
    const r = await ev(([dt, probe]) => {
      window.__dbg.game.tick(dt);
      window.__cap.t += dt;
      let p = '';
      if (probe) { try { p = String((0, eval)('(' + probe + ')')()); } catch (e) { p = '!' + e.message; } }
      return { t: Math.round(window.__cap.t * 1000), p };
    }, [dt, o.probe || '']);
    const tag = o.tag ? '_' + o.tag.replace(/[^A-Za-z0-9-]/g, '') : '';
    const p = r.p ? '_p' + r.p.replace(/[^A-Za-z0-9.\-]/g, '~') : '';
    await sleep(60);
    await shot(key + '_' + String(SHOT_IDX[key] = (SHOT_IDX[key] ?? -1) + 1).padStart(2, '0') + '_t' + r.t + tag + p);
    probes.push(r.p);
  }
  return probes;
}
async function down(x, y) { const p = await toClient(x, y); await G.page.mouse.move(p.x, p.y); await G.page.mouse.down(); }
async function up() { await G.page.mouse.up(); }
async function moveTo(x, y, steps = 4) { const p = await toClient(x, y); await G.page.mouse.move(p.x, p.y, { steps }); }
// Ask the wrapper (tools/ui_motion.sh) to tile the numbered shots of <key> once the run has ended.
function tile(key, region, cols = 6, cw = 250) { console.log('TILE ' + [key, region.join(','), cols, cw].join(' ')); }
// Design-space centre of a display object named by an expression ("window.__dbg.home.scene.host.tabs.battle.start").
async function posOf(expr) {
  return await ev((e) => { const o = (0, eval)(e); const p = o.getGlobalPosition(); const s = window.__dbg.game.scale; return { x: Math.round(p.x / s), y: Math.round(p.y / s) }; }, expr);
}
// Close every open popup and let the automatic ones queue up behind it come and go (the home scene opens
// "newly unlocked" / level-up sheets after the unlock-all cheat), until the screen has stayed clear.
async function closePopups() {
  let clear = 0;
  for (let i = 0; i < 14 && clear < 2; i++) {
    const open = await ev(async (impSrc) => {
      const imp = (0, eval)(impSrc);
      const { popups } = await imp('/src/ui/Popup.ts');
      const n = popups.count + popups.queued;
      if (n > 0) popups.closeAll();
      return n;
    }, IMP);
    clear = open === 0 ? clear + 1 : 0;
    await adv(1.1);
  }
}
// The Aside tab reports prefers-reduced-motion, and a component built while it was on keeps its loops off (the START
// bob, pulses, wiggles). Build the home scene again once full motion is on so every tab is built with motion.
async function reenterHome(tab = 'battle') {
  await ev(async ([impSrc, tab]) => {
    const imp = (0, eval)(impSrc);
    const { HomeScene } = await imp('/src/scenes/HomeScene.ts');
    void window.__dbg.scenes.goto(() => new HomeScene({ tab }), 'none');
  }, [IMP, tab]);
  await adv(0.3);
}
// A home scene on a rich profile: everything unlocked, plenty of every currency, cards for every cat.
async function richHome(query = '?scene=home&tab=battle&fresh=1') {
  await scene(query);
  await ev(() => { const m = window.__dbg.meta; m.unlockAll(); window.__dbg.routine?.markSeen?.(); m.addGold(20000); m.addGems(800); m.addTickets(5); m.addCards(40); });
  await adv(0.5);
  await reenterHome(new URLSearchParams(query).get('tab') || 'battle');
  await closePopups();
  await adv(0.6);
}
// The visible on-screen Text whose string contains `str`, as a design-space point: the one drawn last, or with pick 'top' / 'bottom' the highest / lowest.
async function textPos(str, pick = 'last') {
  return await ev(([s, pick]) => {
    const g = window.__dbg.game;
    const hits = [];
    const walk = (n, shown) => {
      const vis = shown && n.visible !== false && n.alpha > 0.05;
      if (!vis) return;
      if (typeof n.text === 'string' && n.text.includes(s)) {
        const p = n.getGlobalPosition();
        const x = p.x / g.scale, y = p.y / g.scale;
        if (x > 0 && x < g.w && y > 0 && y < g.h) hits.push({ x: Math.round(x), y: Math.round(y) });
      }
      if (n.children) for (const c of n.children) walk(c, vis);
    };
    walk(g.app.stage, true);
    if (!hits.length) return null;
    const best = pick === 'top' ? hits.reduce((a, b) => (b.y < a.y ? b : a)) : pick === 'bottom' ? hits.reduce((a, b) => (b.y > a.y ? b : a)) : hits[hits.length - 1];
    return { ...best, n: hits.length };
  }, [str, pick]);
}
async function tapText(str, pick = 'last') {
  const p = await textPos(str, pick);
  if (!p) throw new Error('no visible text: ' + str);
  await tap(p.x, p.y);
  return p;
}
