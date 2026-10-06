# FX module hand-off (`src/fx`)

Procedural VFX library for the battle and meta scenes: particles, impact presets, looping cell and zone visuals, floating numbers, currency fly-to, screen effects, hit-stop, object juice, an awakening cut-in, quality tiers with an automatic governor. No image files; every particle shape is drawn into one atlas at first use.

Import everything from `@/fx` (barrel `src/fx/index.ts`).

## What exists

| File | Contents |
|---|---|
| `settings.ts` | `fxSettings` (`tier`, `autoTier`, `quality`, `flashes`, `reducedMotion`, `numbers`), `FX_TIERS`, `setFxSettings`, `onFxTierChange`, `tierScale`, `countScale`, `REDUCED`, `motionSeconds` |
| `governor.ts` | `QualityGovernor` (pure), `startFxGovernor` / `stopFxGovernor` (game-wide, started by every `new Fx`), `loadFxTier` / `saveFxTier` |
| `textures.ts` | One 2x atlas, 27 shapes (`FX_TEX_IDS`), `ensureFxTextures`, `fxTexture(id)`, `fxVignette()` |
| `particles.ts` | `ParticleSystem` (two `ParticleContainer` layers, normal + additive), `EmitDef`, `BurstMods`, `EmitterHandle`; budget with priority fill, `sway`, `converge` |
| `loops.ts` | `Loop` (pooled sprites + riding emitters + fade), `FxEnv`, `FxRect`, `ZoneHandle` |
| `zones.ts` | Looping / timed visuals: `sunbeamCell`, `laserDot`, `hazardWarn`, `wetPuddle`, `zapCell`, `weakenSwirl`, `blizzardZone`, `potionCloud`, `blackHole` (use them through `Fx`) |
| `fx.ts` | The `Fx` facade with every preset |
| `cutin.ts` | `AwakeningCutIn` + shared `awakeningCutIn`; pure `awakeningPlan`, `bannerOffset`, `dimAmount`, `rainbow` |
| `screen.ts` | `screenFx` (flash, vignette pulse, danger, letterbox), `fxShake`, `Trauma`, `createHitStop` |
| `freeze.ts` | `TimeFreeze` (overlapping hit-stop / slow-mo, cooldown, caps) |
| `numbers.ts` | `FloatingNumbers` (pooled `BitmapText`, 7 styles) |
| `flyTo.ts`, `flyPath.ts` | Currency fly-to-HUD |
| `juice.ts` | `punchScale squash popIn popOut wobbleRotation shakeObject rattleObject kickObject floatBob pulseLoop hitFlash` |
| `rays.ts`, `bolt.ts`, `curves.ts`, `budget.ts`, `handles.ts` | God-rays, bolt geometry, curves and colour ramps, particle accounting, handle types |

Demo: `?demo=fx` (`src/demo/FxDemo.ts`), 71 gallery cells on 5 pages; hooks on `window.__dbg.fx` (`names, play, playAt, playAll, stats, page, settings, tier, where, clear, chrome, manual, advance, fx, cutin, portrait, screen, freeze`).

## Consumer API

```ts
import { Fx, screenFx, awakeningCutIn, createHitStop, flyTo, fxSettings, setFxSettings } from '@/fx';

const fx = new Fx(effectsLayer, this.tweens, { freeze, screen?, haptics? });   // once per scene; effectsLayer in design coordinates
// every frame, real (unscaled) dt, so particles are not slowed by hit-stop:
fx.update(dt);
// scene exit:
fx.destroy(); screenFx.clear();
```

`Fx` is created per scene. Loops, particles and timers belong to it; `fx.clear()` removes everything, `fx.destroy()` also frees the pools. Timers run on the Tweener you pass (scene clock), so hit-stop slows the choreography of `bossDeath` etc. on purpose.

