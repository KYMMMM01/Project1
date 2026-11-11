// Dump the display tree under one container of a running scene: class, label, renderables inside, render group / cached flags.
//   node tools/perf/tree.mjs <base url> <query> <js expression giving the container> [--depth=4] [--port=9396]
import path from 'node:path';
import { launch } from '../edge/cdp.mjs';

const [base, query, expr] = process.argv.slice(2);
const opt = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : String(d); };
const depth = Number(opt('depth', 4));
const setup = opt('setup', '');
const b = await launch({ port: Number(opt('port', 9396)), userDir: path.resolve('.shots/perf/prof_tree'), width: 390, height: 844 });
try {
  await b.goto(base + query);
  for (let i = 0; i < 120; i++) {
    await b.sleep(250);
    if (await b.eval('!!(window.__dbg && window.__dbg.game && window.__dbg.game.app)').catch(() => false)) break;
  }
  await b.sleep(5000);
  if (setup) await b.eval(setup);
  await b.sleep(1500);
  const out = await b.eval(`(() => {
    const root = ${expr};
    const lines = [];
    const count = (c, top) => { if (c !== top && c.renderGroup) return 0; let n = c.renderPipeId ? 1 : 0; for (const ch of c.children) n += count(ch, top); return n; };
    const walk = (c, d) => {
      const flags = [c.isRenderGroup ? 'RG' : '', c.isCachedAsTexture ? 'CACHED' : '', c.visible ? '' : 'hidden', c.mask ? 'mask' : '', c.filters && c.filters.length ? 'filter' : ''].filter(Boolean).join(',');
      lines.push('  '.repeat(d) + (c.constructor.name) + (c.label ? ' "' + c.label + '"' : '') + '  [' + count(c, c) + ']' + (flags ? ' {' + flags + '}' : '') + (c.text !== undefined ? ' text=' + JSON.stringify(String(c.text).slice(0, 16)) : ''));
      if (d < ${depth}) for (const ch of c.children) walk(ch, d + 1);
    };
    walk(root, 0);
    return lines.join('\\n');
  })()`);
  console.log(out);
} finally {
  b.close();
}
