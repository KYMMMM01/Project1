# batch-1009 담당자 보고(원문)


---

# structure:board

**Board 5 x 5 and buff markers are in the working tree, uncommitted.** `npx tsc --noEmit` prints nothing for `src` and `tests`. The whole suite is green, 136 files and 2,995 tests. Browser runs (Aside, port 5199) all ended with `PAGE_ERRORS []`.

## Item 16: the board is 5 x 5

`ROWS` is now the single source in `src/game/geometry.ts`. `CELL_COUNT`, `BOARD_*`, `FIELD_H` and the loop all derive from `COLS`, `ROWS`, `CELL_W`, `CELL_H` and one floor margin. No simulation, view, tutorial, bot, guide or test code assumes 4 rows or 20 cells any more.

| | old | new |
|---|---|---|
| cell | 108 x 112 | 108 x 96 |
| board | 540 x 448 | 540 x 480 |
| field | 720 x 624 | 720 x 660, exactly the band between the HUD blocks at 1280 |
| lane centre line top / bottom | 44 / 580 | 45 / 615 |
| loop length | 2270.2 px | 2338.2 px (+68 px, +3.0 %) |
| outer ring / middle | 14 / 6 cells | 16 / 9 cells |
| cats' height | 92 to 104 px | 79 to 89 px |

- **Layout:** at 1600 the spare height splits 160 px above and below the field, as before. The HUD blocks and their grids are untouched.
- **Cats:** their stickers and offsets scale to the 96 px cell. The rank tag sits 5 px higher so it stays inside the cell.
- **Banners:** at 1280 they now run at scale 0.8 (was 0.875), because the free band is 78 px (was 88). I changed `SHEET_PAD` 14 -> 12 to keep the "banners end above the sheet" test passing.
- **Sunbeams:** `SUN_CELLS` 4 -> 5 and `sunny_day` 8 -> 10, the same share of the board as before. The first sunbeams are now a plus on the middle cell, `[7, 11, 12, 13, 17]`.
- **Ring-dependent toys:** the perch ring is 16 cells and the top row is unchanged. The toy flourish stagger went 45 -> 36 ms so the whole draw-in still takes about 1.14 s.
- **Tutorial:** the kitten gift cap went 8 -> 13 so the board still fills for the selling lesson.
- **Bots:** the synergy bot counted its cats as `20 - empties`; it now uses `CELL_COUNT`. A test fails if the literal comes back. The bots' empty-cell thresholds were left alone.
- **Numbers and ribbons:** the damage-number crowd regions went 156 -> 165 px tall. The act-clear ribbon and overflow gauge now centre on `FIELD_H / 2`, which is the same 330 as before.
- **Saved runs:** `parseSnapshot` rejects a wave-start save from the old board (it already checks the cell count), so a run in progress on the old build restarts. `SIM_VERSION` is not bumped.

**Wave timing, seconds for one enemy to walk one loop (old -> new):**

| enemy | old | new |
|---|---|---|
| dust (85 px/s) | 26.7 | 27.5 |
| drop (125) | 18.2 | 18.7 |
| cucumber (70) | 32.4 | 33.4 |
| tangerine (66) | 34.4 | 35.4 |
| elite (60) | 37.8 | 39.0 |
| roomba (48) | 47.3 | 48.7 |
| bosses (38 to 42) | 54.1 to 59.7 | 55.7 to 61.5 |

A normal wave is 15 s with a 9 s spawn window, and spawn spacing and the enemy cap don't depend on the loop length.

**Frame time of the standard crowded wave** (chapter 3, wave 21, speed 3, three runs each):

| | mean ms | p95 ms |
|---|---|---|
| before, 20 cats | 11.4, 11.5, 12.7 | 22.2, 20.7, 26.5 |
| after, 20 cats | 11.9, 10.5, 11.3 | 22.4, 19.5, 24.8 |
| after, 25 cats | 11.7, 12.3, 12.2 | 21.3, 22.1, 23.3 |

