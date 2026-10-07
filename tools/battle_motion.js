// Frame-by-frame motion capture for the battle, driven by the Aside runner (see tools/battle_motion.sh).
// Prepended to a moment script; adds to the runner prelude (openGame, tap, drag, ev, sleep, done):
//   await mcOpen(query)                     open the game, full motion on, real time stopped, sound calls logged, 3 s warm-up, first-run lesson card dismissed
//   await mcBegin({ region:[x,y,w,h], scale })   start a strip (design-space crop, tile px per design unit)
//   await mcSnap(label)                     render now and add a tile
//   await mcRun(n, dt, { every })           advance n steps of dt seconds with the game's own tick, one tile per `every` steps
//   await mcWarp(seconds)                   advance without tiles (set-up)
//   await mcSave(name, { cols })            tile everything into shots/<name>.png
// Tiles carry the elapsed time and every audio call made since the previous tile, so the frame where a sound
// fires can be read straight off the strip.

// The REPL refuses scripts that contain the module-loading keyword, so the page-side loader is spelled in pieces.
const LOADER = 'return ' + 'imp' + 'ort(u)';
// Vite serves modules the app already loaded under a timestamped URL; a plain path would be a second instance with its own state.
const RESOLVE = `(p) => { const hit = performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes(p + '?')); return hit || p; }`;

function mcPage(L, R) {
  const resolve = (0, eval)(R);
  const imp = (p) => new Function('u', L)(resolve(p));
  const game = window.__dbg.game;
  const mc = (window.__mc = { t: 0, tiles: [], sounds: [], log: [], region: [0, 0, 720, 1280], scale: 0.5 });
  const yieldNow = () =>
    new Promise((r) => {
      const c = new MessageChannel();
      c.port1.onmessage = () => r();
      c.port2.postMessage(0);
    });
  mc.warp = async (seconds, dt) => {
    const step = dt || 1 / 30;
    for (let t = 0; t < seconds - 1e-6; t += step) {
      game.tick(step);
      mc.t += step;
      await yieldNow();
    }
    mc.sounds.length = 0;
    // Pointer hit-testing needs a rendered frame to exist; the stopped ticker never made one.
    game.app.render();
  };
  mc.snap = (label) => {
    game.app.render();
    const [rx, ry, rw, rh] = mc.region;
    const src = game.app.canvas;
    const k = src.width / game.w;
    const tw = Math.round(rw * mc.scale);
    const th = Math.round(rh * mc.scale);
    const c = document.createElement('canvas');
    c.width = tw;
    c.height = th + 16;
    const g = c.getContext('2d');
    g.fillStyle = '#222';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(src, rx * k, ry * k, rw * k, rh * k, 0, 16, tw, th);
    g.fillStyle = '#fff';
    g.font = '11px monospace';
    const snd = mc.sounds.splice(0).join(' ');
    g.fillText(label + (snd ? '  ♪ ' + snd : ''), 3, 12, tw - 6);
    mc.tiles.push(c);
  };
  mc.run = async (n, dt, every) => {
    const e = every || 1;
    for (let i = 1; i <= n; i++) {
      game.tick(dt);
      mc.t += dt;
      await yieldNow();
      if (i % e === 0) mc.snap('t+' + (i * dt).toFixed(2));
    }
  };
  // Advance until a simulation event passes `filter` (source text of a predicate, or null); report where the actors stand.
  mc.until = async (name, filterSrc, max) => {
    const dbg = window.__dbg.battle;
    const filter = filterSrc ? (0, eval)(filterSrc) : () => true;
    let hit = null;
    const off = dbg.battle.events.on(name, (e) => {
      if (!hit && filter(e)) hit = e;
    });
    for (let t = 0; t < max && !hit; t += 1 / 30) {
      mc.sounds.length = 0;
      game.tick(1 / 30);
      mc.t += 1 / 30;
      await yieldNow();
    }
    if (typeof off === 'function') off();
    if (!hit) return null;
    const pos = (v) => {
      if (!v) return null;
      const p = v.getGlobalPosition();
      return [Math.round(p.x / game.scale), Math.round(p.y / game.scale)];
    };
    const list = hit.enemy ? [hit.enemy] : dbg.battle.enemies || [];
    const at = hit.unit ? pos(dbg.ctx.unitView(hit.unit.uid)) : null;
    const spots = list.map((e) => pos(dbg.ctx.enemyView(e.uid))).filter(Boolean);
    if (at) spots.sort((a, b) => Math.hypot(a[0] - at[0], a[1] - at[1]) - Math.hypot(b[0] - at[0], b[1] - at[1]));
    return { id: hit.unit ? hit.unit.id : null, unit: at, enemies: spots.slice(0, 3) };
  };
  mc.out = (cols) => {
    const t = mc.tiles;
    const w = t[0].width;
    const h = t[0].height;
    const rows = Math.ceil(t.length / cols);
    const c = document.createElement('canvas');
    c.width = w * Math.min(cols, t.length);
    c.height = h * rows;
    const g = c.getContext('2d');
    t.forEach((tile, i) => g.drawImage(tile, (i % cols) * w, Math.floor(i / cols) * h));
    return c.toDataURL('image/png');
  };
  // Sound log: wraps the engine's one-shot, stinger and music entry points.
  return imp('/src/audio/index.ts').then(({ audio }) => {
    for (const fn of ['play', 'playStep', 'stinger', 'music']) {
      const orig = audio[fn];
      if (typeof orig !== 'function') continue;
      audio[fn] = function (...a) {
        const name = fn === 'play' ? String(a[0]) : fn + ':' + String(a[0]);
        mc.sounds.push(name);
        mc.log.push(mc.t.toFixed(2) + ' ' + name);
        return orig.apply(audio, a);
      };
    }
  });
}

