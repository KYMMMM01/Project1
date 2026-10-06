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
- Ladder photos are 68 px: enough to tell the five cats apart, small for the awakened ones.
- The offer coupons were checked in isolation (the debug route's ad service offers none), the tutorial's third step (pointer on the pick popup) only by code, and the reduced-motion path only by code (same tweens as before, guarded by `motion.reduced`).
- The Aside tab sometimes times out on a screenshot right after a state change (flaky, a retry works; not a page error).
- The field part still draws its own banners ("전사 시너지 3단계!", the wave banner) over the top rows of the field: not in this folder.

## REQUESTS

None blocking. Optional: `ProgressBarOpts.labelSize` in `src/ui` so a bar shorter than 43 px can carry the 24 px label rule without an overlay text (the HUD overlays its own for the countdown).
