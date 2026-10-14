# Hand-off: skills, step 1, simulation side (the frame, four skills, the app switch)

Engineer keys: `skills1_sim` (frame, viking, switch), `skills1_run` (tiger, star archer, the running body), `skills1_wanted` (gunner), and the review pass that closed this part (findings below, section 10). Brief: `docs/qa/directive_2026-10-13_skills_build.md` (the owner's words, the lead's sixteen decisions) and `docs/design_skills_v2.md` (v2.3). Rules as built: `docs/명세_전투규칙.md` **section 22** (22.9 lists what the review changed). **Nothing here is view work**: no ring, no effects, no name bubble, no cut-in, no dev server, no browser, no sound. Nothing is committed. `SIM_VERSION` stays 3; the only thing saved that is new is the field `sp` in the `BattleInit` a saved run already carries.

This is the document the view workflow builds from. Sections 1 to 3 are the facts (what exists, every type and event, every data cell), section 6 is what the view must do and watch for, section 8 is how a step-2 skill is added.

## 0. State

| | |
|---|---|
| Built | the gauge frame (start, fill, block, move, merge, molt, awaken, restore, sell, automatic cast, the 0.2 s re-check, the 1.2 s rank 5 gap, the first-cast flag), the delayed list, the damage hooks, the running body, and **four skills**: viking `shove`, tiger `charge`, star archer `lap`, gunner `wanted` |
| Switch | `src/core/skillSwitch.ts`: `SKILLS_ON = false`, `?sp=1` / `?sp=0` override it. The simulation reads `BattleInit.sp` (absent = on) |
| Checks | `npx tsc --noEmit -p .` prints nothing. `npx vitest run`: **172 files / 3,747 tests green** (the baseline before the skills was 167 / 3,564). `npm run font` was run when the four names were added (no text was added since) |
| Not done | everything the player sees (section 6); the other eight skills (step 2); the texts beyond the four names (step 3); the bot comparison skills on against off (step 4: `SIM_SP=1` against `SIM_SP=0`); nothing was retuned (decision 7), `SKILLS_ON` stays false |

## 1. What exists

| Path | Content |
|---|---|
| `src/game/api.ts` | `SP_SKILL_IDS` / `SpSkillId` (all twelve names), `SpRank`, `SpSkillDef`, `UnitDef.spSkill`, `UnitState.sp`, `BattleInit.sp`, `BattleApi.spOn`, the events `spCast` `spRunHit` `spRunBurst` `spRunEnd` `bite`, the payload types |
| `src/game/data/spSkills.ts` | the data: the four rows (`SP_ROWS`), `SP_COOLDOWN` (the starting values by rank, a record only), start values, `SP_RECHECK`, `SP_RANK5_GAP`, `SP_UNIT_OF`, `SP_RANK_OF`, `spRowOf`, `spSkillOfUnit` |
| `src/game/sim/spSkills.ts` | the gauge pass `updateSpSkills`, called from `Sim.tick` after `updateUnits` (`if (this.spOn)`). Walks `Sim.spCats` (the cats with a skill, in cell order, rebuilt by `refresh` in `board.ts`), not 25 cells |
| `src/game/sim/sp/` | `types.ts` (`SpHandler`), `target.ts` (skill order, reach), `cast.ts` (`announceCast`, `castListened`), `later.ts` (the delayed list), `run.ts` (the running body), `shove.ts`, `charge.ts`, `lap.ts`, `wanted.ts`, `registry.ts` |
| shared files, smallest edits | `sim/enemies.ts` (`damageEnemy(..., ignoreDefence)`, `dealDamage`, `shoveEnemy`, `slideBack`, the wake line), `sim/board.ts` (`makeUnit` takes the start value, `keepGauge`, `collectSkillCats` in `refresh`), `sim/sim.ts` (`spOn`, `spCats`, `later`, `runners`, `runSeq`, `spSeen`, `spFirst`, `spRank5Until`), `sim/types.ts` (`SimUnit.spCheckAt`, `SimEnemy.shoveLeft` `shoveStep` `shoveImmuneUntil` `bountyTaken`), `sim/create.ts` (`sp` of an old save), `sim/combat.ts` (`areaOf` exported), `data/units.ts` (`spSkill` on the definition), `data/stringsGame.ts` (four names, both languages), `game/index.ts` (exports), `app/flow.ts` (`resumeInit`), `meta/profile.ts` and `view/field/debug.ts` (`skillsOn()`) |
| `src/core/skillSwitch.ts` | `SKILLS_ON`, `spParam`, `skillsOn()`, `resumeInit()` |
| tests | `tests/sim.spSkills.test.ts`, `tests/sim.spRun.test.ts`, `tests/sim.spWanted.test.ts`, `tests/sim.spStart.test.ts`, `tests/app.skillSwitch.test.ts`, `tests/spHelpers.ts` (`fingerprintRun`: a hash of every event of a seeded bot run plus the end state and the seven random streams), three more tests in `tests/screens.shell.flow.test.ts` |

