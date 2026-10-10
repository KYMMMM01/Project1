# Handoff: batch 4, area "meta" (A attendance popup, B + T7 codex "new" marks, T4 tutorial and missions)

Date 2026-10-10, base commit `a3b8536`. Owner's words and decisions: `docs/qa/directive_2026-10-10_batch4.md`. No new player-facing string (no ko / en change, so `npm run font` has nothing to add from this area).

## A. The attendance calendar opens by itself

**Rule** (`src/screens/system/popupPolicy.ts`, pure): new kind `{ kind: 'calendar' }` in `DuePopup`; new facts `calendarReady` (`profile.calendarView().canClaim`, false while the clock is frozen), `tutorialDone`, `today`, `calendarOfferedOn`; new pure `calendarDue(f)` = `tutorialDone && calendarReady && calendarOfferedOn !== today`. Order in `nextPopup`: **welcome back, attendance, gem pass, level up, unlocks** (one at a time, as before; `mayShowPopup` still blocks scene changes, open popups and full screens).

**Wiring** (`src/screens/system/autoPopups.ts`, `index.ts`): `AutoPopups` now takes `openCalendar: () => Promise<void>`. `index.ts` has one `openCalendar()` (the same function the home tab's button uses through `provide('openCalendar')`, one calendar at a time, resolves when it is closed), so the popup the game opens by itself is the real `CalendarPopup` with its own "오늘 받기" button; claiming is the popup's own path (`profile.claimCalendar`, `payout`). `tutorialDone` = `cardsVisible(profile.data.stats.runs)` (the single definition of "the tutorial is over" the home tab already uses: one run settled; a player who skipped the tutorial and has not finished a run gets nothing yet).

**Dismissed without claiming**: the offer is remembered by *date* in module memory (`calendarOfferedOn`), not saved: not again that day in this app session, again on the next launch. **Day rollover with the app open**: `profile.refresh()` runs every 60 s (HomeScene and `boot.ts`) and always emits `change`, which marks the popups dirty; a new date makes `calendarOfferedOn !== today`, so the new day's reward is offered again within a minute (seen on screen with `meta.advance({ days: 1 })`). A popup that is already open at midnight keeps working as before (`CalendarPopup` handles the page turn).

**The tab's button stays** (`ChapterCard.calendarButton`, badge from `BattleTab.syncCalendar`): untouched; tapping it still opens the same popup; the red dot goes after claiming (seen).

**QA**: `window.__dbg.routine.markSeen()` now also counts today's attendance as offered (`markCalendarOffered`, exported from `autoPopups.ts`), so a screenshot of a home screen with `runs >= 1` is not covered by the calendar. Without it, any home screen with a finished run and an unclaimed day opens the calendar by itself after about half a second (this is the new behaviour, not a bug); `?fresh=1` with no run played shows nothing.

## B + T7. Codex "new" marks

**How an entry became new and stopped being new before**: `GuideProgress.markMet` (a foe spawned, a toy offered or won, `src/view/hud/codexWatch.ts`) puts the key in `met`; it stopped being new only when `markLooked` ran: opening that foe's page (`CodexScreen.showPage`) or leaving the toy list. The +N (`freshCount`) on the home book button (`HomeTopBar.syncCodexBadge`) and the settings row (`settingsScreen`, "새로 만난 것 N개") counted met-and-not-looked, so a tester had to open foes one by one.

**New rule** (pure model `src/guide/codexMarks.ts`: `unseenKeys`, `badgeCount`, `hasSticker`, `openVisit`, `closeVisit`; used by `GuideProgress`):
- `GuideProgress.beginCodexVisit()` (called when a codex opens, after the progress is loaded): the count (`freshCount()`) is 0 at once; the entries new at that moment are remembered in memory (`visit`); `isFresh(key)` (the sticker) is true exactly for those during the visit.
- `GuideProgress.endCodexVisit()` (every close path of `openCodex`, including `closeCodex()`): everything the visit held is added to `looked` (persisted once) and `visit` is dropped.
- Entries met while the codex is open (or later) are not in the visit: they count again afterwards and get their sticker at the next visit.
- `CodexScreen`: the per-page `markLooked` and the "leave the toy list" marking are gone. A section tab's dot shows for a section that has new entries and was not yet shown in this visit (`viewed` set), so the dot on "장난감" goes once the player has been in it.
- **Stored format unchanged** (`meowguard.hints` v3: `met`, `looked`); old saves load as before (tests). `markLooked` stays as a primitive. An app killed inside the codex writes nothing for that visit, so the count comes back (accepted).
- Where the number is drawn: home book button (event-driven, updates at once), the settings row (rebuilt after the codex closes, `afterCodexClosed`), section-tab dots inside the codex. The battle's pause menu has **no** count (only the row "도감"), nothing to change there.
- `docs/handoff/codex.md` has a one-line pointer to this note where it described the old marking.

## T4. The tutorial run does not count for missions

**Root cause**: `ResultScreen` settles every run, the tutorial included, with `profile.finishRun(stats)` where `stats.mode === 'tutorial'`; `Profile.finishRun` (`src/meta/profile.ts`) ended with an unconditional `advanceMissionMetrics({ runs, wins, merges, bosses, relics })`. A won tutorial therefore ticked "승리 1번" (target 1), 3판, 합성, 보스·정예, 장난감 for the day and the week; missions unlock after 3 runs, so the player found the win already done. Same for the replay from settings and for a defeat or abandon of the tutorial.

**Fix** (right layer: what a settled run adds to missions): `runMissionDelta(stats)` in `src/meta/missions.ts` (pure; `bossAndEliteKills` moved there from `profile.ts`) returns `{}` for `mode === 'tutorial'` and the old delta for every other mode; `finishRun` calls `this.advanceMissionMetrics(runMissionDelta(stats))`. Covers the first run, the replay, a lost or abandoned tutorial and `settlePendingRun` of a tutorial.

**What a tutorial run still pays / counts** (left as it was): gold `runGold(waves, chapter 1, stake 0, victory x1.25)` (a won 8-wave tutorial: 190), account XP and pass XP `runXp(waves)` (26), the wooden chest of a win (`bundle { chests: { wooden: 1 } }`), the ad bookkeeping, `run_start` / `run_end` analytics, `stats.runs` (the unlock rules count it on purpose: one run opens 2x speed, cats, patrol, pass). Not paid: piggy bank (already excluded), first-clear rewards, consolation cards, the daily-challenge silver chest, the dungeon first-win bonus (all depend on the mode: chapter / daily / gold only).

**Other things that count and arguably should not** (not changed, say if you want them): the lifetime counters `stats.wins`, `merges`, `kills`, `bosses` also include the tutorial (nothing in the game reads them, so no visible effect); the tutorial's XP feeds the season pass.

## Tests

- New `tests/meta.tutorialMissions.test.ts` (8): `runMissionDelta` for tutorial and every mode; a won, a lost and an interrupted tutorial leave every daily and weekly mission at 0 (through `missionsView`); it still counts as a run, unlocks, pays gold / XP / pass XP / wooden chest, no piggy, no first clear; a replay after real runs does not move their progress; a real run after the tutorial counts in full.
- New `tests/codex.newMarks.test.ts` (13): the pure rules; the visit on `GuideProgress` (count 0 at open with stickers kept, closing marks everything seen without opening any entry, stickers survive `markLooked` inside the visit, entries met during the visit are new again afterwards, double open or close is a no-op, change events, the saved format and a v3 save of the old rule).
- `tests/screens.routine.popups.test.ts`: `facts()` got the four new fields (`calendarReady: false`, `tutorialDone: true`, `today`, `calendarOfferedOn: ''`), so every old expectation is unchanged; new block "the attendance popup" (8: opens when due, not without a reward, not before the tutorial is over, not again on the day it was dismissed but again on a new launch, again after midnight, order against comeback / gem pass / level-up / unlocks, claimed ends it).
- Whole suite at my last run: 3,415 / 3,418 pass; the three failures are not from this area (`tests/codex.foes.test.ts` and `tests/sim.data.test.ts` come from the stake-resistance work in progress, `tests/sim.perf.test.ts` is a timing test under load).

## Seen on a real screen (headless Edge, own dev server)

Fresh save with no run played: no popup. After one finished run: the calendar opens by itself over the home screen (day 1, 300 gold, "오늘 받기"); tapping the dim area dismisses it; the unlock popup follows (one at a time); nothing opens again while idle; `advance({ days: 1 })` with the app open opens the calendar again within a few seconds; claiming inside it stamps day 1 and the button reads "오늘은 받았어요"; the tab's calendar button still opens it and loses its red dot after the claim. Codex: six entries met, the book button shows 6; opening clears the count at once; the foe list shows "새로 만남" on the new rows, the "장난감" tab carries a dot, the toy list shows its stickers too; after closing the count is 0 and a reopened codex has no stickers; a foe met afterwards shows 1 again and is the only sticker at the next visit. Missions tab after a settled tutorial win: 0/3, 0/20, 0/4 (and after a real win 1/3, 6/20, 2/4). Not seen: a tutorial played to the end through its own result screen (the QA `win()` helper leaves the HUD on a stale toy-pick overlay; the settle was done with the same `finishRun` call and a tutorial-mode result instead), the codex opened from the battle's pause menu or enemy link (same `openCodex`, same visit calls), English screens.

## Open questions for the owner

1. Opening the codex from a link in battle (the enemy bubble's "도감에서 보기") also clears every new mark when it closes, although only one page was shown. Wanted, or should only a codex opened from the list clear them?
2. The battle's pause menu row "도감" has no count. Add one?
3. Order of automatic popups: attendance comes right after the welcome-back chest and before gem pass, level-up and unlocks. A brand-new player, after the tutorial, sees the calendar first and then the unlock popup.
4. A player who skipped the tutorial and quit before finishing any run gets no automatic attendance popup until a run is done (the home cards are hidden then too).
