# Handoff: guide (the explanations, the guidebook, the tutorial's lessons)

Date 2026-10-07. Paths: `src/guide/**`, the lesson machinery in `src/view/hud/**` (list below), the tutorial script of the simulation (`src/game/sim/tutorial.ts`), the guidebook row of the home settings screen (`src/screens/system/settingsScreen.ts`), tests `tests/guide.*.test.ts`, `tests/view.hud.script.test.ts`, `tests/view.hud.encounters.test.ts`, `tests/sim.tutorial.test.ts`. Design and the lesson script as built: GDD section 9.

## One source of truth: `src/guide`

| File | What it is |
|---|---|
| `topics.ts` | The list: `TOPIC_LIST` (58 topics), each with `id`, `section` (start, team, field, foes, home), `art` and an optional `try` target (a battle control, a home tab). `topicDef`, `topicsOf`, `isTopicId`. |
| `facts.ts` | `factsOf(id)`: the numbers a topic quotes, read from the data tables (`game/data/balance`, `classes`, `enemies`, `stakes`, `waves`, `meta/data/*`, `meta/odds`) at the moment the text is built, in the current language. |
| `stringsKo.ts`, `stringsEn.ts`, `strings.ts` | `guide.<id>.title|teach|full` for every topic plus the screens' own words. No digit is typed: every figure is a `{placeholder}` (a test fails otherwise). `teach` is one or two short sentences for a bubble (at most 40 Korean / 72 English characters); `full` is the guidebook page, a line break starts a paragraph. |
| `text.ts` | `topicTitle`, `topicTeach`, `topicFull` (facts filled in). |
| `Illustration.ts` | `illustration(art, size)`: a paper tile with the topic's cats, enemy, toy, chest, board cell (flat sun, puddle or bolt) or kit glyph, built from the game's own stickers. |
| `progress.ts` | `GuideProgress`: what was **taught** (a lesson covered it), **read** (its page was opened) and whether the tutorial was **skipped**, persisted under `meowguard.hints` (version 2, migrated from the old `{ seen }` hints; "erase progress" wipes it with the rest). `guideProgress` is the player's own; sandbox runs get a private in-memory one. `unread()` drives the "new" stickers. |
| `GuideScreen.ts` | `openGuide({ topic?, progress?, host?, onClose? })`, `closeGuide()`. A `ScreenScaffold` notebook: section tabs in the action bar (a dot on a tab with unread pages), a list per section, a page per topic with previous / next and, when it makes sense, "try it" (`host.tryControl(control, topic)` in a battle, `host.goTab(tab)` on the home screen). Opening a page marks it read. |

## Entrances

1. Home settings: a large coral button at the top of the sheet (`settingsScreen.ts`; its sub line is the unread count).
2. Battle pause menu: a "guidebook" row (`PauseMenu.ts`, action `guide`); closing the guidebook brings the menu back, "try it" resumes the battle and puts a bubble on the control.
3. The "more in the guidebook" button of every first-encounter card, and the end-of-tutorial card.

## The lesson machinery (`src/view/hud`)

