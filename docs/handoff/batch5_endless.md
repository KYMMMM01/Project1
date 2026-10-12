# Hand-off: batch 5, endless mode (key: endless)

Date 2026-10-12, base commit `27301a1`. Owner's words and the decisions: `docs/qa/directive_2026-10-12_batch5.md`, item 4. Nothing is committed, pushed or deployed. Area: the name "끝없는 모드" -> "무한 모드" and the growth of enemy health past wave 24 (`ENDLESS_GROWTH` 1.14 -> 1.07). Nothing else about the mode was touched (`ENDLESS_TIERS` 40 / 60 / 80 stays; the bots, the elites, the time limits stay).

## What changed, file by file

| file | change |
|---|---|
| `src/game/data/balance.ts` | `ENDLESS_GROWTH = 1.07` (was 1.14), with a comment that says what it drives and why it changed. Only that line and its comment. |
| `src/guide/stringsKo.ts`, `stringsEn.ts` | topic `endless`: Korean title, and the full text now says the growth starts after wave {after}. |
| `src/guide/facts.ts` | `endless` facts gain `after: CHAPTER_WAVES`. `growth` already read `ENDLESS_GROWTH`, so it prints 7 now. |
| `src/screens/shell/strings.ts` | `shell.pre.mode.endless` (the tag on the pre-run picture) ko only. |
| `src/screens/battle/strings.ts` | `battle.endless.title` (the card on the battle tab, and the title of the reward sheet) ko only. |
| `docs/명세_전투규칙.md` | the mode table (line 33) and the boss-health bullet (line 254): the rate, and that the limits stay. |
| `docs/명세_메타.md` | one sub-bullet under the endless line of "주간 컵 · 무한 단계": the change, the new tier reach, and that old records come from the old curve. |
| `tests/endless.test.ts` (new) | see Tests. |
| `tests/sim.skills.test.ts` | one expectation: `12965 * 1.14 ** 8` -> `12965 * 1.07 ** 8`. |
| `tests/simreport.sim.ts`, `tests/simEndlessKit.ts` (new) | the report section `SIM_ONLY=endless` (below). |

`Math.pow` is still not used in the game: `hpIndex` and `specialHp` multiply in a loop, as the header of `balance.ts` asks.

## New and changed strings (exact)

| key | ko old -> new | en |
|---|---|---|
| `shell.pre.mode.endless` | 끝없는 모드 -> **무한 모드** | `Endless Mode` (unchanged) |
| `battle.endless.title` | 끝없는 모드 -> **무한 모드** | `Endless Mode` (unchanged) |
| `guide.endless.title` | 끝없는 모드 -> **무한 모드** | `Endless mode` (unchanged) |
| `guide.endless.full` | `{chapter}챕터를 깨면 열려요. 웨이브가 끝없이 이어지고 적은 웨이브마다 {growth}%씩 단단해져요.` + `\n{w1}, {w2}, {w3}웨이브에 닿으면 보상을 받아요.` -> `{chapter}챕터를 깨면 열려요. 웨이브가 끝없이 이어지고, {after}웨이브를 넘으면 적이 웨이브마다 {growth}%씩 단단해져요.` + the same second line | old: `It opens after you clear chapter {chapter}. The waves never end and enemies get {growth}% tougher every wave.` -> new: `It opens after you clear chapter {chapter}. The waves never end, and past wave {after} enemies get {growth}% tougher every wave.` |

Why `{after}`: the old sentence said "every wave" but the 14% (now 7%) applies only from wave 25; waves 1 to 24 come from the table (about 17% a wave). With 7% printed and no "from wave 24 on", the page would have understated the early climb. The number 24 comes from `CHAPTER_WAVES`.

