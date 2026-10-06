# Hand-off: battle simulation (sim)

Pure logic for "냥이 수비대 / Meow Guard": the deterministic battle simulation, its data tables, the balance bots and
the tests. No rendering, audio, DOM, `Math.random`, `Date` or `Math.pow` anywhere in `src/game/sim`.
Rules of record: `docs/명세_전투규칙.md` (now v1.1, §16 lists every change made while tuning).

## What exists

| Path | Content |
|---|---|
| `src/game/index.ts` | Public barrel (see below). Also registers the battle strings. |
| `src/game/sim/` | `create.ts` (`createBattle`), `sim.ts` (the `Sim` class implementing `BattleApi`), `board.ts` (summon, merge, molt, awaken, sell, upgrades, synergy and stat recompute), `enemies.ts` (spawn, walk, statuses, damage, death, auras), `combat.ts` (attacks, projectiles, zones, laser, timed relics), `boss.ts`, `hazards.ts`, `flow.ts` (waves, acts, toy offers, danger/overflow, victory, defeat, revive), `snapshot.ts`, `odds.ts`, `streams.ts`, `economy.ts`, `emitter.ts`, `types.ts`; tooling: `bots.ts` (three balance bots), `runner.ts` (headless runs and measurements). |
| `src/game/data/` | `balance.ts` (every constant, `HP_INDEX`, `ELITE_HP`, `BOSS_HP`), `units.ts`, `enemies.ts`, `relics.ts`, `classes.ts`, `waves.ts` (5 x 24 hand-written waves + endless mapping), `training.ts`, `modifiers.ts`, `stakes.ts`, `types.ts`, `stringsGame.ts` (all sentence templates, ko + en); `roster.ts` and `strings.ts` kept as they were. |
| `tests/sim*.test.ts`, `tests/simHelpers.ts`, `tests/simStats.ts` | 213 tests (unit, chi-square, 1,000-run fuzz, determinism, stream independence, snapshots, every relic, every enemy trait and boss ability, performance). |
| `tests/simreport.sim.ts`, `tests/simReportKit.ts`, `vitest.sim.config.ts` | The balance report behind `npm run sim`. |
| `docs/명세_전투규칙.md` | Updated to v1.1. |

`src/game/api.ts` and `geometry.ts` were not touched: no additions to the contract.

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
| Contract types and ids | re-exported from `./api` (`BattleApi`, `BattleEvents`, `UNIT_IDS`, `RELIC_IDS`, ...), identity tables from `data/roster` |

Tooling (not in the barrel): `playRun(init, 'random' | 'merge' | 'synergy', options)` in `@/game/sim/runner`,
`createBot(policy, seed)` in `@/game/sim/bots`.

## Behaviour the renderer / UI must know

* **Subscribe before you step.** The emitter knows who listens: no payload object is built for an event nobody subscribed to (that is how a headless run allocates nothing). `projectileEnd.projectile` and `zoneEnd.zone` objects are pooled and reused after the event: read them inside the handler.
* **Choices stop time.** `pending` is set and `phase === 'choice'` for the 3-pick summon (`pickSummon`) and the toy offer (`pickRelic`, `rerollRelics`); other commands return `choice_pending`. `summon()` that opens the 3-pick returns `null` and the cost is already paid. Toy offers keep their `options` array in place and remove a picked entry (`picksLeft` > 1 on the toy-box day).
* **Prep.** `phase === 'prep'` for 3 s before wave 1; the tutorial waits there until the first summon. Laser and wave timers do not run in prep.
* **Waves.** `wave` is 1-based; 0 during the first prep. Elite / boss: `waveTime` stays 0 until the boss appears (1.0 s after `waveStart`), `waveDuration` is the limit. After a boss falls: `waveEnd`, 1.2 s later `actClear` (not for the last wave: `victory` instead), `sunbeams`, `relicOffer`, and one second after the last pick the next `waveStart`.
* **Endless** has `totalWaves === 0`.
* **Removed without reward.** `nine_lives` and `revive()` chase enemies off: each gets an `enemyDie` with `fish: 0, purr: 0, killer: null` (and `rescued` / `revive` carry the count).
* **Boss damage allowance.** `boss` / elite takes at most `maxHp / (0.45 x limit)` damage per second (1.5 s burst), surplus is dropped; `hit.amount` is the clipped value.
* **Hits on dead units.** A unit merged / sold / molted away keeps flying projectiles; credit goes to `damageByUnit` but `killer` is `null`.
* **Snapshots.** `snapshot()` is taken at the top of every `startWave` (before any wave-start draw), `null` in daily mode. `createBattle(init, snapshot)` restores that state in `prep` with `wave = n - 1`, an empty field, and starts wave `n` after the usual 3 s; running both to wave `n` gives identical snapshots (only `time` differs). The snapshot carries its own `init`; the `init` argument must match seed, mode and chapter.
* **Daily mode** forces unit level 5 and no training, no snapshot, no revive, free toy reroll only.
* **RNG.** Seven streams (`summon, pick, merge, toy, sun, wave, combat`), seed = hash(seed, name). Extra draws that must not shift a stream are always taken (the 4th summon draw serves twin bells, the 2nd merge draw serves snack stick). The cat tunnel draws from `toy`.
* **Pity.** `summonOdds()` is exactly the table the next roll uses (grade, daily lucky-day bonus, soft pity); a 3-pick counts toward the pity counter (see §16 of the rules).
* `RunStats.bossesKilled` counts boss waves only; `summons` counts every cat that appeared by summon, pick, twin or tunnel.

