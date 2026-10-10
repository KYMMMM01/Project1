# Batch 4, item T8: control resistance by butler level (key: stakes)

Owner's words (T8): "난이도별로 보스 체력만 늘어나는 게 아니라 제어 저항 같은 것도 올라갔으면 좋겠음." Decisions: `docs/qa/directive_2026-10-10_batch4.md`.

## What changed

From butler level 1 up, elites and bosses resist control more. The numbers are the level's own (not summed):

| Butler level | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| Slow cap on elites and bosses | 25% | 23% | 21% | 19% | 17% | 15% |
| An elite's stun and freeze duration | 50% | 46% | 42% | 38% | 34% | 30% |

Unchanged at every level: normal enemies, bosses' stun and freeze immunity, the black-hole pull factors (elite 0.35, boss 0.2), armour break, vulnerability, the laser.

### Code

- `src/game/data/balance.ts`: `STAKE_SLOW_CAP_STEP = 0.02` and `STAKE_ELITE_CC_STEP = 0.04`, next to `SLOW_CAP_BOSS` / `ELITE_CC_FACTOR`. These two steps are the only numbers; there is no table.
- `src/game/data/types.ts`: `StakeRules` gets `specialSlowCap` and `eliteCcFactor`.
- `src/game/data/stakes.ts`: `stakeRules(n)` fills them (`clean(SLOW_CAP_BOSS - n * STEP)`, rounded to 3 decimals so 0.19 is 0.19; level 0 returns `SLOW_CAP_BOSS` and `ELITE_CC_FACTOR` themselves). New `stakeControlText(n)` (the one line; `''` for level 0 or less, clamps above 5). Exported from `src/game/index.ts`.
- `src/game/sim/enemies.ts` `applyStatus`: slow `cap = isBoss || isElite ? s.rules.specialSlowCap : SLOW_CAP`; elite stun/freeze `d = length * s.rules.eliteCcFactor`. The last batch's slow resistance stays exactly as it was: `min(amount * (1 + slowBoost), cap) * (1 - e.spec.slowResist)`, so the level's cap is inside the `min` and the enemy's own resistance multiplies after it. The toy's boost comes before the cap; `statusMult` (cats) stretches the duration before the elite share.
- Codex: `resistanceOf(id, level)` now takes the level (was `resistanceOf(id)`); `foeText.ts` and `tipsOf` pass it. The control rows ("둔화 N%까지만 들어가요", "기절·얼림 시간이 N%로 줄어요") and the stun tips follow the chosen butler level. `docs/handoff/codex.md` still shows the old one-argument call in prose; I did not edit it.
- Guidebook: `guide/facts.ts` `stakes` fact gets `c1..c5` (= `stakeControlText(1..5)`), the rule texts `s1..s5` go through `closed()` (a period is added to the terse "소환 비용 +10%" style rules so the control line can follow in the same paragraph); `guide.stakes.full` (ko, en) has `{cN}` after each level and one closing sentence.
- Chapter card (`screens/battle/ChapterCard.ts`): the bubble under the level tags shows the rule and, from level 1, the control line under it (second label, 24 px, `Color.berryDark`). `BUBBLE_H` 118 -> 168, so `CHAPTER_CARD_H` grows by 50 design px (the start button and everything under the card move down by that much). The labels are stacked and centred by `placeRule()`; a running slide is killed before the labels are re-placed.
- Pre-run page (`screens/shell/PreRunScreen.ts`): "이번 판 규칙" ends with the control line of the chosen level (one bullet more).
- `docs/명세_전투규칙.md`: new block after the stake table in section 13, and the stake caps named in the slow row and the stun/freeze row of the status table and in the slow-resistance note.

### New strings (exact)

- `stake.ctrl` ko: `정예·보스는 둔화가 {a}%까지만 통하고, 정예는 기절·얼림 시간이 {b}%로 줄어요.`
- `stake.ctrl` en: `Elites and bosses take slows only up to {a}%, and elites are stunned or frozen for just {b}% as long.`
- `guide.stakes.full` ko: each level line is `첫째: {s1} {c1}` ... `다섯째: {s5} {c5}`, last line `높은 단계는 낮은 단계의 규칙도 모두 포함해요. 정예·보스가 제어에 버티는 정도만 그 단계의 숫자로 바뀌어요.`
- `guide.stakes.full` en: `First: {s1} {c1}` ... `Fifth: {s5} {c5}`, last line `Every level includes the rules of the lower ones. Only how well elites and bosses resist control is replaced by that level's numbers.`