### One-shot presets (return `void` unless noted)
`hitSpark(x,y,{angle?,color?,scale?})`, `critBurst(x,y,{strong?})`, `slashArc(x,y,{angle?})`, `shockwave(x,y,{radius?,delay?})`, `explosion`, `deathPuff`, `coinBurst(x,y,{count?})`, `mergeBurst(x,y,color,scale)`, `levelUp`, `iceShatter`, `healPlus`, `dustPuff`, `chargeUp(x,y,{radius?,duration?})`, `lightning(x0,y0,x1,y1,{branches?,thickness?})`, `confettiRain({count?,width?,x?,y?,palette?})`, `number(x,y,value,style,opts)` (styles `damage crit dot heal gold hurt big`).

New in this pass:
- `slashLine(x0,y0,x1,y1,{thickness?,color?,scale?})` long katana streak (blade sweeps in ~70 ms, wake, sparks, end flare).
- `shieldBreak(x,y)` glassy shards, crystals, ring, glints.
- `moltPuff(x,y,{color?}): FxTimeline` fur tufts swirl in, pop out at `impact` (0.3 s): swap the unit then.
- `purrHearts(x,y)` 2-3 hearts float up.
- `coinRain({count?,x?,width?,height?}): FxTimeline` coins fall across the field, about 1.5 s total, count scaled by tier.
- `meteor(x,y,{angle?,scale?,color?,onImpact?}): FxTimeline`, `shootingStar(...)`: streak from above with a shadow growing at (x,y), impact (shake T3 / T1, explosion or star burst) exactly at `timeline.impact`, `onImpact` fires there once.

### Timelines and sequences
`FxTimeline = { impact, duration }` (seconds). `summonReveal(x,y,tier 0..4,{onImpact?,quick?})`, `bossWarning()`, `bossLanding(x,y)`, `waveClear({slowMo?})`, `moltPuff`, `coinRain`, `meteor`, `shootingStar` return it.

`FxSequence = Promise<void> & FxTimeline`: you may `await` it or just read `.impact`. It settles at the end, or earlier when its clock is cleared (scene exit, `fx.clear()`), so awaiting cannot hang. Non-blocking: nothing waits unless you await.
- `bossDeath(x,y,{target?: Sprite, radius?, color?, scale?, onFinal?}): FxSequence`: opening hit-stop into slow-mo, white/red local flicker on `target` (60 ms period), six staggered mini explosions with a rising shake, final blast at 1.0 s (one flash, rings, 120+ particles, T5 shake) where `onFinal` fires and the sprite should be hidden. Duration 2.7 s.
- `awakening(portrait: Texture, name: string, {short?, tag?, color?, onImpact?, haptics?}): FxSequence`: dim, converging speed lines, one flash, slanted banner slides in with portrait and name, holds, slides out. 1.6 s (0.8 s with `short`; reduced motion x0.7 and no lines). Runs on `game.overlayLayer` on the real clock. A tap skips (first tap slides out, second ends it; ignored in the first 0.15 s). `onImpact` always fires exactly once, even when skipped early. Starting a second cut-in ends the first at once (its promise settles). `awakeningCutIn.skip()`, `.playing`, `.destroy()`. Pass an already-translated `name` and `tag`.

### Looping and timed visuals (all return `ZoneHandle { alive, stop(), moveTo(x,y), done: Promise<void> }`)
`stop()` fades out (about 0.3 s) and ends the emitters at once; `done` settles when it is gone; `moveTo` after expiry is a no-op, so it is safe to call every frame.

