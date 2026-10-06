# Handoff: hud (battle HUD, popups and run screens), paper scrapbook restyle

Date 2026-10-06. Paths: `src/view/hud/**`, tests `tests/view.hud*.test.ts`. Entry point `createHud(ctx): HudPart` (`src/view/hud/index.ts`), built against `src/view/context.ts` only. Behaviour is unchanged except the build-planning additions listed under "Merge rule".

## What it looks like now

Every piece is cut paper on the wooden floor, built from the kit (`@/ui`): cream sheets, kraft strips, coloured craft paper, one piece of tape per card, teal dashed "cut here" lines, ink text without stroke or shadow. Light text appears only through the kit's on-art helper (`+N` of the toy row on the floor, the field's own banners are not mine). There is no purple, no gloss, no glow, no blur and no hex literal in the folder (`grep -rnE "0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}" src/view/hud` prints nothing). The class colours (red, green, blue, yellow) come from tokens in `kit.ts` (`CLASS_ACCENT`, the mage blue is `Rarity.rare.color`).

| Piece | File | Look |
|---|---|---|
| Pause, speed | `TopBar.ts` | round cream paper pause; round teal speed button (coral at 2x / 3x), the ">" of the mock |
| Enemy gauge | `GaugeStrip.ts` | long torn cream strip, skull sticker over its left end, count in ink, painted fill (leaf, mustard, coral by danger level), warning icon, "overrun" countdown in the same strip |
| Phase label, countdown | `TopBar.ts` | `PaperLabel` ("준비해요", "1막 · 웨이브 3/24"); kit `ProgressBar` on a kraft track with its own 24 px ink label (the kit label would be 20 px at this height) |
| Preview chips, toys | `TopBar.ts` | small crooked paper cards with the enemy sticker and "×N" (berry paper plus a skull for elites and bosses); toys are stickers on the floor |
| Boss strip | `BossBar.ts` | wide torn strip, boss sticker over the left end, name, clock + time left, verdict badge (leaf / mustard / coral paper with check / clock / warning glyph) + "예상 N초", painted ghost health bar; marker on the countdown bar |
| Bottom sheet | `BottomPanel.ts` | cream sheet with a torn top edge rising off the screen bottom, a strip of kraft peeking out above it |
| Class chips | `ClassRow.ts` | kit `ClassChip` on a holder with its own tape colour (warrior pink, ranger green, mage sky, trickster yellow) |
| Fish / purr | `CurrencyRow.ts` | kit teal torn pills, icon over the left end; round teal "%" odds button; pity chip is a mustard pill that sways while the bonus grows |
| Summon, grade, laser, call wave | `SummonButton.ts`, `ActionRow.ts` | coral summon paper with pink tape; grade is cream with the green arrow when affordable and plain kraft when not (price says the rest); laser is a round `IconButton` (teal idle, coral while aiming with a draining ring, kraft while recharging with a filling ring and the seconds); six-paw tracker; green call-wave paper |
| Selection sheet | `SelectionSheet.ts`, `BuildPlanView.ts` | ivory card with a dashed rarity-coloured line, taped photo of the cat, name, rank pill, class pill, damage / interval / range, one skill line (tap for the rest), the build-plan well, Molt (teal) / Awaken (mustard) / Sell (berry) |
| Sell strip | `SellStrip.ts` | kraft strip with a dashed berry line; berry paper with a cream line when the cat is over it |
| Class sheet | `popups/ClassSheet.ts`, `ClassLadder.ts` | see below |
| Odds, pause | `popups/OddsPopup.ts`, `popups/PauseMenu.ts` | kit panels (pause: torn bottom + tape) |
| Molt picker | `popups/MoltPicker.ts` | three paper cards; each shows the class and the cat the molt would produce (same rank, other class) |
| Pick of three | `popups/SummonPickPopup.ts` | kit rarity photo frames; under each: class, "합치면 / Merges into" and the next cat's name |
| Toy choice | `screens/RelicScreen.ts` | three wide paper photo frames pinned with tape (a different print per rarity): cream border, mat in the rarity colour, dashed inner line (rare+), photo corners (epic+); header on paper labels |
| Settings | `screens/SettingsScreen.ts` | paper rows on the floor |
| Continue | `screens/ContinueScreen.ts` | one cream page with tape, the effect marked with yellow marker, green ad / teal gem / kraft quit |
| Result | `screens/ResultScreen.ts`, `Coupon.ts` | scrapbook page: big paper title label with tape, taped photo of the best cat (`bestCat`), the six numbers as a dashed list, rewards as teal count strips and crooked paper stickers that pop in, double / snack offers as paper coupons (perforation + round stub) |
| Tutorial | `Tutorial.ts`, `Hand.ts` | warm-brown dim (`Dim`), spotlight hole edged with a dashed cream line, a hand cut from cream paper with an ink line |
| Hints, toasts | `hints.ts` | kit speech bubbles (tooltip) and kit toasts |

