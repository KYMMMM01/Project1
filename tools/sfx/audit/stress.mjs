// node tools/sfx/audit/stress.mjs : the worst case of the mix (see stress_page.js): many sounds in the same instant through the real graph, with and without the limiter and the ceiling. Writes stress.json to AUDIT_OUT.
import fs from 'node:fs';
import { open, save, PAGE } from './h.mjs';
const b = await open('?debug=1&demo=audio');
try {
  await b.eval('void (window.__dbg.game && window.__dbg.game.app && window.__dbg.game.app.ticker.stop())').catch(() => undefined);
  const json = await b.eval(fs.readFileSync(`${PAGE}/stress_page.js`, 'utf8'));
  save('stress.json', json);
  for (const [k, v] of Object.entries(JSON.parse(json))) console.log(k, '\n   ', JSON.stringify(v));
} finally { b.close(); }