| Call | Notes |
|---|---|
| `sunbeamCell(rect)` | warm diagonal shaft + slow dust motes, 3 sprites + about 6 particles; `rect` = `{x,y,w,h}` top-left in the Fx root coordinates |
| `laserDot(x,y,{color?,scale?,follow?})` | pulsing red dot, two thin rings, glint; `moveTo` glides (half-life 45 ms) |
| `hazardWarn(rect, 'wet'\|'zap', {duration = 0.8})` | outline blinks 1.6 to 3 Hz while a fill rises; drop / bolt glyph so colour is not the only cue; pops and ends itself |
| `wetPuddle(rect)` | rippling puddle, leaping droplets |
| `zapCell(rect)` | flicker glow, crackling arcs (budget-limited, priority 0), sparks |
| `weakenSwirl(x,y,{follow?,scale?})` | droopy blue spiral of beads, sweat drops; pass `follow: unitSprite` to ride along with a dragged unit |
| `blizzardZone / potionCloud / blackHole (x,y,radius,{color?,follow?})` | radius is the gameplay reach (a thin ring marks it) |

Existing loops: `buffAura(target)`, `poisonCloud`, `rays`, `sparkleTrail(target)`, `smokeTrail(target)`, `ambientTwinkle(x,y,w,h)`; handles have `stop()` and `moveTo()`.

For ground-level layering (under units) create a second `Fx` on a ground layer; loops live under that Fx's particles.

### Quality tiers
`fxSettings.tier` is `'high' | 'mid' | 'low'`, default `'mid'`:

| Tier | Live particles | Floating numbers | Big set-piece and emitter count | Shake |
|---|---|---|---|---|
| high | 400 | 40 | x1 | x1 |
| mid (default) | 250 | 24 | x0.7 | x1 |
| low | 120 | 12 | x0.4 | x0.7 |

Caps apply on the next `fx.update`. "Big" = particle priority 2-3 bursts (crits, merges, reveals, boss, explosions), all looping emitters, `confettiRain`, `coinRain`, god-ray counts. Priority 0-1 one-shots (hit sparks, dust) keep their count and are throttled by the cap and the priority fill limits (ambient refused first at 55% of the cap, critical last). `fxSettings.quality` (0..1) stays a player-facing multiplier on every burst.

Governor: `new Fx` calls `startFxGovernor()`. It reads the real frame time (EMA over 120 frames), steps down one tier after 3 s above 20 ms, steps up after 10 s below 17.5 ms and 30 s since the last change, and never oscillates: a climb followed by a step down within 90 s strikes the higher tier off for the session. Stalled frames (over 250 ms: throttled or hidden tab) are ignored. The tier a device settled in is saved to `localStorage` key `fx.tier`. `setFxSettings({ autoTier: false })` makes it inert, `setFxSettings({ tier })` pins a tier (the governor adopts it). `onFxTierChange(fn)` lets the core react (e.g. lower the renderer resolution on `low`, guide 6.6).

### Settings
`setFxSettings({ tier?, autoTier?, quality?, flashes?, reducedMotion?, numbers? })`. `flashes:false` removes every full-screen flash and pulse; `reducedMotion` shortens long motion, softens shake and flashes, stops loops' pulses, defaults to the OS flag; `numbers: 'off' | 'brief' | 'full'`.

### Screen effects, hit-stop, fly-to, juice
Unchanged from the first pass: `screenFx.flash(color, alpha, ms)` (one per 0.5 s, alpha <= 0.45, saturated red washed to white), `vignettePulse`, `setDanger(0..1)`, `letterbox(show, {height?,ms?})`, `createHitStop([tweener, ...])` -> `{ freeze, dispose }` with `freeze.freeze(s, speed)` / `freezeThenSlow(stop, slow, speed)` (cap 0.2 s stop + 0.4 s slow per event, 0.4 s cooldown), `flyTo({from,to,count,texture|make,onArrive,onDone})` -> `{ cancel, active, done }`, `flyIconCount(total)`, and the juice helpers (all take the Tweener that should drive them; every cleanup also runs when the Tweener is killed).

## Verification

