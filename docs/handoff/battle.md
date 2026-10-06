# Handoff: battle (the integrated battle scene)

Date 2026-10-06. Integration pass over the three parts built against `src/view/context.ts`: field (`field.md`), director (`director.md`) and HUD (`hud.md`). Everything below was exercised in the browser with the Aside runner, in both languages, at 720 x 1280 and 720 x 1600.

## Opening a battle

```ts
import { BattleScene } from '@/scenes/BattleScene';
import type { RunConfig } from '@/view/context';

const run: RunConfig = {
  init,                       // BattleInit from profile.prepareRun(...).value (seed, mode, chapter, stake, loadout)
  snapshot,                   // optional: profile.pendingRun's snapshot to continue a run after a restart
  rugSkin: profile.equipped.rug,
  fxTheme: profile.equipped.fx,
  runsPlayed: profile.data.stats.runs,   // drives the staged HUD reveal (GDD 9.1); 0 = tutorial look
  sandbox: false,             // true: no meta calls, no ads, statistics-only result (debug and tests)
};
await scenes.goto(() => new BattleScene(run), 'iris');
```

`src/app/flow.ts` already does this for the home shell. A snapshot that does not fit (wrong version, seed or mode) silently starts a fresh run.

## How the scene reports the end

- The simulation's `victory` / `defeat` events start the director's end staging (boss finale, victory slow motion, defeat greyscale). When it is done the context emits `finished { victory }`; if the director has not announced it within 8 real seconds the scene does.
- The HUD answers `finished`: after a defeat it offers "continue?" once (only from wave 10, GDD 8.2; ad or gems through the meta layer, sandbox free), otherwise the result screen. The result screen calls `profile.finishRun(stats, { abandoned })` itself (rewards, XP, first-clear bundle, luck line) and offers double / snack through the ad service. Retry and Home buttons call `ctx.retry()` / `ctx.exit()`.
- The home shell therefore only has to (1) open the scene, (2) register where Home goes (`setBattleExit(() => new HomeScene())`), (3) save wave-start snapshots (`battle.events 'waveStart'` -> `profile.saveSnapshot(battle.snapshot())`, done in `src/app/flow.ts` through `setBattleCreatedHook`) and (4) replace `ctx.retry` if retries must go through the meta layer (flow.ts does).
- A quit from the pause menu abandons the run (`battle.abandon()`) and shows the same result flow with `abandoned: true`.

## Settings

The HUD owns the player settings store (`src/view/hud/settings.ts`: `ensureSettings`, `currentSettings`, `updateSettings`; `settingsMath.ts`). The boot sequence and the home settings screen import it, so the pause menu, the home screen and the saved file always agree. Keep those exports stable.

## Debug route and hooks (debug builds only)

`?scene=battle&chapter=N&stake=N&seed=N&mode=tutorial|chapter|daily|endless&sandbox=1&runs=N&level=N&rug=ID&fx=ID&lang=ko|en&debug=1`

`window.__dbg.battle = { scene, ctx, battle, give(fish, purr), skipToWave(n), spawn(enemyId, count, from), board({ cell: unitId }), win(), lose(), setSpeed(n), lang('ko'|'en'), pauseReasons() }`; `window.__dbg.director.stats()` reports fx, audio, banner and flight counters.

Automation notes: an Aside tab runs at about 2 frames per second and the game clamps one frame to 50 ms, so real-time waits advance the battle at roughly a tenth of real speed (this is what looked like a stuck "3초" prep countdown). Freeze the ticker (`game.app.ticker.speed = 0`) and step with `game.tick(dt)` then `game.app.render()`; wait for the scene transition to finish (about 2.5 s of stepped time) before the first tap. Do not edit source files while a run is in flight: the dev server reloads the page.

## Known gaps

See `field.md`, `director.md` and `hud.md`; the open items of this pass are listed in `hud.md`.
