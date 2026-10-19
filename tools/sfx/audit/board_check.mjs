// The sound board in muted headless Edge at 360 px: gate, A/B rows, play every "지금" and "새것" button of the hit pass, look for errors, overflow, a screenshot.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
const { launch } = await import(new URL('../../edge/cdp.mjs', import.meta.url).href);
const SC = (process.env.AUDIT_OUT ?? path.join(os.tmpdir(), 'meow-sound-audit')).split(path.sep).join('/');
const b = await launch({ port: 9354, userDir: path.join(SC, 'profile-9354'), width: 360, height: 800 });
const dog = setTimeout(() => { console.error('WATCHDOG'); b.close(); process.exit(3); }, 600000);
try {
  const errors = [];
  await b.send('Log.enable');
  await b.goto('http://127.0.0.1:' + (process.env.AUDIT_VITE ?? 5254) + '/?scene=sounds');
  for (let i = 0; i < 60; i++) { await b.sleep(500); if (await b.eval('!!window.__soundboard').catch(() => false)) break; }
  await b.sleep(1500);
  console.log('page', JSON.stringify(await b.eval('JSON.stringify({ title: document.title, w: document.documentElement.scrollWidth, rows: document.querySelectorAll("[data-row]").length, ab: document.querySelectorAll(".sb-badge").length })')));
  // the gate: a real click on its button
  const gate = JSON.parse(await b.eval('JSON.stringify((() => { const r = document.querySelector("[data-act=unlock]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })())'));
  await b.click(gate.x, gate.y);
  for (let i = 0; i < 40; i++) { await b.sleep(500); const st = JSON.parse(await b.eval('JSON.stringify(window.__soundboard.stats())')); if (st.state === 'running') break; }
  console.log('engine', await b.eval('JSON.stringify((({ state, baked, total, sfxPlayed, bakedKB, budgetKB, evicted }) => ({ state, baked, total, sfxPlayed, bakedKB, budgetKB, evicted }))(window.__soundboard.stats()))'));
  // every "지금" and "새것" of the hit pass, one after the other, a pause between so that the engine's own limits do not drop the second
  const keys = JSON.parse(await b.eval('JSON.stringify([...document.querySelectorAll("[data-row]")].filter((r) => r.querySelector("[data-act=new]")).map((r) => r.getAttribute("data-row")))'));
  console.log('rows with 새것:', keys.length);
  let pressed = 0;
  const before = JSON.parse(await b.eval('JSON.stringify(window.__soundboard.stats().sfxPlayed)'));
  for (const key of keys.filter((k) => !k.startsWith('skill:'))) {
    for (const act of ['now', 'new']) {
      const ok = await b.eval(`(() => { const el = document.querySelector('[data-row="${key}"] [data-act=${act}]'); if (!el) return false; el.click(); return true; })()`); if (!ok) { console.log('missing', key, act); continue; }
      pressed++;
      await b.sleep(140);
    }
  }
  await b.sleep(3000);
  const st = JSON.parse(await b.eval('JSON.stringify(window.__soundboard.stats())'));
  console.log('pressed', pressed, 'played by the engine', st.sfxPlayed - before, 'dropped', JSON.stringify(st.sfxDropped), 'baked', st.baked, '/', st.total, 'KB', st.bakedKB, '/', st.budgetKB, 'evicted', st.evicted);
  // an A/B row, looked at
  await b.eval('document.querySelector("[data-row=\\"imp_w_sword\\"]").scrollIntoView({ block: "start" })');
  await b.sleep(400);
  await b.shot(`${SC}/board_sword.png`);
  console.log('overflow', await b.eval('document.documentElement.scrollWidth + " vs " + window.innerWidth'));
  const logs = b.events.filter((e) => e.method === 'Log.entryAdded' && ['error', 'warning'].includes(e.params.entry.level)).map((e) => e.params.entry.level + ': ' + e.params.entry.text);
  const exc = b.events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.text + ' ' + (e.params.exceptionDetails.exception?.description ?? ''));
  console.log('log errors/warnings', JSON.stringify(logs.slice(0, 8)), 'exceptions', JSON.stringify(exc.slice(0, 5)));
} finally { clearTimeout(dog); b.close(); }