- Types: `npx tsc --noEmit` prints nothing for the whole repo at the time of writing (zero errors in `src/fx`, `src/demo/FxDemo.ts`, `tests/fx*`).
- Unit tests: `npx vitest run tests/fx` = 7 files, 184 tests, all pass (curves, budget, bolt, flyTo path, TimeFreeze overlap, governor incl. no-oscillation and stall filter, tiers and subscriptions, numbers capacity, juice cleanup, Loop lifecycle and pool reuse, every zone preset incl. reduced motion, hazardWarn timing and blink rate, cut-in timeline maths, facade: sequences, tiers, meteor / star impact timing, handle safety after clear / destroy).
- Browser (Aside, `?demo=fx`): the page runs with throttled rAF, so captures drive `game.tick` by hand and composite canvas crops in the page. Looked at: stage strips for hit spark, crit, slash arc, shockwave, explosion, death puff, coins, ice, lightning, heal, dust, level-up, merge, summon 0-4 (incl. mythic charge to impact), boss landing and death with the flickering sprite, floating numbers, every new preset (zones at several ages, hazard fill, puddle, zap arcs, swirl, laser glide, molt, hearts, slash line, shield break, meteor, star, coin rain), the gallery pages, screen effects (danger, letterbox, boss pulse, white and red flash), and the cut-in at 6 points (full) and 4 points (short). Real pointer taps on cells and the page buttons work. PAGE_ERRORS stayed `[]` (one run showed another module's image `relic_tuna_cans` failing to decode; not from fx).
- Leaks: `playAll()` x8 with 2.6 s steps: particle objects created plateau at the cap (400), numbers 5, loops 8 and emitters 17 steady (the toggles), timers 37 steady (the long demo timelines), then `clear()` + 0.5 s leaves live 0, loops 0, emitters 0, timers 0, rays 0, numbers 0. Same sequence on `low`: live particles stay at or under the cap of 120 (119 at the end of the run). One mixed burst (summon 4 + 3, explosion, coin rain, wave clear) peaks at 316 / 200 / 96 live particles on high / mid / low.
- Cut-in lifecycle in the page: resolves after 1.6 s, `onImpact` exactly once, overlay children back to the single screen-fx layer; a real tap skips; an early double tap fires `onImpact` once and ends; a second `awakening` settles the first at once.

## Bugs found and fixed while verifying

- Governor could never climb on a 60 Hz screen (needed under 14 ms): threshold now 17.5 ms, plus the no-oscillation ceiling.
- `Loop.moveTo` after expiry threw (caught by a unit test): now a no-op.
- Cut-in layer was `eventMode: 'none'`, which also disabled its tap-to-skip child.
- First fur tuft texture read as a striped ball; redrawn as four curved wisps. Sunbeam shaft was a smudge: crisper edges, three shafts.
- Gallery hooks, the demo's laser entry and cell-relative effects used stale cell coordinates in async callbacks.

## Known gaps

- Atlas build (one-off at the first `Fx`) was not timed on a device; estimate 20-40 ms. Check on the target phone.
- Frame-time governor thresholds are the guide's, except 17.5 ms for climbing; tune on real devices.
- `hazardWarn` creates one `Graphics` and two `Sprite`s per call, the cut-in about ten objects per play (per event, not per frame). Everything animated per frame is pooled and allocation free.
- No audio is played by fx; pair `awakening`, `bossDeath`, `slashLine`, etc. with `audio.play(...)` at `timeline.impact`.
- The guide's "Off" column of 2.0.6 (motion fully off) is not modelled; shake off is `game.shakeEnabled` in core.
- Cut-in portrait is scaled to 440 px tall and 330 px wide max beside the name; bust-style art works best.

## REQUESTS (outside my paths)

1. Core / ui: `formatNumber` in `src/core/math.ts` has no Korean units (guide C-04 asks for man / eok); floating numbers use it.
2. Core: optionally call `onFxTierChange` to drop the renderer resolution on `low` (guide 6.6 lists it before the effect budgets).
3. Battle scene: call `fx.destroy()` and `screenFx.clear()` on exit (`screenFx` lives on `game.overlayLayer` and outlives scenes), pass the scene Tweener and a `createHitStop` freeze, feed `fx.update(realDt)` every frame.
