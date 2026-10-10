# Batch 4 · tutorial (T1, T2, T3, T5, T6)

Owner's words and decisions: `docs/qa/directive_2026-10-10_batch4.md`. Area: the first-run tutorial (`src/view/hud/Tutorial.ts`, `tutorialScript.ts`), the first-encounter cards (`hints.ts`, `encounterWatch.ts`, `encounters.ts`), the laser guide's paw, and the tutorial's sandbox (`src/game/sim/tutorial.ts`). Supersedes the "Nothing blocks" paragraph of `docs/handoff/hud.md` (2026-10-07): lessons that wait for a gesture on the field now hold the clock too.

## 1. What was wrong (found by playing, not by reading)

Method: headless Edge (`tools/edge`), real taps and drags, 450 x 900 and 360 x 800, a recorder that reads the overlay tree every frame (note id, text, alpha, position, paw position) and counts `Tutorial.paint`, `LessonBubble.show`, `Hand.place/tap/drag`. Scratch scripts: session scratchpad `batch4/tutorial/` (`drive2.mjs`, `cards.mjs`, `skiprun.mjs`, `qa.mjs`).

**T1 / T2 / T3, one cause in the tutorial: the note was rebuilt and the paw laid again at every small move of the thing it points at.** HEAD `Tutorial.ts:410` re-measured four times a second and `:418-436` repainted whenever the lit window changed; `holeOf` (`:508`) only held the window for a centre move of 0.5 px and a size change of 24 px. `paint` (`:527`) did `LessonBubble.show` (`:59` hides the old note and `:116` pops the new one in from 0.7 over 0.18 s) and `placeHand`, which restarts the paw's tween (`Hand.ts:93`/`:123`) and re-picks one of four candidate tips against a list that includes the note just rebuilt. A control that is still arriving moves for a third of a second: the purr plate pops in (`CurrencyRow.ts:203`, 0.3 -> 1 with overshoot 2.8, 0.32 s), the elite/boss strip fades in and rises 14 px (`BossBar.ts:148`, and `onScreen` was false at alpha 0, so the whole lesson hid and came back), the selection sheet slides. Measured on the unchanged code: purr lesson re-laid its note 2 times in 2.5 s at 450 x 900 and 3 times at 360 x 800 at 2x (each one a hide of 0.12 s and a pop of 0.18 s: the blink), the paw's tap animation restarting each time. After: one lay per lesson (see section 5).

**T3, the first-encounter cards of a real run never came at all for the elite and the boss.** `encounterWatch.ts:65` (HEAD) asked `b.boss !== enemy`, but the simulation announces `enemySpawn` (`enemies.ts:47`) before it assigns `s.boss = e` (`flow.ts:254`): the test was always false, so `elite`, `boss` and every `boss_*` card were never requested. A second cause starved every card behind it: `Hints.update` (`hints.ts`) refuses to open while ANY bubble is up, and the laser guide's "press the button" line is sticky and waits for the player for as long as it takes (no timeout), so a player who did not press the laser button saw no card for the rest of the run (elite wave 4: 0 cards in 120 s; after the fix the card opens at the wave and stays one instance).

**T2, the laser guide's paw.** `LaserGuide.leadEnemy` (HEAD `:31`) followed whichever enemy was furthest along, and the arm flipped at fixed thresholds (`:193`): a faster enemy overtaking, or a kill, pulled the paw across the lane and back, and riding along the line flipped it every frame. Now it keeps the enemy it rides while that one lives and the arm has a 60 px hysteresis.

**T5, the battle ran under text.** HEAD: `merge`, `synergy` (a timed note), `sun`, and `molt` / `sell` until a cat was selected never held the clock (the field ignored touches while paused, so a gesture lesson could not), `laser` never held, a read-only note ("got it") let go of the clock after 25 s (`HOLD_LIMIT`, HEAD `Tutorial.ts:393`) and the game ran under the bubble.

## 2. What changed

