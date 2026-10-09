# batch2-1009 담당자 보고(원문)


---

# core:meta

Item 15 (awakening cost) was already done by another agent: `AWAKEN_COST` in `src/game/data/balance.ts` is 10 (was 12), and nothing in my paths changed for it. My items 0, 2 and 3 are done. I made no commits.

Verification: `tsc` prints nothing for my paths. The only full-suite failures were in `audio-*`, `sim.bots` and, under load only, `meta.chests` and `meta.profile`; `meta.chests` and `meta.profile` pass when run alone. The five files for my items pass (95 tests, 142 files green at the start). `npm run font` was run last and the font test passes.

**Item 0, font**
- **Cause:** The Korean subset had a fixed file name (`game-kr.woff2`) and grows with every build. A cached older copy drew every newer glyph in the thin system font. From the committed history, the 10-07 and 10-09 12:55 deploy subsets both lack 몬 and 항, the two syllables the codex brought in. The scan itself was fine: every Hangul syllable in the source was already in the current subset.
- **Fix:** Font files are now `game-latin.acfffdc6.woff2` and `game-kr.b97e5ebb.woff2`, named by a digest of their bytes. `scripts/build-font.mjs` deletes older ones and rewrites the two `@font-face` URLs in `index.html`.
- **Other builder changes:** The shared helpers are in the new `scripts/fontTools.mjs`. The builder now also reads its own output back, warns about Hangul that Jua lacks, and lists the symbols neither face carries.
- **Boot gate:** New `src/core/fonts.ts` has one memoised load of both faces, and `src/app/boot.ts` waits for it, so the QA battle route no longer draws before the fonts exist.
- **No re-lay on late arrival:** There is no "late" state to repair. The first scene is built only after both faces load, and a failed face never arrives later. After a failure the game stays in the system font and the console says why.
- **Test:** `tests/core.font.test.ts` (14 tests) reads the built woff2 files themselves. It fails with the missing characters if any string, run-time text, or source syllable lacks a glyph; the fix is `npm run font`.
- **Proof:** Zoomed stills of "몬스터 도감", the tab, and "방어 0% · 저항 0%" all show Jua. The third place, "출혈", no longer exists as text; the skill line is now "피를 흘려요" and is Jua throughout.

**Item 2, claim all**
- **Meta:** `claimAllMissions(scope)`, `claimAllCup()` and `claimAllEndless()` in `src/meta/routines.ts` return `{count, reward}` with one merged bundle. They run exactly the same takers as claiming one by one and commit once. `tests/meta.claimall.test.ts` (12 tests) shows the save, money lines and analytics are identical; it sees 1 change event against 5 one by one.
- **Screens:** Daily and weekly notebooks and the cup and endless cards each get a "받을 보상 N개 [모두 받기]" line. The button enables from 2 waiting rewards, has a count badge, and a toast explains the dimmed state. The pass already had its own button. Calendar, treats and the free chest are one at a time, so I added none there.
- **Presentation:** One merged payout flies from the button; each row keeps its own check, pen line and stamp.
- **Browser:** Seen in Korean 1280 and in English at tall (1600 emulation).

**Item 3, gold dungeon payout (old → new)**

| Setting | Old | New |
|---|---|---|
| Wave gold | 8 + 2w | 14 + 3w |
| Gold per kill | 0.35 | 0.6 |
| First-win bonus | 100 | 200 (× chapter multiplier) |
| Full clear, tiers 1–5 | 345 / 448 / 551 / 689 / 861 | 574 / 747 / 919 / 1,149 / 1,436 |
| Day (2 wins + bonus), tiers 1–5 | 790 / 1,026 / 1,262 / 1,578 / 1,972 | 1,348 / 1,754 / 2,158 / 2,698 / 3,372 |

- **Why this size:** About 1.7× today. A full clear was 73% of a chapter win and is now 122%. A chapter-3 day adds 2,158 to roughly 5,400 from everything else (+40%). A level-6 upgrade (2,500) takes 1.2 days instead of 2.0. A patrol collection (about 670) is a third of a dungeon day.
- **Card text:** The card's "최대 N 골드" and the first-clear sticker read the same constants, so they show the new values without a string change (tier 5 seen: 1,436 and +500).
- **Spec:** `docs/명세_메타.md` is v1.2: §13 rewritten and a claim-all section added.

