// node report.mjs [full|combat] : the engine's own quality report (bake + measure every sound), in muted headless Edge.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
const { launch } = await import(new URL('../../edge/cdp.mjs', import.meta.url).href);
const SC = (process.env.AUDIT_OUT ?? path.join(os.tmpdir(), 'meow-sound-audit')).split(path.sep).join('/');
const mode = process.argv[2] || 'full';
const STUB = `(() => { const W = window.WebSocket; window.WebSocket = new Proxy(W, { construct(t, args) { if (args[1] === 'vite-hmr' || (Array.isArray(args[1]) && args[1].includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 3 }; return new t(...args); } }); })();`;
const b = await launch({ port: Number(process.env.HM_CDP ?? 9354), userDir: path.join(SC, 'profile-9354'), width: 900, height: 700 });
const dog = setTimeout(() => { console.error('WATCHDOG'); b.close(); process.exit(3); }, 600000);
try {
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  await b.goto(`http://127.0.0.1:${process.env.HM_VITE ?? 5254}/?debug=1&demo=audio`);
  for (let i = 0; i < 80; i++) { await b.sleep(500); if (await b.eval('!!(window.__dbg && window.__dbg.audio)').catch(() => false)) break; }
  const r = JSON.parse(await b.eval(`(async () => { const r = await window.__dbg.audio.${mode === 'combat' ? 'combat' : 'report'}(); return JSON.stringify(r); })()`));
  fs.writeFileSync(`${SC}/report_${mode}.json`, JSON.stringify(r));
  console.log('failing:', JSON.stringify(r.failing));
  if (r.memory) console.log('memory:', JSON.stringify(r.memory));
  console.log('checks:', (r.checks || []).length, 'failed:', (r.checks || []).filter((c) => !c.ok).map((c) => c.name + ' :: ' + c.detail).join('\n   '));
  if (r.closest) console.log('closest:', JSON.stringify(r.closest));
} finally { clearTimeout(dog); b.close(); }
