# Hand-off: battle simulation (sim)

Pure logic for "냥이 수비대 / Meow Guard": the deterministic battle simulation, its data tables, the balance bots and
the tests. No rendering, audio, DOM, `Math.random`, `Date` or `Math.pow` anywhere in `src/game/sim`.
Rules of record: `docs/명세_전투규칙.md` (now v1.2: §16 lists the v1.1 tuning changes, §17 the v1.2 merge rule and its measurements).

**v1.2 (2026-10-06): a merge keeps the class.** Two identical cats become the next rarity of the SAME class (`mergeResultOf`); the class roll is gone, molting is the only way to switch class lines. `SIM_VERSION` is 2.

## What exists

| Path | Content |
|---|---|
| `src/game/index.ts` | Public barrel (see below). Also registers the battle strings. |
| `src/game/sim/` | `create.ts` (`createBattle`), `sim.ts` (the `Sim` class implementing `BattleApi`), `board.ts` (summon, merge, molt, awaken, sell, upgrades, synergy and stat recompute), `enemies.ts` (spawn, walk, statuses, damage, death, auras), `combat.ts` (attacks, projectiles, zones, laser, timed relics), `boss.ts`, `hazards.ts`, `flow.ts` (waves, acts, toy offers, danger/overflow, victory, defeat, revive), `snapshot.ts`, `odds.ts`, `streams.ts`, `economy.ts`, `emitter.ts`, `types.ts`; tooling: `bots.ts` (three balance bots), `runner.ts` (headless runs and measurements). |
| `src/game/data/` | `balance.ts` (every constant, `HP_INDEX`, `ELITE_HP`, `BOSS_HP`), `units.ts`, `enemies.ts`, `relics.ts`, `classes.ts`, `waves.ts` (5 x 24 hand-written waves + endless mapping), `training.ts`, `modifiers.ts`, `stakes.ts`, `types.ts`, `stringsGame.ts` (all sentence templates, ko + en); `roster.ts` and `strings.ts` kept as they were. |
| `tests/sim*.test.ts`, `tests/simHelpers.ts`, `tests/simStats.ts` | 223 tests (unit, chi-square, 1,000-run fuzz, determinism incl. a recorded bot command list replayed, stream independence, snapshots incl. a mid-run resume, bot behaviour, every relic, every enemy trait and boss ability, performance). |
| `tests/simreport.sim.ts`, `tests/simReportKit.ts`, `vitest.sim.config.ts` | The balance report behind `npm run sim`. |
| `docs/명세_전투규칙.md` | Updated to v1.2. |

`geometry.ts` was not touched; `api.ts` only gained comments (the merge rule on `drop`, `dropAction`, the `merge` event and `molt`): no additions to the contract.

## Consumer API

```ts
import { createBattle } from '@/game/index';            // or '@/game/sim/create'
const battle = createBattle(init);                       // BattleApi
const resumed = createBattle(init, snapshot);            // BattleApi | null (null: wrong version / run / damaged)
```

Static data, all from `@/game/index` (the UI never needs the `sim/` folder):

