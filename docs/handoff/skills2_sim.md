# Hand-off: skills, step 2, simulation side (the eight skills as built and reviewed)

Brief: `docs/qa/directive_2026-10-13_skills_build.md` (decisions 1 to 24, "Step 2") and `docs/design_skills_v2.md` (v2.3). The frame, the cast, the public shapes of the first four skills and the hooks come from step 1: `docs/handoff/skills1_sim.md` (section 8 "How a step-2 skill is added" is still the recipe). Rules as built: `docs/명세_전투규칙.md` **section 22** (22.8.4 to 22.8.11 are the eight skills of this step, 22.10 is what the review of step 2 changed). **Nothing here is view work**: no scene, no sound, no browser, no dev server. Nothing is committed. `SKILLS_ON` is `false`, `SIM_VERSION` is 3, nothing new is saved, no new random stream, no `Math.random`.

This is the document the view workflow builds eight scenes from. Section 1 is every event and every public key in one place, section 2 says where each skill's pieces are, sections 6.1 to 6.8 are the skills one by one (what the scene needs, the choices the builders took), section 8 is what the owner has to decide, section 9 is what the review changed. It replaces the five notes the eight skill agents appended (one per pair of skills) and the ground-work note that stood at the top.

## 0. State

| | |
|---|---|
| Built | all twelve skills. The eight of this step: samurai `cut`, ninja `clones`, storm cat `cloud`, frost queen `knock`, cosmo cat `meteor`, bard `jam`, alchemist `fish`, lucky cat `capsule`. All twelve rows of `SP_ROWS` say `built: true`, all twelve cats carry `spSkill`, all twelve handlers are in `sim/sp/registry.ts` |
| Switch | unchanged: `SKILLS_ON = false` (`src/core/skillSwitch.ts`), `?sp=1` / `?sp=0` override it, `BattleInit.sp` absent = on. With `sp: false` the simulation is exactly the old one: the 17 golden runs of `tests/sim.spSkills.test.ts` pass untouched (and a review probe played 179 more runs, 5 chapters, endless, gold dungeon, daily with rules, tutorial, stakes, revive, call-next-wave, wave-start resume, on `HEAD` and on this tree with `sp: false`: every event hash, end state and random-stream state identical) |
| Checks | `npx tsc --noEmit -p .` prints nothing. `npx vitest run`: **191 files / 4,461 tests green** (the baseline before the skills was 167 / 3,564; the end of step 1 was 179 / 3,964; the builders of step 2 left 190 / 4,435; the review added one file, `tests/sim.spAll.test.ts`, and 26 tests in all, 9 of them in that file). `tests/sim.perf.test.ts` and 5-second timeouts fail under CPU load: rerun the file alone before believing a failure. `npm run font` was run and changes nothing (no game text was added or changed by the review; the eight names were added by the ground work, new subset `public/fonts/game-kr.f4940b19.woff2`) |
| Not built | every picture, sound and cut-in of the eight skills (the view workflow); the texts beyond the eight names (step 3); the balance report with skills on against off and the cooldown proposal per skill (step 4) |
| Left for the owner | section 8 |

## 1. Every event and every public key, in one place

Times are `BattleApi.time` (simulation seconds, one tick = 1/60 s). **Draw from events and unit / enemy state only; time every picture by `BattleApi.time`** so it stands still under a popup and runs 2x / 3x with the game. Gate everything on `BattleApi.spOn`. A cast's own `x, y` (in `SpCastEvent`) is the cat's tile centre unless the skill says otherwise. **A skill's `spCast` is emitted before the `hit`s of its own damage** (the scene starts, the numbers pop up on it); the exceptions are written in the table.

### 1.1 `spCast`: the `data` of each skill (`src/game/api.ts`)

