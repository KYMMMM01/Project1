/**
 * Runtime preparation that must happen BEFORE game.init() creates the renderer.
 *
 * Apps in Toss forbids eval / `new Function` (research C-7.1 #5, review checklist), and PixiJS 8
 * generates shader/uniform/particle sync code with `new Function` by default. Importing
 * 'pixi.js/unsafe-eval' swaps those generators for precompiled polyfills. It is only loaded in the toss
 * build: the comparison below is folded at build time, so every other build drops it.
 *
 * Call (see README.md):  await preparePlatformRuntime();  then  await game.init(parent);
 */
export async function preparePlatformRuntime(): Promise<void> {
  if (import.meta.env.VITE_PLATFORM === 'toss') {
    await import('pixi.js/unsafe-eval');
  }
}
