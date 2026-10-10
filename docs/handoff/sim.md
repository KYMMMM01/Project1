# Hand-off: battle simulation (sim)

Pure logic for "냥이 수비대 / Meow Guard": the deterministic battle simulation, its data tables, the balance bots and
the tests. No rendering, audio, DOM, `Math.random`, `Date` or `Math.pow` anywhere in `src/game/sim`.
Rules of record: `docs/명세_전투규칙.md` (now v1.3: §16 lists the v1.1 tuning changes, §17 the v1.2 merge rule and its measurements, §18 the v1.3 warrior line).

**v1.2 (2026-10-06): a merge keeps the class.** Two identical cats become the next rarity of the SAME class (`mergeResultOf`); the class roll is gone, molting is the only way to switch class lines. `SIM_VERSION` is 2.

## What exists

| Path | Content |
|---|---|
| `src/game/index.ts` | Public barrel (see below). Also registers the battle strings. |
| `src/game/sim/` | `create.ts` (`createBattle`), `sim.ts` (the `Sim` class implementing `BattleApi`), `board.ts` (summon, merge, molt, awaken, sell, upgrades, synergy and stat recompute), `enemies.ts` (spawn, walk, statuses, damage, death, auras), `combat.ts` (attacks, projectiles, zones, laser, timed relics), `boss.ts`, `hazards.ts`, `flow.ts` (waves, acts, toy offers, danger/overflow, victory, defeat, revive), `snapshot.ts`, `odds.ts`, `streams.ts`, `economy.ts`, `emitter.ts`, `types.ts`; tooling: `bots.ts` (three balance bots), `runner.ts` (headless runs and measurements). |
| `src/game/data/` | `balance.ts` (every constant, `HP_INDEX`, `ELITE_HP`, `BOSS_HP`), `units.ts`, `enemies.ts`, `relics.ts`, `classes.ts`, `waves.ts` (5 x 24 hand-written waves + endless mapping), `training.ts`, `modifiers.ts`, `stakes.ts`, `types.ts`, `stringsGame.ts` (all sentence templates, ko + en); `roster.ts` and `strings.ts` kept as they were. |
| `tests/sim*.test.ts`, `tests/simHelpers.ts`, `tests/simStats.ts` | 243 tests (unit, chi-square, 1,000-run fuzz, determinism incl. a recorded bot command list replayed, stream independence, snapshots incl. a mid-run resume, bot behaviour, every relic, every enemy trait and boss ability, performance). |
| `tests/simreport.sim.ts`, `tests/simReportKit.ts`, `vitest.sim.config.ts` | The balance report behind `npm run sim`. |
| `docs/명세_전투규칙.md` | Updated to v1.3. |

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
`CHAPTER_HP_MULT` = 1.05, 1.13, 1.21, 1.44, 1.47 at recommended unit levels 1 / 2 / 3 / 4 / 6 (v1.2: about 1.05 x the v1.1 values 1.0, 1.08, 1.15, 1.37, 1.4; the rules text had said 1.2 for chapter 3 but the code was 1.15). The tutorial uses chapter 1 x 0.7, so it got 5% more health too. (v1.3, 2026-10-09: 1.18 / 1.30 / 1.40 / 1.62 / 1.64, see the last section.)
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

## 2026-10-07 owner feedback: the tutorial script

Mode `tutorial` (the first eight waves of chapter 1 at 0.7 health, 12 s waves) is the lesson plan's stage: each system has to enter the game at the moment it is taught. Every other mode is unchanged (a test checks sunbeams from the first frame and no top-up or kittens in chapter, daily and endless).

- `src/game/sim/tutorial.ts` (new): `TUTORIAL_SCRIPT` (the three free summons, moved here from `sim.ts`), `tutorialWaveStart(s, wave)`, constants `TUTORIAL_PICK_WAVE` 3, `TUTORIAL_FISH_WAVE` 5 and `TUTORIAL_FISH_FLOOR` (grade step + class step + 30 fish), `TUTORIAL_GIFT_WAVE` 6, `TUTORIAL_GIFT_FREE` 2, `TUTORIAL_GIFT_MAX` 8.
- The tutorial board starts without sunbeams (`markSun(this, [])` in the constructor); `Sim.pickSummon` lights `FIRST_SUN_CELLS` and announces them (`revealSun`, exported from `flow.ts`) when the scripted pick-of-three is answered, so the director's sparkle and the sun lesson start together.
- Wave 5 start: fish are topped up to the floor so the grade and the class upgrade can each be bought once. Wave 6 start: random common kittens (`placeRandomCommon`, the toy stream) tip onto the board until two cells are free, at most eight: the board is crowded for the selling lesson and holds twins to merge.
- The wave-4 elite pays purr (existing rule), the act clear two more, so molt is possible after the first toy choice. The wave-8 boss is the chapter-one vacuum boss.
- Tests: `tests/sim.tutorial.test.ts` (sunbeams only after the pick, other modes untouched, the fish floor, the kitten box, purr after the elite, and a merge and a synergy bot each winning at least five of six seeds); `tests/sim.fuzz.test.ts` allows the empty board until wave 3.

## 2026-10-09 balance: the warrior line (rules v1.3, spec section 18)

Tester feedback relayed by the owner: "mages are too strong, warriors are weak; make warrior attacks reach farther, hit wider and harder."

**Report tooling** (`npm run sim`; every section also runs alone with `SIM_ONLY=...`):