**Dungeon leftovers:** Both were already done by last batch's release test (the `dungeon_entry` ad placement and the `gold_dungeon` guide topic). I re-checked the ad entry in the browser. It is dimmed in a fresh profile because ads only start from the second run. Once enabled, the test ad opens, completing it books the entry (`bought` 1, `entriesLeft` 1), and the card updates.

**Not verified:** a real phone, sound, and the English weekly page below the cup card.

Aside dropped several times during the session, which is why a few captures were re-run. The built-in browser pane was hidden, so I closed my tab there and used Aside throughout.

**Requests for the next engineer**
1. In the guide, codex and HUD strings, replace `→`, `①` and `②`, which no face the game carries, then empty `SYSTEM_GLYPHS` in `tests/core.font.test.ts`.
2. Optional: a dev plugin in `vite.config.ts` (outside my paths) that rebuilds the font when a source file changes, so a stale subset cannot occur while developing either.
3. Run `npm run font` after any string change. The font test fails until you do.
4. `BootScene` still does its own `document.fonts.load`; it is harmless and could be dropped.

Hand-off notes are appended to `docs/handoff/meta.md`, `routine.md`, `shell.md` and `ui.md`. Stills are under `scratchpad/shots/` (`mis*`, `font*`, `ad*`, `dun1`).


---

# core:rules

Directives 1, 4, 5, 6, 7, 8 (rules half), 9, 10, 11, 12, 13 (rules half) and 15 are done. `npx tsc --noEmit` is clean and `npx vitest run` passes (147 files, 3,269 tests). Nothing was committed. `SIM_VERSION` stays 3, because a wave-start save holds only board, currencies, counters, RNG states and cell positions, so no save changes meaning.

**Per item (old -> new)**

- **1, fish income:** +0.5 fish/s while a wave runs (`BASE_FISH_PER_SECOND`), including the between-waves second and the act-clear wait. The 3-second opening prep and open choices pay nothing. `rich` doubles it. Share of fish earned in a winning chapter-1 run (synergy bot, stake 0): kills 51%, wave rewards 26%, act rewards 10%, steady income 9%. In chapter 5 the income share is 20% because the treat cells add 337 fish. Kills stay the largest source everywhere (45 to 54%).
- **4, armour and ward:** `damageEnemy` now cuts armour or ward by the same toy, armour-break and armour-ignore factors. Texts say "방어와 결계" / "armour and ward".
- **5, 6, ranger:** ranger damage is 8 / 20 / 45% at steps 1 / 2 / 3 (was 0 / 0 / 30%). The all-cats crit numbers are unchanged. "Sure shot" is gone, replaced by **Ricochet**: a ranger's arrow hit also hits the nearest other enemy within 150 px for 35% of the hit, with the same crit and no new dice, once only. Mage arcane burst 12 -> 10%.
- **7, elite first:** the viking and the tiger (the only cats whose attack breaks armour) aim at an elite or boss in reach before an older plain enemy. The laser's choice outranks this.
- **8, laser lock:** a dot placed within 130 of an elite or boss snaps to it and follows it. It lets go when the dot is moved more than 130 away, the enemy dies (the dot stays where it fell) or the laser ends. Every cat that reaches the locked enemy already picks it first. Lock happens on placement only.
- **9, molt price by rank:** kitten 1 / street 1 / alley boss 2 / king 3 (was 1 for all); the 6-per-run limit is kept.
- **15, awakening:** 12 -> 10 purr.
- **10, 12, texts:** distances are now in tiles (100 px = 1 tile, e.g. samurai "앞뒤 1칸"), and the jargon "대상", "광역", "연쇄", "반경" is gone from unit, perk, toy, class and daily-rule texts. A test refuses those words and bare pixel values. Glass marble now reads "범위 공격이 25% 더 넓어지고, 번개가 25% 더 멀리 튀어요".
- **11, warrior ranges:** 200 / 215 / 235 / 255 / 285 -> 200 / 210 / 220 / 230 / 240. That is 90 to 140 under the mage of the same rank. Every warrior reaches the lane from all 16 outer and all 8 second-ring cells, and none reaches it from the centre cell, even against a boss.
- **13, special cells:** the cell kind is now set per chapter, with the same count and movement rule.
  - Chapter 1: sunbeam, attack speed +20%.
  - Chapter 2: food bowl, damage +20%.
  - Chapter 3: bubbles, crit chance +20 points.
  - Chapter 4: stump, range +20%.
  - Chapter 5: treat cell, 0.15 fish/s per cat standing on it (0.2 measured too strong, 0.15 matches the sunbeam).
  - Daily, endless and gold use their chapter's kind. The toy is renamed "명당 자리" and the daily rule "명당 가득한 날" (ids unchanged).

