// What each tap on the home screen costs, and the peak inside it: tabs, settings, a cat's page, the odds, the calendar.   node screens.mjs <tag> <port>
import { open, waitFor, installPageHelpers, closeAll, mb, save } from './lib.mjs';
const tag = process.argv[2];
const port = Number(process.argv[3]);
const b = await open(`http://127.0.0.1:${port}/Project1/?debug=1&scene=home&lang=ko&fresh=1&notitle=1&sp=1`, { tag: 'scr' + tag });
const rows = [];
try {
  await waitFor(b, '!!(window.__dbg && window.__dbg.game && window.__dbg.game.app && window.__dbg.home && window.__dbg.routine)');
  await b.sleep(3500);
  await installPageHelpers(b);
  await b.eval('window.__dbg.routine.markSeen(); window.__dbg.meta.addGems(5000); window.__dbg.meta.addGold(5000); window.__dbg.meta.addCards(30); 1');
  await b.click(195, 6);
  await b.sleep(3500);
  const reset = () => b.eval('(() => { const G = window.__trk.gl; G.peak = G.total; G.rbPeak = G.rbTotal; return 1; })()');
  const led = async (label, ms = 2500) => {
    await b.sleep(ms);
    const p = JSON.parse(await b.eval('JSON.stringify(window.__page())'));
    const r = b.mon.latest()?.by ?? {};
    const row = { label, tex: mb(p.gl.texBytes), rb: mb(p.gl.rbBytes), texPeak: mb(p.gl.texPeak), rbPeak: mb(p.gl.rbPeak), nTex: p.gl.textures, nRb: p.gl.rbAll, js: mb(p.perfMemory?.used ?? 0), R: mb(r.renderer?.priv ?? 0, 0), G: mb(r['gpu-process']?.priv ?? 0, 0), released: p.gl.created - p.gl.deleted };
    rows.push(row);
    console.log(label.padEnd(24), `tex ${row.tex} (peak ${row.texPeak})  rb ${row.rb} (peak ${row.rbPeak})  tex/rb live ${row.nTex}/${row.nRb}  js ${row.js}  R${row.R} G${row.G}`);
  };
  await led('home idle', 500);
  const act = async (label, expr, ms) => { await reset(); await b.eval(expr); await led(label, ms); };
  for (const t of ['shop', 'cats', 'missions', 'pass', 'battle']) await act('tab ' + t, `window.__dbg.home.goTab('${t}'); 1`, 2500);
  await act('settings', 'window.__dbg.routine.openSettings(); 1', 3000);
  await act('settings closed', 'window.__dbg.routine.popups.closeAll(); 1', 1500);
  await act('cat page', "window.__dbg.collection.openUnit('w_viking'); 1", 3000);
  await act('cat page closed', 'window.__dbg.routine.popups.closeAll(); 1', 1500);
  await act('odds', "window.__dbg.collection.openOdds('wooden'); 1", 3000);
  await act('odds closed', 'window.__dbg.routine.popups.closeAll(); 1', 1500);
  await act('calendar', 'window.__dbg.routine.openCalendar(); 1', 3000);
  await act('calendar closed', 'window.__dbg.routine.popups.closeAll(); 1', 1500);
  console.log('errors', JSON.stringify(await b.eval('window.__errors')).slice(0, 400));
  save(`screens_${tag}.json`, { rows });
} catch (e) { console.log('FAILED', e.stack ?? e); } finally { closeAll(b); }
