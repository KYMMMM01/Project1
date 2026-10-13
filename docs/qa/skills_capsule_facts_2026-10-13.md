# Lucky cat capsule: measured facts (2026-10-13)

Bot measurements taken for the redesign of the capsule's prizes (`docs/design_skills_v2.md` section 3.12). Measured by a workflow agent with a temporary test file that was deleted afterwards; the report is kept as it was returned.

All eight points were measured, except the daily and gold items in point 8, which I read from the code and did not play. The temporary file `tests/tmp_capsule_facts.sim.ts` is deleted and `git status --short` is empty. Nothing else in the repo was touched, and no browser, server or sound was started.

**Method.** The synergy bot ran the same loop as `playRun` (decision every 0.25 s, bot seed = seed + 7), one process at a time. Seeds are 10007 + 7919·i, the report's seeds.
- Chapters 1, 3 and 5 at stake 0, levels 1 / 3 / 6, 120 games each (360 pooled). The three chapters agree within noise, so tables are pooled.
- Endless to wave 80 or defeat: chapter 5 level 6 (60 games, "e5") and chapter 3 level 3 (40 games, "e3").
- Three paired batches of 120 on chapter 3, same seeds as the base batch: +2 purr at wave 18, a laser "recharge now" every 34 s from wave 13, and a common toy dropped into wave 18.
- Raw lines and the full report are in `C:\Users\dbals\AppData\Local\Temp\claude\C--MyProject-Project1\97b977cf-ee88-4410-a4ca-92da6c50675d\scratchpad\facts2\`.

Chapter win rates were 90% (ch1), 88% (ch3) and 97% (ch5). In e5, 17 of 60 games reached wave 81 alive, 36 ended by boss timeout and 7 by overrun, with a median end wave of 73.5. In e3, 15 of 40 survived.

## 1. The lucky cat (t_lucky = the awakened trickster legendary)

I count only awakenings at least 3 s before the run ends. At the moment the final boss dies, purr often crosses 10 and the bot awakens inside the 1.2 s clearing window. Those awakenings are cosmetic, and 8 of the 54 raw lucky games were of that kind.

| | chapters (360 games) | e5 (60) | e3 (40) |
|---|---|---|---|
| games with a t_lucky | 46 (12.8%); ch1 12%, ch3 12%, ch5 15% | 41 (68%) | 25 (63%) |
| first wave q1/med/q3 | 12 / 12 / 16 (wave 12: 31, wave 16: 12, other: 3) | 24 / 40 / 52 | 28 / 48 / 56 |
| run seconds left after it, q1/med/q3 | 174 / 230 / 252 | 452 / 715 / 1087 | 523 / 643 / 946 |
| 34 s capsules (floor of left/34) | mean 5.9, median 6; counts 2:1, 4:9, 5:3, 6:13, 7:20 | mean 21.4 | mean 20.2 |
| capsules per game, all games | 0.75 | 14.6 | 12.7 |
| 2 or more t_lucky at once | 5 of 360 games (1.4%); 1% of lucky-cat time | 43% of games; 38% of lucky-cat time | 40% of games; 29% of lucky-cat time |

The lucky cat is rare in chapters because the bot awakens only about once per run, in whichever class is its focus. Lucky was the first guardian in 45 of the 54 raw lucky games.

Stand-in, the first guardian of any class:
- It appears in 94% of chapter games, at wave 12 (207 games), wave 16 (117) or waves 13–15 (16).
- 162 / 221 / 236 s of run remain after it (q1 / median / q3), which is mean 5.5 capsules per such game.
- In endless, 97% of games get one, at wave 12 / 12 / 16, with about 1,245 s left.
- Endless games make 7.9 awakenings on average (e5).

## 2. Board at the start of each wave (pooled chapters; e5 for endless)

| wave | empty tiles mean (q1/med/q3) | cats c/r/e/leg/guard | no identical partner c/r/e | unmerged pairs (boards with ≥1) | legendaries | guardians |
|---|---|---|---|---|---|---|
| 12 | 16.3 (15/16/17) | 2.6/2.6/2.4/1.1/0 | 2.2/2.0/2.3 | 0.6 (52%) | 1.06 | 0 |
| 16 | 15.3 (14/15/16) | 2.5/2.6/2.7/1.3/0.6 | 2.1/2.0/2.3 | 0.7 (53%) | 1.33 | 0.65 |
| 18 | 14.2 (13/14/15) | 2.7/2.7/2.7/1.7/1.0 | 2.0/2.1/2.4 | 0.8 (56%) | 1.72 | 1.00 |
| 20 | 13.7 (13/14/15) | 2.5/2.8/2.7/2.2/1.0 | 1.9/2.2/2.3 | 0.8 (62%) | 2.22 | 1.00 |
| 24 | 11.7 (11/12/13) | 3.1/2.9/2.8/3.5/1.0 | 2.1/2.0/2.0 | 1.4 (83%) | 3.49 | 1.03 |
| e5 40 | 4.7 (4/5/6), 2% full | 2.1/2.1/2.4/10.9/2.8 | 1.9/1.9/2.0 | 0.4 (26%) | 10.9 | 2.8 |
| e5 60 | 0.0, 100% full | 2.5/2.6/2.3/12.0/5.6 | 2.5/2.6/2.3 | 0 | 12.0 | 5.6 |
| e5 80 | 0.0, 100% full | 2.4/2.9/2.7/7.8/9.3 | 2.4/2.9/2.7 | 0 | 7.8 | 9.3 |

- **Chapter board size.** A chapter board holds 9–13 cats, with at most 19 empty tiles; the minimum seen was 6 at wave 24. Sampled every 0.25 s, 0% of wave time in chapters has 4 or fewer empty tiles.
- **Endless board fill.** Mean empty tiles over wave time are 7.0 in waves 25–40, 0.6 in waves 41–60 (80% of the time fully full) and 0.0 in waves 61–80.
- **Partners.** Orphans (cats with no identical partner) exist at every rank on 92–98% of boards.
- **Synergy steps.** Share of boards at step 0/1/2/3 per class:

| wave | warrior | ranger | mage | trickster | focus class at step 3 |
|---|---|---|---|---|---|
| 12 | 60/31/9/0 | 54/32/14/0 | 57/30/13/0 | 66/25/8/0 | 0% |
| 16 | 52/26/21/1 | 43/33/24/0 | 41/37/21/1 | 62/24/13/2 | 4% |
| 20 | 39/30/12/19 | 37/32/9/21 | 31/40/11/17 | 54/27/9/10 | 68% |
| 24 | 30/34/12/24 | 25/39/10/26 | 31/37/11/22 | 42/38/9/12 | 84% |

  In e5 at waves 40 / 60 / 80, step 3 is on for the trickster in 9% / 23% / 29% of boards (mage 12 / 21 / 46%, ranger 21 / 38 / 54%).
- **In-place promotion options at the wave start.** Mean cats per board whose promotion lowers no step, common/rare/epic: 2.6/1.7/2.0 at wave 12, 2.5/1.5/2.3 at wave 16, 3.1/1.7/1.7 at wave 24. At least one safe rare promotion exists on 74–78% of boards from wave 16 on; epic is 94% at wave 16 and 78% at wave 24. A common-to-rare promotion raises a step on 48–64% of boards; rare and epic promotions never do at the wave start.

## 3. Fish

| wave | summon price (share at 80) | fish on hand mean (q1/med/q3) | paid summons so far | summon grade 0 |
|---|---|---|---|---|
| 12 | 80.0 (100%) | 64 (43/66/85) | 16.7 | 100% |
| 16 | 79.1 (94%) | 70 (50/73/88) | 21.1 | 99% |
| 20 | 78.6 (91%) | 75 (56/74/96) | 27.0 | 99% |
| 24 | 78.6 (90%) | 84 (64/86/105) | 33.3 | 99% |
| e5 40 / 60 / 80 | 77.6 / 69.3 / 65.0 | 111 / 3,041 / 9,375 | 70 / 86 / 84 | 96% / 0% (grade 2) / 0% (grade 2) |

The price is at the cap or within 15 of it (100% at 65 or more). Cardboard box (×0.9) and sardine crate (cap −15) account for the rest.

Fish income per second, waves 13–24 (pooled; 345 games, 230 s each):

| source | fish/s | share |
|---|---|---|
| kills | 2.88 | 46% |
| wave rewards | 1.81 | 29% |
| stage (act) rewards | 0.55 | 9% |
| base income | 0.78 | 12% |
| toys (feeder, sardine crate) | 0.19 | 3% |
| chef | 0.10 | 2% |
| total | 6.32 | |

Chapter totals are 5.87 (ch1), 6.32 (ch3) and 6.74 (ch5). Base income is 0.50/s in ch1 and ch3 and 1.31/s in ch5 because of the treat cells. Wave reward and stage reward are identical across chapters.

What the fish is spent on in waves 13–24:
- Summons take 5.83 fish/s, which is 1,344 fish per game, about 17 summons. They are 92% of income, and the bot sells nothing.
- Class upgrades take 0.51 fish/s (117 fish per game).
- Summon grade is essentially never bought. The bot's rule asks for grade cost + 2× price on hand, and fish on hand is about 0.9 of one price.

Still to buy at the start of wave 16:
- The top class is at level 0/1/2/3 in 3% / 36% / 59% / 2% of games.
- Maxing the top class costs 778 fish, about 10 summons.
- Maxing all four classes costs 3,477 fish.
- Summon grade 2 costs 149 and grade 5 costs 699.

Endless, waves 25–80:
- Income is 11.8 fish/s; spending is about 4.4 fish/s.
- A full board blocks summoning, so the rest piles up, as the 3,041 and 9,375 above show.
- The top class is at max level from wave 60.

## 4. Purr

| wave start | purr mean (q1/med/q3) | holding an awakenable legendary, purr under 10 | purr 8–9 and holding one |
|---|---|---|---|
| 12 | 6.2 (4/7/7) | 79% | 0% |
| 16 | 2.5 (0/0/7) | 72% | 0% |
| 18 | 2.1 (1/1/4); distribution 1:61%, 3:11%, 4:27%, 6:2% | 96% | 0% |
| 20 | 2.1 | 99% | 0% |
| 24 | 5.3 (4/4/7) | 100% | 13% |

- **Purr per run (pooled).** Earned 19.0: stage rewards 10.0 and elites/bosses 9.0, with no sale income. Spent: awakening 11.2 and molts 2.15. Purr left at the end is 5.6 (5.8 in won runs, 6/6/8).
- **Awakenings in won runs.** 81% make one and 19% make two. Counting only awakenings at least 3 s before the end, 3% make two, so the second one is almost always the cosmetic last-second one.
- **First awakening.** It lands at wave 12 (207 of 340 games) or wave 16 (117).
- **Purr toys.** `purr_pillow` is held in 9% / 23% of games at waves 16 / 24, and `lucky_coin` in 4% / 12%.
- **Waiting on purr.** In waves 13–24 the bot holds an awakenable legendary (class at step 1 or more) for 89% of wave time and is short of purr for all of it. 96% of games wait; the median wait is 214 s of 230 s.
- **Legendary versus awakening.** Awakenable legendaries per board are 0.9 at wave 16, 1.3 at wave 18, 1.65 at wave 20 and 2.6 at wave 24. The first legendary sits on the board a median of 114 s (76–150) before the first awakening.
- **Endless purr.** e5 earns 85.6 purr (stage 51.5, elites/bosses 34.1) and spends 79.0 on awakenings. Purr on hand stays 4.5–5.4 at waves 40–80, and the bot waits on purr 100% of the time with 7–11 legendaries on the board.

**What +2 purr at wave 18 changes** (paired, same 120 seeds on chapter 3):

| | base | +2 purr |
|---|---|---|
| win rate | 88% | 90% (2 games differ, noise) |
| first awakening earlier | | 0 games |
| games with a 2nd awakening ≥3 s before the end | 3% | 14% |
| games with an extra awakening at all | | 32 |
| of those 32, within about 1 s of the final win | | 31 |

At wave 18 no board has purr 8–9, so +2 cannot unlock anything at once. It moves the second awakening only to the wave-20 clear in 17 of 120 games.

## 5. Laser (waves 13–24, 345 games)

| share of wave time | on | cooling | ready and wanted | ready and idle |
|---|---|---|---|---|
| | 22% | 46% | 0% | 32% |

- "Wanted" is the bot's own rule: a boss or elite present, or 14 or more enemies.
- The bot fires at the next 0.25 s decision, so ready-and-wanted is 0%. Ready-and-idle means the field did not meet the rule.
- Mean cooldown left is 3.37 s over all time and 7.34 s while cooling.
- Cooling while wanted is 30% of the time, with 7.58 s left on average.
- There are 7.3 activations per 230 s, a cycle of about 31 s against the 21.5 s minimum.

Simulated "recharge ends now" every 34 s from wave 13, on chapter 3:
- It hit a cooling laser in 45% of drops and saved 3.45 s per drop on average (7.7 s per hit).
- Laser-on share went from 21.5% to 24.7%, and activations per game from 6.7 to 7.6.
- Wins went from 106 to 107 of 120 (3 discordant pairs, noise).

With a t_lucky on the board, trickster step 3 is on for 62% of lucky-cat time in chapters (41% e5, 37% e3). The laser is also on in 17% of that time (10% in endless). The +40% party speed needs the laser on.

## 6. Toys

| wave start | toys held | by toy rank c/r/e/l | commons unowned |
|---|---|---|---|
| 12 / 16 / 18 / 20 / 24 | 2 / 3 / 4 / 4 / 5 | at 16: 0.9/1.1/1.0/0.0; at 24: 0.9/1.5/2.0/0.7 | 7.1 of 8 at 16 and at 24 (min 6) |
| e5 40 / 60 / 80 | 9 / 14 / 19 | 1.0/1.5/3.3/3.2 (at 40); 1.0/1.5/6.0/5.5 (at 60) | 7.0 / 7.0 / 6.3 |

- 69% of games own one common and 19% own two. The bot's score favours `silvervine` (held in 49% / 65% of games at waves 16 / 24) and `glass_marble` (39% / 50%).
- Unowned toys at the other ranks are 8 minus the owned counts above (6 for legendary).
- **Worth of a common toy** (`docs/명세_전투규칙.md` section 13, as the first toy at wave 5, 600 games, standard error 0.4–0.9):
  - The 8 commons score +4.1 yarn, +4.3 glitter, +4.1 mouse, +4.6 box, +5.2 collar, +5.8 rod, +3.0 scratcher and +4.8 wand, mean +4.5 points.
  - Handed at wave 13 they are worth 0–2 points (yarn +1.4, mouse +1.6, rod +2.4).
  - Differences of about 1 point are noise.
- **My check.** The best common (`fishing_rod`) handed in 5 s into wave 18 gave 106 to 107 wins of 120, with 1 discordant pair.

## 7. What one summon yields late

| waves 13–24 (pooled) | cats | mix c/r/e/l | CE per summon |
|---|---|---|---|
| button | 4,982 | 67/26/7/0 | 1.47 |
| 3-pick (every 6th paid summon) | 931 | 0/83/17/0 | 2.35 |
| paid overall, incl. twin bells (held by 28% late) | | | 1.60 (1.67 with twins) |
| table at grade 0 / 1 / 2 | | | 1.40 / 1.54 / 1.69 |

The bot sits at grade 0, so the button never yields a legendary (0% in 4,982 summons).

At price S = 80 and 1.60–1.67 CE per summon, one CE costs about 48–50 fish. A rare costs about 96–100 fish, an epic about 190–200 and a legendary about 385–400. Sale values are 40 / 80 / 160 fish, plus 1 purr for epic and legendary, so buying costs about 2.4× what selling returns. In e5 (25–80) the figure is 43 fish per CE.

## 8. Code facts

- **Placing a cat on a chosen tile.**
  - `placeUnit(s, id, cell, source)` in `src/game/sim/board.ts` is private. Its callers are `cmdSummon`, `cmdPickSummon`, `placeRandomCommon` (the exported tunnel helper, takes two random numbers for class and tile) and `placeGift` (exported, first empty tile).
  - `nthEmpty` and `emptyCellCount` are also private.
  - `SummonSource` is `'button' | 'choice' | 'relic' | 'twin' | 'script'` (`api.ts`), and the view only tosses a sticker for button, script and choice (`view/toss.ts`).
  - Class draws must use `s.allowedClasses`, because the daily `no_rangers` day removes rangers.
- **Merge result.**
  - It is produced in `cmdDrop` (`board.ts`, merge branch): `mergeResultOf` (`roster.ts`), `makeUnit(..., 0.5)`, both inputs marked `removed`, `s.merges++`, then `refresh`.
  - `rng.merge` is always drawn (snack stick jump).
  - It emits `merge{consumed:[a,b],...}`, and `UnitViews.onMerge` (`view/field/units.ts`) expects both consumed cats.
  - There is no promote-in-place function. The nearest patterns are `cmdMolt` (event `molt`) and `cmdAwaken` (event `awaken`, `mythicOf`), both of which replace in place with a new uid and gauge 0.5.
- **Synergy steps.**
  - `updateSynergy` (`board.ts`, private, called by `refresh`) counts distinct ids per class at rank ≥ `SYNERGY_MIN_RANK` (1) and maps them with `tierForDistinct` (`data/classes.ts`, thresholds 2/3/4).
  - Public state is `s.distinct`, `s.tier`, `s.special`, plus `classOwned(s, class)` for ranks present.
  - "Promotion lowers no step" is O(25) with no side effects: distinct − (rank ≥ 1 and the cat's id is unique) + (next id absent), then compare `tierForDistinct` with the current tier. I computed it this way in the script, but I did not cross-check it by actually promoting and calling `refresh`.
- **`gainRelic` mid-wave** (`flow.ts`).
  - It is callable at any time and ran 108 times, 5 s into wave 18, with no error.
  - On-gain effects: `sardine_crate` (+100 fish via `addFish`, reason `relic`), `auto_feeder` and `shooting_star` (start their timers), `batteries` (`refreshLaser`), `sunny_spot` (adds 3 cells from `rng.sun` and emits `sunbeams`). Everything else goes through `refresh`.
  - Read only at wave start: `tunnel` (wave number divisible by 3) and `hourglass` bossTime / spawnSlow (`waveLimit`, `buildSpawns`), so a mid-wave hourglass does not extend the current boss timer.
  - Between-stage assumptions: `cmdPickRelic` forces `stage = 'between'` and starts the next wave 1 s later, and the runner hands out toys only when `sim.stage === 'between'`.
  - `rollRelicOffer` excludes owned toys and draws from `rng.toy`.
  - UI: `relicGain` triggers `TopBar.addToy` (waits for an icon flight from the choice card), the `director/growth.ts` caption and sound, codex `markMet`, and a Tutorial bump.
- **Laser state.**
  - `LaserState` (`api.ts`) has `active, x, y, timeLeft, duration, cooldown, cooldownTotal, radius, lockUid`.
  - `endLaser` sets `cooldown = cooldownTotal`, `updateLaser` decrements it only while inactive, and `cmdSetLaser` refuses when inactive with `cooldown > 0`.
  - Setting `sim.laser.cooldown = 0` while inactive is safe: I did it 307 times in 120 games. The UI polls `cooldown <= 0` every frame (`ActionRow`, `field/laser.ts`, `LaserGuide`) and there is no ready event. While active, cooldown is already 0.
- **Saved run** (`snapshot.ts`, `SIM_VERSION` 3).
  - It is captured at `startWave` only and stores:
    - the init;
    - wave, time, fish, fishFrac and purr;
    - unit ids per cell, relics, class levels, summon grade, paidSummons and epicDry;
    - molts, revived, rescueUsed, rerolls and the tutorial flags;
    - sun cells;
    - all 7 rng states;
    - stats: kills, bossesKilled, summoned, merges, awakenings, wavesCleared, peak, bestRarity, damageByUnit, luck.
  - Not stored: the laser, pending choices, the field, unit gauges (restored at 0.5), `chefFish`, `feederAt` / `starAt` (reset from time), and any per-run counter you add.
  - `parseSnapshot` demands 7 rng states and 25 units, so a new rng stream would break old saves. A run restores into prep, then `startWave`.
- **Pending choice.**
  - `phase = 'choice'`: `Sim.step()` returns at once, so the wave clock, boss limit, laser and gauges all freeze. Board commands, `callNextWave` and `setLaser` return `choice_pending`.
  - The 3-pick opens mid-wave from `cmdSummon` through `openSummonOffer`, which keeps `resumePhase`.
  - The toy pick opens only from `completeAct`.
  - `PendingChoice` has two kinds, summon and relic.
- **Gold dungeon.**
  - It has 8 waves; the coin bounty is 3 fish, and the chest (`boss_treasure`) pays 60 fish and 2 purr.
  - It has one toy offer, after wave 4, with the act reward of 30 fish and 2 purr. Wave 8 ends the run.
  - Total purr is therefore about 4, so no guardian or lucky cat is possible.
  - The gold payout is `dungeonGold(waves, kills, chest) × tier`, so kills matter.
  - Snacks are locked, the callBonus is off on wave 4, and the chapter's special cell applies.
- **Daily challenge.**
  - It has 16 waves, one rule picked from all 10, a chapter from {1, 2, 3}, all unit levels 5 and no training. There is no snapshot and no revive; the paid reroll is already spent and the single free reroll stays.
  - It has 3 toy offers (waves 4, 8, 12) and about 12 purr at most, so exactly one awakening is possible at wave 12.
  - `rich` doubles only `earnFish` income (kills, wave, act, call, base), not `addFish` (sales, toys, feeder).
  - `lucky_day` makes the summon price 1.5×. `toy_box` gives 2 picks per offer. `no_rangers` bans rangers. `long_laser` fixes the cooldown at 6 s, `sunny_day` gives 10 special cells and `rush` makes normal waves 11 s.

## Not measured

- **Prize win rates.** I did not simulate the prizes (cats, fish, promotion, toy) at a 34 s cadence for win rate. Only the laser recharge and one common toy were simulated, and both landed below the noise of 120 pairs (about 2–3 points).
- **Lucky-cat timing.** The lucky cat's real gauge and timing do not exist in code, so capsule counts are 34 s arithmetic.
- **Players.** Only the synergy bot was played, never humans. It stays at summon grade 0, never sells above commons, and is stuck at its single guardian because of purr.
- **Endless scope.** Endless covers chapter 5 level 6 and chapter 3 level 3 only, at stake 0.
- **Common toy late.** A common toy's worth after wave 13 is cited from the doc plus my one-toy check, not re-measured.
- **Gold and daily.** Neither was played.
- **Untested paths.** The promote-in-place check was not run against a real promotion. Save and restore paths and the mid-wave toy UI flight were not exercised.

## What these numbers say about prizes

- **Lucky cat reach.** The lucky cat exists in about 13% of chapter games, usually from wave 12 with about 230 s (6 capsules) left. In endless it exists in about 65% of games, with 20 or more capsules.
- **Cats on empty tiles.** Chapter boards are half empty all game (the minimum was 6 empties), so a cat-on-a-tile prize is always deliverable. In endless it becomes undeliverable from about wave 45.
- **Fish in chapters.** Fish is spent as it arrives (about 0.9 of a price on hand). Income is 6.3 fish/s, or about 215 fish per 34 s, so a 0.5 S prize (40 fish) is under 20% of one interval's income.
- **Fish in endless.** Fish is worthless in late endless (3,041 unspent at wave 60, 9,375 at wave 80, board full).
- **Purr.** It is the binding resource. A run earns 19, a guardian costs 10, and the bot waits on it for 89% of waves 13–24 while holding 1.3 to 3.5 awakenable legendaries. Any purr prize is large against that scale, and +2 at wave 18 changes nothing before wave 20.
- **Summon value.** A rare is worth about 100 fish, an epic about 200 and a legendary about 400 at S = 80, against sale values of 40 / 80 / 160.
- **Promotion availability.** About 6 of the 9–13 cats on a board have no identical partner, which is a ready target for a duplicate-or-promote prize. A safe promotion exists on 100% of boards (any rank), and an awakenable legendary on 96% or more of boards from wave 18.
- **Laser recharge.** The laser recharge is worth about 3.5 s per drop, roughly +0.1 activation, and no win-rate change was detectable.
- **Toys.** An unowned toy lowest-rank-first is always a common (7.1 of 8 unowned), which is worth about 1–2 points at wave 13 and less later.