## Merge rule (the build-planning work)

Merging two identical cats always makes the next rank of the same class (`mergeResultOf`). All the maths is in `planMath.ts` (pure, tested in `tests/view.hud.plan.test.ts`): `planOf`, `countOf`, `rankCounts`, `ladderOf`, `findTwins`, `nextTierGoal`, `bestCat`.

- **Selection sheet** (`BuildPlanView`): "합치면 ▶ [photo] name" for ranks 꼬마 to 골목대장 with "같은 고양이 N마리" and "2마리면 합칠 수 있어요" (turns into "끌어서 합쳐요!" on a mustard well with a dashed line when a pair exists); for a 대왕 "각성하면 ▶ [photo of the 수호신]" with two requirement rows (synergy tier 2 with the current tier, purr n / cost) and a check disc each; "가장 높은 등급이에요" for a 수호신. The card rebuilds only when its content key changes (cat, stats, tier, purr, twins), not on every fish tick.
- **Class sheet** (`ClassLadder`): the five portraits in a row joined by arrows labelled 합성 / 각성; owned ranks are lit photos with a "×n" pill (mustard from two), missing ranks are empty dashed slots, an arrow turns class-coloured when its step can be taken now (a pair of the lower rank; any king for the awakening); under it the rule line, "서로 다른 고양이 N종", the next goal ("시너지 2단계까지 1종 더") and the three synergy steps, each with N dots lit by the different cats on the board.
- **Pick of three**: each card says what it merges (or awakens) into.
- **First-time hint** `twins` (`hud.hint.twins`, id added to `HINT_IDS`): when two identical mergeable cats first stand on the board outside the tutorial, `Hud.pointAtTwins` asks for the bubble on one of them as soon as `ctx.unitView` has a view for it. It goes to the front of the hint queue and sends a bubble that is already up back to wait (`Hints.request(id, target, onSelection, first)`); it never pauses the battle and is remembered like every hint.
- **Text audit**: the tutorial's merge line now says the result is the next rank of the same class; nothing else in the HUD described a random result (molt strings are still correct: same rank, other class). `hud.molt.keep` was replaced by the real result on each molt card.

## Wiring notes

- `anchor(name)` unchanged (`fish`, `purr`, `enemyGauge`, `wave`, `summon`, `relics`, `laser`); `enemyGauge` is the centre of the strip, `laser` the centre of the round button.
- `TopBar.waveLabel` is now a `PaperLabel` (a `Container`), still the target of the `sun` hint.
- `layoutMath.topRects`: gauge 440 x 58 at x 150, countdown 212 x 34 (the boss sticker overhangs 34 px, so the boss strip starts at x 264); `bottomRects` unchanged.
- Shared helpers in `kit.ts`: `unitPhoto` (taped paper photo of a cat, or an empty dashed slot), `CLASS_ACCENT`, `CLASS_TAPE`, `PressCard`, `fitSprite`, portraits and fallbacks (paper discs, no gradients).
- New strings (ko + en, same placeholders): `hud.plan.*`, `hud.ladder.*`, `hud.class.rule|goal|goalMax`, `hud.hint.twins`; `hud.class.have`, `hud.tut.merge` reworded.

## Verified

