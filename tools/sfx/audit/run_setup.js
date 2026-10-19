(async () => {
  const d = window.__dbg.battle;
  const game = window.__dbg.game;
  const api = window.__dbg.audio.api;
  const { createBot } = await import('/src/game/sim/bots.ts');
  const A = (window.__A = { log: [], req: [], T: 0, frames: 0, errors: [], marks: [], calls: [] });
  Error.stackTraceLimit = 12;
  const where = () => {
    const s = (new Error().stack || '').split(String.fromCharCode(10));
    const names = [];
    for (let i = 2; i < s.length; i++) {
      const m = /\/src\/([^?:)]+)[^:]*:(\d+)/.exec(s[i] || '');
      if (!m) continue;
      const f = m[1].replace(/^view\/director\//, 'dir/');
      if (f === 'dir/stage.ts') continue;
      names.push(f + ':' + m[2]);
      if (names.length === 2) break;
    }
    return [names[0] || '?', names[1] || '?'];
  };
  const origPlay = api.play.bind(api), origStep = api.playStep.bind(api), origSt = api.stinger.bind(api), origDuck = api.duck.bind(api), origMusic = api.music.bind(api);
  // (the pan of a call, when it has one, is the eighth element and its delay the ninth: the skills' sounds of 2026-10-19 are placed from side to side and a few start a beat after another)
  api.play = (id, o) => { A.log.push([+A.T.toFixed(4), id, o && o.volume !== undefined ? +o.volume.toFixed(3) : 1, o && o.pitch !== undefined ? +o.pitch.toFixed(3) : 1, -1, ...where(), o && o.pan !== undefined ? o.pan : 0, o && o.delay !== undefined ? o.delay : 0]); return origPlay(id, o); };
  api.playStep = (id, step, o) => { A.log.push([+A.T.toFixed(4), id, o && o.volume !== undefined ? +o.volume.toFixed(3) : 1, o && o.pitch !== undefined ? +o.pitch.toFixed(3) : 1, step, ...where(), o && o.pan !== undefined ? o.pan : 0, o && o.delay !== undefined ? o.delay : 0]); return origStep(id, step, o); };
  api.stinger = (id) => { A.calls.push([+A.T.toFixed(3), 'stinger', id]); return origSt(id); };
  api.duck = (depth, secs) => { A.calls.push([+A.T.toFixed(3), 'duck', +depth.toFixed(2), +secs.toFixed(2)]); return origDuck(depth, secs); };
  api.music = (id, f) => { A.calls.push([+A.T.toFixed(3), 'music', id]); return origMusic(id, f); };
  // every request a director handler makes of the stage, before the stage's own admission rule: [time, id, allowed, rule, call site]
  const { Stage } = await import('/src/view/director/stage.ts');
  const ruleName = (st, rule) => { for (const k of Object.keys(st.rules)) if (st.rules[k] === rule) return k; return '?'; };
  const callsite = () => {
    const s = (new Error().stack || '').split(String.fromCharCode(10));
    for (let i = 2; i < s.length; i++) {
      const m = /\/src\/([^?:)]+)[^:]*:(\d+)/.exec(s[i] || '');
      if (!m) continue;
      const f = m[1].replace(/^view\/director\//, 'dir/');
      if (f === 'dir/stage.ts') continue;
      return f + ':' + m[2];
    }
    return '?';
  };
  const sp = Stage.prototype.play, sps = Stage.prototype.playStep;
  Stage.prototype.play = function (rule, id, ...rest) { const ok = sp.call(this, rule, id, ...rest); A.req.push([+A.T.toFixed(3), id, ok ? 1 : 0, ruleName(this, rule), callsite()]); return ok; };
  Stage.prototype.playStep = function (rule, id, step, ...rest) { const ok = sps.call(this, rule, id, step, ...rest); A.req.push([+A.T.toFixed(3), id, ok ? 1 : 0, ruleName(this, rule), callsite()]); return ok; };
  A.bot = createBot('synergy', 14);
  A.d = d;
  // let the page's own loop go quiet: only our updates move the battle
  game.app.ticker.stop();
  window.addEventListener('error', (e) => A.errors.push(String(e.message)));
  return 'ok';
})()
