// One still of any screen without writing a script (muted headless Edge):
//   node tools/edge/shot.mjs <name> "<query>" [--dist <dir>] [--size 450x900] [step]...
// Steps run in the order given, after the page has opened and settled:
//   --js "<page expression>"   e.g. --js "window.__dbg.meta.finishRuns(3)" (settles again afterwards: a cheat can unlock things)
//   --scroll "/<regex>/"       scroll the list holding that text into view
//   --tap "/<regex>/"          click the topmost text matching it
//   --wait <ms>
// Example, the shop's frames on a built game:
//   node tools/edge/shot.mjs shop-frame "?scene=home&tab=shop" --dist .shots/dist-qa --js "window.__dbg.meta.finishRuns(3)" --scroll "/^테두리$/"
// Writes .shots/edge/<name>.png (EDGE_OUT moves it) and prints the page's errors. Without --dist it uses the dev server (GAME_PORT);
// --dist rebuilds the folder when src has changed since. Not for ?scene=sounds or ?scene=diag (no game, no hooks).
import { out, scrollTo, settle, tapText, withGame } from './lib.mjs';

const [name, query, ...rest] = process.argv.slice(2);
if (!name || !query) {
  console.error('usage: node tools/edge/shot.mjs <name> "<query>" [--dist dir] [--size WxH] [--js expr | --scroll /re/ | --tap /re/ | --wait ms]...');
  process.exit(2);
}
const opts = {};
const steps = [];
for (let i = 0; i < rest.length; i += 2) {
  const [flag, value] = [rest[i], rest[i + 1]];
  if (value === undefined) throw new Error(`${flag} needs a value`);
  if (flag === '--dist') opts.dist = value;
  else if (flag === '--size') [opts.width, opts.height] = value.split('x').map(Number);
  else if (['--js', '--scroll', '--tap', '--wait'].includes(flag)) steps.push([flag, value]);
  else throw new Error(`unknown option ${flag}`);
}

await withGame(query, async (b) => {
  await settle(b);
  for (const [flag, value] of steps) {
    if (flag === '--js') { await b.eval(`(async () => { await (${value}); })()`); await b.sleep(500); await settle(b); }
    else if (flag === '--scroll') { if (!(await scrollTo(b, value))) console.log(`no scroll view holds ${value}`); }
    else if (flag === '--tap') { if (!(await tapText(b, value))) console.log(`no text ${value}`); await b.sleep(800); }
    else await b.sleep(Number(value));
  }
  const file = out(name);
  await b.shot(file);
  console.log(file);
  console.log('errors', await b.eval('JSON.stringify(window.__errors)'));
}, opts);
