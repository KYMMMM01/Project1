#!/usr/bin/env bash
# Drive the running dev build in the Aside browser and collect screenshots.
#   tools/aside_run.sh <script.js | "inline js">  [out_dir]
# (Element screenshots are cropped from a full-page capture by tools/crop_shots.py.)
# The script runs inside `aside repl` (Playwright-style) after this prelude, which provides:
#   await openGame(query?)   open http://127.0.0.1:5173/<query> and wait for boot
#   await shot(name)         screenshot the game canvas -> <out_dir>/<name>.png
#   await tap(x, y)          click at DESIGN coordinates (720-wide space)
#   await drag(x0,y0,x1,y1)  press-move-release in design coordinates
#   await ev(fn, arg)        page.evaluate
#   await done()             print captured page errors and close the tab (always call last)
set -u
SRC="${1:?script file or inline js}"
OUT="${2:-${SHOT_DIR:-./.shots}}"
PORT="${GAME_PORT:-5173}"
if [ -f "$SRC" ]; then BODY="$(cat "$SRC")"; else BODY="$SRC"; fi
PRELUDE="
const G = { page: null, dir: (typeof pwd === 'function' ? pwd() : pwd) };
async function openGame(query = '') { G.page = await openTab('http://127.0.0.1:${PORT}/' + query); for (let i = 0; i < 40; i++) { const ok = await G.page.evaluate(() => document.getElementById('boot')?.classList.contains('hide')); if (ok) break; await sleep(250); } await sleep(300); return G.page; }
async function shot(name) { await fs.mkdir('./shots', { recursive: true }); const r = await G.page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, dpr: devicePixelRatio }; }); await G.page.screenshot({ path: './shots/' + name + '.png' }); await fs.writeFile('./shots/' + name + '.json', JSON.stringify(r)); console.log('SHOT ' + name); }
async function toClient(x, y) { return await G.page.evaluate(([a, b]) => window.__dbg.toClient(a, b), [x, y]); }
async function tap(x, y) { const p = await toClient(x, y); await G.page.mouse.click(p.x, p.y); }
async function drag(x0, y0, x1, y1, steps = 8) { const a = await toClient(x0, y0); const b = await toClient(x1, y1); await G.page.mouse.move(a.x, a.y); await G.page.mouse.down(); await G.page.mouse.move(b.x, b.y, { steps }); await G.page.mouse.up(); }
async function ev(fn, arg) { return await G.page.evaluate(fn, arg); }
async function done() { try { const e = await G.page.evaluate(() => window.__errors || []); console.log('PAGE_ERRORS ' + JSON.stringify(e)); } catch (err) { console.log('PAGE_ERRORS unavailable: ' + err.message); } await closeTab(G.page); console.log('SESSION_DIR=' + G.dir); }
"
LOG="$(aside repl "${PRELUDE}
try {
${BODY}
} catch (err) { console.log('SCRIPT_ERROR ' + (err && err.stack || err)); try { await done(); } catch (e2) {} }
" 2>&1 | grep -v 'is available')"
echo "$LOG" | grep -v '^\[system\]' 
DIR="$(echo "$LOG" | sed -n 's/^SESSION_DIR=//p' | tail -1 | tr -d '\r')"
if [ -n "$DIR" ]; then
  DIR_U="$(cygpath -u "$DIR" 2>/dev/null || echo "$DIR")"
  if [ -d "$DIR_U/shots" ]; then
    mkdir -p "$OUT"
    # Element screenshots are mis-clipped in Aside, so crop the full-page capture to the canvas here.
    python "$(dirname "$0")/crop_shots.py" "$(cygpath -w "$DIR_U/shots" 2>/dev/null || echo "$DIR_U/shots")" "$(cygpath -w "$OUT" 2>/dev/null || echo "$OUT")"
  fi
fi
