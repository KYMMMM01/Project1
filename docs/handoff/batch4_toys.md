# Hand-off: batch 4, toys (D1, D2, D3)

Engineer key: `toys`. The before / after table of all 30 toys is in the spec, §13 "장난감 값의 측정"; the full write-up is in the engineer's final message.

**Latest state:** the numbers of `glass_marble`, `sunny_spot` and `nap_blanket` below were superseded by the owner and the lead in the third pass ("Owner's values and the blanket"); the owner then set `batteries` (back at rare, 2 s / 3 s), the blanket (damage 8%) and the `sardine_crate` (100 fish, cap -15) in the fourth pass ("Owner's values, second round"), the last section of this file. Rank counts are now common 8 / rare 8 / epic 8 / legendary 6.

## What changed

* **D1** `relic.nine_lives.desc`: "질 뻔한 순간 한 번, …" -> "위기의 순간 한 번, 적을 쫓아내고 계속해요" (en: "Once per run, in a moment of crisis, chase the enemies off and carry on"). The codex card, the offer card and the guidebook all read `relicDef(id).descText()`, so there is one place. The spec row and the GDD row say the same.
* **D2** `purr_pillow` and `lucky_coin`: +1 -> **+3** each (the brief's default was +2; why: see the report, "골골 장난감").
* **D3** Every toy was measured (see below) and re-tuned. 19 toys got new numbers, 4 changed rank, `cat_tunnel` also changed pace. Ranks are now common 10 / rare 7 / epic 7 / legendary 6 (was 8 / 8 / 8 / 6). **The closing pass put `heating_pad` back at rare** (see "Closing pass" at the end): the owner called it too good, the bots measured it weak, and moving it down was the opposite of the ask.
* `COUNTER_RELICS` (the toys an offer pushes as answers to the next act's trait): `fast: ['heating_pad', 'fishing_rod']`, `haste_aura: ['fishing_rod', 'heating_pad']` (the nap blanket is out: it makes the bots lose, see the report).

## Files

| File | Change |
|---|---|
| `src/game/data/relics.ts` | numbers of 19 toys; `COUNTER_RELICS` |
| `src/game/data/roster.ts` | `RELIC_RARITY` (batteries, nap_blanket -> common; glass_marble -> rare; cat_tunnel -> epic; heating_pad stays rare) |
| `src/game/api.ts` | `RELIC_IDS` regrouped by rank (the codex's "all" list and `toysFor` follow this order; a test pins it) |
| `src/game/data/types.ts` | comment of `RelicFx.tunnel`: it is now the number of waves between two visits |
| `src/game/sim/flow.ts` | `startWave`: the tunnel's cat comes when `wave % fx.tunnel === 0` (it used to come every wave) |
| `src/game/sim/runner.ts` | `RunOptions.toy` (hand a toy to a run before a wave; balance report only), `RunResult.purrIn` (purr that came in) |
| `src/game/data/strings.ts` | `relic.nine_lives.desc` (ko, en), `relic.cat_tunnel.desc` (ko, en, now takes `{a}`) |
| `tests/simreport.sim.ts`, `tests/simReportKit.ts` | the `toys` section (`SIM_ONLY=toys`), `pairedDelta`, `signed` |
| `docs/명세_전투규칙.md` | §13 toy table and the two paragraphs under it, the toy numbers in §12 |
| `docs/기획서_GDD.md` | the toy rank table |

## New names and keys

* `RunOptions.toy?: { id: RelicId; wave: number }`: `playRun(init, bot, { toy: { id: 'cat_tunnel', wave: 5 } })` calls `gainRelic` just before wave 5 starts (wave <= 1: before the first wave).
* `RunResult.purrIn`: purr that came in over the run (spending not counted).
* Balance report: `SIM_ONLY=toys`, `SIM_TOYS=a,b`, `SIM_TOY_WAVE=5|start|rank|<n>`, `SIM_RUNS`.
* `RelicFx.tunnel` now means "every N waves" (1 = every wave, 3 = waves 3, 6, 9 ...). `args.a` of `cat_tunnel` is that N and the text shows it.

## New strings (exact)

* ko `relic.cat_tunnel.desc`: `{a}웨이브마다 일반 고양이 한 마리가 찾아와요` (a = 3).
* en `relic.cat_tunnel.desc`: `A common cat wanders in every {a} waves`.
* ko `relic.nine_lives.desc`: `위기의 순간 한 번, 적을 쫓아내고 계속해요`.
* en `relic.nine_lives.desc`: `Once per run, in a moment of crisis, chase the enemies off and carry on`.

## For the next engineers

* **Wording phase:** `relic.purr_pillow.desc` still says "막을 깰 때마다 골골 +{a}" (en "every time you clear an act"); the spec rows I wrote also say "막 클리어". Change them with the rest. Run `npm run font` after any text change (`tests/core.font.test.ts` passes with my two texts).
* **Stake engineer:** I measured at stake 0 only. At stake 3 and 5 (frozen base rules, information only) the toys that act on the enemy cap behave very differently from stake 0 (nine lives +8..13 points at stake 3, hourglass +20 at stake 5, the nap blanket negative); the numbers are in the report. If the stake rules change the cap or the boss limits, those toys move.
* **Bots:** `RELIC_SCORE` in `src/game/sim/bots.ts` was not touched; it still ranks the nap blanket 5 and the nine lives 6 although the measurement says the first hurts and the second is invisible at stake 0.
* `tests/sim.flow.test.ts` "weights rarities by act": the old check ("at least two toys not on the counter list, all of the act's rarities") broke because more counter toys now sit inside the act's rarities; it now asks for at most one toy outside the act's rarities and that one on the counter list (same property, stricter on the counter slot).
* Whole suite at the end of my work: 162 files / 3,494 tests pass, `npx tsc --noEmit -p .` is clean. Tests I changed outside my own files because they quote toy numbers: `tests/sim.combat.test.ts`, `sim.enemyResist.test.ts` (scratcher 20% -> 70%), `sim.cells.test.ts`, `view.field.cells.test.ts` (prime spot), `view.hud.laser.test.ts` (batteries), `codex.text.test.ts`, `sim.rules.test.ts`, `sim.flow.test.ts`, `sim.data.test.ts`; each edit is the number only.

## Open

* The nap blanket's effect should be redesigned (the owner decides): see spec §13 "장난감 값의 측정" and the final message.
* `nine_lives` can only be judged at stake 1 and above; its legendary rank rests on arithmetic and on the stake-3 / 5 reading.

## Closing pass (batch 4)

* `heating_pad` is back at **rare**, numbers untouched (slow +30%, +15% damage on slowed enemies). Measured +1.9 points (below the rare mean), so the owner's "too good" is not borne out by the bots; the brief says to report a wrong decision instead of improvising the opposite. Owner decides: lower it to common (what the data says) or raise the +15% (or tell us which board felt too strong and it gets re-measured). Rank counts: common 10 / rare 7 / epic 7 / legendary 6; per-rank mean score after: 3.3 / 3.5 / 5.4 / 4.7 (spec §13 updated). A test pins the three named toys (`tests/sim.toyRanks.test.ts`).
* `glass_marble`'s 60% is now pinned by geometry (`tests/sim.relics.test.ts`): an enemy 97 px from the impact is hit only at +60%, one at 112 px never.

## Lead's moderation pass (batch 4, second pass)

Engineer key: `toys2`. Supersedes the numbers, ranks and counts above (they were the toys engineer's). The lead fixed ten values; they were applied exactly and **no value was changed because of a measurement**. Nothing is committed, pushed or deployed. The owner-facing table of all 30 toys is `docs/qa/batch4_toys_report.md`; the spec is §13 (toy table, "장난감 값의 측정", the paragraph "리드 조정").

### What was set

| toy | rank before -> now | value in the tree before -> now | why (the lead's, in the spec) |
|---|---|---|---|
| scratcher | common | `defenceCut` 0.7 -> 0.4 (text 40) | bosses got armour so the warriors' armour ignore matters; -70% erased it |
| glitter_ball | common | `damageMagic` 0.2 -> 0.15 (back to a3b8536) | mages are not to be buffed; parity with the mouse toy |
| silvervine | epic | `critMult` 2.2 -> 1.0 (text 100) | crit builds get several times the average |
| glass_marble | rare | `areaScale` 0.6 -> 0.4 (text 40) | mages' areas were made smaller on purpose |
| golden_catnip | legendary | `synergyScale` 0.6 -> 0.5 (text 50) | builds for synergy get several times the average |
| sunny_spot | legendary | `sunCells` 5 -> 4, `sunSpeed` 0.25 -> 0.2 (text 4 and 20) | placement toy, same reason |
| purr_pillow | epic | `actPurr` 3 -> 2 | the lead told the owner +1 -> +2 |
| lucky_coin | epic | `bossPurr` 3 -> 2 | same |
| heating_pad | rare -> **epic** | numbers unchanged (+30% slow, +15% on slowed) | owner: too good for its rank |
| nap_blanket | common -> **rare** | `enemySlow` 0.1 and **`spawnSlow` 0.08 added** | the hourglass's mechanic; new text |

Ranks now: common 9, rare 7, epic 8, legendary 6. `spawnSlow` is read in `sim/flow.ts` `buildSpawns` (`SPAWN_WINDOW` 9 s x (1 + sum of `fx.spawnSlow`)): the effects are a flat sum (`rebuildFx`), so blanket + hourglass = +18% (10.62 s; spawns end at 11.22 s of the 15 s wave). The elite / boss wave's escort window (10 s) is not stretched.

### Files

| File | Change |
|---|---|
| `src/game/data/relics.ts` | the ten values; nap blanket `fx` |
| `src/game/data/roster.ts` | `RELIC_RARITY`: nap_blanket rare, heating_pad epic (entries kept in rank order) |
| `src/game/api.ts` | `RELIC_IDS` regrouped (common 9 / rare 7 / epic 8 / legendary 6; the order inside a group is the lead's) |
| `src/game/data/strings.ts` | `relic.nap_blanket.desc` ko `모든 적의 이동 속도 −{a}%, 적이 조금 더 천천히 몰려와요`, en `Every enemy moves {a}% slower, and enemies arrive a little slower`. Only these two strings changed; the other numbers reach the text through `{a}` / `{b}` from the data. `npm run font` reproduces `game-kr.a3dcbdba.woff2` (no new glyph). |
| `tests/*` | see below |
| `docs/명세_전투규칙.md`, `docs/기획서_GDD.md`, `docs/qa/batch4_toys_report.md` | numbers, ranks, measurements, "리드 조정" |

`COUNTER_RELICS` is unchanged (`fast: heating_pad, fishing_rod`; `haste_aura: fishing_rod, heating_pad`): the blanket measured no help against fast or haste enemies, so it was not put back (numbers in the spec and the report). Consequence of the pad being epic: the counter slot ignores the rank weights, so an epic pad now shows up in the offers after stages 1-2 (about one chapter-1 first offer in four contains it). The test "weights rarities by act" already allows one off-rank toy that is on the counter list.

### Tests (each edit is the number only; formulas kept)

* `tests/sim.combat.test.ts`: scratcher factor `0.3` -> `0.6` in four formulas (`0.35 * 0.3` -> `0.35 * 0.6`, the ignore and break factors kept); comment 70% -> 40%.
* `tests/sim.enemyResist.test.ts`: `1 - 0.08 * 0.3` -> `1 - 0.08 * 0.6`.
* `tests/sim.relics.test.ts`: glitter ball `1.2` -> `1.15` (title and comment: parity with the mouse toy); silvervine `+ 2.2` -> `+ 1.0`; sunny spot `SUN_CELLS + 5` -> `+ 4` (twice) and `(before * 1.2) / 1.45` -> `/ 1.4`; golden catnip `1.6` -> `1.5` (twice); lucky coin `ELITE_PURR + 3` -> `+ 2`; purr toys' rule values `3` -> `2`; "pay at least half an awakening" -> "at least two fifths" (`(AWAKEN_COST * 2) / 5`, the upper bound `< AWAKEN_COST` kept, because +2 per toy is 4 of 10); glass marble: reach `106` -> `95` (= 55 x 1.4 + 18) and the probe distances `97 / 112` -> `90 / 100` (an enemy at 90 is hit only with the marble, one at 100 never; the pair fails for the original 25% and for the first 60%). **New:** "nap blanket: the enemies of a normal wave come out over an 8% longer window, on top of the 10% of the hourglass (18% together)" (spawn times of wave 1 scale by exactly 1.08 / 1.1 / 1.18; the elite wave's escort schedule is identical with and without the blanket).
* `tests/sim.cells.test.ts`: prime spot `+ 5` cells -> `+ 4`, `0.4` -> `0.35` (treat), `0.45 / 0.4` -> `0.4 / 0.35`, title 25 -> 20 points, 5 -> 4 cells.
* `tests/view.field.cells.test.ts`: `0.25` -> `0.2` (three places), `45` -> `40`, `0.4` -> `0.35`, title.
* `tests/sim.data.test.ts`: `golden_catnip` `synergyScale` `0.6` -> `0.5`.
* `tests/sim.flow.test.ts`: purr pillow `1 + 3` -> `1 + 2`.
* `tests/sim.toyRanks.test.ts`: counts `10 / 7 / 7 / 6` -> `9 / 7 / 8 / 6`; the "three toys the owner named" test now pins tunnel epic every 3rd wave, **pad epic with +30% / +15%**, **blanket rare with `{ enemySlow: 0.1, spawnSlow: 0.08 }`**.
* Negative controls (a scratch copy, one old value at a time): marble at 25% and at 60%, scratcher at 70% and 20%, blanket without the spawn stretch and with 0.10, silvervine 2.2, glitter 0.2, sunny spot 5 cells and +0.25, catnip 0.6, pillow 3 and 1, coin 3, pad back at rare, blanket back at common: each one fails at least one test.

### Measurement (report only)

Same method as the toys engineer: `SIM_ONLY=toys`, each toy before wave 5, stake 0, chapter 1 L1 / chapter 3 L3 x merge / synergy bot, **600 runs per cell**, same seeds. Raw output: the lead's scratchpad `batch4/toys2/` (`before.txt`, `after.txt`, `after_all30.txt`, `out_nap/`, `out_bots/`).

| toy | rank | now | score a3b8536 (toys engineer) | tree as found (this job, before) | after | cells after (m1 / m3 / s1 / s3) |
|---|---|---|---|---|---|---|
| scratcher | common | -40% | +1.4 | +3.9 | **+3.3** | +3.3 / +4.0 / +2.3 / +3.5 |
| glitter_ball | common | +15% | +3.6 | +4.8 | **+4.8** | +6.0 / +6.8 / +2.8 / +3.5 |
| silvervine | epic | +100% | +3.0 | +5.5 | **+4.2** | +4.2 / +6.8 / +1.7 / +4.0 |
| glass_marble | rare | 40% | +2.3 | +3.2 | **+3.8** | +4.5 / +5.7 / +2.3 / +2.5 |
| golden_catnip | legendary | +50% | +1.0 | +2.8 | **+3.7** | +5.3 / +3.5 / +3.5 / +2.3 |
| sunny_spot | legendary | 4 cells, +20 | +3.0 | +6.5 | **+6.2** | +5.5 / +6.5 / +5.7 / +7.0 |
| purr_pillow | epic | +2 | +2.3 | +3.7 | **+3.5** | +5.7 / +3.5 / +2.8 / +2.0 |
| lucky_coin | epic | +2 | +1.8 | +3.7 | **+3.3** | +5.3 / +3.3 / +2.8 / +1.8 |
| heating_pad | epic | +30% / +15% | +1.9 | +1.9 | **+3.0** | +3.3 / +3.5 / +2.5 / +2.7 |
| nap_blanket | rare | -10% + spawn +8% | -1.2 | -1.9 | **-1.5** | -1.5 / -2.3 / -0.7 / -1.7 |

Reading: the base state (no toy handed out) gets easier or harder as the bots' own picks change. After the pass it is 3 points lower (merge bot ch1 67 -> 64%, ch3 61 -> 57%), so the 20 toys that were not touched measure 1.0 points higher on average than in the toys engineer's table. Compare toys only inside one run (`after_all30.txt`). Per-rank mean of all 30 after: **common 4.6 (9) / rare 3.8 (7) / epic 5.7 (8) / legendary 5.6 (6)**; without the blanket the rare mean is 4.4. Whole runs (500, stake 0): ch1 merge 68 -> 65%, synergy 92 -> 90%; ch3 61 -> 59% / 89 -> 86%; ch5 74 -> 71% / 95 -> 94% (targets 60-75 / 85-92; two cells are outside: ch3 merge is one point under, ch5 synergy is two points over at 94%, which was 93% at a3b8536 and 95% before the lead's pass).

Nap blanket halves (a temporary edit in a scratch copy of the tree; the live tree was never touched; 600 runs, wave 5): both -1.5 (se 0.6), `enemySlow` alone **-1.3** (0.6), `spawnSlow` alone **-0.6** (0.5). Handed out at wave 13 (the clock appears in stage 4 of both chapters): both -0.0, slow alone +0.0, spawn alone -0.1; at wave 1: both -2.6. No sign that it answers fast or haste enemies.

### What depends on a rank or on a count per rank, and how it was checked

* Offer odds by stage (`RELIC_RARITY_WEIGHTS`, `rollRelicOffer`): the weights are per rank, so only the share of one toy inside its rank moved (stage 5: epic 60/8 = 7.5% each, legendary 40/6 = 6.7% each). Checked on 1,500 seeds per stage in a scratch copy: rank shares of the offers 70/21/9/0 (after stage 1; the 9% epic is the counter slot), 68.5/31.5/0/0, 17/40/44/0, 9/48/44/0, 0/0/61/39; epics 7.1-8.3% each, legendaries 6.1-6.8% each after stage 5. `tests/sim.flow.test.ts` "weights rarities by act" and "puts a toy that answers the next act's trait into the offer" pass unchanged; `tests/sim.toyRanks.test.ts` pins that every weighted rank has toys and that each rank can fill an offer of three twice over.
* Codex filter and order (`toysFor`, `TOY_RARITIES`, `RELIC_IDS` order): both come from `RELIC_RARITY` and `RELIC_IDS`; the pinned test "lists the toys rank by rank" and `tests/codex.text.test.ts` pass.
* `COUNTER_RELICS`: every entry is a real toy and none is the blanket (`tests/sim.toyRanks.test.ts`); the pad is on two lists and is now epic (see above).
* Other: `RELIC_SCORE` in `src/game/sim/bots.ts` was not touched (it still ranks the blanket 5). `src/codex/cells.ts` and `src/view/field/cellMath.ts` read the prime spot from the data (4 cells, +0.2 shown).

### Checks

`npx tsc --noEmit -p .` prints nothing. Whole suite: 163 files, 3,502 tests, all pass (3,501 + the new nap blanket test). `npm run font` reproduces the same subset.


## Owner's values and the blanket (batch 4, third pass)

Engineer key: `toys3`. Supersedes the numbers of these three toys in the sections above; everything else in the tree is as the second pass left it. Nothing is committed, pushed or deployed. The owner-facing table of all 30 toys is `docs/qa/batch4_toys_report.md` (rewritten); the spec is §13 (table, "장난감 값의 측정", the paragraph "리드 조정") and §9 (the damage product).

### What was set

The owner set two values himself (verbatim "유리구슬은 30%", "명당자리 3칸에 +10%"); the lead redesigned the blanket because the spawn-window stretch measured neutral and the walk slow alone made the bots lose.

| toy | rank | in the tree before -> now | text args |
|---|---|---|---|
| glass_marble | rare | `areaScale` 0.4 -> **0.3** | `a` 40 -> 30 |
| sunny_spot | legendary | `sunCells` 4 -> **3**, `sunSpeed` 0.2 -> **0.1** | `a` 4 -> 3, `b` 20 -> 10 |
| nap_blanket | rare (unchanged) | `{ enemySlow: 0.1, spawnSlow: 0.08 }` -> **`{ enemySlow: 0.1, enemyDamageTaken: 0.12 }`** | `a` 10, `b` 12 (new) |

No other toy value or rank was touched. `COUNTER_RELICS` is unchanged (see the measurement).

### The new rule, exactly

* `src/game/data/types.ts` `RelicFx.enemyDamageTaken?: number` (new field, line 145; 0.12 = 12% more).
* `src/game/sim/enemies.ts` `damageEnemy`, **line 250**: `if (s.fx.enemyDamageTaken) mult *= 1 + s.fx.enemyDamageTaken;`. It sits with the other "takes more damage" factors, after the vulnerability (`1 + vulnAmount`), the laser's focus (`x 1.15`) and the heating pad's slowed bonus (`x 1.15`), and **before** `if (mult > VULNERABLE_CAP) mult = VULNERABLE_CAP;` (line 251), so it is one more factor of the same product under the same cap of 2.0. The product multiplies `amount` after the armour / ward cut and before the elite allowance and the shield, so it applies to physical and magic hits, to every damage-over-time tick (burn, poison, bleed all go through `damageEnemy`), and to shield and health alike. `fx` is a flat sum (`rebuildFx`), so two sources of the field would add (one exists today).
* `src/game/data/strings.ts`: `relic.nap_blanket.desc` ko `모든 적의 이동 속도 −{a}%, 적이 받는 피해 +{b}%`, en `Every enemy moves {a}% slower and takes {b}% more damage`. `npm run font` reproduces `game-kr.a3dcbdba.woff2` (no new glyph).
* `src/game/sim/flow.ts` is not touched. The last-tick guard that the second pass added to `buildSpawns` (`lastAt`) stays: it protected the 18% (blanket + hourglass) stretch in the daily rule's 11-second wave. With the blanket's `spawnSlow` gone the hourglass alone (+10%, 10.5 s at the latest) never reaches it, so it is now defence only; `tests/sim.relics.test.ts` still pins it by setting `sim.fx.spawnSlow = 0.18` by hand.

### Files

| File | Change |
|---|---|
| `src/game/data/relics.ts` | marble, prime spot and blanket values |
| `src/game/data/types.ts` | `RelicFx.enemyDamageTaken` |
| `src/game/sim/enemies.ts` | the factor (line 250) |
| `src/game/data/strings.ts` | blanket text (ko, en) |
| `tests/*` | see below |
| `docs/명세_전투규칙.md`, `docs/기획서_GDD.md`, `docs/handoff/sim.md` (one sentence on the prime spot), `docs/handoff/batch4_toys.md`, `docs/qa/batch4_toys_report.md` | numbers, ranks, measurements, "리드 조정" |

### Tests (each edit is the number only unless noted; formulas kept)

* `tests/sim.relics.test.ts`
  * glass marble: title 40% -> 30% ("not 25%, not 40%, not 60%"); reach `95` -> `89.5` (= 55 x 1.3 + 18, snow cat splash radius x scale + cucumber body); probes `90 / 100` -> `88 / 91` (an enemy at 88 px is hit only with the marble: the original 25% reaches 86.75; one at 91 never: 40% reaches 95, 60% reaches 106).
  * sunny spot: title "four more tiles, +20 points" -> "three more, +10"; `SUN_CELLS + 4` -> `+ 3` (twice); `(before * 1.2) / 1.4` -> `/ 1.3`.
  * **Taken out:** "nap blanket: the enemies of a normal wave come out over an 8% longer window ..." (the 1.08 / 1.10 / 1.18 schedule test). The hourglass keeps its own test ("hourglass: enemies arrive about 10% more slowly ...").
  * **New:** "nap blanket: every enemy takes 12% more damage from every source ..." (cucumber 100 physical: 92 -> 92 x 1.12; tangerine 100 magic: 65 -> 65 x 1.12; one tick of burn and of bleed: 50 -> 56 and 46 -> 51.52; a cone's shield and health: two blows of 30 cost 33.6 + 33.6, the shield first), and "... the damage factor is one of the vulnerability factors, multiplied with them and held under their cap of 2x" (x1.12 alone; 1.25 x 1.12 = 1.4, not 1.37; 1.25 x 1.15 x 1.15 x 1.12 = 1.85 < 2; vulnerability 0.6 + focus + pad: 2.0 with or without the blanket; vulnerability 0.6 alone: 1.6 -> 1.79 with it; 0.6 + focus: 1.84 without, held at 2.0 with it, 2.06 uncapped).
  * **Rewritten:** "nap blanket and hourglass together do not push an enemy past the end of the daily rule's 11-second wave" -> "the hourglass alone keeps every enemy of the daily rule's 11-second wave inside it, and a bigger stretch still ends on the last tick": the premise (blanket + hourglass = 18%) no longer exists, so the first case is the hourglass alone (no enemy at the end), the second sets `sim.fx.spawnSlow = 0.18` by hand to keep the last-tick guard of `buildSpawns` covered (the original assertions: every spawn time before the wave's end, sorted, and some at the end).
  * Imports: `BOSS_APPEAR` and `SPAWN_START` removed (only the taken-out test used them); `EnemyId`, `applyStatus`, `VULNERABLE_CAP`, `SimEnemy` added.
* `tests/sim.cells.test.ts`: title "20 points ... 4 cells" -> "10 points ... 3 cells"; `treat` `0.35` -> `0.25`; `SUN_CELLS + 4` -> `+ 3`; `chapter === 5 ? 0.35 : 0.4` -> `0.25 : 0.3`.
* `tests/view.field.cells.test.ts`: `cellExtra` `0.2` -> `0.1` (three places) and `spec.value + 0.2` -> `+ 0.1`; title "40 with the toy ... 0.35" -> "30 ... 0.25"; `toContain('40')` -> `'30'`, `'0.35'` -> `'0.25'`.
* `tests/sim.toyRanks.test.ts`: the blanket pin `{ enemySlow: 0.1, spawnSlow: 0.08 }` -> `{ enemySlow: 0.1, enemyDamageTaken: 0.12 }`, plus `spawnSlow` undefined on the blanket and `0.1` on the hourglass; the "shown numbers" record: `nap_blanket: { a: pct(enemySlow), b: pct(enemyDamageTaken) }` (and the stale comment about a second effect said in words is gone); the test title says "damage effect".
* Negative controls (a scratch copy of the tree, one change at a time; each fails at least one test): marble at 25%, 40%, 60%; prime spot at 4 and 2 cells, at +0.2 and +0.25; blanket without the field, at 10%, with the spawn stretch back; the line removed; added instead of multiplied; applied outside the cap; not for damage over time; not for magic; applied to health only and not the shield.

### Measurement (report only; no value was changed because of it)

Same method as before: `SIM_ONLY=toys`, each toy handed out before wave 5, stake 0, chapter 1 L1 / chapter 3 L3 x merge / synergy bot, 600 runs per cell, same seeds. Raw output: the lead's scratchpad `batch4/toys3/` (`before.txt`, `after.txt`, `after_all30.txt`, `out_nap/`, `out_cmp13/`, `out_bots/`). The "before" run reproduces the second pass's numbers to the digit.

| toy | before (tree as found) | after | cells after (m1 / m3 / s1 / s3) |
|---|---|---|---|
| glass_marble (rare) 40% -> 30% | +3.8 (+4.5 / +5.7 / +2.3 / +2.5) | **+2.8** | +4.3 / +4.0 / +1.8 / +1.2 |
| sunny_spot (legendary) 4 cells, +20 -> 3 cells, +10 | +6.2 (+5.5 / +6.5 / +5.7 / +7.0) | **+4.3** | +6.0 / +3.8 / +3.2 / +4.0 |
| nap_blanket (rare) spawn +8% -> damage +12% | -1.5 (-1.5 / -2.3 / -0.7 / -1.7) | **+4.3** | +5.5 / +8.2 / +2.2 / +1.2 |

Standard errors 0.4-0.6. The base state (no toy handed out) moved a little: m1 64 -> 66%, s1 90 -> 91%, s3 86 -> 87%, m3 57% unchanged (the bots pick the blanket now and then; not checked separately). Per-rank mean of all 30 after (one run): common 4.1 (9) / rare 4.2 (7) / epic 5.3 (8) / legendary 4.8 (6); the second pass was 4.6 / 3.8 / 5.7 / 5.6, a3b8536 was 3.7 / 4.8 / 3.8 / 3.8 (8 / 8 / 8 / 6 toys). Whole runs (1000 runs, stake 0), merge / synergy: ch1 66 / 91, ch2 63 / 92, ch3 58 / 86, ch4 71 / 92, ch5 74 / 95 (a3b8536: 62 / 88, 61 / 90, 59 / 88, 69 / 92, 72 / 93).

`COUNTER_RELICS` (blanket against `drop` and `clock`): the new blanket handed out at wave 13 (the clock appears in stage 4 of both chapters) is **+2.8** (+5.5 / +3.2 / +1.5 / +1.0), at wave 5 +4.3, at wave 1 +5.3. Other toys at wave 13 in the same run: mouse toy +1.6, yarn ball +1.4, fishing rod +2.4, heating pad +1.2. It falls with the number of waves left like a general damage toy and shows no bump at the stages where the fast and haste traits appear, so the lists stay as they are (`tests/sim.toyRanks.test.ts` still asserts that no list holds the blanket).

### Checks

`npx tsc --noEmit -p .` prints nothing. Whole suite: 163 files, 3,505 tests, all pass (3,504 as found in this job: minus two blanket-spawn tests, plus three). `npm run font` reproduces the same subset. Note: `tests/sim.perf.test.ts` ("under 150 ms") fails when the machine is loaded with other simulations (171 ms once while 15 report runs were going); it passes on an idle machine.


## Owner's values, second round (batch 4, fourth pass)

Engineer key: `toys4`. Supersedes the numbers and ranks of these three toys in the sections above; everything else in the tree is as the third pass left it. Nothing is committed, pushed or deployed. The owner-facing table of all 30 toys is `docs/qa/batch4_toys_report.md` (updated in place); the spec is §13 (toy table, "장난감 값의 측정", the paragraph "리드 조정") and §9 (the damage product).

The owner's words (verbatim): "건전지는 왜 버프했는데 꼬마로 내려갔어. 그대로 있어도 되겠는데. 낮잠 담요는 동네 등급으로 내렸으니까 받는 피해는 8%로 하고, 정어리 상자는 소비 상한 -15에 즉시 생선만 +100으로."

### What was set

| toy | rank before -> now | in the tree before -> now | text args |
|---|---|---|---|
| batteries | common -> **rare** (back as at a3b8536) | `laserDuration` 4 -> **2**, `laserCooldownCut` 5 -> **3** | `a` 4 -> 2, `b` 5 -> 3 |
| nap_blanket | rare (unchanged) | `enemyDamageTaken` 0.12 -> **0.08** | `b` 12 -> 8 (`a` stays 10) |
| sardine_crate | epic (unchanged) | `instantFish` 50 -> **100**, `costCapCut` 10 -> **15** | `a` 50 -> 100, `b` 10 -> 15 |

Rank counts now: common 8 (yarn_ball, glitter_ball, mouse_toy, cardboard_box, bell_collar, fishing_rod, scratcher, feather_wand), rare 8 (cat_tower, kneading_cushion, batteries, snack_stick, tuna_cans, window_perch, glass_marble, nap_blanket), epic 8, legendary 6. The same counts as a3b8536 (8 / 8 / 8 / 6).

**Where the batteries sit.** In `RELIC_IDS` (`src/game/api.ts`) and in `RELIC_RARITY` (`src/game/data/roster.ts`) they are the third rare: `cat_tower, kneading_cushion, batteries, snack_stick, ...`. That is the place they had at a3b8536 (there they came after `cat_tunnel` and `heating_pad`, which have since moved up to epic). The codex lists and `toysFor` follow `RELIC_IDS`; `tests/sim.toyRanks.test.ts` "lists the toys rank by rank" (rank order of the array, and the codex list equal to the array) passes. `relics.ts` keeps its own row order (the batteries row was never moved there).

`src/game/data/strings.ts` is untouched: the texts read the numbers through `{a}` / `{b}` (batteries ko `레이저가 {a}초 더 오래가고 {b}초 빨리 돌아와요` now says 2 and 3; blanket `... 적이 받는 피해 +{b}%` says 8; crate `바로 생선 +{a}, 소환 비용 상한 −{b}` says 100 and 15). `npm run font` reproduces `game-kr.a3dcbdba.woff2` (no new glyph). The laser card (`LaserCard.ts`) and the guide read `relicSpec('batteries').fx` through `laserMath.laserFacts`, so they show +2 s / -3 s with no edit; `docs/handoff/hud.md` and the spec's §8 line ("8.5 s / 12 s") already said 2 and 3 (they had gone stale while the tree held 4 and 5; they are right again).

### Files

| File | Change |
|---|---|
| `src/game/data/relics.ts` | the three rows |
| `src/game/data/roster.ts` | `RELIC_RARITY`: batteries rare, entry moved behind `kneading_cushion` |
| `src/game/api.ts` | `RELIC_IDS`: batteries moved from the common group to the rare group (behind `kneading_cushion`) |
| `tests/*` | see below |
| `docs/명세_전투규칙.md` | §9 (formula 1.12 -> 1.08, the damage-product paragraph 12% -> 8%), §12 economy line (crate +50 -> +100), §13 (rank sentence, toy table, measurement table, rank means, notes, "리드 조정" sentence, whole-run table) |
| `docs/기획서_GDD.md` | toy rank table: common 8 / rare 8 (batteries listed among the rares) |
| `docs/진행상황.md` | the toy line and the whole-run line |
| `docs/qa/batch4_toys_report.md` | rebuilt: the one table of all 30 toys, now |
| `docs/handoff/batch4_toys.md` | this section |

### Tests (each edit is the number only; formulas kept)

* `tests/sim.relics.test.ts`
  * batteries: title "4 seconds longer and comes back 5 seconds sooner" -> "2 ... 3"; `LASER_DURATION + 4` -> `+ 2` (twice); `cooldownTotal` `10` -> `12` (twice; 15 - 3).
  * sardine crate: title "+50 fish ... 10 lower" -> "+100 fish ... 15 lower"; `toBe(50)` -> `toBe(100)`; `SUMMON_CAP - 10` -> `- 15`.
  * nap blanket "takes 12% more damage ...": title 12% -> 8%; `enemyDamageTaken: 0.12` -> `0.08`; every `1.12` -> `1.08` (cucumber `100 * (1 - 0.08) * 1.08`, tangerine `100 * (1 - 0.35) * 1.08`, burn and bleed ticks `... * 1.08`, the cone's `[blanket, 1.08]`); comment "33.6 + 33.6" -> "32.4 + 32.4".
  * nap blanket "the damage factor is one of the vulnerability factors ...": `armoured * 1.12` -> `1.08`; `armoured * 1.25 * 1.12` -> `1.25 * 1.08` (comment: "1.25 x 1.08 = 1.35, not 1.33"); `1.25 * 1.15 * 1.15 * 1.12` -> `* 1.08` (twice; comment 1.85 -> 1.79, still under 2). The first cap case (vulnerability 60%, 1.6 x 1.15 x 1.15 = 2.1 before the blanket, held at 2x with or without it) is untouched. **The last case had to be recomputed, not just renumbered:** with 8% the old sum 1.6 x 1.15 x 1.08 = 1.99 no longer crosses the cap of 2.0, so "the blanket reaches the cap on its own account" would have tested nothing. The vulnerability of that case went `0.6` -> `0.65`: alone 1.65 x 1.08 = 1.78 (`armoured * 1.65`, `armoured * 1.65 * 1.08`); with the focus 1.65 x 1.15 = 1.90 without the blanket (`armoured * 1.65 * 1.15`, not held) and 1.65 x 1.15 x 1.08 = 2.05 with it, held at `VULNERABLE_CAP`. The old `expect(1.6 * 1.15 * 1.12).toBeGreaterThan(VULNERABLE_CAP)` became `expect(1.65 * 1.15 * 1.08).toBeGreaterThan(VULNERABLE_CAP)`, plus a new `expect(1.65 * 1.15).toBeLessThan(VULNERABLE_CAP)` (stricter: the cap is reached only because of the blanket).
* `tests/view.hud.laser.test.ts`: `f.toy.duration` `4` -> `2`, `f.toy.cooldownCut` `5` -> `3`.
* `tests/sim.rules.test.ts`: crate price `SUMMON_CAP - 10` -> `- 15`.
* `tests/sim.data.test.ts`: `sardine_crate` fx `{ instantFish: 50, costCapCut: 10 }` -> `{ instantFish: 100, costCapCut: 15 }`.
* `tests/sim.toyRanks.test.ts`: counts `9 / 7 / 8 / 6` -> `8 / 8 / 8 / 6` (title and the object); the blanket's pin `enemyDamageTaken: 0.12` -> `0.08` (comment); **new test** "keeps the second-round values the owner set": batteries rare with `{ laserDuration: 2, laserCooldownCut: 3 }`, blanket rare with `enemyDamageTaken` 0.08, crate epic with `{ instantFish: 100, costCapCut: 15 }`. The "shown numbers" record needs no edit (it reads `fx`).
* Looked at and left alone: `tests/sim.flow.test.ts` (`summonCost()` 12 after a crate at zero paid summons: the cap does not apply yet; the offer tests), `tests/sim.enemyResist.test.ts` (the blanket's 10% slow), `tests/view.field.cells.test.ts` (`cellExtra(['batteries', 'sunny_spot'])` is about the sunny spot), `tests/sim.stakeResist.test.ts` (a saved snapshot lists the relic pool in its old order; the snapshot is data, not a rank check), `tests/codex.text.test.ts`.
* Negative controls (a scratch copy of the tree, one change at a time, seven test files; each fails 2-4 tests, the unchanged copy passes): batteries at 4 / 5, at 3 s only, at 4 s of recharge only, batteries back at common; blanket at 12%, 10%, 6%; crate at 50 / 10, at 150 fish only, with the cap at 10 only, at rare.

### What depends on a rank or on a count per rank, and how it was checked

* Offer odds by stage (`RELIC_RARITY_WEIGHTS`, `rollRelicOffer`): weights are per rank, so only a toy's share inside its rank moved (rare: 8 toys instead of 7, common: 8 instead of 9). Measured on 1,500 seeds per stage in a scratch copy (`rollRelicOffer` exported there only): rank shares of the offers 70.4/20.9/8.7/0 (after stage 1; the 9% epic is the counter slot), 68.5/31.5/0/0, 16.8/39.5/43.6/0, 8.7/47.6/43.6/0, 0/0/60.7/39.3 (the third pass: 70/21/9/0, 68.5/31.5/0/0, 17/40/44/0, 9/48/44/0, 0/0/61/39). Offer share of one toy: batteries 2.7% / 2.7% / 5.2% / 5.3% / 0 after stages 1-5 (as a common toy it shared the common rank's 70% with eight others; as a rare it shares the rare rank's share with seven), blanket 2.4 / 2.5 / 4.5 / 4.7 / 0, crate 0 / 0 / 3.8 / 3.8 / 7.4. `tests/sim.flow.test.ts` "weights rarities by act" and "puts a toy that answers the next act's trait into the offer" pass unchanged; `tests/sim.toyRanks.test.ts` pins that every weighted rank has toys and that each rank can fill an offer of three twice over.
* Codex filter and order (`toysFor`, `TOY_RARITIES`, `RELIC_IDS` order): both come from `RELIC_RARITY` and `RELIC_IDS`; "lists the toys rank by rank" and `tests/codex.text.test.ts` pass.
* `COUNTER_RELICS`: none of the three is on a list, none was added (`tests/sim.toyRanks.test.ts` still asserts that no list holds the blanket).
* `RELIC_SCORE` in `src/game/sim/bots.ts` (batteries 4, blanket 5, crate 5) was not touched. The bots' own picks change a little with the ranks, so the base state moves a point (see below).

### Measurement (report only; no value was changed because of it)

Same method as before: `SIM_ONLY=toys`, each toy handed out before wave 5, stake 0, chapter 1 L1 / chapter 3 L3 x merge / synergy bot, 600 runs per cell, same seeds, one toy per process (`before.txt`, `after.txt`), then all 30 in ten processes of three (`after_all30.txt`). Raw output: the lead's scratchpad `batch4/toys4/` (`before.txt`, `after.txt`, `after_all30.txt`, `out_before/`, `out_after/`, `out_all30/`, `out_bots/`, `rankmeans.txt`). The "before" run (the tree as found) reproduces the third pass to the digit (batteries +2.3, blanket +4.3, crate +8.8; base 66 / 57 / 91 / 87%).

| toy | before (tree as found) | after | cells after (m1 / m3 / s1 / s3) |
|---|---|---|---|
| batteries (common +4 s / -5 s -> **rare +2 s / -3 s**) | +2.3 (-0.3 / +0.5 / +3.5 / +5.3) | **+1.9** | +0.2 / +0.2 / +3.3 / +4.0 |
| nap_blanket (rare, damage 12% -> **8%**) | +4.3 (+5.5 / +8.2 / +2.2 / +1.2) | **+3.1** | +4.2 / +5.2 / +2.7 / +0.5 |
| sardine_crate (epic, +50 / -10 -> **+100 / -15**) | +8.8 (+10.7 / +15.0 / +4.0 / +5.7) | **+12.0** | +15.3 / +19.5 / +6.5 / +6.8 |

Standard errors 0.3 (batteries), 0.5 (blanket), 0.7 (crate). The base state (no toy handed out): m1 66 -> 65%, m3 57%, s1 91 -> 90%, s3 87%. The 27 toys that were not touched read 0.2 points higher on average than in the third pass's run (largest: yarn ball +1.0).

**Alarming, said again here:** the crate is the strongest of the 30 by far (+12.0; next shooting star +9.0, auto feeder +8.4, hourglass +7.9), and +19.5 in the merge-bot chapter-3 cell. a3b8536's +150 / -15 was +13.4. Per-rank mean of all 30 after (one run): **common 4.5 (8) / rare 4.0 (8) / epic 5.9 (8) / legendary 5.0 (6)**; the third pass was 4.1 / 4.2 / 5.3 / 4.8 (9 / 7 / 8 / 6 toys), a3b8536 3.7 / 4.8 / 3.8 / 3.8 (8 / 8 / 8 / 6). Rare is now the lowest rank (batteries +1.9, kneading cushion +2.5, glass marble +2.7, blanket +3.1, cat tower +3.3) and epic is carried by the crate (5.0 without it); legendary is 5.9 without the nine lives (+0.2). Whole runs (1000 runs, stake 0), merge / synergy: ch1 66 / 90, ch2 64 / 91, ch3 58 / 86, ch4 71 / 92, ch5 73 / 95 (third pass: 66 / 91, 63 / 92, 58 / 86, 71 / 92, 74 / 95; a3b8536: 62 / 88, 61 / 90, 59 / 88, 69 / 92, 72 / 93). Outside the targets 60-75 / 85-92: ch3 merge 58% (2 under) and ch5 synergy 95% (3 over), as in the third pass.

### Checks

`npx tsc --noEmit -p .` prints nothing. Whole suite: 163 files, 3,506 tests, all pass (3,505 as found + the new pin test). `npm run font` reproduces the same subset.
