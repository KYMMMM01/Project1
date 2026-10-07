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


## 2026-10-07 QA fixes

Six testers played the whole game; an engineer started on their `findings_battle.json` (27 reports) and was cut off by the quota. This pass verified every report in the browser (Aside, 720 x 1280 and 720 x 1600, Korean and English, `PAGE_ERRORS []` on every run) or from the code, finished the half-done work and fixed the rest. `npx tsc --noEmit` prints nothing for `src/view`, `src/fx`, `src/scenes/BattleScene.ts` and the view / fx tests; `npx vitest run` is 64 files, 1,487 tests green (new: `tests/view.hud.qa.test.ts`, the tap rule in `view.field.policy.test.ts`, number bounds in `fx.numbers.test.ts`).

| Report | Verdict |
|---|---|
| quit-after-end-shows-defeat | FIXED. `canOpenPause(phase, ending)` (`hud/policy.ts`): the pause button does nothing once the sim says won or lost. Proof: `lose()` then a tap on pause leaves the pause reasons `[]`. |
| selltag-omits-purr | FIXED. `SellTag.place(x, y, fish, purr)` draws a longer tag with the purr icon. Proof: `b1_sell_drag` (tag and strip both say +80 and purr +1). |
| look-dmg-numbers-hud, damage-numbers-layering | FIXED. Numbers are light digits (kind colour lightened 30 %) inside ONE flat brown stroke (`numbers.ts`: the second font, the cream outline and the drop shadow are gone), the hit-spark disc and the crit shock ring (both translucent) are gone, and `FloatingNumbers.minY / minX / maxX` keep every number under the HUD and inside the screen sides (a hit on the right lane was cut by the edge). Proof: `j1_numbers`, `i1_bosses`. |
| look-selection-sheet-small, skill-text-truncated | FIXED. The text audit (every text under 24 px, every target under 88 px) is empty for kitten, king and guardian sheets in both languages; a cut skill line carries an info mark and an 88 px band opens the full text; Sell is 240 px and Awaken 214 px wide so "+80 . purr +1" and "Kings only" are not cut (`c1_*`, `i1_sel_en`). The skill line stays one line: the sheet cannot grow without covering the summon row. |
| look-tooltip-over-popup | FIXED. `env.modal()` and the pause menu (`Hud.pauseMenu()`, which the first fix missed) hide the enemy card before they open. Proof: `l1_pause_after_tip`, `b1_class_after_tip`. |
| look-rank-pips | FIXED. Rank tag 26 px tall (was 18), pips 9.6 px (was 7), tag width 24 + 13 per pip; the class sticker moved up so a five-pip tag never runs under it (`g1_tall`). |
| look-tall-gap | REJECTED. The field is already centred in the band between the two HUD blocks (178 design px of floor above and below at 720 x 1600, measured: `layout.fieldY` 346) and it cannot grow: `FIELD_W` is the design width, so the cells cannot be scaled up without cutting the lanes. The band is where banners and hint bubbles go. |
| look-translucent-discs | FIXED. The shield "bubble" is a dashed opaque ring (`art.ts shield`, alpha follows the shield only), `Fx.buffAura` draws a ring outline instead of a 32 % disc (the boss vaccinate aura). Proof: `j1_shield`. |
| tutorial-passive-loss | FIXED. The report stepped the sim through the API, which bypasses the HUD's update, so the nudge never ran. With real frames the hand and the "Fish ready!" bubble point at Summon after 5 s of unspent fish and come back until the board holds 6 cats (`tutorialFlow.nudgeDue`); a lost run with fish and room left says so on the result screen (`unspentFish`). Proof: `t1_idle7`, `m1_after_merge`. |
| battle-toplane-overlays | FIXED for the stacking: hints wait 2.6 s after any banner (`Hints.hold`), refusals are bubbles on the control that was pressed, the pair hint points at both cats and the enemy lane is on the bubble's avoid list. The wave banner and the synergy caption themselves stay in the band above the board, which is also the enemy lane's top run: there is no other free band at 1280 (the lane surrounds the board). They are short (0.9 to 1.5 s). |
| tap-tap-moves-and-swaps | FIXED. `decideTap`: a tap finishes a merge or a move, never a swap; tapping another cat selects it. While a cat is selected the empty cells show the teal move cue (`pick` look). Proof: tapping cells 0, 12, 7 in turn leaves the board unchanged (`c1`); selecting cat 0 then an empty cell moves it (`h1`). |
| tutorial-finger-over-preview | FIXED. The hand hides while a cat is held (`t1_dragmerge`). |
| tutorial-bubble-covers-board-row, hint-bubbles-over-hud | FIXED. One bubble class (`HintBubble`, `bubbleMath.placeBubble`) weighs both sides against cats, pills, chips, summon and the lane; a hint is dismissed when its control is used; the chips, synergy, sell, molt, awaken and twins texts are two lines. |
| continue-wave-number-mismatch | FIXED. `wavesReached`: "Wave 12/24" like the HUD (`b2_continue`). |
| pity-chip-unlabeled | FIXED. Two-line chip, "Pity" over "+3%" (ko: 천장); the odds popup says the same word. |
| right-column-crowding | FIXED. Call button 236 x 84, right edge on the odds button's, laser 4 px lower (`d1_call`). |
| laser-affordance, feedback-gaps | FIXED. The laser button plays `ui_click`, its tooltip closes when the dot is placed, the hint no longer says "when it is on"; deselect plays `ui_back`; a swap sounds a third higher than a move. Measured with a wrapped `audio.play` (`d1`: `ui_click`, `laser_on`, `ui_back`). Not adopted: an arm mode for the laser (there is nothing to arm, the dot goes straight on the lane). |
| chapter-bg-similar | DEFERRED. The chapter 3 and 5 backgrounds are painted image files; a tint would be a look decision on art, so it waits for the background regeneration and the user's confirmation. |
| boss-clipped-left-edge | FIXED. `EnemyView.drawX()` pulls a body in so it stays 6 px inside the screen on the outer lanes (left and right). Proof: `i1_bosses`. |
| tutorial-open-polish | FIXED for the hand (on the button's top-right corner, "Free" readable, nothing cut); the empty panel is the staged reveal (GDD 9.1) and fills when the chips appear after the first merge. |
| merge-preview-hides-neighbours | FIXED. The bubble takes the cat-free side of the top and bottom rows while it fits (`previewBelow`) and is hidden the moment the cat is released (`l1_preview_top`, `l1_preview_bottom`). While a wave banner is up it can sit under the banner for a second. |
| elite-warning-covers-board | FIXED. The warning is a 100 px strip centred on the lane's top run (was 150 px over rows 1 and 2); title 42 px, line 26 px (`j1_warn`). |
| flow-relic-screen-tween-exception | FIXED. The deal and fade tweens are keyed per card and killed before `render()` destroys the card (a tween writing `y` to a destroyed container threw on every frame). A real-run repro was not possible from the sandbox; the debug `win()` flow with the toy screen open runs clean for 14 s. |

REQUESTS: none. (The `SceneManager.cover` request of the polish pass still stands.)


## 2026-10-07 owner feedback

| Item | Root cause | Change | Where it is described |
|---|---|---|---|
| A. hand over the card text | the pick hand's body hung below its fingertip over the card text; the summon hand was placed once and sat on the label | hand comes down from a band above the recommended card (`pickHand`, tested); summon hand lies beside the button and follows resizes | `hud.md` |
| B. laser unclear | the button only showed a one-line bubble; nothing on the board said what the dot did | explanation card (first presses and an info mark), lit lane, area ring, crosshair on marked enemies, caption with the real numbers, guided first use | `hud.md`, `field.md`, `fx.md` |
| C. sunbeam cells faint | a 30 % tan patch and a 30 px sticker | lighter warm patch, cream and dashed border, turning rays, big sticker, sun mark on the cat, a tap explains | `fx.md`, `field.md` |
| D. new cat lost on a crowded board | the cat popped in place; at reduced motion (the owner's) nothing else showed | tossed sticker, landing ring, NEW tag, result chip with the rank ladder; reduced motion keeps ring, tag and chip | `field.md`, `hud.md`, `director.md` |
| E. reduce motion in battle | the setting existed only as a field | toggle in the pause menu's settings, applied at once | `hud.md` |
| F. full motion | never seen on this machine | hit numbers spread along the HUD edge; preview pop-in killed with its card | `fx.md`, `hud.md` |

Debug: `?scene=battle&...&laserguide=1` runs the laser's guided first use in a sandbox run (otherwise sandbox runs skip it). `window.__dbg.battle.lang('en')` switches the language (opening with a `lang=` query parameter next to `debug=1` was unreliable in the runner: `__dbg` appeared late).

REQUESTS: see `hud.md` (home settings row, kit `popIn` guard).

## 2026-10-07 owner feedback (second round)

Three items, built at full motion first (the reduced path keeps the same information as a still picture). Strips and stills are in the session's scratchpad/shots (h = areas, i = weapons, g = result page).

| Item | Root cause | Change | Where |
|---|---|---|---|
| G. no "next chapter" after a win | the result page only knew Home and Retry; `RunConfig.next` (the app flow already supplies it, `src/app/flow.ts nextRunOf`) was never asked | the won page asks `run.next()` once the run is paid out (at once in a sandbox run); an offer turns the bar into a wide primary "Next: Chapter N name" (a butler step says "Next: Butler N" with the chapter under it; a chapter step at butler 1+ says the level under it) over Home and Retry (Retry is secondary), 116 / 92 px faces; no offer or a defeat: the bar is as before | `src/view/nextOffer.ts`, `hud/screens/ResultScreen.ts`, `tests/view.hud.result.test.ts` |
| H. ground effects read poorly | every zone was a faint translucent disc plus particles, with no edge, no end warning and no tell on the enemy | one pooled `AreaLayer` (`src/fx/areas.ts`): each kind has its own paper-cut shape, rim, moving motif, landing, end warning and exit; enemies inside wear a small tag; hostile cells wear hazard tape; the haste and heal rings of clocks and pills are drawn | `fx.md`, `field.md` |
| I. every hit looks the same | one lunge for twenty cats, one white flash and one squash for every enemy, generic sparks | a weapon table (`src/view/weapons.ts`) drives each cat's wind-up and strike, its shot, its swing mark and its impact mark; enemies answer by material with a tint instead of white; heavy cats, crits and boss hits stop the frame a few ms | `field.md`, `director.md` |

Debug hooks added: `__dbg.battle.hazard(kind, cells, seconds)` (a wet or live cell now), `spawn(id, count, from, hpMultiplier)`. Inject a fake offer for the result page with `__dbg.battle.ctx.run.next = () => ({ chapter: 2, stake: 0, start() {} })` before `win()`. `tools/battle_motion.js` now dismisses the first-run lesson card that the new tutorial opens over a sandbox battle (`mcDismiss`).

REQUESTS: `ScreenScaffold` has no way to change its action bar height after construction, so the won page reserves the tall bar up front when `run.next` exists (a win that then gets no offer, such as a daily run, shows today's two buttons in the taller bar). A `setActionBarHeight()` in `src/ui/ScreenScaffold.ts` would let the page grow the bar only when an offer arrives.

## 2026-10-07 owner feedback: tutorial and guidebook

| Item | Root cause | Change | Where |
|---|---|---|---|
| The tutorial teaches only summon and synergy | Controls were revealed by run count and explained by one-line bubbles | 19 lessons, each control or board feature enters when it is taught; first-encounter cards for everything the tutorial left out; a skip button | `guide.md`, `hud.md`, GDD 9 |
| No place to read the rules | Nothing | Guidebook (58 topics, 5 sections) from the home settings, the pause menu and every card | `guide.md` |
| The tutorial run's script | Sunbeams and the fish were the same as a normal run | Sunbeams arrive when the scripted pick is answered, fish topped up at wave 5, a box of kittens at wave 6 | `sim.md` |

Debug: `window.__dbg.lessons` (see `guide.md`). The battle debug route's tutorial sandbox runs the lessons with in-memory progress; `tools/battle_motion.js` `mcOpen` marks them skipped, a lesson run opens the game itself.

REQUESTS: see `guide.md`.

## 2026-10-07 last gaps

| Item | Root cause | Change | Where |
|---|---|---|---|
| 1. crowded wave 16.5 to 11.5 ms mean, p95 28.7 to about 18 | the whole scene was re-recorded every frame; 110 draw calls from areas; about 35 `hit` numbers a frame, most evicted unseen | render group per layer, baked areas, number budget, small per-frame costs, faster governor | `fx.md` |
| 2. skip button over the enemy strip | the button took 148 px of the strip's end, then dropped a row onto the toys | top row only, strip cut to give way | `hud.md` |
| 3. cards cover the board | above/below weighing put a 270 px card next to its target | card over the half of the screen the target is not on | `hud.md` |
| 4. result bar reserved for three buttons | scaffold height fixed at construction | `ScreenScaffold.setActionBarHeight` | `hud.md` |
| 5. tutorial from a fresh profile | played once: 19 lessons in order, 118 game seconds | speed hand under the skip button, laser bubble over lesson cards and sheet, awakening card at the front, molt sublabel, "next" after the tutorial | `hud.md` |
| 6. next chapter | played: chapter 1 to 2 through the pre-run page, last chapter, defeat | none needed | `hud.md` |
| 7. alignment audit | display-tree audit of the HUD screens, both languages, both heights | molt sublabel, laser guide bubble | `hud.md` |

Debug and method notes: a battle on the real route has `__dbg.battle` and `__dbg.lessons` too; `__dbg.meta.unlockAll()` then `__dbg.home.shell.startRun({ mode: 'chapter', chapter: 5, stake: 0 })` opens the last chapter's pre-run page (there are 5 chapters; asking for 6 is refused with "아직 열리지 않았어요"). `tools/battle_motion.js` `mcOpen` marks the lessons skipped, but not the first-encounter cards: mark every topic taught (`for (const id of progress.unread()) progress.markTaught(id)`) before measuring frame time or the cards pause the simulation.
