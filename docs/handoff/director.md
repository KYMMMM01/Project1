# Handoff: director (battle staging)

Date 2026-10-06. Module `src/view/director/**`, tests `tests/view.director.policy.test.ts` and `tests/view.director.palette.test.ts`.
Entry point `createDirector(ctx): DirectorPart` (`src/view/director/index.ts`), built against `src/view/context.ts` only. It subscribes to `ctx.battle.events` and stages every moment on top of the playfield through `ctx.fx`, the fx screen / flight / cut-in helpers, `audio`, `haptic()` and `game.shake()` (via `fxShake`). It never blocks input and never waits for an animation.

## What exists

| File | Role |
|---|---|
| `policy.ts` | Pure staging rules, unit tested: `GapGate`, `WindowLimiter`, `FrameBudget`, `KeyedGate` (per-enemy cue spacing), `PitchLadder` (kill streak / merge chain / coin ticks), `HitStopGate` (one global hit-stop per 400 ms, 200 ms cap, 50 ms when reduced), `NumberAggregator` + `numberDensity` + `shouldShowNumber`, `FlightLedger` + `iconsFor` + `shareOf`, `BannerQueue`, `SummonRate` + `summonPlan`, `IntensityMeter` + `intensityTarget`, `dangerStrength`, `heartbeatInterval`, `overflowSeconds`, `SoundRule` (gap + concurrency window + shared pool) |
| `palette.ts` | Data: enemy tints, cat colours, class colours, shoot cue per cat (sfx, pitch, gain, swing / shot / cast), status colours and sounds, cosmetic summon themes (`themeOf('fx_gem1..3')`) |
| `defs.ts` | Module-level particle recipes (hit spark, muzzle, impact, status cues, wind, whirl, splash, ...), so no hit builds an object |
| `stage.ts` | `Stage`: director clock, sound rules (one chatter pool of 9 starts per 0.3 s keeps the 24 audio voices free for big moments), rationed shake / hit-stop / slow-mo / haptics, tracked timers, frame hooks, `Bus` |
| `banners.ts` | `BannerService`: four pooled lanes (top pill, caption pill, hazard-stripe warning band, big centre text with rays), each a `BannerQueue` |
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

- Types: `npx tsc --noEmit` prints nothing for `src/view/director` and `tests/view.director*`.
- Unit tests: `npx vitest run tests/view.director` = 2 files, 32 tests (gates, ladders, hit-stop spacing, number aggregation and density, flight accounting, banner queue, summon thinning, intensity smoothing, danger and overflow maths, sound rule pool, palette coverage and theme mapping).
- Browser (Aside), real `BattleScene` at `?scene=battle&chapter=1&seed=7&sandbox=1&debug=1&runs=3`. The page's rAF is throttled under automation, so the game clock was driven by hand (`game.tick`) with `app.ticker.speed = 0.0005` so screenshots do not advance time. Looked at (PNGs in the session scratchpad `shots/director`):
  - wave pill ("2막 · 웨이브 8", skull icon on boss waves), caption pill (synergy), awakening cut-in with portrait, name and tag, warning band with hazard stripes and boss name, inhale (caption plus wind streaks converging on the boss);
  - boss death: flicker on the field's own boss sprite, rings, white flash, coins and fish flying, "보스 격파!", then "승리!" with confetti, then the HUD result screen. Timing from the game clock: kill 4.3 s, victory event 5.7 s, `finished` 10.4 s (the scene's own fallback would fire at 13.7 s);
  - overflow: big "2" then "1" with the warning line, the HUD's own countdown beside it; defeat: field in greyscale, `finished` 1.1 s after the defeat event, HUD "continue?" popup;
  - act clear ("1막 클리어!" with confetti), zap hazard (bolt from the top edge onto the cells plus caption), nine-lives rescue banner.
  - Earlier on a throwaway harness (removed): summon reveals tier 0-3, epic and legendary merge (with snack-stick flourish), molt puff, first-run cut-in.
- Load: 3x speed, 40 bunched enemies of nine types for 600 frames: particle objects created plateau at 114 (never grow), floating numbers stay at the tier cap, flights return to 0, banners drain to 0, timers steady. Audio: about 20 sounds started per real second at 3x, peak 21 simultaneous voices of the engine's 24, zero drops from the global voice cap (before the shared chatter pool the same run dropped 190).

Not verified: sound itself (the automated page cannot unlock audio in a visible way; only the engine counters), haptics, reduced motion and the low tier by eye, the three cosmetic summon themes, the blender whirl, splash and vaccinate abilities, status cues and strike shapes in close-up (they fired without errors; only the chain bolt and a stun / freeze frame were glimpsed), and the cats' defeat slump (too small to judge).

## Known gaps

- Camera zoom punches (wave clear 1.00 to 1.04, summon zoom) are not done: the scene owns the camera and the contract has no zoom hook.
- The boss finale and the loot release run on the battle clock (as `fx.bossDeath` does), so at 3x speed they play three times faster. Banners and flights stay real time.
- The slump of cats on defeat writes `rotation` and `scale` of the unit view containers; the field's idle animation should only touch their children (it did at the time of writing).
- Enemy tints are chosen by eye from the art, not sampled.
- Music LPF under danger (guide D-01) is not possible: the audio API has no filter control.

## REQUESTS

none