## Final tables

`HP_INDEX[1..24]` (cucumber health, x chapter multiplier x daily rule): 59, 69, 80.8, 94.5, 111, 129, 151, 177, 207, 242, 284, 332, 388, 454, 531, 622, 728, 851, 996, 1165, 1363, 1595, 1866, 2183 (x1.17 per wave; endless keeps x1.14).
`ELITE_HP` (waves 4 / 12 / 20) = 1055, 3848, 10080. `BOSS_HP` (8 / 16 / 24) = 1590, 4064, 14405 (endless: x1.14^8 per later boss).
`CHAPTER_HP_MULT` = 1.0, 1.08, 1.2, 1.37, 1.4 at recommended unit levels 1 / 2 / 3 / 4 / 6.
Waves 1-3 of every chapter use a smaller budget (12 / 16.8 / 20.4 cucumbers instead of 24).
Economy: summon 12 + 6n (cap 80), awakening 12 purr, stakes see `data/stakes.ts` (cap 60 -> 42, act purr 2 -> 1, cost +10%, boss limit -10 s, 2 toy choices + no free reroll + elites and bosses +40%).
Units: damage of the area-heavy legendaries / mythics was lowered and the trickster commons raised (see rules §16); every number is in `data/units.ts`.

RESULTS_PLACEHOLDER

## Verification

* `npx vitest run tests/sim` 213 tests, about 20 s: tables and text (both languages, no unfilled placeholder), odds (sum to 1, chi-square p > 0.001 for the pure roll in every grade x pity state with 100,000 samples each, and for the battle's own summons per `epicDry` state from 100,000 summons), summon / merge / molt / awaken / sell / upgrade rules and every `Fail` reason, synergy by distinct types, damage formula, every status rule, hazards, laser, every attack shape, every relic (plus a scan that every relic effect field is read by the simulation), every enemy trait and boss ability, waves / acts / toy offers / defeat / revive / snapshots, 1,000 fuzzed runs with invariants (money integer and non-negative, at most 20 units, `enemies.length === enemyCount`, no NaN, ids unique), determinism (60 scripted runs twice, plus bot runs), stream independence, performance.
* Performance: a full 24-wave run of the synergy bot spends 25-35 ms inside `step()` on this machine (the test asserts < 150 ms best of 6, in a file of its own so the JIT is fresh); a steady field allocates < 400 KB over 3,000 ticks (the test forces GC around the measurement).
* Type check: `npx tsc --noEmit` shows no errors in my paths. Errors elsewhere in the tree belong to other engineers (e.g. `tests/meta.chests.test.ts`, `tests/audio-engine.test.ts`).
* No browser check: nothing here renders.

## Known gaps

* The random bot cannot reach its target: see the results section.
* Danger exposure of the synergy bot is 32% of runs (target 40%) and its median surplus is 1.67 (target 1.2-1.6): tightening normal waves further costs more win rate than the tail gives back (the cliff is steep: +8% health = -10 points).
* Unit perks (levels 4 / 7 / 10) are generic stat bonuses (range, damage, speed, crit, area, targets, duration, effect, reach, aura) rather than bespoke abilities; mythic units have their own three.
* Bots are simple scripts, not optimisers; every target above is for these bots.
* `weaken` from the dryer picks the highest `stats.damage` cat that is not already weakened (rules only say "highest damage").

## REQUESTS

REQUESTS_PLACEHOLDER
