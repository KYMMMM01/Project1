// The landing review of the sound board (2026-10-19), muted headless Edge at 360 px (or BOARD_W): the gate, the three tabs, the A/B rows, the skill sections, the candidates tab; screenshots into AUDIT_OUT/board_*.png;
// which rows have "새것"; every request the page makes (the candidates must not be fetched before their tab is opened, the game's own sample files only after the first tap); console errors; overflow.
//   AUDIT_VITE=<port of a dev server> AUDIT_CDP=<free port> AUDIT_OUT=<folder> node tools/sfx/audit/board_qa.mjs [base-url-path, default /]
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
const { launch } = await import(new URL('../../edge/cdp.mjs', import.meta.url).href);
const SC = (process.env.AUDIT_OUT ?? path.join(os.tmpdir(), 'meow-sound-audit')).split(path.sep).join('/');
const W = Number(process.env.BOARD_W ?? 360), H = Number(process.env.BOARD_H ?? 800);
const PORT = Number(process.env.AUDIT_CDP ?? 9352);
const base = process.argv[2] ?? '/';
const b = await launch({ port: PORT, userDir: path.join(SC, 'profile-board-' + PORT), width: W, height: H });
const dog = setTimeout(() => { console.error('WATCHDOG'); b.close(); process.exit(3); }, 600000);
const shot = async (name) => { await b.sleep(350); await b.shot(`${SC}/board_${W}_${name}.png`); };
const ev = async (expr) => JSON.parse(await b.eval(`JSON.stringify(${expr})`));
const scrollTo = async (sel, block = 'start') => { await b.eval(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: ${JSON.stringify(block)} })`); await b.sleep(250); };
try {
  await b.send('Log.enable'); await b.send('Network.enable');
  await b.goto(`http://127.0.0.1:${process.env.AUDIT_VITE ?? 5252}${base}?scene=sounds`);
  for (let i = 0; i < 60; i++) { await b.sleep(500); if (await b.eval('!!window.__soundboard').catch(() => false)) break; }
  await b.sleep(1200);
  const reqs = () => b.events.filter((e) => e.method === 'Network.requestWillBeSent').map((e) => e.params.request.url);
  const wavsBefore = reqs().filter((u) => /\.wav(\?|$)/.test(u));
  console.log('page', JSON.stringify(await ev('({ title: document.title, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, rows: document.querySelectorAll("[data-row]").length })')));
  console.log('requests before the tap: wav files', wavsBefore.length, '| any audio request:', reqs().filter((u) => /\.(wav|ogg|mp3|m4a)(\?|$)/.test(u)).length);
  await shot('01_gate');
  const gate = await ev('(() => { const r = document.querySelector("[data-act=unlock]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height }; })()');
  console.log('gate button', JSON.stringify(gate));
  await b.click(gate.x, gate.y);
  for (let i = 0; i < 60; i++) { await b.sleep(500); const st = await ev('window.__soundboard.stats()'); if (st.state === 'running' && st.bakePending === 0) break; }
  await b.sleep(800);
  console.log('engine', JSON.stringify(await ev('(({ state, baked, total, bakePending, sfxPlayed, bakedKB, budgetKB }) => ({ state, baked, total, bakePending, sfxPlayed, bakedKB, budgetKB }))(window.__soundboard.stats())')));
  await shot('02_sfx_top');
  const sections = await ev('[...document.querySelectorAll(".sb-sec[id^=sec-]")].map((s) => ({ id: s.id, rows: s.querySelectorAll("[data-row]").length }))');
  console.log('sections', JSON.stringify(sections));
  const rows = await ev('[...document.querySelectorAll("[data-row]")].map((r) => ({ key: r.getAttribute("data-row"), ab: !!r.querySelector("[data-act=new]"), name: (r.querySelector("h3")?.textContent ?? "").trim(), minBtn: Math.min(...[...r.querySelectorAll("button")].map((x) => x.getBoundingClientRect().height)) }))');
  fs.writeFileSync(`${SC}/board_rows.json`, JSON.stringify(rows));
  console.log('rows', rows.length, 'with 새것', rows.filter((r) => r.ab).length, 'smallest button height', Math.min(...rows.map((r) => r.minBtn)));
  // a chip jumps to its section: the head of the section must end up under the sticky bar, not behind it
  for (const chip of ['skills', 'skillsingle', 'bosses']) {
    // (the page scrolls inside its own container, not the window)
    await b.eval('document.querySelectorAll("*").forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }); window.scrollTo(0, 0)'); await b.sleep(900);
    const p = await ev('(() => { const r = document.querySelector("[data-chip=' + chip + ']").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
    await b.click(p.x, p.y); await b.sleep(1600);
    const pos = await ev('(() => ({ barBottom: Math.round(document.querySelector(".sb-top").getBoundingClientRect().bottom), headTop: Math.round(document.querySelector("#sec-' + chip + '").getBoundingClientRect().top) }))()');
    console.log('chip', chip, JSON.stringify(pos), pos.headTop >= pos.barBottom - 2 ? 'ok (head under the bar)' : 'HEAD HIDDEN BEHIND THE BAR');
    if (chip === 'skills') await shot('02b_chip_skills');
  }
  await b.eval('document.querySelectorAll("*").forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }); window.scrollTo(0, 0)');
  if (process.env.PRESS_ALL) {
    // every play-like button of the effects tab, one after the other (a pause between, so that the engine's own limits do not drop the next): no error, no failed request, the engine plays
    const keys = await ev('[...document.querySelectorAll("[data-panel=sfx] [data-row]")].map((r) => [...r.querySelectorAll("button[data-act]")].map((x) => x.getAttribute("data-act") + "|" + r.getAttribute("data-row"))).flat()');
    const acts = {};
    const before = (await ev('window.__soundboard.stats()')).sfxPlayed;
    let pressed = 0;
    for (const k of keys) {
      const [act, row] = k.split('|');
      if (act === 'pick') continue;
      acts[act] = (acts[act] || 0) + 1;
      const ok = await b.eval(`(() => { const el = document.querySelector('[data-row="${row}"] [data-act=${act}]'); if (!el) return false; el.click(); return true; })()`);
      if (ok) pressed++;
      await b.sleep(110);
    }
    await b.sleep(3000);
    const st = await ev('window.__soundboard.stats()');
    console.log('pressed', pressed, 'by kind', JSON.stringify(acts), '| played by the engine', st.sfxPlayed - before, '| dropped by its rules', JSON.stringify(st.sfxDropped), '| baked', st.baked, '/', st.total, '| KB', st.bakedKB, '/', st.budgetKB, '| evicted', st.evicted);
    await b.eval('window.__soundboard.board && document.querySelector("[data-act=stop]")?.click()');
  }
  // looks: a cat's rows, an A/B row, the skills, the single skill sounds
  await scrollTo('[data-row="pair:w_samurai"]'); await shot('03_cat_ab');
  await scrollTo('[data-row="skill:charge"]'); await shot('04_skill_ab');
  await scrollTo('[data-row="sp_cut_clash"]'); await shot('05_skill_single');
  await scrollTo('[data-row="hit_heavy"]'); await shot('06_layers');
  await scrollTo('[data-row="boss_roar"]'); await shot('07_boss');
  // the bar stays on top while scrolling? (sticky)
  console.log('sticky bar top after scrolling', await b.eval('Math.round(document.querySelector(".sb-top")?.getBoundingClientRect().top ?? -999)'));
  // music tab
  const tabs = await ev('[...document.querySelectorAll("[data-tab]")].map((t) => t.getAttribute("data-tab") + ":" + t.textContent.trim())');
  console.log('tabs', JSON.stringify(tabs));
  const clickSel = async (sel) => { const p = await ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); await b.click(p.x, p.y); await b.sleep(500); };
  await b.eval('document.querySelectorAll("*").forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }); window.scrollTo(0, 0)');
  await clickSel('[data-tab=music]'); await shot('08_music');
  const candReqs0 = reqs().filter((u) => /soundboard\/kenney/.test(u)).length;
  await clickSel('[data-tab=cand]'); await b.sleep(1500); await shot('09_cand');
  const candReqs1 = reqs().filter((u) => /soundboard\/kenney/.test(u));
  console.log('requests for the candidates: before their tab', candReqs0, 'after', candReqs1.length, candReqs1.slice(0, 3).map((u) => u.split('/').slice(-2).join('/')).join(' '));
  // open a group in the candidates tab
  const grp = await ev('(() => { const g = document.querySelector("[data-group]"); return g ? g.getAttribute("data-group") : null; })()');
  console.log('first group', grp);
  if (grp) { await clickSel(`[data-group="${grp}"]`); await shot('10_cand_group'); }
  console.log('overflow', await b.eval('document.documentElement.scrollWidth + " vs " + window.innerWidth'));
  const logs = b.events.filter((e) => e.method === 'Log.entryAdded' && ['error', 'warning'].includes(e.params.entry.level)).map((e) => e.params.entry.level + ': ' + e.params.entry.text);
  const exc = b.events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.text + ' ' + (e.params.exceptionDetails.exception?.description ?? ''));
  const failed = b.events.filter((e) => e.method === 'Network.loadingFailed').map((e) => e.params.errorText + ' ' + e.params.requestId);
  console.log('log errors/warnings', JSON.stringify(logs.slice(0, 8)), 'exceptions', JSON.stringify(exc.slice(0, 5)), 'failed requests', JSON.stringify(failed.slice(0, 5)));
  const wavs = reqs().filter((u) => /\.wav(\?|$)/.test(u)).filter((u) => !/soundboard\/kenney/.test(u));
  console.log('game sample files fetched after the tap:', wavs.length);
} finally { clearTimeout(dog); b.close(); }
