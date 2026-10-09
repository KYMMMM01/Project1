// Helpers on top of cdp.mjs for looking at the game in headless Edge when the Aside browser is not running.
//   const b = await openGame('?scene=home&lang=ko&fresh=1&debug=1&notitle=1');   // dev server on GAME_PORT (default 5173)
//   await b.eval('void window.__dbg.meta.addGems(12000)');  const p = await textCentre(b, '/^사기$/');  await b.click(p.x, p.y);
//   await b.shot(out('name'));  b.close();                                       // ALWAYS close: it stops the whole browser tree
// Stills go to $EDGE_OUT (default ./.shots/edge). An eval must return plain data: prefix calls that return game objects with `void`.
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './cdp.mjs';

export const OUT = path.resolve(process.env.EDGE_OUT ?? './.shots/edge');
export const out = (name) => { fs.mkdirSync(OUT, { recursive: true }); return path.join(OUT, name + '.png'); };

/** Open the game at `query` and wait until `ready` (an expression evaluated in the page) is true. */
export async function openGame(query, { ready = '!!(window.__dbg && window.__dbg.game)', width = 450, height = 900, port = 9351 } = {}) {
  const b = await launch({ port, userDir: path.join(OUT, 'profile-' + port), width, height });
  await b.goto(`http://127.0.0.1:${process.env.GAME_PORT ?? 5173}/${query}`);
  for (let i = 0; i < 80; i++) {
    await b.sleep(500);
    if (await b.eval(ready).catch(() => false)) break;
  }
  await b.sleep(1500);
  return b;
}

/** Mark every guidebook topic read and answer a first-encounter card that is already up (they hold a battle paused). */
export async function quiet(b) {
  await b.eval(`(async () => { const m = await import('/src/guide/topics.ts'); for (const t of m.TOPIC_LIST) window.__dbg.lessons?.progress?.markRead(t.id); })()`);
  for (let i = 0; i < 6; i++) {
    const ok = await textCentre(b, '/^(알겠어요|Got it)$/');
    if (!ok) break;
    await b.click(ok.x, ok.y);
    await b.sleep(700);
  }
}

/** Client (css px) centres of every price tag whose label matches `re`, in tree order. */
export async function tagCentres(b, re) {
  return b.eval(`(() => {
    const res = [];
    const dpr = 1;
    const walk = (n) => {
      if (typeof n.text === 'string' && n.style && ${re}.test(n.text) && n.parent && n.parent.parent && n.parent.parent.parent && n.parent.parent.parent.boxW) {
        const tag = n.parent.parent.parent;
        const p = tag.getGlobalPosition();
        const c = window.__dbg.game.app.canvas.getBoundingClientRect();
        const r = window.__dbg.game.app.renderer;
        res.push({ text: n.text, gx: p.x, gy: p.y, canvasLeft: c.left, canvasTop: c.top, canvasW: c.width, rendW: r.width, resolution: r.resolution, scale: window.__dbg.game.scale });
      }
      for (const c of n.children || []) walk(c);
    };
    walk(window.__dbg.game.app.stage);
    return res;
  })()`);
}

/** Client centre of the first Text node matching `re` (its own global position), or null. */
export async function textCentre(b, re) {
  return b.eval(`(() => {
    let found = null;
    const walk = (n) => {
      if (found) return;
      if (typeof n.text === 'string' && n.style && ${re}.test(n.text) && n.worldVisible !== false) {
        const bb = n.getBounds();
        found = { text: n.text, x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
        return;
      }
      for (const c of n.children || []) walk(c);
    };
    walk(window.__dbg.game.app.stage);
    return found;
  })()`);
}
export const state = (b) => b.eval(`JSON.stringify((() => { const d = window.__dbg.meta.profile.data; return { gems: d.gems, gold: d.gold, chests: d.chests, reveals: d.reveals.length, errors: window.__errors }; })())`);