**Measured (500 runs, same seeds)**

| | before | after |
|---|---|---|
| Stake 0, ch 1-5, merge bot | 44 / 47 / 42 / 53 / 53 | 65 / 63 / 60 / 71 / 71 |
| Stake 0, ch 1-5, synergy bot | 75 / 82 / 78 / 82 / 83 | 89 / 91 / 88 / 92 / 93 |
| Ch 1, stakes 0-5, synergy bot | 75 / 64 / 44 / 34 / 17 / 8 | 89 / 77 / 67 / 54 / 36 / 24 |
| Stake 3 class focus, ch 1 (free / warrior / ranger / mage / trickster) | 34 / 28 / 50 / 29 / 5 | 54 / 50 / 76 / 49 / 20 |
| Ch 2 | 24 / 24 / 29 / 17 / 2 | 40 / 31 / 48 / 31 / 13 |
| Ch 3 | 43 / 38 / 49 / 41 / 12 | 52 / 46 / 69 / 52 / 21 |
| Ch 4 | 41 / 41 / 45 / 41 / 13 | 60 / 55 / 61 / 59 / 23 |
| Ch 5 | 44 / 39 / 61 / 34 / 10 | 63 / 54 / 75 / 56 / 27 |

Random bot stays at 0% in every cell.

- **Awakening is reachable, and earlier.** The first guardian (median) comes at wave 12 instead of 16, and 93% of chapter-1 runs reach one (was 82%). At stake 3 it is wave 16 in 60% of runs (was wave 20 in 35%).
- **Lane coverage** (outer ring / second ring / middle cell, before -> after):

  | Unit | before | after |
  |---|---|---|
  | paw | 22 / 11 / 0 | 22 / 11 / 0 |
  | sword | 24 / 16 / 0 | 24 / 14 / 0 |
  | viking | 26 / 20 / 0 | 25 / 17 / 0 |
  | samurai | 28 / 24 / 0 | 26 / 19 / 0 |
  | tiger | 33 / 32 / 18 | 27 / 21 / 0 |

- **No give-back to warriors.** The shorter ranges cost the warrior-pinned bot 6 / 5 / 0 / 9 / 4 points in chapters 1 to 5 at stake 3. They stay level with mages (+1 / 0 / -6 / -4 / -2) and well above tricksters. Rangers pull far ahead (about +6 to +26 over warriors).

Reverting my changes one at a time in a copy (chapter 1, stake 3, synergy bot):

| Rule reverted | Win-rate effect of that rule |
|---|---|
| Steady income | +10 (+13 at stake 0, +17 for the merge bot) |
| Awakening 10 | +7 |
| Rank-based molt price | -6 |
| Shorter warrior ranges | -3 |
| Elite-first targeting | +3 |
| Ranger changes | +2 |
| Ward ignore and laser lock | 0 |

Reverting all of them at once reproduces the "before" row exactly, so nothing is unaccounted for.

**Two things to tell the owner**

- The steady income is only 9% of the fish earned but is the single biggest win-rate lever. `BASE_FISH_PER_SECOND` (one line in `balance.ts`) is the first thing to turn down if the numbers feel too easy.
- The king's molt price of 3 costs the bot most of the molt penalty. With 1 / 1 / 2 / 2 the loss is about 1 point instead of 6.

**Proof:** new `tests/sim.cells.test.ts`; extended `sim.data`, `sim.synergy`, `sim.combat`, `sim.skills`, `sim.flow`, `sim.rules`, `sim.warriors` and `sim.bots`. No stills, since nothing draws yet. In the browser (no page errors) chapter 5 reads `specialCell` = 'treat'. With two cats on treat cells and the sim stepped 15 s from the page, `incomePerSecond()` was 0.8 and nine `income` events arrived.

