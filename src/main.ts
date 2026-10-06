import { game } from '@/core/game';
import { scenes, type Scene } from '@/core/scene';
import { BootScene } from '@/scenes/BootScene';
import { debugEnabled, installDebug } from '@/core/debug';
import { setLang } from '@/core/i18n';
import { createApp } from '@/app/boot';
import { preparePlatformRuntime } from '@/platform';
import { TAB_ORDER, type TabId } from '@/screens/contract';

/** The title moment of a real launch lasts at least this long, in milliseconds. */
const TITLE_MS = 1100;

/** How long the title moment lasts: a real launch always has it; QA routes skip it (?scene=..., ?notitle=1) or stretch it (?titlems=N). */
function titleMoment(params: URLSearchParams, debug: boolean): number {
  if (!debug) return TITLE_MS;
  if (params.has('scene') || params.has('notitle')) return 0;
  return Number(params.get('titlems')) || TITLE_MS;
}

// Dev galleries: ?demo=ui loads src/demo/UiDemo.ts, ?demo=fx loads src/demo/FxDemo.ts, and so on.
// Each file default-exports a Scene. They are lazy chunks, so they never weigh on the real game.
const demoLoaders: Record<string, () => Promise<{ default: new () => Scene }>> = import.meta.env.DEV
  ? import.meta.glob<{ default: new () => Scene }>('./demo/*Demo.ts')
  : {};

function tabParam(params: URLSearchParams): TabId | undefined {
  return TAB_ORDER.find((id) => id === params.get('tab'));
}

async function main(): Promise<void> {
  const parent = document.getElementById('stage');
  if (!parent) throw new Error('#stage missing');
  if (debugEnabled()) installDebug();
  await preparePlatformRuntime();
  await game.init(parent);
  scenes.init();

  const params = new URLSearchParams(location.search);
  const debug = debugEnabled();
  const app = createApp();

  // QA route: ?scene=battle&chapter=N&stake=N&seed=N&mode=...&sandbox=1 opens a battle directly.
  if (debug && params.get('scene') === 'battle') {
    await app.start();
    const { openDebugBattle } = await import('@/view/field/debug');
    await openDebugBattle(params);
    return;
  }

  const demo = params.get('demo');
  if (demo && debug) {
    const name = demo.charAt(0).toUpperCase() + demo.slice(1);
    const loader = demoLoaders[`./demo/${name}Demo.ts`];
    if (loader) {
      const mod = await loader();
      await scenes.goto(() => new BootScene(() => new mod.default()), 'none');
      return;
    }
    console.warn(`[demo] no demo named "${demo}"`);
  }

  // ?scene=home[&tab=...] lands on the home screen even for a brand-new profile (no tutorial).
  const home = debug && params.get('scene') === 'home' ? { tab: tabParam(params) } : undefined;
  const ready = app.start(home ? { home: home.tab ? { tab: home.tab } : {} } : {});
  // QA: ?lang=ko|en overrides the saved language once the settings are applied (registered first, so it runs before the first scene is built).
  const lang = params.get('lang');
  if (debug && (lang === 'ko' || lang === 'en')) void ready.then(() => setLang(lang));
  await scenes.goto(() => new BootScene(() => app.firstScene(), ready, () => app.shown(), titleMoment(params, debug)), 'none');
}

main().catch((err) => {
  console.error(err);
  const msg = document.getElementById('boot-msg');
  if (msg) msg.textContent = 'Failed to start. Please reload.';
});
