# Handoff: batch 5, area "dungeon" (item 3: the gold dungeon)

Date 2026-10-12, base commit `27301a1`. Owner's words and decisions: `docs/qa/directive_2026-10-12_batch5.md` (item 3). The spec is rewritten in `docs/명세_메타.md` section 13 (and two table lines at the top and in the ad table); the enemy rows are in `docs/명세_전투규칙.md` section 11. Nothing is committed.

## What the owner asked, what I did

| Directive | Result |
|---|---|
| One entry a day, no bought entry | `DUNGEON_FREE_ENTRIES 2 -> 1`, `DUNGEON_EXTRA_ENTRIES 1 -> 0`. The buy code, the card's buy row and the ad placement are kept (put 1 back to sell it again). |
| Mobs are coins, the boss is a treasure chest, the boss comes on the last wave only | New enemies `coin` and `boss_treasure`. Waves 1-7 are coin waves (normal waves, 15 s clock), wave 8 is a boss wave: the chest walks in 1 s after the wave starts with 24 coins as its escort, and its death is the victory. Nothing else appears. |
| About a third of today's enemies (aim 120-140) | 399 -> **131** (97 coins in waves 1-7, 24 escort coins, the chest, and 9 coins the chest spills). |
| Gold per kill up, boss a large lump | per kill 0.6 -> 4; the chest pays a lump (456 x tier multiplier) that replaces the old x1.25 and the first-clear bonus. |
| A run's maximum about 90% of today's daily maximum (tier 1: 1,348 -> about 1,200) | tier 1..5: **1,200 / 1,560 / 1,920 / 2,400 / 3,000** = 89.0 / 88.9 / 89.0 / 88.9 / 89.0% of the old 1,348 / 1,754 / 2,158 / 2,698 / 3,372. |
| Easy: merge bot 95%+, synergy bot 99%+ at each tier's recommended level | measured on all five tiers: **100% / 100%** (400 runs each, no loss). |
| Dungeon must not leak | coin and chest are in the dungeon script only (test over every chapter, daily, endless, tutorial script up to wave 60). |

## The new pay formula (one formula)

```
gold = round( ( sum over the w waves cleared of (14 + 3w)   +   4 x kills   +   (win ? 456 : 0) ) x chapter multiplier of the tier )
       kills are counted up to 131 (what the script can spawn); chapter multiplier 1 / 1.3 / 1.6 / 2 / 2.5
```