| Need | Import |
|---|---|
| Unit / enemy / relic / class definitions | `unitDef(id)`, `enemyDef(id)`, `relicDef(id)`, `classDef(id)`, `allUnitDefs()`, `allEnemyDefs()`, `allRelicDefs()`, `allClassDefs()` (text methods `skillText()`, `descText()`, `tierText(n)`, `perks[i].text()` are built from the data values in the current language) |
| Wave scripts and previews | `chapterWaves(chapter)` (24 `WaveScript`), `scriptFor(chapter, wave)`, `waveEntries(script, countMult?)`, `waveKindOf(wave)`, `actOf(wave)` |
| Rules a HUD may show | everything in `data/balance.ts` (`ENEMY_CAP`, `OVERFLOW_GRACE`, `SUMMON_*`, `SUMMON_GRADE_COSTS`, `SUMMON_ODDS`, `PITY_*`, `CLASS_UPGRADE_COSTS`, `MOLT_*`, `AWAKEN_*`, `SELL_*`, `LASER_*`, `HP_INDEX`...), `SYNERGY`, `synergyTier(class, tier)`, `tierForDistinct(n)` |
| Difficulty and daily rules | `stakeRules(stake)`, `stakeText(n)`, `MODIFIER_IDS`, `modifierName(id)`, `modifierText(id)`, `modifierSpec(id)` |
| Training ground (for the meta game) | `TRAINING_IDS` = `start_fish, kill_fish, damage, boss_time, enemy_cap, start_purr, laser_cd`; `trainingDef(id)` (max level, `effectText(level)`, gold `cost(level)` = round(200 x 1.6^(level-1))); `trainingBonus(training)` is what the sim applies. `Loadout.training` uses these ids (the meta spec's `start_clover` is `start_purr`). |
| Class lines and merge results | `mergeResultOf(id)` (the next rarity of the same class, `null` for legendary and mythic: the cat two copies of `id` merge into), `mythicOf(id)` (what a legendary awakens into), `UNIT_GRID[classId]` (the five-step line), `unitOf(classId, rarity)`: all from `@/game/index` (`data/roster`). A HUD can show "merging makes X" before the drop; the result is exact except that the snack stick may jump one more step. |
| Save compatibility | `SIM_VERSION` (now 2). `createBattle(init, snapshot)` returns `null` for another version (a version-1 save included), and `BattleScene` already falls back with `createBattle(init, snapshot) ?? createBattle(init)`: the player starts a fresh run, nothing crashes. |
| Contract types and ids | re-exported from `./api` (`BattleApi`, `BattleEvents`, `UNIT_IDS`, `RELIC_IDS`, ...), identity tables from `data/roster` |

Tooling (not in the barrel): `playRun(init, 'random' | 'merge' | 'synergy', options)` in `@/game/sim/runner`,
`createBot(policy, seed)` in `@/game/sim/bots`.

## Behaviour the renderer / UI must know

* **Subscribe before you step.** The emitter knows who listens: no payload object is built for an event nobody subscribed to (that is how a headless run allocates nothing). `projectileEnd.projectile` and `zoneEnd.zone` objects are pooled and reused after the event: read them inside the handler.
* **Merges keep the class.** `dropAction(a, b) === 'merge'` for two identical common / rare / epic cats; `drop` removes both and puts `mergeResultOf(id)` (one step further with the snack stick, never past legendary) on `to`. `merge.result` is always the same class as `merge.consumed`. Legendary and mythic copies swap instead. Nothing else about the result is random.
* **Choices stop time.** `pending` is set and `phase === 'choice'` for the 3-pick summon (`pickSummon`) and the toy offer (`pickRelic`, `rerollRelics`); other commands return `choice_pending`. `summon()` that opens the 3-pick returns `null` and the cost is already paid. Toy offers keep their `options` array in place and remove a picked entry (`picksLeft` > 1 on the toy-box day).
* **Prep.** `phase === 'prep'` for 3 s before wave 1; the tutorial waits there until the first summon. Laser and wave timers do not run in prep.
* **Waves.** `wave` is 1-based; 0 during the first prep. Elite / boss: `waveTime` stays 0 until the boss appears (1.0 s after `waveStart`), `waveDuration` is the limit. After a boss falls: `waveEnd`, 1.2 s later `actClear` (not for the last wave: `victory` instead), `sunbeams`, `relicOffer`, and one second after the last pick the next `waveStart`.
* **Endless** has `totalWaves === 0`.
* **Removed without reward.** `nine_lives` and `revive()` chase enemies off: each gets an `enemyDie` with `fish: 0, purr: 0, killer: null` (and `rescued` / `revive` carry the count).
* **Boss damage allowance.** `boss` / elite takes at most `maxHp / (0.45 x limit)` damage per second (1.5 s burst), surplus is dropped; `hit.amount` is the clipped value.
* **Hits on dead units.** A unit merged / sold / molted away keeps flying projectiles; credit goes to `damageByUnit` but `killer` is `null`.
* **Snapshots.** `snapshot()` is taken at the top of every `startWave` (before any wave-start draw), `null` in daily mode. `createBattle(init, snapshot)` restores that state in `prep` with `wave = n - 1`, an empty field, and starts wave `n` after the usual 3 s; running both to wave `n` gives identical snapshots (only `time` differs). The snapshot carries its own `init`; the `init` argument must match seed, mode and chapter.
* **Daily mode** forces unit level 5 and no training, no snapshot, no revive, free toy reroll only.
* **RNG.** Seven streams (`summon, pick, merge, toy, sun, wave, combat`), seed = hash(seed, name). Extra draws that must not shift a stream are always taken (the 4th summon draw serves twin bells; the merge stream is drawn once per merge for the snack stick, whether or not the relic is held). The class roll of the merge is gone, which is why `SIM_VERSION` is 2. The cat tunnel draws from `toy`.
* **Pity.** `summonOdds()` is exactly the table the next roll uses (grade, daily lucky-day bonus, soft pity); a 3-pick counts toward the pity counter (see §16 of the rules).
* `RunStats.bossesKilled` counts boss waves only; `summons` counts every cat that appeared by summon, pick, twin or tunnel.

## Final tables

`HP_INDEX[1..24]` (cucumber health, x chapter multiplier x daily rule): 59, 69, 80.8, 94.5, 111, 129, 151, 177, 207, 242, 284, 332, 388, 454, 531, 622, 728, 851, 996, 1165, 1363, 1595, 1866, 2183 (x1.17 per wave; endless keeps x1.14).
`ELITE_HP` (waves 4 / 12 / 20) = 1055, 3848, 10080. `BOSS_HP` (8 / 16 / 24) = 1590, 4064, 14405 (endless: x1.14^8 per later boss).
`CHAPTER_HP_MULT` = 1.05, 1.13, 1.21, 1.44, 1.47 at recommended unit levels 1 / 2 / 3 / 4 / 6 (v1.2: about 1.05 x the v1.1 values 1.0, 1.08, 1.15, 1.37, 1.4; the rules text had said 1.2 for chapter 3 but the code was 1.15). The tutorial uses chapter 1 x 0.7, so it got 5% more health too.
Waves 1-3 of every chapter use a smaller budget (12 / 16.8 / 20.4 cucumbers instead of 24).
Economy: summon 12 + 6n (cap 80), awakening 12 purr, stakes see `data/stakes.ts` (cap 60 -> 42, act purr 2 -> 1, cost +10%, boss limit -10 s, 2 toy choices + no free reroll + elites and bosses +40%).
Units: damage of the area-heavy legendaries / mythics was lowered and the trickster commons raised (see rules §16); every number is in `data/units.ts`.

## Results (`npm run sim`, 300 runs per cell, level 1 in chapter 1, recommended levels 2 / 3 / 4 / 6 in chapters 2-5)

Win rate, random / merge / synergy bot. Targets: 20-40 / 60-75 / 85-92 (chapter 1, stake 0).

| | v1.1 (random class) | v1.2 before retune | v1.2 final |
|---|---|---|---|
| ch1 | 0 / 60 / 87 | 0 / 73 / 91 | 0 / 66 / 89 |
| ch2 | 1 / 65 / 87 | 1 / 70 / 91 | 1 / 64 / 89 |
| ch3 | 0 / 58 / 88 | 0 / 71 / 90 | 0 / 66 / 86 |
| ch4 | 0 / 64 / 89 | 0 / 74 / 91 | 0 / 70 / 90 |
| ch5 | 1 / 66 / 88 | 1 / 79 / 92 | 0 / 74 / 91 |

Synergy bot, chapter 1, stakes 0 to 5 (target 85 falling to 25):

| stake | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| v1.1 | 87 | 76 | 64 | 50 | 35 | 27 |
| v1.2 before retune | 91 | 80 | 72 | 62 | 48 | 36 |
| v1.2 final | 89 | 76 | 67 | 55 | 44 | 33 |

v1.2 final, chapter 1 stake 0: first legendary median wave 8 / first mythic 16 (synergy 92% reach it, merge 74%), danger exposure 30% (merge 53%), median surplus 1.69, boss kill at 48% of the limit, 7.5 minutes per win; the synergy bot merges about 20 times and molts 0.85 times per run (the report now prints both columns).

**What changed in the balance and why.** The deterministic ladder made planned play stronger (merge bot +13 points, synergy bot +4, stake 5 +9): a pair of epics is now a legendary of the line you chose instead of a lottery. One lever, `CHAPTER_HP_MULT` x 1.05 (normal waves and elite / boss health together), put both bots back in their bands. The stake curve now ends at 33 instead of 25: raising the elite / boss health tables by 10% for waves 12-24 only moved stake 5 from 36 to 33, because most lost runs die at the first elite (wave 4) and at the early gates; the rule values of stake 4 / 5 live in `data/stakes.ts` (outside the levers this change was allowed to use), see REQUESTS.

**Bots.** `random` and `merge` are unchanged. `synergy` was rewritten around the fixed lines: it picks a focus class (the one with the most common-equivalents on the board, switching only when another class is twice as heavy), keeps one cat of each rarity of that class (a focus pair merges only when the next rung is empty, a third copy exists or at most 3 cells are free; every other class merges freely), molts an off-class legendary into the line when it has none (with any purr: a legendary rung is worth it) and lower rungs only with purr above one awakening, awakens as soon as allowed, and picks three-pick cats that fill a rung of its line. Measured variants (chapter 1, stake 0, 300 runs): merging anything 87%, commons and rares free 88%, strict ladder 91-93%; molting to complete pairs of epics or rares 84-88% (it burns the purr the awakening needs).

**Molting economy.** Purr by the end of waves 4 / 8 / 12 / 16 / 20 / 24 is 3 / 7 / 10 / 14 / 17 / 19 at stake 0 and an awakening costs 12, so the first one opens at wave 16 with 2 purr to spare (stake 2+: act purr 1, awakening at wave 20, nothing to spare). Every molt beyond the free two delays the guardian by four waves, and the six-molt cap and the spare purr (about 7) are the same size. Bot results: never molt 92%, spare purr only 93% (0.09 molts per run), legendary rung always 91% (0.85), spend freely from the start 89% (1.5); at stakes 3 / 4 / 5 the legendary-rung policy beats never molting by 3 / 2 / 2 points. So it is neither free nor dead; the numbers (1 purr, 6 per run) are unchanged.


## Verification

* `npx vitest run tests/sim` 223 tests, about 20 s: tables and text (both languages, no unfilled placeholder), odds (sum to 1, chi-square p > 0.001 for the pure roll in every grade x pity state with 100,000 samples each, and for the battle's own summons per `epicDry` state from 100,000 summons), summon / merge (every class and rarity into `mergeResultOf`, snack stick in the same class, legendaries and mythics never merge, `no_rangers` never gets a ranger by merging) / molt / awaken / sell / upgrade rules and every `Fail` reason, synergy by distinct types, damage formula, every status rule, hazards, laser, every attack shape, every relic (plus a scan that every relic effect field is read by the simulation), every enemy trait and boss ability, waves / acts / toy offers / defeat / revive / snapshots (a round trip in the middle of a bot run keeps the board, counters and merge stream; a version-1 save is refused), the bots (`tests/sim.bots.test.ts`: they only merge inside a class, the synergy bot builds a three-kind line in at least 60% of runs by wave 9 against the merge bot's 40%, and molts only into one line), 1,000 fuzzed runs with invariants (money integer and non-negative, at most 20 units, `enemies.length === enemyCount`, no NaN, ids unique), determinism (60 scripted runs twice, plus bot runs, plus a bot's recorded command list replayed on a fresh battle: same board, money and merges), stream independence, performance.
* Performance: a full 24-wave run of the synergy bot spends 25-35 ms inside `step()` on this machine (the test asserts < 150 ms best of 6, in a file of its own so the JIT is fresh); a steady field allocates < 400 KB over 3,000 ticks (the test forces GC around the measurement).
* Type check: `npx tsc --noEmit` shows no errors (whole tree, 2026-10-06 22:20). Full suite: 1,378 of 1,379 tests pass; the one failure is `tests/screens.shell.layout.test.ts` "xp ring fraction" (not sim).
* Browser: the tutorial (`?scene=battle&mode=tutorial&runs=0&sandbox=1&seed=7`) played with taps and drags in the Aside runner: three summons (the first tap only wakes the page), the two `w_paw` merged into `w_sword` (same class), the wave-3 three-pick of epics opened (the sim was stepped to get there, the background tab throttles real time) and picking the recommended `w_viking` raised the warrior synergy to tier 1; PAGE_ERRORS empty.

## Known gaps

* The random bot cannot reach its target (0%: it never merges, so the merge rule does not touch it).
* Danger exposure of the synergy bot is 30% of runs (target 40%) and its median surplus is 1.69 (target 1.2-1.6): tightening normal waves further costs more win rate than the tail gives back.
* (2026-10-07: the stake curve now ends at 26% for stake 5 in the standard 300-run report; see the polish section at the end.)
* Unit perks (levels 4 / 7 / 10) are generic stat bonuses (range, damage, speed, crit, area, targets, duration, effect, reach, aura) rather than bespoke abilities; mythic units have their own three.
* Bots are simple scripts, not optimisers; every target above is for these bots. The synergy bot never molts to complete a pair (tested, worse) and keeps its focus class by a fixed rule; a human can plan better.
* The HUD does not show the merge result yet (see REQUESTS).
* `weaken` from the dryer picks the highest `stats.damage` cat that is not already weakened (rules only say "highest damage").

## REQUESTS

* HUD / field (next engineer, `src/view/hud`, `src/view/field`): show what a merge makes, using `mergeResultOf(unit.id)`: the result cat (name, class colour) while dragging onto a twin and in the selected-cat sheet ("merge with another one: Sword Cat"); a "next rung" line in the class chip / class sheet (which of the five rungs the board has and what two copies of the lowest missing one would make); the molt picker could show the resulting cat of each class instead of only the class; `hud.tut.merge` could say that the result stays in its line. I changed none of these.
* No HUD or screen text stated or depended on the random class, so nothing outside `src/game` and the sim tests was edited in the tree; the docs changed are listed in the final report.
* `data/stakes.ts` (balance owner): the stake 4 / 5 rule values (boss time -10 s, elites and bosses +40%) are the lever for the last 8 points of the stake curve (33% at stake 5, target 25%); not changed here.
* `docs/진행상황.md` still lists `명세_전투규칙.md` and `기획서_GDD.md` as v1.0 (now v1.2 and v1.1); not my file.
* Dev server: a `[platform] boot failed ... wireLifecycle is not defined` console warning appeared in PAGE_ERRORS once while another engineer was editing `src/platform` (not part of this change). The Vite transform of `board.ts` also went stale once after two simultaneous edits (`touch` fixed it): if the browser shows a `ReferenceError` from a freshly edited file, touch it.

## 2026-10-07 polish: the top stakes

One value changed: `STAKE_STEPS.bossTimeCut` 10 -> 13 (`src/game/data/stakes.ts`). Stake 4 and 5 share it (stakes are cumulative), so it moved both ends of the curve at once; the other lever, `specialHpMult` (stake 5), stayed at 1.4. The rule sentence is generated from the data (`stakeText(4)` = "보스·정예 제한 시간 −13초" / "Boss and elite time limit -13 s", checked in `tests/sim.data.test.ts`); the elite limit at stake 4+ is now 27 / 32 / 37 s and the boss limit 37 / 42 / 47 s. Expectations that moved: `tests/sim.data.test.ts` (10 -> 13), `tests/sim.flow.test.ts` (boss limit 40 -> 37), `docs/명세_전투규칙.md` §13, §17.1.

Synergy bot, chapter 1, level 1, `npm run sim` (`SIM_ONLY=stakes SIM_RUNS=300`, the same seeds as before):

| stake | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| before (300 runs) | 89 | 76 | 67 | 55 | 44 | 33 |
| after (300 runs) | 89 | 76 | 67 | 55 | 37 | 26 |
| before (1,500 runs) | - | - | - | - | 42.7 | 28.1 |
| after (1,500 runs) | - | - | - | - | 36.5 | 23.5 |

Stakes 0-3 are bit-identical (their rules did not change). The first 300 seeds run about 5 points easier at stake 5 than the 1,500-run sample (standard error 2.7 points at 300), so the value was chosen to land in the band at both sizes. Sweep behind it (600 runs, synergy bot, stake 4 / stake 5, specialHpMult 1.4): cut 10 = 42.5 / 30.2, 12 = 39.8 / 28.2, 14 = 35.8 / 25.5, 16 = 32.3 / 21.0. Raising `specialHpMult` instead (1.5 / 1.6 / 1.8 at cut 10 gave 27.5 / 25.0 / 20.3 at stake 5) fixes stake 5 but leaves stake 4 at 42 %, so the boss-time lever alone was the smallest change that fits both bands. Cut 13 against 14 at 1,500 runs: 36.5 / 23.5 against 34.8 / 22.7; 13 keeps stake 4 in the middle of its 35-40 band.

Known gap closed: "the stake curve ends at 33 % (target 25 %)". REQUESTS: `docs/기획서_GDD.md` line 316 and `docs/설계_결정_기록.md` D-17 still say "−10초" (not my files).