async function mcInit() {
  await ev(async ([L, R]) => {
    const resolve = (0, eval)(R);
    const imp = (p) => new Function('u', L)(resolve(p));
    const m = await imp('/src/ui/motion.ts');
    m.motion.reduced = false;
    const s = await imp('/src/fx/settings.ts');
    s.setFxSettings({ reducedMotion: false });
    window.__dbg.game.app.ticker.stop();
  }, [LOADER, RESOLVE]);
  await ev(([src, L, R]) => (0, eval)('(' + src + ')')(L, R), [mcPage.toString(), LOADER, RESOLVE]);
}
async function mcBegin(o) {
  await ev((o) => {
    const mc = window.__mc;
    mc.tiles.length = 0;
    mc.region = o.region || [0, 0, 720, 1280];
    mc.scale = o.scale || 0.5;
    mc.t = 0;
  }, o);
}
async function mcSnap(label) {
  await ev((l) => window.__mc.snap(l), label);
}
async function mcRun(n, dt, o = {}) {
  await ev((a) => window.__mc.run(a.n, a.dt, a.every), { n, dt, every: o.every || 1 });
}
async function mcWarp(seconds, dt) {
  await ev((a) => window.__mc.warp(a.seconds, a.dt), { seconds, dt });
}
async function mcUntil(name, filter, max = 8) {
  return await ev((a) => window.__mc.until(a.name, a.filter, a.max), { name, filter: filter ? filter.toString() : null, max });
}
// A region (design space) around some points, at least minW x minH, plus the tile scale that makes it `tileW` px wide.
function mcBox(points, margin = 90, minW = 320, minH = 280, tileW = 300) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs) - margin;
  const x1 = Math.max(...xs) + margin;
  const y0 = Math.min(...ys) - margin;
  const y1 = Math.max(...ys) + margin;
  const w = Math.max(minW, x1 - x0);
  const h = Math.max(minH, y1 - y0);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return { region: [Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h)], scale: tileW / w };
}
async function mcSave(name, o = {}) {
  const url = await ev((c) => window.__mc.out(c), o.cols || 5);
  await fs.mkdir('./shots', { recursive: true });
  await fs.writeFile('./shots/' + name + '.png', Buffer.from(url.split(',')[1], 'base64'));
  console.log('STRIP ' + name);
}
// Every audio call since the last read, with the time it was made (the strip labels clip on narrow tiles).
async function mcLog() {
  return (await ev(() => window.__mc.log.splice(0))).join(' | ');
}
async function mcOpen(query) {
  await openGame(query);
  await mcInit();
  await mcWarp(3);
  await mcDismiss();
}

// The first-run lessons open a card over a sandbox battle and hold the pause: skip them and close the card (its button is at design 144, 1040 on a 1280 screen).
async function mcDismiss() {
  await ev(() => window.__dbg.lessons?.progress?.markSkipped?.());
  const held = await ev(() => (window.__dbg.battle ? window.__dbg.battle.scene.pauseReasons().includes('popup') : false));
  if (!held) return;
  await mcMouse('down', 144, 1040);
  await mcMouse('up', 144, 1040);
  await mcWarp(0.5);
}

// Design-space position of a board cat's feet, from its live view.
async function mcCat(cell) {
  return await ev((c) => {
    const d = window.__dbg.battle;
    const u = d.battle.units[c];
    const p = d.ctx.unitView(u.uid).getGlobalPosition();
    const k = window.__dbg.game.scale;
    return [Math.round(p.x / k), Math.round(p.y / k)];
  }, cell);
}
async function mcMouse(kind, x, y, steps) {
  const p = await toClient(x, y);
  if (kind === 'move') await G.page.mouse.move(p.x, p.y, { steps: steps || 1 });
  else if (kind === 'down') { await G.page.mouse.move(p.x, p.y); await G.page.mouse.down(); }
  else await G.page.mouse.up();
}
