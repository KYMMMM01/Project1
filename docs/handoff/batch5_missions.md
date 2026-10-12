# Hand-off: batch 5, item 1 (missions tab, "오늘의 상자" overlap)

Date 2026-10-12, base commit `27301a1`. Owner's words and decisions: `docs/qa/directive_2026-10-12_batch5.md`, item 1. Nothing is committed, pushed or deployed.

## What was wrong

`ChestStrip.ts` (the featured card of the daily chest, and the same helper draws the weekly chest) placed everything from constants that happened to fit one reward in one language:

- the points bar ran 22 px under the chest plate (`barW = w - 2 * 32 - 128 + 22`), and the 128 px plate reached down to the buttons' row (plate bottom y 190, buttons' top y 186);
- the reward row (191 px for gem 20 + chest x1), Claim (180) and "확률 보기" (190) were laid on one row of 608 px: reward, 24 px, Claim, then what was left (23 px) before the right-anchored odds button. In my render of the owner's state nothing ran under Claim, but with no spare room any wider amount, a wider font on a phone, or a three-chip reward would put the chips under the locked Claim button (its padlock hangs on its top-left corner): that is the owner's picture, and I could not reproduce it exactly;
- the lowest button's shadow ended at y 279 on a 280 px card, 8 px over the card's own 9 px mustard border: no air under it.

The weekly chest is the only sibling built with the same helper; it had the same plate / bar / button crowding (its single chip hid the reward fault). The cup and endless cards (`TierCard.ts`) were looked at on screen in Korean and show no overlap.

## What it is now

Rows, top to bottom (card 672 wide, sides 32): the title pill left and the reset timer right (the weekly chest has no timer); the points bar with the reward chips under it, and the chest plate at the right end of that block with 16 px of air between plate and bar; Claim and "확률 보기" side by side on a row of their own, spanning the card (Claim gets 58 % of the row, each button at least as wide as its label plus padding, the padlock's reach included).

`src/screens/missions/stripLayout.ts` is pure (no Pixi): `planStrip(measure) -> plan` gives the rect of every part and the card's height. `ChestStrip` builds each part at its natural size, measures it (title pill `uiBox`, timer `uiBox`, reward row `uiBox`, the real width of both button labels at their font sizes through `buttonWidthFor`), asks the plan, then places each part by its `uiBox` (`place()`), so a longer word or a bigger reward moves things and never lets one part run under another:

- a reward that no longer fits beside the plate (more than 464 px) drops to a row of its own under the bar and the plate, and a row wider than the whole card is scaled down uniformly (`rewardScale`);
- a title wider than the room the timer leaves is squeezed by `PaperLabel.setMaxWidth`;
- two buttons whose natural widths do not fit shrink together in proportion (their labels then shrink through `fitLabel`).

The card's height is now `ChestStrip.cardH` (replaces the exported constant `CHEST_STRIP_H = 280`); `DailySection` and `WeeklySection` read it. Unchanged: the look (featured card, tape, painted bar, chest sticker with its wiggle, stamp), every state's behaviour, every string, the guidebook pointer (`pointAt('missions.chest')`).

## Numbers

| | before | after |
|---|---|---|
| card height (design px, both languages, both cards) | 280 | 368 |
| bar width | 574 (22 under the plate) | 464 (16 clear of the plate) |
| gap, reward row to Claim | 24 (beside it, the padlock in between) | 18 (the reward is on its own row above it) |
| gap, Claim to "확률 보기" | 23 (what was left) | 16 |
| air under the lowest button's shadow | -8 (over the border) | 20 above the 9 px border |
| Claim / "확률 보기" width | 180 / 190 | 343 / 249 in both languages (58 / 42 % of the row; the natural widths, measured, are 180 / 190 in Korean and 190 / 190 in English) |
| reward row, gem 20 + chest x1 | 191 | 191 (a three-chip 1,200 / 20 / x1 row, about 325 read off the still, also sits beside the plate) |

The Missions tab scrolls, so the 88 px of height only moves the notebook down: at 450 x 900 the first two mission lines still show under the card.

## Tests

`tests/screens.missions.stripLayout.test.ts` (21 tests, new): no two parts closer than the bar-to-reward gap over a grid of title / timer / reward / Claim / "확률 보기" widths (4 x 2 x 9 x 4 x 4 combinations, including the 464 / 465 boundary of the beside-the-plate rule); every part inside the side gutters and above the bottom border; title left, timer right; long title squeezed; reward beside / dropped / scaled; card grows only when the reward leaves the plate side; three chips of five-digit amounts fit beside the plate; buttons span the card with the 16 gap, Claim larger, a long label takes room from the other button, both shrink in proportion when nothing fits; same height in both languages; `buttonPad` mirrors the Button's own padding; the padlock stays clear of the glyphs. No existing test changed.

## Seen on screen

Headless Edge, 450 x 900 and 360 x 800 (the design width is always 720: only the scale differs), Korean and English, the daily card in locked (0 points), partly filled (50), ready to claim (100) and claimed, the weekly card in the same four states, and the daily card with a three-chip reward (gold 1,200 + gems 20 + chest x1: patched into `profile.dailyChestView` for the look only, the data has no such reward). Before and after stills are in the lead's scratch folder `scratchpad/batch5/missions/shots` (`before-*` and `after-*`).

The dev server could not serve the shared tree while other areas were being edited (module errors after every save of `meta/dungeon.ts` and friends), so the stills came from a copy of the base commit `27301a1` with only `src/screens/missions/*` copied over it. The missions tab does not depend on the changed files; a last look in the joined tree is for the landing engineer (below).

## For the next engineers

- Landing: after the join, open the missions tab once (home -> missions after `window.__dbg.meta.finishRuns(3)`), daily and weekly, in both languages, and check the card; `ChestStrip.cardH` also moves the notebook below it.
- Font: no string was added, changed or removed in this area, so `npm run font` has nothing new from this item.
- If the owner wants the bar to run under the plate again (the old "bar ends in the sticker" look), it is a one-line change in `planStrip` (`bar.w`), at the price of the "nothing overlaps" rule.

## Open questions for the owner

- The card is 88 design px taller (280 -> 368) because the reward and the two buttons each got a row. If that is too tall, the cheapest cut is moving "확률 보기" next to the chest plate under the title (a smaller secondary button), which brings it to about 300. Not done without asking.