No measurable change. I saved the scenario as `tools/crowded_wave.js`.

**Bot win rates, 200 runs per cell (before -> after):**

| bot | ch1 | ch2 | ch3 | ch4 | ch5 |
|---|---|---|---|---|---|
| merge | 59 -> 53 | 61 -> 55 | 62 -> 56 | 65 -> 65 | 65 -> 61 |
| synergy | 87 -> 80 | 92 -> 87 | 84 -> 84 | 90 -> 88 | 86 -> 87 |

The random bot still loses everywhere. The falls are 0 to 7 points against a roughly 7-point noise band. I expect the bots' empty-cell thresholds firing later on a bigger board, but I didn't test that, and nothing was retuned.

## Item 15, display half: buff markers

- **Ported from the branch:** badges on buffed cats, the reach frames, drag-preview ghosts and the selection-sheet chips, taken from `d8abeca` without its simulation changes.
- **Pure function:** `BuffBoard` in `src/view/field/buffMath.ts` works out who is buffed from where the cats stand and from their level, using the same data the simulation reads. `UnitState.level` and `auraScale` were added to expose the level.
- **Aura shape is read from one place:** the new `auraCells` in `geometry.ts` is called by both the simulation and the markers, so changing that one function switches both to "the 8 cells around". `tests/view.field.buff.test.ts` (36 tests) states its expectations through `auraCells`. It also checks the markers against a real simulation at levels 1, 4, 7 and 10, covering the bell, the bard and the lucky cat.
- **Deviation from the branch:** there are two badge kinds, speed and damage, not three. On 96 px cells the right flank has room for only two, and a shielded cat already wears the dashed dome. The sheet still has a ward chip.

## Playing it (720 x 1280 and 720 x 1600, Korean and English)

I looked at these in the browser:
- the tutorial opening and the merge lesson
- all 13 mats on chapter backgrounds with 25 cats
- a boss wave, with the top block, board edges and bottom panel zoomed 3x
- merges and moves at corners and edges
- the sell strip
- the toys with wet and zap blocks
- the pick and toy popups with the peek toggle

Nothing overlaps. Stills are in the session scratchpad under `shots/`; the folder names are listed in the `field.md` section.

**Not verified:**
- Real-phone touch and 60 fps. The cats are 14 % smaller, which only a thumb can judge.
- The tutorial's sun and selling lessons live; the scripted run was too slow to reach them. The sunbeam reveal and kitten gift are covered by unit tests.
- A 1600 screen with a wave banner up.
- A bell, a bard and a lucky cat together on one board.

## Requests for the next engineer

1. To make the bell and bard auras "the 8 cells around", change `auraCells` in `geometry.ts`. The markers and sheet follow; if the simulation and view ever disagree, the agreement tests fail.
2. The 5th row adds a middle cell 285 px from the lane. No warrior reaches the lane from it, by the bots' `worksWalkway` rule (range at least distance + 40). The cells one step in are now 189 to 207 px from the lane, down from 207 to 212. The warrior role text still says "the outer ring is the best spot".
3. Bump `SIM_VERSION` together with the rules.
4. The perch now marks 16 of 25 cells (64 %) where it marked 14 of 20 (70 %). Numbers are untouched.

Other engineers' edits are also in the working tree (meta, screens, `src/app/flow.ts`, `src/game/sim/flow.ts`); I didn't touch them. I removed my temporary baseline worktree and the `node_modules` link. The "2026-10-09 batch" sections are appended to `docs/handoff/field.md`, `hud.md`, `battle.md` and `fx.md`.

Files are in `C:\MyProject\Project1`:
- `src/game/geometry.ts`
- `src/view/field/buffMath.ts`
- `src/view/field/buffMarks.ts`
- `src/view/field/unitView.ts`
- `src/view/hud/SelectionSheet.ts`
- `tests/board.geometry.test.ts`
- `tests/view.field.buff.test.ts`
- `tools/crowded_wave.js`
- `docs/handoff/field.md`


---

# structure:meta

