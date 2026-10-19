# Tutorial bugs, 2026-10-18: the triage and what was done about each

## The owner's words (verbatim, 2026-10-18)

"그리고 튜토리얼쪽 버그가 꽤 많이 나는거 같아 난잡하다 해야 할까 한번 확인해봐"

(The tutorial seems to have quite a few bugs, messy; take a look.) Earlier tester feedback on the tutorial (2026-10-10, `docs/qa/directive_2026-10-10_batch4.md`): the guide text flickered, the pointing paw moved back and forth, the boss explanation box flickered, a daily mission "win once" was cleared by the tutorial, the game kept running during a guide text, the tutorial should show giving purr and awakening. New since then: the cats' skills are on for everyone (`docs/handoff/skills3_tell.md`), so skill cats, their banners and one new lesson (`sp_skill`) appear inside the tutorial.

## Summary (한국어)

튜토리얼을 새 플레이어·거친 플레이어·코드 읽기 세 방향으로 훑어 28건을 찾았고(아래 원문), 그중 22건을 고쳤다(19건은 전부, 3건은 일부: 14·16·18). 못 고친 6건은 폴리시 하나(19), 튜토리얼 문제가 아닌 것(23), 사용자 결정이 필요한 것(24·26), 설계대로인 것(25·28)이다. 가장 큰 것은 **3택에서 추천 카드가 아닌 카드를 고르면 튜토리얼이 21단계 중 9단계만 가르치고 조용히 멈추던 것**(계획이 "다음 한 단계"만 보고 기다렸다)이다. 이제 순서가 아직 오지 않은 단계는 뒤 단계를 막지 않고, 정예가 끼어들어도 하던 단계는 버려지지 않고 다시 온다. 그 밖에 첫 판 정예에서 지는 경우(시키는 대로 하는 플레이어 300판 중 13판 → 500판 중 1판), 25초 방치·일시정지·언어 전환이 단계를 망가뜨리던 것, 조작이 막힌 곳을 눌러도 아무 반응이 없던 것, 레이저 안내가 단계가 끝난 뒤에도 남던 것 등을 고쳤다. 시뮬레이션 숫자는 **튜토리얼의 정예 제한 시간 +10초** 하나만 건드렸다(튜토리얼 전용). 못 고친 것과 이유는 아래 각 항목 줄에 있다.

How to read this file: each bug of the triage below carries one line, **Status: fixed / not fixed**, with where it was fixed and how it was checked ("unit test" = a test that fails with the old code and passes now, `tests/...`; "real screen" = looked at in headless Edge on the dev server, scripts in the scratch folder `…\scratchpad\tutorial\fix\s`). The triage itself is as the triage agent handed it over.

## Status at a glance

