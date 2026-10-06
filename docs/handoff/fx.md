# FX module hand-off (`src/fx`), paper scrapbook restyle

Procedural VFX library for the battle and meta scenes: particles, impact presets, looping cell and zone visuals, floating numbers, currency fly-to, screen effects, hit-stop, object juice, an awakening cut-in, quality tiers with an automatic governor. No image files; every particle shape is drawn into one atlas at first use.

## The paper look (2026-10-06)

Effects are cut paper, not light. The public API, timings, pooling and quality tiers are unchanged; the drawing changed:

- **Nothing blends additively.** The particle system has one flat layer (the `additive` layer and `Blend` are gone, and so is `EmitDef.blend`; `Loop.sprite(id, blend, tint)` is now `Loop.sprite(id, tint)` and `ParticleSystem.alloc(id, prio)`). Every burst, loop and ray draws opaque or plainly translucent flat shapes.
- **The atlas is flat** (`textures.ts`): hard anti-aliased edges, no gradients. `disc` (was `glow`) is a hard disc, `sparkle` a four-point star, `smoke` a flat puff of five circles, `ring` and `ringThick` crisp rings, `spark` / `streak` / `bolt` flat blades, `wedge` a flat triangle (one ray of a sunburst), `pillar` and `beam` flat strips, `starburst` a nine-point paper burst, `vortex` crisp spiral arms, `coin` two flat tones, `puddle` a flat blob. New shapes: `patch` (a flat rounded square for cell tints) and `sun` (a twelve-point paper sun). Shape ids are otherwise unchanged.
- **One palette** (`palette.ts`): `Hue` (cream, spark, sun, gold, fire, ember, flame, fur, heal, heart, water, ice, iceLight, zap, alarm, dust, smoke, smokeDark, shadow), `CONFETTI` and `CLASS_HUE`, every entry a kit token or a `mixColor` of two (`Color`, `Rarity`, `TapeColors`). The lightest tone is the cream of the paper. No hex literals in `src/fx` outside tests. The director and the field import it too.
- **Floating numbers** (`numbers.ts`): each number is a pooled `Container` of an optional paper starburst (crit coral, boss hit berry) and one `BitmapText`: light digits (the kind's paper colour lightened 30 % toward cream) inside a single flat brown stroke, with no shadow and no second outline (kit rule for text over artwork). Face colours by kind: damage coral, crit and boss hit mustard, dot teal, heal leaf, gold mustard, hurt berry. One bitmap font per colour is baked on first use (`NumberOpts.color` still overrides; the director uses it for burn, poison, bleed and shield). `ensureNumberFonts()` bakes the stock ones at boot. `FloatingNumbers.minY`, `minX` and `maxX` (set by the field from the layout) keep every number below the HUD and inside the screen sides; crit and big sizes were lowered a little (40 to 56 and 56 to 80) because the stroke adds weight.
- **Zones** (`zones.ts`): sunbeam cell = flat mustard patch, two pale leaning bands, a sun sticker; laser dot = the classic red dot with a cream rim and highlight, thin pulsing rings and a faint beam running down; hazard warning and wet and zap cells = berry dashed outline (`drawDashedRect`), a flat tint (water blue or mustard; the warning's tint rises over the telegraph time), a drop or bolt sticker, blink 1.6 to 3 Hz as before; wet puddle = flat blue pool with thin rings and flat drops; zap = flickering mustard tint with arcs; weaken swirl = flat blue beads with a cream rim; blizzard = pale blue disc with wind streaks, snow and paper crystals; potion = leaf puffs and bubble rings; black hole = ink-brown hub and spiral arms (no purple).
- **Cut-in** (`cutin.ts`), a paper collage: warm brown dim (`Dim.backdrop`), cream streaks, a strip of the class colour with cream tape strips along its edges and a flat shadow, the cat sticker popping with an overshoot in front of a flat paper sun that turns slowly, the name on a torn cream `PaperLabel`, the class tag as on-art text, a warm flash. The rainbow outline (`rainbow()`) is gone with its tests. Plan, offsets and skip rules are unchanged.
- **Screen**: flashes default to `Hue.sun` (warm), the red edge pulse and the danger vignette use `Hue.alarm`, letterbox bars are ink brown. The flash safety rules (0.5 s gap, alpha 0.45, red wash, the flash setting) are untouched.
- **Hit flash** (`juice.ts`) now lays a flat white copy of the sprite on top (normal blend), not an additive one.
- **Particles**: confetti is paper (kit papers and tapes), smoke is warm kraft dust (`Hue.dust`, `Hue.smoke`), explosions are coral and mustard flat bursts with ink-brown smoke, ice is sky blue, hearts are berry. Projectile streaks on the field use the flat `streak` shape.


Import everything from `@/fx` (barrel `src/fx/index.ts`).

## What exists

| File | Contents |
|---|---|
| `settings.ts` | `fxSettings` (`tier`, `autoTier`, `quality`, `flashes`, `reducedMotion`, `numbers`), `FX_TIERS`, `setFxSettings`, `onFxTierChange`, `tierScale`, `countScale`, `REDUCED`, `motionSeconds` |
| `governor.ts` | `QualityGovernor` (pure), `startFxGovernor` / `stopFxGovernor` (game-wide, started by every `new Fx`), `loadFxTier` / `saveFxTier` |
| `textures.ts` | One 2x atlas, 29 flat shapes (`FX_TEX_IDS`), `ensureFxTextures`, `fxTexture(id)`, `fxVignette()` |
| `palette.ts` | `Hue`, `CONFETTI`, `CLASS_HUE`: the colours of every effect, all kit tokens or mixes of two |
| `particles.ts` | `ParticleSystem` (one flat `ParticleContainer`), `EmitDef`, `BurstMods`, `EmitterHandle`; budget with priority fill, `sway`, `converge` |
| `loops.ts` | `Loop` (pooled sprites + riding emitters + fade), `FxEnv`, `FxRect`, `ZoneHandle` |
| `zones.ts` | Looping / timed visuals: `sunbeamCell`, `laserDot`, `hazardWarn`, `wetPuddle`, `zapCell`, `weakenSwirl`, `blizzardZone`, `potionCloud`, `blackHole` (use them through `Fx`); flat paper looks, see above |
| `fx.ts` | The `Fx` facade with every preset |
| `cutin.ts` | `AwakeningCutIn` + shared `awakeningCutIn`; pure `awakeningPlan`, `bannerOffset`, `dimAmount` |
| `screen.ts` | `screenFx` (flash, vignette pulse, danger, letterbox), `fxShake`, `Trauma`, `createHitStop` |
| `freeze.ts` | `TimeFreeze` (overlapping hit-stop / slow-mo, cooldown, caps) |
| `numbers.ts` | `FloatingNumbers` (pooled sticker numerals: starburst, edge and face `BitmapText`, 7 styles) |
| `flyTo.ts`, `flyPath.ts` | Currency fly-to-HUD |
| `juice.ts` | `punchScale squash popIn popOut wobbleRotation shakeObject rattleObject kickObject floatBob pulseLoop hitFlash` |
| `rays.ts`, `bolt.ts`, `curves.ts`, `budget.ts`, `handles.ts` | Paper sunburst rays, bolt geometry, curves and colour ramps, particle accounting, handle types |

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
| `sunbeamCell(rect)` | a flat warm patch, two pale bands and a sun sticker (about 8 sprites, no particles); `rect` = `{x,y,w,h}` top-left in the Fx root coordinates |
| `laserDot(x,y,{color?,scale?,follow?})` | the classic red dot, two thin rings, a faint beam; `moveTo` glides (half-life 45 ms) |
| `hazardWarn(rect, 'wet'\|'zap', {duration = 0.8})` | berry dashed outline blinks 1.6 to 3 Hz while a flat tint rises; drop / bolt sticker so colour is not the only cue; pops and ends itself |
| `wetPuddle(rect)` | flat blue pool with rings, leaping drops, berry outline and drop sticker |
| `zapCell(rect)` | flickering mustard tint, crackling arcs (budget-limited, priority 0), sparks, berry outline and bolt sticker |
| `weakenSwirl(x,y,{follow?,scale?})` | droopy blue spiral of flat beads, sweat drops; pass `follow: unitSprite` to ride along with a dragged unit |
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

- Types: `npx tsc --noEmit` prints nothing for the whole tree.
- Unit tests: `npx vitest run tests/fx` = 7 files green (curves, budget, bolt, flyTo path, TimeFreeze, governor, tiers, numbers (now also: crit and boss hit sit on a starburst, a recycled sticker drops it, a face colour override gets its own pool), juice, Loop lifecycle and pool reuse, every zone preset incl. reduced motion, hazardWarn timing and blink rate, cut-in timeline maths, facade). The rainbow tests went with `rainbow()`.
- Browser (Aside, `PAGE_ERRORS` `[]`), screenshots in `scratchpad/shots/field/`: `s1_drag_swap` and `ch1` to `ch5` (damage numbers on wood and on cream, crit stickers with their burst, slash and hit bursts, projectile streaks), `crowd1` (wave 21: flat zones, flights, crit stickers), `s2_hazard_warn` and `s2_hazard_warn2` (telegraphs), `s8_laser`, `s2_cutin_b`, `s11_cutin_hold`, `s9_victory_a/b` (confetti), `s6_defeat_a/b`. The effects gallery (`?demo=fx`, 71 cells: summon tiers, boss death, coin rain, meteor, ...) was not re-run then; it was on 2026-10-07, see the polish section at the end.
- Load: counts and pooling are unchanged (one particle layer instead of two, same budget). The frame time of a crowded wave is in `field.md` (9.2 ms before, 9.2 to 9.7 ms after, same script).

## Bugs found and fixed while verifying

- Governor could never climb on a 60 Hz screen (needed under 14 ms): threshold now 17.5 ms, plus the no-oscillation ceiling.
- `Loop.moveTo` after expiry threw (caught by a unit test): now a no-op.
- Cut-in layer was `eventMode: 'none'`, which also disabled its tap-to-skip child.
- First fur tuft texture read as a striped ball; redrawn as four curved wisps. Sunbeam shaft was a smudge: crisper edges, three shafts.
- Gallery hooks, the demo's laser entry and cell-relative effects used stale cell coordinates in async callbacks.

## Known gaps

- Atlas build (one-off at the first `Fx`) was not timed on a device; estimate 20-40 ms. Check on the target phone. `ensureNumberFonts()` now bakes seven small bitmap fonts at boot (the edge plus six faces, a few ms each); not timed on a device either.
- Frame-time governor thresholds are the guide's, except 17.5 ms for climbing; tune on real devices.
- `hazardWarn` creates one `Graphics` and two `Sprite`s per call, the cut-in about ten objects per play (per event, not per frame). Everything animated per frame is pooled and allocation free.
- No audio is played by fx; pair `awakening`, `bossDeath`, `slashLine`, etc. with `audio.play(...)` at `timeline.impact`.
- The guide's "Off" column of 2.0.6 (motion fully off) is not modelled; shake off is `game.shakeEnabled` in core.
- Cut-in portrait is scaled to 440 px tall and 330 px wide max beside the name; bust-style art works best.

## REQUESTS (outside my paths)

1. Core / ui: `formatNumber` in `src/core/math.ts` has no Korean units (guide C-04 asks for man / eok); floating numbers use it.
2. Core: optionally call `onFxTierChange` to drop the renderer resolution on `low` (guide 6.6 lists it before the effect budgets).
3. Battle scene: call `fx.destroy()` and `screenFx.clear()` on exit (`screenFx` lives on `game.overlayLayer` and outlives scenes), pass the scene Tweener and a `createHitStop` freeze, feed `fx.update(realDt)` every frame.

## 2026-10-07 polish: the gallery after the restyle

Re-checked in the browser (the gallery's own backdrop recoloured to the wood and the cream tokens through the `scenes.current.bg` Graphics, effects played one by one with `__dbg.fx.playAt`, `manual` / `advance` stepping): hit and aimed spark, crit burst, slash, shockwave, explosion, death puff, coin burst, merge burst, ice shatter, summon 0-4 and the quick variants, moltPuff, boss death (opening, six blasts, final ring), coin rain, meteor with its shadow and crater, confetti rain, level-up, shield break, the awakening cut-in (paper collage, sticker cat, torn name label) and the same bursts on the real cream board (`k_sheet.png`). Everything is flat, matte, translucent paper shapes; nothing reads as the old additive glow. Epic is the kit's muted violet (the rarity token), fainter on cream than on wood but readable. Screenshots in `shots/polish/`: `f1_a_pair`, `f1_b_pair`, `g_summons`, `g_summons2`, `h_sheet`, `i_sheet1`, `i_sheet2`, `j_sheet`, `k_sheet`.

**Fixed:** the big rings of shockwaves and summon reveals (drawn up to 600 px wide) had soft, blurry edges because `ring`, `ringThick` and `disc` were 128 px atlas cells scaled 5-8 times. They are 256 px cells now (same shapes, doubled geometry; sizes are set in design px, so no effect changed size); the cut edge of the paper is crisp. `tests/fx` green.

REQUESTS: `src/demo/FxDemo.ts` (the gallery chrome, outside my paths) still draws dark purple cell panels (`0x1d1538`, `0x3a2c66`), a dark backdrop and stroked `Color.textDim` labels: restyle it to the paper kit so the gallery fits the world it shows.

## 2026-10-07 QA fixes

See `battle.md`. Numbers are one stroked bitmap font per colour now (no edge font, no cream ring, no shadow) with `minX / minY / maxX` bounds; `hitSpark` lost its translucent disc, `critBurst` its fading ring, and `buffAura`'s steady disc became a ring outline.