Already "무한 모드" before this batch (so the three strings above were the only inconsistent ones): `meta.feature.endless` (unlock texts), `rt.mis.endless.title`, `rt.mis.endless.play` (missions tab), the codex line "골드 던전, 일일 도전, 무한 모드는 따로 배수가 있어요". Left as they are on purpose: `rt.sys.feat.endless` "끝없이 밀려오는 적을 막아요.", `shell.pre.endless.rules` "끝없이 밀려와요. 얼마나 버티는지 겨뤄 보세요.", `guide.endless.teach` "끝이 없는 웨이브를 얼마나 버티는지 겨뤄요." and the first sentence of the full text: they use 끝없다 as an adverb or adjective that describes the waves, not as the name. They read fine next to "무한 모드". The font needed no new glyph (`tests/core.font.test.ts` passes); the landing engineer should still run `npm run font` after the batch.

Outside my area, still saying "끝없는 모드" or the old rate (for the landing engineer, lines checked 2026-10-12): `docs/기획서_GDD.md` 157, 308 (also "체력 지수 ×1.14"), 502, 506; older `docs/handoff/*.md` and `docs/qa/*` are history. `docs/handoff/sim.md` 65 to 66 also quotes "endless keeps x1.14" (history).

## What the constant drives (read from the code)