Both items are built: the gold dungeon and the "테스트" block in settings. Two parts need someone else's files: the extra-entry ad button, and the guidebook topic. `npx tsc --noEmit` prints nothing for `src` or `tests`, and `npx vitest run` is green at 135 files / 2,994 tests (it was 130 files at the start). In the browser (Aside, port 5199) `PAGE_ERRORS` was `[]` on the runs that finished. I made no commits.

## Directive 11: gold dungeon

**The run.** Mode id `gold`, eight normal waves in two acts, no elite or boss, so no boss timer. The 15 s wave clock is the hard limit: a win takes about 126 s. The end of act 1 gives the usual act reward and a toy pick; the end of act 2 is the victory. The tier is the chapter: it uses that chapter's health multiplier and backdrop at butler level 0, with the player's own levels and no snack. The script has 399 enemies in total, splitter pieces included.

**Difficulty (measured, not tuned against).** On the 5x5 board with 12 seeds, the synergy bot wins 75 to 100% and a merge-only bot 58 to 100%. Kills run 283 to 396. A re-measure is due after the unit-rule change.

**Entries.** Two free a day, plus one more for a rewarded ad or 30 gems, at most three. Tier n opens when chapter n is cleared. The entry is taken when the run starts and saved at once. Discarding the run, killing the app or restarting never refunds it and never gives a second one. The daily reset only moves forward.

**Payout.** `round((sum(8+2w) + 0.35 x kills) x chapter multiplier x (win ? 1.25 : 1))`, plus 100 x multiplier for the first win of the day. Gold and XP only; no chest.

| Tier | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Full clear | 345 | 448 | 551 | 689 | 861 |
| Day (2 wins + bonus) | 790 | 1,026 | 1,262 | 1,578 | 1,972 |

For a chapter-3 player with a rough daily gold income of about 5,400, the tier-3 day is about 23%. With the bought entry it is about 34%. A full clear is about 73% of a chapter win for about 2 minutes. The full comparison with patrol, sweep and card-level costs is in section 13 of `docs/명세_메타.md`.

**Where it plugs in.**
- The card sits under the daily challenge on the home tab. It has a tier stepper, entries "입장 2/2", max reward, best run, a first-clear sticker, and the ad and gem buttons.
- The pre-run page, the result flow (including doubling), missions, analytics reasons, the unlock popup, a feature id `dungeon`, the save fields and backup codes are all wired up.
- The "boss and elite" missions skip dungeon runs.
- A gold run needs the pending run that started it, so a second settlement returns `nothing_to_claim`.

## Directive 14: test block

The "테스트" block is the last sheet of settings, under the version label: "골드 +10,000", "보석 +1,000", "소탕권 +5". Each goes through `profile.grantTest` (reason `test`) with the coin flight and a toast, because the balances are behind the sheet. It shows only for `PLATFORM_ID === 'dev'`, and the profile refuses the command elsewhere (`MetaDeps.testGrants`). The GitHub Pages test build is a `dev` build, so testers get it.

## Simulation edits (additive, outside my paths)
- `src/game/api.ts`: `BattleMode` gains `'gold'`.
- `src/game/sim/sim.ts`: new method `scriptOf(wave)`, which returns the gold script for gold and `scriptFor(scriptChapter, wave)` for every other mode.
  - `totalWaves` gets a `gold` arm.
  - `waveHealth`, `previewWave` and the snapshot restore call `scriptOf`.
  - The `waveKindOf` import is dropped.
- `src/game/sim/flow.ts`: `buildSpawns` and `startWave` read the script through `s.scriptOf`.
  - `endNormalWave` closes an act of the gold dungeon on the wave clock, through the existing clear delay and `completeAct`.
  - It imports `ACT_LENGTH` and drops the `waveKindOf` import.
- New file `src/game/data/goldDungeon.ts`. Geometry, units, synergy and other modes are untouched, and the existing suite stays green.

