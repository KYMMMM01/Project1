# Hand-off: batch 5, landing ("land")

Date 2026-10-12, base commit `27301a1`. Owner's words and decisions: `docs/qa/directive_2026-10-12_batch5.md`. The four areas' own notes: `batch5_missions.md`, `batch5_dungeon.md`, `batch5_endless.md`, `batch5_skills.md`. Nothing is committed, pushed or deployed.

## Part 1: the tree made whole

- `npx tsc --noEmit -p .` printed nothing at the start (the four areas had already fixed where they met), and the whole suite was green at the start: 166 files / 3,559 tests. No cross-area breakage was found: the monster counts in the codex and guide are read from `ENEMY_IDS` (the tests state 19 + 2 = 21), no strings key is used twice, and "끝없는 모드" is gone from every table the game registers (`tests/endless.test.ts` checks it).
- Landing edits (all small):
  - `docs/기획서_GDD.md`: "끝없는 모드" -> "무한 모드" in four places (lines 157, 308, 502, 506) and the endless row now says "24웨이브 뒤 웨이브마다 체력 지수 ×1.07" (it said ×1.14).
  - `src/codex/stringsEn.ts`: `codex.ability.spill.text` read "3 of the Gold Coin pop out of it"; it now reads "{count} {coin}s pop out of it" ("3 Gold Coins pop out of it, 3 times"). The placeholders are the same as in Korean.
- `npm run font`: the two woff2 files came out byte-identical (`game-kr.a3dcbdba`, 618 syllables), so the Korean subset already had every glyph of the batch and `index.html` did not change. Run it once more after any later text change.

## Part 2: the two sprites

Both files are in `src/assets/img/` (`enemy_coin.webp` 246 x 248, `boss_treasure.webp` 488 x 467, one connected shape each, no stray pixels) and both are used through the usual key rule; the stand-in (`icon_gold`, `icon_chest_gold`) was not needed. Looked at in a dungeon run at 450 x 900 and 360 x 800:

- Lane: the coin (radius 14, 43 design px) sits between the dust bunny and the cucumber in size; its paw print and face still read at that size. The chest (boss size, 108 design px) is about 2.5 coins tall, like the other bosses. Nothing needed changing (scale, anchor and shadow are the shared enemy rules).
- Boss strip: the chest's portrait sits on the strip's left like the other bosses'. The warning banner reads "경고! 보물상자 등장!" / "WARNING Treasure Chest incoming!".
- Wave preview: the chip before the last wave shows the chest (red chip with the skull, x1) and the coins (x24); the first wave shows the coin chip. Tapping the coin chip opens the info card ("금화 ... 도감에서 보기").
- Spill: "금화가 쏟아져요!" / "Coins are spilling out!" with a coin burst and three new coins at the chest.
- Death: the shared boss finale (slow motion, blasts, shards, 32-coin shower, "보스 격파!" banner), then "승리!". It has no look of its own beyond the coin shower.
- Codex: both are in the monster list (the coin with the ordinary ones, the chest under the bosses) with "NEW" stickers when met; both pages show the picture, the name, the description, "Where it comes: Gold Dungeon (never in a chapter)", the stats and the spill ability.

## Part 3: what was looked at (headless Edge, 450 x 900 and 360 x 800, ko and en)

- Missions tab, daily chest card, locked / 50 points / ready / claimed, ko 450, ko 360, en 450 and en 360: nothing overlaps, the padlock clears the label, "받았어요" stamp sits where Claim was. The weekly chest card (ko 450, en 360) is built the same way and looks right. The three-chip reward was not re-checked on the joined tree (the card reads its reward when it is built; the missions engineer checked it).
- Battle tab: the dungeon card with 1 entry ("입장 1/1", tier 5 stepper, "최대 3,000 골드", "보물상자 +1,140"), after the entry is used ("입장 0/1", greyed "내일 또"), and with old-shape days: used 2 + bought 1 reads "입장 0/2" with the greyed button; used 0 + bought 1 reads "입장 2/2" with the Enter button (a bought but unused entry is honoured, as the dungeon engineer documented). The endless card says "무한 모드" / "Endless Mode".
- A whole dungeon run: pre-run page (chest sticker, three rule lines), the lane with coins, the stage-end toy pick and the "pick one of three cats" cards, wave 7 preview, the chest's wave, the spill, the win, and the result screen: wave 8/8, 131 kills, +3,000 gold at tier 5, "보물상자 +1,140 골드", "최고 기록!", "다시 도전" greyed. Played with the synergy bot without clearing (real kills): 139 s at 3x, 131 kills; ko 450 and en 360.
- Endless mode: pre-run ("무한 모드 · 챕터 5", rules line), a run to wave 26 and its result screen ("아쉬워요", wave 25, +975 gold); guide topic in both languages ("2챕터를 깨면 열려요. ... 24웨이브를 넘으면 적이 웨이브마다 7%씩 단단해져요." / "...past wave 24 enemies get 7% tougher every wave."); the gold dungeon guide topic ("하루 입장은 1번이에요" / "Entries per day: 1").
- Codex pages of the coin and the chest, ko 450 and en 360.