- `npx tsc --noEmit | grep -E '^(src/view/hud|tests/view\.hud)'` prints nothing. `npx vitest run tests/view.hud`: 5 files, 60 tests green (new `view.hud.plan.test.ts`: every class line, awakening, twins, ladder counts, synergy goal, best cat; new layout assertions for the countdown / boss sticker clearance).
- Aside browser, `PAGE_ERRORS` is `[]` on every run, Korean and English, 720 x 1280 and 720 x 1600 (`visualViewport` override, see the helper `tall()` in the scratchpad `hud/lib.js`): prep, mid-wave, wave with a boss and the live estimate, danger gauge and warning icon, 2x speed, laser aiming and recharging states, sell strip while dragging, pity chip, refusal toast, selection sheets (twin pair, king, guardian, English, run-2 two-button layout), class sheets (both languages, run 0 without the upgrade block), odds, molt picker, pause, in-battle settings, pick of three (both languages), toy choice and the toy landing in the top row, continue, defeat and victory results (sandbox and with real rewards), tutorial steps 1 and 2 with hand, dim and spotlight, merge in run 0 unlocking the chips and the chips hint, the twins hint, staged reveal for runs 0, 1, 2, 3, 5.
- Screenshots to open (scratchpad `shots/hud/`): `final_prep_ko`, `final_sel_twin_ko`, `final_sel_king_ko`, `final_class_warrior_ko`, `final_molt_ko`, `final_boss_tall_ko` (1600), `j1_class_ranger_en`, `j1_pick_en`, `b2_pick`, `i1_relic`, `b3_continue`, `b4_defeat`, `b5_victory`, `f1_victory_rewards_tall`, `f2_coupons` (all four coupon states), `c1_t0` / `c1_t2` (tutorial), `d3_sell_strip`, `d1_laser_speed_danger`, `m1_boss_en`, `e1_runs0` / `e1_runs1` / `e1_runs3`, `i1_settings`. Hold `final_prep_ko` next to `art/style2/uistyle_paper.png`; `crop_top.png` / `crop_bottom.png` next to `crop_mock_top.png` / `crop_mock_bottom.png` show the two side by side.

## Known gaps