## Proof
- **Tests added:** `tests/meta.dungeon.test.ts` (38), `tests/meta.dungeon.sim.test.ts` (10), `tests/screens.shell.dungeon.test.ts` (13). They cover:
  - entries, reset, clock set back, tiers, ad and gem paths, payout and bonus;
  - restart and second-settlement refusal;
  - the test block absent on `itch`, `toss` and other non-dev ids;
  - Korean and English strings.
- **Run end to end in the browser, Korean and English, 720x1280 and 1600:**
  - Card locked, entries left, none left with ad and gems, and all used.
  - Real taps on the tier stepper and the gem entry (100 → 70 gems, "입장 1/3", pre-run opens).
  - A full run from the card to the result: +500 gold with the 160 bonus, +26 XP, "최고 기록!", then the top bar counting up with coins flying in.
  - Day rollover back to 2/2 entries.
  - A pending run given up from the "continue?" prompt, with no second payout after a reload.
  - All three test buttons.
  - The unlock popup and the pre-run page in both languages.
- **Zoom checks** at 3x of the card and the settings block (`tools/kit_zoom.sh`) show no faults. Stills are in the scratchpad under `shots/gold` and `shots/gold_zoom`.

## Could not verify
- The ad entry only works end to end with a platform row added at run time in the page; it does not work in the shipped code yet (REQUEST 1).
- The result screen's "다시 도전" with no entry left (a guard that only toasts) has no test and was not tapped in the browser.
- The continue prompt after a crash with a wave snapshot: I only saw it without one, because the debug fast-forward mutes the snapshot writes.
- Sound, haptics and real-device touch.

## Other notes
- Result screen: the first-win bonus callout is not shown (REQUEST 3).
- `public/fonts/game-kr.woff2` was regenerated by `npm run font` so the new Korean text renders. It is worth running again once the other owners are done.
- Docs: new section 13 in `docs/명세_메타.md` (now v1.1), plus "2026-10-09 batch" sections in `docs/handoff/meta.md` and `docs/handoff/shell.md`.

## REQUESTS for the next engineer
1. **Ad placement.** Without these edits the extra-entry ad button stays off and only gems work.
   - `src/platform/adPolicy.ts`: add `dungeon_entry` to `AD_PLACEMENT_IDS` and `dungeon_entry: { daily: 1, home: true }` to `AD_PLACEMENTS`.
   - `src/platform/adapters/devOverlay.ts`: add `platform.placement.dungeon_entry` in Korean and English.
   - `tests/platform.adPolicy.test.ts`: add the row to the pinned table.
2. **Guidebook topic.** Add `gold_dungeon` to `src/guide`: a topic entry (home section, coin art), `battle.dungeon` in `HomePoint` (the battle tab already answers it), a facts entry and Korean/English strings. Copy-ready text is in the REQUESTS section of `docs/handoff/meta.md`.
3. **HUD and result screen (`src/view/hud`).**
   - Show `RunReward.bonus` ("오늘 첫 클리어 +160") on a gold result.
   - Hide or soften "다시 도전" when `profile.dungeonView().entriesLeft` is 0.
   - Add a running gold readout and a coin pop per kill for "enemies drop gold". The rate is 0.35 gold per kill, times the tier multiplier.
4. **Debug route.** `src/view/field/debug.ts` `MODES` lacks `'gold'`, so `?scene=battle&mode=gold` falls back to a chapter run.
5. **Re-measure.** After the unit-rule change, re-run the dungeon bot comparison; the payout table does not depend on unit rules, only the win rate does.


---

# rules

Directives 1–10, 12, 13, 15 and 17 are implemented. `npx tsc --noEmit` prints nothing, and `npx vitest run` is green at 138 files and 3,036 tests, with the 5199 dev server's PAGE_ERRORS `[]` in every Aside run. Win rates fall noticeably, almost all of it from directive 9 (kitten not counted); I did not retune anything.

## What I did, per item (old → new)

