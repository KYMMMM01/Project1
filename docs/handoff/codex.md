# Handoff: codex (도감: monsters, toys, board cells)

Date 2026-10-09. Module: `src/codex/**`, tests `tests/codex.*.test.ts`. Touches: `src/guide/progress.ts` (the codex's "met" and "looked" lists), `src/guide/Illustration.ts`, `src/view/hud/**` (bubble link, boss strip tap, pause row, met watcher), `src/screens/shell/HomeTopBar.ts`, `src/screens/system/settingsScreen.ts`, `src/ui/icons.ts` (new `book` icon), `src/game/data/balance.ts` (`HAZARD_BLOCK_SIDE`).

The owner's request: "발판, 몬스터, 장난감의 정보를 볼 수 있는 도감 추가 (보스나 정예몹의 경우 상세 스탯 방어력이나 체력, 능력 등을 표기)". Every number on every page is read from the game data when the page is built; no number is typed into a string.

## What exists

A full-screen paper notebook (`openCodex`, same shell as the guidebook: `ScreenScaffold`, section tabs in the action bar with a dot on a tab that holds new entries) with three sections.

| Section | Content |
|---|---|
| 몬스터 / Monsters | A selector (chapter 1 to 5, butler level 0 to 5; each tab is a full 88 px touch target) and one row per enemy in three groups (common, elite, boss): sticker, name, rank tag, one line of numbers, "새로 만남" / "아직 못 만났어요". A tap opens the enemy's page. The selector is on the list and on every page; changing it rebuilds only what is under it (the scroll position stays). |
| 장난감 / Toys | Filter by rarity (all, 꼬마, 동네, 골목대장, 대왕) and one card per toy: icon on a rarity mat, name, rarity, the toy's own effect text, and for the three position toys (cat tower, kneading cushion, window perch) a 5 x 5 diagram with the cells it boosts. Toys the player has not met are readable and marked "아직 못 만났어요". |
| 발판 / Cells | Ten cards in five groups: plain cell, sunbeam, wet, zap (lightning); top row, outer ring, beside the same class (the three toy spots); the bard's and the bell cat's 8-cell footprint; the lane (loop traced from the real path, entrance, direction arrows, an example zone). |

### A monster page

Hero (picture, name, rank, met mark, flavour line) on a cream sheet; then **traits** (a chip and a one-line explanation each, the game's own `trait.*.desc`), **stats** (health multiple and actual health at the chosen level for ordinary enemies, speed against a cucumber, armour and ward in percent with bars, reward), **where it comes** (chapters and waves; a mini balloon says it comes out of a balloon), **abilities** (every number: aura radius and bonus, shield share, split count, pulse cooldowns, boss ability cooldown, duration and effect; for elites and bosses with a cooldown ability also the rage at half health). Elites and bosses add:

- **Each time it comes**: one block per wave it ends in the chosen chapter (the three waves of its kind, 4 / 12 / 20 or 8 / 16 / 24, where the script puts it): health, "x times a cucumber", time limit with the butler level's cut shown ("50초에서 13초 줄었어요") and the damage allowance of that wave. A chapter that does not bring this enemy shows the three waves of its kind "(나온다면)" with one line saying so. The hourglass's +seconds is quoted under the blocks.
- **Control resistance**: slow cap (25 % against 50 %), stun and freeze (boss: do not work; elite: half as long), black hole pull (boss 20 %, elite 35 %).
- **Damage allowance** in plain words: at least 45 % of the limit is needed whatever the board, at most N % of its health goes in per second, at most 1.5 seconds of allowance can be spent at once, the rest is lost.
- **How to beat it**: tips that follow from the numbers (`tipsOf`): armour at 25 % or more names the armour breakers (read from the unit data: viking, tiger) and the magic classes; ward at 25 % or more names the physical classes; both low says so; one line per ability with its numbers; the control line; the clock line (limit, minimum time, laser seconds and its damage bonus).

`boss_cucumber` (대왕 오이) is an **elite** in the data (it ends elite waves 4 and 20 and uses `ELITE_HP` and `ELITE_LIMITS`), so it is listed under 정예 with the full elite page. The six enemies the owner counts as bosses all have the full page (`boss_cucumber` and the five `boss_*`), as do the two other elites (분무기, 폭죽).

## Where the numbers come from (`src/codex`)

| File | Role |
|---|---|
| `foes.ts` (pure) | Slots and appearances from `chapterWaves`; health `hpIndex(wave) x CHAPTER_HP_MULT[chapter] x hpMult` for ordinary enemies and `specialHp(kind, ordinal) x CHAPTER_HP_MULT x stakeRules.specialHpMult` for elites and bosses (the formulas `sim/flow.ts` spawns with); limits `specialLimit - stakeRules.bossTimeCut`; the allowance from `BOSS_MIN_KILL` and `BOSS_CAP_BURST`; resistance from `SLOW_CAP`, `SLOW_CAP_BOSS`, `ELITE_CC_FACTOR`, `PULL_*_FACTOR`; abilities from `ENEMY_SPECS` and `BOSS_SPECS`; tips. |
| `foeText.ts` | The page model with its words (`foePage`, `foeItem`, `basisText`). |
| `cells.ts`, `cellText.ts` | The numbers of the ten cell pages (`SUN_*`, `HAZARD_*`, the spray's and bosses' pulses, the three toys' `fx`, the bard's and bell's aura and `auraScale`, `DODGE_CAP`, `PATH_LENGTH`, `ENEMY_CAP`). |
| `boards.ts` (pure) | The diagrams: toy cells from `toyCells` / `toyShape` (the same functions the battle marks cells with), auras from `auraCells(cell, [], aura.reach)`, sun from `FIRST_SUN_CELLS`, hazards from the boss specs and `HAZARD_BLOCK_SIDE`, the lane from `pathPoint`. |
| `toys.ts` | The 30 toys by rarity; the effect text is `relicDef(id).descText()`. |
| `stringsKo.ts`, `stringsEn.ts` | `codex.*`. No digit is typed; every number is a `{placeholder}`. |
| `parts.ts`, `BoardView.ts`, `LaneView.ts`, `LevelSelector.ts`, `FoeViews.ts`, `ToyViews.ts`, `CellViews.ts`, `CodexScreen.ts` | The views. |

`HAZARD_BLOCK_SIDE` (2, the lightning's square) is a new constant in `balance.ts`; `pickHazardBlock` in `sim/hazards.ts` uses it instead of the literal 2 (same numbers, same random draws: nothing in the simulation changed).

## Discovery and "new" (`src/guide/progress.ts`)

`GuideProgress` now keeps two more lists in the same save (`meowguard.hints`, version 3; a version 2 save loads with both empty): `met` (`foe:<id>`, `toy:<id>`) and `looked`. `isFresh(key)` is met and not looked; `freshCount()` drives the badge on the home button and the settings row's sub line. A foe is met when it spawns, a toy when it is offered or won (`view/hud/codexWatch.ts`, built with the HUD, also marks what a restored run already holds). A monster page marks its enemy looked when it opens; the toy list marks every toy looked when the player leaves it. Looking at an entry that was never met changes nothing. A sandbox run keeps its marks in memory only (like its lessons). "Erase progress" wipes them with the rest.

## Entrances

1. **Home top bar**: a round book button left of the settings button (the XP bar is 88 px shorter), with a counted badge for new entries (`HomeTopBar`, `HomeScene`).
2. **Settings sheet**: a teal "도감" row right under the guidebook row, sub line "새로 만난 것 N개" or the hint (`settingsScreen.ts`).
3. **Battle pause menu**: a "도감" row between the guidebook and restart (`PauseMenu.ts`, action `codex`); the codex closes back to the menu.
4. **Enemy bubble** (tap a card of the wave preview) and **boss strip** (the strip is tappable now and opens the same card): the bubble ends in a full-width "도감에서 보기" link (`InfoContent.link`, drawn by `HintBubble`, 88 px high; it acts on the press so the bubble's own close does not eat it). The link opens that enemy's page (`HudEnv.openCodex`, `Hud.openCodexAt`), starting at the run's own chapter and butler level; the battle stays paused (`setPaused('user')`) until the codex closes.
5. **"New" sticker** on list rows and toy cards, a dot on a section tab, the badge and the settings sub line.

Debug (dev builds, `?debug=1`): `window.__dbg.codex.open({ foe?, section?, level? })`, `.close()`, `.state()`, `.progress`, `.met([...keys])`. Return `1` from `ev` callbacks; the scaffold is not serialisable.

## Tests

`npx vitest run`: 142 files, 3,085 tests green. New: `tests/codex.foes.test.ts` (15), `codex.text.test.ts` (18), `codex.progress.test.ts` (8), `codex.layout.test.ts` (2).

- Health, limit and damage allowance of every elite and boss at every chapter x butler level (30 combinations) are recomputed from the balance tables, and for a sample the **real simulation** spawns the wave and its `maxHp`, `waveDuration` and `capRate` must equal the shown row. An ordinary enemy's health at its first and last wave equals what `spawnEnemy` gives. Slow cap, stun and freeze rules equal what `applyStatus` does to every enemy.
- Every printed line of every page (19 enemies x 30 levels x 2 languages) has no hole (`{x}`, `undefined`, `NaN`) and contains the exact numbers of its row; changing chapter or butler level changes the printed health; the time cut shows from butler level 4; every ability prints every number the data has.
- No digit typed in any `codex.*` string; same keys in both languages; each cell text quotes every fact it is given and no other.
- Diagrams: the three position toys are exactly the toys with a diagram, on the cells the battle marks (`toyCells`); the aura boards mark 8 cells; the lane diagram starts at `pathPoint(0)`.
- Progress: fresh / looked rules, one announcement per entry, save round trip, a version 2 save loading with nothing met, the watcher against a real sim.

## Proof (stills)

Session scratchpad `shots/`, Korean and English, 720 x 1280 and 720 x 1600 (`tall(true)`), Aside on port 5199, `PAGE_ERRORS []` in every run.

- `codex/c1_foes`, `c2_toys`, `c3_cells`, `codex/sheet_bosses_ko_a|b|c` (the six bosses at chapter 5, butler 4, three scroll positions each), `bosses_ko/*` (the single stills), `codex/c4_vac_0..3` (a whole boss page), `c5_roomba_*`, `c6_spray_*` (an elite at butler 5), `toys2/t1_rare_top` (position toys with diagrams), `toys1/cell_0..4` (cell cards, bell and lane), `qa4/en_*`, `qa4/tall_*`, `tall_en/needle_b`.
- Entrances with real taps: `codex/d1_home` (badge), `ent1/s1_settings`, `ent1/s3_back_in_settings`, `ent2/p1_pause`, `bt1/b2_bubble` + `b3_after_link` (card link to page, pause held, back to list, back to battle), `ent3/q1_strip_bubble` + `q2_page` (boss strip), `zm2/z_bubble_ko`.
- Zooms (`tools/kit_zoom.sh`): `zm1/z_selector_l`, `z_row1`, `z_stats`, `z_stats_r`, `z_hero`, `z_toycard_board`, `zm3/z_home_btns` (the badge sits clear of the settings button).
- Audit (a page-side scan of every Text of the open codex: sideways overflow, effective size under 24 px, pairs of overlapping boxes; the script is the `audit()` helper of the session's `h2.js`): all 19 pages, the list, the toys and the cells, Korean 1280, English 1280, Korean 1600, English 1600: no text off the sides, none under 24 px, no overlap (the only pairs it reports are page text scrolled under the action bar, which the scroll mask hides).
- The selector changing numbers by a real tap: boss page at chapter 1, 0 then tap chapter 5: health 1,689 becomes 2,347 (1431 x 1.64); the "적 체력 x" caption follows.

## Not verified

- A real phone: touch feel of the selector tabs and the bubble link, 60 fps, long lists on a small screen. No sound was added (kit buttons play their own).
- The toy list with all 30 toys met and with "new" stickers on every card (checked with 1 to 3).
- A language switch while the codex is open (the codex has no language control; the rebuild path `i18nEvents` -> `render()` exists but was not exercised).
- Gold dungeon, daily and endless runs use their own wave scripts and multipliers: the pages show chapter-mode numbers only (the pages say "chapter" and "butler level"). The link from such a run opens the page at that run's chapter number and stake.

## REQUESTS

1. `docs/진행상황.md` section 0 and the patch notes (`docs/패치노트_2026-10-09.md`): the codex, its five entrances, the "new" marks.
2. Guidebook: a short home-section topic for the codex (with a "try it" at the home button) would make the first visit easier; not added, because `tests/guide.topics.test.ts` ties every home topic to a tab point and a "try it" for the top bar does not exist yet.
3. `src/game/sim/boss.ts`: `FIRST_USE` (a boss's first ability comes 0.6 of a cooldown after it appears) is a private constant; exporting it into `balance.ts` would let the ability text say when the first one lands.
4. Decide whether 대왕 오이 should be called a boss in the data (its id says so, its trait and its waves make it an elite); the codex follows the data.
