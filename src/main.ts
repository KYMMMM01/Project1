import { game } from '@/core/game';
import { scenes, type Scene } from '@/core/scene';
import { BootScene } from '@/scenes/BootScene';
import { debugEnabled, installDebug } from '@/core/debug';

// Dev galleries: ?demo=ui loads src/demo/UiDemo.ts, ?demo=fx loads src/demo/FxDemo.ts, and so on.
// Each file default-exports a Scene. They are lazy chunks, so they never weigh on the real game.
const demoLoaders = import.meta.glob<{ default: new () => Scene }>('./demo/*Demo.ts');

async function main(): Promise<void> {
  const parent = document.getElementById('stage');
  if (!parent) throw new Error('#stage missing');
  if (debugEnabled()) installDebug();
  await game.init(parent);
  scenes.init();

  const demo = new URLSearchParams(location.search).get('demo');
  if (demo && debugEnabled()) {
    const name = demo.charAt(0).toUpperCase() + demo.slice(1);
    const loader = demoLoaders[`./demo/${name}Demo.ts`];
    if (loader) {
      const mod = await loader();
      await scenes.goto(() => new BootScene(() => new mod.default()), 'none');
      return;
    }
    console.warn(`[demo] no demo named "${demo}"`);
  }
  await scenes.goto(() => new BootScene(), 'none');
}

main().catch((err) => {
  console.error(err);
  const msg = document.getElementById('boot-msg');
  if (msg) msg.textContent = 'Failed to start. Please reload.';
});