**Could not verify:** a real phone, and the look of anything. The chapter 5 board still draws the cells as sunbeams. In the Aside tab the battle clock does not advance while the first-encounter card is open, so I stepped the sim from the page instead.

**REQUESTS for the view engineer**

- **Fish income:** add `CurrencyReason` 'income' and `BattleApi.incomePerSecond()` (0.5 base, +0.15 per cat on a treat cell, times the `rich` multiplier). `src/view/director/currency.ts` `onFish` must skip flights and sounds for 'income', otherwise a fish icon flies every 2 s. Show "+N/s" beside the fish pill.
- **Molt cost by rank:** `moltCostOf(cell)` (-1 for an empty cell or a guardian) and `MOLT_COSTS` [1, 1, 2, 3]. `moltCost()` now means "cheapest". Move `SelectionSheet` and `popups/MoltPicker` to `moltCostOf`. `src/guide/facts.ts` still uses `MOLT_COST` alone, and the guide text needs the three prices.
- **Laser lock:** `LaserState.lockUid` (0 = none) and event `laserLock { state, enemy | null }`. `laser.x` and `laser.y` already follow the locked enemy every tick. Draw a lock marker.
- **Special cells:** add `BattleApi.specialCell`, `SPECIAL_CELL_IDS`, `SPECIAL_CELLS[id]` ({ stat, value }), `specialCellOf(chapter)`, `specialCellName`, `specialCellText(id, extra)` and `CHAPTERS[n].cell`. The old names `sunbeams`, `sunlit`, `SUN_CELLS` and `SUN_SPEED` still work. Art is needed for `sun`, `bowl`, `bubble`, `stump` and `treat`. These still say "햇살" and need updating: `src/view/field/{sunMath,sunNote,effects,toyCells,toyMarks}.ts`, `src/codex/{cells,boards}.ts` and strings, `src/guide/strings*.ts`, `src/screens/pass/strings.ts`.
- **Elite first:** `UnitDef.targetsElitesFirst` is true for `w_viking` and `w_tiger` only. Their skill texts already say so.
- **Ricochet:** event `ricochet { unit, x, y, tx, ty, targetUid }`. Draw a second arrow. I did not add it to the `special` event because `specialRing` only accepts 'cry' and 'shatter'.
- **Texts:** `tilesOf`, `tilesText` and `TILE_PX` are exported. Screens that print ranges in px should print tiles. Class-sheet and viking/tiger/samurai sentences are longer.
- **Guide and codex:** change "방어를 깎아요" to "방어와 결계", replace "필살 사격", and update awakening to 10 purr.
- **Progress note:** `docs/진행상황.md` should read spec v1.5, GDD v1.4, D-44.

Files are in `C:\MyProject\Project1`:
- `src/game/data/cells.ts` (new)
- `src/game/data/lengthText.ts` (new)
- `tests/sim.cells.test.ts` (new)
- `tests/simreport.sim.ts` (extended)
- `docs/명세_전투규칙.md` (§20 added)
- `docs/기획서_GDD.md`
- `docs/설계_결정_기록.md` (D-44)
- `docs/handoff/sim.md` (2026-10-10 batch 2 section)


---

# core:audio

Directive 14 is built and wired, but I could not listen to any of it. The levels, tunes and transitions are checked by numbers only.

What I checked: `tsc` is clean for `src` and `tests`, and the full run is 147 files, 3269 tests, all green. The offline report `window.__dbg.audio.tracks()` gives `failing: []` for all 12 tracks. The browser checks ran in the built-in browser pane, because the Aside daemon went down when I ran four renders at once. The shared dev server also reloaded whenever any source file changed, so I measured only while not editing.

**What was added**

