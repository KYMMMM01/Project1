# Handoff: director (battle staging), paper scrapbook restyle

Date 2026-10-06. Module `src/view/director/**`, tests `tests/view.director.policy.test.ts` and `tests/view.director.palette.test.ts`.
Entry point `createDirector(ctx): DirectorPart` (`src/view/director/index.ts`), built against `src/view/context.ts` only. It subscribes to `ctx.battle.events` and stages every moment on top of the playfield through `ctx.fx`, the fx screen / flight / cut-in helpers, `audio`, `haptic()` and `game.shake()` (via `fxShake`). It never blocks input and never waits for an animation. Timing, caps, pooling and sounds are as before; this pass changed the look only.

## The paper look of the staging

- **Banners** (`banners.ts`) are paper. `BannerSpec.color` is now the PAPER colour of the piece, text is dark ink (`Color.inkDeep`), one strip of tape at most:
  - `top` (wave start, call next) and `caption` (synergy, relic, ability, hazard, enrage): a torn paper label (`drawPaper` with torn ends, own `paperSeed()` per lane, flat shadow). The wave label carries one gingham tape strip; the caption does not. It drops in with a small tilt that settles (`backOut`), exits lifting and tilting back; reduced motion fades.
  - `alert` (boss and elite warning): a paper ribbon with hazard tape (ink strips with mustard slants, flat) along both edges, sliding across with the blinking warning icon, the word and the name in ink. Boss = berry paper, elite = coral paper.
  - `big` (act clear, boss defeated, victory, nine lives): a torn ribbon in the banner's colour with a sky dotted tape strip, title and optional sub line in ink, unrolling from the middle (`scale.x` with `expoOut`) in front of a flat paper sunburst (the atlas `sun` shape) that pops with an overshoot and turns slowly. Reduced motion: fade, no burst.
- **Boss intro**: the warning ribbon above, the red edge pulse (`fx.bossWarning`, now `Hue.alarm`) and the dust sifting from the top edge in warm kraft smoke; landing and death staging are `fx.md`'s (flat bursts, warm smoke, no purple).
- **Overflow numerals** (`flow.ts`): the big countdown digit is a sticker numeral (alarm red with a thick cream outline) and the warning line is on-art text.
- **Colours** (`palette.ts`, `defs.ts`, `boss.ts`, `combat.ts`, `growth.ts`, `deaths.ts`, `currency.ts`, `flow.ts`): no hex literals left. Every colour is a kit token or a mix of two through `Hue` (`src/fx/palette.ts`, the one local palette object, see `fx.md`). Class colours are `CLASS_HUE` (warrior coral, ranger leaf, mage rare blue, trickster mustard) and are the same object the field uses. Dot numbers pick their face colour (burn ember, poison dark leaf, bleed berry); a shield soak uses sky. The cosmetic summon themes use heart / ice / paw tones from `Hue`.

## What exists

| File | Role |
|---|---|
| `policy.ts` | Pure staging rules, unit tested: `GapGate`, `WindowLimiter`, `FrameBudget`, `KeyedGate` (per-enemy cue spacing), `PitchLadder` (kill streak / merge chain / coin ticks), `HitStopGate` (one global hit-stop per 400 ms, 200 ms cap, 50 ms when reduced), `NumberAggregator` + `numberDensity` + `shouldShowNumber`, `FlightLedger` + `iconsFor` + `shareOf`, `BannerQueue`, `SummonRate` + `summonPlan`, `IntensityMeter` + `intensityTarget`, `dangerStrength`, `heartbeatInterval`, `overflowSeconds`, `SoundRule` (gap + concurrency window + shared pool) |
| `palette.ts` | Data: enemy tints, cat colours, class colours (`CLASS_HUE`), shoot cue per cat (sfx, pitch, gain, swing / shot / cast), status colours and sounds, cosmetic summon themes (`themeOf('fx_gem1..3')`); all colours are paper tokens |
| `defs.ts` | Module-level particle recipes (hit spark, muzzle, impact, status cues, wind, whirl, splash, ...), so no hit builds an object |
| `stage.ts` | `Stage`: director clock, sound rules (one chatter pool of 9 starts per 0.3 s keeps the 24 audio voices free for big moments), rationed shake / hit-stop / slow-mo / haptics, tracked timers, frame hooks, `Bus` |
| `banners.ts` | `BannerService`: four pooled lanes (top label, caption label, hazard-tape warning ribbon, big unrolling ribbon over a sunburst), each a `BannerQueue` |
| `currency.ts` | `CurrencyService`: fish / hearts flights (12 / 8 icons in the air at most, value split across icons, tick per arrival climbing the pentatonic scale); big kills wait for their death staging |
| `music.ts` | `MusicService`: `battle` at run start, `boss` during boss waves, smoothed intensity, ducking, silence for victory / defeat |
| `combat.ts` | attack cues, hits, numbers, statuses, pull, heal, shield break, strikes per source, projectile impacts, zone sounds |
| `deaths.ts` | ordinary / elite / boss deaths, kill-streak ladder, `fish` / `purr` routing |
| `growth.ts` | summon reveal by rarity (+ theme + thinning), merge (+ chain pitch, snack-stick flourish), molt, awakening cut-in, synergy, upgrades, sunbeams, relic gain, sell, move / swap |
| `boss.ts` | warning band, landing, enrage, boss abilities, hazard warn / start, weakened cats, laser |
| `flow.ts` | wave / call-next / act-clear banners, danger vignette + heartbeat, overflow numerals, nine lives, defeat, revive, victory, `finished` |
| `strings.ts` | `director.*` ko / en strings |

## How it is wired