Before: `round((waves + 0.6 x kills) x mult x (win ? 1.25 : 1))` per run, plus `200 x mult` once a day for the first win. A win is the chest falling (it is the last wave's target), so "win" and "chest opened" are the same thing and the folded first-clear bonus is the chest's lump. The chest's share is reported separately as `RunReward.bonus` (it is already inside `gold`; the result screen shows it as "보물상자 +N 골드"). Code: `src/meta/dungeon.ts` (`dungeonGold`, `dungeonChestGold`, `dungeonMaxGold`, `dungeonMaxChest`), constants `src/meta/data/dungeon.ts` (`DUNGEON_KILL_GOLD 4`, `DUNGEON_CHEST_GOLD 456`; `DUNGEON_VICTORY_MULT` and `DUNGEON_FIRST_CLEAR_GOLD` are gone).

Per-tier table (one run a day):

| Tier | Old daily maximum (2 free runs + bonus) | New run maximum | of which the chest | A typical bot run pays (win, mean of 400) merge / synergy |
|---|---|---|---|---|
| 1 | 1,348 | 1,200 | 456 | 1,200 / 1,198 |
| 2 | 1,754 | 1,560 | 593 | 1,560 / 1,558 |
| 3 | 2,158 | 1,920 | 730 | 1,920 / 1,917 |
| 4 | 2,698 | 2,400 | 912 | 2,399 / 2,398 |
| 5 | 3,372 | 3,000 | 1,140 | 2,999 / 2,997 |

A bot run pays the maximum within a coin or two, because the easy dungeon lets it catch every coin. A player who loses before the chest is paid the waves and kills only (waves up to 7 with 100 kills: 582 at tier 1).

## Bot numbers before -> after (reported, not acted on beyond the dungeon's own numbers)

Recommended unit level per tier (1 / 2 / 3 / 4 / 6), mode `gold`, `tests/simreport.dungeon.sim.ts` (new; `npx vitest run --config vitest.sim.config.ts tests/simreport.dungeon.sim.ts`, env `SIM_RUNS`, `SIM_TIERS`, `SIM_BOTS`, `SIM_LEVEL`). Before = the script of `27301a1`, 200 runs a cell; after = 400 runs a cell.

| Tier | merge win | synergy win | enemies killed (synergy mean) | run length min, merge / synergy |
|---|---|---|---|---|
| 1 | 62% -> 100% | 87% -> 100% | 349 -> 131 | 1.79 / 1.99 -> 2.47 / 2.36 |
| 2 | 61% -> 100% | 85% -> 100% | 345 -> 131 | 1.78 / 1.99 -> 2.47 / 2.37 |
| 3 | 63% -> 100% | 84% -> 100% | 345 -> 131 | 1.79 / 1.98 -> 2.47 / 2.37 |
| 4 | 61% -> 100% | 85% -> 100% | 350 -> 131 | 1.78 / 2.01 -> 2.44 / 2.35 |
| 5 | 74% -> 100% | 91% -> 100% | 362 -> 131 | 1.89 / 2.05 -> 2.43 / 2.35 |

All old losses were "overrun" (too many enemies on the field: 77 of 200 for the merge bot at tier 1). Now none of the 4,000 runs lost and none reached the caution level (two thirds of the enemy cap). The time the chest took, as a share of its 60 s limit, is 0.52-0.59 for the merge bot (median) and 0.44-0.46 for the synergy bot (0.45 is the floor the damage allowance sets). With cats a level or two below the recommended one it stays at 100% / 100% (tier 3 at level 1, tier 5 at level 1: 150 runs each; the chest takes 0.49-0.68 of the limit). The run is about 2.4 minutes (it was about 1.8 to 2.0): 3 s prep, seven 15 s waves, the stage-end pause, and the chest's 27 s minimum.

Numbers I chose inside the dungeon (none outside it changed): coins per wave 10 / 12 / 13 / 14 / 15 / 16 / 17 and 24 escort (`COINS` in `goldDungeon.ts`), coin health multiple 0.6, coin speed 82, coin fish 3, chest health 600 x tier multiple, chest limit 60 s, chest speed 34, spill 3 coins at 75 / 50 / 25%. I first tried 900 health with a 50 s limit (merge bot 98-99%, every loss a chest timeout), then 600 / 50 (99-100%), and settled on 600 / 60 (100%): "generous" here means the weakest bot board has room, not a long fight.

## The two enemies

- `coin` (ko 금화, en Gold Coin): ordinary enemy, health 0.6 cucumber, speed 82 (a cucumber is 70, a drop 125), armour 5% (the small quick enemies' value; it was 0 until the batch-5 review, see `docs/handoff/batch5_close.md`), ward 0, slow resistance 0, no trait, radius 14, 3 fish. Ordered with the ordinary enemies in `ENEMY_IDS` (after `dryer`).
- `boss_treasure` (ko 보물상자, en Coin Chest (was Treasure Chest; cut to "Treasure Ch…" on the boss strip)): trait `boss` (so stun and freeze never land and the slow cap is the boss 25%, as for every boss), speed 34 (the slowest boss), armour 0, ward 0, ability `spill`, health `GOLD_DUNGEON_BOSS_HP` 600 x the tier's chapter multiple (not the `BOSS_HP` table), limit `GOLD_DUNGEON_BOSS_LIMIT` 60 s. Last in `ENEMY_IDS`. The id starts with `boss_`, so `isWaveTarget` reads it as a boss with no change.
- **The ability I chose** (you asked me to say): the boss machinery itself does not need an ability (`ability` is optional and the switches have defaults), but `tests/sim.data.test.ts` states "every `boss_` enemy has exactly one ability with data", so I kept that guard and gave the chest a harmless one, **`spill`**: each time its health first falls to 75%, 50% and 25%, three coins pop out around it (`BOSS_SPECS.spill = { at: [0.75, 0.5, 0.25], count: 3, spawn: 'coin' }`). Nothing in it hurts a cat or a cell; it only adds coins to catch (9 more kills = 36 gold at tier 1). New `BossAbilityId` `'spill'` (api.ts), `BossSpec` member (data/types.ts), logic in `sim/boss.ts` (`startBoss`, `updateBoss`; the share check is per tick, so a jump over two shares spills both; `Sim.spillStep` is the counter), director caption "금화가 쏟아져요!" with a coin burst and the `coin_many` sound, codex ability text, sound plan.
- **No rage**: the simulation marks every wave target `enraged` at half health (red tint, banner, roar; it speeds up only the enrage ability's boss). For the chest that would read as a threat, so `EnemySpec.calm` (new optional flag, data/types.ts) skips it in `damageEnemy`; only the chest sets it.
- **No sprite yet / a sprite lost**: the sprites exist (the lead put `src/assets/img/enemy_coin.webp` and `boss_treasure.webp` in), wired by the usual key rule (`enemy_` + id, bosses by their own id). If one is ever missing, `enemyArtKey` (view/field/warmPlan.ts, which `EnemyView` now shares through `enemyTextureKey`) falls back to the icon set's `icon_gold` (a gold coin) for the coin and `icon_chest_gold` for the chest, so a player would see a plain gold coin / gold chest instead of an invisible body with only its shadow and health bar. Nothing else has a stand-in. Test: `tests/view.field.warm.test.ts` (also checks that a file exists for every enemy).

## The run in the simulation

- `src/game/data/goldDungeon.ts`: `goldDungeonScript(w)` gives waves 1-7 as `normal` coin waves and wave 8 as `kind: 'boss'`, `boss: 'boss_treasure'` with coins as `groups` (budget = coins x the coin's health multiple, so `waveEntries` gives exactly the counts above). `goldDungeonSpawns()` = the script's enemies + the chest + the spill (131). New `GOLD_DUNGEON_BOSS_HP`, `GOLD_DUNGEON_BOSS_LIMIT`.
- `src/game/sim/flow.ts`: `waveLimit` takes the dungeon's limit in `gold` mode (toys and training still add to it, no butler cut); `spawnTarget` reads `s.scriptOf(wave)` (it read the chapter script before, which would have spawned the chapter's boss) and takes the chest's health in `gold` mode; the stage-end comment of `endNormalWave`. `Sim.waveHealth` follows. The damage allowance (`BOSS_MIN_KILL`) is the chapters' own formula, so the chest cannot fall in less than 27 s.
- A chest loss (time) can be revived like any boss; an overrun too. Both are unchanged code.
- `src/game/sim/enemies.ts`: one condition (`!e.spec.calm`) in the half-health rage.

## Old data

- **Day counters**: `used` 1 or 2 of the old 2+1 now reads as 0 left today ("입장 0/1"); a bought entry (`bought` 1) that was not yet used is still honoured (entries = free + bought - used, so "1/2"); nothing more can be bought; the day rolls at midnight as before. `DungeonDay.firstClear` is removed from the type and from `freshDay`; an old save that still has the key loads fine (unknown keys are kept by `deepFill` and are dropped by the next day's `freshDay`). Tests: `meta.dungeon.test.ts` ("reads a day saved under the old rules", "loads a day and records saved under the old rules").
- **Records** (`dungeon.best[tier]` = waves, kills, gold): an old record (gold at most 574 at tier 1, kills up to 399) is read as it is and shown by the card. The new record rule compares the run's whole pay (chest included) to it: any new win at tier 1 is 1,000 or more, so the first win replaces it; a lost run does not take it away. (Before, the record excluded the once-a-day bonus; now there is none.)
- **A run saved mid-way under the old script (a pending run)**: decision = **resume with the new script from its wave** (do not settle it). A wave-start save holds the board, the currencies and the counters, never the script, so it plays on at the same wave number of the new script (an old save at wave 8 lands on the chest's wave). Its stored kill count may be above the new maximum (up to 399): `dungeonGold` counts kills only up to 131, so it cannot pay more than a full clear of the new script. Settling a pending run (the "give up" path) is unchanged and pays the waves only. Tests: `meta.dungeon.sim.test.ts` ("resumes a run saved under the old eight-wave script"), `meta.dungeon.test.ts` ("holds the kills to what the script can spawn", "pays a run resumed from the older, longer script").
- The entry is still taken when the run starts and not given back (closing the app does not give it back, "continue" resumes). With one entry a day that is stricter than before; say if you want an interrupted run to give it back.

## Other places that changed

Source (by area):
- game data and sim: `api.ts` (`ENEMY_IDS` +2 ids, `BossAbilityId` +`spill`), `data/types.ts` (`BossSpec` +`spill`, `EnemySpec.calm`), `data/enemies.ts` (the two specs, `BOSS_SPECS.spill`), `data/strings.ts`, `data/goldDungeon.ts` (rewritten), `sim/flow.ts`, `sim/sim.ts`, `sim/boss.ts`, `sim/enemies.ts`.
- meta: `data/dungeon.ts` (rewritten), `dungeon.ts` (rewritten), `rewards.ts` (the dungeon branch of `computeRunPayout`, no `dungeonFirstDone`), `profile.ts` (`dungeonView`: `chest` replaces `bonus`, no `firstClearOpen`; the record; no boss count for `gold`), `types.ts` (`DungeonDay`), `missions.ts` (`freshDay`; the chest is not a boss for the missions: `bossAndEliteKills` returns 0 for `gold`), `index.ts` (exports).
- screens: `battle/DungeonCard.ts` ("보물상자 +N" tag, always shown while an entry is left), `battle/dungeonModel.ts` (comment), `battle/ChapterPhoto.ts` (`bossSticker` takes an optional boss picture), `battle/strings.ts`, `shell/PreRunScreen.ts` (the chest as the boss sticker, three rule lines), `shell/strings.ts`, `system/strings.ts`.
- view: `view/hud/screens/ResultScreen.ts` and `hud/strings.ts` (the chest line, formatted with thousands separators), `view/field/enemyView.ts` + `field/warmPlan.ts` (stand-in rule), `view/director/palette.ts` (+ tints and the ability caption key), `director/strings.ts`, `director/boss.ts` (the coin burst), `view/soundPlan.ts`.
- audio: `audio/combat.ts` (the two materials). **The chest has no death sound of its own yet**: it uses the blender's glass burst (`foe_boss_blender`) and a low tin hit. `tests/audio-combat.test.ts` expects 6 distinct boss deaths and still gets 6. A coin-shower death would suit the audio engineer.
- codex: `codex/foes.ts` (`dungeonOnly`, `dungeonWaves`, `levelOf`; `healthSpan` and `targetRows` read the dungeon for these two; the `spill` ability), `codex/foeText.ts` (the "골드 던전" row first under "나오는 곳", butler level ignored for them), `codex/stringsKo.ts`, `stringsEn.ts`.
- guide: `guide/facts.ts`, `stringsKo.ts`, `stringsEn.ts` (the dungeon topic).
- docs: `docs/명세_메타.md` section 13 and two table lines, `docs/명세_전투규칙.md` (two rows and a note).

## New and changed strings (ko / en, exact)

New:
- `enemy.coin.name` 금화 / Gold Coin; `enemy.coin.desc` 데구루루 굴러오는 금화예요. 잡을수록 골드가 쌓여요. / A shiny coin rolling your way. Every catch adds to your gold.
- `enemy.boss_treasure.name` 보물상자 / Coin Chest; `enemy.boss_treasure.desc` 느릿느릿 걸어와요. 두드리면 금화가 쏟아져요! / It plods along slowly. Hit it and coins spill out!
- `director.ability.spill` 금화가 쏟아져요! / Coins are spilling out!
- `codex.appear.dungeon` 골드 던전 (챕터에는 안 나와요) / Gold Dungeon (never in a chapter)
- `codex.ability.spill.name` 금화 쏟기 / Coin spill; `codex.ability.spill.text` 체력이 줄어드는 동안 {coin} {count}개가 {n}번 튀어나와요. 잡을수록 골드가 늘어요. / As its health drops, {count} of the {coin} pop out of it, {n} times. Every one you catch adds to your gold.
- `battle.dungeon.chest` 그중 보물상자 {n} / Chest pays {n} of it (replaces `battle.dungeon.bonus`; worded as a part of the maximum shown above it, not "+n", after the batch-5 review)
- `shell.pre.gold.rules.chest` 보물상자를 쓰러뜨리면 골드를 {n} 더 줘요. / Beat the coin chest and it pays {n} more gold. (replaces `.win` and `.first`)

Changed:
- `shell.pre.gold.rules.waves` {n}웨이브를 버티면 끝나요. 한 웨이브는 {s}초이고, 마지막에는 보물상자가 나와요. / Hold out for {n} waves, {s} seconds each. A coin chest walks in at the end.
- `shell.pre.gold.rules.pay` 넘긴 웨이브와 잡은 금화의 수만큼 골드를 받아요. 뒤로 갈수록 더 많이 줘요. / You get gold for every wave you get through and every coin you catch. Later waves pay more.
- `hud.res.dungeonBonus` 그중 보물상자 {n} 골드 / The coin chest gave {n} of that (was "오늘 첫 클리어 +{n} 골드"; the chest's share is inside the gold above it)
- `rt.sys.feat.dungeon` 짧은 판에서 금화를 잡아 골드를 모아요. / A short run where catching coins pays gold. (the old line said "twice a day"; the new one names no number so the entry rule can change)
- `guide.gold_dungeon.teach` 짧은 판에서 금화를 잡아 골드를 모아요. / A short run where catching coins pays gold.
- `guide.gold_dungeon.full` ko: {waves}웨이브를 버티는 짧은 판이에요. 나오는 건 금화뿐이고, 마지막 웨이브에는 보물상자가 걸어와요.\n넘긴 웨이브와 잡은 금화의 수만큼 골드를 받고, 보물상자를 쓰러뜨리면 큼직한 골드를 더 받아요. 하루 입장은 {free}번이에요.\n단계는 깬 챕터만큼 열리고, 높을수록 골드를 더 줘요. / en: A short run of {waves} waves. Only gold coins come, and a coin chest walks in during the last wave.\nYou are paid for every wave you get past and every coin you catch, and beating the chest pays a big lump on top. Entries per day: {free}.\nTiers open as you clear chapters, and a higher tier pays more gold.
- Removed keys: `battle.dungeon.bonus`, `shell.pre.gold.rules.win`, `shell.pre.gold.rules.first`.

**The Korean font subset was not rebuilt** (Build phase): the landing engineer runs `npm run font`; `tests/core.font.test.ts` may fail for the new glyphs until then (for example 금, 쏟, 걸, 튀, 큼, 폭 if they were not in the set).

## Tests (never loosened; each change says why)

New files:
- `tests/simreport.dungeon.sim.ts`: the balance report for the dungeon (above).
- `tests/meta.dungeon.extra.test.ts`: the old extra-entry tests with `DUNGEON_EXTRA_ENTRIES` mocked to 1 (so the code that sells an entry stays tested while the real rules sell none).

Rewritten for the new rules (the old expectations were about numbers and rules that no longer exist):
- `tests/meta.dungeon.test.ts` (42 tests): the formula and its parts, 1,200 .. 3,000 and the 88-91% of the old day, the chest's share, the kill cap, one entry, an old day / old record / old pending run, the entry rule, the missions and the boss count (the chest does not count), the save. Kept as they were (same assertions): the wave table, the tiers, unlocking, the grants, the double pay guards, the backup code.
- `tests/meta.dungeon.sim.test.ts` (17 tests): the script (seven coin waves + the chest's, only coins and the chest, 120-140 enemies, 131), nothing in other modes, the chest's arrival, health and limit, `spill` (three shares, once each, a jump over two), no rage, the stage-end and the win by the chest, the save and the old-script resume, and bots (an all-but-rare-win guard for tiers 1 and 5, not a balance gate).
- `tests/screens.shell.dungeon.test.ts`: `entriesText` for 1 entry and for the old shapes, a "never offers a purchase" case, the changed keys (and `hud.res.dungeonBonus`, whose file is now imported there).

Changed expectations in tests of other areas, because a fact they state really changed (each is the minimum):
- `tests/sim.enemyResist.test.ts`: `ARMOUR` and `WARD` get rows for `coin` and `boss_treasure` (0); `NORMAL` gets `coin`; the title says "every ordinary enemy has 5 to 10%", the dungeon coin included at 5% (the first version gave it 0 on a claim that the owner asked for none; the directive does not say so, and the batch-3 rule covers every ordinary enemy); the boss list gets `['boss_treasure', 0]`.
- `tests/codex.foes.test.ts`: elites and bosses are 3 + 5 + 1; the chapter-only checks (health by table, waves of its kind, allowance in the sim) loop over `CHAPTER_TARGETS` (the chest has its own tests: one row, the dungeon's own health and limit, no butler level, the sim spawns it so; the coin's health by tier; `dungeonOnly`, `dungeonWaves`); the ability list includes the chest. `tests/codex.resist.test.ts`: the 5% floor holds for the coin too (page shows 5%).
- `tests/codex.progress.test.ts`: 19 enemies -> 19 + 2. `tests/sim.data.test.ts`: the title and `ENEMY_IDS.length` 21. `tests/view.director.palette.test.ts`: 6 abilities -> 7. `tests/guide.text.test.ts`: the dungeon facts. `tests/view.field.warm.test.ts`: the stand-in, the file check and the dungeon wave's pictures.

Not run: `tests/sim.perf.test.ts` (timing; machine busy). A group run of audio, view, guide, codex, sim (without perf), meta, screens and core tests passed except two stale counts that I then fixed (codex progress, director palette). `npx tsc --noEmit -p .` is clean.

## What I saw (headless Edge, my own dev server, `?scene=home&debug=1&fresh=1`, then the real flow)

450 x 900 and 360 x 800, Korean and English (stills in `scratchpad/batch5/dungeon/shots`, not committed):
- The dungeon card on the battle tab: "입장 1/1", tier stepper, "최대 3,000 골드", "아직 기록이 없어요", the green "보물상자 +1,140" tag, the big "입장" button; and the used state "입장 0/1", "내일 또" (greyed) and "오늘은 모두 입장했어요. 내일 또 만나요!". English: "Entries 1/1", "Up to 3,000 gold", "Treasure chest +1,140", "Enter" / "Tomorrow", "All entries used today. See you tomorrow!". No overlap at either width.
- The pre-run page: the chest sticker (the lead's art) with "최대 3,000 골드" under it and three rule lines; 360 wide in English wraps cleanly.
- A run: coin wave (a coin leaving the tunnel, the next-wave chip "x15" with the coin), the last wave (the boss strip "보물상자 · 60초", the chest walking in with the escort), the spill (the banner "금화가 쏟아져요!", a coin burst, three new coins), the "승리!" burst, and the result screen with the gold, XP, "최고 기록!" and the "다시 도전" button greyed (no entry left); the callout "보물상자 +1,140 골드" is on the result screen (found by text; see the result still).

## What I could not verify

- A player-like run: bots play every run in the tests; on screen I used the debug "fast forward" (`skipToWave`, `win`) which removes enemies silently, so the on-screen result pays less than a real clear (1,700, not 3,000 at tier 5). The pay formula itself is tested with the numbers.
- The chest's death in sound and look: it uses the blender's glass burst and the shared boss death effect.
- `npm run font` and `tests/core.font.test.ts` (not run in this phase).
- The whole suite (landing engineer).

## Open questions for the owner

1. **Is the treasure chest a boss for the missions ("보스·정예 4마리")?** I said no (the dungeon is a pay day and one safe run a day would finish that mission); one line in `missions.ts` and one in `finishRun` flip it.
2. **Typical pay equals the maximum**: an easy dungeon means almost every run pays 99.8%+ of the maximum. If you want the maximum to be something to reach for, lower the kill value or raise the chest's share (`DUNGEON_KILL_GOLD`, `DUNGEON_CHEST_GOLD` in `src/meta/data/dungeon.ts`; the card, the pre-run page and the max follow).
3. **One entry, taken at the start**: a crash or a quit costs the day's only run (the "continue" prompt still resumes it). Give it back when a run is abandoned before wave 3?
4. **Run length 2.4 minutes** (was 1.8-2.0): the chest cannot fall in under 27 s whatever the board. A shorter limit (50: 22.5 s) costs a little margin for the weakest board; the numbers are `GOLD_DUNGEON_BOSS_LIMIT` and `GOLD_DUNGEON_BOSS_HP`.
5. **Midnight**: a run started at 23:55 and finished after midnight belongs to the new day (existing rule), so it frees the new day's entry; with one entry a day that is a near double run on that night. Not changed.
6. **Death sound** for the chest (see audio above), and a codex group of its own if you want one (now: the chest and the coin sit with the bosses and the ordinary enemies, with a "골드 던전" line).

## For the next engineers

- Landing: run `npm run font`; the Edge runner needs a fresh profile folder for its port after a crash (a stale one made Edge exit silently: `no page target`); `window.__dbg.routine.markSeen()` keeps the automatic popups (calendar, level-up) off a screenshot after `__dbg.meta.unlockAll()`.
- Patch notes: the dungeon is now "하루 한 번, 금화 131마리와 보물상자, 한 판 최대 1,200 골드(단계 1)"; the codex has two new monsters; the old extra entry is gone for now.
- If the extra entry comes back: set `DUNGEON_EXTRA_ENTRIES` to 1, and decide the pay again (the chest's lump is paid on every win now, so a second run pays it again), the guide's "entries per day" line, and the unlock popup line.
