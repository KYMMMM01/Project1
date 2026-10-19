import fs from 'node:fs';
import { open, save, SC, PAGE } from './h.mjs';
const b = await open('?debug=1&demo=audio');
try {
  const t0 = Date.now();
  const json = await b.eval(fs.readFileSync(`${PAGE}/measure_page.js`, 'utf8'));
  save('measure.json', json);
  const rows = JSON.parse(json);
  console.log('rows', rows.length, 'seconds', ((Date.now() - t0) / 1000).toFixed(1));
  console.log(JSON.stringify(rows.find((r) => r.key === 'sfx:imp_w_samurai')));
} finally { b.close(); }