## 2. Public shapes (all in `src/game/api.ts`)

```ts
type SpSkillId = 'shove'|'cut'|'charge'|'clones'|'wanted'|'lap'|'cloud'|'knock'|'meteor'|'jam'|'fish'|'capsule';
type SpRank = 3 | 4 | 5;                    // epic / legendary / mythic
interface SpSkillDef { id: SpSkillId; rank: SpRank; cooldown: number; nameKey: string }   // cooldown = the row's own cell; nameKey = `sp.<id>.name`
UnitDef.spSkill?: SpSkillDef                // present ONLY when the skill's row is built: w_viking, w_tiger, r_gunner, r_star
UnitState.sp: number                        // gauge 0..1; 1 = full (may be waiting for its condition). 0 for a cat without a skill AND for every cat while spOn is false
BattleInit.sp?: boolean                     // absent = on; false = the whole pass off, the battle plays exactly as before the skills
BattleApi.spOn: boolean                     // = init.sp !== false. Draw no rings when false
```

### Events

| Event | Payload | Fires |
|---|---|---|
| `spCast` | `SpCastEvent` = `{ unit, first, x, y }` + a union on `skill`: `{ skill: 'shove'|'charge'|'lap'|'wanted', data }` | once per cast, after the gauge went back to 0 and the effect's bookkeeping, **before** the cast's own `hit` events (the scene starts, the numbers pop up on it). The payload is built only if somebody listens |
| `spRunHit` | `{ runId, skill: 'charge'\|'lap', enemy, x, y, head }` | the running body touched an enemy (once per enemy and run); its `hit` follows at once. `x, y` = where the enemy stood, `head` = px of the run the body had covered. **Not sent** when the lap's pool is spent or kept for the originals (the enemy is passed without a star, no `hit` either) |
| `spRunBurst` | `{ runId, skill: 'lap', x, y, radius, points: StrikePoint[] }` | an enemy the lap felled burst: after its `enemyDie`, before the victims' `hit`s. `points` may be empty |
| `spRunEnd` | `{ runId, skill, unit, hits }` | the body reached the end of its run. **Not sent** if victory or defeat comes first. `unit` may have been sold (`removed`) |
| `bite` | `{ unit, enemy, amount, share, taken, pool, killed }` | the gunner's bite on an elite or a boss, **after** the damage (`enemy.hp` already lower; when it killed, `enemyDie` came first). Never a `hit` |

Common fields of `spCast`: `unit` the cat; `first` true the first time THAT skill is cast in the run, by any cat (not saved: a resumed run shows it once more); `x, y` the scene's anchor, the cat's tile centre unless the skill says otherwise.

```ts
interface SpShoveData { range: number; slide: number; pushed: SpShoved[] }       // pushed in skill order; never empty
interface SpShoved   { uid; x; y; angle; toX; toY; distance }                      // where it stood, where the slide ends, px it slides (160, elite 56, boss 32, less near the start)
interface SpRunData  { runId: number; at: number; dir: 1 | -1; delay: number; duration: number }   // base of the two run payloads
interface SpChargeData extends SpRunData { startPath; landX; landY; dist; speed; leap }   // tiger: dir -1, delay = leap = 0.3, duration 1.1
interface SpLapData    extends SpRunData { startPath; startX; startY; dist; speed }       // archer: dir +1, delay 0, duration 1.219
interface SpWantedData { mode: 'bite'|'small'; targetUid; x; y; share; taken; pool; amount; closed }
```