| `skill` | `data` | Notes |
|---|---|---|
| `cut` | `SpCutData` `{ cutId, anchorUid, anchorPath, fromPath, toPath, at, fuse, marks: [{ uid, x, y }] }` | `cutId` counts up from 1 in a battle and names the cast in its `cutOpen`. The afterimage crosses from `fromPath` to `toPath` (450 px along the flow; can wrap the seam). `marks`: anchor first, then by distance to the anchor, at most 10 |
| `clones` | `SpClonesData` `{ seats: [{ cell, stacked, x, y }], throws, arrive, at, life }` | `UnitState.clone` is already filled when the event arrives. If the ninja still had clones their `cloneEnd` ('replaced') came first |
| `cloud` | `SpCloudData` `{ cloudId, hostUid, hostX, hostY, at, life, every, bolts, splashRadius, hopRadius }` | `cloudId` counts up from 1; every follow-up carries it |
| `knock` | `SpKnockData` `{ impactX, impactY, radius, shards: [{ uid, x, y, frozen }] }` | everything has happened already in this tick (section 6.4) |
| `meteor` | `SpMeteorData` `{ meteorId, impactX, impactY, onLaser, at, warn, innerRadius, outerRadius, outerDelay, craterRadius, craterLife }` | `meteorId` counts up from 1 and names the meteor in `meteorLand` (both rings) and `craterEnd`. The radii are the row's times the cat's area bonuses |
| `jam` | `SpJamData` `{ notes: [{ uid, cell, kind: 'gauge' \| 'attack', before, after }], fill }` | **the gauges and attack gauges are already written when the event arrives** (`UnitState.sp` shows `after`; an attack-note cat's `charge` is above 1) |
| `fish` | `SpFishData` `{ big: { uid, x, y, boss, seconds, lock, cats } \| null, small: [{ uid, x, y }] }` | the small enemies are already removed when the event arrives; the big one is already a fish (its `status` event follows at once) |
| `capsule` | `SpCapsuleData` `{ kind, inner, at, openDelay, moreDelay, refund }` | the kind is rolled at the cast; colour and mark are `SP_ROWS.capsule.marks[kind]`; for a fish capsule `UnitState.sp` is already 0.5 |

### 1.2 Follow-up events (new in step 2)

| Event | Skill | Payload | Fires |
|---|---|---|---|
| `cutOpen` | cut | `{ cutId, unit, at, lines: [{ uid, kind: 'cut' \| 'moved' \| 'lost', to, x, y, toX, toY }] }` | cast + 72 ticks (1.2 s), BEFORE the cuts' `hit`s. `lines` is in the order of `SpCutData.marks`. `at` = the cast's time, `cutId` = the cast's. A wave pause (`prep`) holds it until the first tick of the next wave |
| `cloneThrow` | clones | `{ unit, index, cell, stacked, x, y, targetUid, left, projectile }` | in the tick of a ninja's volley (from cast + 0.3 s on), after the ninja's own `attack` events. No `attack` for a clone. `projectile.ghost` is true: read it at the event (objects are pooled) |
| `cloneStep` | clones | `{ unit, index, from, to, x, y }` | a cat took the tile a clone stood on (or the ninja was dropped onto it): the clone hops to the ninja's tile and stays stacked. Before the board event (`summon`, `move`) |
| `cloneEnd` | clones | `{ unit, index, cell, x, y, reason }` | `reason` `done` `timeout` `replaced` `merged` `sold` `molted` `gone` `stage` `end`. `cell` is -1 for a stacked clone, `x, y` the centre of the tile the puff goes on. Exactly one per clone; `unit` may be `removed` |
| `cloudBolt` | cloud | `{ cloudId, unit, hostUid, x, y, index, bolts, points }` | cast + n x 24 ticks, n = 1..8, BEFORE the bolt's `hit`s. `points` = the OTHER enemies the splash reaches |
| `cloudHop` | cloud | `{ cloudId, fromUid, fromX, fromY, toUid, toX, toY }` | the host fell (or was chased off or taken by a flask): in the skill pass of the same tick, or inside the bolt that felled it |
| `cloudEnd` | cloud | `{ cloudId, reason: 'time' \| 'lost', hostUid, x, y, bolts }` | `time`: the tick of the 8th bolt, after its `hit`s; `lost`: the host fell with nobody within 150 px. Not sent when victory or defeat comes first |
| `meteorLand` | meteor | `{ meteorId, unit, ring: 'inner' \| 'outer', x, y, radius, points }` | `inner` at cast + 60 ticks (flash, shake), `outer` 15 ticks later; BEFORE its ring's `hit`s. `points` = the enemies the ring touches at that moment |
| `craterEnd` | meteor | `{ meteorId, unit, x, y, radius }` | 240 ticks (4 s) after the inner landing: the scorch fades. Not sent when victory or defeat comes first |
| `status` | fish | `{ enemy, kind: 'fish', duration }` | the big flask took: right after `spCast`, before the small ones' events. (The `status` event already existed; `'fish'` is a new kind) |
| `fishEnd` | fish | `{ enemy, lock }` | the fish wore off (`EnemyState.fish` is false already), `seconds` after the cast give or take a tick; the enemy is locked `lock` more seconds. Not sent if it dies as a fish |
| `capsuleOpen` | capsule | `{ kind, small, inner, x, y, result, cell, origin, purr }` | cast + 72 ticks, and the small capsule of a `more` capsule 60 ticks later. `result` `fish purr seat promote more toy awaken fallback`. BEFORE the prize events, all in the same tick (the toy pick at the end of it) |
| `promote` | capsule | `{ from, result, cell }` | a cat grew one rank where it stands (partner capsule on a full board): `from` is `removed`, nothing consumed, `merges` does not rise |

Not new but changed or newly used by the eight skills:

| Event | What |
|---|---|
| `enemyDie` | gains the optional key `transmuted: true`, present ONLY for an alchemist's small flask (taken off the field: no `hit` before it, no split, no burst; `fish` is the doubled reward, `killer` the alchemist, `purr` 0). The key is absent from every other death |
| `fish` / `purr` | reason `'skill'` for the lucky cat's prize (fish capsule, purr capsule, every `fallback`); reason `'kill'` with the position of the enemy for a small flask's doubled reward |
| `summon` | `source: 'skill'` for the partner capsule's twin (no toss, no wait; the fish counter flies from where it was earned) |
| `awaken` | gains `free: true` ONLY for the guardian capsule (no purr spent: use the short cut-in). Absent from the player's own awakenings |
| `relicOffer` | gains `source: 'capsule'` for the toy pick the lucky cat opens in the middle of a wave; `BattleApi.pending.source` says the same (`PendingChoice` relic: `source?: 'stage' \| 'capsule'`). Both keys are absent for the stage's pick |

Where the eight skills add NO event of their own: knock (everything is in its cast), jam (the notes are in its cast; an attack note's attack is the cat's ordinary `attack` in the NEXT tick).

### 1.3 Public state the scenes read

| Key | Meaning |
|---|---|
| `UnitState.clone: CloneState[]` | on every cat (empty for all but a ninja with clones): `{ index, cell, left, readyAt, until }`. `cell` -1 = stacked on the ninja's tile (moves with the ninja); `left` = throws left; `readyAt` = cast + 0.3 s (before it the clone is still leaping and follows no volley); `until` = cast + 8 s |
| `ProjectileState.ghost?: boolean` | true for a clone's shuriken (pale blue, no extra swing) |
| `EnemyState.fish: boolean` and `StatusKind 'fish'` | the big flask's fish. **Not a slow**: `EnemyState.slow` stays 0, so no slow sticker. There is no remaining-time field: time the ring from the `status` event's duration and the `fishEnd` |
| `UnitState.sp` | for jam: see 1.1. For a fish capsule: 0.5 from the cast tick on |
| `BattleApi.pending.source` | see `relicOffer` above |

## 2. Where each skill's pieces are

| id | cat (rank) | cooldown | row in `data/spSkills.ts` | handler (`sim/sp/`) | delayed kind | tests |
|---|---|---|---|---|---|---|
| `cut` | samurai `w_samurai` (4) | 24 | `SP_ROWS.cut` | `cut.ts` | `cut` | `tests/sim.spCut.test.ts` (47) |
| `clones` | ninja `r_ninja` (3) | 18 | `SP_ROWS.clones` | `clones.ts` | none | `sim.spClones.test.ts` (61) |
| `cloud` | storm cat `m_storm` (3) | 18 | `SP_ROWS.cloud` | `cloud.ts` | none (a list `Sim.clouds`) | `sim.spCloud.test.ts` (47) |
| `knock` | frost queen `m_frost` (4) | 24 | `SP_ROWS.knock` | `knock.ts` | none | `sim.spKnock.test.ts` (45) |
| `meteor` | cosmo cat `m_cosmo` (5) | 34 | `SP_ROWS.meteor` | `meteor.ts` | `meteor` | `sim.spMeteor.test.ts` (57) |
| `jam` | bard `t_bard` (3) | 18 | `SP_ROWS.jam` | `jam.ts` | none | `sim.spJam.test.ts` (31) |
| `fish` | alchemist `t_alch` (4) | 24 | `SP_ROWS.fish` | `fish.ts` | none | `sim.spFish.test.ts` (40) |
| `capsule` | lucky cat `t_lucky` (5) | 34 | `SP_ROWS.capsule` | `capsule.ts` | `capsule` | `sim.spCapsule.test.ts` (62), `sim.spCapsulePartner.test.ts` (39), `sim.spCapsuleToy.test.ts` (30), `tests/capsuleHelpers.ts` |
| (ground) | all eight | | all twelve rows | `near.ts` (shared searches) | | `sim.spGround.test.ts` (28) |
| (all together) | all twelve | | | | | `sim.spAll.test.ts` (9): a board with all twelve cats in every mode, played twice, and the pairs fish + cloud, fish + cut |

Names (Korean / English, `data/stringsGame.ts`): 이미 베었다냥 / Already Cut, 깜짝 분신술 / Surprise Clones, 졸졸 먹구름 / Tagalong Cloud, 톡, 와장창! / Knock It Off!, 운석 쿵! / Meteor Drop, 다 같이 합주! / Jam Session!, 생선으로 변해라! / Turn Into Fish!, 복 뽑기 한 판! / Lucky Capsule!

Cooldowns are each row's own cell, never above 34 (a test holds it); 18 / 24 / 34 are only the starting values (decision 19).

## 3. Data cells (`src/game/data/spSkills.ts`, the design appendix's names)

A cell marked (text) is not in the appendix but the design's prose gives its number.

* `cut` (20: the owner's value of 2026-10-14; it started at 24): `half 225, max 10, fuse 1.2, power 1.4, reaim 150`, (text, 3.2) `minEnemies 2`.
* `clones` (18): `clones 2, throws 4, arrive 0.3, maxLife 8, copyTargetsPerk false, spread true, readyMinEnemies 5, seats 'nearestEmpty', stackOffset {x 16, y -6, scale 0.92, alpha 0.45, standingAlpha 0.55}, figureCap 10, numbers 'ninjaStats', reachFrom 'cloneTile'`. `stackOffset` and `figureCap` are for the picture only. The fade per throw (55 / 47 / 39 / 31 %), the puff and the leaf are the view's.
* `cloud` (18): `life 3.2, every 0.4, host 0.3, splash {power 0.15, radius 60}, hop 150, cap 6`.
* `knock` (20: the owner's value of 2026-10-14; it started at 24): `radius 260, knot 130, slowed 3.0, frozen 5.0, minChilled 2`.
* `meteor` (34): `warn 1.0, inner {radius 90, power 1.2}, outer {radius 200, power 0.5, delay 0.25}, crater {radius 100, life 4, burn 0.3}, cluster 150, minWeight 3`, (text, 3.9) `crater.every 0.5` and `weights [1, 2, 3]`.
* `jam` (18): `targets 4, fill 0.2, skip 0.8, leftoverCharge 1`.
* `fish` (24): `flasks 5, big 1, smallTargets {withBig 4, withoutBig 5}, maxHp 0.6, bounty 2, fishSpeed 0.25, fishTime {boss 4, elite 2.5}, fishLock {boss 8, elite 5}, reachMin 3, minTargets 2, inReachOnly true`.
* `capsule` (34; **`sharedGauge true`**, the owner's rule of 2026-10-14: when one lucky cat casts, every other lucky cat on the board takes its gauge, 0 or the fish capsule's 0.5, so several lucky cats give ONE stream of capsules and a second lucky cat's ring empties together with the caster's): `weights {fish 30, purr 25, partner 25, more 10, toy 7, guardian 3}` (adds up to 100; the object's key order is the order of the roll, `SP_CAPSULE_KINDS`, cumulative 30 / 55 / 80 / 90 / 97 / 100), `moreWeights {partner 25, toy 7, guardian 3}`, `openDelay 1.2, moreDelay 1.0, fish 1` (summon prices), `purr 2`, **`fishRefund 0.5`** (decision 17; only the fish kind refunds; 0 <= fishRefund < 1), `fallbackPurr {partner 3, toy 5, guardian 10}`, `partnerRanks {min 0, max 2}`, `partnerOrder ['noPartner', 'fillsEmptyRung', 'higherRank', 'lowerCell']`, `partnerSafe true`, `seat 'nearestEmpty'`, `toyPick {options 'relicChoices', picks 1, reroll false, common false, floorRow 1, rowKnob 'act', stream 'combat', opened 'tickEnd', resumePhase 'wave', dragReleased true}`, `guardianPick {safe true, order ['stepDesc', 'classOrder', 'lowerCell'], free true, eventFree true}`, `tutorial {toyPurr 5, guardianPurr 10}`, `marks` (colour and mark per kind: pink/none, pink/heart, sky/paws, pink/smallCapsule, gold/star, rainbow/bands). Knobs the design describes and that are NOT switched on: `fullBoardFish false` (+ `fullBoardFishPurr 1`), `fullBoardPartnerFloor false`, `oneAtATime false`, `rollsFrom 'combat'` (`'hash'` is built and tested). `bardTargetsCapsule true` is ON (decision 23: the bard may fill the lucky cat's gauge).

## 4. Shared code the eight skills touch

Each was the smallest edit; the four step-1 skills needed no hook (decision 24).

* `game/api.ts`: the eight payload types and events (above), `SummonSource` / `CurrencyReason` gain `'skill'`, `StatusKind` gains `'fish'`, `EnemyState.fish`, `UnitState.clone`, `ProjectileState.ghost`, `PendingChoice` relic `source`, `awaken.free`, `relicOffer.source`, `enemyDie.transmuted`.
* `sim/enemies.ts`: the walking factor `(e.fish ? fishSpeed : 1)` (times exactly 1 for every other enemy: changes no bit), `statusStep` ends the fish and sends `fishEnd`, `transmuteSpecial` (beside `applyStatus`), `transmuteEnemy` (beside `killEnemy`), the three fields on `spawnEnemy`.
* `sim/board.ts` (CRLF file: keep the line endings): `placeUnit` exported and calls `vacateSeat`; `cmdDrop` (move and merge), `cmdSell`, `cmdMolt` end or step clones; `makeUnit` gives `clone: []`; `awakenable` / `awakenUnit` split out of `cmdAwaken` / `awakenCheck`; new `promoteUnit`.
* `sim/combat.ts`: `launch` exported and takes the tile and a `ghost` flag; `fireMulti` ends with `followVolley` for a ninja that has clones.
* `sim/flow.ts`: `rollRelicOffer` (capsule variant), `openRelicOffer` sets `source: 'stage'`, `openCapsuleToy`, `cmdPickRelic` capsule branch, `cmdRerollRelics` refuses a capsule pick, `gainRelic` hourglass line (an hourglass gained in an elite / boss fight adds its time to that fight), `completeAct` / `lose` end clones, `win` drops the capsules.
* `sim/sim.ts`: fields `cloners`, `clouds`, `cloudSeq`, `capsuleToys`, and the tick-end line `if (capsuleToys > 0 && phase === 'wave') openCapsuleToy(this)`. `sim/spSkills.ts`: `stepClones` and `stepClouds` at the top of the pass. `sim/types.ts`: `ST_FISH`, `SimEnemy.fishUntil / fishLockUntil`, `SimProjectile.ghost`.
* `view/director/palette.ts` (`STATUS_COLOR.fish`) and `view/director/combat.ts` (`KIND_INDEX.fish`): the only view lines, two entries the compiler asks for in tables keyed by `StatusKind`.
* The shared searches `sim/sp/near.ts` (pure): `cellDist2`, `emptyCellsNear`, `nearestEmpty`, `touches`, `inRangeOf`, `enemiesAround`, `nearestEnemyAround`, `heaviestCluster`. Tested in `tests/sim.spGround.test.ts`.

## 5. Facts from the code the scenes and the next skill agents need

* **Tick order** (`Sim.tick`): `updateIncome, updateRelics, updateLaser, updateHazards, updateBoss, updateEnemies, updateUnits` (the cats attack), `runLater` (the delayed list), `updateSpSkills` (the running bodies, then the clones' time-outs, then the clouds, then the gauges), `updateProjectiles, updateZones, updateSpecials, updateWave, updateAlarms`, and last the lucky cat's toy pick. In `prep` the tick returns early, so delayed items wait; in `choice` `step()` returns at once, so the clock and the list stand still.
* **The cast**: `tryCast` sets `u.sp = 0` and the rank 5 gap BEFORE `handler.cast`; a fish capsule writes `u.sp = fishRefund` inside its cast. If `cast` returns false the pass takes the cast back (gauge 1, next look in 0.2 s, gap and first-cast flag given back). `announceCast` once per cast.
* **Rank 5** skills (tiger, archer, meteor, capsule) are spaced at least 1.2 s; a deferred cast has no roll and no refund yet. Rank 3 and 4 skills have no gap, so **two samurai can cast in the same tick** (hence `cutId`).
* **Enemies are not pooled**: a dead enemy object stays dead and keeps its last `x, y, travelled`. `removeEnemy` swap-removes, so the array's order is not stable: sort by `skillBefore`.
* **Crits**: a skill's own damage never rolls one. The one thing that does is the ninja's clone shuriken, which is the ninja's own shuriken (design 3.4.3 no. 21; the directive's decision 2 now says so, and section 8 asks the owner to confirm). The `combat` random stream is drawn by the lucky cat's kind and toy rolls (and by every crit roll of every cat, as before).
* **The delayed list** items point at units and enemies directly; a runner checks `unit.removed` and `enemy.dead`. Nothing clears the list on `win`; a `lose` can be revived and the list runs on (like the running bodies, clouds, clones and capsules: **a defeat does not tear a scene down unless the battle really ends**).
* The laser's dot is `s.laser` (`active`, `x`, `y`, `radius`); `e.focused` is already inside `skillBefore`.

## 6. The skills one by one

### 6.1 `cut` (Already Cut, samurai, rank 4, 24 s)

Rules as built: spec 22.8.4. A white afterimage crosses 450 px of road around the anchor (the first enemy in skill order inside the samurai's own range); up to 10 enemies of that stretch are marked; 1.2 s later every line opens at once and cuts 1.4 D. Nothing happens to any enemy at the cast.

**What the scene needs**
* The afterimage: from the cat's tile along the road, `fromPath` -> `toPath` (450 px), using `pathPoint`, from `BattleApi.time` >= `at`. A thin line on each mark: follow the enemy by `uid` until it dies (`enemyDie` of that uid) or the lines open.
* "Sheath click" and the flash on `cutOpen`: each `lines[i]` with `kind !== 'lost'` flashes at `toX, toY`; a `moved` line should visibly jump from `x, y` to `toX, toY`; a `lost` line just goes out at `x, y`. The 1.2 s fuse is 0.4 s at 3x.
* **Pair a `cutOpen` with its cast by `cutId`** (not by `at`: two samurai can cast in one tick). Two casts can mark the same enemy (`uid`s repeat across casts): draw ONE line per enemy, and both cuts land (two numbers).
* The lines of a battle that ends first never open (no event): clean up on `victory` / `defeat`.

**Choices where the design left one**: only the anchor must be in the samurai's range, the rest of the stretch counts wherever it stands; the ready condition counts the stretch ("2 in the stretch") or an elite / boss in range; a dead enemy's line is moved when the lines OPEN (not when the enemy dies), to the nearest living enemy within 150 px of its last place that carries no line of any waiting cast and was not cut at the same instant (so a newborn can take it); D at the cast; ties in the distance to the anchor go to skill order; **two casts that mark the same enemy cut it twice** (design 4.5 says "one line", which is about drawing).

### 6.2 `clones` (Surprise Clones, ninja, rank 3, 18 s)

Rules as built: spec 22.8.5. Two pale clones stand on the two nearest empty tiles (stacked on the ninja when there are none), and each throws one shuriken along with each of the ninja's volleys, four times, at an enemy the volley is not on; then they go. A clone is NOT a unit: a few numbers on the ninja.

**What the view reads**
* `UnitState.clone` (section 1.3); `spCast` `seats[i]` is the clone with `index` i (the offset of a stacked clone's drawn body is the view's: `SP_ROWS.clones.stackOffset`, `figureCap`).
* `cloneThrow`: no `attack` event is sent for a clone, so do not swing the ninja and do not play its throw sound from `attack`. The shuriken layer paints from `BattleApi.projectiles`: `ghost === true` is all it needs to tint the star pale blue. In the same volley the order is the ninja's `attack` events, then the clones' `cloneThrow` in tile order (a stacked clone counts as the ninja's tile; ties by `index`).
* `cloneStep` fires before the event of the cat that took the tile. `cloneEnd` `done` is the clone's last throw (the leaf).
* A volley that no clone could follow makes no event; a clone with no target simply does not throw (its `left` stays).

**Choices**: no `cloneAt / cloneLeft / cloneUntil` triple on `SimUnit` (one public list holds the same facts plus `readyAt`); throw order inside a volley is by tile, ties by `index`; `ready` is five enemies in the ninja's own reach and nothing else; `launch` takes the clone's tile as an argument and `followVolley` receives `launch` as an argument (no import cycle); a clone's time-out is checked at the top of the pass, so it can still throw in the tick its time is up; the last stage's clones end with `stage`, then `victory`; `copyTargetsPerk` and `spread` are live knobs. The lucky cat's `promoteUnit` ends a ninja's clones with `gone` at once; the bard cannot hand a clone a note (a note given to the ninja pulls its gauge forward; a cast that finds old clones sends them away first); the alchemist's `reachCount` does not count clones (it reads `s.units`).

### 6.3 `cloud` (Tagalong Cloud, storm cat, rank 3, 18 s)

Rules as built: spec 22.8.6. A cloud sticks to the lead enemy in the cat's reach and follows it anywhere, dropping a bolt every 0.4 s for 3.2 s (8 bolts): 0.3 D on the host, 0.15 D on every other enemy within 60 px of it. If the host falls it hops to the nearest enemy within 150 px, or goes. No stun, no status.

**What the scene needs**
* The cloud's place between bolts: the host's public `EnemyState.x/y` (find it by `uid`); the host to follow is `hostUid` of the cast, then `toUid` of each `cloudHop`. The cloud flies from the hat to `hostX, hostY` after the cast (the first bolt is 0.4 s after the cast, so there is time for the flight).
* A bolt: draw from the cloud's place to `x, y` (where the host is now, possibly far outside every cat's range); a flash on each of `points`; the numbers come from the `hit`s. At most 6 clouds exist at once. Several clouds can sit on one host (bolts of different `cloudId` fall in the same tick, in cast order). A sold cat's cloud goes on (`cloudBolt.unit` may be `removed`).
* Order of one bolt: `cloudBolt` -> `hit` on the host -> (`enemyDie`, children `enemySpawn`) -> `hit` on each splash victim -> (`cloudHop` or `cloudEnd`). The splash list is taken BEFORE the damage, so the children of a balloon the bolt fells are not splashed.
* A host taken off the field by an alchemist's small flask counts as fallen: the cloud hops (or is `lost`) in the next skill pass.

**Choices**: `cap 6` = six clouds on the field at once (the seventh storm cat finds `ready` false and waits full; to turn it into "replace the oldest" change `ready` and `cast`); D fixed at the cast; host = first enemy in skill order inside the cat's range (no spreading rule between clouds; a "prefer an enemy without a cloud" rule is one line in `pickHost`); first bolt `every` after the cast, last at `life`; the hop uses the dead host's last place; hopping does not shift the beat.

### 6.4 `knock` (Knock It Off!, frost queen, rank 4, 24 s)

Rules as built: spec 22.8.7. The glass falls where the chilled enemies of one kind are thickest (the chilled enemy inside the queen's range with the most chilled enemies of its own kind within 130 px); a shard flies into every slowed (3 D) or frozen (5 D) enemy within 260 px of the impact and the chill is spent as it hits.

**No follow-up event.** Everything happens in the cast's own tick: `spCast`, then one `hit` per shard (in the shards' order; an `enemyDie` after the hit that kills). The survivors' public `slow` is 0 and `frozen` false from that tick on.
* The glass drops (0.5 s in the design) from the queen's tile to `impactX, impactY` and breaks; then a shard flies to each `shards[i]` (follow `uid` if the enemy moves). **The simulation has already dealt the damage and spent the chill when the picture starts**, so the view has to hold the ice sticker on each shard's enemy and queue its number until its shard lands (the `hit`s arrive right after `spCast`, in the same order). `frozen: true` shards: a bigger shard / number (5 D against 3 D); a boss has none. Enemies out of the queen's range but inside the 260 px circle are in `shards` too. Nothing is applied: no `status` event.

**Choices**: "same kind" = frozen with frozen, slowed with slowed (frozen and slowed = frozen); the knot is counted among the chilled enemies inside the queen's range, the shards reach every chilled enemy within 260 px; laser: if the first candidate in skill order is under the dot only the enemies under the dot can be the impact; `consumeChill` lives in `knock.ts` (clears `slow`, `slowUntil`, the bit; for a frozen enemy also `frozen`, `freezeUntil`, and `ccImmuneUntil = time + CC_IMMUNE_AFTER`; a slowed-only enemy gets no immunity); damage first, chill after, and only for survivors (a dead enemy keeps its status so the mages' burst can go off); the kinds are fixed for the whole shard list before the first damage.

### 6.5 `meteor` (Meteor Drop, cosmo cat, rank 5, 34 s)

Rules as built: spec 22.8.8. The red circle grows for 1 s where the enemies WILL be (their places 60 ticks from now, weighted 1 / 2 / 3), then the inner ring (90 px, 1.2 D) lands, the outer ring (200 px, 0.5 D) 0.25 s later, and a crater (100 px) burns for 4 s. No pull, no stun, no slow.

**What the scene needs**
* The warning from the cast event alone: the circle grows at `(impactX, impactY)` from `at` to `at + warn` (which radius it grows to is the scene's choice; both are in the payload). Nothing is dealt in the 60 ticks between the cast and the landing.
* `meteorLand` `inner` (flash, shake) at `at + warn`, `outer` (shock ring) 15 ticks later; `craterEnd` 240 ticks after the inner landing. **Everything is paired by `meteorId`** (two cosmo cats' meteors can be alive together and with the laser on both fall on the same dot). The crater is NOT a zone in `BattleApi.zones`; the scene draws the scorch from `meteorLand inner` to `craterEnd`, radius `craterRadius`.
* The burn: the enemies' public `burning` flag, the usual `status` events, `hit`s with `dot: 'burn'` (`unitId` null) every 0.5 s. No pull / stun / slow / shove: draw none. The meteor has no knowledge of the cat after the cast: a sold cat's meteor still lands (`unit.removed`).

**Choices**: ready = weight 3 within 150 px of the aim point (a boss alone, an elite with one plain enemy, three plain enemies; **a lone elite (2) is NOT enough**; to make it enough set `weights` to `[1, 3, 3]`: one cell); with the laser on it falls on the dot and the weight round the dot is what counts (an empty dot waits even if a crowd stands elsewhere: the player's one control); the three radii grow with `areaOf`; the prediction (`travelledAfter`) keeps the slow and haste an enemy has NOW for the whole warning, ends a stun or freeze on its tick, runs a shove's slide out, knows the nap blanket, the whirl, an enraged boss's current health and (review) **the alchemist's fish quarter speed until the fish wears off**; a black hole or any later event is not predicted; the crater's burn = `crater.burn` x D / the cat's attack interval a second (fixed at the cast), refreshed every 0.5 s for 0.75 s, credited to the cat, a magic status; **(review) a refresh never shortens another source's longer burn nor takes its credit** (a fire cat's burn keeps its end and its source until the crater's would end later); rings use where the enemies are when they land, not the predicted places; D at the cast.

### 6.6 `jam` (Jam Session!, bard, rank 3, 18 s)

Rules as built: spec 22.8.9. Four golden notes fly to four different cats at once. A note makes a skill cat's gauge jump by 20% (cats at 80% or more are passed over, lowest gauges first, ties to the lower tile); a note with no gauge to fill makes the nearest cat without a skill that can attack right now attack once at once.

**No follow-up event.** Everything is applied in the cast's own tick, **before** the `spCast` event is emitted (review): `UnitState.sp` of every cat that got a gauge note already shows `after`, and the `charge` of an attack-note cat is already above 1. The view holds the ring at `before` until the note lands. The attack-note cat's ordinary `attack` (and its `hit`s) come in the NEXT tick, one sixtieth of a second after the cast: a note that takes 0.3 s to fly would arrive after the attack, so either let attack notes fly fast or play that cat's swing late (the last `spCast` of the jam lists the cat with `kind: 'attack'`). A gauge note never fills a gauge to the top with the shipped numbers (80% + 20% stays just under it).

**Choices**: skill cats = every cat on the board with a BUILT skill other than the bard itself (all twelve now); two bards fill each other once per cast, never themselves; **the lucky cat takes gauge notes** (decision 23; the row's `capsule.bardTargetsCapsule` false keeps the bard away from it entirely, notes of both kinds); skip test `sp >= skip - 1e-9`; one extra rule the design does not state: an attack note needs `charge < 1` (matters when two bards cast in one tick); attack notes also clear `searchAfter` (the "nothing in range" cache); a gauge note that would take a gauge to the top (only if `skip` is raised above 0.8) resets that cat's `spCheckAt`; targets are fixed before anything is written; with two bards in one tick, in cell order, the later one sees the earlier one's work.

### 6.7 `fish` (Turn Into Fish!, alchemist, rank 4, 24 s)

Rules as built: spec 22.8.10, status rules in spec section 9. One big flask turns an elite or boss into a fish (quarter speed for 4 s / 2.5 s, then locked 8 s / 5 s against another flask) if at least 3 cats can hit it; four (five without a big one) small flasks take the weakest ordinary enemies off the field for good (current health at most 60% of one cucumber of their wave), paying their fish twice.

**What the scene needs**
* The flasks fly from the alchemist's tile to `big` (one) and each of `small`. **The simulation has already removed the small ones and turned the big one when the picture starts**: keep the small enemies' sprites on screen until their flask lands (their `enemyDie` arrives in the cast's tick); do not play the usual fall for a `transmuted` death, play the pink puff and the fish flying to the counter: the doubled reward is on the `fish` event, flown by the currency director from `x, y` as for any kill.
* The big fish: `EnemyState.fish` true from the cast to `fishEnd`. It keeps walking at a quarter speed, its place, name tag and health bar are unchanged; the pink ring shrinks over `seconds` of `BattleApi.time` (time it from the `status` event); at `fishEnd` the "pop" and, for `lock` seconds, the crossed-out fish bone by the name tag. `slow` stays 0; the boss's abilities go on as usual. A boss that dies while a fish: no `fishEnd`; clean up on `enemyDie`.
* Order of one cast: `spCast` -> `status` -> (`fish` -> `enemyDie`)*; `fishEnd` much later. A fish that dies is an ordinary death (`enemyDie` without `transmuted`).

**Choices**: the big flask goes to the first enemy in skill order that passes ALL tests (in reach, elite or boss, not a fish and not locked, three cats can hit it); `reachCount` counts the cats whose range holds the enemy, not blocked, the alchemist among them, cats of any kind, never clones; the lock covers the fish itself (`fishLockUntil = fishUntil + lock`: boss 12 s from the cast to the next possible fish, elite 7.5 s); `fishUntil` is set at the cast (the cast tick is walked at full speed); 60% test with a hair of slack (a coin is a target); not a kill but counted as one (`Sim.kills`, the alchemist's `kills`, the bots' tally, the gold dungeon's capped kill gold), reward = bounty x (1 + kill-fish bonus) x 2 through `earnFish` reason 'kill' (the daily "rich" rule doubles it too); no `purr`, no `damageByUnit`, no `hit`; only ordinary enemies are removed (never an elite, boss or wave target, so the firecracker's death burst never meets it); a fish is a plain walking factor: not in `ST_MAGIC`, not read by the slow-based checks, and the vaccine / pills do not clear it.

### 6.8 `capsule` (Lucky Capsule!, lucky cat, rank 5, 34 s)

Rules as built: spec 22.8.11. A capsule drops on the cat's head, bounces and opens 1.2 s later; the kind is rolled at the cast (fish 30, purr 25, partner 25, more 10, toy 7, guardian 3; `more` opens a small capsule 1.0 s later). A fish capsule gives half the gauge back (decision 17).

**What the scene needs**
* The fall (1.2 s, two bounces) starts at `spCast`; colour and mark from the data row (`marks[kind]`), known at the cast. For a fish capsule `refund` is true and `UnitState.sp` is 0.5 from the cast tick on, so hold the ring at its old value until the lid opens if you want the "half comes back with a flash" look.
* The lid opens at `capsuleOpen`; the prize events are in the same tick. For `fallback` the promise fails comically (hearts instead): `kind` says what was promised, `purr` how many hearts. For `seat` the beam goes from the lid to `cell`, the twin falls straight down there, the paw-print stamp goes between `origin` and `cell`. For `promote` the sticker at `cell` swells and becomes `promote.result`. The opening spot (`x, y`) is the cat's tile AT THE CAST (it may have moved or been sold since).
* **The toy pick** is a normal `relicOffer` (HUD `showRelics()`): with `pending.source === 'capsule'` the screen must hide the reroll row (`freeRerolls` is 0 and `paidRerollUsed` true), use the capsule's header ("Toys everywhere! Pick one"), and NOT wait for a boss banner (`stageHeldFor`). It opens at the END of the tick the lid opened in, so the 0.4 s of lid-opening is the view's own delay. Any drop is refused (`choice_pending`) while it is open: let go of a dragged cat when the offer opens. After `pickRelic` the phase is `wave` again and the wave goes on where it was.
* **Cleanup**: a win drops the capsules in the air (no `capsuleOpen` after `victory`); a defeat keeps them and they open after a revive.

**Choices**: a defeat does not drop the capsules (the design says win and lose; a revive resumes the field as it stood, like the tiger's body); the toy capsule decides at the opening whether a toy is left (`capsuleOpen.result` is already `fallback` with purr 5 when nothing is left); the pick draws from `capsuleRng(s, 'toy')`: the `combat` stream, or with `rollsFrom: 'hash'` a fresh generator seeded by (run seed, wave, order of the draw in that wave); `PendingChoice.relic.source` is optional in the type so the view's literals compile; partner and guardian order are generic over the row's key lists; a twin of a ninja steps its clones aside through `placeUnit`; `ready` is always true (a capsule has nothing to do with enemies); the knobs `fullBoardFish`, `fullBoardPartnerFloor`, `bardTargetsCapsule`, `oneAtATime`, `rollsFrom`, `toyPick.*` are live, tested; the shipped values are the recommended answers. An hourglass chosen from a toy capsule in an elite / boss fight adds its 15 s to that fight but leaves the boss's damage-allowance rate (`capRate`, fixed at the spawn) as it was; a revive added time mid-fight the same way before the skills existed, so this was left alone.

## 7. Existing tests changed in the whole of step 2 (none weakened)

* `tests/sim.spSkills.test.ts`: (a) `expect(spRowOf('cut')).toBeNull()` stated "no row yet" and now reads `toBe(SP_ROWS.cut)`; the `lend()` helper restores a registry entry exactly (`had !== undefined`) instead of deleting a `null` one. (b) The samurai was "a cat whose skill is not built" in three lines: `spRowOf('cut')?.built` is now `true`, the "cat without a skill has no gauge" example is `w_sword` (rank 2), and the merge example "two vikings merge into a samurai: no gauge" expects the merge value `SP_START_MERGE` and checks "no gauge" on paw + paw -> sword. (c) "keeps the ratio through a molt" used the ninja as a cat without a skill: it strips the ninja's skill for that test (new helper `stripSkill`, next to `lend`). (d) The names test ended with `toEqual(['charge','lap','shove','wanted'])`, which cannot hold with eight more skills; it became "exactly the built rows", and since all twelve are built (review) it now says so: `Object.keys(names)` is all twelve ids and every row is built.
* `tests/view.director.palette.test.ts`: counted eight statuses; nine now, with a line that the new `fish` one has a colour.
* `tests/sim.perf.test.ts` (review): the 150 ms test picks the first seed from 5 that wins. At `HEAD` seed 5 lost and the test measured seed 6 (about 27 ms); with skills on (the default of `initOf`) seed 5 wins all 24 waves and is a run twice as long (about 55 ms), so the margin fell from about 4.4x to 2.5x and the test failed (157 ms) in both full-suite runs of the review while passing alone. It now plays `sp: false` (the same bar as before the skills, same seed) and a second test plays the pinned seed 6 with the skills on, under the same 150 ms. Skills cost, on the same seed, 0 to 27% of a run (the review measured +6% a tick in chapter 3 level 4 and +17% on seed 5).
* `tests/spHelpers.ts` (helper, review): `fingerprintRun` takes an optional `extraEvents` list (default none, so the 17 golden fingerprints are byte for byte what they were).
* `tests/simreport.sim.ts` (report tooling, not a test): `'skill'` among the income sources (without it the capsules' fish would be missing from the column sums; zero with the skills off).
* Nothing in the five step-1 files or the golden section changed.

## 8. For the owner

**To decide (each is one data cell or one line; nothing was retuned, decision 7):**

1. **Lucky cats multiply and fund themselves** (the rules review; its numbers, not mine). The design's value (+6.3 purr and about 3.4 fish-worth a second) is for ONE lucky cat. With `synergy` bots at level 5 and one lucky cat from the start, 8 seeds each: in chapter 5 (24 waves) the bot ended with 3 to 8 lucky cats and 37 to 84 capsules, and capsules paid 22 to 56 of the run's 43 to 83 purr and 530 to 2,560 of 3.5 to 5.3 k fish; in endless (60 waves, about 1,100 s) 8 to 15 lucky cats, 181 to 335 capsules, capsules paid 297 to 641 of 387 to 739 purr (77 to 87%) and 3.5 to 6.8 k of 13.8 to 17 k fish. Almost all new lucky cats came from hand awakenings of alchemists (7 to 13 per endless run), 0 to 3 from the guardian capsule. A lucky cat earns back its 10-purr awakening in about 3 minutes, so the loop is self-funding, capped only by alchemist supply and board space. Nothing in the rules is broken. Levers already in the data: `capsule.oneAtATime: true`, a lower `purr` / `fallbackPurr`, the odds row. The step-4 report should print the lucky-cat count at the end and the share of purr and fish from reason 'skill'.
2. **Directive decision 2 and the ninja's clones.** The decision says skills do not roll crits "except the gunner's bite". The ninja's clones throw the ninja's own shuriken, which roll crit and ricochet like any shuriken of the ninja (design 3.4.3 no. 21; tested). The directive now carries a clarifying note; confirm it, or tell us to make a clone's shuriken skip the crit roll (a flag in `combat.ts` `impact`; it also decides whether toys that add crit apply to the clones).
3. **`?sp=1` works in every mode, including the daily challenge and endless mode whose results feed the weekly score** (`profile.submitScore`; decision 9). With all twelve skills built and no scenes for eight of them yet, a `?sp=1` run scores much higher than a normal one. `SKILLS_ON` stays false, so only someone who adds the parameter is affected. Settle before the public build is linked with `?sp=1`: block it for score-submitting modes, or mark those runs as preview.
4. **Four readings the design left open** (the builders' choices; reading 1 and 3 are one cell or one line each): (1) the meteor needs weight 3, so a lone boss fires it but a lone elite does not, although the design says "(or an elite or boss)" (`weights [1, 3, 3]` would change it); (2) the cloud cap of 6 means six on the field at once, not six per battle; (3) two casts that mark the same enemy cut it twice (design 4.5 says "one line", which is about drawing); (4) a defeat keeps the capsules in the air (the design says clear the list on win and lose), so a revive resumes the field as it stood.

**To know for step 4 (measured by the builders and the reviews; nothing retuned):**

* Thin crowds: the samurai's cut marks about 3 enemies a cast (the design's value assumes 10) and cuts 2.2 to 2.6 of them (many marked enemies die inside the 1.2 s: per run about 5 lines move and 4 are lost); the meteor's inner ring catches about 3 (the design assumes 5.8) and its outer ring 2.5 to 3.8 (13); about 45% of clouds end `lost` (the lead enemy falls to the other cats with nobody within 150 px), 16 to 31 clouds and 14 to 53 hops a run; the frost queen casts 10 to 20 times a run for about 3 shards (about 20% frozen). Levers, one cell each: `cut.minEnemies`, `meteor.minWeight` / `weights`, `cloud.hop`, `clones.readyMinEnemies`. In the review's twelve-cat board runs the ninja cast in only 1 of 10 runs (the five-enemy condition).
* The alchemist: where it stood in the middle with two cats near it, 5 to 10% of all enemies of a run were turned into fish, paying 100 to 230 fish; a cast with a big flask and no small one happens; the lever for a rarer big flask is `reachMin`.
* Several bards (the rules review, 300 s on an empty field, four lucky cats): without a bard about 41.6 capsules; with 1, 2, 3, 4 bards 49, 62, 77, 82 (x1.18, x1.49, x1.85, x1.97); the bards themselves cast 17, 41, 69, 107 times. Bards skip any gauge at 80% or more, so there is no runaway; bards alone on a board never cast. For ONE lucky cat the capsule builder measured 28.8 s between capsules without a bard (design 28.9), 21.1 s with one bard (x1.61 as many capsules as the cat alone), 17.8 s with two. This is the answer to decision 23's "is the bard too rich for this cat".
* The guardian capsule's chain: a new lucky cat came out of a guardian capsule in 1, 3 and 6 of 8 runs in chapters 1, 3 and 5, above the design's 0.09 to 0.33 bound for a board that does not build alchemists (the safety check keeps it off a single alchemist; bot boards often hold two or three).
* Cost: the 12 handlers are about 2 ms of a 61 ms full run; 25 skill cats with 60 enemies cost 0.008 to 0.012 ms a tick for one kind and 0.018 ms for a mixed board against 0.012 off; the steady-field heap test grows about 0.2 MB cold and about 0 warm against its 0.4 MB limit. The phone budget is step 4's.

## 9. The review of step 2 (what was found, what was done)

Two reviewers read the finished build (rules / determinism / saves / limits / performance, and the tests' strength / public shape / documents); they ran 13 million ticks of fuzz, 398 hand-made mutants (377 caught) and 179 old-versus-new play-throughs with skills off. Each finding below was checked against the code by the engineer who closed the work.

**Fixed (each with a test):**
* The meteor's one-second aim ignored the alchemist's fish walking factor (predicted 46 px, real 11.5 px for a fish boss, so a fish was aimed about 30 px too far ahead and the weight clusters were built from the wrong place). `travelledAfter` now uses the quarter speed until `fishUntil`, also when the fish ends inside the second. Tests: the prediction against the real walk for a fish boss, a fish elite and a fish that ends mid-second; the meteor lands on a fish boss within half a pixel.
* The jam announced its `spCast` BEFORE writing the gauges, while `api.ts`, this note and the spec said `UnitState.sp` already shows `after`. It writes first and announces after (there is no damage to come before it). Test: the values read inside the `spCast` listener.
* Cut and meteor events carried no cast id. `SpCutData.cutId` and `cutOpen.cutId`; `SpMeteorData.meteorId`, `meteorLand.meteorId`, `craterEnd.meteorId`. The ids already existed internally. Tests: two samurai in one tick, two meteors on one laser dot, counting on across casts.
* The crater's burn refresh (every 0.5 s, 0.75 s long) cut another source's longer burn short and took its credit (`applyStatus('burn')` takes the end it is given). The crater pulse now keeps a later end and its source (`applyStatus` itself is untouched: it is old-game code). Tests: a fire cat's burn keeps its end, source and strength until the crater's would end later; the crater's burn is credited to the cosmo cat's `damageDealt`.
* `tests/sim.perf.test.ts` (section 7).
* Eleven mutants of real rules that no test noticed, one assertion each: the meteor's laser ring (149 px in, 151 out), the crater's burn credit, the jam's note order for equal gauges, the jam's attack-note range (1 / 10 / 59 px past the reach), the jam's announcement order, two stacked clones' throw order by `index`, the clones' tie by lower `uid`, a clone's elite / boss preference inside the laser dot, the cut's `toPath` wrapped near the end of the loop, `cloneEnd.x, y` and `cloneEnd.cell` for a standing and a stacked clone.
* No test put all twelve skills on one board: `tests/sim.spAll.test.ts` (five modes x two seeds, 400 s, played twice to the same events and end, with every gauge in [0, 1], at most six clouds, no broken number, the delayed list in order and short; over those runs all twelve skills cast), and the pairs the builders could not see: an alchemist's small flask taking a cloud's host (the cloud hops to the nearest enemy that is left, or ends `lost`) and a samurai's mark (the line moves to a newcomer or goes out).
* The names assertion in `sim.spSkills.test.ts` was true by construction (section 7).
* Stale header comments (`data/spSkills.ts`, `sim/sp/registry.ts`, `sim/sp/types.ts`, the draft banners and marker lines in `game/api.ts`, `sim/sp/later.ts`) and the rules specification section 22 (its title and intro, 22.2, 22.3, 22.7, the order of 22.8.4 before 22.8.5, section 9's fish paragraph and table row, the test header that quoted "22.8.5" for the meteor).
* The directive's decision 2 got a clarifying note about the clones.

**Rejected or left, with the reason:**
* Several bards speeding up every gauge: bounded (section 8), no change needed.
* The hourglass taken from a toy capsule in a boss fight leaving `capRate` as it was: the revive has always added time mid-fight without recomputing it; it is favourable to the player by a small amount and rare. Documented (6.8), no change.
* The thin-crowd casts and the four readings: the owner's call (section 8); no code change (decision 7).
* Lucky cats multiplying and `?sp=1` in score-submitting modes: decisions of the owner / lead (section 8); no code change.
* "Replace the oldest cloud / lone elite / etc.": see 6.3 and 6.5.

## 10. Left

* **View** (the next workflow): eight scenes from sections 1 and 6 (the ring and name bubble of step 1 already read every skill through `UnitDef.spSkill`; each rank 5 skill needs its cut-in), the stage rule at 3x speed (one cast effect per 0.25 s of real time), the capsule's toy screen (header, hidden reroll row, drag release), sounds from the game's own.
* **Step 3**: the selection sheet, the cat screen, the summon tooltip, the tutorial lesson, the guide, the texts beyond the eight names (the six capsule lines and "when it opens"), the font.
* **Step 4**: the balance report with skills on against off (and the lucky-cat count and the 'skill' share of purr and fish), a cooldown per skill for the owner to settle (decision 19: the starting values 18 / 24 / 34 stand), phone performance, reduced motion, the patch notes.
* **`SKILLS_ON` flips only when** all twelve skills, the texts of step 3 and the measurement are in (decision 22).
* A thirteenth skill: `docs/handoff/skills1_sim.md` section 8 is still the recipe; `sim/sp/near.ts` has the shared searches (`cellDist2`, `emptyCellsNear`, `nearestEmpty`, `touches`, `inRangeOf`, `enemiesAround`, `nearestEnemyAround`, `heaviestCluster`).