- **1, crit wording:**
  - Every "치명타 배수" text now says crit damage, in ko and en.
  - The gunner reads "치명 확률 30%, 치명 피해 3배"; the archer reads "치명 확률 15%, 치명 피해 2배".
  - Perks and the 마따따비 toy read "치명 피해 +50%" (its arg went 0.5 → 50); the ranger synergy lines too.
- **2 and 15:** nothing added for warriors or tricksters.
- **3, bard:** damage +20% → +15%, reach is data (`aura.reach = 1`, the 8 cells around, diagonals included).
- **4, bell cat:**
  - The wet and lightning immunity is now a dodge chance: 40%, 60% from level 7, cap 85%, strongest bell only. It covers the bell and the 8 cells around it.
  - The roll happens when the hazard lands, once per cell.
  - A dodged cell stays dry and emits a `dodge` event. I added a "피했어요!" sticker in the HUD (`DodgeSticker.ts`), shown in the browser.
- **5, samurai:** damage 140 → 130, line reach 130 → 100, bleed 25% → 18% per second.
- **6, storm cat:**
  - Each enemy hit and not killed is stunned 0.4 s; elites 0.2 s, bosses immune.
  - It uses the same immunity window as freeze, so it cannot chain-stun.
- **7, starlight archer:** damage 250 → 220, interval 0.8 → 0.5 s, pierce 2 → 1 extra enemy, kill burst radius 90 for 25% (was 50%).
- **8, chef/bell swap:**
  - The line is now chef (꼬마), bell (동네), bard, alchemist, lucky; each rank keeps its old numbers (8·1.0·260 and 20·1.0·300).
  - I made one-line edit in `src/meta/units.ts` (outside my paths, but the item named card-level sources) so card rarity follows.
  - **Saved profiles need no migration:** levels and cards are keyed by cat id, so each cat keeps its own. Only the next-level price changes: the bell pays the rare table, the chef the common one.
- **9 and 10, synergy:**
  - Only ranks 2–5 count, so step 3 needs the guardian, and awakening needs step 1 (2 kinds).
  - Steps 1–2 are weaker, and class damage reaches that class only (side effects reach every cat).

  | class | steps 1 / 2 / 3 (all numbers new) | step 3 ability |
  |---|---|---|
  | warrior | dmg 12 / 30 / 65%; all cats ignore 0 / 15 / 30% armour | war cry: every 7 s, enemies in each warrior's range stunned 0.5 s and armour −30% for 3 s |
  | ranger | all cats crit +5 / 10 / 20 pts, crit damage +0 / 5 / 10%; step 3 also ranger damage +30% | sure shot: every 5th ranger attack is a crit |
  | mage | dmg 12 / 30 / 65%; all cats status duration ×1 / 1.2 / 1.4 | arcane burst: a statused enemy that falls bursts for 12% of its max HP within radius 70 |
  | trickster | unchanged | playtime: all cats attack 40% faster while the laser is on |

  The class chips, class sheet, guide and bots follow. The tutorial's third scripted summon is now `r_archer` so the synergy lesson stays teachable.
- **12, laser:** duration 5 → 6.5 s; an elite or boss inside the dot's area is targeted first. The laser card and guide read the duration from data.
- **13, boss health:** 1590 / 4064 / 14405 → 1431 / 3658 / 12965; elites unchanged.
- **17, black hole:**
  - Pull 90 → 55 px/s.
  - An enemy a hole has caught is not pulled by another hole until 4 s after that hole ends.
  - Elites ×0.35, bosses ×0.2.
- **17, freeze:**
  - Chance 8% → 12%.
  - A 3 s immunity after thaw already existed (spec §9, shared with stun); I made it 4 s. This also gives the tiger's stomp stun a 4 s window instead of 3 s.
  - Slow is unchanged.
- **SIM_VERSION** is now 3 (was 2). A version-2 snapshot and a 20-cat payload are both refused, and `BattleScene` falls back to a fresh run.

## Measured (500 runs, same seeds, before → after)

