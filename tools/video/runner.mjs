// Starts the local server (server.mjs) and a headless Edge on one of the pages in player/, and waits until the page says it is done.
// Used by build.mjs and analyze.mjs. Nothing here touches the game's dev server or any port other than VIDEO_PORT (default 5431).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '..', '..');
export const work = path.join(root, 'video', 'work');
const PORT = Number(process.env.VIDEO_PORT || 5431);

const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

export function findEdge() {
  for (const p of EDGE_CANDIDATES) if (fs.existsSync(p)) return p;
  throw new Error('msedge.exe not found; set EDGE_PATH');
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
}

/** Stops every msedge.exe whose command line names our scratch profile (a headless Edge leaves renderer and GPU processes behind). */
function killProfile(profile) {
  const needle = profile.replace(/'/g, "''");
  const script = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${needle}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  try { spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' }); } catch { /* nothing to stop */ }
}

/**
 * Runs `page` (a file name in tools/video/player, plus an optional query string) in headless Edge against a fresh server.
 * Resolves with { ok, events, log } when the page POSTs /finish; rejects on a page error event, on Edge dying early or on timeout.
 */
export async function runPage({ page, query = '', timeoutMs = 20 * 60 * 1000, env = {}, quiet = false, onEvent }) {
  fs.mkdirSync(work, { recursive: true });
  const profile = path.join(work, 'edge-profile');
  killProfile(profile);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  const log = [];
  const events = [];
  const server = spawn(process.execPath, [path.join(here, 'server.mjs')], {
    env: { ...process.env, VIDEO_PORT: String(PORT), VIDEO_TIMEOUT_MS: String(timeoutMs + 30000), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverExit = null;
  let failure = null;
  let lastEvent = Date.now();
  let buffered = '';
  const onLine = (line) => {
    log.push(line);
    lastEvent = Date.now();
    if (line.startsWith('EVENT ')) {
      let ev = null;
      try { ev = JSON.parse(line.slice(6)); } catch { /* not JSON */ }
      if (ev) {
        events.push(ev);
        if (ev.type === 'error' && !failure) failure = new Error('page error: ' + ev.message);
        if (onEvent) onEvent(ev);
      }
      const quietProgress = ev && ev.type === 'progress' && ev.frame % 300 !== 0;
      if (!quiet && !quietProgress) console.log(line.length > 600 ? line.slice(0, 600) + ' ...' : line);
    } else if (!quiet) console.log(line);
  };
  const feed = (chunk) => {
    buffered += chunk.toString('utf8');
    let i;
    while ((i = buffered.indexOf('\n')) >= 0) { onLine(buffered.slice(0, i).replace(/\r$/, '')); buffered = buffered.slice(i + 1); }
  };
  server.stdout.on('data', feed);
  server.stderr.on('data', feed);
  const exited = new Promise((resolve) => server.on('exit', (code) => { serverExit = code; resolve(code); }));

  const started = Date.now();
  while (!log.some((l) => l.startsWith('LISTENING'))) {
    if (serverExit !== null) throw new Error('server exited early (is port ' + PORT + ' in use?): ' + log.join(' | '));
    if (Date.now() - started > 10000) { killTree(server); throw new Error('server did not start'); }
    await new Promise((r) => setTimeout(r, 100));
  }

  const url = `http://127.0.0.1:${PORT}/player/${page}${query ? (query.startsWith('?') ? query : '?' + query) : ''}`;
  const edge = spawn(findEdge(), [
    '--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--window-size=1920,1080', '--hide-scrollbars', '--mute-audio', url,
  ], { stdio: 'ignore' });
  let edgeExit = null;
  edge.on('exit', (code) => { edgeExit = code; });

  const deadline = Date.now() + timeoutMs;
  const idleMs = Number(process.env.VIDEO_IDLE_MS || 240000);
  try {
    for (;;) {
      if (serverExit !== null) break;
      if (failure) throw failure;
      // headless Edge may hand the work to a child and exit its launcher with code 0, so its exit means nothing; silence does
      if (edgeExit !== null && edgeExit !== 0 && Date.now() - lastEvent > 5000) throw new Error('Edge exited (' + edgeExit + ') before the page finished');
      const limit = events.length ? idleMs : 45000; // a page that never says anything usually has a syntax error
      if (Date.now() - lastEvent > limit) throw new Error('the page has been silent for ' + Math.round(limit / 1000) + ' s');
      if (Date.now() > deadline) throw new Error('timeout after ' + Math.round(timeoutMs / 1000) + ' s');
      await new Promise((r) => setTimeout(r, 250));
    }
    await exited;
    if (failure) throw failure;
    return { ok: log.some((l) => l === 'FINISH'), events, log };
  } finally {
    killTree(edge);
    killTree(server);
    killProfile(profile);
  }
}