`npm run font` was not run (Build phase). `tests/core.font.test.ts` passes with the new strings, so no glyph is missing; the Wording phase should still run it once after its own text changes. `stake.2` still says "막을 깰 때" (the wording engineer's item C).

## Findings

- Root cause: both caps were global constants read inside `applyStatus` (`SLOW_CAP_BOSS`, `ELITE_CC_FACTOR`, `sim/enemies.ts`) and in `codex/foes.ts` `resistanceOf`; a butler level had no way to reach them. The level's rules (`StakeRules`) are rebuilt in the Sim constructor from `init.stake`, which is the one place both the sim and the codex can read.
- `boss_cucumber` (chapter 1's wave-8 enemy) has the trait `elite`, not `boss`. It is stunnable and follows the elite share; only the five `boss`-trait enemies (vacuum, blender, bath, cloud, needle) are stun-immune. Confirmed in `applyStatus` (`e.isBoss` returns first). The spec and the tests say so.
- The `control` section of `tests/simreport.sim.ts` counts all enemies together; it does not show elite or boss slow uptime.

## Saves

A wave-start save holds `init` (with `stake`), the board, counters and streams, and no rules. The rules are rebuilt by `new Sim(init)` from `init.stake`. So a save made before this change is the same shape as one made now and loads as is; a resumed run plays with the new numbers from the restored wave on (like any other rule change; the sim version stays 3). Tested with a real save written by commit a3b8536 (embedded byte for byte in `tests/sim.stakeResist.test.ts`): it opens, the rules equal `stakeRules(3)`, the wave starts, a slow on an elite lands at 19% and a stun at 38%.

## Measurements (report only, nothing tuned)

Setup: two copies of the repository in the scratch folder, one at a3b8536 and one with exactly my sim/data change on top (other engineers' work in the shared tree excluded), `tests/simreport.sim.ts`, 500 runs per cell, chapter 1, unit level 1, same seeds (`10007 + i * 7919`).

Stake 0 does not move at all:
- `SIM_ONLY=stakes` stake 0, `ch1` (random, merge, synergy) and `control` (4 classes): every column equal before and after except the timing column (win 88%, wave 22.9, 1stLeg 8.0, 1stMyth 12.0, myth% 93%, caution 36%, surplus 1.76, boss% 49%, min 7.5, merges 22, molts 0.77 for synergy). The control section was identical as a whole (run twice for the patched copy).
- A hash of the complete `RunResult` of every run (everything but `simMs`, tally on): 3 bots x chapters 1, 3, 5 x 60 runs at stake 0 = 540 runs, hashes equal; at stakes 1 to 5 all 45 cells differ (as they must).

Chapter 1, synergy bot, `SIM_ONLY=stakes` (win rate, mean wave, before -> after):

| Stake | win | wave | caution | boss% |
|---|---|---|---|---|
| 0 | 88% -> 88% | 22.9 -> 22.9 | 36% -> 36% | 49% -> 49% |
| 1 | 74% -> 75% | 21.0 -> 21.0 | 73% -> 74% | 48% -> 48% |
| 2 | 66% -> 65% | 20.7 -> 20.7 | 81% -> 81% | 50% -> 50% |
| 3 | 52% -> 52% | 19.1 -> 19.1 | 83% -> 83% | 51% -> 52% |
| 4 | 34% -> 36% | 15.7 -> 15.8 | 76% -> 77% | 54% -> 55% |
| 5 | 21% -> 22% | 12.2 -> 12.1 | 64% -> 62% | 61% -> 60% |

All stake 1 to 5 differences are inside the sampling error of 500 runs (about 2 points): the bots' win rate does not feel the change. Elite and boss control uptime (own scratch probe, 300 runs per stake, synergy bot, chapter 1; counts the field seconds of spray, firecracker and the six boss_ enemies):

| Stake | slowed share of their field time | mean slow while slowed | stunned | frozen |
|---|---|---|---|---|
| 0 | 35.6% -> 35.6% | 22.9% -> 22.9% | 0.7% -> 0.7% | 0.4% -> 0.4% |
| 1 | 36.1% -> 36.3% | 22.8% -> 21.7% | 0.7% -> 0.7% | 0.4% -> 0.4% |
| 2 | 35.5% -> 35.4% | 22.9% -> 20.6% | 0.6% -> 0.5% | 0.4% -> 0.3% |
| 3 | 32.7% -> 32.9% | 22.8% -> 19.0% | 0.6% -> 0.5% | 0.3% -> 0.3% |
| 4 | 32.0% -> 31.6% | 22.6% -> 17.0% | 0.6% -> 0.4% | 0.3% -> 0.2% |
| 5 | 28.3% -> 28.6% | 21.9% -> 15.0% | 0.7% -> 0.4% | 0.2% -> 0.1% |

So the slow on elites and bosses is mostly at the cap (the mean tracks it), and the bots' elites and bosses are stunned or frozen under 1% of the time. A boss under a full slow walks at 85% of its speed at level 5 instead of 75% (13% faster), which the bots do not turn into lost runs because most losses are boss time-outs, not boss arrival. If the owner wants the resistance to show up in difficulty, the steps need to be bigger, or the stun/freeze factor is the wrong lever (stuns barely happen); that is the owner's call.

## Tests

- New `tests/sim.stakeResist.test.ts` (18 tests): the ladder 25/23/21/19/17/15 and 50/46/42/38/34/30; derived from the two steps, no float noise; level 0 is the base constants (`Object.is`); clamping; the sim at every level (elites and bosses by the level's cap, normal enemies at 50% x (1 - own resistance), elite stun and freeze by the share, bosses immune, normal enemies whole); cap inside the min and the enemy's own resistance after it, toy boost before the cap; `statusMult` before the elite share; pull, armour break and vulnerability equal at every level; level 0 exact; saves (format has no rules key, rules rebuilt on restore at levels 0, 2, 5, the real a3b8536 save); `stakeControlText` (empty at 0, own numbers, ko and en, no placeholders, length guard). Checked that it fails when the `enemies.ts` change is removed (5 tests fail).
- `tests/sim.data.test.ts`: `stakeRules(0)` and `stakeRules(5)` `toEqual` now include `specialSlowCap` and `eliteCcFactor` (0.25 / 0.5 and 0.15 / 0.3), because the object has two more fields; nothing else changed.
- `tests/codex.foes.test.ts`: "says what the simulation does to a slow, a stun and a freeze" now plays every butler level (it was level 0 only) and passes the level to `resistanceOf`, which has a new second argument; the level-0 expectations are kept as they were. New "follows the butler level" test (ladder, boss immunity, normal enemy, out-of-range levels). It uses `boss_vacuum` for "stun does not work" because `boss_cucumber` is an elite by trait.
- Whole suite: 156 of 157 files pass; `tests/sim.perf.test.ts` failed once under load and passes alone. `npx tsc --noEmit -p .` clean at the end.

## Seen on screen (headless Edge, own dev server)

- Chapter card bubble at levels 0 to 5, ko and en: the longest case (level 5: two lines of rule and two of control) fits in the 168 px bubble with 20 px around it. Level 0 shows only "기본 규칙으로 해요." in a roomy bubble.
- Codex pages: `spray` at level 5 (둔화 15%까지만 / 시간이 30%로 줄어요, tip "…30%로 줄고, 둔화는 15%까지만"), `boss_vacuum` at levels 0 and 3 (19%, 안 통해요), `boss_cucumber` at level 2 (21%, 42%).
- Guidebook "집사 단계" topic, ko and en: every level has its control sentence.
- Pre-run page at level 5 (ko) and level 1 (en): last bullet is the control line.

## Not verified / open for the owner

- Whether the effect is felt (see the tables: invisible in bot win rates). Suggest a decision on bigger steps only after a human playtest.
- The card is 50 design px taller at every level (also level 0, whose bubble has empty room now). A bubble that sizes itself would move the start button when the level is switched; I kept the layout fixed.
- A save resumed after the update plays with the new resistance from the resumed wave.
- Fonts: see above.
- The attendance popup that item A opens on the home screen stood in the way of my clicks in the headless browser; I closed it by hand in my scripts (no change to it).