| case | before | after |
|---|---|---|
| ch1–5 stake 0, merge bot | 55/56/55/64/64 | 44/47/42/53/53 |
| ch1–5 stake 0, synergy bot | 79/83/81/86/85 | 75/82/78/82/83 |
| ch1, stakes 0–5, synergy bot | 79/69/62/51/31/18 | 75/64/44/34/17/8 |
| ch1 stake 3, class focus free/warrior/ranger/mage/trickster | 51/51/73/47/12 | 34/28/50/29/5 |
| ch1 boss kill time, % of limit, same order | 54/59/49/58/61 | 57/62/52/59/61 |

The other chapters' focus and boss-time numbers are in `docs/handoff/sim.md`.

- **Cause:** I reverted one rule at a time in copies of the tree. The kitten not counting accounts for almost all of it: with the kitten counting again the stake curve is 86/73/63/51/33/20 (+11 to +17 points).
- **Smaller effects:** the lower step numbers cost 3–5 points. The four abilities cost 0–1 point, because the bots rarely reach four kinds.
- **Boss health:** the −10% barely moves boss kill time, because the damage allowance floors a kill at about 45% of the limit and shrinks with the boss's health.

## Not verified

- A real phone.
- The tutorial's synergy lesson played live. It is covered by tests for ten seeds, which find a warrior or ranger epic in the scripted pick every time.
- The four abilities' own visuals. They show as stun stars, crit numbers and faster attacks, but the `special` events (`cry`, `shatter`) have no drawer yet.
- The bots barely use the bell's dodge or playtime, so the win-rate effect of those two is a lower bound.

## Requests for the next engineer

1. **`src/view/field`:**
   - Draw the `special` events: `cry` as a ring of its radius, `shatter` as a flash.
   - Make `buffMath.ts` read `aura.reach ?? 1`.
   - Optionally mark the bell's own cell as warded; I kept `UnitState.shielded` as "a bell next to it" so the agreement tests hold.
2. **Audio:** the loudness-ladder test (`tests/audio-combat.test.ts` `LINES`) still lists bell before chef. I left `UNIT_IDS` in its old order so that test and the sound tables stay valid. If the trickster ladder should follow the new ranks, the chef needs the quieter sound.
3. **`docs/진행상황.md` section 0:** record spec v1.4, GDD v1.3 and D-43.
4. **Patch notes:** `docs/handoff/sim.md` has the player-facing change list.

## Outside my listed paths

- `auraCells` in `geometry.ts` now returns the ring within `reach` (default 1); the field engineer's note asked for exactly this change.
- One line in `src/meta/units.ts`, the card table for the swap.
- One test case in `tests/view.field.buff.test.ts`: it merged two bells to show "no reach", which now yields a bard, so it merges two paws instead.

I also appended "2026-10-09 batch" sections to the sim, hud, guide and meta hand-offs, added spec §19 and D-43, and refreshed the GDD.

Key files: `src/game/sim/specials.ts`, `src/game/data/classes.ts`, `src/view/hud/DodgeSticker.ts`, `src/view/hud/popups/ClassSheet.ts`, `tests/sim.synergy.test.ts`, `tests/sim.skills.test.ts`, and the spec at `docs/명세_전투규칙.md`. Before/after reports and class-sheet stills are in the session scratchpad (`out/` and `shots/rules/`).


---

# verify

Release test of the whole batch is done. Defects found are fixed, and `npx tsc --noEmit` prints nothing for `src` and `tests`. `npx vitest run` is green: 138 files, 3,042 tests (3,036 at the start). `npm run font` was re-run; the Korean glyph set didn't change.

## What I played

