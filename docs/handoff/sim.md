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
