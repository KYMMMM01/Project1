# Batch 5, close-out (review findings, directive check)

Base commit `27301a1`, everything uncommitted in the working tree. Directive and decisions: `docs/qa/directive_2026-10-12_batch5.md`. Area notes: `batch5_missions.md`, `batch5_dungeon.md`, `batch5_endless.md`, `batch5_skills.md`, `batch5_land.md`.

## The ten review findings

| # | Finding | Verdict | What was done |
|---|---|---|---|
| 1 | The test that says the chest "never rages" passed with the `calm` flag removed | Real | The rage check lives only in `damageEnemy`; the test set `hp` directly and never reached it. `tests/meta.dungeon.sim.test.ts` now hits the chest through `damageEnemy` (down to under half, and one 60% blow from full health) and asserts no `enrage` event and `enraged === false`. Mutation: deleting `&& !e.spec.calm` in `src/game/sim/enemies.ts` fails both tests (before: 17/17 green); restored. The control (a chapter boss does rage) is the existing `sim.enemies.test.ts` "enrage (king cucumber)". |
| 2 | Calling the next wave early at dungeon wave 4 skips the stage reward and the toy pick | Real | Reproduced first: `callBonus()` was 15 at wave 4. `callBonusOf` (`src/game/sim/flow.ts`) now returns -1 when `s.mode === 'gold' && s.wave % ACT_LENGTH === 0`, so the HUD button is closed and `callNextWave()` answers `not_available`. New test in `tests/meta.dungeon.sim.test.ts` (waves 1 to 3 open, wave 4 refused with no `actClear`, its clock still brings the reward and the 3-toy pick, wave 5 open again); it failed before the fix. Spec line added to `docs/명세_메타.md` section 13. |
| 3 | The coin's 0 armour and the test exemption are not in the directive | Real | The directive names no armour; the batch-3 rule ("every ordinary enemy 5 to 10%") stands. The coin now has `armor: 0.05` (the value of the small quick enemies dust, drop, balloon_small). The exemption is gone from `tests/codex.resist.test.ts` (plain `>= 5` again, page shows 5%) and `tests/sim.enemyResist.test.ts` (the ordinary list incl. the coin is checked to be 5..10%, roomba aside). Rules table and the dungeon hand-off corrected. Bots re-measured, see below: still 100%. The chest keeps armour 0 (bosses were not covered by the rule). |
| 4 | "보물상자 +N" reads as extra gold on top of "최대 N 골드", but the maximum already contains it | Real | `dungeonMaxChest(t)` < `dungeonMaxGold(t)` and a win pays exactly the maximum, so the chest share is inside it. Card tag and result callout reworded as a part: see the strings list. `tests/screens.shell.dungeon.test.ts` pins both texts, forbids a "+" in them, and checks for all five tiers that the chest share is positive, smaller than the maximum, and that a full win pays exactly the maximum. The pre-run line "골드를 {n} 더 줘요" stays: it follows the line that lists the other pay, so "more" is right there. Spec lines updated. |
| 5 | English "Treasure Chest" is cut to "Treasure Ch…" on the boss strip | Real | Measured in the real strip at 360 wide: the name gets 142 design px with "Est. ?" and about 110 with "Est. 99s+", at the smallest allowed font (24); "Treasure Chest" needs about 152. English name is now **"Coin Chest"** (10 characters, 116 px at full size). "Gold Chest" was rejected: it is the shop's chest. The four English lines that said "treasure chest" now say "coin chest" (pre-run x2, result callout, guide page). Korean stays 보물상자. New `tests/dungeon.names.test.ts` (name length, one noun everywhere in both languages, no "treasure chest" in any registered string). Seen on screen: "Coin Chest ⏱48s ✓Est. 15s", no cut. "King Cucumber" and "Bath Overlord" (13 characters) are cut the same way; that is the strip's old limit and I left it (see open points). |
| 6 | Skills document does not say that gold dungeon, daily and endless were not measured, yet recommends skills there | Real | Appendix A limit 5 added; section 7 item 9 now says the "yes" is an unmeasured recommendation and why (dungeon already 100%; endless losses end on the elite and boss time limit and damage cap, which skills must not beat). |
| 7 | The "about 2.4 s of the cat's own output" budget is not met by the two haste skills | Real, arithmetic checked | Tiger 4 s x 0.4 = 1.6 s (12 s cooldown, about +13%); starfall archer 3 s x 0.4 = 1.2 s (about +10%, 0.9 s / +7.5% at the recommended +30%). Section 3.0 item 3 and the formula paragraph of 4.1 now say the guardians' +20% is an upper bound for those two and that the 4.2 measurements come first. |
| 8 | Push window of 4 s is the value the owner lowered for the black hole | Real, checked in code | `pullEnemy` returns 0 while `s.time < e.pullImmuneUntil`, and the owner said "블랙홀 면역 4초는 너무 길어, 2초 정도로" (`directive_2026-10-09_batch2.md` item 17). Sharing that field with a 4 s push window re-creates 4 s on the black hole. Section 3.2 has a "주의" bullet with the two options (2 s window: 75 px/s, above a cucumber's 70; or a separate `pushImmuneUntil` field, recommended), the comparison table, 3.15, 3.16 and 5.2 point at it, and section 7 has a new question 11. |
| 9 | Boss fight length in the auto-cast argument is off | Real | Elite limits 40/45/50 s, boss limits 50/55/60 s (`balance.ts`); median kill is 52% of the limit (4.2). Section 2.5 now says the gauge fills 1 to 3 times in one elite or boss fight. |
| 10 | Cost headline "about 2,000 lines" is lower than the document's own sums | Real | Phases sum to 2,200; the rows of section 5 add up higher. Section 1 now says about 2,200 to 2,800 lines with tests, and says where each end comes from. |

## Item-by-item against the directive

| Item | Status | Notes |
|---|---|---|
| 1 Missions "오늘의 상자" overlap | Done | Re-checked on the joined tree at 450 x 900 and 360 x 800, ko and en, locked / partly / ready / claimed, daily and weekly, plus a patched three-chip reward: the part geometry check finds no overlap (the three-chip patch shows a 1 css px bound overlap of transparent sticker padding with the bar, invisible in the picture). Card is 88 px taller (368). Cheaper variant (확률 보기 beside the plate as a small secondary button, about 300) is an owner question. |
| 2 Own skills with an SP gauge | Done as a design only, as the directive decided | `docs/design_skills_v1.md` (+ ring picture), corrected by findings 6 to 10. Nothing implemented. |
| 3 Gold dungeon | Done | One free entry a day, none sold (`DUNGEON_EXTRA_ENTRIES` 0; the buy code stays dormant and tested). Seven coin waves, the chest alone on wave 8. 131 enemies (was 399). One pay formula, maximum 88.9 to 89.0% of the old daily maximum at every tier, kill gold 0.6 -> 4. Easy by the directive's bar (95% merge / 99% synergy): both bots 100%. Partly beyond the letter: the chest has a harmless `spill` ability (a data test demands one for every boss). |
| 4 Endless mode | Done | Korean name 무한 모드 in all four places and the guide; `ENDLESS_GROWTH` 1.14 -> 1.07; weekly ladder 40 / 60 / 80 untouched; bot reach reported before and after. Past 40 waves the elite and boss time limit becomes the wall (it does not scale with the constant): owner question. |

## Numbers behind the two armour / chest changes

Dungeon, `tests/simreport.dungeon.sim.ts`, 150 runs per cell at each tier's recommended level, with the coin at 5% armour:

| Tier | merge | synergy | random | minutes (merge / synergy) | mean pay merge / synergy (max) |
|---|---|---|---|---|---|
| 1 | 100% | 100% | 100% | 2.48 / 2.36 | 1,200 / 1,198 (1,200) |
| 2 | 100% | 100% | 100% | 2.49 / 2.37 | 1,560 / 1,558 (1,560) |
| 3 | 100% | 100% | 100% | 2.48 / 2.37 | 1,920 / 1,917 (1,920) |
| 4 | 100% | 100% | 100% | 2.46 / 2.34 | 2,400 / 2,398 (2,400) |
| 5 | 100% | 100% | 100% | 2.44 / 2.35 | 3,000 / 2,997 (3,000) |

Before the 5% armour the same table was also 100% everywhere (2.4 min). Nothing moved by more than 0.05 min.

## Tests and checks

`npx tsc --noEmit -p .` prints nothing. Whole suite: 167 files / 3,564 tests, all pass (base 163 / 3,506; the area work added 3 files, this close-out one file `tests/dungeon.names.test.ts` and 5 tests). `npm run font` was run: `game-kr.a3dcbdba`, 618 syllables, byte-identical (the new Korean words used glyphs already in the set).

## Open points that stay with the owner or the next engineer

1. The strip's name slot is about 110 to 142 design px in English. Two older names (King Cucumber, Bath Overlord) are cut too when the kill estimate shows. A general fix is a layout change of the strip's top row (for example moving the estimate to the bar row); I did not start it.
2. The coin's 5% armour is now a decision of mine from the batch-3 rule. If the owner wants the dungeon coin armourless, it is one number and two test lines.
3. Everything from the area notes remains open: the +88 px missions card, whether the chest counts as a boss for the missions, the 40 / 60 / 80 endless ladder and the elite and boss time limit, the ten (now eleven) skills questions in section 7 of the design document, the chest's missing death sound, whether an abandoned dungeon run gives the entry back, the codex pages of the coin and chest showing the butler-level row.
4. The chest's info card did not open when its strip was tapped in the debug route (landing engineer, not investigated).