| Track | Plays | Key and tempo | Character |
|---|---|---|---|
| `battle` | chapter 1, living room | G major, 128 BPM | the original, unchanged |
| `kitchen` | chapter 2 | B-flat major, 120 BPM | hopping marimba, a pot lid on the backbeat, a spoon on a cup |
| `bath` | chapter 3 | E-flat major, 104 BPM | water-drop kalimba, bubbles and drips, a shimmering harp, most reverb |
| `garden` | chapter 4 | D major, 112 BPM | a flute lead and birds in the top layer |
| `clinic` | chapter 5 | A minor, 124 BPM | a music box, with a clock ticking and tocking on every beat, even at the quietest layer |
| `gold` | gold dungeon | A major, 152 BPM | coin-bell tune, "ka-ching" percussion, sparkles |
| `elite` | elite waves | D minor, 116 BPM | heartbeat kick, muted bass, ticking clock, pizzicato stabs |
| `boss` | boss waves | D minor, 142 BPM | the original loop, now opened by a one-bar sting |
| `win` / `lose` | result screen | C major 108 / E minor 72 BPM | a warm victory loop and a soft defeat loop |
| `home2` | menus | F major, 88 BPM | a lighter second menu track |

The chapter tracks and `gold` keep the four intensity layers that follow the wave; `elite` has three. The boss sting is a crash, a held chord, three stabs, a snare roll and a falling tom run.

**Wiring (existing call sites only)**
- **`src/view/director/music.ts`:**
  - picks the chapter's track, or `gold` in the gold dungeon, through the new `battleMusic(chapter, mode)`;
  - the new `setElite()` switches to `elite` from the warning of an elite wave until the elite falls, the wave moves on, or a boss takes over.
- **`src/view/director/boss.ts`:** one added line calls `setElite(true)`.
- **`src/view/hud/screens/ResultScreen.ts`:** `audio.music(victory ? 'win' : 'lose', 3)`. This file is outside the paths you listed; I changed only that call and a comment.
- **`src/scenes/HomeScene.ts`:** unchanged, because the engine now alternates which of the two menu tracks a visit starts with and hands one to the other at the end of its loop.
- **`?demo=audio`:** has 13 music buttons in two rows, and the HUD shows which track is actually sounding.

**Transitions**
- **Entry rule:** a track change now enters on the outgoing track's next bar line when that is at most 2.6 s away. Otherwise it uses the next beat if within 0.7 s, otherwise it enters at once. Before, it always used the next beat.
- **Fades:** the incoming track starts its ramp 0.2 s early so its first beat is nearly full level.
- **Unchanged:** stinger ducking, the music volume setting and the tab-hidden mute are untouched.

**Measurements (old → new, whole 16-bar loop at full intensity)**
- **Loudness:** the old tracks read 0.0514 (`home`), 0.0423 (`battle`) and 0.0432 (`boss`). The new ones are 0.0417 to 0.0440, and `lose` is softer at 0.0347. Every track is within 1.5 dB of its target (`MUSIC_TARGET` in `src/audio/report.ts`). My first drafts of `garden` and `bath` were 2.8 and 1.8 dB too loud; I fixed that with `TRACK_LEVEL`.
- **Clipping and brightness:**
  - No clipping; the largest peak is `elite` at 0.569.
  - Energy above 4 kHz is 0.000 to 0.004, against 0.001 to 0.002 for the old tracks.
  - `clinic` (899 Hz), `garden` (855 Hz) and `gold` (775 Hz) are brighter on average than `battle` (566 Hz), but all of that energy is below 3 kHz.
