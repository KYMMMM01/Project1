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

## 2026-10-07 motion review

First look at the battle's motion at full motion and a stepped clock. Every moment below was captured frame by frame and read as a strip (`tools/battle_motion.js` + `tools/battle_motion.sh`): the page is opened through the debug route, `motion.reduced` and `fxSettings.reducedMotion` are switched off, the ticker is stopped, the moment is triggered by a real tap or drag (or the debug hooks) and advanced with `window.__dbg.game.tick(1/30)`; every tile carries its time and every audio call made in it (`mcLog()` prints the exact times). Strips live in `scratchpad/shots/motion/<key>/`. Run a moment: `MOTION_OUT=<dir> tools/battle_motion.sh <key> <script.js>`; the helpers (`mcOpen`, `mcBegin`, `mcRun`, `mcUntil`, `mcBox`, `mcCat`, `mcMouse`, `mcSave`, `mcLog`) are listed at the top of `tools/battle_motion.js`. Two things the harness taught: the page's modules carry HMR timestamps (`/src/ui/motion.ts?t=...`), so a plain dynamic import is a second copy of the module (the helper resolves the live URL), and pointer hit-testing needs one rendered frame after the ticker stops.

Root causes found, shared by several moments:

- **Two clocks.** `ctx.tweens` (battle time) is slowed by slow motion, frozen by hit-stop and sped up by 3x; the particles run on real time. The sticker pops, merge flights, hops and the effect timelines (`Fx.after`) all rode the battle clock, so a legendary-or-better reveal froze the sticker for 0.4 s while its own flash played on, and at 3x a merge popped its cat 0.11 s before the burst. Sticker lifecycle (pop, hop, merge, sell, molt, refusal) now runs on `ctx.ui`, the `Fx` facade is built on `ctx.ui`, and the director's merge / move / swap beats use `laterReal`. Only the attack lunge stays on the battle clock (it has to follow the fire rate).
- **Beats were constants in three files.** The hop length, the merge flight and the reveal impact times now live in `src/view/timing.ts`, used by the field's views and the director's sounds, so a sticker and its effect land on one frame.

