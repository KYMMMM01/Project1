// node tools/sfx/audit/review.mjs : the landing review of 2026-10-19 (see review_page.js). Bakes every sound of the game offline in muted headless Edge and writes review.json to AUDIT_OUT:
// per sound the length, level, the share of the energy above 4 and 6 kHz, the first and last samples, the biggest step against the sound's own roughness, and the 400 nearest pairs of sounds.
// needs a dev server (AUDIT_VITE, default 5252) and a free CDP port (AUDIT_CDP, default 9352); nothing is played.
import fs from 'node:fs';
import { open, save, PAGE } from './h.mjs';
const b = await open('?debug=1&demo=audio');
try {
  await b.eval('void (window.__dbg.game && window.__dbg.game.app && window.__dbg.game.app.ticker.stop())').catch(() => undefined);
  const t0 = Date.now();
  const json = await b.eval(fs.readFileSync(`${PAGE}/review_page.js`, 'utf8'));
  save(process.env.REVIEW_NAME ?? 'review.json', json);
  const r = JSON.parse(json);
  console.log('sounds', r.rows.length, 'pairs kept', r.pairs.length, 'seconds', ((Date.now() - t0) / 1000).toFixed(1));
} finally { b.close(); }