- **Loop seams:** shallower than the worst other bar line for every track except `boss`, which is 2.4 dB deeper (it was 1.8 before).
- **Shed notes:** 0 to 2.7 % of notes are refused by the voice budget; the old `battle` track is at 2.6 %.
- **Nodes, busiest first:** the old `boss` creates 209 a second (peak 138). Among the new tracks, `kitchen` is the busiest at 159 a second (+7 % over `battle`'s 149; peak 150 against 108). `gold` is at 156 and `elite` at 133.
- **Crowded wave (speed 3, 12 s):** the music holds 71 to 90 live nodes, with no skipped music steps. That is about 175 nodes in total with `battle` under it and about 217 with `kitchen`.

**Proof:** new tests are `tests/audio-tracks.test.ts`, `audio-director.test.ts` and `audio-music-lib.ts` (a shared helper), plus 8 new engine tests; one old transition test now says bar line. The engine tests cover exact bar-line times, the fallback to a beat, the boss sting playing once, the menu hand-over and every id playing as itself. The `?demo=audio` screenshot shows all 13 buttons fitting.

**What I could not verify**
- I did not hear anything, so the levels, tunes and transitions are unheard.
- I did not test on a phone; node counts are from a desktop tab.
- I did not play a full live run through a boss wave and an elite wave; the wiring is covered by unit tests only.

**What a person with ears should check first (full list in `docs/handoff/audio.md` §11.8)**
1. The boss arrival: the chapter loop finishes its bar, then the sting lands and the fight starts.
2. The elite tension track: does it read as "something is coming", and is the way back clean?
3. The five places side by side, especially the flute, the bubbles and the clinic clock (is it nagging after 30 s?).
4. The garden birds on a phone speaker.
5. Whether `gold` at 152 BPM feels like coins or a slot machine.

**Not my item:** the relayed request to cut the awakening cost to 10 is already in commit `cf8326c`; I did not touch it.

**Documentation:** the full section is `docs/handoff/audio.md` §11, and I added short notes to `docs/handoff/director.md` and `hud.md`.

REQUESTS: none.

Files are in `C:\MyProject\Project1`:
- New under `src/audio/`: `compose.ts`, `tracks.ts`, `kits.ts`, `parts.ts`, `library.ts`, `playlist.ts`
- Edited under `src/audio/`: `api.ts`, `music.ts`, `scores.ts`, `sequencer.ts`, `instruments.ts`, `report.ts`, `devtools.ts`, `crowd.ts`, `index.ts`
- `src/demo/AudioDemo.ts`
- `src/view/director/music.ts`
- `src/view/director/boss.ts`
- `src/view/hud/screens/ResultScreen.ts`
- Tests: `tests/audio-tracks.test.ts`, `tests/audio-director.test.ts`, `tests/audio-music-lib.ts`, plus edits to `audio-engine.test.ts` and `audio-scores.test.ts`


---

# view

All the batch 2 view-side work is in. `npx tsc --noEmit` is clean for `src` and `tests`, and `npx vitest run` passes (151 files, 3,309 tests). I could not check frame time with five glowing cells, or anything on a real phone.

**1. Special cells (directive 13)**
- **Art:** I generated ten pictures in `art/cells_v1` with the image generator (one attempt each, no retries). There is a floor tile per kind (sunlit patch, gingham bowl mat, bath mat, tree stump, treat blanket) and a small badge per kind. They are built by `art/cells_v1/build_cells.py` and `tools/process_art.py` (new `cell_` prefix, 256 px) into `src/assets/img/cell_*.webp` and `icon_cell_*.webp`.
- **On the board:** the new `src/fx/cells.ts` gives each cell a breathing halo, a glint, a 46 px emblem and a few sparkles. Under reduced motion the same lit picture stays still. I recoloured two halos after looking at the stills: bubble is violet (a teal one vanished on the cyan floor) and stump is wood (a leaf-green one vanished on the garden).
- **Arrival:** new cells drop in one after another, middle of the plus first (0.09 s apart), with a flash, a ring and the emblem popping on. A ring, sparkles and the `sunbeam` chime follow at touchdown.
- **Marker on a cat:** the sun sticker is now the kind's own badge.
- **Tap an empty cell:** the bubble shows the name and the real number, including the prime-spot toy (20% becomes 30%, 0.15 becomes 0.25 fish per second).
- **Stills:** all five chapters, with the vet and garden ones also under reduced motion. The arrival strip is `shots/arrive/arrive.png`.

**2. Laser lock (directive 8)**
- When the dot sits on an elite or boss, a red dashed ring and four corner brackets snap onto it in 0.22 s, with a ping ring leaving the enemy.
- The marker follows the enemy and fades when the lock ends. The dot tag reads "붙었어요! 계속 따라가요" / "Locked on! It follows".
- I did the target marker, not a line from the button.
- The laser card, the aim hint and the guide page all explain it. I checked it in play on a vacuum boss.

**3. Fish income and molt cost (directives 1 and 9)**
- **Income tag:** "+0.5/초" / "+0.5/s" sits between the fish and purr pills and shows "+0.95/s" with three cats on treat cells. Tapping it explains it.
- **Row resize:** to make room, the fish pill went from 224 to 180 px wide and the purr pill from 156 to 116 px.
- **Flying icons:** the steady income no longer sends a flying fish icon to the pill.
- **Molt cost:** the molt button shows the selected cat's price (1 for kitten and street, 2 for alley boss, 3 for king) and "불가" / "Locked" for a guardian.
- **Short purr:** tapping it with too little purr gives a toast with the price and your purr ("골골이 모자라요. 이 털갈이는 골골 2개예요. (지금 1개)") instead of opening the picker.

**4. Texts agree with the data**
- **Codex cells:** the sunbeam card is now five cards, one per chapter, with the tile picture, diagram and real numbers.
- **Codex monsters:** ordinary enemies list real health ("체력 83 ~ 1,631"), with the multiple only as a side fact on the page. The armour and ward tips say armour break and ignore cut the ward too.
- **Guide:** the sun topic is now "특수 칸" and its lesson card names the chapter's own cell. Molt prices by rank, the 10-purr awakening, fish per second, the ward sentence and the laser lock are all updated.
- **Ranges:** the selection sheet and the unit screen now show ranges in tiles ("2.3칸"), matching the skill sentences. The unit screen is outside my paths; I changed `screens/cats/unitStats.ts`.
- **English awaken button:** the reason text was cut to "Needs 10…", so I shortened it to "10 purr" and "Tier 1+".

**Directives 16–18**
The directive doc hands these to the view phase, so I did them:
- Black hole pull 55 → 90 px/s.
- Black hole immunity 4 → 2 s.
- Spec lines and `tests/sim.skills.test.ts` updated to match.
- Codex health display, covered above.

The only `src/game` changes are the pull value in `data/units.ts` and `PULL_IMMUNE_AFTER` in `data/balance.ts`. I did not rerun the bots.

**5. Release test**
Done with real taps. English at 1600 was covered for the chapter 5 battle audit, awakening and the codex cells page; everything else ran in Korean at 1280.
- **Awakening:** purr 9 is refused, 10 makes the General Tiger and purr goes 10 → 0, in both languages.
- **Molt:** checked on each rank and a guardian.
- **Missions "모두 받기":** gold went 1,410 → 2,010.
- **Music call log:** `music:battle` / `kitchen` / `bath` for chapters 1–3, `music:boss`, and `music:win` on the result.
- **Fonts and overlaps:** no fallback glyphs in the monster tab, stat lines or the samurai's skill text. The overlap audit was empty.
- **Fresh-profile tutorial:** summon ×3, merge, gauge, and classes begin correctly. The sun lesson then began with the five cells, a real drag put a cat on one, and the laser lesson started.
- **Font:** `npm run font` was run twice (the font is now hashed).

**What I could not verify**
- A real phone: touch, the glow on a bright screen, and 60 fps with five glowing cells (I did not rerun the crowded-wave script).
- Gold dungeon payout through the real flow. The debug route has no meta settle, so I only covered the card's numbers through the meta engineer's tests.
- The second half of the tutorial by hand (elite through boss). Only the sim-side `sim.tutorial.test.ts` covers it.
- The codex cells page in Korean scrolled to the garden and vet cards.
- The tile pictures are stretched to fit the 100 × 88 cell. The bath mat is squashed about 17% and the vet's biscuit badge reads small.

**Requests for the next engineer**
- `src/audio`: a short sound for the laser lock (I reused `laser_on` at 0.45 volume), and optionally a per-chapter arrival chime.
- Later, if wanted: a line from the laser button to the locked enemy instead of the marker.

I appended "2026-10-10 batch 2" sections to `field.md`, `fx.md`, `hud.md`, `codex.md`, `guide.md` and `sim.md`.

Files are in `C:\MyProject\Project1`:
- `src/fx/cells.ts`
- `src/view/field/lockMarker.ts` (with `lockMath.ts`)
- `src/view/field/cellNote.ts` (with `cellMath.ts`)
- `src/view/hud/moltMath.ts`
- `src/view/hud/incomeMath.ts`
- `art/cells_v1/`
- `docs/handoff/field.md`, `hud.md`, `codex.md`, `guide.md`, `fx.md`, `sim.md`
