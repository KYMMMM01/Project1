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
| `policy.ts` | Pure staging rules, unit tested: `GapGate`, `WindowLimiter`, `FrameBudget`, `KeyedGate` (per-enemy cue spacing), `PitchLadder` (kill streak / merge chain / coin ticks), `HitStopGate` (one global hit-stop per 400 ms, 200 ms cap, 50 ms when reduced), `FlightLedger` + `iconsFor` + `shareOf`, `BannerQueue`, `SummonRate` + `summonPlan`, `IntensityMeter` + `intensityTarget`, `dangerStrength`, `heartbeatInterval`, `overflowSeconds`, `SoundRule` (gap + concurrency window + shared pool) |
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

Not captured in the first pass: the moments in the second table below. Their reduced-motion paths are guarded by `motion.reduced` (the pick farewell and the reroll farewell have no tween, the preview cards swap at once, the boss lands with the old fade-in pop, the arrow does not hop, the sell strip leaves without the slide).

### Second pass (the rest of the list)

Strips live in `scratchpad/shots/<folder>/` of the session (names in the Strip column). Captured at full motion with the same tools; `PAGE_ERRORS []` on every run.

| Moment | Strip | Before | Change | After |
|---|---|---|---|---|
| Molt | `molt/molt`, `molt4` | Old sticker spun for 0.24 s, the new one popped at 0.22 s, the puff's flash disc started at 0.3 s and a smoke cloud sat on the new sticker for 0.5 s; the sound fired on the event, 0.22 s before anything peaked. | `MOLT_SECONDS = 0.3` (`timing.ts`) is the spin, the pop and the puff's suck; flash disc 0.14 s (0.18 s, starts 0.04 s early), alpha 0.85; the puffs start on a ring around the sticker; sound and buzz on the pop's frame. | Spin, swirl, pop, burst on one beat; the new sticker readable from its first frame. |
| Synergy step-up (chip and caption) | `grow2/syn_chip`, `syn_cap`, `cap` | Rings per cat, chime, the class chip's tier step and the caption drop in together. | None needed. | OK. |
| Class upgrade | `grow2/upc_chip`, `upc_field`, `upsheet/upsheet` | Sparkles on the class's cats, chip and sheet level text punch. | None needed. | OK. |
| Summon-grade upgrade | `upgrade/ups_full`, `ups_btn` | Level burst over the board and the number swap: the button itself did not answer (only its text changed). | The arrow on the grade button hops off the button and lands with a squash (0.34 s, `ActionRow.hopArrow`). | The press is answered on the control that was pressed. |
| Sell: drag to the strip and drop | `sell/sell_full`, `sell_full2` | Dust and coins left from the cell the cat had been dragged away from, 340 px from where the sticker was sold; the strip vanished on one frame of fade. | A sale pays before it announces itself, so the director holds the pay for a frame (`CurrencyService.claimSale`) and flies it from the sticker's real place; the strip leaves the way it came in (slides 24 px up while fading, `SellStrip`). | The coins leave the sold sticker; the strip lifts off. |
| Sunbeams at an act change | `sun/sun_act` | The sparkle and the chime fired at the act end, under the boss banner and the toy screen where nobody saw them. | While the boss finale runs the new cells are remembered and lit on the next `waveStart` (`growth.ts`). | Sparkles and chime when the board is on screen again. |
| Hazard warning and landing (wet), cat reaction | `hazard/haz_wet` | Warning fill rises with its blinking outline and sticker, drops and a splash on the landing, the cats on the cells slump and tint; the end pops. | None needed. | OK. |
| Laser dot placed and moved | `laser/laser`, `laser2` | The dot appears with `laser_on`, follows the finger one-to-one, a ring marks its focus. | None needed. | OK. |
| Call-next-wave button appears, press and bonus | `call/call_appear3`, `call_press2`, `call_big` | The appearing button popped under a hint bubble that had been placed over it. | The hint bubble avoids the call button (`avoidList`, weight 2.5). Press: `ui_click`, `whoosh`, `wave_start`, `call_wave` on one frame, the button leaves, the caption drops, the bonus fish fly and tick. | The offer is never covered; the press has one clear answer. |
| Enemy preview cards between waves | `wave/preview` | The cards were destroyed and rebuilt on one frame. | When the list changes (not on a plain rebuild) the old cards slip down and fade for 0.12 s and the new ones pop in 0.05 s apart (`TopBar.refreshPreview`). | Cards are dealt, not swapped. |
| Pick of three: deal | `pick/pick_deal` | Rise, tilt and settle, 0.08 s apart. | None needed. | OK. |
| Pick of three: press, the pick and the others leaving | `pick/pick_press2`, `pick_press3` | The sim was told first: the new cat's reveal started under the sheet, `relic_pick` and the popup close sound and `summon_epic` all within 0.1 s, the sheet closed while the chosen card was still growing. | The press is answered first (chosen card springs up 0.18 s, the others slip down and fade), then the simulation is told and the sheet closes (`SummonPickPopup.choose`, a refused pick brings the cards back); the HUD's resync leaves a sheet that is saying goodbye alone (`picking`). | Card, sheet, cat reveal in that order; sound on the press. |
| Toy choice: deal, reroll, pick, arrival in the HUD | `toy/toy_reroll`, `toy_reroll2`, `toy_pick`, `toy_pick2`, `bossdie/toy_big` | The reroll built the new cards twice (event and call), the old ones vanished and the new ones were dealt over them; a second `relic_pick` sound fired from the screen (the director has one); the flight's length was random while the shelf waited a fixed 0.6 s. | The reroll sends the old cards down and away (0.14 s) and deals the new ones after them; one render per reroll; one sound; the flight is fixed (`TOY_BURST + TOY_HANG + TOY_FLY`, `timing.ts`) and the shelf pops its icon on the landing frame (`motionSeconds`). | Old cards leave, new cards are dealt, the toy lands where the shelf pops. |
| Pause menu open and close; the world stopping and resuming | `pause/pause_open`, `pause2/pause_close` | Sheet pops with `ui_popup_open`; the field freezes on the first frame (reasons `["user"]`), on close the reasons are `[]` and the shot, a bolt and the fish tick resume on the next frames. | None needed. | OK. |
| Speed change at a busy moment | `speed/speed` | Button punches and turns, `ui_click`, numbers and flights keep their own clock. | None needed. | OK. |
| Elite warning and entrance | `elite/elite_warn2` | The ribbon held 1.4 s and hid the lane's first run until after the elite landed. | The ribbon's life ends at `BOSS_APPEAR` (`boss.ts`). | The ribbon is gone when the big one arrives. |
| Boss warning | `boss/boss_warn` | The same, 1.9 s. | Same change. | OK. |
| Boss ability firing | `boss/boss_ability` | Caption, the ability's own cue (wind, whirl, splash, zap). | None needed. | OK. |
| Boss enrage | `elite/elite_enrage` | Coral punch and flash on the body, rings, caption, `boss_roar`. | None needed. | OK. |
| Boss landing in close-up | `land/land`, `land2` | The body popped from nothing (0.23 s on the battle clock, frozen by the landing's own hit-stop) under the dust: the impact came before the thing that landed. | A boss drops onto the lane (`BOSS_DROP = 0.14 s`, real time) and lands with a squash; the dust, ring, hit-stop and roar fire on that landing frame (`EnemyView.appear`, `boss.ts`); reduced motion keeps the fade-in pop. | Fall, impact, squash on one frame. |
| Boss death to the end of the fish rain, act clear | `bossdie/boss_die`, `boss_die2`, `boss_die4`, `toy/*` | The finale's beats rode the battle clock while its blasts ran in real time (the final sound 0.6 s after the final blast); the toy screen opened over the boss-defeated banner after 0.5 s; the act-clear banner and fanfare fired on top of the boss-defeated ones. | The beats (mini blasts, final sound, coins, banner, fish release) run in real time; the toy screen waits for the banner to finish (`holdStage`, `view/staging.ts`); during the finale the act-clear caption and fanfare are skipped (`flow.ts`). | Blast, sound, coins, banner, then the toy screen; fish land during the banner. |
| Last wave label | `call/call_big`, `elite/*` | The wave label (`Act 3 - Wave 24/24`) punches at each wave start; there is no special last-wave staging. | None needed. | OK. |
| Danger appearing, overflow digits, defeat | `danger/danger_a`, `danger_b` | Edge tint grows, warning line and the big countdown digit drop in per second with `countdown_tick`, the bar above shows the seconds; defeat greys the field and the stinger rings. | None needed. | OK. |
| Mythic summon and awakening reveal; the guardian's biggest moment | `mythic/mythic`, `mythic2`, `mythic3`, `awk/awk_full` | The pillar (190 px wide, 0.62 s), the second white ring (from the centre, 0.2 s late), the 0.2 s flash disc and the 0.3 s starburst crossed the sticker; it was clear only from about 0.9 s (0.5 s after the impact). | Flash 0.15 s, starburst 0.2 s, the pillar 150 px wide and 0.32 s, the second ring is born outside the sticker's footprint (230 px). Decision: the guardian must be readable at its biggest moment (about 0.2 s after the impact), so nothing white may be over it then. | Clear from 0.67 s (0.29 s after the impact); the only wash left over it is the ground disc under it. The awakening cut-in itself (`awk_full`) was already right. |
| Returning home with the run's rewards | `home/home_return` | The home scene was built fresh and showed the new totals as if they had always been there. | `ResultScreen`: on Home the paid gold, gems and tickets are put through `playClaim` once the new scene has entered (`homeClaim.ts`): the pills hold their old amounts (`shell.pending`), coins burst from the middle of the iris, fly in and each landing bumps the icon and rolls the number (`shell.landed`). | 470 held, coins land, 470 to 537 to 742 to 940 on the landings. |
| Clamp of `flyTo` near the screen edge | `edge/edge` | Callers had to pass short values near the sides (`flightTuning`). | `planFlight` folds the resting spot and the curve's control point back into the screen (`foldInto`), `flyTo` supplies the bounds; tests in `tests/fx.flyPath.test.ts`. | Twelve coins from 6 px of each side stay on screen all the way. |

Two things the second pass taught: a cell's pay is announced before the event that says where the sticker was, and a bubble that is placed first and an offer that appears later fight unless the bubble knows about the offer.

### Still not captured

The hazard `zap` variant (a bolt from above onto a 2x2 block; the same code path as the wet puddle with `lightning` and a flash), the revive staging after a continue, and the English text of the new strips (every strip but the result page is Korean). They share the paths read in the strips above.

REQUESTS

- Kit (`CurrencyPill.setAmount(x, true)`): the first changed digit shows 2 to 3 frames after the call (the count-up starts on an ease); for a coin tick that is audible as a late number. Starting the count on the call frame would make the landing exact.
- Kit: `ScreenScaffold.show(true)` has no hook for "slide finished"; the result page's staging starts on a fixed 0.3 s after it opens.
- Other half: none.
- Shell (`src/screens/shell/controller.ts`): `shell.pending` is a no-op while no home scene is attached, so the way home from a battle cannot call it before the scene change. It is called on the first frame after the new home scene has entered (`src/view/hud/homeClaim.ts` polls `scenes.current`). A hook that tells "a home surface attached" (or a `pending` queued until `attach`) would let the result screen drop that poll.
- Other half: `flightTuning` (`src/screens/shell/flight.ts`) can lose its edge branch now that `flyTo` folds the burst and the curve onto the screen; its callers work unchanged.


## 2026-10-07 owner feedback

- **The summon reveal follows the toss.** `growth.ts` `summon`: the whole reveal (the rank's effect, the theme burst, the sound, the duck) is `play()`, run at once under reduced motion or for a relic gift, otherwise `stage.laterReal(tossFor(source), play)`, so the charge-up starts on the frame the sticker lands and the cat pops `REVEAL_DELAY[tier]` later, in step with the field and the HUD chip. The effect ladder itself is untouched; it was never visible on this machine (reduced motion) and is on `ctx.fx`, which is `layers.fxFront`, over every cat. Rapid tapping still thins the commons (`summonPlan`).
- Looked at at full motion on crowded boards (up to 17 cats, 14 enemies on the field, two waves with real taps): nothing else in the director needed changing; the number spreading is in `fx.md`.

## 2026-10-07 owner feedback (second round)

- **Weight, only where it belongs** (`combat.ts weigh`): the three heavy cats (axe, polearm, cork gun) on a boss or a hit worth 5 % of the enemy's health stop the frame for 34 ms and nudge the camera (trauma 1, at most every 0.35 s); a crit stops it for 26 ms (36 on a boss or elite); a hit on a boss worth 1 % of its health nudges the camera at most every 0.45 s. Nothing else moves the camera or stops time. Everything goes through `HitStopGate` (one per 400 ms, 50 ms cap under reduced motion) and `fxShake`, which honours the shake setting.
- The generic spark of a hit is now for hits with no cat behind them (relics); a cat's weapon has its own mark on the field (`field.md`). The sword's arc, the samurai's line and the claw marks of the paw and the axe left the director with them. The audio owner's sound lines are untouched: the release sound is on the `attack` event (the cat's release pose is on that frame) and the impact sound on the `hit` event (a shot's arrival frame, a melee blow's contact frame within one to three frames). Measured on the strips: `atk_*` and `imp_*` on the tile where the mark appears (`i2_melee`, `i4/*`).

## 2026-10-07 final leftovers

`BannerService.dressBand(spec)` (new): dresses the alert lane's ribbon for `spec` and returns its root unshown, or null while a ribbon is up or waiting (or once destroyed). `mountBoss` uses it: in the `waveStart` of the wave before an elite or a boss it asks the warm queue (`src/fx/warm.ts`) for the ribbon (`renderOnce`) and for the red edge sprite, keyed per battle. The ribbon's words come from one helper (`warning(wave, boss)`) shared with the real warning, so what is drawn ahead is what is shown. Numbers and the strip: `hud.md`, "2026-10-07 final leftovers".


## 2026-10-08 VFX polish

The director's share of the painted battle effects (see `fx.md` and `field.md`, "2026-10-08 VFX polish").

- **Chain lightning is jumping now** (`combat.ts`, `m_storm`): each hop of the chain is `fx.arc(x0, y0, x1, y1, { delay: i * 0.05, scale: 1 - 0.06 * i })`, a painted bolt flickering for a fifth of a second with a flash where it lands, hop after hop 50 ms apart (the old particle bolts and `stage.later` are gone). The sound is still one `strikeSound('m_storm')`.
- **The storm cloud's bolt** (`boss.ts`, hazard `zap`): a painted arc from above the screen onto the cell (`color: ZAP`, scale 1.4): the hostile bolt is tinted warm mustard, the friendly one is the painted electric blue-white.
- **Shield colour** (`palette.ts`): `SHIELD_COLOR` is `Light.shield` (steel blue) instead of the sky tape colour: the glance and sparks of a hit on a shield, the number of what it soaked and the elite caption wear the dome's colour. The "no purple" palette test still holds (the hue is 215 degrees).
- **The shield's own picture is the field's** (the dome with its ripple, cracks and flinch, `field.md`); `shieldBreak` still plays `Fx.shieldBreak` at the enemy and the `shield_break` sound, now with the six painted shards. There is no sound of its own for a hit on a shield (REQUEST in `fx.md`).
- **Nothing else changed.** Impacts, flashes, hit-stop, numbers and the weapon marks' gating are as they were; the projectile impact of splash shots still plays `shockwave` and the puff, over the field's new marks (the snow splat, the scorch with its flare).

Tests: `view.director.palette.test.ts` and the policy tests unchanged and green; the arcs are tested in `fx.arcs.test.ts`.


## 2026-10-08 VFX restyle

The director's share of the restyle (see `fx.md` and `field.md`, "2026-10-08 VFX restyle"). Nothing in `src/view/director` needed new code; what changed under it:

- **Chain lightning and the storm cloud's bolt** (`combat.ts`, `boss.ts`) still call `fx.arc(...)` the same way. The bolt is now a flat yellow zig-zag with a brown outline, one sprite a hop (the second, thinner "echo" bolt is gone) and a flat yellow star where it lands; the storm cloud's hostile bolt is the same picture tinted warm (`color: ZAP`). The hop timing (50 ms apart, `scale: 1 - 0.06 * i`) is unchanged.
- **Shield colour** (`palette.ts`): `SHIELD_COLOR` follows `Light.shield`, which is cobalt blue now (0x2f66e8, hue 222 degrees). The glance of a hit on a shield, its number and the elite caption wear the ring's colour; the "no purple" palette test still holds. `Fx.shieldBreak` is a few flat shards (no flash, no ring of light), played at the enemy with the `shield_break` sound as before.
- **Numbers**: crit and boss-hit numbers (styles `crit` and `big`, and the player's `hurt`) are placed side by side and row by row, at most six big ones alive and none wider than 170 px (`fx.md`); the burn, poison, bleed and shield colours and their baked fonts are untouched.
- **Impacts, flashes, hit-stop and the weapon marks' gating** are as they were; the splash shot's `shockwave` and puff play over the new flat marks.

Tests: `view.director.palette.test.ts` and the policy tests are unchanged and green; the arcs are tested in `fx.arcs.test.ts`.

## 2026-10-08 damage numbers

The director's share of `fx.md`, "damage numbers" (the owner: the numbers hide the enemies). `combat.ts` asks the floating numbers for one number per hit through `say(en, info, value, style, color?)`: a `NumberTarget` that is refilled for every hit (uid, the drawn x, y, the body box from `EnemyInfo`: `hw`, `top`, `bottom`; the way the enemy walks, its full health, elite or boss, boss) and a reused options object, so a hit allocates nothing. The styles: an ordinary hit `damage`; a crit `crit`; a killing blow `kill`; a boss or elite hit of 20 % of its health or more `big`; a tick `dot` in the colour of its kind (`DOT_NUMBER_COLOR`); what a shield soaked `soak` in `SHIELD_COLOR`. A crit that kills stays a crit, and a hit that did no damage asks for no number. `fx.numbers.sense` lists every enemy's box once a frame.

Everything that used to decide here (the density of the number layer, the 100 ms aggregator, `shouldShowNumber`) is gone from `policy.ts`: placement, merging and the crowd rule belong to the numbers (`fx.md`), and the level (Off / Brief / All) is the player's setting. `EnemyInfo` has `size`, `hw`, `top` and `bottom` from `bodyBox` (`view/field/policy.ts`, the function `EnemyView` takes the picture's size from as well). The sparks of a hit with no cat behind it are no longer thinned by the number layer's load (they have their own budget). Tests: `view.director.numbers.test.ts` (5); the policy tests lost the three number tests.


## 2026-10-08 tuning

The director's recipes (`defs.ts`) follow the smaller shots (sizes in `fx.md`, "2026-10-08 tuning"): the ordinary hit's flash and sparks, the muzzle flash and streak, the cast ring, the shot's landing puff and motes, the shield's glance and sparks and the piercing arrow's stars are about 60 % of what they were (a hit flash 28 -> 52 px, a landing puff 22 -> 48, a cast ring 20 -> 64): an impact is about the enemy's own size. `Fx.critBurst` shrank the same way. Nothing the director decides changed.


## 2026-10-09 batch: the third-step abilities got a ring

The `special` events (`cry`, `shatter`) of the rules phase had no picture: a war cry showed only its stun stars and a burst only the damage numbers, so the four-kind abilities, the headline of the synergy change, were hard to notice. `growth.ts` now draws `fx.shockwave` in the class colour at the event's point (`specialRing`, `policy.ts`: the roar's ring is capped at `CRY_RING_MAX` 170 px because a warrior's range runs to 285 px and up to four roar in the same tick; the burst is drawn at its own 70 px) and gives the roar a light haptic. Two ring particles per event, pooled, no new sound (the audio tables are untouched). Seen in a four-kind board fight (8 roars, 5 bursts in 18 s). Not done: a sound for either.