| Moment | Strip | Before | Change | After |
|---|---|---|---|---|
| Summon, ranks 1 to 5 | `ladder/summon_r0..r4`, `summon_d_r0..r4` | The cat popped 0.1 s after the tap and sat under the charge-up; its class sticker showed alone for 3 frames before the body; a filled flash disc (0.2 to 0.34 s) and the rings veiled the pop; ranks 4 and 5 looked the same when two big reveals came within 3 s; at the mythic hit-stop the pop froze (cat only 0.8 s after the tap); the sound fired at the tap, 0.1 to 0.38 s before the pop it opens with. Not a ladder. | Reveal delay per rank `[0, .06, .12, .22, .38]` s = the effect's impact (`REVEAL_DELAY`), pop overshoot `1.7 .. 2.7` and length `240 .. 400` ms per rank, the class sticker slaps on a beat after the body, pop on the real-time clock, a quick (second big reveal within 3 s) reveal mirrored in the field, flash discs 0.13 to 0.2 s at alpha 0.85, the summon sound waits for the pop, a cat cannot be picked up before it shows. | Charge on an empty cell, cat pops on the impact frame, each rank bigger and longer. Sound times 0.00 / 0.03 / 0.10 / 0.20 / 0.37 s against impacts at 0 / .06 / .12 / .22 / .38. |
| Attack: wind-up, release, recoil (warrior, ranger, mage; trickster shares the ranged path) | `atk/atk_close_*`, `atk_wide_*` | The shot, muzzle and sound fired on the event, the cat started its wind-up on the same frame and only lunged 0.08 s later, after the pellet had left: release before anticipation. | The last 0.1 s of the unit's own charge coils the cat back (`coilPose`, driven by `unit.charge`), the attack starts from that coil (`windStart`, continuity tested) so the lunge sits on the release frame; an unprepared shot (enemy walks into range) skips most of the wind-up. | Coil, release and lunge together, recoil settles in 0.16 s. Shot sound on the lunge frame. |
| Projectile and hit | `hit/hit_number` | Pellet arrives on frame 10, `hit_heavy` and the spark on the same frame. | None needed. | OK. |
| Damage number, crit | `hit/hit_number`, `hit_crit` | Number pops 0.6 to 1.15 to 1 in 0.14 s, rises 40 px and settles; crit star, number and `crit` sound on one frame. | None needed. | OK. |
| Enemy death, fish and purr to the counters | `die/enemy_die_fish`, `enemy_die_fish2`, `sell/sell` | The counter ticked on a fixed 0.5 s timer: 0.2 s before the coins landed on a kill, and a sell (and every reason outside kill / boss / wave / act / call) counted up at once, 0.3 s before its icons arrived. | The director tells the HUD when each icon lands (`src/view/landings.ts`); the pill pays that icon's share on that frame. A capped flight pays at once; a 3 s fallback covers a cancelled one. | Coin tick sound and the counter change on the landing, within 3 frames. |
| Pick up, drag | `drag/drag_lift` | Lift, tilt, wider fainter shadow, `pickup` sound on the press. | None needed. | OK. |
| Drop on an empty cell (move), swap | `drag/move_empty` | Dust puff, `place` and the buzz fired on release, 0.16 s before the hop landed. | Puff, sound and buzz at 85 % of the hop (`SLIDE_SECONDS`). | Sound on the landing squash. |
| Drop on the twin (merge) | `drag/merge_drop` | Materials arrived after 0.12 s, a gap with nothing at the cell, then the new cat popped under a 0.24 s flash disc; the sound (0.17 s) and the pop (0.12 s) were on different frames, at 3x speed 0.11 s apart. | `MERGE_SECONDS = 0.17`: the two stickers meet on the burst; sound, burst and pop on one frame; flash disc 0.14 s; real-time clock. | Meet, impact, pop, rank tag on one beat. |
| Merge result bubble | `sell/preview_bubble` | Pops in from the target on hover, fades on leaving. | None needed. | OK. |
| Select, deselect (ring, range circle, sheet) | `sel/select_in2`, `select_out2` | In: 36 px slide with cubic ease, no settle. Out: the sheet vanished on one frame while the chips faded in. | In: 0.26 s `backOut(1.3)` settle. Out: slides down 30 px and fades in 0.16 s over the returning chips; no taps land on a leaving sheet. | Page laid on, page lifted off. |
| Sell | `sell/sell` | Sticker rises and shrinks, dust, coins fly. | Counter now follows the landing (see fish). | OK. |
| Refused action (summon, no fish) | `sel/refused_summon` | `ui_click` and `ui_error` on one frame. | The click belongs to a summon that happened (`SummonButton`). | Error sound alone, button shakes. |
| Hint bubble | `boss/boss_enter` | Pops in 0.16 s, vanished on one frame. | 0.1 s shrink and fade on leaving. | OK. |
| Wave start label, speed change | `top/wave_label`, `speed_change` | Label drops with a pop and leaves in 0.9 s; speed button punches and turns coral, `ui_click` on the press. | None needed. | OK. |
| Boss warning, boss entrance | `boss/boss_warning`, `boss_enter` | Ribbon in 0.1 s, `boss_warning` sound, red pulse and music swap on the same frame; `boss_roar` on the spawn frame. | None needed (landing seen only at 0.22 scale). | OK. |
| Awakening cut-in | `awk/awaken` | Dim, starburst, `mythic` stinger on the impact frame (0.27 s), ribbon holds, leaves, guardian shows. | None needed. | OK. |
| Defeat into continue into result; victory into result | `lose/lose_to_result`, `res/result_stage`, `win/win_to_result` | The whole page arrived with the scaffold and only the title popped; the result screen replayed the stinger the director had already played; no music. | The page is laid down in order: title pop, sheet at 0.3 s, photo slapped on at 0.6 s (`place` on the landing frame), the six numbers one by one every 0.08 s, then luck and seed lines, rewards as before. The result screen no longer replays the stinger. | See music below. |
| Music under the result | `res/result_stage` | Silence after the stinger. | The home track (`audio.music('home', 3)`) comes in 1.4 s after the page opens at 45 % of the player's music volume; leaving the page ramps the volume back to 100 % over 1.2 s on the global clock, the home scene's own `audio.music('home')` is then a no-op, so the track simply goes on. A retry crossfades from it to the battle track as before. | `music:home` logged at 1.43 s after the tap. |

Not captured, and why: molt, synergy step-up, summon-grade and class upgrade, sunbeams, hazard warning and landing, laser dot, call-next-wave, enemy preview cards, the pick-of-three deal and the toy deal / pick / flight, pause open and close (kit popup), elite warning, boss ability, enrage and death, act clear, danger and overflow numerals, last wave. They fire through the same banner / fx / staging code that the captured moments exercise (banners and cut-in read well above), the capture of each needs its own set-up (a boss ability, a hazard wave, an act end) and the run stopped for budget, not for a defect. The toy deal (`RelicScreen.deal`: 0.28 s `backOut`, 0.08 s stagger, the other cards fade in 0.18 s, the picked icon flies to the shelf) was read in code only. The reduced-motion paths were not re-run for the changes: the new tweens are guarded by `motion.reduced` (sheet, bubble, result staging); the summon reveal delay stays under reduced motion, it is timing, not movement.

REQUESTS

- Kit (`CurrencyPill.setAmount(x, true)`): the first changed digit shows 2 to 3 frames after the call (the count-up starts on an ease); for a coin tick that is audible as a late number. Starting the count on the call frame would make the landing exact.
- Kit: `ScreenScaffold.show(true)` has no hook for "slide finished"; the result page's staging starts on a fixed 0.3 s after it opens.
- Other half: none.
