// Example: the battle's selection sheet for the cat with the longest skill line, and a tap on its "i" sticker.
//   node tools/edge/sheet.mjs [ko|en]        (the dev server must be running: GAME_PORT, default 5173)
import { openGame, out, quiet } from './lib.mjs';

const lang = process.argv[2] ?? 'ko';
const b = await openGame(`?scene=battle&chapter=1&seed=7&runs=5&debug=1&lang=${lang}`, { ready: '!!(window.__dbg && window.__dbg.battle)' });
try {
  await b.eval('void window.__dbg.lessons?.progress?.markSkipped?.()');
  await b.eval('void window.__dbg.battle.skipToWave(11)');
  await b.sleep(1500);
  await quiet(b);
  const pick = await b.eval(`(async () => {
    const d = window.__dbg.battle;
    const game = await import('/src/game/index.ts');
    let best = null;
    for (const u of d.battle.units) {
      if (!u) continue;
      const text = game.unitDef(u.id).skillText();
      if (!best || text.length > best.len) { const p = d.ctx.unitView(u.uid).getGlobalPosition(); best = { id: u.id, len: text.length, x: p.x, y: p.y - 20 }; }
    }
    return best;
  })()`);
  await b.click(pick.x, pick.y);
  await b.sleep(1200);
  await b.shot(out(`sheet-${lang}`));
  const mark = await b.eval(`(() => { let f = null; const walk = (n) => { if (f) return; if (n.label === 'skill-info') { const bb = n.getBounds(); f = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; return; } for (const c of n.children || []) walk(c); }; walk(window.__dbg.game.app.stage); return f; })()`);
  if (mark) {
    await b.click(mark.x, mark.y);
    await b.sleep(900);
    await b.shot(out(`sheet-${lang}-open`));
  }
  console.log('picked', pick.id, 'errors', await b.eval('JSON.stringify(window.__errors)'));
} finally {
  b.close();
}