* `hpIndex(wave)` (`balance.ts`): for wave <= 24 the table `HP_INDEX`; past it `HP_INDEX[24] x ENDLESS_GROWTH^(wave-24)`, by repeated multiplication. It is the base health of every ordinary enemy (`Sim.baseHp()` x chapter multiplier x daily rule), of `Sim.waveHealth()` (the report and the wave preview's budget), and of the shooting-star toy's damage (`starHp x hpIndex(wave)` in `combat.ts`: that toy keeps its share of a wave's health at any depth, so it follows the new rate). The codex reads it for waves up to 24 only.
* `specialHp(kind, ordinal)`: ordinals 0 to 2 (waves 4 / 12 / 20 for elites, 8 / 16 / 24 for bosses) come from `ELITE_HP` = 1055 / 3848 / 10080 and `BOSS_HP` = 1431 / 3658 / 12965 (untouched). Ordinal 3 and later (elites at 28, 36, 44 ...; bosses at 32, 40, 48 ...) = the last table value x `ENDLESS_GROWTH^8` per ordinal past the third, because two elites or two bosses are 8 waves apart. So an elite or a boss now grows x1.72 per step (was x2.85), and from the 4th on has the same share of the wave's health as before: both grow by the constant. Chapter multiplier and butler-level 5 rule multiply on top as before.
* `specialLimit(kind, ordinal)` does NOT use the constant: elite 40 / 45 / 50 s and boss 50 / 55 / 60 s, then the last value for ever (elite 50 s, boss 60 s). Together with the damage cap (`BOSS_MIN_KILL`: at most `maxHp / (0.45 x limit)` damage a second) this is the clock the elites and bosses run on past wave 24. See "Was health the only wall?".
* Spawn counts do not use the constant and do not grow: past wave 24 `scriptFor` repeats acts 3 to 6, a normal wave holds 24 cucumbers' worth of enemies whatever their health (`waveEntries`), so a wave 90 has the enemies of wave 9 to 24, with more health each. (`tests/sim.data.test.ts` already pins the repetition.)

Health as a multiple of wave 24 (an ordinary enemy; the elite or boss of the same wave keeps the same multiple from its 4th on), before (x1.14) -> after (x1.07):

| wave | 30 | 40 | 50 | 60 | 80 | 100 |
|---|---|---|---|---|---|---|
| ordinary enemy | 2.19 -> 1.50 | 8.14 -> 2.95 | 30.2 -> 5.81 | 111.8 -> 11.4 | 1,537 -> 44.2 | 21,124 -> 171 |
| the boss of wave 32 / 40 / 48 / 56 / 80 / 96 (x its wave-24 value) | 2.85 -> 1.72 | 8.14 -> 2.95 | 23.2 -> 5.07 | 66.2 -> 8.72 | 1,537 -> 44.2 | 12,507 -> 130.5 |

Wave 50 after the change has the health that wave 37.4 had before; wave 100 the health of wave 63. The old wave 40 health is met at wave 55, the old wave 50 health at wave 74, the old wave 60 health at wave 94. (Hence the owner's "x5.8 at wave 50, like today's wave 37".)

## Measurements

Section `endless` of the balance report: `SIM_ONLY=endless SIM_RUNS=300 SIM_ENDLESS_CASES=2:2,2:3,5:6,5:10 npx vitest run --config vitest.sim.config.ts tests/simreport.sim.ts` (header of `tests/simreport.sim.ts`; `SIM_ENDLESS_BOTS`, `SIM_ENDLESS_MAXWAVE` = 120, `SIM_ENDLESS_REACH`, `SIM_ENDLESS_DUMP=<file>` for one JSON line a run). It plays endless mode (stake 0, `loadoutInit(seed, chapter, 0, level, 'endless')`, the report's usual 10,007 + 7,919 i seeds, all toys in the pool, no training) for the merge and the synergy bot with `playEndless` in `tests/simEndlessKit.ts`, which makes the same decisions as `playRun` (checked: same wave, same time and same loss on six runs) and keeps what `playRun` does not: the second each wave began, the field and the board's firepower wave by wave, the wave kind the run ended on. A run counts the waves it cleared (what the weekly tiers count). Cases are chapter:level: 2:2 and 2:3 = the mode just opened (chapter 2 cleared, recommended level 2, a little more), 5:6 = the last chapter at its recommended level, 5:10 = the last chapter with every cat at the top level (a strong late state). 300 runs per row. The mode plays the highest cleared chapter by default, so late players meet chapter 5's multiplier (x1.64) unless they pick a lower one.

All numbers below were measured on the base commit with only the constant changed (a clean copy made with `git archive 27301a1`, so the other engineers' unfinished work in the shared tree could not move them); the same runs on the shared tree at 09:22 gave identical numbers for the cases checked. Raw output kept outside the repo: `scratchpad/batch5/endless/before.txt` and `after.txt` (the tables), `final/dump_*.jsonl` (per run).

### Waves cleared, before -> after (median / top 10% / best; of the runs that got through wave 24: median)

| case | bot | median | top 10% | best | median of those that cleared 24 |
|---|---|---|---|---|---|
| ch2 L2 | merge | 35 -> 52 | 43 -> 83 | 51 -> 83 | 35 -> 67 |
| ch2 L2 | synergy | 43 -> **83** | 51 -> 83 | 59 -> 99 | 43 -> 83 |
| ch2 L3 | merge | 35 -> 67 | 47 -> 83 | 51 -> 83 | 35 -> 67 |
| ch2 L3 | synergy | 47 -> **83** | 51 -> 85 | 62 -> 99 | 51 -> 83 |
| ch5 L6 | merge | 35 -> 67 | 47 -> 83 | 51 -> 95 | 35 -> 71 |
| ch5 L6 | synergy | 43 -> **71** | 51 -> 83 | 55 -> 95 | 43 -> 71 |
| ch5 L10 | merge | 51 -> 83 | 51 -> 94 | 59 -> 99 | 51 -> 83 |
| ch5 L10 | synergy | 51 -> **83** | 55 -> 95 | 67 -> 111 | 51 -> 83 |

The merge bot dies before wave 24 in 37% / 29% of the runs at chapter 2 level 2 / 3, 31% at chapter 5 level 6 and 7% at level 10 (the elite of wave 4 alone ends 4 to 21% of its runs): that is the chapter, not the mode, and identical before and after. Wave 24 is cleared by 63 / 71 / 69 / 93% (merge) and 92 / 96 / 95 / 100% (synergy).

The distribution is a staircase: a run ends on an elite or boss wave, so the "waves cleared" values pile up at 35 / 43 / 51 / 59 before, and at 67 / 75 / 83 / 91 after (an elite is wave 8k + 4, so cleared = 8k + 3). Median and top 10% jump from step to step; do not read a 2-wave difference between rows as a difference in strength.

### How often a weekly reward wave is reached (share of all runs, before -> after)

| case | bot | 40 | 60 | 80 | (50) | (70) | (90) | (100) |
|---|---|---|---|---|---|---|---|---|
| ch2 L2 | merge | 12 -> 53% | 0 -> 50% | 0 -> 13% | 8 -> 53% | 0 -> 14% | 0 -> 0% | 0 -> 0% |
| ch2 L2 | synergy | 52 -> 89% | 0 -> 88% | 0 -> 53% | 38 -> 89% | 0 -> 60% | 0 -> 3% | 0 -> 0% |
| ch2 L3 | merge | 16 -> 61% | 0 -> 60% | 0 -> 18% | 10 -> 61% | 0 -> 20% | 0 -> 0% | 0 -> 0% |
| ch2 L3 | synergy | 61 -> 95% | 0 -> 93% | 0 -> 70% | 48 -> 95% | 0 -> 74% | 0 -> 7% | 0 -> 0% |
| ch5 L6 | merge | 17 -> 66% | 0 -> 62% | 0 -> 13% | 3 -> 66% | 0 -> 37% | 0 -> 0% | 0 -> 0% |
| ch5 L6 | synergy | 53 -> 95% | 0 -> 93% | 0 -> 28% | 19 -> 95% | 0 -> 61% | 0 -> 4% | 0 -> 0% |
| ch5 L10 | merge | 75 -> 93% | 0 -> 93% | 0 -> 67% | 55 -> 93% | 0 -> 80% | 0 -> 18% | 0 -> 0% |
| ch5 L10 | synergy | 96 -> 100% | 0 -> 100% | 0 -> 79% | 75 -> 100% | 0 -> 89% | 0 -> 25% | 0 -> 1% |

Before, wave 60 and 80 were out of reach for every board measured (not one run in 2,400). After, wave 40 and wave 60 are reached by nearly everything that clears chapter length (the 60 tier is within 5 points of the 40 tier), wave 80 by 28 to 79% of the synergy bot's runs and 13 to 67% of the merge bot's, wave 100 almost never. A person plays worse than the synergy bot (it never misplaces a cat and calls waves at the best moment) and better than the merge bot, so the real reach sits between the two rows of a case. The tier ladder 40 / 60 / 80 now rewards the first two steps for little effort: see the open questions.

### How long a run takes (minutes of play at 1x; at 2x half, at 3x a third; the bots' choices take no time, a person's do)

| case | bot | begin wave 50 (runs that got there) | begin the wave after the median | whole run, median |
|---|---|---|---|---|
| ch2 L2 | synergy | 15.4 -> **15.1** min (113 -> 268 runs) | 13.1 -> **26.6** | 14.3 -> 26.4 |
| ch2 L3 | synergy | 15.4 -> 15.0 (145 -> 285) | 14.4 -> 26.4 | 15.7 -> 27.2 |
| ch5 L6 | synergy | 15.8 -> 15.3 (58 -> 284) | 13.4 -> 22.8 | 14.4 -> 24.8 |
| ch5 L10 | synergy | 15.4 -> 15.0 (225 -> 300) | 15.9 -> 26.7 | 16.9 -> 28.4 |
| ch2 L2 | merge | 16.4 -> 15.4 (23 -> 159) | 11.1 -> 16.4 | 11.8 -> 17.8 |

A wave takes about 18 s on average between waves 25 and 60 (19 to 21 s before) whatever the curve; the synergy bot calls the next wave early when the field is empty. So wave 50 is 15 minutes away at 1x (7.5 at 2x) before and after: the curve changes who gets there, not how long it takes. The new median (wave 83 for three of four synergy cases, 71 at chapter 5 level 6) is a 23 to 27 minute run at 1x, 12 to 14 at 2x; the best runs (waves 95 to 111) 33 to 38 minutes at 1x. It is not a 40-minute mode, but a median run is now about 3.5 chapters long (the synergy bot begins wave 25, the end of a chapter, after 7.4 minutes at 1x), and a person who plays on to the staircase's end spends half an hour. I did not check what leaving a run does for the weekly record (the pause menu's "quit" path); that decides whether the length is a burden.

### Was health the only wall? What ends a run past wave 40

Short answer: health, but not the health of the ordinary waves first. The clock the elites and bosses run on is the first wall, and it does not grow with the constant.

1. **Elite / boss time limits (the wall: 83 to 98% of the lost runs).** Of the synergy bot's lost runs that cleared 24 or more waves (cases ch2 L2 / ch2 L3 / ch5 L6 / ch5 L10), a timeout on the elite or boss ended 94 / 94 / 97 / 98% before the change and 83 / 85 / 90 / 90% after it; the rest were overruns (below). For the merge bot it is 96 to 98% before and 87 to 98% after. The limits stay at 50 s (elite) and 60 s (boss) for ever (`specialLimit`), and an elite or boss can take at most `maxHp / (0.45 x limit)` a second, so the kill takes at least 45% of the limit at any strength. Until the wall the boards sit at that minimum: the median time used is 43 to 59% of the limit at every elite and boss wave up to wave 64 after the change (up to wave 32 before), then 54 to 73%, then one is not killed. At the elite of wave 84 (chapter 2, x1.3) a single target has 995,000 health in 50 s: 19,900 damage a second. Before the change the same number was reached at wave 52 (17,400 a second), which is where the old runs ended (35 / 43 / 51 waves cleared). So both curves end where an elite needs about 17,000 to 20,000 damage a second on one target; the constant only decides at which wave that happens (52 before, 84 after for chapter 2; the level-10 chapter-5 boards, x1.64, mostly die at 84 too, and a quarter of them get past wave 90). The boards do keep growing after wave 24 (median nominal firepower of the synergy bot at chapter 2 level 2: 5,600 at wave 24, 14,000 at 38, 29,000 at 54, 47,000 at 78, 77,000 at 86 for the few that get there), but the elites outgrow them in the end. Elites end more runs than bosses: 221 of 227 timeouts at chapter 2 level 2, 154 against 104 at chapter 5 level 6 (the elite has the shorter clock).
2. **The enemy cap filling (the second wall: 9 to 16% of all synergy runs after the change, 2 to 5% before).** The cap of 60 is the end of every run that does not time out, but only after the board's surplus (nominal firepower / the wave's health over 15 s) has fallen to about 0.2 to 0.3: median surplus on normal waves before 1.28 / 0.85 / 0.61 / 0.30 at waves 22 / 30 / 38 / 46 (synergy, chapter 2 level 2); after 1.28 / 1.24 / 1.22 / 1.02 / 0.86 / 0.55 / 0.40 / 0.26 at waves 22 / 30 / 38 / 46 / 54 / 62 / 70 / 78. The median peak of enemies on the field stays at 12 to 18 on the normal waves 30 to 62 after the change (the cap is 60) and the runs that overrun end at 64 to 67. This is health again (kills cannot keep up because each enemy takes longer to die), not a second rule; the cap only decides the order: with x1.14 the elite at wave 36 to 52 ended the run before the field filled (overrun 1 to 5%), with x1.07 the field also fills in 10 to 17% of the synergy bot's lost runs (median end wave 79 to 91, almost all on normal waves).
3. **Spawn counts do not grow** (see above): a normal wave holds the same enemies from wave 9 on; only their health changes. Nothing to fix there.
4. **The ceiling of the board.** Nothing in the game raises a board's single-target damage without limit: 25 cells, four ranks, class upgrades and the toys that exist. The walls are where the constant meets that ceiling; a flatter constant moves them, it cannot remove them (no run reached wave 120: the best was 111, so the report's ceiling never mattered).

If the owner wants high waves to be approachable and not just later, the levers that exist are not in my area: the elite and boss time limits (flat past wave 24), the elite and boss growth (they use the same constant, as asked), the tier waves. I changed none of them.

The merge bot's overall rows understate what the mode does, because about a third of its runs end before wave 24 for chapter reasons: read its last column instead (the median of the runs that cleared 24: 35 -> 67 / 35 -> 67 / 35 -> 71 / 51 -> 83). The synergy bot's rows are the cleaner read of the mode.

## Tests

Run on the shared tree: `tests/endless.test.ts tests/guide.text.test.ts tests/sim.data.test.ts tests/sim.skills.test.ts tests/sim.flow.test.ts tests/core.font.test.ts tests/codex.foes.test.ts tests/sim.relics.test.ts` = 205 passed. The whole suite once at 11:00 (166 files / 3,559 tests): 3,558 passed and one timeout, `tests/sim.bots.test.ts` "keeps the purr of one awakening" (33 s against the 30 s limit while the machine was busy; alone it passes in 2.6 s, 5 of 5). The five new name and curve tests fail on the base commit's code (checked in the clean copy), which is what they are for. `npx tsc --noEmit -p .` printed errors only in files of the other areas (new enemy ids `coin` / `boss_treasure` and the dungeon's exports, at the time of the check); none in my files.

* New `tests/endless.test.ts` (7 tests): the mode-name keys (`meta.feature.endless`, `rt.mis.endless.title`, `battle.endless.title`, `shell.pre.mode.endless`, topic title) are exactly "무한 모드" in Korean and `Endless mode`/`Endless Mode` in English; no string of any table the game registers (the list of `tests/core.font.test.ts`) contains "끝없는 모드"; the guide page quotes the growth percent, 24 and the three tier waves from the data in both languages without a hole; `ENDLESS_GROWTH` is 1.07; `hpIndex(50)/hpIndex(24)` is 1.07^26 and between 5.7 and 5.9; each later elite and boss is `1.07^8` times the one before for ordinals 3 to 11; the 5th elite and boss are the last table value x 1.07^16 (wave 36 / 40); a boss of wave 56 and a cucumber of wave 56 grew by the same factor since wave 24; `specialLimit` stays at the last value; waves 1 to 24 and the first three elites and bosses are unchanged (`HP_INDEX[24]` = 2183, 1431 / 3658 / 12965, 1055 / 3848 / 10080).
* Changed expectation: `tests/sim.skills.test.ts` "the bosses (v1.4)", `specialHp('boss', 3)` equals `12965 * 1.14 ** 8` -> `12965 * 1.07 ** 8`. Why the new value is right: the fourth boss is the third table value times the endless growth for the eight waves between two bosses, and the growth is now 1.07; the test still pins the table (1431 / 3658 / 12965) in the lines above it. Not loosened: the tolerance is the same 6 digits.
* `tests/sim.data.test.ts` ("grows every wave and continues past 24 by the endless factor") quotes the constant symbolically and passes as it is; `tests/endless.test.ts` is what pins the value.
* The report section is a `.sim.ts` file (never fails): `npm run sim` does not run it unless `SIM_ONLY=endless`.

## What I saw on a real screen

Headless Edge, Korean and English, 450 x 900 and 360 x 800. Most of it on a dev server started from a clean copy of the base commit plus exactly my changes, because for a long stretch the shared tree could not be served (another engineer's unfinished dungeon exports kept the app from loading: `window.__dbg` never appeared). At the end, once `tsc` was clean, I looked again on the shared tree at 450 x 900 in Korean: the battle-tab card ("무한 모드" under the dungeon card, which already showed "입장 1/1" and "보물상자 +1,140"), the pre-run screen and the guidebook page, all as described below. Shots in `scratchpad/batch5/endless/shots`, `shots_b`, `shots_tree`.

* Battle tab, the card: "무한 모드" at both widths, buttons "도전" and "주간 상 받기" in place, nothing cut off. English "Endless Mode".
* Pre-run screen: the tag on the picture reads "무한 모드 · 챕터 5" (en "Endless Mode · Chapter 5"); the rule line is the unchanged "끝없이 밀려와요. 얼마나 버티는지 겨뤄 보세요."
* Guidebook page: title "무한 모드", full text "2챕터를 깨면 열려요. 웨이브가 끝없이 이어지고, 24웨이브를 넘으면 적이 웨이브마다 7%씩 단단해져요." and "40, 60, 80웨이브에 닿으면 보상을 받아요." (en: "It opens after you clear chapter 2. The waves never end, and past wave 24 enemies get 7% tougher every wave." / "Reaching wave 40, 60 and 80 pays rewards."), 450 and 360 wide.
* First-encounter card of the mode's rules (laid on the wave label by the debug probe, because in a real run it queues behind the summon-grade card and did not come up within about 8 s after I answered that one): title "무한 모드" and the teach line, with "알겠어요" and "설명서에서 더 보기", 450 and 360 wide.
* In a run at wave 30 the wave label reads "스테이지 8 · 30번째" with the field counter "0 / 60", no mode name.
* The missions tab was not looked at (not mine; its strings were already "무한 모드").

## What I could not verify

* 360 x 800 and English on the shared tree with the other areas merged (only 450 x 900 Korean was looked at there; the other sizes on the clean copy).
* The first-encounter card appearing by itself at the start of a real endless run (it is requested by `watchEncounters`; in my run it queued behind the summon-grade card and I stopped after four answers).
* The real-player pace and reach: the bots are not people (no training, no ads, no daily snack, every toy in the pool, the report's unit levels all equal).
* That a result screen of an endless run shows the right wave after the change: not touched, unchanged code.
* Whether older saves with a weekly best from the old curve need anything: nothing was changed in the save; see the questions.

## Open questions for the owner

1. **The tier ladder 40 / 60 / 80 is now cheap at the bottom.** After the change a synergy board that clears the chapter reaches 40 and 60 in 88 to 100% of the runs and 80 in 28 to 79%; wave 100 in about 0 to 1%. Before, 60 and 80 were unreachable for the same bots. If the weekly gold chest should stay a goal, a ladder such as 60 / 80 / 100 (reach 88 to 100% / 28 to 79% / 0 to 1% for the synergy bot) or 50 / 70 / 90 (89 to 100% / 60 to 89% / 3 to 25%) would be a measured alternative; `ENDLESS_TIERS` is in `src/meta/data/schedule.ts` and the three numbers also print in the guide and the card by themselves. I changed nothing (the directive keeps the waves).
2. **Is a median run of about 26 minutes at 1x (13 at 2x) what is meant by "approachable"?** The curve makes wave 50 reachable, not shorter. If the target is a 10 to 15 minute session, the number to move is the tier (see 1) or the wave at which a run may be left with its record; I did not look at the quit path.
3. **Elites and bosses are now the only hard stop for good boards, on a clock that does not grow.** Moving the wall further out is possible with a longer elite and boss limit past wave 24 (`BOSS_LIMITS` / `ELITE_LIMITS`, `specialLimit`), but that changes more than the constant. Do you want it?
4. **The old records.** The best wave and the weekly best that players already hold come from the old curve (an old 45 is a better run than a new 45). Nothing is migrated; claimed tiers stay claimed. OK?
5. The three words "끝없이 / 끝이 없는" in the description lines were kept (they describe the waves). Say so if you want them "무한히" for sound.
6. The first-time guide card and the page now say "24웨이브를 넘으면 ... 7%씩". Fine to keep the "24" visible?
