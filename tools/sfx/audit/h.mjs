// Harness of the sound audit (docs/qa/sound_audit_2026-10-18.md). Everything here MEASURES; nothing plays: the browser is launched muted
// (tools/edge/cdp.mjs passes --mute-audio) and the page only renders buffers offline (OfflineAudioContext).
//
// Order of use (each script prints what it did; results go to AUDIT_OUT, default <tmp>/meow-sound-audit):
//   1. a dev server:  npx vite --port 5252 --host 127.0.0.1        (env AUDIT_VITE to change the port; the CDP port is AUDIT_CDP, default 9352)
//   2. node tools/sfx/audit/measure.mjs        every baked sound, offline: length, peak, loudness (K-weighted), centroid, bands, attack, punch -> measure.json
//      node tools/sfx/audit/measure_cand.mjs   the same for the 208 Kenney candidate files of the sound board -> measure_cand.json
//   3. node tools/sfx/audit/run_battle.mjs <name> <chapter> <level> <maxFrames> <fillers 0|1|2>   a scripted 3x chapter (12 skill cats on the board, the page's own
//      loop stopped, game.tick at 1/30 s) that records every audio call and every request the director's rules saw -> <name>.json
//      node tools/sfx/audit/run_skills.mjs <skill>   one skill cast alone at 1x (a fresh browser each) -> skills_now_<skill>.json
//   4. node tools/sfx/audit/mixall.mjs         replays the runs through the engine's own VoiceLimiter and renders the busiest and a median second with the music
//   5. analyze_run.mjs, req2.mjs, eff.mjs, gen_tables.mjs   tables from the files above (node only)
// Recorded 2026-10-18 (before any sound was changed): tools/sfx/audit/data/*.json.gz (gunzip into AUDIT_OUT). `measure` = every sound, `ch1 ch3 ch5 hard5 hard2` = the five 3x chapter runs
// (every audio call and director request, with times), `skills_now_*` = each skill cast alone, `mixall` / `skills_stack` / `skill_render` = the renders. Replay the SAME runs through a changed
// engine with mixall.mjs to compare like with like; measure.mjs again gives the "after" for appendix A of the audit.
// Lines in the page code that read `/src/...` need the dev server; the real engine, recipes, limiter, graph and music player are imported, not copied.
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { launch } = await import(new URL('../../edge/cdp.mjs', import.meta.url).href);
export const SC = (process.env.AUDIT_OUT ?? path.join(os.tmpdir(), 'meow-sound-audit')).split(path.sep).join('/');
fs.mkdirSync(SC, { recursive: true });
export const PAGE = here.split(path.sep).join('/');
const VITE = Number(process.env.AUDIT_VITE ?? 5252), CDP = Number(process.env.AUDIT_CDP ?? 9352);
// Vite's hot-reload socket is stubbed: a file edit by another agent must not reload the page in the middle of a measurement.
const STUB = `(() => { const W = window.WebSocket; window.WebSocket = new Proxy(W, { construct(t, args) { if (args[1] === 'vite-hmr' || (Array.isArray(args[1]) && args[1].includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 3 }; return new t(...args); } }); })();`;
export async function open(query, { width = 450, height = 900, ready = '!!(window.__dbg && window.__dbg.audio)', wait = 60 } = {}) {
  const b = await launch({ port: CDP, userDir: path.join(SC, 'profile-' + CDP), width, height });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  await b.goto(`http://127.0.0.1:${VITE}/${query}`);
  for (let i = 0; i < wait; i++) {
    await b.sleep(500);
    if (await b.eval(ready).catch(() => false)) break;
  }
  await b.sleep(800);
  const dog = setTimeout(() => { console.error('WATCHDOG: closing'); b.close(); process.exit(3); }, +(process.env.DOG_MS || 900000));
  const close = b.close.bind(b);
  b.close = () => { clearTimeout(dog); close(); };
  return b;
}
export const save = (name, data) => fs.writeFileSync(`${SC}/${name}`, typeof data === 'string' ? data : JSON.stringify(data));
