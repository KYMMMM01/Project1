// node tools/sfx/audit/hash.mjs <name> : a checksum of every baked sound of the tree the dev server (AUDIT_VITE) serves -> <name>.json in AUDIT_OUT. Run against two trees and diff the files: that is the list of sounds that changed.
import fs from 'node:fs';
import { open, save, PAGE } from './h.mjs';
const name = process.argv[2] || 'hash';
const b = await open('?debug=1&demo=audio');
try {
  await b.eval('void (window.__dbg.game && window.__dbg.game.app && window.__dbg.game.app.ticker.stop())').catch(() => undefined);
  const json = await b.eval(fs.readFileSync(`${PAGE}/hash_page.js`, 'utf8'));
  save(name + '.json', json);
  console.log(name, Object.keys(JSON.parse(json)).length, 'sounds');
} finally { b.close(); }