## Balance numbers on the joined tree (reported, not acted on)

- Gold dungeon, 100 runs per cell, recommended levels (`SIM_RUNS=100 npx vitest run --config vitest.sim.config.ts tests/simreport.dungeon.sim.ts`): merge and synergy bots win 100% at all five tiers, 0 caution, pay 1,200 / 1,560 / 1,920 / 2,400 / 3,000 (mean 1,198..2,997 for the synergy bot), run 2.34..2.49 min, chest uses 0.44..0.62 of its 60 s limit. Same as the dungeon engineer's 400-run numbers.
- Chapter 1, stake 0, level 1, 150 runs: random 0%, merge 64%, synergy 90%; nothing outside the four areas changed it (the skills area changed no code), and it matches the "before" column the skills engineer measured.
- Endless: see `batch5_endless.md` (median synergy-bot waves 43..51 -> 71..83 with the growth 1.14 -> 1.07); not re-run here.

## Left open (for the lead or the owner)

1. English "Treasure Chest" is cut to "Treasure C..." on the boss strip when the kill estimate is shown ("Est. 18s"): the name gets about 130 design px and needs about 153. The shared rule (`fitLabel` in `BossBar.layoutRow`, floor 24 px font) is the same for every boss; "King Cucumber" is as wide (167 px at size 26) and would be cut the same way. Options: a shorter English name ("Loot Chest" 114 px, "Gold Chest" 118 px; "Treasure Box" 147 px is still too wide), or more room on the strip. Left as is: it needs an owner's word on the name, and the Korean name fits.
2. English "All entries used today. See you tomorrow!" wraps to two lines on the dungeon card and ends about 8 design px above the card's lower edge (unchanged text and card height from before the batch; not clipped).
3. The codex page of the coin and the chest still shows the butler-level row (0..5). It does nothing for them (`levelOf` ignores the butler for dungeon-only enemies, and the caption says "집사 0단계 기준"), so a tab press changes only the caption. Harmless; hiding the row for them is a small change in `CodexScreen.ts` if wanted.
4. The endless line of the unlock popup was only read from the widget tree ("무한 모드", "새로 열렸어요!"); on a fresh test profile it sits in the aggregated popup under "and 11 more", so it was never seen as its own card. The strings are the ones in `meta.feature.endless` and `rt.sys.feat.endless`.
5. Tapping the chest's strip in the debug route did not open its info card in my one try (the coin chip's card opened). Not investigated: the click was a guessed coordinate.
6. Owner questions already raised by the areas are in their notes: the card height of the chest card (+88 px, option to cut to about 300), whether the chest counts for the boss missions, run length 2.4 min, a returned entry after a crash, the ladder 40 / 60 / 80 of endless, boss and elite limits in endless, and the ten questions of `docs/design_skills_v1.md` (section 7).
7. The chest has no death sound of its own (it reuses the blender's glass burst); an audio job.

## For the next engineers

- Running the game in headless Edge from a script: `ScrollView` offsets are in design px (the screen is 0.625 of that at 450 wide) while `getBounds()` and `textCentre` give css px; scroll with `host.scrollTo(y, false)` after dividing by `window.__dbg.game.scale`. Several tabs keep their scroll views in the tree at once, so pick the host that contains the node.
- A bot playing through `bot.choose(sim)` leaves the stage-end and cat-pick popups open (the view never hears about it): answer them by tapping the card, or run the bot with the events muted (as `skipToWave` does) and only start the view afterwards.
- `window.__dbg.routine.markSeen()` must run before the first popup appears; the attendance calendar and the account level-up card otherwise cover the tab.
