// Minimal CDP helper: launch headless Edge, attach to a page, evaluate, screenshot (no npm packages: Node 22+ has WebSocket and fetch).
// Written for QA when the Aside browser is not running. See lib.mjs for the game helpers and sheet.mjs for an example.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export async function launch({ port, userDir, width = 450, height = 900 }) {
  fs.mkdirSync(userDir, { recursive: true });
  const exe = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const child = spawn(exe, [
    '--headless=new', `--user-data-dir=${userDir}`, '--no-first-run', '--disable-extensions', `--remote-debugging-port=${port}`,
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
  ], { stdio: 'ignore', detached: false });
  let targets = null;
  for (let i = 0; i < 100; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  const page = targets?.find((t) => t.type === 'page');
  if (!page) { child.kill(); throw new Error('no page target'); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result); }
    else if (d.method) events.push(d);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
  const api = {
    send, events,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
      return r.result.value;
    },
    async goto(url) { await send('Page.navigate', { url }); },
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    async click(x, y) {
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    },
    async wheel(x, y, dy) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    // Killing the launcher alone leaves the renderer and GPU processes running (they then spin at full CPU for hours): stop every
    // Edge process that was started on this run's profile folder.
    close() {
      try { ws.close(); } catch {}
      try { child.kill(); } catch {}
      const key = path.basename(userDir).replace(/[^A-Za-z0-9_-]/g, '');
      try {
        execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -match '--headless' -and $_.CommandLine -match '${key}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' });
      } catch {}
    },
  };
  return api;
}
