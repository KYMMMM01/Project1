// Helpers on top of cdp.mjs for looking at the game in headless Edge (muted) when the Aside browser is not running.
//   await withGame('?scene=home&tab=shop', async (b) => {          // dev server on GAME_PORT (default 5173), or { dist: 'dir' }
//     await b.eval('window.__dbg.meta.finishRuns(3)');  await settle(b);
//     await scrollTo(b, '/^테두리$/');  await b.shot(out('shop-frame'));
//   }, { dist: '.shots/dist-qa' });
// Every position these helpers return is in viewport CSS pixels, the unit of b.click. An eval must return plain data: prefix
// calls that return game objects with `void`. docs/기능지도.md lists the screens, the URL routes and the window.__dbg hooks.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './cdp.mjs';

export const OUT = path.resolve(process.env.EDGE_OUT ?? './.shots/edge');
export const out = (name) => { fs.mkdirSync(OUT, { recursive: true }); return path.join(OUT, name + '.png'); };

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');

/** Build the web game into `dir` (debug hooks come with ?debug=1) unless a build newer than every file under src is there. */
export function buildDist(dir) {
  const index = path.join(dir, 'index.html');
  if (fs.existsSync(index) && fs.statSync(index).mtimeMs > newest(path.join(ROOT, 'src'))) return;
  execFileSync(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', path.resolve(dir), '--emptyOutDir'], { cwd: ROOT, stdio: 'inherit' });
}

function newest(dir) {
  return Math.max(...fs.readdirSync(dir, { withFileTypes: true }).map((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs;
  }));
}

/** Serve a built `dir` with vite preview on `port`; resolves when it answers. Close it with the returned close(). */
export async function serveDist(dir, port = 5177) {
  const base = `http://127.0.0.1:${port}`;
  // A server already on the port (one left by an earlier run, or another run) would answer with its own build.
  if (await fetch(base + '/').then(() => true, () => false)) throw new Error(`port ${port} is taken (a server left by an earlier run?): pass another distPort or stop it`);
  const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', path.resolve(dir), '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  let exited = false;
  srv.on('exit', () => { exited = true; });
  for (let i = 0; i < 100; i++) {
    if (exited) throw new Error(`vite preview of ${dir} quit before it answered on ${port}`);
    try { if ((await fetch(base + '/')).ok) return { base, close: () => srv.kill() }; } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  srv.kill();
  throw new Error(`vite preview of ${dir} did not answer on ${port}`);
}

/**
 * Open the game at `query` and wait until the boot is done (the meta cheats and the system hooks are installed) and `ready`, an
 * expression evaluated in the page, is true. `base` is the server (the dev server by default); ?debug=1 is added when missing.
 * The sound board and the diagnostics page (?scene=sounds, ?scene=diag) start no game and have no hooks: open those with launch.
 */
export async function openGame(query, { base = `http://127.0.0.1:${process.env.GAME_PORT ?? 5173}`, ready = 'true', width = 450, height = 900, port = 9351 } = {}) {
  const b = await launch({ port, userDir: path.join(OUT, 'profile-' + port), width, height });
  try {
    const q = /[?&]debug\b/.test(query) ? query : query + (query.includes('?') ? '&' : '?') + 'debug=1';
    await b.goto(`${base}/${q}`);
    // A ?demo= gallery boots no app, so it has no meta or system hooks to wait for.
    const booted = `!!(window.__dbg && window.__dbg.game && (window.__dbg.routine || /[?&]demo=/.test(location.search))) && (${ready})`;
    let up = false;
    for (let i = 0; i < 80 && !up; i++) {
      await b.sleep(500);
      up = await b.eval(booted).catch(() => false);
    }
    if (!up) throw new Error(`the game at ${q} did not boot in 40 s (no window.__dbg hooks, or ready never true: ${ready})`);
    await b.sleep(1500);
    return b;
  } catch (e) {
    b.close();
    throw e;
  }
}

/**
 * Open the game, run `fn(b)`, and always close the browser (and the dist server): a browser left behind spins at full CPU.
 * `opts.dist` serves (and if needed builds) that folder instead of using the dev server.
 */
export async function withGame(query, fn, opts = {}) {
  const { dist, ...rest } = opts;
  let srv = null;
  let b = null;
  try {
    if (dist) { buildDist(dist); srv = await serveDist(dist, opts.distPort); }
    b = await openGame(query, srv ? { ...rest, base: srv.base } : rest);
    return await fn(b);
  } finally {
    for (const e of b?.events ?? []) if (e.method === 'Runtime.exceptionThrown') console.log('page exception:', (e.params.exceptionDetails.exception?.description ?? '').slice(0, 300));
    b?.close();
    srv?.close();
  }
}

/**
 * Nothing pops up by itself any more: every announcement counted as made, every guidebook topic as read, the popups closed, and a
 * first-encounter card that is already up answered. Waits until the screen stays quiet. Call it again after a cheat that unlocks,
 * and once a sandbox battle is open. A ?demo= gallery has no announcements: nothing to do there.
 */
export async function settle(b) {
  if (!(await b.eval('!!window.__dbg?.routine'))) return;
  for (let calm = 0, i = 0; calm < 2 && i < 12; i++) {
    const open = await b.eval('window.__dbg.routine.markSeen()');
    const card = await textCentre(b, '/^(알겠어요|Got it)$/');
    if (card) await b.click(card.x, card.y);
    calm = open === 0 && !card ? calm + 1 : 0;
    await b.sleep(700);
  }
}

/** Older name of settle, kept for the scripts that call it. */
export const quiet = settle;

/**
 * Centre (x, y) and size of the topmost text matching `re` (a regex literal as a string, e.g. '/^사기$/') that is in view, or null.
 * A text scrolled out of its list does not count: bring it up with scrollTo first.
 */
export async function textCentre(b, re) {
  return b.eval(`(() => { const t = window.__dbg.texts(${re}).find((m) => m.inView); return t ? { text: t.text, x: t.cx, y: t.cy, w: t.w, h: t.h } : null; })()`);
}

/** Scroll the scroll view that holds the topmost text matching `re` so it sits near the top; false when no scroll view holds it. */
export async function scrollTo(b, re) {
  const ok = await b.eval(`window.__dbg.scrollTo(${re})`);
  await b.sleep(400);
  return ok;
}

/** Click the topmost text matching `re` that is in view; false when there is none. */
export async function tapText(b, re) {
  const p = await textCentre(b, re);
  if (p) await b.click(p.x, p.y);
  return !!p;
}

export const state = (b) => b.eval(`JSON.stringify((() => { const d = window.__dbg.meta.profile.data; return { gems: d.gems, gold: d.gold, chests: d.chests, reveals: d.reveals.length, errors: window.__errors }; })())`);