| File | Change |
|---|---|
| `src/view/hud/spotMath.ts` (new) | Pure `SpotSettle`: from the rectangle measured every 0.1 s it says `wait` (still arriving: only the lit window follows), `lay` (once: note and paw), `follow`, `keep` (a blink of the target keeps everything), `clear`. `STILL` 2 px, `SETTLE_MEASURES` 2, `SETTLE_LIMIT` 8, `LAY_AGAIN` 56 px, `MISSING_LIMIT` 5. |
| `src/view/hud/Tutorial.ts` | `tick` split into `hush` / `look` / `drawWindow` / `say` / `unpoint` / `clearSpot` (the old `paint`, `holeOf`, `paintedKey` are gone); measure first, then hold; only a lesson that is not a read-only note is let go of after 25 s; awaken lesson (`World.king`, `kingSelected`, `CountKey 'awaken'`, `AWAKEN_BREATH` 1.6 s of running clock after it so the guardian can arrive, text by stage); `Target` `sellcat` -> `weakcat` (also used by molt), new `king`, `awaken`; the paw's picks come from `pawTarget.ts`. |
| `src/view/hud/pawTarget.ts` (new) | Pure picks of the cat, pair, king, sun cat and sun cell, each keeping its last choice while it still fits (a cat that arrives in an earlier cell no longer pulls the paw). The molt lesson points at the WEAKEST cat (it was the first cell: with the king on the board it could have been the king). |
| `src/view/hud/tutorialScript.ts` | `merge`, `synergy`, `sun`, `molt`, `sell` hold the clock; `laser` holds while its guide waits for a touch (`laserHold`); timed notes count real seconds while they hold; new step `awaken` (after `sell`, before `boss`, reveals the awaken button, `staleAt` 8); `World` +`king`, `kingSelected`, `laserHold`. 20 lessons now. |
| `src/view/hud/LessonBubble.ts` | `show(spec, onButton, pop = true)`: a note that is already up is put down again without the pop. |
| `src/view/hud/index.ts` | `restRectOf` (visible, own pop/breath scale taken out, alpha ignored) for every lesson target; the strip's rest rectangle for `bossbar`; `awaken` target; `calm` ignores the lesson's own hold; `laserHolds`; debug `lessons.tutorial()` / `lessons.hints()`. |
| `src/view/hud/LaserGuide.ts`, `laserGuideFlow.ts` | `followedEnemy`, `ridingArm` (pure), `holdsClock`. |
| `src/view/hud/encounters.ts`, `encounterWatch.ts` | `spawnTopics(enemy, waveKind)` (pure) replaces `b.boss !== enemy`; the king's card is left to the tutorial's lesson while it is still to come (`env.lessonOn('awaken')`; a skipped run gets the card). |
| `src/view/hud/hints.ts`, `src/view/info.ts` | `bubbleInTheWay(visible, sticky)`: a lesson's sticky line no longer blocks or interrupts a card (`info.sticky` getter). |
| `src/view/context.ts`, `src/scenes/BattleScene.ts`, `src/view/field/clock.ts`, `src/view/field/input.ts` | `BattleContext.lessonHold` (only the tutorial holds the clock) -> the field takes drags and taps meanwhile. `BattleClock.heldOnlyBy`. |
| `src/game/sim/tutorial.ts`, `board.ts` | `giveKing`, `TUTORIAL_KING_WAVE` 6, `TUTORIAL_PURR_FLOOR`; `placeGift` (new export). |
| `src/view/hud/strings.ts` | two keys (below). |
| `docs/명세_전투규칙.md` | one bullet under the tutorial script. |

## 3. Strings (new)

| key | ko | en |
|---|---|---|
| `hud.tut.awaken.pick` | 골골이 모였어요! 대왕 고양이는 골골 {cost}개로 수호신이 돼요. 대왕을 눌러 봐요! | Purr is ready! A King becomes a Guardian for {cost} purr. Tap the King! |
| `hud.tut.awaken.go` | 각성 버튼을 눌러요! 수호신은 가장 강한 고양이예요. | Tap Awaken! A Guardian is your strongest cat. |