- `createDirector(ctx)` builds `Stage`, then `BannerService`, `CurrencyService`, `MusicService`, then mounts the five handler modules, each of which registers its `ctx.battle.events` listeners through one `Bus` (all released in `destroy()`).
- `update(dt)` takes real seconds. It advances the director clock, refills per-frame budgets, updates banners, the overflow countdown, heartbeat, music intensity and pending loot. `resize(layout)` re-places the banner lanes.
- Time domains: effects that must stay in step with the simulation (strike staggers, boss finale beats, loot release) use `ctx.tweens`; banners, flights and the end-of-run flow use `ctx.ui` (real time), so a hit-stop never stretches them.
- Caps: global hit-stop goes through `HitStopGate`; shake goes through `fxShake` (trauma clamp) with per-source spacing (boss crit kick every 0.4 s, so it cannot build up); flashes go through `screenFx.flash` (alpha 0.45, one per 0.5 s); the red edge pulse uses `fx.bossWarning()` / `vignettePulse` (at most 2 Hz). Reduced motion: no slow motion, hit-stop 50 ms, banners fade instead of moving; flashes off: `screenFx` drops them.
- Defeat desaturates the field roots (one shared `ColorMatrixFilter`, removed on revive / destroy) and slumps the cat views (restored exactly on revive); `finished` is emitted once per ending, 1.1 s after defeat, and after the boss finale plus 2.2 s after victory. A revive cancels a pending `finished`.
- Debug: `window.__dbg.director.stats()` returns fx stats, audio counters, sounds started by id, banner depth, flights in the air and music intensity.

## Verified

- Types: `npx tsc --noEmit` prints nothing for the whole tree. Unit tests: `npx vitest run tests/view.director` = 2 files green; `view.director.palette.test.ts` now also checks that nothing in the staging palette is purple (hue 255 to 320 with saturation over 0.2 across enemy tints, cat colours, class colours, statuses, dot numbers, summon themes, `Hue`, confetti), that the class hues are the field's four distinct papers, and that no shared hue is pure white or black.
- Browser (Aside, `PAGE_ERRORS` `[]`), screenshots in `scratchpad/shots/field/`: `s2_boss_warning` (hazard-tape ribbon), `en_banners` and `en_tall` (wave label and warning in English at 720 x 1600), `s2_cutin_b` and `s11_cutin_hold` (awakening collage), `s9_victory_a/b` (the unrolled "victory" ribbon, confetti), `s6_defeat_a/b` (greyscale field, overflow), `s2_hazard_warn` and `s2_hazard_warn2` (hazard telegraphs), `crowd1/2` and `ch1` to `ch5` (damage and crit stickers, flights, banners on each chapter).
- Timing and load from the earlier pass are unchanged (the same events, queues and caps); the crowded-wave frame time is in `field.md` (no change).

Not verified: the banner's reduced-motion variants (fade instead of move) and the low quality tier by eye; sound itself; the awakening dim at the very first frames (the dim is `Dim.backdrop`, warm brown); the boss landing and death in close-up on the new flat bursts (they fire without errors and share the presets listed in `fx.md`).

## Known gaps

- Camera zoom punches (wave clear 1.00 to 1.04, summon zoom) are not done: the scene owns the camera and the contract has no zoom hook.
- The boss finale and the loot release run on the battle clock (as `fx.bossDeath` does), so at 3x speed they play three times faster. Banners and flights stay real time.
- The slump of cats on defeat writes `rotation` and `scale` of the unit view containers; the field's idle animation should only touch their children (it did at the time of writing).
- Enemy tints are chosen by eye from the art, not sampled.
- Music LPF under danger (guide D-01) is not possible: the audio API has no filter control.

## REQUESTS

none

## 2026-10-07 polish

**Routine banners no longer cover the board.** The wave label (`top` lane) and every caption (`caption` lane: synergy, toy gained, enrage, boss ability, hazard, elite defeated) live in the free band between the top HUD and the board's sheet. `bannerSlots(layout)` (`src/view/layout.ts`, pure, tested in `tests/view.field.layout.test.ts`) puts the two rows flush against the sheet (8 px clear of its tape), wave label above caption. The band is 88 px on 1280 (rows at scale 0.92: label 52 px, caption 40 px, text 31 / 24 px), 252 px on 1600 (scale 1); below scale 0.8 the rows spill into the sheet's 14 px margin, and they shrink to 0.6 at most to stay off the first cell. A row drops 8 px with a small pop and tilt instead of travelling 100 px; reduced motion fades in place. Holds: synergy and toy captions 1.1 -> 0.9 s. "Elite defeated" moved from the big centre ribbon to the caption lane (three per run). Only these take the centre: boss and elite warning ribbon, boss defeated, act clear, nine lives, victory (plus the overflow countdown and the awakening cut-in, unchanged). Proof at 1280 Korean and English and at 1600: `b2_stack_ko/en/ko_tall`, `b2_ability_*`, `b2_call_*`, `b2_alert_*`, `b2_act_*`, `b2_rescued_*`, `sheet_b2_en.png`, `sheet_b2_tall.png`.

**Missing haptics added** (`growth.ts`): sell (light), move and swap (tap), class and summon-grade upgrade (light). Their sounds already existed.

Verified under both motion settings, see hud.md ("Aside reports prefers-reduced-motion").

## 2026-10-07 QA fixes

See `battle.md`. Director side: the boss / elite warning ribbon is a 100 px strip on the lane's top run (`BAND_H`, `PATH_TOP`), the swap sound is pitched a third above the move sound, hints wait for banners (`Hints.hold`, wired in `hud/index.ts` to `waveStart`, `synergy`, `relicGain`, `actClear`, `bossAbility`, `hazardWarn`, `enrage`, `rescued`).