| Section | Prints |
|---|---|
| `units` | per class and per unit, synergy bot, chapters 1-5 at their recommended level: damage share (all runs and winning runs), board minutes, kills, uptime (share of board time with an enemy on the field in which an enemy stands inside the cat's reach, sampled every 0.25 s), hits per attack (a zone's ticks count), and damage per common-equivalent minute (kdmg/CE-min: merges keep the class and a summon costs the same whatever the class, so 1 / 2 / 4 / 8 / 16 CE per rarity is the fish value and this is damage per fish) |
| `reach` | static: the share of the walkway a cat reaches from its best cell, the 14 edge cells (mean) and the 6 inner cells (mean) |
| `control` | one pinned class at a time: the share of enemy field time slowed / frozen / stunned / armour-broken and the px dragged back by black holes per minute |
| `focus` | win rate of the synergy bot free versus pinned to warrior / ranger / mage / trickster (`createBot('synergy', seed, focus)`, `RunOptions.focus`): chapters 1-5 (`SIM_CHAPTERS`, stake `SIM_CHAPTER_STAKE`, default 0) and chapter 1 at the stakes in `SIM_STAKES` |

`RunOptions.tally` switches on the per-unit and control tallies (`RunResult.units`, `RunResult.control`; it subscribes to `enemyDie`, `attack`, `hit`, `pull`, so leave it off for timing runs). Tested in `tests/sim.warriors.test.ts`.

**What the numbers said** (v1.2, synergy bot, chapter 1, level 1, 300 runs):

| Class | damage share | uptime | hits / attack | kdmg / CE-min | win rate pinned, stakes 0 / 3 / 5 |
|---|---|---|---|---|---|
| warrior | 21% | 38% | 1.6 | 1.27 | 88 / 44 / 8 |
| ranger | 39% | 91% | 1.0 | 2.21 | 98 / 80 / 55 |
| mage | 30% | 54% | 5.2 | 1.76 | 93 / 67 / 16 |
| trickster | 10% | 57% | 0.9 | 0.63 | 69 / 19 / 3 |

At equal investment a warrior did 0.72 of a mage (0.71-0.76 in chapters 2-5); the gap sat in the lower three rarities (viking 0.60 against storm 1.49 per CE-minute). Why: warriors reached 16-26% of the walkway against 34-49% for mages, only from the 14 edge cells (the inner block is 210 px from the walkway, every warrior but the tiger had range 190 or less), one hit per swing against 5.2, and no mage control effect was the cause: removing freeze, the black hole's pull, narrowing the zones or the chain each moved the pinned mage at stake 3 by 0 to 4 points (67%, noise +-3), while mage damage x0.85 cost 18 points and the blizzard's duration 3 -> 2 s cost 22. Armour is symmetric (roomba 0.35 armour against tangerine 0.35 ward, same count per chapter), so the warriors' armour shred and ignore only mattered on the few armoured waves.