All with real taps and drags, and `PAGE_ERRORS []` in every run.
- **Tutorial, Korean 1280:** a fresh profile from the first tap to the boss. All 19 lessons trigger, point at the right thing and complete (summons, merge drag, class sheet, pick of three, synergy, sun drag, the laser's guided use, toy choice, molt, upgrades, call wave, speed, sell, boss). The synergy lesson fires on the first step-1 class and the kitten pip stays dark. I did not tap through the result page that follows the tutorial's end dialog.
- **Tutorial, English 1600:** wave 0 to the elite, same result.
- **5×5 board:** drag merges work from every corner and from the edge middles.
- **Four-kind boards:**
  - **Abilities:** all four abilities fire. War cry and burst fired 8 and 5 times in 18 s, and about 36% of hits were crits.
  - **Bell:** the dodge rolled 2 of 9 covered cells in a forced wet block, with the "Dodged!" sticker. Aura numbers match the 8-cell reach.
  - **Awakening:** works from step 1 ("Synergy 1/1").
  - **Peek toggle:** pick of three and toy choice fold and unfold at 1280 and 1600.
- **Gold dungeon:** home card, pre-run page, a won run, result, back home with the entries and best record updated. The test-currency buttons add gold exactly (ko and en).
- **Crowded wave, 25 cats, three runs:** mean 10.9 / 10.9 / 11.3 ms, p95 19.8 / 25.1 / 25.1 ms. No change from the board engineer's numbers.

## Defects fixed

| # | Defect | Fix |
|---|---|---|
| 1 | The dungeon's extra-entry ad was dead: the meta layer asked for a placement the policy didn't know. | Added `dungeon_entry: { daily: 1, home: true }` plus its overlay strings and tests. |
| 2 | The class sheet's third row said "4종 이상" / "4+ kinds", but only four kinds can count now. | Now "4종" / "4 kinds"; unused string removed. |
| 3 | The English warrior role ran to three lines and overlapped the ladder's Merge and Awaken labels by 12–18 px. | Shortened from 99 to 77 characters. A test now holds every class role to two lines. |
| 4 | The synergy lesson text didn't say the kitten rank doesn't count. | Added in both languages, inside the two-line limit, with a test. |
| 5 | The four-kind abilities had no visual, so a war cry or burst showed only its stun or damage. | A class-coloured ring on each `special` event (`src/view/director/growth.ts`). The roar's ring is capped at 170 px, with a light haptic and a test. |
| 6 | The gold result never explained the first-clear bonus, and "다시 도전" did nothing visible when no entry was left. | A bonus line on the result ("오늘 첫 클리어 +250 골드"). The retry button is greyed and the way home pulses. One entry check is shared with the pause menu's restart, with tests. |
| 7 | No guide topic for the gold dungeon. | Added the `gold_dungeon` topic with a test. |
| 8 | `?scene=battle&mode=gold` fell back to a chapter run. | `view/field/debug.ts` now accepts `gold`. |
| 9 | A bell kitten dodges but its own sheet listed no dodge chip. | The sheet now shows the bell's own dodge chip, with a test. |
| 10 | The buff markers ignored the aura reach in the data. | They now read the same reach the simulation reads. |

## Could not verify or fix

- **Audio ladder:** the sound tables still order the trickster line bell, chef, so the chef's pan is about 3.5 dB louder than the second-rank bell. Fixing it means reordering `UNIT_IDS` and the sound tables together, and I can't hear it from here. Left as a request.
- **Not played:** a real phone, the Korean tutorial at 1600, the English tutorial at 1280, and the tutorial's result page.
- **Gold result:** the "new best" line now sits one row lower and falls under the fold on a 1280 screen; the page scrolls.
- **Lesson bubbles:** at 1280 the chip lessons' bubble (classes, synergy) covers the board's bottom rows. It is harmless today, but a cat placed there would be hidden.

The numbers in the table are old to new; the rule numbers themselves are unchanged. Hand-off sections dated 2026-10-09 are appended to `hud.md`, `guide.md`, `director.md`, `platform.md`, `meta.md`, `field.md` and `sim.md` in `docs/handoff/`. The hud section also records how to drive the game in the Aside runner.

## REQUESTS for the next engineer

1. Audio: reorder the trickster line (chef first) in `src/audio` and `UNIT_IDS` together, and have someone listen.
2. The boss bar and boss guide pages still show nothing about the armour and ward. That is the planned `codex` task.
3. Sounds for the war cry and arcane burst (the rings are in, the sounds are not).
