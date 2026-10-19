import fs from 'node:fs';
import { open, save, SC, PAGE } from './h.mjs';
const b = await open('?debug=1&demo=audio');
try {
  const json = await b.eval(fs.readFileSync(`${PAGE}/measure_cand_page.js`, 'utf8'));
  save('measure_cand.json', json);
  console.log('candidates measured', JSON.parse(json).length);
} finally { b.close(); }