| File | Role |
|---|---|
| `tutorialScript.ts` (pure) | `STEPS`: the 19 lessons in order, each with the controls it reveals, its trigger (`when`), what it points at (`target`), what counts as done (`done`, a counter that moved since it began), whether it holds the clock, whether it is read-only (`ok`) or a timed note, its patience and the wave after which it is stale. `TutorialScript.update(world, dt, held)` returns begin / done / drop events. Urgent lessons (the elite, the boss) cut in on a lesson in progress; `relax()` lets go of a hold; `stop()` is the skip; `abandon()` drops a lesson that cannot be shown. |
| `Tutorial.ts` | The view of it: counts the player's actions from events, builds the `World` snapshot every frame (allocation-free; the geometry is re-measured ten times a second), paints the spotlight (dim with a window, dashed edge, blockers only while the clock is held), the hand, the note, the skip button; applies the clock hold; the free-play nudge (and the prep nudge for a skipped tutorial). |
| `LessonBubble.ts` | The paper bubble: picture tile, optional title, words, up to two buttons; placed by `bubbleMath.placeBubble`. Used as the tutorial note (no title, "got it" for read-only lessons) and as the first-encounter card. |
| `LessonFx.ts` | Pooled flat paper celebrations: a starburst with an open window when a control arrives, a "nice!" sticker with confetti when a lesson is done. |
| `hints.ts` | The first-encounter scheduler (formerly the one-line hints): `request(topic, target)`, `used(topic)`, `hold(s)`, `explain(...)` (refusals, unchanged). A card holds the battle while it is read, never stacks, waits for banners and popups, is taught when dismissed or when the player does the thing. `only` restricts it during the tutorial run (only `awaken`). |
| `encounters.ts` (pure), `encounterWatch.ts` | Which topic a thing belongs to (traits of the next wave's preview, boss by id, the run's own rules) and which events ask for which card. |
| `policy.ts` | `Reveal` gained `chips`; `revealFlags(tutorial, revealed)` (a normal run shows everything, the tutorial starts with five basics plus what taught lessons revealed); `HintId = TopicId`. |
| `env.ts` | `reveal` is live now: `env.showControl(key, fresh)` flips a flag and emits `env.revealed`; `ClassRow`, `CurrencyRow`, `ActionRow`, `TopBar`, `SelectionSheet` pop their control in on that event. `env.lessonOn(topic)` / `env.lesson()` let a popup carry a lesson (the pick of three, the toy choice, the class sheet); `env.note(key)` counts the class sheet's closing. |

## Debug hooks (debug builds)

`window.__dbg.lessons = { topic(), left(), card(), laser(), rectOf(target), progress }`: the lesson being taught, the lessons still to come, the topic of the card on screen, the laser guide's step, where a target is, and the progress object (`markTaught(id)`, `markSkipped()`, `skipped`). `tools/battle_motion.js` already calls `markSkipped()` after `mcOpen` so its captures are not interrupted by lessons; a run that wants the lessons opens the game itself (`openGame`, `mcInit`, `mcWarp`).

## Verified

See the 2026-10-07 owner feedback section of `hud.md` for the list of runs and the screenshot names. Tests: `npx vitest run tests/guide tests/view.hud tests/sim.tutorial.test.ts`.

## Known gaps

- No "replay the tutorial" row in the guidebook (a lost or quit tutorial run can be retried from its result screen).
- The Hangul font subset (`public/fonts/game-kr.woff2`) was rebuilt with `npm run font`; run it again after any string change.
- "Try it" for the home tabs closes the guidebook and the settings sheet and goes to the tab; it does not highlight a control there.

## REQUESTS