- The mock's round teal ">" is the existing speed button (1x shows a single chevron); "call next wave" keeps its green paper in the row above the summon button and only exists while a bonus is on offer. No behaviour was moved.
- The boss strip no longer prints the "보스 / 엘리트" tag: the sticker and the berry preview card say it. Time left appears on the strip as well as on the countdown bar.
- Toy stickers sit straight on the floor art; the toy icons are still the old art and will be redrawn under the same keys.
- (2026-10-07: the ladder photos are 88-112 px now, see the polish section.)
- (2026-10-07: the coupons, the tutorial's third step and the reduced-motion paths were checked in the browser, see the polish section.)
- The Aside tab sometimes times out on a screenshot right after a state change (flaky, a retry works; not a page error).
- (2026-10-07: those banners now sit in the band above the board, see director.md.)

## REQUESTS

None blocking. Optional: `ProgressBarOpts.labelSize` in `src/ui` so a bar shorter than 43 px can carry the 24 px label rule without an overlay text (the HUD overlays its own for the countdown).

## 2026-10-07 polish

**Class sheet ladder (`ClassLadder.ts`, `popups/ClassSheet.ts`).** The five portraits are no longer 68 px: they widen toward the awakened cat, 88 / 94 / 100 / 106 / 112 px (`PHOTOS`), standing on one baseline with their rank names under them (a name may use the photo width plus the gap plus 14 px, so "Alley Boss" is not cut). The 합성 / 각성 step labels moved above the arrows, riding just over the taller neighbour's top edge with the arrow tucked under each label; that is what stopped "Merge" from colliding with the photo frames in English. `LADDER_H` is 188 (was 110) and the sheet is 76 px taller (1,032 px of content, it fits at 1280 without the popup shrinking). Proof: `shots/polish/c1_ladder_ko.png`, `c1_ladder_en.png`, `c1_ladder_en_crop.png`.

**Result screen.** In English the luck line ("Summon luck was in the bottom 28% this run. Not your fault!") wraps to two lines and printed over the seed line. It is now centred in the gap between the list and the seed line (`ResultScreen.ts`). Proof: `n3_crop.png`.

**"The first tap on the summon button is swallowed" is an artefact of the runner, not a bug.** What is real: `SceneManager.cover` (a `static` full-screen `Graphics`) swallows every pointer event until the scene transition has finished, 0.38 s + 0.45 s of tween time with the iris. The Aside tab renders about 1 frame per second and the game clamps one frame to 50 ms, so the transition lasts 10 s or more of wall time and a tap after `sleep(2500)` lands on the cover. Proof: (1) with window capture listeners and a `battle.summon` wrapper, two taps issued 0.4 s and 1.4 s after `openGame` produced DOM `pointerdown` and a Pixi `stage` `pointerdown` whose target was the cover `Graphics`, and zero `summon()` calls; (2) `rootBoundary.hitTest` at the summon anchor returned that `Graphics` (chain `Graphics > passive Container > passive Container > stage`), `scenes.transitioning` was still `true` after 2.5 s and `ticker.FPS` was 0.98; (3) after waiting until `scenes.transitioning === false`, the very first tap made `summon()` run once (`calls: 1, summons: 1`). Audio unlock cannot eat the tap (`game` listens to `pointerdown` in the capture phase and never stops it; `AudioEngine.unlock` only calls `resume()`), `Button` with `fireOnDown` fires in `onDown`, and the tutorial's four blockers leave the spotlight hole open. On a 60 fps device the cover lasts 0.83 s, and a tap during the last 0.45 s (the scene is already visible while the iris opens) is swallowed by design; see REQUESTS. Rule for every runner script: wait for `__dbg.scenes.transitioning === false` before the first tap.

**Verified in this pass (screenshots in `shots/polish/`, `PAGE_ERRORS []` every time):** the result screen of a real (non-sandbox, `runs=3`) victory with gold, xp and a chest sticker (`l_result_scroll2`, `m_result_offers`); the double and snack coupons (`m_result_offers`; the ad service answers `first_run` until `ads.qaSetProgress({ sessions: 3, runsBegun: 3, runsCompleted: 3 })`, because the debug battle route never calls `beginRun`; the live `ads` is reachable from a runner script with a dynamic import of `/src/platform/index.ts`); the continue screen after a defeat with 10 waves cleared, in English (`n2_continue_en`; with 9 cleared the run correctly goes straight to the result, `REVIVE_MIN_WAVES` counts cleared waves); the tutorial's merge step and third step, the hand on the recommended card of the pick of three (`o_t_merge_ko`, `o_t_pick2_ko`); reduced motion and flashes (below).

**Aside reports `prefers-reduced-motion: reduce`.** `matchMedia` is true, so `motion.reduced` and `fxSettings.reducedMotion` are true in every Aside run: all earlier screenshots (the restyle's included) show the reduced paths. To see the full-motion paths set both by hand (`fx.setFxSettings({ reducedMotion: false })` and `ui.motion.reduced = false`). Checked both ways: banners fade in place without tilt or scale pop under reduced motion and the big ribbon has no sunburst (`p_red_in`, `p_red_big`); full motion pops with a tilt and shows the flat paper sun (`p_full_in`, `p_full_big`); with `flashes: false` a `screenFx.flash` leaves the screen untouched (mean blue channel of the board area 183.3, against 159.4 with flashes on: `p_flash_off`, `p_flash_on`).

**Played with real taps and drags** (summon button taps, drags to merge, taps on the three-pick and the toy choice; `skipToWave` only to reach later waves): speed 1 waves 1-3 (`h2_s1_w*`), speed 2 waves 7-10 with the act-2 boss, its warning ribbon and the toy choice (`h3_s2_w8`, `h3_s2_pend_relic_20`, `h3_s2_w9`), speed 3 waves 15-17 (`h3_s3_w*`). After each toy pick or pick of three the pause reasons were `[]`, the field's lift layer empty and no banner stuck. Found and fixed: the luck line (above) and missing haptics for sell, move, swap and class upgrade (`director/growth.ts`, see director.md). Chosen not to fix: the one-time `twins` hint bubble covers a few empty cells while it is up (a tutorial hint, not a routine banner; it never pauses and the HUD owns it); sticker numerals of big hits near the entrance float behind the HUD's wave label for a moment (drawn under it, so nothing becomes unreadable); the `ad` icon in the coupons and the continue screen keeps the kit's violet screen (a kit icon in `src/ui`).

Known gaps now: the coupon tap itself (the mock ad overlay) was not driven; the reduced-motion paths of the selection sheet and the popups were only looked at, not compared frame by frame.

REQUESTS: `src/core/scene.ts` `SceneManager.cover`: set `cover.eventMode = 'none'` as soon as `open()` starts, so the first 0.45 s of a visible scene accepts taps (the cover only has to block while the scene is hidden).