| # | Bug | Status |
|---|---|---|
| 1 | A card other than the flagged one stalls the tutorial | fixed |
| 2 | First-encounter cards blocked for the whole tutorial | fixed |
| 3 | An obedient player loses at the wave-4 elite | fixed (one sim number, tutorial only: +10 s on the elite) |
| 4 | The elite's cut-in drops the lesson and skips the ones behind it | fixed |
| 5 | The laser guide outlives its lesson | fixed (the paw lying under the guide's own bubble is not) |
| 6 | After 25 s idle the game runs under a visible note; a relaxed lesson closes cat selection | fixed |
| 7 | The pause menu counts as lesson time | fixed |
| 8 | Taps outside the lit window give no sign | fixed (the note shakes) |
| 9 | A language switch rebuilds the HUD and disturbs the lesson | fixed |
| 10 | Selling a twin in the merge lesson ends it silently | fixed |
| 11 | An unrevealed laser fires on a road tap | fixed |
| 12 | A resize leaves the nudge paw and bubble at the old spot | fixed |
| 13 | The nudge paw stays after the run is won or lost | fixed |
| 14 | Every summon tap in lesson 1 hides dim, note and paw for 0.75 s | fixed in part (the beat after the third tap is kept; the beat itself stays, by design) |
| 15 | The paw covers the "+0.5/s" pill | fixed |
| 16 | Wave-6 pile-up | fixed in part (the gift's twelve result chips; the rest is the game's own staging) |
| 17 | The synergy window cuts through the fish counter | fixed |
| 18 | Frozen effects hang over notes; the purr chip reads 0 under the purr note | fixed for the purr counter; the frozen effects stay, by design |
| 19 | Two-step lessons: the note sits stale for 0.3 s, then jumps | not fixed (polish) |
| 20 | The Guardian's sheet stays open through the boss lesson | fixed (the sticker under the cut-in banner is not) |
| 21 | EN 360x800 text cut off (elite strip name, chest label) | fixed (the KO tile behind the bottom bar is the result list's scroll edge, not a bug) |
| 22 | Wording: ring / 동그라미, "card with tape", "Every 6 summons" | fixed (the tutorial's own texts; the rest of the copy review is the owner's separate item) |
| 23 | Result screen "Summon luck … bottom 24%" under a Victory | not fixed (not a tutorial bug) |
| 24 | Quitting at 0:04 counts as a run and pays | not fixed (owner decision) |
| 25 | A reload restarts the tutorial at wave 0 | not fixed (by design) |
| 26 | System Back leaves the game | not fixed (owner decision: platform) |
| 27 | The fish pill can read negative | fixed |
| 28 | Replaying the tutorial pays gold, XP and a chest every time | not fixed (documented as intended) |

## Triage report (as handed over)

### Method

- **Served tree:** a `git archive` of HEAD f00bcdd (the tutorial files are identical to the working tree).
- **Real-screen runs:** headless Edge ran at about 5 fps, so times below are game seconds. Scripts in the triage scratch folder (`obey.mjs` plays an obedient new player; others are `hold`, `hold2`, `twostep`, `laser`, `quit`, `mergeout`, `misc`, `endflow`).
- **Sandbox route:** `?scene=battle&mode=tutorial&sandbox=1&seed=N&runs=0` fixes the seed and so the 3-pick options. It uses the same HUD and tutorial code as the real path; only progress is kept in memory.
- **Statistics:** vitest models (`zz_*.test.ts` in the triage copy) drive the real `TutorialScript` and the real sim with a scripted player. On seed 1 the model matches the real run to 0.15 s (elite spawn 40.02 vs 40.17, kill 68.23 vs 68.37).

### Ranked bugs

#### 1. BLOCKER: any 3-pick card but the flagged one can silently stop the tutorial

**Status: fixed.** `tutorialScript.ts` keeps a list of lessons still to come instead of "the next one"; a lesson whose moment has not come lets the ones behind it begin (`StepDef.defer`; the opening seven keep their strict order), lessons whose moment passed are dropped wherever they stand, the toys lesson goes stale at wave 6. Unit tests (`tests/view.hud.script.test.ts`, "a lesson whose moment has not come does not hold up the lessons behind it": the whole plan with no synergy and no sun, the elite and the toys with `maxTier` 0, order kept when everything is ready). Real screen: seed 1, Storm Mage picked, no extra summons: all 21 lessons were shown (9 of 21 before; the laser lesson was cut in on by the elite while its guide waited for the press and was dropped when its wave passed), and the obedient run with the suggested card showed all 21 and was won (`fix1b.log`, `fix2.log`). One consequence: with defer the order of lessons that are ready at different moments can differ from the plan (the speed lesson now comes before the call-wave lesson at wave 5, the synergy note after the King at wave 6, when no synergy was there before).

**What the player sees.**
- After the skill lesson (`sp_skill`) at wave 3, the tutorial goes quiet. Twelve of 21 lessons never come: synergy-sun-laser-elite-toys-molt-grade-upgrade-call-speed-sell-awaken-boss (sun, laser and elite are dropped silently; synergy and purr do play at wave 6).
- The wave-4 elite has only the warning banner. The toy pick has no lesson. At wave 6 the player gets a King and 13 purr with no awaken hint.
- The boss HUD has no laser, speed, grade or call buttons. 650 fish and 13 purr sit unspent and the nudge paw keeps tapping Summon.

**Repro (deterministic, real screen).** `SEED=1 PICK=wrong EXTRA=none node obey.mjs a2 360 800 en 3 420`; by hand: open `?scene=battle&mode=tutorial&sandbox=1&debug=1&lang=en&seed=1&runs=0`, do every lesson, and at the wave-3 pick (Ninja flagged / Storm Mage / Bard) take Storm Mage. Result: 9/21 taught, won with 716 fish left.

**Frequency.** The pick offers 3 of the 4 classes at epic rank. The board after the merge lesson is a warrior rare plus a ranger rare, so only warrior and ranger cards give synergy tier 1. The flagged card gave tier 1 in 600 of 600 seeds. A random card gives it 50% of the time (903 of 1800 options). Three nudge summons rescue only 23% of the failures. N=300 with the real script: takes the flagged card and answers nudges: 95% all 21 taught; takes mage/trickster: 23% (77% stalled); picks at random: 62% (32% stalled).

**Root cause.** `TutorialScript.update()` with no active lesson looked only at `steps[next]`, and `if (!s.when(w)) return out;` made everything behind it wait. `synergy` needs `maxTier>=1` (staleAt 7); `toys` is a popup lesson with no staleAt, so once the single wave-4 toy offer passed it blocked molt..boss for good. `urgentAhead()` was only called while a lesson was active, so the elite and boss lessons could not cut in. `docs/handoff/guide.md` assumed the scripted pick completes two kinds "for either class"; the offer can contain a third class.

#### 2. MAJOR: first-encounter cards are blocked for the whole tutorial

**Status: fixed.** `Hints.giveUp(topic)` (called by `Tutorial.handle` when a lesson is dropped for good) adds the topic to `hints.only`; `EnvImpl.lessonOn(topic)` is true only while the script still has the lesson (`TutorialScript.has`). Unit tests: `tests/view.hud.hints.test.ts` (hands a topic back), `tests/view.hud.env.test.ts`, `tests/view.hud.tutorial.test.ts` (giving up calls it). A card that was asked for before its lesson was given up (the elite's card is asked for once, at the spawn) is not asked for again.

When a lesson is dropped or never begins, nothing explained that topic. Root cause: `hud/index.ts` set `hints.only = {awaken}` and `Hints.request()` ignored every other topic; `encounterWatch.ts` asked for the awaken card only if `!env.lessonOn('awaken')`, which stayed true even when the lesson never came.

#### 3. MAJOR: an obedient player loses at the wave-4 elite and loses the tutorial

**Status: fixed, with one simulation number changed (tutorial only): the tutorial's elite has `TUTORIAL_ELITE_EXTRA_TIME = 10` seconds more (`src/game/sim/tutorial.ts`, `flow.ts waveLimit`).** `NUDGE_CATS` is 8 (`tutorialFlow.ts`), and the elite's note adds "Spend your fish on more cats!" (`hud.tut.elite`, `Tutorial.textOf`; the guidebook page and the card of a normal run keep their text). Unit test: `tests/sim.tutorialElite.test.ts` (the model of the obedient player on the real sim: the 8 seeds the old numbers lost are won, 1 of 150 seeds lost at most; 13 of 300 were lost before, 1 of 500 now: seed 142). Guide fact: the guidebook still says the elite's time is 40 seconds (a normal run); the tutorial's elite shows 50 on its strip.

**What the player sees.** Defeat: "You had 230 fish left. Spend them on cats!". The elite strip shows "40s / Est. 98s" but the lesson never says to summon. The nudge fires three times, then never again once there are 6 cats, even with 160 to 300 fish unspent. After a loss, `stats.runs` is 1, so the tutorial is never offered again from home (only the Settings replay) and purr..boss are never taught. "Try again" starts an empty board with the already-taught lessons skipped.

**Repro.** `SEED=23 PICK=rec EXTRA=nudge node obey.mjs d1 360 800 en 3 420` loses at t=80.08 with 6 cats and 230 fish. **Frequency.** 500 seeds, flagged pick: 3.4% lost with one summon per nudge; 11% if nudges are ignored; 5.4% with a mage/trickster pick; 0% if the player keeps summoning.

#### 4. MAJOR/MEDIUM: the elite's urgent cut-in drops the active lesson and skips the untouched ones before it

**Status: fixed.** A lesson an urgent one cut in on is put back (`ScriptEvent` drop with `again: true`) and begins again after it unless its moment has passed; the lessons it did not reach stay to come. Unit tests: `tests/view.hud.script.test.ts` ("an urgent lesson that cuts in puts the lesson in progress back").

Lessons such as sun and laser vanished with no event, and the laser button might never be revealed. In run `a1`, `left` went 14 to 11 at the elite (synergy, sun and laser gone; laser never taught).

#### 5. MEDIUM: the laser guide outlives its lesson

**Status: fixed.** `TutorialHost.endLaserGuide(again)` → `LaserGuide.stand(again)` (`LaserGuideFlow.stand`): a dropped lesson ends the guide for the run, a cut-in lesson puts it back to waiting until the lesson begins again; a guide that already shows the marks finishes itself. The paw under the guide's own bubble at its `press` step (side issue) is not fixed: the button sits in the bottom right corner, every arm that leaves room for goes up, under the words. Unit tests: `tests/view.hud.laser.test.ts` (flow), `tests/view.hud.tutorial.test.ts` (the lesson given up ends the guide). Real screen (`laser2.mjs`): the lesson left alone is relaxed after 25 s and dropped 20 s later, and the guide's step goes to `done` with its bubble gone (it stayed in `press` before).

The lesson was dropped but `LaserGuide` stayed in `press`, so the "You got the laser pointer! Tap it…" bubble and spotlight stayed up through the elite fight with nothing holding the clock.

#### 6. MEDIUM: after 25 s idle, the game runs under a visible note; a relaxed lesson closes cat selection

**Status: fixed.** A lesson the player has let go of (`script.relaxed`) gives the screen back: no note, no dim, no paw, the clock runs, the nudge points at Summon; it is dropped after the short wait. A selected cat is no longer deselected by it. The 25 seconds start over with every step the player takes (three summons are not one wait). Unit tests: `tests/view.hud.tutorial.test.ts` ("a lesson the player leaves unanswered"). Real screen: `hold.mjs A/B` (summon and merge lessons left alone for 40 s: after the 25th second nothing is on screen and the run goes on), `misc.mjs relaxsel` (the selection stays).

#### 7. MEDIUM: the pause menu counts as lesson time

**Status: fixed.** `EnvImpl.userPause` (the HUD's `pauseOpen`) counts as a popup for the script (`World.busy`: the note gives way, no lesson begins), does not count as time the lesson has waited, and a timed note is not run out under the menu. Unit tests: `tests/view.hud.tutorial.test.ts` ("the player's own pause", "…over a timed note"). Real screen: `hold.mjs C`, `hold2.mjs C/F`.

#### 8. MEDIUM: taps outside the lit window do nothing and give no sign

**Status: fixed.** A touch on the dim shakes the note (`LessonBubble.shake`). Unit test: `tests/view.hud.tutorial.test.ts` ("a tap on the dim round the lit window"). Real screen (`shake.mjs`): the note's x swings 354 to 363 around 360 after a tap on the pause button's place.

#### 9. MEDIUM: a language switch rebuilds the HUD and disturbs the lesson

**Status: fixed.** The HUD keeps the lesson plan with its progress, the player's counts and the controls the lessons brought in across a language switch (`TutorialKeep`, `Hud.rebuild(keepLessons)`; the load of saved progress, which comes before anything has happened, still starts afresh); `setGuideCell` runs again on every build; the set of topics handed back to the cards is kept. Unit tests: `tests/view.hud.tutorial.test.ts` ("a HUD that is built again…"). Real screen: `hold.mjs E`.

#### 10. MEDIUM: selling a twin in the merge lesson ends it silently

**Status: fixed.** While a lesson holds the clock the field does not sell by drag, except in the selling lesson itself (`BattleContext.locks.sell`, set by the HUD through `sellLocked`): the cat shakes its head and springs home. Unit tests: `tests/view.field.gestureLocks.test.ts`, `tests/view.hud.flow.test.ts`. Real screen: `mergeout.mjs sell` (cats stay 3, the lesson stays up).

#### 11. MEDIUM: an unrevealed laser fires on a road tap

**Status: fixed.** `BattleContext.locks.laser` is on while the laser control has not been revealed; a tap on the road is a tap on the floor then. Unit test: `tests/view.field.gestureLocks.test.ts`. Real screen (`road.mjs`): the tap on the road before the lesson leaves the laser inactive and ready (`laserActive` false, cooldown 0). Minor and polish

12. **Fixed.** `Tutorial.resize()` lays the nudge's paw and words again beside the summon button (real screen: summon y 1421 to 1261, paw 1465 to 1303). Unit test.
13. **Fixed.** The won/lost branch of `Tutorial.update` calls `endNudge()` (real screen `misc.mjs nudgewin`). Unit test.
14. **Fixed in part.** The third summon's beat is no longer wiped by `endVisuals()` (`endVisuals(keepBreath)`): the clock runs on for the new kitten before the merge lesson holds it. The 0.75 s beat after each tap itself (dim, note and paw give way so the kitten pops in under a clear screen) stays: it is how the lesson was built, and keeping the dim over the pop-in hides the kitten. Unit test.
15. **Fixed.** The income tag ("+0.5/s") is in the keep-off list of the paw and of the bubbles, weighed like a button (`Hud.avoidList`, `CurrencyRow.income`); real screen, first screen in Korean and English: the paw stands beside it.
16. **Fixed in part.** The tutorial's box of kittens (a dozen cats at once) no longer shows a result chip for each (`ActionRow`; real screen at wave 6: only the King's chip); the King that comes with it still does. The two banners, the sticker and the arrival burst of the speed button are the game's own staging and still land together.
17. **Fixed.** The chips' window stops where the counters under them begin (`layoutMath.trimBelow`, `currencyTop`). Unit test: `tests/view.hud.spot.test.ts`; real screen: the synergy note's window ends at the chip row, the fish and purr counters are under the dim.
18. **Fixed for the purr counter.** The purr lesson waits until the purr has landed in the counter (`World.purrFlying`), so the note no longer explains a counter that reads 0. Effects frozen while a lesson holds the clock (pickups, damage numbers, skill scenes) stay: the clock is held, they are the clock's. Unit test: `tests/view.hud.script.test.ts`.
19. **Not fixed (polish).** After the tap on a cat in a two-step lesson the old note stands about 0.3 s while the sheet opens, then jumps; hiding it for that time would be a blink.
20. **Fixed.** The sheet of the cat a molt, sell or awaken lesson used closes when the lesson is done (`Tutorial.handle`), so the boss note and the victory dialog are not under a sheet with Sell in reach (real screen, `awk2.mjs`: the selected cell is null after the awakening). The "Great!" sticker under the cut-in banner is not changed.
21. **Fixed.** The elite strip shows no "Est. ?" while there is no estimate, and once there is one it says "56s" instead of "Est. 56s" before it would cut the name ("King Cucumber" whole at 360x800, both states, real screen); a result tile name that is too long for one line goes on two (`ResultScreen`: "Wooden chest", real screen). The KO chest tile partly behind the bottom bar at 450x900 is the result list's scroll edge (it scrolls), not a layout fault.
22. **Fixed.** `guide.sp_skill.teach` and `.full` say "스킬 게이지" / "skill gauge" (and "{rank}부터" for "{rank}이(가)"); the pick sheet's line is `guide.tut.pick` ("Pick one of three. It comes again every {every} summons.") plus `guide.tut.pickRec` ("Take the one marked "Best"."). The rest of the copy review stays with the owner's separate item. Unit tests: `tests/guide.text.test.ts`.
23. **Not fixed.** Not a tutorial bug: the "summon luck" line of the result screen is the same for any run.
24. **Not fixed: owner decision.** Quitting is the player's own choice and counts as a run (40 gold, 10 XP); a tutorial the app was killed in is the case `dropInterruptedTutorial` already handles. If a quit at the very start should not count, the place is the result recorder.
25. **Not fixed: by design** (`dropInterruptedTutorial`).
26. **Not fixed: owner decision.** The battle holds no Back gesture (`src/ui/backGesture.ts` is held by popups and screens); a swipe-back leaves the page and the tutorial begins again. Holding Back in the battle for the pause menu is a platform change.
27. **Fixed.** A counter never reads below nought (`incomeMath.shownAmount`): the −14 was fish spent while pickups that were already counted were still in the air. Unit test: `tests/view.hud.molt.test.ts`.
28. **Not fixed: documented as intended** (`guide.md`).

### Could not reproduce

- First lesson missing at cold start (eight fresh loads with CPU slowed 1x to 12x). Most likely a dev-server re-optimisation reload, not a player path.
- Negative fish pill: seen once on a real screenshot; the cause is item 27.

### Checked and fine

- Per-lesson note and paw are laid once (no T1/T2 regression).
- Clocks are held for every lesson except the cases in bugs 6 and 7.
- Missions: `meta/missions.ts runMissionDelta` returns `{}` for tutorial mode, so a win or quit counts toward no daily or weekly mission.
- Home popups do not open over the tutorial (`popupPolicy.ts`, `autoPopups.ts`).
- No console errors in any run; the game stayed silent under `--mute-audio`.