- `src/app/flow.ts` `chooseFirstScene` / `dropInterruptedTutorial`: a player who skipped the tutorial and then closed the app gets a tutorial run again (it opens as an easy run with no lessons and everything revealed). Going home instead needs `!guideProgress.skipped` next to `profile.data.stats.runs === 0` in `chooseFirstScene`.
- `src/screens/system/resetProgress.ts` `PROGRESS_KEYS` also lacks `meowguard.laser` (the laser explanation's counters), so an erased profile still has its laser guide marked done.

## 2026-10-07 last gaps

**Play the tutorial again** (`screens/system/tutorialReplay.ts`, `GuideHost.replay`, `GuideProgress.resetTaught()`).
- Entrances: a neutral row "튜토리얼 다시 하기 / Play the tutorial again" at the top of the guidebook's first section (only when the host offers it: the home settings sheet does; the pause menu and the end-of-tutorial card do not) and a row under the guidebook button in the settings sheet. Both go through `askReplayTutorial()`: one confirmation dialog (title, one line, "다시 하기" / "취소"). A run in progress that is not an interrupted tutorial refuses with a toast first and clears nothing (`replayBlocked`, pure).
- On "yes": `guideProgress.resetTaught()` clears the taught lessons and the skipped flag (the tutorial run only teaches with `skipped` false) and keeps the "read" marks, so the "new" stickers come back only for what was never read. The laser's own record (`meowguard.laser`: how often its card opened, the guided first use) is reset so that its lesson starts from nothing. Both are flushed, then `shell.startRun({ mode: 'tutorial' })`, the home screen's own run launcher (pending-run record, iris transition, platform play signals). Nothing else is paid: it is the tutorial mode, so it pays what any tutorial run pays (gold, XP, the victory's wooden chest, a counted run) and nothing a first clear or the piggy bank would add (mode tutorial has neither).
- Verified in the browser: a profile with `merge` and `sun` taught, `sun` and `laser` read and the tutorial skipped. "취소" changes nothing. "다시 하기": taught merge false, read sun and laser still true, skipped false, the scene is a battle in mode tutorial with the first lesson ("생선으로 고양이를 불러요! 눌러 봐요. (0/3)") on screen (scratchpad `shots/rp`).
- Tests: `tests/guide.progress.test.ts` (resetTaught keeps read, clears taught and skipped, announces once), `tests/screens.system.replay.test.ts` (`replayBlocked`).

**"Try it" points on the home screen**: see `shell.md` item 3. `TryTarget` gained `point`, `TryTab` gained `'settings'` (the backup topic stays on the sheet it was opened from), `GuideHost.goTab(tab, point?)`. Every topic of the home section has a tab and a point (calendar and backup, which had none, now do; the field section's "stakes" points at the butler-level tags), enforced by `tests/guide.topics.test.ts`.

**Guidebook rows**: the title and the teaching line stood 30 px above the picture's centre; the two reserved text lines are centred on the picture now (title centre 48, teaching line top 76 in a 156 px row).

Known gaps from above, closed: the replay row, the home highlight, and the two REQUESTS of the first note (`chooseFirstScene` already tests `!guideProgress.skipped`; `resetProgress.ts` already lists `meowguard.laser`). Still open: the result screen of a replayed tutorial offers "next: chapter 1" at butler level 0 (`app/nextRun.ts` plans mode tutorial that way), also for a player who has cleared more.

## 2026-10-07 last gaps (battle side)

- The cards of `LessonBubble` (lesson notes and first-encounter cards) are placed by `bubbleMath.placeCard`: over the board for a bottom control, over the sheet for everything else (`hud.md`). `BubbleSpec` lost `avoid` and `prefer`; `HintBubble` (refusals, twins, the laser guide) still weighs above/below.
- The awakening card is requested at the front of the line (`Hints.request(..., first)`): it is about the cat that has just arrived and can be acted on now.
- The skip button's geometry is `layoutMath.skipRect` (top row only); `HudEnv.skip` / `setSkip` tell the top bar to cut the enemy strip.
- The laser guide's bubble waits while any lesson, popup, drag or selected cat is up.
- Tutorial playtest facts for the hand-off: 19 lessons in 118 game seconds, no stall; a page reload drops a tutorial run (so a play-through has to stay in one page); the "next" offer after the tutorial reads "다음: 챕터 1 거실".

## 2026-10-07 fixups

- The guidebook's "try it" pointer is the home pointer of `shell.md` ("fixups" item 2): the paw is 140 px, reaches in from below at a slant and keeps off the target's writing. The page fade of the guidebook (`fadeIn`) goes through the kit's `fadeTo`, so a page switch while the fade is running cannot leave the content part-way (`ui.md` fixups item 2).
- Text overflow: the unlock, reward, calendar, settings, odds and unit screens and the five home tabs were walked with the new `overflow()` probe in Korean and English at 720 x 1280 and 1600 (`ui.md` fixups item 3). The guidebook's own list and pages were not part of that walk (the "try it" pointer was checked through its points).

## 2026-10-07 fixups (battle side)

The guidebook's "try it" line and every refused command's reason are information bubbles of the battle (`Hints.explain` opens one through `info.show`, keyed by the control): a tap elsewhere closes them, as does the 2.6 s timer. The paw (`Hand.ts`, `handMath.ts`) is the cat's-paw sticker; `hud.md` "2026-10-07 fixups" says where it lies in each lesson.


## 2026-10-07 leftovers

The guidebook's own text was not changed. The English teaching lines of the 19 lessons (`guide.<id>.teach`) were read on screen in the real tutorial, at 1280 and 1600: each fits its note in two lines at 26 px, none needed a shorter English string. What changed around them (`hud.md`): the note of a lesson now waits for the "nice!" sticker of the one before (1.1 s), the paw avoids the control's own writing, the elite and boss strips say "Est. ?" instead of "Estimating" while the estimate is unknown (`hud.est.wait`), and the pick of three draws its lines and its "Best" flag at 24 px or more. The first-encounter cards (here the awakening card, which the tutorial run lets through) show "Got it" and "More in the guidebook" on one row without cutting either in English.