`{cost}` is `battle.awakenCost()` (10 today). Every glyph is already in the font subset (`tests/core.font.test.ts` passes without `npm run font`). The word "막" in older lesson texts was left to the wording engineer (`guide.acts.*` still says it).

## 4. T5: what pauses and what runs

The clock is held with the pause reason `tutorial` (a lesson) or `popup` (a card, a popup, a full screen); the field takes a gesture while `tutorial` is the only reason. Speed does not matter for a hold (`BattleClock.tick` returns 0 whichever speed). Only the "runs" rows depend on speed: they are real seconds, so they are twice (3x: three times) as many game seconds.

| Lesson | Waits for | Clock | Why |
|---|---|---|---|
| summon | 3 taps on the button | held; runs 0.75 s after each tap | the new kitten's pop-in uses battle-time tweens; only the three taps' beats run (2.25 s real in all) |
| merge | a drag onto the twin | held (new) | the field takes the drag while only the lesson holds |
| lose_gauge, acts, elite, purr, boss | "got it" | held, never let go (new) | nothing else to do under a read-only note |
| classes | open and close a class sheet | held (the sheet adds `popup`) | |
| pick3, toys | a card | `popup` (the choice's own hold) | |
| synergy | 4.5 s note | held (new), 4.5 real seconds | the note ends by itself; the clock stood still for it |
| sun | a drag into the sun | held (new) | as merge |
| laser | press the button, then the lane | held in those two steps (new); runs in "see" | the marks and the cats' reaction are what "see" shows |
| molt | tap the weakest cat, press molt | held from the start (was: once a cat was selected) | |
| summon_grade, class_upgrade, call_wave, speed | a tap | held | |
| sell | tap the weakest cat, press sell | held from the start (new) | |
| awaken (new) | tap the king, press awaken | held; runs 1.6 s after | the guardian's arrival is the lesson's reward |
| action lessons in general | | let go after 25 s held, dropped 20 s later | a player who ignores them is never stuck |

First-encounter cards (every one: `pick3`, `summon_grade`, `call_wave`, `synergy`, `purr`, `toys`, `molt`, `sell`, `classes`, `acts`, `sun`, `hazards`, `trait_*`, `class_upgrade`, `awaken`, `elite`, `boss`, `boss_*`, `speed`, `preview`, `merge`, `lose_gauge`, the run rules): one code path, `Hints.open` -> `host.hold()` -> `EnvImpl.holdPause` (`popup`), released in the same call as the card leaves (`close`, `interrupt`, `destroy`). They pause from the frame they show, at 1x and 2x alike. They never run under a card; they wait (banner 2.6 s, 7 s between two cards, 1 s after an interruption) and come back unseen when a popup, a drag or a result screen takes the screen. The elite card at wave 4 (450 x 900, 1x) and the boss card at wave 8 (360 x 800, 2x) were played: `pause ["popup"]`, one note instance for its whole life.

Still runs by design: the free-play nudge ("fish are piling up") between lessons, the laser's "see" step, the sticker after a lesson, the beat after a summon, the beat after the awakening, the info bubbles (a refusal's reason, an enemy's card).

## 5. Seen on screen (headless Edge, real taps and drags)

- Whole tutorial from a fresh profile, **20 lessons, begun and done in order, none dropped, won**: 360 x 800 with the lessons sampled at 1x (`run2-phone1`), 450 x 900 sampled at 2x (`run2-wide2`). Each lesson with a target: **one lay of the note and one of the paw** (16 of 20 lessons counted; the other four are the pick, the toy choice, the laser and the first summon, which have none by design). Pause reasons per lesson as in section 4 (`tutorial` for every held lesson, `popup` for the two choices).
- Awakening, 360 x 800 (`shots/lesson-p1-awaken`, `awaken-selected-p1`, `awaken-after-p1`): the king lit with the paw on it, the note "골골이 모였어요! 대왕 고양이는 골골 10개로 수호신이 돼요. 대왕을 눌러 봐요!"; after the tap the paw on the lit 각성 (10) button and the second line; after the press the guardian (수호신) stands on the king's cell, the awaken button reads "대왕만 가능", the next lesson (boss) follows.
- Skip at the first lesson, played to wave 6: no lesson, the king arrived with 13 purr and the awakening CARD opened for it (`skip-awaken-card`).
- Cards: elite at wave 4 and boss at wave 8, section 4.
- Not seen: a real phone's touch and frame rate (headless Edge at 12 to 20 fps); the replay from the settings (same `mode: 'tutorial'` run path with `resetTaught`, not played); the English text on screen (key present, `{cost}` filled in the same way).

## 6. Awakening in the tutorial: how, and what it does to the run

- `giveKing` at the start of wave 6, before the box of kittens (the box leaves its 2 free cells after the king): a king of the class the board is furthest with (most counted kinds, then most cats, then the first class), plus the one counted kind that class still lacks for `AWAKEN_MIN_TIER` (rare, then epic), only what fits, nothing the board already has; purr topped up to `AWAKEN_COST + max(MOLT_COSTS)` = 13 (the molt lesson may have spent some). It is the sim's own (every mode but `tutorial` unchanged), so it also comes after a skip and in the replay.
- Bots, 24 seeds, merge and synergy policies, tutorial mode (before -> after the gift): wins 24/24 -> 24/24 both; average win time 124 -> 123 s (merge), 119 -> 119 s (synergy); peak share of the enemy cap on waves 6 and 7: 0.30 -> 0.20 (merge), 0.13 -> 0.10 (synergy); wave 8: 0.19 -> 0.11, 0.09 -> 0.08; boss time left at the kill 25.8 -> 27.6 s, 28.3 -> 28.3 s. The tutorial was already won by every bot before; the gift moves the margins by a tenth of the cap and two seconds of the boss's limit: not unwinnable, not made trivial.
- If the lesson is dropped (the board was full at wave 6, or the player sold the king): the king stays, no lesson; in a skipped run the awakening card explains it.
- The lesson replaces the one tutorial card that existed (`hints.only = {awaken}` stays, the card is held back while `lessonOn('awaken')`).
- Which lesson could be shortened to make room if the owner wants 19 again: `synergy` (a 4.5 s note about the kitten rank not counting) could fold into `classes`' text; not done.

## 7. Tests

New: `tests/view.hud.spot.test.ts` (9: the settle decision; it contains the old algorithm as a reference and asserts it laid >= 3 times on a pop-in where `SpotSettle` lays once), `view.hud.pawtarget.test.ts` (10), `view.hud.arrival.test.ts` (5: the real sim, `watchEncounters`; fails with the old `b.boss !== enemy` test), `view.hud.hints.test.ts` (6: the scheduler against a sticky and a player's bubble; the sticky one fails with the old rule). Added to: `view.hud.script.test.ts` (7), `view.hud.laser.test.ts` (4: `followedEnemy`, `ridingArm`), `sim.tutorial.test.ts` (5: the gift), `view.field.clock.test.ts` (1).

Changed expectations (not loosened): `view.hud.script.test.ts` order and "no lesson reveals awaken" (now 20 lessons, awaken revealed by its lesson); the "player who reads nothing" test (merge holds the clock now, so it is let go via `relax()` like every held lesson, then dropped after `RELAXED_PATIENCE`); `sim.tutorial.test.ts` box of kittens: the wave also places the king and its second kind, so the box's own limits are asserted on the kittens among what was placed.

## 8. Open questions for the owner

1. The elite and boss cards were silently never shown in real runs; they now are (first elite, first boss, the boss's own trick). A player who finished the tutorial has been taught `elite` and `boss`, so only the boss's own card is new to them; a player who skipped sees all three. OK?
2. A skipped run still gets the king and the purr at wave 6 (the sim cannot know about the skip). Intended: the card then explains it.
3. Read-only notes never release the clock now (a player who walks away finds the game as it was). Action lessons still let go after 25 s.
4. The tutorial is 20 lessons; see section 6 for what could be cut.
