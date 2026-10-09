# FX module hand-off (`src/fx`), paper scrapbook restyle

Procedural VFX library for the battle and meta scenes: particles, impact presets, looping cell and zone visuals, floating numbers, currency fly-to, screen effects, hit-stop, object juice, an awakening cut-in, quality tiers with an automatic governor. No image files; every particle shape is drawn into one atlas at first use.

## The paper look (2026-10-06)

Effects are cut paper, not light. The public API, timings, pooling and quality tiers are unchanged; the drawing changed:

- **Nothing blends additively.** The particle system has one flat layer (the `additive` layer and `Blend` are gone, and so is `EmitDef.blend`; `Loop.sprite(id, blend, tint)` is now `Loop.sprite(id, tint)` and `ParticleSystem.alloc(id, prio)`). Every burst, loop and ray draws opaque or plainly translucent flat shapes.
- **The atlas is flat** (`textures.ts`): hard anti-aliased edges, no gradients. `disc` (was `glow`) is a hard disc, `sparkle` a four-point star, `smoke` a flat puff of five circles, `ring` and `ringThick` crisp rings, `spark` / `streak` / `bolt` flat blades, `wedge` a flat triangle (one ray of a sunburst), `pillar` and `beam` flat strips, `starburst` a nine-point paper burst, `vortex` crisp spiral arms, `coin` two flat tones, `puddle` a flat blob. New shapes: `patch` (a flat rounded square for cell tints) and `sun` (a twelve-point paper sun). Shape ids are otherwise unchanged.
- **One palette** (`palette.ts`): `Hue` (cream, spark, sun, gold, fire, ember, flame, fur, heal, heart, water, ice, iceLight, zap, alarm, dust, smoke, smokeDark, shadow), `CONFETTI` and `CLASS_HUE`, every entry a kit token or a `mixColor` of two (`Color`, `Rarity`, `TapeColors`). The lightest tone is the cream of the paper. No hex literals in `src/fx` outside tests. The director and the field import it too.
- **Floating numbers** (`numbers.ts`, `numberPlan.ts`; **rewritten on 2026-10-08, see "damage numbers" at the end**; the rest of this paragraph is the first version): each number is a pooled `Container` of an optional paper starburst (crit coral, boss hit berry) and one `BitmapText`: light digits (the kind's paper colour lightened 30 % toward cream) inside a single flat brown stroke, with no shadow and no second outline (kit rule for text over artwork). Face colours by kind: damage coral, crit and boss hit mustard, dot teal, heal leaf, gold mustard, hurt berry. One bitmap font per colour is baked on first use (`NumberOpts.color` still overrides; the director uses it for burn, poison, bleed and shield). `ensureNumberFonts()` bakes the stock ones at boot. `FloatingNumbers.minY`, `minX` and `maxX` (set by the field from the layout) keep every number below the HUD and inside the screen sides; crit and big sizes were lowered a little (40 to 56 and 56 to 80) because the stroke adds weight.
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
| `numbers.ts` | `FloatingNumbers` (pooled numerals, one `BitmapText` each: one number per enemy, placed clear of every body, a crowd budget; 9 styles) |
| `numberPlan.ts` | Pure rules of the numbers: `findSpot` (where one may stand), `Bodies`, `Boxes`, `Pending` (hits that have no number yet), `crossed`, `regionOf`, `outranks` |
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

## 2026-10-07 motion review

Full table in `director.md`. fx side: `Fx` is now built on the battle's real-time clock (`BattleScene`: `new Fx(layers.fxFront, this.ui, ...)`), so an effect's own beats (`after()`: impact shake, level-up flourish) share the clock of the particles they time instead of drifting under hit-stop, slow motion and 3x speed. The filled flash discs that cover a new sticker at its reveal are shorter and a little lighter: merge impact 0.24 to 0.14 s, epic 0.2 to 0.13 s, legendary 0.28 to 0.16 s (alpha 0.85), mythic 0.34 to 0.2 s (alpha 1 to 0.85). The pillar and the large rings still cross the mythic cat for about 0.3 s after its pop; it is clear by 0.9 s.

Second pass (table in `director.md`). `flyTo` now keeps every icon on the screen: `planFlight(..., bounds)` folds the resting spot and the curve's control point back inside (`foldInto`, `FlyBounds` in `flyPath.ts`, tests `tests/fx.flyPath.test.ts`), `flyTo` passes the screen in `parent`'s coordinates less half an icon; callers need no edge values any more. `moltPuff`: flash disc 0.18 s from 0.04 s before the impact, puffs on a ring; `mythic`: flash 0.15 s, starburst 0.2 s, pillar 150 px and 0.32 s (`pillar(..., life)`), the second ring is born at 230 px so it never crosses the new sticker.


## 2026-10-07 owner feedback

- **`sunbeamCell`** is cut from paper shapes now (Graphics, no pooled sprites): a clearly lighter warm patch (`mustard` mixed 58 % toward `paperLight`), a cream edge with a dashed `mustardDark` line inside it, ten flat rays that turn slowly behind the cat (still and stronger under reduced motion, read every frame so the switch applies at once) and a 50 px sun sticker on the corner (`marks.drawSunMark`). Checked on the 13 mats.
- **`marks.ts`** (new, exported from `@/fx`): `drawSunMark`, `drawTargetMark`, `drawPaw`: the stickers the field bakes and the laser card draws.
- **`laserDot`** takes `ZoneOpts.radius` and draws the marked area: a flat soft disc, a cream rim and a dashed ring in the dot's red, turning slowly; `calm` is read per frame.
- **`FloatingNumbers`**: a hit whose rise would end on the `minY` line (the HUD edge) takes the nearest free slot beside the numbers already there (`SLOT_W` 62, `SLOT_Y` 34, up to two slots each way), so a pack of hits near the entrance is read number by number, not as "1123". Tests in `fx.numbers.test.ts`; `fx.zones.test.ts` (sunbeam has no pooled sprites, laser dot with an area).

## 2026-10-07 owner feedback (second round): ground areas

`src/fx/areas.ts` (new, exported types from `@/fx`) replaces the old blizzard, potion cloud, black hole, wet puddle and live cell loops (their code left `zones.ts`; `hazardWarn`, `sunbeamCell`, `laserDot` and `weakenSwirl` stay there). `Fx` owns one `AreaLayer` on its ground container; the facade keeps its names and returns `AreaHandle` (a `ZoneHandle` with `setLeft(seconds, total)`).

What every area has: it **lands** (the sheet drops from 0.55 to full size with an overshoot over 0.3 s and a ring spreads from its edge), it **loops** with one small motif on a sheet that is mostly see-through (the lane and the enemies read through it; areas sit under enemies and cats, over the floor and path, in `layers.zones`), it **warns** (the last second, or the last third of a short life, in real time: the dashes drop out in three steps, the sheet draws in by 14 % and blinks at 2 Hz at most), and it **lifts away** (0.32 s). Reduced motion: same picture, still, the ending shown by missing dashes, a smaller and dimmer sheet and no blinking.

| Area | Shape and rim | Motif | Who |
|---|---|---|---|
| blizzard | pale ice doily, 14 scallops, cream rim, steel-blue dashes | six-arm paper snowflakes drift down and melt where they land; 14 crystal spikes grow in from the rim one by one | friend (m_frost) |
| potion cloud | green cloud with eight bumps, cream rim, leaf dots | bubbles swell as they rise and pop | friend (t_alch) |
| black hole | torn ink sheet, kraft rim, cream dots | a paper spiral turning, scraps spiral in and shrink to the core; spins up and the core swells in the warning; the sheet collapses to the core when it leaves | friend (m_cosmo) |
| wet cell | cell under berry-and-cream hazard tape, blue pool at the cat's feet | ripples, drops falling in; the pool dries in the warning | foe (spray, bath boss) |
| live cell | hazard tape, mustard tint | a zig-zag warning, a bolt glyph, flicking bolts | foe (storm cloud boss) |
| haste ring (clock), heal ring (pill) | berry dashed ring, coral or berry tint, radius 120 like the simulation | speed comets orbit; healing crosses rise | foe, at most four at once |

Friend and foe differ before colour is read: friendly areas have a cream rim with dashes or dots, hostile ones hazard tape or a berry rim. `hazardWarn` (the telegraph) wears the same tape.

Pooling: a view is built once per kind (and cell size) and handed on; starting a zone allocates only its small handle, a frame allocates nothing, and the crystals and dashes only move while they grow or while the warning moves. Cost, measured at speed 3 on chapter 3, wave 21, 20 cats, 41 enemies and 22 zones alive on average (26 at most), 150 frames of `game.tick + render + gl.finish`: before (old zones) mean 13.9 and 15.2 ms, p95 24.7 and 26.4; after mean 17.0 to 17.7 ms (the same script, a busier minute on the machine; in the same run with the simulation frozen on 16 zones the layer costs 0.9 ms of the frame: 4.1 ms shown against 3.2 ms hidden, and 0.5 ms of that frame is `tick`). It was made cheaper after the first measurement (dashes became three Graphics instead of 28 sprites, shorter outlines, crystals idle).

Tests: `tests/fx.areas.test.ts` (landing, scale to the reach, pooling, stale handles, the warning for long and short lives, reduced motion, blink rate, clear), `tests/fx.zones.test.ts` (the old presets left).

## 2026-10-07 last gaps: the crowded wave got slower, and why

Scenario (the one of the second-round note): chapter 3, wave 21, speed 3, 20 cats (frost, cosmic and alchemist cats on twelve cells), about 40 enemies and 22 zones alive, 150 frames of `game.tick + render + gl.finish` after 120 warm-up frames (script: scratchpad `lg/perf0.js`, run with `tools/battle_motion.sh`; every lesson topic marked taught first, or the first-encounter cards pause the sim and the numbers mean nothing). The Aside machine is noisy by about 1.5 ms between runs, so each step below is three runs, the first-frame cost (a single 150 ms texture upload frame) is left in.

| Step | Mean ms | p95 ms | Draw calls |
|---|---|---|---|
| Start of this pass | 16.5, 15.8 | 28.7, 27.4 | 170 |
| 1. every battle layer is a render group | 14.9, 14.9, 13.2 | 27.7, 30.8, 26.2 | 176 |
| 2. areas baked to textures, motifs at 30 Hz in a crowd | 11.9, 12.7, 12.2 | 26.1, 28.3, 25.8 | 67 |
| 3. at most three plain numbers a frame | 12.0, 11.2 | 20.1, 21.6 | 67 |
| 4. enemy flash without add/remove, depth sort every 4th frame, area look-ups at 10 Hz, grade button not rebuilt | 11.4, 11.1, 11.0 | 19.4, 21.4, 19.4 | 67 |
| Final (5 runs, whole tree) | 11.5, 11.9, 13.3, 11.5, 11.7 | 18.5, 18.3, 20.1, 16.6, 17.0 | 67 |

Where the time went, found by switching layers off one at a time in an interleaved A/B harness and by timing the listeners:
1. **Every frame recorded the whole scene again.** `RenderGroup.structureDidChange` was true on 100 % of frames: an enemy passing another changes its `zIndex` (sorted layer), a hit flash added and removed an overlay sprite, a number, mark or area toggled `visible`. Pixi then walks the 225 instructions and about 1,000 objects of the whole stage again (about 3 ms of the 10 ms render submit). Each battle layer is its own render group now (`BattleScene.buildLayers`, `isRenderGroup`): a change re-records its own layer only. Measured by switching it on and off in interleaved blocks: mean 10.6 to 7.2 ms, p95 23 to 13.6.
2. **The areas.** The disc's cut sheet is a 100-point polygon with a 7 px rim: more than 200 vertices, which Pixi never batches, so each area was one draw call of its own for the sheet plus the dashes (110 draw calls from 21 areas, 1.9 ms of submit). `fx/areaArt.ts` bakes the sheet and the dashed ring (in the three steps of the warning) once per kind into a texture; an area is two sprites plus its motif sprites. Draw calls 170 to 67. The motif (flakes, bubbles, scraps; 10 to 24 sprites) moves every frame for up to six areas, in a crowd every 1/40 s (high), 1/30 s (mid) or 1/20 s (low tier), staggered by slot so areas started together do not move on one frame; sheets, rims and the dashed line still turn every frame. The frost crystals no longer toggle `visible` (a sliver of 0.1 px is a hidden crystal).
3. **Numbers nobody saw.** At speed 3 a frame sees about 35 hits (100 to 170 when a zone ticks on the whole crowd), and every one asked `FloatingNumbers.show` for a number (36 microseconds each: bitmap text layout), 98 % of them evicted by the next one before they were drawn (cap 24, life 0.6 s). The `hit` listeners cost 2.3 ms of the 2.9 ms the simulation call took; the simulation itself is 0.6 ms. `FloatingNumbers` takes at most three plain numbers (priority 0 and 1) a frame; crits, boss hits and the like are never dropped. Spikes of 20 to 25 ms in the slow frames were these bursts.
4. **Small things that were paid every frame.** The enemy hit flash (a pooled overlay added to and removed from the layer) is a persistent child that is only faded (`EnemyView.flash`); enemies are re-sorted every 4th frame with the key rounded to 6 px (`policy.depthKey`, `depthFrame`); who stands in which area is looked up every 0.1 s, not every frame (22 zones x 41 enemies, 0.18 ms; the tag stays 0.6 s); `ActionRow.refreshGrade` rebuilt the summon-grade button on every fish tick (0.66 ms a frame in a wave) and now only when its price, level or readiness changes.
Not changed: the weapon marks and the zone tags toggle `visible` when they start and end (a few a second, their layer only); the enemy layer still re-records on every re-sort (15 Hz). First draw of a new enemy kind still uploads its texture in one frame (30 to 45 ms once per kind and session): not prewarmed. Looked at, not a cause: Graphics rebuilds (3 a frame, 0.9 ms), the GPU (`gl.finish` waits 0.05 ms), forcing the 74 big HUD Graphics into the batcher (more vertices copied than draw calls saved).

**Quality governor.** The frame-time average spans 60 frames (was 120) and the governor steps down after 1.5 s above 19 ms (was 3 s above 20 ms): a crowded wave now drops a tier in about 2 s instead of 5 s. The tier changes what the new things cost (motif interval above, particle and number caps as before). Tests: `fx.test.ts` (governor), `fx.areas.test.ts` (baked ring in three steps, motif rate by tier, stagger), `fx.numbers.test.ts` (the per-frame budget), `view.field.policy.test.ts` (depth key and frame).

REQUESTS: `src/game/sim` and the listeners of the simulation's `hit` event are now the biggest CPU item in a late wave (1.4 ms a frame and the cause of the remaining p95 spikes when a zone ticks on forty enemies at once): a zone tick could be one `hits` event with a list. Not mine to change.


## 2026-10-07 leftovers: first-use hitches, found and warmed

Item: "the first time a new kind of enemy (a boss, a projectile, an effect atlas) is drawn its texture is uploaded in that frame, 30 to 45 ms". Measured first (Aside tab, `tools/battle_frames.sh` and one-off scripts), and the finding is wider than the textures: on this machine an image upload is cheap in JS (`renderer.texture.initSource` 0.1 to 0.6 ms for an enemy, 4 to 8 for a background; the HUD's preview cards also upload next wave's enemies a wave early), and the first-use costs that really land in a fight are these, largest first:
1. **The floating numbers' glyph fonts: 140 ms of drawing + 78 ms of upload on the first number of a session** (`ensureNumberFonts` was documented as "BootScene does this" and nothing called it). On top of that every colour that is not a stock style's (burn, poison, bleed, shield) drew its own font, 20 to 30 ms, on the frame of its first tick (found as 21 to 30 ms inside `fx.number` on the arrival frame of a boss wave). Now `BattleScene` draws every face while the scene is built behind the transition (`ensureNumberFonts()` and `bakeNumberFace` for `NUMBER_FACES` of `director/palette.ts`), and the warm-up uploads every glyph sheet. First number: 218 ms -> 8 ms; the largest frame of wave 1 of a fresh page: 190 ms -> 15 ms.
2. **The particle shader**: `ParticleContainer`'s program is linked on the first draw of any particle (25 to 78 ms; the first elite or the first hit). `warmParticles()` draws one particle into a 4 x 4 target in the first frame of the battle.
3. **The toy screen's first open** (a boss or elite is killed, 3 cards of paper, tape and fresh text): 134 to 150 ms. `RelicScreen` builds its three cards 0.04 s apart, each just ahead of its own deal (a render counter guards a rebuild in between): 86 to 89 ms (31 JS + 7 director + 48 render of the screen itself).
4. **Ground areas**: the baked sheet and three dashed rings of a kind (`bakeArea`: 4 textures of 342 x 342) were made the first time an area of the kind started: 9 to 17 ms on the first clock or pill, more for a kind first seen in a crowd. `bakeAreaStep(kind, step)` bakes one piece, `AreaLayer.ready(kind)` builds a pooled view once baked.
5. **Textures**: pinned (`autoGarbageCollect = false`) and uploaded ahead; Pixi's collector drops an image nobody drew for 60 s (checked: `GCSystem` default 60 s idle, every 30 s), so a boss texture warmed at wave 1 would have been uploaded again at wave 8.
Not changed: `audio.play` 6 to 13 ms on the first play of a sound and `audio.music` 5 ms on the wave-start frame of a boss wave (REQUESTS in `hud.md`); the wave-start banner (director 6 ms).

**The queue (`src/fx/warm.ts`)**: `warm.request(key, prio, cost, run)` once per key (asked again more urgently it moves up); `update(dt)` runs pieces most urgent first while the measured time stays under 2.5 ms (the first piece of a frame always runs, so pieces are made small) and does nothing on a frame whose real time was over 45 ms. Priorities `WARM_PRIO`: pipeline (particle shader, vignette, glyph sheets), the coming wave (`previewWave(wave + 1)`), the next one (`wave + 2`), then everything a battle may need: every enemy and boss picture, the cats, the toys, the chests (closed and open), the paw, the five ground areas. `uploadTexture(texture)` is `renderer.texture.initSource` (what Pixi's own `prepare` does for a texture) after pinning; `warmImage(key, prio)`. Asked for in `src/view/warmup.ts` (`BattleWarmup`: at the start and whenever the wave counter or the phase moves, so also while the pick of three or the toy screen is open) and `src/view/field/warmup.ts` (`FieldWarmup`: enemy bodies and area views for the coming wave, one a frame). `BattleScene.update` calls `warm.update(dt)` last; `exit` clears what waits. All 124 pieces are done in 60 frames (one second) of a battle, none of them over 9 ms (first 40 frames read through `__dbg.battle.warmLeft()`).

**Numbers (Aside tab at 1 to 2 fps rendering, so frames are stepped with `game.tick(1/30)` + `render` + `gl.finish`; this machine is noisy by about 1.5 ms and by random 10 to 20 ms frames: medians of three runs).** First frame of each enemy kind of chapters 1 to 3 (one of each spawned into a battle whose warm-up has run; original code, then now):

| kind | original | now | kind | original | now |
|---|---|---|---|---|---|
| cucumber | 12.8 | 8.7 | firecracker (elite) | 41.9 (104 worst) | 5.0 |
| dust | 4.6 | 4.2 | spray (elite) | 3.1 | 3.0 |
| drop | 3.8 | 8.3 | boss_cucumber | 3.7 | 4.8 |
| roomba | 4.6 | 3.0 | boss_vacuum | 4.8 | 12.3 (3.6 and 2.2 when spawned first: the harness leaves the earlier kinds alive, so the crowd decides) |
| tangerine | 4.2 | 6.0 | boss_blender | 9.3 | 3.1 |
| balloon | 4.8 | 2.5 | boss_bath | 6.0 | 3.1 |
| clock (haste area) | 14.3 | 9.6 | cone | 2.8 | 4.1 |
| pill (heal area) | 22.4 | 5.1 | dryer | 3.9 | 4.0 |

Sum of the medians 147 -> 87 ms, worst median 41.9 -> 12.3. Kinds whose picture the HUD's preview card had already uploaded were never slow, and what is left over 5 ms is noise of this machine (drop, tangerine, cone, boss_cucumber moved by +-3 ms between runs of the same code).

Whole waves (speed 3, bot board, waves T-3 to T answered with real taps, `tools/battle_frames.sh`, four runs of about 1,300 to 1,700 frames: chapter 1 twice, 2, 3; original, then the finished code): median 3.0 / 3.6 / 3.0 / 3.3 -> 3.0 / 3.2 / 2.9 / 3.2 ms, p95 8.8 / 10.0 / 8.7 / 8.3 -> 7.1 / 7.6 / 6.9 / 6.8, p99 14.9 / 17.5 / 13.7 / 13.5 -> 11.7 / 12.3 / 11.2 / 10.8 (all four better). Longest frame of a wave: wave 4 (first elite, first toy screen) 150 -> 67 ms, wave 12 (elite, toy screen) 102 -> 86, wave 9 25 -> 10, wave 10 24 -> 10, wave 11 30 -> 11, wave 14 36 -> 12, wave 17 26 -> 16, wave 18 41 -> 17. **Boss waves (8)**: 21 / 38 / 36 ms (chapters 1 / 2 / 3, one sample each) -> 30 / 25.5 / 30 (four samples of chapter 1: 25 to 33; chapter 2: 25 to 30; chapter 3: 28 to 36): the first frame of the wave is what is left (banner 6 ms, `audio.play` 12 and `audio.music` 5, see above), unchanged within the noise of this machine; the second spike of the wave, the boss's arrival (28 to 42 ms: a burn tick drawing its font), is gone (profile of chapter 2, wave 8: frame 22 was 42.5 ms, now under 17). The longest frame of a run that meets a boss is the toy screen after it: 134 to 150 -> 86 to 89 ms (and the very first number of the run, 218 -> 8 ms, which no wave table shows because it is in wave 1).

Tests: `fx.warm.test.ts` (11: order, once, moving up, the allowance and the first-piece rule, a slow frame, a piece that throws, clear and reset), `fx.areas.test.ts` (+4: baking by piece, `ready` only for a baked kind), `fx.numbers.test.ts` (+1 and the mock now gives a font a sheet), `view.warmup.test.ts` (6: the shader first, the coming wave before the next before the rest, nothing re-asked until the wave or phase moves, nothing for a finished run).

Method notes: `tools/battle_frames.sh <chapter> "<waves>" ["<waves played to their end>"] [seconds]` plays real waves and prints first frames of each kind, median, p95, p99 and the slowest frames of each target wave (one run is 120 s at most: about four target waves). `?fresh=1` does not matter here (sandbox route). An elite or boss that stands 450 frames is killed by the harness; first-encounter cards are switched off with `hud.hints.only = new Set()` (marking the topics taught is too late for a card already queued).


## 2026-10-07 sound warm-up (what changed in the queue)

Sounds went on the same queue as the pictures (what is primed and when: `audio.md` section 10, `battle.md`). A bake of a sound is a different kind of piece: **4 ms to build the offline graph in the caller's frame** (median of the 140; 2 to 15 ms, `awaken` 15, the big ones 10 to 12), whereas a picture is 0.6 ms and the allowance is 2.5 ms a frame. Two changes to `src/fx/warm.ts`, both additive:

1. **The allowance is spent on average, not per frame.** The queue keeps a balance (`tokens`, ms): a frame refills it by its allowance (never past one frame's worth, nothing on a slow frame), the first piece of a frame runs when the balance is above zero, and a piece draws what it measured, so a piece bigger than the allowance leaves the balance negative and the frames after it wait until it is paid back. A 4 ms bake runs on about 6 frames in 10, a 15 ms one is followed by 5 frames of nothing, a 30 ms shader link by 11, an 0.6 ms picture is unchanged (four a frame). Before: "the first piece of a frame always runs", so 68 bakes in a row were 68 frames of 4 to 15 ms extra on top of a 3 ms frame. Measured over the first 400 frames of a battle (all 68 sound pieces of that window, 311 ms of work): the queue empties after 140 to 170 frames instead of 69, and the frames that carry a piece have a median of 5.3 to 5.7 ms (6.2 before) and the slowest 14.5 to 29 (35.6 before; the machine adds its own 10 to 20 ms frames, so read the median). The 30th piece is done at frame 41 to 52 (0.7 to 0.9 s at 60 fps): the menus, the summon ladder and the first cats are ready before the first summon. Tests: `fx.warm.test.ts` (12: the old "a big piece runs alone, then nothing else that frame" is now "alone, and the frames after it wait until it is paid back": 20 ms against 2.5 ms a frame is nine frames; 4 ms pieces run 12 or 13 times in 20 frames; a slow frame refills nothing and an overdraft survives it).
2. **`renderOnce(container)`**: draws a container once into a 16 x 16 target nobody sees (a hidden container is shown for the call; Pixi makes it a render group of its own the first time). It pays for everything a first real draw builds (glyph textures, geometry, uploads, a shader variant). Measured on the toy screen (three cards, a quiet machine, `prerender.js` of the scratchpad): first draw 59 ms; drawn ahead 47 ms in its own frame and 2.2 ms when shown. It is how the HUD draws a screen part by part ahead of time (`battle.md`).

**Measuring sound with the frame tool.** `tools/battle_frames.js` steps the frames in one synchronous loop of up to 150: an offline render finishes on the audio thread and its promise can only be answered between two such loops, so a baked sound never lands inside a loop and a first play inside it looks the same as a primed one. The measurements here use a copy that (a) awaits 6 ms between frames (about what a 60 fps battle leaves), (b) times every `audio.*` call of each frame and prints the slowest call names, (c) splits each frame into the simulation (events included: a `waveStart` handler runs inside `battle.step`), the field, the director, the HUD, the effects, the warm-up, the render. Cold bank: the idle prerender is switched off (`bank.queue.length = 0; bank.scheduled = true`) so only the queue's priming bakes anything. "Before" is the same code with `audio.primeStep` and `audio.primeLeft` made no-ops, run in the same minutes (A and B alternate: this machine runs other people's work, its median frame went from 1.4 to 4.7 ms between two runs of the same code, and the numbers below are only comparable inside a pair). The yielding copy is in the session scratchpad (`p/bf.js`, `p/cats.js`), not in `tools/` (outside the paths of this pass): a `tools/battle_frames.js` that awaits between frames would show priming; REQUESTS.

**Numbers (the slow regime, median frame 3.9 to 4.7 ms: the one the earlier hand-off's 21 to 38 ms were measured in; 1 pair per chapter, boss wave 8, cold bank, A/B interleaved).**

| | before | after |
|---|---|---|
| wave-start frame, chapter 1 / 2 / 3 | 38.9 (34.3) / 32.9 / 33.1 ms | 26.1 / 22.9 / 27.0 ms |
| of which sound calls in it | 12.7 (6.5) / 10.2 / 8.3 ms (`boss_warning` 12.1 / 9.4 / 7.7) | 0.7 / 1.0 / 0.6 ms |
| largest frame of the whole boss wave | 38.9 (34.3) / 32.9 / 33.1 | 26.1 / 25.8 / 27.0 |
| the first shot of each of the 20 cats (cat on an empty board, one enemy in reach), median / largest / sum of the 20 frames | 7.9 / 31.4 / 224 ms | 3.8 / 19.1 / 102 ms |
| p95 / p99 of the 750 frames of the run | 10.1 to 10.8 / 15.0 to 18.7 | 10.8 to 11.1 / 16.0 to 17.8 (the priming is spread, not added) |

Earlier runs of the same pair (idle prerender on, which bakes `ui` and `fire` sounds first and the boss ones last): wave-start frame 31.3 / 29.1 (ch1), 32.9 (ch2), 34.9 (ch3) before, 28.0 / 21.9 / 22.6 after. In the quiet regime (median frame 1.4 to 1.5 ms): wave start 8 to 12 ms with 2.1 to 3.6 ms of sound before, 6.5 to 10.6 with 0.1 to 0.4 after; the 20 first shots' sum 69 / 114 / 71 before, 33 / 35 / 34 after. What is left in the wave-start frame is not sound: the banner and the warning (director 3 to 6 ms), the HUD (2.2), the first draw of the ribbon, the vignette and the boss (render 8 to 10 ms), `fx.bossWarning`; see REQUESTS.

REQUESTS
1. `tools/battle_frames.js` (not in my paths): await a few milliseconds between frames (`await new Promise(r => setTimeout(r, 6))`) and time the `audio.*` calls the way `p/bf.js` does, or a sound's first play can never be told from a primed one.
2. Director (`banners.ts`, `boss.ts`, `fx.bossWarning`): the boss wave's first frame is still 23 to 27 ms without any sound in it (the warning ribbon's text, the vignette, the boss bar are drawn for the first time in it). A piece that builds and draws the ribbon once ahead of time (`renderOnce`) would take most of the 8 to 10 ms of render out of it; the banner service is not reachable from `BattleWarmup` (it only has `BattleApi`).

## 2026-10-07 final leftovers

REQUEST 2 above (the boss wave's first frame) is done on the director's side: the ribbon, the red edge and the boss strip are drawn through `renderOnce` in the wave before (`hud.md`, `director.md`): 22.3 to 17.5 ms and 17.1 to 16.2 ms. `src/fx/warm.ts` itself is unchanged.


## 2026-10-08 VFX polish: painted battle effects

Owner feedback: the zones (black hole, blizzard), the shots and the enemy shield looked cheap, and the shield read like one of our ground zones. "Battle effects may be out of tone" lifted the paper rule **for battle effects only**: cats, enemies and the interface stay paper. Battle effects are now painted sprites (made with the image generator), soft glow and additive light, driven by code.

**The sprites** (`art/fx_v2`; 45 painted pictures in `src/assets/img/fx_*.webp`, 1.4 MB; `src/fx/paint.ts` lists them: `PAINT_IDS`, `paint(id)`, `paintKey(id)`). Generated with `tools/gen_image.py --batch art/fx_v2/jobs.json` (the cut-off engineer's 14) and `jobs2.json` (3 more): 17 images in all, 16 kept, 1 rejected; two of the kept ones (the cracks) are redrawn in code from the lines they contain. `python art/fx_v2/build_fx.py` cuts the sheets into single sprites (`art/raw/fx_*.png`; then `python tools/process_art.py`) and rebuilds the contact sheet `art/fx_v2/_sheet.png` (45 sprites on mid-grey and on wood; sent to the owner). What each sheet gave:

| Sheet | Sprites | Notes |
|---|---|---|
| `sheet_shots_a` | `shot_pebble arrow shuriken cork moon coin` | kept |
| `sheet_shots_b` | `shot_snow fire ice void note flask ladle bell` | kept; the snowball and the fireball touch, so this sheet is cut by explicit windows (`WINDOWS` in the script) |
| `sheet_bursts` | `burst_star ring glint slash sparks puff` | near-white, tinted in code |
| `sheet_marks` | `mark_scorch`, `mark_snow` | ground decals |
| `sheet_bolts` (new) | `bolt_0..5` | six jagged horizontal lightning bolts |
| `shield_shards` | `shard_0..5` | the six pieces of a broken dome |
| `zone_frost`, `zone_snow` | blizzard ice sheet, snow swirl layer | |
| `zone_hole`, `zone_holearms` | black hole with its accretion ring, and its spiral arms | |
| `zone_ooze` | potion pool | was `zone_potion`: renamed because the dev server had cached an empty file under the old name |
| `zone_puddle` | wet cell | |
| `sheet_foe_rings` (new) | `foe_haste` (orange chevrons), `foe_heal` (crimson crosses) | the hostile rings |
| `shield_dome` (**regenerated**) | steel glass sphere with hexagon panes | the first one (`art/fx_v2/_rejected/`) had noisy blotches inside where the keying failed. The new one is asked for as filled frosted glass; `glass()` in the script then makes the body a see-through film (16 % at the middle, 66 % at the edge), bakes the steel blue into the body and leaves the seams, nodes and rim white |
| `shield_crack1/2` | two stages of cracks | the generator drew fat blue bands round the cracks: only the white hairlines are kept (`hairlines()`), with a soft glow |

Every piece goes through `decontaminate()` (half-transparent pixels take the colour of the nearest solid pixel: the keying left cyan and magenta speckles). `tools/process_art.py`: `fx_zone_` and `fx_foe_` fit 384 px, `fx_shield_` 320 px, and these keep the picture's centre at the middle of the file (`KEEP_CENTRE`) because particles fall into a black hole's core and enemies stand inside the rings.

**New in `src/fx`**
- `light.ts`: `Light`, the named colours of the painted effects (the only hex literals outside `textures.ts`).
- `flecks.ts`: `FleckLayer` (`fx.flecks`, `fx.fleck(texture, x, y, opts)`): pooled painted sprites with speed, gravity, drag, spin, size and fade, in a normal and an additive container, capped by tier (`FLECK_CAP` 96 / 64 / 32). Shards, glints, rings of light, flashes and what a shot sheds are flecks.
- `arcs.ts`: `ArcLayer` (`fx.arc(x0, y0, x1, y1, { scale, delay, color })`): a painted bolt stretched along the line, a thinner one beside it, flickering between the six bolts for 0.22 s, with a glint and a star where it lands; ten pooled arcs; normal blend (additive light on the cream of the board is white on white).
- `textures.ts`: two atlas shapes, `glow` (a soft round light) and `bubble` (a thin film, a ring, a highlight).
- `areas.ts` rewritten (below); `areaArt.ts` (the baked paper sheets and dashed rings) and `bakeAreaStep / areaBaked / AREA_BAKE_STEPS` are gone: nothing is baked any more. `AREA_PICTURES[kind]` names the painted pictures of a kind for the warm-up.
- `Fx.shieldBreak(x, y, { scale })`: a flash and a ring of light, the six painted shards thrown out with spin and gravity, sparkles. Reduced motion: half the speed, no gravity, no spin.

**Ground areas** (`areas.ts`; the facade names and `AreaHandle.setLeft` are unchanged). Each is layers: a base on the floor with a soft edge at the real reach, painted layers turning at different speeds, particles that belong to it, an additive glow (one shared light container: a whole crowd of areas is one blend change) and a ring round the edge. All of them land (the base grows with an overshoot and a ring spreads), warn in the last second (the base draws in by 10 % and blinks at 2 Hz at most, the rim flashes; with `flashes` off or reduced motion, a steady dimming) and lift away.

| Area | Layers and particles | Entrance / exit | Who |
|---|---|---|---|
| blizzard | `zone_frost` base (84 % opaque: the lane reads through), `zone_snow` twice (slow one way, faster the other, fading in), eight crystals falling in a slow swirl and melting, four glints, mid-blue rim, pale glow | grows from 35 % with a ring; draws in a little | friend, m_frost |
| potion cloud | `zone_ooze` pool breathing and turning a little, nine bubbles rising, swelling and popping (`bubble`), three wisps of green steam, six drops thrown out as it lands, lime glow | grows from 30 % and splashes; dries up | friend, t_alch |
| black hole | a dark `glow` under it, `zone_holearms` turning fast, `zone_hole` the other way slowly, twelve scraps and sparks (ember, magenta, violet, cream) spiralling into the core and shrinking, five stars orbiting, violet rim, ember glow at the core; spins up and the core swells in the warning | opens from a point (12 %) over 0.5 s; collapses to its core (88 %) when it leaves | friend, m_cosmo |
| haste ring | `foe_haste` (orange chevrons, 82 %) running clockwise, six comets, a hot shade | 70 % to full | foe, clock |
| heal ring | `foe_heal` (crimson crosses) turning back with a two-beat heartbeat, six crosses rising, a red shade | same | foe, pill |
| wet cell | hazard tape, the berry sticker, `zone_puddle` at the cat's feet that dries in the warning, ripples and drops | as before | foe |
| live cell | hazard tape, two painted bolts that flicker and mirror every 70 ms, the glyph and sparks | as before | foe |

Friends against foes: friendly areas are round, soft, cool or magical (ice, lime, violet and ember); hostile ones are hot and hard (orange chevrons, crimson crosses) or wear hazard tape in a square; and they move differently (friends drift and swirl, foes turn like a gauge). The light-floor lesson: additive light on the pale kitchen floor is white, so rims, landing rings, streaks and lightning are painted (normal blend) in mid tones and only soft glows, glints and flashes are additive.

**Quality tiers.** Low drops, in this order: the additive glow, the second snow swirl, half the particles of every area, what a shot sheds (`SHED_EVERY` 0.032 / 0.05 / 0.09 s), the light round a shot; flecks are capped at 32. Reduced motion: areas are the same picture, still (no throw, no landing ring), a steady dimming for the warning, arcs do not flicker, shots shed nothing. Flashes setting: the warning and the tape do not blink.

**Measured.** The standard crowded scenario (chapter 3, wave 21, speed 3, 20 cats of which 12 make areas, about 38 enemies, 22 areas alive on average; `lg/perf0.js` of the scratchpad, 150 frames of tick + render + `gl.finish` after 120 of warm-up): before (the paper areas) mean 13.4 ms, p50 11.6, p95 25.8; after, three runs: mean 13.3 / 13.0 / 12.8, p50 11.4 / 11.2 / 11.4, p95 27.8 / 26.1 / 27.6. The same scenario with three shielded cones spawned every 15 frames (58 enemies): mean 12.7 and 13.1, 74 draw calls a frame. This machine is noisy by about 1.5 ms between runs: read it as no change.

**Tests.** `fx.areas.test.ts` (33, rewritten: landing, rims and rings, how each area is built, tiers, reduced motion, flashes, pooling, cells), `fx.flecks.test.ts` (6), `fx.arcs.test.ts` (6; it found a real bug: a chain hop with no delay never flashed), `fx.specials.test.ts` and `view.warmup.test.ts` adapted (nothing is baked; the warm-up uploads the painted pictures: `warmArea` asks for `AREA_PICTURES`, every other painted picture at the `later` priority).

**Not verified.** A real phone (touch, 60 fps, the memory of 45 more textures: about 13 MB of video memory at their sizes); the sound of any of it.

REQUESTS
1. Core (`src/core/assets.ts`): every image in `src/assets/img` is loaded at boot; the 45 `fx_*` pictures (1.4 MB) are only needed in a battle: load them with the battle scene, or after the title, to keep the first load as small as before.
2. Audio (`src/audio`): a shield has no sound of its own; a hit on it plays the weapon's impact and the steel sparks. A short steel ping (`shield_hit`) would finish it; `shield_break` is still the paper tear.


## 2026-10-08 VFX restyle: back to the game's own drawing

Owner feedback on the painted rebuild above: "너무 이펙트가 사실적이라 이질감이 드네 ... 화풍을 맞추던 해야겠네. 보호막도 과해, 적이 많아지면 크기도 커서 복잡해 보여." So the **look** went back to the game's art style and the shield became small; the **behaviour** of the rebuild (each cat's own shot with its path, spin and trail, the three casters throwing first, lightning hopping, layered areas, a shield that sits on the enemy) is unchanged. The paper-only rule of the first section stays lifted for battle effects, but they are no longer lit: **nothing blends additively any more** and there is no soft glow. (The "one restrained highlight on the biggest moments" that was allowed was not needed: the boss death and the guardian's hit read well as flat bursts, so there is none.)

**The sprites** (`art/fx_v3`; 42 drawn pictures in `src/assets/img/fx_*.webp`, about 1 MB, contact sheet `art/fx_v3/_sheet.png` on the wood and on the cream of the board). Made with `tools/gen_image.py --batch art/fx_v3/jobs.json` (the jobs are written by `art/fx_v3/make_jobs.py`; `unit_w_paw.png` is attached to every job as a rendering reference only): flat 2D cartoon, a thick dark-brown outline, flat colour with one shadow tone, no gradient, no glow, no sticker border, transparent background. 12 images in all (11 planned, plus the shield sheet drawn again in cobalt: the first one, teal, was dropped, see below); every one was kept, none had to be redrawn for quality. `python art/fx_v3/build_fx.py` cuts them by grid (explicit windows for the bottom row of `sheet_shots_c`, where the ladle's bowl crosses the cell line), cuts the generator's halo off hard, and writes the zones and rings on a square canvas centred on the middle they turn about (`pin` for the pinwheels: centre of mass); then `python tools/process_art.py`.

| Sheet | Pieces (the texture keys are yesterday's, like for like) |
|---|---|
| `sheet_shots_a` | `shot_pebble arrow shuriken cork moon coin` |
| `sheet_shots_b` | `shot_snow` (the snowball alone), `shot_fire`, `shot_ice`, `shot_void` |
| `sheet_shots_c` | `shot_note flask ladle bell` |
| `sheet_bursts` | `burst_star ring glint slash sparks puff`: cream with a brown outline, tinted by code |
| `sheet_marks` | `mark_scorch`, `mark_snow` |
| `sheet_bolts` | `bolt_0..5`: flat yellow zig-zags with a cream stripe and an outline |
| `zones_a/b/c` | `zone_frost` (ice-blue patch, scalloped white rim, snowflakes), `zone_snow` (white swirl, pale-blue outline), `zone_hole` (violet bands, near-black core, lavender rim line), `zone_holearms`, `zone_ooze` (green pool, dark rim, bubbles), `zone_puddle` |
| `sheet_foe_rings` | `foe_haste` (orange, dark chevrons), `foe_heal` (crimson, cream crosses) |
| `shield_bits_blue` | `badge_shield` (the badge by the health bar), `shard_0..4` |

Gone: `shield_dome`, `shield_crack1/2`, `shard_5` (pictures and code), `art/fx_v2/**`, the atlas shape `glow`, the `Light` colours nobody wears, the `lights` containers of the flecks, the shots and the areas, `ADDS` of the weapon marks, the `flare` mark, `FleckOpts.add`, `ProjectileLook.glow` and `.tint`. New atlas shape `tail` (a flat tapered streak: full at the head, a point behind it).

**What changed per effect**
- **Shots**: the picture keeps its own colours (no tint, no light); the trail is a flat tapered streak (`tail`, tinted a mid tone, opacity by `rankTrail`); what a shot sheds is flat (outlined puffs for dust, steam and gunsmoke, flat crystals, sparks, glints, bubbles), none of it additive. `ProjectileLook.shed` is `{ kind, color }`. The cast landings (frost, cosmic, flask) are a flat star or ring, crystals and drops in the kind's colour.
- **Marks**: all normal blend. A fireball's landing is the same flat star as a blunt blow (in `Light.warm`) plus the scorch decal (86 px, it was 104). The ring mark (bell, frost tick) is one lighter ring growing from 30 to 106 px (it was two, up to 166 px, in a heavy tint), and past six marks only a kill or a crit starts one.
- **Lightning** (`arcs.ts`): one flat outlined bolt flickering between the six drawn ones for 0.22 s and a flat yellow star where it lands (no second "echo" bolt, no light). The hostile storm bolt is still tinted warm.
- **Areas** (`areas.ts`): no glow, no shade, no light container, no rim ring. Each disc is the drawn base at 2.1 radii (it was 2.3: it is the reach and its outline now), one turning layer and flat particles. Frost: base, one swirl turning slowly, six flakes. Brew: the pool wobbling, seven bubbles rising and popping, the landing drops. Void: the hole turning slowly one way, its arms the other and faster, eight scraps spiralling in, four stars. The hostile rings are the drawn ring turning (the heal ring beats), 78 % opaque, with no extra particles. Landing: the base grows with an overshoot and one flat ring spreads in the kind's colour; warning: it draws in 10 % and blinks at 2 Hz at most, as before. Reduced motion and flashes-off rules are unchanged.
- **Piles of areas**: every 0.2 s the layer counts, for each friendly disc, the older friendly discs whose centres are closer than 0.75 of the two radii added (`OVERLAP`); `crowd` = that count / 3, smoothed (half-life 0.15 s). The newer area of a pile gets a base up to 45 % fainter, a swirl or arms up to 70 % fainter, and keeps `1 - 0.7 crowd` of its particles. The oldest is untouched, and the new one comes back to full when the older ones leave. Hostile rings never thin. Areas are drawn under the units, so they do not cover cats (looked at on all five chapters).
- **Shield**: a ring, see `field.md`. `Fx.shieldBreak` is three (low tier) or four small flat shards (`shard_*`, 15 to 22 px, spin, fall, fade in 0.45 to 0.65 s) and nothing else.
- **Numbers**: crits and boss hits (priority 2 and 3) stagger. A new big number looks for the nearest place that no live big number is on (right first, then left, a step as wide as the two numbers; if the row is taken, a row 52 px higher, three rows), and at most six big numbers live at once (a seventh sends the oldest away). A figure is drawn smaller rather than wider than 120 px (170 px for a big one). Crit size 40-56 became 36-50. Tests: `fx.numbers.test.ts` (+6).
- **Gallery** (`?demo=fx`): `shield idle / hit / nearly gone / break` play on the real `ShieldRing`.

**Colour of the shield: cobalt blue** (`Light.shield` 0x2f66e8, `Light.shieldRim` its pale highlight). Friendly effects use ice blue (pale, 0xbfe6ff), lime, violet, orange, yellow, pink and white, and a slowed enemy's body is tinted `Color.teal`; hostile ones are orange and crimson. A saturated royal blue is the one hue none of them wears. (First attempt: teal, thrown away because the slow status tints the body teal.)

**Measured** (the standard crowded scenario, 150 frames of tick + render + `gl.finish` after 120 of warm-up; `perf1.js` of the scratchpad: chapter 3, wave 21, speed 3, 20 cats of which 12 make areas, about 58 enemies with three shielded cones every 15 frames, 22 areas alive on average): yesterday's code 12.7 and 13.1 ms mean (13.0 to 13.3 without the cones), 74 draw calls; now **11.9 / 12.3 / 11.5 ms** mean, p50 10.0 / 10.6 / 9.8, p95 29 / 25 / 22, **67 draw calls**. With eighteen shielded cones spawned every 40 frames on top (about 119 enemies on average): 11.0 and 10.9 ms, 70 draw calls. The machine is noisy by about 1.5 ms: read it as "not slower, perhaps a little faster" (the glow sprites and the additive containers are gone, and the hostile rings lost their particles).

**Proof** (strips in the session scratchpad, `shots/fx3/`, Aside, `PAGE_ERRORS []` every time, stepped at 1/30 s): every ranged cat's shot and hit: `a1/shot_r_{sling,archer,ninja,gunner}`, `b1/shot_{r_star,m_snow,m_fire,t_bell}`, `c1/shot_{t_chef,t_bard,t_lucky,m_storm}`; the three areas from the throw on a lane with a crowd: `z1/zone_{m_frost,m_cosmo,t_alch}`; the shield: `s1/shield_break` (idle, hit, nearly gone, break), eighteen shielded cones side by side with a volley of hits: `s15/shield15` (and `zoom1`); the hostile rings and cells: `au1/aura1`; crowded late waves on all five chapters: `kk1..kk5`, the final stills `fin2` and `fin4` next to the cat in `art/fx_v3/_compare.png`; the gallery: `d1/demo_shield`, `d2/demo_break`. Tests: `fx.arcs`, `fx.flecks`, `fx.areas` (+5: no additive anywhere, a pile thins, far apart and hostile do not, the hole thins and comes back), `fx.numbers`, `view.field.shots`, `view.field.shield`, `view.warmup`.

**Not verified.** A real phone (touch, 60 fps); the sound of any of it. The hazard-tape frame of the wet and live cells (`hazardFrame.ts`) is still the flat cream and berry paper tape without a brown outline: it reads fine next to the drawn puddle and bolts, but it is the one effect shape that is not from the generator.

REQUESTS
1. `tools/process_art.py`: the `fx_shield_` prefix (320 px, kept centred) is no longer used by any picture; the docstring and `SPRITE_MAX` can lose it.
2. Core (`src/core/assets.ts`), as before: the 42 `fx_*` pictures (about 1 MB) are loaded at boot but only needed in a battle.
3. Audio (`src/audio`): a hit on the shield ring still plays the weapon's impact only; a short ping would finish it.


## 2026-10-08 damage numbers: out of the enemies' way

Owner feedback: "데미지 폰트가 몹을 다 가려버려". Measured on the standard crowded scenario before touching anything (chapter 3, wave 21, speed 3, 20 cats, about 33 enemies, 150 frames, the old default `full`): 11.6 numbers alive on average, **41 % of them standing on their own enemy and 94 % on another one**, 7 % under the HUD. Causes: a number started at the enemy's top (`y - radius - 6`) and was held at `minY` = HUD edge + 52 px, which on the top lane is the middle of the body; every hit made one (merged only within 100 ms); crits were 36 to 50 px stickers on a starburst up to 134 px wide, boss hits 56 to 80 px.

**The rules now** (`numbers.ts` for the objects, `numberPlan.ts` for the maths, no Pixi in the second):

1. **Placement.** A number belongs to an enemy's *box* (its picture and its health bar together, `bodyBox` in `view/field/policy.ts`: the drawn size from `bodySize`, the bar's top at `barRise`, and 5 % more on every side because a struck body squashes past its picture). `findSpot` tries, in this order, until one is free: above the bar (straight above, then shifted outward, then the other way; two rows for an ordinary number, three for a big one), below the feet, beside the body. "Free" means clear of the number's own box, of every other enemy's box, of the other numbers, of the HUD (`area.minY`, the HUD's lower edge: -18 in field space at 1280 high), of the screen's sides (8 px) and the bottom panel, and of the board with its cats (`area.keep*`, the board inset by 6 px). It starts a few px above the bar and drifts up (14 px) and outward along the lane's normal (10 px: left on the left stretch, right on the right one, nothing sideways on the top and bottom); the drift is cut short, to nothing if need be, where the room is not there. On the bottom stretch the place above the bar is the board, so it stands below the feet; on the top stretch there are 18 px between the HUD and the bar of a cucumber, so an ordinary number only fits above the smallest enemies and otherwise stands beside or below (in the gaps of the lane) or is not shown. A number wider than the lane (a four-digit crit is 74 px, the lane 82, and the room between the screen's margin and the board 86) is nudged in from the screen's edge, never onto the board.
2. **Following.** Every frame the director lists all enemy boxes (`fx.numbers.sense`, one `add` per enemy, no allocation) and each number goes with its enemy (and with the enemy's last speed when it dies, so the crowd does not walk into a number left standing in the lane). The place has to stay free for 70 % of the number's life with every other body moving at the speed it has now (relative to the enemy the number goes with); and a number that an enemy walks into (3 px deep; its own enemy too: the clamp under the HUD would push it onto its enemy) fades out within 0.08 s. A boss's number is the one exception: when nothing is free it settles for a place that is only clear of the boss itself, the HUD and the board, and it stays (the escorts of a boss are around it by design).
3. **One number per enemy.** Hits on the same enemy within `MERGE_WINDOW` (0.3 s from the first) are one number: its figure adds up, it swells 20 % and settles in 0.12 s, and it is kept readable for at least 0.12 s more. A hit after the window starts the figure again (same place, searched again). A crit or a killing blow over an ordinary number turns it into one big number with the damage of both; an ordinary hit after a big one adds to it. Damage-over-time ticks and what a shield soaked have a slot of their own (one quiet number per enemy). Hits that were not shown (too small for the level, no room) still add up in a 0.3 s window (`Pending`), so several small hits can earn the number that none of them would. An enemy that found no place is not looked for again for 0.12 s.
4. **Size and weight.** Ordinary numbers: digits 20 to 22 px high with their outline (a thin stroke, 7 of the 64 px the face is baked at), 72 px wide at most (a longer figure is drawn smaller), held at 78 % opacity, 0.5 s. Ticks and soaks: 15 to 17 px, 62 %, 0.5 s. Big ones (crit mustard with a "!", killing blow coral, a boss's hit of 20 % of its health or more mustard with a "!", damage taken berry): 30 to 36 px with the thick stroke (12 of 64), 74 to 76 px wide at most, full opacity, 0.8 to 0.9 s, popping to 120 to 125 % and settling at 100 %. The starburst sticker behind a crit is gone. Figures are written with `fmt` (the short number format of the language: "1,234", "48.2K" in English, "4.82만" in Korean), so the face fonts carry 만, 억 and 조 as well. Below 10,000 `fmt` groups with `toLocaleString`, which builds a number formatter on every call (about 50 microseconds, on every hit that asks for a place), so `shortFigure` writes the same text by hand (a test checks it against `fmt`). A figure's width is worked out from its characters and never read from the text object (that lays it out on the spot, for every merged hit).
5. **The crowd rule** (`NUMBER_LEVELS` in `settings.ts`). The field is cut into 4 x 4 regions (180 x 156 px). Each level allows so many ordinary and so many big numbers per region and on the whole screen, and so many new ones per frame (table below); the tier's `numbers` cap (12 / 24 / 40) is shared. When a limit is reached the lowest ranking number that ranks below the newcomer is sent away for it (rank: priority first, a boss's hit 3, crit / kill / damage taken 2, an ordinary hit and heals 1, a tick or a soak 0; then the larger figure), and when there is none the newcomer is not shown. This check is made first: a number that may not be shown does not look for a place at all. At most three places are looked for per frame.
6. **Levels.**

| Level (ko / en) | Ordinary hit | On an elite or a boss | Crit, killing blow, boss heavy hit, damage taken | Burn, poison, bleed tick | What a shield soaked, heals, gold | Ordinary numbers: per region / alive / new per frame | Big numbers: per region / alive / new per frame |
|---|---|---|---|---|---|---|---|
| 끔 / Off | none | none | none | none | none | 0 / 0 / 0 | 0 / 0 / 0 |
| **간략 / Brief (the default)** | the merged hit is 6 % of the enemy's health or more | 1 % or more | always | never | never | 1 / 4 / 1 | 1 / 3 / 2 |
| 전체 / All | any | any | always | 2 % or more | yes | 2 / 8 / 2 | 2 / 5 / 3 |

Every level obeys 1 and 2: the levels only change how much is shown. The default is `brief` for a new player (`SettingsData` in `view/hud/settings.ts`, and `fxSettings`); a save that stored `full` (the old default; the store cannot tell it from a choice) keeps `full`, which is calm now too. Both settings screens (the one in a battle and the one of the shell) show a line under the row: "간략은 치명타·처치·큰 피해만, 전체는 일반 피해까지 보여요." (`hud.set.numbers.hint`, `rt.sys.numbers.hint`).

**Code.** `numbers.ts` and `numberPlan.ts` (new); `settings.ts` (`NumberLevel`, `NUMBER_LEVELS`, default `brief`); `view/director/combat.ts` (`say()`: one call per hit with a reused `NumberTarget`; the density rules, `NumberAggregator`, `numberDensity` and `shouldShowNumber` are gone from `policy.ts` with their tests); `view/director/stage.ts` (`EnemyInfo` has the box); `view/field/policy.ts` (`bodySize`, `bodyX`, `barRise`, `barOffset`, `barWidth`, `bodyBox`; `EnemyView` uses them, so the picture and the numbers cannot disagree); `view/field/index.ts` (`clampNumbers` sets `numbers.area` from the layout: HUD edge, bottom panel, sides, board; the old `NUMBER_CLEAR` of 52 px is gone); the two settings screens and their strings. New styles `kill` and `soak`; `NumberOpts` is `{ color, scale, target }` (`key` and `noScatter` are gone: a number without a target stands above its point and is placed by the same rules).

**Measured** (Aside, `PAGE_ERRORS []` every run, `scratchpad/num/scn2.js` and `scn3.js`, 150 frames after a warm-up, 33 enemies on average; the overlaps are counted on the real sprite and bar bounds with the squash of a hit, a different measure from the planner's own boxes; "on another enemy" = overlapping another enemy's picture or bar by more than 4 px squared):

| Chapter 3, wave 21, speed 3 | number-frames | alive (avg / max) | on its own enemy | on another enemy | under the HUD |
|---|---|---|---|---|---|
| before, All (the old default) | 1742 | 11.6 / 12 | 718 (41 %) | 1631 (94 %) | 126 (7 %) |
| before, Brief | 685 | 4.6 / 6 | 0 | 659 (96 %) | 126 (18 %) |
| after, All | 255 | 1.7 / 4 | 8 (3 %) | 21 (8 %) | 9 (4 %) |
| after, **Brief (the default)** | 93 | 0.6 / 2 | 0 | 9 (10 %) | 1 |
| after, Off | 0 | 0 | 0 | 0 | 0 |

| Chapter 3, wave 8 (boss_bath), speed 3 | number-frames | alive (avg / max) | on its own enemy | on another enemy | under the HUD |
|---|---|---|---|---|---|
| before, All | 1717 | 11.5 / 12 | 376 (22 %) | 1370 (80 %) | 31 |
| before, Brief | 900 | 6.0 / 6 | 0 | 720 (80 %) | 31 |
| after, All | 813 | 5.4 / 8 | 0 | 105 (13 %), 90 of them the boss's own numbers over its escorts | 0 |
| after, Brief | 546 | 3.6 / 5 | 0 | 90 (16 %), 81 of them the boss's | 0 |

The few remaining overlaps are the pop (a number swells to 120 % for a tenth of a second and is only kept clear at 110 %: up to 2 px), the squash of a struck body, and an enemy that has just spawned at the start of the path next to a number (the number is gone within 0.08 s); apart from the boss's numbers they are 2 % of the number-frames. Stills and strips are in the session scratchpad, `shots/num/{before,after}_w21_{full,brief}`, `after_w21_off` and `{before,after}_boss_{full,brief}` (`still_*.png`: frame 106 of the 150, the field at 1:1; `strip_*.png`: frames 100 to 121 every third, half size); the settings screens: `set1/sys_settings_ko.png` (the shell's) and `set2/battle_settings.png` (the battle's).

**Speed** (the standard crowded scenario of this file: chapter 3, wave 21, speed 3, 20 cats with 12 zone makers, about 58 enemies, 150 frames of tick + render + `gl.finish` after 120 of warm-up, `perf1.js` with the level set; four pairs, the working tree and the stashed one one after the other). The numbers' own cost (`show` + `update` wrapped in `performance.now()`, per frame over 270 frames): **before All 0.33 ms, Brief 0.06 ms; after All 0.15 ms, Brief 0.12 ms** (the first version of the new code cost 0.4 to 0.5 ms: 72 microseconds of `toLocaleString` per try and a forced text layout per merged hit; both are gone). Whole frame, mean / p50: All 11.76 / 10.05 ms before, 11.98 / 10.08 after; Brief 11.53 / 9.8 before, 12.12 / 10.2 after; 67.4 draw calls a frame in all of them. This machine moves by 1.5 ms between runs of the same code, and the control run with the numbers switched off in both builds (`perf5.js`, three pairs) still reads 11.35 before and 11.93 after, so the 0.2 to 0.6 ms of the whole frame are not the numbers' (the machine, or the order the pairs ran in; the numbers themselves are 0.12 to 0.15 ms of the frame). Pooled: 6 to 8 text objects were ever made in a run; nothing is made per frame except the three figures a frame may look a place for (typed arrays for the bodies, boxes and sums, one reused target and one reused options object in the director).

**Tests.** `fx.numberPlan.test.ts` (17: above the bar, the drift and its direction on each stretch, never inside its own body, another body, another number, the board or off the screen over 360 random lanes, a row of enemies leaves no place, a place an enemy is about to walk into is not one, a boss's relaxed place, the bodies' speeds, `crossed`, the merge window, regions, ranks), `fx.numbers.test.ts` (41: the levels and what each shows, the default, the merge window and its bump, one number per enemy and its quiet slot, a crit and a kill over an ordinary number, `fmt` and the Korean units in the faces, `shortFigure` against `fmt`, sizes and opacities, long figures shrink, never on the body, drifting outward on both sides, never under the HUD, the bottom stretch, a wide figure nudged in, going with its enemy and on after its death, giving way, a boss among a crowd, a row of enemies, sparse against packed, the per-frame / per-region / whole-screen budgets and who goes first, pooling), `view.director.numbers.test.ts` (5: what the director asks for on each kind of hit: the boxes it lists, the target's fields, crit / kill / big / tick / soak, a hit that did nothing), `view.field.policy.test.ts` (+4: the body's size, its x at the screen's edge, the bar, the box), `screens.settings.test.ts` (+2: the default and each level reaching the effects); the director's policy tests lost the three number tests with the code.

**Not verified.** A real phone (the numbers are 20 to 22 design px: 11 to 13 css px on a 390 px wide screen) and the sound. Known limits: (a) on the top lane there is nothing above most enemies (the HUD's edge is 18 px over a cucumber's bar), so a plain number there stands in a gap of the lane or is not shown; in a packed column on a side lane only the enemy at the end of the column has room, which is the intent of the crowd rule but means an ordinary hit on the middle of a column shows nothing, at All too; (b) the boss's numbers lie over its escorts (above); (c) saves with `full` keep it; (d) the strips come from a harness that spawns whole groups at the start of the path at once, so the top-left corner is busier than in a real wave. **Seen on the stills and not touched:** the swing and burst marks of the warriors' weapons (`WeaponMarks`) are 200 to 300 px and cover a whole lane for a moment (tiger, samurai and viking on the left lane in the stills of the standard board); with the numbers out of the way they are what hides the enemies most.

REQUESTS
1. Field (`view/field/weaponMarks.ts`; in my paths but not this job): the warriors' swing marks cover the lane (above); smaller or thinner marks while the crowd is large would finish what the numbers started.
2. Core (`src/core/format.ts`, not my path): `fmt` below 10,000 builds a `NumberFormat` on every call through `toLocaleString`; one cached formatter would make `shortFigure` in `numbers.ts` unnecessary (delete it and call `fmt`).
3. Meta (`SettingsData` version): if the owner wants every existing `full` save moved to `brief` once, bump the store's version and migrate `numbers`; it is not done because a deliberate `full` cannot be told from the old default.


## 2026-10-08 tuning: quiet auras, small shots, readable numbers

Owner feedback on the build after the restyle ("몬스터 결계 이펙트 너무 크고 과해 ... 데미지 폰트가 너무 작아서 안 보이고 투사체 그림이 너무 크게 나오는듯"). The field's share (which carriers wear a ring, the swing marks, the toy marks on the board) is in `field.md`, "2026-10-08 tuning"; this is what changed in `src/fx`, and the director's recipes.

**Hostile aura rings (`areas.ts`, `textures.ts`, `Fx.enemyRing`).** The clock's haste and the pill's mending were a 252 px picture (2.1 x the aura's 120 px reach) with a 12 to 16 px orange or crimson band at 78 % opacity, up to four stacked on a lane. Now a carrier wears **one thin line round its body**: `Fx.enemyRing(kind, x, y, radius, reach = 0)` takes the ring's radius (the field passes half of `ringWidth(bodySize)`: 57 px across on a clock, 54 on a pill), not the aura's. The line is drawn from three new atlas shapes (`auraDash`: twelve short strokes for haste, `auraBead`: a plain line with four beads for mending, `auraReach`: a dotted circle), tinted `Color.coral` and `Color.berry` (the colours of the stickers the helped enemies wear), about 3 px thick, 80 % opaque, turning slowly (the heal ring beats by 3.5 %); no outline, no fill, no landing ring (`DiscLook.land` may be null), no particles. `reach` draws the aura's real radius (240 px across) as a dotted line at 32 % for 0.3 s after the ring opens and fades it over 0.8 s, so the range is hinted once and then gone; the field only asks for it for a young carrier where no ring of its kind already shows that ground. `foe_haste` and `foe_heal` (two 392 px pictures) are not drawn any more: removed from `PAINT_IDS` and `AREA_PICTURES` (the two kinds list nothing to warm; the `webp` files and the cut in `art/fx_v3/build_fx.py` are left, see REQUESTS). `Light.hotComet` and `Light.bloodCross` went with them. The vaccinate boss's `fx.buffAura` lost its thick ring (`ringThick` became the thin `ring` at 50 %) and its pulse is 1.9 x the ring, not 2.5 x, at 40 %.

**Shots (same cats, same pictures as the "restyle" table).** Sizes are the picture's width at the lowest rank, where a 90 px cat stands next to it: pebble 36 -> 20, arrow 88 -> 34, shuriken 48 -> 24, cork 50 -> 24, moon arrow 96 -> 36, snowball 46 -> 26, fireball 80 -> 30, bell 60 -> 24, ladle 72 -> 32, note 52 -> 22, coin 44 -> 20; the casts: ice shard 80 -> 36, dark star 58 -> 28, flask 54 -> 28. Top rank grows at most 20 % (it was 24 %): `rankSize = 1 + 0.05 x rank`; the thrown arc's swell is 10 % (was 22 %). Trails are shorter and thinner (length x width, px: pebble 18 x 6, arrow 28 x 3, shuriken 20 x 5, cork 36 x 8, moon 44 x 4, fireball 26 x 10, ice 34 x 6, star 26 x 10). What a shot sheds and what a cast leaves where it lands (flecks, rings, drops) shrank by the same ratio (a dust puff 8 to 16 px, a landing ring 20 to 76 px). The director's bursts follow (`view/director/defs.ts`): `HIT_FLASH` 46 -> 82 px became 28 -> 52, `HIT_SPARK` 26..40 became 16..26, `IMPACT_PUFF` 36 -> 78 became 22 -> 48, `MUZZLE_FLASH` 42 became 26, `CAST_RING` 30 -> 104 became 20 -> 64, `SHIELD_GLANCE` 22 -> 70 became 16 -> 46, and `Fx.critBurst` (star 26 -> 112, starburst 60 -> 170) became 18 -> 62 and 34 -> 84 with sparks of 16..26. An impact is about the enemy's own size (a cucumber is 56 px).

**Numbers (`numbers.ts`).** Ordinary hits 20 to 22 px high became **28 to 30**, drawn with a 10 (was 7) of 64 baked-px outline, full opacity (it was 78 %), alive 0.7 s (0.5); crits and killing blows 30 to 36 became **40 to 44** (outline 15, was 12; 0.85 s), a boss's heavy hit 42 to 46, damage taken 34 to 38, heals and gold 28 to 30, ticks and soaked damage 15 to 17 became **21 to 23** (85 % opaque, 0.55 s). The widest a figure is drawn: 100 px (ordinary), 112 (crit, kill), 120 (boss), 64 (tick); a longer figure is drawn smaller. **The room beside the board decides the rest**: on a side stretch of the lane (|sin of the heading| over 0.7, or a point with no body outside the board's columns) a number has only the strip between the screen's edge and the board (88 px at 720 wide: 76 px after the 2 px kept on each side and the 10 % of the pop), so a figure there is drawn no wider than that (`FloatingNumbers.widthFor`): a "1,234" crit is about 24 px high on a side stretch and 42 px on the top and bottom ones, and is not left out. The placement rules, the merge window, the levels and the crowd budget are unchanged.

**Measured** (the standard crowded scenario, Aside, `PAGE_ERRORS []`, `scratchpad/tune/scn2.js` and `scn3.js`: chapter 3, wave 21, speed 3, 20 cats, 32.7 enemies on average, 150 frames; "on another enemy" is the overlap of the real number and enemy bounds, as in the last pass):

| | number-frames | alive (avg / max) | on its own enemy | on another enemy | under the HUD |
|---|---|---|---|---|---|
| All, before this pass | 255 | 1.7 / 4 | 8 (3 %) | 21 (8 %) | 9 |
| All, now | 223 | 1.5 / 4 | 3 (1 %) | **20 (9 %)** | 0 |
| Brief (the default), before | 93 | 0.6 / 2 | 0 | 9 (10 %) | 1 |
| Brief, now | 70 | 0.5 / 2 | 0 | **5 (7 %)** | 0 |
| Off | 0 | 0 | 0 | 0 | 0 |
| Boss wave (chapter 3, wave 8), All, now | 593 | 4.0 / 8 | 6 (1 %) | 61 (10 %), 51 of them the boss's own | 0 |
| Boss wave, Brief, now | 460 | 3.1 / 5 | 4 | 71 (15 %), 65 the boss's | 0 |

The share over an enemy stayed where it was (7 to 10 %), with a few fewer numbers on the screen (the bigger the number the fewer places are free); the frame cost is unchanged: the standard scenario of the restyle pass (`perf1.js`: 58 enemies, 22 areas, speed 3) reads mean 12.8 / 11.9 / 12.0 ms, p50 10.1 / 9.8 / 10.5, 67.4 draw calls, against 11.9 / 12.3 / 11.5 ms and 67 then (this machine moves by 1.5 ms between runs); the toy marks are 180 pooled sprites (three toys, made once with the field) and cost nothing measurable. Stills: `shots/tune/num_w21_{full,brief,off}`, `num_boss_{full,brief}`.

**Tests.** `fx.numbers.test.ts` (sizes 28 to 30 / 40 to 44 / 21 to 23, opacity, lives, widths, a long figure on a side stretch is drawn small and not left out, the bottom stretch when the panel leaves room and when it does not), `fx.areas.test.ts` (+4: the ring is the body's size and a thin line, the hint is faint, fades and is not drawn unless asked, reduced motion), `view.field.shots.test.ts` (+2: sizes by kind, trails), `view.warmup.test.ts` (no foe ring pictures).

**Not verified.** A real phone (the numbers are 28 to 44 design px: 15 to 24 css px on a 390 px wide screen; the thin carrier rings are about 1.7 css px); the sound.

REQUESTS
1. Art (`src/assets/img/fx_foe_haste.webp`, `fx_foe_heal.webp`, 2 x 15 KB; `art/fx_v3/build_fx.py` and `sheet_foe_rings.png`): no longer used by anything, delete them (every image is loaded at boot).
2. Demo (`src/demo/FxDemo.ts` lines 768 and 769): `fx.enemyRing('haste', c.cx, c.cy, 80)` now draws a 160 px ring; a body is 29 across and the reach 120: `fx.enemyRing('haste', c.cx, c.cy, 29, 120)`.
3. As before: lazy loading of the `fx_*` pictures (`src/core/assets.ts`), a shield-hit ping, `fmt` below 10,000.


## 2026-10-09 batch

Two small things on the fx side of the 5 x 5 board (the rest is in `field.md`): `numberPlan.ts` cuts the 720 x 660 field into 4 x 4 regions (`REGION_H` 165, was 156), and `fx/marks.ts` has `drawBuffMark` / `BuffMarkKind` (the badge of a cat a trickster helps, baked by the field's art and drawn on the selection sheet's chips). The frame time of the standard crowded wave before and after the board change is in `field.md` (mean 11.4 to 12.7 ms before, 10.5 to 12.3 after, 20 or 25 cats); its script is `tools/crowded_wave.js`.

REQUESTS: none.


## 2026-10-10 batch 2: special cells (`src/fx/cells.ts`)

`Fx.specialCell(rect, id, { delay? })` replaces `sunbeamCell` (and `drawSunMark`, `ZoneOpts` is unchanged): the picture, halo, glint, ring, emblem and one sparkle emitter of a chapter's special cell, as one `Loop` (`ZoneHandle`: `stop()` fades it out in 0.5 s). `CELL_LOOKS[id]` = `{ tile, badge, glow, spark, rises }` (image keys `cell_<id>` / `icon_cell_<id>`, the halo colour as a kit token, what the emitter sends), exported with `EMBLEM` (46), `CELL_ARRIVE_GAP` (0.09), `CELL_TOUCHDOWN` (0.2). `delay` omitted: simply there; given: hidden until then, then the drop-in with flash, ring and emblem pop (`field.md` has the numbers); `fxSettings.reducedMotion` is read each frame (the arrival is skipped for a loop that was created calm; a loop that was created with motion and then switched to reduced settles at once to the still picture). Nothing is allocated per frame: the tile and emblem are plain `Sprite`s of the loaded images (owned by the loop, destroyed with it), the halo / ring / glint are three `Graphics` drawn once. `FxDemo` lists the five kinds in place of the sunbeam.

Tests: `tests/fx.cells.test.ts` (8: the parts and the clean end of every kind, where it sits, the halo breathes and never goes dark, the emitter by kind, the arrival and the settle, no arrival without a delay, reduced motion, no new object while it loops). `tests/fx.zones.test.ts` and `fx.specials.test.ts` no longer name the sunbeam.

REQUESTS: none.