* **The running body's place** at simulation time `t` (`BattleApi.time`): `pathPoint(startPath + dir * min(dist, speed * max(0, t - at - delay)))`. `startPath` is in `[0, PATH_LENGTH)`. Tiger: `landX/landY` is where it comes down; the cast's own `x, y` is the tile it leaps from. Arrow: `startX/startY` is where it comes down. The simulation's run ends at the first tick at or after `at + delay + duration` (tiger 84 ticks = 1.4 s after the cast, arrow 74 ticks = 1.233 s). Time the picture by `BattleApi.time`, not real time: it stands still while a popup pauses the simulation and runs 2x / 3x with it.
* **Order of one tiger or lap cast**: `spCast` -> (`spRunHit` -> `hit` -> [`enemyDie` -> `spRunBurst` -> the burst's `hit`s])* -> `spRunEnd`. `hit.unitId` of a stomp is the cat's id like its tile attacks; pair a `hit` with the `spRunHit` right before it for "this one is the run's".
* **Gunner** (`SpWantedData`): `targetUid, x, y` where the target stands (the poster goes there, the cork flies from the cat's tile to that point). Bite: `share` = amount / maxHp (0.06, less when the pool had less left), `taken` = the share this target has given in all including this bite (0.06, then 0.12), `pool` 0.12, `amount` = share x maxHp, `closed` = this bite emptied the pool (the "case closed" stamp; two eggs, one per 6%). Small shot: `share` 0.2, `taken` 0, `pool` 0, `amount` = 0.2 x current hp, `closed` false, and an ordinary `hit` (no crit) after the `spCast`. Order of one bite: `spCast`, whatever the damage causes (`shieldBreak`, `enrage`, `enemyDie`, `waveEnd` ...), then `bite`. A bite never produces a `hit` (the boss bar feeds its estimated time to kill from `hit` events; a test runs the real `DamageWindow`).
* **Shove**: the pushed enemies really move in the simulation (read `enemy.x/y/travelled` each frame). `toX/toY` and `slide` let the view dress the slide (afterimage at `x/y`, streaks, a wedge of dust over the road inside `range`: derive the road stretch by scanning `pathPoint` within `range` of the tile; the event carries no road interval).

## 3. Data cells (`src/game/data/spSkills.ts`, the design appendix's names)

Each row also has `id, unit, rank, cooldown, nameKey, built`.

* `shove` (viking, rank 3): `cooldown 12 (the owner's value of 2026-10-14; it started at 18), push 160, slide 0.35, thump 0.25, eliteFactor 0.35, bossFactor 0.2, window 3, minTravelled 30`
* `charge` (tiger, rank 5): `cooldown 34, dist 1100, speed 1000, leap 0.3, power 1.2, ignoreDefence true, weights [1,2,3], minWeight 3`
* `lap` (star archer, rank 5): `cooldown 26 (the owner's value of 2026-10-14; it started at 34), speed 2000, extra 100, power 0.8, pool 12.8, burst {pct 0.25, radius 90}, minEnemies 4`
* `wanted` (gunner, rank 4): `cooldown 24, bite 0.06, pool 0.12, ignoreCap true, ignoreDefence true, small 0.2, hold 'nextWaveSpecial'`
* gauge: `SP_START_NEW / MERGE / RESTORE` 0.5 each (three constants so each can be flipped alone, a test holds them apart), `SP_RECHECK` 0.2, `SP_RANK5_GAP` 1.2.
* **Cooldown is each row's own cell** (decision 1): the gauge reads `UnitDef.spSkill.cooldown`, which `data/units.ts` takes from the row. `SP_COOLDOWN {3:18, 4:24, 5:34}` is only the record of where the rows started and nothing reads it. A test holds every row to `0 < cooldown <= 34` (the owner's ceiling) and checks that the gauge and the definition follow a row's number.

## 4. The gauge and the switch

* Fills by simulation time only: `TICK / cooldown` a tick, standing still while the cat is `blocked` (a wet or zap cell, then the 0.3 s of recovery), like the attack gauge. Attack speed, weakening, special cells and toys do not touch it. A choice popup stops the simulation and so the gauge.
* Starts at 50% for every new cat (summon, 3-pick, twin, tunnel, gift, merge result, restored cat); moving and swapping keep it; a molt or an awakening keeps the ratio when both the old and the new cat have a skill; selling ends it. In a battle with `spOn` false every gauge stays 0.
* A full gauge casts in the tick it fills if the skill's `ready` says yes, and goes back to 0. Otherwise it waits full and asks again every 0.2 s (not every tick). Several full gauges of one tick cast in cell order; rank 5 casts are spaced at least 1.2 s apart (the later cat waits full). If `cast` returns false the cast is taken back: gauge 1, next look in 0.2 s, the rank 5 gap and the first-cast flag given back.
* **The switch**: `skillsOn()` is called by `Profile.prepareRun` (chapter, daily, endless, gold dungeon, tutorial) and `runFromQuery` (the debug battle route). `BattleScene.restart()` copies the old init (keeps `sp`), `retry` goes through `prepareRun` (decides again), a resumed run keeps its own: a save from before the skills has no `sp`, and the simulation reads a missing field as "on", so `resumeInit()` (used by `offerContinue`) sets `sp: false` on such an init, and `createBattle(init, snapshot)` takes the caller's `sp` when the snapshot's own init has none. With the constant false and no parameter every battle gets `sp: false`: exactly today's game.
* **Balance report**: `SIM_SP=0|1`; without the variable it plays what the app plays (`SKILLS_ON`, off), any other value stops the report, and every table title ends with `[skills on]` or `[skills off]` (`tests/simReportKit.ts`: `spFromEnv`, `printTable`).

## 5. The four skills as built (rules in the spec; this is the short form)

* **Viking, Shield Shove** (`sim/sp/shove.ts`, spec 22.6). Targets: enemies inside the viking's own range with `travelled >= 30` outside their window. Each slides back `push` x factor over 0.35 s, **carried, not walking** (also stunned or frozen), clamped so `travelled` never goes below 0. Thump 0.25 D through `damageEnemy` to each pushed enemy only. Window 3 s. Two vikings in one tick: the second finds the first's enemies in their window. `ready` = at least one pushable enemy in range. Balloons are ordinary enemies. While any slide goes on the cats' "nothing in range" cache is cleared every tick (`wakeUnits`, spec 22.5): without it a shoved-in enemy was seen up to 0.3 s late.
* **Tiger, The Tiger Has Arrived!** (`sim/sp/charge.ts`, spec 22.8.1). Chooses the heaviest 1,100 px stretch of road (normal 1, elite 2, boss 3; ready at weight 3; laser dot first, then weight, then skill order of the front enemy; circular, across the seam), leaps for 0.3 s (18 ticks), lands at the front enemy's spot and runs against the flow at 1,000 px/s, 1.2 D once per enemy through armour and ward (`ignoreDefence`), damage cap still applies, no crit. **The first tick of the run also covers 63 px in front of the spot** (`LAND_REACH`; enemies kept walking during the leap). The tile keeps attacking all the while (decision 3).
* **Star archer, Starlight Lap** (`sim/sp/lap.ts`, spec 22.8.2). Starts at the road point nearest its tile (`nearestPathPos`), runs one lap + 100 px with the flow at 2,000 px/s, one star of 0.8 D per enemy. n = enemies on the field at the cast; above 16 each star is 12.8/n D, the pool is 12.8 D in all. **The pool is reserved for the enemies that stood on the field at the cast**: a late enemy gets a star only while the pool still covers a share for every original that is alive and not yet touched (so above 16 the late ones are passed without a star; below, they take the spare). A felled enemy bursts like the passive's (25% D, radius 90 x area bonus, once, no chain). Ready at 4 enemies or one elite or boss.
* **Gunner, Wanted: One Shot!** (`sim/sp/wanted.ts`, spec 22.8.3). Bite = 6% of an elite's or boss's MAXIMUM health, outside the damage allowance (`dealDamage`, no armour, no vulnerability), 12% in all per target for every gunner together (`SimEnemy.bountyTaken`), a bite that reaches the last health kills. With no target with a pool in reach: the small shot, 20% of the sturdiest plain enemy's CURRENT health through `damageEnemy` with armour and ward skipped. **Holding fire** (gauge stays full): in the wave before an elite or boss wave, and in an elite or boss wave until the target has come out; same in every mode. **Waiting** (a choice of the build, one condition in `choose`): a gunner does not fire the small shot while an elite or boss with a pool is alive but out of ITS reach.
* **The running body** (`sim/sp/run.ts`, spec "달리는 몸"): `Sim.runners`, stepped first in the skills' pass (a cast of tick T moves from T+1, the tiger from T+19). Each tick sweeps the interval the head covered, widened by the enemy's radius, so nothing slips through at 17 or 33 px a tick; the seam of the road is no special case; one touch per enemy per run. Runs belong to the field, not the wave: they go on through wave and stage changes, stop with a choice popup, freeze at a defeat and go on after a revive, are not saved. A cast is spent even if everything in its stretch dies during the leap.

## 6. For the view workflow

**Draw from events and unit state only; never from the simulation's internals.**

* **Gate everything on `BattleApi.spOn`.** With it false no ring, no bubble, no cut-in; every `sp` is 0 then anyway.
* **The ring** reads `UnitState.sp` and `UnitDef.spSkill`. A full gauge may be waiting (`sp >= 1`) for its condition; a gunner with `sp >= 1` that has not cast is the "holstered" look (the rule is `holdingFire(sim)` in `sim/sp/wanted.ts`; its facts are public except "has the target come out", which is `boss !== null` for a living one). "Blocked" is `UnitState.blocked`. The order in which cats became full (for the limit of four pulsing rings) is not exposed: the view must track it.
* **Name bubble and cut-in** on `spCast.first` (rank 5: the cut-in). `first` is once per skill per run, so these two must be exempt from the one-effect-per-0.25 s stage rule (decision 13) or the only bubble can be dropped.
* **Stage rule** (3x speed): one cast effect per 0.25 s of real time, the rest show the ring flash only. A tiger on a packed road touches about one enemy a tick: merge the stomp effects.
* **Tiger**: leap `x, y` -> `landX, landY` over `leap`, the 1.5x body from `startPath` against the flow, the return walk after `spRunEnd` (view only). **Place paw prints and stomp effects from `spRunHit.x/y`, not from `head`**: the first tick of the run also touches enemies up to 63 px on the far side of the head from where it runs (the ones that walked on during the leap), with `head` about 16.7 px.
* **Arrow**: comes down at `startX/startY`, runs with the flow along `pathPoint`; **a star per `spRunHit`, never from the arrow's place** (late enemies are passed silently when the pool is kept for the originals); a star burst per `spRunBurst` (`radius`, `points`).
* **Gunner**: poster on `data.targetUid` at `data.x/y`, the cork flies from the cat's tile. The bite is applied at the cast tick, so the boss bar drops at once: to show poster, cork, then bite, hold the bar at `enemy.hp + bite.amount` for about 0.4 s (`bite` has no `absorbed`; it only matters if a boss ever gets a shield). "-6%" is `bite.share` as a rounded percent, two eggs by `bite.taken` (0.06 one, 0.12 two), the stamp by `data.closed`. The small shot: a hand-sized poster and the usual `hit` number, no eggs. A `bite` arrives after `enemyDie` when it kills and never produces a `hit`.
* **Shove**: a sliding enemy changes `x, y` every tick while still facing forward; afterimage at `pushed[i].x/y`, streaks toward `toX/toY`.
* **Clean up on `victory` / `defeat` / battle end**: a running body (tiger, arrow) is cut off without a `spRunEnd` when the battle ends first.
* **Sold cats**: a cat that was sold can still own a run: `spRunEnd.unit` and `enemyDie.killer` may be `removed` units.
* Time every picture by `BattleApi.time`, so it holds still under a popup and speeds up with the game.

## 7. Decisions I took where the brief left a choice (each is one constant or one line; say which to turn)

1. **Every new cat starts at 50%** (not only merge results): three constants so each can be flipped alone.
2. **A blocked cat does not cast** (a full gauge waits for the end of the hazard and the 0.3 s), like a full attack gauge.
3. **The shove's thump only hits what it pushes.**
4. **A save from before the skills plays on without them** (`resumeInit`, section 4).
5. The cast event is a union on `skill` with the skill's data under `data`, so a new skill cannot clash with the common fields.
6. **Tiger**: windows anchored at an enemy as their front looking back round the loop; a straggler 1,100 px behind a pack can pull the choice to a window anchored one enemy back (heavier by one); contact is the enemy's radius around the swept interval, no body length; order of touches is the order the body meets them; damage numbers are fixed at the cast.
7. **Lap**: n is counted at the cast; the pool is reserved for those enemies (review fix); the burst does not count against the pool; a victim the burst hurts but does not kill is still touched by the arrow later.
8. **Gunner small shot** goes through `damageEnemy`, so the vulnerability product still applies; **waiting** for a target that is out of reach (one condition in `choose`, delete it to fire the small shot instead); the last wave of a finite run is never held (a defensive guard: every finite mode ends on an elite or boss wave, which returns before it).
9. A tiger or lap cast is spent even if nothing is touched; no refund.
10. `nearestPathPos` ties (the middle tile is as near the top as the bottom): top, right, bottom, left.

## 8. How a step-2 skill is added

1. `src/game/sim/sp/<name>.ts`: export a handler `{ ready(s, u): boolean, cast(s, u): boolean }` (contract in `sim/sp/types.ts`). `ready` is asked the tick the gauge fills and then every 0.2 s while it waits; it must not change anything. `cast` does the bookkeeping, calls `announceCast(s, u, { skill, data }, x?, y?)` (so the view starts before the numbers), then deals damage through `damageEnemy` (no crit; no `Math.random`; the `combat` stream only where the design says). Return false only if there was nothing to do after all.
2. `sim/sp/registry.ts`: one import and one entry.
3. `data/spSkills.ts`: fill the row (the type is in `SpRows`), set `built: true` last (that puts `spSkill` on the cat and makes the pass call the handler). Its cooldown is its own cell, at most 34.
4. `api.ts`: a member of `SpPayload` and its data type; the name strings `sp.<id>.name` in both languages (only the four built names are in `stringsGame.ts`), then `npm run font`.
5. Tests: `lend()` in `tests/sim.spSkills.test.ts` gives a cat a skill and an idle handler for one test; `fingerprintRun` (`tests/spHelpers.ts`) for "sp off = unchanged" (the 17 golden runs hold for anything added).
6. Hooks ready for it: `collectInReach` / `inReach` / `skillBefore` / `sortSkillOrder` (reach and order), `damageEnemy(..., ignoreDefence)`, `dealDamage(..., announce)`, `later(s, delay, kind, fields)` with `registerLater` (kinds `cut | meteor | capsule | probe`, run after the cats attacked and before the skills' pass; the capsule's toy pick is to be deferred to the end of the tick, design 3.12.1), `shoveEnemy`, `launchRun`, `areaOf` (exported from `sim/combat.ts`). `SimUnit.spCheckAt`, `Sim.spSeen/spFirst/spRank5Until` belong to the pass.

## 9. Tests

* `tests/sim.spSkills.test.ts` (69): the data (rows, cooldowns in their own cells, names in both languages, built flags against handlers), every gauge rule, the cast, skill order and reach, the delayed list, the damage hooks, the shove in full (including the wake-up of sleeping cats and the slide clamp against a black hole), **sp off = unchanged** (17 seeded bot runs against fingerprints taken on the tree BEFORE the skills existed: 8 chapter runs and 9 in the daily, endless, gold dungeon, tutorial and stake 5 modes, about 250,000 events), determinism.
* `tests/sim.spRun.test.ts` (53): the running body, the tiger, the lap (including the reserved pool), spawn / die / split / push mid-run, two runs at once, a defeat and revive mid-run, popups, 1x / 2x / 3x.
* `tests/sim.spWanted.test.ts` (44), `tests/sim.spStart.test.ts` (4), `tests/app.skillSwitch.test.ts` (10), and three tests in `tests/screens.shell.flow.test.ts` (resume keeps the setting a run began with).
* The golden fingerprints were taken with `git archive` of the commit before the skill work and `fingerprintRun` with the same init; `sp: false` on the working tree gives the same strings in all 17 runs, and with skills on 7 of the 8 chapter runs (93 casts) and 6 of the 9 others differ (so the comparison does discriminate).
* `tests/sim.perf.test.ts` and 5-second timeouts fail under CPU load (other processes): rerun the file alone before believing a failure. The skills' pass adds about 5% to a headless run (31.9 ms against 30.5 ms for a full 24-wave run; it was 36 ms before the pass walked only the skill cats).
* **Existing tests changed in the whole work: none weakened.** Tracked files touched: `tests/screens.shell.flow.test.ts` (three tests added, nothing edited), `tests/simReportKit.ts` / `tests/simreport.sim.ts` / `tests/simreport.dungeon.sim.ts` (report tooling, not tests: `SIM_SP`, the table title). Edits inside the new files after another agent had written them: the "gauge 0 for a cat without a skill" example in `sim.spSkills.test.ts` is `w_samurai` (the tiger got a skill), the fake handler's `charge` payload literal got the run fields, and the cooldown rows no longer pin the rank table.

## 10. The review that closed this part (spec 22.9 has the table)

Fixed, each with a test: a shoved enemy outran the cats' scan cache (up to 0.3 s late: `wakeUnits` while a slide goes on); the lap's late spawns took the share of originals (the pool is reserved); the test that pinned every cooldown to the rank table; `sp` stayed 0.5 on cats of a battle without skills (now 0); the skill pass cost +19% (now +5%); the golden test covered chapters only; `npm run sim` silently played with skills on (now the app's setting, with a marker in each title); the `resumeInit` wiring, the slide clamp, the revive of a running body, the cast-returned-false recovery, the three start constants and the four names had no test; the lap copied the passive's area formula (`areaOf` exported); `holdingFire` allocated a script object on every look in endless and the gold dungeon (asked once per wave now).

Looked at and **left as the design or the build has it**, for the owner:
* **Gunner "waiting"** differs from design rule (b): while an elite or boss with a pool is out of this gunner's reach it keeps the small shot back. On a board where gunner A already took both bites, gunner B that cannot reach the boss sits full up to about 24 s while escorts walk by. It lowers the small shot's value in boss waves. One condition to remove (`waiting` in `choose`).
* **Tiger and lap on a lone elite or boss**: a boss alone weighs 3 and an elite plus one cucumber weighs 3, so a full gauge fires the moment the target walks out, at one enemy whose damage cap eats most of the hit (the builder's six bot games: 66 tiger casts touched 147 enemies, 48 lap casts 100; about 40% of the casts left with one or two enemies on the field). And a tiger cast is spent even if its stretch empties during the leap. Both follow the design text and decision 7 forbids compensating elsewhere; if casts should go to a crowd, the lever is the readiness condition (`minEnemies` ordinary enemies besides the elite or boss; refund the gauge when the run touches nothing).
* **`?sp=1` works in every mode, including the daily challenge and endless mode whose results feed the weekly score** (`profile.submitScore`): decision 9 says it overrides the constant without the debug flag. Settle this before `SKILLS_ON` flips, or before the public build is linked with `?sp=1`.
* No bot comparison of win rate with skills on against off was run (`SIM_SP=1` against `SIM_SP=0` works; no numbers were produced and nothing was retuned).

## 11. Left

* **View** (the next workflow): everything in section 6, built from the events above. Not tried on a phone or looked at: this part is numbers and event order.
* **Step 2**: the other eight skills (samurai, ninja, storm cat, frost queen, cosmo cat, bard, alchemist, lucky cat), their sounds and the effects budget at 3x speed. **Step 3**: the selection sheet, cat screen, summon tooltip, a tutorial lesson, the guide, texts in both languages, the font. **Step 4**: the balance report (skills on against off, then a cooldown per skill for the owner to settle), phone performance, reduced motion, the rules specification and the patch notes.
* `SKILLS_ON` flips only when all twelve are in.