**Changes** (all in `src/game/data`; every skill sentence is generated from the data, and `tests/sim.data.test.ts` now checks that every number in a skill text exists in the unit's data):

| | v1.2 | v1.3 |
|---|---|---|
| w_paw damage / range | 6.5 / 165 | 7.5 / 200 |
| w_sword damage / range / cleave | 14 / 175 / r70 x3 | 16 / 215 / r85 x4 |
| w_viking | single, 130, range 180, armour break 30% 3 s | cleave r75 x2 (`AttackSpec` cleave gained an optional `effect`), 135, range 235, armour break 50% 4 s on everything hit; level-7 perk effect +10 points -> targets +1 |
| w_samurai damage / range / line reach | 120 / 190 / 110 | 140 / 255 / 130 |
| w_tiger damage / range / blast radius | 200 / 220 / 110 | 220 / 285 / 120 (stomp unchanged) |
| `CHAPTER_HP_MULT` | 1.05 / 1.13 / 1.21 / 1.44 / 1.47 | 1.18 / 1.30 / 1.40 / 1.62 / 1.64 |
| warrior class line (`class.warrior.role`), viking skill text | "up close ... outer ring" | "higher ranks reach farther; the outer ring is still the best" |

Mages, rangers and tricksters were not touched; the warrior package alone closed the per-investment gap (kdmg/CE-min warrior 1.90, mage 1.81, ranger 2.33, trickster 0.62) and the health multipliers it needs (x1.11-1.16, to keep the bot bands) pulled the pinned mage down by 2-10 points on their own. The levers for the warriors, measured on the pinned warrior at stake 3 (200 runs): range alone 43 -> 61, with the wider hits 72, with +30% damage 80, so range was sized first, damage last.

**Results** (500 runs; merge / synergy at stake 0, v1.2 -> v1.3): chapter 1 65 / 87 -> 66 / 89, chapter 2 66 / 89 -> 65 / 91, chapter 3 65 / 85 -> 66 / 88, chapter 4 70 / 89 -> 71 / 90, chapter 5 74 / 89 -> 74 / 90; synergy bot chapter 1 stakes 0-5: 87 / 76 / 66 / 54 / 37 / 27 -> 89 / 80 / 71 / 58 / 39 / 26. Pinned win rates (300 runs, v1.2 -> v1.3), chapter 1 at stakes 0 / 3 / 5: warrior 88 / 44 / 8 -> 94 / 66 / 21, ranger 98 / 80 / 55 -> 97 / 77 / 51, mage 93 / 67 / 16 -> 89 / 61 / 13, trickster 69 / 19 / 3 -> 66 / 22 / 4; stake 3 in chapters 2-5, warrior - mage: -35 / -26 / -29 / -18 -> -2 / -3 / -2 / +6. The full tables are in the spec (section 18) and the decision log (D-42). The ranger line stays 3-19 points above the warrior and mage lines in the pinned runs (as it was); that is outside this request.

**Bots.** `warriorsToTheEdge` became `warriorsToTheWalkway`: a warrior stands in a cell where its range reaches at least 40 px past the walkway (`worksWalkway(range, cell)`, exported for tests): the whole outer ring for every warrior, the inner block for the samurai and the tiger. With the v1.2 ranges that is exactly the old "edge cells only" rule. `swapIntoSun` uses the same test.

`SIM_VERSION` stays 2: a snapshot holds the board's unit ids, money and stream states, never unit numbers, so a saved wave resumes with the new numbers (the v1.1 unit retune did not bump it either).

**REQUESTS** (not edited here):

* `src/view/field/weaponMarks.ts`: the swing marks follow the data except where they clamp: `SLASH_MAX` 92 (the tiger's r120 and r110 both draw 92, the sword's r85 now draws 81, was 67) and `LINE_MAX` 120 (the samurai's reach 130 draws 120 although it cuts 260 px of path, as before). Raise both clamps if the mark should show the new area. The viking now sends a `strike` like the sword (radius 75); its swing style is `chop`, so it draws no extra mark and each hit target still gets its star.
* `docs/진행상황.md` section 0 still describes the balance task as in progress; the line for the finished change can be: spec v1.3, GDD v1.2, D-42.


## 2026-10-09 batch: rules v1.4 (spec section 19, decision D-43)

The owner's batch of 17 directives (`docs/qa/directive_2026-10-09_batch.md`), rules half: directives 1 to 10, 12, 13, 15 and 17. The board is 5 x 5 and the gold dungeon exists (other engineers' sections); this builds on both. `SIM_VERSION` is **3** (see "Saves"). Nothing was retuned beyond the items: where a number below says "chosen", the brief left it to me.

### What changed (old -> new)

| # | Directive | What I did |
|---|---|---|
| 1 | "crit multiplier" wording | Every player text says crit damage: gunner "crit chance 30%, crit damage 3x" (`unit.r_gunner.skill`, both numbers from data), archer "crit chance 15%, crit damage 2x", perk `perk.critMult` "Crit damage +50%" (the key is a percent key now), toy `relic.silvervine.desc` "+50%" (its arg went 0.5 -> 50), ranger synergy lines. English says "crit damage". Additive bonuses read as percent of damage (+0.5 on a 2x multiplier = "+50%"), absolute values as "Nx". The cats tab's stat row is crit chance only and says "Crit"; nothing there said "multiplier". |
| 2, 15 | No warrior buff, no trickster buff | Nothing added. The tricksters' numbers changed only through 3, 4 and 8 (the synergy step numbers of the tricksters did not change either). |
| 3 | Bard | `aura.neighbourDamage` 0.20 -> **0.15**, reach 1 cell = the 8 cells around (diagonals too). |
| 4 | Bell kitten | The wet / zap immunity is a **dodge chance**: 40% (60% from level 7, through the existing level-7 aura perk; cap 85%, the strongest bell counts, no stacking). It covers the bell itself and the 8 cells around. Hazards now pick covered cells like any other; the roll happens when the hazard lands (0.8 s after the warning), once per cell, on the combat stream. A dodged cell stays dry and `dodge` fires (`{ unit, hazard }`); the HUD shows a "Dodged!" sticker (`DodgeSticker.ts`, string `hud.dodge`). A cat moved onto an active hazard cell later is blocked as before. Speed aura still +8%. |
| 5 | Samurai | **Base damage 140 -> 130**, **line reach 130 -> 100** (px of path around the target), **bleed 25% -> 18%** of its damage per second (still 3 s). Interval, range 255 and perks untouched. |
| 6 | Storm cat | Every enemy a bolt reaches and does not kill is **stunned 0.4 s** (it reads "shock"; it is a `stun`, so the view's stars work as they are). Elites feel half (0.2 s), bosses are immune. It uses the one CC window (below), so it cannot chain. The mage synergy's status duration does not apply to it (stun is not a magic status). |
| 7 | Starlight archer | Damage 250 -> **220**, interval 0.8 -> **0.5 s**, arrow pierces **1** extra enemy (was 2), kill burst radius 90 (same) for **25%** of the hit (was 50%). Single-target dps 312 -> 440. |
| 8 | Chef <-> bell | `UNIT_GRID.trickster` = chef, bell, bard, alch, lucky. Each rank keeps its numbers: chef takes the old rank-1 row (8, 1.0, 260), bell the old rank-2 row (20, 1.0, 300); skills and level perks go with the cat. Card rarity: `UNITS_BY_RARITY` in `src/meta/units.ts` (one line, outside my paths, the item named "card-level sources"): bell is a rare card, chef a common one. **A saved profile needs no migration**: levels and cards are keyed by cat id, so each cat keeps its level and its cards. What changes is the price of the next level (the bell pays the rare table, the chef the common one) and which chest slot drops which cat. `UNIT_IDS` (a plain list of ids) kept its order so no per-cat table moved. |
| 9, 10 | Synergy | See below. |
| 12 | Laser | `LASER_DURATION` 5 -> **6.5**. While it is on, an elite or a boss inside the dot's area (130) and inside the cat's range is the target before any other enemy; among several, the nearest to the dot. The laser card shows the new duration from data and a fourth line says so. |
| 13 | Boss health | `BOSS_HP` 1590 / 4064 / 14405 -> **1431 / 3658 / 12965** (x0.9, rounded). Elites unchanged. Armour and ward as they are. Endless grows from the new table. |
| 17 | Black hole | Pull 90 -> **55 px/s** (66 px over its 1.2 s). A hole keeps dragging the enemy it caught until it ends; **no other hole drags that enemy until 4 s after that** (`pullUid`, `pullImmuneUntil`, `PULL_IMMUNE_AFTER`). Elites move 35% of the pull, bosses 20%. |
| 17 | Freeze | Chance per blizzard tick 8% -> **12%**. A freeze **already had a 3 s immunity window after it ended** (spec section 9 since v1.0, shared with stun); I made it 4 s (`CC_IMMUNE_AFTER` 3 -> 4), still one window for stun and freeze, which is what makes directive 6 safe. This also moves the tiger's stomp stun (immune 4 s instead of 3 s after: no practical change at an attack every 4.4 s). Slow untouched. |

### The synergy rework (9, 10)

* Kinds are ranks 2 to 5 (`SYNERGY_MIN_RANK = 1`, `updateSynergy`). Steps stay at 2 / 3 / 4 kinds, so step 3 needs the guardian, and a guardian costs its legendary (awakening replaces it): four kinds mean a rare, an epic, a legendary **and** a guardian, i.e. two legendaries were made. `classDistinct` counts the same way; `classOwned` still reports every rank on the board (the ladder shows the kitten).
* Awakening needs step 1 (2 kinds): `AWAKEN_MIN_TIER` 2 -> 1.
* Class damage reaches that class only (`sy.damage` for the cat's own class, which now includes the rangers' step 3). Side effects reach every cat: armour ignore, crit chance and crit damage, status duration (`recomputeStats` sums the four classes' tiers once per recompute).

| class | step 1 (2 kinds) | step 2 (3 kinds) | step 3 (4 kinds, guardian) | step 3 ability |
|---|---|---|---|---|
| warrior | warrior dmg +12% (was 15) | +30% (36), **all** ignore 15% armour (20) | +65% (72), all ignore 30% (40) | **War cry**: every 7 s each warrior's range is stunned 0.5 s and loses 30% armour for 3 s (elite half, boss immune; waits ready until an enemy is in range) |
| ranger | all: crit chance +5 pts (was 7, rangers only) | all: +10 pts, crit damage +5% (was 15 pts, +0.3) | **ranger dmg +30%**, all: +20 pts, +10% (was 24 pts, +0.7) | **Sure shot**: every 5th shot of a ranger is a crit (no dice) |
| mage | mage dmg +12% (15) | +30% (36), **all** status duration x1.2 (x1.25, mages) | +65% (72), x1.4 (x1.5) | **Arcane burst**: an enemy that falls with a magic status (not elites, bosses) bursts: enemies within 70 take 12% of its max health; a burst never sets off another |
| trickster | speed +5% | +10%, reward x1.12 | +17%, reward x1.3 (all as before) | **Playtime**: every cat attacks 40% faster while the laser is on |

Numbers live in `data/classes.ts` (`SYNERGY`, `SYNERGY_SPECIAL`, typed `SynergySpecial`). Texts are built from them (`tierText`, `specialText`, `specialNameKey` on `ClassDef`). Events: `special` (`cry` once per roaring warrior, `shatter` per burst, with the enemies it touches). The ranger's crit is an ordinary `hit` with `crit: true`; Playtime is visible as the attack rate. The abilities are in `sim/specials.ts` (roar, queued burst), `combat.ts` (`rollCrit`), `board.ts` (speed while the laser is on; the laser sets `statsDirty` when it starts and ends).

**Why these four.** Each is a different kind of thing and reads in play: the roar freezes the screen for half a second (control), the sure shot makes a rhythm of big numbers (damage you can count), the burst is a chain of pops (area), Playtime ties the tricksters to the laser (the player's own button). All four are deterministic, pooled (the burst queue is a flat number list), and cost nothing when off.

The class chip's pips show only the counted ranks (the kitten pip stays dark), the class sheet states the three steps, the ability and "the kitten does not count", the awakening texts take the step from `AWAKEN_MIN_TIER`, and the three-pick's recommendation only counts a class as "on the board" through a cat that counts (`recommendPick`).

### Tutorial

The synergy lesson fires on the first step-1 class after the scripted epic pick. With the kitten out, a sling + sword board would only reach step 1 through the warrior; the scripted third summon is now a **rare** (`r_archer`, was `r_sling`), so an epic of either class completes two kinds. Checked for ten seeds in `sim.synergy.test.ts`: the pick of three always holds a warrior or ranger epic and picking it gives step 1; `recommendPick` prefers the class that counts.

### Auras as data

`UnitAura.reach` (cells; 1 = the 8 around) is read by `recomputeStats` through `auraTable(reach)`; the shape is `auraCells(cell, out, reach = 1)` in `geometry.ts`. **That is the one edit in `geometry.ts`** (the brief excluded the file, but the field engineer's note asks the rules phase to change exactly this function and the buff markers, the sheet and the agreement tests follow): it is now the ring of cells within `reach`, default 1. The kneading cushion keeps its 4 neighbours (`neighbors4`).

### Saves

`SIM_VERSION` 2 -> 3. `parseSnapshot` refuses another version before anything else, and a board of 20 cats (the old 5 x 4) fails the size check, so an old wave-start save is refused twice; `createBattle(init, snapshot)` returns `null` and the battle scene's existing `?? createBattle(init)` starts a fresh run. Tested in `sim.synergy.test.ts` (version 2 snapshot, a 20-cat payload, the fresh fallback).

### Measured (`npm run sim`, 500 runs a cell, level 1 in chapter 1 and the recommended level 2 / 3 / 4 / 6 in chapters 2 to 5; "before" is this tree just before the rules phase: 5 x 5 board, boss armour, v1.3 rules; same seeds)

Win rate, random / merge / synergy bot, stake 0:

| | before | after |
|---|---|---|
| chapter 1 | 0 / 55 / 79 | 0 / 44 / 75 |
| chapter 2 | 0 / 56 / 83 | 0 / 47 / 82 |
| chapter 3 | 0 / 55 / 81 | 0 / 42 / 78 |
| chapter 4 | 0 / 64 / 86 | 0 / 53 / 82 |
| chapter 5 | 0 / 64 / 85 | 0 / 53 / 83 |

Synergy bot, chapter 1, stakes 0 to 5: before 79 / 69 / 62 / 51 / 31 / 18, after **75 / 64 / 44 / 34 / 17 / 8**.

Class-focus win rate at stake 3 (the synergy bot pinned to a class line; free / warrior / ranger / mage / trickster):

| | before | after |
|---|---|---|
| chapter 1 | 51 / 51 / 73 / 47 / 12 | 34 / 28 / 50 / 29 / 5 |
| chapter 2 | 40 / 41 / 53 / 37 / 8 | 24 / 24 / 29 / 17 / 2 |
| chapter 3 | 54 / 50 / 68 / 55 / 19 | 43 / 38 / 49 / 41 / 12 |
| chapter 4 | 58 / 60 / 67 / 61 / 21 | 41 / 41 / 45 / 41 / 13 |
| chapter 5 | 59 / 57 / 81 / 54 / 19 | 44 / 39 / 61 / 34 / 10 |

Elite and boss kill time as a share of the limit (median; same cells and order): chapter 1 54 / 59 / 49 / 58 / 61 -> 57 / 62 / 52 / 59 / 61; chapter 2 51 / 55 / 46 / 55 / 59 -> 53 / 58 / 47 / 56 / 58; chapter 3 51 / 56 / 46 / 55 / 58 -> 53 / 58 / 47 / 58 / 60; chapter 4 50 / 53 / 46 / 53 / 57 -> 53 / 56 / 48 / 55 / 60; chapter 5 53 / 55 / 49 / 53 / 57 -> 54 / 57 / 51 / 54 / 57. (A boss cannot be melted: the damage allowance, section 11, makes about 45% of the limit the floor, and the allowance shrinks with its health, so the 10% cut moves only boards that fall short of the floor.)

**What moved the bots (ablations, synergy bot, chapter 1 stakes 0 to 5, 500 runs each, one rule reverted at a time in a copy of the tree):** the kitten not counting is almost all of it. With the kitten counting again: 86 / 73 / 63 / 51 / 33 / 20 (that is +11 to +17 points over the new rules, and about the same as before the batch). With the v1.3 step numbers (new application): 78 / 67 / 49 / 36 / 22 / 11 (+3 to +5). With the abilities switched off: 74 / 63 / 44 / 34 / 17 / 8 (0 to -1: the bots rarely reach a four-kind class, it takes two legendaries and an awakening). The rest of the batch (bard, bell, samurai, star archer, storm, laser, boss health, black hole, freeze) is inside the noise of the synergy bot, which neither uses the bell's dodge nor depends on the stun. The merge bot lost 10 to 12 points for the same reason. Nothing was retuned to bring these back.

### Bots

`moltIntoLadder` no longer molts into the kitten rung (it does not count). The bot test now asks for two counted kinds by wave 9 (it asked for three, kitten included). A variant that always merges kitten pairs of its line (they do not count any more) measured the same within noise (stakes 0 to 5: 75 / 65 / 46 / 34 / 17 / 9), so `ladderAllows` stays as it was.

### Tests (all green; `npx vitest run` 138 files, 3,036 tests at the end; `npx tsc --noEmit` prints nothing)

New: `tests/sim.synergy.test.ts` (17: the counting rule, awakening from step 1, the steps against v1.3, ranger step 3, every-cat side effects, the four abilities with their edge cases, the tutorial pick for ten seeds, a spent snapshot), `tests/sim.skills.test.ts` (23: samurai, star archer, shock, freeze window, black hole windows and factors, aura reach, bell dodge scaling and cap, chef/bell swap, laser priority, boss health), `tests/view.hud.dodge.test.ts` (2, the sticker's motion). Changed: the expectations of `sim.combat/data/flow/relics/rules/warriors/bots`, `view.hud.laser`, `view.hud.policy` (+1), and `tests/view.field.buff.test.ts` (one case merged two bells to show "no reach": now two paws).

### Not verified

A real phone. The dodge sticker's look was only checked on the dev server with a forced hazard. The four abilities' *look* is the existing hit, crit and status effects (a stun shows stars, a crit its big number): the `special` events carry what a view needs for a roar ring or a burst flash and nobody draws them yet (REQUESTS). The bots do not use the bell's dodge or Playtime meaningfully (the synergy bot does fire the laser), so the abilities' effect on win rate is a lower bound.

### REQUESTS

1. `src/view/field` (field engineer): draw the `special` events (`cry`: a ring of `radius` at (x, y), the enemies in `points`; `shatter`: a flash of `radius` at (x, y)); `buffMath.ts` should read `aura.reach ?? 1` (it uses `auraCells(cell)`'s default, equal today) and could mark the bell's own cell with the ward (the sim gives the bell a dodge chance on its own cell; `UnitState.shielded` is still "a bell next to it" so the agreement tests hold).
2. `src/audio` (`families.ts`, `report.ts`, `tests/audio-combat.test.ts` `LINES`): the trickster line is chef, bell, bard in rank order now; the loudness ladder check ("each rank louder") still lists bell before chef. I left `UNIT_IDS` in its old order so this test and the sound tables stay valid; if the ladder should follow the ranks, the chef needs the quieter sound.
3. Patch notes (`docs/패치노트_2026-10-09.md`): the list above is the player-facing change list; items 3 to 5 and 7 are nerfs with numbers, 8 changes where two cats stand in the card tables.
4. `docs/진행상황.md` section 0: spec v1.4, GDD v1.3, D-43.

## 2026-10-09 batch: release test (sim part)

Nothing in the rules changed. The English warrior role string was shortened (see `hud.md`). Checked in play with a four-kind board of each class: the roar, the sure shot (every 5th shot), the burst and the dodge fire as `sim.md` above says; the black hole, freeze and storm numbers are covered by `tests/sim.skills.test.ts` and were not retuned. Open REQUEST from the rules phase that I left: `src/audio` still orders the trickster line bell, chef (`UNIT_IDS`, the recipes' `rank` trims and `tests/audio-combat.test.ts` `LINES` agree with each other, so the chef's pan is about 3.5 dB louder than the second-rank bell): moving it needs `UNIT_IDS` and the sound tables reordered together and cannot be heard from here.


## 2026-10-10 batch 2: rules v1.5 (spec section 20, decision D-44)

The owner's second batch (`docs/qa/directive_2026-10-09_batch2.md`), rules half: directives 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13 and 15. `SIM_VERSION` stays **3**: a save holds the board, the currencies, the counters, the random streams and the special cells' places, the kind of cell follows from `init.chapter`, so no save changes its meaning (it plays on under the new numbers; `snapshot.ts` says so). Nothing was retuned beyond the items; the bot numbers are before and after only.

### What changed (old -> new)

| # | Directive | What I did |
|---|---|---|
| 1 | Fish per second | `BASE_FISH_PER_SECOND` = **0.5**, paid in `economy.updateIncome` once a tick in the wave phase (so the between-waves second and the act-clear wait pay too; the 3-second opening preparation and open choices do not). It goes through `earnFish`, so `rich` doubles it and fractions carry in `fishFrac`; one whole fish at a time is a `fish` event with reason **`income`** and no x / y. **Share** (synergy bot, winning runs, stake 0, 500 runs): kills 51%, wave rewards 26%, act rewards 10%, **steady income 9%** in chapters 1 to 4 (225 of 2,400 fish); in chapter 5 20% because the treat cells add 337 more. Kills stay the largest source everywhere (45 to 54%). |
| 4 | Ignore and break on ward | One line in `damageEnemy`: `defence = (physical ? armor : ward) * (1 - scratcher)`, then `* (1 - breakAmount)` while broken, then `* (1 - src.armorIgnore)`. DoT ticks use their source cat's ignore, toy and star damage have none. Texts: "방어와 결계" / "armour and ward" in the viking, the tiger, the warrior synergy and its roar; trait lines for armoured and warded; spec section 9. The status keeps the id `armor_break`. |
| 5 | Ranger damage | `SYNERGY.ranger` damage **8 / 20 / 45%** at steps 1 / 2 / 3 (was 0 / 0 / 30%); the all-cats crit numbers (5 / 10 / 20 points, 0 / 5 / 10% crit damage) are untouched. Lower than the warriors' and mages' 12 / 30 / 65 on purpose: the crit package is worth about +5 / +11 / +21% to the whole board. |
| 6 | Ranger ability | "Sure shot" is gone (`sureCritEvery`, `shots`, the dice shortcut in `rollCrit`). **Ricochet** (`SYNERGY_SPECIAL.ranger = { kind: 'ricochet', pct: 0.35, reach: 150 }`): when a ranger's arrow hits (`impact`, so the ninja's stars one by one, and once per volley of the star archer, from its main target) the nearest OTHER enemy within 150 px (+ its radius) of the one hit takes 35% of the damage with the same crit, no new dice, never a second bounce. Event **`ricochet { unit, x, y, tx, ty, targetUid }`** (new, not a `special` kind: the view's `specialRing` takes only `cry | shatter`). Mage burst 12 -> **10%**. |
| 7 | Armour breakers aim at elites and bosses | `UnitDef.targetsElitesFirst` (derived: a `blast` or an attack whose effect is `armor_break`) is true for **w_viking and w_tiger** only. `pickTarget`: laser focus first, then the oldest elite or boss in reach (same `travelled` order, ties by uid), then the oldest enemy. |
| 8 | Laser lock | `cmdSetLaser`: an elite or boss within **130** (`laser.radius`) of the placed point locks the dot (`laser.lockUid`, `Sim.laserLock`); `updateLaser` moves the dot to it every tick. Released (event **`laserLock { state, enemy: null }`**) when the dot is placed more than 130 away, the enemy dies (the dot stays where it fell) or the laser ends (silently). The locked enemy sits at the dot's centre, so every cat that reaches it already chooses it first (the v1.4 priority); the cats that do not keep their own targets. Locking happens on placement only. |
| 9 | Molt price by rank | `MOLT_COSTS` = **1 / 1 / 2 / 3** (kitten, street, alley boss, king; a guardian cannot molt); `BattleApi.moltCostOf(cell)` (-1 for an empty cell or a guardian), `moltCost()` is the cheapest (1), `MOLT_COST` kept for the guide's single number. The 6-per-run limit is untouched. The synergy bot keeps the purr of one awakening before it molts a rung below the legendary (`purr - cost >= awakenCost`), a legendary rung it always molts into. |
| 15 | Awakening | `AWAKEN_COST` 12 -> **10**. |
| 11 | Warrior ranges | **200 / 210 / 220 / 230 / 240** (was 200 / 215 / 235 / 255 / 285). Rule: the second ring (189 and 207 px from the walkway) is reached by all, the middle cell (285) by none, not even a boss (radius 40); 90 to 140 under the mage of the same rank. Damage and targets untouched. |
| 10, 12 | Texts | Distances are tiles (`data/lengthText.ts`, 100 px = 1 tile, one decimal; `unit.<id>.skill` takes them through `UnitSpec.tiles`, `skillArgs` stays in px). New sentences for the samurai, the sword, the viking, the tiger, the star archer, snow, fire, storm, frost, cosmo and the alchemist; the perks "targets" and "reach" (now two keys: `perk.reach.line`, `perk.reach.chain`); the mage synergy ("둔화·화상·독이 1.2배 오래가요"); the glass marble. A test refuses 대상 / 광역 / 연쇄 / 반경 / radius / chain distance / area size / px in any unit, perk, toy, class or daily sentence, and a bare px value in a skill sentence. |
| 13 | Special cell per chapter | `data/cells.ts` (`SPECIAL_CELLS`, `specialCellOf(chapter)`, `specialCellText`), ids in `api.ts` (`SPECIAL_CELL_IDS`, `SpecialCellId`), the pairing in `CHAPTERS[].cell`. **sun** (living room, attack speed +20%), **bowl** (kitchen, damage +20%), **bubble** (bathroom, crit chance +20 points), **stump** (garden, range +20%), **treat** (vet, 0.15 fish a second for each cat on it that a hazard has not stopped; goes into `incomeRate`). Five cells, the plus in the middle first, a new draw from the `sun` stream every act: unchanged. Daily, endless and gold use the chapter's kind (`init.chapter`). The toy `sunny_spot` ("명당 자리" / Prime Spot) adds three cells (two before v1.7) and 0.1 to the bonus of any kind (`fx.sunSpeed`; the owner set both in batch 4), the rule `sunny_day` ("명당 가득한 날") 10 cells: ids unchanged, names and sentences "special cell". |

### Additive API (everything the view engineer needs, exactly)

* `CurrencyReason` + `'income'`: the `fish` events of the steady income. **`src/view/director/currency.ts` `onFish` launches a flying icon (and its sound) for every reason except `start` and `sell`: it must skip `income`** (one whole fish every 2 seconds would otherwise fly from the field's middle to the pill).
* `BattleApi.incomePerSecond()`: fish per second right now (0.5 plus the treat cells, times the `rich` multiplier), for a "+0.5/s" next to the fish pill; `BASE_FISH_PER_SECOND` in the barrel.
* `BattleApi.moltCostOf(cell)`, `MOLT_COSTS`; `moltCost()` is now "the cheapest". Callers to move: `SelectionSheet.ts` (the molt button and `hints`), `popups/MoltPicker.ts`, `hud/tutorialScript.ts` / `Tutorial.ts` (`moltCost` of the world, fine as the cheapest), `guide/facts.ts` (`cost: MOLT_COST` is the cheapest only; the guide text says "털갈이는 {cost}개", give it the 1 / 1 / 2 / 3).
* `BattleApi.awakenCost()` is 10 through the same constant; `guide/facts.ts` reads `AWAKEN_COST`.
* `LaserState.lockUid` (0 = none); event `laserLock { state, enemy | null }`; `laser.x` and `laser.y` are the locked enemy's position every tick, so a view that draws the dot from the state follows by itself. A lock marker and a sound are the view's.
* `UnitDef.targetsElitesFirst` (true: w_viking, w_tiger). Their sentences already end with "보스·정예가 사거리 안에 있으면 먼저 노려요" / "Aims at a boss or elite in range first".
* `BattleApi.specialCell` (the kind of this battle), `SPECIAL_CELL_IDS`, `SPECIAL_CELLS[id]` = `{ id, nameKey, descKey, stat: 'speed' | 'damage' | 'crit' | 'range' | 'fish', value }`, `specialCellOf(chapter)`, `specialCellName(id)`, `specialCellText(id, extra)` (`extra` = the toy's +0.1), `cellShown`, `CHAPTERS[n].cell`. The cells keep their old names in the sim and the API: `BattleApi.sunbeams` (the cells), `UnitState.sunlit`, the `sunbeams` event, `SUN_CELLS`, `SUN_SPEED` (= the sunbeam's value), `FIRST_SUN_CELLS`, `RelicFx.sunCells` / `sunSpeed`. Rename them when the screens move (nothing in the sim depends on the names).
* Event `ricochet { unit, x, y, tx, ty, targetUid }`: draw a second arrow from (x, y) to (tx, ty); the damage is an ordinary `hit` of the same unit.
* Distances in texts: `tilesOf(px)`, `tilesText(px)` (language-aware), `TILE_PX`. A screen that prints a range in px (the unit screen, the codex) should print tiles the same way.
* Sentence changes the view should know about (lengths, not widths): the class sheet's tier and ability lines (`synergy.<class>.<1|2|3>`, `.special`) are about the same length except the ranger's (they now start with "사수 피해 +N%") and the mage's step 2 and 3 ("모든 고양이가 거는 둔화·화상·독이 N배 오래가요"); the viking, tiger and samurai skill sentences are longer by one clause; the toy "명당 자리" replaced "햇살 명당".

### What still says the old things (not mine)

`src/codex/cells.ts` and `codex/boards.ts` and their strings (the "발판" page: it should list the five kinds, `allSpecialCells()`, and the toy), `src/guide/stringsKo.ts` and `stringsEn.ts` (the sunbeam topic, "필살 사격", the molt cost, "방어를 깎아요"), `src/screens/pass/strings.ts`, `src/view/field/sunMath.ts` / `sunNote.ts` / `effects.ts` / `toyCells.ts` / `toyMarks.ts` (the cell art and the "+20%" note come from `SUN_SPEED`: they should come from `specialCellOf(chapter).value`), `view/hud/Tutorial.ts` and `encounterWatch.ts` (chapter 1 only: still right), `view/director/growth.ts` (sunbeam sparkle).

### Measured (500 runs, same seeds; "before" = this tree at `cf8326c`, run in a clean copy; full tables in spec section 20)

| | before | after |
|---|---|---|
| Stake 0, chapters 1 to 5, merge bot | 44 / 47 / 42 / 53 / 53 | 65 / 63 / 60 / 71 / 71 |
| Stake 0, chapters 1 to 5, synergy bot | 75 / 82 / 78 / 82 / 83 | 89 / 91 / 88 / 92 / 93 |
| Chapter 1, stakes 0 to 5, synergy bot | 75 / 64 / 44 / 34 / 17 / 8 | 89 / 77 / 67 / 54 / 36 / 24 |
| First guardian (wave, share of runs), chapter 1 stakes 0 / 3 | 16, 82% / 20, 35% | 12, 93% / 16, 60% |
| Stake 3, class focus: free / warrior / ranger / mage / trickster, chapter 1 | 34 / 28 / 50 / 29 / 5 | 54 / 50 / 76 / 49 / 20 |
| chapter 2 | 24 / 24 / 29 / 17 / 2 | 40 / 31 / 48 / 31 / 13 |
| chapter 3 | 43 / 38 / 49 / 41 / 12 | 52 / 46 / 69 / 52 / 21 |
| chapter 4 | 41 / 41 / 45 / 41 / 13 | 60 / 55 / 61 / 59 / 23 |
| chapter 5 | 44 / 39 / 61 / 34 / 10 | 63 / 54 / 75 / 56 / 27 |

Lane coverage (outer ring / second ring / middle cell), before -> after: paw 22 / 11 / 0 unchanged; sword 24 / 16 / 0 -> 24 / 14 / 0; viking 26 / 20 / 0 -> 25 / 17 / 0; samurai 28 / 24 / 0 -> 26 / 19 / 0; tiger 33 / 32 / **18** -> 27 / 21 / **0**. The mages are 34 to 48 / 33 to 62 / 20 to 89.

**What moved the bots** (one rule reverted at a time in a copy, chapter 1, synergy bot, stake 3; 500 runs): steady income +10 points (+13 at stake 0, +17 for the merge bot), awakening for 10 purr +7, rank-based molt price **-6** (the king's 3 is almost all of it: 1 / 1 / 2 / 2 costs -1, 1 / 1 / 1 / 2 -1), the ranger changes +2, the shorter warrior ranges -3, armour-breakers aiming at elites +3, the laser lock 0 (the bots re-aim every 0.25 s anyway), ward ignore 0. Everything reverted at once reproduces the "before" row exactly (75 / 64 / 44 / 34 / 17 / 8, merge 44), so nothing is unaccounted for. **The single biggest lever is the steady income:** 9% of the fish earned is +10 to 13 points of win rate, so if the owner finds the new numbers too easy, `BASE_FISH_PER_SECOND` (one line) is where to start.

**Warriors**: the range cut costs the warrior-pinned bot 6 / 5 / 0 / 9 / 4 points in chapters 1 to 5 at stake 3 (same seeds, old ranges in a copy), and they stay level with the mages (+1 / 0 / -6 / -4 / -2) and 18 to 32 points above the tricksters; the rangers are far ahead (+26 / +17 / +23 / +6 / +21). **I gave nothing back** in targets or damage.

**Special cells** (chapter 1, stake 3, synergy bot, 600 runs, kind swapped inside the chapter): none 36%, sunbeam 53, bowl 50, bubble 48, stump 53, treat at 0.2 fish 61 -> lowered to **0.15 = 54** (0.12: 51, 0.10: 46). Chapter 4: none 45, sun 60, bowl 57, bubble 58, stump 60, treat at 0.2 64. The range cell is worth nothing to a ranger line (chapter 4, ranger pinned: -14 against the sunbeam).

### Tests (`npx vitest run`: 147 files, 3,269 tests green at the end; `npx tsc --noEmit` prints nothing)

New: `tests/sim.cells.test.ts` (the five kinds per chapter and mode, each bonus alone, the toy, the treat trickle, saves). Changed or extended: `sim.data` (tiles, no internal terms, special cells, elite-first flag), `sim.synergy` (ranger damage at every step, the ricochet: nearest, 35%, once, shared crit, event, off below step 3), `sim.combat` (ward through break, ignore and the toy), `sim.skills` (laser lock: lock, follow, release, death, end, cats that reach it; armour breakers' priority and the laser over it), `sim.flow` (the income: not in preparation, 0.5 a second, `rich`, the share of a bot run), `sim.rules` (molt prices, one purr short, awakening for 10), `sim.warriors` (the ranges, the ring rule with every cell and the biggest body, the tiger's reach), `sim.bots` (the bot keeps the purr of one awakening; most runs hold a guardian by wave 18). `tests/simreport.sim.ts`: the `reach` section now prints outer ring / second ring / middle cell, new `income` section (fish by source), `SIM_FOCUS` and a `SIM_CHAPTERS` filter for `chapters`; `runner.ts` tallies fish by reason with `tally: true`.

### Not verified

A real phone, and the look of anything: nothing here draws (no cell art, no lock marker, no ricochet arrow, no "+0.5/s", no tiles in the unit screen) and the `income` events would fly icons until the view skips them. In the browser (dev server on 5199, Aside, no page errors) the chapter 5 battle reads `specialCell` 'treat'; with two cats on treat cells and the sim stepped 15 s from the page, `incomePerSecond()` was 0.8 and nine `income` events (one fish each) came in during the 12 s of wave time. The battle clock itself does not advance in the Aside tab while the first-encounter card is open, and the chapter 5 board still draws the cells as sunbeams (the view has not followed). The special cells' worth is the free synergy bot's; for the class lines it differs (the range cell for rangers).

### REQUESTS

1. `src/view/director/currency.ts`: no flight, no sound for reason `income`; `SelectionSheet` / `MoltPicker`: price from `moltCostOf(cell)`; `hints.request('molt')` and the tutorial's `moltCost` as the cheapest.
2. HUD: "+N/s" from `incomePerSecond()` beside the fish pill; the laser's lock marker from `lockUid` / `laserLock`; the ricochet arrow from `ricochet`; the five cell arts (one id each: `sun`, `bowl`, `bubble`, `stump`, `treat`; glow in the chapter's colour), the codex "발판" page and the guide for all of them; the toy's and the daily rule's names in codex, guide and the pass strings.
3. `src/guide`, `src/codex`: "방어를 깎아요" -> "방어와 결계", the ranger ability, `MOLT_COST` -> the three prices, awakening 10.
4. Unit screen and codex: print ranges in tiles (`tilesText`); the class chip rule text for rangers (every tier now has ranger damage).
5. `docs/진행상황.md`: spec v1.5, GDD v1.4, D-44.


## 2026-10-10 batch 2: black hole back to 90 px/s, immunity 2 s (directives 16 and 17, done in the view phase)

The owner's own numbers, so the only change under `src/game` in the view phase: `m_cosmo` `pull` 55 -> **90** (`data/units.ts`), `PULL_IMMUNE_AFTER` 4 -> **2** (`data/balance.ts`; elites x0.35 and bosses x0.2 untouched). The skill sentence reads the 2 from the constant (`{c}`), no text quotes 55. `tests/sim.skills.test.ts` (90 a second, the window of 2 s, the total over a 13 s fight), the spec's section 9 line and the section 20 table row say so (`명세_전투규칙.md`, v1.5.1). Bots were not rerun for this (the owner is tuning by hand); codex page numbers for the hole come from the same data.
